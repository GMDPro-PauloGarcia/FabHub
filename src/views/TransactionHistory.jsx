import React,{useState,useMemo} from "react";
import {today as TODAY,BANKS,addDaysLocalISO} from "../shared";
import {projDisplayName,dealJo} from "../core";
import {num,php2,bankOf,bankLabel,cashMovements,reconcileLedger,buildOrders,payBalance} from "../data/ledger";
// Transfers between GMD's own banks are shown but left out of Money in / out.
import {Sheet,chip,linkBtn,LedgerHost} from "./Ledgers";

// ─── TRANSACTION HISTORY (Executive) ───────────────────────────────────────
// Every php2 that moved in GMD's banks, newest first, from the Daily Cash
// Position (collections in, disbursements out: the sheet Mark keeps daily).
// Each movement is tied to what FabHub knows about it:
//   • a disbursement → the supplier payment(s) recorded in AP → bill → PO / WO
//     → project. Linked when the disbursement is tagged to a bill on the cash
//     sheet; otherwise suggested by supplier + amount within 7 days.
//   • a collection → a client billing payment (amount within 7 days) → milestone
//     → project.
// AP payments and client collections recorded in FabHub with no matching bank
// movement are listed too ("Not in cash position"): either the sheet missed it
// or it was recorded twice. Read-only.

const C={ink:"#0f172a",muted:"#64748b",faint:"#94a3b8",line:"#e2e8f0",ok:"#059669",warn:"#d97706",bad:"#dc2626",inC:"#1d4ed8",outC:"#b45309"};
const lgTh={padding:"7px 9px",fontSize:".64rem",fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:".5px",textAlign:"left",whiteSpace:"nowrap",background:"#f8fafc",borderBottom:`1px solid ${C.line}`};
const lgTd={padding:"7px 9px",fontSize:".76rem",color:C.ink,borderBottom:"1px solid #f1f5f9",verticalAlign:"top"};
const lgTdR={...lgTd,textAlign:"right",whiteSpace:"nowrap",fontVariantNumeric:"tabular-nums"};
const LINK={transfer:["Bank transfer","#7c3aed"],nobill:["No bill",C.muted],linked:["Linked",C.ok],short:["Partly recorded",C.warn],suggested:["Suggested match","#2563eb"],none:["Not linked",C.faint],orphan:["Not in cash position",C.bad]};
const PAGE=150;

const Field=({l,children})=>(
  <div style={{display:"grid",gridTemplateColumns:"150px 1fr",gap:8,padding:"5px 0",borderBottom:"1px dashed #eef2f7",fontSize:".78rem"}}>
    <div style={{color:C.muted,fontWeight:600}}>{l}</div><div style={{color:C.ink,overflowWrap:"anywhere"}}>{children??"—"}</div>
  </div>
);
const TxSection=({title,children})=>(
  <div style={{border:`1px solid ${C.line}`,borderRadius:10,padding:"10px 14px",marginBottom:12}}>
    <div style={{fontSize:".66rem",fontWeight:800,color:"#0B2545",textTransform:"uppercase",letterSpacing:".6px",marginBottom:6}}>{title}</div>
    {children}
  </div>
);
const bankFull=v=>{const b=bankOf(v);return b?`${b.name} (${b.short}) · ${b.acctNo} · ${b.branch}`:(v||"Not tagged");};

export default function TransactionHistory({cashPositions={},payables=[],payPays=[],billings=[],deals=[],prs=[],swos=[],exps=[],jos=[],today=TODAY}){
  const[from,setFrom]=useState(()=>addDaysLocalISO(today,-30));
  const[to,setTo]=useState(today);
  const[bank,setBank]=useState("all");
  const[dir,setDir]=useState("all");
  const[link,setLink]=useState("all");
  const[q,setQ]=useState("");
  const[limit,setLimit]=useState(PAGE);
  const[pick,setPick]=useState(null);
  const[ledger,setLedger]=useState(null);

  const dealById=useMemo(()=>new Map(deals.map(d=>[d.id,d])),[deals]);
  const payById=useMemo(()=>new Map(payables.map(p=>[p.id,p])),[payables]);
  const orders=useMemo(()=>buildOrders({prs,swos,payables}),[prs,swos,payables]);
  const orderOf=b=>b&&orders.find(o=>o.no&&(o.no===b.poId||o.no===b.poNumber));
  const projName=id=>{const d=dealById.get(id);return d?projDisplayName(d):"";};

  const all=useMemo(()=>{
    const movements=cashMovements(cashPositions);
    const rec=reconcileLedger({movements,payables,payPays,billings});
    const rows=movements.map(m=>{
      const r=rec.byKey.get(m.key)||{status:"none"};
      let who="",project="",ref="";
      if(m.dir==="out"){
        const bills=(r.payableIds||[]).map(id=>payById.get(id)).filter(Boolean);
        who=[...new Set(bills.map(b=>b.vendor).filter(Boolean))].join(", ");
        project=[...new Set(bills.map(b=>projName(b.projectId)).filter(Boolean))].join(", ");
        ref=[...new Set(bills.map(b=>b.poId||b.poNumber||b.apNumber).filter(Boolean))].join(", ");
      } else if(r.status==="nobill"){
        who=r.kind;
      } else if(r.billing){
        const d=dealById.get(r.billing.ms.dealId);
        who=d?.client||"";project=d?projDisplayName(d):"";ref=r.billing.ms.invoiceNo||r.billing.ms.name||"";
      }
      if(r.status==="transfer"&&r.pair) who=`${m.dir==="out"?"to":"from"} ${bankLabel(r.pair.bank)}`;
      return {...m,link:r.status,rec:r,who,project,ref};
    });
    // FabHub records with no bank movement on the sheet.
    rec.unmatchedAp.forEach(g=>{
      const bills=g.payableIds.map(id=>payById.get(id)).filter(Boolean);
      rows.push({key:"ap#"+g.id,src:"ap",dir:"out",date:g.date,bank:g.bank,amount:g.amount,
        payee:[...new Set(bills.map(b=>b.vendor).filter(Boolean))].join(", ")||"Supplier payment",
        particulars:`AP payment ${g.pays[0].method||""} ${g.pays[0].refNo||""}`.trim(),
        link:"orphan",rec:{groups:[g],payableIds:g.payableIds},
        who:[...new Set(bills.map(b=>b.vendor).filter(Boolean))].join(", "),
        project:[...new Set(bills.map(b=>projName(b.projectId)).filter(Boolean))].join(", "),
        ref:[...new Set(bills.map(b=>b.poId||b.poNumber||b.apNumber).filter(Boolean))].join(", ")});
    });
    rec.unmatchedBilling.forEach(x=>{
      const d=dealById.get(x.ms.dealId);
      rows.push({key:"bp#"+x.id,src:"billing",dir:"in",date:x.date,bank:x.bank,amount:x.amount,
        payee:d?.client||"Client collection",particulars:`Billing payment ${x.p.refNo||""}`.trim(),
        link:"orphan",rec:{billing:x},who:d?.client||"",project:d?projDisplayName(d):"",ref:x.ms.invoiceNo||x.ms.name||""});
    });
    return rows.sort((a,b)=>String(b.date).localeCompare(String(a.date))||a.dir.localeCompare(b.dir));
  },[cashPositions,payables,payPays,billings,deals]);

  const rows=useMemo(()=>{
    const qq=q.trim().toLowerCase();
    return all.filter(r=>(!from||r.date>=from)&&(!to||r.date<=to)
      &&(bank==="all"||(bank==="none"?!bankOf(r.bank):bankOf(r.bank)?.id===bank))
      &&(dir==="all"||r.dir===dir)
      &&(link==="all"||(link==="linked"?["linked","suggested"].includes(r.link):r.link===link))
      &&(!qq||[r.payee,r.particulars,r.who,r.project,r.ref,bankLabel(r.bank),String(r.amount)].some(v=>String(v||"").toLowerCase().includes(qq))));
  },[all,from,to,bank,dir,link,q]);

  const cashRows=rows.filter(r=>r.src==="cash"&&r.link!=="transfer");
  const transfers=rows.filter(r=>r.link==="transfer"&&r.dir==="out");
  const tIn=cashRows.filter(r=>r.dir==="in").reduce((s,r)=>s+r.amount,0);
  const tOut=cashRows.filter(r=>r.dir==="out").reduce((s,r)=>s+r.amount,0);
  const perBank=BANKS.map(b=>{
    const rs=rows.filter(r=>r.src==="cash").filter(r=>bankOf(r.bank)?.id===b.id);
    return {b,inn:rs.filter(r=>r.dir==="in").reduce((s,r)=>s+r.amount,0),out:rs.filter(r=>r.dir==="out").reduce((s,r)=>s+r.amount,0),n:rs.length};
  }).filter(x=>x.n>0);
  const untagged=cashRows.filter(r=>!bankOf(r.bank));
  const orphans=rows.filter(r=>r.link==="orphan");
  const unlinkedOut=cashRows.filter(r=>r.dir==="out"&&r.link==="none");

  const exportCsv=()=>{
    const esc=v=>`"${String(v??"").replace(/"/g,'""')}"`;
    const lines=[["Date","Bank","Direction","Amount","Payee","Particulars","Supplier / client","Project","PO / invoice","Link","Source"].map(esc).join(",")];
    rows.forEach(r=>lines.push([r.date,bankLabel(r.bank),r.dir==="in"?"In":"Out",r.amount.toFixed(2),r.payee,r.particulars,r.who,r.project,r.ref,LINK[r.link]?.[0]||r.link,r.src==="cash"?"Cash position":r.src==="ap"?"AP payment":"Billing payment"].map(esc).join(",")));
    const blob=new Blob(["﻿"+lines.join("\n")],{type:"text/csv;charset=utf-8"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`GMD_transactions_${from||"all"}_${to||today}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);
  };

  const inp={border:"1.5px solid #e2e8f0",borderRadius:8,padding:"6px 9px",fontFamily:"inherit",fontSize:".78rem",background:"#fff"};
  const shown=rows.slice(0,limit);
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,flexWrap:"wrap",marginBottom:12}}>
        <div>
          <div style={{fontWeight:800,color:"#0B2545",fontSize:"1.05rem"}}>🏦 Transaction History</div>
          <div style={{fontSize:".76rem",color:C.muted,marginTop:2,maxWidth:720}}>Every bank movement from the Daily Cash Position, tied to the project, supplier or client, bill and PO behind it. Click a row for the full trail.</div>
        </div>
        <button onClick={exportCsv} style={{background:"#0B2545",color:"#fff",border:"none",borderRadius:8,padding:"8px 14px",fontWeight:700,fontSize:".78rem",cursor:"pointer",fontFamily:"inherit"}}>⬇ Export CSV</button>
      </div>

      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",marginBottom:12}}>
        <label style={{fontSize:".72rem",color:C.muted}}>From <input type="date" value={from} onChange={e=>{setFrom(e.target.value);setLimit(PAGE);}} style={inp}/></label>
        <label style={{fontSize:".72rem",color:C.muted}}>To <input type="date" value={to} onChange={e=>{setTo(e.target.value);setLimit(PAGE);}} style={inp}/></label>
        <select value={bank} onChange={e=>{setBank(e.target.value);setLimit(PAGE);}} style={inp} aria-label="Bank">
          <option value="all">All banks</option>
          {BANKS.map(b=><option key={b.id} value={b.id}>{b.short}</option>)}
          <option value="none">No bank tagged</option>
        </select>
        <select value={dir} onChange={e=>{setDir(e.target.value);setLimit(PAGE);}} style={inp} aria-label="Direction">
          <option value="all">In & out</option><option value="in">Collections (in)</option><option value="out">Disbursements (out)</option>
        </select>
        <select value={link} onChange={e=>{setLink(e.target.value);setLimit(PAGE);}} style={inp} aria-label="Link status">
          <option value="all">Any link status</option>
          <option value="linked">Linked or suggested</option>
          <option value="nobill">No bill (payroll, petty cash…)</option>
          <option value="transfer">Bank transfers</option>
          <option value="none">Not linked</option>
          <option value="short">Partly recorded</option>
          <option value="orphan">Not in cash position</option>
        </select>
        <input value={q} onChange={e=>{setQ(e.target.value);setLimit(PAGE);}} placeholder="Search payee, supplier, project, PO, amount…" style={{...inp,flex:"1 1 220px",minWidth:0}}/>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:8,marginBottom:12}}>
        {[["Money in",php2(tIn),C.inC],["Money out",php2(tOut),C.outC],["Net",php2(tIn-tOut),tIn-tOut>=0?C.ok:C.bad],
          ["Between GMD banks",php2(transfers.reduce((s,r)=>s+r.amount,0)),"#7c3aed",`${transfers.length} transfer(s), not counted above`],
          ["Out, not linked",String(unlinkedOut.length),unlinkedOut.length?C.warn:C.ok,php2(unlinkedOut.reduce((s,r)=>s+r.amount,0))],
          ["Not in cash position",String(orphans.length),orphans.length?C.bad:C.ok,"recorded in FabHub only"]].map(([l,v,c,f])=>(
          <div key={l} style={{border:`1px solid ${C.line}`,borderRadius:10,padding:"9px 12px",background:"#fff"}}>
            <div style={{fontSize:".62rem",fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:".5px"}}>{l}</div>
            <div style={{fontSize:"1.02rem",fontWeight:800,color:c,marginTop:2}}>{v}</div>
            {f&&<div style={{fontSize:".66rem",color:C.faint}}>{f}</div>}
          </div>
        ))}
      </div>
      {perBank.length>0&&(
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
          {perBank.map(({b,inn,out})=>(
            <button key={b.id} onClick={()=>setBank(bank===b.id?"all":b.id)} style={{border:`1px solid ${bank===b.id?b.color:C.line}`,borderLeft:`4px solid ${b.color}`,borderRadius:8,padding:"6px 10px",background:"#fff",cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}>
              <div style={{fontSize:".72rem",fontWeight:800,color:C.ink}}>{b.short}</div>
              <div style={{fontSize:".66rem",color:C.muted}}><span style={{color:C.inC}}>+{php2(inn)}</span> · <span style={{color:C.outC}}>−{php2(out)}</span></div>
            </button>
          ))}
          {untagged.length>0&&<span style={{alignSelf:"center",fontSize:".7rem",color:C.bad}}>⚠ {untagged.length} row(s) with no bank on the cash sheet</span>}
        </div>
      )}

      <div style={{background:"#fff",border:`1px solid ${C.line}`,borderRadius:12,overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",minWidth:860}}>
          <thead><tr>{[["Date"],["Bank"],["In",1],["Out",1],["Payee / particulars"],["Project · supplier / client · PO"],["Link"]].map(([h,r],i)=><th key={i} style={{...lgTh,textAlign:r?"right":"left"}}>{h}</th>)}</tr></thead>
          <tbody>
            {shown.map(r=>{
              const [lt,lc]=LINK[r.link]||[r.link,C.faint];
              return(
                <tr key={r.key} onClick={()=>setPick(r)} style={{cursor:"pointer",background:r.link==="orphan"?"#fef2f2":undefined}}
                  onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"} onMouseLeave={e=>e.currentTarget.style.background=r.link==="orphan"?"#fef2f2":""}>
                  <td style={{...lgTd,whiteSpace:"nowrap"}}>{r.date||"—"}</td>
                  <td style={lgTd}>{bankOf(r.bank)?<span style={{fontWeight:700,color:bankOf(r.bank).color}}>{bankOf(r.bank).short}</span>:<span style={{color:C.bad}}>{r.bank||"—"}</span>}</td>
                  <td style={{...lgTdR,color:C.inC,fontWeight:700}}>{r.dir==="in"?php2(r.amount):""}</td>
                  <td style={{...lgTdR,color:C.outC,fontWeight:700}}>{r.dir==="out"?php2(r.amount):""}</td>
                  <td style={lgTd}><div style={{fontWeight:600}}>{r.payee||"—"}</div>{r.particulars&&<div style={{fontSize:".68rem",color:C.muted}}>{r.particulars}</div>}</td>
                  <td style={lgTd}>{r.project&&<div style={{fontWeight:600}}>{r.project}</div>}<div style={{fontSize:".68rem",color:C.muted}}>{[r.who,r.ref].filter(Boolean).join(" · ")||(r.project?"":"—")}</div></td>
                  <td style={lgTd}>{chip(lt,lc)}</td>
                </tr>
              );
            })}
            {rows.length===0&&<tr><td colSpan={7} style={{...lgTd,textAlign:"center",color:C.faint,padding:24}}>No transactions match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
      {rows.length>limit&&<button onClick={()=>setLimit(l=>l+PAGE)} style={{marginTop:8,background:"#f1f5f9",border:"none",borderRadius:7,padding:"6px 14px",fontSize:".76rem",fontWeight:600,color:"#475569",cursor:"pointer",fontFamily:"inherit"}}>Show {Math.min(PAGE,rows.length-limit)} more of {rows.length-limit}</button>}
      <div style={{fontSize:".7rem",color:C.faint,marginTop:10}}>"Linked" = the disbursement is tagged to a bill on the cash sheet and the AP payment matches. "Bank transfer" = same amount out of one GMD bank and into another the same day (or tagged so); left out of the totals. "Suggested" = same supplier and amount within 7 days, not tagged. Tag disbursements to bills on the Daily Cash Position (🔗 column) or in Expense Monitoring to firm these up.</div>

      {pick&&<TxnDetail r={pick} onClose={()=>setPick(null)} payById={payById} dealById={dealById} orderOf={orderOf} jos={jos} cashPositions={cashPositions}
        onSupplier={v=>{setPick(null);setLedger({kind:"supplier",id:v});}} onProject={id=>{setPick(null);setLedger({kind:"project",id});}}/>}
      <LedgerHost open={ledger} setOpen={setLedger} prs={prs} swos={swos} payables={payables} payPays={payPays} exps={exps} deals={deals} today={today}/>
    </div>
  );
}

function ProjectFields({d,jos,onProject}){
  if(!d) return <Field l="Project">Not tagged to a project</Field>;
  const jo=dealJo(jos,d.id);
  return(<>
    <Field l="Project">{onProject?<button style={linkBtn} onClick={()=>onProject(d.id)}>{projDisplayName(d)}</button>:projDisplayName(d)}</Field>
    <Field l="Client">{d.client}</Field>
    <Field l="CE / JO">{[d.ceNo,jo?.joNo].filter(Boolean).join(" · ")||"—"}</Field>
    <Field l="Stage">{d.stage}</Field>
  </>);
}

function TxnDetail({r,onClose,payById,dealById,orderOf,jos,cashPositions,onSupplier,onProject}){
  const [lt,lc]=LINK[r.link]||[r.link,C.faint];
  const day=r.src==="cash"?cashPositions[r.date]:null;
  const lastSave=Array.isArray(day?.audit)&&day.audit.length?day.audit[day.audit.length-1]:null;
  const groups=r.rec?.groups||[];
  const billIds=r.rec?.payableIds||[];
  const bills=billIds.map(id=>payById.get(id)).filter(Boolean);
  const bp=r.rec?.billing;
  return(
    <Sheet title={`${r.dir==="in"?"⬇ Money in":"⬆ Money out"} · ${php2(r.amount)}`} sub={`${r.date} · ${bankLabel(r.bank)} · ${r.payee||""}`} onClose={onClose}>
      <div style={{marginBottom:10}}>{chip(lt,lc)}</div>
      <TxSection title={r.src==="cash"?"Bank movement (Daily Cash Position)":"Recorded in FabHub, not on the cash sheet"}>
        <Field l="Date">{r.date}</Field>
        <Field l="Bank">{bankFull(r.bank)}</Field>
        <Field l="Amount"><b>{php2(r.amount)}</b> {r.dir==="in"?"in":"out"}</Field>
        <Field l="Payee">{r.payee}</Field>
        {r.particulars&&<Field l="Particulars">{r.particulars}</Field>}
        {lastSave&&<Field l="Sheet last saved">{lastSave.by||"—"} · {String(lastSave.at||"").replace("T"," ").slice(0,16)}</Field>}
        {r.link==="orphan"&&<div style={{fontSize:".74rem",color:C.bad,marginTop:6}}>⚠ No bank movement on the Daily Cash Position matches this within 7 days. Either the sheet is missing it, or it was recorded twice in FabHub.</div>}
        {r.link==="short"&&<div style={{fontSize:".74rem",color:C.warn,marginTop:6}}>⚠ Tagged to {bills.length} bill(s), but the AP payments recorded near this date total {php2(r.rec.recorded)} of {php2(r.amount)}. Record the rest in Expense Monitoring.</div>}
        {r.link==="transfer"&&<div style={{fontSize:".74rem",color:"#7c3aed",marginTop:6}}>Money moved between GMD's own banks{r.rec?.pair?` (${r.dir==="out"?"into":"from"} ${bankLabel(r.rec.pair.bank)}, same day, same amount)`:""}. Not counted as money in or out.</div>}
        {r.link==="nobill"&&<div style={{fontSize:".74rem",color:C.muted,marginTop:6}}>Tagged in Expense Monitoring as <b>{r.rec.kind}</b>: paid no supplier bill.</div>}
        {r.link==="none"&&r.dir==="out"&&<div style={{fontSize:".74rem",color:C.muted,marginTop:6}}>Not tied to any bill. Tag it on the Daily Cash Position (🔗) or in Expense Monitoring if it paid a supplier.</div>}
      </TxSection>
      {groups.map(g=>(
        <TxSection key={g.id} title={`Supplier payment${g.pays.length>1?` · ${g.pays.length} bills in one payment`:""}`}>
          <Field l="Paid on">{g.date}</Field>
          <Field l="Amount">{php2(g.amount)}</Field>
          <Field l="Method / bank">{[g.pays[0].method,bankLabel(g.pays[0].bank)].filter(Boolean).join(" · ")}</Field>
          <Field l="Check / reference">{g.pays[0].refNo||"—"}</Field>
          <Field l="Recorded by">{[g.pays[0].recordedBy,String(g.pays[0].createdAt||"").replace("T"," ").slice(0,16)].filter(Boolean).join(" · ")}</Field>
          {g.pays[0].note&&<Field l="Note">{g.pays[0].note}</Field>}
        </TxSection>
      ))}
      {bills.map(b=>{
        const o=orderOf(b);
        const d=dealById.get(b.projectId)||(o?.projectIds?.[0]&&dealById.get(o.projectIds[0]));
        return(
          <TxSection key={b.id} title={`Bill ${b.apNumber||""}`}>
            <Field l="Supplier"><button style={linkBtn} onClick={()=>onSupplier(b.vendor)}>{b.vendor||"—"}</button></Field>
            <Field l="Supplier invoice">{[b.invoiceNumber,b.invoiceDate].filter(Boolean).join(" · ")||"—"}</Field>
            <Field l="Due">{b.dueDate||"—"}</Field>
            <Field l="Bill amount">{php2(b.amount)} · paid {php2(b.paidAmount)} · balance <b style={{color:payBalance(b)>0?C.bad:C.ok}}>{php2(payBalance(b))}</b></Field>
            <Field l="Status">{b.status} · {b.approvalStatus==="Approved"?`approved${b.approvedBy?` by ${b.approvedBy}`:""}`:b.approvalStatus}</Field>
            <Field l="Account">{b.accountCode||"—"}</Field>
            {o&&<>
              <Field l={o.kind==="PO"?"Purchase order":"Work order"}>{o.no} · {o.date||"no date"} · {php2(o.amount)} · {o.status}</Field>
              <Field l="Delivery">{o.delivery}</Field>
              {o.kind==="PO"&&<Field l="Items">{o.items.filter(i=>i.status!=="Cancelled").slice(0,8).map(i=>`${i.itemName||"item"} × ${num(i.qty)}${i.unit?" "+i.unit:""}`).join("; ")}{o.items.length>8?` … +${o.items.length-8} more`:""}</Field>}
            </>}
            <ProjectFields d={d} jos={jos} onProject={onProject}/>
          </TxSection>
        );
      })}
      {bp&&(
        <TxSection title="Client collection (Billing)">
          <Field l="Client">{dealById.get(bp.ms.dealId)?.client}</Field>
          <Field l="Milestone">{[bp.ms.name,bp.ms.invoiceNo&&`Invoice ${bp.ms.invoiceNo}`].filter(Boolean).join(" · ")}</Field>
          <Field l="Milestone amount">{php2(bp.ms.amount)} · {bp.ms.status}</Field>
          <Field l="Payment">{php2(bp.p.amount)} on {bp.p.date||"—"}{bp.p.valueDate&&bp.p.valueDate!==bp.p.date?` (value date ${bp.p.valueDate})`:""}</Field>
          <Field l="Method / bank">{[bp.p.method,bankLabel(bp.p.bank)].filter(Boolean).join(" · ")}</Field>
          <Field l="Reference">{bp.p.refNo}</Field>
          <Field l="Recorded by">{bp.p.recordedBy}</Field>
          <ProjectFields d={dealById.get(bp.ms.dealId)} jos={jos} onProject={onProject}/>
          {r.link==="suggested"&&<div style={{fontSize:".72rem",color:"#2563eb",marginTop:6}}>Suggested by amount and date (the cash sheet doesn't name the client payment). Check the reference before relying on it.</div>}
        </TxSection>
      )}
    </Sheet>
  );
}
