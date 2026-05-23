import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL  = process.env.REACT_APP_SUPABASE_URL
const SUPABASE_ANON = process.env.REACT_APP_SUPABASE_ANON_KEY

export const supabase = (SUPABASE_URL && SUPABASE_ANON)
  ? createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null

export const isSupabaseReady = () => !!supabase

export const sbInsert = async (table, data) => {
  if (!supabase) return null
  const { data: result, error } = await supabase.from(table).insert(data).select().single()
  if (error) console.error(`SB INSERT ${table}:`, error.message)
  return result
}

export const sbUpdate = async (table, id, data) => {
  if (!supabase) return
  const { error } = await supabase.from(table).update({...data, updated_at: new Date().toISOString()}).eq('id', id)
  if (error) console.error(`SB UPDATE ${table}:`, error.message)
}

export const sbUpsert = async (table, data, conflictCol = 'id') => {
  if (!supabase) return
  const { error } = await supabase.from(table).upsert(data, { onConflict: conflictCol })
  if (error) console.error(`SB UPSERT ${table}:`, error.message)
}

export const sbDelete = async (table, id) => {
  if (!supabase) return
  const { error } = await supabase.from(table).delete().eq('id', id)
  if (error) console.error(`SB DELETE ${table}:`, error.message)
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
      cashPos, budgets, checklists, swatches, actLog, users
    ] = await Promise.all([
      sbList('deals',                    { order: 'created_at' }),
      sbList('job_orders',               { order: 'created_at' }),
      sbList('project_cards',            { order: 'created_at' }),
      sbList('project_card_dept_tasks',  { order: 'sort_order', asc: true }),
      sbList('project_card_dept_status', {}),
      sbList('billing_milestones',       { order: 'created_at' }),
      sbList('billing_payments',         { order: 'created_at' }),
      sbList('expenses',                 { order: 'date' }),
      sbList('inflows',                  { order: 'date' }),
      sbList('purchase_requests',        { order: 'created_at' }),
      sbList('material_requests',        { order: 'created_at' }),
      sbList('budget_requests',          { order: 'created_at' }),
      sbList('addenda',                  { order: 'created_at' }),
      sbList('cash_positions',           { order: 'date' }),
      sbList('project_budgets',          {}),
      sbList('checklists',               { order: 'sort_order', asc: true }),
      sbList('swatches',                 { order: 'created_at' }),
      sbList('activity_log',             { order: 'created_at', limit: 200 }),
      sbList('user_profiles',            { order: 'role' }),
    ])

    // Build pcards object with departments embedded
    const DEPT_ORDER = ['Sales','Design','QS','Procurement','Operations','Finance']
    const pcardsObj = {}
    pcards.forEach(card => {
      pcardsObj[card.deal_id] = {
        ...card, dealId: card.deal_id,
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

    return { deals, jos, pcards: pcardsObj, billings: billingsArr, exps: expenses, inflows,
             prs, mreqs, breqs, addenda, cashPositions: cashPosObj, budgets: budgetsObj,
             checklist: checklists, swatches, actLog, users }
  } catch (err) {
    console.error('sbLoadAll failed:', err)
    return null
  }
}

export const sbClear = async (table) => {
  if (!supabase) return
  const { error } = await supabase.from(table).delete().not('id', 'is', null)
  if (error) console.error(`SB CLEAR ${table}:`, error.message)
}

export const sbSubscribe = (channel, table, callback) => {
  if (!supabase) return null
  return supabase.channel(channel)
    .on('postgres_changes', { event: '*', schema: 'public', table }, callback)
    .subscribe()
}
