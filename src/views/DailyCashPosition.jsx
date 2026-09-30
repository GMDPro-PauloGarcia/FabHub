import React,{useState,useMemo,useEffect,useLayoutEffect,useRef} from "react";
import {today,uid,BANKS,emptyBankRow,emptyDayPosition,uiConfirm,uiPrompt,addDaysLocalISO,CASH_PREFILL_DAYS,payeeOf,particularsOf,payeeRaw,particularsRaw,cashCanEdit,cashDayLocked} from "../shared";
import {arSummary} from "../core";

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

// ── Wrapping text cell: a one-row textarea that grows to fit its content ──────
// Long particulars/payees wrap instead of being cut off. Enter is blocked so the
// field stays single-entry; the value is passed through untouched (no trimming).
const WrapCell=({value,onType,placeholder})=>{
  const ref=useRef(null);
  const fit=()=>{const el=ref.current;if(!el) return;el.style.height="auto";el.style.height=el.scrollHeight+"px";};
  useLayoutEffect(fit,[value]);
  useEffect(()=>{
    const el=ref.current;
    if(!el||typeof ResizeObserver==="undefined") return;
    let w=el.clientWidth;
    const ro=new ResizeObserver(()=>{if(el.clientWidth!==w){w=el.clientWidth;fit();}});
    ro.observe(el);
    return()=>ro.disconnect();
  },[]);
  return(
    <textarea ref={ref} rows={1} value={value} placeholder={placeholder}
      onChange={e=>onType(e.target.value)}
      onKeyDown={e=>{if(e.key==="Enter") e.preventDefault();}}
      style={{display:"block",width:"100%",boxSizing:"border-box",border:"1px solid transparent",borderRadius:4,padding:"5px 8px",fontFamily:"inherit",fontSize:".8rem",lineHeight:1.35,background:"transparent",color:"#0f172a",outline:"none",resize:"none",overflow:"hidden",whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}/>
  );
};

// ─── DAILY CASH POSITION SUMMARY — Owners' Review report (Aerwin format) ───────
// Fully manual entry: the Bank Account Detail table's only editable cell is the
// Beginning Balance. Collections, Disbursements and Float Check per-bank columns
// are computed from three manual entry tables below the report. Floating checks
// carry from day to day until they are marked cleared.
function DailyCashPosition({
  cashPositions={},saveDayPos=()=>{},billings=[],wonDeals=[],payables=[],loans=[],userName="",
  role="",username="",cashStale=false
}){
  const[selDate,setSelDate]=useState(today);
  // ── Edit rights & day lock (see cashCanEdit / cashDayLocked in shared.jsx) ──
  // Only Managers and the assigned preparer may save; a day locks for
  // non-Managers at 12:01 AM the next day. The database enforces the same rule.
  const isMgr=role==="Manager";
  const canWrite=cashCanEdit(role,username);
  const dayLocked=cashDayLocked(selDate);
  const readOnly=!canWrite||(dayLocked&&!isMgr);
  const readOnlyRef=useRef(false);
  readOnlyRef.current=readOnly;
  const[saved,setSaved]    =useState(false);
  const[dirty,setDirty]    =useState(false);   // unsaved local edits on the current day
  const[histOpen,setHistOpen]=useState(false);
  const[hideAcct,setHideAcct]=useState(true);    // account no./branch/type hidden by default (screen-share friendly)
  const[lateClears,setLateClears]=useState(0);   // checks shown cleared here because an earlier day cleared them
  const maxDate=addDaysLocalISO(today,CASH_PREFILL_DAYS);
  const dirtyRef=useRef(false);                 // mirror of `dirty` readable inside the load effect
  const saveRef =useRef(()=>{});                // always points at the latest persistDay (for unmount auto-save)
  const loadedSavedAtRef=useRef(null);          // savedAt of the version currently open — to detect a newer save landing elsewhere
  const markDirty =()=>{dirtyRef.current=true; setDirty(true);};
  const clearDirty=()=>{dirtyRef.current=false;setDirty(false);};

  // Mirror of the `cashStale` prop that's readable inside effects/callbacks with
  // empty dep arrays (the unmount auto-save closes over the first render's props).
  // When the store is stale (a failed Supabase refresh left the local cache on
  // screen), the silent auto-save is suppressed so we never overwrite the server's
  // good rows with a copy that was never confirmed against it.
  const cashStaleRef=useRef(cashStale);
  cashStaleRef.current=cashStale;

  const normPos=(p,date)=>p?.banks?p:{...emptyDayPosition(date||today),...(p||{})};

  // Each day stores its own copy of the floating-check list, so marking a check
  // cleared on an earlier day never reached days already saved after it — that
  // later sheet kept showing it as floating. Reconcile by check id: a check
  // cleared on any earlier day (on or before `date`) shows cleared here too,
  // unless someone deliberately re-opened it on this day (`reopened`).
  const applyEarlierClears=(checks,date)=>{
    const cleared={};
    Object.keys(cashPositions).filter(k=>k<date).forEach(k=>{
      (cashPositions[k]?.floatingChecks||[]).forEach(c=>{
        if(c?.id&&c.cleared&&(!c.clearedDate||c.clearedDate<=date)&&!cleared[c.id]) cleared[c.id]=c.clearedDate||k;
      });
    });
    let count=0;
    const out=(checks||[]).map(c=>{
      if(c.cleared||c.reopened||!c.id||!cleared[c.id]) return c;
      count++;
      return {...c,cleared:true,clearedDate:cleared[c.id]};
    });
    return {checks:out,count};
  };
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
    const carriedFloat=applyEarlierClears((prev.floatingChecks||[]).filter(c=>!c.cleared),date).checks
      .filter(c=>!c.cleared).map(c=>{const{reopened,...rest}=c;return {...rest,carried:true};});
    return {...base,banks:newBanks,floatingChecks:carriedFloat};
  };

  const loadDay=(d)=>{
    if(cashPositions[d]){
      const p=normPos(cashPositions[d],d);
      const {checks,count}=applyEarlierClears(p.floatingChecks,d);
      setPos(count?{...p,floatingChecks:checks}:p);setLateClears(count);
      setSaved(!count);loadedSavedAtRef.current=cashPositions[d].savedAt||null;
    }
    else{setPos(carryFrom(d));setSaved(false);setLateClears(0);loadedSavedAtRef.current=null;}
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

  // Safety net for IN-APP navigation: beforeunload only fires for full-page unloads,
  // not when the user clicks another view (this component just unmounts and its
  // in-memory day would be lost). So on unmount, if the current day still has unsaved
  // edits, auto-save them — same save-by-default policy used when switching dates.
  const brokenRef=useRef(false);                // day has missing carried checks → never auto-save it
  useEffect(()=>()=>{ if(dirtyRef.current&&!cashStaleRef.current&&!brokenRef.current&&!readOnlyRef.current){ try{ saveRef.current(); }catch(_){} } },[]);

  const switchDate=async (d)=>{
    if(!d||d===selDate) return;
    // The date picker's max isn't enforced on typed input. A far-future date is
    // how 09/01's sheet ended up saved as 09/28 — refuse it outright.
    if(d>maxDate){
      await uiConfirm({title:"Date is too far ahead",tone:"warning",confirmLabel:"OK",
        message:`${fmtDate(d)} is more than ${CASH_PREFILL_DAYS} days ahead. Cash positions can only be prepared up to ${fmtDate(maxDate)}. Check the date you picked.`});
      return;
    }
    // Non-destructive switch: never silently drop unsaved finance data. If the
    // current day has unsaved edits, SAVE them by default before leaving — the
    // old behaviour discarded on switch, which is how a full day of collections,
    // disbursements and floating-check changes could vanish just by clicking
    // another date. The user can still explicitly discard.
    if(dirtyRef.current){
      // While the store is stale (failed server refresh), never offer save-by-default —
      // that would push unconfirmed figures over the server. Only let the user keep
      // editing or discard.
      if(cashStale){
        const keep=await uiConfirm({
          title:"Cash data isn't synced — changes can't be saved",
          tone:"warning",
          confirmLabel:`Discard and open ${fmtDate(d)}`,
          message:
            `You have unsaved changes for ${fmtDate(selDate)}, but the latest cash positions couldn't be loaded from the server, so saving is disabled to avoid overwriting newer data.\n\n`+
            `• OK = Discard these changes and open ${fmtDate(d)}\n`+
            `• Cancel = Stay here (reconnect and tap 🔄 sync first)`
        });
        if(!keep) return;
        setSelDate(d);loadDay(d);return;
      }
      const save=(await uiConfirm(
        `You have unsaved changes for ${fmtDate(selDate)}.\n\n`+
        `• OK = Save them, then open ${fmtDate(d)}\n`+
        `• Cancel = Discard the changes and open ${fmtDate(d)}`
      ));
      if(save){
        if(continuity.missing.length){
          await uiConfirm({title:"Can't auto-save this day",tone:"warning",confirmLabel:"OK",
            message:`${continuity.missing.length} floating check(s) from ${fmtDate(continuity.prevDayKey)} are missing on ${fmtDate(selDate)}. Use Save Position to review them first.`});
          return;
        }
        persistDay();           // persists selDate + appends an audit entry (switch already confirmed)
      }else if(!(await uiConfirm(`Discard all unsaved changes for ${fmtDate(selDate)}? This cannot be undone.`))){
        return;                 // second Cancel = stay put, keep editing
      }
    }
    setSelDate(d);
    loadDay(d);
  };

  const f=(path,val)=>{
    if(readOnlyRef.current) return;
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
  // One-line label for a check in banners, prompts and the Audit Trail.
  const whoOf=(c)=>[payeeOf(c),particularsOf(c)].filter(Boolean).join(" — ");
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
  const clearedFloat =useMemo(()=>floatChecks.filter(c=>c.cleared),[floatChecks]);
  const clearedTotal =useMemo(()=>clearedFloat.reduce((s,r)=>s+n(r.amount),0),[clearedFloat]);

  // Recorded but not assigned to a bank — surfaced so the TOTAL row and per-bank columns reconcile
  const isUntagged=(r)=>!BANKS.some(b=>b.id===r.bank);
  const untaggedColl =manualColl.filter(isUntagged).reduce((s,r)=>s+n(r.amount),0);
  const untaggedDisb =manualDisb.filter(isUntagged).reduce((s,r)=>s+n(r.amount),0);
  const untaggedFloat=openFloat.filter(isUntagged).reduce((s,r)=>s+n(r.amount),0);
  const untaggedTotal=untaggedColl+untaggedDisb+untaggedFloat;

  // ── Day-to-day continuity check ──────────────────────────────────────────
  // Catches the OUTCOME of any break (a wrong-date save, a stale tab, a row
  // deleted by mistake) rather than one cause:
  //  • HARD — a check still floating on the previous saved day must be on this
  //    day too (floating, or marked cleared). A check that silently vanished is
  //    how ₱2.4M of floats disappeared on 09/28. Saving needs a typed reason.
  //  • SOFT — per bank, Beginning should equal the previous Ending minus the
  //    checks cleared today on that bank (that is exactly how BDO reconciles in
  //    the Sept data). Anything left over is an unexplained movement — shown and
  //    logged, not blocked, since bank credits/charges legitimately cause it.
  const prevDayKey=useMemo(()=>Object.keys(cashPositions).filter(k=>k<selDate).sort().reverse()[0]||null,[cashPositions,selDate]);
  const continuity=useMemo(()=>{
    const prev=prevDayKey?cashPositions[prevDayKey]:null;
    if(!prev) return {prevDayKey:null,missing:[],missingTotal:0,unexplained:[]};
    const key=(c)=>`${String(c.checkNo||"").trim()}|${n(c.amount).toFixed(2)}|${c.bank||""}`;
    const ids=new Set(floatChecks.map(c=>c.id).filter(Boolean));
    const keys=new Set(floatChecks.filter(c=>String(c.checkNo||"").trim()).map(key));
    const missing=(prev.floatingChecks||[]).filter(c=>!c.cleared&&n(c.amount)>0)
      .filter(c=>!(c.id&&ids.has(c.id))&&!(String(c.checkNo||"").trim()&&keys.has(key(c))));
    const clearedToday=(id)=>floatChecks.filter(c=>c.cleared&&c.clearedDate===selDate&&c.bank===id).reduce((s,c)=>s+n(c.amount),0);
    const unexplained=[];
    BANKS.forEach(b=>{
      const r=prev.banks?.[b.id]||{};
      const prevEnd=Number(r.end)||Number(r.book)||Number(r.beg)||0;
      const beg=n(bankRow(b.id).beg);
      if(!beg&&!prevEnd) return;
      const expected=prevEnd-clearedToday(b.id);
      const diff=beg-expected;
      if(Math.abs(diff)>0.005) unexplained.push({bank:b.id,name:b.name,prevEnd,cleared:clearedToday(b.id),beg,diff});
    });
    return {prevDayKey,missing,missingTotal:missing.reduce((s,c)=>s+n(c.amount),0),unexplained};
    // eslint-disable-next-line
  },[prevDayKey,cashPositions,floatChecks,pos.banks,selDate]);
  // ── Possible duplicate checks ────────────────────────────────────────────
  // SOFT warning (never blocks). Real Sept cases it catches:
  //  • the same ₱110,000 Marjorie Y. Santiago check entered twice — once with no
  //    check no. (09/14), once as #87749 (09/16). #87749 was cleared on 09/17 and
  //    the blank copy kept floating, understating Book by ₱110k until 09/23.
  //  • check #86711 recorded for BOTH Stella Garcia and Rafael Garcia.
  // Rules, for every OPEN check on this day:
  //  1. same bank + same check no. as another check (open on this day, or
  //     cleared here or on an earlier day), with a different id;
  //  2. same bank + amount + payee as another such check when either one has no
  //     check no. — distinct numbered checks (3× Globe ₱599) are left alone.
  const duplicates=useMemo(()=>{
    const pk=(c)=>payeeOf(c).toLowerCase().replace(/\b[a-z]\b/g,"").replace(/[^a-z0-9]/g,"");
    // Only a real cheque number counts: "DEBIT" (auto-debits, e.g. the monthly
    // Security Bank loan) and "#" are placeholders, not numbers.
    const no=(c)=>{const v=String(c.checkNo||"").trim().toLowerCase();return /\d/.test(v)?v:"";};
    const amt=(c)=>n(c.amount).toFixed(2);
    const open=floatChecks.filter(c=>!c.cleared&&n(c.amount)>0);
    if(!open.length) return [];
    // Pool: today's rows plus checks cleared on earlier days (last 90 days).
    const since=addDaysLocalISO(selDate,-90);
    const pool=floatChecks.map(c=>({c,day:selDate}));
    const seen=new Set(floatChecks.map(c=>c.id).filter(Boolean));
    Object.keys(cashPositions).filter(k=>k<selDate&&k>=since).sort().reverse().forEach(k=>{
      (cashPositions[k]?.floatingChecks||[]).forEach(c=>{
        if(c?.cleared&&c.id&&!seen.has(c.id)){seen.add(c.id);pool.push({c,day:k});}
      });
    });
    const out=[];const pairKeys=new Set();
    open.forEach(a=>{
      pool.forEach(({c:b,day})=>{
        if(a===b||(a.id&&b.id&&a.id===b.id)||(a.bank||"")!==(b.bank||"")) return;
        let why=null;
        if(no(a)&&no(a)===no(b)) why="sameNo";
        else if((!no(a)||!no(b))&&amt(a)===amt(b)&&pk(a)&&pk(a)===pk(b)) why="noNumber";
        if(!why) return;
        const key=[a.id||a.checkNo,b.id||b.checkNo].sort().join("|");
        if(pairKeys.has(key)) return; pairKeys.add(key);
        out.push({why,a,b,bCleared:!!b.cleared,bDay:b.cleared?(b.clearedDate||day):null});
      });
    });
    return out;
    // eslint-disable-next-line
  },[floatChecks,cashPositions,selDate]);

  const restoreMissing=()=>{
    if(!continuity.missing.length) return;
    f("floatingChecks",[...floatChecks,...continuity.missing.map(c=>{const{reopened,...rest}=c;return {...rest,carried:true};})]);
  };

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
  // Cash still owed on issued billings, same basis as every other AR figure
  // (milestone receivable incl. VAT, less EWT, minus good payments).
  const runningAR=useMemo(()=>{
    const byId=new Map((wonDeals||[]).map(d=>[d.id,d]));
    return arSummary(billings||[],id=>byId.get(id)).outstanding;
  },[billings,wonDeals]);

  // Open payables = anything not settled or cancelled. Running Payables must count
  // the OUTSTANDING BALANCE (amount − paid_amount), not the gross invoice — a Partial
  // payable that's half-settled otherwise overstates what's actually owed.
  const openPayables=useMemo(()=>(payables||[]).filter(p=>!["Paid","Cancelled"].includes(p.status)),[payables]);
  const payBal=(p)=>Math.max(0,Number(p.amount||0)-Number(p.paidAmount||0));
  const payablesUnpaid=useMemo(()=>openPayables.reduce((s,p)=>s+payBal(p),0),[openPayables]);

  // ── Payables aging — bucket each open balance by its due date ──────────────
  // Dated payables split into Overdue / Due ≤7d / Due ≤30d / Later. Payables with
  // NO due date can't be aged, so they get their own bucket and are surfaced as a
  // data-quality gap (Finance should fill the due date so the forecast is honest).
  const payAging=useMemo(()=>{
    const b={overdue:0,d7:0,d30:0,later:0,undated:0};
    let undatedCount=0;
    openPayables.forEach(p=>{
      const bal=payBal(p); if(bal<=0) return;
      if(!p.dueDate){b.undated+=bal;undatedCount++;return;}
      const days=Math.ceil((new Date(p.dueDate)-new Date(selDate))/86400000);
      if(days<0) b.overdue+=bal; else if(days<=7) b.d7+=bal; else if(days<=30) b.d30+=bal; else b.later+=bal;
    });
    return{...b,undatedCount,due30:b.overdue+b.d7+b.d30};
  },[openPayables,selDate]);

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

  // Actually persist the current day (no prompts). Used by the button after
  // confirmation, and directly by the silent auto-save paths (unmount, date-switch).
  const persistDay=(override=null,pastEdit=null)=>{
    if(readOnlyRef.current) return;
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
    // Record any continuity break that was saved through, with the reason given.
    if(override) entry.override=override;
    if(pastEdit) entry.pastEdit=pastEdit;
    else if(continuity.unexplained.length) entry.unexplained=continuity.unexplained.map(u=>({bank:u.name,diff:u.diff}));
    if(duplicates.length) entry.duplicates=duplicates.map(d=>({why:d.why,a:`#${d.a.checkNo||"—"} ${whoOf(d.a)} ${n(d.a.amount).toFixed(2)}`,b:`#${d.b.checkNo||"—"} ${whoOf(d.b)} ${n(d.b.amount).toFixed(2)}${d.bCleared?` (cleared ${d.bDay})`:""}`}));
    // Only log an edit if something actually changed; always log the first save.
    const priorAudit=Array.isArray(pos.audit)?pos.audit:[];
    const audit=(!prior||changes.length>0||override||pastEdit)?[...priorAudit,entry]:priorAudit;
    saveDayPos(selDate,{...pos,banks:banksOut,collections:{...pos.collections,total:collTotal},audit,savedAt:at});
    setSaved(true);clearDirty();
    loadedSavedAtRef.current=at;   // this save is now the baseline for the open day
  };

  // Save-button handler: confirm before writing so the person saving is asked to
  // verify the figures are current — and, if this day was saved somewhere else
  // (another user/device) AFTER it was opened here, warn loudly that saving now
  // overwrites that newer version. The in-progress edits are deliberately never
  // auto-refreshed from a background sync (see the load effect), so without this
  // check a stale tab could silently clobber fresher data.
  const handleSave=async ()=>{
    if(readOnly) return;
    // Guard: if the store is stale (the last Supabase refresh failed, so we're
    // looking at the local cache), saving now would upsert unconfirmed figures on
    // top of whatever is really on the server. Warn and require an explicit override.
    if(cashStale){
      const proceed=await uiConfirm({
        title:"Cash data isn't synced with the server",
        tone:"warning",
        confirmLabel:"Save anyway (may overwrite newer data)",
        message:
          `The latest cash positions couldn't be loaded from the server, so this screen is showing a locally-cached copy.\n\n`+
          `Saving now could overwrite more recent figures (e.g. Aerwin's) that just didn't reach this device.\n\n`+
          `Reconnect and tap the 🔄 sync button first, then reopen ${fmtDate(selDate)} to confirm you have the latest before saving.`
      });
      if(!proceed) return;
    }
    if(selDate>maxDate) return;   // unreachable via switchDate; belt-and-braces
    if(selDate>today){
      const ahead=await uiConfirm({title:`Save a FUTURE date — ${fmtDate(selDate)}?`,tone:"warning",confirmLabel:`Yes, save as ${fmtDate(selDate)}`,
        message:`Today is ${fmtDate(today)}, but this sheet is dated ${fmtDate(selDate)}.\n\nOnly continue if you are pre-filling that banking day on purpose. If you meant today, cancel and change the date first.`});
      if(!ahead) return;
    }
    const stored=cashPositions[selDate];
    const remoteSavedAt=stored?.savedAt||null;
    const conflict=remoteSavedAt&&remoteSavedAt!==loadedSavedAtRef.current;
    const when=(iso)=>{try{return new Date(iso).toLocaleString("en-PH");}catch(_){return iso;}};
    const ok=await uiConfirm(conflict?{
      title:"This day was updated elsewhere",
      tone:"warning",
      confirmLabel:"Overwrite with my version",
      message:
        `${fmtDate(selDate)} was saved again ${when(remoteSavedAt)} — after you opened it here.\n\n`+
        `Saving now will OVERWRITE that newer version with the figures on this screen, and their changes will be lost.\n\n`+
        `If you're not sure yours is the most up-to-date, cancel and reopen ${fmtDate(selDate)} first to pull the latest.`
    }:{
      title:`Save cash position — ${fmtDate(selDate)}`,
      confirmLabel:"Save position",
      message:`Please confirm the figures for ${fmtDate(selDate)} are the most up-to-date before saving.`
    });
    if(!ok) return;
    let override=null;
    if(continuity.missing.length){
      const list=continuity.missing.slice(0,8).map(c=>`• #${c.checkNo||"—"} ${whoOf(c)} ${peso(c.amount)}`).join("\n");
      const reason=await uiPrompt({
        title:`${continuity.missing.length} floating check${continuity.missing.length!==1?"s":""} from ${fmtDate(continuity.prevDayKey)} missing`,
        tone:"warning",confirmLabel:"Save with this reason",
        message:
          `These checks were still floating on ${fmtDate(continuity.prevDayKey)} but are not on ${fmtDate(selDate)} (${peso(continuity.missingTotal)}):\n\n${list}${continuity.missing.length>8?`\n…and ${continuity.missing.length-8} more`:""}\n\n`+
          `If they cleared, cancel and use "Restore missing checks", then Mark cleared. If they were voided/cancelled on purpose, type the reason — it is saved in the Audit Trail.`
      });
      if(!reason||!String(reason).trim()) return;
      override={reason:String(reason).trim(),vsDay:continuity.prevDayKey,missing:continuity.missing.map(c=>({checkNo:c.checkNo||"",payee:whoOf(c),amount:n(c.amount)}))};
    }
    // Manager changing a day that already locked: require a reason. It is kept
    // in the Audit Trail and sent to management on Telegram.
    let pastEdit=null;
    if(dayLocked&&isMgr){
      const why=await uiPrompt({
        title:`${fmtDate(selDate)} is locked`,tone:"warning",confirmLabel:"Save change to locked day",
        message:`This day locked at 12:01 AM on ${fmtDate(addDaysLocalISO(selDate,1))}. As a Manager you can still change it, but the reason is recorded in the Audit Trail and sent to management.\n\nWhy is this past day being changed?`
      });
      if(!why||!String(why).trim()) return;
      pastEdit={reason:String(why).trim()};
    }
    persistDay(override,pastEdit);
  };
  // Keep the unmount auto-save pointed at the current render's persistDay (it closes
  // over the latest pos/computed figures), so leaving the page never loses the day.
  saveRef.current=()=>persistDay();
  brokenRef.current=continuity.missing.length>0;

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
    rows.push([],["DISBURSEMENTS DETAIL (FOR THE DAY)"],["Bank","Payee","Particulars","Amount"]);
    manualDisb.forEach(r=>{const bk=BANKS.find(x=>x.id===r.bank);rows.push([bk?bk.name:"",payeeOf(r),particularsOf(r),n(r.amount).toFixed(2)]);});
    rows.push(["TOTAL","","",disbTotal.toFixed(2)]);
    rows.push([],["FLOATING CHECKS (UNCLEARED)"],["Bank","Payee","Particulars","Check No.","Amount","Status"]);
    openFloat.forEach(r=>{const bk=BANKS.find(x=>x.id===r.bank);rows.push([bk?bk.name:"",payeeOf(r),particularsOf(r),r.checkNo||"",n(r.amount).toFixed(2),"Floating"]);});
    rows.push(["TOTAL","","","",floatingTotal.toFixed(2),"(uncleared)"]);
    if(clearedFloat.length){
      rows.push([],["CLEARED CHECKS"],["Bank","Payee","Particulars","Check No.","Amount","Status"]);
      clearedFloat.forEach(r=>{const bk=BANKS.find(x=>x.id===r.bank);rows.push([bk?bk.name:"",payeeOf(r),particularsOf(r),r.checkNo||"",n(r.amount).toFixed(2),`Cleared ${r.clearedDate||""}`.trim()]);});
      rows.push(["TOTAL","","","",clearedTotal.toFixed(2),"(cleared)"]);
    }
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
  const textCell=(val,onType,ph)=><WrapCell value={val} onType={onType} placeholder={ph}/>;
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
          {cashStale&&<span title="The latest cash positions couldn't be loaded from the server — you're viewing a locally-cached copy. Reconnect and tap the 🔄 sync button." style={{fontSize:".72rem",fontWeight:800,color:"#b91c1c",background:"#fef2f2",border:"1px solid #fecaca",borderRadius:6,padding:"3px 9px",display:"inline-flex",alignItems:"center",gap:4}}>⚠ Offline copy — not synced</span>}
          {dirty&&<span style={{fontSize:".72rem",fontWeight:700,color:"#b45309",display:"inline-flex",alignItems:"center",gap:4}}>● Unsaved</span>}
          <button onClick={exportCSV} style={{background:"#eff6ff",border:"1.5px solid #bfdbfe",borderRadius:8,padding:"7px 14px",fontFamily:"inherit",fontSize:".78rem",fontWeight:700,color:"#1d4ed8",cursor:"pointer"}}>⬇ Export CSV</button>
          <input type="date" value={selDate} max={maxDate} onChange={e=>switchDate(e.target.value)} style={{border:"1.5px solid #e2e8f0",borderRadius:8,padding:"8px 12px",fontFamily:"inherit",fontSize:".84rem",color:"#0f172a",cursor:"pointer"}}/>
          <button onClick={()=>setHistOpen(h=>!h)} style={{background:"#f8fafc",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"8px 12px",fontFamily:"inherit",fontSize:".78rem",color:"#64748b",cursor:"pointer",fontWeight:600}}>📅 History ({histDates.length})</button>
          {readOnly
            ?<span title={!canWrite?"Only Managers and the assigned preparer can edit the cash position.":`Locked at 12:01 AM on ${fmtDate(addDaysLocalISO(selDate,1))}. Only a Manager can change it.`} style={{border:"1.5px solid #cbd5e1",borderRadius:8,padding:"8px 14px",fontSize:".8rem",color:"#475569",fontWeight:700,background:"#f8fafc"}}>🔒 {!canWrite?"View only":"Locked"}</span>
            :<button onClick={handleSave} style={{background:(saved&&!dirty)?"#f0fdf4":C.navy,border:`1.5px solid ${(saved&&!dirty)?"#6ee7b7":C.navy}`,borderRadius:8,padding:"8px 18px",fontFamily:"inherit",fontSize:".82rem",color:(saved&&!dirty)?"#059669":"#fff",cursor:"pointer",fontWeight:700}}>{(saved&&!dirty)?"✓ Saved":"Save Position"}</button>}
        </div>
      </div>

      {continuity.missing.length>0&&(
        <div style={{background:"#fef2f2",border:"1.5px solid #fca5a5",borderRadius:10,padding:"10px 14px",marginBottom:14,fontSize:".78rem",color:"#991b1b",lineHeight:1.5}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            <span>⛔ <b>{continuity.missing.length} floating check{continuity.missing.length!==1?"s":""} ({peso(continuity.missingTotal)})</b> still open on {fmtDate(continuity.prevDayKey)} {continuity.missing.length!==1?"are":"is"} missing from {fmtDate(selDate)}. They were not marked cleared — they just aren't here.</span>
            <button onClick={restoreMissing} style={{background:"#991b1b",border:"none",borderRadius:7,padding:"6px 12px",color:"#fff",fontFamily:"inherit",fontWeight:700,fontSize:".74rem",cursor:"pointer"}}>Restore missing checks</button>
          </div>
          <div style={{marginTop:6,fontSize:".7rem",color:"#b91c1c"}}>
            {continuity.missing.slice(0,6).map(c=>`#${c.checkNo||"—"} ${whoOf(c)} ${peso(c.amount)}`).join(" · ")}{continuity.missing.length>6?` · +${continuity.missing.length-6} more`:""}
          </div>
        </div>
      )}
      {duplicates.length>0&&(
        <div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:10,padding:"9px 14px",marginBottom:14,fontSize:".74rem",color:"#92400e",lineHeight:1.5}}>
          ⚠ <b>{duplicates.length} possible duplicate check{duplicates.length!==1?"s":""}</b> — a duplicate floating check overstates Float and understates Book:
          <ul style={{margin:"4px 0 0",paddingLeft:18}}>
            {duplicates.map((d,i)=>{
              const lbl=(c)=>`#${c.checkNo||"(no check no.)"} ${whoOf(c)} ${peso(c.amount)}`;
              return <li key={i}>{d.why==="sameNo"
                ?<><b>Check #{d.a.checkNo}</b> is used twice: {lbl(d.a)} and {lbl(d.b)}{d.bCleared?` (cleared ${fmtDate(d.bDay)})`:""}. One check number can't be two checks — fix the wrong number.</>
                :<><b>{lbl(d.a)}</b> matches {lbl(d.b)}{d.bCleared?`, already cleared ${fmtDate(d.bDay)}`:""}. One has no check number — if it's the same check, delete the extra row.</>}</li>;
            })}
          </ul>
        </div>
      )}
      {continuity.unexplained.length>0&&(
        <div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:10,padding:"9px 14px",marginBottom:14,fontSize:".74rem",color:"#92400e",lineHeight:1.5}}>
          ⚠ <b>Beginning balance doesn't follow from {fmtDate(continuity.prevDayKey)}</b> (previous Ending − checks cleared today):{" "}
          {continuity.unexplained.map(u=><span key={u.bank} style={{marginRight:10}}><b>{u.name}</b> {u.diff>0?"+":"−"}{peso(Math.abs(u.diff))}{u.cleared>0&&Math.abs(u.diff-u.cleared)<0.005?" (Beginning not yet reduced for checks cleared today)":""}</span>)}
          <div style={{fontSize:".68rem",color:"#b45309",marginTop:2}}>Fine if it's a bank credit, charge or interest — otherwise a check probably cleared without being marked, or a figure was mistyped. Saved to the Audit Trail with this day.</div>
        </div>
      )}
      {lateClears>0&&(
        <div style={{background:"#ecfdf5",border:"1px solid #a7f3d0",borderRadius:10,padding:"9px 14px",marginBottom:14,fontSize:".76rem",color:"#065f46",lineHeight:1.5}}>
          ✓ <b>{lateClears} check{lateClears!==1?"s":""}</b> marked cleared on an earlier day {lateClears!==1?"were":"was"} still saved as floating on {fmtDate(selDate)}. {lateClears!==1?"They now show":"It now shows"} as cleared here — review and <b>Save Position</b> to record it.
        </div>
      )}

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

      {(readOnly||(dayLocked&&isMgr))&&(
        <div style={{background:"#f1f5f9",border:"1px solid #cbd5e1",borderRadius:10,padding:"9px 14px",marginBottom:14,fontSize:".76rem",color:"#334155",lineHeight:1.5}}>
          🔒 {!canWrite
            ?<>View only. Only Managers and the assigned preparer can change the cash position.</>
            :!isMgr
              ?<><b>{fmtDate(selDate)} is locked</b> (since 12:01 AM, {fmtDate(addDaysLocalISO(selDate,1))}). Ask a Manager to make any change to a past day.</>
              :<><b>{fmtDate(selDate)} is locked</b> for staff. You can still change it as a Manager; saving asks for a reason, which is logged and sent to management.</>}
        </div>
      )}

      {/* ── Report sheet ── (disabled as a whole when view-only / locked) */}
      <fieldset disabled={readOnly} style={{border:0,padding:0,margin:0,minWidth:0}}>
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

          {/* PAYABLES AGING & CASH COVERAGE — answers "can we actually pay this?" */}
          {(()=>{
            const spendable=opBook;                 // operating book cash (ending − uncleared checks)
            const due30=payAging.due30;             // overdue + due within 30 days
            const gap=spendable-due30;              // >0 = covered, <0 = shortfall
            const covered=gap>=0;
            const pct=due30>0?Math.min(100,Math.round((spendable/due30)*100)):100;
            const buckets=[
              {l:"Overdue",     v:payAging.overdue,c:"#dc2626"},
              {l:"Due ≤ 7 days", v:payAging.d7,    c:"#ea580c"},
              {l:"Due ≤ 30 days",v:payAging.d30,   c:"#d97706"},
              {l:"Later",       v:payAging.later,  c:"#0f766e"},
              {l:"No due date", v:payAging.undated,c:"#64748b"},
            ];
            return(
              <div style={{marginTop:12,border:`1px solid ${C.grid}`,borderRadius:10,overflow:"hidden"}}>
                <div style={{background:"#0f172a",color:"#fff",padding:"7px 12px",fontSize:".68rem",fontWeight:800,letterSpacing:".5px",textTransform:"uppercase",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span>Payables Aging &amp; Cash Coverage</span>
                  <span style={{fontWeight:600,color:"#94a3b8",textTransform:"none",letterSpacing:0}}>Total open ₱{fmt2(payablesUnpaid)}</span>
                </div>
                <div style={{padding:"12px",background:"#fff"}}>
                  {/* Aging buckets */}
                  <div style={{display:"grid",gridTemplateColumns:mob?"1fr 1fr":"repeat(5,1fr)",gap:8}}>
                    {buckets.map(({l,v,c})=>(
                      <div key={l} style={{background:"#f8fafc",border:`1px solid ${C.grid}`,borderRadius:8,padding:"8px 10px"}}>
                        <div style={{fontSize:".58rem",textTransform:"uppercase",letterSpacing:".5px",color:"#94a3b8",fontWeight:700}}>{l}</div>
                        <div style={{fontWeight:800,fontSize:".92rem",color:v>0?c:"#cbd5e1",marginTop:2,fontVariantNumeric:"tabular-nums"}}>{peso(v)}</div>
                      </div>
                    ))}
                  </div>
                  {/* Coverage verdict */}
                  <div style={{marginTop:12,background:covered?"#f0fdf4":"#fef2f2",border:`1.5px solid ${covered?"#bbf7d0":"#fecaca"}`,borderRadius:9,padding:"11px 13px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",flexWrap:"wrap",gap:6}}>
                      <span style={{fontWeight:800,fontSize:".82rem",color:covered?"#15803d":"#b91c1c"}}>
                        {covered?"✓ Cash covers all payables due within 30 days":"⚠ Cash shortfall on payables due within 30 days"}
                      </span>
                      <span style={{fontSize:".72rem",fontWeight:700,color:"#475569"}}>{pct}% covered</span>
                    </div>
                    <div style={{height:7,background:"#e2e8f0",borderRadius:4,overflow:"hidden",margin:"8px 0"}}>
                      <div style={{width:pct+"%",height:"100%",background:covered?"#22c55e":"#ef4444",transition:"width .3s"}}/>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:"2px 16px",fontSize:".7rem",color:"#475569"}}>
                      <span>Spendable operating cash (book): <strong>{peso(spendable)}</strong></span>
                      <span>Due within 30 days: <strong>{peso(due30)}</strong></span>
                      <span style={{fontWeight:700,color:covered?"#15803d":"#b91c1c"}}>{covered?"Surplus":"Shortfall"}: {peso(Math.abs(gap))}</span>
                    </div>
                  </div>
                  {payAging.undatedCount>0&&(
                    <div style={{marginTop:8,fontSize:".68rem",color:"#b45309",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:7,padding:"7px 10px"}}>
                      ⚠ {payAging.undatedCount} open payable{payAging.undatedCount!==1?"s":""} ({peso(payAging.undated)}) {payAging.undatedCount!==1?"have":"has"} no due date — not counted in the 30-day coverage above. Add due dates so this figure is complete.
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
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
          <table style={{borderCollapse:"collapse",width:"100%",maxWidth:1000}}>
            <thead>
              <tr>
                <th style={{...th,textAlign:"left",width:mob?120:200}}>Bank</th>
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
          <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
          <table style={{borderCollapse:"collapse",width:"100%",maxWidth:1000,minWidth:mob?620:0}}>
            <thead>
              <tr>
                <th style={{...th,textAlign:"left",width:mob?120:200}}>Bank</th>
                <th style={{...th,textAlign:"left"}}>Payee</th>
                <th style={{...th,textAlign:"left"}}>Particulars</th>
                <th style={{...th,width:mob?110:160}}>Amount</th>
                <th style={{...th,width:40,background:"#fff",border:"none"}}></th>
              </tr>
            </thead>
            <tbody>
              {manualDisb.length===0&&(
                <tr><td colSpan={5} style={{...td,color:"#94a3b8",fontStyle:"italic",padding:"10px"}}>No disbursements for {fmtDate(selDate)}. Add rows below.</td></tr>
              )}
              {manualDisb.map((row,ri)=>(
                <tr key={row.id||ri} style={{background:ri%2?C.zebra:"#fff"}}>
                  <td style={{...td,padding:2}}>{isUntagged(row)&&<span style={{color:"#dc2626",fontWeight:700,fontSize:".62rem",marginLeft:4}}>⚠</span>}{bankSelect(row.bank,v=>{const md=[...manualDisb];md[ri]={...md[ri],bank:v};f("disbursements.manual",md);})}</td>
                  {/* Editing either field saves both, moving an old one-text row to the split format */}
                  <td style={{...td,padding:2}}>{textCell(payeeRaw(row),v=>{const md=[...manualDisb];md[ri]={...md[ri],payee:v,particulars:particularsRaw(md[ri])};f("disbursements.manual",md);},"Payee")}</td>
                  <td style={{...td,padding:2}}>{textCell(particularsRaw(row),v=>{const md=[...manualDisb];md[ri]={...md[ri],payee:payeeRaw(md[ri]),particulars:v};f("disbursements.manual",md);},"e.g. Office payroll Sept 20")}</td>
                  <td style={{...td,padding:2}}>
                    <CurrInp value={row.amount||""} onChange={e=>{const md=[...manualDisb];md[ri]={...md[ri],amount:e.target.value};f("disbursements.manual",md);}} style={{textAlign:"right",fontSize:".8rem",padding:"5px 8px"}}/>
                  </td>
                  <td style={{...td,padding:2,textAlign:"center",border:"none"}}>{delBtn(()=>f("disbursements.manual",manualDisb.filter((_,j)=>j!==ri)))}</td>
                </tr>
              ))}
              <tr style={{background:"#f1e9e2"}}>
                <td style={{...td,fontWeight:900,color:"#7c2d12"}} colSpan={3}>TOTAL</td>
                <td style={{...td,...numCell,fontWeight:900,color:"#b45309"}}>{fmt2(disbTotal)}</td>
                <td style={{...td,border:"none",background:"#fff"}}></td>
              </tr>
            </tbody>
          </table>
          </div>
          <button onClick={()=>f("disbursements.manual",[...manualDisb,{id:uid(),bank:"",payee:"",particulars:"",amount:""}])} style={{marginTop:10,background:"#f8fafc",border:"1.5px dashed #cbd5e1",borderRadius:8,padding:"5px 14px",fontFamily:"inherit",fontSize:".76rem",fontWeight:700,color:"#475569",cursor:"pointer"}}>+ Add disbursement</button>

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
        {(()=>{
          // Shared row renderer — `ri` is the original index into floatChecks so edits/deletes stay correct
          const checkRow=(row,ri,zebra)=>{
            const set=(patch)=>{const fc=[...floatChecks];fc[ri]={...fc[ri],...patch};f("floatingChecks",fc);};
            return(
              <tr key={row.id||ri} style={{background:row.cleared?"#f0fdf4":zebra%2?C.zebra:"#fff",opacity:row.cleared?.85:1}}>
                <td style={{...td,padding:2}}>{isUntagged(row)&&!row.cleared&&<span style={{color:"#dc2626",fontWeight:700,fontSize:".62rem",marginLeft:4}}>⚠</span>}{bankSelect(row.bank,v=>set({bank:v}))}</td>
                {/* Editing either field saves both, moving an old one-text row to the split format */}
                <td style={{...td,padding:2}}>{textCell(payeeRaw(row),v=>set({payee:v,particulars:particularsRaw(row)}),"Payee")}</td>
                <td style={{...td,padding:2}}>{textCell(particularsRaw(row),v=>set({payee:payeeRaw(row),particulars:v}),"e.g. Supplier payment, PO #")}</td>
                <td style={{...td,padding:2}}>{textCell(row.checkNo??"",v=>set({checkNo:v}),"#")}</td>
                <td style={{...td,padding:2}}>
                  <CurrInp value={row.amount||""} onChange={e=>set({amount:e.target.value})} style={{textAlign:"right",fontSize:".8rem",padding:"5px 8px"}}/>
                </td>
                <td style={{...td,textAlign:"center"}}>
                  {row.cleared
                    ?<span style={{display:"inline-flex",alignItems:"center",gap:5}}>
                      <span title={row.clearedDate?`Cleared ${fmtDate(row.clearedDate)}`:"Cleared"} style={{fontSize:".64rem",fontWeight:800,padding:"2px 8px",borderRadius:20,color:"#047857",background:"#dcfce7",border:"1px solid #86efac"}}>✓ Cleared{row.clearedDate?` · ${fmtDate(row.clearedDate)}`:""}</span>
                      <button onClick={()=>set({cleared:false,clearedDate:null,reopened:selDate})} title="Mark as still floating" style={{background:"none",border:"none",color:"#64748b",cursor:"pointer",fontSize:".66rem",padding:0}}>undo</button>
                    </span>
                    :<span style={{display:"inline-flex",alignItems:"center",gap:5}}>
                      <span style={{fontSize:".64rem",fontWeight:800,padding:"2px 8px",borderRadius:20,color:"#b45309",background:"#fef3c7",border:"1px solid #fde68a"}}>● Floating{row.carried?" · carried":""}</span>
                      <button onClick={()=>set({cleared:true,clearedDate:selDate,reopened:null})} title="Mark this check cleared" style={{background:"#ecfdf5",border:"1px solid #a7f3d0",borderRadius:5,padding:"2px 7px",color:"#047857",cursor:"pointer",fontSize:".64rem",fontWeight:700,fontFamily:"inherit"}}>Mark cleared</button>
                    </span>}
                </td>
                <td style={{...td,padding:2,textAlign:"center",border:"none"}}>{delBtn(()=>f("floatingChecks",floatChecks.filter((_,j)=>j!==ri)))}</td>
              </tr>
            );
          };
          const headRow=(
            <tr>
              <th style={{...th,textAlign:"left",width:mob?110:170}}>Bank</th>
              <th style={{...th,textAlign:"left"}}>Payee</th>
              <th style={{...th,textAlign:"left"}}>Particulars</th>
              <th style={{...th,width:mob?80:110}}>Check No.</th>
              <th style={{...th,width:mob?100:150}}>Amount</th>
              <th style={{...th,width:mob?96:150}}>Status</th>
              <th style={{...th,width:40,background:"#fff",border:"none"}}></th>
            </tr>
          );
          // Pair each check with its original index, then split by cleared status
          const indexed=floatChecks.map((row,ri)=>({row,ri}));
          const openRows=indexed.filter(x=>!x.row.cleared);
          const clearedRows=indexed.filter(x=>x.row.cleared);
          return(
          <>
            {sectionHdr("Floating Checks (uncleared)","#b45309",
              <span style={{fontWeight:800,fontSize:".72rem",color:"#fff"}}>{peso(floatingTotal)}</span>
            )}
            <div style={{padding:"10px 12px 14px"}}>
              <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}><table style={{borderCollapse:"collapse",width:"100%",maxWidth:1000,minWidth:mob?720:0}}>
                <thead>{headRow}</thead>
                <tbody>
                  {openRows.length===0&&(
                    <tr><td colSpan={7} style={{...td,color:"#94a3b8",fontStyle:"italic",padding:"10px"}}>No floating checks. Add released cheques below — they stay here every day until you mark them cleared.</td></tr>
                  )}
                  {openRows.map(({row,ri},i)=>checkRow(row,ri,i))}
                  <tr style={{background:"#f1e9e2"}}>
                    <td style={{...td,fontWeight:900,color:"#7c2d12"}} colSpan={4}>TOTAL FLOATING (uncleared)</td>
                    <td style={{...td,...numCell,fontWeight:900,color:"#b45309"}}>{fmt2(floatingTotal)}</td>
                    <td style={{...td,border:"none",background:"#fff"}} colSpan={2}></td>
                  </tr>
                </tbody>
              </table></div>
              <button onClick={()=>f("floatingChecks",[...floatChecks,{id:uid(),bank:"",payee:"",particulars:"",checkNo:"",amount:"",cleared:false}])} style={{marginTop:10,background:"#f8fafc",border:"1.5px dashed #cbd5e1",borderRadius:8,padding:"5px 14px",fontFamily:"inherit",fontSize:".76rem",fontWeight:700,color:"#475569",cursor:"pointer"}}>+ Add floating check</button>
              <div style={{marginTop:8,fontSize:".68rem",color:"#94a3b8",fontStyle:"italic",lineHeight:1.5}}>
                Uncleared checks feed the <b>Float Check</b> column and lower the <b>Book</b> balance. They carry into each new day automatically until you click <b>Mark cleared</b> — clearing simply drops the check from Float; adjust the affected bank's Beginning balance to reflect the cash leaving.
              </div>
            </div>

            {/* CLEARED FLOATING CHECKS — separated out once marked cleared */}
            {clearedRows.length>0&&<>
              {sectionHdr("Cleared Checks","#047857",
                <span style={{fontWeight:800,fontSize:".72rem",color:"#fff"}}>{peso(clearedTotal)}</span>
              )}
              <div style={{padding:"10px 12px 14px"}}>
                <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}><table style={{borderCollapse:"collapse",width:"100%",maxWidth:1000,minWidth:mob?720:0}}>
                  <thead>{headRow}</thead>
                  <tbody>
                    {clearedRows.map(({row,ri},i)=>checkRow(row,ri,i))}
                    <tr style={{background:"#e7f5ef"}}>
                      <td style={{...td,fontWeight:900,color:"#065f46"}} colSpan={4}>TOTAL CLEARED</td>
                      <td style={{...td,...numCell,fontWeight:900,color:"#047857"}}>{fmt2(clearedTotal)}</td>
                      <td style={{...td,border:"none",background:"#fff"}} colSpan={2}></td>
                    </tr>
                  </tbody>
                </table></div>
                <div style={{marginTop:8,fontSize:".68rem",color:"#94a3b8",fontStyle:"italic",lineHeight:1.5}}>
                  These checks have been marked cleared — they no longer feed the <b>Float Check</b> column and do not carry into the next day. Click <b>undo</b> to move one back to floating.
                </div>
              </div>
            </>}
          </>
          );
        })()}

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
                      {e.pastEdit&&<div style={{fontSize:".72rem",color:"#7c2d12",marginTop:3}}>🔓 Changed after the day locked — reason: <b>{e.pastEdit.reason}</b></div>}
                      {e.override&&<div style={{fontSize:".72rem",color:"#991b1b",marginTop:3}}>⛔ Saved with {e.override.missing?.length||0} check(s) from {fmtDate(e.override.vsDay)} missing — reason: <b>{e.override.reason}</b></div>}
                      {Array.isArray(e.duplicates)&&e.duplicates.length>0&&<div style={{fontSize:".7rem",color:"#b45309",marginTop:2}}>⚠ Saved with {e.duplicates.length} possible duplicate check{e.duplicates.length!==1?"s":""}: {e.duplicates.map(d=>`${d.a} ↔ ${d.b}`).join(" · ")}</div>}
                      {Array.isArray(e.unexplained)&&e.unexplained.length>0&&<div style={{fontSize:".7rem",color:"#b45309",marginTop:2}}>⚠ Unexplained beginning movement: {e.unexplained.map(u=>`${u.bank} ${u.diff>0?"+":"−"}${peso(Math.abs(u.diff))}`).join(" · ")}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      </fieldset>
      {pos.savedAt&&<div style={{textAlign:"right",fontSize:".7rem",color:"#94a3b8",marginTop:6}}>Last saved: {new Date(pos.savedAt).toLocaleString("en-PH")}</div>}
    </div>
  );
}

export default DailyCashPosition;
