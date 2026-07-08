-- ── Migration 023: Lock down the numbering trigger functions ──────────────────
-- Migrations 020 & 022 added SECURITY DEFINER trigger/helper functions. Postgres
-- grants EXECUTE to PUBLIC by default, so the security linter flagged them as
-- callable by anon/authenticated (anon_/authenticated_security_definer_function
-- _executable). Trigger functions execute in the table-owner context and Postgres
-- does NOT check EXECUTE on the calling role when a trigger fires, so revoking
-- direct-call access is behaviour-preserving — the triggers still run — while
-- stopping a client from invoking them as RPCs (e.g. calling assign_doc_no to
-- burn counter values). next_doc_number and verify_login stay callable on
-- purpose; the app invokes them directly.
--
-- Applied to the live project via mcp__Supabase__apply_migration on 2026-07-08.

revoke execute on function public.assign_doc_no(text, text, uuid, regclass) from public, anon, authenticated;
revoke execute on function public.deals_assign_ce_no()          from public, anon, authenticated;
revoke execute on function public.job_orders_assign_no()        from public, anon, authenticated;
revoke execute on function public.check_vouchers_assign_no()    from public, anon, authenticated;
revoke execute on function public.design_requests_assign_no()   from public, anon, authenticated;
