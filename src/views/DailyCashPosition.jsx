import React,{useState,useMemo,useEffect,useRef} from "react";
import {today,uid,BANKS,emptyBankRow,emptyDayPosition} from "../shared";

// ── Currency input: shows grouped digits, edits raw ────────────────────────────
const CurrInp=({value,onChange,placeholder="—",style:sx={}})=>{
  const fmt=v=>{
    const n=Number(String(v).replace(/,/g,""));
    if(!v&&v!==0) return "";
    if(!n&&n!==0) return "";
    return n.toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2});
  };
  const strip=v=>String(v).replace(/,/g,"");
  const[display,setDisplay]=useState(value?fmt(value):"");
  const prev=useRef(value);
  useEffect(()=>{
    if(prev.current!==value){setDisplay(value?fmt(value):"");prev.current=value;}
  },[value]);
  const base={textAlign:"right",border:"1px solid transparent",borderRadius:4,padding:"4px 6px",fontFamily:"inherit",fontSize:".8rem",color:"#0f172a",background:"transparent",width:"100%",boxSizing:"border-box",outline:"none",...(sx||{})};
  return(
    <input type="text" className="dcp-inp" value={display}
      onChange={e=>setDisplay(e.target.value)}
      onFocus={e=>{const raw=strip(e.target.value);setDisplay(raw);e.target.select();}}
      onBlur={e=>{
        const raw=strip(e.target.value);
        setDisplay(raw?fmt(raw):"");
        onChange&&onChange({target:{value:raw}});
      }}
      placeholder={placeholder} style={base}/>
  );
};

// ─── DAILY CASH POSITION SUMMARY — Owners' Review report (Aerwin format) ───────
// Fully manual entry: the Bank Account Detail table's only editable cell is the
// Beginning Balance. Collections, Disbursements and Float Check per-bank columns
// are computed from three manual entry tables below the report. Floating checks
// carry from day to day until they are marked cleared.
function DailyCashPosition({
  cashPositions={},saveDayPos=()=>{},billings=[],payables=[],loans=[],userName=""
}){
  const[selDate,setSelDate]=useState(today);
  const[saved,setSaved]    =useState(false);
  const[dirty,setDirty]    =useState(false);   // unsaved local edits on the current day
  const[histOpen,setHistOpen]=useState(false);
  const[hideAcct,setHideAcct]=useState(true);    // account no./branch/type hidden by default (screen-share friendly)
  const dirtyRef=useRef(false);                 // mirror of `dirty` readable inside the load effect
  const markDirty =()=>{dirtyRef.current=true; setDirty(true);};
  const clearDirty=()=>{dirtyRef.current=false;setDirty(false);};

  const normPos=(p,date)=>p?.banks?p:{...emptyDayPosition(date||today),...(p||{})};
  const[pos,setPos]=useState(()=>normPos(cashPositions[today],today));

  const mob=typeof window!=="undefined"&&window.innerWidth<820;

  // A new day carries the prior day's ending balances into Beginning, and keeps any
  // floating checks that haven't cleared yet so they stay visible until they clear.
  const carryFrom=(date)=>{
    const prevDay=Object.keys(cashPositions).filter(k=>k<date).sort().reverse()[0];
    const base=emptyDayPosition(date);
    if(!prevDay) return base;
    const prev=cashPositions[prevDay];
    const newBanks={};
    BANKS.forEach(b=>{
      const r=prev.banks?.[b.id]||{};
      const endN=Number(r.end)||Number(r.book)||Number(r.beg)||0;
      newBanks[b.id]={...emptyBankRow(),beg:endN?String(endN):""};
    });
    const carriedFloat=(prev.floatingChecks||[]).filter(c=>!c.cleared).map(c=>({...c,carried:true}));
    return {...base,banks:newBanks,floatingChecks:carriedFloat};
  };

  const loadDay=(d)=>{
    if(cashPositions[d]){setPos(normPos(cashPositions[d],d));setSaved(true);}
    else{setPos(carryFrom(d));setSaved(false);}
    clearDirty();
  };

  // Re-sync from the store when it changes — but never overwrite unsaved local edits
  // (e.g. a background Supabase sync arriving while the user is still typing the day).
  useEffect(()=>{
    if(dirtyRef.current) return;
    loadDay(selDate);
  },[cashPositions]);

  // Warn before closing/reloading the tab with unsaved changes
  useEffect(()=>{
    const h=(e)=>{if(dirtyRef.current){e.preventDefault();e.returnValue="";}};
    window.addEventListener("beforeunload",h);
    return ()=>window.removeEventListener("beforeunload",h);
  },[]);

  const switchDate=(d)=>{
    if(dirtyRef.current&&!window.confirm(`You have unsaved changes for ${fmtDate(selDate)}. Discard them and switch to ${fmtDate(d)}?`)) return;
    setSelDate(d);
    loadDay(d);
  };

  const f=(path,val)=>{
    setSaved(false);markDirty();
    setPos(p=>{
      const parts=path.split(".");
      if(parts.length===1) return {...p,[path]:val};
      if(parts.length===2) return {...p,[parts[0]]:{...p[parts[0]],[parts[1]]:val}};
      if(parts.length===3) return {...p,[parts[0]]:{...p[parts[0]],[parts[1]]:{...p[parts[0]][parts[1]],[parts[2]]:val}}};
      return p;
    });
  };

  const n=(v)=>Number(String(v).replace(/,/g,""))||0;
  const fmt2=(v)=>n(v).toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2});
  const peso=(v)=>"₱"+n(v).toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2});
  const fmtDate=(iso)=>{const[y,m,d]=String(iso).split("-");return m&&d?`${m}/${d}/${y}`:iso;};

  const opBanks =BANKS.filter(b=>b.type==="Operating");
  const resBanks=BANKS.filter(b=>b.type==="Reserve");
  const bankRow=(id)=>pos.banks?.[id]||emptyBankRow();
  const sum=(banks,fn)=>banks.reduce((s,b)=>s+fn(b),0);
  const byBank=(rows)=>{const o={};BANKS.forEach(b=>o[b.id]=0);rows.forEach(r=>{if(r.bank&&o[r.bank]!=null)o[r.bank]+=n(r.amount);});return o;};

  // ── Collections — manual entry only (delinked from Billing) ──
  const manualColl=pos.collections?.manualCollections||[];
  const collByBank=useMemo(()=>byBank(manualColl),[manualColl]);
  const collTotal =useMemo(()=>manualColl.reduce((s,r)=>s+n(r.amount),0),[manualColl]);

  // ── Disbursements — manual entry only (all cash outflows for the day) ──
  const manualDisb=pos.disbursements?.manual||[];
  const disbByBank=useMemo(()=>byBank(manualDisb),[manualDisb]);
  const disbTotal =useMemo(()=>manualDisb.reduce((s,r)=>s+n(r.amount),0),[manualDisb]);

  // ── Floating checks — manual entry; carry over each day until cleared ──
  const floatChecks=pos.floatingChecks||[];
  const openFloat  =useMemo(()=>floatChecks.filter(c=>!c.cleared),[floatChecks]);
  const floatByBank=useMemo(()=>byBank(openFloat),[openFloat]);
  const floatingTotal=useMemo(()=>openFloat.reduce((s,r)=>s+n(r.amount),0),[openFloat]);

  // Recorded but not assigned to a bank — surfaced so the TOTAL row and per-bank columns reconcile
  const isUntagged=(r)=>!BANKS.some(b=>b.id===r.bank);
  const untaggedColl =manualColl.filter(isUntagged).reduce((s,r)=>s+n(r.amount),0);
  const untaggedDisb =manualDisb.filter(isUntagged).reduce((s,r)=>s+n(r.amount),0);
  const untaggedFloat=openFloat.filter(isUntagged).reduce((s,r)=>s+n(r.amount),0);
  const untaggedTotal=untaggedColl+untaggedDisb+untaggedFloat;

  // ── Ending Bank Balance & Book Balance — AUTO-COMPUTED per bank ──
  // Ending = Beginning + Collections − Disbursements (cash that actually moved through the bank).
  // Book = Ending − Float Check (uncleared cheques already recorded on the books). Both derived.
  const endingByBank=useMemo(()=>{const o={};BANKS.forEach(b=>{o[b.id]=n(bankRow(b.id).beg)+(collByBank[b.id]||0)-(disbByBank[b.id]||0);});return o;},[pos.banks,collByBank,disbByBank]);
  const bookByBank  =useMemo(()=>{const o={};BANKS.forEach(b=>{o[b.id]=endingByBank[b.id]-(floatByBank[b.id]||0);});return o;},[endingByBank,floatByBank]);

  // ── Executive Summary (computed from Bank Account Detail) ──
  const opBeg  =sum(opBanks, b=>n(bankRow(b.id).beg));
  const opEnd  =sum(opBanks, b=>endingByBank[b.id]);
  const opBook =sum(opBanks, b=>bookByBank[b.id]);
  const netChange=opEnd-opBeg;
  const reserveBal=sum(resBanks, b=>endingByBank[b.id]);
  const totalCashAll=opEnd+reserveBal;

  // ── Loan metrics (memo only) ──
  const loanMetrics=useMemo(()=>{
    const monthlyRate=l=>Number(l.interestRate||0)/100/12;
    let totalBalance=0,monthlyPaymentTotal=0;const loanRows=[];
    (loans||[]).filter(l=>l.status!=="Paid Off"&&l.status!=="Cancelled").forEach(l=>{
      let balance=Number(l.principal||0);const mr=monthlyRate(l);
      (l.payments||[]).slice().sort((a,b)=>a.date>b.date?1:-1).forEach(p=>{
        const interest=balance*mr;balance=Math.max(0,balance-Math.max(0,Number(p.amount||0)-interest));
      });
      const monthly=Number(l.monthlyPayment||0);
      totalBalance+=balance;monthlyPaymentTotal+=monthly;
      loanRows.push({...l,remainingBalance:balance,monthly});
    });
    return{totalBalance,monthlyPaymentTotal,loanRows};
  },[loans]);
  const outstandingLoan=loanMetrics.totalBalance;

  // ── Running memo balances (mirror the daily sheet's top-right block) ──
  const runningAR=useMemo(()=>(billings||[]).filter(b=>b.status!=="Cancelled").reduce((s,b)=>{
    const paid=(b.payments||[]).reduce((a,p)=>a+Number(p.amount||0),0);
    return s+Math.max(0,Number(b.amount||0)-paid);
  },0),[billings]);

  const payablesUnpaid=useMemo(()=>(payables||[]).filter(p=>!["Paid","Cancelled"].includes(p.status)).reduce((s,p)=>s+Number(p.amount||0),0),[payables]);

  // ── Bank Account Detail column totals ──
  const tot={
    beg:  sum(BANKS,b=>n(bankRow(b.id).beg)),
    coll: collTotal,
    disb: disbTotal,
    end:  sum(BANKS,b=>endingByBank[b.id]),
    book: sum(BANKS,b=>bookByBank[b.id]),
    float:floatingTotal,
  };

  // ── Cash-movement reconciliation ──
  const netClearedOutflow=tot.beg+collTotal-tot.end;   // what actually left the banks today (= disbursements)

  // Snapshot the headline figures of any position object — used to diff one saved
  // version against the next for the audit trail.
  const posTotals=(p)=>{
    if(!p||!p.banks) return null;
    const bk=(id)=>p.banks[id]||{};
    const beg =BANKS.reduce((s,b)=>s+n(bk(b.id).beg),0);
    const end =BANKS.reduce((s,b)=>s+n(bk(b.id).end),0);
    const book=BANKS.reduce((s,b)=>s+n(bk(b.id).book),0);
    const coll=(p.collections?.manualCollections||[]).reduce((s,r)=>s+n(r.amount),0);
    const disb=(p.disbursements?.manual||[]).reduce((s,r)=>s+n(r.amount),0);
    const flt =(p.floatingChecks||[]).filter(c=>!c.cleared).reduce((s,r)=>s+n(r.amount),0);
    return {beg,coll,disb,end,book,flt,notes:p.notes||""};
  };
  const AUDIT_FIELDS=[["beg","Beginning"],["coll","Collections"],["disb","Disbursements"],["end","Ending"],["book","Book"],["flt","Float Check"]];

  const handleSave=()=>{
    const at=new Date().toISOString();
    // Materialize the computed Ending & Book into the saved banks so the next day carries
    // the right beginning balance and CSV/history export the reconciled figures.
    const banksOut={};
    BANKS.forEach(b=>{banksOut[b.id]={...bankRow(b.id),end:String(endingByBank[b.id]),book:String(bookByBank[b.id])};});
    // ── Audit trail ── diff the headline figures against the previously-saved version.
    const prior=posTotals(cashPositions[selDate]);
    const now={beg:tot.beg,coll:collTotal,disb:disbTotal,end:tot.end,book:tot.book,flt:floatingTotal,notes:pos.notes||""};
    const changes=[];
    if(prior){
      AUDIT_FIELDS.forEach(([k,label])=>{if(Math.abs((prior[k]||0)-(now[k]||0))>0.005) changes.push({field:label,from:prior[k]||0,to:now[k]||0});});
      if(prior.notes!==now.notes) changes.push({field:"Notes",note:true});
    }
    const entry={at,by:userName||"—",action:prior?"Edited":"Created",changes};
    // Only log an edit if something actually changed; always log the first save.
    const priorAudit=Array.isArray(pos.audit)?pos.audit:[];
    const audit=(!prior||changes.length>0)?[...priorAudit,entry]:priorAudit;
    saveDayPos(selDate,{...pos,banks:banksOut,collections:{...pos.collections,total:collTotal},audit,savedAt:at});
    setSaved(true);clearDirty();
  };

  const histDates=Object.keys(cashPositions).sort().reverse().slice(0,30);

  const exportCSV=()=>{
    const rows=[
      ["DAILY CASH POSITION SUMMARY"],["As of",fmtDate(selDate)],[],
      ["EXECUTIVE SUMMARY","Amount (PHP)"],
      ["Total Operating Bank Balance – Beginning of Day",opBeg.toFixed(2)],
      ["Total Operating Bank Balance – End of Day",opEnd.toFixed(2)],
      ["Net Change for the Day (Operating)",netChange.toFixed(2)],
      ["Total Operating Book Balance",opBook.toFixed(2)],
      ["Reserve / Savings Balance",reserveBal.toFixed(2)],
      ["Total Cash – All Accounts (End of Day)",totalCashAll.toFixed(2)],
      ["Outstanding Loan Balance (memo only)",outstandingLoan.toFixed(2)],[],
      ["RUNNING BALANCES (memo)","Amount (PHP)"],
      ["Running A/R",runningAR.toFixed(2)],
      ["Running Payables",payablesUnpaid.toFixed(2)],
      ["Running Loan Balance",outstandingLoan.toFixed(2)],
      ["Total Checks to be Cleared",floatingTotal.toFixed(2)],[],
      ["BANK ACCOUNT DETAIL"],
      ["Bank","Account No.","Branch","Type","Beginning Balance","Collections","Disbursement","Ending Bank Balance","Book Balance","Float Check"],
    ];
    BANKS.forEach(b=>{const r=bankRow(b.id);rows.push([b.name,b.acctNo,b.branch,b.type,n(r.beg).toFixed(2),(collByBank[b.id]||0).toFixed(2),(disbByBank[b.id]||0).toFixed(2),endingByBank[b.id].toFixed(2),bookByBank[b.id].toFixed(2),(floatByBank[b.id]||0).toFixed(2)]);});
    rows.push(["TOTAL","","","",tot.beg.toFixed(2),tot.coll.toFixed(2),tot.disb.toFixed(2),tot.end.toFixed(2),tot.book.toFixed(2),tot.float.toFixed(2)]);
    rows.push([],["COLLECTIONS DETAIL (FOR THE DAY)"],["Bank","Particulars","Amount"]);
    manualColl.forEach(r=>{const bk=BANKS.find(x=>x.id===r.bank);rows.push([bk?bk.name:"",r.particulars??r.note??"",n(r.amount).toFixed(2)]);});
    rows.push(["TOTAL","",collTotal.toFixed(2)]);
    rows.push([],["DISBURSEMENTS DETAIL (FOR THE DAY)"],["Bank","Payee / Particulars","Amount"]);
    manualDisb.forEach(r=>{const bk=BANKS.find(x=>x.id===r.bank);rows.push([bk?bk.name:"",r.particulars||"",n(r.amount).toFixed(2)]);});
    rows.push(["TOTAL","",disbTotal.toFixed(2)]);
    rows.push([],["FLOATING CHECKS (UNCLEARED)"],["Bank","Payee / Particulars","Check No.","Amount","Status"]);
    floatChecks.forEach(r=>{const bk=BANKS.find(x=>x.id===r.bank);rows.push([bk?bk.name:"",r.particulars||r.payee||"",r.checkNo||"",n(r.amount).toFixed(2),r.cleared?`Cleared ${r.clearedDate||""}`.trim():"Floating"]);});
    rows.push(["TOTAL","","",floatingTotal.toFixed(2),"(uncleared)"]);
    const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
    const a=document.createElement("a");
    a.href="data:text/csv;charset=utf-8,"+encodeURIComponent("﻿"+csv);
    a.download=`GMD_CashPosition_${selDate}.csv`;a.click();
  };

  // ── style tokens (Excel look) ──
  const C={navy:"#1f3864",gold:"#ffd966",green:"#c6e0b4",blue:"#0070c0",grid:"#d0d7e2",zebra:"#f4f6fb"};
  const sectionHdr=(label,accent=C.navy,action=null)=>(
    <div style={{background:accent,color:"#fff",fontWeight:800,fontSize:".72rem",letterSpacing:".6px",padding:"6px 12px",textTransform:"uppercase",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}><span>{label}</span>{action}</div>
  );
  const numCell={textAlign:"right",padding:"6px 12px",fontSize:".82rem",fontVariantNumeric:"tabular-nums"};
  const th={background:C.gold,color:C.navy,fontWeight:800,fontSize:".72rem",padding:"8px 10px",border:`1px solid ${C.grid}`,textAlign:"center",whiteSpace:"nowrap"};
  const td={padding:"6px 10px",fontSize:".8rem",border:`1px solid ${C.grid}`,fontVariantNumeric:"tabular-nums"};

  const editCell=(id,key)=>(
    <td style={{...td,padding:2,background:"#fff"}}>
      <CurrInp value={bankRow(id)[key]||""} onChange={e=>f(`banks.${id}.${key}`,e.target.value)} style={{textAlign:"right",fontSize:".8rem",padding:"5px 8px"}}/>
    </td>
  );
  // Read-only computed cell (Collections / Disbursement / Float) — driven by the manual tables below
  const roCell=(val,clr="#0f172a")=>(
    <td style={{...td,...numCell,color:val>0?clr:"#cbd5e1",fontWeight:val>0?700:400}}>{val>0?fmt2(val):"—"}</td>
  );

  const summaryRows=[
    ["Total Operating Bank Balance – Beginning of Day",opBeg,false,"#0f172a"],
    ["Total Operating Bank Balance – End of Day",opEnd,false,"#0f172a"],
    ["Net Change for the Day (Operating)",netChange,false,netChange>=0?"#047857":"#dc2626"],
    ["Total Operating Book Balance",opBook,false,"#0f172a"],
    ["Reserve / Savings Balance (Chinabank + Security Bank + UnionBank)",reserveBal,false,"#0f172a"],
    ["Total Cash – All Accounts (End of Day)",totalCashAll,true,"#0f172a"],
    ["Outstanding Loan Balance (memo only – excluded from cash total)",outstandingLoan,false,C.blue],
  ];

  const bankSelect=(val,onPick)=>(
    <select value={val||""} onChange={e=>onPick(e.target.value)} style={{width:"100%",border:"1px solid transparent",borderRadius:4,padding:"5px 6px",fontFamily:"inherit",fontSize:".8rem",background:"transparent",color:"#0f172a",outline:"none"}}>
      <option value="">Select bank…</option>
      {BANKS.map(b=><option key={b.id} value={b.id}>{b.name.toUpperCase()}</option>)}
    </select>
  );
  const textCell=(val,onType,ph)=>(
    <input type="text" value={val} onChange={e=>onType(e.target.value)} placeholder={ph} style={{width:"100%",border:"1px solid transparent",borderRadius:4,padding:"5px 8px",fontFamily:"inherit",fontSize:".8rem",background:"transparent",color:"#0f172a",outline:"none"}}/>
  );
  const delBtn=(onClick)=>(
    <button onClick={onClick} style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:4,padding:"2px 7px",cursor:"pointer",color:"#dc2626",fontWeight:700,fontSize:".72rem",fontFamily:"inherit"}}>✕</button>
  );

  return(
    <div>
      <style>{`
        .dcp-inp:focus{border:1px solid ${C.blue}!important;background:#eff6ff!important;box-shadow:0 0 0 2px rgba(0,112,192,.12);border-radius:4px;}
        .dcp-inp:hover{background:#f1f5f9;border-radius:4px;}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
      `}</style>

      {/* ── Toolbar ── */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:10}}>
        <div style={{fontSize:".78rem",color:"#64748b",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          <span>Daily Cash Position — Owners' Review report</span>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          {dirty&&<span style={{fontSize:".72rem",fontWeight:700,color:"#b45309",display:"inline-flex",alignItems:"center",gap:4}}>● Unsaved</span>}
          <button onClick={exportCSV} style={{background:"#eff6ff",border:"1.5px solid #bfdbfe",borderRadius:8,padding:"7px 14px",fontFamily:"inherit",fontSize:".78rem",fontWeight:700,color:"#1d4ed8",cursor:"pointer"}}>⬇ Export CSV</button>
          <input type="date" value={selDate} onChange={e=>switchDate(e.target.value)} style={{border:"1.5px solid #e2e8f0",borderRadius:8,padding:"8px 12px",fontFamily:"inherit",fontSize:".84rem",color:"#0f172a",cursor:"pointer"}}/>
          <button onClick={()=>setHistOpen(h=>!h)} style={{background:"#f8fafc",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"8px 12px",fontFamily:"inherit",fontSize:".78rem",color:"#64748b",cursor:"pointer",fontWeight:600}}>📅 History ({histDates.length})</button>
          <button onClick={handleSave} style={{background:(saved&&!dirty)?"#f0fdf4":C.navy,border:`1.5px solid ${(saved&&!dirty)?"#6ee7b7":C.navy}`,borderRadius:8,padding:"8px 18px",fontFamily:"inherit",fontSize:".82rem",color:(saved&&!dirty)?"#059669":"#fff",cursor:"pointer",fontWeight:700}}>{(saved&&!dirty)?"✓ Saved":"Save Position"}</button>
        </div>
      </div>

      {histOpen&&histDates.length>0&&(
        <div style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:12,padding:14,marginBottom:14,animation:"fadeIn .2s"}}>
          <div style={{fontWeight:700,color:"#0f172a",marginBottom:8,fontSize:".82rem"}}>Saved Positions</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {histDates.map(d=>(
              <button key={d} onClick={()=>{switchDate(d);setHistOpen(false);}} style={{padding:"5px 12px",borderRadius:20,border:`1.5px solid ${d===selDate?C.navy:"#e2e8f0"}`,background:d===selDate?C.navy:"#fff",color:d===selDate?"#fff":"#64748b",fontFamily:"inherit",fontSize:".76rem",cursor:"pointer",fontWeight:d===selDate?700:400}}>{fmtDate(d)}</button>
            ))}
          </div>
        </div>
      )}

      {/* ── Report sheet ── */}
      <div style={{background:"#fff",border:`1px solid ${C.grid}`,borderRadius:10,overflow:"hidden",boxShadow:"0 1px 6px rgba(0,0,0,.05)"}}>
        <div style={{textAlign:"center",padding:"14px 16px 10px",borderBottom:`1px solid ${C.grid}`}}>
          <div style={{fontWeight:900,fontSize:"1.15rem",color:C.navy,letterSpacing:".5px"}}>DAILY CASH POSITION SUMMARY</div>
          <div style={{fontSize:".72rem",color:"#64748b",fontStyle:"italic",marginTop:3}}>Prepared for Owners' Review&nbsp;&nbsp;|&nbsp;&nbsp;All amounts in Philippine Peso (PHP)</div>
          <div style={{marginTop:8,fontSize:".82rem",color:"#0f172a"}}>
            <span style={{fontWeight:700,color:"#475569"}}>As of Date: </span>
            <span style={{color:C.blue,fontWeight:800}}>{fmtDate(selDate)}</span>
            <span style={{color:"#94a3b8"}}> &nbsp;—&nbsp; ENDING BALANCE</span>
          </div>
        </div>

        {/* EXECUTIVE SUMMARY */}
        {sectionHdr("Executive Summary")}
        <div style={{padding:"0 12px 12px"}}>
          <table style={{width:"100%",borderCollapse:"collapse",marginTop:10}}>
            <thead><tr><th style={{...th,textAlign:"left"}}>Metric</th><th style={{...th,width:mob?140:260}}>Amount (PHP)</th></tr></thead>
            <tbody>
              {summaryRows.map(([label,val,hi,clr])=>(
                <tr key={label} style={{background:hi?C.green:"#fff"}}>
                  <td style={{...td,fontWeight:hi?800:600,color:"#0f172a"}}>{label}</td>
                  <td style={{...td,...numCell,fontWeight:hi?900:700,color:clr}}>{fmt2(val)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Running memo balances — mirrors the daily sheet's top-right block */}
          <div style={{display:"grid",gridTemplateColumns:mob?"1fr 1fr":"repeat(4,1fr)",gap:8,marginTop:4}}>
            {[
              {l:"Running A/R",v:runningAR,c:"#1d4ed8",sub:"Outstanding receivables"},
              {l:"Running Payables",v:payablesUnpaid,c:"#dc2626",sub:"Unpaid payables"},
              {l:"Running Loan Balance",v:outstandingLoan,c:C.blue,sub:"Excl. from cash total"},
              {l:"Total Checks to be Cleared",v:floatingTotal,c:"#b45309",sub:"Uncleared floating checks"},
            ].map(({l,v,c,sub})=>(
              <div key={l} style={{background:"#f8fafc",border:`1px solid ${C.grid}`,borderRadius:8,padding:"9px 12px"}}>
                <div style={{fontSize:".6rem",textTransform:"uppercase",letterSpacing:".6px",color:"#94a3b8",fontWeight:700}}>{l}</div>
                <div style={{fontWeight:800,fontSize:"1rem",color:c,marginTop:2,fontVariantNumeric:"tabular-nums"}}>{peso(v)}</div>
                <div style={{fontSize:".6rem",color:"#cbd5e1",marginTop:1}}>{sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* BANK ACCOUNT DETAIL */}
        {sectionHdr("Bank Account Detail",C.navy,
          <button onClick={()=>setHideAcct(v=>!v)} title={hideAcct?"Show account no., branch & type":"Hide account no., branch & type"} style={{background:"rgba(255,255,255,.15)",border:"1px solid rgba(255,255,255,.35)",borderRadius:6,padding:"3px 9px",color:"#fff",fontFamily:"inherit",fontWeight:700,fontSize:".62rem",letterSpacing:".4px",cursor:"pointer",textTransform:"uppercase"}}>{hideAcct?"👁 Show account details":"🙈 Hide account details"}</button>
        )}
        <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch",padding:"10px 12px 4px"}}>
          <table style={{borderCollapse:"collapse",minWidth:mob?860:"100%",width:"100%"}}>
            <thead>
              <tr>{["Bank",...(hideAcct?[]:["Account No.","Branch","Type"]),"Beginning Balance","Collections","Disbursement","Ending Bank Balance","Book Balance","Float Check"].map((h,i)=>(
                <th key={h} style={{...th,textAlign:i<(hideAcct?1:4)?"left":"center"}}>{h}</th>))}
              </tr>
            </thead>
            <tbody>
              {[{label:"Operating",banks:opBanks,clr:"#1d4ed8",bg:"#eff6ff"},{label:"Reserve",banks:resBanks,clr:"#7c3aed",bg:"#faf5ff"}].map(grp=>{
                const g={
                  beg:  sum(grp.banks,b=>n(bankRow(b.id).beg)),
                  coll: grp.banks.reduce((s,b)=>s+(collByBank[b.id]||0),0),
                  disb: grp.banks.reduce((s,b)=>s+(disbByBank[b.id]||0),0),
                  end:  sum(grp.banks,b=>endingByBank[b.id]),
                  book: sum(grp.banks,b=>bookByBank[b.id]),
                  float:grp.banks.reduce((s,b)=>s+(floatByBank[b.id]||0),0),
                };
                return(
                  <React.Fragment key={grp.label}>
                    <tr style={{background:grp.bg}}>
                      <td colSpan={hideAcct?7:10} style={{...td,fontWeight:800,color:grp.clr,fontSize:".68rem",letterSpacing:".6px",textTransform:"uppercase",padding:"5px 12px"}}>{grp.label} Accounts</td>
                    </tr>
                    {grp.banks.map((b,ri)=>(
                      <tr key={b.id} style={{background:ri%2?C.zebra:"#fff"}}>
                        <td style={{...td,fontWeight:700,color:"#0f172a",whiteSpace:"nowrap"}}>{b.name.toUpperCase()}</td>
                        {!hideAcct&&<>
                        <td style={{...td,color:"#475569"}}>{b.acctNo}</td>
                        <td style={{...td,color:"#475569",whiteSpace:"nowrap"}}>{b.branch}</td>
                        <td style={{...td}}>
                          <span style={{fontSize:".68rem",fontWeight:700,padding:"1px 7px",borderRadius:20,color:b.type==="Operating"?"#1d4ed8":"#7c3aed",background:b.type==="Operating"?"#eff6ff":"#f5f3ff",border:`1px solid ${b.type==="Operating"?"#bfdbfe":"#e9d5ff"}`}}>{b.type}</span>
                        </td>
                        </>}
                        {editCell(b.id,"beg")}
                        {roCell(collByBank[b.id]||0,C.blue)}
                        {roCell(disbByBank[b.id]||0,"#b45309")}
                        <td style={{...td,...numCell,fontWeight:700,color:endingByBank[b.id]<0?"#dc2626":"#047857"}}>{fmt2(endingByBank[b.id])}</td>
                        <td style={{...td,...numCell,fontWeight:700,color:bookByBank[b.id]<0?"#dc2626":"#92400e"}}>{fmt2(bookByBank[b.id])}</td>
                        {roCell(floatByBank[b.id]||0,"#b45309")}
                      </tr>
                    ))}
                    <tr style={{background:"#eef2f7"}}>
                      <td style={{...td,fontWeight:800,color:grp.clr}} colSpan={hideAcct?1:4}>{grp.label} Subtotal</td>
                      <td style={{...td,...numCell,fontWeight:800,color:"#0f172a"}}>{fmt2(g.beg)}</td>
                      <td style={{...td,...numCell,fontWeight:800,color:C.blue}}>{g.coll>0?fmt2(g.coll):"—"}</td>
                      <td style={{...td,...numCell,fontWeight:800,color:"#b45309"}}>{g.disb>0?fmt2(g.disb):"—"}</td>
                      <td style={{...td,...numCell,fontWeight:800,color:"#047857"}}>{fmt2(g.end)}</td>
                      <td style={{...td,...numCell,fontWeight:800,color:"#92400e"}}>{fmt2(g.book)}</td>
                      <td style={{...td,...numCell,fontWeight:800,color:"#b45309"}}>{g.float>0?fmt2(g.float):"—"}</td>
                    </tr>
                  </React.Fragment>
                );
              })}
              <tr style={{background:"#e8edf5",fontWeight:800}}>
                <td style={{...td,fontWeight:900,color:C.navy}} colSpan={hideAcct?1:4}>GRAND TOTAL — ALL ACCOUNTS</td>
                <td style={{...td,...numCell,fontWeight:900,color:"#0f172a"}}>{fmt2(tot.beg)}</td>
                <td style={{...td,...numCell,fontWeight:900,color:C.blue}}>{tot.coll>0?fmt2(tot.coll):"—"}</td>
                <td style={{...td,...numCell,fontWeight:900,color:"#b45309"}}>{tot.disb>0?fmt2(tot.disb):"—"}</td>
                <td style={{...td,...numCell,fontWeight:900,color:"#047857"}}>{fmt2(tot.end)}</td>
                <td style={{...td,...numCell,fontWeight:900,color:"#92400e"}}>{fmt2(tot.book)}</td>
                <td style={{...td,...numCell,fontWeight:900,color:"#b45309"}}>{tot.float>0?fmt2(tot.float):"—"}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{padding:"6px 14px 12px",fontSize:".68rem",color:"#94a3b8",fontStyle:"italic",lineHeight:1.5}}>
          <b>Beginning Balance</b> is the only editable cell (it carries from the prior day's Ending). <span style={{color:C.blue}}>Collections</span>, <span style={{color:"#b45309"}}>Disbursement</span> &amp; <span style={{color:"#b45309"}}>Float Check</span> are totalled from the manual entry tables below. Then <span style={{color:"#047857"}}>Ending = Beginning + Collections − Disbursement</span> and <span style={{color:"#92400e"}}>Book = Ending − Float Check</span>. <b>Operating</b> = Executive-Summary working accounts; <b>Reserve</b> = Chinabank, Security Bank &amp; UnionBank savings.
        </div>

        {/* Untagged-amount warning — explains why the TOTAL row can exceed the per-bank columns */}
        {untaggedTotal>0.005&&(
          <div style={{margin:"0 14px 12px",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:8,padding:"8px 12px",fontSize:".72rem",color:"#92400e",lineHeight:1.5}}>
            ⚠ <b>{peso(untaggedTotal)}</b> is not assigned to a bank, so it's in the TOTAL row but not in any bank column:
            {untaggedColl>0.005?<> collections {peso(untaggedColl)};</>:null}
            {untaggedDisb>0.005?<> disbursements {peso(untaggedDisb)};</>:null}
            {untaggedFloat>0.005?<> float checks {peso(untaggedFloat)};</>:null}
            {" "}pick a bank on the rows marked <b>⚠ Untagged</b> in the tables below.
          </div>
        )}

        {/* COLLECTIONS DETAIL */}
        {sectionHdr("Collections Detail (for the day)","#c00000")}
        <div style={{padding:"10px 12px 14px"}}>
          <table style={{borderCollapse:"collapse",width:"100%",maxWidth:720}}>
            <thead>
              <tr>
                <th style={{...th,textAlign:"left",width:mob?120:220}}>Bank</th>
                <th style={{...th,textAlign:"left"}}>Particulars</th>
                <th style={{...th,width:mob?110:170}}>Amount</th>
                <th style={{...th,width:40,background:"#fff",border:"none"}}></th>
              </tr>
            </thead>
            <tbody>
              {manualColl.length===0&&(
                <tr><td colSpan={4} style={{...td,color:"#94a3b8",fontStyle:"italic",padding:"10px"}}>No collections recorded for {fmtDate(selDate)}. Add rows below.</td></tr>
              )}
              {manualColl.map((row,ri)=>(
                <tr key={row.id||ri} style={{background:ri%2?C.zebra:"#fff"}}>
                  <td style={{...td,padding:2}}>{isUntagged(row)&&<span style={{color:"#dc2626",fontWeight:700,fontSize:".62rem",marginLeft:4}}>⚠</span>}{bankSelect(row.bank,v=>{const mc=[...manualColl];mc[ri]={...mc[ri],bank:v};f("collections.manualCollections",mc);})}</td>
                  <td style={{...td,padding:2}}>{textCell(row.particulars??row.note??"",v=>{const mc=[...manualColl];mc[ri]={...mc[ri],particulars:v};f("collections.manualCollections",mc);},"e.g. LOAN — STELLA G.")}</td>
                  <td style={{...td,padding:2}}>
                    <CurrInp value={row.amount||""} onChange={e=>{const mc=[...manualColl];mc[ri]={...mc[ri],amount:e.target.value};f("collections.manualCollections",mc);}} style={{textAlign:"right",fontSize:".8rem",padding:"5px 8px"}}/>
                  </td>
                  <td style={{...td,padding:2,textAlign:"center",border:"none"}}>{delBtn(()=>f("collections.manualCollections",manualColl.filter((_,j)=>j!==ri)))}</td>
                </tr>
              ))}
              <tr style={{background:"#e8edf5"}}>
                <td style={{...td,fontWeight:900,color:C.navy}} colSpan={2}>TOTAL</td>
                <td style={{...td,...numCell,fontWeight:900,color:C.blue}}>{fmt2(collTotal)}</td>
                <td style={{...td,border:"none",background:"#fff"}}></td>
              </tr>
            </tbody>
          </table>
          <button onClick={()=>f("collections.manualCollections",[...manualColl,{id:uid(),bank:"",particulars:"",amount:""}])} style={{marginTop:10,background:"#f8fafc",border:"1.5px dashed #cbd5e1",borderRadius:8,padding:"5px 14px",fontFamily:"inherit",fontSize:".76rem",fontWeight:700,color:"#475569",cursor:"pointer"}}>+ Add collection</button>
        </div>

        {/* DISBURSEMENTS DETAIL */}
        {sectionHdr("Disbursements Detail (for the day)","#7c2d12")}
        <div style={{padding:"10px 12px 14px"}}>
          <table style={{borderCollapse:"collapse",width:"100%",maxWidth:720}}>
            <thead>
              <tr>
                <th style={{...th,textAlign:"left",width:mob?120:220}}>Bank</th>
                <th style={{...th,textAlign:"left"}}>Payee / Particulars</th>
                <th style={{...th,width:mob?110:170}}>Amount</th>
                <th style={{...th,width:40,background:"#fff",border:"none"}}></th>
              </tr>
            </thead>
            <tbody>
              {manualDisb.length===0&&(
                <tr><td colSpan={4} style={{...td,color:"#94a3b8",fontStyle:"italic",padding:"10px"}}>No disbursements for {fmtDate(selDate)}. Add rows below.</td></tr>
              )}
              {manualDisb.map((row,ri)=>(
                <tr key={row.id||ri} style={{background:ri%2?C.zebra:"#fff"}}>
                  <td style={{...td,padding:2}}>{isUntagged(row)&&<span style={{color:"#dc2626",fontWeight:700,fontSize:".62rem",marginLeft:4}}>⚠</span>}{bankSelect(row.bank,v=>{const md=[...manualDisb];md[ri]={...md[ri],bank:v};f("disbursements.manual",md);})}</td>
                  <td style={{...td,padding:2}}>{textCell(row.particulars??"",v=>{const md=[...manualDisb];md[ri]={...md[ri],particulars:v};f("disbursements.manual",md);},"Payee / particulars")}</td>
                  <td style={{...td,padding:2}}>
                    <CurrInp value={row.amount||""} onChange={e=>{const md=[...manualDisb];md[ri]={...md[ri],amount:e.target.value};f("disbursements.manual",md);}} style={{textAlign:"right",fontSize:".8rem",padding:"5px 8px"}}/>
                  </td>
                  <td style={{...td,padding:2,textAlign:"center",border:"none"}}>{delBtn(()=>f("disbursements.manual",manualDisb.filter((_,j)=>j!==ri)))}</td>
                </tr>
              ))}
              <tr style={{background:"#f1e9e2"}}>
                <td style={{...td,fontWeight:900,color:"#7c2d12"}} colSpan={2}>TOTAL</td>
                <td style={{...td,...numCell,fontWeight:900,color:"#b45309"}}>{fmt2(disbTotal)}</td>
                <td style={{...td,border:"none",background:"#fff"}}></td>
              </tr>
            </tbody>
          </table>
          <button onClick={()=>f("disbursements.manual",[...manualDisb,{id:uid(),bank:"",particulars:"",amount:""}])} style={{marginTop:10,background:"#f8fafc",border:"1.5px dashed #cbd5e1",borderRadius:8,padding:"5px 14px",fontFamily:"inherit",fontSize:".76rem",fontWeight:700,color:"#475569",cursor:"pointer"}}>+ Add disbursement</button>

          {/* Cash-movement reconciliation */}
          {tot.end!==0&&(
            <div style={{marginTop:14,maxWidth:520,background:"#f8fafc",border:`1px solid ${C.grid}`,borderRadius:10,padding:"12px 14px"}}>
              <div style={{fontSize:".68rem",fontWeight:800,color:"#475569",textTransform:"uppercase",letterSpacing:".6px",marginBottom:8}}>Cash-Movement Summary</div>
              {[
                ["Beginning balance (all banks)",tot.beg,"#475569","+"],
                ["Collections",collTotal,"#059669","+"],
                ["Disbursements",disbTotal,"#b45309","−"],
              ].map(([l,v,c,s])=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:".78rem",padding:"3px 0",color:"#475569"}}><span><b style={{color:c}}>{s}</b> {l}</span><span style={{fontVariantNumeric:"tabular-nums"}}>{fmt2(v)}</span></div>
              ))}
              <div style={{display:"flex",justifyContent:"space-between",fontSize:".82rem",fontWeight:800,borderTop:`1px solid ${C.grid}`,marginTop:5,paddingTop:6,color:"#0f172a"}}><span>= Ending balance (all banks)</span><span style={{fontVariantNumeric:"tabular-nums"}}>{fmt2(tot.end)}</span></div>
              <div style={{marginTop:8,fontSize:".72rem",color:"#64748b",lineHeight:1.5}}>
                Floating checks still uncleared: <b style={{color:"#b45309"}}>{fmt2(floatingTotal)}</b> — recorded on the books (Book balance) but not yet deducted from the bank. They stay in the report until marked cleared.
              </div>
            </div>
          )}
        </div>

        {/* FLOATING CHECKS */}
        {sectionHdr("Floating Checks (uncleared)","#b45309",
          <span style={{fontWeight:800,fontSize:".72rem",color:"#fff"}}>{peso(floatingTotal)}</span>
        )}
        <div style={{padding:"10px 12px 14px"}}>
          <table style={{borderCollapse:"collapse",width:"100%",maxWidth:820}}>
            <thead>
              <tr>
                <th style={{...th,textAlign:"left",width:mob?110:180}}>Bank</th>
                <th style={{...th,textAlign:"left"}}>Payee / Particulars</th>
                <th style={{...th,width:mob?80:120}}>Check No.</th>
                <th style={{...th,width:mob?100:150}}>Amount</th>
                <th style={{...th,width:mob?96:150}}>Status</th>
                <th style={{...th,width:40,background:"#fff",border:"none"}}></th>
              </tr>
            </thead>
            <tbody>
              {floatChecks.length===0&&(
                <tr><td colSpan={6} style={{...td,color:"#94a3b8",fontStyle:"italic",padding:"10px"}}>No floating checks. Add released cheques below — they stay here every day until you mark them cleared.</td></tr>
              )}
              {floatChecks.map((row,ri)=>{
                const set=(patch)=>{const fc=[...floatChecks];fc[ri]={...fc[ri],...patch};f("floatingChecks",fc);};
                return(
                  <tr key={row.id||ri} style={{background:row.cleared?"#f0fdf4":ri%2?C.zebra:"#fff",opacity:row.cleared?.75:1}}>
                    <td style={{...td,padding:2}}>{isUntagged(row)&&!row.cleared&&<span style={{color:"#dc2626",fontWeight:700,fontSize:".62rem",marginLeft:4}}>⚠</span>}{bankSelect(row.bank,v=>set({bank:v}))}</td>
                    <td style={{...td,padding:2}}>{textCell(row.particulars??row.payee??"",v=>set({particulars:v}),"Payee / particulars")}</td>
                    <td style={{...td,padding:2}}>{textCell(row.checkNo??"",v=>set({checkNo:v}),"#")}</td>
                    <td style={{...td,padding:2}}>
                      <CurrInp value={row.amount||""} onChange={e=>set({amount:e.target.value})} style={{textAlign:"right",fontSize:".8rem",padding:"5px 8px"}}/>
                    </td>
                    <td style={{...td,textAlign:"center"}}>
                      {row.cleared
                        ?<span style={{display:"inline-flex",alignItems:"center",gap:5}}>
                          <span title={row.clearedDate?`Cleared ${fmtDate(row.clearedDate)}`:"Cleared"} style={{fontSize:".64rem",fontWeight:800,padding:"2px 8px",borderRadius:20,color:"#047857",background:"#dcfce7",border:"1px solid #86efac"}}>✓ Cleared</span>
                          <button onClick={()=>set({cleared:false,clearedDate:null})} title="Mark as still floating" style={{background:"none",border:"none",color:"#64748b",cursor:"pointer",fontSize:".66rem",padding:0}}>undo</button>
                        </span>
                        :<span style={{display:"inline-flex",alignItems:"center",gap:5}}>
                          <span style={{fontSize:".64rem",fontWeight:800,padding:"2px 8px",borderRadius:20,color:"#b45309",background:"#fef3c7",border:"1px solid #fde68a"}}>● Floating{row.carried?" · carried":""}</span>
                          <button onClick={()=>set({cleared:true,clearedDate:selDate})} title="Mark this check cleared" style={{background:"#ecfdf5",border:"1px solid #a7f3d0",borderRadius:5,padding:"2px 7px",color:"#047857",cursor:"pointer",fontSize:".64rem",fontWeight:700,fontFamily:"inherit"}}>Mark cleared</button>
                        </span>}
                    </td>
                    <td style={{...td,padding:2,textAlign:"center",border:"none"}}>{delBtn(()=>f("floatingChecks",floatChecks.filter((_,j)=>j!==ri)))}</td>
                  </tr>
                );
              })}
              <tr style={{background:"#f1e9e2"}}>
                <td style={{...td,fontWeight:900,color:"#7c2d12"}} colSpan={3}>TOTAL FLOATING (uncleared)</td>
                <td style={{...td,...numCell,fontWeight:900,color:"#b45309"}}>{fmt2(floatingTotal)}</td>
                <td style={{...td,border:"none",background:"#fff"}} colSpan={2}></td>
              </tr>
            </tbody>
          </table>
          <button onClick={()=>f("floatingChecks",[...floatChecks,{id:uid(),bank:"",particulars:"",checkNo:"",amount:"",cleared:false}])} style={{marginTop:10,background:"#f8fafc",border:"1.5px dashed #cbd5e1",borderRadius:8,padding:"5px 14px",fontFamily:"inherit",fontSize:".76rem",fontWeight:700,color:"#475569",cursor:"pointer"}}>+ Add floating check</button>
          <div style={{marginTop:8,fontSize:".68rem",color:"#94a3b8",fontStyle:"italic",lineHeight:1.5}}>
            Uncleared checks feed the <b>Float Check</b> column and lower the <b>Book</b> balance. They carry into each new day automatically until you click <b>Mark cleared</b> — clearing simply drops the check from Float; adjust the affected bank's Beginning balance to reflect the cash leaving.
          </div>
        </div>

        {/* NOTES */}
        <div style={{borderTop:`1px solid ${C.grid}`,padding:"12px 14px"}}>
          <div style={{fontWeight:700,color:"#475569",fontSize:".72rem",textTransform:"uppercase",letterSpacing:".8px",marginBottom:6}}>Notes for {fmtDate(selDate)}</div>
          <textarea value={pos.notes||""} onChange={e=>f("notes",e.target.value)} placeholder="e.g. Loan proceeds from Stella G. deposited to BPI; pending cheque clearances…" rows={2} style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"9px 12px",fontFamily:"inherit",fontSize:".84rem",color:"#1e293b",resize:"vertical",outline:"none",boxSizing:"border-box"}}/>
        </div>

        {/* AUDIT TRAIL — dedicated save log for this day's cash position */}
        {sectionHdr(`Audit Trail — ${fmtDate(selDate)}`,"#334155")}
        <div style={{padding:"10px 14px 14px"}}>
          {(!Array.isArray(pos.audit)||pos.audit.length===0)?(
            <div style={{fontSize:".76rem",color:"#94a3b8",fontStyle:"italic"}}>No save history yet for {fmtDate(selDate)}. Every save is recorded here — who saved it, when, and which totals changed.</div>
          ):(
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {pos.audit.slice().reverse().map((e,i)=>{
                const created=e.action==="Created";
                return(
                  <div key={(e.at||"")+i} style={{display:"flex",gap:10,alignItems:"flex-start",background:"#f8fafc",border:`1px solid ${C.grid}`,borderRadius:8,padding:"8px 12px"}}>
                    <span style={{fontSize:".62rem",fontWeight:800,padding:"2px 8px",borderRadius:20,whiteSpace:"nowrap",color:created?"#047857":"#1d4ed8",background:created?"#dcfce7":"#e0efff",border:`1px solid ${created?"#86efac":"#bfdbfe"}`}}>{created?"✓ Created":"✎ Edited"}</span>
                    <div style={{minWidth:0,flex:1}}>
                      <div style={{fontSize:".76rem",color:"#0f172a"}}>
                        <b>{e.by||"—"}</b>
                        <span style={{color:"#94a3b8"}}> · {e.at?new Date(e.at).toLocaleString("en-PH",{year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}):"—"}</span>
                      </div>
                      {created
                        ?<div style={{fontSize:".72rem",color:"#64748b",marginTop:2}}>Initial position saved.</div>
                        :Array.isArray(e.changes)&&e.changes.length>0
                          ?<div style={{display:"flex",flexWrap:"wrap",gap:"2px 12px",marginTop:3}}>
                             {e.changes.map((c,j)=>(
                               <span key={j} style={{fontSize:".72rem",color:"#475569",fontVariantNumeric:"tabular-nums"}}>
                                 <b style={{color:"#0f172a"}}>{c.field}</b>{c.note?" updated":<>: {peso(c.from)} <span style={{color:"#94a3b8"}}>→</span> <b style={{color:"#0f172a"}}>{peso(c.to)}</b></>}
                               </span>
                             ))}
                           </div>
                          :<div style={{fontSize:".72rem",color:"#64748b",marginTop:2}}>Re-saved (no figure changes).</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      {pos.savedAt&&<div style={{textAlign:"right",fontSize:".7rem",color:"#94a3b8",marginTop:6}}>Last saved: {new Date(pos.savedAt).toLocaleString("en-PH")}</div>}
    </div>
  );
}

export default DailyCashPosition;
