-- ============================================================================
-- Migration 20260928 — Daily Cash Position guard rails (server side)
--
-- Why: on 2026-09-01 a sheet was saved with date 2026-09-28 (date-picker slip).
-- When 09/28 arrived the app opened that month-old copy as "today", showing 22
-- long-cleared checks as floating and hiding Friday's 28 open checks
-- (₱2,682,053.88). Two server gaps made it worse:
--   • nothing stopped a far-future date from being written, and
--   • every save REPLACES the whole day — the prior version is gone, and the
--     in-row audit only keeps totals, so an overwrite can't be restored.
--   • updated_at is never bumped on UPDATE (no trigger), so every row claims to
--     be as old as its first save.
--
-- This adds:
--   1) a BEFORE INSERT/UPDATE guard: stamps updated_at = now() and rejects a
--      date more than 3 days ahead of today (Asia/Manila) — the same lead the
--      app allows for pre-filling the next banking day (Fri → Mon).
--   2) public.cash_positions_history + an AFTER UPDATE/DELETE trigger that keeps
--      the full previous row of every save/delete, so any overwritten or
--      deleted day can be restored. Read-only to Finance roles; no client writes.
--
-- Idempotent and additive. Existing rows are untouched (the 3-day rule only
-- applies to new rows or to a changed date).
-- ============================================================================

-- 1) Guard: updated_at + no far-future dates -----------------------------------
create or replace function public.cash_positions_guard()
returns trigger
language plpgsql
set search_path = public
as $fn$
declare
  max_date date := (now() at time zone 'Asia/Manila')::date + 3;
begin
  new.updated_at := now();
  if (tg_op = 'INSERT' or new.date is distinct from old.date) and new.date > max_date then
    raise exception 'Cash position date % is more than 3 days ahead (latest allowed: %). Check the date picked.', new.date, max_date
      using errcode = 'check_violation';
  end if;
  return new;
end
$fn$;

drop trigger if exists trg_cash_positions_guard on public.cash_positions;
create trigger trg_cash_positions_guard
  before insert or update on public.cash_positions
  for each row execute function public.cash_positions_guard();

-- 2) Version history -------------------------------------------------------
-- Own table, not audit_log: Finance saves a day ~15 times, and the Audit Trail
-- page loads only the latest 500 audit_log rows — cash history would push
-- billing edits out of view within weeks.
create table if not exists public.cash_positions_history (
  id             uuid primary key default gen_random_uuid(),
  date           date not null,
  action         text not null,            -- 'update' | 'delete'
  old_row        jsonb not null,           -- the version that was replaced/removed
  new_row        jsonb,                    -- null on delete
  changed_fields text[],
  performed_by   text,
  performed_at   timestamptz not null default now()
);
create index if not exists cash_positions_history_date_idx
  on public.cash_positions_history (date, performed_at desc);

alter table public.cash_positions_history enable row level security;
drop policy if exists cash_positions_history_sel on public.cash_positions_history;
create policy cash_positions_history_sel on public.cash_positions_history
  for select to authenticated
  using (has_role(VARIADIC ARRAY['Manager','Finance','Accounting','FinanceAssistant']));
-- No INSERT/UPDATE/DELETE policies: only the SECURITY DEFINER trigger writes,
-- and nobody can edit or erase history from the client.

create or replace function public.audit_cash_position_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  actor   text;
  changed text[];
begin
  actor := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email',
    'unknown'
  );

  if tg_op = 'UPDATE' then
    -- A re-save with identical figures (only updated_at moved): don't clutter.
    if (to_jsonb(new) - 'updated_at') = (to_jsonb(old) - 'updated_at') then
      return new;
    end if;
    select array_agg(key) into changed
      from jsonb_each(to_jsonb(new)) n
      where n.key <> 'updated_at' and n.value is distinct from (to_jsonb(old) -> n.key);
    insert into public.cash_positions_history (date, action, old_row, new_row, changed_fields, performed_by)
      values (old.date, 'update', to_jsonb(old), to_jsonb(new), changed, actor);
    return new;
  end if;

  insert into public.cash_positions_history (date, action, old_row, performed_by)
    values (old.date, 'delete', to_jsonb(old), actor);
  return old;
end
$fn$;

drop trigger if exists trg_audit_cash_position on public.cash_positions;
create trigger trg_audit_cash_position
  after update or delete on public.cash_positions
  for each row execute function public.audit_cash_position_change();

select 'Migration 20260928 applied — cash_positions guard + version history active' as status;

-- ── RESTORE a day from history ──────────────────────────────────────────────
--   -- list versions of one day, newest first:
--   select performed_at, performed_by, changed_fields
--     from cash_positions_history where date='2026-09-25'
--     order by performed_at desc;
--   -- put a version back (pick its cash_positions_history.id):
--   update cash_positions c set (manual_collections, manual_disbursements, floating_checks, audit, notes,
--          bpi_beg, bpi_book, bpi_end, metrobank_beg, metrobank_book, metrobank_end,
--          chinabank_beg, chinabank_book, chinabank_end, bdo_beg, bdo_book, bdo_end,
--          secbank_beg, secbank_book, secbank_end, unionbank_beg, unionbank_book, unionbank_end)
--     = (select r.manual_collections, r.manual_disbursements, r.floating_checks, r.audit, r.notes,
--          r.bpi_beg, r.bpi_book, r.bpi_end, r.metrobank_beg, r.metrobank_book, r.metrobank_end,
--          r.chinabank_beg, r.chinabank_book, r.chinabank_end, r.bdo_beg, r.bdo_book, r.bdo_end,
--          r.secbank_beg, r.secbank_book, r.secbank_end, r.unionbank_beg, r.unionbank_book, r.unionbank_end
--        from cash_positions_history h, jsonb_populate_record(null::cash_positions, h.old_row) r
--        where h.id = '<history id>')
--   where c.date = '2026-09-25';
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--   drop trigger if exists trg_cash_positions_guard on public.cash_positions;
--   drop trigger if exists trg_audit_cash_position  on public.cash_positions;
--   drop function if exists public.cash_positions_guard();
--   drop function if exists public.audit_cash_position_change();
--   -- keep public.cash_positions_history; it is the history
