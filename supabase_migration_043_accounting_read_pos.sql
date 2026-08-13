-- ── Migration 043: let Accounting read Purchase Orders ───────────────────────
-- The unified Purchase Orders view (and the ERP "Purchase Orders" tab) is
-- available to the Accounting role, but purchase_requests' SELECT policy only
-- listed Manager/Finance/FinanceAssistant/Procurement/QS — NOT Accounting. So
-- Aerwin (Accounting) saw an EMPTY Purchase Orders list ("nawala lahat ng POs")
-- even though all 324 POs are intact — it was a read-permission gap, not data
-- loss. subcon_work_orders already included Accounting; this brings POs in line.
-- Read-only: INSERT/UPDATE/DELETE policies are unchanged.
ALTER POLICY purchase_requests_sel ON public.purchase_requests
  USING (has_role(VARIADIC ARRAY['Manager','Finance','Accounting','FinanceAssistant','Procurement','QS']));
