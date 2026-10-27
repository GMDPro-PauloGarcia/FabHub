import React,{useState,useEffect,useMemo,useCallback} from "react";
import {supabase,isSupabaseReady,sbListAll} from "../supabaseClient";
import {Modal,Fld,Inp,Sel,toastEmit,uiConfirm,uiPrompt,addPrintClose,today} from "../shared";
import {WON_STAGES,PO_UNITS,PR_CATS,projDisplayName} from "../core";

// ─── PRF — Purchase Request Form ──────────────────────────────────────────────
// Coordinator / PM writes the PRF → PM of the project approves (skipped when a
// project PM or a Manager wrote it) → Warehouse marks what comes from stock →
// Cost Control (QS) verifies the unit cost of what's left to buy → Procurement
// links each line to buy to a PO → Ordered. Nobody signs their own PRF.
//
// The database owns all of it (migration 20261027120000_prf_workflow.sql): the
// prfs / prf_lines / prf_events tables have no client write policies and every
// change goes through an RPC that re-checks the role, the step and the signer.
// canActOn below only decides which buttons to show — keep it in sync with
// prf_step_block() in that migration.

const PRF_STAGES=WON_STAGES.filter(s=>s!=="14 · Completed");
const PRF_CREATOR_ROLES=["Manager","ProjectMover","Operations"];
const PRF_STEP_ROLES={"For Warehouse":["Warehouse"],"For Cost Control":["QS"],"For Procurement":["Procurement","ProcurementManager","Manager"]};
const PRF_OPEN=["Draft","For PM Approval","For Warehouse","For Cost Control","For Procurement","Rejected"];
export const PRF_STATUS_CLR={"Draft":"#94a3b8","For PM Approval":"#8b5cf6","For Warehouse":"#0ea5e9","For Cost Control":"#f59e0b",
  "For Procurement":"#f97316","Ordered":"#10b981","From Stock":"#059669","Rejected":"#ef4444","Cancelled":"#64748b"};
const PRF_PRI_CLR={Normal:"#64748b",High:"#f59e0b",Urgent:"#ef4444"};
const prfNorm=s=>String(s||"").replace(/\s*\([^)]*\)\s*$/,"").trim().toLowerCase();
const prfNum=v=>Number(String(v??"").replace(/,/g,""))||0;
const prfPeso=v=>"₱"+prfNum(v).toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2});
const prfEsc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const prfDT=t=>t?new Date(t).toLocaleString("en-PH",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}):"";
const prfBuyQty=l=>Math.max(0,prfNum(l.qty)-prfNum(l.stock_qty));
const prfEmptyLine=()=>({category:"",description:"",spec:"",brand:"",qty:"",unit:"pcs",est_unit_cost:"",remarks:""});
const prfErr=e=>(e?.message||String(e||"")).replace(/^.*?:\s*(?=[A-Z])/,"");

export default function PrfView({session,role,deals=[],pcards={},prs=[],sendTelegramNotification,initialDeal,clearJump,isMobile}){
  const me=(session?.username||"").toLowerCase();
  const myName=session?.name||"";
  const[prfs,setPrfs]=useState([]);
  const[lines,setLines]=useState([]);
  const[events,setEvents]=useState([]);
  const[loading,setLoading]=useState(true);
  const[tab,setTab]=useState(null);
  const[dealFilter,setDealFilter]=useState(initialDeal||"");
  const[search,setSearch]=useState("");
  const[openId,setOpenId]=useState(null);
  const[editing,setEditing]=useState(null); // {id|null, form, lines}
  const[busy,setBusy]=useState(false);

  useEffect(()=>{if(initialDeal&&clearJump)clearJump();},[]);

  const load=useCallback(async()=>{
    if(!isSupabaseReady()){setLoading(false);return;}
    const[p,l,e]=await Promise.all([
      sbListAll("prfs",{order:"created_at"}),
      sbListAll("prf_lines",{order:"line_no",asc:true}),
      sbListAll("prf_events",{order:"at"}),
    ]);
    const rev=Object.fromEntries(p.map(x=>[x.id,x.lines_rev]));
    setPrfs(p);
    setLines(l.filter(x=>rev[x.prf_id]===x.rev).sort((a,b)=>a.line_no-b.line_no));
    setEvents(e);
    setLoading(false);
  },[]);
  useEffect(()=>{load();const t=setInterval(load,60000);return()=>clearInterval(t);},[load]);

  const dealById=useMemo(()=>Object.fromEntries(deals.map(d=>[d.id,d])),[deals]);
  const linesOf=useCallback(id=>lines.filter(l=>l.prf_id===id),[lines]);
  const projName=id=>projDisplayName(dealById[id])||"—";
  const estTotal=id=>linesOf(id).reduce((s,l)=>s+prfNum(l.qty)*prfNum(l.est_unit_cost),0);
  const isMine=p=>(p.requested_by||"").toLowerCase()===me;
  const isProjectPM=p=>{const pc=pcards[p.deal_id];return !!(pc&&myName&&[pc.pm1,pc.pm2,pc.pm3].some(x=>x&&prfNorm(x)===prfNorm(myName)));};
  const canActOn=p=>{
    if(!p||isMine(p)) return false;
    if(p.status==="For PM Approval") return role==="Manager"||role==="Operations"||isProjectPM(p);
    return (PRF_STEP_ROLES[p.status]||[]).includes(role);
  };
  const canCreate=PRF_CREATOR_ROLES.includes(role);

  const needsMe=prfs.filter(canActOn);
  const curTab=tab||(dealFilter?"all":needsMe.length?"action":canCreate?"mine":"open");
  const shown=prfs.filter(p=>{
    if(dealFilter&&p.deal_id!==dealFilter) return false;
    if(curTab==="action"&&!canActOn(p)) return false;
    if(curTab==="mine"&&!isMine(p)) return false;
    if(curTab==="open"&&!PRF_OPEN.includes(p.status)) return false;
    const q=search.trim().toLowerCase();
    if(q&&![p.prf_no,p.requested_by_name,p.purpose,projName(p.deal_id)].some(x=>String(x||"").toLowerCase().includes(q))) return false;
    return true;
  });

  const notify=(chs,p,head)=>{
    if(!sendTelegramNotification) return;
    const ls=linesOf(p.id);
    const msg=`${head}\n<b>${prfEsc(p.prf_no||"Draft PRF")}</b> · ${prfEsc(projName(p.deal_id))}\nBy: ${prfEsc(p.requested_by_name||p.requested_by)} · ${ls.length} item${ls.length!==1?"s":""} · est ${prfPeso(estTotal(p.id))}${p.required_date?`\nNeeded: ${p.required_date}`:""}\nAction by: ${prfEsc(myName)}`;
    chs.forEach(ch=>sendTelegramNotification(ch,msg));
  };
  const NEXT_CH={"For PM Approval":["ops"],"For Warehouse":["warehouse"],"For Cost Control":["financialcontrol"],"For Procurement":["procurement"],"From Stock":["ops","warehouse"],"Ordered":["ops","warehouse"]};
  const NEXT_HEAD={"For PM Approval":"📝 PRF needs PM approval","For Warehouse":"📦 PRF for warehouse stock check","For Cost Control":"🧮 PRF for cost verification",
    "For Procurement":"🛒 PRF ready to order","From Stock":"✅ PRF — all items from stock","Ordered":"✅ PRF ordered"};

  const run=async(fn,args,p,okMsg)=>{
    if(busy) return null;
    setBusy(true);
    const{data,error}=await supabase.rpc(fn,args);
    setBusy(false);
    if(error){toastEmit("⚠ "+prfErr(error),"error",9000);return null;}
    if(p&&typeof data==="string"){
      if(data==="Rejected") notify(["ops"],p,"↩️ PRF rejected");
      else if(NEXT_CH[data]) notify(NEXT_CH[data],{...p,status:data},NEXT_HEAD[data]);
    }
    if(okMsg) toastEmit(okMsg,"success");
    await load();
    return data??true;
  };

  // ── editing ─────────────────────────────────────────────────────────────────
  const startNew=()=>{
    const d=dealById[dealFilter];
    setEditing({id:null,form:{deal_id:d&&PRF_STAGES.includes(d.stage)?d.id:"",department:"Fabrication",purpose:"",location:d?.location||"",priority:"Normal",required_date:""},lines:[prfEmptyLine()]});
  };
  const startEdit=p=>setEditing({id:p.id,form:{deal_id:p.deal_id||"",department:p.department,purpose:p.purpose,location:p.location,priority:p.priority,required_date:p.required_date||""},
    lines:linesOf(p.id).map(l=>({category:l.category,description:l.description,spec:l.spec,brand:l.brand,qty:String(l.qty),unit:l.unit,est_unit_cost:l.est_unit_cost==null?"":String(l.est_unit_cost),remarks:l.remarks}))});
  const saveDraft=async(submit)=>{
    const ed=editing;
    const ls=ed.lines.filter(l=>String(l.description).trim()||prfNum(l.qty));
    const payload=ls.map(l=>({...l,qty:prfNum(l.qty),est_unit_cost:String(l.est_unit_cost).trim()===""?null:prfNum(l.est_unit_cost)}));
    const id=await run("save_prf",{p_id:ed.id,p_prf:ed.form,p_lines:payload},null,submit?null:"Draft saved");
    if(!id) return;
    const newId=ed.id||id;
    setEditing(null);
    if(submit){
      const st=await run("submit_prf",{p_id:newId},null,null);
      if(st&&sendTelegramNotification&&NEXT_CH[st]){
        // State from before the save — read the number back and use the lines just sent.
        const{data:row}=await supabase.from("prfs").select("prf_no").eq("id",newId).maybeSingle();
        const est=payload.reduce((s,l)=>s+prfNum(l.qty)*prfNum(l.est_unit_cost),0);
        const msg=`${NEXT_HEAD[st]}\n<b>${prfEsc(row?.prf_no||"PRF")}</b> · ${prfEsc(projName(ed.form.deal_id))}\nBy: ${prfEsc(myName)} · ${payload.length} item${payload.length!==1?"s":""} · est ${prfPeso(est)}${ed.form.required_date?`\nNeeded: ${ed.form.required_date}`:""}`;
        NEXT_CH[st].forEach(ch=>sendTelegramNotification(ch,msg));
      }
      if(st) toastEmit(`PRF submitted — ${st}`,"success");
      setOpenId(newId);
    } else setOpenId(newId);
  };

  const open=prfs.find(p=>p.id===openId)||null;

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12,marginBottom:16}}>
        <div>
          <h2 style={{margin:0,fontWeight:800,color:"#0f172a",fontSize:"1.15rem"}}>📦 Purchase Requests (PRF)</h2>
          <div style={{fontSize:".75rem",color:"#64748b",marginTop:2}}>Coordinator / PM → PM approval → Warehouse stock check → Cost Control → Procurement</div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={load} style={prfBtn("#f1f5f9","#475569")}>↻ Refresh</button>
          {canCreate&&<button onClick={startNew} style={prfBtn("#f97316","#fff")}>+ New PRF</button>}
        </div>
      </div>

      {!isSupabaseReady()&&<PrfBanner c="#b45309" bg="#fffbeb">PRFs need a connection to the server — you're offline.</PrfBanner>}
      {needsMe.length>0&&curTab!=="action"&&<PrfBanner c="#9a3412" bg="#fff7ed">⏳ {needsMe.length} PRF{needsMe.length!==1?"s":""} waiting for you — <button onClick={()=>setTab("action")} style={prfLink}>open them</button></PrfBanner>}

      <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center",marginBottom:12}}>
        {[["action",`Needs my action (${needsMe.length})`],["mine","My PRFs"],["open","Open"],["all","All"]].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} style={{...prfPill,background:curTab===k?"#0f172a":"#fff",color:curTab===k?"#fff":"#475569",borderColor:curTab===k?"#0f172a":"#e2e8f0"}}>{l}</button>
        ))}
        {dealFilter&&<span style={{...prfPill,background:"#eff6ff",color:"#1d4ed8",borderColor:"#bfdbfe"}}>{projName(dealFilter)} <button onClick={()=>setDealFilter("")} aria-label="Clear project filter" style={{...prfLink,marginLeft:4}}>✕</button></span>}
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search PRF no, project, requester…" style={{flex:"1 1 200px",minWidth:160,border:"1.5px solid #e2e8f0",borderRadius:8,padding:"7px 10px",fontFamily:"inherit",fontSize:".8rem"}}/>
      </div>

      <div style={{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",overflow:"hidden"}}>
        {loading?<div style={{padding:24,color:"#94a3b8",fontSize:".85rem"}}>Loading PRFs…</div>
        :shown.length===0?<div style={{padding:24,color:"#94a3b8",fontSize:".85rem"}}>{curTab==="action"?"Nothing waiting for you.":"No PRFs here yet."}</div>
        :shown.map(p=>{
          const c=PRF_STATUS_CLR[p.status]||"#64748b";
          const late=p.required_date&&p.required_date<today&&PRF_OPEN.includes(p.status);
          return(
            <button key={p.id} onClick={()=>setOpenId(p.id)} style={{display:"grid",gridTemplateColumns:isMobile?"1fr auto":"130px 1fr 150px 110px 120px 150px",gap:10,alignItems:"center",width:"100%",textAlign:"left",background:"#fff",border:"none",borderBottom:"1px solid #f1f5f9",padding:"10px 14px",cursor:"pointer",fontFamily:"inherit"}}>
              <div>
                <div style={{fontFamily:"'IBM Plex Mono',monospace",fontWeight:700,fontSize:".78rem",color:"#0f172a"}}>{p.prf_no||"Draft"}</div>
                {p.priority!=="Normal"&&<div style={{fontSize:".62rem",fontWeight:700,color:PRF_PRI_CLR[p.priority]}}>{p.priority}</div>}
              </div>
              <div style={{minWidth:0}}>
                <div style={{fontWeight:600,fontSize:".82rem",color:"#0f172a",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{projName(p.deal_id)}</div>
                <div style={{fontSize:".7rem",color:"#64748b"}}>{p.requested_by_name||p.requested_by} · {linesOf(p.id).length} item{linesOf(p.id).length!==1?"s":""}{isMobile?` · ${prfPeso(estTotal(p.id))}`:""}</div>
              </div>
              {!isMobile&&<div style={{fontSize:".75rem",color:"#475569"}}>{p.purpose||"—"}</div>}
              {!isMobile&&<div style={{fontSize:".75rem",fontWeight:600,color:late?"#dc2626":"#475569"}}>{p.required_date||"—"}{late?" ⚠":""}</div>}
              {!isMobile&&<div style={{fontSize:".78rem",fontWeight:700,color:"#0f172a"}}>{prfPeso(estTotal(p.id))}</div>}
              <span style={{justifySelf:isMobile?"end":"start",fontSize:".66rem",fontWeight:700,color:c,background:c+"18",border:`1px solid ${c}44`,borderRadius:20,padding:"3px 9px",whiteSpace:"nowrap"}}>{p.status}{canActOn(p)?" • you":""}</span>
            </button>
          );
        })}
      </div>

      {open&&<PrfDetail p={open} lines={linesOf(open.id)} events={events.filter(e=>e.prf_id===open.id)} deal={dealById[open.deal_id]}
        projName={projName(open.deal_id)} canAct={canActOn(open)} mine={isMine(open)} role={role} busy={busy} isMobile={isMobile}
        poOptions={[...new Set(prs.filter(x=>x.dealId===open.deal_id||x.projectId===open.deal_id).map(x=>x.poNumber).filter(Boolean))]}
        onClose={()=>setOpenId(null)} onEdit={()=>{startEdit(open);setOpenId(null);}} run={run}/>}

      {editing&&<PrfEditor editing={editing} setEditing={setEditing} deals={deals} busy={busy} isMobile={isMobile}
        onSave={()=>saveDraft(false)} onSubmit={()=>saveDraft(true)}/>}
    </div>
  );
}

// ── Detail ───────────────────────────────────────────────────────────────────
function PrfDetail({p,lines,events,deal,projName,canAct,mine,role,busy,isMobile,poOptions,onClose,onEdit,run}){
  const[wh,setWh]=useState({});   // line id → {stock_qty, note}
  const[qs,setQs]=useState({});   // line id → {unit_cost, note}
  const[po,setPo]=useState({});   // line id → po_number
  useEffect(()=>{
    setWh(Object.fromEntries(lines.map(l=>[l.id,{stock_qty:l.stock_qty==null?"":String(l.stock_qty),note:l.wh_note||""}])));
    setQs(Object.fromEntries(lines.map(l=>[l.id,{unit_cost:l.qs_unit_cost==null?(l.est_unit_cost==null?"":String(l.est_unit_cost)):String(l.qs_unit_cost),note:l.qs_note||""}])));
    setPo(Object.fromEntries(lines.map(l=>[l.id,l.po_number||""])));
  },[p.id,p.status,p.lines_rev]);
  const step=p.status;
  const showWh=["For Cost Control","For Procurement","Ordered","From Stock"].includes(step)||(step==="For Warehouse"&&canAct);
  const showQs=["For Procurement","Ordered"].includes(step)||(step==="For Cost Control"&&canAct);
  const showPo=["Ordered"].includes(step)||(step==="For Procurement");
  const est=lines.reduce((s,l)=>s+prfNum(l.qty)*prfNum(l.est_unit_cost),0);
  const buyTotal=lines.reduce((s,l)=>s+prfBuyQty(l)*prfNum(l.qs_unit_cost??l.est_unit_cost),0);
  const cell={padding:"6px 8px",fontSize:".76rem",borderBottom:"1px solid #f1f5f9",verticalAlign:"top"};
  const th={...cell,fontSize:".6rem",textTransform:"uppercase",letterSpacing:".06em",color:"#94a3b8",fontWeight:700,background:"#f8fafc",textAlign:"left",whiteSpace:"nowrap"};
  const inp={width:"100%",minWidth:70,border:"1.5px solid #e2e8f0",borderRadius:6,padding:"5px 6px",fontFamily:"inherit",fontSize:".76rem",boxSizing:"border-box"};

  const reject=async()=>{
    const r=await uiPrompt({title:"Reject this PRF",message:"Why? The requester sees this and fixes the PRF.",confirmLabel:"Reject"});
    if(r==null) return;
    if(await run("reject_prf",{p_id:p.id,p_reason:r},p,"PRF rejected")) onClose();
  };
  const cancel=async()=>{
    let reason="";
    if(p.status!=="Draft"){
      const r=await uiPrompt({title:"Cancel this PRF",message:"Reason for cancelling:",confirmLabel:"Cancel PRF"});
      if(r==null) return; reason=r;
    } else if(!(await uiConfirm("Cancel this draft PRF?"))) return;
    if(await run("cancel_prf",{p_id:p.id,p_reason:reason},null,"PRF cancelled")) onClose();
  };

  return(
    <Modal open wide title={`${p.prf_no||"Draft PRF"} — ${projName}`} onClose={onClose}>
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)",gap:8}}>
          {[["Status",p.status],["Requested by",p.requested_by_name||p.requested_by],["Required date",p.required_date||"—"],["Priority",p.priority],
            ["Department",p.department],["Location",p.location||deal?.location||"—"],["Purpose / scope",p.purpose||"—"],["Submitted",prfDT(p.submitted_at)||"—"]].map(([k,v])=>(
            <div key={k} style={{background:"#f8fafc",borderRadius:8,padding:"7px 10px"}}>
              <div style={{fontSize:".58rem",textTransform:"uppercase",letterSpacing:".8px",color:"#94a3b8"}}>{k}</div>
              <div style={{fontSize:".8rem",fontWeight:600,color:k==="Status"?(PRF_STATUS_CLR[v]||"#0f172a"):"#0f172a"}}>{v}</div>
            </div>
          ))}
        </div>

        {p.status==="Rejected"&&<PrfBanner c="#b91c1c" bg="#fef2f2">↩️ Rejected at <b>{p.rejected_step}</b> by {p.rejected_by} — “{p.reject_reason}”. {mine?"Edit it and submit again.":""}</PrfBanner>}

        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)",gap:8}}>
          {[["Prepared by",p.requested_by_name||p.requested_by,p.submitted_at],
            ["Checked by PM",p.pm_skipped?"Not needed (PM / Manager wrote it)":p.pm_signed_by,p.pm_signed_at],
            ["Warehouse",p.wh_signed_by,p.wh_signed_at],["Cost Control",p.qs_signed_by,p.qs_signed_at]].map(([k,v,t])=>(
            <div key={k} style={{border:`1.5px solid ${v?"#a7f3d0":"#e2e8f0"}`,borderRadius:8,padding:"7px 10px",background:v?"#f0fdf4":"#fff"}}>
              <div style={{fontSize:".58rem",textTransform:"uppercase",letterSpacing:".8px",color:"#94a3b8"}}>{k}</div>
              <div style={{fontSize:".78rem",fontWeight:700,color:v?"#065f46":"#cbd5e1"}}>{v||"—"}</div>
              {t&&<div style={{fontSize:".62rem",color:"#64748b"}}>{prfDT(t)}</div>}
            </div>
          ))}
        </div>

        <div style={{overflowX:"auto",border:"1px solid #e2e8f0",borderRadius:10}}>
          <table style={{width:"100%",borderCollapse:"collapse",minWidth:760}}>
            <thead><tr>
              <th style={th}>#</th><th style={th}>Item</th><th style={th}>Spec</th><th style={th}>Qty</th><th style={th}>Est. unit</th><th style={th}>Est. total</th>
              {showWh&&<th style={th}>From stock</th>}{showWh&&<th style={th}>To buy</th>}
              {showQs&&<th style={th}>Verified unit</th>}{showPo&&<th style={th}>PO</th>}
              <th style={th}>Remarks</th>
            </tr></thead>
            <tbody>{lines.map(l=>{
              const whEdit=step==="For Warehouse"&&canAct, qsEdit=step==="For Cost Control"&&canAct&&prfBuyQty(l)>0, poEdit=step==="For Procurement"&&canAct&&prfBuyQty(l)>0;
              return(
                <tr key={l.id}>
                  <td style={cell}>{l.line_no}</td>
                  <td style={cell}><div style={{fontWeight:600}}>{l.description}</div>{(l.category||l.brand)&&<div style={{fontSize:".66rem",color:"#94a3b8"}}>{[l.category,l.brand].filter(Boolean).join(" · ")}</div>}</td>
                  <td style={cell}>{l.spec||"—"}</td>
                  <td style={{...cell,whiteSpace:"nowrap"}}>{prfNum(l.qty)} {l.unit}</td>
                  <td style={cell}>{l.est_unit_cost==null?"—":prfPeso(l.est_unit_cost)}</td>
                  <td style={cell}>{prfPeso(prfNum(l.qty)*prfNum(l.est_unit_cost))}</td>
                  {showWh&&<td style={cell}>{whEdit?(<>
                    <input type="number" min={0} max={prfNum(l.qty)} value={wh[l.id]?.stock_qty??""} onChange={e=>setWh(s=>({...s,[l.id]:{...s[l.id],stock_qty:e.target.value}}))} placeholder="0" style={inp} aria-label={`Qty from stock for ${l.description}`}/>
                    <input value={wh[l.id]?.note??""} onChange={e=>setWh(s=>({...s,[l.id]:{...s[l.id],note:e.target.value}}))} placeholder="note" style={{...inp,marginTop:4}} aria-label={`Warehouse note for ${l.description}`}/>
                  </>):(<>{l.stock_qty==null?"—":`${prfNum(l.stock_qty)} ${l.unit}`}{l.wh_note&&<div style={{fontSize:".66rem",color:"#64748b"}}>{l.wh_note}</div>}</>)}</td>}
                  {showWh&&<td style={{...cell,fontWeight:700,color:prfBuyQty(whEdit?{...l,stock_qty:wh[l.id]?.stock_qty}:l)>0?"#c2410c":"#059669"}}>{l.stock_qty==null&&!whEdit?"—":`${prfBuyQty(whEdit?{...l,stock_qty:wh[l.id]?.stock_qty}:l)} ${l.unit}`}</td>}
                  {showQs&&<td style={cell}>{qsEdit?(<>
                    <input type="number" min={0} value={qs[l.id]?.unit_cost??""} onChange={e=>setQs(s=>({...s,[l.id]:{...s[l.id],unit_cost:e.target.value}}))} style={inp} aria-label={`Verified unit cost for ${l.description}`}/>
                    <input value={qs[l.id]?.note??""} onChange={e=>setQs(s=>({...s,[l.id]:{...s[l.id],note:e.target.value}}))} placeholder="note" style={{...inp,marginTop:4}} aria-label={`Cost note for ${l.description}`}/>
                  </>):(<>{prfBuyQty(l)===0?"—":l.qs_unit_cost==null?"—":prfPeso(l.qs_unit_cost)}{l.qs_note&&<div style={{fontSize:".66rem",color:"#64748b"}}>{l.qs_note}</div>}</>)}</td>}
                  {showPo&&<td style={cell}>{poEdit?(
                    <><input list={`po-${p.id}`} value={po[l.id]??""} onChange={e=>setPo(s=>({...s,[l.id]:e.target.value}))} placeholder="PO-0000" style={inp} aria-label={`PO number for ${l.description}`}/></>
                  ):(prfBuyQty(l)===0?"stock":l.po_number||"—")}</td>}
                  <td style={cell}>{l.remarks||"—"}</td>
                </tr>
              );
            })}</tbody>
          </table>
          <datalist id={`po-${p.id}`}>{poOptions.map(n=><option key={n} value={n}/>)}</datalist>
        </div>
        <div style={{display:"flex",gap:16,justifyContent:"flex-end",fontSize:".8rem",color:"#475569",flexWrap:"wrap"}}>
          <span>Estimate: <b style={{color:"#0f172a"}}>{prfPeso(est)}</b></span>
          {showWh&&<span>To buy{showQs?" (verified)":""}: <b style={{color:"#c2410c"}}>{prfPeso(buyTotal)}</b></span>}
        </div>
        {step==="For Procurement"&&canAct&&<div style={{fontSize:".72rem",color:"#64748b"}}>Save the PO on the Purchase Orders page first, then enter its number here. When every item to buy has a PO, the PRF becomes Ordered.</div>}

        <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"flex-end"}}>
          <button onClick={()=>printPrf(p,lines,projName,deal)} style={prfBtn("#f1f5f9","#475569")}>🖨 Print</button>
          {mine&&["Draft","Rejected"].includes(p.status)&&<button onClick={onEdit} style={prfBtn("#eff6ff","#1d4ed8")}>✏️ Edit</button>}
          {mine&&p.status==="Draft"&&<button disabled={busy} onClick={()=>run("submit_prf",{p_id:p.id},p,"PRF submitted")} style={prfBtn("#f97316","#fff")}>Submit</button>}
          {(mine?["Draft","Rejected","For PM Approval","For Warehouse"].includes(p.status):role==="Manager"&&!["Ordered","From Stock","Cancelled"].includes(p.status))&&<button disabled={busy} onClick={cancel} style={prfBtn("#fff","#64748b","#e2e8f0")}>Cancel PRF</button>}
          {canAct&&<button disabled={busy} onClick={reject} style={prfBtn("#fef2f2","#dc2626","#fecaca")}>↩ Reject</button>}
          {canAct&&step==="For PM Approval"&&<button disabled={busy} onClick={()=>run("sign_prf_pm",{p_id:p.id,p_note:""},p,"Approved — sent to Warehouse")} style={prfBtn("#8b5cf6","#fff")}>✓ Approve (PM)</button>}
          {canAct&&step==="For Warehouse"&&<button disabled={busy} onClick={()=>run("sign_prf_warehouse",{p_id:p.id,p_lines:lines.map(l=>({id:l.id,stock_qty:wh[l.id]?.stock_qty??"",note:wh[l.id]?.note||""}))},p,"Warehouse check signed")} style={prfBtn("#0ea5e9","#fff")}>✓ Sign stock check</button>}
          {canAct&&step==="For Cost Control"&&<button disabled={busy} onClick={()=>run("sign_prf_qs",{p_id:p.id,p_lines:lines.filter(l=>prfBuyQty(l)>0).map(l=>({id:l.id,unit_cost:qs[l.id]?.unit_cost??"",note:qs[l.id]?.note||""}))},p,"Cost verified — sent to Procurement")} style={prfBtn("#f59e0b","#fff")}>✓ Verify cost</button>}
          {canAct&&step==="For Procurement"&&<button disabled={busy} onClick={()=>run("link_prf_po",{p_id:p.id,p_lines:lines.filter(l=>prfBuyQty(l)>0).map(l=>({id:l.id,po_number:po[l.id]||""}))},p,"PO links saved")} style={prfBtn("#f97316","#fff")}>Save PO links</button>}
        </div>

        {events.length>0&&(
          <div>
            <div style={{fontSize:".6rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".08em",color:"#94a3b8",marginBottom:6}}>History</div>
            {events.map(e=>(
              <div key={e.id} style={{fontSize:".74rem",color:"#475569",padding:"4px 0",borderBottom:"1px solid #f8fafc"}}>
                <b style={{color:"#0f172a"}}>{e.action}</b> · {e.by_name||e.by_user} · {prfDT(e.at)}{e.note?` — ${e.note}`:""}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── Create / edit ────────────────────────────────────────────────────────────
function PrfEditor({editing,setEditing,deals,busy,isMobile,onSave,onSubmit}){
  const{form,lines}=editing;
  const[hints,setHints]=useState({}); // line index → [{item,unit,unit_price,last_date}]
  const setF=(k,v)=>setEditing(e=>({...e,form:{...e.form,[k]:v}}));
  const setL=(i,k,v)=>setEditing(e=>({...e,lines:e.lines.map((l,j)=>j===i?{...l,[k]:v}:l)}));
  const addL=()=>setEditing(e=>({...e,lines:[...e.lines,prfEmptyLine()]}));
  const delL=i=>setEditing(e=>({...e,lines:e.lines.length>1?e.lines.filter((_,j)=>j!==i):[prfEmptyLine()]}));
  const projects=deals.filter(d=>PRF_STAGES.includes(d.stage)&&!(d.standbyPO&&!d.parentDealId)).sort((a,b)=>projDisplayName(a).localeCompare(projDisplayName(b)));
  const est=lines.reduce((s,l)=>s+prfNum(l.qty)*prfNum(l.est_unit_cost),0);
  const lookup=async i=>{
    const q=String(lines[i].description||"").trim();
    if(q.length<3){toastEmit("Type at least 3 letters of the item first.","warning");return;}
    const{data,error}=await supabase.rpc("prf_price_hints",{p_q:q});
    if(error){toastEmit("⚠ "+prfErr(error),"error");return;}
    if(!data?.length){toastEmit("No past purchase found for that item — enter your best estimate.","info");setHints(h=>({...h,[i]:[]}));return;}
    setHints(h=>({...h,[i]:data}));
  };
  const inp={width:"100%",border:"1.5px solid #e2e8f0",borderRadius:6,padding:"6px 7px",fontFamily:"inherit",fontSize:".78rem",boxSizing:"border-box",background:"#fff"};
  const lbl={fontSize:".6rem",textTransform:"uppercase",letterSpacing:".06em",color:"#94a3b8",fontWeight:700,display:"block",marginBottom:2};
  return(
    <Modal open wide title={editing.id?"Edit PRF":"New PRF"} onClose={()=>setEditing(null)}>
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"2fr 1fr 1fr",gap:10}}>
          <Fld label="Project" required>
            <Sel value={form.deal_id} onChange={e=>{const d=projects.find(x=>x.id===e.target.value);setF("deal_id",e.target.value);if(d&&!form.location)setF("location",d.location||"");}}>
              <option value="">— Select project —</option>
              {projects.map(d=><option key={d.id} value={d.id}>{projDisplayName(d)}</option>)}
            </Sel>
          </Fld>
          <Fld label="Required date" required><Inp type="date" value={form.required_date} onChange={e=>setF("required_date",e.target.value)}/></Fld>
          <Fld label="Priority"><Sel value={form.priority} onChange={e=>setF("priority",e.target.value)}>{["Normal","High","Urgent"].map(x=><option key={x}>{x}</option>)}</Sel></Fld>
          <Fld label="Purpose / work scope"><Inp value={form.purpose} onChange={e=>setF("purpose",e.target.value)} placeholder="e.g. Electrical rough-in, Unit 3B"/></Fld>
          <Fld label="Site / location"><Inp value={form.location} onChange={e=>setF("location",e.target.value)}/></Fld>
          <Fld label="Department"><Inp value={form.department} onChange={e=>setF("department",e.target.value)}/></Fld>
        </div>
        {form.required_date&&form.required_date<=today&&<PrfBanner c="#b45309" bg="#fffbeb">Needed today or earlier — this goes through PM, Warehouse and Cost Control first. Mark it Urgent if it truly is.</PrfBanner>}

        <datalist id="prf-units">{PO_UNITS.map(u=><option key={u} value={u}/>)}</datalist>
        <datalist id="prf-cats">{PR_CATS.map(c=><option key={c} value={c}/>)}</datalist>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {lines.map((l,i)=>(
            <div key={i} style={{border:"1px solid #e2e8f0",borderRadius:10,padding:"8px 10px",background:"#fcfcfd"}}>
              <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"28px 2fr 1.3fr 1fr 70px 80px 110px 28px",gap:6,alignItems:"end"}}>
                {!isMobile&&<div style={{fontWeight:700,color:"#94a3b8",fontSize:".78rem",paddingBottom:6}}>{i+1}</div>}
                <div style={isMobile?{gridColumn:"1/-1"}:null}><label style={lbl}>Item / description *</label><input value={l.description} onChange={e=>setL(i,"description",e.target.value)} placeholder="e.g. EMT pipe" style={inp}/></div>
                <div><label style={lbl}>Specification / size</label><input value={l.spec} onChange={e=>setL(i,"spec",e.target.value)} placeholder='e.g. 1/2" x 10ft' style={inp}/></div>
                <div><label style={lbl}>Brand / supplier</label><input value={l.brand} onChange={e=>setL(i,"brand",e.target.value)} style={inp}/></div>
                <div><label style={lbl}>Qty *</label><input type="number" min={0} value={l.qty} onChange={e=>setL(i,"qty",e.target.value)} style={inp}/></div>
                <div><label style={lbl}>Unit *</label><input list="prf-units" value={l.unit} onChange={e=>setL(i,"unit",e.target.value)} style={inp}/></div>
                <div><label style={lbl}>Est. unit cost *</label>
                  <div style={{display:"flex",gap:3}}>
                    <input type="number" min={0} value={l.est_unit_cost} onChange={e=>setL(i,"est_unit_cost",e.target.value)} placeholder="₱" style={inp}/>
                    <button type="button" onClick={()=>lookup(i)} title="Last purchase price" aria-label="Look up last purchase price" style={{border:"1.5px solid #e2e8f0",background:"#fff",borderRadius:6,cursor:"pointer",fontSize:".72rem",padding:"0 6px"}}>₱?</button>
                  </div>
                </div>
                <button type="button" onClick={()=>delL(i)} aria-label={`Remove item ${i+1}`} style={{border:"none",background:"#fef2f2",color:"#dc2626",borderRadius:6,cursor:"pointer",height:30}}>✕</button>
              </div>
              <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"28px 1fr 2fr",gap:6,marginTop:6}}>
                {!isMobile&&<div/>}
                <div><label style={lbl}>Category</label><input list="prf-cats" value={l.category} onChange={e=>setL(i,"category",e.target.value)} style={inp}/></div>
                <div><label style={lbl}>Remarks (e.g. "use what's in the warehouse")</label><input value={l.remarks} onChange={e=>setL(i,"remarks",e.target.value)} style={inp}/></div>
              </div>
              {hints[i]?.length>0&&(
                <div style={{marginTop:6,display:"flex",gap:6,flexWrap:"wrap"}}>
                  {hints[i].map(h=>(
                    <button key={h.item+h.last_date} type="button" onClick={()=>{setL(i,"est_unit_cost",String(h.unit_price));if(h.unit&&!String(l.unit).trim())setL(i,"unit",h.unit);setHints(x=>({...x,[i]:[]}));}}
                      style={{border:"1px solid #bfdbfe",background:"#eff6ff",color:"#1d4ed8",borderRadius:20,padding:"3px 10px",fontSize:".7rem",cursor:"pointer",fontFamily:"inherit"}}>
                      {h.item} — {prfPeso(h.unit_price)}/{h.unit||"unit"} · {h.last_date}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          <button type="button" onClick={addL} style={{...prfBtn("#f8fafc","#475569","#e2e8f0"),alignSelf:"flex-start"}}>+ Add item</button>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10,borderTop:"1px solid #f1f5f9",paddingTop:10}}>
          <div style={{fontSize:".85rem",color:"#475569"}}>Total estimate: <b style={{color:"#0f172a"}}>{prfPeso(est)}</b></div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>setEditing(null)} style={prfBtn("#f1f5f9","#64748b")}>Close</button>
            <button disabled={busy} onClick={onSave} style={prfBtn("#eff6ff","#1d4ed8")}>Save draft</button>
            <button disabled={busy} onClick={onSubmit} style={prfBtn("#f97316","#fff")}>Save &amp; submit</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ── Print (same layout as the Excel PRF) ─────────────────────────────────────
function printPrf(p,lines,projName,deal){
  const w=window.open("","_blank","width=1000,height=1000");
  if(!w){toastEmit("Allow pop-ups to print the PRF.","error");return;}
  const checked=lines.some(l=>l.stock_qty!=null);
  const rows=lines.map(l=>`<tr><td class="c">${l.line_no}</td><td>${prfEsc(l.category)}</td><td>${prfEsc(l.description)}</td><td>${prfEsc(l.spec)}</td><td>${prfEsc(l.brand)}</td>
    <td class="c">${prfNum(l.qty)}</td><td class="c">${prfEsc(l.unit)}</td><td class="r">${l.est_unit_cost==null?"":prfPeso(l.est_unit_cost)}</td><td class="r">${prfPeso(prfNum(l.qty)*prfNum(l.est_unit_cost))}</td>
    ${checked?`<td class="c">${l.stock_qty==null?"":prfNum(l.stock_qty)}</td><td class="c">${l.stock_qty==null?"":prfBuyQty(l)}</td><td>${prfEsc(l.po_number||"")}</td>`:""}<td>${prfEsc(l.remarks)}</td></tr>`).join("");
  const est=lines.reduce((s,l)=>s+prfNum(l.qty)*prfNum(l.est_unit_cost),0);
  const sig=(label,name,at)=>`<td><div class="sl">${label}</div><div class="sn">${prfEsc(name||"")}</div><div class="sd">${at?prfEsc(prfDT(at)):""}</div></td>`;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${prfEsc(p.prf_no||"PRF")}</title><style>
    body{font:12px Arial,sans-serif;color:#111;margin:24px}h1{background:#1f3a5f;color:#fff;font-size:14px;text-align:center;padding:6px;margin:0 0 10px}
    table{border-collapse:collapse;width:100%}td,th{border:1px solid #9aa5b1;padding:4px 6px;vertical-align:top}th{background:#1f3a5f;color:#fff;font-size:11px}
    .h td{border:none;padding:2px 6px}.h .k{background:#1f3a5f;color:#fff;font-weight:bold;width:120px}.c{text-align:center}.r{text-align:right}
    .sig td{height:58px;width:20%}.sl{font-size:10px;color:#555;text-transform:uppercase}.sn{font-weight:bold;margin-top:14px}.sd{font-size:10px;color:#555}
    @media print{.fh-close{display:none}}</style></head><body>
    <h1>FABRICATION MATERIALS PURCHASE REQUEST FORM</h1>
    <table class="h"><tr><td class="k">PRF No.</td><td>${prfEsc(p.prf_no||"DRAFT")}</td><td class="k">Date Requested</td><td>${prfEsc((p.submitted_at||p.created_at||"").slice(0,10))}</td><td class="k">Required Date</td><td>${prfEsc(p.required_date||"")}</td></tr>
    <tr><td class="k">Department</td><td>${prfEsc(p.department)}</td><td class="k">Requestor</td><td>${prfEsc(p.requested_by_name||p.requested_by)}</td><td class="k">Priority</td><td>${prfEsc(p.priority)}</td></tr>
    <tr><td class="k">Project</td><td>${prfEsc(projName)}</td><td class="k">Project Code</td><td>${prfEsc(deal?.ceNo||"")}</td><td class="k">Client</td><td>${prfEsc(deal?.client||"")}</td></tr>
    <tr><td class="k">Site / Location</td><td>${prfEsc(p.location||deal?.location||"")}</td><td class="k">Purpose / Scope</td><td colspan="3">${prfEsc(p.purpose)}</td></tr></table><br>
    <table><tr><th>No.</th><th>Category</th><th>Material / Item</th><th>Specification</th><th>Brand / Supplier</th><th>Qty</th><th>Unit</th><th>Est. Unit Cost</th><th>Est. Total</th>
    ${checked?"<th>From Stock</th><th>To Buy</th><th>PO</th>":""}<th>Remarks</th></tr>${rows}
    <tr><td colspan="8" class="r"><b>TOTAL ESTIMATE</b></td><td class="r"><b>${prfPeso(est)}</b></td><td colspan="${checked?4:1}"></td></tr></table><br>
    <table class="sig"><tr>${sig("Prepared by",p.requested_by_name||p.requested_by,p.submitted_at)}${sig("Checked by PM",p.pm_skipped?"(not needed)":p.pm_signed_by,p.pm_signed_at)}${sig("Warehouse",p.wh_signed_by,p.wh_signed_at)}${sig("Cost Control",p.qs_signed_by,p.qs_signed_at)}${sig("Procurement",p.status==="Ordered"?"Ordered":"",p.ordered_at)}</tr></table>
    <p style="font-size:10px;color:#555">Status: ${prfEsc(p.status)} · Printed from FabHub ${prfEsc(new Date().toLocaleString("en-PH"))}</p>
    </body></html>`);
  w.document.close();addPrintClose(w);setTimeout(()=>{try{w.print();}catch(e){}},300);
}

const prfBtn=(bg,color,border)=>({background:bg,color,border:`1.5px solid ${border||bg}`,borderRadius:8,padding:"7px 14px",fontFamily:"inherit",fontSize:".8rem",fontWeight:700,cursor:"pointer"});
const prfPill={border:"1.5px solid #e2e8f0",borderRadius:20,padding:"5px 12px",fontFamily:"inherit",fontSize:".74rem",fontWeight:600,cursor:"pointer"};
const prfLink={background:"none",border:"none",padding:0,color:"inherit",textDecoration:"underline",cursor:"pointer",fontFamily:"inherit",fontSize:"inherit",fontWeight:700};
function PrfBanner({c,bg,children}){return <div style={{background:bg,border:`1.5px solid ${c}33`,color:c,borderRadius:10,padding:"9px 14px",fontSize:".8rem",marginBottom:12}}>{children}</div>;}
