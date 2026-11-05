import React,{useState,useEffect,useMemo,useCallback} from "react";
import {today as TODAY,Modal,Fld,Inp,Sel,uiAlert,addDaysLocalISO,useIsMobile} from "../shared";
import {projDisplayName,calcTax} from "../core";
import {supabase,isSupabaseReady} from "../supabaseClient";
import {num,r2,php2,vendorKey} from "../data/ledger";
import {chip} from "./Ledgers";

// ─── BIR FORM 2307 TRACKER (Accounting) ────────────────────────────────────
// "2307 & retention" in GMD Monitoring Flow (Nov 2026):
//   • To issue: GMD withheld expanded withholding tax (EWT) when paying a
//     supplier, so it owes that supplier a 2307 for the quarter (due 20 days
//     after the quarter ends). Expected from supplier payments on bills with EWT.
//   • To receive: a client withheld EWT from GMD's billing, so the client owes
//     GMD a 2307 to claim the tax credit. Expected from billing payments on
//     milestones with EWT, per client project.
// What has been issued / received is kept in bir_2307 (migration
// 20261105042842): one row per party per quarter (per deal for clients), with
// the 2307 reference and date. Nothing is deleted.

const C={ink:"#0f172a",muted:"#64748b",faint:"#94a3b8",line:"#e2e8f0",ok:"#059669",warn:"#d97706",bad:"#dc2626",navy:"#0B2545"};
export const quarterOf=d=>{const s=String(d||"");if(!/^\d{4}-\d{2}/.test(s)) return null;return `${s.slice(0,4)}-Q${Math.floor((Number(s.slice(5,7))-1)/3)+1}`;};
export const quarterEnd=q=>{const[y,n]=[Number(q.slice(0,4)),Number(q.slice(-1))];const m=n*3;const last=new Date(y,m,0).getDate();return `${y}-${String(m).padStart(2,"0")}-${String(last).padStart(2,"0")}`;};
const prevQuarter=q=>{const y=Number(q.slice(0,4)),n=Number(q.slice(-1));return n===1?`${y-1}-Q4`:`${y}-Q${n-1}`;};

// Expected 2307s per quarter, from FabHub's own records.
export function expected2307({payables=[],payPays=[],billings=[],deals=[]}){
  const out=[];
  const billById=new Map(payables.map(p=>[p.id,p]));
  const sup=new Map();
  payPays.filter(x=>x.status!=="Cancelled"&&x.kind!=="Retention release"&&num(x.amount)>0).forEach(x=>{
    const b=billById.get(x.payableId);if(!b||!(num(b.ewtAmount)>0)) return;
    const q=quarterOf(x.payDate);if(!q) return;
    const cashDue=Math.max(0.01,num(b.amount)-num(b.ewtAmount));
    const f=Math.min(1,num(x.amount)/cashDue);
    const k=`issue|${vendorKey(b.vendor)}|${q}|`;
    if(!sup.has(k)) sup.set(k,{direction:"issue",party:b.vendor||"",partyKey:vendorKey(b.vendor),quarter:q,dealId:null,taxBase:0,ewt:0,refs:new Set()});
    const g=sup.get(k);g.taxBase+=num(b.netAmount||b.amount)*f;g.ewt+=num(b.ewtAmount)*f;g.refs.add(b.apNumber||b.poId||"");
  });
  const cli=new Map();
  const dealById=new Map(deals.map(d=>[d.id,d]));
  billings.forEach(ms=>{
    const d=dealById.get(ms.dealId);
    let ewt=num(ms.ewt),net=num(ms.net_receivable??ms.netReceivable);
    if(!(ewt>0)&&d){const t=calcTax(num(ms.amount),ms.receiptType??d.receiptType??"OR",ms.withholding??d.withholding??false);ewt=t.ewt;net=t.netReceivable;}
    if(!(ewt>0)) return;
    if(!(net>0)) net=num(ms.amount);
    (ms.payments||[]).forEach(p=>{
      if(p.bounced||!(num(p.amount)>0)) return;
      const q=quarterOf(p.valueDate||p.date);if(!q) return;
      const f=Math.min(1,num(p.amount)/net);
      const party=d?.client||"Client";
      const k=`receive|${vendorKey(party)}|${q}|${ms.dealId||""}`;
      if(!cli.has(k)) cli.set(k,{direction:"receive",party,partyKey:vendorKey(party),quarter:q,dealId:ms.dealId||null,project:d?projDisplayName(d):"",taxBase:0,ewt:0,refs:new Set()});
      const g=cli.get(k);g.taxBase+=num(ms.amount)*f;g.ewt+=ewt*f;if(ms.invoiceNo) g.refs.add(ms.invoiceNo);
    });
  });
  [...sup.values(),...cli.values()].forEach(g=>out.push({...g,taxBase:r2(g.taxBase),ewt:r2(g.ewt),refs:[...g.refs].filter(Boolean)}));
  return out;
}
export const key2307=r=>`${r.direction}|${r.partyKey??r.party_key}|${r.quarter}|${r.dealId??r.deal_id??""}`;

export default function Bir2307({payables=[],payPays=[],billings=[],deals=[],today=TODAY,role="",onRows}){
  const mob=useIsMobile();
  const canEdit=["Manager","Finance","FinanceAssistant","Accounting"].includes(role);
  const[q,setQ]=useState(()=>quarterOf(today));
  const[dir,setDir]=useState("receive");
  const[rows,setRows]=useState([]);
  const[err,setErr]=useState("");
  const[edit,setEdit]=useState(null);
  const[busy,setBusy]=useState(false);
  const load=useCallback(async()=>{
    if(!isSupabaseReady()){setErr("No server connection.");return;}
    const{data,error}=await supabase.from("bir_2307").select("*").order("quarter",{ascending:false}).limit(2000);
    if(error) setErr(error.message); else {setErr("");setRows(data||[]);onRows&&onRows(data||[]);}
  },[onRows]);
  useEffect(()=>{load();},[load]);

  const exp=useMemo(()=>expected2307({payables,payPays,billings,deals}),[payables,payPays,billings,deals]);
  const recByKey=useMemo(()=>new Map(rows.map(r=>[key2307(r),r])),[rows]);
  const quarters=useMemo(()=>[...new Set([quarterOf(today),prevQuarter(quarterOf(today)),...exp.map(e=>e.quarter),...rows.map(r=>r.quarter)])].filter(Boolean).sort().reverse(),[exp,rows,today]);
  const list=exp.filter(e=>e.quarter===q&&e.direction===dir).map(e=>({...e,rec:recByKey.get(key2307(e))}))
    .sort((a,b)=>(a.rec?.status==="Pending"||!a.rec?0:1)-(b.rec?.status==="Pending"||!b.rec?0:1)||b.ewt-a.ewt);
  const done=r=>r.rec&&["Issued","Received","Not required"].includes(r.rec.status);
  const open=list.filter(r=>!done(r));
  const deadline=dir==="issue"?addDaysLocalISO(quarterEnd(q),20):quarterEnd(q);
  const late=today>deadline&&open.length>0;
  const noEwtBills=!payables.some(p=>num(p.ewtAmount)>0);

  const save=async()=>{
    const e=edit;
    if(["Issued","Received"].includes(e.status)&&(!e.ref.trim()||!e.dated)){await uiAlert("Enter the 2307 reference and date.");return;}
    if(e.status==="Not required"&&e.notes.trim().length<5){await uiAlert("Say why no 2307 is needed.");return;}
    setBusy(true);
    const payload={direction:e.row.direction,party:e.row.party,party_key:e.row.partyKey,quarter:e.row.quarter,deal_id:e.row.dealId,
      tax_base:e.row.taxBase,ewt_amount:e.row.ewt,status:e.status,ref:e.ref.trim(),dated:e.dated||null,notes:e.notes};
    const res=e.row.rec?await supabase.from("bir_2307").update(payload).eq("id",e.row.rec.id).select("*").maybeSingle()
      :await supabase.from("bir_2307").insert(payload).select("*").maybeSingle();
    setBusy(false);
    if(res.error||!res.data){await uiAlert({title:"Not saved",message:res.error?.message||"Try again."});return;}
    setRows(rs=>{const n=[res.data,...rs.filter(r=>r.id!==res.data.id)];onRows&&onRows(n);return n;});
    setEdit(null);
  };
  const tab=(k,l,n)=><button key={k} onClick={()=>setDir(k)} style={{padding:"7px 14px",borderRadius:20,border:`1px solid ${dir===k?C.navy:C.line}`,background:dir===k?C.navy:"#fff",color:dir===k?"#fff":C.muted,cursor:"pointer",fontSize:".78rem",fontWeight:700,fontFamily:"inherit"}}>{l} <span style={{opacity:.8}}>{n}</span></button>;
  const countOpen=d=>exp.filter(e=>e.quarter===q&&e.direction===d&&!(recByKey.get(key2307(e))&&["Issued","Received","Not required"].includes(recByKey.get(key2307(e)).status))).length;

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,flexWrap:"wrap",marginBottom:12}}>
        <div>
          <div style={{fontWeight:800,color:C.navy,fontSize:"1.05rem"}}>🧾 BIR 2307 Tracker</div>
          <div style={{fontSize:".76rem",color:C.muted,marginTop:2,maxWidth:720}}>Certificates of tax withheld, per quarter: the ones GMD must give suppliers, and the ones clients must give GMD.</div>
        </div>
        <select value={q} onChange={e=>setQ(e.target.value)} style={{border:"1.5px solid #e2e8f0",borderRadius:8,padding:"7px 10px",fontFamily:"inherit",fontSize:".8rem"}} aria-label="Quarter">{quarters.map(x=><option key={x}>{x}</option>)}</select>
      </div>
      {err&&<div style={{background:"#fef2f2",border:"1px solid #fecaca",color:C.bad,borderRadius:8,padding:"8px 12px",fontSize:".78rem",marginBottom:10}}>{err}</div>}
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
        {tab("receive","To receive from clients",countOpen("receive"))}
        {tab("issue","To issue to suppliers",countOpen("issue"))}
      </div>
      {dir==="issue"&&noEwtBills&&(
        <div style={{background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:9,padding:"9px 12px",fontSize:".76rem",color:"#9a3412",marginBottom:10}}>
          ⚠ No supplier bill in FabHub has withholding tax (EWT) recorded, so this list can't show the 2307s GMD owes suppliers. Set the EWT rate on each bill (Expense Monitoring › Edit, "BIR — VAT / Withholding") when the supplier is subject to it.
        </div>
      )}
      <div style={{display:"grid",gridTemplateColumns:mob?"1fr 1fr":"repeat(3,1fr)",gap:8,marginBottom:12}}>
        {[["Outstanding",String(open.length),open.length?(late?C.bad:C.warn):C.ok,php2(open.reduce((s,r)=>s+r.ewt,0))+" EWT"],
          ["Done",String(list.length-open.length),C.ok,`of ${list.length}`],
          [dir==="issue"?"Issue by":"Quarter ends",deadline,late?C.bad:C.ink,late?"past due":dir==="issue"?"20 days after quarter end":"collect by quarter end"]].map(([l,v,c,f])=>(
          <div key={l} style={{border:`1px solid ${C.line}`,borderRadius:10,padding:"9px 12px",background:"#fff"}}>
            <div style={{fontSize:".62rem",fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:".5px"}}>{l}</div>
            <div style={{fontSize:"1rem",fontWeight:800,color:c,marginTop:2}}>{v}</div>
            <div style={{fontSize:".66rem",color:C.faint}}>{f}</div>
          </div>
        ))}
      </div>
      {list.map(r=>{
        const st=r.rec?.status||"Pending";
        const clr=st==="Pending"?(late?C.bad:C.warn):st==="Not required"?C.faint:C.ok;
        return(
          <div key={key2307(r)} style={{background:"#fff",border:`1px solid ${C.line}`,borderRadius:12,padding:"10px 12px",marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"flex-start",flexWrap:"wrap"}}>
              <div style={{minWidth:0}}>
                <div style={{fontWeight:800,fontSize:".86rem"}}>{r.party||"—"}</div>
                {r.project&&<div style={{fontSize:".72rem",color:C.muted}}>{r.project}</div>}
                <div style={{fontSize:".7rem",color:C.faint,marginTop:2}}>Tax base {php2(r.taxBase)}{r.refs.length?` · ${r.refs.slice(0,4).join(", ")}${r.refs.length>4?"…":""}`:""}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontWeight:800}}>{php2(r.ewt)}</div>
                <div style={{marginTop:3}}>{chip(st,clr)}</div>
              </div>
            </div>
            {r.rec&&r.rec.status!=="Pending"&&<div style={{fontSize:".7rem",color:C.muted,marginTop:5}}>{[r.rec.ref,r.rec.dated,r.rec.notes].filter(Boolean).join(" · ")} · by {r.rec.recorded_by}</div>}
            {canEdit&&<div style={{marginTop:7,display:"flex",gap:6,flexWrap:"wrap"}}>
              <button onClick={()=>setEdit({row:r,status:dir==="issue"?"Issued":"Received",ref:r.rec?.ref||"",dated:r.rec?.dated||today,notes:r.rec?.notes||""})} style={{background:C.ok,color:"#fff",border:"none",borderRadius:7,padding:"6px 12px",fontSize:".74rem",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{st==="Pending"?(dir==="issue"?"Mark issued":"Mark received"):"Edit"}</button>
            </div>}
          </div>
        );
      })}
      {list.length===0&&<div style={{padding:20,textAlign:"center",color:C.faint,fontSize:".8rem",background:"#fff",border:`1px solid ${C.line}`,borderRadius:12}}>{dir==="issue"?"No supplier payments with withholding tax in this quarter.":"No client payments with withholding tax in this quarter."}</div>}
      <div style={{fontSize:".7rem",color:C.faint,marginTop:8}}>Amounts are estimated from FabHub's payments (EWT share of each payment). Check them against the actual 2307 before marking it {dir==="issue"?"issued":"received"}.</div>

      <Modal open={!!edit} onClose={()=>!busy&&setEdit(null)} title={edit?`2307 · ${edit.row.party} · ${edit.row.quarter}`:""}>
        {edit&&<div>
          <div style={{fontSize:".8rem",color:"#475569",marginBottom:12}}>Expected EWT <b>{php2(edit.row.ewt)}</b> on a tax base of {php2(edit.row.taxBase)}.</div>
          <Fld label="Status"><Sel value={edit.status} onChange={e=>setEdit(x=>({...x,status:e.target.value}))}>
            {[edit.row.direction==="issue"?"Issued":"Received","Pending","Not required"].map(s=><option key={s}>{s}</option>)}
          </Sel></Fld>
          {["Issued","Received"].includes(edit.status)&&<>
            <Fld label="2307 reference / serial" required><Inp value={edit.ref} onChange={e=>setEdit(x=>({...x,ref:e.target.value}))}/></Fld>
            <Fld label={edit.status==="Issued"?"Date issued":"Date received"} required><Inp type="date" value={edit.dated} onChange={e=>setEdit(x=>({...x,dated:e.target.value}))}/></Fld>
          </>}
          <Fld label={edit.status==="Not required"?"Why no 2307 is needed":"Notes"}><Inp value={edit.notes} onChange={e=>setEdit(x=>({...x,notes:e.target.value}))}/></Fld>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
            <button onClick={()=>setEdit(null)} disabled={busy} style={{background:"#f1f5f9",border:"none",borderRadius:8,padding:"9px 16px",fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
            <button onClick={save} disabled={busy} style={{background:C.ok,color:"#fff",border:"none",borderRadius:8,padding:"9px 16px",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{busy?"Saving…":"Save"}</button>
          </div>
        </div>}
      </Modal>
    </div>
  );
}
