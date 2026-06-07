-- ── Migration 008: Extend cash_positions for full daily cash data ─────────────
-- Adds beginning balances, book balances, manual collections, transactions JSON,
-- and YTD payables so the full DailyCashPosition state is persisted to Supabase.

ALTER TABLE cash_positions
  ADD COLUMN IF NOT EXISTS bpi_beg                 NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bpi_book                NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS metrobank_beg           NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS metrobank_book          NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS chinabank_beg           NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS chinabank_book          NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bdo_beg                 NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bdo_book                NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS secbank_beg             NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS secbank_book            NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unionbank_beg           NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unionbank_book          NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manual_collection_amt   NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manual_collection_note  TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS transactions            JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS ytd_supplier_payable    NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ytd_loans_payable       NUMERIC DEFAULT 0;
