// Cash Out — the one modal for money leaving GMD (Paulo, 2026-11-11).
//
// Every way FabHub commits or pays out money starts here: a Purchase Order, a
// Subcon Work Order, a supplier bill (AP), a subcon progress billing, a payment
// request with no PO (PRV), and paying approved bills. The modal is only the
// door: each option renders the existing form, and every save still goes
// through the same guarded functions (PO approval tiers and the DP rule in
// ProcurementView2 / SubconWOView, savePayable, recordPayments) and the same
// database triggers. Never add money rules here.
//
// Open it from anywhere with openCashOut(kind, payload). It keeps its own open
// state in a tiny store outside React state, so opening it and typing in it do
// not re-render the whole App (that is what made the old Payables modal slow).
import React, { useState, useMemo, useSyncExternalStore } from "react";

let store = { open: false, kind: null, payload: null, seq: 0 };
const subs = new Set();
const emit = () => subs.forEach(f => f());
const subscribe = f => { subs.add(f); return () => subs.delete(f); };
const snap = () => store;

// kind: null (show the picker) | "po" | "wo" | "bill" | "subcon" | "prv" | "pay"
// payload: {form, id} to open the bill form pre-filled or to edit a bill
// (id set = editing; the picker is hidden).
export const openCashOut = (kind = null, payload = null) => {
  store = { open: true, kind, payload, seq: store.seq + 1 };
  emit();
};
export const closeCashOut = () => { store = { ...store, open: false }; emit(); };
// Kind ids this user can open, set each time the modal renders. A page button
// checks cashOutHas(kind) and keeps its own form for roles without that option.
let available = new Set();
export const cashOutHas = kind => available.has(kind);
const switchKind = kind => { store = { ...store, kind, payload: null, seq: store.seq + 1 }; emit(); };

const GROUPS = [
  { id: "order", l: "Order (commit money)" },
  { id: "bill", l: "Bill (money owed)" },
  { id: "pay", l: "Pay (money out)" },
];

const coPeso = v => "₱" + Number(v || 0).toLocaleString("en-PH", { maximumFractionDigits: 0 });

// kinds: [{id, group, icon, label, desc, wide, render:(payload, close)=>node}],
// already filtered to what this role may do.
export default function CashOutModal({ kinds = [] }) {
  const s = useSyncExternalStore(subscribe, snap, snap);
  available = new Set(kinds.map(k => k.id));
  if (!s.open || !kinds.length) return null;
  const mob = typeof window !== "undefined" && window.innerWidth < 768;
  const editing = !!s.payload?.id;
  const cur = kinds.find(k => k.id === s.kind) || null;
  const wide = !cur || cur.wide;
  const title = editing ? (cur?.editLabel || "Edit bill") : cur ? cur.label : "Cash Out";
  return (
    <div role="dialog" aria-modal="true" aria-label={title}
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", zIndex: 1000, display: "flex", alignItems: mob ? "flex-end" : "center", justifyContent: "center", padding: mob ? 0 : 16 }}
      onClick={mob ? undefined : closeCashOut}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: mob ? "18px 18px 0 0" : 18, padding: mob ? "18px 14px 26px" : 24, width: "100%", maxWidth: wide ? 1120 : 560, maxHeight: mob ? "94vh" : "94vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(15,23,42,.28)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            {cur && !editing && kinds.length > 1 && (
              <button onClick={() => switchKind(null)} style={{ background: "#f1f5f9", border: "none", borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontFamily: "inherit", fontSize: ".78rem", fontWeight: 700, color: "#334155" }}>← Cash Out</button>
            )}
            <div style={{ fontWeight: 800, fontSize: "1.1rem", color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cur ? `${cur.icon} ${title}` : "💸 Cash Out"}</div>
          </div>
          <button onClick={closeCashOut} aria-label="Close" style={{ background: "#f1f5f9", border: "none", borderRadius: 8, width: 32, height: 32, cursor: "pointer", color: "#64748b", fontSize: "1rem", flexShrink: 0 }}>✕</button>
        </div>
        {!cur ? <Picker kinds={kinds} /> : (
          <div key={s.seq}>{cur.render(s.payload, closeCashOut)}</div>
        )}
      </div>
    </div>
  );
}

function Picker({ kinds }) {
  return (
    <div>
      <div style={{ fontSize: ".82rem", color: "#475569", marginBottom: 14 }}>What is this money for? Each option opens the usual form, with the usual approvals.</div>
      {GROUPS.map(g => {
        const ks = kinds.filter(k => k.group === g.id);
        if (!ks.length) return null;
        return (
          <div key={g.id} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: ".66rem", fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>{g.l}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 10 }}>
              {ks.map(k => (
                <button key={k.id} onClick={() => switchKind(k.id)}
                  style={{ textAlign: "left", background: "#f8fafc", border: "1.5px solid #e2e8f0", borderRadius: 12, padding: "12px 14px", cursor: "pointer", fontFamily: "inherit" }}>
                  <div style={{ fontWeight: 800, color: "#0f172a", fontSize: ".9rem" }}>{k.icon} {k.label}</div>
                  <div style={{ fontSize: ".74rem", color: "#64748b", marginTop: 4, lineHeight: 1.45 }}>{k.desc}</div>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Pick the PO / Work Order a bill is for. rows come from buildOrders
// (src/data/ledger.js); onPick(row) opens the bill form pre-filled from it.
export function OrderPicker({ rows = [], onPick, onManual, manualLabel, empty = "Nothing to bill." }) {
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(40);
  const list = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return rows.filter(r => !qq || [r.no, r.vendor, ...(r.projectNames || [])].some(v => String(v || "").toLowerCase().includes(qq)));
  }, [rows, q]);
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <input value={q} onChange={e => { setQ(e.target.value); setLimit(40); }} placeholder="Search PO / WO no., supplier or project…" autoFocus
          style={{ flex: 1, minWidth: 200, border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "9px 12px", fontFamily: "inherit", fontSize: ".85rem" }} />
        {onManual && <button onClick={onManual} style={{ background: "#fff", border: "1.5px solid #0B2545", color: "#0B2545", borderRadius: 8, padding: "8px 12px", fontFamily: "inherit", fontWeight: 700, fontSize: ".8rem", cursor: "pointer" }}>{manualLabel || "Enter without a PO"}</button>}
      </div>
      {list.length === 0 && <div style={{ padding: "24px 0", textAlign: "center", color: "#94a3b8", fontSize: ".84rem" }}>{empty}</div>}
      <div style={{ border: list.length ? "1px solid #e2e8f0" : "none", borderRadius: 10, overflow: "hidden" }}>
        {list.slice(0, limit).map(r => {
          const left = Math.max(0, (Number(r.amount) || 0) - (Number(r.billed) || 0));
          return (
            <button key={r.kind + r.no} onClick={() => onPick(r)}
              style={{ display: "flex", width: "100%", gap: 10, alignItems: "center", justifyContent: "space-between", textAlign: "left", background: "#fff", border: "none", borderBottom: "1px solid #f1f5f9", padding: "10px 12px", cursor: "pointer", fontFamily: "inherit" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: "#0f172a", fontSize: ".84rem" }}><span style={{ fontFamily: "monospace" }}>{r.no}</span> · {r.vendor || "—"}</div>
                <div style={{ fontSize: ".72rem", color: "#64748b", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{(r.projectNames || []).join(", ") || "No project"} · {r.status}{r.kind === "WO" ? ` · billed ${coPeso(r.billed)}` : ""}</div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontWeight: 800, color: "#0B2545", fontSize: ".86rem" }}>{coPeso(r.amount)}</div>
                {r.kind === "WO" && <div style={{ fontSize: ".7rem", color: "#64748b" }}>left {coPeso(left)}</div>}
              </div>
            </button>
          );
        })}
      </div>
      {list.length > limit && <button onClick={() => setLimit(l => l + 40)} style={{ marginTop: 8, background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: ".8rem" }}>Show more ({list.length - limit})</button>}
    </div>
  );
}
