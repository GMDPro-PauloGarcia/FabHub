-- Subcon billing: one bill per progress billing (decided by Paulo, 2026-11-05).
--
-- Before: a Work Order raised ONE contract-sized subcon payable when it was
-- issued, and each progress billing was a partial payment against it, so the
-- subcontractor's own billing / invoice number was never captured and the AP
-- duplicate check (same supplier + same invoice no.) couldn't see subcon bills.
--
-- Now: each subcontractor billing is its own payable (po_number = WO number,
-- invoice_number = the subcon's billing no.). The app no longer auto-creates a
-- contract-sized bill. The controls move from the bill to the Work Order:
--
-- * Certification is per Work Order. certify_subcon_billing(bill, pct, note)
--   stamps the cumulative % on EVERY subcon bill of that WO, and a new bill on
--   the WO inherits the WO's current certification. Lowering it stays
--   Manager-only (compared with the WO's highest certified %).
-- * Payment cap is per Work Order: gross claimed (cash + retention held) over
--   ALL subcon bills of the WO <= certified % x WO contract.
-- * Over-billing: the subcon bills on a WO can't add up to more than the WO
--   contract (+ PHP 1). Only a Manager can save past it (a variation should be
--   a change to the WO contract instead).
-- * A bill with no Work Order keeps the old per-bill rules.
--
-- Data on 2026-11-05: 25 subcon bills, one per WO, all Paid; no retention
-- held; no certification rows yet. Nothing in progress changes. The existing
-- approval rule (certified before Approved) and retention rule (100% before
-- release) are unchanged.
--
-- Mirrors src/App.jsx (recordPayments, savePayable), src/views/SubconCertView.jsx
-- and src/views/SubconPaymentMonitor.jsx — keep them in sync.
-- Idempotent; no DROP (Supabase MCP hangs on DROP).

-- The WO a subcon bill belongs to (null when po_number isn't a Work Order).
create or replace function public.subcon_wo_contract(p_wo text)
returns numeric language sql stable security definer set search_path = public as $$
  select w.contract_amount from public.subcon_work_orders w
   where coalesce(p_wo,'') <> '' and w.wo_number = p_wo
   order by w.created_at limit 1
$$;
revoke execute on function public.subcon_wo_contract(text) from public, anon, authenticated;

-- ── bills inherit the WO's certification ──────────────────────────────────────
create or replace function public.payables_subcon_cert_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_rpc boolean := coalesce(current_setting('fabhub.subcon_cert', true), '') = 'on';
        c record;
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
    raise exception 'Subcontractor billing % must be certified by the project PM or Operations before it can be approved for payment',
      coalesce(nullif(new.ap_number,''), new.po_number, new.id) using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.payables_subcon_cert_guard() from public, anon, authenticated;

-- ── no billing past the WO contract ───────────────────────────────────────────
create or replace function public.payables_subcon_overbill_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_contract numeric; v_billed numeric;
begin
  if not public.is_subcon_payable(new.category, new.account_code) then return new; end if;
  if coalesce(new.status,'') in ('Cancelled','Void') then return new; end if;
  v_contract := public.subcon_wo_contract(new.po_number);
  if v_contract is null or v_contract <= 0 then return new; end if;
  if tg_op = 'UPDATE' and old.po_number is not distinct from new.po_number
     and coalesce(new.amount,0) <= coalesce(old.amount,0)
     and public.is_subcon_payable(old.category, old.account_code) then
    return new;   -- unchanged or lowered: a stale save still works
  end if;
  perform pg_advisory_xact_lock(hashtext('subcon_wo_billing:' || new.po_number));
  select coalesce(sum(coalesce(x.amount,0)),0) into v_billed
    from public.payables x
   where x.id <> new.id and x.po_number = new.po_number
     and public.is_subcon_payable(x.category, x.account_code)
     and coalesce(x.status,'') not in ('Cancelled','Void');
  if v_billed + coalesce(new.amount,0) > v_contract + 1 and not public.is_mgr() then
    raise exception 'Over the Work Order: % is billed ₱% of a ₱% contract, and ₱% more would pass it. Raise the WO contract (variation) first, or ask a Manager.',
      new.po_number, to_char(v_billed,'FM999,999,990.00'), to_char(v_contract,'FM999,999,990.00'),
      to_char(coalesce(new.amount,0),'FM999,999,990.00') using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.payables_subcon_overbill_guard() from public, anon, authenticated;
create or replace trigger trg_payables_subcon_overbill_guard
  before insert or update on public.payables
  for each row execute function public.payables_subcon_overbill_guard();

-- ── payment cap across all bills of the WO ────────────────────────────────────
create or replace function public.payable_payments_subcon_gate()
returns trigger language plpgsql security definer set search_path = public as $$
declare p public.payables; v_cap numeric; v_claimed numeric; v_pct numeric; v_wo numeric;
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
  v_wo := public.subcon_wo_contract(p.po_number);
  if v_wo is not null and v_wo > 0 then
    -- Work Order: the cap covers every progress billing on it.
    perform pg_advisory_xact_lock(hashtext('subcon_wo_billing:' || p.po_number));
    v_cap := round(v_pct / 100 * v_wo, 2);
    select coalesce(sum(coalesce(x.amount,0) + coalesce(x.retention_amount,0)), 0) into v_claimed
      from public.payable_payments x join public.payables b on b.id = x.payable_id
     where b.po_number = p.po_number and public.is_subcon_payable(b.category, b.account_code)
       and x.status = 'Active' and coalesce(x.kind,'Payment') <> 'Retention release' and x.id <> new.id;
  else
    v_cap := round(v_pct / 100 * public.subcon_cap_base(p), 2);
    select coalesce(sum(coalesce(x.amount,0) + coalesce(x.retention_amount,0)), 0) into v_claimed
      from public.payable_payments x
     where x.payable_id = p.id and x.status = 'Active' and coalesce(x.kind,'Payment') <> 'Retention release' and x.id <> new.id;
  end if;
  v_claimed := v_claimed + coalesce(new.amount,0) + coalesce(new.retention_amount,0);
  if v_claimed > v_cap + 1 then
    raise exception 'No payment: this brings % to ₱% claimed, but the PM certified only % (₱%). Ask the PM to certify more work first.',
      coalesce(nullif(p.po_number,''), nullif(p.ap_number,''), p.id), round(v_claimed,2), v_pct || '%', v_cap using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.payable_payments_subcon_gate() from public, anon, authenticated;

-- ── certify the Work Order (stamped on every bill of it) ──────────────────────
create or replace function public.certify_subcon_billing(p_payable text, p_pct numeric, p_note text)
returns numeric language plpgsql security definer set search_path = public as $$
declare me record; p public.payables; v_prev numeric; v_is_wo boolean;
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
  v_is_wo := public.subcon_wo_contract(p.po_number) is not null;
  if v_is_wo then
    perform pg_advisory_xact_lock(hashtext('subcon_wo_billing:' || p.po_number));
    select coalesce(max(x.verification_pct) filter (where coalesce(x.verified_by,'') <> ''), 0) into v_prev
      from public.payables x
     where x.po_number = p.po_number and public.is_subcon_payable(x.category, x.account_code);
  else
    v_prev := coalesce(p.verification_pct, 0);
  end if;
  if p_pct < v_prev and me.o_role <> 'Manager' then
    raise exception 'Already certified at %; only a Manager can lower it', v_prev || '%' using errcode = '42501';
  end if;
  perform set_config('fabhub.subcon_cert', 'on', true);
  update public.payables set verified = true, verification_pct = p_pct, verified_by = me.o_name,
         verified_at = (now() at time zone 'Asia/Manila')::date, updated_at = now()
   where id = p.id
      or (v_is_wo and po_number = p.po_number and public.is_subcon_payable(category, account_code));
  perform set_config('fabhub.subcon_cert', 'off', true);
  insert into public.subcon_billing_certs(payable_id, wo_number, action, pct, prev_pct, note, by_user, by_name)
  values (p.id, coalesce(p.po_number,''), 'Certified', p_pct, v_prev, btrim(p_note), coalesce(me.o_user,'?'), coalesce(me.o_name,''));
  return p_pct;
end $$;
revoke execute on function public.certify_subcon_billing(text, numeric, text) from public, anon;
grant  execute on function public.certify_subcon_billing(text, numeric, text) to authenticated;

-- ROLLBACK
-- Re-run the function bodies from 20261027160000_subcon_billing_pm_certification.sql
-- (payables_subcon_cert_guard, payable_payments_subcon_gate, certify_subcon_billing), then:
-- drop trigger if exists trg_payables_subcon_overbill_guard on public.payables;
-- drop function if exists public.payables_subcon_overbill_guard();
-- drop function if exists public.subcon_wo_contract(text);
