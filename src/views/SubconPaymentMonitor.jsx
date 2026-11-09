import React,{useState,useMemo} from "react";
import {today as TODAY,useIsMobile} from "../shared";
import {projDisplayName,isSubconPayable,subconDpAllowPct} from "../core";
import {num,r2,php2} from "../data/ledger";
import {LedgerHost,chip,linkBtn} from "./Ledgers";

// ─── SUBCON PAYMENT MONITORING (read-only) ─────────────────────────────────
// Finance asked (Paolo Gomez, 2026-11-05) for subcontractor progress payments
// in the same layout as the client Sales & Collection sheet: one row per Work
// Order, the contract, each payment as its own column (1, 2, 3 …), total paid,
// retention and balance.
//
// Each subcontractor progress billing is its own bill against the WO (since
// 2026-11-05). "+ Billing" opens the normal bill form pre-filled for the WO;
// everything else here is read-only. Payments are recorded on Supplier Bills /
// Payment Run, and the PM certifies on Subcon Billing. The database keeps a
// WO's bills within its contract and its payments within certified % x
// contract (migrations 20261027160000 and 20261105160000).
//
// Sources: subcon_work_orders (contract), payables whose po_number is the WO
// number (the subcon billings), payable_payments (each payment / release).
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

const gKey=v=>String(v||"").trim().replace(/\s+/g," ").toLowerCase();
const STATUS_CLR={"No bill":C.purple,"Paid outside AP":C.warn,"Fully paid":C.ok,"Not certified":C.bad,"Certified":C.blue,"Down payment":C.blue};

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
    const certBill=bills.filter(b=>b.verifiedBy&&num(b.verificationPct)>0).sort((a,b)=>num(b.verificationPct)-num(a.verificationPct))[0];
    const billed=r2(bills.reduce((s,b)=>s+num(b.amount),0));
    const certPct=certBill?num(certBill.verificationPct):0;
    const gross=r2(progress.reduce((s,x)=>s+num(x.amount)+num(x.retentionAmount),0));
    // Payable now: up to greatest(certified %, the issued WO's down payment %)
    // of the contract, less what's been claimed (payable_payments_subcon_gate).
    const dpPct=subconDpAllowPct(w);
    const allowPct=Math.max(certPct,dpPct);
    // …and never more than the subcon has actually billed.
    const dueNow=allowPct>0&&balance>1?Math.max(0,r2(Math.min(allowPct/100*contract,billed)-gross)):0;
    const status=balance<=1?"Fully paid":woOnlyPaid?"Paid outside AP":!bills.length?"No bill":certBill?"Certified":dpPct>0?"Down payment":"Not certified";
    const d=dealById.get(w.dealId);
    return {id:w.id,wo:w,woNumber:w.woNumber||"—",subcon:w.subcontractor||bills[0]?.vendor||"—",dealId:w.dealId||null,
      project:d?projDisplayName(d):(w.projectName||"—"),scope:w.scopeOfWork||"",terms:w.paymentStructure||w.paymentTerms||"",
      woStatus:w.status||"",contract,retPct:num(w.retentionPct),bills,billed,toBill:Math.max(0,r2(contract-billed)),progress,releases,cash,ewt,retHeld,balance,certPct,
      certBy:certBill?.verifiedBy||"",dpPct,woDpPct:Number(w.dpPct)||0,allowPct,dueNow,status,woOnlyPaid,
      paidPct:contract>0?Math.min(100,Math.round(cash/contract*100)):0};
  }).sort((a,b)=>a.subcon.localeCompare(b.subcon)||String(a.woNumber).localeCompare(String(b.woNumber)));
}

export default function SubconPaymentMonitor({swos=[],payables=[],payPays=[],deals=[],prs=[],exps=[],today=TODAY,onNewBilling=null}){
  const mob=useIsMobile();
  const[q,setQ]=useState("");
  const[filter,setFilter]=useState("open");
  const[ledger,setLedger]=useState(null);
  // Grouped by subcontractor (like Supplier Bills) or one flat row per WO.
  const[byGroup,setByGroup]=useState(true);
  const[openGroups,setOpenGroups]=useState(()=>new Set());
  const all=useMemo(()=>subconMonitorRows({swos,payables,payPays,deals}),[swos,payables,payPays,deals]);

  const FILTERS=[
    ["open","Open balance",r=>r.balance>1],
    ["due","Payable now",r=>r.dueNow>1],
    ["nobill","No bill yet",r=>r.status==="No bill"],
    ["outside","Paid outside AP",r=>r.status==="Paid outside AP"],
    ["paid","Fully paid",r=>r.status==="Fully paid"],
    ["all","All",()=>true],
  ];
  const fx=(FILTERS.find(f=>f[0]===filter)||FILTERS[0])[2];
  const needle=q.trim().toLowerCase();
  const rows=all.filter(fx).filter(r=>!needle||[r.subcon,r.project,r.woNumber,r.scope].some(v=>String(v).toLowerCase().includes(needle)));
  const nCols=Math.min(MAX_COLS,Math.max(1,...rows.map(r=>r.progress.length)));
  // One group per subcontractor (name compared case- and space-insensitively),
  // biggest balance owed first, like the supplier list on Supplier Bills.
  const groups=(()=>{
    const m=new Map();
    rows.forEach(r=>{const k=gKey(r.subcon);if(!m.has(k))m.set(k,{key:k,name:r.subcon,rows:[]});m.get(k).rows.push(r);});
    return [...m.values()].map(g=>({...g,
      contract:r2(g.rows.reduce((t,r)=>t+r.contract,0)),billed:r2(g.rows.reduce((t,r)=>t+r.billed,0)),
      cash:r2(g.rows.reduce((t,r)=>t+r.cash,0)),retHeld:r2(g.rows.reduce((t,r)=>t+r.retHeld,0)),
      ewt:r2(g.rows.reduce((t,r)=>t+r.ewt,0)),balance:r2(g.rows.reduce((t,r)=>t+r.balance,0)),
      dueNow:r2(g.rows.reduce((t,r)=>t+r.dueNow,0)),
      noBill:g.rows.filter(r=>r.status==="No bill").length,
      notCert:g.rows.filter(r=>r.status==="Not certified").length}))
      .sort((a,b)=>b.balance-a.balance||a.name.localeCompare(b.name));
  })();
  const isOpen=k=>!!needle||openGroups.has(k);
  const toggle=k=>setOpenGroups(s=>{const n=new Set(s);n.has(k)?n.delete(k):n.add(k);return n;});
  const allOpen=groups.length>0&&groups.every(g=>openGroups.has(g.key));

  const sum=(rs,k)=>r2(rs.reduce((s,r)=>s+num(r[k]),0));
  const kpis=[
    ["Total WO contract",php2(sum(all,"contract")),`${all.length} work orders`,C.navy],
    ["Paid to date",php2(sum(all,"cash")),`${all.filter(r=>r.cash>0).length} WOs with a payment`,C.ok],
    ["Billed by subcons",php2(sum(all,"billed")),`${php2(sum(all,"toBill"))} not billed yet`,C.purple],
    ["Balance owed",php2(sum(all,"balance")),"contract − paid − EWT",C.bad],
    ["Payable now",php2(sum(all,"dueNow")),"within PM certification or the WO down payment",C.blue],
    ["Retention held",php2(sum(all,"retHeld")),`released at 100% · ${all.filter(r=>r.status==="No bill").length} WOs with no billing`,C.warn],
  ];
  const ewtMissing=all.filter(r=>r.cash>0&&r.ewt<=0).length;

  const exportCsv=()=>{
    const esc=v=>`"${String(v??"").replace(/"/g,'""')}"`;
    const maxN=Math.max(1,...rows.map(r=>r.progress.length));
    const head=["Subcontractor","Project","WO #","Scope","Payment terms","WO status","Total contract","Retention %",
      ...Array.from({length:maxN},(_,i)=>[`Payment ${i+1}`,`Date ${i+1}`,`Ref ${i+1}`]).flat(),
      "Billed","Not billed yet","Total paid","Retention held","EWT","Balance","Certified %","Certified by","Down payment %","Payable now","Status"];
    const lines=[head.map(esc).join(",")];
    rows.forEach(r=>lines.push([r.subcon,r.project,r.woNumber,r.scope,r.terms,r.woStatus,r.contract.toFixed(2),r.retPct,
      ...Array.from({length:maxN},(_,i)=>{const p=r.progress[i];return p?[num(p.amount).toFixed(2),p.payDate,p.refNo]:["","",""];}).flat(),
      r.billed.toFixed(2),r.toBill.toFixed(2),r.cash.toFixed(2),r.retHeld.toFixed(2),r.ewt.toFixed(2),r.balance.toFixed(2),r.certPct||"",r.certBy,r.woDpPct||"",r.dueNow.toFixed(2),r.status].map(esc).join(",")));
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
  const statusChip=r=>chip(r.status==="Certified"?`Certified ${r.certPct}%`:r.status==="Down payment"?`DP ${r.dpPct}% allowed`:r.status,STATUS_CLR[r.status]||C.faint);
  const billBtn=r=>onNewBilling&&r.toBill>1&&r.status!=="Paid outside AP"?<button onClick={()=>onNewBilling(r.wo)} title="Log the subcontractor's next progress billing against this Work Order"
    style={{marginTop:4,display:"block",border:`1.5px solid ${C.navy}`,background:"#fff",color:C.navy,borderRadius:6,padding:"2px 8px",fontFamily:"inherit",fontSize:".66rem",fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>+ Billing</button>:null;
  const inp={border:"1.5px solid #e2e8f0",borderRadius:8,padding:"6px 9px",fontFamily:"inherit",fontSize:".78rem",background:"#fff"};
  const tot=k=>sum(rows,k);

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:10,marginBottom:12}}>
        <div>
          <h2 style={{margin:0,fontWeight:800,color:C.ink,fontSize:"1.15rem"}}>🔨 Subcon Payment Monitoring</h2>
          <div style={{fontSize:".75rem",color:C.muted,marginTop:2,maxWidth:680}}>One line per subcontractor (click to see its Work Orders), like Supplier Bills. Log each subcontractor billing with “+ Billing”; the PM certifies on Subcon Billing; payments are recorded on Supplier Bills.</div>
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
        <div style={{display:"flex",border:`1.5px solid ${C.line}`,borderRadius:20,overflow:"hidden",marginLeft:mob?0:"auto"}}>
          {[[true,"By subcon"],[false,"All WOs"]].map(([v,l])=>(
            <button key={l} onClick={()=>setByGroup(v)} style={{border:"none",background:byGroup===v?C.navy:"#fff",color:byGroup===v?"#fff":C.ink,padding:"4px 11px",fontFamily:"inherit",fontSize:".72rem",fontWeight:700,cursor:"pointer"}}>{l}</button>))}
        </div>
        {byGroup&&!needle&&groups.length>0&&<button onClick={()=>setOpenGroups(allOpen?new Set():new Set(groups.map(g=>g.key)))} style={{...linkBtn,fontSize:".72rem",fontWeight:700}}>{allOpen?"Collapse all":"Expand all"}</button>}
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search subcon, project, WO…" aria-label="Search" style={{...inp,flex:mob?"1 1 100%":"0 1 260px"}}/>
      </div>

      {rows.length===0?<div style={{background:"#fff",border:`1px solid ${C.line}`,borderRadius:12,padding:20,color:C.faint,fontSize:".85rem"}}>No Work Orders match.</div>
      :mob?(
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {(byGroup?groups:[{key:"",rows}]).map(g=>(
          <React.Fragment key={g.key||"all"}>
          {byGroup&&<button onClick={()=>toggle(g.key)} aria-expanded={isOpen(g.key)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,background:"#f1f5f9",border:`1px solid ${C.line}`,borderRadius:10,padding:"9px 12px",fontFamily:"inherit",cursor:"pointer",textAlign:"left"}}>
            <span style={{minWidth:0}}><span style={{fontWeight:800,color:C.ink,fontSize:".84rem"}}>{isOpen(g.key)?"▾":"▸"} {g.name}</span><span style={{fontSize:".7rem",color:C.muted}}> · {g.rows.length} WO{g.rows.length===1?"":"s"}</span></span>
            <span style={{fontWeight:800,color:g.balance>1?C.bad:C.ok,fontSize:".8rem",whiteSpace:"nowrap"}}>{php2(g.balance)}</span>
          </button>}
          {(!byGroup||isOpen(g.key))&&g.rows.map(r=>(
            <div key={r.id} style={{background:"#fff",border:`1px solid ${C.line}`,borderRadius:10,padding:"10px 12px"}}>
              <div style={{display:"flex",justifyContent:"space-between",gap:8}}>
                <div style={{minWidth:0}}>
                  <button style={{...linkBtn,fontWeight:700,fontSize:".84rem"}} onClick={()=>setLedger({kind:"supplier",id:r.subcon})}>{r.subcon}</button>
                  <div style={{fontSize:".7rem",color:C.muted}}><span style={{fontFamily:"monospace"}}>{r.woNumber}</span> · {r.dealId?<button style={linkBtn} onClick={()=>setLedger({kind:"project",id:r.dealId})}>{r.project}</button>:r.project}</div>
                </div>
                <div>{statusChip(r)}</div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginTop:8,fontSize:".72rem"}}>
                {[["Contract",php2(r.contract)],["Billed",php2(r.billed)],["Paid",php2(r.cash)]].map(([k,v])=>(
                  <div key={k} style={{background:"#f8fafc",borderRadius:7,padding:"5px 7px"}}><div style={{fontSize:".56rem",color:C.faint,textTransform:"uppercase"}}>{k}</div><div style={{fontWeight:700}}>{v}</div></div>))}
              </div>
              {r.progress.length>0&&<div style={{fontSize:".68rem",color:C.muted,marginTop:6}}>{r.progress.map((p,i)=><div key={p.id}>{i+1}. {fmtD(p.payDate)} · {php2(p.amount)}{p.refNo?` · ${p.refNo}`:""}</div>)}</div>}
              <div style={{fontSize:".7rem",color:r.balance>1?C.bad:C.ok,fontWeight:700,marginTop:4}}>Balance {php2(r.balance)}</div>
              {r.dueNow>1&&<div style={{fontSize:".7rem",color:C.blue,fontWeight:700,marginTop:2}}>Payable now: {php2(r.dueNow)}</div>}
              {billBtn(r)}
            </div>
          ))}
          </React.Fragment>
          ))}
        </div>
      ):(
        <div style={{background:"#fff",border:`1px solid ${C.line}`,borderRadius:12,overflow:"auto",maxHeight:"70vh"}}>
          <table style={{borderCollapse:"collapse",width:"100%",minWidth:1100}}>
            <thead><tr>
              <th style={spmTh}>Subcontractor</th><th style={spmTh}>Project</th><th style={spmTh}>WO #</th>
              <th style={spmThR}>Total contract</th><th style={spmThR}>Billed</th>
              {Array.from({length:nCols},(_,i)=><th key={i} style={{...spmThR,background:"#eef2ff"}}>{i===MAX_COLS-1?`${i+1}+`:i+1}</th>)}
              <th style={spmThR}>Total paid</th><th style={spmThR}>Retention</th><th style={spmThR}>EWT</th><th style={spmThR}>Balance</th>
              <th style={spmThR}>Payable now</th><th style={spmTh}>Status</th>
            </tr></thead>
            <tbody>
              {(byGroup?groups:[{key:"",rows}]).map(g=>(
              <React.Fragment key={g.key||"all"}>
              {byGroup&&(
                <tr style={{background:"#f8fafc",cursor:"pointer"}} onClick={()=>toggle(g.key)}>
                  <td style={{...spmTd,borderTop:`1px solid ${C.line}`}} colSpan={3}>
                    <button onClick={e=>{e.stopPropagation();toggle(g.key);}} aria-expanded={isOpen(g.key)} aria-label={`${isOpen(g.key)?"Collapse":"Expand"} ${g.name}`} style={{border:"none",background:"none",padding:"0 6px 0 0",cursor:"pointer",color:C.muted,fontSize:".8rem"}}>{isOpen(g.key)?"▾":"▸"}</button>
                    <button style={{...linkBtn,fontWeight:800,fontSize:".8rem"}} onClick={e=>{e.stopPropagation();setLedger({kind:"supplier",id:g.name});}}>{g.name}</button>
                    <span style={{fontSize:".68rem",color:C.muted,marginLeft:6}}>{g.rows.length} WO{g.rows.length===1?"":"s"}</span>
                    {g.noBill>0&&<span style={{marginLeft:6}}>{chip(`${g.noBill} no bill`,C.purple)}</span>}
                    {g.notCert>0&&<span style={{marginLeft:6}}>{chip(`${g.notCert} not certified`,C.bad)}</span>}
                  </td>
                  <td style={{...spmTdR,fontWeight:800,borderTop:`1px solid ${C.line}`}}>{php2(g.contract)}</td>
                  <td style={{...spmTdR,fontWeight:700,borderTop:`1px solid ${C.line}`}}>{g.billed>0?php2(g.billed):"—"}</td>
                  {Array.from({length:nCols},(_,i)=><td key={i} style={{...spmTdR,borderTop:`1px solid ${C.line}`}}/>)}
                  <td style={{...spmTdR,fontWeight:800,color:C.ok,borderTop:`1px solid ${C.line}`}}>{g.cash>0?php2(g.cash):"—"}</td>
                  <td style={{...spmTdR,borderTop:`1px solid ${C.line}`}}>{g.retHeld>0?php2(g.retHeld):"—"}</td>
                  <td style={{...spmTdR,borderTop:`1px solid ${C.line}`}}>{g.ewt>0?php2(g.ewt):"—"}</td>
                  <td style={{...spmTdR,fontWeight:800,color:g.balance>1?C.bad:C.ok,borderTop:`1px solid ${C.line}`}}>{php2(g.balance)}</td>
                  <td style={{...spmTdR,color:C.blue,fontWeight:g.dueNow>1?800:400,borderTop:`1px solid ${C.line}`}}>{g.dueNow>1?php2(g.dueNow):"—"}</td>
                  <td style={{...spmTd,borderTop:`1px solid ${C.line}`}}/>
                </tr>
              )}
              {(!byGroup||isOpen(g.key))&&g.rows.map(r=>(
                <tr key={r.id}>
                  <td style={{...spmTd,maxWidth:180,paddingLeft:byGroup?24:8}}>{byGroup?<span style={{fontSize:".66rem",color:C.faint}}>{r.woStatus}</span>:<button style={{...linkBtn,fontWeight:600}} onClick={()=>setLedger({kind:"supplier",id:r.subcon})}>{r.subcon}</button>}</td>
                  <td style={{...spmTd,maxWidth:220}}>{r.dealId?<button style={linkBtn} onClick={()=>setLedger({kind:"project",id:r.dealId})}>{r.project}</button>:r.project}
                    {r.terms&&<div style={{fontSize:".6rem",color:C.faint}}>{r.terms}</div>}</td>
                  <td style={{...spmTd,fontFamily:"'IBM Plex Mono',monospace",whiteSpace:"nowrap"}} title={r.scope}>{r.woNumber}</td>
                  <td style={{...spmTdR,fontWeight:700}}>{php2(r.contract)}{r.retPct>0&&<div style={{fontSize:".6rem",color:C.faint}}>ret. {r.retPct}%</div>}</td>
                  <td style={spmTdR}>{r.billed>0?php2(r.billed):"—"}<div style={{fontSize:".6rem",color:C.faint}}>{r.bills.length} billing{r.bills.length===1?"":"s"}{r.toBill>1?` · ${php2(r.toBill)} left`:""}</div></td>
                  {Array.from({length:nCols},(_,i)=><td key={i} style={{...spmTdR,background:"#fafbff"}}>{payCell(r,i)}</td>)}
                  <td style={{...spmTdR,fontWeight:700,color:C.ok}}>{r.cash>0?php2(r.cash):"—"}{r.contract>0&&r.cash>0&&<div style={{fontSize:".6rem",color:C.faint}}>{r.paidPct}%</div>}</td>
                  <td style={spmTdR}>{r.retHeld>0?php2(r.retHeld):"—"}</td>
                  <td style={spmTdR}>{r.ewt>0?php2(r.ewt):"—"}</td>
                  <td style={{...spmTdR,fontWeight:700,color:r.balance>1?C.bad:C.ok}}>{php2(r.balance)}</td>
                  <td style={{...spmTdR,color:C.blue,fontWeight:r.dueNow>1?700:400}}>{r.dueNow>1?php2(r.dueNow):"—"}</td>
                  <td style={{...spmTd,whiteSpace:"nowrap"}}>{statusChip(r)}{r.certBy&&<div style={{fontSize:".6rem",color:C.faint}}>by {r.certBy}</div>}{r.woDpPct>0&&<div style={{fontSize:".6rem",color:C.faint}}>DP {r.woDpPct}%{r.dpPct>0?"":" · WO not issued"}</div>}{billBtn(r)}</td>
                </tr>
              ))}
              </React.Fragment>
              ))}
            </tbody>
            <tfoot><tr style={{background:"#f1f5f9",fontWeight:800}}>
              <td style={{...spmTd,fontWeight:800}} colSpan={3}>Total · {rows.length} WOs{byGroup?` · ${groups.length} subcontractor${groups.length===1?"":"s"}`:""}</td>
              <td style={{...spmTdR,fontWeight:800}}>{php2(tot("contract"))}</td>
              <td style={{...spmTdR,fontWeight:800}}>{php2(tot("billed"))}</td>
              {Array.from({length:nCols},(_,i)=><td key={i} style={spmTdR}/>)}
              <td style={{...spmTdR,fontWeight:800}}>{php2(tot("cash"))}</td>
              <td style={{...spmTdR,fontWeight:800}}>{php2(tot("retHeld"))}</td>
              <td style={{...spmTdR,fontWeight:800}}>{php2(tot("ewt"))}</td>
              <td style={{...spmTdR,fontWeight:800}}>{php2(tot("balance"))}</td>
              <td style={{...spmTdR,fontWeight:800}}>{php2(tot("dueNow"))}</td>
              <td style={spmTd}/>
            </tr></tfoot>
          </table>
        </div>
      )}
      <LedgerHost open={ledger} setOpen={setLedger} prs={prs} swos={swos} payables={payables} payPays={payPays} deals={deals} exps={exps} today={today}/>
    </div>
  );
}
