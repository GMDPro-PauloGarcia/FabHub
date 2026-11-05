import React,{useState,useMemo} from "react";
import {today as TODAY,Modal,Fld,Inp,Sel,uiAlert,uiPrompt,cashCanEdit,cashDayLocked,addDaysLocalISO} from "../shared";
import {projDisplayName} from "../core";
import {num,r2,php2,vendorKey,bankOf,bankLabel,cashMovements,reconcileLedger,payBalance,payIsOpen} from "../data/ledger";
import {chip,linkBtn,LedgerHost} from "./Ledgers";

// ─── EXPENSE MONITORING (Accounting) ───────────────────────────────────────
// Mark's payables, in FabHub instead of the Excel sheet, tied to the Daily
// Cash Position:
//   1. Every payable GMD owes (PO / WO bills raised automatically, plus the
//      "other payables" Mark enters here: utilities, rent, government, labor…),
//      by due date.
//   2. Each day's cash-position disbursements, each one tied to the bill(s) it
//      paid. Linking a disbursement writes the bill onto that cash-sheet row
//      (payableIds, with an Audit Trail entry; same edit rights and day lock as
//      the sheet) and, if the bill isn't marked paid yet, records the AP payment
//      through the normal payment path (approval, check no., duplicate net).
//   3. AP payments with no disbursement on the sheet, so nothing is paid in
//      FabHub without leaving the bank on the sheet (or the other way round).

const C={ink:"#0f172a",muted:"#64748b",faint:"#94a3b8",line:"#e2e8f0",ok:"#059669",warn:"#d97706",bad:"#dc2626"};
const lgTh={padding:"7px 9px",fontSize:".64rem",fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:".5px",textAlign:"left",whiteSpace:"nowrap",background:"#f8fafc",borderBottom:`1px solid ${C.line}`};
const lgTd={padding:"7px 9px",fontSize:".76rem",color:C.ink,borderBottom:"1px solid #f1f5f9",verticalAlign:"top"};
const lgTdR={...lgTd,textAlign:"right",whiteSpace:"nowrap",fontVariantNumeric:"tabular-nums"};
const emBtn=(clr,ghost)=>({background:ghost?"#fff":clr,color:ghost?clr:"#fff",border:`1px solid ${clr}`,borderRadius:7,padding:"5px 11px",fontSize:".72rem",fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"});
const METHODS=["Check","Bank transfer","Online","Cash"];
const CATS=["All","Supplier","Subcontractor","Utility","Rent","Labor","Government","Other"];
const LINK={linked:["Linked",C.ok],short:["Partly recorded",C.warn],suggested:["Suggested","#2563eb"],none:["Not linked",C.bad]};
const billLabel=b=>[b.apNumber,b.poId||b.poNumber||b.invoiceNumber||b.invoiceRef].filter(Boolean).join(" · ")||"bill";
const approvedBill=b=>(b.approvalStatus||"Approved")==="Approved";

const Card=({title,desc,right,children})=>(
  <div style={{background:"#fff",border:`1px solid ${C.line}`,borderRadius:12,padding:"14px 16px",marginBottom:14}}>
    <div style={{display:"flex",justifyContent:"space-between",gap:10,flexWrap:"wrap",alignItems:"flex-start",marginBottom:desc?2:10}}>
      <div style={{fontWeight:800,color:"#0B2545",fontSize:".92rem"}}>{title}</div>{right}
    </div>
    {desc&&<div style={{fontSize:".72rem",color:C.muted,marginBottom:10}}>{desc}</div>}
    {children}
  </div>
);

export default function ExpenseMonitoring({cashPositions={},saveDayPos,payables=[],payPays=[],prs=[],swos=[],exps=[],deals=[],today=TODAY,role="",username="",userName="",canPay=false,onPayMany,onNewPayable,onEditPayable}){
  const[day,setDay]=useState(today);
  const[cat,setCat]=useState("All");
  const[due,setDue]=useState("open");
  const[q,setQ]=useState("");
  const[limit,setLimit]=useState(80);
  const[linkFor,setLinkFor]=useState(null);
  const[ledger,setLedger]=useState(null);

  const projName=id=>{const d=id&&deals.find(x=>x.id===id);return d?projDisplayName(d):"";};
  const movements=useMemo(()=>cashMovements(cashPositions),[cashPositions]);
  const rec=useMemo(()=>reconcileLedger({movements,payables,payPays,billings:[]}),[movements,payables,payPays]);
  const payById=useMemo(()=>new Map(payables.map(p=>[p.id,p])),[payables]);
  // Bill id → cash-sheet rows tagged to it.
  const tagsByBill=useMemo(()=>{
    const m=new Map();
    movements.forEach(mv=>(mv.payableIds||[]).forEach(id=>{if(!m.has(id)) m.set(id,[]);m.get(id).push(mv);}));
    return m;
  },[movements]);

  const dayRows=movements.filter(m=>m.dir==="out"&&m.date===day);
  const dayTotal=dayRows.reduce((s,m)=>s+m.amount,0);
  const weekAgo=addDaysLocalISO(today,-7);
  const recentUnlinked=movements.filter(m=>m.dir==="out"&&m.date>=weekAgo&&m.date<=today&&(rec.byKey.get(m.key)?.status||"none")==="none");
  const monthAgo=addDaysLocalISO(today,-30);
  const orphanAp=rec.unmatchedAp.filter(g=>g.date>=monthAgo).sort((a,b)=>String(b.date).localeCompare(String(a.date)));

  const open=payables.filter(payIsOpen);
  const in7=addDaysLocalISO(today,7);
  const totalOpen=open.reduce((s,p)=>s+payBalance(p),0);
  const overdue=open.filter(p=>p.dueDate&&p.dueDate<today);
  const dueWeek=open.filter(p=>p.dueDate&&p.dueDate>=today&&p.dueDate<=in7);
  const list=useMemo(()=>{
    const qq=q.trim().toLowerCase();
    return payables.filter(p=>!["Cancelled","Void"].includes(p.status))
      .filter(p=>due==="all"?true:due==="paid"?!payIsOpen(p):due==="overdue"?(payIsOpen(p)&&p.dueDate&&p.dueDate<today):due==="week"?(payIsOpen(p)&&p.dueDate&&p.dueDate<=in7):due==="nodate"?(payIsOpen(p)&&!p.dueDate):payIsOpen(p))
      .filter(p=>cat==="All"||(p.category||"Other")===cat)
      .filter(p=>!qq||[p.vendor,p.apNumber,p.poId,p.poNumber,p.invoiceNumber,p.invoiceRef,p.notes,projName(p.projectId)].some(v=>String(v||"").toLowerCase().includes(qq)))
      .sort((a,b)=>String(a.dueDate||"9999").localeCompare(String(b.dueDate||"9999"))||String(a.vendor||"").localeCompare(String(b.vendor||"")));
  },[payables,due,cat,q,today,in7,deals]);

  const inp={border:"1.5px solid #e2e8f0",borderRadius:8,padding:"6px 9px",fontFamily:"inherit",fontSize:".78rem",background:"#fff"};

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,flexWrap:"wrap",marginBottom:12}}>
        <div>
          <div style={{fontWeight:800,color:"#0B2545",fontSize:"1.05rem"}}>🧾 Expense Monitoring</div>
          <div style={{fontSize:".76rem",color:C.muted,marginTop:2,maxWidth:720}}>Everything GMD owes, by due date, and each day's cash-position disbursements tied to the bill they paid.</div>
        </div>
        {onNewPayable&&<button onClick={onNewPayable} style={{background:"#0B2545",color:"#facc15",border:"none",borderRadius:9,padding:"9px 16px",fontWeight:800,fontSize:".8rem",cursor:"pointer",fontFamily:"inherit"}}>+ New payable</button>}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:8,marginBottom:14}}>
        {[["Open payables",php2(totalOpen),C.ink,`${open.length} bill(s)`],
          ["Overdue",php2(overdue.reduce((s,p)=>s+payBalance(p),0)),overdue.length?C.bad:C.ok,`${overdue.length} bill(s)`],
          ["Due in 7 days",php2(dueWeek.reduce((s,p)=>s+payBalance(p),0)),C.warn,`${dueWeek.length} bill(s)`],
          ["Disbursements not tied",String(recentUnlinked.length),recentUnlinked.length?C.bad:C.ok,"last 7 days"],
          ["Paid, not on cash sheet",String(orphanAp.length),orphanAp.length?C.bad:C.ok,"last 30 days"]].map(([l,v,c,f])=>(
          <div key={l} style={{border:`1px solid ${C.line}`,borderRadius:10,padding:"9px 12px",background:"#fff"}}>
            <div style={{fontSize:".62rem",fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:".5px"}}>{l}</div>
            <div style={{fontSize:"1.02rem",fontWeight:800,color:c,marginTop:2}}>{v}</div>
            <div style={{fontSize:".66rem",color:C.faint}}>{f}</div>
          </div>
        ))}
      </div>

      <Card title="Cash-position disbursements → bills" desc="Each disbursement on the Daily Cash Position for the day, and the bill it paid. Link the ones that paid a supplier or a payable so the bill is settled once and the bank movement is traceable."
        right={<input type="date" value={day} max={today} onChange={e=>setDay(e.target.value||today)} style={inp} aria-label="Cash position day"/>}>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",minWidth:720}}>
            <thead><tr>{[["Bank"],["Payee / particulars"],["Amount",1],["Bill(s)"],["Status"],[""]].map(([h,r],i)=><th key={i} style={{...lgTh,textAlign:r?"right":"left"}}>{h}</th>)}</tr></thead>
            <tbody>
              {dayRows.map(m=>{
                const r=rec.byKey.get(m.key)||{status:"none"};
                const [lt,lc]=LINK[r.status]||LINK.none;
                const bills=(m.payableIds?.length?m.payableIds:r.payableIds||[]).map(id=>payById.get(id)).filter(Boolean);
                return(
                  <tr key={m.key}>
                    <td style={lgTd}>{bankLabel(m.bank)}</td>
                    <td style={lgTd}><div style={{fontWeight:600}}>{m.payee||"—"}</div>{m.particulars&&<div style={{fontSize:".68rem",color:C.muted}}>{m.particulars}</div>}</td>
                    <td style={lgTdR}><b>{php2(m.amount)}</b></td>
                    <td style={lgTd}>{bills.length?bills.map(b=><div key={b.id}><button style={linkBtn} onClick={()=>setLedger({kind:"supplier",id:b.vendor,tab:"pays"})}>{b.vendor}</button> <span style={{fontSize:".68rem",color:C.muted}}>{billLabel(b)}</span></div>):<span style={{color:C.faint}}>—</span>}</td>
                    <td style={lgTd}>{chip(lt,lc)}{r.status==="short"&&<div style={{fontSize:".66rem",color:C.warn}}>{php2(r.recorded)} recorded in AP</div>}</td>
                    <td style={{...lgTd,textAlign:"right"}}><button style={emBtn("#0B2545",true)} onClick={()=>setLinkFor({m,r})}>{m.payableIds?.length?"Change":"Link bill"}</button></td>
                  </tr>
                );
              })}
              {dayRows.length===0&&<tr><td colSpan={6} style={{...lgTd,textAlign:"center",color:C.faint,padding:18}}>No disbursements on the cash position for {day}.</td></tr>}
              {dayRows.length>0&&<tr style={{background:"#f8fafc"}}><td colSpan={2} style={{...lgTd,fontWeight:800}}>TOTAL</td><td style={{...lgTdR,fontWeight:900}}>{php2(dayTotal)}</td><td colSpan={3} style={lgTd}/></tr>}
            </tbody>
          </table>
        </div>
        {recentUnlinked.filter(m=>m.date!==day).length>0&&(
          <div style={{marginTop:10,fontSize:".72rem",color:C.muted}}>Not tied in the last 7 days: {[...new Set(recentUnlinked.filter(m=>m.date!==day).map(m=>m.date))].sort().reverse().map(d=><button key={d} style={{...linkBtn,marginRight:8}} onClick={()=>setDay(d)}>{d}</button>)}</div>
        )}
      </Card>

      {orphanAp.length>0&&(
        <Card title="⚠ Paid in FabHub, not on the cash sheet" desc="Supplier payments recorded in the last 30 days with no matching disbursement on the Daily Cash Position (same supplier and amount within 7 days, or a linked row). Add the disbursement to that day's sheet, or check it wasn't recorded twice.">
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",minWidth:620}}>
              <thead><tr>{[["Paid on"],["Supplier / bill"],["Amount",1],["Method / bank"],["Check / ref"]].map(([h,r],i)=><th key={i} style={{...lgTh,textAlign:r?"right":"left"}}>{h}</th>)}</tr></thead>
              <tbody>{orphanAp.map(g=>{
                const bs=g.payableIds.map(id=>payById.get(id)).filter(Boolean);
                return(
                  <tr key={g.id}>
                    <td style={{...lgTd,whiteSpace:"nowrap"}}>{g.date}</td>
                    <td style={lgTd}>{bs.map(b=><div key={b.id}><button style={linkBtn} onClick={()=>setLedger({kind:"supplier",id:b.vendor,tab:"pays"})}>{b.vendor}</button> <span style={{fontSize:".68rem",color:C.muted}}>{billLabel(b)}</span></div>)}</td>
                    <td style={lgTdR}><b>{php2(g.amount)}</b></td>
                    <td style={lgTd}>{[g.pays[0].method,bankLabel(g.pays[0].bank)].filter(Boolean).join(" · ")}</td>
                    <td style={{...lgTd,fontFamily:"monospace",fontSize:".72rem"}}>{g.pays[0].refNo||"—"}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        </Card>
      )}

      <Card title="Payables" desc="PO and work-order bills are raised automatically when the order is issued. Enter everything else (utilities, rent, government, labor, other suppliers) with + New payable. Pay from Supplier Bills, or by linking a disbursement above.">
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",marginBottom:10}}>
          <select value={due} onChange={e=>{setDue(e.target.value);setLimit(80);}} style={inp} aria-label="Due filter">
            <option value="open">All open</option><option value="overdue">Overdue</option><option value="week">Due within 7 days (incl. overdue)</option><option value="nodate">No due date</option><option value="paid">Paid</option><option value="all">Everything</option>
          </select>
          <select value={cat} onChange={e=>{setCat(e.target.value);setLimit(80);}} style={inp} aria-label="Category">{CATS.map(c=><option key={c}>{c}</option>)}</select>
          <input value={q} onChange={e=>{setQ(e.target.value);setLimit(80);}} placeholder="Search supplier, AP, PO, invoice, project…" style={{...inp,flex:"1 1 220px",minWidth:0}}/>
        </div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",minWidth:820}}>
            <thead><tr>{[["Due"],["Supplier / payee"],["Bill"],["Project"],["Category"],["Balance",1],["On cash sheet"],[""]].map(([h,r],i)=><th key={i} style={{...lgTh,textAlign:r?"right":"left"}}>{h}</th>)}</tr></thead>
            <tbody>
              {list.slice(0,limit).map(p=>{
                const late=payIsOpen(p)&&p.dueDate&&p.dueDate<today;
                const tags=tagsByBill.get(p.id)||[];
                return(
                  <tr key={p.id}>
                    <td style={{...lgTd,whiteSpace:"nowrap",color:late?C.bad:p.dueDate?C.ink:C.warn,fontWeight:late?700:400}}>{p.dueDate||"No date"}</td>
                    <td style={lgTd}>{vendorKey(p.vendor)?<button style={{...linkBtn,fontWeight:600,color:C.ink}} onClick={()=>setLedger({kind:"supplier",id:p.vendor})}>{p.vendor}</button>:(p.vendor||"—")}</td>
                    <td style={lgTd}><div style={{fontWeight:600}}>{billLabel(p)}</div>{!approvedBill(p)&&chip(p.approvalStatus==="Rejected"?"Rejected":"Awaiting approval",C.warn)}</td>
                    <td style={lgTd}>{p.projectId&&projName(p.projectId)?<button style={{...linkBtn,color:"#475569"}} onClick={()=>setLedger({kind:"project",id:p.projectId})}>{projName(p.projectId)}</button>:<span style={{color:C.faint}}>—</span>}</td>
                    <td style={lgTd}>{p.category||"—"}</td>
                    <td style={lgTdR}><b style={{color:payIsOpen(p)?C.ink:C.ok}}>{php2(payBalance(p))}</b>{num(p.paidAmount)>0&&<div style={{fontSize:".66rem",color:C.faint}}>of {php2(p.amount)}</div>}</td>
                    <td style={lgTd}>{tags.length?tags.map(t=><div key={t.key} style={{fontSize:".7rem"}}>{t.date} · {bankLabel(t.bank)} · {php2(t.amount)}</div>):<span style={{color:C.faint}}>—</span>}</td>
                    <td style={{...lgTd,textAlign:"right"}}>{onEditPayable&&!p.poId&&!p.poNumber&&<button style={emBtn("#475569",true)} onClick={()=>onEditPayable(p)}>Edit</button>}</td>
                  </tr>
                );
              })}
              {list.length===0&&<tr><td colSpan={8} style={{...lgTd,textAlign:"center",color:C.faint,padding:18}}>No payables match.</td></tr>}
            </tbody>
          </table>
        </div>
        {list.length>limit&&<button onClick={()=>setLimit(l=>l+80)} style={{marginTop:8,background:"#f1f5f9",border:"none",borderRadius:7,padding:"6px 14px",fontSize:".76rem",fontWeight:600,color:"#475569",cursor:"pointer",fontFamily:"inherit"}}>Show more ({list.length-limit} left)</button>}
      </Card>

      {linkFor&&<LinkModal key={linkFor.m.key} m={linkFor.m} r={linkFor.r} onClose={()=>setLinkFor(null)} payables={payables} payPays={payPays} cashPositions={cashPositions} saveDayPos={saveDayPos}
        role={role} username={username} userName={userName} canPay={canPay} onPayMany={onPayMany} projName={projName}/>}
      <LedgerHost open={ledger} setOpen={setLedger} prs={prs} swos={swos} payables={payables} payPays={payPays} exps={exps} deals={deals} today={today}/>
    </div>
  );
}

function LinkModal({m,r,onClose,payables,payPays,cashPositions,saveDayPos,role,username,userName,canPay,onPayMany,projName}){
  const initial=m.payableIds?.length?m.payableIds:(r.status==="suggested"?r.payableIds:[]);
  const[sel,setSel]=useState(()=>new Set(initial));
  const[q,setQ]=useState("");
  const[method,setMethod]=useState("Check");
  const[ref,setRef]=useState("");
  const[busy,setBusy]=useState(false);
  const vk=vendorKey(m.payee);
  const isMgr=role==="Manager";
  const locked=cashDayLocked(m.date);
  const canSheet=cashCanEdit(role,username)&&(!locked||isMgr);
  // Candidates: open bills, plus bills settled in the last 60 days (the payment may
  // already be recorded in Supplier Bills). Same supplier first.
  const cutoff=addDaysLocalISO(m.date,-60);
  const cands=useMemo(()=>{
    const qq=q.trim().toLowerCase();
    return payables.filter(p=>!["Cancelled","Void"].includes(p.status)&&(payIsOpen(p)||sel.has(p.id)||String(p.paidDate||"")>=cutoff))
      .filter(p=>!qq||[p.vendor,p.apNumber,p.poId,p.poNumber,p.invoiceNumber,String(p.amount)].some(v=>String(v||"").toLowerCase().includes(qq)))
      .map(p=>({p,same:!!vk&&vendorKey(p.vendor)===vk,exact:Math.abs(payBalance(p)-m.amount)<0.01||Math.abs(num(p.amount)-m.amount)<0.01}))
      .filter(x=>qq||x.same||x.exact||sel.has(x.p.id))
      .sort((a,b)=>(sel.has(b.p.id)-sel.has(a.p.id))||(b.same-a.same)||(b.exact-a.exact)||String(a.p.dueDate||"9999").localeCompare(String(b.p.dueDate||"9999")))
      .slice(0,60);
  },[payables,q,vk,m.amount,cutoff,sel]);
  const picked=payables.filter(p=>sel.has(p.id));
  // What's already recorded in AP on the picked bills near this date.
  const nearPaid=(payPays||[]).filter(x=>x.status!=="Cancelled"&&sel.has(x.payableId)&&Math.abs((new Date(x.payDate+"T00:00:00")-new Date(m.date+"T00:00:00"))/86400000)<=7)
    .reduce((s,x)=>s+num(x.amount),0);
  const toRecord=r2(m.amount-nearPaid);
  const openPicked=picked.filter(payIsOpen);
  const openBal=r2(openPicked.reduce((s,p)=>s+payBalance(p),0));
  // Entries for the AP payment: one bill → the outstanding part of this row;
  // several → each bill in full, only when they add up to the row exactly.
  const entries=toRecord<=0.005||!openPicked.length?[]
    :openPicked.length===1?[{payableId:openPicked[0].id,amount:Math.min(toRecord,payBalance(openPicked[0]))}]
    :Math.abs(openBal-toRecord)<0.01?openPicked.map(p=>({payableId:p.id,amount:payBalance(p)})):null;
  const notApproved=openPicked.filter(p=>!approvedBill(p));
  const[record,setRecord]=useState(true);
  const willRecord=record&&canPay&&entries&&entries.length>0;

  const save=async()=>{
    if(busy) return;
    if(!canSheet&&!willRecord){await uiAlert("You can't change this cash-position day, and there's no payment to record.");return;}
    if(willRecord&&method==="Check"&&!ref.trim()){await uiAlert("Enter the check number.");return;}
    if(willRecord&&notApproved.length){await uiAlert(`${notApproved.map(billLabel).join(", ")} ${notApproved.length>1?"aren't":"isn't"} approved yet. A Manager or Finance Manager approves it in Supplier Bills first.`);return;}
    let pastEdit=null;
    if(canSheet&&locked&&isMgr){
      const why=await uiPrompt({title:`${m.date} is locked`,tone:"warning",confirmLabel:"Link on locked day",message:"This cash-position day has locked. As a Manager you can still link the disbursement; the reason is kept in the Audit Trail and sent to management.\n\nWhy?"});
      if(!why||!String(why).trim()) return;
      pastEdit={reason:String(why).trim()};
    }
    setBusy(true);
    try{
      if(willRecord){
        const ok=await onPayMany(entries,{date:m.date,method,bank:bankOf(m.bank)?.id||m.bank||"",ref:ref.trim(),note:`Cash position ${m.date}: ${m.payee||""} ${php2(m.amount)}`.trim()});
        if(!ok) return;
      }
      if(canSheet){
        const dayPos=cashPositions[m.date];
        const rows=dayPos?.disbursements?.manual||[];
        let idx=m.rowId?rows.findIndex(x=>x.id===m.rowId):-1;
        if(idx<0&&!m.rowId&&rows[m.rowIndex]&&Math.abs(num(rows[m.rowIndex].amount)-m.amount)<0.01) idx=m.rowIndex;
        if(!dayPos||idx<0){await uiAlert("That disbursement changed on the cash sheet since this page loaded. Reopen the day and try again.");return;}
        const ids=[...sel];
        const md=[...rows];
        const row={...md[idx],payableIds:ids};
        delete row.payableId;
        md[idx]=row;
        const at=new Date().toISOString();
        const label=ids.length?picked.map(billLabel).join(", "):"removed";
        const entry={at,by:userName||"—",action:"Edited",changes:[{field:`Bill link · ${m.payee||"disbursement"} ${php2(m.amount)} → ${label}`,note:true}]};
        if(pastEdit) entry.pastEdit=pastEdit;
        saveDayPos(m.date,{...dayPos,disbursements:{...dayPos.disbursements,manual:md},audit:[...(Array.isArray(dayPos.audit)?dayPos.audit:[]),entry],savedAt:at});
      }
      onClose();
    }finally{setBusy(false);}
  };

  return(
    <Modal open onClose={()=>!busy&&onClose()} title={`Link disbursement · ${php2(m.amount)}`} wide>
      <div style={{fontSize:".78rem",color:"#475569",marginBottom:10}}>{m.date} · {bankLabel(m.bank)} · <b>{m.payee||"—"}</b>{m.particulars?` · ${m.particulars}`:""}</div>
      {!canSheet&&<div style={{background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:8,padding:"7px 10px",fontSize:".72rem",color:"#9a3412",marginBottom:10}}>{locked?"This day is locked: only a Manager can link it on the cash sheet.":"Only Managers and the cash-position preparer can tag the cash sheet."} You can still record the AP payment.</div>}
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search other bills: supplier, AP, PO, amount…" style={{width:"100%",boxSizing:"border-box",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"7px 10px",fontFamily:"inherit",fontSize:".8rem",marginBottom:8}}/>
      <div style={{maxHeight:260,overflowY:"auto",border:`1px solid ${C.line}`,borderRadius:8,marginBottom:10}}>
        {cands.map(({p,same,exact})=>(
          <label key={p.id} style={{display:"flex",gap:8,alignItems:"flex-start",padding:"7px 10px",borderBottom:"1px solid #f1f5f9",cursor:"pointer",background:sel.has(p.id)?"#f0fdf4":undefined}}>
            <input type="checkbox" checked={sel.has(p.id)} onChange={()=>setSel(prev=>{const n=new Set(prev);n.has(p.id)?n.delete(p.id):n.add(p.id);return n;})}/>
            <div style={{flex:1,minWidth:0,fontSize:".76rem"}}>
              <div style={{fontWeight:700}}>{p.vendor||"—"} <span style={{fontWeight:500,color:C.muted}}>{billLabel(p)}</span></div>
              <div style={{fontSize:".68rem",color:C.muted}}>{[projName(p.projectId),p.dueDate&&`due ${p.dueDate}`,p.status].filter(Boolean).join(" · ")}</div>
            </div>
            <div style={{textAlign:"right",fontSize:".76rem",whiteSpace:"nowrap"}}>
              <b>{php2(payBalance(p))}</b>{num(p.paidAmount)>0&&<div style={{fontSize:".66rem",color:C.faint}}>of {php2(p.amount)}</div>}
              <div>{same&&chip("same payee",C.ok)} {exact&&chip("same amount","#2563eb")}</div>
            </div>
          </label>
        ))}
        {cands.length===0&&<div style={{padding:16,textAlign:"center",color:C.faint,fontSize:".76rem"}}>No bill with this payee or amount. Search above, or add it with + New payable first.</div>}
      </div>
      {picked.length>0&&(
        <div style={{border:`1px solid ${C.line}`,borderRadius:8,padding:"9px 12px",marginBottom:10,fontSize:".76rem"}}>
          <div>Selected: <b>{picked.length}</b> bill(s) · open balance {php2(openBal)} · already recorded in AP near {m.date}: {php2(nearPaid)}</div>
          {toRecord<=0.005&&<div style={{color:C.ok,marginTop:4}}>✓ The AP payment is already recorded. Linking only tags the cash-sheet row.</div>}
          {toRecord>0.005&&!openPicked.length&&<div style={{color:C.muted,marginTop:4}}>The selected bill(s) are already fully paid in AP. Linking only tags the cash-sheet row; check it isn't a second payment.</div>}
          {toRecord>0.005&&entries===null&&<div style={{color:C.warn,marginTop:4}}>⚠ {php2(toRecord)} to record doesn't equal the selected bills' balance ({php2(openBal)}). Link them only, and record the payment per bill in Supplier Bills.</div>}
          {toRecord>0.005&&entries&&entries.length>0&&canPay&&(
            <div style={{marginTop:6}}>
              <label style={{display:"flex",gap:6,alignItems:"center",fontWeight:700,cursor:"pointer"}}><input type="checkbox" checked={record} onChange={e=>setRecord(e.target.checked)}/> Also record the AP payment: {php2(entries.reduce((s,e)=>s+e.amount,0))} on {m.date} from {bankLabel(m.bank)}</label>
              {record&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:8}}>
                <Fld label="Method"><Sel value={method} onChange={e=>setMethod(e.target.value)}>{METHODS.map(x=><option key={x}>{x}</option>)}</Sel></Fld>
                <Fld label={method==="Check"?"Check number":"Reference no."} required={method==="Check"}><Inp value={ref} onChange={e=>setRef(e.target.value)}/></Fld>
              </div>}
              {record&&!bankOf(m.bank)&&<div style={{fontSize:".7rem",color:C.warn}}>⚠ This row has no bank on the cash sheet. Tag the bank there too.</div>}
            </div>
          )}
        </div>
      )}
      <div style={{display:"flex",gap:8,justifyContent:"space-between",flexWrap:"wrap"}}>
        <div>{m.payableIds?.length>0&&canSheet&&<button disabled={busy} onClick={()=>{setSel(new Set());}} style={emBtn(C.bad,true)}>Clear links</button>}</div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={onClose} disabled={busy} style={{background:"#f1f5f9",border:"none",borderRadius:8,padding:"9px 16px",fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
          <button onClick={save} disabled={busy||(!sel.size&&!m.payableIds?.length)} style={{background:"#059669",color:"#fff",border:"none",borderRadius:8,padding:"9px 16px",fontWeight:700,cursor:"pointer",fontFamily:"inherit",opacity:busy?.6:1}}>{busy?"Saving…":willRecord?(canSheet?"Link & record payment":"Record payment"):"Save link"}</button>
        </div>
      </div>
    </Modal>
  );
}

