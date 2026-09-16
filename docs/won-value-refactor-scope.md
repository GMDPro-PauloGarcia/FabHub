# Scope — Single Source of Truth for "Won / Awarded Value"

Status: **Draft for decision** · Owner: TBD · Related: `docs/change-order-billing-spec.md`

## 1. Why this exists

Three screens showed three different totals for what a non-technical user reads as
"the same number":

| Surface | Value (live data, 2026) | Formula in code | Scope |
|---|---|---|---|
| Sales Pipeline → **Awarded Value** card | ₱95,456,523.62 | `wonDeals.reduce(+value)` | all won deals, all-time |
| Reports → Yearly **TOTAL** row (before fix) | ₱93,956,523.62 | `yearWon.reduce(+value)` | won deals **acquired in CY** |
| Reports → Yearly **data row** | ₱94,033,373.62 | `sum(dealBase) + sum(approved COs)` | won deals acquired in CY + COs |

Every gap reconciled to the peso against production:
- Card − TOTAL = **₱1,500,000** → one deal (*Manila Creamery RobMag*) won but acquired 2025-12-01. Scope difference, not a bug.
- data row − TOTAL = **₱76,850** → the two rolled-in approved change orders. **This is the bug.**
- The `.621` tails → fractional centavos from BOQ-derived values, shown because the formatter defaulted to 3 fraction digits.

A first pass (commit `dd39d6b`) made the reports internally consistent and rounded the
display. **That patch is a band-aid and has a latent correctness issue — see §4.** This
document scopes the real cure.

## 2. Root cause — there is no single definition of "a won deal's value"

Two independent problems compound:

### 2a. Change orders are modeled THREE ways
1. **Rolled addenda** — an `addenda` row with status in {Approved, Billed, Collected}.
   On approval, `rollDealContract` (`src/App.jsx:6197`) *mutates the parent deal's
   `value`* to include the CO and stashes the pre-CO amount in `deal.originalValue`.
2. **Separate addenda rows** — the same `addenda` records, summed again in reports via
   `coRawSigned` / `pco` (`src/App.jsx:11268`).
3. **Linked child deals** — a CO modeled as its own deal with `parentDealId` set
   (`src/App.jsx:7484`). These are themselves in WON_STAGES and get counted by any
   `wonDeals.reduce(+value)`.

Live data shows the dominant mechanism is child deals, not addenda:
- Child deals: **37 total, 32 won, ₱6,107,773.84**
- Rolled addenda: **2, net ₱76,850**

### 2b. `originalValue` does not persist
The `deals` table has **no `original_value` column** (verified against production schema).
So `deal.originalValue` exists only in memory and is **lost on every page reload**.

Consequence: `dealBase(d) = d.originalValue ?? d.value` (`src/App.jsx:11211`) silently
collapses to `d.value` after any refresh. The report's "count the base, then add COs
separately" logic therefore:
- **Right after** a CO is approved in-session: `originalValue` is set → base is stripped →
  CO re-added once → **correct**.
- **After a reload**: `originalValue` gone → `dealBase = value` (already includes the
  rolled CO) → CO added **again** via `pco` → **double-counted**.

This is a heisenbug: the same screen shows a different total before and after F5.

## 3. What the number SHOULD be

Because `value` already contains rolled-addenda COs, and child-deal COs are separate won
deals, the each-peso-once definition of awarded value is simply:

```
awardedValue(deals) = Σ value  over all won deals (parents + child deals)
                      — with NO separate re-add of rolled addenda
```

i.e. the **raw value sum is the correct number** today (₱95,456,523.62 all-time /
₱93,956,523.62 for 2026-acquired). Any formula that re-adds rolled addenda on top is
wrong once `originalValue` is gone.

**Reconciliation risk — AUDITED, confirmed real (see §3b).** A CO does exist as both a
child deal and a rolled addendum on the same parent, so raw value already double-counts it.
Data cleanup must precede the code refactor.

## 3b. Audit findings (completed)

Structure is clean: **0** nested deals (child that is also a parent), **0** orphan children,
**0** child-of-child chains. Child deals are flat, one level under real parents. No child
deal "became" a parent — a CO child deal is simply a full deal record whose `parentDealId`
pointer most value math ignores, so it surfaces in lists like a standalone project.

One cross-mechanism duplicate, isolated to a single project:

| Project | Mechanism | Record | Value |
|---|---|---|---|
| Kiko Milano Rockwell Store | rolled addendum | "Hanging Light Signage" (CE-2026-1110) | ₱35,000 |
| Kiko Milano Rockwell Store | child deal | "Kiko Milano (Change Order#1)" (CE-2026-1290) | ₱35,000 |

Same store, same amount → almost certainly one physical CO keyed twice. The ₱35,000 is
counted twice in the raw value sum (once baked into the parent's rolled value, once as the
child deal). A second Kiko addendum ("Kiko Rockwell Store", ₱41,850) has no child twin and
is presumed legitimate. All other 31 child-deal COs sit on parents with no rolled addenda,
so each is counted exactly once. **Blast radius: one project, ~₱35,000.**

Impact on §3: "raw value sum is the correct number" holds ONLY after this duplicate is
removed. Until then raw value all-time is overstated by ~₱35,000
(true ≈ ₱95,421,523.62 vs shown ₱95,456,523.62).

## 4. Correction owed on the shipped fix (`dd39d6b`)

That commit changed the reports' TOTAL row and KPI to `sum(salesPeriods.wonValue)`, which
uses the `dealBase + pco` formula — the very one that double-counts rolled addenda after
reload. It made TOTAL agree with the rows (good), but both now sit on the fragile formula.
Net effect on the 2026 figure: **+₱76,850 overstatement** after a reload.

Given the goal is "COs in, counted once," the canonical helper (§5) should resolve to the
**raw value sum**, and the reports should adopt it — effectively reverting the `+pco`
direction. This is small in pesos (0.08%) but it is a correctness principle, and it means
the refactor SUPERSEDES rather than builds on `dd39d6b`.

## 5. Target design

Add pure, tested helpers to `src/core.js` (already the home of `coSignedValue`,
`calcTax`, `WON_STAGES`) and route every surface through them:

```js
// src/core.js
export const isWonDeal   = (d) => WON_STAGES.includes(d.stage);
export const dealValue   = (d) => Number(d?.value) || 0;            // value = base + rolled COs
export const wonValue    = (deals) => deals.filter(isWonDeal).reduce((s,d)=>s+dealValue(d),0);
export const pipelineValue= (deals) => deals.filter(d=>isActivePipeline(d.stage)).reduce((s,d)=>s+dealValue(d),0);
// Optional scoping wrapper used by reports:
export const wonValueInYear = (deals, year, awardDateOf) => wonValue(
  deals.filter(d => { const dt = awardDateOf(d); return dt && new Date(dt).getFullYear()===year; })
);
```

Rules the helpers enforce (so no caller re-derives them):
- **Never** re-add rolled addenda on top of `value`.
- Child deals count once, as themselves.
- One formatter (`src/core.js` peso formatter, whole-peso by default) for all money display.

Then replace the ~15 ad-hoc `reduce((s,d)=>s+Number(d.value||0),0)` sites (inventory in §6)
with calls to these helpers.

## 6. Work breakdown

| # | Task | Files | Est. |
|---|---|---|---|
| 0 | **Data audit** — DONE (§3b): found 1 cross-mechanism duplicate on Kiko Milano | SQL only | ✅ |
| 0b | **Data cleanup** — billing audit (below) shows the CHILD deal is the live/billed record and the two addenda are empty approved shells. Rec: keep child "Change Order#1", set the two Kiko addenda to Rejected (drops the ₱76,850 phantom; reversible). Confirm with encoder first: (a) is "Hanging Light Signage" the same work as the child, (b) is the ₱41,850 addendum real WIP or abandoned. Entry guard: DONE (`findCrossMechanismCO`, `src/core.js`, wired into all 3 CO paths). | data + `src/App.jsx` | 0.5d |

Billing evidence (Kiko Milano Rockwell Store): child "Change Order#1" ₱35,000 has
two Draft/unpaid milestones (INV-1709/1710); both addenda (₱35,000 + ₱41,850,
Approved) have NO billing milestones; the parent's own 50/40/10 schedule on
₱502,040.30 has no "Change Order —" lines, so the addenda were never billed into
it. This reverses the earlier "keep the addendum, drop the child" note.
| 1 | Add + unit-test helpers (`isWonDeal`, `dealValue`, `wonValue`, `pipelineValue`, `wonValueInYear`, one peso formatter) | `src/core.js`, new `src/core.test.*` | 1d |
| 2 | Route **reports** through helpers; supersede `dd39d6b`'s `+pco` path; keep scope labels | `src/App.jsx` ~11187–11674 | 1d |
| 3 | Route **Sales Pipeline** cards, dashboards, TV/Sales-Value views, client rollups | `src/App.jsx` (sites in §6a) | 1d |
| 4 | Decide + document CO model: keep dual (child deals + addenda) or converge; if kept, write the reconciliation rule down in `change-order-billing-spec.md` | docs + code | 0.5–3d |
| 5 | Regression pass: snapshot every "value" number before/after on a copy of prod data; verify before/after-reload parity | manual + SQL | 0.5d |

### 6a. Call-site inventory (grep-verified, `src/App.jsx` unless noted)
`core.js:457 coSignedValue` · `6970 pipeVal` · `9206 myRev` · `10426 / 10704 totalPipeVal` ·
`10705 awardedVal` · `10899 salesData(by month)` · `11251 / 11256 data-flag stakes` ·
`11268 salesPeriods` · `11637 Pipeline KPI` · `12557–12558 pipeline cards` ·
`13465 / 13469 dashboard` · `19476 / 19524 client rollups` · `27504 avgDeal`.

## 7. Decisions needed from you

1. **Canonical definition = raw value sum (base + rolled COs + child-deal COs, each once)?**
   Recommended. Confirms COs are in, and it's the only definition that survives a reload.
2. **CO data model** — leave the dual model (child deals *and* addenda) and just document
   the reconciliation, or invest in converging to one? Money-at-stake says the dual model
   works today; convergence is a bigger, separate project.
3. **Accept that this supersedes `dd39d6b`** — i.e. the reports drop the `+pco` re-add.
   Net change to the visible 2026 figure: −₱76,850.

## 8. Explicitly out of scope
- VAT / ex-VAT base reporting (already handled by `calcTax`/`dealTax`).
- Billing/collection totals.
- Converging the CO model (unless decision #2 says yes).
