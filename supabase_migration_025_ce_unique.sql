-- ── Migration 025: Enforce unique CE numbers on deals.ce_no ───────────────────
-- Backstop for the duplicate-CE-number class (e.g. two CE-2026-007). Migration
-- 020 made the *server* the sole authority for CE numbers via an atomic counter,
-- but its BEFORE INSERT trigger still trusts any non-blank ce_no the client
-- sends and inserts it verbatim — no uniqueness check. A stale/cached client
-- bundle that guesses "localMax + 1" from its own out-of-date deal list can
-- therefore still land a duplicate (observed live: a new CE-2026-007 created
-- while the counter was already at 12, i.e. a number the RPC could never issue).
--
-- This adds a database-level guarantee: a non-blank ce_no must be unique. Blank
-- ce_no is intentionally excluded so the offline path (leave it blank, let the
-- trigger stamp it) is unaffected, and so multiple deals may sit CE-pending.
--
-- NOTE ON BEHAVIOUR AFTER THIS RUNS: once the index exists, a stale client that
-- sends an already-taken ce_no gets a hard insert error instead of a silent
-- duplicate. That is the intended outcome — a rejected save beats a corrupt
-- number series — but for a smoother experience (re-stamp instead of reject)
-- pair this with hardening the deals_assign_ce_no trigger to re-allocate any
-- client-supplied number that is already taken or below the counter.

-- Step 1 — heal existing duplicates so the unique index can be created.
-- Keep the earliest holder of each CE number; re-stamp every later duplicate
-- from the same atomic counter migration 020 uses, so the series stays honest.
do $do$
declare
  r record;
  v_yr text;
begin
  for r in
    select id, ce_no, created_at,
           row_number() over (partition by ce_no
                              order by created_at nulls last, id) as rn
    from public.deals
    where ce_no is not null and btrim(ce_no) <> ''
  loop
    if r.rn > 1 then
      v_yr := to_char(coalesce(r.created_at, now()), 'YYYY');
      update public.deals
         set ce_no = 'CE-' || v_yr || '-' ||
                     lpad(public.next_doc_number('CE-' || v_yr, 0)::text, 3, '0')
       where id = r.id;
    end if;
  end loop;
end $do$;

-- Step 2 — the guarantee. Partial unique index: any non-blank ce_no is unique.
create unique index if not exists deals_ce_no_uniq
  on public.deals (ce_no)
  where ce_no is not null and btrim(ce_no) <> '';
