-- ── Migration 054: Office wall display (65" touchscreen) ────────────────────
-- Adds a dedicated read-only kiosk account and the RLS it needs so the office
-- wall dashboard (src/App.jsx → OfficeTVDashboard) can render.
--
-- The kiosk logs in as user `tv` (role "Display") and lands straight on the
-- fullscreen, touch-navigable dashboard — no nav, no write actions. The board
-- shows three panels: the site/construction calendar (checklists table),
-- awarded/won projects (deals table), and announcements (app_settings,
-- key='announcements', curated by Managers in the "Office TV Board" admin page).
--
-- Why each grant below:
--   • The Display account must authenticate SERVER-SIDE to receive a role-bearing
--     token (mint-session / verify_login). Without a real user_profiles row its
--     login would fall back to the local DEFAULT_USERS path with no token, run as
--     anon, and RLS would block every read (same failure mode migration 030 fixed
--     for the Design team). So we provision it here.
--   • `checklists` and `app_settings` already allow SELECT to any authenticated
--     app user (migration 037: sel = "AUTH" → public.is_user()), so the Display
--     token can already read the calendar and the announcements blob.
--   • `deals` SELECT is role-gated (migration 037) and did NOT include "Display",
--     so we add an additive, SELECT-only policy for the Display role. Policies for
--     the same command are OR-combined, so this widens read access for Display
--     without touching any existing role's policy.
--   • Announcements are WRITTEN only by Managers. app_settings INSERT/UPDATE is
--     already Manager/Finance/FinanceAssistant (migration 037), so no new write
--     policy is needed — the Manager "Office TV Board" editor just works, and the
--     Display role is never granted any write.
--
-- Idempotent. Default password GMDwall2026! hashed with the sha256 scheme used by
-- verify_login (migration 017) — change it after first login via the app.
-- Uses the public.has_role() helper defined in migration 037.

-- 1) Provision the read-only kiosk account -----------------------------------
insert into public.user_profiles (id, name, username, role, title, status, password_hash, created_at)
select v.id, v.name, v.username, 'Display', v.title, 'active',
       'sha256:' || encode(digest('GMDwall2026!' || v.username || ':gmd-fabhub-2026', 'sha256'), 'hex'),
       now()
from (values
  ('u28','Office Display','tv','Office Wall Display')
) as v(id, name, username, title)
where not exists (
  select 1 from public.user_profiles u where lower(u.username) = lower(v.username)
);

-- 2) Let the Display role READ deals (awarded-projects panel) -----------------
-- Additive SELECT-only policy; OR-combines with the existing deals_sel policy.
drop policy if exists deals_sel_display on public.deals;
create policy deals_sel_display on public.deals
  for select to authenticated
  using ( public.has_role('Display') );

select 'Migration 054 applied — office TV display account + Display read access' as status;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--   drop policy if exists deals_sel_display on public.deals;
--   delete from public.user_profiles where username = 'tv';
