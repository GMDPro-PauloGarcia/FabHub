// ─── DATA GUARD ──────────────────────────────────────────────────────────────
// Prompts that stop records being saved unlinked or mis-named (2026-11-21
// cleanup). The cleanup found 46 supplier names that didn't match the supplier
// list (e.g. "FCI" for FULL CREATIVE INNOVATION (FCI), easily confused with
// FCI MASINAG), bills citing PO numbers that don't exist, and bills with no
// project. These checks run in the app at the moment of typing or saving.
// They prompt; they don't silently fix. A person decides, and the reason is on
// screen.

const STOP = /\b(inc|incorporated|corp|corporation|co|company|trading|enterprises?|supply|supplies|sales|ph|philippines|the)\b/g;

export const normName = s => String(s || "")
  .toLowerCase()
  .replace(/[’']/g, "")
  .replace(/&/g, " and ")
  .replace(/[^a-z0-9 ]+/g, " ")
  .replace(STOP, " ")
  .replace(/\s+/g, " ")
  .trim();

const supName = s => String((s && (s.company_name || s.companyName)) || "").trim();

// Letters-only key, so "GRANDJADE" and "GRAND JADE" meet.
const squash = s => normName(s).replace(/ /g, "");

function similarity(a, b) {
  // Dice coefficient on character bigrams: cheap, good for typos and spacing.
  if (!a || !b) return 0;
  if (a === b) return 1;
  const grams = s => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1); } return m; };
  const A = grams(a), B = grams(b);
  let hit = 0; A.forEach((n, g) => { hit += Math.min(n, B.get(g) || 0); });
  const tot = Math.max(1, a.length - 1 + b.length - 1);
  return (2 * hit) / tot;
}

/**
 * Check a typed supplier name against the supplier list.
 * Returns { kind, exact, matches }:
 *   ok        – exactly one supplier has this name
 *   similar   – not in the list, but close to one or more suppliers
 *   ambiguous – a short name / abbreviation that fits more than one supplier
 *   new       – nothing close; it would be a new supplier
 *   empty     – nothing typed
 */
export function checkSupplier(name, suppliers = []) {
  const typed = String(name || "").trim();
  if (!typed) return { kind: "empty", matches: [] };
  const list = [...new Set((suppliers || []).map(supName).filter(Boolean))];
  const exact = list.find(n => n.toLowerCase() === typed.toLowerCase());
  const t = squash(typed), tn = normName(typed);
  const scored = list.map(n => {
    const k = squash(n), kn = normName(n);
    let s = similarity(t, k);
    // Abbreviation inside the name: "FCI" ⊂ "full creative innovation (fci)"
    if (tn.length >= 2 && (` ${kn} `).includes(` ${tn} `)) s = Math.max(s, 0.9);
    // One contains the other: "PENG-YONG" ⊂ "Peng-Yong Hardware & Construction Supply"
    if (t.length >= 4 && (k.includes(t) || t.includes(k))) s = Math.max(s, 0.88);
    // Initials: "BMMC" = B… M… M… C…
    const initials = kn.split(" ").map(w => w[0]).join("");
    if (t.length >= 2 && t.length <= 6 && initials.startsWith(t)) s = Math.max(s, 0.85);
    return { name: n, score: s };
  }).filter(x => x.name !== exact && x.score >= 0.72).sort((a, b) => b.score - a.score).slice(0, 4);

  if (exact) {
    // Exact, but a short name that also fits other suppliers is still worth a look.
    const others = tn.length <= 4 ? scored.filter(x => x.score >= 0.85) : [];
    return others.length ? { kind: "ambiguous", exact, matches: [exact, ...others.map(x => x.name)] } : { kind: "ok", exact, matches: [] };
  }
  if (scored.length >= 2 && tn.replace(/ /g, "").length <= 5) return { kind: "ambiguous", matches: scored.map(x => x.name) };
  if (scored.length) return { kind: "similar", matches: scored.map(x => x.name) };
  return { kind: "new", matches: [] };
}

/** Text for a confirm dialog before saving with a supplier that isn't an exact match. */
export function supplierSavePrompt(name, res) {
  const typed = String(name || "").trim();
  // An exact name from the list (e.g. "RGB" next to "RGB/VR CONCEPT", "MRDH"
  // next to "MRDH Glass & Aluminum Enterprises") is a valid pick: ask, never block.
  if (res.kind === "ambiguous" && res.exact) return {
    title: "Is this the right supplier?",
    message: `"${typed}" is in the supplier list, but these are close to it:\n\n• ${res.matches.filter(n => n !== res.exact).join("\n• ")}\n\nContinue if "${res.exact}" is the supplier on the invoice.`,
    confirmLabel: `Yes, ${res.exact}`,
    block: false,
  };
  if (res.kind === "ambiguous") return {
    title: "Which supplier is this?",
    message: `"${typed}" fits more than one supplier:\n\n• ${res.matches.join("\n• ")}\n\nPick the full name from the list so the bill, payments and reports land on the right supplier.`,
    block: true,
  };
  if (res.kind === "similar") return {
    title: "Supplier not in the list",
    message: `"${typed}" isn't in the supplier list. Did you mean:\n\n• ${res.matches.join("\n• ")}\n\nCancel to pick the right one. Continue only if this is a different supplier.`,
    confirmLabel: "It's a different supplier",
    block: false,
  };
  if (res.kind === "new") return {
    title: "New supplier?",
    message: `"${typed}" isn't in the supplier list and nothing similar is. Save it as a new supplier?\n\nUse the supplier's full registered name (as on their invoice), not a nickname or abbreviation.`,
    confirmLabel: "Yes, new supplier",
    block: false,
  };
  return null;
}

/** Checks a bill before save. Returns a list of {level:'block'|'warn', text}. */
export function checkBill(bill, { prs = [], swos = [], payables = [], deals = [] } = {}, editId = null) {
  const out = [];
  const po = String(bill.poNumber || "").trim();
  if (po) {
    const isWO = /^WO/i.test(po);
    const found = isWO ? (swos || []).some(w => w.woNumber === po) : (prs || []).some(p => p.poNumber === po);
    if (!found) out.push({ level: "warn", text: `${po} doesn't exist in FabHub. Check the number on the supplier's invoice, or raise the ${isWO ? "WO" : "PO"} first.` });
  }
  const pid = bill.projectId;
  if (!pid) {
    const overheadish = /utility|overhead|rent|salar|payroll|tax|bir|loan|office/i.test(`${bill.category || ""} ${bill.notes || ""}`);
    if (!overheadish && !po) out.push({ level: "warn", text: "No project or cost center. This cost won't show on any project's actual cost." });
  } else if (!(deals || []).some(d => d.id === pid)) {
    out.push({ level: "block", text: "The project on this bill no longer exists. Pick a live project." });
  }
  // Same supplier, same amount, but on a DIFFERENT PO within 45 days. The save
  // handler already catches the same invoice entered twice; this catches the
  // pattern the cleanup found (AP-2026-0828/0829: ₱5,006.40 each, PO-0669/0670).
  const amt = Math.round((Number(bill.amount) || 0) * 100) / 100;
  const v = normName(bill.vendor);
  if (v && amt > 0) {
    const day = s => { const t = Date.parse(s || ""); return isNaN(t) ? null : t / 864e5; };
    const now = day(bill.invoiceDate) ?? Date.now() / 864e5;
    const dup = (payables || []).find(p => p.id !== editId && !["Void", "Cancelled"].includes(p.status)
      && normName(p.vendor) === v
      && Math.round((Number(p.amount) || 0) * 100) / 100 === amt
      && String(p.poNumber || "") !== po
      && Math.abs((day(p.invoiceDate || p.createdAt) ?? now) - now) <= 45);
    if (dup) out.push({ level: "warn", text: `${dup.apNumber || "Another bill"} from ${dup.vendor} is also ₱${amt.toLocaleString("en-PH", { minimumFractionDigits: 2 })}${dup.poNumber ? ` (on ${dup.poNumber})` : ""}. Make sure this isn't the same delivery billed twice.` });
  }
  return out;
}
