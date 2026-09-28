-- ============================================================================
-- Migration 20260928c — record WHO saved a cash position; lock down RPCs
--
-- 1) cash_positions_history.performed_by was always 'unknown': the trigger read
--    request.jwt.claims ->> 'email', but FabHub's login JWT carries `username`
--    (and `user_role`), not email — see public.app_username(). Use that, falling
--    back to the name on the row's own last audit entry, then 'unknown'.
--
-- 2) Supabase security advisor: functions callable over /rest/v1/rpc by roles
--    that never need them.
--    • next_doc_number / next_po_number — anon (signed-out callers) could burn
--      invoice / CE / PO numbers and leave gaps in the sequence. The app only
--      calls next_doc_number after login (authenticated), so keep that grant.
--    • audit_billing_change / enforce_payable_payment_approval — trigger-only
--      functions; nobody should call them directly.
--    verify_login stays callable by anon (it is the login itself); set_password
--    already checks is_mgr() or self.
--
-- Idempotent. No data changes.
-- ============================================================================

create or replace function public.audit_cash_position_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  actor   text;
  changed text[];
  au      jsonb;
begin
  au := case when jsonb_typeof(new.audit) = 'string' then (new.audit #>> '{}')::jsonb else new.audit end;
  actor := coalesce(
    nullif(public.app_username(), ''),
    nullif(au -> -1 ->> 'by', ''),
    'unknown'
  );

  if tg_op = 'UPDATE' then
    if (to_jsonb(new) - 'updated_at') = (to_jsonb(old) - 'updated_at') then
      return new;
    end if;
    select array_agg(key) into changed
      from jsonb_each(to_jsonb(new)) n
      where n.key <> 'updated_at' and n.value is distinct from (to_jsonb(old) -> n.key);
    insert into public.cash_positions_history (date, action, old_row, new_row, changed_fields, performed_by)
      values (old.date, 'update', to_jsonb(old), to_jsonb(new), changed, actor);
    return new;
  end if;

  insert into public.cash_positions_history (date, action, old_row, performed_by)
    values (old.date, 'delete', to_jsonb(old), coalesce(nullif(public.app_username(), ''), 'unknown'));
  return old;
end
$fn$;
revoke execute on function public.audit_cash_position_change() from public, anon, authenticated;

-- 2) RPC lockdown
revoke execute on function public.next_doc_number(text, bigint) from public, anon;
grant  execute on function public.next_doc_number(text, bigint) to authenticated;
revoke execute on function public.next_po_number()              from public, anon;
grant  execute on function public.next_po_number()              to authenticated;
revoke execute on function public.audit_billing_change()             from public, anon, authenticated;
revoke execute on function public.enforce_payable_payment_approval() from public, anon, authenticated;

-- ── ROLLBACK ──
--   grant execute on function public.next_doc_number(text, bigint) to anon;
--   grant execute on function public.next_po_number()              to anon;
--   grant execute on function public.audit_billing_change()             to anon, authenticated;
--   grant execute on function public.enforce_payable_payment_approval() to anon, authenticated;
--   (actor: re-apply 20260928000000_cash_positions_guardrails.sql's function)
