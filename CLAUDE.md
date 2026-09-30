# FabHub — rules for every Claude session

FabHub is GMD's internal ERP: a React app (`src/`, deployed by Vercel from `main`) on a Supabase Postgres database (project `fabhub-gmd`, id `gfgneirzkgzarllzztie`). Paulo Garcia is the only person who merges.

## Database changes: DB before code — always
The `DB migrations` GitHub workflow does **not** apply migrations. It has no credentials, so it skips and still shows green. Every schema change is applied by hand, in this order:

1. Write the migration in `supabase/migrations/<timestamp>_<name>.sql`. Make it idempotent (`if not exists`, `create or replace`, `drop … if exists`) and add a `-- ROLLBACK` section.
2. Test it on production inside a transaction that ends in a raised exception, so nothing is kept. Simulate the real user with `set local role authenticated` plus `set_config('request.jwt.claims', '{"username":"…","user_role":"…"}', true)`. Then confirm afterwards that nothing stuck.
3. Apply it with the Supabase MCP `apply_migration`.
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
