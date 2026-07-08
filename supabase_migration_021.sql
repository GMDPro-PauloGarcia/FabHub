-- ── Migration 021: Performance — drop duplicate indexes, cover foreign keys ──
-- Supabase performance linter flagged three pairs of identical indexes (wasted
-- writes/storage) and four foreign keys with no covering index (slow joins and
-- slow ON DELETE cascades). All behaviour-preserving.
--
-- Applied to the live project via mcp__Supabase__apply_migration on 2026-07-08;
-- this file documents it for the repo/history.

-- Duplicate indexes — keep one of each identical pair
alter table public.app_settings drop constraint if exists app_settings_key_unique; -- redundant with pkey on (key)
drop index if exists public.idx_milestones_deal;  -- identical to idx_billing_deal (deal_id)
drop index if exists public.idx_payments_ms;      -- identical to idx_payments_milestone (milestone_id)

-- Covering indexes for unindexed foreign keys
create index if not exists idx_drf_forms_deal    on public.design_request_forms (deal_id);
create index if not exists idx_loan_payments_loan on public.loan_payments (loan_id);
create index if not exists idx_prs_from_mr        on public.purchase_requests (from_mr_id);
create index if not exists idx_stock_deal         on public.stock_movements (deal_id);
