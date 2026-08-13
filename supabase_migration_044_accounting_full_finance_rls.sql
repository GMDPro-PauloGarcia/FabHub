-- ── Migration 044: complete the Accounting role's finance/accounting RLS ──────
-- Aerwin (Accounting) needs the read/write the app already offers that role.
-- Gaps found + fixed (all additive — Accounting appended, no role loses access):
--   • deals SELECT               — resolve project names on payables/CV/APV/PO views
--   • subcon_work_orders UPDATE  — "SWO For Accounting" (acct status/notes)
--   • cash_positions SELECT      — Daily Digest cash section on the dashboard
--   • app_settings INSERT/UPDATE — persist Chart of Accounts edits
-- Already covered (left as-is): payables (SELECT/INSERT/UPDATE), check_vouchers
-- (SELECT/INSERT/UPDATE), expenses (INSERT/UPDATE), purchase_requests SELECT
-- (migration 043), subcon_work_orders SELECT, billing_* SELECT.

ALTER POLICY deals_sel ON public.deals
  USING (has_role(VARIADIC ARRAY['Manager','ProjectMover','Sales','Finance','Accounting','FinanceAssistant','Procurement','QS','SalesOpsAdmin']) OR is_senior_designer());

ALTER POLICY subcon_work_orders_upd ON public.subcon_work_orders
  USING (has_role(VARIADIC ARRAY['Manager','Finance','Accounting','FinanceAssistant','Procurement']))
  WITH CHECK (has_role(VARIADIC ARRAY['Manager','Finance','Accounting','FinanceAssistant','Procurement']));

ALTER POLICY cash_positions_sel ON public.cash_positions
  USING (has_role(VARIADIC ARRAY['Manager','Finance','Accounting','FinanceAssistant']));

ALTER POLICY app_settings_ins ON public.app_settings
  WITH CHECK (has_role(VARIADIC ARRAY['Manager','Finance','Accounting','FinanceAssistant']));
ALTER POLICY app_settings_upd ON public.app_settings
  USING (has_role(VARIADIC ARRAY['Manager','Finance','Accounting','FinanceAssistant']))
  WITH CHECK (has_role(VARIADIC ARRAY['Manager','Finance','Accounting','FinanceAssistant']));
