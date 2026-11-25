// Daily Activity (Paulo, 2026-11-25: "a modal for managers on AUDIT or
// transaction on what happened per day").
//
// One Manila day, everything FabHub recorded that day, newest first:
//   • audit_log — every change the database kept (billing, bills, POs, WOs,
//     deals, JOs, loans, progress, blocked writes, overrides, deletes);
//   • cash_positions_history — every Daily Cash Position save;
//   • rows created that day in tables whose inserts audit_log does not keep
//     (PO lines, work orders, deals, supplier payments, liquidations);
//   • activity_log — Team Updates (off by default: it repeats most of the above).
// Read-only. Managers only (the button is shown to Managers; audit_log itself
// is also readable by Finance roles under RLS, so nothing new is exposed).
//
// "Needs a look" flags what a Manager should check: deletes, blocked writes,
// overrides, waivers, turnover moves, role changes, edits to a cash day after
// it locked, and anything done between 10 PM and 6 AM.
//
// Open with openDailyActivity(dateISO?). Its open state lives in a small store
// outside React state (like Bill History), so opening it doesn't re-render App.
import React, { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { supabase, isSupabaseReady } from "../supabaseClient";

const manilaToday = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const addDays = (d, n) => { const t = new Date(d + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

let store = { date: null, seq: 0 };
const subs = new Set();
const emit = () => subs.forEach(f => f());
const subscribe = f => { subs.add(f); return () => subs.delete(f); };
const snap = () => store;
export const openDailyActivity = (date) => { store = { date: date || manilaToday(), seq: store.seq + 1 }; emit(); };
const close = () => { store = { ...store, date: null }; emit(); };

const daPeso = v => "₱" + (Number(v) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hhmm = t => { const d = new Date(t); return isNaN(d) ? "—" : d.toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" }); };
const manilaHour = t => { const d = new Date(t); return isNaN(d) ? 12 : (d.getUTCHours() + 8) % 24; };

const AREA = {
  billing_milestones: "Billing", billing_payments: "Billing", billing_deductions: "Billing", client_credit_terms: "Billing",
  payables: "Bills & payments", payable_payments: "Bills & payments", payment_runs: "Bills & payments", liquidations: "Bills & payments",
  purchase_requests: "Purchasing", subcon_work_orders: "Purchasing", material_budgets: "Purchasing",
  deals: "Deals & projects", job_orders: "Deals & projects", project_cards: "Deals & projects",
  cash_positions: "Cash sheet", loans: "Cash sheet", loan_payments: "Cash sheet", loan_schedule: "Cash sheet", expenses: "Cash sheet",
  user_profiles: "Users", activity_log: "Team updates",
};
const AREAS = ["Billing", "Bills & payments", "Purchasing", "Deals & projects", "Cash sheet", "Users", "Other", "Team updates"];
const THING = {
  billing_milestones: "invoice / milestone", billing_payments: "client payment", payables: "supplier bill", payable_payments: "supplier payment",
  payment_runs: "payment run", purchase_requests: "PO line", subcon_work_orders: "work order", deals: "deal", job_orders: "JO",
  project_cards: "project", loans: "loan", loan_payments: "loan payment", loan_schedule: "loan schedule", expenses: "expense",
  user_profiles: "user", client_credit_terms: "client credit terms", liquidations: "liquidation", cash_positions: "cash sheet",
};
const VERB = { insert: "Created", update: "Changed", delete: "Deleted", restore: "Restored", cancel: "Cancelled", blocked: "Blocked" };
const FLAG_ACTIONS = /delete|blocked|override|waiv|turnover_change|role_change|credit_terms|bulk_|renumber|cancel|reverse/i;
const HIDE_FIELDS = new Set(["updated_at", "created_at"]);
const lc = s => String(s || "").toLowerCase();
// audit rows written by database jobs (cron, triggers with no login) carry no
// username; they are not a person working late.
const SYSTEM_WHO = /^(|unknown|system|postgres|service_role)$/i;

export default function DailyActivityModal({ deals = [], billings = [] }) {
  const s = useSyncExternalStore(subscribe, snap, snap);
  const date = s.date;
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [area, setArea] = useState("All");
  const [who, setWho] = useState("All");
  const [onlyFlags, setOnlyFlags] = useState(false);
  const [withTeam, setWithTeam] = useState(false);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(null);

  const dealName = useMemo(() => { const m = {}; deals.forEach(d => { m[d.id] = [d.ceNo, d.client].filter(Boolean).join(" · "); }); return m; }, [deals]);
  const msDeal = useMemo(() => { const m = {}; billings.forEach(b => { m[b.id] = b.dealId; }); return m; }, [billings]);

  useEffect(() => {
    if (!date) return;
    let live = true;
    setRows(null); setErr(""); setOpen(null);
    (async () => {
      if (!isSupabaseReady()) { if (live) { setRows([]); setErr("No server connection, so the day's activity can't load."); } return; }
      const from = `${date}T00:00:00+08:00`, to = `${addDays(date, 1)}T00:00:00+08:00`;
      const day = (t, col = "created_at", sel = "*") => supabase.from(t).select(sel).gte(col, from).lt(col, to).order(col, { ascending: false }).limit(1000);
      const res = await Promise.all([
        day("audit_log", "performed_at"),
        day("cash_positions_history", "performed_at"),
        day("purchase_requests", "created_at", "id,deal_id,item,supplier,qty,unit,estimated_cost,status,po_number,created_by,requested_by,created_at"),
        day("subcon_work_orders", "created_at", "id,wo_number,deal_id,subcontractor,contract_amount,status,requested_by,created_at"),
        day("deals", "created_at", "id,ce_no,client,stage,value,created_by,added_by,created_at"),
        day("payable_payments", "created_at", "id,payable_id,amount,pay_date,method,bank,ref_no,recorded_by,status,created_at"),
        day("liquidations", "created_at", "id,liq_no,requester_name,payee,purpose,amount,status,created_at"),
        day("activity_log", "created_at", "id,deal_id,action,detail,by,created_at"),
      ]);
      if (!live) return;
      const [au, cash, pr, wo, dl, pp, lq, act] = res.map(r => r.data || []);
      const firstErr = res.slice(0, 2).map(r => r.error).find(Boolean);
      if (firstErr) setErr(/permission|policy|denied/i.test(firstErr.message) ? "Your login can't read the audit log. Only Managers and Finance roles can." : firstErr.message);

      const out = [];
      const seen = new Set(au.filter(r => lc(r.action) === "insert").map(r => `${r.table_name}:${r.record_id}`));
      au.forEach(r => {
        const a = lc(r.action), sn = r.snapshot || r.old_snapshot || {};
        const dealId = sn.deal_id || sn.project_id || (r.table_name === "deals" ? r.record_id : null) || msDeal[sn.milestone_id];
        const fields = (r.changed_fields || []).filter(f => !HIDE_FIELDS.has(f));
        const amtOld = Number(r.old_snapshot?.amount), amtNew = Number(r.snapshot?.amount);
        out.push({
          key: "a" + r.id, at: r.performed_at, who: SYSTEM_WHO.test(r.performed_by || "") ? "System (server job)" : r.performed_by, table: r.table_name, area: AREA[r.table_name] || "Other",
          verb: VERB[a] || (a.charAt(0).toUpperCase() + a.slice(1)).replace(/_/g, " "), thing: THING[r.table_name] || r.table_name,
          ref: sn.invoice_no || sn.ap_number || sn.po_number || sn.wo_number || sn.jo_no || sn.ce_no || sn.ref_no || sn.liq_no || "",
          deal: dealName[dealId] || "",
          amount: a === "update" && Number.isFinite(amtOld) && Number.isFinite(amtNew) && amtOld !== amtNew ? [amtOld, amtNew] : (Number.isFinite(amtNew) ? amtNew : (Number.isFinite(amtOld) ? amtOld : null)),
          note: fields.length ? "Changed: " + fields.join(", ") + (r.reason && r.reason !== "field edit" ? " · " + r.reason : "") : (r.reason || ""),
          fields, old: r.old_snapshot, now: r.snapshot,
          flag: FLAG_ACTIONS.test(a) || /override|locked/i.test(r.reason || ""),
        });
      });
      cash.forEach(r => {
        const fields = (r.changed_fields || []).filter(f => !HIDE_FIELDS.has(f));
        const lateEdit = r.date && r.date < date; // a past cash day changed today = edited after its lock
        out.push({ key: "c" + r.id, at: r.performed_at, who: r.performed_by || "—", table: "cash_positions", area: "Cash sheet",
          verb: lateEdit ? "Changed past day" : (VERB[lc(r.action)] || r.action), thing: `cash sheet ${r.date || ""}`, ref: "", deal: "",
          amount: null, note: fields.length ? "Changed: " + fields.join(", ") : "", fields, old: r.old_row, now: r.new_row, flag: lateEdit });
      });
      const created = (rowsIn, table, map) => rowsIn.forEach(r => { if (!seen.has(`${table}:${r.id}`)) out.push({ key: table + r.id, at: r.created_at, table, area: AREA[table] || "Other", verb: "Created", thing: THING[table] || table, fields: [], flag: false, deal: "", ref: "", note: "", amount: null, ...map(r) }); });
      created(pr, "purchase_requests", r => ({ who: r.created_by || r.requested_by || "—", ref: r.po_number || "", deal: dealName[r.deal_id] || "", amount: (Number(r.qty) || 0) * (Number(r.estimated_cost) || 0), note: [r.item, r.supplier, r.status].filter(Boolean).join(" · ") }));
      created(wo, "subcon_work_orders", r => ({ who: r.requested_by || "—", ref: r.wo_number || "", deal: dealName[r.deal_id] || "", amount: Number(r.contract_amount) || 0, note: [r.subcontractor, r.status].filter(Boolean).join(" · ") }));
      created(dl, "deals", r => ({ who: r.created_by || r.added_by || "—", ref: r.ce_no || "", deal: r.client || "", amount: Number(r.value) || 0, note: r.stage || "" }));
      created(pp, "payable_payments", r => ({ who: r.recorded_by || "—", ref: r.ref_no || "", amount: Number(r.amount) || 0, note: [r.pay_date, r.method, r.bank, r.status].filter(Boolean).join(" · ") }));
      created(lq, "liquidations", r => ({ who: r.requester_name || "—", ref: r.liq_no || "", amount: Number(r.amount) || 0, note: [r.payee, r.purpose, r.status].filter(Boolean).join(" · ") }));
      act.forEach(r => out.push({ key: "t" + r.id, at: r.created_at, who: r.by || "—", table: "activity_log", area: "Team updates", verb: r.action || "Update", thing: "", ref: "", deal: dealName[r.deal_id] || "", amount: null, note: r.detail || "", fields: [], flag: false, team: true }));
      out.forEach(e => { const h = manilaHour(e.at); if (!e.team && e.who !== "System (server job)" && (h >= 22 || h < 6)) { e.flag = true; e.late = true; } });
      out.sort((x, y) => String(y.at).localeCompare(String(x.at)));
      setRows(out);
    })();
    return () => { live = false; };
  }, [date, s.seq, dealName, msDeal]);

  const base = useMemo(() => (rows || []).filter(e => withTeam || !e.team), [rows, withTeam]);
  const people = useMemo(() => {
    const m = {}; base.forEach(e => { const k = e.who || "—"; m[k] = m[k] || { n: 0, f: 0 }; m[k].n++; if (e.flag) m[k].f++; });
    return Object.entries(m).sort((a, b) => b[1].n - a[1].n);
  }, [base]);
  const shown = useMemo(() => base.filter(e =>
    (area === "All" || e.area === area) && (who === "All" || e.who === who) && (!onlyFlags || e.flag) &&
    (!q || lc([e.who, e.verb, e.thing, e.ref, e.deal, e.note].join(" ")).includes(lc(q)))
  ), [base, area, who, onlyFlags, q]);

  if (!date) return null;
  const mob = typeof window !== "undefined" && window.innerWidth < 768;
  const isToday = date === manilaToday();
  const flags = base.filter(e => e.flag).length;
  const money = k => base.filter(e => e.table === k && e.verb === "Created").reduce((s2, e) => s2 + (typeof e.amount === "number" ? e.amount : 0), 0);
  const chip = (on) => ({ border: "1px solid " + (on ? "#0B2545" : "#e2e8f0"), background: on ? "#0B2545" : "#fff", color: on ? "#fff" : "#475569", borderRadius: 20, padding: "4px 10px", fontSize: ".72rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" });
  const tile = (l, v, sub, warn) => (
    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "8px 10px" }}>
      <div style={{ fontSize: ".62rem", fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: ".05em" }}>{l}</div>
      <div style={{ fontSize: "1.05rem", fontWeight: 800, color: warn ? "#b91c1c" : "#0f172a" }}>{v}</div>
      {sub && <div style={{ fontSize: ".66rem", color: "#94a3b8" }}>{sub}</div>}
    </div>
  );
  const val = v => v === null || v === undefined || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v).slice(0, 80) : String(v).slice(0, 80);

  return (
    <div role="dialog" aria-modal="true" aria-label="Daily activity"
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", zIndex: 1000, display: "flex", alignItems: mob ? "flex-end" : "center", justifyContent: "center", padding: mob ? 0 : 16 }}
      onClick={mob ? undefined : close}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: mob ? "18px 18px 0 0" : 16, padding: mob ? "16px 12px 24px" : 20, width: "100%", maxWidth: 960, maxHeight: "94vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(15,23,42,.28)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "#0f172a" }}>📅 What happened</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button onClick={() => openDailyActivity(addDays(date, -1))} aria-label="Previous day" style={chip(false)}>‹</button>
            <input type="date" value={date} max={manilaToday()} onChange={e => e.target.value && openDailyActivity(e.target.value)}
              style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "4px 8px", fontFamily: "inherit", fontSize: ".8rem" }} />
            <button onClick={() => openDailyActivity(addDays(date, 1))} disabled={isToday} aria-label="Next day" style={{ ...chip(false), opacity: isToday ? .4 : 1 }}>›</button>
            <button onClick={close} aria-label="Close" style={{ background: "#f1f5f9", border: "none", borderRadius: 8, width: 32, height: 32, cursor: "pointer", color: "#64748b", fontSize: "1rem" }}>✕</button>
          </div>
        </div>

        {err && <div style={{ fontSize: ".78rem", color: "#b45309", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "8px 10px", marginTop: 10 }}>{err}</div>}
        {rows === null ? <div style={{ padding: 30, textAlign: "center", color: "#94a3b8" }}>Loading…</div> : (<>
          <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr 1fr" : "repeat(5,1fr)", gap: 8, marginTop: 12 }}>
            {tile("Changes", base.length, `${people.length} people`)}
            {tile("Needs a look", flags, "deletes, blocks, overrides, late-night", flags > 0)}
            {tile("Client payments in", daPeso(money("billing_payments")), "recorded today")}
            {tile("Supplier payments", daPeso(money("payable_payments")), "recorded today", money("payable_payments") === 0 && base.some(e => e.table === "cash_positions"))}
            {tile("POs raised", daPeso(money("purchase_requests")), `${base.filter(e => e.table === "purchase_requests" && e.verb === "Created").length} lines`)}
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12, alignItems: "center" }}>
            {["All", ...AREAS.filter(a => a !== "Team updates" || withTeam)].map(a => {
              const n = a === "All" ? base.length : base.filter(e => e.area === a).length;
              return (a === "All" || n > 0) && <button key={a} onClick={() => setArea(a)} style={chip(area === a)}>{a} {n}</button>;
            })}
            <button onClick={() => setOnlyFlags(v => !v)} style={{ ...chip(onlyFlags), borderColor: "#fecaca", ...(onlyFlags ? { background: "#b91c1c" } : { color: "#b91c1c" }) }}>⚑ Needs a look {flags}</button>
            <label style={{ fontSize: ".72rem", color: "#475569", display: "flex", alignItems: "center", gap: 4 }}>
              <input type="checkbox" checked={withTeam} onChange={e => setWithTeam(e.target.checked)} /> Team updates
            </label>
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            <select value={who} onChange={e => setWho(e.target.value)} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "5px 8px", fontFamily: "inherit", fontSize: ".78rem" }}>
              <option value="All">Everyone</option>
              {people.map(([p, c]) => <option key={p} value={p}>{p} ({c.n}{c.f ? `, ${c.f} ⚑` : ""})</option>)}
            </select>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search CE, PO, supplier, invoice…"
              style={{ flex: 1, minWidth: 160, border: "1px solid #e2e8f0", borderRadius: 8, padding: "5px 10px", fontFamily: "inherit", fontSize: ".78rem" }} />
          </div>

          <div style={{ overflowY: "auto", marginTop: 10, flex: 1, minHeight: 120 }}>
            {shown.length === 0 && <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: ".82rem" }}>Nothing recorded{area !== "All" || who !== "All" || onlyFlags || q ? " for this filter" : " on this day"}.</div>}
            {shown.map(e => (
              <div key={e.key} onClick={() => e.fields.length && setOpen(open === e.key ? null : e.key)}
                style={{ borderLeft: `3px solid ${e.flag ? "#dc2626" : "#cbd5e1"}`, padding: "6px 10px", marginBottom: 4, background: e.flag ? "#fef2f2" : "transparent", borderRadius: "0 8px 8px 0", cursor: e.fields.length ? "pointer" : "default" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: ".8rem", flexWrap: "wrap" }}>
                  <span style={{ minWidth: 0 }}>
                    <b style={{ color: e.flag ? "#b91c1c" : "#0f172a" }}>{e.verb}</b> <span style={{ color: "#334155" }}>{e.thing}</span>
                    {e.ref && <span style={{ color: "#1d4ed8", fontWeight: 600 }}> {e.ref}</span>}
                    {e.deal && <span style={{ color: "#64748b" }}> · {e.deal}</span>}
                    {e.amount != null && (Array.isArray(e.amount)
                      ? <span> · <s style={{ color: "#94a3b8" }}>{daPeso(e.amount[0])}</s> → <b style={{ color: "#b45309" }}>{daPeso(e.amount[1])}</b></span>
                      : e.amount ? <span style={{ fontWeight: 700 }}> · {daPeso(e.amount)}</span> : null)}
                  </span>
                  <span style={{ color: "#64748b", whiteSpace: "nowrap" }}>{e.who} · {hhmm(e.at)}{e.late ? " 🌙" : ""}</span>
                </div>
                {e.note && <div style={{ fontSize: ".72rem", color: "#64748b", marginTop: 2, overflowWrap: "anywhere" }}>{e.note}</div>}
                {open === e.key && (
                  <div style={{ marginTop: 4, display: "grid", gap: 2 }}>
                    {e.fields.map(f => (
                      <div key={f} style={{ fontSize: ".72rem", color: "#475569", overflowWrap: "anywhere" }}>
                        {f}: <s style={{ color: "#94a3b8" }}>{val(e.old?.[f])}</s> → <b style={{ color: "#0f172a" }}>{val(e.now?.[f])}</b>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div style={{ fontSize: ".66rem", color: "#94a3b8", marginTop: 8 }}>
            Read-only. Times are Manila. Bill and payment edits are recorded from 2026-11-15; PO-line and work-order creations come from the record itself, so a line deleted the same day only shows as its delete.
          </div>
        </>)}
      </div>
    </div>
  );
}
