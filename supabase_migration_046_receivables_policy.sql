-- ============================================================================
-- FabHub Migration 046 — Receivables & Finance Policy v2.0 support
-- Run in Supabase SQL Editor (safe to re-run; all IF NOT EXISTS / nullable).
--
-- Backs the document-gated receivables cycle from the GMD Receivables & Finance
-- Policy v2.0. Adds the client-onboarding facts Finance must have on file before
-- it will process the first (downpayment) invoice — policy §2.1 — and the
-- client-satisfaction verification that gates final billing and retention
-- release (§2.3, §3).
--
-- Progress Reports, Installation Reports and the COC are NOT new tables: they
-- live inside the existing per-deal `projects` JSON blob (alongside pmUpdates,
-- addenda, warranty and cocCreated/cocDate/cocLink), so they sync through the
-- same path with no new entity wiring. This migration only adds the flat,
-- queryable columns the billing side needs.
--
-- New columns
--   deals.bir_2303_url      — link to the client's BIR Form 2303 (COR)
--   deals.bir_2303_on_file  — Finance has confirmed the 2303 is on file
--   deals.vat_treatment     — 'VAT-inclusive' | 'VAT-exclusive' (pricing basis)
--   deals.downpayment_pct   — agreed downpayment %, mirrored from payment terms
--   deals.payment_terms_text— free-text terms as agreed on the signed C.E.
--   deals.client_satisfied  — Sales has verified client satisfaction post-install
--   deals.satisfaction_note — supporting note for the satisfaction verification
-- ============================================================================

alter table public.deals add column if not exists bir_2303_url       text;
alter table public.deals add column if not exists bir_2303_on_file    boolean not null default false;
alter table public.deals add column if not exists vat_treatment       text;
alter table public.deals add column if not exists downpayment_pct      numeric;
alter table public.deals add column if not exists payment_terms_text   text;
alter table public.deals add column if not exists client_satisfied     boolean not null default false;
alter table public.deals add column if not exists satisfaction_note    text;

-- Backfill the downpayment % from any payment terms already captured as JSON, so
-- existing awarded deals show their agreed DP without re-entry.
update public.deals d
set downpayment_pct = nullif((d.payment_terms_json::jsonb ->> 'dp'), '')::numeric
where d.downpayment_pct is null
  and d.payment_terms_json is not null
  and (d.payment_terms_json::jsonb ->> 'dp') is not null;

select 'Migration 046 applied — receivables policy columns added on deals' as status;
