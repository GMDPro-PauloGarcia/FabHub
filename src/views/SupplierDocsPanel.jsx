import React,{useState} from "react";
import {supabase,isSupabaseReady,sbUploadFile,sbGetPublicUrl} from "../supabaseClient";
import {toastEmit,uiPrompt} from "../shared";
import {supplierDocsStatus} from "../core";

// ─── SUPPLIER PAYMENT DOCUMENTS checklist on a bill ───────────────────────────
// Shows what supplierDocsStatus() (src/core.js) finds on file, lets Finance
// upload the supplier invoice copy, and lets a Manager override a bill with a
// reason (override_supplier_docs RPC → audit_log). The database refuses a
// payment on a gated bill until every item is ticked and the due date is
// reached (migration 20261104090000_supplier_payment_docs.sql).

export default function SupplierDocsPanel({bill,ctx,role,sendTelegramNotification,onChanged}){
  const[busy,setBusy]=useState(false);
  if(!bill||!bill.id||(bill.category||"")!=="Supplier") return null;
  const s=supplierDocsStatus(bill,ctx);
  const done=s.items.filter(i=>i.ok).length;
  const head=s.overridden?"Overridden by a Manager":s.applies?(s.ok?"Complete — can be paid":`${done}/${s.items.length} on file — payment blocked`):"Not required (bill created before Nov 9)";
  const tone=s.overridden?"#7c3aed":!s.applies?"#64748b":s.ok?"#047857":"#b45309";

  const upload=async e=>{
    const file=e.target.files&&e.target.files[0]; e.target.value="";
    if(!file) return;
    if(!isSupabaseReady()){toastEmit("No connection — can't upload the invoice now.","error");return;}
    setBusy(true);
    const path=await sbUploadFile(`payables/${bill.id}`,file);
    if(!path){setBusy(false);toastEmit("Upload failed — try again.","error");return;}
    const{error}=await supabase.from("payables").update({invoice_doc_path:path}).eq("id",bill.id);
    setBusy(false);
    if(error){toastEmit("⚠ Invoice uploaded but not saved on the bill: "+error.message,"error",9000);return;}
    toastEmit("Invoice copy saved.","success");
    onChanged&&onChanged({invoice_doc_path:path});
  };
  const override=async()=>{
    const reason=await uiPrompt({title:"Override payment documents",message:`Why can ${bill.vendor||"this supplier"} be paid without the missing documents${s.dueDate?" or before the due date":""}? This is logged and sent to Cost Control.`,confirmLabel:"Override"});
    if(reason==null) return;
    setBusy(true);
    const{error}=await supabase.rpc("override_supplier_docs",{p_payable:bill.id,p_reason:reason});
    setBusy(false);
    if(error){toastEmit("⚠ "+error.message,"error",9000);return;}
    sendTelegramNotification&&sendTelegramNotification("financialcontrol",
      `⚠️ <b>Supplier docs overridden</b>\n${bill.apNumber||""} ${bill.vendor||""} — ₱${Number(bill.amount||0).toLocaleString("en-PH")}\nMissing: ${s.missing.join(", ")||"none (paid before due date)"}\nReason: ${reason}`);
    toastEmit("Override recorded — this bill can be paid.","success");
    onChanged&&onChanged({docs_override_at:new Date().toISOString(),docs_override_reason:reason});
  };

  return(
    <div style={{border:`1.5px solid ${tone}55`,borderRadius:8,padding:"10px 12px",marginBottom:12,background:"#FAFBFD"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:6}}>
        <div style={{fontWeight:700,fontSize:".8rem",color:"#0f172a"}}>📎 Payment documents</div>
        <span style={{fontSize:".7rem",fontWeight:700,color:tone}}>{head}</span>
      </div>
      {s.items.map(i=>(
        <div key={i.key} style={{display:"flex",gap:8,fontSize:".76rem",padding:"3px 0",alignItems:"baseline"}}>
          <span style={{color:i.ok?"#047857":"#b91c1c",fontWeight:700,width:14}}>{i.ok?"✓":"✗"}</span>
          <span style={{fontWeight:600,color:"#0f172a",minWidth:120}}>{i.label}</span>
          <span style={{color:"#64748b"}}>{i.detail}</span>
          {i.key==="invdoc"&&bill.invoice_doc_path&&<a href={sbGetPublicUrl(bill.invoice_doc_path)||"#"} target="_blank" rel="noreferrer" style={{fontSize:".72rem"}}>View</a>}
        </div>
      ))}
      <div style={{fontSize:".74rem",color:"#475569",marginTop:4}}>Due: <b>{s.dueDate||"— (set the invoice date)"}</b>{s.terms?` · ${s.terms} terms`:s.dueDate?" · due on the invoice date (no terms on the PO)":""}</div>
      {s.overridden&&bill.docs_override_reason&&<div style={{fontSize:".72rem",color:"#7c3aed",marginTop:4}}>Override reason: {bill.docs_override_reason}</div>}
      <div style={{display:"flex",gap:8,marginTop:8,flexWrap:"wrap"}}>
        <label style={{display:"inline-block",background:"#eff6ff",color:"#1d4ed8",border:"1.5px solid #bfdbfe",borderRadius:7,padding:"5px 12px",fontSize:".74rem",fontWeight:700,cursor:busy?"wait":"pointer"}}>
          {bill.invoice_doc_path?"Replace invoice copy":"Upload invoice copy"}
          <input type="file" accept="image/*,application/pdf" onChange={upload} disabled={busy} style={{display:"none"}}/>
        </label>
        {role==="Manager"&&s.applies&&!s.ok&&<button type="button" disabled={busy} onClick={override} style={{background:"#f5f3ff",color:"#6d28d9",border:"1.5px solid #ddd6fe",borderRadius:7,padding:"5px 12px",fontSize:".74rem",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Manager override…</button>}
        {role==="Manager"&&s.applies&&s.ok&&s.dueDate&&<button type="button" disabled={busy} onClick={override} style={{background:"#fff",color:"#6d28d9",border:"1.5px solid #ddd6fe",borderRadius:7,padding:"5px 12px",fontSize:".74rem",fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Allow early payment…</button>}
      </div>
      {s.items.find(i=>i.key==="dr"&&!i.ok)&&<div style={{fontSize:".7rem",color:"#64748b",marginTop:6}}>Warehouse (Renz / Crizza) logs the DR on Procurement › Deliveries against PO {bill.poNumber||"—"}.</div>}
    </div>
  );
}
