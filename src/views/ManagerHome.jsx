import React,{useMemo} from "react";
import {poLinesTotal,PO_COST_CONTROL_LIMIT,dealDpClear,isBillingOverdue,milestoneBalance,isCashPayment,WON_STAGES} from "../core";
import {payBalance,payIsOpen} from "../data/ledger";

// ─── MANAGER HOME (2026-11-07) ──────────────────────────────────────────────
// Replaces the Manager dashboard's nine sections (two attention panels, four
// charts, a KPI strip, Recent Activity, Upcoming) with three questions:
//   1. Decisions: what is waiting for a Manager, and only a Manager.
//   2. Money: cash in the bank, what to collect, what to pay, collected this month.
//   3. Projects: how far along the active jobs are and which are late.
// Every row opens the page where the work is done; nothing is edited here.
// Charts and trends live on Executive.

const mhNum=v=>Number(String(v??"").replace(/,/g,""))||0;
const mhPeso=v=>{const n=Math.round(mhNum(v));return n>=1e6?"₱"+(n/1e6).toFixed(n>=1e7?1:2).replace(/\.?0+$/,"")+"M":n>=1e3?"₱"+Math.round(n/1e3)+"K":"₱"+n;};
const MH={ink:"#0f172a",muted:"#475569",faint:"#64748b",line:"#e2e8f0",navy:"#0B2545",red:"#b91c1c",amber:"#b45309",green:"#047857"};
const STEPS=[30,60,90,100];
const STEP_CLR={30:"#f59e0b",60:"#3b82f6",90:"#8b5cf6",100:"#059669"};

export default function ManagerHome({session,today,deals=[],billings=[],payables=[],prs=[],pcards={},cash,arTot,dealById,enteredByMe,go,goFin,openProject,isMobile}){
  const first=(session?.name||"").split(" ")[0]||"there";
  const hr=new Date().getHours();
  const greet=hr<12?"Good morning":hr<17?"Good afternoon":"Good evening";

  // ── 1. Decisions ─────────────────────────────────────────────────────────
  const decisions=useMemo(()=>{
    const out=[];
    const byPo={};
    prs.filter(p=>p.status==="Pending Approval"&&p.poNumber).forEach(p=>{(byPo[p.poNumber]=byPo[p.poNumber]||[]).push(p);});
    const pos=Object.entries(byPo).map(([no,ls])=>{
      const tot=poLinesTotal(prs.filter(p=>p.poNumber===no));
      const d=ls.map(l=>deals.find(x=>x.id===(l.projectId||l.dealId))).find(Boolean);
      return{no,tot,held:!!d&&!dealDpClear(d,deals)};
    });
    const big=pos.filter(p=>!p.held&&p.tot>PO_COST_CONTROL_LIMIT);
    if(big.length) out.push({k:"po",n:big.length,l:`PO${big.length>1?"s":""} over ₱150K to approve`,sub:"Cost Control approves up to ₱150K; these need a Manager",amt:big.reduce((s,p)=>s+p.tot,0),tone:"red",open:()=>go("procurement"),cta:"Approve"});
    const bills=payables.filter(p=>payIsOpen(p)&&(p.approvalStatus||"Approved")==="Pending"&&!(enteredByMe&&enteredByMe(p)));
    if(bills.length) out.push({k:"bills",n:bills.length,l:`Supplier bill${bills.length>1?"s":""} to approve`,sub:"Before they can go into a payment run",amt:bills.reduce((s,p)=>s+payBalance(p),0),tone:"red",open:()=>goFin("payables"),cta:"Review"});
    const awards=deals.filter(d=>d.notes&&d.notes.includes("[AWARD REQUEST"));
    if(awards.length) out.push({k:"award",n:awards.length,l:`Award request${awards.length>1?"s":""} to sign off`,sub:awards.slice(0,3).map(d=>d.client||d.ceNo).filter(Boolean).join(", "),tone:"amber",open:()=>go("pipeline"),cta:"Open"});
    const held=pos.filter(p=>p.held);
    if(held.length) out.push({k:"dp",n:held.length,l:`PO${held.length>1?"s":""} held: client hasn't paid the down payment`,sub:"Chase the client, or waive the down payment with a reason",amt:held.reduce((s,p)=>s+p.tot,0),tone:"amber",open:()=>go("procurement"),cta:"Open"});
    const qs=pos.filter(p=>!p.held&&p.tot<=PO_COST_CONTROL_LIMIT);
    if(qs.length) out.push({k:"qs",n:qs.length,l:`PO${qs.length>1?"s":""} with Cost Control`,sub:"Up to ₱150K: Ardrin / Rodney approve. FYI only",amt:qs.reduce((s,p)=>s+p.tot,0),tone:"info",open:()=>go("procurement"),cta:"View"});
    return out;
  },[prs,deals,payables,enteredByMe,go,goFin]);

  // ── 2. Money ─────────────────────────────────────────────────────────────
  const money=useMemo(()=>{
    const overdue=billings.filter(b=>b.status!=="Cancelled"&&isBillingOverdue(b,today));
    const overdueAmt=overdue.reduce((s,b)=>s+milestoneBalance(b,dealById?.get(b.dealId)),0);
    const open=payables.filter(payIsOpen);
    const toPay=open.reduce((s,p)=>s+payBalance(p),0);
    const lateBills=open.filter(p=>p.dueDate&&p.dueDate<today);
    const lateAmt=lateBills.reduce((s,p)=>s+payBalance(p),0);
    const mo=String(today).slice(0,7);
    let coll=0;billings.forEach(b=>(b.payments||[]).forEach(p=>{if(p.date&&String(p.date).slice(0,7)===mo&&!p.bounced&&isCashPayment(p))coll+=mhNum(p.amount);}));
    return{overdue:overdue.length,overdueAmt,toPay,lateBills:lateBills.length,lateAmt,coll};
  },[billings,payables,today,dealById]);

  // ── 3. Projects ──────────────────────────────────────────────────────────
  const proj=useMemo(()=>{
    const active=deals.filter(d=>!d.isCostCenter&&!d.standbyPO&&WON_STAGES.includes(d.stage)&&d.stage!=="14 · Completed"&&pcards[d.id]);
    const dist={none:0,30:0,60:0,90:0,100:0};
    active.forEach(d=>{const p=pcards[d.id]?.manualProgress;dist[STEPS.includes(p)?p:"none"]++;});
    const late=active.filter(d=>{const t=pcards[d.id]?.targetEndDate;return t&&t<today&&pcards[d.id]?.manualProgress!==100;})
      .map(d=>({d,t:pcards[d.id].targetEndDate,p:pcards[d.id]?.manualProgress}))
      .sort((a,b)=>String(a.t).localeCompare(String(b.t)));
    return{active:active.length,dist,late};
  },[deals,pcards,today]);

  const box={background:"#fff",border:`1px solid ${MH.line}`,borderRadius:12};
  const H=({n,t,sub})=>(
    <div style={{display:"flex",alignItems:"baseline",gap:8,margin:"18px 0 8px"}}>
      <span style={{background:MH.navy,color:"#fff",borderRadius:20,width:22,height:22,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:".72rem",fontWeight:800}}>{n}</span>
      <span style={{fontWeight:800,color:MH.navy,fontSize:"1rem"}}>{t}</span>
      {sub&&<span style={{fontSize:".74rem",color:MH.faint}}>{sub}</span>}
    </div>
  );
  const TONE={red:{bar:"#dc2626",n:MH.red},amber:{bar:"#f59e0b",n:MH.amber},info:{bar:"#cbd5e1",n:MH.muted}};
  const cashSub=!cash?.latest?"No cash sheet yet":cash.stale?`As of ${cash.latest.date} (${cash.daysOld} day${cash.daysOld===1?"":"s"} old)`:"Today's cash sheet";
  const tiles=[
    {l:"Cash in the bank",v:mhPeso(cash?.total||0),sub:cashSub,warn:!cash?.latest||cash.stale,open:()=>goFin("cashposition")},
    {l:"To collect",v:mhPeso(arTot?.outstanding||0),sub:money.overdue?`${mhPeso(money.overdueAmt)} overdue · ${money.overdue} invoice${money.overdue>1?"s":""}`:"Nothing overdue",warn:money.overdue>0,open:()=>go("billing")},
    {l:"To pay suppliers",v:mhPeso(money.toPay),sub:money.lateBills?`${mhPeso(money.lateAmt)} past due · ${money.lateBills} bill${money.lateBills>1?"s":""}`:"Nothing past due",warn:money.lateBills>0,open:()=>goFin("payables")},
    {l:"Collected this month",v:mhPeso(money.coll),sub:"Cash received, offsets excluded",open:()=>go("billing")},
  ];

  return(
    <div style={{maxWidth:1100}}>
      <div style={{fontWeight:800,color:MH.ink,fontSize:"1.35rem"}}>{greet}, {first}</div>
      <div style={{fontSize:".8rem",color:MH.faint,marginTop:2}}>{decisions.filter(x=>x.tone!=="info").length?`${decisions.filter(x=>x.tone!=="info").reduce((s,x)=>s+x.n,0)} things are waiting for you.`:"Nothing is waiting for you."} Charts and trends are on Executive.</div>

      <H n={1} t="Decisions" sub="waiting for a Manager"/>
      <div style={box}>
        {decisions.length===0&&<div style={{padding:"14px 16px",color:MH.green,fontWeight:700,fontSize:".84rem"}}>Nothing to approve.</div>}
        {decisions.map((x,i)=>(
          <div key={x.k} style={{display:"flex",alignItems:"center",gap:12,padding:"11px 14px",borderTop:i?`1px solid #f1f5f9`:"none",borderLeft:`4px solid ${TONE[x.tone].bar}`,borderRadius:i===0?"12px 0 0 0":i===decisions.length-1?"0 0 0 12px":0}}>
            <div style={{fontWeight:800,fontSize:"1.25rem",color:TONE[x.tone].n,minWidth:34,textAlign:"right"}}>{x.n}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:700,color:MH.ink,fontSize:".86rem"}}>{x.l}{x.amt?<span style={{color:MH.muted,fontWeight:600}}> · {mhPeso(x.amt)}</span>:null}</div>
              {x.sub&&<div style={{fontSize:".72rem",color:MH.faint,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:isMobile?"normal":"nowrap"}}>{x.sub}</div>}
            </div>
            <button onClick={x.open} style={{border:"none",borderRadius:8,padding:"7px 14px",background:x.tone==="info"?"#f1f5f9":MH.navy,color:x.tone==="info"?MH.muted:"#fff",fontWeight:700,fontSize:".78rem",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>{x.cta} →</button>
          </div>
        ))}
      </div>

      <H n={2} t="Money"/>
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)",gap:10}}>
        {tiles.map(t=>(
          <button key={t.l} onClick={t.open} style={{...box,textAlign:"left",padding:"12px 14px",cursor:"pointer",fontFamily:"inherit"}}>
            <div style={{fontSize:".66rem",fontWeight:800,color:MH.faint,textTransform:"uppercase",letterSpacing:".5px"}}>{t.l}</div>
            <div style={{fontSize:"1.4rem",fontWeight:800,color:MH.ink,margin:"2px 0"}}>{t.v}</div>
            <div style={{fontSize:".7rem",color:t.warn?MH.red:MH.faint,fontWeight:t.warn?700:500}}>{t.sub}</div>
          </button>
        ))}
      </div>

      <H n={3} t="Projects" sub={`${proj.active} active`}/>
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:10}}>
        <div style={{...box,padding:"12px 14px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <div style={{fontWeight:700,color:MH.ink,fontSize:".86rem"}}>How far along</div>
            <button onClick={()=>go("progress")} style={{border:"none",background:"none",color:"#2563eb",fontWeight:700,fontSize:".76rem",cursor:"pointer",fontFamily:"inherit"}}>Progress →</button>
          </div>
          <div style={{display:"flex",height:14,borderRadius:7,overflow:"hidden",background:"#f1f5f9"}}>
            {[...STEPS.map(s=>[s,proj.dist[s],STEP_CLR[s]]),["none",proj.dist.none,"#cbd5e1"]].map(([k,v,c])=>v?<div key={k} title={`${k==="none"?"Not set":k+"%"}: ${v}`} style={{width:`${v/Math.max(1,proj.active)*100}%`,background:c}}/>:null)}
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:"4px 14px",marginTop:8,fontSize:".74rem",color:MH.muted}}>
            {STEPS.map(s=><span key={s}><b style={{color:STEP_CLR[s]}}>{proj.dist[s]}</b> at {s}%</span>)}
            <span><b style={{color:proj.dist.none?MH.red:MH.faint}}>{proj.dist.none}</b> not reported</span>
          </div>
          {proj.dist.none>0&&<div style={{fontSize:".7rem",color:MH.faint,marginTop:6}}>PMs haven't given an estimate on {proj.dist.none} project{proj.dist.none>1?"s":""} yet.</div>}
        </div>
        <div style={{...box,padding:"12px 14px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <div style={{fontWeight:700,color:MH.ink,fontSize:".86rem"}}>Past their target date <span style={{color:proj.late.length?MH.red:MH.green}}>· {proj.late.length}</span></div>
            <button onClick={()=>go("projects")} style={{border:"none",background:"none",color:"#2563eb",fontWeight:700,fontSize:".76rem",cursor:"pointer",fontFamily:"inherit"}}>Projects →</button>
          </div>
          {proj.late.length===0&&<div style={{fontSize:".78rem",color:MH.green,fontWeight:600}}>None.</div>}
          {proj.late.slice(0,5).map(({d,t,p})=>(
            <button key={d.id} onClick={()=>openProject(d.id)} style={{display:"flex",width:"100%",justifyContent:"space-between",gap:8,border:"none",background:"none",padding:"5px 0",borderTop:"1px solid #f8fafc",cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}>
              <span style={{fontSize:".78rem",color:MH.ink,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.client||d.project||d.ceNo}{d.project&&d.client?<span style={{color:MH.faint,fontWeight:500}}> · {d.project}</span>:null}</span>
              <span style={{fontSize:".72rem",color:MH.red,whiteSpace:"nowrap"}}>due {t}{p?` · ${p}%`:""}</span>
            </button>
          ))}
          {proj.late.length>5&&<div style={{fontSize:".7rem",color:MH.faint,marginTop:4}}>and {proj.late.length-5} more</div>}
        </div>
      </div>
    </div>
  );
}
