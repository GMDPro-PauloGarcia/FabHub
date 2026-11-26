import React,{useState,useMemo,useEffect,useCallback} from "react";
import {BANKS,uiPrompt} from "../shared";
import {supabase,sbList,isSupabaseReady} from "../supabaseClient";

// ─── BILLING › COLLECTIONS (2026-11-25) ──────────────────────────────────────
// Finance kept collections in a Google Sheet ("SALE AND COLLECTION MONITORING
// 2026": month, date received, client, project, mode, amount, bank) because
// Billing made them find the project and then the invoice first. This is that
// sheet, built from what Billing already holds, so there is one record:
//   • every client payment in Billing, one line per deposit (payments with the
//     same reference, date, bank and client are one cheque / transfer, as in
//     reconcileLedger, src/data/ledger.js);
//   • money received before the invoice exists (unapplied_collections, migration
//     20261125030000): it names the project, doesn't reduce AR, and is applied
//     to the invoice once issued ("Apply →"). Open ones 7+ days old go to
//     management on Telegram every morning.
// "+ Collection" (BillingView) records through the usual Billing payment save,
// so every rule (over-collection, own deal, mother PO, offset) still applies.
// A Manager ticks lines and marks them checked (check_collections): never a
// line they recorded themselves. The cash sheet's 🔗 still links each deposit.
// Read-only here; all writes are RPCs or the Billing payment save.

const r2=v=>Math.round((Number(v)||0)*100)/100;
const f2=v=>`₱${r2(v).toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const MONTHS=["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"];
const monthOf=d=>String(d||"").slice(0,7);
const monthLabel=m=>{const[y,mo]=m.split("-");return mo?`${MONTHS[Number(mo)-1]} ${y}`:"NO DATE";};
const bankLabel=b=>b==="cash"?"Cash":(BANKS.find(x=>x.id===b||x.short===b||x.name===b)?.short)||b||"—";
const clientKey=c=>String(c||"").toLowerCase().replace(/[^a-z0-9]/g,"");
const sameName=(a,b)=>String(a||"").trim().toLowerCase()===String(b||"").trim().toLowerCase();

export default function CollectionsLog({billings=[],deals=[],today,session,toastEmit,canRecord,isManager,onRecord,onApply,onOpenProject,reloadKey=0}){
  const[unap,setUnap]=useState([]);
  const[loaded,setLoaded]=useState(false);
  const[month,setMonth]=useState(()=>String(today||"").slice(0,7));
  const[view,setView]=useState("all");          // all | before | unchecked
  const[q,setQ]=useState("");
  const[ticked,setTicked]=useState(()=>new Set());
  const[checking,setChecking]=useState(false);
  const[checkedNow,setCheckedNow]=useState(()=>new Map()); // id → {by,at} stamped this session
  const me=session?.name||"";

  const load=useCallback(async()=>{
    if(!isSupabaseReady()){setLoaded(true);return;}
    const rows=await sbList("unapplied_collections",{order:"created_at",limit:2000});
    setUnap(rows||[]);setLoaded(true);
  },[]);
  useEffect(()=>{load();},[load,reloadKey]);

  const dealById=useMemo(()=>new Map(deals.map(d=>[d.id,d])),[deals]);

  // One line per deposit.
  const deposits=useMemo(()=>{
    const map=new Map();
    billings.forEach(ms=>{
      if(ms.status==="Cancelled"&&!(ms.payments||[]).length) return;
      const d=dealById.get(ms.dealId);
      (ms.payments||[]).forEach(p=>{
        const ref=String(p.refNo||"").trim().toLowerCase();
        const key=ref?`${p.date}|${p.bank||""}|${ref}|${clientKey(d?.client)}|${p.bounced?"b":""}`:`id:${p.id}`;
        if(!map.has(key)) map.set(key,{key,kind:"pay",date:p.date||"",bank:p.bank||"",method:p.method||"",ref:p.refNo||"",client:d?.client||"—",
          deals:new Map(),invoices:[],amount:0,ids:[],recordedBy:new Set(),checked:[],bounced:!!p.bounced,note:p.note||""});
        const g=map.get(key);
        if(d) g.deals.set(d.id,d);
        g.invoices.push(ms.invoiceNo||ms.name||"—");
        g.amount=r2(g.amount+Number(p.amount||0));
        g.ids.push(p.id);
        if(p.recordedBy) g.recordedBy.add(p.recordedBy);
        const st=checkedNow.get(p.id);
        g.checked.push(st?st.by:(p.checkedBy||p.checked_by||""));
      });
    });
    return [...map.values()].map(g=>{
      const allChecked=g.checked.length>0&&g.checked.every(Boolean);
      return{...g,recordedBy:[...g.recordedBy].join(", "),checkedBy:allChecked?[...new Set(g.checked)].join(", "):"",
        projects:[...g.deals.values()].map(d=>d.contact||d.ceNo||"—").join(" · "),ceNos:[...g.deals.values()].map(d=>d.ceNo).filter(Boolean).join(", "),
        dealId:[...g.deals.keys()][0]||null};
    });
  },[billings,dealById,checkedNow]);

  const beforeRows=useMemo(()=>unap.filter(u=>u.status!=="Applied").map(u=>{
    const d=dealById.get(u.deal_id);
    const st=checkedNow.get(u.id);
    return{key:"u:"+u.id,kind:"before",row:u,date:u.received_date||"",bank:u.bank||"",method:u.method||"",ref:u.ref_no||"",client:d?.client||"—",
      projects:d?(d.contact||d.ceNo||"—"):"—",ceNos:d?.ceNo||"",dealId:u.deal_id,invoices:[],amount:r2(u.amount),ids:[u.id],
      recordedBy:u.entered_by||"",checkedBy:st?st.by:(u.checked_by||""),status:u.status,note:u.note||"",returnReason:u.return_reason||""};
  }),[unap,dealById,checkedNow]);

  const all=useMemo(()=>[...deposits,...beforeRows].sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(a.client).localeCompare(String(b.client))),[deposits,beforeRows]);
  const months=useMemo(()=>[...new Set(all.map(r=>monthOf(r.date)).filter(Boolean))].sort().reverse(),[all]);

  const openBefore=beforeRows.filter(r=>r.status==="Open");
  const unchecked=all.filter(r=>!r.checkedBy&&!r.bounced&&r.status!=="Returned");
  const ql=q.trim().toLowerCase();
  const shown=all.filter(r=>{
    if(month!=="all"&&monthOf(r.date)!==month) return false;
    if(view==="before"&&!(r.kind==="before"&&r.status==="Open")) return false;
    if(view==="unchecked"&&(r.checkedBy||r.bounced||r.status==="Returned")) return false;
    if(ql&&![r.client,r.projects,r.ceNos,r.ref,r.invoices.join(" "),r.recordedBy,bankLabel(r.bank),String(r.amount)].join(" ").toLowerCase().includes(ql)) return false;
    return true;
  });
  const counted=r=>!r.bounced&&r.status!=="Returned";
  const shownTotal=r2(shown.filter(counted).reduce((t,r)=>t+r.amount,0));

  // Manager check: never a line you recorded yourself.
  const ownLine=r=>r.recordedBy.split(",").some(n=>sameName(n,me));
  const canTick=r=>isManager&&!r.checkedBy&&!r.bounced&&r.status!=="Returned"&&!ownLine(r);
  const tickedRows=shown.filter(r=>ticked.has(r.key)&&canTick(r));
  const markChecked=async()=>{
    if(!tickedRows.length||checking) return;
    const payIds=tickedRows.filter(r=>r.kind==="pay").flatMap(r=>r.ids);
    const unIds=tickedRows.filter(r=>r.kind==="before").flatMap(r=>r.ids);
    setChecking(true);
    try{
      const{data,error}=await supabase.rpc("check_collections",{p_payment_ids:payIds,p_unapplied_ids:unIds});
      if(error){toastEmit&&toastEmit(`Not checked: ${error.message}`,"error",10000);return;}
      const at=new Date().toISOString();
      setCheckedNow(m=>{const n=new Map(m);[...payIds,...unIds].forEach(id=>n.set(id,{by:me,at}));return n;});
      setTicked(new Set());
      toastEmit&&toastEmit(`${tickedRows.length} collection line${tickedRows.length===1?"":"s"} marked checked (${data||0} record${data===1?"":"s"}).`,"success");
    }finally{setChecking(false);}
  };

  const returnBefore=async r=>{
    const reason=await uiPrompt(`Close ${f2(r.amount)} (Ref ${r.ref}) without an invoice?\n\nSay what happened to the money (10+ characters), e.g. "refunded to client 12/02, BPI ref …" or "wrong project, re-entered on CE-…".`);
    if(reason==null) return;
    const{error}=await supabase.rpc("return_unapplied_collection",{p_id:r.row.id,p_reason:reason});
    if(error){toastEmit&&toastEmit(`Not closed: ${error.message}`,"error",10000);return;}
    toastEmit&&toastEmit("Closed. It stays in the list as Returned.","success");
    load();
  };

  const exportCsv=()=>{
    const rows=[["MONTH","DATE RECEIVED","CLIENT NAME","PROJECT NAME","CE NO","MODE OF PAYMENT","AMOUNT","BANK","REFERENCE","INVOICE(S)","STATUS","ENTERED BY","CHECKED BY"]];
    shown.slice().reverse().forEach(r=>rows.push([monthLabel(monthOf(r.date)),r.date,r.client,r.projects,r.ceNos,r.method,r.amount.toFixed(2),bankLabel(r.bank),r.ref,r.invoices.join(" / "),
      r.kind==="before"?(r.status==="Open"?"Received before invoice":r.status):r.bounced?"Bounced":"",r.recordedBy,r.checkedBy]));
    const csv=rows.map(x=>x.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\n");
    const a=document.createElement("a");
    a.href="data:text/csv;charset=utf-8,"+encodeURIComponent("﻿"+csv);
    a.download=`GMD_Collections_${month==="all"?"all":month}.csv`;
    a.click();
  };

  // Group by month, like the sheet's MONTH column.
  const groups=[];
  shown.forEach(r=>{const m=monthOf(r.date)||"none";let g=groups[groups.length-1];if(!g||g.m!==m){g={m,rows:[]};groups.push(g);}g.rows.push(r);});

  const mob=window.innerWidth<768;
  const chip=(on,clr="#1e293b")=>({padding:"7px 13px",borderRadius:20,border:`1.5px solid ${on?clr:"#e2e8f0"}`,background:on?clr:"#fff",color:on?"#fff":"#64748b",fontFamily:"inherit",fontSize:".75rem",fontWeight:on?700:500,cursor:"pointer",whiteSpace:"nowrap"});
  const th={padding:"8px 10px",fontSize:".64rem",fontWeight:800,color:"#0f172a",textTransform:"uppercase",letterSpacing:".04em",textAlign:"left",background:"#fde047",whiteSpace:"nowrap",position:"sticky",top:0};
  const td={padding:"7px 10px",fontSize:".78rem",color:"#0f172a",borderBottom:"1px solid #f1f5f9",verticalAlign:"top"};

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:12}}>
        <div style={{fontSize:".74rem",color:"#64748b",maxWidth:620}}>
          Every client payment, one line per deposit. Record new money with <b>+ Collection</b>: pick the project, enter what reached the bank, and put it on the invoice(s).
          {" "}Money with no invoice yet is kept as <b>received before invoice</b> until you apply it.
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={exportCsv} style={{background:"#eff6ff",border:"1.5px solid #bfdbfe",borderRadius:8,padding:"8px 14px",fontFamily:"inherit",fontSize:".78rem",fontWeight:700,color:"#1d4ed8",cursor:"pointer"}}>⬇ Export</button>
          {canRecord&&<button onClick={()=>onRecord&&onRecord()} style={{background:"#059669",border:"none",borderRadius:8,padding:"8px 16px",fontFamily:"inherit",fontSize:".82rem",fontWeight:800,color:"#fff",cursor:"pointer"}}>+ Collection</button>}
        </div>
      </div>

      {openBefore.length>0&&(
        <div style={{background:"#fffbeb",border:"1.5px solid #fde68a",borderRadius:10,padding:"9px 14px",marginBottom:12,fontSize:".78rem",color:"#78350f"}}>
          ⏳ <b>{openBefore.length}</b> collection{openBefore.length===1?"":"s"} received before invoice, <b>{f2(openBefore.reduce((t,r)=>t+r.amount,0))}</b>, not yet applied.
          {" "}Issue the invoice, then press <b>Apply →</b>. After 7 days management is told every morning.
        </div>
      )}

      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",marginBottom:10}}>
        <select value={month} onChange={e=>setMonth(e.target.value)} style={{padding:"7px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontFamily:"inherit",fontSize:".78rem",background:"#fff"}}>
          <option value="all">All months</option>
          {(months.includes(month)||month==="all"?months:[month,...months]).map(m=><option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search client, project, CE no., ref, invoice…"
          style={{flex:1,minWidth:180,padding:"7px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontFamily:"inherit",fontSize:".8rem"}}/>
        <button onClick={()=>setView("all")} style={chip(view==="all")}>All</button>
        <button onClick={()=>setView("before")} style={chip(view==="before","#b45309")}>Before invoice ({openBefore.length})</button>
        <button onClick={()=>setView("unchecked")} style={chip(view==="unchecked","#7c3aed")}>Not checked ({unchecked.length})</button>
      </div>

      {isManager&&(
        <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",marginBottom:10,fontSize:".74rem",color:"#64748b"}}>
          <span>Manager check: tick lines you've matched to the bank, then</span>
          <button onClick={markChecked} disabled={!tickedRows.length||checking}
            style={{background:tickedRows.length?"#7c3aed":"#e2e8f0",border:"none",borderRadius:7,padding:"6px 12px",fontFamily:"inherit",fontSize:".76rem",fontWeight:700,color:tickedRows.length?"#fff":"#94a3b8",cursor:tickedRows.length?"pointer":"not-allowed"}}>
            {checking?"Saving…":`✓ Mark ${tickedRows.length||""} checked`}
          </button>
          <button onClick={()=>setTicked(new Set(shown.filter(canTick).map(r=>r.key)))} style={{background:"none",border:"none",color:"#1d4ed8",fontFamily:"inherit",fontSize:".74rem",fontWeight:700,cursor:"pointer"}}>Tick all shown</button>
          <span style={{color:"#94a3b8"}}>Lines you recorded yourself are checked by another Manager.</span>
        </div>
      )}

      <div style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:12,overflow:"auto",maxHeight:mob?undefined:"70vh"}}>
        {!loaded&&<div style={{padding:20,color:"#94a3b8",fontSize:".8rem"}}>Loading…</div>}
        {loaded&&shown.length===0&&<div style={{padding:24,textAlign:"center",color:"#94a3b8",fontSize:".82rem"}}>No collections {month!=="all"?`in ${monthLabel(month).toLowerCase()}`:""}{view!=="all"?" in this view":""}.</div>}
        {shown.length>0&&(
          <table style={{borderCollapse:"collapse",width:"100%",minWidth:980}}>
            <thead><tr>
              {isManager&&<th style={{...th,width:28}}></th>}
              <th style={th}>Date received</th><th style={th}>Client name</th><th style={th}>Project name</th><th style={th}>Mode of payment</th>
              <th style={{...th,textAlign:"right"}}>Amount</th><th style={th}>Bank</th><th style={th}>Reference</th><th style={th}>Invoice(s)</th><th style={th}>Entered / checked</th><th style={th}></th>
            </tr></thead>
            <tbody>
              {groups.map(g=>{
                const tot=r2(g.rows.filter(counted).reduce((t,r)=>t+r.amount,0));
                return(
                  <React.Fragment key={g.m}>
                    <tr><td colSpan={isManager?11:10} style={{padding:"7px 10px",background:"#f8fafc",borderBottom:"1px solid #e2e8f0",fontSize:".72rem",fontWeight:800,color:"#475569",letterSpacing:".05em"}}>
                      {monthLabel(g.m)} <span style={{fontWeight:600,color:"#94a3b8"}}>· {g.rows.length} line{g.rows.length===1?"":"s"} · {f2(tot)}</span>
                    </td></tr>
                    {g.rows.map(r=>{
                      const before=r.kind==="before";
                      const dim=r.bounced||r.status==="Returned";
                      return(
                        <tr key={r.key} style={{background:before&&r.status==="Open"?"#fffbeb":undefined,opacity:dim?.55:1}}>
                          {isManager&&<td style={td}>{canTick(r)&&<input type="checkbox" checked={ticked.has(r.key)} onChange={e=>setTicked(s=>{const n=new Set(s);e.target.checked?n.add(r.key):n.delete(r.key);return n;})} aria-label="Tick to mark checked"/>}</td>}
                          <td style={{...td,whiteSpace:"nowrap"}}>{r.date||"—"}</td>
                          <td style={{...td,fontWeight:700}}>{r.client}</td>
                          <td style={td}>
                            {r.dealId&&onOpenProject?<button onClick={()=>onOpenProject(r.dealId)} style={{background:"none",border:"none",padding:0,fontFamily:"inherit",fontSize:".78rem",color:"#1d4ed8",cursor:"pointer",textAlign:"left"}}>{r.projects}</button>:r.projects}
                            {r.ceNos&&<div style={{fontSize:".66rem",color:"#94a3b8"}}>{r.ceNos}</div>}
                          </td>
                          <td style={td}>{r.method||"—"}</td>
                          <td style={{...td,textAlign:"right",fontWeight:800,fontVariantNumeric:"tabular-nums",textDecoration:dim?"line-through":"none"}}>{f2(r.amount)}</td>
                          <td style={td}>{bankLabel(r.bank)}</td>
                          <td style={{...td,fontFamily:"ui-monospace,monospace",fontSize:".72rem"}}>{r.ref||<span style={{color:"#dc2626"}}>none</span>}</td>
                          <td style={td}>
                            {before?(
                              <span title={r.note} style={{fontSize:".66rem",fontWeight:800,borderRadius:20,padding:"2px 8px",whiteSpace:"nowrap",
                                ...(r.status==="Open"?{background:"#fef3c7",color:"#92400e",border:"1px solid #fcd34d"}:{background:"#f1f5f9",color:"#64748b",border:"1px solid #e2e8f0"})}}>
                                {r.status==="Open"?"Before invoice":`Returned${r.returnReason?": "+r.returnReason:""}`}
                              </span>
                            ):r.invoices.join(", ")}
                            {r.bounced&&<span style={{marginLeft:6,fontSize:".66rem",fontWeight:800,color:"#dc2626"}}>BOUNCED</span>}
                            {before&&r.note&&<div style={{fontSize:".66rem",color:"#92400e",marginTop:2}}>{r.note}</div>}
                          </td>
                          <td style={{...td,fontSize:".7rem",color:"#64748b"}}>
                            {r.recordedBy||"—"}
                            <div style={{color:r.checkedBy?"#059669":"#a78bfa",fontWeight:700}}>{r.checkedBy?`✓ ${r.checkedBy}`:"not checked"}</div>
                          </td>
                          <td style={{...td,whiteSpace:"nowrap"}}>
                            {before&&r.status==="Open"&&canRecord&&<button onClick={()=>onApply&&onApply(r.row)} style={{background:"#1d4ed8",border:"none",borderRadius:6,padding:"4px 10px",fontFamily:"inherit",fontSize:".7rem",fontWeight:700,color:"#fff",cursor:"pointer"}}>Apply →</button>}
                            {before&&r.status==="Open"&&isManager&&<button onClick={()=>returnBefore(r)} title="Refunded / wrong project: close it without an invoice" style={{marginLeft:4,background:"#fff",border:"1px solid #e2e8f0",borderRadius:6,padding:"4px 8px",fontFamily:"inherit",fontSize:".68rem",fontWeight:700,color:"#64748b",cursor:"pointer"}}>Close…</button>}
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
            <tfoot><tr>
              <td colSpan={isManager?5:4} style={{padding:"9px 10px",fontWeight:800,fontSize:".78rem",borderTop:"2px solid #e2e8f0"}}>Total shown (bounced and returned not counted)</td>
              <td style={{padding:"9px 10px",fontWeight:900,fontSize:".86rem",textAlign:"right",borderTop:"2px solid #e2e8f0",color:"#059669",fontVariantNumeric:"tabular-nums"}}>{f2(shownTotal)}</td>
              <td colSpan={5} style={{borderTop:"2px solid #e2e8f0"}}/>
            </tr></tfoot>
          </table>
        )}
      </div>
    </div>
  );
}
