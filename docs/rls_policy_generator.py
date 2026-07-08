import json
AUTH="AUTH"; NONE=None
SPEC = {
 "deals":            (["Manager","Sales","Finance","Procurement","QS","Design"], ["Manager","Sales"], ["Manager","Sales"], ["Manager"]),
 "job_orders":       (AUTH, ["Manager","ProjectMover"], ["Manager","ProjectMover"], ["Manager"]),
 "project_cards":    (AUTH, ["Manager","ProjectMover","Finance"], ["Manager","ProjectMover","Finance"], ["Manager"]),
 "project_card_dept_tasks":  (AUTH, ["Manager","ProjectMover","Finance"], ["Manager","ProjectMover","Finance"], ["Manager"]),
 "project_card_dept_status": (AUTH, ["Manager","ProjectMover","Finance"], ["Manager","ProjectMover","Finance"], ["Manager"]),
 "daily_logs":       (["Manager","ProjectMover","Sales"], ["Manager","ProjectMover"], ["Manager","ProjectMover"], ["Manager"]),
 "addenda":          (["Manager","ProjectMover","Sales","Finance","Procurement","Design"], ["Manager","ProjectMover","Procurement","Design"], ["Manager"], ["Manager"]),
 "design_requests":      (["Manager","ProjectMover","Sales","Finance","Design"], ["Manager","Sales","Design"], ["Manager","Design"], ["Manager"]),
 "design_request_forms": (["Manager","ProjectMover","Sales","Finance","Design"], ["Manager","Sales","Design"], ["Manager","Design"], ["Manager"]),
 "inflows":          (["Manager","Finance"], ["Manager","Finance"], ["Manager","Finance"], ["Manager"]),
 "cash_positions":   (["Manager","Finance"], ["Manager","Finance"], ["Manager","Finance"], ["Manager"]),
 "billing_milestones": (["Manager","Finance","Accounting"], ["Manager","Finance"], ["Manager","Finance"], ["Manager"]),
 "billing_payments":   (["Manager","Finance","Accounting"], ["Manager","Finance"], ["Manager","Finance"], ["Manager"]),
 "expenses":         (AUTH, ["Manager","Finance","Accounting"], ["Manager","Finance","Accounting"], ["Manager"]),
 "payables":         (["Manager","Finance","Accounting"], ["Manager","Finance","Accounting"], ["Manager","Finance","Accounting"], ["Manager"]),
 "check_vouchers":   (["Manager","Finance","Accounting"], ["Manager","Accounting"], ["Manager","Finance","Accounting"], ["Manager"]),
 "loans":            (["Manager","Finance"], ["Manager","Finance"], ["Manager","Finance"], ["Manager"]),
 "loan_payments":    (["Manager","Finance"], ["Manager","Finance"], ["Manager","Finance"], ["Manager"]),
 "audit_log":        (["Manager","Finance","Accounting"], AUTH, NONE, NONE),
 "purchase_requests":(["Manager","Finance","Procurement","QS"], ["Manager","Finance","Procurement"], ["Manager","Finance","Procurement"], ["Manager","Procurement"]),
 "material_requests":(["Manager","ProjectMover","Sales","Finance","Procurement","Design"], ["Manager","Sales","Procurement"], ["Manager","Finance","Procurement"], ["Manager","Procurement"]),
 "budget_requests":  (["Manager","ProjectMover","Sales","Finance","Procurement","Design"], ["Manager","Sales","Procurement"], ["Manager","Finance","Procurement"], ["Manager","Procurement"]),
 "subcon_work_orders":(["Manager","Sales","Finance","Accounting","Procurement"], ["Manager","Finance","Procurement"], ["Manager","Finance","Procurement"], ["Manager","Procurement"]),
 "suppliers":        (["Manager","Finance","Procurement"], ["Manager","Procurement"], ["Manager","Procurement"], ["Manager","Procurement"]),
 "subcontractors":   (["Manager","Finance","Procurement"], ["Manager","Procurement"], ["Manager","Procurement"], ["Manager","Procurement"]),
 "swatches":         (["Manager","Finance","Procurement","Design"], ["Manager","Procurement","Design"], ["Manager","Procurement","Design"], ["Manager","Procurement"]),
 "ce_requests":      (["Manager","Sales","Finance","QS"], ["Manager","QS"], ["Manager","QS"], ["Manager"]),
 "boq_library":      (["Manager","Finance","QS","ProjectMover","Design"], ["Manager","QS"], ["Manager","QS"], ["Manager"]),
 "project_budgets":  (["Manager","Finance","QS","ProjectMover","Design"], ["Manager","QS"], ["Manager","Finance","QS"], ["Manager"]),
 "inventory_items":  (["Manager","Finance","Procurement","Warehouse"], ["Manager","Warehouse"], ["Manager","Warehouse"], ["Manager","Warehouse"]),
 "stock_movements":  (["Manager","Finance","Procurement","Warehouse"], ["Manager","Warehouse"], ["Manager","Warehouse"], ["Manager"]),
 "checklists":       (AUTH, ["Manager","ProjectMover"], ["Manager","ProjectMover"], ["Manager"]),
 "project_blockers": (AUTH, ["Manager","ProjectMover"], ["Manager","ProjectMover"], ["Manager"]),
 "projects":         (AUTH, ["Manager","ProjectMover"], ["Manager","ProjectMover"], ["Manager"]),
 "ae_updates":       (["Manager","ProjectMover"], ["Manager","ProjectMover"], ["Manager","ProjectMover"], ["Manager"]),
 "activity_log":     (AUTH, AUTH, NONE, NONE),
 "app_settings":     (AUTH, ["Manager","Finance"], ["Manager","Finance"], ["Manager"]),
 "doc_counters":     (AUTH, NONE, NONE, NONE),
 "po_counter":       (AUTH, NONE, NONE, NONE),
 "wo_counter":       (AUTH, NONE, NONE, NONE),
}
spec_rows=[]
for t,(s,i,u,d) in SPEC.items():
    if t=="user_profiles": continue
    row={"t":t}
    for key,val in (("sel",s),("ins",i),("upd",u),("del",d)):
        if val is None: continue
        row[key] = "AUTH" if val is AUTH else val
    spec_rows.append(row)
spec_json=json.dumps(spec_rows, separators=(",",":"))

sql=f"""-- ── Migration 024: Row-Level Security — real per-role policies ────────────────
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
grant execute on function public.app_role(), public.is_user(), public.is_mgr(), public.has_role(text[]) to authenticated, anon;

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
create policy user_profiles_sel on public.user_profiles for select to authenticated using ( public.is_mgr() or id = auth.uid() );
create policy user_profiles_ins on public.user_profiles for insert to authenticated with check ( public.is_mgr() );
create policy user_profiles_upd on public.user_profiles for update to authenticated using ( public.is_mgr() or id = auth.uid() ) with check ( public.is_mgr() or id = auth.uid() );
create policy user_profiles_del on public.user_profiles for delete to authenticated using ( public.is_mgr() );

-- All other tables, generated from the matrix spec ----------------------------
do $do$
declare
  spec jsonb := '{spec_json}'::jsonb;
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
"""
open("/home/user/FabHub/supabase_migration_024_rls.sql","w").write(sql)
print("bytes:", len(sql))
