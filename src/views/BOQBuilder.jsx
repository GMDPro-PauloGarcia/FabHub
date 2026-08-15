import React,{useState,useEffect,useLayoutEffect,useRef} from "react";
import {today,uid,KEYS,Card,uiConfirm} from "../shared";
import {isSupabaseReady,sbInsert,sbUpdate,sbDelete} from "../supabaseClient";

// A textarea that grows to fit its content. BOQ line-item descriptions are
// often multi-line spec lists (a title + "Specifications:" + bullets), so a
// fixed one-row box clips them and makes editing awkward. This re-measures on
// every value change — including the initial load of a saved BOQ — so existing
// multi-line text opens at full height instead of clipped to one line, and it
// grows/shrinks live as you type. minRows sets a comfortable starting height.
function AutoGrowTextarea({value,minRows=2,style,onInput,...rest}){
  const ref=useRef(null);
  const resize=el=>{if(!el)return;el.style.height="auto";el.style.height=Math.max(el.scrollHeight,0)+"px";};
  useLayoutEffect(()=>{resize(ref.current);},[value]);
  return <textarea ref={ref} value={value} rows={minRows}
    onInput={e=>{resize(e.target);onInput&&onInput(e);}}
    style={{resize:"none",overflow:"hidden",...style}} {...rest}/>;
}

const BOQ_SECTIONS=[
  {id:"1",label:"General Requirements",color:"#64748b"},
  {id:"2",label:"Architectural",color:"#3b82f6"},
  {id:"3",label:"Electrical",color:"#f59e0b"},
  {id:"4",label:"Electronics",color:"#8b5cf6"},
  {id:"5",label:"Mechanical",color:"#06b6d4"},
  {id:"6",label:"Plumbing",color:"#10b981"},
  {id:"7",label:"FDAS / Fire Protection",color:"#ef4444"},
  {id:"8",label:"Signages",color:"#f97316"},
  {id:"9",label:"Built Ins / Furnitures",color:"#ec4899"},
];
const BOQ_SEC_CLR=Object.fromEntries(BOQ_SECTIONS.map(s=>[s.id,s.color]));
const FINISH_LEVELS=["Budget","Mid-range","High-end","Premium/Luxury"];

const GMD_DEFAULT_LIBRARY=[
  // A. General Requirements
  {name:"Mobilization / Demobilization",section:"1",unit:"lot",unitCost:0,tags:["mobilization","general"]},
  {name:"Bonds and Insurance (CARI)",section:"1",unit:"lot",unitCost:0,tags:["insurance","general"]},
  {name:"Supervision — Project-In-Charge (PIC)",section:"1",unit:"lot",unitCost:0,tags:["supervision","general"]},
  {name:"Supervision — Safety Officer",section:"1",unit:"lot",unitCost:0,tags:["supervision","general"]},
  {name:"Permits and Clearances — Processing Fee",section:"1",unit:"lot",unitCost:0,tags:["permits","general"]},
  {name:"Permits and Clearances — Building Permit Fee",section:"1",unit:"lot",unitCost:0,tags:["permits","general"]},
  {name:"Permits and Clearances — Occupancy Permit",section:"1",unit:"lot",unitCost:0,tags:["permits","general"]},
  {name:"Permits and Clearances — Others",section:"1",unit:"lot",unitCost:5000,tags:["permits","general"]},
  {name:"Temporary Utilities",section:"1",unit:"lot",unitCost:0,tags:["utilities","general"]},
  {name:"Board Up",section:"1",unit:"lot",unitCost:0,tags:["board up","general"]},
  {name:"Clean Up",section:"1",unit:"lot",unitCost:0,tags:["clean up","general"]},
  {name:"As-Built Drawings — Architectural",section:"1",unit:"sets",unitCost:4000,tags:["as-built","drawings"]},
  {name:"As-Built Drawings — Electrical",section:"1",unit:"sets",unitCost:4000,tags:["as-built","drawings"]},
  {name:"As-Built Drawings — Electronics",section:"1",unit:"sets",unitCost:4000,tags:["as-built","drawings"]},
  {name:"As-Built Drawings — Mechanical",section:"1",unit:"sets",unitCost:4000,tags:["as-built","drawings"]},
  {name:"As-Built Drawings — Plumbing",section:"1",unit:"sets",unitCost:4000,tags:["as-built","drawings"]},
  {name:"As-Built Drawings — Fire Protection",section:"1",unit:"sets",unitCost:4000,tags:["as-built","drawings"]},
  // B. Architectural
  {name:"Floor Tiles (60×60cm Non-Skid Cement Finish)",section:"2",unit:"sqm",unitCost:0,tags:["floor","tiles","architectural"]},
  {name:"Single Face Drywall with Paint Finish",section:"2",unit:"sqm",unitCost:0,tags:["wall","drywall","architectural"]},
  {name:"Double Face Drywall with Paint Finish",section:"2",unit:"sqm",unitCost:0,tags:["wall","drywall","architectural"]},
  {name:"CHB Wall with Firebricks",section:"2",unit:"sqm",unitCost:0,tags:["wall","chb","architectural"]},
  {name:"Mirror",section:"2",unit:"sqm",unitCost:0,tags:["mirror","architectural"]},
  {name:"Paint — White Satin",section:"2",unit:"sqm",unitCost:0,tags:["paint","architectural"]},
  {name:"Paint — White Textured",section:"2",unit:"sqm",unitCost:0,tags:["paint","architectural"]},
  {name:"Stainless Steel Brushed Finish",section:"2",unit:"sqm",unitCost:0,tags:["stainless","architectural"]},
  {name:"Gypsum Ceiling with Paint Finish",section:"2",unit:"sqm",unitCost:0,tags:["ceiling","gypsum","architectural"]},
  {name:"Stainless Steel Finish Ceiling Panel",section:"2",unit:"sqm",unitCost:0,tags:["ceiling","stainless","architectural"]},
  {name:"Flush Door with Complete Accessories",section:"2",unit:"unit/s",unitCost:0,tags:["door","architectural"]},
  {name:"Polycarbonate Roll-Up Door (Supervision Only)",section:"2",unit:"lot",unitCost:0,tags:["door","architectural"]},
  {name:"Demolition Works",section:"2",unit:"lot",unitCost:0,tags:["demolition","architectural"]},
  {name:"Working Drawings / Design Fee",section:"2",unit:"lot",unitCost:0,tags:["design","drawings"]},
  // C. Electrical
  {name:"Panel Board",section:"3",unit:"lot",unitCost:0,tags:["panel board","electrical"]},
  {name:"Roughing-In",section:"3",unit:"lot",unitCost:0,tags:["roughing in","electrical"]},
  {name:"Electrical Wiring",section:"3",unit:"lot",unitCost:0,tags:["wiring","electrical"]},
  {name:"Outlet and Switches",section:"3",unit:"lot",unitCost:0,tags:["outlet","switches","electrical"]},
  {name:"Lighting Fixtures",section:"3",unit:"lot",unitCost:0,tags:["lighting","electrical"]},
  {name:"Testing and Commissioning",section:"3",unit:"lot",unitCost:0,tags:["testing","electrical"]},
  // D. Electronics
  {name:"Smoke Detector",section:"4",unit:"lot",unitCost:0,tags:["smoke detector","electronics"]},
  {name:"CCTV",section:"4",unit:"lot",unitCost:0,tags:["cctv","electronics"]},
  {name:"DATA / TEL Roughing-In",section:"4",unit:"lot",unitCost:0,tags:["data","tel","electronics"]},
  // E. Mechanical
  {name:"HVAC (FCU, Ducting, CHW Pipe, Cat Walk)",section:"5",unit:"lot",unitCost:0,tags:["hvac","mechanical","aircon"]},
  // F. Plumbing
  {name:"Cold Water Line (incl. water filter)",section:"6",unit:"lot",unitCost:0,tags:["water","plumbing"]},
  {name:"Sewage Line (incl. grease trap)",section:"6",unit:"lot",unitCost:0,tags:["sewage","plumbing"]},
  // G. FDAS / Fire Protection
  {name:"Sprinkler System",section:"7",unit:"lot",unitCost:0,tags:["sprinkler","fdas","fire"]},
  {name:"Fire Suppression System",section:"7",unit:"lot",unitCost:0,tags:["fire suppression","fdas"]},
  // H. Signages
  {name:"Storefront Signage",section:"8",unit:"lot",unitCost:0,tags:["signage","storefront"]},
  {name:"Lightbox Signage",section:"8",unit:"lot",unitCost:0,tags:["signage","lightbox"]},
  {name:"Cube / 3D Signage",section:"8",unit:"lot",unitCost:0,tags:["signage","cube"]},
  {name:"Logo Signage",section:"8",unit:"lot",unitCost:0,tags:["signage","logo"]},
  {name:"Wall Signage",section:"8",unit:"lot",unitCost:0,tags:["signage","wall"]},
  // I. Built-Ins / Furniture
  {name:"Front Counter",section:"9",unit:"lot",unitCost:0,tags:["counter","built-in","furniture"]},
  {name:"Back Counter",section:"9",unit:"lot",unitCost:0,tags:["counter","built-in","furniture"]},
  {name:"Display Module",section:"9",unit:"unit/s",unitCost:0,tags:["display","built-in","furniture"]},
  {name:"Display Table",section:"9",unit:"unit/s",unitCost:0,tags:["table","built-in","furniture"]},
  {name:"Wall Module",section:"9",unit:"unit/s",unitCost:0,tags:["wall module","built-in","furniture"]},
  {name:"Storage Cabinet",section:"9",unit:"unit/s",unitCost:0,tags:["cabinet","built-in","furniture"]},
  {name:"Pantry Counter",section:"9",unit:"lot",unitCost:0,tags:["pantry","built-in","furniture"]},
  {name:"Overhead Cabinet",section:"9",unit:"unit/s",unitCost:0,tags:["cabinet","built-in","furniture"]},
  {name:"Stainless Steel Table",section:"9",unit:"pcs",unitCost:0,tags:["table","stainless","furniture"]},
  {name:"Stainless Steel Chair",section:"9",unit:"pcs",unitCost:0,tags:["chair","stainless","furniture"]},
  {name:"Stainless Steel Bench",section:"9",unit:"pcs",unitCost:0,tags:["bench","stainless","furniture"]},
  {name:"Stainless Steel Sink",section:"9",unit:"set",unitCost:0,tags:["sink","stainless","furniture"]},
  {name:"Low Partition",section:"9",unit:"sets",unitCost:0,tags:["partition","built-in","furniture"]},
];

// ─── CHART OF ACCOUNTS ──────────────────────────────────────────────────────

function BOQBuilder({wonDeals,deals,jos,session,role,toastEmit,boqLibrary=[],setBoqLibrary,initialDealId,clearBoqDeal,onBack,standaloneBoqs=[],saveStandaloneBoq,initialStandaloneId,clearBoqStandalone,onLinkToDeal,onUnlinkToStandalone,onBoqValue,onBoqData,initialCoId,coRecord,saveCoBoq,readOnly=false}){
  // Read-only mode: the BOQ can be viewed and printed/exported (e.g. Sales sending
  // a change-order BOQ to a client) but never edited. Every mutator no-ops and the
  // editing chrome is hidden, so the printed PDF always matches the saved figures.
  const ro=!!readOnly;
  // Start blank — sections are added per BOQ, no fixed/preset sections
  const BLANK_ITEMS=()=>[];
  // Draft key used when no project is selected yet (work is migrated onto the deal once picked)
  const BOQ_SCRATCH_KEY="__scratch__";
  const loadDraft=(dealId)=>{
    if(!dealId) return null;
    try{const drafts=JSON.parse(localStorage.getItem(KEYS.boqDrafts)||"{}");return drafts[dealId]||null;}
    catch{return null;}
  };
  const saveDraft=(dealId,data)=>{
    if(!dealId) return;
    try{const drafts=JSON.parse(localStorage.getItem(KEYS.boqDrafts)||"{}");drafts[dealId]=data;localStorage.setItem(KEYS.boqDrafts,JSON.stringify(drafts));}
    catch{}
  };
  const deleteDraft=(dealId)=>{
    if(!dealId) return;
    try{const drafts=JSON.parse(localStorage.getItem(KEYS.boqDrafts)||"{}");delete drafts[dealId];localStorage.setItem(KEYS.boqDrafts,JSON.stringify(drafts));}
    catch{}
  };

  const[selDeal,setSelDeal]=useState(initialDealId||"");
  // NOTE: do NOT clear the parent's boqDealId/boqStandaloneId here — the route uses
  // those ids as the mount condition for this component. Clearing them mid-mount would
  // unmount the builder and bounce back to the BOQ list. Navigation resets them instead.
  useEffect(()=>{if(initialDealId)setSelDeal(initialDealId);},[initialDealId]);
  // Standalone mode: a BOQ that isn't tied to a pipeline deal (saved to the shared standalone store)
  const[standaloneId,setStandaloneId]=useState(initialStandaloneId||null);
  useEffect(()=>{if(initialStandaloneId){setStandaloneId(initialStandaloneId);setSelDeal("");}},[initialStandaloneId]);
  // Change-order mode: a BOQ that belongs to a change order (addendum) rather than
  // a pipeline deal. It edits the CO's own scope, then merges into the parent
  // project's BOQ once the CO is approved (handled by the host's saveCoBoq).
  const[coId,setCoId]=useState(initialCoId||null);
  useEffect(()=>{if(initialCoId){setCoId(initialCoId);setSelDeal("");}},[initialCoId]);
  // The parent deal a change order rolls into — used only for header context.
  const coParentDeal=coId?deals.find(d=>d.id===(coRecord?.dealId||coRecord?.projectId)):null;
  const[boqTitle,setBoqTitle]=useState("");
  const[location,setLocation]=useState("");
  const[quotationNo,setQuotationNo]=useState("");
  const[boqDate,setBoqDate]=useState(today);
  const[items,setItems]=useState(BLANK_ITEMS);
  const[vatEnabled,setVatEnabled]=useState(true);
  const[discount,setDiscount]=useState("");   // peso amount subtracted from subtotal before VAT
  const[suggest,setSuggest]=useState({id:null,matches:[]});
  const[draftSaved,setDraftSaved]=useState(false);
  const draftTimerRef=useRef(null);

  // Dynamic sections — start empty, fully built per BOQ (no fixed sections)
  const SEC_COLORS=["#64748b","#3b82f6","#f59e0b","#8b5cf6","#06b6d4","#10b981","#ef4444","#f97316","#ec4899","#0ea5e9","#14b8a6","#a855f7","#e11d48","#84cc16","#d97706","#6366f1"];
  const[sections,setSections]=useState([]);
  const loadStandardSections=()=>setSections(ss=>ss.length?ss:BOQ_SECTIONS);
  const[editingSecId,setEditingSecId]=useState(null);
  const[editingSubKey,setEditingSubKey]=useState(null); // "<secId>::<subLabel>" while renaming a sub-section
  const[addSecOpen,setAddSecOpen]=useState(false);
  const[newSecForm,setNewSecForm]=useState({id:"",label:""});

  const renameSection=(id,label)=>{if(ro)return;setSections(ss=>ss.map(s=>s.id===id?{...s,label}:s));};
  const addSection=()=>{
    if(ro)return;
    const sid=newSecForm.id.trim()||String(sections.length+1);
    if(!newSecForm.label.trim()){toastEmit("Section name is required.");return;}
    if(sections.find(s=>s.id===sid)){toastEmit(`Section "${sid}" already exists.`);return;}
    setSections(ss=>[...ss,{id:sid,label:newSecForm.label.trim(),color:SEC_COLORS[ss.length%SEC_COLORS.length]}]);
    setNewSecForm({id:"",label:""});
    setAddSecOpen(false);
  };
  const deleteSection=(id)=>{
    if(ro)return;
    if(items.some(it=>it.section===id)){toastEmit("Move or delete all items in this section first.");return;}
    setSections(ss=>{
      const remaining=ss.filter(s=>s.id!==id);
      // Reassign sequential letter IDs: A, B, C...
      const remap={};
      const renumbered=remaining.map((s,i)=>{const newId=String(i+1);remap[s.id]=newId;return{...s,id:newId};});
      // Update items to use new section IDs
      setItems(its=>its.map(it=>({...it,section:remap[it.section]||it.section})));
      return renumbered;
    });
  };

  // Library state
  const[libOpen,setLibOpen]=useState(false);
  const[libSearch,setLibSearch]=useState("");
  const[libTab,setLibTab]=useState("search");
  const[libForm,setLibForm]=useState({name:"",description:"",section:"2",unit:"lot",unitCost:"",tags:""});
  const[libEditId,setLibEditId]=useState(null);
  const canManageLib=["Manager","QS"].includes(role);

  const saveLibrary=(newLib)=>{setBoqLibrary(newLib);localStorage.setItem("gmdv5:boqLibrary",JSON.stringify(newLib));};

  const filteredLib=boqLibrary.filter(it=>{
    if(!libSearch) return true;
    const q=libSearch.toLowerCase();
    const sec=sections.find(s=>s.id===it.section)||BOQ_SECTIONS.find(s=>s.id===it.section);
    return(it.name||"").toLowerCase().includes(q)||(sec?.label||"").toLowerCase().includes(q)||(it.description||"").toLowerCase().includes(q)||(it.tags||[]).some(t=>t.toLowerCase().includes(q));
  });

  const addLibItemToBoq=(libIt)=>{
    const m=Number(markupPct)||0,base=libIt.unitCost||0,uc=applyMk(base,m);
    setItems(its=>[...its,{_id:uid(),section:libIt.section||"B",itemCode:"",description:libIt.name,unit:libIt.unit||"lot",qty:1,baseCost:base,markup:m,unitCost:uc,total:uc,remarks:""}]);
    toastEmit(`"${libIt.name}" added to BOQ`);
  };

  const saveLibItem=()=>{
    if(!libForm.name.trim()){toastEmit("Item name is required.");return;}
    const isNew=!libEditId;
    const entry={id:libEditId||uid(),name:libForm.name.trim(),description:libForm.description.trim(),section:libForm.section,unit:libForm.unit||"lot",unitCost:Number(libForm.unitCost)||0,tags:libForm.tags.split(",").map(t=>t.trim()).filter(Boolean),createdBy:session?.name||"",createdAt:libEditId?(boqLibrary.find(x=>x.id===libEditId)?.createdAt||new Date().toISOString()):new Date().toISOString(),updatedAt:new Date().toISOString()};
    const newLib=libEditId?boqLibrary.map(x=>x.id===libEditId?entry:x):[...boqLibrary,entry];
    saveLibrary(newLib);
    if(isSupabaseReady()){
      const sbRow={id:entry.id,name:entry.name,description:entry.description,category:entry.section,unit:entry.unit,unit_cost:entry.unitCost,tags:entry.tags,created_by:entry.createdBy,created_at:entry.createdAt,updated_at:entry.updatedAt};
      if(isNew) sbInsert('boq_library',sbRow).catch(()=>{});
      else sbUpdate('boq_library',entry.id,sbRow).catch(()=>{});
    }
    setLibForm({name:"",description:"",section:"2",unit:"lot",unitCost:"",tags:""});
    setLibEditId(null);
    toastEmit(isNew?"Library item saved.":"Library item updated.");
  };

  const loadGMDDefaults=()=>{
    const existing=new Set(boqLibrary.map(x=>x.name.toLowerCase()));
    const toAdd=GMD_DEFAULT_LIBRARY.filter(d=>!existing.has(d.name.toLowerCase())).map(d=>({
      id:uid(),name:d.name,description:"",section:d.section,unit:d.unit,unitCost:d.unitCost||0,
      tags:d.tags||[],createdBy:session?.name||"GMD",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()
    }));
    if(!toAdd.length){toastEmit("All GMD default items are already in the library.");return;}
    const newLib=[...boqLibrary,...toAdd];
    saveLibrary(newLib);
    if(isSupabaseReady()) toAdd.forEach(e=>sbInsert('boq_library',{id:e.id,name:e.name,description:e.description,category:e.section,unit:e.unit,unit_cost:e.unitCost,tags:e.tags,created_by:e.createdBy,created_at:e.createdAt,updated_at:e.updatedAt}).catch(()=>{}));
    toastEmit(`${toAdd.length} GMD standard items added to library.`,"success");
  };

  const startEditLib=(it)=>{
    setLibEditId(it.id);
    setLibForm({name:it.name,description:it.description||"",section:it.section||"B",unit:it.unit,unitCost:String(it.unitCost||""),tags:(it.tags||[]).join(", ")});
    setLibTab("manage");
  };

  const deleteLibItem=(id)=>{
    saveLibrary(boqLibrary.filter(x=>x.id!==id));
    if(isSupabaseReady()) sbDelete('boq_library',id).catch(()=>{});
    if(libEditId===id){setLibEditId(null);setLibForm({name:"",description:"",section:"2",unit:"lot",unitCost:"",tags:""});}
  };

  // ── Markup (Contractor's Profit) ──────────────────────────────────────────
  // BOQ unit costs imported from the QS sheet are DIRECT costs — they exclude the
  // sales/contractor's-profit markup. We keep each item's direct cost in `baseCost`
  // and its markup % in `markup`; the client-facing `unitCost`/`total` are the
  // marked-up figures used everywhere else (print, CSV, totals, VAT).
  const[markupPct,setMarkupPct]=useState("");
  const roundP=n=>Math.round((Number(n)||0)*100)/100;
  const applyMk=(base,m)=>{const b=Number(base)||0,mk=Number(m)||0;return mk?roundP(b*(1+mk/100)):b;};
  // Ensure legacy items (saved before markup existed) carry baseCost/markup fields.
  const normItem=it=>({...it,baseCost:it.baseCost!=null?it.baseCost:(Number(it.unitCost)||0),markup:it.markup!=null?it.markup:0});
  const applyMarkupToAll=()=>{
    if(ro)return;
    const m=Number(markupPct)||0;
    setItems(its=>its.map(it=>{const base=it.baseCost!=null?it.baseCost:(Number(it.unitCost)||0);const uc=applyMk(base,m);return{...it,baseCost:base,markup:m,unitCost:uc,total:roundP((it.qty||0)*uc)};}));
    toastEmit&&toastEmit(m>0?`${m}% standard markup applied to all items`:"Markup cleared — showing direct costs","success");
  };
  // Per-section markup: the common markup across a section's items, or "" if they differ.
  const sectionMarkup=(secId)=>{const si=items.filter(it=>it.section===secId);if(!si.length)return"";const first=Number(si[0].markup)||0;return si.every(it=>(Number(it.markup)||0)===first)?first:"";};
  const applyMarkupToSection=(secId,m)=>{
    const mk=Number(m)||0;
    setItems(its=>its.map(it=>{if(it.section!==secId)return it;const base=it.baseCost!=null?it.baseCost:(Number(it.unitCost)||0);const uc=applyMk(base,mk);return{...it,baseCost:base,markup:mk,unitCost:uc,total:roundP((it.qty||0)*uc)};}));
  };

  // ── Excel / CSV import ────────────────────────────────────────────────────
  const importFileRef=useRef(null);
  const[importOpen,setImportOpen]=useState(false);
  const[importPreview,setImportPreview]=useState(null);
  const[importErr,setImportErr]=useState("");
  const[importFileName,setImportFileName]=useState("");
  const[importMode,setImportMode]=useState("append"); // append | replace
  const[importMarkup,setImportMarkup]=useState(""); // markup % to bake in on import

  // ── Deal value ↔ BOQ reconciliation ───────────────────────────────────────
  // When a deal is opened whose pegged value disagrees with its BOQ (BOQ is the
  // source of truth), or which has a value but no BOQ yet, prompt for the amount
  // actually awarded. Fires on open only — never mid-edit. `reconciledRef` keeps
  // it to one prompt per deal per session.
  const[reconcile,setReconcile]=useState(null); // {net, dealValue, hasBoq}
  const[reconcileCustom,setReconcileCustom]=useState("");
  const reconciledRef=useRef({});
  const boqNetOf=(src)=>{
    const sub=(src?.items||[]).reduce((s,it)=>s+(Number(it.total)||0),0);
    const disc=Number(src?.discount)||0;
    if(disc>0) return Math.max(0,sub-disc);
    // Back-compat: older BOQs stored a net-total override in discountedTotal.
    const legacy=Number(src?.discountedTotal)||0;
    if(legacy>0) return legacy;
    return sub;
  };

  // Parse a sheet (array-of-arrays) into {sections,items}. Auto-detects the header
  // row and column positions. Handles GMD's nested layout where the section letter
  // is in the "Item No." column, sub-group headers sit one column in, and their
  // items sit another column in (e.g. "Supervision" › "Safety Officer").
  const parseBoqAoa=(aoa)=>{
    const norm=s=>String(s==null?"":s).trim().toLowerCase();
    const toNum=v=>{if(v==null||v==="")return null;const n=parseFloat(String(v).replace(/[₱,\s]/g,""));return isNaN(n)?null:n;};
    let headerIdx=-1,cm=null;
    for(let r=0;r<Math.min(aoa.length,25);r++){
      const cells=(aoa[r]||[]).map(norm);
      const has=(...keys)=>cells.findIndex(c=>c&&keys.some(k=>c===k||c.includes(k)));
      const itemNo=has("item no","item #","s/n","sr no","ref no","ref","no.");
      // Prefer a real "Description" column; only fall back to a bare "item" column
      // (and never the item-number column) so nested-group detection lines up.
      let desc=has("description","particular","scope of work","work item","item description","scope");
      if(desc<0) desc=cells.findIndex((c,i)=>i!==itemNo&&c&&(c==="item"||c.includes("item")));
      const qty=has("qty","quantity");
      const unit=cells.findIndex(c=>c==="unit"||c==="uom"||c==="units");
      let cost=has("unit cost","unit price","rate");
      if(cost<0) cost=has("cost","price");
      if(desc>=0&&desc!==itemNo&&(qty>=0||cost>=0||unit>=0)){
        let total=has("total amount","total cost","line total","total","amount");
        const remarks=has("remarks","remark","notes","note");
        cm={itemNo,desc,qty,unit,cost,total:(total>=0&&total!==cost&&total!==desc)?total:-1,remarks};
        headerIdx=r;break;
      }
    }
    if(!cm) return {items:[],sections:[],error:"header"};
    const cell=(row,i)=>i>=0&&i<row.length?row[i]:"";
    // Description may span several columns between the Item No. and Qty columns.
    const after=[cm.qty,cm.unit,cm.cost,cm.total,cm.remarks].filter(i=>i>cm.desc);
    const descEnd=after.length?Math.min(...after):cm.desc+1;
    const descCols=[];for(let i=cm.desc;i<descEnd;i++)descCols.push(i);
    const nested=descCols.length>1;
    const skipRe=/^(sub-?\s*total|vat\b|value added|discount|prepared by|approved|accepted|checked by|noted by|bank details|payment terms|general notes?|terms|notes?:|account name|•|bdo|bpi|metrobank)/i;
    const stopRe=/grand\s*total/i;
    const secRe=/^\s*([A-Za-z]{1,2}|\d{1,3})[\.\)]\s+(.+)$/;
    const sections=[],items=[];let curId=null,curGroup=null;
    for(let r=headerIdx+1;r<aoa.length;r++){
      const row=aoa[r]||[];
      const itemNo=String(cell(row,cm.itemNo)||"").trim();
      const parts=descCols.map(i=>String(cell(row,i)||"").trim());
      const firstText=parts[0]||"";
      let deepIdx=-1;for(let k=parts.length-1;k>=0;k--){if(parts[k]){deepIdx=k;break;}}
      const deepText=deepIdx>=0?parts[deepIdx]:"";
      const unitVal=String(cell(row,cm.unit)||"").trim();
      const qtyN=toNum(cell(row,cm.qty)),costN=toNum(cell(row,cm.cost)),totalN=toNum(cell(row,cm.total));
      // Stop once we reach the grand-total line — everything below is notes/signatures.
      if(stopRe.test(itemNo)||parts.some(p=>stopRe.test(p))||stopRe.test(String(cell(row,cm.cost)||""))||stopRe.test(String(cell(row,cm.total)||""))) break;
      if(!deepText&&!itemNo&&qtyN===null&&costN===null) continue;
      if(skipRe.test(itemNo)||parts.some(p=>skipRe.test(p))) continue;
      // Label-only row (no qty, no cost): a section, a sub-group, or a flat section.
      if(deepText&&qtyN===null&&costN===null){
        const m=deepText.match(secRe);
        if(itemNo&&itemNo.length<=3){
          const id=(itemNo).replace(/[.\)]+$/,"").trim();
          const label=(m?m[2]:deepText).trim();
          if(!sections.find(s=>s.id===id)) sections.push({id,label});
          curId=id;curGroup=null;
        }else if(nested){
          curGroup=firstText||deepText;
        }else{
          const id=(m?m[1]:String(sections.length+1)).replace(/[.\)]+$/,"").trim();
          const label=(m?m[2]:deepText).trim();
          if(!sections.find(s=>s.id===id)) sections.push({id,label});
          curId=id;curGroup=null;
        }
        continue;
      }
      if(!deepText) continue; // numbers with no label — skip
      // A line item.
      let secId=curId;
      if(!secId&&itemNo.includes(".")) secId=itemNo.split(".")[0].trim();
      if(!secId){
        if(!sections.length) sections.push({id:"1",label:"Imported Items"});
        secId=sections[sections.length-1].id;
      }
      // Nested sub-item → file it under its sub-group as a real sub-section;
      // top-level item → clear the group so it sits directly under the section.
      let name=deepText,subsection="";
      if(deepIdx>0){ if(curGroup) subsection=curGroup; }
      else { curGroup=null; }
      const q=qtyN==null?1:qtyN,uc=costN==null?(totalN!=null&&q?totalN/q:0):costN;
      items.push({section:String(secId),subsection,description:name,unit:unitVal||"lot",qty:q,baseCost:uc,unitCost:uc,total:q*uc,remarks:String(cell(row,cm.remarks)||"").trim(),markup:0});
    }
    items.forEach(it=>{if(!sections.find(s=>s.id===it.section)) sections.push({id:it.section,label:`Section ${it.section}`});});
    const lbls=[];
    [["Description",cm.desc],["Qty",cm.qty],["Unit",cm.unit],["Unit Cost",cm.cost],["Remarks",cm.remarks]].forEach(([n,i])=>{if(i>=0)lbls.push(n);});
    return {items,sections,columnsLabel:lbls.join(", ")};
  };

  const handleImportFile=(file)=>{
    if(!file) return;
    setImportErr("");setImportPreview(null);setImportFileName(file.name);
    if(!window.XLSX){setImportErr("Excel reader not loaded yet — please refresh the page and try again.");return;}
    const reader=new FileReader();
    reader.onload=e=>{
      try{
        const wb=window.XLSX.read(new Uint8Array(e.target.result),{type:"array"});
        const sheetName=wb.SheetNames.find(n=>/bo[qz]|quot|bill|estimate/i.test(n))||wb.SheetNames[0];
        const aoa=window.XLSX.utils.sheet_to_json(wb.Sheets[sheetName],{header:1,defval:"",blankrows:false});
        const parsed=parseBoqAoa(aoa);
        if(parsed.error==="header"){setImportErr("Couldn't find the table header. Your sheet needs a row with columns like Description, Qty, Unit and Unit Cost.");return;}
        if(!parsed.items.length){setImportErr("No line items found under the detected header. Check that item rows have a description plus a quantity or unit cost.");return;}
        setImportPreview({...parsed,sheetName});
      }catch(err){setImportErr("Could not read this file: "+(err.message||err));}
    };
    reader.onerror=()=>setImportErr("Failed to read the file.");
    reader.readAsArrayBuffer(file);
  };

  const applyImport=()=>{
    if(!importPreview) return;
    const m=Number(importMarkup)||0;
    const impSecs=importPreview.sections;
    const impItems=importPreview.items.map(it=>{const uc=applyMk(it.baseCost,m);return{...it,markup:m,unitCost:uc,total:roundP((it.qty||0)*uc)};});
    if(importMode==="replace"){
      setSections(impSecs.map((s,i)=>({id:s.id,label:s.label,color:SEC_COLORS[i%SEC_COLORS.length]})));
      setItems(impItems.map(it=>({...it,_id:uid()})));
    }else{
      const existing=new Set(sections.map(s=>s.id));
      const remap={},added=[];
      impSecs.forEach(s=>{
        const sameLabel=sections.find(p=>p.label.trim().toLowerCase()===s.label.trim().toLowerCase());
        if(sameLabel){remap[s.id]=sameLabel.id;return;}
        let nid=s.id||String(sections.length+added.length+1);
        while(existing.has(nid)) nid=String((parseInt(nid,10)||(sections.length+added.length))+1);
        remap[s.id]=nid;existing.add(nid);
        added.push({id:nid,label:s.label,color:SEC_COLORS[(sections.length+added.length)%SEC_COLORS.length]});
      });
      setSections([...sections,...added]);
      setItems([...items,...impItems.map(it=>({...it,_id:uid(),section:remap[it.section]||it.section}))]);
    }
    if(m) setMarkupPct(String(m));
    toastEmit&&toastEmit(`${impItems.length} items imported${m?` with ${m}% markup`:""} from ${importFileName||"file"}`,"success");
    setImportOpen(false);setImportPreview(null);setImportErr("");setImportFileName("");setImportMarkup("");
  };

  const deal=wonDeals.find(d=>d.id===selDeal)||deals.find(d=>d.id===selDeal);
  // Human-readable project label for a deal — same format as the project dropdown.
  const dealLabel=(d)=>d?`${d.client||""}${d.contact?" · "+d.contact:""}${d.ceNo?" ("+d.ceNo+")":""}`.trim():"";

  const applyBoqSrc=(src)=>{
    if(src.items) setItems(src.items.map(normItem));
    if(src.sections) setSections(src.sections);
    if(src.boqTitle!==undefined) setBoqTitle(src.boqTitle);
    if(src.location!==undefined) setLocation(src.location);
    if(src.quotationNo!==undefined) setQuotationNo(src.quotationNo);
    if(src.boqDate!==undefined) setBoqDate(src.boqDate);
    if(src.vatEnabled!==undefined) setVatEnabled(src.vatEnabled);
    if(src.discount!==undefined){
      setDiscount(src.discount);
    }else if(Number(src.discountedTotal)>0){
      // Back-compat: convert an old net-total override into the equivalent discount amount.
      const sub=(src.items||[]).reduce((s,it)=>s+(Number(it.total)||0),0);
      const d=sub-Number(src.discountedTotal);
      setDiscount(d>0?String(Math.round(d*100)/100):"");
    }else{
      setDiscount("");
    }
    if(src.markupPct!==undefined) setMarkupPct(src.markupPct);
  };

  React.useEffect(()=>{
    if(coId){
      // Change-order BOQ — load the CO's stored scope (read once on open).
      const bd=coRecord?.coBoqData;
      if(bd&&((bd.items?.length)||(bd.sections?.length))){
        applyBoqSrc(bd);
      }else{
        // First time building this CO's BOQ — seed the header from the CO/parent.
        setItems(BLANK_ITEMS());setSections([]);setDiscount("");
        setBoqTitle(coRecord?.title?`CO — ${coRecord.title}`:"Change Order");
        setLocation(coParentDeal?.location||"");
        if(coParentDeal?.ceNo) setQuotationNo(coParentDeal.ceNo);
      }
      setDraftSaved(true);
      return;
    }
    if(standaloneId){
      // Standalone BOQ — load from the shared store (read once on open)
      const rec=standaloneBoqs.find(b=>b.id===standaloneId);
      if(rec){applyBoqSrc({items:rec.items,sections:rec.sections,boqTitle:rec.title,location:rec.location,quotationNo:rec.quotationNo,boqDate:rec.boqDate,vatEnabled:rec.vatEnabled,discount:rec.discount,discountedTotal:rec.discountedTotal,markupPct:rec.markupPct});}
      setDraftSaved(true);
      return;
    }
    if(!selDeal){
      // No project selected yet — restore any scratch draft so in-progress work isn't lost
      const scratch=loadDraft(BOQ_SCRATCH_KEY);
      if(scratch){applyBoqSrc(scratch);setDraftSaved(true);}
      return;
    }
    // Prefer Supabase-stored BOQ (deal.boqData), fall back to localStorage draft
    const existing=deal?.boqData||loadDraft(selDeal);
    if(existing){
      applyBoqSrc(existing);
      // Backfill a missing project title from the linked deal so existing BOQs
      // (imported, or saved with a blank header) still carry their project name.
      // The autosave effect then persists it back onto the deal's BOQ data.
      if(!(existing.boqTitle&&String(existing.boqTitle).trim())&&deal){
        setBoqTitle(dealLabel(deal));
      }
      setDraftSaved(true);
    } else {
      // No saved BOQ for this deal yet — adopt a scratch draft built before a project was chosen
      const scratch=loadDraft(BOQ_SCRATCH_KEY);
      if(scratch&&((scratch.items?.length)||(scratch.sections?.length))){
        applyBoqSrc(scratch);
        deleteDraft(BOQ_SCRATCH_KEY);
      } else {
        setItems(BLANK_ITEMS());
        setSections([]);
        setDiscount("");
        const d=deal;
        if(d){
          setLocation(d.location||"");
          setBoqTitle(`${d.client||""}${d.contact?" · "+d.contact:""}${d.ceNo?" ("+d.ceNo+")":""}`);
          if(d.ceNo) setQuotationNo(d.ceNo);
        }
      }
      setDraftSaved(false);
    }
    // Reconcile the deal's pegged value against its BOQ — once per deal per session, on open.
    if(!reconciledRef.current[selDeal]){
      const dealValue=Number(deal?.value)||0;
      const hasBoq=(existing?.items?.length||0)>0;
      const net=hasBoq?Math.round(boqNetOf(existing)*100)/100:0;
      const dv=Math.round(dealValue*100)/100;
      if(hasBoq&&dealValue>0&&Math.abs(net-dv)>=0.01){
        setReconcile({net,dealValue:dv,hasBoq:true});setReconcileCustom("");
      } else if(!hasBoq&&dealValue>0){
        setReconcile({net:0,dealValue:dv,hasBoq:false});setReconcileCustom("");
      }
    }
  },[selDeal,standaloneId,coId]);

  React.useEffect(()=>{
    if(ro){setDraftSaved(true);return;}   // read-only view never persists
    if(coId){
      // Change-order BOQ — autosave back onto the addendum via the host. The host
      // derives the CO's scope line items + value from these, so it rolls into the
      // parent project's BOQ and contract when the CO is approved.
      setDraftSaved(false);
      clearTimeout(draftTimerRef.current);
      draftTimerRef.current=setTimeout(()=>{
        saveCoBoq&&saveCoBoq(coId,{items,sections,boqTitle,location,quotationNo,boqDate,vatEnabled,discount,markupPct});
        setDraftSaved(true);
      },1200);
      return()=>clearTimeout(draftTimerRef.current);
    }
    if(standaloneId){
      // Standalone BOQ — autosave to the shared store (synced via Supabase)
      setDraftSaved(false);
      clearTimeout(draftTimerRef.current);
      draftTimerRef.current=setTimeout(()=>{
        saveStandaloneBoq&&saveStandaloneBoq({id:standaloneId,title:boqTitle,location,quotationNo,boqDate,items,sections,vatEnabled,discount,markupPct,updatedAt:new Date().toISOString()});
        setDraftSaved(true);
      },1200);
      return()=>clearTimeout(draftTimerRef.current);
    }
    // Save under the deal key, or a scratch key when no project is selected yet,
    // so a BOQ is never lost just because a project hasn't been picked.
    const hasContent=items.length>0||sections.length>0;
    if(!selDeal&&!hasContent) return;
    setDraftSaved(false);
    clearTimeout(draftTimerRef.current);
    draftTimerRef.current=setTimeout(()=>{
      const boqData={items,sections,boqTitle,location,quotationNo,boqDate,vatEnabled,discount,markupPct};
      saveDraft(selDeal||BOQ_SCRATCH_KEY,boqData);
      if(selDeal&&isSupabaseReady()) sbUpdate('deals',selDeal,{boq_data:boqData}).catch(()=>{});
      // Reflect the saved BOQ in the shared deals state immediately so surfaces
      // that read deal.boqData (BOQ list "has BOQ", print, contract breakdown)
      // update without waiting for the realtime echo / a manual refresh.
      if(selDeal&&onBoqData) onBoqData(selDeal,boqData);
      // Seed the deal's contract value from the BOQ (net of VAT) ONLY when the deal has
      // no value yet. A pegged, non-zero value is never silently overwritten — a mismatch
      // is surfaced via the reconcile prompt when the deal is opened instead.
      if(selDeal&&onBoqValue&&items.length>0){
        const net=netTotal;
        const cur=Number(deal?.value)||0;
        if(cur===0&&net>0) onBoqValue(selDeal,net);
      }
      setDraftSaved(true);
    },1200);
    return()=>clearTimeout(draftTimerRef.current);
  },[coId,standaloneId,selDeal,items,sections,boqTitle,location,quotationNo,boqDate,vatEnabled,discount,markupPct]);


  const updateItem=(id,key,val)=>{if(ro)return;setItems(its=>its.map(it=>{
    if(it._id!==id) return it;
    const upd={...it,[key]:["description","unit","section","subsection","remarks"].includes(key)?val:Number(val)||0};
    // Unit cost / markup / qty all derive the effective cost and line total from
    // the direct cost (baseCost) and the per-item markup %.
    const base=upd.baseCost!=null?upd.baseCost:(Number(upd.unitCost)||0);
    const m=Number(upd.markup)||0;
    upd.baseCost=base;upd.markup=m;
    upd.unitCost=applyMk(base,m);
    upd.total=roundP((upd.qty||0)*upd.unitCost);
    return upd;
  }));};
  const removeItem=id=>{if(ro)return;setItems(its=>its.filter(it=>it._id!==id));};
  const addRow=(sec,subsection="")=>{if(ro)return;setItems(its=>[...its,{_id:uid(),section:sec||sections[0]?.id||"A",subsection,description:"",unit:"lot",qty:1,baseCost:0,unitCost:0,total:0,remarks:"",markup:0}]);};

  // ── Sub-sections ───────────────────────────────────────────────────────────
  // A section groups its items by an optional per-item `subsection` label. Items
  // with no label render flat directly under the section; named sub-sections
  // render after them with their own heading and sub-total. groupSection returns
  // the ungrouped items plus each named sub-section in first-appearance order,
  // with `num` = the trailing figure of its number (e.g. sec 2, num 3 → "2.3").
  const groupSection=(si)=>{
    const ungrouped=[],subMap=new Map();
    si.forEach(it=>{const sub=(it.subsection||"").trim();if(!sub)ungrouped.push(it);else{if(!subMap.has(sub))subMap.set(sub,[]);subMap.get(sub).push(it);}});
    const subs=[...subMap.entries()].map(([label,its],i)=>({label,items:its,num:ungrouped.length+i+1}));
    return {ungrouped,subs};
  };
  const subsectionsOf=(secId)=>{const seen=[];items.forEach(it=>{if(it.section!==secId)return;const s=(it.subsection||"").trim();if(s&&!seen.includes(s))seen.push(s);});return seen;};
  const renameSubsection=(secId,oldLabel,newLabel)=>{const nl=(newLabel||"").trim();if(nl===oldLabel)return;setItems(its=>its.map(it=>(it.section===secId&&(it.subsection||"").trim()===oldLabel)?{...it,subsection:nl}:it));};
  // Delete a sub-section by ungrouping its items (non-destructive — items stay).
  const removeSubsection=(secId,label)=>setItems(its=>its.map(it=>(it.section===secId&&(it.subsection||"").trim()===label)?{...it,subsection:""}:it));
  const addSubsection=(secId)=>{
    const existing=subsectionsOf(secId);let n=existing.length+1,label=`Sub-section ${n}`;
    while(existing.includes(label)){n++;label=`Sub-section ${n}`;}
    addRow(secId,label);setEditingSubKey(secId+"::"+label);
  };
  const applyLibItem=(rowId,lib)=>{
    const m=Number(markupPct)||0;
    setItems(its=>its.map(it=>{
      if(it._id!==rowId) return it;
      const base=lib.unitCost>0?lib.unitCost:(it.baseCost!=null?it.baseCost:it.unitCost);
      const uc=applyMk(base,m);
      const upd={...it,description:lib.name,unit:lib.unit||it.unit,baseCost:base,markup:m,unitCost:uc};
      upd.total=(upd.qty||0)*(upd.unitCost||0);
      return upd;
    }));
    setSuggest({id:null,matches:[]});
  };

  const grandTotal=items.reduce((s,it)=>s+it.total,0);
  // Discount is a peso amount subtracted from the subtotal BEFORE VAT. VAT and the
  // VAT-inclusive total are computed on the net (post-discount) figure.
  const discountVal=Math.min(Math.max(Number(discount)||0,0),grandTotal);
  const netTotal=roundP(grandTotal-discountVal);
  const vatAmount=netTotal*0.12;

  const printBOQ=()=>{
    const esc=s=>String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    const fmtP=v=>"₱"+Number(v||0).toLocaleString("en-PH",{minimumFractionDigits:2});
    const dateStr=boqDate?new Date(boqDate+"T00:00:00").toLocaleDateString("en-PH",{year:"numeric",month:"long",day:"numeric"}):"-";
    // Project / Location fall back to the linked pipeline deal so a BOQ tied to a
    // project never prints with a blank "Project" field (e.g. imported BOQs, or
    // when the title was never typed on the builder header).
    const projectName=(boqTitle&&boqTitle.trim())||dealLabel(deal)||"—";
    const locationName=(location&&location.trim())||deal?.location||"—";
    let rows="";
    sections.forEach(sec=>{
      const si=items.filter(it=>it.section===sec.id);
      if(!si.length) return;
      const secTotal=si.reduce((s,it)=>s+it.total,0);
      // Color-code each section by its assigned colour: a solid colour band for
      // the header, a matching left accent on every item row, and a tinted
      // sub-total. clr falls back to slate when a section has no colour set.
      const clr=sec.color||"#64748b";
      rows+=`<tr style="background:${clr}"><td colspan="2" style="font-weight:800;font-size:11px;text-transform:uppercase;letter-spacing:.8px;padding:8px 10px;color:#fff;border-left:4px solid ${clr}">${esc(sec.id)}. ${esc(sec.label)}</td><td colspan="5" style="padding:8px 10px"></td></tr>`;
      // One line item, prefixed with its (possibly nested) number.
      // Descriptions & remarks are free-text fields users type multi-line specs
      // into (title + "Specifications:" + a bulleted list). white-space:pre-line
      // keeps those line breaks in the PDF so the text can be read line-by-line
      // instead of collapsing into one run-on paragraph; overflow-wrap breaks any
      // over-long token so nothing spills past the cell. vertical-align:top keeps
      // the number/qty/prices aligned to the first line of a tall description.
      const itemRowHtml=(it,num)=>`<tr style="background:#fff"><td style="font-size:11px;color:#64748b;padding:6px 10px;white-space:nowrap;vertical-align:top;border-left:4px solid ${clr}">${esc(num)}</td><td style="padding:6px 10px;font-size:12px;white-space:pre-line;overflow-wrap:break-word;line-height:1.5;vertical-align:top">${esc(it.description)||"—"}</td><td style="text-align:center;padding:6px 10px;font-size:12px;vertical-align:top">${it.qty||1}</td><td style="padding:6px 10px;font-size:12px;vertical-align:top">${esc(it.unit||"lot")}</td><td style="text-align:right;padding:6px 10px;font-size:12px;vertical-align:top">${fmtP(it.unitCost)}</td><td style="text-align:right;font-weight:700;padding:6px 10px;font-size:12px;vertical-align:top">${fmtP(it.total)}</td><td style="padding:6px 10px;font-size:11px;color:#64748b;white-space:pre-line;overflow-wrap:break-word;line-height:1.5;vertical-align:top">${esc(it.remarks||"")}</td></tr>`;
      const {ungrouped,subs}=groupSection(si);
      ungrouped.forEach((it,idx)=>{rows+=itemRowHtml(it,`${sec.id}.${idx+1}`);});
      subs.forEach(sub=>{
        const subTotal=sub.items.reduce((s,it)=>s+it.total,0);
        // Sub-section heading row: lighter tint + numbered label, indented accent.
        rows+=`<tr style="background:${clr}18"><td colspan="7" style="font-weight:700;font-size:11px;padding:6px 10px 6px 22px;color:${clr};border-left:4px solid ${clr}">${esc(sec.id)}.${sub.num} &nbsp;${esc(sub.label)}</td></tr>`;
        sub.items.forEach((it,mi)=>{rows+=itemRowHtml(it,`${sec.id}.${sub.num}.${mi+1}`);});
        rows+=`<tr style="background:${clr}11"><td colspan="5" style="text-align:right;font-size:10px;font-style:italic;padding:5px 10px;color:#64748b;border-left:4px solid ${clr}">Sub-total ${esc(sub.label)}</td><td style="text-align:right;font-weight:700;padding:5px 10px;font-size:11px;color:#334155">${fmtP(subTotal)}</td><td></td></tr>`;
      });
      rows+=`<tr style="background:${clr}22"><td colspan="5" style="text-align:right;font-size:11px;font-weight:700;padding:6px 10px;color:#475569;border-left:4px solid ${clr}">Sub-total ${esc(sec.label)}</td><td style="text-align:right;font-weight:800;padding:6px 10px;font-size:12px;color:#0f172a">${fmtP(secTotal)}</td><td></td></tr>`;
    });
    const vatAmt=netTotal*0.12;
    const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>BOQ — ${esc((boqTitle&&boqTitle.trim())||dealLabel(deal)||"Draft")}</title>
<style>
  /* colour-adjust:exact forces section/header/total background colours to
     render when saving as PDF — browsers drop them on print otherwise. */
  *{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  body{font-family:Arial,sans-serif;padding:32px;color:#0f172a;font-size:12px}
  .hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;border-bottom:3px solid #1e293b;padding-bottom:14px}
  .co{font-size:22px;font-weight:800;letter-spacing:-.5px;color:#1e293b}
  .co-sub{font-size:10px;color:#64748b;margin-top:2px}
  .doc-label{font-size:9px;text-transform:uppercase;letter-spacing:2px;color:#94a3b8;margin-bottom:4px}
  .doc-title{font-size:18px;font-weight:800;color:#1e293b;text-align:right}
  .meta-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 18px;margin-bottom:20px;display:grid;grid-template-columns:1fr 1fr;gap:10px 32px}
  .meta-item label{display:block;font-size:9px;text-transform:uppercase;letter-spacing:.8px;color:#94a3b8;margin-bottom:2px}
  .meta-item span{font-weight:700;font-size:13px}
  table{width:100%;border-collapse:collapse;margin-bottom:0}
  th{background:#1e293b;color:#fff;padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.5px}
  th.r{text-align:right}
  td{border-bottom:1px solid #f1f5f9;vertical-align:middle}
  .tot-row td{background:#1e293b;color:#f1f5f9;font-weight:800;font-size:13px;padding:9px 10px}
  .vat-row td{background:#f8fafc;color:#475569;font-size:12px;padding:7px 10px}
  .gtvat-row td{background:#0f172a;color:#fff;font-weight:800;font-size:13px;padding:9px 10px}
  .disc-row td{background:#fffbeb;color:#92400e;font-size:12px;padding:7px 10px}
  .notes-section{margin-top:22px;padding:16px 18px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc}
  .notes-section h3{font-size:11px;text-transform:uppercase;letter-spacing:.8px;color:#1e293b;margin-bottom:8px}
  .notes-section ul{padding-left:18px;font-size:11px;line-height:1.7;color:#475569}
  .two-col{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:18px}
  .two-col h3{font-size:11px;text-transform:uppercase;letter-spacing:.8px;color:#1e293b;margin-bottom:8px}
  .two-col p{font-size:11px;line-height:1.7;color:#475569}
  .sig-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px;margin-top:36px}
  .sig-box .label{font-size:9px;text-transform:uppercase;letter-spacing:.8px;color:#94a3b8;font-weight:600;margin-bottom:28px}
  .sig-box .line{border-top:1.5px solid #1e293b;padding-top:6px;margin-top:4px}
  .sig-box .name{font-weight:800;font-size:12px;color:#0f172a}
  .sig-box .role{font-size:10px;color:#64748b}
  .print-btn{text-align:center;margin:20px 0 0}
  .print-btn button{background:#1e293b;color:#fff;border:none;border-radius:8px;padding:11px 28px;font-size:13px;font-weight:700;cursor:pointer}
  @media print{.print-btn{display:none}body{padding:18px}}
</style></head><body>
<div class="hdr">
  <div><div class="co">GMD Productions Inc.</div><div class="co-sub">Fabrication &amp; Project Management</div></div>
  <div><div class="doc-label">Bill of Quantities</div><div class="doc-title">QUOTATION</div><div style="font-size:11px;color:#64748b;text-align:right;margin-top:3px">${quotationNo?`No. ${esc(quotationNo)}`:""} &nbsp; ${dateStr}</div></div>
</div>
<div class="meta-box">
  <div class="meta-item"><label>Project</label><span>${esc(projectName)}</span></div>
  <div class="meta-item"><label>Location</label><span>${esc(locationName)}</span></div>
  <div class="meta-item"><label>Contractor</label><span>GMD Productions Inc.</span></div>
  <div class="meta-item"><label>Date</label><span>${dateStr}</span></div>
</div>
<table>
  <thead><tr><th style="width:68px">Item No.</th><th>Description</th><th style="text-align:center;width:48px">Qty</th><th style="width:56px">Unit</th><th class="r" style="width:110px">Unit Cost</th><th class="r" style="width:120px">Total Amount</th><th style="width:110px">Remarks</th></tr></thead>
  <tbody>${rows}</tbody>
  <tr class="tot-row"><td colspan="5" style="text-align:right">Grand Total</td><td style="text-align:right">${fmtP(grandTotal)}</td><td></td></tr>
  ${discountVal>0?`<tr class="disc-row"><td colspan="5" style="text-align:right">Discount</td><td style="text-align:right">(${fmtP(discountVal)})</td><td></td></tr><tr class="tot-row"><td colspan="5" style="text-align:right">Net Total</td><td style="text-align:right">${fmtP(netTotal)}</td><td></td></tr>`:""}
  ${vatEnabled?`<tr class="vat-row"><td colspan="5" style="text-align:right">VAT 12%</td><td style="text-align:right">${fmtP(vatAmt)}</td><td></td></tr><tr class="gtvat-row"><td colspan="5" style="text-align:right">Grand Total w/ VAT</td><td style="text-align:right">${fmtP(netTotal+vatAmt)}</td><td></td></tr>`:""}
</table>
<div class="notes-section">
  <h3>General Notes</h3>
  <ul>
    <li>Inclusive of Labor Fees (Inclusive of Night Differential)</li>
    <li>Inclusive of Contingency Fee &amp; Indirect Cost Fee</li>
    <li>Inclusive of Value Added Taxes</li>
    <li>Price Validity: 30 Days after Receiving</li>
    <li>If the quotation is approved, Quotation Number must be indicated at Purchase Orders (PO)</li>
    <li>Any alteration of the design and additional items not included in the contract will be billed accordingly.</li>
    <li>GMD reserves the right to hold, pull-out, or suspend delivery if payments and other conditions are not met.</li>
    <li>GMD Productions has a NO DP &amp; NO Signed Contract = NO Production Policy.</li>
    <li>Cost is based on specified requirements; additional requirements other than stated above shall be billed separately.</li>
  </ul>
  <div class="two-col">
    <div>
      <h3>Bank Details</h3>
      <p>Account Name: <strong>GMD PRODUCTIONS INC</strong><br>BDO CHECKING — 012758000370<br>BPI CHECKING — 6011 04 82 03<br>METROBANK — 382-7-38202059-2</p>
    </div>
    <div>
      <h3>Payment Terms</h3>
      <p>50% Down Payment to start project<br>Billing of 40% up until installation<br>Retention of 10% upon certificate of completion</p>
    </div>
  </div>
  <div class="sig-row">
    <div class="sig-box"><div class="label">Prepared by</div><div class="line"><div class="name">Rodney Erpe</div><div class="role">Quantity Surveyor</div></div></div>
    <div class="sig-box"><div class="label">Approved &amp; Submitted by</div><div class="line"><div class="name">Paulo Miguel Garcia</div><div class="role">President</div></div></div>
    <div class="sig-box"><div class="label">Accepted by</div><div class="line"><div class="name">${esc(deal?.client||"Client Name / Representative")}</div><div class="role">Signature over Printed Name</div></div></div>
  </div>
</div>
<div class="print-btn"><button onclick="window.print()">🖨️ Print / Save as PDF</button></div>
</body></html>`;
    const w=window.open("","_blank","width=1000,height=780");
    if(w){w.document.write(html);w.document.close();}
  };

  const exportCSV=()=>{
    const rows=[["Item No.","Description","Qty","Unit","Unit Cost (₱)","Total Amount (₱)","Remarks"]];
    sections.forEach(sec=>{
      const si=items.filter(it=>it.section===sec.id);
      if(!si.length) return;
      rows.push([sec.id,sec.label,"","","","",""]);
      const {ungrouped,subs}=groupSection(si);
      ungrouped.forEach((it,idx)=>rows.push([`${sec.id}.${idx+1}`,it.description,it.qty,it.unit,it.unitCost,it.total,it.remarks||""]));
      subs.forEach(sub=>{
        rows.push([`${sec.id}.${sub.num}`,sub.label,"","","","",""]);
        sub.items.forEach((it,mi)=>rows.push([`${sec.id}.${sub.num}.${mi+1}`,it.description,it.qty,it.unit,it.unitCost,it.total,it.remarks||""]));
        rows.push(["",`Sub-total ${sub.label}`,"","","","",sub.items.reduce((s,it)=>s+it.total,0)]);
      });
      rows.push(["",`Sub-total ${sec.label}`,"","","","",si.reduce((s,it)=>s+it.total,0)]);
    });
    rows.push(["","GRAND TOTAL","","","","",grandTotal]);
    if(discountVal>0){rows.push(["","DISCOUNT","","","","",-discountVal]);rows.push(["","NET TOTAL","","","","",netTotal]);}
    if(vatEnabled){rows.push(["","VAT 12%","","","","",vatAmount]);rows.push(["","GRAND TOTAL w/ VAT","","","","",netTotal+vatAmount]);}
    const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
    const a=document.createElement("a");
    a.href="data:text/csv;charset=utf-8,﻿"+encodeURIComponent(csv);
    a.download=`BOQ_${(boqTitle||"draft").replace(/[^a-zA-Z0-9]/g,"_")}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  };

  const mob=window.innerWidth<768;
  const inpSt={border:"1.5px solid #e2e8f0",borderRadius:6,padding:"5px 8px",fontFamily:"inherit",fontSize:".8rem",width:"100%",outline:"none",background:"#fff",boxSizing:"border-box"};
  const GRID="66px 1fr 52px 56px 104px 62px 116px 96px 28px";

  return(
    <div>
      {/* GMD-style BOQ Header Card */}
      <div style={{background:"#fff",borderRadius:14,border:"1.5px solid #e2e8f0",padding:20,marginBottom:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14,gap:12}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:".6rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"2px",color:"#94a3b8",marginBottom:3}}>BILL OF QUANTITIES</div>
            <input value={boqTitle} onChange={e=>setBoqTitle(e.target.value)} placeholder="Project Name"
              style={{fontWeight:800,fontSize:mob?"1rem":"1.15rem",color:"#0f172a",border:"none",outline:"none",fontFamily:"inherit",background:"transparent",width:"100%",padding:0}}/>
          </div>
          <img src="/gmd-logo.png" alt="GMD" style={{height:34,objectFit:"contain",flexShrink:0}}/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr",gap:"6px 24px",fontSize:".8rem",color:"#0f172a"}}>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            <span style={{fontWeight:600,color:"#64748b",flexShrink:0,minWidth:70}}>Project:</span>
            {coId
              ?<span style={{display:"inline-flex",alignItems:"center",gap:6,minWidth:0}}>
                <span style={{fontSize:".62rem",fontWeight:800,letterSpacing:".4px",color:coRecord?.kind==="Deductive"?"#dc2626":"#c2410c",background:(coRecord?.kind==="Deductive"?"#dc2626":"#f97316")+"1a",borderRadius:5,padding:"2px 7px",flexShrink:0}}>⚠️ CHANGE ORDER{coRecord?.kind==="Deductive"?" · DEDUCT":""}</span>
                <span style={{fontSize:".8rem",color:"#0f172a",fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{coParentDeal?.client||"—"}{coParentDeal?.ceNo?` (${coParentDeal.ceNo})`:""}</span>
              </span>
              :standaloneId
              ?<select value="" onChange={async e=>{const v=e.target.value;if(!v||!onLinkToDeal)return;const d2=deals.find(d=>d.id===v);if((await uiConfirm(`Link this BOQ to ${d2?.client||"this project"}${d2?.ceNo?" ("+d2.ceNo+")":""}?\n\nYour sections and items are kept — the BOQ just moves out of Standalone and attaches to the project.`))){onLinkToDeal(v,{items,sections,boqTitle,location,quotationNo,boqDate,vatEnabled,discount});}}} style={{fontFamily:"inherit",fontSize:".78rem",color:"#7c3aed",fontWeight:700,background:"#f5f3ff",border:"1px solid #ddd6fe",borderRadius:20,padding:"2px 10px",outline:"none",flex:1,minWidth:0,cursor:"pointer"}}>
                <option value="">📄 Standalone BOQ — link to a project…</option>
                {deals.filter(d=>d.stage!=="Did Not Win"&&d.stage!=="Cancelled").map(d=><option key={d.id} value={d.id}>{d.client}{d.contact?" · "+d.contact:""}{d.ceNo?" ("+d.ceNo+")":""}</option>)}
              </select>
              :<select value={selDeal} onChange={async e=>{const v=e.target.value;if(v==="__unlink__"){if(onUnlinkToStandalone&&(await uiConfirm("Unlink this BOQ from the project and move it to Standalone?\n\nUse this if a project was picked by mistake. Your sections and items are kept; the BOQ is detached from the project."))){onUnlinkToStandalone({items,sections,boqTitle,location,quotationNo,boqDate,vatEnabled,discount});}return;}setSelDeal(v);}} style={{border:"none",fontFamily:"inherit",fontSize:".8rem",color:"#0f172a",outline:"none",background:"transparent",flex:1,minWidth:0}}>
                <option value="">— Select —</option>
                {deals.filter(d=>d.id===selDeal||(d.stage!=="Did Not Win"&&d.stage!=="Cancelled")).map(d=><option key={d.id} value={d.id}>{d.client}{d.contact?" · "+d.contact:""}{d.ceNo?" ("+d.ceNo+")":""}</option>)}
              </select>
            }
          </div>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            <span style={{fontWeight:600,color:"#64748b",flexShrink:0,minWidth:70}}>Location:</span>
            <input value={location} onChange={e=>setLocation(e.target.value)} placeholder="e.g. SM Mall of Asia" style={{border:"none",borderBottom:"1px dashed #cbd5e1",fontFamily:"inherit",fontSize:".8rem",color:"#0f172a",outline:"none",background:"transparent",flex:1,minWidth:0}}/>
          </div>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            <span style={{fontWeight:600,color:"#64748b",flexShrink:0,minWidth:70}}>Contractor:</span>
            <span>GMD Productions Inc.</span>
          </div>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            <span style={{fontWeight:600,color:"#64748b",flexShrink:0,minWidth:70}}>Date:</span>
            <input type="date" value={boqDate} onChange={e=>setBoqDate(e.target.value)} style={{border:"none",fontFamily:"inherit",fontSize:".8rem",color:"#0f172a",outline:"none",background:"transparent"}}/>
          </div>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            <span style={{fontWeight:600,color:"#64748b",flexShrink:0,minWidth:70}}>Quotation No.:</span>
            <input value={quotationNo} onChange={e=>setQuotationNo(e.target.value)} placeholder="e.g. 0012" style={{border:"none",borderBottom:"1px dashed #cbd5e1",fontFamily:"inherit",fontSize:".8rem",color:"#0f172a",outline:"none",background:"transparent",width:80}}/>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:8}}>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
          {onBack&&<button onClick={onBack} style={{background:"#f1f5f9",border:"1.5px solid #e2e8f0",borderRadius:7,padding:"5px 12px",fontFamily:"inherit",fontSize:".74rem",fontWeight:700,color:"#475569",cursor:"pointer"}}>← Back</button>}
          {ro
            ?<span style={{fontSize:".72rem",fontWeight:700,color:"#7c3aed",background:"#f5f3ff",border:"1px solid #ddd6fe",borderRadius:20,padding:"3px 10px"}}>👁 View only — print or export to send to client</span>
            :<>
              <span style={{fontSize:".7rem",fontWeight:600,color:"#64748b"}}>Add row:</span>
              {sections.map(s=>(
                <button key={s.id} onClick={()=>addRow(s.id)} style={{background:s.color+"14",border:`1.5px solid ${s.color}44`,borderRadius:7,padding:"4px 10px",fontFamily:"inherit",fontSize:".72rem",fontWeight:700,color:s.color,cursor:"pointer"}}>+ {s.id}</button>
              ))}
              <button onClick={()=>setAddSecOpen(o=>!o)} style={{background:"#f1f5f9",border:"1.5px solid #e2e8f0",borderRadius:7,padding:"4px 10px",fontFamily:"inherit",fontSize:".72rem",fontWeight:700,color:"#475569",cursor:"pointer"}}>✚ Section</button>
            </>}
        </div>
        <div style={{display:"flex",gap:6}}>
          {!ro&&<button onClick={()=>{setImportMode(items.length>0?"append":"replace");setImportErr("");setImportPreview(null);setImportFileName("");setImportMarkup(markupPct||"50");setImportOpen(true);}} style={{background:"#eef2ff",border:"1.5px solid #c7d2fe",borderRadius:8,padding:"6px 12px",fontFamily:"inherit",fontSize:".74rem",fontWeight:700,color:"#4338ca",cursor:"pointer"}} title="Upload an Excel/CSV BOQ and build from it">⬆ Import Excel</button>}
          {!ro&&<button onClick={()=>setLibOpen(o=>!o)} style={{background:libOpen?"#ede9fe":"#f5f3ff",border:`1.5px solid ${libOpen?"#7c3aed":"#c4b5fd"}`,borderRadius:8,padding:"6px 12px",fontFamily:"inherit",fontSize:".74rem",fontWeight:700,color:"#5b21b6",cursor:"pointer"}}>
            📚 Library{boqLibrary.length>0&&<span style={{background:"#7c3aed",color:"#fff",borderRadius:20,padding:"0 6px",fontSize:".62rem",fontWeight:800,marginLeft:4}}>{boqLibrary.length}</span>}
          </button>}
          {items.length>0&&<button onClick={printBOQ} style={{background:"#f0fdf4",border:"1.5px solid #86efac",borderRadius:8,padding:"6px 12px",fontFamily:"inherit",fontSize:".74rem",fontWeight:700,color:"#166534",cursor:"pointer"}}>🖨 Preview / Print</button>}
          {items.length>0&&<button onClick={exportCSV} style={{background:"#eff6ff",border:"1.5px solid #bfdbfe",borderRadius:8,padding:"6px 12px",fontFamily:"inherit",fontSize:".74rem",fontWeight:700,color:"#1d4ed8",cursor:"pointer"}}>⬇ Export CSV</button>}
          {!ro&&(selDeal||items.length>0||sections.length>0)&&<button onClick={()=>{deleteDraft(selDeal||BOQ_SCRATCH_KEY);if(selDeal&&isSupabaseReady())sbUpdate('deals',selDeal,{boq_data:null}).catch(()=>{});setItems(BLANK_ITEMS());setSections([]);setBoqTitle("");setLocation(deal?.location||"");setQuotationNo(deal?.ceNo||"");setBoqDate(today);setVatEnabled(true);setDiscount("");setMarkupPct("");setDraftSaved(false);}} style={{background:"#fff7ed",border:"1.5px solid #fed7aa",borderRadius:8,padding:"6px 12px",fontFamily:"inherit",fontSize:".74rem",fontWeight:700,color:"#c2410c",cursor:"pointer"}} title="Clear saved draft and reset">✕ Clear Draft</button>}
          {!ro&&draftSaved&&(items.length>0||sections.length>0)&&<span style={{fontSize:".72rem",color:"#16a34a",fontWeight:600,display:"flex",alignItems:"center",gap:4}}>✓ {selDeal?"Draft saved":"Saved (no project yet)"}</span>}
        </div>
      </div>

      {/* Markup bar — add Contractor's Profit on top of the direct BOQ costs */}
      {items.length>0&&(()=>{
        const m=Number(markupPct)||0;
        const directTotal=items.reduce((s,it)=>s+((it.baseCost!=null?it.baseCost:it.unitCost)||0)*(it.qty||0),0);
        const applied=items.some(it=>Number(it.markup)>0);
        const inSync=items.every(it=>Number(it.markup||0)===m);
        return(
          <div style={{background:"#fffbeb",border:"1.5px solid #fde68a",borderRadius:12,padding:"10px 14px",marginBottom:12,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
            <div style={{display:"flex",alignItems:"center",gap:7}}>
              <span style={{fontSize:"1rem"}}>📈</span>
              <div>
                <div style={{fontWeight:800,color:"#92400e",fontSize:".82rem"}}>Standard markup / Contractor's Profit</div>
                <div style={{fontSize:".66rem",color:"#a16207"}}>Sets one markup on every line, then fine-tune per section or per item below. VAT is computed on the marked-up total.</div>
              </div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:6,marginLeft:"auto",flexWrap:"wrap"}}>
              <div style={{position:"relative",display:"flex",alignItems:"center"}}>
                <input type="number" value={markupPct} onChange={e=>setMarkupPct(e.target.value)} placeholder="0" min="0" step="0.5"
                  onKeyDown={e=>e.key==="Enter"&&applyMarkupToAll()}
                  style={{width:78,border:"1.5px solid #fbbf24",borderRadius:7,padding:"6px 22px 6px 10px",fontFamily:"inherit",fontSize:".85rem",fontWeight:700,color:"#92400e",outline:"none",textAlign:"right",background:"#fff"}}/>
                <span style={{position:"absolute",right:9,color:"#a16207",fontWeight:700,fontSize:".8rem",pointerEvents:"none"}}>%</span>
              </div>
              <button onClick={applyMarkupToAll} style={{background:"#d97706",border:"none",borderRadius:7,padding:"7px 14px",fontFamily:"inherit",fontSize:".78rem",fontWeight:800,color:"#fff",cursor:"pointer"}}>Apply to all</button>
              {applied&&<span style={{fontSize:".7rem",color:"#166534",fontWeight:700,whiteSpace:"nowrap"}} title={`Direct: ₱${directTotal.toLocaleString("en-PH",{minimumFractionDigits:2})}`}>Direct ₱{directTotal.toLocaleString("en-PH",{maximumFractionDigits:0})} → w/ markup ₱{grandTotal.toLocaleString("en-PH",{maximumFractionDigits:0})}</span>}
              {applied&&!inSync&&<span style={{fontSize:".66rem",color:"#b45309",fontStyle:"italic"}}>mixed — click Apply to unify</span>}
            </div>
          </div>
        );
      })()}

      {/* Deal value ↔ BOQ reconciliation prompt */}
      {reconcile&&(()=>{
        const done=(v)=>{if(selDeal)reconciledRef.current[selDeal]=true;if(v!=null&&onBoqValue&&selDeal)onBoqValue(selDeal,Math.round((Number(v)||0)*100)/100);setReconcile(null);};
        const peso=v=>"₱"+Number(v||0).toLocaleString("en-PH",{minimumFractionDigits:2});
        const custom=Number(reconcileCustom);
        return(
          <div style={{position:"fixed",inset:0,background:"#0f172acc",zIndex:2100,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"48px 16px",overflowY:"auto"}}>
            <div style={{background:"#fff",borderRadius:16,border:"1.5px solid #e2e8f0",padding:22,maxWidth:520,width:"100%",boxShadow:"0 24px 60px #0006"}}>
              <div style={{fontWeight:800,color:"#0f172a",fontSize:"1rem",marginBottom:4}}>💰 Confirm the awarded amount</div>
              {reconcile.hasBoq?(
                <>
                  <div style={{fontSize:".8rem",color:"#64748b",marginBottom:14,lineHeight:1.5}}>
                    This deal's contract value doesn't match its BOQ. Which amount was actually awarded? <b>The BOQ is your source of truth</b>, so it's recommended — but confirm what the client approved.
                  </div>
                  <div style={{display:"flex",gap:10,marginBottom:14}}>
                    <div style={{flex:1,background:"#f0fdf4",border:"1.5px solid #86efac",borderRadius:10,padding:"10px 12px"}}>
                      <div style={{fontSize:".62rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".05em",color:"#15803d"}}>BOQ total (net of VAT)</div>
                      <div style={{fontWeight:800,fontSize:"1.05rem",color:"#166534",marginTop:2}}>{peso(reconcile.net)}</div>
                    </div>
                    <div style={{flex:1,background:"#f8fafc",border:"1.5px solid #e2e8f0",borderRadius:10,padding:"10px 12px"}}>
                      <div style={{fontSize:".62rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".05em",color:"#94a3b8"}}>Current deal value</div>
                      <div style={{fontWeight:800,fontSize:"1.05rem",color:"#475569",marginTop:2}}>{peso(reconcile.dealValue)}</div>
                    </div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    <button onClick={()=>done(reconcile.net)} style={{background:"#16a34a",border:"none",borderRadius:9,padding:"11px 14px",fontFamily:"inherit",fontSize:".82rem",fontWeight:800,color:"#fff",cursor:"pointer",textAlign:"left"}}>Use BOQ total — {peso(reconcile.net)} <span style={{fontWeight:600,opacity:.85}}>(recommended)</span></button>
                    <button onClick={()=>done(null)} style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:9,padding:"11px 14px",fontFamily:"inherit",fontSize:".82rem",fontWeight:700,color:"#475569",cursor:"pointer",textAlign:"left"}}>Keep current deal value — {peso(reconcile.dealValue)}</button>
                    <div style={{display:"flex",gap:8,alignItems:"center",marginTop:2}}>
                      <input type="number" value={reconcileCustom} onChange={e=>setReconcileCustom(e.target.value)} placeholder="Or enter awarded amount…" style={{flex:1,border:"1.5px solid #e2e8f0",borderRadius:9,padding:"10px 12px",fontFamily:"inherit",fontSize:".82rem",outline:"none"}}/>
                      <button disabled={!(custom>0)} onClick={()=>done(custom)} style={{background:custom>0?"#1e293b":"#e2e8f0",border:"none",borderRadius:9,padding:"10px 16px",fontFamily:"inherit",fontSize:".82rem",fontWeight:800,color:"#fff",cursor:custom>0?"pointer":"default"}}>Set</button>
                    </div>
                  </div>
                </>
              ):(
                <>
                  <div style={{fontSize:".8rem",color:"#64748b",marginBottom:14,lineHeight:1.5}}>
                    This deal has a contract value of <b>{peso(reconcile.dealValue)}</b> but no BOQ yet. Confirm the closed amount, then build the BOQ below to itemize it (recommended so the quote and costs are tracked).
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    <button onClick={()=>done(null)} style={{background:"#16a34a",border:"none",borderRadius:9,padding:"11px 14px",fontFamily:"inherit",fontSize:".82rem",fontWeight:800,color:"#fff",cursor:"pointer",textAlign:"left"}}>Keep {peso(reconcile.dealValue)} as awarded</button>
                    <div style={{display:"flex",gap:8,alignItems:"center"}}>
                      <input type="number" value={reconcileCustom} onChange={e=>setReconcileCustom(e.target.value)} placeholder="Or enter the closed amount…" style={{flex:1,border:"1.5px solid #e2e8f0",borderRadius:9,padding:"10px 12px",fontFamily:"inherit",fontSize:".82rem",outline:"none"}}/>
                      <button disabled={!(custom>0)} onClick={()=>done(custom)} style={{background:custom>0?"#1e293b":"#e2e8f0",border:"none",borderRadius:9,padding:"10px 16px",fontFamily:"inherit",fontSize:".82rem",fontWeight:800,color:"#fff",cursor:custom>0?"pointer":"default"}}>Set</button>
                    </div>
                    <div style={{fontSize:".72rem",color:"#a16207",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:8,padding:"8px 10px",marginTop:2}}>💡 Tip: import your Excel BOQ or add sections below — once it has items, the deal value will follow the BOQ.</div>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* Import Excel / CSV modal */}
      {importOpen&&(
        <div onClick={()=>setImportOpen(false)} style={{position:"fixed",inset:0,background:"#0f172acc",zIndex:2000,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"36px 16px",overflowY:"auto"}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,border:"1.5px solid #e2e8f0",padding:22,maxWidth:660,width:"100%",boxShadow:"0 24px 60px #0006"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <div style={{fontWeight:800,color:"#0f172a",fontSize:"1rem"}}>⬆ Import BOQ from Excel / CSV</div>
              <button onClick={()=>setImportOpen(false)} style={{background:"none",border:"none",fontSize:"1.1rem",color:"#94a3b8",cursor:"pointer"}}>✕</button>
            </div>
            <div style={{fontSize:".76rem",color:"#64748b",marginBottom:14,lineHeight:1.55}}>
              Upload an Excel (.xlsx/.xls) or CSV file. FabHub auto-detects the <b>Description</b>, <b>Qty</b>, <b>Unit</b>, <b>Unit&nbsp;Cost</b> and <b>Remarks</b> columns and rebuilds your sections and line items — including nested groups like “Supervision → Safety Officer”. An at-cost BOQ defaults to a <b>50% standard markup</b> so the direct costs become client-ready prices — adjust it here, then fine-tune per section or item after. You'll preview everything before it's added.
            </div>
            <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:14,flexWrap:"wrap"}}>
              <button onClick={()=>importFileRef.current&&importFileRef.current.click()} style={{background:"#4f46e5",border:"none",borderRadius:8,padding:"9px 18px",fontFamily:"inherit",fontSize:".82rem",fontWeight:700,color:"#fff",cursor:"pointer"}}>📂 Choose file</button>
              <input ref={importFileRef} type="file" accept=".xlsx,.xls,.csv" style={{display:"none"}} onChange={e=>{handleImportFile(e.target.files[0]);e.target.value="";}}/>
              {importFileName&&<span style={{fontSize:".76rem",color:"#475569",fontWeight:600}}>{importFileName}</span>}
            </div>
            {importErr&&<div style={{background:"#fef2f2",border:"1.5px solid #fca5a5",borderRadius:10,padding:"10px 14px",color:"#b91c1c",fontSize:".78rem",marginBottom:12}}>{importErr}</div>}
            {importPreview&&(()=>{
              const mk=Number(importMarkup)||0;
              const eff=b=>applyMk(b,mk);
              const grand=importPreview.items.reduce((s,it)=>s+eff(it.baseCost)*(it.qty||0),0);
              return(
                <>
                  <div style={{background:"#f0fdf4",border:"1.5px solid #86efac",borderRadius:10,padding:"10px 14px",marginBottom:12}}>
                    <div style={{fontWeight:700,color:"#15803d",fontSize:".82rem",marginBottom:4}}>✓ {importPreview.items.length} line items · {importPreview.sections.length} section{importPreview.sections.length!==1?"s":""} detected{importPreview.sheetName?` — sheet “${importPreview.sheetName}”`:""}</div>
                    <div style={{fontSize:".68rem",color:"#3f6212"}}>Columns matched: {importPreview.columnsLabel}</div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,flexWrap:"wrap",background:"#fffbeb",border:"1.5px solid #fde68a",borderRadius:10,padding:"9px 12px"}}>
                    <span style={{fontSize:".76rem",fontWeight:700,color:"#92400e"}}>Standard markup on import <span style={{fontWeight:500,color:"#a16207"}}>(at-cost → 50%)</span></span>
                    <div style={{position:"relative",display:"flex",alignItems:"center"}}>
                      <input type="number" value={importMarkup} onChange={e=>setImportMarkup(e.target.value)} placeholder="0" min="0" step="0.5" style={{width:74,border:"1.5px solid #fbbf24",borderRadius:7,padding:"5px 20px 5px 9px",fontFamily:"inherit",fontSize:".82rem",fontWeight:700,color:"#92400e",outline:"none",textAlign:"right",background:"#fff"}}/>
                      <span style={{position:"absolute",right:8,color:"#a16207",fontWeight:700,fontSize:".76rem",pointerEvents:"none"}}>%</span>
                    </div>
                    <span style={{fontSize:".72rem",color:"#a16207",marginLeft:"auto",fontWeight:700}}>Total {mk>0?"w/ markup ":""}₱{grand.toLocaleString("en-PH",{minimumFractionDigits:2})}</span>
                  </div>
                  <div style={{maxHeight:250,overflowY:"auto",border:"1.5px solid #e2e8f0",borderRadius:10,marginBottom:12}}>
                    {importPreview.sections.map(sec=>{
                      const si=importPreview.items.filter(it=>it.section===sec.id);
                      if(!si.length) return null;
                      const st=si.reduce((t,it)=>t+eff(it.baseCost)*(it.qty||0),0);
                      return(
                        <div key={sec.id}>
                          <div style={{background:"#f1f5f9",padding:"5px 12px",fontWeight:800,fontSize:".72rem",color:"#1e293b",textTransform:"uppercase",letterSpacing:".5px",display:"flex",justifyContent:"space-between"}}><span>{sec.id}. {sec.label}</span><span style={{color:"#64748b"}}>₱{st.toLocaleString("en-PH",{minimumFractionDigits:2})}</span></div>
                          {si.map((it,i)=>(
                            <div key={i} style={{display:"grid",gridTemplateColumns:"1fr 42px 50px 96px",gap:6,padding:"4px 12px",borderBottom:"1px solid #f1f5f9",fontSize:".72rem",color:"#374151",alignItems:"center"}}>
                              <span style={{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}} title={it.description}>{it.description}</span>
                              <span style={{textAlign:"right"}}>{it.qty}</span>
                              <span style={{textAlign:"center",color:"#94a3b8"}}>{it.unit}</span>
                              <span style={{textAlign:"right"}}>₱{eff(it.baseCost).toLocaleString("en-PH",{minimumFractionDigits:2})}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                  <div style={{display:"flex",gap:16,marginBottom:14,fontSize:".78rem",color:"#475569",flexWrap:"wrap"}}>
                    <label style={{display:"flex",gap:6,alignItems:"center",cursor:"pointer"}}><input type="radio" name="impmode" checked={importMode==="append"} onChange={()=>setImportMode("append")}/>Add to current BOQ</label>
                    <label style={{display:"flex",gap:6,alignItems:"center",cursor:"pointer"}}><input type="radio" name="impmode" checked={importMode==="replace"} onChange={()=>setImportMode("replace")}/>Replace everything</label>
                  </div>
                  <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                    <button onClick={()=>setImportOpen(false)} style={{background:"none",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"8px 16px",fontFamily:"inherit",fontSize:".8rem",fontWeight:600,color:"#64748b",cursor:"pointer"}}>Cancel</button>
                    <button onClick={applyImport} style={{background:"#16a34a",border:"none",borderRadius:8,padding:"8px 18px",fontFamily:"inherit",fontSize:".8rem",fontWeight:800,color:"#fff",cursor:"pointer"}}>{importMode==="replace"?"Replace BOQ":"Add to BOQ"}</button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Library Panel */}
      {libOpen&&(
        <div style={{background:"#faf5ff",border:"1.5px solid #c4b5fd",borderRadius:14,padding:18,marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
            <div style={{fontWeight:800,color:"#4c1d95",fontSize:".88rem"}}>📚 Line-Item Library</div>
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>setLibTab("search")} style={{padding:"4px 12px",borderRadius:20,border:"1.5px solid "+(libTab==="search"?"#7c3aed":"#e2e8f0"),background:libTab==="search"?"#7c3aed":"#fff",color:libTab==="search"?"#fff":"#64748b",fontFamily:"inherit",fontSize:".72rem",fontWeight:700,cursor:"pointer"}}>🔍 Search</button>
              {canManageLib&&<button onClick={()=>setLibTab("manage")} style={{padding:"4px 12px",borderRadius:20,border:"1.5px solid "+(libTab==="manage"?"#7c3aed":"#e2e8f0"),background:libTab==="manage"?"#7c3aed":"#fff",color:libTab==="manage"?"#fff":"#64748b",fontFamily:"inherit",fontSize:".72rem",fontWeight:700,cursor:"pointer"}}>⚙ Manage</button>}
            </div>
          </div>
          {libTab==="search"&&(
            <>
              <input value={libSearch} onChange={e=>setLibSearch(e.target.value)} placeholder="Search by name, section, or tag…" style={{width:"100%",border:"1.5px solid #c4b5fd",borderRadius:8,padding:"7px 12px",fontFamily:"inherit",fontSize:".8rem",outline:"none",background:"#fff",marginBottom:10,boxSizing:"border-box"}}/>
              {filteredLib.length===0?(<div style={{textAlign:"center",color:"#94a3b8",fontSize:".78rem",padding:"20px 0"}}>{boqLibrary.length===0?"No library items yet."+(canManageLib?" Switch to Manage to add your first item.":""):"No items match."}</div>):(
                <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr",gap:8,maxHeight:300,overflowY:"auto"}}>
                  {filteredLib.map(it=>{const sec=sections.find(s=>s.id===it.section)||BOQ_SECTIONS.find(s=>s.id===it.section)||sections[0]||BOQ_SECTIONS[0];return(
                    <div key={it.id} style={{background:"#fff",border:"1.5px solid #ede9fe",borderRadius:10,padding:"9px 12px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:700,color:"#0f172a",fontSize:".8rem",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{it.name}</div>
                        <div style={{display:"flex",gap:6,alignItems:"center",marginTop:2}}>
                          <span style={{fontSize:".65rem",fontWeight:700,color:sec.color}}>{sec.id}. {sec.label}</span>
                          <span style={{fontSize:".65rem",color:"#94a3b8"}}>/{it.unit}</span>
                          {it.unitCost>0&&<span style={{fontSize:".65rem",fontWeight:700,color:"#059669"}}>₱{it.unitCost.toLocaleString("en-PH")}</span>}
                        </div>
                      </div>
                      <button onClick={()=>addLibItemToBoq(it)} style={{background:"#7c3aed",border:"none",borderRadius:7,padding:"5px 10px",fontFamily:"inherit",fontSize:".7rem",fontWeight:800,color:"#fff",cursor:"pointer",flexShrink:0}}>+ Add</button>
                    </div>
                  );})}
                </div>
              )}
            </>
          )}
          {libTab==="manage"&&canManageLib&&(
            <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr",gap:14}}>
              <div style={{background:"#fff",border:"1.5px solid #ede9fe",borderRadius:10,padding:14}}>
                <div style={{fontWeight:700,color:"#4c1d95",fontSize:".8rem",marginBottom:10}}>{libEditId?"Edit Item":"New Library Item"}</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                  <div style={{gridColumn:"1/-1"}}><div style={{fontSize:".65rem",fontWeight:600,color:"#64748b",marginBottom:3}}>Item Name *</div><input value={libForm.name} onChange={e=>setLibForm(p=>({...p,name:e.target.value}))} placeholder="e.g. Mobilization Fee" style={{...inpSt}}/></div>
                  <div><div style={{fontSize:".65rem",fontWeight:600,color:"#64748b",marginBottom:3}}>Section</div><select value={libForm.section} onChange={e=>setLibForm(p=>({...p,section:e.target.value}))} style={{...inpSt}}>{[...new Map([...BOQ_SECTIONS,...sections].map(s=>[s.id,s])).values()].map(s=><option key={s.id} value={s.id}>{s.id}. {s.label}</option>)}</select></div>
                  <div><div style={{fontSize:".65rem",fontWeight:600,color:"#64748b",marginBottom:3}}>Unit</div><input value={libForm.unit} onChange={e=>setLibForm(p=>({...p,unit:e.target.value}))} placeholder="lot, sqm, pc…" style={{...inpSt}}/></div>
                  <div><div style={{fontSize:".65rem",fontWeight:600,color:"#64748b",marginBottom:3}}>Unit Cost (₱)</div><input type="number" value={libForm.unitCost} onChange={e=>setLibForm(p=>({...p,unitCost:e.target.value}))} placeholder="0" style={{...inpSt}}/></div>
                  <div><div style={{fontSize:".65rem",fontWeight:600,color:"#64748b",marginBottom:3}}>Tags (comma-sep)</div><input value={libForm.tags} onChange={e=>setLibForm(p=>({...p,tags:e.target.value}))} placeholder="e.g. ceiling, electrical" style={{...inpSt}}/></div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={saveLibItem} style={{background:"#7c3aed",border:"none",borderRadius:7,padding:"7px 16px",fontFamily:"inherit",fontSize:".78rem",fontWeight:800,color:"#fff",cursor:"pointer"}}>{libEditId?"Update":"Save"}</button>
                  {libEditId&&<button onClick={()=>{setLibEditId(null);setLibForm({name:"",description:"",section:"2",unit:"lot",unitCost:"",tags:""});}} style={{background:"none",border:"1.5px solid #e2e8f0",borderRadius:7,padding:"7px 12px",fontFamily:"inherit",fontSize:".78rem",fontWeight:600,color:"#64748b",cursor:"pointer"}}>Cancel</button>}
                </div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                <button onClick={loadGMDDefaults} style={{background:"#f0fdf4",border:"1.5px solid #86efac",borderRadius:8,padding:"8px 14px",fontFamily:"inherit",fontSize:".78rem",fontWeight:700,color:"#166534",cursor:"pointer",textAlign:"left"}}>
                  🏗 Load GMD Standard Items <span style={{fontWeight:400,color:"#15803d",fontSize:".72rem"}}>({GMD_DEFAULT_LIBRARY.length} items — skips duplicates)</span>
                </button>
              </div>
              <div style={{maxHeight:300,overflowY:"auto",display:"flex",flexDirection:"column",gap:6,marginTop:8}}>
                {boqLibrary.length===0&&<div style={{color:"#94a3b8",fontSize:".78rem",textAlign:"center",padding:"20px 0"}}>No items yet. Click "Load GMD Standard Items" to get started.</div>}
                {boqLibrary.map(it=>{const sec=sections.find(s=>s.id===it.section)||BOQ_SECTIONS.find(s=>s.id===it.section)||sections[0]||BOQ_SECTIONS[0];return(
                  <div key={it.id} style={{background:"#fff",border:`1.5px solid ${libEditId===it.id?"#7c3aed":"#ede9fe"}`,borderRadius:8,padding:"9px 12px",display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                    <div style={{flex:1,minWidth:0}}><div style={{fontWeight:700,color:"#0f172a",fontSize:".8rem"}}>{it.name}</div><div style={{fontSize:".65rem",color:sec.color,fontWeight:700}}>{sec.id}. {sec.label} · /{it.unit}{it.unitCost>0&&` · ₱${it.unitCost.toLocaleString("en-PH")}`}</div></div>
                    <div style={{display:"flex",gap:5,flexShrink:0}}>
                      <button onClick={()=>startEditLib(it)} style={{background:"#eff6ff",border:"1.5px solid #bfdbfe",borderRadius:6,padding:"3px 9px",fontFamily:"inherit",fontSize:".7rem",fontWeight:700,color:"#1d4ed8",cursor:"pointer"}}>Edit</button>
                      <button onClick={()=>deleteLibItem(it.id)} style={{background:"#fef2f2",border:"1.5px solid #fca5a5",borderRadius:6,padding:"3px 9px",fontFamily:"inherit",fontSize:".7rem",fontWeight:700,color:"#dc2626",cursor:"pointer"}}>✕</button>
                    </div>
                  </div>
                );})}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add Section Form */}
      {addSecOpen&&(
        <div style={{background:"#f8fafc",border:"1.5px solid #e2e8f0",borderRadius:10,padding:"12px 14px",marginBottom:10,display:"flex",gap:8,alignItems:"flex-end",flexWrap:"wrap"}}>
          <div><div style={{fontSize:".65rem",fontWeight:600,color:"#64748b",marginBottom:3}}>ID</div><input value={newSecForm.id} onChange={e=>setNewSecForm(p=>({...p,id:e.target.value.slice(0,3)}))} placeholder={String(sections.length+1)} style={{width:52,border:"1.5px solid #e2e8f0",borderRadius:6,padding:"5px 8px",fontFamily:"inherit",fontSize:".8rem",outline:"none",textAlign:"center",fontWeight:700}}/></div>
          <div style={{flex:1,minWidth:140}}><div style={{fontSize:".65rem",fontWeight:600,color:"#64748b",marginBottom:3}}>Section Name</div><input value={newSecForm.label} onChange={e=>setNewSecForm(p=>({...p,label:e.target.value}))} placeholder="e.g. Special Works…" onKeyDown={e=>e.key==="Enter"&&addSection()} style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:6,padding:"5px 8px",fontFamily:"inherit",fontSize:".8rem",outline:"none",boxSizing:"border-box"}}/></div>
          <button onClick={addSection} style={{background:"#1e293b",border:"none",borderRadius:7,padding:"7px 14px",fontFamily:"inherit",fontSize:".78rem",fontWeight:700,color:"#fff",cursor:"pointer"}}>Add</button>
          <button onClick={()=>setAddSecOpen(false)} style={{background:"none",border:"1.5px solid #e2e8f0",borderRadius:7,padding:"7px 12px",fontFamily:"inherit",fontSize:".78rem",fontWeight:600,color:"#64748b",cursor:"pointer"}}>Cancel</button>
        </div>
      )}

      {/* BOQ Table */}
      {sections.length===0&&(
        <div style={{background:"#fff",borderRadius:14,border:"1.5px dashed #cbd5e1",padding:"40px 24px",marginBottom:12,textAlign:"center"}}>
          <div style={{fontSize:"1.6rem",marginBottom:8}}>📋</div>
          <div style={{fontWeight:700,color:"#0f172a",fontSize:".95rem",marginBottom:4}}>No sections yet</div>
          <div style={{fontSize:".8rem",color:"#64748b",marginBottom:16}}>Add a section to start building this BOQ, or upload an Excel/CSV BOQ to build from it. You decide which sections this quotation needs.{!selDeal&&" Tip: pick a Project above to link this BOQ — your work is saved either way."}</div>
          <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
            <button onClick={()=>setAddSecOpen(true)} style={{background:"#1e293b",border:"none",borderRadius:8,padding:"9px 18px",color:"#fff",fontFamily:"inherit",fontWeight:700,fontSize:".82rem",cursor:"pointer"}}>✚ Add Section</button>
            <button onClick={()=>{setImportMode("replace");setImportErr("");setImportPreview(null);setImportFileName("");setImportMarkup(markupPct||"50");setImportOpen(true);}} style={{background:"#eef2ff",border:"1.5px solid #c7d2fe",borderRadius:8,padding:"9px 18px",color:"#4338ca",fontFamily:"inherit",fontWeight:700,fontSize:".82rem",cursor:"pointer"}}>⬆ Import from Excel</button>
            <button onClick={loadStandardSections} style={{background:"#f1f5f9",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"9px 18px",color:"#475569",fontFamily:"inherit",fontWeight:700,fontSize:".82rem",cursor:"pointer"}}>Load GMD standard sections</button>
          </div>
        </div>
      )}
      {sections.length>0&&(
        <>
          <div style={{background:"#fff",borderRadius:14,border:"1.5px solid #e2e8f0",overflow:"auto",marginBottom:12}}>
            <div style={{minWidth:820}}>
              {/* Column headers */}
              <div style={{display:"grid",gridTemplateColumns:GRID,background:"#f8fafc",borderBottom:"2px solid #e2e8f0",padding:"8px 12px",alignItems:"center"}}>
                {["Item No.","Description","Qty","Unit","Unit Cost (₱)","Mk %","Amount (₱)","Remarks",""].map((h,i)=>(
                  <div key={i} style={{fontSize:".58rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".8px",color:"#94a3b8",textAlign:[4,6].includes(i)?"right":(i===5?"center":"left")}}>{h}</div>
                ))}
              </div>
              {/* Rows by section */}
              {sections.map(sec=>{
                const si=items.filter(it=>it.section===sec.id);
                const secTotal=si.reduce((t,it)=>t+it.total,0);
                return(
                  <React.Fragment key={sec.id}>
                    {/* Section header */}
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:sec.color+"18",borderTop:"1.5px solid "+sec.color+"44",padding:"6px 12px"}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontWeight:800,fontSize:".72rem",color:sec.color,letterSpacing:".5px"}}>{sec.id}.</span>
                        {editingSecId===sec.id
                          ?<input autoFocus defaultValue={sec.label}
                              onBlur={e=>{renameSection(sec.id,e.target.value||sec.label);setEditingSecId(null);}}
                              onKeyDown={e=>{if(e.key==="Enter"||e.key==="Escape"){renameSection(sec.id,e.target.value||sec.label);setEditingSecId(null);}}}
                              style={{fontSize:".78rem",fontWeight:800,border:"none",borderBottom:"2px solid "+sec.color,background:"transparent",color:sec.color,outline:"none",textTransform:"uppercase",letterSpacing:".5px",padding:"0 2px",minWidth:160}}/>
                          :<span onClick={()=>setEditingSecId(sec.id)} style={{fontSize:".78rem",fontWeight:800,textTransform:"uppercase",letterSpacing:".5px",color:sec.color,cursor:"pointer"}} title="Click to rename">{sec.label} ✎</span>
                        }
                        <button onClick={()=>deleteSection(sec.id)} title="Delete section (must be empty first)" style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:".7rem",padding:"0 2px",opacity:.4}} onMouseOver={e=>e.currentTarget.style.opacity=1} onMouseOut={e=>e.currentTarget.style.opacity=.4}>🗑</button>
                      </div>
                      {si.length>0&&(()=>{const sm=sectionMarkup(sec.id);return(
                        <div style={{display:"flex",alignItems:"center",gap:4}} title="Markup for every item in this section">
                          <span style={{fontSize:".62rem",fontWeight:700,color:sec.color,opacity:.75,textTransform:"uppercase",letterSpacing:".4px"}}>Mk</span>
                          <div style={{position:"relative",display:"flex",alignItems:"center"}}>
                            <input type="number" value={sm} placeholder={sm===""?"mixed":"0"} min="0" step="0.5"
                              onChange={e=>applyMarkupToSection(sec.id,e.target.value)}
                              style={{width:56,border:"1.5px solid "+sec.color+"55",borderRadius:6,padding:"3px 16px 3px 7px",fontFamily:"inherit",fontSize:".72rem",fontWeight:700,color:sec.color,textAlign:"right",outline:"none",background:"#fff"}}/>
                            <span style={{position:"absolute",right:6,fontSize:".68rem",fontWeight:700,color:sec.color,opacity:.7,pointerEvents:"none"}}>%</span>
                          </div>
                        </div>
                      );})()}
                    </div>
                    {/* Item rows — grouped by sub-section. `itemRow` renders one line;
                        ungrouped items render flat, then each named sub-section. */}
                    {(()=>{
                    const subLabels=subsectionsOf(sec.id);
                    const {ungrouped,subs}=groupSection(si);
                    const itemRow=(it,label,idx)=>(
                      <div key={it._id} style={{display:"grid",gridTemplateColumns:GRID,padding:"3px 12px",borderBottom:"1px solid #f1f5f9",alignItems:"center",background:idx%2===0?"#fff":"#fafafa"}}>
                        <div>
                          <div style={{fontSize:".72rem",fontWeight:700,color:"#94a3b8"}}>{label}</div>
                          {subLabels.length>0&&(
                            <select value={it.subsection||""} onChange={e=>updateItem(it._id,"subsection",e.target.value)} title="Move to sub-section"
                              style={{marginTop:2,maxWidth:"100%",border:"1px solid #e2e8f0",borderRadius:4,fontSize:".55rem",color:"#64748b",background:"#fff",padding:"1px 2px",outline:"none",fontFamily:"inherit"}}>
                              <option value="">— no sub —</option>
                              {subLabels.map(s=><option key={s} value={s}>{s}</option>)}
                            </select>
                          )}
                        </div>
                        <div style={{position:"relative",display:"flex",alignItems:"center",gap:3}}>
                          <AutoGrowTextarea value={it.description}
                            onChange={e=>{
                              updateItem(it._id,"description",e.target.value);
                              const q=e.target.value;
                              if(q.length>=2){
                                const ql=q.toLowerCase();
                                const matches=boqLibrary.filter(lib=>lib.name.toLowerCase().includes(ql)||(lib.tags||[]).some(t=>t.toLowerCase().includes(ql))).slice(0,7);
                                setSuggest({id:it._id,matches});
                              } else setSuggest({id:null,matches:[]});
                            }}
                            onFocus={e=>{
                              const q=e.target.value;
                              if(q.length>=2){const ql=q.toLowerCase();setSuggest({id:it._id,matches:boqLibrary.filter(lib=>lib.name.toLowerCase().includes(ql)||(lib.tags||[]).some(t=>t.toLowerCase().includes(ql))).slice(0,7)});}
                            }}
                            onBlur={()=>setTimeout(()=>setSuggest({id:null,matches:[]}),160)}
                            placeholder="Type to search library or enter description"
                            minRows={2}
                            style={{...inpSt,fontSize:".78rem",padding:"4px 6px",flex:1,lineHeight:1.4,minHeight:44,fontFamily:"inherit"}}/>
                          {it.description.trim().length>=2&&!boqLibrary.some(lib=>lib.name.toLowerCase()===it.description.trim().toLowerCase())&&(
                            <button title="Save to library" onMouseDown={e=>{e.preventDefault();
                              const entry={id:uid(),name:it.description.trim(),description:"",section:sec.id,unit:it.unit||"lot",unitCost:Number(it.baseCost!=null?it.baseCost:it.unitCost)||0,tags:[],createdBy:session?.name||"",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
                              const newLib=[...boqLibrary,entry];saveLibrary(newLib);
                              if(isSupabaseReady())sbInsert("boq_library",{id:entry.id,name:entry.name,description:"",category:entry.section,unit:entry.unit,unit_cost:entry.unitCost,tags:[],created_by:entry.createdBy,created_at:entry.createdAt,updated_at:entry.updatedAt}).catch(()=>{});
                              toastEmit&&toastEmit(`"${entry.name}" saved to library`,"success");
                            }} style={{background:"none",border:"none",cursor:"pointer",fontSize:".82rem",color:"#7c3aed",opacity:.55,padding:"0 2px",lineHeight:1,flexShrink:0}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=.55}>💾</button>
                          )}
                          {suggest.id===it._id&&suggest.matches.length>0&&(
                            <div style={{position:"absolute",top:"100%",left:0,right:0,background:"#fff",border:"1.5px solid #7c3aed",borderRadius:8,zIndex:1000,boxShadow:"0 8px 24px #0003",overflow:"hidden",minWidth:220}}>
                              {suggest.matches.map(lib=>{
                                const lsec=sections.find(s=>s.id===lib.section)||BOQ_SECTIONS.find(s=>s.id===lib.section)||sections[0];
                                return(
                                  <div key={lib.id} onMouseDown={()=>applyLibItem(it._id,lib)}
                                    style={{padding:"8px 12px",cursor:"pointer",borderBottom:"1px solid #f5f3ff",background:"#fff"}}
                                    onMouseEnter={e=>e.currentTarget.style.background="#f5f3ff"}
                                    onMouseLeave={e=>e.currentTarget.style.background="#fff"}>
                                    <div style={{fontWeight:700,fontSize:".78rem",color:"#0f172a"}}>{lib.name}</div>
                                    <div style={{fontSize:".65rem",color:lsec?.color||"#64748b",fontWeight:600,marginTop:1}}>{lsec?.label} · {lib.unit}{lib.unitCost>0?` · ₱${lib.unitCost.toLocaleString("en-PH")}`:""}</div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                        <input type="number" value={it.qty} onChange={e=>updateItem(it._id,"qty",e.target.value)} style={{...inpSt,fontSize:".78rem",padding:"4px 4px",textAlign:"right"}}/>
                        <input value={it.unit} onChange={e=>updateItem(it._id,"unit",e.target.value)} placeholder="lot" style={{...inpSt,fontSize:".72rem",padding:"4px 4px",textAlign:"center"}}/>
                        <input type="number" value={it.baseCost!=null?it.baseCost:it.unitCost} onChange={e=>updateItem(it._id,"baseCost",e.target.value)} title="Direct cost per unit (before markup)" style={{...inpSt,fontSize:".78rem",padding:"4px 6px",textAlign:"right"}}/>
                        <div style={{position:"relative",display:"flex",alignItems:"center"}}>
                          <input type="number" value={it.markup||0} onChange={e=>updateItem(it._id,"markup",e.target.value)} min="0" step="0.5" title="Markup % for this item" style={{...inpSt,fontSize:".74rem",padding:"4px 13px 4px 4px",textAlign:"right",color:Number(it.markup)>0?"#b45309":"#94a3b8",fontWeight:Number(it.markup)>0?700:400}}/>
                          <span style={{position:"absolute",right:4,fontSize:".64rem",color:"#a16207",pointerEvents:"none"}}>%</span>
                        </div>
                        <div style={{textAlign:"right",paddingRight:4,lineHeight:1.15}}>
                          <div style={{fontWeight:700,color:"#0f172a",fontSize:".82rem"}}>{it.total.toLocaleString("en-PH",{minimumFractionDigits:2})}</div>
                          {Number(it.markup)>0&&(it.baseCost>0)&&<div style={{fontSize:".6rem",color:"#94a3b8"}}>@ ₱{(it.unitCost||0).toLocaleString("en-PH",{maximumFractionDigits:2})}/{it.unit||"unit"}</div>}
                        </div>
                        <input value={it.remarks||""} onChange={e=>updateItem(it._id,"remarks",e.target.value)} placeholder="OSM…" style={{...inpSt,fontSize:".68rem",padding:"4px 5px",color:"#64748b"}}/>
                        <button onClick={()=>removeItem(it._id)} style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:".85rem",padding:2}}>✕</button>
                      </div>
                    );
                    return(
                      <>
                        {/* Loose items — directly under the section */}
                        {ungrouped.map((it,idx)=>itemRow(it,`${sec.id}.${idx+1}`,idx))}
                        {/* Named sub-sections */}
                        {subs.map(sub=>{
                          const subTotal=sub.items.reduce((t,it)=>t+it.total,0);
                          return(
                            <React.Fragment key={sub.label}>
                              {/* Sub-section header */}
                              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:sec.color+"0f",borderTop:"1px dashed "+sec.color+"55",padding:"4px 12px 4px 26px"}}>
                                <div style={{display:"flex",alignItems:"center",gap:6}}>
                                  <span style={{fontWeight:800,fontSize:".66rem",color:sec.color,opacity:.9,letterSpacing:".3px"}}>{sec.id}.{sub.num}</span>
                                  {editingSubKey===sec.id+"::"+sub.label
                                    ?<input autoFocus defaultValue={sub.label}
                                        onBlur={e=>{renameSubsection(sec.id,sub.label,e.target.value||sub.label);setEditingSubKey(null);}}
                                        onKeyDown={e=>{if(e.key==="Enter"||e.key==="Escape"){renameSubsection(sec.id,sub.label,e.target.value||sub.label);setEditingSubKey(null);}}}
                                        style={{fontSize:".7rem",fontWeight:700,border:"none",borderBottom:"1.5px solid "+sec.color,background:"transparent",color:sec.color,outline:"none",padding:"0 2px",minWidth:150}}/>
                                    :<span onClick={()=>setEditingSubKey(sec.id+"::"+sub.label)} style={{fontSize:".7rem",fontWeight:700,color:sec.color,cursor:"pointer"}} title="Click to rename sub-section">{sub.label} ✎</span>
                                  }
                                  <button onClick={()=>removeSubsection(sec.id,sub.label)} title="Remove sub-section — its items move back up to the section" style={{background:"none",border:"1px solid "+sec.color+"44",borderRadius:5,color:sec.color,cursor:"pointer",fontSize:".58rem",fontWeight:700,padding:"1px 6px",opacity:.7}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=.7}>ungroup</button>
                                </div>
                              </div>
                              {sub.items.map((it,mi)=>itemRow(it,`${sec.id}.${sub.num}.${mi+1}`,mi))}
                              {/* Sub-section sub-total */}
                              <div style={{display:"grid",gridTemplateColumns:GRID,background:sec.color+"08",borderBottom:"1px solid "+sec.color+"22",alignItems:"center"}}>
                                <div style={{gridColumn:"1/7",display:"flex",alignItems:"center",paddingLeft:14}}>
                                  <button onClick={()=>addRow(sec.id,sub.label)} style={{background:"none",border:"none",color:sec.color,cursor:"pointer",fontSize:".7rem",fontWeight:700,padding:"5px 12px",opacity:.7}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=.7}>+ Add row</button>
                                  <span style={{fontSize:".66rem",color:"#94a3b8",fontStyle:"italic"}}>Sub-total {sub.label}</span>
                                </div>
                                <div style={{textAlign:"right",fontWeight:700,fontSize:".74rem",color:sec.color,opacity:.9,paddingRight:4}}>₱{subTotal.toLocaleString("en-PH",{minimumFractionDigits:2})}</div>
                                <div/><div/>
                              </div>
                            </React.Fragment>
                          );
                        })}
                        {/* Section total + add controls */}
                        <div style={{display:"grid",gridTemplateColumns:GRID,background:sec.color+"14",borderBottom:"1.5px solid "+sec.color+"33",alignItems:"center"}}>
                          <div style={{gridColumn:"1/7",display:"flex",alignItems:"center",flexWrap:"wrap"}}>
                            <button onClick={()=>addRow(sec.id)} style={{background:"none",border:"none",color:sec.color,cursor:"pointer",fontSize:".72rem",fontWeight:700,padding:"5px 12px",opacity:.75}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=.75}>+ Add row</button>
                            <button onClick={()=>addSubsection(sec.id)} title="Group items under a named sub-section" style={{background:"none",border:"none",color:sec.color,cursor:"pointer",fontSize:".72rem",fontWeight:700,padding:"5px 10px",opacity:.75}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=.75}>+ Sub-section</button>
                            <span style={{fontSize:".68rem",color:"#64748b",fontWeight:700}}>Section total {sec.label}</span>
                          </div>
                          <div style={{textAlign:"right",fontWeight:800,fontSize:".8rem",color:sec.color,paddingRight:4}}>₱{secTotal.toLocaleString("en-PH",{minimumFractionDigits:2})}</div>
                          <div/><div/>
                        </div>
                      </>
                    );
                    })()}
                  </React.Fragment>
                );
              })}
              {/* Grand Total */}
              <div style={{display:"grid",gridTemplateColumns:GRID,padding:"10px 12px",background:"#1e293b",alignItems:"center"}}>
                <div style={{gridColumn:"1/7",fontWeight:800,color:"#f1f5f9",fontSize:".82rem",textTransform:"uppercase",letterSpacing:".5px"}}>Grand Total</div>
                <div style={{textAlign:"right",fontWeight:900,color:"#f59e0b",fontSize:"1rem",fontFamily:"'Barlow Condensed',sans-serif"}}>₱{grandTotal.toLocaleString("en-PH",{minimumFractionDigits:2})}</div>
                <div/><div/>
              </div>
              {/* Discount (peso amount, applied before VAT) */}
              <div style={{display:"grid",gridTemplateColumns:GRID,padding:"7px 12px",background:"#fffbeb",borderTop:"1px solid #fde68a",alignItems:"center"}}>
                <div style={{gridColumn:"1/7",fontSize:".78rem",fontWeight:600,color:"#92400e"}}>Discount <span style={{fontWeight:400,color:"#a16207"}}>(₱ off, before VAT)</span></div>
                <div style={{textAlign:"right"}}>
                  <input type="number" min="0" value={discount} onChange={e=>setDiscount(e.target.value)} placeholder="—"
                    style={{border:"none",borderBottom:"1.5px solid #fde68a",background:"transparent",fontFamily:"inherit",fontSize:".88rem",fontWeight:700,color:"#92400e",textAlign:"right",width:130,outline:"none"}}/>
                </div>
                <div/><div/>
              </div>
              {/* Net Total after discount */}
              {discountVal>0&&(
                <div style={{display:"grid",gridTemplateColumns:GRID,padding:"8px 12px",background:"#fef3c7",borderTop:"1px solid #fde68a",alignItems:"center"}}>
                  <div style={{gridColumn:"1/7",fontWeight:800,color:"#92400e",fontSize:".8rem",textTransform:"uppercase",letterSpacing:".5px"}}>Net Total after Discount</div>
                  <div style={{textAlign:"right",fontWeight:900,color:"#b45309",fontSize:".95rem",fontFamily:"'Barlow Condensed',sans-serif"}}>₱{netTotal.toLocaleString("en-PH",{minimumFractionDigits:2})}</div>
                  <div/><div/>
                </div>
              )}
              {/* VAT */}
              <div style={{display:"grid",gridTemplateColumns:GRID,padding:"7px 12px",background:"#f8fafc",borderTop:"1px solid #e2e8f0",alignItems:"center"}}>
                <div style={{gridColumn:"1/7",display:"flex",alignItems:"center",gap:8}}>
                  <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:".78rem",color:"#64748b",fontWeight:600}}>
                    <input type="checkbox" checked={vatEnabled} onChange={e=>setVatEnabled(e.target.checked)} style={{cursor:"pointer"}}/>
                    VAT 12%{discountVal>0?" (on net)":""}
                  </label>
                </div>
                <div style={{textAlign:"right",fontWeight:700,color:vatEnabled?"#475569":"#cbd5e1",fontSize:".85rem"}}>{vatEnabled?`₱${vatAmount.toLocaleString("en-PH",{minimumFractionDigits:2})}`:"-"}</div>
                <div/><div/>
              </div>
              {vatEnabled&&(
                <div style={{display:"grid",gridTemplateColumns:GRID,padding:"10px 12px",background:"#0f172a",alignItems:"center"}}>
                  <div style={{gridColumn:"1/7",fontWeight:800,color:"#f1f5f9",fontSize:".82rem",textTransform:"uppercase",letterSpacing:".5px"}}>Grand Total w/ VAT</div>
                  <div style={{textAlign:"right",fontWeight:900,color:"#34d399",fontSize:"1rem",fontFamily:"'Barlow Condensed',sans-serif"}}>₱{(netTotal+vatAmount).toLocaleString("en-PH",{minimumFractionDigits:2})}</div>
                  <div/><div/>
                </div>
              )}
            </div>
          </div>

          {/* General Notes + Bank Details + Signatures */}
          <div style={{background:"#fff",borderRadius:14,border:"1.5px solid #e2e8f0",padding:20,marginBottom:16,fontSize:".78rem",color:"#334155",lineHeight:1.75}}>
            <div style={{fontWeight:700,color:"#0f172a",marginBottom:8,fontSize:".85rem"}}>General Notes</div>
            <ul style={{margin:"0 0 18px 0",paddingLeft:18,color:"#475569"}}>
              {["Inclusive of Labor Fees (Inclusive of Night Differential)","Inclusive of Contingency Fee","Inclusive of Indirect Cost Fee","Inclusive of Value Added Taxes","Price Validity: 30 Days after Receiving","If the quotation is approved, Quotation Number must be indicated at Purchase Orders (PO)","Any alteration of the design and additional items not included in the contract will be billed accordingly.","GMD reserves the right to hold, pullout, suspend delivery if payments and other conditions are not met.","GMD Productions has a NO DP & NO Signed Contract = NO Production Policy.","Cost is based on specified requirements; additional requirements other than stated above shall be billed separately."].map((n,i)=><li key={i}>{n}</li>)}
            </ul>
            <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr",gap:20,marginBottom:24}}>
              <div>
                <div style={{fontWeight:700,color:"#0f172a",marginBottom:6}}>Bank Details</div>
                <div>Account Name: <strong>GMD PRODUCTIONS INC</strong></div>
                <div>BDO CHECKING — 012758000370</div>
                <div>BPI CHECKING — 6011 04 82 03</div>
                <div>METROBANK — 382-7-38202059-2</div>
              </div>
              <div>
                <div style={{fontWeight:700,color:"#0f172a",marginBottom:6}}>Payment Terms</div>
                <div>50% DP to start project</div>
                <div>Billing of 40% up until installation</div>
                <div>Retention of 10% upon certificate of completion</div>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:20,borderTop:"1px solid #e2e8f0",paddingTop:20}}>
              <div>
                <div style={{fontSize:".7rem",fontWeight:600,color:"#94a3b8",marginBottom:28}}>Prepared by:</div>
                <div style={{borderBottom:"1.5px solid #0f172a",marginBottom:5}}/>
                <div style={{fontWeight:700,color:"#0f172a"}}>Rodney Erpe</div>
                <div style={{fontSize:".7rem",color:"#64748b"}}>Quantity Surveyor</div>
              </div>
              <div>
                <div style={{fontSize:".7rem",fontWeight:600,color:"#94a3b8",marginBottom:28}}>Approved and Submitted by:</div>
                <div style={{borderBottom:"1.5px solid #0f172a",marginBottom:5}}/>
                <div style={{fontWeight:700,color:"#0f172a"}}>Paulo Miguel Garcia</div>
                <div style={{fontSize:".7rem",color:"#64748b"}}>President</div>
              </div>
              <div>
                <div style={{fontSize:".7rem",fontWeight:600,color:"#94a3b8",marginBottom:28}}>Accepted by:</div>
                <div style={{borderBottom:"1.5px solid #0f172a",marginBottom:5}}/>
                <div style={{fontWeight:700,color:"#0f172a"}}>{deal?.client||"Client Name / Representative"}</div>
                <div style={{fontSize:".7rem",color:"#64748b"}}>Signature</div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default BOQBuilder;
