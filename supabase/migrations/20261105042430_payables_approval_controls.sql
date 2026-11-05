-- ── Supplier bill approval controls (2026-11-05, Paulo) ─────────────────────
-- Applied to production 2026-11-05 (version 20261105042430), after a rolled-back test as mark / paolo.
-- AP moves fully into FabHub (no Excel). Who approves a bill must be someone
-- other than the person who entered or pays it. Mark (FinanceAssistant) enters
-- bills, records payments and keeps the cash sheet; Managers (Paolo Gomez, with
-- Paulo and Mar as back-up) approve.
--
-- 1. Only a Manager (or the Finance role) changes approval_status / approved_by /
--    approved_at. Anyone else's change to those fields is silently ignored, so a
--    stale full-row save from their device still saves (it no longer errors).
--    Mark is no longer a named approver (was hard-coded in enforce_payable_approval).
-- 2. Nobody approves a bill they entered (created_by = their name or username).
-- 3. An approval must be for the bill as it is on the server: approving from a
--    copy whose amount or supplier differs from the server is refused, so a stale
--    device can't put back an old amount while approving it.
-- 4. The server stamps approved_by / approved_at from the login, not the device.
-- 5. Changing the amount or supplier (ap_vendor_key) of an approved bill puts it
--    back to Pending, logged in audit_log (action 'approval_reset').
-- 6. Every new bill starts Pending, whoever inserts it (approval happens after).
-- Requests without a JWT (migrations, cron) are exempt, as before.
-- App mirror: canApprovePayables / approvePayable in src/App.jsx.
--
-- ROLLBACK (restores the previous behaviour):
--   create or replace function public.enforce_payable_approval() returns trigger
--     language plpgsql security definer set search_path to 'pg_catalog','public' as $f$
--   begin
--     if (new.approval_status is distinct from old.approval_status)
--        and coalesce(current_setting('request.jwt.claims', true),'') <> ''
--        and not public.has_role('Manager','Finance')
--        and public.app_username() not in ('mark') then
--       raise exception 'Only a Manager or the Finance Manager may change a payable''s approval status';
--     end if;
--     return new;
--   end $f$;
--   create or replace function public.payables_insert_pending() returns trigger
--     language plpgsql security definer set search_path to 'pg_catalog','public'
--     as $f$ begin return new; end $f$;

create or replace function public.enforce_payable_approval()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_approver boolean;
  v_me text;
  v_material boolean;
begin
  if coalesce(current_setting('request.jwt.claims', true), '') = '' then
    return new;
  end if;
  v_approver := public.has_role('Manager', 'Finance');
  select p.name into v_me from public.user_profiles p where p.username = public.app_username() limit 1;
  v_material := round(coalesce(new.amount, 0), 2) <> round(coalesce(old.amount, 0), 2)
             or public.ap_vendor_key(new.vendor) <> public.ap_vendor_key(old.vendor);

  if not v_approver then
    -- 1. Not an approver: keep the approval exactly as it is on the server.
    new.approval_status := old.approval_status;
    new.approved_by     := old.approved_by;
    new.approved_at     := old.approved_at;
  elsif new.approval_status is distinct from old.approval_status then
    if new.approval_status = 'Approved' then
      -- 2. No self-approval.
      if nullif(lower(trim(coalesce(old.created_by, ''))), '') in
         (lower(trim(coalesce(v_me, ''))), lower(public.app_username())) then
        raise exception 'You entered this bill (%). Another Manager must approve it.',
          coalesce(nullif(old.ap_number, ''), old.id) using errcode = '42501';
      end if;
      -- 3. Approve the bill as it is on the server.
      if v_material then
        raise exception 'Bill % changed since you opened it (amount or supplier). Refresh and approve again.',
          coalesce(nullif(old.ap_number, ''), old.id) using errcode = '40001';
      end if;
    end if;
    -- 4. The server records who decided and when.
    new.approved_by := coalesce(v_me, public.app_username());
    new.approved_at := now();
  end if;

  -- 5. A material change to an approved bill needs a new approval.
  if old.approval_status = 'Approved' and new.approval_status = 'Approved' and v_material then
    new.approval_status := 'Pending';
    new.approved_by     := null;
    new.approved_at     := null;
    insert into public.audit_log (table_name, record_id, action, snapshot, old_snapshot, reason, performed_by, performed_at)
    values ('payables', new.id, 'approval_reset', to_jsonb(new), to_jsonb(old),
            format('Amount %s → %s / supplier "%s" → "%s" after approval: back to Pending',
                   old.amount, new.amount, old.vendor, new.vendor),
            coalesce(v_me, public.app_username()), now());
  end if;
  return new;
end
$function$;

-- 6. New bills always start Pending.
create or replace function public.payables_insert_pending()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
begin
  if coalesce(current_setting('request.jwt.claims', true), '') <> '' then
    new.approval_status := 'Pending';
    new.approved_by     := null;
    new.approved_at     := null;
  end if;
  return new;
end
$function$;

create or replace trigger trg_payables_insert_pending
  before insert on public.payables
  for each row execute function public.payables_insert_pending();

revoke execute on function public.enforce_payable_approval() from public, anon, authenticated;
revoke execute on function public.payables_insert_pending() from public, anon, authenticated;
