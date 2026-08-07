-- ── Migration 039: inventory ownership / asset class ─────────────────────────
-- Differentiates GMD-owned stock (a company asset — reusable inventory or fixed
-- assets like tools and booth units) from materials bought for a specific client
-- project. Drives the Warehouse asset-value KPI and the ownership filter, and
-- lets Finance report GMD's own stock separately from project consumables.
--
-- Additive and safe: new column with a default, existing rows backfilled to
-- 'Project Stock' so nothing changes for current inventory. Must be applied
-- before the app ships invToSb() writing the `ownership` column, or inventory
-- upserts would fail on the missing column.

alter table public.inventory_items
  add column if not exists ownership text not null default 'Project Stock';

-- Backfill any pre-existing NULLs (no-op when the default already covered them).
update public.inventory_items
  set ownership = 'Project Stock'
  where ownership is null;
