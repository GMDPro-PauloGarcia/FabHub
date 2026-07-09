-- ============================================================================
-- FabHub — tax-breakdown + audit columns on billing milestones
-- ============================================================================
-- toSbBilling writes a VAT / EWT / net-receivable breakdown (computed by
-- calcTax) plus sent_date on every milestone save, and sbUpdate stamps
-- updated_at on every status change. These columns were never added to the
-- billing_milestones table, so every write failed with
--   "Could not find the 'ewt' column of 'billing_milestones' in the schema cache"
-- and — because that error classifies as a retryable server error — sat at the
-- head of the offline sync queue and blocked everything behind it ("Still can't
-- sync"). All additive and nullable, so existing rows are unaffected.
-- Run this once in the Supabase SQL Editor.
-- ============================================================================
alter table public.billing_milestones add column if not exists sent_date      date;
alter table public.billing_milestones add column if not exists vat            numeric;
alter table public.billing_milestones add column if not exists ewt            numeric;
alter table public.billing_milestones add column if not exists net_receivable numeric;
alter table public.billing_milestones add column if not exists updated_at     timestamptz default now();
