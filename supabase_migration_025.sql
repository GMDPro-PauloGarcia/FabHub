-- ── Migration 025: Add deals.payment_terms_json ─────────────────────────────
-- confirmAward() saves the deal's payment terms with
--   sbUpdate('deals', id, { payment_terms_json: JSON.stringify(form.paymentTerms) })
-- and the load/realtime mappers read them back with JSON.parse(rec.payment_terms_json).
-- The column was never created in the live DB, so PostgREST rejected the award
-- write with:
--   "Could not find the 'payment_terms_json' column of 'deals' in the schema cache"
-- which surfaced in the app as the "Still can't sync" banner and blocked awarded
-- deals from ever persisting their billing terms.
--
-- Purely additive, nullable TEXT column (the app stores a JSON *string* via
-- JSON.stringify and parses it back with JSON.parse, so TEXT — not JSONB —
-- matches that contract exactly).
--
-- Applied to the live project via mcp__Supabase__apply_migration on 2026-07-08;
-- this file documents it for the repo/history.

alter table public.deals add column if not exists payment_terms_json text;
