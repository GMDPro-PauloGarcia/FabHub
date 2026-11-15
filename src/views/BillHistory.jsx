// Bill History (Paulo, 2026-11-15: "there should be a history for each").
//
// One bill's story: what the bill itself says (entered, approved, each payment)
// and every change kept in audit_log — the bill's own edits plus its payments'
// (recorded, edited, cancelled, deleted). The database writes those rows
// (trg_audit_payables / trg_audit_payable_payments, migration
// 20261115020000_bills_payments_audit.sql); this screen only reads them.
// audit_log is readable by Managers, Finance, Accounting and FinanceAssistant;
// other roles see the bill's own record only.
//
// Open it from anywhere with openBillHistory(bill). Its open state lives in a
// tiny store outside React state (like Cash Out), so opening it doesn't
// re-render App.
import React, { useEffect, useState, useSyncExternalStore } from "react";
import { supabase, isSupabaseReady } from "../supabaseClient";

let store = { bill: null, seq: 0 };
const subs = new Set();
const emit = () => subs.forEach(f => f());
const subscribe = f => { subs.add(f); return () => subs.delete(f); };
const snap = () => store;
export const openBillHistory = bill => { store = { bill, seq: store.seq + 1 }; emit(); };
const close = () => { store = { ...store, bill: null }; emit(); };

// Day recording started; earlier changes only exist as special events.
export const BILL_AUDIT_SINCE = "2026-11-15";

const bhPeso = v => "₱" + (Number(v) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const bhWhen = t => { if (!t) return "—"; const d = new Date(t); return isNaN(d) ? String(t) : d.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }); };
const MONEY = new Set(["amount", "paid_amount", "retention_held", "retention_amount", "input_vat", "net_amount", "ewt_amount"]);
const LABEL = {
  amount: "Amount", vendor: "Supplier", due_date: "Due date", status: "Status", paid_amount: "Paid", paid_date: "Paid on",
  approval_status: "Approval", approved_by: "Approved by", approved_at: "Approved at", invoice_number: "Supplier invoice no.",
  invoice_ref: "Invoice ref", invoice_date: "Invoice date", po_number: "PO / WO no.", po_id: "PO / WO", notes: "Notes",
  pay_method: "Pay method", pay_ref: "Pay reference", pay_bank: "Pay bank", account_code: "Account", project_id: "Project",
  ap_number: "AP no.", category: "Category", verified: "Received / certified", verification_pct: "Certified %",
  retention_held: "Retention held", ewt_rate: "EWT rate", ewt_amount: "EWT", doc_type: "Type",
  pay_date: "Payment date", method: "Method", bank: "Bank", ref_no: "Reference", note: "Note", cancel_reason: "Cancel reason",
  cancelled_by: "Cancelled by", cancelled_at: "Cancelled at", retention_amount: "Retention", kind: "Kind",
  invoice_doc_path: "Invoice file", docs_override_reason: "Docs override reason",
};
const HIDE = new Set(["updated_at", "created_at"]);
const fmtVal = (k, v) => {
  if (v === null || v === undefined || v === "") return "—";
  if (MONEY.has(k)) return bhPeso(v);
  if (typeof v === "boolean") return v ? "Yes" : "No";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return s.length > 80 ? s.slice(0, 77) + "…" : s;
};
const ACTION = {
  insert: { t: "Entered", c: "#2563eb" }, update: { t: "Changed", c: "#d97706" }, delete: { t: "Deleted", c: "#dc2626" },
  restore: { t: "Restored", c: "#059669" }, cancel: { t: "Cancelled", c: "#dc2626" },
};

export default function BillHistoryModal({ payPays = [] }) {
  const s = useSyncExternalStore(subscribe, snap, snap);
  const bill = s.bill;
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!bill) return;
    let live = true;
    setRows(null); setErr("");
    (async () => {
      if (!isSupabaseReady()) { if (live) { setRows([]); setErr("No server connection, so the change history can't load."); } return; }
      const id = String(bill.id);
      const [a, b] = await Promise.all([
        supabase.from("audit_log").select("*").eq("table_name", "payables").eq("record_id", id).order("performed_at", { ascending: false }).limit(200),
        supabase.from("audit_log").select("*").eq("table_name", "payable_payments").or(`snapshot->>payable_id.eq.${id},old_snapshot->>payable_id.eq.${id}`).order("performed_at", { ascending: false }).limit(200),
      ]);
      if (!live) return;
      const e = a.error || b.error;
      if (e) setErr(/permission|policy|denied/i.test(e.message) ? "Only Managers, Finance, Accounting and Finance Assistants can see the change history." : e.message);
      setRows([...(a.data || []), ...(b.data || [])].sort((x, y) => String(y.performed_at).localeCompare(String(x.performed_at))));
    })();
    return () => { live = false; };
  }, [bill, s.seq]);

  if (!bill) return null;
  const mob = typeof window !== "undefined" && window.innerWidth < 768;
  const pays = payPays.filter(p => String(p.payableId) === String(bill.id)).sort((x, y) => String(x.payDate).localeCompare(String(y.payDate)));
  const fact = (label, value, sub) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "7px 0", borderBottom: "1px solid #f1f5f9", fontSize: ".8rem" }}>
      <span style={{ color: "#64748b" }}>{label}</span>
      <span style={{ textAlign: "right", color: "#0f172a", fontWeight: 600 }}>{value}{sub && <div style={{ fontSize: ".7rem", color: "#94a3b8", fontWeight: 400 }}>{sub}</div>}</span>
    </div>
  );

  return (
    <div role="dialog" aria-modal="true" aria-label="Bill history"
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", zIndex: 1000, display: "flex", alignItems: mob ? "flex-end" : "center", justifyContent: "center", padding: mob ? 0 : 16 }}
      onClick={mob ? undefined : close}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: mob ? "18px 18px 0 0" : 16, padding: mob ? "18px 14px 26px" : 22, width: "100%", maxWidth: 720, maxHeight: "92vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(15,23,42,.28)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "#0f172a" }}>🕘 History · {bill.apNumber || "Bill"}</div>
            <div style={{ fontSize: ".78rem", color: "#64748b", marginTop: 2 }}>{bill.vendor || "—"} · {bill.poId || bill.poNumber || bill.invoiceNumber || bill.invoiceRef || "no PO"} · {bhPeso(bill.amount)}</div>
          </div>
          <button onClick={close} aria-label="Close" style={{ background: "#f1f5f9", border: "none", borderRadius: 8, width: 32, height: 32, cursor: "pointer", color: "#64748b", fontSize: "1rem", flexShrink: 0 }}>✕</button>
        </div>

        <div style={{ fontSize: ".68rem", fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: ".06em", margin: "6px 0 4px" }}>On the bill</div>
        {fact("Entered", bill.createdBy || "—", bill.createdAt || "")}
        {fact("Approval", bill.approvalStatus || "—", bill.approvedBy ? `by ${bill.approvedBy}${bill.approvedAt ? " · " + bhWhen(bill.approvedAt) : ""}` : "")}
        {fact("Paid", `${bhPeso(bill.paidAmount)} of ${bhPeso(bill.amount)}`, bill.status || "")}
        {pays.map(p => fact(
          `${p.kind === "Retention" ? "Retention release" : "Payment"} ${p.payDate || ""}`,
          <span style={{ textDecoration: p.status === "Cancelled" ? "line-through" : "none", color: p.status === "Cancelled" ? "#94a3b8" : undefined }}>{bhPeso(p.amount)}</span>,
          [p.method, p.bank, p.refNo].filter(Boolean).join(" · ") + (p.recordedBy ? ` · recorded by ${p.recordedBy}` : "") + (p.status === "Cancelled" ? ` · cancelled by ${p.cancelledBy || "—"}: ${p.cancelReason || "no reason"}` : "")
        ))}

        <div style={{ fontSize: ".68rem", fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: ".06em", margin: "16px 0 6px" }}>Every change</div>
        {err && <div style={{ fontSize: ".78rem", color: "#b45309", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "8px 10px", marginBottom: 8 }}>{err}</div>}
        {rows === null && <div style={{ fontSize: ".8rem", color: "#94a3b8", padding: "10px 0" }}>Loading…</div>}
        {rows && rows.length === 0 && !err && <div style={{ fontSize: ".8rem", color: "#94a3b8", padding: "10px 0" }}>No changes recorded for this bill since {BILL_AUDIT_SINCE}.</div>}
        {rows && rows.length > 0 && (
          <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {rows.map(r => {
              const a = ACTION[r.action] || { t: r.action || "Event", c: "#475569" };
              const onPay = r.table_name === "payable_payments";
              const fields = (r.changed_fields || []).filter(f => !HIDE.has(f));
              const snapAmt = (r.snapshot || r.old_snapshot || {}).amount;
              return (
                <li key={r.id} style={{ borderLeft: `3px solid ${a.c}`, padding: "6px 0 8px 12px", marginBottom: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", fontSize: ".8rem" }}>
                    <span><b style={{ color: a.c }}>{a.t}</b> <span style={{ color: "#0f172a", fontWeight: 600 }}>{onPay ? `payment${snapAmt != null ? " " + bhPeso(snapAmt) : ""}` : "bill"}</span>{r.reason ? <span style={{ color: "#64748b" }}> · {r.reason}</span> : null}</span>
                    <span style={{ color: "#64748b", whiteSpace: "nowrap" }}>{r.performed_by || "—"} · {bhWhen(r.performed_at)}</span>
                  </div>
                  {r.action === "update" && fields.length > 0 && (
                    <div style={{ marginTop: 4, display: "grid", gap: 2 }}>
                      {fields.map(f => (
                        <div key={f} style={{ fontSize: ".74rem", color: "#475569", overflowWrap: "anywhere" }}>
                          {LABEL[f] || f}: <span style={{ color: "#94a3b8", textDecoration: "line-through" }}>{fmtVal(f, r.old_snapshot?.[f])}</span> → <b style={{ color: "#0f172a" }}>{fmtVal(f, r.snapshot?.[f])}</b>
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        <div style={{ fontSize: ".7rem", color: "#94a3b8", marginTop: 12, lineHeight: 1.5 }}>
          The database records every change to bills and payments from {BILL_AUDIT_SINCE}: who did it (from their login) and the values before and after. Before that only special events were kept (renumbering, bulk approval, approval resets, duplicate overrides, deletes with a reason). Deleted bills can be restored from Audit Trail.
        </div>
      </div>
    </div>
  );
}
