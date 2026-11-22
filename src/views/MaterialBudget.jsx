import React,{useState,useEffect,useMemo,useCallback} from "react";
import {supabase,isSupabaseReady,sbListAll} from "../supabaseClient";
import {toastEmit,uiConfirm,uiPrompt,today,ProjectSelect} from "../shared";
import {WON_STAGES,PO_UNITS,PR_CATS,projDisplayName,canonRole,MB_EDITOR_ROLES,MB_STATUS_CLR,mbStatusLabel} from "../core";

// ─── MATERIAL BUDGET (phase 1, Paulo 2026-11-22) ──────────────────────────────
// GMD split into Operations / design (Mar, Arrius) and back-end support (Paulo).
// Procurement orders a project's materials from a material list Cost Control (QS)
// sets at award; a PRF is only for a special item Operations asks for.
// The BOQ lists deliverables ("Metal Structure, 1 lot"), so QS breaks each BOQ item
// into material lines here. Draft → For PM Review → PM Confirmed → Locked; a Manager
// may lock without the PM (recorded); a locked budget changes only through Revise
// (reason, new revision). Procurement orders from the last locked revision
// (locked_rev) on the Order Board.
// The database owns all of it (migration 20261122040000_material_budgets.sql): no
// client writes, every change is an RPC that re-checks role and status. The
// buttons below only decide what to show — keep them in sync with that migration.

const MBV_STAGES=WON_STAGES.filter(s=>s!=="14 · Completed");
const mbNum=v=>Number(String(v??"").replace(/,/g,""))||0;
const mbPeso=v=>"₱"+mbNum(v).toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2});
const mbPeso0=v=>"₱"+Math.round(mbNum(v)).toLocaleString("en-PH");
const mbNorm=s=>String(s||"").replace(/\s*\([^)]*\)\s*$/,"").trim().toLowerCase();
const mbErrMsg=e=>(e?.message||String(e||"")).replace(/^.*?:\s*(?=[A-Z])/,"");
const mbNewKey=()=>(typeof crypto!=="undefined"&&crypto.randomUUID)?crypto.randomUUID():null;
const mbEmptyRow=(boq)=>({_k:Math.random().toString(36).slice(2),line_key:mbNewKey(),boq_item_id:boq?._id||"",boq_item:boq?.description||"",
  category:"Materials",item:"",spec:"",qty:"",unit:"pcs",est_unit_cost:"",need_by:"",remarks:""});
const mbRowOf=l=>({_k:l.id,line_key:l.line_key,boq_item_id:l.boq_item_id||"",boq_item:l.boq_item||"",category:l.category||"Materials",item:l.item,
  spec:l.spec||"",qty:String(l.qty),unit:l.unit,est_unit_cost:String(l.est_unit_cost??""),need_by:l.need_by||"",remarks:l.remarks||""});
const mbBoqTotal=items=>(items||[]).reduce((s,it)=>s+(mbNum(it.total)||mbNum(it.qty)*mbNum(it.unitCost)),0);
const mbIsMissingTable=e=>/does not exist|schema cache|PGRST205|42P01/i.test(`${e?.code||""} ${e?.message||""}`);

export default function MaterialBudget({session,role,deals=[],pcards={},isMobile,initialDeal}){
  const myName=session?.name||"";
  const isEditor=MB_EDITOR_ROLES.includes(role)||canonRole(role)==="Manager";
  const isMgr=canonRole(role)==="Manager";
  const[budgets,setBudgets]=useState([]);
  const[lines,setLines]=useState([]);
  const[loading,setLoading]=useState(true);
  const[missing,setMissing]=useState(false);
  const[dealId,setDealId]=useState(initialDeal||"");
  const[rows,setRows]=useState([]);
  const[dirty,setDirty]=useState(false);
  const[ordered,setOrdered]=useState({});
  const[busy,setBusy]=useState(false);

  const load=useCallback(async()=>{
    if(!isSupabaseReady()||!supabase){setLoading(false);return;}
    // material_budgets is keyed by deal_id (no id column), so not sbListAll.
    const{data:b,error}=await supabase.from("material_budgets").select("*");
    if(error){setMissing(mbIsMissingTable(error));if(!mbIsMissingTable(error))toastEmit("⚠ "+mbErrMsg(error),"error",7000);setLoading(false);return;}
    const l=await sbListAll("material_budget_lines",{order:"line_no",asc:true});
    setMissing(false);setBudgets(b||[]);setLines((l||[]).filter(x=>!x.removed));setLoading(false);
  },[]);
  useEffect(()=>{load();const t=setInterval(load,60000);return()=>clearInterval(t);},[load]);

  const projects=useMemo(()=>deals.filter(d=>MBV_STAGES.includes(d.stage)&&!d.isCostCenter&&!(d.standbyPO&&!d.parentDealId))
    .sort((a,b)=>projDisplayName(a).localeCompare(projDisplayName(b))),[deals]);
  const budgetOf=useCallback(id=>budgets.find(b=>b.deal_id===id)||null,[budgets]);
  const deal=projects.find(d=>d.id===dealId)||deals.find(d=>d.id===dealId)||null;
  const budget=budgetOf(dealId);
  const curLines=useMemo(()=>budget?lines.filter(l=>l.deal_id===dealId&&l.rev===budget.rev).sort((a,b)=>a.line_no-b.line_no):[],[lines,budget,dealId]);
  const lockedLines=useMemo(()=>budget?.locked_rev?lines.filter(l=>l.deal_id===dealId&&l.rev===budget.locked_rev).sort((a,b)=>a.line_no-b.line_no):[],[lines,budget,dealId]);
  const editable=isEditor&&(!budget||budget.status==="Draft");
  const isProjectPM=!!(deal&&myName&&pcards[deal.id]&&["pm1","pm2","pm3"].some(k=>pcards[deal.id][k]&&mbNorm(pcards[deal.id][k])===mbNorm(myName)));
  const canPM=isMgr||role==="Operations"||isProjectPM;
  const preparedByMe=budget&&mbNorm(budget.prepared_by)===mbNorm(myName);

  // Reset the editable rows when the project or the server's revision changes.
  useEffect(()=>{setRows(curLines.map(mbRowOf));setDirty(false);},[dealId,budget?.rev,budget?.status,budget?.updated_at,curLines.length]);
  useEffect(()=>{
    let gone=false;
    if(!dealId||!budget?.locked_rev||!supabase){setOrdered({});return;}
    supabase.rpc("material_budget_ordered",{p_deal:dealId}).then(({data,error})=>{
      if(gone) return;
      if(error){console.warn("[FabHub] material_budget_ordered",error.message);return;}
      setOrdered(Object.fromEntries((data||[]).map(r=>[r.line_key,{qty:mbNum(r.ordered_qty),pos:r.po_numbers||""}])));
    });
    return()=>{gone=true;};
  },[dealId,budget?.locked_rev,budget?.updated_at]);

  const run=async(fn,args,okMsg)=>{
    if(busy) return null;
    setBusy(true);
    const{data,error}=await supabase.rpc(fn,args);
    setBusy(false);
    if(error){toastEmit("⚠ "+mbErrMsg(error),"error",9000);return null;}
    if(okMsg) toastEmit(okMsg,"success");
    await load();
    return data??true;
  };
  const payload=()=>rows.filter(r=>String(r.item).trim()||mbNum(r.qty)).map(r=>({line_key:r.line_key||null,boq_item_id:r.boq_item_id,boq_item:r.boq_item,
    category:r.category,item:String(r.item).trim(),spec:r.spec,qty:mbNum(r.qty),unit:r.unit,est_unit_cost:mbNum(r.est_unit_cost),need_by:r.need_by||null,remarks:r.remarks}));
  const save=async(quiet)=>{const n=await run("save_material_budget",{p_deal:dealId,p_lines:payload()},quiet?null:"Draft saved");if(n!=null)setDirty(false);return n!=null;};
  const submit=async()=>{if(dirty||!budget){if(!(await save(true)))return;}await run("submit_material_budget",{p_deal:dealId},"Sent to the PM for review");};
  const confirmPM=async()=>{
    const note=await uiPrompt({title:"Confirm the material list",message:"Confirm that this list covers everything the project needs. Optional note:",confirmLabel:"Confirm"});
    if(note==null) return;
    await run("confirm_material_budget",{p_deal:dealId,p_note:note},"Confirmed — Cost Control can now lock it");
  };
  const sendBack=async()=>{
    const r=await uiPrompt({title:"Send the budget back",message:"What is missing or wrong? (at least 10 characters)",confirmLabel:"Send back"});
    if(r==null) return;
    if(r.trim().length<10){toastEmit("Say what is missing or wrong (at least 10 characters)","error");return;}
    await run("return_material_budget",{p_deal:dealId,p_reason:r},"Sent back to Cost Control");
  };
  const lock=async()=>{
    if(budget?.status==="For PM Review"&&!(await uiConfirm({title:"Lock without the PM?",tone:"warning",confirmLabel:"Lock without PM",
      message:"The PM has not confirmed this list yet. Locking now is recorded as 'PM step skipped' and sent to Procurement and Cost Control."}))) return;
    await run("lock_material_budget",{p_deal:dealId},"Locked — Procurement can order from it");
  };
  const revise=async()=>{
    const r=await uiPrompt({title:"Revise the locked budget",message:"Why does it change? (at least 10 characters). Procurement keeps ordering from the current locked revision until the new one is locked.",confirmLabel:"Open a revision"});
    if(r==null) return;
    if(r.trim().length<10){toastEmit("Give the reason (at least 10 characters)","error");return;}
    await run("revise_material_budget",{p_deal:dealId,p_reason:r},"New revision opened as a draft");
  };

  const setRow=(k,f,v)=>{setRows(rs=>rs.map(r=>r._k===k?{...r,[f]:v}:r));setDirty(true);};
  const addRow=boq=>{setRows(rs=>[...rs,mbEmptyRow(boq)]);setDirty(true);};
  const delRow=k=>{setRows(rs=>rs.filter(r=>r._k!==k));setDirty(true);};

  const boqItems=(deal?.boqData||deal?.boq_data)?.items||[];
  const boqSum=mbBoqTotal(boqItems);
  const shownRows=editable?rows:curLines.map(mbRowOf);
  const total=shownRows.reduce((s,r)=>s+mbNum(r.qty)*mbNum(r.est_unit_cost),0);
  const groups=useMemo(()=>{
    const ids=new Set(boqItems.map(i=>i._id));
    const g=boqItems.map(it=>({boq:it,rows:shownRows.filter(r=>r.boq_item_id===it._id)}));
    const loose=shownRows.filter(r=>!r.boq_item_id||!ids.has(r.boq_item_id));
    return {g,loose};
  },[boqItems,shownRows]);

  // Budgets waiting for this person.
  const waiting=budgets.filter(b=>{
    const pc=pcards[b.deal_id];
    const pm=isMgr||role==="Operations"||(pc&&myName&&["pm1","pm2","pm3"].some(k=>pc[k]&&mbNorm(pc[k])===mbNorm(myName)));
    if(b.status==="For PM Review"&&pm&&mbNorm(b.prepared_by)!==mbNorm(myName)) return true;
    if(b.status==="PM Confirmed"&&isEditor) return true;
    return false;
  });

  const cell={padding:"6px 8px",fontSize:".76rem",borderBottom:"1px solid #f1f5f9",verticalAlign:"top"};
  const th={...cell,fontSize:".6rem",textTransform:"uppercase",letterSpacing:".06em",color:"#94a3b8",fontWeight:700,background:"#f8fafc",textAlign:"left",whiteSpace:"nowrap"};
  const inp={width:"100%",minWidth:0,border:"1.5px solid #e2e8f0",borderRadius:6,padding:"5px 6px",fontFamily:"inherit",fontSize:".76rem",boxSizing:"border-box",background:"#fff"};

  const rowEditor=r=>(
    <div key={r._k} style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"2fr 1.6fr .7fr .8fr .9fr 1fr 1fr 28px",gap:6,alignItems:"center",padding:"6px 0",borderBottom:"1px dashed #e2e8f0"}}>
      <input value={r.item} onChange={e=>setRow(r._k,"item",e.target.value)} placeholder="Material, e.g. Tubular steel" aria-label="Material" style={{...inp,gridColumn:isMobile?"1 / -1":undefined}}/>
      <input value={r.spec} onChange={e=>setRow(r._k,"spec",e.target.value)} placeholder="Spec / size" aria-label="Spec" style={{...inp,gridColumn:isMobile?"1 / -1":undefined}}/>
      <input type="number" min={0} value={r.qty} onChange={e=>setRow(r._k,"qty",e.target.value)} placeholder="Qty" aria-label="Quantity" style={inp}/>
      <select value={r.unit} onChange={e=>setRow(r._k,"unit",e.target.value)} aria-label="Unit" style={inp}>
        {[...new Set([r.unit,...PO_UNITS])].filter(Boolean).map(u=><option key={u} value={u}>{u}</option>)}
      </select>
      <input type="number" min={0} value={r.est_unit_cost} onChange={e=>setRow(r._k,"est_unit_cost",e.target.value)} placeholder="Est. unit ₱" aria-label="Estimated unit cost" style={inp}/>
      <input type="date" value={r.need_by} onChange={e=>setRow(r._k,"need_by",e.target.value)} aria-label="Need by" title="Need by (date Procurement should order by)" style={inp}/>
      <select value={r.category} onChange={e=>setRow(r._k,"category",e.target.value)} aria-label="Category" style={inp}>
        {[...new Set([r.category,...PR_CATS])].filter(Boolean).map(c=><option key={c} value={c}>{c}</option>)}
      </select>
      <button type="button" onClick={()=>delRow(r._k)} aria-label="Remove line" title="Remove line" style={{background:"none",border:"none",color:"#dc2626",cursor:"pointer",fontSize:"1rem",padding:0}}>✕</button>
      <input value={r.remarks} onChange={e=>setRow(r._k,"remarks",e.target.value)} placeholder="Remarks (optional)" aria-label="Remarks" style={{...inp,gridColumn:"1 / -1",fontSize:".72rem",color:"#475569"}}/>
    </div>
  );
  const rowView=r=>(
    <div key={r._k} style={{display:"grid",gridTemplateColumns:isMobile?"1fr auto":"2fr 1.6fr .8fr 1fr 1fr 1fr",gap:6,padding:"6px 0",borderBottom:"1px dashed #e2e8f0",fontSize:".76rem"}}>
      <div style={{fontWeight:600,color:"#0f172a"}}>{r.item}{r.remarks&&<div style={{fontSize:".66rem",color:"#94a3b8",fontWeight:400}}>{r.remarks}</div>}</div>
      {!isMobile&&<div style={{color:"#475569"}}>{r.spec||"—"}</div>}
      <div style={{whiteSpace:"nowrap"}}>{mbNum(r.qty)} {r.unit}</div>
      {!isMobile&&<div>{mbPeso(r.est_unit_cost)}</div>}
      {!isMobile&&<div style={{fontWeight:700}}>{mbPeso(mbNum(r.qty)*mbNum(r.est_unit_cost))}</div>}
      {!isMobile&&<div style={{color:"#64748b"}}>{r.need_by||"—"}</div>}
    </div>
  );

  const status=budget?.status||null;
  const sc=MB_STATUS_CLR[status]||"#64748b";

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12,marginBottom:16}}>
        <div>
          <h2 style={{margin:0,fontWeight:800,color:"#0f172a",fontSize:"1.15rem"}}>🧾 Material Budget</h2>
          <div style={{fontSize:".75rem",color:"#64748b",marginTop:2}}>Cost Control breaks the BOQ into materials → PM confirms it is complete → Cost Control locks it → Procurement orders from it</div>
        </div>
        <button onClick={load} style={mbBtn("#f1f5f9","#475569")}>↻ Refresh</button>
      </div>

      {!isSupabaseReady()&&<MbBanner c="#b45309" bg="#fffbeb">Material budgets need a connection to the server — you're offline.</MbBanner>}
      {missing&&<MbBanner c="#b45309" bg="#fffbeb">Material budgets aren't switched on in the database yet. This page starts working once the database update is applied.</MbBanner>}
      {waiting.length>0&&<MbBanner c="#6d28d9" bg="#f5f3ff">⏳ Waiting for you: {waiting.map((b,i)=>{const d=deals.find(x=>x.id===b.deal_id);return(
        <span key={b.deal_id}>{i>0?", ":""}<button onClick={()=>setDealId(b.deal_id)} style={mbLink}>{d?projDisplayName(d):"a project"}</button> ({b.status})</span>);})}</MbBanner>}

      <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,padding:14,marginBottom:14}}>
        <div style={{fontSize:".62rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".08em",color:"#94a3b8",marginBottom:6}}>Project</div>
        <ProjectSelect value={dealId} onChange={e=>setDealId(e.target.value)}>
          <option value="">Pick an awarded project…</option>
          {projects.map(d=><option key={d.id} value={d.id}>{projDisplayName(d)} — {mbStatusLabel(budgetOf(d.id))}</option>)}
        </ProjectSelect>
      </div>

      {loading?<div style={{padding:20,color:"#94a3b8",fontSize:".85rem"}}>Loading budgets…</div>
      :!deal?<div style={{padding:20,color:"#94a3b8",fontSize:".85rem"}}>Pick a project to see or prepare its material budget. {projects.length} awarded projects; {budgets.filter(b=>b.status==="Locked"||b.locked_rev).length} have a locked budget.</div>
      :(
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(5,1fr)",gap:8}}>
            {[["Status",<span style={{color:sc,fontWeight:800}}>{mbStatusLabel(budget)}</span>],
              ["Prepared by",budget?.prepared_by||"—"],
              ["PM confirmed",budget?.pm_confirmed_by||(budget?.pm_skipped?"Skipped by a Manager":"—")],
              ["Locked by",budget?.locked_by?`${budget.locked_by}${budget.locked_rev?` (rev ${budget.locked_rev})`:""}`:"—"],
              ["Budget vs BOQ",boqSum>0?`${mbPeso0(total)} = ${Math.round(total/boqSum*100)}% of ${mbPeso0(boqSum)}`:mbPeso0(total)]].map(([k,v])=>(
              <div key={k} style={{background:"#f8fafc",borderRadius:8,padding:"7px 10px"}}>
                <div style={{fontSize:".58rem",textTransform:"uppercase",letterSpacing:".8px",color:"#94a3b8"}}>{k}</div>
                <div style={{fontSize:".8rem",fontWeight:600,color:"#0f172a"}}>{v}</div>
              </div>
            ))}
          </div>
          {budget?.return_reason&&status==="Draft"&&<MbBanner c="#b91c1c" bg="#fef2f2">↩️ Sent back by {budget.returned_by}: “{budget.return_reason}”</MbBanner>}
          {budget?.revise_reason&&status!=="Locked"&&budget.locked_rev&&<MbBanner c="#92400e" bg="#fffbeb">✏️ Revision {budget.rev} in progress: “{budget.revise_reason}”. Procurement still orders from rev {budget.locked_rev} until this one is locked.</MbBanner>}
          {!boqItems.length&&<MbBanner c="#475569" bg="#f8fafc">This project has no BOQ in FabHub. Material lines can still be added; they show as "Not linked to a BOQ item".</MbBanner>}

          <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,padding:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8,marginBottom:8}}>
              <div style={{fontWeight:800,color:"#0f172a",fontSize:".9rem"}}>{editable?(budget?`Draft · rev ${budget.rev}`:"New budget"):`Rev ${budget?.rev||1} · ${status||"No budget"}`}</div>
              <div style={{fontSize:".78rem",color:"#475569"}}>{shownRows.length} line{shownRows.length!==1?"s":""} · <b style={{color:"#0f172a"}}>{mbPeso(total)}</b>{dirty&&<span style={{color:"#b45309",fontWeight:700}}> · unsaved</span>}</div>
            </div>
            {!budget&&!isEditor&&<div style={{fontSize:".8rem",color:"#94a3b8",padding:"6px 0"}}>No material budget yet. Cost Control (QS) prepares it.</div>}
            {groups.g.map(({boq,rows:rs})=>(rs.length>0||editable)&&(
              <div key={boq._id} style={{marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:8,background:"#f8fafc",borderRadius:8,padding:"6px 10px"}}>
                  <div style={{fontSize:".78rem",fontWeight:700,color:"#0f172a"}}>{boq.section?`${boq.section} · `:""}{boq.description||"BOQ item"} <span style={{fontWeight:500,color:"#64748b"}}>· {mbNum(boq.qty)} {boq.unit}</span></div>
                  {editable&&<button type="button" onClick={()=>addRow(boq)} style={{...mbLink,color:"#1d4ed8",fontSize:".74rem"}}>+ Material</button>}
                </div>
                {rs.map(r=>editable?rowEditor(r):rowView(r))}
              </div>
            ))}
            {(groups.loose.length>0||editable)&&(
              <div style={{marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:8,background:"#f8fafc",borderRadius:8,padding:"6px 10px"}}>
                  <div style={{fontSize:".78rem",fontWeight:700,color:"#64748b"}}>Not linked to a BOQ item</div>
                  {editable&&<button type="button" onClick={()=>addRow(null)} style={{...mbLink,color:"#1d4ed8",fontSize:".74rem"}}>+ Material</button>}
                </div>
                {groups.loose.map(r=>editable?rowEditor(r):rowView(r))}
              </div>
            )}
            <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"flex-end",marginTop:8}}>
              {editable&&<button disabled={busy||!dirty} onClick={()=>save(false)} style={mbBtn("#eff6ff","#1d4ed8")}>Save draft</button>}
              {editable&&<button disabled={busy||!rows.length} onClick={submit} style={mbBtn("#8b5cf6","#fff")}>Send for PM review</button>}
              {(status==="For PM Review"||status==="PM Confirmed")&&(canPM||isEditor)&&<button disabled={busy} onClick={sendBack} style={mbBtn("#fef2f2","#dc2626","#fecaca")}>↩ Send back</button>}
              {status==="For PM Review"&&canPM&&!preparedByMe&&<button disabled={busy} onClick={confirmPM} style={mbBtn("#0ea5e9","#fff")}>✓ Confirm (PM)</button>}
              {status==="For PM Review"&&isMgr&&<button disabled={busy} onClick={lock} style={mbBtn("#fff","#047857","#a7f3d0")}>Lock without PM</button>}
              {status==="PM Confirmed"&&isEditor&&<button disabled={busy} onClick={lock} style={mbBtn("#10b981","#fff")}>🔒 Lock</button>}
              {status==="Locked"&&isEditor&&<button disabled={busy} onClick={revise} style={mbBtn("#fffbeb","#92400e","#fde68a")}>✏️ Revise</button>}
            </div>
            {status==="For PM Review"&&preparedByMe&&<div style={{fontSize:".72rem",color:"#64748b",textAlign:"right",marginTop:4}}>You prepared this budget, so another person confirms it.</div>}
          </div>

          {budget?.locked_rev&&lockedLines.length>0&&(
            <div style={{background:"#fff",border:"1px solid #a7f3d0",borderRadius:12,padding:14}}>
              <div style={{fontWeight:800,color:"#065f46",fontSize:".9rem",marginBottom:8}}>🔒 What Procurement orders from · rev {budget.locked_rev}</div>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",minWidth:isMobile?640:0}}>
                  <thead><tr><th style={th}>Material</th><th style={th}>Budget</th><th style={th}>Ordered</th><th style={th}>Remaining</th><th style={th}>Est. cost</th><th style={th}>Need by</th><th style={th}>POs</th></tr></thead>
                  <tbody>{lockedLines.map(l=>{
                    const o=ordered[l.line_key]?.qty||0, rem=mbNum(l.qty)-o, over=o>mbNum(l.qty);
                    const late=l.need_by&&l.need_by<today&&rem>0;
                    return(
                      <tr key={l.id}>
                        <td style={cell}><div style={{fontWeight:600}}>{l.item}</div><div style={{fontSize:".66rem",color:"#94a3b8"}}>{[l.spec,l.boq_item].filter(Boolean).join(" · ")}</div></td>
                        <td style={{...cell,whiteSpace:"nowrap"}}>{mbNum(l.qty)} {l.unit}</td>
                        <td style={{...cell,whiteSpace:"nowrap",color:over?"#dc2626":"#0f172a",fontWeight:over?800:500}}>{o} {l.unit}{over?" ⚠":""}</td>
                        <td style={{...cell,whiteSpace:"nowrap",fontWeight:700,color:rem>0?"#c2410c":"#059669"}}>{Math.max(0,rem)} {l.unit}</td>
                        <td style={cell}>{mbPeso(mbNum(l.qty)*mbNum(l.est_unit_cost))}</td>
                        <td style={{...cell,color:late?"#dc2626":"#475569",fontWeight:late?700:400}}>{l.need_by||"—"}{late?" ⚠":""}</td>
                        <td style={{...cell,fontSize:".7rem",color:"#475569"}}>{ordered[l.line_key]?.pos||"—"}</td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
              <div style={{fontSize:".7rem",color:"#64748b",marginTop:6}}>Ordered counts every PO line created from this budget on the Order Board (cancelled lines excluded). Red means more was ordered than budgeted.</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const mbBtn=(bg,color,border)=>({background:bg,color,border:`1.5px solid ${border||bg}`,borderRadius:8,padding:"7px 14px",fontFamily:"inherit",fontSize:".8rem",fontWeight:700,cursor:"pointer"});
const mbLink={background:"none",border:"none",padding:0,color:"inherit",textDecoration:"underline",cursor:"pointer",fontFamily:"inherit",fontSize:"inherit",fontWeight:700};
function MbBanner({c,bg,children}){return <div style={{background:bg,border:`1.5px solid ${c}33`,color:c,borderRadius:10,padding:"9px 14px",fontSize:".8rem",marginBottom:12}}>{children}</div>;}
