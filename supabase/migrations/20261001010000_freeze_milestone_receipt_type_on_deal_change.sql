-- ============================================================================
-- Migration 20261001a — freeze existing invoices' tax when a deal's receipt
-- type changes
--
-- Owner decision (Paulo Garcia, 2026-10-01): the BOQ's VAT choice is final and
-- sets deals.receipt_type (VAT 12% → OR, No VAT → AR), even on a project that
-- is already billed. Any adjustment to a specific invoice is made in the
-- billing modal (billing_milestones.receipt_type / withholding).
--
-- Problem this solves: most billing_milestones rows have receipt_type NULL and
-- inherit the deal's at read time (calcTax(..., m.receipt_type ?? deal.receipt_type)).
-- Flipping the deal would silently re-tax invoices already issued or paid.
--
-- Fix: BEFORE UPDATE OF receipt_type on deals, copy the OLD receipt type (and
-- withholding) onto that deal's milestones that have none of their own. Issued
-- invoices keep the tax they were billed with; only milestones created after
-- the change follow the new receipt type.
--
-- SECURITY DEFINER because Sales/QS may update deals (deals_upd) but not
-- billing_milestones (billing_milestones_upd). Standby POs (mother POs) are
-- skipped: they earn ₱0 and their milestones are Manager-only
-- (20260930010000_mother_po_billing_manager_only.sql would reject the write).
-- Idempotent.
-- ============================================================================

create or replace function public.deal_receipt_type_freeze_milestones()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.receipt_type is distinct from old.receipt_type
     and old.receipt_type is not null
     and not coalesce(new.standby_po, false) then
    update public.billing_milestones m
       set receipt_type = old.receipt_type,
           withholding  = coalesce(m.withholding, old.withholding, false)
     where m.deal_id = new.id
       and m.receipt_type is null;
  end if;
  return new;
end
$fn$;
revoke execute on function public.deal_receipt_type_freeze_milestones() from public, anon, authenticated;

drop trigger if exists trg_deal_receipt_type_freeze on public.deals;
create trigger trg_deal_receipt_type_freeze before update of receipt_type on public.deals
  for each row execute function public.deal_receipt_type_freeze_milestones();

-- ROLLBACK
-- drop trigger if exists trg_deal_receipt_type_freeze on public.deals;
-- drop function if exists public.deal_receipt_type_freeze_milestones();
-- (Milestones already stamped keep their receipt_type; that is the billed truth.)
