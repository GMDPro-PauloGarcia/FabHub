-- ============================================================
-- FabHub Migration 042 — full BOQ per change order
-- Run this in Supabase SQL Editor (safe to run multiple times)
--
-- A change order (addendum) can now carry its OWN full Bill of Quantities,
-- built in the same BOQ Builder used by the sales pipeline (sections, rate
-- card, per-line markup, VAT, discount). The flat `scope_items` array is
-- derived from this on save and still drives the approval → contract → BOQ
-- merge → billing pipeline, so nothing downstream changes.
--   co_boq_data — full BOQ Builder payload {items, sections, boqTitle,
--                 location, quotationNo, boqDate, vatEnabled, discount,
--                 markupPct} for this change order.
-- ============================================================

ALTER TABLE addenda
  ADD COLUMN IF NOT EXISTS co_boq_data JSONB DEFAULT NULL;

SELECT 'Migration 042 applied — co_boq_data added to addenda' AS status;
