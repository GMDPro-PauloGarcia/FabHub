import React,{useState,useMemo} from "react";
import {today as TODAY,useIsMobile} from "../shared";
import {projDisplayName,isSubconPayable,subconDpAllowPct,dealDpClear,canonRole} from "../core";
import {num,r2,php2,buildOrders,payBalance} from "../data/ledger";
import {LedgerHost,linkBtn} from "./Ledgers";

// ─── PURCHASING (Orders › Purchasing) ──────────────────────────────────────
// One row per supplier PO and subcon Work Order: Ordered → Received (PO, by
// Warehouse) / Certified (WO, by the PM) → Billed → Paid → Payable now, and the
// next step with who owns it. Agreed with Paulo 2026-11-06 (mockup "FabHub
// Subcontractors Hub"). Procurement and Finance see the same rows; "Needs me"
// and the buttons follow the role.
//
// Nothing here writes. Every button opens the screen that already does the job
// (bill form, Supplier Bills, Subcon Billing, Purchase Orders, Work Orders), so
// the money rules stay in one place: the database guards and savePayable /
// approvePayable / recordPayments in App.jsx.
//
// Numbers come from buildOrders (src/data/ledger.js), the same rows the
// supplier and project ledgers use. A PO line closed at the 5 Nov 2026 AP
// cutover ("Closed at AP cutover…") counts as received but is labelled: its
// receipt was never proven.

const PHC={ink:"#0f172a",muted:"#475569",faint:"#64748b",line:"#e2e8f0",navy:"#0B2545",blue:"#1d4ed8",ok:"#047857",warn:"#b45309",bad:"#b91c1c"};
const PH_WAIT={approve:"Cost Control / a Manager (Marian: her team's POs up to ₱50K)",approveBill:"a bill approver",warehouse:"Warehouse",pm:"the PM",finance:"Finance",subcon:"the subcontractor",supplier:"the supplier"};
// What each FabHub role acts on. Approving / issuing a PO or WO: a Manager or the
// Procurement Manager. Approving a bill: a Manager or Finance (not Mark).
const PH_ROLE_KEYS={Manager:["approve","approveBill","pm"],ProcurementManager:["approve","procurement"],Procurement:["procurement"],
  Finance:["approveBill","finance"],FinanceAssistant:["finance"],Accounting:["finance"],Warehouse:["warehouse"],ProjectMover:["pm"],Operations:["pm"]};
const PH_CUTOVER=/^Closed at AP cutover/i;
const phLineVal=l=>num(l.actUnitCost)||num(l.estUnitCost);

export function purchasingRows({prs=[],swos=[],payables=[],deals=[]}){
  const dealById=new Map(deals.map(d=>[d.id,d]));
  const woByNo=new Map(swos.map(w=>[w.woNumber,w]));
  return buildOrders({prs,swos,payables}).filter(o=>o.status!=="Cancelled").map(o=>{
    const isWO=o.kind==="WO";
    const wo=isWO?woByNo.get(o.no):null;
    const ordered=r2(o.amount);
    const bills=o.bills||[];
    const billed=r2(o.billed), paid=r2(o.paid);
    const pendingBills=bills.filter(b=>(b.approvalStatus||"Approved")!=="Approved"&&payBalance(b)>0);
    let received=0, recPct=0, recNote="", cutover=false, certPct=0;
    if(isWO){
      const cert=bills.filter(b=>isSubconPayable(b)&&b.verifiedBy&&num(b.verificationPct)>0).sort((a,b)=>num(b.verificationPct)-num(a.verificationPct))[0];
      certPct=cert?num(cert.verificationPct):0;
      recPct=certPct; received=r2(certPct/100*ordered);
      recNote=certPct?`PM certified${cert.verifiedBy?` · ${cert.verifiedBy}`:""}`:"Not certified";
    }else{
      const live=(o.items||[]).filter(l=>l.status!=="Cancelled");
      const tot=live.reduce((s,l)=>s+phLineVal(l)*num(l.qty),0);
      const got=live.reduce((s,l)=>{const q=num(l.qty);const d=l.status==="Delivered"?q:Math.min(num(l.qtyDelivered),q);return s+phLineVal(l)*d;},0);
      cutover=live.some(l=>PH_CUTOVER.test(String(l.deliveryNote||"")));
      recPct=tot>0?Math.round(got/tot*100):(o.delivery==="Delivered"?100:0);
      received=r2(recPct/100*ordered);
      recNote=cutover?"Closed at cutover, not proven":o.delivery;
    }
    // Payable now: what could be paid today under the rules.
    let payNow=0;
    if(isWO){
      const allow=Math.max(certPct,subconDpAllowPct(wo));
      payNow=Math.max(0,r2(Math.min(allow/100*ordered,billed)-paid));
    }else if(o.delivery==="Delivered"){
      payNow=r2(bills.filter(b=>(b.approvalStatus||"Approved")==="Approved").reduce((s,b)=>s+payBalance(b),0));
    }
    const deal=dealById.get(o.projectIds?.[0]);
    const project=deal?projDisplayName(deal):(o.projectNames?.[0]||"—");
    const done=ordered>0&&paid>=ordered-1;
    // Next step and who owns it (first that applies).
    let next="",owner="",status="";
    if(!o.issued){
      if(isWO&&deal&&!dealDpClear(deal,deals)){next="Client hasn't paid its down payment: waive it or wait";owner="approve";status="Blocked";}
      else{next=`Approve & issue the ${isWO?"WO":"PO"}`;owner="approve";status="Not issued";}
    }else if(done){next="Done";status="Paid";}
    else if(!isWO&&o.delivery!=="Delivered"){next=o.delivery==="Partly delivered"?"Receive the rest of the delivery":"Receive the delivery";owner="warehouse";status=o.delivery==="Partly delivered"?"Partly received":"Issued";}
    else if(pendingBills.length){next=`Approve ${pendingBills.length>1?`${pendingBills.length} bills`:"the bill"}`;owner="approveBill";status="Bill to approve";}
    else if(isWO&&billed>0&&billed>r2(Math.max(certPct,subconDpAllowPct(wo))/100*ordered)+1){next="Certify % of work done";owner="pm";status="Needs PM";}
    else if(payNow>1){next=`Pay ${php2(payNow)}`;owner="finance";status="To pay";}
    else if(!isWO&&billed<ordered-1){next="Enter the supplier's invoice";owner="finance";status="Received";}
    else if(isWO&&billed<ordered-1){next=billed>0?"Waiting for the next billing":"Waiting for the first billing";owner="subcon";status=billed>0?"In progress":"Issued";}
    else{next="Waiting";status="Open";}
    return {key:o.kind+":"+o.no,isWO,type:isWO?"WO":"PO",no:o.no,vendor:o.vendor||"—",dealId:o.projectIds?.[0]||null,project,date:o.date||"",
      ordered,received,recPct,recNote,cutover,certPct,billed,paid,payNow,bills,wo,lines:o.items||[],
      next,owner,status,done,terms:isWO&&wo?(num(wo.dpPct)?`${num(wo.dpPct)}% DP`:"no DP"):""};
  }).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
}

const PH_STATUS={"Blocked":["#fee2e2","#991b1b"],"Not issued":["#f1f5f9","#334155"],"Issued":["#dbeafe","#1e3a8a"],"In progress":["#dbeafe","#1e3a8a"],
  "Partly received":["#fef3c7","#92400e"],"Received":["#dbeafe","#1e3a8a"],"Bill to approve":["#ede9fe","#5b21b6"],"Needs PM":["#fff7ed","#9a3412"],
  "To pay":["#ffedd5","#9a3412"],"Paid":["#dcfce7","#166534"],"Open":["#f1f5f9","#334155"]};
const phChip=t=>{const c=PH_STATUS[t]||PH_STATUS.Open;return <span style={{fontSize:".68rem",fontWeight:700,padding:"2px 8px",borderRadius:999,background:c[0],color:c[1],whiteSpace:"nowrap"}}>{t}</span>;};
const phTag=t=><span style={{fontSize:".64rem",fontWeight:800,padding:"2px 6px",borderRadius:5,background:t==="PO"?"#e0e7ff":"#fef3c7",color:t==="PO"?"#3730a3":"#92400e"}}>{t}</span>;
const phPeso=v=>"₱"+num(v).toLocaleString("en-PH",{maximumFractionDigits:0});
// Supplier key for grouping: the same rule as ap_vendor_key() in the database
// (first 8 letters/digits), so "FCI" spellings of one supplier land together.
const phVendorKey=v=>String(v||"").replace(/[^a-zA-Z0-9]/g,"").toLowerCase().slice(0,8)||"—";

export default function PurchasingHub({prs=[],swos=[],payables=[],payPays=[],deals=[],exps=[],role="",today=TODAY,
  onNewBilling=null,onPayBill=null,onGo=null}){
  const mob=useIsMobile();
  const myKeys=PH_ROLE_KEYS[role]||PH_ROLE_KEYS[canonRole(role)]||[];
  const[kind,setKind]=useState("all");
  // Opens on Open (every unpaid order), so each supplier line shows its full balance; "Needs me" is one click away.
  const[view,setView]=useState("open");
  const[q,setQ]=useState("");
  const[openKey,setOpenKey]=useState(null);
  const[limit,setLimit]=useState(80);
  const[ledger,setLedger]=useState(null);
  // By supplier (default, 2026-11-11): one line per supplier / subcontractor with
  // what was ordered, received, billed, paid, unpaid (ordered − paid) and payable now; its POs and WOs
  // open underneath. Finance and Procurement see the same lines.
  const[groupBy,setGroupBy]=useState("supplier");
  const[openSup,setOpenSup]=useState(()=>new Set());
  const all=useMemo(()=>purchasingRows({prs,swos,payables,deals}),[prs,swos,payables,deals]);

  const mine=r=>!!r.owner&&myKeys.includes(r.owner);
  const needle=q.trim().toLowerCase();
  const byKind=all.filter(r=>kind==="all"||(kind==="po"?!r.isWO:r.isWO));
  const rows=byKind.filter(r=>view==="all"||(view==="open"?!r.done:mine(r)))
    .filter(r=>!needle||[r.no,r.vendor,r.project].some(v=>String(v).toLowerCase().includes(needle)));
  const shown=rows.slice(0,limit);
  const groups=(()=>{
    const m=new Map();
    rows.forEach(r=>{const k=phVendorKey(r.vendor);if(!m.has(k))m.set(k,{key:k,name:r.vendor,rows:[]});m.get(k).rows.push(r);});
    return [...m.values()].map(g=>{
      const t=k=>r2(g.rows.reduce((s,r)=>s+num(r[k]),0));
      const ordered=t("ordered"),paid=t("paid");
      return {...g,ordered,received:t("received"),billed:t("billed"),paid,payNow:t("payNow"),owed:Math.max(0,r2(ordered-paid)),
        nPO:g.rows.filter(r=>!r.isWO).length,nWO:g.rows.filter(r=>r.isWO).length,mine:g.rows.filter(mine).length,
        toApprove:g.rows.filter(r=>r.status==="Bill to approve").length};
    }).sort((a,b)=>b.payNow-a.payNow||b.owed-a.owed||String(a.name).localeCompare(String(b.name)));
  })();
  const supOpen=k=>!!needle||openSup.has(k);
  const toggleSup=k=>setOpenSup(s=>{const n=new Set(s);n.has(k)?n.delete(k):n.add(k);return n;});
  const open=byKind.filter(r=>!r.done);
  const sum=k=>r2(open.reduce((s,r)=>s+num(r[k]),0));
  const kpis=[
    ["Open orders",phPeso(sum("ordered")),`${open.length} ${kind==="po"?"POs":kind==="wo"?"WOs":"POs and WOs"}`],
    ["Received / certified",phPeso(sum("received")),`${open.filter(r=>r.cutover).length} closed at cutover, not proven`],
    ["Billed",phPeso(sum("billed")),`${phPeso(Math.max(0,sum("ordered")-sum("billed")))} not billed yet`],
    ["Paid",phPeso(sum("paid")),"on open orders"],
    ["Payable now",phPeso(sum("payNow")),"received or certified, billed, approved"],
  ];
  const mineCount=byKind.filter(mine).length;

  const pill=(on)=>({minHeight:36,padding:"0 13px",borderRadius:999,border:`1.5px solid ${on?PHC.navy:"#cbd5e1"}`,background:on?PHC.navy:"#fff",color:on?"#fff":PHC.ink,fontFamily:"inherit",fontSize:".76rem",fontWeight:700,cursor:"pointer"});
  const btn=(primary)=>({minHeight:36,padding:"0 12px",borderRadius:8,border:primary?"none":"1px solid #cbd5e1",background:primary?PHC.navy:"#fff",color:primary?"#fff":PHC.ink,fontFamily:"inherit",fontSize:".76rem",fontWeight:700,cursor:"pointer"});

  const actionsFor=r=>{
    const a=[];
    const can=k=>myKeys.includes(k);
    if(can("finance")&&onNewBilling&&r.billed<r.ordered-1&&!r.done) a.push({l:r.isWO?"+ Log subcon billing":"+ Enter supplier invoice",f:()=>onNewBilling(r),primary:true});
    const payable=r.bills.find(b=>(b.approvalStatus||"Approved")==="Approved"&&payBalance(b)>0);
    if(can("finance")&&onPayBill&&payable&&r.payNow>1) a.push({l:`Pay ${payable.apNumber||"bill"}`,f:()=>onPayBill(payable),primary:!a.length});
    if(can("approveBill")&&onGo&&r.bills.some(b=>(b.approvalStatus||"Approved")!=="Approved")) a.push({l:"Approve in Supplier Bills",f:()=>onGo("bills")});
    if(can("pm")&&onGo&&r.isWO) a.push({l:"Certify in Subcon Billing",f:()=>onGo("subconcert")});
    if(onGo) a.push({l:r.isWO?"Open in Subcon Work Orders":"Open in Purchase Orders",f:()=>onGo(r.isWO?"subconwo":"procurement")});
    return a;
  };

  const detail=r=>(
    <div style={{background:"#f8fafc",borderTop:`1px solid ${PHC.line}`,padding:"12px 16px",display:"flex",flexDirection:"column",gap:10}}>
      <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
        {actionsFor(r).map(a=><button key={a.l} onClick={a.f} style={btn(a.primary)}>{a.l}</button>)}
        <button onClick={()=>setLedger({kind:"supplier",id:r.vendor})} style={btn(false)}>Supplier ledger</button>
        {r.dealId&&<button onClick={()=>setLedger({kind:"project",id:r.dealId})} style={btn(false)}>Project ledger</button>}
      </div>
      <div style={{fontSize:".7rem",fontWeight:700,color:PHC.muted,textTransform:"uppercase",letterSpacing:".04em"}}>Bills ({r.bills.length})</div>
      {r.bills.length===0?<div style={{fontSize:".78rem",color:PHC.muted}}>No bill yet.</div>:
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          {r.bills.map(b=>(
            <div key={b.id} style={{display:"flex",flexWrap:"wrap",justifyContent:"space-between",gap:8,background:"#fff",border:`1px solid ${PHC.line}`,borderRadius:8,padding:"6px 10px",fontSize:".76rem"}}>
              <span><b style={{fontFamily:"'IBM Plex Mono',monospace"}}>{b.apNumber||"(new)"}</b>{b.invoiceNumber?` · inv ${b.invoiceNumber}`:""}{b.invoiceDate?` · ${b.invoiceDate}`:""}</span>
              <span style={{fontVariantNumeric:"tabular-nums"}}>{php2(b.amount)} · {b.approvalStatus||"Approved"} · {b.status||"Unpaid"}{num(b.paidAmount)>0?` · paid ${php2(b.paidAmount)}`:""}</span>
            </div>))}
        </div>}
      {r.cutover&&<div style={{fontSize:".74rem",color:PHC.warn}}>Some lines were marked Delivered at the 5 Nov 2026 AP cutover. The receipt was never recorded, so Warehouse should confirm it.</div>}
    </div>
  );

  const orderRow=r=>{
          const isOpen=openKey===r.key, me=mine(r);
          const head=(
            <div style={{display:"flex",flexDirection:"column",gap:2,minWidth:0}}>
              <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                {phTag(r.type)}
                <button onClick={()=>setOpenKey(isOpen?null:r.key)} aria-expanded={isOpen} style={{...linkBtn,fontWeight:800,fontSize:".84rem"}}>{r.no}</button>
                {phChip(r.status)}
              </div>
              <div style={{fontSize:".78rem",fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.vendor}</div>
              <div style={{fontSize:".7rem",color:PHC.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.project}{r.date?` · ${r.date}`:""}</div>
            </div>);
          const nextCell=(
            <div style={{display:"flex",flexDirection:"column",gap:2}}>
              <div style={{fontSize:".78rem",fontWeight:700,color:me?"#9a3412":PHC.ink}}>{r.next}</div>
              {!r.done&&r.owner&&<div style={{fontSize:".7rem",color:PHC.muted}}>{me?"Waiting on you":`Waiting on ${PH_WAIT[r.owner]||r.owner}`}</div>}
            </div>);
          return(
            <div key={r.key} style={{borderBottom:`1px solid #f1f5f9`,background:isOpen?"#f8fbff":"#fff"}}>
              {mob?(
                <div style={{padding:"10px 12px",display:"flex",flexDirection:"column",gap:8}}>
                  {head}
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:6,fontSize:".72rem"}}>
                    {[["Ordered",phPeso(r.ordered)],[r.isWO?"Certified":"Received",`${r.recPct}%`],["Billed",phPeso(r.billed)],["Paid",phPeso(r.paid)],["Payable now",phPeso(r.payNow)]].map(([k,v])=>(
                      <div key={k} style={{background:"#f8fafc",borderRadius:6,padding:"4px 6px"}}><div style={{fontSize:".58rem",color:PHC.muted,textTransform:"uppercase"}}>{k}</div><div style={{fontWeight:700}}>{v}</div></div>))}
                  </div>
                  {nextCell}
                </div>
              ):(
                <div style={{display:"grid",gridTemplateColumns:"2.4fr repeat(5,1fr) 1.9fr",gap:12,padding:"10px 16px",alignItems:"center",fontSize:".78rem",fontVariantNumeric:"tabular-nums"}}>
                  {head}
                  <div style={{textAlign:"right",fontWeight:700}}>{phPeso(r.ordered)}{r.terms&&<div style={{fontSize:".66rem",fontWeight:500,color:PHC.muted}}>{r.terms}</div>}</div>
                  <div style={{textAlign:"right"}}>{phPeso(r.received)}<div style={{fontSize:".66rem",color:r.cutover?PHC.warn:PHC.muted}}>{r.recPct}% · {r.recNote}</div></div>
                  <div style={{textAlign:"right"}}>{r.billed>0?phPeso(r.billed):"—"}<div style={{fontSize:".66rem",color:PHC.muted}}>{r.bills.length} bill{r.bills.length===1?"":"s"}</div></div>
                  <div style={{textAlign:"right",fontWeight:r.paid>0?700:400}}>{r.paid>0?phPeso(r.paid):"—"}</div>
                  <div style={{textAlign:"right",fontWeight:700,color:r.payNow>1?PHC.warn:PHC.faint}}>{r.payNow>1?phPeso(r.payNow):"—"}</div>
                  {nextCell}
                </div>
              )}
              {isOpen&&detail(r)}
            </div>);
  };
  const inp={border:"1.5px solid #e2e8f0",borderRadius:8,padding:"7px 10px",fontFamily:"inherit",fontSize:".8rem",background:"#fff",minHeight:36,boxSizing:"border-box"};
  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div>
        <h2 style={{margin:0,fontWeight:800,color:PHC.navy,fontSize:"1.2rem"}}>Purchasing</h2>
        <div style={{fontSize:".78rem",color:PHC.muted,marginTop:2}}>Every supplier PO and subcon Work Order from order to last payment, the same view for Procurement and Finance. A PO is received by Warehouse; a WO is certified by the PM.</div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:mob?"1fr 1fr":"repeat(5,minmax(0,1fr))",gap:8}}>
        {kpis.map(([k,v,s])=>(
          <div key={k} style={{background:"#fff",border:`1px solid ${PHC.line}`,borderRadius:10,padding:"10px 12px"}}>
            <div style={{fontSize:".66rem",fontWeight:700,color:PHC.muted}}>{k}</div>
            <div style={{fontWeight:800,color:PHC.navy,fontSize:"1.05rem",fontVariantNumeric:"tabular-nums"}}>{v}</div>
            <div style={{fontSize:".66rem",color:PHC.faint}}>{s}</div>
          </div>))}
      </div>

      <div style={{display:"flex",flexWrap:"wrap",gap:6,alignItems:"center"}}>
        <div role="group" aria-label="Group by" style={{display:"flex",gap:6}}>
          {[["supplier","By supplier"],["order","By order"]].map(([id,l])=><button key={id} onClick={()=>{setGroupBy(id);setLimit(80);}} style={pill(groupBy===id)}>{l}</button>)}
        </div>
        <span style={{width:1,height:24,background:PHC.line,margin:"0 4px"}} aria-hidden="true"/>
        <div role="group" aria-label="Order type" style={{display:"flex",gap:6}}>
          {[["all","All"],["po","Supplier POs"],["wo","Subcon WOs"]].map(([id,l])=><button key={id} onClick={()=>{setKind(id);setLimit(80);}} style={pill(kind===id)}>{l}</button>)}
        </div>
        <span style={{width:1,height:24,background:PHC.line,margin:"0 4px"}} aria-hidden="true"/>
        <div role="group" aria-label="Show" style={{display:"flex",gap:6}}>
          {myKeys.length>0&&<button onClick={()=>{setView("mine");setLimit(80);}} style={{...pill(view==="mine"),...(view==="mine"?{}:{background:"#fff7ed",borderColor:"#fed7aa",color:"#9a3412"})}}>Needs me · {mineCount}</button>}
          <button onClick={()=>{setView("open");setLimit(80);}} style={pill(view==="open")}>Open</button>
          <button onClick={()=>{setView("all");setLimit(80);}} style={pill(view==="all")}>All</button>
        </div>
        <input value={q} onChange={e=>setQ(e.target.value)} aria-label="Search orders" placeholder="Search PO/WO no., supplier, project…" style={{...inp,marginLeft:mob?0:"auto",flex:mob?"1 1 100%":"0 1 280px"}}/>
      </div>

      {rows.length===0?<div style={{background:"#fff",border:`1px solid ${PHC.line}`,borderRadius:12,padding:20,color:PHC.muted,fontSize:".85rem"}}>{view==="mine"?"Nothing is waiting on you.":"No orders match."}</div>
      :<div style={{background:"#fff",border:`1px solid ${PHC.line}`,borderRadius:12,overflow:"hidden"}}>
        {!mob&&<div style={{display:"grid",gridTemplateColumns:"2.4fr repeat(5,1fr) 1.9fr",gap:12,padding:"10px 16px",background:"#f8fafc",borderBottom:`1px solid ${PHC.line}`,fontSize:".64rem",fontWeight:700,color:PHC.muted,textTransform:"uppercase",letterSpacing:".04em"}}>
          <div>{groupBy==="supplier"?"Supplier / subcontractor":"Order"}</div><div style={{textAlign:"right"}}>Ordered</div><div style={{textAlign:"right"}}>Received / certified</div><div style={{textAlign:"right"}}>Billed</div><div style={{textAlign:"right"}}>Paid</div><div style={{textAlign:"right"}}>Payable now</div><div>Next step</div>
        </div>}
        {groupBy==="supplier"?groups.slice(0,limit).map(g=>{
          const op=supOpen(g.key);
          return(
            <div key={g.key} style={{borderBottom:`1px solid ${PHC.line}`}}>
              <div role="button" tabIndex={0} aria-expanded={op} onClick={()=>toggleSup(g.key)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();toggleSup(g.key);}}}
                style={mob?{padding:"10px 12px",display:"flex",flexDirection:"column",gap:6,cursor:"pointer",background:"#f8fafc"}
                  :{display:"grid",gridTemplateColumns:"2.4fr repeat(5,1fr) 1.9fr",gap:12,padding:"11px 16px",alignItems:"center",fontSize:".8rem",fontVariantNumeric:"tabular-nums",cursor:"pointer",background:"#f8fafc"}}>
                <div style={{minWidth:0}}>
                  <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                    <span aria-hidden="true" style={{color:PHC.muted,fontSize:".75rem"}}>{op?"▾":"▸"}</span>
                    <span style={{fontWeight:800,color:PHC.navy,fontSize:".86rem",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{g.name}</span>
                  </div>
                  <div style={{fontSize:".7rem",color:PHC.muted,marginLeft:16}}>{[g.nPO?`${g.nPO} PO${g.nPO===1?"":"s"}`:"",g.nWO?`${g.nWO} WO${g.nWO===1?"":"s"}`:""].filter(Boolean).join(" · ")}
                    {g.toApprove>0&&<span style={{marginLeft:6}}>{phChip("Bill to approve")}</span>}
                    {g.mine>0&&<span style={{marginLeft:6,color:"#9a3412",fontWeight:700}}>{g.mine} need{g.mine===1?"s":""} you</span>}</div>
                </div>
                {mob?(
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:6,fontSize:".72rem"}}>
                    {[["Ordered",phPeso(g.ordered)],["Paid",phPeso(g.paid)],["Unpaid",phPeso(g.owed)],["Billed",phPeso(g.billed)],["Payable now",phPeso(g.payNow)]].map(([k,v])=>(
                      <div key={k} style={{background:"#fff",borderRadius:6,padding:"4px 6px"}}><div style={{fontSize:".58rem",color:PHC.muted,textTransform:"uppercase"}}>{k}</div><div style={{fontWeight:700}}>{v}</div></div>))}
                  </div>
                ):(<>
                  <div style={{textAlign:"right",fontWeight:800}}>{phPeso(g.ordered)}</div>
                  <div style={{textAlign:"right"}}>{g.received>0?phPeso(g.received):"—"}</div>
                  <div style={{textAlign:"right"}}>{g.billed>0?phPeso(g.billed):"—"}</div>
                  <div style={{textAlign:"right",fontWeight:700}}>{g.paid>0?phPeso(g.paid):"—"}<div style={{fontSize:".66rem",fontWeight:500,color:g.owed>1?PHC.bad:PHC.ok}}>{g.owed>1?`${phPeso(g.owed)} unpaid`:"fully paid"}</div></div>
                  <div style={{textAlign:"right",fontWeight:800,color:g.payNow>1?PHC.warn:PHC.faint}}>{g.payNow>1?phPeso(g.payNow):"—"}</div>
                  <div><button onClick={e=>{e.stopPropagation();setLedger({kind:"supplier",id:g.name});}} style={{...linkBtn,fontSize:".74rem",fontWeight:700}}>Payment history</button></div>
                </>)}
              </div>
              {op&&<div style={{borderTop:`1px solid ${PHC.line}`,paddingLeft:mob?0:12}}>{g.rows.map(orderRow)}</div>}
            </div>);
        }):shown.map(orderRow)}
        {(groupBy==="supplier"?groups.length>limit:rows.length>shown.length)&&<div style={{padding:12,textAlign:"center"}}><button onClick={()=>setLimit(l=>l+200)} style={btn(false)}>Show more ({groupBy==="supplier"?`${groups.length-limit} more suppliers`:`${rows.length-shown.length} more`})</button></div>}
      </div>}
      <div style={{fontSize:".7rem",color:PHC.faint}}>Payable now: subcon WOs up to the higher of PM-certified % and down payment %, never past what was billed; supplier POs once fully received and the bill is approved. A Manager can still pay a partly received PO from Supplier Bills.</div>
      <LedgerHost open={ledger} setOpen={setLedger} prs={prs} swos={swos} payables={payables} payPays={payPays} deals={deals} exps={exps} today={today}/>
    </div>
  );
}
