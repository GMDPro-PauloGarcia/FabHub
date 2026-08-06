-- ── Migration 036: grant SalesOpsAdmin write access to billings ──────────────
-- Fixes the "billing won't sync" problem for Operations & Sales Admin users.
--
-- SalesOpsAdmin was already in the SELECT policies for billing_milestones and
-- billing_payments (they can view billings) but was left out of the INSERT and
-- UPDATE policies, which only allowed Manager / Finance / FinanceAssistant.
-- When a SalesOpsAdmin user logged a payment or created a milestone, Postgres
-- RLS silently rejected the write; the app swallows that error in a .catch and
-- only tells the user "saved locally — not synced", so the billing never
-- reached the server and disappeared on other devices / after a refresh.
--
-- This adds SalesOpsAdmin to the INSERT/UPDATE policies on both tables. DELETE
-- stays Manager-only, unchanged. Idempotent via ALTER POLICY (redefines the
-- existing policies rather than creating duplicates).

ALTER POLICY billing_milestones_ins ON billing_milestones
  WITH CHECK (has_role(VARIADIC ARRAY['Manager','Finance','FinanceAssistant','SalesOpsAdmin']));

ALTER POLICY billing_milestones_upd ON billing_milestones
  USING (has_role(VARIADIC ARRAY['Manager','Finance','FinanceAssistant','SalesOpsAdmin']))
  WITH CHECK (has_role(VARIADIC ARRAY['Manager','Finance','FinanceAssistant','SalesOpsAdmin']));

ALTER POLICY billing_payments_ins ON billing_payments
  WITH CHECK (has_role(VARIADIC ARRAY['Manager','Finance','FinanceAssistant','SalesOpsAdmin']));

ALTER POLICY billing_payments_upd ON billing_payments
  USING (has_role(VARIADIC ARRAY['Manager','Finance','FinanceAssistant','SalesOpsAdmin']))
  WITH CHECK (has_role(VARIADIC ARRAY['Manager','Finance','FinanceAssistant','SalesOpsAdmin']));
