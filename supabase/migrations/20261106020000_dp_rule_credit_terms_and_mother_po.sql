-- Down payment rule: clients on credit terms, and the mother-PO gap
-- (decided by Paulo, 2026-11-06).
--
-- "NO DP = NO production" (20261020110000) blocks POs and subcon WOs on a
-- client deal until the client has paid something or a Manager waives the
-- down payment for that deal. Two changes:
--
-- 1. Clients on credit terms. Corporates such as Diageo, SM Development and
--    Stores Specialists pay against their own PO 30-60 days after delivery and
--    never pay a down payment, so every one of their jobs was blocked. A
--    Manager can now put a client on credit terms (client_credit_terms, set
--    only through set_client_credit_terms: Manager, reason required, logged
--    to audit_log). Every deal whose client name matches (case-insensitive,
--    as typed on the deal; the sub-project's or its parent's client) is clear.
--    Taking a client off credit terms keeps the row (active = false).
--
-- 2. Mother-PO gap. A sub-project under a standby PO umbrella was clear only
--    if the umbrella itself was paid or waived, but an umbrella earns ₱0 by
--    design: its sub-projects carry the billing. So Diageo CE-2026-1350 stayed
--    blocked although its sibling CE-2026-091 was paid ₱842K. A sub-project is
--    now clear when its umbrella is clear (any sibling paid or waived).
--
-- Mirrors dealDpClear / setCreditTermClients (src/core.js) and the credit
-- terms controls in DpGate and the Clients page (src/App.jsx). Keep in sync.
-- Idempotent; no DROP.

create table if not exists public.client_credit_terms (
  client_name text primary key,
  days        integer not null default 30,
  reason      text not null default '',
  active      boolean not null default true,
  set_by      text not null default '',
  set_at      timestamptz not null default now()
);
alter table public.client_credit_terms enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='client_credit_terms' and policyname='client_credit_terms_sel') then
    create policy client_credit_terms_sel on public.client_credit_terms for select to authenticated
      using (public.has_role('Manager','Finance','FinanceAssistant','Accounting','Procurement','ProcurementManager','Sales','SalesOpsAdmin','Operations','ProjectMover','Warehouse'));
  end if;
end $$;
revoke all on public.client_credit_terms from anon;
revoke insert, update, delete, truncate on public.client_credit_terms from authenticated;

create or replace function public.client_on_credit_terms(p_client text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(btrim(p_client),'') <> '' and exists (
    select 1 from public.client_credit_terms c
     where c.active and lower(btrim(c.client_name)) = lower(btrim(p_client)))
$$;
revoke execute on function public.client_on_credit_terms(text) from public, anon, authenticated;

-- Manager only; reason required to switch on (and to switch off).
create or replace function public.set_client_credit_terms(p_client text, p_on boolean, p_days integer, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_name text := btrim(coalesce(p_client,'')); v_old jsonb;
begin
  if not public.is_mgr() then
    raise exception 'Only a Manager can put a client on credit terms' using errcode = '42501';
  end if;
  if v_name = '' or length(v_name) > 200 then
    raise exception 'Client name is required' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_reason,''))) < 5 then
    raise exception 'Give the reason (at least 5 characters)' using errcode = '22023';
  end if;
  if p_on and (p_days is null or p_days < 0 or p_days > 365) then
    raise exception 'Credit terms must be 0 to 365 days' using errcode = '22023';
  end if;
  select to_jsonb(c) into v_old from public.client_credit_terms c where lower(c.client_name) = lower(v_name);
  insert into public.client_credit_terms(client_name, days, reason, active, set_by, set_at)
  values (v_name, coalesce(p_days,30), btrim(p_reason), coalesce(p_on,false), public.app_username(), now())
  on conflict (client_name) do update
     set days = case when excluded.active then excluded.days else client_credit_terms.days end,
         reason = excluded.reason, active = excluded.active, set_by = excluded.set_by, set_at = excluded.set_at;
  insert into public.audit_log (table_name, record_id, action, old_snapshot, snapshot, changed_fields, performed_by, reason)
  values ('client_credit_terms', v_name, case when p_on then 'credit_terms_on' else 'credit_terms_off' end, v_old,
          jsonb_build_object('active', p_on, 'days', p_days), array['active','days'], public.app_username(), btrim(p_reason));
end $$;
revoke execute on function public.set_client_credit_terms(text, boolean, integer, text) from public, anon;
grant  execute on function public.set_client_credit_terms(text, boolean, integer, text) to authenticated;

create or replace function public.deal_dp_clear(p_deal uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public as $$
  select p_deal is null or exists (
    select 1 from public.deals d
     where d.id = p_deal
       and (
            d.client ilike 'GMD Production%'
         or d.dp_waived_at is not null
         or coalesce(d.amount_paid, 0) > 0
         or public.client_on_credit_terms(d.client)
         or exists (select 1 from public.billing_milestones m
                      join public.billing_payments p on p.milestone_id = m.id
                     where m.deal_id = d.id and coalesce(p.amount, 0) > 0
                       and not coalesce(p.bounced, false))
         or exists (select 1 from public.deals par
                     where par.id = d.parent_deal_id
                       and (par.dp_waived_at is not null
                            or coalesce(par.amount_paid, 0) > 0
                            or public.client_on_credit_terms(par.client)
                            -- a mother PO (standby umbrella) is clear once any of its sub-projects is
                            or (coalesce(par.standby_po, false) and exists (
                                  select 1 from public.deals sib
                                   where sib.parent_deal_id = par.id
                                     and (sib.dp_waived_at is not null or coalesce(sib.amount_paid, 0) > 0)))))
         or (coalesce(d.standby_po, false) and exists (
               select 1 from public.deals ch
                where ch.parent_deal_id = d.id
                  and (ch.dp_waived_at is not null or coalesce(ch.amount_paid, 0) > 0)))
       ))
$$;

-- ROLLBACK
-- Re-run deal_dp_clear from 20261020110000_po_require_down_payment.sql, then:
-- drop function if exists public.set_client_credit_terms(text, boolean, integer, text);
-- drop function if exists public.client_on_credit_terms(text);
-- drop table if exists public.client_credit_terms;   -- loses the credit-terms history (audit_log keeps it)
