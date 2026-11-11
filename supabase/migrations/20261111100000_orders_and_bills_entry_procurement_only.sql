-- Who creates orders and supplier bills (Paulo, 2026-11-11).
--
-- * Purchase Orders and Subcon Work Orders: only Procurement, the Procurement
--   Manager (Marian) and Managers create them; they then go through Cost
--   Control / a Manager for approval (approve_po, swo_require_approver).
--   Finance Assistant (Mark, Jerwin) and Finance no longer create orders.
-- * Supplier bills on a PO / WO: only Procurement, the Procurement Manager and
--   Managers enter them.
-- * Bills with no PO (rent, utilities, permits, OPEX) and PRVs: entered by
--   Finance (Finance, FinanceAssistant, Accounting), and only when charged to a
--   cost center (GMD OPEX, GMD Tools, GMD Warehouse Stocks).
-- * SalesOpsAdmin (Jessica) no longer creates any bill.
-- * The Procurement Manager role had no read, insert or update on these three
--   tables (has_role matches the exact role), so it could not see or create a
--   PO. It now has the same select / insert / update as Procurement (not delete).
--
-- Only these policies change: *_sel and *_upd gain ProcurementManager, *_ins
-- is narrowed as above. Payments (payable_payments), approvals, due dates and
-- documents are untouched. Note that Postgres checks the INSERT policy on an
-- upsert even when the row exists, so the app re-saves an existing bill with a
-- plain update (sbUpdatePayable in src/App.jsx).
-- In the 60 days before this change no Finance Assistant, SalesOpsAdmin or
-- Accounting user created a PO, WO or bill (all were Procurement or Paulo).
--
-- App mirror (keep in sync): PERMISSIONS in src/core.js, INSERT_ROLES,
-- canBillPo / canBillOpex and savePayable in src/App.jsx.

alter policy purchase_requests_ins on public.purchase_requests
  with check (public.has_role('Manager','Procurement','ProcurementManager'));
alter policy purchase_requests_sel on public.purchase_requests
  using (public.has_role('Manager','Finance','Accounting','FinanceAssistant','Procurement','ProcurementManager','QS','Warehouse'));
alter policy purchase_requests_upd on public.purchase_requests
  using (public.has_role('Manager','Finance','FinanceAssistant','Procurement','ProcurementManager'))
  with check (public.has_role('Manager','Finance','FinanceAssistant','Procurement','ProcurementManager'));

alter policy subcon_work_orders_ins on public.subcon_work_orders
  with check (public.has_role('Manager','Procurement','ProcurementManager'));
alter policy subcon_work_orders_sel on public.subcon_work_orders
  using (public.has_role('Manager','Sales','Finance','Accounting','FinanceAssistant','Procurement','ProcurementManager','SalesOpsAdmin','QS'));
alter policy subcon_work_orders_upd on public.subcon_work_orders
  using (public.has_role('Manager','Finance','Accounting','FinanceAssistant','Procurement','ProcurementManager'))
  with check (public.has_role('Manager','Finance','Accounting','FinanceAssistant','Procurement','ProcurementManager'));

alter policy payables_ins on public.payables
  with check (
    public.has_role('Manager','Procurement','ProcurementManager')
    or (public.has_role('Finance','FinanceAssistant','Accounting')
        and coalesce(po_number,'') = '' and coalesce(po_id,'') = ''
        and exists (select 1 from public.deals d where d.id::text = project_id and d.is_cost_center))
  );
alter policy payables_sel on public.payables
  using (public.has_role('Manager','Finance','Accounting','FinanceAssistant','Procurement','ProcurementManager','SalesOpsAdmin','QS'));
alter policy payables_upd on public.payables
  using (public.has_role('Manager','Finance','Accounting','FinanceAssistant','Procurement','ProcurementManager','SalesOpsAdmin'))
  with check (public.has_role('Manager','Finance','Accounting','FinanceAssistant','Procurement','ProcurementManager','SalesOpsAdmin'));

-- Marian (ProcurementManager) may also delete POs and Work Orders, like
-- Procurement. Supplier bills stay Manager-only to delete.
alter policy purchase_requests_del on public.purchase_requests
  using (public.has_role('Manager','Procurement','ProcurementManager'));
alter policy subcon_work_orders_del on public.subcon_work_orders
  using (public.has_role('Manager','Procurement','ProcurementManager'));

-- Work Order edits and deletes go to audit_log, like PO lines
-- (trg_audit_purchase_request, 20261020010000). Before this, a deleted WO
-- left no trace. A delete's snapshot holds the whole row, so it can be
-- restored with: insert into subcon_work_orders select * from
-- jsonb_populate_record(null::subcon_work_orders, (select snapshot from
-- audit_log where table_name = 'subcon_work_orders' and record_id = '<id>'
-- and action = 'delete' order by performed_at desc limit 1));
create or replace function public.audit_subcon_work_order_change()
returns trigger language plpgsql security definer set search_path = public as $f$
declare
  actor   text := coalesce(nullif(public.app_username(), ''), 'unknown');
  changed text[];
begin
  if tg_op = 'UPDATE' then
    if to_jsonb(new) = to_jsonb(old) then return new; end if;
    select array_agg(key) into changed from jsonb_each(to_jsonb(new)) n
      where n.value is distinct from (to_jsonb(old) -> n.key);
    insert into public.audit_log (table_name, record_id, action, old_snapshot, snapshot, changed_fields, performed_by, reason)
      values (tg_table_name, new.id::text, 'update', to_jsonb(old), to_jsonb(new), changed, actor, 'field edit');
    return new;
  end if;
  insert into public.audit_log (table_name, record_id, action, snapshot, performed_by, reason)
    values (tg_table_name, old.id::text, 'delete', to_jsonb(old), actor,
            'deleted' || coalesce(' ' || nullif(old.wo_number, ''), ''));
  return old;
end $f$;
revoke execute on function public.audit_subcon_work_order_change() from public, anon, authenticated;
create or replace trigger trg_audit_subcon_work_order
  after update or delete on public.subcon_work_orders
  for each row execute function public.audit_subcon_work_order_change();

-- ROLLBACK (restores the policies as they were on 2026-11-11):
-- alter policy purchase_requests_ins on public.purchase_requests
--   with check (public.has_role('Manager','Finance','FinanceAssistant','Procurement'));
-- alter policy purchase_requests_sel on public.purchase_requests
--   using (public.has_role('Manager','Finance','Accounting','FinanceAssistant','Procurement','QS','Warehouse'));
-- alter policy purchase_requests_upd on public.purchase_requests
--   using (public.has_role('Manager','Finance','FinanceAssistant','Procurement'))
--   with check (public.has_role('Manager','Finance','FinanceAssistant','Procurement'));
-- alter policy subcon_work_orders_ins on public.subcon_work_orders
--   with check (public.has_role('Manager','Finance','FinanceAssistant','Procurement'));
-- alter policy subcon_work_orders_sel on public.subcon_work_orders
--   using (public.has_role('Manager','Sales','Finance','Accounting','FinanceAssistant','Procurement','SalesOpsAdmin','QS'));
-- alter policy subcon_work_orders_upd on public.subcon_work_orders
--   using (public.has_role('Manager','Finance','Accounting','FinanceAssistant','Procurement'))
--   with check (public.has_role('Manager','Finance','Accounting','FinanceAssistant','Procurement'));
-- alter policy payables_ins on public.payables
--   with check (public.has_role('Manager','Finance','Accounting','FinanceAssistant','Procurement','SalesOpsAdmin'));
-- alter policy payables_sel on public.payables
--   using (public.has_role('Manager','Finance','Accounting','FinanceAssistant','Procurement','SalesOpsAdmin','QS'));
-- alter policy payables_upd on public.payables
--   using (public.has_role('Manager','Finance','Accounting','FinanceAssistant','Procurement','SalesOpsAdmin'))
--   with check (public.has_role('Manager','Finance','Accounting','FinanceAssistant','Procurement','SalesOpsAdmin'));
-- alter policy purchase_requests_del on public.purchase_requests using (public.has_role('Manager','Procurement'));
-- alter policy subcon_work_orders_del on public.subcon_work_orders using (public.has_role('Manager','Procurement'));
-- The WO audit trigger is safe to keep; to remove it, drop trigger trg_audit_subcon_work_order
-- on public.subcon_work_orders and drop function public.audit_subcon_work_order_change()
-- (run these by hand: the Supabase MCP tools hang on DROP).
