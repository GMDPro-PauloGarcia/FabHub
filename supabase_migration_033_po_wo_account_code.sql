-- ── Migration 033: account code on Purchase Orders and Work Orders ────────────
-- Procurement now tags each order with a Chart-of-Accounts code (Aerwin's
-- accountCode). The code flows to the auto-created payable (syncPoPayable /
-- syncWoPayable) and from there into Project Profitability and the financial
-- reports. Both columns are nullable/blank-default so existing rows are unaffected.

ALTER TABLE purchase_requests  ADD COLUMN IF NOT EXISTS account_code TEXT DEFAULT '';
ALTER TABLE subcon_work_orders ADD COLUMN IF NOT EXISTS account_code TEXT DEFAULT '';
