import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL  = process.env.REACT_APP_SUPABASE_URL
const SUPABASE_ANON = process.env.REACT_APP_SUPABASE_ANON_KEY

export const supabase = (SUPABASE_URL && SUPABASE_ANON)
  ? createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null

export const isSupabaseReady = () => !!supabase

// App-wide write-failure hook: register a callback to be told when ANY write
// (insert/update/upsert/delete) fails, so the UI can warn the user that changes
// aren't reaching the server (instead of failing silently in 160+ call sites).
let _onWriteError = null
export const setSbErrorHandler = (fn) => { _onWriteError = fn }
// Classify a write failure so the UI can show an accurate message instead of
// always blaming "you may be offline" — a stale/expired session, a permission
// error, or a schema mismatch (all common right after a domain/project
// migration) are not offline issues and won't fix themselves on reconnect.
const _classifyError = (msg) => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline'
  const m = (msg || '').toLowerCase()
  if (m.includes('failed to fetch') || m.includes('load failed') || m.includes('network')) return 'network'
  if (m.includes('permission denied') || m.includes('row-level security') || m.includes('jwt') || m.includes('not authorized')) return 'auth'
  if (m.includes('does not exist') || m.includes('violates') || m.includes('invalid input syntax') || m.includes('duplicate key')) return 'data'
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

const _replay = async (op) => {
  try {
    let error
    if (op.kind === 'insert' || op.kind === 'upsert') {
      // Replay inserts as upserts when an id is present so a lost-response retry
      // can't create a duplicate; fall back to insert only when there's no id.
      if (op.data && op.data.id != null) error = (await supabase.from(op.table).upsert(op.data, { onConflict: op.conflictCol || 'id' })).error
      else error = (await supabase.from(op.table).insert(op.data)).error
    } else if (op.kind === 'update') {
      error = (await supabase.from(op.table).update({ ...op.data, updated_at: new Date().toISOString() }).eq('id', op.id)).error
    } else if (op.kind === 'delete') {
      error = (await supabase.from(op.table).delete().eq('id', op.id)).error
    } else if (op.kind === 'deleteWhere') {
      let q = supabase.from(op.table).delete()
      if (op.op === 'in') q = q.in(op.column, op.value)
      else q = q.eq(op.column, op.value)
      error = (await q).error
    }
    if (error) { console.warn(`sync replay ${op.kind} ${op.table}:`, error.message); return { ok: false, kind: _classifyError(error.message) } }
    return { ok: true }
  } catch (e) { console.warn(`sync replay threw ${op.kind} ${op.table}:`, e.message); return { ok: false, kind: _classifyError(e.message) } }
}

let _flushing = false
// force=true (user tapped "retry now", or the periodic heartbeat) skips the
// navigator.onLine check — that flag is unreliable on some networks/browsers
// (VPNs, captive portals, mobile Safari) and can report false while the
// connection is actually fine, which silently blocked every retry forever
// even though nothing was actually wrong.
export const sbFlushQueue = async (force = false) => {
  if (!supabase || _flushing || !_queue.length) return
  if (!force && typeof navigator !== 'undefined' && navigator.onLine === false) return
  _flushing = true
  try {
    while (_queue.length) {
      const op = _queue[0]
      const { ok, kind } = await _replay(op)
      if (ok) { _queue.shift(); _saveQueue() }
      else if (!_isRetryable(kind)) {
        // Permission/schema/constraint errors will never succeed by replaying
        // the same payload — drop immediately instead of wedging every write
        // queued behind it for up to 8 retry cycles.
        console.error(`sync queue: dropping non-retryable op (${kind}) — ${op.kind} ${op.table}`)
        _queue.shift(); _saveQueue()
      } else {
        op.attempts = (op.attempts || 0) + 1
        if (op.attempts >= 8) { console.error(`sync queue: dropping op after 8 tries — ${op.kind} ${op.table}`); _queue.shift() }
        _saveQueue()
        if (op.attempts < 8) break // preserve order; retry whole queue later
      }
    }
  } finally { _flushing = false }
}

// Auto-flush on reconnect and on a slow heartbeat while anything is pending.
// The heartbeat forces through the same unreliable-onLine gap noted above — a
// stuck "online: false" reading should not mean a queued write waits forever.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { sbFlushQueue() })
  setInterval(() => { if (_queue.length) sbFlushQueue(true) }, 45000)
}

export const sbInsert = async (table, data) => {
  if (!supabase) return null
  const { data: result, error } = await supabase.from(table).insert(data).select().single()
  if (error) { console.error(`SB INSERT ${table}:`, error.message); const kind=_writeFailed('insert', table, error.message); if(_isRetryable(kind)) _enqueue({ kind: 'insert', table, data }) }
  return result
}

export const sbUpdate = async (table, id, data) => {
  if (!supabase) return
  const { error } = await supabase.from(table).update({...data, updated_at: new Date().toISOString()}).eq('id', id)
  if (error) { console.error(`SB UPDATE ${table}:`, error.message); const kind=_writeFailed('update', table, error.message); if(_isRetryable(kind)) _enqueue({ kind: 'update', table, id, data }) }
}

export const sbUpsert = async (table, data, conflictCol = 'id') => {
  if (!supabase) return
  const { error } = await supabase.from(table).upsert(data, { onConflict: conflictCol })
  if (error) { console.error(`SB UPSERT ${table}:`, error.message); const kind=_writeFailed('upsert', table, error.message); if(_isRetryable(kind)) _enqueue({ kind: 'upsert', table, data, conflictCol }) }
}

export const sbDelete = async (table, id) => {
  if (!supabase) return
  const { error } = await supabase.from(table).delete().eq('id', id)
  if (error) { console.error(`SB DELETE ${table}:`, error.message); const kind=_writeFailed('delete', table, error.message); if(_isRetryable(kind)) _enqueue({ kind: 'delete', table, id }) }
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
  const { error } = await q
  if (error) {
    console.error(`SB DELETE ${table} where ${column}:`, error.message); const kind=_writeFailed('delete', table, error.message)
    // Only re-queue targeted deletes; never replay bulk admin wipes (gte/not_null)
    // later, which could remove data added after the fact.
    if ((op === 'eq' || op === 'in') && _isRetryable(kind)) _enqueue({ kind: 'deleteWhere', table, column, value, op })
  }
}

export const sbList = async (table, opts = {}) => {
  if (!supabase) return []
  let q = supabase.from(table).select(opts.select || '*')
  if (opts.order) q = q.order(opts.order, { ascending: opts.asc ?? false })
  if (opts.limit) q = q.limit(opts.limit)
  if (opts.eq) Object.entries(opts.eq).forEach(([col, val]) => { q = q.eq(col, val) })
  const { data, error } = await q
  if (error) console.error(`SB LIST ${table}:`, error.message)
  return data || []
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
      swos, boqLibrary, checkVouchers, blockers, dailyLogs
    ] = await Promise.all([
      sbList('deals',                    { order: 'created_at', limit: 1000 }),
      sbList('job_orders',               { order: 'created_at', limit: 500 }),
      sbList('project_cards',            { order: 'created_at' }),
      sbList('project_card_dept_tasks',  { order: 'sort_order', asc: true }),
      sbList('project_card_dept_status', {}),
      sbList('billing_milestones',       { order: 'created_at' }),
      sbList('billing_payments',         { order: 'created_at' }),
      sbList('expenses',                 { order: 'date',       limit: 1000 }),
      sbList('inflows',                  { order: 'date',       limit: 1000 }),
      sbList('purchase_requests',        { order: 'created_at', limit: 500 }),
      sbList('material_requests',        { order: 'created_at', limit: 500 }),
      sbList('budget_requests',          { order: 'created_at', limit: 500 }),
      sbList('addenda',                  { order: 'created_at', limit: 500 }),
      sbList('cash_positions',           { order: 'date' }),
      sbList('project_budgets',          {}),
      sbList('checklists',               { order: 'sort_order', asc: true, limit: 1000 }),
      sbList('swatches',                 { order: 'created_at', limit: 500 }),
      sbList('activity_log',             { order: 'created_at', limit: 200 }),
      sbList('user_profiles',            { order: 'role' }),
      sbList('app_settings',             {}),
      sbList('design_requests',          { order: 'created_at' }),
      sbList('inventory_items',          { order: 'created_at' }),
      sbList('stock_movements',          { order: 'created_at' }),
      sbList('projects',                 {}),
      sbList('suppliers',       { order: 'company_name', asc: true }),
      sbList('subcontractors',  { order: 'company_name', asc: true }),
      sbList('payables',        { order: 'created_at', limit: 500 }),
      sbList('loans',           { order: 'created_at', limit: 200 }),
      sbList('loan_payments',   { order: 'date',        limit: 1000 }),
      sbList('subcon_work_orders', { order: 'created_at', limit: 500 }),
      sbList('boq_library',        { order: 'name', asc: true }),
      sbList('check_vouchers',     { order: 'date', limit: 500 }),
      sbList('project_blockers',   { order: 'created_at', limit: 1000 }),
      sbList('daily_logs',         { order: 'log_date', limit: 1000 }),
    ])

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
        warehouseOnly: card.warehouse_only || false,
        departments: Object.fromEntries(DEPT_ORDER.map(d => [d, { done: false, doneAt: null, doneBy: null, tasks: [] }]))
      }
    })
    tasks.forEach(t => {
      const card = Object.values(pcardsObj).find(c => c.id === t.card_id)
      if (card?.departments[t.department])
        card.departments[t.department].tasks.push({ id: t.id, text: t.task_text, done: t.done, doneAt: t.done_at, doneBy: t.done_by })
    })
    deptStatus.forEach(ds => {
      const card = Object.values(pcardsObj).find(c => c.id === ds.card_id)
      if (card?.departments[ds.department])
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
             payables, loans: loansArr, swos, boqLibrary, checkVouchers, blockers, dailyLogs }
  } catch (err) {
    console.error('sbLoadAll failed:', err)
    return null
  }
}

export const sbClear = async (table) => {
  if (!supabase) return
  const { error } = await supabase.from(table).delete().not('id', 'is', null)
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
