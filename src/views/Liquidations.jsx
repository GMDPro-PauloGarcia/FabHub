import React,{useState,useEffect,useCallback,useMemo} from "react";
import {today as TODAY,Modal,Fld,Inp,Sel,uiAlert,uiConfirm,uiPrompt,useIsMobile} from "../shared";
import {projDisplayName} from "../core";
import {supabase,isSupabaseReady,sbUploadFile,sbGetPublicUrl} from "../supabaseClient";
import {num,r2,php2} from "../data/ledger";
import {chip,linkBtn} from "./Ledgers";

// ─── LIQUIDATIONS (refills with receipts) ──────────────────────────────────
// Anyone submits what they spent, one line per receipt. Finance checks it
// (not their own), a Manager approves it with the Friday payment run, Finance
// pays it on Friday. The database keeps every rule and stamp (migration
// 20261114080000_liquidations_and_friday_run.sql); this screen only mirrors it.
// Saves use insert / update, never a full-row upsert.

const C={ink:"#0f172a",muted:"#64748b",faint:"#94a3b8",line:"#e2e8f0",ok:"#059669",warn:"#d97706",bad:"#dc2626",navy:"#0B2545",blue:"#2563eb"};
export const LIQ_STATUS={
  Submitted:{l:"Waiting for Finance",c:C.warn},
  Returned:{l:"Returned: fix and resubmit",c:C.bad},
  Checked:{l:"Ready for Friday's run",c:C.blue},
  Approved:{l:"Approved in a payment run",c:C.navy},
  Paid:{l:"Refilled",c:C.ok},
  Cancelled:{l:"Cancelled",c:C.faint},
};
export const CHARGE_TO=["OPEX","Admin","Office","Warehouse","Vehicle","Other"];
const FIN_ROLES=["Manager","Finance","FinanceAssistant"];
const btnS=(clr,ghost)=>({background:ghost?"#fff":clr,color:ghost?clr:"#fff",border:`1px solid ${clr}`,borderRadius:8,padding:"7px 12px",fontSize:".76rem",fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"});
export const liqFromSb=r=>({...r,items:Array.isArray(r.items)?r.items:[],amount:num(r.amount)});
const blankLine=()=>({date:TODAY,supplier:"",description:"",amount:"",receipt_path:"",no_receipt:""});

export default function Liquidations({deals=[],role="",session,today=TODAY}){
  const mob=useIsMobile();
  const me=session?.username||"";
  const myName=session?.name||"";
  const isFin=FIN_ROLES.includes(role);
  const isMgr=role==="Manager";
  const[rows,setRows]=useState([]);
  const[loading,setLoading]=useState(true);
  const[err,setErr]=useState("");
  const[busy,setBusy]=useState(false);
  const[tab,setTab]=useState(isFin?"check":"mine");
  const[form,setForm]=useState(null);   // {id?, payee, purpose, project_id, charge_to, items[]}
  const[open,setOpen]=useState(null);
  const[q,setQ]=useState("");

  const load=useCallback(async()=>{
    if(!isSupabaseReady()){setErr("No server connection.");setLoading(false);return;}
    setLoading(true);
    const{data,error}=await supabase.from("liquidations").select("*").order("created_at",{ascending:false}).limit(500);
    if(error) setErr(/relation .*liquidations.* does not exist/i.test(error.message)?"Liquidations go live with the weekend release.":error.message);
    else {setErr("");setRows((data||[]).map(liqFromSb));}
    setLoading(false);
  },[]);
  useEffect(()=>{load();},[load]);

  const dealById=useMemo(()=>new Map(deals.map(d=>[d.id,d])),[deals]);
  const projOpts=useMemo(()=>deals.filter(d=>d&&d.id).map(d=>({value:d.id,label:projDisplayName(d)})).sort((a,b)=>a.label.localeCompare(b.label)),[deals]);
  const chargeLabel=r=>r.project_id?(projDisplayName(dealById.get(r.project_id))||"Project"):(r.charge_to||"—");
  const mineRow=r=>r.requested_by===me;
  const ownForCheck=r=>mineRow(r)||String(r.payee||"").trim().toLowerCase()===myName.trim().toLowerCase();

  const lists={
    mine:rows.filter(mineRow),
    check:rows.filter(r=>r.status==="Submitted"),
    ready:rows.filter(r=>r.status==="Checked"||r.status==="Approved"),
    all:rows,
  };
  const ql=q.trim().toLowerCase();
  const shown=(lists[tab]||[]).filter(r=>!ql||[r.liq_no,r.payee,r.purpose,r.requester_name,chargeLabel(r)].some(x=>String(x||"").toLowerCase().includes(ql)));

  // ── save helpers (insert / update only) ─────────────────────────────────
  const fail=async(title,e)=>{await uiAlert({title,message:e?.message||String(e||"Try again.")});};
  const patch=async(id,fields,okMsg)=>{
    setBusy(true);
    const{data,error}=await supabase.from("liquidations").update(fields).eq("id",id).select("*").maybeSingle();
    setBusy(false);
    if(error||!data){await fail("Not saved",error||"It may have changed. Refresh.");return false;}
    setRows(rs=>rs.map(r=>r.id===id?liqFromSb(data):r));
    return true;
  };

  const startNew=()=>setForm({payee:myName,purpose:"",project_id:"",charge_to:"",items:[blankLine()]});
  const startEdit=r=>setForm({id:r.id,status:r.status,payee:r.payee,purpose:r.purpose,project_id:r.project_id||"",charge_to:r.charge_to||"",
    items:(r.items||[]).map(it=>({...blankLine(),...it,amount:String(it.amount??"")}))});
  const setF=(k,v)=>setForm(f=>({...f,[k]:v}));
  const setLine=(i,k,v)=>setForm(f=>({...f,items:f.items.map((it,j)=>j===i?{...it,[k]:v}:it)}));
  const formTotal=form?r2(form.items.reduce((s,it)=>s+num(it.amount),0)):0;

  const upload=async(i,file)=>{
    if(!file) return;
    setBusy(true);
    const path=await sbUploadFile(`liquidations/${me||"user"}`,file);
    setBusy(false);
    if(!path){await uiAlert("The receipt didn't upload. Check your connection and try again.");return;}
    setLine(i,"receipt_path",path);
  };

  const saveForm=async()=>{
    const f=form;
    const items=f.items.filter(it=>num(it.amount)>0||String(it.description||"").trim()).map(it=>({
      date:it.date||today,supplier:String(it.supplier||"").trim(),description:String(it.description||"").trim(),
      amount:r2(it.amount),receipt_path:it.receipt_path||"",no_receipt:it.receipt_path?"":String(it.no_receipt||"").trim()}));
    // Same checks as liquidations_guard, so the person sees them before saving.
    if(String(f.purpose||"").trim().length<3){await uiAlert("Say what the money was for.");return;}
    if(!f.project_id&&!f.charge_to){await uiAlert("Pick the project, or what it is charged to.");return;}
    if(!items.length){await uiAlert("Add at least one receipt line.");return;}
    for(let i=0;i<items.length;i++){
      const it=items[i];
      if(!(it.amount>0)){await uiAlert(`Line ${i+1}: enter an amount above zero.`);return;}
      if(it.description.length<3){await uiAlert(`Line ${i+1}: say what it was for.`);return;}
      if(!it.receipt_path&&it.no_receipt.length<3){await uiAlert(`Line ${i+1}: attach the receipt, or say why there is none.`);return;}
    }
    const body={payee:String(f.payee||"").trim()||myName,purpose:String(f.purpose).trim(),project_id:f.project_id||null,charge_to:f.project_id?"":f.charge_to,items};
    if(f.id){
      const ok=await patch(f.id,{...body,...(f.status==="Returned"?{status:"Submitted"}:{})});
      if(ok) setForm(null);
      return;
    }
    setBusy(true);
    const{data,error}=await supabase.from("liquidations").insert(body).select("*").maybeSingle();
    setBusy(false);
    if(error||!data){await fail("Not submitted",error);return;}
    setRows(rs=>[liqFromSb(data),...rs]);
    setForm(null);
    setTab("mine");
  };

  const check=async r=>{
    if(!(await uiConfirm({title:`Check ${r.liq_no}`,confirmLabel:"Receipts match, checked",
      message:`${r.payee} · ${php2(r.amount)}\n${r.items.length} line(s). Every line has its receipt (or a reason) and the amounts add up.`}))) return;
    await patch(r.id,{status:"Checked"});
  };
  const sendBack=async r=>{
    const why=await uiPrompt({title:`Return ${r.liq_no}`,confirmLabel:"Return",message:"What needs fixing? The requester sees this."});
    if(why==null) return;
    if(why.trim().length<5){await uiAlert("Say what needs fixing (at least 5 characters).");return;}
    await patch(r.id,{status:"Returned",return_reason:why.trim()});
  };
  const cancel=async r=>{
    const why=await uiPrompt({title:`Cancel ${r.liq_no}`,confirmLabel:"Cancel it",message:"Why is it cancelled?"});
    if(why==null) return;
    if(why.trim().length<5){await uiAlert("Give a reason (at least 5 characters).");return;}
    await patch(r.id,{status:"Cancelled",cancel_reason:why.trim()});
  };

  const receiptLink=p=>{const u=p&&sbGetPublicUrl(p);return u?<a href={u} target="_blank" rel="noreferrer" style={{color:C.blue,fontWeight:600}}>receipt ↗</a>:null;};
  const TABS=[["mine","Mine",lists.mine.length],...(isFin?[["check","To check",lists.check.length],["ready","Ready to refill",lists.ready.length],["all","All",lists.all.length]]:[])];

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,flexWrap:"wrap",marginBottom:12}}>
        <div>
          <div style={{fontWeight:800,color:C.navy,fontSize:"1.05rem"}}>🧾 Liquidations</div>
          <div style={{fontSize:".76rem",color:C.muted,marginTop:2,maxWidth:720}}>Spent your own or the fund's cash? List each receipt here. Finance checks it, a Manager approves it with Friday's payment run, and you're refilled on Friday.</div>
        </div>
        <div style={{display:"flex",gap:6}}>
          <button disabled={busy||!!err} onClick={startNew} style={btnS(C.navy)}>+ New liquidation</button>
          <button onClick={load} style={btnS(C.muted,true)} title="Refresh">🔄</button>
        </div>
      </div>
      {err&&<div style={{background:"#fffbeb",border:"1px solid #fde68a",color:"#92400e",borderRadius:8,padding:"8px 12px",fontSize:".78rem",marginBottom:10}}>{err}</div>}

      <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center",marginBottom:10}}>
        {TABS.map(([k,l,n])=>(
          <button key={k} onClick={()=>setTab(k)} style={{padding:"6px 12px",borderRadius:20,border:`1.5px solid ${tab===k?C.ink:C.line}`,background:tab===k?C.ink:"#fff",color:tab===k?"#fff":C.muted,fontFamily:"inherit",fontSize:".74rem",fontWeight:tab===k?700:500,cursor:"pointer"}}>{l} ({n})</button>
        ))}
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search LQ no., payee, project…" style={{flex:"1 1 180px",minWidth:160,border:"1.5px solid #e2e8f0",borderRadius:8,padding:"6px 10px",fontFamily:"inherit",fontSize:".78rem"}}/>
      </div>

      {loading&&<div style={{fontSize:".8rem",color:C.faint,padding:12}}>Loading…</div>}
      {!loading&&!err&&shown.length===0&&<div style={{padding:20,textAlign:"center",color:C.faint,fontSize:".82rem",background:"#fff",border:`1px solid ${C.line}`,borderRadius:12}}>
        {tab==="check"?"Nothing waiting for a check.":tab==="mine"?"You have no liquidations yet.":"Nothing here."}</div>}

      {shown.map(r=>{
        const st=LIQ_STATUS[r.status]||{l:r.status,c:C.muted};
        const isOpen=open===r.id;
        const mine=mineRow(r);
        const canEdit=(mine||isFin)&&["Submitted","Returned"].includes(r.status);
        const canCheck=isFin&&r.status==="Submitted"&&!ownForCheck(r);
        const canReturn=isFin&&["Submitted","Checked"].includes(r.status);
        const canCancel=(isMgr&&["Submitted","Returned","Checked"].includes(r.status))||(mine&&["Submitted","Returned"].includes(r.status));
        return(
          <div key={r.id} style={{background:"#fff",border:`1px solid ${r.status==="Returned"&&mine?"#fecaca":C.line}`,borderRadius:12,padding:"10px 12px",marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",gap:10,flexWrap:"wrap",alignItems:"flex-start"}}>
              <div style={{minWidth:0,flex:"1 1 260px"}}>
                <div style={{fontWeight:800,fontSize:".86rem",color:C.ink}}>
                  <button style={{...linkBtn,color:C.ink,textDecoration:"none"}} onClick={()=>setOpen(isOpen?null:r.id)}>{r.liq_no||"LQ"} · {r.payee}</button>{" "}
                  {chip(st.l,st.c)}
                </div>
                <div style={{fontSize:".72rem",color:C.muted,marginTop:2}}>{r.purpose} · {chargeLabel(r)} · {r.items.length} receipt line{r.items.length!==1?"s":""}{r.requester_name&&r.requester_name!==r.payee?` · by ${r.requester_name}`:""} · {String(r.created_at||"").slice(0,10)}</div>
                {r.status==="Returned"&&r.return_reason&&<div style={{fontSize:".72rem",color:C.bad,marginTop:4,fontWeight:600}}>↩ {r.return_reason}</div>}
                {r.checked_by&&<div style={{fontSize:".68rem",color:C.faint,marginTop:2}}>Checked by {r.checked_by}{r.approved_by?` · approved by ${r.approved_by}`:""}{r.paid_by?` · refilled ${r.paid_date||""} by ${r.paid_by} (${r.paid_ref||"cash sheet"})`:""}</div>}
              </div>
              <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                <b style={{fontSize:".95rem",color:C.ink,fontVariantNumeric:"tabular-nums"}}>{php2(r.amount)}</b>
                {canCheck&&<button disabled={busy} onClick={()=>check(r)} style={btnS(C.ok)}>✓ Checked</button>}
                {canReturn&&<button disabled={busy} onClick={()=>sendBack(r)} style={btnS(C.warn,true)}>Return</button>}
                {canEdit&&<button disabled={busy} onClick={()=>startEdit(r)} style={btnS(C.navy,true)}>{r.status==="Returned"?"Fix & resubmit":"Edit"}</button>}
                {canCancel&&<button disabled={busy} onClick={()=>cancel(r)} style={btnS(C.bad,true)}>Cancel</button>}
                <button onClick={()=>setOpen(isOpen?null:r.id)} style={btnS(C.muted,true)} aria-expanded={isOpen}>{isOpen?"Hide":"Lines"}</button>
              </div>
            </div>
            {isOpen&&(
              <div style={{marginTop:8,borderTop:"1px solid #f1f5f9",paddingTop:6}}>
                {r.items.map((it,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",gap:10,fontSize:".74rem",color:C.muted,padding:"3px 0",flexWrap:"wrap"}}>
                    <span>{it.date||""} · {it.supplier?it.supplier+" · ":""}<span style={{color:C.ink}}>{it.description}</span> · {it.receipt_path?receiptLink(it.receipt_path):<span style={{color:C.warn}}>no receipt: {it.no_receipt}</span>}</span>
                    <span style={{whiteSpace:"nowrap",fontVariantNumeric:"tabular-nums"}}>{php2(it.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {form&&(
        <Modal open title={form.id?"Edit liquidation":"New liquidation"} onClose={()=>!busy&&setForm(null)} wide>
          <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr",gap:10}}>
            <Fld label="Refill to (payee)" required hint={isFin?"Site staff without a login: type their name.":"Usually you."}>
              <Inp value={form.payee} onChange={e=>setF("payee",e.target.value)} readOnly={!isFin}/>
            </Fld>
            <Fld label="What was it for?" required><Inp value={form.purpose} onChange={e=>setF("purpose",e.target.value)} placeholder="e.g. PRF cash purchases 11.10, site meals, pull-out"/></Fld>
            <Fld label="Project" hint="Leave blank if it isn't for a project.">
              <Sel value={form.project_id} onChange={e=>setF("project_id",e.target.value)}>
                <option value="">— not a project —</option>
                {projOpts.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
              </Sel>
            </Fld>
            {!form.project_id&&<Fld label="Charge to" required>
              <Sel value={form.charge_to} onChange={e=>setF("charge_to",e.target.value)}>
                <option value="">— pick —</option>
                {CHARGE_TO.map(c=><option key={c} value={c}>{c}</option>)}
              </Sel>
            </Fld>}
          </div>
          <div style={{fontWeight:700,fontSize:".8rem",margin:"12px 0 6px",color:C.ink}}>Receipts</div>
          {form.items.map((it,i)=>(
            <div key={i} style={{border:`1px solid ${C.line}`,borderRadius:10,padding:"8px 10px",marginBottom:8,display:"grid",gridTemplateColumns:mob?"1fr 1fr":"110px 1fr 1.4fr 110px auto",gap:8,alignItems:"end"}}>
              <Fld label="Date"><Inp type="date" value={it.date} onChange={e=>setLine(i,"date",e.target.value)}/></Fld>
              <Fld label="Store / supplier"><Inp value={it.supplier} onChange={e=>setLine(i,"supplier",e.target.value)}/></Fld>
              <Fld label="What" required><Inp value={it.description} onChange={e=>setLine(i,"description",e.target.value)}/></Fld>
              <Fld label="Amount" required><Inp value={it.amount} onChange={e=>setLine(i,"amount",e.target.value)} placeholder="0.00"/></Fld>
              <button onClick={()=>setForm(f=>({...f,items:f.items.filter((_,j)=>j!==i)}))} disabled={form.items.length<2} title="Remove line" style={{...btnS(C.bad,true),padding:"6px 9px"}}>✕</button>
              <div style={{gridColumn:"1 / -1",display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",fontSize:".74rem"}}>
                {it.receipt_path
                  ?<span style={{color:C.ok,fontWeight:700}}>📎 Receipt attached {receiptLink(it.receipt_path)} <button style={{...linkBtn,color:C.bad}} onClick={()=>setLine(i,"receipt_path","")}>remove</button></span>
                  :<>
                    <label style={{...btnS(C.blue,true),display:"inline-block"}}>📷 Attach receipt<input type="file" accept="image/*,application/pdf" capture="environment" style={{display:"none"}} onChange={e=>upload(i,e.target.files?.[0])}/></label>
                    <span style={{color:C.faint}}>or</span>
                    <input value={it.no_receipt} onChange={e=>setLine(i,"no_receipt",e.target.value)} placeholder="No receipt because… (e.g. jeepney fare)" style={{flex:"1 1 200px",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"6px 9px",fontFamily:"inherit",fontSize:".76rem"}}/>
                  </>}
              </div>
            </div>
          ))}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap",marginTop:4}}>
            <button onClick={()=>setForm(f=>({...f,items:[...f.items,blankLine()]}))} style={btnS(C.navy,true)}>+ Add receipt line</button>
            <div style={{fontSize:".9rem",fontWeight:800,color:C.ink}}>Total {php2(formTotal)}</div>
          </div>
          <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:14}}>
            <button disabled={busy} onClick={()=>setForm(null)} style={btnS(C.muted,true)}>Close</button>
            <button disabled={busy} onClick={saveForm} style={btnS(C.ok)}>{busy?"Saving…":form.id?(form.status==="Returned"?"Resubmit":"Save"):"Submit"}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
