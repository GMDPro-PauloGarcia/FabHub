-- ── Migration 038: assign_doc_no text-id overload (fix Check Voucher saves) ───
-- check_vouchers.id is a TEXT column (the app assigns short string ids to CVs),
-- but assign_doc_no only had a uuid-id overload. So the BEFORE INSERT trigger
-- check_vouchers_assign_no() called assign_doc_no(text, text, TEXT, regclass),
-- which matched no function — every Check Voucher insert failed with
-- "function public.assign_doc_no(unknown, text, text, unknown) does not exist"
-- and the payload was dropped by the client retry queue.
--
-- Add a text-id overload (identical body). Job Orders and Design Requests keep
-- using the uuid-id overload (their id columns are uuid). Already applied to the
-- live fabhub-gmd project and verified with a rolled-back trigger insert.

create or replace function public.assign_doc_no(p_prefix text, p_current text, p_id text, p_table regclass)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_existing text;
begin
  if p_current is not null and btrim(p_current) <> '' then
    return p_current;
  end if;
  execute format('select %I from %s where id = $1', lower(p_prefix)||'_no', p_table)
    into v_existing using p_id;
  if v_existing is not null and btrim(v_existing) <> '' then
    return v_existing;
  end if;
  return p_prefix || '-' || lpad(public.next_doc_number(p_prefix, 0)::text, 4, '0');
end;
$function$;

-- Match migration 023: these doc-number helpers are for the SECURITY DEFINER
-- triggers only, not client RPCs.
revoke execute on function public.assign_doc_no(text, text, text, regclass) from public, anon, authenticated;
