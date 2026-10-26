import React,{useState,useMemo} from "react";
import {today as TODAY,Modal,Fld,Inp,Sel} from "../shared";

// ─── CE REQUEST TRACKER (Sales Pipeline tab) ───────────────────────────────
// A small list of the cost estimates Sales has asked QS for, kept while the
// full CE/QS Queue is hidden and Sales and QS work the requests offline. It
// reads and writes the same ce_requests rows as the hidden queue, so nothing
// is lost and the queue picks them up again if it comes back.
// Under RLS, Sales may add a request; only QS and Managers change its status.

const STATUS=["Pending","Ongoing","Done"];
const STATUS_CLR={Pending:"#f59e0b",Ongoing:"#3b82f6",Done:"#10b981"};
const PRI_CLR={High:"#ef4444",Normal:"#3b82f6",Low:"#94a3b8"};
const CLOSED_STAGES=["Did Not Win","Cancelled"];

export default function CERequestTracker({ceReqs=[],deals=[],addCEReq,updateCEReq,session,role,toastEmit,today=TODAY}){
  const mob=typeof window!=="undefined"&&window.innerWidth<860;
  const canAdd=["Manager","Sales","QS","SalesOpsAdmin"].includes(role);
  const canUpdate=["Manager","QS"].includes(role);
  const[showDone,setShowDone]=useState(false);
  const[q,setQ]=useState("");
  const[adding,setAdding]=useState(false);
  const empty={clientName:"",projectName:"",dealId:"",targetDeadline:"",priority:"Normal",notes:""};
  const[form,setForm]=useState(empty);
  const f=(k,v)=>setForm(p=>({...p,[k]:v}));

  const dealLabel=d=>d?[d.client,d.ceNo,d.location].filter(Boolean).join(" · "):"";
  const dealById=id=>id?deals.find(d=>String(d.id)===String(id)):null;
  const dealOpts=useMemo(()=>deals.filter(d=>!CLOSED_STAGES.includes(d.stage)).sort((a,b)=>String(a.client||"").localeCompare(String(b.client||""))),[deals]);

  const daysLeft=d=>d?Math.round((new Date(d+"T00:00:00")-new Date(today+"T00:00:00"))/864e5):null;
  const rows=useMemo(()=>{
    const qq=q.trim().toLowerCase();
    return ceReqs
      .filter(r=>showDone?r.status==="Done":r.status!=="Done")
      .filter(r=>!qq||[r.clientName,r.projectName,r.submittedBy,dealLabel(dealById(r.dealId))].some(v=>String(v||"").toLowerCase().includes(qq)))
      .sort((a,b)=>showDone?String(b.createdAt||"").localeCompare(String(a.createdAt||"")):(a.targetDeadline||"9999").localeCompare(b.targetDeadline||"9999"));
  },[ceReqs,deals,q,showDone,today]);
  const open=ceReqs.filter(r=>r.status!=="Done");
  const overdue=open.filter(r=>{const d=daysLeft(r.targetDeadline);return d!==null&&d<0;}).length;

  const save=async()=>{
    if(!form.clientName.trim()){toastEmit&&toastEmit("Client name is required.","error");return;}
    const ok=await addCEReq({client_name:form.clientName.trim(),project_name:form.projectName.trim(),project_type:"other",priority:form.priority,
      submitted_by:session?.name||role||"",target_deadline:form.targetDeadline||null,notes:form.notes,deal_id:form.dealId||null,status:"Pending"});
    if(ok===false){toastEmit&&toastEmit("⚠️ Saved on this device but NOT confirmed by the server — check your connection.","warning",8000);}
    else toastEmit&&toastEmit("CE request added","success");
    setAdding(false);setForm(empty);
  };
  const setStatus=(r,status)=>updateCEReq(r.id,{status,updated_at:new Date().toISOString()});

  return(
    <div>
      <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",marginBottom:12}}>
        <div style={{flex:"1 1 220px"}}>
          <div style={{fontWeight:800,color:"#0f172a",fontSize:"1rem"}}>📐 CE Requests</div>
          <div style={{fontSize:".76rem",color:"#64748b"}}>{open.length} open{overdue>0&&<span style={{color:"#dc2626",fontWeight:700}}> · {overdue} past due</span>} · Sales adds, QS updates the status</div>
        </div>
        {canAdd&&<button onClick={()=>{setForm(empty);setAdding(true);}} style={{background:"#3b82f6",color:"#fff",border:"none",borderRadius:8,padding:"8px 16px",fontWeight:700,fontSize:".82rem",cursor:"pointer",fontFamily:"inherit"}}>+ New request</button>}
      </div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",marginBottom:10}}>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search client, project, requester…" style={{flex:"1 1 200px",minWidth:0,border:"1.5px solid #e2e8f0",borderRadius:8,padding:"7px 11px",fontFamily:"inherit",fontSize:".82rem"}}/>
        <label style={{display:"flex",alignItems:"center",gap:5,fontSize:".78rem",color:"#475569",cursor:"pointer"}}>
          <input type="checkbox" checked={showDone} onChange={e=>setShowDone(e.target.checked)}/> Show done
        </label>
      </div>
      <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",minWidth:mob?620:0}}>
          <thead><tr style={{background:"#f8fafc"}}>
            {["Client / project","Requested","QS due","Status"].map(h=><th key={h} style={{padding:"8px 12px",fontSize:".66rem",fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:".5px",textAlign:"left"}}>{h}</th>)}
          </tr></thead>
          <tbody>
            {rows.map(r=>{
              const d=daysLeft(r.targetDeadline),deal=dealById(r.dealId);
              const dueClr=r.status==="Done"||d===null?"#64748b":d<0?"#dc2626":d<=3?"#d97706":"#475569";
              return(
                <tr key={r.id} style={{borderTop:"1px solid #f1f5f9"}}>
                  <td style={{padding:"9px 12px",fontSize:".8rem",verticalAlign:"top"}}>
                    <div style={{fontWeight:700,color:"#0f172a"}}>{r.clientName||"—"}{r.priority&&r.priority!=="Normal"&&<span style={{marginLeft:6,fontSize:".64rem",fontWeight:700,color:PRI_CLR[r.priority]||"#64748b"}}>● {r.priority}</span>}</div>
                    <div style={{fontSize:".72rem",color:"#64748b"}}>{[r.projectName,deal&&`Deal: ${dealLabel(deal)}`].filter(Boolean).join(" · ")||"—"}</div>
                    {r.notes&&<div style={{fontSize:".7rem",color:"#94a3b8",marginTop:2}}>{r.notes}</div>}
                  </td>
                  <td style={{padding:"9px 12px",fontSize:".76rem",color:"#475569",verticalAlign:"top",whiteSpace:"nowrap"}}>{(r.createdAt||"").slice(0,10)||"—"}<div style={{fontSize:".68rem",color:"#94a3b8"}}>{r.submittedBy||""}</div></td>
                  <td style={{padding:"9px 12px",fontSize:".76rem",verticalAlign:"top",whiteSpace:"nowrap",color:dueClr,fontWeight:dueClr==="#dc2626"?700:500}}>{r.targetDeadline||"No date"}{r.status!=="Done"&&d!==null&&<div style={{fontSize:".68rem"}}>{d<0?`${-d}d late`:d===0?"today":`${d}d left`}</div>}</td>
                  <td style={{padding:"9px 12px",verticalAlign:"top"}}>
                    {canUpdate
                      ?<select value={r.status||"Pending"} onChange={e=>setStatus(r,e.target.value)} style={{border:`1.5px solid ${STATUS_CLR[r.status]||"#e2e8f0"}`,color:STATUS_CLR[r.status]||"#475569",borderRadius:20,padding:"3px 8px",fontSize:".74rem",fontWeight:700,fontFamily:"inherit",background:"#fff",cursor:"pointer"}}>{STATUS.map(s=><option key={s}>{s}</option>)}</select>
                      :<span style={{fontSize:".7rem",fontWeight:700,color:STATUS_CLR[r.status]||"#64748b",background:(STATUS_CLR[r.status]||"#64748b")+"18",borderRadius:20,padding:"3px 10px"}}>{r.status||"Pending"}</span>}
                  </td>
                </tr>
              );
            })}
            {rows.length===0&&<tr><td colSpan={4} style={{textAlign:"center",padding:24,color:"#94a3b8",fontSize:".82rem"}}>{showDone?"No finished CE requests.":"No open CE requests."}</td></tr>}
          </tbody>
        </table>
      </div>

      <Modal open={adding} onClose={()=>setAdding(false)} title="New CE request">
        <Fld label="Client" required><Inp value={form.clientName} onChange={e=>f("clientName",e.target.value)} placeholder="e.g. Diageo"/></Fld>
        <Fld label="Project"><Inp value={form.projectName} onChange={e=>f("projectName",e.target.value)} placeholder="What and where"/></Fld>
        <Fld label="Linked deal" hint="Optional: the pipeline deal this estimate is for.">
          <Sel value={form.dealId} onChange={e=>f("dealId",e.target.value)}>
            <option value="">— None —</option>
            {dealOpts.map(d=><option key={d.id} value={d.id}>{dealLabel(d)}</option>)}
          </Sel>
        </Fld>
        <Fld label="Needed from QS by"><Inp type="date" value={form.targetDeadline} onChange={e=>f("targetDeadline",e.target.value)}/></Fld>
        <Fld label="Priority"><Sel value={form.priority} onChange={e=>f("priority",e.target.value)}>{["High","Normal","Low"].map(p=><option key={p}>{p}</option>)}</Sel></Fld>
        <Fld label="Notes"><Inp rows={3} value={form.notes} onChange={e=>f("notes",e.target.value)} placeholder="Scope, plans link, anything QS needs"/></Fld>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <button onClick={()=>setAdding(false)} style={{background:"#f1f5f9",border:"none",borderRadius:8,padding:"9px 16px",fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
          <button onClick={save} style={{background:"#3b82f6",color:"#fff",border:"none",borderRadius:8,padding:"9px 16px",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Add request</button>
        </div>
      </Modal>
    </div>
  );
}
