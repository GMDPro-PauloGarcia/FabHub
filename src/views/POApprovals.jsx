import React,{useState,useMemo} from "react";
import {uiConfirm} from "../shared";
import {canApprovePO,dealDpClear} from "../core";

// ─── PO APPROVALS (Purchase Orders page) ───────────────────────────────────
// Since 19 Sep 2026 only a Manager, a Procurement Manager or a designated PO
// approver may move a PO to "PO Issued" (canApprovePO). Approving meant opening
// each PO line's status dropdown, so POs piled up at "Pending Approval" and,
// because a PO raises its supplier bill only once issued, no payables were
// created either. This panel lists every pending PO the viewer may approve,
// grouped by PO number, and approves the ticked ones in one go (approvePOs).

const num=v=>Number(String(v??"").replace(/,/g,""))||0;
const pesoAmt=v=>"₱"+num(v).toLocaleString("en-PH",{maximumFractionDigits:0});
const PAGE=50;

export default function POApprovals({prs=[],deals=[],role,session,poApprovers="",approvePOs}){
  const mob=typeof window!=="undefined"&&window.innerWidth<860;
  const me=session?.name||"";
  const[open,setOpen]=useState(false);
  const[q,setQ]=useState("");
  const[who,setWho]=useState("All");
  const[sel,setSel]=useState(()=>new Set());
  const[limit,setLimit]=useState(PAGE);
  const[busy,setBusy]=useState(false);

  const dealName=id=>{const d=id&&deals.find(x=>x.id===id);return d?[d.client,d.ceNo].filter(Boolean).join(" · "):"";};
  // One row per pending PO the viewer may approve. A PO with any line the viewer
  // can't approve (e.g. their own request) is left out entirely.
  const pos=useMemo(()=>{
    const by={};
    prs.filter(p=>p.status==="Pending Approval"&&p.poNumber).forEach(p=>{(by[p.poNumber]=by[p.poNumber]||[]).push(p);});
    return Object.entries(by)
      .filter(([,ls])=>ls.every(l=>canApprovePO(role,me,l.requestedBy,poApprovers)))
      .map(([no,ls])=>{
        const f=ls[0];
        const gross=ls.reduce((s,i)=>s+(num(i.actUnitCost)||num(i.estUnitCost))*num(i.qty),0);
        // "NO DP = NO production": can't be issued while any line's deal has no
        // payment and no Manager waiver (dealDpClear; the database refuses it too).
        const held=ls.map(l=>deals.find(x=>x.id===(l.projectId||l.dealId))).find(d=>d&&!dealDpClear(d,deals));
        return{no,lines:ls.length,supplier:f.supplier||"",project:f.projectName||dealName(f.projectId||f.dealId)||"GMD Stock",
          dpHold:held?(held.ceNo||held.client||"this project"):"",
          requestedBy:f.requestedBy||"",date:f.poDate||f.createdDate||String(f.createdAt||"").slice(0,10),gross:Math.round(gross*(f.withVat?1.12:1))};
      })
      .sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  },[prs,deals,role,me,poApprovers]);

  if(!pos.length) return null;
  const requesters=["All",...new Set(pos.map(p=>p.requestedBy||"(blank)"))];
  const qq=q.trim().toLowerCase();
  const rows=pos.filter(p=>(who==="All"||(p.requestedBy||"(blank)")===who)&&(!qq||[p.no,p.supplier,p.project,p.requestedBy].some(v=>String(v).toLowerCase().includes(qq))));
  const shown=rows.slice(0,limit);
  const picked=pos.filter(p=>sel.has(p.no));
  const pickedTotal=picked.reduce((s,p)=>s+p.gross,0);
  const allShown=shown.some(p=>!p.dpHold)&&shown.filter(p=>!p.dpHold).every(p=>sel.has(p.no));
  const toggle=no=>setSel(prev=>{const n=new Set(prev);n.has(no)?n.delete(no):n.add(no);return n;});
  const toggleShown=()=>setSel(prev=>{const n=new Set(prev);shown.filter(p=>!p.dpHold).forEach(p=>allShown?n.delete(p.no):n.add(p.no));return n;});
  const approve=async()=>{
    if(!picked.length||busy) return;
    if(!(await uiConfirm({title:`Approve ${picked.length} PO${picked.length>1?"s":""}`,confirmLabel:"Approve and issue",
      message:`${picked.length} PO${picked.length>1?"s":""} · ${picked.reduce((s,p)=>s+p.lines,0)} lines · about ${pesoAmt(pickedTotal)}.\n\nEach is set to "PO Issued" with you as approver, and its supplier bill is raised for Finance. Only approve POs you have actually reviewed.`}))) return;
    setBusy(true);
    const ok=await approvePOs(picked.map(p=>p.no));
    setBusy(false);
    if(ok) setSel(new Set());
  };
  const th={padding:"7px 10px",fontSize:".66rem",fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:".5px",textAlign:"left"};
  const td={padding:"8px 10px",fontSize:".78rem",verticalAlign:"top"};

  return(
    <div style={{background:"#fffbeb",border:"1.5px solid #fcd34d",borderRadius:12,marginBottom:18}}>
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
          <button onClick={approve} disabled={busy} style={{background:"#059669",color:"#fff",border:"none",borderRadius:7,padding:"6px 14px",fontSize:".78rem",fontWeight:700,cursor:"pointer",fontFamily:"inherit",opacity:busy?.6:1}}>{busy?"Approving…":"Approve selected"}</button>
          <button onClick={()=>setSel(new Set())} style={{background:"none",border:"none",color:"#475569",fontSize:".76rem",cursor:"pointer",fontFamily:"inherit"}}>Clear</button>
        </div>}
        <div style={{overflowX:"auto",background:"#fff",borderRadius:9,border:"1px solid #fde68a"}}>
          <table style={{width:"100%",borderCollapse:"collapse",minWidth:mob?620:0}}>
            <thead><tr style={{background:"#f8fafc"}}>
              <th style={{...th,width:22}}><input type="checkbox" aria-label="Select all shown POs" checked={allShown} onChange={toggleShown}/></th>
              <th style={th}>PO</th><th style={th}>Supplier / project</th><th style={th}>Requested by</th><th style={{...th,textAlign:"right"}}>Approx. total</th>
            </tr></thead>
            <tbody>
              {shown.map(p=>(
                <tr key={p.no} style={{borderTop:"1px solid #f1f5f9",background:sel.has(p.no)?"#f0fdf4":undefined}}>
                  <td style={td}><input type="checkbox" aria-label={`Select PO ${p.no}`} checked={sel.has(p.no)} disabled={!!p.dpHold} title={p.dpHold?"No down payment yet: a Manager must waive it on the deal first":undefined} onChange={()=>toggle(p.no)}/></td>
                  <td style={td}><div style={{fontWeight:700,color:"#0f172a"}}>{p.no}</div><div style={{fontSize:".68rem",color:"#94a3b8"}}>{p.date||"—"} · {p.lines} line{p.lines>1?"s":""}</div></td>
                  <td style={td}><div style={{fontWeight:600,color:"#0f172a"}}>{p.supplier||"—"}</div><div style={{fontSize:".7rem",color:"#64748b"}}>{p.project}</div>{p.dpHold&&<div style={{fontSize:".68rem",color:"#b91c1c",fontWeight:700,marginTop:2}}>No down payment yet on {p.dpHold}: waive it on the deal first</div>}</td>
                  <td style={{...td,color:"#475569"}}>{p.requestedBy||"—"}</td>
                  <td style={{...td,textAlign:"right",fontWeight:800,whiteSpace:"nowrap"}}>{pesoAmt(p.gross)}</td>
                </tr>
              ))}
              {rows.length===0&&<tr><td colSpan={5} style={{textAlign:"center",padding:20,color:"#94a3b8",fontSize:".8rem"}}>No pending POs match.</td></tr>}
            </tbody>
          </table>
        </div>
        {rows.length>limit&&<button onClick={()=>setLimit(l=>l+PAGE)} style={{marginTop:8,background:"#fff",border:"1px solid #fde68a",borderRadius:7,padding:"6px 14px",fontSize:".76rem",fontWeight:600,color:"#92400e",cursor:"pointer",fontFamily:"inherit"}}>Show {Math.min(PAGE,rows.length-limit)} more of {rows.length-limit}</button>}
        <div style={{fontSize:".7rem",color:"#a16207",marginTop:8}}>Totals are approximate (before PO discounts). POs you requested yourself aren't listed: another approver must issue them.</div>
      </div>}
    </div>
  );
}
