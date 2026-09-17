-- ── Migration 067: Auth hardening (bcrypt + login lockout + server-side set) ──
-- Follows the Security Advisor pass (066). This addresses the REAL auth risks
-- found by auditing the login path (verify_login + mint-session):
--
--   A. Password hashing was fast/unsalted SHA-256 (brute-forceable if the table
--      leaks). Move to bcrypt (pgcrypto), migrating users TRANSPARENTLY: on each
--      successful login, verify_login re-hashes the password to bcrypt in place.
--      No forced resets. New/legacy hashes still verify until a user next logs in.
--
--   B. mint-session had no rate limiting — unlimited online password guessing
--      against known usernames. Add a per-username lockout the Edge Function
--      consults on every attempt (fail-open by design: a guard error must never
--      block a legitimate login).
--
--   C. Passwords were hashed in the BROWSER and written straight to user_profiles.
--      Add a server-side set_password() so create/change/reset can write bcrypt
--      without the plaintext or hashing ever living in client code. (The client
--      is rewired to call this in a separate change, tested before it ships.)
--
-- pgcrypto is installed; crypt()/gen_salt('bf',12) verified to round-trip.

-- ─────────────────────────────────────────────────────────────────────────────
-- A + upgrade) verify_login v2: bcrypt-aware, transparent upgrade on success
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.verify_login(p_username text, p_password text)
returns table(id text, username text, name text, role text, title text, status text,
              found boolean, password_ok boolean, needs_upgrade boolean)
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  rec record;
  computed_new text;
  computed_legacy text;
  pw_ok boolean := false;
  is_bcrypt boolean := false;
begin
  select * into rec from public.user_profiles
    where lower(user_profiles.username) = lower(p_username) limit 1;
  if not found then
    return query select null::text, null::text, null::text, null::text, null::text, null::text, false, false, false;
    return;
  end if;

  if rec.password_hash like '$2%' then
    -- bcrypt (current standard) — nothing to upgrade
    is_bcrypt := true;
    pw_ok := (crypt(p_password, rec.password_hash) = rec.password_hash);
  elsif rec.password_hash like 'sha256:%' then
    computed_new := 'sha256:' || encode(digest(p_password || lower(rec.username) || ':gmd-fabhub-2026', 'sha256'), 'hex');
    pw_ok := (computed_new = rec.password_hash);
  elsif rec.password_hash is not null and rec.password_hash <> '' then
    -- legacy reversible encoding (no users on this today; kept for safety)
    computed_legacy := reverse(replace(encode(convert_to(p_password || ':gmd-salt-2026', 'UTF8'), 'base64'), E'\n', ''));
    pw_ok := (computed_legacy = rec.password_hash);
  end if;

  -- Transparent upgrade: any successful login on a non-bcrypt hash is re-hashed
  -- to bcrypt in place. Runs as the function owner (SECURITY DEFINER), so it
  -- writes regardless of the caller's role. Only ever fires with a CORRECT
  -- password, so it cannot corrupt an account.
  if pw_ok and not is_bcrypt then
    update public.user_profiles
       set password_hash = crypt(p_password, gen_salt('bf', 12))
     where user_profiles.id = rec.id;
  end if;

  -- needs_upgrade now means "was not already bcrypt" (informational; the upgrade
  -- above already handled it server-side).
  return query select rec.id, rec.username, rec.name, rec.role, rec.title, rec.status,
                      true, pw_ok, (pw_ok and not is_bcrypt);
end;
$function$;

grant execute on function public.verify_login(text, text) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- B) Login lockout — consulted by mint-session (service_role only)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.auth_login_attempts (
  username      text primary key,
  fail_count    int  not null default 0,
  first_fail_at timestamptz,
  locked_until  timestamptz
);
alter table public.auth_login_attempts enable row level security;   -- no policies: anon/authenticated denied, service_role bypasses
revoke all on public.auth_login_attempts from anon, authenticated;
grant all on public.auth_login_attempts to service_role;

-- Returns whether the username is currently locked, and for how many more seconds.
create or replace function public.login_guard_status(p_username text)
returns table(locked boolean, retry_after int)
language plpgsql
security definer
set search_path to pg_catalog, public
as $$
declare r record;
begin
  select * into r from public.auth_login_attempts where username = lower(p_username);
  if found and r.locked_until is not null and r.locked_until > now() then
    return query select true, ceil(extract(epoch from (r.locked_until - now())))::int;
  else
    return query select false, 0;
  end if;
end;
$$;

-- Records the outcome of an attempt. Threshold: 10 fails within a 15-min rolling
-- window → 15-min lock. Generous enough not to trip up a legitimate user who
-- mistypes, tight enough to make online brute force impractical. A success
-- clears the counter.
create or replace function public.login_guard_record(p_username text, p_success boolean)
returns void
language plpgsql
security definer
set search_path to pg_catalog, public
as $$
declare
  r record;
  v_window   interval := interval '15 minutes';
  v_threshold int     := 10;
  v_lock     interval := interval '15 minutes';
begin
  if p_success then
    delete from public.auth_login_attempts where username = lower(p_username);
    return;
  end if;

  select * into r from public.auth_login_attempts where username = lower(p_username) for update;
  if not found then
    insert into public.auth_login_attempts(username, fail_count, first_fail_at)
      values (lower(p_username), 1, now());
    return;
  end if;

  -- Stale window → start fresh
  if r.first_fail_at < now() - v_window then
    update public.auth_login_attempts
       set fail_count = 1, first_fail_at = now(), locked_until = null
     where username = lower(p_username);
    return;
  end if;

  update public.auth_login_attempts
     set fail_count = r.fail_count + 1,
         locked_until = case when r.fail_count + 1 >= v_threshold then now() + v_lock else r.locked_until end
   where username = lower(p_username);
end;
$$;

-- These are called only by the Edge Function using the service key — keep them
-- off the public API entirely.
revoke all on function public.login_guard_status(text)          from public, anon, authenticated;
revoke all on function public.login_guard_record(text, boolean) from public, anon, authenticated;
grant execute on function public.login_guard_status(text)          to service_role;
grant execute on function public.login_guard_record(text, boolean) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- C) Server-side password set (bcrypt) — replaces client-side hashing
-- ─────────────────────────────────────────────────────────────────────────────
-- Authorization is enforced INSIDE the function against the caller's JWT claims:
-- a Manager may set anyone's password; anyone may set their OWN. The plaintext
-- is hashed with bcrypt in Postgres and never returned.
create or replace function public.set_password(p_user_id text, p_new_password text)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
begin
  if p_new_password is null or length(p_new_password) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;
  if not (public.is_mgr() or p_user_id = public.app_sub()) then
    raise exception 'Not authorized to set this password';
  end if;
  update public.user_profiles
     set password_hash = crypt(p_new_password, gen_salt('bf', 12))
   where id = p_user_id;
  return found;
end;
$$;

revoke all on function public.set_password(text, text) from public, anon;
grant execute on function public.set_password(text, text) to authenticated, service_role;
