-- ── Migration 009: PO-level discount + atomic PO number allocation ───────────
-- 1) Discount: a PO is stored as multiple purchase_requests rows sharing one
--    po_number, so the PO-level discount is duplicated on each row (same
--    pattern as supplier / po_date / status).
--    po_discount_type: '' (none) | 'amt' (₱ amount) | 'pct' (percent of subtotal)

ALTER TABLE purchase_requests
  ADD COLUMN IF NOT EXISTS po_discount_type  TEXT    DEFAULT '',
  ADD COLUMN IF NOT EXISTS po_discount_value NUMERIC DEFAULT 0;

-- 2) Atomic PO number allocator. PO numbers were previously computed in the
--    browser (max existing + 1) when the form OPENED, so two officers filling
--    a PO at the same time were both suggested the same number. The app now
--    claims the number at SUBMIT time through this function, which locks the
--    counter row so concurrent submits get sequential numbers. It self-heals
--    past any number already used (typed manually or created while offline).

CREATE TABLE IF NOT EXISTS po_counter (
  id      INT PRIMARY KEY,
  last_no INT NOT NULL DEFAULT 0
);
INSERT INTO po_counter (id, last_no) VALUES (1, 0) ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION next_po_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  max_used INT;
  new_no   INT;
BEGIN
  SELECT COALESCE(MAX(substring(po_number FROM '^PO-(\d+)$')::INT), 0)
    INTO max_used
    FROM purchase_requests
   WHERE po_number ~ '^PO-\d+$';

  UPDATE po_counter
     SET last_no = GREATEST(last_no, max_used) + 1
   WHERE id = 1
  RETURNING last_no INTO new_no;

  RETURN 'PO-' || lpad(new_no::TEXT, 4, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION next_po_number() TO anon, authenticated;
