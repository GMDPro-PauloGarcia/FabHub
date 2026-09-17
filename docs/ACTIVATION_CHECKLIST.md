# FabHub — Live-DB Activation Checklist

Tracks the live-database steps behind two merged changes: the migration runner
(#328) and the billing change-audit trigger (#330). Merging shipped the code;
these steps are what make it real on the live `fabhub-gmd` project.

Status legend: `[x]` done · `[ ]` outstanding.

## Part A — Migration runner cutover (one-time)

- [ ] **A1. Baseline repair** — tell the runner the live schema already exists so
  it never re-runs old migrations against financial tables.
  ```bash
  supabase login
  supabase link --project-ref gfgneirzkgzarllzztie   # fabhub-gmd
  supabase migration repair --status applied 20260101000000
  supabase migration list        # VERIFY: baseline "applied", nothing else pending
  ```
- [ ] **A2. CI secrets** — GitHub → Settings → Secrets and variables → Actions:
  `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF` (`gfgneirzkgzarllzztie`),
  `SUPABASE_DB_PASSWORD`, `VERCEL_DEPLOY_HOOK`.
  VERIFY: push a migration change → the `DB migrations` workflow runs the real
  steps, not the "secrets not set — skipping" notice.
- [ ] **A2a. Decide FIRST:** the billing smoke test needs a **service-role key**
  in CI, or switch it to a dedicated test-user login. Do not add the key until
  decided.
- [ ] **A3. Drop Vercel git auto-deploy** on `main` so deploys route through the
  runner (DB before code). VERIFY: a `main` merge no longer deploys on its own;
  the deploy fires only after the `migrate` job is green.

## Part B — Billing audit (the encoding-error tripwire)

- [x] **B1. Apply the audit migration** to `fabhub-gmd`. Applied 2026-09-17 via
  the Supabase tools; structural checks pass (2 triggers on
  `billing_payments`/`billing_milestones`, `audit_log.old_snapshot` +
  `changed_fields` columns, `audit_billing_change()` function).
- [ ] **B2. Prove it records (do this in the app — 2 min):**
  1. Edit a real billing payment (nudge an amount).
  2. Open the **Audit Trail** screen.
  3. VERIFY: a row appears — action **Edited**, amount `old → new`, your login
     under "By", changed fields listed.
  4. Change it back (a second audit row — correct).
  If nothing appears, the trigger isn't firing for app writes — say so; don't
  assume it's on.

## Part C — Standing rule

- [ ] Before ANY migration touching a financial table (`billing_*`, `payables`,
  `expenses`, `cash_positions`, `inflows`): take a point-in-time / snapshot in
  the Supabase dashboard first.

## Still open (by decision, not oversight)

- The audit log is **detective, not preventive** — it records who mis-keyed a
  figure; it does not block the edit. A preventive immutability trigger on
  `billing_payments` was considered and deferred.
