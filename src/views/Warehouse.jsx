import React,{useState,useMemo,useEffect,useRef} from "react";
import {fmt,today,uid,toastEmit,Fld,Inp,Sel,KPI,uiConfirm,uiAlert} from "../shared";
import {moveNeedsWitness,SCRAP_MOVE_TYPE,emptyPR} from "../core";

const INV_CATEGORIES = [
  {main:"Sheet Materials",  subs:["Board / Panel","Acrylic / Glass","Foam / Upholstery"]},
  {main:"Metal Works",      subs:["Aluminum","Steel / Iron","Stainless Steel","Fasteners"]},
  {main:"Hardware",         subs:["Hinges & Fasteners","Handles & Pulls","Tracks & Slides","Glass Fittings"]},
  {main:"Finishing",        subs:["Paint","Laminate / Veneer","Wallpaper / Fabric","Edge Banding"]},
  {main:"Lighting",         subs:["LED Strips","Fixtures","Power / Control"]},
  {main:"Signage",          subs:["Signage Materials"]},
  {main:"Electrical",       subs:["Wiring & Conduit","Outlets & Switches"]},
  {main:"Consumables",      subs:["Adhesives & Sealants","Abrasives","Protective Materials"]},
  {main:"Other",            subs:["Other"]},
];
const INV_UNITS = ["pcs","sheets","meters","sqm","kg","sets","rolls","liters","bags","lots","pairs","boxes"];
const INV_LOCATIONS = ["Main Warehouse","Site","Consignment","On Order"];
// Ownership / asset class — differentiates GMD-owned stock (a company asset) from
// materials bought for a specific client project. Drives the asset-value KPI and filter.
const INV_OWNERSHIP = ["Project Stock","GMD Asset — Inventory","GMD Asset — Fixed Asset"];
const isGmdAsset = o => String(o||"").startsWith("GMD Asset");
const STOCK_MOVE_TYPES = ["IN — Delivery","OUT — Issued to Site","OUT — Released for Fabrication","OUT — Used in Project","ADJUST — Stock Count","RETURN — Returned to Supplier",SCRAP_MOVE_TYPE];

const emptyItem = ()=>({
  id:"", code:"", name:"", category:"Sheet Materials", subCategory:"Board / Panel",
  brand:"", supplier:"", unit:"sheets", unitSize:"", location:"Main Warehouse",
  qtyOnHand:0, reorderPoint:0,
  lastPurchasePrice:0, avgCost:0,
  ownership:"Project Stock", highValue:false,
  lastUpdated:today, notes:"", status:"Active",
  createdAt:today, createdBy:"",
});


// ─── SUPPLIER PICKER ─────────────────────────────────────────────────────────
function SupplierPicker({value,onChange,suppliers=[],addSupplier,placeholder="Supplier name"}){
  const[q,setQ]=React.useState(value||"");
  const[open,setOpen]=React.useState(false);
  React.useEffect(()=>{setQ(value||"");},[value]);
  const filtered=(suppliers||[]).filter(s=>(s.companyName||"").toLowerCase().includes(q.toLowerCase())).slice(0,8);
  const exactMatch=filtered.some(s=>(s.companyName||"").toLowerCase()===q.toLowerCase().trim());
  return(
    <div style={{position:"relative"}}>
      <input value={q} onChange={e=>{setQ(e.target.value);onChange(e.target.value);setOpen(true);}}
        onFocus={()=>setOpen(true)} onBlur={()=>setTimeout(()=>setOpen(false),200)}
        placeholder={placeholder}
        style={{width:"100%",border:"1.5px solid #e4e8ef",borderRadius:8,padding:"8px 12px",fontFamily:"inherit",fontSize:".83rem",boxSizing:"border-box",outline:"none"}}/>
      {open&&(
        <div style={{position:"absolute",top:"calc(100% + 3px)",left:0,right:0,zIndex:300,background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:10,boxShadow:"0 4px 20px rgba(0,0,0,.13)",maxHeight:220,overflowY:"auto"}}>
          {filtered.length===0&&!q.trim()&&(
            <div style={{padding:"10px 12px",fontSize:".78rem",color:"#94a3b8"}}>Start typing to search suppliers…</div>
          )}
          {filtered.map(s=>(
            <div key={s.id} onMouseDown={()=>{onChange(s.companyName);setQ(s.companyName);setOpen(false);}}
              style={{padding:"9px 13px",fontSize:".82rem",cursor:"pointer",borderBottom:"1px solid #f1f5f9"}}
              onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"}
              onMouseLeave={e=>e.currentTarget.style.background="#fff"}>
              <div style={{fontWeight:600,color:"#0f172a"}}>{s.companyName}</div>
              {s.contactPerson&&<div style={{fontSize:".68rem",color:"#64748b",marginTop:1}}>{s.contactPerson}</div>}
            </div>
          ))}
          {q.trim()&&!exactMatch&&(
            <div onMouseDown={()=>{addSupplier&&addSupplier({companyName:q.trim()});onChange(q.trim());setOpen(false);}}
              style={{padding:"9px 13px",fontSize:".82rem",cursor:"pointer",color:"#2563eb",fontWeight:600}}
              onMouseEnter={e=>e.currentTarget.style.background="#eff6ff"}
              onMouseLeave={e=>e.currentTarget.style.background="#fff"}>
              ＋ Add "{q.trim()}" as new supplier
            </div>
          )}
          {q.trim()&&filtered.length===0&&(
            <div style={{padding:"9px 13px",fontSize:".78rem",color:"#94a3b8"}}>No suppliers found.</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── inline editable cell (proper component — fixes focus loss) ─────────────
// Was previously defined INSIDE InventoryView's render body, so every
// re-render of InventoryView created a new component type for it — React
// unmounts/remounts the <input>, losing focus and cursor position mid-edit.
// Same bug class as the earlier MyAccountPage fix.
function InlineCell({value,onSave,isNum,color,mono,canEdit,C,tdS,badge}){
  const[on,setOn]=useState(false);
  const[draft,setDraft]=useState("");
  const ref=useRef();
  const start=()=>{setDraft(String(value));setOn(true);setTimeout(()=>ref.current?.select(),0);};
  const commit=()=>{
    setOn(false);
    const raw=String(draft).trim().replace(/[₱,]/g,"");
    const nv=isNum?(isNum==="f"?parseFloat(raw):parseInt(raw)):raw.toUpperCase();
    if((!isNum||!isNaN(nv))&&nv!==value)onSave(isNum?(isNaN(nv)?value:nv):(nv||value));
  };
  const onKey=(e)=>{if(e.key==="Enter"){e.preventDefault();commit();}if(e.key==="Escape")setOn(false);};
  if(on)return(
    <td style={tdS({padding:0,...(color?{borderLeft:`1px solid ${C.border}`}:{})})}>
      <input ref={ref} value={draft} onChange={e=>setDraft(e.target.value)} onBlur={commit} onKeyDown={onKey}
        style={{display:"block",width:"100%",padding:"6px 10px",minHeight:32,background:"#fffbf5",border:"none",outline:`2px solid ${C.accent}`,outlineOffset:-2,color:C.text,fontSize:12,fontFamily:mono?"monospace":"inherit"}}/>
    </td>
  );
  return(
    <td style={tdS({...(color?{borderLeft:`1px solid ${C.border}`}:{})})} onClick={canEdit?start:undefined} title={canEdit?"Click to edit":undefined}
      onMouseEnter={canEdit?e=>{e.currentTarget.style.background="#fffbf5";}:undefined}
      onMouseLeave={canEdit?e=>{e.currentTarget.style.background="";}:undefined}>
      <span style={{display:"block",padding:"0",fontSize:12,color:color||C.text,fontFamily:mono?"monospace":"inherit",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:220,cursor:canEdit?"text":"default"}}>{value}</span>
      {badge}
    </td>
  );
}
// ─── TAT SETTER COMPONENT ─────────────────────────────────────────────────────
function InventoryView({inventory,stocklog,wonDeals,prs=[],updatePR,addPR,addInventoryItem,updateInventoryItem,deleteInventoryItem,clearAllInventory,logStockMove,mergeInventoryItems,suppliers=[],addSupplier,printDR,tools=[],upTools,saveTool,deleteTool,drs=[],saveDr,deleteDr,projs={},upProjs,deals=[],session,role}){
  // ── theme colours matching the warehouse standalone app ─────────────────
  const C={bg:"#f0f2f5",card:"#ffffff",border:"#e4e8ef",text:"#1a2035",muted:"#7b8499",accent:"#f97316",green:"#22c55e",teal:"#14b8a6",blue:"#3b82f6",red:"#ef4444",yellow:"#eab308"};

  // ── state ─────────────────────────────────────────────────────────────
  const[tab,setTab]=useState("dashboard");
  const[search,setSearch]=useState("");
  const[filterStatus,setFilterStatus]=useState("");
  const[filterOwn,setFilterOwn]=useState("");
  const[sortK,setSortK]=useState("name");
  const[sortD,setSortD]=useState(1);
  const[showForm,setShowForm]=useState(false);
  const[editId,setEditId]=useState(null);
  const[form,setForm]=useState(emptyItem());
  const[showMove,setShowMove]=useState(null);
  const[moveForm,setMoveForm]=useState({moveType:"IN — Delivery",qty:"",unitCost:"",projectId:"",notes:"",date:today});
  const[showImport,setShowImport]=useState(false);
  const[importText,setImportText]=useState("");
  const[importPreview,setImportPreview]=useState([]);
  const[importErr,setImportErr]=useState("");
  const[qtyMap,setQtyMap]=useState({});
  const[dispatchModal,setDispatchModal]=useState(null);
  const[dispatchForm,setDispatchForm]=useState({itemId:"",qty:"",projectId:"",notes:""});
  // ── PO receipt → inventory (Ian-style one-click receive) ──────────────────
  // Receiving a PO here writes the inbound stock movement (and auto-creates the
  // SKU if the item isn't tracked yet), so stock updates in the same click — no
  // separate "Add / Restock" step. Financial side-effects (expense/payable) are
  // handled by the Deliveries dashboard's own receive flow, not here.
  const[receiveModal,setReceiveModal]=useState(null); // pr being received
  const[receiveForm,setReceiveForm]=useState({qty:"",unitCost:"",drNo:"",notes:"",date:today});
  const openReceive=(pr)=>{
    setReceiveForm({
      qty:String(pr.qty||""),
      unitCost:String(pr.actUnitCost||pr.estUnitCost||pr.estimatedCost||""),
      drNo:"",notes:"",date:today,
    });
    setReceiveModal(pr);
  };
  const commitReceive=()=>{
    const pr=receiveModal; if(!pr) return;
    const rq=Number(receiveForm.qty)||0;
    if(rq<=0){toastEmit&&toastEmit("Enter a received quantity.","error");return;}
    const total=Number(pr.qty||0);
    const isPartial=total>0&&rq<total;
    const uc=Number(receiveForm.unitCost||pr.actUnitCost||pr.estUnitCost||pr.estimatedCost||0);
    const itemName=(pr.itemName||pr.item||"Unnamed item").trim();
    const poNote=`${receiveForm.drNo?`DR ${receiveForm.drNo} · `:""}PO ${pr.poNumber||String(pr.id).slice(-6)}${pr.supplier?` · ${pr.supplier}`:""}${receiveForm.notes?` · ${receiveForm.notes}`:""}`;
    // GMD-stock POs aren't tied to a real project — don't tag the movement to one,
    // and classify the SKU as a GMD-owned asset so it's expensed only on release
    // (not on receipt). Project-direct POs stay "Project Stock".
    const rawProj=pr.dealId||pr.projectId||"";
    const isStock=rawProj==="__gmd_stocks__"||pr.projectName==="GMD Stocks";
    const sProjId=isStock?null:(rawProj||null);
    // Match an existing SKU by exact name (or a strong prefix match); otherwise create it.
    const key=itemName.toLowerCase();
    const match=inventory.find(i=>i.name?.toLowerCase()===key||(key.length>=8&&i.name?.toLowerCase().includes(key.slice(0,8))));
    let targetId;
    if(match){
      targetId=match.id;
    } else {
      targetId=uid();
      addInventoryItem({...emptyItem(),id:targetId,name:itemName,unit:pr.unit||"pcs",supplier:pr.supplier||"",avgCost:uc,lastPurchasePrice:uc,ownership:isStock?"GMD Asset — Inventory":"Project Stock",notes:`Auto-created from ${pr.poNumber||"PO"}`});
    }
    const ok=logStockMove({itemId:targetId,moveType:"IN — Delivery",qty:rq,unitCost:uc,projectId:sProjId,notes:poNote,date:receiveForm.date||today,recordedBy:session?.name||role});
    if(ok===false) return;
    if(match&&Number(receiveForm.unitCost)>0)updateInventoryItem(match.id,{lastPurchasePrice:uc,avgCost:uc,...(pr.supplier?{supplier:pr.supplier}:{})});
    updatePR&&updatePR(pr.id,{status:isPartial?"Partially Delivered":"Delivered",qtyDelivered:rq,deliveryDate:today,deliveryNote:poNote});
    toastEmit&&toastEmit(`✓ Received ${rq} ${pr.unit||""}${isPartial?" (partial)":""} · ${isStock?"added to GMD Stock (asset — expensed on release)":"stock updated"}`,"success");
    setReceiveModal(null);
  };
  // ── Reorder → draft Purchase Request (warehouse → purchasing link) ──────────
  // Turns a low/out-of-stock alert into a Draft PR for procurement to issue.
  // Suggests a top-up to 2× the reorder point (min the reorder point, min 1),
  // tagged to GMD Stocks since it's a warehouse restock, not a project buy.
  const createReorderPR=(item)=>{
    if(!addPR){toastEmit&&toastEmit("Purchasing link unavailable in this view.","error");return;}
    const rem=Number(item._rem)||0;
    const rop=Number(item.reorderPoint)||0;
    const suggested=Math.max(rop>0?rop*2-rem:0, rop, 1);
    const uc=Number(item.lastPurchasePrice)||Number(item.avgCost)||0;
    addPR({
      ...emptyPR(),
      itemName:item.name,
      category:item.category||"Materials",
      unit:item.unit||"pcs",
      qty:suggested,
      estUnitCost:uc,
      supplier:item.supplier||"",
      projectId:"__gmd_stocks__",
      projectName:"GMD Stocks",
      status:"Draft",
      requestedBy:session?.name||role||"Warehouse",
      notes:`Auto-drafted from low-stock alert (${rem} ${item.unit||""} on hand${rop?`, reorder at ${rop}`:""})`,
    });
    toastEmit&&toastEmit(`🛒 Draft PR created for ${suggested} ${item.unit||""} of ${item.name} — issue it in Procurement.`,"success");
  };
  const[expProj,setExpProj]=useState(null); // expanded project row in the Projects consumption report
  const[rxSearch,setRxSearch]=useState(""); // Delivery Receipts ledger search
  const[toolForm,setToolForm]=useState({name:"",borrower:"",borrowedDate:today,expectedReturn:"",notes:""}); // Tools register add form
  const[showDupes,setShowDupes]=useState(false); // merge-duplicates modal
  const[dupSurvivors,setDupSurvivors]=useState({}); // group key -> chosen survivor id
  // Standalone Delivery Receipt entry (+ AI OCR)
  const[showDr,setShowDr]=useState(false);
  const[drForm,setDrForm]=useState(null);
  const[drOcrBusy,setDrOcrBusy]=useState(false);
  const blankDr=()=>({id:"",drNo:"",drDate:today,supplier:"",projectId:"",projectName:"",poNumber:"",remarks:"",receivedBy:session?.name||role||"",items:[{name:"",qty:"",unitCost:""}]});
  const openDr=(dr)=>{setDrForm(dr?{...blankDr(),...dr,items:(dr.items&&dr.items.length?dr.items.map(it=>({name:it.name||it.desc||"",qty:it.qty??"",unitCost:it.unitCost??""})):[{name:"",qty:"",unitCost:""}])}:blankDr());setShowDr(true);};
  const drTotal=(items)=>(items||[]).reduce((s,it)=>s+(Number(it.qty)||0)*(Number(it.unitCost)||0),0);
  const commitDr=()=>{
    if(!saveDr){toastEmit&&toastEmit("Delivery receipts unavailable in this view.","error");return;}
    const items=(drForm.items||[]).filter(it=>(it.name||"").trim()).map(it=>({name:it.name.trim(),qty:Number(it.qty)||0,unitCost:Number(it.unitCost)||0}));
    if(!items.length){toastEmit&&toastEmit("Add at least one line item.","error");return;}
    const deal=drForm.projectId&&drForm.projectId!=="__gmd_stocks__"?wonDeals.find(d=>d.id===drForm.projectId):null;
    saveDr({...drForm,items,total:drTotal(items),projectName:drForm.projectId==="__gmd_stocks__"?"GMD Stocks":(deal?.client||drForm.projectName||"")});
    toastEmit&&toastEmit(`✓ Delivery receipt ${drForm.drNo||""} saved`,"success");
    setShowDr(false);setDrForm(null);
  };
  const runDrOcr=async(file)=>{
    if(!file)return;
    setDrOcrBusy(true);
    try{
      const buf=await file.arrayBuffer();
      const b64=btoa(new Uint8Array(buf).reduce((d,b)=>d+String.fromCharCode(b),""));
      const res=await fetch("/api/parse-dr",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({fileData:b64,mimeType:file.type})});
      const data=await res.json();
      if(!res.ok)throw new Error(data.error||"OCR failed");
      setDrForm(f=>({...f,
        drNo:data.drNo||f.drNo,
        drDate:data.date||f.drDate,
        supplier:data.supplier||f.supplier,
        poNumber:data.poNumber||f.poNumber,
        items:(Array.isArray(data.items)&&data.items.length?data.items.map(it=>({name:it.name||it.desc||"",qty:it.qty??"",unitCost:it.unitCost??it.price??""})):f.items),
      }));
      toastEmit&&toastEmit(`🤖 Read ${Array.isArray(data.items)?data.items.length:0} line item(s) from the receipt`,"success");
    }catch(err){toastEmit&&toastEmit("DR scan failed: "+err.message,"error");}
    setDrOcrBusy(false);
  };
  // Bulk stock-movement import (CSV: item, type, qty, unitCost, date, project, notes)
  const[showMoveImport,setShowMoveImport]=useState(false);
  const[moveImpText,setMoveImpText]=useState("");
  const[moveImpRows,setMoveImpRows]=useState([]);
  const parseMoveImport=(txt)=>{
    setMoveImpText(txt);
    const lines=String(txt).split(/\r?\n/).map(l=>l.trim()).filter(l=>l&&!/^item\s*,\s*type/i.test(l));
    setMoveImpRows(lines.map(line=>{
      const c=line.split(",").map(s=>s.trim());
      const name=c[0]||"", typeRaw=c[1]||"", qty=Number(c[2])||0, unitCost=Number(c[3])||0, date=c[4]||today, projRaw=c[5]||"", notes=c.slice(6).join(", ");
      const t=typeRaw.toUpperCase();
      let moveType="";
      if(t.startsWith("IN"))moveType="IN — Delivery";
      else if(t.startsWith("OUT"))moveType="OUT — Used in Project";
      else if(t.startsWith("ADJ"))moveType="ADJUST — Stock Count";
      else if(t.startsWith("RET"))moveType="RETURN — Returned to Supplier";
      const deal=projRaw?wonDeals.find(d=>(d.client||"").toLowerCase()===projRaw.toLowerCase()):null;
      const exists=name?inventory.find(i=>i.name?.toLowerCase()===name.toLowerCase()):null;
      let err="";
      if(!name)err="missing item";
      else if(!moveType)err="type must be IN / OUT / ADJUST / RETURN";
      else if(qty<=0)err="qty must be > 0";
      else if(!exists&&!moveType.startsWith("IN"))err="unknown item — only IN can auto-create";
      return{name,moveType,qty,unitCost,date,projectId:deal?.id||"",projectName:deal?.client||projRaw||"",notes,exists:!!exists,err};
    }));
  };
  const applyMoveImport=()=>{
    let ok=0,skip=0;
    for(const r of moveImpRows){
      if(r.err){skip++;continue;}
      let item=inventory.find(i=>i.name?.toLowerCase()===r.name.toLowerCase());
      let itemId;
      if(item)itemId=item.id;
      else if(r.moveType.startsWith("IN")){itemId=uid();addInventoryItem({...emptyItem(),id:itemId,name:r.name,unit:"pcs",avgCost:r.unitCost,lastPurchasePrice:r.unitCost,notes:"Bulk import"});}
      else{skip++;continue;}
      const res=logStockMove({itemId,moveType:r.moveType,qty:r.qty,unitCost:r.unitCost,projectId:r.projectId||null,dealId:r.projectId||null,notes:r.notes||"Bulk import",date:r.date||today,recordedBy:session?.name||role});
      if(res===false)skip++;else ok++;
    }
    toastEmit&&toastEmit(`Imported ${ok} movement${ok!==1?"s":""}${skip?` · skipped ${skip}`:""}`,ok?"success":"error");
    setShowMoveImport(false);setMoveImpText("");setMoveImpRows([]);
  };
  const[delivFilterSupplier,setDelivFilterSupplier]=useState("");
  const[delivFilterProject,setDelivFilterProject]=useState("");
  const[delivFilterDateFrom,setDelivFilterDateFrom]=useState("");
  const[delivFilterDateTo,setDelivFilterDateTo]=useState("");
  const csvFileRef=useRef(null);

  // ── BOM Import / Demand Forecast ──────────────────────────────────────────
  const[bomModal,setBomModal]=useState(null); // dealId
  const[bomFile,setBomFile]=useState(null);
  const[bomParsing,setBomParsing]=useState(false);
  const[bomPreview,setBomPreview]=useState(null); // parsed result
  const[bomLabel,setBomLabel]=useState("Original BOQ");
  const[demandSearch,setDemandSearch]=useState("");

  const handleBomFile=async(file)=>{
    if(!file) return;
    setBomFile(file);setBomParsing(true);setBomPreview(null);
    const reader=new FileReader();
    reader.onload=async(e)=>{
      const base64=btoa(new Uint8Array(e.target.result).reduce((d,b)=>d+String.fromCharCode(b),""));
      try{
        const res=await fetch("/api/parse-bom",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({fileData:base64})});
        const data=await res.json();
        if(!res.ok) throw new Error(data.error||"Parse failed");
        setBomPreview(data);
      } catch(err){ toastEmit&&toastEmit("BOM parse failed: "+err.message,"error"); }
      setBomParsing(false);
    };
    reader.readAsArrayBuffer(file);
  };

  const saveBomImport=()=>{
    if(!bomPreview||!bomModal) return;
    const entry={id:uid(),label:bomLabel||"Original BOQ",date:today,importedBy:session?.name||role,projectName:bomPreview.projectName||"",quotationNo:bomPreview.quotationNo||"",items:bomPreview.materials};
    upProjs(ps=>({...ps,[bomModal]:{...ps[bomModal],materialsForecast:[...(ps[bomModal]?.materialsForecast||[]),entry]}}));
    toastEmit&&toastEmit(`${bomPreview.materials.length} materials imported from ${bomLabel}`,"success");
    setBomModal(null);setBomPreview(null);setBomFile(null);setBomLabel("Original BOQ");
  };

  // Aggregate demand across all active projects
  const allDemand=useMemo(()=>{
    const map={};
    Object.entries(projs).forEach(([dealId,proj])=>{
      const deal=deals.find(d=>d.id===dealId);
      (proj?.materialsForecast||[]).forEach(forecast=>{
        (forecast.items||[]).forEach(item=>{
          const key=item.name.toLowerCase().trim();
          if(!map[key]) map[key]={name:item.name,unit:item.unit,totalQty:0,projects:[],invItem:null};
          map[key].totalQty+=item.qty;
          map[key].projects.push({dealId,client:deal?.client||dealId,label:forecast.label,qty:item.qty,unit:item.unit});
        });
      });
    });
    // Try to match to inventory items by name
    Object.values(map).forEach(d=>{
      const inv=inventory.find(i=>i.name.toLowerCase().trim()===d.name.toLowerCase().trim())||
                inventory.find(i=>i.name.toLowerCase().includes(d.name.toLowerCase().substring(0,8)));
      d.invItem=inv||null;
      d.onHand=inv?Number(inv.qtyOnHand)||0:null;
      d.gap=inv?Math.max(0,d.totalQty-(Number(inv.qtyOnHand)||0)):null;
    });
    return Object.values(map).sort((a,b)=>(b.gap??-1)-(a.gap??-1));
  },[projs,deals,inventory]);

  const[showAddModal,setShowAddModal]=useState(false);
  const[addSearch,setAddSearch]=useState("");
  const[addStep,setAddStep]=useState("search"); // "search" | "restock" | "new"
  const[addTarget,setAddTarget]=useState(null);
  const[restockForm,setRestockForm]=useState({qty:"",unitCost:"",supplier:"",notes:"",date:today});
  const openAddModal=()=>{setAddSearch("");setAddStep("search");setAddTarget(null);setRestockForm({qty:"",unitCost:"",supplier:"",notes:"",date:today});setShowAddModal(true);};
  const addSearchResults=useMemo(()=>{
    if(!addSearch.trim())return[];
    const q=addSearch.trim().toLowerCase();
    return inventory.filter(i=>i.name.toLowerCase().includes(q)||i.code.toLowerCase().includes(q)||(i.supplier||"").toLowerCase().includes(q)).slice(0,8);
  },[inventory,addSearch]);

  const n=v=>Number(v)||0;
  const fp=v=>v?("₱"+n(v).toLocaleString("en-PH",{minimumFractionDigits:0,maximumFractionDigits:2})):"—";
  const canEdit=role==="Manager"||role==="Procurement"||role==="Warehouse";
  const canDelete=role==="Manager"||role==="Procurement"||role==="Warehouse";

  // ── derive BEG/RECV/OUT from stock movements ──────────────────────────
  const mvMap=useMemo(()=>{
    const m={};
    for(const s of stocklog){
      if(!m[s.itemId])m[s.itemId]={recv:0,out:0};
      if(s.moveType.startsWith("IN"))m[s.itemId].recv+=n(s.qty);
      else if(s.moveType.startsWith("OUT"))m[s.itemId].out+=n(s.qty);
    }
    return m;
  },[stocklog]);

  const rows=useMemo(()=>inventory.map(i=>{
    const mv=mvMap[i.id]||{recv:0,out:0};
    const rem=n(i.qtyOnHand);
    const recv=mv.recv, out=mv.out;
    const beg=Math.max(0,rem+out-recv);
    const price=n(i.avgCost)||n(i.lastPurchasePrice);
    const isLow=n(i.reorderPoint)>0&&rem<=n(i.reorderPoint);
    const isOut=rem===0;
    return{...i,_beg:beg,_recv:recv,_out:out,_rem:rem,_price:price,_isLow:isLow,_isOut:isOut};
  }),[inventory,mvMap]);

  // Where each SKU has been used — distinct project names from OUT movements.
  // Drives the "used in" badge so GMD stock consumption is traceable for costing.
  const usageByItem=useMemo(()=>{
    const m={};
    (stocklog||[]).forEach(s=>{
      const pid=s.dealId||s.projectId;
      if(!s.itemId||!String(s.moveType||"").startsWith("OUT")||!pid||pid==="__gmd_stocks__") return;
      const nm=wonDeals.find(d=>d.id===pid)?.client;
      if(!nm) return;
      (m[s.itemId]||(m[s.itemId]=new Set())).add(nm);
    });
    return m;
  },[stocklog,wonDeals]);

  // ── Per-project material consumption (warehouse → finance costing) ──────────
  // Rolls stock movements up by project so each job's material draw-down and its
  // peso value are visible alongside the finance expense ledger. OUT = consumed
  // by the project (valued at the move's unit cost, or the SKU's avg cost).
  const projConsumption=useMemo(()=>{
    const invById={}; inventory.forEach(i=>{invById[i.id]=i;});
    const m={};
    (stocklog||[]).forEach(s=>{
      const pid=s.dealId||s.projectId;
      if(!pid||pid==="__gmd_stocks__") return;
      const type=String(s.moveType||"");
      const isOut=type.startsWith("OUT"), isIn=type.startsWith("IN");
      if(!isOut&&!isIn) return;
      const item=invById[s.itemId];
      const qty=Number(s.qty)||0;
      const uc=Number(s.unitCost)||Number(item?.avgCost)||0;
      const val=qty*uc;
      const g=m[pid]||(m[pid]={pid,outQty:0,outVal:0,inQty:0,inVal:0,moves:0,items:{}});
      g.moves++;
      if(isOut){g.outQty+=qty;g.outVal+=val;}
      if(isIn){g.inQty+=qty;g.inVal+=val;}
      const nm=item?.name||s.itemDesc||"(unknown item)";
      const it=g.items[nm]||(g.items[nm]={name:nm,unit:item?.unit||s.unit||"",outQty:0,outVal:0});
      if(isOut){it.outQty+=qty;it.outVal+=val;}
    });
    return Object.values(m).map(g=>({
      ...g,
      client:wonDeals.find(d=>d.id===g.pid)?.client||g.pid,
      items:Object.values(g.items).filter(it=>it.outQty>0).sort((a,b)=>b.outVal-a.outVal),
    })).sort((a,b)=>b.outVal-a.outVal);
  },[stocklog,inventory,wonDeals]);

  // ── Delivery Receipts ledger (purchasing → warehouse → finance trail) ───────
  // Every PO delivery event surfaced as a receipt document: one row per shipment
  // in a PO's deliveryHistory, or a single summary row for delivered POs that
  // predate history tracking. Derived from `prs` so it stays in sync with
  // purchasing status and the finance payment state — no separate DR store.
  const receipts=useMemo(()=>{
    const list=[];
    (prs||[]).forEach(pr=>{
      const deal=wonDeals.find(d=>d.id===(pr.dealId||pr.projectId));
      const hist=Array.isArray(pr.deliveryHistory)?pr.deliveryHistory:[];
      if(hist.length){
        hist.forEach((h,idx)=>list.push({key:pr.id+"-"+idx,pr,deal,date:h.date||pr.deliveryDate||pr.createdDate||"",drNo:h.drNo||pr.drNo||"",qty:Number(h.qty)||0,recordedBy:h.recordedBy||""}));
      } else if(["Delivered","Partially Delivered"].includes(pr.status)){
        list.push({key:pr.id+"-s",pr,deal,date:pr.deliveryDate||pr.createdDate||"",drNo:pr.drNo||"",qty:Number(pr.qtyDelivered)||Number(pr.qty)||0,recordedBy:""});
      }
    });
    // Standalone / manually-entered delivery receipts (own store).
    (drs||[]).forEach(dr=>{
      const deal=wonDeals.find(d=>d.id===dr.projectId);
      const items=Array.isArray(dr.items)?dr.items:[];
      const totQty=items.reduce((s,it)=>s+(Number(it.qty)||0),0);
      const label=items.length===1?(items[0].name||items[0].desc||"Item"):(items.length?`${items.length} items`:"(no items)");
      list.push({key:"dr-"+dr.id,standalone:true,dr,deal,date:dr.drDate||dr.createdAt||"",drNo:dr.drNo||"",qty:totQty,value:Number(dr.total)||0,recordedBy:dr.receivedBy||"",
        pr:{itemName:label,supplier:dr.supplier,poNumber:dr.poNumber,projectId:dr.projectId,projectName:dr.projectName,status:"Delivered",actUnitCost:0,paymentStatus:""}});
    });
    return list.sort((a,b)=>(b.date>a.date?1:b.date<a.date?-1:0));
  },[prs,wonDeals,drs]);

  // Duplicate SKUs — same name + unit (case-insensitive). Fed to the merge tool.
  const dupGroups=useMemo(()=>{
    const m={};
    (inventory||[]).forEach(i=>{const nm=(i.name||"").trim().toLowerCase();if(!nm)return;const k=nm+"|"+(i.unit||"").trim().toLowerCase();(m[k]||(m[k]=[])).push(i);});
    return Object.values(m).filter(g=>g.length>1).map(g=>({key:(g[0].name||"")+"|"+(g[0].unit||""),name:g[0].name,unit:g[0].unit,items:g}));
  },[inventory]);

  // ── KPIs ──────────────────────────────────────────────────────────────
  const totalVal=rows.reduce((s,i)=>s+i._rem*i._price,0);
  const gmdAssetVal=rows.filter(i=>isGmdAsset(i.ownership)).reduce((s,i)=>s+i._rem*i._price,0);
  const recvVal =rows.reduce((s,i)=>s+i._recv*i._price,0);
  const outVal  =rows.reduce((s,i)=>s+i._out*i._price,0);
  const begVal  =rows.reduce((s,i)=>s+i._beg*i._price,0);
  const inStock =rows.filter(i=>i._rem>0).length;
  const lowStock=rows.filter(i=>i._isLow);
  const outOfStk=rows.filter(i=>i._isOut);
  const negStock=rows.filter(i=>i._rem<0);

  // ── filtered / sorted inventory ───────────────────────────────────────
  const filtered=useMemo(()=>{
    let list=[...rows];
    if(search)list=list.filter(i=>i.name.toLowerCase().includes(search.toLowerCase())||i.code.toLowerCase().includes(search.toLowerCase())||i.supplier.toLowerCase().includes(search.toLowerCase()));
    if(filterStatus==="ok")list=list.filter(i=>i._rem>0);
    else if(filterStatus==="low")list=list.filter(i=>i._isLow);
    else if(filterStatus==="zero")list=list.filter(i=>i._isOut);
    else if(filterStatus==="neg")list=list.filter(i=>i._rem<0);
    if(filterOwn==="gmd")list=list.filter(i=>isGmdAsset(i.ownership));
    else if(filterOwn==="project")list=list.filter(i=>!isGmdAsset(i.ownership));
    list.sort((a,b)=>{
      let av=a[sortK],bv=b[sortK];
      if(sortK==="name"){av=a.name;bv=b.name;}
      else if(sortK==="rem"){av=a._rem;bv=b._rem;}
      else if(sortK==="price"){av=a._price;bv=b._price;}
      else if(sortK==="beg"){av=a._beg;bv=b._beg;}
      else if(sortK==="recv"){av=a._recv;bv=b._recv;}
      else if(sortK==="out"){av=a._out;bv=b._out;}
      if(typeof av==="string"){av=av.toLowerCase();bv=bv.toLowerCase();}
      return sortD*(av<bv?-1:av>bv?1:0);
    });
    return list;
  },[rows,search,filterStatus,filterOwn,sortK,sortD]);

  function sortBy(k){if(sortK===k)setSortD(d=>d*-1);else{setSortK(k);setSortD(1);}}

  // ── form helpers ──────────────────────────────────────────────────────
  const f=(k,v)=>setForm(p=>({...p,[k]:v}));
  const fm=(k,v)=>setMoveForm(p=>({...p,[k]:v}));
  const subs=useMemo(()=>(INV_CATEGORIES.find(c=>c.main===form.category)?.subs||["Other"]),[form.category]);
  const openEdit=(item)=>{setForm({...item});setEditId(item.id);setShowForm(true);};
  const openNew=()=>{setForm(emptyItem());setEditId(null);setShowForm(true);};
  const saveItem=async ()=>{
    if(!form.name)return;
    if(editId){updateInventoryItem(editId,form);}
    else{
      const existing=inventory.find(i=>i.name.trim().toLowerCase()===form.name.trim().toLowerCase());
      if(existing){
        if(!(await uiConfirm(`"${existing.name}" already exists. Update it instead of creating a duplicate?`)))return;
        updateInventoryItem(existing.id,{...form,id:existing.id,code:existing.code});
      } else {
        addInventoryItem(form);
      }
    }
    setShowForm(false);setEditId(null);
  };
  const submitMove=()=>{
    if(!moveForm.qty||!showMove)return;
    if(logStockMove({...moveForm,itemId:showMove})===false)return; // witness/stock guard rejected — keep form open
    setMoveForm({moveType:"IN — Delivery",qty:"",unitCost:"",projectId:"",notes:"",date:today});
    setShowMove(null);
  };
  const quickAdjust=(item,delta)=>{
    logStockMove({itemId:item.id,moveType:"ADJUST — Stock Count",qty:Math.max(0,n(item.qtyOnHand)+delta),unitCost:n(item.avgCost),projectId:"",notes:delta>0?`Quick +${delta}`:`Quick ${delta}`,date:today});
  };
  const commitRestock=()=>{
    if(!addTarget||!restockForm.qty)return;
    logStockMove({itemId:addTarget.id,moveType:"IN — Delivery",qty:Number(restockForm.qty),unitCost:Number(restockForm.unitCost)||n(addTarget.avgCost),projectId:"",notes:restockForm.notes||(restockForm.supplier?`Restocked from ${restockForm.supplier}`:"Restocked"),date:restockForm.date||today});
    if(restockForm.unitCost)updateInventoryItem(addTarget.id,{lastPurchasePrice:Number(restockForm.unitCost),avgCost:Number(restockForm.unitCost),...(restockForm.supplier?{supplier:restockForm.supplier}:{})});
    setShowAddModal(false);
  };

  // ── CSV import helpers ────────────────────────────────────────────────
  function autoCategory(nm){
    const s=nm.toUpperCase();
    if(/\b(BOARD|SHEET|PLYWOOD|PLYBOARD|ACRYLIC|GLASS|FOAM|MIKA|LAMINATE)\b/.test(s))return{main:"Sheet Materials",sub:"Board / Panel"};
    if(/\b(STUD|TRUCK|TUBULAR|STEEL|IRON|SCREW|RIVET|BOLT|NUT|CLAMP)\b/.test(s))return{main:"Metal Works",sub:"Fasteners"};
    if(/\b(HINGE|HANDLE|DRAWER|GUIDE|CONCEALED|LOCK)\b/.test(s))return{main:"Hardware",sub:"Tracks & Slides"};
    if(/\b(PAINT|PRIMER|LACQUER|THINNER|PUTTY|SEALANT|EPOXY|SEAL|BOYSEN|SPHERO|LATEX)\b/.test(s))return{main:"Finishing",sub:"Paint"};
    if(/\b(LED|LIGHT|STRIP|COB|BULB|DOWNLIGHT|LIHA)\b/.test(s))return{main:"Lighting",sub:"LED Strips"};
    if(/\b(WIRE|OUTLET|SWITCH|BREAKER|CONDUIT|EMT|JUNCTION|CABLE|ELECTRICAL|GI COUPLING|IMC|ELBOW)\b/.test(s))return{main:"Electrical",sub:"Wiring & Conduit"};
    if(/\b(DISC|TAPE|GLOVES|GOGGLES|BRUSH|TRAY|BLADE|BUBBLE WRAP|STOCKING)\b/.test(s))return{main:"Consumables",sub:"Abrasives"};
    return{main:"Other",sub:"Other"};
  }
  function parseInvCSV(text){
    const result=[];
    const allLines=text.split(/\r?\n/);
    // Detect FabHub export format by finding a header row with "code" and "name"
    let iName=-1,iUnit=-1,iBeg=-1,iRecv=-1,iOut=-1,iPrice=-1,iNotes=-1;
    let headerFound=false,startLine=0;
    for(let li=0;li<allLines.length;li++){
      const raw=allLines[li].trim();if(!raw)continue;
      const low=raw.toLowerCase();
      if(low.startsWith("code")&&low.includes("name")&&low.includes("unit")){
        const hcols=[];let cur="",inQ=false;
        for(let ci=0;ci<raw.length;ci++){const ch=raw[ci];if(ch==='"'){inQ=!inQ;}else if(ch===','&&!inQ){hcols.push(cur.trim().toLowerCase());cur="";}else{cur+=ch;}}
        hcols.push(cur.trim().toLowerCase());
        iName=hcols.findIndex(c=>c==="name");
        iUnit=hcols.findIndex(c=>c==="unit");
        iBeg=hcols.findIndex(c=>c.includes("beg"));
        iRecv=hcols.findIndex(c=>c.includes("recv"));
        iOut=hcols.findIndex(c=>c.startsWith("out"));
        iPrice=hcols.findIndex(c=>c.includes("price")&&!c.includes("stock"));
        iNotes=hcols.findIndex(c=>c==="notes");
        headerFound=true;startLine=li+1;break;
      }
    }
    for(const raw of allLines.slice(startLine)){
      const line=raw.trim();if(!line)continue;
      const low=line.toLowerCase();
      if(!headerFound&&(low.startsWith("item")||low.startsWith("desc")||low.startsWith("no.")||low.startsWith("#")||low.startsWith("name")))continue;
      const cols=[];let cur="",inQ=false;
      for(let ci=0;ci<line.length;ci++){const ch=line[ci];if(ch==='"'){inQ=!inQ;}else if(ch===','&&!inQ){cols.push(cur.trim());cur="";}else{cur+=ch;}}
      cols.push(cur.trim());
      let name,unit,price,beg,recv,out,notes;
      if(headerFound){
        name=(cols[iName]||"").replace(/^"|"$/g,"").trim().toUpperCase();
        unit=iUnit>=0?(cols[iUnit]||"pcs").replace(/^"|"$/g,"").trim().toLowerCase()||"pcs":"pcs";
        price=iPrice>=0?parseFloat((cols[iPrice]||"0").replace(/[₱,]/g,""))||0:0;
        beg=iBeg>=0?parseInt((cols[iBeg]||"0").replace(/,/g,""))||0:0;
        recv=iRecv>=0?parseInt((cols[iRecv]||"0").replace(/,/g,""))||0:0;
        out=iOut>=0?parseInt((cols[iOut]||"0").replace(/,/g,""))||0:0;
        notes=iNotes>=0?(cols[iNotes]||"").replace(/^"|"$/g,"").trim():"";
      }else{
        name=(cols[0]||"").replace(/^"|"$/g,"").trim().toUpperCase();
        unit=(cols[1]||"pcs").replace(/^"|"$/g,"").trim().toLowerCase()||"pcs";
        price=parseFloat((cols[2]||"0").replace(/[₱,]/g,""))||0;
        beg=parseInt((cols[3]||"0").replace(/,/g,""))||0;
        recv=parseInt((cols[4]||"0").replace(/,/g,""))||0;
        out=parseInt((cols[5]||"0").replace(/,/g,""))||0;
        notes=(cols[6]||"").replace(/^"|"$/g,"").trim();
      }
      if(!name)continue;
      result.push({name,unit,price,qty:beg+recv-out,notes,beg,recv,out});
    }
    return result;
  }
  function handleImportText(val){
    setImportText(val);setImportErr("");
    if(!val.trim()){setImportPreview([]);return;}
    try{const r=parseInvCSV(val);if(!r.length){setImportErr("No valid rows — check format.");setImportPreview([]);return;}setImportPreview(r);}
    catch(e){setImportErr("Parse error: "+e.message);setImportPreview([]);}
  }
  function commitImport(){
    if(!importPreview.length)return;
    let added=0,merged=0;
    for(const row of importPreview){
      const ex=inventory.find(i=>i.name.toUpperCase()===row.name);
      if(ex){updateInventoryItem(ex.id,{...ex,qtyOnHand:row.qty,lastPurchasePrice:row.price||ex.lastPurchasePrice,avgCost:row.price||ex.avgCost,unit:row.unit||ex.unit,notes:row.notes||ex.notes,lastUpdated:today});merged++;}
      else{const cat=autoCategory(row.name);addInventoryItem({...emptyItem(),name:row.name,unit:row.unit||"pcs",qtyOnHand:row.qty,lastPurchasePrice:row.price,avgCost:row.price,category:cat.main,subCategory:cat.sub,notes:row.notes,lastUpdated:today});added++;}
    }
    setShowImport(false);setImportText("");setImportPreview([]);
    toastEmit(`Imported ${added} new + ${merged} updated items`,"success");
  }

  // ── XLSX export ───────────────────────────────────────────────────────
  function exportInvXLSX(){
    if(!window.XLSX){toastEmit("Excel library not loaded — please refresh","error");return;}
    const wb=window.XLSX.utils.book_new();
    const hdr=["Code","Name","Category","Unit","Beg Qty","Recv Qty","Out Qty","Rem Qty","Unit Price","Stock Value","Reorder Pt","Supplier","Location","Status","Notes"];
    const rs=rows.map(i=>[i.code,i.name,i.category,i.unit,i._beg,i._recv,i._out,i._rem,i._price,+(i._rem*i._price).toFixed(2),n(i.reorderPoint),i.supplier,i.location,i._isOut?"DEPLETED":i._isLow?"LOW STOCK":"IN STOCK",i.notes||""]);
    const ws=window.XLSX.utils.aoa_to_sheet([["GMD PRO INC. — INVENTORY"],["Exported: "+new Date().toLocaleString("en-PH")+"   Items: "+rows.length],[],hdr,...rs]);
    ws["!cols"]=[{wch:10},{wch:38},{wch:16},{wch:8},{wch:9},{wch:9},{wch:9},{wch:9},{wch:12},{wch:14},{wch:10},{wch:24},{wch:14},{wch:12},{wch:28}];
    window.XLSX.utils.book_append_sheet(wb,ws,"Inventory");
    if(lowStock.length){
      const ws2=window.XLSX.utils.aoa_to_sheet([["REORDER LIST"],[],["Name","Unit","On Hand","Reorder Pt","Supplier"],...lowStock.map(i=>[i.name,i.unit,i._rem,n(i.reorderPoint),i.supplier])]);
      ws2["!cols"]=[{wch:38},{wch:8},{wch:10},{wch:10},{wch:24}];
      window.XLSX.utils.book_append_sheet(wb,ws2,"Reorder List");
    }
    window.XLSX.writeFile(wb,`GMD-Inventory-${today}.xlsx`);
    toastEmit("Excel downloaded","success");
  }

  // ── shared card style ─────────────────────────────────────────────────
  const cardS={background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"16px 18px",boxShadow:"0 1px 4px rgba(0,0,0,.05)"};
  const thS=(extra)=>({background:"#f8fafc",padding:"7px 10px",textAlign:"left",fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:".5px",borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap",cursor:"pointer",userSelect:"none",...(extra||{})});
  const tdS=(extra)=>({padding:"6px 10px",borderBottom:`1px solid ${C.border}`,fontSize:12,...(extra||{})});

  // ── DASHBOARD ─────────────────────────────────────────────────────────
  function Dashboard(){
    const topVal=[...rows].filter(i=>i._rem>0).sort((a,b)=>b._rem*b._price-a._rem*a._price).slice(0,6);
    const atRisk=[...rows].filter(i=>i._beg>0&&i._rem>=0&&i._rem/i._beg<=0.2).sort((a,b)=>a._rem/Math.max(a._beg,1)-b._rem/Math.max(b._beg,1)).slice(0,7);
    const depleted=[...rows].filter(i=>i._rem<=0).sort((a,b)=>b._beg*b._price-a._beg*a._price).slice(0,7);
    // Expected deliveries from POs — include ALL non-delivered POs, date optional
    const nowD=new Date(today);
    const allOpenPOs=prs.filter(p=>!["Delivered","Cancelled"].includes(p.status));
    const pendingPOs=allOpenPOs.filter(p=>p.deliveryDate).sort((a,b)=>a.deliveryDate>b.deliveryDate?1:-1);
    const noDatPOs=allOpenPOs.filter(p=>!p.deliveryDate);
    const overdueD=pendingPOs.filter(p=>p.deliveryDate<today);
    const todayD=pendingPOs.filter(p=>p.deliveryDate===today);
    const upcomingD=pendingPOs.filter(p=>p.deliveryDate>today);
    const recentMv=[...stocklog].sort((a,b)=>b.date>a.date?1:-1).slice(0,10);
    const fmtV=v=>v>=1000000?"₱"+(v/1000000).toFixed(1)+"M":v>=1000?"₱"+(v/1000).toFixed(0)+"k":fp(v);
    // 6-month IN vs OUT value trend (dependency-free bar chart)
    const trend=(()=>{
      const base=new Date(today), months=[];
      for(let k=5;k>=0;k--){const d=new Date(base.getFullYear(),base.getMonth()-k,1);months.push({y:d.getFullYear(),m:d.getMonth(),label:d.toLocaleString("en-US",{month:"short"}),inV:0,outV:0});}
      const idx={}; months.forEach((mo,i)=>{idx[mo.y+"-"+mo.m]=i;});
      (stocklog||[]).forEach(s=>{const d=new Date(s.date||today);const i=idx[d.getFullYear()+"-"+d.getMonth()];if(i==null)return;const item=rows.find(r=>r.id===s.itemId);const uc=Number(s.unitCost)||Number(item?._price)||0;const val=(Number(s.qty)||0)*uc;const t=String(s.moveType||"");if(t.startsWith("IN"))months[i].inV+=val;else if(t.startsWith("OUT"))months[i].outV+=val;});
      return months;
    })();
    const trendMax=Math.max(1,...trend.map(m=>Math.max(m.inV,m.outV)));
    const hasTrend=trend.some(m=>m.inV>0||m.outV>0);
    return(
      <div style={{overflowY:"auto",flex:1,paddingBottom:20}}>
        {negStock.length>0&&(
          <div style={{background:C.red,borderRadius:10,padding:"11px 16px",marginBottom:10,display:"flex",alignItems:"center",gap:10}}>
            <span>⚠️</span>
            <div style={{flex:1,color:"#fff",fontSize:13}}>
              <strong>{negStock.length} item{negStock.length>1?"s":""} with negative stock</strong>
              <span style={{fontSize:11,marginLeft:8,opacity:.85}}>— {negStock.map(i=>i.name).join(", ")}</span>
            </div>
          </div>
        )}
        {/* KPI strip */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))",gap:8,marginBottom:10}}>
          {[
            {lbl:"Total SKUs",    val:rows.length,             sub:"inventory items",       c:C.blue},
            {lbl:"Remaining Value",val:fmtV(totalVal),         sub:"on hand",               c:C.accent},
            {lbl:"Low / Depleted",val:lowStock.length+outOfStk.length, sub:"need restocking",c:(lowStock.length+outOfStk.length)>0?C.yellow:C.muted},
            {lbl:"Negative Stock",val:negStock.length,         sub:negStock.length>0?"restock immediately":"all ok", c:negStock.length>0?C.red:C.muted},
            {lbl:"Expected Deliveries",val:allOpenPOs.length,  sub:overdueD.length>0?`${overdueD.length} overdue!`:todayD.length>0?`${todayD.length} arriving today`:noDatPOs.length>0?`${noDatPOs.length} no date set`:upcomingD.length>0?`next: ${upcomingD[0]?.deliveryDate}`:"none open", c:overdueD.length>0?C.red:todayD.length>0?C.accent:allOpenPOs.length>0?C.teal:C.muted},
          ].map(k=>(
            <div key={k.lbl} style={{...cardS,borderTop:`3px solid ${k.c}`}}>
              <div style={{fontSize:9,color:C.muted,textTransform:"uppercase",letterSpacing:".7px",marginBottom:5,fontWeight:600}}>{k.lbl}</div>
              <div style={{fontSize:22,fontWeight:800,color:k.c,lineHeight:1,fontFamily:"monospace"}}>{k.val}</div>
              <div style={{fontSize:10,color:C.muted,marginTop:4}}>{k.sub}</div>
            </div>
          ))}
        </div>
        {/* 6-month IN vs OUT value trend */}
        {hasTrend&&(
          <div style={{...cardS,marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{fontSize:11,fontWeight:700,color:C.text}}>Stock Value Trend — last 6 months</div>
              <div style={{display:"flex",gap:12,fontSize:9,color:C.muted,fontWeight:700}}>
                <span style={{display:"inline-flex",alignItems:"center",gap:4}}><span style={{width:9,height:9,borderRadius:2,background:C.green,display:"inline-block"}}/>Received</span>
                <span style={{display:"inline-flex",alignItems:"center",gap:4}}><span style={{width:9,height:9,borderRadius:2,background:C.yellow,display:"inline-block"}}/>Issued</span>
              </div>
            </div>
            <div style={{display:"flex",alignItems:"flex-end",gap:10,height:120,padding:"0 4px"}}>
              {trend.map((mo,i)=>(
                <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                  <div style={{display:"flex",alignItems:"flex-end",gap:3,height:96,width:"100%",justifyContent:"center"}}>
                    <div title={`Received: ${fmtV(mo.inV)}`} style={{width:"42%",maxWidth:22,height:`${Math.max(mo.inV>0?4:0,(mo.inV/trendMax)*96)}px`,background:C.green,borderRadius:"3px 3px 0 0"}}/>
                    <div title={`Issued: ${fmtV(mo.outV)}`} style={{width:"42%",maxWidth:22,height:`${Math.max(mo.outV>0?4:0,(mo.outV/trendMax)*96)}px`,background:C.yellow,borderRadius:"3px 3px 0 0"}}/>
                  </div>
                  <div style={{fontSize:9,color:C.muted,fontWeight:700}}>{mo.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Value Flow */}
        <div style={{...cardS,marginBottom:10}}>
          <div style={{fontSize:11,fontWeight:700,color:C.text,marginBottom:12}}>Value Flow Pipeline</div>
          <div style={{display:"flex",gap:0,marginBottom:8}}>
            {[
              {lbl:"Beginning",  val:fmtV(begVal),  c:C.accent},
              {lbl:"+ Received", val:"+"+fmtV(recvVal), c:C.green},
              {lbl:"− Issued",   val:"−"+fmtV(outVal),  c:C.red},
              {lbl:"= On Hand",  val:fmtV(totalVal), c:C.blue},
            ].map((seg,i)=>(
              <div key={i} style={{flex:1,background:seg.c+"12",borderTop:`3px solid ${seg.c}`,borderRadius:i===0?"8px 0 0 8px":i===3?"0 8px 8px 0":"0",padding:"10px",textAlign:"center",borderRight:i<3?`1px solid #fff`:undefined}}>
                <div style={{fontSize:8,color:seg.c,textTransform:"uppercase",letterSpacing:".5px",fontWeight:700,marginBottom:4}}>{seg.lbl}</div>
                <div style={{fontSize:14,fontWeight:800,color:seg.c,fontFamily:"monospace"}}>{seg.val}</div>
              </div>
            ))}
          </div>
        </div>
        {/* 3-column bottom panels */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
          {/* Top value items */}
          <div style={cardS}>
            <div style={{fontSize:11,fontWeight:700,color:C.text,marginBottom:10}}>Highest Value on Hand</div>
            {topVal.length===0?<div style={{color:C.muted,fontSize:12,textAlign:"center",padding:"12px 0"}}>No stock yet</div>
            :topVal.map((item,i)=>(
              <div key={item.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                <div style={{width:18,height:18,borderRadius:4,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,background:i<3?C.accent+"18":"#f0f2f5",color:i<3?C.accent:C.muted}}>{i+1}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:11,color:C.text,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.name}</div>
                  <div style={{height:4,background:"#e4e8ef",borderRadius:2,marginTop:3,overflow:"hidden"}}><div style={{width:Math.round(item._rem*item._price/Math.max(topVal[0]._rem*topVal[0]._price,1)*100)+"%",height:"100%",background:i===0?C.accent:C.accent+"80",borderRadius:2}}/></div>
                </div>
                <div style={{fontSize:10,fontWeight:700,color:i<3?C.accent:C.muted,fontFamily:"monospace",flexShrink:0}}>{item._rem} {item.unit}</div>
              </div>
            ))}
          </div>
          {/* Depletion Risk */}
          <div style={cardS}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:700,color:C.text}}>Depletion Risk</div>
              <span style={{fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:20,background:atRisk.length>0?C.red+"15":C.green+"15",color:atRisk.length>0?C.red:C.green}}>{atRisk.length} at risk</span>
            </div>
            {atRisk.length===0?<div style={{textAlign:"center",padding:"12px 0",color:C.green,fontSize:12}}>✓ No depletion risk</div>
            :atRisk.map(item=>{
              const pct=item._beg>0?Math.round(item._rem/item._beg*100):0;
              const cc=pct<10?C.red:pct<20?C.yellow:C.blue;
              return(
                <div key={item.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                  <div style={{width:30,textAlign:"right",fontSize:10,fontWeight:700,color:cc,fontFamily:"monospace",flexShrink:0}}>{pct}%</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:11,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.name}</div>
                    <div style={{height:4,background:"#e4e8ef",borderRadius:2,marginTop:3,overflow:"hidden"}}><div style={{width:pct+"%",height:"100%",background:cc,borderRadius:2}}/></div>
                  </div>
                  <div style={{fontSize:10,color:C.muted,flexShrink:0}}>{item._rem}/{item._beg}</div>
                </div>
              );
            })}
          </div>
          {/* Depleted / Critical */}
          <div style={cardS}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:700,color:C.text}}>Depleted / Critical</div>
              <span style={{fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:20,background:(outOfStk.length+negStock.length)>0?C.red+"15":C.green+"15",color:(outOfStk.length+negStock.length)>0?C.red:C.green}}>{outOfStk.length+negStock.length} items</span>
            </div>
            {depleted.length===0?<div style={{textAlign:"center",padding:"12px 0",color:C.green,fontSize:12}}>✓ All items in stock</div>
            :depleted.map(item=>(
              <div key={item.id} style={{display:"flex",alignItems:"center",gap:7,padding:"5px 8px",borderRadius:7,marginBottom:5,background:item._rem<0?C.red+"0a":C.yellow+"0a",border:`1px solid ${item._rem<0?C.red+"25":C.yellow+"25"}`}}>
                <span style={{fontSize:11,flexShrink:0}}>{item._rem<0?"🔴":"🟡"}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:10,color:C.text,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.name}</div>
                  <div style={{fontSize:9,color:item._rem<0?C.red:C.yellow,fontFamily:"monospace"}}>{item._rem<0?`NEG: ${item._rem} ${item.unit}`:"DEPLETED"}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Recent movements */}
        <div style={{...cardS,marginTop:10}}>
          <div style={{fontSize:11,fontWeight:700,color:C.text,marginBottom:10}}>Recent Stock Movements</div>
          {stocklog.length===0?<div style={{color:C.muted,fontSize:12,textAlign:"center",padding:"12px 0"}}>No movements yet</div>
          :[...stocklog].sort((a,b)=>b.date>a.date?1:-1).slice(0,8).map((mv,i)=>{
            const item=inventory.find(x=>x.id===mv.itemId);
            const clr=mv.moveType.startsWith("IN")?C.green:mv.moveType.startsWith("OUT")?C.yellow:C.muted;
            return(
              <div key={mv.id||i} style={{display:"flex",gap:9,padding:"6px 0",borderBottom:i<7?`1px solid ${C.border}`:"none"}}>
                <div style={{width:6,height:6,borderRadius:"50%",flexShrink:0,marginTop:5,background:clr}}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:11,color:C.text}}>{item?.name||"Unknown"} <span style={{color:clr,fontWeight:700}}>{mv.moveType.startsWith("IN")?"+":"-"}{mv.qty} {item?.unit||""}</span></div>
                  <div style={{fontSize:10,color:C.muted,marginTop:1}}>{mv.moveType} · {mv.date}{mv.notes?` · ${mv.notes}`:""}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── tab bar ───────────────────────────────────────────────────────────
  const demandGaps=allDemand.filter(d=>d.gap>0).length;
  // Tools / equipment register status helpers
  const toolStatus=t=>t.actualReturn?"Returned":(t.expectedReturn&&t.expectedReturn<today?"Overdue":"Borrowed");
  const toolsOut=(tools||[]).filter(t=>!t.actualReturn).length;
  const toolsOverdue=(tools||[]).filter(t=>toolStatus(t)==="Overdue").length;
  const TABS=[["dashboard","📊 Dashboard"],["deliveries",`📦 Deliveries${prs.filter(p=>!["Delivered","Cancelled"].includes(p.status)).length>0?" ("+prs.filter(p=>!["Delivered","Cancelled"].includes(p.status)).length+")":""}`],["receipts",`🧾 Receipts${receipts.length?" ("+receipts.length+")":""}`],["inventory",`≡ Inventory (${rows.length})`],["demand",`🔮 Demand${demandGaps>0?" ⚠"+demandGaps:""}`],["alerts",`⚠ Alerts${(lowStock.length+outOfStk.length)>0?" ("+(lowStock.length+outOfStk.length)+")":""}`],["projects",`🏗 Projects${projConsumption.length?" ("+projConsumption.length+")":""}`],["tools",`🔧 Tools${toolsOut>0?" ("+toolsOut+")":""}`],["log",`⟳ Log (${stocklog.length})`]];

  return(
    <div style={{display:"flex",flexDirection:"column",gap:0,height:"100%"}}>
      {/* Topbar */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10,flexWrap:"wrap",gap:8}}>
        <div>
          <div style={{fontWeight:800,fontSize:"1.1rem",color:C.text}}>📦 GMD Inventory</div>
          <div style={{fontSize:".72rem",color:C.muted,marginTop:1}}>Live · Every item is cash in the warehouse</div>
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          <button onClick={exportInvXLSX} style={{background:C.green,border:"none",borderRadius:8,padding:"7px 14px",fontFamily:"inherit",fontWeight:700,fontSize:".8rem",color:"#fff",cursor:"pointer"}}>⬇ Excel</button>
          {canEdit&&<button onClick={()=>{setShowImport(true);setImportText("");setImportPreview([]);setImportErr("");}} style={{background:"#7c3aed",border:"none",borderRadius:8,padding:"7px 14px",fontFamily:"inherit",fontWeight:700,fontSize:".8rem",color:"#fff",cursor:"pointer"}}>⬆ Import CSV</button>}
          {canEdit&&mergeInventoryItems&&dupGroups.length>0&&<button onClick={()=>{setShowDupes(true);setDupSurvivors({});}} title="Combine duplicate SKUs" style={{background:"#fff",border:`1px solid ${C.red}`,borderRadius:8,padding:"7px 14px",fontFamily:"inherit",fontWeight:700,fontSize:".8rem",color:C.red,cursor:"pointer"}}>⧉ Merge Dupes ({dupGroups.length})</button>}
          {canEdit&&<button onClick={openAddModal} style={{background:C.accent,border:"none",borderRadius:8,padding:"7px 14px",fontFamily:"inherit",fontWeight:700,fontSize:".8rem",color:"#fff",cursor:"pointer"}}>＋ Add / Restock</button>}
          {role==="Manager"&&clearAllInventory&&(inventory.length>0||stocklog.length>0)&&<button onClick={async()=>{
            if(!(await uiConfirm(`Start fresh? This permanently deletes ALL ${inventory.length} inventory item(s) and ${stocklog.length} stock movement(s) — for everyone, on every device. This cannot be undone.`))) return;
            if(!(await uiConfirm("Final confirmation: delete the entire inventory now?"))) return;
            const ok=await clearAllInventory();
            if(ok) uiAlert("Inventory cleared. You're starting from scratch.");
          }} style={{background:"#fff",border:`1.5px solid ${C.red}`,borderRadius:8,padding:"7px 14px",fontFamily:"inherit",fontWeight:700,fontSize:".8rem",color:C.red,cursor:"pointer"}} title="Permanently delete all inventory items and stock movements">🗑 Clear All</button>}
        </div>
      </div>

      {/* Tab bar */}
      <div style={{display:"flex",background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:3,gap:2,marginBottom:10,width:"fit-content",boxShadow:"0 1px 3px rgba(0,0,0,.05)"}}>
        {TABS.map(([id,lbl])=>(
          <button key={id} onClick={()=>setTab(id)}
            style={{padding:"6px 16px",borderRadius:6,background:tab===id?C.accent:"transparent",border:"none",color:tab===id?"#fff":C.muted,cursor:"pointer",fontSize:12,fontFamily:"inherit",fontWeight:tab===id?700:500,transition:"all .12s",whiteSpace:"nowrap"}}>
            {lbl}
          </button>
        ))}
      </div>

      {/* ── DASHBOARD TAB ─────────────────────────────────────────────── */}
      {tab==="dashboard"&&<Dashboard/>}

      {/* ── DELIVERIES TAB ───────────────────────────────────────────────── */}
      {tab==="deliveries"&&(()=>{
        const nowDel=new Date(today);
        const openPOs=prs.filter(p=>!["Delivered","Cancelled"].includes(p.status));
        const withDate=openPOs.filter(p=>p.deliveryDate).sort((a,b)=>a.deliveryDate>b.deliveryDate?1:-1);
        const noDate=openPOs.filter(p=>!p.deliveryDate);
        const allUnfiltered=[...withDate,...noDate];
        // Unique suppliers and projects for dropdowns
        const supplierOpts=[...new Set(allUnfiltered.map(p=>p.supplier).filter(Boolean))].sort();
        const projectOpts=[...new Set(allUnfiltered.map(p=>p.dealId||p.projectId).filter(Boolean))].map(id=>wonDeals.find(d=>d.id===id)).filter(Boolean);
        // Apply filters
        const all=allUnfiltered.filter(p=>{
          if(delivFilterSupplier&&(p.supplier||"").toLowerCase().indexOf(delivFilterSupplier.toLowerCase())<0) return false;
          if(delivFilterProject&&p.dealId!==delivFilterProject&&p.projectId!==delivFilterProject) return false;
          if(delivFilterDateFrom&&p.deliveryDate&&p.deliveryDate<delivFilterDateFrom) return false;
          if(delivFilterDateTo&&p.deliveryDate&&p.deliveryDate>delivFilterDateTo) return false;
          return true;
        });
        const hasFilter=delivFilterSupplier||delivFilterProject||delivFilterDateFrom||delivFilterDateTo;
        const totalValue=all.reduce((s,p)=>{const uc=Number(p.actUnitCost||p.estUnitCost||p.estimatedCost||0);return s+uc*Number(p.qty||1);},0);
        const fmtM=v=>"₱"+Number(v).toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2});
        return(
          <div style={{overflowY:"auto",flex:1,paddingBottom:20}}>
            {/* Summary KPIs */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:8,marginBottom:12}}>
              {[
                {l:"Pending Deliveries",v:openPOs.length,c:C.text},
                {l:"Overdue",v:withDate.filter(p=>p.deliveryDate<today).length,c:C.red},
                {l:"Arriving Today",v:withDate.filter(p=>p.deliveryDate===today).length,c:C.accent},
                {l:"No Date Set",v:noDate.length,c:C.muted},
                {l:"Total Incoming Value",v:fmtM(totalValue),c:C.teal},
              ].map(({l,v,c})=>(
                <div key={l} style={{background:C.card,borderRadius:8,padding:"10px 14px",border:`1px solid ${C.border}`}}>
                  <div style={{fontSize:15,fontWeight:800,color:c,fontFamily:"monospace"}}>{v}</div>
                  <div style={{fontSize:9,color:C.muted,textTransform:"uppercase",letterSpacing:".6px",marginTop:3}}>{l}</div>
                </div>
              ))}
            </div>
            {/* Filter bar */}
            <div style={{background:C.card,borderRadius:10,border:`1px solid ${C.border}`,padding:"12px 14px",marginBottom:10,display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end"}}>
              <div style={{flex:"1 1 160px",minWidth:140}}>
                <div style={{fontSize:9,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>Supplier</div>
                <input value={delivFilterSupplier} onChange={e=>setDelivFilterSupplier(e.target.value)} placeholder="Search supplier…" list="supp-opts"
                  style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:7,padding:"6px 10px",fontFamily:"inherit",fontSize:12,color:C.text,background:"#fff",boxSizing:"border-box"}}/>
                <datalist id="supp-opts">{supplierOpts.map(s=><option key={s} value={s}/>)}</datalist>
              </div>
              <div style={{flex:"1 1 160px",minWidth:140}}>
                <div style={{fontSize:9,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>Project</div>
                <select value={delivFilterProject} onChange={e=>setDelivFilterProject(e.target.value)}
                  style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:7,padding:"6px 10px",fontFamily:"inherit",fontSize:12,color:C.text,background:"#fff",boxSizing:"border-box"}}>
                  <option value="">All projects</option>
                  {projectOpts.map(d=><option key={d.id} value={d.id}>{d.client}</option>)}
                </select>
              </div>
              <div style={{flex:"1 1 130px",minWidth:120}}>
                <div style={{fontSize:9,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>Date From</div>
                <input type="date" value={delivFilterDateFrom} onChange={e=>setDelivFilterDateFrom(e.target.value)}
                  style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:7,padding:"6px 10px",fontFamily:"inherit",fontSize:12,color:C.text,background:"#fff",boxSizing:"border-box"}}/>
              </div>
              <div style={{flex:"1 1 130px",minWidth:120}}>
                <div style={{fontSize:9,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>Date To</div>
                <input type="date" value={delivFilterDateTo} onChange={e=>setDelivFilterDateTo(e.target.value)}
                  style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:7,padding:"6px 10px",fontFamily:"inherit",fontSize:12,color:C.text,background:"#fff",boxSizing:"border-box"}}/>
              </div>
              {hasFilter&&(
                <button onClick={()=>{setDelivFilterSupplier("");setDelivFilterProject("");setDelivFilterDateFrom("");setDelivFilterDateTo("");}}
                  style={{padding:"6px 14px",border:`1px solid ${C.red}`,borderRadius:7,background:"#fff",color:C.red,fontFamily:"inherit",fontSize:12,fontWeight:700,cursor:"pointer",alignSelf:"flex-end",whiteSpace:"nowrap"}}>
                  ✕ Clear
                </button>
              )}
              {hasFilter&&<div style={{alignSelf:"flex-end",fontSize:11,color:C.muted,paddingBottom:6}}>{all.length} of {allUnfiltered.length} shown</div>}
            </div>
            {/* Table */}
            <div style={{background:C.card,borderRadius:10,border:`1px solid ${C.border}`,overflow:"hidden"}}>
              <div style={{overflowX:"auto"}}>
                <div style={{minWidth:900}}>
                  {/* Header */}
                  <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 60px 90px 100px 110px 150px",background:"#1e293b",padding:"8px 14px",gap:8}}>
                    {["Item / PO","Supplier","Project","Qty","Unit Cost","Total Value","Delivery Date","Actions"].map(h=>(
                      <div key={h} style={{fontSize:9,fontWeight:700,color:"rgba(255,255,255,.6)",textTransform:"uppercase",letterSpacing:".5px"}}>{h}</div>
                    ))}
                  </div>
                  {all.length===0&&<div style={{padding:"28px",textAlign:"center",color:C.muted,fontSize:12}}>No pending PO deliveries.</div>}
                  {all.map((pr,i)=>{
                    const deal=wonDeals.find(d=>d.id===pr.dealId||d.id===pr.projectId);
                    const uc=Number(pr.actUnitCost||pr.estUnitCost||pr.estimatedCost||0);
                    const qty=Number(pr.qty||1);
                    const rowVal=uc*qty;
                    const isOv=pr.deliveryDate&&pr.deliveryDate<today;
                    const isTd=pr.deliveryDate===today;
                    const isRcvd=["Delivered","Partially Delivered"].includes(pr.status);
                    const daysAway=pr.deliveryDate?Math.ceil((new Date(pr.deliveryDate)-nowDel)/(1000*60*60*24)):null;
                    const invMatch=inventory.find(inv=>inv.name?.toLowerCase()===(pr.itemName||pr.item||"").toLowerCase()||inv.name?.toLowerCase().includes((pr.itemName||pr.item||"").toLowerCase().slice(0,8)));
                    const lastDispatch=invMatch?[...stocklog].filter(s=>s.itemId===invMatch.id&&s.moveType==="OUT — Used in Project").sort((a,b)=>b.date>a.date?1:-1)[0]:null;
                    return(
                      <div key={pr.id} style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 60px 90px 100px 110px 150px",padding:"9px 14px",gap:8,borderBottom:`1px solid ${C.border}`,background:isOv?"#fff5f5":i%2?"#fafafa":"#fff",alignItems:"center"}}>
                        <div style={{minWidth:0}}>
                          <div style={{fontSize:11,fontWeight:600,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{pr.itemName||pr.item||"—"}</div>
                          <div style={{display:"flex",gap:5,marginTop:2,flexWrap:"wrap"}}>
                            {pr.poNumber&&<span style={{fontSize:9,color:C.blue,fontWeight:700}}>#{pr.poNumber}</span>}
                            <span style={{fontSize:9,padding:"1px 6px",borderRadius:10,background:isRcvd?"#dcfce7":isOv?"#fef2f2":"#f1f5f9",color:isRcvd?C.green:isOv?C.red:C.muted,fontWeight:700}}>{pr.status}</span>
                          </div>
                          {lastDispatch&&<div style={{fontSize:9,color:C.teal,marginTop:2}}>📤 Last out: {wonDeals.find(d=>d.id===lastDispatch.projectId)?.client||lastDispatch.notes||"Warehouse"} · {lastDispatch.date}</div>}
                        </div>
                        <div style={{fontSize:11,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{pr.supplier||"—"}</div>
                        <div style={{overflow:"hidden"}}>
                          {(()=>{const isStk=!deal&&((pr.dealId||pr.projectId)==="__gmd_stocks__"||pr.projectName==="GMD Stocks"||(!pr.dealId&&!pr.projectId));return(
                            <span title={isStk?"GMD-owned stock — expensed when released to a project":"Bought for this project"} style={{display:"inline-flex",alignItems:"center",gap:4,maxWidth:"100%",padding:"2px 8px",borderRadius:10,fontSize:9,fontWeight:700,background:isStk?"#f0fdfa":"#eff6ff",color:isStk?C.teal:C.blue,border:`1px solid ${isStk?"#99f6e4":"#bfdbfe"}`,overflow:"hidden"}}>
                              <span style={{flexShrink:0}}>{isStk?"🏭":"📁"}</span>
                              <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{isStk?"GMD Stock":(deal?.client||pr.projectName||"Project")}</span>
                            </span>
                          );})()}
                        </div>
                        <div style={{fontSize:12,fontWeight:700,color:C.text,textAlign:"right"}}>{qty}</div>
                        <div style={{fontSize:11,fontFamily:"monospace",color:uc>0?C.text:C.muted,textAlign:"right"}}>{uc>0?fmtM(uc):"—"}</div>
                        <div style={{fontSize:12,fontFamily:"monospace",fontWeight:700,color:rowVal>0?C.teal:C.muted,textAlign:"right"}}>{rowVal>0?fmtM(rowVal):"—"}</div>
                        <div style={{fontSize:10}}>
                          {pr.deliveryDate?<span style={{color:isOv?C.red:isTd?C.accent:C.teal,fontWeight:700}}>{isOv?`${Math.abs(daysAway)}d overdue`:isTd?"Today":`${daysAway}d`}</span>:<span style={{color:C.muted,fontSize:9}}>No date</span>}
                          {pr.deliveryDate&&!isOv&&!isTd&&<div style={{fontSize:9,color:C.muted}}>{pr.deliveryDate}</div>}
                        </div>
                        <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                          {updatePR&&pr.status!=="Delivered"&&<button onClick={()=>openReceive(pr)} style={{fontSize:9,padding:"3px 7px",border:"none",borderRadius:5,background:C.green,color:"#fff",cursor:"pointer",fontWeight:700,fontFamily:"inherit",whiteSpace:"nowrap"}}>✓ Receive</button>}
                          {logStockMove&&isRcvd&&<button onClick={()=>{setDispatchModal(pr);setDispatchForm({itemId:invMatch?.id||"",qty:pr.qty||"",projectId:pr.dealId||pr.projectId||"",notes:""});}} style={{fontSize:9,padding:"3px 7px",border:`1px solid ${C.accent}`,borderRadius:5,background:"#fff",color:C.accent,cursor:"pointer",fontWeight:700,fontFamily:"inherit",whiteSpace:"nowrap"}}>📤 Dispatch</button>}
                        </div>
                      </div>
                    );
                  })}
                  {/* Totals footer */}
                  {all.length>0&&(
                    <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 60px 90px 100px 110px 150px",padding:"10px 14px",gap:8,background:"#1e293b",alignItems:"center"}}>
                      <div style={{gridColumn:"1/6",color:"rgba(255,255,255,.7)",fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".5px"}}>Total Incoming Value</div>
                      <div style={{fontSize:14,fontFamily:"monospace",fontWeight:800,color:C.accent,textAlign:"right"}}>{fmtM(totalValue)}</div>
                      <div/><div/>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── INVENTORY TABLE TAB ──────────────────────────────────────── */}
      {tab==="inventory"&&(
        <div style={{display:"flex",flexDirection:"column",gap:8,flex:1,minHeight:0}}>
          {/* Finance note */}
          {(role==="Finance"||role==="Manager")&&(
            <div style={{background:"#eff6ff",border:"1px solid #93c5fd",borderRadius:8,padding:"9px 14px",fontSize:".78rem",color:"#1d4ed8"}}>
              💰 <strong>Inventory = Cash Asset:</strong> ₱{Math.round(totalVal).toLocaleString("en-PH")} in stock. Reconcile with total POs paid. Discrepancy = investigate.
              {gmdAssetVal>0&&<> · <strong>GMD-owned assets:</strong> ₱{Math.round(gmdAssetVal).toLocaleString("en-PH")}</>}
            </div>
          )}
          {/* Search / filter bar */}
          <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
            <div style={{flex:1,minWidth:160,position:"relative"}}>
              <span style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",color:C.muted,fontSize:12,pointerEvents:"none"}}>🔍</span>
              <input value={search} onChange={e=>{setSearch(e.target.value);}} placeholder="Search items…"
                style={{width:"100%",background:"#fff",border:`1px solid ${C.border}`,borderRadius:7,padding:"7px 11px 7px 28px",fontFamily:"inherit",fontSize:12,color:C.text,outline:"none",boxSizing:"border-box"}}/>
            </div>
            <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}
              style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:7,padding:"7px 10px",fontFamily:"inherit",fontSize:12,color:C.text,cursor:"pointer"}}>
              <option value="">All status</option>
              <option value="ok">In stock</option>
              <option value="low">Low stock</option>
              <option value="zero">Depleted</option>
              <option value="neg">Negative</option>
            </select>
            <select value={filterOwn} onChange={e=>setFilterOwn(e.target.value)}
              style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:7,padding:"7px 10px",fontFamily:"inherit",fontSize:12,color:C.text,cursor:"pointer"}}>
              <option value="">All ownership</option>
              <option value="project">Project stock</option>
              <option value="gmd">GMD-owned assets</option>
            </select>
          </div>

          {/* Edit form (existing items only) */}
          {showForm&&canEdit&&editId&&(
            <div style={{background:"#fff",borderRadius:10,border:`1px solid ${C.border}`,padding:16,boxShadow:"0 4px 16px rgba(0,0,0,.06)"}}>
              <div style={{fontWeight:800,color:C.text,marginBottom:12,fontSize:".92rem"}}>✏ Edit Item</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <div style={{gridColumn:"1/-1"}}><Fld label="Item Name" required><Inp value={form.name} onChange={e=>f("name",e.target.value)} placeholder="e.g. CUTTING DISC"/></Fld></div>
                <Fld label="Category"><Sel value={form.category} onChange={e=>{f("category",e.target.value);f("subCategory",INV_CATEGORIES.find(c=>c.main===e.target.value)?.subs[0]||"Other");}}>
                  {INV_CATEGORIES.map(c=><option key={c.main}>{c.main}</option>)}</Sel></Fld>
                <Fld label="Unit"><Sel value={form.unit} onChange={e=>f("unit",e.target.value)}>{INV_UNITS.map(u=><option key={u}>{u}</option>)}</Sel></Fld>
                <Fld label="Qty On Hand"><Inp type="number" value={form.qtyOnHand} onChange={e=>f("qtyOnHand",e.target.value)} min={0}/></Fld>
                <Fld label="Unit Price (₱)"><Inp type="number" value={form.lastPurchasePrice} onChange={e=>{f("lastPurchasePrice",e.target.value);f("avgCost",e.target.value);}}/></Fld>
                <Fld label="Reorder Point"><Inp type="number" value={form.reorderPoint} onChange={e=>f("reorderPoint",e.target.value)} min={0}/></Fld>
                <Fld label="Supplier"><Inp value={form.supplier} onChange={e=>f("supplier",e.target.value)} placeholder="Supplier name"/></Fld>
                <Fld label="Ownership"><Sel value={form.ownership||"Project Stock"} onChange={e=>f("ownership",e.target.value)}>{INV_OWNERSHIP.map(o=><option key={o}>{o}</option>)}</Sel></Fld>
                <Fld label="High-value" hint="Release/return needs a Finance witness (§5.3)"><label style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:".82rem",color:"#475569",padding:"7px 0"}}><input type="checkbox" checked={!!form.highValue} onChange={e=>f("highValue",e.target.checked)}/> Requires Finance witness</label></Fld>
                <div style={{gridColumn:"1/-1"}}><Fld label="Notes"><Inp value={form.notes} onChange={e=>f("notes",e.target.value)} placeholder="Specs, color, grade…"/></Fld></div>
              </div>
              <div style={{display:"flex",gap:8,marginTop:12}}>
                <button onClick={saveItem} disabled={!form.name} style={{background:form.name?C.accent:"#e2e8f0",border:"none",borderRadius:7,padding:"8px 20px",fontFamily:"inherit",fontWeight:700,fontSize:".84rem",color:form.name?"#fff":"#94a3b8",cursor:form.name?"pointer":"not-allowed"}}>Save Changes</button>
                <button onClick={()=>{setShowForm(false);setEditId(null);}} style={{background:"transparent",border:`1px solid ${C.border}`,borderRadius:7,padding:"8px 16px",fontFamily:"inherit",fontWeight:600,fontSize:".8rem",color:C.muted,cursor:"pointer"}}>Cancel</button>
              </div>
            </div>
          )}

          {/* ── Add / Restock modal ─────────────────────────────────── */}
          {showAddModal&&(
            <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.45)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setShowAddModal(false)}>
              <div style={{background:"#fff",borderRadius:14,padding:24,width:"100%",maxWidth:460,boxShadow:"0 8px 40px rgba(0,0,0,.18)"}} onClick={e=>e.stopPropagation()}>

                {/* ── STEP 1: Search ── */}
                {addStep==="search"&&(<>
                  <div style={{fontWeight:800,fontSize:"1rem",color:C.text,marginBottom:4}}>＋ Add / Restock Item</div>
                  <div style={{fontSize:".75rem",color:C.muted,marginBottom:14}}>Search for an existing item to restock, or create a new one.</div>
                  <input autoFocus value={addSearch} onChange={e=>setAddSearch(e.target.value)}
                    placeholder="Search by name, code, or supplier…"
                    style={{width:"100%",border:`1.5px solid ${C.border}`,borderRadius:8,padding:"10px 14px",fontFamily:"inherit",fontSize:".88rem",color:C.text,boxSizing:"border-box",outline:"none",marginBottom:10}}/>
                  {addSearch.trim()&&addSearchResults.length===0&&(
                    <div style={{textAlign:"center",padding:"12px 0",color:C.muted,fontSize:".82rem"}}>
                      No match found.
                      <button onClick={()=>{setForm({...emptyItem(),name:addSearch.trim()});setEditId(null);setAddStep("new");}}
                        style={{display:"block",margin:"8px auto 0",background:C.accent,border:"none",borderRadius:8,padding:"8px 20px",fontFamily:"inherit",fontWeight:700,fontSize:".82rem",color:"#fff",cursor:"pointer"}}>
                        ＋ Create "{addSearch.trim()}" as new item
                      </button>
                    </div>
                  )}
                  {addSearchResults.map(item=>{
                    const rem=n(item.qtyOnHand);
                    const bdg=rem<=0?"🔴":rem<=n(item.reorderPoint)?"🟡":"🟢";
                    return(
                      <div key={item.id} onClick={()=>{setAddTarget(item);setRestockForm({qty:"",unitCost:String(n(item.avgCost)||n(item.lastPurchasePrice)||""),supplier:item.supplier||"",notes:"",date:today});setAddStep("restock");}}
                        style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",borderRadius:9,border:`1.5px solid ${C.border}`,marginBottom:7,cursor:"pointer",background:"#fafafa",transition:"border-color .12s"}}
                        onMouseEnter={e=>e.currentTarget.style.borderColor=C.accent}
                        onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
                        <div>
                          <div style={{fontWeight:700,fontSize:".88rem",color:C.text}}>{item.name}</div>
                          <div style={{fontSize:".72rem",color:C.muted,marginTop:1}}>{item.code} · {item.category}{item.supplier?` · ${item.supplier}`:""}</div>
                        </div>
                        <div style={{textAlign:"right",flexShrink:0,marginLeft:12}}>
                          <div style={{fontWeight:700,fontSize:".88rem",color:C.text}}>{bdg} {rem} {item.unit}</div>
                          {item.avgCost>0&&<div style={{fontSize:".7rem",color:C.muted}}>₱{n(item.avgCost).toLocaleString("en-PH")}/unit</div>}
                        </div>
                      </div>
                    );
                  })}
                  {!addSearch.trim()&&(
                    <button onClick={()=>{setForm(emptyItem());setEditId(null);setAddStep("new");}}
                      style={{width:"100%",marginTop:4,background:"transparent",border:`1.5px dashed ${C.border}`,borderRadius:8,padding:"10px",fontFamily:"inherit",fontWeight:600,fontSize:".82rem",color:C.muted,cursor:"pointer"}}>
                      ＋ Create brand-new item
                    </button>
                  )}
                  <button onClick={()=>setShowAddModal(false)} style={{marginTop:14,width:"100%",background:"transparent",border:`1px solid ${C.border}`,borderRadius:8,padding:"8px",fontFamily:"inherit",fontSize:".8rem",color:C.muted,cursor:"pointer"}}>Cancel</button>
                </>)}

                {/* ── STEP 2: Restock existing ── */}
                {addStep==="restock"&&addTarget&&(<>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                    <button onClick={()=>setAddStep("search")} style={{background:"#f1f5f9",border:"none",borderRadius:7,padding:"4px 10px",fontFamily:"inherit",fontSize:".75rem",color:C.muted,cursor:"pointer"}}>← Back</button>
                    <div>
                      <div style={{fontWeight:800,fontSize:".95rem",color:C.text}}>Restock: {addTarget.name}</div>
                      <div style={{fontSize:".72rem",color:C.muted}}>Current stock: {n(addTarget.qtyOnHand)} {addTarget.unit}</div>
                    </div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    <Fld label="Qty Received" required>
                      <Inp type="number" autoFocus value={restockForm.qty} onChange={e=>setRestockForm(p=>({...p,qty:e.target.value}))} min={1} placeholder="0"/>
                    </Fld>
                    <Fld label={`Unit Cost (₱/${addTarget.unit})`}>
                      <Inp type="number" value={restockForm.unitCost} onChange={e=>setRestockForm(p=>({...p,unitCost:e.target.value}))} placeholder={String(n(addTarget.avgCost)||"")}/>
                    </Fld>
                    <Fld label="Supplier">
                      <SupplierPicker value={restockForm.supplier} onChange={v=>setRestockForm(p=>({...p,supplier:v}))} suppliers={suppliers} addSupplier={addSupplier} placeholder={addTarget.supplier||"Supplier name"}/>
                    </Fld>
                    <Fld label="Date">
                      <Inp type="date" value={restockForm.date} onChange={e=>setRestockForm(p=>({...p,date:e.target.value}))}/>
                    </Fld>
                    <div style={{gridColumn:"1/-1"}}>
                      <Fld label="Notes (optional)">
                        <Inp value={restockForm.notes} onChange={e=>setRestockForm(p=>({...p,notes:e.target.value}))} placeholder="PO ref, DR no., batch…"/>
                      </Fld>
                    </div>
                  </div>
                  {restockForm.qty&&Number(restockForm.qty)>0&&(
                    <div style={{background:"#f0fdf4",border:"1px solid #86efac",borderRadius:8,padding:"8px 12px",fontSize:".78rem",color:"#166534",marginTop:10}}>
                      Stock will increase: {n(addTarget.qtyOnHand)} → <b>{n(addTarget.qtyOnHand)+Number(restockForm.qty)} {addTarget.unit}</b>
                      {restockForm.unitCost&&` · Total value: ₱${(Number(restockForm.qty)*Number(restockForm.unitCost)).toLocaleString("en-PH")}`}
                    </div>
                  )}
                  <div style={{display:"flex",gap:8,marginTop:14}}>
                    <button onClick={commitRestock} disabled={!restockForm.qty}
                      style={{flex:1,background:restockForm.qty?C.green:"#e2e8f0",border:"none",borderRadius:8,padding:"10px",fontFamily:"inherit",fontWeight:700,fontSize:".88rem",color:restockForm.qty?"#fff":"#94a3b8",cursor:restockForm.qty?"pointer":"not-allowed"}}>
                      ✓ Confirm Restock
                    </button>
                    <button onClick={()=>setShowAddModal(false)} style={{background:"transparent",border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 16px",fontFamily:"inherit",fontWeight:600,fontSize:".82rem",color:C.muted,cursor:"pointer"}}>Cancel</button>
                  </div>
                </>)}

                {/* ── STEP 3: New item ── */}
                {addStep==="new"&&(<>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                    <button onClick={()=>setAddStep("search")} style={{background:"#f1f5f9",border:"none",borderRadius:7,padding:"4px 10px",fontFamily:"inherit",fontSize:".75rem",color:C.muted,cursor:"pointer"}}>← Back</button>
                    <div style={{fontWeight:800,fontSize:".95rem",color:C.text}}>New Inventory Item</div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    <div style={{gridColumn:"1/-1"}}><Fld label="Item Name" required><Inp autoFocus value={form.name} onChange={e=>f("name",e.target.value)} placeholder='e.g. CUTTING DISC 4"'/></Fld></div>
                    <Fld label="Category"><Sel value={form.category} onChange={e=>{f("category",e.target.value);f("subCategory",INV_CATEGORIES.find(c=>c.main===e.target.value)?.subs[0]||"Other");}}>
                      {INV_CATEGORIES.map(c=><option key={c.main}>{c.main}</option>)}</Sel></Fld>
                    <Fld label="Unit"><Sel value={form.unit} onChange={e=>f("unit",e.target.value)}>{INV_UNITS.map(u=><option key={u}>{u}</option>)}</Sel></Fld>
                    <Fld label="Opening Qty"><Inp type="number" value={form.qtyOnHand} onChange={e=>f("qtyOnHand",e.target.value)} min={0}/></Fld>
                    <Fld label="Unit Price (₱)"><Inp type="number" value={form.lastPurchasePrice} onChange={e=>{f("lastPurchasePrice",e.target.value);f("avgCost",e.target.value);}}/></Fld>
                    <Fld label="Reorder Point"><Inp type="number" value={form.reorderPoint} onChange={e=>f("reorderPoint",e.target.value)} min={0}/></Fld>
                    <Fld label="Supplier"><SupplierPicker value={form.supplier} onChange={v=>f("supplier",v)} suppliers={suppliers} addSupplier={addSupplier}/></Fld>
                    <Fld label="Ownership"><Sel value={form.ownership||"Project Stock"} onChange={e=>f("ownership",e.target.value)}>{INV_OWNERSHIP.map(o=><option key={o}>{o}</option>)}</Sel></Fld>
                <Fld label="High-value" hint="Release/return needs a Finance witness (§5.3)"><label style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:".82rem",color:"#475569",padding:"7px 0"}}><input type="checkbox" checked={!!form.highValue} onChange={e=>f("highValue",e.target.checked)}/> Requires Finance witness</label></Fld>
                    <div style={{gridColumn:"1/-1"}}><Fld label="Notes"><Inp value={form.notes} onChange={e=>f("notes",e.target.value)} placeholder="Specs, color, grade…"/></Fld></div>
                  </div>
                  <div style={{display:"flex",gap:8,marginTop:14}}>
                    <button onClick={()=>{if(!form.name)return;addInventoryItem(form);setShowAddModal(false);}} disabled={!form.name}
                      style={{flex:1,background:form.name?C.accent:"#e2e8f0",border:"none",borderRadius:8,padding:"10px",fontFamily:"inherit",fontWeight:700,fontSize:".88rem",color:form.name?"#fff":"#94a3b8",cursor:form.name?"pointer":"not-allowed"}}>
                      ＋ Create Item
                    </button>
                    <button onClick={()=>setShowAddModal(false)} style={{background:"transparent",border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 16px",fontFamily:"inherit",fontWeight:600,fontSize:".82rem",color:C.muted,cursor:"pointer"}}>Cancel</button>
                  </div>
                </>)}
              </div>
            </div>
          )}

          {/* Table */}
          <div style={{flex:1,overflow:"auto",border:`1px solid ${C.border}`,borderRadius:10,background:C.card,boxShadow:"0 1px 4px rgba(0,0,0,.05)"}}>
            <table style={{width:"100%",borderCollapse:"collapse",minWidth:900}}>
              <thead style={{position:"sticky",top:0,zIndex:10}}>
                <tr>
                  <th onClick={()=>sortBy("name")}  style={thS({minWidth:160,verticalAlign:"bottom",paddingBottom:6})} rowSpan={2}>Item{sortK==="name"?(sortD===1?" ↑":" ↓"):""}</th>
                  <th onClick={()=>sortBy("unit")}  style={thS({width:55,verticalAlign:"bottom",paddingBottom:6})} rowSpan={2}>Unit{sortK==="unit"?(sortD===1?" ↑":" ↓"):""}</th>
                  <th onClick={()=>sortBy("price")} style={thS({width:80,verticalAlign:"bottom",paddingBottom:6})} rowSpan={2}>Price{sortK==="price"?(sortD===1?" ↑":" ↓"):""}</th>
                  <th colSpan={2} style={thS({textAlign:"center",color:C.accent,borderLeft:`1px solid ${C.border}`})}>── BEG ──</th>
                  <th colSpan={2} style={thS({textAlign:"center",color:C.green,borderLeft:`1px solid ${C.border}`})}>── RECV ──</th>
                  <th colSpan={2} style={thS({textAlign:"center",color:C.yellow,borderLeft:`1px solid ${C.border}`})}>── OUT ──</th>
                  <th colSpan={2} style={thS({textAlign:"center",borderLeft:`1px solid ${C.border}`})}>── REM ──</th>
                  <th style={thS({width:90,verticalAlign:"bottom",paddingBottom:6})} rowSpan={2}>Status</th>
                  {canEdit&&<th style={thS({width:130,verticalAlign:"bottom",paddingBottom:6})} rowSpan={2}>Actions</th>}
                </tr>
                <tr>
                  <th onClick={()=>sortBy("beg")}  style={thS({color:C.accent,borderLeft:`1px solid ${C.border}`,width:48})}>Qty{sortK==="beg"?(sortD===1?" ↑":" ↓"):""}</th>
                  <th style={thS({color:C.accent,width:72})}>Val</th>
                  <th onClick={()=>sortBy("recv")} style={thS({color:C.green,borderLeft:`1px solid ${C.border}`,width:48})}>Qty{sortK==="recv"?(sortD===1?" ↑":" ↓"):""}</th>
                  <th style={thS({color:C.green,width:72})}>Val</th>
                  <th onClick={()=>sortBy("out")}  style={thS({color:C.yellow,borderLeft:`1px solid ${C.border}`,width:48})}>Qty{sortK==="out"?(sortD===1?" ↑":" ↓"):""}</th>
                  <th style={thS({color:C.yellow,width:72})}>Val</th>
                  <th onClick={()=>sortBy("rem")}  style={thS({borderLeft:`1px solid ${C.border}`,width:48})}>Qty{sortK==="rem"?(sortD===1?" ↑":" ↓"):""}</th>
                  <th style={thS({width:80})}>Bal</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length===0?(
                  <tr><td colSpan={canEdit?13:12} style={{textAlign:"center",padding:"2.5rem",color:C.muted,fontSize:12}}>
                    {inventory.length===0?"No inventory items yet — add items or import CSV.":"No items match the current filter."}
                  </td></tr>
                ):filtered.map(item=>{
                  const price=item._price;
                  const bdg=item._rem<0?{bg:C.red+"15",c:C.red,lbl:"NEGATIVE"}:item._isOut?{bg:C.yellow+"15",c:C.yellow,lbl:"DEPLETED"}:item._isLow?{bg:C.yellow+"10",c:"#b45309",lbl:"LOW"}:{bg:C.green+"15",c:C.green,lbl:"IN STOCK"};
                  const qv=qtyMap[item.id]||1;
                  return(
                    <tr key={item.id} style={{background:"#fff"}}>
                      <InlineCell value={item.name} onSave={v=>updateInventoryItem(item.id,{...item,name:v,lastUpdated:today})} color={C.text} canEdit={canEdit} C={C} tdS={tdS}
                        badge={(()=>{const gmd=isGmdAsset(item.ownership);const used=[...(usageByItem[item.id]||[])];return(
                          <div style={{display:"flex",gap:4,marginTop:3,flexWrap:"wrap",alignItems:"center"}}>
                            <span title={gmd?"GMD-owned asset — expensed when released to a project":"Bought for a specific project"} style={{display:"inline-flex",alignItems:"center",gap:3,padding:"1px 6px",borderRadius:9,fontSize:8.5,fontWeight:700,background:gmd?"#f0fdfa":"#eff6ff",color:gmd?C.teal:C.blue,border:`1px solid ${gmd?"#99f6e4":"#bfdbfe"}`}}>{gmd?"🏭 GMD":"📁 Project"}</span>
                            {used.length>0&&<span title={"Used in: "+used.join(", ")} style={{display:"inline-flex",alignItems:"center",padding:"1px 6px",borderRadius:9,fontSize:8.5,fontWeight:700,background:"#fef9c3",color:"#a16207",border:"1px solid #fde68a",maxWidth:130,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>→ {used.length===1?used[0]:used.length+" projects"}</span>}
                          </div>
                        );})()}/>
                      <InlineCell value={item.unit} onSave={v=>updateInventoryItem(item.id,{...item,unit:v.toLowerCase(),lastUpdated:today})} color={C.muted} mono canEdit={canEdit} C={C} tdS={tdS}/>
                      <InlineCell value={price} onSave={v=>updateInventoryItem(item.id,{...item,lastPurchasePrice:v,avgCost:v,lastUpdated:today})} isNum="f" color={C.muted} mono canEdit={canEdit} C={C} tdS={tdS}/>
                      {/* BEG */}
                      <td style={tdS({fontFamily:"monospace",color:C.accent,fontWeight:700,borderLeft:`1px solid ${C.border}`})}>{item._beg}</td>
                      <td style={tdS({fontFamily:"monospace",color:C.accent+"80",fontSize:11})}>{item._beg&&price?fp(item._beg*price):"—"}</td>
                      {/* RECV */}
                      <td style={tdS({fontFamily:"monospace",color:C.green,fontWeight:700,borderLeft:`1px solid ${C.border}`})}>{item._recv}</td>
                      <td style={tdS({fontFamily:"monospace",color:C.green+"80",fontSize:11})}>{item._recv&&price?fp(item._recv*price):"—"}</td>
                      {/* OUT */}
                      <td style={tdS({fontFamily:"monospace",color:C.yellow,fontWeight:700,borderLeft:`1px solid ${C.border}`})}>{item._out}</td>
                      <td style={tdS({fontFamily:"monospace",color:C.yellow+"80",fontSize:11})}>{item._out&&price?fp(item._out*price):"—"}</td>
                      {/* REM */}
                      <td style={tdS({fontFamily:"monospace",fontWeight:800,color:item._rem<0?C.red:item._rem===0?C.yellow:C.green,borderLeft:`1px solid ${C.border}`})}>{item._rem}</td>
                      <td style={tdS({fontFamily:"monospace",color:C.muted,fontSize:11})}>{item._rem>0&&price?fp(item._rem*price):"—"}</td>
                      {/* Status */}
                      <td style={tdS()}>
                        <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"2px 8px",borderRadius:20,fontSize:9,fontWeight:700,background:bdg.bg,color:bdg.c}}>
                          <span style={{width:5,height:5,borderRadius:"50%",background:bdg.c,flexShrink:0}}/>
                          {bdg.lbl}
                        </span>
                      </td>
                      {/* Actions */}
                      {canEdit&&(
                        <td style={tdS({padding:"3px 6px"})}>
                          <div style={{display:"flex",alignItems:"center",gap:2,flexWrap:"wrap"}}>
                            <button onClick={()=>quickAdjust(item,-1)} style={{padding:"3px 6px",border:`1px solid ${C.red}30`,borderRadius:4,background:"#fff",cursor:"pointer",fontSize:10,fontWeight:800,color:C.red,fontFamily:"monospace"}}>−1</button>
                            <input type="number" min="1" value={qv} onChange={e=>setQtyMap(p=>({...p,[item.id]:+e.target.value||1}))}
                              style={{width:32,background:"#fff",border:`1px solid ${C.border}`,borderRadius:4,padding:"3px 4px",color:C.text,fontSize:10,textAlign:"center",fontFamily:"monospace",outline:"none"}}/>
                            <button onClick={()=>quickAdjust(item,qv)} style={{padding:"3px 6px",border:`1px solid ${C.green}30`,borderRadius:4,background:"#fff",cursor:"pointer",fontSize:10,fontWeight:800,color:C.green,fontFamily:"monospace"}}>+</button>
                            <button onClick={()=>{setMoveForm({moveType:"OUT — Used in Project",qty:"",unitCost:"",projectId:"",notes:"",date:today});setShowMove(showMove===item.id?null:item.id);}} title="Issue to project"
                              style={{padding:"3px 7px",border:`1px solid ${C.yellow}40`,borderRadius:4,background:"#fff",cursor:"pointer",fontSize:10,fontWeight:700,color:"#b45309"}}>↑</button>
                            <button onClick={()=>{setMoveForm({moveType:"IN — Delivery",qty:"",unitCost:"",projectId:"",notes:"",date:today});setShowMove(showMove===item.id?null:item.id);}} title="Receive stock"
                              style={{padding:"3px 7px",border:`1px solid ${C.blue}40`,borderRadius:4,background:"#fff",cursor:"pointer",fontSize:10,fontWeight:700,color:C.blue}}>↓</button>
                            <button onClick={()=>openEdit(item)} style={{padding:"3px 7px",border:`1px solid ${C.border}`,borderRadius:4,background:"#fff",cursor:"pointer",fontSize:10,color:C.muted}}>✏</button>
                            {canDelete&&<button onClick={async ()=>{if((await uiConfirm("Delete "+item.name+"?")))deleteInventoryItem(item.id);}} style={{padding:"3px 7px",border:`1px solid ${C.red}30`,borderRadius:4,background:"#fff",cursor:"pointer",fontSize:10,color:C.red}}>✕</button>}
                          </div>
                          {/* Inline move form */}
                          {showMove===item.id&&(
                            <div style={{background:"#eff6ff",borderRadius:7,padding:"10px 12px",border:`1px solid #93c5fd`,marginTop:6,minWidth:260}}>
                              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                                <Fld label="Type"><Sel value={moveForm.moveType} onChange={e=>fm("moveType",e.target.value)} style={{fontSize:11,padding:"5px 8px"}}>{STOCK_MOVE_TYPES.map(t=><option key={t}>{t}</option>)}</Sel></Fld>
                                <Fld label="Qty"><Inp type="number" value={moveForm.qty} onChange={e=>fm("qty",e.target.value)} placeholder="0" min={0} style={{fontSize:11,padding:"5px 8px"}}/></Fld>
                                {moveForm.moveType.startsWith("IN")&&<Fld label="Unit Cost (₱)"><Inp type="number" value={moveForm.unitCost} onChange={e=>fm("unitCost",e.target.value)} placeholder="0.00" style={{fontSize:11,padding:"5px 8px"}}/></Fld>}
                                {moveForm.moveType.startsWith("OUT")&&<Fld label="Project"><Sel value={moveForm.projectId} onChange={e=>fm("projectId",e.target.value)} style={{fontSize:11,padding:"5px 8px"}}><option value="">— Select —</option>{wonDeals.map(d=><option key={d.id} value={d.id}>{d.client} {d.ceNo?`(${d.ceNo})`:""}</option>)}</Sel></Fld>}
                                {moveNeedsWitness(moveForm.moveType,item)&&<div style={{gridColumn:"1/-1"}}><Fld label="🔒 Finance Witness (§5.3 — required)"><Inp value={moveForm.financeWitness||""} onChange={e=>fm("financeWitness",e.target.value)} placeholder="Finance rep present at release" style={{fontSize:11,padding:"5px 8px"}}/></Fld></div>}
                                <div style={{gridColumn:"1/-1"}}><Fld label="Notes"><Inp value={moveForm.notes} onChange={e=>fm("notes",e.target.value)} placeholder="DR #, PO ref…" style={{fontSize:11,padding:"5px 8px"}}/></Fld></div>
                              </div>
                              <div style={{display:"flex",gap:6}}>
                                <button onClick={submitMove} disabled={!moveForm.qty} style={{background:moveForm.qty?"#1d4ed8":"#e2e8f0",border:"none",borderRadius:6,padding:"6px 14px",fontFamily:"inherit",fontWeight:700,fontSize:".78rem",color:moveForm.qty?"#fff":"#94a3b8",cursor:moveForm.qty?"pointer":"not-allowed"}}>Save</button>
                                <button onClick={()=>setShowMove(null)} style={{background:"transparent",border:`1px solid ${C.border}`,borderRadius:6,padding:"6px 10px",fontFamily:"inherit",fontWeight:600,fontSize:".75rem",color:C.muted,cursor:"pointer"}}>Cancel</button>
                              </div>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
                {canEdit&&filtered.length>0&&(
                  <tr><td colSpan={canEdit?13:12} style={{padding:"7px 10px",color:C.muted,fontSize:11,cursor:"pointer",fontStyle:"italic",borderTop:`1px dashed ${C.border}`}} onClick={openAddModal}>＋ Click to add a new item…</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── ALERTS TAB ──────────────────────────────────────────────────── */}
      {tab==="alerts"&&(
        <div style={{overflowY:"auto",flex:1}}>
          {(lowStock.length+outOfStk.length+negStock.length)===0?(
            <div style={{textAlign:"center",padding:"3rem",color:C.green,fontSize:14}}>✅ All items are in stock</div>
          ):<>
            {negStock.length>0&&(
              <><div style={{fontSize:10,color:C.red,textTransform:"uppercase",letterSpacing:".6px",fontWeight:700,marginBottom:8}}>Negative Stock ({negStock.length})</div>
              {negStock.map(i=>(
                <div key={i.id} style={{display:"flex",alignItems:"center",gap:10,padding:"11px 14px",borderRadius:9,marginBottom:7,background:C.red+"0a",border:`1px solid ${C.red}25`}}>
                  <span>🔴</span>
                  <div style={{flex:1}}><div style={{fontWeight:700,fontSize:12,color:C.text}}>{i.name}</div><div style={{fontSize:10,color:C.red,fontFamily:"monospace"}}>Stock: {i._rem} {i.unit} — RESTOCK IMMEDIATELY</div></div>
                  {canEdit&&addPR&&<button onClick={()=>createReorderPR(i)} title="Draft a purchase request for procurement" style={{background:"#fff",border:`1px solid ${C.blue}`,borderRadius:7,padding:"5px 10px",fontFamily:"inherit",fontWeight:700,fontSize:".75rem",color:C.blue,cursor:"pointer",whiteSpace:"nowrap"}}>🛒 Create PR</button>}
                  {canEdit&&<button onClick={()=>{setTab("inventory");setShowMove(i.id);setMoveForm({moveType:"IN — Delivery",qty:"",unitCost:String(i._price),projectId:"",notes:"",date:today});}} style={{background:C.green,border:"none",borderRadius:7,padding:"5px 12px",fontFamily:"inherit",fontWeight:700,fontSize:".75rem",color:"#fff",cursor:"pointer"}}>↓ Receive</button>}
                </div>
              ))}</>
            )}
            {outOfStk.length>0&&(
              <><div style={{fontSize:10,color:C.yellow,textTransform:"uppercase",letterSpacing:".6px",fontWeight:700,margin:"12px 0 8px"}}>Depleted — Zero Stock ({outOfStk.length})</div>
              {outOfStk.map(i=>(
                <div key={i.id} style={{display:"flex",alignItems:"center",gap:10,padding:"11px 14px",borderRadius:9,marginBottom:7,background:C.yellow+"0a",border:`1px solid ${C.yellow}25`}}>
                  <span>🟡</span>
                  <div style={{flex:1}}><div style={{fontWeight:700,fontSize:12,color:C.text}}>{i.name}</div><div style={{fontSize:10,color:"#b45309",fontFamily:"monospace"}}>Depleted · Beginning: {i._beg} {i.unit}</div></div>
                  {canEdit&&addPR&&<button onClick={()=>createReorderPR(i)} title="Draft a purchase request for procurement" style={{background:"#fff",border:`1px solid ${C.blue}`,borderRadius:7,padding:"5px 10px",fontFamily:"inherit",fontWeight:700,fontSize:".75rem",color:C.blue,cursor:"pointer",whiteSpace:"nowrap"}}>🛒 Create PR</button>}
                  {canEdit&&<button onClick={()=>{setTab("inventory");setShowMove(i.id);setMoveForm({moveType:"IN — Delivery",qty:"",unitCost:String(i._price),projectId:"",notes:"",date:today});}} style={{background:C.green,border:"none",borderRadius:7,padding:"5px 12px",fontFamily:"inherit",fontWeight:700,fontSize:".75rem",color:"#fff",cursor:"pointer"}}>↓ Receive</button>}
                </div>
              ))}</>
            )}
            {lowStock.length>0&&(
              <><div style={{fontSize:10,color:"#b45309",textTransform:"uppercase",letterSpacing:".6px",fontWeight:700,margin:"12px 0 8px"}}>Low Stock — Below Reorder Point ({lowStock.length})</div>
              {lowStock.map(i=>(
                <div key={i.id} style={{display:"flex",alignItems:"center",gap:10,padding:"11px 14px",borderRadius:9,marginBottom:7,background:"#fffbeb",border:"1px solid #fde68a"}}>
                  <span>⚠️</span>
                  <div style={{flex:1}}><div style={{fontWeight:700,fontSize:12,color:C.text}}>{i.name}</div><div style={{fontSize:10,color:"#b45309",fontFamily:"monospace"}}>{i._rem} {i.unit} remaining · Reorder at {n(i.reorderPoint)}</div></div>
                  {canEdit&&addPR&&<button onClick={()=>createReorderPR(i)} title="Draft a purchase request for procurement" style={{background:"#fff",border:`1px solid ${C.blue}`,borderRadius:7,padding:"5px 10px",fontFamily:"inherit",fontWeight:700,fontSize:".75rem",color:C.blue,cursor:"pointer",whiteSpace:"nowrap"}}>🛒 Create PR</button>}
                </div>
              ))}</>
            )}
          </>}
        </div>
      )}

      {/* ── DEMAND FORECAST TAB ──────────────────────────────────────────── */}
      {tab==="demand"&&(
        <div>
          {/* BOM Import — per project */}
          <div style={{background:"#fff",border:"1.5px solid #e0e7ff",borderRadius:12,padding:"14px 18px",marginBottom:16}}>
            <div style={{fontWeight:800,color:"#4f46e5",fontSize:".88rem",marginBottom:8}}>📥 Import BOM from Excel</div>
            <div style={{fontSize:".75rem",color:"#64748b",marginBottom:12}}>QS uploads the Excel BOM file per project. Materials are extracted from the BOM sheet and used to forecast demand against current stock.</div>
            <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
              <select value={bomModal||""} onChange={e=>setBomModal(e.target.value||null)} style={{border:"1.5px solid #e2e8f0",borderRadius:8,padding:"7px 12px",fontFamily:"inherit",fontSize:".8rem",color:"#0f172a",background:"#fff",minWidth:220}}>
                <option value="">— Select Project —</option>
                {deals.map(d=><option key={d.id} value={d.id}>{d.client}{d.ceNo?" · "+d.ceNo:""}</option>)}
              </select>
              {bomModal&&<input value={bomLabel} onChange={e=>setBomLabel(e.target.value)} placeholder="Label (e.g. Original BOQ, Addendum 1)" style={{border:"1.5px solid #e2e8f0",borderRadius:8,padding:"7px 12px",fontFamily:"inherit",fontSize:".8rem",flex:1,minWidth:180,boxSizing:"border-box"}}/>}
              {bomModal&&(
                <label style={{background:"#4f46e5",border:"none",borderRadius:8,padding:"7px 16px",fontFamily:"inherit",fontSize:".8rem",color:"#fff",cursor:"pointer",fontWeight:700,whiteSpace:"nowrap"}}>
                  {bomParsing?"⏳ Parsing…":"📂 Choose Excel File"}
                  <input type="file" accept=".xlsx,.xls" style={{display:"none"}} onChange={e=>handleBomFile(e.target.files[0])} disabled={bomParsing}/>
                </label>
              )}
            </div>
            {bomPreview&&(
              <div style={{marginTop:12,background:"#f0fdf4",border:"1.5px solid #86efac",borderRadius:10,padding:"10px 14px"}}>
                <div style={{fontWeight:700,color:"#15803d",marginBottom:6,fontSize:".82rem"}}>✓ {bomPreview.totalItems} materials parsed{bomPreview.projectName?" — "+bomPreview.projectName:""}{bomPreview.quotationNo?" · QN-"+bomPreview.quotationNo:""}</div>
                <div style={{maxHeight:160,overflowY:"auto",fontSize:".72rem",color:"#374151",marginBottom:10}}>
                  {bomPreview.materials.slice(0,20).map((m,i)=>(
                    <div key={i} style={{display:"flex",gap:10,borderBottom:"1px solid #dcfce7",padding:"3px 0"}}>
                      <span style={{color:"#6b7280",minWidth:130,fontSize:".65rem"}}>{m.boqItem}</span>
                      <span style={{fontWeight:600,flex:1}}>{m.name}</span>
                      <span style={{color:"#059669",minWidth:80,textAlign:"right"}}>{m.qty} {m.unit}</span>
                    </div>
                  ))}
                  {bomPreview.materials.length>20&&<div style={{color:"#6b7280",marginTop:4}}>…and {bomPreview.materials.length-20} more</div>}
                </div>
                <button onClick={saveBomImport} style={{background:"#059669",border:"none",borderRadius:8,padding:"8px 20px",fontFamily:"inherit",fontSize:".82rem",color:"#fff",cursor:"pointer",fontWeight:700}}>💾 Save to Project</button>
              </div>
            )}
          </div>

          {/* Demand vs Stock */}
          <div style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:12,padding:"14px 18px"}}>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12,flexWrap:"wrap"}}>
              <div style={{fontWeight:800,color:"#0f172a",fontSize:".88rem"}}>🔮 Demand vs Stock</div>
              <span style={{fontSize:".7rem",color:"#64748b"}}>Aggregated across all active project BOMs</span>
              <input value={demandSearch} onChange={e=>setDemandSearch(e.target.value)} placeholder="Search material…" style={{marginLeft:"auto",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"6px 12px",fontFamily:"inherit",fontSize:".78rem",outline:"none",minWidth:180}}/>
            </div>
            {allDemand.length===0?(
              <div style={{textAlign:"center",padding:"32px",color:"#94a3b8",fontSize:".84rem"}}>No BOM imports yet. Import an Excel BOM above to see demand forecasts.</div>
            ):(()=>{
              const filtered=allDemand.filter(d=>!demandSearch||d.name.toLowerCase().includes(demandSearch.toLowerCase()));
              const gaps=filtered.filter(d=>d.gap>0);
              const ok=filtered.filter(d=>d.gap===0&&d.invItem);
              const unmatched=filtered.filter(d=>d.invItem===null);
              return(
                <div>
                  {gaps.length>0&&(
                    <div style={{marginBottom:14}}>
                      <div style={{fontSize:".68rem",fontWeight:700,color:"#dc2626",textTransform:"uppercase",letterSpacing:".7px",marginBottom:6}}>⚠ Shortfalls — {gaps.length} items</div>
                      {gaps.map((d,i)=>(
                        <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 10px",background:"#fef2f2",borderRadius:8,marginBottom:4,flexWrap:"wrap"}}>
                          <div style={{flex:2,fontWeight:700,fontSize:".8rem",color:"#0f172a"}}>{d.name}</div>
                          <div style={{fontSize:".72rem",color:"#64748b",flex:1}}>{d.unit}</div>
                          <div style={{fontSize:".74rem",color:"#3b82f6",fontWeight:600}}>Need: {d.totalQty}</div>
                          <div style={{fontSize:".74rem",color:"#059669",fontWeight:600}}>On hand: {d.onHand}</div>
                          <div style={{fontSize:".74rem",color:"#dc2626",fontWeight:800,background:"#fee2e2",borderRadius:6,padding:"2px 8px"}}>Gap: {d.gap} {d.unit}</div>
                          <div style={{fontSize:".65rem",color:"#94a3b8",width:"100%",paddingLeft:2}}>{d.projects.map(p=>p.client).join(" · ")}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {ok.length>0&&(
                    <div style={{marginBottom:14}}>
                      <div style={{fontSize:".68rem",fontWeight:700,color:"#059669",textTransform:"uppercase",letterSpacing:".7px",marginBottom:6}}>✓ Covered — {ok.length} items</div>
                      {ok.map((d,i)=>(
                        <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 10px",background:"#f0fdf4",borderRadius:8,marginBottom:3,flexWrap:"wrap"}}>
                          <div style={{flex:2,fontWeight:600,fontSize:".78rem",color:"#0f172a"}}>{d.name}</div>
                          <div style={{fontSize:".72rem",color:"#064e3b"}}>Need {d.totalQty} · On hand {d.onHand} {d.unit}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {unmatched.length>0&&(
                    <div>
                      <div style={{fontSize:".68rem",fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:".7px",marginBottom:6}}>— Not in Inventory ({unmatched.length} items)</div>
                      <div style={{fontSize:".72rem",color:"#64748b",lineHeight:1.8}}>{unmatched.map(d=>d.name).join(" · ")}</div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* BOM imports per project summary */}
          {deals.some(d=>projs[d.id]?.materialsForecast?.length>0)&&(
            <div style={{background:"#f8fafc",border:"1.5px solid #e2e8f0",borderRadius:12,padding:"14px 18px",marginTop:14}}>
              <div style={{fontWeight:700,color:"#0f172a",fontSize:".84rem",marginBottom:10}}>Imported BOMs by Project</div>
              {deals.filter(d=>projs[d.id]?.materialsForecast?.length>0).map(d=>(
                <div key={d.id} style={{marginBottom:10}}>
                  <div style={{fontWeight:700,fontSize:".78rem",color:"#1e293b"}}>{d.client}{d.ceNo?" · "+d.ceNo:""}</div>
                  {(projs[d.id]?.materialsForecast||[]).map((f,fi)=>(
                    <div key={fi} style={{display:"flex",gap:10,alignItems:"center",fontSize:".72rem",color:"#64748b",marginTop:3,paddingLeft:10}}>
                      <span style={{fontWeight:600,color:"#4f46e5"}}>{f.label}</span>
                      <span>{f.date}</span>
                      <span>{f.items?.length} materials</span>
                      <span>by {f.importedBy}</span>
                      <button onClick={()=>{upProjs(ps=>({...ps,[d.id]:{...ps[d.id],materialsForecast:(ps[d.id]?.materialsForecast||[]).filter((_,i)=>i!==fi)}}));toastEmit&&toastEmit("BOM import removed","success");}} style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:".65rem",padding:0,marginLeft:"auto"}}>✕ Remove</button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── DELIVERY RECEIPTS LEDGER (purchasing → warehouse → finance) ───── */}
      {tab==="receipts"&&(()=>{
        const fmtM=v=>"₱"+Number(v||0).toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2});
        const q=rxSearch.trim().toLowerCase();
        const list=q?receipts.filter(r=>[r.drNo,r.pr.poNumber,r.pr.itemName||r.pr.item,r.pr.supplier,r.deal?.client].some(v=>String(v||"").toLowerCase().includes(q))):receipts;
        const rxVal=r=>r.standalone?(Number(r.value)||0):(Number(r.pr.actUnitCost||r.pr.estUnitCost||r.pr.estimatedCost||0)*r.qty);
        const totVal=list.reduce((s,r)=>s+rxVal(r),0);
        const payClr=st=>/logged|paid|expense/i.test(st||"")?C.green:/pending/i.test(st||"")?C.accent:C.muted;
        return(
        <div style={{overflowY:"auto",flex:1,paddingBottom:20}}>
          <div style={{background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:8,padding:"9px 14px",fontSize:".78rem",color:"#1d4ed8",marginBottom:10}}>
            🧾 <strong>Delivery Receipts</strong> — every received PO as a receipt document, linked to its purchase order and finance status. Print a branded GRN/DR for any line, or log a standalone DR.
          </div>
          <div style={{display:"flex",gap:8,marginBottom:10}}>
            <input value={rxSearch} onChange={e=>setRxSearch(e.target.value)} placeholder="Search DR#, PO#, item, supplier, project…"
              style={{flex:1,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 12px",fontFamily:"inherit",fontSize:12,color:C.text,background:"#fff",boxSizing:"border-box"}}/>
            {canEdit&&saveDr&&<button onClick={()=>openDr(null)} style={{background:C.accent,border:"none",borderRadius:8,padding:"8px 16px",fontFamily:"inherit",fontWeight:700,fontSize:".8rem",color:"#fff",cursor:"pointer",whiteSpace:"nowrap"}}>＋ New DR</button>}
          </div>
          {list.length===0?(
            <div style={{textAlign:"center",padding:"3rem",color:C.muted,fontSize:13}}>{receipts.length===0?"No delivery receipts yet — receive a PO in the Deliveries tab.":"No receipts match your search."}</div>
          ):(
            <div style={{background:C.card,borderRadius:10,border:`1px solid ${C.border}`,overflow:"hidden"}}>
              <div style={{overflowX:"auto"}}><div style={{minWidth:860}}>
                <div style={{display:"grid",gridTemplateColumns:"100px 1.6fr 1fr 1fr 60px 110px 120px 70px",background:"#1e293b",padding:"8px 14px",gap:8}}>
                  {["Date","Item / DR#","Supplier","Project","Qty","Value","Finance","Print"].map((h,hi)=>(
                    <div key={h} style={{fontSize:9,fontWeight:700,color:"rgba(255,255,255,.6)",textTransform:"uppercase",letterSpacing:".5px",textAlign:hi>=4&&hi<=5?"right":"left"}}>{h}</div>
                  ))}
                </div>
                {list.map((r,i)=>{
                  const pr=r.pr;
                  const uc=Number(pr.actUnitCost||pr.estUnitCost||pr.estimatedCost||0);
                  const isStk=(pr.dealId||pr.projectId)==="__gmd_stocks__"||pr.projectName==="GMD Stocks"||(!r.deal&&!pr.dealId&&!pr.projectId);
                  const payStatus=pr.paymentStatus||pr.acctStatus||"";
                  return(
                  <div key={r.key} style={{display:"grid",gridTemplateColumns:"100px 1.6fr 1fr 1fr 60px 110px 120px 70px",padding:"9px 14px",gap:8,borderBottom:`1px solid ${C.border}`,background:i%2?"#fafafa":"#fff",alignItems:"center"}}>
                    <div style={{fontSize:10,color:C.muted,fontFamily:"monospace"}}>{r.date||"—"}</div>
                    <div style={{minWidth:0}}>
                      <div style={{fontSize:11,fontWeight:600,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{pr.itemName||pr.item||"—"}</div>
                      <div style={{display:"flex",gap:5,marginTop:2,flexWrap:"wrap"}}>
                        {r.drNo&&<span style={{fontSize:9,color:C.teal,fontWeight:700}}>DR {r.drNo}</span>}
                        {pr.poNumber&&<span style={{fontSize:9,color:C.blue,fontWeight:700}}>#{pr.poNumber}</span>}
                        <span style={{fontSize:9,padding:"1px 6px",borderRadius:10,background:pr.status==="Delivered"?"#dcfce7":"#fef9c3",color:pr.status==="Delivered"?C.green:"#a16207",fontWeight:700}}>{pr.status}</span>
                      </div>
                    </div>
                    <div style={{fontSize:11,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{pr.supplier||"—"}</div>
                    <div style={{overflow:"hidden"}}>
                      <span style={{display:"inline-flex",alignItems:"center",gap:4,maxWidth:"100%",padding:"2px 8px",borderRadius:10,fontSize:9,fontWeight:700,background:isStk?"#f0fdfa":"#eff6ff",color:isStk?C.teal:C.blue,border:`1px solid ${isStk?"#99f6e4":"#bfdbfe"}`,overflow:"hidden"}}>
                        <span style={{flexShrink:0}}>{isStk?"🏭":"📁"}</span>
                        <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{isStk?"GMD Stock":(r.deal?.client||pr.projectName||"Project")}</span>
                      </span>
                    </div>
                    <div style={{fontSize:12,fontWeight:700,color:C.text,textAlign:"right",fontFamily:"monospace"}}>{r.qty}</div>
                    <div style={{fontSize:11,fontWeight:700,color:rxVal(r)>0?C.teal:C.muted,textAlign:"right",fontFamily:"monospace"}}>{rxVal(r)>0?fmtM(rxVal(r)):"—"}</div>
                    <div style={{fontSize:10}}>{r.standalone?<span style={{color:C.teal,fontWeight:700}}>Manual DR</span>:payStatus?<span style={{color:payClr(payStatus),fontWeight:700}}>{payStatus}</span>:<span style={{color:C.muted}}>—</span>}</div>
                    <div style={{display:"flex",gap:3}}>
                      {printDR&&<button onClick={()=>printDR(pr,r.qty||pr.qty,r.drNo,r.deal)} title="Print delivery receipt / GRN" style={{fontSize:9,padding:"4px 7px",border:`1px solid ${C.blue}`,borderRadius:5,background:"#fff",color:C.blue,cursor:"pointer",fontWeight:700,fontFamily:"inherit",whiteSpace:"nowrap"}}>🖨</button>}
                      {r.standalone&&canEdit&&saveDr&&<button onClick={()=>openDr(r.dr)} title="Edit DR" style={{fontSize:9,padding:"4px 7px",border:`1px solid ${C.border}`,borderRadius:5,background:"#fff",color:C.muted,cursor:"pointer",fontWeight:700,fontFamily:"inherit"}}>✏</button>}
                      {r.standalone&&canDelete&&deleteDr&&<button onClick={()=>{if(window.confirm("Delete this delivery receipt?"))deleteDr(r.dr.id);}} title="Delete DR" style={{fontSize:9,padding:"4px 7px",border:`1px solid ${C.red}`,borderRadius:5,background:"#fff",color:C.red,cursor:"pointer",fontWeight:700,fontFamily:"inherit"}}>✕</button>}
                    </div>
                  </div>
                  );
                })}
                <div style={{display:"grid",gridTemplateColumns:"100px 1.6fr 1fr 1fr 60px 110px 120px 70px",padding:"10px 14px",gap:8,background:"#1e293b",alignItems:"center"}}>
                  <div style={{gridColumn:"1/5",color:"rgba(255,255,255,.7)",fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".5px"}}>Total Received Value ({list.length})</div>
                  <div/>
                  <div style={{fontSize:13,fontFamily:"monospace",fontWeight:800,color:C.accent,textAlign:"right"}}>{fmtM(totVal)}</div>
                  <div/><div/>
                </div>
              </div></div>
            </div>
          )}
        </div>
        );
      })()}

      {/* ── PROJECTS CONSUMPTION TAB (warehouse → finance costing) ────────── */}
      {tab==="projects"&&(()=>{
        const totOut=projConsumption.reduce((s,g)=>s+g.outVal,0);
        const fmtV=v=>v>=1000000?"₱"+(v/1000000).toFixed(1)+"M":v>=1000?"₱"+(v/1000).toFixed(0)+"k":fp(v);
        return(
        <div style={{overflowY:"auto",flex:1,paddingBottom:20}}>
          <div style={{background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:8,padding:"9px 14px",fontSize:".78rem",color:"#1d4ed8",marginBottom:10}}>
            🏗 <strong>Material consumption by project</strong> — stock issued/dispatched to each job, valued at cost. Mirrors what's expensed to the project in Finance, so warehouse draw-downs and the expense ledger can be reconciled.
          </div>
          {projConsumption.length===0?(
            <div style={{textAlign:"center",padding:"3rem",color:C.muted,fontSize:13}}>No project material movements yet. Dispatch stock to a project to see it here.</div>
          ):(
            <div style={{background:C.card,borderRadius:10,border:`1px solid ${C.border}`,overflow:"hidden"}}>
              <div style={{display:"grid",gridTemplateColumns:"2fr 90px 120px 90px 120px 40px",background:"#1e293b",padding:"8px 14px",gap:8}}>
                {["Project","Out Qty","Consumed Value","In Qty","Returned/In Value",""].map((h,hi)=>(
                  <div key={h+hi} style={{fontSize:9,fontWeight:700,color:"rgba(255,255,255,.6)",textTransform:"uppercase",letterSpacing:".5px",textAlign:hi===0?"left":"right"}}>{h}</div>
                ))}
              </div>
              {projConsumption.map((g,gi)=>{
                const open=expProj===g.pid;
                return(
                <div key={g.pid} style={{borderBottom:`1px solid ${C.border}`,background:gi%2?"#fafafa":"#fff"}}>
                  <div onClick={()=>setExpProj(open?null:g.pid)} style={{display:"grid",gridTemplateColumns:"2fr 90px 120px 90px 120px 40px",padding:"9px 14px",gap:8,alignItems:"center",cursor:"pointer"}}>
                    <div style={{minWidth:0}}>
                      <div style={{fontSize:12,fontWeight:700,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{g.client}</div>
                      <div style={{fontSize:9,color:C.muted}}>{g.items.length} item{g.items.length!==1?"s":""} · {g.moves} move{g.moves!==1?"s":""}</div>
                    </div>
                    <div style={{fontSize:12,fontWeight:700,color:C.yellow,textAlign:"right",fontFamily:"monospace"}}>{g.outQty}</div>
                    <div style={{fontSize:12,fontWeight:800,color:C.teal,textAlign:"right",fontFamily:"monospace"}}>{fmtV(g.outVal)}</div>
                    <div style={{fontSize:12,color:g.inQty?C.green:C.muted,textAlign:"right",fontFamily:"monospace"}}>{g.inQty||"—"}</div>
                    <div style={{fontSize:11,color:g.inVal?C.green:C.muted,textAlign:"right",fontFamily:"monospace"}}>{g.inVal?fmtV(g.inVal):"—"}</div>
                    <div style={{textAlign:"right",color:C.muted,fontSize:12}}>{open?"▾":"▸"}</div>
                  </div>
                  {open&&(
                    <div style={{padding:"2px 14px 10px 26px",background:"#f8fafc"}}>
                      {g.items.map((it,ii)=>(
                        <div key={it.name+ii} style={{display:"grid",gridTemplateColumns:"2fr 90px 120px",gap:8,padding:"4px 0",borderBottom:ii<g.items.length-1?`1px solid ${C.border}`:"none"}}>
                          <div style={{fontSize:11,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{it.name}</div>
                          <div style={{fontSize:11,color:C.muted,textAlign:"right",fontFamily:"monospace"}}>{it.outQty} {it.unit}</div>
                          <div style={{fontSize:11,color:C.teal,textAlign:"right",fontFamily:"monospace"}}>{fmtV(it.outVal)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                );
              })}
              <div style={{display:"grid",gridTemplateColumns:"2fr 90px 120px 90px 120px 40px",padding:"10px 14px",gap:8,background:"#1e293b",alignItems:"center"}}>
                <div style={{color:"rgba(255,255,255,.7)",fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".5px"}}>Total Consumed Value</div>
                <div/>
                <div style={{fontSize:14,fontFamily:"monospace",fontWeight:800,color:C.accent,textAlign:"right"}}>{fmtV(totOut)}</div>
                <div/><div/><div/>
              </div>
            </div>
          )}
        </div>
        );
      })()}

      {/* ── TOOLS / EQUIPMENT TAB ────────────────────────────────────────── */}
      {tab==="tools"&&(()=>{
        const sorted=[...(tools||[])].sort((a,b)=>{const o={Overdue:0,Borrowed:1,Returned:2};const sa=o[toolStatus(a)],sb=o[toolStatus(b)];return sa!==sb?sa-sb:String(b.borrowedDate||"").localeCompare(String(a.borrowedDate||""));});
        const badge=st=>st==="Overdue"?{bg:C.red+"15",c:C.red}:st==="Borrowed"?{bg:C.accent+"15",c:C.accent}:{bg:C.green+"15",c:C.green};
        const putTool=saveTool||(upTools&&(rec=>upTools(ts=>ts.some(x=>x.id===rec.id)?ts.map(x=>x.id===rec.id?rec:x):[rec,...ts])));
        const rmTool=deleteTool||(upTools&&(id=>upTools(ts=>ts.filter(x=>x.id!==id))));
        const addTool=()=>{
          if(!toolForm.name.trim()||!toolForm.borrower.trim()){toastEmit&&toastEmit("Tool name and borrower are required.","error");return;}
          if(!putTool){toastEmit&&toastEmit("Tools register unavailable in this view.","error");return;}
          putTool({id:uid(),...toolForm,name:toolForm.name.trim(),borrower:toolForm.borrower.trim(),actualReturn:"",createdBy:session?.name||role||""});
          setToolForm({name:"",borrower:"",borrowedDate:today,expectedReturn:"",notes:""});
          toastEmit&&toastEmit(`🔧 ${toolForm.name.trim()} checked out to ${toolForm.borrower.trim()}`,"success");
        };
        const markReturned=(t)=>putTool&&putTool({...t,actualReturn:today});
        const reBorrow=(t)=>putTool&&putTool({...t,actualReturn:""});
        const delTool=(t)=>rmTool&&rmTool(t.id);
        return(
        <div style={{overflowY:"auto",flex:1,paddingBottom:20}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:8,marginBottom:10}}>
            {[{l:"Tools Tracked",v:(tools||[]).length,c:C.blue},{l:"Checked Out",v:toolsOut,c:toolsOut?C.accent:C.muted},{l:"Overdue",v:toolsOverdue,c:toolsOverdue?C.red:C.muted}].map(k=>(
              <div key={k.l} style={{background:C.card,borderRadius:8,padding:"10px 14px",border:`1px solid ${C.border}`}}>
                <div style={{fontSize:16,fontWeight:800,color:k.c,fontFamily:"monospace"}}>{k.v}</div>
                <div style={{fontSize:9,color:C.muted,textTransform:"uppercase",letterSpacing:".6px",marginTop:3}}>{k.l}</div>
              </div>
            ))}
          </div>
          {canEdit&&(
            <div style={{background:C.card,borderRadius:10,border:`1px solid ${C.border}`,padding:"12px 14px",marginBottom:10,display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end"}}>
              <div style={{flex:"2 1 160px",minWidth:140}}><div style={{fontSize:9,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>Tool / Equipment *</div><input value={toolForm.name} onChange={e=>setToolForm(p=>({...p,name:e.target.value}))} placeholder="e.g. Bosch drill" style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:7,padding:"6px 10px",fontFamily:"inherit",fontSize:12,color:C.text,background:"#fff",boxSizing:"border-box"}}/></div>
              <div style={{flex:"1 1 140px",minWidth:120}}><div style={{fontSize:9,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>Borrower *</div><input value={toolForm.borrower} onChange={e=>setToolForm(p=>({...p,borrower:e.target.value}))} placeholder="Name" style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:7,padding:"6px 10px",fontFamily:"inherit",fontSize:12,color:C.text,background:"#fff",boxSizing:"border-box"}}/></div>
              <div style={{flex:"1 1 120px",minWidth:110}}><div style={{fontSize:9,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>Borrowed</div><input type="date" value={toolForm.borrowedDate} onChange={e=>setToolForm(p=>({...p,borrowedDate:e.target.value}))} style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:7,padding:"6px 10px",fontFamily:"inherit",fontSize:12,color:C.text,background:"#fff",boxSizing:"border-box"}}/></div>
              <div style={{flex:"1 1 120px",minWidth:110}}><div style={{fontSize:9,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>Due Back</div><input type="date" value={toolForm.expectedReturn} onChange={e=>setToolForm(p=>({...p,expectedReturn:e.target.value}))} style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:7,padding:"6px 10px",fontFamily:"inherit",fontSize:12,color:C.text,background:"#fff",boxSizing:"border-box"}}/></div>
              <button onClick={addTool} style={{padding:"7px 16px",border:"none",borderRadius:7,background:C.accent,color:"#fff",fontFamily:"inherit",fontSize:12,fontWeight:700,cursor:"pointer",alignSelf:"flex-end",whiteSpace:"nowrap"}}>+ Check Out</button>
            </div>
          )}
          {sorted.length===0?(
            <div style={{textAlign:"center",padding:"3rem",color:C.muted,fontSize:13}}>No tools tracked yet. Check out a tool to start the register.</div>
          ):(
            <div style={{background:C.card,borderRadius:10,border:`1px solid ${C.border}`,overflow:"hidden"}}>
              <div style={{overflowX:"auto"}}><div style={{minWidth:720}}>
                <div style={{display:"grid",gridTemplateColumns:"1.6fr 1.2fr 100px 100px 90px 110px",background:"#1e293b",padding:"8px 14px",gap:8}}>
                  {["Tool","Borrower","Borrowed","Due Back","Status","Action"].map(h=><div key={h} style={{fontSize:9,fontWeight:700,color:"rgba(255,255,255,.6)",textTransform:"uppercase",letterSpacing:".5px"}}>{h}</div>)}
                </div>
                {sorted.map((t,i)=>{const st=toolStatus(t);const b=badge(st);return(
                  <div key={t.id} style={{display:"grid",gridTemplateColumns:"1.6fr 1.2fr 100px 100px 90px 110px",padding:"9px 14px",gap:8,borderBottom:`1px solid ${C.border}`,background:i%2?"#fafafa":"#fff",alignItems:"center"}}>
                    <div style={{minWidth:0}}><div style={{fontSize:12,fontWeight:600,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.name}</div>{t.notes&&<div style={{fontSize:9,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.notes}</div>}</div>
                    <div style={{fontSize:11,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.borrower}</div>
                    <div style={{fontSize:10,color:C.muted,fontFamily:"monospace"}}>{t.borrowedDate||"—"}</div>
                    <div style={{fontSize:10,color:st==="Overdue"?C.red:C.muted,fontFamily:"monospace",fontWeight:st==="Overdue"?700:400}}>{t.expectedReturn||"—"}</div>
                    <div><span style={{fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:20,background:b.bg,color:b.c}}>{st}{st==="Returned"&&t.actualReturn?` ${t.actualReturn}`:""}</span></div>
                    <div style={{display:"flex",gap:4}}>
                      {canEdit&&(t.actualReturn?<button onClick={()=>reBorrow(t)} style={{fontSize:9,padding:"3px 8px",border:`1px solid ${C.accent}`,borderRadius:5,background:"#fff",color:C.accent,cursor:"pointer",fontWeight:700,fontFamily:"inherit"}}>Re-issue</button>:<button onClick={()=>markReturned(t)} style={{fontSize:9,padding:"3px 8px",border:"none",borderRadius:5,background:C.green,color:"#fff",cursor:"pointer",fontWeight:700,fontFamily:"inherit"}}>↩ Return</button>)}
                      {canEdit&&<button onClick={()=>delTool(t)} title="Remove" style={{fontSize:9,padding:"3px 7px",border:`1px solid ${C.border}`,borderRadius:5,background:"#fff",color:C.muted,cursor:"pointer",fontWeight:700,fontFamily:"inherit"}}>✕</button>}
                    </div>
                  </div>
                );})}
              </div></div>
            </div>
          )}
        </div>
        );
      })()}

      {/* ── LOG TAB ─────────────────────────────────────────────────────── */}
      {tab==="log"&&(
       <div style={{flex:1,display:"flex",flexDirection:"column",minHeight:0}}>
        {canEdit&&(
          <div style={{display:"flex",justifyContent:"flex-end",marginBottom:8}}>
            <button onClick={()=>{setShowMoveImport(true);setMoveImpText("");setMoveImpRows([]);}} style={{background:"#fff",border:`1px solid ${C.accent}`,borderRadius:8,padding:"6px 14px",fontFamily:"inherit",fontWeight:700,fontSize:".78rem",color:C.accent,cursor:"pointer"}}>⬆ Bulk Import Movements</button>
          </div>
        )}
        <div style={{flex:1,overflowY:"auto",background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"4px 0"}}>
          {stocklog.length===0?(
            <div style={{textAlign:"center",padding:"3rem",color:C.muted}}>No stock movements yet</div>
          ):[...stocklog].sort((a,b)=>b.date>a.date?1:-1).map((mv,i)=>{
            const item=inventory.find(x=>x.id===mv.itemId);
            const clr=mv.moveType.startsWith("IN")?C.green:mv.moveType.startsWith("OUT")?C.yellow:C.muted;
            const proj=wonDeals.find(d=>d.id===mv.projectId);
            return(
              <div key={mv.id||i} style={{display:"flex",gap:10,padding:"8px 16px",borderBottom:`1px solid ${C.border}`}}>
                <div style={{width:7,height:7,borderRadius:"50%",flexShrink:0,marginTop:5,background:clr}}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,color:C.text,fontWeight:600}}>{item?.name||"Unknown item"} <span style={{color:clr}}>× {mv.qty} {item?.unit||""}</span></div>
                  <div style={{fontSize:10,color:C.muted,marginTop:1}}>{mv.moveType}{proj?` · ${proj.client}`:""}{mv.notes?` · ${mv.notes}`:""} · {mv.date}</div>
                </div>
                <div style={{fontSize:11,fontFamily:"monospace",color:clr,fontWeight:700}}>{mv.moveType.startsWith("IN")?"+":"-"}{mv.qty}</div>
              </div>
            );
          })}
        </div>
       </div>
      )}

      {/* ── BULK MOVEMENT IMPORT MODAL ───────────────────────────────── */}
      {showMoveImport&&(()=>{
        const good=moveImpRows.filter(r=>!r.err).length;
        return(
        <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,.5)",zIndex:1200,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>{if(e.target===e.currentTarget)setShowMoveImport(false);}}>
          <div style={{background:"#fff",borderRadius:14,padding:24,width:640,maxWidth:"96vw",boxShadow:"0 20px 60px rgba(0,0,0,.2)",maxHeight:"90vh",overflowY:"auto"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
              <div style={{fontWeight:800,fontSize:"1rem",color:C.text}}>⬆ Bulk Import Stock Movements</div>
              <button onClick={()=>setShowMoveImport(false)} style={{background:"#f1f5f9",border:"none",borderRadius:7,padding:"4px 10px",cursor:"pointer",color:C.muted,fontWeight:700}}>✕</button>
            </div>
            <div style={{background:"#eff6ff",border:"1.5px solid #93c5fd",borderRadius:8,padding:"10px 14px",marginBottom:14,fontSize:".78rem",color:"#1d4ed8"}}>
              <strong>Format (one movement per line):</strong><br/>
              <code style={{fontSize:".73rem",color:"#475569"}}>Item, Type, Qty, UnitCost, Date, Project, Notes</code><br/>
              <span style={{color:"#64748b",fontSize:".72rem"}}>Type = IN / OUT / ADJUST / RETURN. Date optional (defaults today). Project matches a client name (else blank). Unknown items are auto-created only for IN. Movements update qty-on-hand &amp; avg cost through the same engine as manual moves.</span>
            </div>
            <textarea value={moveImpText} onChange={e=>parseMoveImport(e.target.value)} rows={7} placeholder={"CUTTING DISC, IN, 50, 120, 2026-08-01, , Restock\nPLYWOOD 3/4, OUT, 12, 0, 2026-08-05, Acme Corp, Site delivery\nGRINDING DISC, ADJUST, 30, 13, , , Stock count"} style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"9px 12px",fontFamily:"monospace",fontSize:".78rem",color:"#0f172a",resize:"vertical",boxSizing:"border-box"}}/>
            {moveImpRows.length>0&&(
              <div style={{marginTop:12,border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden"}}>
                <div style={{fontSize:".72rem",textTransform:"uppercase",letterSpacing:"1px",color:"#64748b",fontWeight:700,padding:"6px 10px",background:"#f8fafc"}}>{good} of {moveImpRows.length} ready</div>
                <div style={{maxHeight:220,overflowY:"auto"}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:".74rem"}}>
                    <tbody>{moveImpRows.slice(0,50).map((r,i)=>(
                      <tr key={i} style={{background:r.err?"#fef2f2":i%2?"#fafbfc":"#fff"}}>
                        <td style={{padding:"4px 8px",maxWidth:150,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.name||"—"}</td>
                        <td style={{padding:"4px 8px",color:C.muted}}>{r.moveType||"?"}</td>
                        <td style={{padding:"4px 8px",fontFamily:"monospace",textAlign:"right"}}>{r.qty}</td>
                        <td style={{padding:"4px 8px",color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:90}}>{r.projectName||"—"}</td>
                        <td style={{padding:"4px 8px"}}>{r.err?<span style={{color:C.red,fontWeight:700}}>⚠ {r.err}</span>:<span style={{color:r.exists?"#d97706":"#059669",fontWeight:700}}>{r.exists?"MATCH":"NEW"}</span>}</td>
                      </tr>
                    ))}{moveImpRows.length>50&&<tr><td colSpan={5} style={{padding:"4px 8px",color:C.muted,textAlign:"center"}}>… and {moveImpRows.length-50} more</td></tr>}</tbody>
                  </table>
                </div>
              </div>
            )}
            <div style={{display:"flex",gap:10,marginTop:16}}>
              <button onClick={applyMoveImport} disabled={good===0} style={{flex:1,background:good>0?C.accent:"#e2e8f0",border:"none",borderRadius:9,padding:"10px 0",fontFamily:"inherit",fontWeight:800,fontSize:".86rem",color:good>0?"#fff":"#94a3b8",cursor:good>0?"pointer":"not-allowed"}}>⬆ Import {good>0?good+" movements":""}</button>
              <button onClick={()=>setShowMoveImport(false)} style={{background:"#f1f5f9",border:"none",borderRadius:9,padding:"10px 18px",fontFamily:"inherit",fontWeight:600,fontSize:".86rem",color:C.muted,cursor:"pointer"}}>Cancel</button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* ── MERGE DUPLICATES MODAL ───────────────────────────────────── */}
      {showDupes&&(
        <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,.5)",zIndex:1200,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>{if(e.target===e.currentTarget)setShowDupes(false);}}>
          <div style={{background:"#fff",borderRadius:14,padding:24,width:640,maxWidth:"96vw",boxShadow:"0 20px 60px rgba(0,0,0,.2)",maxHeight:"90vh",overflowY:"auto"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
              <div style={{fontWeight:800,fontSize:"1rem",color:C.text}}>⧉ Merge Duplicate Items</div>
              <button onClick={()=>setShowDupes(false)} style={{background:"#f1f5f9",border:"none",borderRadius:7,padding:"4px 10px",cursor:"pointer",color:C.muted,fontWeight:700}}>✕</button>
            </div>
            <div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:8,padding:"9px 12px",marginBottom:14,fontSize:".78rem",color:"#92400e"}}>
              Same-name / same-unit SKUs. Pick which record to <strong>keep</strong>; the others' stock movements are re-tagged to it and their on-hand qty is folded in (weighted avg cost). This can't be undone.
            </div>
            {dupGroups.length===0?(
              <div style={{textAlign:"center",padding:"2rem",color:C.green,fontSize:13}}>✅ No duplicates remaining.</div>
            ):dupGroups.map(g=>{
              const survivor=dupSurvivors[g.key]||g.items[0].id;
              return(
              <div key={g.key} style={{border:`1px solid ${C.border}`,borderRadius:9,padding:"10px 12px",marginBottom:10}}>
                <div style={{fontSize:12,fontWeight:700,color:C.text,marginBottom:6}}>{g.name} <span style={{color:C.muted,fontWeight:500}}>· {g.unit||"—"} · {g.items.length} copies</span></div>
                {g.items.map(it=>(
                  <label key={it.id} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 0",cursor:"pointer",fontSize:11,color:C.text}}>
                    <input type="radio" name={"dup-"+g.key} checked={survivor===it.id} onChange={()=>setDupSurvivors(p=>({...p,[g.key]:it.id}))}/>
                    <span style={{flex:1}}>{it.code?`[${it.code}] `:""}on hand {n(it.qtyOnHand)} {it.unit} · avg {fp(it.avgCost)}{it.supplier?` · ${it.supplier}`:""}</span>
                    <span style={{fontSize:9,color:survivor===it.id?C.green:C.muted,fontWeight:700}}>{survivor===it.id?"KEEP":"merge in"}</span>
                  </label>
                ))}
                <div style={{textAlign:"right",marginTop:6}}>
                  <button onClick={()=>{const dupeIds=g.items.filter(i=>i.id!==survivor).map(i=>i.id);const nm=mergeInventoryItems(survivor,dupeIds);toastEmit&&toastEmit(`Merged ${nm} duplicate${nm!==1?"s":""} into "${g.items.find(i=>i.id===survivor)?.name}"`,"success");}} style={{background:C.accent,border:"none",borderRadius:7,padding:"6px 14px",fontFamily:"inherit",fontWeight:700,fontSize:".76rem",color:"#fff",cursor:"pointer"}}>⧉ Merge this group</button>
                </div>
              </div>
              );
            })}
            <div style={{textAlign:"right",marginTop:6}}>
              <button onClick={()=>setShowDupes(false)} style={{background:"#f1f5f9",border:"none",borderRadius:9,padding:"9px 18px",fontFamily:"inherit",fontWeight:600,fontSize:".84rem",color:C.muted,cursor:"pointer"}}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* ── DELIVERY RECEIPT ENTRY MODAL (+ AI OCR) ──────────────────── */}
      {showDr&&drForm&&(
        <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,.5)",zIndex:1200,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>{if(e.target===e.currentTarget){setShowDr(false);setDrForm(null);}}}>
          <div style={{background:"#fff",borderRadius:14,padding:24,width:680,maxWidth:"96vw",boxShadow:"0 20px 60px rgba(0,0,0,.2)",maxHeight:"92vh",overflowY:"auto"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
              <div style={{fontWeight:800,fontSize:"1rem",color:C.text}}>🧾 {drForm.id?"Edit":"New"} Delivery Receipt</div>
              <button onClick={()=>{setShowDr(false);setDrForm(null);}} style={{background:"#f1f5f9",border:"none",borderRadius:7,padding:"4px 10px",cursor:"pointer",color:C.muted,fontWeight:700}}>✕</button>
            </div>
            <label style={{display:"flex",alignItems:"center",gap:8,background:"#f5f3ff",border:"1px solid #ddd6fe",borderRadius:8,padding:"9px 12px",marginBottom:14,cursor:drOcrBusy?"wait":"pointer",fontSize:".8rem",color:"#6d28d9",fontWeight:700}}>
              <span>{drOcrBusy?"⏳ Reading…":"🤖 Scan a DR photo / PDF (AI auto-fill)"}</span>
              <input type="file" accept="image/*,application/pdf" disabled={drOcrBusy} style={{display:"none"}} onChange={e=>{const f=e.target.files[0];runDrOcr(f);e.target.value="";}}/>
            </label>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
              <div><div style={{fontSize:9,fontWeight:700,color:C.muted,textTransform:"uppercase",marginBottom:4}}>DR / GRN No.</div><input value={drForm.drNo} onChange={e=>setDrForm(f=>({...f,drNo:e.target.value}))} style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:7,padding:"6px 10px",fontFamily:"inherit",fontSize:12,boxSizing:"border-box"}}/></div>
              <div><div style={{fontSize:9,fontWeight:700,color:C.muted,textTransform:"uppercase",marginBottom:4}}>Date</div><input type="date" value={drForm.drDate} onChange={e=>setDrForm(f=>({...f,drDate:e.target.value}))} style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:7,padding:"6px 10px",fontFamily:"inherit",fontSize:12,boxSizing:"border-box"}}/></div>
              <div><div style={{fontSize:9,fontWeight:700,color:C.muted,textTransform:"uppercase",marginBottom:4}}>PO No. (optional)</div><input value={drForm.poNumber} onChange={e=>setDrForm(f=>({...f,poNumber:e.target.value}))} style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:7,padding:"6px 10px",fontFamily:"inherit",fontSize:12,boxSizing:"border-box"}}/></div>
              <div><div style={{fontSize:9,fontWeight:700,color:C.muted,textTransform:"uppercase",marginBottom:4}}>Supplier</div><input value={drForm.supplier} onChange={e=>setDrForm(f=>({...f,supplier:e.target.value}))} list="supp-opts" style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:7,padding:"6px 10px",fontFamily:"inherit",fontSize:12,boxSizing:"border-box"}}/></div>
              <div style={{gridColumn:"span 2"}}><div style={{fontSize:9,fontWeight:700,color:C.muted,textTransform:"uppercase",marginBottom:4}}>Project</div>
                <select value={drForm.projectId} onChange={e=>setDrForm(f=>({...f,projectId:e.target.value}))} style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:7,padding:"6px 10px",fontFamily:"inherit",fontSize:12,background:"#fff",boxSizing:"border-box"}}>
                  <option value="">— Unassigned —</option>
                  <option value="__gmd_stocks__">GMD Stocks</option>
                  {wonDeals.map(d=><option key={d.id} value={d.id}>{d.client}{d.contact?" — "+d.contact:""}</option>)}
                </select>
              </div>
            </div>
            <div style={{fontSize:9,fontWeight:700,color:C.muted,textTransform:"uppercase",marginBottom:6}}>Line Items</div>
            {drForm.items.map((it,idx)=>(
              <div key={idx} style={{display:"grid",gridTemplateColumns:"2.4fr 70px 90px 90px 28px",gap:6,marginBottom:6,alignItems:"center"}}>
                <input value={it.name} onChange={e=>setDrForm(f=>({...f,items:f.items.map((x,i)=>i===idx?{...x,name:e.target.value}:x)}))} placeholder="Item" style={{border:`1px solid ${C.border}`,borderRadius:7,padding:"6px 10px",fontFamily:"inherit",fontSize:12,boxSizing:"border-box"}}/>
                <input type="number" value={it.qty} onChange={e=>setDrForm(f=>({...f,items:f.items.map((x,i)=>i===idx?{...x,qty:e.target.value}:x)}))} placeholder="Qty" style={{border:`1px solid ${C.border}`,borderRadius:7,padding:"6px 8px",fontFamily:"inherit",fontSize:12,textAlign:"right",boxSizing:"border-box"}}/>
                <input type="number" value={it.unitCost} onChange={e=>setDrForm(f=>({...f,items:f.items.map((x,i)=>i===idx?{...x,unitCost:e.target.value}:x)}))} placeholder="Unit ₱" style={{border:`1px solid ${C.border}`,borderRadius:7,padding:"6px 8px",fontFamily:"inherit",fontSize:12,textAlign:"right",boxSizing:"border-box"}}/>
                <div style={{fontSize:11,fontFamily:"monospace",color:C.muted,textAlign:"right"}}>{fp((Number(it.qty)||0)*(Number(it.unitCost)||0))}</div>
                <button onClick={()=>setDrForm(f=>({...f,items:f.items.filter((_,i)=>i!==idx)}))} style={{border:"none",background:"transparent",color:C.red,cursor:"pointer",fontWeight:700}}>✕</button>
              </div>
            ))}
            <button onClick={()=>setDrForm(f=>({...f,items:[...f.items,{name:"",qty:"",unitCost:""}]}))} style={{background:"#fff",border:`1px dashed ${C.border}`,borderRadius:7,padding:"5px 12px",fontFamily:"inherit",fontSize:".76rem",color:C.muted,cursor:"pointer",marginBottom:10}}>+ Add line</button>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{flex:1,marginRight:10}}><div style={{fontSize:9,fontWeight:700,color:C.muted,textTransform:"uppercase",marginBottom:4}}>Remarks</div><input value={drForm.remarks} onChange={e=>setDrForm(f=>({...f,remarks:e.target.value}))} style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:7,padding:"6px 10px",fontFamily:"inherit",fontSize:12,boxSizing:"border-box"}}/></div>
              <div style={{textAlign:"right"}}><div style={{fontSize:9,color:C.muted,textTransform:"uppercase"}}>Total</div><div style={{fontSize:16,fontWeight:800,color:C.teal,fontFamily:"monospace"}}>{fp(drTotal(drForm.items))}</div></div>
            </div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={commitDr} style={{flex:1,background:C.accent,border:"none",borderRadius:9,padding:"10px 0",fontFamily:"inherit",fontWeight:800,fontSize:".86rem",color:"#fff",cursor:"pointer"}}>💾 Save Delivery Receipt</button>
              <button onClick={()=>{setShowDr(false);setDrForm(null);}} style={{background:"#f1f5f9",border:"none",borderRadius:9,padding:"10px 18px",fontFamily:"inherit",fontWeight:600,fontSize:".86rem",color:C.muted,cursor:"pointer"}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── IMPORT CSV MODAL ─────────────────────────────────────────── */}
      {showImport&&(
        <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,.5)",zIndex:1200,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>{if(e.target===e.currentTarget)setShowImport(false);}}>
          <div style={{background:"#fff",borderRadius:14,padding:24,width:540,maxWidth:"96vw",boxShadow:"0 20px 60px rgba(0,0,0,.2)",maxHeight:"90vh",overflowY:"auto"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
              <div style={{fontWeight:800,fontSize:"1rem",color:C.text}}>⬆ Import Inventory CSV</div>
              <button onClick={()=>setShowImport(false)} style={{background:"#f1f5f9",border:"none",borderRadius:7,padding:"4px 10px",cursor:"pointer",color:C.muted,fontWeight:700}}>✕</button>
            </div>
            <div style={{background:"#eff6ff",border:"1.5px solid #93c5fd",borderRadius:8,padding:"10px 14px",marginBottom:14,fontSize:".78rem",color:"#1d4ed8"}}>
              <strong>Format (one item per line):</strong><br/>
              <code style={{fontSize:".73rem",color:"#475569"}}>Name, Unit, Price, Beg Qty, Recv Qty, Out Qty [, Notes]</code> — or paste the exported FabHub inventory CSV directly<br/>
              <span style={{color:"#64748b",fontSize:".72rem"}}>Matches the GMD warehouse app export. Existing items (matched by name) are updated — qty set to Beg+Recv−Out.</span>
            </div>
            <div style={{marginBottom:10}}>
              <button onClick={()=>csvFileRef.current?.click()} style={{background:"#f1f5f9",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"7px 14px",fontFamily:"inherit",fontSize:".8rem",color:"#475569",cursor:"pointer",fontWeight:600}}>📂 Upload .csv file</button>
              <input ref={csvFileRef} type="file" accept=".csv,.txt" style={{display:"none"}} onChange={e=>{const file=e.target.files[0];if(!file)return;const r=new FileReader();r.onload=ev=>handleImportText(ev.target.result);r.readAsText(file);e.target.value="";}}/>
            </div>
            <label style={{display:"block",fontSize:".72rem",textTransform:"uppercase",letterSpacing:"1px",color:"#94a3b8",marginBottom:5,fontWeight:700}}>Or paste CSV text</label>
            <textarea value={importText} onChange={e=>handleImportText(e.target.value)} rows={7} placeholder={"CUTTING DISC,BOX,2375,10,0,2\nGRINDING DISC,BOX,180,13,0,2,Extra stock\nPAINT BRUSH #1,PCS,25,30,0,0"} style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"9px 12px",fontFamily:"monospace",fontSize:".78rem",color:"#0f172a",resize:"vertical",boxSizing:"border-box"}}/>
            {importErr&&<div style={{background:"#fef2f2",border:"1.5px solid #fecaca",borderRadius:7,padding:"8px 12px",marginTop:8,fontSize:".78rem",color:"#dc2626"}}>⚠ {importErr}</div>}
            {importPreview.length>0&&(
              <div style={{marginTop:12}}>
                <div style={{fontSize:".72rem",textTransform:"uppercase",letterSpacing:"1px",color:"#64748b",fontWeight:700,marginBottom:6}}>{importPreview.length} item{importPreview.length!==1?"s":""} detected</div>
                <div style={{maxHeight:180,overflowY:"auto",border:"1.5px solid #e2e8f0",borderRadius:8}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:".75rem"}}>
                    <thead><tr style={{background:"#f8fafc"}}>{["Name","Unit","Price","Beg","Recv","Out","Rem","Action"].map(h=><th key={h} style={{padding:"5px 8px",textAlign:"left",color:"#94a3b8",fontWeight:700,fontSize:".68rem",textTransform:"uppercase",borderBottom:"1px solid #e2e8f0"}}>{h}</th>)}</tr></thead>
                    <tbody>{importPreview.slice(0,25).map((row,i)=>{const ex=inventory.find(inv=>inv.name.toUpperCase()===row.name);return(<tr key={i} style={{background:i%2?"#fafbfc":"#fff"}}><td style={{padding:"4px 8px",maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{row.name}</td><td style={{padding:"4px 8px",color:"#64748b"}}>{row.unit}</td><td style={{padding:"4px 8px",fontFamily:"monospace",color:"#64748b"}}>{row.price||"—"}</td><td style={{padding:"4px 8px",fontFamily:"monospace"}}>{row.beg}</td><td style={{padding:"4px 8px",fontFamily:"monospace",color:"#059669"}}>{row.recv}</td><td style={{padding:"4px 8px",fontFamily:"monospace",color:"#f97316"}}>{row.out}</td><td style={{padding:"4px 8px",fontFamily:"monospace",fontWeight:700,color:row.qty>0?"#059669":row.qty<0?"#dc2626":"#94a3b8"}}>{row.qty}</td><td style={{padding:"4px 8px"}}><span style={{fontSize:".68rem",fontWeight:700,color:ex?"#d97706":"#059669"}}>{ex?"UPDATE":"NEW"}</span></td></tr>);})}{importPreview.length>25&&<tr><td colSpan={8} style={{padding:"4px 8px",color:"#94a3b8",fontSize:".72rem",textAlign:"center"}}>… and {importPreview.length-25} more</td></tr>}</tbody>
                  </table>
                </div>
              </div>
            )}
            <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:16}}>
              <button onClick={()=>setShowImport(false)} style={{background:"#f1f5f9",border:"none",borderRadius:9,padding:"9px 18px",fontFamily:"inherit",fontWeight:600,fontSize:".84rem",color:"#64748b",cursor:"pointer"}}>Cancel</button>
              <button onClick={commitImport} disabled={!importPreview.length} style={{background:importPreview.length?"#7c3aed":"#e2e8f0",border:"none",borderRadius:9,padding:"9px 20px",fontFamily:"inherit",fontWeight:700,fontSize:".84rem",color:importPreview.length?"#fff":"#94a3b8",cursor:importPreview.length?"pointer":"not-allowed"}}>⬆ Import {importPreview.length>0?importPreview.length+" items":""}</button>
            </div>
          </div>
        </div>
      )}
      {/* ── DISPATCH MODAL ──────────────────────────────────────────────── */}
      {dispatchModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,.65)",zIndex:3000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setDispatchModal(null)}>
          <div style={{background:"#fff",borderRadius:16,padding:24,width:"100%",maxWidth:400,boxShadow:"0 20px 60px rgba(0,0,0,.3)"}} onClick={e=>e.stopPropagation()}>
            <div style={{fontWeight:800,fontSize:"1.05rem",color:"#0f172a",marginBottom:4}}>📤 Dispatch to Project</div>
            <div style={{fontSize:".8rem",color:"#64748b",marginBottom:14,fontStyle:"italic"}}>{dispatchModal.itemName||dispatchModal.item}</div>
            {!dispatchForm.itemId&&(
              <div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:".78rem",color:"#dc2626"}}>
                ⚠ No inventory record found for this item. Add it to Inventory first so stock levels update automatically.
              </div>
            )}
            <div style={{marginBottom:10}}>
              <div style={{fontSize:".72rem",fontWeight:700,color:"#64748b",textTransform:"uppercase",marginBottom:4}}>Qty to Dispatch *</div>
              <input type="number" value={dispatchForm.qty} onChange={e=>setDispatchForm(p=>({...p,qty:e.target.value}))} min={1} style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"7px 10px",fontFamily:"inherit",fontSize:".85rem",boxSizing:"border-box"}}/>
            </div>
            <div style={{marginBottom:10}}>
              <div style={{fontSize:".72rem",fontWeight:700,color:"#64748b",textTransform:"uppercase",marginBottom:4}}>Destination Project</div>
              <select value={dispatchForm.projectId} onChange={e=>setDispatchForm(p=>({...p,projectId:e.target.value}))} style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"7px 10px",fontFamily:"inherit",fontSize:".85rem",background:"#fff"}}>
                <option value="">— GMD Warehouse / Internal Use</option>
                {wonDeals.map(d=><option key={d.id} value={d.id}>{d.client}{d.contact?" — "+d.contact:""}</option>)}
              </select>
            </div>
            <div style={{marginBottom:18}}>
              <div style={{fontSize:".72rem",fontWeight:700,color:"#64748b",textTransform:"uppercase",marginBottom:4}}>Notes (DR #, delivery slip, etc.)</div>
              <input value={dispatchForm.notes} onChange={e=>setDispatchForm(p=>({...p,notes:e.target.value}))} placeholder="e.g. DR-001 · Site A delivery" style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"7px 10px",fontFamily:"inherit",fontSize:".85rem",boxSizing:"border-box"}}/>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button
                disabled={!dispatchForm.qty||!dispatchForm.itemId}
                onClick={()=>{
                  if(!dispatchForm.qty||!dispatchForm.itemId) return;
                  if(!logStockMove({itemId:dispatchForm.itemId,moveType:"OUT — Used in Project",qty:Number(dispatchForm.qty),projectId:dispatchForm.projectId||null,dealId:dispatchForm.projectId||null,notes:dispatchForm.notes||(dispatchModal.poNumber?"PO "+dispatchModal.poNumber:"Dispatched"),date:today,recordedBy:session?.name||role})) return;
                  setDispatchModal(null);
                }}
                style={{flex:1,padding:"9px",background:(!dispatchForm.qty||!dispatchForm.itemId)?"#cbd5e1":"#f97316",color:"#fff",border:"none",borderRadius:8,fontFamily:"inherit",fontWeight:700,fontSize:".85rem",cursor:(!dispatchForm.qty||!dispatchForm.itemId)?"not-allowed":"pointer"}}>
                📤 Log Dispatch
              </button>
              <button onClick={()=>setDispatchModal(null)} style={{padding:"9px 16px",background:"#f1f5f9",color:"#64748b",border:"none",borderRadius:8,fontFamily:"inherit",fontWeight:600,fontSize:".85rem",cursor:"pointer"}}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {/* ── RECEIVE PO → INVENTORY MODAL (Ian-style one-click receipt) ── */}
      {receiveModal&&(()=>{
        const total=Number(receiveModal.qty||0);
        const rq=Number(receiveForm.qty)||0;
        const isPartial=total>0&&rq>0&&rq<total;
        const key=(receiveModal.itemName||receiveModal.item||"").trim().toLowerCase();
        const willCreate=!inventory.find(i=>i.name?.toLowerCase()===key||(key.length>=8&&i.name?.toLowerCase().includes(key.slice(0,8))));
        const rawProj=receiveModal.dealId||receiveModal.projectId||"";
        const destStock=rawProj==="__gmd_stocks__"||receiveModal.projectName==="GMD Stocks";
        const destDeal=destStock?null:wonDeals.find(d=>d.id===rawProj);
        const destName=destStock?"GMD Stock":(destDeal?.client||receiveModal.projectName||"Unassigned");
        return(
        <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,.65)",zIndex:3000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setReceiveModal(null)}>
          <div style={{background:"#fff",borderRadius:16,padding:24,width:"100%",maxWidth:420,boxShadow:"0 20px 60px rgba(0,0,0,.3)"}} onClick={e=>e.stopPropagation()}>
            <div style={{fontWeight:800,fontSize:"1.05rem",color:"#0f172a",marginBottom:4}}>📦 Receive Delivery</div>
            <div style={{fontSize:".8rem",color:"#64748b",marginBottom:10,fontStyle:"italic"}}>{receiveModal.itemName||receiveModal.item}{receiveModal.poNumber?` · PO ${receiveModal.poNumber}`:""}{receiveModal.supplier?` · ${receiveModal.supplier}`:""}</div>
            {/* Destination + accounting-treatment badge */}
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,padding:"9px 12px",borderRadius:9,background:destStock?"#f0fdfa":"#eff6ff",border:`1px solid ${destStock?"#99f6e4":"#bfdbfe"}`}}>
              <span style={{fontSize:"1rem",flexShrink:0}}>{destStock?"🏭":"📁"}</span>
              <div style={{minWidth:0}}>
                <div style={{fontSize:".8rem",fontWeight:800,color:destStock?"#0f766e":"#1d4ed8"}}>{destStock?"GMD Stock (company asset)":`Project: ${destName}`}</div>
                <div style={{fontSize:".68rem",color:destStock?"#0d9488":"#3b82f6",marginTop:1}}>{destStock?"Not expensed on receipt — cost is booked when released to a project.":"Held as inventory; project cost is booked when issued/dispatched."}</div>
              </div>
            </div>
            {willCreate&&(
              <div style={{background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:".76rem",color:"#1d4ed8"}}>
                ℹ New item — a matching inventory record will be created automatically on receipt.
              </div>
            )}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              <div>
                <div style={{fontSize:".72rem",fontWeight:700,color:"#64748b",textTransform:"uppercase",marginBottom:4}}>Qty Received *</div>
                <input type="number" min={1} max={total||undefined} value={receiveForm.qty} onChange={e=>setReceiveForm(p=>({...p,qty:e.target.value}))} style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"7px 10px",fontFamily:"inherit",fontSize:".85rem",boxSizing:"border-box"}}/>
                {total>0&&<div style={{fontSize:".68rem",color:"#94a3b8",marginTop:3}}>Ordered: {total} {receiveModal.unit||""}</div>}
              </div>
              <div>
                <div style={{fontSize:".72rem",fontWeight:700,color:"#64748b",textTransform:"uppercase",marginBottom:4}}>Unit Cost</div>
                <input type="number" min={0} step="0.01" value={receiveForm.unitCost} onChange={e=>setReceiveForm(p=>({...p,unitCost:e.target.value}))} style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"7px 10px",fontFamily:"inherit",fontSize:".85rem",boxSizing:"border-box"}}/>
              </div>
            </div>
            <div style={{marginBottom:10}}>
              <div style={{fontSize:".72rem",fontWeight:700,color:"#64748b",textTransform:"uppercase",marginBottom:4}}>DR / Delivery Note #</div>
              <input value={receiveForm.drNo} onChange={e=>setReceiveForm(p=>({...p,drNo:e.target.value}))} placeholder="e.g. DR-2024-001" style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"7px 10px",fontFamily:"inherit",fontSize:".85rem",boxSizing:"border-box"}}/>
            </div>
            <div style={{marginBottom:isPartial?12:18}}>
              <div style={{fontSize:".72rem",fontWeight:700,color:"#64748b",textTransform:"uppercase",marginBottom:4}}>Notes</div>
              <input value={receiveForm.notes} onChange={e=>setReceiveForm(p=>({...p,notes:e.target.value}))} placeholder="Optional — condition, remarks…" style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"7px 10px",fontFamily:"inherit",fontSize:".85rem",boxSizing:"border-box"}}/>
            </div>
            {isPartial&&(
              <div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:8,padding:"8px 12px",marginBottom:16,fontSize:".78rem",color:"#92400e"}}>
                ⚠️ Partial receipt — balance of <strong>{total-rq} {receiveModal.unit||""}</strong> remains outstanding.
              </div>
            )}
            <div style={{display:"flex",gap:8}}>
              <button disabled={rq<=0} onClick={commitReceive}
                style={{flex:1,padding:"9px",background:rq>0?"#22c55e":"#cbd5e1",color:"#fff",border:"none",borderRadius:8,fontFamily:"inherit",fontWeight:700,fontSize:".85rem",cursor:rq>0?"pointer":"not-allowed"}}>
                ✓ Confirm Receipt
              </button>
              <button onClick={()=>setReceiveModal(null)} style={{padding:"9px 16px",background:"#f1f5f9",color:"#64748b",border:"none",borderRadius:8,fontFamily:"inherit",fontWeight:600,fontSize:".85rem",cursor:"pointer"}}>Cancel</button>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}

// ─── STOCK MOVEMENT VIEW ──────────────────────────────────────────────────────
function StockMovementView({inventory,stocklog,wonDeals,logStockMove,session,role}){
  const[filterType,setFilterType]=useState("all");
  const[filterItem,setFilterItem]=useState("all");
  const[showForm,setShowForm]=useState(false);
  const[form,setForm]=useState({itemId:"",moveType:"IN — Delivery",qty:"",unitCost:"",projectId:"",notes:"",date:today});
  const f=(k,v)=>setForm(p=>({...p,[k]:v}));
  const n=v=>Number(v)||0;
  const fmt=v=>"₱"+n(v).toLocaleString("en-PH",{minimumFractionDigits:2});

  const filtered=useMemo(()=>{
    let list=stocklog;
    if(filterType!=="all") list=list.filter(s=>s.moveType===filterType);
    if(filterItem!=="all") list=list.filter(s=>s.itemId===filterItem);
    return list;
  },[stocklog,filterType,filterItem]);

  const totalIn=stocklog.filter(s=>s.moveType.startsWith("IN")).reduce((sum,s)=>sum+n(s.qty)*n(s.unitCost),0);
  const totalOut=stocklog.filter(s=>s.moveType.startsWith("OUT")).length;

  const submit=()=>{
    if(!form.qty||!form.itemId) return;
    if(logStockMove({...form})===false)return; // witness/stock guard rejected — keep form open
    setForm({itemId:"",moveType:"IN — Delivery",qty:"",unitCost:"",projectId:"",notes:"",date:today});
    setShowForm(false);
  };

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:12}}>
        <div>
          <h2 style={{margin:0,fontWeight:800,color:"#0f172a",fontSize:"1.15rem"}}>Stock Movement</h2>
          <div style={{fontSize:".75rem",color:"#64748b",marginTop:2}}>Every item IN and OUT — tagged to projects</div>
        </div>
        <button onClick={()=>setShowForm(s=>!s)} style={{background:"#1e293b",border:"none",borderRadius:10,padding:"9px 18px",fontFamily:"inherit",fontWeight:700,fontSize:".84rem",color:"#fff",cursor:"pointer"}}>+ Log Movement</button>
      </div>

      <div style={{display:"grid",gridTemplateColumns:window.innerWidth<768?"1fr":"repeat(3,1fr)",gap:10,marginBottom:16}}>
        {[
          {l:"Total Movements",  v:stocklog.length,           c:"#0f172a"},
          {l:"Total Stock IN (₱)",v:"₱"+Math.round(totalIn).toLocaleString("en-PH"), c:"#059669"},
          {l:"Stock OUT Events", v:totalOut,                   c:"#f97316"},
        ].map(({l,v,c})=>(
          <div key={l} style={{background:"#fff",borderRadius:12,padding:"14px 16px",border:"1.5px solid #e2e8f0"}}>
            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.2rem",color:c}}>{v}</div>
            <div style={{fontSize:".63rem",textTransform:"uppercase",letterSpacing:"1px",color:"#94a3b8",marginTop:5}}>{l}</div>
          </div>
        ))}
      </div>

      {showForm&&(
        <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",padding:18,marginBottom:16}}>
          <div style={{fontWeight:800,color:"#0f172a",marginBottom:14}}>Log Stock Movement</div>
          <div style={{display:"grid",gridTemplateColumns:window.innerWidth<768?"1fr":"1fr 1fr",gap:14}}>
            <Fld label="Item" required><Sel value={form.itemId} onChange={e=>f("itemId",e.target.value)}><option value="">— Select Item —</option>{inventory.map(i=><option key={i.id} value={i.id}>{i.name} ({i.code}) — {n(i.qtyOnHand)} {i.unit} on hand</option>)}</Sel></Fld>
            <Fld label="Movement Type"><Sel value={form.moveType} onChange={e=>f("moveType",e.target.value)}>{STOCK_MOVE_TYPES.map(t=><option key={t}>{t}</option>)}</Sel></Fld>
            <Fld label={form.moveType.startsWith("ADJUST")?"New Total Qty (absolute count)":"Quantity"}><Inp type="number" value={form.qty} onChange={e=>f("qty",e.target.value)} min={0} placeholder="0"/></Fld>
            <Fld label="Date"><Inp type="date" value={form.date} onChange={e=>f("date",e.target.value)}/></Fld>
            {form.moveType.startsWith("IN")&&<Fld label="Unit Cost (₱)" hint="Updates average cost automatically"><Inp type="number" value={form.unitCost} onChange={e=>f("unitCost",e.target.value)} placeholder="0.00"/></Fld>}
            {form.moveType.startsWith("OUT")&&<Fld label="Project / CE No."><Sel value={form.projectId} onChange={e=>f("projectId",e.target.value)}><option value="">— Optional —</option>{wonDeals.map(d=><option key={d.id} value={d.id}>{d.client} {d.ceNo?`(${d.ceNo})`:""}</option>)}</Sel></Fld>}
            {moveNeedsWitness(form.moveType,inventory.find(i=>i.id===form.itemId))&&<Fld label="🔒 Finance Witness (§5.3 — required)"><Inp value={form.financeWitness||""} onChange={e=>f("financeWitness",e.target.value)} placeholder="Finance rep present at release / scrap"/></Fld>}
            <div style={{gridColumn:"1/-1"}}><Fld label="Notes / Reference"><Inp value={form.notes} onChange={e=>f("notes",e.target.value)} placeholder="DR number, PO reference, project site, reason for adjustment…"/></Fld></div>
          </div>
          <div style={{display:"flex",gap:10,marginTop:14}}>
            <button onClick={submit} disabled={!form.qty||!form.itemId} style={{background:form.qty&&form.itemId?"#1e293b":"#e2e8f0",border:"none",borderRadius:9,padding:"10px 22px",fontFamily:"inherit",fontWeight:700,fontSize:".87rem",color:form.qty&&form.itemId?"#fff":"#94a3b8",cursor:form.qty&&form.itemId?"pointer":"not-allowed"}}>Save Movement</button>
            <button onClick={()=>setShowForm(false)} style={{background:"transparent",border:"1.5px solid #e2e8f0",borderRadius:9,padding:"10px 18px",fontFamily:"inherit",fontWeight:600,fontSize:".84rem",color:"#64748b",cursor:"pointer"}}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{display:"flex",gap:10,marginBottom:12,flexWrap:"wrap"}}>
        <select value={filterType} onChange={e=>setFilterType(e.target.value)} style={{border:"1.5px solid #e2e8f0",borderRadius:8,padding:"7px 12px",fontFamily:"inherit",fontSize:".8rem",color:"#0f172a",background:"#fff",cursor:"pointer"}}>
          <option value="all">All Types</option>{STOCK_MOVE_TYPES.map(t=><option key={t}>{t}</option>)}
        </select>
        <select value={filterItem} onChange={e=>setFilterItem(e.target.value)} style={{border:"1.5px solid #e2e8f0",borderRadius:8,padding:"7px 12px",fontFamily:"inherit",fontSize:".8rem",color:"#0f172a",background:"#fff",cursor:"pointer"}}>
          <option value="all">All Items</option>{inventory.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
      </div>

      {stocklog.length===0&&<div style={{textAlign:"center",padding:"32px 0",color:"#94a3b8",fontSize:".84rem"}}>No stock movements yet.</div>}
      <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",overflow:"hidden"}}>
        <div style={{overflowX:"auto"}}>
        <div style={{display:"grid",gridTemplateColumns:"100px 1fr 100px 80px 120px 1fr",background:"#1e293b",padding:"10px 16px",gap:12,minWidth:620}}>
          {["Date","Item","Qty","Type","Value","Project / Notes"].map(h=>(
            <div key={h} style={{fontSize:".68rem",fontWeight:700,color:"rgba(255,255,255,.5)",textTransform:"uppercase",letterSpacing:".8px"}}>{h}</div>
          ))}
        </div>
        {filtered.slice(0,100).map((mv,i)=>{
          const item=inventory.find(x=>x.id===mv.itemId);
          const deal=wonDeals.find(d=>d.id===mv.projectId);
          const val=n(mv.qty)*n(mv.unitCost);
          const typeClr=mv.moveType.startsWith("IN")?"#059669":mv.moveType.startsWith("OUT")?"#f97316":mv.moveType.startsWith("ADJUST")?"#3b82f6":"#94a3b8";
          return(
            <div key={mv.id} style={{display:"grid",gridTemplateColumns:"100px 1fr 100px 80px 120px 1fr",padding:"10px 16px",gap:12,borderTop:"1px solid #f1f5f9",background:i%2?"#fafafa":"#fff",alignItems:"center",minWidth:620}}>
              <div style={{fontSize:".78rem",color:"#64748b"}}>{mv.date}</div>
              <div style={{fontWeight:600,color:"#0f172a",fontSize:".82rem"}}>{item?.name||"Unknown"}<br/><span style={{fontWeight:400,color:"#94a3b8",fontSize:".68rem"}}>{item?.code}</span></div>
              <div style={{fontWeight:700,color:typeClr,fontSize:".88rem"}}>{mv.moveType.startsWith("ADJUST")?"→":mv.moveType.startsWith("OUT")?"-":"+"}{n(mv.qty)} {item?.unit}</div>
              <div style={{fontSize:".7rem",color:typeClr,fontWeight:600}}>{mv.moveType.split(" — ")[0]}</div>
              <div style={{fontWeight:600,color:"#0f172a",fontSize:".82rem"}}>{val>0?fmt(val):"—"}</div>
              <div style={{fontSize:".75rem",color:"#64748b"}}>{deal?`📁 ${deal.client} (${deal.ceNo||""})`:""}{mv.notes&&<span style={{marginLeft:deal?8:0,color:"#94a3b8",fontStyle:"italic"}}>{mv.notes}</span>}<br/><span style={{fontSize:".68rem",color:"#94a3b8"}}>by {mv.recordedBy}</span></div>
            </div>
          );
        })}
        </div>
      </div>
    </div>
  );
}

export {InventoryView,StockMovementView};
