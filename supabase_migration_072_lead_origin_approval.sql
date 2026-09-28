-- ── Migration 072: Manager approval for "Self-sourced" lead origin ───────────
-- Business rule (Paulo): a Self-sourced lead origin triples the sales commission
-- (1.5% vs 0.5% for a Given client), so it only pays once a Manager approves it.
-- Until approved the deal earns the Given rate (src/core.js effectiveLeadOrigin).
--
-- Columns:
--   lead_origin_status       'Pending' | 'Approved'  ('Given' is always 'Approved')
--   lead_origin_approved_by  who approved the Self-sourced claim
--   lead_origin_approved_at  when
--
-- DB-level enforcement (the part that must not be bypassable from the API):
--   • Given → status forced to 'Approved', approver cleared.
--   • Self-sourced written by a NON-Manager request → 'Pending' whenever it is
--     newly claimed (insert, or changed from Given). Otherwise a non-Manager can't
--     change the status or approver at all (no self-approval, and a stale device
--     can't un-approve a Manager's decision); editing other fields keeps it.
--   • Requests with no JWT (migrations, maintenance, service role) are trusted.
-- public.has_role() is defined in migration 037.
--
-- Backfill: on 2026-09-28 all 340 live deals were 'Given' (no Self-sourced claims
-- existed — the app never read lead_origin back on load, so any flag was
-- overwritten on the next save). Every existing row is therefore 'Approved'.
-- Idempotent.

-- 1) Columns
alter table public.deals add column if not exists lead_origin_status      text default 'Approved';
alter table public.deals add column if not exists lead_origin_approved_by text default '';
alter table public.deals add column if not exists lead_origin_approved_at timestamptz;

-- 2) Backfill (runs as the migration role — no JWT — so the trigger won't interfere)
update public.deals set lead_origin_status='Approved'
 where coalesce(lead_origin,'Given') <> 'Self-sourced' and lead_origin_status is distinct from 'Approved';
update public.deals set lead_origin_status='Pending'
 where lead_origin='Self-sourced' and lead_origin_status is null;

alter table public.deals drop constraint if exists deals_lead_origin_status_chk;
alter table public.deals add constraint deals_lead_origin_status_chk
  check (lead_origin_status in ('Pending','Approved'));

-- 3) Trigger
create or replace function public.enforce_lead_origin_approval()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  has_jwt boolean := coalesce(current_setting('request.jwt.claims', true),'') <> '';
begin
  if coalesce(new.lead_origin,'Given') <> 'Self-sourced' then
    new.lead_origin_status      := 'Approved';
    new.lead_origin_approved_by := '';
    new.lead_origin_approved_at := null;
    return new;
  end if;

  if has_jwt and not public.has_role('Manager') then
    if tg_op = 'INSERT' or old.lead_origin is distinct from new.lead_origin then
      -- a new Self-sourced claim always starts Pending
      new.lead_origin_status      := 'Pending';
      new.lead_origin_approved_by := '';
      new.lead_origin_approved_at := null;
    else
      -- unchanged claim: a non-Manager can neither approve it nor (from a stale
      -- device) un-approve it — keep the stored decision as-is
      new.lead_origin_status      := coalesce(old.lead_origin_status,'Pending');
      new.lead_origin_approved_by := old.lead_origin_approved_by;
      new.lead_origin_approved_at := old.lead_origin_approved_at;
    end if;
  end if;
  return new;
end
$fn$;

drop trigger if exists trg_lead_origin_approval on public.deals;
create trigger trg_lead_origin_approval
  before insert or update on public.deals
  for each row execute function public.enforce_lead_origin_approval();

select 'Migration 072 applied — Self-sourced lead origin needs Manager approval' as status;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--   drop trigger if exists trg_lead_origin_approval on public.deals;
--   drop function if exists public.enforce_lead_origin_approval();
--   alter table public.deals drop constraint if exists deals_lead_origin_status_chk;
--   alter table public.deals drop column if exists lead_origin_status;
--   alter table public.deals drop column if exists lead_origin_approved_by;
--   alter table public.deals drop column if exists lead_origin_approved_at;
