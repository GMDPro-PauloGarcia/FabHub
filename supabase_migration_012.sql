-- ── Migration 012: Procurement → Accounting → Finance pipeline ───────────────
-- Flow agreed with Finance:
--   1) Procurement officers create the PO / Work Order
--   2) Designated approver (e.g. Marian) approves → document goes to Accounting
--   3) Accounting checks and takes notes on the PO
--   4) Finance creates the Payment Order, tagged with the paying bank account
-- The pipeline state lives on each PO line (duplicated per line, same pattern
-- as supplier/discount) and on each subcon work order.

ALTER TABLE purchase_requests
  ADD COLUMN IF NOT EXISTS acct_status        TEXT DEFAULT '',   -- '' | 'For Accounting' | 'Checked' | 'Payment Ordered'
  ADD COLUMN IF NOT EXISTS acct_notes         TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS acct_checked_by    TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS acct_checked_at    DATE,
  ADD COLUMN IF NOT EXISTS payment_bank       TEXT DEFAULT '',   -- BANKS id: bpi/metro/china/bdo/security/union
  ADD COLUMN IF NOT EXISTS payment_ref        TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS payment_ordered_by TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS payment_ordered_at DATE;

ALTER TABLE subcon_work_orders
  ADD COLUMN IF NOT EXISTS acct_status        TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS acct_notes         TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS acct_checked_by    TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS acct_checked_at    DATE,
  ADD COLUMN IF NOT EXISTS payment_bank       TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS payment_ref        TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS payment_ordered_by TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS payment_ordered_at DATE;

-- "All expenses accounted for with proper tagging": an expense can reference
-- the PO / WO it pays. Tagged expenses are treated as payments of an already-
-- counted commitment and are EXCLUDED from project budget actuals (the PO/WO
-- line already carries the cost), while still counting in cash/bank views.
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS po_ref TEXT DEFAULT '';
