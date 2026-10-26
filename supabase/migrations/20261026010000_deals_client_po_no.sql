-- Client PO number on deals.
--
-- Clients who issue a purchase order want its number on GMD's SOA and
-- invoice. FabHub had nowhere to keep it: the only PO fields are for GMD's own
-- POs to suppliers (purchase_requests.po_number).
--
-- deals.client_po_no is optional (blank = no PO). It is set only through
-- set_deal_client_po, because Finance / FinanceAssistant edit it from the
-- Billing page and deals_upd doesn't admit them (same reason as
-- set_deal_onboarding). The app never sends it in a full-row deal save
-- (toSbDeal), so a stale device can't overwrite it. Every change is kept in
-- audit_log.
--
-- Who may set it: Manager, Finance, FinanceAssistant, Sales, SalesOpsAdmin.
-- Mirrors canEditClientPo in BillingView (src/App.jsx): keep them in sync.
--
-- Idempotent; no DROP (Supabase MCP hangs on DROP).

alter table public.deals add column if not exists client_po_no text;

create or replace function public.set_deal_client_po(p_deal_id uuid, p_po text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old text;
  v_new text := nullif(btrim(coalesce(p_po, '')), '');
begin
  if not public.has_role('Manager', 'Finance', 'FinanceAssistant', 'Sales', 'SalesOpsAdmin') then
    raise exception 'Not allowed to edit the client PO number' using errcode = '42501';
  end if;
  if v_new is not null and length(v_new) > 100 then
    raise exception 'Client PO number is too long (100 characters max)' using errcode = '22001';
  end if;

  select client_po_no into v_old from public.deals where id = p_deal_id for update;
  if not found then
    raise exception 'Deal % not found', p_deal_id using errcode = 'P0002';
  end if;
  if v_old is not distinct from v_new then
    return v_new;
  end if;

  update public.deals set client_po_no = v_new, updated_at = now() where id = p_deal_id;

  insert into public.audit_log
    (table_name, record_id, action, old_snapshot, snapshot, changed_fields, performed_by, reason)
  values
    ('deals', p_deal_id::text, 'update',
     jsonb_build_object('client_po_no', v_old), jsonb_build_object('client_po_no', v_new),
     array['client_po_no'], public.app_username(), 'client PO number');

  return v_new;
end;
$$;

revoke execute on function public.set_deal_client_po(uuid, text) from public, anon;
grant  execute on function public.set_deal_client_po(uuid, text) to authenticated;

-- ROLLBACK
-- drop function if exists public.set_deal_client_po(uuid, text);
-- alter table public.deals drop column if exists client_po_no;
