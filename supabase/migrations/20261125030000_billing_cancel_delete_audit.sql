-- ============================================================================
-- Migration 20261125030000 — the database records every cancelled invoice and
-- every deleted billing milestone / client payment
--
-- Why (2026-11-25, Paulo: "make sure there is an audit trail"):
--   • Cancelling a milestone takes it out of AR and the contract check. The
--     generic trg_audit_change already keeps the row before/after ("field
--     edit"), but nothing labels it a cancellation, so nobody finds it.
--   • Deleting a milestone or a payment left NO database record:
--     trg_audit_change fires on INSERT / UPDATE only. The 690 milestone
--     'delete' rows in audit_log were written by the app itself, so a delete
--     from a stale device, an old app version or a direct API call left no
--     trace. Manager, Finance, FinanceAssistant and SalesOpsAdmin may delete
--     both (billing_milestones_del / billing_payments_del).
--
-- What (records only; nothing is blocked):
--   • trg_billing_cancel_audit (AFTER UPDATE OF status on billing_milestones):
--     status into Cancelled → audit_log action 'cancel'; out of Cancelled →
--     'uncancel'. Snapshot: invoice no., amount, previous / new status,
--     non-bounced payments on it, the deal's CE no.
--   • trg_billing_delete_audit (AFTER DELETE on billing_milestones and
--     billing_payments): action 'server_delete', the whole row in
--     old_snapshot (enough to restore it), plus the invoice no. / CE no.
--     Deletes cascaded from a deal or a milestone are recorded too.
--   • Who = the login token's username (app_username()); 'system' for server
--     jobs. 'server_delete' is not 'delete', so audit_log_stamp_client and the
--     app's own Restore rows are untouched (the app keeps writing its own).
-- Not done (ask Paulo): a reason on cancel / delete, Telegram to management,
-- or limiting cancel / delete of a sent or paid invoice to Managers.
-- No DROP statements (apply_migration hangs on them — CLAUDE.md).
-- Tested on production 2026-11-25 in a rolled-back transaction (6 cases);
-- applied 2026-11-25 (weekday exception by Paulo).
-- ============================================================================

create or replace function public.billing_cancel_delete_audit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_actor text := coalesce(nullif(public.app_username(), ''), 'system');
  v_ms    record;
  v_ce    text;
  v_paid  numeric;
begin
  if tg_op = 'UPDATE' then
    -- billing_milestones only (the trigger is defined there)
    if (new.status = 'Cancelled') is not distinct from (old.status = 'Cancelled') then
      return null;
    end if;
    select d.ce_no into v_ce from public.deals d where d.id = new.deal_id;
    select coalesce(sum(p.amount), 0) into v_paid
      from public.billing_payments p
     where p.milestone_id = new.id and not coalesce(p.bounced, false);
    insert into public.audit_log (table_name, record_id, action, old_snapshot, snapshot, changed_fields, performed_by, reason)
    values ('billing_milestones', new.id::text,
            case when new.status = 'Cancelled' then 'cancel' else 'uncancel' end,
            to_jsonb(old),
            jsonb_build_object('invoice_no', new.invoice_no, 'name', new.name, 'ce_no', v_ce,
                               'amount', new.amount, 'from', old.status, 'to', new.status,
                               'payments', v_paid, 'deal_id', new.deal_id),
            array['status'], v_actor,
            case when new.status = 'Cancelled'
                 then 'Invoice cancelled' || case when v_paid > 0 then ' (has payments)' else '' end
                 else 'Invoice restored from Cancelled' end);
    return null;
  end if;

  -- DELETE
  if tg_table_name = 'billing_milestones' then
    select d.ce_no into v_ce from public.deals d where d.id = old.deal_id;
    insert into public.audit_log (table_name, record_id, action, old_snapshot, snapshot, performed_by, reason)
    values ('billing_milestones', old.id::text, 'server_delete', to_jsonb(old),
            jsonb_build_object('invoice_no', old.invoice_no, 'name', old.name, 'ce_no', v_ce,
                               'amount', old.amount, 'status', old.status, 'deal_id', old.deal_id),
            v_actor, 'Milestone deleted (recorded by the database)');
  else
    select m.invoice_no, m.deal_id into v_ms from public.billing_milestones m where m.id = old.milestone_id;
    if v_ms.deal_id is not null then
      select d.ce_no into v_ce from public.deals d where d.id = v_ms.deal_id;
    end if;
    insert into public.audit_log (table_name, record_id, action, old_snapshot, snapshot, performed_by, reason)
    values ('billing_payments', old.id::text, 'server_delete', to_jsonb(old),
            jsonb_build_object('invoice_no', v_ms.invoice_no, 'ce_no', v_ce, 'amount', old.amount,
                               'date', old.date, 'ref_no', old.ref_no, 'milestone_id', old.milestone_id),
            v_actor, 'Payment deleted (recorded by the database)');
  end if;
  return null;
end
$fn$;
revoke execute on function public.billing_cancel_delete_audit() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_billing_cancel_audit'
                    and tgrelid = 'public.billing_milestones'::regclass) then
    create trigger trg_billing_cancel_audit
      after update of status on public.billing_milestones
      for each row execute function public.billing_cancel_delete_audit();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_billing_delete_audit'
                    and tgrelid = 'public.billing_milestones'::regclass) then
    create trigger trg_billing_delete_audit
      after delete on public.billing_milestones
      for each row execute function public.billing_cancel_delete_audit();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_billing_delete_audit'
                    and tgrelid = 'public.billing_payments'::regclass) then
    create trigger trg_billing_delete_audit
      after delete on public.billing_payments
      for each row execute function public.billing_cancel_delete_audit();
  end if;
end $$;

-- ROLLBACK (run in the Supabase SQL editor; MCP hangs on DROP):
-- drop trigger if exists trg_billing_cancel_audit on public.billing_milestones;
-- drop trigger if exists trg_billing_delete_audit on public.billing_milestones;
-- drop trigger if exists trg_billing_delete_audit on public.billing_payments;
-- drop function if exists public.billing_cancel_delete_audit();
-- Restore a deleted row from audit_log: action = 'server_delete', old_snapshot.
