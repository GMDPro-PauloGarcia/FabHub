-- One-off data change, applied 2026-11-18 at Paulo's request ("Set 190 bills to this Friday").
-- Every open bill (190, ₱2.23M) had no due date, so the first Friday payment run
-- (2026-11-20) had nothing to sort by. Friday is a placeholder, not the supplier's
-- terms: set real terms per bill later. Each change is in audit_log under 'paulo'
-- (trg_audit_payables, reason 'field edit', changed_fields due_date).
-- Applied: 190 rows backed up, 190 updated, 86 still pending approval (unchanged).

create table if not exists public.payables_backup_20261118 as
  select id, due_date, status, approval_status, now() as backed_up_at
    from public.payables
   where status not in ('Paid','Cancelled') and due_date is null;
alter table public.payables_backup_20261118 enable row level security;
revoke all on public.payables_backup_20261118 from public, anon, authenticated;

select set_config('request.jwt.claims','{"username":"paulo","user_role":"Manager"}',true);
update public.payables set due_date = date '2026-11-20'
 where status not in ('Paid','Cancelled') and due_date is null;

-- ROLLBACK (restores the blank due dates)
-- update public.payables p set due_date = b.due_date
--   from public.payables_backup_20261118 b where b.id = p.id;
