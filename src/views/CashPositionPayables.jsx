import React,{useState,useMemo} from "react";
import {today as TODAY,BANKS,Modal,Fld,Inp,Sel,uiConfirm,uiAlert} from "../shared";

// ─── SUPPLIER BILLS TO PAY (Cash Position) ─────────────────────────────────
// Stand-in for the hidden Accounts Payable while the new AP/AR system is built.
// Every approved PO (and subcon Work Order) still raises a payable in the
// background (syncPoPayable / syncWoPayable). This panel lists the open ones so
// Finance can approve them and mark them paid once the payment has really gone
// out. These are exactly the bills "Running Payables" sums, so marking one paid
// takes it off that figure.
//
// Nothing new is stored: Approve uses approvePayable and Mark paid / Undo use
// the payable_payments history (recordPayablePayment / cancelPayablePayment),
// so the database rules still apply: approval before payment, check number for
// a check, and an undo is a cancellation with a reason, never a delete.

const num=v=>Number(String(v??"").replace(/,/g,""))||0;
const pesoAmt=v=>"₱"+num(v).toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2});
const METHODS=["Check","Bank transfer","Online","Cash"];
const PAGE=60;

export default function CashPositionPayables({payables=[],payPays=[],prs=[],deals=[],today=TODAY,canApprove=false,canPay=false,onApprove,onPay,onCancelPay}){
  const mob=typeof window!=="undefined"&&window.innerWidth<860;
  const[open,setOpen]=useState(true);
  const[q,setQ]=useState("");
  const[src,setSrc]=useState("All");
  const[showPaid,setShowPaid]=useState(false);
  const[limit,setLimit]=useState(PAGE);
  const[payFor,setPayFor]=useState(null);
  const[form,setForm]=useState({});
  const[busy,setBusy]=useState(false);

  const dealName=id=>{const d=id&&deals.find(x=>x.id===id);return d?(d.client||d.name||"")+(d.ceNo?` · ${d.ceNo}`:""):"";};
  const sourceOf=p=>!p.poId?"Other":p.category==="Subcontractor"?"WO":"PO";
  // PO receipt state from its line items (Policy v2.0: pay only what was received).
  const receiptOf=p=>{
    const lines=prs.filter(x=>x.poNumber&&x.poNumber===p.poId&&x.status!=="Cancelled");
    if(!lines.length) return null;
    const qty=lines.reduce((s,i)=>s+num(i.qty),0),got=lines.reduce((s,i)=>s+num(i.qtyDelivered),0);
    if(lines.every(i=>i.status==="Delivered")||(qty>0&&got>=qty)) return "Received";
    if(got>0||lines.some(i=>["Delivered","Partially Delivered"].includes(i.status))) return "Partly received";
    return "Not received";
  };
  const balanceOf=p=>Math.round((num(p.amount)-num(p.paidAmount))*100)/100;
  const isOpen=p=>!["Paid","Cancelled"].includes(p.status)&&balanceOf(p)>0;
  const approved=p=>((p.approvalStatus)||"Approved")==="Approved";
  const paidCutoff=useMemo(()=>{const d=new Date(today+"T00:00:00");d.setDate(d.getDate()-30);return d.toISOString().slice(0,10);},[today]);

  const rows=useMemo(()=>{
    const qq=q.trim().toLowerCase();
    return payables
      .filter(p=>showPaid?(p.status==="Paid"&&(p.paidDate||"")>=paidCutoff):isOpen(p))
      .filter(p=>src==="All"||sourceOf(p)===src)
      .filter(p=>!qq||[p.vendor,p.poId,p.poNumber,p.apNumber,p.invoiceRef,dealName(p.projectId)].some(v=>String(v||"").toLowerCase().includes(qq)))
      .sort((a,b)=>showPaid?String(b.paidDate||"").localeCompare(String(a.paidDate||"")):(a.dueDate||"9999").localeCompare(b.dueDate||"9999")||String(b.createdAt||"").localeCompare(String(a.createdAt||"")));
  },[payables,prs,deals,q,src,showPaid,paidCutoff]);

  const openAll=payables.filter(isOpen);
  const openTotal=openAll.reduce((s,p)=>s+balanceOf(p),0);
  const overdue=openAll.filter(p=>p.dueDate&&p.dueDate<today);
  const pending=openAll.filter(p=>!approved(p)).length;

  const startPay=p=>{
    setForm({amount:String(balanceOf(p)),date:today,method:p.payMethod||"Check",bank:p.payBank||"bpi",ref:"",note:""});
    setPayFor(p);
  };
  const submitPay=async()=>{
    const p=payFor;if(!p||busy) return;
    const amt=Math.round(num(form.amount)*100)/100;
    if(!(amt>0)||amt>balanceOf(p)+0.005){await uiAlert(`Enter an amount between ₱0.01 and the open balance of ${pesoAmt(balanceOf(p))}.`);return;}
    const rc=receiptOf(p);
    if(rc&&rc!=="Received"&&!(await uiConfirm({title:"Not fully received",tone:"danger",confirmLabel:"Pay anyway",message:`PO ${p.poId} is "${rc}". Policy is to pay only what has been received.\n\nRecord this payment anyway?`}))) return;
    setBusy(true);
    const ok=await onPay(p.id,amt,{date:form.date,method:form.method,bank:form.bank,ref:form.ref,note:form.note});
    setBusy(false);
    if(ok) setPayFor(null);
  };
  const undo=p=>{
    const last=payPays.filter(x=>x.payableId===p.id&&x.status!=="Cancelled").sort((a,b)=>String(b.createdAt||b.payDate||"").localeCompare(String(a.createdAt||a.payDate||"")))[0];
    if(last) onCancelPay(last.id);
  };

  const chip=(txt,clr)=><span style={{fontSize:".66rem",fontWeight:700,color:clr,background:clr+"18",border:`1px solid ${clr}44`,borderRadius:20,padding:"2px 8px",whiteSpace:"nowrap"}}>{txt}</span>;
  const btn=(label,onClick,clr)=><button onClick={onClick} style={{background:clr,color:"#fff",border:"none",borderRadius:7,padding:"5px 12px",fontSize:".74rem",fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>{label}</button>;
  const RC_CLR={"Received":"#059669","Partly received":"#d97706","Not received":"#94a3b8"};

  return(
    <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",marginBottom:16}}>
      <button onClick={()=>setOpen(o=>!o)} style={{display:"flex",width:"100%",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap",padding:"14px 18px",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}>
        <div>
          <div style={{fontWeight:800,color:"#0f172a",fontSize:".92rem"}}>📦 Supplier bills to pay <span style={{fontWeight:500,color:"#64748b",fontSize:".78rem"}}>· POs & Work Orders</span></div>
          <div style={{fontSize:".74rem",color:"#64748b",marginTop:2}}>{openAll.length} open · {pesoAmt(openTotal)}{overdue.length>0&&<span style={{color:"#dc2626",fontWeight:700}}> · {overdue.length} overdue</span>}{pending>0&&<span style={{color:"#d97706",fontWeight:700}}> · {pending} awaiting approval</span>}</div>
        </div>
        <span style={{color:"#64748b",fontSize:".8rem"}}>{open?"▲ Hide":"▼ Show"}</span>
      </button>
      {open&&<div style={{padding:"0 18px 16px"}}>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",marginBottom:10}}>
          <input value={q} onChange={e=>{setQ(e.target.value);setLimit(PAGE);}} placeholder="Search supplier, PO, project…" style={{flex:"1 1 200px",minWidth:0,border:"1.5px solid #e2e8f0",borderRadius:8,padding:"7px 11px",fontFamily:"inherit",fontSize:".82rem"}}/>
          {["All","PO","WO","Other"].map(s=>(
            <button key={s} onClick={()=>{setSrc(s);setLimit(PAGE);}} style={{padding:"5px 12px",borderRadius:20,border:`1px solid ${src===s?"#1e293b":"#e2e8f0"}`,background:src===s?"#1e293b":"#fff",color:src===s?"#fff":"#64748b",cursor:"pointer",fontSize:".74rem",fontWeight:600,fontFamily:"inherit"}}>{s}</button>
          ))}
          <label style={{display:"flex",alignItems:"center",gap:5,fontSize:".76rem",color:"#475569",cursor:"pointer"}}>
            <input type="checkbox" checked={showPaid} onChange={e=>{setShowPaid(e.target.checked);setLimit(PAGE);}}/> Paid in the last 30 days
          </label>
        </div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",minWidth:mob?640:0}}>
            <thead><tr style={{background:"#f8fafc"}}>
              {["Bill","Supplier / project","Due",showPaid?"Paid":"Balance",""].map((h,i)=><th key={i} style={{padding:"7px 10px",fontSize:".66rem",fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:".5px",textAlign:i===3?"right":"left"}}>{h}</th>)}
            </tr></thead>
            <tbody>
              {rows.slice(0,limit).map(p=>{
                const s=sourceOf(p),rc=s==="PO"?receiptOf(p):null,late=!showPaid&&p.dueDate&&p.dueDate<today;
                return(
                  <tr key={p.id} style={{borderTop:"1px solid #f1f5f9"}}>
                    <td style={{padding:"8px 10px",fontSize:".78rem",verticalAlign:"top"}}>
                      <div style={{fontWeight:700,color:"#0f172a"}}>{s} {p.poId||p.invoiceRef||"—"}</div>
                      <div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:3}}>
                        {p.apNumber&&<span style={{fontSize:".66rem",color:"#94a3b8"}}>{p.apNumber}</span>}
                        {rc&&chip(rc,RC_CLR[rc])}
                        {!showPaid&&!approved(p)&&chip(p.approvalStatus==="Rejected"?"Rejected":"Awaiting approval",p.approvalStatus==="Rejected"?"#dc2626":"#d97706")}
                      </div>
                    </td>
                    <td style={{padding:"8px 10px",fontSize:".78rem",verticalAlign:"top"}}>
                      <div style={{fontWeight:600,color:"#0f172a"}}>{p.vendor||"—"}</div>
                      <div style={{fontSize:".7rem",color:"#64748b"}}>{dealName(p.projectId)||"No project"}</div>
                    </td>
                    <td style={{padding:"8px 10px",fontSize:".76rem",verticalAlign:"top",color:late?"#dc2626":"#475569",fontWeight:late?700:400,whiteSpace:"nowrap"}}>{showPaid?(p.paidDate||"—"):(p.dueDate||"No date")}</td>
                    <td style={{padding:"8px 10px",fontSize:".8rem",verticalAlign:"top",textAlign:"right",whiteSpace:"nowrap"}}>
                      <div style={{fontWeight:800,color:showPaid?"#059669":"#0f172a"}}>{pesoAmt(showPaid?p.paidAmount:balanceOf(p))}</div>
                      {showPaid?<div style={{fontSize:".66rem",color:"#94a3b8"}}>{[p.payMethod,p.payRef].filter(Boolean).join(" · ")}</div>
                        :num(p.paidAmount)>0&&<div style={{fontSize:".66rem",color:"#94a3b8"}}>of {pesoAmt(p.amount)}</div>}
                    </td>
                    <td style={{padding:"8px 10px",verticalAlign:"top",textAlign:"right"}}>
                      {showPaid?(canPay&&btn("Undo",()=>undo(p),"#64748b"))
                        :!approved(p)?(canApprove&&p.approvalStatus!=="Rejected"&&btn("Approve",()=>onApprove(p.id),"#d97706"))
                        :(canPay&&btn("Mark paid",()=>startPay(p),"#059669"))}
                    </td>
                  </tr>
                );
              })}
              {rows.length===0&&<tr><td colSpan={5} style={{textAlign:"center",padding:22,color:"#94a3b8",fontSize:".8rem"}}>{showPaid?"Nothing marked paid in the last 30 days.":"No open supplier bills."}</td></tr>}
            </tbody>
          </table>
        </div>
        {rows.length>limit&&<button onClick={()=>setLimit(l=>l+PAGE)} style={{marginTop:8,background:"#f1f5f9",border:"none",borderRadius:7,padding:"6px 14px",fontSize:".76rem",fontWeight:600,color:"#475569",cursor:"pointer",fontFamily:"inherit"}}>Show {Math.min(PAGE,rows.length-limit)} more of {rows.length-limit}</button>}
        <div style={{fontSize:".7rem",color:"#94a3b8",marginTop:10}}>Mark a bill paid only once the money has actually gone out (check released or transfer confirmed). That takes it off Running Payables. Still log the disbursement in the daily position as usual.</div>
      </div>}

      <Modal open={!!payFor} onClose={()=>!busy&&setPayFor(null)} title={payFor?`Mark paid · ${payFor.vendor||""}`:""}>
        {payFor&&<div>
          <div style={{fontSize:".8rem",color:"#475569",marginBottom:14}}>{sourceOf(payFor)} {payFor.poId||payFor.invoiceRef} · open balance <b>{pesoAmt(balanceOf(payFor))}</b></div>
          <Fld label="Amount paid" required hint="Less than the balance records a partial payment."><Inp type="number" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))}/></Fld>
          <Fld label="Date paid" required><Inp type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/></Fld>
          <Fld label="Method"><Sel value={form.method} onChange={e=>setForm(f=>({...f,method:e.target.value}))}>{METHODS.map(m=><option key={m}>{m}</option>)}</Sel></Fld>
          <Fld label="Bank"><Sel value={form.bank} onChange={e=>setForm(f=>({...f,bank:e.target.value}))}>{BANKS.map(b=><option key={b.id} value={b.id}>{b.short}</option>)}</Sel></Fld>
          <Fld label={form.method==="Check"?"Check number":"Reference no."} required={form.method==="Check"}><Inp value={form.ref} onChange={e=>setForm(f=>({...f,ref:e.target.value}))}/></Fld>
          <Fld label="Note"><Inp value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))}/></Fld>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
            <button onClick={()=>setPayFor(null)} disabled={busy} style={{background:"#f1f5f9",border:"none",borderRadius:8,padding:"9px 16px",fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
            <button onClick={submitPay} disabled={busy} style={{background:"#059669",color:"#fff",border:"none",borderRadius:8,padding:"9px 16px",fontWeight:700,cursor:"pointer",fontFamily:"inherit",opacity:busy?.6:1}}>{busy?"Saving…":"Record payment"}</button>
          </div>
        </div>}
      </Modal>
    </div>
  );
}
