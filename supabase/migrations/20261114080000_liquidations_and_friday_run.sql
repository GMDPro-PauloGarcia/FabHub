-- Liquidations (refills with receipts) in the weekly payment run, released on
-- Friday (Paulo, 2026-11-11). NOT applied yet: weekend release.
--
-- Why: in the 60 days to 2026-11-11, 79 reimbursement / liquidation rows
-- (₱745K) were typed straight into the Daily Cash Position with no request,
-- approval, receipts or project. The old e-voucher page (app_settings blob)
-- held 0 records. Liquidations now get a real table and go through the same
-- payment run as supplier bills: Finance checks, a Manager approves the run,
-- Finance pays on Friday.
--
-- liquidations
--   One request to refill / reimburse a person for what they spent, with one
--   line per receipt: items = [{date, supplier, description, amount,
--   receipt_path | no_receipt}]. amount = sum of the lines (server-kept).
--   Charged to a project (project_id = deals.id) or to charge_to (OPEX, Admin…).
--   Status (trg_liquidations_guard):
--     Submitted  anyone with a FabHub role submits (for themselves or, Finance,
--                for site staff without a login: payee is free text)
--     Returned   Finance sends it back with a reason; the requester fixes it
--                and resubmits (→ Submitted)
--     Checked    Finance / FinanceAssistant / Manager, not the requester and
--                not the payee: receipts match the lines
--     Approved   only by approve_payment_run (a Manager who didn't prepare the
--                run); run_id is stamped. Cancelling an approved run puts its
--                liquidations back to Checked.
--     Paid       Finance / FinanceAssistant / Manager, with a reference (check
--                no., transfer ref, or the cash-sheet row key) and date
--     Cancelled  the requester (Submitted / Returned) or a Manager (before
--                Approved), with a reason
--   Lines and amount can't change once Checked (Return it to change them).
--   The server issues liq_no (LQ-YYYY-####) and stamps who / when; nothing
--   is deleted (no delete policy). Every insert / update goes to audit_log.
--
-- payment_runs: items may now also be {liquidationId, amount}. The amount must
-- equal the liquidation's amount (refilled in full).
--
-- Mirrors src/views/Liquidations.jsx and src/views/PaymentRun.jsx. Keep in sync.
-- Idempotent; no DROP.

create sequence if not exists public.liquidations_no_seq;

create table if not exists public.liquidations (
  id uuid primary key default gen_random_uuid(),
  liq_no text,
  requested_by text not null default '',
  requester_name text not null default '',
  payee text not null default '',
  purpose text not null default '',
  project_id uuid,
  charge_to text not null default '',
  items jsonb not null default '[]'::jsonb,
  amount numeric not null default 0,
  status text not null default 'Submitted'
    check (status in ('Submitted','Returned','Checked','Approved','Paid','Cancelled')),
  checked_by text, checked_at timestamptz,
  return_reason text,
  approved_by text, approved_at timestamptz,
  run_id uuid,
  paid_by text, paid_at timestamptz, paid_date date, paid_ref text, paid_bank text, cash_key text,
  cancel_reason text, cancelled_by text, cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists liquidations_no_unique on public.liquidations (liq_no) where liq_no is not null;
create index if not exists liquidations_status_idx on public.liquidations (status);
create index if not exists liquidations_requested_by_idx on public.liquidations (requested_by);
alter table public.liquidations enable row level security;

-- ── Guard ──────────────────────────────────────────────────────────────────
create or replace function public.liquidations_guard()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_user text := public.app_username();
  v_me text;
  v_fin boolean := public.has_role('Manager','Finance','FinanceAssistant');
  v_rpc boolean := coalesce(current_setting('fabhub.run_approve', true), '') = 'on';
  v_total numeric := 0;
  v_n int := 0;
  ln jsonb;
  v_content_changed boolean;
begin
  if coalesce(current_setting('request.jwt.claims', true), '') = '' then return new; end if;
  -- BEFORE INSERT also fires on an upsert of an existing row: let the UPDATE branch decide.
  if tg_op = 'INSERT' and exists (select 1 from public.liquidations where id = new.id) then return new; end if;
  select p.name into v_me from public.user_profiles p where p.username = v_user limit 1;
  v_me := coalesce(nullif(v_me, ''), v_user);
  new.updated_at := now();

  -- lines: validate and total (insert, and content edits)
  if tg_op = 'INSERT' or new.items is distinct from old.items then
    if jsonb_typeof(new.items) <> 'array' or jsonb_array_length(new.items) = 0 then
      raise exception 'Add at least one receipt line.' using errcode = '22023';
    end if;
    for ln in select * from jsonb_array_elements(new.items) loop
      v_n := v_n + 1;
      if coalesce((ln->>'amount')::numeric, 0) <= 0 then
        raise exception 'Line %: enter an amount above zero.', v_n using errcode = '22023';
      end if;
      if length(btrim(coalesce(ln->>'description', ''))) < 3 then
        raise exception 'Line %: say what it was for.', v_n using errcode = '22023';
      end if;
      if length(btrim(coalesce(ln->>'receipt_path', ''))) = 0 and length(btrim(coalesce(ln->>'no_receipt', ''))) < 3 then
        raise exception 'Line %: attach the receipt, or say why there is none.', v_n using errcode = '22023';
      end if;
      v_total := v_total + (ln->>'amount')::numeric;
    end loop;
    new.amount := round(v_total, 2);
  elsif tg_op = 'UPDATE' then
    new.amount := old.amount;
  end if;

  if tg_op = 'INSERT' then
    if length(btrim(new.purpose)) < 3 then raise exception 'Say what the money was for.' using errcode = '22023'; end if;
    if length(btrim(new.payee)) < 2 then new.payee := v_me; end if;
    if new.project_id is null and length(btrim(new.charge_to)) < 2 then
      raise exception 'Pick the project, or what it is charged to (OPEX, Admin…).' using errcode = '22023';
    end if;
    new.status := 'Submitted';
    new.liq_no := 'LQ-' || to_char(now() at time zone 'Asia/Manila', 'YYYY') || '-' || lpad(nextval('public.liquidations_no_seq')::text, 4, '0');
    new.requested_by := v_user; new.requester_name := v_me;
    new.created_at := now();
    new.checked_by := null; new.checked_at := null; new.return_reason := null;
    new.approved_by := null; new.approved_at := null; new.run_id := null;
    new.paid_by := null; new.paid_at := null; new.paid_date := null; new.paid_ref := null; new.paid_bank := null; new.cash_key := null;
    new.cancel_reason := null; new.cancelled_by := null; new.cancelled_at := null;
    return new;
  end if;

  -- UPDATE: server-kept fields
  new.liq_no := old.liq_no; new.requested_by := old.requested_by; new.requester_name := old.requester_name;
  new.created_at := old.created_at;
  new.checked_by := old.checked_by; new.checked_at := old.checked_at;
  new.approved_by := old.approved_by; new.approved_at := old.approved_at;
  new.paid_by := old.paid_by; new.paid_at := old.paid_at;
  new.cancelled_by := old.cancelled_by; new.cancelled_at := old.cancelled_at;
  if not v_rpc then new.run_id := old.run_id; end if;
  if new.status = old.status then
    new.return_reason := old.return_reason; new.cancel_reason := old.cancel_reason;
    new.paid_date := old.paid_date; new.paid_ref := old.paid_ref; new.paid_bank := old.paid_bank; new.cash_key := old.cash_key;
  end if;

  if old.status in ('Paid','Cancelled') then
    if row(new.*) is distinct from row(old.*) and (new.status, new.items, new.payee, new.purpose, new.project_id, new.charge_to)
         is distinct from (old.status, old.items, old.payee, old.purpose, old.project_id, old.charge_to) then
      raise exception 'Liquidation % is % and can no longer change.', old.liq_no, old.status using errcode = '42501';
    end if;
    return old;
  end if;

  v_content_changed := (new.items, new.payee, new.purpose, new.project_id, new.charge_to)
                       is distinct from (old.items, old.payee, old.purpose, old.project_id, old.charge_to);
  if v_content_changed then
    if old.status not in ('Submitted','Returned') then
      raise exception 'Liquidation % is % — Return it first to change its lines.', old.liq_no, old.status using errcode = '42501';
    end if;
    if old.requested_by <> v_user and not v_fin then
      raise exception 'Only whoever submitted it, or Finance, can change it.' using errcode = '42501';
    end if;
    if length(btrim(new.purpose)) < 3 then raise exception 'Say what the money was for.' using errcode = '22023'; end if;
    if length(btrim(new.payee)) < 2 then raise exception 'Who gets the refill?' using errcode = '22023'; end if;
    if new.project_id is null and length(btrim(new.charge_to)) < 2 then
      raise exception 'Pick the project, or what it is charged to (OPEX, Admin…).' using errcode = '22023';
    end if;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'Submitted' and old.status = 'Returned' then
      if old.requested_by <> v_user and not v_fin then
        raise exception 'Only whoever submitted it, or Finance, can resubmit it.' using errcode = '42501';
      end if;
      new.return_reason := old.return_reason;
    elsif new.status = 'Checked' and old.status = 'Submitted' then
      if not v_fin then raise exception 'Finance checks liquidations.' using errcode = '42501'; end if;
      if lower(old.requested_by) = lower(v_user) or lower(btrim(new.payee)) = lower(btrim(v_me)) then
        raise exception 'You can''t check your own liquidation.' using errcode = '42501';
      end if;
      new.checked_by := v_me; new.checked_at := now(); new.return_reason := null;
    elsif new.status = 'Returned' and old.status in ('Submitted','Checked') then
      if not v_fin then raise exception 'Finance returns liquidations.' using errcode = '42501'; end if;
      if length(btrim(coalesce(new.return_reason, ''))) < 5 then
        raise exception 'Say what needs fixing (at least 5 characters).' using errcode = '22023';
      end if;
      new.checked_by := null; new.checked_at := null;
    elsif new.status = 'Approved' and old.status = 'Checked' and v_rpc then
      new.approved_by := v_me; new.approved_at := now();
    elsif new.status = 'Checked' and old.status = 'Approved' and v_rpc then
      new.approved_by := null; new.approved_at := null; new.run_id := null;  -- its run was cancelled
    elsif new.status = 'Paid' and old.status = 'Approved' then
      if not v_fin then raise exception 'Finance records the refill.' using errcode = '42501'; end if;
      if new.paid_date is null then raise exception 'Enter the date it was paid.' using errcode = '22023'; end if;
      if length(btrim(coalesce(new.paid_ref, ''))) < 3 and length(btrim(coalesce(new.cash_key, ''))) = 0 then
        raise exception 'Enter the check / transfer reference.' using errcode = '22023';
      end if;
      new.paid_by := v_me; new.paid_at := now();
    elsif new.status = 'Cancelled' and old.status in ('Submitted','Returned','Checked') then
      if length(btrim(coalesce(new.cancel_reason, ''))) < 5 then
        raise exception 'Give a reason for cancelling (at least 5 characters).' using errcode = '22023';
      end if;
      if not public.is_mgr() and not (old.requested_by = v_user and old.status in ('Submitted','Returned')) then
        raise exception 'Only a Manager, or whoever submitted it (before it is checked), can cancel it.' using errcode = '42501';
      end if;
      new.cancelled_by := v_me; new.cancelled_at := now();
    else
      raise exception 'A liquidation can''t go from % to %.', old.status, new.status using errcode = '42501';
    end if;
  end if;
  return new;
end $function$;

create or replace trigger trg_liquidations_guard
  before insert or update on public.liquidations
  for each row execute function public.liquidations_guard();

-- ── Audit: every insert and change ─────────────────────────────────────────
create or replace function public.liquidations_audit()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
begin
  if tg_op = 'UPDATE' and row(new.*) is not distinct from row(old.*) then return null; end if;
  insert into public.audit_log (table_name, record_id, action, old_snapshot, snapshot, performed_by, reason)
  values ('liquidations', new.id::text,
          case when tg_op = 'INSERT' then 'insert'
               when new.status is distinct from old.status then 'status:' || new.status
               else 'update' end,
          case when tg_op = 'UPDATE' then to_jsonb(old) end, to_jsonb(new),
          nullif(public.app_username(), ''),
          case when tg_op = 'UPDATE' and new.status is distinct from old.status
               then coalesce(nullif(new.return_reason, ''), nullif(new.cancel_reason, '')) end);
  return null;
end $function$;

create or replace trigger trg_liquidations_audit
  after insert or update on public.liquidations
  for each row execute function public.liquidations_audit();

revoke execute on function public.liquidations_guard() from public, anon, authenticated;
revoke execute on function public.liquidations_audit() from public, anon, authenticated;

do $p$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='liquidations' and policyname='liquidations_sel') then
    create policy liquidations_sel on public.liquidations for select to authenticated
      using (requested_by = public.app_username() or public.has_role('Manager','Finance','FinanceAssistant','Accounting'));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='liquidations' and policyname='liquidations_ins') then
    create policy liquidations_ins on public.liquidations for insert to authenticated
      with check (public.app_role() <> '' and public.app_username() <> '');
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='liquidations' and policyname='liquidations_upd') then
    create policy liquidations_upd on public.liquidations for update to authenticated
      using (requested_by = public.app_username() or public.has_role('Manager','Finance','FinanceAssistant'))
      with check (requested_by = public.app_username() or public.has_role('Manager','Finance','FinanceAssistant'));
  end if;
end $p$;
grant select, insert, update on public.liquidations to authenticated;
revoke all on public.liquidations from anon;
grant usage on sequence public.liquidations_no_seq to authenticated;

-- ── Payment run: approve liquidations with the run ─────────────────────────
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
  l public.liquidations;
  n_approved int := 0;
  n_liq int := 0;
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
  perform set_config('fabhub.run_approve', 'on', true);
  for it in select * from jsonb_array_elements(r.items) loop
    if it ? 'liquidationId' then
      select * into l from public.liquidations where id = (it->>'liquidationId')::uuid for update;
      if not found then raise exception 'A liquidation in this run no longer exists. Send the run back and update it.'; end if;
      if l.status <> 'Checked' then
        raise exception 'Liquidation % is % — only Checked liquidations can be approved. Send the run back.', l.liq_no, l.status using errcode = '42501';
      end if;
      if abs(coalesce((it->>'amount')::numeric, 0) - l.amount) > 0.005 then
        raise exception 'Liquidation % changed (now %). Send the run back and update it.', l.liq_no, l.amount using errcode = '22023';
      end if;
      update public.liquidations set status = 'Approved', run_id = p_id where id = l.id;
      n_liq := n_liq + 1;
    else
      select * into b from public.payables where id = it->>'payableId';
      if not found then raise exception 'A bill in this run no longer exists (%). Send the run back and update it.', it->>'payableId'; end if;
      if coalesce(nullif(b.approval_status, ''), 'Approved') = 'Pending' then
        -- the payables trigger checks self-approval and subcon certification
        update public.payables set approval_status = 'Approved' where id = b.id;
        n_approved := n_approved + 1;
      elsif b.approval_status = 'Rejected' then
        raise exception 'Bill % was rejected. Take it out of the run first.', coalesce(nullif(b.ap_number, ''), b.id);
      end if;
    end if;
  end loop;
  update public.payment_runs set status = 'Approved' where id = p_id;
  perform set_config('fabhub.run_approve', '', true);
  return jsonb_build_object('approved_bills', n_approved, 'approved_liquidations', n_liq, 'items', jsonb_array_length(r.items));
end $function$;
revoke execute on function public.approve_payment_run(uuid) from public, anon;
grant execute on function public.approve_payment_run(uuid) to authenticated;

-- A cancelled approved run hands its liquidations back to Checked.
create or replace function public.payment_runs_release_liquidations()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
begin
  if new.status = 'Cancelled' and old.status = 'Approved' then
    perform set_config('fabhub.run_approve', 'on', true);
    update public.liquidations set status = 'Checked' where run_id = new.id and status = 'Approved';
    perform set_config('fabhub.run_approve', '', true);
  end if;
  return null;
end $function$;
create or replace trigger trg_payment_runs_release_liquidations
  after update of status on public.payment_runs
  for each row execute function public.payment_runs_release_liquidations();
revoke execute on function public.payment_runs_release_liquidations() from public, anon, authenticated;

-- ── Monday Telegram board: the run is paid on Friday now ───────────────────
-- monitoring_board_alert() (20261105043929) looked for Thursday's run. Patch only
-- the release day and its wording, in place, so the rest of the function stays
-- exactly as it is in production; refuse if the text isn't what we expect.
-- Mirrors runFriday() (src/views/PaymentRun.jsx), used by the Monitoring Board.
do $m$
declare src text;
begin
  src := pg_get_functiondef('public.monitoring_board_alert(boolean)'::regprocedure);
  if position('(date_trunc(''week'', d)::date) + 4;' in src) > 0 then
    return;  -- already Friday
  end if;
  if position('thu := (date_trunc(''week'', d)::date) + 3;' in src) = 0
     or position(''' Payment run (Thu ''' in src) = 0 then
    raise exception 'monitoring_board_alert() is not the 20261105043929 version; update it by hand.';
  end if;
  src := replace(src, 'thu := (date_trunc(''week'', d)::date) + 3;', 'thu := (date_trunc(''week'', d)::date) + 4;  -- Friday release (20261114050000)');
  src := replace(src, ''' Payment run (Thu ''', ''' Payment run (Fri ''');
  src := replace(src, 'Awaiting approval, due by Thursday', 'Awaiting approval, due by Friday');
  execute src;
end $m$;

-- ROLLBACK (keeps the data; switches the feature off):
--   revoke all on public.liquidations from authenticated;
--   alter table public.payment_runs disable trigger trg_payment_runs_release_liquidations;
--   Re-run approve_payment_run from 20261105042842_payment_runs_and_2307.sql
--   (a run holding liquidation items then fails to approve: remove them first).
--   Thursday again in monitoring_board_alert(): the same do-block with + 4 -> + 3,
--   'Fri ' -> 'Thu ' and Friday -> Thursday.
