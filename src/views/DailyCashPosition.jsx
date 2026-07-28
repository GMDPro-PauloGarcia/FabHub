import React,{useState,useMemo,useEffect,useRef} from "react";
import {today,uid,BANKS,emptyBankRow,emptyDayPosition} from "../shared";
import {paymentClearDate,isPaymentCleared} from "../core";

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
// Report (Executive Summary + Bank Account Detail + Collections Detail) sits on
// top; the operational panels (This Week, obligations, standby funds, credit
// lines, inventory) follow below. Collections auto-fill from billing payments
// that clear on the selected date; Bizlink & Float Check are manual entry.
function DailyCashPosition({
  cashPositions={},saveDayPos=()=>{},wonDeals=[],billings=[],
  exps=[],payables=[],vouchers=[],loans=[],inventory=[]
}){
  const[selDate,setSelDate]=useState(today);
  const[saved,setSaved]    =useState(false);
  const[histOpen,setHistOpen]=useState(false);

  const normPos=(p,date)=>p?.banks?p:{...emptyDayPosition(date||today),...(p||{})};
  const[pos,setPos]=useState(()=>normPos(cashPositions[today],today));

  const mob=typeof window!=="undefined"&&window.innerWidth<820;

  const carryFrom=(date)=>{
    const prevDay=Object.keys(cashPositions).filter(k=>k<date).sort().reverse()[0];
    const base=emptyDayPosition(date);
    if(!prevDay) return base;
    const prev=cashPositions[prevDay];
    const newBanks={};
    BANKS.forEach(b=>{
      const r=prev.banks?.[b.id]||{};
      const endN=Number(r.end)||Number(r.book)||Number(r.beg)||0;
      newBanks[b.id]={...emptyBankRow(),beg:endN?String(endN):"",creditLine:r.creditLine||""};
    });
    return {...base,banks:newBanks};
  };

  useEffect(()=>{
    if(cashPositions[selDate]){setPos(normPos(cashPositions[selDate],selDate));setSaved(true);}
    else{setPos(carryFrom(selDate));setSaved(false);}
  },[cashPositions]);

  const switchDate=(d)=>{
    setSelDate(d);
    if(cashPositions[d]){setPos(normPos(cashPositions[d],d));setSaved(true);}
    else{setPos(carryFrom(d));setSaved(false);}
  };

  const f=(path,val)=>{
    setSaved(false);
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

  // ── Collections auto-fill: billing payments that CLEAR on the selected date ──
  const BILLING_BANK_MAP={BPI:"bpi",Metrobank:"metro",Chinabank:"china",BDO:"bdo","Security Bank":"security",Unionbank:"union"};
  const tagPayment=(p,b)=>{
    const normBank=BILLING_BANK_MAP[p.bank]||p.bank||"";
    const deal=wonDeals.find(d=>d.id===b.dealId)||{};
    return{id:p.id,bank:normBank,amount:Number(p.amount||0),
      particulars:(deal.client||deal.contact||b.name||"Collection"),milestone:b.name||"",method:p.method||"",source:"billing"};
  };
  const autoColl=useMemo(()=>{
    const out=[];
    (billings||[]).forEach(b=>{
      if(b.status==="Cancelled") return;
      (b.payments||[]).forEach(p=>{if(!p.bounced&&paymentClearDate(p)===selDate) out.push(tagPayment(p,b));});
    });
    return out;
  },[billings,selDate,wonDeals]);

  const manualColl=pos.collections?.manualCollections||[];
  const collByBank=useMemo(()=>{
    const out={};BANKS.forEach(b=>out[b.id]=0);
    autoColl.forEach(r=>{if(r.bank&&out[r.bank]!=null) out[r.bank]+=n(r.amount);});
    manualColl.forEach(r=>{if(r.bank&&out[r.bank]!=null) out[r.bank]+=n(r.amount);});
    return out;
  },[autoColl,manualColl]);
  const collTotal=useMemo(()=>autoColl.reduce((s,r)=>s+n(r.amount),0)+manualColl.reduce((s,r)=>s+n(r.amount),0),[autoColl,manualColl]);

  // ── Executive Summary (computed from Bank Account Detail) ──
  const opBeg  =sum(opBanks, b=>n(bankRow(b.id).beg));
  const opEnd  =sum(opBanks, b=>n(bankRow(b.id).end));
  const opBook =sum(opBanks, b=>n(bankRow(b.id).book));
  const netChange=opEnd-opBeg;
  const reserveBal=sum(resBanks, b=>n(bankRow(b.id).end));
  const totalCashAll=opEnd+reserveBal;

  // ── Loan metrics (memo + obligations panel) ──
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

  // ── Bank Account Detail column totals ──
  const tot={
    beg:    sum(BANKS,b=>n(bankRow(b.id).beg)),
    coll:   collTotal,
    end:    sum(BANKS,b=>n(bankRow(b.id).end)),
    book:   sum(BANKS,b=>n(bankRow(b.id).book)),
    bizlink:sum(BANKS,b=>n(bankRow(b.id).bizlink)),
    float:  sum(BANKS,b=>n(bankRow(b.id).float)),
  };

  // ── Operational metrics for the panels below the report ──
  const floatingChecks=useMemo(()=>(vouchers||[]).filter(v=>v.status==="Released"&&!v.isCleared),[vouchers]);
  const floatingTotal=useMemo(()=>floatingChecks.reduce((s,v)=>s+Number(v.amount||0),0),[floatingChecks]);

  const payablesMetrics=useMemo(()=>{
    const now=new Date(today);const in7=new Date(today);in7.setDate(in7.getDate()+7);const in30=new Date(today);in30.setDate(in30.getDate()+30);
    let overdue=0,due7=0,due30=0,totalUnpaid=0;const overdueList=[],upcoming=[];
    (payables||[]).filter(p=>!["Paid","Cancelled"].includes(p.status)).forEach(p=>{
      const amt=Number(p.amount||0);totalUnpaid+=amt;
      if(p.dueDate){const d=new Date(p.dueDate);
        if(d<now){overdue+=amt;overdueList.push(p);}
        else if(d<=in7){due7+=amt;upcoming.push(p);}
        else if(d<=in30){due30+=amt;upcoming.push(p);}}
    });
    return{overdue,due7,due30,totalUnpaid,overdueList,upcoming};
  },[payables]);

  const inventoryValue=useMemo(()=>(inventory||[]).filter(i=>i.status!=="Inactive").reduce((s,i)=>s+Number(i.qtyOnHand||0)*Number(i.avgCost||0),0),[inventory]);

  const thisWeek=useMemo(()=>{
    const now=new Date(today);const in7=new Date(today);in7.setDate(in7.getDate()+7);
    const collections=(billings||[]).filter(b=>b.status!=="Cancelled"&&b.status!=="Fully Paid"&&b.dueDate&&new Date(b.dueDate)>=now&&new Date(b.dueDate)<=in7)
      .map(b=>{const paid=(b.payments||[]).reduce((s,p)=>s+Number(p.amount||0),0);const balance=Math.max(0,Number(b.amount||0)-paid);
        const deal=wonDeals.find(d=>d.id===b.dealId);return{id:b.id,client:deal?.client||"Unknown",name:b.name||"Milestone",dueDate:b.dueDate,balance};})
      .filter(r=>r.balance>0).sort((a,b)=>a.dueDate>b.dueDate?1:-1);
    const expenses=(payables||[]).filter(p=>!["Paid","Cancelled"].includes(p.status)&&p.dueDate&&new Date(p.dueDate)>=now&&new Date(p.dueDate)<=in7).sort((a,b)=>a.dueDate>b.dueDate?1:-1);
    return{collections,expenses,collTotal:collections.reduce((s,r)=>s+r.balance,0),expTotal:expenses.reduce((s,p)=>s+Number(p.amount||0),0)};
  },[billings,payables,wonDeals]);

  const pendingIncoming=useMemo(()=>{
    const out=[];
    (billings||[]).forEach(b=>{if(b.status==="Cancelled")return;(b.payments||[]).forEach(p=>{
      if(p.bounced)return;const recv=p.date||"";
      if(recv&&recv<=selDate&&!isPaymentCleared(p,selDate)) out.push({...tagPayment(p,b),clearDate:paymentClearDate(p)});
    });});
    return out;
  },[billings,selDate,wonDeals]);
  const pendingIncomingTotal=useMemo(()=>pendingIncoming.reduce((s,p)=>s+Number(p.amount||0),0),[pendingIncoming]);

  // Operating end-of-day cash is the spendable base for standby funds
  const operatingCash=opEnd;
  const standby=operatingCash-floatingTotal-(payablesMetrics.overdue+payablesMetrics.due7)-loanMetrics.monthlyPaymentTotal;

  const handleSave=()=>{
    saveDayPos(selDate,{...pos,collections:{...pos.collections,total:collTotal},savedAt:new Date().toISOString()});
    setSaved(true);
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
      ["BANK ACCOUNT DETAIL"],
      ["Bank","Account No.","Branch","Type","Beginning Balance","Collections","Ending Bank Balance","Book Balance","Bizlink Transaction","Float Check"],
    ];
    BANKS.forEach(b=>{const r=bankRow(b.id);rows.push([b.name,b.acctNo,b.branch,b.type,n(r.beg).toFixed(2),(collByBank[b.id]||0).toFixed(2),n(r.end).toFixed(2),n(r.book).toFixed(2),n(r.bizlink).toFixed(2),n(r.float).toFixed(2)]);});
    rows.push(["TOTAL","","","",tot.beg.toFixed(2),tot.coll.toFixed(2),tot.end.toFixed(2),tot.book.toFixed(2),tot.bizlink.toFixed(2),tot.float.toFixed(2)]);
    rows.push([],["COLLECTIONS DETAIL (FOR THE DAY)"],["Bank","Particulars","Amount","Source"]);
    [...autoColl,...manualColl].forEach(r=>{const bk=BANKS.find(x=>x.id===r.bank);rows.push([bk?bk.name:"",r.particulars??r.note??"",n(r.amount).toFixed(2),r.source==="billing"?"Billing (auto)":"Manual"]);});
    rows.push(["TOTAL","",collTotal.toFixed(2),""]);
    const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
    const a=document.createElement("a");
    a.href="data:text/csv;charset=utf-8,"+encodeURIComponent("﻿"+csv);
    a.download=`GMD_CashPosition_${selDate}.csv`;a.click();
  };

  // ── style tokens (Excel look) ──
  const C={navy:"#1f3864",gold:"#ffd966",green:"#c6e0b4",blue:"#0070c0",grid:"#d0d7e2",zebra:"#f4f6fb"};
  const sectionHdr=(label,accent=C.navy)=>(
    <div style={{background:accent,color:"#fff",fontWeight:800,fontSize:".72rem",letterSpacing:".6px",padding:"6px 12px",textTransform:"uppercase"}}>{label}</div>
  );
  const numCell={textAlign:"right",padding:"6px 12px",fontSize:".82rem",fontVariantNumeric:"tabular-nums"};
  const th={background:C.gold,color:C.navy,fontWeight:800,fontSize:".72rem",padding:"8px 10px",border:`1px solid ${C.grid}`,textAlign:"center",whiteSpace:"nowrap"};
  const td={padding:"6px 10px",fontSize:".8rem",border:`1px solid ${C.grid}`,fontVariantNumeric:"tabular-nums"};
  const inpStyle={textAlign:"right",border:"1.5px solid #e2e8f0",borderRadius:6,padding:"6px 10px",fontFamily:"inherit",fontSize:".85rem",color:"#0f172a",background:"#fff",width:"100%",boxSizing:"border-box",outline:"none"};

  const editCell=(id,key)=>(
    <td style={{...td,padding:2,background:"#fff"}}>
      <CurrInp value={bankRow(id)[key]||""} onChange={e=>f(`banks.${id}.${key}`,e.target.value)} style={{textAlign:"right",fontSize:".8rem",padding:"5px 8px"}}/>
    </td>
  );

  const summaryRows=[
    ["Total Operating Bank Balance – Beginning of Day",opBeg,false,"#0f172a"],
    ["Total Operating Bank Balance – End of Day",opEnd,false,"#0f172a"],
    ["Net Change for the Day (Operating)",netChange,false,netChange>=0?"#047857":"#dc2626"],
    ["Total Operating Book Balance",opBook,false,"#0f172a"],
    ["Reserve / Savings Balance (Security Bank + UnionBank)",reserveBal,false,"#0f172a"],
    ["Total Cash – All Accounts (End of Day)",totalCashAll,true,"#0f172a"],
    ["Outstanding Loan Balance (memo only – excluded from cash total)",outstandingLoan,false,C.blue],
  ];

  return(
    <div>
      <style>{`
        .dcp-inp:focus{border:1px solid ${C.blue}!important;background:#eff6ff!important;box-shadow:0 0 0 2px rgba(0,112,192,.12);border-radius:4px;}
        .dcp-inp:hover{background:#f1f5f9;border-radius:4px;}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
      `}</style>

      {/* ── Toolbar ── */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:10}}>
        <div style={{fontSize:".78rem",color:"#64748b"}}>Daily Cash Position — Owners' Review report</div>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <button onClick={exportCSV} style={{background:"#eff6ff",border:"1.5px solid #bfdbfe",borderRadius:8,padding:"7px 14px",fontFamily:"inherit",fontSize:".78rem",fontWeight:700,color:"#1d4ed8",cursor:"pointer"}}>⬇ Export CSV</button>
          <input type="date" value={selDate} onChange={e=>switchDate(e.target.value)} style={{border:"1.5px solid #e2e8f0",borderRadius:8,padding:"8px 12px",fontFamily:"inherit",fontSize:".84rem",color:"#0f172a",cursor:"pointer"}}/>
          <button onClick={()=>setHistOpen(h=>!h)} style={{background:"#f8fafc",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"8px 12px",fontFamily:"inherit",fontSize:".78rem",color:"#64748b",cursor:"pointer",fontWeight:600}}>📅 History ({histDates.length})</button>
          <button onClick={handleSave} style={{background:saved?"#f0fdf4":C.navy,border:`1.5px solid ${saved?"#6ee7b7":C.navy}`,borderRadius:8,padding:"8px 18px",fontFamily:"inherit",fontSize:".82rem",color:saved?"#059669":"#fff",cursor:"pointer",fontWeight:700}}>{saved?"✓ Saved":"Save Position"}</button>
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
        </div>

        {/* BANK ACCOUNT DETAIL */}
        {sectionHdr("Bank Account Detail")}
        <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch",padding:"10px 12px 4px"}}>
          <table style={{borderCollapse:"collapse",minWidth:mob?860:"100%",width:"100%"}}>
            <thead>
              <tr>{["Bank","Account No.","Branch","Type","Beginning Balance","Collections","Ending Bank Balance","Book Balance","Bizlink Transaction","Float Check"].map((h,i)=>(
                <th key={h} style={{...th,textAlign:i<4?"left":"center"}}>{h}</th>))}
              </tr>
            </thead>
            <tbody>
              {BANKS.map((b,ri)=>{
                const coll=collByBank[b.id]||0;
                return(
                  <tr key={b.id} style={{background:ri%2?C.zebra:"#fff"}}>
                    <td style={{...td,fontWeight:700,color:"#0f172a",whiteSpace:"nowrap"}}>{b.name.toUpperCase()}</td>
                    <td style={{...td,color:"#475569"}}>{b.acctNo}</td>
                    <td style={{...td,color:"#475569",whiteSpace:"nowrap"}}>{b.branch}</td>
                    <td style={{...td}}>
                      <span style={{fontSize:".68rem",fontWeight:700,padding:"1px 7px",borderRadius:20,color:b.type==="Operating"?"#1d4ed8":"#7c3aed",background:b.type==="Operating"?"#eff6ff":"#f5f3ff",border:`1px solid ${b.type==="Operating"?"#bfdbfe":"#e9d5ff"}`}}>{b.type}</span>
                    </td>
                    {editCell(b.id,"beg")}
                    <td style={{...td,...numCell,color:coll>0?C.blue:"#cbd5e1",fontWeight:coll>0?700:400}}>{coll>0?fmt2(coll):"—"}</td>
                    {editCell(b.id,"end")}
                    {editCell(b.id,"book")}
                    {editCell(b.id,"bizlink")}
                    {editCell(b.id,"float")}
                  </tr>
                );
              })}
              <tr style={{background:"#e8edf5",fontWeight:800}}>
                <td style={{...td,fontWeight:900,color:C.navy}} colSpan={4}>TOTAL</td>
                <td style={{...td,...numCell,fontWeight:900,color:"#0f172a"}}>{fmt2(tot.beg)}</td>
                <td style={{...td,...numCell,fontWeight:900,color:C.blue}}>{fmt2(tot.coll)}</td>
                <td style={{...td,...numCell,fontWeight:900,color:"#047857"}}>{fmt2(tot.end)}</td>
                <td style={{...td,...numCell,fontWeight:900,color:"#0f172a"}}>{fmt2(tot.book)}</td>
                <td style={{...td,...numCell,fontWeight:900,color:"#0f172a"}}>{tot.bizlink>0?fmt2(tot.bizlink):"—"}</td>
                <td style={{...td,...numCell,fontWeight:900,color:"#0f172a"}}>{tot.float>0?fmt2(tot.float):"—"}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{padding:"6px 14px 12px",fontSize:".68rem",color:"#94a3b8",fontStyle:"italic",lineHeight:1.5}}>
          <span style={{color:C.blue}}>Blue text</span> = collections for the day (auto-filled from billing payments that clear on this date). <b>Operating</b> = working accounts in the Executive Summary totals; <b>Reserve</b> = Chinabank, Security Bank &amp; UnionBank savings, tracked separately. Ending, Book, Bizlink &amp; Float cells are editable.
        </div>

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
              {autoColl.length===0&&manualColl.length===0&&(
                <tr><td colSpan={4} style={{...td,color:"#94a3b8",fontStyle:"italic",padding:"10px"}}>No collections recorded for {fmtDate(selDate)}. Add manual entries below, or record payments in Billing.</td></tr>
              )}
              {/* Auto rows from billing (read-only) */}
              {autoColl.map((r,i)=>{const bk=BANKS.find(x=>x.id===r.bank);return(
                <tr key={"auto"+(r.id||i)} style={{background:"#f0f7ff"}}>
                  <td style={{...td}}>{bk?bk.name.toUpperCase():<span style={{color:"#dc2626",fontWeight:700}}>⚠ Untagged</span>}</td>
                  <td style={{...td}}>{r.particulars}{r.milestone?` · ${r.milestone}`:""}<span style={{marginLeft:6,fontSize:".62rem",fontWeight:700,color:C.blue,background:"#e0efff",border:"1px solid #bfdbfe",borderRadius:5,padding:"0 5px"}}>auto · billing</span></td>
                  <td style={{...td,...numCell,color:C.blue,fontWeight:700}}>{fmt2(r.amount)}</td>
                  <td style={{...td,border:"none",background:"#fff"}}></td>
                </tr>
              );})}
              {/* Manual rows (editable) */}
              {manualColl.map((row,ri)=>(
                <tr key={row.id||ri} style={{background:ri%2?C.zebra:"#fff"}}>
                  <td style={{...td,padding:2}}>
                    <select value={row.bank||""} onChange={e=>{const mc=[...manualColl];mc[ri]={...mc[ri],bank:e.target.value};f("collections.manualCollections",mc);}} style={{width:"100%",border:"1px solid transparent",borderRadius:4,padding:"5px 6px",fontFamily:"inherit",fontSize:".8rem",background:"transparent",color:"#0f172a",outline:"none"}}>
                      <option value="">Select bank…</option>
                      {BANKS.map(b=><option key={b.id} value={b.id}>{b.name.toUpperCase()}</option>)}
                    </select>
                  </td>
                  <td style={{...td,padding:2}}>
                    <input type="text" value={row.particulars??row.note??""} onChange={e=>{const mc=[...manualColl];mc[ri]={...mc[ri],particulars:e.target.value};f("collections.manualCollections",mc);}} placeholder="e.g. LOAN — STELLA G." style={{width:"100%",border:"1px solid transparent",borderRadius:4,padding:"5px 8px",fontFamily:"inherit",fontSize:".8rem",background:"transparent",color:"#0f172a",outline:"none"}}/>
                  </td>
                  <td style={{...td,padding:2}}>
                    <CurrInp value={row.amount||""} onChange={e=>{const mc=[...manualColl];mc[ri]={...mc[ri],amount:e.target.value};f("collections.manualCollections",mc);}} style={{textAlign:"right",fontSize:".8rem",padding:"5px 8px"}}/>
                  </td>
                  <td style={{...td,padding:2,textAlign:"center",border:"none"}}>
                    <button onClick={()=>f("collections.manualCollections",manualColl.filter((_,j)=>j!==ri))} style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:4,padding:"2px 7px",cursor:"pointer",color:"#dc2626",fontWeight:700,fontSize:".72rem",fontFamily:"inherit"}}>✕</button>
                  </td>
                </tr>
              ))}
              <tr style={{background:"#e8edf5"}}>
                <td style={{...td,fontWeight:900,color:C.navy}} colSpan={2}>TOTAL</td>
                <td style={{...td,...numCell,fontWeight:900,color:C.blue}}>{fmt2(collTotal)}</td>
                <td style={{...td,border:"none",background:"#fff"}}></td>
              </tr>
            </tbody>
          </table>
          <button onClick={()=>f("collections.manualCollections",[...manualColl,{id:uid(),bank:"",particulars:"",amount:""}])} style={{marginTop:10,background:"#f8fafc",border:"1.5px dashed #cbd5e1",borderRadius:8,padding:"5px 14px",fontFamily:"inherit",fontSize:".76rem",fontWeight:700,color:"#475569",cursor:"pointer"}}>+ Add manual collection</button>
        </div>

        {/* NOTES */}
        <div style={{borderTop:`1px solid ${C.grid}`,padding:"12px 14px"}}>
          <div style={{fontWeight:700,color:"#475569",fontSize:".72rem",textTransform:"uppercase",letterSpacing:".8px",marginBottom:6}}>Notes for {fmtDate(selDate)}</div>
          <textarea value={pos.notes||""} onChange={e=>f("notes",e.target.value)} placeholder="e.g. Loan proceeds from Stella G. deposited to BPI; pending cheque clearances…" rows={2} style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"9px 12px",fontFamily:"inherit",fontSize:".84rem",color:"#1e293b",resize:"vertical",outline:"none",boxSizing:"border-box"}}/>
        </div>
      </div>
      {pos.savedAt&&<div style={{textAlign:"right",fontSize:".7rem",color:"#94a3b8",marginTop:6}}>Last saved: {new Date(pos.savedAt).toLocaleString("en-PH")}</div>}

      {/* ═══════════ OPERATIONAL VIEW (below the report) ═══════════ */}
      <div style={{marginTop:26,marginBottom:10,display:"flex",alignItems:"center",gap:10}}>
        <div style={{height:1,flex:1,background:"#e2e8f0"}}/>
        <div style={{fontSize:".7rem",fontWeight:800,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"1.2px"}}>Operational View — live from FabHub</div>
        <div style={{height:1,flex:1,background:"#e2e8f0"}}/>
      </div>

      {/* This Week at a glance */}
      <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr",gap:12,marginBottom:16}}>
        <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",overflow:"hidden"}}>
          <div style={{background:"#059669",padding:"10px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontWeight:800,color:"#fff",fontSize:".82rem"}}>📥 Expected Collections This Week</span>
            <span style={{fontWeight:800,color:"#a7f3d0",fontSize:".85rem"}}>₱{thisWeek.collTotal.toLocaleString("en-PH",{maximumFractionDigits:0})}</span>
          </div>
          {thisWeek.collections.length===0
            ?<div style={{padding:16,color:"#94a3b8",fontSize:".8rem",textAlign:"center"}}>No billing milestones due in the next 7 days</div>
            :thisWeek.collections.map((r,i)=>(
              <div key={r.id} style={{display:"grid",gridTemplateColumns:"1fr auto auto",gap:8,padding:"8px 14px",borderBottom:i<thisWeek.collections.length-1?"1px solid #f1f5f9":"none",alignItems:"center"}}>
                <div style={{minWidth:0}}><div style={{fontWeight:600,color:"#0f172a",fontSize:".78rem",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.client}</div><div style={{fontSize:".65rem",color:"#94a3b8",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.name}</div></div>
                <div style={{fontSize:".68rem",color:"#64748b",whiteSpace:"nowrap"}}>{r.dueDate}</div>
                <div style={{fontWeight:700,color:"#059669",fontSize:".78rem",whiteSpace:"nowrap"}}>₱{r.balance.toLocaleString("en-PH",{maximumFractionDigits:0})}</div>
              </div>))}
        </div>
        <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",overflow:"hidden"}}>
          <div style={{background:"#dc2626",padding:"10px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontWeight:800,color:"#fff",fontSize:".82rem"}}>📤 Expected Expenses This Week</span>
            <span style={{fontWeight:800,color:"#fca5a5",fontSize:".85rem"}}>₱{(thisWeek.expTotal+loanMetrics.monthlyPaymentTotal).toLocaleString("en-PH",{maximumFractionDigits:0})}</span>
          </div>
          {loanMetrics.loanRows.map(l=>(
            <div key={l.id} style={{display:"grid",gridTemplateColumns:"1fr auto auto",gap:8,padding:"8px 14px",borderBottom:"1px solid #f1f5f9",alignItems:"center"}}>
              <div style={{minWidth:0}}><div style={{fontWeight:600,color:"#0f172a",fontSize:".78rem",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{l.lender||l.name||"Loan"}</div><div style={{fontSize:".65rem",color:"#94a3b8"}}>Monthly loan payment</div></div>
              <div style={{fontSize:".68rem",color:"#7c3aed",fontWeight:600,whiteSpace:"nowrap"}}>Loan</div>
              <div style={{fontWeight:700,color:"#dc2626",fontSize:".78rem",whiteSpace:"nowrap"}}>₱{Number(l.monthly||0).toLocaleString("en-PH",{maximumFractionDigits:0})}</div>
            </div>))}
          {thisWeek.expenses.length===0&&loanMetrics.loanRows.length===0
            ?<div style={{padding:16,color:"#94a3b8",fontSize:".8rem",textAlign:"center"}}>No payables due in the next 7 days</div>
            :thisWeek.expenses.map((p,i)=>(
              <div key={p.id} style={{display:"grid",gridTemplateColumns:"1fr auto auto",gap:8,padding:"8px 14px",borderBottom:i<thisWeek.expenses.length-1?"1px solid #f1f5f9":"none",alignItems:"center"}}>
                <div style={{minWidth:0}}><div style={{fontWeight:600,color:"#0f172a",fontSize:".78rem",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.vendor||p.category||"Payable"}</div><div style={{fontSize:".65rem",color:"#94a3b8"}}>{p.category||""}{p.invoiceRef?" · "+p.invoiceRef:""}</div></div>
                <div style={{fontSize:".68rem",color:"#64748b",whiteSpace:"nowrap"}}>{p.dueDate}</div>
                <div style={{fontWeight:700,color:"#dc2626",fontSize:".78rem",whiteSpace:"nowrap"}}>₱{Number(p.amount||0).toLocaleString("en-PH",{maximumFractionDigits:0})}</div>
              </div>))}
        </div>
      </div>

      {/* Incoming (uncleared) collections */}
      {pendingIncoming.length>0&&(
        <div style={{background:"#fff",borderRadius:14,border:"1.5px solid #bfdbfe",overflow:"hidden",marginBottom:16}}>
          <div style={{background:"#eff6ff",borderBottom:"2px solid #bfdbfe",padding:"11px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div><div style={{fontWeight:800,color:"#1d4ed8",fontSize:".82rem"}}>📥 Incoming — Uncleared Collections</div><div style={{fontSize:".66rem",color:"#3b82f6",marginTop:1}}>Received, awaiting bank clearance — not yet counted in Collections</div></div>
            <div style={{textAlign:"right"}}><div style={{fontWeight:900,fontSize:"1.2rem",color:"#1d4ed8"}}>{peso(pendingIncomingTotal)}</div><div style={{fontSize:".62rem",color:"#94a3b8"}}>{pendingIncoming.length} pending</div></div>
          </div>
          <div style={{maxHeight:200,overflowY:"auto"}}>
            {pendingIncoming.map((p,i)=>(
              <div key={p.id||i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 16px",borderBottom:"1px solid #eff6ff",gap:8}}>
                <div style={{minWidth:0}}><div style={{fontWeight:700,color:"#0f172a",fontSize:".78rem",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.particulars}</div><div style={{fontSize:".66rem",color:"#94a3b8"}}>{p.milestone||"Collection"}{p.method?` · ${p.method}`:""}</div></div>
                <div style={{textAlign:"right",flexShrink:0}}><div style={{fontWeight:700,color:"#1d4ed8",fontSize:".8rem"}}>{peso(p.amount)}</div><div style={{fontSize:".62rem",color:"#b45309",fontWeight:600}}>clears {p.clearDate||"—"}</div></div>
              </div>))}
          </div>
        </div>
      )}

      {/* Obligations: Floating Checks · Payables · Loans */}
      <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"repeat(3,1fr)",gap:12,marginBottom:16,alignItems:"start"}}>
        {/* Floating Checks */}
        <div style={{background:"#fff",borderRadius:14,border:`1.5px solid ${floatingChecks.length===0?"#e2e8f0":"#fde68a"}`,overflow:"hidden"}}>
          <div style={{background:floatingChecks.length===0?"#f8fafc":"#fef9c3",borderBottom:`2px solid ${floatingChecks.length===0?"#e2e8f0":"#fde68a"}`,padding:"11px 16px"}}>
            <div style={{fontWeight:800,color:floatingChecks.length===0?"#94a3b8":"#92400e",fontSize:".82rem"}}>🏦 Floating Checks</div>
            <div style={{fontSize:".66rem",color:floatingChecks.length===0?"#cbd5e1":"#b45309",marginTop:1}}>Released CVs not yet cleared · {peso(floatingTotal)}</div>
          </div>
          {floatingChecks.length===0
            ?<div style={{padding:"16px",fontSize:".76rem",color:"#cbd5e1",textAlign:"center"}}>None released from FabHub yet.</div>
            :<div style={{maxHeight:180,overflowY:"auto"}}>{floatingChecks.map(cv=>(
              <div key={cv.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 16px",borderBottom:"1px solid #fef3c7",gap:8}}>
                <div style={{minWidth:0}}><div style={{fontWeight:700,color:"#0f172a",fontSize:".78rem"}}>{cv.payee||cv.cvNo||"CV"}</div><div style={{fontSize:".67rem",color:"#94a3b8"}}>{cv.cvNo||""}{cv.checkNo?` · #${cv.checkNo}`:""}{cv.bank?` · ${cv.bank}`:""}</div></div>
                <span style={{fontWeight:700,color:"#b45309",fontSize:".8rem",flexShrink:0}}>{peso(cv.amount)}</span>
              </div>))}</div>}
        </div>
        {/* Payables */}
        <div style={{background:"#fff",borderRadius:14,border:"1.5px solid #fecaca",overflow:"hidden"}}>
          <div style={{background:"#fef2f2",borderBottom:"2px solid #fecaca",padding:"11px 16px"}}>
            <div style={{fontWeight:800,color:"#dc2626",fontSize:".82rem"}}>💳 Accounts Payable</div>
            <div style={{fontSize:".66rem",color:"#ef4444",marginTop:1}}>Total unpaid · {peso(payablesMetrics.totalUnpaid)}</div>
          </div>
          {(payables||[]).filter(p=>!["Paid","Cancelled"].includes(p.status)).length===0
            ?<div style={{padding:"14px 16px",fontSize:".76rem",color:"#94a3b8",fontStyle:"italic"}}>No outstanding payables.</div>
            :<>
              {payablesMetrics.overdue>0&&<div style={{padding:"7px 16px",background:"#fff5f5",borderBottom:"1px solid #fecaca",display:"flex",justifyContent:"space-between"}}><span style={{fontSize:".73rem",fontWeight:700,color:"#dc2626"}}>🔴 Overdue ({payablesMetrics.overdueList.length})</span><span style={{fontWeight:800,color:"#dc2626",fontSize:".8rem"}}>{peso(payablesMetrics.overdue)}</span></div>}
              {payablesMetrics.due7>0&&<div style={{padding:"7px 16px",background:"#fff7ed",borderBottom:"1px solid #fed7aa",display:"flex",justifyContent:"space-between"}}><span style={{fontSize:".73rem",fontWeight:700,color:"#c2410c"}}>🟠 Due in 7 days</span><span style={{fontWeight:800,color:"#c2410c",fontSize:".8rem"}}>{peso(payablesMetrics.due7)}</span></div>}
              {payablesMetrics.due30>0&&<div style={{padding:"7px 16px",background:"#fffbeb",borderBottom:"1px solid #fde68a",display:"flex",justifyContent:"space-between"}}><span style={{fontSize:".73rem",fontWeight:700,color:"#92400e"}}>🟡 Due in 30 days</span><span style={{fontWeight:800,color:"#92400e",fontSize:".8rem"}}>{peso(payablesMetrics.due30)}</span></div>}
            </>}
        </div>
        {/* Loans */}
        <div style={{background:"#fff",borderRadius:14,border:"1.5px solid #e9d5ff",overflow:"hidden"}}>
          <div style={{background:"#faf5ff",borderBottom:"2px solid #e9d5ff",padding:"11px 16px"}}>
            <div style={{fontWeight:800,color:"#7c3aed",fontSize:".82rem"}}>🏛 Loan Obligations</div>
            <div style={{fontSize:".66rem",color:"#8b5cf6",marginTop:1}}>Balance {peso(loanMetrics.totalBalance)} · ₱{loanMetrics.monthlyPaymentTotal.toLocaleString("en-PH",{maximumFractionDigits:0})}/mo</div>
          </div>
          {loanMetrics.loanRows.length===0
            ?<div style={{padding:"14px 16px",fontSize:".76rem",color:"#94a3b8",fontStyle:"italic"}}>No active loans.</div>
            :<div style={{maxHeight:180,overflowY:"auto"}}>{loanMetrics.loanRows.map(l=>{
              const pct=Number(l.principal)>0?Math.min(100,Math.round((1-l.remainingBalance/Number(l.principal))*100)):0;
              return(<div key={l.id} style={{padding:"9px 16px",borderBottom:"1px solid #f3e8ff"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:5}}>
                  <div style={{minWidth:0}}><div style={{fontWeight:700,color:"#0f172a",fontSize:".77rem",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{l.lender||l.name||"Loan"}</div></div>
                  <div style={{textAlign:"right",flexShrink:0,marginLeft:8}}><div style={{fontWeight:800,color:"#7c3aed",fontSize:".78rem"}}>₱{l.remainingBalance.toLocaleString("en-PH",{minimumFractionDigits:0})}</div><div style={{fontSize:".62rem",color:"#94a3b8"}}>{pct}% paid</div></div>
                </div>
                <div style={{height:3,background:"#f3e8ff",borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",width:pct+"%",background:"#8b5cf6",borderRadius:2}}/></div>
              </div>);})}</div>}
        </div>
      </div>

      {/* Available Standby Funds */}
      <div style={{background:standby>=0?"#f0fdf4":"#fef2f2",borderRadius:14,border:`2px solid ${standby>=0?"#6ee7b7":"#fca5a5"}`,padding:"16px 20px",marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
        <div>
          <div style={{fontWeight:800,color:standby>=0?"#047857":"#dc2626",fontSize:".92rem"}}>{standby>=0?"✅":"⚠️"} Available Standby Funds</div>
          <div style={{fontSize:".72rem",color:"#64748b",marginTop:4,lineHeight:1.5}}>
            Operating Cash (End of Day) <span style={{color:"#1d4ed8"}}>{peso(operatingCash)}</span>
            {" − "}Floating Checks <span style={{color:"#b45309"}}>{peso(floatingTotal)}</span>
            {" − "}Overdue+7d Payables <span style={{color:"#dc2626"}}>{peso(payablesMetrics.overdue+payablesMetrics.due7)}</span>
            {" − "}Monthly Loans <span style={{color:"#7c3aed"}}>{peso(loanMetrics.monthlyPaymentTotal)}</span>
          </div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontWeight:900,fontSize:"2rem",color:standby>=0?"#047857":"#dc2626",lineHeight:1}}>{peso(standby)}</div>
          <div style={{fontSize:".63rem",color:"#94a3b8",marginTop:3,textTransform:"uppercase",letterSpacing:".8px"}}>Standby funds</div>
        </div>
      </div>

      {/* Credit Line / Standby Funds table (Operating banks) */}
      <div style={{background:"#fff",borderRadius:14,border:"2px solid #a5b4fc",overflow:"hidden",marginBottom:16}}>
        <div style={{background:"#4338ca",padding:"10px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div><div style={{fontWeight:800,color:"#fff",fontSize:".88rem"}}>🏦 Credit Line / Standby Funds</div><div style={{fontSize:".67rem",color:"rgba(255,255,255,.65)",marginTop:2}}>Approved credit limit per operating account</div></div>
          <div style={{fontWeight:900,fontSize:"1.3rem",color:"#c7d2fe"}}>{peso(opBanks.reduce((s,b)=>s+n(bankRow(b.id).creditLine||0),0))}</div>
        </div>
        <div style={{overflowX:"auto"}}>
          <table style={{borderCollapse:"collapse",width:"100%",minWidth:mob?520:undefined}}>
            <thead><tr><th style={{...th,textAlign:"left",background:"#e0e7ff",color:"#4338ca"}}>Row</th>{opBanks.map(b=><th key={b.id} style={{...th,background:"#e0e7ff",color:"#4338ca"}}>{b.short}</th>)}<th style={{...th,background:"#e0e7ff",color:"#4338ca"}}>Total</th></tr></thead>
            <tbody>
              <tr style={{background:"#eef2ff"}}>
                <td style={{...td,fontWeight:700,color:"#4338ca"}}>Credit Line</td>
                {opBanks.map(b=>(<td key={b.id} style={{...td,padding:2}}><CurrInp value={bankRow(b.id).creditLine||""} onChange={e=>f(`banks.${b.id}.creditLine`,e.target.value)} style={{textAlign:"right",fontSize:".8rem",padding:"5px 8px",color:"#4338ca"}}/></td>))}
                <td style={{...td,...numCell,fontWeight:800,color:"#4338ca"}}>{fmt2(opBanks.reduce((s,b)=>s+n(bankRow(b.id).creditLine||0),0))}</td>
              </tr>
              <tr style={{background:"#f5f3ff"}}>
                <td style={{...td,fontWeight:700,color:"#5b21b6"}}>Available to Borrow<div style={{fontWeight:400,fontSize:".62rem",color:"#7c3aed"}}>Credit Line − Book</div></td>
                {opBanks.map(b=>{const credit=n(bankRow(b.id).creditLine||0);const book=n(bankRow(b.id).book||0)||n(bankRow(b.id).end||0);const avail=credit>0?credit-book:null;
                  return(<td key={b.id} style={{...td,...numCell,fontWeight:avail!=null?800:400,color:avail==null?"#cbd5e1":avail>=0?"#059669":"#dc2626"}}>{avail==null?"—":avail>=0?fmt2(avail):`(${fmt2(Math.abs(avail))})`}</td>);})}
                {(()=>{const tc=opBanks.reduce((s,b)=>s+n(bankRow(b.id).creditLine||0),0);const tb=opBanks.reduce((s,b)=>s+(n(bankRow(b.id).book||0)||n(bankRow(b.id).end||0)),0);const ta=tc>0?tc-tb:null;
                  return(<td style={{...td,...numCell,fontWeight:900,color:ta==null?"#94a3b8":ta>=0?"#059669":"#dc2626"}}>{ta==null?"—":ta>=0?fmt2(ta):`(${fmt2(Math.abs(ta))})`}</td>);})()}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Inventory Assets */}
      {(inventory||[]).filter(i=>i.status!=="Inactive"&&Number(i.qtyOnHand||0)>0).length>0&&(
        <div style={{background:"#ecfeff",borderRadius:14,border:"1.5px solid #a5f3fc",padding:"14px 18px",marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div><div style={{fontWeight:800,color:"#0e7490",fontSize:".82rem"}}>📦 Inventory Assets</div><div style={{fontSize:".66rem",color:"#06b6d4",marginTop:2}}>On-hand stock at average cost</div></div>
          <div style={{fontWeight:900,fontSize:"1.3rem",color:"#0e7490"}}>{peso(inventoryValue)}</div>
        </div>
      )}
    </div>
  );
}

export default DailyCashPosition;
