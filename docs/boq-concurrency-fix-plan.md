# BOQ concurrency & data-loss hardening — fix plan

Status: proposed · Scope: deal-linked BOQs (`deals.boq_data`) · Related: the
wipe-guard already shipped on this branch (`src/views/BOQBuilder.jsx`).

## Problem

`deals.boq_data` is a single JSONB column holding the whole Bill of Quantities
(items, sections, header, VAT, discount). Every autosave in `BOQBuilder`
rewrites the **entire** column:

```
sbUpdate('deals', selDeal, { boq_data: boqData })   // whole-blob, last-write-wins
```

There is no version check. Consequences:

1. **Empty clobber ("CE removed").** Opening a deal whose `boq_data` hadn't
   hydrated seeded a blank header; the autosave then wrote `items:[]` over the
   real BOQ. 32 CEs were destroyed this way. **Fixed** on this branch by the
   wipe-guard (never persist an empty BOQ unless a deliberate edit or Clear
   Draft produced it).

2. **Non-empty clobber (still open).** Two people — or one person in a stale
   second tab — edit the same deal's BOQ. Both hold the whole blob; whoever
   saves last overwrites the other's line items with no error. The wipe-guard
   does **not** cover this, because both writes are non-empty.

Migration 051 already solved this exact class for **standalone** BOQs by moving
them to one row per BOQ (`standalone_boqs`). Deal-linked BOQs were left on the
old fragile blob shape. This plan closes that gap.

## Options

### A. Optimistic concurrency on the blob (small, ships now)
Guard the blob write with the row's `updated_at` (or a dedicated
`boq_version int`). The client remembers the `updated_at` it loaded; the write
only lands if the server row is still at that value.

- Implement as a conditional update: `update deals set boq_data=…,
  updated_at=now() where id=:id and updated_at=:loadedAt`, or a Postgres RPC
  `save_deal_boq(id, boq, expected_updated_at)` that returns conflict when the
  guard fails.
- On conflict: don't overwrite. Reload the server BOQ and show the existing
  reconcile UI ("server has a newer BOQ — keep yours / take theirs / review"),
  reusing the `reconcile` state already in `BOQBuilder`.
- Cost: ~half a day. No schema migration beyond an optional version column.
- Limit: coarse — the whole BOQ is owned by one editor at a time. Two people
  editing *different* line items still collide (one must reconcile). Acceptable:
  it converts silent loss into a visible, recoverable prompt.

### B. Per-line rows (durable fix, mirrors migration 051)
New table `deal_boq_items` (one row per line item) + `deal_boq_meta` (header,
VAT, discount, sections) keyed by `deal_id`. Concurrent authors touch
independent rows; nothing to clobber.

- Schema + RLS parity with `deals` write policies; add both tables to the
  `supabase_realtime` publication (as migration 060 did for `standalone_boqs`).
- Backfill from existing `deals.boq_data` (one row per `items[]` element), same
  pattern as the 051 backfill; keep `boq_data` as a read-backstop during
  rollout, stop writing it once the new path is confirmed.
- Frontend: rework `BOQBuilder` persistence from blob-save to per-row
  upsert/delete; dual-read (new table, fall back to `boq_data`) during
  migration; realtime subscription like `standalone-boqs-rt`.
- Cost: 2–4 days incl. migration, backfill, dual-read window, testing.
- Payoff: eliminates the whole clobber class for deal BOQs permanently.

### C. Do nothing more
Rejected. The wipe-guard stops empty loss but leaves ~₱37M of BOQs exposed to
silent concurrent overwrite. Retail fab has multiple estimators touching the
same CE — this will recur.

## Recommendation — sequence A then B

1. **Now (with the wipe-guard):** ship **A**. Small, no risky migration, turns
   silent concurrent loss into a visible reconcile prompt. This is the
   stop-the-bleeding layer beyond the empty-write guard.
2. **Next sprint:** do **B**. It is the real fix and the codebase already has
   the exact template (051/060 for standalone BOQs) to copy.

## Adjacent fixes to fold in
- **Swallowed deal writes.** `sbUpdate('deals',…).catch(()=>{})` hides failures
  elsewhere in `App.jsx`. Route deal BOQ writes through the same surfaced-error
  path the sync badge now uses, so a dropped save is never silent.
- **Audit the BOQ.** Deal `boq_data` changes are not in `audit_log` (0 of 665
  rows touch BOQ), which is why the 32 wipes were unrecoverable. Add BOQ writes
  to the audit engine (migration 048) — snapshot the prior value so a future
  bad write is reversible, not permanent.

## Test plan (both A and B)
- Two-client concurrent edit of the same deal BOQ → no silent loss; loser gets
  a reconcile prompt (A) or both edits persist on different lines (B).
- Open a deal whose `boq_data` is null in local cache but non-null on server →
  no blank overwrite (regression test for the shipped wipe-guard).
- Deliberate delete-all-items via the UI still persists an empty BOQ.
- Offline edit → reconnect → write lands or surfaces "device only".
- Backfill (B): row counts and net totals match the source `boq_data` blobs.
