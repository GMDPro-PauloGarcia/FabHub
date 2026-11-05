import React,{useState,useEffect,useMemo} from "react";
import {today as TODAY,addDaysLocalISO,useIsMobile} from "../shared";
import {projDisplayName,costSummary,milestoneBalance} from "../core";
import {supabase,isSupabaseReady} from "../supabaseClient";
import {num,r2,php2,payBalance,payIsOpen,deliveryOf} from "../data/ledger";
import {runThursday,latestCash} from "./PaymentRun";
import {expected2307,key2307,quarterOf} from "./Bir2307";
import {LedgerHost} from "./Ledgers";

// ─── MONITORING BOARD (traffic lights) ─────────────────────────────────────
// Page 3 of "GMD Monitoring Flow" (Nov 2026): what the Finance & Procurement
// desk watches, green / amber / red, from FabHub's own data. The thresholds
// below are the flow's PROPOSALS: Management confirms them, then they're edited
// here (and in monitoring_board_alert(), the Monday Telegram summary).
// A metric FabHub can't measure yet says so instead of showing a fake green.

export const THRESHOLDS={
  committedVsBudget:{watch:95,act:100},       // % of project budget
  overdueDays:{watch:1,act:7},                // days the oldest bill is past due
  dso:{watch:46,act:60},                      // days
  arOver60Share:{watch:10,act:20},            // % of receivables
  billedVsAccomplished:{watch:95,act:85},     // % (lower is worse)
  belowMin:{watch:1,act:3},                   // items
  slowMovingShare:{watch:10,act:20},          // % of stock value, no movement 90 days
  client2307:{watch:1,act:2},                 // outstanding at quarter end
  escalate:{overBudgetPct:5,overBudgetPeso:20000,marginBelow:10,collectionOverdueDays:30},
};
const C={ink:"#0f172a",muted:"#64748b",faint:"#94a3b8",line:"#e2e8f0",navy:"#0B2545"};
const BOARD_LIGHT={ok:{c:"#059669",bg:"#ecfdf5",t:"On track"},watch:{c:"#d97706",bg:"#fffbeb",t:"Watch"},act:{c:"#dc2626",bg:"#fef2f2",t:"Act now"},na:{c:"#94a3b8",bg:"#f8fafc",t:"Not tracked"}};
const hi=(v,t)=>v>t.act?"act":v>=t.watch?"watch":"ok";        // higher is worse
const lo=(v,t)=>v<t.act?"act":v<t.watch?"watch":"ok";         // lower is worse

export default function MonitoringBoard({payables=[],payPays=[],prs=[],swos=[],exps=[],billings=[],deals=[],wonDeals=[],budgets={},inventory=[],stocklog=[],progressOf,cashPositions={},today=TODAY}){
  const mob=useIsMobile();
  const[run,setRun]=useState(undefined);
  const[runs,setRuns]=useState([]);
  const[rows2307,setRows2307]=useState([]);
  const[open,setOpen]=useState(null);
  const[ledger,setLedger]=useState(null);
  useEffect(()=>{
    if(!isSupabaseReady()){setRun(null);return;}
    const thu=runThursday(today);
    supabase.from("payment_runs").select("*").gte("release_date",addDaysLocalISO(today,-21)).then(({data})=>{
      const rs=data||[];setRuns(rs);setRun(rs.find(r=>r.release_date===thu&&r.status!=="Cancelled")||null);
    });
    supabase.from("bir_2307").select("*").then(({data})=>setRows2307(data||[]));
  },[today]);

  const M=useMemo(()=>{
    const out={};
    const dealById=new Map(deals.map(d=>[d.id,d]));
    const name=id=>{const d=dealById.get(id);return d?projDisplayName(d):"—";};
    // ── Payments ──
    const thu=runThursday(today);
    const cash=latestCash(cashPositions,today);
    const runTotal=run?r2((run.items||[]).reduce((s,i)=>s+num(i.amount),0)):r2(payables.filter(p=>payIsOpen(p)&&p.dueDate&&p.dueDate<=thu).reduce((s,p)=>s+payBalance(p),0));
    out.run={label:"This week's run covered by cash",
      light:cash.amount==null?"na":cash.amount>=runTotal?"ok":cash.amount>0?"watch":"act",
      value:cash.amount==null?"No cash position":cash.amount>=runTotal?"Fully":cash.amount>0?"Partly":"No",
      foot:`${run?`Run ${run.status}`:"No run yet: bills due by "+thu} · ${php2(runTotal)} vs cash ${cash.amount==null?"—":php2(cash.amount)}`,
      detail:run?null:"Start the run in Finance › Payment Run."};
    const cost=costSummary(exps,payables,prs,swos).byProject;
    const bud=wonDeals.map(d=>{const b=budgets[d.id];const total=b?num(b.Materials)+num(b.Labor)+num(b.Overhead)+num(b.Subcon):0;const c=cost.get(d.id)||0;return {id:d.id,name:name(d.id),budget:total,cost:c,pct:total>0?Math.round(c/total*100):null};}).filter(x=>x.pct!=null);
    const worst=bud.slice().sort((a,b)=>b.pct-a.pct);
    out.budget={label:"Committed cost vs project budget",light:worst.length?hi(worst[0].pct,THRESHOLDS.committedVsBudget):"na",
      value:worst.length?`${worst[0].pct}% worst`:"No budgets set",foot:`${bud.filter(x=>x.pct>100).length} over budget · ${bud.length} projects with a budget`,
      list:worst.filter(x=>x.pct>=THRESHOLDS.committedVsBudget.watch).slice(0,8).map(x=>({k:x.id,l:x.name,r:`${x.pct}% · ${php2(x.cost)} of ${php2(x.budget)}`,project:x.id}))};
    const overdue=payables.filter(p=>payIsOpen(p)&&p.dueDate&&p.dueDate<today);
    const maxDays=overdue.reduce((m,p)=>Math.max(m,Math.round((new Date(today)-new Date(p.dueDate))/86400000)),0);
    const undated=payables.filter(p=>payIsOpen(p)&&!p.dueDate).length;
    out.overdue={label:"Overdue supplier / subcon payables",light:overdue.length?hi(maxDays,THRESHOLDS.overdueDays):(undated?"watch":"ok"),
      value:overdue.length?`${maxDays} days`:"None",foot:`${overdue.length} bill(s) · ${php2(overdue.reduce((s,p)=>s+payBalance(p),0))}${undated?` · ${undated} with no due date`:""}`,
      list:overdue.sort((a,b)=>String(a.dueDate).localeCompare(String(b.dueDate))).slice(0,8).map(p=>({k:p.id,l:`${p.vendor} ${p.apNumber||""}`,r:`due ${p.dueDate} · ${php2(payBalance(p))}`,supplier:p.vendor}))};
    const since=addDaysLocalISO(today,-90);
    const paidIds=new Set(payPays.filter(x=>x.status!=="Cancelled"&&String(x.payDate||"")>=since).map(x=>x.payableId));
    const unmatched=payables.filter(p=>paidIds.has(p.id)&&(p.poId||p.poNumber)&&p.category!=="Subcontractor").filter(p=>{
      const lines=prs.filter(x=>x.poNumber===(p.poId||p.poNumber));return lines.length&&deliveryOf(lines)!=="Delivered";});
    out.match={label:"Invoices paid without full match",light:unmatched.length?"act":"ok",value:String(unmatched.length),foot:"PO bills paid in the last 90 days, PO not fully delivered",
      list:unmatched.slice(0,8).map(p=>({k:p.id,l:`${p.vendor} ${p.apNumber||""}`,r:`PO ${p.poId||p.poNumber}`,supplier:p.vendor}))};
    const billedPct={};billings.forEach(m=>{if(m.dealId&&m.status!=="Cancelled"&&m.status!=="Draft")billedPct[m.dealId]=(billedPct[m.dealId]||0)+num(m.amount);});
    const subOver=payables.filter(p=>p.category==="Subcontractor"&&num(p.verificationPct)>0&&p.projectId).map(p=>{
      const d=dealById.get(p.projectId);const contract=num(d?.value);const bp=contract>0?Math.round((billedPct[p.projectId]||0)/contract*100):null;
      return {p,cert:num(p.verificationPct),client:bp};}).filter(x=>x.client!=null&&x.cert>x.client);
    out.subcon={label:"Subcon certified vs client-approved %",light:subOver.length?"act":"ok",value:subOver.length?`${subOver.length} ahead`:"≤ client %",foot:"client-approved % = billed to the client ÷ contract",
      list:subOver.slice(0,8).map(x=>({k:x.p.id,l:`${x.p.vendor} ${x.p.apNumber||""}`,r:`certified ${x.cert}% · client ${x.client}%`,project:x.p.projectId}))};

    // ── Collections ──
    const ym=today.slice(0,7),day=Number(today.slice(8,10));
    const due=billings.filter(m=>m.status!=="Cancelled"&&String(m.plannedDate||"").slice(0,7)===ym);
    const lateBills=day>25?due.filter(m=>{const s=m.sentDate||m.invoiceDate;return !s||s>`${ym}-25`;}):[];
    out.sent={label:"Billings sent by Day 25",light:day<=25?(due.length?"ok":"na"):lateBills.length===0?"ok":lateBills.length===1?"watch":"act",
      value:day<=25?`${due.length} planned`:lateBills.length?`${lateBills.length} late`:"All",foot:day<=25?`this month's milestones · cut-off Day 25`:"milestones planned this month",
      list:lateBills.slice(0,8).map(m=>({k:m.id,l:name(m.dealId),r:`${m.name||"milestone"} · ${php2(m.amount)}`,project:m.dealId}))};
    const acc=wonDeals.map(d=>{const prog=progressOf?progressOf(d.id):null;const contract=num(d.value);if(prog==null||!(prog>0)||!(contract>0)) return null;const bp=(billedPct[d.id]||0)/contract*100;return {id:d.id,name:name(d.id),prog,bp:Math.round(bp),ratio:Math.round(bp/prog*100)};}).filter(Boolean);
    const accWorst=acc.slice().sort((a,b)=>a.ratio-b.ratio);
    out.billedAcc={label:"Billed vs accomplished",light:accWorst.length?lo(accWorst[0].ratio,THRESHOLDS.billedVsAccomplished):"na",
      value:accWorst.length?`${accWorst[0].ratio}% worst`:"No progress data",foot:"billed % ÷ project progress % (Ops progress, not yet QS-validated)",
      list:accWorst.filter(x=>x.ratio<THRESHOLDS.billedVsAccomplished.watch).slice(0,8).map(x=>({k:x.id,l:x.name,r:`billed ${x.bp}% · done ${x.prog}%`,project:x.id}))};
    const arRows=billings.filter(m=>m.status!=="Cancelled"&&m.status!=="Draft"&&m.invoiceDate).map(m=>({m,bal:milestoneBalance(m,dealById.get(m.dealId))})).filter(x=>x.bal>0.5);
    const ar=arRows.reduce((s,x)=>s+x.bal,0);
    const billed90=billings.filter(m=>m.status!=="Cancelled"&&m.invoiceDate&&m.invoiceDate>=since).reduce((s,m)=>s+num(m.amount),0);
    const dso=billed90>0?Math.round(ar/billed90*90):null;
    out.dso={label:"Days sales outstanding (DSO)",light:dso==null?"na":hi(dso,THRESHOLDS.dso),value:dso==null?"—":`${dso} days`,foot:`AR ${php2(ar)} · billed in 90 days ${php2(billed90)}`};
    const d60=addDaysLocalISO(today,-60);
    const over60=arRows.filter(x=>x.m.invoiceDate<d60);
    const share60=ar>0?Math.round(over60.reduce((s,x)=>s+x.bal,0)/ar*100):0;
    out.ar60={label:"Receivables over 60 days (share)",light:ar>0?hi(share60,THRESHOLDS.arOver60Share):"ok",value:`${share60}%`,foot:`${over60.length} invoice(s) · ${php2(over60.reduce((s,x)=>s+x.bal,0))}`,
      list:over60.sort((a,b)=>b.bal-a.bal).slice(0,8).map(x=>({k:x.m.id,l:name(x.m.dealId),r:`${x.m.invoiceNo||x.m.name||"invoice"} · ${x.m.invoiceDate} · ${php2(x.bal)}`,project:x.m.dealId}))};
    const qNow=quarterOf(today);
    const qPrev=qNow.endsWith("Q1")?`${Number(qNow.slice(0,4))-1}-Q4`:`${qNow.slice(0,5)}Q${Number(qNow.slice(-1))-1}`;
    const rec=new Map(rows2307.map(r=>[key2307(r),r]));
    const owed=expected2307({payables,payPays,billings,deals}).filter(e=>e.direction==="receive"&&e.quarter===qPrev&&!["Received","Not required"].includes(rec.get(key2307(e))?.status));
    out.c2307={label:`Client 2307s outstanding (${qPrev})`,light:owed.length===0?"ok":owed.length<=THRESHOLDS.client2307.act?"watch":"act",value:String(owed.length),foot:php2(owed.reduce((s,e)=>s+e.ewt,0))+" EWT not yet backed by a 2307",
      list:owed.sort((a,b)=>b.ewt-a.ewt).slice(0,8).map(e=>({k:key2307(e),l:e.project||e.party,r:php2(e.ewt),project:e.dealId}))};

    // ── Stock ──
    const below=inventory.filter(i=>num(i.reorderPoint)>0&&num(i.qtyOnHand)<num(i.reorderPoint));
    out.belowMin={label:"Items below minimum level",light:inventory.length?(below.length===0?"ok":below.length<=THRESHOLDS.belowMin.act?"watch":"act"):"na",value:String(below.length),foot:`${inventory.filter(i=>num(i.reorderPoint)>0).length} items have a minimum set`,
      list:below.slice(0,8).map(i=>({k:i.id,l:i.name||i.itemName||"item",r:`${num(i.qtyOnHand)} on hand · min ${num(i.reorderPoint)}`}))};
    const moved=new Set(stocklog.filter(m=>String(m.date||m.created_at||"").slice(0,10)>=since).map(m=>m.itemId));
    const valued=inventory.filter(i=>num(i.qtyOnHand)>0);
    const val=i=>num(i.qtyOnHand)*(num(i.avgCost)||num(i.lastPurchasePrice));
    const totalVal=valued.reduce((s,i)=>s+val(i),0);
    const slow=valued.filter(i=>!moved.has(i.id));
    const slowShare=totalVal>0?Math.round(slow.reduce((s,i)=>s+val(i),0)/totalVal*100):0;
    out.slow={label:"Slow-moving stock (90 days, share of value)",light:totalVal>0?hi(slowShare,THRESHOLDS.slowMovingShare):"na",value:totalVal>0?`${slowShare}%`:"No stock value",foot:`${slow.length} item(s) · ${php2(slow.reduce((s,i)=>s+val(i),0))}`};
    out.accuracy={label:"Inventory accuracy (count vs card)",light:"na",value:"—",foot:"needs stock counts recorded against the card"};
    out.boq={label:"Material usage vs BOQ, per project",light:"na",value:"—",foot:"needs stock issues tagged to BOQ lines"};
    out.delays={label:"Site delays from stock-outs",light:"na",value:"—",foot:"needs PM updates to flag a stock-out"};

    // ── Escalations ──
    const E=THRESHOLDS.escalate;
    const esc=[];
    bud.filter(x=>x.cost-x.budget>Math.min(x.budget*E.overBudgetPct/100,E.overBudgetPeso)).forEach(x=>esc.push({k:"b"+x.id,l:`Over budget: ${x.name}`,r:`${php2(x.cost-x.budget)} over (${x.pct}%)`,project:x.id}));
    wonDeals.forEach(d=>{const contract=num(d.value);const c=cost.get(d.id)||0;if(contract>0&&c>0){const m=Math.round((contract-c)/contract*100);if(m<E.marginBelow) esc.push({k:"m"+d.id,l:`Margin below ${E.marginBelow}%: ${name(d.id)}`,r:`${m}% on cost committed so far`,project:d.id});}});
    const d30=addDaysLocalISO(today,-E.collectionOverdueDays);
    arRows.filter(x=>x.m.dueDate&&x.m.dueDate<d30).forEach(x=>esc.push({k:"c"+x.m.id,l:`Collection overdue ${E.collectionOverdueDays}+ days: ${name(x.m.dealId)}`,r:`${x.m.invoiceNo||x.m.name||"invoice"} · due ${x.m.dueDate} · ${php2(x.bal)}`,project:x.m.dealId}));
    if(cash.amount!=null&&cash.amount<runTotal) esc.push({k:"cash",l:"Cash short for this week's run",r:`${php2(runTotal-cash.amount)} short`});
    out.escalations=esc;
    // Off-cycle payments (last 7 days, not in an approved / released run)
    const inRun=new Set(runs.filter(r=>["Approved","Released"].includes(r.status)).flatMap(r=>(r.items||[]).map(i=>i.payableId)));
    out.offCycle=payPays.filter(x=>x.status!=="Cancelled"&&String(x.payDate||"")>=addDaysLocalISO(today,-7)&&!inRun.has(x.payableId)).length;
    return out;
  },[payables,payPays,prs,swos,exps,billings,deals,wonDeals,budgets,inventory,stocklog,progressOf,cashPositions,today,run,runs,rows2307]);

  const loops=[
    ["Payments","Procurement · AP","#b45309",["run","budget","overdue","match","subcon"]],
    ["Collections","QS · AR (progress billing)","#4338ca",["sent","billedAcc","dso","ar60","c2307"]],
    ["Stock","Warehouse · Procurement","#0f766e",["belowMin","slow","accuracy","boq","delays"]],
  ];
  const reds=loops.map(([n,,,ks])=>({n,k:ks.filter(k=>M[k]?.light==="act").length}));
  const Tile=({k})=>{
    const m=M[k];if(!m) return null;const L=BOARD_LIGHT[m.light];const isOpen=open===k;
    return(
      <div style={{border:`1px solid ${C.line}`,borderLeft:`5px solid ${L.c}`,borderRadius:10,background:"#fff",marginBottom:8}}>
        <button onClick={()=>setOpen(isOpen?null:k)} style={{display:"flex",width:"100%",justifyContent:"space-between",gap:10,alignItems:"center",background:"none",border:"none",padding:"10px 12px",cursor:m.list?.length?"pointer":"default",fontFamily:"inherit",textAlign:"left"}}>
          <div style={{minWidth:0}}>
            <div style={{fontSize:".78rem",fontWeight:700,color:C.ink}}>{m.label}</div>
            <div style={{fontSize:".68rem",color:C.faint,marginTop:2}}>{m.foot}</div>
          </div>
          <div style={{textAlign:"right",flexShrink:0}}>
            <div style={{fontSize:".95rem",fontWeight:800,color:L.c}}>{m.value}</div>
            <div style={{fontSize:".6rem",fontWeight:800,color:L.c,background:L.bg,borderRadius:20,padding:"1px 7px",marginTop:2,textTransform:"uppercase",letterSpacing:".5px"}}>{L.t}</div>
          </div>
        </button>
        {isOpen&&m.list?.length>0&&<div style={{padding:"0 12px 10px"}}>
          {m.list.map(x=>(
            <button key={x.k} onClick={()=>x.project?setLedger({kind:"project",id:x.project}):x.supplier?setLedger({kind:"supplier",id:x.supplier}):null} style={{display:"flex",width:"100%",justifyContent:"space-between",gap:8,background:"#f8fafc",border:"none",borderRadius:7,padding:"6px 9px",marginTop:4,cursor:x.project||x.supplier?"pointer":"default",fontFamily:"inherit",fontSize:".72rem",textAlign:"left"}}>
              <span style={{color:C.ink,fontWeight:600,minWidth:0,overflow:"hidden",textOverflow:"ellipsis"}}>{x.l}</span><span style={{color:C.muted,whiteSpace:"nowrap"}}>{x.r}</span>
            </button>
          ))}
        </div>}
      </div>
    );
  };
  return(
    <div>
      <div style={{marginBottom:12}}>
        <div style={{fontWeight:800,color:C.navy,fontSize:"1.05rem"}}>🚦 Monitoring Board</div>
        <div style={{fontSize:".76rem",color:C.muted,marginTop:2,maxWidth:760}}>The Finance &amp; Procurement desk's traffic lights, from FabHub's data. Thresholds are the monitoring flow's proposals until Management confirms them. A red item goes to the Monday review with an owner and a fix date.</div>
      </div>
      {M.escalations.length>0&&(
        <div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:12,padding:"10px 12px",marginBottom:12}}>
          <div style={{fontSize:".7rem",fontWeight:800,color:"#991b1b",textTransform:"uppercase",letterSpacing:".6px",marginBottom:4}}>Escalate to Management · {M.escalations.length}</div>
          {M.escalations.slice(0,12).map(x=>(
            <button key={x.k} onClick={()=>x.project&&setLedger({kind:"project",id:x.project})} style={{display:"flex",width:"100%",justifyContent:"space-between",gap:8,background:"none",border:"none",padding:"4px 0",cursor:x.project?"pointer":"default",fontFamily:"inherit",fontSize:".74rem",textAlign:"left",borderTop:"1px solid #fee2e2"}}>
              <span style={{color:"#7f1d1d",fontWeight:600}}>{x.l}</span><span style={{color:"#b91c1c",whiteSpace:"nowrap"}}>{x.r}</span>
            </button>
          ))}
          {M.escalations.length>12&&<div style={{fontSize:".7rem",color:"#b91c1c"}}>…and {M.escalations.length-12} more</div>}
        </div>
      )}
      <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"repeat(3,1fr)",gap:12}}>
        {loops.map(([n,who,clr,ks])=>(
          <div key={n}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:6,borderBottom:`3px solid ${clr}`,paddingBottom:4}}>
              <span style={{fontWeight:800,color:clr}}>{n}</span><span style={{fontSize:".66rem",color:C.faint}}>{who}</span>
            </div>
            {ks.map(k=><Tile key={k} k={k}/>)}
          </div>
        ))}
      </div>
      <div style={{fontSize:".72rem",color:C.muted,marginTop:8}}>
        {reds.filter(r=>r.k>=2).map(r=><div key={r.n} style={{color:"#b91c1c",fontWeight:700}}>⚠ {r.n}: {r.k} reds. Two reds in the same loop for two weeks running go to Management.</div>)}
        {M.offCycle>0&&<div>{M.offCycle} supplier payment(s) in the last 7 days were made outside an approved payment run.</div>}
      </div>
      {ledger&&<LedgerHost open={ledger} setOpen={setLedger} prs={prs} swos={swos} payables={payables} payPays={payPays} exps={exps} deals={deals} today={today}/>}
    </div>
  );
}
