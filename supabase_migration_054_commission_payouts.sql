-- ── Migration 054: commission_payouts — track what sales commission is PAID ──
-- Context: the app already computes commission EARNED per sales owner from cash
-- collected (see commissionEarned in src/core.js and the 💰 Commissions tab).
-- What it never tracked is how much of that earned commission has actually been
-- DISBURSED to the rep, so "earned" silently doubled as "owed". This table gives
-- Manager, Sales and Finance one shared record of payouts, so the Commissions
-- view can show Earned → Paid → Payable and each rep can monitor their own.
--
-- Model (per the product decision): a payout is a LUMP amount for one rep for a
-- period (e.g. "Aug 2026"), entered by Finance and then APPROVED by a Manager.
-- Only APPROVED payouts count as "Paid" in the app's math; a "Recorded" payout
-- shows as pending approval. Per-deal attribution is intentionally out of scope
-- for v1 — payee + period is the unit.
--
-- Additive + idempotent: CREATE TABLE IF NOT EXISTS, safe to run on any project.
-- RLS mirrors the finance-table pattern and uses the public.has_role() helper
-- defined in migration 037.

CREATE TABLE IF NOT EXISTS public.commission_payouts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payee         TEXT    NOT NULL DEFAULT '',   -- sales owner name (matches deals.sales_owner)
  period_label  TEXT    NOT NULL DEFAULT '',   -- e.g. "Aug 2026"
  period_start  DATE,
  period_end    DATE,
  amount        NUMERIC NOT NULL DEFAULT 0,    -- peso amount disbursed
  status        TEXT    NOT NULL DEFAULT 'Recorded', -- Recorded → Approved → Void
  pay_bank      TEXT    DEFAULT '',
  pay_method    TEXT    DEFAULT '',
  pay_ref       TEXT    DEFAULT '',
  notes         TEXT    DEFAULT '',
  recorded_by   TEXT    DEFAULT '',
  recorded_at   TIMESTAMPTZ,
  approved_by   TEXT    DEFAULT '',
  approved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS commission_payouts_payee_idx  ON public.commission_payouts (payee);
CREATE INDEX IF NOT EXISTS commission_payouts_status_idx ON public.commission_payouts (status);

ALTER TABLE public.commission_payouts ENABLE ROW LEVEL SECURITY;

-- SELECT: everyone who needs visibility on commissions (Sales included, read-only).
DROP POLICY IF EXISTS commission_payouts_sel ON public.commission_payouts;
CREATE POLICY commission_payouts_sel ON public.commission_payouts
  FOR SELECT USING (has_role(VARIADIC ARRAY['Manager','Sales','Finance','FinanceAssistant','Accounting','SalesOpsAdmin']));

-- INSERT / UPDATE: Finance records and edits; Manager approves. (The record vs.
-- approve split is enforced in the UI — the DB grants both roles write access,
-- consistent with the app's existing client-side step-gating.)
DROP POLICY IF EXISTS commission_payouts_ins ON public.commission_payouts;
CREATE POLICY commission_payouts_ins ON public.commission_payouts
  FOR INSERT WITH CHECK (has_role(VARIADIC ARRAY['Manager','Finance','FinanceAssistant']));

DROP POLICY IF EXISTS commission_payouts_upd ON public.commission_payouts;
CREATE POLICY commission_payouts_upd ON public.commission_payouts
  FOR UPDATE USING      (has_role(VARIADIC ARRAY['Manager','Finance','FinanceAssistant']))
             WITH CHECK (has_role(VARIADIC ARRAY['Manager','Finance','FinanceAssistant']));

-- DELETE: Manager only.
DROP POLICY IF EXISTS commission_payouts_del ON public.commission_payouts;
CREATE POLICY commission_payouts_del ON public.commission_payouts
  FOR DELETE USING (has_role(VARIADIC ARRAY['Manager']));

select 'Migration 054 applied — commission_payouts table + RLS created' as status;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--   DROP TABLE IF EXISTS public.commission_payouts;
