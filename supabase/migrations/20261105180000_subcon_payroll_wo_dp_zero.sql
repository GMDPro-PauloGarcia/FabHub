-- Payroll Work Orders carry no down payment (decided by Paulo, 2026-11-05).
--
-- 20261105170000 back-filled dp_pct from the payment-terms text, so weekly
-- payroll WOs (mainly Benedicto Pantriore) got 50% from the default
-- "50% Start / 50% Completion". Payroll is billed after the work is done:
-- the PM certifies 100% instead, and a down payment would let half be paid
-- with no sign-off. This sets dp_pct = 0 on every WO whose scope says
-- payroll / salary and logs each change to audit_log.
--
-- Not included: WO-0032 "FENCE WIRE MESH AND CAT WALK MANPOWER" (a priced
-- scope, possibly a real 50/50 subcontract) — left at its current value.
-- New payroll WOs default to 0% in the app (woDefaultDpPct, src/core.js).
-- Idempotent (only rows still above 0 change).

with fixed as (
  update public.subcon_work_orders w
     set dp_pct = 0, updated_at = now()
   where w.dp_pct > 0 and w.scope_of_work ~* '(payroll|salary)'
  returning w.id, w.wo_number
)
insert into public.audit_log (table_name, record_id, action, old_snapshot, snapshot, changed_fields, performed_by, reason)
select 'subcon_work_orders', f.id::text, 'update', jsonb_build_object('dp_pct', 50, 'wo_number', f.wo_number),
       jsonb_build_object('dp_pct', 0, 'wo_number', f.wo_number), array['dp_pct'], 'migration',
       'Payroll WO: down payment set to 0% (20261105180000, decided by Paulo 2026-11-05)'
  from fixed f;

-- ROLLBACK
-- Restore from audit_log:
-- update public.subcon_work_orders w set dp_pct = (a.old_snapshot->>'dp_pct')::numeric
--   from public.audit_log a
--  where a.table_name = 'subcon_work_orders' and a.record_id = w.id::text
--    and a.reason like 'Payroll WO: down payment set to 0%%';
