-- ── Migration 061: payment terms on Purchase Orders ──────────────────────────
-- Warehouse policy: every PO now carries a payment term (COD / 7 / 15 / 30 / 60
-- / 90 / 120 days). The term is captured on the PO and, on delivery receipt,
-- drives the payable's due date (dueDateFromTerms) — taking precedence over the
-- supplier's default terms so a per-PO negotiation (e.g. COD rush order from a
-- Net-60 supplier) is honoured. Nullable/blank-default so existing rows are
-- unaffected; a blank term falls back to the supplier's terms as before.

ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS payment_terms TEXT DEFAULT '';
