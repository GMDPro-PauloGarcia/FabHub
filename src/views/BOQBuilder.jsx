import React,{useState,useEffect,useRef} from "react";
import {today,uid,KEYS,Card} from "../shared";
import {isSupabaseReady,sbInsert,sbUpdate,sbDelete} from "../supabaseClient";

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

function BOQBuilder({wonDeals,deals,jos,session,role,toastEmit,boqLibrary=[],setBoqLibrary,initialDealId,clearBoqDeal,onBack,standaloneBoqs=[],saveStandaloneBoq,initialStandaloneId,clearBoqStandalone,onLinkToDeal,onUnlinkToStandalone}){
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
  const[boqTitle,setBoqTitle]=useState("");
  const[location,setLocation]=useState("");
  const[quotationNo,setQuotationNo]=useState("");
  const[boqDate,setBoqDate]=useState(today);
  const[items,setItems]=useState(BLANK_ITEMS);
  const[vatEnabled,setVatEnabled]=useState(true);
  const[discountedTotal,setDiscountedTotal]=useState("");
  const[suggest,setSuggest]=useState({id:null,matches:[]});
  const[draftSaved,setDraftSaved]=useState(false);
  const draftTimerRef=useRef(null);

  // Dynamic sections — start empty, fully built per BOQ (no fixed sections)
  const SEC_COLORS=["#64748b","#3b82f6","#f59e0b","#8b5cf6","#06b6d4","#10b981","#ef4444","#f97316","#ec4899","#0ea5e9","#14b8a6","#a855f7","#e11d48","#84cc16","#d97706","#6366f1"];
  const[sections,setSections]=useState([]);
  const loadStandardSections=()=>setSections(ss=>ss.length?ss:BOQ_SECTIONS);
  const[editingSecId,setEditingSecId]=useState(null);
  const[addSecOpen,setAddSecOpen]=useState(false);
  const[newSecForm,setNewSecForm]=useState({id:"",label:""});

  const renameSection=(id,label)=>setSections(ss=>ss.map(s=>s.id===id?{...s,label}:s));
  const addSection=()=>{
    const sid=newSecForm.id.trim()||String(sections.length+1);
    if(!newSecForm.label.trim()){toastEmit("Section name is required.");return;}
    if(sections.find(s=>s.id===sid)){toastEmit(`Section "${sid}" already exists.`);return;}
    setSections(ss=>[...ss,{id:sid,label:newSecForm.label.trim(),color:SEC_COLORS[ss.length%SEC_COLORS.length]}]);
    setNewSecForm({id:"",label:""});
    setAddSecOpen(false);
  };
  const deleteSection=(id)=>{
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
    setItems(its=>[...its,{_id:uid(),section:libIt.section||"B",itemCode:"",description:libIt.name,unit:libIt.unit||"lot",qty:1,unitCost:libIt.unitCost||0,total:libIt.unitCost||0,remarks:""}]);
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

  const deal=wonDeals.find(d=>d.id===selDeal)||deals.find(d=>d.id===selDeal);

  const applyBoqSrc=(src)=>{
    if(src.items) setItems(src.items);
    if(src.sections) setSections(src.sections);
    if(src.boqTitle!==undefined) setBoqTitle(src.boqTitle);
    if(src.location!==undefined) setLocation(src.location);
    if(src.quotationNo!==undefined) setQuotationNo(src.quotationNo);
    if(src.boqDate!==undefined) setBoqDate(src.boqDate);
    if(src.vatEnabled!==undefined) setVatEnabled(src.vatEnabled);
    if(src.discountedTotal!==undefined) setDiscountedTotal(src.discountedTotal);
  };

  React.useEffect(()=>{
    if(standaloneId){
      // Standalone BOQ — load from the shared store (read once on open)
      const rec=standaloneBoqs.find(b=>b.id===standaloneId);
      if(rec){applyBoqSrc({items:rec.items,sections:rec.sections,boqTitle:rec.title,location:rec.location,quotationNo:rec.quotationNo,boqDate:rec.boqDate,vatEnabled:rec.vatEnabled,discountedTotal:rec.discountedTotal});}
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
        setDiscountedTotal("");
        const d=deal;
        if(d){
          setLocation(d.location||"");
          setBoqTitle(`${d.client||""}${d.contact?" · "+d.contact:""}${d.ceNo?" ("+d.ceNo+")":""}`);
          if(d.ceNo) setQuotationNo(d.ceNo);
        }
      }
      setDraftSaved(false);
    }
  },[selDeal,standaloneId]);

  React.useEffect(()=>{
    if(standaloneId){
      // Standalone BOQ — autosave to the shared store (synced via Supabase)
      setDraftSaved(false);
      clearTimeout(draftTimerRef.current);
      draftTimerRef.current=setTimeout(()=>{
        saveStandaloneBoq&&saveStandaloneBoq({id:standaloneId,title:boqTitle,location,quotationNo,boqDate,items,sections,vatEnabled,discountedTotal,updatedAt:new Date().toISOString()});
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
      const boqData={items,sections,boqTitle,location,quotationNo,boqDate,vatEnabled,discountedTotal};
      saveDraft(selDeal||BOQ_SCRATCH_KEY,boqData);
      if(selDeal&&isSupabaseReady()) sbUpdate('deals',selDeal,{boq_data:boqData}).catch(()=>{});
      setDraftSaved(true);
    },1200);
    return()=>clearTimeout(draftTimerRef.current);
  },[standaloneId,selDeal,items,sections,boqTitle,location,quotationNo,boqDate,vatEnabled,discountedTotal]);


  const updateItem=(id,key,val)=>setItems(its=>its.map(it=>{
    if(it._id!==id) return it;
    const upd={...it,[key]:["description","unit","section","remarks"].includes(key)?val:Number(val)||0};
    upd.total=(upd.qty||0)*(upd.unitCost||0);
    return upd;
  }));
  const removeItem=id=>setItems(its=>its.filter(it=>it._id!==id));
  const addRow=(sec)=>setItems(its=>[...its,{_id:uid(),section:sec||sections[0]?.id||"A",description:"",unit:"lot",qty:1,unitCost:0,total:0,remarks:""}]);
  const applyLibItem=(rowId,lib)=>{
    setItems(its=>its.map(it=>{
      if(it._id!==rowId) return it;
      const upd={...it,description:lib.name,unit:lib.unit||it.unit,unitCost:lib.unitCost>0?lib.unitCost:it.unitCost};
      upd.total=(upd.qty||0)*(upd.unitCost||0);
      return upd;
    }));
    setSuggest({id:null,matches:[]});
  };

  const grandTotal=items.reduce((s,it)=>s+it.total,0);
  const vatAmount=grandTotal*0.12;

  const printBOQ=()=>{
    const esc=s=>String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    const fmtP=v=>"₱"+Number(v||0).toLocaleString("en-PH",{minimumFractionDigits:2});
    const dateStr=boqDate?new Date(boqDate+"T00:00:00").toLocaleDateString("en-PH",{year:"numeric",month:"long",day:"numeric"}):"-";
    let rows="";
    sections.forEach(sec=>{
      const si=items.filter(it=>it.section===sec.id);
      if(!si.length) return;
      const secTotal=si.reduce((s,it)=>s+it.total,0);
      rows+=`<tr style="background:#f1f5f9"><td colspan="2" style="font-weight:800;font-size:11px;text-transform:uppercase;letter-spacing:.8px;padding:8px 10px;color:#1e293b">${esc(sec.id)}. ${esc(sec.label)}</td><td colspan="5" style="text-align:right;padding:8px 10px;font-size:10px;color:#64748b"></td></tr>`;
      si.forEach((it,idx)=>{rows+=`<tr style="background:${idx%2===0?"#fff":"#f8fafc"}"><td style="font-size:11px;color:#64748b;padding:6px 10px;white-space:nowrap">${esc(sec.id)}.${idx+1}</td><td style="padding:6px 10px;font-size:12px">${esc(it.description)||"—"}</td><td style="text-align:center;padding:6px 10px;font-size:12px">${it.qty||1}</td><td style="padding:6px 10px;font-size:12px">${esc(it.unit||"lot")}</td><td style="text-align:right;padding:6px 10px;font-size:12px">${fmtP(it.unitCost)}</td><td style="text-align:right;font-weight:700;padding:6px 10px;font-size:12px">${fmtP(it.total)}</td><td style="padding:6px 10px;font-size:11px;color:#64748b">${esc(it.remarks||"")}</td></tr>`;});
      rows+=`<tr style="background:${sec.color?sec.color+"11":"#f0fdf4"}"><td colspan="5" style="text-align:right;font-size:11px;font-weight:700;padding:6px 10px;color:#475569">Sub-total ${esc(sec.label)}</td><td style="text-align:right;font-weight:800;padding:6px 10px;font-size:12px;color:#0f172a">${fmtP(secTotal)}</td><td></td></tr>`;
    });
    const vatAmt=grandTotal*0.12;
    const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>BOQ — ${esc(boqTitle||"Draft")}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
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
  <div class="meta-item"><label>Project</label><span>${esc(boqTitle||"—")}</span></div>
  <div class="meta-item"><label>Location</label><span>${esc(location||"—")}</span></div>
  <div class="meta-item"><label>Contractor</label><span>GMD Productions Inc.</span></div>
  <div class="meta-item"><label>Date</label><span>${dateStr}</span></div>
</div>
<table>
  <thead><tr><th style="width:68px">Item No.</th><th>Description</th><th style="text-align:center;width:48px">Qty</th><th style="width:56px">Unit</th><th class="r" style="width:110px">Unit Cost</th><th class="r" style="width:120px">Total Amount</th><th style="width:110px">Remarks</th></tr></thead>
  <tbody>${rows}</tbody>
  <tr class="tot-row"><td colspan="5" style="text-align:right">Grand Total</td><td style="text-align:right">${fmtP(grandTotal)}</td><td></td></tr>
  ${vatEnabled?`<tr class="vat-row"><td colspan="5" style="text-align:right">VAT 12%</td><td style="text-align:right">${fmtP(vatAmt)}</td><td></td></tr><tr class="gtvat-row"><td colspan="5" style="text-align:right">Grand Total w/ VAT</td><td style="text-align:right">${fmtP(grandTotal+vatAmt)}</td><td></td></tr>`:""}
  ${discountedTotal?`<tr class="disc-row"><td colspan="5" style="text-align:right">Discounted Total w/o VAT</td><td style="text-align:right">${fmtP(discountedTotal)}</td><td></td></tr>`:""}
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
      si.forEach((it,idx)=>rows.push([`${sec.id}.${idx+1}`,it.description,it.qty,it.unit,it.unitCost,it.total,it.remarks||""]));
      rows.push(["",`Sub-total ${sec.label}`,"","","","",si.reduce((s,it)=>s+it.total,0)]);
    });
    rows.push(["","GRAND TOTAL","","","","",grandTotal]);
    if(vatEnabled){rows.push(["","VAT 12%","","","","",vatAmount]);rows.push(["","GRAND TOTAL w/ VAT","","","","",grandTotal+vatAmount]);}
    if(discountedTotal) rows.push(["","DISCOUNTED TOTAL w/o VAT","","","","",discountedTotal]);
    const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
    const a=document.createElement("a");
    a.href="data:text/csv;charset=utf-8,﻿"+encodeURIComponent(csv);
    a.download=`BOQ_${(boqTitle||"draft").replace(/[^a-zA-Z0-9]/g,"_")}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  };

  const mob=window.innerWidth<768;
  const inpSt={border:"1.5px solid #e2e8f0",borderRadius:6,padding:"5px 8px",fontFamily:"inherit",fontSize:".8rem",width:"100%",outline:"none",background:"#fff",boxSizing:"border-box"};
  const GRID="76px 1fr 58px 62px 110px 110px 118px 30px";

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
            {standaloneId
              ?<select value="" onChange={e=>{const v=e.target.value;if(!v||!onLinkToDeal)return;const d2=deals.find(d=>d.id===v);if(window.confirm(`Link this BOQ to ${d2?.client||"this project"}${d2?.ceNo?" ("+d2.ceNo+")":""}?\n\nYour sections and items are kept — the BOQ just moves out of Standalone and attaches to the project.`)){onLinkToDeal(v,{items,sections,boqTitle,location,quotationNo,boqDate,vatEnabled,discountedTotal});}}} style={{fontFamily:"inherit",fontSize:".78rem",color:"#7c3aed",fontWeight:700,background:"#f5f3ff",border:"1px solid #ddd6fe",borderRadius:20,padding:"2px 10px",outline:"none",flex:1,minWidth:0,cursor:"pointer"}}>
                <option value="">📄 Standalone BOQ — link to a project…</option>
                {deals.filter(d=>d.stage!=="Did Not Win"&&d.stage!=="Cancelled").map(d=><option key={d.id} value={d.id}>{d.client}{d.contact?" · "+d.contact:""}{d.ceNo?" ("+d.ceNo+")":""}</option>)}
              </select>
              :<select value={selDeal} onChange={e=>{const v=e.target.value;if(v==="__unlink__"){if(onUnlinkToStandalone&&window.confirm("Unlink this BOQ from the project and move it to Standalone?\n\nUse this if a project was picked by mistake. Your sections and items are kept; the BOQ is detached from the project.")){onUnlinkToStandalone({items,sections,boqTitle,location,quotationNo,boqDate,vatEnabled,discountedTotal});}return;}setSelDeal(v);}} style={{border:"none",fontFamily:"inherit",fontSize:".8rem",color:"#0f172a",outline:"none",background:"transparent",flex:1,minWidth:0}}>
                <option value="">— Select —</option>
                {deals.filter(d=>d.id===selDeal||(d.stage!=="Did Not Win"&&d.stage!=="Cancelled")).map(d=><option key={d.id} value={d.id}>{d.client}{d.contact?" · "+d.contact:""}{d.ceNo?" ("+d.ceNo+")":""}</option>)}
                {selDeal&&onUnlinkToStandalone&&<option value="__unlink__">📄 Unlink — make Standalone (misclick fix)</option>}
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
          <span style={{fontSize:".7rem",fontWeight:600,color:"#64748b"}}>Add row:</span>
          {sections.map(s=>(
            <button key={s.id} onClick={()=>addRow(s.id)} style={{background:s.color+"14",border:`1.5px solid ${s.color}44`,borderRadius:7,padding:"4px 10px",fontFamily:"inherit",fontSize:".72rem",fontWeight:700,color:s.color,cursor:"pointer"}}>+ {s.id}</button>
          ))}
          <button onClick={()=>setAddSecOpen(o=>!o)} style={{background:"#f1f5f9",border:"1.5px solid #e2e8f0",borderRadius:7,padding:"4px 10px",fontFamily:"inherit",fontSize:".72rem",fontWeight:700,color:"#475569",cursor:"pointer"}}>✚ Section</button>
        </div>
        <div style={{display:"flex",gap:6}}>
          <button onClick={()=>setLibOpen(o=>!o)} style={{background:libOpen?"#ede9fe":"#f5f3ff",border:`1.5px solid ${libOpen?"#7c3aed":"#c4b5fd"}`,borderRadius:8,padding:"6px 12px",fontFamily:"inherit",fontSize:".74rem",fontWeight:700,color:"#5b21b6",cursor:"pointer"}}>
            📚 Library{boqLibrary.length>0&&<span style={{background:"#7c3aed",color:"#fff",borderRadius:20,padding:"0 6px",fontSize:".62rem",fontWeight:800,marginLeft:4}}>{boqLibrary.length}</span>}
          </button>
          {items.length>0&&<button onClick={printBOQ} style={{background:"#f0fdf4",border:"1.5px solid #86efac",borderRadius:8,padding:"6px 12px",fontFamily:"inherit",fontSize:".74rem",fontWeight:700,color:"#166534",cursor:"pointer"}}>🖨 Preview / Print</button>}
          {items.length>0&&<button onClick={exportCSV} style={{background:"#eff6ff",border:"1.5px solid #bfdbfe",borderRadius:8,padding:"6px 12px",fontFamily:"inherit",fontSize:".74rem",fontWeight:700,color:"#1d4ed8",cursor:"pointer"}}>⬇ Export CSV</button>}
          {(selDeal||items.length>0||sections.length>0)&&<button onClick={()=>{deleteDraft(selDeal||BOQ_SCRATCH_KEY);if(selDeal&&isSupabaseReady())sbUpdate('deals',selDeal,{boq_data:null}).catch(()=>{});setItems(BLANK_ITEMS());setSections([]);setBoqTitle("");setLocation(deal?.location||"");setQuotationNo(deal?.ceNo||"");setBoqDate(today);setVatEnabled(true);setDiscountedTotal("");setDraftSaved(false);}} style={{background:"#fff7ed",border:"1.5px solid #fed7aa",borderRadius:8,padding:"6px 12px",fontFamily:"inherit",fontSize:".74rem",fontWeight:700,color:"#c2410c",cursor:"pointer"}} title="Clear saved draft and reset">✕ Clear Draft</button>}
          {draftSaved&&(items.length>0||sections.length>0)&&<span style={{fontSize:".72rem",color:"#16a34a",fontWeight:600,display:"flex",alignItems:"center",gap:4}}>✓ {selDeal?"Draft saved":"Saved (no project yet)"}</span>}
        </div>
      </div>

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
          <div style={{fontSize:".8rem",color:"#64748b",marginBottom:16}}>Add a section to start building this BOQ. You decide which sections this quotation needs.{!selDeal&&" Tip: pick a Project above to link this BOQ — your work is saved either way."}</div>
          <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
            <button onClick={()=>setAddSecOpen(true)} style={{background:"#1e293b",border:"none",borderRadius:8,padding:"9px 18px",color:"#fff",fontFamily:"inherit",fontWeight:700,fontSize:".82rem",cursor:"pointer"}}>✚ Add Section</button>
            <button onClick={loadStandardSections} style={{background:"#f1f5f9",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"9px 18px",color:"#475569",fontFamily:"inherit",fontWeight:700,fontSize:".82rem",cursor:"pointer"}}>Load GMD standard sections</button>
          </div>
        </div>
      )}
      {sections.length>0&&(
        <>
          <div style={{background:"#fff",borderRadius:14,border:"1.5px solid #e2e8f0",overflow:"auto",marginBottom:12}}>
            <div style={{minWidth:760}}>
              {/* Column headers */}
              <div style={{display:"grid",gridTemplateColumns:GRID,background:"#f8fafc",borderBottom:"2px solid #e2e8f0",padding:"8px 12px",alignItems:"center"}}>
                {["Item No.","Description","Qty","Unit","Unit Cost (₱)","Total Amount (₱)","Remarks",""].map((h,i)=>(
                  <div key={i} style={{fontSize:".58rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".8px",color:"#94a3b8",textAlign:[4,5].includes(i)?"right":"left"}}>{h}</div>
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
                    </div>
                    {/* Item rows */}
                    {si.map((it,idx)=>(
                      <div key={it._id} style={{display:"grid",gridTemplateColumns:GRID,padding:"3px 12px",borderBottom:"1px solid #f1f5f9",alignItems:"center",background:idx%2===0?"#fff":"#fafafa"}}>
                        <div style={{fontSize:".72rem",fontWeight:700,color:"#94a3b8"}}>{sec.id}.{idx+1}</div>
                        <div style={{position:"relative",display:"flex",alignItems:"center",gap:3}}>
                          <textarea value={it.description}
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
                            rows={1}
                            onInput={e=>{e.target.style.height="auto";e.target.style.height=e.target.scrollHeight+"px";}}
                            style={{...inpSt,fontSize:".78rem",padding:"4px 6px",flex:1,resize:"none",lineHeight:1.4,minHeight:28,fontFamily:"inherit",overflow:"hidden"}}/>
                          {it.description.trim().length>=2&&!boqLibrary.some(lib=>lib.name.toLowerCase()===it.description.trim().toLowerCase())&&(
                            <button title="Save to library" onMouseDown={e=>{e.preventDefault();
                              const entry={id:uid(),name:it.description.trim(),description:"",section:sec.id,unit:it.unit||"lot",unitCost:Number(it.unitCost)||0,tags:[],createdBy:session?.name||"",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
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
                        <input type="number" value={it.unitCost} onChange={e=>updateItem(it._id,"unitCost",e.target.value)} style={{...inpSt,fontSize:".78rem",padding:"4px 6px",textAlign:"right"}}/>
                        <div style={{textAlign:"right",fontWeight:600,color:"#0f172a",fontSize:".82rem",paddingRight:4}}>{it.total.toLocaleString("en-PH",{minimumFractionDigits:2})}</div>
                        <input value={it.remarks||""} onChange={e=>updateItem(it._id,"remarks",e.target.value)} placeholder="OSM, c/o owner…" style={{...inpSt,fontSize:".68rem",padding:"4px 5px",color:"#64748b"}}/>
                        <button onClick={()=>removeItem(it._id)} style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:".85rem",padding:2}}>✕</button>
                      </div>
                    ))}
                    {/* Sub-total row */}
                    <div style={{display:"grid",gridTemplateColumns:GRID,background:sec.color+"0a",borderBottom:"1.5px solid "+sec.color+"22",alignItems:"center"}}>
                      <div style={{gridColumn:"1/6",display:"flex",alignItems:"center"}}>
                        <button onClick={()=>addRow(sec.id)} style={{background:"none",border:"none",color:sec.color,cursor:"pointer",fontSize:".72rem",fontWeight:700,padding:"5px 12px",opacity:.7}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=.7}>+ Add row</button>
                        <span style={{fontSize:".68rem",color:"#94a3b8",fontStyle:"italic"}}>Sub-total {sec.label}</span>
                      </div>
                      <div style={{textAlign:"right",fontWeight:700,fontSize:".78rem",color:sec.color,paddingRight:4}}>₱{secTotal.toLocaleString("en-PH",{minimumFractionDigits:2})}</div>
                      <div/><div/>
                    </div>
                  </React.Fragment>
                );
              })}
              {/* Grand Total */}
              <div style={{display:"grid",gridTemplateColumns:GRID,padding:"10px 12px",background:"#1e293b",alignItems:"center"}}>
                <div style={{gridColumn:"1/6",fontWeight:800,color:"#f1f5f9",fontSize:".82rem",textTransform:"uppercase",letterSpacing:".5px"}}>Grand Total</div>
                <div style={{textAlign:"right",fontWeight:900,color:"#f59e0b",fontSize:"1rem",fontFamily:"'Barlow Condensed',sans-serif"}}>₱{grandTotal.toLocaleString("en-PH",{minimumFractionDigits:2})}</div>
                <div/><div/>
              </div>
              {/* VAT */}
              <div style={{display:"grid",gridTemplateColumns:GRID,padding:"7px 12px",background:"#f8fafc",borderTop:"1px solid #e2e8f0",alignItems:"center"}}>
                <div style={{gridColumn:"1/6",display:"flex",alignItems:"center",gap:8}}>
                  <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:".78rem",color:"#64748b",fontWeight:600}}>
                    <input type="checkbox" checked={vatEnabled} onChange={e=>setVatEnabled(e.target.checked)} style={{cursor:"pointer"}}/>
                    VAT 12%
                  </label>
                </div>
                <div style={{textAlign:"right",fontWeight:700,color:vatEnabled?"#475569":"#cbd5e1",fontSize:".85rem"}}>{vatEnabled?`₱${vatAmount.toLocaleString("en-PH",{minimumFractionDigits:2})}`:"-"}</div>
                <div/><div/>
              </div>
              {vatEnabled&&(
                <div style={{display:"grid",gridTemplateColumns:GRID,padding:"10px 12px",background:"#0f172a",alignItems:"center"}}>
                  <div style={{gridColumn:"1/6",fontWeight:800,color:"#f1f5f9",fontSize:".82rem",textTransform:"uppercase",letterSpacing:".5px"}}>Grand Total w/ VAT</div>
                  <div style={{textAlign:"right",fontWeight:900,color:"#34d399",fontSize:"1rem",fontFamily:"'Barlow Condensed',sans-serif"}}>₱{(grandTotal+vatAmount).toLocaleString("en-PH",{minimumFractionDigits:2})}</div>
                  <div/><div/>
                </div>
              )}
              {/* Discounted Total */}
              <div style={{display:"grid",gridTemplateColumns:GRID,padding:"7px 12px",background:"#fffbeb",borderTop:"1px solid #fde68a",alignItems:"center"}}>
                <div style={{gridColumn:"1/6",fontSize:".76rem",fontWeight:600,color:"#92400e"}}>Discounted Total w/o VAT <span style={{fontWeight:400,color:"#a16207"}}>(optional override)</span></div>
                <div style={{textAlign:"right"}}>
                  <input type="number" value={discountedTotal} onChange={e=>setDiscountedTotal(e.target.value)} placeholder="—"
                    style={{border:"none",borderBottom:"1.5px solid #fde68a",background:"transparent",fontFamily:"inherit",fontSize:".88rem",fontWeight:700,color:"#92400e",textAlign:"right",width:130,outline:"none"}}/>
                </div>
                <div/><div/>
              </div>
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
