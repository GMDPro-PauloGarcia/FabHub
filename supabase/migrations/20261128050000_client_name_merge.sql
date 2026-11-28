-- ============================================================================
-- Migration 20261128050000 — merge duplicate client spellings, fill the client list
--
-- Why (Paulo, 2026-11-28): the deal form's Client field is now a pick list over
-- the clients master table (20261128030000). Credit terms and client reports
-- match on the exact name, so the same company typed two ways counted as two.
-- Paulo's decisions:
--   Yobo International Food Corporation          → Yobo International Food Corp.
--   Bounce Marketing                             → Bounce Marketing Inc
--   Anthem                                       → Anthem Group   (legal name)
--   APOP (client list only)                      → Apop Collections
--   Popmart Ph Trading Corporation               → Popmart PH Trading Corporation
--   Viva International Foods and Restaurant Inc  → Viva Foods     ("same company, counted as Viva Foods")
--   names with leading / trailing spaces         → trimmed
-- Renamed on deals, job_orders, project_cards, design_requests,
-- design_request_forms and ce_requests (same tables as 20261125040000).
-- None of these names had credit terms or a saved client profile (checked 2026-11-28).
--
-- Client list (clients master):
--   * the kept names are added if missing;
--   * the old spellings, and the Diageo entries outside its 2 billing entities
--     (Diageo, Diageo Ecom, Diageo Kariella, Diageo Global, Diageo Travel Retail PH;
--     Paulo 2026-11-25), are set is_active = false (hidden from the picker, not deleted);
--   * every client name used on a deal that is not on the list is added
--     (created_by 'migration 20261128050000'), so the picker and
--     trg_deals_link_client know them;
--   * deals.client_id is linked for every deal whose client is on the list.
--
-- Backup: client_rename_backup_20261128 (table, id, old client).
-- audit_log: one 'client_rename' row per renamed deal.
-- Data only, idempotent (re-running finds nothing left to rename). Release day.
-- ============================================================================

create table if not exists public.client_rename_backup_20261128 (
  tbl text not null, id text not null, client text,
  saved_at timestamptz not null default now(),
  primary key (tbl, id)
);
alter table public.client_rename_backup_20261128 enable row level security;
revoke all on public.client_rename_backup_20261128 from anon, authenticated;

create temp table _client_map (old_name text primary key, new_name text not null) on commit drop;
insert into _client_map values
  ('Yobo International Food Corporation',         'Yobo International Food Corp.'),
  ('Bounce Marketing',                            'Bounce Marketing Inc'),
  ('Anthem',                                      'Anthem Group'),
  ('APOP',                                        'Apop Collections'),
  ('Popmart Ph Trading Corporation',              'Popmart PH Trading Corporation'),
  ('Viva International Foods and Restaurant Inc', 'Viva Foods');

-- What each row becomes: the mapped name, or the trimmed name.
create temp view _client_target as
  select x.old_raw, coalesce(m.new_name, btrim(x.old_raw)) as new_name
    from (select distinct client as old_raw from public.deals
          union select client from public.job_orders
          union select client from public.project_cards
          union select client from public.design_requests
          union select client from public.design_request_forms
          union select client_name from public.ce_requests) x
    left join _client_map m on m.old_name = btrim(x.old_raw)
   where x.old_raw is not null
     and (m.old_name is not null or x.old_raw <> btrim(x.old_raw));

-- Backups (first run only)
insert into public.client_rename_backup_20261128 (tbl, id, client)
select 'deals', d.id::text, d.client from public.deals d join _client_target t on t.old_raw = d.client on conflict do nothing;
insert into public.client_rename_backup_20261128 (tbl, id, client)
select 'job_orders', r.id::text, r.client from public.job_orders r join _client_target t on t.old_raw = r.client on conflict do nothing;
insert into public.client_rename_backup_20261128 (tbl, id, client)
select 'project_cards', r.id::text, r.client from public.project_cards r join _client_target t on t.old_raw = r.client on conflict do nothing;
insert into public.client_rename_backup_20261128 (tbl, id, client)
select 'design_requests', r.id::text, r.client from public.design_requests r join _client_target t on t.old_raw = r.client on conflict do nothing;
insert into public.client_rename_backup_20261128 (tbl, id, client)
select 'design_request_forms', r.id::text, r.client from public.design_request_forms r join _client_target t on t.old_raw = r.client on conflict do nothing;
insert into public.client_rename_backup_20261128 (tbl, id, client)
select 'ce_requests', r.id::text, r.client_name from public.ce_requests r join _client_target t on t.old_raw = r.client_name on conflict do nothing;
insert into public.client_rename_backup_20261128 (tbl, id, client)
select 'clients', c.id::text, c.name || case when c.is_active then '' else ' [inactive]' end from public.clients c on conflict do nothing;

-- audit_log, one row per renamed deal
insert into public.audit_log (table_name, record_id, action, snapshot, reason, performed_by, performed_at)
select 'deals', d.id::text, 'client_rename',
       jsonb_build_object('ce_no', d.ce_no, 'old_client', d.client, 'new_client', t.new_name),
       'Duplicate client spellings merged (Paulo, 2026-11-28)', 'Paulo Garcia', now()
  from public.deals d join _client_target t on t.old_raw = d.client;

-- Renames
update public.deals r set client = t.new_name from _client_target t where t.old_raw = r.client;
update public.job_orders r set client = t.new_name from _client_target t where t.old_raw = r.client;
update public.project_cards r set client = t.new_name from _client_target t where t.old_raw = r.client;
update public.design_requests r set client = t.new_name from _client_target t where t.old_raw = r.client;
update public.design_request_forms r set client = t.new_name from _client_target t where t.old_raw = r.client;
update public.ce_requests r set client_name = t.new_name from _client_target t where t.old_raw = r.client_name;

-- Client list: kept names in, old spellings and stray Diageo entries hidden
insert into public.clients (name, is_active, created_by)
select distinct new_name, true, 'migration 20261128050000' from _client_map
on conflict ((lower(name))) do update set is_active = true;
update public.clients c set is_active = false, updated_at = now()
 where c.is_active
   and (btrim(c.name) in (select old_name from _client_map)
        or btrim(c.name) in ('Diageo', 'Diageo Ecom', 'Diageo Kariella', 'Diageo Global', 'Diageo Travel Retail PH'));
update public.clients c set name = btrim(c.name), updated_at = now()
 where c.name <> btrim(c.name)
   and not exists (select 1 from public.clients o where o.id <> c.id and lower(o.name) = lower(btrim(c.name)));

-- Every client name on a deal is on the list
insert into public.clients (name, is_active, created_by)
select distinct on (lower(btrim(d.client))) btrim(d.client), true, 'migration 20261128050000'
  from public.deals d
 where coalesce(btrim(d.client), '') <> '' and not coalesce(d.is_cost_center, false)
   and not exists (select 1 from public.clients c where lower(c.name) = lower(btrim(d.client)))
on conflict ((lower(name))) do nothing;

-- Link deals to their client record
update public.deals d set client_id = c.id
  from public.clients c
 where lower(c.name) = lower(btrim(d.client))
   and d.client_id is distinct from c.id;

-- ROLLBACK (puts every renamed row back from the backup; the client list is
-- restored by name / active flag from the 'clients' rows of the backup):
-- update public.deals x set client = b.client from public.client_rename_backup_20261128 b where b.tbl = 'deals' and b.id = x.id::text;
-- update public.job_orders x set client = b.client from public.client_rename_backup_20261128 b where b.tbl = 'job_orders' and b.id = x.id::text;
-- update public.project_cards x set client = b.client from public.client_rename_backup_20261128 b where b.tbl = 'project_cards' and b.id = x.id::text;
-- update public.design_requests x set client = b.client from public.client_rename_backup_20261128 b where b.tbl = 'design_requests' and b.id = x.id::text;
-- update public.design_request_forms x set client = b.client from public.client_rename_backup_20261128 b where b.tbl = 'design_request_forms' and b.id = x.id::text;
-- update public.ce_requests x set client_name = b.client from public.client_rename_backup_20261128 b where b.tbl = 'ce_requests' and b.id = x.id::text;
-- update public.clients x set is_active = (b.client not like '% [inactive]') from public.client_rename_backup_20261128 b where b.tbl = 'clients' and b.id = x.id::text;
