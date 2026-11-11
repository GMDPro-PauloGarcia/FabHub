-- Orders and supplier bills are entered by Procurement only (Paulo, 2026-11-11).
--
-- * Purchase Orders and Subcon Work Orders: only Procurement (and a Manager)
--   creates them; they then run through Cost Control / a Manager for approval
--   (approve_po, swo_require_approver). Finance Assistant (Mark, Jerwin) and
--   Finance no longer create orders, so whoever pays a bill can't also raise
--   the order behind it.
-- * Supplier bills (payables): only Procurement (and a Manager) enters them.
--   SalesOpsAdmin (Jessica), Accounting, Finance and Finance Assistant no
--   longer create bills. Mark still pays bills (payable_payments is unchanged).
--
-- Only the INSERT policies change. UPDATE policies are untouched, so payments,
-- approvals, due dates, documents and upserts of an existing row (which take
-- the UPDATE path) keep working for the roles that had them.
-- In the 60 days before this change no Finance Assistant, SalesOpsAdmin or
-- Accounting user created a PO, WO or bill (all were Procurement or Paulo).
--
-- App mirror (keep in sync): PERMISSIONS.purchase_requests / subcon_work_orders /
-- payables .insert in src/core.js and INSERT_ROLES in src/App.jsx.

alter policy purchase_requests_ins on public.purchase_requests
  with check (public.has_role('Manager','Procurement'));

alter policy subcon_work_orders_ins on public.subcon_work_orders
  with check (public.has_role('Manager','Procurement'));

alter policy payables_ins on public.payables
  with check (public.has_role('Manager','Procurement'));

-- ROLLBACK (restores the policies as they were on 2026-11-11):
-- alter policy purchase_requests_ins on public.purchase_requests
--   with check (public.has_role('Manager','Finance','FinanceAssistant','Procurement'));
-- alter policy subcon_work_orders_ins on public.subcon_work_orders
--   with check (public.has_role('Manager','Finance','FinanceAssistant','Procurement'));
-- alter policy payables_ins on public.payables
--   with check (public.has_role('Manager','Finance','Accounting','FinanceAssistant','Procurement','SalesOpsAdmin'));
