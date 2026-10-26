-- ============================================================================
-- Migration 20261020110100 — No PO or subcon work order before a down payment
-- (part 2 of 2: the blocks)
--
-- Needs part 1 (20261020110000: deals.dp_waived_*, deal_dp_clear). Applied
-- only AFTER the app with the waive button (DpGate) is deployed, so a Manager
-- can always waive what this starts blocking.
--
-- A purchase request can't move into "PO Issued" / "Partially Delivered" /
-- "Delivered", and a subcon work order into "Issued" / "In Progress" /
-- "Completed", unless deal_dp_clear(deal_id). Drafts and Pending Approval are
-- always allowed; a PO already issued can still move on (e.g. to Delivered).
-- Callers with no JWT (SQL editor) are exempt. Idempotent; no DROP statements.
-- ============================================================================

-- Purchase requests ------------------------------------------------------------
create or replace function public.po_require_dp()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare
  issued text[] := array['PO Issued', 'Partially Delivered', 'Delivered'];
  ce text;
begin
  if coalesce(current_setting('request.jwt.claims', true), '') = '' then
    return new;
  end if;
  if not (coalesce(new.status, '') = any(issued)) then
    return new;
  end if;
  if tg_op = 'UPDATE' and coalesce(old.status, '') = any(issued)
     and new.deal_id is not distinct from old.deal_id then
    return new;
  end if;
  if public.deal_dp_clear(new.deal_id) then
    return new;
  end if;
  select ce_no into ce from public.deals where id = new.deal_id;
  raise exception 'No down payment received on % yet. A Manager must waive the down payment on the deal before this PO can be issued.', coalesce(ce, 'this project')
    using errcode = 'check_violation';
end
$fn$;
revoke execute on function public.po_require_dp() from public, anon, authenticated;

create or replace trigger trg_po_require_dp
  before insert or update of status, deal_id on public.purchase_requests
  for each row execute function public.po_require_dp();

-- Subcon work orders -----------------------------------------------------------
create or replace function public.swo_require_dp()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare
  issued text[] := array['Issued', 'In Progress', 'Completed'];
  ce text;
begin
  if coalesce(current_setting('request.jwt.claims', true), '') = '' then
    return new;
  end if;
  if not (coalesce(new.status, '') = any(issued)) then
    return new;
  end if;
  if tg_op = 'UPDATE' and coalesce(old.status, '') = any(issued)
     and new.deal_id is not distinct from old.deal_id then
    return new;
  end if;
  if public.deal_dp_clear(new.deal_id) then
    return new;
  end if;
  select ce_no into ce from public.deals where id = new.deal_id;
  raise exception 'No down payment received on % yet. A Manager must waive the down payment on the deal before this work order can be issued.', coalesce(ce, 'this project')
    using errcode = 'check_violation';
end
$fn$;
revoke execute on function public.swo_require_dp() from public, anon, authenticated;

create or replace trigger trg_swo_require_dp
  before insert or update of status, deal_id on public.subcon_work_orders
  for each row execute function public.swo_require_dp();

select 'Migration 20261020110100 applied — POs / subcon WOs need a down payment or a Manager waiver' as status;

-- ── ROLLBACK (run by hand) ──
--   drop trigger if exists trg_swo_require_dp on public.subcon_work_orders;
--   drop trigger if exists trg_po_require_dp on public.purchase_requests;
--   drop function if exists public.swo_require_dp();
--   drop function if exists public.po_require_dp();
