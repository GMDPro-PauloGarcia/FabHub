-- Down payment rule: 50% of the deal, unless a Manager agrees special terms
-- (decided by Paulo, 2026-11-07).
--
-- Until now "NO DP = NO production" (20261020110000) cleared a deal as soon as
-- the client had paid anything: ₱1,000 on a ₱2M job unblocked every PO. GMD's
-- default terms are a 50% down payment; some clients agree other terms.
--
-- 1. The rule. A deal meets its down payment when one of these is true:
--      * a Manager waived it (dp_waived_*), or the client is on credit terms;
--      * the client has paid at least (required % - 2 points) of deals.value,
--        the full deal amount, VAT and all. The 2 points absorb the EWT a
--        client withholds from the down-payment invoice. Required % is the
--        deal's downpayment_pct, or 50 when blank. A deal with no value falls
--        back to "paid something".
--    Paid = the larger of deals.amount_paid and the deal's non-bounced billing
--    payments (offsets count: they settle the invoice).
--    The parent / mother-PO / internal-job rules of deal_dp_clear stay, each
--    now asking whether that deal meets its own down payment.
--    Existing downpayment_pct values are kept as they are (Paulo: "keep
--    whatever deals I currently have"), including 0% and 100%.
--
-- 2. Special terms are a Manager's call. downpayment_pct is changed only by a
--    Manager (set_deal_dp_pct: reason required, logged to audit_log). A
--    non-Manager may set a blank one to 50% or more (the billing schedule does
--    this); any other change is silently kept and logged, so a stale device
--    save can't undo a Manager's terms and a 30% schedule doesn't lower the
--    bar by itself.
--
-- 3. po_require_dp gets the upsert early-return the WO gates got in
--    20261106000000: the app upserts POs, Postgres runs BEFORE INSERT triggers
--    on an upsert of an existing row, and an issued PO on a deal below its
--    down payment could otherwise no longer be saved (e.g. a delivery).
--    The PO / WO refusal now says how much is collected and how much is needed.
--
-- Mirrors dealDpMet / dealDpClear / dealDpRequiredPct (src/core.js) and DpGate
-- (src/App.jsx). Keep in sync. Idempotent; no DROP.

-- ── The rule ────────────────────────────────────────────────────────────────
create or replace function public.deal_dp_paid(p_deal uuid)
returns numeric language sql stable security definer set search_path = pg_catalog, public as $$
  select greatest(
    coalesce((select d.amount_paid from public.deals d where d.id = p_deal), 0),
    coalesce((select sum(p.amount) from public.billing_milestones m
                join public.billing_payments p on p.milestone_id = m.id
               where m.deal_id = p_deal and not coalesce(p.bounced, false)), 0))
$$;
revoke execute on function public.deal_dp_paid(uuid) from public, anon, authenticated;

-- Does this one deal (not its parent or siblings) meet its down payment?
create or replace function public.deal_dp_met(p_deal uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public as $$
  select exists (
    select 1 from public.deals d
     where d.id = p_deal
       and (d.dp_waived_at is not null
            or public.client_on_credit_terms(d.client)
            or (case when coalesce(d.value, 0) > 0
                     then public.deal_dp_paid(d.id) >= (coalesce(d.downpayment_pct, 50) - 2) / 100.0 * d.value
                     else public.deal_dp_paid(d.id) > 0 end)))
$$;
revoke execute on function public.deal_dp_met(uuid) from public, anon, authenticated;

create or replace function public.deal_dp_clear(p_deal uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public as $$
  select p_deal is null or exists (
    select 1 from public.deals d
     where d.id = p_deal
       and (
            d.client ilike 'GMD Production%'
         or public.deal_dp_met(d.id)
         -- a sub-project / addendum is clear when its parent is
         or (d.parent_deal_id is not null and (
               public.deal_dp_met(d.parent_deal_id)
               -- a mother PO (standby umbrella) earns ₱0: clear once any sub-project is
               or exists (select 1 from public.deals par
                           where par.id = d.parent_deal_id and coalesce(par.standby_po, false)
                             and exists (select 1 from public.deals sib
                                          where sib.parent_deal_id = par.id and public.deal_dp_met(sib.id)))))
         or (coalesce(d.standby_po, false) and exists (
               select 1 from public.deals ch where ch.parent_deal_id = d.id and public.deal_dp_met(ch.id)))
       ))
$$;

-- Human-readable shortfall for the PO / WO refusal.
create or replace function public.deal_dp_shortfall(p_deal uuid)
returns text language sql stable security definer set search_path = pg_catalog, public as $$
  select coalesce(d.ce_no, 'this project') || ': collected ₱' || to_char(public.deal_dp_paid(d.id), 'FM999,999,990')
         || case when coalesce(d.value, 0) > 0
                 then ' of the ₱' || to_char(coalesce(d.downpayment_pct, 50) / 100.0 * d.value, 'FM999,999,990')
                      || ' down payment (' || trim(to_char(coalesce(d.downpayment_pct, 50), 'FM990.##')) || '% of ₱'
                      || to_char(d.value, 'FM999,999,990') || ')'
                 else '' end
    from public.deals d where d.id = p_deal
$$;
revoke execute on function public.deal_dp_shortfall(uuid) from public, anon, authenticated;

-- ── Special terms: Manager only ─────────────────────────────────────────────
create or replace function public.deals_dp_pct_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.downpayment_pct is not null and (new.downpayment_pct < 0 or new.downpayment_pct > 100) then
    raise exception 'Down payment %% must be between 0 and 100' using errcode = '22023';
  end if;
  if coalesce(current_setting('request.jwt.claims', true), '') = '' then return new; end if;   -- migrations / server
  if coalesce(current_setting('fabhub.dp_pct_rpc', true), '') = 'on' then return new; end if;  -- set_deal_dp_pct logs it
  if tg_op = 'INSERT' then
    -- An upsert of an existing deal: the UPDATE branch below decides.
    if exists (select 1 from public.deals x where x.id = new.id) then return new; end if;
    if new.downpayment_pct is not null and new.downpayment_pct < 50 and not public.is_mgr() then
      insert into public.audit_log (table_name, record_id, action, old_snapshot, snapshot, changed_fields, performed_by, reason)
      values ('deals', new.id::text, 'blocked', null, jsonb_build_object('downpayment_pct', new.downpayment_pct),
              array['downpayment_pct'], public.app_username(), 'Down payment below 50% needs a Manager; left at the 50% default');
      new.downpayment_pct := null;
    end if;
    return new;
  end if;
  if new.downpayment_pct is not distinct from old.downpayment_pct then return new; end if;
  if public.is_mgr() then
    insert into public.audit_log (table_name, record_id, action, old_snapshot, snapshot, changed_fields, performed_by, reason)
    values ('deals', old.id::text, 'update', jsonb_build_object('downpayment_pct', old.downpayment_pct),
            jsonb_build_object('downpayment_pct', new.downpayment_pct), array['downpayment_pct'], public.app_username(), 'Down payment % change');
    return new;
  end if;
  -- Non-Manager: may only fill a blank one at 50% or more.
  if old.downpayment_pct is null and new.downpayment_pct >= 50 then return new; end if;
  insert into public.audit_log (table_name, record_id, action, old_snapshot, snapshot, changed_fields, performed_by, reason)
  values ('deals', old.id::text, 'blocked', jsonb_build_object('downpayment_pct', old.downpayment_pct),
          jsonb_build_object('downpayment_pct', new.downpayment_pct), array['downpayment_pct'], public.app_username(),
          'Down payment % change kept: special terms are set by a Manager');
  new.downpayment_pct := old.downpayment_pct;
  return new;
end $$;
revoke execute on function public.deals_dp_pct_guard() from public, anon, authenticated;

create or replace trigger trg_deals_dp_pct_guard
  before insert or update of downpayment_pct on public.deals
  for each row execute function public.deals_dp_pct_guard();

-- Manager only; reason required. p_pct null = back to the 50% default.
create or replace function public.set_deal_dp_pct(p_deal uuid, p_pct numeric, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_old numeric; v_ce text;
begin
  if not public.is_mgr() then
    raise exception 'Only a Manager can set special down payment terms' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Give the reason (at least 5 characters)' using errcode = '22023';
  end if;
  if p_pct is not null and (p_pct < 0 or p_pct > 100) then
    raise exception 'Down payment %% must be between 0 and 100' using errcode = '22023';
  end if;
  select downpayment_pct, ce_no into v_old, v_ce from public.deals where id = p_deal for update;
  if not found then raise exception 'Deal not found' using errcode = 'P0002'; end if;
  perform set_config('fabhub.dp_pct_rpc', 'on', true);
  update public.deals set downpayment_pct = p_pct where id = p_deal;
  perform set_config('fabhub.dp_pct_rpc', '', true);
  insert into public.audit_log (table_name, record_id, action, old_snapshot, snapshot, changed_fields, performed_by, reason)
  values ('deals', p_deal::text, 'dp_terms', jsonb_build_object('downpayment_pct', v_old, 'ce_no', v_ce),
          jsonb_build_object('downpayment_pct', p_pct), array['downpayment_pct'], public.app_username(), btrim(p_reason));
end $$;
revoke execute on function public.set_deal_dp_pct(uuid, numeric, text) from public, anon;
grant  execute on function public.set_deal_dp_pct(uuid, numeric, text) to authenticated;

-- ── The blocks: same rule, upsert-safe, clearer refusal ─────────────────────
create or replace function public.po_require_dp()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare issued text[] := array['PO Issued', 'Partially Delivered', 'Delivered'];
begin
  if coalesce(current_setting('request.jwt.claims', true), '') = '' then return new; end if;
  if tg_op = 'INSERT' and exists (select 1 from public.purchase_requests x where x.id = new.id) then
    return new;   -- upsert of an existing PO line: the UPDATE branch decides
  end if;
  if not (coalesce(new.status, '') = any(issued)) then return new; end if;
  if tg_op = 'UPDATE' and coalesce(old.status, '') = any(issued)
     and new.deal_id is not distinct from old.deal_id then
    return new;
  end if;
  if public.deal_dp_clear(new.deal_id) then return new; end if;
  raise exception 'Down payment not met on %. A Manager must waive it or set special terms before this PO can be issued.',
    public.deal_dp_shortfall(new.deal_id) using errcode = 'check_violation';
end $$;
revoke execute on function public.po_require_dp() from public, anon, authenticated;

create or replace function public.swo_require_dp()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare issued text[] := array['Issued', 'In Progress', 'Completed'];
begin
  if coalesce(current_setting('request.jwt.claims', true), '') = '' then return new; end if;
  if tg_op = 'INSERT' and exists (select 1 from public.subcon_work_orders x where x.id = new.id) then
    return new;   -- upsert of an existing WO: the UPDATE branch decides
  end if;
  if not (coalesce(new.status, '') = any(issued)) then return new; end if;
  if tg_op = 'UPDATE' and coalesce(old.status, '') = any(issued)
     and new.deal_id is not distinct from old.deal_id then
    return new;
  end if;
  if public.deal_dp_clear(new.deal_id) then return new; end if;
  raise exception 'Down payment not met on %. A Manager must waive it or set special terms before this work order can be issued.',
    public.deal_dp_shortfall(new.deal_id) using errcode = 'check_violation';
end $$;
revoke execute on function public.swo_require_dp() from public, anon, authenticated;

-- ROLLBACK
-- Re-run deal_dp_clear from 20261106020000_dp_rule_credit_terms_and_mother_po.sql,
-- po_require_dp from 20261020110100_po_require_down_payment_triggers.sql and
-- swo_require_dp from 20261106000000_subcon_billing_audit_fixes.sql, then:
-- drop trigger if exists trg_deals_dp_pct_guard on public.deals;
-- drop function if exists public.deals_dp_pct_guard();
-- drop function if exists public.set_deal_dp_pct(uuid, numeric, text);
-- drop function if exists public.deal_dp_shortfall(uuid);
-- drop function if exists public.deal_dp_met(uuid);
-- drop function if exists public.deal_dp_paid(uuid);
