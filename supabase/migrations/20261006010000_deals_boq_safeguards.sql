-- ============================================================================
-- Migration 20261006a — BOQ safeguards on deals (server side)
--
-- Owner decision (Paulo Garcia, 2026-10-06), alongside PR #357 (Duplicate BOQ
-- to deal / final linking). The app enforces these rules already; this makes
-- them hold for every client, including old open tabs and direct API calls.
--
--   1) Mother POs (deals.standby_po) never carry a price or a BOQ. They earn ₱0
--      themselves; sub-projects carry the money. Rejects a write that SETS a
--      non-zero value or a BOQ on a mother PO, or turns a priced deal into one.
--      Unrelated edits to an existing row are not blocked.
--   2) Only a Manager can clear a deal's BOQ (content → empty/null). Editing a
--      BOQ, including deleting rows, is unaffected until the very last row.
--   3) public.deals_boq_history keeps the previous BOQ on every change and on
--      deal delete, so any overwrite or wipe can be restored. A burst of
--      autosaves by one person is checkpointed at most every 2 minutes.
--      Read-only to the roles that edit BOQs; only the trigger writes it.
--
-- Server-side callers with no JWT (SQL editor, migrations) are not restricted.
-- Mirrors isMotherPO / attachBoqToDeal (src/App.jsx) and the BOQ builder's
-- Clear Draft gate (src/views/BOQBuilder.jsx) — keep in sync.
-- Idempotent, and uses no DROP (create or replace / if not exists only).
-- ============================================================================

-- Shared helper: does a BOQ blob have any rows or sections?
create or replace function public.boq_has_content(b jsonb)
returns boolean
language sql
immutable
set search_path = pg_catalog, public
as $fn$
  select coalesce(
       (jsonb_typeof(b -> 'items') = 'array'    and jsonb_array_length(b -> 'items') > 0)
    or (jsonb_typeof(b -> 'sections') = 'array' and jsonb_array_length(b -> 'sections') > 0),
    false)
$fn$;

-- 1 + 2) Guard ---------------------------------------------------------------
create or replace function public.deals_boq_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $fn$
declare
  has_jwt boolean := coalesce(current_setting('request.jwt.claims', true), '') <> '';
  became_mother boolean;
begin
  if not has_jwt then
    return new;
  end if;

  if coalesce(new.standby_po, false) then
    became_mother := tg_op = 'INSERT' or not coalesce(old.standby_po, false);
    if coalesce(new.value, 0) <> 0
       and (became_mother or new.value is distinct from old.value) then
      raise exception '% is a mother PO (standby PO) and can''t have a price. Put the value on its sub-project.', coalesce(new.ce_no, 'This deal')
        using errcode = 'check_violation';
    end if;
    if public.boq_has_content(new.boq_data)
       and (became_mother or new.boq_data is distinct from old.boq_data) then
      raise exception '% is a mother PO (standby PO) and can''t carry a BOQ. Put the BOQ on its sub-project.', coalesce(new.ce_no, 'This deal')
        using errcode = 'check_violation';
    end if;
  end if;

  if tg_op = 'UPDATE'
     and public.boq_has_content(old.boq_data)
     and not public.boq_has_content(new.boq_data)
     and not public.is_mgr() then
    raise exception 'Only a Manager can clear the BOQ on %.', coalesce(old.ce_no, 'this deal')
      using errcode = 'check_violation';
  end if;

  return new;
end
$fn$;
revoke execute on function public.deals_boq_guard() from public, anon, authenticated;

create or replace trigger trg_deals_boq_guard
  before insert or update of boq_data, value, standby_po on public.deals
  for each row execute function public.deals_boq_guard();

-- 3) Version history ----------------------------------------------------------
create table if not exists public.deals_boq_history (
  id             uuid primary key default gen_random_uuid(),
  deal_id        uuid not null,             -- no FK: history must outlive a deleted deal
  ce_no          text,
  action         text not null,             -- 'update' | 'delete'
  old_boq        jsonb not null,            -- the version that was replaced/removed
  old_value      numeric,
  new_item_count int,                       -- null on delete
  performed_by   text,
  performed_at   timestamptz not null default now()
);
create index if not exists deals_boq_history_deal_idx
  on public.deals_boq_history (deal_id, performed_at desc);

alter table public.deals_boq_history enable row level security;
do $p$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
                  and tablename = 'deals_boq_history' and policyname = 'deals_boq_history_sel') then
    create policy deals_boq_history_sel on public.deals_boq_history
      for select to authenticated
      using (has_role(VARIADIC ARRAY['Manager','QS','Sales','SalesOpsAdmin']));
  end if;
end $p$;
-- No INSERT/UPDATE/DELETE policies: only the SECURITY DEFINER trigger writes,
-- and nobody can edit or erase history from the client.

create or replace function public.audit_deal_boq_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare
  actor text := nullif(public.app_username(), '');
begin
  if not public.boq_has_content(old.boq_data) then
    return coalesce(new, old);              -- nothing worth restoring
  end if;

  if tg_op = 'UPDATE' then
    if new.boq_data is not distinct from old.boq_data then
      return new;
    end if;
    -- Autosave fires every ~1s while someone types. Keep one checkpoint per
    -- 2-minute run of edits by the same person; a different editor, a wipe or
    -- a gap always gets its own row.
    if public.boq_has_content(new.boq_data) and exists (
         select 1 from public.deals_boq_history h
          where h.deal_id = old.id
            and h.performed_by is not distinct from actor
            and h.performed_at > now() - interval '2 minutes') then
      return new;
    end if;
    insert into public.deals_boq_history (deal_id, ce_no, action, old_boq, old_value, new_item_count, performed_by)
      values (old.id, old.ce_no, 'update', old.boq_data, old.value,
              case when jsonb_typeof(new.boq_data -> 'items') = 'array' then jsonb_array_length(new.boq_data -> 'items') else 0 end,
              actor);
    return new;
  end if;

  insert into public.deals_boq_history (deal_id, ce_no, action, old_boq, old_value, performed_by)
    values (old.id, old.ce_no, 'delete', old.boq_data, old.value, actor);
  return old;
end
$fn$;
revoke execute on function public.audit_deal_boq_change() from public, anon, authenticated;

create or replace trigger trg_audit_deal_boq
  after update of boq_data or delete on public.deals
  for each row execute function public.audit_deal_boq_change();

select 'Migration 20261006a applied — deals BOQ guard + BOQ history active' as status;

-- ── RESTORE a BOQ from history ───────────────────────────────────────────────
--   -- versions of one deal, newest first:
--   select h.id, h.performed_at, h.performed_by, h.action,
--          jsonb_array_length(h.old_boq->'items') as items, h.new_item_count
--     from deals_boq_history h join deals d on d.id = h.deal_id
--    where d.ce_no = 'CE-2026-XXXX' order by h.performed_at desc;
--   -- put a version back (pick its id):
--   update deals set boq_data = (select old_boq from deals_boq_history where id = '<history id>')
--    where id = (select deal_id from deals_boq_history where id = '<history id>');

-- ── ROLLBACK ──
--   drop trigger if exists trg_audit_deal_boq on public.deals;
--   drop trigger if exists trg_deals_boq_guard on public.deals;
--   drop function if exists public.audit_deal_boq_change();
--   drop function if exists public.deals_boq_guard();
--   drop function if exists public.boq_has_content(jsonb);
--   drop table if exists public.deals_boq_history;   -- loses saved history; export it first
