import React from "react";
import {fmt,today,BANKS,KPI,Modal,uiConfirm} from "../shared";
// ─── LIQUIDATION VIEW ─────────────────────────────────────────────────────────
function LiquidationView({evouchers,addEV,updateEV,deleteEV,addEVItem,updateEVItem,deleteEVItem,submitEV,markEVPaid,wonDeals,session,role,today,fmt,BANKS,isMobile}){
  const[collapsed,setCollapsed]=React.useState(new Set());
  const[expandedItems,setExpandedItems]=React.useState(new Set());
  const[showForm,setShowForm]=React.useState(false);
  const[showPay,setShowPay]=React.useState(null);
  const[editEV,setEditEV]=React.useState(null);
  const[payBank,setPayBank]=React.useState("");
  const[payRef,setPayRef]=React.useState("");
  const[evSearch,setEvSearch]=React.useState("");
  const[csvErr,setCsvErr]=React.useState("");
  const[newItem,setNewItem]=React.useState({itemDate:today,supplier:"",project:"",description:"",qty:"1",pricePerQty:"",tin:"",remarks:""});
  const[addingItemFor,setAddingItemFor]=React.useState(null);

  const STATUSES=["Draft","For Payment","Paid","Cancelled"];
  const STATUS_CLR={Draft:"#6366f1","For Payment":"#f59e0b",Paid:"#059669",Cancelled:"#dc2626"};
  const STATUS_DOT={Draft:"#6366f1","For Payment":"#f59e0b",Paid:"#059669",Cancelled:"#dc2626"};
  const CHARGE_TYPES=["Project","OPEX","CapEx","Admin","Other"];
  const projList=wonDeals.map(d=>d.contact||d.project||d.client||"").filter(Boolean);

  const blankForm={department:"",payee:"",date:today,bank:"",notes:"",mrfBrfDate:"",bankBeginningBalance:""};
  const[form,setForm]=React.useState(blankForm);
  const fld=(k,v)=>setForm(f=>({...f,[k]:v}));
  const ni=(k,v)=>setNewItem(i=>({...i,[k]:v}));

  const toggleGroup=key=>setCollapsed(s=>{const n=new Set(s);n.has(key)?n.delete(key):n.add(key);return n;});
  const toggleItems=id=>setExpandedItems(s=>{const n=new Set(s);n.has(id)?n.delete(id):n.add(id);return n;});

  const q=evSearch.toLowerCase();
  const EV_GROUPS=STATUSES.map(st=>({
    key:st,
    label:st,
    dot:STATUS_DOT[st],
    clr:STATUS_CLR[st],
    items:evouchers.filter(e=>e.status===st&&(!q||(e.evNo||"").toLowerCase().includes(q)||(e.payee||"").toLowerCase().includes(q)||(e.department||"").toLowerCase().includes(q))),
  }));

  const openEdit=(ev)=>{setEditEV(ev.id);setForm({department:ev.department||"",payee:ev.payee||"",date:ev.date||today,bank:ev.bank||"",notes:ev.notes||"",mrfBrfDate:ev.mrfBrfDate||"",bankBeginningBalance:ev.bankBeginningBalance||""});setShowForm(true);};
  const saveForm=()=>{
    if(editEV){updateEV(editEV,{department:form.department,payee:form.payee,date:form.date,bank:form.bank,notes:form.notes,mrfBrfDate:form.mrfBrfDate,bankBeginningBalance:form.bankBeginningBalance});}
    else addEV({...form,items:[]});
    setEditEV(null);setForm(blankForm);setShowForm(false);
  };

  const doAddItem=(evId)=>{
    if(!newItem.description)return;
    const qty=Number(String(newItem.qty||1).replace(/,/g,""))||1;
    const price=Number(String(newItem.pricePerQty||0).replace(/,/g,""))||0;
    const amount=qty*price;
    if(!amount)return;
    addEVItem(evId,{...newItem,id:Math.random().toString(36).slice(2),qty,pricePerQty:price,amount});
    setNewItem({itemDate:today,supplier:"",project:"",description:"",qty:"1",pricePerQty:"",tin:"",remarks:""});
    setAddingItemFor(null);
  };

  const printEV=(ev)=>{
    const total=(ev.items||[]).reduce((s,i)=>s+Number(i.amount||0),0);
    const beg=Number(String(ev.bankBeginningBalance||0).replace(/,/g,""))||0;
    const ending=beg-total;
    const unliq=beg>0?Math.max(0,beg-total-Math.max(0,ending)):0;
    const fmtA=(v)=>Number(v||0).toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2});
    const fmtD=(d)=>d?new Date(d+"T12:00:00").toLocaleDateString("en-PH",{year:"numeric",month:"long",day:"numeric"}):"";
    const fmtDShort=(d)=>d?new Date(d+"T12:00:00").toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"}):"";
    const rows=(ev.items||[]).map(item=>`
      <tr>
        <td>${fmtDShort(item.itemDate||ev.date)}</td>
        <td>${item.supplier||""}</td>
        <td>${item.project||""}</td>
        <td>${item.description||""}</td>
        <td style="text-align:center">${item.qty!=null?Number(item.qty).toLocaleString("en-PH",{maximumFractionDigits:2}):""}</td>
        <td style="text-align:right">₱${fmtA(item.pricePerQty)}</td>
        <td style="text-align:center">${item.tin||""}</td>
        <td style="text-align:right">₱&nbsp;${fmtA(item.amount)}</td>
        <td>${item.remarks||""}</td>
      </tr>`).join("");
    const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>PRF Liquidation — ${ev.lqNo||ev.evNo}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:Arial,Helvetica,sans-serif;font-size:8.5pt;color:#000;background:#fff;padding:10px;}
.wrap{max-width:960px;margin:0 auto;}
.form-title{background:#ffff00;text-align:center;font-weight:bold;font-size:11pt;padding:5px 0;border:1px solid #bbb;letter-spacing:3px;margin-bottom:3px;}
.logo-title{display:grid;grid-template-columns:140px 1fr;gap:0;margin-bottom:3px;align-items:stretch;}
.logo-cell{display:flex;align-items:center;justify-content:center;padding:4px 8px;border:1px solid #bbb;}
.logo-txt{font-weight:900;font-size:16pt;color:#c55a11;line-height:1.1;}
.logo-sub{font-size:8pt;color:#888;font-weight:400;}
.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid #bbb;margin-bottom:6px;}
.info-left,.info-right{border-right:none;}
.info-right{border-left:1px solid #bbb;}
.info-row{display:flex;border-bottom:1px solid #ddd;min-height:22px;}
.info-row:last-child{border-bottom:none;}
.lbl{font-weight:bold;font-size:7.5pt;padding:3px 7px;min-width:155px;background:#f5f5f5;border-right:1px solid #ddd;display:flex;align-items:center;}
.val{padding:3px 8px;flex:1;display:flex;align-items:center;font-size:8pt;}
.amt{font-weight:bold;padding:3px 10px;text-align:right;min-width:95px;display:flex;align-items:center;justify-content:flex-end;font-size:8pt;}
.amt.orange{color:#c55a11;}
.amt.yellow{background:#ffff00;}
table{width:100%;border-collapse:collapse;}
th{background:#1e1e1e;color:#fff;padding:4px 5px;font-size:7.5pt;text-align:center;border:1px solid #555;white-space:nowrap;}
td{padding:3px 5px;font-size:8pt;border:1px solid #ccc;vertical-align:middle;}
tr:nth-child(even) td{background:#f9f9f9;}
.total-row td{font-weight:bold;background:#fff2cc;border-top:2px solid #999;}
@media print{body{padding:0;}@page{margin:0.8cm;size:A4 landscape;}}
</style></head><body><div class="wrap">
<div class="logo-title">
  <div class="logo-cell"><div><div class="logo-txt">GMD</div><div class="logo-sub">PRO</div></div></div>
  <div class="form-title" style="display:flex;align-items:center;justify-content:center;">PRF LIQUIDATION FORM</div>
</div>
<div class="info-grid">
  <div class="info-left">
    <div class="info-row"><div class="lbl">REQUESTOR NAME</div><div class="val">${ev.payee||""}</div></div>
    <div class="info-row"><div class="lbl">DATE LIQUIDATED</div><div class="val">${fmtD(ev.date)}</div></div>
    <div class="info-row"><div class="lbl">MRF / BRF DATE REQUEST</div><div class="val">${fmtD(ev.mrfBrfDate)}</div></div>
    <div class="info-row"><div class="lbl">MRF LIQUIDATION NO.</div><div class="val"><strong>${ev.lqNo||ev.evNo||""}</strong></div></div>
  </div>
  <div class="info-right">
    <div class="info-row"><div class="lbl" style="flex:1">BANK BEGINNING BALANCE</div><div class="amt">${fmtA(beg)}</div></div>
    <div class="info-row"><div class="lbl" style="flex:1">TOTAL ACTUAL AMOUNT LIQUIDATED</div><div class="amt orange">${fmtA(total)}</div></div>
    <div class="info-row"><div class="lbl" style="flex:1">BANK ENDING BALANCE</div><div class="amt yellow">${fmtA(ending)}</div></div>
    <div class="info-row"><div class="lbl" style="flex:1">UN LIQUIDATED</div><div class="amt">${fmtA(unliq)}</div></div>
  </div>
</div>
<table>
  <thead><tr>
    <th style="width:7%">DATE</th>
    <th style="width:13%">SUPPLIER</th>
    <th style="width:13%">PROJECT NAME</th>
    <th style="width:24%">PARTICULARS</th>
    <th style="width:4%">QTY</th>
    <th style="width:10%">PRICE PER QTY</th>
    <th style="width:6%">TIN</th>
    <th style="width:10%">TOTAL AMOUNT</th>
    <th style="width:13%">REMARKS</th>
  </tr></thead>
  <tbody>${rows}</tbody>
  <tfoot><tr class="total-row">
    <td colspan="7" style="text-align:right;font-size:8pt;">TOTAL ACTUAL AMOUNT LIQUIDATED</td>
    <td style="text-align:right">₱&nbsp;${fmtA(total)}</td>
    <td></td>
  </tr></tfoot>
</table>
</div></body></html>`;
    const w=window.open("","_blank","width=1100,height=750");
    if(w){w.document.write(html);w.document.close();setTimeout(()=>w.print(),500);}
  };

  const handleCSV=(evId,text)=>{
    setCsvErr("");
    try{
      const lines=text.trim().split(/\r?\n/).filter(l=>l.trim());
      if(!lines.length)return;
      const header=lines[0].split(",").map(h=>h.trim().toLowerCase());
      const col=n=>header.indexOf(n);
      lines.slice(1).map(l=>{
        const cells=l.split(",").map(c=>c.trim().replace(/^"|"$/g,""));
        return{project:cells[col("project")]||"",chargeTo:cells[col("charge")]||cells[col("chargeto")]||cells[col("charge to")]||"",category:cells[col("category")]||"",description:cells[col("description")]||"",amount:cells[col("amount")]||"0"};
      }).filter(r=>r.description).forEach(r=>addEVItem(evId,{...r,id:Math.random().toString(36).slice(2)}));
    }catch(e){setCsvErr("CSV parse error: "+e.message);}
  };

  const totByStatus=s=>evouchers.filter(e=>e.status===s).reduce((a,e)=>a+(e.items||[]).reduce((ss,i)=>ss+Number(i.amount||0),0),0);

  return(
    <div style={{maxWidth:1000,margin:"0 auto"}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20,flexWrap:"wrap",gap:10}}>
        <div>
          <div style={{fontWeight:800,color:"#0f172a",fontSize:"1.1rem"}}>🧾 Liquidation Reports</div>
          <div style={{fontSize:".82rem",color:"#64748b"}}>Expense vouchers — one bank debit per voucher for easy reconciliation.</div>
        </div>
        {(role==="Accounting"||role==="Finance"||role==="Manager")&&<button onClick={()=>{setEditEV(null);setForm(blankForm);setShowForm(true);}} style={{background:"#7c3aed",border:"none",borderRadius:9,padding:"9px 18px",color:"#fff",fontFamily:"inherit",fontWeight:700,fontSize:".85rem",cursor:"pointer"}}>+ New EV</button>}
      </div>

      {/* KPI strip */}
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)",gap:10,marginBottom:16}}>
        {[
          {label:"Total EVs",     val:evouchers.length,     sub:"All time",            clr:"#6366f1"},
          {label:"For Payment",   val:fmt(totByStatus("For Payment")),   sub:evouchers.filter(e=>e.status==="For Payment").length+" vouchers",  clr:"#f59e0b"},
          {label:"Draft",         val:fmt(totByStatus("Draft")),         sub:evouchers.filter(e=>e.status==="Draft").length+" vouchers",        clr:"#6366f1"},
          {label:"Paid This Month",val:fmt(totByStatus("Paid")),         sub:evouchers.filter(e=>e.status==="Paid").length+" vouchers",         clr:"#059669"},
        ].map(({label,val,sub,clr})=>(
          <div key={label} style={{background:"#fff",borderRadius:10,padding:"12px 14px",border:"1.5px solid #e2e8f0",textAlign:"center"}}>
            <div style={{fontWeight:800,fontSize:"1rem",color:clr,marginBottom:2}}>{val}</div>
            <div style={{fontSize:".7rem",textTransform:"uppercase",letterSpacing:".5px",color:"#94a3b8"}}>{label}</div>
            <div style={{fontSize:".72rem",color:"#64748b",marginTop:2}}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div style={{marginBottom:14}}>
        <input value={evSearch} onChange={e=>setEvSearch(e.target.value)} placeholder="Search EV number, payee, or department…" style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"8px 12px",fontFamily:"inherit",fontSize:".82rem",boxSizing:"border-box"}}/>
      </div>

      {/* Kanban groups */}
      {EV_GROUPS.map(g=>{
        const isOpen=!collapsed.has(g.key);
        const total=g.items.reduce((a,e)=>a+(e.items||[]).reduce((ss,i)=>ss+Number(i.amount||0),0),0);
        return(
          <div key={g.key} style={{marginBottom:10,border:"1.5px solid #e2e8f0",borderRadius:12,overflow:"hidden",background:"#fff"}}>
            <div onClick={()=>toggleGroup(g.key)} style={{display:"flex",alignItems:"center",gap:10,padding:"11px 16px",cursor:"pointer",borderBottom:isOpen?"1px solid #f1f5f9":"none"}}>
              <div style={{width:10,height:10,borderRadius:"50%",background:g.dot,flexShrink:0}}/>
              <div style={{fontWeight:700,fontSize:".82rem",color:g.clr}}>{g.label}</div>
              <div style={{background:"#f1f5f9",borderRadius:20,padding:"1px 8px",fontSize:".72rem",fontWeight:700,color:"#64748b"}}>{g.items.length}</div>
              {total>0&&<div style={{marginLeft:"auto",fontWeight:700,fontSize:".8rem",color:"#0f172a"}}>{fmt(total)}</div>}
              <div style={{color:"#cbd5e1",fontSize:".75rem",marginLeft:total>0?6:"auto"}}>{isOpen?"▲":"▼"}</div>
            </div>
            {isOpen&&(
              g.items.length===0
                ?<div style={{padding:"20px",textAlign:"center",color:"#94a3b8",fontSize:".8rem"}}>No {g.label.toLowerCase()} vouchers.</div>
                :<div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:".8rem"}}>
                    <thead>
                      <tr style={{background:"#f8fafc"}}>
                        {["EV No","Payee / Dept","Bank","Date","Items","Total",""].map((h,i)=>(
                          <th key={i} style={{padding:"7px 14px",textAlign:i===5?"right":"left",fontWeight:600,color:"#94a3b8",fontSize:".68rem",textTransform:"uppercase",letterSpacing:".5px",whiteSpace:"nowrap"}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {g.items.map((ev,idx)=>{
                        const total=(ev.items||[]).reduce((s,i)=>s+Number(i.amount||0),0);
                        const bank=BANKS?.find(b=>b.id===ev.bank);
                        const isItemsOpen=expandedItems.has(ev.id);
                        const isAddingItem=addingItemFor===ev.id;
                        const canEdit=(role==="Accounting"||role==="Manager")&&ev.status==="Draft";
                        return(
                          <React.Fragment key={ev.id}>
                            <tr style={{borderBottom:(!isItemsOpen&&!isAddingItem&&idx<g.items.length-1)?"1px solid #f8fafc":"none"}}
                              onMouseEnter={ev2=>ev2.currentTarget.style.background="#fafafa"} onMouseLeave={ev2=>ev2.currentTarget.style.background=""}>
                              <td style={{padding:"9px 14px",fontFamily:"monospace",fontSize:".75rem",fontWeight:700,color:"#7c3aed",whiteSpace:"nowrap"}}>{ev.evNo||"EV-????"}</td>
                              <td style={{padding:"9px 14px"}}>
                                <div style={{fontWeight:600,color:"#0f172a",fontSize:".82rem"}}>{ev.payee||ev.department||"—"}</div>
                                <div style={{fontSize:".7rem",color:"#94a3b8"}}>{ev.payee&&ev.department?ev.department:""}</div>
                              </td>
                              <td style={{padding:"9px 14px",fontSize:".78rem",color:"#0369a1",whiteSpace:"nowrap"}}>{bank?.short||ev.bank||"—"}</td>
                              <td style={{padding:"9px 14px",fontFamily:"monospace",fontSize:".73rem",color:"#64748b",whiteSpace:"nowrap"}}>{ev.date||"—"}</td>
                              <td style={{padding:"9px 14px"}}>
                                <button onClick={()=>toggleItems(ev.id)} style={{background:"#f1f5f9",border:"none",borderRadius:5,padding:"3px 8px",fontSize:".7rem",fontWeight:700,color:"#475569",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                                  {(ev.items||[]).length} item{(ev.items||[]).length!==1?"s":""} {isItemsOpen?"▲":"▼"}
                                </button>
                              </td>
                              <td style={{padding:"9px 14px",textAlign:"right",fontWeight:800,color:"#7c3aed",fontFamily:"monospace",whiteSpace:"nowrap"}}>{fmt(total)}</td>
                              <td style={{padding:"9px 14px"}}>
                                <div style={{display:"flex",gap:4,justifyContent:"flex-end",flexWrap:"wrap"}}>
                                  {canEdit&&<button onClick={()=>openEdit(ev)} style={{background:"#f1f5f9",border:"none",borderRadius:5,padding:"3px 7px",fontSize:".65rem",color:"#475569",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>✏ Edit</button>}
                                  {canEdit&&<button onClick={()=>{
                                    // Reset the draft whenever this opens — otherwise a half-typed item
                                    // for another voucher (still in state from switching targets without
                                    // saving) attaches to the wrong voucher on Add.
                                    if(!isAddingItem)setNewItem({itemDate:today,supplier:"",project:"",description:"",qty:"1",pricePerQty:"",tin:"",remarks:""});
                                    setAddingItemFor(isAddingItem?null:ev.id);
                                    if(!isItemsOpen)setExpandedItems(s=>{const n=new Set(s);n.add(ev.id);return n;});
                                  }} style={{background:"#f5f3ff",border:"none",borderRadius:5,padding:"3px 7px",fontSize:".65rem",color:"#7c3aed",cursor:"pointer",fontFamily:"inherit",fontWeight:700,whiteSpace:"nowrap"}}>+ Item</button>}
                                  {(role==="Accounting"||role==="Manager")&&ev.status==="Draft"&&<button onClick={async ()=>{if((await uiConfirm("Submit for payment?")))submitEV(ev.id);}} style={{background:"#fffbeb",border:"none",borderRadius:5,padding:"3px 7px",fontSize:".65rem",color:"#b45309",cursor:"pointer",fontFamily:"inherit",fontWeight:700,whiteSpace:"nowrap"}}>→ Submit</button>}
                                  {(role==="Finance"||role==="Manager")&&ev.status==="For Payment"&&<button onClick={()=>{setShowPay(ev.id);setPayBank(ev.bank||"");setPayRef("");}} style={{background:"#f0fdf4",border:"none",borderRadius:5,padding:"3px 7px",fontSize:".65rem",color:"#166534",cursor:"pointer",fontFamily:"inherit",fontWeight:700,whiteSpace:"nowrap"}}>✅ Paid</button>}
                                  {(role==="Accounting"||role==="Manager")&&ev.status==="Draft"&&<button onClick={async ()=>{if((await uiConfirm("Void this EV?")))updateEV(ev.id,{status:"Cancelled"});}} style={{background:"#fef2f2",border:"none",borderRadius:5,padding:"3px 7px",fontSize:".65rem",color:"#dc2626",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>Void</button>}
                                  {ev.status==="Paid"&&<span style={{fontSize:".65rem",color:"#059669",fontWeight:600,whiteSpace:"nowrap"}}>✅ {ev.paidRef||""}</span>}
                                  <button onClick={()=>printEV(ev)} style={{background:"#f0f9ff",border:"1px solid #bae6fd",borderRadius:5,padding:"3px 7px",fontSize:".65rem",color:"#0369a1",cursor:"pointer",fontFamily:"inherit",fontWeight:700,whiteSpace:"nowrap"}}>🖨 Print</button>
                                </div>
                              </td>
                            </tr>
                            {/* Expanded line items */}
                            {isItemsOpen&&(
                              <tr>
                                <td colSpan={7} style={{padding:0,background:"#f8fafc",borderBottom:idx<g.items.length-1?"1px solid #e2e8f0":"none"}}>
                                  <div style={{padding:"0 0 0 28px"}}>
                                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:".78rem"}}>
                                      <thead>
                                        <tr style={{background:"#f1f5f9"}}>
                                          <th style={{padding:"5px 8px",textAlign:"center",fontWeight:600,color:"#94a3b8",fontSize:".64rem",textTransform:"uppercase"}}>#</th>
                                          <th style={{padding:"5px 8px",fontWeight:600,color:"#94a3b8",fontSize:".64rem",textTransform:"uppercase"}}>Date</th>
                                          <th style={{padding:"5px 8px",fontWeight:600,color:"#94a3b8",fontSize:".64rem",textTransform:"uppercase"}}>Supplier</th>
                                          <th style={{padding:"5px 8px",fontWeight:600,color:"#94a3b8",fontSize:".64rem",textTransform:"uppercase"}}>Project</th>
                                          <th style={{padding:"5px 8px",fontWeight:600,color:"#94a3b8",fontSize:".64rem",textTransform:"uppercase"}}>Particulars</th>
                                          <th style={{padding:"5px 8px",textAlign:"center",fontWeight:600,color:"#94a3b8",fontSize:".64rem",textTransform:"uppercase"}}>Qty</th>
                                          <th style={{padding:"5px 8px",textAlign:"right",fontWeight:600,color:"#94a3b8",fontSize:".64rem",textTransform:"uppercase"}}>Price/Qty</th>
                                          <th style={{padding:"5px 8px",textAlign:"center",fontWeight:600,color:"#94a3b8",fontSize:".64rem",textTransform:"uppercase"}}>TIN</th>
                                          <th style={{padding:"5px 8px",textAlign:"right",fontWeight:600,color:"#94a3b8",fontSize:".64rem",textTransform:"uppercase"}}>Total</th>
                                          <th style={{padding:"5px 8px",fontWeight:600,color:"#94a3b8",fontSize:".64rem",textTransform:"uppercase"}}>Remarks</th>
                                          {canEdit&&<th style={{padding:"5px 8px"}}></th>}
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {(ev.items||[]).map((item,ii)=>(
                                          <tr key={item.id||ii} style={{borderBottom:"1px solid #e2e8f0"}}>
                                            <td style={{padding:"5px 8px",color:"#94a3b8",textAlign:"center",fontSize:".72rem"}}>{ii+1}</td>
                                            <td style={{padding:"5px 8px",color:"#64748b",fontSize:".72rem",whiteSpace:"nowrap"}}>{item.itemDate||ev.date||"—"}</td>
                                            <td style={{padding:"5px 8px",color:"#334155",fontSize:".78rem"}}>{item.supplier||"—"}</td>
                                            <td style={{padding:"5px 8px",color:"#334155",fontSize:".78rem"}}>{item.project||"—"}</td>
                                            <td style={{padding:"5px 8px",color:"#0f172a",fontWeight:500,fontSize:".78rem"}}>{item.description}</td>
                                            <td style={{padding:"5px 8px",textAlign:"center",fontSize:".78rem"}}>{item.qty!=null?Number(item.qty).toLocaleString("en-PH",{maximumFractionDigits:2}):""}</td>
                                            <td style={{padding:"5px 8px",textAlign:"right",fontSize:".78rem",color:"#475569"}}>{item.pricePerQty!=null?"₱"+Number(item.pricePerQty).toLocaleString("en-PH",{minimumFractionDigits:2}):""}</td>
                                            <td style={{padding:"5px 8px",textAlign:"center",fontSize:".72rem",color:"#64748b"}}>{item.tin||""}</td>
                                            <td style={{padding:"5px 8px",textAlign:"right",fontWeight:700,color:"#7c3aed",fontFamily:"monospace",fontSize:".78rem"}}>{fmt(Number(item.amount||0))}</td>
                                            <td style={{padding:"5px 8px",fontSize:".72rem",color:"#64748b"}}>{item.remarks||""}</td>
                                            {canEdit&&<td style={{padding:"5px 8px"}}><button onClick={()=>deleteEVItem(ev.id,item.id)} style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:".78rem",padding:"2px 5px"}}>✕</button></td>}
                                          </tr>
                                        ))}
                                      </tbody>
                                      <tfoot>
                                        <tr style={{background:"#eff6ff"}}>
                                          <td colSpan={9} style={{padding:"7px 12px",fontWeight:700,color:"#1d4ed8",textAlign:"right",fontSize:".78rem"}}>
                                            🏦 1 bank debit from {bank?.name||ev.bank||"—"} covers all {(ev.items||[]).length} items
                                          </td>
                                          <td style={{padding:"7px 12px",textAlign:"right",fontWeight:800,color:"#7c3aed",fontFamily:"monospace"}}>{fmt(total)}</td>
                                          {canEdit&&<td/>}
                                        </tr>
                                      </tfoot>
                                    </table>
                                  </div>
                                </td>
                              </tr>
                            )}
                            {/* Add item inline form */}
                            {isAddingItem&&(
                              <tr>
                                <td colSpan={7} style={{padding:"10px 16px",background:"#faf5ff",borderBottom:idx<g.items.length-1?"1px solid #e2e8f0":"none"}}>
                                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(110px,1fr))",gap:5,marginBottom:6}}>
                                    <input type="date" value={newItem.itemDate} onChange={e=>ni("itemDate",e.target.value)} style={{padding:"6px 8px",border:"1.5px solid #e2e8f0",borderRadius:6,fontSize:".78rem",fontFamily:"inherit"}}/>
                                    <input value={newItem.supplier} onChange={e=>ni("supplier",e.target.value)} placeholder="Supplier" style={{padding:"6px 8px",border:"1.5px solid #e2e8f0",borderRadius:6,fontSize:".78rem",fontFamily:"inherit"}}/>
                                    <select value={newItem.project} onChange={e=>ni("project",e.target.value)} style={{padding:"6px 8px",border:"1.5px solid #e2e8f0",borderRadius:6,fontSize:".78rem",fontFamily:"inherit",background:"#fff"}}>
                                      <option value="">Project</option>
                                      {projList.map((p,i)=><option key={i} value={p}>{p}</option>)}
                                    </select>
                                    <input value={newItem.description} onChange={e=>ni("description",e.target.value)} placeholder="Particulars *" style={{padding:"6px 8px",border:"1.5px solid #e2e8f0",borderRadius:6,fontSize:".78rem",fontFamily:"inherit",gridColumn:"span 2"}}/>
                                    <input type="number" value={newItem.qty} onChange={e=>ni("qty",e.target.value)} placeholder="Qty" style={{padding:"6px 8px",border:"1.5px solid #e2e8f0",borderRadius:6,fontSize:".78rem",fontFamily:"inherit"}}/>
                                    <input type="number" value={newItem.pricePerQty} onChange={e=>ni("pricePerQty",e.target.value)} placeholder="Price/Qty *" style={{padding:"6px 8px",border:"1.5px solid #e2e8f0",borderRadius:6,fontSize:".78rem",fontFamily:"inherit"}}/>
                                    <input value={newItem.tin} onChange={e=>ni("tin",e.target.value)} placeholder="TIN" style={{padding:"6px 8px",border:"1.5px solid #e2e8f0",borderRadius:6,fontSize:".78rem",fontFamily:"inherit"}}/>
                                    <input value={newItem.remarks} onChange={e=>ni("remarks",e.target.value)} placeholder="Remarks" style={{padding:"6px 8px",border:"1.5px solid #e2e8f0",borderRadius:6,fontSize:".78rem",fontFamily:"inherit"}}/>
                                  </div>
                                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                                    <button onClick={()=>doAddItem(ev.id)} style={{background:"#7c3aed",border:"none",borderRadius:6,padding:"6px 14px",color:"#fff",fontFamily:"inherit",fontWeight:700,fontSize:".78rem",cursor:"pointer"}}>Add Item</button>
                                    <button onClick={()=>setAddingItemFor(null)} style={{background:"#f1f5f9",border:"none",borderRadius:6,padding:"6px 10px",fontFamily:"inherit",fontSize:".78rem",cursor:"pointer",color:"#64748b"}}>Cancel</button>
                                    <label style={{fontSize:".75rem",color:"#7c3aed",cursor:"pointer",fontWeight:600}}>
                                      📎 CSV
                                      <input type="file" accept=".csv" style={{display:"none"}} onChange={e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev2=>handleCSV(ev.id,ev2.target.result);r.readAsText(f);e.target.value="";}}/>
                                    </label>
                                    {csvErr&&<span style={{color:"#ef4444",fontSize:".72rem"}}>{csvErr}</span>}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
            )}
          </div>
        );
      })}

      {evouchers.length===0&&(
        <div style={{textAlign:"center",padding:"60px 0",color:"#94a3b8",fontSize:".9rem"}}>
          <div style={{fontSize:"2.5rem",marginBottom:10}}>🧾</div>
          <div>No expense vouchers yet.</div>
          {(role==="Accounting"||role==="Manager")&&<div style={{marginTop:8,fontSize:".8rem"}}>Click <strong>+ New EV</strong> to create one.</div>}
        </div>
      )}

      {/* New/Edit EV Modal */}
      {showForm&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.45)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{background:"#fff",borderRadius:16,padding:28,width:"100%",maxWidth:520,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,.25)"}}>
            <div style={{fontWeight:800,color:"#0f172a",fontSize:"1rem",marginBottom:18}}>{editEV?"✏️ Edit EV Header":"🧾 New Expense Voucher"}</div>
            <div style={{marginBottom:10}}>
              <div style={{fontSize:".78rem",fontWeight:600,color:"#475569",marginBottom:4}}>Department</div>
              <input value={form.department} onChange={e=>fld("department",e.target.value)} placeholder="e.g. Procurement, Operations" style={{width:"100%",padding:"9px 12px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:".85rem",fontFamily:"inherit",boxSizing:"border-box"}}/>
            </div>
            <div style={{marginBottom:10}}>
              <div style={{fontSize:".78rem",fontWeight:600,color:"#475569",marginBottom:4}}>Payee / Requestor</div>
              <input value={form.payee} onChange={e=>fld("payee",e.target.value)} placeholder="Name of payee or department head" style={{width:"100%",padding:"9px 12px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:".85rem",fontFamily:"inherit",boxSizing:"border-box"}}/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              <div>
                <div style={{fontSize:".78rem",fontWeight:600,color:"#475569",marginBottom:4}}>Date Liquidated</div>
                <input type="date" value={form.date} onChange={e=>fld("date",e.target.value)} style={{width:"100%",padding:"9px 12px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:".85rem",fontFamily:"inherit",boxSizing:"border-box"}}/>
              </div>
              <div>
                <div style={{fontSize:".78rem",fontWeight:600,color:"#475569",marginBottom:4}}>MRF / BRF Date Request</div>
                <input type="date" value={form.mrfBrfDate} onChange={e=>fld("mrfBrfDate",e.target.value)} style={{width:"100%",padding:"9px 12px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:".85rem",fontFamily:"inherit",boxSizing:"border-box"}}/>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              <div>
                <div style={{fontSize:".78rem",fontWeight:600,color:"#475569",marginBottom:4}}>Bank Account</div>
                <select value={form.bank} onChange={e=>fld("bank",e.target.value)} style={{width:"100%",padding:"9px 12px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:".85rem",fontFamily:"inherit",background:"#fff",boxSizing:"border-box"}}>
                  <option value="">Select bank…</option>
                  {(BANKS||[]).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <div style={{fontSize:".78rem",fontWeight:600,color:"#475569",marginBottom:4}}>Bank Beginning Balance (₱)</div>
                <input type="number" value={form.bankBeginningBalance} onChange={e=>fld("bankBeginningBalance",e.target.value)} placeholder="Cash advance amount" style={{width:"100%",padding:"9px 12px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:".85rem",fontFamily:"inherit",boxSizing:"border-box"}}/>
              </div>
            </div>
            <div style={{marginBottom:16}}>
              <div style={{fontSize:".78rem",fontWeight:600,color:"#475569",marginBottom:4}}>Notes / Purpose</div>
              <textarea value={form.notes} onChange={e=>fld("notes",e.target.value)} placeholder="Purpose / remarks" rows={2} style={{width:"100%",padding:"9px 12px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:".85rem",fontFamily:"inherit",resize:"vertical",boxSizing:"border-box"}}/>
            </div>
            {!editEV&&<div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:8,padding:"9px 13px",fontSize:".78rem",color:"#92400e",marginBottom:14}}>💡 After creating, click <strong>+ Item</strong> on the row to add line items.</div>}
            <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
              <button onClick={()=>{setShowForm(false);setEditEV(null);setForm(blankForm);}} style={{background:"#f1f5f9",border:"1.5px solid #e2e8f0",borderRadius:9,padding:"9px 20px",fontFamily:"inherit",fontWeight:600,fontSize:".85rem",cursor:"pointer",color:"#475569"}}>Cancel</button>
              <button onClick={saveForm} style={{background:"#7c3aed",border:"none",borderRadius:9,padding:"9px 22px",color:"#fff",fontFamily:"inherit",fontWeight:700,fontSize:".85rem",cursor:"pointer"}}>{editEV?"Save Changes":"Create EV"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Mark Paid Modal */}
      {showPay&&(()=>{
        const ev=evouchers.find(e=>e.id===showPay);
        const total=(ev?.items||[]).reduce((s,i)=>s+Number(i.amount||0),0);
        return(
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.45)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
            <div style={{background:"#fff",borderRadius:16,padding:28,width:"100%",maxWidth:380,boxShadow:"0 20px 60px rgba(0,0,0,.25)"}}>
              <div style={{fontWeight:800,color:"#0f172a",fontSize:"1rem",marginBottom:14}}>✅ Mark EV as Paid</div>
              <div style={{background:"#f8fafc",borderRadius:8,padding:"10px 14px",fontSize:".8rem",marginBottom:14,color:"#475569"}}>
                <div style={{fontWeight:700,color:"#0f172a",marginBottom:4}}>{ev?.evNo} · {ev?.payee||ev?.department}</div>
                <div>{(ev?.items||[]).length} line items · Total: <strong>{fmt(total)}</strong></div>
              </div>
              <div style={{marginBottom:10}}>
                <div style={{fontSize:".78rem",fontWeight:600,color:"#475569",marginBottom:4}}>Bank Account</div>
                <select value={payBank} onChange={e=>setPayBank(e.target.value)} style={{width:"100%",padding:"9px 12px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:".85rem",fontFamily:"inherit",background:"#fff",boxSizing:"border-box"}}>
                  <option value="">Select bank…</option>
                  {(BANKS||[]).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div style={{marginBottom:16}}>
                <div style={{fontSize:".78rem",fontWeight:600,color:"#475569",marginBottom:4}}>Reference # / Transaction ID</div>
                <input value={payRef} onChange={e=>setPayRef(e.target.value)} placeholder="e.g. BIZLINK-20260618-007" style={{width:"100%",padding:"9px 12px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:".85rem",fontFamily:"inherit",boxSizing:"border-box"}}/>
              </div>
              <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
                <button onClick={()=>setShowPay(null)} style={{background:"#f1f5f9",border:"1.5px solid #e2e8f0",borderRadius:9,padding:"9px 18px",fontFamily:"inherit",fontWeight:600,fontSize:".85rem",cursor:"pointer",color:"#475569"}}>Cancel</button>
                <button onClick={()=>{markEVPaid(showPay,payBank,payRef);setShowPay(null);}} disabled={!payBank||!payRef} style={{background:(!payBank||!payRef)?"#d1d5db":"#059669",border:"none",borderRadius:9,padding:"9px 20px",color:"#fff",fontFamily:"inherit",fontWeight:700,fontSize:".85rem",cursor:(!payBank||!payRef)?"not-allowed":"pointer"}}>Confirm Payment</button>
              </div>
            </div>
          </div>
        );
      })()}

      <details style={{marginTop:20}}>
        <summary style={{fontSize:".78rem",color:"#94a3b8",cursor:"pointer",userSelect:"none"}}>📋 CSV upload format</summary>
        <div style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:8,padding:"12px 14px",marginTop:8,fontSize:".77rem",color:"#475569",fontFamily:"monospace",lineHeight:1.7}}>
          project,charge to,category,description,amount<br/>
          I'm In,Project,Materials,Plywood sheets,2500<br/>
          ,OPEX,Transportation,Grab Rides - June,850
        </div>
      </details>
    </div>
  );
}

export default LiquidationView;
