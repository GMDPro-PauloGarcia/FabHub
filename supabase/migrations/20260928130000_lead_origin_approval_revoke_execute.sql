-- ── Follow-up to 20260928120000_lead_origin_approval ────────────────────────
-- enforce_lead_origin_approval() is a SECURITY DEFINER trigger function. The
-- default PUBLIC EXECUTE grant (plus anon/authenticated) left it RPC-callable,
-- which the Security Advisor flags — same fix as migration 066 applied to
-- enforce_payable_approval() / protect_user_profile(). Trigger execution does not
-- check EXECUTE, so the trigger keeps firing. Idempotent.

revoke execute on function public.enforce_lead_origin_approval() from public;
revoke execute on function public.enforce_lead_origin_approval() from anon, authenticated;
