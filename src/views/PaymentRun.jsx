import React,{useState,useEffect,useMemo,useCallback} from "react";
import {today as TODAY,BANKS,Modal,Fld,Inp,Sel,uiAlert,uiConfirm,uiPrompt,addDaysLocalISO,useIsMobile} from "../shared";
import {projDisplayName,milestonePaid,clientOnCreditTerms} from "../core";
import {supabase,isSupabaseReady} from "../supabaseClient";
import {num,r2,php2,vendorKey,payBalance,payIsOpen,deliveryOf} from "../data/ledger";
import {chip,linkBtn,LedgerHost} from "./Ledgers";

// ─── WEEKLY PAYMENT RUN (Finance) ──────────────────────────────────────────
// The payments loop of "GMD Monitoring Flow" (Nov 2026):
//   Mon  12 nn cut-off: Finance lists the bills to pay this Thursday (Draft)
//   Tue  proposal against cash on the Daily Cash Position (Proposed; Telegram)
//   Wed  a Manager who didn't propose it approves the run (approve_payment_run:
//        every bill in it is approved under the normal rules, in one step)
//   Thu  release: Finance records each supplier's payment; the run is Released
// The database keeps the stamps and the status rules (migration
// 20261105042842_payment_runs_and_2307.sql). A payment outside a run is still
// possible for urgent cases; the monitoring board counts it as off-cycle.

const C={ink:"#0f172a",muted:"#64748b",faint:"#94a3b8",line:"#e2e8f0",ok:"#059669",warn:"#d97706",bad:"#dc2626",navy:"#0B2545"};
const METHODS=["Check","Bank transfer","Online","Cash"];
const ST_CLR={Draft:C.muted,Proposed:C.warn,Approved:"#2563eb",Released:C.ok,Cancelled:C.faint};
const btnS=(clr,ghost)=>({background:ghost?"#fff":clr,color:ghost?clr:"#fff",border:`1px solid ${clr}`,borderRadius:8,padding:"8px 14px",fontSize:".78rem",fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"});
const billLabel=b=>[b.apNumber,b.poId||b.poNumber||b.invoiceNumber].filter(Boolean).join(" · ")||"bill";
const approvedBill=b=>(b.approvalStatus||"Approved")==="Approved";

// Thursday of the week containing d (Mon–Sun), or next week's once it has passed.
export const runThursday=(d=TODAY)=>{
  const x=new Date(d+"T00:00:00");const dow=(x.getDay()+6)%7; // Mon=0
  const thu=addDaysLocalISO(d,3-dow);
  return thu<d?addDaysLocalISO(thu,7):thu;
};
// Cash on the latest saved Daily Cash Position up to today: operating banks' ending.
export const latestCash=(cashPositions={},today=TODAY)=>{
  const days=Object.keys(cashPositions).filter(k=>k<=today).sort();
  const d=days[days.length-1];
  if(!d) return {amount:null,date:null};
  const pos=cashPositions[d];
  const amount=BANKS.filter(b=>b.type==="Operating").reduce((s,b)=>s+num(pos?.banks?.[b.id]?.end),0);
  return {amount:r2(amount),date:d};
};
const fromSb=r=>({...r,releaseDate:r.release_date,items:Array.isArray(r.items)?r.items:[]});

// Client cash vs supplier cash per project (Paulo, 2026-11-11): a prompt, never a
// block. For each project this run pays, compare what the client has paid
// (deal_dp_paid: the larger of deals.amount_paid and its non-bounced billing
// payments) with what suppliers have been paid on it plus what this run still
// pays. `fronted` > 0 means GMD would be paying suppliers with its own cash.
// Internal GMD jobs and clients on credit terms are skipped: fronting is their
// normal terms. Bills with no project (stock, cost centres) are not counted.
// Pure: returns Map(projectId -> {deal, clientPaid, supplierPaid, thisRun, fronted}).
export const clientCashCover=({items=[],byId=new Map(),deals=[],billings=[],payables=[],payPays=[],paidOnRun=()=>0})=>{
  const out=new Map();
  const runByProj=new Map();
  items.forEach(it=>{
    const b=byId.get(it.payableId);const pid=b?.projectId;if(!pid) return;
    const left=Math.max(0,num(it.amount)-num(paidOnRun(it)));
    runByProj.set(pid,(runByProj.get(pid)||0)+left);
  });
  if(!runByProj.size) return out;
  const projOfBill=new Map(payables.map(p=>[p.id,p.projectId]));
  const supPaid=new Map();
  (payPays||[]).forEach(x=>{
    if(x.status==="Cancelled") return;
    const pid=projOfBill.get(x.payableId);
    if(pid&&runByProj.has(pid)) supPaid.set(pid,(supPaid.get(pid)||0)+num(x.amount));
  });
  runByProj.forEach((thisRun,pid)=>{
    const deal=deals.find(d=>d.id===pid);
    if(!deal||/^GMD Production/i.test(deal.client||"")||clientOnCreditTerms(deal.client)) return;
    const viaBilling=billings.filter(m=>m.dealId===pid).reduce((t,m)=>t+milestonePaid(m),0);
    const clientPaid=r2(Math.max(num(deal.amountPaid),viaBilling));
    const supplierPaid=r2(supPaid.get(pid)||0);
    const fronted=r2(supplierPaid+thisRun-clientPaid);
    out.set(pid,{deal,clientPaid,supplierPaid,thisRun:r2(thisRun),fronted});
  });
  return out;
};

export default function PaymentRun({payables=[],payPays=[],prs=[],swos=[],exps=[],deals=[],billings=[],cashPositions={},today=TODAY,role="",session,canPay=false,onPayMany,onBillsApproved,sendTelegramNotification}){
  const mob=useIsMobile();
  const isMgr=role==="Manager";
  const canEdit=["Manager","Finance","FinanceAssistant"].includes(role);
  const me=session?.name||"";
  const[release,setRelease]=useState(()=>runThursday(today));
  const[runs,setRuns]=useState([]);
  const[loading,setLoading]=useState(true);
  const[err,setErr]=useState("");
  const[busy,setBusy]=useState(false);
  const[draft,setDraft]=useState(null);   // {payableId: amount} while editing
  const[payFor,setPayFor]=useState(null);
  const[ledger,setLedger]=useState(null);

  const load=useCallback(async()=>{
    if(!isSupabaseReady()){setErr("No server connection.");setLoading(false);return;}
    setLoading(true);
    const{data,error}=await supabase.from("payment_runs").select("*").order("release_date",{ascending:false}).limit(60);
    if(error) setErr(error.message); else {setErr("");setRuns((data||[]).map(fromSb));}
    setLoading(false);
  },[]);
  useEffect(()=>{load();},[load]);

  const run=runs.find(r=>r.releaseDate===release&&r.status!=="Cancelled")||null;
  const byId=useMemo(()=>new Map(payables.map(p=>[p.id,p])),[payables]);
  const projName=id=>{const d=id&&deals.find(x=>x.id===id);return d?projDisplayName(d):"";};
  const receiptOf=b=>{
    const no=b.poId||b.poNumber;if(!no) return null;
    const lines=prs.filter(x=>x.poNumber===no);
    if(lines.length) return deliveryOf(lines);
    const wo=swos.find(w=>w.woNumber===no);
    return wo?`${num(b.verificationPct)}% certified`:null;
  };
  const notReceived=b=>{const rc=receiptOf(b);return rc==="Not delivered"||rc==="Partly delivered";};
  // Candidates: open bills due by the release date (or undated), not rejected.
  const candidates=useMemo(()=>payables.filter(p=>payIsOpen(p)&&p.approvalStatus!=="Rejected"&&(!p.dueDate||p.dueDate<=release))
    .sort((a,b)=>String(a.vendor||"").localeCompare(String(b.vendor||""))||String(a.dueDate||"9999").localeCompare(String(b.dueDate||"9999"))),[payables,release]);
  const cash=latestCash(cashPositions,today);

  const items=draft?Object.entries(draft).map(([payableId,amount])=>({payableId,amount:num(amount)})):(run?.items||[]);
  const total=r2(items.reduce((s,i)=>s+num(i.amount),0));
  const cover=cash.amount==null?null:cash.amount>=total?"Fully":cash.amount>0?"Partly":"No";
  const COVER_CLR={Fully:C.ok,Partly:C.warn,No:C.bad};

  // Group a run's items by supplier for display and release.
  const groups=useMemo(()=>{
    const m=new Map();
    items.forEach(it=>{
      const b=byId.get(it.payableId);
      const k=vendorKey(b?.vendor)||"__"+it.payableId;
      if(!m.has(k)) m.set(k,{key:k,name:b?.vendor||"(bill not loaded)",rows:[]});
      m.get(k).rows.push({...it,b});
    });
    return [...m.values()].sort((a,b)=>a.name.localeCompare(b.name));
  },[items,byId]);
  const paidOnRun=it=>{
    // Paid since the run was approved: active payments on the bill dated on/after approval day.
    const since=String(run?.approved_at||run?.approvedAt||"").slice(0,10)||release;
    return r2(payPays.filter(x=>x.payableId===it.payableId&&x.status!=="Cancelled"&&String(x.payDate||"")>=addDaysLocalISO(since,-1)).reduce((s,x)=>s+num(x.amount),0));
  };
  const cliCover=useMemo(()=>clientCashCover({items,byId,deals,billings,payables,payPays,paidOnRun}),
    // paidOnRun reads run + payPays, both listed
    [items,byId,deals,billings,payables,payPays,run]);
  const fronting=[...cliCover.values()].filter(c=>c.fronted>0.5).sort((a,b)=>b.fronted-a.fronted);
  const frontChip=pid=>{const c=pid&&cliCover.get(pid);if(!c||c.fronted<=0.5) return null;
    return <span title={`Client paid ${php2(c.clientPaid)} · suppliers paid ${php2(c.supplierPaid)} · this run ${php2(c.thisRun)}`}>{chip(c.clientPaid>0?`GMD fronts ${php2(c.fronted)}`:"Client hasn't paid",C.bad)}</span>;};
  const frontLines=()=>fronting.map(c=>`• ${projDisplayName(c.deal)}: client paid ${php2(c.clientPaid)}, suppliers ${php2(c.supplierPaid)} + this run ${php2(c.thisRun)} → GMD fronts ${php2(c.fronted)}`).join("\n");
  const allPaid=run?.status==="Approved"&&groups.every(g=>g.rows.every(it=>!it.b||paidOnRun(it)>=Math.min(num(it.amount),num(it.b.amount))-0.01||!payIsOpen(it.b)));

  const update=async(patch,okMsg)=>{
    setBusy(true);
    const{data,error}=await supabase.from("payment_runs").update(patch).eq("id",run.id).select("*").maybeSingle();
    setBusy(false);
    if(error||!data){await uiAlert({title:"Not saved",message:error?.message||"Run not found. Refresh."});return false;}
    setRuns(rs=>rs.map(r=>r.id===data.id?fromSb(data):r));
    return true;
  };
  const startRun=async()=>{
    // Default selection: approved or pending bills that were received (or aren't PO bills).
    const pick={};candidates.filter(b=>!notReceived(b)).forEach(b=>{pick[b.id]=payBalance(b);});
    setBusy(true);
    const{data,error}=await supabase.from("payment_runs").insert({release_date:release,items:Object.entries(pick).map(([payableId,amount])=>({payableId,amount}))}).select("*").maybeSingle();
    setBusy(false);
    if(error||!data){await uiAlert({title:"Run not started",message:error?.message||"Try again."});return;}
    setRuns(rs=>[fromSb(data),...rs]);
    setDraft(Object.fromEntries(Object.entries(pick).map(([k,v])=>[k,String(v)])));
  };
  const editDraft=()=>setDraft(Object.fromEntries((run?.items||[]).map(i=>[i.payableId,String(i.amount)])));
  const saveDraft=async()=>{
    const list=Object.entries(draft).map(([payableId,amount])=>({payableId,amount:r2(amount)})).filter(i=>i.amount>0);
    for(const i of list){const b=byId.get(i.payableId);if(b&&i.amount>payBalance(b)+0.005){await uiAlert(`${b.vendor} ${billLabel(b)}: ${php2(i.amount)} is more than the open balance ${php2(payBalance(b))}.`);return false;}}
    if(await update({items:list})){setDraft(null);return list;}
    return false;
  };
  const propose=async()=>{
    // Use what was just saved, not this render's (older) copy of the run.
    let its=run.items;
    if(draft){const saved=await saveDraft();if(!saved) return;its=saved;}
    if(!its.length){await uiAlert("Add at least one bill to the run.");return;}
    const t=r2(its.reduce((s,i)=>s+num(i.amount),0));
    if(!(await uiConfirm({title:"Propose this run to Management",confirmLabel:"Propose",message:`${its.length} bill(s), ${php2(t)}, for release on ${release}.\n\nCash on the ${cash.date||"latest"} cash position: ${cash.amount==null?"not saved yet":php2(cash.amount)}.`}))) return;
    if(await update({status:"Proposed",cash_available:cash.amount,cash_as_of:cash.date})){
      sendTelegramNotification&&sendTelegramNotification("management",`💸 <b>Payment run proposed</b>\nRelease: ${release}\n${its.length} bill(s) · ₱${t.toLocaleString("en-PH",{minimumFractionDigits:2})}\nCash (${cash.date||"—"}): ${cash.amount==null?"—":"₱"+cash.amount.toLocaleString("en-PH",{minimumFractionDigits:2})}${cover?` · ${cover==="Fully"?"covered":cover==="Partly"?"PARTLY covered":"NOT covered"}`:""}\nBy: ${me}${fronting.length?`\n💸 Suppliers paid ahead of the client on ${fronting.length} project(s): GMD fronts ₱${fronting.reduce((t,c)=>t+c.fronted,0).toLocaleString("en-PH",{minimumFractionDigits:2})}`:""}\nApprove in FabHub › Finance › Payment Run.`);
    }
  };
  const sendBack=async()=>{
    const why=await uiPrompt({title:"Send the run back for changes",confirmLabel:"Send back",message:"What should change? (kept in the run notes)"});
    if(why==null) return;
    await update({status:"Draft",notes:[run.notes,`Sent back by ${me}: ${why}`].filter(Boolean).join("\n")});
  };
  const approve=async()=>{
    const notRecv=items.map(i=>byId.get(i.payableId)).filter(b=>b&&notReceived(b));
    if(!(await uiConfirm({title:`Approve payment run · ${release}`,confirmLabel:"Approve run",tone:notRecv.length?"danger":undefined,
      message:`${items.length} bill(s), ${php2(total)}. Every pending bill in it is approved for payment.`+(notRecv.length?`\n\n⚠️ ${notRecv.length} of them ${notRecv.length>1?"are POs":"is a PO"} not fully delivered: ${notRecv.map(b=>`${b.vendor} ${billLabel(b)}`).join(", ")}.`:"")
      +(fronting.length?`\n\n💸 Suppliers paid ahead of the client on ${fronting.length} project${fronting.length>1?"s":""} (GMD fronts ${php2(fronting.reduce((t,c)=>t+c.fronted,0))}):\n${frontLines()}`:"")}))) return;
    setBusy(true);
    const{data,error}=await supabase.rpc("approve_payment_run",{p_id:run.id});
    setBusy(false);
    if(error){await uiAlert({title:"Run not approved",message:error.message});return;}
    await load();
    sendTelegramNotification&&sendTelegramNotification("management",`✅ <b>Payment run approved</b>\nRelease: ${release} · ${items.length} bill(s) · ₱${total.toLocaleString("en-PH",{minimumFractionDigits:2})}\nApproved by: ${me}${data?.approved_bills?` · ${data.approved_bills} bill(s) approved`:""}`);
    onBillsApproved&&onBillsApproved(items.map(i=>i.payableId));
  };
  const cancelRun=async()=>{
    const why=await uiPrompt({title:"Cancel this payment run",tone:"danger",confirmLabel:"Cancel run",message:"Why? (at least 5 characters, kept on the run)"});
    if(!why||why.trim().length<5) return;
    await update({status:"Cancelled",cancel_reason:why.trim()});
  };
  const release_=async()=>{
    if(!(await uiConfirm({title:"Mark the run released",confirmLabel:"Mark released",message:"Every supplier in this run has been paid. Close the run?"}))) return;
    await update({status:"Released"});
  };
  const startPay=g=>{
    const entries=g.rows.filter(it=>it.b&&payIsOpen(it.b)).map(it=>({payableId:it.payableId,amount:Math.min(r2(it.amount)-paidOnRun(it),payBalance(it.b))})).filter(e=>e.amount>0.005);
    if(!entries.length){uiAlert("Nothing left to pay for this supplier in the run.");return;}
    setPayFor({g,entries,form:{date:today,method:"Check",bank:"bpi",ref:""}});
  };
  const submitPay=async()=>{
    const{entries,form,g}=payFor;
    if(form.method==="Check"&&!form.ref.trim()){await uiAlert("Enter the check number.");return;}
    setBusy(true);
    // runCleared: a Manager approved these bills in this run, including any PO
    // not fully delivered (they were warned at approval), so the receipt check
    // in recordPayments lets them through.
    const ok=await onPayMany(entries,{date:form.date,method:form.method,bank:form.bank,ref:form.ref.trim(),note:`Payment run ${release}: ${g.name}`,runCleared:true});
    setBusy(false);
    if(ok) setPayFor(null);
  };

  const step=(k,l,d,on,done)=>(
    <div key={k} style={{flex:"1 1 120px",border:`1px solid ${on?C.navy:C.line}`,background:done?"#f0fdf4":on?"#eef2ff":"#fff",borderRadius:10,padding:"8px 10px"}}>
      <div style={{fontSize:".62rem",fontWeight:800,color:C.muted,letterSpacing:".6px"}}>{k}</div>
      <div style={{fontSize:".8rem",fontWeight:800,color:C.ink}}>{done?"✓ ":""}{l}</div>
      <div style={{fontSize:".66rem",color:C.faint}}>{d}</div>
    </div>
  );
  const st=run?.status;
  const order=["Draft","Proposed","Approved","Released"];
  const at=st?order.indexOf(st):-1;

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,flexWrap:"wrap",marginBottom:12}}>
        <div>
          <div style={{fontWeight:800,color:C.navy,fontSize:"1.05rem"}}>💸 Payment Run</div>
          <div style={{fontSize:".76rem",color:C.muted,marginTop:2,maxWidth:720}}>One weekly run: list on Monday, propose against cash on Tuesday, Management approves on Wednesday, release on Thursday.</div>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <label style={{fontSize:".72rem",color:C.muted}}>Release on <input type="date" value={release} onChange={e=>{setRelease(e.target.value||runThursday(today));setDraft(null);}} style={{border:"1.5px solid #e2e8f0",borderRadius:8,padding:"6px 9px",fontFamily:"inherit",fontSize:".78rem"}}/></label>
          <button onClick={load} style={btnS(C.muted,true)} title="Refresh">🔄</button>
        </div>
      </div>
      {err&&<div style={{background:"#fef2f2",border:"1px solid #fecaca",color:C.bad,borderRadius:8,padding:"8px 12px",fontSize:".78rem",marginBottom:10}}>{err}</div>}

      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
        {step("MON","List bills","cut-off 12 nn",at===0,at>0)}
        {step("TUE","Propose vs cash","Finance",at===0||at===1,at>=1)}
        {step("WED","Approve run","Management",at===1,at>=2)}
        {step("THU","Release","record payments",at===2,at>=3)}
      </div>

      <div style={{display:"grid",gridTemplateColumns:mob?"1fr 1fr":"repeat(4,1fr)",gap:8,marginBottom:12}}>
        {[["Run",st?<span style={{color:ST_CLR[st]}}>{st}</span>:"Not started",null,run?`by ${run.proposed_by||run.created_by||"—"}`:release],
          ["Bills / total",php2(total),null,`${items.length} bill(s)`],
          ["Cash available",cash.amount==null?"—":php2(cash.amount),null,cash.date?`operating banks, ${cash.date}`:"no cash position saved"],
          ["Covered by cash",cover||"—",cover?COVER_CLR[cover]:C.faint,cover&&cover!=="Fully"&&cash.amount!=null?`short ${php2(total-cash.amount)}`:""]].map(([l,v,c,f])=>(
          <div key={l} style={{border:`1px solid ${C.line}`,borderRadius:10,padding:"9px 12px",background:"#fff"}}>
            <div style={{fontSize:".62rem",fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:".5px"}}>{l}</div>
            <div style={{fontSize:"1rem",fontWeight:800,color:c||C.ink,marginTop:2}}>{v}</div>
            {f&&<div style={{fontSize:".66rem",color:C.faint}}>{f}</div>}
          </div>
        ))}
      </div>
      {run?.notes&&<div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:8,padding:"8px 12px",fontSize:".74rem",color:"#92400e",marginBottom:10,whiteSpace:"pre-wrap"}}>{run.notes}</div>}

      {/* Actions */}
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
        {loading&&<span style={{fontSize:".78rem",color:C.faint}}>Loading…</span>}
        {!loading&&!run&&canEdit&&<button disabled={busy} onClick={startRun} style={btnS(C.navy)}>Start the {release} run ({candidates.length} bill(s) due)</button>}
        {!loading&&!run&&!canEdit&&<span style={{fontSize:".78rem",color:C.muted}}>No run yet for {release}.</span>}
        {st==="Draft"&&canEdit&&!draft&&<button disabled={busy} onClick={editDraft} style={btnS(C.navy,true)}>Edit bills</button>}
        {st==="Draft"&&canEdit&&draft&&<button disabled={busy} onClick={saveDraft} style={btnS(C.navy,true)}>Save bills</button>}
        {st==="Draft"&&canEdit&&<button disabled={busy} onClick={propose} style={btnS(C.warn)}>Propose to Management</button>}
        {st==="Proposed"&&isMgr&&<button disabled={busy} onClick={approve} style={btnS(C.ok)}>Approve run</button>}
        {st==="Proposed"&&canEdit&&<button disabled={busy} onClick={sendBack} style={btnS(C.muted,true)}>Send back for changes</button>}
        {st==="Proposed"&&!isMgr&&<span style={{fontSize:".76rem",color:C.warn,alignSelf:"center"}}>Waiting for a Manager to approve.</span>}
        {allPaid&&canEdit&&<button disabled={busy} onClick={release_} style={btnS(C.ok)}>Mark run released</button>}
        {run&&["Draft","Proposed","Approved"].includes(st)&&(isMgr||(st!=="Approved"&&(run.proposed_by||run.created_by)===me))&&<button disabled={busy} onClick={cancelRun} style={btnS(C.bad,true)}>Cancel run</button>}
      </div>

      {/* Draft editor: every candidate with a checkbox */}
      {st==="Draft"&&draft&&(
        <div style={{background:"#fff",border:`1px solid ${C.line}`,borderRadius:12,padding:"10px 12px",marginBottom:12}}>
          <div style={{fontSize:".74rem",color:C.muted,marginBottom:8}}>Bills due by {release} (and undated). PO bills not fully delivered start unticked: the monitoring flow pays only matched bills.</div>
          {candidates.map(b=>{
            const on=draft[b.id]!=null;const rc=receiptOf(b);
            return(
              <div key={b.id} style={{display:"flex",gap:10,alignItems:"center",padding:"7px 0",borderBottom:"1px solid #f1f5f9",flexWrap:mob?"wrap":"nowrap"}}>
                <input type="checkbox" checked={on} onChange={()=>setDraft(d=>{const n={...d};if(on)delete n[b.id];else n[b.id]=String(payBalance(b));return n;})} aria-label={`Include ${b.vendor} ${billLabel(b)}`}/>
                <div style={{flex:1,minWidth:0,fontSize:".78rem"}}>
                  <div style={{fontWeight:700}}><button style={{...linkBtn,color:C.ink}} onClick={()=>setLedger({kind:"supplier",id:b.vendor,tab:"pays"})}>{b.vendor||"—"}</button> <span style={{fontWeight:500,color:C.muted}}>{billLabel(b)}</span></div>
                  <div style={{fontSize:".68rem",color:C.muted,display:"flex",gap:5,flexWrap:"wrap",marginTop:2}}>
                    <span style={{color:b.dueDate&&b.dueDate<today?C.bad:C.muted}}>{b.dueDate?`due ${b.dueDate}`:"no due date"}</span>
                    {projName(b.projectId)&&<span>· {projName(b.projectId)}</span>}
                    {on&&frontChip(b.projectId)}
                    {!approvedBill(b)&&chip("Pending approval",C.warn)}
                    {rc&&chip(rc,rc==="Delivered"?C.ok:notReceived(b)?C.bad:C.muted)}
                  </div>
                </div>
                <div style={{textAlign:"right",fontSize:".72rem",color:C.faint,whiteSpace:"nowrap"}}>balance {php2(payBalance(b))}</div>
                <input type="text" inputMode="decimal" disabled={!on} value={on?draft[b.id]:""} onChange={e=>setDraft(d=>({...d,[b.id]:e.target.value}))} style={{width:110,border:"1.5px solid #e2e8f0",borderRadius:7,padding:"6px 8px",fontFamily:"inherit",fontSize:".78rem",textAlign:"right"}} aria-label="Amount to pay"/>
              </div>
            );
          })}
          {candidates.length===0&&<div style={{padding:16,textAlign:"center",color:C.faint,fontSize:".8rem"}}>No open bills due by {release}.</div>}
        </div>
      )}

      {/* Client cash vs supplier cash: a prompt for whoever approves, never a block */}
      {fronting.length>0&&st!=="Released"&&(
        <div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:12,padding:"10px 12px",marginBottom:12,fontSize:".76rem",color:"#991b1b"}}>
          <div style={{fontWeight:800,marginBottom:4}}>💸 Paying suppliers ahead of the client on {fronting.length} project{fronting.length>1?"s":""}: GMD fronts {php2(fronting.reduce((t,c)=>t+c.fronted,0))}</div>
          {fronting.slice(0,8).map(c=>(
            <div key={c.deal.id} style={{display:"flex",justifyContent:"space-between",gap:10,flexWrap:"wrap",padding:"2px 0"}}>
              <span style={{fontWeight:600}}>{projDisplayName(c.deal)}</span>
              <span style={{whiteSpace:"nowrap"}}>client paid {php2(c.clientPaid)} · suppliers {php2(c.supplierPaid)} + this run {php2(c.thisRun)} · <b>fronts {php2(c.fronted)}</b></span>
            </div>
          ))}
          {fronting.length>8&&<div style={{color:C.muted}}>+{fronting.length-8} more</div>}
          <div style={{color:C.muted,marginTop:4}}>Not a block: suppliers on COD or advance terms may need paying first. The Manager approving the run decides. Internal GMD jobs and credit-terms clients aren't counted.</div>
        </div>
      )}

      {/* The run, per supplier */}
      {run&&!draft&&(
        <div>
          {groups.map(g=>{
            const gTotal=r2(g.rows.reduce((s,it)=>s+num(it.amount),0));
            const gPaid=r2(g.rows.reduce((s,it)=>s+Math.min(paidOnRun(it),num(it.amount)),0));
            const done=st==="Released"||(st==="Approved"&&gPaid>=gTotal-0.01);
            return(
              <div key={g.key} style={{background:"#fff",border:`1px solid ${C.line}`,borderRadius:12,padding:"10px 12px",marginBottom:8}}>
                <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",flexWrap:"wrap"}}>
                  <div style={{fontWeight:800,fontSize:".86rem"}}><button style={{...linkBtn,color:C.ink}} onClick={()=>setLedger({kind:"supplier",id:g.name,tab:"pays"})}>{g.name}</button></div>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <b style={{fontSize:".9rem"}}>{php2(gTotal)}</b>
                    {done?chip("Paid",C.ok):st==="Approved"&&canPay&&<button disabled={busy} onClick={()=>startPay(g)} style={btnS(C.ok)}>Record payment</button>}
                  </div>
                </div>
                {g.rows.map(it=>{
                  const b=it.b;const rc=b&&receiptOf(b);
                  return(
                    <div key={it.payableId} style={{display:"flex",justifyContent:"space-between",gap:10,fontSize:".74rem",color:C.muted,marginTop:5,flexWrap:"wrap"}}>
                      <span>{b?billLabel(b):"bill not loaded"}{b?.dueDate?` · due ${b.dueDate}`:""}{b&&projName(b.projectId)?` · ${projName(b.projectId)}`:""} {b&&frontChip(b.projectId)} {b&&!approvedBill(b)&&chip("Pending approval",C.warn)} {rc&&notReceived(b)&&chip(rc,C.bad)}</span>
                      <span style={{whiteSpace:"nowrap"}}>{php2(it.amount)}{st==="Approved"&&paidOnRun(it)>0?` · paid ${php2(paidOnRun(it))}`:""}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
          {groups.length===0&&<div style={{padding:16,textAlign:"center",color:C.faint,fontSize:".8rem"}}>No bills in this run yet.</div>}
          {run.approved_by&&<div style={{fontSize:".72rem",color:C.muted,marginTop:6}}>Approved by {run.approved_by} · {String(run.approved_at||"").replace("T"," ").slice(0,16)}{run.released_by?` · released by ${run.released_by}`:""}</div>}
        </div>
      )}

      {/* Past runs */}
      {runs.filter(r=>r.releaseDate!==release).length>0&&(
        <div style={{marginTop:16}}>
          <div style={{fontSize:".7rem",fontWeight:800,color:C.muted,textTransform:"uppercase",letterSpacing:".6px",marginBottom:6}}>Other runs</div>
          {runs.filter(r=>r.releaseDate!==release).slice(0,12).map(r=>(
            <button key={r.id} onClick={()=>{setRelease(r.releaseDate);setDraft(null);}} style={{display:"flex",width:"100%",justifyContent:"space-between",gap:8,background:"#fff",border:`1px solid ${C.line}`,borderRadius:8,padding:"7px 10px",marginBottom:5,cursor:"pointer",fontFamily:"inherit",fontSize:".76rem"}}>
              <span>{r.releaseDate} · {r.items.length} bill(s)</span>
              <span style={{color:ST_CLR[r.status],fontWeight:700}}>{r.status} · {php2(r.items.reduce((s,i)=>s+num(i.amount),0))}</span>
            </button>
          ))}
        </div>
      )}

      <Modal open={!!payFor} onClose={()=>!busy&&setPayFor(null)} title={payFor?`Pay ${payFor.g.name}`:""}>
        {payFor&&<div>
          <div style={{fontSize:".8rem",color:"#475569",marginBottom:12}}>{payFor.entries.length} bill(s) · <b>{php2(payFor.entries.reduce((s,e)=>s+e.amount,0))}</b>, recorded as one payment.</div>
          <Fld label="Date paid" required><Inp type="date" value={payFor.form.date} onChange={e=>setPayFor(p=>({...p,form:{...p.form,date:e.target.value}}))}/></Fld>
          <Fld label="Method"><Sel value={payFor.form.method} onChange={e=>setPayFor(p=>({...p,form:{...p.form,method:e.target.value}}))}>{METHODS.map(m=><option key={m}>{m}</option>)}</Sel></Fld>
          <Fld label="Bank"><Sel value={payFor.form.bank} onChange={e=>setPayFor(p=>({...p,form:{...p.form,bank:e.target.value}}))}>{BANKS.map(b=><option key={b.id} value={b.id}>{b.short}</option>)}</Sel></Fld>
          <Fld label={payFor.form.method==="Check"?"Check number":"Reference no."} required={payFor.form.method==="Check"}><Inp value={payFor.form.ref} onChange={e=>setPayFor(p=>({...p,form:{...p.form,ref:e.target.value}}))}/></Fld>
          <div style={{fontSize:".7rem",color:C.faint,marginBottom:10}}>Then log the disbursement on the Daily Cash Position and link it (🔗) to these bills.</div>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
            <button onClick={()=>setPayFor(null)} disabled={busy} style={btnS(C.muted,true)}>Cancel</button>
            <button onClick={submitPay} disabled={busy} style={btnS(C.ok)}>{busy?"Saving…":"Record payment"}</button>
          </div>
        </div>}
      </Modal>
      {ledger&&<LedgerHost open={ledger} setOpen={setLedger} prs={prs} swos={swos} payables={payables} payPays={payPays} exps={exps} deals={deals} today={today}/>}
    </div>
  );
}

