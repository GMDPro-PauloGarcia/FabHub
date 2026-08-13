-- ============================================================
-- FabHub Migration 043 — addendum sales attribution + sub-account
-- Run this in Supabase SQL Editor (safe to run multiple times)
--
-- A change order (addendum) is a sale in its own right: it must be
-- credited to an AE and counted in the month it was awarded (approved),
-- and it may belong to a sub-account / sub-brand under the parent contract.
--   sales_owner  — the AE credited with this change order's value
--   awarded_date — the date the CO was Approved; drives which month its
--                  sales value lands in on the Sales Value report
--   sub_account  — the child brand this scope belongs to (e.g. "SM Signature"
--                  under parent "SM Development Corporation"); the parent
--                  contract remains the primary tag (deal_id)
-- ============================================================

ALTER TABLE addenda
  ADD COLUMN IF NOT EXISTS sales_owner  TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS awarded_date DATE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS sub_account  TEXT DEFAULT NULL;

SELECT 'Migration 043 applied — sales_owner, awarded_date, sub_account added to addenda' AS status;
