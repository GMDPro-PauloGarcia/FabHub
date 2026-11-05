import React,{useState,useMemo} from "react";
import {today as TODAY,useIsMobile} from "../shared";
import {projDisplayName,isSubconPayable} from "../core";
import {num,r2,php2} from "../data/ledger";
import {LedgerHost,chip,linkBtn} from "./Ledgers";

// ─── SUBCON PAYMENT MONITORING (read-only) ─────────────────────────────────
// Finance asked (Paolo Gomez, 2026-11-05) for subcontractor progress payments
// in the same layout as the client Sales & Collection sheet: one row per Work
// Order, the contract, each payment as its own column (1, 2, 3 …), total paid,
// retention and balance.
//
// Nothing here writes. Payments are still recorded on Supplier Bills / Payment
// Run, and the PM still certifies on Subcon Billing (the database caps every
// subcon payment at certified % x WO contract, migration
// 20261027160000_subcon_billing_pm_certification.sql).
//
// Sources: subcon_work_orders (contract), payables whose po_number is the WO
// number (the subcon bill), payable_payments (each payment / retention release).
// A WO with a paid amount typed on the WO itself but no bill is shown as
// "Paid outside AP": that money isn't in the AP ledger and should be moved there.

const C={ink:"#0f172a",muted:"#64748b",faint:"#94a3b8",line:"#e2e8f0",ok:"#059669",warn:"#d97706",bad:"#dc2626",purple:"#7c3aed",blue:"#1d4ed8",navy:"#0B2545"};
const spmTh={padding:"7px 8px",fontSize:".62rem",fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:".5px",textAlign:"left",whiteSpace:"nowrap",background:"#f8fafc",borderBottom:`1px solid ${C.line}`,position:"sticky",top:0,zIndex:1};
const spmThR={...spmTh,textAlign:"right"};
const spmTd={padding:"6px 8px",fontSize:".74rem",color:C.ink,borderBottom:"1px solid #f1f5f9",verticalAlign:"top"};
const spmTdR={...spmTd,textAlign:"right",whiteSpace:"nowrap",fontVariantNumeric:"tabular-nums"};
const MAX_COLS=6;
const DEAD_WO=["Cancelled","Void","Rejected"];
const peso0=v=>"₱"+num(v).toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtD=d=>{if(!d)return"";const x=new Date(String(d).slice(0,10)+"T00:00:00");return isNaN(x)?String(d):x.toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"2-digit"});};

const STATUS_CLR={"No bill":C.purple,"Paid outside AP":C.warn,"Fully paid":C.ok,"Not certified":C.bad,"Certified":C.blue};

// One monitoring row per Work Order. Exported for tests / other views.
export function subconMonitorRows({swos=[],payables=[],payPays=[],deals=[]}){
  const dealById=new Map(deals.map(d=>[d.id,d]));
  const billsByWo=new Map();
  payables.forEach(p=>{
    if(!isSubconPayable(p)||["Cancelled","Void"].includes(p.status)) return;
    const wo=String(p.poNumber||"").trim(); if(!wo) return;
    if(!billsByWo.has(wo)) billsByWo.set(wo,[]);
    billsByWo.get(wo).push(p);
  });
  const paysByBill=new Map();
  payPays.forEach(x=>{
    if(x.status==="Cancelled") return;
    if(!paysByBill.has(x.payableId)) paysByBill.set(x.payableId,[]);
    paysByBill.get(x.payableId).push(x);
  });
  return swos.filter(w=>!DEAD_WO.includes(w.status)).map(w=>{
    const bills=billsByWo.get(String(w.woNumber||"").trim())||[];
    const pays=bills.flatMap(b=>paysByBill.get(b.id)||[]);
    const progress=pays.filter(x=>x.kind!=="Retention release").sort((a,b)=>String(a.payDate).localeCompare(String(b.payDate)));
    const releases=pays.filter(x=>x.kind==="Retention release");
    const contract=r2(num(w.contractAmount)||bills.reduce((s,b)=>s+num(b.amount),0));
    const ewt=r2(bills.reduce((s,b)=>s+num(b.ewtAmount),0));
    const retHeld=r2(progress.reduce((s,x)=>s+num(x.retentionAmount),0)-releases.reduce((s,x)=>s+num(x.amount),0));
    let cash=r2(pays.reduce((s,x)=>s+num(x.amount),0));
    const woOnlyPaid=!bills.length&&num(w.paid_amt)>0;
    if(woOnlyPaid) cash=r2(num(w.paid_amt));
    // Owed to the subcon: contract less cash paid and tax withheld. Retention
    // held is still owed, so it stays inside the balance (shown separately too).
    const balance=Math.max(0,r2(contract-cash-ewt));
    // Certified but not yet paid: what Finance owes now under the PM's cert.
    const certBill=bills.find(b=>b.verifiedBy&&num(b.verificationPct)>0);
    const certPct=certBill?num(certBill.verificationPct):0;
    const gross=r2(progress.reduce((s,x)=>s+num(x.amount)+num(x.retentionAmount),0));
    const dueNow=certBill&&balance>1?Math.max(0,r2(certPct/100*contract-gross)):0;
    const status=balance<=1?"Fully paid":woOnlyPaid?"Paid outside AP":!bills.length?"No bill":certBill?"Certified":"Not certified";
    const d=dealById.get(w.dealId);
    return {id:w.id,wo:w,woNumber:w.woNumber||"—",subcon:w.subcontractor||bills[0]?.vendor||"—",dealId:w.dealId||null,
      project:d?projDisplayName(d):(w.projectName||"—"),scope:w.scopeOfWork||"",terms:w.paymentStructure||w.paymentTerms||"",
      woStatus:w.status||"",contract,retPct:num(w.retentionPct),bills,progress,releases,cash,ewt,retHeld,balance,certPct,
      certBy:certBill?.verifiedBy||"",dueNow,status,woOnlyPaid,
      paidPct:contract>0?Math.min(100,Math.round(cash/contract*100)):0};
  }).sort((a,b)=>a.subcon.localeCompare(b.subcon)||String(a.woNumber).localeCompare(String(b.woNumber)));
}

export default function SubconPaymentMonitor({swos=[],payables=[],payPays=[],deals=[],prs=[],exps=[],today=TODAY}){
  const mob=useIsMobile();
  const[q,setQ]=useState("");
  const[filter,setFilter]=useState("open");
  const[ledger,setLedger]=useState(null);
  const all=useMemo(()=>subconMonitorRows({swos,payables,payPays,deals}),[swos,payables,payPays,deals]);

  const FILTERS=[
    ["open","Open balance",r=>r.balance>1],
    ["due","Certified, unpaid",r=>r.dueNow>1],
    ["nobill","No bill yet",r=>r.status==="No bill"],
    ["outside","Paid outside AP",r=>r.status==="Paid outside AP"],
    ["paid","Fully paid",r=>r.status==="Fully paid"],
    ["all","All",()=>true],
  ];
  const fx=(FILTERS.find(f=>f[0]===filter)||FILTERS[0])[2];
  const needle=q.trim().toLowerCase();
  const rows=all.filter(fx).filter(r=>!needle||[r.subcon,r.project,r.woNumber,r.scope].some(v=>String(v).toLowerCase().includes(needle)));
  const nCols=Math.min(MAX_COLS,Math.max(1,...rows.map(r=>r.progress.length)));

  const sum=(rs,k)=>r2(rs.reduce((s,r)=>s+num(r[k]),0));
  const kpis=[
    ["Total WO contract",php2(sum(all,"contract")),`${all.length} work orders`,C.navy],
    ["Paid to date",php2(sum(all,"cash")),`${all.filter(r=>r.cash>0).length} WOs with a payment`,C.ok],
    ["Balance owed",php2(sum(all,"balance")),"contract − paid − EWT",C.bad],
    ["Certified, not yet paid",php2(sum(all,"dueNow")),"payable now under PM certification",C.blue],
    ["Retention held",php2(sum(all,"retHeld")),"released at 100% certified",C.warn],
    ["WOs with no bill",String(all.filter(r=>r.status==="No bill").length),"no subcon bill in AP yet",C.purple],
  ];
  const ewtMissing=all.filter(r=>r.cash>0&&r.ewt<=0).length;

  const exportCsv=()=>{
    const esc=v=>`"${String(v??"").replace(/"/g,'""')}"`;
    const maxN=Math.max(1,...rows.map(r=>r.progress.length));
    const head=["Subcontractor","Project","WO #","Scope","Payment terms","WO status","Total contract","Retention %",
      ...Array.from({length:maxN},(_,i)=>[`Payment ${i+1}`,`Date ${i+1}`,`Ref ${i+1}`]).flat(),
      "Total paid","Retention held","EWT","Balance","Certified %","Certified by","Certified, unpaid","Status"];
    const lines=[head.map(esc).join(",")];
    rows.forEach(r=>lines.push([r.subcon,r.project,r.woNumber,r.scope,r.terms,r.woStatus,r.contract.toFixed(2),r.retPct,
      ...Array.from({length:maxN},(_,i)=>{const p=r.progress[i];return p?[num(p.amount).toFixed(2),p.payDate,p.refNo]:["","",""];}).flat(),
      r.cash.toFixed(2),r.retHeld.toFixed(2),r.ewt.toFixed(2),r.balance.toFixed(2),r.certPct||"",r.certBy,r.dueNow.toFixed(2),r.status].map(esc).join(",")));
    const blob=new Blob(["﻿"+lines.join("\n")],{type:"text/csv;charset=utf-8"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`GMD_subcon_payments_${today}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);
  };

  const payCell=(r,i)=>{
    if(i===MAX_COLS-1&&r.progress.length>MAX_COLS){
      const rest=r.progress.slice(i);
      return <span title={rest.map(p=>`${p.payDate} ${php2(p.amount)} ${p.refNo||""}`).join("\n")}>{peso0(rest.reduce((s,p)=>s+num(p.amount),0))}<div style={{fontSize:".6rem",color:C.faint}}>{rest.length} payments</div></span>;
    }
    const p=r.progress[i]; if(!p) return null;
    return <span title={`${p.payDate} · ${p.method||""} ${p.bank||""} ${p.refNo||""}${num(p.retentionAmount)?` · retention held ${php2(p.retentionAmount)}`:""}`}>
      {peso0(p.amount)}<div style={{fontSize:".6rem",color:C.faint}}>{fmtD(p.payDate)}{p.refNo?` · ${p.refNo}`:""}</div></span>;
  };
  const statusChip=r=>chip(r.status==="Certified"?`Certified ${r.certPct}%`:r.status,STATUS_CLR[r.status]||C.faint);
  const inp={border:"1.5px solid #e2e8f0",borderRadius:8,padding:"6px 9px",fontFamily:"inherit",fontSize:".78rem",background:"#fff"};
  const tot=k=>sum(rows,k);

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:10,marginBottom:12}}>
        <div>
          <h2 style={{margin:0,fontWeight:800,color:C.ink,fontSize:"1.15rem"}}>🔨 Subcon Payment Monitoring</h2>
          <div style={{fontSize:".75rem",color:C.muted,marginTop:2,maxWidth:680}}>One row per Work Order, like the client Sales &amp; Collection sheet. Payments are recorded on Supplier Bills; the PM certifies on Subcon Billing. Read-only.</div>
        </div>
        <button onClick={exportCsv} style={{background:C.navy,color:"#fff",border:"none",borderRadius:8,padding:"7px 12px",fontFamily:"inherit",fontSize:".78rem",fontWeight:700,cursor:"pointer"}}>⬇ Export CSV</button>
      </div>

      <div style={{display:"grid",gridTemplateColumns:mob?"1fr 1fr":"repeat(6,1fr)",gap:8,marginBottom:12}}>
        {kpis.map(([k,v,s,c])=>(
          <div key={k} style={{background:"#fff",border:`1px solid ${C.line}`,borderLeft:`3px solid ${c}`,borderRadius:10,padding:"8px 10px"}}>
            <div style={{fontSize:".58rem",textTransform:"uppercase",letterSpacing:".6px",color:C.faint,fontWeight:700}}>{k}</div>
            <div style={{fontWeight:800,color:C.ink,fontSize:".95rem",fontVariantNumeric:"tabular-nums"}}>{v}</div>
            <div style={{fontSize:".62rem",color:C.muted}}>{s}</div>
          </div>
        ))}
      </div>

      {ewtMissing>0&&<div style={{background:"#fffbeb",border:"1px solid #fde68a",color:"#92400e",borderRadius:8,padding:"7px 10px",fontSize:".74rem",marginBottom:10}}>
        ⚠ {ewtMissing} paid Work Order{ewtMissing===1?" has":"s have"} no EWT recorded on the subcon bill. If tax was withheld, record it on the bill so the balance is right and the BIR 2307 is issued.</div>}

      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10,alignItems:"center"}}>
        {FILTERS.map(([id,l,f])=>(
          <button key={id} onClick={()=>setFilter(id)} style={{border:`1.5px solid ${filter===id?C.navy:C.line}`,background:filter===id?C.navy:"#fff",color:filter===id?"#fff":C.ink,borderRadius:20,padding:"4px 11px",fontFamily:"inherit",fontSize:".72rem",fontWeight:700,cursor:"pointer"}}>
            {l} <span style={{opacity:.7}}>{all.filter(f).length}</span></button>
        ))}
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search subcon, project, WO…" aria-label="Search" style={{...inp,flex:mob?"1 1 100%":"0 1 260px",marginLeft:mob?0:"auto"}}/>
      </div>

      {rows.length===0?<div style={{background:"#fff",border:`1px solid ${C.line}`,borderRadius:12,padding:20,color:C.faint,fontSize:".85rem"}}>No Work Orders match.</div>
      :mob?(
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {rows.map(r=>(
            <div key={r.id} style={{background:"#fff",border:`1px solid ${C.line}`,borderRadius:10,padding:"10px 12px"}}>
              <div style={{display:"flex",justifyContent:"space-between",gap:8}}>
                <div style={{minWidth:0}}>
                  <button style={{...linkBtn,fontWeight:700,fontSize:".84rem"}} onClick={()=>setLedger({kind:"supplier",id:r.subcon})}>{r.subcon}</button>
                  <div style={{fontSize:".7rem",color:C.muted}}><span style={{fontFamily:"monospace"}}>{r.woNumber}</span> · {r.dealId?<button style={linkBtn} onClick={()=>setLedger({kind:"project",id:r.dealId})}>{r.project}</button>:r.project}</div>
                </div>
                <div>{statusChip(r)}</div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginTop:8,fontSize:".72rem"}}>
                {[["Contract",php2(r.contract)],["Paid",php2(r.cash)],["Balance",php2(r.balance)]].map(([k,v])=>(
                  <div key={k} style={{background:"#f8fafc",borderRadius:7,padding:"5px 7px"}}><div style={{fontSize:".56rem",color:C.faint,textTransform:"uppercase"}}>{k}</div><div style={{fontWeight:700}}>{v}</div></div>))}
              </div>
              {r.progress.length>0&&<div style={{fontSize:".68rem",color:C.muted,marginTop:6}}>{r.progress.map((p,i)=><div key={p.id}>{i+1}. {fmtD(p.payDate)} · {php2(p.amount)}{p.refNo?` · ${p.refNo}`:""}</div>)}</div>}
              {r.dueNow>1&&<div style={{fontSize:".7rem",color:C.blue,fontWeight:700,marginTop:4}}>Certified, unpaid: {php2(r.dueNow)}</div>}
            </div>
          ))}
        </div>
      ):(
        <div style={{background:"#fff",border:`1px solid ${C.line}`,borderRadius:12,overflow:"auto",maxHeight:"70vh"}}>
          <table style={{borderCollapse:"collapse",width:"100%",minWidth:1100}}>
            <thead><tr>
              <spmTh style={spmTh}>Subcontractor</spmTh><spmTh style={spmTh}>Project</spmTh><spmTh style={spmTh}>WO #</spmTh>
              <spmTh style={spmThR}>Total contract</spmTh>
              {Array.from({length:nCols},(_,i)=><spmTh key={i} style={{...spmThR,background:"#eef2ff"}}>{i===MAX_COLS-1?`${i+1}+`:i+1}</spmTh>)}
              <spmTh style={spmThR}>Total paid</spmTh><spmTh style={spmThR}>Retention</spmTh><spmTh style={spmThR}>EWT</spmTh><spmTh style={spmThR}>Balance</spmTh>
              <spmTh style={spmThR}>Cert., unpaid</spmTh><spmTh style={spmTh}>Status</spmTh>
            </tr></thead>
            <tbody>
              {rows.map(r=>(
                <tr key={r.id}>
                  <spmTd style={{...spmTd,maxWidth:180}}><button style={{...linkBtn,fontWeight:600}} onClick={()=>setLedger({kind:"supplier",id:r.subcon})}>{r.subcon}</button></spmTd>
                  <spmTd style={{...spmTd,maxWidth:220}}>{r.dealId?<button style={linkBtn} onClick={()=>setLedger({kind:"project",id:r.dealId})}>{r.project}</button>:r.project}
                    {r.terms&&<div style={{fontSize:".6rem",color:C.faint}}>{r.terms}</div>}</spmTd>
                  <spmTd style={{...spmTd,fontFamily:"'IBM Plex Mono',monospace",whiteSpace:"nowrap"}} title={r.scope}>{r.woNumber}</spmTd>
                  <spmTd style={{...spmTdR,fontWeight:700}}>{php2(r.contract)}{r.retPct>0&&<div style={{fontSize:".6rem",color:C.faint}}>ret. {r.retPct}%</div>}</spmTd>
                  {Array.from({length:nCols},(_,i)=><spmTd key={i} style={{...spmTdR,background:"#fafbff"}}>{payCell(r,i)}</spmTd>)}
                  <spmTd style={{...spmTdR,fontWeight:700,color:C.ok}}>{r.cash>0?php2(r.cash):"—"}{r.contract>0&&r.cash>0&&<div style={{fontSize:".6rem",color:C.faint}}>{r.paidPct}%</div>}</spmTd>
                  <spmTd style={spmTdR}>{r.retHeld>0?php2(r.retHeld):"—"}</spmTd>
                  <spmTd style={spmTdR}>{r.ewt>0?php2(r.ewt):"—"}</spmTd>
                  <spmTd style={{...spmTdR,fontWeight:700,color:r.balance>1?C.bad:C.ok}}>{php2(r.balance)}</spmTd>
                  <spmTd style={{...spmTdR,color:C.blue,fontWeight:r.dueNow>1?700:400}}>{r.dueNow>1?php2(r.dueNow):"—"}</spmTd>
                  <spmTd style={{...spmTd,whiteSpace:"nowrap"}}>{statusChip(r)}{r.certBy&&<div style={{fontSize:".6rem",color:C.faint}}>by {r.certBy}</div>}</spmTd>
                </tr>
              ))}
            </tbody>
            <tfoot><tr style={{background:"#f1f5f9",fontWeight:800}}>
              <spmTd style={{...spmTd,fontWeight:800}} colSpan={3}>Total · {rows.length} WOs</spmTd>
              <spmTd style={{...spmTdR,fontWeight:800}}>{php2(tot("contract"))}</spmTd>
              {Array.from({length:nCols},(_,i)=><spmTd key={i} style={spmTdR}/>)}
              <spmTd style={{...spmTdR,fontWeight:800}}>{php2(tot("cash"))}</spmTd>
              <spmTd style={{...spmTdR,fontWeight:800}}>{php2(tot("retHeld"))}</spmTd>
              <spmTd style={{...spmTdR,fontWeight:800}}>{php2(tot("ewt"))}</spmTd>
              <spmTd style={{...spmTdR,fontWeight:800}}>{php2(tot("balance"))}</spmTd>
              <spmTd style={{...spmTdR,fontWeight:800}}>{php2(tot("dueNow"))}</spmTd>
              <spmTd style={spmTd}/>
            </tr></tfoot>
          </table>
        </div>
      )}
      <LedgerHost open={ledger} setOpen={setLedger} prs={prs} swos={swos} payables={payables} payPays={payPays} deals={deals} exps={exps} today={today}/>
    </div>
  );
}
