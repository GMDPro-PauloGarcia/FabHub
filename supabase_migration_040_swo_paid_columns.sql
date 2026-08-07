-- ── Migration 040: subcon_work_orders — add the missing paid_* columns ───────
-- swoToSb() writes paid_ref / paid_date / paid_amt / paid_by on every Work Order
-- upsert (the subcontractor payment fields), but these columns were never
-- created — migration 033 only added account_code. So recording a subcontractor
-- payment failed PostgREST validation with:
--   "Could not find the 'paid_amt' column of 'subcon_work_orders' in the schema
--    cache"
-- and the write was dropped by the client retry queue, surfacing as
-- "13 changes to subcon_work_orders could not be saved — please redo them."
--
-- Additive + idempotent: nullable columns, existing rows unaffected, old code
-- ignores them. Already applied to the live fabhub-gmd project and verified.

ALTER TABLE public.subcon_work_orders
  ADD COLUMN IF NOT EXISTS paid_ref  TEXT,
  ADD COLUMN IF NOT EXISTS paid_date DATE,
  ADD COLUMN IF NOT EXISTS paid_amt  NUMERIC,
  ADD COLUMN IF NOT EXISTS paid_by   TEXT;
