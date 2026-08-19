import React,{useState,useMemo} from "react";
import {today as TODAY} from "../shared";
import {fmtPHP} from "../core";

// ─── FINANCE WEEKLY DUES BOARD ───────────────────────────────────────────────
// A forward-looking weekly calendar of money movements, auto-derived (read-only)
// from data Finance already maintains — nothing is entered here, so it can never
// drift out of sync:
//   • Collections due  ← Billing milestones (billing_milestones.due_date) that
//                         are not yet fully paid / cancelled  → money IN
//   • Payables due     ← Payables (payables.due_date) not yet Paid            → money OUT
// Managers, Finance, Accounting and Jessica (SalesOpsAdmin) use it to see, at a
// glance, what we expect to collect and what is scheduled to be released, week
// by week. Clicking an item jumps to its source ledger (Billing / Accounts Payable).

const DAYS=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const iso=(x)=>`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`;
const parse=(s)=>new Date(s+"T00:00:00");
const num=(v)=>Number(String(v??"").replace(/,/g,""))||0;
// Monday of the week that contains `d`
const mondayOf=(d)=>{const m=new Date(d);m.setDate(d.getDate()-((d.getDay()+6)%7));m.setHours(0,0,0,0);return m;};

function FinanceWeeklyDues({billings=[],payables=[],wonDeals=[],deals=[],completedDeals=[],today=TODAY,setPage,setFinTab,role}){
  const mob=typeof window!=="undefined"&&window.innerWidth<860;
  const [weekStart,setWeekStart]=useState(()=>iso(mondayOf(parse(today))));

  const weekDays=useMemo(()=>{
    const start=parse(weekStart);
    return Array.from({length:7},(_,i)=>{const d=new Date(start);d.setDate(start.getDate()+i);return iso(d);});
  },[weekStart]);
  const weekEnd=weekDays[6];

  const clientFor=(dealId)=>{
    const d=wonDeals.find(x=>x.id===dealId)||deals.find(x=>x.id===dealId)||completedDeals.find(x=>x.id===dealId);
    return d?(d.client||d.clientName||"—"):"—";
  };

  // ── Build every open collection / payable item with its outstanding amount ──
  const collections=useMemo(()=>(billings||[])
    .filter(b=>b.dueDate&&b.status!=="Cancelled"&&b.status!=="Fully Paid")
    .map(b=>{
      const paid=(b.payments||[]).reduce((s,p)=>s+(p.bounced?0:num(p.amount)),0);
      const out=Math.max(0,num(b.amount)-paid);
      return {id:b.id,date:b.dueDate,amount:out,client:clientFor(b.dealId),label:b.name||b.invoiceNo||"Billing",ref:b.invoiceNo||"",status:b.status||""};
    })
    .filter(x=>x.amount>0.5)
  ,[billings,wonDeals,deals,completedDeals]);

  const paymentsDue=useMemo(()=>(payables||[])
    .filter(p=>p.dueDate&&p.status!=="Paid")
    .map(p=>{
      const out=Math.max(0,num(p.amount)-num(p.paidAmount));
      return {id:p.id,date:p.dueDate,amount:out,vendor:p.vendor||"Payable",ref:p.poNumber||p.invoiceRef||p.apNumber||"",status:p.status||"Unpaid"};
    })
    .filter(x=>x.amount>0.5)
  ,[payables]);

  const inWeek=(d)=>d>=weekStart&&d<=weekEnd;
  const weekCollections=collections.filter(c=>inWeek(c.date));
  const weekPayments=paymentsDue.filter(p=>inWeek(p.date));
  const totalIn=weekCollections.reduce((s,c)=>s+c.amount,0);
  const totalOut=weekPayments.reduce((s,p)=>s+p.amount,0);
  const net=totalIn-totalOut;

  // Overdue = still open, due before today (independent of the week being viewed)
  const overdueColl=collections.filter(c=>c.date<today);
  const overduePay=paymentsDue.filter(p=>p.date<today);
  const overdueInAmt=overdueColl.reduce((s,c)=>s+c.amount,0);
  const overdueOutAmt=overduePay.reduce((s,p)=>s+p.amount,0);

  const shiftWeek=(days)=>{const d=parse(weekStart);d.setDate(d.getDate()+days);setWeekStart(iso(d));};
  const rangeLabel=(()=>{
    const s=parse(weekDays[0]),e=parse(weekDays[6]);
    const M=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const sameMonth=s.getMonth()===e.getMonth();
    return sameMonth
      ?`${M[s.getMonth()]} ${s.getDate()}–${e.getDate()}, ${e.getFullYear()}`
      :`${M[s.getMonth()]} ${s.getDate()} – ${M[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`;
  })();

  const goBilling=()=>{setPage&&setPage("billing");};
  const goPayables=()=>{setFinTab&&setFinTab("payables");setPage&&setPage("finance");};

  const IN_CLR="#059669", OUT_CLR="#dc2626", NAVY="#1e293b";
  const tile=(label,val,clr)=>(
    <div style={{flex:"1 1 160px",background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,padding:"14px 16px"}}>
      <div style={{fontSize:".68rem",letterSpacing:".04em",textTransform:"uppercase",color:"#64748b",fontWeight:700}}>{label}</div>
      <div style={{fontSize:"1.15rem",fontWeight:800,color:clr,marginTop:4}}>{fmtPHP(val)}</div>
    </div>
  );

  const btn=(txt,onClick,primary)=>(
    <button onClick={onClick} style={{padding:"6px 12px",borderRadius:8,border:`1px solid ${primary?NAVY:"#cbd5e1"}`,background:primary?NAVY:"#fff",color:primary?"#fff":"#334155",cursor:"pointer",fontFamily:"inherit",fontSize:".76rem",fontWeight:700}}>{txt}</button>
  );

  return(
    <div>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",flexWrap:"wrap",gap:12,marginBottom:16}}>
        <div>
          <div style={{fontSize:"1.15rem",fontWeight:800,color:NAVY}}>📅 Weekly Dues Board</div>
          <div style={{fontSize:".76rem",color:"#64748b"}}>Collections expected in &amp; payments scheduled out — pulled live from Billing and Accounts Payable.</div>
        </div>
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8}}>
          {btn("‹ Prev",()=>shiftWeek(-7))}
          {btn("This week",()=>setWeekStart(iso(mondayOf(parse(today)))),true)}
          {btn("Next ›",()=>shiftWeek(7))}
        </div>
      </div>
      <div style={{fontSize:".9rem",fontWeight:700,color:"#334155",marginBottom:12}}>{rangeLabel}</div>

      {/* Summary tiles */}
      <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:16}}>
        {tile("Expected to Collect",totalIn,IN_CLR)}
        {tile("Scheduled to Pay",totalOut,OUT_CLR)}
        {tile("Net This Week",net,net>=0?IN_CLR:OUT_CLR)}
      </div>

      {/* Overdue alert */}
      {(overdueColl.length>0||overduePay.length>0)&&(
        <div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:12,padding:"12px 16px",marginBottom:16}}>
          <div style={{fontSize:".82rem",fontWeight:800,color:"#b91c1c",marginBottom:4}}>⚠ Past due &amp; still open</div>
          <div style={{fontSize:".78rem",color:"#7f1d1d"}}>
            {overdueColl.length>0&&<span>{overdueColl.length} uncollected billing{overdueColl.length!==1?"s":""} — <b>{fmtPHP(overdueInAmt)}</b>. </span>}
            {overduePay.length>0&&<span>{overduePay.length} overdue payable{overduePay.length!==1?"s":""} — <b>{fmtPHP(overdueOutAmt)}</b>.</span>}
          </div>
        </div>
      )}

      {/* Week grid */}
      <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"repeat(7,1fr)",gap:8}}>
        {weekDays.map((d,i)=>{
          const dayColl=weekCollections.filter(c=>c.date===d);
          const dayPay=weekPayments.filter(p=>p.date===d);
          const isToday=d===today;
          const dObj=parse(d);
          const empty=dayColl.length===0&&dayPay.length===0;
          return(
            <div key={d} style={{border:`1px solid ${isToday?NAVY:"#e2e8f0"}`,borderRadius:10,background:isToday?"#f8fafc":"#fff",minHeight:mob?"auto":140,display:"flex",flexDirection:"column",overflow:"hidden"}}>
              <div style={{padding:"6px 10px",background:isToday?NAVY:"#f1f5f9",color:isToday?"#fff":"#475569",fontSize:".72rem",fontWeight:700,display:"flex",justifyContent:"space-between"}}>
                <span>{DAYS[i]} {dObj.getDate()}</span>
                {isToday&&<span style={{fontSize:".62rem"}}>TODAY</span>}
              </div>
              <div style={{padding:8,display:"flex",flexDirection:"column",gap:6,flex:1}}>
                {dayColl.map(c=>(
                  <button key={"c"+c.id} onClick={goBilling} title={`${c.client} · ${c.label}${c.ref?" · "+c.ref:""}`}
                    style={{textAlign:"left",border:`1px solid ${IN_CLR}33`,borderLeft:`3px solid ${IN_CLR}`,background:`${IN_CLR}0d`,borderRadius:6,padding:"5px 7px",cursor:"pointer",fontFamily:"inherit"}}>
                    <div style={{fontSize:".7rem",fontWeight:800,color:IN_CLR}}>▲ {fmtPHP(c.amount)}</div>
                    <div style={{fontSize:".68rem",color:"#334155",fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.client}</div>
                    <div style={{fontSize:".62rem",color:"#94a3b8",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.label}</div>
                  </button>
                ))}
                {dayPay.map(p=>(
                  <button key={"p"+p.id} onClick={goPayables} title={`${p.vendor}${p.ref?" · "+p.ref:""}`}
                    style={{textAlign:"left",border:`1px solid ${OUT_CLR}33`,borderLeft:`3px solid ${OUT_CLR}`,background:`${OUT_CLR}0d`,borderRadius:6,padding:"5px 7px",cursor:"pointer",fontFamily:"inherit"}}>
                    <div style={{fontSize:".7rem",fontWeight:800,color:OUT_CLR}}>▼ {fmtPHP(p.amount)}</div>
                    <div style={{fontSize:".68rem",color:"#334155",fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.vendor}</div>
                    {p.ref&&<div style={{fontSize:".62rem",color:"#94a3b8",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.ref}</div>}
                  </button>
                ))}
                {empty&&<div style={{fontSize:".64rem",color:"#cbd5e1",textAlign:"center",marginTop:mob?4:"auto",marginBottom:mob?4:"auto"}}>—</div>}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{marginTop:14,display:"flex",gap:16,flexWrap:"wrap",fontSize:".72rem",color:"#64748b"}}>
        <span><span style={{color:IN_CLR,fontWeight:800}}>▲</span> Collection due (click → Billing)</span>
        <span><span style={{color:OUT_CLR,fontWeight:800}}>▼</span> Payable due (click → Accounts Payable)</span>
      </div>
    </div>
  );
}

export default FinanceWeeklyDues;
