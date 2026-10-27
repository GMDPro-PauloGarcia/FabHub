import React,{useState,useEffect,useCallback} from "react";
import {supabase,isSupabaseReady} from "../supabaseClient";
import {toastEmit,uiPrompt} from "../shared";
import {projDisplayName} from "../core";

// ─── SUBCON BILLING — PM / Operations certification ─────────────────────────
// "No approval, no billing; no billing, no payment" (Paulo, 2026-10-27).
// A Work Order raises one subcontractor payable for the whole contract and each
// progress billing is a partial payment against it, so the PM certifies the
// CUMULATIVE % of work actually done. The database refuses any subcon payment
// beyond certified % x WO contract, and approval before any certification
// (migration 20261027160000_subcon_billing_pm_certification.sql). Only a PM
// named on the project card, Operations or a Manager can certify — the list
// comes from list_subcon_billings(), which already filters to those projects.

const scNum=v=>Number(v)||0;
const scPeso=v=>"₱"+scNum(v).toLocaleString("en-PH",{minimumFractionDigits:0,maximumFractionDigits:0});
const scErr=e=>(e?.message||String(e||"")).replace(/^.*?:\s*(?=[A-Z])/,"");

export default function SubconCertView({session,deals=[],sendTelegramNotification,isMobile}){
  const[rows,setRows]=useState([]);
  const[loading,setLoading]=useState(true);
  const[showAll,setShowAll]=useState(false);
  const[form,setForm]=useState({}); // payable id → {pct, note}
  const[busy,setBusy]=useState(false);

  const load=useCallback(async()=>{
    if(!isSupabaseReady()){setLoading(false);return;}
    const{data,error}=await supabase.rpc("list_subcon_billings");
    if(error) toastEmit("⚠ "+scErr(error),"error");
    setRows(data||[]);
    setLoading(false);
  },[]);
  useEffect(()=>{load();},[load]);

  const dealName=id=>projDisplayName(deals.find(d=>d.id===id))||"—";
  const open=r=>String(r.status||"")!=="Paid";
  const shown=rows.filter(r=>showAll||open(r));
  const notify=(r,head,body)=>{
    if(!sendTelegramNotification) return;
    const msg=`${head}\n<b>${r.wo_number||r.ap_number||"Subcon billing"}</b> · ${r.vendor||"?"}\nProject: ${dealName(r.project_id)}\n${body}\nBy: ${session?.name||"?"}`;
    ["financialcontrol","procurement"].forEach(ch=>sendTelegramNotification(ch,msg));
  };

  const certify=async r=>{
    const f=form[r.id]||{};
    const pct=Number(f.pct);
    if(!(pct>0&&pct<=100)){toastEmit("Enter the % of work done (1–100).","warning");return;}
    if(String(f.note||"").trim().length<5){toastEmit("Say what you inspected (e.g. site walk, accomplishment report).","warning");return;}
    setBusy(true);
    const{error}=await supabase.rpc("certify_subcon_billing",{p_payable:r.id,p_pct:pct,p_note:f.note.trim()});
    setBusy(false);
    if(error){toastEmit("⚠ "+scErr(error),"error",9000);return;}
    notify(r,"✅ <b>Subcon work certified</b>",`Certified: ${pct}% of ${scPeso(r.contract)} = ${scPeso(pct/100*scNum(r.contract))} payable to date\nNote: ${f.note.trim()}`);
    toastEmit(`Certified ${pct}% — Finance can now pay up to ${scPeso(pct/100*scNum(r.contract))}.`,"success");
    setForm(x=>({...x,[r.id]:{}}));
    load();
  };
  const dispute=async r=>{
    const reason=await uiPrompt({title:"Dispute this billing",message:"What's wrong with the work billed? Finance and Procurement see this.",confirmLabel:"Dispute"});
    if(reason==null) return;
    setBusy(true);
    const{error}=await supabase.rpc("dispute_subcon_billing",{p_payable:r.id,p_reason:reason});
    setBusy(false);
    if(error){toastEmit("⚠ "+scErr(error),"error",9000);return;}
    notify(r,"⛔ <b>Subcon billing disputed</b>",`Reason: ${reason}`);
    toastEmit("Dispute logged — Finance won't pay beyond what you certified.","success");
    load();
  };

  const inp={border:"1.5px solid #e2e8f0",borderRadius:7,padding:"6px 8px",fontFamily:"inherit",fontSize:".8rem",boxSizing:"border-box"};
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12,marginBottom:14}}>
        <div>
          <h2 style={{margin:0,fontWeight:800,color:"#0f172a",fontSize:"1.15rem"}}>🔨 Subcon Billing — certify work done</h2>
          <div style={{fontSize:".75rem",color:"#64748b",marginTop:2,maxWidth:640}}>Finance can only pay a subcontractor up to the % of the Work Order you certify here. No certification, no payment.</div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>setShowAll(v=>!v)} style={{border:"1.5px solid #e2e8f0",background:"#fff",borderRadius:8,padding:"7px 12px",fontFamily:"inherit",fontSize:".78rem",fontWeight:600,cursor:"pointer"}}>{showAll?"Open only":"Show paid too"}</button>
          <button onClick={load} style={{border:"none",background:"#f1f5f9",borderRadius:8,padding:"7px 12px",fontFamily:"inherit",fontSize:".78rem",fontWeight:600,cursor:"pointer"}}>↻ Refresh</button>
        </div>
      </div>
      {loading?<div style={{color:"#94a3b8",fontSize:".85rem"}}>Loading…</div>
      :shown.length===0?<div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,padding:20,color:"#94a3b8",fontSize:".85rem"}}>No subcontractor billings on your projects{showAll?"":" waiting"}.</div>
      :<div style={{display:"flex",flexDirection:"column",gap:10}}>
        {shown.map(r=>{
          const pct=scNum(r.verification_pct), certified=r.verified&&r.verified_by&&pct>0;
          const cap=pct/100*scNum(r.contract), claimed=scNum(r.claimed);
          const f=form[r.id]||{};
          return(
            <div key={r.id} style={{background:"#fff",border:`1.5px solid ${certified?"#a7f3d0":"#fed7aa"}`,borderRadius:12,padding:"12px 14px"}}>
              <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
                <div style={{minWidth:0}}>
                  <div style={{fontWeight:700,color:"#0f172a",fontSize:".88rem"}}>{r.vendor||"?"} · <span style={{fontFamily:"'IBM Plex Mono',monospace"}}>{r.wo_number||r.ap_number}</span></div>
                  <div style={{fontSize:".74rem",color:"#64748b"}}>{dealName(r.project_id)}{r.scope?` — ${r.scope}`:""}</div>
                </div>
                <span style={{alignSelf:"flex-start",fontSize:".66rem",fontWeight:700,borderRadius:20,padding:"3px 10px",
                  color:certified?"#065f46":"#9a3412",background:certified?"#ecfdf5":"#fff7ed"}}>{certified?`${pct}% certified by ${r.verified_by}`:"Not certified — can't be paid"}</span>
              </div>
              <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)",gap:8,margin:"10px 0",fontSize:".76rem"}}>
                {[["WO contract",scPeso(r.contract)],["Billed / paid so far",scPeso(claimed)],["Payable up to (certified)",scPeso(cap)],["Status",`${r.status||"—"}${r.approval_status?` · ${r.approval_status}`:""}`]].map(([k,v])=>(
                  <div key={k} style={{background:"#f8fafc",borderRadius:8,padding:"6px 9px"}}>
                    <div style={{fontSize:".58rem",textTransform:"uppercase",letterSpacing:".6px",color:"#94a3b8"}}>{k}</div>
                    <div style={{fontWeight:700,color:"#0f172a"}}>{v}</div>
                  </div>
                ))}
              </div>
              {r.last_note&&<div style={{fontSize:".72rem",color:r.last_action==="Disputed"?"#b91c1c":"#475569",marginBottom:8}}>{r.last_action==="Disputed"?"⛔ Disputed":"Last note"}: {r.last_note}</div>}
              {open(r)&&(
                <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                  <input type="number" min={1} max={100} value={f.pct??""} onChange={e=>setForm(x=>({...x,[r.id]:{...f,pct:e.target.value}}))}
                    placeholder={`% done (now ${pct}%)`} aria-label="Percent of work done" style={{...inp,width:130}}/>
                  <input value={f.note??""} onChange={e=>setForm(x=>({...x,[r.id]:{...f,note:e.target.value}}))}
                    placeholder="What did you inspect? (site walk, accomplishment report…)" aria-label="Inspection note" style={{...inp,flex:"1 1 240px"}}/>
                  <button disabled={busy} onClick={()=>certify(r)} style={{background:"#059669",color:"#fff",border:"none",borderRadius:8,padding:"7px 14px",fontFamily:"inherit",fontSize:".78rem",fontWeight:700,cursor:"pointer"}}>✓ Certify</button>
                  <button disabled={busy} onClick={()=>dispute(r)} style={{background:"#fef2f2",color:"#dc2626",border:"1.5px solid #fecaca",borderRadius:8,padding:"6px 12px",fontFamily:"inherit",fontSize:".78rem",fontWeight:700,cursor:"pointer"}}>Dispute</button>
                </div>
              )}
            </div>
          );
        })}
      </div>}
    </div>
  );
}
