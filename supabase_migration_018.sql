-- ── Migration 018: Add missing purchase_requests columns (live sync bug) ─────
-- toSbPR() in src/App.jsx sends disc_type/disc_value (per-line-item discount)
-- and paid_ref/paid_date/paid_amt/paid_by (payment confirmation tracking used
-- by PoDocumentationQueue) on every purchase_requests insert/upsert, but these
-- columns were never added to the table. PostgREST rejected every such write
-- with a 400 "column not found" error, which the offline retry queue classifies
-- as a non-retryable "data" error and drops silently — so every PO save that
-- touched these fields (i.e. effectively every PO save) never reached the
-- server. Reported 2026-07-03 as "sync stuck" + "items we added disappeared".
--
-- Already applied directly to the live project via mcp__Supabase__apply_migration
-- on 2026-07-03; this file documents it for the repo/history.

alter table public.purchase_requests
  add column if not exists disc_type text default 'none',
  add column if not exists disc_value numeric default 0,
  add column if not exists paid_ref text,
  add column if not exists paid_date date,
  add column if not exists paid_amt numeric,
  add column if not exists paid_by text;
