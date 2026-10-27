-- Subcontractor billing needs PM / Operations certification (decided by Paulo,
-- 2026-10-27: "no approval, no billing; no billing, no payment").
--
-- A Work Order raises ONE subcontractor payable for the whole contract; each
-- progress billing is a partial payment against it. So the PM certifies the
-- CUMULATIVE % of work actually done, and the database lets Finance pay only
-- up to that % of the contract:
--
-- * certify_subcon_billing(payable, pct, note): only the Operations role, a
--   Manager, or a PM named on that project's card (project_cards.pm1-3) —
--   never Finance or Procurement. A note (what was inspected) is required.
--   Lowering an earlier % is Manager-only. Every certification and dispute is
--   a row in subcon_billing_certs, kept forever.
-- * payables: the verified / verified_by / verified_at / verification_pct
--   columns of a subcon payable change only through that RPC (any other write
--   keeps the old values, so a stale full-row save still works). A subcon
--   payable can't be Approved for payment until it is certified.
-- * payable_payments: a subcon payment is refused unless the payable is
--   certified and the gross claimed (cash + retention held) stays within
--   certified % x the Work Order contract (or the payable amount when there is
--   no Work Order). A retention release needs 100%.
--
-- Before this, "verified" was a Finance-side flag that the database never
-- checked (12 of 25 subcon payables "verified", 1 with a name, none by a PM).
-- All 25 were Paid when this was applied, so no payment in progress is blocked.
--
-- Mirrors src/App.jsx (recordPayments / approvePayable / verifyPayable) and
-- src/views/SubconCertView.jsx — keep them in sync.
-- Idempotent; no DROP (Supabase MCP hangs on DROP).

create table if not exists public.subcon_billing_certs (
  id         bigint generated always as identity primary key,
  payable_id text not null references public.payables(id) on delete cascade,
  wo_number  text not null default '',
  action     text not null,
  pct        numeric,
  prev_pct   numeric,
  note       text not null default '',
  by_user    text not null,
  by_name    text not null default '',
  at         timestamptz not null default now(),
  constraint subcon_billing_certs_action_chk check (action in ('Certified','Disputed'))
);
create index if not exists subcon_billing_certs_payable_idx on public.subcon_billing_certs(payable_id);
alter table public.subcon_billing_certs enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='subcon_billing_certs' and policyname='subcon_billing_certs_sel') then
    create policy subcon_billing_certs_sel on public.subcon_billing_certs for select to authenticated
      using (public.has_role('Manager','Finance','Accounting','FinanceAssistant','Procurement','ProjectMover','SalesOpsAdmin'));
  end if;
end $$;
revoke all on public.subcon_billing_certs from anon;
revoke insert, update, delete, truncate on public.subcon_billing_certs from authenticated;

-- Same test as isSubconPayable in src/core.js.
create or replace function public.is_subcon_payable(p_category text, p_account text)
returns boolean language sql immutable set search_path = public as $$
  select coalesce(p_category,'') = 'Subcontractor' or coalesce(p_account,'') in ('5070','5100','5200')
$$;

-- The Work Order contract a subcon payable is capped against.
create or replace function public.subcon_cap_base(p public.payables)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce((select w.contract_amount from public.subcon_work_orders w
                    where w.wo_number = p.po_number and coalesce(p.po_number,'') <> '' and coalesce(w.contract_amount,0) > 0
                    limit 1), p.amount, 0)
$$;
revoke execute on function public.subcon_cap_base(public.payables) from public, anon, authenticated;

-- Who may certify: Operations, a Manager, or a PM named on the project card.
create or replace function public.subcon_can_certify(p_project text)
returns boolean language sql stable security definer set search_path = public as $$
  select me.o_role in ('Manager','Operations')
      or (public.has_role('ProjectMover')
          and p_project ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          and public.prf_is_project_pm(p_project::uuid, me.o_name))
    from public.prf_me() me
$$;
revoke execute on function public.subcon_can_certify(text) from public, anon, authenticated;

-- ── guard on payables ─────────────────────────────────────────────────────────
create or replace function public.payables_subcon_cert_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_rpc boolean := coalesce(current_setting('fabhub.subcon_cert', true), '') = 'on';
begin
  if tg_op = 'UPDATE' and public.is_subcon_payable(old.category, old.account_code)
     and not public.is_subcon_payable(new.category, new.account_code) and not public.is_mgr() then
    new.category := old.category; new.account_code := old.account_code;   -- can't dodge the gate by recategorising
  end if;
  if not public.is_subcon_payable(new.category, new.account_code) then return new; end if;
  if not v_rpc then
    if tg_op = 'INSERT' then
      new.verified := false; new.verification_pct := 0; new.verified_by := null; new.verified_at := null;
    else
      new.verified := old.verified; new.verification_pct := old.verification_pct;
      new.verified_by := old.verified_by; new.verified_at := old.verified_at;
    end if;
  end if;
  if new.approval_status = 'Approved'
     and (tg_op = 'INSERT' or old.approval_status is distinct from 'Approved')
     and not (coalesce(new.verified,false) and coalesce(new.verified_by,'') <> '' and coalesce(new.verification_pct,0) > 0) then
    raise exception 'Subcontractor billing % must be certified by the project PM or Operations before it can be approved for payment',
      coalesce(nullif(new.ap_number,''), new.po_number, new.id) using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.payables_subcon_cert_guard() from public, anon, authenticated;
create or replace trigger trg_payables_subcon_cert_guard
  before insert or update on public.payables
  for each row execute function public.payables_subcon_cert_guard();

-- ── gate on payments ──────────────────────────────────────────────────────────
create or replace function public.payable_payments_subcon_gate()
returns trigger language plpgsql security definer set search_path = public as $$
declare p public.payables; v_cap numeric; v_claimed numeric; v_pct numeric;
begin
  if coalesce(new.status,'Active') <> 'Active' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'Active' and old.amount = new.amount
     and old.retention_amount is not distinct from new.retention_amount and old.kind is not distinct from new.kind then
    return new;   -- not a new or bigger claim
  end if;
  select * into p from public.payables where id = new.payable_id;
  if not found or not public.is_subcon_payable(p.category, p.account_code) then return new; end if;
  v_pct := coalesce(p.verification_pct, 0);
  if not (coalesce(p.verified,false) and coalesce(p.verified_by,'') <> '' and v_pct > 0) then
    raise exception 'No payment: subcontractor billing % is not certified by the project PM or Operations yet',
      coalesce(nullif(p.ap_number,''), p.po_number, p.id) using errcode = '42501';
  end if;
  if new.kind = 'Retention release' then
    if v_pct < 100 then
      raise exception 'Retention is released only when the PM certifies 100%% (now %)', v_pct || '%' using errcode = '42501';
    end if;
    return new;
  end if;
  v_cap := round(v_pct / 100 * public.subcon_cap_base(p), 2);
  select coalesce(sum(coalesce(x.amount,0) + coalesce(x.retention_amount,0)), 0) into v_claimed
    from public.payable_payments x
   where x.payable_id = p.id and x.status = 'Active' and coalesce(x.kind,'Payment') <> 'Retention release' and x.id <> new.id;
  v_claimed := v_claimed + coalesce(new.amount,0) + coalesce(new.retention_amount,0);
  if v_claimed > v_cap + 1 then
    raise exception 'No payment: this brings % to ₱% claimed, but the PM certified only % (₱%). Ask the PM to certify more work first.',
      coalesce(nullif(p.ap_number,''), p.po_number, p.id), round(v_claimed,2), v_pct || '%', v_cap using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.payable_payments_subcon_gate() from public, anon, authenticated;
create or replace trigger trg_payable_payments_subcon_gate
  before insert or update on public.payable_payments
  for each row execute function public.payable_payments_subcon_gate();

-- ── certify / dispute ─────────────────────────────────────────────────────────
create or replace function public.certify_subcon_billing(p_payable text, p_pct numeric, p_note text)
returns numeric language plpgsql security definer set search_path = public as $$
declare me record; p public.payables; v_prev numeric;
begin
  select * into me from public.prf_me();
  select * into p from public.payables where id = p_payable for update;
  if not found then raise exception 'Billing not found' using errcode = 'P0002'; end if;
  if not public.is_subcon_payable(p.category, p.account_code) then
    raise exception 'This is not a subcontractor billing' using errcode = '22023';
  end if;
  if not public.subcon_can_certify(p.project_id) then
    raise exception 'Only a PM of this project, Operations or a Manager certifies subcontractor work' using errcode = '42501';
  end if;
  if p_pct is null or p_pct <= 0 or p_pct > 100 then
    raise exception 'Enter the %% of work done, above 0 and up to 100' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_note,''))) < 5 then
    raise exception 'Say what you inspected (at least 5 characters)' using errcode = '22023';
  end if;
  v_prev := coalesce(p.verification_pct, 0);
  if p_pct < v_prev and me.o_role <> 'Manager' then
    raise exception 'Already certified at %; only a Manager can lower it', v_prev || '%' using errcode = '42501';
  end if;
  perform set_config('fabhub.subcon_cert', 'on', true);
  update public.payables set verified = true, verification_pct = p_pct, verified_by = me.o_name,
         verified_at = (now() at time zone 'Asia/Manila')::date, updated_at = now()
   where id = p.id;
  perform set_config('fabhub.subcon_cert', 'off', true);
  insert into public.subcon_billing_certs(payable_id, wo_number, action, pct, prev_pct, note, by_user, by_name)
  values (p.id, coalesce(p.po_number,''), 'Certified', p_pct, v_prev, btrim(p_note), coalesce(me.o_user,'?'), coalesce(me.o_name,''));
  return p_pct;
end $$;

create or replace function public.dispute_subcon_billing(p_payable text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare me record; p public.payables;
begin
  select * into me from public.prf_me();
  select * into p from public.payables where id = p_payable;
  if not found then raise exception 'Billing not found' using errcode = 'P0002'; end if;
  if not public.is_subcon_payable(p.category, p.account_code) then
    raise exception 'This is not a subcontractor billing' using errcode = '22023';
  end if;
  if not public.subcon_can_certify(p.project_id) then
    raise exception 'Only a PM of this project, Operations or a Manager can dispute subcontractor work' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_reason,''))) < 5 then
    raise exception 'Give the reason (at least 5 characters)' using errcode = '22023';
  end if;
  insert into public.subcon_billing_certs(payable_id, wo_number, action, pct, prev_pct, note, by_user, by_name)
  values (p.id, coalesce(p.po_number,''), 'Disputed', null, coalesce(p.verification_pct,0), btrim(p_reason), coalesce(me.o_user,'?'), coalesce(me.o_name,''));
end $$;

-- The certification queue: subcon billings on the caller's projects (every
-- project for Operations / Managers). PMs can't read payables directly.
create or replace function public.list_subcon_billings()
returns table(id text, ap_number text, vendor text, project_id text, wo_number text, scope text,
              contract numeric, amount numeric, claimed numeric, paid numeric, retention_held numeric,
              status text, approval_status text, verified boolean, verification_pct numeric,
              verified_by text, verified_at date, created_at timestamptz, last_note text, last_action text)
language sql stable security definer set search_path = public as $$
  select p.id, p.ap_number, p.vendor, p.project_id, p.po_number,
         (select w.scope_of_work from public.subcon_work_orders w where w.wo_number = p.po_number limit 1),
         public.subcon_cap_base(p), p.amount,
         coalesce((select sum(coalesce(x.amount,0)+coalesce(x.retention_amount,0)) from public.payable_payments x
                    where x.payable_id = p.id and x.status = 'Active' and coalesce(x.kind,'Payment') <> 'Retention release'),0),
         coalesce(p.paid_amount,0), coalesce(p.retention_held,0),
         p.status, p.approval_status, p.verified, p.verification_pct, p.verified_by, p.verified_at, p.created_at,
         (select c.note from public.subcon_billing_certs c where c.payable_id = p.id order by c.at desc limit 1),
         (select c.action from public.subcon_billing_certs c where c.payable_id = p.id order by c.at desc limit 1)
    from public.payables p
   where public.is_subcon_payable(p.category, p.account_code)
     and public.subcon_can_certify(p.project_id)
   order by (coalesce(p.status,'') = 'Paid'), p.created_at desc
   limit 300
$$;

revoke execute on function public.certify_subcon_billing(text, numeric, text) from public, anon;
revoke execute on function public.dispute_subcon_billing(text, text)          from public, anon;
revoke execute on function public.list_subcon_billings()                     from public, anon;
grant  execute on function public.certify_subcon_billing(text, numeric, text) to authenticated;
grant  execute on function public.dispute_subcon_billing(text, text)          to authenticated;
grant  execute on function public.list_subcon_billings()                     to authenticated;

-- ROLLBACK
-- drop trigger if exists trg_payable_payments_subcon_gate on public.payable_payments;
-- drop trigger if exists trg_payables_subcon_cert_guard on public.payables;
-- drop function if exists public.list_subcon_billings();
-- drop function if exists public.dispute_subcon_billing(text, text);
-- drop function if exists public.certify_subcon_billing(text, numeric, text);
-- drop function if exists public.payable_payments_subcon_gate();
-- drop function if exists public.payables_subcon_cert_guard();
-- drop function if exists public.subcon_can_certify(text);
-- drop function if exists public.subcon_cap_base(public.payables);
-- drop function if exists public.is_subcon_payable(text, text);
-- drop table if exists public.subcon_billing_certs;   -- only if no certification history must be kept
