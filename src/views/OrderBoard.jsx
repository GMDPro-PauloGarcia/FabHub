import React,{useState,useEffect,useMemo,useCallback} from "react";
import {isSupabaseReady,sbListAll} from "../supabaseClient";
import {useIsMobile} from "../shared";
import {projDisplayName} from "../core";

// ─── ORDER BOARD (Orders › Order Board) ─────────────────────────────────────
// Procurement's daily view of every PRF (agreed with Paulo 2026-11-06):
//   • Ready to order: every line of every PRF at "For Procurement" that still
//     has something to buy and no PO yet, grouped by supplier. The suggested
//     supplier is the last one GMD bought the same item from (PO history);
//     Procurement can change it per line.
//   • One click turns the ticked lines of one supplier into a PO (several PRFs
//     and projects can share one PO). The PO form opens pre-filled; after it is
//     saved, App links each PRF line to the PO through link_prf_po, so nobody
//     retypes a PO number.
//   • Cut-off 10:15 AM Manila: a PRF submitted by 10:15 is today's batch; after
//     10:15 it is tomorrow's unless Cost Control (QS) releases it; a PRF that
//     missed its day is shown as Urgent. Urgent PRFs are listed first.
//   • Coming: PRFs still at PM / Warehouse / Cost Control, so nothing surprises
//     Procurement at 10:15.
// Display only. The rules that block (from 1 Dec 2026) live in the database.

const C={ink:"#0f172a",muted:"#475569",faint:"#64748b",line:"#e2e8f0",navy:"#0B2545",ok:"#047857",warn:"#b45309",bad:"#b91c1c",urg:"#b91c1c"};
const CUTOFF="10:15";
const obNum=v=>Number(String(v??"").replace(/,/g,""))||0;
const obPeso=v=>"₱"+obNum(v).toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2});
const obNorm=s=>String(s||"").toLowerCase().replace(/\s+/g," ").trim();
const obBuyQty=l=>Math.max(0,obNum(l.qty)-obNum(l.stock_qty));
const obUnitCost=l=>l.qs_unit_cost!=null&&l.qs_unit_cost!==""?obNum(l.qs_unit_cost):obNum(l.est_unit_cost);
// Manila date (YYYY-MM-DD) and time (HH:MM) of a timestamp.
const MNL=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Manila",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false});
const obMnl=ts=>{const p=Object.fromEntries(MNL.formatToParts(ts?new Date(ts):new Date()).map(x=>[x.type,x.value]));return{date:`${p.year}-${p.month}-${p.day}`,time:`${p.hour==="24"?"00":p.hour}:${p.minute}`};};
const obNextDay=d=>{const t=new Date(d+"T00:00:00Z");t.setUTCDate(t.getUTCDate()+1);return t.toISOString().slice(0,10);};
// Which day's order a PRF belongs to: submitted by 10:15 → that day, else the next.
export const prfBatchDate=p=>{const m=obMnl(p.submitted_at||p.updated_at||p.created_at);return m.time<=CUTOFF?m.date:obNextDay(m.date);};
// Submitted today by 10:15 → today's batch; today after 10:15 → late (ordered
// today only if Cost Control releases it); any earlier day → it skipped its
// order, so it is Urgent now (Paulo, 6 Nov 2026).
export const prfBatchTag=(p,today)=>{
  if(String(p.priority||"")==="Urgent") return "urgent";
  const m=obMnl(p.submitted_at||p.updated_at||p.created_at);
  return m.date<today?"carried":m.time<=CUTOFF?"today":"late";
};
const TAG={urgent:["Urgent",C.urg,"#fee2e2"],carried:["Skipped its day → Urgent",C.urg,"#fee2e2"],today:["Today's batch",C.ok,"#dcfce7"],late:["After 10:15: needs Cost Control",C.warn,"#fef3c7"]};
const TAG_RANK={urgent:0,carried:1,today:2,late:3};
const STEPS=["For PM Approval","For Warehouse","For Cost Control"];
const STEP_WHO={"For PM Approval":"PM / OM","For Warehouse":"Warehouse","For Cost Control":"Cost Control (QS)"};

const obChip=(t,c,bg)=><span style={{display:"inline-block",fontSize:".66rem",fontWeight:800,color:c,background:bg||"#f1f5f9",borderRadius:20,padding:"2px 8px",whiteSpace:"nowrap"}}>{t}</span>;

export default function OrderBoard({deals=[],prs=[],suppliers=[],role,onCreatePo}){
  const mob=useIsMobile();
  const[prfs,setPrfs]=useState([]);
  const[lines,setLines]=useState([]);
  const[loading,setLoading]=useState(true);
  const[pick,setPick]=useState({});    // lineId -> false when unticked
  const[supOf,setSupOf]=useState({});  // lineId -> supplier chosen by Procurement
  const[q,setQ]=useState("");
  const[urgentOnly,setUrgentOnly]=useState(false);
  const[now,setNow]=useState(()=>Date.now());

  const load=useCallback(async()=>{
    if(!isSupabaseReady()){setLoading(false);return;}
    const[p,l]=await Promise.all([sbListAll("prfs",{order:"created_at"}),sbListAll("prf_lines",{order:"line_no",asc:true})]);
    const rev=Object.fromEntries(p.map(x=>[x.id,x.lines_rev]));
    setPrfs(p);setLines(l.filter(x=>rev[x.prf_id]===x.rev));setLoading(false);
  },[]);
  useEffect(()=>{load();const t=setInterval(load,60000);const c=setInterval(()=>setNow(Date.now()),30000);return()=>{clearInterval(t);clearInterval(c);};},[load]);

  const today=obMnl(now).date, nowTime=obMnl(now).time;
  const dealById=useMemo(()=>Object.fromEntries(deals.map(d=>[d.id,d])),[deals]);
  const projName=id=>projDisplayName(dealById[id])||"—";
  // Last supplier per item description, from PO history (newest PO date wins).
  const lastSupplier=useMemo(()=>{
    const m={};
    prs.filter(p=>p.poNumber&&p.supplier&&p.status!=="Cancelled").forEach(p=>{
      const k=obNorm(p.itemName||p.item);if(!k) return;
      const d=String(p.poDate||p.createdAt||"");
      if(!m[k]||d>m[k].d) m[k]={s:p.supplier,d};
    });
    return m;
  },[prs]);
  const suggest=l=>{
    const k=obNorm(l.description);
    if(lastSupplier[k]) return lastSupplier[k].s;
    const kk=obNorm([l.description,l.spec].filter(Boolean).join(" "));
    return lastSupplier[kk]?.s||"";
  };

  const prfById=useMemo(()=>Object.fromEntries(prfs.map(p=>[p.id,p])),[prfs]);
  const ready=useMemo(()=>{
    const qq=q.trim().toLowerCase();
    return lines.filter(l=>{
      const p=prfById[l.prf_id];
      if(!p||p.status!=="For Procurement"||l.po_number||obBuyQty(l)<=0) return false;
      if(urgentOnly&&!["urgent","carried"].includes(prfBatchTag(p,today))) return false;
      if(qq&&![l.description,l.spec,l.brand,p.prf_no,projName(p.deal_id),supOf[l.id]||suggest(l)].some(x=>String(x||"").toLowerCase().includes(qq))) return false;
      return true;
    }).map(l=>{const p=prfById[l.prf_id];return{...l,prf:p,tag:prfBatchTag(p,today),supplier:(supOf[l.id]??suggest(l))||""};});
  },[lines,prfById,q,urgentOnly,supOf,today,lastSupplier,dealById]);

  const groups=useMemo(()=>{
    const g={};
    ready.forEach(l=>{const k=l.supplier||"";(g[k]=g[k]||[]).push(l);});
    return Object.entries(g).map(([s,ls])=>({supplier:s,lines:ls.sort((a,b)=>TAG_RANK[a.tag]-TAG_RANK[b.tag]||String(a.prf.prf_no).localeCompare(String(b.prf.prf_no))),
      rank:Math.min(...ls.map(l=>TAG_RANK[l.tag])),total:ls.reduce((t,l)=>t+obBuyQty(l)*obUnitCost(l),0)}))
      .sort((a,b)=>(a.supplier?0:1)-(b.supplier?0:1)||a.rank-b.rank||b.total-a.total);
  },[ready]);

  const coming=prfs.filter(p=>STEPS.includes(p.status));
  const ticked=l=>pick[l.id]!==false;
  const canOrder=["Procurement","ProcurementManager","Manager"].includes(role);
  const cutLeft=(()=>{const[h,m]=nowTime.split(":").map(Number);const mins=10*60+15-(h*60+m);return mins;})();
  const counts={urgent:ready.filter(l=>["urgent","carried"].includes(l.tag)).length,today:ready.filter(l=>l.tag==="today").length,late:ready.filter(l=>l.tag==="late").length};

  const createPo=g=>{
    const ls=g.lines.filter(ticked);
    if(!ls.length) return;
    onCreatePo&&onCreatePo({supplier:g.supplier,lines:ls.map(l=>({prfId:l.prf_id,prfNo:l.prf.prf_no,lineId:l.id,dealId:l.prf.deal_id,
      itemName:[l.description,l.spec,l.brand].filter(Boolean).join(" · "),qty:obBuyQty(l),unit:l.unit||"pcs",estUnitCost:obUnitCost(l),category:l.category||"Materials"}))});
  };

  const obBox={background:"#fff",border:`1px solid ${C.line}`,borderRadius:12};
  const obInp={border:"1.5px solid #e2e8f0",borderRadius:8,padding:"6px 9px",fontFamily:"inherit",fontSize:".78rem",background:"#fff"};
  const supList=[...new Set([...suppliers.map(s=>s.name||s.supplier||s).filter(x=>typeof x==="string"),...Object.values(lastSupplier).map(x=>x.s)])].sort();

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,flexWrap:"wrap",marginBottom:12}}>
        <div>
          <div style={{fontWeight:800,color:C.navy,fontSize:"1.15rem"}}>Order Board</div>
          <div style={{fontSize:".78rem",color:C.muted,marginTop:2,maxWidth:760}}>Every PRF line ready to order, grouped by supplier. Tick the lines and create one PO per supplier; each PRF is linked to the PO by itself.</div>
        </div>
        <div style={{...obBox,padding:"8px 14px",borderLeft:`5px solid ${cutLeft>0?C.ok:C.warn}`}}>
          <div style={{fontSize:".62rem",fontWeight:800,color:C.faint,textTransform:"uppercase",letterSpacing:".5px"}}>Cut-off {CUTOFF} AM</div>
          <div style={{fontWeight:800,color:cutLeft>0?C.ok:C.warn,fontSize:".95rem"}}>{cutLeft>0?`${Math.floor(cutLeft/60)}h ${cutLeft%60}m left`:"Passed: new PRFs go to tomorrow"}</div>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:mob?"1fr 1fr":"repeat(4,1fr)",gap:8,marginBottom:12}}>
        {[["Urgent",counts.urgent,C.urg,"incl. missed cut-off"],["Today's batch",counts.today,C.ok,`in by ${CUTOFF} AM`],["After cut-off",counts.late,C.warn,"tomorrow, unless Cost Control releases"],["Still being approved",coming.length,C.navy,"PRFs at PM / Warehouse / Cost Control"]].map(([l,v,c,f])=>(
          <div key={l} style={{...obBox,padding:"9px 12px"}}>
            <div style={{fontSize:".62rem",fontWeight:800,color:C.faint,textTransform:"uppercase",letterSpacing:".5px"}}>{l}</div>
            <div style={{fontSize:"1.2rem",fontWeight:800,color:c}}>{v}</div>
            <div style={{fontSize:".66rem",color:C.faint}}>{f}</div>
          </div>
        ))}
      </div>

      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",marginBottom:12}}>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search item, PRF no., project, supplier…" style={{...obInp,flex:"1 1 260px",minWidth:0}}/>
        <label style={{fontSize:".76rem",color:C.muted,display:"flex",alignItems:"center",gap:6}}><input type="checkbox" checked={urgentOnly} onChange={e=>setUrgentOnly(e.target.checked)}/> Urgent only</label>
        <button onClick={load} style={{...obInp,cursor:"pointer",fontWeight:700,color:C.muted}}>↻ Refresh</button>
      </div>

      {loading?<div style={{...obBox,padding:20,color:C.faint}}>Loading PRFs…</div>
      :groups.length===0?<div style={{...obBox,padding:20,color:C.faint}}>Nothing to order: no PRF line is waiting for a PO.</div>
      :groups.map(g=>{
        const sel=g.lines.filter(ticked);
        const selTotal=sel.reduce((t,l)=>t+obBuyQty(l)*obUnitCost(l),0);
        return(
          <div key={g.supplier||"_none"} style={{...obBox,marginBottom:12,overflow:"hidden"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap",padding:"10px 14px",background:"#f8fafc",borderBottom:`1px solid ${C.line}`}}>
              <div>
                <span style={{fontWeight:800,color:g.supplier?C.navy:C.warn,fontSize:".95rem"}}>{g.supplier||"No supplier yet"}</span>
                <span style={{fontSize:".72rem",color:C.faint,marginLeft:8}}>{g.lines.length} line{g.lines.length>1?"s":""} · {[...new Set(g.lines.map(l=>l.prf.prf_no))].length} PRF · {obPeso(g.total)}</span>
              </div>
              {canOrder&&<button disabled={!g.supplier||!sel.length} onClick={()=>createPo(g)} title={!g.supplier?"Pick a supplier for these lines first":""}
                style={{background:g.supplier&&sel.length?C.navy:"#cbd5e1",color:"#fff",border:"none",borderRadius:8,padding:"8px 14px",fontWeight:700,fontSize:".78rem",cursor:g.supplier&&sel.length?"pointer":"not-allowed",fontFamily:"inherit"}}>
                Create PO · {sel.length} line{sel.length!==1?"s":""} · {obPeso(selTotal)}</button>}
            </div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",minWidth:760}}>
                <tbody>
                  {g.lines.map(l=>{const[t,c,bg]=TAG[l.tag];return(
                    <tr key={l.id} style={{borderBottom:"1px solid #f1f5f9",opacity:ticked(l)?1:.55}}>
                      <td style={{padding:"8px 10px",width:28}}><input type="checkbox" checked={ticked(l)} onChange={e=>setPick(p=>({...p,[l.id]:e.target.checked}))} aria-label="Include in PO"/></td>
                      <td style={{padding:"8px 10px",fontSize:".78rem"}}>
                        <div style={{fontWeight:700,color:C.ink}}>{l.description}{l.spec?<span style={{color:C.faint,fontWeight:500}}> · {l.spec}</span>:null}</div>
                        <div style={{fontSize:".7rem",color:C.faint}}>{l.prf.prf_no} · {projName(l.prf.deal_id)}{l.prf.required_date?` · needed ${l.prf.required_date}`:""}</div>
                      </td>
                      <td style={{padding:"8px 10px",fontSize:".78rem",whiteSpace:"nowrap",textAlign:"right"}}>{obBuyQty(l)} {l.unit}</td>
                      <td style={{padding:"8px 10px",fontSize:".78rem",whiteSpace:"nowrap",textAlign:"right",fontVariantNumeric:"tabular-nums"}}>{obPeso(obBuyQty(l)*obUnitCost(l))}</td>
                      <td style={{padding:"8px 10px"}}>{obChip(t,c,bg)}</td>
                      <td style={{padding:"8px 10px",width:210}}>
                        <input list="ob-suppliers" value={supOf[l.id]??suggest(l)} onChange={e=>setSupOf(s=>({...s,[l.id]:e.target.value}))} placeholder="Supplier…" aria-label="Supplier" style={{...obInp,width:"100%"}}/>
                      </td>
                    </tr>);})}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
      <datalist id="ob-suppliers">{supList.map(s=><option key={s} value={s}/>)}</datalist>

      {coming.length>0&&(
        <div style={{...obBox,padding:"10px 14px",marginTop:6}}>
          <div style={{fontWeight:800,color:C.navy,fontSize:".85rem",marginBottom:6}}>Still being approved ({coming.length})</div>
          {STEPS.map(s=>{const ps=coming.filter(p=>p.status===s);if(!ps.length) return null;return(
            <div key={s} style={{fontSize:".76rem",color:C.muted,padding:"4px 0"}}>
              <b style={{color:C.ink}}>Waiting on {STEP_WHO[s]}:</b> {ps.map(p=>`${p.prf_no||"PRF"} (${projName(p.deal_id)}${p.priority==="Urgent"?", URGENT":""})`).join(" · ")}
            </div>);})}
        </div>
      )}
      <div style={{fontSize:".7rem",color:C.faint,marginTop:10}}>
        Suggested supplier = the last supplier GMD bought the same item from. From 1 Dec 2026: a project PO needs an approved PRF; a PRF in after 10:15 AM is ordered the same day only if Cost Control (QS) releases it; Urgent PRFs need Cost Control and the Procurement Manager.
      </div>
    </div>
  );
}
