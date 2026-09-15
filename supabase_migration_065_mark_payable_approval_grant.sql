-- ── Migration 065: grant Mark Acejo payable-approval access (role unchanged) ─
-- Change (Paulo): during Aerwin Del Rosario's turnover, Mark Acejo needs
-- Finance-Manager APPROVAL authority over payables — but his ROLE stays
-- FinanceAssistant. Access changes; the role does not.
--
-- Why by-username and not by-role: the payable approval gate (migration 063)
-- and the RLS matrix key off the role string. Widening the FinanceAssistant
-- role would also elevate Jerwin Limon (the other FinanceAssistant), breaking
-- segregation of duties. So we grant Mark individually, mirroring the by-name
-- deal-delete grantees in migrations 033/034 (public.app_username()).
--
-- This supersedes the earlier draft of 065 (which renamed Mark to the Finance
-- role); that approach was dropped. The app-side gate canApprovePayables in
-- App.jsx (PAYABLE_APPROVAL_GRANTEES) must stay in sync with the username list
-- here.
--
-- Idempotent: re-running only redefines the trigger function.

-- Re-define the approval gate to also admit named grantees by username.
-- public.app_username() (migration 033) reads the 'username' JWT claim;
-- public.has_role() (migration 037) reads the role claim.
-- NOTE: mirrors the live function definition exactly (including the hardened
-- search_path pin) as verified against prod when this was applied, and adds only
-- the app_username() grantee clause.
create or replace function public.enforce_payable_approval()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $fn$
begin
  if (new.approval_status is distinct from old.approval_status)
     and coalesce(current_setting('request.jwt.claims', true),'') <> ''
     and not public.has_role('Manager','Finance')
     and public.app_username() not in ('mark') then
    raise exception 'Only a Manager or the Finance Manager may change a payable''s approval status';
  end if;
  return new;
end
$fn$;

select 'Migration 065 applied — Mark Acejo granted payable approval (role unchanged)' as status;

-- ── ROLLBACK (restore the role-only gate from migration 063) ────────────────
--   create or replace function public.enforce_payable_approval()
--   returns trigger language plpgsql security definer
--   set search_path to 'pg_catalog', 'public' as $fn$
--   begin
--     if (new.approval_status is distinct from old.approval_status)
--        and coalesce(current_setting('request.jwt.claims', true),'') <> ''
--        and not public.has_role('Manager','Finance') then
--       raise exception 'Only a Manager or the Finance Manager may change a payable''s approval status';
--     end if;
--     return new;
--   end
--   $fn$;
