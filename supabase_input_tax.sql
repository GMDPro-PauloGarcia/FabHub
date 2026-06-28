-- ============================================================================
-- FabHub — input VAT / EWT capture on expenses (PO-sourced supplier costs)
-- ============================================================================
-- Adds BIR tax fields to the expenses table so finance can track:
--   • input VAT (creditable against output VAT on the 2550M/2550Q)
--   • EWT withheld from suppliers (remittable on the 1601-E; source of 2307s)
--   • the VAT-exclusive net amount
-- All nullable, so existing rows and untagged expenses are unaffected.
-- Run this once in the Supabase SQL Editor.
-- ============================================================================
alter table public.expenses add column if not exists vatable     boolean;
alter table public.expenses add column if not exists input_vat   numeric;
alter table public.expenses add column if not exists ewt_rate    numeric;
alter table public.expenses add column if not exists ewt_amount  numeric;
alter table public.expenses add column if not exists net_amount  numeric;
