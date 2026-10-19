-- Two fixes on deals.ce_no (the Cost Estimate number):
--
-- 1. Signed C.E. evidence. The billing onboarding gate (dealOnboardingGate in
--    src/core.js) used to tick "Signed C.E." whenever ce_no was set, but every
--    deal gets a ce_no on insert (trg_deals_assign_ce_no), so the check could
--    never fail. These columns hold the real evidence: a link to the signed
--    C.E. / client PO and an "on file" flag, the same pattern as bir_2303_*.
--
-- 2. ce_no can no longer be blanked. trg_deals_assign_ce_no only runs on
--    insert and deals_ce_no_uniq allows blanks, so an edit that cleared the
--    field would wipe the number. This trigger keeps the old number when an
--    update sends null/blank. Changing it to another non-blank value is still
--    allowed (the deal form lets sales correct a CE number).
--
-- 3. set_deal_onboarding RPC. The Billing onboarding panel is editable by
--    Finance / FinanceAssistant, but deals_upd only admits Manager, Sales,
--    SalesOpsAdmin and QS, so their saves updated 0 rows and were silently
--    lost on reload. This RPC lets the BillingView editors write only the
--    onboarding columns, without widening deals_upd.
--
-- Idempotent; no DROP (Supabase MCP hangs on DROP).

alter table public.deals add column if not exists signed_ce_url text;
alter table public.deals add column if not exists signed_ce_on_file boolean not null default false;

create or replace function public.deals_keep_ce_no()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.ce_no is null or btrim(new.ce_no) = '')
     and old.ce_no is not null and btrim(old.ce_no) <> '' then
    new.ce_no := old.ce_no;
  end if;
  return new;
end;
$$;

revoke execute on function public.deals_keep_ce_no() from public, anon, authenticated;

create or replace trigger trg_deals_keep_ce_no
  before update of ce_no on public.deals
  for each row execute function public.deals_keep_ce_no();

-- Same roles as canEdit in BillingView (src/App.jsx) — keep them in sync.
create or replace function public.set_deal_onboarding(p_deal_id uuid, p_fields jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  if not public.has_role('Manager', 'Finance', 'FinanceAssistant', 'SalesOpsAdmin') then
    raise exception 'Not allowed to edit client onboarding' using errcode = '42501';
  end if;
  update public.deals set
    bir_2303_url       = case when p_fields ? 'bir_2303_url'       then nullif(p_fields->>'bir_2303_url', '')             else bir_2303_url end,
    bir_2303_on_file   = case when p_fields ? 'bir_2303_on_file'   then coalesce((p_fields->>'bir_2303_on_file')::boolean, false) else bir_2303_on_file end,
    signed_ce_url      = case when p_fields ? 'signed_ce_url'      then nullif(p_fields->>'signed_ce_url', '')            else signed_ce_url end,
    signed_ce_on_file  = case when p_fields ? 'signed_ce_on_file'  then coalesce((p_fields->>'signed_ce_on_file')::boolean, false) else signed_ce_on_file end,
    vat_treatment      = case when p_fields ? 'vat_treatment'      then nullif(p_fields->>'vat_treatment', '')            else vat_treatment end,
    downpayment_pct    = case when p_fields ? 'downpayment_pct'    then (nullif(p_fields->>'downpayment_pct', ''))::numeric else downpayment_pct end,
    payment_terms_text = case when p_fields ? 'payment_terms_text' then nullif(p_fields->>'payment_terms_text', '')       else payment_terms_text end,
    client_satisfied   = case when p_fields ? 'client_satisfied'   then coalesce((p_fields->>'client_satisfied')::boolean, false) else client_satisfied end,
    satisfaction_note  = case when p_fields ? 'satisfaction_note'  then nullif(p_fields->>'satisfaction_note', '')        else satisfaction_note end,
    updated_at         = now()
  where id = p_deal_id;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'Deal % not found', p_deal_id using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.set_deal_onboarding(uuid, jsonb) from public, anon;
grant  execute on function public.set_deal_onboarding(uuid, jsonb) to authenticated;

-- ROLLBACK
-- drop function if exists public.set_deal_onboarding(uuid, jsonb);
-- drop trigger if exists trg_deals_keep_ce_no on public.deals;
-- drop function if exists public.deals_keep_ce_no();
-- alter table public.deals drop column if exists signed_ce_on_file;
-- alter table public.deals drop column if exists signed_ce_url;
