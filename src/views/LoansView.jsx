import React,{useMemo,useState} from "react";
import {cashMovements} from "../data/ledger";

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

export default function LoansView({loans=[],cashPositions={},today,canEdit=false,isMobile=false,sample=false}){
  const[open,setOpen]=useState(null);
  const lines=loans.filter(l=>l.kind==="credit_line");
  const bankLoans=loans.filter(l=>l.kind!=="credit_line");
  const lineStats=lines.map(l=>({l,s:creditLineStatus(l)}));
  const loanStats=bankLoans.map(l=>({l,s:bankLoanStatus(l,today)}));

  // Cash-sheet rows that look like loan activity and are not linked to a loan yet.
  const unlinked=useMemo(()=>{
    const linked=new Set();
    loans.forEach(l=>[...(l.draws||[]),...(l.payments||[])].forEach(x=>x.cashKey&&linked.add(x.cashKey)));
    return cashMovements(cashPositions).filter(m=>LOAN_TEXT.test(`${m.payee} ${m.particulars}`)&&!linked.has(m.key));
  },[loans,cashPositions]);

  const owedLines=lineStats.reduce((s,x)=>s+x.s.drawn,0);
  const owedLoans=loanStats.reduce((s,x)=>s+x.s.balance,0);
  const nextDue=loanStats.filter(x=>x.s.nextDue).sort((a,b)=>a.s.nextDue.localeCompare(b.s.nextDue))[0];
  const yr=String(today).slice(0,4);
  const interestYtd=loans.reduce((s,l)=>s+(l.payments||[]).filter(p=>String(p.date).slice(0,4)===yr).reduce((t,p)=>t+lnNum(p.interest),0),0);
  const available=lineStats.reduce((s,x)=>s+x.s.available,0);

  const box={background:"#fff",border:`1px solid ${LN.line}`,borderRadius:12};
  const th={textAlign:"left",fontSize:".64rem",fontWeight:800,color:LN.faint,textTransform:"uppercase",letterSpacing:".4px",padding:"8px 10px",borderBottom:`1px solid ${LN.line}`,whiteSpace:"nowrap"};
  const td={padding:"10px",fontSize:".8rem",color:LN.ink,borderBottom:"1px solid #f1f5f9",verticalAlign:"top"};
  const Bar=({p,c})=><div style={{height:6,background:"#f1f5f9",borderRadius:3,overflow:"hidden",minWidth:80}}><div style={{width:`${Math.min(100,Math.round(p*100))}%`,height:"100%",background:c}}/></div>;
  const Pill=({state,dueIn})=>{const m={paid:["Paid off","#ecfdf5",LN.green],missed:[`Missed · ${-dueIn}d late`,"#fef2f2",LN.red],due:[dueIn===0?"Due today":`Due in ${dueIn}d`,"#fff7ed",LN.amber],ok:["On schedule","#f1f5f9",LN.muted],"no-schedule":["No schedule","#f1f5f9",LN.faint]}[state];
    return <span style={{background:m[1],color:m[2],borderRadius:20,padding:"2px 9px",fontSize:".68rem",fontWeight:800,whiteSpace:"nowrap"}}>{m[0]}</span>;};
  const CashChip=({x})=>x.cashKey?<span title="Linked to the Daily Cash Position" style={{fontSize:".66rem",color:LN.green,fontWeight:700,whiteSpace:"nowrap"}}>✓ Cash sheet {x.date} · {String(x.bank||"").toUpperCase()}</span>:<span style={{fontSize:".66rem",color:LN.red,fontWeight:700}}>Not on cash sheet</span>;
  const Activity=({l})=>{
    const rows=[...(l.draws||[]).map(d=>({...d,t:"Draw",amt:lnNum(d.amount),inn:true})),...(l.payments||[]).map(p=>({...p,t:"Payment",amt:lnNum(p.principal)+lnNum(p.interest)}))].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
    return(<div style={{background:"#f8fafc",borderTop:`1px solid ${LN.line}`,padding:"8px 14px"}}>
      {rows.length===0&&<div style={{fontSize:".75rem",color:LN.faint}}>No activity yet.</div>}
      {rows.map((r,i)=>(<div key={i} style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap",padding:"5px 0",borderBottom:i<rows.length-1?"1px solid #eef2f7":"none",fontSize:".76rem"}}>
        <span style={{width:84,color:LN.faint}}>{r.date}</span>
        <span style={{width:70,fontWeight:700,color:r.inn?LN.blue:LN.ink}}>{r.t}</span>
        <span style={{width:110,fontWeight:700}}>{r.inn?"+":"−"}{lnPeso(r.amt)}</span>
        {!r.inn&&<span style={{color:LN.faint}}>principal {lnPeso(r.principal)} · interest {lnPeso(r.interest)}</span>}
        <span style={{marginLeft:"auto"}}><CashChip x={r}/></span>
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
          <button style={{border:"none",borderRadius:8,padding:"8px 14px",background:LN.navy,color:"#fff",fontWeight:700,fontSize:".78rem",cursor:"pointer",fontFamily:"inherit"}}>+ Credit line</button>
          <button style={{border:"none",borderRadius:8,padding:"8px 14px",background:LN.navy,color:"#fff",fontWeight:700,fontSize:".78rem",cursor:"pointer",fontFamily:"inherit"}}>+ Bank loan</button>
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
            {canEdit&&<button style={{border:`1px solid ${LN.line}`,borderRadius:7,padding:"4px 10px",background:"#fff",color:LN.navy,fontWeight:700,fontSize:".72rem",cursor:"pointer",fontFamily:"inherit"}}>Link to loan…</button>}
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
      <div style={{fontSize:".7rem",color:LN.faint,marginTop:10}}>Only principal lowers a balance. Interest is a finance cost in the P&L. Employee advances and SSS / Pag-IBIG loan remittances are not GMD loans and are kept out of this page.</div>
    </div>
  );
}
