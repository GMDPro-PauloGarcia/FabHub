-- ============================================================================
-- Migration 20260928d — who may edit the Daily Cash Position, and when a day locks
--
-- Owner decision (Paulo Garcia, 2026-09-28):
--   • Only Managers (Pao/Paolo Gomez, Paulo Garcia, Mar Mungcal) and the
--     assigned preparer Mark Acejo may write cash positions. Aerwin, Jerwin and
--     the shared "accounting" login become view-only (SELECT is unchanged).
--   • A day locks for non-Managers at exactly 12:01 AM (Asia/Manila) the
--     following day. After that only a Manager can change it; the app asks the
--     Manager for a reason, logs it in the day's Audit Trail and alerts
--     management on Telegram.
--
-- Mirrors CASH_EDIT_USERS / cashDayLocked in src/shared.jsx — keep in sync.
-- Server-side callers with no JWT (SQL editor, migrations) are not restricted.
-- Idempotent.
-- ============================================================================

-- 1) Writers: Managers + the assigned preparer
alter policy cash_positions_ins on public.cash_positions
  with check (public.is_mgr() or public.app_username() = any (array['mark']));

alter policy cash_positions_upd on public.cash_positions
  using      (public.is_mgr() or public.app_username() = any (array['mark']))
  with check (public.is_mgr() or public.app_username() = any (array['mark']));

-- 2) Day lock + existing guard (updated_at stamp, no far-future dates)
create or replace function public.cash_positions_guard()
returns trigger
language plpgsql
set search_path = public
as $fn$
declare
  now_ph   timestamp := (now() at time zone 'Asia/Manila');
  max_date date      := (now() at time zone 'Asia/Manila')::date + 3;
  has_jwt  boolean   := coalesce(current_setting('request.jwt.claims', true), '') <> '';
begin
  new.updated_at := now();

  if (tg_op = 'INSERT' or new.date is distinct from old.date) and new.date > max_date then
    raise exception 'Cash position date % is more than 3 days ahead (latest allowed: %). Check the date picked.', new.date, max_date
      using errcode = 'check_violation';
  end if;

  -- A day is editable by non-Managers until 12:01 AM the following day.
  if has_jwt and not public.is_mgr() then
    if now_ph >= (new.date + 1)::timestamp + interval '1 minute'
       or (tg_op = 'UPDATE' and now_ph >= (old.date + 1)::timestamp + interval '1 minute') then
      raise exception 'Cash position % is locked (since 12:01 AM the next day). Only a Manager can change a past day.', coalesce(old.date, new.date)
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end
$fn$;
revoke execute on function public.cash_positions_guard() from public, anon, authenticated;

-- ── ROLLBACK ──
--   alter policy cash_positions_ins on public.cash_positions
--     with check (has_role(VARIADIC ARRAY['Manager','Finance','Accounting','FinanceAssistant']));
--   alter policy cash_positions_upd on public.cash_positions
--     using      (has_role(VARIADIC ARRAY['Manager','Finance','Accounting','FinanceAssistant']))
--     with check (has_role(VARIADIC ARRAY['Manager','Finance','Accounting','FinanceAssistant']));
--   (guard: re-apply 20260928000000_cash_positions_guardrails.sql's function)
