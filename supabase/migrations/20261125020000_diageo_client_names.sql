-- ============================================================================
-- Migration 20261125020000 — Diageo: 7 client names → its 2 billing entities
--
-- Why (Paulo, 2026-11-25): Billing now groups projects by client. Diageo was
-- typed 7 ways on 39 deals, so it showed as 7 clients. Diageo bills through
-- two entities:
--   Diageo PH               ← "Diageo PH", "Diageo PH (ECOM)", "Diageo Ph (Kariella)", "Diageo"
--   Diageo Scotland Limited ← "Diageo Scotland Limited", "Diageo PH Travel Retail", "Diageo PHTR"
-- (Paulo: Travel Retail is billed to Diageo Scotland Limited; Kariella is billed
-- to Diageo PH.) The department label moves to the front of the project name
-- (deals.contact) so nothing is lost: "ECOM · …", "Kariella · …",
-- "Travel Retail · …".
--
-- Also renamed: job_orders.client, project_cards.client, design_requests.client
-- (incl. "DIAGEO ECOMM"), design_request_forms.client, ce_requests.client_name.
-- Client picker: the extra "Diageo" entry in app_settings.customclients and the
-- old names' entries in app_settings.clientprofiles (all empty apart from
-- parentGroup / "Due on receipt") are removed, so Sales can't pick them again.
-- The built-in list (src/data/seed.js) already has exactly the two entities.
-- Not touched: invoice amounts, receipt types, payments, client_credit_terms
-- (every Diageo name is already on credit terms, both targets included).
--
-- Backup: client_rename_backup_20261125 (table, id, old client, old contact).
-- audit_log: one row per renamed deal (action 'client_rename').
-- Data only, idempotent (re-running finds nothing to rename). Release day only.
--
-- Open point for Finance: CE-2026-1350 (Kariella) is billed to Diageo PH, a VAT
-- entity, with an AR receipt. Check it should not be an OR.
-- ============================================================================

create table if not exists public.client_rename_backup_20261125 (
  tbl text not null, id text not null, client text, contact text,
  saved_at timestamptz not null default now(),
  primary key (tbl, id)
);
alter table public.client_rename_backup_20261125 enable row level security;
revoke all on public.client_rename_backup_20261125 from anon, authenticated;

create temp table _diageo_map (old_name text primary key, new_name text not null, label text) on commit drop;
insert into _diageo_map values
  ('Diageo PH (ECOM)',        'Diageo PH',               'ECOM'),
  ('DIAGEO ECOMM',            'Diageo PH',               'ECOM'),
  ('Diageo Ph (Kariella)',    'Diageo PH',               'Kariella'),
  ('Diageo',                  'Diageo PH',               null),
  ('Diageo PH Travel Retail', 'Diageo Scotland Limited', 'Travel Retail'),
  ('Diageo PHTR',             'Diageo Scotland Limited', 'Travel Retail');

-- Backups (first run only: on conflict keeps the original values)
insert into public.client_rename_backup_20261125 (tbl, id, client, contact)
select 'deals', d.id::text, d.client, d.contact from public.deals d join _diageo_map m on m.old_name = d.client
on conflict do nothing;
insert into public.client_rename_backup_20261125 (tbl, id, client)
select 'job_orders', j.id::text, j.client from public.job_orders j join _diageo_map m on m.old_name = j.client
on conflict do nothing;
insert into public.client_rename_backup_20261125 (tbl, id, client)
select 'project_cards', p.id::text, p.client from public.project_cards p join _diageo_map m on m.old_name = p.client
on conflict do nothing;
insert into public.client_rename_backup_20261125 (tbl, id, client)
select 'design_requests', r.id::text, r.client from public.design_requests r join _diageo_map m on m.old_name = r.client
on conflict do nothing;
insert into public.client_rename_backup_20261125 (tbl, id, client)
select 'design_request_forms', r.id::text, r.client from public.design_request_forms r join _diageo_map m on m.old_name = r.client
on conflict do nothing;
insert into public.client_rename_backup_20261125 (tbl, id, client)
select 'ce_requests', r.id::text, r.client_name from public.ce_requests r join _diageo_map m on m.old_name = r.client_name
on conflict do nothing;

-- audit_log, one row per deal
insert into public.audit_log (table_name, record_id, action, snapshot, reason, performed_by, performed_at)
select 'deals', d.id::text, 'client_rename',
       jsonb_build_object('ce_no', d.ce_no, 'old_client', d.client, 'new_client', m.new_name, 'old_contact', d.contact,
                          'new_contact', case when m.label is null or btrim(coalesce(d.contact,'')) ilike m.label || ' ·%' then btrim(coalesce(d.contact,''))
                                              else m.label || ' · ' || btrim(coalesce(d.contact,'')) end),
       'Diageo client names merged into its 2 billing entities (Paulo, 2026-11-25)', 'Paulo Garcia', now()
  from public.deals d join _diageo_map m on m.old_name = d.client;

-- Renames
update public.deals d
   set contact = case when m.label is null or btrim(coalesce(d.contact,'')) ilike m.label || ' ·%' then btrim(coalesce(d.contact,''))
                      else m.label || ' · ' || btrim(coalesce(d.contact,'')) end,
       client  = m.new_name
  from _diageo_map m where m.old_name = d.client;
update public.job_orders j set client = m.new_name from _diageo_map m where m.old_name = j.client;
update public.project_cards p set client = m.new_name from _diageo_map m where m.old_name = p.client;
update public.design_requests r set client = m.new_name from _diageo_map m where m.old_name = r.client;
update public.design_request_forms r set client = m.new_name from _diageo_map m where m.old_name = r.client;
update public.ce_requests r set client_name = m.new_name from _diageo_map m where m.old_name = r.client_name;

-- Client picker settings (backed up first)
insert into public.client_rename_backup_20261125 (tbl, id, client)
select 'app_settings', key, value::text from public.app_settings where key in ('customclients','clientprofiles')
on conflict do nothing;
update public.app_settings
   set value = (select coalesce(jsonb_agg(e), '[]'::jsonb) from jsonb_array_elements(value) e
                 where not exists (select 1 from _diageo_map m where lower(m.old_name) = lower(e->>'name'))),
       updated_at = now()
 where key = 'customclients' and jsonb_typeof(value) = 'array'
   and exists (select 1 from jsonb_array_elements(value) e join _diageo_map m on lower(m.old_name) = lower(e->>'name'));
update public.app_settings
   set value = value - array(select old_name from _diageo_map), updated_at = now()
 where key = 'clientprofiles' and jsonb_typeof(value) = 'object'
   and value ?| array(select old_name from _diageo_map);

-- ROLLBACK (puts every renamed row back from the backup):
-- update public.deals d set client = b.client, contact = b.contact from public.client_rename_backup_20261125 b where b.tbl = 'deals' and b.id = d.id::text;
-- update public.job_orders x set client = b.client from public.client_rename_backup_20261125 b where b.tbl = 'job_orders' and b.id = x.id::text;
-- update public.project_cards x set client = b.client from public.client_rename_backup_20261125 b where b.tbl = 'project_cards' and b.id = x.id::text;
-- update public.design_requests x set client = b.client from public.client_rename_backup_20261125 b where b.tbl = 'design_requests' and b.id = x.id::text;
-- update public.design_request_forms x set client = b.client from public.client_rename_backup_20261125 b where b.tbl = 'design_request_forms' and b.id = x.id::text;
-- update public.ce_requests x set client_name = b.client from public.client_rename_backup_20261125 b where b.tbl = 'ce_requests' and b.id = x.id::text;
-- update public.app_settings a set value = b.client::jsonb from public.client_rename_backup_20261125 b where b.tbl = 'app_settings' and b.id = a.key;
