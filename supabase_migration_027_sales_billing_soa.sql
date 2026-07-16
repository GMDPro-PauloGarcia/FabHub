-- ── Migration 027: Sales — read-only access to Billing (SOA) ─────────────────
-- Sales needs to VIEW billing milestones/payments and print Statements of
-- Account (SOA) so they can send client billings. This grants SELECT only —
-- INSERT/UPDATE/DELETE stay Manager/Finance-only (unchanged from migration 024,
-- and enforced in the UI by BillingView's `canEdit = Manager|Finance` gate).
--
-- This reconciles a pre-existing inconsistency documented in docs/ACCESS_MATRIX.md:
-- the frontend RT_SUB_ROLES map and the "Read-access reference" already listed
-- Sales for billing_*, but the matrix row and migration 024's SELECT policy did
-- not. Decision (2026-07-16): Sales gets view/SOA on billing.
--
-- Depends on the public.has_role(...) helper created in migration 024.
-- Additive + idempotent: drops and re-creates only the two SELECT policies.

drop policy if exists billing_milestones_sel on public.billing_milestones;
create policy billing_milestones_sel on public.billing_milestones
  for select to authenticated
  using ( public.has_role('Manager','Finance','Accounting','Sales') );

drop policy if exists billing_payments_sel on public.billing_payments;
create policy billing_payments_sel on public.billing_payments
  for select to authenticated
  using ( public.has_role('Manager','Finance','Accounting','Sales') );
