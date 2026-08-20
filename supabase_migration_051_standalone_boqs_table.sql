-- ── Migration 051: give standalone BOQs their own table ─────────────────────
-- Follow-up to migration 050. Standalone BOQs (the ones not tied to a pipeline
-- deal) were all stored as ONE JSON array blob in app_settings under
-- key='standalone_boqs'. That single-blob design is the last remaining "lost
-- BOQ" risk: every save rewrites the whole array, so a client with a stale copy
-- can clobber a BOQ another user just added. Migration 050 widened who could
-- write the blob, but the blob shape itself stayed fragile.
--
-- Fix: move standalone BOQs into a proper dedicated table — ONE ROW PER BOQ,
-- exactly like deals.boq_data and boq_library. Concurrent authors touch
-- independent rows, so there is nothing left to clobber; Supabase is the single
-- source of truth (the client keeps only an offline cache, reconciled per id on
-- every load). Deal-linked BOQs are unaffected — they already live in
-- deals.boq_data.
--
-- Uses the public.has_role() / public.is_user() helpers defined in migration 037.

create table if not exists public.standalone_boqs (
  id           uuid primary key,
  title        text        not null default '',
  location     text        not null default '',
  quotation_no text        not null default '',
  boq_date     date,
  items        jsonb       not null default '[]'::jsonb,
  sections     jsonb       not null default '[]'::jsonb,
  vat_enabled  boolean     not null default true,
  discount     text        not null default '',
  markup_pct   text        not null default '',
  created_by   text        not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists standalone_boqs_updated_at_idx
  on public.standalone_boqs (updated_at desc);

alter table public.standalone_boqs enable row level security;

-- SELECT: every authenticated user, matching the old app_settings SELECT (is_user()).
drop policy if exists standalone_boqs_sel on public.standalone_boqs;
create policy standalone_boqs_sel on public.standalone_boqs
  for select to authenticated
  using (public.is_user());

-- INSERT/UPDATE: the roles that can build a BOQ in the app (same set migration
-- 050 granted on the app_settings blob).
drop policy if exists standalone_boqs_ins on public.standalone_boqs;
create policy standalone_boqs_ins on public.standalone_boqs
  for insert to authenticated
  with check (public.has_role('Manager','Sales','SalesOpsAdmin','QS','Design'));

drop policy if exists standalone_boqs_upd on public.standalone_boqs;
create policy standalone_boqs_upd on public.standalone_boqs
  for update to authenticated
  using (public.has_role('Manager','Sales','SalesOpsAdmin','QS','Design'))
  with check (public.has_role('Manager','Sales','SalesOpsAdmin','QS','Design'));

-- DELETE: matches the UI's delete affordance (Manager / QS only).
drop policy if exists standalone_boqs_del on public.standalone_boqs;
create policy standalone_boqs_del on public.standalone_boqs
  for delete to authenticated
  using (public.has_role('Manager','QS'));

-- ── Backfill: copy existing BOQs out of the app_settings blob ────────────────
-- One row per element of the old array. ON CONFLICT DO NOTHING makes this
-- idempotent (safe to re-run). The old app_settings row is intentionally left
-- in place as a backstop until the new table is confirmed good in production;
-- the app stops reading/writing it as of the matching frontend change.
insert into public.standalone_boqs
  (id, title, location, quotation_no, boq_date, items, sections,
   vat_enabled, discount, markup_pct, created_by, created_at, updated_at)
select
  (b->>'id')::uuid,
  coalesce(b->>'title',''),
  coalesce(b->>'location',''),
  coalesce(b->>'quotationNo',''),
  nullif(b->>'boqDate','')::date,
  coalesce(b->'items','[]'::jsonb),
  coalesce(b->'sections','[]'::jsonb),
  coalesce((b->>'vatEnabled')::boolean, true),
  coalesce(b->>'discount',''),
  coalesce(b->>'markupPct',''),
  coalesce(b->>'createdBy',''),
  coalesce(nullif(b->>'createdAt','')::timestamptz, now()),
  coalesce(nullif(b->>'updatedAt','')::timestamptz, now())
from public.app_settings s,
     lateral jsonb_array_elements(s.value) as b
where s.key = 'standalone_boqs'
  and jsonb_typeof(s.value) = 'array'
  and (b->>'id') is not null
on conflict (id) do nothing;

select 'Migration 051 applied — standalone BOQs moved to their own table' as status,
       (select count(*) from public.standalone_boqs) as boq_rows;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--   drop table if exists public.standalone_boqs;
--   (the app_settings 'standalone_boqs' blob was never deleted, so reverting the
--    frontend change restores the previous behavior with no data loss.)
