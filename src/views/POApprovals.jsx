import React,{useState,useMemo,useEffect,useCallback,useRef} from "react";
import {uiConfirm,takeLanding} from "../shared";
import {canApprovePOLine,poLinesTotal,poSplitTotal,dealDpClear,dealDpAwarded,prfRuleOn,canonRole} from "../core";
import {supabase,isSupabaseReady} from "../supabaseClient";

// ─── PO APPROVALS (Purchase Orders page) ───────────────────────────────────
// Procurement issues POs of ₱10,000 or less itself (canAutoIssuePO, 20261123010000);
// Cost Control (QS) up to ₱150,000 or a Manager (any amount) may move a PO to
// "PO Issued" (canApprovePOLine; the database checks it too, 20261107010000). Approving meant opening
// each PO line's status dropdown, so POs piled up at "Pending Approval" and,
// because a PO raises its supplier bill only once issued, no payables were
// created either. This panel lists every pending PO the viewer may approve,
// grouped by PO number, and approves the ticked ones in one go (approvePOs).
// From 1 Dec 2026 a project PO needs an approved PRF (migration 20261122020000):
// the server says which pending POs are held (po_prf_status) and a Manager may
// override one with a reason (waive_po_prf: logged, Telegram to management).

const num=v=>Number(String(v??"").replace(/,/g,""))||0;
const pesoAmt=v=>"₱"+num(v).toLocaleString("en-PH",{maximumFractionDigits:0});
const PAGE=50;

// "Approve" on a home screen sends you here with the list open (2026-11-26):
// setLanding("poApprovals") in App, picked up by the list on the page you land on.

// Phones and tablets (under 1024px) get one card per PO instead of the table
// (2026-11-26): big checkbox, an Approve button per PO, and the down-payment
// waiver (dpGate = App's DpGate: Manager only, reason, logged) on a held PO.
export default function POApprovals({prs=[],deals=[],role,session,approvePOs,dpGate=null}){
  const[vw,setVw]=useState(()=>typeof window!=="undefined"?window.innerWidth:1200);
  useEffect(()=>{const on=()=>setVw(window.innerWidth);window.addEventListener("resize",on);return()=>window.removeEventListener("resize",on);},[]);
  const narrow=vw<1024;
  const[dpFor,setDpFor]=useState(null);   // PO no. whose waiver box is open
  // "View lines" before Approve (Paulo, 2026-11-27): a PO can be ticked or
  // approved only after its lines were opened on this screen, one PO at a time
  // (no "open all": Paulo removed it the same day so each PO is looked at). App-only review
  // step; the approver rules themselves stay in approve_po / po_require_approver.
  const[viewed,setViewed]=useState(()=>new Set());
  const[linesOpen,setLinesOpen]=useState(()=>new Set());
  const me=session?.name||"";
  const[open,setOpen]=useState(false);
  const boxRef=useRef(null);
  useEffect(()=>{
    if(!takeLanding("poApprovals")) return;
    setOpen(true);
    setTimeout(()=>{try{boxRef.current&&boxRef.current.scrollIntoView({behavior:"smooth",block:"start"});}catch{}},80);
  },[]);
  const[q,setQ]=useState("");
  const[who,setWho]=useState("All");
  const[sel,setSel]=useState(()=>new Set());
  const[limit,setLimit]=useState(PAGE);
  const[busy,setBusy]=useState(false);
  const[prfHeld,setPrfHeld]=useState({}); // po_number -> project name
  const[waiveFor,setWaiveFor]=useState(null);
  const[waiveWhy,setWaiveWhy]=useState("");
  const isMgr=canonRole(role)==="Manager";

  const dealName=id=>{const d=id&&deals.find(x=>x.id===id);return d?[d.client,d.ceNo].filter(Boolean).join(" · "):"";};
  // One row per pending PO the viewer may approve. A PO with any line the viewer
  // can't approve (e.g. their own request) is left out entirely.
  const pos=useMemo(()=>{
    const by={};
    prs.filter(p=>p.status==="Pending Approval"&&p.poNumber).forEach(p=>{(by[p.poNumber]=by[p.poNumber]||[]).push(p);});
    return Object.entries(by)
      .filter(([no,ls])=>{const tot=poLinesTotal(prs.filter(p=>p.poNumber===no));const split=poSplitTotal(prs,no);return ls.every(l=>canApprovePOLine(role,me,l.requestedBy,tot,split));})
      .map(([no,ls])=>{
        const f=ls[0];
        const gross=ls.reduce((s,i)=>s+(num(i.actUnitCost)||num(i.estUnitCost))*num(i.qty),0);
        // "NO DP = NO production": can't be issued while any line's deal has no
        // payment and no Manager waiver (dealDpClear; the database refuses it too).
        // Since 20261128010000 an awarded project only asks the approver for a
        // reason (approvePOs); a project that isn't awarded stays held.
        const unpaid=ls.map(l=>deals.find(x=>x.id===(l.projectId||l.dealId))).filter(d=>d&&!dealDpClear(d,deals));
        const held=unpaid.find(d=>!dealDpAwarded(d,deals));
        const ask=!held&&unpaid[0];
        return{no,lines:ls.length,supplier:f.supplier||"",project:f.projectName||dealName(f.projectId||f.dealId)||"GMD Stock",
          dpHold:held?(held.ceNo||held.client||"this project"):"",dpHoldId:held?held.id:null,
          dpAsk:ask?(ask.ceNo||ask.client||"this project"):"",dpAskId:ask?ask.id:null,items:ls,
          withVat:!!f.withVat,terms:f.termsText||f.paymentTerms||"",
          requestedBy:f.requestedBy||"",date:f.poDate||f.createdDate||String(f.createdAt||"").slice(0,10),gross:Math.round(gross*(f.withVat?1.12:1))};
      })
      .sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  },[prs,deals,role,me]);

  const posKey=pos.map(p=>p.no).join("|");
  const loadPrf=useCallback(async()=>{
    if(!prfRuleOn()||!posKey||!isSupabaseReady()||!supabase){setPrfHeld({});return;}
    const{data,error}=await supabase.rpc("po_prf_status",{p_pos:posKey.split("|")});
    if(error){console.warn("[FabHub] po_prf_status",error.message);return;}
    const m={};(data||[]).forEach(r=>{m[r.po_number]=r.project||"this project";});
    setPrfHeld(m);
  },[posKey]);
  useEffect(()=>{loadPrf();},[loadPrf]);
  const held=p=>p.dpHold||prfHeld[p.no];
  const waive=async()=>{
    const why=waiveWhy.trim();
    if(!waiveFor||why.length<10||busy) return;
    setBusy(true);
    const{error}=await supabase.rpc("waive_po_prf",{p_po:waiveFor,p_reason:why});
    setBusy(false);
    if(error){await uiConfirm({title:"Override not saved",confirmLabel:"OK",message:error.message});return;}
    setWaiveFor(null);setWaiveWhy("");loadPrf();
  };

  if(!pos.length) return null;
  const requesters=["All",...new Set(pos.map(p=>p.requestedBy||"(blank)"))];
  const qq=q.trim().toLowerCase();
  const rows=pos.filter(p=>(who==="All"||(p.requestedBy||"(blank)")===who)&&(!qq||[p.no,p.supplier,p.project,p.requestedBy].some(v=>String(v).toLowerCase().includes(qq))));
  const shown=rows.slice(0,limit);
  const picked=pos.filter(p=>sel.has(p.no));
  const pickedTotal=picked.reduce((s,p)=>s+p.gross,0);
  const canPick=p=>!held(p)&&viewed.has(p.no);
  const openLines=no=>{setViewed(v=>v.has(no)?v:new Set(v).add(no));setLinesOpen(o=>{const n=new Set(o);n.has(no)?n.delete(no):n.add(no);return n;});};
  const allShown=shown.some(canPick)&&shown.filter(canPick).every(p=>sel.has(p.no));
  const toggle=no=>setSel(prev=>{const n=new Set(prev);n.has(no)?n.delete(no):n.add(no);return n;});
  const toggleShown=()=>setSel(prev=>{const n=new Set(prev);shown.filter(canPick).forEach(p=>allShown?n.delete(p.no):n.add(p.no));return n;});
  const approve=async(only)=>{
    const picked=Array.isArray(only)?only:pos.filter(p=>sel.has(p.no));
    const pickedTotal=picked.reduce((s,p)=>s+p.gross,0);
    if(!picked.length||busy) return;
    if(picked.some(p=>!canPick(p))){setSel(new Set(picked.filter(canPick).map(p=>p.no)));return;}
    if(!(await uiConfirm({title:`Approve ${picked.length} PO${picked.length>1?"s":""}`,confirmLabel:"Approve and issue",
      message:`${picked.length} PO${picked.length>1?"s":""} · ${picked.reduce((s,p)=>s+p.lines,0)} lines · about ${pesoAmt(pickedTotal)}.\n\nEach is set to "PO Issued" with you as approver, and its supplier bill is raised for Finance. Only approve POs you have actually reviewed.`}))) return;
    setBusy(true);
    const ok=await approvePOs(picked.map(p=>p.no));
    setBusy(false);
    if(ok) setSel(prev=>{const n=new Set(prev);picked.forEach(p=>n.delete(p.no));return n;});
  };
  // The PO's lines: what is being bought, how many, at what price.
  const lineCost=l=>num(l.actUnitCost)||num(l.estUnitCost);
  const linesBlock=p=>(
    <div style={{marginTop:8,background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:8,padding:"6px 10px"}}>
      {p.items.map((l,i)=>(
        <div key={l.id||i} style={{display:"flex",justifyContent:"space-between",gap:10,padding:"5px 0",borderTop:i?"1px solid #eef2f7":"none",fontSize:".76rem"}}>
          <div style={{minWidth:0}}>
            <div style={{fontWeight:600,color:"#0f172a"}}>{l.itemName||l.item||"(no item name)"}</div>
            <div style={{color:"#64748b",fontSize:".7rem"}}>{num(l.qty).toLocaleString("en-PH")} {l.unit||""} × {pesoAmt(lineCost(l))}{l.projectName?` · ${l.projectName}`:""}{l.budgetCategory?` · ${l.budgetCategory}`:""}</div>
          </div>
          <div style={{fontWeight:700,whiteSpace:"nowrap",fontVariantNumeric:"tabular-nums"}}>{pesoAmt(num(l.qty)*lineCost(l))}</div>
        </div>
      ))}
      <div style={{fontSize:".68rem",color:"#64748b",borderTop:"1px solid #e2e8f0",paddingTop:5,marginTop:2}}>
        {p.withVat?"Prices + 12% VAT":"VAT not added"}{p.terms?` · Terms: ${p.terms}`:""} · Total about <b style={{color:"#0f172a"}}>{pesoAmt(p.gross)}</b>
      </div>
    </div>
  );
  const linesBtn=(p,big)=>(
    <button type="button" onClick={()=>openLines(p.no)} style={big
      ?{display:"block",width:"100%",marginTop:9,background:"#fff",color:"#1e293b",border:"1.5px solid #1e293b",borderRadius:8,padding:"9px",fontFamily:"inherit",fontWeight:800,fontSize:".82rem",cursor:"pointer"}
      :{background:"none",border:"none",color:"#2563eb",fontWeight:700,fontSize:".72rem",cursor:"pointer",fontFamily:"inherit",padding:0,marginTop:3}}>
      {linesOpen.has(p.no)?"Hide lines ▲":`View ${p.lines} line${p.lines>1?"s":""}${!held(p)&&!viewed.has(p.no)?" to approve":""} ▼`}
    </button>
  );
  // Why a PO can't be approved yet, and what a Manager can do about it.
  const holdBlock=(p)=>(<>
    {p.dpAsk&&<div style={{fontSize:".72rem",color:"#b45309",fontWeight:700,marginTop:4}}>{`Client hasn’t paid on ${p.dpAsk}: approving asks you for a reason, and management is told.`}</div>}
    {p.dpHold&&<div style={{fontSize:".72rem",color:"#b91c1c",fontWeight:700,marginTop:4}}>Project not awarded yet ({p.dpHold}): no PO before award
      {dpGate&&p.dpHoldId&&dpFor!==p.no&&<button type="button" onClick={()=>setDpFor(p.no)} style={{display:"inline-block",marginLeft:6,background:"#fff",border:"1.5px solid #b91c1c",borderRadius:7,padding:"4px 10px",color:"#b91c1c",fontWeight:700,cursor:"pointer",fontFamily:"inherit",fontSize:".72rem"}}>{isMgr?"Waive down payment":"How to clear"}</button>}
    </div>}
    {dpGate&&p.dpHoldId&&dpFor===p.no&&<div style={{marginTop:6}}>
      {dpGate(p.dpHoldId)}
      <button type="button" onClick={()=>setDpFor(null)} style={{background:"none",border:"none",color:"#475569",fontFamily:"inherit",fontSize:".72rem",cursor:"pointer",padding:0}}>Close</button>
    </div>}
    {prfHeld[p.no]&&<div style={{fontSize:".72rem",color:"#b91c1c",fontWeight:700,marginTop:4}}>No approved PRF on {prfHeld[p.no]}: link one from the Order Board{isMgr?"":", or ask a Manager to override"}
      {isMgr&&waiveFor!==p.no&&<button type="button" onClick={()=>{setWaiveFor(p.no);setWaiveWhy("");}} style={{marginLeft:6,background:"none",border:"none",color:"#b91c1c",textDecoration:"underline",fontWeight:700,cursor:"pointer",fontFamily:"inherit",fontSize:".72rem",padding:0}}>Override (Manager)</button>}
    </div>}
    {isMgr&&waiveFor===p.no&&<div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:6}}>
      <input value={waiveWhy} onChange={e=>setWaiveWhy(e.target.value)} placeholder="Why order without a PRF? e.g. site emergency, night install" aria-label={`Reason to order PO ${p.no} without a PRF`}
        style={{flex:"1 1 200px",minWidth:0,border:"1.5px solid #fecaca",borderRadius:7,padding:"7px 9px",fontFamily:"inherit",fontSize:".8rem"}}/>
      <button type="button" disabled={busy||waiveWhy.trim().length<10} onClick={waive} style={{background:waiveWhy.trim().length<10?"#fca5a5":"#b91c1c",color:"#fff",border:"none",borderRadius:7,padding:"7px 12px",fontFamily:"inherit",fontSize:".76rem",fontWeight:700,cursor:waiveWhy.trim().length<10?"not-allowed":"pointer"}}>{busy?"Saving…":"Override PRF rule"}</button>
      <button type="button" onClick={()=>setWaiveFor(null)} style={{background:"none",border:"none",color:"#475569",fontFamily:"inherit",fontSize:".76rem",cursor:"pointer"}}>Cancel</button>
    </div>}
  </>);
  const th={padding:"7px 10px",fontSize:".66rem",fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:".5px",textAlign:"left"};
  const td={padding:"8px 10px",fontSize:".78rem",verticalAlign:"top"};

  return(
    <div ref={boxRef} style={{background:"#fffbeb",border:"1.5px solid #fcd34d",borderRadius:12,marginBottom:18,scrollMarginTop:70}}>
      <button onClick={()=>setOpen(o=>!o)} style={{display:"flex",width:"100%",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap",padding:"12px 16px",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}>
        <div>
          <div style={{fontWeight:800,color:"#92400e",fontSize:".9rem"}}>⏳ {pos.length} PO{pos.length>1?"s":""} waiting for your approval</div>
          <div style={{fontSize:".74rem",color:"#a16207",marginTop:2}}>Oldest from {pos[0].date||"—"} · about {pesoAmt(pos.reduce((s,p)=>s+p.gross,0))}</div>
        </div>
        <span style={{color:"#92400e",fontSize:".8rem",fontWeight:700}}>{open?"▲ Hide":"▼ Review"}</span>
      </button>
      {open&&<div style={{padding:"0 16px 14px"}}>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",marginBottom:10}}>
          <input value={q} onChange={e=>{setQ(e.target.value);setLimit(PAGE);}} placeholder="Search PO, supplier, project…" style={{flex:"1 1 200px",minWidth:0,border:"1.5px solid #e2e8f0",borderRadius:8,padding:"7px 11px",fontFamily:"inherit",fontSize:".82rem"}}/>
          <select value={who} onChange={e=>{setWho(e.target.value);setLimit(PAGE);}} style={{border:"1.5px solid #e2e8f0",borderRadius:8,padding:"7px 10px",fontFamily:"inherit",fontSize:".8rem"}}>
            {requesters.map(r=><option key={r} value={r}>{r==="All"?"All requesters":r}</option>)}
          </select>
        </div>
        {picked.length>0&&<div style={{position:"sticky",top:0,zIndex:2,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",background:"#ecfdf5",border:"1px solid #a7f3d0",borderRadius:9,padding:"8px 12px",marginBottom:10}}>
          <span style={{flex:"1 1 auto",fontSize:".8rem",color:"#065f46",fontWeight:700}}>{picked.length} selected · about {pesoAmt(pickedTotal)}</span>
          <button onClick={()=>approve()} disabled={busy} style={{background:"#059669",color:"#fff",border:"none",borderRadius:7,padding:"6px 14px",fontSize:".78rem",fontWeight:700,cursor:"pointer",fontFamily:"inherit",opacity:busy?.6:1}}>{busy?"Approving…":"Approve selected"}</button>
          <button onClick={()=>setSel(new Set())} style={{background:"none",border:"none",color:"#475569",fontSize:".76rem",cursor:"pointer",fontFamily:"inherit"}}>Clear</button>
        </div>}
        {narrow?(
        <div>
          {shown.length>1&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap",margin:"0 0 8px 2px"}}>
            <label style={{display:"flex",alignItems:"center",gap:8,fontSize:".8rem",color:"#92400e",fontWeight:700,cursor:shown.some(canPick)?"pointer":"default",opacity:shown.some(canPick)?1:.5}}>
              <input type="checkbox" checked={allShown} disabled={!shown.some(canPick)} onChange={toggleShown} style={{width:20,height:20}}/> Select all reviewed
            </label>
          </div>}
          {shown.map(p=>{
            const h=held(p);
            return(
            <div key={p.no} style={{background:sel.has(p.no)?"#f0fdf4":"#fff",border:`1.5px solid ${sel.has(p.no)?"#86efac":h?"#fecaca":"#fde68a"}`,borderRadius:10,padding:"10px 12px",marginBottom:8}}>
              <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                <input type="checkbox" aria-label={`Select PO ${p.no}`} checked={sel.has(p.no)} disabled={!canPick(p)} title={h?undefined:!viewed.has(p.no)?"View the lines first":undefined} onChange={()=>toggle(p.no)} style={{width:22,height:22,marginTop:2,flexShrink:0}}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"baseline"}}>
                    <span style={{fontWeight:800,color:"#0f172a",fontSize:".9rem"}}>{p.no}</span>
                    <span style={{fontWeight:800,color:"#0f172a",fontSize:".92rem",whiteSpace:"nowrap",fontVariantNumeric:"tabular-nums"}}>{pesoAmt(p.gross)}</span>
                  </div>
                  <div style={{fontWeight:700,color:"#0f172a",fontSize:".84rem",marginTop:2}}>{p.supplier||"—"}</div>
                  <div style={{fontSize:".74rem",color:"#64748b"}}>{p.project}</div>
                  <div style={{fontSize:".7rem",color:"#94a3b8",marginTop:2}}>{p.requestedBy||"—"} · {p.date||"—"} · {p.lines} line{p.lines>1?"s":""}</div>
                  {holdBlock(p)}
                  {linesOpen.has(p.no)&&linesBlock(p)}
                </div>
              </div>
              {(h||viewed.has(p.no))?linesBtn(p,false):linesBtn(p,true)}
              {!h&&viewed.has(p.no)&&<button type="button" disabled={busy} onClick={()=>approve([p])} style={{display:"block",width:"100%",marginTop:9,background:"#059669",color:"#fff",border:"none",borderRadius:8,padding:"9px",fontFamily:"inherit",fontWeight:800,fontSize:".82rem",cursor:"pointer",opacity:busy?.6:1}}>{busy?"Approving…":`Approve ${p.no}`}</button>}
            </div>);
          })}
          {rows.length===0&&<div style={{textAlign:"center",padding:20,color:"#94a3b8",fontSize:".8rem"}}>No pending POs match.</div>}
        </div>
        ):(
        <div style={{overflowX:"auto",background:"#fff",borderRadius:9,border:"1px solid #fde68a"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead><tr style={{background:"#f8fafc"}}>
              <th style={{...th,width:22}}><input type="checkbox" aria-label="Select all reviewed POs" title="Selects the POs whose lines you opened" checked={allShown} disabled={!shown.some(canPick)} onChange={toggleShown}/></th>
              <th style={th}>PO</th><th style={th}>Supplier / project</th><th style={th}>Requested by</th><th style={{...th,textAlign:"right"}}>Approx. total</th>
            </tr></thead>
            <tbody>
              {shown.map(p=>([
                <tr key={p.no} style={{borderTop:"1px solid #f1f5f9",background:sel.has(p.no)?"#f0fdf4":undefined}}>
                  <td style={td}><input type="checkbox" aria-label={`Select PO ${p.no}`} checked={sel.has(p.no)} disabled={!canPick(p)} title={p.dpHold?"No down payment yet: a Manager must waive it on the deal first":prfHeld[p.no]?"No approved PRF: create the PO from the Order Board, or a Manager overrides the rule":!viewed.has(p.no)?"View the lines first":undefined} onChange={()=>toggle(p.no)}/></td>
                  <td style={td}><div style={{fontWeight:700,color:"#0f172a"}}>{p.no}</div><div style={{fontSize:".68rem",color:"#94a3b8"}}>{p.date||"—"}</div>{linesBtn(p,false)}</td>
                  <td style={td}><div style={{fontWeight:600,color:"#0f172a"}}>{p.supplier||"—"}</div><div style={{fontSize:".7rem",color:"#64748b"}}>{p.project}</div>{holdBlock(p)}</td>
                  <td style={{...td,color:"#475569"}}>{p.requestedBy||"—"}</td>
                  <td style={{...td,textAlign:"right",fontWeight:800,whiteSpace:"nowrap"}}>{pesoAmt(p.gross)}</td>
                </tr>,
                linesOpen.has(p.no)&&<tr key={p.no+"#lines"}><td/><td colSpan={4} style={{padding:"0 10px 10px"}}>{linesBlock(p)}</td></tr>
              ]))}
              {rows.length===0&&<tr><td colSpan={5} style={{textAlign:"center",padding:20,color:"#94a3b8",fontSize:".8rem"}}>No pending POs match.</td></tr>}
            </tbody>
          </table>
        </div>)}
        {rows.length>limit&&<button onClick={()=>setLimit(l=>l+PAGE)} style={{marginTop:8,background:"#fff",border:"1px solid #fde68a",borderRadius:7,padding:"6px 14px",fontSize:".76rem",fontWeight:600,color:"#92400e",cursor:"pointer",fontFamily:"inherit"}}>Show {Math.min(PAGE,rows.length-limit)} more of {rows.length-limit}</button>}
        <div style={{fontSize:".7rem",color:"#a16207",marginTop:8}}>Open a PO's lines before approving it: its checkbox and Approve button unlock once you have. Totals are approximate (before PO discounts). POs you requested yourself aren't listed (another approver must issue them), except POs of ₱10,000 or less with that supplier's POs that day, which Procurement issues itself.</div>
      </div>}
    </div>
  );
}
