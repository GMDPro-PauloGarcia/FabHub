#!/usr/bin/env node
/*
 * smoke-billing.js — proves a billing payment actually REACHES THE SERVER after
 * a release, with every column toSbPayment() writes present in the live schema.
 *
 * This is the guard against the exact failure documented in migration 025: the
 * app wrote a `bank` column the DB didn't have, PostgREST rejected every payment
 * upsert, the error was swallowed into "saved locally", and the server table sat
 * at 0 rows until a device wipe lost all collection history. A green build and a
 * booting app do NOT catch that — only a real round-trip does.
 *
 * What it does (non-destructive): insert a marked test payment against an
 * existing milestone using the SAME column set as src/App.jsx toSbPayment(),
 * read it back FROM THE SERVER, assert every column round-tripped, then delete
 * it. A missing/renamed column fails loudly instead of silently.
 *
 * Requires (CI secrets):
 *   SUPABASE_URL               - live project URL
 *   SUPABASE_SERVICE_ROLE_KEY  - service role key (bypasses RLS for the test)
 * If either is absent the check SKIPS with a clear message (exit 0) rather than
 * failing — so local runs without secrets don't break, but CI (which has them)
 * always exercises it.
 *
 * Usage:  npm run smoke:billing
 */
const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Mirror of src/App.jsx toSbPayment() — the contract this test defends.
const TEST_COLUMNS = [
  'amount', 'date', 'ref_no', 'note', 'recorded_by',
  'bank', 'value_date', 'payment_method', 'bounced',
];

async function main() {
  if (!URL || !KEY) {
    console.log('smoke:billing — SKIPPED (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set)');
    return;
  }
  const { createClient } = require('@supabase/supabase-js');
  const sb = createClient(URL, KEY, { auth: { persistSession: false } });

  // Need a real milestone to satisfy the FK. Read one; don't create/mutate data.
  const { data: ms, error: msErr } = await sb
    .from('billing_milestones').select('id').limit(1);
  if (msErr) throw new Error(`cannot read billing_milestones: ${msErr.message}`);
  if (!ms || !ms.length) {
    console.log('smoke:billing — SKIPPED (no billing_milestones to attach a test payment to)');
    return;
  }
  const milestoneId = ms[0].id;

  const marker = `__smoke_${Date.now()}`;
  const row = {
    milestone_id: milestoneId,
    amount: 1,
    date: '2000-01-01',
    ref_no: marker,
    note: marker,
    recorded_by: 'smoke-test',
    bank: 'SMOKE',
    value_date: '2000-01-01',
    payment_method: 'SMOKE',
    bounced: false,
  };

  let insertedId = null;
  try {
    const ins = await sb.from('billing_payments').insert(row).select().single();
    if (ins.error) {
      // A "column ... does not exist" here is the 025-class regression.
      throw new Error(`INSERT rejected by server (schema drift?): ${ins.error.message}`);
    }
    insertedId = ins.data.id;

    // Read it back FROM THE SERVER (not local state) and verify every column.
    const back = await sb.from('billing_payments')
      .select(TEST_COLUMNS.join(',')).eq('id', insertedId).single();
    if (back.error) throw new Error(`readback failed: ${back.error.message}`);
    for (const col of TEST_COLUMNS) {
      if (!(col in back.data)) throw new Error(`column "${col}" missing on readback`);
    }
    console.log(`smoke:billing — OK (payment round-tripped through server; ${TEST_COLUMNS.length} columns verified)`);
  } finally {
    if (insertedId) {
      const del = await sb.from('billing_payments').delete().eq('id', insertedId);
      if (del.error) console.warn(`smoke:billing — WARNING: cleanup failed, delete test row ${insertedId} manually: ${del.error.message}`);
    }
  }
}

main().catch((e) => {
  console.error(`smoke:billing — FAILED: ${e.message}`);
  process.exit(1);
});
