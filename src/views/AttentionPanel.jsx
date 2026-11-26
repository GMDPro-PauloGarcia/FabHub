import React,{useMemo,useState} from "react";
import {milestoneBalance,isBillingOverdue,isBillingUnsentLate,dealDpClear,WON_STAGES} from "../core";
import {Modal} from "../shared";

// ─── NEEDS YOUR ATTENTION (Manager / Finance home) ─────────────────────────
// One list of what needs a person today, each with a count, the money involved
// and a button to the page where it's fixed. Read-only: nothing is changed
// here. Every item is computed from data FabHub already holds, using the same
// helpers as the pages it links to, so the numbers match what you see there.
// An item with nothing to do shows as a green tick, so "all clear" is visible.
//
// Tap an item (2026-11-26, Paulo: "when clicked we can choose options on what
// to do"): it opens the records behind the count, each with the actions that
// fit it (Receive payment, Pay, Approve / Reject, Edit, Set due dates, Open the
// project's billing, approve POs). Every action is a handler from App that
// opens the existing form or runs the existing function (approvePayable,
// rejectPayable, openPayModal, the billing jump, DueDateBackfillModal,
// POApprovals), so every money rule and its database check still applies. No
// writes happen in this file.

const attnPeso=v=>"₱"+Math.round(Number(v)||0).toLocaleString("en-PH");
const attnDays=(a,b)=>Math.floor((new Date(b+"T00:00:00")-new Date(a+"T00:00:00"))/864e5);

const attnFmtDate=dt=>{const[y,m,d]=String(dt||"").split("-");return m&&d?`${m}/${d}/${y}`:"—";};

export default function AttentionPanel({billings=[],deals=[],prs=[],payables=[],today,go,pages=["billing","procurement","bills"],act={}}){
  const[showClear,setShowClear]=useState(false);
  const[openK,setOpenK]=useState(null);
  const[q,setQ]=useState("");
  const[limit,setLimit]=useState(50);
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

    // ── Records behind each count, with the actions that fit each one ──
    const A=act||{};
    const dealLbl=d=>d?[d.client,d.ceNo].filter(Boolean).join(" · "):"Unknown project";
    const late=dt=>dt&&dt<today?attnDays(dt,today):0;
    const msRow=(b,acts)=>{const d=dealOf(b.dealId);const lt=late(b.dueDate);
      return{id:b.id,title:`${dealLbl(d)}`,sub:`${b.invoiceNo||"No invoice no."} · ${b.name||"Billing"} · ${b.status||"—"} · due ${attnFmtDate(b.dueDate)}`,
        flag:lt?`${lt}d late`:"",amt:milestoneBalance(b,d),days:lt,search:[d?.client,d?.ceNo,d?.contact,b.invoiceNo,b.name].join(" "),acts:acts(b,d)};};
    const openBilling=b=>A.openDeal?[{l:"Open billing",run:()=>A.openDeal(b.dealId)}]:[];
    const receive=b=>A.receive&&b.status!=="Cancelled"?[{l:"💵 Receive payment",primary:true,run:()=>A.receive(b.dealId,b.id)}]:[];
    const billBal=p=>(Number(p.amount)||0)-(Number(p.paidAmount)||0);
    const apRow=(p,acts)=>{const lt=late(p.dueDate);const d=dealOf(p.projectId);
      return{id:p.id,title:p.vendor||"(no supplier)",sub:`${p.apNumber||"No AP no."}${p.poId?` · ${p.poId}`:""}${p.invoiceNumber?` · Inv ${p.invoiceNumber}`:""} · ${d?dealLbl(d):"No project"} · due ${attnFmtDate(p.dueDate)}${approved(p)?"":" · not approved"}`,
        flag:lt?`${lt}d late`:"",amt:billBal(p),days:lt,search:[p.vendor,p.apNumber,p.poId,p.invoiceNumber,d?.client,d?.ceNo].join(" "),acts:acts(p)};};
    const billActs=p=>{
      const out=[];
      if(!approved(p)){
        if(A.canApproveBill&&A.canApproveBill(p)){
          if(A.approveBill) out.push({l:"✓ Approve",primary:true,run:()=>A.approveBill(p)});
          if(A.rejectBill) out.push({l:"✕ Reject",danger:true,run:()=>A.rejectBill(p)});
        }else if(A.enteredByMe&&A.enteredByMe(p)) out.push({note:"You entered it: another approver must approve"});
      }else if(A.payBill) out.push({l:"💸 Pay",primary:true,run:()=>A.payBill(p)});
      if(A.editBill) out.push({l:"✏ Edit",run:()=>A.editBill(p)});
      return out;
    };
    const byDays=(a,b)=>b.days-a.days||b.amt-a.amt;
    const setDates=A.setDueDates?[{l:"📅 Set due dates",primary:true,run:A.setDueDates}]:[];
    const rowsOf={
      "ar-overdue":overdue.map(b=>msRow(b,b=>[...receive(b),...openBilling(b)])).sort(byDays),
      "ar-unsent":unsent.map(b=>msRow(b,b=>A.openDeal?[{l:"Open billing to send",primary:true,run:()=>A.openDeal(b.dealId)}]:[])).sort(byDays),
      "ar-nodue":noDue.map(b=>msRow(b,b=>openBilling(b))).sort((a,b)=>b.amt-a.amt),
      "ar-unbilled":unbilled.map(d=>({id:d.id,title:dealLbl(d),sub:`${d.stage||""}${d.name?` · ${d.name}`:""}`,amt:Number(d.value)||0,search:[d.client,d.ceNo,d.name].join(" "),
        acts:A.openDeal?[{l:"Set up billing",primary:true,run:()=>A.openDeal(d.id)}]:[]})).sort((a,b)=>b.amt-a.amt),
      "ap-due":apDue.map(p=>apRow(p,billActs)).sort(byDays),
      "ap-pending":apPending.map(p=>apRow(p,billActs)).sort(byDays),
      "ap-nodue":apNoDue.map(p=>apRow(p,p=>A.editBill?[{l:"✏ Edit (set due date)",run:()=>A.editBill(p)}]:[])).sort((a,b)=>b.amt-a.amt),
    };
    const bulkOf={"ar-nodue":setDates,"ap-nodue":setDates};

    return [
      {k:"ar-overdue",group:"Collect",n:overdue.length,amt:bal(overdue),label:"Invoices overdue",hint:"Sent to the client and past their due date",btn:"Collect",to:"billing",tone:"red"},
      {k:"ar-unsent",group:"Collect",n:unsent.length,amt:bal(unsent),label:"Invoices past due but never sent",hint:"Still Draft after their due date: send them",btn:"Send",to:"billing",tone:"amber"},
      {k:"ar-nodue",group:"Collect",n:noDue.length,amt:bal(noDue),label:"Unpaid invoices with no due date",hint:"The cash forecast can't schedule them",btn:"Set dates",to:"billing",tone:"amber"},
      {k:"ar-unbilled",group:"Collect",n:unbilled.length,amt:unbilled.reduce((s,d)=>s+(Number(d.value)||0),0),amtLabel:"contract value",label:"Awarded projects with no billing schedule",hint:"Nothing can be invoiced until milestones are set up",btn:"Set up billing",to:"billing",tone:"amber"},
      {k:"po-pending",group:"Buy",n:pendPOs.length,label:"POs waiting for approval",hint:pendPOs.length?`Oldest from ${oldest||"—"}${dpHeld.size?` · ${dpHeld.size} held for no down payment`:""}`:"",btn:"Approve",to:"procurement",tone:pendPOs.length&&oldest&&attnDays(oldest,today)>2?"red":"amber"},
      {k:"ap-due",group:"Pay",n:apDue.length,amt:apBal(apDue),label:"Supplier bills due within 7 days",hint:apLate.length?`${apLate.length} already overdue (${attnPeso(apBal(apLate))})`:"",btn:"Pay",to:"bills",tone:apLate.length?"red":"amber"},
      {k:"ap-pending",group:"Pay",n:apPending.length,amt:apBal(apPending),label:"Supplier bills waiting for approval",hint:"Can't be paid until a Manager or Finance approves",btn:"Approve",to:"bills",tone:"amber"},
      {k:"ap-nodue",group:"Pay",n:apNoDue.length,amt:apBal(apNoDue),label:"Supplier bills with no due date",hint:"Running Payables can't tell what's due when",btn:"Review",to:"bills",tone:"amber"},
    ].map(i=>({...i,rows:rowsOf[i.k]||[],bulk:bulkOf[i.k]||[]}));
  },[billings,deals,prs,payables,today,act]);

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
        <div key={i.k} role="button" tabIndex={0} title="Tap to see the list and choose what to do"
          onClick={()=>{setQ("");setLimit(50);setOpenK(i.k);}}
          onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setQ("");setLimit(50);setOpenK(i.k);}}}
          style={{display:"flex",alignItems:"center",gap:10,padding:"10px 16px",borderTop:"1px solid #f1f5f9",flexWrap:"wrap",cursor:"pointer"}}>
          <span style={{minWidth:34,textAlign:"center",fontWeight:800,fontSize:".95rem",color:C[i.tone]||"#d97706",background:(C[i.tone]||"#d97706")+"14",borderRadius:8,padding:"3px 6px"}}>{i.n}</span>
          <div style={{flex:"1 1 200px",minWidth:0}}>
            <div style={{fontWeight:700,color:"#0f172a",fontSize:".84rem"}}>{i.label}{i.amt>0.5&&<span style={{fontWeight:600,color:"#475569"}}> · {attnPeso(i.amt)}{i.amtLabel?` ${i.amtLabel}`:""}</span>}</div>
            {i.hint&&<div style={{fontSize:".72rem",color:"#94a3b8"}}>{i.hint}</div>}
          </div>
          <span style={{background:"#1e293b",color:"#fff",borderRadius:8,padding:"6px 14px",fontWeight:700,fontSize:".76rem",whiteSpace:"nowrap"}}>{i.btn} ▸</span>
        </div>
      ))}
      {clear.length>0&&(
        <div style={{borderTop:"1px solid #f1f5f9",padding:"8px 16px"}}>
          <button onClick={()=>setShowClear(s=>!s)} style={{background:"none",border:"none",color:"#059669",fontWeight:700,fontSize:".76rem",cursor:"pointer",fontFamily:"inherit",padding:0}}>✓ {clear.length} all clear {showClear?"▲":"▼"}</button>
          {showClear&&clear.map(i=><div key={i.k} style={{fontSize:".74rem",color:"#64748b",padding:"3px 0 0 4px"}}>✓ No {i.label.toLowerCase()}</div>)}
        </div>
      )}
      {(()=>{
        const i=mine.find(x=>x.k===openK);
        if(!i) return null;
        const close=()=>setOpenK(null);
        const run=fn=>{fn();};
        const pageBtn=<button onClick={()=>{close();go(i.to);}} style={{background:"#f59e0b",border:"none",borderRadius:8,padding:"8px 14px",fontFamily:"inherit",fontWeight:800,fontSize:".78rem",color:"#0f172a",cursor:"pointer",whiteSpace:"nowrap"}}>Open {i.to==="bills"?"Bills":i.to==="procurement"?"Purchase Orders":"Billing"} ›</button>;
        const head=(
          <div style={{background:"#1e293b",borderRadius:10,padding:"10px 14px",marginBottom:10,color:"#fff",display:"flex",justifyContent:"space-between",gap:8,flexWrap:"wrap",alignItems:"center"}}>
            <div>
              <div style={{fontSize:".7rem",color:"rgba(255,255,255,.6)",textTransform:"uppercase",letterSpacing:".6px"}}>{i.n} item{i.n===1?"":"s"}{i.hint?` · ${i.hint}`:""}</div>
              {i.amt>0.5&&<div style={{fontWeight:800,fontSize:"1.1rem",color:"#f59e0b"}}>{attnPeso(i.amt)}{i.amtLabel?<span style={{fontSize:".7rem",color:"rgba(255,255,255,.6)"}}> {i.amtLabel}</span>:null}</div>}
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {i.bulk.map(b=><button key={b.l} onClick={()=>{close();run(b.run);}} style={{background:"#059669",border:"none",borderRadius:8,padding:"8px 14px",fontFamily:"inherit",fontWeight:800,fontSize:".78rem",color:"#fff",cursor:"pointer",whiteSpace:"nowrap"}}>{b.l}</button>)}
              {pageBtn}
            </div>
          </div>
        );
        // POs: the PO approvals list itself (its own approver tiers, DP and PRF holds).
        if(i.k==="po-pending"&&act&&act.poApprovals) return(
          <Modal open onClose={close} title={i.label} wide>{head}{act.poApprovals()}</Modal>
        );
        const qq=q.trim().toLowerCase();
        const rows=i.rows.filter(r=>!qq||String(r.search||r.title).toLowerCase().includes(qq));
        const btn=a=>({background:a.primary?"#1e293b":a.danger?"#fef2f2":"#fff",color:a.primary?"#fff":a.danger?"#b91c1c":"#334155",border:`1.5px solid ${a.primary?"#1e293b":a.danger?"#fecaca":"#e2e8f0"}`,borderRadius:7,padding:"6px 11px",fontFamily:"inherit",fontWeight:700,fontSize:".74rem",cursor:"pointer",whiteSpace:"nowrap"});
        return(
          <Modal open onClose={close} title={i.label} wide>
            {head}
            {i.rows.length>8&&<input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search client, supplier, CE / AP / invoice no…" style={{width:"100%",boxSizing:"border-box",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"8px 11px",fontFamily:"inherit",fontSize:".84rem",marginBottom:10}}/>}
            {rows.length===0&&<div style={{textAlign:"center",padding:24,color:"#94a3b8",fontSize:".84rem"}}>Nothing here.</div>}
            {rows.slice(0,limit).map(r=>(
              <div key={r.id} style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center",justifyContent:"space-between",border:"1.5px solid #e2e8f0",borderRadius:10,padding:"9px 12px",marginBottom:7}}>
                <div style={{flex:"1 1 220px",minWidth:0}}>
                  <div style={{fontWeight:700,color:"#0f172a",fontSize:".84rem"}}>{r.title}{r.flag&&<span style={{marginLeft:6,fontSize:".64rem",fontWeight:700,color:"#dc2626",background:"#fef2f2",borderRadius:20,padding:"1px 8px",whiteSpace:"nowrap"}}>{r.flag}</span>}</div>
                  <div style={{fontSize:".7rem",color:"#94a3b8"}}>{r.sub}</div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap",justifyContent:"flex-end"}}>
                  {r.amt>0.5&&<b style={{fontSize:".84rem",color:"#0f172a",fontVariantNumeric:"tabular-nums",whiteSpace:"nowrap",marginRight:2}}>{attnPeso(r.amt)}</b>}
                  {r.acts.map((a,j)=>a.note
                    ?<span key={j} style={{fontSize:".66rem",color:"#b45309",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:20,padding:"2px 8px"}}>{a.note}</span>
                    :<button key={j} onClick={async()=>{
                        // Approve / Reject stay on this list (it updates as the bill changes);
                        // every other action opens its own form, so the list closes.
                        if(!/Approve|Reject/.test(a.l)) close();
                        await a.run();
                      }} style={btn(a)}>{a.l}</button>)}
                </div>
              </div>
            ))}
            {rows.length>limit&&<button onClick={()=>setLimit(l=>l+50)} style={{width:"100%",background:"#f8fafc",border:"1.5px dashed #cbd5e1",borderRadius:8,padding:"8px",fontFamily:"inherit",fontWeight:700,fontSize:".78rem",color:"#475569",cursor:"pointer"}}>Show {Math.min(50,rows.length-limit)} more of {rows.length-limit}</button>}
            <div style={{fontSize:".7rem",color:"#94a3b8",marginTop:6}}>Each button opens the usual form or runs the usual check, so the same rules apply as on the page.</div>
          </Modal>
        );
      })()}
    </div>
  );
}
