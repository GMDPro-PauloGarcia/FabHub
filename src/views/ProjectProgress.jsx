import React,{useState,useMemo} from "react";
import {supabase,isSupabaseReady} from "../supabaseClient";
import {toastEmit,useIsMobile} from "../shared";
import {projDisplayName} from "../core";

// ─── PROGRESS (Operations › Progress) ───────────────────────────────────────
// Agreed with Paulo 2026-11-07: instead of PM Updates, Blockers and Scope
// Changes, the PM gives each active project one estimate: 30, 60, 90 or 100 %.
// Saved through set_project_progress (migration 20261107020000) into
// project_cards.manual_progress, the figure Project Cards already shows, with
// who set it and when; every change is in audit_log. PMs, Operations and
// Managers set it on any project; Coordinators on the projects they coordinate.

const STEPS=[30,60,90,100];
const STEP_CLR={30:"#f59e0b",60:"#3b82f6",90:"#8b5cf6",100:"#059669"};
const C={ink:"#0f172a",muted:"#475569",faint:"#64748b",line:"#e2e8f0",navy:"#0B2545"};
const pgNorm=s=>String(s||"").replace(/\s*\([^)]*\)\s*$/,"").trim().toLowerCase();
const pgAgo=t=>{if(!t) return "";const d=Math.floor((Date.now()-new Date(t).getTime())/86400000);return d<=0?"today":d===1?"yesterday":`${d} days ago`;};

export default function ProjectProgress({deals=[],pcards={},role,session,upPcards}){
  const mob=useIsMobile();
  const me=pgNorm(session?.name);
  const[scope,setScope]=useState(role==="Manager"||role==="Operations"?"all":"mine");
  const[q,setQ]=useState("");
  const[busy,setBusy]=useState(null);

  const isMine=pc=>!!pc&&me&&[pc.pm1,pc.pm2,pc.pm3,pc.coordinator].some(x=>x&&pgNorm(x)===me);
  const canSet=pc=>["Manager","Operations","ProjectMover"].includes(role)||(role==="Coordinator"&&pc&&pgNorm(pc.coordinator)===me);
  const rows=useMemo(()=>{
    const qq=q.trim().toLowerCase();
    return deals.filter(d=>pcards[d.id]&&d.stage!=="14 · Completed")
      .filter(d=>scope==="all"||isMine(pcards[d.id]))
      .filter(d=>!qq||[projDisplayName(d),d.project,d.client,d.ceNo,pcards[d.id]?.pm1,pcards[d.id]?.pm2].some(v=>String(v||"").toLowerCase().includes(qq)))
      .map(d=>({d,pc:pcards[d.id],pct:pcards[d.id]?.manualProgress}))
      .sort((a,b)=>(a.pct??-1)-(b.pct??-1)||projDisplayName(a.d).localeCompare(projDisplayName(b.d)));
  },[deals,pcards,scope,q,me]);

  const set=async(d,pct)=>{
    if(!isSupabaseReady()){toastEmit("Offline: progress not saved","error");return;}
    setBusy(d.id+":"+pct);
    const{data,error}=await supabase.rpc("set_project_progress",{p_deal:d.id,p_pct:pct});
    setBusy(null);
    if(error){toastEmit("Not saved: "+(error.message||error),"error",9000);return;}
    upPcards&&upPcards(ps=>({...ps,[d.id]:{...ps[d.id],manualProgress:pct,progressSetBy:session?.name||"",progressSetAt:data||new Date().toISOString()}}));
    toastEmit(`${projDisplayName(d)}: ${pct}%`,"success");
  };

  const counts=STEPS.map(s=>rows.filter(r=>r.pct===s).length);
  const notSet=rows.filter(r=>!STEPS.includes(r.pct)).length;
  const box={background:"#fff",border:`1px solid ${C.line}`,borderRadius:12};
  return(
    <div>
      <div style={{marginBottom:12}}>
        <div style={{fontWeight:800,color:C.navy,fontSize:"1.15rem"}}>Progress</div>
        <div style={{fontSize:".78rem",color:C.muted,marginTop:2}}>One estimate per active project: 30, 60, 90 or 100 % done. Pick it when it changes; Managers see it on Project Cards and the dashboard.</div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:mob?"repeat(3,1fr)":"repeat(5,1fr)",gap:8,marginBottom:12}}>
        {[["Not set",notSet,C.faint],...STEPS.map((s,i)=>[`${s}%`,counts[i],STEP_CLR[s]])].map(([l,v,c])=>(
          <div key={l} style={{...box,padding:"8px 12px"}}><div style={{fontSize:".62rem",fontWeight:800,color:C.faint,textTransform:"uppercase"}}>{l}</div><div style={{fontSize:"1.15rem",fontWeight:800,color:c}}>{v}</div></div>
        ))}
      </div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",marginBottom:12}}>
        <div role="tablist" aria-label="Which projects" style={{display:"flex",gap:2,background:"#f1f5f9",borderRadius:8,padding:3}}>
          {[["mine","My projects"],["all","All active"]].map(([k,l])=><button key={k} role="tab" aria-selected={scope===k} onClick={()=>setScope(k)} style={{border:"none",borderRadius:6,padding:"5px 11px",background:scope===k?C.navy:"transparent",color:scope===k?"#fff":C.muted,fontWeight:scope===k?700:600,fontSize:".76rem",cursor:"pointer",fontFamily:"inherit"}}>{l}</button>)}
        </div>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search project, client, CE, PM…" style={{flex:"1 1 220px",minWidth:0,border:"1.5px solid #e2e8f0",borderRadius:8,padding:"6px 9px",fontFamily:"inherit",fontSize:".78rem"}}/>
      </div>
      <div style={box}>
        {rows.length===0&&<div style={{padding:20,color:C.faint,fontSize:".8rem"}}>{scope==="mine"?"No active project is assigned to you. Switch to All active.":"No active project."}</div>}
        {rows.map(({d,pc,pct})=>(
          <div key={d.id} style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",padding:"10px 14px",borderBottom:"1px solid #f1f5f9"}}>
            <div style={{flex:"1 1 260px",minWidth:0}}>
              <div style={{fontWeight:700,color:C.ink,fontSize:".84rem"}}>{projDisplayName(d)}{d.project?<span style={{color:C.faint,fontWeight:500}}> · {d.project}</span>:null}</div>
              <div style={{fontSize:".7rem",color:C.faint}}>{[pc.pm1,pc.pm2,pc.pm3].filter(Boolean).join(", ")||"No PM"}{pc.targetEndDate?` · due ${pc.targetEndDate}`:""}{pc.progressSetBy?` · set by ${pc.progressSetBy} ${pgAgo(pc.progressSetAt)}`:""}</div>
            </div>
            <div role="group" aria-label="Progress" style={{display:"flex",gap:4}}>
              {STEPS.map(s=>{const on=pct===s;const dis=!canSet(pc)||!!busy;return(
                <button key={s} disabled={dis} onClick={()=>!on&&set(d,s)} aria-pressed={on}
                  style={{minWidth:52,border:`1.5px solid ${on?STEP_CLR[s]:C.line}`,borderRadius:8,padding:"6px 8px",background:on?STEP_CLR[s]:"#fff",color:on?"#fff":C.muted,fontWeight:800,fontSize:".78rem",cursor:dis?"default":"pointer",fontFamily:"inherit",opacity:busy===d.id+":"+s?.6:1}}>{s}%</button>);})}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
