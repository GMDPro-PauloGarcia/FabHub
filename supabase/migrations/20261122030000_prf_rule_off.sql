-- Switch the 1 Dec "no approved PRF = no project PO" rule OFF (Paulo, 2026-11-22).
--
-- Same day it was applied, GMD split into two departments: Operations / design
-- (Mar, Arrius) and back-end support (Paulo: sales, finance, cost control,
-- procurement, HR). Procurement now orders a project's materials itself, from a
-- material budget Cost Control (QS) locks at award; a PRF is only for a special
-- item Operations asks for. A PRF-only rule would hold every one of those POs.
--
-- Only prf_rule_on() changes: everything else from 20261122020000 stays
-- (prf_line_id, po_prf_waivers, waive_po_prf, po_prf_status, the trigger, which
-- returns early while the rule is off, and the created_at pin). The rule comes
-- back as "PRF line or locked material budget line" once QS budgets exist.
-- `set local fabhub.prf_rule_force = 'on'` still switches it on inside a test.
--
-- App mirror: PRF_RULE_ON = false in src/core.js (prfRuleOn). Keep in sync.

create or replace function public.prf_rule_on()
returns boolean language sql stable set search_path = pg_catalog, public as $$
  select coalesce(current_setting('fabhub.prf_rule_force', true), '') = 'on'
$$;
revoke execute on function public.prf_rule_on() from public, anon, authenticated;

-- ROLLBACK (switch it back on from 1 Dec 2026 Manila):
--   create or replace function public.prf_rule_on() returns boolean language sql stable
--     set search_path = pg_catalog, public as $$
--     select coalesce(current_setting('fabhub.prf_rule_force', true), '') = 'on'
--         or (now() at time zone 'Asia/Manila')::date >= date '2026-12-01' $$;
