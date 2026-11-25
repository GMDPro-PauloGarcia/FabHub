import React,{useState,useMemo} from "react";
import {Modal,addDaysLocalISO} from "../shared";
import {isCashPayment,projDisplayName} from "../core";
import {bankOf,bankLabel} from "../data/ledger";

// ─── 🔗 LINK A CASH-SHEET COLLECTION TO ITS BILLING PAYMENT(S) (2026-11-24) ──
// A collection row on the Daily Cash Position names the client payment(s) it
// is: `billingPaymentIds` on the row (or `notBilling`: loan proceeds, a
// transfer between GMD banks, a refund…). Applied as a normal edit of the
// sheet, saved with Save, so the day lock and edit rights still apply.
// Transaction History then links the deposit by these ids instead of guessing
// by amount, and shows any difference between the bank and Billing (e.g. EWT
// recorded as cash: Omnivores CE-2026-1069, ₱186,200 in the bank vs ₱190,000
// recorded). Payments are recorded in Billing first; this only points at them.

export const NOT_BILLING_KINDS=["Loan proceeds","Bank transfer (GMD to GMD)","Refund / reimbursement","Owner / capital","Other (not a client payment)"];
const r2=v=>Math.round((Number(v)||0)*100)/100;
const f2=v=>`₱${r2(v).toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const depKey=x=>`${String(x.p.refNo||"").replace(/\s+/g,"").toUpperCase()}|${x.date}|${bankOf(x.bank)?.id||x.bank}`;

export default function CollectionLinkModal({m,billings=[],deals=[],linkedElsewhere=new Map(),onApply,onClose}){
  const[sel,setSel]=useState(()=>new Set(m.billingPaymentIds||[]));
  const[notBilling,setNotBilling]=useState(m.notBilling||"");
  const[q,setQ]=useState("");
  const dealById=useMemo(()=>new Map(deals.map(d=>[d.id,d])),[deals]);
  const all=useMemo(()=>{
    const out=[];
    billings.forEach(ms=>(ms.payments||[]).forEach(p=>{
      if(p.bounced||!isCashPayment(p)||!(r2(p.amount)>0)) return;
      const d=dealById.get(ms.dealId);
      out.push({id:p.id,p,ms,d,amount:r2(p.amount),date:p.valueDate||p.date||"",bank:p.bank||"",
        text:[d?.client,d?projDisplayName(d):"",d?.ceNo,ms.invoiceNo,ms.name,p.refNo,String(p.amount)].join(" ").toLowerCase()});
    }));
    return out;
  },[billings,dealById]);
  const from=addDaysLocalISO(m.date,-10),to=addDaysLocalISO(m.date,10);
  const qq=q.trim().toLowerCase();
  const cands=all
    .filter(x=>sel.has(x.id)||(qq?x.text.includes(qq):(x.date>=from&&x.date<=to)))
    .sort((a,b)=>(sel.has(b.id)-sel.has(a.id))
      ||((!bankOf(m.bank)||bankOf(a.bank)?.id===bankOf(m.bank)?.id?0:1)-(!bankOf(m.bank)||bankOf(b.bank)?.id===bankOf(m.bank)?.id?0:1))
      ||depKey(a).localeCompare(depKey(b)))
    .slice(0,80);
  // Ticking one payment ticks the rest of the same deposit (same reference, date, bank).
  const toggle=x=>{
    const n=new Set(sel);
    const sib=String(x.p.refNo||"").trim()?all.filter(y=>depKey(y)===depKey(x)):[x];
    if(n.has(x.id)) sib.forEach(y=>n.delete(y.id)); else sib.forEach(y=>n.add(y.id));
    setSel(n);setNotBilling("");
  };
  const picked=all.filter(x=>sel.has(x.id));
  const sum=r2(picked.reduce((s,x)=>s+x.amount,0));
  const gap=r2(sum-m.amount);
  const elsewhere=picked.filter(x=>linkedElsewhere.has(x.id));
  // A payment already tied to another row can't be linked again (it would be
  // dropped from one of the two rows in Transaction History).
  const canLink=(picked.length>0&&!elsewhere.length)||(!picked.length&&!!notBilling);
  const td={padding:"6px 8px",borderTop:"1px solid #f1f5f9",fontSize:".76rem",verticalAlign:"top"};
  return(
    <Modal open title={`🔗 Collection · ${f2(m.amount)}`} onClose={onClose} wide>
      <div style={{fontSize:".78rem",color:"#475569",marginBottom:10}}>{m.date} · {bankLabel(m.bank)||"no bank"} · {m.payee||"—"}</div>
      <div style={{fontSize:".74rem",color:"#475569",marginBottom:8}}>Tick the client payment(s) recorded in Billing that this deposit is. Not there? Record it in Billing first (one cheque for several invoices: 💵 Pay several invoices).</div>
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search client, project, CE no., invoice, reference, amount (any date)…"
        style={{width:"100%",boxSizing:"border-box",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"7px 10px",fontFamily:"inherit",fontSize:".8rem",marginBottom:8}}/>
      <div style={{maxHeight:320,overflowY:"auto",border:"1px solid #e2e8f0",borderRadius:8}}>
        <table style={{borderCollapse:"collapse",width:"100%"}}>
          <tbody>
            {cands.length===0&&<tr><td style={{...td,color:"#94a3b8",fontStyle:"italic"}}>{qq?"Nothing matches.":`No Billing payments within 10 days of ${m.date}. Search to look further.`}</td></tr>}
            {cands.map(x=>(
              <tr key={x.id} onClick={()=>toggle(x)} style={{cursor:"pointer",background:sel.has(x.id)?"#eff6ff":"#fff"}}>
                <td style={{...td,width:24}}><input type="checkbox" readOnly checked={sel.has(x.id)}/></td>
                <td style={td}><b>{x.d?.client||"—"}</b> · {x.d?projDisplayName(x.d):""}<div style={{color:"#64748b",fontSize:".7rem"}}>{[x.ms.invoiceNo,x.ms.name,x.p.refNo&&`Ref ${x.p.refNo}`].filter(Boolean).join(" · ")}{linkedElsewhere.has(x.id)&&<span style={{color:"#b45309"}}> · already linked on {linkedElsewhere.get(x.id)}</span>}</div></td>
                <td style={{...td,whiteSpace:"nowrap",color:"#64748b"}}>{x.date} · {bankLabel(x.bank)||"—"}</td>
                <td style={{...td,textAlign:"right",whiteSpace:"nowrap",fontWeight:700}}>{f2(x.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {picked.length>0&&(
        <div style={{fontSize:".78rem",marginTop:8,color:Math.abs(gap)<0.01?"#059669":"#b45309",fontWeight:700}}>
          {Math.abs(gap)<0.01?`✓ ${picked.length} payment(s) total ${f2(sum)}, same as the bank.`
            :gap>0?`⚠ Billing records ${f2(sum)}, ${f2(gap)} more than reached the bank. Usually EWT the client withheld recorded as cash: fix the payments in Billing (record what reached the bank; set the invoice "with EWT").`
            :`⚠ Billing records ${f2(sum)}, ${f2(-gap)} less than reached the bank. A payment is missing in Billing, or it's on another row.`}
        </div>
      )}
      {elsewhere.length>0&&<div style={{fontSize:".74rem",color:"#dc2626",marginTop:4}}>⚠ {elsewhere.length} of these is already linked on {[...new Set(elsewhere.map(x=>linkedElsewhere.get(x.id)))].join(", ")}. A payment can be one deposit only: untick it, or remove the link on that row first.</div>}
      <div style={{marginTop:12,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",fontSize:".76rem"}}>
        <span style={{color:"#64748b"}}>Or, not a client payment:</span>
        <select value={notBilling} onChange={e=>{setNotBilling(e.target.value);if(e.target.value) setSel(new Set());}} style={{border:"1.5px solid #e2e8f0",borderRadius:7,padding:"5px 8px",fontFamily:"inherit",fontSize:".76rem"}}>
          <option value="">—</option>
          {NOT_BILLING_KINDS.map(k=><option key={k} value={k}>{k}</option>)}
        </select>
      </div>
      <div style={{display:"flex",gap:8,marginTop:14,justifyContent:"flex-end"}}>
        {(m.billingPaymentIds?.length||m.notBilling)&&<button onClick={()=>{onApply([],"");onClose();}} style={{marginRight:"auto",background:"#fff",border:"1.5px solid #fecaca",borderRadius:7,padding:"7px 12px",fontFamily:"inherit",fontWeight:700,fontSize:".78rem",color:"#dc2626",cursor:"pointer"}}>Remove link</button>}
        <button onClick={onClose} style={{background:"#fff",border:"1.5px solid #cbd5e1",borderRadius:7,padding:"7px 14px",fontFamily:"inherit",fontWeight:700,fontSize:".8rem",color:"#475569",cursor:"pointer"}}>Cancel</button>
        <button disabled={!canLink} onClick={()=>{if(!canLink) return;onApply(picked.map(x=>x.id),notBilling);onClose();}}
          style={{background:canLink?"#1d4ed8":"#e2e8f0",border:"none",borderRadius:7,padding:"7px 16px",fontFamily:"inherit",fontWeight:700,fontSize:".8rem",color:canLink?"#fff":"#94a3b8",cursor:canLink?"pointer":"not-allowed"}}>
          Link (save the sheet after)
        </button>
      </div>
    </Modal>
  );
}
