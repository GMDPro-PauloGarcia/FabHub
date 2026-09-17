-- ── Payment gate: an unapproved payable cannot be paid ──────────────────────
-- Business rule (Paulo): approval must precede payment. Migration 063 added the
-- approval state and a trigger that guards WHO may change approval_status
-- (Manager / Finance / named grantees). But nothing at the DB level stopped a
-- payable from being marked Paid / Partial while still Pending — 063's trigger
-- only fires on approval_status changes, not on status / paid_amount. So any
-- role with UPDATE on payables (SalesOpsAdmin, Procurement, Accounting,
-- FinanceAssistant — migration 062) could record payment on an unapproved
-- payable straight through the API, bypassing the app-side checks.
--
-- This migration closes that hole at the data layer: an authenticated UPDATE
-- that records money going out (paid_amount rising, or status entering a paid
-- state) is rejected unless the row is Approved. It is the DB twin of the
-- function-level guards in App.jsx (recordPayablePayment / markPayablePaid /
-- payableToCheck).
--
-- Scope notes:
--   • UPDATE only. A payable may still be ENTERED (INSERT) already carrying a
--     historical prior payment — that records a bill's past, it is not the
--     company paying money through the system. The threat is always advancing
--     an unapproved payable to paid, which is an UPDATE.
--   • Server / migration contexts (no request JWT) are exempt, so maintenance
--     and this migration's own grandfathering are never blocked — same guard
--     pattern as migration 063.
--   • Legacy / straggler rows with NULL or empty approval_status are treated as
--     Approved (coalesce), matching the app's payApproved() leniency, so no
--     existing payable is frozen. Only explicit 'Pending' / 'Rejected' block.
--
-- Idempotent: columns use IF NOT EXISTS; the function/trigger use CREATE OR
-- REPLACE / DROP-then-CREATE. Safe to re-run.

-- 1) Ensure the approval columns exist (no-op on live where migration 063 added
--    them; creates them on a schema built only from the committed baseline,
--    which predates the approval gate). Grandfather any pre-existing row as
--    Approved so current AP is never frozen by the trigger below.
alter table public.payables add column if not exists approval_status text default 'Pending';
alter table public.payables add column if not exists approved_by     text default '';
alter table public.payables add column if not exists approved_at      timestamptz;
alter table public.payables add column if not exists paid_amount      numeric default 0;

update public.payables
   set approval_status='Approved',
       approved_by=coalesce(nullif(approved_by,''),'System (pre-approval)'),
       approved_at=coalesce(approved_at, now())
 where approval_status is distinct from 'Approved';

-- 2) The gate. Blocks the money-out transition on an unapproved payable.
create or replace function public.enforce_payable_payment_approval()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $fn$
begin
  if coalesce(current_setting('request.jwt.claims', true),'') <> ''
     and coalesce(new.approval_status,'Approved') <> 'Approved'
     and (
           coalesce(new.paid_amount,0) > coalesce(old.paid_amount,0)
           or (new.status in ('Paid','Partial','Check Issued')
               and coalesce(old.status,'') not in ('Paid','Partial','Check Issued'))
         )
  then
    raise exception 'This payable is not approved — a Manager or the Finance Manager must approve it before any payment can be recorded';
  end if;
  return new;
end
$fn$;

drop trigger if exists trg_payable_payment_approval on public.payables;
create trigger trg_payable_payment_approval
  before update on public.payables
  for each row execute function public.enforce_payable_payment_approval();

select 'Payment gate active — an unapproved payable cannot be paid' as status;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--   drop trigger if exists trg_payable_payment_approval on public.payables;
--   drop function if exists public.enforce_payable_payment_approval();
--   (columns/grandfathering are shared with migration 063 — leave them.)
