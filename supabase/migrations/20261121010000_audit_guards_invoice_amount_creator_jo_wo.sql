-- Audit guards (FabHub system audit, 2026-11-19). NOT YET APPLIED.
-- Section 5 (change order / addendum approval) added 2026-11-19 at Paulo's request.
--
-- Four rules that until now were enforced only in the app (or not at all).
-- Anyone with a login token can write to the REST API directly, so app-only
-- rules are loopholes.
--
-- 1. billing_milestones.amount: only a Manager changes the amount of an invoice
--    that is no longer a Draft. Before this, anyone with Billing edit (Finance,
--    FinanceAssistant, SalesOpsAdmin) could lower a Sent invoice and skip the
--    deduction request -> approve flow (record/approve_billing_deduction). A stale
--    device saving a milestone after a Manager approved a deduction also put the
--    old, higher amount back. The change is dropped silently (the rest of the
--    save goes through) and logged to audit_log (action 'blocked').
--    The deduction RPCs only lower the amount when the caller is a Manager, so
--    they are unaffected.
--    Same for billing_milestones.deal_id once the milestone has payments: moving
--    a paid invoice onto another deal moves its collections, and with them a
--    Sales Owner's commission base.
-- 2. payables.created_by / created_at: stamped by the server on insert, kept on
--    update. Self-approval (enforce_payable_approval) compares against
--    created_by, which the app sent and anyone could edit, so "entered by Mark"
--    could be written and then self-approved. created_at gates the supplier docs
--    check (bills from 2026-11-09), so it could be back-dated to skip it.
-- 3. job_orders.jo_no: an issued JO number never changes (CLAUDE.md), now kept by
--    the database the way trg_payables_lock_ap_number keeps AP numbers. Every JO
--    save is a full upsert carrying this device's jo_no; a device whose read-back
--    of a new JO failed had '' and could blank the number.
--    Override for a deliberate renumber: set local fabhub.jo_renumber = 'on'.
-- 4. subcon_work_orders.contract_amount: once Cost Control has signed
--    (cc_approved_by), only a Manager changes the contract amount. The bill and
--    payment caps read the live contract, so raising it after signature let more
--    be billed and paid with no new signature. Dropped silently and logged.
--
-- All four keep the rule "return early on an INSERT whose row already exists"
-- (upserts run BEFORE INSERT triggers; the UPDATE branch decides).
-- Functions are trigger-only: execute revoked from public, anon, authenticated.

-- ── 1. billing_milestones ─────────────────────────────────────────────────────
create or replace function public.billing_milestone_amount_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_blocked text[] := '{}';
begin
  if coalesce(current_setting('request.jwt.claims', true), '') = '' or public.is_mgr() then
    return new;
  end if;
  if round(coalesce(new.amount, 0), 2) <> round(coalesce(old.amount, 0), 2)
     and coalesce(old.status, '') <> 'Draft' then
    v_blocked := v_blocked || format('amount %s -> %s', old.amount, new.amount);
    new.amount := old.amount;
    -- the stored tax figures follow the amount
    new.vat := old.vat;
    new.ewt := old.ewt;
    new.net_receivable := old.net_receivable;
  end if;
  if new.deal_id is distinct from old.deal_id
     and exists (select 1 from public.billing_payments p where p.milestone_id = old.id) then
    v_blocked := v_blocked || format('deal_id %s -> %s', old.deal_id, new.deal_id);
    new.deal_id := old.deal_id;
  end if;
  if array_length(v_blocked, 1) > 0 then
    insert into public.audit_log (table_name, record_id, action, snapshot, reason, performed_by, performed_at)
    values ('billing_milestones', old.id::text, 'blocked',
            jsonb_build_object('invoice_no', old.invoice_no, 'status', old.status, 'kept', v_blocked),
            'Only a Manager changes the amount of a sent invoice (use a deduction request) or moves a paid invoice to another project',
            public.app_username(), now());
  end if;
  return new;
end $$;

create or replace trigger trg_billing_milestone_amount_guard
  before update on public.billing_milestones
  for each row execute function public.billing_milestone_amount_guard();

-- ── 2. payables.created_by / created_at ──────────────────────────────────────
create or replace function public.payables_stamp_creator()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_name text;
begin
  if coalesce(current_setting('request.jwt.claims', true), '') = '' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if exists (select 1 from public.payables x where x.id = new.id) then
      return new;  -- upsert of an existing bill: the UPDATE branch decides
    end if;
    select p.name into v_name from public.user_profiles p where p.username = public.app_username() limit 1;
    if coalesce(v_name, '') <> '' then
      new.created_by := v_name;
    end if;
    new.created_at := now();
    return new;
  end if;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  return new;
end $$;

-- "aa" so it runs before the other payables BEFORE triggers (alphabetical order).
create or replace trigger trg_payables_aa_stamp_creator
  before insert or update on public.payables
  for each row execute function public.payables_stamp_creator();

-- ── 3. job_orders.jo_no ───────────────────────────────────────────────────────
create or replace function public.job_orders_lock_jo_no()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if coalesce(trim(old.jo_no), '') <> ''
     and new.jo_no is distinct from old.jo_no
     and coalesce(current_setting('fabhub.jo_renumber', true), '') <> 'on' then
    new.jo_no := old.jo_no;
  end if;
  return new;
end $$;

create or replace trigger trg_job_orders_lock_jo_no
  before update on public.job_orders
  for each row execute function public.job_orders_lock_jo_no();

-- ── 4. subcon_work_orders.contract_amount ────────────────────────────────────
create or replace function public.swo_contract_lock()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if coalesce(current_setting('request.jwt.claims', true), '') = '' or public.is_mgr() then
    return new;
  end if;
  if old.cc_approved_by is not null
     and round(coalesce(new.contract_amount, 0), 2) <> round(coalesce(old.contract_amount, 0), 2) then
    insert into public.audit_log (table_name, record_id, action, snapshot, reason, performed_by, performed_at)
    values ('subcon_work_orders', old.id::text, 'blocked',
            jsonb_build_object('wo_number', old.wo_number, 'contract_amount', old.contract_amount, 'attempted', new.contract_amount),
            'Only a Manager changes the contract amount of a signed Work Order',
            public.app_username(), now());
    new.contract_amount := old.contract_amount;
  end if;
  return new;
end $$;

create or replace trigger trg_swo_contract_lock
  before update on public.subcon_work_orders
  for each row execute function public.swo_contract_lock();

revoke execute on function public.billing_milestone_amount_guard() from public, anon, authenticated;
revoke execute on function public.payables_stamp_creator() from public, anon, authenticated;
revoke execute on function public.job_orders_lock_jo_no() from public, anon, authenticated;
revoke execute on function public.swo_contract_lock() from public, anon, authenticated;

-- ── 5. Change order / addendum approval (Paulo, 2026-11-19) ──────────────────
-- Approving a change order (addenda) or an addendum deal (deals.parent_deal_id,
-- addendum_status) rolls its value into the contract, billing and the Sales
-- Owner's commission. Only a Manager, or SalesOpsAdmin on a deal where they are
-- not the Sales Owner (deal or parent), may approve or un-approve one. Before:
-- any Sales user could approve an addendum deal (56 approved, ₱12.2M, as of
-- 2026-11-19), and Sales / Ops / PMs could approve a CO, whose invoice then failed
-- silently under RLS. Anyone else's change is kept as it was and logged
-- ('blocked'), so a stale full-row save still goes through.
-- App mirror: canApproveAddendum / ADDENDUM_APPROVER_ROLES (src/core.js).
create or replace function public.can_approve_addendum(p_deal uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_me text;
begin
  if public.is_mgr() then return true; end if;
  if not public.has_role('SalesOpsAdmin') then return false; end if;
  select lower(btrim(p.name)) into v_me from public.user_profiles p where p.username = public.app_username() limit 1;
  return not exists (
    select 1 from public.deals d
    where (d.id = p_deal or d.id = (select x.parent_deal_id from public.deals x where x.id = p_deal))
      and coalesce(v_me, '') <> ''
      and lower(btrim(coalesce(d.sales_owner, ''))) = v_me);
end $$;

create or replace function public.addenda_approval_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_rolled_old boolean;
  v_rolled_new boolean;
begin
  if coalesce(current_setting('request.jwt.claims', true), '') = '' then
    return new;
  end if;
  v_rolled_new := coalesce(new.status, '') in ('Approved', 'Billed', 'Collected');
  if tg_op = 'INSERT' then
    if exists (select 1 from public.addenda x where x.id = new.id) then
      return new;  -- upsert of an existing CO: the UPDATE branch decides
    end if;
    if v_rolled_new and not public.can_approve_addendum(new.deal_id) then
      new.status := 'Discovered';
      new.awarded_date := null;
    end if;
    return new;
  end if;
  v_rolled_old := coalesce(old.status, '') in ('Approved', 'Billed', 'Collected');
  if (v_rolled_old <> v_rolled_new
      or (v_rolled_old and (round(coalesce(new.value, 0), 2) <> round(coalesce(old.value, 0), 2)
                            or coalesce(new.kind, '') <> coalesce(old.kind, '')))
      or new.deal_id is distinct from old.deal_id and v_rolled_old)
     and not public.can_approve_addendum(old.deal_id) then
    insert into public.audit_log (table_name, record_id, action, snapshot, reason, performed_by, performed_at)
    values ('addenda', old.id::text, 'blocked',
            jsonb_build_object('title', old.title, 'status', old.status, 'attempted_status', new.status,
                               'value', old.value, 'attempted_value', new.value),
            'Only a Manager or SalesOpsAdmin (not on their own deal) approves a change order or changes an approved one',
            public.app_username(), now());
    new.status := old.status;
    new.value := old.value;
    new.kind := old.kind;
    new.deal_id := old.deal_id;
    new.awarded_date := old.awarded_date;
  end if;
  return new;
end $$;

create or replace trigger trg_addenda_approval_guard
  before insert or update on public.addenda
  for each row execute function public.addenda_approval_guard();

create or replace function public.deals_addendum_approval_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if coalesce(current_setting('request.jwt.claims', true), '') = '' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if exists (select 1 from public.deals x where x.id = new.id) then
      return new;  -- upsert of an existing deal: the UPDATE branch decides
    end if;
    if new.parent_deal_id is not null and coalesce(new.addendum_status, '') = 'Approved'
       and not (public.is_mgr() or (public.has_role('SalesOpsAdmin') and public.can_approve_addendum(new.parent_deal_id)
                and lower(btrim(coalesce(new.sales_owner, ''))) is distinct from
                    (select lower(btrim(p.name)) from public.user_profiles p where p.username = public.app_username() limit 1))) then
      new.addendum_status := 'Pending';
    end if;
    return new;
  end if;
  if new.addendum_status is distinct from old.addendum_status
     and old.parent_deal_id is not null
     and not public.can_approve_addendum(old.id) then
    insert into public.audit_log (table_name, record_id, action, snapshot, reason, performed_by, performed_at)
    values ('deals', old.id::text, 'blocked',
            jsonb_build_object('ce_no', old.ce_no, 'addendum_status', old.addendum_status, 'attempted', new.addendum_status),
            'Only a Manager or SalesOpsAdmin (not on their own deal) approves an addendum',
            public.app_username(), now());
    new.addendum_status := old.addendum_status;
  end if;
  return new;
end $$;

create or replace trigger trg_deals_addendum_approval_guard
  before insert or update on public.deals
  for each row execute function public.deals_addendum_approval_guard();

revoke execute on function public.can_approve_addendum(uuid) from public, anon, authenticated;
revoke execute on function public.addenda_approval_guard() from public, anon, authenticated;
revoke execute on function public.deals_addendum_approval_guard() from public, anon, authenticated;

-- ROLLBACK
-- drop trigger if exists trg_billing_milestone_amount_guard on public.billing_milestones;
-- drop trigger if exists trg_payables_aa_stamp_creator on public.payables;
-- drop trigger if exists trg_job_orders_lock_jo_no on public.job_orders;
-- drop trigger if exists trg_swo_contract_lock on public.subcon_work_orders;
-- drop function if exists public.billing_milestone_amount_guard();
-- drop function if exists public.payables_stamp_creator();
-- drop function if exists public.job_orders_lock_jo_no();
-- drop function if exists public.swo_contract_lock();
-- drop trigger if exists trg_addenda_approval_guard on public.addenda;
-- drop trigger if exists trg_deals_addendum_approval_guard on public.deals;
-- drop function if exists public.addenda_approval_guard();
-- drop function if exists public.deals_addendum_approval_guard();
-- drop function if exists public.can_approve_addendum(uuid);
