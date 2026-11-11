-- Down payment rule back to "client has paid something" (Paulo, 2026-11-11).
--
-- 20261107010000_dp_rule_50pct_of_deal.sql (applied 2026-11-07, app side never
-- merged, PR #431) made a PO / subcon WO wait until the client had paid
-- downpayment_pct (default 50%) of the deal. Paulo, 2026-11-11: the 50% rule
-- doesn't stand. Many clients issue a PO instead of paying a down payment.
-- On 2026-11-11 it was holding 14 pending POs on 3 deals (₱1.91M) whose
-- clients had paid 44-45%, and the app on main (dealDpClear: "paid anything")
-- couldn't explain the refusal.
--
-- Back to the rule in CLAUDE.md "Down payment before production": a deal is
-- clear when a Manager waived the DP, the client is on credit terms, or the
-- client has paid anything (amount_paid or a non-bounced billing payment).
-- The parent / mother-PO / internal-job rules in deal_dp_clear are unchanged.
--
-- Kept from 20261107010000 (still useful, harmless under this rule):
--   * deal_dp_paid, deal_dp_clear's structure, set_deal_dp_pct (Manager RPC);
--   * the upsert early-return in po_require_dp (an issued PO can still be saved,
--     e.g. a delivery, even on a deal that isn't clear).
-- Turned off: trg_deals_dp_pct_guard. downpayment_pct no longer gates anything,
-- and the guard silently kept the old value when Finance set a DP % in Billing
-- onboarding. Disabled, not dropped (DROP hangs the Supabase MCP).
--
-- Mirrors dealDpClear (src/core.js). Idempotent; no DROP.

create or replace function public.deal_dp_met(p_deal uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public as $$
  select exists (
    select 1 from public.deals d
     where d.id = p_deal
       and (d.dp_waived_at is not null
            or public.client_on_credit_terms(d.client)
            or public.deal_dp_paid(d.id) > 0))
$$;

create or replace function public.deal_dp_shortfall(p_deal uuid)
returns text language sql stable security definer set search_path = pg_catalog, public as $$
  select coalesce(d.ce_no, 'this project') || ': no down payment collected yet'
    from public.deals d where d.id = p_deal
$$;

revoke execute on function public.deal_dp_met(uuid) from public, anon, authenticated;
revoke execute on function public.deal_dp_shortfall(uuid) from public, anon, authenticated;

alter table public.deals disable trigger trg_deals_dp_pct_guard;

-- ROLLBACK (back to the 50% rule)
-- Re-run deal_dp_met and deal_dp_shortfall from 20261107010000_dp_rule_50pct_of_deal.sql
-- (branch claude/dp-50pct-rule), then:
-- alter table public.deals enable trigger trg_deals_dp_pct_guard;
