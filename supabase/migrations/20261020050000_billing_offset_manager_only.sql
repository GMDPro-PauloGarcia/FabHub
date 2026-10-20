-- ============================================================================
-- Migration 20261020e — offset / credit note settlements: Manager only
--
-- Owner request (Paulo Garcia, 2026-10-20): Makerlab SM Nuvali (CE-2026-1242)
-- was paid by cancelling a ₱525,000 (VAT incl.) debt GMD owed Makerlab, under a
-- credit note. No cash moved, so it can't be logged as a normal collection, but
-- the invoice must still read as settled. FabHub records it as a billing payment
-- with payment_method = 'Offset / Credit Note': it clears the invoice (AR,
-- balance, Fully Paid) and is left out of every cash figure (cash flow, monthly
-- collections, cash-in).
--
-- Because an offset clears a receivable without money in the bank, for callers
-- with a JWT:
--   • only a Manager may insert an offset row, turn a row into one, or change
--     one (an UPDATE that changes nothing — the app's bulk re-sync — is allowed);
--   • every offset row needs a reference (the credit note / agreement no.),
--     Managers included.
-- Deletes are not blocked: removing an offset re-opens the receivable.
-- Server-side callers with no JWT (SQL editor, migrations) are not restricted.
--
-- Mirrors OFFSET_METHOD / isOffsetPayment (src/core.js) and the Manager gate in
-- BillingView's Log Payment / Edit Payment (src/App.jsx) — keep in sync.
-- Idempotent.
-- ============================================================================

create or replace function public.billing_offset_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  has_jwt boolean := coalesce(current_setting('request.jwt.claims', true), '') <> '';
  is_offset boolean := new.payment_method = 'Offset / Credit Note';
  was_offset boolean := tg_op = 'UPDATE' and old.payment_method = 'Offset / Credit Note';
begin
  if not has_jwt then
    return new;
  end if;
  if tg_op = 'UPDATE' and to_jsonb(new) = to_jsonb(old) then
    return new;
  end if;
  if (is_offset or was_offset) and not public.is_mgr() then
    raise exception 'Only a Manager can record or change an offset / credit note settlement.'
      using errcode = 'check_violation';
  end if;
  if is_offset and coalesce(btrim(new.ref_no), '') = '' then
    raise exception 'An offset / credit note settlement needs a reference (credit note or agreement no.).'
      using errcode = 'check_violation';
  end if;
  return new;
end
$fn$;
revoke execute on function public.billing_offset_guard() from public, anon, authenticated;

create or replace trigger trg_offset_guard before insert or update on public.billing_payments
  for each row execute function public.billing_offset_guard();

-- ── ROLLBACK ──
--   drop trigger if exists trg_offset_guard on public.billing_payments;
--   drop function if exists public.billing_offset_guard();
