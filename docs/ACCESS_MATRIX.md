# FabHub — Access Matrix (working draft)

This is the source of truth for the Row-Level Security (RLS) project. It captures
**what the app enforces today** (in the browser only) so we can mirror it at the
database. Edit freely — cells marked **?** need a decision from Paulo before we
write policies.

**Legend:** V = view · C = create · E = edit · D = delete · A = approve/release · — = no access

Roles (as seeded in `DEFAULT_USERS`): **Manager, ProjectMover, Sales, Finance, Accounting, Procurement, QS, Warehouse, Design**

---

## ✅ Decisions — RESOLVED (2026-07-16)

1. **Sales gets read-only Billing (SOA) access.** Sales can view billing
   milestones/payments and print Statements of Account to send client billings,
   but **cannot** create/edit/delete milestones or log payments (Manager/Finance
   only). This reconciles the prior inconsistency where `RT_SUB_ROLES` and the
   read-access reference already included Sales for `billing_*` but the matrix
   row and migration 024's SELECT policy did not. Enforced by: a "Billing" nav
   item for Sales, BillingView's `canEdit = Manager|Finance` gate (mutations
   already hidden for Sales), and `supabase_migration_027_sales_billing_soa.sql`
   (adds Sales to the `billing_*` SELECT policy).

## ✅ Decisions — RESOLVED (2026-07-08)

1. **`Operations` = `ProjectMover`** — merged in policies.
2. **`Cost Control` = `Finance`** — merged. (Finance therefore approves Budget Requests.)
3. **Manager-only delete** on deals & financial records (deals, expenses, inflows,
   billing, vouchers, payables, cash, budgets). **`audit_log` is append-only** — no
   edit/delete for anyone, including Manager. This overrides the stray `D` cells in
   the workbook (Sales→Deals, Finance/Accounting→Expenses, Finance→cash) per the
   owner's Decision #3.
4. **Sales sees the entire pipeline** (no per-rep siloing).
5. **Coarse gating** for the `app_settings` JSON blobs (e-vouchers, cash position,
   bot settings): Manager/Finance only; e-vouchers may migrate to a real table later.
6. **`Accounting` is a first-class role** — added to the app's role picker.
7. **Procurement** has full control (VCEDA) of PRs, material requests, budget
   requests, subcon work orders, suppliers, subcontractors.
8. Added view grants: Accounting & Warehouse can view Project Cards; Warehouse can
   view Expenses; Sales can view the Daily Site Log.

---

## (historical) Decisions needed before we build

1. **"Operations" vs "ProjectMover".** The code constantly checks a role called
   **`Operations`**, but no user actually has it — the 8 operations staff are
   seeded as **`ProjectMover`**. They're almost certainly meant to be the same
   thing. **Decision: treat `Operations` = `ProjectMover` (recommended), or is
   Operations a separate role you want?**

2. **"Cost Control" = Finance?** Several approval gates check a role named
   `Cost Control`, which also isn't seeded — your Finance user (Aerwin) is the
   stand-in. **Decision: confirm `Cost Control` = `Finance`.** (If yes, some
   approvals currently "dead" for Finance start working — see notes.)

3. **Deletes have NO server check today.** Deleting a deal, expense, voucher,
   payable, etc. is blocked only by *hiding the button*. Anyone using the key
   directly can delete anything, cascading across ~8 tables. RLS will make
   delete a real, enforced permission — **confirm the D column per module.**

4. **Sales: all deals or own deals only?** Today any Sales user sees the whole
   pipeline. **Decision: keep full pipeline, or silo each rep to their own
   deals (`sales_owner = me`)?**

5. **JSON-blob data can't be row-secured.** E-vouchers/liquidation, cash
   position, and bot settings live as JSON inside `app_settings`, not real
   tables. We can only gate the whole `app_settings` row (Finance/Manager).
   **Decision: accept coarse gating, or migrate e-vouchers to a real table
   later?**

6. **`Accounting` is missing from the role picker** in the Accounts screen, yet
   it's a live role with heavy access. We'll add it. (No action needed, noted.)

---

## Matrix — core sales & project

| Module | Table(s) | Mgr | PM | Sales | Fin | Acct | Proc | QS | WH | Dsgn |
|---|---|---|---|---|---|---|---|---|---|---|
| Pipeline / Deals | `deals` | VCEDA | — | VCE (request-award only) | V | — | V (clients only) | V | — | V (budget-masked) |
| Project Cards / Tasks | `project_cards`, `project_card_dept_*` | VCED | VE | V | VE | — | V | V (set TAT) | — | V (masked) |
| Daily Site Log | `daily_logs` | VCD | VCD (own) | — | — | — | — | — | — | — |
| Addenda / Scope Changes | `addenda` | VC | VC (own project) | V | V | — | VC | — | — | VC |
| Design Requests (DRF) | `design_requests`, `design_request_forms` | VCEDA | V | VC | V | — | — | — | — | VCE (acknowledge; not Approve) |

## Matrix — finance & accounting

| Module | Table(s) | Mgr | PM | Sales | Fin | Acct | Proc | QS | WH | Dsgn |
|---|---|---|---|---|---|---|---|---|---|---|
| Finance / cash position | `inflows`, `app_settings` | VCED | — | — | VCED | — | — | — | — | — |
| Billing | `billing_milestones`, `billing_payments` | VCE | — | V (SOA / read-only) | VCE | V | — | — | — | — |
| Expenses | `expenses` | VCED | V | V | VCED | VCED | V | V | — | V |
| Daily Payables | `expenses`, `payables` | VA | — | — | VA | VA (mark paid) | — | — | — | — |
| Check Vouchers | `check_vouchers` | VCEA (void) | — | — | V (release, clear) | VCE (submit, clear, void) | — | — | — | — |
| Liquidation / E-vouchers | `app_settings` (JSON) | VCED | — | — | V | VCED | — | — | — | — |
| Chart of Accounts / Reports | `chart_of_accounts` | VE | — | — | V | V | — | — | — | — |
| Audit Trail / WIP / Cashflow | `audit_log` (derived) | V | — | — | V | V | — | — | — | — |

## Matrix — procurement / warehouse / QS

| Module | Table(s) | Mgr | PM | Sales | Fin | Acct | Proc | QS | WH | Dsgn |
|---|---|---|---|---|---|---|---|---|---|---|
| Purchase Orders / PRs | `purchase_requests` | VCEA | — | — | VCEA | — | **?** (see decision #1/#3 — nav says yes, page gate excludes) | V | — | — |
| Material Requests | `material_requests` | VCEA | V | VC | VA | — | V (→PO) | — | — | V |
| Budget Requests | `budget_requests` | VCEA | V | VC | V (**cannot approve today?**) | — | V | — | — | V |
| Subcon Work Orders | `subcon_work_orders` | VA | — | V | VA | V | V (manage) | — | — | — |
| Suppliers | `suppliers` | VCED | — | — | V | — | VCED | — | — | — |
| Subcontractors | `subcontractors` | VCED | — | — | V | — | VCED | — | — | — |
| Swatchboard | `swatches` | VCED | — | — | V | — | VCED | — | — | VC |
| CE / QS Queue | `ce_requests` | VCE | — | V | V | — | — | VCE | — | — |
| Inventory | `inventory_items` | V | — | — | V | — | V | — | VCED | — |
| Deliveries / Stock | `stock_movements` | V | — | — | V | — | V | — | VC | — |

## Matrix — cross-cutting

| Module | Table(s) | Mgr | PM | Sales | Fin | Acct | Proc | QS | WH | Dsgn |
|---|---|---|---|---|---|---|---|---|---|---|
| Users / Accounts | `user_profiles` | VCED (+approve) | own | own | V (Mgr mutates) | own | own | own | own | own |
| Activity / Leaderboard | `activity_log` | V (all) | C | C | C | C | C | C | C | C |
| PM Updates | `ae_updates`, `project_cards` | VC | VC | — | — | — | — | — | — | — |
| Bot Settings | `app_settings` | VE | — | — | VE | — | — | — | — | — |
| Data Management | all (migrate) | V (Manager + paulo) | — | — | — | — | — | — | — | — |

---

## Read-access reference (`RT_SUB_ROLES`, the closest thing to an intended VIEW matrix)

- `project_cards` = all except QS/Accounting
- `billing_*` = all except QS/Warehouse
- `addenda`, `activity_log` = all except Accounting/Warehouse
- `job_orders` = all
- `material_requests`, `budget_requests` = all except QS/Accounting/Warehouse
- `expenses` = all except Warehouse
- `subcon_work_orders` = all except QS/Warehouse
- `inflows` = Manager only
- `swatches` = Manager/Finance/Procurement/Operations/Design
- `inventory_items`, `stock_movements` = Manager/Finance/Procurement/Warehouse
- `design_requests` = Manager/Sales/Finance/Design/Operations/ProjectMover

---

## Table → module mapping (confirmed from code)

`deals`·`job_orders`·`project_cards`(+`project_card_dept_status`,`project_card_dept_tasks`)·`projects`·`billing_milestones`·`billing_payments`·`expenses`·`payables`·`check_vouchers`·`purchase_requests`·`material_requests`·`budget_requests`·`design_requests`·`design_request_forms`·`addenda`·`subcon_work_orders`·`subcontractors`·`suppliers`·`swatches`·`inventory_items`·`stock_movements`·`ce_requests`·`user_profiles`·`project_budgets`(keyed by `deal_id`)·`activity_log`·`inflows`·`daily_logs`·`chart_of_accounts`·`ae_updates`·`loans`·`loan_payments`·`cash_positions`·`audit_log`(soft-delete archive)·`app_settings`(JSON: e-vouchers, cash position, bot settings)·`doc_counters`/`po_counter`/`wo_counter`(system-only)
