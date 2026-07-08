-- ── Migration 025: billing_payments — add `bank` + clearance fields ──────────
-- Two problems, same class of bug as migrations 013/015:
--
-- 1. toSbPayment() has long written a `bank` column, but billing_payments never
--    had one (the live table had exactly the columns from supabase_schema.sql
--    plus an ad-hoc `value_date`). Every payment upsert therefore failed
--    PostgREST validation ("column bank does not exist"); the error is
--    swallowed by a .catch, so collections were written to local IndexedDB only
--    and NEVER reached Supabase — the table had 0 rows. On a fresh device or
--    after IndexedDB eviction, all collection history is gone.
--
-- 2. The collection clearance model (finding #1) needs a payment method and a
--    bounced flag. The clearance date reuses the existing `value_date` column.
--
-- Additive + idempotent: safe to run on any project, old code ignores the new
-- columns.

ALTER TABLE billing_payments
  ADD COLUMN IF NOT EXISTS bank            TEXT    DEFAULT '',
  ADD COLUMN IF NOT EXISTS payment_method  TEXT    DEFAULT '',
  ADD COLUMN IF NOT EXISTS bounced         BOOLEAN DEFAULT FALSE;
-- value_date (DATE) already exists on the live table and is reused as the
-- canonical "funds cleared / available" date.
