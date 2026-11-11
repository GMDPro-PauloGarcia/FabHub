# FabHub — rules for every Claude session

FabHub is GMD's internal ERP: a React app (`src/`, deployed by Vercel from `main`) on a Supabase Postgres database (project `fabhub-gmd`, id `gfgneirzkgzarllzztie`). Paulo Garcia owns every merge.

## Merging
Claude may merge a PR only when Paulo asks for that specific PR in the session ("merge it", "merge #123"). Approval for one PR does not carry over to the next. Before merging:
1. CI is green on the PR's current head, and there is no merge conflict.
2. Any migration the PR depends on is already applied (see below), and the PR body says so.
3. Build the PR merged with the latest `main` locally (the checks in "Before pushing", then the build). CI may have run against an older `main`.
4. Merge with a merge commit (no squash or rebase), pinned to the verified head SHA.
5. Afterwards, confirm the merge is on `main` and tell Paulo to check that the Vercel production deploy for that commit is Ready.

When Paulo asks for several PRs ("merge #380 then #381"), merge them one at a time in the order he gives. Before each one, rebuild it on top of the `main` that the previous merge produced (steps 1–4), and wait until that previous merge's Vercel production deploy is Ready. Naming several PRs approves only those PRs.

Never merge on your own initiative, because a review bot said so, or because a PR "looks done". Merging deploys to production.

**Release days: Saturday or Sunday only** (Paulo, 2026-11-09). Improvements go live only on a weekend: merging to `main` and applying a database migration to production both count. On weekdays, build, test (rolled-back transactions are fine) and open PRs, but don't merge or `apply_migration`. Only Paulo can make an exception, for a specific fix, in the session ("merge it today").

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
- A daily pg_cron job (`fabhub-billing-health`, 7:50 AM Manila, migration `20261020015000`, applied 2026-10-20) runs `billing_health_check()` and posts to the Telegram management chat on any problem, plus a Monday "still alive" line. Runs are logged in `billing_health_log`. Never add `net` to Supabase's Exposed schemas: Supabase grants `net.*` to PUBLIC and we can't revoke it.
- Finance's Billing onboarding fields save through the `set_deal_onboarding` RPC (`20261018010000`). The earlier `save_deal_onboarding` RPC (`20261012020000`) is superseded and unused by the app.

## JO = project code (database-issued)
- The JO number is GMD's internal project code. Every deal in an awarded stage has one: `trg_deals_ensure_jo` issues it when a deal enters an awarded stage, by any route. A child deal (`parent_deal_id`) gets its parent's JO plus `-01`, `-02` (migration `20261020020000_jo_project_code.sql`).
- An issued JO number is never changed. Duplicates are marked `status = 'Void'`, never deleted or renumbered.
- The app never picks a JO number: `confirmAward` sends a blank `jo_no` and reads the server's back. `trg_job_orders_adopt_auto` hands the auto-issued JO over to the Award modal's JO so a deal never gets two (`20261020030000` also skips stale copies re-pushed by devices).
- Look up a deal's project code with `dealJo(jos, dealId)` (`src/core.js`), never `jos.find(...)`; it skips Void JOs and mirrors `deal_base_jo()`.
- The awarded-stage list in `jo_awarded_stage()` mirrors `WON_STAGES` in `src/core.js`: keep them in sync.
- Every JO edit and delete, including one cascaded from a deal delete, is kept in `audit_log` (`trg_audit_job_order`, `20261020070000`; restore steps are in the migration). `purchase_requests` has the same audit (`20261020010000`).

## Down payment before production (POs / subcon work orders)
- "NO DP = NO production": a PO can't move to `PO Issued` / `Partially Delivered` / `Delivered`, and a subcon work order to `Issued` / `In Progress` / `Completed`, on a client deal until the client has paid something on it or a Manager has waived the down payment (`deals.dp_waived_by/at/reason`, reason required, every change in `audit_log`).
- A sub-project or addendum is clear when its parent deal is paid or waived; internal GMD jobs (client "GMD Productions…") and stock POs (no deal) are exempt. POs already issued are untouched.
- A sub-project of a mother PO (standby umbrella) is clear once the umbrella is clear, i.e. once any of its sub-projects is paid or waived (an umbrella earns ₱0 itself).
- Clients on credit terms (`client_credit_terms`, matched case-insensitively on the client name as typed on the deal or its parent) skip the rule for all their projects. Only a Manager changes it, with a reason, through `set_client_credit_terms` (logged to `audit_log`, Telegram to management): "Put … on credit terms" in `DpGate`, "Remove" in the Clients page list. The app registers the active names with `setCreditTermClients` (`src/core.js`). Migration `20261106020000_dp_rule_credit_terms_and_mother_po.sql`, applied 2026-11-06.
- Enforced in `dealDpClear` (`src/core.js`), the PO / SWO issue gates and `DpGate` (`src/App.jsx`), and migrations `20261020110000_po_require_down_payment.sql` (rule + waiver guard) / `20261020110100_po_require_down_payment_triggers.sql` (the blocks) — keep them in sync. Never add `dp_waived_*` to `toSbDeal`: a stale full-row save would trip the Manager-only guard; waivers save only through `waiveDp`.

## Sales commission safeguards
- Commission goes to a deal's Sales Owner (`deals.sales_owner`) as a share of what the client has collected. Collected means the sum of `billing_payments`, or `deals.amount_paid` for a deal with no milestones. An AE must never control any of these on their own deals. Jessica Castro (SalesOpsAdmin) is both an AE and the person who records most collections, so these rules matter.
- **No payments on your own deal:** a non-Manager can't insert, edit or delete a `billing_payments` row on a deal where they are the Sales Owner. Finance or a Manager records those. Enforced by `ownsDealCommission` (`src/core.js`, BillingView's payment controls) and migration `20261026063330_billing_payments_not_own_deal.sql` (restrictive policies). Keep them in sync.
- **Sales Owner is locked once a deal has collections:** only a Manager can change it. Anyone else's change is silently dropped, so a stale full-row save still works, and logged to `audit_log`. Enforced by `salesOwnerLocked` (`src/core.js`, DealModal) and migration `20261026063739_deals_sales_owner_lock.sql`. Keep them in sync.
- **`deals.amount_paid` comes from the billing ledger or a Manager only:** anyone else's change is dropped, and it is forced to 0 on insert. Logged to `audit_log`. Enforced by the deal import (Amount Paid is carried only for a Manager) and migration `20261026040000_deals_amount_paid_manager_only.sql`. Keep them in sync.
- Never loosen these to fix a "saved locally only" error or a reassignment request. A Manager does the reassignment.

## AP duplicate safety net (database-kept)
- Supplier payments and bills are checked by the database (migration `20261102113419_ap_duplicate_safety_net.sql`, applied 2026-11-02):
  - **Blocked:** paying more than a bill; a second bill with the same supplier + supplier invoice no.
  - **Manager with a reason only:** a check no. already recorded for a different supplier; same supplier + same amount paid on another bill within 30 days under a different reference (only when a bill has no PO/WO, or both are on the same PO); a no-PO bill with the same supplier + amount as another bill within 60 days. Overrides go to `audit_log` (`action = 'duplicate_override'`).
- Suppliers are compared by `ap_vendor_key()` (first 8 letters/digits) because names are free text.
- The app shows the refusal and asks a Manager for the reason (`askDupOverride` in `src/App.jsx`, `sbUpsertDetailed` in `src/supabaseClient.js`). Never loosen the triggers to make a save go through.
- `ap_health_alert()` runs daily at 7:52 AM Manila (pg_cron `fabhub-ap-health`) and posts problems to the Telegram management chat; runs are logged in `ap_health_log`.
- `opex_review_alert()` runs every Monday at 8:06 AM Manila (pg_cron `fabhub-opex-review`, migration `20261105010000`, applied 2026-11-05). It lists cost-center bills of ₱10,000 or more from the past 7 days, and any cost-center bill with no "what it was used for" note, for Managers to check that project materials aren't hidden in OPEX. `opex_review_alert(false)` is a dry run. Runs are logged in `ap_health_log` (`details->>'kind' = 'opex_review'`).

## AP numbers (database-issued, unique)
- The server issues every AP / PRV number on insert (`payables_assign_number`); the app always sends a blank one for a new bill.
- An issued number never changes: `trg_payables_lock_ap_number` silently keeps the old number on any update, so a stale device save can't undo it. A partial unique index (`payables_ap_number_unique`) refuses duplicates. Migration `20261104090000_ap_number_unique.sql`, applied 2026-11-04.
- On 2026-11-04, 118 bills that shared a number were renumbered to AP-2026-0737…0854. The old number is in each bill's notes ("Formerly …") and in `audit_log` (`action = 'ap_renumber'`).

## Supplier bill approval (database-kept)
- Managers approve bills (Paolo Gomez, with Paulo and Mar as back-up); the Finance role may too. Mark (FinanceAssistant) enters and pays bills and keeps the cash sheet, so he is **not** an approver. Migration `20261105042430_payables_approval_controls.sql`, applied 2026-11-05.
- Nobody approves a bill they entered. Every new bill starts Pending. A non-approver's change to `approval_status` / `approved_by` / `approved_at` is silently ignored (stale saves still work). Approving from a copy whose amount or supplier differs from the server is refused. Changing the amount or supplier of an approved bill puts it back to Pending (`audit_log` action `approval_reset`). The server stamps who approved and when.
- The app mirrors this in `canApprovePayables` / `enteredByMe` / `setPayableDecision` (`src/App.jsx`). Approvals go to the server first (`update` of the decision + amount + vendor), never as a full-row upsert.
- A materials PO bill whose PO isn't fully delivered can be paid only by a Manager or from an approved payment run (`recordPayments`, app-side; delivery lives on the PO lines).

## Weekly payment run and BIR 2307 (database-kept)
- `payment_runs` (migration `20261105042842_payment_runs_and_2307.sql`): Draft (Mon) → Proposed (Tue, against cash) → Approved (Wed) → Released (Thu); Cancelled with a reason. Only `approve_payment_run(uuid)` approves a run: a Manager who didn't propose it; it approves every pending bill in the run under the normal approval rules. Items can't change once Approved. No delete policy. Screen: `src/views/PaymentRun.jsx` (Finance › Payment Run).
- `bir_2307`: one row per party per quarter (per deal for clients); `direction` 'issue' (GMD → supplier, from EWT on supplier bills) or 'receive' (client → GMD, from EWT on billing milestones). Issued / Received needs a reference and date. Screen: `src/views/Bir2307.jsx` (Accounting › BIR 2307). As of 2026-11-05 no supplier bill had EWT recorded, so the supplier side is empty until EWT is set on bills.
- Monitoring Board (`src/views/MonitoringBoard.jsx`, Finance › Monitoring Board) shows the "GMD Monitoring Flow" traffic lights; thresholds in `THRESHOLDS` are proposals until Management confirms. `monitoring_board_alert()` posts the main ones to Telegram every Monday 8:12 AM Manila (pg_cron `fabhub-monitoring-board`, migration `20261105043929`); `monitoring_board_alert(false)` is a dry run; runs are logged in `ap_health_log` (`details->>'kind' = 'monitoring_board'`). Keep its thresholds in sync with `THRESHOLDS`.

## Subcon billing (one bill per progress billing)
- Since 2026-11-05 a Work Order no longer creates a contract-sized bill. Each subcontractor billing is its own payable against the WO (`po_number` = WO no., `invoice_number` = the subcon's billing no., required), logged from Finance › Subcon Payments ("+ Billing", `src/views/SubconPaymentMonitor.jsx`).
- The PM / Operations / a Manager certifies the WO's cumulative % (`certify_subcon_billing`, Subcon Billing page `src/views/SubconCertView.jsx`); it is stamped on every bill of the WO, and a new bill inherits it. Lowering it is Manager-only.
- The database keeps a WO's bills within its contract (Manager may exceed) and its payments, across all its bills, within certified % x contract. Retention release still needs 100%. Migration `20261105160000_subcon_billing_per_progress_claim.sql` (applied 2026-11-05) on top of `20261027160000`. App mirrors: `savePayable` / `recordPayments` (`src/App.jsx`). Keep them in sync.
- Payroll / salary WOs carry 0% down payment (the PM certifies 100% instead); set by migration `20261105180000_subcon_payroll_wo_dp_zero.sql` (applied 2026-11-05) and defaulted in the WO form by `woDefaultDpPct`.
- Down payment: a WO's `dp_pct` lets its bills be approved and paid up to dp % of the contract before any certification, only while the WO is Issued / In Progress / Completed (issuing needs an approver and the client's DP). The cap is cumulative, greatest(certified %, dp %) x contract, so the DP is recouped automatically. Non-Managers may set dp_pct up to 50% and only before the WO is issued or paid; other changes are silently kept and logged to `audit_log`. Migration `20261105170000_subcon_down_payment_allowance.sql` (applied 2026-11-05); app mirrors `parseDpPct` / `woDefaultDpPct` / `subconDpAllowPct` (`src/core.js`), `approvePayable` / `recordPayments` and the WO form (`src/App.jsx`). Keep them in sync.

- Upserts and triggers: the app saves with an upsert, and Postgres runs BEFORE INSERT triggers even when the upsert updates an existing row. Every subcon / WO guard (`swo_require_approver`, `swo_require_dp`, `swo_dp_pct_guard`, `payables_subcon_cert_guard`, `payables_subcon_overbill_guard`) returns early on INSERT when the row already exists and lets its UPDATE branch decide (migration `20261106000000_subcon_billing_audit_fixes.sql`, applied 2026-11-06). Any new BEFORE INSERT guard on an upserted table must do the same.

## Purchasing (Orders › Purchasing)
- `src/views/PurchasingHub.jsx`, added 2026-11-06: one row per supplier PO and subcon WO (Ordered → Received / Certified → Billed → Paid → Payable now) with the next step and who owns it; "Needs me" follows the role (`PH_ROLE_KEYS`). Built on `buildOrders` (`src/data/ledger.js`).
- **By supplier** (default, 2026-11-11, Paulo: "Procurement and Finance would have the same view … payments for each supplier/subcontractor"): one line per supplier / subcontractor (grouped by the `ap_vendor_key` rule, first 8 letters/digits) with ordered, received, billed, paid, unpaid and payable now; its POs / WOs open underneath; "By order" is the flat list. It opens on Open, not Needs me, so each supplier's totals are complete. For Finance / FinanceAssistant / Accounting it is the first tab of Payables (`FIN_HUB_OF` / `FIN_HUB_ROLES` in `src/App.jsx`); Procurement keeps it under Orders.
- **+ PO / + WO** (2026-11-11): on each supplier line (+ PO for a supplier, + WO for a subcontractor) and at the top (+ New PO / + New WO). They open the existing PO form (`poDraft` with `lines: []`, supplier only) and the new-WO form (`woDraft` → `SubconWOView`, subcontractor picked), so every approval / down-payment rule still runs there. Shown to Procurement, the Procurement Manager and Managers only (`canRaiseOrders` in `src/App.jsx`); the database itself still lets Finance / FinanceAssistant insert POs and WOs (open question for Paulo).
- **To pay / Pay / Approve** (2026-11-11): "To pay" lists orders with a bill to approve or money payable now. Finance (`roleCanInsert("payable_payments")`) gets **Pay** on a supplier line: supplier bills open the existing "Pay several bills" form for that supplier with its approved bills ticked (`setMultiPay`), a subcontractor bill opens the single-payment form; approvers get **Approve** (opens Supplier Bills). Payable now counts approved bills only, here and on Subcon Payments (before 2026-11-11 a WO's unapproved bills counted).
- Read-only: its buttons open the existing screens (bill form via `purchasingPage` in `src/App.jsx`, Supplier Bills, Subcon Billing, Purchase Orders, Work Orders). Never add writes here; money rules stay in the database and `savePayable` / `approvePayable` / `recordPayments`.
- PO lines closed at the AP cutover count as received but are labelled "Closed at cutover, not proven".

## Cash sheet ↔ bills
- A Daily Cash Position disbursement row can carry `payableIds` (the bills it paid) or `noBill` (payroll, bank transfer, loan, petty cash, tax, owner, other). It is set from the row's 🔗 on the sheet (a normal sheet edit, saved with Save) or from Expense Monitoring (which first checks the server's copy of the day with `cashDayIsCurrent`). Transaction History and Expense Monitoring match disbursements to AP payments from these tags; same-day same-amount moves between two GMD banks are paired as transfers.

## PO lines closed at the AP cutover (2026-11-05)
- 950 PO lines on 485 POs (₱7.17M) whose bill was Paid but whose receipt was never recorded were set to Delivered by migration `20261105222542_close_paid_pos_at_cutover.sql` (paid, project-tagged, dated before 2026-10-06; GMD Stocks and cost-center POs left for Warehouse). No stock movement was written.
- Their `delivery_note` starts "Closed at AP cutover 2026-11-05": the receipt is not proven. Exclude or label them in any receiving / 3-way-match report. Lines as they were: `purchase_requests_backup_20261105`; rollback steps in the migration.

## Navigation hubs
- Pages that belong together share one sidebar item, and a tab strip at the top of the page switches between them: `NAV_HUBS` / `NAV_HUB_OF` (top of `src/App.jsx`), `hubbedNav`, `hubMembers`, the strip in `Wrap`. Orders = Purchasing + Purchase Orders + Subcon Work Orders; Warehouse = Inventory + Deliveries + Stock Movements.
- The strip lists only the role's own nav items, so access is still set by `navMap`. To give a role a page, add it to `navMap`, not to the strip.
- Finance (2026-11-06; Purchasing added first 2026-11-11): Payables = Purchasing, Supplier Bills, Payments, Payment Run, Check Vouchers, Subcon Payments (+ Purchase Orders for FinanceAssistant / Accounting); Cash = Cash Position, Cash Flow; Monitoring = Monitoring Board, Reports; Accounting = Expense Monitoring, BIR 2307, Chart of Accounts. Executive keeps its own tabs (Overview, Transactions, P&L). The old Finance ERP tab bar is gone; the hub strip replaces it and carries its counts.
- Finance tabs are nav items too: `NAV_FIN_TAB` (item → Finance tab) and `FIN_TAB_NAV` (tab → item). `navLoc` is the item for where the user is; `navGo(id)` opens any item. `navIsActive` is the one active-item rule for the desktop sidebar, the phone nav and the hub strip. Use these for any new item.
- Hidden modules: `RETIRED_PAGES` in `src/shared.jsx` (hidden, not deleted). Check Vouchers and Stock Movements were added 2026-11-06 (0 vouchers / 1 movement ever). Any button or tile that opens a page must be gated with `pageOn(id)`, or it bounces to Home.

## Order Board (Orders › Order Board) and PRF rules
- `src/views/OrderBoard.jsx` (2026-11-07): every PRF line at "For Procurement" with something to buy and no PO, grouped by supplier (suggested = last supplier for the same item in PO history), plus PRFs still at PM / Warehouse / Cost Control. "Create PO" hands the ticked lines to the PO form (`poDraft` → ProcurementView2); after the PO is saved, `linkPrfLines` (`src/App.jsx`) calls `link_prf_po` per PRF, retrying while the new PO lines reach the server. One PO may carry lines of several PRFs and projects.
- Cut-off 10:15 AM Manila (`prfBatchTag`): submitted today by 10:15 = today's batch; after 10:15 = needs Cost Control (QS) to be ordered today; any earlier day = skipped its day, shown as Urgent. Display only until the database rules land.
- Rules agreed with Paulo 2026-11-07, to be enforced by the database from 1 Dec 2026: a project PO needs an approved PRF; a PRF in after 10:15 is ordered the same day only if Cost Control (QS: Ardrin, Rodney) releases it, otherwise it rolls to the next day as Urgent; Urgent PRFs need Cost Control and the Procurement Manager; all PRF notifications go to Telegram, Procurement's to the Cost Control chat (`financialcontrol`).
- `prf_can_read()` / `prf_step_block()` include ProcurementManager (migration `20261107000000_prf_procurement_manager.sql`, applied 2026-11-07); before it the Procurement Manager could not see or order PRFs.

## PO approval, receiving and progress (department audit, 2026-11-07)
- **Who approves (issues) a PO:** Cost Control (QS: Ardrin Salustiano, Rodney Erpe) when the PO total is ₱150,000 or less and they didn't request it; a Manager for any amount (Paolo Gomez as Finance manager above ₱150,000). The Procurement Manager no longer approves POs; work orders keep the old rule (`canApprovePO` / `swo_require_approver`). PO total = qty × estimated unit cost over the PO's non-cancelled lines. Database: `po_line_approver_name` / `po_require_approver`; approving goes through `approve_po(po_number)` (QS has no direct write on PO lines). App: `canApprovePOLine` / `poLinesTotal` / `PO_APPROVER_MSG` (`src/core.js`), `approvePOs` and the PO form (`src/App.jsx`), `POApprovals` (on the Purchase Orders page and the QS home). Migration `20261107010000_po_approval_cost_control_and_receiving.sql`, applied 2026-11-07. Keep them in sync.
- **Tiers from 2026-11-14** (migration `20261114010000`, to apply on the weekend; the app side is off until then: `PO_TIERS_ON` in `src/core.js`, which also gates `OWNER_USERS`): Cost Control up to ₱150,000; a Manager (Paolo Gomez) below ₱250,000; ₱250,000 and above only Paulo, Mar or Arrius (`po_top_approver()`), who also review Paolo Gomez's approvals. App: `PO_MANAGER_LIMIT` / `PO_TOP_APPROVERS` / `canApprovePOLine` (`src/core.js`). The same migration makes Arrius Catubay a Manager (`trg_protect_user_profile` lets only a Manager change a role, so it runs with Paulo's claims). Owner-only screens (Project Margins, Financial Overview) use `OWNER_USERS` (`src/App.jsx`: paulo, mar, arrius).
- **Procurement Manager tier, same weekend release** (migration `20261114030000`, apply right after `20261114010000`; on with `PO_TIERS_ON`): Marian Prile approves a PO requested by her team (`user_profiles.role = 'Procurement'`: April Inocentes, Mal Santos), never her own and never one with no supplier, up to ₱50,000, and only while everything ordered from that supplier on the PO's date (`po_split_total`, supplier compared by `ap_vendor_key`) is ₱50,000 or less, so an order can't be cut into small POs. Her JWT says `Procurement`, so the database tells her apart by `user_profiles.role = 'ProcurementManager'`; `approve_po` admits the Procurement claim and the trigger refuses everyone the rule doesn't name. App: `PO_PROC_MGR_LIMIT` / `poSplitTotal` / `poVendorKey` / `canApprovePOLine(…, split)` (`src/core.js`), passed by `POApprovals`, `approvePOs` and the PO form. Work orders unchanged. Keep them in sync.
- **Daily check on her approvals** (migration `20261114040000`, same release): `proc_mgr_po_approvals_alert()` posts yesterday's POs approved by a Procurement Manager to the Cost Control and management chats every day at 7:56 AM Manila (pg_cron `fabhub-procmgr-po-approvals`), flagging a supplier that got more than one of her POs that day; silent on a day with none. `proc_mgr_po_approvals_alert(false)` is a dry run. Runs are logged in `ap_health_log` (`details->>'kind' = 'procmgr_po_approvals'`).
- `po_require_approver` returns early on an upsert of an existing row (BEFORE INSERT fires on upserts); before this, every edit of an issued PO by a non-approver, receipts included, was refused.
- **Receiving:** Warehouse can read PO lines (it couldn't, so its Deliveries board was empty and no receipt was recorded) and records receipts only through `receive_po_line(id, qty, date, dr_no, note)`, which changes only the delivery fields and appends `delivery_history`. `updatePR` routes a Warehouse receipt there; other roles keep the upsert.
- **Bulk approval:** on 2026-11-07, 201 POs (393 lines, ₱4.93M) in "Pending Approval" with a clear down payment were set to PO Issued, `approved_by = 'Bulk approval (Paulo Garcia) 2026-11-07'`, no bills created (migration `20261107030000`; lines as they were in `purchase_requests_backup_20261107`; `audit_log` record_id `bulk-approve-20261107`).
- **Cost Control (QS)** reads payables, payable_payments, billing_milestones, billing_payments and subcon_work_orders (no writes), for Budget & Costs (Cost Analysis, back from hidden) and Project Margins. Migration `20261107020000`.
- **Progress:** PM Updates, Scope Changes (pages) and Blockers are removed; `src/views/ProjectProgress.jsx` (Progress) sets each active project to 30 / 60 / 90 / 100 % through `set_project_progress` (`project_cards.manual_progress`, `progress_set_by`, `progress_set_at`; every change in `audit_log`, action `progress`). PMs, Operations, Managers on any project; Coordinators on their own. Migration `20261107020000`.
- **Inventory** is hidden (`RETIRED_PAGES`) until Warehouse provides a stock count; Warehouse keeps the Deliveries board as its Dashboard. Stock actions (Issue to Site, Fab Release, Stock Log, low-stock) are gated with `pageOn("inventory")`. `WAREHOUSE_HIDDEN` is now its own switch (false), not tied to Inventory.

## Weekly / Monthly Cash Flow summary (Cash Position › Weekly · Monthly)
- Collections come from the Daily Cash Position: a day with a cash sheet counts only the sheet's collections; Billing payments fill in only days with no sheet. Until 2026-11-09 both were added, so client payments were counted twice (Sep ₱24.6M shown vs ₱15.3M real; Oct ₱19.2M vs ₱10.1M). `src/views/WeeklyCashFlow.jsx`.
- Loan money is a cash-sheet row linked to a loan on the Loans tab, or one whose text names bank-loan proceeds / amortisation / credit-line interest (`CF_LOAN_IN` / `CF_LOAN_OUT`). Never match on the bare word "loan": it catches a surname (Baloloan) and SSS / Pag-IBIG salary-loan remittances, which are payroll.

## Loans (Executive › Loans) — in progress
- Off until the weekend release: `LOANS_V2` (`src/App.jsx`) and `HIDDEN_FIN_TABS.add("loans")` (`src/shared.jsx`).
- `src/views/LoansView.jsx`: Credit Line Loans (limit, drawn, available) and Bank Loans (borrowed, paid back, balance, next due, status). Every draw / payment links to its cash-sheet row (`cash_key` = cashMovements' key). Migration `20261108010000_loans_credit_lines_and_cash_links.sql` (not applied yet): guards (no over-repayment, one cash row per entry, note required without a cash row) and `audit_log` on both tables. Mark, Jerwin and Managers write; only Managers delete.
