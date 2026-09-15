-- ── Migration 059: let Sales / SalesOpsAdmin write project cards + checklists ──
-- Root cause of the "server rejected a change (bad data)" drops on
-- project_card_dept_status, and of project cards that live only on one device:
--
-- The award action (🏆) in src/App.jsx (openAward, line ~12627) is available to
-- Manager, Sales AND SalesOpsAdmin. confirmAward -> createProjectCard inserts a
-- project_cards row plus its project_card_dept_tasks / project_card_dept_status
-- checklist rows. Award-date edits (canEditAward, also Manager/Sales/SalesOpsAdmin)
-- upsert project_cards too.
--
-- But migration 037 gated INSERT/UPDATE on those three tables to
-- Manager/ProjectMover/Finance only. So when a Sales or SalesOpsAdmin user awards
-- a deal (or fixes an award date), the deals write succeeds — deals INSERT/UPDATE
-- already allow Sales/SalesOpsAdmin — but the project_cards + checklist writes are
-- silently rejected by RLS. The card never reaches the server, and every later
-- project_card_dept_status / project_card_dept_tasks write FK-fails against the
-- missing parent card_id: classified "data" (non-retryable), it is dropped and
-- surfaces as the red "bad data — redo it" toast. Award-date corrections by Sales
-- users hit the same wall and never sync.
--
-- Fix: widen INSERT/UPDATE on the three tables to the roles that can actually
-- award / edit a project card — add Sales and SalesOpsAdmin to the existing
-- Manager/ProjectMover/Finance. SELECT stays AUTH; DELETE stays Manager-only.
-- Same class of fix as migration 050 (BOQ authors). Uses public.has_role() from
-- migration 037.
--
-- ⚠️ RLS change — validate on a branch / staging against a Sales-role login
-- (award a deal, toggle a department, edit an award date, confirm all three reach
-- the server) before applying to production.

alter table public.project_cards            enable row level security;
alter table public.project_card_dept_tasks  enable row level security;
alter table public.project_card_dept_status enable row level security;

-- project_cards ---------------------------------------------------------------
drop policy if exists project_cards_ins on public.project_cards;
create policy project_cards_ins on public.project_cards
  for insert to authenticated
  with check ( public.has_role('Manager','ProjectMover','Finance','Sales','SalesOpsAdmin') );
drop policy if exists project_cards_upd on public.project_cards;
create policy project_cards_upd on public.project_cards
  for update to authenticated
  using      ( public.has_role('Manager','ProjectMover','Finance','Sales','SalesOpsAdmin') )
  with check ( public.has_role('Manager','ProjectMover','Finance','Sales','SalesOpsAdmin') );

-- project_card_dept_tasks -----------------------------------------------------
drop policy if exists project_card_dept_tasks_ins on public.project_card_dept_tasks;
create policy project_card_dept_tasks_ins on public.project_card_dept_tasks
  for insert to authenticated
  with check ( public.has_role('Manager','ProjectMover','Finance','Sales','SalesOpsAdmin') );
drop policy if exists project_card_dept_tasks_upd on public.project_card_dept_tasks;
create policy project_card_dept_tasks_upd on public.project_card_dept_tasks
  for update to authenticated
  using      ( public.has_role('Manager','ProjectMover','Finance','Sales','SalesOpsAdmin') )
  with check ( public.has_role('Manager','ProjectMover','Finance','Sales','SalesOpsAdmin') );

-- project_card_dept_status ----------------------------------------------------
drop policy if exists project_card_dept_status_ins on public.project_card_dept_status;
create policy project_card_dept_status_ins on public.project_card_dept_status
  for insert to authenticated
  with check ( public.has_role('Manager','ProjectMover','Finance','Sales','SalesOpsAdmin') );
drop policy if exists project_card_dept_status_upd on public.project_card_dept_status;
create policy project_card_dept_status_upd on public.project_card_dept_status
  for update to authenticated
  using      ( public.has_role('Manager','ProjectMover','Finance','Sales','SalesOpsAdmin') )
  with check ( public.has_role('Manager','ProjectMover','Finance','Sales','SalesOpsAdmin') );

select 'Migration 059 applied — Sales/SalesOpsAdmin can write project_cards + dept checklists' as status;
