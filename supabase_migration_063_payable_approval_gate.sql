-- ── Migration 063: expense/payable approval gate ────────────────────────────
-- Business rule (Paulo): a payable must be approved by a Manager or the Finance
-- Manager (Finance role) before it can be paid. Adds the approval state and
-- enforces at the DB level that ONLY those roles can change it — so a role that
-- can enter payables (SalesOpsAdmin, Procurement, Accounting, FinanceAssistant)
-- cannot self-clear one by calling the API directly, only through a real approver.
--
-- Self-approval (approver = the person who entered it) is blocked in the app for
-- non-Managers; the DB trigger here enforces the ROLE boundary, which is the part
-- that must not be bypassable.

-- 1) Columns
alter table public.payables add column if not exists approval_status text default 'Pending';
alter table public.payables add column if not exists approved_by     text default '';
alter table public.payables add column if not exists approved_at     timestamptz;

-- 2) Grandfather every EXISTING payable as Approved, so current AP is not frozen.
--    (Runs as the migration role — no JWT — so the trigger below won't block it.)
update public.payables
   set approval_status='Approved',
       approved_by=coalesce(nullif(approved_by,''),'System (pre-approval)'),
       approved_at=coalesce(approved_at, now())
 where approval_status is distinct from 'Approved';

-- 3) DB-level enforcement: only Manager / Finance may CHANGE approval_status.
--    Guarded so server/admin contexts (no request JWT) can still run migrations
--    and maintenance. public.has_role() is defined in migration 037.
create or replace function public.enforce_payable_approval()
returns trigger language plpgsql security definer as $fn$
begin
  if (new.approval_status is distinct from old.approval_status)
     and coalesce(current_setting('request.jwt.claims', true),'') <> ''
     and not public.has_role('Manager','Finance') then
    raise exception 'Only a Manager or the Finance Manager may change a payable''s approval status';
  end if;
  return new;
end
$fn$;

drop trigger if exists trg_payable_approval on public.payables;
create trigger trg_payable_approval
  before update on public.payables
  for each row execute function public.enforce_payable_approval();

select 'Migration 063 applied — payable approval gate active (Manager/Finance only)' as status;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--   drop trigger if exists trg_payable_approval on public.payables;
--   drop function if exists public.enforce_payable_approval();
--   alter table public.payables drop column if exists approval_status;
--   alter table public.payables drop column if exists approved_by;
--   alter table public.payables drop column if exists approved_at;
