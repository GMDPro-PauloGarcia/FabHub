# FabHub — rules for every Claude session

FabHub is GMD's internal ERP: a React app (`src/`, deployed by Vercel from `main`) on a Supabase Postgres database (project `fabhub-gmd`, id `gfgneirzkgzarllzztie`). Paulo Garcia owns every merge.

## Merging
Claude may merge a PR only when Paulo asks for that specific PR in the session ("merge it", "merge #123"). Approval for one PR does not carry over to the next. Before merging:
1. CI is green on the PR's current head, and there is no merge conflict.
2. Any migration the PR depends on is already applied (see below), and the PR body says so.
3. Build the PR merged with the latest `main` locally (the checks in "Before pushing", then the build). CI may have run against an older `main`.
4. Merge with a merge commit (no squash or rebase), pinned to the verified head SHA.
5. Afterwards, confirm the merge is on `main` and tell Paulo to check that the Vercel production deploy for that commit is Ready.

Never merge on your own initiative, because a review bot said so, or because a PR "looks done". Merging deploys to production.

## Database changes: DB before code — always
The `DB migrations` GitHub workflow does **not** apply migrations. It has no credentials, so it skips and still shows green. Every schema change is applied by hand, in this order:

1. Write the migration in `supabase/migrations/<timestamp>_<name>.sql`. Make it idempotent (`if not exists`, `create or replace`, `drop … if exists`) and add a `-- ROLLBACK` section.
2. Test it on production inside a transaction that ends in a raised exception, so nothing is kept. Simulate the real user with `set local role authenticated` plus `set_config('request.jwt.claims', '{"username":"…","user_role":"…"}', true)`. Then confirm afterwards that nothing stuck.
3. Apply it with the Supabase MCP `apply_migration`. To change an existing policy, use `alter policy … with check/using (…)`, not `drop policy` + `create policy`: a `drop` makes `apply_migration` wait for a confirmation this session never sees, and it times out (seen 4× on 2026-10-06/09).
4. Only then merge the app code that depends on it. If code that writes a new column ships first, every save fails with "saved locally only".
5. Say in the PR body that it is already applied.

**Never set up automatic `supabase db push` without fixing migration history first.** The history recorded in production does not match the file names in this repo. The first automatic push would re-run `20260101000000_baseline_schema.sql`, which recreates `fabhub_full_access` policies (full read/write for `anon`) on most tables and undoes the security model.

## Security model
- Login is FabHub's own (`verify_login` RPC plus bcrypt), not Supabase Auth. The JWT carries `username` and `user_role`; use `public.app_username()`, `public.app_role()`, `public.has_role(...)` and `public.is_mgr()`.
- Every table has row-level security, and every policy is gated on `user_role`. Never add a policy for `anon`, and never use `using (true)`.
- Revoke `execute` from `public, anon, authenticated` on every trigger-only and `security definer` function you add.

## Daily Cash Position (finance-critical)
- Only Managers and `CASH_EDIT_USERS` (`src/shared.jsx`, currently `mark`) may write. Everyone else is view-only.
- A day locks for non-Managers at 12:01 AM (Asia/Manila) the following day. After that, only a Manager can edit it, with a reason that is logged and sent to management on Telegram.
- These rules are enforced in two places, which must stay in sync:
  - in the app: `cashCanEdit` / `cashDayLocked` in `src/shared.jsx`;
  - in the database: migration `20260928150000_cash_positions_edit_lock.sql`.
- Every save or delete keeps its previous version in `cash_positions_history`.
- Never trim or reformat what a text input displays while the user is typing (see `payeeRaw` vs `payeeOf`). Trim only for matching, grouping and export.

## Before pushing
Run `node scripts/check-imports.js && node scripts/check-schema.js && node scripts/check-undef.js`, then `CI=true npx react-scripts build`. `CI=true` turns lint warnings, including unused imports, into errors.

For the smoke test locally, run `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run smoke`.

## Mother PO billing (standby PO umbrellas)
- A standby PO (`deals.standby_po`, e.g. Diageo CE-2026-1216) earns ₱0 itself; its sub-projects (`parent_deal_id`) carry the billing.
- Only Managers may add or change milestones or payments on a mother PO. Enforced in `BillingView` (`isMotherPO` + `canonRole(role)`) and by migration `20260930010000_mother_po_billing_manager_only.sql` — keep them in sync.

## BOQs on deals
- Linking a BOQ to a deal is final: Duplicate/Link never replace a deal's existing BOQ. Mother POs never carry a BOQ or a price.
- Only a Manager can clear a deal's BOQ. Every BOQ change and deal delete keeps the previous BOQ in `deals_boq_history` (restore steps are in the migration).
- Enforced in `attachBoqToDeal` (`src/App.jsx`), the Clear Draft gate in `src/views/BOQBuilder.jsx`, and migration `20261006010000_deals_boq_safeguards.sql` — keep them in sync.
- Supabase MCP `execute_sql`/`apply_migration` hang on any `DROP` (they wait for a confirmation that never comes). Write migrations with `create or replace` / `if not exists` instead.

## Offset / credit note settlements
- A receivable settled without cash (e.g. Makerlab CE-2026-1242, paid by cancelling GMD's ₱525K debt to them) is a billing payment with method `Offset / Credit Note` (`OFFSET_METHOD`, `src/core.js`).
- It counts wherever FabHub measures what's settled (balances, Fully Paid, AR, collected-to-date) and is excluded wherever FabHub counts cash by date. Use `isCashPayment(p)` in any new cash figure (cash flow, monthly collections, cash-in).
- Only a Manager may record or change one, and it needs a reference. Enforced in BillingView's Log/Edit Payment and by migration `20261020050000_billing_offset_manager_only.sql`. Keep them in sync.

## Billing deductions (database-kept)
- A deduction on a billing milestone goes only through the `record_billing_deduction` / `reverse_billing_deduction` RPCs (migration `20261020060000_billing_deductions.sql`): Manager only, reason required, never more than the invoice or below what has been paid.
- Each one is a row in `billing_deductions`, kept forever. A reversal puts the amount back and marks the row reversed; nothing is deleted. The table has no insert/update/delete policies, so don't add client writes to it.
- The app mirrors the result on screen only (`applyDeduction`); never lower a milestone `amount` from the client to record a deduction.

## Deal billing totals (database-owned)
- For any deal with billing milestones, `deals.invoiced`, `amount_paid` and `payment_status` are computed by the database (`recompute_deal_billing_totals`, triggers on `billing_milestones` / `billing_payments`, migration `20261012010000`). Only that function may change them: `trg_deals_protect_billing_totals` (`20261012030000`) silently keeps the old values on any other update.
- The app only updates these on screen. Do not add client writes of them; Finance can't update `deals` under RLS, which is how ₱5.67M of collections went missing (fixed 2026-10-12).
- Finance's Billing onboarding fields save through the `set_deal_onboarding` RPC (`20261018010000`). The earlier `save_deal_onboarding` RPC (`20261012020000`) is superseded and unused by the app.

## JO = project code (database-issued)
- The JO number is GMD's internal project code. Every deal in an awarded stage has one: `trg_deals_ensure_jo` issues it when a deal enters an awarded stage, by any route. A child deal (`parent_deal_id`) gets its parent's JO plus `-01`, `-02` (migration `20261020020000_jo_project_code.sql`).
- An issued JO number is never changed. Duplicates are marked `status = 'Void'`, never deleted or renumbered.
- The app never picks a JO number: `confirmAward` sends a blank `jo_no` and reads the server's back. `trg_job_orders_adopt_auto` hands the auto-issued JO over to the Award modal's JO so a deal never gets two (`20261020030000` also skips stale copies re-pushed by devices).
- Look up a deal's project code with `dealJo(jos, dealId)` (`src/core.js`), never `jos.find(...)`; it skips Void JOs and mirrors `deal_base_jo()`.
- The awarded-stage list in `jo_awarded_stage()` mirrors `WON_STAGES` in `src/core.js`: keep them in sync.
- Every JO edit and delete, including one cascaded from a deal delete, is kept in `audit_log` (`trg_audit_job_order`, `20261020070000`; restore steps are in the migration). `purchase_requests` has the same audit (`20261020010000`).
