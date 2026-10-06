-- ============================================================================
-- Migration 20261006a — Finance sets a project's VAT when it has no BOQ decision
--
-- Owner decision (Paulo Garcia, 2026-10-06): the BOQ's VAT choice sets
-- deals.receipt_type (VAT 12% → OR, No VAT → AR). The sales form no longer
-- picks it. For projects whose BOQ has NOT decided VAT (no BOQ, or the toggle
-- still unset), Finance may set it so the project can be billed.
--
-- Why an RPC: Finance roles cannot UPDATE deals (deals_upd allows Manager,
-- Sales, SalesOpsAdmin, QS). This function changes only receipt_type (and
-- clears withholding for AR), only for Manager / Finance / FinanceAssistant,
-- and refuses when the BOQ has decided — the BOQ stays the authority.
-- trg_deal_receipt_type_freeze (20261001010000) still fires, so invoices
-- already issued keep their tax.
--
-- Mirrors the Billing view's "Project VAT" control (src/App.jsx) — keep in sync.
-- Idempotent.
-- ============================================================================

create or replace function public.set_deal_receipt_type(p_deal_id uuid, p_receipt_type text)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  d record;
begin
  if not public.has_role('Manager', 'Finance', 'FinanceAssistant') then
    raise exception 'Only Finance or a Manager can set a project''s VAT.' using errcode = 'insufficient_privilege';
  end if;
  if p_receipt_type not in ('OR', 'AR') then
    raise exception 'Receipt type must be OR or AR.' using errcode = 'check_violation';
  end if;

  select id, ce_no, boq_data into d from public.deals where id = p_deal_id for update;
  if not found then
    raise exception 'Project not found.' using errcode = 'no_data_found';
  end if;
  if jsonb_typeof(d.boq_data -> 'vatEnabled') = 'boolean' then
    raise exception '% has a BOQ with VAT decided — change VAT in the BOQ.', coalesce(d.ce_no, 'This project')
      using errcode = 'check_violation';
  end if;

  update public.deals
     set receipt_type = p_receipt_type,
         withholding  = case when p_receipt_type = 'AR' then false else withholding end,
         updated_at   = now()
   where id = p_deal_id;
  return p_receipt_type;
end
$fn$;
revoke execute on function public.set_deal_receipt_type(uuid, text) from public, anon;
grant  execute on function public.set_deal_receipt_type(uuid, text) to authenticated;

-- ROLLBACK
-- drop function if exists public.set_deal_receipt_type(uuid, text);
