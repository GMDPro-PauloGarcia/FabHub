-- ── Weekly payment run + BIR 2307 tracking (2026-11-05, Paulo) ──────────────
-- Applied to production 2026-11-05 (version 20261105042842), after a rolled-back test as mark / paolo / jessica.
-- Follows "GMD Monitoring Flow: Stock, Payments, Collections" (Nov 2026):
--   Mon  RFP cut-off: Finance lists the bills to pay this week (Draft)
--   Tue  proposal against cash (Proposed)
--   Wed  a Manager approves the run (Approved): approve_payment_run() approves
--        every bill in it through the normal approval rules (no self-approval,
--        subcon certification) in one step
--   Thu  release: payments are recorded per supplier as usual (payable_payments);
--        the run is marked Released
--   Fri  2307s issued to suppliers for the tax withheld
-- A payment outside a run is still possible (urgent cases); the monitoring board
-- shows it as off-cycle.
--
-- payment_runs
--   items: [{payableId, amount}] (the balance proposed for each bill).
--   Rules (trg_payment_runs_guard):
--   • a new run is always Draft; status, approved_*, released_* are server-kept
--   • Draft ↔ Proposed and Approved → Released by Finance / FinanceAssistant /
--     Manager; → Approved only through approve_payment_run (Manager, not the
--     person who proposed it); → Cancelled with a reason (Manager, or the
--     proposer before approval)
--   • items and amounts can't change once Approved
--   No delete policy: runs are cancelled, never deleted.
--
-- bir_2307
--   One row per party per quarter (and per deal for clients):
--   direction 'issue'   = GMD withheld tax from a supplier and must issue a 2307
--             'receive' = a client withheld tax from GMD and must give GMD a 2307
--   status Pending → Issued / Received (ref and date recorded) or Not required.
--   No delete policy.
--
-- ROLLBACK (keeps the data; switches the features off for the app):
--   alter table public.payment_runs disable row level security;  -- then re-enable after review
--   revoke all on public.payment_runs, public.bir_2307 from authenticated;
--   revoke execute on function public.approve_payment_run(uuid) from authenticated;

create table if not exists public.payment_runs (
  id uuid primary key default gen_random_uuid(),
  release_date date not null,
  status text not null default 'Draft' check (status in ('Draft','Proposed','Approved','Released','Cancelled')),
  items jsonb not null default '[]'::jsonb,
  cash_available numeric,
  cash_as_of date,
  notes text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  proposed_by text, proposed_at timestamptz,
  approved_by text, approved_at timestamptz,
  released_by text, released_at timestamptz,
  cancelled_by text, cancelled_at timestamptz, cancel_reason text
);
create index if not exists payment_runs_release_idx on public.payment_runs (release_date desc);
alter table public.payment_runs enable row level security;

create or replace function public.payment_runs_guard()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_me text;
  v_rpc boolean := coalesce(current_setting('fabhub.run_approve', true), '') = 'on';
begin
  if coalesce(current_setting('request.jwt.claims', true), '') = '' then return new; end if;
  select p.name into v_me from public.user_profiles p where p.username = public.app_username() limit 1;
  v_me := coalesce(v_me, public.app_username());
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.status := 'Draft';
    new.created_by := v_me; new.created_at := now();
    new.proposed_by := null; new.proposed_at := null;
    new.approved_by := null; new.approved_at := null;
    new.released_by := null; new.released_at := null;
    new.cancelled_by := null; new.cancelled_at := null; new.cancel_reason := null;
    return new;
  end if;
  -- server-kept stamps
  new.created_by := old.created_by; new.created_at := old.created_at;
  new.proposed_by := old.proposed_by; new.proposed_at := old.proposed_at;
  new.approved_by := old.approved_by; new.approved_at := old.approved_at;
  new.released_by := old.released_by; new.released_at := old.released_at;
  new.cancelled_by := old.cancelled_by; new.cancelled_at := old.cancelled_at;
  if old.status in ('Approved','Released','Cancelled') and (new.items is distinct from old.items or new.release_date is distinct from old.release_date) then
    raise exception 'This payment run is % — its bills can no longer change.', old.status using errcode = '42501';
  end if;
  if new.status is distinct from old.status then
    if new.status = 'Proposed' and old.status = 'Draft' then
      new.proposed_by := v_me; new.proposed_at := now();
    elsif new.status = 'Draft' and old.status = 'Proposed' then
      null; -- sent back for changes
    elsif new.status = 'Approved' and old.status = 'Proposed' and v_rpc then
      new.approved_by := v_me; new.approved_at := now();
    elsif new.status = 'Released' and old.status = 'Approved' then
      new.released_by := v_me; new.released_at := now();
    elsif new.status = 'Cancelled' and old.status in ('Draft','Proposed','Approved') then
      if length(trim(coalesce(new.cancel_reason, ''))) < 5 then
        raise exception 'Give a reason for cancelling the payment run.' using errcode = '22023';
      end if;
      if not public.is_mgr() and (old.status = 'Approved' or coalesce(old.proposed_by, old.created_by) <> v_me) then
        raise exception 'Only a Manager (or whoever prepared it, before approval) can cancel a payment run.' using errcode = '42501';
      end if;
      new.cancelled_by := v_me; new.cancelled_at := now();
    else
      raise exception 'A payment run can''t go from % to %.', old.status, new.status using errcode = '42501';
    end if;
  end if;
  return new;
end $function$;

create or replace trigger trg_payment_runs_guard
  before insert or update on public.payment_runs
  for each row execute function public.payment_runs_guard();

-- Approve a proposed run: a Manager who didn't propose it. Every bill in the run
-- that is still Pending is approved through the normal payables rules.
create or replace function public.approve_payment_run(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  r public.payment_runs;
  v_me text;
  it jsonb;
  b public.payables;
  n_approved int := 0;
begin
  if not public.is_mgr() then
    raise exception 'Only a Manager approves a payment run.' using errcode = '42501';
  end if;
  select * into r from public.payment_runs where id = p_id for update;
  if not found then raise exception 'Payment run not found.'; end if;
  if r.status <> 'Proposed' then
    raise exception 'Only a proposed run can be approved (this one is %).', r.status using errcode = '42501';
  end if;
  select p.name into v_me from public.user_profiles p where p.username = public.app_username() limit 1;
  if lower(coalesce(r.proposed_by, '')) in (lower(coalesce(v_me, '')), lower(public.app_username())) then
    raise exception 'You proposed this run. Another Manager approves it.' using errcode = '42501';
  end if;
  for it in select * from jsonb_array_elements(r.items) loop
    select * into b from public.payables where id = it->>'payableId';
    if not found then raise exception 'A bill in this run no longer exists (%). Send the run back and update it.', it->>'payableId'; end if;
    if coalesce(nullif(b.approval_status, ''), 'Approved') = 'Pending' then
      -- the payables trigger checks self-approval and subcon certification
      update public.payables set approval_status = 'Approved' where id = b.id;
      n_approved := n_approved + 1;
    elsif b.approval_status = 'Rejected' then
      raise exception 'Bill % was rejected. Take it out of the run first.', coalesce(nullif(b.ap_number, ''), b.id);
    end if;
  end loop;
  perform set_config('fabhub.run_approve', 'on', true);
  update public.payment_runs set status = 'Approved' where id = p_id;
  perform set_config('fabhub.run_approve', '', true);
  return jsonb_build_object('approved_bills', n_approved, 'items', jsonb_array_length(r.items));
end $function$;

revoke execute on function public.payment_runs_guard() from public, anon, authenticated;
revoke execute on function public.approve_payment_run(uuid) from public, anon;
grant execute on function public.approve_payment_run(uuid) to authenticated;

do $p$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='payment_runs' and policyname='payment_runs_sel') then
    create policy payment_runs_sel on public.payment_runs for select to authenticated
      using (public.has_role('Manager','Finance','FinanceAssistant','Accounting'));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='payment_runs' and policyname='payment_runs_ins') then
    create policy payment_runs_ins on public.payment_runs for insert to authenticated
      with check (public.has_role('Manager','Finance','FinanceAssistant'));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='payment_runs' and policyname='payment_runs_upd') then
    create policy payment_runs_upd on public.payment_runs for update to authenticated
      using (public.has_role('Manager','Finance','FinanceAssistant'))
      with check (public.has_role('Manager','Finance','FinanceAssistant'));
  end if;
end $p$;
grant select, insert, update on public.payment_runs to authenticated;
revoke all on public.payment_runs from anon;

-- ── BIR 2307 ────────────────────────────────────────────────────────────────
create table if not exists public.bir_2307 (
  id uuid primary key default gen_random_uuid(),
  direction text not null check (direction in ('issue','receive')),
  party text not null default '',
  party_key text not null default '',
  quarter text not null check (quarter ~ '^[0-9]{4}-Q[1-4]$'),
  deal_id uuid,
  tax_base numeric not null default 0,
  ewt_amount numeric not null default 0,
  status text not null default 'Pending' check (status in ('Pending','Issued','Received','Not required')),
  ref text not null default '',
  dated date,
  notes text not null default '',
  recorded_by text not null default '',
  recorded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists bir_2307_one_per_party_quarter
  on public.bir_2307 (direction, party_key, quarter, coalesce(deal_id::text, ''));
alter table public.bir_2307 enable row level security;

create or replace function public.bir_2307_stamp()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare v_me text;
begin
  new.updated_at := now();
  if coalesce(current_setting('request.jwt.claims', true), '') = '' then return new; end if;
  if tg_op = 'INSERT' or new.status is distinct from old.status or new.ref is distinct from old.ref or new.dated is distinct from old.dated then
    select p.name into v_me from public.user_profiles p where p.username = public.app_username() limit 1;
    new.recorded_by := coalesce(v_me, public.app_username());
    new.recorded_at := now();
  end if;
  if new.status in ('Issued','Received') and (length(trim(new.ref)) = 0 or new.dated is null) then
    raise exception 'Enter the 2307 reference and date.' using errcode = '22023';
  end if;
  return new;
end $function$;
create or replace trigger trg_bir_2307_stamp
  before insert or update on public.bir_2307
  for each row execute function public.bir_2307_stamp();
revoke execute on function public.bir_2307_stamp() from public, anon, authenticated;

do $p$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='bir_2307' and policyname='bir_2307_sel') then
    create policy bir_2307_sel on public.bir_2307 for select to authenticated
      using (public.has_role('Manager','Finance','FinanceAssistant','Accounting'));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='bir_2307' and policyname='bir_2307_ins') then
    create policy bir_2307_ins on public.bir_2307 for insert to authenticated
      with check (public.has_role('Manager','Finance','FinanceAssistant','Accounting'));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='bir_2307' and policyname='bir_2307_upd') then
    create policy bir_2307_upd on public.bir_2307 for update to authenticated
      using (public.has_role('Manager','Finance','FinanceAssistant','Accounting'))
      with check (public.has_role('Manager','Finance','FinanceAssistant','Accounting'));
  end if;
end $p$;
grant select, insert, update on public.bir_2307 to authenticated;
revoke all on public.bir_2307 from anon;
