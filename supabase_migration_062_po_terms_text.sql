-- ── Migration 062: free-text Terms & Conditions on Purchase Orders ───────────
-- Alongside the payment term (migration 061), a PO can now carry free-text
-- Terms & Conditions captured on the PO form and printed on the PO PDF. When
-- blank, the printed PO falls back to the standard boilerplate (PO_TERMS_DEFAULT)
-- so a supplier always reads a complete set of terms. Nullable/blank-default so
-- existing rows are unaffected.

ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS terms_text TEXT DEFAULT '';
