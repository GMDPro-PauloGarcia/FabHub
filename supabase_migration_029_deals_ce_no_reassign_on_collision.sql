-- ── Migration 029: CE numbers reassign on collision instead of dropping the deal ──
-- Root cause of a stranded deal (reported live 2026-07-28): a deal whose INSERT
-- carried a ce_no that ALREADY existed on another row violated the
-- deals_ce_no_uniq partial unique index (migration 022). The client classifies a
-- duplicate-key error as non-retryable ('data'), so the whole deal was dropped
-- from the sync queue and NEVER reached the server — while later edits to that
-- ghost row kept failing with "No row matched id=… — it may not exist on the
-- server yet." The deal existed only in the user's browser.
--
-- How a colliding ce_no arises even though migration 020 made the DB the number
-- authority: the client still sends a non-blank ce_no on the online happy path
-- (claimed up front when the Add-Deal form opened). That value can go stale —
-- another device saves a deal, or a long-open / offline / cached-build tab
-- re-pushes an old local deal via "Push All Data to Cloud" — so the number it
-- carries now belongs to a different deal. Migration 020's trigger deliberately
-- leaves any non-blank ce_no ALONE, so that stale number went straight into the
-- unique index and bounced.
--
-- Fix: the BEFORE INSERT trigger now treats a client-supplied ce_no as a
-- PREFERENCE, not a guarantee. If it collides with a different deal, the trigger
-- allocates a fresh, guaranteed-unique number from the same atomic counter
-- (next_doc_number) instead of letting the insert fail. A deal can therefore
-- never be lost to a duplicate CE again — worst case it lands with a
-- server-assigned CE number, which is trivially correctable and infinitely
-- better than vanishing. This protects EVERY client, including stale cached
-- tabs that a client-side fix could never reach.
--
-- Behaviour preserved:
--   • A unique, non-blank ce_no is still left exactly as the client sent it.
--   • A blank ce_no is still allocated from the counter (original path).
--   • Upsert re-sync idempotency (offline queue replays INSERT ... ON CONFLICT
--     (id) DO UPDATE): the collision check excludes the row's own id, so
--     re-sending an existing deal never sees itself as a collision and keeps its
--     number. A still-blank re-sync reuses the id's already-assigned number.
--
-- Idempotent (create or replace). Apply to the live project via
-- mcp__Supabase__apply_migration.

create or replace function public.deals_assign_ce_no()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yr        text := to_char(coalesce(new.created_at, now()), 'YYYY');
  v_existing  text;
  v_min       bigint;
  v_next      bigint;
  v_guard     int  := 0;
begin
  -- Re-sync / arrival with a blank number: reuse the number this id already has
  -- (keeps numbers stable and the counter honest under the upsert retry queue),
  -- otherwise allocate a fresh one below.
  if new.ce_no is null or btrim(new.ce_no) = '' then
    select ce_no into v_existing from public.deals where id = new.id;
    if v_existing is not null and btrim(v_existing) <> '' then
      new.ce_no := v_existing;
      return new;
    end if;
  else
    -- Non-blank number supplied. Honour it UNLESS it already belongs to a
    -- different deal — in which case it's a stale/duplicate value and must not
    -- be allowed to bounce the insert off the unique index. Fall through to
    -- allocation to give this deal its own guaranteed-unique number.
    if not exists (
      select 1 from public.deals d
      where d.ce_no = new.ce_no and d.id <> new.id
    ) then
      return new;
    end if;
  end if;

  -- Seed the counter with the highest CE suffix already in use this year, so a
  -- reassigned number CONTINUES the real sequence (e.g. …-1097) instead of
  -- restarting low. The client claims numbers by passing its local max as p_min,
  -- which can leave the raw counter far behind the true max; next_doc_number
  -- returns greatest(stored, p_min)+1, so passing v_min catches it up.
  select coalesce(max((substring(ce_no from '[0-9]+$'))::bigint), 0)
    into v_min
    from public.deals
    where ce_no ~ ('^CE-' || v_yr || '-[0-9]+$');

  -- Allocate atomically from the shared per-year counter. Loop so that even if
  -- the counter sits behind manually/legacy-assigned numbers, we keep drawing
  -- (each call increments it) until we land on a value not already in use. The
  -- guard bounds it so a pathological state can never spin forever.
  --
  -- Zero-pad to a MINIMUM of 3 digits without ever truncating: plain
  -- lpad(n, 3, '0') truncates a string longer than 3 chars (Postgres behaviour),
  -- so once the counter passed 999 (CE-2026-1000+) the original trigger silently
  -- mangled '1099' into '109' — a wrong number that could even collide with an
  -- older deal. greatest(3, length(...)) keeps 007 padded but leaves 1099 intact.
  loop
    v_next := public.next_doc_number('CE-' || v_yr, v_min);
    new.ce_no := 'CE-' || v_yr || '-' ||
                 lpad(v_next::text, greatest(3, length(v_next::text)), '0');
    exit when not exists (
      select 1 from public.deals d
      where d.ce_no = new.ce_no and d.id <> new.id
    );
    v_guard := v_guard + 1;
    exit when v_guard >= 1000;
  end loop;

  return new;
end;
$$;

-- Trigger definition unchanged (BEFORE INSERT); re-created for a clean, single
-- self-contained migration.
drop trigger if exists trg_deals_assign_ce_no on public.deals;
create trigger trg_deals_assign_ce_no
  before insert on public.deals
  for each row
  execute function public.deals_assign_ce_no();

-- Re-assert the lockdown from migration 023 (revoke direct EXECUTE); create or
-- replace resets grants to the PUBLIC default, so without this the security
-- linter would re-flag the function as callable by anon/authenticated.
revoke execute on function public.deals_assign_ce_no() from public, anon, authenticated;
