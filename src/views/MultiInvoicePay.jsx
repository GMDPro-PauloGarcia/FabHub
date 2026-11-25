import React,{useState,useMemo} from "react";
import {BANKS,Fld,Inp,Sel} from "../shared";
import {calcTax,PAYMENT_METHODS,paymentNeedsRef,paymentRefOk} from "../core";

// ─── PAY SEVERAL INVOICES WITH ONE CHEQUE (Billing, 2026-11-24) ──────────────
// One client cheque / transfer that settles several invoices of a project.
// Finance enters what reached the bank ONCE; it is split across the ticked
// invoices (oldest first, each up to its balance), and every invoice gets its
// own billing payment with the same reference, date and bank, which is how
// Transaction History and the cash sheet's 🔗 see them as one deposit.
// Before this, Omnivores CE-2026-1069 (one ₱186,200 cheque for two ₱95,000
// invoices) was recorded as ₱190,000: the 2% EWT the client kept was booked
// as cash. "Client withheld 2% EWT" sets those invoices to "with EWT" first.
// Only the form: the save (rules, Telegram, totals) is BillingView's
// saveMultiPay, which calls logBillingPayment per invoice.

const r2=v=>Math.round((Number(v)||0)*100)/100;
const f2=v=>`₱${r2(v).toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const paidOf=ms=>(ms.payments||[]).filter(p=>!p.bounced).reduce((s,p)=>s+Number(p.amount||0),0);

export default function MultiInvoicePay({deal,milestones=[],today,saving=false,onCancel,onSave}){
  const open=useMemo(()=>milestones
    .filter(m=>m.status!=="Fully Paid"&&m.status!=="Cancelled")
    .sort((a,b)=>String(a.invoiceDate||a.createdAt||"").localeCompare(String(b.invoiceDate||b.createdAt||""))||String(a.invoiceNo||"").localeCompare(String(b.invoiceNo||""))),[milestones]);
  const[form,setForm]=useState({total:"",bank:"",method:"Cheque",date:today,valueDate:"",refNo:"",note:""});
  const[ticked,setTicked]=useState(()=>new Set(open.map(m=>m.id)));
  const[ewt,setEwt]=useState(false);
  const[manual,setManual]=useState({}); // id → amount typed by hand
  const fp=(k,v)=>setForm(f=>({...f,[k]:v}));

  const rt=ms=>ms.receiptType??deal?.receiptType??"OR";
  const whOn=ms=>ms.withholding??deal?.withholding??false;
  const balOf=ms=>{
    const tx=calcTax(ms.amount,rt(ms),whOn(ms)||(ewt&&rt(ms)==="OR"));
    return Math.max(0,r2(tx.netReceivable-paidOf(ms)));
  };
  const rows=open.map(ms=>({ms,bal:balOf(ms),on:ticked.has(ms.id),ewtNew:ewt&&rt(ms)==="OR"&&!whOn(ms)}));
  const total=r2(form.total);
  // Auto split: oldest first, each up to its balance; a typed amount wins.
  let left=total;
  const lines=rows.map(r=>{
    if(!r.on) return {...r,amt:0};
    const typed=manual[r.ms.id];
    const amt=typed!=null&&typed!==""?r2(typed):r2(Math.min(r.bal,Math.max(0,left)));
    left=r2(left-amt);
    return {...r,amt};
  });
  const sum=r2(lines.reduce((s,l)=>s+l.amt,0));
  const due=r2(lines.filter(l=>l.on).reduce((s,l)=>s+l.bal,0));
  const over=lines.filter(l=>l.amt>l.bal+0.01);
  const problems=[
    !(total>0)&&"Enter the amount that reached the bank.",
    !form.bank&&"Pick the bank it was deposited to.",
    paymentNeedsRef(form)&&!paymentRefOk(form.refNo)&&"Enter the cheque / transfer reference (at least 4 letters or digits).",
    total>0&&Math.abs(sum-total)>0.01&&`The invoice amounts add up to ${f2(sum)}, not ${f2(total)}.`,
    over.length>0&&`${over.map(l=>l.ms.invoiceNo||l.ms.name).join(", ")}: more than the balance.`,
    !lines.some(l=>l.amt>0)&&"Tick at least one invoice.",
  ].filter(Boolean);
  const short=total>0&&total<due-0.01?r2(due-total):0;

  const inp={width:"100%",boxSizing:"border-box",border:"1.5px solid #e2e8f0",borderRadius:6,padding:"5px 8px",fontFamily:"inherit",fontSize:".8rem",textAlign:"right"};
  return(
    <div style={{background:"#eff6ff",border:"1.5px solid #93c5fd",borderRadius:10,padding:"12px 14px",marginBottom:12}}>
      <div style={{fontWeight:800,color:"#1d4ed8",fontSize:".86rem",marginBottom:4}}>💵 Pay several invoices with one cheque</div>
      <div style={{fontSize:".72rem",color:"#475569",marginBottom:10}}>Enter what actually reached the bank, once. It is split across the ticked invoices, oldest first.</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:8}}>
        <Fld label="Amount received (₱)" required><Inp type="number" value={form.total} onChange={e=>fp("total",e.target.value)} placeholder="As on the deposit slip"/></Fld>
        <Fld label="Bank Deposited To" required>
          <Sel value={form.bank} onChange={e=>fp("bank",e.target.value)}>
            <option value="">— Select Bank —</option>
            {[...BANKS.map(b=>({v:b.id,l:b.short})),{v:"cash",l:"Cash"}].map(b=><option key={b.v} value={b.v}>{b.l}</option>)}
          </Sel>
        </Fld>
        <Fld label="Payment Method">
          <Sel value={form.method} onChange={e=>fp("method",e.target.value)}>{PAYMENT_METHODS.map(m=><option key={m} value={m}>{m}</option>)}</Sel>
        </Fld>
        <Fld label="Date Received"><Inp type="date" value={form.date} onChange={e=>fp("date",e.target.value)}/></Fld>
        <Fld label="Value Date" hint={form.method==="Cheque"?"When the cheque clears — blank = auto ~3 banking days":"Blank = same day"}><Inp type="date" value={form.valueDate} onChange={e=>fp("valueDate",e.target.value)}/></Fld>
        <Fld label="Reference No." required><Inp value={form.refNo} onChange={e=>fp("refNo",e.target.value)} placeholder="Cheque / transfer ref…"/></Fld>
        <Fld label="Note"><Inp value={form.note} onChange={e=>fp("note",e.target.value)} placeholder="e.g. 50% DP + balance"/></Fld>
      </div>
      <label style={{display:"flex",alignItems:"center",gap:7,fontSize:".78rem",fontWeight:700,color:"#0f172a",margin:"10px 0 6px",cursor:"pointer"}}>
        <input type="checkbox" checked={ewt} onChange={e=>setEwt(e.target.checked)}/>
        Client withheld 2% EWT (sets the ticked invoices to "with EWT"; get their BIR 2307)
      </label>
      <div style={{overflowX:"auto"}}>
        <table style={{borderCollapse:"collapse",width:"100%",fontSize:".78rem",minWidth:460}}>
          <thead><tr style={{color:"#64748b",fontSize:".66rem",textTransform:"uppercase",textAlign:"left"}}>
            <th style={{padding:"4px 6px"}}></th><th style={{padding:"4px 6px"}}>Invoice</th><th style={{padding:"4px 6px",textAlign:"right"}}>Balance</th><th style={{padding:"4px 6px",textAlign:"right",width:140}}>This payment</th>
          </tr></thead>
          <tbody>
            {lines.map(l=>(
              <tr key={l.ms.id} style={{borderTop:"1px solid #dbeafe",opacity:l.on?1:.5}}>
                <td style={{padding:"4px 6px"}}><input type="checkbox" checked={l.on} onChange={e=>{const n=new Set(ticked);e.target.checked?n.add(l.ms.id):n.delete(l.ms.id);setTicked(n);}}/></td>
                <td style={{padding:"4px 6px"}}><b>{l.ms.invoiceNo||"No invoice no."}</b> · {l.ms.name}{l.ewtNew&&<span style={{color:"#b45309",fontSize:".68rem"}}> · will be set with EWT</span>}</td>
                <td style={{padding:"4px 6px",textAlign:"right",whiteSpace:"nowrap"}}>{f2(l.bal)}</td>
                <td style={{padding:"4px 6px"}}>{l.on&&<input type="number" style={{...inp,borderColor:l.amt>l.bal+0.01?"#dc2626":"#e2e8f0"}} value={manual[l.ms.id]??(l.amt?String(l.amt):"")} onChange={e=>setManual(m=>({...m,[l.ms.id]:e.target.value}))} placeholder="0.00"/>}</td>
              </tr>
            ))}
            <tr style={{borderTop:"2px solid #93c5fd",fontWeight:800}}>
              <td></td><td style={{padding:"5px 6px"}}>Total</td><td style={{padding:"5px 6px",textAlign:"right"}}>{f2(due)}</td><td style={{padding:"5px 6px",textAlign:"right",color:Math.abs(sum-total)>0.01?"#dc2626":"#059669"}}>{f2(sum)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {Object.keys(manual).length>0&&<button type="button" onClick={()=>setManual({})} style={{background:"none",border:"none",color:"#2563eb",fontSize:".72rem",cursor:"pointer",padding:"4px 0",fontFamily:"inherit"}}>↺ Split automatically again</button>}
      {short>0&&!ewt&&<div style={{fontSize:".74rem",color:"#b45309",marginTop:6}}>⚠ {f2(short)} less than the balances of the ticked invoices. If the client withheld EWT, tick the box above; otherwise the rest stays open.</div>}
      {problems.length>0&&total>0&&<div style={{fontSize:".74rem",color:"#dc2626",marginTop:6}}>{problems.map(p=><div key={p}>• {p}</div>)}</div>}
      <div style={{display:"flex",gap:8,marginTop:10}}>
        <button disabled={saving||problems.length>0} onClick={()=>onSave({common:{...form,amount:undefined},lines:lines.filter(l=>l.amt>0).map(l=>({ms:l.ms,amount:l.amt,withEwt:l.ewtNew})),total})}
          style={{background:problems.length||saving?"#e2e8f0":"#1d4ed8",border:"none",borderRadius:7,padding:"7px 16px",fontFamily:"inherit",fontWeight:700,fontSize:".82rem",color:problems.length||saving?"#94a3b8":"#fff",cursor:problems.length||saving?"not-allowed":"pointer"}}>
          {saving?"Saving…":`Save ${lines.filter(l=>l.amt>0).length} payment(s)`}
        </button>
        <button onClick={onCancel} disabled={saving} style={{background:"#fff",border:"1.5px solid #cbd5e1",borderRadius:7,padding:"7px 14px",fontFamily:"inherit",fontWeight:700,fontSize:".82rem",color:"#475569",cursor:"pointer"}}>Cancel</button>
      </div>
    </div>
  );
}
