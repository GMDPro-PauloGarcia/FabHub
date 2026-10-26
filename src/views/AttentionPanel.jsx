import React,{useMemo,useState} from "react";
import {milestoneBalance,isBillingOverdue,isBillingUnsentLate,dealDpClear,WON_STAGES} from "../core";

// ─── NEEDS YOUR ATTENTION (Manager / Finance home) ─────────────────────────
// One list of what needs a person today, each with a count, the money involved
// and a button to the page where it's fixed. Read-only: nothing is changed
// here. Every item is computed from data FabHub already holds, using the same
// helpers as the pages it links to, so the numbers match what you see there.
// An item with nothing to do shows as a green tick, so "all clear" is visible.

const attnPeso=v=>"₱"+Math.round(Number(v)||0).toLocaleString("en-PH");
const attnDays=(a,b)=>Math.floor((new Date(b+"T00:00:00")-new Date(a+"T00:00:00"))/864e5);

export default function AttentionPanel({billings=[],deals=[],prs=[],payables=[],today,go,pages=["billing","procurement","bills"]}){
  const[showClear,setShowClear]=useState(false);
  const items=useMemo(()=>{
    const dealOf=id=>deals.find(d=>d.id===id);
    const open=billings.filter(b=>b.status!=="Cancelled"&&milestoneBalance(b,dealOf(b.dealId))>0.5);
    const bal=list=>list.reduce((s,b)=>s+milestoneBalance(b,dealOf(b.dealId)),0);

    // Receivables
    const overdue=open.filter(b=>isBillingOverdue(b,today));
    const unsent=open.filter(b=>isBillingUnsentLate(b,today));
    const noDue=open.filter(b=>!b.dueDate);
    // Awarded projects with no billing schedule at all (mother POs earn ₱0
    // themselves; internal GMD jobs aren't billed to a client).
    const billed=new Set(billings.filter(b=>b.status!=="Cancelled").map(b=>b.dealId));
    const unbilled=deals.filter(d=>WON_STAGES.includes(d.stage)&&!d.standbyPO&&!/^GMD Production/i.test(d.client||"")&&Number(d.value)>0&&!billed.has(d.id));

    // Purchasing
    const pendLines=prs.filter(p=>p.status==="Pending Approval"&&p.poNumber);
    const pendPOs=[...new Set(pendLines.map(p=>p.poNumber))];
    const dpHeld=new Set(pendLines.filter(p=>{const d=dealOf(p.projectId||p.dealId);return d&&!dealDpClear(d,deals);}).map(p=>p.poNumber));
    const oldest=pendLines.reduce((m,p)=>{const c=String(p.createdDate||p.createdAt||"").slice(0,10);return c&&(!m||c<m)?c:m;},"");

    // Supplier bills (Finance → Supplier Bills)
    const openAP=payables.filter(p=>!["Paid","Cancelled"].includes(p.status)&&(Number(p.amount)||0)-(Number(p.paidAmount)||0)>0.5);
    const apBal=list=>list.reduce((s,p)=>s+(Number(p.amount)||0)-(Number(p.paidAmount)||0),0);
    const approved=p=>((p.approvalStatus)||"Approved")==="Approved";
    const week=new Date(today+"T00:00:00");week.setDate(week.getDate()+7);const weekIso=week.toISOString().slice(0,10);
    const apDue=openAP.filter(p=>p.dueDate&&p.dueDate<=weekIso);
    const apLate=apDue.filter(p=>p.dueDate<today);
    const apNoDue=openAP.filter(p=>!p.dueDate);
    const apPending=openAP.filter(p=>!approved(p));

    return [
      {k:"ar-overdue",group:"Collect",n:overdue.length,amt:bal(overdue),label:"Invoices overdue",hint:"Sent to the client and past their due date",btn:"Collect",to:"billing",tone:"red"},
      {k:"ar-unsent",group:"Collect",n:unsent.length,amt:bal(unsent),label:"Invoices past due but never sent",hint:"Still Draft after their due date: send them",btn:"Send",to:"billing",tone:"amber"},
      {k:"ar-nodue",group:"Collect",n:noDue.length,amt:bal(noDue),label:"Unpaid invoices with no due date",hint:"The cash forecast can't schedule them",btn:"Set dates",to:"billing",tone:"amber"},
      {k:"ar-unbilled",group:"Collect",n:unbilled.length,amt:unbilled.reduce((s,d)=>s+(Number(d.value)||0),0),amtLabel:"contract value",label:"Awarded projects with no billing schedule",hint:"Nothing can be invoiced until milestones are set up",btn:"Set up billing",to:"billing",tone:"amber"},
      {k:"po-pending",group:"Buy",n:pendPOs.length,label:"POs waiting for approval",hint:pendPOs.length?`Oldest from ${oldest||"—"}${dpHeld.size?` · ${dpHeld.size} held for no down payment`:""}`:"",btn:"Approve",to:"procurement",tone:pendPOs.length&&oldest&&attnDays(oldest,today)>2?"red":"amber"},
      {k:"ap-due",group:"Pay",n:apDue.length,amt:apBal(apDue),label:"Supplier bills due within 7 days",hint:apLate.length?`${apLate.length} already overdue (${attnPeso(apBal(apLate))})`:"",btn:"Pay",to:"bills",tone:apLate.length?"red":"amber"},
      {k:"ap-pending",group:"Pay",n:apPending.length,amt:apBal(apPending),label:"Supplier bills waiting for approval",hint:"Can't be paid until a Manager or Finance approves",btn:"Approve",to:"bills",tone:"amber"},
      {k:"ap-nodue",group:"Pay",n:apNoDue.length,amt:apBal(apNoDue),label:"Supplier bills with no due date",hint:"Running Payables can't tell what's due when",btn:"Review",to:"bills",tone:"amber"},
    ];
  },[billings,deals,prs,payables,today]);

  // Only items whose page this role can open.
  const mine=items.filter(i=>pages.includes(i.to));
  const todo=mine.filter(i=>i.n>0);
  const clear=mine.filter(i=>!i.n);
  const C={red:"#dc2626",amber:"#d97706"};
  return(
    <div style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:14,marginBottom:16,overflow:"hidden"}}>
      <div style={{background:"#0f172a",padding:"11px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:6}}>
        <span style={{fontWeight:800,color:"#f59e0b",fontSize:".9rem"}}>⚑ Needs your attention</span>
        <span style={{fontSize:".72rem",color:"rgba(255,255,255,.6)"}}>{todo.length?`${todo.length} of ${mine.length} need action`:"All clear"}</span>
      </div>
      {todo.map(i=>(
        <div key={i.k} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 16px",borderTop:"1px solid #f1f5f9",flexWrap:"wrap"}}>
          <span style={{minWidth:34,textAlign:"center",fontWeight:800,fontSize:".95rem",color:C[i.tone]||"#d97706",background:(C[i.tone]||"#d97706")+"14",borderRadius:8,padding:"3px 6px"}}>{i.n}</span>
          <div style={{flex:"1 1 200px",minWidth:0}}>
            <div style={{fontWeight:700,color:"#0f172a",fontSize:".84rem"}}>{i.label}{i.amt>0.5&&<span style={{fontWeight:600,color:"#475569"}}> · {attnPeso(i.amt)}{i.amtLabel?` ${i.amtLabel}`:""}</span>}</div>
            {i.hint&&<div style={{fontSize:".72rem",color:"#94a3b8"}}>{i.hint}</div>}
          </div>
          <button onClick={()=>go(i.to)} style={{background:"#1e293b",color:"#fff",border:"none",borderRadius:8,padding:"6px 14px",fontFamily:"inherit",fontWeight:700,fontSize:".76rem",cursor:"pointer",whiteSpace:"nowrap"}}>{i.btn} →</button>
        </div>
      ))}
      {clear.length>0&&(
        <div style={{borderTop:"1px solid #f1f5f9",padding:"8px 16px"}}>
          <button onClick={()=>setShowClear(s=>!s)} style={{background:"none",border:"none",color:"#059669",fontWeight:700,fontSize:".76rem",cursor:"pointer",fontFamily:"inherit",padding:0}}>✓ {clear.length} all clear {showClear?"▲":"▼"}</button>
          {showClear&&clear.map(i=><div key={i.k} style={{fontSize:".74rem",color:"#64748b",padding:"3px 0 0 4px"}}>✓ No {i.label.toLowerCase()}</div>)}
        </div>
      )}
    </div>
  );
}
