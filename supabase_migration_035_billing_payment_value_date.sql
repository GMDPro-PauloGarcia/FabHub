-- ── Migration 035: billing_payments — add the missing `value_date` column ────
-- Fixes the client-payment (billing collection) sync bug.
--
-- toSbPayment() in the app writes a `value_date` column on EVERY payment upsert,
-- and migration 025 assumed that column "already exists on the live table" as an
-- ad-hoc addition — but NO migration or schema file ever actually creates it. It
-- only exists on the one production DB where someone added it by hand.
--
-- On every other project/environment the column is absent, so each payment
-- insert fails PostgREST validation ("column value_date does not exist"). The
-- app swallows that error in a .catch: the collection is written to local
-- IndexedDB only, the user is told "saved locally but NOT synced", and the
-- payment never reaches Supabase — so it disappears on other devices and after
-- a refresh. This is the same bug class migration 025 set out to fix; it just
-- left `value_date` out of the actual ALTER TABLE.
--
-- Additive + idempotent: safe to run on any project (including the one where
-- the column was added by hand), and old code ignores the new columns. The
-- bank/payment_method/bounced adds from migration 025 are repeated defensively
-- so a project that only ever ran the base schema is brought fully in sync.

ALTER TABLE billing_payments
  ADD COLUMN IF NOT EXISTS value_date      DATE,
  ADD COLUMN IF NOT EXISTS bank            TEXT    DEFAULT '',
  ADD COLUMN IF NOT EXISTS payment_method  TEXT    DEFAULT '',
  ADD COLUMN IF NOT EXISTS bounced         BOOLEAN DEFAULT FALSE;
