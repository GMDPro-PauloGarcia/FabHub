-- Client field = pick from the client list; "Add client" goes through the server (Paulo, 2026-11-27)
--
-- Why: deals.client is typed free text. Credit terms (client_credit_terms) and
-- every client report match on the exact name, so "Primer Group" and
-- "PRIMER GROUP OF COMPANIES" are two clients. On 2026-11-27: 138 client names
-- on deals, 43 of them not in the clients master list (e.g. "Anthem" /
-- "Anthem Group", "Yobo International Food Corp." / "... Corporation", names
-- with a trailing space), and no deal created in the last 30 days had client_id.
-- The clients table (102 rows) existed but the app never read or wrote it.
--
-- This migration:
--   * client_match_key(text): the server copy of clientMatchKey (src/core.js):
--     lower case, punctuation / - & / flattened, corporate suffixes stripped.
--   * add_client(name): the only way the app adds a client. Manager, Sales,
--     SalesOpsAdmin (same as the clients_ins policy). Name 2-200 chars, spaces
--     collapsed. Returns the existing name when it is already a client (any
--     case). Refuses a name whose match key equals an existing client or a
--     client name on a deal ("Matchanese" vs "Matchanese Inc"), naming it.
--     A CLOSE match (one key starts with the other, or both start with the
--     same word of 4+ letters: "Primer Group" vs "PRIMER GROUP OF COMPANIES")
--     is refused too unless p_confirmed = true (the user said "it is a
--     different company"); the names it was confirmed against go to the
--     audit_log row (action 'client_add').
--   * trg_deals_link_client: sets deals.client_id from the client name on every
--     insert / client change (exact match, case and outer spaces ignored), so
--     deals link to the master list without the app sending client_id.
--
-- The app's ClientAutocomplete calls add_client, so apply this before that
-- code merges. Existing names on deals are not changed here.

create or replace function public.client_match_key(p text)
returns text
language sql
immutable
set search_path = pg_catalog, public
as $$
  select btrim(regexp_replace(
           regexp_replace(
             regexp_replace(
               regexp_replace(lower(coalesce(p, '')), '[.,]+', ' ', 'g'),
               '[-&/]+', ' ', 'g'),
             '\m(incorporated|corporation|corp|inc|company|co|ltd|limited|enterprises?|ventures?|trading|holdings?|group|philippines|phils?|ph)\M', ' ', 'g'),
           '\s+', ' ', 'g'))
$$;
grant execute on function public.client_match_key(text) to authenticated;
revoke execute on function public.client_match_key(text) from public, anon;

create or replace function public.add_client(p_name text, p_confirmed boolean default false)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_key  text;
  v_hit  text;
  v_near text;
  v_first text;
begin
  if not public.has_role('Manager', 'Sales', 'SalesOpsAdmin') then
    raise exception 'Only Sales, SalesOpsAdmin or a Manager can add a client. Ask them, or pick an existing client.'
      using errcode = '42501';
  end if;
  if length(v_name) < 2 or length(v_name) > 200 then
    raise exception 'Client name must be 2 to 200 characters.' using errcode = '22023';
  end if;
  select name into v_hit from public.clients where lower(btrim(name)) = lower(v_name) limit 1;
  if v_hit is not null then
    return v_hit;
  end if;
  v_key := public.client_match_key(v_name);
  if v_key = '' then
    raise exception 'Give the full client name, not only "Inc" / "Corp".' using errcode = '22023';
  end if;
  select n into v_hit from (
    select name as n from public.clients where public.client_match_key(name) = v_key
    union all
    select client from public.deals where coalesce(client, '') <> '' and public.client_match_key(client) = v_key
  ) x limit 1;
  if v_hit is not null then
    raise exception 'Already a client: "%". Pick it from the list instead of adding a new one.', btrim(v_hit)
      using errcode = '23505';
  end if;
  v_first := split_part(v_key, ' ', 1);
  select string_agg(distinct btrim(n), '", "') into v_near from (
    select name as n from public.clients
    union all
    select client from public.deals where coalesce(client, '') <> ''
  ) x
  where (length(v_key) >= 4 and public.client_match_key(n) like v_key || ' %')
     or (length(public.client_match_key(n)) >= 4 and v_key like public.client_match_key(n) || ' %')
     or (length(v_first) >= 4 and split_part(public.client_match_key(n), ' ', 1) = v_first);
  if v_near is not null and not coalesce(p_confirmed, false) then
    raise exception 'Close to existing client(s): "%". Pick one of them, or confirm this is a different company.', v_near
      using errcode = 'P0001', hint = 'confirm_different';
  end if;
  insert into public.clients (name, is_active, created_by)
  values (v_name, true, public.app_username());
  insert into public.audit_log (table_name, record_id, action, snapshot, performed_by, reason)
  values ('clients', v_name, 'client_add', jsonb_build_object('name', v_name, 'confirmed_different_from', v_near),
          public.app_username(),
          case when v_near is null then 'added from the deal form'
               else 'added from the deal form; confirmed a different company from "' || v_near || '"' end);
  return v_name;
end $$;
revoke execute on function public.add_client(text, boolean) from public, anon;
grant execute on function public.add_client(text, boolean) to authenticated;

create or replace function public.deals_link_client()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'UPDATE' and new.client is not distinct from old.client and new.client_id is not null then
    return new;
  end if;
  new.client_id := (select c.id from public.clients c
                     where lower(btrim(c.name)) = lower(btrim(coalesce(new.client, '')))
                     order by c.created_at nulls last limit 1);
  return new;
end $$;
revoke execute on function public.deals_link_client() from public, anon, authenticated;

create or replace trigger trg_deals_link_client
  before insert or update of client on public.deals
  for each row execute function public.deals_link_client();

select 'Migration 20261128020000 applied: add_client RPC, client_match_key, deals linked to clients' as status;

-- ROLLBACK (run by hand):
--   drop trigger if exists trg_deals_link_client on public.deals;
--   drop function if exists public.deals_link_client();
--   drop function if exists public.add_client(text, boolean);
--   drop function if exists public.client_match_key(text);
-- deals.client_id values it set can stay (they only point at the matching client).
