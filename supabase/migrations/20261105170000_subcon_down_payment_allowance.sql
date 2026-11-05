-- Subcon down payment allowance (decided by Paulo, 2026-11-05).
--
-- Most Work Orders are "50% start / 50% completion", but a subcon bill could
-- only be approved or paid after the PM certified work done (> 0%), so a
-- down payment needed the PM to certify work that hadn't started. Since the
-- certification rule (2026-10-27) no subcon payment had gone through FabHub.
--
-- Now a Work Order carries dp_pct (down payment %). Before any certification,
-- its bills can be approved and paid up to dp_pct x contract, but only while
-- the WO is Issued / In Progress / Completed: issuing already needs a Manager
-- or the Procurement Manager (swo_require_approver) and the client's down
-- payment (swo_require_dp). The cap stays cumulative per WO:
--     allowed = greatest(certified %, down payment %) x WO contract
-- so the down payment is recouped automatically: nothing more is paid until
-- the PM certifies past it. Retention release still needs 100% certified.
--
-- * Non-Managers may set dp_pct up to 50%, and only before the WO is issued
--   and before it has a payment. Any other change by a non-Manager is
--   silently kept at the old value (stale full-row saves still work) and
--   logged to audit_log ('blocked'); every accepted change is logged too.
-- * dp_pct is backfilled from the free-text payment terms
--   ("50% Start/50% Completion" -> 50, "30% DOWNPAYMENT ..." -> 30).
--
-- Mirrors src/App.jsx (subconAllowPct: approvePayable / recordPayments, the WO
-- form), src/views/SubconPaymentMonitor.jsx and SubconCertView.jsx — keep in sync.
-- Idempotent; no DROP (Supabase MCP hangs on DROP).

alter table public.subcon_work_orders add column if not exists dp_pct numeric not null default 0;

-- Backfill from the payment terms text (only rows still at 0).
update public.subcon_work_orders w
   set dp_pct = least(100, (m.v)::numeric)
  from (select id, (regexp_match(coalesce(payment_structure,'') || ' ' || coalesce(payment_terms,''),
                     '(\d{1,3})\s*%\s*(start|down|dp|mobili|advance|upon)', 'i'))[1] as v
          from public.subcon_work_orders) m
 where m.id = w.id and m.v is not null and coalesce(w.dp_pct,0) = 0;

-- The down payment % a WO's bills may draw on now (0 unless the WO is issued).
create or replace function public.subcon_dp_allow_pct(p_wo text)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce((select w.dp_pct from public.subcon_work_orders w
                    where coalesce(p_wo,'') <> '' and w.wo_number = p_wo
                      and coalesce(w.status,'') in ('Issued','In Progress','Completed')
                    order by w.created_at limit 1), 0)
$$;
revoke execute on function public.subcon_dp_allow_pct(text) from public, anon, authenticated;

-- ── who may set the down payment % ────────────────────────────────────────────
create or replace function public.swo_dp_pct_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_paid boolean; v_issued text[] := array['Issued','In Progress','Completed'];
begin
  if new.dp_pct is null then new.dp_pct := 0; end if;
  if new.dp_pct < 0 or new.dp_pct > 100 then
    raise exception 'Down payment %% must be between 0 and 100' using errcode = '22023';
  end if;
  if coalesce(current_setting('request.jwt.claims', true), '') = '' then return new; end if;   -- migrations / server
  if tg_op = 'INSERT' then
    if new.dp_pct > 50 and not public.is_mgr() then
      raise exception 'A subcontractor down payment above 50%% needs a Manager' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.dp_pct is not distinct from old.dp_pct then return new; end if;
  if not public.is_mgr() then
    select exists (select 1 from public.payable_payments x join public.payables b on b.id = x.payable_id
                    where b.po_number = old.wo_number and public.is_subcon_payable(b.category, b.account_code)
                      and x.status = 'Active') into v_paid;
    if new.dp_pct > 50 or coalesce(old.status,'') = any(v_issued) or v_paid then
      insert into public.audit_log (table_name, record_id, action, old_snapshot, snapshot, changed_fields, performed_by, reason)
      values ('subcon_work_orders', old.id::text, 'blocked', jsonb_build_object('dp_pct', old.dp_pct),
              jsonb_build_object('dp_pct', new.dp_pct), array['dp_pct'], public.app_username(),
              'Down payment % change kept: over 50%, WO already issued, or already paid (Manager only)');
      new.dp_pct := old.dp_pct;
      return new;
    end if;
  end if;
  insert into public.audit_log (table_name, record_id, action, old_snapshot, snapshot, changed_fields, performed_by, reason)
  values ('subcon_work_orders', old.id::text, 'update', jsonb_build_object('dp_pct', old.dp_pct),
          jsonb_build_object('dp_pct', new.dp_pct), array['dp_pct'], nullif(public.app_username(), ''), 'Down payment % change');
  return new;
end $$;
revoke execute on function public.swo_dp_pct_guard() from public, anon, authenticated;
create or replace trigger trg_swo_dp_pct_guard
  before insert or update on public.subcon_work_orders
  for each row execute function public.swo_dp_pct_guard();

-- ── approval: certified, or within the WO's down payment ─────────────────────
create or replace function public.payables_subcon_cert_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_rpc boolean := coalesce(current_setting('fabhub.subcon_cert', true), '') = 'on';
        c record; v_dp numeric; v_contract numeric; v_billed numeric;
begin
  if tg_op = 'UPDATE' and public.is_subcon_payable(old.category, old.account_code)
     and not public.is_subcon_payable(new.category, new.account_code) and not public.is_mgr() then
    new.category := old.category; new.account_code := old.account_code;   -- can't dodge the gate by recategorising
  end if;
  if not public.is_subcon_payable(new.category, new.account_code) then return new; end if;
  if not v_rpc then
    if tg_op = 'INSERT' then
      new.verified := false; new.verification_pct := 0; new.verified_by := null; new.verified_at := null;
      -- A new progress billing on a WO carries the WO's current certification.
      if public.subcon_wo_contract(new.po_number) is not null then
        select x.verification_pct, x.verified_by, x.verified_at into c
          from public.payables x
         where x.id <> new.id and x.po_number = new.po_number
           and public.is_subcon_payable(x.category, x.account_code)
           and coalesce(x.verified,false) and coalesce(x.verified_by,'') <> '' and coalesce(x.verification_pct,0) > 0
         order by x.verification_pct desc, x.verified_at desc nulls last limit 1;
        if found then
          new.verified := true; new.verification_pct := c.verification_pct;
          new.verified_by := c.verified_by; new.verified_at := c.verified_at;
        end if;
      end if;
    else
      new.verified := old.verified; new.verification_pct := old.verification_pct;
      new.verified_by := old.verified_by; new.verified_at := old.verified_at;
    end if;
  end if;
  if new.approval_status = 'Approved'
     and (tg_op = 'INSERT' or old.approval_status is distinct from 'Approved')
     and not (coalesce(new.verified,false) and coalesce(new.verified_by,'') <> '' and coalesce(new.verification_pct,0) > 0) then
    -- Not certified: approvable only as the WO's down payment.
    v_dp := public.subcon_dp_allow_pct(new.po_number);
    v_contract := coalesce(public.subcon_wo_contract(new.po_number), 0);
    -- Other bills of the WO already approved (paid ones are approved too).
    select coalesce(sum(coalesce(x.amount,0)),0) into v_billed
      from public.payables x
     where x.id <> new.id and x.po_number = new.po_number
       and public.is_subcon_payable(x.category, x.account_code)
       and coalesce(x.status,'') not in ('Cancelled','Void')
       and coalesce(x.approval_status,'') = 'Approved';
    if not (v_dp > 0 and v_contract > 0 and v_billed + coalesce(new.amount,0) <= v_dp / 100 * v_contract + 1) then
      raise exception 'Subcontractor billing % must be certified by the project PM or Operations before it can be approved for payment%',
        coalesce(nullif(new.ap_number,''), new.po_number, new.id),
        case when v_dp > 0 then format(' (the WO''s %s%% down payment covers only ₱%s)', v_dp, to_char(v_dp / 100 * v_contract, 'FM999,999,990.00')) else '' end
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.payables_subcon_cert_guard() from public, anon, authenticated;

-- ── payment cap: greatest(certified %, down payment %) x WO contract ─────────
create or replace function public.payable_payments_subcon_gate()
returns trigger language plpgsql security definer set search_path = public as $$
declare p public.payables; v_cap numeric; v_claimed numeric; v_cert numeric; v_dp numeric; v_allow numeric; v_wo numeric;
begin
  if coalesce(new.status,'Active') <> 'Active' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'Active' and old.amount = new.amount
     and old.retention_amount is not distinct from new.retention_amount and old.kind is not distinct from new.kind then
    return new;   -- not a new or bigger claim
  end if;
  select * into p from public.payables where id = new.payable_id;
  if not found or not public.is_subcon_payable(p.category, p.account_code) then return new; end if;
  v_cert := case when coalesce(p.verified,false) and coalesce(p.verified_by,'') <> '' then coalesce(p.verification_pct,0) else 0 end;
  v_wo := public.subcon_wo_contract(p.po_number);
  v_dp := case when v_wo is not null and v_wo > 0 then public.subcon_dp_allow_pct(p.po_number) else 0 end;
  if new.kind = 'Retention release' then
    if v_cert < 100 then
      raise exception 'Retention is released only when the PM certifies 100%% (now %)', v_cert || '%' using errcode = '42501';
    end if;
    return new;
  end if;
  if v_cert <= 0 and v_dp <= 0 then
    raise exception 'No payment: subcontractor billing % is not certified by the project PM or Operations yet, and its Work Order has no down payment allowed (set on the WO, and the WO must be issued)',
      coalesce(nullif(p.ap_number,''), p.po_number, p.id) using errcode = '42501';
  end if;
  v_allow := greatest(v_cert, v_dp);
  if v_wo is not null and v_wo > 0 then
    -- Work Order: the cap covers every progress billing on it.
    perform pg_advisory_xact_lock(hashtext('subcon_wo_billing:' || p.po_number));
    v_cap := round(v_allow / 100 * v_wo, 2);
    select coalesce(sum(coalesce(x.amount,0) + coalesce(x.retention_amount,0)), 0) into v_claimed
      from public.payable_payments x join public.payables b on b.id = x.payable_id
     where b.po_number = p.po_number and public.is_subcon_payable(b.category, b.account_code)
       and x.status = 'Active' and coalesce(x.kind,'Payment') <> 'Retention release' and x.id <> new.id;
  else
    v_cap := round(v_allow / 100 * public.subcon_cap_base(p), 2);
    select coalesce(sum(coalesce(x.amount,0) + coalesce(x.retention_amount,0)), 0) into v_claimed
      from public.payable_payments x
     where x.payable_id = p.id and x.status = 'Active' and coalesce(x.kind,'Payment') <> 'Retention release' and x.id <> new.id;
  end if;
  v_claimed := v_claimed + coalesce(new.amount,0) + coalesce(new.retention_amount,0);
  if v_claimed > v_cap + 1 then
    raise exception 'No payment: this brings % to ₱% claimed, but only % is allowed (₱%: PM certified %, down payment %). Ask the PM to certify more work first.',
      coalesce(nullif(p.po_number,''), nullif(p.ap_number,''), p.id), round(v_claimed,2), v_allow || '%', v_cap,
      v_cert || '%', v_dp || '%' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.payable_payments_subcon_gate() from public, anon, authenticated;

-- ROLLBACK
-- Re-run payables_subcon_cert_guard / payable_payments_subcon_gate from
-- 20261105160000_subcon_billing_per_progress_claim.sql, then:
-- drop trigger if exists trg_swo_dp_pct_guard on public.subcon_work_orders;
-- drop function if exists public.swo_dp_pct_guard();
-- drop function if exists public.subcon_dp_allow_pct(text);
-- alter table public.subcon_work_orders drop column if exists dp_pct;   -- loses the % set per WO
