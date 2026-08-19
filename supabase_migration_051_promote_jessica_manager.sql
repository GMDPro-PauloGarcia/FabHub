-- ── Migration 051: promote Jessica Castro ("Jeca") to Manager ────────────────
-- Business need: Jessica Castro ("jessica", formerly SalesOpsAdmin — "Jeca")
-- should have the exact same functions as the owner/Manager across the app
-- (Sales Pipeline deal deletion, Billing VATable/vat_treatment editing,
-- Calendar event creation, and everything else a Manager can do).
--
-- Rather than granting each capability piecemeal, we set her canonical role to
-- Manager. Role flows user_profiles.role -> mint-session JWT `user_role`
-- (migration 024) -> both the RLS helpers (is_mgr()/has_role()) and the client
-- `role==="Manager"` gates, so this single change gives full parity.
--
-- Every permission change is recorded in public.audit_log (append-only trail;
-- see supabase_audit_log.sql) so the promotion is traceable: who, when, why,
-- and the before/after role.
--
-- This supersedes the earlier plan to add her to the named deal-delete
-- allow-list: as a Manager she is covered by is_mgr(), so the deals_del policy
-- is restored to just the named Sales grantees (jena/wyn/paolo) and the
-- DEAL_DELETE_USERS list in src/App.jsx is likewise reverted.
-- DEPENDS ON migration 024 (role model) and supabase_audit_log.sql.

-- 1) Snapshot the change to the audit trail BEFORE mutating the row.
insert into public.audit_log (table_name, record_id, action, snapshot, reason, performed_by)
select
  'user_profiles',
  up.id,
  'role_change',
  jsonb_build_object(
    'id', up.id, 'username', up.username, 'name', up.name,
    'old_role', up.role, 'new_role', 'Manager',
    'old_title', up.title, 'status', up.status
  ),
  'Grant Jessica Castro ("Jeca") the same functions as the owner — promote SalesOpsAdmin -> Manager (requested by Paulo Garcia).',
  'Paulo Garcia'
from public.user_profiles up
where up.username = 'jessica';

-- 2) Apply the promotion. The protect_user_profile() BEFORE UPDATE trigger
--    (migration 024) silently reverts role/status changes unless is_mgr() is
--    true (it guards against non-managers self-promoting). This migration runs
--    with elevated privileges as a deliberate, audited admin action, so disable
--    that guard trigger just for this UPDATE, then re-enable it.
alter table public.user_profiles disable trigger trg_protect_user_profile;
update public.user_profiles
   set role = 'Manager'
 where username = 'jessica';
alter table public.user_profiles enable trigger trg_protect_user_profile;

-- 3) Restore the deal-delete policy to the named Sales grantees only; Jessica is
--    now covered by is_mgr(). (Undoes the interim jessica grant.)
drop policy if exists deals_del on public.deals;
create policy deals_del on public.deals
  for delete to authenticated
  using ( public.is_mgr() or public.app_username() in ('jena','wyn','paolo') );
