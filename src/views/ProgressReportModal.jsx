import React,{useState,useEffect} from "react";
import {supabase,isSupabaseReady} from "../supabaseClient";
import {toastEmit,useIsMobile} from "../shared";
import {projDisplayName,isConstructionDeal,PUNCHLIST_MIN_PCT} from "../core";

// ─── PROGRESS UPDATE (one form for every % change) ──────────────────────────
// Agreed with Paulo 2026-11-11. A % change is saved only with a full update:
// work done since the last update, the next step with a target date, and
// issues (or "No issues"); lowering also needs why, and only a Manager may
// lower. Saved through set_project_progress(deal, pct, report) — migration
// 20261111190000_progress_report_and_ops_telegram.sql — which checks the same
// rules, refuses a copy of the last update, keeps the report in audit_log,
// posts it to Team Updates and sends it to the Operations Telegram chat.
// Keep these checks in sync with that function.

const STEPS=[30,60,90,100];
const STEP_CLR={30:"#f59e0b",60:"#3b82f6",90:"#8b5cf6",100:"#059669"};
const manilaToday=()=>new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Manila"});
const words=s=>String(s||"").trim().split(/\s+/).filter(Boolean).length;

export const progressFeedText=(old,pct,r)=>
  `[Progress] ${old!=null?old+"%":"not set"} → ${pct}%\nDone: ${r.done}\nNext: ${r.next} (by ${r.next_date})\nIssues: ${r.issues}${r.reason?`\nWhy lower: ${r.reason}`:""}`;

export default function ProgressReportModal({deal,pc,initialPct,role,onClose,onSaved}){
  const mob=useIsMobile();
  const constr=isConstructionDeal(deal);
  const old=pc?.manualProgress??null;
  const min=deal?.stage==="11 · Punchlist"?PUNCHLIST_MIN_PCT:0;
  const isMgr=role==="Manager";
  const[pct,setPct]=useState(initialPct!=null?String(initialPct):"");
  const[done,setDone]=useState("");
  const[next,setNext]=useState("");
  const[nextDate,setNextDate]=useState("");
  const[issues,setIssues]=useState("");
  const[noIssues,setNoIssues]=useState(false);
  const[reason,setReason]=useState("");
  const[busy,setBusy]=useState(false);
  const[tried,setTried]=useState(false);
  useEffect(()=>{setPct(initialPct!=null?String(initialPct):"");},[initialPct]);

  const n=pct===""?null:Math.round(Number(pct));
  const lowering=n!=null&&old!=null&&n<old;
  const today=manilaToday();
  const errs={};
  if(n==null||isNaN(n)) errs.pct="Pick the new %.";
  else if(!constr&&!STEPS.includes(n)) errs.pct="Fabrication progress is 30, 60, 90 or 100%.";
  else if(n<min||n>100) errs.pct=`Enter ${min} to 100${min?" (Punchlist is at least 90%)":""}.`;
  else if(lowering&&!isMgr) errs.pct=`Only a Manager can lower progress (now ${old}%).`;
  if(done.trim().length<20||words(done)<4) errs.done="Describe the work completed since the last update (a full sentence).";
  if(next.trim().length<10) errs.next="Say what the next step is.";
  if(!nextDate||nextDate<today) errs.nextDate="Give a target date, today or later.";
  if(!noIssues&&!issues.trim()) errs.issues="List issues or blockers, or tick No issues.";
  if(lowering&&reason.trim().length<10) errs.reason="Say why the progress is going down.";
  const ok=Object.keys(errs).length===0;

  const save=async()=>{
    setTried(true);
    if(!ok||busy) return;
    if(!isSupabaseReady()){toastEmit("Offline: progress not saved","error");return;}
    const report={done:done.trim(),next:next.trim(),next_date:nextDate,issues:noIssues?"None":issues.trim(),...(lowering?{reason:reason.trim()}:{})};
    setBusy(true);
    const{data,error}=await supabase.rpc("set_project_progress",{p_deal:deal.id,p_pct:n,p_report:report});
    setBusy(false);
    if(error){toastEmit("Progress not saved: "+(error.message||error),"error",9000);return;}
    toastEmit(`${projDisplayName(deal)}: ${n}% — sent to Operations`,"success");
    onSaved&&onSaved({pct:n,at:data||new Date().toISOString(),report,feed:progressFeedText(old,n,report)});
  };

  const lbl={fontSize:".74rem",fontWeight:700,color:"#475569",display:"block",marginBottom:3};
  const inp={width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"8px 10px",fontFamily:"inherit",fontSize:".84rem",boxSizing:"border-box",background:"#fff"};
  const err=k=>tried&&errs[k]?<div style={{fontSize:".68rem",color:"#dc2626",marginTop:3}}>{errs[k]}</div>:null;
  const bd=k=>tried&&errs[k]?"#fca5a5":"#e2e8f0";

  return(
    <div role="dialog" aria-modal="true" aria-label="Progress update" onClick={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}
      style={{position:"fixed",inset:0,background:"rgba(15,23,42,.55)",zIndex:1000,display:"flex",alignItems:mob?"flex-end":"center",justifyContent:"center",padding:mob?0:16}}>
      <div style={{background:"#fff",borderRadius:mob?"14px 14px 0 0":14,width:"100%",maxWidth:560,maxHeight:mob?"92vh":"90vh",overflowY:"auto",padding:mob?"16px":"18px 22px",boxShadow:"0 20px 50px rgba(0,0,0,.25)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,marginBottom:12}}>
          <div>
            <div style={{fontWeight:800,color:"#0f172a",fontSize:"1rem"}}>📊 Progress update</div>
            <div style={{fontSize:".74rem",color:"#64748b",marginTop:2}}>{projDisplayName(deal)} · now {old!=null?`${old}%`:"not set"}</div>
          </div>
          <button onClick={onClose} disabled={busy} aria-label="Close" style={{background:"#f1f5f9",border:"none",borderRadius:8,padding:"4px 10px",cursor:"pointer",fontSize:".9rem",color:"#64748b"}}>✕</button>
        </div>

        <div style={{marginBottom:12}}>
          <label style={lbl}>New progress</label>
          {constr?(
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <input type="number" inputMode="numeric" min={min} max={100} step={1} value={pct} onChange={e=>setPct(e.target.value)} aria-label="New progress percent"
                style={{...inp,width:100,fontWeight:800,fontSize:"1rem",borderColor:bd("pct")}}/>
              <span style={{color:"#64748b"}}>%</span>
            </div>
          ):(
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
              {STEPS.map(s=>{const on=n===s;const dis=s<min||(old!=null&&s<old&&!isMgr);return(
                <button key={s} type="button" disabled={dis} aria-pressed={on} onClick={()=>setPct(String(s))}
                  style={{border:`1.5px solid ${on?STEP_CLR[s]:"#e2e8f0"}`,borderRadius:8,padding:"8px 0",background:on?STEP_CLR[s]:"#fff",color:on?"#fff":"#475569",fontWeight:800,fontSize:".86rem",cursor:dis?"default":"pointer",opacity:dis?.35:1,fontFamily:"inherit"}}>{s}%</button>);})}
            </div>
          )}
          {err("pct")}
        </div>

        <div style={{marginBottom:12}}>
          <label style={lbl}>1. Work completed since the last update <span style={{color:"#ef4444"}}>*</span></label>
          <textarea value={done} onChange={e=>setDone(e.target.value)} rows={3} placeholder="e.g. Ceiling framing in the sales area done, gypsum boards up, electrical rough-in 70%"
            style={{...inp,resize:"vertical",borderColor:bd("done")}}/>
          {err("done")}
        </div>

        <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 150px",gap:8,marginBottom:12}}>
          <div>
            <label style={lbl}>2. Next step <span style={{color:"#ef4444"}}>*</span></label>
            <input value={next} onChange={e=>setNext(e.target.value)} placeholder="e.g. Paint ceiling and walls" style={{...inp,borderColor:bd("next")}}/>
            {err("next")}
          </div>
          <div>
            <label style={lbl}>Target date <span style={{color:"#ef4444"}}>*</span></label>
            <input type="date" min={today} value={nextDate} onChange={e=>setNextDate(e.target.value)} style={{...inp,borderColor:bd("nextDate")}}/>
            {err("nextDate")}
          </div>
        </div>

        <div style={{marginBottom:12}}>
          <label style={lbl}>3. Issues / blockers <span style={{color:"#ef4444"}}>*</span></label>
          {!noIssues&&<textarea value={issues} onChange={e=>setIssues(e.target.value)} rows={2} placeholder="e.g. Waiting for client approval on tile color; delivery of lights moved to Friday"
            style={{...inp,resize:"vertical",borderColor:bd("issues")}}/>}
          <label style={{display:"flex",alignItems:"center",gap:6,marginTop:5,fontSize:".76rem",color:"#475569",cursor:"pointer"}}>
            <input type="checkbox" checked={noIssues} onChange={e=>setNoIssues(e.target.checked)}/> No issues
          </label>
          {err("issues")}
        </div>

        {lowering&&(
          <div style={{marginBottom:12}}>
            <label style={lbl}>Why is the progress going down? <span style={{color:"#ef4444"}}>*</span></label>
            <textarea value={reason} onChange={e=>setReason(e.target.value)} rows={2} placeholder="e.g. Client changed the ceiling design; half of the framing removed"
              style={{...inp,resize:"vertical",borderColor:bd("reason")}}/>
            {err("reason")}
          </div>
        )}

        <div style={{fontSize:".68rem",color:"#94a3b8",marginBottom:10}}>Saved to Team Updates and the audit log, and sent to the Operations Telegram chat.</div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <button onClick={onClose} disabled={busy} style={{background:"#f1f5f9",border:"none",borderRadius:8,padding:"9px 16px",fontFamily:"inherit",fontSize:".84rem",color:"#64748b",cursor:"pointer",fontWeight:600}}>Cancel</button>
          <button onClick={save} disabled={busy}
            style={{background:"#0f172a",border:"none",borderRadius:8,padding:"9px 18px",fontFamily:"inherit",fontSize:".84rem",color:"#fff",cursor:busy?"default":"pointer",fontWeight:700,opacity:busy?.6:1}}>{busy?"Saving…":"Save update"}</button>
        </div>
      </div>
    </div>
  );
}
