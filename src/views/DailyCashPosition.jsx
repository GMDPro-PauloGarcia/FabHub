import React,{useState,useMemo,useEffect,useRef} from "react";
import {today,uid,BANKS,emptyBankRow,emptyDayPosition} from "../shared";
import {paymentClearDate,isPaymentCleared,ymd} from "../core";

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
  exps=[],payables=[],vouchers=[],loans=[],inventory=[],onOpenBilling=null
}){
  const[selDate,setSelDate]=useState(today);
  const[saved,setSaved]    =useState(false);
  const[dirty,setDirty]    =useState(false);   // unsaved local edits on the current day
  const[histOpen,setHistOpen]=useState(false);
  const[hideAcct,setHideAcct]=useState(true);   // mask account numbers by default for screen-share/presentations
  const dirtyRef=useRef(false);                 // mirror of `dirty` readable inside the load effect
  const markDirty =()=>{dirtyRef.current=true; setDirty(true);};
  const clearDirty=()=>{dirtyRef.current=false;setDirty(false);};

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

  // ── Collections auto-fill: billing payments that CLEAR on the selected date ──
  const BILLING_BANK_MAP={BPI:"bpi",Metrobank:"metro",Chinabank:"china",BDO:"bdo","Security Bank":"security",Unionbank:"union"};
  const tagPayment=(p,b)=>{
    const normBank=BILLING_BANK_MAP[p.bank]||p.bank||"";
    const deal=wonDeals.find(d=>d.id===b.dealId)||{};
    return{id:p.id,bank:normBank,amount:Number(p.amount||0),
      particulars:(deal.client||deal.contact||b.name||"Collection"),milestone:b.name||"",method:p.method||"",source:"billing",
      dealId:b.dealId||deal.id||null,milestoneId:b.id||null};
  };
  const autoCollLive=useMemo(()=>{
    const out=[];
    (billings||[]).forEach(b=>{
      if(b.status==="Cancelled") return;
      (b.payments||[]).forEach(p=>{if(!p.bounced&&paymentClearDate(p)===selDate) out.push(tagPayment(p,b));});
    });
    return out;
  },[billings,selDate,wonDeals]);
  // A saved day freezes its auto rows in pos.snapshot so later edits to billing/expenses
  // can't silently rewrite a signed-off report. Unsaved days compute live; "Refresh from
  // live" (below) clears the snapshot to re-pull.
  const snapshot=pos.snapshot||null;
  const autoColl=snapshot?(snapshot.coll||[]):autoCollLive;

  const manualColl=pos.collections?.manualCollections||[];
  const collByBank=useMemo(()=>{
    const out={};BANKS.forEach(b=>out[b.id]=0);
    autoColl.forEach(r=>{if(r.bank&&out[r.bank]!=null) out[r.bank]+=n(r.amount);});
    manualColl.forEach(r=>{if(r.bank&&out[r.bank]!=null) out[r.bank]+=n(r.amount);});
    return out;
  },[autoColl,manualColl]);
  const collTotal=useMemo(()=>autoColl.reduce((s,r)=>s+n(r.amount),0)+manualColl.reduce((s,r)=>s+n(r.amount),0),[autoColl,manualColl]);

  // ── Disbursements: BizLink expenses (Bizlink col) + released cheque vouchers (Float col) ──
  // Declared before Ending/Book & the Executive Summary below — they consume these totals.
  const manualDisb=pos.disbursements?.manual||[];
  // BizLink outflows = paid, non-cheque expenses tagged to a bank. Prefer an exact expDate
  // match; expenses carrying only a month/year (e.g. bulk uploads with no day) attribute to
  // day 1 of that month so they surface once instead of vanishing from the report.
  const autoBizlinkLive=useMemo(()=>{
    const[selY,selM,selD]=selDate.split("-").map(Number);
    return (exps||[])
      .filter(e=>e.acctStatus==="Paid"&&e.paymentMethod!=="Check"&&e.bankAccount&&(
        ymd(e.expDate)===selDate || (!e.expDate&&e.month===selM-1&&(e.year==null||e.year===selY)&&selD===1)))
      .map(e=>({id:e.id,bank:e.bankAccount,payee:e.payee||e.supplier||"Expense",particulars:e.note||e.category||"",method:"BizLink",amount:Number(e.amount||0),ref:e.refNo||e.receipt||"",source:"expense"}));
  },[exps,selDate]);
  // A cheque is "floating" on selDate if released on/before it and not yet cleared by then
  const floatVouchers=useMemo(()=>(vouchers||[]).filter(v=>{
    const rel=v.releasedDate||(v.status==="Released"?(v.date||selDate):null);
    if(!rel||rel>selDate) return false;
    if(v.isCleared&&v.clearedDate&&v.clearedDate<=selDate) return false;
    return true;
  }),[vouchers,selDate]);
  const autoFloatLive=useMemo(()=>floatVouchers.map(v=>({id:v.id,bank:BILLING_BANK_MAP[v.bank]||v.bank||"",payee:v.payee||"Payee",particulars:(v.description||v.cvNo||"Cheque")+(v.checkNo?` · #${v.checkNo}`:""),method:"Cheque",amount:Number(v.amount||0),ref:v.cvNo||"",source:"voucher"})),[floatVouchers]);
  // Saved days use the frozen snapshot (see collections above); unsaved days compute live.
  const autoBizlink=snapshot?(snapshot.biz||[]):autoBizlinkLive;
  const autoFloat  =snapshot?(snapshot.flt||[]):autoFloatLive;

  // Auto per-bank totals from the recorded expenses / cheque vouchers (+ manual disbursement rows)
  const bizAutoByBank=useMemo(()=>{const o={};BANKS.forEach(b=>o[b.id]=0);autoBizlink.forEach(r=>{if(o[r.bank]!=null)o[r.bank]+=n(r.amount);});manualDisb.filter(r=>r.method!=="Cheque").forEach(r=>{if(o[r.bank]!=null)o[r.bank]+=n(r.amount);});return o;},[autoBizlink,manualDisb]);
  const fltAutoByBank=useMemo(()=>{const o={};BANKS.forEach(b=>o[b.id]=0);autoFloat.forEach(r=>{if(o[r.bank]!=null)o[r.bank]+=n(r.amount);});manualDisb.filter(r=>r.method==="Cheque").forEach(r=>{if(o[r.bank]!=null)o[r.bank]+=n(r.amount);});return o;},[autoFloat,manualDisb]);
  // Effective per-bank = manual override typed into the cell (pos.banks[id].bizlink/float) if set,
  // else the auto value. Everything downstream (Ending, Book, totals, standby) uses the effective.
  const hasOv=(v)=>v!==""&&v!=null;
  const bizlinkByBank={},floatByBank={};
  BANKS.forEach(b=>{const r=bankRow(b.id);
    bizlinkByBank[b.id]=hasOv(r.bizlink)?n(r.bizlink):(bizAutoByBank[b.id]||0);
    floatByBank[b.id]  =hasOv(r.float)  ?n(r.float)  :(fltAutoByBank[b.id]||0);
  });
  const bizlinkTotal=BANKS.reduce((s,b)=>s+bizlinkByBank[b.id],0);
  const floatingTotal=BANKS.reduce((s,b)=>s+floatByBank[b.id],0);

  // Recorded but not assigned to a bank — surfaced so the TOTAL row and per-bank columns reconcile
  const isUntagged=(r)=>!BANKS.some(b=>b.id===r.bank);
  const untaggedColl =[...autoColl,...manualColl].filter(isUntagged).reduce((s,r)=>s+n(r.amount),0);
  const untaggedBiz  =[...autoBizlink,...manualDisb.filter(r=>r.method!=="Cheque")].filter(isUntagged).reduce((s,r)=>s+n(r.amount),0);
  const untaggedFloat=[...autoFloat,...manualDisb.filter(r=>r.method==="Cheque")].filter(isUntagged).reduce((s,r)=>s+n(r.amount),0);
  const untaggedTotal=untaggedColl+untaggedBiz+untaggedFloat;

  // ── Ending Bank Balance & Book Balance — AUTO-COMPUTED per bank ──
  // Ending = Beginning + Collections − Bizlink (online transfers hit the bank; cheques still
  // float and don't reduce the bank balance yet). Book = Ending − Float Check (the books
  // already reflect released cheques before they clear). Both are derived, not typed.
  const endingByBank=useMemo(()=>{const o={};BANKS.forEach(b=>{o[b.id]=n(bankRow(b.id).beg)+(collByBank[b.id]||0)-(bizlinkByBank[b.id]||0);});return o;},[pos.banks,collByBank,bizlinkByBank]);
  const bookByBank  =useMemo(()=>{const o={};BANKS.forEach(b=>{o[b.id]=endingByBank[b.id]-(floatByBank[b.id]||0);});return o;},[endingByBank,floatByBank]);

  // ── Executive Summary (computed from Bank Account Detail) ──
  const opBeg  =sum(opBanks, b=>n(bankRow(b.id).beg));
  const opEnd  =sum(opBanks, b=>endingByBank[b.id]);
  const opBook =sum(opBanks, b=>bookByBank[b.id]);
  const netChange=opEnd-opBeg;
  const reserveBal=sum(resBanks, b=>endingByBank[b.id]);
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

  // ── Running memo balances (mirror the daily sheet's top-right block) ──
  // Running A/R = total outstanding receivables across all billing milestones.
  const runningAR=useMemo(()=>(billings||[]).filter(b=>b.status!=="Cancelled").reduce((s,b)=>{
    const paid=(b.payments||[]).reduce((a,p)=>a+Number(p.amount||0),0);
    return s+Math.max(0,Number(b.amount||0)-paid);
  },0),[billings]);

  // ── Bank Account Detail column totals ──
  const tot={
    beg:    sum(BANKS,b=>n(bankRow(b.id).beg)),
    coll:   collTotal,
    end:    sum(BANKS,b=>endingByBank[b.id]),
    book:   sum(BANKS,b=>bookByBank[b.id]),
    bizlink:bizlinkTotal,
    float:  floatingTotal,
  };

  // ── Cash-movement reconciliation (all true, no false flags) ──
  const netClearedOutflow=tot.beg+collTotal-tot.end;   // what actually left the banks today
  const recordedDisb=bizlinkTotal+floatingTotal;       // everything we recorded going out
  const inTransit=recordedDisb-netClearedOutflow;      // cheques/pending not yet reflected by the bank

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


  const handleSave=()=>{
    const at=new Date().toISOString();
    // Freeze the day's auto rows on first save so the report stays fixed even if the
    // underlying billing/expense records change later. Keep an existing snapshot as-is.
    const snap=pos.snapshot||{coll:autoCollLive,biz:autoBizlinkLive,flt:autoFloatLive,at};
    // Materialize the computed Ending & Book into the saved banks so the next day carries
    // the right beginning balance and CSV/history export the reconciled figures.
    const banksOut={};
    BANKS.forEach(b=>{banksOut[b.id]={...bankRow(b.id),end:String(endingByBank[b.id]),book:String(bookByBank[b.id])};});
    saveDayPos(selDate,{...pos,banks:banksOut,collections:{...pos.collections,total:collTotal},snapshot:snap,savedAt:at});
    setSaved(true);clearDirty();
  };
  // Discard the frozen snapshot and re-pull live data (marks the day unsaved so it can be re-saved)
  const refreshFromLive=()=>{ f("snapshot",null); };

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
      ["Running Payables",payablesMetrics.totalUnpaid.toFixed(2)],
      ["Running Loan Balance",outstandingLoan.toFixed(2)],
      ["Total Checks to be Cleared",floatingTotal.toFixed(2)],[],
      ["BANK ACCOUNT DETAIL"],
      ["Bank","Account No.","Branch","Type","Beginning Balance","Collections","Bizlink Transaction","Ending Bank Balance","Book Balance","Float Check"],
    ];
    BANKS.forEach(b=>{const r=bankRow(b.id);rows.push([b.name,b.acctNo,b.branch,b.type,n(r.beg).toFixed(2),(collByBank[b.id]||0).toFixed(2),(bizlinkByBank[b.id]||0).toFixed(2),endingByBank[b.id].toFixed(2),bookByBank[b.id].toFixed(2),(floatByBank[b.id]||0).toFixed(2)]);});
    rows.push(["TOTAL","","","",tot.beg.toFixed(2),tot.coll.toFixed(2),tot.bizlink.toFixed(2),tot.end.toFixed(2),tot.book.toFixed(2),tot.float.toFixed(2)]);
    rows.push([],["COLLECTIONS DETAIL (FOR THE DAY)"],["Bank","Particulars","Amount","Source"]);
    [...autoColl,...manualColl].forEach(r=>{const bk=BANKS.find(x=>x.id===r.bank);rows.push([bk?bk.name:"",r.particulars??r.note??"",n(r.amount).toFixed(2),r.source==="billing"?"Billing (auto)":"Manual"]);});
    rows.push(["TOTAL","",collTotal.toFixed(2),""]);
    rows.push([],["DISBURSEMENTS DETAIL (FOR THE DAY)"],["Bank","Payee / Particulars","Method","Amount","Source"]);
    [...autoBizlink,...autoFloat,...manualDisb].forEach(r=>{const bk=BANKS.find(x=>x.id===r.bank);rows.push([bk?bk.name:"",`${r.payee||""}${r.particulars?" · "+r.particulars:""}`,r.method||"BizLink",n(r.amount).toFixed(2),r.source==="expense"?"Expense (auto)":r.source==="voucher"?"Voucher (auto)":"Manual"]);});
    rows.push(["TOTAL","","",recordedDisb.toFixed(2),""]);
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

  // Bizlink / Float cell: auto-filled by default, click ✎ to type a manual override, ✕ to revert to auto
  const flowCell=(id,key,autoVal,clr)=>{
    const ov=bankRow(id)[key];
    const overridden=hasOv(ov);
    if(overridden) return(
      <td style={{...td,padding:2,background:"#fffbeb"}}>
        <div style={{display:"flex",alignItems:"center",gap:2}}>
          <CurrInp value={ov} onChange={e=>f(`banks.${id}.${key}`,e.target.value)} style={{textAlign:"right",fontSize:".8rem",padding:"5px 6px",color:clr,fontWeight:700}}/>
          <button title="Revert to auto" onClick={()=>f(`banks.${id}.${key}`,"")} style={{background:"none",border:"none",color:"#b45309",cursor:"pointer",fontSize:".72rem",padding:0,lineHeight:1}}>✕</button>
        </div>
      </td>
    );
    return(
      <td style={{...td,...numCell}}>
        <span style={{display:"inline-flex",alignItems:"center",gap:5,justifyContent:"flex-end",width:"100%"}}>
          <span style={{color:autoVal>0?clr:"#cbd5e1",fontWeight:autoVal>0?700:400}}>{autoVal>0?fmt2(autoVal):"—"}</span>
          <button title="Override this figure" onClick={()=>f(`banks.${id}.${key}`,String(autoVal||0))} className="ovr-edit" style={{background:"none",border:"none",color:"#cbd5e1",cursor:"pointer",fontSize:".72rem",padding:0,lineHeight:1}}>✎</button>
        </span>
      </td>
    );
  };

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
        .ovr-edit{opacity:0;transition:opacity .15s;}
        td:hover .ovr-edit{opacity:1;color:#1d4ed8!important;}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
      `}</style>

      {/* ── Toolbar ── */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:10}}>
        <div style={{fontSize:".78rem",color:"#64748b",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          <span>Daily Cash Position — Owners' Review report</span>
          {snapshot&&(
            <span style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:".7rem",fontWeight:700,color:"#475569",background:"#f1f5f9",border:"1px solid #cbd5e1",borderRadius:20,padding:"2px 8px"}}>
              🔒 Snapshot {snapshot.at?`· ${new Date(snapshot.at).toLocaleDateString("en-PH",{month:"short",day:"numeric"})}`:""}
              <button onClick={refreshFromLive} title="Discard snapshot and re-pull live billing/expense data" style={{background:"none",border:"none",padding:0,color:"#1d4ed8",fontWeight:700,fontSize:".7rem",cursor:"pointer",fontFamily:"inherit"}}>↻ Refresh</button>
            </span>
          )}
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
              {l:"Running Payables",v:payablesMetrics.totalUnpaid,c:"#dc2626",sub:"Unpaid payables"},
              {l:"Running Loan Balance",v:outstandingLoan,c:C.blue,sub:"Excl. from cash total"},
              {l:"Total Checks to be Cleared",v:floatingTotal,c:"#b45309",sub:"PDC / released, uncleared"},
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
              <tr>{["Bank",...(hideAcct?[]:["Account No.","Branch","Type"]),"Beginning Balance","Collections","Bizlink Transaction","Ending Bank Balance","Book Balance","Float Check"].map((h,i)=>(
                <th key={h} style={{...th,textAlign:i<(hideAcct?1:4)?"left":"center"}}>{h}</th>))}
              </tr>
            </thead>
            <tbody>
              {[{label:"Operating",banks:opBanks,clr:"#1d4ed8",bg:"#eff6ff"},{label:"Reserve",banks:resBanks,clr:"#7c3aed",bg:"#faf5ff"}].map(grp=>{
                const g={
                  beg:    sum(grp.banks,b=>n(bankRow(b.id).beg)),
                  coll:   grp.banks.reduce((s,b)=>s+(collByBank[b.id]||0),0),
                  end:    sum(grp.banks,b=>endingByBank[b.id]),
                  book:   sum(grp.banks,b=>bookByBank[b.id]),
                  bizlink:grp.banks.reduce((s,b)=>s+(bizlinkByBank[b.id]||0),0),
                  float:  grp.banks.reduce((s,b)=>s+(floatByBank[b.id]||0),0),
                };
                return(
                  <React.Fragment key={grp.label}>
                    <tr style={{background:grp.bg}}>
                      <td colSpan={hideAcct?7:10} style={{...td,fontWeight:800,color:grp.clr,fontSize:".68rem",letterSpacing:".6px",textTransform:"uppercase",padding:"5px 12px"}}>{grp.label} Accounts</td>
                    </tr>
                    {grp.banks.map((b,ri)=>{
                      const coll=collByBank[b.id]||0;
                      return(
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
                          <td style={{...td,...numCell,color:coll>0?C.blue:"#cbd5e1",fontWeight:coll>0?700:400}}>{coll>0?fmt2(coll):"—"}</td>
                          {flowCell(b.id,"bizlink",bizAutoByBank[b.id],"#b45309")}
                          <td style={{...td,...numCell,fontWeight:700,color:endingByBank[b.id]<0?"#dc2626":"#047857"}}>{fmt2(endingByBank[b.id])}</td>
                          <td style={{...td,...numCell,fontWeight:700,color:bookByBank[b.id]<0?"#dc2626":"#92400e"}}>{fmt2(bookByBank[b.id])}</td>
                          {flowCell(b.id,"float",fltAutoByBank[b.id],"#b45309")}
                        </tr>
                      );
                    })}
                    <tr style={{background:"#eef2f7"}}>
                      <td style={{...td,fontWeight:800,color:grp.clr}} colSpan={hideAcct?1:4}>{grp.label} Subtotal</td>
                      <td style={{...td,...numCell,fontWeight:800,color:"#0f172a"}}>{fmt2(g.beg)}</td>
                      <td style={{...td,...numCell,fontWeight:800,color:C.blue}}>{g.coll>0?fmt2(g.coll):"—"}</td>
                      <td style={{...td,...numCell,fontWeight:800,color:"#0f172a"}}>{g.bizlink>0?fmt2(g.bizlink):"—"}</td>
                      <td style={{...td,...numCell,fontWeight:800,color:"#047857"}}>{fmt2(g.end)}</td>
                      <td style={{...td,...numCell,fontWeight:800,color:"#92400e"}}>{fmt2(g.book)}</td>
                      <td style={{...td,...numCell,fontWeight:800,color:"#0f172a"}}>{g.float>0?fmt2(g.float):"—"}</td>
                    </tr>
                  </React.Fragment>
                );
              })}
              <tr style={{background:"#e8edf5",fontWeight:800}}>
                <td style={{...td,fontWeight:900,color:C.navy}} colSpan={hideAcct?1:4}>GRAND TOTAL — ALL ACCOUNTS</td>
                <td style={{...td,...numCell,fontWeight:900,color:"#0f172a"}}>{fmt2(tot.beg)}</td>
                <td style={{...td,...numCell,fontWeight:900,color:C.blue}}>{fmt2(tot.coll)}</td>
                <td style={{...td,...numCell,fontWeight:900,color:"#0f172a"}}>{tot.bizlink>0?fmt2(tot.bizlink):"—"}</td>
                <td style={{...td,...numCell,fontWeight:900,color:"#047857"}}>{fmt2(tot.end)}</td>
                <td style={{...td,...numCell,fontWeight:900,color:"#0f172a"}}>{fmt2(tot.book)}</td>
                <td style={{...td,...numCell,fontWeight:900,color:"#0f172a"}}>{tot.float>0?fmt2(tot.float):"—"}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{padding:"6px 14px 12px",fontSize:".68rem",color:"#94a3b8",fontStyle:"italic",lineHeight:1.5}}>
          <b>Beginning Balance</b> is entered (carries from the prior day's Ending). <span style={{color:C.blue}}>Collections</span> auto-fill from cleared billing payments; <span style={{color:"#b45309"}}>Bizlink &amp; Float</span> auto-fill from expenses/cheque vouchers — hover a cell and click <b>✎</b> to type a manual override, <b>✕</b> to revert to auto. Then <span style={{color:"#047857"}}>Ending = Beginning + Collections − Bizlink</span> and <span style={{color:"#92400e"}}>Book = Ending − Float</span>. <b>Operating</b> = Executive-Summary working accounts; <b>Reserve</b> = Chinabank, Security Bank &amp; UnionBank savings.
        </div>

        {/* Untagged-amount warning — explains why the TOTAL row can exceed the per-bank columns */}
        {untaggedTotal>0.005&&(
          <div style={{margin:"0 14px 12px",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:8,padding:"8px 12px",fontSize:".72rem",color:"#92400e",lineHeight:1.5}}>
            ⚠ <b>{peso(untaggedTotal)}</b> is not assigned to a bank, so it's in the TOTAL row but not in any bank column:
            {untaggedColl>0.005?<> collections {peso(untaggedColl)};</>:null}
            {untaggedBiz>0.005?<> Bizlink {peso(untaggedBiz)};</>:null}
            {untaggedFloat>0.005?<> float cheques {peso(untaggedFloat)};</>:null}
            {" "}assign a bank on the rows marked <b>⚠ Untagged</b> in the detail tables below.
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
              {autoColl.length===0&&manualColl.length===0&&(
                <tr><td colSpan={4} style={{...td,color:"#94a3b8",fontStyle:"italic",padding:"10px"}}>No collections recorded for {fmtDate(selDate)}. Add manual entries below, or record payments in Billing.</td></tr>
              )}
              {/* Auto rows from billing (read-only) */}
              {autoColl.map((r,i)=>{const bk=BANKS.find(x=>x.id===r.bank);
                const canOpen=!!(onOpenBilling&&r.dealId);
                const openBilling=()=>canOpen&&onOpenBilling(r.dealId,r.milestoneId);
                return(
                <tr key={"auto"+(r.id||i)} style={{background:"#f0f7ff"}}>
                  <td style={{...td}}>{bk?bk.name.toUpperCase():<span style={{color:"#dc2626",fontWeight:700}}>⚠ Untagged</span>}</td>
                  <td style={{...td}}>
                    {canOpen?(
                      <button onClick={openBilling} title="Open this milestone in Billing — review, delete, or change the payment date"
                        style={{background:"none",border:"none",padding:0,margin:0,font:"inherit",color:C.blue,fontWeight:700,cursor:"pointer",textAlign:"left",textDecoration:"underline",textDecorationStyle:"dotted",textUnderlineOffset:2}}>
                        {r.particulars}{r.milestone?` · ${r.milestone}`:""}
                      </button>
                    ):(<>{r.particulars}{r.milestone?` · ${r.milestone}`:""}</>)}
                    <span style={{marginLeft:6,fontSize:".62rem",fontWeight:700,color:C.blue,background:"#e0efff",border:"1px solid #bfdbfe",borderRadius:5,padding:"0 5px"}}>auto · billing</span>
                    {canOpen&&<span onClick={openBilling} title="Open in Billing" style={{marginLeft:5,color:C.blue,cursor:"pointer",fontSize:".72rem"}}>↗</span>}
                  </td>
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

        {/* DISBURSEMENTS DETAIL */}
        {sectionHdr("Disbursements Detail (for the day)","#7c2d12")}
        <div style={{padding:"10px 12px 14px"}}>
          <table style={{borderCollapse:"collapse",width:"100%",maxWidth:820}}>
            <thead>
              <tr>
                <th style={{...th,textAlign:"left",width:mob?110:180}}>Bank</th>
                <th style={{...th,textAlign:"left"}}>Payee / Particulars</th>
                <th style={{...th,width:mob?90:120}}>Method</th>
                <th style={{...th,width:mob?100:150}}>Amount</th>
                <th style={{...th,width:40,background:"#fff",border:"none"}}></th>
              </tr>
            </thead>
            <tbody>
              {autoBizlink.length===0&&autoFloat.length===0&&manualDisb.length===0&&(
                <tr><td colSpan={5} style={{...td,color:"#94a3b8",fontStyle:"italic",padding:"10px"}}>No disbursements for {fmtDate(selDate)}. Paid BizLink expenses and released cheque vouchers appear here automatically; add manual entries below.</td></tr>
              )}
              {[...autoBizlink,...autoFloat].map((r,i)=>{const bk=BANKS.find(x=>x.id===r.bank);const isChq=r.method==="Cheque";return(
                <tr key={"ad"+(r.id||i)} style={{background:"#fdf6f0"}}>
                  <td style={{...td}}>{bk?bk.name.toUpperCase():<span style={{color:"#dc2626",fontWeight:700}}>⚠ Untagged</span>}</td>
                  <td style={{...td}}>{r.payee}{r.particulars?` · ${r.particulars}`:""}<span style={{marginLeft:6,fontSize:".62rem",fontWeight:700,color:"#b45309",background:"#fef3c7",border:"1px solid #fde68a",borderRadius:5,padding:"0 5px"}}>auto · {r.source}</span></td>
                  <td style={{...td,textAlign:"center"}}><span style={{fontSize:".68rem",fontWeight:700,padding:"1px 7px",borderRadius:20,color:isChq?"#7c3aed":"#1d4ed8",background:isChq?"#f5f3ff":"#eff6ff",border:`1px solid ${isChq?"#e9d5ff":"#bfdbfe"}`}}>{isChq?"Cheque":"BizLink"}</span></td>
                  <td style={{...td,...numCell,color:"#b45309",fontWeight:700}}>{fmt2(r.amount)}</td>
                  <td style={{...td,border:"none",background:"#fff"}}></td>
                </tr>
              );})}
              {manualDisb.map((row,ri)=>(
                <tr key={row.id||ri} style={{background:ri%2?C.zebra:"#fff"}}>
                  <td style={{...td,padding:2}}>
                    <select value={row.bank||""} onChange={e=>{const md=[...manualDisb];md[ri]={...md[ri],bank:e.target.value};f("disbursements.manual",md);}} style={{width:"100%",border:"1px solid transparent",borderRadius:4,padding:"5px 6px",fontFamily:"inherit",fontSize:".8rem",background:"transparent",color:"#0f172a",outline:"none"}}>
                      <option value="">Select bank…</option>
                      {BANKS.map(b=><option key={b.id} value={b.id}>{b.name.toUpperCase()}</option>)}
                    </select>
                  </td>
                  <td style={{...td,padding:2}}>
                    <input type="text" value={row.particulars??""} onChange={e=>{const md=[...manualDisb];md[ri]={...md[ri],particulars:e.target.value};f("disbursements.manual",md);}} placeholder="Payee / particulars" style={{width:"100%",border:"1px solid transparent",borderRadius:4,padding:"5px 8px",fontFamily:"inherit",fontSize:".8rem",background:"transparent",color:"#0f172a",outline:"none"}}/>
                  </td>
                  <td style={{...td,padding:2}}>
                    <select value={row.method||"BizLink"} onChange={e=>{const md=[...manualDisb];md[ri]={...md[ri],method:e.target.value};f("disbursements.manual",md);}} style={{width:"100%",border:"1px solid transparent",borderRadius:4,padding:"5px 6px",fontFamily:"inherit",fontSize:".8rem",background:"transparent",color:"#0f172a",outline:"none"}}>
                      <option value="BizLink">BizLink</option>
                      <option value="Cheque">Cheque</option>
                    </select>
                  </td>
                  <td style={{...td,padding:2}}>
                    <CurrInp value={row.amount||""} onChange={e=>{const md=[...manualDisb];md[ri]={...md[ri],amount:e.target.value};f("disbursements.manual",md);}} style={{textAlign:"right",fontSize:".8rem",padding:"5px 8px"}}/>
                  </td>
                  <td style={{...td,padding:2,textAlign:"center",border:"none"}}>
                    <button onClick={()=>f("disbursements.manual",manualDisb.filter((_,j)=>j!==ri))} style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:4,padding:"2px 7px",cursor:"pointer",color:"#dc2626",fontWeight:700,fontSize:".72rem",fontFamily:"inherit"}}>✕</button>
                  </td>
                </tr>
              ))}
              <tr style={{background:"#f1e9e2"}}>
                <td style={{...td,fontWeight:900,color:"#7c2d12"}} colSpan={3}>TOTAL</td>
                <td style={{...td,...numCell,fontWeight:900,color:"#b45309"}}>{fmt2(recordedDisb)}</td>
                <td style={{...td,border:"none",background:"#fff"}}></td>
              </tr>
            </tbody>
          </table>
          <button onClick={()=>f("disbursements.manual",[...manualDisb,{id:uid(),bank:"",particulars:"",method:"BizLink",amount:""}])} style={{marginTop:10,background:"#f8fafc",border:"1.5px dashed #cbd5e1",borderRadius:8,padding:"5px 14px",fontFamily:"inherit",fontSize:".76rem",fontWeight:700,color:"#475569",cursor:"pointer"}}>+ Add manual disbursement</button>

          {/* Cash-movement reconciliation */}
          {tot.end>0&&(
            <div style={{marginTop:14,maxWidth:520,background:"#f8fafc",border:`1px solid ${C.grid}`,borderRadius:10,padding:"12px 14px"}}>
              <div style={{fontSize:".68rem",fontWeight:800,color:"#475569",textTransform:"uppercase",letterSpacing:".6px",marginBottom:8}}>Cash-Movement Summary</div>
              {[
                ["Beginning balance (all banks)",tot.beg,"#475569","+"],
                ["Collections",collTotal,"#059669","+"],
                ["Ending balance (all banks, computed)",tot.end,"#475569","−"],
              ].map(([l,v,c,s])=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:".78rem",padding:"3px 0",color:"#475569"}}><span><b style={{color:c}}>{s}</b> {l}</span><span style={{fontVariantNumeric:"tabular-nums"}}>{fmt2(v)}</span></div>
              ))}
              <div style={{display:"flex",justifyContent:"space-between",fontSize:".82rem",fontWeight:800,borderTop:`1px solid ${C.grid}`,marginTop:5,paddingTop:6,color:"#0f172a"}}><span>= Net cleared bank movement</span><span style={{fontVariantNumeric:"tabular-nums"}}>{fmt2(netClearedOutflow)}</span></div>
              <div style={{marginTop:8,fontSize:".72rem",color:"#64748b",lineHeight:1.5}}>
                Recorded disbursements (Bizlink + Float) <b>{fmt2(recordedDisb)}</b>. Of that, <b style={{color:Math.abs(inTransit)<1?"#059669":"#b45309"}}>{fmt2(inTransit)}</b> is still in transit — cheques &amp; pending transfers not yet reflected in the bank's ending balance.
              </div>
            </div>
          )}
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
        <div style={{background:"#fff",borderRadius:14,border:`1.5px solid ${floatVouchers.length===0?"#e2e8f0":"#fde68a"}`,overflow:"hidden"}}>
          <div style={{background:floatVouchers.length===0?"#f8fafc":"#fef9c3",borderBottom:`2px solid ${floatVouchers.length===0?"#e2e8f0":"#fde68a"}`,padding:"11px 16px"}}>
            <div style={{fontWeight:800,color:floatVouchers.length===0?"#94a3b8":"#92400e",fontSize:".82rem"}}>🏦 Floating Checks</div>
            <div style={{fontSize:".66rem",color:floatVouchers.length===0?"#cbd5e1":"#b45309",marginTop:1}}>Released CVs not yet cleared · {peso(floatingTotal)}</div>
          </div>
          {floatVouchers.length===0
            ?<div style={{padding:"16px",fontSize:".76rem",color:"#cbd5e1",textAlign:"center"}}>None released from FabHub yet.</div>
            :<div style={{maxHeight:180,overflowY:"auto"}}>{floatVouchers.map(cv=>(
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
