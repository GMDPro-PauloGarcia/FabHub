-- ============================================================================
-- FabHub Migration 047 — Warehouse witnessing & scrap control (Policy §5.3)
-- Run in Supabase SQL Editor (safe to re-run; all IF NOT EXISTS / nullable).
--
-- The Receivables & Finance Policy makes Finance a required witness on the
-- release/withdrawal of high-value materials (e.g. electrical wire) and any
-- residual/returned materials, and requires all scrap to be requested and sold
-- with a Finance representative present. This adds the flat columns that let a
-- stock movement record its Finance witness and flag high-value items.
--
-- New columns
--   inventory_items.high_value    — item requires a Finance witness on release
--   stock_movements.finance_witness — name of the Finance witness present
--   stock_movements.high_value    — snapshot: this movement needed witnessing
-- ============================================================================

alter table public.inventory_items add column if not exists high_value      boolean not null default false;
alter table public.stock_movements add column if not exists finance_witness text;
alter table public.stock_movements add column if not exists high_value      boolean not null default false;

select 'Migration 047 applied — warehouse witness/scrap columns added' as status;
