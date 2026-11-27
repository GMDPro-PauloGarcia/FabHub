-- Work orders: an issued WO can't be moved backwards by a save (2026-11-27)
--
-- Why: WO-0093 (Alba Motors / Elijah Mojares, Mizuno MOA Modules CE-2026-1466,
-- ₱365,000) was signed by Cost Control (Marian, 09:12 Manila) and issued by
-- Finance (Paolo Gomez, 10:14). At 12:43 a save from a device holding an older
-- copy (status still "Pending Approval") upserted the whole row and put it back
-- to Pending Approval, clearing approved_by and acct_status. The WO vanished from
-- Accounting's queue and from the subcon's paperwork. The device was a Manager's,
-- so a "Managers are exempt" guard would not have stopped it.
--
-- Rule (everyone, Managers included; server jobs exempt):
--   * Once a WO is Issued / In Progress / Completed, a save can't move its status
--     backwards (Issued < In Progress < Completed) or out of that set, except to
--     Cancelled / Void. The server's status, approved_by and (when the save sends
--     it blank) acct_status are kept, and the attempt goes to audit_log
--     (action 'blocked'). Silent, so a stale save of other fields still lands.
--   * A deliberate reopen goes only through reopen_wo(id, reason): Manager, reason
--     10+ chars, no bill on the WO yet. It returns the WO to Pending Approval and
--     clears both signatures (Cost Control and Finance sign again). audit_log
--     action 'wo_reopen', Telegram to management.
--   * sign_wo sets fabhub.wo_sign and is unaffected.
--
-- App mirror: updateSWO sends only the changed fields (plain update, never a
-- full-row upsert), and the edit form's Status list on an issued WO offers only
-- forward statuses + Cancelled (woStatusOptions, src/core.js).
--
-- The trigger is named trg_swo_aa_… so it fires before trg_swo_cc_guard /
-- trg_swo_require_approver (BEFORE triggers run in name order): require_approver
-- then sees old and new both issued and keeps approved_by.

create or replace function public.wo_status_rank(p_status text)
returns int
language sql
immutable
set search_path = pg_catalog, public
as $$
  select case coalesce(p_status, '')
    when 'Issued' then 1
    when 'In Progress' then 2
    when 'Completed' then 3
    else 0 end
$$;

create or replace function public.swo_issued_no_revert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_old int := public.wo_status_rank(old.status);
  v_new int := public.wo_status_rank(new.status);
begin
  if coalesce(current_setting('request.jwt.claims', true), '') = '' then
    return new;
  end if;
  if coalesce(current_setting('fabhub.wo_sign', true), '') = '1'
     or coalesce(current_setting('fabhub.wo_reopen', true), '') = '1' then
    return new;
  end if;
  if v_old = 0 or coalesce(new.status, '') in ('Cancelled', 'Void') then
    return new;
  end if;
  if v_new >= v_old then
    return new;
  end if;

  insert into public.audit_log (table_name, record_id, action, old_snapshot, snapshot, changed_fields, performed_by, reason)
  values ('subcon_work_orders', old.id::text, 'blocked',
          jsonb_build_object('wo_number', old.wo_number, 'status', old.status,
                             'approved_by', old.approved_by, 'acct_status', old.acct_status),
          jsonb_build_object('wo_number', old.wo_number, 'status', new.status,
                             'approved_by', new.approved_by, 'acct_status', new.acct_status),
          array['status'], public.app_username(),
          'An issued work order can''t be moved back by a save (stale copy?). A Manager reopens it with reopen_wo.');

  new.status := old.status;
  new.approved_by := old.approved_by;
  if coalesce(new.acct_status, '') = '' then
    new.acct_status := old.acct_status;
  end if;
  return new;
end $$;

revoke execute on function public.swo_issued_no_revert() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_trigger
                  where tgname = 'trg_swo_aa_issued_no_revert'
                    and tgrelid = 'public.subcon_work_orders'::regclass) then
    create trigger trg_swo_aa_issued_no_revert
      before update on public.subcon_work_orders
      for each row execute function public.swo_issued_no_revert();
  end if;
end $$;

create or replace function public.reopen_wo(p_id uuid, p_reason text)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  w public.subcon_work_orders;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_bills int;
begin
  if not public.is_mgr() then
    raise exception 'Only a Manager reopens an issued work order.' using errcode = '42501';
  end if;
  if length(v_reason) < 10 then
    raise exception 'Give a reason (10+ characters) for reopening the work order.' using errcode = '22023';
  end if;
  select * into w from public.subcon_work_orders where id = p_id for update;
  if not found then raise exception 'Work order not found' using errcode = 'P0002'; end if;
  if public.wo_status_rank(w.status) = 0 then
    raise exception 'Work order % is % (not issued): nothing to reopen.', coalesce(w.wo_number, ''), coalesce(w.status, '—')
      using errcode = '22023';
  end if;
  select count(*) into v_bills from public.payables b
   where coalesce(w.wo_number, '') <> '' and b.po_number = w.wo_number
     and coalesce(b.status, '') not in ('Cancelled', 'Void');
  if v_bills > 0 then
    raise exception 'Work order % already has % bill(s): cancel it or issue a change instead of reopening.', w.wo_number, v_bills
      using errcode = '22023';
  end if;

  perform set_config('fabhub.wo_reopen', '1', true);
  perform set_config('fabhub.wo_sign', '1', true);
  update public.subcon_work_orders
     set status = 'Pending Approval', approved_by = '',
         cc_approved_by = null, cc_approved_at = null,
         acct_status = case when acct_status = 'For Accounting' then '' else acct_status end
   where id = p_id;
  perform set_config('fabhub.wo_sign', '', true);
  perform set_config('fabhub.wo_reopen', '', true);

  insert into public.audit_log (table_name, record_id, action, old_snapshot, snapshot, changed_fields, performed_by, reason)
  values ('subcon_work_orders', w.id::text, 'wo_reopen',
          jsonb_build_object('wo_number', w.wo_number, 'status', w.status, 'approved_by', w.approved_by,
                             'cc_approved_by', w.cc_approved_by, 'acct_status', w.acct_status),
          jsonb_build_object('wo_number', w.wo_number, 'status', 'Pending Approval'),
          array['status', 'approved_by', 'cc_approved_by'], public.app_username(), v_reason);

  begin
    perform public.send_telegram('management',
      left(format(E'↩️ <b>Work order reopened — %s</b>\n%s · ₱%s\nWas: %s (Finance: %s)\nBy: %s\nReason: %s\n→ Cost Control and Finance sign again',
                  coalesce(w.wo_number, ''), coalesce(w.subcontractor, '—'),
                  to_char(coalesce(w.contract_amount, 0), 'FM999,999,999,990.00'),
                  w.status, coalesce(nullif(w.approved_by, ''), '—'), public.app_username(), v_reason), 4000),
      null);
  exception when others then null;
  end;
  return 'reopened';
end $$;

revoke execute on function public.reopen_wo(uuid, text) from public, anon;
grant execute on function public.reopen_wo(uuid, text) to authenticated;

-- ROLLBACK
-- drop trigger if exists trg_swo_aa_issued_no_revert on public.subcon_work_orders;
-- drop function if exists public.reopen_wo(uuid, text);
-- drop function if exists public.swo_issued_no_revert();
-- drop function if exists public.wo_status_rank(text);
