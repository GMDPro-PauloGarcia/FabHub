-- Migration 051: Standby PO / Adhoc umbrella on deals
-- Marks a parent deal as a client PO (standby fund) rather than earned revenue.
-- When standby_po is true the umbrella carries no contract value of its own
-- (its `value` is pinned to 0) and its child jobs (drawdowns) carry the value.
-- po_budget is the PO ceiling those drawdowns count down against
-- (remaining = po_budget − Σ active children). This prevents the PO from being
-- double-counted on top of the jobs charged against it.

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS standby_po boolean NOT NULL DEFAULT false;

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS po_budget numeric NOT NULL DEFAULT 0
  CHECK (po_budget >= 0);

COMMENT ON COLUMN deals.standby_po IS
  'True when this parent deal is a client PO / standby fund. The umbrella earns nothing itself (value held at 0); its child jobs draw down against po_budget.';
COMMENT ON COLUMN deals.po_budget IS
  'PO ceiling the standby fund is drawn down against. Remaining = po_budget − sum of active child job values. 0 when standby_po is false.';
