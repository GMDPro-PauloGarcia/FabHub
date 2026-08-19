-- ── Migration 037: role-based RLS rollout (v2) ───────────────────────────────
-- Supersedes migration 024 (never applied to production) and folds in the
-- later per-policy fixes so replaying this file lands in the correct final
-- state: 033 (Jena/Wyn deal-delete), 034 (adds Paolo), and 036 (SalesOpsAdmin
-- billing INSERT/UPDATE). It re-CREATEs every policy, so it must run AFTER those
-- migrations (hence 037); on a fresh replay migration 024 provides the baseline
-- policies that 036's ALTER POLICY needs. Rebuilt from docs/ACCESS_MATRIX.md, the
-- RT_SUB_ROLES read matrix, and the actual app write paths — which revealed
-- several gaps in 024 that would have broken the app:
--
--   * deals SELECT excluded ProjectMover → the Projects screen (reads `deals`)
--     would go empty for jay/david/ryon. Fixed: PM (+SOA/FinAsst) added.
--   * deals had no UPDATE for QS, but QS sets the client price by updating the
--     deal (setPriceModal). Fixed: QS added to deals UPDATE.
--   * doc_counters/po_counter/wo_counter had SELECT only — but claiming a doc
--     number is an UPDATE, done by many roles. Without it every DRF/PO/WO number
--     claim would fail. Fixed: INSERT/UPDATE = AUTH on all three counters.
--   * Roles added after 024 — FinanceAssistant (mark), SalesOpsAdmin (jessica) —
--     appeared in NO policy, so both users would be locked out of everything.
--     Fixed: FinanceAssistant mirrors Finance (read + finance writes, no delete);
--     SalesOpsAdmin mirrors Sales (+ award/update on deals).
--   * client_errors (migration 027) wasn't covered. Fixed: append-only telemetry.
--   * ae_updates limited to Manager/ProjectMover — the 2026-07-16 decision says
--     the consumer roles must SELECT/INSERT/DELETE. Fixed.
--
-- Identity: the mint-session Edge Function issues a JWT with `user_role`, `sub`
-- (user_profiles.id) and `username`. Operations→ProjectMover, Cost Control→
-- Finance, Admin→Manager are remapped there, so those names never reach a policy.
--
-- SELECT is kept deliberately broad (lockouts are the top risk); DELETE on deals
-- and every financial record is Manager-only (owner decision 2026-07-08), except
-- deals, which also allow the named Sales users jena/wyn, and billing_milestones/
-- billing_payments, which also allow Finance/FinanceAssistant/SalesOpsAdmin per
-- the 2026-08-18 owner call (see migration 049 — the delete flow archives to the
-- Audit Trail first, so Finance-initiated billing deletes stay reversible). The
-- del arrays below already reflect this so a fresh replay lands in the final state.
--
-- ⚠️ HIGH-IMPACT: this flips every table from allow-all to role-gated. Validate
-- against the app (branch or staging) before applying to production, and keep a
-- rollback ready (see the bottom of this file).

-- Helpers ---------------------------------------------------------------------
create or replace function public.app_role() returns text language sql stable as
  $fn$ select coalesce(nullif(current_setting('request.jwt.claims', true),'')::jsonb ->> 'user_role','') $fn$;
create or replace function public.app_sub() returns text language sql stable as
  $fn$ select coalesce(nullif(current_setting('request.jwt.claims', true),'')::jsonb ->> 'sub','') $fn$;
create or replace function public.app_username() returns text language sql stable as
  $fn$ select coalesce(nullif(current_setting('request.jwt.claims', true),'')::jsonb ->> 'username','') $fn$;
create or replace function public.is_user() returns boolean language sql stable as
  $fn$ select public.app_role() <> '' $fn$;
create or replace function public.is_mgr() returns boolean language sql stable as
  $fn$ select public.app_role() = 'Manager' $fn$;
create or replace function public.has_role(variadic roles text[]) returns boolean language sql stable as
  $fn$ select public.app_role() = any(roles) $fn$;
grant execute on function public.app_role(), public.app_sub(), public.app_username(),
  public.is_user(), public.is_mgr(), public.has_role(text[]) to authenticated, anon;

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

-- deals: DELETE is Manager + named Sales grantees (jena/wyn/paolo) — handled outside
-- the generator because its predicate isn't a plain role list.
-- The generator below still creates deals sel/ins/upd; we replace deals_del after.

-- All other tables, generated from the matrix spec ----------------------------
-- Per table: "sel"/"ins"/"upd"/"del" → role array, "AUTH" = any logged-in user,
-- missing key = operation denied to everyone.
do $do$
declare
  spec jsonb := '[
    {"t":"deals","sel":["Manager","ProjectMover","Sales","Finance","FinanceAssistant","Procurement","QS","Design","SalesOpsAdmin"],"ins":["Manager","Sales","SalesOpsAdmin"],"upd":["Manager","Sales","SalesOpsAdmin","QS"]},
    {"t":"job_orders","sel":"AUTH","ins":["Manager","ProjectMover"],"upd":["Manager","ProjectMover"],"del":["Manager"]},
    {"t":"projects","sel":"AUTH","ins":["Manager","ProjectMover"],"upd":["Manager","ProjectMover"],"del":["Manager"]},
    {"t":"project_cards","sel":"AUTH","ins":["Manager","ProjectMover","Finance"],"upd":["Manager","ProjectMover","Finance"],"del":["Manager"]},
    {"t":"project_card_dept_tasks","sel":"AUTH","ins":["Manager","ProjectMover","Finance"],"upd":["Manager","ProjectMover","Finance"],"del":["Manager"]},
    {"t":"project_card_dept_status","sel":"AUTH","ins":["Manager","ProjectMover","Finance"],"upd":["Manager","ProjectMover","Finance"],"del":["Manager"]},
    {"t":"daily_logs","sel":["Manager","ProjectMover","Sales"],"ins":["Manager","ProjectMover"],"upd":["Manager","ProjectMover"],"del":["Manager"]},
    {"t":"addenda","sel":["Manager","ProjectMover","Sales","Finance","FinanceAssistant","Procurement","Design","SalesOpsAdmin"],"ins":["Manager","ProjectMover","Procurement","Design"],"upd":["Manager"],"del":["Manager"]},
    {"t":"design_requests","sel":["Manager","ProjectMover","Sales","Finance","Design","SalesOpsAdmin"],"ins":["Manager","Sales","Design","SalesOpsAdmin"],"upd":["Manager","Design"],"del":["Manager"]},
    {"t":"design_request_forms","sel":["Manager","ProjectMover","Sales","Finance","Design","SalesOpsAdmin"],"ins":["Manager","Sales","Design","SalesOpsAdmin"],"upd":["Manager","Design"],"del":["Manager"]},
    {"t":"inflows","sel":["Manager","Finance","FinanceAssistant"],"ins":["Manager","Finance","FinanceAssistant"],"upd":["Manager","Finance","FinanceAssistant"],"del":["Manager"]},
    {"t":"cash_positions","sel":["Manager","Finance","FinanceAssistant"],"ins":["Manager","Finance","FinanceAssistant"],"upd":["Manager","Finance","FinanceAssistant"],"del":["Manager"]},
    {"t":"billing_milestones","sel":["Manager","Sales","Finance","Accounting","FinanceAssistant","SalesOpsAdmin"],"ins":["Manager","Finance","FinanceAssistant","SalesOpsAdmin"],"upd":["Manager","Finance","FinanceAssistant","SalesOpsAdmin"],"del":["Manager","Finance","FinanceAssistant","SalesOpsAdmin"]},
    {"t":"billing_payments","sel":["Manager","Sales","Finance","Accounting","FinanceAssistant","SalesOpsAdmin"],"ins":["Manager","Finance","FinanceAssistant","SalesOpsAdmin"],"upd":["Manager","Finance","FinanceAssistant","SalesOpsAdmin"],"del":["Manager","Finance","FinanceAssistant","SalesOpsAdmin"]},
    {"t":"expenses","sel":"AUTH","ins":["Manager","Finance","Accounting","FinanceAssistant"],"upd":["Manager","Finance","Accounting","FinanceAssistant"],"del":["Manager"]},
    {"t":"payables","sel":["Manager","Finance","Accounting","FinanceAssistant","Procurement"],"ins":["Manager","Finance","Accounting","FinanceAssistant","Procurement"],"upd":["Manager","Finance","Accounting","FinanceAssistant","Procurement"],"del":["Manager"]},
    {"t":"check_vouchers","sel":["Manager","Finance","Accounting","FinanceAssistant"],"ins":["Manager","Accounting"],"upd":["Manager","Finance","Accounting","FinanceAssistant"],"del":["Manager"]},
    {"t":"loans","sel":["Manager","Finance","FinanceAssistant"],"ins":["Manager","Finance","FinanceAssistant"],"upd":["Manager","Finance","FinanceAssistant"],"del":["Manager"]},
    {"t":"loan_payments","sel":["Manager","Finance","FinanceAssistant"],"ins":["Manager","Finance","FinanceAssistant"],"upd":["Manager","Finance","FinanceAssistant"],"del":["Manager"]},
    {"t":"audit_log","sel":["Manager","Finance","Accounting","FinanceAssistant"],"ins":"AUTH"},
    {"t":"purchase_requests","sel":["Manager","Finance","FinanceAssistant","Procurement","QS"],"ins":["Manager","Finance","FinanceAssistant","Procurement"],"upd":["Manager","Finance","FinanceAssistant","Procurement"],"del":["Manager","Procurement"]},
    {"t":"material_requests","sel":["Manager","ProjectMover","Sales","Finance","FinanceAssistant","Procurement","Design","SalesOpsAdmin"],"ins":["Manager","Sales","Procurement","SalesOpsAdmin"],"upd":["Manager","Finance","FinanceAssistant","Procurement"],"del":["Manager","Procurement"]},
    {"t":"budget_requests","sel":["Manager","ProjectMover","Sales","Finance","FinanceAssistant","Procurement","Design","SalesOpsAdmin"],"ins":["Manager","Sales","Procurement","SalesOpsAdmin"],"upd":["Manager","Finance","FinanceAssistant","Procurement"],"del":["Manager","Procurement"]},
    {"t":"subcon_work_orders","sel":["Manager","Sales","Finance","Accounting","FinanceAssistant","Procurement","SalesOpsAdmin"],"ins":["Manager","Finance","FinanceAssistant","Procurement"],"upd":["Manager","Finance","FinanceAssistant","Procurement"],"del":["Manager","Procurement"]},
    {"t":"suppliers","sel":["Manager","Finance","FinanceAssistant","Procurement"],"ins":["Manager","Procurement"],"upd":["Manager","Procurement"],"del":["Manager","Procurement"]},
    {"t":"subcontractors","sel":["Manager","Finance","FinanceAssistant","Procurement"],"ins":["Manager","Procurement"],"upd":["Manager","Procurement"],"del":["Manager","Procurement"]},
    {"t":"swatches","sel":["Manager","Finance","FinanceAssistant","Procurement","Design"],"ins":["Manager","Procurement","Design"],"upd":["Manager","Procurement","Design"],"del":["Manager","Procurement"]},
    {"t":"ce_requests","sel":["Manager","Sales","Finance","FinanceAssistant","QS","SalesOpsAdmin"],"ins":["Manager","QS"],"upd":["Manager","QS"],"del":["Manager"]},
    {"t":"boq_library","sel":["Manager","Finance","FinanceAssistant","QS","ProjectMover","Design"],"ins":["Manager","QS"],"upd":["Manager","QS"],"del":["Manager"]},
    {"t":"project_budgets","sel":["Manager","Finance","FinanceAssistant","QS","ProjectMover","Design"],"ins":["Manager","QS"],"upd":["Manager","Finance","FinanceAssistant","QS"],"del":["Manager"]},
    {"t":"inventory_items","sel":["Manager","Finance","FinanceAssistant","Procurement","Warehouse"],"ins":["Manager","Warehouse"],"upd":["Manager","Warehouse"],"del":["Manager","Warehouse"]},
    {"t":"stock_movements","sel":["Manager","Finance","FinanceAssistant","Procurement","Warehouse"],"ins":["Manager","Warehouse"],"upd":["Manager","Warehouse"],"del":["Manager"]},
    {"t":"checklists","sel":"AUTH","ins":"AUTH","upd":"AUTH","del":["Manager"]},
    {"t":"project_blockers","sel":"AUTH","ins":["Manager","ProjectMover"],"upd":["Manager","ProjectMover"],"del":["Manager"]},
    {"t":"ae_updates","sel":["Manager","ProjectMover","Sales","Finance","QS","Design","SalesOpsAdmin"],"ins":["Manager","ProjectMover","Sales","Finance","QS","Design","SalesOpsAdmin"],"upd":["Manager","ProjectMover"],"del":["Manager","ProjectMover","Sales","Finance","QS","Design","SalesOpsAdmin"]},
    {"t":"activity_log","sel":"AUTH","ins":"AUTH","del":["Manager"]},
    {"t":"client_errors","sel":["Manager"],"ins":"AUTH"},
    {"t":"app_settings","sel":"AUTH","ins":["Manager","Finance","FinanceAssistant"],"upd":["Manager","Finance","FinanceAssistant"],"del":["Manager"]},
    {"t":"doc_counters","sel":"AUTH","ins":"AUTH","upd":"AUTH"},
    {"t":"po_counter","sel":"AUTH","ins":"AUTH","upd":"AUTH"},
    {"t":"wo_counter","sel":"AUTH","ins":"AUTH","upd":"AUTH"}
  ]'::jsonb;
  r jsonb; tbl text; op text; pred text; roles jsonb;
begin
  for r in select * from jsonb_array_elements(spec) loop
    tbl := r->>'t';
    -- Skip tables that don't exist on this database instead of failing the whole run.
    if to_regclass('public.'||tbl) is null then
      raise notice 'skipping missing table: %', tbl; continue;
    end if;
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

-- deals DELETE: Manager + named Sales grantees (see migration 033 / src/App.jsx
-- DEAL_DELETE_USERS). Kept in sync with the client allow-list.
drop policy if exists deals_del on public.deals;
create policy deals_del on public.deals
  for delete to authenticated
  using ( public.is_mgr() or public.app_username() in ('jena','wyn','paolo') );

-- ── ROLLBACK (revert to the previous allow-all state) ────────────────────────
-- If anything breaks, restore the blanket policy on every table. Run:
--   do $r$ declare t text; begin
--     for t in select tablename from pg_tables where schemaname='public' loop
--       execute format('drop policy if exists %I on public.%I', t||'_sel', t);
--       execute format('drop policy if exists %I on public.%I', t||'_ins', t);
--       execute format('drop policy if exists %I on public.%I', t||'_upd', t);
--       execute format('drop policy if exists %I on public.%I', t||'_del', t);
--       execute format('drop policy if exists fabhub_app_access on public.%I', t);
--       execute format('create policy fabhub_app_access on public.%I for all to authenticated using (true) with check (true)', t);
--     end loop; end $r$;
