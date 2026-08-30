-- Migration 057: delivery_receipts — standalone / manually entered Delivery
-- Receipts (goods received notes) not necessarily tied to a purchase order.
-- The Warehouse "Receipts" ledger merges these with PO-derived receipts.
-- App-written rows use a client-generated uuid PK.
-- RLS mirrors the live permissive gate (see migration 027's note).

create table if not exists public.delivery_receipts (
  id            uuid        primary key,
  dr_no         text        not null default '',
  dr_date       date,
  supplier      text        not null default '',
  project_id    text,
  project_name  text        not null default '',
  po_number     text        not null default '',
  items         jsonb       not null default '[]'::jsonb,
  total         numeric     not null default 0,
  remarks       text        not null default '',
  received_by   text        not null default '',
  created_by    text        not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists delivery_receipts_dr_date_idx on public.delivery_receipts (dr_date desc);

alter table public.delivery_receipts enable row level security;

drop policy if exists fabhub_app_access on public.delivery_receipts;
create policy fabhub_app_access on public.delivery_receipts
  for all to authenticated, anon using (true) with check (true);
