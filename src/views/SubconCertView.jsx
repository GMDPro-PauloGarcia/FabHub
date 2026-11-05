import React,{useState,useEffect,useCallback} from "react";
import {supabase,isSupabaseReady} from "../supabaseClient";
import {toastEmit,uiPrompt} from "../shared";
import {projDisplayName} from "../core";

// ─── SUBCON BILLING — PM / Operations certification ─────────────────────────
// "No approval, no billing; no billing, no payment" (Paulo, 2026-10-27).
// Each subcontractor progress billing is its own bill against the Work Order
// (since 2026-11-05), so the PM certifies the CUMULATIVE % of the WO's work
// actually done, once per WO: it is stamped on every bill of that WO. The
// database refuses any subcon payment that takes the WO's payments beyond
// certified % x WO contract, and approval before any certification
// (migrations 20261027160000_subcon_billing_pm_certification.sql and
// 20261105160000_subcon_billing_per_progress_claim.sql). Only a PM
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
  // One card per Work Order (a bill with no WO is its own card).
  const groups=(()=>{
    const m=new Map();
    rows.filter(r=>!["Cancelled","Void"].includes(String(r.status||""))).forEach(r=>{const k=r.wo_number?"wo:"+r.wo_number:"id:"+r.id;if(!m.has(k))m.set(k,[]);m.get(k).push(r);});
    return [...m.values()].map(bills=>{
      const certs=bills.filter(b=>b.verified&&b.verified_by&&scNum(b.verification_pct)>0);
      const top=certs.sort((a,b)=>scNum(b.verification_pct)-scNum(a.verification_pct))[0];
      const noted=bills.find(b=>b.last_note);
      const openBills=bills.filter(b=>String(b.status||"")!=="Paid");
      return {key:bills[0].wo_number||bills[0].id,bills,id:(openBills[0]||bills[0]).id,
        wo_number:bills[0].wo_number,ap_number:bills.length===1?bills[0].ap_number:"",vendor:bills[0].vendor,project_id:bills[0].project_id,scope:bills[0].scope,
        contract:scNum(bills[0].contract),billed:bills.reduce((t,b)=>t+scNum(b.amount),0),claimed:bills.reduce((t,b)=>t+scNum(b.claimed),0),
        verification_pct:top?scNum(top.verification_pct):0,verified:!!top,verified_by:top?.verified_by||"",
        open:openBills.length>0,last_note:noted?.last_note||"",last_action:noted?.last_action||""};
    });
  })();
  const open=g=>g.open;
  const shown=groups.filter(g=>showAll||open(g));
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
            <div key={r.key} style={{background:"#fff",border:`1.5px solid ${certified?"#a7f3d0":"#fed7aa"}`,borderRadius:12,padding:"12px 14px"}}>
              <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
                <div style={{minWidth:0}}>
                  <div style={{fontWeight:700,color:"#0f172a",fontSize:".88rem"}}>{r.vendor||"?"} · <span style={{fontFamily:"'IBM Plex Mono',monospace"}}>{r.wo_number||r.ap_number}</span></div>
                  <div style={{fontSize:".74rem",color:"#64748b"}}>{dealName(r.project_id)}{r.scope?` — ${r.scope}`:""}</div>
                </div>
                <span style={{alignSelf:"flex-start",fontSize:".66rem",fontWeight:700,borderRadius:20,padding:"3px 10px",
                  color:certified?"#065f46":"#9a3412",background:certified?"#ecfdf5":"#fff7ed"}}>{certified?`${pct}% certified by ${r.verified_by}`:"Not certified — only the WO's down payment can be paid"}</span>
              </div>
              <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)",gap:8,margin:"10px 0",fontSize:".76rem"}}>
                {[["WO contract",scPeso(r.contract)],["Billed by subcon",`${scPeso(r.billed)} · ${r.bills.length} billing${r.bills.length===1?"":"s"}`],["Paid so far (incl. retention)",scPeso(claimed)],["Payable up to (certified)",scPeso(cap)]].map(([k,v])=>(
                  <div key={k} style={{background:"#f8fafc",borderRadius:8,padding:"6px 9px"}}>
                    <div style={{fontSize:".58rem",textTransform:"uppercase",letterSpacing:".6px",color:"#94a3b8"}}>{k}</div>
                    <div style={{fontWeight:700,color:"#0f172a"}}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:3,marginBottom:8}}>
                {r.bills.map(b=>(
                  <div key={b.id} style={{display:"flex",justifyContent:"space-between",gap:8,fontSize:".72rem",color:"#475569",background:"#f8fafc",borderRadius:6,padding:"4px 8px"}}>
                    <span style={{fontFamily:"'IBM Plex Mono',monospace"}}>{b.ap_number||"(new bill)"}</span>
                    <span>{scPeso(b.amount)} · {b.status||"—"}{b.approval_status?` · ${b.approval_status}`:""}</span>
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
