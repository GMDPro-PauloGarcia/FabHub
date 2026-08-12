-- ── Migration 042: tiered Design-team RLS ────────────────────────────────────
-- Requirement (Gab, 2026-08): the design team should not all see the same data.
--   • Gab Florita (gab) and Miaa Villoria (miaa) are the senior designers and
--     keep the FULL Design view (pipeline deals, cost/BOQ, scope changes, etc.).
--   • The rest of the team (miel, adrian, tisha) get only the DESIGN REQUEST
--     views — design_requests / design_request_forms — plus the shared design
--     swatchboard and the always-open tables the app needs to boot.
--
-- Why per-username: RLS is keyed on the JWT `user_role` claim (migration 037),
-- and every designer carries the single role 'Design', so role alone can't
-- separate them. The mint-session token also carries `username`, so we gate the
-- elevated tables on username via a helper. Only the tables where 'Design' was
-- granted an EXPLICIT (non-AUTH) SELECT beyond design requests are narrowed here;
-- AUTH tables (projects, project_cards, checklists, counters, …) are left as-is
-- so junior designers can still authenticate and load the app. deals SELECT is
-- the important one — that is the Sales Pipeline data, now senior-only, matching
-- the app-side nav/page restriction.
--
-- Reversible: to restore the old flat access, re-add 'Design' to each role array
-- below and drop is_senior_designer() (see ROLLBACK at the bottom).
--
-- Idempotent: re-CREATEs the helper and the affected policies. Run AFTER 037.

-- Helper: a logged-in Design user who is one of the two senior designers --------
create or replace function public.is_senior_designer() returns boolean
  language sql stable as
  $fn$ select public.app_role() = 'Design'
              and lower(public.app_username()) = any(array['gab','miaa']) $fn$;
grant execute on function public.is_senior_designer() to authenticated, anon;

-- deals — Sales Pipeline data. Design access is now senior-only. ---------------
drop policy if exists deals_sel on public.deals;
create policy deals_sel on public.deals for select to authenticated
  using ( public.has_role('Manager','ProjectMover','Sales','Finance','FinanceAssistant','Procurement','QS','SalesOpsAdmin')
          or public.is_senior_designer() );

-- addenda (scope changes) — senior designers only ------------------------------
drop policy if exists addenda_sel on public.addenda;
create policy addenda_sel on public.addenda for select to authenticated
  using ( public.has_role('Manager','ProjectMover','Sales','Finance','FinanceAssistant','Procurement','SalesOpsAdmin')
          or public.is_senior_designer() );
drop policy if exists addenda_ins on public.addenda;
create policy addenda_ins on public.addenda for insert to authenticated
  with check ( public.has_role('Manager','ProjectMover','Procurement')
               or public.is_senior_designer() );

-- ae_updates (AE / design update feed) — senior designers only -----------------
drop policy if exists ae_updates_sel on public.ae_updates;
create policy ae_updates_sel on public.ae_updates for select to authenticated
  using ( public.has_role('Manager','ProjectMover','Sales','Finance','QS','SalesOpsAdmin')
          or public.is_senior_designer() );
drop policy if exists ae_updates_ins on public.ae_updates;
create policy ae_updates_ins on public.ae_updates for insert to authenticated
  with check ( public.has_role('Manager','ProjectMover','Sales','Finance','QS','SalesOpsAdmin')
               or public.is_senior_designer() );
drop policy if exists ae_updates_del on public.ae_updates;
create policy ae_updates_del on public.ae_updates for delete to authenticated
  using ( public.has_role('Manager','ProjectMover','Sales','Finance','QS','SalesOpsAdmin')
          or public.is_senior_designer() );
-- ae_updates UPDATE stays Manager/ProjectMover (migration 037) — unchanged.

-- boq_library (QS cost reference) — senior designers only ----------------------
drop policy if exists boq_library_sel on public.boq_library;
create policy boq_library_sel on public.boq_library for select to authenticated
  using ( public.has_role('Manager','Finance','FinanceAssistant','QS','ProjectMover')
          or public.is_senior_designer() );

-- project_budgets (cost breakdown) — senior designers only ---------------------
drop policy if exists project_budgets_sel on public.project_budgets;
create policy project_budgets_sel on public.project_budgets for select to authenticated
  using ( public.has_role('Manager','Finance','FinanceAssistant','QS','ProjectMover')
          or public.is_senior_designer() );

-- material_requests — senior designers only ------------------------------------
drop policy if exists material_requests_sel on public.material_requests;
create policy material_requests_sel on public.material_requests for select to authenticated
  using ( public.has_role('Manager','ProjectMover','Sales','Finance','FinanceAssistant','Procurement','SalesOpsAdmin')
          or public.is_senior_designer() );

-- budget_requests — senior designers only --------------------------------------
drop policy if exists budget_requests_sel on public.budget_requests;
create policy budget_requests_sel on public.budget_requests for select to authenticated
  using ( public.has_role('Manager','ProjectMover','Sales','Finance','FinanceAssistant','Procurement','SalesOpsAdmin')
          or public.is_senior_designer() );

-- UNCHANGED — all designers keep these "design request views":
--   design_requests (sel/ins/upd), design_request_forms (sel/ins/upd),
--   swatches (sel/ins/upd — shared design/procurement swatchboard),
--   and every AUTH table (projects, project_cards, checklists, doc counters, …).

-- ── ROLLBACK (restore flat Design access) ────────────────────────────────────
-- Re-run migration 037 (recreates the original policies with 'Design' in each
-- array), then: drop function if exists public.is_senior_designer();
