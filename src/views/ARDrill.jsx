import React,{useState,useMemo} from "react";
import {Modal} from "../shared";
import {milestoneBalanceParts} from "../core";

// ─── AR AGING DRILL-DOWN (Billing page) ────────────────────────────────────
// Clicking an AR Aging card lists the projects with money still to collect in
// that bucket, each split into VAT-exclusive base, VAT and EWT, with its open
// invoices underneath. "Receive payment" does not record anything here: it
// opens the project's normal Billing window on that invoice with the usual
// Log Payment form (same checks: balance, duplicates, offsets, mother POs).

const BUCKETS={all:"All outstanding",current:"Current (not yet due)",d30:"1–30 days overdue",d60:"31–60 days overdue",d90:"61–90 days overdue",over90:"90+ days overdue"};
export const arBucketOf=days=>days<=0?"current":days<=30?"d30":days<=60?"d60":days<=90?"d90":"over90";
const arPeso=v=>"₱"+Number(v||0).toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2});

export default function ARDrill({bucket,billings=[],dealOf,canPay=false,onReceive,onClose}){
  const mob=typeof window!=="undefined"&&window.innerWidth<768;
  const[q,setQ]=useState("");
  const[open,setOpen]=useState(()=>new Set());
  const now=new Date();

  const projects=useMemo(()=>{
    const by={};
    billings.forEach(b=>{
      const d=dealOf(b.dealId);
      const p=milestoneBalanceParts(b,d);
      if(p.bal<=0.005) return;
      const days=b.dueDate?Math.floor((now-new Date(b.dueDate))/864e5):0;
      if(bucket!=="all"&&arBucketOf(days)!==bucket) return;
      const g=by[b.dealId]||(by[b.dealId]={dealId:b.dealId,deal:d,base:0,vat:0,ewt:0,bal:0,maxDays:0,inv:[]});
      g.base+=p.base;g.vat+=p.vat;g.ewt+=p.ewt;g.bal+=p.bal;g.maxDays=Math.max(g.maxDays,days);
      g.inv.push({ms:b,days,...p});
    });
    return Object.values(by).map(g=>({...g,inv:g.inv.sort((a,b)=>b.days-a.days)}))
      .sort((a,b)=>(b.maxDays-a.maxDays)||(b.bal-a.bal));
  },[billings,bucket]);

  const qq=q.trim().toLowerCase();
  const rows=projects.filter(g=>!qq||[g.deal?.client,g.deal?.contact,g.deal?.ceNo,...g.inv.map(i=>i.ms.invoiceNo)].some(v=>String(v||"").toLowerCase().includes(qq)));
  const tot=rows.reduce((a,g)=>({base:a.base+g.base,vat:a.vat+g.vat,ewt:a.ewt+g.ewt,bal:a.bal+g.bal}),{base:0,vat:0,ewt:0,bal:0});
  const toggle=id=>setOpen(s=>{const n=new Set(s);n.has(id)?n.delete(id):n.add(id);return n;});
  const late=d=>d>0?<span style={{fontSize:".66rem",fontWeight:700,color:d>60?"#dc2626":d>30?"#ea580c":"#d97706",background:"#fff7ed",borderRadius:20,padding:"1px 8px",whiteSpace:"nowrap"}}>{d}d overdue</span>
    :<span style={{fontSize:".66rem",fontWeight:700,color:"#059669",background:"#f0fdf4",borderRadius:20,padding:"1px 8px"}}>not yet due</span>;
  const split=(x,small)=>(
    <div style={{display:"flex",flexWrap:"wrap",gap:"2px 12px",fontSize:small?".7rem":".74rem",color:"#475569"}}>
      <span>VAT-ex <b style={{color:"#0f172a"}}>{arPeso(x.base)}</b></span>
      {x.vat>0.005&&<span>VAT <b style={{color:"#0f172a"}}>{arPeso(x.vat)}</b></span>}
      {x.ewt>0.005&&<span>EWT <b style={{color:"#0f172a"}}>−{arPeso(x.ewt)}</b></span>}
    </div>
  );

  return(
    <Modal open onClose={onClose} title={`AR · ${BUCKETS[bucket]||bucket}`} wide>
      <div style={{background:"#1e293b",borderRadius:10,padding:"10px 14px",marginBottom:12,color:"#fff"}}>
        <div style={{fontSize:".7rem",color:"rgba(255,255,255,.6)",textTransform:"uppercase",letterSpacing:".6px"}}>{rows.length} project{rows.length===1?"":"s"} · to collect</div>
        <div style={{fontWeight:800,fontSize:"1.15rem",color:"#f59e0b"}}>{arPeso(tot.bal)}</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:"2px 14px",fontSize:".74rem",color:"rgba(255,255,255,.8)",marginTop:2}}>
          <span>VAT-ex <b style={{color:"#fff"}}>{arPeso(tot.base)}</b></span>
          <span>VAT <b style={{color:"#fff"}}>{arPeso(tot.vat)}</b></span>
          {tot.ewt>0.005&&<span>EWT <b style={{color:"#fff"}}>−{arPeso(tot.ewt)}</b></span>}
        </div>
      </div>
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search client, CE or invoice no…" style={{width:"100%",boxSizing:"border-box",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"8px 11px",fontFamily:"inherit",fontSize:".84rem",marginBottom:10}}/>
      {rows.length===0&&<div style={{textAlign:"center",padding:24,color:"#94a3b8",fontSize:".84rem"}}>Nothing to collect here.</div>}
      {rows.map(g=>{
        const isOpen=open.has(g.dealId);
        return(
          <div key={g.dealId} style={{border:"1.5px solid #e2e8f0",borderRadius:10,marginBottom:8,overflow:"hidden"}}>
            <button onClick={()=>toggle(g.dealId)} style={{display:"flex",width:"100%",gap:10,alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",padding:"10px 12px",background:isOpen?"#f8fafc":"#fff",border:"none",cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}>
              <div style={{flex:"1 1 200px",minWidth:0}}>
                <div style={{fontWeight:700,color:"#0f172a",fontSize:".88rem"}}>{g.deal?.client||"Unknown project"}{g.deal?.contact?<span style={{fontWeight:500,color:"#64748b"}}> · {g.deal.contact}</span>:null}</div>
                <div style={{fontSize:".7rem",color:"#94a3b8",marginBottom:3}}>{g.deal?.ceNo||"—"} · {g.inv.length} invoice{g.inv.length===1?"":"s"} {isOpen?"▲":"▼"}</div>
                {split(g)}
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontWeight:800,color:"#dc2626",fontSize:".95rem",whiteSpace:"nowrap"}}>{arPeso(g.bal)}</div>
                <div style={{fontSize:".66rem",color:"#94a3b8",marginBottom:3}}>to collect</div>
                {late(g.maxDays)}
              </div>
            </button>
            {isOpen&&g.inv.map(i=>(
              <div key={i.ms.id} style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center",justifyContent:"space-between",padding:"9px 12px",borderTop:"1px solid #f1f5f9",background:"#fcfcfd"}}>
                <div style={{flex:"1 1 200px",minWidth:0}}>
                  <div style={{fontWeight:600,color:"#0f172a",fontSize:".8rem"}}>{i.ms.invoiceNo||"No invoice no."} · {i.ms.name||"Billing"}</div>
                  <div style={{fontSize:".68rem",color:"#94a3b8",marginBottom:2}}>Due {i.ms.dueDate||"—"} · {i.ms.status||"—"} {late(i.days)}</div>
                  {split(i,true)}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:10,marginLeft:mob?0:"auto"}}>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontWeight:800,color:"#0f172a",fontSize:".85rem",whiteSpace:"nowrap"}}>{arPeso(i.bal)}</div>
                    <div style={{fontSize:".62rem",color:"#94a3b8"}}>to collect</div>
                  </div>
                  {canPay&&i.ms.status!=="Cancelled"&&<button onClick={()=>onReceive(g.dealId,i.ms.id)} style={{background:"#059669",color:"#fff",border:"none",borderRadius:7,padding:"7px 12px",fontFamily:"inherit",fontWeight:700,fontSize:".76rem",cursor:"pointer",whiteSpace:"nowrap"}}>💵 Receive payment</button>}
                </div>
              </div>
            ))}
          </div>
        );
      })}
      <div style={{fontSize:".7rem",color:"#94a3b8",marginTop:6}}>To collect = VAT-ex + VAT − EWT. Receive payment opens the project's billing window on that invoice with the usual Log Payment form.</div>
    </Modal>
  );
}
