-- Subcon billing: fixes from the 2026-11-05 audit of 20261105160000 / 170000.
--
-- The app saves payables and work orders with an upsert (INSERT … ON CONFLICT
-- DO UPDATE). Postgres runs BEFORE INSERT row triggers for every upsert,
-- including one that ends up updating an existing row, and then the BEFORE
-- UPDATE triggers. The INSERT branches of these guards therefore ran on plain
-- edits:
--   * swo_dp_pct_guard refused any non-Manager save of a WO whose dp_pct is
--     above 50% (set by a Manager), e.g. moving it to In Progress.
--   * payables_subcon_overbill_guard re-checked the contract ceiling on every
--     edit, so a non-Manager couldn't edit any bill of a WO a Manager had
--     billed past its contract.
--   * payables_subcon_cert_guard ran its new-bill approval check on edits.
-- Each now leaves an existing row to its UPDATE branch, which keeps the rules.
--
-- Also:
--   * over-bill guard: re-opening a Cancelled / Void bill is checked against
--     the contract like a new bill (the "unchanged amount" exit applied only
--     to bills that were already live).
--   * down-payment approval takes the WO lock, so two bills approved at the
--     same moment can't both fit inside the same down payment.
-- Idempotent; no DROP.

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
    -- An upsert of an existing WO: the UPDATE branch below decides.
    if exists (select 1 from public.subcon_work_orders x where x.id = new.id) then return new; end if;
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

create or replace function public.payables_subcon_overbill_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_contract numeric; v_billed numeric;
begin
  if not public.is_subcon_payable(new.category, new.account_code) then return new; end if;
  if coalesce(new.status,'') in ('Cancelled','Void') then return new; end if;
  -- An upsert of an existing bill: the UPDATE branch decides.
  if tg_op = 'INSERT' and exists (select 1 from public.payables x where x.id = new.id) then return new; end if;
  v_contract := public.subcon_wo_contract(new.po_number);
  if v_contract is null or v_contract <= 0 then return new; end if;
  if tg_op = 'UPDATE' and old.po_number is not distinct from new.po_number
     and coalesce(new.amount,0) <= coalesce(old.amount,0)
     and public.is_subcon_payable(old.category, old.account_code)
     and coalesce(old.status,'') not in ('Cancelled','Void') then
    return new;   -- a live bill, unchanged or lowered: a stale save still works
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
  -- An upsert of an existing bill: the UPDATE branch keeps its certification and checks approval.
  if tg_op = 'INSERT' and exists (select 1 from public.payables x where x.id = new.id) then return new; end if;
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
    if coalesce(new.po_number,'') <> '' then
      perform pg_advisory_xact_lock(hashtext('subcon_wo_billing:' || new.po_number));
    end if;
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

-- ── Same upsert problem in the WO issue gates (20261027132908 / 20261020110100) ──
-- swo_require_approver and swo_require_dp treated every save of an already
-- issued WO as a fresh issue: anyone but a Manager / the Procurement Manager
-- got "Only a Manager or the Procurement Manager can approve this work order"
-- when saving any change (notes, delivery, down payment %) to an Issued /
-- In Progress / Completed WO. An existing row now goes to their UPDATE branch,
-- which already lets an issued WO stay issued and still gates a real issue.

create or replace function public.swo_require_approver()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  issued text[] := array['Issued', 'In Progress', 'Completed'];
  who text;
begin
  if coalesce(current_setting('request.jwt.claims', true), '') = '' then
    return new;
  end if;
  if tg_op = 'INSERT' and exists (select 1 from public.subcon_work_orders x where x.id = new.id) then
    return new;   -- upsert of an existing WO: the UPDATE branch decides
  end if;
  if not (coalesce(new.status, '') = any(issued)) then
    return new;
  end if;
  if tg_op = 'UPDATE' and coalesce(old.status, '') = any(issued) then
    new.approved_by := old.approved_by;
    return new;
  end if;
  who := public.po_approver_name(new.requested_by);
  if who is null then
    raise exception 'Only a Manager or the Procurement Manager can approve this work order (and not one they requested themselves).'
      using errcode = 'insufficient_privilege';
  end if;
  new.approved_by := who;
  return new;
end
$$;
revoke execute on function public.swo_require_approver() from public, anon, authenticated;

create or replace function public.swo_require_dp()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  issued text[] := array['Issued', 'In Progress', 'Completed'];
  ce text;
begin
  if coalesce(current_setting('request.jwt.claims', true), '') = '' then
    return new;
  end if;
  if tg_op = 'INSERT' and exists (select 1 from public.subcon_work_orders x where x.id = new.id) then
    return new;   -- upsert of an existing WO: the UPDATE branch decides
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
$$;
revoke execute on function public.swo_require_dp() from public, anon, authenticated;

-- ROLLBACK
-- Re-run swo_require_approver from 20261027132908_po_require_approver.sql and
-- swo_require_dp from 20261020110100_po_require_down_payment_triggers.sql;
-- re-run swo_dp_pct_guard / payables_subcon_cert_guard from
-- 20261105170000_subcon_down_payment_allowance.sql and
-- payables_subcon_overbill_guard from 20261105160000_subcon_billing_per_progress_claim.sql.
