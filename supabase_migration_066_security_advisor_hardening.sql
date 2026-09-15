-- ── Migration 066: Security Advisor hardening ───────────────────────────────
-- Clears the Supabase Security Advisor ERROR and the low-risk, zero-behaviour
-- WARN categories. Scope is deliberately limited to changes that CANNOT alter
-- app behaviour:
--
--   1. RLS on public.client_rename_backup   → fixes the 1 ERROR (data leak)
--   2. Pin search_path on 10 functions       → fixes function_search_path_mutable
--   3. Revoke EXECUTE on the 2 TRIGGER fns    → fixes SECURITY DEFINER exposure
--
-- Intentionally NOT touched here (require a product decision — see PR notes):
--   • "Anonymous Access Policies" x53  → disable Anonymous sign-ins in Auth
--     settings; FabHub uses custom auth (verify_login), not Supabase anon.
--   • verify_login / next_po_number / next_doc_number EXECUTE grants → these
--     are called by the app as RPC; leaving them callable is intentional.

-- 1) ERROR: RLS disabled on public.client_rename_backup ----------------------
--    Leftover one-off backup table (68 rows of client data). Nothing in the app
--    reads it, so we enable RLS with NO policies = deny-all through PostgREST.
--    The service role and migrations still have full access. (Consider dropping
--    this table entirely once the rename backfill is confirmed no longer needed.)
alter table public.client_rename_backup enable row level security;
revoke all on public.client_rename_backup from anon, authenticated;

-- 2) WARN: function_search_path_mutable --------------------------------------
--    Pin search_path so a SECURITY DEFINER function can't be hijacked by an
--    object planted in an earlier schema. pg_catalog first (built-ins win),
--    public second (existing unqualified table refs still resolve) — no body
--    changes, so no behaviour change.
alter function public.app_role()                          set search_path = pg_catalog, public;
alter function public.app_sub()                           set search_path = pg_catalog, public;
alter function public.app_username()                      set search_path = pg_catalog, public;
alter function public.app_name()                          set search_path = pg_catalog, public;
alter function public.is_user()                           set search_path = pg_catalog, public;
alter function public.is_mgr()                            set search_path = pg_catalog, public;
alter function public.is_senior_designer()                set search_path = pg_catalog, public;
alter function public.has_role(variadic text[])           set search_path = pg_catalog, public;
alter function public.enforce_payable_approval()          set search_path = pg_catalog, public;
alter function public.deals_reject_placeholder_value()    set search_path = pg_catalog, public;

-- 3) WARN: SECURITY DEFINER functions callable via RPC -----------------------
--    These two are TRIGGER functions (trg_payable_approval, trg_protect_user_profile).
--    They must never be reachable as /rest/v1/rpc endpoints. Revoking EXECUTE
--    from anon/authenticated does NOT stop the triggers firing (triggers run as
--    the table owner), it only removes the RPC attack surface.
revoke execute on function public.enforce_payable_approval() from anon, authenticated;
revoke execute on function public.protect_user_profile()     from anon, authenticated;

-- 066b) The default PUBLIC EXECUTE grant kept the two trigger functions
--       RPC-callable, so the revokes above (from anon/authenticated only) were
--       not enough. Revoke from PUBLIC as well.
revoke execute on function public.enforce_payable_approval() from public;
revoke execute on function public.protect_user_profile()     from public;
