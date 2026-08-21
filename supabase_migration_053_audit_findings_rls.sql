-- ── Migration 053: put real access control on audit_findings ─────────────────
-- Audit finding #6. Migration 048 created audit_findings with a placeholder
-- allow-all policy:
--     create policy fabhub_app_access on public.audit_findings
--       for all using (true) with check (true);
-- i.e. EVERY authenticated user (any role) can read, edit, and delete audit
-- findings — the opposite of what an audit trail should allow. 048 itself noted
-- "role-based RLS is a separate planned rollout"; this is that rollout.
--
-- It also gives the Audit and HR & Admin roles their first real grant. Until now
-- both roles existed in the app (selectable, with a nav menu) but no RLS policy
-- referenced them, so a user minted as Audit/HRAdmin could reach only the
-- AUTH-open tables. The Audit workflow (the Audit page) is where they belong.
--
-- Scope chosen to match who sees the Audit page in the app's nav:
--   • Read  — Manager, Finance, Audit, HR & Admin
--   • Write — Manager, Audit, HR & Admin  (issue findings, record responses,
--             resolve/refer). Finance is read-only here.
-- Adjust the role lists if your policy differs. Idempotent — safe to re-run.

alter table public.audit_findings enable row level security;

-- Remove the placeholder allow-all policy.
drop policy if exists fabhub_app_access on public.audit_findings;

-- Also drop the role-scoped policies if a prior run created them, so re-running
-- lands in a clean, known state.
drop policy if exists audit_findings_sel on public.audit_findings;
drop policy if exists audit_findings_ins on public.audit_findings;
drop policy if exists audit_findings_upd on public.audit_findings;
drop policy if exists audit_findings_del on public.audit_findings;

create policy audit_findings_sel on public.audit_findings
  for select to authenticated
  using ( public.has_role('Manager','Finance','Audit','HRAdmin') );

create policy audit_findings_ins on public.audit_findings
  for insert to authenticated
  with check ( public.has_role('Manager','Audit','HRAdmin') );

create policy audit_findings_upd on public.audit_findings
  for update to authenticated
  using ( public.has_role('Manager','Audit','HRAdmin') )
  with check ( public.has_role('Manager','Audit','HRAdmin') );

create policy audit_findings_del on public.audit_findings
  for delete to authenticated
  using ( public.has_role('Manager','Audit','HRAdmin') );

select 'Migration 053 applied — audit_findings locked to Manager/Finance/Audit/HRAdmin' as status;

-- ── A note on broader Audit read access ──────────────────────────────────────
-- An Audit user can now work the findings table, but the operational/finance
-- tables they audit (deals, billings, payables, POs, …) still don't list Audit in
-- their SELECT policies, so an auditor can't yet READ the records they're auditing.
-- Granting that is a real policy decision (which tables, read-only) and is
-- deliberately NOT done here. If you want auditors to have read-only visibility
-- across the finance/ops tables, say which tables and I'll add Audit to their
-- _sel policies in a follow-up migration.
