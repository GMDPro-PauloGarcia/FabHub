import React,{useState,useMemo,useEffect} from "react";
import {fmt,today,uid,BANKS,emptyBankRow,emptyDayPosition,KPI} from "../shared";

const CurrInp=({value,onChange,placeholder="0.00",style:sx={}})=>{
  const fmt=v=>{
    const n=Number(String(v).replace(/,/g,""))||0;
    if(!n&&n!==0) return "";
    return n.toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2});
  };
  const strip=v=>String(v).replace(/,/g,"");
  const[display,setDisplay]=useState(value?fmt(value):"");
  const prev=useRef(value);
  useEffect(()=>{
    if(prev.current!==value){setDisplay(value?fmt(value):"");prev.current=value;}
  },[value]);
  const base={textAlign:"right",border:"1.5px solid #e2e8f0",borderRadius:6,padding:"6px 10px",fontFamily:"inherit",fontSize:".85rem",color:"#0f172a",background:"#fff",width:"100%",boxSizing:"border-box",outline:"none",...(sx||{})};
  return(
    <input
      type="text"
      value={display}
      onChange={e=>setDisplay(e.target.value)}
      onFocus={e=>{const raw=strip(e.target.value);setDisplay(raw);e.target.select();}}
      onBlur={e=>{
        const raw=strip(e.target.value);
        const formatted=raw?fmt(raw):"";
        setDisplay(formatted);
        onChange&&onChange({target:{value:raw}});
      }}
      placeholder={placeholder}
      style={base}
    />
  );
};


// ─── DAILY CASH POSITION DASHBOARD ───────────────────────────────────────────
function DailyCashPosition({cashPositions,saveDayPos,wonDeals,billings,totRev,totExp,totColl,totOut,exps=[],updateMilestone,upExps,toSbExpense,isSupabaseReady,sbUpsert,vouchers=[],payables=[],loans=[],inventory=[]}){
  const[selDate,setSelDate]=useState(today);
  // Normalize any cash position that was saved in old flat format (no .banks object)
  const normPos=(p,date)=>p?.banks?p:{...emptyDayPosition(date||today),...(p||{})};
  const[pos,setPos]        =useState(()=>normPos(cashPositions[today],today));
  const[saved,setSaved]    =useState(false);
  const[histOpen,setHistOpen]=useState(false);

  // Re-run carry-forward after Supabase loads — initial useState runs before data arrives
  React.useEffect(()=>{
    if(!cashPositions) return;
    // If today already has a saved position, load it
    if(cashPositions[selDate]){
      setPos(normPos(cashPositions[selDate],selDate));
      setSaved(true);
      return;
    }
    // Today has no saved entry — carry ending balance from the most recent prior day
    const prevDay=Object.keys(cashPositions).filter(k=>k<selDate).sort().reverse()[0];
    if(!prevDay) return;
    const prev=cashPositions[prevDay];
    const newBanks={};
    BANKS.forEach(b=>{
      const r=prev.banks?.[b.id]||{};
      const endN=Number(r.end)||0;
      const bookN=Number(r.book)||0;
      const begVal=endN||bookN;
      newBanks[b.id]={beg:begVal?String(begVal):"",book:"",end:""};
    });
    setPos(p=>({...p,banks:newBanks}));
    setSaved(false);
  },[cashPositions]);
  const mob=window.innerWidth<768;

  // Billing-derived metrics
  const billingMetrics=useMemo(()=>{
    const bl=billings||[];
    const now=new Date();
    const thisYear=now.getFullYear();
    const thisMonth=now.getMonth();
    let outstanding=0,collectedYTD=0,dueThisMonth=0;
    bl.forEach(b=>{
      if(b.status==='Cancelled') return;
      const amt=Number(b.amount||0);
      const paid=(b.payments||[]).reduce((s,p)=>s+Number(p.amount||0),0);
      outstanding+=Math.max(0,amt-paid);
      (b.payments||[]).forEach(p=>{
        if(p.date&&new Date(p.date).getFullYear()===thisYear) collectedYTD+=Number(p.amount||0);
      });
      if(b.dueDate&&b.status!=='Fully Paid'){
        const due=new Date(b.dueDate);
        if(due.getFullYear()===thisYear&&due.getMonth()===thisMonth){
          dueThisMonth+=Math.max(0,amt-paid);
        }
      }
    });
    return{outstanding,collectedYTD,dueThisMonth};
  },[billings]);

  // ── Floating checks (Released CVs not yet cleared in bank)
  const floatingChecks=useMemo(()=>vouchers.filter(v=>v.status==="Released"&&!v.isCleared),[vouchers]);
  const floatingTotal=useMemo(()=>floatingChecks.reduce((s,v)=>s+Number(v.amount||0),0),[floatingChecks]);

  // ── Payables analytics
  const payablesMetrics=useMemo(()=>{
    const now=new Date(today);
    const in7=new Date(today); in7.setDate(in7.getDate()+7);
    const in30=new Date(today); in30.setDate(in30.getDate()+30);
    let overdue=0,due7=0,due30=0,totalUnpaid=0;
    const overdueList=[];
    const upcoming=[];
    payables.filter(p=>!["Paid","Cancelled"].includes(p.status)).forEach(p=>{
      const amt=Number(p.amount||0);
      totalUnpaid+=amt;
      if(p.dueDate){
        const d=new Date(p.dueDate);
        if(d<now){overdue+=amt;overdueList.push(p);}
        else if(d<=in7){due7+=amt;upcoming.push(p);}
        else if(d<=in30){due30+=amt;upcoming.push(p);}
      }
    });
    return{overdue,due7,due30,totalUnpaid,overdueList,upcoming};
  },[payables,today]);

  // ── Loan metrics
  const loanMetrics=useMemo(()=>{
    const monthlyRate=l=>Number(l.interestRate||0)/100/12;
    let totalBalance=0,monthlyPaymentTotal=0;
    const loanRows=[];
    loans.filter(l=>l.status!=="Paid Off"&&l.status!=="Cancelled").forEach(l=>{
      const paid=(l.payments||[]).reduce((s,p)=>s+Number(p.amount||0),0);
      const principal=Number(l.principal||0);
      // Running balance: approximate remaining principal
      let balance=principal;
      const mr=monthlyRate(l);
      (l.payments||[]).sort((a,b)=>a.date>b.date?1:-1).forEach(p=>{
        const interest=balance*mr;
        const principalPaid=Math.max(0,Number(p.amount||0)-interest);
        balance=Math.max(0,balance-principalPaid);
      });
      const monthly=Number(l.monthlyPayment||0);
      totalBalance+=balance;
      monthlyPaymentTotal+=monthly;
      loanRows.push({...l,remainingBalance:balance,monthly});
    });
    return{totalBalance,monthlyPaymentTotal,loanRows};
  },[loans]);

  // ── Inventory asset value
  const inventoryValue=useMemo(()=>{
    return inventory.filter(i=>i.status!=="Inactive").reduce((s,i)=>{
      return s+Number(i.qtyOnHand||0)*Number(i.avgCost||0);
    },0);
  },[inventory]);

  // ── This Week: expected collections & expenses (next 7 days from today)
  const thisWeek=useMemo(()=>{
    const now=new Date(today);
    const in7=new Date(today); in7.setDate(in7.getDate()+7);
    const collections=(billings||[])
      .filter(b=>b.status!=="Cancelled"&&b.status!=="Fully Paid"&&b.dueDate&&new Date(b.dueDate)>=now&&new Date(b.dueDate)<=in7)
      .map(b=>{
        const paid=(b.payments||[]).reduce((s,p)=>s+Number(p.amount||0),0);
        const balance=Math.max(0,Number(b.amount||0)-paid);
        const deal=wonDeals.find(d=>d.id===b.dealId);
        return{id:b.id,client:deal?.client||"Unknown",name:b.name||"Milestone",dueDate:b.dueDate,balance};
      })
      .filter(r=>r.balance>0)
      .sort((a,b)=>a.dueDate>b.dueDate?1:-1);
    const expenses=payables
      .filter(p=>!["Paid","Cancelled"].includes(p.status)&&p.dueDate&&new Date(p.dueDate)>=now&&new Date(p.dueDate)<=in7)
      .sort((a,b)=>a.dueDate>b.dueDate?1:-1);
    const collTotal=collections.reduce((s,r)=>s+r.balance,0);
    const expTotal=expenses.reduce((s,p)=>s+Number(p.amount||0),0);
    return{collections,expenses,collTotal,expTotal};
  },[billings,payables,wonDeals,today]);

  // When date changes, load that day's position or start fresh
  const switchDate=(d)=>{
    setSelDate(d);
    const existing=cashPositions[d];
    if(existing){
      setPos(normPos(existing,d)); setSaved(true);
    } else {
      // Auto-carry: find most recent saved day before d
      const prevDay=Object.keys(cashPositions).filter(k=>k<d).sort().reverse()[0];
      if(prevDay){
        const prev=cashPositions[prevDay];
        const newBanks={};
        BANKS.forEach(b=>{
          const r=prev.banks?.[b.id]||{};
          newBanks[b.id]={beg:r.end||r.book||"",book:"",end:""};
        });
        setPos({...emptyDayPosition(d),banks:newBanks});
      } else {
        setPos(emptyDayPosition(d));
      }
      setSaved(false);
    }
  };

  // Normalize billing bank display names → Cash Position bank IDs
  const BILLING_BANK_MAP={"BPI":"bpi","Metrobank":"metro","Chinabank":"china","BDO":"bdo","Security Bank":"security","Unionbank":"union"};
  // All billing payments on selDate — shown for Finance to review (pending)
  const todayPayments=useMemo(()=>{
    const payments=[];
    (billings||[]).forEach(b=>{
      (b.payments||[]).forEach(p=>{
        if(p.date===selDate){
          const normBank=BILLING_BANK_MAP[p.bank]||p.bank||"";
          payments.push({...p,bank:normBank,milestoneId:b.id,milestoneName:b.name,milestoneBilling:b,dealId:b.dealId,clientName:(wonDeals.find(d=>d.id===b.dealId)||{}).client||b.name||"Unknown"});
        }
      });
    });
    return payments;
  },[billings,selDate,wonDeals]);

  // Only payments Finance has explicitly approved count toward the balance
  const approvedPaymentIds=useMemo(()=>new Set(pos.collections?.approvedPayments||[]),[pos.collections?.approvedPayments]);
  const todayInflows=useMemo(()=>{
    return todayPayments.filter(p=>approvedPaymentIds.has(p.id)).reduce((s,p)=>s+Number(p.amount||0),0);
  },[todayPayments,approvedPaymentIds]);

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

  // Bank totals
  const bankTotals=useMemo(()=>{
    if(!pos.banks) return {beg:0,book:0,end:0,capBeg:0,capBook:0,capEnd:0};
    let beg=0,book=0,end=0;
    let capBeg=0,capBook=0,capEnd=0;
    BANKS.forEach(b=>{
      const row=pos.banks[b.id]||emptyBankRow();
      if(b.capital){
        capBeg+=n(row.beg); capBook+=n(row.book); capEnd+=n(row.end);
      } else {
        beg+=n(row.beg); book+=n(row.book); end+=n(row.end);
      }
    });
    return {beg,book,end, capBeg,capBook,capEnd};
  },[pos.banks]);

  // Collections total
  const totalCollections=useMemo(()=>{
    return todayInflows+((pos.collections?.manualCollections)||[]).reduce((s,r)=>s+Number(r.amount||0),0);
  },[todayInflows,pos.collections?.manualCollections]);

  // Accounting expenses for the selected date (drives Today's Transactions)
  // Exact date match preferred; fall back to month/year match for expenses without a precise date
  const dateExps=useMemo(()=>{
    const d=new Date(selDate);
    const selMonth=d.getMonth();
    const selYear=d.getFullYear();
    // Only count expenses that have actually been paid — "For Payment" and "Logged" are still pending
    return exps.filter(e=>{
      if(e.acctStatus!=="Paid") return false;
      if(e.expDate) return e.expDate===selDate;
      if(e.month!=null){
        return e.month===selMonth&&(e.year==null||e.year===selYear);
      }
      return false;
    });
  },[exps,selDate]);

  // Transactions total — sum of accounting expenses for the day
  const totalLess=useMemo(()=>{
    return dateExps.reduce((s,e)=>s+Number(e.amount||0),0);
  },[dateExps]);

  // Total Cash Available = Total Book Balance - Less
  // Book balance = what bank confirms; if not filled, fall back to ending balance
  const bookUnreconciled=bankTotals.book===0&&bankTotals.end>0; // warn user when BOOK is blank but END is filled
  const workingBook=bankTotals.book>0?bankTotals.book:bankTotals.end;
  const totalCashAvailable=workingBook+totalCollections-totalLess; // Working capital only — Unionbank (capital) excluded

  // Per-bank computed values (new Excel-style layout)
  const workingBanks=BANKS.filter(b=>!b.capital);

  const cashIn=useMemo(()=>{
    const out={};
    workingBanks.forEach(b=>{out[b.id]=0;});
    // Approved billing payments
    todayPayments.forEach(p=>{
      if(approvedPaymentIds.has(p.id)&&p.bank&&out[p.bank]!=null){
        out[p.bank]+=Number(p.amount||0);
      }
    });
    // Manual collections
    (pos.collections?.manualCollections||[]).forEach(row=>{
      if(row.bank&&out[row.bank]!=null){
        out[row.bank]+=Number(row.amount||0);
      }
    });
    return out;
  },[todayPayments,approvedPaymentIds,pos.collections?.manualCollections]);

  const txOut=useMemo(()=>{
    const out={};
    workingBanks.forEach(b=>{out[b.id]=0;});
    dateExps.forEach(e=>{
      if(e.bankAccount&&out[e.bankAccount]!=null){
        out[e.bankAccount]+=Number(e.amount||0);
      }
    });
    return out;
  },[dateExps]);

  const totalMoneyPerBank=useMemo(()=>{
    if(!pos.banks) return Object.fromEntries(workingBanks.map(b=>[b.id,cashIn[b.id]||0]));
    const out={};
    workingBanks.forEach(b=>{
      const n2=(v)=>Number(String(v).replace(/,/g,""))||0;
      out[b.id]=n2(pos.banks[b.id]?.beg||0)+cashIn[b.id];
    });
    return out;
  },[pos.banks,cashIn]);

  const endingBal=useMemo(()=>{
    const out={};
    workingBanks.forEach(b=>{out[b.id]=totalMoneyPerBank[b.id]-txOut[b.id];});
    return out;
  },[totalMoneyPerBank,txOut]);

  const untaggedExps=useMemo(()=>dateExps.filter(e=>!e.bankAccount),[dateExps]);
  const untaggedPayments=useMemo(()=>todayPayments.filter(p=>!p.bank),[todayPayments]);

  const handleSave=()=>{
    const toSave={...pos,collections:{...pos.collections,fabhubAmt:todayInflows},savedAt:new Date().toISOString()};
    saveDayPos(selDate,toSave);
    setSaved(true);
  };

  const histDates=Object.keys(cashPositions).sort().reverse().slice(0,30);

  const exportDCPCSV=()=>{
    const dates=Object.keys(cashPositions).sort();
    const rows=[["Date","BPI Beg","BPI End","Metrobank Beg","Metrobank End","Chinabank Beg","Chinabank End","BDO Beg","BDO End","Security Beg","Security End","Working Capital","Billing Collections","Manual Collections","Total Collections","Expenses (Accounting)","Cash Available","Notes"]];
    dates.forEach(date=>{
      const pos=cashPositions[date];if(!pos)return;
      const wc=['bpi','metro','china','bdo','security'].reduce((s,b)=>s+Number(pos.banks?.[b]?.book||pos.banks?.[b]?.end||0),0);
      let billingColl=0;
      (billings||[]).forEach(b=>{(b.payments||[]).forEach(p=>{if(p.date===date) billingColl+=Number(p.amount||0);});});
      const manualColl=(pos.collections?.manualCollections||[]).reduce((s,r)=>s+Number(r.amount||0),0);
      const totalColl=billingColl+manualColl;
      const lessTotal=exps.filter(e=>e.expDate===date).reduce((s,e)=>s+Number(e.amount||0),0);
      rows.push([date,
        pos.banks?.bpi?.beg||0,pos.banks?.bpi?.end||0,
        pos.banks?.metro?.beg||0,pos.banks?.metro?.end||0,
        pos.banks?.china?.beg||0,pos.banks?.china?.end||0,
        pos.banks?.bdo?.beg||0,pos.banks?.bdo?.end||0,
        pos.banks?.security?.beg||0,pos.banks?.security?.end||0,
        wc.toFixed(2),billingColl.toFixed(2),manualColl.toFixed(2),totalColl.toFixed(2),lessTotal.toFixed(2),(wc+totalColl-lessTotal).toFixed(2),
        pos.notes||""
      ]);
    });
    const csv=rows.map(r=>r.map(v=>(`"${String(v).replace(/"/g,'""')}"`)).join(",")).join("\n");
    const a=document.createElement("a");
    a.href="data:text/csv;charset=utf-8,"+encodeURIComponent("﻿"+csv);
    a.download=`GMD_CashPosition_${today}.csv`;
    a.click();
  };

  const inpStyle={
    textAlign:"right",border:"1.5px solid #e2e8f0",borderRadius:6,
    padding:"6px 10px",fontFamily:"inherit",fontSize:".85rem",
    color:"#0f172a",background:"#fff",width:"100%",boxSizing:"border-box",outline:"none"
  };
  const labelCell={
    padding:"8px 12px",borderBottom:"1px solid #e2e8f0",
    background:"#f8fafc",fontWeight:600,fontSize:".8rem",
    color:"#475569",fontStyle:"italic",borderRight:"2px solid #e2e8f0",
    whiteSpace:"nowrap",position:"sticky",left:0,zIndex:2
  };

  // Derived totals for new layout
  const wcBook=workingBanks.reduce((s,b)=>s+n((pos.banks||{})[b.id]?.book||0),0);
  const unionRow2=(pos.banks||{})["union"]||emptyBankRow();
  const unionCapital=n(unionRow2.book||0)||n(unionRow2.end||0)||n(unionRow2.beg||0);
  const netCashAvail=wcBook+totalCollections-totalLess;
  const totalGMDAssets=netCashAvail+unionCapital;

  // Column template: sticky label col + 5 bank cols + total col
  const COL=mob?"130px repeat(5,minmax(80px,1fr)) 100px":"200px repeat(5,1fr) 130px";

  return(
    <div>
      <style>{`
        .cash-inp:focus{border-color:#1d4ed8!important;box-shadow:0 0 0 3px rgba(29,78,216,.1);}
        .bank-header{background:#1e293b;color:#fff;padding:10px 12px;font-weight:700;font-size:.78rem;text-align:center;border-right:1px solid #334155;}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        .bank-btn{padding:4px 9px;border-radius:6px;border:1.5px solid #e2e8f0;background:#fff;font-size:.7rem;font-weight:700;cursor:pointer;font-family:inherit;transition:background .15s,color .15s;}
        .bank-btn:hover{filter:brightness(.85);}
      `}</style>

      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:12}}>
        <div>
          <h2 style={{margin:0,fontWeight:800,color:"#0f172a",fontSize:"1.2rem"}}>Daily Cash Position</h2>
          <div style={{fontSize:".78rem",color:"#64748b",marginTop:3}}>GMD Productions Inc. — Finance Summary</div>
        </div>
        <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
          {/* Export button */}
          <button onClick={exportDCPCSV}
            style={{background:"#eff6ff",border:"1.5px solid #bfdbfe",borderRadius:8,padding:"7px 14px",fontFamily:"inherit",fontSize:".78rem",fontWeight:700,color:"#1d4ed8",cursor:"pointer"}}>
            ⬇ Export CSV
          </button>
          {/* Date picker */}
          <input type="date" value={selDate} onChange={e=>switchDate(e.target.value)}
            style={{border:"1.5px solid #e2e8f0",borderRadius:8,padding:"8px 12px",fontFamily:"inherit",fontSize:".85rem",color:"#0f172a",cursor:"pointer"}}/>
          {/* History */}
          <button onClick={()=>setHistOpen(h=>!h)} style={{background:"#f8fafc",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"8px 14px",fontFamily:"inherit",fontSize:".8rem",color:"#64748b",cursor:"pointer",fontWeight:600}}>
            📅 History ({histDates.length})
          </button>
          {/* Save */}
          <button onClick={handleSave} style={{background:saved?"#f0fdf4":"#1e293b",border:`1.5px solid ${saved?"#6ee7b7":"#1e293b"}`,borderRadius:8,padding:"8px 18px",fontFamily:"inherit",fontSize:".84rem",color:saved?"#059669":"#fff",cursor:"pointer",fontWeight:700,transition:"all .2s"}}>
            {saved?"✓ Saved":"Save Position"}
          </button>
        </div>
      </div>

      {/* History dropdown */}
      {histOpen&&histDates.length>0&&(
        <div style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:12,padding:16,marginBottom:16,animation:"fadeIn .2s"}}>
          <div style={{fontWeight:700,color:"#0f172a",marginBottom:10,fontSize:".88rem"}}>Saved Positions</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {histDates.map(d=>(
              <button key={d} onClick={()=>{switchDate(d);setHistOpen(false);}}
                style={{padding:"5px 12px",borderRadius:20,border:`1.5px solid ${d===selDate?"#1e293b":"#e2e8f0"}`,background:d===selDate?"#1e293b":"#fff",color:d===selDate?"#fff":"#64748b",fontFamily:"inherit",fontSize:".78rem",cursor:"pointer",fontWeight:d===selDate?700:400}}>
                {d}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* KPI strip — Row 1: Cash */}
      <div style={{display:"grid",gridTemplateColumns:mob?"1fr 1fr":"repeat(4,1fr)",gap:10,marginBottom:10}}>
        {[
          {l:"Net Cash Available",   v:"₱"+fmt2(netCashAvail),   c:netCashAvail>=0?"#059669":"#ef4444", sub:"Working capital banks"},
          {l:"Working Capital Book", v:"₱"+fmt2(wcBook),         c:"#1d4ed8",                           sub:"BPI·Metro·China·BDO·Security"},
          {l:"Collections Today",   v:"₱"+fmt2(totalCollections),c:"#10b981",                           sub:selDate},
          {l:"Outstanding Invoices",v:"₱"+billingMetrics.outstanding.toLocaleString("en-PH",{minimumFractionDigits:2}),c:billingMetrics.outstanding>0?"#f59e0b":"#059669",sub:"Pending AR"},
        ].map(({l,v,c,sub})=>(
          <div key={l} style={{background:"#fff",borderRadius:12,padding:"14px 16px",border:"1.5px solid #e2e8f0",boxShadow:"0 1px 4px rgba(0,0,0,.04)"}}>
            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.25rem",color:c,lineHeight:1}}>{v}</div>
            <div style={{fontSize:".63rem",textTransform:"uppercase",letterSpacing:"1px",color:"#94a3b8",marginTop:5}}>{l}</div>
            <div style={{fontSize:".62rem",color:"#cbd5e1",marginTop:2}}>{sub}</div>
          </div>
        ))}
      </div>

      {/* KPI strip — Row 2: Obligations & Assets */}
      <div style={{display:"grid",gridTemplateColumns:mob?"1fr 1fr":"repeat(4,1fr)",gap:10,marginBottom:20}}>
        {[
          {l:"Floating Checks",      v:"₱"+floatingTotal.toLocaleString("en-PH",{minimumFractionDigits:2}),           c:floatingTotal>0?"#b45309":"#059669",       sub:floatingChecks.length+" released, not cleared"},
          {l:"Total Loan Balance",   v:"₱"+loanMetrics.totalBalance.toLocaleString("en-PH",{minimumFractionDigits:2}),c:loanMetrics.totalBalance>0?"#7c3aed":"#059669",sub:loanMetrics.loanRows.length+" active loan"+( loanMetrics.loanRows.length!==1?"s":"")},
          {l:"Inventory Asset Value",v:"₱"+inventoryValue.toLocaleString("en-PH",{minimumFractionDigits:2}),           c:"#0e7490",                                  sub:"On-hand stock at avg cost"},
          {l:"Payables Overdue",     v:"₱"+payablesMetrics.overdue.toLocaleString("en-PH",{minimumFractionDigits:2}), c:payablesMetrics.overdue>0?"#ef4444":"#059669",sub:payablesMetrics.overdueList.length+" bills past due"},
        ].map(({l,v,c,sub})=>(
          <div key={l} style={{background:"#fff",borderRadius:12,padding:"14px 16px",border:"1.5px solid #e2e8f0",boxShadow:"0 1px 4px rgba(0,0,0,.04)"}}>
            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.25rem",color:c,lineHeight:1}}>{v}</div>
            <div style={{fontSize:".63rem",textTransform:"uppercase",letterSpacing:"1px",color:"#94a3b8",marginTop:5}}>{l}</div>
            <div style={{fontSize:".62rem",color:"#cbd5e1",marginTop:2}}>{sub}</div>
          </div>
        ))}
      </div>

      {/* HIDDEN — legacy KPI strip kept for reference; replaced by rows above */}
      {false&&[
          ["Net Cash Available (WC)", "₱"+fmt2(netCashAvail), netCashAvail>=0?"#059669":"#ef4444"],
          ["Working Capital (Book)",  "₱"+fmt2(wcBook), "#1d4ed8"],
          ["Total GMD Cash Assets",   "₱"+fmt2(totalGMDAssets), "#0e7490"],
          ["Collections Today",       "₱"+fmt2(totalCollections), "#10b981"],
          ["Outstanding Invoices",    "₱"+billingMetrics.outstanding.toLocaleString("en-PH",{minimumFractionDigits:2}), billingMetrics.outstanding>0?"#f59e0b":"#059669"],
          ["YTD Collected",           "₱"+billingMetrics.collectedYTD.toLocaleString("en-PH",{minimumFractionDigits:2}), "#8b5cf6"],
        ].map(([l,v,c])=>(
          <div key={l} style={{background:"#fff",borderRadius:12,padding:"14px 16px",border:"1.5px solid #e2e8f0",boxShadow:"0 1px 4px rgba(0,0,0,.04)"}}>
            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.3rem",color:c,lineHeight:1}}>{v}</div>
            <div style={{fontSize:".63rem",textTransform:"uppercase",letterSpacing:"1px",color:"#94a3b8",marginTop:6}}>{l}</div>
          </div>
        ))}

      {/* 30-Day Working Capital Trend */}
      {histDates.length>1&&(()=>{
        const trendPts=Object.keys(cashPositions).sort().slice(-30).map(d=>{
          const c=cashPositions[d];
          const wc=['bpi','metro','china','bdo','security'].reduce((s,bk)=>{
            const row=c.banks?.[bk]||{};return s+(Number(row.book)||Number(row.end)||0);
          },0);
          return{d,wc};
        });
        if(trendPts.length<2) return null;
        const vals=trendPts.map(p=>p.wc);
        const minV=Math.min(...vals);const maxV=Math.max(...vals);const range=maxV-minV||1;
        const W=600,H=56,pad=4;
        const pts=trendPts.map((p,i)=>{
          const x=pad+(i/(trendPts.length-1))*(W-pad*2);
          const y=pad+(1-(p.wc-minV)/range)*(H-pad*2);
          return`${x},${y}`;
        }).join(" ");
        const last=trendPts[trendPts.length-1];
        const prev=trendPts[trendPts.length-2];
        const trend=last.wc>=prev.wc?"▲":"▼";
        const trendClr=last.wc>=prev.wc?"#059669":"#ef4444";
        return(
          <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",padding:"12px 16px",marginBottom:16,display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
            <div style={{flexShrink:0}}>
              <div style={{fontSize:".65rem",textTransform:"uppercase",letterSpacing:"1px",color:"#94a3b8",marginBottom:2}}>30-Day Working Capital Trend</div>
              <div style={{fontSize:".82rem",fontWeight:700,color:trendClr}}>{trend} ₱{last.wc.toLocaleString("en-PH",{minimumFractionDigits:0,maximumFractionDigits:0})}</div>
            </div>
            <div style={{flex:1,minWidth:200,overflow:"hidden"}}>
              <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:48,display:"block"}} preserveAspectRatio="none">
                <defs>
                  <linearGradient id="wcGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1d4ed8" stopOpacity=".15"/>
                    <stop offset="100%" stopColor="#1d4ed8" stopOpacity="0"/>
                  </linearGradient>
                </defs>
                <polygon points={`${pad},${H} ${pts} ${W-pad},${H}`} fill="url(#wcGrad)"/>
                <polyline points={pts} fill="none" stroke="#1d4ed8" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round"/>
                {trendPts.map((p,i)=>{
                  const x=pad+(i/(trendPts.length-1))*(W-pad*2);
                  const y=pad+(1-(p.wc-minV)/range)*(H-pad*2);
                  return p.d===selDate?<circle key={i} cx={x} cy={y} r="4" fill="#1d4ed8" stroke="#fff" strokeWidth="1.5"/>:null;
                })}
              </svg>
            </div>
            <div style={{flexShrink:0,textAlign:"right"}}>
              <div style={{fontSize:".65rem",color:"#94a3b8"}}>Low</div>
              <div style={{fontWeight:700,color:"#64748b",fontSize:".75rem"}}>₱{minV.toLocaleString("en-PH",{maximumFractionDigits:0})}</div>
              <div style={{fontSize:".65rem",color:"#94a3b8",marginTop:4}}>High</div>
              <div style={{fontWeight:700,color:"#1d4ed8",fontSize:".75rem"}}>₱{maxV.toLocaleString("en-PH",{maximumFractionDigits:0})}</div>
            </div>
          </div>
        );
      })()}

      {/* ── THIS WEEK AT A GLANCE ── */}
      <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr",gap:12,marginBottom:16}}>
        {/* Expected Collections */}
        <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",overflow:"hidden"}}>
          <div style={{background:"#059669",padding:"10px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontWeight:800,color:"#fff",fontSize:".82rem"}}>📥 Expected Collections This Week</span>
            <span style={{fontWeight:800,color:"#a7f3d0",fontSize:".85rem"}}>₱{thisWeek.collTotal.toLocaleString("en-PH",{maximumFractionDigits:0})}</span>
          </div>
          {thisWeek.collections.length===0
            ? <div style={{padding:"16px",color:"#94a3b8",fontSize:".8rem",textAlign:"center"}}>No billing milestones due in the next 7 days</div>
            : thisWeek.collections.map((r,i)=>(
              <div key={r.id} style={{display:"grid",gridTemplateColumns:"1fr auto auto",gap:8,padding:"8px 14px",borderBottom:i<thisWeek.collections.length-1?"1px solid #f1f5f9":"none",alignItems:"center"}}>
                <div style={{minWidth:0}}>
                  <div style={{fontWeight:600,color:"#0f172a",fontSize:".78rem",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.client}</div>
                  <div style={{fontSize:".65rem",color:"#94a3b8",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.name}</div>
                </div>
                <div style={{fontSize:".68rem",color:"#64748b",whiteSpace:"nowrap"}}>{r.dueDate}</div>
                <div style={{fontWeight:700,color:"#059669",fontSize:".78rem",whiteSpace:"nowrap"}}>₱{r.balance.toLocaleString("en-PH",{maximumFractionDigits:0})}</div>
              </div>
            ))
          }
        </div>
        {/* Expected Expenses */}
        <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",overflow:"hidden"}}>
          <div style={{background:"#dc2626",padding:"10px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontWeight:800,color:"#fff",fontSize:".82rem"}}>📤 Expected Expenses This Week</span>
            <span style={{fontWeight:800,color:"#fca5a5",fontSize:".85rem"}}>₱{(thisWeek.expTotal+loanMetrics.monthlyPaymentTotal).toLocaleString("en-PH",{maximumFractionDigits:0})}</span>
          </div>
          {/* Loan payments always shown first */}
          {loanMetrics.loanRows.map(l=>(
            <div key={l.id} style={{display:"grid",gridTemplateColumns:"1fr auto auto",gap:8,padding:"8px 14px",borderBottom:"1px solid #f1f5f9",alignItems:"center"}}>
              <div style={{minWidth:0}}>
                <div style={{fontWeight:600,color:"#0f172a",fontSize:".78rem",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{l.lender}</div>
                <div style={{fontSize:".65rem",color:"#94a3b8"}}>Monthly loan payment</div>
              </div>
              <div style={{fontSize:".68rem",color:"#7c3aed",fontWeight:600,whiteSpace:"nowrap"}}>Loan</div>
              <div style={{fontWeight:700,color:"#dc2626",fontSize:".78rem",whiteSpace:"nowrap"}}>₱{Number(l.monthly||0).toLocaleString("en-PH",{maximumFractionDigits:0})}</div>
            </div>
          ))}
          {thisWeek.expenses.length===0&&loanMetrics.loanRows.length===0
            ? <div style={{padding:"16px",color:"#94a3b8",fontSize:".8rem",textAlign:"center"}}>No payables due in the next 7 days</div>
            : thisWeek.expenses.map((p,i)=>(
              <div key={p.id} style={{display:"grid",gridTemplateColumns:"1fr auto auto",gap:8,padding:"8px 14px",borderBottom:i<thisWeek.expenses.length-1?"1px solid #f1f5f9":"none",alignItems:"center"}}>
                <div style={{minWidth:0}}>
                  <div style={{fontWeight:600,color:"#0f172a",fontSize:".78rem",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.vendor||p.category||"Payable"}</div>
                  <div style={{fontSize:".65rem",color:"#94a3b8"}}>{p.category||""}{p.invoiceRef?" · "+p.invoiceRef:""}</div>
                </div>
                <div style={{fontSize:".68rem",color:"#64748b",whiteSpace:"nowrap"}}>{p.dueDate}</div>
                <div style={{fontWeight:700,color:"#dc2626",fontSize:".78rem",whiteSpace:"nowrap"}}>₱{Number(p.amount||0).toLocaleString("en-PH",{maximumFractionDigits:0})}</div>
              </div>
            ))
          }
        </div>
      </div>

      {/* ── MAIN BANK TABLE (Excel-style vertical flow, banks as columns) ── */}
      <div style={{borderRadius:14,border:"1.5px solid #e2e8f0",marginBottom:16,boxShadow:"0 1px 6px rgba(0,0,0,.05)",overflow:"hidden"}}>
      <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
      {/* ─── TABLE INNER ─── */}
      <div style={{background:"#fff",minWidth:mob?680:undefined}}>
        {(()=>{
          const assignBank=(paymentId,bankId,msId)=>{
            const ms=billings.find(b=>(b.payments||[]).some(px=>px.id===paymentId));
            if(ms&&updateMilestone)
              updateMilestone(ms.id,{payments:(ms.payments||[]).map(px=>px.id===paymentId?{...px,bank:bankId}:px)});
            const cur=pos.collections?.approvedPayments||[];
            const newApproved=cur.includes(paymentId)?cur:[...cur,paymentId];
            const newPos={...pos,collections:{...pos.collections,approvedPayments:newApproved}};
            setPos(newPos);
            setSaved(false);
            saveDayPos(selDate,newPos);
          };
          const assignExpBank=(expId,bankId)=>{
            const exp=dateExps.find(e=>e.id===expId);
            upExps(es=>es.map(e=>e.id===expId?{...e,bankAccount:bankId}:e));
            if(exp&&isSupabaseReady&&isSupabaseReady()&&sbUpsert&&toSbExpense)
              sbUpsert("expenses",toSbExpense({...exp,bankAccount:bankId}),"id").catch(()=>{});
          };
          const bankBtn=(label,onClick)=>(
            <button onClick={onClick} style={{background:"#fff",border:"1.5px solid #fcd34d",borderRadius:6,padding:"3px 8px",fontSize:".7rem",fontWeight:700,color:"#0f172a",cursor:"pointer",fontFamily:"inherit"}}>{label}</button>
          );
          return(<>
            {/* ── HEADER ROW ── */}
            <div style={{display:"grid",gridTemplateColumns:COL,background:"#1e293b"}}>
              <div style={{padding:"12px 14px",color:"rgba(255,255,255,.55)",fontSize:".72rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"1px",borderRight:"1px solid #334155",position:"sticky",left:0,zIndex:3,background:"#1e293b"}}>CATEGORY</div>
              {workingBanks.map(b=>(
                <div key={b.id} style={{padding:"10px 8px",textAlign:"center",borderRight:"1px solid #334155"}}>
                  <div style={{fontWeight:800,color:"#fff",fontSize:".78rem"}}>{b.short}</div>
                  <div style={{fontSize:".6rem",color:"rgba(255,255,255,.4)",marginTop:1}}>{b.name.length>14?b.name.slice(0,13)+"…":b.name}</div>
                </div>
              ))}
              <div style={{padding:"12px 8px",textAlign:"center",color:"#f59e0b",fontWeight:800,fontSize:".78rem"}}>TOTAL</div>
            </div>

            {/* ── 1. BANK BEGINNING BALANCE ── */}
            <div style={{display:"grid",gridTemplateColumns:COL,borderBottom:"1px solid #e2e8f0",background:"#fafafa"}}>
              <div style={labelCell}>🏦 Bank Beginning Balance</div>
              {workingBanks.map(b=>(
                <div key={b.id} style={{padding:"4px 6px",borderRight:"1px solid #f1f5f9",display:"flex",alignItems:"center"}}>
                  <CurrInp value={pos.banks[b.id]?.beg||""} onChange={e=>f(`banks.${b.id}.beg`,e.target.value)} style={{...inpStyle,borderColor:"transparent",background:"transparent",textAlign:"right",padding:"5px 8px"}}/>
                </div>
              ))}
              <div style={{padding:"8px 12px",textAlign:"right",fontWeight:700,fontSize:".84rem",color:"#0f172a",display:"flex",alignItems:"center",justifyContent:"flex-end"}}>
                {fmt2(workingBanks.reduce((s,b)=>s+n(pos.banks[b.id]?.beg||0),0))}
              </div>
            </div>

            {/* ── 2. CASH IN section header ── */}
            <div style={{display:"grid",gridTemplateColumns:COL,borderBottom:"1px solid #d1fae5",background:"#f0fdf4",borderTop:"2px solid #6ee7b7"}}>
              <div style={{...labelCell,background:"#dcfce7",color:"#059669",fontWeight:700,fontStyle:"normal",fontSize:".78rem"}}>💚 CASH IN</div>
              <div style={{gridColumn:"2/7",padding:"7px 12px",display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                <span style={{fontSize:".72rem",color:"#059669",fontWeight:600}}>Manual entries</span>
              </div>
              <div style={{padding:"7px 12px",textAlign:"right",fontWeight:800,color:"#059669",fontSize:".85rem",display:"flex",alignItems:"center",justifyContent:"flex-end"}}>{fmt2(totalCollections)}</div>
            </div>

            {/* ── 2b. Collections (manual) ── */}
            <div style={{background:"#f8fffe"}}>
              <div style={{display:"grid",gridTemplateColumns:COL,borderBottom:"1px solid #d1fae5"}}>
                <div style={{...labelCell,background:"#faf5ff",color:"#8b5cf6",fontStyle:"normal",fontSize:".73rem",paddingLeft:24}}>Collections</div>
                {workingBanks.map(b=>{
                  const amt=(pos.collections?.manualCollections||[]).filter(r=>r.bank===b.id).reduce((s,r)=>s+Number(r.amount||0),0);
                  return(<div key={b.id} style={{padding:"5px 8px",borderRight:"1px solid #d1fae5",textAlign:"right",fontSize:".75rem",fontWeight:amt>0?700:400,color:amt>0?"#8b5cf6":"#cbd5e1"}}>{amt>0?fmt2(amt):"—"}</div>);
                })}
                <div style={{padding:"5px 12px",textAlign:"right",fontWeight:700,color:"#8b5cf6",fontSize:".78rem",display:"flex",alignItems:"center",justifyContent:"flex-end"}}>
                  {fmt2((pos.collections?.manualCollections||[]).reduce((s,r)=>s+Number(r.amount||0),0))}
                </div>
              </div>
              {(pos.collections?.manualCollections||[]).map((row,ri)=>(
                <div key={row.id||ri} style={{display:"grid",gridTemplateColumns:COL,borderBottom:"1px solid #f0f0f0",background:"#fff"}}>
                  <div style={{...labelCell,background:"#faf5ff",fontStyle:"normal",fontSize:".72rem",paddingLeft:32,display:"flex",alignItems:"center",gap:4}}>
                    <button onClick={()=>f("collections.manualCollections",(pos.collections.manualCollections||[]).filter((_,j)=>j!==ri))}
                      style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:4,padding:"1px 6px",cursor:"pointer",color:"#dc2626",fontWeight:700,fontSize:".7rem",fontFamily:"inherit",flexShrink:0}}>✕</button>
                    <select value={row.projectId||""} onChange={e=>{const mc=[...(pos.collections.manualCollections||[])];const d=wonDeals.find(x=>x.id===e.target.value);mc[ri]={...mc[ri],projectId:e.target.value,note:d?(d.contact||d.client)+(d.ceNo?" — "+d.ceNo:""):mc[ri].note||""};f("collections.manualCollections",mc);}}
                      style={{...inpStyle,textAlign:"left",borderColor:"#e9d5ff",fontSize:".72rem",padding:"3px 7px",flex:1,minWidth:0,maxWidth:160}}>
                      <option value="">Select project…</option>
                      {wonDeals.filter(d=>d.stage!=="12 · Close-Out"&&d.stage!=="14 · Completed").map(d=><option key={d.id} value={d.id}>{d.contact||d.client}{d.ceNo?" · "+d.ceNo:""}</option>)}
                    </select>
                    <input type="text" value={row.note||""} onChange={e=>{const mc=[...(pos.collections.manualCollections||[])];mc[ri]={...mc[ri],note:e.target.value};f("collections.manualCollections",mc);}}
                      placeholder="Type / ref…" style={{...inpStyle,textAlign:"left",borderColor:"#e9d5ff",fontSize:".72rem",padding:"3px 7px",minWidth:0,width:80}}/>
                  </div>
                  <div style={{gridColumn:"2/7",padding:"5px 10px",display:"flex",gap:6,alignItems:"center"}}>
                    <select value={row.bank||""} onChange={e=>{const mc=[...(pos.collections.manualCollections||[])];mc[ri]={...mc[ri],bank:e.target.value};f("collections.manualCollections",mc);}}
                      style={{...inpStyle,width:110,textAlign:"left",borderColor:"#e9d5ff",paddingRight:4,fontSize:".75rem"}}>
                      <option value="">Bank…</option>
                      {BANKS.map(b=><option key={b.id} value={b.id}>{b.short}</option>)}
                    </select>
                    {!row.bank&&row.amount&&<span style={{fontSize:".68rem",color:"#dc2626",fontWeight:600}}>⚠ Assign bank</span>}
                  </div>
                  <div style={{padding:"5px 8px",display:"flex",alignItems:"center",justifyContent:"flex-end"}}>
                    <CurrInp value={row.amount||""} onChange={e=>{const mc=[...(pos.collections.manualCollections||[])];mc[ri]={...mc[ri],amount:e.target.value};f("collections.manualCollections",mc);}}
                      style={{...inpStyle,width:110,borderColor:"#e9d5ff"}}/>
                  </div>
                </div>
              ))}
              <div style={{borderTop:"1px dashed #e9d5ff",padding:"6px 12px 6px 212px"}}>
                <button onClick={()=>{const mc=[...(pos.collections?.manualCollections||[]),{id:uid(),projectId:"",note:"",bank:"",amount:""}];f("collections.manualCollections",mc);}}
                  style={{background:"#faf5ff",border:"1.5px dashed #c4b5fd",borderRadius:8,padding:"4px 14px",fontFamily:"inherit",fontSize:".75rem",fontWeight:700,color:"#7c3aed",cursor:"pointer"}}>+ Add collection</button>
              </div>
            </div>

            {/* ── 3. TOTAL MONEY (computed: beg + cashIn) ── */}
            <div style={{display:"grid",gridTemplateColumns:COL,borderTop:"2px solid #334155",borderBottom:"2px solid #334155",background:"#0f172a"}}>
              <div style={{...labelCell,background:"#1e293b",color:"#f1f5f9",fontStyle:"normal",fontWeight:800,fontSize:".78rem"}}>📌 TOTAL MONEY <span style={{fontWeight:400,fontSize:".65rem",color:"rgba(255,255,255,.4)"}}>Beg + Cash In</span></div>
              {workingBanks.map(b=>(
                <div key={b.id} style={{padding:"9px 8px",borderRight:"1px solid #334155",textAlign:"right",fontWeight:700,color:"#f1f5f9",fontSize:".82rem"}}>
                  {fmt2(totalMoneyPerBank[b.id])}
                </div>
              ))}
              <div style={{padding:"9px 12px",textAlign:"right",fontWeight:800,color:"#f59e0b",fontSize:".88rem",display:"flex",alignItems:"center",justifyContent:"flex-end"}}>
                {fmt2(workingBanks.reduce((s,b)=>s+totalMoneyPerBank[b.id],0))}
              </div>
            </div>

            {/* ── 5. TODAY'S TRANSACTIONS — single summary row ── */}
            <div style={{display:"grid",gridTemplateColumns:COL,borderBottom:"1px solid #fee2e2",background:"#fff7f7",borderTop:"2px solid #f87171"}}>
              <div style={{...labelCell,background:"#fef2f2",color:"#dc2626",fontStyle:"normal",fontWeight:700,fontSize:".78rem"}}>
                📤 Today's Transactions
                <span style={{display:"block",fontSize:".65rem",color:"#94a3b8",fontWeight:400,marginTop:1}}>{dateExps.length} expense{dateExps.length!==1?"s":""} · Accounting</span>
              </div>
              {workingBanks.map(b=>{
                const bankTotal=dateExps.filter(e=>e.bankAccount===b.id).reduce((s,e)=>s+Number(e.amount||0),0);
                return(
                  <div key={b.id} style={{padding:"7px 8px",borderRight:"1px solid #f1f5f9",textAlign:"right",fontSize:".8rem",fontWeight:bankTotal>0?700:400,color:bankTotal>0?"#dc2626":"#cbd5e1"}}>
                    {bankTotal>0?`−${fmt2(bankTotal)}`:"—"}
                  </div>
                );
              })}
              <div style={{padding:"7px 12px",textAlign:"right",fontWeight:800,color:"#dc2626",fontSize:".85rem",display:"flex",alignItems:"center",justifyContent:"flex-end"}}>
                {totalLess>0?`−${fmt2(totalLess)}`:"—"}
              </div>
            </div>
            {dateExps.length===0?(
              <div style={{padding:"10px 16px",fontSize:".73rem",color:"#94a3b8",borderBottom:"1px solid #fee2e2",fontStyle:"italic"}}>No expenses for {selDate}.</div>
            ):(
              <div style={{display:"grid",gridTemplateColumns:COL,borderBottom:"1px solid #f1f5f9",background:"#fff"}}>
                <div style={{...labelCell,background:"#fff7f7",color:"#dc2626",fontStyle:"normal",fontSize:".73rem",paddingLeft:28}}>
                  <span style={{fontWeight:600}}>{dateExps.length} expense{dateExps.length!==1?"s":""}</span>
                  {untaggedExps.length>0&&<span style={{display:"block",fontSize:".62rem",color:"#b45309",fontWeight:700,marginTop:1}}>⚠ {untaggedExps.length} untagged</span>}
                </div>
                {workingBanks.map(b=>{
                  const bankTotal=dateExps.filter(e=>e.bankAccount===b.id).reduce((s,e)=>s+Number(e.amount||0),0);
                  return(
                    <div key={b.id} style={{padding:"7px 8px",borderRight:"1px solid #f1f5f9",textAlign:"right",fontSize:".8rem",fontWeight:bankTotal>0?700:400,color:bankTotal>0?"#dc2626":"#cbd5e1"}}>
                      {bankTotal>0?`−${fmt2(bankTotal)}`:"—"}
                    </div>
                  );
                })}
                <div style={{padding:"7px 12px",textAlign:"right",fontWeight:800,color:"#dc2626",fontSize:".82rem",display:"flex",alignItems:"center",justifyContent:"flex-end"}}>
                  {totalLess>0?`−${fmt2(totalLess)}`:"—"}
                </div>
              </div>
            )}

            {/* ── 6. BANK ENDING BALANCE (auto-computed) ── */}
            <div style={{display:"grid",gridTemplateColumns:COL,borderTop:"2px solid #6ee7b7",borderBottom:"1px solid #6ee7b7",background:"#f0fdf4"}}>
              <div style={{...labelCell,background:"#dcfce7",color:"#059669",fontStyle:"normal",fontWeight:800,fontSize:".78rem"}}>
                ✅ Bank Ending Balance
                <div style={{fontSize:".62rem",fontWeight:400,color:"#6ee7b7",marginTop:1}}>Auto: Total Money − Transactions</div>
                {untaggedExps.length>0&&<div style={{fontSize:".62rem",fontWeight:700,color:"#f59e0b",marginTop:1}}>⚠ partial</div>}
              </div>
              {workingBanks.map(b=>(
                <div key={b.id} style={{padding:"9px 8px",borderRight:"1px solid #bbf7d0",textAlign:"right",fontWeight:700,color:"#059669",fontSize:".82rem"}}>
                  {fmt2(endingBal[b.id])}
                </div>
              ))}
              <div style={{padding:"9px 12px",textAlign:"right",fontWeight:800,color:"#059669",fontSize:".88rem",display:"flex",alignItems:"center",justifyContent:"flex-end"}}>
                {fmt2(workingBanks.reduce((s,b)=>s+endingBal[b.id],0))}
              </div>
            </div>

            {/* ── 7. BOOK BALANCE (manual) ── */}
            <div style={{display:"grid",gridTemplateColumns:COL,borderBottom:"1px solid #fde68a",background:"#fffbeb",borderTop:"2px solid #fcd34d"}}>
              <div style={{...labelCell,background:"#fef9c3",color:"#92400e",fontStyle:"normal",fontSize:".78rem"}}>
                📒 Book Balance
                <div style={{fontSize:".62rem",fontWeight:400,color:"#92400e",marginTop:1}}>Manual — bank statement</div>
              </div>
              {workingBanks.map(b=>(
                <div key={b.id} style={{padding:"4px 6px",borderRight:"1px solid #fde68a",display:"flex",alignItems:"center"}}>
                  <CurrInp value={pos.banks[b.id]?.book||""} onChange={e=>f(`banks.${b.id}.book`,e.target.value)} style={{...inpStyle,borderColor:"transparent",background:"transparent",textAlign:"right",padding:"5px 8px"}}/>
                </div>
              ))}
              <div style={{padding:"8px 12px",textAlign:"right",fontWeight:700,fontSize:".84rem",color:"#b45309",display:"flex",alignItems:"center",justifyContent:"flex-end"}}>
                {fmt2(workingBanks.reduce((s,b)=>s+n(pos.banks[b.id]?.book||0),0))}
              </div>
            </div>
            {/* Variance row */}
            <div style={{display:"grid",gridTemplateColumns:COL,borderBottom:"2px solid #e2e8f0",background:"#fff"}}>
              <div style={{...labelCell,color:"#94a3b8",fontSize:".7rem"}}>Variance (Ending vs Book)</div>
              {workingBanks.map(b=>{
                const bk=n(pos.banks[b.id]?.book||0);
                const diff=bk>0?bk-endingBal[b.id]:null;
                return(
                  <div key={b.id} style={{padding:"5px 8px",borderRight:"1px solid #f1f5f9",textAlign:"right",fontSize:".75rem",fontWeight:diff!=null&&Math.abs(diff)>1?700:400,color:diff==null?"#94a3b8":Math.abs(diff)<1?"#059669":"#ef4444"}}>
                    {diff==null?"—":Math.abs(diff)<1?"✓":diff>0?`+${fmt2(diff)}`:fmt2(diff)}
                  </div>
                );
              })}
              <div style={{padding:"5px 12px",textAlign:"right",fontSize:".75rem",color:"#94a3b8"}}>—</div>
            </div>
          </>);
        })()}
      </div>
      </div>
      </div>

      {/* ── UNIONBANK — Save-Up Capital (same structure, teal card) ── */}
      {(()=>{
        const unionRow=pos.banks["union"]||emptyBankRow();
        const unionBook=n(unionRow.book||0)||n(unionRow.end||0)||n(unionRow.beg||0);
        return(
          <div style={{background:"#0e7490",borderRadius:14,marginBottom:16,overflow:"hidden",border:"2px solid #0891b2"}}>
            <div style={{padding:"12px 18px",display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:"1px solid rgba(255,255,255,.15)"}}>
              <div>
                <div style={{fontWeight:800,color:"#fff",fontSize:".9rem"}}>🏛 Save-Up Capital — Unionbank</div>
                <div style={{fontSize:".72rem",color:"rgba(255,255,255,.6)",marginTop:2}}>NOT part of GMD working capital · long-term savings only</div>
              </div>
              <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.5rem",color:"#67e8f9"}}>₱{unionBook.toLocaleString("en-PH",{minimumFractionDigits:2})}</div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:1,background:"rgba(0,0,0,.2)"}}>
              {[["Beginning Balance","beg",unionRow.beg],["Book Balance","book",unionRow.book],["Ending Balance","end",unionRow.end]].map(([lbl,key,val])=>(
                <div key={key} style={{background:"rgba(255,255,255,.08)",padding:"12px 16px"}}>
                  <div style={{fontSize:".65rem",color:"rgba(255,255,255,.5)",textTransform:"uppercase",letterSpacing:".8px",marginBottom:6}}>{lbl}</div>
                  <input type="number" value={val||""} onChange={e=>f(`banks.union.${key}`,e.target.value)}
                    style={{textAlign:"right",border:"1px solid rgba(255,255,255,.25)",borderRadius:6,padding:"6px 10px",background:"rgba(255,255,255,.1)",color:"#fff",fontFamily:"inherit",fontSize:".88rem",fontWeight:700,width:"100%",outline:"none",boxSizing:"border-box"}}/>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── CREDIT LINE TABLE — separate from main bank table, after Save-Up Capital ── */}
      <div style={{background:"#fff",borderRadius:14,border:"2px solid #a5b4fc",overflow:"hidden",marginBottom:16}}>
        {/* Header */}
        <div style={{background:"#4338ca",padding:"10px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontWeight:800,color:"#fff",fontSize:".88rem"}}>🏦 Credit Line / Standby Funds</div>
            <div style={{fontSize:".67rem",color:"rgba(255,255,255,.65)",marginTop:2}}>Borrowing capacity per bank — enter the approved credit limit</div>
          </div>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:"1.3rem",color:"#c7d2fe"}}>
            {fmt2(workingBanks.reduce((s,b)=>s+n(pos.banks[b.id]?.creditLine||0),0))}
          </div>
        </div>
        {/* Column headers */}
        <div style={{display:"grid",gridTemplateColumns:COL,background:"#e0e7ff",borderBottom:"1px solid #c7d2fe"}}>
          <div style={{padding:"6px 12px",fontWeight:700,fontSize:".72rem",color:"#4338ca",borderRight:"2px solid #c7d2fe"}}>Row</div>
          {workingBanks.map(b=>(
            <div key={b.id} style={{padding:"6px 10px",textAlign:"center",fontWeight:700,fontSize:".72rem",color:"#4338ca",borderRight:"1px solid #c7d2fe"}}>{b.short}</div>
          ))}
          <div style={{padding:"6px 10px",textAlign:"right",fontWeight:700,fontSize:".72rem",color:"#4338ca"}}>Total</div>
        </div>
        {/* Credit Line row — editable */}
        <div style={{display:"grid",gridTemplateColumns:COL,borderBottom:"1px solid #c7d2fe",background:"#eef2ff"}}>
          <div style={{padding:"8px 12px",fontWeight:700,fontSize:".78rem",color:"#4338ca",borderRight:"2px solid #c7d2fe",display:"flex",flexDirection:"column",justifyContent:"center"}}>
            Credit Line
            <span style={{fontWeight:400,fontSize:".62rem",color:"#6366f1",marginTop:1}}>Approved limit</span>
          </div>
          {workingBanks.map(b=>(
            <div key={b.id} style={{padding:"4px 6px",borderRight:"1px solid #c7d2fe",display:"flex",alignItems:"center"}}>
              <CurrInp value={pos.banks[b.id]?.creditLine||""} onChange={e=>f(`banks.${b.id}.creditLine`,e.target.value)} style={{...inpStyle,borderColor:"transparent",background:"transparent",textAlign:"right",padding:"5px 8px",color:"#4338ca"}}/>
            </div>
          ))}
          <div style={{padding:"8px 12px",textAlign:"right",fontWeight:700,fontSize:".84rem",color:"#4338ca",display:"flex",alignItems:"center",justifyContent:"flex-end"}}>
            {fmt2(workingBanks.reduce((s,b)=>s+n(pos.banks[b.id]?.creditLine||0),0))}
          </div>
        </div>
        {/* Available to Borrow = Credit Line − Book Balance */}
        <div style={{display:"grid",gridTemplateColumns:COL,background:"#f5f3ff"}}>
          <div style={{padding:"8px 12px",fontWeight:700,fontSize:".78rem",color:"#5b21b6",borderRight:"2px solid #c7d2fe",display:"flex",flexDirection:"column",justifyContent:"center"}}>
            Available to Borrow
            <span style={{fontWeight:400,fontSize:".62rem",color:"#7c3aed",marginTop:1}}>Credit Line − Book Balance</span>
          </div>
          {workingBanks.map(b=>{
            const credit=n(pos.banks[b.id]?.creditLine||0);
            const book=n(pos.banks[b.id]?.book||0)||n(endingBal[b.id]||0);
            const avail=credit>0?credit-book:null;
            return(
              <div key={b.id} style={{padding:"8px 8px",borderRight:"1px solid #ddd6fe",textAlign:"right",fontWeight:avail!=null?800:400,fontSize:".82rem",color:avail==null?"#cbd5e1":avail>=0?"#059669":"#dc2626",fontFamily:"'Barlow Condensed',sans-serif",display:"flex",alignItems:"center",justifyContent:"flex-end"}}>
                {avail==null?"—":avail>=0?fmt2(avail):`(${fmt2(Math.abs(avail))})`}
              </div>
            );
          })}
          {(()=>{
            const totalCredit=workingBanks.reduce((s,b)=>s+n(pos.banks[b.id]?.creditLine||0),0);
            const totalBook=workingBanks.reduce((s,b)=>s+(n(pos.banks[b.id]?.book||0)||n(endingBal[b.id]||0)),0);
            const totalAvail=totalCredit>0?totalCredit-totalBook:null;
            return(
              <div style={{padding:"8px 12px",textAlign:"right",fontWeight:800,fontSize:".88rem",color:totalAvail==null?"#94a3b8":totalAvail>=0?"#059669":"#dc2626",display:"flex",alignItems:"center",justifyContent:"flex-end",fontFamily:"'Barlow Condensed',sans-serif"}}>
                {totalAvail==null?"—":totalAvail>=0?fmt2(totalAvail):`(${fmt2(Math.abs(totalAvail))})`}
              </div>
            );
          })()}
        </div>
      </div>

      {/* ── POSITION SUMMARY + OBLIGATIONS — side by side ── */}
      <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr",gap:16,marginBottom:16,alignItems:"start"}}>

        {/* Left: Position Summary */}
        <div style={{background:"#fff",borderRadius:14,border:"1.5px solid #e2e8f0",overflow:"hidden"}}>
          <div style={{background:"#1e293b",padding:"12px 16px"}}>
            <span style={{fontWeight:700,color:"#f59e0b",fontSize:".88rem",textTransform:"uppercase",letterSpacing:".5px"}}>📊 Position Summary</span>
          </div>
          <div style={{padding:"0 20px"}}>
            {[
              ["Book Balance (Working Capital)",workingBook,"#1d4ed8","+"],
              ["Collections Today",totalCollections,"#059669","+"],
              ["Today's Transactions",totalLess,"#dc2626","−"],
            ].map(([label,val,color,sign])=>(
              <div key={label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"11px 0",borderBottom:"1px solid #f1f5f9"}}>
                <div style={{fontSize:".82rem",color:"#475569",fontWeight:600,display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,color,fontSize:"1.05rem",minWidth:18}}>{sign}</span>{label}
                </div>
                <div style={{fontWeight:700,color,fontSize:".88rem"}}>₱{fmt2(val)}</div>
              </div>
            ))}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0",borderBottom:"2px solid #e2e8f0"}}>
              <div style={{fontWeight:800,color:"#0f172a",fontSize:".85rem",textTransform:"uppercase",letterSpacing:".4px"}}>=  Net Cash Available</div>
              <div style={{fontWeight:900,color:totalCashAvailable>=0?"#059669":"#ef4444",fontSize:"1.25rem",fontFamily:"'Barlow Condensed',sans-serif"}}>₱{fmt2(totalCashAvailable)}</div>
            </div>
            {(()=>{
              const unionRow=pos.banks["union"]||emptyBankRow();
              const saveUp=n(unionRow.book||0)||n(unionRow.end||0)||n(unionRow.beg||0);
              const totalAssets=totalCashAvailable+saveUp;
              return(<>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid #f1f5f9"}}>
                  <div style={{fontSize:".82rem",color:"#475569",fontWeight:600,display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,color:"#0e7490",fontSize:"1.05rem",minWidth:18}}>+</span>Save-Up Capital (Unionbank)
                  </div>
                  <div style={{fontWeight:700,color:"#0e7490",fontSize:".88rem"}}>₱{fmt2(saveUp)}</div>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid #f1f5f9"}}>
                  <div style={{fontSize:".82rem",color:"#475569",fontWeight:600,display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,color:"#7c3aed",fontSize:"1.05rem",minWidth:18}}>−</span>Monthly Loan Payments
                  </div>
                  <div style={{fontWeight:700,color:"#7c3aed",fontSize:".88rem"}}>₱{fmt2(loanMetrics.monthlyPaymentTotal)}</div>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0"}}>
                  <div style={{fontWeight:800,color:"#0f172a",fontSize:".88rem",textTransform:"uppercase",letterSpacing:".4px"}}>=  Total GMD Cash Assets</div>
                  <div style={{fontWeight:900,color:"#0e7490",fontSize:"1.45rem",fontFamily:"'Barlow Condensed',sans-serif"}}>₱{fmt2(totalAssets)}</div>
                </div>
              </>);
            })()}
          </div>
        </div>

        {/* Right: Floating Checks + Accounts Payable + Loan Obligations stacked */}
        <div style={{display:"flex",flexDirection:"column",gap:12}}>

        {/* ── Floating Checks ── */}
        <div style={{background:"#fff",borderRadius:14,border:`1.5px solid ${floatingChecks.length===0?"#e2e8f0":"#fde68a"}`,overflow:"hidden"}}>
          <div style={{background:floatingChecks.length===0?"#f8fafc":"#fef9c3",borderBottom:`2px solid ${floatingChecks.length===0?"#e2e8f0":"#fde68a"}`,padding:"11px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontWeight:800,color:floatingChecks.length===0?"#94a3b8":"#92400e",fontSize:".82rem"}}>🏦 Floating Checks</div>
              <div style={{fontSize:".66rem",color:floatingChecks.length===0?"#cbd5e1":"#b45309",marginTop:1}}>{floatingChecks.length===0?"No checks issued from FabHub yet":"Released CVs not yet cleared"}</div>
            </div>
            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:"1.2rem",color:floatingChecks.length===0?"#cbd5e1":"#b45309"}}>
              {floatingChecks.length===0?"—":"₱"+floatingTotal.toLocaleString("en-PH",{minimumFractionDigits:2})}
            </div>
          </div>
          {floatingChecks.length===0?(
            <div style={{padding:"20px 16px",fontSize:".76rem",color:"#cbd5e1",textAlign:"center"}}>Checks issued via the Check Voucher module will appear here once released.</div>
          ):(
            <div style={{maxHeight:200,overflowY:"auto"}}>
              {floatingChecks.map(cv=>(
                <div key={cv.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 16px",borderBottom:"1px solid #fef3c7",gap:8}}>
                  <div style={{minWidth:0}}>
                    <div style={{fontWeight:700,color:"#0f172a",fontSize:".78rem"}}>{cv.payee||cv.cvNo||"CV"}</div>
                    <div style={{fontSize:".67rem",color:"#94a3b8"}}>
                      {cv.cvNo||""}{cv.checkNo?` · #${cv.checkNo}`:""}{cv.bank?` · ${cv.bank}`:""}
                    </div>
                  </div>
                  <span style={{fontWeight:700,color:"#b45309",fontSize:".8rem",flexShrink:0}}>
                    ₱{Number(cv.amount||0).toLocaleString("en-PH",{minimumFractionDigits:2})}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Payables Due ── */}
        <div style={{background:"#fff",borderRadius:14,border:"1.5px solid #fecaca",overflow:"hidden"}}>
          <div style={{background:"#fef2f2",borderBottom:"2px solid #fecaca",padding:"11px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontWeight:800,color:"#dc2626",fontSize:".82rem"}}>💳 Accounts Payable</div>
              <div style={{fontSize:".66rem",color:"#ef4444",marginTop:1}}>Overdue & upcoming obligations</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:"1.2rem",color:"#dc2626"}}>
                ₱{payablesMetrics.totalUnpaid.toLocaleString("en-PH",{minimumFractionDigits:2})}
              </div>
              <div style={{fontSize:".62rem",color:"#94a3b8"}}>total unpaid</div>
            </div>
          </div>
          {payables.filter(p=>!["Paid","Cancelled"].includes(p.status)).length===0?(
            <div style={{padding:"14px 16px",fontSize:".76rem",color:"#94a3b8",fontStyle:"italic"}}>No outstanding payables.</div>
          ):(
            <>
              {payablesMetrics.overdue>0&&(
                <div style={{padding:"7px 16px",background:"#fff5f5",borderBottom:"1px solid #fecaca",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:".73rem",fontWeight:700,color:"#dc2626"}}>🔴 Overdue ({payablesMetrics.overdueList.length})</span>
                  <span style={{fontWeight:800,color:"#dc2626",fontSize:".8rem"}}>₱{payablesMetrics.overdue.toLocaleString("en-PH",{minimumFractionDigits:2})}</span>
                </div>
              )}
              {payablesMetrics.due7>0&&(
                <div style={{padding:"7px 16px",background:"#fff7ed",borderBottom:"1px solid #fed7aa",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:".73rem",fontWeight:700,color:"#c2410c"}}>🟠 Due in 7 days</span>
                  <span style={{fontWeight:800,color:"#c2410c",fontSize:".8rem"}}>₱{payablesMetrics.due7.toLocaleString("en-PH",{minimumFractionDigits:2})}</span>
                </div>
              )}
              {payablesMetrics.due30>0&&(
                <div style={{padding:"7px 16px",background:"#fffbeb",borderBottom:"1px solid #fde68a",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:".73rem",fontWeight:700,color:"#92400e"}}>🟡 Due in 30 days</span>
                  <span style={{fontWeight:800,color:"#92400e",fontSize:".8rem"}}>₱{payablesMetrics.due30.toLocaleString("en-PH",{minimumFractionDigits:2})}</span>
                </div>
              )}
              <div style={{maxHeight:150,overflowY:"auto"}}>
                {[...payablesMetrics.overdueList,...payablesMetrics.upcoming].slice(0,8).map(p=>(
                  <div key={p.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 16px",borderBottom:"1px solid #fef2f2",gap:8}}>
                    <div style={{minWidth:0}}>
                      <div style={{fontWeight:600,color:"#0f172a",fontSize:".76rem",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.payee||p.description||"Payable"}</div>
                      <div style={{fontSize:".65rem",color:"#94a3b8"}}>{p.dueDate?new Date(p.dueDate).toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"2-digit"}):"No due date"}</div>
                    </div>
                    <span style={{fontWeight:700,color:p.dueDate&&p.dueDate<today?"#dc2626":"#64748b",fontSize:".78rem",flexShrink:0}}>
                      ₱{Number(p.amount||0).toLocaleString("en-PH",{minimumFractionDigits:2})}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* ── Loans & Monthly Payments ── */}
        <div style={{background:"#fff",borderRadius:14,border:"1.5px solid #e9d5ff",overflow:"hidden"}}>
          <div style={{background:"#faf5ff",borderBottom:"2px solid #e9d5ff",padding:"11px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontWeight:800,color:"#7c3aed",fontSize:".82rem"}}>🏛 Loan Obligations</div>
              <div style={{fontSize:".66rem",color:"#8b5cf6",marginTop:1}}>Outstanding principal & monthly payments</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:"1.2rem",color:"#7c3aed"}}>
                ₱{loanMetrics.totalBalance.toLocaleString("en-PH",{minimumFractionDigits:2})}
              </div>
              <div style={{fontSize:".62rem",color:"#94a3b8"}}>total balance</div>
            </div>
          </div>
          {loanMetrics.loanRows.length===0?(
            <div style={{padding:"14px 16px",fontSize:".76rem",color:"#94a3b8",fontStyle:"italic"}}>No active loans.</div>
          ):(
            <>
              <div style={{padding:"8px 16px",borderBottom:"1px solid #f3e8ff",display:"flex",justifyContent:"space-between",alignItems:"center",background:"#fdf4ff"}}>
                <span style={{fontSize:".73rem",fontWeight:700,color:"#6d28d9"}}>Monthly Payment Total</span>
                <span style={{fontWeight:800,color:"#7c3aed",fontSize:".82rem"}}>₱{loanMetrics.monthlyPaymentTotal.toLocaleString("en-PH",{minimumFractionDigits:2})}</span>
              </div>
              <div style={{maxHeight:170,overflowY:"auto"}}>
                {loanMetrics.loanRows.map(l=>{
                  const pct=Number(l.principal)>0?Math.min(100,Math.round((1-l.remainingBalance/Number(l.principal))*100)):0;
                  return(
                    <div key={l.id} style={{padding:"9px 16px",borderBottom:"1px solid #f3e8ff"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:5}}>
                        <div style={{minWidth:0}}>
                          <div style={{fontWeight:700,color:"#0f172a",fontSize:".77rem",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{l.lender||l.name||"Loan"}</div>
                          <div style={{fontSize:".65rem",color:"#94a3b8",marginTop:1}}>₱{Number(l.monthlyPayment||0).toLocaleString("en-PH",{minimumFractionDigits:0})}/mo · {Number(l.interestRate||0)}% p.a.</div>
                        </div>
                        <div style={{textAlign:"right",flexShrink:0,marginLeft:8}}>
                          <div style={{fontWeight:800,color:"#7c3aed",fontSize:".78rem"}}>₱{l.remainingBalance.toLocaleString("en-PH",{minimumFractionDigits:0})}</div>
                          <div style={{fontSize:".62rem",color:"#94a3b8"}}>{pct}% paid</div>
                        </div>
                      </div>
                      <div style={{height:3,background:"#f3e8ff",borderRadius:2,overflow:"hidden"}}>
                        <div style={{height:"100%",width:pct+"%",background:"#8b5cf6",borderRadius:2}}/>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        </div>{/* end right column */}
      </div>{/* end 2-col grid */}

      {/* ── AVAILABLE STANDBY FUNDS ── */}
      {(()=>{
        const standby=netCashAvail-floatingTotal-(payablesMetrics.overdue+payablesMetrics.due7)-loanMetrics.monthlyPaymentTotal;
        return(
          <div style={{background:standby>=0?"#f0fdf4":"#fef2f2",borderRadius:14,border:`2px solid ${standby>=0?"#6ee7b7":"#fca5a5"}`,padding:"16px 20px",marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
            <div>
              <div style={{fontWeight:800,color:standby>=0?"#047857":"#dc2626",fontSize:".92rem"}}>
                {standby>=0?"✅":"⚠️"} Available Standby Funds
              </div>
              <div style={{fontSize:".72rem",color:"#64748b",marginTop:4,lineHeight:1.5}}>
                Net Cash Available <span style={{color:"#1d4ed8"}}>₱{fmt2(netCashAvail)}</span>
                {" − "} Floating Checks <span style={{color:"#b45309"}}>₱{floatingTotal.toLocaleString("en-PH",{minimumFractionDigits:2})}</span>
                {" − "} Overdue+7d Payables <span style={{color:"#dc2626"}}>₱{(payablesMetrics.overdue+payablesMetrics.due7).toLocaleString("en-PH",{minimumFractionDigits:2})}</span>
                {" − "} Monthly Loans <span style={{color:"#7c3aed"}}>₱{loanMetrics.monthlyPaymentTotal.toLocaleString("en-PH",{minimumFractionDigits:2})}</span>
              </div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:"2rem",color:standby>=0?"#047857":"#dc2626",lineHeight:1}}>
                ₱{standby.toLocaleString("en-PH",{minimumFractionDigits:2})}
              </div>
              <div style={{fontSize:".63rem",color:"#94a3b8",marginTop:3,textTransform:"uppercase",letterSpacing:".8px"}}>Standby funds</div>
            </div>
          </div>
        );
      })()}

      {/* ── INVENTORY ASSETS ── */}
      {inventory.filter(i=>i.status!=="Inactive"&&Number(i.qtyOnHand||0)>0).length>0&&(
        <div style={{background:"#ecfeff",borderRadius:14,border:"1.5px solid #a5f3fc",padding:"14px 18px",marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontWeight:800,color:"#0e7490",fontSize:".82rem"}}>📦 Inventory Assets</div>
            <div style={{fontSize:".66rem",color:"#06b6d4",marginTop:2}}>On-hand stock at average cost</div>
          </div>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:"1.3rem",color:"#0e7490"}}>
            ₱{inventoryValue.toLocaleString("en-PH",{minimumFractionDigits:2})}
          </div>
        </div>
      )}

      {/* ── NOTES ── */}
      <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",padding:16,marginBottom:8}}>
        <div style={{fontWeight:700,color:"#475569",fontSize:".78rem",textTransform:"uppercase",letterSpacing:".8px",marginBottom:8}}>Notes for {selDate}</div>
        <textarea value={pos.notes||""} onChange={e=>f("notes",e.target.value)}
          placeholder="e.g. Transfer ₱500k BPI→BDO, incoming wire from client, pending cheque clearance…"
          rows={2}
          style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"10px 13px",fontFamily:"inherit",fontSize:".85rem",color:"#1e293b",resize:"vertical",outline:"none",boxSizing:"border-box"}}/>
      </div>
      {pos.savedAt&&<div style={{textAlign:"right",fontSize:".7rem",color:"#94a3b8",marginTop:6}}>Last saved: {new Date(pos.savedAt).toLocaleString("en-PH")}</div>}
    </div>
  );
}

export default DailyCashPosition;
