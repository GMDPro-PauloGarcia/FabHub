import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL  = process.env.REACT_APP_SUPABASE_URL
const SUPABASE_ANON = process.env.REACT_APP_SUPABASE_ANON_KEY

// FabHub auth: the login flow mints a short-lived JWT (via the mint-session Edge
// Function) that carries the user's role; RLS policies (migration 024) read it.
// We feed that token to supabase-js via the `accessToken` option so every REST
// and realtime call is made as the logged-in user. When logged out we fall back
// to the anon key, which RLS denies — so no data is reachable without a login.
let _appToken = null
export const setAppToken = (t) => { _appToken = t || null }
export const getAppToken = () => _appToken

export const supabase = (SUPABASE_URL && SUPABASE_ANON)
  ? createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: { persistSession: false, autoRefreshToken: false },
      accessToken: async () => _appToken || SUPABASE_ANON,
    })
  : null

export const isSupabaseReady = () => !!supabase

// Verify credentials server-side and obtain the role-bearing token.
// Returns { user } on success or { error } on bad credentials; throws on network
// failure (so callers can fall back to offline/local login).
export const appLogin = async (username, password) => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/mint-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` },
    body: JSON.stringify({ username, password }),
  })
  let data = {}
  try { data = await res.json() } catch (e) { /* non-JSON */ }
  if (!res.ok) return { error: data.error || `Login failed (${res.status})` }
  _appToken = data.access_token
  try {
    localStorage.setItem('gmd:token', data.access_token)
    localStorage.setItem('gmd:token_exp', String(Date.now() + (data.expires_in || 43200) * 1000))
  } catch (e) { /* storage disabled */ }
  return { user: data.user }
}

// Restore a still-valid token on boot; returns true if a usable token was loaded.
export const restoreAppToken = () => {
  try {
    const t = localStorage.getItem('gmd:token')
    const exp = Number(localStorage.getItem('gmd:token_exp') || 0)
    if (t && exp > Date.now()) { _appToken = t; return true }
  } catch (e) { /* storage disabled */ }
  _appToken = null
  return false
}

export const appLogout = () => {
  _appToken = null
  try { localStorage.removeItem('gmd:token'); localStorage.removeItem('gmd:token_exp') } catch (e) { /* noop */ }
}

// App-wide write-failure hook: register a callback to be told when ANY write
// (insert/update/upsert/delete) fails, so the UI can warn the user that changes
// aren't reaching the server (instead of failing silently in 160+ call sites).
let _onWriteError = null
export const setSbErrorHandler = (fn) => { _onWriteError = fn }
// Fired only when a queued write is given up on for good (non-retryable, or
// 8 retries exhausted) — distinct from _onWriteError, which fires on every
// transient failure and is throttled. A permanent drop must never be
// throttled or silent: it's the one path left where a change the user
// believes saved will NEVER reach the server on its own.
let _onWriteDropped = null
export const setSbDropHandler = (fn) => { _onWriteDropped = fn }
// Classify a write failure so the UI can show an accurate message instead of
// always blaming "you may be offline" — a stale/expired session, a permission
// error, or a schema mismatch (all common right after a domain/project
// migration) are not offline issues and won't fix themselves on reconnect.
const _classifyError = (msg) => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline'
  const m = (msg || '').toLowerCase()
  if (m.includes('failed to fetch') || m.includes('load failed') || m.includes('network')) return 'network'
  if (m.includes('permission denied') || m.includes('row-level security') || m.includes('jwt') || m.includes('not authorized')) return 'auth'
  // PostgREST PGRST204 ("Could not find the 'x' column of 'y' in the schema
  // cache") is a schema mismatch — replaying the identical payload can never
  // succeed, so it must be non-retryable ('data'), not the retryable 'server'
  // it used to fall through to. Left as 'server' it re-fired "Still can't sync"
  // every heartbeat for 8 cycles before dropping the whole write. Seen live:
  // an older cached client queued a PO carrying the pre-rename 'po_disc_type'
  // column, which this schema no longer has.
  if (m.includes('does not exist') || m.includes('violates') || m.includes('invalid input syntax') || m.includes('duplicate key') || m.includes('schema cache') || m.includes('could not find')) return 'data'
  return 'server'
}
// Non-retryable failures will never succeed by replaying the same op — retrying
// them just wedges the queue (blocking every write queued behind them) and
// re-fires the "offline" toast forever even though the connection is fine.
const _isRetryable = (kind) => kind !== 'auth' && kind !== 'data'
const _writeFailed = (op, table, msg) => {
  const kind = _classifyError(msg)
  try { _onWriteError && _onWriteError(op, table, msg, kind) } catch (_) {}
  return kind
}
// A non-retryable failure on a LIVE (first-attempt) write is never enqueued, so
// it never reaches the queue's drop path — it used to fire only the throttled,
// generic _onWriteError toast and then vanish. That left the true cause silent:
// e.g. a new deal whose insert is rejected for bad data never lands, and the
// user only ever sees the downstream mystery ("No row matched id=… — it may not
// exist on the server yet") when a later edit to that ghost row is dropped.
// Surface it through the same drop hook a queue give-up uses, so the ACTUAL
// failing write and its reason are shown, not just its orphaned side effects.
const _notifyDropped = (op, kind, msg) => { try { _onWriteDropped && _onWriteDropped(op, kind, msg) } catch (_) {} }

// ── OFFLINE WRITE QUEUE ──────────────────────────────────────────────────────
// When a write fails (offline, transient network, RLS hiccup) the operation is
// persisted to localStorage and replayed automatically on reconnect / focus /
// interval, so changes that didn't reach the server are recovered instead of
// just warned about. A badge in the UI shows how many writes are still pending.
const QKEY = 'fabhub_sync_queue'
let _queue = []
try { _queue = JSON.parse(localStorage.getItem(QKEY) || '[]') } catch (_) { _queue = [] }
let _queueListeners = []
let _seq = 0
const _saveQueue = () => {
  try { localStorage.setItem(QKEY, JSON.stringify(_queue)) } catch (_) {}
  _queueListeners.forEach(fn => { try { fn(_queue.length) } catch (_) {} })
}
export const sbQueueSize = () => _queue.length
export const sbOnQueueChange = (fn) => { _queueListeners.push(fn); return () => { _queueListeners = _queueListeners.filter(f => f !== fn) } }
const _enqueue = (op) => { _queue.push({ qid: `${Date.now()}_${_seq++}`, attempts: 0, ...op }); _saveQueue() }

// A hung request (no error, no success — seen on some flaky/restrictive
// networks) must not block forever: without a timeout it holds the single
// in-flight flush lock open indefinitely, so every later retry — automatic
// AND manual — silently no-ops with no explanation ("Unknown error"). Racing
// against a timeout guarantees _replay always resolves so the lock releases.
const _REPLAY_TIMEOUT_MS = 12000
const _withTimeout = (promise) => Promise.race([
  promise,
  new Promise(resolve => setTimeout(() => resolve({ error: { message: 'Request timed out — the server did not respond in time.' } }), _REPLAY_TIMEOUT_MS)),
])
const _sleep = (ms) => new Promise(r => setTimeout(r, ms))

// Tables whose most recent read failed after all retries. sbLoadAll snapshots
// this so the caller can tell "the server genuinely returned no rows" apart from
// "we never got a usable answer" — the latter must NOT be treated as an empty
// table (which would look like the data was deleted) and should be surfaced.
const _readFailures = new Set()
export const consumeReadFailures = () => { const s = [..._readFailures]; _readFailures.clear(); return s }
// PostgREST PGRST204 names the offending column: "Could not find the 'x'
// column of 'y' in the schema cache". Capture it so a payload written by an
// older client can be self-healed by dropping just that field.
const _MISSING_COL_RE = /could not find the '([^']+)' column/i
// Run the op's actual write once and return its { error }.
const _runOp = async (op) => {
  if (op.kind === 'insert' || op.kind === 'upsert') {
    // Replay inserts as upserts when an id is present so a lost-response retry
    // can't create a duplicate; fall back to insert only when there's no id.
    if (op.data && op.data.id != null) return await _withTimeout(supabase.from(op.table).upsert(op.data, { onConflict: op.conflictCol || 'id' }))
    return await _withTimeout(supabase.from(op.table).insert(op.data))
  } else if (op.kind === 'update') {
    // .select('id') so a 0-row match (e.g. the target still doesn't exist on
    // the server — a parent write is itself still queued) isn't reported as
    // success. Without this the op gets shifted out of the queue as "done"
    // while nothing actually happened, and no one is ever told.
    const res = await _withTimeout(supabase.from(op.table).update({ ...op.data, updated_at: new Date().toISOString() }).eq('id', op.id).select('id'))
    if (!res.error && (!res.data || res.data.length === 0)) return { error: { message: `No row matched id=${op.id} — it may not exist on the server yet.` } }
    return res
  } else if (op.kind === 'delete') {
    return await _withTimeout(supabase.from(op.table).delete().eq('id', op.id))
  } else if (op.kind === 'deleteWhere') {
    let q = supabase.from(op.table).delete()
    if (op.op === 'in') q = q.in(op.column, op.value)
    else q = q.eq(op.column, op.value)
    return await _withTimeout(q)
  }
  return { error: null }
}
const _replay = async (op) => {
  try {
    const stripped = []
    // Bounded loop: a stuck payload from an older client can reference more
    // than one column this schema no longer has. Each PGRST204 tells us exactly
    // which one — drop it and retry so the rest of the row still lands instead
    // of the whole write being dropped and the change lost. The cap guards
    // against ever looping on an error we can't act on.
    for (let guard = 0; guard < 16; guard++) {
      const { error } = await _runOp(op)
      if (!error) {
        if (stripped.length) console.warn(`sync replay ${op.kind} ${op.table}: succeeded after dropping unknown column(s) not in the server schema: ${stripped.join(', ')}`)
        return { ok: true }
      }
      const miss = _MISSING_COL_RE.exec(error.message || '')
      const col = miss && miss[1]
      if (col && op.data && Object.prototype.hasOwnProperty.call(op.data, col)) {
        // The DB has no such column, so this field's value has nowhere to go —
        // strip it and persist the cleaned payload so the queue stops replaying
        // the obsolete shape even across reloads.
        delete op.data[col]
        stripped.push(col)
        _saveQueue()
        continue
      }
      console.warn(`sync replay ${op.kind} ${op.table}:`, error.message)
      return { ok: false, kind: _classifyError(error.message), message: error.message }
    }
    return { ok: false, kind: 'data', message: 'Write dropped: too many unknown columns for the current schema.' }
  } catch (e) { console.warn(`sync replay threw ${op.kind} ${op.table}:`, e.message); return { ok: false, kind: _classifyError(e.message), message: e.message } }
}

let _flushing = false
// force=true (user tapped "retry now", or the periodic heartbeat) skips the
// navigator.onLine check — that flag is unreliable on some networks/browsers
// (VPNs, captive portals, mobile Safari) and can report false while the
// connection is actually fine, which silently blocked every retry forever
// even though nothing was actually wrong.
// Returns { synced, remaining, lastError } so a caller (e.g. the retry badge)
// can tell the user WHY it's still stuck instead of a generic "can't reach
// the server" — the classified kind plus the raw message from Supabase.
export const sbFlushQueue = async (force = false) => {
  if (!supabase) return { synced: 0, remaining: _queue.length, lastError: { kind: 'no-client', message: 'Supabase is not configured on this device.' } }
  if (_flushing) return { synced: 0, remaining: _queue.length, lastError: { kind: 'busy', message: 'A sync attempt is already in progress.' } }
  if (!_queue.length) return { synced: 0, remaining: 0, lastError: null }
  if (!force && typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { synced: 0, remaining: _queue.length, lastError: { kind: 'offline', message: 'This device is offline.' } }
  }
  _flushing = true
  let synced = 0, lastError = null
  try {
    while (_queue.length) {
      const op = _queue[0]
      const { ok, kind, message } = await _replay(op)
      if (ok) { _queue.shift(); _saveQueue(); synced++ }
      else if (!_isRetryable(kind)) {
        // Permission/schema/constraint errors will never succeed by replaying
        // the same payload — drop immediately instead of wedging every write
        // queued behind it for up to 8 retry cycles.
        console.error(`sync queue: dropping non-retryable op (${kind}) — ${op.kind} ${op.table}`)
        lastError = { kind, message, table: op.table }
        _queue.shift(); _saveQueue()
        try { _onWriteDropped && _onWriteDropped(op, kind, message) } catch (_) {}
      } else {
        op.attempts = (op.attempts || 0) + 1
        lastError = { kind, message, table: op.table }
        if (op.attempts >= 8) {
          console.error(`sync queue: dropping op after 8 tries — ${op.kind} ${op.table}`)
          _queue.shift()
          try { _onWriteDropped && _onWriteDropped(op, kind, message) } catch (_) {}
        }
        _saveQueue()
        if (op.attempts < 8) break // preserve order; retry whole queue later
      }
    }
  } finally { _flushing = false }
  return { synced, remaining: _queue.length, lastError }
}

// Auto-flush on reconnect and on a slow heartbeat while anything is pending.
// The heartbeat forces through the same unreliable-onLine gap noted above — a
// stuck "online: false" reading should not mean a queued write waits forever.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { sbFlushQueue() })
  setInterval(() => { if (_queue.length) sbFlushQueue(true) }, 45000)
}

// Every one of these was a bare `await supabase.from(...)` with no timeout —
// only the offline-queue's _replay (above) raced against _withTimeout. A live,
// first-attempt call that hangs (no error, no success — the same flaky-network
// failure mode _replay was built to survive) left callers like saveDeal
// permanently suspended: the "Add Deal" button shows "Saving…" forever, the
// modal never closes, and if the user gives up and refreshes, sbLoadAll's
// fresh fetch (which never saw the write) replaces local state — data that
// only ever existed in memory is gone. Reported live 2026-07-03: Sales team
// stuck on "Saving…", deal lost on refresh. Wrapping every live call in the
// same _withTimeout race used for replay closes that hole.
export const sbInsert = async (table, data) => {
  if (!supabase) return null
  const { data: result, error } = await _withTimeout(supabase.from(table).insert(data).select().single())
  if (error) { console.error(`SB INSERT ${table}:`, error.message); const kind=_writeFailed('insert', table, error.message); if(_isRetryable(kind)) _enqueue({ kind: 'insert', table, data }); else _notifyDropped({ kind: 'insert', table, data }, kind, error.message) }
  return result
}

export const sbUpdate = async (table, id, data) => {
  if (!supabase) return false
  // Every update stamps updated_at — but a few older tables never had that
  // column, and injecting it made PostgREST return PGRST204 ("Could not find
  // the 'updated_at' column of 'x' in the schema cache"). That classifies as a
  // non-retryable 'data' error, so the whole update was dropped and the user
  // got a scary "server rejected a change (bad data)" toast on an edit that was
  // otherwise fine (e.g. the turnover-date sync when editing an awarded deal).
  // Self-heal the same way _replay does for the offline queue: if a column in
  // the payload doesn't exist on the server, strip just that column and retry
  // so the rest of the row still lands. Bounded so it can never loop forever.
  // .select('id') so we can tell "updated 0 rows" apart from "updated 1 row" —
  // without it, Postgres reports success for an UPDATE that matched nothing
  // (e.g. the target row hasn't finished its own insert yet, on another device
  // or an unawaited parent write), and the change silently goes nowhere: no
  // error, so nothing queues it for retry, and no one is ever told.
  const payload = { ...data, updated_at: new Date().toISOString() }
  const stripped = []
  for (let guard = 0; guard < 16; guard++) {
    const { data: rows, error } = await _withTimeout(supabase.from(table).update(payload).eq('id', id).select('id'))
    if (error) {
      const miss = _MISSING_COL_RE.exec(error.message || '')
      const col = miss && miss[1]
      if (col && Object.prototype.hasOwnProperty.call(payload, col)) {
        delete payload[col]
        stripped.push(col)
        continue
      }
      console.error(`SB UPDATE ${table}:`, error.message); const kind=_writeFailed('update', table, error.message); if(_isRetryable(kind)) _enqueue({ kind: 'update', table, id, data }); else _notifyDropped({ kind: 'update', table, id, data }, kind, error.message); return false
    }
    if (stripped.length) console.warn(`SB UPDATE ${table}: succeeded after dropping column(s) not in the server schema: ${stripped.join(', ')}`)
    if (!rows || rows.length === 0) {
      console.warn(`SB UPDATE ${table}: no row matched id=${id} (not created yet on the server?) — queuing for retry`)
      _enqueue({ kind: 'update', table, id, data })
      return false
    }
    return true
  }
  console.error(`SB UPDATE ${table}: too many unknown columns for the current schema — giving up`)
  _writeFailed('update', table, 'Write dropped: too many unknown columns for the current schema.')
  return false
}

// Returns true/false so a caller that's about to write a DEPENDENT row (e.g. a
// child referencing this row's id via a foreign key) can wait for and confirm
// success first — otherwise the child write can reach the server before the
// parent commits and fail an FK check, which sync retry can never fix (a "data"
// error like a constraint violation is never retried, only dropped).
export const sbUpsert = async (table, data, conflictCol = 'id') => {
  if (!supabase) return false
  const { error } = await _withTimeout(supabase.from(table).upsert(data, { onConflict: conflictCol }))
  if (error) { console.error(`SB UPSERT ${table}:`, error.message); const kind=_writeFailed('upsert', table, error.message); if(_isRetryable(kind)) _enqueue({ kind: 'upsert', table, data, conflictCol }); else _notifyDropped({ kind: 'upsert', table, data, conflictCol }, kind, error.message); return false }
  return true
}

export const sbDelete = async (table, id) => {
  if (!supabase) return
  const { error } = await _withTimeout(supabase.from(table).delete().eq('id', id))
  if (error) { console.error(`SB DELETE ${table}:`, error.message); const kind=_writeFailed('delete', table, error.message); if(_isRetryable(kind)) _enqueue({ kind: 'delete', table, id }); else _notifyDropped({ kind: 'delete', table, id }, kind, error.message) }
}

// Conditional delete (delete-where) that, like sbDelete, reports failures
// through the central write-error hook — so cascade/by-column deletions are no
// longer a silent blind spot. op: 'eq' | 'in' | 'gte' | 'not_null'.
export const sbDeleteWhere = async (table, column, value, op = 'eq') => {
  if (!supabase) return
  let q = supabase.from(table).delete()
  if (op === 'in') q = q.in(column, value)
  else if (op === 'gte') q = q.gte(column, value)
  else if (op === 'not_null') q = q.not(column, 'is', null)
  else q = q.eq(column, value)
  const { error } = await _withTimeout(q)
  if (error) {
    console.error(`SB DELETE ${table} where ${column}:`, error.message); const kind=_writeFailed('delete', table, error.message)
    // Only re-queue targeted deletes; never replay bulk admin wipes (gte/not_null)
    // later, which could remove data added after the fact.
    if ((op === 'eq' || op === 'in') && _isRetryable(kind)) _enqueue({ kind: 'deleteWhere', table, column, value, op })
    else if (!_isRetryable(kind)) _notifyDropped({ kind: 'deleteWhere', table, column, value, op }, kind, error.message)
  }
}

export const sbList = async (table, opts = {}) => {
  if (!supabase) return []
  // Rebuild the query per attempt — a PostgREST builder can only be awaited once.
  const build = () => {
    let q = supabase.from(table).select(opts.select || '*')
    if (opts.order) q = q.order(opts.order, { ascending: opts.asc ?? false })
    if (opts.limit) q = q.limit(opts.limit)
    if (opts.eq) Object.entries(opts.eq).forEach(([col, val]) => { q = q.eq(col, val) })
    return q
  }
  // Retry transient read failures (a timeout or network blip on the constrained
  // PH<->server link). Previously ONE hiccup returned [], and the caller's
  // "only overwrite the cache if the server sent rows" guard then silently kept
  // the stale cached list — which is exactly how freshly-created rows (e.g. new
  // DRFs) went missing from the UI while sitting safely in the database. A read
  // that still fails after retries is recorded so sbLoadAll can flag it instead
  // of passing back a misleading empty array.
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await _sleep(400 * attempt)
    const { data, error } = await _withTimeout(build())
    if (!error) { _readFailures.delete(table); return data || [] }
    console.error(`SB LIST ${table} (attempt ${attempt + 1}/3):`, error.message)
  }
  _readFailures.add(table)
  return []
}

// Concurrency-limited runner (preserves input order). sbLoadAll fires ~34 table
// reads; firing all at once floods a constrained connection (PH<->Singapore) so
// that a brief network hiccup stalls the whole batch to the 12s timeout at
// once, and failed writes pile up in the retry queue. Running a few at a time
// keeps the app resilient on flaky networks. It's a background refresh (the UI
// is already live from the IndexedDB cache), so pacing it is imperceptible.
const _mapLimit = async (thunks, limit) => {
  const results = new Array(thunks.length)
  let next = 0
  const worker = async () => {
    while (next < thunks.length) {
      const i = next++
      results[i] = await thunks[i]()
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, thunks.length) }, worker))
  return results
}

export const sbLoadAll = async () => {
  if (!supabase) return null
  try {
    const [
      deals, jos, pcards, tasks, deptStatus,
      milestones, payments, expenses, inflows,
      prs, mreqs, breqs, addenda,
      cashPos, budgets, checklists, swatches, actLog, users, appSettings,
      drfs, inventory, stocklog, projRows,
      suppliers, subcontractors,
      payables, loans, loanPayments,
      swos, boqLibrary, checkVouchers, blockers, dailyLogs, ceReqs
    ] = await _mapLimit([
      () => sbList('deals',                    { order: 'created_at', limit: 1000 }),
      () => sbList('job_orders',               { order: 'created_at', limit: 500 }),
      // Defensive limits below: none of these are expected to approach these
      // ceilings under normal use, but an unbounded fetch is exactly the shape
      // of bug that silently grew suppliers/subcontractors to 60,000+/10,000+
      // rows before anyone noticed — a limit turns a future repeat of that into
      // a visibly-missing-data bug instead of an invisible, ever-slower one.
      () => sbList('project_cards',            { order: 'created_at', limit: 1000 }),
      () => sbList('project_card_dept_tasks',  { order: 'sort_order', asc: true, limit: 5000 }),
      () => sbList('project_card_dept_status', { limit: 2000 }),
      () => sbList('billing_milestones',       { order: 'created_at', limit: 2000 }),
      () => sbList('billing_payments',         { order: 'created_at', limit: 5000 }),
      () => sbList('expenses',                 { order: 'date',       limit: 1000 }),
      () => sbList('inflows',                  { order: 'date',       limit: 1000 }),
      () => sbList('purchase_requests',        { order: 'created_at', limit: 500 }),
      () => sbList('material_requests',        { order: 'created_at', limit: 500 }),
      () => sbList('budget_requests',          { order: 'created_at', limit: 500 }),
      () => sbList('addenda',                  { order: 'created_at', limit: 500 }),
      () => sbList('cash_positions',           { order: 'date',       limit: 2000 }),
      () => sbList('project_budgets',          { limit: 1000 }),
      () => sbList('checklists',               { order: 'sort_order', asc: true, limit: 1000 }),
      () => sbList('swatches',                 { order: 'created_at', limit: 500 }),
      () => sbList('activity_log',             { order: 'created_at', limit: 200 }),
      // Explicit column list, NOT '*' — password_hash's column-level SELECT was
      // revoked from anon/authenticated (migration 017), and PostgREST returns
      // a flat 403 "permission denied" for select=* the moment ANY column in
      // the table lacks a grant for the caller's role, even if every other
      // column is readable. This was silently breaking every user_profiles
      // load (empty `users` array on every session) until fixed 2026-07-03.
      () => sbList('user_profiles',            { select: 'id,username,name,role,title,status,email,created_at', order: 'role', limit: 500 }),
      () => sbList('app_settings',             { limit: 200 }),
      () => sbList('design_requests',          { order: 'created_at', limit: 2000 }),
      () => sbList('inventory_items',          { order: 'created_at', limit: 2000 }),
      () => sbList('stock_movements',          { order: 'created_at', limit: 5000 }),
      () => sbList('projects',                 { limit: 1000 }),
      () => sbList('suppliers',       { order: 'company_name', asc: true, limit: 2000 }),
      () => sbList('subcontractors',  { order: 'company_name', asc: true, limit: 2000 }),
      () => sbList('payables',        { order: 'created_at', limit: 500 }),
      () => sbList('loans',           { order: 'created_at', limit: 200 }),
      () => sbList('loan_payments',   { order: 'date',        limit: 1000 }),
      () => sbList('subcon_work_orders', { order: 'created_at', limit: 500 }),
      () => sbList('boq_library',        { order: 'name', asc: true, limit: 2000 }),
      () => sbList('check_vouchers',     { order: 'date', limit: 500 }),
      () => sbList('project_blockers',   { order: 'created_at', limit: 1000 }),
      () => sbList('daily_logs',         { order: 'log_date', limit: 1000 }),
      () => sbList('ce_requests',        { order: 'created_at', limit: 1000 }),
    ], 6)

    // Build pcards object with departments embedded
    const DEPT_ORDER = ['Sales','Design','QS','Procurement','Operations','Finance']
    const pcardsObj = {}
    pcards.forEach(card => {
      pcardsObj[card.deal_id] = {
        ...card,
        dealId: card.deal_id,
        aeAssigned: card.ae_assigned || '',
        pm1: card.pm1 || '',
        pm2: card.pm2 || '',
        pm3: card.pm3 || '',
        designer: card.designer || '',
        coordinator: card.coordinator || '',
        awardDate: card.award_date || null,
        targetDays: card.target_days || null,
        targetEndDate: card.target_end_date || null,
        tatCategory: card.tat_category || '',
        tatSetBy: card.tat_set_by || null,
        tatSetAt: card.tat_set_at || null,
        manualProgress: card.manual_progress != null ? card.manual_progress : null,
        warehouseOnly: card.warehouse_only || false,
        departments: Object.fromEntries(DEPT_ORDER.map(d => [d, { done: false, doneAt: null, doneBy: null, tasks: [] }]))
      }
    })
    tasks.forEach(t => {
      const card = Object.values(pcardsObj).find(c => c.id === t.card_id)
      if (card?.departments?.[t.department])
        card.departments[t.department].tasks.push({ id: t.id, text: t.task_text, done: t.done, doneAt: t.done_at, doneBy: t.done_by })
    })
    deptStatus.forEach(ds => {
      const card = Object.values(pcardsObj).find(c => c.id === ds.card_id)
      if (card?.departments?.[ds.department])
        Object.assign(card.departments[ds.department], { done: ds.done, doneAt: ds.done_at, doneBy: ds.done_by, statusId: ds.id })
    })

    // Embed payments into milestones (convert snake_case → camelCase for payment fields)
    const billingsArr = milestones.map(m => ({
      ...m, dealId: m.deal_id,
      payments: payments.filter(p => p.milestone_id === m.id).map(p => ({
        ...p, milestoneId: p.milestone_id, refNo: p.ref_no, recordedBy: p.recorded_by
      }))
    }))

    // Key objects
    const budgetsObj  = Object.fromEntries(budgets.map(b  => [b.deal_id, b]))
    const cashPosObj  = Object.fromEntries(cashPos.map(c  => [c.date, c]))

    const settingsObj = Object.fromEntries((appSettings||[]).map(s => [s.key, s.value]))
    const projsObj    = Object.fromEntries((projRows||[]).map(r => [r.deal_id, r.data]))

    // Embed loan_payments into loans
    const loansArr = loans.map(l => ({
      ...l,
      payments: loanPayments.filter(p => p.loan_id === l.id).map(p => ({
        id: p.id, loan_id: p.loan_id, amount: Number(p.amount), date: p.date
      }))
    }))

    return { deals, jos, pcards: pcardsObj, billings: billingsArr, exps: expenses, inflows,
             prs, mreqs, breqs, addenda, cashPositions: cashPosObj, budgets: budgetsObj,
             checklist: checklists, swatches, actLog, users, settings: settingsObj,
             drfs, inventory, stocklog, projs: projsObj, suppliers, subcontractors,
             payables, loans: loansArr, swos, boqLibrary, checkVouchers, blockers, dailyLogs, ceReqs,
             _failed: consumeReadFailures() }
  } catch (err) {
    console.error('sbLoadAll failed:', err)
    return null
  }
}

export const sbClear = async (table) => {
  if (!supabase) return
  const { error } = await _withTimeout(supabase.from(table).delete().not('id', 'is', null))
  if (error) { console.error(`SB CLEAR ${table}:`, error.message); _writeFailed('delete', table, error.message) }
}

export const sbSubscribe = (channel, table, callback) => {
  if (!supabase) return null
  // Remove any existing channel with this name before re-subscribing to avoid
  // "cannot add postgres_changes callbacks after subscribe()" crash on re-render
  const existing = supabase.getChannels().find(c => c.topic === `realtime:${channel}`)
  if (existing) supabase.removeChannel(existing)
  return supabase.channel(channel)
    .on('postgres_changes', { event: '*', schema: 'public', table }, callback)
    .subscribe()
}

// ── FILE STORAGE (Supabase Storage bucket: "fabhub-files") ───────────────────
// Bucket must be created in Supabase dashboard with public access enabled.
// Path convention: deals/{dealId}/{filename}  |  jos/{joId}/{filename}

export const sbUploadFile = async (folder, file) => {
  if (!supabase) return null
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${folder}/${Date.now()}_${safeName}`
  const { data, error } = await supabase.storage
    .from('fabhub-files')
    .upload(path, file, { upsert: false })
  if (error) { console.error('SB UPLOAD:', error.message); return null }
  return data?.path || path
}

export const sbDeleteFile = async (path) => {
  if (!supabase) return
  const { error } = await supabase.storage.from('fabhub-files').remove([path])
  if (error) console.error('SB DELETE FILE:', error.message)
}

export const sbGetPublicUrl = (path) => {
  if (!supabase) return null
  const { data } = supabase.storage.from('fabhub-files').getPublicUrl(path)
  return data?.publicUrl || null
}

export const sbListFiles = async (folder) => {
  if (!supabase) return []
  const { data, error } = await supabase.storage.from('fabhub-files').list(folder, {
    sortBy: { column: 'created_at', order: 'desc' }
  })
  if (error) { console.error('SB LIST FILES:', error.message); return [] }
  return (data || []).filter(f => f.name !== '.emptyFolderPlaceholder')
}

// ── CRASH TELEMETRY (best-effort, fail-safe) ─────────────────────────────────
// Records render crashes caught by the app's error boundaries into a
// `client_errors` table so production crashes are visible instead of relying on
// a user to screenshot and forward them. This path is deliberately isolated
// from every other write helper: it must NEVER throw, NEVER enqueue into the
// offline sync queue (a crash report is disposable — it must not compete with
// real user data for retries), and must silently no-op if the table doesn't
// exist yet (i.e. migration 027 hasn't been applied). Until that migration is
// run, calling this is completely harmless — the insert 404s and is swallowed.
let _lastErrKey = null, _lastErrAt = 0
export const logClientError = (err, info, view) => {
  try {
    if (!supabase) return
    const message = (err && (err.message || String(err))) || 'Unknown error'
    const stack = (err && err.stack) || ''
    // Dedupe: a render error often re-throws in a tight loop. Skip an identical
    // message fired within 10s so one crash can't spam the table (or the
    // network) hundreds of times.
    const key = `${view}|${message}`
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0
    if (key === _lastErrKey && now - _lastErrAt < 10000) return
    _lastErrKey = key; _lastErrAt = now
    const row = {
      message: message.slice(0, 2000),
      stack: stack.slice(0, 8000),
      component_stack: ((info && info.componentStack) || '').slice(0, 8000),
      view: (view || '').slice(0, 120),
      url: (typeof location !== 'undefined' && location.href) || '',
      user_agent: (typeof navigator !== 'undefined' && navigator.userAgent) || '',
    }
    // Fire and forget — bare insert, no _withTimeout/_enqueue, all errors eaten.
    Promise.resolve(supabase.from('client_errors').insert(row))
      .then(({ error }) => { if (error) console.warn('client_errors log skipped:', error.message) })
      .catch(() => {})
  } catch (_) { /* telemetry must never break the crash handler */ }
}
