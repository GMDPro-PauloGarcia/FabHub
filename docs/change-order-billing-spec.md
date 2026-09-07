# Change Order / Addendum — Billing Spec

**Status:** Approved direction (Paulo, Manager) — pending implementation + running-app test.
**Scope:** How a Change Order (addendum) is created, approved, and billed within a project.
**Reference mockup:** proposed Billing layout — original contract + per-CO claim within one project.

---

## 1. The rule in one line

A scope change on a won project is an **addendum on that project**, never a separate deal.
Its value **rolls up** into the revised contract for reporting, but it is **billed as its own
separate claim** — never blended into the original contract's billing schedule.

## 2. Standard flow (Path A only)

1. **Operations** raises the scope change on the Project Card → **➕ Scope Change** modal
   (title, description, value, Additive/Deductive).
2. **BOQ** for the CO is built through the modal / BOQ Builder. VAT treatment is inherited
   from the parent contract's BOQ (see §5) — not a free per-CO choice.
3. **Sales approves** the CO in the pipeline (Sales is in contact with the client and holds
   the written client approval).
4. On **Sales-Approved**, the CO becomes billable and **Finance raises the claim** — a separate
   billing line, immediately.

The "Link to Parent Deal" / linked-child-deal route is **not** used for scope changes.
(It remains only for umbrella POs and genuine pre-award extensions.)

## 3. Contract math

```
Original Contract        +  Approved Change Orders   =  Revised Contract Value
(base billing schedule)     (each its own claim)         (roll-up, reporting only)
```

Example — Filbars · SM North EDSA:

| Line                     |        Base (VATex) |
|--------------------------|--------------------:|
| Original Contract        |          ₱5,000,000 |
| ＋ Change Order #1        |            ₱819,000 |
| **Revised Contract**     |      **₱5,819,000** |

The revised total is a **display roll-up**. Billing never splits milestones against it.

## 4. Billing changes required (implementation)

1. **Trigger.** Move the CO billing-line creation from `Billed`/`Collected` → **`Approved`**
   (align it with the moment the value rolls into the contract). Ref: `syncCoBilling`,
   `src/App.jsx:6134`; roll-in `updateAddendum`/`rollDealContract`, `src/App.jsx:6172,6119`.
2. **Base schedule bills original only.** `generateBillingSchedule` must split against the
   **original** contract value, never the blended `deal.value`. Ref: `src/App.jsx:5806`.
   This closes the double-billing exposure (blended schedule + CO milestone).
3. **Reconciliation guard.** Billing must not double-count a CO already carried as its own
   milestone (mirror the Sales report guard at `src/App.jsx:11092`).
4. **VAT inheritance enforced** (see §5).

## 5. VAT / tax

- Model is **VAT-exclusive (VATex)**: base + 12% VAT (OR only), less 2% EWT where withholding
  applies. Ref: `calcTax`, `src/core.js:377`.
- A CO **inherits the parent's receipt type and VAT treatment** — never taxed on a different
  basis than its project. Defaults confirmed: **OR, 12% VAT, 2% EWT.**
- Per-block net (example): base net ₱5,500,000 ＋ CO net ₱900,900 = **₱6,400,900** collectible.

## 6. Project Card — signal, not a second form

Do **not** add a billing-creation form to the Project Card (avoids two billing entry points
drifting out of sync). Instead:

- When a CO is **Approved-and-unclaimed**, show a **"CO approved — raise claim"** flag on the
  card that deep-links into the Billing view **prefilled** for that CO (a shortcut into the one
  billing engine).
- The Finance Snapshot on the card shows the **breakdown** (Original ＋ CO = Revised), not a
  single blended number.
- All actual billing creation stays in `BillingView` (`src/App.jsx:23756`), gated to
  Manager / Finance / FinanceAssistant / SalesOpsAdmin.

## 7. Confirmed decisions

- CO bills as a **single 100% claim** on approval (not its own DP/progress split).
- Defaults **OR + 12% VAT + 2% EWT**, inherited from parent.
- One entry point for scope changes (Project Card → ➕ Scope Change).

## 8. Open blocker

- **Who deploys FabHub?** These are changes to a live system; nothing ships until the
  merge + deploy owner is identified. This spec is the handoff document for that person.

## 8b. Implementation status

- ✅ **#1 Trigger** — CO billing milestone now created at **Approved** (`syncCoBilling`
  called with `ADDENDUM_ROLLED`), not left until "Billed".
- ✅ **#2 Base = original** — `generateBillingSchedule` (and the Billing setup preview)
  split the **original** contract (`deal.originalValue` when a CO has rolled in), never the
  blended `deal.value`.
- ✅ **#3 No double-count** — achieved structurally by #2 (base = original) + per-CO
  milestones; no separate runtime guard needed.
- ✅ **#4 VAT inheritance** — the CO milestone takes `receiptType` / `withholding` from the
  **parent deal**, not the CO's own fields.
- ⏳ **#6 Card "raise claim" signal + snapshot breakdown** — deferred to a follow-up
  (UI only; the billing engine above is the correctness-critical part). The Billing view
  already renders the per-CO breakdown via `ContractBreakdown`.

⚠️ **Not verified in a running app** — authored without a build/test environment. Must be
clicked through in the Vercel preview (approve a CO → confirm one separate CO milestone
appears, base schedule unchanged, VAT matches the parent) before merge.

## 9. Related work already on branch `claude/missing-addendums-yyy2lz`

- Unconverted linked child deals now surface in the Change Order Log tagged
  "⇄ needs conversion" (`src/App.jsx` AddendaPageContent).
- Handbook "Logging a Scope Change (Addendum)" rewritten to teach Path A only
  (`public/handbook.html`).
