-- ── Migration 031: Provision new-role accounts into user_profiles ───────────
-- Two new team members with two role assignments:
--   • Jessica Castro — Operations & Sales Admin (SalesOpsAdmin role): the app's
--     existing SalesOpsAdmin role already exposes exactly the Sales, Operations
--     and Billing modals she needs, so she is provisioned onto that role.
--   • Mark Acejo — Finance Assistant (new FinanceAssistant role): a new role that
--     exposes the Accounting and Finance modals.
--
-- Like the rest of the team (and mirroring migration 030), these accounts must
-- exist in user_profiles so the mint-session Edge Function (verify_login) can
-- issue them a role-bearing token; otherwise login falls back to the local
-- DEFAULT_USERS path with no token and the session is dropped on reload.
--
-- Default password GMD2026! hashed with the sha256 scheme used by verify_login
-- (migration 017). Idempotent — skips any username already present.

insert into public.user_profiles (id, name, username, role, title, status, password_hash, created_at)
select v.id, v.name, v.username, v.role, v.title, 'active',
       'sha256:' || encode(digest('GMD2026!' || v.username || ':gmd-fabhub-2026', 'sha256'), 'hex'),
       now()
from (values
  ('u26','Jessica Castro','jessica','SalesOpsAdmin','Operations & Sales Admin'),
  ('u27','Mark Acejo','mark','FinanceAssistant','Finance Assistant')
) as v(id, name, username, role, title)
where not exists (
  select 1 from public.user_profiles u where lower(u.username) = lower(v.username)
);
