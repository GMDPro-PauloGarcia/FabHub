-- AP numbers: one bill, one number, issued once.
--
-- Why: about 100 AP numbers were shared by two or more bills (Aug–Sep 2026,
-- when two people entered bills at the same time; AP-2026-0052 was on 13
-- subcontractor work orders). "Pay AP-2026-0435" could mean either of two bills.
--
-- 1. Renumber: in each group of bills sharing a number, the bill with the
--    earliest PO keeps it; every other bill gets the next free number from the
--    normal counter. The old number is kept in the bill's notes and in
--    audit_log (action = 'ap_renumber'), so a paper or Excel reference still
--    leads to the bill.
-- 2. Lock: once a bill has an AP number, an update can't change it. A stale
--    copy saved on a device still carries the old number, and the app sends the
--    whole row on save; the old number is silently kept instead of the save
--    failing (same pattern as JO numbers). Only this migration's renumber step
--    may change a number (it sets fabhub.ap_renumber for its own transaction).
-- 3. Unique: a partial unique index refuses any new duplicate. Blank numbers
--    (16 bills from early Aug) are left alone.
--
-- Idempotent: the renumber only touches numbers that are still duplicated.

create or replace function public.payables_lock_ap_number()
returns trigger language plpgsql security definer
set search_path to 'pg_catalog', 'public' as $$
begin
  if coalesce(trim(old.ap_number), '') <> ''
     and new.ap_number is distinct from old.ap_number
     and coalesce(current_setting('fabhub.ap_renumber', true), '') <> 'on' then
    new.ap_number := old.ap_number;
  end if;
  return new;
end $$;
revoke execute on function public.payables_lock_ap_number() from public, anon, authenticated;

create or replace trigger trg_payables_lock_ap_number
  before update on public.payables
  for each row execute function public.payables_lock_ap_number();

do $renum$
declare r record; v_base text; v_min bigint; v_next bigint; v_new text;
begin
  perform set_config('fabhub.ap_renumber', 'on', true);
  for r in
    select id, ap_number, doc_type, notes
      from (select p.*, row_number() over (partition by ap_number
                    order by created_at nulls last, po_id nulls last, id) rn
              from public.payables p
             where coalesce(trim(ap_number), '') <> ''
               and ap_number in (select ap_number from public.payables
                                  where coalesce(trim(ap_number), '') <> ''
                                  group by ap_number having count(*) > 1)) x
     where rn > 1
     order by ap_number, rn
  loop
    v_base := (case when r.doc_type = 'PRV' then 'PRV' else 'AP' end) || '-2026';
    select coalesce(max((regexp_match(ap_number, '^' || v_base || '-(\d+)$'))[1]::bigint), 0)
      into v_min from public.payables where ap_number like v_base || '-%';
    v_next := public.next_doc_number(v_base, v_min);
    v_new  := v_base || '-' || lpad(v_next::text, 4, '0');
    update public.payables
       set ap_number = v_new,
           notes = 'Formerly ' || r.ap_number || ' (number was shared with another bill; renumbered 4 Nov 2026).'
                   || coalesce(' · ' || nullif(r.notes, ''), '')
     where id = r.id;
    insert into public.audit_log (table_name, record_id, action, snapshot, reason, performed_by)
    values ('payables', r.id, 'ap_renumber',
            jsonb_build_object('old_ap_number', r.ap_number, 'new_ap_number', v_new),
            'AP number was shared by more than one bill', 'migration 20261104090000');
  end loop;
end $renum$;

create unique index if not exists payables_ap_number_unique
  on public.payables (ap_number) where coalesce(trim(ap_number), '') <> '';

-- ROLLBACK
-- The renumbering is kept on purpose (old numbers are in audit_log, action
-- 'ap_renumber', and in each bill's notes). To remove the lock and the index:
--   drop index if exists public.payables_ap_number_unique;
--   drop trigger if exists trg_payables_lock_ap_number on public.payables;
--   drop function if exists public.payables_lock_ap_number();
