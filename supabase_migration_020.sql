-- ── Migration 020: Server-assigned CE numbers on insert (kills offline dupes) ──
-- Root cause of duplicate CE numbers (e.g. two CE-2026-007, two CE-2026-010):
-- the app claims a CE number client-side via the atomic next_doc_number RPC,
-- but when that RPC is unreachable (device offline, or the 12s timeout fires on
-- a flaky mobile connection) it fell back to guessing "localMax + 1" from the
-- device's own — frequently stale — deal list. Two offline devices both guessed
-- the same next number and both saved. The live doc_counters row proved it:
-- CE-2026 was stuck at 8 while deals 009/010 already existed, i.e. those deals
-- never touched the RPC.
--
-- Fix: make the database the single authority for the number. The client now
-- leaves ce_no blank when it can't reach the RPC; this BEFORE INSERT trigger
-- stamps a guaranteed-unique value (via the same atomic next_doc_number counter)
-- when the deal actually reaches the server. The online happy-path is unchanged:
-- the client still claims a number up front and sends it non-blank, so the
-- trigger leaves it alone.
--
-- Idempotency under the offline retry queue: that queue re-sends writes as
-- INSERT ... ON CONFLICT (id) DO UPDATE (upsert). A BEFORE INSERT trigger fires
-- on every such attempt, even when the row already exists — so a naive trigger
-- would burn a fresh counter value on every re-sync. Guard against that by
-- reusing the id's already-assigned number instead of allocating a new one.

create or replace function public.deals_assign_ce_no()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yr       text := to_char(coalesce(new.created_at, now()), 'YYYY');
  v_existing text;
begin
  -- Online path: client already resolved a number via the RPC — leave it.
  if new.ce_no is not null and btrim(new.ce_no) <> '' then
    return new;
  end if;
  -- Re-sync of a still-blank deal: reuse the number this id already has rather
  -- than allocating a new one (keeps numbers stable and the counter honest).
  select ce_no into v_existing from public.deals where id = new.id;
  if v_existing is not null and btrim(v_existing) <> '' then
    new.ce_no := v_existing;
    return new;
  end if;
  -- First arrival with no number: allocate atomically from the shared counter.
  new.ce_no := 'CE-' || v_yr || '-' ||
               lpad(public.next_doc_number('CE-' || v_yr, 0)::text, 3, '0');
  return new;
end;
$$;

drop trigger if exists trg_deals_assign_ce_no on public.deals;
create trigger trg_deals_assign_ce_no
  before insert on public.deals
  for each row
  execute function public.deals_assign_ce_no();
