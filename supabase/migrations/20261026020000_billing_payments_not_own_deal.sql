-- No recording collections on your own deals.
--
-- Sales commission is a share of what the client has collected, and the
-- collected figure is the sum of billing_payments. Jessica Castro
-- (SalesOpsAdmin) records most of GMD's collections and is now also an
-- Account Executive who earns commission, so without this rule she could log
-- the payments that pay her own commission.
--
-- Rule: anyone other than a Manager may not insert, edit or delete a payment
-- on a milestone whose deal lists them as the Sales Owner (deals.sales_owner).
-- Recording collections on everyone else's deals is unchanged. Someone else
-- (Finance, a Finance Assistant, or a Manager) records the collections on her
-- deals.
--
-- "Them" means the user's name, read two ways so that a stale or missing
-- source can't open a gap: the `name` claim that mint-session puts in the JWT,
-- and user_profiles.name for the logged-in username (RLS lets a user read
-- their own profile row).
--
-- These are RESTRICTIVE policies: they only narrow the existing
-- billing_payments_ins/upd/del policies, never widen them. Viewing payments
-- is unaffected.
--
-- Mirrors ownsDealCommission (src/core.js), used by BillingView's Log / Edit /
-- Clear / Bounce / Remove payment controls. Keep them in sync.
--
-- Idempotent; no DROP (Supabase MCP hangs on DROP).

create or replace function public.is_own_sales_deal_milestone(p_milestone_id uuid)
returns boolean
language sql
stable
set search_path to 'pg_catalog', 'public'
as $$
  select exists (
    select 1
    from public.billing_milestones m
    join public.deals d on d.id = m.deal_id
    where m.id = p_milestone_id
      and nullif(btrim(d.sales_owner), '') is not null
      and lower(btrim(d.sales_owner)) in (
        lower(btrim(coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'name', ''))),
        lower(btrim(coalesce((select up.name from public.user_profiles up
                              where up.username = public.app_username() limit 1), '')))
      )
  )
$$;

revoke execute on function public.is_own_sales_deal_milestone(uuid) from public, anon;
grant  execute on function public.is_own_sales_deal_milestone(uuid) to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'billing_payments'
                 and policyname = 'billing_payments_ins_not_own_deal') then
    create policy billing_payments_ins_not_own_deal on public.billing_payments
      as restrictive for insert to authenticated
      with check (public.is_mgr() or not public.is_own_sales_deal_milestone(milestone_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'billing_payments'
                 and policyname = 'billing_payments_upd_not_own_deal') then
    create policy billing_payments_upd_not_own_deal on public.billing_payments
      as restrictive for update to authenticated
      using (public.is_mgr() or not public.is_own_sales_deal_milestone(milestone_id))
      with check (public.is_mgr() or not public.is_own_sales_deal_milestone(milestone_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'billing_payments'
                 and policyname = 'billing_payments_del_not_own_deal') then
    create policy billing_payments_del_not_own_deal on public.billing_payments
      as restrictive for delete to authenticated
      using (public.is_mgr() or not public.is_own_sales_deal_milestone(milestone_id));
  end if;
end $$;

-- ROLLBACK
-- Neutralise the rule without DROP (MCP-safe):
--   alter policy billing_payments_ins_not_own_deal on public.billing_payments with check (public.has_role('Manager','Finance','FinanceAssistant','SalesOpsAdmin'));
--   alter policy billing_payments_upd_not_own_deal on public.billing_payments using (public.has_role('Manager','Finance','FinanceAssistant','SalesOpsAdmin')) with check (public.has_role('Manager','Finance','FinanceAssistant','SalesOpsAdmin'));
--   alter policy billing_payments_del_not_own_deal on public.billing_payments using (public.has_role('Manager','Finance','FinanceAssistant','SalesOpsAdmin'));
-- Full removal (run in the SQL editor, not the MCP):
--   drop policy if exists billing_payments_ins_not_own_deal on public.billing_payments;
--   drop policy if exists billing_payments_upd_not_own_deal on public.billing_payments;
--   drop policy if exists billing_payments_del_not_own_deal on public.billing_payments;
--   drop function if exists public.is_own_sales_deal_milestone(uuid);
