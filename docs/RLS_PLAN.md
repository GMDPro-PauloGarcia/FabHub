# FabHub — RLS Implementation Plan

Turns the login into real database-level security. Based on the finalized
`ACCESS_MATRIX.md` (decisions resolved 2026-07-08). **Nothing here is applied to
the live database yet** — it is built and tested on a throwaway DB branch first,
then cut over.

---

## 1. How the database learns who you are (auth)

Today every user talks to Supabase as one shared *anonymous* identity, so policies
can only say `USING (true)`. We give the database a real, signed identity per user
**without changing anyone's login**:

1. Keep the existing username/password + `user_profiles` + `verify_login`.
2. Add a Supabase **Edge Function `mint-session`**: it takes username + password,
   verifies via `verify_login`, and on success returns a JWT **signed with the
   project's JWT secret** containing:
   - `sub` = `user_profiles.id`  → readable in policies as `auth.uid()`
   - `role` = `"authenticated"`  (the Postgres role PostgREST assumes)
   - `user_role` = the app role (`Manager`, `Finance`, …) → `auth.jwt()->>'user_role'`
   - `username`
3. The app sets that token as the Supabase session. All subsequent DB calls now
   carry the user's identity + role, and RLS can enforce per role.

Offline note: the token is cached like the current session; offline login still
works from the cached token. (Cold offline first-login remains unsupported — same
as any server-checked login.)

## 2. Role canonicalization

`Operations` → **ProjectMover**; `Cost Control` → **Finance**. `Accounting` added as
a first-class role. Canonical set the policies use:
`Manager, ProjectMover, Sales, Finance, Accounting, Procurement, QS, Warehouse, Design`.

## 3. Helper functions (keep policies short)

```sql
create or replace function public.app_role() returns text
  language sql stable as $$ select coalesce(auth.jwt()->>'user_role','') $$;

create or replace function public.is_mgr() returns boolean
  language sql stable as $$ select public.app_role() = 'Manager' $$;

create or replace function public.has_role(variadic roles text[]) returns boolean
  language sql stable as $$ select public.app_role() = any(roles) $$;
```

Policies then read e.g. `using ( public.has_role('Manager','Finance','Accounting') )`.

## 4. Per-table policy spec (derived from the matrix)

Legend: operations allowed → roles. "auth" = any logged-in user. Delete is
Manager-only wherever the matrix marks a financial/deal record (Decision #3).

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `deals` | Mgr,Sales,Fin,Proc,QS,Design | Mgr,Sales | Mgr,Sales | **Mgr** |
| `project_cards` / `project_card_dept_*` | auth | Mgr,PM,Fin | Mgr,PM,Fin | **Mgr** |
| `daily_logs` | Mgr,PM,Sales | Mgr,PM | Mgr,PM | Mgr, or own row |
| `addenda` | Mgr,PM,Sales,Fin,Proc,Design | Mgr,PM,Proc,Design | Mgr | **Mgr** |
| `design_requests` / `design_request_forms` | Mgr,PM,Sales,Fin,Design | Mgr,Sales,Design | Mgr,Design | **Mgr** |
| `inflows`, `cash_positions` | Mgr,Fin | Mgr,Fin | Mgr,Fin | **Mgr** |
| `billing_milestones`, `billing_payments` | Mgr,Fin,Acct | Mgr,Fin | Mgr,Fin | **Mgr** |
| `expenses` | auth | Mgr,Fin,Acct | Mgr,Fin,Acct | **Mgr** |
| `payables` | Mgr,Fin,Acct | Mgr,Fin,Acct | Mgr,Fin,Acct | **Mgr** |
| `check_vouchers` | Mgr,Fin,Acct | Mgr,Acct | Mgr,Fin,Acct | **Mgr** |
| `chart_of_accounts` | Mgr,Fin,Acct | Mgr,Fin,Acct | Mgr,Fin,Acct | **Mgr** |
| `loans`, `loan_payments` | Mgr,Fin | Mgr,Fin | Mgr,Fin | **Mgr** |
| `audit_log` | Mgr,Fin,Acct | auth | **none** | **none** (append-only) |
| `purchase_requests` | Mgr,Fin,Proc,QS | Mgr,Fin,Proc | Mgr,Fin,Proc | Mgr,Proc |
| `material_requests` | Mgr,PM,Sales,Fin,Proc,Design | Mgr,Sales,Proc | Mgr,Fin,Proc | Mgr,Proc |
| `budget_requests` | Mgr,PM,Sales,Fin,Proc,Design | Mgr,Sales,Proc | Mgr,Fin,Proc | Mgr,Proc |
| `subcon_work_orders` | Mgr,Sales,Fin,Acct,Proc | Mgr,Fin,Proc | Mgr,Fin,Proc | Mgr,Proc |
| `suppliers`, `subcontractors` | Mgr,Fin,Proc | Mgr,Proc | Mgr,Proc | Mgr,Proc |
| `swatches` | Mgr,Fin,Proc,Design | Mgr,Proc,Design | Mgr,Proc,Design | Mgr,Proc |
| `ce_requests` | Mgr,Sales,Fin,QS | Mgr,QS | Mgr,QS | **Mgr** |
| `boq_library`, `project_budgets` | Mgr,Fin,QS (+PM,Design view) | Mgr,QS | Mgr,Fin,QS | **Mgr** |
| `inventory_items` | Mgr,Fin,Proc,WH | Mgr,WH | Mgr,WH | Mgr,WH |
| `stock_movements` | Mgr,Fin,Proc,WH | Mgr,WH | Mgr,WH | **Mgr** |
| `checklists`, `project_blockers`, `projects` | auth | Mgr,PM | Mgr,PM | **Mgr** |
| `ae_updates` | Mgr,PM | Mgr,PM | Mgr,PM | **Mgr** |
| `job_orders` | auth | Mgr,PM | Mgr,PM | **Mgr** |
| `user_profiles` | **own row; Mgr all** | Mgr | **own row (see guard); Mgr all** | Mgr |
| `activity_log` | auth | auth | **none** | **none** (append-only) |
| `app_settings` | auth (see caveat) | Mgr,Fin | Mgr,Fin | Mgr |
| `doc_counters`, `po_counter`, `wo_counter` | **none** (server functions only) | none | none | none |

## 5. Two things RLS alone can't do — extra guards

- **`user_profiles` self-update privilege escalation.** RLS can let a user update
  *their own row*, but can't stop them flipping their own `role` to `Manager`. Add a
  `BEFORE UPDATE` trigger: if the caller isn't a Manager, force `role`/`status`
  unchanged (they may only change name/password).
- **`app_settings` caveat.** The app reads config from `app_settings` on load for
  every role, so SELECT must stay broad — but that same table holds the e-voucher /
  cash-position JSON. Truly restricting those means **migrating them to real tables**
  (Decision #5's "later"). Until then, sensitive JSON in `app_settings` is readable
  by any logged-in user. Flagged, not silently accepted.

## 6. Rollout (safe, reversible)

1. **Branch the database** (`create_branch`) — a full schema copy, no prod data touched.
2. On the branch: create helper functions, the `user_profiles` guard trigger, deploy
   `mint-session`, and replace all 41 `USING(true)` policies with the spec above.
3. **Automated per-role test** (me): mint a token per role, hit every table's
   SELECT/INSERT/UPDATE/DELETE, assert allowed/denied matches this spec exactly.
4. Fix any gaps, re-test until 100% green.
5. **20-min human sanity pass** (you + one person per role) on the branch URL.
6. **Cut over**: apply the same migration to prod + ship the app change that calls
   `mint-session`. Keep the old `USING(true)` policies in a rollback migration.
7. **Rollback**: if anything misbehaves, re-apply the permissive policies (one
   migration) — instant revert while we diagnose.

## 7. Status

Blocked only on the Supabase connection (dropped intermittently today). All of the
above is authored and ready; the moment the connection is stable I branch, apply,
and run the per-role test harness.
