-- ── Migration 014: Add accounting/payment columns to subcon_work_orders ──────
-- These 8 columns were defined in supabase_schema.sql (attributed there to
-- "migration 012"), but migration 011 — which actually creates the table —
-- stops at approved_by, and migration 012 turned out to be the ce_requests
-- queue instead. So any Supabase project built from the incremental migrations
-- is missing them.
--
-- The app's swoToSb() mapper always writes these columns on every save, so the
-- sbUpsert('subcon_work_orders', …) call fails with a "column does not exist"
-- error. That error is swallowed by a .catch, so a new Work Order is written to
-- local IndexedDB (it may briefly appear) but never reaches Supabase — the
-- primary source of truth. On a fresh device, or after the browser evicts
-- IndexedDB, the Work Order is gone. Same class of bug as migration 013.

ALTER TABLE subcon_work_orders
  ADD COLUMN IF NOT EXISTS acct_status        TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS acct_notes         TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS acct_checked_by    TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS acct_checked_at    DATE,
  ADD COLUMN IF NOT EXISTS payment_bank       TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS payment_ref        TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS payment_ordered_by TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS payment_ordered_at DATE;
