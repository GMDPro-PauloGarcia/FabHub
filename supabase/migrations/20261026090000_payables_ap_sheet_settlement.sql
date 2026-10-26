-- ── Settle FabHub payables against the AP Monitoring sheet (2026-10-26) ──────
-- Finance pays suppliers from its Excel "AP Monitoring & Check Monitoring" sheet
-- and never marked bills paid in FabHub (3 bills ever, last 2026-08-13), so
-- Running Payables showed PHP 12.3M owed. Paulo approved (2026-10-26):
--   A  bill's PO no. is paid in the sheet               -> paid (sheet amount, date, check no.)
--   B1 matched to a paid sheet row by vendor + amount    -> paid
--   B2 Aug-Sep bill not in the sheet (pre-dates it)      -> assumed settled (date = bill date)
--   A check marked paid in the sheet with no date counts as paid (invoice date used).
-- October bills not in the sheet, and bills the sheet paid for less than FabHub's
-- amount, stay open for Finance to check (sent to Mark as Excel).
--
-- Bills are marked paid through payable_payments, never Cancelled: Cancelled
-- payables drop out of project costs (ledgerCosts in src/core.js), paid ones stay.
-- The payable_payments triggers recompute paid_amount / status / paid_date, and
-- keep them when a device later saves a stale copy of the bill.
--
-- Input: public.ap_import_20261026 (754 rows, PHP 10,492,001.73, loaded and
-- checksummed before this ran; server-only, RLS on, no policies). Applied with
-- apply_migration, which runs without a request JWT, so the approval and payment
-- guards (migration context exempt) do not block it.
--
-- ROLLBACK (puts every bill back as it was):
--   update public.payable_payments set status='Cancelled', cancel_reason='Rollback of AP sheet import 2026-10-26'
--    where id like 'apsheet-20261026-%' and status='Active';
--   update public.payables p set approval_status=b.approval_status, approved_by=b.approved_by, approved_at=b.approved_at
--     from public.payables_backup_20261026 b
--    where b.id=p.id and p.approved_by='AP Monitoring import (Paulo, 2026-10-26)';
--   (payables_backup_20261026 holds every payable row as it was before the import.)

-- 1) Backup of every payable before the import (server-only).
create table if not exists public.payables_backup_20261026 as select * from public.payables;
alter table public.payables_backup_20261026 enable row level security;
revoke all on public.payables_backup_20261026 from public, anon, authenticated;

-- 2) Bills settled per the sheet count as approved (FabHub approval was never used for them).
update public.payables p
   set approval_status='Approved', approved_by='AP Monitoring import (Paulo, 2026-10-26)', approved_at=now()
  from public.ap_import_20261026 i
 where p.id=i.payable_id and coalesce(nullif(p.approval_status,''),'Approved')<>'Approved';

-- 3) One Active payment row per bill; the triggers mark the bill Paid / Partial.
insert into public.payable_payments (id, payable_id, batch_id, kind, pay_date, amount, retention_amount, method, bank, ref_no, note, status, recorded_by)
select 'apsheet-20261026-'||i.payable_id, i.payable_id, 'apsheet-20261026-'||i.grp, 'Payment', i.pay_date, i.amount, 0,
       case i.m when 'C' then 'Check' when 'T' then 'Bank transfer' else i.m end, i.bank, i.ref_no,
       case i.grp
         when 'A'  then 'Paid per AP Monitoring sheet (inv '||i.inv||')'
         when 'B1' then 'Paid per AP Monitoring sheet, matched by vendor + amount (inv '||i.inv||')'
         else 'Pre-AP-log bill, not in AP Monitoring sheet: assumed settled (date = bill date)' end
       ||case when i.undated then '; check date not recorded, invoice date used' else '' end
       ||'. Imported 2026-10-26 on Paulo''s instruction.',
       'Active', 'AP Monitoring import (Paulo)'
  from public.ap_import_20261026 i
  join public.payables p on p.id=i.payable_id
 where p.status not in ('Paid','Cancelled')
   and not exists (select 1 from public.payable_payments x where x.id='apsheet-20261026-'||i.payable_id);
