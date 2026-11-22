import React,{useState,useEffect,useMemo,useCallback} from "react";
import {uiAlert,toastEmit} from "../shared";
import {supabase,isSupabaseReady,sbUploadFile,sbGetPublicUrl} from "../supabaseClient";

// ─── DELIVERIES TO CONFIRM (site receiving, 2026-11-22) ─────────────────────
// Most retail fit-out materials go straight to the store / site, where the
// Warehouse never sees them; no PO receipt was recorded after the week of 26 Oct
// 2026 (581 issued lines older than 14 days showed nothing received). The PM /
// Operations, the project's coordinator, Warehouse or a Manager confirms what
// arrived here, with a photo of the signed delivery receipt (DR).
// Server side: site_deliveries() lists open PO lines without prices (these roles
// have no read on purchase_requests); confirm_po_receipt() checks the role, the
// coordinator's own projects, the photo (all but Warehouse), no more than was
// ordered and never a PO you requested (migration 20261123010000). Photos go to
// fabhub-files/po-receipts/ (storage policy fabhub_po_receipts_ins). Keep in sync.

export const SITE_RECEIVING_ROLES=["ProjectMover","Operations","Coordinator","Warehouse","Manager"];
const PAGE=25;
const todayISO=()=>new Date(Date.now()+8*3600e3).toISOString().slice(0,10); // Manila
const fmtQty=v=>{const n=Number(v)||0;return Number.isInteger(n)?String(n):n.toFixed(2);};

export default function SiteReceiving({role,session}){
  const me=session?.name||"";
  const isWh=role==="Warehouse";
  const[rows,setRows]=useState(null);
  const[err,setErr]=useState("");
  const[open,setOpen]=useState(false);
  const[scope,setScope]=useState("mine");
  const[q,setQ]=useState("");
  const[limit,setLimit]=useState(PAGE);
  const[form,setForm]=useState(null); // {line, received, drNo, date, note, photo}
  const[busy,setBusy]=useState(false);

  const load=useCallback(async()=>{
    if(!isSupabaseReady()||!supabase){setRows([]);return;}
    const{data,error}=await supabase.rpc("site_deliveries");
    if(error){setErr(error.message||String(error));setRows([]);return;}
    setErr("");setRows(data||[]);
  },[]);
  useEffect(()=>{load();},[load]);

  const mineCount=useMemo(()=>(rows||[]).filter(r=>r.mine).length,[rows]);
  // Coordinators only ever get their own projects; others default to "mine"
  // when they have any, else everything.
  const effScope=role==="Coordinator"||mineCount===0?"all":scope;
  const pos=useMemo(()=>{
    const t=q.trim().toLowerCase();
    const by=new Map();
    (rows||[]).filter(r=>effScope==="all"||r.mine).filter(r=>!t||[r.po_number,r.supplier,r.item,r.project,r.ce_no].some(x=>String(x||"").toLowerCase().includes(t)))
      .forEach(r=>{
        const k=r.po_number;
        if(!by.has(k)) by.set(k,{no:k,date:r.po_date,supplier:r.supplier,project:r.project,ceNo:r.ce_no,expected:r.expected,lines:[]});
        by.get(k).lines.push(r);
      });
    return [...by.values()];
  },[rows,q,effScope]);

  if(rows===null||(rows.length===0&&!err)) return null;

  const startConfirm=line=>setForm({line,received:fmtQty(Math.max(0,(Number(line.qty)||0)-(Number(line.qty_delivered)||0))),drNo:"",date:todayISO(),note:"",photo:""});
  const upload=async file=>{
    if(!file) return;
    setBusy(true);
    const path=await sbUploadFile(`po-receipts/${(session?.username||me||"user").replace(/[^a-zA-Z0-9_-]/g,"_")}`,file);
    setBusy(false);
    if(!path){await uiAlert("The photo didn't upload. Check your connection and try again.");return;}
    setForm(f=>f&&{...f,photo:path});
  };
  const save=async()=>{
    const f=form; if(!f) return;
    const n=Number(String(f.received).replace(/,/g,""));
    const left=(Number(f.line.qty)||0)-(Number(f.line.qty_delivered)||0);
    if(!(n>0)){await uiAlert("Enter how many arrived in this delivery.");return;}
    if(n>left&&role!=="Manager"){await uiAlert(`Only ${fmtQty(left)} ${f.line.unit||""} is still to come on this line. If more arrived, ask Procurement to amend the PO first.`);return;}
    if(!f.photo&&!isWh){await uiAlert("Take or attach a photo of the signed delivery receipt (DR).");return;}
    if(f.date>todayISO()){await uiAlert("The delivery date can't be in the future.");return;}
    setBusy(true);
    const{data,error}=await supabase.rpc("confirm_po_receipt",{p_id:f.line.id,p_received:n,p_date:f.date||null,p_dr_no:f.drNo.trim()||null,p_note:f.note.trim()||null,p_photo:f.photo||null});
    setBusy(false);
    if(error){await uiAlert(`Not saved: ${error.message||error}`);return;}
    toastEmit(`✅ ${f.line.item||"Item"}: ${data==="Delivered"?"fully delivered":"partly delivered"} (PO ${f.line.po_number})`,"success");
    setForm(null);
    load();
  };

  const shown=pos.slice(0,limit);
  const lineCount=pos.reduce((s,p)=>s+p.lines.length,0);
  const inp={border:"1.5px solid #e2e8f0",borderRadius:8,padding:"7px 10px",fontFamily:"inherit",fontSize:".82rem",minWidth:0};

  return(
    <div style={{background:"#f0f9ff",border:"1.5px solid #7dd3fc",borderRadius:12,marginBottom:18}}>
      <button onClick={()=>setOpen(o=>!o)} style={{display:"flex",width:"100%",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap",padding:"12px 16px",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}>
        <div>
          <div style={{fontWeight:800,color:"#075985",fontSize:".9rem"}}>📦 Deliveries to confirm{effScope==="mine"?` on your projects: ${mineCount} line${mineCount===1?"":"s"}`:`: ${rows.length} line${rows.length===1?"":"s"}`}</div>
          <div style={{fontSize:".74rem",color:"#0369a1",marginTop:2}}>When materials arrive on site, confirm them here with a photo of the signed DR.</div>
        </div>
        <span style={{color:"#075985",fontSize:".8rem",fontWeight:700}}>{open?"▲ Hide":"▼ Open"}</span>
      </button>
      {open&&<div style={{padding:"0 16px 14px"}}>
        {err&&<div style={{color:"#b91c1c",fontSize:".78rem",marginBottom:8}}>Couldn't load deliveries: {err}</div>}
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",marginBottom:10}}>
          <input value={q} onChange={e=>{setQ(e.target.value);setLimit(PAGE);}} placeholder="Search PO, supplier, item, project…" aria-label="Search deliveries" style={{...inp,flex:"1 1 200px"}}/>
          {role!=="Coordinator"&&mineCount>0&&<select value={scope} onChange={e=>{setScope(e.target.value);setLimit(PAGE);}} aria-label="Which projects" style={inp}>
            <option value="mine">My projects</option><option value="all">All projects</option>
          </select>}
        </div>
        {shown.map(p=>(
          <div key={p.no} style={{background:"#fff",border:"1px solid #bae6fd",borderRadius:9,marginBottom:8,overflow:"hidden"}}>
            <div style={{padding:"8px 12px",background:"#f8fafc",display:"flex",justifyContent:"space-between",gap:8,flexWrap:"wrap"}}>
              <div><span style={{fontWeight:800,color:"#0f172a",fontSize:".82rem"}}>{p.no}</span> <span style={{color:"#475569",fontSize:".78rem"}}>· {p.supplier||"—"}</span></div>
              <div style={{fontSize:".72rem",color:"#64748b"}}>{[p.project,p.ceNo].filter(Boolean).join(" · ")} · ordered {p.date||"—"}{p.expected?` · expected ${p.expected}`:""}</div>
            </div>
            {p.lines.map(l=>{
              const left=(Number(l.qty)||0)-(Number(l.qty_delivered)||0);
              return(
                <div key={l.id} style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",padding:"8px 12px",borderTop:"1px solid #f1f5f9"}}>
                  <div style={{flex:"1 1 220px",minWidth:0}}>
                    <div style={{fontWeight:600,color:"#0f172a",fontSize:".8rem"}}>{l.item||"—"}</div>
                    <div style={{fontSize:".72rem",color:"#64748b"}}>Ordered {fmtQty(l.qty)} {l.unit||""}{Number(l.qty_delivered)>0?` · received ${fmtQty(l.qty_delivered)} · ${fmtQty(left)} to come`:""}</div>
                  </div>
                  <button onClick={()=>startConfirm(l)} style={{background:"#0284c7",color:"#fff",border:"none",borderRadius:7,padding:"6px 12px",fontSize:".76rem",fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>✓ Confirm delivery</button>
                </div>
              );
            })}
          </div>
        ))}
        {pos.length===0&&<div style={{textAlign:"center",padding:16,color:"#94a3b8",fontSize:".8rem"}}>Nothing waiting{q?" matches":""}.</div>}
        {pos.length>limit&&<button onClick={()=>setLimit(l=>l+PAGE)} style={{background:"#fff",border:"1px solid #bae6fd",borderRadius:7,padding:"6px 14px",fontSize:".76rem",fontWeight:600,color:"#075985",cursor:"pointer",fontFamily:"inherit"}}>Show more ({pos.length-limit} more POs)</button>}
        <div style={{fontSize:".7rem",color:"#0369a1",marginTop:8}}>{lineCount} line{lineCount===1?"":"s"} shown. Confirm only what you saw arrive. You can't confirm a PO you ordered yourself.</div>
      </div>}

      {form&&<div role="dialog" aria-modal="true" aria-label="Confirm delivery" style={{position:"fixed",inset:0,background:"rgba(15,23,42,.55)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
        <div style={{background:"#fff",borderRadius:14,width:"100%",maxWidth:440,maxHeight:"90vh",overflowY:"auto",padding:18}}>
          <div style={{fontWeight:800,fontSize:"1rem",color:"#0f172a"}}>Confirm delivery</div>
          <div style={{fontSize:".78rem",color:"#475569",margin:"4px 0 12px"}}>{form.line.item} · PO {form.line.po_number} · {form.line.supplier||"—"}<br/>Ordered {fmtQty(form.line.qty)} {form.line.unit||""}, received so far {fmtQty(form.line.qty_delivered)}</div>
          <label style={{display:"block",fontSize:".74rem",fontWeight:700,color:"#334155",marginBottom:4}}>How many arrived in this delivery? ({form.line.unit||"qty"})</label>
          <input inputMode="decimal" value={form.received} onChange={e=>setForm(f=>({...f,received:e.target.value}))} style={{...inp,width:"100%",marginBottom:10}}/>
          <div style={{display:"flex",gap:8,marginBottom:10}}>
            <div style={{flex:1,minWidth:0}}>
              <label style={{display:"block",fontSize:".74rem",fontWeight:700,color:"#334155",marginBottom:4}}>DR no.</label>
              <input value={form.drNo} onChange={e=>setForm(f=>({...f,drNo:e.target.value}))} placeholder="Supplier's DR no." style={{...inp,width:"100%"}}/>
            </div>
            <div style={{flex:1,minWidth:0}}>
              <label style={{display:"block",fontSize:".74rem",fontWeight:700,color:"#334155",marginBottom:4}}>Date received</label>
              <input type="date" value={form.date} max={todayISO()} onChange={e=>setForm(f=>({...f,date:e.target.value}))} style={{...inp,width:"100%"}}/>
            </div>
          </div>
          <label style={{display:"block",fontSize:".74rem",fontWeight:700,color:"#334155",marginBottom:4}}>Photo of the signed DR{isWh?" (optional for Warehouse)":""}</label>
          {form.photo
            ?<div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                <a href={sbGetPublicUrl(form.photo)||"#"} target="_blank" rel="noreferrer" style={{fontSize:".78rem",color:"#0284c7",fontWeight:700}}>📷 Photo attached</a>
                <button type="button" onClick={()=>setForm(f=>({...f,photo:""}))} style={{background:"none",border:"none",color:"#64748b",fontSize:".74rem",cursor:"pointer",fontFamily:"inherit"}}>Replace</button>
              </div>
            :<input type="file" accept="image/*" capture="environment" disabled={busy} onChange={e=>upload(e.target.files&&e.target.files[0])} style={{fontSize:".78rem",marginBottom:10,maxWidth:"100%"}}/>}
          <label style={{display:"block",fontSize:".74rem",fontWeight:700,color:"#334155",marginBottom:4}}>Note (optional)</label>
          <input value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} placeholder="e.g. 2 pcs damaged, returned to supplier" style={{...inp,width:"100%",marginBottom:14}}/>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
            <button type="button" onClick={()=>setForm(null)} disabled={busy} style={{background:"#f1f5f9",border:"none",borderRadius:8,padding:"8px 14px",fontFamily:"inherit",fontSize:".8rem",cursor:"pointer"}}>Cancel</button>
            <button type="button" onClick={save} disabled={busy} style={{background:"#0284c7",color:"#fff",border:"none",borderRadius:8,padding:"8px 16px",fontFamily:"inherit",fontSize:".8rem",fontWeight:700,cursor:"pointer",opacity:busy?.6:1}}>{busy?"Saving…":"Confirm"}</button>
          </div>
        </div>
      </div>}
    </div>
  );
}
