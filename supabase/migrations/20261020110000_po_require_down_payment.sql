-- ============================================================================
-- Migration 20261020110000 — No PO or subcon work order before a down payment
--
-- Owner decision (Paulo Garcia, 2026-10-20). Every GMD quote says "NO DP & NO
-- Signed Contract = NO Production", but 116 of 611 POs issued since July (₱602K
-- on 31 deals) went out before the client had paid anything, e.g. CE-2026-1069
-- (₱87K stainless PO on Sep 14, ₱0 collected a month later).
--
-- A purchase request can't become an issued PO ("PO Issued", "Partially
-- Delivered", "Delivered"), and a subcon work order can't become "Issued" /
-- "In Progress" / "Completed", on a deal until one of these is true:
--   • the client has paid something on it (any non-bounced billing payment, or
--     deals.amount_paid > 0 for legacy deals without milestones);
--   • a Manager has waived the down payment on the deal (credit-term clients
--     such as SM, Diageo, Rustan's), with a reason: deals.dp_waived_*;
--   • it is a sub-project / addendum whose parent deal is paid or waived, or a
--     mother PO with a paid or waived sub-project;
--   • it is an internal GMD job (client "GMD Productions…"), or has no deal.
-- POs already issued are untouched; only the move into an issued status is
-- checked. Only a Manager can set or clear a waiver, and every change is
-- written to audit_log.
--
-- Part 1 of 2: the waiver columns, the rule (deal_dp_clear) and the
-- Manager-only waiver guard. It blocks nothing by itself, so it is applied
-- BEFORE the app ships. Part 2 (20261020110100_po_require_down_payment_
-- triggers.sql) adds the PO / work-order blocks AFTER the app with the waive
-- button is live, so Procurement is never blocked without a way to waive.
--
-- Mirrors dealDpClear (src/core.js) and the PO / SWO issue gates in
-- src/App.jsx — keep in sync. Callers with no JWT (SQL editor) are exempt.
-- Idempotent; no DROP statements.
-- ============================================================================

alter table public.deals add column if not exists dp_waived_by     text;
alter table public.deals add column if not exists dp_waived_at     timestamptz;
alter table public.deals add column if not exists dp_waived_reason text;

-- Is production spending allowed on this deal?
create or replace function public.deal_dp_clear(p_deal uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $fn$
  select p_deal is null or exists (
    select 1 from public.deals d
     where d.id = p_deal
       and (
            d.client ilike 'GMD Production%'
         or d.dp_waived_at is not null
         or coalesce(d.amount_paid, 0) > 0
         or exists (select 1 from public.billing_milestones m
                      join public.billing_payments p on p.milestone_id = m.id
                     where m.deal_id = d.id and coalesce(p.amount, 0) > 0
                       and not coalesce(p.bounced, false))
         or exists (select 1 from public.deals par
                     where par.id = d.parent_deal_id
                       and (par.dp_waived_at is not null or coalesce(par.amount_paid, 0) > 0))
         or (coalesce(d.standby_po, false) and exists (
               select 1 from public.deals ch
                where ch.parent_deal_id = d.id
                  and (ch.dp_waived_at is not null or coalesce(ch.amount_paid, 0) > 0)))
       ))
$fn$;
revoke execute on function public.deal_dp_clear(uuid) from public, anon, authenticated;

-- Waiver: Manager only, with a reason, always audited ----------------------------
create or replace function public.deals_dp_waiver_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
begin
  if coalesce(current_setting('request.jwt.claims', true), '') = '' then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.dp_waived_at     is not distinct from old.dp_waived_at
     and new.dp_waived_by     is not distinct from old.dp_waived_by
     and new.dp_waived_reason is not distinct from old.dp_waived_reason then
    return new;
  end if;
  if tg_op = 'INSERT' and new.dp_waived_at is null and new.dp_waived_by is null
     and new.dp_waived_reason is null then
    return new;
  end if;
  if not public.is_mgr() then
    raise exception 'Only a Manager can waive the down payment on %.', coalesce(new.ce_no, 'this deal')
      using errcode = 'check_violation';
  end if;
  if new.dp_waived_at is not null and length(trim(coalesce(new.dp_waived_reason, ''))) < 5 then
    raise exception 'Give a reason for waiving the down payment on %.', coalesce(new.ce_no, 'this deal')
      using errcode = 'check_violation';
  end if;
  insert into public.audit_log (table_name, record_id, action, reason, performed_by, snapshot, old_snapshot)
  values ('deals', new.id::text,
          case when new.dp_waived_at is null then 'dp_waiver_removed' else 'dp_waiver_set' end,
          new.dp_waived_reason, nullif(public.app_username(), ''),
          jsonb_build_object('ce_no', new.ce_no, 'dp_waived_by', new.dp_waived_by, 'dp_waived_at', new.dp_waived_at, 'dp_waived_reason', new.dp_waived_reason),
          case when tg_op = 'UPDATE' then jsonb_build_object('dp_waived_by', old.dp_waived_by, 'dp_waived_at', old.dp_waived_at, 'dp_waived_reason', old.dp_waived_reason) end);
  return new;
end
$fn$;
revoke execute on function public.deals_dp_waiver_guard() from public, anon, authenticated;

create or replace trigger trg_deals_dp_waiver_guard
  before insert or update of dp_waived_by, dp_waived_at, dp_waived_reason on public.deals
  for each row execute function public.deals_dp_waiver_guard();

select 'Migration 20261020110000 applied — DP waiver columns, rule and guard (no blocking yet)' as status;

-- ── ROLLBACK (run by hand; roll back part 2 first) ──
--   drop trigger if exists trg_deals_dp_waiver_guard on public.deals;
--   drop function if exists public.deals_dp_waiver_guard();
--   drop function if exists public.deal_dp_clear(uuid);
--   -- the dp_waived_* columns can stay; they are inert without the triggers.
