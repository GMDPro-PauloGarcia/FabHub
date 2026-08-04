-- ── Migration 032: Accounts Payable — aging & partial-payment columns ─────────
-- Strengthens the Procurement → Finance/Accounting link by bringing FabHub's
-- payables in line with the finance team's Purchase-to-Payment ERP:
--   • ap_number      — human AP reference, e.g. AP-2026-0001 (mirrors PO/CV series)
--   • invoice_number — the vendor's invoice number (was only free-text in notes)
--   • invoice_date   — date on the vendor invoice (aging is measured from due_date)
--   • paid_amount    — cumulative amount paid, so a payable can be Partial
-- balance is derived (amount − paid_amount) in the app, not stored.
-- po_number / po_id already existed on the payable record shape; add them
-- defensively in case an older DB was provisioned before they were introduced.

ALTER TABLE payables
  ADD COLUMN IF NOT EXISTS ap_number      TEXT    DEFAULT '',
  ADD COLUMN IF NOT EXISTS invoice_number TEXT    DEFAULT '',
  ADD COLUMN IF NOT EXISTS invoice_date   DATE,
  ADD COLUMN IF NOT EXISTS paid_amount    NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS po_number      TEXT    DEFAULT '',
  ADD COLUMN IF NOT EXISTS po_id          TEXT;

-- Back-reference the AP on the check voucher so a printed CV can show both the
-- PO Reference (already present as po_ref) and the AP Reference, exactly like the
-- finance team's Check Voucher document.
ALTER TABLE check_vouchers
  ADD COLUMN IF NOT EXISTS ap_ref TEXT DEFAULT '';

-- Backfill: any already-settled payable is fully paid.
UPDATE payables SET paid_amount = amount
 WHERE status = 'Paid' AND (paid_amount IS NULL OR paid_amount = 0);
