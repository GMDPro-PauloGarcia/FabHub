-- ============================================================================
-- Migration 20260930a — only a Manager may bill or collect on a mother PO
--
-- Owner decision (Paulo Garcia, 2026-09-30): hard stop, not just a warning.
-- A standby PO (mother PO / Adhoc umbrella, deals.standby_po) earns ₱0 on its
-- own; its sub-projects carry the billing. Diageo CE-2026-1216 once carried the
-- ₱842,319.50 already collected on sub-project CE-2026-091, so Collected
-- counted it twice.
--
-- For callers with a JWT who are not Managers:
--   • billing_milestones — no insert, and no change to a row, on a standby PO
--   • billing_payments   — no insert, and no change to a row, whose milestone is
--                          on a standby PO
-- An UPDATE that changes nothing (the app's bulk re-sync) is allowed.
-- Deletes are not blocked, so a wrong row can still be removed.
-- Server-side callers with no JWT (SQL editor, migrations) are not restricted.
--
-- Mirrors isMotherPO + the Manager gate in BillingView (src/App.jsx) — keep in sync.
-- Idempotent.
-- ============================================================================

create or replace function public.billing_mother_po_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  has_jwt boolean := coalesce(current_setting('request.jwt.claims', true), '') <> '';
  ce      text;
begin
  if not has_jwt or public.is_mgr() then
    return new;
  end if;
  if tg_op = 'UPDATE' and to_jsonb(new) = to_jsonb(old) then
    return new;
  end if;

  if tg_table_name = 'billing_milestones' then
    select d.ce_no into ce from public.deals d
     where d.standby_po and d.id in (new.deal_id, case when tg_op = 'UPDATE' then old.deal_id end);
  else
    select d.ce_no into ce from public.billing_milestones m join public.deals d on d.id = m.deal_id
     where d.standby_po and m.id in (new.milestone_id, case when tg_op = 'UPDATE' then old.milestone_id end);
  end if;

  if found then
    raise exception '% is a mother PO (standby PO). Only a Manager can bill or record payments on it — bill the sub-project instead.', coalesce(ce, 'This project')
      using errcode = 'check_violation';
  end if;
  return new;
end
$fn$;
revoke execute on function public.billing_mother_po_guard() from public, anon, authenticated;

drop trigger if exists trg_mother_po_guard on public.billing_milestones;
create trigger trg_mother_po_guard before insert or update on public.billing_milestones
  for each row execute function public.billing_mother_po_guard();

drop trigger if exists trg_mother_po_guard on public.billing_payments;
create trigger trg_mother_po_guard before insert or update on public.billing_payments
  for each row execute function public.billing_mother_po_guard();

-- ── ROLLBACK ──
--   drop trigger if exists trg_mother_po_guard on public.billing_milestones;
--   drop trigger if exists trg_mother_po_guard on public.billing_payments;
--   drop function if exists public.billing_mother_po_guard();
