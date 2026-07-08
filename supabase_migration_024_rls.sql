-- ── Migration 024: Row-Level Security — real per-role policies ────────────────
-- Replaces the `USING (true)` policies with role-aware rules from
-- docs/ACCESS_MATRIX.md (decisions 2026-07-08). Identity comes from a signed JWT
-- (Edge Function mint-session) carrying a `user_role` claim; anonymous sessions
-- match nothing. The spec array below IS the access matrix — one row per table
-- with the roles allowed per operation ("AUTH" = any logged-in user; a missing
-- key = operation denied to everyone). DELETE on deals/financial records is
-- Manager-only; audit_log & activity_log are append-only. user_profiles is
-- handled explicitly (own-row + privilege-escalation guard).

-- Helpers ---------------------------------------------------------------------
create or replace function public.app_role() returns text language sql stable as
  $fn$ select coalesce(nullif(current_setting('request.jwt.claims', true),'')::jsonb ->> 'user_role','') $fn$;
create or replace function public.is_user() returns boolean language sql stable as
  $fn$ select public.app_role() <> '' $fn$;
create or replace function public.is_mgr() returns boolean language sql stable as
  $fn$ select public.app_role() = 'Manager' $fn$;
create or replace function public.has_role(variadic roles text[]) returns boolean language sql stable as
  $fn$ select public.app_role() = any(roles) $fn$;
-- user_profiles.id is text (e.g. "u16"), not a uuid, so own-row checks compare
-- the token's `sub` claim as text rather than using auth.uid() (which casts to uuid).
create or replace function public.app_sub() returns text language sql stable as
  $fn$ select coalesce(nullif(current_setting('request.jwt.claims', true),'')::jsonb ->> 'sub','') $fn$;
grant execute on function public.app_role(), public.is_user(), public.is_mgr(), public.has_role(text[]), public.app_sub() to authenticated, anon;

-- user_profiles: own-row access + guard so non-managers can't self-promote -----
create or replace function public.protect_user_profile() returns trigger
  language plpgsql security definer set search_path = public as $fn$
begin
  if not public.is_mgr() then new.role := old.role; new.status := old.status; end if;
  return new;
end; $fn$;
drop trigger if exists trg_protect_user_profile on public.user_profiles;
create trigger trg_protect_user_profile before update on public.user_profiles
  for each row execute function public.protect_user_profile();
alter table public.user_profiles enable row level security;
drop policy if exists fabhub_app_access on public.user_profiles;
drop policy if exists user_profiles_sel on public.user_profiles;
drop policy if exists user_profiles_ins on public.user_profiles;
drop policy if exists user_profiles_upd on public.user_profiles;
drop policy if exists user_profiles_del on public.user_profiles;
create policy user_profiles_sel on public.user_profiles for select to authenticated using ( public.is_mgr() or id = public.app_sub() );
create policy user_profiles_ins on public.user_profiles for insert to authenticated with check ( public.is_mgr() );
create policy user_profiles_upd on public.user_profiles for update to authenticated using ( public.is_mgr() or id = public.app_sub() ) with check ( public.is_mgr() or id = public.app_sub() );
create policy user_profiles_del on public.user_profiles for delete to authenticated using ( public.is_mgr() );

-- All other tables, generated from the matrix spec ----------------------------
do $do$
declare
  spec jsonb := '[{"t":"deals","sel":["Manager","Sales","Finance","Procurement","QS","Design"],"ins":["Manager","Sales"],"upd":["Manager","Sales"],"del":["Manager"]},{"t":"job_orders","sel":"AUTH","ins":["Manager","ProjectMover"],"upd":["Manager","ProjectMover"],"del":["Manager"]},{"t":"project_cards","sel":"AUTH","ins":["Manager","ProjectMover","Finance"],"upd":["Manager","ProjectMover","Finance"],"del":["Manager"]},{"t":"project_card_dept_tasks","sel":"AUTH","ins":["Manager","ProjectMover","Finance"],"upd":["Manager","ProjectMover","Finance"],"del":["Manager"]},{"t":"project_card_dept_status","sel":"AUTH","ins":["Manager","ProjectMover","Finance"],"upd":["Manager","ProjectMover","Finance"],"del":["Manager"]},{"t":"daily_logs","sel":["Manager","ProjectMover","Sales"],"ins":["Manager","ProjectMover"],"upd":["Manager","ProjectMover"],"del":["Manager"]},{"t":"addenda","sel":["Manager","ProjectMover","Sales","Finance","Procurement","Design"],"ins":["Manager","ProjectMover","Procurement","Design"],"upd":["Manager"],"del":["Manager"]},{"t":"design_requests","sel":["Manager","ProjectMover","Sales","Finance","Design"],"ins":["Manager","Sales","Design"],"upd":["Manager","Design"],"del":["Manager"]},{"t":"design_request_forms","sel":["Manager","ProjectMover","Sales","Finance","Design"],"ins":["Manager","Sales","Design"],"upd":["Manager","Design"],"del":["Manager"]},{"t":"inflows","sel":["Manager","Finance"],"ins":["Manager","Finance"],"upd":["Manager","Finance"],"del":["Manager"]},{"t":"cash_positions","sel":["Manager","Finance"],"ins":["Manager","Finance"],"upd":["Manager","Finance"],"del":["Manager"]},{"t":"billing_milestones","sel":["Manager","Finance","Accounting"],"ins":["Manager","Finance"],"upd":["Manager","Finance"],"del":["Manager"]},{"t":"billing_payments","sel":["Manager","Finance","Accounting"],"ins":["Manager","Finance"],"upd":["Manager","Finance"],"del":["Manager"]},{"t":"expenses","sel":"AUTH","ins":["Manager","Finance","Accounting"],"upd":["Manager","Finance","Accounting"],"del":["Manager"]},{"t":"payables","sel":["Manager","Finance","Accounting"],"ins":["Manager","Finance","Accounting"],"upd":["Manager","Finance","Accounting"],"del":["Manager"]},{"t":"check_vouchers","sel":["Manager","Finance","Accounting"],"ins":["Manager","Accounting"],"upd":["Manager","Finance","Accounting"],"del":["Manager"]},{"t":"loans","sel":["Manager","Finance"],"ins":["Manager","Finance"],"upd":["Manager","Finance"],"del":["Manager"]},{"t":"loan_payments","sel":["Manager","Finance"],"ins":["Manager","Finance"],"upd":["Manager","Finance"],"del":["Manager"]},{"t":"audit_log","sel":["Manager","Finance","Accounting"],"ins":"AUTH"},{"t":"purchase_requests","sel":["Manager","Finance","Procurement","QS"],"ins":["Manager","Finance","Procurement"],"upd":["Manager","Finance","Procurement"],"del":["Manager","Procurement"]},{"t":"material_requests","sel":["Manager","ProjectMover","Sales","Finance","Procurement","Design"],"ins":["Manager","Sales","Procurement"],"upd":["Manager","Finance","Procurement"],"del":["Manager","Procurement"]},{"t":"budget_requests","sel":["Manager","ProjectMover","Sales","Finance","Procurement","Design"],"ins":["Manager","Sales","Procurement"],"upd":["Manager","Finance","Procurement"],"del":["Manager","Procurement"]},{"t":"subcon_work_orders","sel":["Manager","Sales","Finance","Accounting","Procurement"],"ins":["Manager","Finance","Procurement"],"upd":["Manager","Finance","Procurement"],"del":["Manager","Procurement"]},{"t":"suppliers","sel":["Manager","Finance","Procurement"],"ins":["Manager","Procurement"],"upd":["Manager","Procurement"],"del":["Manager","Procurement"]},{"t":"subcontractors","sel":["Manager","Finance","Procurement"],"ins":["Manager","Procurement"],"upd":["Manager","Procurement"],"del":["Manager","Procurement"]},{"t":"swatches","sel":["Manager","Finance","Procurement","Design"],"ins":["Manager","Procurement","Design"],"upd":["Manager","Procurement","Design"],"del":["Manager","Procurement"]},{"t":"ce_requests","sel":["Manager","Sales","Finance","QS"],"ins":["Manager","QS"],"upd":["Manager","QS"],"del":["Manager"]},{"t":"boq_library","sel":["Manager","Finance","QS","ProjectMover","Design"],"ins":["Manager","QS"],"upd":["Manager","QS"],"del":["Manager"]},{"t":"project_budgets","sel":["Manager","Finance","QS","ProjectMover","Design"],"ins":["Manager","QS"],"upd":["Manager","Finance","QS"],"del":["Manager"]},{"t":"inventory_items","sel":["Manager","Finance","Procurement","Warehouse"],"ins":["Manager","Warehouse"],"upd":["Manager","Warehouse"],"del":["Manager","Warehouse"]},{"t":"stock_movements","sel":["Manager","Finance","Procurement","Warehouse"],"ins":["Manager","Warehouse"],"upd":["Manager","Warehouse"],"del":["Manager"]},{"t":"checklists","sel":"AUTH","ins":["Manager","ProjectMover"],"upd":["Manager","ProjectMover"],"del":["Manager"]},{"t":"project_blockers","sel":"AUTH","ins":["Manager","ProjectMover"],"upd":["Manager","ProjectMover"],"del":["Manager"]},{"t":"projects","sel":"AUTH","ins":["Manager","ProjectMover"],"upd":["Manager","ProjectMover"],"del":["Manager"]},{"t":"ae_updates","sel":["Manager","ProjectMover"],"ins":["Manager","ProjectMover"],"upd":["Manager","ProjectMover"],"del":["Manager"]},{"t":"activity_log","sel":"AUTH","ins":"AUTH"},{"t":"app_settings","sel":"AUTH","ins":["Manager","Finance"],"upd":["Manager","Finance"],"del":["Manager"]},{"t":"doc_counters","sel":"AUTH"},{"t":"po_counter","sel":"AUTH"},{"t":"wo_counter","sel":"AUTH"}]'::jsonb;
  r jsonb; tbl text; op text; pred text; roles jsonb;
begin
  for r in select * from jsonb_array_elements(spec) loop
    tbl := r->>'t';
    execute format('alter table public.%I enable row level security', tbl);
    execute format('drop policy if exists fabhub_app_access on public.%I', tbl);
    foreach op in array array['sel','ins','upd','del'] loop
      execute format('drop policy if exists %I on public.%I', tbl||'_'||op, tbl);
      continue when not (r ? op);
      roles := r->op;
      if roles = '"AUTH"'::jsonb then
        pred := 'public.is_user()';
      else
        pred := 'public.has_role(' || (select string_agg(quote_literal(x), ',') from jsonb_array_elements_text(roles) x) || ')';
      end if;
      if op = 'sel' then
        execute format('create policy %I on public.%I for select to authenticated using (%s)', tbl||'_sel', tbl, pred);
      elsif op = 'ins' then
        execute format('create policy %I on public.%I for insert to authenticated with check (%s)', tbl||'_ins', tbl, pred);
      elsif op = 'upd' then
        execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)', tbl||'_upd', tbl, pred, pred);
      elsif op = 'del' then
        execute format('create policy %I on public.%I for delete to authenticated using (%s)', tbl||'_del', tbl, pred);
      end if;
    end loop;
  end loop;
end $do$;
