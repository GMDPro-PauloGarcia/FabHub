-- ── Migration 017: Verify logins server-side; stop exposing password_hash ────
-- FabHub's custom login (NOT Supabase Auth) fetched the full user_profiles row
-- — including password_hash — to the browser and compared hashes client-side.
-- Combined with RLS being wide open to `anon` (see supabase_rls_cleanup.sql),
-- this meant ANYONE with the public anon key (which ships in the JS bundle)
-- could bulk-read every user's password hash directly via the REST API —
-- `curl .../rest/v1/user_profiles?select=password_hash` — with no login at
-- all. The hash is unsalted-per-record SHA-256 keyed only by username, which
-- is crackable at speed once exposed.
--
-- This migration moves the actual password comparison server-side into a
-- SECURITY DEFINER function, then revokes column-level SELECT on password_hash
-- for anon/authenticated (every OTHER column stays fully readable — no other
-- behavior changes). App code (src/App.jsx login()/savePassword()) is updated
-- in the same deploy to call this RPC instead of comparing hashes locally.
--
-- Replicates both hash schemes exactly as implemented in src/App.jsx:
--   sha256Hash(pw, username) = "sha256:" + hex(SHA256(pw + lower(username) + ":gmd-fabhub-2026"))
--   legacyHashPw(pw)         = reverse(base64(pw + ":gmd-salt-2026"))   -- pre-migration accounts only
-- ============================================================================

create extension if not exists pgcrypto;

create or replace function public.verify_login(p_username text, p_password text)
returns table(
  id text, username text, name text, role text, title text, status text,
  found boolean, password_ok boolean, needs_upgrade boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  computed_new text;
  computed_legacy text;
  pw_ok boolean := false;
  upgrade boolean := false;
begin
  select * into rec from public.user_profiles where lower(user_profiles.username) = lower(p_username) limit 1;
  if not found then
    return query select null::text, null::text, null::text, null::text, null::text, null::text, false, false, false;
    return;
  end if;

  if rec.password_hash like 'sha256:%' then
    computed_new := 'sha256:' || encode(digest(p_password || lower(rec.username) || ':gmd-fabhub-2026', 'sha256'), 'hex');
    pw_ok := (computed_new = rec.password_hash);
  elsif rec.password_hash is not null and rec.password_hash <> '' then
    computed_legacy := reverse(replace(encode(convert_to(p_password || ':gmd-salt-2026', 'UTF8'), 'base64'), E'\n', ''));
    pw_ok := (computed_legacy = rec.password_hash);
    upgrade := pw_ok;
  end if;

  return query select rec.id, rec.username, rec.name, rec.role, rec.title, rec.status, true, pw_ok, upgrade;
end;
$$;

grant execute on function public.verify_login(text, text) to anon, authenticated;

-- Lock down password_hash: revoke the blanket table-level SELECT this table
-- got from supabase_rls_cleanup.sql's "grant on every table" loop, then
-- re-grant SELECT on every column EXCEPT password_hash. INSERT/UPDATE/DELETE
-- grants are untouched — admin actions (create user, reset password, the
-- user's own password-change flow) still write password_hash normally, they
-- just can no longer read anyone's existing hash back out.
revoke select on public.user_profiles from anon, authenticated;
grant select (id, username, name, role, title, status, email, created_at)
  on public.user_profiles to anon, authenticated;
