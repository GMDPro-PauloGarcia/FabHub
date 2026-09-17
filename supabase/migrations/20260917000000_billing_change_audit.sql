-- ============================================================================
-- Migration 20260917 — DB-level change audit for billing records
--
-- Why: the existing audit_log only captures DELETEs (the client's
-- archiveFinancial runs on delete only). A staff *encoding error* — a mistyped
-- amount, wrong date, wrong bank — is an INSERT or UPDATE, which today leaves no
-- trace of the before/after or who did it. And the client path can silently drop
-- writes (the swallowed .catch behind "saved locally"), so it can't be trusted
-- to record the very edits we want to investigate.
--
-- This adds a database trigger that records every INSERT and UPDATE on
-- billing_payments and billing_milestones into the SAME audit_log table the
-- Audit Trail UI already reads — automatically, on the server, regardless of how
-- the change was made. DELETEs are left to the existing archiveFinancial flow
-- (which also captures a reason and enables restore), so they are not
-- double-logged.
--
-- Idempotent and additive: new columns use IF NOT EXISTS, triggers are dropped
-- and recreated. Existing audit_log rows and the delete/restore flow are
-- untouched.
-- ============================================================================

-- 1) Extend audit_log to hold the "before" image and a quick changed-field list.
--    (snapshot already holds the "after"/current row; performed_by the actor.)
alter table public.audit_log
  add column if not exists old_snapshot   jsonb,
  add column if not exists changed_fields text[];

-- 2) Trigger function: log the row's before/after and who changed it.
create or replace function public.audit_billing_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  actor   text;
  changed text[];
  k       text;
begin
  -- Best available identity from the request's JWT, falling back to the row's
  -- own recorded_by (billing_payments) when there is no JWT (server/admin).
  actor := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email',
    to_jsonb(new) ->> 'recorded_by',
    'unknown'
  );

  if (tg_op = 'UPDATE') then
    -- No-op update (a resave with identical values): don't clutter the trail.
    if to_jsonb(new) = to_jsonb(old) then
      return new;
    end if;
    -- Which columns actually changed — the fast path to spotting a mis-key.
    select array_agg(key)
      into changed
      from jsonb_each(to_jsonb(new)) n
      where n.value is distinct from (to_jsonb(old) -> n.key);
  end if;

  insert into public.audit_log
    (table_name, record_id, action, old_snapshot, snapshot, changed_fields, performed_by, reason)
  values
    (tg_table_name,
     coalesce(new.id, old.id)::text,
     lower(tg_op),                                   -- 'insert' | 'update'
     case when tg_op = 'UPDATE' then to_jsonb(old) end,
     to_jsonb(new),
     changed,
     actor,
     case when tg_op = 'UPDATE' then 'field edit' else 'created' end);

  return new;
end
$fn$;

-- 3) Attach to the billing tables (INSERT + UPDATE only; DELETE stays with
--    archiveFinancial). AFTER so it only logs changes that actually committed.
do $do$
declare
  tbl text;
begin
  foreach tbl in array array['billing_payments','billing_milestones'] loop
    if to_regclass('public.'||tbl) is null then
      raise notice 'skipping missing table: %', tbl; continue;
    end if;
    execute format('drop trigger if exists trg_audit_change on public.%I', tbl);
    execute format(
      'create trigger trg_audit_change after insert or update on public.%I '
      'for each row execute function public.audit_billing_change()', tbl);
  end loop;
end $do$;

select 'Migration 20260917 applied — billing INSERT/UPDATE audit trigger active' as status;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--   drop trigger if exists trg_audit_change on public.billing_payments;
--   drop trigger if exists trg_audit_change on public.billing_milestones;
--   drop function if exists public.audit_billing_change();
--   -- (leave the audit_log columns; they are harmless and hold history)
