-- ============================================================================
-- Migration 20261012b — Finance can save a deal's onboarding fields
--
-- Billing's "Client onboarding" panel (BIR 2303, VAT treatment, down payment %,
-- payment terms, client satisfaction) wrote straight to deals. deals_upd does not
-- include Finance / FinanceAssistant, so those saves matched 0 rows and were
-- silently lost (confirmed 2026-10-09 in a rolled-back test: Finance 0 rows,
-- Manager 1 row).
--
-- This RPC updates ONLY those onboarding columns, only the keys present in
-- p_fields, for: Manager, Finance, FinanceAssistant, SalesOpsAdmin, Sales, QS
-- (the deals_upd roles plus Finance). Everything else on the deal stays under
-- deals_upd.
--
-- Mirrors onSaveOnboarding in src/App.jsx — keep the field list in sync.
-- Idempotent.
-- ============================================================================

create or replace function public.save_deal_onboarding(p_deal_id uuid, p_fields jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not public.has_role('Manager', 'Finance', 'FinanceAssistant', 'SalesOpsAdmin', 'Sales', 'QS') then
    raise exception 'You don''t have permission to edit project onboarding details.' using errcode = 'insufficient_privilege';
  end if;
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then
    raise exception 'Nothing to save.' using errcode = 'check_violation';
  end if;

  update public.deals set
    bir_2303_url       = case when p_fields ? 'bir_2303_url'       then nullif(p_fields->>'bir_2303_url', '')       else bir_2303_url end,
    bir_2303_on_file   = case when p_fields ? 'bir_2303_on_file'   then coalesce((p_fields->>'bir_2303_on_file')::boolean, false) else bir_2303_on_file end,
    vat_treatment      = case when p_fields ? 'vat_treatment'      then nullif(p_fields->>'vat_treatment', '')      else vat_treatment end,
    downpayment_pct    = case when p_fields ? 'downpayment_pct'    then nullif(p_fields->>'downpayment_pct', '')::numeric else downpayment_pct end,
    payment_terms_text = case when p_fields ? 'payment_terms_text' then nullif(p_fields->>'payment_terms_text', '') else payment_terms_text end,
    client_satisfied   = case when p_fields ? 'client_satisfied'   then coalesce((p_fields->>'client_satisfied')::boolean, false) else client_satisfied end,
    satisfaction_note  = case when p_fields ? 'satisfaction_note'  then nullif(p_fields->>'satisfaction_note', '')  else satisfaction_note end,
    updated_at         = now()
  where id = p_deal_id;
  if not found then
    raise exception 'Project not found.' using errcode = 'no_data_found';
  end if;
end
$fn$;
revoke execute on function public.save_deal_onboarding(uuid, jsonb) from public, anon;
grant  execute on function public.save_deal_onboarding(uuid, jsonb) to authenticated;

-- ROLLBACK
-- drop function if exists public.save_deal_onboarding(uuid, jsonb);
