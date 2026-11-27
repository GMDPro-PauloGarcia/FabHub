-- Down payment rule becomes a prompt on awarded projects (Paulo, 2026-11-27)
--
-- Paulo: "if a project is awarded, then we can start creating Work Orders and
-- Purchase Orders. It is the job of the other departments to make sure we are
-- able to fund / collect for this project." A client's PO already signifies it
-- will pay; a held WO prints "NOT YET ISSUED – DO NOT START WORK", so the
-- subcontractor won't start.
--
-- Before: po_require_dp / swo_require_dp refused to issue a PO line or a WO on a
-- deal the client hadn't paid on (deal_dp_clear) unless a Manager had waived the
-- down payment on the deal.
--
-- Now:
--   * deal_dp_clear(deal) still clears it with no question (paid, waived, credit
--     terms, parent / mother PO, internal GMD job, no deal).
--   * Otherwise, on an AWARDED project (jo_awarded_stage of the deal, or of its
--     parent for a sub-project / addendum), the issue goes through when the row
--     carries dp_override_reason (10+ characters): the person issuing confirms
--     "the client hasn't paid; GMD fronts it" and says why (e.g. "client PO
--     4500123 received, pays 30 days after delivery"). Logged to audit_log
--     (action 'dp_override') and sent to the management Telegram chat once per
--     PO / WO, so Sales / Finance know there is money to collect.
--   * A project that is NOT awarded (BizDev, For Approval, Did Not Win,
--     Cancelled…) is still refused: no PO / WO before award. A Manager's waiver
--     on the deal still clears it, as before.
--   * Who may issue is unchanged (approve_po / po_require_approver, sign_wo /
--     swo_require_approver): this only turns the payment check into a prompt.
--
-- How the reason reaches the trigger:
--   * approve_po(p_po, p_dp_reason) and sign_wo(p_id, p_dp_reason): new
--     two-argument versions that stamp the reason on the pending rows, then run
--     the existing one-argument function (all its approver rules). The
--     one-argument versions are unchanged.
--   * A direct save that issues (auto-issue ≤ ₱10K, a Manager's PO form) sends
--     dp_override_reason with the row.
--
-- Upserts: both triggers already return early on an upsert's INSERT branch
-- when the row exists (20261106000000); kept.
--
-- The app sends dp_override_reason on PO / WO saves, so this migration must be
-- applied before that code merges.

alter table public.purchase_requests  add column if not exists dp_override_reason text;
alter table public.subcon_work_orders add column if not exists dp_override_reason text;

-- Is the project (or, for a sub-project / addendum, its parent) awarded?
create or replace function public.deal_dp_awarded(p_deal uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.deals d
      left join public.deals par on par.id = d.parent_deal_id
     where d.id = p_deal
       and (public.jo_awarded_stage(d.stage) or public.jo_awarded_stage(par.stage)))
$$;
revoke execute on function public.deal_dp_awarded(uuid) from public, anon;
grant execute on function public.deal_dp_awarded(uuid) to authenticated;

-- Log + Telegram for one override, once per PO number / WO per transaction.
create or replace function public.dp_override_note(p_kind text, p_key text, p_no text, p_deal uuid,
                                                   p_party text, p_amount numeric, p_reason text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  flag text := 'fabhub.dp_ovr_' || md5(p_kind || ':' || coalesce(p_key, ''));
  d record;
begin
  if coalesce(current_setting(flag, true), '') = '1' then return; end if;
  perform set_config(flag, '1', true);
  select ce_no, client into d from public.deals where id = p_deal;
  insert into public.audit_log (table_name, record_id, action, snapshot, performed_by, reason)
  values (case when p_kind = 'WO' then 'subcon_work_orders' else 'purchase_requests' end,
          coalesce(p_key, ''), 'dp_override',
          jsonb_build_object('kind', p_kind, 'number', p_no, 'deal_id', p_deal, 'ce_no', d.ce_no,
                             'client', d.client, 'party', p_party, 'amount', p_amount),
          public.app_username(), p_reason);
  begin
    perform public.send_telegram('management',
      left(format(E'⚠️ <b>%s issued before the client paid — %s</b>\n%s · %s\n%s: %s · ₱%s\nIssued by: %s\nReason: %s\n→ Sales / Finance: collect the down payment',
                  p_kind, coalesce(p_no, '—'), coalesce(d.ce_no, '—'), coalesce(d.client, '—'),
                  case when p_kind = 'WO' then 'Subcon' else 'Supplier' end, coalesce(nullif(p_party, ''), '—'),
                  to_char(coalesce(p_amount, 0), 'FM999,999,999,990.00'),
                  public.app_username(), p_reason), 4000),
      null);
  exception when others then null;
  end;
end $$;
revoke execute on function public.dp_override_note(text, text, text, uuid, text, numeric, text) from public, anon, authenticated;

-- Purchase requests -------------------------------------------------------------
create or replace function public.po_require_dp()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare
  issued text[] := array['PO Issued', 'Partially Delivered', 'Delivered'];
  v_reason text := btrim(coalesce(new.dp_override_reason, ''));
  v_amt numeric;
begin
  if coalesce(current_setting('request.jwt.claims', true), '') = '' then return new; end if;
  if tg_op = 'INSERT' and exists (select 1 from public.purchase_requests x where x.id = new.id) then
    return new;
  end if;
  if not (coalesce(new.status, '') = any(issued)) then return new; end if;
  if tg_op = 'UPDATE' and coalesce(old.status, '') = any(issued)
     and new.deal_id is not distinct from old.deal_id then
    return new;
  end if;
  if public.deal_dp_clear(new.deal_id) then return new; end if;
  if not public.deal_dp_awarded(new.deal_id) then
    raise exception '% is not awarded: no PO is issued before award (or a Manager waives the down payment on the deal).',
      coalesce((select ce_no from public.deals where id = new.deal_id), 'This project') using errcode = 'check_violation';
  end if;
  if length(v_reason) < 10 then
    raise exception 'Down payment not met on %. To issue anyway, confirm it and give a reason (10+ characters), e.g. the client''s PO number.',
      public.deal_dp_shortfall(new.deal_id) using errcode = 'check_violation';
  end if;
  select sum(coalesce(estimated_cost, 0)) into v_amt
    from public.purchase_requests where po_number = new.po_number and coalesce(new.po_number, '') <> '';
  perform public.dp_override_note('PO', coalesce(nullif(new.po_number, ''), new.id::text), new.po_number,
                                  new.deal_id, new.supplier, coalesce(v_amt, new.estimated_cost), v_reason);
  return new;
end $fn$;
revoke execute on function public.po_require_dp() from public, anon, authenticated;

-- Subcon work orders ------------------------------------------------------------
create or replace function public.swo_require_dp()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare
  issued text[] := array['Issued', 'In Progress', 'Completed'];
  v_reason text := btrim(coalesce(new.dp_override_reason, ''));
begin
  if coalesce(current_setting('request.jwt.claims', true), '') = '' then return new; end if;
  if tg_op = 'INSERT' and exists (select 1 from public.subcon_work_orders x where x.id = new.id) then
    return new;
  end if;
  if not (coalesce(new.status, '') = any(issued)) then return new; end if;
  if tg_op = 'UPDATE' and coalesce(old.status, '') = any(issued)
     and new.deal_id is not distinct from old.deal_id then
    return new;
  end if;
  if public.deal_dp_clear(new.deal_id) then return new; end if;
  if not public.deal_dp_awarded(new.deal_id) then
    raise exception '% is not awarded: no work order is issued before award (or a Manager waives the down payment on the deal).',
      coalesce((select ce_no from public.deals where id = new.deal_id), 'This project') using errcode = 'check_violation';
  end if;
  if length(v_reason) < 10 then
    raise exception 'Down payment not met on %. To issue anyway, confirm it and give a reason (10+ characters), e.g. the client''s PO number.',
      public.deal_dp_shortfall(new.deal_id) using errcode = 'check_violation';
  end if;
  perform public.dp_override_note('WO', new.id::text, new.wo_number, new.deal_id,
                                  new.subcontractor, new.contract_amount, v_reason);
  return new;
end $fn$;
revoke execute on function public.swo_require_dp() from public, anon, authenticated;

-- The triggers themselves (trg_po_require_dp / trg_swo_require_dp, before insert
-- or update of status, deal_id) are unchanged.

-- approve_po with a reason ------------------------------------------------------
create or replace function public.approve_po(p_po text, p_dp_reason text)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_reason text := btrim(coalesce(p_dp_reason, ''));
begin
  if v_reason <> '' then
    if length(v_reason) < 10 then
      raise exception 'Give a reason of at least 10 characters.' using errcode = '22023';
    end if;
    if not public.has_role('Manager','QS','Procurement','ProcurementManager') then
      raise exception 'Only Procurement, the Procurement Manager, Cost Control or a Manager can approve a PO' using errcode = '42501';
    end if;
    update public.purchase_requests set dp_override_reason = v_reason
     where po_number = p_po and status = 'Pending Approval';
  end if;
  return public.approve_po(p_po);
end $$;
revoke execute on function public.approve_po(text, text) from public, anon;
grant execute on function public.approve_po(text, text) to authenticated;

-- sign_wo with a reason ---------------------------------------------------------
create or replace function public.sign_wo(p_id uuid, p_dp_reason text)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_reason text := btrim(coalesce(p_dp_reason, ''));
begin
  if v_reason <> '' then
    if length(v_reason) < 10 then
      raise exception 'Give a reason of at least 10 characters.' using errcode = '22023';
    end if;
    if public.wo_signer_kind(public.app_username(),
         (select role from public.user_profiles where username = public.app_username())) is null then
      raise exception 'Only Cost Control (Rodney, Marian) or Finance (Paolo Gomez) signs work orders.' using errcode = '42501';
    end if;
    perform set_config('fabhub.wo_sign', '1', true);
    update public.subcon_work_orders set dp_override_reason = v_reason
     where id = p_id and coalesce(status, '') in ('Draft', 'Pending Approval');
    perform set_config('fabhub.wo_sign', '', true);
  end if;
  return public.sign_wo(p_id);
end $$;
revoke execute on function public.sign_wo(uuid, text) from public, anon;
grant execute on function public.sign_wo(uuid, text) to authenticated;

select 'Migration 20261128010000 applied: down payment is a prompt with a reason on awarded projects' as status;

-- ── ROLLBACK (run by hand) ──
-- Restore the hard block (the bodies live on 2026-11-27, which are in no other
-- migration file of this repo). For swo_require_dp, the same body with
-- subcon_work_orders, array['Issued','In Progress','Completed'] and
-- "this work order" in the message:
--   create or replace function public.po_require_dp() returns trigger
--   language plpgsql security definer set search_path = pg_catalog, public as $fn$
--   declare issued text[] := array['PO Issued', 'Partially Delivered', 'Delivered'];
--   begin
--     if coalesce(current_setting('request.jwt.claims', true), '') = '' then return new; end if;
--     if tg_op = 'INSERT' and exists (select 1 from public.purchase_requests x where x.id = new.id) then
--       return new;
--     end if;
--     if not (coalesce(new.status, '') = any(issued)) then return new; end if;
--     if tg_op = 'UPDATE' and coalesce(old.status, '') = any(issued)
--        and new.deal_id is not distinct from old.deal_id then
--       return new;
--     end if;
--     if public.deal_dp_clear(new.deal_id) then return new; end if;
--     raise exception 'Down payment not met on %. A Manager must waive it or set special terms before this PO can be issued.',
--       public.deal_dp_shortfall(new.deal_id) using errcode = 'check_violation';
--   end $fn$;
-- then:
--   drop function if exists public.approve_po(text, text);
--   drop function if exists public.sign_wo(uuid, text);
--   drop function if exists public.dp_override_note(text, text, text, uuid, text, numeric, text);
--   drop function if exists public.deal_dp_awarded(uuid);
-- The dp_override_reason columns can stay (unused).
