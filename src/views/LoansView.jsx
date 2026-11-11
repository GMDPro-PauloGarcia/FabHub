import React,{useMemo,useState} from "react";
import {cashMovements} from "../data/ledger";
import {Modal,uid,toastEmit,uiConfirm,BANKS} from "../shared";
import {supabase,isSupabaseReady,loanFromSb,loanToSb,loanEntryToSb} from "../supabaseClient";

// ─── LOANS (Executive › Loans) — PREVIEW, 2026-11-08 ───────────────────────
// Two kinds of borrowing, as Paulo described them:
//   • Credit lines: a limit at a bank; GMD draws and repays. Shows drawn,
//     available, utilisation and interest.
//   • Bank loans: a fixed amount borrowed, paid back in monthly amortisation.
//     Shows borrowed, principal paid, balance, next due date, months left.
// Every draw and payment points at the cash-sheet row it came from (date +
// bank), so the loan balance and the cash position are the same money.
// Cash-sheet rows that look like loan activity but are not linked yet are
// listed at the top for Mark / a Manager to link.

const lnNum=v=>Number(String(v??"").replace(/,/g,""))||0;
const lnPeso=v=>"₱"+Math.round(lnNum(v)).toLocaleString("en-PH");
const lnShort=v=>{const n=lnNum(v);return n>=1e6?"₱"+(n/1e6).toFixed(2).replace(/\.?0+$/,"")+"M":n>=1e3?"₱"+Math.round(n/1e3)+"K":"₱"+Math.round(n);};
const LN={ink:"#0f172a",muted:"#475569",faint:"#64748b",line:"#e2e8f0",navy:"#0B2545",red:"#b91c1c",amber:"#b45309",green:"#047857",blue:"#2563eb"};
const LOAN_TEXT=/(proceed.*loan|loan.*proceed|credit\s*line|interest\s*bpi|bank\s*loan|amorti[sz]ation|loan\s*bpi|bpi\s*loan)/i;
const addMonths=(iso,n)=>{const d=new Date(iso+"T00:00:00");d.setMonth(d.getMonth()+n);return d.toISOString().slice(0,10);};
const daysBetween=(a,b)=>Math.round((new Date(b+"T00:00:00")-new Date(a+"T00:00:00"))/86400000);

// A bank loan's position today: principal paid, balance, months paid, next due.
export const bankLoanStatus=(l,today)=>{
  const pays=(l.payments||[]).filter(p=>!p.void);
  const principalPaid=pays.reduce((s,p)=>s+lnNum(p.principal),0);
  const interestPaid=pays.reduce((s,p)=>s+lnNum(p.interest),0);
  const balance=Math.max(0,lnNum(l.principal)-principalPaid);
  const paidCount=pays.length;
  const term=lnNum(l.termMonths)||0;
  const nextDue=balance>0&&l.firstDue?addMonths(l.firstDue,paidCount):null;
  const dueIn=nextDue?daysBetween(today,nextDue):null;
  const state=balance<=0?"paid":dueIn==null?"no-schedule":dueIn<0?"missed":dueIn<=3?"due":"ok";
  return{principalPaid,interestPaid,balance,paidCount,term,nextDue,dueIn,state};
};
// A credit line's position today: drawn = draws − principal repaid.
export const creditLineStatus=l=>{
  const draws=(l.draws||[]).reduce((s,d)=>s+lnNum(d.amount),0);
  const repaid=(l.payments||[]).reduce((s,p)=>s+lnNum(p.principal),0);
  const interest=(l.payments||[]).reduce((s,p)=>s+lnNum(p.interest),0);
  const drawn=Math.max(0,draws-repaid);
  const limit=lnNum(l.limit);
  return{drawn,limit,available:Math.max(0,limit-drawn),util:limit>0?drawn/limit:0,interest};
};

// Reload loans + entries from the server after any save (the database decides).
export const fetchLoans=async()=>{
  const[{data:ls,error:e1},{data:ps,error:e2}]=await Promise.all([
    supabase.from("loans").select("*").order("created_at"),
    supabase.from("loan_payments").select("*").order("date")]);
  if(e1||e2) throw (e1||e2);
  return (ls||[]).map(l=>loanFromSb(l,ps||[]));
};
const lnErr=e=>String(e?.message||e||"").replace(/^.*?ERROR:\s*/,"");

export default function LoansView({loans=[],cashPositions={},today,canEdit=false,canDelete=false,isMobile=false,sample=false,onLoans}){
  const[open,setOpen]=useState(null);
  const[loanForm,setLoanForm]=useState(null);   // {kind, ...} add / edit a loan
  const[entryForm,setEntryForm]=useState(null); // {loanId, type, cashKey, ...} record a draw / payment
  const reload=async()=>{try{onLoans&&onLoans(await fetchLoans());}catch(e){toastEmit("Could not reload loans: "+lnErr(e),"error");}};
  const delEntry=async(x)=>{
    if(!(await uiConfirm({title:"Delete this entry?",message:`${x.type==="draw"?"Draw":"Payment"} of ₱${Math.round(x.amount).toLocaleString("en-PH")} on ${x.date}. It is kept in the audit log.`,confirmLabel:"Delete",tone:"danger"}))) return;
    const{error}=await supabase.from("loan_payments").delete().eq("id",x.id);
    if(error){toastEmit("Not deleted: "+lnErr(error),"error",9000);return;}
    toastEmit("Entry deleted","success");reload();
  };
  const lines=loans.filter(l=>l.kind==="credit_line");
  const bankLoans=loans.filter(l=>l.kind!=="credit_line");
  const lineStats=lines.map(l=>({l,s:creditLineStatus(l)}));
  const loanStats=bankLoans.map(l=>({l,s:bankLoanStatus(l,today)}));

  // Cash-sheet rows that look like loan activity and are not linked to a loan yet.
  const linkedKeys=useMemo(()=>{const k=new Set();loans.forEach(l=>[...(l.draws||[]),...(l.payments||[])].forEach(x=>x.cashKey&&k.add(x.cashKey)));return k;},[loans]);
  const unlinked=useMemo(()=>cashMovements(cashPositions).filter(m=>LOAN_TEXT.test(`${m.payee} ${m.particulars}`)&&!linkedKeys.has(m.key)),[cashPositions,linkedKeys]);

  const owedLines=lineStats.reduce((s,x)=>s+x.s.drawn,0);
  const owedLoans=loanStats.reduce((s,x)=>s+x.s.balance,0);
  const nextDue=loanStats.filter(x=>x.s.nextDue).sort((a,b)=>a.s.nextDue.localeCompare(b.s.nextDue))[0];
  const yr=String(today).slice(0,4);
  const interestYtd=loans.reduce((s,l)=>s+(l.payments||[]).filter(p=>String(p.date).slice(0,4)===yr).reduce((t,p)=>t+lnNum(p.interest),0),0);
  const available=lineStats.reduce((s,x)=>s+x.s.available,0);

  const box={background:"#fff",border:`1px solid ${LN.line}`,borderRadius:12};
  const lnBtn={border:`1px solid ${LN.line}`,borderRadius:7,padding:"5px 11px",background:"#fff",color:LN.navy,fontWeight:700,fontSize:".74rem",cursor:"pointer",fontFamily:"inherit"};
  const th={textAlign:"left",fontSize:".64rem",fontWeight:800,color:LN.faint,textTransform:"uppercase",letterSpacing:".4px",padding:"8px 10px",borderBottom:`1px solid ${LN.line}`,whiteSpace:"nowrap"};
  const td={padding:"10px",fontSize:".8rem",color:LN.ink,borderBottom:"1px solid #f1f5f9",verticalAlign:"top"};
  const Bar=({p,c})=><div style={{height:6,background:"#f1f5f9",borderRadius:3,overflow:"hidden",minWidth:80}}><div style={{width:`${Math.min(100,Math.round(p*100))}%`,height:"100%",background:c}}/></div>;
  const Pill=({state,dueIn})=>{const m={paid:["Paid off","#ecfdf5",LN.green],missed:[`Missed · ${-dueIn}d late`,"#fef2f2",LN.red],due:[dueIn===0?"Due today":`Due in ${dueIn}d`,"#fff7ed",LN.amber],ok:["On schedule","#f1f5f9",LN.muted],"no-schedule":["No schedule","#f1f5f9",LN.faint]}[state];
    return <span style={{background:m[1],color:m[2],borderRadius:20,padding:"2px 9px",fontSize:".68rem",fontWeight:800,whiteSpace:"nowrap"}}>{m[0]}</span>;};
  const CashChip=({x})=>x.cashKey?<span title="Linked to the Daily Cash Position" style={{fontSize:".66rem",color:LN.green,fontWeight:700,whiteSpace:"nowrap"}}>✓ Cash sheet {x.date} · {String(x.bank||"").toUpperCase()}</span>:<span style={{fontSize:".66rem",color:LN.red,fontWeight:700}}>Not on cash sheet</span>;
  const Activity=({l})=>{
    const actions=canEdit&&!sample&&(<div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
      {l.kind==="credit_line"&&<button onClick={()=>setEntryForm({loanId:l.id,type:"draw",date:today})} style={lnBtn}>+ Draw</button>}
      <button onClick={()=>setEntryForm({loanId:l.id,type:"payment",date:today})} style={lnBtn}>+ Payment</button>
      <button onClick={()=>setLoanForm({...l})} style={lnBtn}>Edit loan</button>
    </div>);
    const rows=[...(l.draws||[]).map(d=>({...d,t:"Draw",amt:lnNum(d.amount),inn:true})),...(l.payments||[]).map(p=>({...p,t:"Payment",amt:lnNum(p.principal)+lnNum(p.interest)}))].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
    return(<div style={{background:"#f8fafc",borderTop:`1px solid ${LN.line}`,padding:"8px 14px"}}>
      {actions}
      {rows.length===0&&<div style={{fontSize:".75rem",color:LN.faint}}>No activity yet.</div>}
      {rows.map((r,i)=>(<div key={i} style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap",padding:"5px 0",borderBottom:i<rows.length-1?"1px solid #eef2f7":"none",fontSize:".76rem"}}>
        <span style={{width:84,color:LN.faint}}>{r.date}</span>
        <span style={{width:70,fontWeight:700,color:r.inn?LN.blue:LN.ink}}>{r.t}</span>
        <span style={{width:110,fontWeight:700}}>{r.inn?"+":"−"}{lnPeso(r.amt)}</span>
        {!r.inn&&<span style={{color:LN.faint}}>principal {lnPeso(r.principal)} · interest {lnPeso(r.interest)}</span>}
        {r.note&&<span style={{color:LN.faint,fontStyle:"italic"}}>{r.note}</span>}
        <span style={{marginLeft:"auto"}}><CashChip x={r}/></span>
        {canDelete&&!sample&&r.id&&<button onClick={()=>delEntry(r)} title="Delete (Manager)" style={{border:"none",background:"none",color:LN.red,cursor:"pointer",fontSize:".8rem"}}>✕</button>}
      </div>))}
    </div>);
  };

  const tiles=[
    {l:"Total owed",v:lnShort(owedLines+owedLoans),sub:`Credit lines ${lnShort(owedLines)} · Bank loans ${lnShort(owedLoans)}`},
    {l:"Next payment",v:nextDue?lnShort(nextDue.l.monthlyPayment):"—",sub:nextDue?`${nextDue.l.lender} · ${nextDue.s.nextDue}${nextDue.s.dueIn<0?" · LATE":nextDue.s.dueIn<=3?` · in ${nextDue.s.dueIn}d`:""}`:"No scheduled payment",warn:nextDue&&nextDue.s.dueIn<=3},
    {l:"Credit available",v:lnShort(available),sub:"Undrawn on credit lines"},
    {l:`Interest paid ${yr}`,v:lnShort(interestYtd),sub:"Goes to the P&L as finance cost"},
  ];

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",gap:10,flexWrap:"wrap",marginBottom:12}}>
        <div>
          <div style={{fontWeight:800,color:LN.navy,fontSize:"1.15rem"}}>Loans {sample&&<span style={{background:"#fef3c7",color:"#92400e",borderRadius:6,padding:"2px 8px",fontSize:".66rem",fontWeight:800,verticalAlign:"middle",marginLeft:6}}>SAMPLE FIGURES</span>}</div>
          <div style={{fontSize:".78rem",color:LN.muted,marginTop:2}}>What GMD owes the banks. Every draw and payment comes from a row on the Daily Cash Position.</div>
        </div>
        {canEdit&&<div style={{display:"flex",gap:6}}>
          <button onClick={()=>setLoanForm({kind:"credit_line",lender:"BPI"})} style={{border:"none",borderRadius:8,padding:"8px 14px",background:LN.navy,color:"#fff",fontWeight:700,fontSize:".78rem",cursor:"pointer",fontFamily:"inherit"}}>+ Credit line</button>
          <button onClick={()=>setLoanForm({kind:"bank_loan",lender:"BPI"})} style={{border:"none",borderRadius:8,padding:"8px 14px",background:LN.navy,color:"#fff",fontWeight:700,fontSize:".78rem",cursor:"pointer",fontFamily:"inherit"}}>+ Bank loan</button>
        </div>}
      </div>

      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)",gap:10,marginBottom:14}}>
        {tiles.map(t=>(<div key={t.l} style={{...box,padding:"12px 14px"}}>
          <div style={{fontSize:".64rem",fontWeight:800,color:LN.faint,textTransform:"uppercase",letterSpacing:".5px"}}>{t.l}</div>
          <div style={{fontSize:"1.35rem",fontWeight:800,color:LN.ink,margin:"2px 0"}}>{t.v}</div>
          <div style={{fontSize:".7rem",color:t.warn?LN.red:LN.faint,fontWeight:t.warn?700:500}}>{t.sub}</div>
        </div>))}
      </div>

      {unlinked.length>0&&(
        <div style={{...box,borderColor:"#fde68a",background:"#fffbeb",padding:"10px 14px",marginBottom:14}}>
          <div style={{fontWeight:800,color:"#92400e",fontSize:".82rem"}}>⚠ {unlinked.length} cash-sheet row{unlinked.length>1?"s look":" looks"} like loan activity but {unlinked.length>1?"aren't":"isn't"} linked to a loan</div>
          {unlinked.slice(0,5).map(m=>(<div key={m.key} style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",fontSize:".76rem",padding:"5px 0",borderTop:"1px solid #fde68a",marginTop:5}}>
            <span style={{width:84,color:LN.faint}}>{m.date}</span>
            <span style={{width:46,fontWeight:700,color:m.dir==="in"?LN.blue:LN.ink}}>{m.dir==="in"?"In":"Out"}</span>
            <span style={{width:100,fontWeight:700}}>{lnPeso(m.amount)}</span>
            <span style={{flex:1,minWidth:160,color:LN.muted}}>{m.payee}{m.particulars?` · ${m.particulars}`:""} <span style={{color:LN.faint}}>({String(m.bank).toUpperCase()})</span></span>
            {canEdit&&<button onClick={()=>setEntryForm({loanId:(/credit\s*line/i.test(`${m.payee} ${m.particulars}`)&&loans.find(l=>l.kind==="credit_line"))?.id||loans[0]?.id||"",type:m.dir==="in"?"draw":"payment",cashKey:m.key,date:m.date,bank:m.bank,amount:m.amount,text:`${m.payee} ${m.particulars}`})} style={{border:`1px solid ${LN.line}`,borderRadius:7,padding:"4px 10px",background:"#fff",color:LN.navy,fontWeight:700,fontSize:".72rem",cursor:"pointer",fontFamily:"inherit"}}>Link to loan…</button>}
          </div>))}
        </div>
      )}

      <div style={{fontWeight:800,color:LN.navy,fontSize:".95rem",margin:"6px 0 8px"}}>Credit Line Loans</div>
      <div style={{...box,overflowX:"auto",marginBottom:16}}>
        <table style={{width:"100%",borderCollapse:"collapse",minWidth:isMobile?640:0}}>
          <thead><tr>{["Bank","Limit","Drawn now","Available","Used","Interest paid","Rate"].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>
            {lineStats.length===0&&<tr><td colSpan={7} style={{...td,color:LN.faint}}>No credit line yet.</td></tr>}
            {lineStats.map(({l,s})=>(<React.Fragment key={l.id}>
              <tr onClick={()=>setOpen(open===l.id?null:l.id)} style={{cursor:"pointer"}}>
                <td style={td}><div style={{fontWeight:800}}>{open===l.id?"▾":"▸"} {l.lender}</div><div style={{fontSize:".68rem",color:LN.faint}}>{l.name||"Credit line"}</div></td>
                <td style={td}>{lnPeso(s.limit)}</td>
                <td style={{...td,fontWeight:800}}>{lnPeso(s.drawn)}</td>
                <td style={{...td,color:LN.green,fontWeight:700}}>{lnPeso(s.available)}</td>
                <td style={td}><div style={{display:"flex",alignItems:"center",gap:6}}><Bar p={s.util} c={s.util>0.8?"#dc2626":s.util>0.5?"#f59e0b":"#3b82f6"}/><span style={{fontSize:".72rem",color:LN.muted}}>{Math.round(s.util*100)}%</span></div></td>
                <td style={td}>{lnPeso(s.interest)}</td>
                <td style={td}>{l.interestRate?`${l.interestRate}% p.a.`:"—"}</td>
              </tr>
              {open===l.id&&<tr><td colSpan={7} style={{padding:0}}><Activity l={l}/></td></tr>}
            </React.Fragment>))}
          </tbody>
        </table>
      </div>

      <div style={{fontWeight:800,color:LN.navy,fontSize:".95rem",margin:"6px 0 8px"}}>Bank Loans</div>
      <div style={{...box,overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",minWidth:isMobile?760:0}}>
          <thead><tr>{["Bank","Borrowed","Paid back","Balance","Monthly","Next due","Months","Status"].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>
            {loanStats.length===0&&<tr><td colSpan={8} style={{...td,color:LN.faint}}>No bank loan yet.</td></tr>}
            {loanStats.map(({l,s})=>(<React.Fragment key={l.id}>
              <tr onClick={()=>setOpen(open===l.id?null:l.id)} style={{cursor:"pointer"}}>
                <td style={td}><div style={{fontWeight:800}}>{open===l.id?"▾":"▸"} {l.lender}</div><div style={{fontSize:".68rem",color:LN.faint}}>{l.name||"Term loan"} · {l.interestRate?`${l.interestRate}% p.a.`:"rate —"} · from {l.disbursedDate}</div></td>
                <td style={td}>{lnPeso(l.principal)}</td>
                <td style={td}><div>{lnPeso(s.principalPaid)}</div><Bar p={lnNum(l.principal)?s.principalPaid/lnNum(l.principal):0} c="#059669"/></td>
                <td style={{...td,fontWeight:800}}>{lnPeso(s.balance)}</td>
                <td style={td}>{lnPeso(l.monthlyPayment)}</td>
                <td style={{...td,whiteSpace:"nowrap"}}>{s.nextDue||"—"}</td>
                <td style={{...td,whiteSpace:"nowrap"}}>{s.term?`${s.paidCount} of ${s.term}`:s.paidCount}</td>
                <td style={td}><Pill state={s.state} dueIn={s.dueIn}/></td>
              </tr>
              {open===l.id&&<tr><td colSpan={8} style={{padding:0}}><Activity l={l}/></td></tr>}
            </React.Fragment>))}
          </tbody>
        </table>
      </div>
      {loanForm&&<LoanForm init={loanForm} onClose={()=>setLoanForm(null)} onSaved={()=>{setLoanForm(null);reload();}}/>}
      {entryForm&&<EntryForm init={entryForm} loans={loans} cashPositions={cashPositions} linkedKeys={linkedKeys} today={today} onClose={()=>setEntryForm(null)} onSaved={()=>{setEntryForm(null);reload();}}/>}
      <div style={{fontSize:".7rem",color:LN.faint,marginTop:10}}>Only principal lowers a balance. Interest is a finance cost in the P&L. Employee advances and SSS / Pag-IBIG loan remittances are not GMD loans and are kept out of this page.</div>
    </div>
  );
}

// ─── Forms ──────────────────────────────────────────────────────────────────
const lnLbl={display:"block",fontSize:".7rem",fontWeight:700,color:"#475569",marginBottom:3};
const lnInp={width:"100%",boxSizing:"border-box",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"8px 10px",fontFamily:"inherit",fontSize:".82rem"};
const LnField=({label,children,hint})=>(<div style={{marginBottom:10}}><label style={lnLbl}>{label}</label>{children}{hint&&<div style={{fontSize:".66rem",color:"#64748b",marginTop:2}}>{hint}</div>}</div>);
const lnSave={border:"none",borderRadius:8,padding:"9px 18px",background:"#0B2545",color:"#fff",fontWeight:800,fontSize:".82rem",cursor:"pointer",fontFamily:"inherit"};
const LENDERS=["BPI","Metrobank","BDO","Chinabank","Security Bank","Unionbank","Other"];

function LoanForm({init,onClose,onSaved}){
  const[f,setF]=useState({status:"Active",...init});
  const[busy,setBusy]=useState(false);
  const cl=f.kind==="credit_line";
  const set=(k,v)=>setF(x=>({...x,[k]:v}));
  const save=async()=>{
    if(!isSupabaseReady()){toastEmit("Offline: not saved","error");return;}
    if(!String(f.lender||"").trim()){toastEmit("Enter the bank","error");return;}
    if(cl&&!(Number(f.limit)>0)){toastEmit("Enter the credit limit","error");return;}
    if(!cl&&!(Number(f.principal)>0)){toastEmit("Enter the amount borrowed","error");return;}
    setBusy(true);
    const{error}=await supabase.from("loans").upsert(loanToSb({...f,id:f.id||uid()}),{onConflict:"id"});
    setBusy(false);
    if(error){toastEmit("Not saved: "+lnErr(error),"error",9000);return;}
    toastEmit(cl?"Credit line saved":"Bank loan saved","success");onSaved();
  };
  return(<Modal open onClose={onClose} title={(f.id?"Edit ":"New ")+(cl?"credit line":"bank loan")}>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 12px"}}>
      <LnField label="Bank"><select value={LENDERS.includes(f.lender)?f.lender:"Other"} onChange={e=>set("lender",e.target.value==="Other"?"":e.target.value)} style={lnInp}>{LENDERS.map(b=><option key={b}>{b}</option>)}</select>
        {!LENDERS.slice(0,-1).includes(f.lender)&&<input value={f.lender||""} onChange={e=>set("lender",e.target.value)} placeholder="Bank / lender name" style={{...lnInp,marginTop:6}}/>}</LnField>
      <LnField label="Name (optional)"><input value={f.name||""} onChange={e=>set("name",e.target.value)} placeholder={cl?"e.g. Revolving credit line":"e.g. Term loan 2026"} style={lnInp}/></LnField>
      {cl?<LnField label="Credit limit (₱)"><input type="number" value={f.limit||""} onChange={e=>set("limit",e.target.value)} style={lnInp}/></LnField>
         :<LnField label="Amount borrowed (₱)"><input type="number" value={f.principal||""} onChange={e=>set("principal",e.target.value)} style={lnInp}/></LnField>}
      <LnField label="Interest rate (% a year)"><input type="number" step="0.01" value={f.interestRate||""} onChange={e=>set("interestRate",e.target.value)} style={lnInp}/></LnField>
      {!cl&&<>
        <LnField label="Released on"><input type="date" value={f.disbursedDate||""} onChange={e=>set("disbursedDate",e.target.value)} style={lnInp}/></LnField>
        <LnField label="Term (months)"><input type="number" value={f.termMonths||""} onChange={e=>set("termMonths",e.target.value)} style={lnInp}/></LnField>
        <LnField label="Monthly payment (₱)"><input type="number" value={f.monthlyPayment||""} onChange={e=>set("monthlyPayment",e.target.value)} style={lnInp}/></LnField>
        <LnField label="First payment due" hint="Next due dates follow monthly from this date"><input type="date" value={f.firstDue||""} onChange={e=>set("firstDue",e.target.value)} style={lnInp}/></LnField>
      </>}
    </div>
    <LnField label="Notes"><input value={f.notes||""} onChange={e=>set("notes",e.target.value)} placeholder="Account / reference no., terms" style={lnInp}/></LnField>
    <div style={{display:"flex",justifyContent:"flex-end",gap:8}}><button onClick={onClose} style={{...lnSave,background:"#f1f5f9",color:"#475569"}}>Cancel</button><button disabled={busy} onClick={save} style={lnSave}>{busy?"Saving…":"Save"}</button></div>
  </Modal>);
}

// Suggested split of a cash-sheet payment: a row that says "interest" is all
// interest; otherwise one month's interest on the outstanding balance, the rest
// principal. Mark can change both before saving.
const lnSplit=(loan,amt,text,today)=>{
  if(!loan) return{principal:amt,interest:0};
  if(/interest/i.test(text||"")) return{principal:0,interest:amt};
  const st=loan.kind==="credit_line"?creditLineStatus(loan):bankLoanStatus(loan,today);
  const out=loan.kind==="credit_line"?st.drawn:st.balance;
  const int=Math.min(amt,Math.round(out*(Number(loan.interestRate)||0)/100/12*100)/100);
  return{principal:Math.round((amt-int)*100)/100,interest:int};
};

function EntryForm({init,loans,cashPositions,linkedKeys,today,onClose,onSaved}){
  const[f,setF]=useState(()=>{
    const base={onSheet:true,...init};
    if(init.cashKey&&init.type==="payment"&&init.amount) Object.assign(base,lnSplit(loans.find(l=>l.id===init.loanId),Number(init.amount)||0,init.text,today));
    return base;
  });
  const[q,setQ]=useState("");
  const[busy,setBusy]=useState(false);
  const set=(k,v)=>setF(x=>({...x,[k]:v}));
  const loan=loans.find(l=>l.id===f.loanId);
  const draw=f.type==="draw";
  const st=loan?(loan.kind==="credit_line"?creditLineStatus(loan):bankLoanStatus(loan,today)):null;
  const outstanding=st?(loan.kind==="credit_line"?st.drawn:st.balance):0;
  // Cash-sheet rows in the right direction, not linked yet (newest first).
  const rows=useMemo(()=>{const qq=q.trim().toLowerCase();
    return cashMovements(cashPositions).filter(m=>m.dir===(draw?"in":"out")&&(!linkedKeys.has(m.key)||m.key===f.cashKey))
      .filter(m=>!qq||`${m.payee} ${m.particulars} ${m.amount} ${m.date}`.toLowerCase().includes(qq)).slice(0,60);},[cashPositions,draw,linkedKeys,q,f.cashKey]);
  const pick=m=>{const amt=m.amount;
    const sp=draw?{principal:amt,interest:0}:lnSplit(loan,amt,`${m.payee} ${m.particulars}`,today);
    setF(x=>({...x,cashKey:m.key,date:m.date,bank:m.bank,amount:amt,text:`${m.payee} ${m.particulars}`,...sp}));};
  // Changing the loan re-suggests the split for the row already picked.
  const setLoan=id=>setF(x=>{const l=loans.find(z=>z.id===id);
    return x.cashKey&&x.type==="payment"?{...x,loanId:id,...lnSplit(l,Number(x.amount)||0,x.text,today)}:{...x,loanId:id};});
  const save=async()=>{
    if(!isSupabaseReady()){toastEmit("Offline: not saved","error");return;}
    if(!loan){toastEmit("Pick the loan","error");return;}
    if(f.onSheet&&!f.cashKey){toastEmit("Pick the cash-sheet row, or untick \"On the cash sheet\" and add a note","error");return;}
    if(!f.onSheet&&!String(f.note||"").trim()){toastEmit("An entry not on the cash sheet needs a note","error");return;}
    if(!f.date){toastEmit("Enter the date","error");return;}
    setBusy(true);
    const row=loanEntryToSb({...f,id:uid(),cashKey:f.onSheet?f.cashKey:"",cashDate:f.onSheet?f.date:null});
    const{error}=await supabase.from("loan_payments").insert(row);
    setBusy(false);
    if(error){toastEmit("Not saved: "+lnErr(error),"error",9000);return;}
    toastEmit(draw?"Draw recorded":"Payment recorded","success");onSaved();
  };
  return(<Modal open onClose={onClose} title={draw?"Record a draw (money borrowed)":"Record a loan payment"} wide>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 12px"}}>
      <LnField label="Loan"><select value={f.loanId||""} onChange={e=>setLoan(e.target.value)} style={lnInp}><option value="">Choose…</option>{loans.map(l=><option key={l.id} value={l.id}>{l.lender} · {l.name||(l.kind==="credit_line"?"Credit line":"Bank loan")}</option>)}</select></LnField>
      <LnField label="Type"><select value={f.type} onChange={e=>setF(x=>({...x,type:e.target.value,cashKey:""}))} style={lnInp}><option value="payment">Payment (principal + interest)</option>{loan?.kind==="credit_line"&&<option value="draw">Draw (money in)</option>}</select></LnField>
    </div>
    {st&&<div style={{fontSize:".72rem",color:"#475569",marginBottom:8}}>Outstanding now: <b>₱{Math.round(outstanding).toLocaleString("en-PH")}</b>{loan.interestRate?` · ${loan.interestRate}% a year`:""}</div>}
    <label style={{display:"flex",alignItems:"center",gap:6,fontSize:".78rem",fontWeight:700,color:"#0f172a",marginBottom:6}}><input type="checkbox" checked={!!f.onSheet} onChange={e=>set("onSheet",e.target.checked)}/> On the cash sheet (pick the row)</label>
    {f.onSheet&&<div style={{border:"1px solid #e2e8f0",borderRadius:8,marginBottom:10}}>
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search the cash sheet: bank, text, amount, date" style={{...lnInp,border:"none",borderBottom:"1px solid #e2e8f0",borderRadius:"8px 8px 0 0"}}/>
      <div style={{maxHeight:200,overflowY:"auto"}}>
        {rows.length===0&&<div style={{padding:10,fontSize:".74rem",color:"#64748b"}}>No unlinked {draw?"money-in":"money-out"} row found.</div>}
        {rows.map(m=>(<button key={m.key} onClick={()=>pick(m)} style={{display:"flex",gap:10,width:"100%",textAlign:"left",border:"none",borderBottom:"1px solid #f1f5f9",background:f.cashKey===m.key?"#eff6ff":"#fff",padding:"6px 10px",cursor:"pointer",fontFamily:"inherit",fontSize:".74rem"}}>
          <span style={{width:78,color:"#64748b"}}>{m.date}</span><span style={{width:90,fontWeight:700}}>₱{Math.round(m.amount).toLocaleString("en-PH")}</span>
          <span style={{flex:1,color:"#334155",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.payee}{m.particulars?` · ${m.particulars}`:""}</span><span style={{color:"#64748b"}}>{String(m.bank).toUpperCase()}</span>
        </button>))}
      </div></div>}
    <div style={{display:"grid",gridTemplateColumns:draw?"1fr 1fr":"1fr 1fr 1fr",gap:"0 12px"}}>
      <LnField label="Date"><input type="date" value={f.date||""} onChange={e=>set("date",e.target.value)} disabled={f.onSheet&&!!f.cashKey} style={lnInp}/></LnField>
      {draw?<LnField label="Amount drawn (₱)"><input type="number" value={f.amount||""} onChange={e=>set("amount",e.target.value)} disabled={f.onSheet&&!!f.cashKey} style={lnInp}/></LnField>:<>
        <LnField label="Principal (₱)" hint="Lowers the balance"><input type="number" value={f.principal??""} onChange={e=>set("principal",e.target.value)} style={lnInp}/></LnField>
        <LnField label="Interest (₱)" hint="Finance cost in the P&L"><input type="number" value={f.interest??""} onChange={e=>set("interest",e.target.value)} style={lnInp}/></LnField></>}
    </div>
    {!draw&&f.onSheet&&f.cashKey&&Math.abs((Number(f.principal)||0)+(Number(f.interest)||0)-(Number(f.amount)||0))>0.009&&<div style={{fontSize:".72rem",color:"#b91c1c",fontWeight:700,marginBottom:8}}>Principal + interest (₱{((Number(f.principal)||0)+(Number(f.interest)||0)).toLocaleString("en-PH")}) is not the cash-sheet amount (₱{Number(f.amount).toLocaleString("en-PH")}).</div>}
    <LnField label={f.onSheet?"Note (optional)":"Note (required)"}><input value={f.note||""} onChange={e=>set("note",e.target.value)} placeholder={f.onSheet?"":"e.g. Balance as of 11 Aug per BPI statement / paid before FabHub"} style={lnInp}/></LnField>
    <div style={{display:"flex",justifyContent:"flex-end",gap:8}}><button onClick={onClose} style={{...lnSave,background:"#f1f5f9",color:"#475569"}}>Cancel</button><button disabled={busy} onClick={save} style={lnSave}>{busy?"Saving…":"Save"}</button></div>
  </Modal>);
}
