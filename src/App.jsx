import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {supabase,isSupabaseReady,sbList,sbInsert,sbUpdate,sbUpsert,sbDelete,sbLoadAll,sbSubscribe} from './supabaseClient';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
// GMD Real 13-Stage Workflow
const DEAL_STAGES = [
  "01 · BizDev",
  "02 · Client Engagement",
  "03 · Design Request & Folder Setup",
  "04 · Design & CE in Progress",
  "05 · Client Approval / Revision",
  "06 · Project Kickoff",
  "07 · Budget & Briefing",
  "08 · Fabrication / Construction",
  "09 · Site Visit & Progress Billing",
  "10 · Installation",
  "11 · Punchlist",
  "12 · Project Close-Out",
  "13 · Client Feedback",
  "Cancelled",
  "Did Not Win",
];

// Normalize any stage string to canonical format
const STAGE_ALIASES={
  "bizdev":"01 · BizDev","biz dev":"01 · BizDev","01":"01 · BizDev","1":"01 · BizDev",
  "client engagement":"02 · Client Engagement","engagement":"02 · Client Engagement","02":"02 · Client Engagement","2":"02 · Client Engagement",
  "design request":"03 · Design Request & Folder Setup","folder setup":"03 · Design Request & Folder Setup","03":"03 · Design Request & Folder Setup","3":"03 · Design Request & Folder Setup",
  "design & ce in progress":"04 · Design & CE in Progress","ce in progress":"04 · Design & CE in Progress","04":"04 · Design & CE in Progress","4":"04 · Design & CE in Progress",
  "client approval":"05 · Client Approval / Revision","approval":"05 · Client Approval / Revision","revision":"05 · Client Approval / Revision","05":"05 · Client Approval / Revision","5":"05 · Client Approval / Revision",
  "project kickoff":"06 · Project Kickoff","kickoff":"06 · Project Kickoff","awarded":"06 · Project Kickoff","06":"06 · Project Kickoff","6":"06 · Project Kickoff",
  "budget & briefing":"07 · Budget & Briefing","briefing":"07 · Budget & Briefing","07":"07 · Budget & Briefing","7":"07 · Budget & Briefing",
  "fabrication":"08 · Fabrication / Construction","construction":"08 · Fabrication / Construction","fabrication / construction":"08 · Fabrication / Construction","08":"08 · Fabrication / Construction","8":"08 · Fabrication / Construction",
  "site visit":"09 · Site Visit & Progress Billing","progress billing":"09 · Site Visit & Progress Billing","09":"09 · Site Visit & Progress Billing","9":"09 · Site Visit & Progress Billing",
  "installation":"10 · Installation","10":"10 · Installation",
  "punchlist":"11 · Punchlist","punch list":"11 · Punchlist","11":"11 · Punchlist",
  "project close-out":"12 · Project Close-Out","close out":"12 · Project Close-Out","closeout":"12 · Project Close-Out","close-out":"12 · Project Close-Out","12":"12 · Project Close-Out",
  "client feedback":"13 · Client Feedback","feedback":"13 · Client Feedback","13":"13 · Client Feedback",
  "cancelled":"Cancelled","canceled":"Cancelled",
};
const normalizeStage=(s)=>{
  if(!s) return "01 · BizDev";
  const clean=String(s).trim();
  if(DEAL_STAGES.includes(clean)) return clean;
  const lower=clean.toLowerCase().replace(/·/g,"").replace(/\s+/g," ").trim();
  if(STAGE_ALIASES[lower]) return STAGE_ALIASES[lower];
  // Try numeric prefix match
  const m=clean.match(/^(\d+)/);
  if(m){const f=DEAL_STAGES.find(x=>x.startsWith(m[1].padStart(2,"0")+" ·"));if(f)return f;}
  // Partial match
  for(const [alias,canonical] of Object.entries(STAGE_ALIASES)){
    if(lower.includes(alias)) return canonical;
  }
  return "01 · BizDev";
};
const WON_STAGES    = ["06 · Project Kickoff","07 · Budget & Briefing","08 · Fabrication / Construction","09 · Site Visit & Progress Billing","10 · Installation","11 · Punchlist","12 · Project Close-Out","13 · Client Feedback"];
const ACTIVE_STAGES = ["01 · BizDev","02 · Client Engagement","03 · Design Request & Folder Setup","04 · Design & CE in Progress","05 · Client Approval / Revision"];
const PAULO_GATE    = ["05 · Client Approval / Revision","06 · Project Kickoff"];
const CE_TYPES      = ["Fabrication / General","Construction","Retail Fit-Out","Kiosk","Signage","Event / Activation","Repair / Refurbishment","Other"];
const STAGE_OWNER   = {
  "01 · BizDev":                       "BizDev Director",
  "02 · Client Engagement":            "Account Executive",
  "03 · Design Request & Folder Setup":"Account Executive",
  "04 · Design & CE in Progress":      "Design + Cost Estimator",
  "05 · Client Approval / Revision":   "Account Executive + Paulo",
  "06 · Project Kickoff":              "Sales + Finance + Ops",
  "07 · Budget & Briefing":            "Cost Control + Project Manager",
  "08 · Fabrication / Construction":   "Operations + Procurement",
  "09 · Site Visit & Progress Billing":"Project Manager + Finance",
  "10 · Installation":                 "Operations",
  "11 · Punchlist":                    "Project Manager",
  "12 · Project Close-Out":            "Project Manager + Finance",
  "13 · Client Feedback":              "Account Executive",
};
const STAGE_DURATION = {
  "04 · Design & CE in Progress":      "Design: 5–15 days · CE: 5–7 days",
  "08 · Fabrication / Construction":   "Fab: 45 days · Construction: 45–60 days",
};
const PROD_STAGES     = ["Design","Fabrication","QC","Delivery"];
const DESIGN_STATUSES = ["Briefing","On-going","First Pass","Revision","Production Plans","Done"];
const PRODUCT_TYPES   = ["Custom Shelving","Display Fixtures","Signage","Countertops","Retail Cabinetry","Kiosks","Wall Panels","Millwork","Other"];
// GMD Real Team — 4 departments
const SALES_TEAM        = ["Paulo Garcia","Paolo Gomez","April Gail De Ello","Jena De Asis","Don Wyn Celmar","Aerwin Del Rosario (CE)","Marian Prile (CE)"];
const COST_CONTROL_TEAM = ["Aerwin Del Rosario (Finance Manager)","Marian Prile (Procurement Manager)"];
const OPS_TEAM          = ["Arrius Catubay (Ops Director)","Ryon Santiago (PM)","David Melendez (PM)","Jay Bernardo (PM)","Angelo Nogra (Coordinator)","Arvin Jaca (Coordinator)","Jessie Singun (Coordinator)","Anthony Nogra (Coordinator)","Steve Jazmin (Coordinator)"];
const DESIGN_MEMBERS    = ["Gab Florita","Miaa Villoria","Miel Vidallo","Adrian Adriano","Tisha Leyva","Freelancer / Outsourced"];
const ALL_MEMBERS       = [...new Set([...SALES_TEAM,...COST_CONTROL_TEAM,...OPS_TEAM,...DESIGN_MEMBERS])];
const PROD_MEMBERS      = ALL_MEMBERS; // backward compat
const MAT_UNITS       = ["pcs","sheets","meters","kg","sets","rolls","liters","sqm"];
const EXP_CATS        = ["Materials","Labor","Overhead","Utilities","Rent","Transport","Marketing","Salaries","Subcontractor","Other"];
const SWATCH_CATS     = ["Fabric","Paint","Hardware","Wood","Metal","Glass","Laminate","Tile","Lighting","Fixture","Trim","Adhesive","Other"];
const SWATCH_STATUS   = ["To Buy","Ordered","Received","Client Approved"];
const PAY_STATUS      = ["Unpaid","Partial","Deposited","Paid"];
const MONTHS          = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const PRIORITIES      = ["Normal","High","Urgent"];

const STAGE_CLR = {
  "01 · BizDev":                       "#94a3b8",
  "02 · Client Engagement":            "#60a5fa",
  "03 · Design Request & Folder Setup":"#a78bfa",
  "04 · Design & CE in Progress":      "#f59e0b",
  "05 · Client Approval / Revision":   "#f97316",
  "06 · Project Kickoff":              "#10b981",
  "07 · Budget & Briefing":            "#06b6d4",
  "08 · Fabrication / Construction":   "#3b82f6",
  "09 · Site Visit & Progress Billing":"#8b5cf6",
  "10 · Installation":                 "#ec4899",
  "11 · Punchlist":                    "#eab308",
  "12 · Project Close-Out":            "#059669",
  "13 · Client Feedback":              "#4ade80",
  "Cancelled":                         "#ef4444",
  "Did Not Win":                       "#94a3b8",
};
const PROD_CLR  = { Design:"#8b5cf6",Fabrication:"#f97316",QC:"#eab308",Delivery:"#10b981" };
const PAY_CLR   = { Unpaid:"#ef4444",Partial:"#f59e0b","Partially Paid":"#f59e0b",Deposited:"#10b981","Fully Paid":"#059669",Paid:"#059669" };
const PRI_CLR   = { Normal:"#3b82f6",High:"#f59e0b",Urgent:"#ef4444" };
const DS_CLR    = { Briefing:"#94a3b8","On-going":"#3b82f6","First Pass":"#8b5cf6",Revision:"#f97316","Production Plans":"#eab308",Done:"#10b981" };
const SW_CLR    = { "To Buy":"#ef4444",Ordered:"#f59e0b",Received:"#10b981","Client Approved":"#059669" };
const DRF_TYPES = ["Module / Display Fixture","Signage","Retail Fit-Out","Counter / Reception","Kiosk","Wall Panel / Decor","Custom Furniture","Other"];
const DRF_STATUSES = ["New","Acknowledged","In Progress","For Review","Revision","Approved","Done"];
const DRF_CLR   = {New:"#94a3b8",Acknowledged:"#3b82f6","In Progress":"#f97316","For Review":"#8b5cf6",Revision:"#ef4444",Approved:"#10b981",Done:"#059669"};
const emptyDRF  = ()=>({dealId:"",client:"",location:"",designer:"",designDeadline:"",projectTitle:"",type:DRF_TYPES[0],size:"",description:"",accessories:[],refLinks:["","",""],notes:"",approvedLink:"",status:"New",createdBy:""});
const ROLE_CLR  = { Manager:"#f59e0b",Sales:"#10b981",Finance:"#3b82f6",Procurement:"#06b6d4",QS:"#8b5cf6",Operations:"#f97316",Design:"#ec4899",ProjectMover:"#0ea5e9",Warehouse:"#64748b" };

const CL_TYPES  = ["Purchase","Supplier Job","Permit","Task","Site Visit","Client Approval","Module","Swatch","Risk Flag"];
const CL_STATUS = ["To Do","In Progress","Done"];
const CL_DEPT   = ["Operations","Design","Procurement","Sales","Finance","Management"];
const TYPE_ICON = { Purchase:"🛒","Supplier Job":"🏭",Permit:"📋",Task:"✅","Site Visit":"📍","Client Approval":"🤝",Module:"📦",Swatch:"🎨","Risk Flag":"⚠️" };
const TYPE_CLR  = { Purchase:"#f59e0b","Supplier Job":"#f97316",Permit:"#3b82f6",Task:"#8b5cf6","Site Visit":"#10b981","Client Approval":"#ec4899",Module:"#0ea5e9",Swatch:"#d946ef","Risk Flag":"#ef4444" };
const CS_CLR    = { "To Do":"#94a3b8","In Progress":"#f59e0b",Done:"#10b981" };

const fmt   = n => "₱" + Number(n||0).toLocaleString("en-PH",{minimumFractionDigits:0});
const fmtK  = n => n>=1000000?"₱"+(n/1000000).toFixed(1)+"M":n>=1000?"₱"+(n/1000).toFixed(0)+"k":"₱"+(n||0);
const today = new Date().toISOString().split("T")[0];

// ─── TAX CALCULATIONS ─────────────────────────────────────────────────────────
// VAT-exclusive: contract value is the base, VAT added on top
const calcTax = (base, receiptType="OR", withholding=false) => {
  const b   = Number(base)||0;
  const vat = receiptType==="OR" ? b*0.12 : 0;        // 12% VAT on base (OR only)
  const gross = b + vat;                                // total amount billed to client
  const ewt = (receiptType==="OR" && withholding) ? b*0.02 : 0; // EWT only on OR, not AR
  const netReceivable = gross - ewt;                    // what GMD actually receives
  return { base:b, vat, gross, ewt, netReceivable };
};
const todayL= new Date().toLocaleDateString("en-PH",{year:"numeric",month:"long",day:"numeric"});
const uid=()=>crypto.randomUUID?crypto.randomUUID():"id-"+Date.now()+"-"+Math.random().toString(36).slice(2);

const KEYS={deals:"gmdv5:deals",projects:"gmdv5:projects",expenses:"gmdv5:expenses",inflows:"gmdv5:inflows",jos:"gmdv5:jos",swatches:"gmdv5:swatches",checklist:"gmdv5:checklist",role:"gmdv5:role",users:"gmdv5:users",session:"gmdv5:session",cashPos:"gmdv5:cashPos",prs:"gmdv5:prs",budgets:"gmdv5:budgets",mreqs:"gmdv5:mreqs",breqs:"gmdv5:breqs",addenda:"gmdv5:addenda",billings:"gmdv5:billings",vvip:"gmdv5:vvip",actlog:"gmdv5:actlog",pcards:"gmdv5:pcards",inventory:"gmdv5:inventory",stocklog:"gmdv5:stocklog",drfs:"gmdv5:drfs",botsettings:"gmdv5:botsettings",suppliers:"gmdv5:suppliers",subcons:"gmdv5:subcons",customclients:"gmdv5:customclients"};

// ─── SUPABASE FIELD MAPPERS ───────────────────────────────────────────────────
const drfToSb  =(r)=>({id:r.id,deal_id:r.dealId||null,drf_no:r.drfNo||'',client:r.client||'',location:r.location||'',designer:r.designer||'',design_deadline:r.designDeadline||null,project_title:r.projectTitle||'',type:r.type||'',size:r.size||'',description:r.description||'',accessories:r.accessories||[],ref_links:r.refLinks||[],notes:r.notes||'',approved_link:r.approvedLink||'',status:r.status||'New',created_by:r.createdBy||''});
const drfFromSb=(r)=>({...r,dealId:r.deal_id,drfNo:r.drf_no,designDeadline:r.design_deadline,projectTitle:r.project_title,refLinks:r.ref_links||[],approvedLink:r.approved_link,createdBy:r.created_by});
const invToSb  =(r)=>({id:r.id,code:r.code||'',name:r.name||'',category:r.category||'',sub_category:r.subCategory||'',brand:r.brand||'',supplier:r.supplier||'',unit:r.unit||'',unit_size:r.unitSize||'',location:r.location||'Main Warehouse',qty_on_hand:Number(r.qtyOnHand)||0,reorder_point:Number(r.reorderPoint)||0,last_purchase_price:Number(r.lastPurchasePrice)||0,avg_cost:Number(r.avgCost)||0,last_updated:r.lastUpdated||null,notes:r.notes||'',status:r.status||'Active',created_by:r.createdBy||''});
const invFromSb=(r)=>({...r,subCategory:r.sub_category,unitSize:r.unit_size,qtyOnHand:Number(r.qty_on_hand)||0,reorderPoint:Number(r.reorder_point)||0,lastPurchasePrice:Number(r.last_purchase_price)||0,avgCost:Number(r.avg_cost)||0,lastUpdated:r.last_updated,createdBy:r.created_by});
const moveToSb =(r)=>({id:r.id,item_id:r.itemId||null,move_type:r.moveType||'',qty:Number(r.qty)||0,unit_cost:Number(r.unitCost)||0,deal_id:r.dealId||null,notes:r.notes||'',date:r.date||null,recorded_by:r.recordedBy||''});
const moveFromSb=(r)=>({...r,itemId:r.item_id,moveType:r.move_type,unitCost:Number(r.unit_cost)||0,dealId:r.deal_id,recordedBy:r.recorded_by});
const supToSb=s=>({company_name:s.companyName||s.company_name||"",rating:s.rating||"",email:s.email||"",materials:s.materials||"",contact_nos:s.contactNos||s.contact_nos||"",contact_person:s.contactPerson||s.contact_person||"",payment_terms:s.paymentTerms||s.payment_terms||"",address:s.address||"",tin_no:s.tinNo||s.tin_no||"",notes:s.notes||"",status:s.status||"Active",created_by:s.createdBy||s.created_by||""});
const subconToSb=s=>({company_name:s.companyName||s.company_name||"",rating:s.rating||"",specialty:s.specialty||"",strengths_weaknesses:s.strengthsWeaknesses||s.strengths_weaknesses||"",contact_no:s.contactNo||s.contact_no||"",payment_terms:s.paymentTerms||s.payment_terms||"",address:s.address||"",remarks:s.remarks||"",rate_structure:s.rateStructure||s.rate_structure||"",payment_structure:s.paymentStructure||s.payment_structure||"",location_note:s.locationNote||s.location_note||"",notes:s.notes||"",status:s.status||"Active",created_by:s.createdBy||s.created_by||""});

// ─── PROCUREMENT CONSTANTS ────────────────────────────────────────────────────
const ADDENDUM_STATUSES = ["Discovered","Sales Notified","Client Coordinating","Approved","Billed","Collected","Rejected"];
const ADDENDUM_STATUS_CLR = {
  "Discovered":"#94a3b8",
  "Sales Notified":"#f59e0b",
  "Client Coordinating":"#3b82f6",
  "Approved":"#10b981",
  "Billed":"#8b5cf6",
  "Collected":"#059669",
  "Rejected":"#ef4444",
};
// ─── PROJECT CARD ─────────────────────────────────────────────────────────────
// ─── TURNAROUND TIME REFERENCE ────────────────────────────────────────────────
// Based on GMD Project Library benchmarks. Used as reference only — QS or
// Operations Director sets the actual target per project.
const TAT_REFERENCE = {
  "Fabrication / General": {
    "Kiosk / Modules / Activation":  { days:30,  note:"Simple modular builds" },
    "Signage Only":                   { days:15,  note:"Fabrication + delivery only" },
    "Fit-Out — Simple":               { days:35,  note:"Basic fit-out, limited scope" },
    "Fit-Out — Full Retail":          { days:45,  note:"Standard GMD retail interior" },
    "Fit-Out — Multi-Brand/Complex":  { days:60,  note:"Multiple brands or complex scope" },
    "Display Fixtures / POP":         { days:21,  note:"Fabrication + delivery" },
    "Custom Shelving / Cabinetry":    { days:30,  note:"Standard mill work" },
    "Other":                          { days:30,  note:"Estimate per scope" },
  },
  "Construction": {
    "F&B Fit-Out":                    { days:60,  note:"Includes MEP, exhaust, hood" },
    "Commercial — Light":             { days:60,  note:"Limited civil work" },
    "Commercial — Full":              { days:90,  note:"Full structural + MEP" },
    "Other":                          { days:60,  note:"Estimate per scope" },
  },
};

const DEPT_ORDER = ["Sales","Design","QS","Procurement","Operations","Finance"];
const DEPT_CLR   = {Sales:"#10b981",Design:"#8b5cf6",QS:"#f59e0b",Procurement:"#06b6d4",Operations:"#f97316",Finance:"#3b82f6"};

const DEFAULT_DEPT_TASKS = {
  Sales:[
    "CE/Contract signed by client OR PO received OR DP paid",
    "Comms group created (WhatsApp/Viber) with all stakeholders",
    "AE and PM assigned to project",
    "Sales Repository folder complete with all documents",
    "Client briefed on project timeline and process",
  ],
  Design:[
    "Design brief received from Sales AE",
    "Design proposal created and presented to client",
    "Client design approved (revisions complete)",
    "Production plans and shop drawings complete",
    "Signage plans complete",
    "Final revision number confirmed and locked",
    "Swatchboard provided to Procurement",
    "Renders finalized",
    "PMs and Coordinators briefed by Design",
    "Approved production drawings handed off to Operations (file link shared)",
  ],
  QS:[
    "Cost estimate (CE) prepared and submitted",
    "CE approved by client",
    "Budget target set in FabHub",
    "Procurement briefed on budget limits",
  ],
  Procurement:[
    "Swatchboard received from Design",
    "Suppliers sourced and quoted",
    "Purchase Orders issued and approved",
    "Material delivery dates confirmed",
    "All materials delivered to warehouse/site",
    "QC inspection completed on received materials",
    "Materials confirmed ready — Operations notified to begin fabrication",
  ],
  Operations:[
    "PM and Coordinators briefed by Design team",
    "Production drawings received and reviewed by PM (revision confirmed)",
    "All materials confirmed present and ready — fabrication cleared to start",
    "Fabrication / construction started",
    "Daily/weekly PM updates logged",
    "Site visits done and progress billed",
    "Installation complete",
    "Punchlist items fully resolved",
    "Client signs COC (Certificate of Completion)",
  ],
  Finance:[
    "50% Downpayment billed and collected",
    "Progress billing issued",
    "Final billing issued",
    "100% collection complete",
  ],
};

const emptyProjectCard=(dealId,dealData)=>({
  dealId,
  client:dealData?.client||"",
  ceNo:dealData?.ceNo||"",
  value:dealData?.value||0,
  createdAt:new Date().toISOString(),
  awardDate:dealData?.awardDate||today,
  targetDays:null,           // Set by QS or Operations Director
  targetEndDate:null,        // Calculated: awardDate + targetDays
  tatCategory:"",            // Project type used for reference
  tatSetBy:null,             // Who set the turnaround time
  tatSetAt:null,
  departments:Object.fromEntries(DEPT_ORDER.map(dept=>([dept,{
    done:false,
    doneAt:null,
    doneBy:null,
    tasks:DEFAULT_DEPT_TASKS[dept].map((t,i)=>({id:`${dept}-${i}`,text:t,done:false,doneAt:null,doneBy:null})),
  }]))),
});

// ─── INVENTORY CONSTANTS ──────────────────────────────────────────────────────
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
const STOCK_MOVE_TYPES = ["IN — Delivery","OUT — Used in Project","ADJUST — Stock Count","RETURN — Returned to Supplier"];

const emptyItem = ()=>({
  id:"", code:"", name:"", category:"Sheet Materials", subCategory:"Board / Panel",
  brand:"", supplier:"", unit:"sheets", unitSize:"", location:"Main Warehouse",
  qtyOnHand:0, reorderPoint:0,
  lastPurchasePrice:0, avgCost:0,
  lastUpdated:today, notes:"", status:"Active",
  createdAt:today, createdBy:"",
});

const nextItemCode=(items)=>{
  const nums=items.map(i=>parseInt((i.code||"").replace(/\D/g,""))||0);
  return"INV-"+String((nums.length?Math.max(...nums):0)+1).padStart(3,"0");
};

const BILLING_STATUSES = ["Draft","Sent to Client","Partially Paid","Fully Paid","Overdue","Cancelled"];
const BILLING_STATUS_CLR = {
  "Draft":"#94a3b8","Sent to Client":"#3b82f6",
  "Partially Paid":"#f59e0b","Fully Paid":"#059669",
  "Overdue":"#ef4444","Cancelled":"#475569",
};
const emptyMilestone=()=>({
  id:"",dealId:"",name:"",description:"",
  amount:0,invoiceNo:"",invoiceDate:"",dueDate:"",
  status:"Draft",payments:[],
  createdBy:"",createdDate:"",sentDate:"",
});
const MR_STATUSES  = ["Submitted","Reviewed","Converted to PR","Rejected"];
const BR_STATUSES  = ["Submitted","Under Review","Approved","Released","Rejected"];
const BR_PURPOSES  = ["Installation","Mobilization","Site Expenses","Equipment Rental","Permits & Fees","Labor Additional","Emergency","Other"];
const PR_STATUSES  = ["Draft","Pending Approval","PO Issued","Partially Delivered","Delivered","Cancelled"];
const PR_CATS      = ["Materials","Hardware","Fixtures","Signage","Electrical","Structural","Finishing","Tools & Equipment","Subcon","Other"];
const BUDGET_CATS  = ["Materials","Labor","Overhead","Subcon"];
const BUDGET_CAT_CLR = {Materials:"#3b82f6",Labor:"#10b981",Overhead:"#f59e0b",Subcon:"#8b5cf6"};

const emptyPR = () => ({
  id:"", projectId:"", projectName:"",
  itemName:"", category:"Materials", description:"",
  qty:1, unit:"pcs", estUnitCost:0, actUnitCost:0,
  supplier:"", poNumber:"", poDate:"",
  qtyDelivered:0, deliveryDate:"", deliveryNote:"",
  status:"Draft", requestedBy:"", approvedBy:"", approvedAt:"",
  budgetCategory:"Materials",  // which budget line this hits
  notes:"", createdDate:"",
});

const emptyBudget = () => ({
  Materials:0, Labor:0, Overhead:0, Subcon:0,
  notes:"", lockedAt:null,
});

// ─── GMD BANKS & CASH POSITION ───────────────────────────────────────────────
const BANKS = [
  { id:"bpi",      name:"Bank of Philippine Island",  short:"BPI",        color:"#dc2626", capital:false },
  { id:"metro",    name:"Metrobank",                  short:"Metrobank",   color:"#1d4ed8", capital:false },
  { id:"china",    name:"Chinabank",                  short:"Chinabank",   color:"#15803d", capital:false },
  { id:"bdo",      name:"Banco de Oro",               short:"BDO",         color:"#b45309", capital:false },
  { id:"security", name:"Security Bank",              short:"Security",    color:"#7c3aed", capital:false },
  { id:"union",    name:"Unionbank of the Philippines",short:"Unionbank",  color:"#0e7490", capital:true  }, // GMD Capital — excluded from working capital
];

const emptyBankRow = () => ({ beg:"", book:"", end:"" });
const emptyDayPosition = (date) => ({
  date,
  banks: Object.fromEntries(BANKS.map(b=>[b.id, emptyBankRow()])),
  collections: {         // auto-pulled + manual
    fabhubAmt: 0,        // auto from FabHub inflows
    manualAmt: "",       // manual adjustment
    manualNote: "",
  },
  less: {
    bizlink: "",
    checkFloat: "",
    otherNote: "",
    otherAmt: "",
  },
  ytd: {
    supplierPayable: "",
    loansPayable: "",
    accountsReceivable: "",
    expectedCollection: "",
  },
  notes: "",
  savedAt: null,
});

// ─── GMD PROACTIVE CHECKLIST TEMPLATE ────────────────────────────────────────
// Auto-loads when a project hits Stage 06 (Project Kickoff)
// Based on the 13-stage workflow + Action Planning Workshop mindset
const GMD_CHECKLIST_TEMPLATE = [
  // Stage 06 — Kickoff
  { type:"Task",           dept:"Sales",        title:"Create client comms group (WhatsApp/Viber)",     priority:"High",   notes:"Add all Sales + Ops stakeholders + client",           whatCouldGoWrong:"Client left out or wrong number added — confirm before sending first message" },
  { type:"Task",           dept:"Cost Control", title:"Issue 50% downpayment billing to client",         priority:"High",   notes:"Per agreed payment terms in signed CE",               whatCouldGoWrong:"Terms misremembered — always reference the signed CE before billing" },
  { type:"Task",           dept:"Operations",   title:"PM and Coordinators briefed on scope",            priority:"High",   notes:"PM reviews approved plans before production starts",  whatCouldGoWrong:"Production starts without reading approved plans — verify before Day 1" },
  // Stage 07 — Budget & Briefing
  { type:"Task",           dept:"Cost Control", title:"Cost Control creates project budget",             priority:"High",   notes:"Budget locked before any procurement begins",         whatCouldGoWrong:"Procurement buys before budget is set — nothing moves without approved budget" },
  { type:"Task",           dept:"Operations",   title:"Production lead briefed with full plans",         priority:"Normal", notes:"Confirm all plan revisions are final versions",        whatCouldGoWrong:"Old revision used — always check revision number on plans before briefing" },
  // Stage 08 — Fabrication
  { type:"Risk Flag",      dept:"Operations",   title:"Identify long-lead items that need early order",  priority:"Urgent", notes:"Glass, custom hardware, imported materials take longer",whatCouldGoWrong:"Ordered too late — check lead times on Day 1 of fabrication, not Day 30" },
  { type:"Purchase",       dept:"Procurement",  title:"All materials confirmed and scheduled for delivery",priority:"High", notes:"Confirm delivery dates align with production schedule", whatCouldGoWrong:"Material arrives late, stalling production — get written delivery commitments" },
  { type:"Task",           dept:"Operations",   title:"Daily PM update logged (or per client agreement)", priority:"Normal",notes:"Client frequency: daily or weekly depending on project",whatCouldGoWrong:"Update missed = client sends 'any update?' — never let this happen" },
  { type:"Risk Flag",      dept:"Operations",   title:"Flag any scope changes immediately as addenda",    priority:"High",  notes:"Coordinate with Sales before telling client any changes",whatCouldGoWrong:"Ops changes scope without telling Sales — client gets conflicting information" },
  // Modules
  { type:"Module",         dept:"Operations",   title:"Modules — confirm count, sizes, and specs",       priority:"High",  notes:"Cross-check against approved drawings",               whatCouldGoWrong:"Module count wrong on arrival — verify against PO and drawings before accepting delivery" },
  { type:"Module",         dept:"Operations",   title:"Module delivery to site confirmed",               priority:"High",  notes:"Coordinate hauling and site access",                  whatCouldGoWrong:"Truck arrives and site is locked — confirm access and contact person night before" },
  // Swatches
  { type:"Swatch",         dept:"Procurement",  title:"All material swatches approved by client",        priority:"High",  notes:"Client must approve finishes before fabrication starts",whatCouldGoWrong:"Wrong finish fabricated — no production without written client swatch approval" },
  { type:"Swatch",         dept:"Procurement",  title:"Swatch samples ordered and received",             priority:"Normal",notes:"Allow lead time — order swatches at Stage 04",         whatCouldGoWrong:"Swatch not yet arrived when fabrication starts — order early, not at kickoff" },
  // Stage 09 — Site Visit & Progress Billing
  { type:"Site Visit",     dept:"Operations",   title:"Mid-project client site visit scheduled",         priority:"Normal", notes:"Show progress, set expectations, build trust",        whatCouldGoWrong:"Client surprised by progress level — set expectations before the visit" },
  { type:"Task",           dept:"Cost Control", title:"Progress billing issued per payment terms",       priority:"High",  notes:"Don't wait for client to ask — bill on time",          whatCouldGoWrong:"Billing delayed, cash flow suffers — set a billing date at project start" },
  // Permits
  { type:"Permit",         dept:"Operations",   title:"All mall/site permits secured before installation",priority:"High", notes:"CARI, DPWH, building admin — confirm requirements",   whatCouldGoWrong:"Installation day arrives with no permit — apply at kickoff, not the week before" },
  // Stage 11 — Punchlist
  { type:"Task",           dept:"Operations",   title:"Punchlist documented and signed by PM + client",  priority:"High",  notes:"All items listed before leaving site",                whatCouldGoWrong:"Verbal punchlist forgotten — always get written sign-off on site" },
  { type:"Client Approval",dept:"Sales",        title:"Client signs delivery receipt",                   priority:"High",  notes:"No signature = no handover",                          whatCouldGoWrong:"Client refuses to sign — escalate to Paolo/Paulo immediately" },
  // Stage 12 — Close-Out
  { type:"Task",           dept:"Operations",   title:"PM creates COC and close-out report",             priority:"High",  notes:"Include all addenda, punchlist resolved, final specs", whatCouldGoWrong:"COC missing details — review against original scope before submitting" },
  { type:"Task",           dept:"Cost Control", title:"Final billing issued to client",                  priority:"High",  notes:"Full remaining balance",                              whatCouldGoWrong:"Balance not collected — escalate if not paid within agreed terms" },
  // Stage 13 — Feedback
  { type:"Task",           dept:"Sales",        title:"Request client feedback (score + testimonial)",   priority:"Normal",notes:"Log in FabHub — Stage 13",                            whatCouldGoWrong:"Feedback never collected — ask within 1 week of close-out, not months later" },
];

// ─── GMD CLIENT DIRECTORY ────────────────────────────────────────────────────
const GMD_CLIENTS = [
  {name:"ADARNA HOUSE, INC", email:"karen@adarna.com.ph"},
  {name:"Adm-Indicia", email:"Akzel.Balingit@adm-indicia.com"},
  {name:"Adpro-4Acoustic", email:"angelobernardino@gmail.com"},
  {name:"Agile Technologies"},
  {name:"Ale Dela Paz", email:"ale@degsters.com"},
  {name:"Alexandra Mascenon", email:"helloscenstudio@gmail.com"},
  {name:"ALLIED VISION CONCEPTS INC.", city:"TAGUIG CITY"},
  {name:"Altitude Digital", email:"sadam.tejol@ati.ph"},
  {name:"Amen Jewelry"},
  {name:"Anna Narvasa"},
  {name:"Ar. Johnny Bumanlag"},
  {name:"Argia Global Link Inc"},
  {name:"Avita Philippines"},
  {name:"Bang Muay Thai Philippines Inc.", city:"Makati"},
  {name:"Bao Asia Corporation", email:"acdcobankiat14@gmail.com"},
  {name:"Being Juice"},
  {name:"Big Bark"},
  {name:"Blanc Nue"},
  {name:"Bounce Marketing Inc", email:"lizzie@fivestorygroup.com"},
  {name:"Buena Rich Commissarry Corporation", email:"victorb@buenarich.com"},
  {name:"BUKO JUAN"},
  {name:"Catalytx Advertising Inc.", email:"a_butas@catalytx.com"},
  {name:"CDO Foodsphere Inc", email:"mariz.manahan@cdo.com.ph"},
  {name:"Cebuana Lhuillier"},
  {name:"Chris Sports"},
  {name:"Christine Victorio"},
  {name:"Collecticons Inc.", email:"eric_cabochan@yahoo.com"},
  {name:"Concepcion-Carrier Airconditioning Company", email:"rmandigma@ccac.com.ph", city:"Muntinlupa City,"},
  {name:"Creat8 Stories Inc.", email:"ryz@creat8stories.com", city:"Taguig City"},
  {name:"CREAT8 STORIES INC.,", email:"francinetobias@hedrinventures.com"},
  {name:"Crusty Carb Corp."},
  {name:"CTV Inc"},
  {name:"D.Estrellas's Kitchen Food Services", email:"dbbonifacio.dekfs@gmail.com"},
  {name:"Daliretail Inc"},
  {name:"Diageo PH"},
  {name:"Diageo Scotland Limited", email:"Lhen.Javier@diageo.com"},
  {name:"Disteleria Limtuaco Co"},
  {name:"Dizon Farms"},
  {name:"Dot Coffee"},
  {name:"Dragonfly"},
  {name:"DUTY FREE PHILIPPINES"},
  {name:"Eirin Jewelry"},
  {name:"Elinora", email:"shop.elinora@gmail.com"},
  {name:"Elsal Venture OPC"},
  {name:"Emequinne Sarza (Ms)"},
  {name:"Envirolyte"},
  {name:"ESV International Corporation"},
  {name:"Events100"},
  {name:"Ever New", email:"pusha.amin@bhagis.com"},
  {name:"Every Wear Retail Inc"},
  {name:"Excellence Appliance Technologies, Inc."},
  {name:"Excellence Technology", email:"kprago@extech.com"},
  {name:"Experience by Maika Cruz"},
  {name:"F Optics"},
  {name:"FCOY 15 Trading Corp.", email:"mktgpina.meah@gmail.com"},
  {name:"Finden Technologies Inc.", email:"msanpedro@finden.com.ph"},
  {name:"Firefly Electric & Lighting Corporation", email:"nyl.mendoza@fireflyelectric.com"},
  {name:"Five Sips and Swallows Inc", email:"fivesipsandswallowsinc@gmail.com", balance:40000.0},
  {name:"Flipbox Events"},
  {name:"Floret - Pam Lopez"},
  {name:"Foptics Philippines, Inc", email:"ray@foptics.club"},
  {name:"Forthinker Inc"},
  {name:"Frameline"},
  {name:"FRUITS & DAIRY SOMMELIER INC"},
  {name:"Fruits & Dairy Sommelier Inc"},
  {name:"FUJIFILM Philippines, Inc."},
  {name:"Ganesh Import & Export Inc"},
  {name:"Gattech Supply and Engineering"},
  {name:"GDGT Trading", email:"noel@gdgttrading.com"},
  {name:"General Heat Corporation", email:"rjocson@generalheat.com.ph"},
  {name:"Genson Distribution Inc.", email:"kimloja888@genson.ph"},
  {name:"Gilbert Tang", email:"Gilbert.tang@chrissports.com"},
  {name:"GLOBAL SEED SELECTIONS INC", email:"cycabardo@dizonfarms.net"},
  {name:"GMD Productions Inc.", email:"salesteam@gmd.ph"},
  {name:"GNY Global Sourcing Corp", email:"linfred.yap@stylerightglobal.com"},
  {name:"Go Rapid Active Marketing Inc"},
  {name:"Gryn Collective"},
  {name:"Hansman International Opc.", email:"louisepatriciamariano@gmail.com", city:"Valenzuela"},
  {name:"Happy Hands Clinic", city:"Mandaluyong"},
  {name:"HBH&HND Food Corporation"},
  {name:"Holcim Philippines Inc."},
  {name:"HOS CORPORATION", email:"mcasquete@mrktbingo.com"},
  {name:"Icon Worldwide Inc.", email:"ronaldutan@gmail.com"},
  {name:"Ideal Vision"},
  {name:"iMaz Corp", email:"kim@imazcorp.com"},
  {name:"Innovator"},
  {name:"Innovention Food Resources Inc."},
  {name:"Ivory Tree Inc.", email:"nicolenocom@gmail.com", city:"Quezon City", balance:2611200.0},
  {name:"Jameson Ong"},
  {name:"JBsy Food and Beverage", email:"boldstar72@yahoo.com"},
  {name:"JC Mahusay", email:"jcmahusay16@gmail.com"},
  {name:"Jen De Jesus", email:"jmdejesus@elcielitohotels.com"},
  {name:"Josel Jalique"},
  {name:"Juan Francisco Soriano", email:"jakemsoriano@gmail.com"},
  {name:"Keydesign, inc", email:"Designs@keydesign.com.ph"},
  {name:"Kiko Milano"},
  {name:"KLN Food Services"},
  {name:"Kumori PH", email:"levi.agustin@relish-group.com"},
  {name:"Kyla Genato", email:"kyla.genato@vibelle.com"},
  {name:"Laureen Arancon"},
  {name:"Lawrence Lua"},
  {name:"Leap & Learn Manila"},
  {name:"Limitless Group Co."},
  {name:"Limitless Group of Co"},
  {name:"Lucky Win Food Corporation"},
  {name:"Lulu He"},
  {name:"Lulu Ignacio"},
  {name:"Luvera Philippines"},
  {name:"Luxasia Inc"},
  {name:"LUXE CELEBRATIONS INC"},
  {name:"Luxuriant Automotive Group Inc"},
  {name:"Machi Machi", email:"e.lao@artan.com.ph"},
  {name:"Manila Creamery"},
  {name:"Manta Equities", email:"roy.ferdez@mantaequities.com"},
  {name:"Mar Oscar B. Mungcal", email:"mar.mungcal@gmd.ph"},
  {name:"Mariel Gatan"},
  {name:"Max's Group Inc", email:"carevalo@maxsgroupinc.com"},
  {name:"Maxicare Healthcare Corporation", email:"mark.darsantos@maxicare.com.ph"},
  {name:"Maybel De Leon", email:"maybel.deleon@rbu.com.ph"},
  {name:"Melissa Basit"},
  {name:"Metro Promo Concepts", email:"joshua@mpc.ph"},
  {name:"Mineski Global", email:"fatima.flores@mineskiglobal.com", city:"San Juan"},
  {name:"Moibuen Marketing Solutions", email:"moibuenmarketingsolutions@gmail.com"},
  {name:"Montari Builders"},
  {name:"More Coffee"},
  {name:"Motoitalia"},
  {name:"Mr. Jose Alexander Subido"},
  {name:"Mr. Stewart Lee Ong"},
  {name:"Mrs. Regine Laguyo", email:"regine@vtlaguyo.com"},
  {name:"Newtrends International Corporation", email:"daniella.camias@newtrends.ph", city:"Bacoor", balance:240000.0},
  {name:"Nicolo Villasenor", email:"fivesipsandswallowsinc@gmail.com", city:"Pasig City"},
  {name:"Nito's International Ventures, Inc", email:"ltan@highleap.com.ph"},
  {name:"Nu Star Mall"},
  {name:"Nuvie Inc.", email:"nuvie.inc@gmail.com"},
  {name:"Olympia Ventures Inc.", email:"Olympiaventuresinc@gmail.com, theresechelsea1@gmail.com"},
  {name:"Panco Coffee"},
  {name:"Paulo Miguel Garcia"},
  {name:"Payday Ph", email:"rai@escale.ph"},
  {name:"Peachy Divina"},
  {name:"Penny Pairs"},
  {name:"Penser Q", email:"orazonpagsibigan@penserq.com"},
  {name:"Permatology Philippines"},
  {name:"Pharma Revolution Incorporated", email:"sab@pharmarev.biz, venice@pharmarev.biz, emman.delacruz@pharmarev.biz, ER@qubel.org"},
  {name:"Philippine Football Federation", email:"procurement@futsalph.com"},
  {name:"Photonergy", phone:"945885894.0"},
  {name:"Picky Purveyors Corp.", email:"danella@pickypurveyors.co"},
  {name:"Pinkberry", email:"gtiangco@essi.ph"},
  {name:"Pino Studio"},
  {name:"Pj Lhuillier Inc", email:"eateodoro@pjlhuillier.com"},
  {name:"Popmart Ph Trading Corporation", email:"anne.lastrilla@popmart.com", city:"Taguig City"},
  {name:"Premier Food Choice International Corporation"},
  {name:"Prestige Brands Philippines, Inc.", email:"heidi.organo@prestigegrp.co", city:"Makati"},
  {name:"PRIMER GROUP OF COMPANIES"},
  {name:"Regent Distributor Phils. Inc", email:"justin.panibio@regent-trg.com"},
  {name:"Renegade Folk"},
  {name:"Reytech Construction & Development Corp", email:"efalculan@reytech.ph"},
  {name:"Reytech Construction & Development Corp.", email:"rramos@reytech.ph"},
  {name:"RG Meditron Inc", email:"ppabad@rgmed.ph"},
  {name:"Robinsons Handyman Inc."},
  {name:"Ronald Quintans"},
  {name:"Run Rabbit Run"},
  {name:"RUNWAYONE RETAIL CORP"},
  {name:"Rustan Marketing Corporation", email:"cudelfin@rgoc.com.ph"},
  {name:"Ruth Aurelle", city:"Makati City"},
  {name:"Salted Babes"},
  {name:"Salty Babes"},
  {name:"Sanibeaute"},
  {name:"Sapphire Carnation Leisure and Recreation Corp.", city:"Pasay City"},
  {name:"Savior Medevices Inc", email:"ks_espinosa@saviourmedevices.com"},
  {name:"Scottland Food Group Corporation"},
  {name:"Senyor Sio", email:"paulo.garcia@gmd.ph"},
  {name:"Shop Callie", email:"shop.callie@gmail.com"},
  {name:"Showroom7 Inc", email:"a.chua.anthem@gmail.com"},
  {name:"Skygo Group of Companies", email:"mcaballero@skygo.com.ph"},
  {name:"SM Development Corporation"},
  {name:"Specialty Lifestyle Concept, Inc.", email:"mrdelossantos@rgoc.com.ph"},
  {name:"St. Ali Coffee"},
  {name:"Star Eye Corp"},
  {name:"Starbucks Coffee"},
  {name:"Sto. Niño De Cebu", email:"ltan@highleap.com.ph"},
  {name:"Stores Specialists, Inc", email:"atsarmiento@rgoc.com.ph"},
  {name:"Stroca Inc.", email:"jpramirez.strocainc@gmail.com"},
  {name:"Studio Mara"},
  {name:"SUPERBING CORP"},
  {name:"Texturia"},
  {name:"TGMCO"},
  {name:"Timeplus Corporation", email:"richmond.dy85@gmail.com"},
  {name:"Tin Santos"},
  {name:"Tinette Capistrano"},
  {name:"TOPTEN10 PH", email:"tanhuancoandaluz@gmail.com"},
  {name:"Toyo Corporation", email:"nicca.singanon@foodeology.com.ph", city:"Makati City"},
  {name:"Vanity Couture Corp"},
  {name:"Verite Pawn Corp"},
  {name:"Veronica Ong", email:"nferdo.ong@gmail.com"},
  {name:"Virginia Nicodemus"},
  {name:"Vitamin Marketing Services"},
  {name:"Viva Foods", email:"jstan@viva.com.ph"},
  {name:"Viva International Foods and Restaurant Inc", email:"jruda@viva.com.ph"},
  {name:"Vogue Concepts Inc.", email:"peter.cabrera@vogueconcepts.com"},
  {name:"Warner Bros. Discovery", email:"ennelyn.Mortillero@wbd.com"},
  {name:"Watsons SMDS Marikina- ID TOWER"},
  {name:"Wave Creative Group"},
  {name:"WHITEPLANE INC.", email:"NielsonPhilip.R.Corres@wpi.ph"},
  {name:"Yellow House Inc"},
  {name:"Yobo International Food Corp.", email:"Fergus.siasat@trimarkholdings.net", city:"Taguig"},
  {name:"Yuan Dumandan", email:"yuandumandan@gmail.com", city:"Marikina city"},
  {name:"Zephyre Group Inc.", email:"bizops.zephyre@gmail.com"},
];

// ─── DEFAULT ACCOUNTS ─────────────────────────────────────────────────────────
// Simple hash — not cryptographic, just obfuscation for an internal tool
const hashPw = pw => btoa(pw + ":gmd-salt-2026").split("").reverse().join("");
const checkPw = (pw, hash) => hashPw(pw) === hash;

const DEFAULT_USERS = [
  // ── Owners / Management ──────────────────────────────────────────────────
  { id:"u01", name:"Paulo Garcia", title:"CEO",       username:"paulo",    passwordHash:hashPw("GMD2026!"),   role:"Manager",      status:"active", createdAt:today },
  { id:"u02", name:"Mar Mungcal", title:"COO",        username:"mar",      passwordHash:hashPw("GMD2026!"),   role:"Manager",      status:"active", createdAt:today },
  // ── Operations ───────────────────────────────────────────────────────────
  { id:"u03", name:"Arrius Catubay", title:"Operations Director",     username:"arrius",   passwordHash:hashPw("GMD2026!"),   role:"Manager",      status:"active", createdAt:today },
  { id:"u04", name:"Ryon Santiago",      username:"ryon",     passwordHash:hashPw("GMD2026!"),   role:"ProjectMover",   status:"active", createdAt:today },
  { id:"u05", name:"David Melendez",     username:"david",    passwordHash:hashPw("GMD2026!"),   role:"ProjectMover",   status:"active", createdAt:today },
  { id:"u06", name:"Jay Bernardo",       username:"jay",      passwordHash:hashPw("GMD2026!"),   role:"ProjectMover",   status:"active", createdAt:today },
  { id:"u07", name:"Angelo Nogra",       username:"angelo",   passwordHash:hashPw("GMD2026!"),   role:"ProjectMover",   status:"active", createdAt:today },
  { id:"u08", name:"Arvin Jaca",         username:"arvin",    passwordHash:hashPw("GMD2026!"),   role:"ProjectMover",   status:"active", createdAt:today },
  { id:"u09", name:"Jessie Singun",      username:"jessie",   passwordHash:hashPw("GMD2026!"),   role:"ProjectMover",   status:"active", createdAt:today },
  { id:"u10", name:"Anthony Nogra",      username:"thony",  passwordHash:hashPw("GMD2026!"),   role:"ProjectMover",   status:"active", createdAt:today },
  { id:"u11", name:"Steve Jazmin",       username:"steve",    passwordHash:hashPw("GMD2026!"),   role:"ProjectMover",   status:"active", createdAt:today },
  // ── Sales ─────────────────────────────────────────────────────────────────
  { id:"u12", name:"Paolo Gomez", title:"Sales Manager",        username:"paolo",    passwordHash:hashPw("GMD2026!"),   role:"Manager",      status:"active", createdAt:today },
  { id:"u13", name:"Jena De Asis",       username:"jena",     passwordHash:hashPw("Sales2026!"), role:"Sales",        status:"active", createdAt:today },
  { id:"u14", name:"Don Wyn Celmar",     username:"wyn",      passwordHash:hashPw("Sales2026!"), role:"Sales",        status:"active", createdAt:today },
  { id:"u15", name:"April Gail De Ello", username:"gail",     passwordHash:hashPw("Sales2026!"), role:"Sales",        status:"active", createdAt:today },
  // ── Cost Control ──────────────────────────────────────────────────────────
  { id:"u16", name:"Aerwin Del Rosario", username:"aerwin",   passwordHash:hashPw("GMD2026!"),   role:"Finance",      status:"active", createdAt:today },
  { id:"u17", name:"Marian Prile",       username:"marian",   passwordHash:hashPw("GMD2026!"),   role:"Procurement",  status:"active", createdAt:today },
  // ── QS / Cost Estimator ───────────────────────────────────────────────────
  { id:"u23", name:"Rodney",             username:"rodney",   passwordHash:hashPw("GMD2026!"),   role:"QS",           status:"active", createdAt:today },
  // ── Warehouse ─────────────────────────────────────────────────────────────
  { id:"u24", name:"Warehouse",          username:"warehouse",passwordHash:hashPw("GMD2026!"),   role:"Warehouse",    status:"active", createdAt:today },
  // ── Design ────────────────────────────────────────────────────────────────
  { id:"u18", name:"Gab Florita",        username:"gab",      passwordHash:hashPw("GMD2026!"),   role:"Design",       status:"active", createdAt:today },
  { id:"u19", name:"Miaa Villoria",      username:"miaa",     passwordHash:hashPw("GMD2026!"),   role:"Design",       status:"active", createdAt:today },
  { id:"u20", name:"Miel Vidallo",       username:"miel",     passwordHash:hashPw("GMD2026!"),   role:"Design",       status:"active", createdAt:today },
  { id:"u21", name:"Adrian Adriano",     username:"adrian",   passwordHash:hashPw("GMD2026!"),   role:"Design",       status:"active", createdAt:today },
  { id:"u22", name:"Tisha Leyva",        username:"tisha",    passwordHash:hashPw("GMD2026!"),   role:"Design",       status:"active", createdAt:today },
];

// ─── SEED DATA ────────────────────────────────────────────────────────────────
const mkDesign=(status="Briefing",designer="",type="in-house",dueDate="",link="",notes="")=>({
  status,designer,designerType:type,dueDate,link,notes,revisionNo:"",
  statusHistory:[{status,date:today,by:"System"}],deliverables:[]
});
const SEED_DEALS=[];
const SEED_PROJECTS={};
const SEED_EXP=[];
const SEED_INF=[];

const SEED_SWATCHES=[];
const SEED_CHECKLIST=[];

const emptyDeal={
  // Core
  client:"",product:"Custom Shelving",value:"",stage:"01 · BizDev",
  probability:10,contact:"",followUp:"",notes:"",priority:"Normal",
  // Payment
  invoiced:"",amountPaid:"",paymentStatus:"Unpaid",dueDate:"",discount:0,
  progressBilled:0,progressPaid:0,finalBilled:0,finalPaid:0,
  // GMD fields
  ceNo:"",ceType:"Fabrication / General",salesOwner:"",dateAcquired:today,
  assignedAE:"",bizDevSource:"",
  // File links (Drive + FabHub)
  salesRepoLink:"",proposalFolderLink:"",salesRepoNote:"",
  // Design Request (inline DRF)
  designRequestDate:"",designRequestNote:"",designApprovalDate:"",
  drfProjectTitle:"",drfType:DRF_TYPES[0],drfSize:"",drfDescription:"",drfAccessories:[],drfRefLinks:["","",""],drfDeadline:"",drfDesigner:"",drfNotes:"",
  // Comms
  commsGroup:"",commsGroupLink:"",
  // Addenda
  addenda:[],
  // Feedback
  clientFeedback:"",feedbackDate:"",feedbackScore:"",
};
const emptyProject=()=>({
  currentStage:"Design",
  progress:{Design:0,Fabrication:0,QC:0,Delivery:0,Installation:0,Punchlist:0},
  stageDates:{Design:{s:"",e:""},Fabrication:{s:"",e:""},QC:{s:"",e:""},Delivery:{s:"",e:""},Installation:{s:"",e:""},Punchlist:{s:"",e:""}},
  team:[],pmAssigned:"",coordinatorAssigned:"",
  materials:[],laborCost:0,overhead:0,notes:"",
  design:mkDesign(),
  // Budget (Cost Control)
  budgetCreated:false,budgetLink:"",budgetNotes:"",
  // COC
  cocCreated:false,cocDate:"",cocLink:"",
  // PM Updates
  pmUpdates:[],
  // Addenda
  addenda:[],
});

// ─── UI ATOMS ─────────────────────────────────────────────────────────────────
const Badge=({label,color})=>(
  <span style={{display:"inline-block",padding:"3px 10px",borderRadius:20,background:color+"18",color,fontSize:".72rem",fontWeight:700,border:`1px solid ${color}33`,whiteSpace:"nowrap"}}>{label}</span>
);
const Btn=({children,onClick,variant="primary",small,full,disabled,type="button"})=>{
  const styles={
    primary:{bg:"#1e293b",color:"#fff",border:"none"},
    ghost:{bg:"transparent",color:"#64748b",border:"1.5px solid #cbd5e1"},
    danger:{bg:"#fef2f2",color:"#ef4444",border:"1.5px solid #fca5a5"},
    green:{bg:"#f0fdf4",color:"#059669",border:"1.5px solid #6ee7b7"},
    accent:{bg:"#eff6ff",color:"#3b82f6",border:"1.5px solid #93c5fd"},
  }[variant]||{bg:"#1e293b",color:"#fff",border:"none"};
  return(
    <button type={type} onClick={onClick} disabled={disabled} style={{background:disabled?"#f1f5f9":styles.bg,color:disabled?"#94a3b8":styles.color,border:styles.border,borderRadius:8,padding:small?"5px 12px":"9px 18px",fontFamily:"inherit",fontWeight:600,fontSize:small?".76rem":".84rem",cursor:disabled?"not-allowed":"pointer",width:full?"100%":"auto",transition:"opacity .15s,box-shadow .15s",whiteSpace:"nowrap"}}
      onMouseEnter={e=>{if(!disabled)e.currentTarget.style.opacity=".85";}}
      onMouseLeave={e=>{e.currentTarget.style.opacity="1";}}>
      {children}
    </button>
  );
};
const Inp=({value,onChange,type="text",placeholder,min,max,readOnly,rows,style:sx})=>{
  // Using key+defaultValue pattern — safest focus fix, no hooks needed
  const base={width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"10px 13px",fontFamily:"inherit",fontSize:".87rem",color:"#1e293b",background:readOnly?"#f8fafc":"#fff",boxSizing:"border-box",transition:"border-color .15s",...(sx||{})};
  if(rows) return <textarea value={value||""} onChange={onChange} placeholder={placeholder} rows={rows} style={{...base,resize:"vertical"}}/>;
  return <input type={type} value={value||""} onChange={onChange} placeholder={placeholder} min={min} max={max} readOnly={readOnly} style={base}/>;
};
// Currency input — shows commas when not focused, strips on focus
const CurrInp=({value,onChange,placeholder="0.00",style:sx={}})=>{
  const fmt=v=>{
    const n=Number(String(v).replace(/,/g,""))||0;
    if(!n&&n!==0) return "";
    return n.toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2});
  };
  const strip=v=>String(v).replace(/,/g,"");
  const[display,setDisplay]=useState(value?fmt(value):"");
  const prev=useRef(value);
  useEffect(()=>{
    if(prev.current!==value){setDisplay(value?fmt(value):"");prev.current=value;}
  },[value]);
  const base={textAlign:"right",border:"1.5px solid #e2e8f0",borderRadius:6,padding:"6px 10px",fontFamily:"inherit",fontSize:".85rem",color:"#0f172a",background:"#fff",width:"100%",boxSizing:"border-box",outline:"none",...(sx||{})};
  return(
    <input
      type="text"
      value={display}
      onChange={e=>setDisplay(e.target.value)}
      onFocus={e=>{const raw=strip(e.target.value);setDisplay(raw);e.target.select();}}
      onBlur={e=>{
        const raw=strip(e.target.value);
        const formatted=raw?fmt(raw):"";
        setDisplay(formatted);
        onChange&&onChange({target:{value:raw}});
      }}
      placeholder={placeholder}
      style={base}
    />
  );
};

const Sel=({value,onChange,children})=>(
  <select value={value} onChange={onChange} style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"10px 13px",fontFamily:"inherit",fontSize:".87rem",color:"#1e293b",background:"#fff",boxSizing:"border-box",cursor:"pointer"}}>
    {children}
  </select>
);
// Focus-safe raw input — use this instead of bare <input> inside forms
const FInp=({value,onChange,type="text",placeholder,style:sx={},className,onKeyDown,min,max,rows})=>{
  const base={...sx};
  if(rows) return <textarea value={value||""} onChange={onChange} placeholder={placeholder} rows={rows} className={className} style={base}/>;
  return <input type={type} value={value||""} onChange={onChange} onKeyDown={onKeyDown} placeholder={placeholder} min={min} max={max} className={className} style={base}/>;
};
const Fld=({label,required,children,hint})=>(
  <div style={{marginBottom:16}}>
    <label style={{display:"block",fontSize:".72rem",fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:".8px",marginBottom:6}}>
      {label}{required&&<span style={{color:"#ef4444",marginLeft:2}}>*</span>}
    </label>
    {children}
    {hint&&<div style={{fontSize:".7rem",color:"#94a3b8",marginTop:4}}>{hint}</div>}
  </div>
);
const Card=({children,onClick,accent,style:sx={}})=>(
  <div onClick={onClick} style={{background:"#fff",borderRadius:14,border:`1.5px solid ${accent||"#e2e8f0"}`,padding:20,marginBottom:12,cursor:onClick?"pointer":"default",boxShadow:"0 1px 6px rgba(0,0,0,.05)",transition:"box-shadow .15s,border-color .15s",...sx}}
    onMouseEnter={e=>{if(onClick){e.currentTarget.style.boxShadow="0 6px 20px rgba(0,0,0,.1)";e.currentTarget.style.borderColor=accent||"#94a3b8";}}}
    onMouseLeave={e=>{if(onClick){e.currentTarget.style.boxShadow="0 1px 6px rgba(0,0,0,.05)";e.currentTarget.style.borderColor=accent||"#e2e8f0";}}}>
    {children}
  </div>
);
const Modal=({open,onClose,title,children,wide})=>{
  if(!open) return null;
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,.5)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onClose}>
      <div style={{background:"#fff",borderRadius:18,padding:28,width:"100%",maxWidth:wide?640:480,maxHeight:"94vh",overflowY:"auto",boxShadow:"0 24px 80px rgba(0,0,0,.2)"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:22}}>
          <div style={{fontWeight:800,fontSize:"1.1rem",color:"#0f172a"}}>{title}</div>
          <button onClick={onClose} style={{background:"#f1f5f9",border:"none",borderRadius:8,width:32,height:32,cursor:"pointer",color:"#64748b",fontSize:"1rem",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
};
const KPI=({label,value,color,sub,small})=>(
  <div style={{background:"#fff",borderRadius:12,padding:small?"14px 16px":"18px 20px",border:"1.5px solid #e2e8f0",boxShadow:"0 1px 4px rgba(0,0,0,.04)"}}>
    <div style={{fontSize:small?"1.2rem":"1.55rem",fontWeight:800,color,fontFamily:"'Barlow Condensed',sans-serif",lineHeight:1}}>{value}</div>
    {sub&&<div style={{fontSize:".7rem",color,marginTop:3,opacity:.75}}>{sub}</div>}
    <div style={{fontSize:".65rem",textTransform:"uppercase",letterSpacing:"1px",color:"#94a3b8",marginTop:7}}>{label}</div>
  </div>
);
const ProgBar=({pct,color,h=6})=>(
  <div style={{height:h,background:"#f1f5f9",borderRadius:h/2,overflow:"hidden"}}>
    <div style={{height:"100%",width:Math.min(pct||0,100)+"%",background:color,borderRadius:h/2,transition:"width .5s"}}/>
  </div>
);
// ─── TOAST NOTIFICATION SYSTEM ────────────────────────────────────────────────
let _toastListeners=[];
const toastEmit=(msg,type="success",duration=3500)=>{
  const id=Date.now()+Math.random();
  _toastListeners.forEach(fn=>fn({id,msg,type,duration}));
};
function Toaster(){
  const[toasts,setToasts]=useState([]);
  useEffect(()=>{
    const handler=t=>{
      setToasts(p=>[...p,t]);
      setTimeout(()=>setToasts(p=>p.filter(x=>x.id!==t.id)),t.duration||3500);
    };
    _toastListeners.push(handler);
    return()=>{_toastListeners=_toastListeners.filter(f=>f!==handler);};
  },[]);
  if(!toasts.length) return null;
  const TYPE_STYLE={
    success:{bg:"#f0fdf4",border:"#6ee7b7",color:"#059669",icon:"✅"},
    error:  {bg:"#fef2f2",border:"#fca5a5",color:"#dc2626",icon:"❌"},
    warning:{bg:"#fffbeb",border:"#fde68a",color:"#92400e",icon:"⚠️"},
    info:   {bg:"#eff6ff",border:"#93c5fd",color:"#1d4ed8",icon:"ℹ️"},
  };
  return(
    <div style={{position:"fixed",bottom:24,right:24,zIndex:9999,display:"flex",flexDirection:"column",gap:10,pointerEvents:"none"}}>
      {toasts.map(t=>{
        const s=TYPE_STYLE[t.type]||TYPE_STYLE.success;
        return(
          <div key={t.id} style={{background:s.bg,border:`1.5px solid ${s.border}`,borderRadius:12,padding:"12px 16px",boxShadow:"0 8px 24px rgba(0,0,0,.12)",maxWidth:360,display:"flex",gap:10,alignItems:"flex-start",animation:"fadein .2s ease",pointerEvents:"auto"}}>
            <span style={{fontSize:"1rem",flexShrink:0}}>{s.icon}</span>
            <span style={{fontSize:".85rem",color:s.color,fontWeight:600,lineHeight:1.45}}>{t.msg}</span>
          </div>
        );
      })}
    </div>
  );
}
const SecHead=({title,action,sub})=>(
  <div style={{marginBottom:16}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <h2 style={{margin:0,fontSize:"1.1rem",fontWeight:800,color:"#0f172a"}}>{title}</h2>
      {action}
    </div>
    {sub&&<div style={{fontSize:".78rem",color:"#64748b",marginTop:3}}>{sub}</div>}
  </div>
);
const EmptyState=({icon,msg})=>(
  <div style={{textAlign:"center",padding:"36px 24px",color:"#94a3b8"}}>
    <div style={{fontSize:"2rem",marginBottom:8}}>{icon}</div>
    <div style={{fontSize:".88rem"}}>{msg}</div>
  </div>
);

// ─── COLLECTIONS COMPONENT (shared by Sales & Finance) ────────────────────────
function CollectionsPanel({wonDeals,infs,onUpdatePayment,onLogPayment,readonly=false}){
  const[logModal,setLogModal]=useState(false);
  const[logForm,setLogForm]=useState({dealId:"",amount:"",note:"",date:today});

  const totalInvoiced=wonDeals.reduce((s,d)=>s+d.invoiced,0);
  const totalCollected=wonDeals.reduce((s,d)=>s+d.amountPaid,0);
  const totalOut=totalInvoiced-totalCollected;
  const overdue=wonDeals.filter(d=>d.dueDate&&d.dueDate<today&&d.paymentStatus!=="Paid"&&d.paymentStatus!=="Deposited"&&d.invoiced>0);

  return(
    <div>
      {/* Summary KPIs */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:20}}>
        <KPI label="Total Invoiced"  value={fmtK(totalInvoiced)} color="#3b82f6"/>
        <KPI label="Total Collected" value={fmtK(totalCollected)} color="#059669"/>
        <KPI label="Outstanding"     value={fmtK(totalOut)}       color={totalOut>0?"#ef4444":"#059669"}/>
      </div>

      {/* Overdue alert */}
      {overdue.length>0&&(
        <div style={{background:"#fef2f2",border:"1.5px solid #fca5a5",borderRadius:12,padding:"14px 18px",marginBottom:16,display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:"1.2rem"}}>⚠️</span>
          <div>
            <div style={{fontWeight:700,color:"#dc2626",fontSize:".9rem"}}>{overdue.length} overdue account{overdue.length>1?"s":""}</div>
            <div style={{fontSize:".78rem",color:"#ef4444",marginTop:2}}>{overdue.map(d=>d.client).join(", ")}</div>
          </div>
        </div>
      )}

      <SecHead title="Client Collections" action={!readonly&&<Btn onClick={()=>setLogModal(true)}>+ Log Payment</Btn>}/>

      {wonDeals.filter(d=>d.invoiced>0).map(d=>{
        const bal=d.invoiced-d.amountPaid;
        const od=d.dueDate&&d.dueDate<today&&d.paymentStatus!=="Paid";
        const pct=d.invoiced>0?Math.round(d.amountPaid/d.invoiced*100):0;
        return(
          <Card key={d.id} accent={od?"#fca5a5":bal===0?"#6ee7b7":undefined}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:180}}>
                <div style={{fontWeight:700,color:"#0f172a",fontSize:".98rem"}}>{d.client}</div>
                <div style={{fontSize:".76rem",color:"#64748b",marginTop:3}}>{d.product}</div>
                <div style={{marginTop:10,marginBottom:4}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:".7rem",color:"#94a3b8",marginBottom:4}}>
                    <span>{fmt(d.amountPaid)} collected of {fmt(d.invoiced)}</span>
                    <span style={{fontWeight:700,color:pct===100?"#059669":"#64748b"}}>{pct}%</span>
                  </div>
                  <ProgBar pct={pct} color={pct===100?"#059669":pct>0?"#10b981":"#e2e8f0"} h={8}/>
                </div>
                {d.dueDate&&<div style={{fontSize:".72rem",color:od?"#ef4444":"#94a3b8",marginTop:6}}>{od?"⚠ Overdue since":"Due:"} {d.dueDate}</div>}
              </div>
              <div style={{textAlign:"right",flexShrink:0}}>
                <div style={{fontWeight:800,fontSize:"1.1rem",color:bal===0?"#059669":"#ef4444"}}>{bal===0?"PAID":fmt(bal)+" due"}</div>
                <div style={{marginTop:8}}><Badge label={d.paymentStatus} color={PAY_CLR[d.paymentStatus]}/></div>
                {!readonly&&(
                  <div style={{marginTop:10}}>
                    <Sel value={d.paymentStatus} onChange={e=>onUpdatePayment(d.id,"paymentStatus",e.target.value)}>
                      {PAY_STATUS.map(s=><option key={s}>{s}</option>)}
                    </Sel>
                  </div>
                )}
              </div>
            </div>
          </Card>
        );
      })}

      {wonDeals.filter(d=>d.invoiced>0).length===0&&(
        <EmptyState icon="💳" msg="No invoiced projects yet. Invoice amounts are set when marking a deal as Won."/>
      )}

      {/* Log Payment Modal */}
      <Modal open={logModal} onClose={()=>setLogModal(false)} title="Log Payment Received">
        <Fld label="Client / Project" required>
          <Sel value={logForm.dealId} onChange={e=>setLogForm(p=>({...p,dealId:e.target.value}))}>
            <option value="">— Select client —</option>
            {wonDeals.filter(d=>d.invoiced>0).map(d=>(
              <option key={d.id} value={d.id}>{d.client} — {fmt(d.invoiced-d.amountPaid)} remaining</option>
            ))}
          </Sel>
        </Fld>
        <Fld label="Amount Received (₱)" required>
          <Inp type="number" value={logForm.amount} onChange={e=>setLogForm(p=>({...p,amount:e.target.value}))} placeholder="e.g. 25000"/>
        </Fld>
        <Fld label="Date Received">
          <Inp type="date" value={logForm.date} onChange={e=>setLogForm(p=>({...p,date:e.target.value}))}/>
        </Fld>
        <Fld label="Note" hint="e.g. Full payment, 50% deposit, partial">
          <Inp value={logForm.note} onChange={e=>setLogForm(p=>({...p,note:e.target.value}))} placeholder="Payment note"/>
        </Fld>
        <div style={{display:"flex",gap:10,marginTop:20}}>
          <Btn full onClick={()=>{
            if(!logForm.dealId||!logForm.amount) return;
            onLogPayment(logForm);
            setLogModal(false);
            setLogForm({dealId:"",amount:"",note:"",date:today});
          }}>✓ Confirm Payment</Btn>
          <Btn variant="ghost" onClick={()=>setLogModal(false)}>Cancel</Btn>
        </div>
      </Modal>
    </div>
  );
}

// ─── DEAL FORM MODAL ──────────────────────────────────────────────────────────
function ClientAutocomplete({value:initVal, onChange}){
  const[localVal,setLocalVal]= useState(initVal||"");
  const[show,    setShow]    = useState(false);
  // Sync if parent resets (e.g. new deal)
  useEffect(()=>{ setLocalVal(initVal||""); },[initVal]);

  const suggestions = useMemo(()=>{
    if(!localVal||localVal.length<2) return [];
    const q = localVal.toLowerCase();
    return GMD_CLIENTS.filter(c=>c.name.toLowerCase().includes(q)).slice(0,8);
  },[localVal]);

  const pick = (name) => { setLocalVal(name); onChange(name); setShow(false); };

  return(
    <div style={{position:"relative"}}>
      <input
        value={localVal}
        onChange={e=>{setLocalVal(e.target.value);onChange(e.target.value);setShow(true);}}
        onFocus={()=>setShow(true)}
        onBlur={()=>setTimeout(()=>setShow(false),150)}
        placeholder="Start typing client name…"
        style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"9px 12px",fontFamily:"inherit",fontSize:".87rem",color:"#1e293b",background:"#fff",boxSizing:"border-box",outline:"none"}}
      />
      {show && (localVal.length>=1) && (suggestions.length>0 || (localVal.length>=2 && !GMD_CLIENTS.find(c=>c.name.toLowerCase()===localVal.toLowerCase()))) && (
        <div style={{position:"absolute",top:"100%",left:0,right:0,background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:10,boxShadow:"0 8px 24px rgba(0,0,0,.12)",zIndex:200,maxHeight:280,overflowY:"auto",marginTop:4}}>
          {suggestions.map((c,i)=>(
            <div key={i} onMouseDown={()=>pick(c.name)}
              style={{padding:"10px 14px",cursor:"pointer",borderBottom:"1px solid #f1f5f9",transition:"background .1s"}}
              onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"}
              onMouseLeave={e=>e.currentTarget.style.background="#fff"}>
              <div style={{fontWeight:600,color:"#0f172a",fontSize:".86rem"}}>{c.name}</div>
              <div style={{display:"flex",gap:12,marginTop:2,flexWrap:"wrap"}}>
                {c.city&&<span style={{fontSize:".7rem",color:"#94a3b8"}}>📍 {c.city}</span>}
                {c.phone&&<span style={{fontSize:".7rem",color:"#94a3b8"}}>📞 {c.phone}</span>}
                {c.balance>0&&<span style={{fontSize:".7rem",color:"#ef4444",fontWeight:700}}>⚠ ₱{c.balance.toLocaleString()} open balance</span>}
              </div>
            </div>
          ))}
          {localVal&&!GMD_CLIENTS.find(c=>c.name.toLowerCase()===localVal.toLowerCase())&&(
            <div onMouseDown={()=>pick(localVal)}
              style={{padding:"10px 14px",cursor:"pointer",background:"#fafafa",borderTop:"1px solid #e2e8f0",fontSize:".82rem",color:"#3b82f6",fontWeight:600}}>
              + Add "{localVal}" as new client
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── CLIENT DIRECTORY ────────────────────────────────────────────────────────
function DealModal({open,onClose,form:initialForm,setForm:_setForm,onSave,editId}){
  // Local state — prevents App re-render on every keystroke (fixes focus bug)
  const[form,setForm]=useState(initialForm||emptyDeal);
  const f=(k,v)=>setForm(p=>({...p,[k]:v}));
  const isWon=WON_STAGES.includes(form.stage);
  const setDrfAcc=(i,v)=>f("drfAccessories",(form.drfAccessories||[]).map((a,ai)=>ai===i?v:a));
  const addDrfAcc=()=>f("drfAccessories",[...(form.drfAccessories||[]),""])
  const remDrfAcc=(i)=>f("drfAccessories",(form.drfAccessories||[]).filter((_,ai)=>ai!==i));
  const setDrfRef=(i,v)=>f("drfRefLinks",(form.drfRefLinks||["","",""]).map((r,ri)=>ri===i?v:r));

  // Sync when modal opens or editId changes
  const formKey=`${open}-${editId||"new"}`;
  useEffect(()=>{
    if(open) setForm(initialForm||emptyDeal);
  },[open,editId]);

  const handleSave=()=>{
    // Pass local form data directly to saveDeal — bypasses async state sync
    _setForm(()=>form);
    onSave(form);
  };
  return(
    <Modal open={open} onClose={onClose} title={editId?"Edit Deal":"Add New Deal"} wide key={formKey}>

      {/* ── SECTION 1: DEAL ESSENTIALS ─────────────────────────────────── */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
        <div style={{gridColumn:"1/-1"}}>
          <Fld label="Client Name" required hint="Start typing to search from your GMD clients">
            <ClientAutocomplete value={form.client} onChange={v=>f("client",v)}/>
          </Fld>
        </div>
        <Fld label="Project Name" hint="e.g. SM Megamall Fit-Out Phase 1"><Inp value={form.contact} onChange={e=>f("contact",e.target.value)} placeholder="e.g. SM Megamall Fit-Out Phase 1"/></Fld>
        <Fld label="Deal Value (₱)" hint="Leave blank if not yet finalized"><Inp type="number" value={form.value} onChange={e=>f("value",e.target.value)} placeholder="To be confirmed"/></Fld>
        <Fld label="CE Number"><Inp value={form.ceNo||""} onChange={e=>f("ceNo",e.target.value)} placeholder="CE-2026-005"/></Fld>
        <Fld label="CE Type">
          <Sel value={form.ceType||"Fabrication / General"} onChange={e=>f("ceType",e.target.value)}>
            {CE_TYPES.map(t=><option key={t}>{t}</option>)}
          </Sel>
          {form.ceType==="Other"&&<Inp value={form.customProductType||""} onChange={e=>f("customProductType",e.target.value)} placeholder="Describe the project type..." style={{marginTop:6}}/>}
        </Fld>
        <Fld label="Sales Owner / AE">
          <Sel value={form.salesOwner||""} onChange={e=>f("salesOwner",e.target.value)}>
            <option value="">— Assign AE —</option>
            {SALES_TEAM.map(m=><option key={m}>{m}</option>)}
          </Sel>
        </Fld>
        <Fld label="Date Acquired"><Inp type="date" value={form.dateAcquired||today} onChange={e=>f("dateAcquired",e.target.value)}/></Fld>
      </div>

      {/* ── SECTION 2: CONTEXT & FOLLOW-UP ─────────────────────────────── */}
      <div style={{background:"#f8fafc",borderRadius:12,padding:"14px 16px",marginTop:10,border:"1.5px solid #e2e8f0"}}>
        <div style={{fontWeight:700,color:"#0f172a",fontSize:".85rem",marginBottom:12}}>📋 Context & Follow-up</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <Fld label="BizDev Source" hint="How did we get this client?">
            <Sel value={form.bizDevSource||""} onChange={e=>f("bizDevSource",e.target.value)}>
              <option value="">— Select source —</option>
              <option>Old Client</option>
              <option>GMD Referred</option>
              <option>AE Referred</option>
            </Sel>
          </Fld>
          <Fld label="Follow-up Date"><Inp type="date" value={form.followUp} onChange={e=>f("followUp",e.target.value)}/></Fld>
          <Fld label="Priority"><Sel value={form.priority} onChange={e=>f("priority",e.target.value)}>{PRIORITIES.map(p=><option key={p}>{p}</option>)}</Sel></Fld>
          <Fld label="Project Sub-Type">
            <Sel value={form.product} onChange={e=>f("product",e.target.value)}>
              <option value="">— Select Sub-Type —</option>
              {["Retail Fit-Out","Kiosk","Modules","Signage","POP Display","Cart","Event / Activation","Repair / Refurbishment","Pull-Out / Relocation","Warehousing","Design Only","Print / Dress-Up","Renovation","Non-Retail Construction","Retail Construction","Other"].map(t=><option key={t}>{t}</option>)}
            </Sel>
            {form.product==="Other"&&<Inp value={form.customProductType||""} onChange={e=>f("customProductType",e.target.value)} placeholder="Describe the project sub-type..." style={{marginTop:6}}/>}
          </Fld>
          <Fld label="Discount %" hint="Paulo sets this only"><Inp type="number" min={0} max={100} value={form.discount||0} onChange={e=>f("discount",e.target.value)}/></Fld>
          <div style={{gridColumn:"1/-1"}}><Fld label="Notes"><Inp rows={2} value={form.notes} onChange={e=>f("notes",e.target.value)} placeholder="Any relevant notes…"/></Fld></div>
        </div>
      </div>

      {/* ── SECTION 3: FILES & COMMS ────────────────────────────────────── */}
      <div style={{background:"#f8fafc",borderRadius:12,padding:"14px 16px",marginTop:10,border:"1.5px solid #e2e8f0"}}>
        <div style={{fontWeight:700,color:"#0f172a",fontSize:".85rem",marginBottom:12}}>📁 Files & Comms</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <Fld label="Sales Repository Link" hint="Main Google Drive folder for this deal"><Inp type="url" value={form.salesRepoLink||""} onChange={e=>f("salesRepoLink",e.target.value)} placeholder="https://drive.google.com/…"/></Fld>
          <Fld label="Proposal Folder Link" hint="CE + budget folder inside Sales Repository"><Inp type="url" value={form.proposalFolderLink||""} onChange={e=>f("proposalFolderLink",e.target.value)} placeholder="https://drive.google.com/…"/></Fld>
          <Fld label="Comms Group">
            <Sel value={form.commsGroup||""} onChange={e=>f("commsGroup",e.target.value)}>
              <option value="">— Not yet created —</option>
              <option>WhatsApp</option><option>Viber</option><option>Telegram</option><option>WhatsApp + Viber</option><option>WhatsApp + Telegram</option><option>All Three</option>
            </Sel>
          </Fld>
          <Fld label="Repository Notes"><Inp value={form.salesRepoNote||""} onChange={e=>f("salesRepoNote",e.target.value)} placeholder="e.g. SM Megamall — all plans uploaded"/></Fld>
        </div>
      </div>

      {/* Design Request Form (DRF) — always shown */}
      <div style={{background:"#faf5ff",borderRadius:12,padding:"14px 16px",marginTop:8,border:"1.5px solid #ddd6fe"}}>
        <div style={{fontWeight:700,color:"#6d28d9",fontSize:".85rem",marginBottom:4}}>🎨 Design Request</div>
        <div style={{fontSize:".72rem",color:"#a78bfa",marginBottom:12}}>Fill this out to auto-create a DRF when the deal is saved.</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div style={{gridColumn:"1/-1"}}><Fld label="Project Title"><Inp value={form.drfProjectTitle||""} onChange={e=>f("drfProjectTitle",e.target.value)} placeholder="e.g. Golf Bag Organizer Rack / Shirts Display"/></Fld></div>
          <Fld label="Type"><Sel value={form.drfType||DRF_TYPES[0]} onChange={e=>f("drfType",e.target.value)}>{DRF_TYPES.map(t=><option key={t}>{t}</option>)}</Sel></Fld>
          <Fld label="Size / Dimensions"><Inp value={form.drfSize||""} onChange={e=>f("drfSize",e.target.value)} placeholder="e.g. W1200 x H1800 x D600mm"/></Fld>
          <Fld label="Assigned Designer"><Sel value={form.drfDesigner||""} onChange={e=>f("drfDesigner",e.target.value)}><option value="">— Assign later —</option>{DESIGN_MEMBERS.map(m=><option key={m}>{m}</option>)}</Sel></Fld>
          <Fld label="Design Deadline"><Inp type="date" value={form.drfDeadline||""} onChange={e=>f("drfDeadline",e.target.value)}/></Fld>
          <div style={{gridColumn:"1/-1"}}><Fld label="Description / Details" hint="What needs to be designed? Include dimensions, function, and key specs."><Inp rows={4} value={form.drfDescription||""} onChange={e=>f("drfDescription",e.target.value)} placeholder={"RE-CREATE: Golf bag organizer rack\nSIZE: Must fit two large golf bags\nFUNCTION: Store bags + shoe shelf"}/></Fld></div>
          <div style={{gridColumn:"1/-1"}}>
            <div style={{fontSize:".8rem",fontWeight:700,color:"#64748b",marginBottom:6}}>Accessories / Components</div>
            {(form.drfAccessories||[]).map((a,i)=>(
              <div key={i} style={{display:"flex",gap:8,marginBottom:6}}>
                <Inp value={a} onChange={e=>setDrfAcc(i,e.target.value)} placeholder="e.g. Shelving for shoes (3-4 pairs)"/>
                <button onClick={()=>remDrfAcc(i)} style={{background:"#fef2f2",border:"none",borderRadius:7,padding:"6px 10px",color:"#dc2626",cursor:"pointer",fontFamily:"inherit",fontSize:".8rem",fontWeight:700,flexShrink:0}}>✕</button>
              </div>
            ))}
            <button onClick={addDrfAcc} style={{background:"#f8fafc",border:"1.5px dashed #e2e8f0",borderRadius:8,padding:"7px 14px",fontFamily:"inherit",fontSize:".78rem",color:"#64748b",cursor:"pointer",fontWeight:600}}>+ Add Component</button>
          </div>
          <div style={{gridColumn:"1/-1"}}>
            <div style={{fontSize:".8rem",fontWeight:700,color:"#64748b",marginBottom:6}}>Reference Images (links)</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
              {(form.drfRefLinks||["","",""]).map((r,i)=>(
                <Fld key={i} label={`Ref ${i+1}`}><Inp type="url" value={r} onChange={e=>setDrfRef(i,e.target.value)} placeholder="https://…"/></Fld>
              ))}
            </div>
          </div>
          <div style={{gridColumn:"1/-1"}}><Fld label="Notes"><Inp rows={2} value={form.drfNotes||""} onChange={e=>f("drfNotes",e.target.value)} placeholder="Brand guidelines, restrictions, additional references…"/></Fld></div>
        </div>
      </div>

      {/* ── ALERTS ──────────────────────────────────────────────────────── */}
      {PAULO_GATE.includes(form.stage)&&(
        <div style={{background:"#fffbeb",border:"1.5px solid #fde68a",borderRadius:10,padding:"12px 16px",marginTop:8,fontSize:".82rem",color:"#92400e"}}>
          ⚠️ <strong>Paulo Gate:</strong> Stage {form.stage} requires Paulo Garcia's review and sign-off before proceeding to the next stage.
        </div>
      )}
      {Number(form.value)>=3000000&&(
        <div style={{background:"#fef2f2",border:"1.5px solid #fecaca",borderRadius:10,padding:"12px 16px",marginTop:8,fontSize:".82rem",color:"#991b1b"}}>
          🚨 <strong>₱3M Rule:</strong> This project exceeds ₱3,000,000. Paulo Garcia must be involved. Paolo can quote a range but <strong>cannot commit pricing</strong> without Paulo.
        </div>
      )}
      {form.ceType==="Construction"&&(
        <div style={{background:"#eff6ff",border:"1.5px solid #93c5fd",borderRadius:10,padding:"12px 16px",marginTop:8,fontSize:".82rem",color:"#1d4ed8"}}>
          🏗 <strong>Construction CE:</strong> Rodney (QS/CE) prepares the cost estimate using the Construction template. Jerome Mendoza is on-call backup. Paulo sets the final % adjustment.
        </div>
      )}

      {/* ── SECTION 5: PAYMENT (awarded deals only) ─────────────────────── */}
      {isWon&&(
        <div style={{background:"#f0fdf4",border:"1.5px solid #6ee7b7",borderRadius:12,padding:"16px 18px",marginTop:10}}>
          <div style={{fontWeight:700,color:"#059669",marginBottom:12,fontSize:".88rem"}}>💰 Payment Details (Awarded)</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            <Fld label="Invoice Amount (₱)"><Inp type="number" value={form.invoiced} onChange={e=>f("invoiced",e.target.value)}/></Fld>
            <Fld label="Amount Paid (₱)"><Inp type="number" value={form.amountPaid} onChange={e=>f("amountPaid",e.target.value)}/></Fld>
            <Fld label="Payment Status"><Sel value={form.paymentStatus} onChange={e=>f("paymentStatus",e.target.value)}>{PAY_STATUS.map(s=><option key={s}>{s}</option>)}</Sel></Fld>
            <Fld label="Payment Due Date"><Inp type="date" value={form.dueDate} onChange={e=>f("dueDate",e.target.value)}/></Fld>
          </div>
        </div>
      )}

      {/* ── SECTION 6: TAX SETTINGS ─────────────────────────────────────── */}
      {Number(form.value)>0&&(
        <div style={{background:"#fffbeb",border:"1.5px solid #fde68a",borderRadius:12,padding:"16px 18px",marginTop:10}}>
          <div style={{fontWeight:700,color:"#92400e",fontSize:".88rem",marginBottom:12}}>🧾 Tax Settings</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
            <div>
              <label style={{display:"block",fontSize:".68rem",fontWeight:700,color:"#92400e",textTransform:"uppercase",letterSpacing:".8px",marginBottom:8}}>Receipt Type</label>
              <div style={{display:"flex",gap:8}}>
                {["OR","AR"].map(rt=>(
                  <button key={rt} type="button" onClick={()=>setForm(p=>({...p,receiptType:rt,withholding:rt==="AR"?false:p.withholding}))}
                    style={{flex:1,padding:"8px",border:`2px solid ${form.receiptType===rt?"#d97706":"#e2e8f0"}`,borderRadius:8,background:form.receiptType===rt?"#fef3c7":"#fff",color:form.receiptType===rt?"#92400e":"#64748b",fontWeight:form.receiptType===rt?700:400,cursor:"pointer",fontFamily:"inherit",fontSize:".82rem"}}>
                    {rt==="OR"?"🧾 OR (with VAT)":"📄 AR (no VAT)"}
                  </button>
                ))}
              </div>
              <div style={{fontSize:".7rem",color:"#92400e",marginTop:5,opacity:.8}}>
                {form.receiptType==="OR"?"Official Receipt — VAT 12% applies":"Acknowledgement Receipt — VAT exempted"}
              </div>
            </div>
            {form.receiptType==="OR"?(
              <div>
                <label style={{display:"block",fontSize:".68rem",fontWeight:700,color:"#92400e",textTransform:"uppercase",letterSpacing:".8px",marginBottom:8}}>Withholding Tax (EWT 2%)</label>
                <div style={{display:"flex",gap:8}}>
                  {[["Yes — client withholds",true],["No withholding",false]].map(([label,val])=>(
                    <button key={String(val)} type="button" onClick={()=>setForm(p=>({...p,withholding:val}))}
                      style={{flex:1,padding:"8px",border:`2px solid ${form.withholding===val?"#d97706":"#e2e8f0"}`,borderRadius:8,background:form.withholding===val?"#fef3c7":"#fff",color:form.withholding===val?"#92400e":"#64748b",fontWeight:form.withholding===val?700:400,cursor:"pointer",fontFamily:"inherit",fontSize:".75rem"}}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ):(
              <div style={{display:"flex",alignItems:"center"}}>
                <div style={{background:"#f1f5f9",borderRadius:8,padding:"12px 16px",fontSize:".78rem",color:"#94a3b8",width:"100%",textAlign:"center"}}>
                  📄 AR — No EWT applicable
                </div>
              </div>
            )}
          </div>
          {(()=>{
            const tx=calcTax(form.value,form.receiptType||"OR",form.withholding||false);
            return(
              <div style={{background:"rgba(255,255,255,.8)",borderRadius:8,padding:"12px 14px",display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,borderTop:"1px solid #fde68a"}}>
                {[
                  ["Contract (Base)",  tx.base,          "#0f172a"],
                  ["VAT 12%",          tx.vat,           tx.vat>0?"#f59e0b":"#94a3b8"],
                  ["EWT 2%",           tx.ewt,           tx.ewt>0?"#ef4444":"#94a3b8"],
                  ["Net Receivable",   tx.netReceivable, "#059669"],
                ].map(([l,v,c])=>(
                  <div key={l} style={{textAlign:"center"}}>
                    <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1rem",color:c}}>
                      ₱{Number(v).toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2})}
                    </div>
                    <div style={{fontSize:".62rem",color:"#94a3b8",marginTop:3,textTransform:"uppercase",letterSpacing:".5px"}}>{l}</div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      <div style={{display:"flex",gap:10,marginTop:20}}>
        <Btn full onClick={handleSave}>{editId?"Save Changes":"Add Deal"}</Btn>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
      </div>
    </Modal>
  );
}

// ─── EXPENSE FORM MODAL (with confirmation step) ──────────────────────────────
function ExpenseModal({open,onClose,form:initialExpForm,setForm:_setExpForm,onSave,editId,projList,clientName}){
  const[form,setForm]=useState(initialExpForm||{});
  const[step,setStep]=useState(1);
  const f=(k,v)=>setForm(p=>({...p,[k]:v}));
  const expFormKey=`exp-${open}-${editId||"new"}`;
  useEffect(()=>{if(open){setStep(1);setForm(initialExpForm||{});}},[open,editId]);
  const handleExpSave=()=>{_setExpForm(()=>form);onSave(form);};
  const projName=form.projectId?clientName(form.projectId):"Company-wide (no specific project)";
  return(
    <Modal open={open} onClose={onClose} title={editId?"Edit Expense":"Log Expense"} key={expFormKey}>
      {step===1?(
        <>
          <Fld label="Month">
            <Sel value={form.month} onChange={e=>f("month",Number(e.target.value))}>{MONTHS.map((m,i)=><option key={m} value={i}>{m}</option>)}</Sel>
          </Fld>
          <Fld label="Category">
            <Sel value={form.category} onChange={e=>f("category",e.target.value)}>{EXP_CATS.map(c=><option key={c}>{c}</option>)}</Sel>
          </Fld>
          <Fld label="Amount (₱)" required>
            <Inp type="number" value={form.amount} onChange={e=>f("amount",e.target.value)} placeholder="e.g. 15000"/>
          </Fld>
          <Fld label="Description" required hint="Be specific — e.g. 'Steel tubes for TechZone kiosks'">
            <Inp value={form.note} onChange={e=>f("note",e.target.value)} placeholder="What was this expense for?"/>
          </Fld>
          <Fld label="Link to Project" hint="Choose the project this expense belongs to, or leave as Company-wide">
            <Sel value={form.projectId||"company"} onChange={e=>f("projectId",e.target.value==="company"?null:e.target.value)}>
              <option value="company">Company-wide (salaries, rent, overhead)</option>
              {projList.map(d=><option key={d.id} value={d.id}>{d.client} — {d.product}</option>)}
            </Sel>
          </Fld>
          <Fld label="Receipt / Invoice Link" hint="Paste a Google Drive, email, or any URL link to the receipt">
            <Inp type="url" value={form.receipt||""} onChange={e=>f("receipt",e.target.value)} placeholder="https://drive.google.com/… (optional)"/>
          </Fld>
          <div style={{display:"flex",gap:10,marginTop:20}}>
            <Btn full onClick={()=>{if(!form.amount||!form.note) return;setStep(2);}}>Review →</Btn>
            <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          </div>
        </>
      ):(
        <>
          <div style={{background:"#f8fafc",borderRadius:12,padding:"18px 20px",marginBottom:20}}>
            <div style={{fontSize:".75rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".8px",color:"#94a3b8",marginBottom:14}}>Confirm Expense Details</div>
            {[
              ["Month",MONTHS[form.month]],
              ["Category",form.category],
              ["Amount",fmt(Number(form.amount))],
              ["Description",form.note],
              ["Project",projName],
              form.receipt?["Receipt","Linked ✓"]:null,
            ].filter(Boolean).map(([l,v])=>(
              <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #e2e8f0",fontSize:".87rem"}}>
                <span style={{color:"#64748b"}}>{l}</span>
                <span style={{fontWeight:600,color:"#0f172a",textAlign:"right",maxWidth:"60%"}}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{background:form.projectId?"#eff6ff":"#fff7ed",borderRadius:10,padding:"12px 16px",marginBottom:20,fontSize:".82rem",color:form.projectId?"#3b82f6":"#f97316"}}>
            {form.projectId
              ? `✓ This expense will be tagged to ${projName} and reflected in that project's profit report.`
              : "⚠ This will be logged as a company-wide expense — not linked to any specific project."}
          </div>
          <div style={{display:"flex",gap:10}}>
            <Btn full variant="green" onClick={handleExpSave}>✓ Confirm &amp; Save</Btn>
            <Btn variant="ghost" onClick={()=>setStep(1)}>← Go Back</Btn>
          </div>
        </>
      )}
    </Modal>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────

// Deal completeness — checks which key fields are filled
const dealCompleteness=(d)=>{
  const checks=[
    {field:"ceNo",         label:"CE Number"},
    {field:"salesOwner",   label:"Assigned AE"},
    {field:"salesRepoLink",label:"Sales Repository"},
    {field:"proposalFolderLink",label:"Proposal Folder"},
    {field:"commsGroup",   label:"Comms Group"},
    {field:"value",        label:"Contract Value"},
    {field:"ceType",       label:"CE Type"},
    {field:"dateAcquired", label:"Date Acquired"},
  ];
  const missing=checks.filter(c=>!d[c.field]).map(c=>c.label);
  const pct=Math.round(((checks.length-missing.length)/checks.length)*100);
  return{pct,missing,complete:missing.length===0};
};

// ── ERROR BOUNDARY ──────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component{
  constructor(p){super(p);this.state={err:null};}
  static getDerivedStateFromError(e){return{err:e};}
  componentDidCatch(e,info){console.error("FabHub render error:",e,info);}
  render(){
    if(this.state.err) return(
      <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#f8fafc",fontFamily:"'Segoe UI',sans-serif"}}>
        <div style={{background:"#fff",borderRadius:16,padding:32,maxWidth:480,textAlign:"center",border:"1.5px solid #fecaca",boxShadow:"0 8px 32px rgba(0,0,0,.1)"}}>
          <div style={{fontSize:"2.5rem",marginBottom:12}}>⚠️</div>
          <div style={{fontWeight:800,color:"#0f172a",fontSize:"1.1rem",marginBottom:8}}>Something went wrong</div>
          <div style={{color:"#64748b",fontSize:".85rem",marginBottom:20,lineHeight:1.6}}>
            {this.state.err?.message||"Unknown error"}
          </div>
          <button onClick={()=>{this.setState({err:null});window.location.reload();}}
            style={{background:"#1e293b",border:"none",borderRadius:8,padding:"10px 24px",color:"#fff",cursor:"pointer",fontFamily:"inherit",fontWeight:700,fontSize:".9rem"}}>
            🔄 Reload FabHub
          </button>
          <div style={{marginTop:12,fontSize:".75rem",color:"#94a3b8"}}>
            If this keeps happening, send a screenshot to your system admin.
          </div>
        </div>
      </div>
    );
    return this.props.children;
  }
}


// ── PM UPDATE MODAL (proper component — fixes focus loss from IIFE hooks) ──

// ── MY ACCOUNT PAGE (proper component — fixes focus loss) ─────────────────
function MyAccountPage({session,users,setUsers,upUsers:upUsersExt,setSession:setSessionExt,logActivity:logActivityExt,checkPw,hashPw}){
          const[tab,setTab]=useState("password");
          const[curPw,setCurPw]=useState("");
          const[newPw,setNewPw]=useState("");
          const[confPw,setConfPw]=useState("");
          const[newName,setNewName]=useState(session?.name||"");
          const[newUsername,setNewUsername]=useState(session?.username||"");
          const[msg,setMsg]=useState(null); // {type:"success"|"error", text}
          const[showCur,setShowCur]=useState(false);
          const[showNew,setShowNew]=useState(false);

          const savePassword=()=>{
            const u=users.find(x=>x.id===session?.userId);
            if(!u){setMsg({type:"error",text:"Session error. Please log out and log back in."});return;}
            if(!checkPw(curPw,u.passwordHash)){setMsg({type:"error",text:"Current password is incorrect."});return;}
            if(newPw.length<6){setMsg({type:"error",text:"New password must be at least 6 characters."});return;}
            if(newPw!==confPw){setMsg({type:"error",text:"New passwords do not match."});return;}
            if(newPw===curPw){setMsg({type:"error",text:"New password must be different from current password."});return;}
            (upUsersExt||setUsers)(us=>us.map(x=>x.id===u.id?{...x,passwordHash:hashPw(newPw)}:x));
            setCurPw(""); setNewPw(""); setConfPw("");
            setMsg({type:"success",text:"✅ Password changed successfully! Use your new password next time you log in."});
            logActivityExt&&logActivityExt(null,"Password Changed","User changed their password");
          };

          const saveProfile=()=>{
            if(!newName.trim()){setMsg({type:"error",text:"Name cannot be empty."});return;}
            if(!newUsername.trim()){setMsg({type:"error",text:"Username cannot be empty."});return;}
            const taken=users.find(x=>x.username.toLowerCase()===newUsername.toLowerCase().trim()&&x.id!==session?.userId);
            if(taken){setMsg({type:"error",text:"That username is already taken by another user."});return;}
            (upUsersExt||setUsers)(us=>us.map(x=>x.id===session?.userId?{...x,name:newName.trim(),username:newUsername.toLowerCase().trim()}:x));
            // Update session
            const newSess={...session,name:newName.trim(),username:newUsername.toLowerCase().trim()};
            setSessionExt&&setSessionExt(newSess);
            localStorage.setItem(KEYS.session,JSON.stringify(newSess));
            setMsg({type:"success",text:"✅ Profile updated successfully!"});
            logActivityExt&&logActivityExt(null,"Profile Updated","User updated their name/username");
          };

          return(
            <div style={{background:"#fff",borderRadius:16,border:"1.5px solid #e2e8f0",overflow:"hidden"}}>
              {/* Profile banner */}
              <div style={{background:"#1e293b",padding:"20px 24px",display:"flex",alignItems:"center",gap:14}}>
                <div style={{width:52,height:52,borderRadius:"50%",background:"#0ea5e9",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.4rem",color:"#fff",flexShrink:0}}>
                  {(session?.name||"?").split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase()}
                </div>
                <div>
                  <div style={{fontWeight:700,color:"#fff",fontSize:"1rem"}}>{session?.name}</div>
                  <div style={{fontSize:".78rem",color:"#94a3b8",marginTop:2}}>@{session?.username}</div>
                  <div style={{display:"inline-block",marginTop:4,background:"rgba(255,255,255,.1)",borderRadius:20,padding:"2px 10px",fontSize:".7rem",fontWeight:700,color:"#f59e0b"}}>{session?.title||role}</div>
                </div>
              </div>

              {/* Tabs */}
              <div style={{display:"flex",borderBottom:"1.5px solid #e2e8f0"}}>
                {[["password","🔑 Change Password"],["profile","👤 Edit Profile"]].map(([t,l])=>(
                  <button key={t} onClick={()=>{setTab(t);setMsg(null);}}
                    style={{flex:1,padding:"12px",background:"transparent",border:"none",borderBottom:tab===t?"2.5px solid #0ea5e9":"2.5px solid transparent",fontFamily:"inherit",fontSize:".85rem",fontWeight:tab===t?700:400,color:tab===t?"#0ea5e9":"#64748b",cursor:"pointer"}}>
                    {l}
                  </button>
                ))}
              </div>

              <div style={{padding:"24px"}}>
                {msg&&(
                  <div style={{background:msg.type==="success"?"#f0fdf4":"#fef2f2",border:`1px solid ${msg.type==="success"?"#6ee7b7":"#fecaca"}`,borderRadius:8,padding:"10px 14px",marginBottom:16,fontSize:".85rem",color:msg.type==="success"?"#059669":"#dc2626",fontWeight:600}}>
                    {msg.text}
                  </div>
                )}

                {tab==="password"&&(
                  <div style={{display:"flex",flexDirection:"column",gap:16}}>
                    <div>
                      <label style={{display:"block",fontSize:".8rem",fontWeight:700,color:"#374151",marginBottom:6}}>Current Password <span style={{color:"#ef4444"}}>*</span></label>
                      <div style={{position:"relative"}}>
                        <input type={showCur?"text":"password"} value={curPw} onChange={e=>setCurPw(e.target.value)}
                          placeholder="Enter your current password"
                          style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:9,padding:"10px 40px 10px 14px",fontFamily:"inherit",fontSize:".88rem",color:"#0f172a",outline:"none",boxSizing:"border-box"}}
                          onFocus={e=>e.target.style.borderColor="#0ea5e9"}
                          onBlur={e=>e.target.style.borderColor="#e2e8f0"}/>
                        <button type="button" onClick={()=>setShowCur(v=>!v)}
                          style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"#94a3b8",fontSize:".85rem"}}>
                          {showCur?"🙈":"👁"}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label style={{display:"block",fontSize:".8rem",fontWeight:700,color:"#374151",marginBottom:6}}>New Password <span style={{color:"#ef4444"}}>*</span></label>
                      <div style={{position:"relative"}}>
                        <input type={showNew?"text":"password"} value={newPw} onChange={e=>setNewPw(e.target.value)}
                          placeholder="At least 6 characters"
                          style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:9,padding:"10px 40px 10px 14px",fontFamily:"inherit",fontSize:".88rem",color:"#0f172a",outline:"none",boxSizing:"border-box"}}
                          onFocus={e=>e.target.style.borderColor="#0ea5e9"}
                          onBlur={e=>e.target.style.borderColor="#e2e8f0"}/>
                        <button type="button" onClick={()=>setShowNew(v=>!v)}
                          style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"#94a3b8",fontSize:".85rem"}}>
                          {showNew?"🙈":"👁"}
                        </button>
                      </div>
                      {/* Password strength indicator */}
                      {newPw&&(()=>{
                        const strength=newPw.length>=12&&/[A-Z]/.test(newPw)&&/[0-9]/.test(newPw)?"Strong":newPw.length>=8?"Good":newPw.length>=6?"Weak":"Too short";
                        const clr={"Strong":"#059669","Good":"#0ea5e9","Weak":"#f59e0b","Too short":"#ef4444"};
                        return <div style={{fontSize:".75rem",color:clr[strength],marginTop:4,fontWeight:600}}>Password strength: {strength}</div>;
                      })()}
                    </div>
                    <div>
                      <label style={{display:"block",fontSize:".8rem",fontWeight:700,color:"#374151",marginBottom:6}}>Confirm New Password <span style={{color:"#ef4444"}}>*</span></label>
                      <input type="password" value={confPw} onChange={e=>setConfPw(e.target.value)}
                        placeholder="Re-enter new password"
                        style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:9,padding:"10px 14px",fontFamily:"inherit",fontSize:".88rem",color:"#0f172a",outline:"none",boxSizing:"border-box"}}
                        onFocus={e=>e.target.style.borderColor="#0ea5e9"}
                        onBlur={e=>e.target.style.borderColor="#e2e8f0"}/>
                      {confPw&&newPw&&(
                        <div style={{fontSize:".75rem",marginTop:4,fontWeight:600,color:confPw===newPw?"#059669":"#ef4444"}}>
                          {confPw===newPw?"✅ Passwords match":"❌ Passwords do not match"}
                        </div>
                      )}
                    </div>
                    <button onClick={savePassword}
                      style={{background:"#0ea5e9",border:"none",borderRadius:9,padding:"12px",fontFamily:"inherit",fontWeight:700,fontSize:".9rem",color:"#fff",cursor:"pointer",marginTop:4}}>
                      🔑 Change Password
                    </button>
                    <div style={{fontSize:".78rem",color:"#94a3b8",textAlign:"center"}}>
                      Forgot your password? Ask Paulo or Mar to reset it in the Manager → Accounts panel.
                    </div>
                  </div>
                )}

                {tab==="profile"&&(
                  <div style={{display:"flex",flexDirection:"column",gap:16}}>
                    <div>
                      <label style={{display:"block",fontSize:".8rem",fontWeight:700,color:"#374151",marginBottom:6}}>Display Name</label>
                      <input value={newName} onChange={e=>setNewName(e.target.value)}
                        placeholder="Your full name"
                        style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:9,padding:"10px 14px",fontFamily:"inherit",fontSize:".88rem",color:"#0f172a",outline:"none",boxSizing:"border-box"}}
                        onFocus={e=>e.target.style.borderColor="#0ea5e9"}
                        onBlur={e=>e.target.style.borderColor="#e2e8f0"}/>
                      <div style={{fontSize:".75rem",color:"#94a3b8",marginTop:4}}>This name appears on Job Orders, checklists, and activity logs.</div>
                    </div>
                    <div>
                      <label style={{display:"block",fontSize:".8rem",fontWeight:700,color:"#374151",marginBottom:6}}>Username</label>
                      <input value={newUsername} onChange={e=>setNewUsername(e.target.value.toLowerCase())}
                        placeholder="Your login username"
                        style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:9,padding:"10px 14px",fontFamily:"inherit",fontSize:".88rem",color:"#0f172a",outline:"none",boxSizing:"border-box"}}
                        onFocus={e=>e.target.style.borderColor="#0ea5e9"}
                        onBlur={e=>e.target.style.borderColor="#e2e8f0"}/>
                      <div style={{fontSize:".75rem",color:"#94a3b8",marginTop:4}}>Lowercase letters and numbers only. You will use this to log in.</div>
                    </div>
                    <div style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:8,padding:"10px 14px",fontSize:".8rem",color:"#64748b"}}>
                      🔒 Your <strong>role</strong> ({role}) can only be changed by a Manager.
                    </div>
                    <button onClick={saveProfile}
                      style={{background:"#0f172a",border:"none",borderRadius:9,padding:"12px",fontFamily:"inherit",fontWeight:700,fontSize:".9rem",color:"#fff",cursor:"pointer"}}>
                      💾 Save Profile
                    </button>
                  </div>
                )}
              </div>
            </div>
          );

}

function PmUpdateModal({pmUpdateModal,setPmUpdateModal,session,logActivity:logActivityProp}){
  const[note,setNote]=useState("");
  const[stage,setStage]=useState("");
  const[pct,setPct]=useState("");
  // Reset when modal opens for a new deal
  React.useEffect(()=>{if(pmUpdateModal){setNote("");setStage("");setPct("");}},[pmUpdateModal?.dealId]);
  if(!pmUpdateModal) return null;
  return(
    <Modal open title={`📝 Log Update — ${pmUpdateModal.dealName}`} onClose={()=>setPmUpdateModal(null)}>
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <div>
          <label style={{fontSize:".8rem",fontWeight:700,color:"#64748b",display:"block",marginBottom:4}}>Current Stage</label>
          <select value={stage} onChange={e=>setStage(e.target.value)}
            style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"8px 12px",fontFamily:"inherit",fontSize:".85rem"}}>
            <option value="">Select stage...</option>
            {["Design Ongoing","Fabrication Started","Fabrication Ongoing","Fabrication Complete","Mobilization","Installation Started","Installation Ongoing","Installation Complete","Punchlist","Project Closed"].map(s=>(
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{fontSize:".8rem",fontWeight:700,color:"#64748b",display:"block",marginBottom:4}}>% Complete</label>
          <input type="number" min="0" max="100" value={pct} onChange={e=>setPct(e.target.value)} placeholder="e.g. 45"
            style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"8px 12px",fontFamily:"inherit",fontSize:".85rem"}}/>
        </div>
        <div>
          <label style={{fontSize:".8rem",fontWeight:700,color:"#64748b",display:"block",marginBottom:4}}>Update Notes <span style={{color:"#ef4444"}}>*</span></label>
          <textarea value={note} onChange={e=>setNote(e.target.value)} rows={4}
            placeholder="What happened today? Any issues, deliveries, decisions, blockers..."
            style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"8px 12px",fontFamily:"inherit",fontSize:".85rem",resize:"vertical"}}/>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <button onClick={()=>setPmUpdateModal(null)} style={{background:"#f1f5f9",border:"none",borderRadius:8,padding:"9px 18px",fontFamily:"inherit",fontSize:".85rem",color:"#64748b",cursor:"pointer",fontWeight:600}}>Cancel</button>
          <button onClick={()=>{
            if(!note.trim()){toastEmit("Please enter an update note.","warning");return;}
            const updateText=`[${session?.name}${stage?" · "+stage:""}${pct?" · "+pct+"%":""}]: ${note.trim()}`;
            logActivityProp&&logActivityProp(pmUpdateModal.dealId,"PM Update",updateText);
            setPmUpdateModal(null);
            toastEmit("Update logged!");
          }} style={{background:"#0ea5e9",border:"none",borderRadius:8,padding:"9px 18px",fontFamily:"inherit",fontSize:".85rem",color:"#fff",cursor:"pointer",fontWeight:700}}>
            ✅ Submit Update
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default function App(){
  const[users,      setUsers]     = useState(DEFAULT_USERS);
  const[cashPositions,setCashPos]  = useState({});
  const[vvipClients, setVvip]      = useState(new Set());
  const[actLog,      setActLog]    = useState([]);
  const[pcards,      setPcards]    = useState({});
  const[inventory,   setInventory] = useState([]);  // Inventory items
  const[stocklog,    setStocklog]  = useState([]);  // Stock movement log // Set of client names marked VVIP
  const[prs,         setPrs]       = useState([]);   // Purchase Requests
  const[addenda,     setAddenda]   = useState([]);   // Project Addenda
  const[billings,    setBillings]  = useState([]);   // Billing milestones
  const[mreqs,       setMreqs]     = useState([]);   // Material Requests
  const[breqs,       setBreqs]     = useState([]);   // Budget Requests
  const[drfs,        setDrfs]      = useState([]);   // Design Request Forms
  const[suppliers,  setSuppliers] = useState([]);  // Supplier master list
  const[subcons,    setSubcons]   = useState([]);  // Subcontractor master list
  const[botSettings, setBotSettings]= useState({token:"",chatIds:{general:"",ops:"",design:"",procurement:"",sales:"",management:""}});
  const[customClients,setCustomClients]= useState([]);
  const[budgets,     setBudgets]   = useState({});   // keyed by dealId
  const[session,  setSession] = useState(null);   // {userId, username, name, role}
  const[authView, setAuthView]= useState("login"); // login | register
  const[role,     setRole]    = useState(null);
  const[deals,    setDeals]   = useState([]);
  const[projs,    setProjs]   = useState({});
  const[exps,     setExps]    = useState([]);
  const[infs,     setInfs]    = useState([]);
  const[jos,      setJos]     = useState([]);
  const[swatches, setSwatches]= useState([]);
  const[checklist,setChecklist]= useState([]);
  const[ready,    setReady]   = useState(false);
  const[sync,     setSync]    = useState("saved");

  // Load SheetJS once for Excel import
  useEffect(()=>{
    if(!window.XLSX){
      const s=document.createElement("script");
      s.src="https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js";
      document.head.appendChild(s);
    }
  },[]);

  // ── SUPABASE: Initialize auth + load all data ──────────────────────────────
  useEffect(()=>{
    const init = async () => {
      // Step 1: Load localStorage instantly so app is usable immediately
      try {
        const s=localStorage.getItem(KEYS.session);
        if(s){ const sess=JSON.parse(s); setSession(sess); setRole(sess.role||"Sales"); }
        const r=localStorage.getItem(KEYS.role); if(r) setRole(r);
        const d=localStorage.getItem(KEYS.deals); if(d){const parsed=JSON.parse(d);setDeals(parsed.map(x=>({...x,stage:normalizeStage(x.stage)})));}
        const p=localStorage.getItem(KEYS.projects); if(p) setProjs(JSON.parse(p));
        const e=localStorage.getItem(KEYS.expenses); if(e) setExps(JSON.parse(e));
        const i=localStorage.getItem(KEYS.inflows); if(i) setInfs(JSON.parse(i));
        const j=localStorage.getItem(KEYS.jos); if(j) setJos(JSON.parse(j));
        const sw=localStorage.getItem(KEYS.swatches); if(sw) setSwatches(JSON.parse(sw));
        const cl=localStorage.getItem(KEYS.checklist); if(cl) setChecklist(JSON.parse(cl));
        const u=localStorage.getItem(KEYS.users); if(u) setUsers(JSON.parse(u));
        const cp=localStorage.getItem(KEYS.cashPos); if(cp) setCashPos(JSON.parse(cp));
        const pr=localStorage.getItem(KEYS.prs); if(pr) setPrs(JSON.parse(pr));
        const mr=localStorage.getItem(KEYS.mreqs); if(mr) setMreqs(JSON.parse(mr));
        const br=localStorage.getItem(KEYS.breqs); if(br) setBreqs(JSON.parse(br));
        const drf=localStorage.getItem(KEYS.drfs); if(drf) setDrfs(JSON.parse(drf));
        const sup=localStorage.getItem(KEYS.suppliers); if(sup) setSuppliers(JSON.parse(sup));
        const sc=localStorage.getItem(KEYS.subcons); if(sc) setSubcons(JSON.parse(sc));
        const bs=localStorage.getItem(KEYS.botsettings); if(bs) setBotSettings(JSON.parse(bs));
        const cc=localStorage.getItem(KEYS.customclients); if(cc) setCustomClients(JSON.parse(cc));
        const ad=localStorage.getItem(KEYS.addenda); if(ad) setAddenda(JSON.parse(ad));
        const bg=localStorage.getItem(KEYS.budgets); if(bg) setBudgets(JSON.parse(bg));
        const bl=localStorage.getItem(KEYS.billings); if(bl) setBillings(JSON.parse(bl));
        const vv=localStorage.getItem(KEYS.vvip); if(vv) setVvip(JSON.parse(vv));
        const al=localStorage.getItem(KEYS.actlog); if(al) setActLog(JSON.parse(al));
        const pc=localStorage.getItem(KEYS.pcards); if(pc) setPcards(JSON.parse(pc));
      } catch(err){ console.error("localStorage load error:", err); }
      setReady(true);

      // Step 2: Pull from Supabase (PRIMARY source of truth) — overrides localStorage
      if(isSupabaseReady()){
        try{
          const data = await sbLoadAll();
          if(data){
            if(data.deals?.length)  setDeals(data.deals.map(d=>({...d,ceNo:d.ce_no,ceType:d.ce_type,salesOwner:d.sales_owner,bizDevSource:d.biz_dev_source,dateAcquired:d.date_acquired,dueDate:d.due_date,amountPaid:Number(d.amount_paid)||0,paymentStatus:d.payment_status,receiptType:d.receipt_type,commsGroup:d.comms_group,salesRepoLink:d.sales_repo_link,proposalFolderLink:d.proposal_folder_link,stage:normalizeStage(d.stage)})));
            if(data.jos?.length)    setJos(data.jos.map(j=>({...j,dealId:j.deal_id,joNo:j.jo_no,projectName:j.project_name,awardTrigger:j.award_trigger,triggerDate:j.trigger_date,startDate:j.start_date,commsLink:j.comms_link,scopeNotes:j.scope_notes,specialInstructions:j.special_instructions,budgetStatus:j.budget_status,issuedDate:j.issued_date,aeAssigned:j.ae_assigned})));
            if(Object.keys(data.pcards||{}).length) setPcards(data.pcards);
            if(data.billings?.length) setBillings(data.billings.map(m=>({...m,dealId:m.deal_id,invoiceNo:m.invoice_no,invoiceDate:m.invoice_date,dueDate:m.due_date,createdBy:m.created_by})));
            if(data.exps?.length)   setExps(data.exps.map(e=>({...e,dealId:e.deal_id,receiptNo:e.receipt_no})));
            if(data.prs?.length)    setPrs(data.prs.map(p=>({...p,dealId:p.deal_id,estimatedCost:p.estimated_cost,actualCost:p.actual_cost,budgetCategory:p.budget_category,qtyDelivered:p.qty_delivered,deliveryDate:p.delivery_date,drNo:p.dr_no,createdBy:p.created_by})));
            if(data.mreqs?.length)  setMreqs(data.mreqs.map(m=>({...m,dealId:m.deal_id,estimatedCost:m.estimated_cost,submittedBy:m.submitted_by})));
            if(data.breqs?.length)  setBreqs(data.breqs.map(b=>({...b,dealId:b.deal_id,dateNeeded:b.date_needed,approvedBy:b.approved_by,submittedBy:b.submitted_by})));
            if(data.addenda?.length) setAddenda(data.addenda.map(a=>({...a,dealId:a.deal_id,receiptType:a.receipt_type,salesNotified:a.sales_notified,discoveredBy:a.discovered_by})));
            if(data.checklist?.length) setChecklist(data.checklist.map(c=>({...c,projectId:c.deal_id,dealId:c.deal_id,assignedTo:c.assigned_to,dueDate:c.due_date,riskNote:c.risk_note})));
            if(data.swatches?.length) setSwatches(data.swatches.map(s=>({...s,dealId:s.deal_id,refLink:s.ref_link})));
            if(data.actLog?.length)  setActLog(data.actLog.map(a=>({...a,dealId:a.deal_id})));
            if(Object.keys(data.cashPositions||{}).length) setCashPos(convertSbCashPos(data.cashPositions));
            if(Object.keys(data.budgets||{}).length)       setBudgets(Object.fromEntries(Object.entries(data.budgets).map(([k,b])=>[k,{Materials:b.materials,Labor:b.labor,Overhead:b.overhead,Subcon:b.subcon,notes:b.notes}])));
            if(data.inflows?.length) setInfs(data.inflows);
            if(data.settings?.botsettings){const bs=data.settings.botsettings;setBotSettings(bs);localStorage.setItem(KEYS.botsettings,JSON.stringify(bs));}
            if(data.drfs?.length){const d=data.drfs.map(drfFromSb);setDrfs(d);localStorage.setItem(KEYS.drfs,JSON.stringify(d));}
            if(data.inventory?.length){const d=data.inventory.map(invFromSb);setInventory(d);localStorage.setItem(KEYS.inventory,JSON.stringify(d));}
            if(data.stocklog?.length){const d=data.stocklog.map(moveFromSb);setStocklog(d);localStorage.setItem(KEYS.stocklog,JSON.stringify(d));}
            if(data.suppliers?.length){const d=data.suppliers.map(s=>({...s,companyName:s.company_name,contactNos:s.contact_nos,contactPerson:s.contact_person,paymentTerms:s.payment_terms,tinNo:s.tin_no,createdBy:s.created_by}));setSuppliers(d);localStorage.setItem(KEYS.suppliers,JSON.stringify(d));}
            if(data.subcontractors?.length){const d=data.subcontractors.map(s=>({...s,companyName:s.company_name,strengthsWeaknesses:s.strengths_weaknesses,contactNo:s.contact_no,paymentTerms:s.payment_terms,rateStructure:s.rate_structure,paymentStructure:s.payment_structure,locationNote:s.location_note,createdBy:s.created_by}));setSubcons(d);localStorage.setItem(KEYS.subcons,JSON.stringify(d));}
            if(data.settings?.vvip){const s=new Set(data.settings.vvip);setVvip(s);localStorage.setItem(KEYS.vvip,JSON.stringify([...s]));}
            if(data.projs&&Object.keys(data.projs).length){setProjs(data.projs);localStorage.setItem(KEYS.projects,JSON.stringify(data.projs));}
            // Sync to localStorage as cache
            const ls=localStorage.setItem.bind(localStorage);
            if(data.deals?.length)   ls(KEYS.deals,   JSON.stringify(data.deals));
            if(data.billings?.length)ls(KEYS.billings, JSON.stringify(data.billings));
            console.log("✅ FabHub: Loaded from Supabase — "+( data.deals?.length||0)+" deals");
          }
        }catch(sbErr){
          console.warn("Supabase load failed — using localStorage cache:", sbErr.message);
        }
      }
    };
    init();

    // Listen for auth state changes (login/logout)
    if(!supabase) return;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        // Silently sync Supabase data in background — never blocks login
        try {
          const { data: profile } = await supabase.from('user_profiles').select('*').eq('id', session.user.id).single();
          if (profile && profile.status === 'active') {
            const sess = { userId: session.user.id, name: profile.full_name, username: profile.username, role: profile.role, title: profile.title||profile.role };
            setSession(sess);
            setRole(profile.role);
            persist(KEYS.session, sess);
            loadAllFromSupabase(); // fire-and-forget, don't await
          }
        } catch(e) { /* Supabase profile not found — user logged in via localStorage, that's fine */ }
      } else if (event === 'SIGNED_OUT') {
        setSession(null);
        setRole(null);
        setAuthView("login");
        setPage("home");
        localStorage.removeItem(KEYS.session);
        localStorage.removeItem(KEYS.role);
      }
    });

    return () => subscription.unsubscribe();
  },[]);

  // Auto-refresh when user switches back to FabHub tab
  useEffect(()=>{
    const refresh=async()=>{
      if(!isSupabaseReady()||!session) return;
      try{
        const data=await sbLoadAll();
        if(data?.deals?.length) setDeals(data.deals.map(d=>({...d,ceNo:d.ce_no,ceType:d.ce_type,salesOwner:d.sales_owner,stage:normalizeStage(d.stage)})));
        if(data?.jos?.length) setJos(data.jos.map(j=>({...j,dealId:j.deal_id,joNo:j.jo_no})));
        if(Object.keys(data?.pcards||{}).length) setPcards(data.pcards);
        if(data?.checklist?.length) setChecklist(data.checklist.map(c=>({...c,projectId:c.deal_id,dealId:c.deal_id})));
      }catch(e){console.warn("Focus refresh:",e.message);}
    };
    window.addEventListener("focus",refresh);
    return()=>window.removeEventListener("focus",refresh);
  },[session]);

  // ── SUPABASE: Load all data ───────────────────────────────────────────────
  const loadAllFromSupabase = async () => {
    if(!isSupabaseReady()) return;
    const data = await sbLoadAll();
    if(!data) return;
    if(data.deals?.length)       setDeals(data.deals.map(d=>({...d,stage:normalizeStage(d.stage||d.stage),ceNo:d.ce_no,ceType:d.ce_type,product:d.product,salesOwner:d.sales_owner,bizDevSource:d.biz_dev_source,dateAcquired:d.date_acquired,dueDate:d.due_date,amountPaid:d.amount_paid||0,paymentStatus:d.payment_status,receiptType:d.receipt_type,commsGroup:d.comms_group,salesRepoLink:d.sales_repo_link,proposalFolderLink:d.proposal_folder_link})));
    if(data.jos?.length)         setJos(data.jos.map(j=>({...j,dealId:j.deal_id,joNo:j.jo_no,projectName:j.project_name,awardTrigger:j.award_trigger,triggerDate:j.trigger_date,startDate:j.start_date,commsLink:j.comms_link,scopeNotes:j.scope_notes,specialInstructions:j.special_instructions,budgetStatus:j.budget_status,issuedBy:j.issued_by,issuedDate:j.issued_date,aeAssigned:j.ae_assigned})));
    if(Object.keys(data.pcards||{}).length) setPcards(data.pcards);
    if(data.billings?.length)    setBillings(data.billings.map(m=>({...m,dealId:m.deal_id,invoiceNo:m.invoice_no,invoiceDate:m.invoice_date,dueDate:m.due_date,createdBy:m.created_by})));
    if(data.exps?.length)        setExps(data.exps.map(e=>({...e,dealId:e.deal_id,receiptNo:e.receipt_no,createdBy:e.created_by})));
    if(data.inflows?.length)     setInfs(data.inflows.map(i=>({...i,dealId:i.deal_id,refNo:i.ref_no})));
    if(data.prs?.length)         setPrs(data.prs.map(p=>({...p,dealId:p.deal_id,estimatedCost:p.estimated_cost,actualCost:p.actual_cost,budgetCategory:p.budget_category,qtyDelivered:p.qty_delivered,deliveryDate:p.delivery_date,drNo:p.dr_no,createdBy:p.created_by})));
    if(data.mreqs?.length)       setMreqs(data.mreqs.map(m=>({...m,dealId:m.deal_id,estimatedCost:m.estimated_cost,submittedBy:m.submitted_by})));
    if(data.breqs?.length)       setBreqs(data.breqs.map(b=>({...b,dealId:b.deal_id,dateNeeded:b.date_needed,approvedBy:b.approved_by,submittedBy:b.submitted_by})));
    if(data.addenda?.length)     setAddenda(data.addenda.map(a=>({...a,dealId:a.deal_id,receiptType:a.receipt_type,salesNotified:a.sales_notified,discoveredBy:a.discovered_by})));
    if(data.checklist?.length)   setChecklist(data.checklist.map(c=>({...c,projectId:c.deal_id,dealId:c.deal_id,assignedTo:c.assigned_to,dueDate:c.due_date,riskNote:c.risk_note,sortOrder:c.sort_order})));
    if(data.swatches?.length)    setSwatches(data.swatches.map(s=>({...s,dealId:s.deal_id,refLink:s.ref_link})));
    if(data.actLog?.length)      setActLog(data.actLog.map(a=>({...a,dealId:a.deal_id})));
    if(Object.keys(data.cashPositions||{}).length) setCashPos(convertSbCashPos(data.cashPositions));
    if(Object.keys(data.budgets||{}).length)       setBudgets(Object.fromEntries(Object.entries(data.budgets).map(([k,b])=>[k,{Materials:b.materials,Labor:b.labor,Overhead:b.overhead,Subcon:b.subcon,notes:b.notes}])));
    if(data.users?.length)       setUsers(data.users.map(u=>({id:u.id,username:u.username,name:u.full_name,role:u.role,title:u.title||u.role,status:u.status})));
  };


  // Converts flat Supabase cash_positions rows back to the rich banks-object format
  const convertSbCashPos=(raw)=>{
    const out={};
    Object.entries(raw).forEach(([date,c])=>{
      out[date]=c.banks?c:{
        ...emptyDayPosition(date),
        banks:{
          bpi:      {beg:"",book:"",end:String(c.bpi_end||0)},
          metro:    {beg:"",book:"",end:String(c.metrobank_end||0)},
          china:    {beg:"",book:"",end:String(c.chinabank_end||0)},
          bdo:      {beg:"",book:"",end:String(c.bdo_end||0)},
          security: {beg:"",book:"",end:String(c.secbank_end||0)},
          union:    {beg:"",book:"",end:String(c.unionbank_end||0)},
        },
        notes:c.notes||"",
        savedAt:c.updated_at||null,
      };
    });
    return out;
  };

  // ── SUPABASE FIELD MAPPERS (camelCase → snake_case) ─────────────────────────
  const toSbDeal = r=>({
    id:r.id, ce_no:r.ceNo, client:r.client, contact:r.contact,
    ce_type:r.ceType, product:r.product, stage:r.stage,
    priority:r.priority||"Normal", sales_owner:r.salesOwner||"",
    biz_dev_source:r.bizDevSource||"", date_acquired:r.dateAcquired||null,
    due_date:r.dueDate||null, value:Number(r.value)||0,
    invoiced:Number(r.invoiced)||0, amount_paid:Number(r.amountPaid)||0,
    payment_status:r.paymentStatus||"Unpaid", receipt_type:r.receiptType||"OR",
    withholding:r.withholding||false, comms_group:r.commsGroup||"",
    sales_repo_link:r.salesRepoLink||"", proposal_folder_link:r.proposalFolderLink||"",
    notes:r.notes||"", probability:Number(r.probability)||0,
    updated_at:new Date().toISOString(),
  });
  const toSbJO = r=>({
    id:r.id, deal_id:r.dealId, jo_no:r.joNo||r.joNum||"",
    client:r.client||"", ce_no:r.ceNo||"", project_name:r.projectName||r.contact||"",
    value:Number(r.value)||0, award_trigger:r.awardTrigger||"",
    trigger_date:r.triggerDate||null, trigger_note:r.triggerNote||"",
    pm1:r.pm1||"", pm2:r.pm2||"", pm3:r.pm3||"", coordinator:r.coordinator||"",
    ae_assigned:r.aeAssigned||"", start_date:r.startDate||null,
    comms_link:r.commsLink||"", scope_notes:r.scopeNotes||"",
    special_instructions:r.specialInstructions||"",
    budget_status:r.budgetStatus||"QS Budget Pending",
    status:r.status||"Active", issued_date:r.issuedDate||r.dateIssued||null,
  });
  const toSbBilling = r=>({
    id:r.id, deal_id:r.dealId, name:r.name||"", description:r.description||"",
    amount:Number(r.amount)||0, invoice_no:r.invoiceNo||"",
    invoice_date:r.invoiceDate||null, due_date:r.dueDate||null,
    status:r.status||"Draft", created_by:r.createdBy||"",
  });
  const toSbPayment = r=>({
    id:r.id, milestone_id:r.milestoneId, amount:Number(r.amount)||0,
    date:r.date||null, ref_no:r.refNo||"", note:r.note||"",
    recorded_by:r.recordedBy||"",
  });
  const toSbExpense = r=>({
    id:r.id, deal_id:r.dealId||null, date:r.date||null,
    category:r.category||"", description:r.description||"",
    amount:Number(r.amount)||0, supplier:r.supplier||"",
    receipt_no:r.receiptNo||"",
  });
  const toSbPR = r=>({
    id:r.id, deal_id:r.dealId||null, item:r.item||"",
    supplier:r.supplier||"", qty:Number(r.qty)||0, unit:r.unit||"",
    estimated_cost:Number(r.estimatedCost)||0, actual_cost:Number(r.actualCost)||0,
    budget_category:r.budgetCategory||"", status:r.status||"Pending Approval",
    qty_delivered:Number(r.qtyDelivered)||0, delivery_date:r.deliveryDate||null,
    dr_no:r.drNo||"", notes:r.notes||"", created_by:r.createdBy||"",
  });
  const toSbMR = r=>({
    id:r.id, deal_id:r.dealId||null, item:r.item||"", category:r.category||"",
    qty:Number(r.qty)||0, unit:r.unit||"", estimated_cost:Number(r.estimatedCost)||0,
    urgency:r.urgency||"Normal", purpose:r.purpose||"",
    status:r.status||"Submitted", submitted_by:r.submittedBy||"",
  });
  const toSbBR = r=>({
    id:r.id, deal_id:r.dealId||null, purpose:r.purpose||"",
    amount:Number(r.amount)||0, urgency:r.urgency||"Normal",
    date_needed:r.dateNeeded||null, status:r.status||"Pending",
    approved_by:r.approvedBy||"", submitted_by:r.submittedBy||"",
  });
  const toSbAddendum = r=>({
    id:r.id, deal_id:r.dealId, title:r.title||"", description:r.description||"",
    value:Number(r.value)||0, ce_no:r.ceNo||"",
    receipt_type:r.receiptType||"OR", withholding:r.withholding||false,
    status:r.status||"Discovered", sales_notified:r.salesNotified||false,
    discovered_by:r.discoveredBy||"",
  });
  const toSbSwatch = r=>({
    id:r.id, deal_id:r.dealId||null, name:r.name||"", category:r.category||"",
    qty:Number(r.qty)||0, unit:r.unit||"", supplier:r.supplier||"",
    ref_link:r.refLink||"", status:r.status||"To Buy", notes:r.notes||"",
  });
  const toSbChecklist = r=>({
    id:r.id, deal_id:r.dealId||null, type:r.type||"Task", title:r.title||"",
    description:r.description||"", status:r.status||"Pending",
    assigned_to:r.assignedTo||"", due_date:r.dueDate||null,
    risk_note:r.riskNote||"", sort_order:r.sortOrder||0,
  });
  const toSbBudget = (dealId,b)=>({
    deal_id:dealId, materials:Number(b.Materials)||0, labor:Number(b.Labor)||0,
    overhead:Number(b.Overhead)||0, subcon:Number(b.Subcon)||0, notes:b.notes||"",
    set_by:b.setBy||"",
  });
  const toSbActivity = r=>({
    id:r.id||("act"+Date.now()), deal_id:r.dealId||null,
    action:r.action||"", detail:r.detail||"",
    by:r.by||"", date:r.date||today, time:r.time||"",
  });

  // ── SUPABASE SYNC HELPERS ─────────────────────────────────────────────────
  // Fire-and-forget — never blocks the UI. Errors logged to console only.
  const isUUID=s=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s||''));
  // Reject payloads where any UUID-typed column holds a non-UUID value (old numeric IDs).
  const hasValidUUIDs=p=>(!p.id||isUUID(p.id))&&(!p.deal_id||isUUID(p.deal_id))&&(!p.milestone_id||isUUID(p.milestone_id))&&(!p.card_id||isUUID(p.card_id));
  const sbSync=(table,records,mapper)=>{
    if(!isSupabaseReady()||!records?.length) return;
    Promise.all(records.map(r=>{
      const payload=mapper?mapper(r):r;
      if(!hasValidUUIDs(payload)) return Promise.resolve();
      return sbUpsert(table,payload,'id');
    })).catch(e=>console.error("FabHub sbSync "+table+":",e.message));
  };
  const sbSyncOne=(table,record,mapper)=>{
    if(!isSupabaseReady()||!record) return;
    const payload=mapper?mapper(record):record;
    if(!hasValidUUIDs(payload)) return;
    sbUpsert(table,payload,'id')
      .catch(e=>console.error("FabHub sbSyncOne "+table+":",e.message));
  };
  const sbSyncDelete=(table,id)=>{
    if(!isSupabaseReady()||!id) return;
    sbDelete(table,id).catch(e=>console.error("FabHub sbDelete "+table+":",e.message));
  };

  // ── PERSIST (localStorage + Supabase dual-write) ─────────────────────────
  const persist=useCallback((key,val)=>{
    setSync("saving");
    // Write ONLY to Supabase — localStorage removed as primary storage
    // Keep a lightweight cache for offline resilience
    try{
      localStorage.setItem(key,JSON.stringify(val));
      setTimeout(()=>setSync("saved"),300);
    }catch{setSync("error");}
    // Supabase is the source of truth — sync immediately
    if(!isSupabaseReady()) return;
    try{
      if(key===KEYS.deals)     sbSync("deals",     val, toSbDeal);
      if(key===KEYS.jos)       sbSync("job_orders", val, toSbJO);
      if(key===KEYS.expenses)  sbSync("expenses",   val, toSbExpense);
      if(key===KEYS.prs)       sbSync("purchase_requests", val, toSbPR);
      if(key===KEYS.mreqs)     sbSync("material_requests", val, toSbMR);
      if(key===KEYS.breqs)     sbSync("budget_requests",   val, toSbBR);
      if(key===KEYS.addenda)   sbSync("addenda",    val, toSbAddendum);
      if(key===KEYS.swatches)  sbSync("swatches",   val, toSbSwatch);
      if(key===KEYS.checklist) sbSync("checklists",val,toSbChecklist);
      if(key===KEYS.actlog)    sbSync("activity_log",val,toSbActivity);
      if(key===KEYS.billings){
        val.forEach(m=>{
          if(!isUUID(m.id)) return;
          sbSyncOne("billing_milestones",m,toSbBilling);
          (m.payments||[]).forEach(p=>{ if(isUUID(p.id)) sbSyncOne("billing_payments",{...p,milestoneId:m.id},toSbPayment); });
        });
      }
      if(key===KEYS.budgets){
        Object.entries(val||{}).forEach(([dealId,b])=>{
          if(!isUUID(dealId)) return;
          sbUpsert("project_budgets",toSbBudget(dealId,b),"deal_id")
            .catch(e=>console.error("budget sync:",e.message));
        });
      }
      if(key===KEYS.cashPos){
        Object.entries(val||{}).forEach(([date,c])=>{
          const payload={
            date,
            bpi_end:      Number(c.banks?.bpi?.end)     ||0,
            metrobank_end:Number(c.banks?.metro?.end)   ||0,
            chinabank_end:Number(c.banks?.china?.end)   ||0,
            bdo_end:      Number(c.banks?.bdo?.end)     ||0,
            secbank_end:  Number(c.banks?.security?.end)||0,
            unionbank_end:Number(c.banks?.union?.end)   ||0,
            notes:c.notes||"",
          };
          sbUpsert("cash_positions",payload,"date")
            .catch(e=>console.error("cash sync:",e.message));
        });
      }
    }catch(e){console.error("FabHub persist sync error:",e.message);}
  },[]);

  const upUsers    =useCallback(fn=>setUsers(p=>{const n=fn(p);persist(KEYS.users,n);return n;}),[persist]);
  const upCashPos  =useCallback(fn=>setCashPos(p=>{const n=fn(p);persist(KEYS.cashPos,n);return n;}),[persist]);
  // Activity log helper — called whenever something meaningful happens
  const logActivity=(dealId,action,detail,by)=>{
    const entry={id:uid(),dealId,action,detail,by:by||session?.name||"System",date:today,time:new Date().toLocaleTimeString("en-PH",{hour:"2-digit",minute:"2-digit"})};
    setActLog(prev=>{const next=[entry,...prev].slice(0,500);persist(KEYS.actlog,next);return next;});
    if(action==="PM Update"){
      const deal=deals.find(d=>d.id===dealId);
      sendTelegramNotification("ops",`📝 <b>PM Update</b>\n${deal?.client||dealId}\nBy: ${entry.by} · ${today}\n${detail||""}`);
    }
  };
  const upPcards    =useCallback(fn=>setPcards(p=>{const n=fn(p);persist(KEYS.pcards,n);return n;}),[persist]);

  // One-time migration: push all localStorage data to Supabase
  const migrateToCloud = useCallback(async () => {
    if (!isSupabaseReady()) { toastEmit("Supabase is not connected — check environment variables","error",5000); return; }
    toastEmit("Pushing all data to cloud…","info",2500);
    const pairs = [
      [KEYS.deals,    deals],   [KEYS.jos,      jos],
      [KEYS.expenses, exps],    [KEYS.prs,      prs],
      [KEYS.mreqs,    mreqs],   [KEYS.breqs,    breqs],
      [KEYS.addenda,  addenda], [KEYS.swatches, swatches],
      [KEYS.checklist,checklist],[KEYS.actlog,   actLog],
      [KEYS.billings, billings],[KEYS.budgets,  budgets],
      [KEYS.cashPos,  cashPositions],
    ];
    pairs.forEach(([key,val]) => { if(val && (Array.isArray(val)?val.length:Object.keys(val).length)) persist(key,val); });
    // Inflows (not in persist mapping)
    if (infs?.length) {
      Promise.all(infs.map(r => sbUpsert("inflows", {
        id:r.id, deal_id:r.dealId||r.projectId||null, date:r.date||r.month||null,
        amount:Number(r.amount)||0, source:r.source||"", ref_no:r.refNo||"", note:r.note||""
      }, 'id'))).catch(e=>console.error("inflows migrate:",e.message));
    }
    setTimeout(()=>toastEmit("Done! All data pushed to Supabase. Refresh Safari to see it.","success",6000),1200);
  },[persist, deals, jos, exps, prs, mreqs, breqs, addenda, swatches, checklist, actLog, billings, budgets, cashPositions, infs]);
  const upInventory =useCallback(fn=>setInventory(p=>{const n=fn(p);persist(KEYS.inventory,n);return n;}),[persist]);
  const upStocklog  =useCallback(fn=>setStocklog(p=>{const n=fn(p);persist(KEYS.stocklog,n);return n;}),[persist]);
  const upSuppliers =useCallback(fn=>setSuppliers(p=>{const n=fn(p);persist(KEYS.suppliers,n);return n;}),[persist]);
  const upSubcons   =useCallback(fn=>setSubcons(p=>{const n=fn(p);persist(KEYS.subcons,n);return n;}),[persist]);

  const addInventoryItem=(item)=>upInventory(iv=>{
    const rec={...item,id:uid(),code:nextItemCode(iv),createdAt:today,createdBy:session?.name||role};
    if(isSupabaseReady()) sbInsert('inventory_items',invToSb(rec)).catch(()=>{});
    return[...iv,rec];
  });
  const updateInventoryItem=(id,ch)=>{
    upInventory(iv=>iv.map(i=>i.id===id?{...i,...ch,lastUpdated:today}:i));
    if(isSupabaseReady()) sbUpdate('inventory_items',id,invToSb({...ch,lastUpdated:today})).catch(()=>{});
  };
  const deleteInventoryItem=(id)=>{
    upInventory(iv=>iv.filter(i=>i.id!==id));
    if(isSupabaseReady()) sbDelete('inventory_items',id).catch(()=>{});
  };

  // Supplier CRUD
  const addSupplier=(item)=>upSuppliers(ss=>{
    const rec={...item,id:uid(),createdAt:today,createdBy:session?.name||role};
    if(isSupabaseReady()) sbInsert('suppliers',supToSb(rec)).catch(()=>{});
    return[...ss,rec];
  });
  const updateSupplier=(id,ch)=>{
    upSuppliers(ss=>ss.map(s=>s.id===id?{...s,...ch}:s));
    if(isSupabaseReady()) sbUpdate('suppliers',id,supToSb(ch)).catch(()=>{});
  };
  const deleteSupplier=(id)=>{
    upSuppliers(ss=>ss.filter(s=>s.id!==id));
    if(isSupabaseReady()) sbDelete('suppliers',id).catch(()=>{});
  };
  // Subcontractor CRUD
  const addSubcon=(item)=>upSubcons(ss=>{
    const rec={...item,id:uid(),createdAt:today,createdBy:session?.name||role};
    if(isSupabaseReady()) sbInsert('subcontractors',subconToSb(rec)).catch(()=>{});
    return[...ss,rec];
  });
  const updateSubcon=(id,ch)=>{
    upSubcons(ss=>ss.map(s=>s.id===id?{...s,...ch}:s));
    if(isSupabaseReady()) sbUpdate('subcontractors',id,subconToSb(ch)).catch(()=>{});
  };
  const deleteSubcon=(id)=>{
    upSubcons(ss=>ss.filter(s=>s.id!==id));
    if(isSupabaseReady()) sbDelete('subcontractors',id).catch(()=>{});
  };

  // One-time seed from spreadsheet data
  const SEED_SUPPLIERS = [
    {rating:"5 - EXCELLENT AND RELIABLE",companyName:"Durawood Construction and Lumber Supply Inc.",email:"durawoodcons@yahoo.com.ph",materials:"Assorted Construction Supply",contactNos:"645-39-77 / 09228104751",contactPerson:"Mr. Wilson",paymentTerms:"60 Days",address:"#177 Sumulong High-way cor. B Soliven Ave. Mayamot, Antipolo City",tinNo:"000-096-499-000",notes:""},
    {rating:"4 - GOOD",companyName:"Miles Merchandising",email:"",materials:"Assorted Construction Supply",contactNos:"941-38-36",contactPerson:"",paymentTerms:"Cash Basis",address:"41 Bayan-Bayanan Avenue, Concepcion, Marikina, 1807 Metro Manila",tinNo:"209-086-074-000",notes:""},
    {rating:"4 - GOOD",companyName:"MLC Hardware",email:"mlchardware@yahoo.com",materials:"Assorted Construction Supply",contactNos:"941-06-92 / 941-4055",contactPerson:"Ms. Ayen/Mr. Johnson",paymentTerms:"30-45 Days",address:"No. 36 D, Bayanbayanan Avenue, Concepcion, Marikina, 1807 Metro Manila",tinNo:"235-528-886-000",notes:""},
    {rating:"2 - MODERATE",companyName:"Peng-Yong Hardware & Construction Supply",email:"",materials:"Assorted Construction Supply",contactNos:"682-1201 / 0906-565-8607",contactPerson:"Ms. Marjorie/ Ms. Maria Lorraine",paymentTerms:"30 Days",address:"Sumulong Antipolo City",tinNo:"",notes:""},
    {rating:"5 - EXCELLENT AND RELIABLE",companyName:"Trima Industrial Sales",email:"",materials:"Paint and Screws",contactNos:"475-2125 / 475-2224",contactPerson:"",paymentTerms:"Cash Basis",address:"No. 21 Bayan Bayanan Ave., Concepcion, Marikina City",tinNo:"190-582-296-000",notes:""},
    {rating:"3 - ACCEPTABLE",companyName:"Auto-Ad Trading",email:"auto.ad_trading@yahoo.com",materials:"Acrylic",contactNos:"261-24-70/71",contactPerson:"Ms. Tina/Allen",paymentTerms:"90 Days",address:"Casa Corazon Bldg. Earnshaw St. Sampaloc Barangay 457",tinNo:"912-382-767-000",notes:""},
    {rating:"4 - GOOD",companyName:"Signmate",email:"signmatemarketing01@gmail.com",materials:"MDF and Acrylic",contactNos:"439-3346",contactPerson:"Ms. Dianne / Paul Samonte",paymentTerms:"30 Days",address:"916 Aurora Blvd. Quezon City",tinNo:"",notes:""},
    {rating:"3 - ACCEPTABLE",companyName:"CWC Prime Industries Corporation",email:"sales_corian@primegroup.ph",materials:"Quartz Countertop",contactNos:"8010-986 / 843-9760 / 844-4320 / 0917-688-8646",contactPerson:"Mr. Miguel",paymentTerms:"Cash Basis",address:"",tinNo:"",notes:""},
    {rating:"4 - GOOD",companyName:"Euro Asia (Veneer Laminate)",email:"angcedric@aim.com",materials:"Stone/Quartz Countertop",contactNos:"705-1408 Loc. 103/09228002470",contactPerson:"Mr. Cedric Ang",paymentTerms:"30 Days",address:"206-B M. Paterno St. San Juan City, Metro Manila",tinNo:"004-541-794-000",notes:""},
    {rating:"4 - GOOD",companyName:"FOURTH DIMENSION",email:"lina_iligan@ymail.com",materials:"Vasari",contactNos:"570-3380 / 0977-802-8614",contactPerson:"Ms. Lina",paymentTerms:"Cash Basis",address:"",tinNo:"",notes:""},
    {rating:"5 - EXCELLENT AND RELIABLE",companyName:"World Class Laminate Inc.",email:"info@worldclasslaminate.com",materials:"Laminated Board/Quartz Countertop",contactNos:"374-8738 / 245-3767",contactPerson:"Ms. Alyana / Cherma / Ms. Ven",paymentTerms:"Cash Basis",address:"88 Jenny's Avenue, Maybunga Pasig City",tinNo:"230-792-490-001",notes:""},
    {rating:"5 - EXCELLENT AND RELIABLE",companyName:"Al Metal Master Inc.",email:"",materials:"Assorted Metal",contactNos:"941-3336",contactPerson:"M. Jaja",paymentTerms:"Cash Basis",address:"532 J.P Rizal St. Marikina City",tinNo:"",notes:""},
    {rating:"4 - GOOD",companyName:"Metalbase",email:"",materials:"Assorted Metal",contactNos:"",contactPerson:"",paymentTerms:"Cash Basis",address:"",tinNo:"",notes:"Payment Method: No Bank/Terms (Cash Only)"},
    {rating:"2 - MODERATE",companyName:"Takezo Industrial Supply",email:"takezo.industrialsupply@yahoo.com",materials:"Polycarbonate and Accessories",contactNos:"0925-897-6706 / 748-4311 / 370-9091 / 796-0980 / 642-0659",contactPerson:"Mr. Joey",paymentTerms:"Cash Basis",address:"1416 B. Velasquez St. Tondo Manila",tinNo:"",notes:""},
    {rating:"5 - EXCELLENT AND RELIABLE",companyName:"JTCI Carpet Gallery Corporation",email:"jovetcarpets_05@yahoo.com",materials:"Carpet",contactNos:"401-85-37/401-86-77/ 0920-282-4187 / 655-1643",contactPerson:"Ms. Rosana Babes",paymentTerms:"7 Days",address:"Unit 304 - 3rd Floor Jeb Arcade Realty & Builders #101 Amang Rodriguez Ave. Rosario, Pasig City",tinNo:"008-605-986-000",notes:""},
    {rating:"2 - MODERATE",companyName:"Fortress Glass Supply",email:"gcrystalglass@yahoo.com / fortressquency@gmail.com",materials:"Mirror/Tempered/Ordinary Glass",contactNos:"647-8888 / 470-0704",contactPerson:"Ms. Anna / Mae",paymentTerms:"Cash Basis",address:"71, Gertrudes Street, Antipolo, 1870 Rizal",tinNo:"151-555-637-003",notes:""},
    {rating:"4 - GOOD",companyName:"MRDH Glass & Aluminum Enterprises",email:"",materials:"Mirror/Tempered/Ordinary Glass",contactNos:"948-9087",contactPerson:"Ms. Riza",paymentTerms:"Cash Basis",address:"128-A B. G. Molina Street, Marikina, Metro Manila",tinNo:"174-990-316-000",notes:""},
    {rating:"5 - EXCELLENT AND RELIABLE",companyName:"Authentic Wood Products International Inc.",email:"authentic_wood@yahoo.com",materials:"Cut Out Materials/Laser Cutting",contactNos:"942-3735 / 940-4519",contactPerson:"Ms. Anabelle Calalo / Mr. Mark",paymentTerms:"Cash Basis",address:"",tinNo:"",notes:"Wood Cutting & Engraving"},
    {rating:"4 - GOOD",companyName:"FULL CREATIVE INNOVATION (FCI)",email:"sales.fcienterprises@gmail.com",materials:"Print/Signages",contactNos:"0915-410-5134 / 754-9259",contactPerson:"Sir Fritz",paymentTerms:"Cash Basis",address:"#179 Market Ave. Pasig City",tinNo:"",notes:""},
    {rating:"4 - GOOD",companyName:"KENT FLOORS",email:"",materials:"Vinyl Tiles",contactNos:"0917-861-2316",contactPerson:"Ms. Jhoza",paymentTerms:"Cash Basis",address:"Evangelista Cor. Marcos Highway (Near SM Marikina, Green Gate)",tinNo:"",notes:""},
    {rating:"4 - GOOD",companyName:"Hilongos Industrial Supply",email:"",materials:"Assorted Tools",contactNos:"682-1255",contactPerson:"Mr. Jm",paymentTerms:"30 Days",address:"#2 Saenz Arcade, Sumulong Hi-way Mayamot, Antipolo City",tinNo:"",notes:""},
    {rating:"3 - ACCEPTABLE",companyName:"DMI Metal Industries",email:"dmimetalindustries@gmail.com",materials:"Accordion Door Installation/Metal",contactNos:"570-3114 / 710-3570",contactPerson:"Ms. Arra",paymentTerms:"Cash Basis",address:"#11 Cattleya St. Vista Hermosa Village San Mateo Rizal",tinNo:"",notes:""},
    {rating:"5 - EXCELLENT AND RELIABLE",companyName:"Mega Packaging Corporation",email:"",materials:"Stretch Film/Bubble Wrap/Office Supply",contactNos:"0923-953-8218",contactPerson:"Ms. Jane",paymentTerms:"Cash Basis",address:"Canlubang Calamba Laguna",tinNo:"003-057-431-000",notes:""},
    {rating:"3 - ACCEPTABLE",companyName:"Hafele Philippines, Inc.",email:"",materials:"Accessories",contactNos:"842-3353",contactPerson:"",paymentTerms:"Cash Basis",address:"Levi Mariano Ave., Brgy. Ususan Taguig city",tinNo:"001-707-726-000",notes:""},
    {rating:"3 - ACCEPTABLE",companyName:"Joaquin Shoe Supply",email:"",materials:"Rugby",contactNos:"646-1881",contactPerson:"",paymentTerms:"Cash Basis",address:"450 E. DELA PAZ STREET, MARIKINA METRO MANILA",tinNo:"100-145-045-000",notes:""},
    {rating:"4 - GOOD",companyName:"Olympus Marketing Inc.",email:"mjebelia@olympus.com.ph",materials:"Lighting Fixtures",contactNos:"941-7978 / 0922-5310-757",contactPerson:"Ms. Mary Jane Belia",paymentTerms:"Cash Basis",address:"#17 A 1st Avenue., Sta. Maria Industrial Subd. Bagumbayan, Taguig City",tinNo:"",notes:""},
    {rating:"4 - GOOD",companyName:"Pingping Shoe Supply Corporation",email:"",materials:"Rugby/Triple 8/Leather",contactNos:"997-5199",contactPerson:"Ms. Yolie/Ms. Pat",paymentTerms:"Cash Basis",address:"83 E. Manalo Sto. Niño Marikina City",tinNo:"",notes:""},
    {rating:"4 - GOOD",companyName:"Shell Canvas",email:"",materials:"Fabric",contactNos:"921-8546 / 922-7797 / 922-8708",contactPerson:"Mr. Bobby / Ms. Lilibeth / Ms. Jenny",paymentTerms:"Cash Basis",address:"816 EDSA Cor. Kamias Road, Quezon City",tinNo:"",notes:""},
    {rating:"3 - ACCEPTABLE",companyName:"LEGOBUILDERS INC.",email:"www.legobuildersinc.com",materials:"Bricks",contactNos:"09278587110 /09062987574",contactPerson:"Mr. JC Delosreyes / Ms. Irene",paymentTerms:"Cash Basis",address:"U/1-2, Casa Royale Building, 558 Cabildo St. Intramuros, Manila.",tinNo:"",notes:""},
    {rating:"5 - EXCELLENT AND RELIABLE",companyName:"FORMICA LAMINATES",email:"",materials:"Laminates",contactNos:"+639652371702",contactPerson:"Mr. Jeorge",paymentTerms:"Cash Basis",address:"8009, 1709 West Service Rd., Merville, Parañaque City",tinNo:"",notes:""},
    {rating:"4 - GOOD",companyName:"GRAND JADE HARDWARE",email:"",materials:"Assorted Construction Supply",contactNos:"+639230856115",contactPerson:"Ms. Rhea",paymentTerms:"15 Days",address:"JP Rizal St. Malanday, Marikina City",tinNo:"009-324-876-000",notes:""},
    {rating:"5 - EXCELLENT AND RELIABLE",companyName:"LEXTON MARKETING CORPORATION",email:"",materials:"Plumbing Fixtures, Accessories, and Laminates",contactNos:"63 2 5318-5215",contactPerson:"Ms. Je-Anne/Ria",paymentTerms:"30 Days",address:"280 9th St. Cor. 8th Avenue, Grace Park, Caloocan City",tinNo:"",notes:""},
    {rating:"5 - EXCELLENT AND RELIABLE",companyName:"Modern Art / Artmart Signage Materials Trading",email:"",materials:"Acrylic/Sticker/MDF",contactNos:"+639175081777",contactPerson:"Ms. Addie",paymentTerms:"Cash Basis",address:"12 Broadway Avenue Brgy. Mariana New Manila, QC",tinNo:"235-579-712-0001",notes:""},
    {rating:"5 - EXCELLENT AND RELIABLE",companyName:"Contractors Home",email:"chte_corp@yahoo.com",materials:"Assorted Tools",contactNos:"+639396065367",contactPerson:"Mr. Jai-Jai",paymentTerms:"7 Days",address:"116 Lilac St. Concepcion Dos Marikina City",tinNo:"010-551-650-000",notes:""},
    {rating:"4 - GOOD",companyName:"RGB/VR CONCEPT",email:"rrlk@ymail.com",materials:"Print/Signages",contactNos:"+639568395213",contactPerson:"Ms. Alyssandra",paymentTerms:"30 Days",address:"90 West Riverside St. Brgy. San Antonio, Quezon City",tinNo:"010-119-786-000",notes:""},
    {rating:"5 - EXCELLENT AND RELIABLE",companyName:"CPRO Home Hardware",email:"",materials:"Drawer Guide/Accessories",contactNos:"8981-1598",contactPerson:"Mr. Gerald Shi",paymentTerms:"Cash Basis",address:"321-A Fernando Poe Jr Ave, San Antonio, QC",tinNo:"454-659-870-000",notes:""},
    {rating:"4 - GOOD",companyName:"Seato Trading Company Inc.",email:"",materials:"MDF/Plywood/Plyboard",contactNos:"+639566088309",contactPerson:"Ms. Jasmin Sultan",paymentTerms:"Cash Basis",address:"110 20th Ave., Cor. P. Tuazon, Cubao, QC",tinNo:"000-389-723-000",notes:""},
    {rating:"5 - EXCELLENT AND RELIABLE",companyName:"Vertiflute",email:"info@vertiflute.com",materials:"Fluted/Tile Trim/Accessories",contactNos:"+639457821888",contactPerson:"Ms. Meg/Sir. Kyle",paymentTerms:"Terms",address:"G/F Midway Court Bldg. EDSA, Wack-wack, Mandaluyong",tinNo:"010-063-229",notes:""},
    {rating:"4 - GOOD",companyName:"PHILUX",email:"south@philux.ph",materials:"Furnitures",contactNos:"+639773259506",contactPerson:"",paymentTerms:"Cash Basis",address:"",tinNo:"",notes:""},
    {rating:"4 - GOOD",companyName:"Kuysen",email:"",materials:"Furnitures",contactNos:"",contactPerson:"Mr. Angelo Irabon",paymentTerms:"Cash Basis",address:"",tinNo:"",notes:""},
    {rating:"5 - EXCELLENT AND RELIABLE",companyName:"8GADS PRINTING SUPPLY",email:"",materials:"Lighting Fixtures/Power Supply",contactNos:"+639661424177",contactPerson:"Mr. Vladimir",paymentTerms:"Terms",address:"",tinNo:"",notes:""},
    {rating:"4 - GOOD",companyName:"PANDA CONSTRUCTION SUPPLY",email:"",materials:"Assorted Construction Supply",contactNos:"",contactPerson:"Ms. Mary Ann",paymentTerms:"Terms",address:"",tinNo:"000-326-384-000",notes:""},
    {rating:"5 - EXCELLENT AND RELIABLE",companyName:"STAR LIGHTING",email:"",materials:"Lighting Fixtures",contactNos:"+639288750509",contactPerson:"Ms. Kristina Casela",paymentTerms:"Cash Basis",address:"1322 CM RECTO AVENUE TONDO MANILA",tinNo:"",notes:""},
    {rating:"5 - EXCELLENT AND RELIABLE",companyName:"NEW SQ LUMBER AND HARDWARE CORP",email:"",materials:"Plywood/Plyboard",contactNos:"",contactPerson:"Ms. Linda, Ms. Geraldine",paymentTerms:"Terms",address:"210 LOPEZ JAENA ST. COR. BARASOAIN LITTLE BAGUIO SAN JUAN",tinNo:"007-069-204-000",notes:""},
    {rating:"5 - EXCELLENT AND RELIABLE",companyName:"MAKATI FINEST LUMBER & HARDWARE",email:"",materials:"Plywood/Plyboard",contactNos:"",contactPerson:"Ms. Shaina Lim/Mr. Jaime Lim",paymentTerms:"Terms",address:"431 J. P. Rizal St, Makati City, Metro Manila",tinNo:"",notes:""},
    {rating:"5 - EXCELLENT AND RELIABLE",companyName:"TEXTURIA ARCHITECTURAL FINISHES",email:"",materials:"Sticker",contactNos:"+639178153392",contactPerson:"Mr. Julian Ong, Mr. Billy Bautista",paymentTerms:"Cash Basis",address:"No. 8 A. De Leon St., Concepcion Uno, Marikina City",tinNo:"",notes:""},
    {rating:"4 - GOOD",companyName:"ALUMINUM POWER MARKETING CORPORATION",email:"",materials:"Assorted Metal/ACP/Accessories",contactNos:"",contactPerson:"Ms. Arlyn",paymentTerms:"Cash Basis",address:"",tinNo:"",notes:""},
    {rating:"5 - EXCELLENT AND RELIABLE",companyName:"DIZON MEDIA ADVERTISING",email:"",materials:"Wires/Cyno Glue",contactNos:"+639061041657",contactPerson:"Ms. Ann Barcia",paymentTerms:"Terms",address:"Trading OPC East Los Angeles, Novaliches, Quezon City",tinNo:"",notes:""},
    {rating:"4 - GOOD",companyName:"BMMC MULTI SALES CORPORATION",email:"",materials:"Electrical Materials",contactNos:"",contactPerson:"",paymentTerms:"Cash Basis",address:"F. Torres St, Binondo, Manila, 1008 Metro Manila",tinNo:"",notes:""},
    {rating:"5 - EXCELLENT AND RELIABLE",companyName:"GERMIKE PACKAGING SUPPLIES",email:"",materials:"Stretch Film/Bubble Wrap/Office Supply",contactNos:"",contactPerson:"",paymentTerms:"Cash Basis",address:"",tinNo:"",notes:""},
    {rating:"5 - EXCELLENT AND RELIABLE",companyName:"SPECTRUM BY LARRY'S",email:"",materials:"Fabric",contactNos:"",contactPerson:"",paymentTerms:"Cash Basis",address:"5608 South Super Highway Palanan, Makati City",tinNo:"008-792-225-000",notes:""},
    {rating:"5 - EXCELLENT AND RELIABLE",companyName:"QUEENSWAY REBO BAMBOO OPC",email:"",materials:"Fluted/Laminate",contactNos:"+639177082159",contactPerson:"Ms. Jaja",paymentTerms:"Cash Basis",address:"Unit 49 CW Home Depot, Dona Julia Vargas Pasig City",tinNo:"",notes:""},
    {rating:"5 - EXCELLENT AND RELIABLE",companyName:"PHILBOARDS",email:"",materials:"Laminated Board",contactNos:"",contactPerson:"Ms. Mj",paymentTerms:"Cash Basis",address:"",tinNo:"",notes:""},
    {rating:"4 - GOOD",companyName:"HIGH-TOP MERCHANDISING INC",email:"",materials:"Stone/Metal Laser Cutting",contactNos:"+639190792827",contactPerson:"Ms. Jen",paymentTerms:"Cash Basis",address:"227 Biak na bato, Brgy. Manresa, Quezon City",tinNo:"",notes:""},
    {rating:"4 - GOOD",companyName:"PRIMARK",email:"",materials:"Stone/Wood/Metal Laser Cutting",contactNos:"+639177053894",contactPerson:"Ms. Leady",paymentTerms:"Cash Basis",address:"",tinNo:"",notes:""},
    {rating:"3 - ACCEPTABLE",companyName:"BW GLASS VENTURES",email:"",materials:"Glass Supply/Installation",contactNos:"",contactPerson:"Ms. Lyra/ Mr. Jaime",paymentTerms:"Cash Basis",address:"",tinNo:"",notes:""},
    {rating:"5 - EXCELLENT AND RELIABLE",companyName:"AGC LED",email:"",materials:"Electrical Materials",contactNos:"+639068770391",contactPerson:"Mr. Sergio Labauanan",paymentTerms:"Cash Basis",address:"",tinNo:"",notes:""},
    {rating:"5 - EXCELLENT AND RELIABLE",companyName:"AMPERE LIGHTS TRADING",email:"",materials:"Lighting Fixtures",contactNos:"+639913349137",contactPerson:"Ms. Ghene",paymentTerms:"Cash Basis",address:"",tinNo:"",notes:""},
    {rating:"5 - EXCELLENT AND RELIABLE",companyName:"COB/ YANNY",email:"",materials:"Electrical Materials",contactNos:"+639563520972",contactPerson:"Ms. Yanny",paymentTerms:"Cash Basis",address:"",tinNo:""},
    {rating:"4 - GOOD",companyName:"PACIFIC GLASS CORPORATION",email:"",materials:"Glass Supply/Installation",contactNos:"9544168035/ 9175660785",contactPerson:"Ms. NJ Calmerin/ Mr. Herminigildo",paymentTerms:"Cash Basis",address:"",tinNo:"",notes:""},
    {rating:"5 - EXCELLENT AND RELIABLE",companyName:"JUAN LUKAS ELECTRICAL SUPPLY",email:"",materials:"Panel Board/Electrical",contactNos:"+639176530430",contactPerson:"Mr. Michael",paymentTerms:"Cash Basis",address:"",tinNo:"",notes:""},
    {rating:"4 - GOOD",companyName:"AC BOX ALL IN ONE CORP",email:"",materials:"Panel Board/Electrical",contactNos:"+6319029147",contactPerson:"Ms. Diana",paymentTerms:"Cash Basis",address:"38 2nd Street Brgy. Sto Nino, Marikina City",tinNo:"",notes:""},
    {rating:"4 - GOOD",companyName:"DELTATEK ELECTRICAL SUPPLIES TRADING",email:"",materials:"Panel Board/Electrical",contactNos:"+639985493623",contactPerson:"Ms. Aira",paymentTerms:"Cash Basis",address:"",tinNo:"",notes:""},
    {rating:"4 - GOOD",companyName:"EUROBEL MARKETING",email:"www.eurobel.com.ph",materials:"Carpet",contactNos:"+639171528131",contactPerson:"Ms. Gillian",paymentTerms:"Cash Basis",address:"",tinNo:"",notes:""},
    {rating:"4 - GOOD",companyName:"AIRJELLE ENTERPRISES CO INC",email:"airjelle.enterprises2024@gmail.com",materials:"Office Supplies",contactNos:"+639300801526",contactPerson:"Mr. Francis",paymentTerms:"Cash Basis",address:"",tinNo:"",notes:""},
    {rating:"3 - ACCEPTABLE",companyName:"STYO BOLT",email:"",materials:"Styro",contactNos:"+639353307270",contactPerson:"Mr. Macalanda",paymentTerms:"Cash Basis",address:"",tinNo:"",notes:""},
    {rating:"4 - GOOD",companyName:"MKM MERCHANDISE",email:"",materials:"Electrical Materials",contactNos:"+639167312997",contactPerson:"Mr. Fernando",paymentTerms:"Cash Basis",address:"",tinNo:"331-383-897-000",notes:""},
    {rating:"4 - GOOD",companyName:"ACE HARDWARE SM MASINAG",email:"",materials:"Tools",contactNos:"+639992210941",contactPerson:"Ms. Ronaliza Tarala",paymentTerms:"Cash Basis",address:"",tinNo:"",notes:""},
    {rating:"4 - GOOD",companyName:"LND SIGN CORP",email:"",materials:"Print/Signages",contactNos:"+639564996605",contactPerson:"Ms. Cha",paymentTerms:"Cash Basis",address:"",tinNo:"",notes:""},
  ];

  const SEED_SUBCONS = [
    {rating:"YES - ACCEPTABLE",specialty:"General Works",strengthsWeaknesses:"W: Material request details  S: Scope of Work",contactNo:"0915-017-0014",companyName:"Benedick Jamito",paymentTerms:"60 Days",address:"#177 Sumulong Hi-way cor. B Soliven Ave. Mayamot, Antipolo City",rateStructure:"Project Rate",paymentStructure:"50% Start/50% Completion",locationNote:"",remarks:"",notes:""},
    {rating:"YES - ACCEPTABLE",specialty:"General Works",strengthsWeaknesses:"W: Material request details/Scope of Work",contactNo:"0915-827-5419",companyName:"Benedicto Pantriore",paymentTerms:"Cash Basis",address:"41 Bayan-Bayanan Avenue, Concepcion, Marikina, 1807 Metro Manila",rateStructure:"Project Rate",paymentStructure:"50% Start/50% Completion",locationNote:"",remarks:"",notes:""},
    {rating:"YES - ACCEPTABLE",specialty:"Stone Works (Supply & Install)",strengthsWeaknesses:"W: Communication  S: Product and Samples",contactNo:"0999-158-5829",companyName:"John Piang Ometer",paymentTerms:"30-45 Days",address:"No. 36 D, Bayanbayanan Avenue, Concepcion, Marikina, 1807 Metro Manila",rateStructure:"Project Rate",paymentStructure:"50% Start/50% Completion",locationNote:"",remarks:"",notes:""},
    {rating:"YES - ACCEPTABLE",specialty:"General Works",strengthsWeaknesses:"W: Material request details  S: Contract Amount",contactNo:"0995-147-0400",companyName:"Rising/Jovic Susim",paymentTerms:"30 Days",address:"Sumulong Antipolo City",rateStructure:"Project Rate",paymentStructure:"50% Start/50% Completion",locationNote:"",remarks:"",notes:""},
    {rating:"YES - ACCEPTABLE",specialty:"General Works",strengthsWeaknesses:"W: Material request details  S: Communication",contactNo:"0917-871-3284",companyName:"Racem/Jhun Alzona",paymentTerms:"Cash Basis",address:"No. 21 Bayan Bayanan Ave., Concepcion, Marikina City",rateStructure:"Project Rate",paymentStructure:"50% Start/50% Completion",locationNote:"",remarks:"",notes:""},
    {rating:"YES - ACCEPTABLE",specialty:"General Works",strengthsWeaknesses:"W: Material Request Details  S: Progress Report",contactNo:"0915-361-3286",companyName:"Imelda Orale",paymentTerms:"90 Days",address:"Casa Corazon Bldg. Earnshaw St. Sampaloc Barangay 457",rateStructure:"Project Rate",paymentStructure:"50% Start/50% Completion",locationNote:"",remarks:"",notes:""},
    {rating:"YES - ACCEPTABLE",specialty:"General Works",strengthsWeaknesses:"W: Hard to communicate/Request Details",contactNo:"0947-755-3557",companyName:"Jerome Mendoza",paymentTerms:"30 Days",address:"916 Aurora Blvd. Quezon City",rateStructure:"Project Rate",paymentStructure:"50% Start/50% Completion",locationNote:"",remarks:"",notes:""},
    {rating:"YES - ACCEPTABLE",specialty:"Electrical (Install only)",strengthsWeaknesses:"W: Communication  S: Scope of Work",contactNo:"0945-311-1571",companyName:"Michael Labrador",paymentTerms:"Cash Basis",address:"",rateStructure:"Project Rate",paymentStructure:"50% Start/50% Completion",locationNote:"",remarks:"",notes:""},
    {rating:"YES - ACCEPTABLE",specialty:"General Works",strengthsWeaknesses:"W: Material request details/Communication  S: Scope of Work",contactNo:"0917-719-8415",companyName:"Ronald Quirong",paymentTerms:"30 Days",address:"206-B M. Paterno St. San Juan City, Metro Manila",rateStructure:"Project Rate",paymentStructure:"50% Start/50% Completion",locationNote:"Davao",remarks:"",notes:""},
    {rating:"YES - ACCEPTABLE",specialty:"General Works",strengthsWeaknesses:"W: Material request details/Communication  S: Scope of Work",contactNo:"0933-626-2399",companyName:"Miguel Kwan",paymentTerms:"Cash Basis",address:"",rateStructure:"Project Rate",paymentStructure:"50% Start/50% Completion",locationNote:"Cebu",remarks:"",notes:""},
    {rating:"NO",specialty:"Metal Works (Supply & Install)",strengthsWeaknesses:"W: Work errors/Design concerns about metal works/Billing",contactNo:"0917-802-6014",companyName:"Alba Motors/Elijah Mojares",paymentTerms:"Cash Basis",address:"88 Jenny's Avenue, Maybunga Pasig City",rateStructure:"Material/Project Rate",paymentStructure:"50% Start/50% Completion",locationNote:"",remarks:"",notes:""},
  ];

  // Seed initial data if tables are empty (runs once)
  useEffect(()=>{
    if(suppliers.length===0&&SEED_SUPPLIERS.length>0&&isSupabaseReady()){
      SEED_SUPPLIERS.forEach(s=>{
        addSupplier({...s,status:"Active"});
      });
    }
  },[/* one-time seed */]);

  useEffect(()=>{
    if(subcons.length===0&&SEED_SUBCONS.length>0&&isSupabaseReady()){
      SEED_SUBCONS.forEach(s=>{
        addSubcon({...s,status:"Active"});
      });
    }
  },[/* one-time seed */]);

  const logStockMove=(move)=>{
    const entry={...move,id:uid(),date:move.date||today,recordedBy:session?.name||role};
    upStocklog(sl=>[entry,...sl]);
    if(isSupabaseReady()) sbInsert('stock_movements',moveToSb(entry)).catch(()=>{});
    const qty=Number(move.qty)||0;
    upInventory(iv=>iv.map(i=>{
      if(i.id!==move.itemId) return i;
      const type=move.moveType||"";
      let newQty=Number(i.qtyOnHand)||0;
      if(type.startsWith("IN"))    newQty+=qty;
      if(type.startsWith("OUT"))   newQty=Math.max(0,newQty-qty);
      if(type.startsWith("ADJUST"))newQty=qty;
      if(type.startsWith("RETURN"))newQty=Math.max(0,newQty-qty);
      let avgCost=Number(i.avgCost)||0;
      if(type.startsWith("IN")&&move.unitCost){
        const prevTotal=(Number(i.qtyOnHand)||0)*avgCost;
        const newTotal=qty*Number(move.unitCost);
        avgCost=newQty>0?(prevTotal+newTotal)/newQty:Number(move.unitCost);
      }
      const updated={...i,qtyOnHand:Math.round(newQty*100)/100,avgCost:Math.round(avgCost*100)/100,
        lastPurchasePrice:type.startsWith("IN")&&move.unitCost?Number(move.unitCost):i.lastPurchasePrice,
        lastUpdated:today};
      if(isSupabaseReady()) sbUpdate('inventory_items',i.id,invToSb(updated)).catch(()=>{});
      return updated;
    }));
  };

  const createProjectCard=(dealId,dealData)=>{
    upPcards(ps=>({...ps,[dealId]:emptyProjectCard(dealId,dealData)}));
    logActivity(dealId,"Project Card Created",`${dealData?.client} — project card created for all departments`,session?.name);
  };
  const toggleDeptTask=(dealId,dept,taskId)=>{
    upPcards(ps=>{
      const card={...(ps[dealId]||emptyProjectCard(dealId,{}))};
      const deptData={...card.departments[dept]};
      deptData.tasks=deptData.tasks.map(t=>t.id===taskId?{...t,done:!t.done,doneAt:!t.done?new Date().toISOString():null,doneBy:!t.done?session?.name:null}:t);
      // Auto-mark dept done if all tasks complete
      deptData.done=deptData.tasks.every(t=>t.done);
      if(deptData.done&&!card.departments[dept].done){
        deptData.doneAt=new Date().toISOString();
        deptData.doneBy=session?.name;
        logActivity(dealId,"Department Done",`${dept} completed all tasks for ${card.client}`,session?.name);
      }
      card.departments={...card.departments,[dept]:deptData};
      return{...ps,[dealId]:card};
    });
  };
  const setProjectTAT=(dealId,days,category)=>{
    if(!days||isNaN(days)) return;
    const card=pcards[dealId];
    if(!card) return;
    const award=card.awardDate||today;
    const end=new Date(award);
    end.setDate(end.getDate()+Number(days));
    const endStr=end.toISOString().split("T")[0];
    upPcards(ps=>({...ps,[dealId]:{...ps[dealId],
      targetDays:Number(days),
      targetEndDate:endStr,
      tatCategory:category||"",
      tatSetBy:session?.name,
      tatSetAt:new Date().toISOString(),
    }}));
    logActivity(dealId,"TAT Set",`Target: ${days} days → Due ${endStr}`,session?.name);
  };

  const markDeptDone=(dealId,dept,done)=>{
    upPcards(ps=>{
      const card={...(ps[dealId]||emptyProjectCard(dealId,{}))};
      const deptData={...card.departments[dept],done,doneAt:done?new Date().toISOString():null,doneBy:done?session?.name:null};
      card.departments={...card.departments,[dept]:deptData};
      if(done) logActivity(dealId,"Department Done",`${dept} marked complete for ${card.client}`,session?.name);
      return{...ps,[dealId]:card};
    });
  };

  // ── Supabase real-time subscriptions ─────────────────────────────────────────
  // When any user makes a change, ALL other logged-in users see it instantly
  useEffect(()=>{
    if(!session||!isSupabaseReady()) return;

    // Deals — Paulo awards, Paolo sees it; Aerwin updates billing, everyone sees it
    const dealsSub = sbSubscribe('deals-rt', 'deals', payload=>{
      const{eventType,new:rec,old:oldRow}=payload;
      if(eventType==='INSERT'||eventType==='UPDATE'){
        const mapped={...rec,ceNo:rec.ce_no,ceType:rec.ce_type,salesOwner:rec.sales_owner,
          bizDevSource:rec.biz_dev_source,dateAcquired:rec.date_acquired,
          dueDate:rec.due_date,amountPaid:Number(rec.amount_paid)||0,
          paymentStatus:rec.payment_status,receiptType:rec.receipt_type,
          commsGroup:rec.comms_group,salesRepoLink:rec.sales_repo_link,
          proposalFolderLink:rec.proposal_folder_link,stage:normalizeStage(rec.stage)};
        setDeals(ds=>{const ex=ds.find(d=>d.id===rec.id);
          return ex?ds.map(d=>d.id===rec.id?{...d,...mapped}:d):[mapped,...ds];});
      }
      if(eventType==='DELETE') setDeals(ds=>ds.filter(d=>d.id!==oldRow.id));
    });

    // Project card dept status — Ryon checks a task, Arrius sees it live
    const pcardSub = sbSubscribe('pcards-rt', 'project_card_dept_status', payload=>{
      if(payload.eventType==='INSERT'||payload.eventType==='UPDATE'){
        const{card_id,department,done,done_at,done_by}=payload.new;
        setPcards(pc=>{
          if(!pc) return pc;
          const card=Object.values(pc).find(c=>c.id===card_id);
          if(!card) return pc;
          return{...pc,[card.dealId||card.deal_id]:{...card,departments:{
            ...card.departments,
            [department]:{...card.departments?.[department],done,doneAt:done_at,doneBy:done_by}
          }}};
        });
      }
    });

    // Billing — Aerwin logs a payment, Mar's dashboard updates
    const billSub = sbSubscribe('bill-rt', 'billing_milestones', payload=>{
      if(payload.eventType==='INSERT'||payload.eventType==='UPDATE'){
        const rec=payload.new;
        const mapped={...rec,dealId:rec.deal_id,invoiceNo:rec.invoice_no,
          invoiceDate:rec.invoice_date,dueDate:rec.due_date,createdBy:rec.created_by,payments:[]};
        setBillings(bs=>{const ex=bs.find(b=>b.id===rec.id);
          return ex?bs.map(b=>b.id===rec.id?{...b,...mapped}:b):[...bs,mapped];});
      }
      if(payload.eventType==='DELETE') setBillings(bs=>bs.filter(b=>b.id!==payload.old.id));
    });

    // Addenda — PM flags scope, AE + Paolo see it on their dashboard immediately
    const addSub = sbSubscribe('add-rt', 'addenda', payload=>{
      if(payload.eventType==='INSERT'||payload.eventType==='UPDATE'){
        const rec=payload.new;
        const mapped={...rec,dealId:rec.deal_id,receiptType:rec.receipt_type,
          salesNotified:rec.sales_notified,discoveredBy:rec.discovered_by};
        setAddenda(as=>{const ex=as.find(a=>a.id===rec.id);
          return ex?as.map(a=>a.id===rec.id?{...a,...mapped}:a):[...as,mapped];});
      }
    });

    // Activity log — PM update shows on Arrius's dashboard live
    const actSub = sbSubscribe('actlog-rt', 'activity_log', payload=>{
      if(payload.eventType==='INSERT')
        setActLog(al=>[{...payload.new,dealId:payload.new.deal_id},...al].slice(0,200));
    });

    return ()=>{
      dealsSub?.unsubscribe?.();
      pcardSub?.unsubscribe?.();
      billSub?.unsubscribe?.();
      addSub?.unsubscribe?.();
      actSub?.unsubscribe?.();
    };
  },[session?.userId]);


  const toggleVvip=(name)=>{
    setVvip(prev=>{
      const next=new Set(prev);
      next.has(name)?next.delete(name):next.add(name);
      persist(KEYS.vvip,[...next]);
      if(isSupabaseReady()) sbUpsert('app_settings',{key:'vvip',value:[...next],updated_at:new Date().toISOString()},'key').catch(()=>{});
      return next;
    });
  };
  const upPrs      =useCallback(fn=>setPrs(p=>{const n=fn(p);persist(KEYS.prs,n);return n;}),[persist]);
  const upAddenda  =useCallback(fn=>setAddenda(p=>{const n=fn(p);persist(KEYS.addenda,n);return n;}),[persist]);
  const upBillings =useCallback(fn=>setBillings(p=>{const n=fn(p);persist(KEYS.billings,n);return n;}),[persist]);
  const addMilestone  =(ms)=>upBillings(bs=>[...bs,{...ms,id:uid(),createdDate:today}]);
  const updateMilestone=(id,ch)=>upBillings(bs=>bs.map(b=>b.id===id?{...b,...ch}:b));
  const deleteMilestone=(id)=>upBillings(bs=>bs.filter(b=>b.id!==id));
  const logBillingPayment=(msId,payment)=>{
    upBillings(bs=>bs.map(b=>{
      if(b.id!==msId) return b;
      const payments=[...( b.payments||[]),{...payment,id:uid(),date:payment.date||today}];
      const totalPaid=payments.reduce((s,p)=>s+Number(p.amount||0),0);
      const status=totalPaid>=Number(b.amount)?'Paid':totalPaid>0?'Partial':b.status;
      return{...b,payments,status};
    }));
    // FIX 14: Auto-record payment to daily cash position under the correct bank
    if(payment.bank && payment.amount){
      const pDate=payment.date||today;
      const bankKey=(payment.bank||"").toLowerCase().replace(/\s+/g,"");
      setCashPos(cp=>{
        const existing=cp[pDate]||{date:pDate,bpi_end:0,metrobank_end:0,chinabank_end:0,bdo_end:0,secbank_end:0,unionbank_end:0,notes:""};
        const fieldMap={bpi:"bpi_end",metrobank:"metrobank_end",chinabank:"chinabank_end",bdo:"bdo_end",securitybank:"secbank_end",unionbank:"unionbank_end"};
        const field=fieldMap[bankKey]||null;
        if(!field) return cp;
        const updated={...existing,[field]:(Number(existing[field]||0)+Number(payment.amount))};
        const newNote=`+₱${Number(payment.amount).toLocaleString()} billing payment received`;
        updated.notes=(updated.notes?updated.notes+" | ":"")+newNote;
        return{...cp,[pDate]:updated};
      });
    }
  };
  // Auto invoice number generator
  const nextCENo=()=>{
    const nums=deals.map(d=>d.ceNo).filter(Boolean)
      .map(n=>{const m=n.match(/(\d+)$/);return m?parseInt(m[1]):0;});
    const next=(nums.length?Math.max(...nums):0)+1;
    const yr=new Date().getFullYear();
    return`CE-${yr}-${String(next).padStart(3,"0")}`;
  };
  const nextInvoiceNo=()=>{
    const nums=billings.map(b=>b.invoiceNo).filter(Boolean)
      .map(n=>parseInt(n.replace(/\D/g,''))||0);
    const next=(nums.length?Math.max(...nums):0)+1;
    return'INV-'+String(next).padStart(4,'0');
  };
  const addAddendum2=(adm)=>{
    upAddenda(as=>[{...adm,id:uid(),createdDate:today,status:"Discovered"},...as]);
    const deal=deals.find(d=>d.id===adm.dealId);
    const msg=`⚠️ <b>Scope Change Discovered</b>\n${adm.title||"?"}\nProject: ${deal?.client||adm.dealId||"?"}\nValue: ₱${Number(adm.value||0).toLocaleString("en-PH",{maximumFractionDigits:0})}\nBy: ${adm.discoveredBy||"?"}\n\n📌 Sales must quote this to client before proceeding.`;
    sendTelegramNotification("sales",msg);
    sendTelegramNotification("management",msg);
  };
  const updateAddendum=(id,ch)=>upAddenda(as=>as.map(a=>a.id===id?{...a,...ch}:a));
  const deleteAddendum=(id)=>upAddenda(as=>as.filter(a=>a.id!==id));
  const delJo        =(id)=>upJos(js=>js.filter(j=>j.id!==id));
  const delMR        =(id)=>upMreqs(ms=>ms.filter(m=>m.id!==id));
  const delBR        =(id)=>upBreqs(bs=>bs.filter(b=>b.id!==id));
  const delPcard     =(id)=>upPcards(ps=>{const n={...ps};delete n[id];return n;});
  const delBudget    =(id)=>upBudgets(bs=>{const n={...bs};delete n[id];return n;});
  const delChecklist =(id)=>upChecklist(cs=>cs.filter(c=>c.id!==id));
  const upMreqs    =useCallback(fn=>setMreqs(p=>{const n=fn(p);persist(KEYS.mreqs,n);return n;}),[persist]);
  const upBreqs    =useCallback(fn=>setBreqs(p=>{const n=fn(p);persist(KEYS.breqs,n);return n;}),[persist]);
  const addMR      =(mr)=>{
    upMreqs(ms=>[{...mr,id:uid(),createdDate:today},...ms]);
    const deal=deals.find(d=>d.id===mr.dealId);
    sendTelegramNotification("procurement",`🔧 <b>New Material Request</b>\n${mr.item||"?"}\nProject: ${deal?.client||mr.dealId||"?"}\nQty: ${mr.qty||"?"} ${mr.unit||""}\nUrgency: ${mr.urgency||"Normal"}\nBy: ${mr.submittedBy||"?"}`);
  };
  const updateMR   =(id,ch)=>upMreqs(ms=>ms.map(m=>m.id===id?{...m,...ch}:m));
  const addBR      =(br)=>{
    upBreqs(bs=>[{...br,id:uid(),createdDate:today},...bs]);
    const deal=deals.find(d=>d.id===br.dealId);
    sendTelegramNotification("management",`💰 <b>Budget Request Submitted</b>\n${br.title||br.purpose||"?"}\nProject: ${deal?.client||br.dealId||"?"}\nAmount: ₱${Number(br.amount||0).toLocaleString("en-PH",{maximumFractionDigits:0})}\nCategory: ${br.category||"—"}\nBy: ${br.submittedBy||"?"}`);
  };
  const updateBR   =(id,ch)=>upBreqs(bs=>bs.map(b=>b.id===id?{...b,...ch}:b));
  const upBudgets  =useCallback(fn=>setBudgets(p=>{const n=fn(p);persist(KEYS.budgets,n);return n;}),[persist]);
  const saveBudget =(dealId,budget)=>upBudgets(bs=>({...bs,[dealId]:{...budget,savedAt:new Date().toISOString()}}));
  const addPR      =(pr)=>upPrs(ps=>[{...pr,id:uid(),createdDate:today},  ...ps]);
  const updatePR   =(id,changes)=>{
    if(changes.status==="PO Issued"&&changes.approvedBy){
      const pr=prs.find(p=>p.id===id);
      const deal=deals.find(d=>d.id===(pr?.projectId||pr?.dealId));
      sendTelegramNotification("procurement",`✅ <b>PO Approved</b>\n${pr?.itemName||"?"}\nProject: ${deal?.client||"?"}\nQty: ${pr?.qty||"?"} ${pr?.unit||""}\nSupplier: ${pr?.supplier||"—"}\nApproved by: ${changes.approvedBy} · ${today}`);
    }
    upPrs(ps=>ps.map(p=>p.id===id?{...p,...changes}:p));
  };
  const deletePR   =(id)=>upPrs(ps=>ps.filter(p=>p.id!==id));
  const saveDayPos =(date,pos)=>upCashPos(cp=>({...cp,[date]:{...pos,savedAt:new Date().toISOString()}}));
  const upDeals    =useCallback(fn=>setDeals(p=>{const n=fn(p);persist(KEYS.deals,n);return n;}),[persist]);
  const upProjs    =useCallback(fn=>setProjs(p=>{const n=fn(p);persist(KEYS.projects,n);return n;}),[persist]);
  const upExps     =useCallback(fn=>setExps(p=>{const n=fn(p);persist(KEYS.expenses,n);return n;}),[persist]);
  const upInfs     =useCallback(fn=>setInfs(p=>{const n=fn(p);persist(KEYS.inflows,n);return n;}),[persist]);
  const upInflows  =upInfs; // alias for DataManagement
  const upJos      =useCallback(fn=>setJos(p=>{const n=fn(p);persist(KEYS.jos,n);return n;}),[persist]);
  const upSwatches =useCallback(fn=>setSwatches(p=>{const n=fn(p);persist(KEYS.swatches,n);return n;}),[persist]);
  const upChecklist=useCallback(fn=>setChecklist(p=>{const n=fn(p);persist(KEYS.checklist,n);return n;}),[persist]);

  // ── DRF CRUD ─────────────────────────────────────────────────────────────
  const upDrfs   =useCallback(fn=>setDrfs(p=>{const n=fn(p);persist(KEYS.drfs,n);return n;}),[persist]);

  // ── BOT SETTINGS CRUD ────────────────────────────────────────────────────
  const saveBotSettings=async(data)=>{
    const n={...data};
    setBotSettings(n);
    localStorage.setItem(KEYS.botsettings,JSON.stringify(n));
    if(isSupabaseReady()) await sbUpsert('app_settings',{key:'botsettings',value:n,updated_at:new Date().toISOString()},'key');
  };

  // ── TELEGRAM NOTIFICATION UTILITY ────────────────────────────────────────
  const sendTelegramNotification=useCallback(async(dept,message)=>{
    const bs=JSON.parse(localStorage.getItem(KEYS.botsettings)||"{}");
    const token=bs.token;
    if(!token) return;
    const chatId=bs.chatIds?.[dept]||bs.chatIds?.management;
    if(!chatId) return;
    try{
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({chat_id:chatId,text:message,parse_mode:"HTML"})
      });
    }catch(e){console.warn("Telegram notify failed:",e);}
  },[]);

  const sendToAllChannels=(message)=>{
    ["general","ops","design","procurement","sales","management"].forEach(dept=>sendTelegramNotification(dept,message));
  };

  const addDRF=(drf)=>upDrfs(ds=>{
    const no=`DRF-${String(ds.length+1).padStart(3,"0")}`;
    const rec={...drf,id:uid(),drfNo:no,createdAt:today,status:"New"};
    sendTelegramNotification("design",`📝 <b>New Design Request</b>\n${no} · ${drf.client||"?"}\nProject: ${drf.projectTitle||"—"}\nDeadline: ${drf.designDeadline||"TBD"}\nBy: ${drf.createdBy||"?"}`);
    if(isSupabaseReady()) sbInsert('design_requests',drfToSb(rec)).catch(()=>{});
    return[...ds,rec];
  });
  const updateDRF=(id,data)=>{
    upDrfs(ds=>ds.map(d=>d.id===id?{...d,...data}:d));
    if(isSupabaseReady()) sbUpdate('design_requests',id,drfToSb(data)).catch(()=>{});
  };
  const deleteDRF=(id)=>{
    upDrfs(ds=>ds.filter(d=>d.id!==id));
    if(isSupabaseReady()) sbDelete('design_requests',id).catch(()=>{});
  };

  // ── PM Update + Addendum helpers ─────────────────────────────────────────
  // ── Proactive Checklist Template Auto-Load ──────────────────────────────────
  const loadChecklistTemplate=(dealId,clientName)=>{
    // Only load if no checklist items exist for this project yet
    const existing=checklist.filter(c=>(c.projectId||c.dealId)===dealId);
    if(existing.length>0) return; // already has items — don't overwrite
    const items=GMD_CHECKLIST_TEMPLATE.map(t=>({
      ...t,
      id:uid(),
      projectId:dealId,
      title:t.title,
      status:"To Do",
      customType:"",
      assignedTo:"",
      dueDate:"",
      supplier:"",
      qty:"",
      unit:"pcs",
      createdDate:today,
      createdBy:"System (Template)",
    }));
    upChecklist(cs=>[...cs,...items]);
  };

  const addPmUpdate=(projId,text,by)=>{
    if(!text.trim()) return;
    const entry={id:uid(),text,by:by||session?.name||"Team",date:today,time:new Date().toLocaleTimeString("en-PH",{hour:"2-digit",minute:"2-digit"})};
    upProj(projId,p=>({...p,pmUpdates:[entry,...(p.pmUpdates||[])]}));
    const deal=deals.find(d=>d.id===projId);
    sendTelegramNotification("ops",`📝 <b>PM Update</b>\n${deal?.client||projId}\nBy: ${entry.by} · ${today}\n${text}`);
  };
  const addAddendum=(dealId,title,desc,requestedBy)=>{
    const entry={id:uid(),title,desc,requestedBy,date:today,status:"Pending",notifiedSales:false,notifiedOps:false};
    upDeals(ds=>ds.map(d=>d.id===dealId?{...d,addenda:[entry,...(d.addenda||[])]}:d));
    upProj(dealId,p=>({...p,addenda:[entry,...(p.addenda||[])]}));
    const deal=deals.find(d=>d.id===dealId);
    const msg=`⚠️ <b>Scope Change Logged</b>\n${title||"?"}\nProject: ${deal?.client||dealId||"?"}\nBy: ${requestedBy||"?"}\n\n📌 Sales must quote this to client before proceeding.`;
    sendTelegramNotification("sales",msg);
    sendTelegramNotification("management",msg);
  };
  const updateAddendumStatus=(dealId,addId,status)=>{
    upDeals(ds=>ds.map(d=>d.id===dealId?{...d,addenda:(d.addenda||[]).map(a=>a.id===addId?{...a,status}:a)}:d));
  };

  // ── Checklist state ──────────────────────────────────────────────────────────
  const[clModal,   setClModal]  = useState(false);
  const[clForm,    setClForm]   = useState({projectId:null,type:"Task",customType:"",title:"",dept:"Operations",assignedTo:"",status:"To Do",priority:"Normal",dueDate:"",supplier:"",notes:"",whatCouldGoWrong:"",qty:"",unit:"pcs"});
  const[editCl,    setEditCl]   = useState(null);
  const[clProjF,   setClProjF]  = useState("all");
  const[clTypeF,   setClTypeF]  = useState("All");
  const[clStatF,   setClStatF]  = useState("All");
  const[clDeptF,   setClDeptF]  = useState("All");

  const openAddCl=(projId=null,dept="Operations",type="Task")=>{setClForm({projectId:projId,type,customType:"",title:"",dept:dept,assignedTo:"",status:"To Do",priority:"Normal",dueDate:"",supplier:"",notes:"",whatCouldGoWrong:"",qty:"",unit:"pcs"});setEditCl(null);setClModal(true);};
  const openEditCl=item=>{setClForm({...item,customType:CL_TYPES.includes(item.type)?"":item.type,whatCouldGoWrong:item.whatCouldGoWrong||"",qty:item.qty||"",unit:item.unit||"pcs"});setEditCl(item.id);setClModal(true);};
  const saveCl=()=>{
    if(!clForm.title) return;
    const finalType=clForm.type==="Custom"&&clForm.customType?clForm.customType:clForm.type;
    const rec={...clForm,type:finalType,id:editCl||uid(),createdDate:today,createdBy:role};
    upChecklist(cs=>editCl?cs.map(c=>c.id===editCl?rec:c):[...cs,rec]);
    setClModal(false);setEditCl(null);
  };
  const delCl=id=>upChecklist(cs=>cs.filter(c=>c.id!==id));
  const clStatusQ=(id,st)=>upChecklist(cs=>cs.map(c=>c.id===id?{...c,status:st}:c));

  const pickRole=r=>{setRole(r);localStorage.setItem(KEYS.role,r);};


  // ── Auth helpers ───────────────────────────────────────────────────────────
  const login=(username,password)=>{
    const u=users.find(x=>x.username.toLowerCase()===username.toLowerCase().trim());
    if(!u) return "Username not found.";
    if(u.status==="pending") return "Your account is pending approval by a Manager.";
    if(u.status==="inactive") return "Your account has been deactivated. Contact Paulo.";
    if(!checkPw(password,u.passwordHash)) return "Incorrect password.";
    const sess={userId:u.id,username:u.username,name:u.name,role:u.role,title:u.title||u.role};
    setSession(sess); setRole(u.role);
    // Set default landing page per role
    const defaultPages={Manager:"home",Sales:"pipeline",Finance:"home",Procurement:"home",QS:"home",Operations:"home",Design:"home",ProjectMover:"home"};
    setPage(defaultPages[u.role]||"home");
    localStorage.setItem(KEYS.session,JSON.stringify(sess));
    localStorage.setItem(KEYS.role,u.role);
    return null; // null = success
  };
  const logout=async()=>{
    // Sign out of Supabase if connected
    if(supabase){ try{ await supabase.auth.signOut(); }catch(e){} }
    setSession(null);
    setRole(null);
    setAuthView("login");
    setPage("home");
    localStorage.removeItem(KEYS.session);
    localStorage.removeItem(KEYS.role);
  };
  const register=(name,username,password,requestedRole)=>{
    if(!name||!username||!password) return "All fields are required.";
    if(users.find(u=>u.username.toLowerCase()===username.toLowerCase())) return "Username already taken.";
    if(password.length<6) return "Password must be at least 6 characters.";
    const newUser={id:"u"+Date.now(),name,username:username.toLowerCase(),passwordHash:hashPw(password),role:requestedRole,status:"pending",createdAt:today};
    upUsers(us=>[...us,newUser]);
    return null; // null = success
  };
  const approveUser =(id,role)=>upUsers(us=>us.map(u=>u.id===id?{...u,status:"active",role}:u));
  const rejectUser  =(id)    =>upUsers(us=>us.map(u=>u.id===id?{...u,status:"rejected"}:u));
  const deactivateUser=(id)  =>upUsers(us=>us.map(u=>u.id===id?{...u,status:"inactive"}:u));
  const deleteUser  =(id)    =>upUsers(us=>us.filter(u=>u.id!==id));
  const resetPw     =(id,pw) =>upUsers(us=>us.map(u=>u.id===id?{...u,passwordHash:hashPw(pw)}:u));
  const changePw    =(oldPw,newPw)=>{
    const u=users.find(x=>x.id===session?.userId);
    if(!u||!checkPw(oldPw,u.passwordHash)) return "Current password is incorrect.";
    if(newPw.length<6) return "New password must be at least 6 characters.";
    upUsers(us=>us.map(x=>x.id===u.id?{...x,passwordHash:hashPw(newPw)}:x));
    return null;
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const wonDeals  =useMemo(()=>deals.filter(d=>WON_STAGES.includes(d.stage)),[deals]);
  const closedDeals=useMemo(()=>deals.filter(d=>d.stage==="12 · Project Close-Out"||d.stage==="13 · Client Feedback"),[deals]);
  // Auto-create project entries for any won deal that doesn't have one yet
  useEffect(()=>{
    const missing=wonDeals.filter(d=>!projs[d.id]);
    if(missing.length>0){
      const patch={};
      missing.forEach(d=>{patch[d.id]=emptyProject();});
      upProjs(ps=>({...ps,...patch}));
    }
  // eslint-disable-next-line
  },[wonDeals.length]);

  // Auto-mark Finance DONE when project is fully paid
  useEffect(()=>{
    wonDeals.forEach(d=>{
      const ms=billings.filter(b=>b.dealId===d.id&&b.status!=="Cancelled");
      if(ms.length===0) return;
      const allPaid=ms.every(m=>m.status==="Fully Paid");
      const card=pcards[d.id];
      if(allPaid&&card&&!card.departments?.Finance?.done){
        markDeptDone(d.id,"Finance",true);
      }
    });
  // eslint-disable-next-line
  },[billings.length]);
  const projList  =useMemo(()=>wonDeals.filter(d=>projs[d.id]),[wonDeals,projs]);
  const isPauloGate = stage => PAULO_GATE.includes(stage);
  const clientName=useCallback(id=>deals.find(d=>d.id===id)?.client||`Project #${id}`,[deals]);
  const overallProg=p=>{const si=PROD_STAGES.indexOf(p.currentStage);return Math.round(si*25+(p.progress[p.currentStage]||0)*0.25);};
  const costOf    =p=>(p.materials||[]).reduce((s,m)=>s+m.cost,0)+(p.laborCost||0)+(p.overhead||0);
  const marginOf  =(p,d)=>d&&costOf(p)<d.value?Math.round((d.value-costOf(p))/d.value*100):0;
  const totRev    =useMemo(()=>wonDeals.reduce((s,d)=>s+d.value,0),[wonDeals]);
  const totExp    =useMemo(()=>exps.reduce((s,e)=>s+e.amount,0),[exps]);
  const totColl   =useMemo(()=>wonDeals.reduce((s,d)=>s+d.amountPaid,0),[wonDeals]);
  const totOut    =useMemo(()=>Math.max(0,wonDeals.reduce((s,d)=>s+Number(d.invoiced||0)-Number(d.amountPaid||0),0)),[wonDeals]);

  // ── Modals ────────────────────────────────────────────────────────────────
  const[dealModal,  setDealModal] =useState(false);
  const[awardModal, setAwardModal]=useState(null);
  const[awardStep,  setAwardStep] =useState(1);
  const[awardForm,  setAwardForm] =useState({
    // Step 1 — Sales fills
    awardTrigger:"CE Signed",
    triggerDate:today,
    triggerNote:"",
    // Step 2 — Ops/Manager/Sales fills
    pm1:"", pm2:"", pm3:"",
    coordinator:"",
    aeAssigned:"",
    startDate:today,
    commsLink:"",
    scopeNotes:"",
    specialInstructions:"",
  });
  const[awardReqModal, setAwardReqModal]=useState(null); // Sales award request
  const[awardReqStep,  setAwardReqStep] =useState(1);
  const[awardReqForm,  setAwardReqForm] =useState({
    awardTrigger:"CE Signed by Client",
    triggerDate:today,
    triggerNote:"",
    aeAssigned:"",
    pm1Suggestion:"",
    scopeNotes:"",
    specialInstructions:"",
  });
  const[clientSugg, setClientSugg]=useState([]); // autocomplete suggestions
  const[dealForm,  setDealForm] =useState(emptyDeal);
  const[editDeal,  setEditDeal] =useState(null);
  const[expModal,  setExpModal] =useState(false);
  const[expForm,   setExpForm]  =useState({month:new Date().getMonth(),category:"Materials",amount:"",note:"",projectId:null,receipt:""});
  const[editExpId, setEditExpId]=useState(null);
  const[infModal,  setInfModal] =useState(false);
  const[infForm,   setInfForm]  =useState({month:new Date().getMonth(),source:"",amount:"",note:"",projectId:null});
  const[selProj,   setSelProj]  =useState(null);
  const[opsTab,    setOpsTab]   =useState("progress");
  const[matModal,  setMatModal] =useState(false);
  const[matForm,   setMatForm]  =useState({projectId:"",name:"",category:"Materials",qty:1,unit:"pcs",cost:0,supplier:"",note:""});
  const[editMat,   setEditMat]  =useState(null);
  const saveMat=(mat)=>{
    const isEdit=editMat!=null;
    const rec={...mat,id:isEdit?editMat:uid(),createdAt:today,by:session?.name||""};
    upProjs(ps=>{
      const p=ps[mat.projectId]||emptyProject();
      const mats=isEdit?p.materials.map(m=>m.id===editMat?rec:m):[...(p.materials||[]),rec];
      return{...ps,[mat.projectId]:{...p,materials:mats}};
    });
    setMatModal(false);setEditMat(null);
    setMatForm({projectId:"",name:"",category:"Materials",qty:1,unit:"pcs",cost:0,supplier:"",note:""});
  };
  const[swModal,   setSwModal]  =useState(false);
  const[swForm,    setSwForm]   =useState({projectId:null,name:"",category:"Fabric",qty:"",unit:"pcs",supplier:"",estCost:"",swatchLink:"",addedBy:"Design",status:"To Buy",notes:""});
  const[editSw,    setEditSw]   =useState(null);
  const openAddSwatch=(pid,by)=>{setSwForm({projectId:pid,name:"",category:"Furniture/Fixture",spec:"",qty:1,unit:"pcs",status:"To Buy",addedBy:by||session?.name||"",refLink:""});setEditSw(null);setSwModal(true);};
  const openEditSwatch=(sw)=>{setSwForm({...sw});setEditSw(sw.id);setSwModal(true);};
  const[designModal,setDesignModal]=useState(false);
  const[designForm, setDesignForm] =useState({});
  const[confirmDel, setConfirmDel] =useState(null);
  const[stageFilter,  setStageFilter]  = useState(false);  // pipeline stage click filter
  const[pipeSearch,   setPipeSearch]   = useState("");     // pipeline search query
  const[pmUpdateModal,setPmUpdateModal]= useState(null);   // {dealId, dealName} — PM update entry
  const[smartImport,  setSmartImport]  = useState(null);   // {rows, summary, rawData} — AI import preview
  const[importLoading,setImportLoading]= useState(false);  // AI analyzing flag
  const[navCollapsed, setNavCollapsed] = useState(false);  // sidebar collapsed
  const[dragDeal,    setDragDeal]    = useState(null);   // deal id being dragged
  const[dragOver,    setDragOver]    = useState(null);   // stage column being hovered
  const[costTab,     setCostTab]     = useState("budget"); // cost analysis sub-tab
  const[page,       setPage]       =useState("home");
  const[showExport, setShowExport] =useState(false);
  const[joStep,     setJoStep]     =useState("select");
  const[joSel,      setJoSel]      =useState(null);
  const[joExtra,    setJoExtra]    =useState({address:"",phone:"",priority:"Normal",extraNotes:""});
  const[viewJO,     setViewJO]     =useState(null);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const openAddDeal=()=>{setDealForm({...emptyDeal,ceNo:nextCENo()});setEditDeal(null);setDealModal(true);};
  const openEditDeal=d=>{setDealForm({...d,value:String(d.value),invoiced:String(d.invoiced||0),amountPaid:String(d.amountPaid||0)});setEditDeal(d.id);setDealModal(true);};
  // ── Supabase deal writers ───────────────────────────────────────────────────
  const sbSaveDeal=async(rec)=>{
    try {
      const payload={
        ce_no:rec.ceNo, client:rec.client, contact:rec.contact,
        ce_type:rec.ceType, product:rec.product, stage:rec.stage,
        priority:rec.priority, sales_owner:rec.salesOwner,
        biz_dev_source:rec.bizDevSource, date_acquired:rec.dateAcquired||null,
        due_date:rec.dueDate||null, value:Number(rec.value)||0,
        invoiced:Number(rec.invoiced)||0, amount_paid:Number(rec.amountPaid)||0,
        payment_status:rec.paymentStatus, receipt_type:rec.receiptType,
        withholding:rec.withholding||false, comms_group:rec.commsGroup,
        sales_repo_link:rec.salesRepoLink, proposal_folder_link:rec.proposalFolderLink,
        notes:rec.notes, probability:rec.probability||0,
        updated_at:new Date().toISOString(),
      };
      // Check if UUID (Supabase) or old ID
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(rec.id);
      if(isUUID){
        await sbUpdate('deals', rec.id, payload);
      } else {
        const data = await sbInsert('deals', payload);
        if(data?.id) return data.id; // return new Supabase UUID
      }
    } catch(err){ console.warn("Supabase deal save failed, localStorage only:", err.message); }
    return rec.id;
  };

  const saveDeal=(overrideData)=>{
    const data = overrideData||dealForm;
    if(!data.client) return;
    const prob=WON_STAGES.includes(data.stage)?100:data.stage==="Cancelled"?0:Number(data.probability);
    const rec={...data,id:editDeal||uid(),value:Number(data.value),invoiced:Number(data.invoiced||0),amountPaid:Number(data.amountPaid||0),probability:prob};
    // Only trigger award logic for NEW deals entering won stages — never on edit
    const wasAlreadyAwarded = editDeal && WON_STAGES.includes(deals.find(d=>d.id===editDeal)?.stage);
    if(WON_STAGES.includes(data.stage) && !editDeal) upProjs(ps=>ps[rec.id]?ps:{...ps,[rec.id]:emptyProject()});
    if(data.stage==="06 · Project Kickoff" && !editDeal && !wasAlreadyAwarded) setTimeout(()=>loadChecklistTemplate(rec.id,data.client),200);
    upDeals(ds=>editDeal?ds.map(d=>d.id===editDeal?rec:d):[...ds,rec]);
    // Save new client to master list if not already present
    if(rec.client && !GMD_CLIENTS.find(c=>c.name.toLowerCase()===rec.client.toLowerCase())){
      const newClient={name:rec.client,id:"c"+Date.now(),addedBy:session?.name||"",addedAt:today};
      GMD_CLIENTS.push(newClient);
      setCustomClients(prev=>{const n=[...prev,newClient];localStorage.setItem(KEYS.customclients,JSON.stringify(n));return n;});
    }
    // Auto-create DRF if design brief was filled in the deal form
    if(!editDeal && (data.drfDescription||data.drfProjectTitle)){
      addDRF({
        dealId:rec.id, client:rec.client, location:"",
        designer:data.drfDesigner||"", designDeadline:data.drfDeadline||"",
        projectTitle:data.drfProjectTitle||rec.contact||rec.client||"",
        type:data.drfType||DRF_TYPES[0], size:data.drfSize||"",
        description:data.drfDescription||"",
        accessories:data.drfAccessories||[], refLinks:data.drfRefLinks||["","",""],
        notes:data.drfNotes||"", approvedLink:"", status:"New",
        createdBy:session?.name||""
      });
    }
    if(!editDeal) logActivity(rec.id,"New Deal",`${rec.client} added at ${rec.stage}`,session?.name);
    else logActivity(rec.id,"Deal Updated",`${rec.client} — ${rec.stage}`,session?.name);
    setEditDeal(null);
    setDealModal(false);
  };
  const delDeal=id=>{upDeals(ds=>ds.filter(d=>d.id!==id));upProjs(ps=>{const n={...ps};delete n[id];return n;});setConfirmDel(null);};

  const updatePayment=(id,key,val)=>upDeals(ds=>ds.map(d=>d.id===id?{...d,[key]:val}:d));

  const stageQ=(id,st)=>{
    // Always create project when entering any won stage
    if(WON_STAGES.includes(st)) upProjs(ps=>ps[id]?ps:{...ps,[id]:emptyProject()});
    if(st==="06 · Project Kickoff") setTimeout(()=>loadChecklistTemplate(id, deals.find(d=>d.id===id)?.client||""),150);
    upDeals(ds=>ds.map(d=>{
      if(d.id!==id) return d;
      logActivity(id,"Stage Change",`${d.client}: ${d.stage} → ${st}`,session?.name);
      return{...d,stage:st,probability:WON_STAGES.includes(st)?100:st==="Cancelled"?0:d.probability};
    }));
  };
  const payQ=(id,ps)=>upDeals(ds=>ds.map(d=>d.id===id?{...d,paymentStatus:ps}:d));

  const openAward=(deal)=>{
    setAwardStep(1);
    const req=deal.awardRequestData||{};
    setAwardForm({
      awardTrigger:req.awardTrigger||"CE Signed",
      triggerDate:req.triggerDate||today,
      triggerNote:req.triggerNote||"",
      pm1:req.pm1Suggestion||"", pm2:"", pm3:"", coordinator:"",
      aeAssigned:req.aeAssigned||deal.salesOwner||"",
      startDate:today, commsLink:deal.commsGroup||"",
      scopeNotes:req.scopeNotes||"",
      specialInstructions:req.specialInstructions||"",
    });
    setAwardModal(deal);
  };
  const confirmAward=()=>{
    if(!awardModal) return;
    const id=awardModal.id;
    // Update deal — payment is Unpaid (Finance will bill separately)
    upDeals(ds=>ds.map(d=>d.id===id?{...d,
      stage:"06 · Project Kickoff",
      probability:100,
      paymentStatus:"Unpaid",
      notes:awardForm.scopeNotes||d.notes,
    }:d));
    // Create project record
    if(!projs[id]) upProjs(ps=>ps[id]?ps:{...ps,[id]:emptyProject()});
    // Build PM list
    const pms=[awardForm.pm1,awardForm.pm2,awardForm.pm3].filter(Boolean);
    const pmDisplay=pms.join(", ")||"TBA";
    // Create Job Order
    const jo={
      id:uid(), dealId:id,
      joNo:"JO-"+String(jos.length+1).padStart(4,"0"),
      client:awardModal.client,
      ceNo:awardModal.ceNo,
      projectName:awardModal.contact||awardModal.client,
      ceType:awardModal.ceType,
      product:awardModal.product,
      value:awardModal.value||0,
      awardTrigger:awardForm.awardTrigger,
      triggerDate:awardForm.triggerDate,
      triggerNote:awardForm.triggerNote,
      pm1:awardForm.pm1, pm2:awardForm.pm2, pm3:awardForm.pm3,
      coordinator:awardForm.coordinator,
      aeAssigned:awardForm.aeAssigned||awardModal.salesOwner,
      startDate:awardForm.startDate,
      commsLink:awardForm.commsLink,
      scopeNotes:awardForm.scopeNotes,
      specialInstructions:awardForm.specialInstructions,
      budgetStatus:"QS Budget Pending",
      issuedBy:session?.name||"Manager",
      issuedDate:today,
      status:"Active",
    };
    upJos(js=>[jo,...js]);
    // Create project card with PM/AE pre-populated
    createProjectCard(id,{...awardModal,
      pmAssigned:pmDisplay,
      aeAssigned:jo.aeAssigned,
      awardDate:awardForm.triggerDate||today,
    });
    // Load checklist
    setTimeout(()=>loadChecklistTemplate(id,awardModal.client),200);
    // Auto-set QS budget at 30% margin target (70% cost of contract value)
    const contractVal=Number(awardModal.value||0);
    if(contractVal>0){
      const costTarget=contractVal*0.70;
      saveBudget(id,{
        Materials: Math.round(costTarget*0.50),
        Labor:     Math.round(costTarget*0.25),
        Overhead:  Math.round(costTarget*0.15),
        Subcon:    Math.round(costTarget*0.10),
        marginTarget:30,
        autoGenerated:true,
        autoGeneratedAt:today,
      });
    }
    // Log
    logActivity(id,"Project Awarded",`${awardModal.client} — JO ${jo.joNo} issued. PM: ${pmDisplay}. AE: ${jo.aeAssigned||"—"}. Awarded by: ${session?.name}.`,session?.name);
    // Notify ALL departments
    sendToAllChannels(
      `🏆 <b>PROJECT AWARDED!</b>\n\n` +
      `Client: <b>${awardModal.client}</b>\n` +
      `${awardModal.ceNo?`CE No: ${awardModal.ceNo} · `:``}${awardModal.ceType||""}\n` +
      `Value: ₱${contractVal.toLocaleString("en-PH",{maximumFractionDigits:0})}\n` +
      `PM: ${pmDisplay}\n` +
      `AE: ${jo.aeAssigned||"—"}\n` +
      `JO: ${jo.joNo}\n` +
      `Awarded by: ${session?.name||"Manager"}\n` +
      (awardForm.scopeNotes?`\nScope: ${awardForm.scopeNotes}\n`:"")+
      `\n🚀 All departments — please mobilize!`
    );
    setAwardModal(null);
  };
  const logPayment=({dealId,amount,note,date})=>{
    const amt=Number(amount);
    upDeals(ds=>ds.map(d=>{
      if(d.id!==dealId) return d;
      const newPaid=d.amountPaid+amt;
      const newStatus=newPaid>=d.invoiced?"Paid":newPaid>0?"Deposited":"Unpaid";
      return{...d,amountPaid:newPaid,paymentStatus:newStatus};
    }));
    const mo=new Date(date).getMonth();
    upInfs(is=>[...is,{id:uid(),month:mo,source:deals.find(d=>d.id===dealId)?.client||"",amount:amt,note,projectId:dealId}]);
  };

  const upProj=(id,fn)=>{
    setProjs(ps=>{
      const proj=fn(ps[id]||emptyProject());
      const updated={...ps,[id]:proj};
      persist(KEYS.projects,updated);
      if(isSupabaseReady()) sbUpsert('projects',{deal_id:id,data:proj,updated_at:new Date().toISOString()},'deal_id').catch(()=>{});
      return updated;
    });
  };
  const proj=selProj?{...emptyProject(),...(projs[selProj]||{})}:null;
  const projDeal=selProj?deals.find(d=>d.id===selProj):null;

  const openAddExp=(projId=null)=>{setExpForm({month:new Date().getMonth(),category:"Materials",amount:"",note:"",projectId:projId,receipt:""});setEditExpId(null);setExpModal(true);};
  const openEditExp=e=>{setExpForm({...e});setEditExpId(e.id);setExpModal(true);};
  const saveExp=(overrideData)=>{
    const data=overrideData||expForm;
    if(!data.amount||!data.note) return;
    const rec={...data,amount:Number(data.amount),id:editExpId||uid()};
    upExps(es=>editExpId?es.map(e=>e.id===editExpId?rec:e):[...es,rec]);
    setEditExpId(null);
    setExpModal(false);
  };
  const delExp=id=>upExps(es=>es.filter(e=>e.id!==id));
  const saveInf=()=>{
    if(!infForm.source||!infForm.amount) return;
    upInfs(is=>[...is,{...infForm,amount:Number(infForm.amount),id:uid()}]);
    setInfModal(false);
    setInfForm({month:new Date().getMonth(),source:"",amount:"",note:"",projectId:null});
  };
  const delInf=id=>upInfs(is=>is.filter(i=>i.id!==id));

  const saveSwatch=()=>{
    if(!swForm.name) return;
    const rec={...swForm,estCost:Number(swForm.estCost||0),id:editSw||uid(),date:today};
    upSwatches(ss=>editSw?ss.map(s=>s.id===editSw?rec:s):[...ss,rec]);
    setSwModal(false);setEditSw(null);
  };
  const swQ=(id,st)=>upSwatches(ss=>ss.map(s=>{
    if(s.id!==id) return s;
    const extra=st==="Client Approved"?{clientApprovedBy:session?.name||"",clientApprovedAt:today}:{};
    if(st==="Client Approved"){
      const msg=`✅ <b>Swatch Client Approved</b>\n${s.name} (${s.category})\nProject: ${deals.find(d=>d.id===s.projectId)?.client||s.projectId}\nApproved by: ${session?.name||"?"} · ${today}`;
      sendTelegramNotification("procurement",msg);
      sendTelegramNotification("sales",msg);
    }
    return {...s,status:st,...extra};
  }));

  const openDesignEdit=()=>{setDesignForm({...(proj?.design||mkDesign())});setDesignModal(true);};
  const saveDesign=()=>{
    const next={...designForm};
    if(proj?.design?.status!==next.status) next.statusHistory=[...(proj?.design?.statusHistory||[]),{status:next.status,date:today,by:role}];
    upProj(selProj,p=>({...p,design:next}));
    if(next.status==="Done"&&proj?.currentStage==="Design") upProj(selProj,p=>({...p,currentStage:"Fabrication",progress:{...p.progress,Design:100}}));
    setDesignModal(false);
  };
  const issueJO=()=>{
    const d=deals.find(x=>x.id===joSel),p=projs[joSel];
    const matT=(p?.materials||[]).reduce((s,m)=>s+m.cost,0);
    const totC=p?matT+(p.laborCost||0)+(p.overhead||0):0;
    const jo={joNum:`JO-${new Date().getFullYear()}-${String(jos.length+1).padStart(3,"0")}`,dateIssued:todayL,deal:d,project:p,matTotal:matT,totalCost:totC,...joExtra};
    upJos(j=>[jo,...j]);setViewJO(jo);setJoStep("preview");
  };

  // ── AUTH SCREENS ─────────────────────────────────────────────────────────────
  if(!ready) return(
    <div style={{minHeight:"100vh",background:"#f8fafc",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Segoe UI',sans-serif"}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"2rem",color:"#0f172a",letterSpacing:-1}}>GMD <span style={{color:"#f59e0b"}}>PRODUCTIONS</span></div>
        <div style={{color:"#94a3b8",marginTop:8,fontSize:".88rem"}}>Loading your workspace…</div>
      </div>
    </div>
  );

  // ── AUTH GATE ─────────────────────────────────────────────────────────────
  if(!session) return <><AuthScreen authView={authView} setAuthView={setAuthView} onLogin={login} onRegister={register}/><Toaster/></>;

  // ── SHARED NAV ────────────────────────────────────────────────────────────
  const roleColor=ROLE_CLR[role]||"#64748b";
  const hr=new Date().getHours();
  const greeting=hr<12?"morning":hr<17?"afternoon":"evening";
  const navMap={
    Manager:[
      {group:"Overview",    items:[{id:"home",l:"Dashboard"},{id:"calendar",l:"📅 Calendar"}]},
      {group:"Sales",       items:[{id:"pipeline",l:"Sales Pipeline"},{id:"clients",l:"🏢 Clients"}]},
      {group:"Finance",     items:[{id:"finance",l:"Finance"},{id:"billing",l:"Billing"},{id:"collections",l:"Collections"},{id:"accounting",l:"Accounting"}]},
      {group:"Operations",  items:[{id:"ops",l:"Operations"},{id:"projects",l:"📋 Projects"},{id:"joborders",l:"Job Orders"},{id:"checklist",l:"Checklist"}]},
      {group:"Design",      items:[{id:"drf",l:"📝 Design Requests"}]},
      {group:"Procurement", items:[{id:"procurement",l:"Procurement"},{id:"materialreq",l:"Material Requests"},{id:"budgetreq",l:"Budget Requests"},{id:"swatchboard",l:"Swatchboard"},{id:"suppliers",l:"Supplier Master"},{id:"subcontractors",l:"Subcon Master"}]},
      {group:"QS / Cost",   items:[{id:"costanalysis",l:"Cost Analysis"},{id:"inventory",l:"Inventory"}]},
      {group:"Admin",       items:[{id:"accounts",l:"👥 Accounts"},{id:"botsettings",l:"🤖 Bot Settings"}]},
    ],
    Sales:[
      {group:"Pipeline",     items:[{id:"pipeline",l:"Sales Pipeline"},{id:"calendar",l:"📅 Calendar"},{id:"clients",l:"🏢 Clients"}]},
      {group:"Projects",     items:[{id:"projects",l:"📋 Projects"},{id:"collections",l:"Collections"}]},
      {group:"Deliverables", items:[{id:"drf",l:"📝 Design Requests"},{id:"checklist",l:"Checklist"}]},
    ],
    Finance:[
      {group:"Overview",   items:[{id:"home",l:"Cash Position"}]},
      {group:"Financials", items:[{id:"billing",l:"Billing"},{id:"accounting",l:"Accounting"},{id:"collections",l:"Collections"}]},
      {group:"Projects",   items:[{id:"projects",l:"📋 Projects"},{id:"clients",l:"🏢 Clients"}]},
    ],
    Procurement:[
      {group:"Overview",   items:[{id:"home",l:"Overview"}]},
      {group:"Orders",     items:[{id:"procurement",l:"Purchase Orders"},{id:"materialreq",l:"Material Requests"},{id:"budgetreq",l:"Budget Requests"},{id:"suppliers",l:"Supplier Master"},{id:"subcontractors",l:"Subcon Master"}]},
      {group:"Materials",  items:[{id:"swatchboard",l:"Swatchboard"}]},
      {group:"Projects",   items:[{id:"projects",l:"📋 Projects"},{id:"clients",l:"🏢 Clients"}]},
    ],
    QS:[
      {group:"Overview", items:[{id:"home",l:"Dashboard"}]},
      {group:"Projects", items:[{id:"projects",l:"📋 Projects"},{id:"costanalysis",l:"Cost Analysis"}]},
    ],
    Operations:[
      {group:"Overview",  items:[{id:"home",l:"Projects"},{id:"calendar",l:"📅 Calendar"}]},
      {group:"On-Site",   items:[{id:"projects",l:"📋 Project Cards"},{id:"joborders",l:"Job Orders"},{id:"checklist",l:"Checklist"}]},
      {group:"Requests",  items:[{id:"costanalysis",l:"Cost Analysis"},{id:"materialreq",l:"Material Requests"},{id:"budgetreq",l:"Budget Requests"}]},
    ],
    Design:[
      {group:"Overview",    items:[{id:"home",l:"Projects"}]},
      {group:"Design Work", items:[{id:"drf",l:"📝 Design Requests"},{id:"projects",l:"📋 Project Cards"},{id:"checklist",l:"Checklist"},{id:"swatchboard",l:"Swatchboard"}]},
    ],
    ProjectMover:[
      {group:"Overview", items:[{id:"home",l:"My Projects"}]},
      {group:"Updates",  items:[{id:"pmupdates",l:"📝 PM Updates"},{id:"addenda",l:"⚠️ Scope Changes"}]},
      {group:"Work",     items:[{id:"joborders",l:"Job Orders"},{id:"checklist",l:"Checklist"}]},
    ],
    Warehouse:[
      {group:"Overview", items:[{id:"home",l:"Dashboard"}]},
      {group:"Stock",    items:[{id:"deliveries",l:"📦 Deliveries"},{id:"inventory",l:"Inventory"},{id:"stockmove",l:"Stock Movements"}]},
    ],
  };
  const Nav=()=>{
    const NAV_ICONS={
      home:"🏠",pipeline:"📊",projects:"📋",finance:"💰",billing:"🧾",ops:"⚙️",
      checklist:"✅",joborders:"📄",costanalysis:"📈",accounting:"📒",
      procurement:"📦",clients:"🏢",datamanagement:"⚙",accounts:"👥",
      collections:"💵",materialreq:"🔧",budgetreq:"💳",swatchboard:"🎨",
      drf:"📝",deliveries:"🚚",stockmove:"📦",
      suppliers:"🏭",subcontractors:"👷",
      "Sales Pipeline":"📊","My Pipeline":"📊",
    };
    const groups=navMap[role]||[];
    const allItems=groups.flatMap(g=>g.items||[]);
    const pauloExtra=session?.username==="paulo"?[{id:"datamanagement",l:"⚙ Data"}]:[];
    const NavBtn=({id,l,collapsed})=>{
      const active=page===id;
      const icon=NAV_ICONS[id]||NAV_ICONS[l]||"•";
      return(
        <button key={id} onClick={()=>{setPage(id);setSelProj(null);setJoStep("select");setDealModal(false);}}
          title={collapsed?l:""}
          style={{display:"flex",alignItems:"center",gap:10,width:"100%",border:"none",borderRadius:0,padding:collapsed?"10px 0":"8px 16px",justifyContent:collapsed?"center":"flex-start",background:active?"rgba(245,158,11,.15)":"transparent",color:active?"#f59e0b":"#94a3b8",fontFamily:"inherit",fontSize:".82rem",fontWeight:active?700:400,cursor:"pointer",borderLeft:active?"3px solid #f59e0b":"3px solid transparent",transition:"all .12s"}}>
          <span style={{fontSize:"1rem",flexShrink:0}}>{icon}</span>
          {!collapsed&&<span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{l}</span>}
        </button>
      );
    };
    const W = navCollapsed ? 64 : 220;
    return(
      <aside style={{position:"fixed",left:0,top:0,height:"100vh",width:W,background:"#1e293b",display:"flex",flexDirection:"column",zIndex:200,transition:"width .2s",overflow:"hidden",boxShadow:"2px 0 12px rgba(0,0,0,.15)"}} className="noprint">
        {/* Logo + collapse toggle */}
        <div style={{display:"flex",alignItems:"center",justifyContent:navCollapsed?"center":"space-between",padding:navCollapsed?"16px 0":"14px 16px",borderBottom:"1px solid rgba(255,255,255,.08)",minHeight:56,flexShrink:0}}>
          {!navCollapsed&&<div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:"1.1rem",color:"#fff",letterSpacing:-.5}}>GMD <span style={{color:"#f59e0b"}}>PROD</span></div>}
          <button onClick={()=>setNavCollapsed(c=>!c)} style={{background:"rgba(255,255,255,.08)",border:"none",borderRadius:6,width:28,height:28,cursor:"pointer",color:"#94a3b8",fontSize:"1rem",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            {navCollapsed?"→":"←"}
          </button>
        </div>
        {/* Nav items */}
        <div style={{flex:1,overflowY:"auto",padding:"8px 0"}}>
          {navCollapsed ? (
            [...allItems,...pauloExtra].map(({id,l})=><NavBtn key={id} id={id} l={l} collapsed={true}/>)
          ) : (
            <>
              {groups.map((section,si)=>(
                <div key={si} style={{marginBottom:4}}>
                  <div style={{padding:"8px 16px 3px",fontSize:".58rem",fontWeight:800,color:"#475569",textTransform:"uppercase",letterSpacing:"0.08em"}}>
                    {section.group}
                  </div>
                  {(section.items||[]).map(({id,l})=><NavBtn key={id} id={id} l={l} collapsed={false}/>)}
                </div>
              ))}
              {pauloExtra.map(({id,l})=><NavBtn key={id} id={id} l={l} collapsed={false}/>)}
            </>
          )}
        </div>
        {/* Bottom: user info + actions */}
        <div style={{borderTop:"1px solid rgba(255,255,255,.08)",padding:navCollapsed?"12px 0":"12px 14px",flexShrink:0}}>
          {!navCollapsed&&(
            <>
              <div style={{background:roleColor+"22",borderRadius:20,padding:"4px 10px",fontSize:".7rem",fontWeight:700,color:roleColor,marginBottom:8,textAlign:"center"}}>
                {session?.name?.split(" ")[0]} · {session?.title||role}
              </div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"center",marginBottom:8}}>
                <span onClick={async()=>{
                  if(!isSupabaseReady()) return;
                  try{
                    const data=await sbLoadAll();
                    if(data?.deals?.length) setDeals(data.deals.map(d=>({...d,ceNo:d.ce_no,ceType:d.ce_type,salesOwner:d.sales_owner,bizDevSource:d.biz_dev_source,dateAcquired:d.date_acquired,dueDate:d.due_date,amountPaid:Number(d.amount_paid)||0,paymentStatus:d.payment_status,receiptType:d.receipt_type,commsGroup:d.comms_group,salesRepoLink:d.sales_repo_link,proposalFolderLink:d.proposal_folder_link,stage:normalizeStage(d.stage)})));
                    if(data?.jos?.length) setJos(data.jos.map(j=>({...j,dealId:j.deal_id,joNo:j.jo_no,projectName:j.project_name,awardTrigger:j.award_trigger,triggerDate:j.trigger_date,startDate:j.start_date,commsLink:j.comms_link,scopeNotes:j.scope_notes,specialInstructions:j.special_instructions,budgetStatus:j.budget_status,issuedDate:j.issued_date,aeAssigned:j.ae_assigned})));
                    if(Object.keys(data?.pcards||{}).length) setPcards(data.pcards);
                    setSync("saved");
                  }catch(e){setSync("error");}
                }}
                title="Click to sync latest data from server"
                style={{fontSize:".62rem",cursor:"pointer",userSelect:"none"}}>
                {sync==="saving"?<span style={{color:"#f59e0b"}}>saving…</span>:sync!=="saved"?<span style={{color:"#ef4444"}}>⚠ error</span>:<span style={{color:"#10b981"}}>🔄</span>}
              </span>
                {role==="Manager"&&users.filter(u=>u.status==="pending").length>0&&(
                  <button onClick={()=>setPage("accounts")} style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:6,padding:"3px 8px",fontSize:".65rem",color:"#dc2626",cursor:"pointer",fontFamily:"inherit",fontWeight:700}}>
                    {users.filter(u=>u.status==="pending").length} pending
                  </button>
                )}
              </div>
              <div style={{display:"flex",gap:5,justifyContent:"center",flexWrap:"wrap"}}>
                <button onClick={()=>setShowExport(s=>!s)} title="Backup" style={{background:"rgba(255,255,255,.08)",border:"none",borderRadius:6,padding:"5px 8px",color:"#94a3b8",cursor:"pointer",fontSize:".72rem",fontFamily:"inherit"}}>💾</button>
                <a href="/handbook.html" target="_blank" rel="noopener noreferrer" style={{background:"rgba(245,158,11,.15)",border:"1px solid rgba(245,158,11,.3)",borderRadius:6,padding:"5px 8px",color:"#f59e0b",fontSize:".72rem",fontWeight:700,textDecoration:"none"}}>📘</a>
                <button onClick={()=>setPage("myaccount")} title="My Account & Settings" style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",borderRadius:6,padding:"5px 8px",color:"#94a3b8",cursor:"pointer",fontSize:".72rem",fontFamily:"inherit"}}>⚙️</button>
                <button onClick={logout} style={{background:"rgba(239,68,68,.15)",border:"1px solid rgba(239,68,68,.2)",borderRadius:6,padding:"5px 8px",color:"#ef4444",cursor:"pointer",fontSize:".72rem",fontFamily:"inherit"}}>↩ Out</button>
              </div>
            </>
          )}
          {navCollapsed&&(
            <div style={{display:"flex",flexDirection:"column",gap:6,alignItems:"center"}}>
              <button onClick={()=>setShowExport(s=>!s)} title="Backup" style={{background:"rgba(255,255,255,.08)",border:"none",borderRadius:6,padding:"6px",color:"#94a3b8",cursor:"pointer",fontSize:".85rem"}}>💾</button>
              <a href="/handbook.html" target="_blank" rel="noopener noreferrer" title="Handbook" style={{background:"rgba(245,158,11,.15)",border:"1px solid rgba(245,158,11,.3)",borderRadius:6,padding:"6px",color:"#f59e0b",fontSize:".85rem",textDecoration:"none"}}>📘</a>
              <button onClick={logout} title="Log out" style={{background:"rgba(239,68,68,.12)",border:"none",borderRadius:6,padding:"6px",color:"#ef4444",cursor:"pointer",fontSize:".75rem",fontFamily:"inherit"}}>↩</button>
              <button onClick={()=>setPage("myaccount")} title="My Account" style={{background:"rgba(255,255,255,.06)",border:"none",borderRadius:6,padding:"6px",color:"#94a3b8",cursor:"pointer",fontSize:".85rem",fontFamily:"inherit"}}>⚙️</button>
            </div>
          )}
        </div>
      </aside>
    );
  };
  const Wrap=({children})=>{
    const W=navCollapsed?64:220;
    return(
      <div style={{minHeight:"100vh",background:"#f8fafc",fontFamily:"'Segoe UI',sans-serif",marginLeft:W,transition:"margin-left .2s"}}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800&display=swap'); .fi{animation:fadeIn .2s ease} @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}} @media print{.noprint{display:none}}`}</style>
        <Nav/>
        <Toaster/>
        <div style={{maxWidth:1140,margin:"0 auto",padding:"22px 24px"}} className="fi">{children}</div>
      {/* ── Export / Backup Panel ── */}
      {showExport&&(
        <div style={{position:"fixed",top:58,right:16,zIndex:800,background:"#fff",borderRadius:14,border:"1.5px solid #e2e8f0",boxShadow:"0 8px 32px rgba(0,0,0,.15)",padding:24,width:340,animation:"fi .2s ease"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <div style={{fontWeight:800,color:"#0f172a",fontSize:".95rem"}}>💾 Data Backup</div>
            <button onClick={()=>setShowExport(false)} style={{background:"#f1f5f9",border:"none",borderRadius:6,width:28,height:28,cursor:"pointer",color:"#64748b",fontSize:".9rem"}}>✕</button>
          </div>
          <div style={{fontSize:".78rem",color:"#64748b",marginBottom:16,lineHeight:1.6}}>
            Your data lives in this browser. Export a backup before any update so you never lose your real financials, deals, or expenses.
          </div>
          {isSupabaseReady()&&(
            <button onClick={migrateToCloud} style={{width:"100%",background:"#0ea5e9",border:"none",borderRadius:10,padding:"11px",fontFamily:"inherit",fontWeight:700,fontSize:".87rem",color:"#fff",cursor:"pointer",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
              ☁ Push All Data to Cloud
            </button>
          )}
          <ExportImportPanel KEYS={KEYS} onClose={()=>setShowExport(false)}/>
        </div>
      )}


      {/* Global Modals */}
      <DealModal open={dealModal} onClose={()=>setDealModal(false)} form={dealForm} setForm={setDealForm} onSave={saveDeal} editId={editDeal}/>
      <ExpenseModal open={expModal} onClose={()=>setExpModal(false)} form={expForm} setForm={setExpForm} onSave={saveExp} editId={editExpId} projList={projList} clientName={clientName}/>
      <Modal open={confirmDel!==null} onClose={()=>setConfirmDel(null)} title="Delete this deal?">
        <p style={{color:"#64748b",marginBottom:20}}>This removes the deal and its project from Operations. This cannot be undone.</p>
        <div style={{display:"flex",gap:10}}><Btn variant="danger" onClick={()=>delDeal(confirmDel)}>Yes, Delete</Btn><Btn variant="ghost" onClick={()=>setConfirmDel(null)}>Cancel</Btn></div>
      </Modal>
      <Modal open={swModal} onClose={()=>setSwModal(false)} title={editSw?"Edit Swatch Item":"Add to Swatchboard"} wide>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          <div style={{gridColumn:"1/-1"}}><Fld label="Item Name" required><Inp value={swForm.name} onChange={e=>setSwForm(p=>({...p,name:e.target.value}))} placeholder="e.g. Walnut veneer, Brass pulls 96mm"/></Fld></div>
          <Fld label="Category"><Sel value={swForm.category} onChange={e=>setSwForm(p=>({...p,category:e.target.value}))}>{SWATCH_CATS.map(c=><option key={c}>{c}</option>)}</Sel></Fld>
          <Fld label="Added By"><Sel value={swForm.addedBy} onChange={e=>setSwForm(p=>({...p,addedBy:e.target.value}))}><option>Design</option><option>Ops</option></Sel></Fld>
          <Fld label="Quantity"><Inp type="number" value={swForm.qty} onChange={e=>setSwForm(p=>({...p,qty:e.target.value}))}/></Fld>
          <Fld label="Unit"><Sel value={swForm.unit} onChange={e=>setSwForm(p=>({...p,unit:e.target.value}))}>{MAT_UNITS.map(u=><option key={u}>{u}</option>)}</Sel></Fld>
          <Fld label="Supplier"><Inp value={swForm.supplier} onChange={e=>setSwForm(p=>({...p,supplier:e.target.value}))} placeholder="e.g. Casa Hardware"/></Fld>
          <Fld label="Est. Cost (₱)"><Inp type="number" value={swForm.estCost} onChange={e=>setSwForm(p=>({...p,estCost:e.target.value}))}/></Fld>
          <Fld label="Status"><Sel value={swForm.status} onChange={e=>setSwForm(p=>({...p,status:e.target.value}))}>{SWATCH_STATUS.map(s=><option key={s}>{s}</option>)}</Sel></Fld>
          <div style={{gridColumn:"1/-1"}}><Fld label="Project"><Sel value={swForm.projectId||"none"} onChange={e=>setSwForm(p=>({...p,projectId:e.target.value==="none"?null:e.target.value}))}><option value="none">— Not linked —</option>{projList.map(d=><option key={d.id} value={d.id}>{d.client}</option>)}</Sel></Fld></div>
          <div style={{gridColumn:"1/-1"}}><Fld label="Swatch / Reference Link"><Inp type="url" value={swForm.swatchLink||""} onChange={e=>setSwForm(p=>({...p,swatchLink:e.target.value}))} placeholder="https://… (optional)"/></Fld></div>
          <div style={{gridColumn:"1/-1"}}><Fld label="Notes"><Inp rows={2} value={swForm.notes||""} onChange={e=>setSwForm(p=>({...p,notes:e.target.value}))}/></Fld></div>
        </div>
        <div style={{display:"flex",gap:10,marginTop:16}}><Btn full onClick={saveSwatch}>{editSw?"Save Changes":"Add Item"}</Btn><Btn variant="ghost" onClick={()=>setSwModal(false)}>Cancel</Btn></div>
      </Modal>
      <Modal open={designModal&&!!proj} onClose={()=>setDesignModal(false)} title="Edit Design Details" wide>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          <div style={{gridColumn:"1/-1"}}>
            <Fld label="Design Status">
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {DESIGN_STATUSES.map(s=>(
                  <button key={s} onClick={()=>setDesignForm(p=>({...p,status:s}))} style={{padding:"7px 14px",border:`2px solid ${designForm.status===s?DS_CLR[s]:"#e2e8f0"}`,borderRadius:20,background:designForm.status===s?DS_CLR[s]+"18":"#fff",color:designForm.status===s?DS_CLR[s]:"#64748b",fontWeight:designForm.status===s?700:400,cursor:"pointer",fontSize:".8rem",fontFamily:"inherit"}}>
                    {s}
                  </button>
                ))}
              </div>
            </Fld>
          </div>
          <Fld label="Designer"><Sel value={designForm.designer||""} onChange={e=>setDesignForm(p=>({...p,designer:e.target.value}))}><option value="">— Select —</option>{DESIGN_MEMBERS.map(m=><option key={m}>{m}</option>)}</Sel></Fld>
          <Fld label="Type"><Sel value={designForm.designerType||"in-house"} onChange={e=>setDesignForm(p=>({...p,designerType:e.target.value}))}><option value="in-house">In-house</option><option value="outsourced">Outsourced</option></Sel></Fld>
          <Fld label="Due Date"><Inp type="date" value={designForm.dueDate||""} onChange={e=>setDesignForm(p=>({...p,dueDate:e.target.value}))}/></Fld>
          <div style={{gridColumn:"1/-1"}}><Fld label="File / Link (Google Drive, Figma, etc.)"><Inp type="url" value={designForm.link||""} onChange={e=>setDesignForm(p=>({...p,link:e.target.value}))} placeholder="https://…"/></Fld></div>
          <div style={{gridColumn:"1/-1"}}><Fld label="Notes"><Inp rows={3} value={designForm.notes||""} onChange={e=>setDesignForm(p=>({...p,notes:e.target.value}))}/></Fld></div>
        </div>
        {designForm.status==="Done"&&proj?.currentStage==="Design"&&(
          <div style={{background:"#f0fdf4",border:"1.5px solid #6ee7b7",borderRadius:10,padding:"10px 14px",margin:"12px 0",fontSize:".82rem",color:"#059669"}}>✓ Marking as Done will advance this project to Fabrication automatically.</div>
        )}
        <div style={{display:"flex",gap:10,marginTop:16}}><Btn full onClick={saveDesign}>Save Design Details</Btn><Btn variant="ghost" onClick={()=>setDesignModal(false)}>Cancel</Btn></div>
      </Modal>
      <Modal open={infModal} onClose={()=>setInfModal(false)} title="Log Inflow / Payment">
        <Fld label="Month">
          <Sel value={infForm?.month??new Date().getMonth()} onChange={e=>setInfForm(p=>({...p,month:Number(e.target.value)}))}>
            {MONTHS.map((m,i)=><option key={m} value={i}>{m}</option>)}
          </Sel>
        </Fld>
        <Fld label="Amount (₱)" required>
          <Inp type="number" value={infForm?.amount||""} onChange={e=>setInfForm(p=>({...p,amount:e.target.value}))} placeholder="e.g. 25000"/>
        </Fld>
        <Fld label="Source / Client" required>
          <Inp value={infForm?.source||""} onChange={e=>setInfForm(p=>({...p,source:e.target.value}))} placeholder="e.g. Metro Retail Co."/>
        </Fld>
        <Fld label="Link to Project">
          <Sel value={infForm?.projectId||"none"} onChange={e=>setInfForm(p=>({...p,projectId:e.target.value==="none"?null:e.target.value}))}>
            <option value="none">— Not linked to a project —</option>
            {projList.map(d=><option key={d.id} value={d.id}>{d.client}</option>)}
          </Sel>
        </Fld>
        <Fld label="Note" hint="e.g. Full payment, 50% deposit, partial">
          <Inp value={infForm?.note||""} onChange={e=>setInfForm(p=>({...p,note:e.target.value}))} placeholder="Payment note"/>
        </Fld>
        <div style={{display:"flex",gap:10,marginTop:20}}>
          <Btn full onClick={saveInf}>✓ Save Payment</Btn>
          <Btn variant="ghost" onClick={()=>setInfModal(false)}>Cancel</Btn>
        </div>
      </Modal>
    </div>
  );
  };

  if(page==="home"){

  // Sales should never land here — redirect to pipeline
  if(role==="Sales"){ setTimeout(()=>setPage("pipeline"),0); return null; }

  // ── FINANCE HOME ──────────────────────────────────────────────────────────
  if(role==="Finance") return(
    <Wrap>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:"1.6rem",color:"#0f172a"}}>Good {greeting}, Aerwin 👋</div>
          <div style={{color:"#64748b",fontSize:".85rem",marginTop:2}}>Finance Dashboard · {todayL}</div>
        </div>
        <button onClick={()=>setPage("billing")} style={{background:"#3b82f6",border:"none",borderRadius:9,padding:"9px 18px",color:"#fff",fontFamily:"inherit",fontWeight:700,fontSize:".85rem",cursor:"pointer"}}>📋 Open Billing</button>
      </div>

      {/* KPI row */}
      {(()=>{
        const allMs=billings.filter(b=>b.dealId);
        const totalBilled=allMs.reduce((s,m)=>s+Number(m.amount||0),0);
        const totalPaid=allMs.reduce((s,m)=>s+(m.payments||[]).reduce((ps,p)=>ps+Number(p.amount||0),0),0);
        const totalOutstanding=totalBilled-totalPaid;
        const today2=new Date();
        const overdue30=allMs.filter(m=>m.dueDate&&new Date(m.dueDate)<today2&&m.status!=="Fully Paid");
        const todayCash=Object.values(cashPositions).find(c=>c.date===today)||null;
        return(
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:24}}>
            {[
              {l:"Total Billed YTD",   v:"₱"+Math.round(totalBilled/1000)+"K",              c:"#3b82f6", icon:"🧾"},
              {l:"Collected",          v:"₱"+Math.round(totalPaid/1000)+"K",                c:"#059669", icon:"✅"},
              {l:"Outstanding",        v:"₱"+Math.round(totalOutstanding/1000)+"K",         c:"#ef4444", icon:"⏰"},
              {l:"Overdue Invoices",   v:overdue30.length+" invoices",                      c:"#f59e0b", icon:"🚨"},
            ].map(({l,v,c,icon})=>(
              <div key={l} style={{background:"#fff",borderRadius:12,padding:"16px",border:"1.5px solid #e2e8f0",textAlign:"center"}}>
                <div style={{fontSize:"1.4rem",marginBottom:4}}>{icon}</div>
                <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.3rem",color:c}}>{v}</div>
                <div style={{fontSize:".65rem",textTransform:"uppercase",letterSpacing:"1px",color:"#94a3b8",marginTop:3}}>{l}</div>
              </div>
            ))}
          </div>
        );
      })()}

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        {/* Cash position shortcut */}
        <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",overflow:"hidden"}}>
          <div style={{background:"#1e293b",padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontWeight:700,color:"#f59e0b",fontSize:".88rem"}}>💰 Daily Cash Position</span>
            <button onClick={()=>setPage("finance")} style={{background:"rgba(255,255,255,.1)",border:"none",borderRadius:6,padding:"4px 10px",color:"#fff",fontSize:".72rem",cursor:"pointer",fontFamily:"inherit"}}>Open →</button>
          </div>
          <div style={{padding:"14px 16px"}}>
            {Object.keys(cashPositions).length===0
              ? <div style={{color:"#94a3b8",fontSize:".82rem",textAlign:"center",padding:"16px"}}>No cash position entries yet. Click Open to start today's entry.</div>
              : (()=>{
                  const latest=Object.values(cashPositions).sort((a,b)=>new Date(b.date)-new Date(a.date))[0];
                  if(!latest) return <div style={{color:"#94a3b8",fontSize:".82rem",textAlign:"center",padding:"16px"}}>No valid entries found.</div>;
                  const total=["bpi","metrobank","chinabank","bdo","secbank","unionbank"].reduce((s,b)=>s+Number(latest[b+"_end"]||latest[b+"End"]||0),0);
                  return(
                    <div>
                      <div style={{fontSize:".72rem",color:"#94a3b8",marginBottom:8}}>Last entry: {latest.date}</div>
                      <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.8rem",color:"#059669"}}>₱{total.toLocaleString("en-PH",{minimumFractionDigits:0})}</div>
                      <div style={{fontSize:".72rem",color:"#64748b"}}>Total ending balance across 6 banks</div>
                    </div>
                  );
                })()
            }
          </div>
        </div>

        {/* Overdue invoices */}
        <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",overflow:"hidden"}}>
          <div style={{background:"#dc2626",padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontWeight:700,color:"#fff",fontSize:".88rem"}}>🚨 Overdue Invoices</span>
            <button onClick={()=>setPage("billing")} style={{background:"rgba(255,255,255,.2)",border:"none",borderRadius:6,padding:"4px 10px",color:"#fff",fontSize:".72rem",cursor:"pointer",fontFamily:"inherit"}}>View All →</button>
          </div>
          <div style={{padding:"0"}}>
            {(()=>{
              const today2=new Date();
              const od=billings.filter(m=>m.dueDate&&new Date(m.dueDate)<today2&&m.status!=="Fully Paid")
                .sort((a,b)=>new Date(a.dueDate)-new Date(b.dueDate)).slice(0,5);
              if(!od.length) return <div style={{padding:"16px",color:"#94a3b8",fontSize:".82rem",textAlign:"center"}}>✅ No overdue invoices</div>;
              return od.map((m,i)=>{
                const d=wonDeals.find(x=>x.id===m.dealId);
                const days=Math.floor((today2-new Date(m.dueDate))/(1000*60*60*24));
                const paid=(m.payments||[]).reduce((s,p)=>s+Number(p.amount||0),0);
                const bal=Number(m.amount||0)-paid;
                return(
                  <div key={m.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 14px",borderBottom:i<4?"1px solid #f8fafc":"",flexWrap:"wrap",gap:4}}>
                    <div>
                      <div style={{fontWeight:600,color:"#0f172a",fontSize:".82rem"}}>{d?.client||"?"}</div>
                      <div style={{fontSize:".68rem",color:"#94a3b8"}}>{m.invoiceNo||"No invoice #"}</div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontWeight:700,color:"#dc2626",fontSize:".82rem"}}>₱{Math.round(bal).toLocaleString()}</div>
                      <div style={{fontSize:".68rem",color:"#f59e0b"}}>{days}d overdue</div>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      </div>

      {/* Projects needing billing setup */}
      {(()=>{
        const noBilling=wonDeals.filter(d=>!billings.find(b=>b.dealId===d.id));
        if(!noBilling.length) return null;
        return(
          <div style={{marginTop:16,background:"#fffbeb",border:"1.5px solid #fde68a",borderRadius:12,padding:"14px 18px"}}>
            <div style={{fontWeight:700,color:"#92400e",marginBottom:10,fontSize:".88rem"}}>⚠️ {noBilling.length} awarded projects have no billing milestones set up</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {noBilling.slice(0,6).map(d=>(
                <button key={d.id} onClick={()=>{setPage("billing");}} style={{background:"#fff",border:"1px solid #fde68a",borderRadius:20,padding:"4px 12px",fontSize:".75rem",color:"#92400e",cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>{d.client} — {d.ceNo}</button>
              ))}
              {noBilling.length>6&&<span style={{fontSize:".75rem",color:"#92400e",padding:"4px 8px"}}>+{noBilling.length-6} more</span>}
            </div>
          </div>
        );
      })()}
    </Wrap>
  );

  // ── QS HOME ──────────────────────────────────────────────────────────────
  if(role==="QS") return(
    <Wrap>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:"1.6rem",color:"#0f172a"}}>Good {greeting}, {session?.name?.split(" ")[0]||"there"} 👋</div>
          <div style={{color:"#64748b",fontSize:".85rem",marginTop:2}}>QS Dashboard · {todayL}</div>
        </div>
        <button onClick={()=>setPage("costanalysis")} style={{background:"#8b5cf6",border:"none",borderRadius:9,padding:"9px 18px",color:"#fff",fontFamily:"inherit",fontWeight:700,fontSize:".85rem",cursor:"pointer"}}>📈 Cost Analysis</button>
      </div>

      {(()=>{
        const noBudget=wonDeals.filter(d=>!budgets[d.id]||(!budgets[d.id].Materials&&!budgets[d.id].Labor&&!budgets[d.id].Overhead&&!budgets[d.id].Subcon));
        const autoBudgets=wonDeals.filter(d=>budgets[d.id]?.autoGenerated);
        const withBudget=wonDeals.filter(d=>budgets[d.id]);
        const overBudget=withBudget.filter(d=>{
          const b=budgets[d.id];const total=(b.Materials||0)+(b.Labor||0)+(b.Overhead||0)+(b.Subcon||0);
          const spent=exps.filter(e=>e.dealId===d.id).reduce((s,e)=>s+Number(e.amount||0),0);
          return spent>total&&total>0;
        });

        // Margin health per project
        const marginHealth=wonDeals.map(d=>{
          const b=budgets[d.id];
          const budgetTotal=b?(b.Materials||0)+(b.Labor||0)+(b.Overhead||0)+(b.Subcon||0):0;
          const spent=exps.filter(e=>e.dealId===d.id).reduce((s,e)=>s+Number(e.amount||0),0);
          const contractVal=Number(d.value||0);
          const projectedCost=budgetTotal>0?Math.max(spent,budgetTotal):spent;
          const margin=contractVal>0?Math.round((contractVal-projectedCost)/contractVal*100):null;
          const jo=jos.find(j=>j.dealId===d.id);
          return{d,margin,spent,budgetTotal,contractVal,jo,isAuto:b?.autoGenerated,needsReview:b?.autoGenerated};
        }).filter(x=>x.contractVal>0);

        const healthGreen=marginHealth.filter(x=>x.margin!==null&&x.margin>=30);
        const healthYellow=marginHealth.filter(x=>x.margin!==null&&x.margin>=20&&x.margin<30);
        const healthRed=marginHealth.filter(x=>x.margin!==null&&x.margin<20);

        return(<div style={{display:"flex",flexDirection:"column",gap:16}}>
          {/* KPI Row */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
            {[
              {l:"Active Projects",    v:wonDeals.length,         c:"#8b5cf6", icon:"📋"},
              {l:"Auto-Budget Set",    v:autoBudgets.length,      c:"#06b6d4", icon:"🤖", sub:"needs QS review"},
              {l:"Needs Budget",       v:noBudget.length,         c:"#f59e0b", icon:"⏳", click:()=>setPage("costanalysis")},
              {l:"Over Budget",        v:overBudget.length,       c:"#ef4444", icon:"🚨", click:()=>setPage("costanalysis")},
            ].map(({l,v,c,icon,sub,click})=>(
              <div key={l} onClick={click} style={{background:"#fff",borderRadius:12,padding:"16px",border:`1.5px solid ${c}33`,textAlign:"center",cursor:click?"pointer":"default"}}>
                <div style={{fontSize:"1.4rem",marginBottom:4}}>{icon}</div>
                <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.5rem",color:c}}>{v}</div>
                <div style={{fontSize:".65rem",textTransform:"uppercase",letterSpacing:"1px",color:"#94a3b8",marginTop:3}}>{l}</div>
                {sub&&<div style={{fontSize:".62rem",color:"#94a3b8",marginTop:2}}>{sub}</div>}
              </div>
            ))}
          </div>

          {/* Margin health summary row */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
            {[
              {l:"On Target (≥30%)",  v:healthGreen.length,  c:"#059669", bg:"#f0fdf4", border:"#6ee7b7", icon:"🟢"},
              {l:"At Risk (20–29%)",  v:healthYellow.length, c:"#d97706", bg:"#fffbeb", border:"#fde68a", icon:"🟡"},
              {l:"Below Target (<20%)",v:healthRed.length,   c:"#dc2626", bg:"#fef2f2", border:"#fecaca", icon:"🔴"},
            ].map(({l,v,c,bg,border,icon})=>(
              <div key={l} style={{background:bg,borderRadius:12,padding:"14px",border:`1.5px solid ${border}`,textAlign:"center"}}>
                <div style={{fontSize:"1.2rem",marginBottom:3}}>{icon}</div>
                <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.4rem",color:c}}>{v}</div>
                <div style={{fontSize:".65rem",color:c,fontWeight:600,marginTop:2}}>{l}</div>
              </div>
            ))}
          </div>

          {/* Auto-budgets needing review */}
          {autoBudgets.length>0&&(
            <div style={{background:"#eff6ff",borderRadius:12,border:"1.5px solid #93c5fd",overflow:"hidden"}}>
              <div style={{background:"#1d4ed8",padding:"11px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontWeight:700,color:"#fff",fontSize:".88rem"}}>🤖 {autoBudgets.length} Auto-Budgets Pending Your Review</span>
                <span style={{fontSize:".7rem",color:"rgba(255,255,255,.7)"}}>System set 30% margin target — please verify splits</span>
              </div>
              {autoBudgets.slice(0,6).map((d,i)=>{
                const b=budgets[d.id];
                const total=(b.Materials||0)+(b.Labor||0)+(b.Overhead||0)+(b.Subcon||0);
                const margin=Number(d.value||0)>0?Math.round((Number(d.value||0)-total)/Number(d.value||0)*100):0;
                const jo=jos.find(j=>j.dealId===d.id);
                return(
                  <div key={d.id} onClick={()=>setPage("costanalysis")} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 16px",borderBottom:i<autoBudgets.length-1?"1px solid #dbeafe":"",cursor:"pointer",background:"#fff"}}
                    onMouseEnter={e=>e.currentTarget.style.background="#eff6ff"}
                    onMouseLeave={e=>e.currentTarget.style.background="#fff"}>
                    <div>
                      <div style={{fontWeight:600,color:"#0f172a",fontSize:".85rem"}}>{d.client}</div>
                      <div style={{fontSize:".72rem",color:"#64748b",marginTop:1}}>{d.ceNo} · PM: {jo?.pm1||"—"} · Budget: ₱{Math.round(total).toLocaleString("en-PH",{maximumFractionDigits:0})}</div>
                    </div>
                    <div style={{display:"flex",gap:8,alignItems:"center",flexShrink:0}}>
                      <span style={{fontSize:".72rem",fontWeight:700,color:margin>=30?"#059669":"#f59e0b",background:margin>=30?"#f0fdf4":"#fffbeb",border:`1px solid ${margin>=30?"#6ee7b7":"#fde68a"}`,borderRadius:20,padding:"2px 8px"}}>{margin}% margin</span>
                      <span style={{fontSize:".68rem",background:"#dbeafe",color:"#1d4ed8",border:"1px solid #93c5fd",borderRadius:20,padding:"2px 7px",fontWeight:600}}>Auto</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Margin health per project */}
          {marginHealth.length>0&&(
            <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",overflow:"hidden"}}>
              <div style={{background:"#1e293b",padding:"11px 16px"}}>
                <span style={{fontWeight:700,color:"#a78bfa",fontSize:".88rem"}}>📊 Margin Health — All Projects</span>
              </div>
              {marginHealth.sort((a,b)=>(a.margin??999)-(b.margin??999)).map((x,i)=>{
                const {d,margin,spent,budgetTotal,contractVal,isAuto}=x;
                const clr=margin===null?"#94a3b8":margin>=30?"#059669":margin>=20?"#d97706":"#dc2626";
                const bgClr=margin===null?"#f8fafc":margin>=30?"#f0fdf4":margin>=20?"#fffbeb":"#fef2f2";
                const pct=contractVal>0?Math.min(100,Math.round(spent/contractVal*100)):0;
                return(
                  <div key={d.id} style={{padding:"10px 16px",borderBottom:i<marginHealth.length-1?"1px solid #f8fafc":"",background:bgClr+"80"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:5}}>
                      <div>
                        <div style={{fontWeight:600,color:"#0f172a",fontSize:".84rem"}}>{d.client}</div>
                        <div style={{fontSize:".68rem",color:"#94a3b8"}}>{d.ceNo} · Contract: ₱{Math.round(contractVal).toLocaleString("en-PH",{maximumFractionDigits:0})}{isAuto?<span style={{marginLeft:5,background:"#dbeafe",color:"#1d4ed8",borderRadius:20,padding:"1px 6px",fontWeight:600}}>Auto</span>:null}</div>
                      </div>
                      <span style={{fontWeight:800,color:clr,fontSize:".9rem",flexShrink:0}}>
                        {margin===null?"No data":margin+"%"}
                      </span>
                    </div>
                    {budgetTotal>0&&(
                      <div style={{height:5,background:"#f1f5f9",borderRadius:3,overflow:"hidden"}}>
                        <div style={{height:"100%",width:pct+"%",background:clr,borderRadius:3,transition:"width .5s"}}/>
                      </div>
                    )}
                    {budgetTotal>0&&<div style={{fontSize:".62rem",color:"#94a3b8",marginTop:3}}>Spent ₱{Math.round(spent).toLocaleString("en-PH",{maximumFractionDigits:0})} of ₱{Math.round(budgetTotal).toLocaleString("en-PH",{maximumFractionDigits:0})} budget ({pct}%)</div>}
                  </div>
                );
              })}
            </div>
          )}

          {/* Scope changes needing QS pricing */}
          {(()=>{
            const unpricedScope=addenda.filter(a=>!a.value&&(a.status==="Discovered"||a.status==="Sales Notified"));
            if(!unpricedScope.length) return null;
            return(
              <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #fed7aa",overflow:"hidden"}}>
                <div style={{background:"#f59e0b",padding:"11px 16px"}}>
                  <span style={{fontWeight:700,color:"#fff",fontSize:".88rem"}}>⚠️ {unpricedScope.length} Scope Changes Need QS Pricing</span>
                </div>
                {unpricedScope.slice(0,5).map((a,i)=>{
                  const d=wonDeals.find(x=>x.id===a.dealId);
                  return(
                    <div key={a.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 16px",borderBottom:i<unpricedScope.length-1?"1px solid #f8fafc":""}}>
                      <div>
                        <div style={{fontWeight:600,color:"#0f172a",fontSize:".83rem"}}>{a.title}</div>
                        <div style={{fontSize:".7rem",color:"#94a3b8"}}>{d?.client||"?"} · {a.discoveredBy||"?"}</div>
                      </div>
                      <span style={{fontSize:".7rem",background:"#fef9c3",color:"#92400e",border:"1px solid #fde047",borderRadius:20,padding:"2px 8px",fontWeight:600}}>Needs price</span>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>);
      })()}
    </Wrap>
  );

  // ── PROCUREMENT HOME ──────────────────────────────────────────────────────
  if(role==="Procurement") return(
    <Wrap>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:"1.6rem",color:"#0f172a"}}>Good {greeting}, {session?.name?.split(" ")[0]||"there"} 👋</div>
          <div style={{color:"#64748b",fontSize:".85rem",marginTop:2}}>Procurement Overview · {todayL}</div>
        </div>
        <button onClick={()=>setPage("procurement")} style={{background:"#06b6d4",border:"none",borderRadius:9,padding:"9px 18px",color:"#fff",fontFamily:"inherit",fontWeight:700,fontSize:".85rem",cursor:"pointer"}}>📦 Purchase Orders</button>
      </div>

      {/* KPIs */}
      {(()=>{
        const pendingPRs=prs.filter(p=>["Pending Approval","Approved","PO Issued"].includes(p.status));
        const pendingMRs=mreqs.filter(m=>m.status==="Submitted"||m.status==="Approved");
        const pendingBRs=breqs.filter(b=>b.status==="Pending"||b.status==="Approved");
        const deliveredToday=prs.filter(p=>p.deliveryDate===today&&p.status==="Delivered");
        return(
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:24}}>
            {[
              {l:"Open Purchase Orders", v:pendingPRs.length, c:"#06b6d4", icon:"📦", click:()=>setPage("procurement")},
              {l:"Material Requests",    v:pendingMRs.length, c:"#f97316", icon:"🔧", click:()=>setPage("materialreq")},
              {l:"Budget Requests",      v:pendingBRs.length, c:"#8b5cf6", icon:"💳", click:()=>setPage("budgetreq")},
              {l:"Arriving Today",       v:deliveredToday.length, c:"#059669", icon:"🚚"},
            ].map(({l,v,c,icon,click})=>(
              <div key={l} onClick={click} style={{background:"#fff",borderRadius:12,padding:"16px",border:`1.5px solid ${c}33`,textAlign:"center",cursor:click?"pointer":"default"}}>
                <div style={{fontSize:"1.4rem",marginBottom:4}}>{icon}</div>
                <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.5rem",color:c}}>{v}</div>
                <div style={{fontSize:".65rem",textTransform:"uppercase",letterSpacing:"1px",color:"#94a3b8",marginTop:3}}>{l}</div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Pending MRs needing action */}
      {(()=>{
        const pending=mreqs.filter(m=>m.status==="Submitted").slice(0,6);
        if(!pending.length) return null;
        return(
          <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",overflow:"hidden",marginBottom:16}}>
            <div style={{background:"#f97316",padding:"12px 16px"}}>
              <span style={{fontWeight:700,color:"#fff",fontSize:".88rem"}}>🔧 Material Requests Waiting for Your Action ({pending.length})</span>
            </div>
            {pending.map((m,i)=>{
              const d=wonDeals.find(x=>x.id===m.dealId);
              return(
                <div key={m.id} onClick={()=>setPage("materialreq")} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 16px",borderBottom:i<pending.length-1?"1px solid #f8fafc":"",cursor:"pointer"}}
                  onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <div>
                    <div style={{fontWeight:600,color:"#0f172a",fontSize:".85rem"}}>{m.item}</div>
                    <div style={{fontSize:".72rem",color:"#94a3b8"}}>{d?.client||"?"} · Qty: {m.qty} {m.unit} · {m.urgency||"Normal"}</div>
                  </div>
                  <span style={{fontSize:".72rem",background:"#fff7ed",color:"#c2410c",border:"1px solid #fed7aa",borderRadius:20,padding:"2px 8px",fontWeight:600}}>Waiting</span>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Swatchboard items to source */}
      {(()=>{
        const toBuy=swatches.filter(s=>s.status==="To Buy").slice(0,5);
        if(!toBuy.length) return null;
        return(
          <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",overflow:"hidden",marginBottom:16}}>
            <div style={{background:"#06b6d4",padding:"12px 16px"}}>
              <span style={{fontWeight:700,color:"#fff",fontSize:".88rem"}}>🎨 Swatchboard — Items To Source ({toBuy.length})</span>
            </div>
            {toBuy.map((s,i)=>{
              const d=wonDeals.find(x=>x.id===s.dealId);
              return(
                <div key={s.id} onClick={()=>setPage("swatchboard")} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 16px",borderBottom:i<toBuy.length-1?"1px solid #f8fafc":"",cursor:"pointer"}}
                  onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <div>
                    <div style={{fontWeight:600,color:"#0f172a",fontSize:".85rem"}}>{s.name}</div>
                    <div style={{fontSize:".72rem",color:"#94a3b8"}}>{d?.client||"?"} · {s.qty} {s.unit} · {s.category}</div>
                  </div>
                  <span style={{fontSize:".72rem",background:"#ecfeff",color:"#0891b2",border:"1px solid #a5f3fc",borderRadius:20,padding:"2px 8px",fontWeight:600}}>To Buy</span>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Swatches received but not yet client-approved */}
      {(()=>{
        const pendingApproval=swatches.filter(s=>s.status==="Received").slice(0,5);
        if(!pendingApproval.length) return null;
        return(
          <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #fde68a",overflow:"hidden",marginBottom:16}}>
            <div style={{background:"#d97706",padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontWeight:700,color:"#fff",fontSize:".88rem"}}>⚠️ Swatches Received — Awaiting Client Approval ({pendingApproval.length})</span>
              <button onClick={()=>setPage("swatchboard")} style={{background:"rgba(255,255,255,.2)",border:"none",borderRadius:6,padding:"3px 10px",color:"#fff",fontSize:".72rem",cursor:"pointer",fontFamily:"inherit"}}>Open Swatchboard →</button>
            </div>
            {pendingApproval.map((s,i)=>{
              const d=wonDeals.find(x=>x.id===s.projectId||x.id===s.dealId);
              return(
                <div key={s.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 16px",borderBottom:i<pendingApproval.length-1?"1px solid #fef3c7":"",background:"#fff"}}>
                  <div>
                    <div style={{fontWeight:600,color:"#0f172a",fontSize:".85rem"}}>{s.name}</div>
                    <div style={{fontSize:".72rem",color:"#94a3b8"}}>{d?.client||"?"} · {s.category} · {s.qty} {s.unit}</div>
                  </div>
                  <span style={{fontSize:".72rem",background:"#fffbeb",color:"#d97706",border:"1px solid #fde68a",borderRadius:20,padding:"2px 8px",fontWeight:600}}>Needs sign-off</span>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Overdue deliveries */}
      {(()=>{
        const nowD=new Date();
        const overdue=prs.filter(p=>p.deliveryDate&&new Date(p.deliveryDate)<nowD&&!["Delivered","Cancelled"].includes(p.status)).slice(0,5);
        if(!overdue.length) return null;
        return(
          <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #fecaca",overflow:"hidden",marginBottom:16}}>
            <div style={{background:"#dc2626",padding:"12px 16px"}}>
              <span style={{fontWeight:700,color:"#fff",fontSize:".88rem"}}>🚨 Overdue Deliveries — Follow Up Now ({overdue.length})</span>
            </div>
            {overdue.map((pr,i)=>{
              const d=wonDeals.find(x=>x.id===pr.projectId);
              const daysLate=Math.ceil((nowD-new Date(pr.deliveryDate))/(1000*60*60*24));
              return(
                <div key={pr.id} onClick={()=>setPage("procurement")} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 16px",borderBottom:i<overdue.length-1?"1px solid #fee2e2":"",cursor:"pointer",background:"#fff"}}
                  onMouseEnter={e=>e.currentTarget.style.background="#fef2f2"}
                  onMouseLeave={e=>e.currentTarget.style.background="#fff"}>
                  <div>
                    <div style={{fontWeight:600,color:"#0f172a",fontSize:".85rem"}}>{pr.itemName}</div>
                    <div style={{fontSize:".72rem",color:"#94a3b8"}}>{d?.client||"?"} · {pr.supplier||"No supplier"} · Expected {pr.deliveryDate}</div>
                  </div>
                  <span style={{fontSize:".72rem",background:"#fef2f2",color:"#dc2626",border:"1px solid #fecaca",borderRadius:20,padding:"2px 9px",fontWeight:700,whiteSpace:"nowrap"}}>{daysLate}d late</span>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Expected deliveries this week */}
      {(()=>{
        const nowD=new Date();
        const weekEnd=new Date(nowD); weekEnd.setDate(nowD.getDate()+7);
        const thisWeek=prs.filter(p=>p.deliveryDate&&new Date(p.deliveryDate)>=nowD&&new Date(p.deliveryDate)<=weekEnd&&!["Delivered","Cancelled"].includes(p.status)).slice(0,5);
        if(!thisWeek.length) return null;
        return(
          <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",overflow:"hidden"}}>
            <div style={{background:"#059669",padding:"12px 16px"}}>
              <span style={{fontWeight:700,color:"#fff",fontSize:".88rem"}}>🚚 Expected Deliveries This Week ({thisWeek.length})</span>
            </div>
            {thisWeek.map((pr,i)=>{
              const d=wonDeals.find(x=>x.id===pr.projectId);
              const daysUntil=Math.ceil((new Date(pr.deliveryDate)-nowD)/(1000*60*60*24));
              return(
                <div key={pr.id} onClick={()=>setPage("procurement")} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 16px",borderBottom:i<thisWeek.length-1?"1px solid #f8fafc":"",cursor:"pointer"}}
                  onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <div>
                    <div style={{fontWeight:600,color:"#0f172a",fontSize:".85rem"}}>{pr.itemName}</div>
                    <div style={{fontSize:".72rem",color:"#94a3b8"}}>{d?.client||"?"} · {pr.supplier||"No supplier"} · {pr.deliveryDate}</div>
                  </div>
                  <span style={{fontSize:".72rem",background:"#f0fdf4",color:"#059669",border:"1px solid #6ee7b7",borderRadius:20,padding:"2px 9px",fontWeight:700,whiteSpace:"nowrap"}}>
                    {daysUntil===0?"Today":daysUntil===1?"Tomorrow":`in ${daysUntil}d`}
                  </span>
                </div>
              );
            })}
          </div>
        );
      })()}
    </Wrap>
  );

  // ── OPERATIONS HOME ───────────────────────────────────────────────────────
  if(role==="Operations") return(
    <Wrap>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
        <div>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:"1.6rem",color:"#0f172a"}}>Good {greeting}, {session?.name?.split(" ")[0]||"Team"} 👋</div>
          <div style={{color:"#64748b",fontSize:".85rem",marginTop:2}}>Operations · {todayL}</div>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <button onClick={()=>setPage("projects")} style={{background:"#f97316",border:"none",borderRadius:9,padding:"9px 18px",color:"#fff",fontFamily:"inherit",fontWeight:700,fontSize:".85rem",cursor:"pointer"}}>📋 My Projects</button>
          <button onClick={()=>setPage("materialreq")} style={{background:"#1e293b",border:"none",borderRadius:9,padding:"9px 18px",color:"#fff",fontFamily:"inherit",fontWeight:700,fontSize:".85rem",cursor:"pointer"}}>🔧 Material Request</button>
        </div>
      </div>

      {(()=>{
        const myName=session?.name||"";
        const firstWord=(myName||"").split(" ")[0]?.toLowerCase()||"";
        const myProjects=wonDeals.filter(d=>{
          const jo=jos.find(j=>j.dealId===d.id);
          return jo&&[jo.pm1,jo.pm2,jo.pm3,jo.coordinator].filter(Boolean).some(p=>p===myName||p.toLowerCase().includes(firstWord));
        });
        const display=myProjects.length>0?myProjects:wonDeals;
        const now=new Date();

        // At-risk & needs-update flags
        const needsUpdate=display.filter(d=>{
          const last=actLog.filter(e=>e.dealId===d.id&&e.action==="PM Update")[0];
          const daysSince=last?Math.ceil((now-new Date(last.date))/(1000*60*60*24)):999;
          return daysSince>=3;
        });
        const atRisk=display.filter(d=>{
          const pc=pcards[d.id];
          if(!pc?.targetEndDate) return false;
          const daysLeft=Math.ceil((new Date(pc.targetEndDate)-now)/(1000*60*60*24));
          return daysLeft<=7;
        });
        const myOpenTasks=checklist.filter(c2=>c2.status!=="Done"&&display.some(d=>d.id===c2.projectId));

        return(
          <div style={{display:"flex",flexDirection:"column",gap:14}}>

            {/* 🚨 Needs Update Now */}
            {needsUpdate.length>0&&(
              <div style={{background:"#fef2f2",border:"1.5px solid #fecaca",borderRadius:12,overflow:"hidden"}}>
                <div style={{background:"#dc2626",padding:"10px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontWeight:700,color:"#fff",fontSize:".88rem"}}>🚨 Needs Update Now — {needsUpdate.length} project{needsUpdate.length!==1?"s":""} silent for 3+ days</span>
                  <span style={{fontSize:".72rem",color:"rgba(255,255,255,.7)"}}>Log an update before your client asks</span>
                </div>
                {needsUpdate.map((d,i)=>{
                  const last=actLog.filter(e=>e.dealId===d.id&&e.action==="PM Update")[0];
                  const daysSince=last?Math.ceil((now-new Date(last.date))/(1000*60*60*24)):null;
                  return(
                    <div key={d.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 16px",borderBottom:i<needsUpdate.length-1?"1px solid #fee2e2":"",background:"#fff"}}>
                      <div>
                        <div style={{fontWeight:600,color:"#0f172a",fontSize:".85rem"}}>{d.client}</div>
                        <div style={{fontSize:".72rem",color:"#94a3b8"}}>{daysSince===null?"Never updated":daysSince+"d since last update"} · {d.product}</div>
                      </div>
                      <button onClick={()=>setPmUpdateModal({dealId:d.id,dealName:d.client})}
                        style={{background:"#dc2626",border:"none",borderRadius:8,padding:"7px 16px",color:"#fff",fontFamily:"inherit",fontWeight:700,fontSize:".78rem",cursor:"pointer",whiteSpace:"nowrap"}}>
                        📝 Log Now
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ⏰ At Risk This Week */}
            {atRisk.length>0&&(
              <div style={{background:"#fffbeb",border:"1.5px solid #fde68a",borderRadius:12,overflow:"hidden"}}>
                <div style={{background:"#d97706",padding:"10px 16px"}}>
                  <span style={{fontWeight:700,color:"#fff",fontSize:".88rem"}}>⏰ At Risk — {atRisk.length} project{atRisk.length!==1?"s":""} finishing within 7 days or overdue</span>
                </div>
                {atRisk.map((d,i)=>{
                  const pc=pcards[d.id];
                  const daysLeft=pc?.targetEndDate?Math.ceil((new Date(pc.targetEndDate)-now)/(1000*60*60*24)):null;
                  return(
                    <div key={d.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 16px",borderBottom:i<atRisk.length-1?"1px solid #fef3c7":"",background:"#fff"}}>
                      <div>
                        <div style={{fontWeight:600,color:"#0f172a",fontSize:".85rem"}}>{d.client}</div>
                        <div style={{fontSize:".72rem",color:"#94a3b8"}}>Target: {pc?.targetEndDate||"—"}</div>
                      </div>
                      <span style={{fontSize:".78rem",fontWeight:700,color:daysLeft!==null&&daysLeft<0?"#dc2626":"#d97706",background:daysLeft!==null&&daysLeft<0?"#fef2f2":"#fffbeb",border:"1px solid currentColor",borderRadius:20,padding:"3px 10px",whiteSpace:"nowrap"}}>
                        {daysLeft===null?"No TAT set":daysLeft<0?`${Math.abs(daysLeft)}d OVERDUE`:`${daysLeft}d left`}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* My Active Projects */}
            <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",overflow:"hidden"}}>
              <div style={{background:"#1e293b",padding:"12px 16px",display:"flex",justifyContent:"space-between"}}>
                <span style={{fontWeight:700,color:"#f59e0b",fontSize:".88rem"}}>🏗 My Active Projects</span>
                <span style={{fontSize:".72rem",color:"rgba(255,255,255,.5)"}}>{display.length} projects · <span style={{cursor:"pointer",textDecoration:"underline",color:"rgba(255,255,255,.6)"}} onClick={()=>setPage("projects")}>See all →</span></span>
              </div>
              {display.length===0&&<div style={{padding:"20px",textAlign:"center",color:"#94a3b8",fontSize:".82rem"}}>No active projects assigned to you.</div>}
              {display.slice(0,8).map((d,i)=>{
                const pc=pcards[d.id];
                const jo=jos.find(j=>j.dealId===d.id);
                const depsTotal=Object.values(pc?.departments||{}).length||6;
                const depsDone=Object.values(pc?.departments||{}).filter(dept=>dept.done).length;
                const pct=Math.round(depsDone/depsTotal*100);
                const daysLeft=pc?.targetEndDate?Math.ceil((new Date(pc.targetEndDate)-now)/(1000*60*60*24)):null;
                const isOver=daysLeft!==null&&daysLeft<0;
                const lastUpd=actLog.filter(e=>e.dealId===d.id&&e.action==="PM Update")[0];
                const daysSince=lastUpd?Math.ceil((now-new Date(lastUpd.date))/(1000*60*60*24)):null;
                return(
                  <div key={d.id} style={{padding:"12px 16px",borderBottom:i<display.length-1?"1px solid #f8fafc":""}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:700,color:"#0f172a",fontSize:".9rem",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.client}</div>
                        <div style={{fontSize:".72rem",color:"#94a3b8",marginTop:1}}>
                          PM: {jo?.pm1||"—"} · {pct}% complete
                          {daysSince!==null&&<span style={{marginLeft:8,color:daysSince>=3?"#dc2626":"#94a3b8"}}>{daysSince===0?"Updated today":daysSince===1?"Updated yesterday":`Last update ${daysSince}d ago`}</span>}
                        </div>
                        <div style={{height:3,background:"#f1f5f9",borderRadius:2,marginTop:6,width:"100%",maxWidth:200}}>
                          <div style={{height:"100%",width:pct+"%",background:pct===100?"#059669":isOver?"#dc2626":"#3b82f6",borderRadius:2}}/>
                        </div>
                      </div>
                      <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
                        {daysLeft!==null&&(
                          <span style={{fontSize:".7rem",fontWeight:700,color:isOver?"#dc2626":daysLeft<=7?"#d97706":"#059669",background:isOver?"#fef2f2":daysLeft<=7?"#fffbeb":"#f0fdf4",border:`1px solid ${isOver?"#fecaca":daysLeft<=7?"#fde68a":"#6ee7b7"}`,borderRadius:20,padding:"2px 8px",whiteSpace:"nowrap"}}>
                            {isOver?`${Math.abs(daysLeft)}d over`:`${daysLeft}d left`}
                          </span>
                        )}
                        <button onClick={e=>{e.stopPropagation();setPmUpdateModal({dealId:d.id,dealName:d.client});}}
                          style={{background:"#0ea5e9",border:"none",borderRadius:7,padding:"5px 12px",color:"#fff",fontFamily:"inherit",fontWeight:700,fontSize:".72rem",cursor:"pointer",whiteSpace:"nowrap"}}>
                          📝 Update
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Quick action tiles */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
              {[
                {l:"Pending MRs",     v:mreqs.filter(m=>m.status==="Submitted").length,                                      icon:"🔧", page:"materialreq", c:"#f97316"},
                {l:"Budget Requests", v:breqs.filter(b=>b.status==="Pending").length,                                        icon:"💳", page:"budgetreq",   c:"#8b5cf6"},
                {l:"Open Tasks",      v:myOpenTasks.length,                                                                   icon:"✅", page:"checklist",   c:"#3b82f6"},
              ].map(({l,v,icon,page:pg,c})=>(
                <div key={l} onClick={()=>setPage(pg)} style={{background:"#fff",borderRadius:10,padding:"14px",border:`1.5px solid ${c}22`,textAlign:"center",cursor:"pointer"}}>
                  <div style={{fontSize:"1.2rem"}}>{icon}</div>
                  <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.3rem",color:c,marginTop:4}}>{v}</div>
                  <div style={{fontSize:".65rem",textTransform:"uppercase",letterSpacing:"1px",color:"#94a3b8",marginTop:2}}>{l}</div>
                </div>
              ))}
            </div>

            {/* My open checklist tasks */}
            {myOpenTasks.length>0&&(
              <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",overflow:"hidden"}}>
                <div style={{background:"#3b82f6",padding:"10px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontWeight:700,color:"#fff",fontSize:".88rem"}}>✅ My Open Tasks ({myOpenTasks.length})</span>
                  <button onClick={()=>setPage("checklist")} style={{background:"rgba(255,255,255,.2)",border:"none",borderRadius:6,padding:"3px 10px",color:"#fff",fontSize:".72rem",cursor:"pointer",fontFamily:"inherit"}}>See all →</button>
                </div>
                {myOpenTasks.slice(0,5).map((t,i)=>{
                  const d=wonDeals.find(x=>x.id===t.projectId);
                  return(
                    <div key={t.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 16px",borderBottom:i<Math.min(myOpenTasks.length,5)-1?"1px solid #f8fafc":""}}>
                      <div>
                        <div style={{fontWeight:600,color:"#0f172a",fontSize:".82rem"}}>{t.title}</div>
                        <div style={{fontSize:".7rem",color:"#94a3b8"}}>{d?.client||"General"} · {t.dept}</div>
                      </div>
                      <span style={{fontSize:".68rem",background:PRI_CLR[t.priority]+"18",color:PRI_CLR[t.priority],border:`1px solid ${PRI_CLR[t.priority]}44`,borderRadius:20,padding:"1px 8px",fontWeight:600}}>{t.priority||"Normal"}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {myProjects.length>0&&(
              <div style={{background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:8,padding:"8px 14px",fontSize:".8rem",color:"#c2410c",fontWeight:600}}>
                📍 Showing your {myProjects.length} assigned project{myProjects.length!==1?"s":""} · <span style={{cursor:"pointer",textDecoration:"underline"}} onClick={()=>setPage("projects")}>See all projects →</span>
              </div>
            )}

          </div>
        );
      })()}
    </Wrap>
  );

  // ── DESIGN HOME ───────────────────────────────────────────────────────────
  if(role==="Design") return(
    <Wrap>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
        <div>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:"1.6rem",color:"#0f172a"}}>Good {greeting}, {session?.name?.split(" ")[0]||"Team"} 👋</div>
          <div style={{color:"#64748b",fontSize:".85rem",marginTop:2}}>Design Dashboard · {todayL}</div>
        </div>
        <button onClick={()=>setPage("projects")} style={{background:"#ec4899",border:"none",borderRadius:9,padding:"9px 18px",color:"#fff",fontFamily:"inherit",fontWeight:700,fontSize:".85rem",cursor:"pointer"}}>📋 Project Cards</button>
      </div>

      {(()=>{
        const now=new Date();
        const inQueue=wonDeals.filter(d=>pcards[d.id]&&!pcards[d.id]?.departments?.Design?.done)
          .sort((a,b)=>new Date(pcards[a.id]?.awardDate||0)-new Date(pcards[b.id]?.awardDate||0));
        const done=wonDeals.filter(d=>pcards[d.id]?.departments?.Design?.done);

        // Stuck in Revision: design status === "Revision" for 5+ days
        const stuckInRevision=inQueue.filter(d=>{
          const p=projs[d.id];
          if(p?.design?.status!=="Revision") return false;
          const hist=p.design?.statusHistory||[];
          const revEntry=[...hist].reverse().find(h=>h.status==="Revision");
          if(!revEntry) return true;
          return Math.floor((now-new Date(revEntry.date))/(1000*60*60*24))>=5;
        });

        // Missing handoff: Production Plans status but no file link
        const needsHandoff=inQueue.filter(d=>{
          const p=projs[d.id];
          return p?.design?.status==="Production Plans"&&!p?.design?.link;
        });

        return(
          <div style={{display:"flex",flexDirection:"column",gap:14}}>

            {/* KPI strip */}
            {drfs.filter(d=>d.status==="New").length>0&&(
              <div style={{background:"#fef2f2",border:"1.5px solid #fecaca",borderRadius:12,padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontWeight:700,color:"#dc2626",fontSize:".9rem"}}>🔔 {drfs.filter(d=>d.status==="New").length} new Design Request Form{drfs.filter(d=>d.status==="New").length!==1?"s":""} waiting</div>
                  <div style={{fontSize:".75rem",color:"#94a3b8",marginTop:2}}>Acknowledge to accept the brief</div>
                </div>
                <button onClick={()=>setPage("drf")} style={{background:"#ec4899",border:"none",borderRadius:8,padding:"8px 16px",color:"#fff",fontFamily:"inherit",fontWeight:700,fontSize:".78rem",cursor:"pointer"}}>View DRFs →</button>
              </div>
            )}
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12}}>
              {[
                {l:"New DRFs",          v:drfs.filter(d=>d.status==="New").length, c:"#dc2626", icon:"🔔", pg:"drf"},
                {l:"In Your Queue",     v:inQueue.length,            c:"#ec4899", icon:"📐"},
                {l:"Stuck in Revision", v:stuckInRevision.length,    c:"#dc2626", icon:"🔴"},
                {l:"Needs Handoff",     v:needsHandoff.length,       c:"#d97706", icon:"📤"},
                {l:"Design Done",       v:done.length,               c:"#059669", icon:"✅"},
              ].map(({l,v,c,icon,pg})=>(
                <div key={l} onClick={pg?()=>setPage(pg):undefined} style={{background:"#fff",borderRadius:12,padding:"14px",border:`1.5px solid ${c}33`,textAlign:"center",cursor:pg?"pointer":"default"}}>
                  <div style={{fontSize:"1.2rem",marginBottom:4}}>{icon}</div>
                  <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.4rem",color:c}}>{v}</div>
                  <div style={{fontSize:".63rem",textTransform:"uppercase",letterSpacing:"1px",color:"#94a3b8",marginTop:3}}>{l}</div>
                </div>
              ))}
            </div>

            {/* Stuck in Revision alert */}
            {stuckInRevision.length>0&&(
              <div style={{background:"#fef2f2",border:"1.5px solid #fecaca",borderRadius:12,overflow:"hidden"}}>
                <div style={{background:"#dc2626",padding:"10px 16px"}}>
                  <span style={{fontWeight:700,color:"#fff",fontSize:".88rem"}}>🔴 Stuck in Revision — {stuckInRevision.length} project{stuckInRevision.length!==1?"s":""} waiting 5+ days for client feedback</span>
                </div>
                {stuckInRevision.map((d,i)=>{
                  const p=projs[d.id];
                  const hist=p?.design?.statusHistory||[];
                  const revEntry=[...hist].reverse().find(h=>h.status==="Revision");
                  const days=revEntry?Math.floor((now-new Date(revEntry.date))/(1000*60*60*24)):null;
                  const jo=jos.find(j=>j.dealId===d.id);
                  return(
                    <div key={d.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 16px",borderBottom:i<stuckInRevision.length-1?"1px solid #fee2e2":"",background:"#fff"}}>
                      <div>
                        <div style={{fontWeight:600,color:"#0f172a",fontSize:".85rem"}}>{d.client}</div>
                        <div style={{fontSize:".72rem",color:"#94a3b8"}}>AE: {jo?.ae_assigned||d.contact||"—"} · {days!==null?days+"d in revision":"In revision"}</div>
                      </div>
                      <span style={{fontSize:".72rem",background:"#fef2f2",color:"#dc2626",border:"1px solid #fecaca",borderRadius:20,padding:"2px 9px",fontWeight:700,whiteSpace:"nowrap"}}>Chase AE</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Missing file handoff */}
            {needsHandoff.length>0&&(
              <div style={{background:"#fffbeb",border:"1.5px solid #fde68a",borderRadius:12,overflow:"hidden"}}>
                <div style={{background:"#d97706",padding:"10px 16px"}}>
                  <span style={{fontWeight:700,color:"#fff",fontSize:".88rem"}}>📤 Ready to Hand Off — Add file link before marking Done ({needsHandoff.length})</span>
                </div>
                {needsHandoff.map((d,i)=>{
                  const p=projs[d.id];
                  return(
                    <div key={d.id} onClick={()=>setPage("projects")} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 16px",borderBottom:i<needsHandoff.length-1?"1px solid #fef3c7":"",background:"#fff",cursor:"pointer"}}>
                      <div>
                        <div style={{fontWeight:600,color:"#0f172a",fontSize:".85rem"}}>{d.client}</div>
                        <div style={{fontSize:".72rem",color:"#94a3b8"}}>Status: {p?.design?.status} · No file link yet · Rev: {p?.design?.revisionNo||"not set"}</div>
                      </div>
                      <span style={{fontSize:".72rem",background:"#fffbeb",color:"#d97706",border:"1px solid #fde68a",borderRadius:20,padding:"2px 9px",fontWeight:700,whiteSpace:"nowrap"}}>Add link →</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Full queue */}
            {inQueue.length===0
              ? <div style={{background:"#f0fdf4",border:"1.5px solid #6ee7b7",borderRadius:12,padding:"24px",textAlign:"center"}}>
                  <div style={{fontSize:"2rem",marginBottom:8}}>🎉</div>
                  <div style={{fontWeight:700,color:"#059669",fontSize:"1rem"}}>All caught up! No projects in your design queue.</div>
                </div>
              : <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",overflow:"hidden"}}>
                  <div style={{background:"#be185d",padding:"12px 16px",display:"flex",justifyContent:"space-between"}}>
                    <span style={{fontWeight:700,color:"#fff",fontSize:".88rem"}}>📐 Full Design Queue — {inQueue.length} projects</span>
                    <span style={{fontSize:".72rem",color:"rgba(255,255,255,.6)"}}>Oldest first</span>
                  </div>
                  {inQueue.slice(0,8).map((d,i)=>{
                    const pc=pcards[d.id];
                    const p=projs[d.id];
                    const tasks=pc?.departments?.Design?.tasks||[];
                    const doneTasks=tasks.filter(t=>t.done).length;
                    const totalTasks=tasks.length||10;
                    const pct=Math.round(doneTasks/totalTasks*100);
                    const waitDays=pc?.awardDate?Math.floor((now-new Date(pc.awardDate))/(1000*60*60*24)):null;
                    const ds=p?.design?.status||"Briefing";
                    const isStuck=stuckInRevision.some(x=>x.id===d.id);
                    const isHandoff=needsHandoff.some(x=>x.id===d.id);
                    return(
                      <div key={d.id} onClick={()=>setPage("projects")} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"11px 16px",borderBottom:i<inQueue.length-1?"1px solid #f8fafc":"",cursor:"pointer",background:isStuck?"#fef2f2":isHandoff?"#fffbeb":"#fff"}}
                        onMouseEnter={e=>e.currentTarget.style.opacity="0.85"}
                        onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontWeight:600,color:"#0f172a",fontSize:".85rem",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.client}</div>
                          <div style={{fontSize:".72rem",color:"#94a3b8",marginTop:1,display:"flex",gap:8,alignItems:"center"}}>
                            <span style={{background:DS_CLR[ds]+"18",color:DS_CLR[ds],fontWeight:700,padding:"1px 7px",borderRadius:20,fontSize:".68rem"}}>{ds}</span>
                            <span>{doneTasks}/{totalTasks} tasks</span>
                            {p?.design?.revisionNo&&<span style={{color:"#8b5cf6"}}>Rev: {p.design.revisionNo}</span>}
                          </div>
                          <div style={{height:3,background:"#f1f5f9",borderRadius:2,marginTop:5,width:120}}>
                            <div style={{height:"100%",width:pct+"%",background:"#ec4899",borderRadius:2}}/>
                          </div>
                        </div>
                        {waitDays!==null&&(
                          <span style={{marginLeft:12,fontSize:".72rem",fontWeight:700,color:waitDays>14?"#dc2626":waitDays>7?"#f59e0b":"#64748b",background:waitDays>14?"#fef2f2":waitDays>7?"#fffbeb":"#f8fafc",border:"1px solid #e2e8f0",borderRadius:20,padding:"3px 9px",whiteSpace:"nowrap"}}>
                            {waitDays===0?"Today":waitDays+"d waiting"}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
            }
          </div>
        );
      })()}
    </Wrap>
  );


  // ── PROJECT MOVER HOME ───────────────────────────────────────────────────
  if(role==="ProjectMover") return(
    <Wrap>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
        <div>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:"1.6rem",color:"#0f172a"}}>Good {greeting}, {session?.name?.split(" ")[0]||"PM"} 👷</div>
          <div style={{color:"#64748b",fontSize:".85rem",marginTop:2}}>Project Mover · {todayL}</div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>setPage("pmupdates")} style={{background:"#0ea5e9",border:"none",borderRadius:9,padding:"9px 18px",color:"#fff",fontFamily:"inherit",fontWeight:700,fontSize:".85rem",cursor:"pointer"}}>📝 Log Update</button>
          <button onClick={()=>setPage("addenda")} style={{background:"#dc2626",border:"none",borderRadius:9,padding:"9px 18px",color:"#fff",fontFamily:"inherit",fontWeight:700,fontSize:".85rem",cursor:"pointer"}}>⚠️ Flag Scope Change</button>
        </div>
      </div>

      {(()=>{
        const myName=session?.name||"";
        const myProjects=wonDeals.filter(d=>{
          const jo=jos.find(j=>j.dealId===d.id);
          return jo&&[jo.pm1,jo.pm2,jo.pm3,jo.coordinator].filter(Boolean).some(p=>
            p===myName||p.toLowerCase().includes((myName||"").split(" ")[0]?.toLowerCase()||""));
        });
        const otherProjects=wonDeals.filter(d=>!myProjects.find(m=>m.id===d.id));
        const today2=new Date();

        return(
          <div style={{display:"flex",flexDirection:"column",gap:20}}>
            {/* KPIs */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
              {[
                {l:"My Projects",    v:myProjects.length,  c:"#0ea5e9", icon:"🏗"},
                {l:"All Active",     v:wonDeals.length,    c:"#0f172a", icon:"📋"},
                {l:"My Updates Today",v:actLog.filter(a=>a.action==="PM Update"&&a.date===today&&myProjects.find(d=>d.id===a.dealId)).length, c:"#059669", icon:"✅"},
                {l:"Scope Changes",  v:addenda.filter(a=>a.discoveredBy===myName).length, c:"#ef4444", icon:"⚠️"},
              ].map(({l,v,c,icon})=>(
                <div key={l} style={{background:"#fff",borderRadius:12,padding:"16px",border:`1.5px solid ${c==="0f172a"?"#e2e8f0":c+"33"}`,textAlign:"center"}}>
                  <div style={{fontSize:"1.3rem",marginBottom:4}}>{icon}</div>
                  <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.5rem",color:"#"+c.replace("#","")}}>{v}</div>
                  <div style={{fontSize:".63rem",textTransform:"uppercase",letterSpacing:"1px",color:"#94a3b8",marginTop:3}}>{l}</div>
                </div>
              ))}
            </div>

            {/* My assigned projects */}
            <div style={{background:"#fff",borderRadius:14,border:"1.5px solid #e2e8f0",overflow:"hidden"}}>
              <div style={{background:"#0ea5e9",padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontWeight:700,color:"#fff",fontSize:".9rem"}}>🏗 My Assigned Projects ({myProjects.length})</span>
                <span style={{fontSize:".72rem",color:"rgba(255,255,255,.6)"}}>Sorted by urgency</span>
              </div>
              {myProjects.length===0
                ? <div style={{padding:"24px",textAlign:"center",color:"#94a3b8",fontSize:".82rem"}}>
                    No projects assigned to you yet.<br/>Contact Arrius or Paulo to get added as PM on a Job Order.
                  </div>
                : myProjects
                    .sort((a,b)=>{
                      const da=pcards[a.id]?.targetEndDate?Math.ceil((new Date(pcards[a.id].targetEndDate)-today2)/(1000*60*60*24)):999;
                      const db=pcards[b.id]?.targetEndDate?Math.ceil((new Date(pcards[b.id].targetEndDate)-today2)/(1000*60*60*24)):999;
                      return da-db;
                    })
                    .map((d,i)=>{
                      const jo=jos.find(j=>j.dealId===d.id);
                      const pc=pcards[d.id];
                      const pct=pc?Math.round(Object.values(pc.departments||{}).filter(dept=>dept.done).length/6*100):0;
                      const daysLeft=pc?.targetEndDate?Math.ceil((new Date(pc.targetEndDate)-today2)/(1000*60*60*24)):null;
                      const isOver=daysLeft!==null&&daysLeft<0;
                      const myUpdates=actLog.filter(a=>a.dealId===d.id&&a.action==="PM Update");
                      const lastUpdate=myUpdates[0];
                      return(
                        <div key={d.id} style={{padding:"12px 16px",borderBottom:i<myProjects.length-1?"1px solid #f8fafc":""}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{fontWeight:700,color:"#0f172a",fontSize:".9rem"}}>{d.client}</div>
                              <div style={{fontSize:".72rem",color:"#64748b",marginTop:1}}>{d.ceNo} · {d.contact||""}</div>
                              <div style={{fontSize:".72rem",color:"#94a3b8",marginTop:1}}>
                                PM: {[jo?.pm1,jo?.pm2,jo?.pm3].filter(Boolean).join(", ")||"—"} · Coord: {jo?.coordinator||"—"}
                              </div>
                              {lastUpdate&&(
                                <div style={{fontSize:".72rem",color:"#0ea5e9",marginTop:3,fontStyle:"italic"}}>
                                  Last update ({lastUpdate.date}): {lastUpdate.detail?.slice(0,60)}{lastUpdate.detail?.length>60?"…":""}
                                </div>
                              )}
                            </div>
                            <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                                <span style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.1rem",color:pct===100?"#059669":"#3b82f6"}}>{pct}%</span>
                                {daysLeft!==null&&(
                                  <span style={{fontSize:".7rem",fontWeight:700,color:isOver?"#dc2626":daysLeft<=7?"#f59e0b":"#059669",background:isOver?"#fef2f2":daysLeft<=7?"#fffbeb":"#f0fdf4",border:"1px solid",borderColor:isOver?"#fecaca":daysLeft<=7?"#fde68a":"#6ee7b7",borderRadius:20,padding:"2px 8px",whiteSpace:"nowrap"}}>
                                    {isOver?`${Math.abs(daysLeft)}d OVER`:`${daysLeft}d left`}
                                  </span>
                                )}
                              </div>
                              <button onClick={()=>setPmUpdateModal({dealId:d.id,dealName:d.client,ceNo:d.ceNo,ae:jo?.aeAssigned||d.salesOwner})}
                                style={{background:"#0ea5e9",border:"none",borderRadius:7,padding:"5px 12px",color:"#fff",fontFamily:"inherit",fontWeight:700,fontSize:".75rem",cursor:"pointer"}}>
                                + Update
                              </button>
                            </div>
                          </div>
                          <div style={{height:4,background:"#f1f5f9",borderRadius:2,marginTop:8}}>
                            <div style={{height:"100%",width:pct+"%",background:pct===100?"#059669":"#0ea5e9",borderRadius:2,transition:"width .4s"}}/>
                          </div>
                        </div>
                      );
                    })
              }
            </div>

            {/* Other projects — read-only */}
            {otherProjects.length>0&&(
              <div style={{background:"#fff",borderRadius:14,border:"1.5px solid #e2e8f0",overflow:"hidden"}}>
                <div style={{background:"#475569",padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontWeight:700,color:"#fff",fontSize:".9rem"}}>📋 All Other Active Projects ({otherProjects.length})</span>
                  <span style={{fontSize:".72rem",color:"rgba(255,255,255,.5)"}}>Read-only</span>
                </div>
                {otherProjects.slice(0,5).map((d,i)=>{
                  const jo=jos.find(j=>j.dealId===d.id);
                  const pc=pcards[d.id];
                  const pct=pc?Math.round(Object.values(pc.departments||{}).filter(dept=>dept.done).length/6*100):0;
                  return(
                    <div key={d.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 16px",borderBottom:i<4?"1px solid #f8fafc":""}}>
                      <div>
                        <div style={{fontWeight:600,color:"#475569",fontSize:".85rem"}}>{d.client}</div>
                        <div style={{fontSize:".72rem",color:"#94a3b8"}}>{d.ceNo} · PM: {jo?.pm1||"—"}</div>
                      </div>
                      <span style={{fontSize:".8rem",fontWeight:700,color:"#94a3b8"}}>{pct}%</span>
                    </div>
                  );
                })}
                {otherProjects.length>5&&<div style={{padding:"8px 16px",fontSize:".75rem",color:"#94a3b8",borderTop:"1px solid #f8fafc"}}>+{otherProjects.length-5} more projects</div>}
              </div>
            )}
          </div>
        );
      })()}

      {/* PM Update Modal (also accessible from home) */}
      {pmUpdateModal&&<PmUpdateModal pmUpdateModal={pmUpdateModal} setPmUpdateModal={setPmUpdateModal} session={session} logActivity={logActivity}/>}
    </Wrap>
  );

  // ── OWNER DASHBOARDS — customized by title ─────────────────────────────────
  const ownerTitle = session?.title || role;

  // ─── MAR MUNGCAL — COO ──────────────────────────────────────────────────────
  if(ownerTitle === "COO") return(
    <Wrap>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
        <div>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:"1.6rem",color:"#0f172a"}}>Good {greeting}, Mar 👋</div>
          <div style={{fontSize:".82rem",color:"#64748b",marginTop:2}}>COO Dashboard · {todayL}</div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>setPage("finance")} style={{background:"#3b82f6",border:"none",borderRadius:9,padding:"9px 18px",color:"#fff",fontFamily:"inherit",fontWeight:700,fontSize:".84rem",cursor:"pointer"}}>💰 Cash Position</button>
          <button onClick={()=>setPage("billing")} style={{background:"#1e293b",border:"none",borderRadius:9,padding:"9px 18px",color:"#fff",fontFamily:"inherit",fontWeight:700,fontSize:".84rem",cursor:"pointer"}}>🧾 Billing</button>
        </div>
      </div>

      {(()=>{
        const allMs = billings;
        const totalBilled   = allMs.reduce((s,m)=>s+Number(m.amount||0),0);
        const totalPaid     = allMs.reduce((s,m)=>s+(m.payments||[]).reduce((ps,p)=>ps+Number(p.amount||0),0),0);
        const outstanding   = totalBilled - totalPaid;
        const today2        = new Date();
        const overdue       = allMs.filter(m=>m.dueDate&&new Date(m.dueDate)<today2&&m.status!=="Fully Paid");
        const overdueValue  = overdue.reduce((s,m)=>{const p=(m.payments||[]).reduce((ps,py)=>ps+Number(py.amount||0),0);return s+Math.max(0,Number(m.amount||0)-p);},0);
        const latestCash    = Object.values(cashPositions).sort((a,b)=>new Date(b.date)-new Date(a.date))[0];
        const totalCash     = latestCash?["bpi","metrobank","chinabank","bdo","secbank","unionbank"].reduce((s,b)=>s+Number(latestCash[b+"_end"]||latestCash[b+"End"]||0),0):0;
        const noBilling     = wonDeals.filter(d=>!billings.find(b=>b.dealId===d.id));
        const collRate      = totalBilled>0?Math.round(totalPaid/totalBilled*100):0;
        const totalPipeVal  = deals.filter(d=>d.stage!=="Cancelled").reduce((s,d)=>s+Number(d.value||0),0);

        return(<div style={{display:"flex",flexDirection:"column",gap:16}}>
          {/* KPI Row 1 — Financial health */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
            {[
              {l:"Total Cash (6 banks)",   v:"₱"+Math.round(totalCash/1000)+"K",        c:"#059669",  icon:"🏦", sub:latestCash?"As of "+latestCash.date:"No entry yet"},
              {l:"Total Collected YTD",    v:"₱"+Math.round(totalPaid/1000)+"K",         c:"#3b82f6",  icon:"✅", sub:"Collection rate: "+collRate+"%"},
              {l:"Outstanding",            v:"₱"+Math.round(outstanding/1000)+"K",       c:"#f59e0b",  icon:"⏰", sub:overdue.length+" invoices overdue"},
              {l:"Overdue Value",          v:"₱"+Math.round(overdueValue/1000)+"K",      c:"#ef4444",  icon:"🚨", sub:"Needs immediate follow-up", click:()=>setPage("billing")},
            ].map(({l,v,c,icon,sub,click})=>(
              <div key={l} onClick={click} style={{background:"#fff",borderRadius:12,padding:"16px",border:`1.5px solid ${c}33`,cursor:click?"pointer":"default",textAlign:"center"}}>
                <div style={{fontSize:"1.3rem",marginBottom:4}}>{icon}</div>
                <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.4rem",color:c}}>{v}</div>
                <div style={{fontSize:".62rem",textTransform:"uppercase",letterSpacing:"1px",color:"#94a3b8",marginTop:2}}>{l}</div>
                {sub&&<div style={{fontSize:".7rem",color:"#64748b",marginTop:3}}>{sub}</div>}
              </div>
            ))}
          </div>

          {/* KPI Row 2 — Pipeline */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
            {[
              {l:"Pipeline Value",      v:"₱"+Math.round(totalPipeVal/1000000)+"M", c:"#8b5cf6", icon:"📊"},
              {l:"Awarded Projects",    v:wonDeals.length,                           c:"#0f172a",  icon:"🏆"},
              {l:"No Billing Setup",    v:noBilling.length,                          c:"#f59e0b",  icon:"⚠️", click:()=>setPage("billing")},
              {l:"Projects Complete",   v:wonDeals.filter(d=>Object.values(pcards[d.id]?.departments||{}).every(dept=>dept.done)).length, c:"#059669", icon:"🎉"},
            ].map(({l,v,c,icon,click})=>(
              <div key={l} onClick={click} style={{background:"#fff",borderRadius:12,padding:"14px",border:`1.5px solid ${c==="0f172a"?"#e2e8f0":c+"33"}`,cursor:click?"pointer":"default",textAlign:"center"}}>
                <div style={{fontSize:"1.2rem",marginBottom:3}}>{icon}</div>
                <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.3rem",color:"#"+c.replace("#","")}}>{v}</div>
                <div style={{fontSize:".62rem",textTransform:"uppercase",letterSpacing:"1px",color:"#94a3b8",marginTop:2}}>{l}</div>
              </div>
            ))}
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
            {/* Overdue invoices */}
            <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",overflow:"hidden"}}>
              <div style={{background:"#dc2626",padding:"11px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontWeight:700,color:"#fff",fontSize:".88rem"}}>🚨 Overdue Invoices ({overdue.length})</span>
                <button onClick={()=>setPage("billing")} style={{background:"rgba(255,255,255,.2)",border:"none",borderRadius:6,padding:"3px 10px",color:"#fff",fontSize:".72rem",cursor:"pointer",fontFamily:"inherit"}}>View all →</button>
              </div>
              {overdue.length===0
                ?<div style={{padding:"16px",textAlign:"center",color:"#94a3b8",fontSize:".82rem"}}>✅ No overdue invoices</div>
                :overdue.sort((a,b)=>new Date(a.dueDate)-new Date(b.dueDate)).slice(0,5).map((m,i)=>{
                  const d=wonDeals.find(x=>x.id===m.dealId);
                  const paid=(m.payments||[]).reduce((s,p)=>s+Number(p.amount||0),0);
                  const bal=Number(m.amount||0)-paid;
                  const days=Math.floor((today2-new Date(m.dueDate))/(1000*60*60*24));
                  return(<div key={m.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 14px",borderBottom:i<4?"1px solid #f8fafc":"",flexWrap:"wrap",gap:4}}>
                    <div>
                      <div style={{fontWeight:600,color:"#0f172a",fontSize:".82rem"}}>{d?.client||"?"}</div>
                      <div style={{fontSize:".68rem",color:"#94a3b8"}}>{m.invoiceNo} · {days}d overdue</div>
                    </div>
                    <div style={{fontWeight:700,color:"#dc2626",fontSize:".82rem"}}>₱{Math.round(bal).toLocaleString()}</div>
                  </div>);
                })
              }
            </div>

            {/* Cash position by bank */}
            <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",overflow:"hidden"}}>
              <div style={{background:"#1e293b",padding:"11px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontWeight:700,color:"#f59e0b",fontSize:".88rem"}}>🏦 Cash Position {latestCash?"("+latestCash.date+")":""}</span>
                <button onClick={()=>setPage("finance")} style={{background:"rgba(255,255,255,.1)",border:"none",borderRadius:6,padding:"3px 10px",color:"#fff",fontSize:".72rem",cursor:"pointer",fontFamily:"inherit"}}>Update →</button>
              </div>
              {!latestCash
                ?<div style={{padding:"16px",textAlign:"center",color:"#94a3b8",fontSize:".82rem"}}>No cash position entered yet. Aerwin needs to update daily.</div>
                :[["BPI","bpi"],["Metrobank","metrobank"],["Chinabank","chinabank"],["BDO","bdo"],["Security Bank","secbank"],["Unionbank","unionbank"]].map(([label,key],i)=>{
                  const val=Number(latestCash[key+"_end"]||latestCash[key+"End"]||0);
                  return(<div key={key} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 14px",borderBottom:i<5?"1px solid #f8fafc":""}}>
                    <span style={{fontSize:".82rem",color:"#475569",fontWeight:500}}>{label}</span>
                    <span style={{fontWeight:700,color:val>0?"#059669":"#94a3b8",fontSize:".82rem"}}>₱{val.toLocaleString("en-PH",{minimumFractionDigits:0})}</span>
                  </div>);
                })
              }
            </div>
          </div>

          {/* Recent activity */}
          <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",overflow:"hidden"}}>
            <div style={{background:"#475569",padding:"11px 16px"}}><span style={{fontWeight:700,color:"#fff",fontSize:".88rem"}}>📋 Recent Activity</span></div>
            {actLog.slice(0,6).map((a,i)=>{
              const d=wonDeals.find(x=>x.id===a.dealId);
              return(<div key={i} style={{display:"flex",gap:12,alignItems:"flex-start",padding:"9px 14px",borderBottom:i<5?"1px solid #f8fafc":""}}>
                <span style={{fontSize:".72rem",color:"#94a3b8",whiteSpace:"nowrap",marginTop:1}}>{a.date}</span>
                <div style={{fontSize:".82rem",color:"#475569"}}><strong style={{color:"#0f172a"}}>{a.action}</strong>{a.detail?" — "+a.detail:""}{d?" ("+d.client+")":""}</div>
              </div>);
            })}
            {actLog.length===0&&<div style={{padding:"16px",textAlign:"center",color:"#94a3b8",fontSize:".82rem"}}>No activity yet.</div>}
          </div>
        </div>);
      })()}
    </Wrap>
  );

  // ─── ARRIUS CATUBAY — Operations Director ─────────────────────────────────
  if(ownerTitle === "Operations Director") return(
    <Wrap>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
        <div>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:"1.6rem",color:"#0f172a"}}>Good {greeting}, Arrius 👋</div>
          <div style={{fontSize:".82rem",color:"#64748b",marginTop:2}}>Operations Director · {todayL}</div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>setPage("projects")} style={{background:"#f97316",border:"none",borderRadius:9,padding:"9px 18px",color:"#fff",fontFamily:"inherit",fontWeight:700,fontSize:".84rem",cursor:"pointer"}}>📋 Project Cards</button>
          <button onClick={()=>setPage("joborders")} style={{background:"#1e293b",border:"none",borderRadius:9,padding:"9px 18px",color:"#fff",fontFamily:"inherit",fontWeight:700,fontSize:".84rem",cursor:"pointer"}}>📄 Job Orders</button>
        </div>
      </div>

      {(()=>{
        const today2=new Date();
        const noBudget=wonDeals.filter(d=>!budgets[d.id]||(!budgets[d.id].Materials&&!budgets[d.id].Labor&&!budgets[d.id].Overhead&&!budgets[d.id].Subcon));
        const overBudget=wonDeals.filter(d=>{
          const b=budgets[d.id]; if(!b) return false;
          const total=(b.Materials||0)+(b.Labor||0)+(b.Overhead||0)+(b.Subcon||0);
          const spent=exps.filter(e=>e.dealId===d.id).reduce((s,e)=>s+Number(e.amount||0),0);
          return spent>total&&total>0;
        });
        const overdueProjects=wonDeals.filter(d=>pcards[d.id]?.targetEndDate&&new Date(pcards[d.id].targetEndDate)<today2);
        const newScope=addenda.filter(a=>a.status==="Discovered");
        const pendingMRs=mreqs.filter(m=>m.status==="Submitted");
        const todayPMUpdates=actLog.filter(a=>a.action==="PM Update"&&a.date===today);

        return(<div style={{display:"flex",flexDirection:"column",gap:16}}>
          {/* KPI Row */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
            {[
              {l:"Active Projects",    v:wonDeals.length,          c:"#f97316", icon:"🏗",  click:()=>setPage("projects")},
              {l:"TAT Overdue",        v:overdueProjects.length,   c:"#ef4444", icon:"⏰",  click:()=>setPage("projects")},
              {l:"New Scope Changes",  v:newScope.length,          c:"#f59e0b", icon:"⚠️"},
              {l:"PM Updates Today",   v:todayPMUpdates.length,    c:"#059669", icon:"📝"},
            ].map(({l,v,c,icon,click})=>(
              <div key={l} onClick={click} style={{background:"#fff",borderRadius:12,padding:"16px",border:`1.5px solid ${c}33`,cursor:click?"pointer":"default",textAlign:"center"}}>
                <div style={{fontSize:"1.3rem",marginBottom:4}}>{icon}</div>
                <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.5rem",color:c}}>{v}</div>
                <div style={{fontSize:".62rem",textTransform:"uppercase",letterSpacing:"1px",color:"#94a3b8",marginTop:2}}>{l}</div>
              </div>
            ))}
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
            {/* TAT overdue projects */}
            <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",overflow:"hidden"}}>
              <div style={{background:"#dc2626",padding:"11px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontWeight:700,color:"#fff",fontSize:".88rem"}}>⏰ TAT Overdue ({overdueProjects.length})</span>
                <button onClick={()=>setPage("projects")} style={{background:"rgba(255,255,255,.2)",border:"none",borderRadius:6,padding:"3px 10px",color:"#fff",fontSize:".72rem",cursor:"pointer",fontFamily:"inherit"}}>View all →</button>
              </div>
              {overdueProjects.length===0
                ?<div style={{padding:"16px",textAlign:"center",color:"#94a3b8",fontSize:".82rem"}}>✅ No overdue projects</div>
                :overdueProjects.sort((a,b)=>new Date(pcards[a.id]?.targetEndDate||0)-new Date(pcards[b.id]?.targetEndDate||0)).slice(0,6).map((d,i)=>{
                  const pc=pcards[d.id];
                  const jo=jos.find(j=>j.dealId===d.id);
                  const daysOver=Math.ceil((today2-new Date(pc.targetEndDate))/(1000*60*60*24));
                  return(<div key={d.id} onClick={()=>setPage("projects")} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 14px",borderBottom:i<5?"1px solid #f8fafc":"",cursor:"pointer"}}
                    onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <div>
                      <div style={{fontWeight:600,color:"#0f172a",fontSize:".82rem"}}>{d.client}</div>
                      <div style={{fontSize:".68rem",color:"#94a3b8"}}>PM: {jo?.pm1||"—"} · {d.ceNo}</div>
                    </div>
                    <span style={{fontSize:".72rem",fontWeight:700,color:"#dc2626",background:"#fef2f2",border:"1px solid #fecaca",borderRadius:20,padding:"2px 8px"}}>{daysOver}d over</span>
                  </div>);
                })
              }
            </div>

            {/* PM Updates feed */}
            <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",overflow:"hidden"}}>
              <div style={{background:"#0ea5e9",padding:"11px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontWeight:700,color:"#fff",fontSize:".88rem"}}>📝 Latest PM Updates</span>
              </div>
              {actLog.filter(a=>a.action==="PM Update").length===0
                ?<div style={{padding:"16px",textAlign:"center",color:"#94a3b8",fontSize:".82rem"}}>No PM updates logged yet.</div>
                :actLog.filter(a=>a.action==="PM Update").slice(0,6).map((a,i)=>{
                  const d=wonDeals.find(x=>x.id===a.dealId);
                  return(<div key={i} style={{padding:"9px 14px",borderBottom:i<5?"1px solid #f8fafc":""}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:600,color:"#0f172a",fontSize:".8rem"}}>{d?.client||"?"}</div>
                        <div style={{fontSize:".75rem",color:"#475569",marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.detail}</div>
                      </div>
                      <span style={{fontSize:".68rem",color:"#94a3b8",whiteSpace:"nowrap"}}>{a.date}</span>
                    </div>
                  </div>);
                })
              }
            </div>
          </div>

          {/* Scope changes + MRs row */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
            <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",overflow:"hidden"}}>
              <div style={{background:"#f59e0b",padding:"11px 16px"}}><span style={{fontWeight:700,color:"#fff",fontSize:".88rem"}}>⚠️ Scope Changes Needing Action ({newScope.length})</span></div>
              {newScope.length===0
                ?<div style={{padding:"16px",textAlign:"center",color:"#94a3b8",fontSize:".82rem"}}>✅ No open scope changes</div>
                :newScope.slice(0,5).map((a,i)=>{
                  const d=wonDeals.find(x=>x.id===a.dealId);
                  return(<div key={a.id} style={{padding:"9px 14px",borderBottom:i<4?"1px solid #f8fafc":""}}>
                    <div style={{fontWeight:600,color:"#0f172a",fontSize:".82rem"}}>{a.title}</div>
                    <div style={{fontSize:".72rem",color:"#94a3b8"}}>{d?.client||"?"} · {a.discoveredBy} · ₱{Number(a.value||0).toLocaleString()}</div>
                  </div>);
                })
              }
            </div>
            <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",overflow:"hidden"}}>
              <div style={{background:"#f97316",padding:"11px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontWeight:700,color:"#fff",fontSize:".88rem"}}>🔧 Pending Material Requests ({pendingMRs.length})</span>
                <button onClick={()=>setPage("materialreq")} style={{background:"rgba(255,255,255,.2)",border:"none",borderRadius:6,padding:"3px 10px",color:"#fff",fontSize:".72rem",cursor:"pointer",fontFamily:"inherit"}}>View →</button>
              </div>
              {pendingMRs.length===0
                ?<div style={{padding:"16px",textAlign:"center",color:"#94a3b8",fontSize:".82rem"}}>✅ No pending MRs</div>
                :pendingMRs.slice(0,5).map((m,i)=>{
                  const d=wonDeals.find(x=>x.id===m.dealId);
                  return(<div key={m.id} style={{display:"flex",justifyContent:"space-between",padding:"9px 14px",borderBottom:i<4?"1px solid #f8fafc":"",alignItems:"center"}}>
                    <div>
                      <div style={{fontWeight:600,color:"#0f172a",fontSize:".82rem"}}>{m.item}</div>
                      <div style={{fontSize:".68rem",color:"#94a3b8"}}>{d?.client||"?"} · {m.urgency||"Normal"}</div>
                    </div>
                    <span style={{fontSize:".7rem",fontWeight:700,color:"#c2410c",background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:20,padding:"2px 8px"}}>Waiting</span>
                  </div>);
                })
              }
            </div>
          </div>
        </div>);
      })()}
    </Wrap>
  );

  // ─── PAOLO GOMEZ — Sales Manager ──────────────────────────────────────────
  if(ownerTitle === "Sales Manager") return(
    <Wrap>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
        <div>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:"1.6rem",color:"#0f172a"}}>Good {greeting}, Paolo 👋</div>
          <div style={{fontSize:".82rem",color:"#64748b",marginTop:2}}>Sales Manager · {todayL}</div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>setPage("pipeline")} style={{background:"#10b981",border:"none",borderRadius:9,padding:"9px 18px",color:"#fff",fontFamily:"inherit",fontWeight:700,fontSize:".84rem",cursor:"pointer"}}>📊 Pipeline</button>
          <button onClick={()=>setPage("collections")} style={{background:"#1e293b",border:"none",borderRadius:9,padding:"9px 18px",color:"#fff",fontFamily:"inherit",fontWeight:700,fontSize:".84rem",cursor:"pointer"}}>💵 Collections</button>
        </div>
      </div>

      {/* ── AWARD REQUESTS ── */}
      {(()=>{
        const reqs=deals.filter(d=>d.notes&&d.notes.includes("[AWARD REQUEST"));
        if(!reqs.length) return null;
        return(
          <div style={{background:"#fffbeb",borderRadius:12,border:"2px solid #f59e0b",padding:"12px 16px",marginBottom:16}}>
            <div style={{fontWeight:800,color:"#92400e",fontSize:".9rem",marginBottom:8}}>
              🏆 {reqs.length} Deal{reqs.length>1?"s":""} Awaiting Award Approval
            </div>
            {reqs.map(d=>{
              const reqLine=d.notes.split("\n").filter(l=>l.includes("[AWARD REQUEST")).pop()||"";
              const reqBy=reqLine.match(/]: (.+?) flagged/)?.[1]||"Sales";
              return(
                <div key={d.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"#fff",borderRadius:7,padding:"8px 12px",marginBottom:4,border:"1px solid #fde68a"}}>
                  <div>
                    <span style={{fontWeight:600,color:"#0f172a",fontSize:".85rem"}}>{d.client}</span>
                    <span style={{fontSize:".72rem",color:"#92400e",marginLeft:8}}>by {reqBy} · ₱{Number(d.value||0).toLocaleString()}</span>
                  </div>
                  <button onClick={()=>setPage("pipeline")} style={{background:"#f59e0b",border:"none",borderRadius:6,padding:"5px 12px",fontFamily:"inherit",fontWeight:700,fontSize:".75rem",color:"#fff",cursor:"pointer"}}>
                    Review
                  </button>
                </div>
              );
            })}
          </div>
        );
      })()}

      {(()=>{
        const today2=new Date();
        const activePipe=deals.filter(d=>d.stage!=="Cancelled");
        const totalPipeVal=activePipe.reduce((s,d)=>s+Number(d.value||0),0);
        const awardedVal=wonDeals.reduce((s,d)=>s+Number(d.value||0),0);
        const thisMonth=new Date().toISOString().slice(0,7);
        const newThisMonth=deals.filter(d=>d.dateAcquired?.slice(0,7)===thisMonth);
        const allMs=billings;
        const totalPaid=allMs.reduce((s,m)=>s+(m.payments||[]).reduce((ps,p)=>ps+Number(p.amount||0),0),0);
        const outstanding=allMs.reduce((s,m)=>s+Number(m.amount||0),0)-totalPaid;
        const newScope=addenda.filter(a=>a.status==="Discovered"||a.status==="Sales Notified");
        const overdue=allMs.filter(m=>m.dueDate&&new Date(m.dueDate)<today2&&m.status!=="Fully Paid");

        // AE performance
        const aeNames=["Gail De Ello","April Gail De Ello","Jena De Asis","Don Wyn Celmar"];
        const aeStats=aeNames.map(ae=>({
          name:ae.split(" ")[0]+(ae.includes("Gail")?" (Gail)":""),
          deals:deals.filter(d=>d.salesOwner===ae||d.salesOwner?.includes(ae.split(" ")[0])).length,
          awarded:wonDeals.filter(d=>d.salesOwner===ae||d.salesOwner?.includes(ae.split(" ")[0])).length,
        })).filter(a=>a.deals>0);

        return(<div style={{display:"flex",flexDirection:"column",gap:16}}>
          {/* KPI Row */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
            {[
              {l:"Total Pipeline",     v:"₱"+Math.round(totalPipeVal/1000000)+"M",  c:"#10b981", icon:"📊", click:()=>setPage("pipeline")},
              {l:"Awarded Value",      v:"₱"+Math.round(awardedVal/1000000)+"M",    c:"#3b82f6", icon:"🏆"},
              {l:"New This Month",     v:newThisMonth.length+" deals",               c:"#8b5cf6", icon:"✨"},
              {l:"Outstanding AR",     v:"₱"+Math.round(outstanding/1000)+"K",      c:"#f59e0b", icon:"💵", click:()=>setPage("collections")},
            ].map(({l,v,c,icon,click})=>(
              <div key={l} onClick={click} style={{background:"#fff",borderRadius:12,padding:"16px",border:`1.5px solid ${c}33`,cursor:click?"pointer":"default",textAlign:"center"}}>
                <div style={{fontSize:"1.3rem",marginBottom:4}}>{icon}</div>
                <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.4rem",color:c}}>{v}</div>
                <div style={{fontSize:".62rem",textTransform:"uppercase",letterSpacing:"1px",color:"#94a3b8",marginTop:2}}>{l}</div>
              </div>
            ))}
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
            {/* Scope changes needing AE action */}
            <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",overflow:"hidden"}}>
              <div style={{background:"#dc2626",padding:"11px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontWeight:700,color:"#fff",fontSize:".88rem"}}>⚠️ Scope Changes Needing AE Action ({newScope.length})</span>
              </div>
              {newScope.length===0
                ?<div style={{padding:"16px",textAlign:"center",color:"#94a3b8",fontSize:".82rem"}}>✅ No open scope changes</div>
                :newScope.slice(0,5).map((a,i)=>{
                  const d=wonDeals.find(x=>x.id===a.dealId);
                  return(<div key={a.id} style={{padding:"9px 14px",borderBottom:i<newScope.length-1?"1px solid #f8fafc":""}}>
                    <div style={{fontWeight:600,color:"#0f172a",fontSize:".82rem"}}>{a.title}</div>
                    <div style={{fontSize:".72rem",color:"#94a3b8"}}>{d?.client||"?"} · AE: {d?.salesOwner||"—"} · {a.status}</div>
                    {a.value>0&&<div style={{fontSize:".72rem",color:"#059669",marginTop:1}}>Est. ₱{Number(a.value).toLocaleString()} additional</div>}
                  </div>);
                })
              }
            </div>

            {/* Collections call list */}
            <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",overflow:"hidden"}}>
              <div style={{background:"#1e293b",padding:"11px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontWeight:700,color:"#f59e0b",fontSize:".88rem"}}>📞 Priority Collections ({overdue.length})</span>
                <button onClick={()=>setPage("collections")} style={{background:"rgba(255,255,255,.1)",border:"none",borderRadius:6,padding:"3px 10px",color:"#fff",fontSize:".72rem",cursor:"pointer",fontFamily:"inherit"}}>Full list →</button>
              </div>
              {overdue.length===0
                ?<div style={{padding:"16px",textAlign:"center",color:"#94a3b8",fontSize:".82rem"}}>✅ No overdue collections</div>
                :overdue.sort((a,b)=>new Date(a.dueDate)-new Date(b.dueDate)).slice(0,5).map((m,i)=>{
                  const d=wonDeals.find(x=>x.id===m.dealId);
                  const paid=(m.payments||[]).reduce((s,p)=>s+Number(p.amount||0),0);
                  const bal=Number(m.amount||0)-paid;
                  const days=Math.floor((today2-new Date(m.dueDate))/(1000*60*60*24));
                  return(<div key={m.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 14px",borderBottom:i<4?"1px solid #f8fafc":"",flexWrap:"wrap",gap:4}}>
                    <div>
                      <div style={{fontWeight:600,color:"#0f172a",fontSize:".82rem"}}>{d?.client||"?"}</div>
                      <div style={{fontSize:".68rem",color:"#94a3b8"}}>AE: {d?.salesOwner||"—"} · {days}d overdue</div>
                    </div>
                    <div style={{fontWeight:700,color:"#dc2626",fontSize:".82rem"}}>₱{Math.round(bal).toLocaleString()}</div>
                  </div>);
                })
              }
            </div>
          </div>

          {/* AE performance */}
          {aeStats.length>0&&(
            <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",overflow:"hidden"}}>
              <div style={{background:"#059669",padding:"11px 16px"}}><span style={{fontWeight:700,color:"#fff",fontSize:".88rem"}}>👥 AE Performance — {new Date().toLocaleString("en-PH",{month:"long",year:"numeric"})}</span></div>
              <div style={{display:"grid",gridTemplateColumns:`repeat(${aeStats.length},1fr)`,gap:0}}>
                {aeStats.map((ae,i)=>(
                  <div key={ae.name} style={{padding:"14px 16px",textAlign:"center",borderRight:i<aeStats.length-1?"1px solid #f8fafc":""}}>
                    <div style={{fontWeight:700,color:"#0f172a",fontSize:".85rem",marginBottom:6}}>{ae.name}</div>
                    <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.3rem",color:"#10b981"}}>{ae.deals}</div>
                    <div style={{fontSize:".65rem",color:"#94a3b8",textTransform:"uppercase",letterSpacing:"1px"}}>Total Deals</div>
                    <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.1rem",color:"#3b82f6",marginTop:6}}>{ae.awarded}</div>
                    <div style={{fontSize:".65rem",color:"#94a3b8",textTransform:"uppercase",letterSpacing:"1px"}}>Awarded</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>);
      })()}
    </Wrap>
  );

  // ── PAULO GARCIA — CEO (full system overview) ──────────────────────────────
  const grossMar=totRev>0?Math.round((totRev-totExp)/totRev*100):0;
  return(
      <Wrap>
        {/* ── HEADER ─────────────────────────────────────────────────── */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:12}}>
          <div>
            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:"1.6rem",color:"#0f172a",letterSpacing:"-.5px"}}>
              Good {new Date().getHours()<12?"morning":new Date().getHours()<17?"afternoon":"evening"}, {session?.name?.split(" ")[0]}
            </div>
            <div style={{fontSize:".78rem",color:"#64748b",marginTop:2}}>{todayL} · FabHub GMD</div>
          </div>
          {/* Quick Actions */}
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {[
              {l:"+ Add Deal",       icon:"🤝", action:()=>openAddDeal(),              bg:"#1e293b", fg:"#fff"},
              {l:"+ Award Project",  icon:"🏆", action:()=>setPage("pipeline"),         bg:"#059669", fg:"#fff"},
              {l:"+ Log Expense",    icon:"💸", action:()=>openAddExp(),                bg:"#3b82f6", fg:"#fff"},
              {l:"+ Log Payment",    icon:"💵", action:()=>setPage("billing"),           bg:"#8b5cf6", fg:"#fff"},
              {l:"+ New PO",         icon:"📦", action:()=>setPage("procurement"),       bg:"#f59e0b", fg:"#fff"},
              {l:"📅 Calendar",      icon:"",   action:()=>setPage("calendar"),          bg:"#0ea5e9", fg:"#fff"},
            ].map(({l,icon,action,bg,fg})=>(
              <button key={l} onClick={action}
                style={{background:bg,border:"none",borderRadius:9,padding:"8px 16px",fontFamily:"inherit",fontWeight:700,fontSize:".8rem",color:fg,cursor:"pointer",display:"flex",alignItems:"center",gap:5}}>
                {icon} {l}
              </button>
            ))}
          </div>
        </div>

        {/* ── ALERT BANNER ROW ────────────────────────────────────────── */}
        {(()=>{
          const alerts=[];
          // Award requests — highest priority
          const awardReqs=deals.filter(d=>d.notes&&d.notes.includes("[AWARD REQUEST"));
          if(awardReqs.length) alerts.push({icon:"🏆",msg:`${awardReqs.length} deal${awardReqs.length>1?"s":""} flagged for award`,color:"#f59e0b",bg:"#fffbeb",border:"#fde68a",action:()=>setPage("pipeline")});
          // Overdue invoices
          const overdueInv=billings.filter(b=>b.dueDate&&b.dueDate<today&&b.status!=="Fully Paid"&&b.status!=="Cancelled");
          if(overdueInv.length) alerts.push({icon:"🚨",msg:`${overdueInv.length} overdue invoice${overdueInv.length>1?"s":""}`,color:"#dc2626",bg:"#fef2f2",border:"#fecaca",action:()=>setPage("billing")});
          // Projects past TAT
          const overdueTAT=Object.values(pcards).filter(p=>p.targetEndDate&&p.targetEndDate<today&&!DEPT_ORDER.every(d=>p.departments?.[d]?.done));
          if(overdueTAT.length) alerts.push({icon:"⏰",msg:`${overdueTAT.length} project${overdueTAT.length>1?"s":""} past deadline`,color:"#c2410c",bg:"#fff7ed",border:"#fed7aa",action:()=>setPage("projects")});
          // QS budget pending
          const qsPending=jos.filter(j=>j.budgetStatus==="QS Budget Pending");
          if(qsPending.length) alerts.push({icon:"⚠️",msg:`${qsPending.length} project${qsPending.length>1?"s":""} need QS budget`,color:"#92400e",bg:"#fffbeb",border:"#fde68a",action:()=>setPage("costanalysis")});
          // MRs pending
          const mrPending=mreqs.filter(m=>m.status==="Submitted");
          if(mrPending.length) alerts.push({icon:"📋",msg:`${mrPending.length} material request${mrPending.length>1?"s":""} pending`,color:"#1d4ed8",bg:"#eff6ff",border:"#93c5fd",action:()=>setPage("procurement")});
          // Addenda needing Sales
          const addendaAlert=addenda.filter(a=>!a.salesNotified&&a.status!=="Rejected");
          if(addendaAlert.length) alerts.push({icon:"⚠️",msg:`${addendaAlert.length} scope change${addendaAlert.length>1?"s":""} need Sales action`,color:"#92400e",bg:"#fffbeb",border:"#fde68a",action:()=>setPage("pipeline")});
          if(!alerts.length) return null;
          return(
            <div style={{display:"grid",gridTemplateColumns:`repeat(${Math.min(alerts.length,3)},1fr)`,gap:8,marginBottom:16}}>
              {alerts.slice(0,3).map((a,i)=>(
                <div key={i} onClick={a.action} style={{background:a.bg,border:`1.5px solid ${a.border}`,borderRadius:10,padding:"10px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:"1rem"}}>{a.icon}</span>
                  <span style={{fontSize:".78rem",fontWeight:700,color:a.color}}>{a.msg}</span>
                  <span style={{marginLeft:"auto",fontSize:".72rem",color:a.color}}>→</span>
                </div>
              ))}
            </div>
          );
        })()}

        {/* ── KPI STRIP ───────────────────────────────────────────────── */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:10,marginBottom:20}}>
          {[
            {l:"Pipeline",      v:fmtK(deals.filter(d=>!["Cancelled","Lost"].includes(d.stage)).reduce((s,d)=>s+Number(d.value||0),0)), c:"#3b82f6", sub:deals.filter(d=>!["Cancelled","Lost"].includes(d.stage)).length+" deals"},
            {l:"Awarded",       v:fmtK(totRev),      c:"#10b981", sub:wonDeals.length+" projects"},
            {l:"Collected",     v:fmtK(totColl),     c:"#059669", sub:`${fmtK(totOut)} outstanding`},
            {l:"Gross Margin",  v:grossMar+"%",      c:grossMar>=20?"#059669":"#f59e0b", sub:"on awarded projects"},
            {l:"Active JOs",    v:jos.filter(j=>j.status==="Active").length, c:"#f97316", sub:"job orders issued"},
            {l:"Pending PRs",   v:prs.filter(p=>p.status==="Pending Approval").length, c:"#8b5cf6", sub:"awaiting approval"},
          ].map(({l,v,c,sub})=>(
            <div key={l} style={{background:"#fff",borderRadius:12,padding:"14px 16px",border:"1.5px solid #e2e8f0"}}>
              <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.35rem",color:c}}>{v}</div>
              <div style={{fontSize:".63rem",textTransform:"uppercase",letterSpacing:"1px",color:"#94a3b8",marginTop:3}}>{l}</div>
              {sub&&<div style={{fontSize:".67rem",color:"#cbd5e1",marginTop:2}}>{sub}</div>}
            </div>
          ))}
        </div>

        {/* ── MAIN CONTENT GRID ───────────────────────────────────────── */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>

          {/* ── AWARD REQUESTS PANEL ──────────────────────────────── */}
          {(()=>{
            const reqs=deals.filter(d=>d.notes&&d.notes.includes("[AWARD REQUEST"));
            if(!reqs.length) return null;
            return(
              <div style={{background:"#fffbeb",borderRadius:14,border:"2px solid #f59e0b",padding:"14px 18px",marginBottom:16}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                  <span style={{fontSize:"1.2rem"}}>🏆</span>
                  <span style={{fontWeight:800,color:"#92400e",fontSize:".95rem"}}>
                    {reqs.length} Deal{reqs.length>1?"s":""} Pending Your Award Approval
                  </span>
                </div>
                {reqs.map(d=>{
                  const reqLine=d.notes.split("\n").filter(l=>l.includes("[AWARD REQUEST")).pop()||"";
                  const reqBy=reqLine.match(/]: (.+?) flagged/)?.[1]||"Sales";
                  const reqDate=reqLine.match(/REQUEST (.+?)]/)?.[1]||"";
                  return(
                    <div key={d.id} style={{background:"#fff",borderRadius:8,padding:"10px 14px",marginBottom:6,display:"flex",justifyContent:"space-between",alignItems:"center",border:"1px solid #fde68a"}}>
                      <div>
                        <div style={{fontWeight:700,color:"#0f172a",fontSize:".88rem"}}>{d.client}</div>
                        <div style={{fontSize:".72rem",color:"#92400e",marginTop:2}}>
                          Requested by {reqBy} · {reqDate} · ₱{Number(d.value||0).toLocaleString()}
                        </div>
                      </div>
                      <button onClick={()=>{openAward(d);setPage("pipeline");}}
                        style={{background:"#f59e0b",border:"none",borderRadius:7,padding:"6px 14px",fontFamily:"inherit",fontWeight:700,fontSize:".78rem",color:"#fff",cursor:"pointer",whiteSpace:"nowrap"}}>
                        🏆 Review & Award
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* Active Projects — TAT status */}
          <div style={{background:"#fff",borderRadius:14,border:"1.5px solid #e2e8f0",overflow:"hidden"}}>
            <div style={{background:"#1e293b",padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontWeight:700,color:"#f59e0b",fontSize:".85rem"}}>🏗 Active Projects</span>
              <button onClick={()=>setPage("projects")} style={{background:"transparent",border:"1px solid rgba(255,255,255,.2)",borderRadius:6,padding:"3px 10px",color:"rgba(255,255,255,.7)",fontFamily:"inherit",fontSize:".7rem",cursor:"pointer"}}>View all</button>
            </div>
            <div style={{padding:"4px 0",maxHeight:230,overflowY:"auto"}}>
              {wonDeals.length===0&&<div style={{padding:"20px",textAlign:"center",color:"#94a3b8",fontSize:".8rem"}}>No active projects</div>}
              {wonDeals.slice(0,6).map(d=>{
                const pc=pcards[d.id];
                const jo=jos.find(j=>j.dealId===d.id);
                const daysLeft=pc?.targetEndDate?Math.ceil((new Date(pc.targetEndDate)-new Date())/(1000*60*60*24)):null;
                const isOver=daysLeft!==null&&daysLeft<0;
                const deptsDone=pc?DEPT_ORDER.filter(dept=>pc.departments?.[dept]?.done).length:0;
                return(
                  <div key={d.id} onClick={()=>setPage("projects")} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 16px",borderBottom:"1px solid #f8fafc",cursor:"pointer"}}
                    onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:600,color:"#0f172a",fontSize:".82rem",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.client}</div>
                      <div style={{fontSize:".68rem",color:"#94a3b8",marginTop:1}}>{jo?.pm1||"No PM"} · {deptsDone}/6 depts</div>
                    </div>
                    {daysLeft!==null?(
                      <span style={{fontSize:".7rem",fontWeight:700,color:isOver?"#ef4444":daysLeft<=7?"#f59e0b":"#059669",background:isOver?"#fef2f2":daysLeft<=7?"#fffbeb":"#f0fdf4",padding:"2px 8px",borderRadius:20,flexShrink:0}}>
                        {isOver?`${Math.abs(daysLeft)}d over`:`${daysLeft}d left`}
                      </span>
                    ):<span style={{fontSize:".68rem",color:"#e2e8f0",flexShrink:0}}>No TAT</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Collections snapshot */}
          <div style={{background:"#fff",borderRadius:14,border:"1.5px solid #e2e8f0",overflow:"hidden"}}>
            <div style={{background:"#1e293b",padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontWeight:700,color:"#4ade80",fontSize:".85rem"}}>💵 Collections</span>
              <button onClick={()=>setPage("billing")} style={{background:"transparent",border:"1px solid rgba(255,255,255,.2)",borderRadius:6,padding:"3px 10px",color:"rgba(255,255,255,.7)",fontFamily:"inherit",fontSize:".7rem",cursor:"pointer"}}>View billing</button>
            </div>
            <div style={{padding:"4px 0",maxHeight:230,overflowY:"auto"}}>
              {wonDeals.length===0&&<div style={{padding:"20px",textAlign:"center",color:"#94a3b8",fontSize:".8rem"}}>No awarded projects</div>}
              {wonDeals.slice(0,6).map(d=>{
                const ms=billings.filter(b=>b.dealId===d.id);
                const billed=ms.reduce((s,m)=>s+Number(m.amount||0),0);
                const collected=ms.reduce((s,m)=>s+(m.payments||[]).reduce((ps,p)=>ps+Number(p.amount||0),0),0);
                const balance=billed-collected;
                const hasOverdue=ms.some(m=>m.dueDate&&m.dueDate<today&&m.status!=="Fully Paid"&&m.status!=="Cancelled");
                return(
                  <div key={d.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 16px",borderBottom:"1px solid #f8fafc"}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:600,color:"#0f172a",fontSize:".82rem",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                        {hasOverdue&&<span style={{color:"#ef4444",marginRight:4}}>🔴</span>}{d.client}
                      </div>
                      <div style={{fontSize:".68rem",color:"#94a3b8",marginTop:1}}>{ms.length} milestone{ms.length!==1?"s":""} · Billed ₱{billed.toLocaleString("en-PH",{minimumFractionDigits:0})}</div>
                    </div>
                    <div style={{textAlign:"right",flexShrink:0}}>
                      <div style={{fontWeight:700,color:balance>0?"#ef4444":"#059669",fontSize:".82rem"}}>
                        {balance>0?`-₱${balance.toLocaleString("en-PH",{minimumFractionDigits:0})}`:"✓ Clear"}
                      </div>
                      {balance>0&&<div style={{fontSize:".65rem",color:"#94a3b8"}}>outstanding</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── BOTTOM ROW ──────────────────────────────────────────────── */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>

          {/* Recent Activity */}
          <div style={{background:"#fff",borderRadius:14,border:"1.5px solid #e2e8f0",overflow:"hidden"}}>
            <div style={{background:"#1e293b",padding:"12px 16px"}}>
              <span style={{fontWeight:700,color:"#a78bfa",fontSize:".85rem"}}>📋 Recent Activity</span>
            </div>
            <div style={{padding:"4px 0",maxHeight:200,overflowY:"auto"}}>
              {actLog.length===0&&<div style={{padding:"20px",textAlign:"center",color:"#94a3b8",fontSize:".8rem"}}>No activity yet</div>}
              {actLog.slice(0,10).map(entry=>{
                const clr={"New Deal":"#10b981","Project Awarded":"#f59e0b","Stage Change":"#3b82f6","Deal Updated":"#94a3b8","Department Done":"#8b5cf6","TAT Set":"#06b6d4"}[entry.action]||"#94a3b8";
                return(
                  <div key={entry.id} style={{display:"flex",gap:10,padding:"7px 14px",borderBottom:"1px solid #f8fafc",alignItems:"flex-start"}}>
                    <div style={{width:6,height:6,borderRadius:"50%",background:clr,flexShrink:0,marginTop:5}}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:".78rem",color:"#0f172a",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{entry.detail}</div>
                      <div style={{fontSize:".67rem",color:"#94a3b8",marginTop:1}}>{entry.by} · {entry.date} {entry.time}</div>
                    </div>
                    <span style={{fontSize:".62rem",color:clr,background:clr+"18",padding:"1px 6px",borderRadius:20,flexShrink:0,fontWeight:600}}>{entry.action}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Department Status Overview */}
          <div style={{background:"#fff",borderRadius:14,border:"1.5px solid #e2e8f0",overflow:"hidden"}}>
            <div style={{background:"#1e293b",padding:"12px 16px"}}>
              <span style={{fontWeight:700,color:"#fb923c",fontSize:".85rem"}}>🏢 Dept Status — Active Projects</span>
            </div>
            <div style={{padding:"12px 16px"}}>
              {DEPT_ORDER.map(dept=>{
                const clr=DEPT_CLR[dept];
                const total=wonDeals.length;
                const done=Object.values(pcards).filter(p=>p.departments?.[dept]?.done).length;
                const pct=total>0?Math.round(done/total*100):0;
                return(
                  <div key={dept} style={{marginBottom:10}}>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:".75rem",marginBottom:3}}>
                      <span style={{fontWeight:600,color:"#475569"}}>{dept}</span>
                      <span style={{color:clr,fontWeight:700}}>{done}/{total} done</span>
                    </div>
                    <div style={{height:6,background:"#f1f5f9",borderRadius:3,overflow:"hidden"}}>
                      <div style={{height:"100%",width:pct+"%",background:clr,borderRadius:3,transition:"width .5s"}}/>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Wrap>
    );
  }

  // ── CALENDAR — Sales gets follow-up view; all other roles get ConstructionCalendar
  if(page==="calendar") return role==="Sales"?(
    <Wrap><SalesCalendarView deals={deals} session={session} role={role}/></Wrap>
  ):(
    <ConstructionCalendar
      wonDeals={wonDeals} deals={deals} pcards={pcards} jos={jos}
      prs={prs} billings={billings} drfs={drfs}
      setPage={setPage} today={today} Wrap={Wrap}
    />
  );

  // ── BOT SETTINGS (Manager only) ───────────────────────────────────────────
  if(page==="botsettings"&&role==="Manager") return(
    <BotSettingsView botSettings={botSettings} saveBotSettings={saveBotSettings} sendTelegramNotification={sendTelegramNotification} Wrap={Wrap}/>
  );

  if(page==="pipeline") return(
      <Wrap>
        {/* KPIs */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18,flexWrap:"wrap",gap:10}}>
          <div>
            <h2 style={{margin:0,fontWeight:800,color:"#0f172a",fontSize:"1.15rem"}}>Sales Pipeline</h2>
            <div style={{fontSize:".75rem",color:"#64748b",marginTop:2}}>{deals.filter(d=>!WON_STAGES.includes(d.stage)&&d.stage!=="Cancelled").length} active deals · {todayL}</div>
            {/* Search bar */}
            <div style={{position:"relative",marginTop:8}}>
              <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:"#94a3b8",fontSize:".85rem"}}>🔍</span>
              <input
                type="text"
                value={pipeSearch}
                onChange={e=>setPipeSearch(e.target.value)}
                placeholder="Search by client, CE number, project name, AE..."
                style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:9,padding:"8px 12px 8px 32px",fontFamily:"inherit",fontSize:".84rem",color:"#0f172a",outline:"none",background:"#fff"}}
                onFocus={e=>e.target.style.borderColor="#3b82f6"}
                onBlur={e=>e.target.style.borderColor="#e2e8f0"}
              />
              {pipeSearch&&<button onClick={()=>setPipeSearch("")} style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:".85rem"}}>✕</button>}
            </div>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <label style={{background:"#f0fdf4",border:"1.5px solid #6ee7b7",borderRadius:9,padding:"7px 14px",fontFamily:"inherit",fontWeight:700,fontSize:".82rem",color:"#059669",cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
              📥 Smart Import
              <input type="file" accept=".xlsx,.xls,.csv,.pdf" style={{display:"none"}} onChange={async e=>{
                const file=e.target.files[0]; if(!file) return;
                e.target.value="";
                setImportLoading(true);
                try{
                  // Step 1: Parse the file
                  let rawRows=[], rawText="", fileType=file.name.split(".").pop().toLowerCase();
                  if(fileType==="csv"){
                    rawText=await file.text();
                    const lines=rawText.split("\n").filter(Boolean);
                    const parseCSVLine=l=>{const f=[];let c="",q=false;for(const ch of l){if(ch==='"')q=!q;else if(ch===','&&!q){f.push(c.trim());c="";}else c+=ch;}f.push(c.trim());return f;};
                    const headers=parseCSVLine(lines[0]).map(h=>h.replace(/^"|"$/g,""));
                    rawRows=lines.slice(1).map(line=>{
                      const vals=parseCSVLine(line).map(v=>v.replace(/^"|"$/g,""));
                      return Object.fromEntries(headers.map((h,i)=>[h,vals[i]||""]));
                    }).filter(r=>Object.values(r).some(v=>v));
                    rawText=lines.slice(0,6).join("\n");
                  } else if(["xlsx","xls"].includes(fileType)){
                    const {read,utils}=window.XLSX||{};
                    if(!read) throw new Error("Excel library not loaded. Wait 5 seconds and retry.");
                    const buf=await file.arrayBuffer();
                    const wb=read(buf,{type:"array"});
                    const ws=wb.Sheets[wb.SheetNames[0]];
                    const allRows=utils.sheet_to_json(ws,{defval:""});
                    rawRows=allRows;
                    // Get first 5 rows as text preview
                    rawText=utils.sheet_to_json(ws,{header:1}).slice(0,6).map(r=>r.join(" | ")).join("\n");
                  }

                  // Step 2: Analyze file structure locally
                  const allColumns=[...new Set(rawRows.flatMap(r=>Object.keys(r)))];
                  const colsNorm=allColumns.map(c=>c.toLowerCase().replace(/[^a-z0-9]/g,""));
                  const score=(terms)=>terms.filter(t=>colsNorm.some(c=>c.includes(t))).length;
                  const scores={
                    deals:   score(["client","stage","value","ceno","cenum","deal","pipeline","acquired","sales"]),
                    expenses:score(["expense","category","amount","vendor","cost","description","receipt"]),
                    inflows: score(["inflow","payment","received","collection","income","deposited"]),
                    clients: score(["company","contact","email","phone","address","industry"]),
                    payroll: score(["employee","salary","wage","payroll","rate","allowance","deduction"]),
                  };
                  const best=Object.entries(scores).sort((a,b)=>b[1]-a[1])[0];
                  const dataType=best[1]>0?best[0]:"unknown";
                  const confidence=Math.min(95,best[1]*20+5);
                  const issues=[];
                  if(rawRows.length===0) issues.push("File appears to be empty — no data rows found");
                  if(allColumns.length>30) issues.push("Wide file — showing first 20 columns");
                  const emptyCount=rawRows.filter(r=>Object.values(r).every(v=>!v)).length;
                  if(emptyCount>0) issues.push(`${emptyCount} completely empty row${emptyCount>1?"s":""} detected`);
                  const canImport=dataType==="deals"&&rawRows.length>0;
                  const analysis={
                    dataType,confidence,rowCount:rawRows.length,
                    fieldsFound:allColumns.slice(0,20),
                    issues,
                    summary:`File contains ${rawRows.length} row${rawRows.length!==1?"s":""} and ${allColumns.length} column${allColumns.length!==1?"s":""}. ${dataType!=="unknown"?`Detected as ${dataType} data based on column names.`:"Column names did not match a known data type — manual review needed."}`,
                    importAction:canImport?"Import as deals into the Sales Pipeline":`${dataType!=="unknown"?dataType.charAt(0).toUpperCase()+dataType.slice(1)+" data detected":"Unknown data type"} — use the matching module to import`,
                    canImport,
                    cantImportReason:canImport?"":dataType!=="deals"&&dataType!=="unknown"?`${dataType} data — import this using the ${dataType} module instead`:"Could not map columns to a known FabHub data type",
                  };
                  setSmartImport({rows:rawRows,analysis,fileName:file.name,fileType});
                }catch(err){
                  toastEmit("Error reading file: "+err.message,"error");
                }
                setImportLoading(false);
              }}/>
              {importLoading&&<span style={{fontSize:".7rem",color:"#f59e0b",marginLeft:6}}>📂 Reading…</span>}
            </label>
            <button onClick={()=>{
              const hdrs=["Client","Project Name","CE No","CE Type","Stage","Contract Value","Invoiced","Amount Paid","Payment Status","Receipt Type","Sales Owner","Date Acquired","Notes"];
              const rows=[
                ["Metro Retail Co.","SM Megamall Renovation","CE-2025-001","Fabrication / General","01 · BizDev","500000","0","0","Unpaid","OR","Paulo Garcia","2025-05-23","Sample entry — delete before importing"],
                ["ABC Corporation","Office Fit-Out Phase 2","CE-2025-002","Retail Fit-Out","04 · Design & CE in Progress","750000","0","0","Unpaid","OR","Paolo Gomez","2025-05-20",""],
                ["XYZ Holdings","Lobby Display Walls","CE-2025-003","Fabrication / General","06 · Project Kickoff","1200000","600000","300000","Partial","OR","April Gail De Ello","2025-04-15","50% down collected"],
              ];
              const csv=[hdrs,...rows].map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\r\n");
              const a=Object.assign(document.createElement("a"),{href:URL.createObjectURL(new Blob(["﻿"+csv],{type:"text/csv;charset=utf-8"})),download:"GMD_Sales_Import_Template.csv"});
              document.body.appendChild(a);a.click();document.body.removeChild(a);
            }} style={{background:"#eff6ff",border:"1.5px solid #bfdbfe",borderRadius:9,padding:"7px 14px",fontFamily:"inherit",fontWeight:700,fontSize:".82rem",color:"#1d4ed8",cursor:"pointer"}}>
              📄 Template
            </button>
            <Btn onClick={openAddDeal}>+ Add Deal</Btn>
            <button onClick={()=>{
              const name=window.prompt("New client name:");
              if(!name?.trim()) return;
              if(GMD_CLIENTS.find(c=>c.name.toLowerCase()===name.trim().toLowerCase())){toastEmit("Client already exists.","warning");return;}
              GMD_CLIENTS.push({name:name.trim(),id:"c"+Date.now(),addedBy:session?.name||"",addedAt:today});
              toastEmit("Client \""+name.trim()+"\" added to directory.","success");
            }} style={{background:"#f0fdf4",border:"1.5px solid #6ee7b7",borderRadius:9,padding:"7px 14px",fontFamily:"inherit",fontWeight:700,fontSize:".82rem",color:"#059669",cursor:"pointer"}}>
              + Add Client
            </button>
          </div>
        </div>
        {/* Addenda requiring Sales action */}
        {(()=>{
          const myAddenda=addenda.filter(a=>{
            const deal=deals.find(d=>d.id===a.projectId);
            return deal&&!a.salesNotified&&a.status!=="Rejected";
          });
          return myAddenda.length>0?(
            <div style={{background:"#fff7ed",border:"1.5px solid #fed7aa",borderRadius:12,padding:"12px 16px",marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}>
              <div>
                <div style={{fontWeight:700,color:"#92400e",fontSize:".88rem"}}>⚠️ {myAddenda.length} scope change{myAddenda.length>1?"s":""} need your attention</div>
                <div style={{fontSize:".75rem",color:"#92400e",marginTop:3,opacity:.8}}>Operations logged scope changes — coordinate with clients before proceeding</div>
                <div style={{marginTop:6,display:"flex",flexDirection:"column",gap:3}}>
                  {myAddenda.slice(0,3).map(a=>(
                    <div key={a.id} style={{fontSize:".75rem",color:"#92400e"}}>
                      • <strong>{a.projectName||deals.find(d=>d.id===a.projectId)?.client}</strong>: {a.title}
                      {Number(a.value)>0&&<span style={{marginLeft:6,fontWeight:700}}>₱{Number(a.value).toLocaleString("en-PH")}</span>}
                    </div>
                  ))}
                  {myAddenda.length>3&&<div style={{fontSize:".72rem",color:"#92400e",opacity:.7}}>+{myAddenda.length-3} more</div>}
                </div>
              </div>
            </div>
          ):null;
        })()}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:24}}>
          {[
            {l:"Total Pipeline",    v:fmtK(deals.filter(d=>!WON_STAGES.includes(d.stage)&&d.stage!=="Cancelled").reduce((s,d)=>s+Number(d.value||0),0)), c:"#3b82f6"},
            {l:"Awarded Value",     v:fmtK(wonDeals.reduce((s,d)=>s+Number(d.value||0),0)),   c:"#059669"},
            {l:"Active Deals",      v:deals.filter(d=>!WON_STAGES.includes(d.stage)&&d.stage!=="Cancelled").length, c:"#f59e0b"},
            {l:"Awarded Projects",  v:wonDeals.length, c:"#8b5cf6"},
          ].map(({l,v,c,sub})=>(
            <div key={l} style={{background:"#fff",borderRadius:12,padding:"15px 16px",border:"1.5px solid #e2e8f0",boxShadow:"0 1px 4px rgba(0,0,0,.04)"}}>
              <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.4rem",color:c,lineHeight:1}}>{v}</div>
              {sub&&<div style={{fontSize:".68rem",color:c,opacity:.7,marginTop:2}}>{sub}</div>}
              <div style={{fontSize:".63rem",textTransform:"uppercase",letterSpacing:"1px",color:"#94a3b8",marginTop:6}}>{l}</div>
            </div>
          ))}
        </div>

        {/* Activity Feed + New Clients widget */}
        {/* Activity Feed — full width */}
        <div style={{marginBottom:24}}>
          <div style={{background:"#fff",borderRadius:14,border:"1.5px solid #e2e8f0",overflow:"hidden"}}>
            <div style={{background:"#1e293b",padding:"12px 16px"}}>
              <span style={{fontWeight:700,color:"#4ade80",fontSize:".85rem"}}>📋 Recent Activity</span>
            </div>
            <div style={{padding:"8px 0",maxHeight:220,overflowY:"auto"}}>
              {actLog.length===0&&<div style={{textAlign:"center",padding:"20px",color:"#94a3b8",fontSize:".78rem"}}>No activity yet — actions will appear here</div>}
              {actLog.slice(0,12).map(entry=>{
                const deal=deals.find(d=>d.id===entry.dealId);
                const actionClr={"New Deal":"#10b981","Project Awarded":"#f59e0b","Stage Change":"#3b82f6","Deal Updated":"#94a3b8"}[entry.action]||"#94a3b8";
                return(
                  <div key={entry.id} style={{display:"flex",gap:10,padding:"7px 16px",borderBottom:"1px solid #f8fafc",alignItems:"flex-start"}}>
                    <div style={{width:6,height:6,borderRadius:"50%",background:actionClr,flexShrink:0,marginTop:5}}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:".78rem",color:"#0f172a",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{entry.detail}</div>
                      <div style={{fontSize:".68rem",color:"#94a3b8",marginTop:1}}>{entry.by} · {entry.date} {entry.time}</div>
                    </div>
                    <span style={{fontSize:".65rem",color:actionClr,background:actionClr+"18",padding:"1px 7px",borderRadius:20,whiteSpace:"nowrap",flexShrink:0,fontWeight:600}}>{entry.action}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Stage filter expanded view */}
        {/* Search results notice */}
        {pipeSearch&&(
          <div style={{background:"#eff6ff",border:"1.5px solid #93c5fd",borderRadius:10,padding:"8px 16px",marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:".82rem",color:"#1d4ed8"}}>
              🔍 Showing results for "<strong>{pipeSearch}</strong>" — {deals.filter(d=>d.stage!=="Cancelled"&&[d.client,d.contact,d.ceNo,d.salesOwner,d.product].join(" ").toLowerCase().includes(pipeSearch.toLowerCase())).length} deals found
            </span>
            <button onClick={()=>setPipeSearch("")} style={{background:"transparent",border:"none",color:"#3b82f6",cursor:"pointer",fontSize:".8rem",fontWeight:700}}>Clear ✕</button>
          </div>
        )}

        {/* Active Pipeline — Hot / Cold split */}
        {(()=>{
          const daysSince=dt=>dt?Math.floor((new Date(today)-new Date(dt))/(864e5)):0;
          const allActive=deals.filter(d=>
            !WON_STAGES.includes(d.stage)&&d.stage!=="Cancelled"&&d.stage!=="Did Not Win"&&
            (!pipeSearch||[d.client,d.contact,d.ceNo,d.salesOwner,d.product].join(" ").toLowerCase().includes(pipeSearch.toLowerCase()))
          ).sort((a,b)=>daysSince(a.dateAcquired)-daysSince(b.dateAcquired));
          const hotDeals=allActive.filter(d=>daysSince(d.dateAcquired)<=15);
          const coldDeals=allActive.filter(d=>daysSince(d.dateAcquired)>15);

          // Compact row for Hot/Cold pipeline tables
          const PipeRow=({d,list,i})=>(
            <div style={{display:"flex",gap:8,padding:"7px 12px",borderBottom:i<list.length-1?"1px solid #f1f5f9":"none",alignItems:"center",background:"#fff",transition:"background .1s"}}
              onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"}
              onMouseLeave={e=>e.currentTarget.style.background="#fff"}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",gap:4,alignItems:"center",flexWrap:"wrap"}}>
                  <span style={{fontWeight:700,color:"#0f172a",fontSize:".8rem"}}>{d.client}</span>
                  {vvipClients?.has(d.client)&&<span style={{fontSize:".58rem",color:"#d97706",background:"#fef3c7",borderRadius:20,padding:"1px 5px",fontWeight:700,flexShrink:0}}>⭐</span>}
                  {Number(d.value)>=3000000&&<span style={{fontSize:".58rem",color:"#dc2626",background:"#fef2f2",borderRadius:20,padding:"1px 5px",fontWeight:700,flexShrink:0}}>₱3M+</span>}
                  {d.awardRequestData&&<span style={{fontSize:".58rem",color:"#059669",background:"#f0fdf4",border:"1px solid #6ee7b7",borderRadius:20,padding:"1px 5px",fontWeight:700,flexShrink:0}}>🏆 Pending</span>}
                </div>
                <div style={{fontSize:".67rem",color:"#94a3b8",marginTop:1,display:"flex",gap:8,flexWrap:"wrap"}}>
                  {d.ceNo&&<span style={{color:"#475569",fontWeight:600}}>{d.ceNo}</span>}
                  {d.salesOwner&&<span>👤 {d.salesOwner.split(" ")[0]}</span>}
                  <span style={{color:d.followUp&&d.followUp<today?"#ef4444":daysSince(d.dateAcquired)>15?"#f59e0b":"#94a3b8"}}>
                    {d.followUp&&d.followUp<today?"⚠ "+d.followUp:daysSince(d.dateAcquired)+"d ago"}
                  </span>
                </div>
              </div>
              <div style={{fontWeight:700,color:"#10b981",fontSize:".8rem",flexShrink:0,minWidth:44,textAlign:"right"}}>{d.value?fmtK(Number(d.value)):"—"}</div>
              <div style={{display:"flex",gap:3,flexShrink:0}}>
                <button onClick={()=>openEditDeal(d)} style={{background:"#f1f5f9",border:"none",borderRadius:5,padding:"4px 7px",fontSize:".68rem",color:"#475569",cursor:"pointer",fontWeight:600,fontFamily:"inherit"}} title="Edit">✏</button>
                {role==="Manager"
                  ?<button onClick={()=>openAward(d)} style={{background:"#059669",border:"none",borderRadius:5,padding:"4px 7px",fontSize:".68rem",color:"#fff",cursor:"pointer",fontWeight:700,fontFamily:"inherit"}} title="Award">🏆</button>
                  :<button onClick={()=>{setAwardReqStep(1);setAwardReqForm({awardTrigger:"CE Signed by Client",triggerDate:today,triggerNote:"",aeAssigned:d.salesOwner||"",pm1Suggestion:"",scopeNotes:"",specialInstructions:""});setAwardReqModal(d);}} style={{background:"#f59e0b",border:"none",borderRadius:5,padding:"4px 7px",fontSize:".68rem",color:"#fff",cursor:"pointer",fontWeight:700,fontFamily:"inherit"}} title="Request Award">🏆</button>
                }
                {role==="Manager"&&<button onClick={()=>{if(window.confirm("Delete "+d.client+"?"))delDeal(d.id);}} style={{background:"#fef2f2",border:"none",borderRadius:5,padding:"4px 6px",fontSize:".68rem",color:"#dc2626",cursor:"pointer",fontWeight:600,fontFamily:"inherit"}} title="Delete">✕</button>}
                <button onClick={()=>{const reason=window.prompt("Reason for not winning (optional):");if(reason===null)return;upDeals(ds=>ds.map(x=>x.id===d.id?{...x,stage:"Did Not Win",notes:(x.notes||"")+(reason?"\n[DID NOT WIN "+today+"]: "+reason:"\n[DID NOT WIN "+today+"]")}:x));logActivity(d.id,"Did Not Win",d.client+" — did not win");toastEmit("Moved to Did Not Win.");}} style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:5,padding:"4px 5px",fontSize:".68rem",color:"#94a3b8",cursor:"pointer",fontFamily:"inherit"}} title="Did Not Win">✗</button>
              </div>
            </div>
          );

          const PipeTableHeader=()=>(
            <div style={{display:"flex",padding:"6px 12px",background:"#f8fafc",borderBottom:"1px solid #e2e8f0",fontSize:".62rem",fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:".4px"}}>
              <span style={{flex:1}}>Client / CE</span>
              <span style={{width:44,textAlign:"right"}}>Value</span>
              <span style={{width:90,textAlign:"right"}}>Actions</span>
            </div>
          );

          return(
            <div>
              {/* 🔥 Hot + 🧊 Cold — side by side compact tables */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:20}}>
                {/* Hot */}
                <div>
                  <div style={{fontWeight:700,color:"#0f172a",fontSize:".84rem",marginBottom:7,display:"flex",alignItems:"center",gap:6}}>
                    🔥 Hot Pipeline
                    <span style={{fontWeight:400,color:"#94a3b8",fontSize:".72rem"}}>({hotDeals.length} · ≤15 days)</span>
                  </div>
                  <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",overflow:"hidden"}}>
                    <PipeTableHeader/>
                    <div style={{maxHeight:300,overflowY:"auto"}}>
                      {hotDeals.length===0&&<div style={{padding:"16px",textAlign:"center",color:"#94a3b8",fontSize:".78rem"}}>{pipeSearch?"No match.":"No new deals this period."}</div>}
                      {hotDeals.map((d,i)=><PipeRow key={d.id} d={d} list={hotDeals} i={i}/>)}
                    </div>
                  </div>
                </div>
                {/* Cold */}
                <div>
                  <div style={{fontWeight:700,color:"#0f172a",fontSize:".84rem",marginBottom:7,display:"flex",alignItems:"center",gap:6}}>
                    🧊 Cold Pipeline
                    <span style={{fontWeight:400,color:"#94a3b8",fontSize:".72rem"}}>({coldDeals.length} · &gt;15 days)</span>
                  </div>
                  <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",overflow:"hidden",opacity:coldDeals.length?1:0.6}}>
                    <PipeTableHeader/>
                    <div style={{maxHeight:300,overflowY:"auto"}}>
                      {coldDeals.length===0&&<div style={{padding:"16px",textAlign:"center",color:"#94a3b8",fontSize:".78rem"}}>{pipeSearch?"No match.":"All deals active — great work!"}</div>}
                      {coldDeals.map((d,i)=><PipeRow key={d.id} d={d} list={coldDeals} i={i}/>)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Awarded Projects */}
              <div style={{fontWeight:700,color:"#0f172a",fontSize:".88rem",marginBottom:12,display:"flex",alignItems:"center",gap:8}}>
                <span style={{width:10,height:10,borderRadius:"50%",background:"#059669",display:"inline-block"}}/>
                Awarded Projects ({wonDeals.length})
              </div>
              <div style={{background:"#fff",borderRadius:14,border:"1.5px solid #e2e8f0",overflow:"hidden",marginBottom:16}}>
                {wonDeals.length===0&&(
                  <div style={{padding:"24px 0",textAlign:"center",color:"#94a3b8",fontSize:".82rem"}}>No awarded projects yet. Use the 🏆 Award button above to award a deal.</div>
                )}
                {wonDeals.map(d=>{
                  const jo=jos.find(j=>j.dealId===d.id);
                  const proj=projs[d.id];
                  const inv=Number(d.invoiced)||0;
                  const paid=Number(d.amountPaid)||0;
                  const bal=inv-paid;
                  const pct=inv>0?Math.min(100,Math.round(paid/inv*100)):0;
                  const od=d.dueDate&&d.dueDate<today&&d.paymentStatus!=="Paid";
                  const teamAE=jo?.aeAssigned||d.salesOwner||"";
                  const teamPM=[jo?.pm1,jo?.pm2,jo?.pm3].filter(Boolean).join(", ");
                  const teamCoor=jo?.coordinator||"";
                  const teamDesigner=proj?.design?.designer||"";
                  return(
                    <div key={d.id} style={{padding:"14px 18px",borderBottom:"1px solid #f1f5f9",transition:"background .1s"}}
                      onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"}
                      onMouseLeave={e=>e.currentTarget.style.background="#fff"}>
                      {/* Row 1: client + value + payment */}
                      <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
                        <div style={{flex:1,minWidth:160}}>
                          <div style={{fontWeight:700,color:"#0f172a",fontSize:".88rem"}}>{d.client}</div>
                          <div style={{fontSize:".73rem",color:"#64748b",marginTop:2}}>{d.contact||d.product}</div>
                          {(()=>{const da=addenda.filter(a=>a.projectId===d.id&&a.status!=="Rejected");return da.length>0?<div style={{fontSize:".7rem",color:"#f59e0b",marginTop:2}}>⚠️ {da.length} addendum{da.length>1?"a":""} · +₱{da.reduce((s,a)=>s+Number(a.value||0),0).toLocaleString("en-PH")}</div>:null;})()}
                        </div>
                        <div style={{minWidth:100,textAlign:"right"}}>
                          <div style={{fontWeight:700,color:"#10b981",fontSize:".9rem"}}>{fmtK(Number(d.value))}</div>
                          <div style={{fontSize:".68rem",color:"#94a3b8"}}>Contract value</div>
                        </div>
                        <div style={{minWidth:160}}>
                          <div style={{display:"flex",justifyContent:"space-between",fontSize:".7rem",color:"#94a3b8",marginBottom:3}}>
                            <span>{fmtK(paid)} collected</span>
                            <span style={{fontWeight:700,color:pct===100?"#059669":"#64748b"}}>{pct}%</span>
                          </div>
                          <div style={{height:6,background:"#f1f5f9",borderRadius:3,overflow:"hidden"}}>
                            <div style={{height:"100%",width:pct+"%",background:pct===100?"#059669":"#10b981",borderRadius:3,transition:"width .5s"}}/>
                          </div>
                          {od&&<div style={{fontSize:".67rem",color:"#ef4444",marginTop:3,fontWeight:600}}>⚠ Overdue since {d.dueDate}</div>}
                        </div>
                        <div style={{minWidth:100,textAlign:"right"}}>
                          <Badge label={d.paymentStatus} color={PAY_CLR[d.paymentStatus]}/>
                          {bal>0&&<div style={{fontSize:".7rem",color:"#ef4444",marginTop:3,fontWeight:600}}>{fmtK(bal)} due</div>}
                        </div>
                        <div style={{display:"flex",gap:6}}>
                          <button onClick={()=>openEditDeal(d)} style={{background:"#f1f5f9",border:"none",borderRadius:7,padding:"5px 11px",fontSize:".73rem",color:"#475569",cursor:"pointer",fontWeight:600,fontFamily:"inherit"}}>✏ Edit</button>
                          {role==="Manager"&&<button onClick={()=>{if(window.confirm("Delete "+d.client+"? This removes the deal, project card, checklist, and JO."))delDeal(d.id);}} style={{background:"#fef2f2",border:"none",borderRadius:7,padding:"5px 10px",fontSize:".73rem",color:"#dc2626",cursor:"pointer",fontWeight:600,fontFamily:"inherit"}}>✕</button>}
                        </div>
                      </div>
                      {/* Row 2: assigned team */}
                      {(teamAE||teamPM||teamCoor||teamDesigner)&&(
                        <div style={{display:"flex",gap:16,marginTop:8,flexWrap:"wrap"}}>
                          {teamAE&&<span style={{fontSize:".7rem",color:"#475569"}}>🧑‍💼 AE: <strong>{teamAE}</strong></span>}
                          {teamPM&&<span style={{fontSize:".7rem",color:"#475569"}}>🔨 PM: <strong>{teamPM}</strong></span>}
                          {teamCoor&&<span style={{fontSize:".7rem",color:"#475569"}}>📋 Coor: <strong>{teamCoor}</strong></span>}
                          {teamDesigner&&<span style={{fontSize:".7rem",color:"#475569"}}>🎨 Designer: <strong>{teamDesigner}</strong></span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Did Not Win */}
              {(()=>{
                const dnw=deals.filter(d=>d.stage==="Did Not Win");
                if(!dnw.length) return null;
                return(
                  <div style={{marginTop:8}}>
                    <div style={{fontWeight:700,color:"#0f172a",fontSize:".88rem",marginBottom:12,display:"flex",alignItems:"center",gap:8}}>
                      <span style={{width:10,height:10,borderRadius:"50%",background:"#94a3b8",display:"inline-block"}}/>
                      Did Not Win ({dnw.length})
                    </div>
                    <div style={{background:"#fff",borderRadius:14,border:"1.5px solid #e2e8f0",overflow:"hidden",marginBottom:16}}>
                      <div style={{display:"grid",gridTemplateColumns:"2fr 1.5fr 1fr 0.8fr 80px",gap:12,padding:"10px 18px",background:"#f8fafc",borderBottom:"1.5px solid #e2e8f0",fontSize:".68rem",fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:".5px"}}>
                        <span>Client / Project</span><span>CE Info</span><span>AE</span><span>Value</span><span/>
                      </div>
                      {dnw.map((d,i)=>(
                        <div key={d.id} style={{display:"grid",gridTemplateColumns:"2fr 1.5fr 1fr 0.8fr 80px",gap:12,padding:"11px 18px",borderBottom:i<dnw.length-1?"1px solid #f1f5f9":"none",alignItems:"center",opacity:.75}}>
                          <div>
                            <div style={{fontWeight:600,color:"#475569",fontSize:".85rem"}}>{d.client}</div>
                            {d.contact&&<div style={{fontSize:".72rem",color:"#94a3b8"}}>{d.contact}</div>}
                          </div>
                          <div>
                            {d.ceNo&&<div style={{fontSize:".78rem",color:"#64748b",fontWeight:600}}>{d.ceNo}</div>}
                            <div style={{fontSize:".72rem",color:"#94a3b8"}}>{d.ceType||"—"}</div>
                          </div>
                          <div style={{fontSize:".78rem",color:"#64748b"}}>👤 {d.salesOwner||"—"}</div>
                          <div style={{fontWeight:600,color:"#94a3b8",fontSize:".85rem"}}>{d.value?fmtK(Number(d.value)):"—"}</div>
                          <div style={{display:"flex",gap:5}}>
                            <button onClick={()=>openEditDeal(d)} style={{background:"#f1f5f9",border:"none",borderRadius:6,padding:"4px 8px",fontSize:".7rem",color:"#94a3b8",cursor:"pointer",fontFamily:"inherit"}}>✏</button>
                            <button onClick={()=>{upDeals(ds=>ds.map(x=>x.id===d.id?{...x,stage:"01 · BizDev"}:x));toastEmit("Moved back to pipeline.");}} style={{background:"#f0fdf4",border:"1px solid #6ee7b7",borderRadius:6,padding:"4px 8px",fontSize:".7rem",color:"#059669",cursor:"pointer",fontFamily:"inherit",fontWeight:700}} title="Move back to pipeline">↩</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Cancelled */}
              {deals.filter(d=>d.stage==="Cancelled").length>0&&(
                <details style={{marginTop:4}}>
                  <summary style={{cursor:"pointer",fontSize:".75rem",color:"#94a3b8",fontWeight:600,padding:"6px 0"}}>
                    Cancelled ({deals.filter(d=>d.stage==="Cancelled").length})
                  </summary>
                  <div style={{marginTop:6}}>
                  {deals.filter(d=>d.stage==="Cancelled").map(d=>(
                    <div key={d.id} style={{display:"flex",justifyContent:"space-between",padding:"8px 12px",background:"#f8fafc",borderRadius:8,marginBottom:4,opacity:.55}}>
                      <span style={{fontSize:".8rem",color:"#64748b"}}>{d.client}{d.contact?" · "+d.contact:""}</span>
                      <span style={{fontSize:".8rem",color:"#94a3b8"}}>{d.value?fmtK(Number(d.value)):"—"}</span>
                    </div>
                  ))}
                  </div>
                </details>
              )}
            </div>
          );
        })()}

        {/* ── SALES: Award Request Modal ──────────────────────────────────── */}
        {awardReqModal&&(
          <Modal open title={`🏆 Request Award — ${awardReqModal.client}`} onClose={()=>setAwardReqModal(null)} wide>
            {/* Step indicator */}
            <div style={{display:"flex",gap:0,marginBottom:22,borderRadius:10,overflow:"hidden",border:"1.5px solid #e2e8f0"}}>
              {[["1","Award Details","#f59e0b"],["2","Scope & Team","#10b981"]].map(([num,label,clr],i)=>{
                const active=awardReqStep===i+1;
                const done=awardReqStep>i+1;
                return(
                  <div key={num} onClick={()=>done&&setAwardReqStep(i+1)}
                    style={{flex:1,padding:"12px 8px",textAlign:"center",background:active?clr:done?"#f8fafc":"#fff",cursor:done?"pointer":"default",borderRight:i<1?"1px solid #e2e8f0":"none"}}>
                    <div style={{fontSize:".82rem",fontWeight:700,color:active?"#fff":done?"#374151":"#cbd5e1"}}>{num}. {label}</div>
                    <div style={{fontSize:".68rem",color:active?"rgba(255,255,255,.75)":done?"#10b981":"#e2e8f0",marginTop:2}}>{done?"✓ Done":active?"In progress":"—"}</div>
                  </div>
                );
              })}
            </div>

            {/* Deal summary banner */}
            <div style={{background:"#fffbeb",border:"1.5px solid #fde68a",borderRadius:10,padding:"10px 16px",marginBottom:18,display:"flex",gap:20,flexWrap:"wrap",fontSize:".82rem"}}>
              <span><span style={{color:"#92400e"}}>Client: </span><strong>{awardReqModal.client}</strong></span>
              {awardReqModal.contact&&<span><span style={{color:"#92400e"}}>Project: </span><strong>{awardReqModal.contact}</strong></span>}
              {awardReqModal.ceNo&&<span><span style={{color:"#92400e"}}>CE No: </span><strong>{awardReqModal.ceNo}</strong></span>}
              {awardReqModal.value&&<span><span style={{color:"#92400e"}}>Value: </span><strong>₱{Number(awardReqModal.value).toLocaleString("en-PH")}</strong></span>}
            </div>

            {/* ── STEP 1: Award Details ── */}
            {awardReqStep===1&&(
              <div>
                <div style={{background:"#eff6ff",border:"1.5px solid #bfdbfe",borderRadius:10,padding:"10px 14px",marginBottom:18,fontSize:".8rem",color:"#1d4ed8"}}>
                  📋 Fill in what confirmed this award. Your information will be pre-loaded for Paulo when he approves.
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                  <Fld label="Award Trigger" required hint="What officially confirmed this project?">
                    <Sel value={awardReqForm.awardTrigger} onChange={e=>setAwardReqForm(p=>({...p,awardTrigger:e.target.value}))}>
                      {["CE Signed by Client","Purchase Order Received","Downpayment Received","Verbal Confirmation (to be followed by written)","Letter of Intent Received"].map(t=><option key={t}>{t}</option>)}
                    </Sel>
                  </Fld>
                  <Fld label="Date Confirmed">
                    <Inp type="date" value={awardReqForm.triggerDate} onChange={e=>setAwardReqForm(p=>({...p,triggerDate:e.target.value}))}/>
                  </Fld>
                  <div style={{gridColumn:"1/-1"}}>
                    <Fld label="Reference / Notes" hint="PO number, email thread, verbal confirmation details, etc.">
                      <Inp rows={2} value={awardReqForm.triggerNote} onChange={e=>setAwardReqForm(p=>({...p,triggerNote:e.target.value}))} placeholder="e.g. PO No. 2026-0187 received via email from Karen Santos on May 25…"/>
                    </Fld>
                  </div>
                </div>
                <div style={{display:"flex",justifyContent:"flex-end",marginTop:18}}>
                  <button onClick={()=>setAwardReqStep(2)}
                    style={{background:"#f59e0b",border:"none",borderRadius:10,padding:"11px 28px",fontFamily:"inherit",fontWeight:700,fontSize:".88rem",color:"#fff",cursor:"pointer"}}>
                    Next: Scope & Team →
                  </button>
                </div>
              </div>
            )}

            {/* ── STEP 2: Scope & Team ── */}
            {awardReqStep===2&&(
              <div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                  <Fld label="AE (Account Executive)" hint="Client relationship owner — usually you">
                    <Sel value={awardReqForm.aeAssigned} onChange={e=>setAwardReqForm(p=>({...p,aeAssigned:e.target.value}))}>
                      <option value="">— Select AE —</option>
                      {SALES_TEAM.map(m=><option key={m}>{m}</option>)}
                    </Sel>
                  </Fld>
                  <Fld label="Suggested PM" hint="Optional — Paulo will assign the PM but your input helps">
                    <Sel value={awardReqForm.pm1Suggestion} onChange={e=>setAwardReqForm(p=>({...p,pm1Suggestion:e.target.value}))}>
                      <option value="">— Optional suggestion —</option>
                      {OPS_TEAM.map(m=><option key={m}>{m}</option>)}
                    </Sel>
                  </Fld>
                  <div style={{gridColumn:"1/-1"}}>
                    <Fld label="Scope of Work" required hint="What exactly is being built? Be as specific as possible.">
                      <Inp rows={4} value={awardReqForm.scopeNotes} onChange={e=>setAwardReqForm(p=>({...p,scopeNotes:e.target.value}))} placeholder="e.g. Full retail fit-out Unit 3B SM Megamall — custom shelving, signage (2 lightboxes + letters), 4 display gondolas, 8 downlights…"/>
                    </Fld>
                  </div>
                  <div style={{gridColumn:"1/-1"}}>
                    <Fld label="Special Instructions / Venue Requirements" hint="Delivery restrictions, permit requirements, client contacts on site">
                      <Inp rows={3} value={awardReqForm.specialInstructions} onChange={e=>setAwardReqForm(p=>({...p,specialInstructions:e.target.value}))} placeholder="e.g. SM Megamall: night delivery only 10PM–6AM, GS permit required. Client contact on site: Kat Santos +63917…"/>
                    </Fld>
                  </div>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:18}}>
                  <button onClick={()=>setAwardReqStep(1)}
                    style={{background:"#f1f5f9",border:"none",borderRadius:10,padding:"10px 20px",fontFamily:"inherit",fontWeight:600,fontSize:".84rem",color:"#475569",cursor:"pointer"}}>
                    ← Back
                  </button>
                  <button
                    disabled={!awardReqForm.scopeNotes}
                    onClick={()=>{
                      const d=awardReqModal;
                      upDeals(ds=>ds.map(x=>x.id===d.id?{...x,
                        awardRequestData:{...awardReqForm},
                        notes:(x.notes||"")+`\n[AWARD REQUEST ${today}]: ${session?.name||"Sales"} flagged for award. Trigger: ${awardReqForm.awardTrigger}. AE: ${awardReqForm.aeAssigned||"—"}. Suggested PM: ${awardReqForm.pm1Suggestion||"—"}.`
                      }:x));
                      logActivity(d.id,"Award Requested",`${d.client} flagged by ${session?.name||"Sales"} — ${awardReqForm.awardTrigger}`);
                      sendTelegramNotification("management",`🏆 <b>Award Request — Action Needed</b>\nClient: <b>${d.client}</b>\n${d.ceNo?`CE: ${d.ceNo} · `:""}₱${Number(d.value||0).toLocaleString("en-PH")}\nTrigger: ${awardReqForm.awardTrigger}\nRequested by: ${session?.name||"Sales"}\nScope: ${awardReqForm.scopeNotes||"—"}\n\nOpen FabHub → Pipeline to Review & Award.`);
                      toastEmit("Award request submitted — Paulo will review and confirm.");
                      setAwardReqModal(null);
                    }}
                    style={{background:awardReqForm.scopeNotes?"#059669":"#e2e8f0",border:"none",borderRadius:10,padding:"12px 28px",fontFamily:"inherit",fontWeight:800,fontSize:".9rem",color:awardReqForm.scopeNotes?"#fff":"#94a3b8",cursor:awardReqForm.scopeNotes?"pointer":"not-allowed",letterSpacing:".3px"}}>
                    🏆 Submit for Manager Approval
                  </button>
                </div>
              </div>
            )}
          </Modal>
        )}

        {/* Award Confirmation Modal */}
        {awardModal&&(
          <Modal open title={`🏆 Award — ${awardModal.client}`} onClose={()=>setAwardModal(null)} wide>

            {/* Step indicator — 2 steps only, QS budget is separate */}
            <div style={{display:"flex",gap:0,marginBottom:22,borderRadius:10,overflow:"hidden",border:"1.5px solid #e2e8f0"}}>
              {[["1","Confirm Award","#10b981",awardStep>=1],["2","Job Order","#3b82f6",awardStep>=2]].map(([num,label,clr,active],i)=>(
                <div key={num} onClick={()=>awardStep>i+1&&setAwardStep(i+1)}
                  style={{flex:1,padding:"12px 8px",textAlign:"center",background:awardStep===i+1?clr:active?"#f8fafc":"#fff",cursor:awardStep>i+1?"pointer":"default",borderRight:i<1?"1px solid #e2e8f0":"none"}}>
                  <div style={{fontSize:".82rem",fontWeight:700,color:awardStep===i+1?"#fff":active?"#374151":"#cbd5e1"}}>{num}. {label}</div>
                  <div style={{fontSize:".68rem",color:awardStep===i+1?"rgba(255,255,255,.75)":awardStep>i+1?"#10b981":"#e2e8f0",marginTop:2}}>{awardStep>i+1?"✓ Done":awardStep===i+1?"In progress":"—"}</div>
                </div>
              ))}
            </div>

            {/* ── STEP 1: Confirm Award — Sales fills ─────────────────────── */}
            {awardStep===1&&(
              <div>
                <div style={{background:"#f0fdf4",border:"1.5px solid #6ee7b7",borderRadius:12,padding:"14px 18px",marginBottom:20}}>
                  <div style={{fontWeight:700,color:"#059669",marginBottom:8,fontSize:".9rem"}}>Confirming this award will:</div>
                  <div style={{fontSize:".82rem",color:"#065f46",lineHeight:2}}>
                    ✓ Move to <strong>Stage 06 · Project Kickoff</strong><br/>
                    ✓ Issue a <strong>Job Order</strong> to all departments<br/>
                    ✓ Create a <strong>Project Card</strong> — all depts start their task checklists<br/>
                    ✓ Notify <strong>Finance</strong> to set up billing milestones<br/>
                    ✓ Flag <strong>QS</strong> to set the budget target in Cost Analysis
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                  <Fld label="Award Trigger" required hint="What officially confirmed this project?">
                    <Sel value={awardForm.awardTrigger} onChange={e=>setAwardForm(p=>({...p,awardTrigger:e.target.value}))}>
                      {["CE Signed by Client","Purchase Order Received","Downpayment Received","Verbal Confirmation (to be followed by written)","Letter of Intent Received"].map(t=><option key={t}>{t}</option>)}
                    </Sel>
                  </Fld>
                  <Fld label="Date Confirmed">
                    <Inp type="date" value={awardForm.triggerDate} onChange={e=>setAwardForm(p=>({...p,triggerDate:e.target.value}))}/>
                  </Fld>
                  <div style={{gridColumn:"1/-1"}}>
                    <Fld label="Notes" hint="PO number, email confirmation details, etc. (optional)">
                      <Inp rows={2} value={awardForm.triggerNote} onChange={e=>setAwardForm(p=>({...p,triggerNote:e.target.value}))} placeholder="e.g. PO No. 2026-0187 received via email from client@email.com on May 18…"/>
                    </Fld>
                  </div>
                </div>
                {/* Payment notice */}
                <div style={{background:"#eff6ff",border:"1.5px solid #93c5fd",borderRadius:10,padding:"10px 14px",marginTop:14,fontSize:".8rem",color:"#1d4ed8"}}>
                  💳 <strong>Payment status will be set to Unpaid.</strong> Finance will receive a notification to set up billing milestones and track collections.
                </div>
                <div style={{display:"flex",justifyContent:"flex-end",marginTop:18}}>
                  <button onClick={()=>setAwardStep(2)}
                    style={{background:"#1e293b",border:"none",borderRadius:10,padding:"11px 28px",fontFamily:"inherit",fontWeight:700,fontSize:".88rem",color:"#fff",cursor:"pointer"}}>
                    Next: Job Order →
                  </button>
                </div>
              </div>
            )}

            {/* ── STEP 2: Job Order — Ops/Manager/Sales fills ─────────────── */}
            {awardStep===2&&(
              <div>
                <div style={{background:"#eff6ff",border:"1.5px solid #93c5fd",borderRadius:12,padding:"12px 16px",marginBottom:18,fontSize:".82rem",color:"#1d4ed8"}}>
                  📋 This Job Order is the official start signal. Once issued, every department sees a new project in their queue.
                  <strong> QS (Rodney) will set the budget target separately in Cost Analysis.</strong>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>

                  {/* PM fields — up to 3 */}
                  <Fld label="Project Manager 1" required hint="Primary PM — owns day-to-day execution">
                    <Sel value={awardForm.pm1} onChange={e=>setAwardForm(p=>({...p,pm1:e.target.value}))}>
                      <option value="">— Assign PM —</option>
                      {OPS_TEAM.map(m=><option key={m}>{m}</option>)}
                    </Sel>
                  </Fld>
                  <Fld label="Project Manager 2" hint="For large scope — second PM">
                    <Sel value={awardForm.pm2} onChange={e=>setAwardForm(p=>({...p,pm2:e.target.value}))}>
                      <option value="">— Optional —</option>
                      {OPS_TEAM.map(m=><option key={m}>{m}</option>)}
                    </Sel>
                  </Fld>
                  <Fld label="Coordinator" hint="Handles logistics, permits, site coordination">
                    <Sel value={awardForm.coordinator} onChange={e=>setAwardForm(p=>({...p,coordinator:e.target.value}))}>
                      <option value="">— Optional —</option>
                      {OPS_TEAM.map(m=><option key={m}>{m}</option>)}
                    </Sel>
                  </Fld>
                  <Fld label="PM 3 / Support" hint="Additional PM for complex multi-site projects">
                    <Sel value={awardForm.pm3} onChange={e=>setAwardForm(p=>({...p,pm3:e.target.value}))}>
                      <option value="">— Optional —</option>
                      {OPS_TEAM.map(m=><option key={m}>{m}</option>)}
                    </Sel>
                  </Fld>

                  {/* AE + dates */}
                  <Fld label="Account Executive (AE)" hint="Client relationship owner — pre-filled from deal, change if needed">
                    <Sel value={awardForm.aeAssigned} onChange={e=>setAwardForm(p=>({...p,aeAssigned:e.target.value}))}>
                      <option value="">— Assign AE —</option>
                      {SALES_TEAM.map(m=><option key={m}>{m}</option>)}
                    </Sel>
                  </Fld>
                  <Fld label="Target Opening">
                    <Inp type="date" value={awardForm.startDate} onChange={e=>setAwardForm(p=>({...p,startDate:e.target.value}))}/>
                  </Fld>

                  {/* Comms */}
                  <div style={{gridColumn:"1/-1"}}>
                    <Fld label="Comms Group Link" hint="WhatsApp or Viber group — add all stakeholders">
                      <Inp value={awardForm.commsLink} onChange={e=>setAwardForm(p=>({...p,commsLink:e.target.value}))} placeholder="https://chat.whatsapp.com/…"/>
                    </Fld>
                  </div>

                  {/* Scope */}
                  <div style={{gridColumn:"1/-1"}}>
                    <Fld label="Scope of Work" required hint="Sales + PM align on this together — what exactly is being built?">
                      <Inp rows={4} value={awardForm.scopeNotes} onChange={e=>setAwardForm(p=>({...p,scopeNotes:e.target.value}))} placeholder="e.g. Full retail fit-out Unit 3B SM Megamall — custom shelving, signage (2 lightboxes + letters), 4 display gondolas, electrical (8 downlights, 2 track lights)"/>
                    </Fld>
                  </div>

                  {/* Special instructions */}
                  <div style={{gridColumn:"1/-1"}}>
                    <Fld label="Special Instructions / Venue Requirements"
                      hint="Delivery restrictions, permit requirements, mall rules, client preferences (Venue Memory coming soon)">
                      <Inp rows={3} value={awardForm.specialInstructions} onChange={e=>setAwardForm(p=>({...p,specialInstructions:e.target.value}))} placeholder="e.g. SM Megamall: night delivery only 10PM-6AM, GS permit required 2 weeks before. Client contact on site: Kat Santos +63917-xxx-xxxx"/>
                    </Fld>
                    <div style={{fontSize:".7rem",color:"#94a3b8",marginTop:4,fontStyle:"italic"}}>
                      💡 Venue Memory (SM, Ayala, Robinsons requirements) — coming in a future update
                    </div>
                  </div>
                </div>

                {/* JO Preview */}
                {awardForm.pm1&&(
                  <div style={{background:"#f8fafc",borderRadius:10,border:"1.5px solid #e2e8f0",padding:"12px 16px",marginTop:14}}>
                    <div style={{fontSize:".7rem",fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:".8px",marginBottom:8}}>JO Preview</div>
                    <div style={{display:"flex",gap:20,flexWrap:"wrap",fontSize:".8rem"}}>
                      <div><span style={{color:"#94a3b8"}}>Client: </span><strong>{awardModal.client}</strong></div>
                      <div><span style={{color:"#94a3b8"}}>CE: </span><strong>{awardModal.ceNo||"TBA"}</strong></div>
                      <div><span style={{color:"#94a3b8"}}>PM: </span><strong>{[awardForm.pm1,awardForm.pm2,awardForm.pm3].filter(Boolean).join(", ")}</strong></div>
                      {awardForm.coordinator&&<div><span style={{color:"#94a3b8"}}>Coordinator: </span><strong>{awardForm.coordinator}</strong></div>}
                      <div><span style={{color:"#94a3b8"}}>AE: </span><strong>{awardForm.aeAssigned||"—"}</strong></div>
                      <div><span style={{color:"#f59e0b",fontWeight:700}}>⏳ QS Budget: Pending</span></div>
                    </div>
                  </div>
                )}

                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:18}}>
                  <button onClick={()=>setAwardStep(1)}
                    style={{background:"#f1f5f9",border:"none",borderRadius:10,padding:"10px 20px",fontFamily:"inherit",fontWeight:600,fontSize:".84rem",color:"#475569",cursor:"pointer"}}>
                    ← Back
                  </button>
                  <button onClick={confirmAward} disabled={!awardForm.pm1||!awardForm.scopeNotes}
                    style={{background:awardForm.pm1&&awardForm.scopeNotes?"#059669":"#e2e8f0",border:"none",borderRadius:10,padding:"12px 28px",fontFamily:"inherit",fontWeight:800,fontSize:".9rem",color:awardForm.pm1&&awardForm.scopeNotes?"#fff":"#94a3b8",cursor:awardForm.pm1&&awardForm.scopeNotes?"pointer":"not-allowed",letterSpacing:".3px"}}>
                    🏆 Confirm Award & Issue Job Order
                  </button>
                </div>
              </div>
            )}
          </Modal>
        )}

        <DealModal open={dealModal} onClose={()=>setDealModal(false)} form={dealForm} setForm={setDealForm} onSave={saveDeal} editId={editDeal}/>
      </Wrap>
    );

    if(page==="finance") return(
      <Wrap>
        <DailyCashPosition
          cashPositions={cashPositions}
          saveDayPos={saveDayPos}
          infs={infs}
          wonDeals={wonDeals}
          totRev={totRev}
          totExp={totExp}
          totColl={totColl}
          totOut={totOut}
        />
        <div style={{marginTop:24,display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
          <KPI label="Revenue"      value={fmtK(totRev)}         color="#3b82f6"/>
          <KPI label="Expenses"     value={fmtK(totExp)}         color="#ef4444"/>
          <KPI label="Gross Profit" value={fmtK(totRev-totExp)}  color={totRev-totExp>=0?"#059669":"#ef4444"}/>
          <KPI label="Collected"    value={fmtK(totColl)}        color="#10b981" sub={`${fmtK(totOut)} out`}/>
        </div>
        <SecHead title="Collections" sub="Payment tracking for all awarded projects"/>
        <CollectionsPanel wonDeals={wonDeals} infs={infs} onUpdatePayment={updatePayment} onLogPayment={logPayment} readonly={role==="Sales"||role==="QS"||role==="Procurement"||role==="Operations"||role==="Design"}/>
        <div style={{marginTop:24}}>
          <SecHead title="Recent Expenses" sub="Recorded by Accounting — view only"/>
          {exps.slice(-10).reverse().map(e=>(
            <Card key={e.id}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
                <div style={{flex:1}}>
                  <div style={{display:"flex",gap:7,alignItems:"center",flexWrap:"wrap",marginBottom:4}}>
                    <Badge label={e.category} color="#64748b"/>
                    {e.projectId?<Badge label={clientName(e.projectId)} color="#8b5cf6"/>:<Badge label="Company-wide" color="#94a3b8"/>}
                  </div>
                  <div style={{fontWeight:600,color:"#0f172a"}}>{e.note}</div>
                  <div style={{fontSize:".72rem",color:"#94a3b8",marginTop:3}}>{MONTHS[e.month]}</div>
                  {e.receipt&&<a href={e.receipt} target="_blank" rel="noreferrer" style={{fontSize:".72rem",color:"#3b82f6",marginTop:3,display:"block"}}>📎 Receipt</a>}
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontWeight:800,color:"#ef4444",fontSize:"1.05rem"}}>{fmt(e.amount)}</div>
                  <div style={{display:"flex",gap:6,marginTop:8}}><Btn small variant="ghost" onClick={()=>openEditExp(e)}>✏ Edit</Btn><Btn small variant="danger" onClick={()=>delExp(e.id)}>Delete</Btn></div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </Wrap>
    );
    if(page==="ops") return <OpsView projs={projs} projList={projList} deals={deals} selProj={selProj} setSelProj={setSelProj} opsTab={opsTab} setOpsTab={setOpsTab} proj={proj} projDeal={projDeal} upProj={upProj} overallProg={overallProg} costOf={costOf} marginOf={marginOf} openDesignEdit={openDesignEdit} swatches={swatches} swQ={swQ} openAddSwatch={(pid,by)=>{setSwForm({projectId:pid,name:"",category:"Fabric",qty:"",unit:"pcs",supplier:"",estCost:"",swatchLink:"",addedBy:by||"Ops",status:"To Buy",notes:""});setEditSw(null);setSwModal(true);}} openEditSwatch={sw=>{setSwForm({...sw});setEditSw(sw.id);setSwModal(true);}} delSwatch={id=>upSwatches(ss=>ss.filter(s=>s.id!==id))} exps={exps} openAddExp={openAddExp} openEditExp={openEditExp} delExp={delExp} clientName={clientName} matModal={matModal} setMatModal={setMatModal} matForm={matForm} setMatForm={setMatForm} editMat={editMat} setEditMat={setEditMat} saveMat={()=>{if(!matForm.name||!matForm.qty||!matForm.cost)return;const rec={...matForm,qty:Number(matForm.qty),cost:Number(matForm.cost),id:editMat||uid()};upProj(selProj,p=>({...p,materials:editMat?p.materials.map(m=>m.id===editMat?rec:m):[...p.materials,rec]}));setMatModal(false);setEditMat(null);setMatForm({name:"",qty:"",unit:"pcs",cost:"",received:false});}} addPmUpdate={addPmUpdate} addAddendum={addAddendum} updateAddendumStatus={updateAddendumStatus} session={session} Wrap={Wrap} addenda={addenda} addAddendum2={addAddendum2} updateAddendum={updateAddendum} deleteAddendum={deleteAddendum}/>;
    if(page==="procurement") return <ProcurementView swatches={swatches} projList={projList} clientName={clientName} openAddSwatch={(pid,by)=>{setSwForm({projectId:pid,name:"",category:"Fabric",qty:"",unit:"pcs",supplier:"",estCost:"",swatchLink:"",addedBy:by||"Design",status:"To Buy",notes:""});setEditSw(null);setSwModal(true);}} openEditSwatch={sw=>{setSwForm({...sw});setEditSw(sw.id);setSwModal(true);}} delSwatch={id=>upSwatches(ss=>ss.filter(s=>s.id!==id))} swQ={swQ} Wrap={Wrap}
        addenda={addenda} addAddendum2={addAddendum2} updateAddendum={updateAddendum} deleteAddendum={deleteAddendum}
        openAddExp={openAddExp} openEditExp={openEditExp} delExp={delExp} clientName={clientName}
        matModal={matModal} setMatModal={setMatModal} matForm={matForm} setMatForm={setMatForm}
        editMat={editMat} setEditMat={setEditMat} saveMat={saveMat}
        addPmUpdate={addPmUpdate} addAddendum={addAddendum} updateAddendumStatus={updateAddendumStatus}/>;
    if(page==="checklist") return <ChecklistView checklist={checklist} projList={projList} deals={deals} clientName={clientName} openAddCl={openAddCl} openEditCl={openEditCl} delCl={delCl} clStatusQ={clStatusQ} clModal={clModal} setClModal={setClModal} clForm={clForm} setClForm={setClForm} editCl={editCl} saveCl={saveCl} clProjF={clProjF} setClProjF={setClProjF} clTypeF={clTypeF} setClTypeF={setClTypeF} clStatF={clStatF} setClStatF={setClStatF} clDeptF={clDeptF} setClDeptF={setClDeptF} role={role} wonDeals={wonDeals} loadChecklistTemplate={loadChecklistTemplate} Wrap={Wrap}/>;
    if(page==="joborders") return <JOView deals={deals} wonDeals={wonDeals} projs={projs} jos={jos} joStep={joStep} setJoStep={setJoStep} joSel={joSel} setJoSel={setJoSel} joExtra={joExtra} setJoExtra={setJoExtra} viewJO={viewJO} setViewJO={setViewJO} issueJO={issueJO} overallProg={overallProg} Wrap={Wrap}/>;
    if(page==="checklist") return <ChecklistView checklist={checklist} projList={projList} deals={deals} clientName={clientName} openAddCl={openAddCl} openEditCl={openEditCl} delCl={delCl} clStatusQ={clStatusQ} clModal={clModal} setClModal={setClModal} clForm={clForm} setClForm={setClForm} editCl={editCl} saveCl={saveCl} clProjF={clProjF} setClProjF={setClProjF} clTypeF={clTypeF} setClTypeF={setClTypeF} clStatF={clStatF} setClStatF={setClStatF} clDeptF={clDeptF} setClDeptF={setClDeptF} role={role} wonDeals={wonDeals} loadChecklistTemplate={loadChecklistTemplate} Wrap={Wrap}/>;
    if(page==="budget") return(<Wrap><BudgetView wonDeals={wonDeals} budgets={budgets} saveBudget={saveBudget} prs={prs} exps={exps} role={role}/></Wrap>);
    if(page==="costing") return(<Wrap><CostingStudy wonDeals={wonDeals} budgets={budgets} prs={prs} exps={exps} projs={projs} role={role}/></Wrap>);
    if(page==="materialreq") return(<Wrap><MaterialRequestView mreqs={mreqs} addMR={addMR} updateMR={updateMR} prs={prs} addPR={addPR} wonDeals={wonDeals} session={session} role={role}/></Wrap>);
    if(page==="budgetreq") return(<Wrap><BudgetRequestView breqs={breqs} addBR={addBR} updateBR={updateBR} wonDeals={wonDeals} session={session} role={role}/></Wrap>);
    if(page==="swatchboard") return(<Wrap><ProcurementView swatches={swatches} projList={projList} clientName={clientName} openAddSwatch={openAddSwatch} openEditSwatch={openEditSwatch} delSwatch={id=>upSwatches(ss=>ss.filter(s=>s.id!==id))} swQ={swQ} Wrap={Wrap}/></Wrap>);
    if(page==="clients") return(
      <Wrap>
        <ClientDirectory deals={deals} session={session} role={role} vvipClients={vvipClients} toggleVvip={toggleVvip} customClients={customClients}/>
      </Wrap>
    );
    const ROLES=['Manager', 'Sales', 'Finance', 'Procurement', 'QS', 'Operations', 'Design', 'ProjectMover', 'Warehouse'];
    if(page==="accounts") return(
      <Wrap>
        <AccountsManager users={users} session={session} onApprove={approveUser} onReject={rejectUser} onDeactivate={deactivateUser} onDelete={deleteUser} onResetPw={resetPw} ROLES={ROLES}/>
      </Wrap>
    );
  
  


  // ─── SALES ────────────────────────────────────────────────────────────────
  if(role==="Sales"){
    if(page==="home") return(
      <Wrap>
        <SecHead title="My Pipeline" action={<Btn onClick={openAddDeal}>+ Add Deal</Btn>}/>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:20}}>
          <KPI label="Active Deals"    value={deals.filter(d=>d.stage!=="Lost").length}       color="#3b82f6"/>
          <KPI label="Won Revenue"     value={fmtK(wonDeals.reduce((s,d)=>s+d.value,0))}     color="#10b981"/>
          <KPI label="Follow-ups Due"  value={deals.filter(d=>d.followUp&&d.followUp<=today&&d.stage!=="Won"&&d.stage!=="Lost").length} color="#ef4444"/>
        </div>
        {deals.map(d=>(
          <Card key={d.id} accent={d.stage==="Lost"?"#fca5a5":d.stage==="Won"?"#6ee7b7":d.followUp&&d.followUp<today?"#fed7aa":undefined}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
              <div style={{flex:1}}>
                <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginBottom:5}}>
                  <span style={{fontWeight:700,fontSize:"1rem",color:"#0f172a"}}>{d.client}</span>
                  <Badge label={d.stage} color={STAGE_CLR[d.stage]}/>
                  {d.stage==="Won"&&<Badge label={d.paymentStatus} color={PAY_CLR[d.paymentStatus]}/>}
                </div>
                <div style={{fontSize:".78rem",color:"#64748b"}}>{d.product} · {d.contact}</div>
                {d.followUp&&<div style={{fontSize:".73rem",color:d.followUp<today&&d.stage!=="Won"&&d.stage!=="Lost"?"#ef4444":"#94a3b8",marginTop:5}}>📅 Follow-up: {d.followUp}{d.followUp<today&&d.stage!=="Won"?" — OVERDUE":""}</div>}
                {d.notes&&<div style={{fontSize:".73rem",color:"#94a3b8",marginTop:4,fontStyle:"italic"}}>{d.notes}</div>}
                {d.stage==="Won"&&d.invoiced>0&&(
                  <div style={{marginTop:10}}>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:".7rem",color:"#94a3b8",marginBottom:4}}>
                      <span>{fmt(d.amountPaid)} of {fmt(d.invoiced)} collected</span>
                      <span>{d.invoiced>0?Math.round(d.amountPaid/d.invoiced*100):0}%</span>
                    </div>
                    <ProgBar pct={d.invoiced>0?d.amountPaid/d.invoiced*100:0} color={d.amountPaid>=d.invoiced?"#059669":"#10b981"}/>
                  </div>
                )}
              </div>
              <div style={{textAlign:"right",flexShrink:0}}>
                <div style={{fontWeight:800,color:"#10b981",fontSize:"1.15rem"}}>{fmt(d.value)}</div>
                <div style={{display:"flex",gap:6,marginTop:8,justifyContent:"flex-end",flexWrap:"wrap"}}>
                  <Btn small variant="ghost" onClick={()=>openEditDeal(d)}>✏ Edit</Btn>
                  {role==="Manager"&&<Btn small variant="danger" onClick={()=>{if(window.confirm("Delete "+d.client+"?"))delDeal(d.id);}}>✕</Btn>}
                </div>
                <div style={{marginTop:8,minWidth:160}}>
                  <select value={d.stage} onChange={e=>stageQ(d.id,e.target.value)} style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"7px 10px",fontFamily:"inherit",fontSize:".78rem",color:"#0f172a",background:"#fff",cursor:"pointer"}}>
                    {DEAL_STAGES.map(s=><option key={s}>{s}</option>)}
                  </select>
                  {STAGE_OWNER[d.stage]&&<div style={{fontSize:".65rem",color:"#94a3b8",marginTop:3}}>📌 {STAGE_OWNER[d.stage]}</div>}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </Wrap>
    );
    if(page==="collections") return(
      <Wrap>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
        <SecHead title="Collections" sub="Track client payments for all awarded projects"/>
        <button onClick={()=>{
          const rows=[["Client","CE No","Milestone","Amount","Total Paid","Outstanding","Status","Due Date","Days Overdue","Bank"]];
          billings.forEach(b=>{
            const d=wonDeals.find(x=>x.id===b.dealId)||deals.find(x=>x.id===b.dealId);
            const totalPaid=(b.payments||[]).reduce((s,p)=>s+Number(p.amount||0),0);
            const outstanding=Math.max(0,Number(b.amount||0)-totalPaid);
            const daysOD=b.dueDate?Math.max(0,Math.floor((new Date()-new Date(b.dueDate))/(1000*60*60*24))):0;
            const banks=[...new Set((b.payments||[]).map(p=>p.bank).filter(Boolean))].join("/");
            rows.push([d?.client||"",d?.ceNo||"",b.name||"",
              Number(b.amount||0).toFixed(2),totalPaid.toFixed(2),outstanding.toFixed(2),
              b.status||"Unpaid",b.dueDate||"",daysOD,banks]);
          });
          const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
          const a=document.createElement("a");
          a.href="data:text/csv;charset=utf-8,"+encodeURIComponent("\uFEFF"+csv);
          a.download=`GMD_Collections_${today}.csv`;a.click();
        }} style={{background:"#eff6ff",border:"1.5px solid #bfdbfe",borderRadius:8,padding:"7px 14px",fontFamily:"inherit",fontSize:".78rem",fontWeight:700,color:"#1d4ed8",cursor:"pointer",flexShrink:0}}>
          ⬇ Export CSV
        </button>
      </div>
      {/* Aging Summary */}
      {(()=>{
        const now=new Date();
        const aging={current:0,d30:0,d60:0,d90:0,over90:0};
        billings.forEach(b=>{
          const outstanding=Math.max(0,Number(b.amount||0)-(b.payments||[]).reduce((s,p)=>s+Number(p.amount||0),0));
          if(outstanding<=0||b.status==="Paid"||b.status==="Fully Paid") return;
          const days=b.dueDate?Math.floor((now-new Date(b.dueDate))/(1000*60*60*24)):0;
          if(days<=0)       aging.current+=outstanding;
          else if(days<=30) aging.d30+=outstanding;
          else if(days<=60) aging.d60+=outstanding;
          else if(days<=90) aging.d90+=outstanding;
          else              aging.over90+=outstanding;
        });
        const total=Object.values(aging).reduce((s,v)=>s+v,0);
        if(total===0) return null;
        return(
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8,marginBottom:16}}>
            {[["Current",aging.current,"#10b981"],["1–30 days",aging.d30,"#f59e0b"],
              ["31–60 days",aging.d60,"#f97316"],["61–90 days",aging.d90,"#ef4444"],["90+ days",aging.over90,"#dc2626"]
            ].map(([l,v,c])=>(
              <div key={l} style={{background:"#fff",border:`1.5px solid ${c}33`,borderRadius:10,padding:"12px 14px",textAlign:"center"}}>
                <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.1rem",color:c}}>
                  ₱{v.toLocaleString("en-PH",{minimumFractionDigits:0})}
                </div>
                <div style={{fontSize:".68rem",color:"#94a3b8",marginTop:3,textTransform:"uppercase",letterSpacing:".8px"}}>{l}</div>
              </div>
            ))}
          </div>
        );
      })()}
        {/* Priority call list */}
        {(()=>{
          const today2=new Date();
          const callList=wonDeals.map(d=>{
            const ms=billings.filter(b=>b.dealId===d.id&&b.status!=="Cancelled"&&b.status!=="Fully Paid");
            const totalDue=ms.reduce((s,m)=>{const p=(m.payments||[]).reduce((ps,pay)=>ps+Number(pay.amount||0),0);return s+Math.max(0,Number(m.amount||0)-p);},0);
            const mostOverdue=ms.filter(m=>m.dueDate&&m.dueDate<today).sort((a,b)=>new Date(a.dueDate)-new Date(b.dueDate))[0];
            const daysOverdue=mostOverdue?Math.floor((today2-new Date(mostOverdue.dueDate))/(1000*60*60*24)):null;
            return{d,totalDue,daysOverdue,msCount:ms.length};
          }).filter(x=>x.totalDue>0).sort((a,b)=>((b.daysOverdue||0)-(a.daysOverdue||0))||(b.totalDue-a.totalDue));
          if(!callList.length) return null;
          return(
            <div style={{background:"#fff",borderRadius:14,border:"1.5px solid #e2e8f0",marginBottom:16,overflow:"hidden"}}>
              <div style={{background:"#1e293b",padding:"12px 18px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontWeight:700,color:"#f59e0b",fontSize:".88rem"}}>📞 Priority Call List — ₱{callList.reduce((s,x)=>s+x.totalDue,0).toLocaleString("en-PH",{minimumFractionDigits:0})} outstanding</span>
                <span style={{fontSize:".72rem",color:"rgba(255,255,255,.5)"}}>{callList.length} clients to follow up</span>
              </div>
              {callList.slice(0,8).map(({d,totalDue,daysOverdue,msCount})=>(
                <div key={d.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 18px",borderBottom:"1px solid #f8fafc",flexWrap:"wrap",gap:8}}>
                  <div>
                    <div style={{fontWeight:700,color:"#0f172a",fontSize:".88rem"}}>{d.client}</div>
                    <div style={{fontSize:".72rem",color:"#64748b",marginTop:1}}>{d.ceNo||"No CE"} · {msCount} milestone{msCount!==1?"s":""}</div>
                  </div>
                  <div style={{display:"flex",gap:12,alignItems:"center"}}>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontWeight:800,color:"#ef4444",fontSize:".92rem"}}>₱{totalDue.toLocaleString("en-PH",{minimumFractionDigits:0})}</div>
                      <div style={{fontSize:".68rem",color:"#94a3b8"}}>outstanding</div>
                    </div>
                    {daysOverdue!==null&&(
                      <span style={{background:daysOverdue>60?"#fef2f2":daysOverdue>30?"#fff7ed":"#fffbeb",color:daysOverdue>60?"#dc2626":daysOverdue>30?"#c2410c":"#d97706",border:`1px solid ${daysOverdue>60?"#fecaca":daysOverdue>30?"#fed7aa":"#fde68a"}`,borderRadius:20,padding:"2px 9px",fontSize:".72rem",fontWeight:700}}>
                        {daysOverdue}d overdue
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
        <CollectionsPanel wonDeals={wonDeals} infs={infs} onUpdatePayment={updatePayment} onLogPayment={logPayment} readonly={role==="Sales"||role==="QS"||role==="Procurement"||role==="Operations"||role==="Design"}/>
      </Wrap>
    );
    if(page==="joborders") return <JOView deals={deals} wonDeals={wonDeals} projs={projs} jos={jos} joStep={joStep} setJoStep={setJoStep} joSel={joSel} setJoSel={setJoSel} joExtra={joExtra} setJoExtra={setJoExtra} viewJO={viewJO} setViewJO={setViewJO} issueJO={issueJO} overallProg={overallProg} Wrap={Wrap}/>;
    if(page==="checklist") return <ChecklistView checklist={checklist} projList={projList} deals={deals} clientName={clientName} openAddCl={openAddCl} openEditCl={openEditCl} delCl={delCl} clStatusQ={clStatusQ} clModal={clModal} setClModal={setClModal} clForm={clForm} setClForm={setClForm} editCl={editCl} saveCl={saveCl} clProjF={clProjF} setClProjF={setClProjF} clTypeF={clTypeF} setClTypeF={setClTypeF} clStatF={clStatF} setClStatF={setClStatF} clDeptF={clDeptF} setClDeptF={setClDeptF} role={role} wonDeals={wonDeals} loadChecklistTemplate={loadChecklistTemplate} Wrap={Wrap}/>;
  }

  // ─── FINANCE ──────────────────────────────────────────────────────────────
  if(role==="Finance"||role==="Cost Control"||role==="Procurement"||role==="QS"){
    const grossPro=totRev-totExp;
    const grossMar=totRev>0?Math.round(grossPro/totRev*100):0;
    if(page==="home"&&role==="QS") return(
      <Wrap>
        {/* QS action items */}
        {(()=>{
          const pendingBudget=jos.filter(j=>j.budgetStatus==="QS Budget Pending");
          return pendingBudget.length>0?(
            <div style={{background:"#fffbeb",border:"1.5px solid #fde68a",borderRadius:12,padding:"14px 18px",marginBottom:20}}>
              <div style={{fontWeight:700,color:"#92400e",marginBottom:8}}>⚠️ {pendingBudget.length} project{pendingBudget.length>1?"s":""} need{pendingBudget.length===1?"s":""} your budget target</div>
              {pendingBudget.map(j=>(
                <div key={j.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 10px",background:"rgba(255,255,255,.7)",borderRadius:8,marginBottom:6,flexWrap:"wrap",gap:8}}>
                  <div>
                    <div style={{fontWeight:600,color:"#0f172a",fontSize:".88rem"}}>{j.client}</div>
                    <div style={{fontSize:".73rem",color:"#64748b"}}>{j.ceNo||"No CE"} · {j.joNo} · Start: {j.startDate||"TBA"}</div>
                  </div>
                  <button onClick={()=>setPage("costanalysis")}
                    style={{background:"#d97706",border:"none",borderRadius:8,padding:"6px 14px",fontFamily:"inherit",fontWeight:700,fontSize:".78rem",color:"#fff",cursor:"pointer"}}>
                    Set Budget →
                  </button>
                </div>
              ))}
            </div>
          ):null;
        })()}
        <BudgetView wonDeals={wonDeals} budgets={budgets} saveBudget={saveBudget} prs={prs} exps={exps} role={role}/>
      </Wrap>
    );
    if(page==="home"&&role==="Procurement") return(
      <Wrap>
        <SecHead title="Procurement Overview"/>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:20}}>
          {[
            {l:"Pending Material Requests", v:mreqs.filter(m=>m.status==="Submitted").length, c:"#f59e0b", action:()=>setPage("materialreq")},
            {l:"Pending Budget Requests",   v:breqs.filter(b=>b.status==="Submitted").length, c:"#ef4444", action:()=>setPage("budgetreq")},
            {l:"Active POs",               v:prs.filter(p=>p.status==="PO Issued").length,    c:"#3b82f6", action:()=>setPage("procurement")},
          ].map(({l,v,c,action})=>(
            <div key={l} onClick={action} style={{background:"#fff",borderRadius:12,padding:"18px",border:"1.5px solid #e2e8f0",cursor:"pointer",transition:"all .15s"}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=c;e.currentTarget.style.boxShadow=`0 4px 16px ${c}22`;}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor="#e2e8f0";e.currentTarget.style.boxShadow="none";}}>
              <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"2rem",color:c}}>{v}</div>
              <div style={{fontSize:".7rem",textTransform:"uppercase",letterSpacing:"1px",color:"#94a3b8",marginTop:5}}>{l}</div>
              <div style={{fontSize:".72rem",color:c,marginTop:8,fontWeight:600}}>View →</div>
            </div>
          ))}
        </div>
      </Wrap>
    );
    if(page==="home") return(
      <Wrap>
        {/* Finance: new awarded projects needing billing milestones */}
        {(()=>{
          const needsBilling=wonDeals.filter(d=>{
            const ms=billings.filter(b=>b.dealId===d.id);
            return ms.length===0;
          });
          return needsBilling.length>0?(
            <div style={{background:"#eff6ff",border:"1.5px solid #93c5fd",borderRadius:12,padding:"12px 18px",marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
              <div>
                <div style={{fontWeight:700,color:"#1d4ed8",fontSize:".88rem"}}>📋 {needsBilling.length} project{needsBilling.length>1?"s":""} need{needsBilling.length===1?"s":""} billing milestones set up</div>
                <div style={{fontSize:".73rem",color:"#1d4ed8",marginTop:3,opacity:.8}}>{needsBilling.slice(0,3).map(d=>d.client).join(", ")}{needsBilling.length>3?` +${needsBilling.length-3} more`:""}</div>
              </div>
              <button onClick={()=>setPage("billing")}
                style={{background:"#1d4ed8",border:"none",borderRadius:8,padding:"7px 16px",fontFamily:"inherit",fontWeight:700,fontSize:".8rem",color:"#fff",cursor:"pointer"}}>
                Set Up Billing →
              </button>
            </div>
          ):null;
        })()}
        <DailyCashPosition
          cashPositions={cashPositions}
          saveDayPos={saveDayPos}
          infs={infs}
          wonDeals={wonDeals}
          totRev={totRev}
          totExp={totExp}
          totColl={totColl}
          totOut={totOut}
        />
      </Wrap>
    );
    if(page==="budget") return(<Wrap><BudgetView wonDeals={wonDeals} budgets={budgets} saveBudget={saveBudget} prs={prs} exps={exps} role={role}/></Wrap>);
    if(page==="swatchboard") return(<Wrap><ProcurementView swatches={swatches} projList={projList} clientName={clientName} openAddSwatch={openAddSwatch} openEditSwatch={openEditSwatch} delSwatch={id=>upSwatches(ss=>ss.filter(s=>s.id!==id))} swQ={swQ} Wrap={Wrap}/></Wrap>);
    if(page==="materialreq") return(<Wrap><MaterialRequestView mreqs={mreqs} addMR={addMR} updateMR={updateMR} prs={prs} addPR={addPR} wonDeals={wonDeals} session={session} role={role}/></Wrap>);
    if(page==="budgetreq") return(<Wrap><BudgetRequestView breqs={breqs} addBR={addBR} updateBR={updateBR} wonDeals={wonDeals} session={session} role={role}/></Wrap>);
    if(page==="collections") return(
      <Wrap>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
          <KPI label="Total Revenue"  value={fmtK(totRev)}        color="#3b82f6"/>
          <KPI label="Total Expenses" value={fmtK(totExp)}        color="#ef4444"/>
          <KPI label="Gross Profit"   value={fmtK(grossPro)}      color={grossPro>=0?"#059669":"#ef4444"}/>
          <KPI label="Gross Margin"   value={grossMar+"%"}        color={grossMar>=20?"#059669":"#f59e0b"}/>
        </div>
        <SecHead title="Collections" sub="Log and track all client payments"/>
        <CollectionsPanel wonDeals={wonDeals} infs={infs} onUpdatePayment={updatePayment} onLogPayment={logPayment} readonly={role==="Sales"||role==="QS"||role==="Procurement"||role==="Operations"||role==="Design"}/>
        <div style={{marginTop:20}}>
          <SecHead title="Per Project Profit" sub="Real-time margin based on logged expenses"/>
          {projList.map(d=>{
            const p=projs[d.id]; if(!p) return null;
            const projExpTotal=exps.filter(e=>e.projectId===d.id).reduce((s,e)=>s+e.amount,0);
            const opsCost=costOf(p);
            const profit=d.value-opsCost;
            const margin=d.value>0?Math.round(profit/d.value*100):0;
            return(
              <Card key={d.id}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,flexWrap:"wrap"}}>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700,color:"#0f172a"}}>{d.client}</div>
                    <div style={{fontSize:".75rem",color:"#64748b",marginTop:2}}>{d.product} · <Badge label={p.currentStage} color={PROD_CLR[p.currentStage]}/></div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,minWidth:320}}>
                    {[["Contract",d.value,"#3b82f6"],["Total Cost",opsCost,"#ef4444"],["Profit",profit,profit>=0?"#059669":"#ef4444"]].map(([l,v,c])=>(
                      <div key={l} style={{background:"#f8fafc",borderRadius:8,padding:"10px 12px",textAlign:"center"}}>
                        <div style={{fontWeight:800,color:c,fontSize:".95rem",fontFamily:"'Barlow Condensed',sans-serif"}}>{fmt(v)}</div>
                        <div style={{fontSize:".65rem",color:"#94a3b8",marginTop:3,textTransform:"uppercase",letterSpacing:".5px"}}>{l}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{textAlign:"right",minWidth:80}}>
                    <div style={{fontWeight:800,fontSize:"1.3rem",color:margin>=20?"#059669":"#f59e0b",fontFamily:"'Barlow Condensed',sans-serif"}}>{margin}%</div>
                    <div style={{fontSize:".68rem",color:"#94a3b8"}}>margin</div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </Wrap>
    );
    if(page==="checklist") return <ChecklistView checklist={checklist} projList={projList} deals={deals} clientName={clientName} openAddCl={openAddCl} openEditCl={openEditCl} delCl={delCl} clStatusQ={clStatusQ} clModal={clModal} setClModal={setClModal} clForm={clForm} setClForm={setClForm} editCl={editCl} saveCl={saveCl} clProjF={clProjF} setClProjF={setClProjF} clTypeF={clTypeF} setClTypeF={setClTypeF} clStatF={clStatF} setClStatF={setClStatF} clDeptF={clDeptF} setClDeptF={setClDeptF} role={role} wonDeals={wonDeals} loadChecklistTemplate={loadChecklistTemplate} Wrap={Wrap}/>;
    if(page==="expenses") return(
      <Wrap>
        <SecHead title="Expenses" action={<Btn onClick={()=>openAddExp()}>+ Log Expense</Btn>} sub="All logged costs — company-wide and per project"/>
        {["all",...projList.map(d=>d.id)].map(filter=>{
          const label=filter==="all"?"All Expenses":clientName(filter);
          const filtered=filter==="all"?exps:exps.filter(e=>e.projectId===filter);
          if(filter!=="all"&&filtered.length===0) return null;
          return(
            <div key={filter} style={{marginBottom:20}}>
              {filter!=="all"&&<div style={{fontWeight:700,color:"#0f172a",marginBottom:8,fontSize:".92rem"}}>{label}</div>}
              {filtered.map(e=>(
                <Card key={e.id}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",gap:7,alignItems:"center",flexWrap:"wrap",marginBottom:4}}>
                        <Badge label={e.category} color="#64748b"/>
                        {e.projectId?<Badge label={clientName(e.projectId)} color="#8b5cf6"/>:<Badge label="Company-wide" color="#94a3b8"/>}
                        <span style={{fontSize:".72rem",color:"#94a3b8"}}>{MONTHS[e.month]}</span>
                      </div>
                      <div style={{fontWeight:600,color:"#0f172a"}}>{e.note}</div>
                      {e.receipt&&<a href={e.receipt} target="_blank" rel="noreferrer" style={{fontSize:".72rem",color:"#3b82f6",marginTop:4,display:"block"}}>📎 View Receipt</a>}
                    </div>
                    <div style={{textAlign:"right",flexShrink:0}}>
                      <div style={{fontWeight:800,color:"#ef4444",fontSize:"1.05rem"}}>{fmt(e.amount)}</div>
                      <div style={{display:"flex",gap:6,marginTop:8}}><Btn small variant="ghost" onClick={()=>openEditExp(e)}>✏ Edit</Btn><Btn small variant="danger" onClick={()=>delExp(e.id)}>Delete</Btn></div>
                    </div>
                  </div>
                </Card>
              ))}
              {filter==="all"&&exps.length===0&&<EmptyState icon="📋" msg="No expenses logged yet."/>}
            </div>
          );
        })}
      </Wrap>
    );
  }

  // ─── OPERATIONS ───────────────────────────────────────────────────────────
  // ── WAREHOUSE ───────────────────────────────────────────────────────────────
  if(role==="Warehouse"){
    if(page==="stockmove") return(<Wrap><StockMovementView inventory={inventory} stocklog={stocklog} wonDeals={wonDeals} logStockMove={logStockMove} session={session} role={role}/></Wrap>);
    if(page==="inventory") return(<Wrap><InventoryView inventory={inventory} stocklog={stocklog} wonDeals={wonDeals} addInventoryItem={addInventoryItem} updateInventoryItem={updateInventoryItem} deleteInventoryItem={deleteInventoryItem} logStockMove={logStockMove} session={session} role={role}/></Wrap>);
    if(page==="deliveries"||page==="home") return(
      <Wrap>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
          <div>
            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:"1.6rem",color:"#0f172a"}}>Good {greeting}, {session?.name?.split(" ")[0]||"Warehouse"} 👋</div>
            <div style={{color:"#64748b",fontSize:".85rem",marginTop:2}}>Warehouse · {todayL}</div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>setPage("inventory")} style={{background:"#64748b",border:"none",borderRadius:9,padding:"9px 18px",color:"#fff",fontFamily:"inherit",fontWeight:700,fontSize:".85rem",cursor:"pointer"}}>📦 Inventory</button>
            <button onClick={()=>setPage("stockmove")} style={{background:"#1e293b",border:"none",borderRadius:9,padding:"9px 18px",color:"#fff",fontFamily:"inherit",fontWeight:700,fontSize:".85rem",cursor:"pointer"}}>📋 Stock Log</button>
          </div>
        </div>
        {(()=>{
          const now=new Date();
          const weekEnd=new Date(now); weekEnd.setDate(now.getDate()+7);
          const toReceive=prs.filter(p=>!["Delivered","Cancelled","Draft"].includes(p.status)&&p.poDate);
          const arrivedToday=prs.filter(p=>p.deliveryDate===today&&p.status!=="Delivered"&&p.status!=="Cancelled");
          const overdueDeliveries=prs.filter(p=>p.deliveryDate&&new Date(p.deliveryDate)<now&&!["Delivered","Cancelled"].includes(p.status));
          const thisWeek=prs.filter(p=>p.deliveryDate&&new Date(p.deliveryDate)>=now&&new Date(p.deliveryDate)<=weekEnd&&!["Delivered","Cancelled"].includes(p.status));
          const recentlyReceived=prs.filter(p=>p.status==="Delivered"&&p.deliveryDate&&Math.abs(Math.ceil((now-new Date(p.deliveryDate))/(1000*60*60*24)))<=3);
          return(
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              {/* KPI strip */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
                {[
                  {l:"Arriving Today",    v:arrivedToday.length,        c:"#dc2626", icon:"🚨"},
                  {l:"Overdue",           v:overdueDeliveries.length,   c:"#f97316", icon:"⏰"},
                  {l:"This Week",         v:thisWeek.length,            c:"#3b82f6", icon:"🚚"},
                  {l:"Received (3d)",     v:recentlyReceived.length,    c:"#059669", icon:"✅"},
                ].map(({l,v,c,icon})=>(
                  <div key={l} style={{background:"#fff",borderRadius:12,padding:"14px",border:`1.5px solid ${c}33`,textAlign:"center"}}>
                    <div style={{fontSize:"1.2rem",marginBottom:4}}>{icon}</div>
                    <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.4rem",color:c}}>{v}</div>
                    <div style={{fontSize:".63rem",textTransform:"uppercase",letterSpacing:"1px",color:"#94a3b8",marginTop:3}}>{l}</div>
                  </div>
                ))}
              </div>

              {/* Arriving today — most urgent */}
              {arrivedToday.length>0&&(
                <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #fecaca",overflow:"hidden"}}>
                  <div style={{background:"#dc2626",padding:"10px 16px"}}><span style={{fontWeight:700,color:"#fff",fontSize:".88rem"}}>🚨 Due Today — Receive and Inspect ({arrivedToday.length})</span></div>
                  {arrivedToday.map((pr,i)=>{
                    const d=wonDeals.find(x=>x.id===pr.projectId);
                    return(
                      <div key={pr.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"11px 16px",borderBottom:i<arrivedToday.length-1?"1px solid #fee2e2":"",background:"#fff"}}>
                        <div>
                          <div style={{fontWeight:700,color:"#0f172a",fontSize:".88rem"}}>{pr.itemName}</div>
                          <div style={{fontSize:".72rem",color:"#94a3b8"}}>{d?.client||"?"} · {pr.qty} {pr.unit} · {pr.supplier||"No supplier"}</div>
                          {pr.poNumber&&<div style={{fontSize:".68rem",color:"#64748b"}}>PO: {pr.poNumber}</div>}
                        </div>
                        <button onClick={()=>{
                          updatePR(pr.id,{status:"Delivered",qtyDelivered:pr.qty,deliveryDate:today,deliveryNote:`Received by ${session?.name||"Warehouse"} on ${today}`});
                          sendTelegramNotification("procurement",`📦 <b>Delivery Confirmed</b>\n${pr.itemName}\nProject: ${d?.client||"?"}\nQty: ${pr.qty} ${pr.unit||""}\nReceived by: ${session?.name||"Warehouse"} · ${today}`);
                        }}
                          style={{background:"#059669",border:"none",borderRadius:8,padding:"7px 16px",color:"#fff",fontFamily:"inherit",fontWeight:700,fontSize:".75rem",cursor:"pointer",whiteSpace:"nowrap"}}>
                          ✓ Mark Received
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Overdue deliveries */}
              {overdueDeliveries.length>0&&(
                <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #fed7aa",overflow:"hidden"}}>
                  <div style={{background:"#d97706",padding:"10px 16px"}}><span style={{fontWeight:700,color:"#fff",fontSize:".88rem"}}>⏰ Overdue — Follow Up with Procurement ({overdueDeliveries.length})</span></div>
                  {overdueDeliveries.map((pr,i)=>{
                    const d=wonDeals.find(x=>x.id===pr.projectId);
                    const daysLate=Math.ceil((now-new Date(pr.deliveryDate))/(1000*60*60*24));
                    return(
                      <div key={pr.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 16px",borderBottom:i<overdueDeliveries.length-1?"1px solid #fef3c7":"",background:"#fff"}}>
                        <div>
                          <div style={{fontWeight:600,color:"#0f172a",fontSize:".85rem"}}>{pr.itemName}</div>
                          <div style={{fontSize:".72rem",color:"#94a3b8"}}>{d?.client||"?"} · Expected {pr.deliveryDate} · {pr.supplier||"No supplier"}</div>
                        </div>
                        <span style={{fontSize:".72rem",background:"#fff7ed",color:"#d97706",border:"1px solid #fed7aa",borderRadius:20,padding:"2px 9px",fontWeight:700,whiteSpace:"nowrap"}}>{daysLate}d late</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* This week's expected deliveries */}
              {thisWeek.length>0&&(
                <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",overflow:"hidden"}}>
                  <div style={{background:"#1e293b",padding:"10px 16px"}}><span style={{fontWeight:700,color:"#f59e0b",fontSize:".88rem"}}>🚚 Expected This Week ({thisWeek.length})</span></div>
                  {thisWeek.map((pr,i)=>{
                    const d=wonDeals.find(x=>x.id===pr.projectId);
                    const daysUntil=Math.ceil((new Date(pr.deliveryDate)-now)/(1000*60*60*24));
                    return(
                      <div key={pr.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 16px",borderBottom:i<thisWeek.length-1?"1px solid #f8fafc":"",background:"#fff"}}>
                        <div>
                          <div style={{fontWeight:600,color:"#0f172a",fontSize:".85rem"}}>{pr.itemName}</div>
                          <div style={{fontSize:".72rem",color:"#94a3b8"}}>{d?.client||"?"} · {pr.qty} {pr.unit} · {pr.supplier||"—"} · {pr.deliveryDate}</div>
                        </div>
                        <span style={{fontSize:".72rem",background:"#eff6ff",color:"#3b82f6",border:"1px solid #bfdbfe",borderRadius:20,padding:"2px 9px",fontWeight:700,whiteSpace:"nowrap"}}>{daysUntil===0?"Today":daysUntil===1?"Tomorrow":`in ${daysUntil}d`}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Quick links */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div onClick={()=>setPage("inventory")} style={{background:"#fff",borderRadius:10,padding:"16px",border:"1.5px solid #e2e8f0",cursor:"pointer",textAlign:"center"}}>
                  <div style={{fontSize:"1.4rem"}}>📦</div>
                  <div style={{fontWeight:700,color:"#0f172a",marginTop:6,fontSize:".9rem"}}>Inventory</div>
                  <div style={{fontSize:".72rem",color:"#94a3b8",marginTop:2}}>{inventory.length} items tracked</div>
                </div>
                <div onClick={()=>setPage("stockmove")} style={{background:"#fff",borderRadius:10,padding:"16px",border:"1.5px solid #e2e8f0",cursor:"pointer",textAlign:"center"}}>
                  <div style={{fontSize:"1.4rem"}}>📋</div>
                  <div style={{fontWeight:700,color:"#0f172a",marginTop:6,fontSize:".9rem"}}>Stock Movements</div>
                  <div style={{fontSize:".72rem",color:"#94a3b8",marginTop:2}}>Log IN / OUT / Adjust</div>
                </div>
              </div>
            </div>
          );
        })()}
      </Wrap>
    );
  }

  if(role==="Operations"){
    if(page==="home") return <OpsView projs={projs} projList={projList} deals={deals} selProj={selProj} setSelProj={setSelProj} opsTab={opsTab} setOpsTab={setOpsTab} proj={proj} projDeal={projDeal} upProj={upProj} overallProg={overallProg} costOf={costOf} marginOf={marginOf} openDesignEdit={openDesignEdit} swatches={swatches} swQ={swQ} openAddSwatch={(pid,by)=>{setSwForm({projectId:pid,name:"",category:"Fabric",qty:"",unit:"pcs",supplier:"",estCost:"",swatchLink:"",addedBy:by||"Ops",status:"To Buy",notes:""});setEditSw(null);setSwModal(true);}} openEditSwatch={sw=>{setSwForm({...sw});setEditSw(sw.id);setSwModal(true);}} delSwatch={id=>upSwatches(ss=>ss.filter(s=>s.id!==id))} exps={exps} openAddExp={openAddExp} openEditExp={openEditExp} delExp={delExp} clientName={clientName} matModal={matModal} setMatModal={setMatModal} matForm={matForm} setMatForm={setMatForm} editMat={editMat} setEditMat={setEditMat} saveMat={()=>{if(!matForm.name||!matForm.qty||!matForm.cost)return;const rec={...matForm,qty:Number(matForm.qty),cost:Number(matForm.cost),id:editMat||uid()};upProj(selProj,p=>({...p,materials:editMat?p.materials.map(m=>m.id===editMat?rec:m):[...p.materials,rec]}));setMatModal(false);setEditMat(null);setMatForm({name:"",qty:"",unit:"pcs",cost:"",received:false});}} addPmUpdate={addPmUpdate} addAddendum={addAddendum} updateAddendumStatus={updateAddendumStatus} session={session} Wrap={Wrap} addenda={addenda} addAddendum2={addAddendum2} updateAddendum={updateAddendum} deleteAddendum={deleteAddendum}/>;
    if(page==="procurement") return <ProcurementView swatches={swatches} projList={projList} clientName={clientName} openAddSwatch={(pid,by)=>{setSwForm({projectId:pid,name:"",category:"Fabric",qty:"",unit:"pcs",supplier:"",estCost:"",swatchLink:"",addedBy:by||"Ops",status:"To Buy",notes:""});setEditSw(null);setSwModal(true);}} openEditSwatch={sw=>{setSwForm({...sw});setEditSw(sw.id);setSwModal(true);}} delSwatch={id=>upSwatches(ss=>ss.filter(s=>s.id!==id))} swQ={swQ} Wrap={Wrap}/>;
    if(page==="checklist") return <ChecklistView checklist={checklist} projList={projList} deals={deals} clientName={clientName} openAddCl={openAddCl} openEditCl={openEditCl} delCl={delCl} clStatusQ={clStatusQ} clModal={clModal} setClModal={setClModal} clForm={clForm} setClForm={setClForm} editCl={editCl} saveCl={saveCl} clProjF={clProjF} setClProjF={setClProjF} clTypeF={clTypeF} setClTypeF={setClTypeF} clStatF={clStatF} setClStatF={setClStatF} clDeptF={clDeptF} setClDeptF={setClDeptF} role={role} wonDeals={wonDeals} loadChecklistTemplate={loadChecklistTemplate} Wrap={Wrap}/>;
    if(page==="joborders") return <JOView wonDeals={wonDeals} projs={projs} jos={jos} upJos={upJos} Wrap={Wrap}/>;
    if(page==="budget") return(<Wrap><BudgetView wonDeals={wonDeals} budgets={budgets} saveBudget={saveBudget} prs={prs} exps={exps} role={role}/></Wrap>);
    if(page==="materialreq") return(<Wrap><MaterialRequestView mreqs={mreqs} addMR={addMR} updateMR={updateMR} prs={prs} addPR={addPR} wonDeals={wonDeals} session={session} role={role}/></Wrap>);
    if(page==="budgetreq") return(<Wrap><BudgetRequestView breqs={breqs} addBR={addBR} updateBR={updateBR} wonDeals={wonDeals} session={session} role={role}/></Wrap>);
    if(page==="calendar") return(<ConstructionCalendar wonDeals={wonDeals} deals={deals} pcards={pcards} jos={jos} prs={prs} billings={billings} drfs={drfs} setPage={setPage} today={today} Wrap={Wrap}/>);
  }

  // ─── DESIGN ───────────────────────────────────────────────────────────────
  if(role==="Design"){
    if(page==="home") return(
      <Wrap>
        <SecHead title="Design Projects"/>
        {projList.map(d=>{
          const p=projs[d.id]; if(!p) return null; const ds=p?.design?.status||"Briefing";
          const dsPct=Math.round((DESIGN_STATUSES.indexOf(ds))/(DESIGN_STATUSES.length-1)*100);
          return(
            <Card key={d.id} onClick={()=>{setSelProj(d.id);setOpsTab("design");}} accent={p?.currentStage==="Design"?DS_CLR[ds]:undefined}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                <div>
                  <div style={{fontWeight:700,color:"#0f172a",fontSize:"1rem"}}>{d.client}</div>
                  <div style={{fontSize:".76rem",color:"#64748b",marginTop:2}}>{d.product}</div>
                </div>
                <div style={{display:"flex",gap:7,flexWrap:"wrap",justifyContent:"flex-end"}}>
                  <Badge label={p.currentStage} color={PROD_CLR[p.currentStage]}/>
                  <Badge label={ds} color={DS_CLR[ds]}/>
                </div>
              </div>
              <div style={{marginBottom:6}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:".7rem",color:"#94a3b8",marginBottom:4}}><span>Design progress</span><span style={{fontWeight:700,color:DS_CLR[ds]}}>{dsPct}%</span></div>
                <ProgBar pct={dsPct} color={DS_CLR[ds]}/>
              </div>
              <div style={{display:"flex",gap:12,fontSize:".74rem",color:"#94a3b8",marginTop:6}}>
                <span>Designer: {p.design?.designer||"—"}</span>
                <span>Due: {p.design?.dueDate||"—"}</span>
              </div>
              <div style={{marginTop:10,display:"flex",gap:7,flexWrap:"wrap"}}>
                {DESIGN_STATUSES.map(s=>(
                  <button key={s} onClick={e=>{e.stopPropagation();const next={...p.design,status:s,statusHistory:[...(p.design?.statusHistory||[]),{status:s,date:today,by:"Design"}]};upProj(d.id,x=>({...x,design:next}));if(s==="Done"&&p.currentStage==="Design")upProj(d.id,x=>({...x,currentStage:"Fabrication",progress:{...x.progress,Design:100}}));}} style={{padding:"4px 11px",border:`1.5px solid ${ds===s?DS_CLR[s]:"#e2e8f0"}`,borderRadius:16,background:ds===s?DS_CLR[s]+"18":"#fff",color:ds===s?DS_CLR[s]:"#94a3b8",fontWeight:ds===s?700:400,cursor:"pointer",fontSize:".72rem",fontFamily:"inherit"}}>
                    {s}
                  </button>
                ))}
              </div>
            </Card>
          );
        })}
        {projList.length===0&&<EmptyState icon="🎨" msg="No active projects assigned yet."/>}
        {selProj&&proj&&(
          <Modal open title={`Design Details — ${projDeal?.client}`} onClose={()=>setSelProj(null)} wide>
            <Fld label="Designer"><Sel value={proj.design?.designer||""} onChange={e=>upProj(selProj,p=>({...p,design:{...p.design,designer:e.target.value}}))}><option value="">— Select —</option>{DESIGN_MEMBERS.map(m=><option key={m}>{m}</option>)}</Sel></Fld>
            <Fld label="Due Date"><Inp type="date" value={proj.design?.dueDate||""} onChange={e=>upProj(selProj,p=>({...p,design:{...p.design,dueDate:e.target.value}}))}/></Fld>
            <Fld label="Approved Revision No." hint="Lock this before handoff to Ops e.g. Rev 3"><Inp value={proj.design?.revisionNo||""} onChange={e=>upProj(selProj,p=>({...p,design:{...p.design,revisionNo:e.target.value}}))} placeholder="e.g. Rev 3"/></Fld>
            <Fld label="File / Link"><Inp type="url" value={proj.design?.link||""} onChange={e=>upProj(selProj,p=>({...p,design:{...p.design,link:e.target.value}}))} placeholder="https://drive.google.com/…"/></Fld>
            <Fld label="Notes"><Inp rows={3} value={proj.design?.notes||""} onChange={e=>upProj(selProj,p=>({...p,design:{...p.design,notes:e.target.value}}))}/></Fld>
            {proj.design?.revisionNo&&proj.design?.link&&(
              <div style={{background:"#f0fdf4",border:"1.5px solid #bbf7d0",borderRadius:10,padding:"10px 14px",marginTop:4,fontSize:".8rem",color:"#15803d"}}>
                ✅ Ready to hand off — <strong>{proj.design.revisionNo}</strong> · <a href={proj.design.link} target="_blank" rel="noreferrer" style={{color:"#15803d"}}>View drawings</a>
              </div>
            )}
            <Btn full onClick={()=>setSelProj(null)}>Done</Btn>
          </Modal>
        )}
      </Wrap>
    );
    if(page==="procurement") return <ProcurementView swatches={swatches} projList={projList} clientName={clientName} openAddSwatch={(pid,by)=>{setSwForm({projectId:pid,name:"",category:"Fabric",qty:"",unit:"pcs",supplier:"",estCost:"",swatchLink:"",addedBy:by||"Design",status:"To Buy",notes:""});setEditSw(null);setSwModal(true);}} openEditSwatch={sw=>{setSwForm({...sw});setEditSw(sw.id);setSwModal(true);}} delSwatch={id=>upSwatches(ss=>ss.filter(s=>s.id!==id))} swQ={swQ} Wrap={Wrap}/>;
    if(page==="swatchboard") return(<Wrap><ProcurementView swatches={swatches} projList={projList} clientName={clientName} openAddSwatch={openAddSwatch} openEditSwatch={openEditSwatch} delSwatch={id=>upSwatches(ss=>ss.filter(s=>s.id!==id))} swQ={swQ} Wrap={Wrap}/></Wrap>);
    if(page==="drf") return(<Wrap><DRFView drfs={drfs} addDRF={addDRF} updateDRF={updateDRF} deleteDRF={deleteDRF} wonDeals={wonDeals} session={session} role={role}/></Wrap>);
  }

  // ── GLOBAL DRF PAGE (Sales / Manager) ───────────────────────────────────
  if(page==="drf") return(<Wrap><DRFView drfs={drfs} addDRF={addDRF} updateDRF={updateDRF} deleteDRF={deleteDRF} wonDeals={wonDeals} session={session} role={role}/></Wrap>);

  // ── PROJECT CARDS ────────────────────────────────────────────────────────────
  // ── MY ACCOUNT PAGE ─────────────────────────────────────────────────────
  if(page==="myaccount") return(
    <Wrap>
      <div style={{maxWidth:520,margin:"0 auto"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:28}}>
          <button onClick={()=>setPage("home")} style={{background:"#f1f5f9",border:"none",borderRadius:8,padding:"7px 14px",fontFamily:"inherit",fontSize:".82rem",color:"#64748b",cursor:"pointer",fontWeight:600}}>← Back</button>
          <div>
            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:"1.5rem",color:"#0f172a"}}>⚙️ My Account</div>
            <div style={{fontSize:".78rem",color:"#94a3b8",marginTop:1}}>Logged in as <strong>{session?.username}</strong> · {role}</div>
          </div>
        </div>
        <MyAccountPage session={session} users={users} setUsers={setUsers} upUsers={upUsers} setSession={setSession} logActivity={logActivity} checkPw={checkPw} hashPw={hashPw}/>
      </div>
    </Wrap>
  );
  // ── PM UPDATES PAGE ──────────────────────────────────────────────────────
  if(page==="pmupdates") return(
    <Wrap>
      <SecHead title="📝 PM Updates" sub="Log progress updates on your active projects"/>
      {(()=>{
        const myName=session?.name||"";
        const myProjects=wonDeals.filter(d=>{
          const jo=jos.find(j=>j.dealId===d.id);
          return jo&&[jo.pm1,jo.pm2,jo.pm3,jo.coordinator].filter(Boolean).some(p=>
            p===myName||p.toLowerCase().includes((myName||"").split(" ")[0]?.toLowerCase()||""));
        });
        return myProjects.length===0
          ? <div style={{textAlign:"center",padding:"40px",color:"#94a3b8"}}>No projects assigned to you yet. Contact Arrius or Paulo to get assigned.</div>
          : (
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {myProjects.map(d=>{
                const jo=jos.find(j=>j.dealId===d.id);
                const pc=pcards[d.id];
                const pct=pc?Math.round(Object.values(pc.departments||{}).filter(dept=>dept.done).length/6*100):0;
                const myUpdates=actLog.filter(a=>a.dealId===d.id&&a.action==="PM Update").slice(0,3);
                return(
                  <div key={d.id} style={{background:"#fff",borderRadius:14,border:"1.5px solid #e2e8f0",overflow:"hidden"}}>
                    <div style={{background:"#0ea5e9",padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div>
                        <div style={{fontWeight:700,color:"#fff",fontSize:".92rem"}}>{d.client}</div>
                        <div style={{fontSize:".72rem",color:"rgba(255,255,255,.7)",marginTop:1}}>{d.ceNo} · PM: {jo?.pm1||"—"} · {pct}% complete</div>
                      </div>
                      <button onClick={()=>setPmUpdateModal({dealId:d.id,dealName:d.client,ceNo:d.ceNo,ae:jo?.aeAssigned||d.salesOwner})}
                        style={{background:"rgba(255,255,255,.2)",border:"1px solid rgba(255,255,255,.3)",borderRadius:8,padding:"7px 14px",color:"#fff",fontFamily:"inherit",fontWeight:700,fontSize:".8rem",cursor:"pointer"}}>
                        + Log Update
                      </button>
                    </div>
                    <div style={{padding:"12px 16px"}}>
                      {myUpdates.length===0
                        ? <div style={{color:"#94a3b8",fontSize:".8rem",fontStyle:"italic"}}>No updates logged yet for this project.</div>
                        : myUpdates.map((u,i)=>(
                          <div key={i} style={{fontSize:".82rem",color:"#475569",padding:"6px 0",borderBottom:i<myUpdates.length-1?"1px solid #f8fafc":"",display:"flex",gap:10}}>
                            <span style={{color:"#94a3b8",whiteSpace:"nowrap",fontSize:".75rem"}}>{u.date} {u.time||""}</span>
                            <span>{u.detail}</span>
                          </div>
                        ))
                      }
                    </div>
                  </div>
                );
              })}
            </div>
          );
      })()}

      {/* PM Update Modal */}
      {/* PM Update Modal */}
      {pmUpdateModal&&<PmUpdateModal pmUpdateModal={pmUpdateModal} setPmUpdateModal={setPmUpdateModal} session={session} logActivity={logActivity}/>}
    </Wrap>
  );

  // ── ADDENDA PAGE FOR PROJECT MOVERS ───────────────────────────────────────
  if(page==="addenda") return(
    <Wrap>
      <SecHead title="⚠️ Scope Changes" sub="Flag addenda discovered on site — AE and Paolo will be notified"/>
      {(()=>{
        const myName=session?.name||"";
        const myProjects=wonDeals.filter(d=>{
          const jo=jos.find(j=>j.dealId===d.id);
          return jo&&[jo.pm1,jo.pm2,jo.pm3,jo.coordinator].filter(Boolean).some(p=>
            p===myName||p.toLowerCase().includes((myName||"").split(" ")[0]?.toLowerCase()||""));
        });
        const[selDealId,setSelDealId]=React.useState(myProjects[0]?.id||"");
        const[title,setTitle]=React.useState("");
        const[desc,setDesc]=React.useState("");
        const[value,setValue]=React.useState("");
        const[submitting,setSubmitting]=React.useState(false);

        const myAddenda=addenda.filter(a=>myProjects.find(d=>d.id===a.dealId));

        return(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
            {/* Log new addendum */}
            <div style={{background:"#fff",borderRadius:14,border:"1.5px solid #e2e8f0",overflow:"hidden"}}>
              <div style={{background:"#dc2626",padding:"12px 16px"}}>
                <span style={{fontWeight:700,color:"#fff",fontSize:".9rem"}}>⚠️ Flag New Scope Change</span>
              </div>
              <div style={{padding:"16px",display:"flex",flexDirection:"column",gap:12}}>
                <div>
                  <label style={{fontSize:".8rem",fontWeight:700,color:"#64748b",display:"block",marginBottom:4}}>Project <span style={{color:"#ef4444"}}>*</span></label>
                  <select value={selDealId} onChange={e=>setSelDealId(e.target.value)}
                    style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"8px 12px",fontFamily:"inherit",fontSize:".85rem"}}>
                    {myProjects.map(d=><option key={d.id} value={d.id}>{d.client} — {d.ceNo}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{fontSize:".8rem",fontWeight:700,color:"#64748b",display:"block",marginBottom:4}}>Scope Change Title <span style={{color:"#ef4444"}}>*</span></label>
                  <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Additional wall cladding — Unit B"
                    style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"8px 12px",fontFamily:"inherit",fontSize:".85rem"}}/>
                </div>
                <div>
                  <label style={{fontSize:".8rem",fontWeight:700,color:"#64748b",display:"block",marginBottom:4}}>Description <span style={{color:"#ef4444"}}>*</span></label>
                  <textarea value={desc} onChange={e=>setDesc(e.target.value)} rows={3} placeholder="What changed? Where? Who requested it? Client verbal approval received?"
                    style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"8px 12px",fontFamily:"inherit",fontSize:".85rem",resize:"vertical"}}/>
                </div>
                <div>
                  <label style={{fontSize:".8rem",fontWeight:700,color:"#64748b",display:"block",marginBottom:4}}>Estimated Additional Value (₱)</label>
                  <input type="number" value={value} onChange={e=>setValue(e.target.value)} placeholder="0 if unknown"
                    style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"8px 12px",fontFamily:"inherit",fontSize:".85rem"}}/>
                </div>
                <div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:8,padding:"10px 12px",fontSize:".8rem",color:"#92400e"}}>
                  📣 Submitting this will notify: <strong>{wonDeals.find(d=>d.id===selDealId)?.salesOwner||"AE"}</strong> (AE) and <strong>Paolo Gomez</strong> for coordination.
                </div>
                <button
                  onClick={()=>{
                    if(!title.trim()||!desc.trim()||!selDealId){toastEmit("Please fill in all required fields.","warning");return;}
                    const deal=wonDeals.find(d=>d.id===selDealId);
                    const jo=jos.find(j=>j.dealId===selDealId);
                    const newAdd={
                      id:"add"+Date.now(),dealId:selDealId,
                      title:title.trim(),description:desc.trim(),
                      value:Number(value)||0,
                      ceNo:deal?.ceNo||"",
                      receiptType:deal?.receiptType||"OR",
                      withholding:deal?.withholding||false,
                      status:"Discovered",salesNotified:true,
                      discoveredBy:session?.name||role,
                    };
                    upAddenda(as=>[...as,newAdd]);
                    // Notify AE + Paolo via activity log (banner will appear on their screens)
                    const ae=deal?.salesOwner||"AE";
                    logActivity(selDealId,"Scope Change Flagged",`${session?.name} flagged addendum on ${deal?.client||"?"} (${deal?.ceNo||"?"}): "${title}" — Notifying ${ae} and Paolo Gomez.`);
                    setTitle(""); setDesc(""); setValue("");
                    toastEmit("Scope change logged! Notified Sales.","success");
                  }}
                  style={{background:"#dc2626",border:"none",borderRadius:8,padding:"10px",fontFamily:"inherit",fontWeight:700,fontSize:".85rem",color:"#fff",cursor:"pointer"}}>
                  ⚠️ Submit Scope Change
                </button>
              </div>
            </div>

            {/* My addenda history */}
            <div style={{background:"#fff",borderRadius:14,border:"1.5px solid #e2e8f0",overflow:"hidden"}}>
              <div style={{background:"#1e293b",padding:"12px 16px"}}>
                <span style={{fontWeight:700,color:"#f59e0b",fontSize:".9rem"}}>📋 Your Scope Change History ({myAddenda.length})</span>
              </div>
              {myAddenda.length===0
                ? <div style={{padding:"24px",textAlign:"center",color:"#94a3b8",fontSize:".82rem"}}>No scope changes logged yet.</div>
                : myAddenda.slice(0,8).map((a,i)=>{
                    const d=wonDeals.find(x=>x.id===a.dealId);
                    const statusClr={Discovered:"#f59e0b","Sales Notified":"#3b82f6","Client Coordinating":"#8b5cf6",Approved:"#059669",Billed:"#06b6d4",Collected:"#10b981",Rejected:"#ef4444"};
                    return(
                      <div key={a.id} style={{padding:"11px 16px",borderBottom:i<myAddenda.length-1?"1px solid #f8fafc":""}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontWeight:600,color:"#0f172a",fontSize:".85rem"}}>{a.title}</div>
                            <div style={{fontSize:".72rem",color:"#94a3b8",marginTop:1}}>{d?.client||"?"} · {d?.ceNo||"?"}</div>
                          </div>
                          <span style={{marginLeft:8,fontSize:".68rem",fontWeight:700,color:statusClr[a.status]||"#64748b",background:(statusClr[a.status]||"#64748b")+"18",borderRadius:20,padding:"2px 8px",whiteSpace:"nowrap"}}>{a.status}</span>
                        </div>
                        {a.value>0&&<div style={{fontSize:".75rem",color:"#059669",marginTop:3}}>Est. value: ₱{Number(a.value).toLocaleString("en-PH")}</div>}
                      </div>
                    );
                  })
              }
            </div>
          </div>
        );
      })()}
    </Wrap>
  );

  if(page==="projects") return(
    <Wrap>
      <ProjectCards
        pcards={pcards} wonDeals={wonDeals} deals={deals}
        toggleDeptTask={toggleDeptTask} markDeptDone={markDeptDone}
        setProjectTAT={setProjectTAT} jos={jos}
        delDeal={delDeal} delPcard={delPcard}
        session={session} role={role}/>
      {/* ── SMART IMPORT PREVIEW MODAL ──────────────────────────────── */}
      {smartImport&&(
        <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,.7)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:760,maxHeight:"90vh",overflow:"auto",boxShadow:"0 24px 64px rgba(0,0,0,.3)"}}>
            {/* Header */}
            <div style={{background:"#1e293b",borderRadius:"16px 16px 0 0",padding:"18px 24px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontWeight:800,color:"#fff",fontSize:"1rem"}}>🤔 Smart Import — AI Analysis</div>
                <div style={{fontSize:".75rem",color:"#94a3b8",marginTop:2}}>{smartImport.fileName}</div>
              </div>
              <button onClick={()=>setSmartImport(null)} style={{background:"rgba(255,255,255,.1)",border:"none",borderRadius:8,padding:"6px 12px",color:"#fff",cursor:"pointer",fontFamily:"inherit",fontSize:".8rem"}}>✕ Cancel</button>
            </div>
            <div style={{padding:24}}>
              {/* AI Summary */}
              <div style={{background:smartImport.analysis.canImport?"#f0fdf4":"#fef2f2",border:`1.5px solid ${smartImport.analysis.canImport?"#6ee7b7":"#fecaca"}`,borderRadius:10,padding:"14px 18px",marginBottom:20}}>
                <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                  <span style={{fontSize:"1.4rem"}}>{smartImport.analysis.canImport?"✅":"⚠️"}</span>
                  <div>
                    <div style={{fontWeight:700,color:"#0f172a",fontSize:".9rem",marginBottom:4}}>
                      {smartImport.analysis.dataType?.toUpperCase()||"UNKNOWN"} DATA
                      <span style={{marginLeft:8,fontSize:".72rem",background:smartImport.analysis.confidence>70?"#059669":"#f59e0b",color:"#fff",borderRadius:20,padding:"2px 8px",fontWeight:600}}>
                        {smartImport.analysis.confidence}% confidence
                      </span>
                    </div>
                    <div style={{fontSize:".85rem",color:"#475569",lineHeight:1.6}}>{smartImport.analysis.summary}</div>
                    {!smartImport.analysis.canImport&&(
                      <div style={{marginTop:8,fontSize:".82rem",color:"#dc2626",fontWeight:600}}>⛔ {smartImport.analysis.cantImportReason}</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Stats row */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:20}}>
                {[
                  {l:"Total Rows",     v:smartImport.analysis.rowCount||smartImport.rows.length, c:"#3b82f6"},
                  {l:"Columns Found",  v:smartImport.analysis.fieldsFound?.length||0,            c:"#8b5cf6"},
                  {l:"Import Action",  v:smartImport.analysis.importAction||"Manual review",     c:"#0f172a"},
                ].map(({l,v,c})=>(
                  <div key={l} style={{background:"#f8fafc",borderRadius:10,padding:"12px 14px"}}>
                    <div style={{fontWeight:800,fontSize:".9rem",color:c}}>{v}</div>
                    <div style={{fontSize:".65rem",textTransform:"uppercase",letterSpacing:"1px",color:"#94a3b8",marginTop:3}}>{l}</div>
                  </div>
                ))}
              </div>

              {/* Fields detected */}
              {smartImport.analysis.fieldsFound?.length>0&&(
                <div style={{marginBottom:16}}>
                  <div style={{fontWeight:700,fontSize:".82rem",color:"#0f172a",marginBottom:8}}>Fields Detected</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                    {smartImport.analysis.fieldsFound.map(f=>(
                      <span key={f} style={{background:"#eff6ff",color:"#1d4ed8",border:"1px solid #bfdbfe",borderRadius:20,padding:"3px 10px",fontSize:".75rem",fontWeight:600}}>{f}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Issues/warnings */}
              {smartImport.analysis.issues?.length>0&&(
                <div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:8,padding:"12px 14px",marginBottom:16}}>
                  <div style={{fontWeight:700,fontSize:".8rem",color:"#92400e",marginBottom:6}}>⚠️ Data Quality Notes</div>
                  {smartImport.analysis.issues.map((iss,i)=>(
                    <div key={i} style={{fontSize:".8rem",color:"#78350f",marginBottom:3}}>• {iss}</div>
                  ))}
                </div>
              )}

              {/* Data preview table */}
              <div style={{marginBottom:20}}>
                <div style={{fontWeight:700,fontSize:".82rem",color:"#0f172a",marginBottom:8}}>Data Preview (first 5 rows)</div>
                <div style={{overflowX:"auto",border:"1px solid #e2e8f0",borderRadius:8}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:".78rem"}}>
                    <thead>
                      <tr style={{background:"#1e293b"}}>
                        {Object.keys(smartImport.rows[0]||{}).slice(0,8).map(k=>(
                          <th key={k} style={{padding:"8px 10px",textAlign:"left",color:"#fff",fontWeight:700,whiteSpace:"nowrap"}}>{k}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {smartImport.rows.slice(0,5).map((row,i)=>(
                        <tr key={i} style={{background:i%2?"#f8fafc":"#fff"}}>
                          {Object.values(row).slice(0,8).map((v,j)=>(
                            <td key={j} style={{padding:"7px 10px",color:"#475569",borderBottom:"1px solid #f1f5f9",maxWidth:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{String(v||"")}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{fontSize:".7rem",color:"#94a3b8",marginTop:5}}>Showing 5 of {smartImport.rows.length} rows · {Object.keys(smartImport.rows[0]||{}).length} total columns</div>
              </div>

              {/* Action buttons */}
              <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
                <button onClick={()=>setSmartImport(null)}
                  style={{background:"#f1f5f9",border:"none",borderRadius:8,padding:"10px 20px",fontFamily:"inherit",fontSize:".85rem",color:"#64748b",cursor:"pointer",fontWeight:600}}>
                  Cancel
                </button>
                {smartImport.analysis.canImport&&smartImport.analysis.dataType==="deals"&&(
                  <button onClick={()=>{
                    const rows=smartImport.rows;
                    let imported=0,skipped=0;
                    rows.forEach(r=>{
                      const client=String(r.client||r.Client||r["Client Name"]||r["client_name"]||r.company||"").trim();
                      if(!client) return;
                      const ceNo=String(r.ceNo||r["CE No"]||r["CE Number"]||r.ce_no||r["CE No."]||"").trim();
                      const exists=deals.find(d=>ceNo&&d.ceNo&&d.ceNo===ceNo);
                      const rec={
                        id:exists?.id||uid(),
                        client,
                        contact:String(r.contact||r.Contact||r["Project Name"]||r.project||"").trim(),
                        ceNo:ceNo||("CE-"+Date.now()),
                        ceType:String(r.ceType||r["CE Type"]||r.type||"Fabrication / General").trim(),
                        stage:normalizeStage(r.stage||r.Stage||r.status||"01 · BizDev"),
                        value:Number(r.value||r.Value||r["Contract Value"]||r.amount||0),
                        invoiced:Number(r.invoiced||r.Invoiced||0),
                        amountPaid:Number(r.amountPaid||r["Amount Paid"]||r.paid||0),
                        paymentStatus:String(r.paymentStatus||r["Payment Status"]||"Unpaid").trim(),
                        receiptType:String(r.receiptType||r["Receipt Type"]||"OR").trim(),
                        salesOwner:String(r.salesOwner||r["Sales Owner"]||r.ae||r.AE||"").trim(),
                        dateAcquired:String(r.dateAcquired||r["Date Acquired"]||r.date||today).trim(),
                        notes:String(r.notes||r.Notes||"").trim(),
                        product:String(r.product||r.Product||r["Product Type"]||"Custom Shelving").trim(),
                        priority:String(r.priority||r.Priority||"Normal").trim(),
                        bizDevSource:String(r.bizDevSource||r["Biz Dev Source"]||r.source||r.Source||"").trim(),
                        probability:50,
                      };
                      if(exists){
                        upDeals(ds=>ds.map(d=>d.id===exists.id?rec:d));
                        if(WON_STAGES.includes(rec.stage)){
                          upProjs(ps=>ps[rec.id]?ps:{...ps,[rec.id]:emptyProject()});
                          upPcards(ps=>ps[rec.id]?ps:{...ps,[rec.id]:emptyProjectCard(rec.id,rec)});
                        }
                        skipped++;
                      } else {
                        upDeals(ds=>[...ds,rec]);
                        if(WON_STAGES.includes(rec.stage)){
                          upProjs(ps=>ps[rec.id]?ps:{...ps,[rec.id]:emptyProject()});
                          upPcards(ps=>ps[rec.id]?ps:{...ps,[rec.id]:emptyProjectCard(rec.id,rec)});
                          // Auto-create a stub JO so the project is trackable without going through award modal
                          upJos(js=>js.find(j=>j.dealId===rec.id)?js:[...js,{
                            id:"jo"+rec.id,dealId:rec.id,
                            joNo:`JO-${new Date().getFullYear()}-${String(jos.length+imported+1).padStart(3,"0")}`,
                            client:rec.client,ceNo:rec.ceNo,projectName:rec.contact||rec.client,
                            value:rec.value,awardTrigger:"Imported",triggerDate:rec.dateAcquired||today,
                            pm1:"",pm2:"",pm3:"",coordinator:"",aeAssigned:rec.salesOwner||"",
                            startDate:rec.dateAcquired||today,commsLink:"",
                            scopeNotes:rec.notes||"",specialInstructions:"",
                            budgetStatus:"QS Budget Pending",status:"Active",issuedDate:today,
                          }]);
                        }
                        imported++;
                      }
                    });
                    logActivity(null,"Excel Import",`${imported} new + ${skipped} updated via Smart Import`);
                    setSmartImport(null);
                    toastEmit(`Import complete! ${imported} new deals added, ${skipped} existing updated.`,"success");
                  }}
                  style={{background:"#059669",border:"none",borderRadius:8,padding:"10px 20px",fontFamily:"inherit",fontSize:".85rem",color:"#fff",cursor:"pointer",fontWeight:700}}>
                    ✅ Confirm Import ({smartImport.rows.length} rows)
                  </button>
                )}
                {smartImport.analysis.canImport&&smartImport.analysis.dataType!=="deals"&&(
                  <div style={{background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:8,padding:"10px 16px",fontSize:".82rem",color:"#1d4ed8"}}>
                    ℹ️ {smartImport.analysis.dataType} data detected — use the matching module to import this data type.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </Wrap>
  );

  // ── INVENTORY ────────────────────────────────────────────────────────────────
  if(page==="inventory"||(role==="Warehouse"&&page==="home")) return(
    <Wrap>
      <InventoryView
        inventory={inventory} stocklog={stocklog} wonDeals={wonDeals}
        addInventoryItem={addInventoryItem} updateInventoryItem={updateInventoryItem}
        deleteInventoryItem={deleteInventoryItem} logStockMove={logStockMove}
        session={session} role={role}/>
    </Wrap>
  );

  if(page==="stockmove") return(
    <Wrap>
      <StockMovementView
        inventory={inventory} stocklog={stocklog} wonDeals={wonDeals}
        logStockMove={logStockMove} session={session} role={role}/>
    </Wrap>
  );

  if(page==="suppliers") return(<Wrap><SupplierMasterView suppliers={suppliers} addSupplier={addSupplier} updateSupplier={updateSupplier} deleteSupplier={deleteSupplier} session={session} role={role}/></Wrap>);
  if(page==="subcontractors") return(<Wrap><SubconMasterView subcons={subcons} addSubcon={addSubcon} updateSubcon={updateSubcon} deleteSubcon={deleteSubcon} session={session} role={role}/></Wrap>);

  // ── COST ANALYSIS (Budget + Costing Study combined) ─────────────────────────
  if(page==="costanalysis") return(
    <Wrap>
      <div style={{display:"flex",gap:10,marginBottom:20,borderBottom:"2px solid #e2e8f0",paddingBottom:12}}>
        {[["budget","💰 Budget"],["costing","📊 Costing Study"]].map(([tab,label])=>(
          <button key={tab} onClick={()=>setCostTab(tab)}
            style={{padding:"8px 20px",borderRadius:20,border:`2px solid ${costTab===tab?"#1e293b":"#e2e8f0"}`,background:costTab===tab?"#1e293b":"#fff",color:costTab===tab?"#fff":"#64748b",fontFamily:"inherit",fontWeight:costTab===tab?700:400,fontSize:".84rem",cursor:"pointer"}}>
            {label}
          </button>
        ))}
      </div>
      {costTab==="budget"
        ?<BudgetView wonDeals={wonDeals} budgets={budgets} saveBudget={saveBudget} prs={prs} exps={exps} role={role}/>
        :<CostingStudy wonDeals={wonDeals} budgets={budgets} prs={prs} exps={exps} projs={projs} role={role}/>
      }
    </Wrap>
  );

  // ── BILLING ─────────────────────────────────────────────────────────────────
  if(page==="billing") return(
    <Wrap>
      <BillingView
        billings={billings} wonDeals={wonDeals} deals={deals}
        addMilestone={addMilestone} updateMilestone={updateMilestone}
        deleteMilestone={deleteMilestone} logBillingPayment={logBillingPayment}
        nextInvoiceNo={nextInvoiceNo} session={session} role={role}/>
    </Wrap>
  );

  // ── DATA MANAGEMENT (Manager only) ──────────────────────────────────────────
    if(page==="datamanagement"&&session?.username!=="paulo"){
      return(<Wrap><div style={{textAlign:"center",padding:"60px",color:"#94a3b8"}}>
        <div style={{fontSize:"3rem",marginBottom:12}}>🔒</div>
        <div style={{fontWeight:700,color:"#0f172a",fontSize:"1.1rem"}}>CEO Only</div>
        <div style={{fontSize:".85rem",marginTop:6,color:"#64748b"}}>Data management is restricted to Paulo Garcia.</div>
      </div></Wrap>);
    }
  if(page==="datamanagement"&&role==="Manager") return(
    <Wrap>
      <DataManagement
        deals={deals} exps={exps} inflows={infs} jos={jos} prs={prs}
        mreqs={mreqs} breqs={breqs} addenda={addenda} billings={billings}
        pcards={pcards} checklist={checklist} cashPositions={cashPositions}
        actLog={actLog} budgets={budgets}
        upDeals={upDeals} upExps={upExps} upInflows={upInflows} upJos={upJos}
        upPrs={upPrs} upMreqs={upMreqs} upBreqs={upBreqs} upAddenda={upAddenda}
        upBillings={upBillings} upPcards={upPcards} upChecklist={upChecklist}
        upCashPos={upCashPos} setActLog={setActLog} upBudgets={upBudgets}
        persist={persist}/>
    </Wrap>
  );

  // ── ACCOUNTING (Expenses) ─────────────────────────────────────────────────
  if(page==="accounting") return(
    <Wrap>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
        <SecHead title="Accounting — Expenses" action={<Btn onClick={openAddExp}>+ Log Expense</Btn>}/>
        <button onClick={()=>{
          const rows=[["Date","Category","Description","Amount","Project","Receipt"]];
          exps.forEach(e=>rows.push([
            e.date||MONTHS[e.month]||"",e.category||"",e.note||"",
            Number(e.amount||0).toFixed(2),
            wonDeals.find(d=>d.id===e.projectId)?.client||"Company-wide",
            e.receipt||""
          ]));
          const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
          const a=document.createElement("a");
          a.href="data:text/csv;charset=utf-8,"+encodeURIComponent("\uFEFF"+csv);
          a.download=`GMD_Expenses_${today}.csv`;a.click();
        }} style={{background:"#eff6ff",border:"1.5px solid #bfdbfe",borderRadius:8,padding:"7px 14px",fontFamily:"inherit",fontSize:".78rem",fontWeight:700,color:"#1d4ed8",cursor:"pointer",flexShrink:0}}>
          ⬇ Export CSV
        </button>
      </div>
      <div style={{background:"#fff7ed",border:"1.5px solid #fed7aa",borderRadius:10,padding:"10px 16px",marginBottom:14,fontSize:".82rem",color:"#92400e"}}>
        📋 <strong>Accounting</strong> — Record all expenses here and tag them to projects. This matches what is being released from the bank to actual project costs.
      </div>
      {exps.length===0&&<EmptyState icon="📋" msg="No expenses logged yet. Hit + Log Expense to start recording."/>}
      {exps.map(e=>(
        <Card key={e.id}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,flexWrap:"wrap"}}>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,color:"#0f172a"}}>{e.note}</div>
              <div style={{fontSize:".75rem",color:"#64748b",marginTop:3,display:"flex",gap:10,flexWrap:"wrap"}}>
                <span>₱{Number(e.amount).toLocaleString("en-PH",{minimumFractionDigits:2})}</span>
                <span>{e.category}</span>
                {e.projectId&&<span>📁 {wonDeals.find(d=>d.id===e.projectId)?.client||e.projectId}</span>}
                <span>{e.date||e.month}</span>
              </div>
            </div>
            <div style={{display:"flex",gap:7}}>
              <button onClick={()=>openEditExp(e)} style={{background:"#f1f5f9",border:"none",borderRadius:7,padding:"5px 11px",fontSize:".73rem",color:"#475569",cursor:"pointer",fontWeight:600,fontFamily:"inherit"}}>✏</button>
              <button onClick={()=>delExp(e.id)} style={{background:"#fef2f2",border:"none",borderRadius:7,padding:"5px 11px",fontSize:".73rem",color:"#dc2626",cursor:"pointer",fontWeight:600,fontFamily:"inherit"}}>✕</button>
            </div>
          </div>
        </Card>
      ))}
      <ExpenseModal open={expModal} onClose={()=>setExpModal(false)} form={expForm} setForm={setExpForm} onSave={saveExp} editId={editExpId} projList={projList} clientName={clientName}/>
    </Wrap>
  );

  // ── MATERIAL REQUESTS ────────────────────────────────────────────────────────
  if(page==="materialreq") return(
    <Wrap>
      <MaterialRequestView
        mreqs={mreqs} addMR={addMR} updateMR={updateMR}
        prs={prs} addPR={addPR}
        wonDeals={wonDeals} session={session} role={role}/>
    </Wrap>
  );

  // ── BUDGET REQUESTS ───────────────────────────────────────────────────────
  if(page==="budgetreq") return(
    <Wrap>
      <BudgetRequestView
        breqs={breqs} addBR={addBR} updateBR={updateBR}
        wonDeals={wonDeals} session={session} role={role}/>
    </Wrap>
  );

  // ── SWATCHBOARD (Design + Cost Control + Procurement) ────────────────────
  if(page==="swatchboard") return(
    <Wrap>
      <ProcurementView swatches={swatches} projList={projList} clientName={clientName}
        openAddSwatch={openAddSwatch} openEditSwatch={openEditSwatch} delSwatch={delSwatch} swQ={swQ} Wrap={Wrap}/>
    </Wrap>
  );

  // ── BUDGET PAGE ──────────────────────────────────────────────────────────────
  if(page==="budget") return(
    <Wrap>
      <BudgetView
        wonDeals={wonDeals} budgets={budgets} saveBudget={saveBudget}
        prs={prs} exps={exps} role={role}/>
    </Wrap>
  );

  // ── COSTING STUDY PAGE ────────────────────────────────────────────────────
  if(page==="costing") return(
    <Wrap>
      <CostingStudy
        wonDeals={wonDeals} budgets={budgets} prs={prs}
        exps={exps} projs={projs} role={role}/>
    </Wrap>
  );

  // ── PROCUREMENT PAGE (Cost Control) ───────────────────────────────────────
  if((role==="Cost Control"||role==="Manager"||role==="Operations")&&page==="procurement") return(
    <Wrap>
      <ProcurementView2
        prs={prs} addPR={addPR} updatePR={updatePR} deletePR={deletePR}
        wonDeals={wonDeals} budgets={budgets} session={session} role={role}/>
    </Wrap>
  );

  // Clients directory (Manager, Sales, Finance)
  if(page==="clients") return(
    <Wrap>
      <ClientDirectory deals={deals} session={session} role={role} vvipClients={vvipClients} toggleVvip={toggleVvip}/>
    </Wrap>
  );

  // Accounts management (Manager only)
  if(role==="Manager"&&page==="accounts") return(
    <Wrap>
      <AccountsManager users={users} session={session} onApprove={approveUser} onReject={rejectUser} onDeactivate={deactivateUser} onDelete={deleteUser} onResetPw={resetPw} ROLES={ROLES}/>
    </Wrap>
  );
  return <Wrap><EmptyState icon="🔍" msg={`No view for ${role}/${page}`}/></Wrap>;
}

// ─── OPS VIEW ─────────────────────────────────────────────────────────────────
function OpsView({projs,projList,deals,selProj,setSelProj,opsTab,setOpsTab,proj,projDeal,upProj,overallProg,costOf,marginOf,openDesignEdit,swatches,swQ,openAddSwatch,openEditSwatch,delSwatch,exps,openAddExp,openEditExp,delExp,clientName,matModal,setMatModal,matForm,setMatForm,editMat,setEditMat,saveMat,addPmUpdate,addAddendum,updateAddendumStatus,session,Wrap,addenda,addAddendum2,updateAddendum,deleteAddendum}){
  const uid2=()=>String(Date.now());
  if(!selProj) return(
    <Wrap>
      <SecHead title="Projects" sub="Click any project to update stages, materials, and team"/>
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12}}>
        {projList.map(d=>{
          const p=projs[d.id]; if(!p) return null; const prog=overallProg(p);
          const pending=swatches.filter(s=>s.projectId===d.id&&s.status==="To Buy").length;
          const m=marginOf(p,d);
          const pc=pcards[d.id];
          const projDone=pc?DEPT_ORDER.every(dept=>pc.departments?.[dept]?.done):false;
          if(projDone) return null; // Completed projects filtered out below
          return(
            <Card key={d.id} onClick={()=>{setSelProj(d.id);setOpsTab("progress");}} accent={p?.currentStage==="Delivery"?"#6ee7b7":undefined}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                <div><div style={{fontWeight:700,color:"#0f172a"}}>{d.client}</div><div style={{fontSize:".75rem",color:"#64748b",marginTop:2}}>{d.product}</div></div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"flex-end"}}><Badge label={p?.currentStage||"Active"} color={PROD_CLR[p?.currentStage]||"#94a3b8"}/>{p?.currentStage==="Design"&&<Badge label={p.design?.status||"Briefing"} color={DS_CLR[p.design?.status||"Briefing"]}/>}</div>
              </div>
              <div style={{display:"flex",gap:2,marginBottom:8}}>
                {["Design","Fabrication","QC","Delivery"].map((s,i)=>{const done=["Design","Fabrication","QC","Delivery"].indexOf(p.currentStage)>i,cur=p.currentStage===s;return <div key={s} style={{flex:1,height:4,borderRadius:2,background:done||cur?PROD_CLR[s]:"#e2e8f0",opacity:cur?.6:1}}/>;  })}
              </div>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}><ProgBar pct={prog} color={PROD_CLR[p.currentStage]} h={6}/><span style={{fontWeight:700,color:PROD_CLR[p.currentStage],minWidth:36,fontSize:".85rem"}}>{prog}%</span></div>
              <div style={{display:"flex",gap:12,fontSize:".73rem",color:"#64748b",flexWrap:"wrap"}}>
                <span style={{color:"#10b981",fontWeight:600}}>{fmt(d.value)}</span>
                <span>Margin: <strong style={{color:m>=20?"#059669":"#f59e0b"}}>{m}%</strong></span>
                <span>Team: {p.team.length}</span>
                {pending>0&&<span style={{color:"#ef4444"}}>🛒 {pending} to buy</span>}
              </div>
            </Card>
          );
        })}
        {/* ── Completed Projects ── */}
        {(()=>{
          const completed=projList.filter(d=>{
            const pc=pcards[d.id];
            return pc&&DEPT_ORDER.every(dept=>pc.departments?.[dept]?.done);
          });
          if(!completed.length) return null;
          return(
            <div style={{gridColumn:"1/-1",marginTop:12}}>
              <div style={{fontWeight:700,color:"#94a3b8",fontSize:".78rem",textTransform:"uppercase",letterSpacing:"1px",marginBottom:8,display:"flex",alignItems:"center",gap:8}}>
                <span style={{width:8,height:8,borderRadius:"50%",background:"#10b981",display:"inline-block"}}/>
                Completed Projects ({completed.length})
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8}}>
                {completed.map(d=>(
                  <div key={d.id} style={{background:"#f0fdf4",borderRadius:10,border:"1.5px solid #6ee7b7",padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",opacity:.8}}>
                    <div>
                      <div style={{fontWeight:700,color:"#059669",fontSize:".85rem"}}>{d.client}</div>
                      <div style={{fontSize:".7rem",color:"#64748b",marginTop:1}}>{d.contact||d.ceNo} · {fmt(d.value)}</div>
                    </div>
                    <span style={{background:"#059669",color:"#fff",fontSize:".68rem",fontWeight:800,padding:"3px 10px",borderRadius:20}}>✅ DONE</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
        {projList.length===0&&<div style={{gridColumn:"1/-1"}}><EmptyState icon="⚙" msg="No active projects. Mark a deal as Won in the Pipeline to create a project."/></div>}
      </div>
    </Wrap>
  );

  const tabs=[["progress","📊 Progress"],["team","👥 Team"],["materials","📦 Materials"],["swatches","🛒 Swatchboard"],["costs","💰 Costs"],["updates","📝 PM Updates"],["addenda","⚠️ Addenda"]];
  return(
    <Wrap>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
        <Btn variant="ghost" small onClick={()=>setSelProj(null)}>← Back</Btn>
        <div style={{flex:1}}>
          <div style={{fontWeight:800,color:"#0f172a",fontSize:"1.05rem"}}>{projDeal?.client} — {projDeal?.product}</div>
          <div style={{fontSize:".74rem",color:"#64748b",marginTop:2}}>{projDeal?.contact} · Delivery: {proj?.stageDates?.Delivery?.e||"TBD"} · <span style={{color:PAY_CLR[projDeal?.paymentStatus]}}>{projDeal?.paymentStatus}</span></div>
        </div>
        <Badge label={proj?.currentStage} color={PROD_CLR[proj?.currentStage||"Design"]}/>
        <span style={{fontWeight:800,color:"#10b981"}}>{fmt(projDeal?.value)}</span>
      </div>
      <div style={{display:"flex",gap:2,borderBottom:"1.5px solid #e2e8f0",marginBottom:18}}>
        {tabs.map(([k,l])=>(
          <button key={k} onClick={()=>setOpsTab(k)} style={{background:"transparent",border:"none",borderBottom:`2.5px solid ${opsTab===k?"#f97316":"transparent"}`,padding:"8px 14px",fontFamily:"inherit",fontWeight:opsTab===k?700:400,fontSize:".82rem",color:opsTab===k?"#f97316":"#64748b",cursor:"pointer",marginBottom:-1.5,whiteSpace:"nowrap"}}>{l}</button>
        ))}
      </div>

      {opsTab==="progress"&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          {["Design","Fabrication","QC","Delivery"].map((s,i)=>{
            const done=["Design","Fabrication","QC","Delivery"].indexOf(proj.currentStage)>i;
            const cur=proj.currentStage===s; const locked=["Design","Fabrication","QC","Delivery"].indexOf(proj.currentStage)<i;
            const c=PROD_CLR[s]; const pct=proj.progress[s]||0;
            return(
              <Card key={s} accent={cur?c:undefined}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <span style={{fontWeight:700,color:cur?c:done?"#94a3b8":"#cbd5e1",fontSize:".92rem"}}>{s}</span>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <span style={{fontSize:".72rem",color:done?"#059669":cur?c:"#94a3b8"}}>{done?"✓ Done":cur?"In progress":"Pending"}</span>
                    {cur&&pct===100&&i<3&&<Btn small onClick={()=>upProj(selProj,p=>({...p,currentStage:["Design","Fabrication","QC","Delivery"][i+1]}))}>→ Next Stage</Btn>}
                  </div>
                </div>
                <input type="range" min={0} max={100} value={pct} disabled={locked||done} onChange={e=>upProj(selProj,p=>({...p,progress:{...p.progress,[s]:Number(e.target.value)}}))} style={{width:"100%",accentColor:c,marginBottom:6,cursor:locked||done?"not-allowed":"pointer"}}/>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:".72rem",color:"#94a3b8"}}>
                  <span>{proj.stageDates?.[s]?.s||"—"} → {proj.stageDates?.[s]?.e||"—"}</span>
                  <span style={{color:c,fontWeight:700}}>{pct}%</span>
                </div>
              </Card>
            );
          })}
          <div style={{gridColumn:"1/-1"}}>
            <Fld label="Project Notes">
              <Inp rows={3} value={proj.notes||""} onChange={e=>upProj(selProj,p=>({...p,notes:e.target.value}))} placeholder="Add notes for the team…"/>
            </Fld>
          </div>
        </div>
      )}

      {opsTab==="team"&&(
        <div style={{background:"#fff",borderRadius:14,border:"1.5px solid #e2e8f0",padding:20}}>
          <Fld label={`Production Team (${proj.team.length} assigned)`}>
            <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:16}}>
              {proj.team.map(m=>(
                <div key={m} style={{background:"#fff7ed",border:"1.5px solid #fed7aa",borderRadius:8,padding:"6px 12px",display:"flex",alignItems:"center",gap:8}}>
                  <div style={{width:24,height:24,borderRadius:"50%",background:`hsl(${m.charCodeAt(0)*17%360},45%,55%)`,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:".72rem",color:"#fff",flexShrink:0}}>{m[0]}</div>
                  <span style={{fontSize:".82rem",fontWeight:600}}>{m}</span>
                  <button onClick={()=>upProj(selProj,p=>({...p,team:p.team.filter(x=>x!==m)}))} style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:".8rem",padding:0}}>✕</button>
                </div>
              ))}
              {proj.team.length===0&&<span style={{fontSize:".8rem",color:"#94a3b8"}}>No team assigned yet.</span>}
            </div>
          </Fld>
          <Fld label="Add / Remove Members">
            <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
              {PROD_MEMBERS.map(m=>(
                <button key={m} onClick={()=>upProj(selProj,p=>({...p,team:p.team.includes(m)?p.team.filter(x=>x!==m):[...p.team,m]}))} style={{padding:"6px 13px",border:`1.5px solid ${proj.team.includes(m)?"#f97316":"#e2e8f0"}`,borderRadius:20,background:proj.team.includes(m)?"#fff7ed":"#fff",color:proj.team.includes(m)?"#f97316":"#64748b",fontWeight:proj.team.includes(m)?700:400,cursor:"pointer",fontSize:".8rem",fontFamily:"inherit"}}>
                  {proj.team.includes(m)?"✓ ":""}{m}
                </button>
              ))}
            </div>
          </Fld>
        </div>
      )}

      {opsTab==="materials"&&(<>
        <SecHead title={`Materials (${proj.materials.filter(m=>!m.received).length} pending)`} action={<Btn onClick={()=>{setMatForm({name:"",qty:"",unit:"pcs",cost:"",received:false});setEditMat(null);setMatModal(true);}}>+ Add Material</Btn>}/>
        {proj.materials.map(m=>(
          <Card key={m.id} accent={m.received?"#6ee7b7":undefined}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
              <div style={{display:"flex",alignItems:"center",gap:12,flex:1}}>
                <div onClick={()=>upProj(selProj,p=>({...p,materials:p.materials.map(x=>x.id===m.id?{...x,received:!x.received}:x)}))} style={{width:22,height:22,borderRadius:5,border:`2px solid ${m.received?"#10b981":"#cbd5e1"}`,background:m.received?"#10b981":"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  {m.received&&<span style={{color:"#fff",fontSize:".7rem",fontWeight:900}}>✓</span>}
                </div>
                <div>
                  <div style={{fontWeight:600,color:m.received?"#94a3b8":"#0f172a",textDecoration:m.received?"line-through":"none"}}>{m.name}</div>
                  <div style={{fontSize:".73rem",color:"#94a3b8",marginTop:2}}>{m.qty} {m.unit}</div>
                </div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
                <span style={{fontWeight:700,color:"#f59e0b",fontSize:".95rem"}}>{fmt(m.cost)}</span>
                <Badge label={m.received?"Received":"Pending"} color={m.received?"#10b981":"#ef4444"}/>
                <Btn small variant="ghost" onClick={()=>{setMatForm({...m});setEditMat(m.id);setMatModal(true);}}>✏ Edit</Btn>
                <Btn small variant="danger" onClick={()=>upProj(selProj,p=>({...p,materials:p.materials.filter(x=>x.id!==m.id)}))}>Delete</Btn>
              </div>
            </div>
          </Card>
        ))}
        {proj.materials.length===0&&<EmptyState icon="📦" msg="No materials added yet. Add the first one above."/>}
        <Modal open={matModal} onClose={()=>setMatModal(false)} title={editMat?"Edit Material":"Add Material"}>
          <Fld label="Material Name" required><Inp value={matForm.name} onChange={e=>setMatForm(p=>({...p,name:e.target.value}))} placeholder="e.g. Steel angle bars"/></Fld>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <Fld label="Quantity"><Inp type="number" value={matForm.qty} onChange={e=>setMatForm(p=>({...p,qty:e.target.value}))}/></Fld>
            <Fld label="Unit"><Sel value={matForm.unit} onChange={e=>setMatForm(p=>({...p,unit:e.target.value}))}>{MAT_UNITS.map(u=><option key={u}>{u}</option>)}</Sel></Fld>
          </div>
          <Fld label="Total Cost (₱)"><Inp type="number" value={matForm.cost} onChange={e=>setMatForm(p=>({...p,cost:e.target.value}))}/></Fld>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
            <div onClick={()=>setMatForm(p=>({...p,received:!p.received}))} style={{width:20,height:20,borderRadius:5,border:`2px solid ${matForm.received?"#10b981":"#cbd5e1"}`,background:matForm.received?"#10b981":"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              {matForm.received&&<span style={{color:"#fff",fontSize:".65rem",fontWeight:900}}>✓</span>}
            </div>
            <span style={{fontSize:".84rem",color:"#64748b"}}>Already received</span>
          </div>
          <div style={{display:"flex",gap:10}}><Btn full onClick={saveMat}>{editMat?"Save Changes":"Add Material"}</Btn><Btn variant="ghost" onClick={()=>setMatModal(false)}>Cancel</Btn></div>
        </Modal>
      </>)}

      {opsTab==="swatches"&&(()=>{
        const ps=swatches.filter(s=>s.projectId===selProj);
        return(
          <>
            <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontSize:".82rem",color:"#64748b"}}>{ps.filter(s=>s.status==="To Buy").length} to buy · {ps.filter(s=>s.status==="Ordered").length} ordered · {ps.filter(s=>s.status==="Received").length} received</div>
              <div style={{display:"flex",gap:8}}>
                <Btn small variant="accent" onClick={()=>openAddSwatch(selProj,"Design")}>+ Design adds</Btn>
                <Btn small onClick={()=>openAddSwatch(selProj,"Ops")}>+ Ops adds</Btn>
              </div>
            </div>
            {ps.map(sw=>(
              <Card key={sw.id} accent={SW_CLR[sw.status]}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",gap:7,alignItems:"center",flexWrap:"wrap",marginBottom:4}}>
                      <Badge label={sw.status} color={SW_CLR[sw.status]}/>
                      <Badge label={sw.category} color="#64748b"/>
                      <Badge label={`Added by ${sw.addedBy}`} color={sw.addedBy==="Design"?"#8b5cf6":"#f97316"}/>
                    </div>
                    <div style={{fontWeight:700,color:"#0f172a",textDecoration:sw.status==="Received"?"line-through":"none"}}>{sw.name}</div>
                    <div style={{fontSize:".75rem",color:"#64748b",marginTop:3}}>{sw.qty} {sw.unit} · {sw.supplier||"No supplier"}</div>
                    {sw.notes&&<div style={{fontSize:".73rem",color:"#94a3b8",marginTop:3,fontStyle:"italic"}}>{sw.notes}</div>}
                    {sw.swatchLink&&<a href={sw.swatchLink} target="_blank" rel="noreferrer" style={{fontSize:".72rem",color:"#3b82f6",marginTop:3,display:"block"}}>🔗 Reference</a>}
                  </div>
                  <div style={{textAlign:"right",flexShrink:0}}>
                    <div style={{fontWeight:700,color:"#f59e0b"}}>{sw.estCost?fmt(sw.estCost):"—"}</div>
                    <div style={{marginTop:8}}>
                      <select value={sw.status} onChange={e=>swQ(sw.id,e.target.value)} style={{border:`1.5px solid ${SW_CLR[sw.status]}`,borderRadius:8,padding:"5px 9px",fontFamily:"inherit",fontSize:".78rem",color:SW_CLR[sw.status],fontWeight:700,background:SW_CLR[sw.status]+"12",cursor:"pointer",marginBottom:6,width:"100%"}}>
                        {SWATCH_STATUS.map(s=><option key={s} style={{color:"#0f172a",background:"#fff",fontWeight:400}}>{s}</option>)}
                      </select>
                    </div>
                    <div style={{display:"flex",gap:6,justifyContent:"flex-end"}}>
                      <Btn small variant="ghost" onClick={()=>openEditSwatch(sw)}>✏ Edit</Btn>
                      <Btn small variant="danger" onClick={()=>delSwatch(sw.id)}>Delete</Btn>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
            {ps.length===0&&<EmptyState icon="🛒" msg="No swatch items yet. Design and Ops can both add items."/>}
          </>
        );
      })()}

      {opsTab==="costs"&&(()=>{
        const p=proj; const d=projDeal;
        const projExpList=exps.filter(e=>e.projectId===selProj);
        const totalOps=costOf(p);
        const profit=d.value-totalOps;
        const margin=d.value>0?Math.round(profit/d.value*100):0;
        return(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            <div>
              <Card>
                <div style={{fontWeight:700,color:"#0f172a",marginBottom:14}}>Cost Breakdown</div>
                {[["Materials",(p.materials||[]).reduce((s,m)=>s+m.cost,0),"#f59e0b"],["Labor",p.laborCost||0,"#8b5cf6"],["Overhead",p.overhead||0,"#3b82f6"],["Total",totalOps,"#ef4444"]].map(([l,v,c],i)=>(
                  <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:i<3?"1px solid #f1f5f9":"none",fontSize:".87rem"}}>
                    <span style={{color:"#64748b",fontWeight:i===3?700:400}}>{l}</span>
                    <span style={{fontWeight:700,color:c}}>{fmt(v)}</span>
                  </div>
                ))}
                <div style={{background:"#f8fafc",borderRadius:10,padding:"14px 16px",marginTop:14}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:6,fontSize:".85rem"}}><span style={{color:"#64748b"}}>Contract Value</span><span style={{color:"#10b981",fontWeight:700}}>{fmt(d.value)}</span></div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontWeight:700}}>Gross Margin</span>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.5rem",color:margin>=20?"#059669":"#f59e0b"}}>{margin}%</div>
                      <div style={{fontSize:".7rem",color:"#94a3b8"}}>{fmt(profit)} profit</div>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
            <div>
              <SecHead title="Project Expenses" action={<Btn small onClick={()=>openAddExp(selProj)}>+ Add</Btn>}/>
              {projExpList.map(e=>(
                <Card key={e.id}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div><Badge label={e.category} color="#64748b"/><div style={{fontWeight:600,color:"#0f172a",marginTop:4,fontSize:".85rem"}}>{e.note}</div><div style={{fontSize:".7rem",color:"#94a3b8",marginTop:2}}>{MONTHS[e.month]}</div>{e.receipt&&<a href={e.receipt} target="_blank" rel="noreferrer" style={{fontSize:".7rem",color:"#3b82f6",display:"block",marginTop:2}}>📎 Receipt</a>}</div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontWeight:700,color:"#ef4444"}}>{fmt(e.amount)}</div>
                      <div style={{display:"flex",gap:5,marginTop:6}}><Btn small variant="ghost" onClick={()=>openEditExp(e)}>✏ Edit</Btn><Btn small variant="danger" onClick={()=>delExp(e.id)}>Del</Btn></div>
                    </div>
                  </div>
                </Card>
              ))}
              {projExpList.length===0&&<EmptyState icon="📋" msg="No expenses tagged to this project yet."/>}
            </div>
          </div>
        );
      })()}

      {/* PM UPDATES TAB */}
      {opsTab==="updates"&&(()=>{
        const updates=proj.pmUpdates||[];
        const[newUpd,setNewUpd]=useState("");
        return(
          <div>
            <div style={{background:"#fff",borderRadius:14,border:"1.5px solid #e2e8f0",padding:18,marginBottom:14}}>
              <div style={{fontWeight:700,color:"#0f172a",fontSize:".9rem",marginBottom:10}}>📝 Log PM Update <span style={{fontSize:".72rem",color:"#94a3b8",fontWeight:400,marginLeft:6}}>Daily/weekly — client-visible progress</span></div>
              <div style={{display:"flex",gap:10,alignItems:"flex-end"}}>
                <div style={{flex:1}}><FInp rows={2} value={newUpd} onChange={e=>setNewUpd(e.target.value)} style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"10px 13px",fontFamily:"inherit",fontSize:".87rem",color:"#1e293b",boxSizing:"border-box",resize:"vertical"}} placeholder="e.g. Steel frame 60% complete. Laminate delivery confirmed tomorrow. Client notified via Viber."/></div>
                <Btn onClick={()=>{addPmUpdate(selProj,newUpd,session?.name);setNewUpd("");}} disabled={!newUpd.trim()}>Post Update</Btn>
              </div>
            </div>
            {updates.length===0&&<EmptyState icon="📝" msg="No PM updates yet. Log daily or weekly updates here."/>}
            {updates.map(u=>(
              <Card key={u.id}>
                <div style={{fontSize:".88rem",color:"#0f172a",lineHeight:1.6}}>{u.text}</div>
                <div style={{fontSize:".72rem",color:"#94a3b8",marginTop:5}}>{u.by} · {u.date}{u.time&&` at ${u.time}`}</div>
              </Card>
            ))}
          </div>
        );
      })()}

      {/* ADDENDA TAB — full workflow */}
      {opsTab==="addenda"&&(()=>{
        const projAddenda=(addenda||[]).filter(a=>a.projectId===selProj);
        const[showAF,setShowAF]=useState(false);
        const[af,setAf]=useState({title:"",desc:"",value:"",ceNo:"",receiptType:"OR",withholding:false,discoveredBy:session?.name||"",notes:""});
        const faf=(k,v)=>setAf(p=>({...p,[k]:v}));
        const totalApproved=projAddenda.filter(a=>a.status!=="Rejected").reduce((s,a)=>s+Number(a.value||0),0);
        const originalVal=Number(projDeal?.value||0);
        return(
          <div>
            {/* Header summary */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:14}}>
              {[
                {l:"Original Contract",  v:"₱"+originalVal.toLocaleString("en-PH",{minimumFractionDigits:0}), c:"#0f172a"},
                {l:"Addenda Value",      v:"₱"+totalApproved.toLocaleString("en-PH",{minimumFractionDigits:0}), c:"#f59e0b"},
                {l:"Total Project Value",v:"₱"+(originalVal+totalApproved).toLocaleString("en-PH",{minimumFractionDigits:0}), c:"#10b981"},
              ].map(({l,v,c})=>(
                <div key={l} style={{background:"#fff",borderRadius:10,padding:"12px 14px",border:"1.5px solid #e2e8f0"}}>
                  <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.1rem",color:c}}>{v}</div>
                  <div style={{fontSize:".63rem",textTransform:"uppercase",letterSpacing:"1px",color:"#94a3b8",marginTop:4}}>{l}</div>
                </div>
              ))}
            </div>

            <div style={{background:"#fff7ed",border:"1.5px solid #fed7aa",borderRadius:10,padding:"10px 14px",marginBottom:14,fontSize:".8rem",color:"#92400e"}}>
              ⚠️ <strong>Addendum Protocol:</strong> Operations logs scope changes → Sales is notified to coordinate with client → Client approves → Separate billing created. Each addendum may have its own CE number depending on size.
            </div>

            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{fontWeight:700,color:"#0f172a",fontSize:".9rem"}}>{projAddenda.length} Addendum{projAddenda.length!==1?"a":""}</div>
              <Btn small onClick={()=>setShowAF(s=>!s)}>+ Log Scope Change</Btn>
            </div>

            {/* Add form */}
            {showAF&&(
              <div style={{background:"#fff7ed",border:"1.5px solid #fed7aa",borderRadius:12,padding:16,marginBottom:14}}>
                <div style={{fontWeight:700,color:"#92400e",marginBottom:12}}>New Scope Change / Addendum</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  <div style={{gridColumn:"1/-1"}}>
                    <Fld label="Title / Scope Change" required>
                      <Inp value={af.title} onChange={e=>faf("title",e.target.value)} placeholder="e.g. Additional glass shelving Unit 3B — client requested during site visit"/>
                    </Fld>
                  </div>
                  <div style={{gridColumn:"1/-1"}}>
                    <Fld label="Description / Impact">
                      <Inp rows={3} value={af.desc} onChange={e=>faf("desc",e.target.value)} placeholder="What changed, why it changed, impact on timeline and cost…"/>
                    </Fld>
                  </div>
                  <Fld label="Addendum Value (₱)" hint="Estimated cost of this scope change">
                    <Inp type="number" value={af.value} onChange={e=>faf("value",e.target.value)} placeholder="0.00"/>
                  </Fld>
                  <Fld label="CE Number" hint="Assign if large enough to warrant separate CE">
                    <Inp value={af.ceNo} onChange={e=>faf("ceNo",e.target.value)} placeholder="e.g. CE-2026-001-A (optional)"/>
                  </Fld>
                  <Fld label="Receipt Type">
                    <Sel value={af.receiptType} onChange={e=>faf("receiptType",e.target.value)}>
                      <option value="OR">🧾 OR (with VAT)</option>
                      <option value="AR">📄 AR (no VAT)</option>
                    </Sel>
                  </Fld>
                  <Fld label="Withholding Tax (EWT 2%)">
                    <Sel value={af.withholding?"YES":"NO"} onChange={e=>faf("withholding",e.target.value==="YES")}>
                      <option value="NO">No withholding</option>
                      <option value="YES">Yes — client withholds 2%</option>
                    </Sel>
                  </Fld>
                  <Fld label="Discovered By">
                    <Inp value={af.discoveredBy} onChange={e=>faf("discoveredBy",e.target.value)} placeholder={session?.name||""}/>
                  </Fld>
                  <div style={{gridColumn:"1/-1"}}>
                    <Fld label="Notes">
                      <Inp rows={2} value={af.notes} onChange={e=>faf("notes",e.target.value)} placeholder="Supporting details, client conversation notes, photos in Drive…"/>
                    </Fld>
                  </div>
                </div>
                <div style={{display:"flex",gap:8,marginTop:12}}>
                  <Btn onClick={()=>{
                    if(!af.title) return;
                    addAddendum2({...af,projectId:selProj,projectName:projDeal?.client||"",status:"Discovered",salesNotified:false,clientApproved:false});
                    setAf({title:"",desc:"",value:"",ceNo:"",receiptType:"OR",withholding:false,discoveredBy:session?.name||"",notes:""});
                    setShowAF(false);
                  }}>Log Scope Change</Btn>
                  <Btn variant="ghost" onClick={()=>setShowAF(false)}>Cancel</Btn>
                </div>
              </div>
            )}

            {projAddenda.length===0&&!showAF&&<EmptyState icon="📋" msg="No addenda logged. When Operations discovers a scope change, log it here — Sales gets notified automatically."/>}

            {/* Addenda list */}
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {projAddenda.map(a=>{
                const tx=calcTax(a.value||0,a.receiptType||"OR",a.withholding||false);
                const statusClr=ADDENDUM_STATUS_CLR[a.status]||"#94a3b8";
                return(
                  <div key={a.id} style={{background:"#fff",borderRadius:12,border:`1.5px solid ${statusClr}44`,padding:"14px 18px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,flexWrap:"wrap"}}>
                      <div style={{flex:1}}>
                        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginBottom:6}}>
                          <span style={{fontWeight:700,color:"#0f172a"}}>{a.title}</span>
                          <span style={{fontSize:".7rem",background:statusClr+"22",color:statusClr,border:`1px solid ${statusClr}55`,borderRadius:20,padding:"1px 9px",fontWeight:700}}>{a.status}</span>
                          {a.ceNo&&<span style={{fontSize:".7rem",color:"#64748b",background:"#f1f5f9",padding:"1px 8px",borderRadius:5}}>{a.ceNo}</span>}
                        </div>
                        {a.desc&&<div style={{fontSize:".8rem",color:"#475569",lineHeight:1.6,marginBottom:8}}>{a.desc}</div>}

                        {/* Value breakdown */}
                        {Number(a.value)>0&&(
                          <div style={{background:"#f8fafc",borderRadius:8,padding:"8px 12px",display:"flex",gap:16,flexWrap:"wrap",marginBottom:8,fontSize:".75rem"}}>
                            <div><span style={{color:"#94a3b8"}}>Base: </span><strong>₱{Number(a.value).toLocaleString("en-PH")}</strong></div>
                            <div><span style={{color:"#94a3b8"}}>{a.receiptType==="OR"?"VAT 12%":"No VAT"}: </span><strong style={{color:"#f59e0b"}}>₱{tx.vat.toLocaleString("en-PH",{minimumFractionDigits:0})}</strong></div>
                            {a.withholding&&<div><span style={{color:"#94a3b8"}}>EWT 2%: </span><strong style={{color:"#ef4444"}}>-₱{tx.ewt.toLocaleString("en-PH",{minimumFractionDigits:0})}</strong></div>}
                            <div><span style={{color:"#94a3b8"}}>Net Receivable: </span><strong style={{color:"#059669"}}>₱{tx.netReceivable.toLocaleString("en-PH",{minimumFractionDigits:0})}</strong></div>
                          </div>
                        )}

                        {/* Workflow status flags */}
                        <div style={{display:"flex",gap:8,flexWrap:"wrap",fontSize:".72rem"}}>
                          <span style={{color:a.salesNotified?"#059669":"#f59e0b",fontWeight:600,background:a.salesNotified?"#f0fdf4":"#fffbeb",padding:"2px 9px",borderRadius:20,border:`1px solid ${a.salesNotified?"#6ee7b7":"#fde68a"}`}}>
                            {a.salesNotified?"✓ Sales notified":"⚠ Sales not yet notified"}
                          </span>
                          <span style={{color:a.clientApproved?"#059669":"#94a3b8",fontWeight:600,background:a.clientApproved?"#f0fdf4":"#f8fafc",padding:"2px 9px",borderRadius:20,border:`1px solid ${a.clientApproved?"#6ee7b7":"#e2e8f0"}`}}>
                            {a.clientApproved?"✓ Client approved":"Pending client approval"}
                          </span>
                          <span style={{fontSize:".68rem",color:"#94a3b8"}}>By {a.discoveredBy} · {a.createdDate}</span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div style={{display:"flex",flexDirection:"column",gap:6,flexShrink:0,minWidth:160}}>
                        <select value={a.status} onChange={e=>updateAddendum(a.id,{status:e.target.value})}
                          style={{border:"1.5px solid #e2e8f0",borderRadius:7,padding:"6px 10px",fontFamily:"inherit",fontSize:".78rem",color:"#0f172a",background:"#fff",cursor:"pointer",width:"100%"}}>
                          {ADDENDUM_STATUSES.map(s=><option key={s}>{s}</option>)}
                        </select>
                        <div style={{display:"flex",gap:6}}>
                          <button onClick={()=>updateAddendum(a.id,{salesNotified:true})}
                            disabled={a.salesNotified}
                            style={{flex:1,background:a.salesNotified?"#f0fdf4":"#fffbeb",border:`1.5px solid ${a.salesNotified?"#6ee7b7":"#fde68a"}`,borderRadius:7,padding:"5px 8px",fontSize:".68rem",color:a.salesNotified?"#059669":"#92400e",cursor:a.salesNotified?"default":"pointer",fontWeight:600,fontFamily:"inherit"}}>
                            {a.salesNotified?"Notified":"Notify Sales"}
                          </button>
                          <button onClick={()=>updateAddendum(a.id,{clientApproved:true,status:"Approved"})}
                            disabled={a.clientApproved}
                            style={{flex:1,background:a.clientApproved?"#f0fdf4":"#f8fafc",border:`1.5px solid ${a.clientApproved?"#6ee7b7":"#e2e8f0"}`,borderRadius:7,padding:"5px 8px",fontSize:".68rem",color:a.clientApproved?"#059669":"#64748b",cursor:a.clientApproved?"default":"pointer",fontWeight:600,fontFamily:"inherit"}}>
                            {a.clientApproved?"Approved":"Mark Approved"}
                          </button>
                        </div>
                        <button onClick={()=>{if(window.confirm("Delete this addendum?"))deleteAddendum(a.id);}}
                          style={{background:"#fef2f2",border:"1.5px solid #fecaca",borderRadius:7,padding:"5px",fontSize:".72rem",color:"#dc2626",cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

    </Wrap>
  );
}

// ─── DESIGN REQUEST FORM (DRF) VIEW ──────────────────────────────────────────
function DRFView({drfs,addDRF,updateDRF,deleteDRF,wonDeals,session,role}){
  const[showForm,setShowForm]=useState(false);
  const[editId,setEditId]=useState(null);
  const[form,setForm]=useState(emptyDRF());
  const[filterSt,setFilterSt]=useState("All");
  const f=(k,v)=>setForm(p=>({...p,[k]:v}));

  const openNew=()=>{setForm({...emptyDRF(),createdBy:session?.name||""});setEditId(null);setShowForm(true);};
  const openEdit=(d)=>{setForm({...d});setEditId(d.id);setShowForm(true);};
  const save=()=>{
    if(!form.projectTitle||!form.client) return;
    if(editId) updateDRF(editId,form); else addDRF({...form,createdBy:session?.name||""});
    setShowForm(false);setEditId(null);
  };
  const setAccessory=(i,v)=>f("accessories",form.accessories.map((a,ai)=>ai===i?v:a));
  const addAccessory=()=>f("accessories",[...form.accessories,""]);
  const removeAccessory=(i)=>f("accessories",form.accessories.filter((_,ai)=>ai!==i));
  const setRef=(i,v)=>f("refLinks",form.refLinks.map((r,ri)=>ri===i?v:r));

  const shown=filterSt==="All"?drfs:drfs.filter(d=>d.status===filterSt);
  const canCreate=["Manager","Sales","Operations"].includes(role);
  const canAcknowledge=["Manager","Design"].includes(role);

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:12}}>
        <div>
          <h2 style={{margin:0,fontWeight:800,color:"#0f172a",fontSize:"1.15rem"}}>Design Request Forms</h2>
          <div style={{fontSize:".75rem",color:"#64748b",marginTop:2}}>AE submits → Design receives brief → Approved files stored</div>
        </div>
        {canCreate&&<button onClick={openNew} style={{background:"#ec4899",border:"none",borderRadius:10,padding:"9px 18px",fontFamily:"inherit",fontWeight:700,fontSize:".84rem",color:"#fff",cursor:"pointer"}}>+ New DRF</button>}
      </div>

      {/* Status filter */}
      <div style={{display:"flex",gap:7,marginBottom:16,flexWrap:"wrap"}}>
        {["All",...DRF_STATUSES].map(s=>(
          <button key={s} onClick={()=>setFilterSt(s)} style={{padding:"5px 13px",borderRadius:20,border:`1.5px solid ${filterSt===s?DRF_CLR[s]||"#ec4899":"#e2e8f0"}`,background:filterSt===s?(DRF_CLR[s]||"#ec4899")+"18":"#fff",color:filterSt===s?DRF_CLR[s]||"#ec4899":"#64748b",fontWeight:filterSt===s?700:400,cursor:"pointer",fontFamily:"inherit",fontSize:".78rem"}}>{s}</button>
        ))}
      </div>

      {/* Form */}
      {showForm&&(
        <div style={{background:"#fff",borderRadius:14,border:"1.5px solid #e2e8f0",padding:20,marginBottom:18,boxShadow:"0 4px 16px rgba(0,0,0,.08)"}}>
          <div style={{fontWeight:800,color:"#0f172a",fontSize:".95rem",marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span>{editId?"Edit DRF":"New Design Request Form"}</span>
            {editId&&<span style={{fontSize:".75rem",color:"#94a3b8",fontWeight:400}}>{drfs.find(d=>d.id===editId)?.drfNo}</span>}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            <Fld label="Client" required><Inp value={form.client} onChange={e=>f("client",e.target.value)} placeholder="Client name"/></Fld>
            <Fld label="Location"><Inp value={form.location} onChange={e=>f("location",e.target.value)} placeholder="e.g. SM Megamall Unit 3B"/></Fld>
            <div style={{gridColumn:"1/-1"}}><Fld label="Project Title" required><Inp value={form.projectTitle} onChange={e=>f("projectTitle",e.target.value)} placeholder="e.g. Golf Bag Organizer Rack / Shirts Display"/></Fld></div>
            <Fld label="Type"><Sel value={form.type} onChange={e=>f("type",e.target.value)}>{DRF_TYPES.map(t=><option key={t}>{t}</option>)}</Sel></Fld>
            <Fld label="Size / Dimensions"><Inp value={form.size} onChange={e=>f("size",e.target.value)} placeholder="e.g. W1200 x H1800 x D600mm"/></Fld>
            <Fld label="Assigned Designer"><Sel value={form.designer} onChange={e=>f("designer",e.target.value)}><option value="">— Assign later —</option>{DESIGN_MEMBERS.map(m=><option key={m}>{m}</option>)}</Sel></Fld>
            <Fld label="Design Deadline"><Inp type="date" value={form.designDeadline} onChange={e=>f("designDeadline",e.target.value)}/></Fld>
            <Fld label="Linked Deal / Project"><Sel value={form.dealId} onChange={e=>{const d=wonDeals.find(x=>x.id===e.target.value);f("dealId",e.target.value);if(d&&!form.client)f("client",d.client);}}><option value="">— Link to deal (optional) —</option>{wonDeals.map(d=><option key={d.id} value={d.id}>{d.client}{d.contact?` — ${d.contact}`:""}</option>)}</Sel></Fld>
            <div style={{gridColumn:"1/-1"}}><Fld label="Description / Details" hint="What needs to be designed? Include dimensions, function, and key specs."><Inp rows={5} value={form.description} onChange={e=>f("description",e.target.value)} placeholder="RE-CREATE: Golf bag organizer rack with shelving&#10;SIZE: Must fit two large golf bags&#10;FUNCTION: Store 2 bags + shoe shelf (3-4 pairs) + drawer cabinet"/></Fld></div>
            {/* Accessories / Components */}
            <div style={{gridColumn:"1/-1"}}>
              <div style={{fontSize:".8rem",fontWeight:700,color:"#64748b",marginBottom:6}}>Accessories / Components</div>
              {form.accessories.map((a,i)=>(
                <div key={i} style={{display:"flex",gap:8,marginBottom:6}}>
                  <Inp value={a} onChange={e=>setAccessory(i,e.target.value)} placeholder={`e.g. Shelving for shoes (3-4 pairs)`}/>
                  <button onClick={()=>removeAccessory(i)} style={{background:"#fef2f2",border:"none",borderRadius:7,padding:"6px 10px",color:"#dc2626",cursor:"pointer",fontFamily:"inherit",fontSize:".8rem",fontWeight:700,flexShrink:0}}>✕</button>
                </div>
              ))}
              <button onClick={addAccessory} style={{background:"#f8fafc",border:"1.5px dashed #e2e8f0",borderRadius:8,padding:"7px 14px",fontFamily:"inherit",fontSize:".78rem",color:"#64748b",cursor:"pointer",fontWeight:600}}>+ Add Component</button>
            </div>
            {/* Reference image links */}
            <div style={{gridColumn:"1/-1"}}>
              <div style={{fontSize:".8rem",fontWeight:700,color:"#64748b",marginBottom:6}}>Reference Images (links)</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                {form.refLinks.map((r,i)=>(
                  <Fld key={i} label={`Ref ${i+1}`}><Inp type="url" value={r} onChange={e=>setRef(i,e.target.value)} placeholder="https://…"/></Fld>
                ))}
              </div>
            </div>
            {/* Approved files link — shown when status is Approved or Done */}
            {(editId&&["Approved","Done"].includes(form.status))&&(
              <div style={{gridColumn:"1/-1"}}><Fld label="✅ Approved Files Link" hint="Google Drive / Dropbox link to final approved drawings"><Inp type="url" value={form.approvedLink} onChange={e=>f("approvedLink",e.target.value)} placeholder="https://drive.google.com/…"/></Fld></div>
            )}
            {editId&&canAcknowledge&&(
              <Fld label="Status"><Sel value={form.status} onChange={e=>f("status",e.target.value)}>{DRF_STATUSES.map(s=><option key={s}>{s}</option>)}</Sel></Fld>
            )}
            <div style={{gridColumn:"1/-1"}}><Fld label="Notes"><Inp rows={2} value={form.notes} onChange={e=>f("notes",e.target.value)} placeholder="Any additional notes, brand guidelines, restrictions…"/></Fld></div>
          </div>
          <div style={{display:"flex",gap:10,marginTop:14}}>
            <button onClick={save} disabled={!form.projectTitle||!form.client}
              style={{background:form.projectTitle&&form.client?"#ec4899":"#e2e8f0",border:"none",borderRadius:10,padding:"10px 22px",fontFamily:"inherit",fontWeight:700,fontSize:".87rem",color:form.projectTitle&&form.client?"#fff":"#94a3b8",cursor:form.projectTitle&&form.client?"pointer":"not-allowed"}}>
              {editId?"Update DRF":"Submit DRF"}
            </button>
            <button onClick={()=>{setShowForm(false);setEditId(null);}} style={{background:"transparent",border:"1.5px solid #e2e8f0",borderRadius:10,padding:"10px 18px",fontFamily:"inherit",fontWeight:600,fontSize:".84rem",color:"#64748b",cursor:"pointer"}}>Cancel</button>
          </div>
        </div>
      )}

      {/* DRF List */}
      {shown.length===0&&<div style={{textAlign:"center",padding:"32px 0",color:"#94a3b8",fontSize:".84rem"}}>No design requests yet.</div>}
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {shown.map(drf=>{
          const deal=wonDeals.find(d=>d.id===drf.dealId);
          const isNew=drf.status==="New";
          return(
            <div key={drf.id} style={{background:"#fff",borderRadius:12,border:`1.5px solid ${isNew?"#fecaca":"#e2e8f0"}`,padding:"14px 18px",boxShadow:"0 1px 4px rgba(0,0,0,.04)"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,flexWrap:"wrap"}}>
                <div style={{flex:1,minWidth:200}}>
                  <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginBottom:6}}>
                    <span style={{fontWeight:700,color:"#ec4899",fontSize:".75rem"}}>{drf.drfNo}</span>
                    <span style={{fontSize:".68rem",background:DRF_CLR[drf.status]+"22",color:DRF_CLR[drf.status],border:`1px solid ${DRF_CLR[drf.status]}44`,borderRadius:20,padding:"1px 9px",fontWeight:700}}>{drf.status}</span>
                    <span style={{fontSize:".68rem",color:"#94a3b8",background:"#f1f5f9",padding:"1px 8px",borderRadius:20}}>{drf.type}</span>
                    {deal&&<span style={{fontSize:".68rem",color:"#3b82f6",background:"#eff6ff",padding:"1px 8px",borderRadius:20}}>📁 {deal.client}</span>}
                  </div>
                  <div style={{fontWeight:700,color:"#0f172a",fontSize:".98rem"}}>{drf.projectTitle}</div>
                  <div style={{fontSize:".75rem",color:"#64748b",marginTop:3,display:"flex",gap:12,flexWrap:"wrap"}}>
                    {drf.client&&<span>👤 {drf.client}</span>}
                    {drf.location&&<span>📍 {drf.location}</span>}
                    {drf.designer&&<span>🎨 {drf.designer}</span>}
                    {drf.designDeadline&&<span>📅 Due: {drf.designDeadline}</span>}
                    {drf.size&&<span>📐 {drf.size}</span>}
                  </div>
                  {drf.description&&<div style={{fontSize:".78rem",color:"#475569",marginTop:8,background:"#f8fafc",borderRadius:8,padding:"8px 10px",whiteSpace:"pre-wrap",lineHeight:1.5}}>{drf.description}</div>}
                  {drf.accessories?.length>0&&(
                    <div style={{marginTop:6}}>
                      <div style={{fontSize:".72rem",color:"#94a3b8",fontWeight:600,marginBottom:3}}>ACCESSORIES / COMPONENTS</div>
                      {drf.accessories.filter(Boolean).map((a,i)=>(
                        <div key={i} style={{fontSize:".75rem",color:"#475569",display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                          <span style={{color:"#ec4899",fontWeight:700}}>—</span>{a}
                        </div>
                      ))}
                    </div>
                  )}
                  {drf.refLinks?.filter(Boolean).length>0&&(
                    <div style={{marginTop:6,display:"flex",gap:8,flexWrap:"wrap"}}>
                      {drf.refLinks.filter(Boolean).map((r,i)=>(
                        <a key={i} href={r} target="_blank" rel="noreferrer" style={{fontSize:".72rem",color:"#3b82f6",fontWeight:600}}>🖼 Ref {i+1}</a>
                      ))}
                    </div>
                  )}
                  {drf.approvedLink&&(
                    <div style={{marginTop:6}}>
                      <a href={drf.approvedLink} target="_blank" rel="noreferrer" style={{fontSize:".78rem",color:"#059669",fontWeight:700}}>✅ View Approved Files →</a>
                    </div>
                  )}
                </div>
                <div style={{display:"flex",gap:6,flexShrink:0,flexWrap:"wrap"}}>
                  {isNew&&canAcknowledge&&(
                    <button onClick={()=>updateDRF(drf.id,{status:"Acknowledged"})}
                      style={{background:"#3b82f6",border:"none",borderRadius:8,padding:"6px 14px",color:"#fff",fontFamily:"inherit",fontWeight:700,fontSize:".75rem",cursor:"pointer"}}>
                      ✓ Acknowledge
                    </button>
                  )}
                  <button onClick={()=>openEdit(drf)} style={{background:"#f1f5f9",border:"none",borderRadius:8,padding:"6px 12px",fontSize:".73rem",color:"#475569",cursor:"pointer",fontWeight:600,fontFamily:"inherit"}}>✏ Edit</button>
                  {(role==="Manager"||drf.createdBy===session?.name)&&(
                    <button onClick={()=>{if(window.confirm("Delete this DRF?"))deleteDRF(drf.id);}} style={{background:"#fef2f2",border:"none",borderRadius:8,padding:"6px 12px",fontSize:".73rem",color:"#dc2626",cursor:"pointer",fontWeight:600,fontFamily:"inherit"}}>✕</button>
                  )}
                </div>
              </div>
              <div style={{fontSize:".68rem",color:"#94a3b8",marginTop:8}}>Submitted by {drf.createdBy||"—"} · {drf.createdAt}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── PROCUREMENT VIEW ─────────────────────────────────────────────────────────
function ProcurementView({swatches,projList,clientName,openAddSwatch,openEditSwatch,delSwatch,swQ,Wrap}){
  const toBuy=swatches.filter(s=>s.status==="To Buy");
  const ordered=swatches.filter(s=>s.status==="Ordered");
  const received=swatches.filter(s=>s.status==="Received");
  const approved=swatches.filter(s=>s.status==="Client Approved");
  const[filter,setFilter]=useState("All");
  const shown=filter==="All"?swatches:swatches.filter(s=>s.status===filter);
  return(
    <Wrap>
      <SecHead title="Procurement Swatchboard" sub="Shared checklist — Design & Ops add, Procurement fulfills"/>
      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12,marginBottom:20}}>
        <KPI label="Total Items"     value={swatches.length}   color="#3b82f6"/>
        <KPI label="To Buy"          value={toBuy.length}      color="#ef4444"/>
        <KPI label="Ordered"         value={ordered.length}    color="#f59e0b"/>
        <KPI label="Received"        value={received.length}   color="#10b981"/>
        <KPI label="Client Approved" value={approved.length}   color="#059669"/>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
          {["All","To Buy","Ordered","Received","Client Approved"].map(f=>(
            <button key={f} onClick={()=>setFilter(f)} style={{padding:"6px 14px",borderRadius:20,border:`1.5px solid ${filter===f?SW_CLR[f]||"#3b82f6":"#e2e8f0"}`,background:filter===f?(SW_CLR[f]||"#3b82f6")+"18":"#fff",color:filter===f?SW_CLR[f]||"#3b82f6":"#64748b",fontWeight:filter===f?700:400,cursor:"pointer",fontFamily:"inherit",fontSize:".8rem"}}>{f}</button>
          ))}
        </div>
        <Btn onClick={()=>openAddSwatch(null,"Design")}>+ Add Item</Btn>
      </div>
      {shown.map(sw=>(
        <Card key={sw.id} accent={SW_CLR[sw.status]}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
            <div style={{flex:1}}>
              <div style={{display:"flex",gap:7,alignItems:"center",flexWrap:"wrap",marginBottom:5}}>
                <Badge label={sw.status} color={SW_CLR[sw.status]}/>
                <Badge label={sw.category} color="#64748b"/>
                <Badge label={sw.addedBy==="Design"?"🎨 Design":"⚙ Ops"} color={sw.addedBy==="Design"?"#8b5cf6":"#f97316"}/>
                {sw.projectId&&<Badge label={clientName(sw.projectId)} color="#3b82f6"/>}
              </div>
              <div style={{fontWeight:700,color:"#0f172a",fontSize:".98rem",textDecoration:sw.status==="Client Approved"?"line-through":"none"}}>{sw.name}</div>
              <div style={{fontSize:".75rem",color:"#64748b",marginTop:3}}>{sw.qty} {sw.unit} · {sw.supplier||"No supplier specified"}</div>
              {sw.notes&&<div style={{fontSize:".73rem",color:"#94a3b8",marginTop:3,fontStyle:"italic"}}>{sw.notes}</div>}
              {sw.swatchLink&&<a href={sw.swatchLink} target="_blank" rel="noreferrer" style={{fontSize:".72rem",color:"#3b82f6",display:"block",marginTop:4}}>🔗 View reference</a>}
              {sw.status==="Client Approved"&&sw.clientApprovedBy&&(
                <div style={{fontSize:".72rem",color:"#059669",marginTop:4,fontWeight:600}}>✅ Approved by {sw.clientApprovedBy} · {sw.clientApprovedAt}</div>
              )}
            </div>
            <div style={{flexShrink:0,textAlign:"right"}}>
              <div style={{fontWeight:700,color:"#f59e0b",fontSize:"1rem",marginBottom:8}}>{sw.estCost?fmt(sw.estCost):"—"}</div>
              <select value={sw.status} onChange={e=>swQ(sw.id,e.target.value)} style={{border:`1.5px solid ${SW_CLR[sw.status]}`,borderRadius:8,padding:"6px 10px",fontFamily:"inherit",fontSize:".8rem",color:SW_CLR[sw.status],fontWeight:700,background:SW_CLR[sw.status]+"12",cursor:"pointer",display:"block",marginBottom:8,width:"100%"}}>
                {SWATCH_STATUS.map(s=><option key={s} style={{color:"#0f172a",background:"#fff",fontWeight:400}}>{s}</option>)}
              </select>
              <div style={{display:"flex",gap:6,justifyContent:"flex-end"}}>
                <Btn small variant="ghost" onClick={()=>openEditSwatch(sw)}>✏ Edit</Btn>
                <Btn small variant="danger" onClick={()=>delSwatch(sw.id)}>Delete</Btn>
              </div>
            </div>
          </div>
        </Card>
      ))}
      {shown.length===0&&<EmptyState icon="🛒" msg={`No ${filter==="All"?"items":filter.toLowerCase()} in the swatchboard yet.`}/>}
    </Wrap>
  );
}

// ─── JOB ORDERS VIEW ─────────────────────────────────────────────────────────
function JOView({deals,wonDeals,projs,jos,joStep,setJoStep,joSel,setJoSel,joExtra,setJoExtra,viewJO,setViewJO,issueJO,overallProg,Wrap}){
  if(joStep==="select") return(
    <Wrap>
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:16}}>
        <div>
          <SecHead title="Job Order Builder" sub="Select a Won deal to generate a job order"/>
          {wonDeals.map(d=>{const p=projs[d.id];return(
            <Card key={d.id} onClick={()=>{setJoSel(d.id);setJoExtra({address:"",phone:"",priority:d.priority||"Normal",extraNotes:""});setJoStep("review");}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div><div style={{fontWeight:700,color:"#0f172a"}}>{d.client}</div><div style={{fontSize:".75rem",color:"#64748b",marginTop:2}}>{d.product} · {d.contact}</div></div>
                <div style={{display:"flex",gap:7,alignItems:"center"}}><Badge label={d.paymentStatus} color={PAY_CLR[d.paymentStatus]}/><Badge label={p?.currentStage||"Design"} color={PROD_CLR[p?.currentStage||"Design"]}/><span style={{fontWeight:800,color:"#10b981"}}>{fmt(d.value)}</span></div>
              </div>
              {p&&<div style={{marginTop:10}}><ProgBar pct={overallProg(p)} color={PROD_CLR[p.currentStage]}/></div>}
            </Card>
          );})}
          {wonDeals.length===0&&<EmptyState icon="📋" msg="No won deals yet. Mark a deal as Won in the Pipeline first."/>}
        </div>
        <div>
          <SecHead title="Issued JOs"/>
          {jos.map((jo,i)=>(
            <Card key={i} onClick={()=>{setViewJO(jo);setJoStep("preview");}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div>
                  <div style={{fontWeight:700,color:"#0f172a"}}>{jo.joNo||jo.joNum}</div>
                  <div style={{fontSize:".75rem",color:"#64748b",marginTop:2}}>{jo.client||jo.deal?.client}</div>
                  <div style={{fontSize:".72rem",color:"#94a3b8",marginTop:1}}>{jo.issuedDate||jo.dateIssued}</div>
                  {jo.pm1&&<div style={{fontSize:".68rem",color:"#3b82f6",marginTop:2}}>PM: {[jo.pm1,jo.pm2,jo.pm3].filter(Boolean).join(", ")}</div>}
                </div>
                <button onClick={e=>{e.stopPropagation();printJO(jo);}}
                  style={{background:"#1e293b",border:"none",borderRadius:7,padding:"5px 10px",fontFamily:"inherit",fontSize:".72rem",color:"#fff",cursor:"pointer",fontWeight:600,flexShrink:0}}>
                  🖨 Print
                </button>
              </div>
            </Card>
          ))}
          {jos.length===0&&<EmptyState icon="📄" msg="No JOs issued yet."/>}
        </div>
      </div>
    </Wrap>
  );
  if(joStep==="review"){
    const d=deals.find(x=>x.id===joSel),p=projs[joSel];
    const matT=(p?.materials||[]).reduce((s,m)=>s+m.cost,0);
    return(
      <Wrap>
        <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:18}}>
          <Btn variant="ghost" small onClick={()=>setJoStep("select")}>← Back</Btn>
          <div style={{flex:1}}><div style={{fontWeight:800,color:"#0f172a"}}>{d?.client} — Review Job Order</div><div style={{fontSize:".75rem",color:"#64748b"}}>All details auto-filled. Add any missing info below.</div></div>
          <Btn variant="green" onClick={issueJO}>✓ Issue Job Order</Btn>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          <Card>
            <div style={{fontWeight:700,color:"#0f172a",marginBottom:14}}>Client Details</div>
            {[["Client",d?.client],["Contact",d?.contact],["Product",d?.product],["Value",fmt(d?.value)],["Payment",d?.paymentStatus]].map(([l,v])=>(
              <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid #f1f5f9",fontSize:".85rem"}}><span style={{color:"#64748b"}}>{l}</span><span style={{fontWeight:600,color:"#0f172a"}}>{v}</span></div>
            ))}
            <div style={{marginTop:14}}>
              <Fld label="Delivery Address"><Inp value={joExtra.address} onChange={e=>setJoExtra(x=>({...x,address:e.target.value}))} placeholder="Site / delivery address"/></Fld>
              <Fld label="Contact Phone"><Inp value={joExtra.phone} onChange={e=>setJoExtra(x=>({...x,phone:e.target.value}))} placeholder="Client phone number"/></Fld>
              <Fld label="Additional Notes"><Inp rows={3} value={joExtra.extraNotes} onChange={e=>setJoExtra(x=>({...x,extraNotes:e.target.value}))} placeholder="Special instructions…"/></Fld>
            </div>
          </Card>
          <div>
            <Card>
              <div style={{fontWeight:700,color:"#0f172a",marginBottom:12}}>Production Stages</div>
              {["Design","Fabrication","QC","Delivery"].map((s,i)=>{
                const done=["Design","Fabrication","QC","Delivery"].indexOf(p?.currentStage||"Design")>i,cur=p?.currentStage===s;
                return <div key={s} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #f1f5f9",fontSize:".83rem"}}><span style={{color:cur?PROD_CLR[s]:done?"#94a3b8":"#cbd5e1",fontWeight:cur?700:400}}>{s}</span><span style={{color:done?"#059669":cur?PROD_CLR[s]:"#94a3b8",fontSize:".75rem"}}>{done?"✓ Complete":cur?"In Progress":"Pending"}</span></div>;
              })}
            </Card>
            <Card>
              <div style={{fontWeight:700,color:"#0f172a",marginBottom:12}}>Cost Summary</div>
              {[["Materials",matT,"#f59e0b"],["Labor",p?.laborCost||0,"#8b5cf6"],["Overhead",p?.overhead||0,"#3b82f6"],["Total",matT+(p?.laborCost||0)+(p?.overhead||0),"#ef4444"]].map(([l,v,c],i)=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:i<3?"1px solid #f1f5f9":"none",fontSize:".85rem"}}><span style={{color:"#64748b",fontWeight:i===3?700:400}}>{l}</span><span style={{fontWeight:700,color:c}}>{fmt(v)}</span></div>
              ))}
            </Card>
          </div>
        </div>
      </Wrap>
    );
  }
  if(joStep==="preview"&&viewJO) return(
    <Wrap>
      <div style={{display:"flex",gap:10,marginBottom:18}} className="noprint">
        <Btn variant="ghost" small onClick={()=>setJoStep("select")}>← Back</Btn>
        <Btn variant="accent" small onClick={()=>window.print()}>🖨 Print / Save PDF</Btn>
      </div>
      <div style={{background:"#fff",borderRadius:14,overflow:"hidden",maxWidth:720,margin:"0 auto",boxShadow:"0 4px 24px rgba(0,0,0,.1)"}}>
        <div style={{background:"#0f172a",padding:"22px 28px",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.7rem",color:"#fff",letterSpacing:-.5}}>JOB ORDER</div>
            <div style={{fontSize:".72rem",color:"#94a3b8",marginTop:3,textTransform:"uppercase",letterSpacing:"1px"}}>GMD Productions Inc.</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.2rem",color:"#f59e0b"}}>{viewJO.joNum}</div>
            <div style={{fontSize:".72rem",color:"#94a3b8",marginTop:4}}>{viewJO.dateIssued}</div>
          </div>
        </div>
        <div style={{height:3,background:"linear-gradient(90deg,#f59e0b,#10b981)"}}/>
        <div style={{padding:"22px 28px",fontFamily:"'Segoe UI',sans-serif"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginBottom:18}}>
            {[["CLIENT",["Client",viewJO.deal?.client],["Contact",viewJO.deal?.contact],["Address",viewJO.address||"—"],["Phone",viewJO.phone||"—"]],
              ["PROJECT",["Product",viewJO.deal?.product],["Value",fmt(viewJO.deal?.value)],["Payment",viewJO.deal?.paymentStatus],["Delivery",viewJO.project?.stageDates?.Delivery?.e||"—"]]
            ].map(([head,...fields])=>(
              <div key={head}>
                <div style={{fontWeight:700,fontSize:".68rem",textTransform:"uppercase",letterSpacing:"1.5px",color:"#64748b",marginBottom:8,borderLeft:"3px solid #f59e0b",paddingLeft:8}}>{head}</div>
                {fields.map(([l,v])=><div key={l} style={{marginBottom:6}}><div style={{fontSize:".62rem",textTransform:"uppercase",letterSpacing:"1px",color:"#94a3b8"}}>{l}</div><div style={{fontSize:".85rem",fontWeight:500,color:"#0f172a"}}>{v}</div></div>)}
              </div>
            ))}
          </div>
          <div style={{marginBottom:18}}>
            <div style={{fontWeight:700,fontSize:".68rem",textTransform:"uppercase",letterSpacing:"1.5px",color:"#64748b",marginBottom:8,borderLeft:"3px solid #10b981",paddingLeft:8}}>PRODUCTION STAGES</div>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:".8rem"}}>
              <thead><tr style={{background:"#f8fafc"}}>{["Stage","Start","End","Team","Status"].map(h=><th key={h} style={{padding:"6px 10px",textAlign:"left",fontWeight:600,fontSize:".68rem",textTransform:"uppercase",color:"#64748b"}}>{h}</th>)}</tr></thead>
              <tbody>{["Design","Fabrication","QC","Delivery"].map((s,i)=>{
                const p=viewJO.project;const done=["Design","Fabrication","QC","Delivery"].indexOf(p?.currentStage||"Design")>i,cur=p?.currentStage===s;
                return <tr key={s} style={{borderBottom:"1px solid #f1f5f9"}}>
                  <td style={{padding:"6px 10px",fontWeight:600,color:cur?"#f97316":done?"#64748b":"#0f172a"}}>{s}</td>
                  <td style={{padding:"6px 10px",color:"#64748b"}}>{p?.stageDates?.[s]?.s||"—"}</td>
                  <td style={{padding:"6px 10px",color:"#64748b"}}>{p?.stageDates?.[s]?.e||"—"}</td>
                  <td style={{padding:"6px 10px",fontSize:".75rem"}}>{s==="Design"?p?.design?.designer||"TBD":cur||done?(p?.team||[]).join(", ")||"TBD":"TBD"}</td>
                  <td style={{padding:"6px 10px",fontWeight:700,color:done?"#059669":cur?"#f97316":"#94a3b8"}}>{done?"Complete":cur?"In Progress":"Pending"}</td>
                </tr>;
              })}</tbody>
            </table>
          </div>
          {viewJO.extraNotes&&<div style={{background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:8,padding:"10px 14px",marginBottom:14,fontSize:".82rem",color:"#92400e"}}><strong>Notes:</strong> {viewJO.extraNotes}</div>}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,borderTop:"1px solid #e2e8f0",paddingTop:18}}>
            {["Prepared by (Sales)","Approved by (Manager)","Received by (Production)"].map(l=>(
              <div key={l} style={{textAlign:"center"}}><div style={{height:1,background:"#0f172a",marginBottom:5,marginTop:32}}/><div style={{fontSize:".65rem",color:"#64748b"}}>{l}</div></div>
            ))}
          </div>
        </div>
      </div>
    </Wrap>
  );
  return <Wrap><EmptyState icon="📋" msg="Select a deal to get started."/></Wrap>;
}



// ─── CHECKLIST VIEW ───────────────────────────────────────────────────────────
function ChecklistView({checklist,projList,deals,clientName,openAddCl,openEditCl,delCl,clStatusQ,clModal,setClModal,clForm,setClForm,editCl,saveCl,clProjF,setClProjF,clTypeF,setClTypeF,clStatF,setClStatF,clDeptF,setClDeptF,role,wonDeals,loadChecklistTemplate,Wrap}){
  const f=(k,v)=>setClForm(p=>({...p,[k]:v}));
  const allTypes=["All",...CL_TYPES,"Custom"];
  const isCustom=!CL_TYPES.includes(clForm.type)||clForm.type==="Custom";

  const filtered=checklist
    .filter(c=>clProjF==="all"||c.projectId===clProjF)
    .filter(c=>clTypeF==="All"||(clTypeF==="Custom"?!CL_TYPES.includes(c.type):c.type===clTypeF))
    .filter(c=>clStatF==="All"||c.status===clStatF)
    .filter(c=>clDeptF==="All"||c.dept===clDeptF)
    .sort((a,b)=>{
      const pri={Urgent:0,High:1,Normal:2}; const sta={"To Do":0,"In Progress":1,Done:2};
      return (sta[a.status]-sta[b.status])||( pri[a.priority]-pri[b.priority]);
    });

  const toDo=checklist.filter(c=>c.status==="To Do").length;
  const inProg=checklist.filter(c=>c.status==="In Progress").length;
  const done=checklist.filter(c=>c.status==="Done").length;
  const overdue=checklist.filter(c=>c.dueDate&&c.dueDate<today&&c.status!=="Done").length;

  // group by project for display
  const byProject={};
  filtered.forEach(c=>{
    const key=c.projectId||"__none__";
    if(!byProject[key]) byProject[key]=[];
    byProject[key].push(c);
  });

  const allMembers=["Carlo M.","Dana R.","Enzo P.","Faye T.","Gino A.","Hana C.","Ivan L.","Jade O.","Alex R.","Bea T.","Chris N.","Diana L.","Edric M."];

  return(
    <Wrap>
      <SecHead title="Project Checklist" sub="All departments — Operations, Design, Procurement — add tasks here"/>

      {/* KPIs */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
        <KPI label="To Do"       value={toDo}   color="#94a3b8"/>
        <KPI label="In Progress" value={inProg}  color="#f59e0b"/>
        <KPI label="Done"        value={done}    color="#10b981"/>
        <KPI label="Overdue"     value={overdue} color={overdue>0?"#ef4444":"#94a3b8"}/>
      </div>

      {/* Overdue alert */}
      {overdue>0&&(
        <div style={{background:"#fef2f2",border:"1.5px solid #fca5a5",borderRadius:12,padding:"12px 18px",marginBottom:16,display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:"1.2rem"}}>⚠️</span>
          <div style={{fontSize:".85rem",color:"#dc2626",fontWeight:600}}>{overdue} task{overdue>1?"s":""} past due date — check filters to find them</div>
        </div>
      )}

      {/* Filters */}
      <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",padding:"14px 18px",marginBottom:16}}>
        <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-end"}}>
          <div style={{minWidth:160}}>
            <div style={{fontSize:".68rem",fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:".8px",marginBottom:5}}>Project</div>
            <select value={clProjF} onChange={e=>setClProjF(e.target.value)} style={{border:"1.5px solid #e2e8f0",borderRadius:8,padding:"8px 11px",fontFamily:"inherit",fontSize:".82rem",color:"#0f172a",background:"#fff",cursor:"pointer",width:"100%"}}>
              <option value="all">All Projects</option>
              {[...wonDeals,...deals.filter(d=>d.stage!=="Won"&&checklist.some(c=>c.projectId===d.id))].map(d=>(
                <option key={d.id} value={d.id}>{d.client}</option>
              ))}
            </select>
          </div>
          <div style={{minWidth:130}}>
            <div style={{fontSize:".68rem",fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:".8px",marginBottom:5}}>Status</div>
            <select value={clStatF} onChange={e=>setClStatF(e.target.value)} style={{border:"1.5px solid #e2e8f0",borderRadius:8,padding:"8px 11px",fontFamily:"inherit",fontSize:".82rem",color:"#0f172a",background:"#fff",cursor:"pointer",width:"100%"}}>
              {["All",...CL_STATUS].map(s=><option key={s}>{s}</option>)}
            </select>
          </div>
          <div style={{minWidth:130}}>
            <div style={{fontSize:".68rem",fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:".8px",marginBottom:5}}>Department</div>
            <select value={clDeptF} onChange={e=>setClDeptF(e.target.value)} style={{border:"1.5px solid #e2e8f0",borderRadius:8,padding:"8px 11px",fontFamily:"inherit",fontSize:".82rem",color:"#0f172a",background:"#fff",cursor:"pointer",width:"100%"}}>
              {["All",...CL_DEPT].map(d=><option key={d}>{d}</option>)}
            </select>
          </div>
          <div style={{flex:1}}/>
          <Btn onClick={()=>openAddCl(null,role==="Design"?"Design":role==="Finance"?"Finance":"Operations")}>+ Add Task</Btn>
        </div>
        {/* Type quick filter pills */}
        <div style={{display:"flex",gap:7,marginTop:12,flexWrap:"wrap"}}>
          {["All",...CL_TYPES].map(t=>{
            const ic=TYPE_ICON[t]||"";
            const cl=TYPE_CLR[t]||"#64748b";
            return(
              <button key={t} onClick={()=>setClTypeF(t)} style={{padding:"4px 12px",borderRadius:20,border:`1.5px solid ${clTypeF===t?cl:"#e2e8f0"}`,background:clTypeF===t?cl+"18":"#fff",color:clTypeF===t?cl:"#64748b",fontFamily:"inherit",fontWeight:clTypeF===t?700:400,fontSize:".78rem",cursor:"pointer"}}>
                {ic} {t}
              </button>
            );
          })}
        </div>
      </div>

      {/* Grouped by project */}
      {Object.keys(byProject).length===0&&(
        <div>
          <EmptyState icon="✅" msg="No tasks match the current filters. Hit + Add Task to get started."/>
          {clProjF!=="all"&&checklist.filter(c=>c.projectId===clProjF).length===0&&(
            <div style={{textAlign:"center",marginTop:8}}>
              <div style={{fontSize:".8rem",color:"#64748b",marginBottom:10}}>Or start with the GMD standard template for this project:</div>
              <button onClick={()=>loadChecklistTemplate(clProjF,"this project")}
                style={{background:"#1e293b",border:"none",borderRadius:10,padding:"10px 22px",fontFamily:"inherit",fontWeight:700,fontSize:".84rem",color:"#fff",cursor:"pointer"}}>
                📋 Load GMD Standard Checklist Template
              </button>
            </div>
          )}
        </div>
      )}

      {Object.entries(byProject).map(([projId,items])=>{
        const deal=deals.find(d=>d.id===projId);
        return(
          <div key={projId} style={{marginBottom:24}}>
            {clProjF==="all"&&(
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                <div style={{fontWeight:800,color:"#0f172a",fontSize:"1rem"}}>{deal?deal.client:"No Project"}</div>
                {deal&&<Badge label={deal.stage==="Won"?(projs?.[deal.id]?.currentStage||"Won"):deal.stage} color={deal.stage==="Won"?PROD_CLR[projs?.[deal.id]?.currentStage||"Design"]:STAGE_CLR[deal.stage]}/>}
                <div style={{flex:1,height:1,background:"#e2e8f0"}}/>
                <Btn small onClick={()=>openAddCl(projId===("__none__")?null:projId,role==="Design"?"Design":"Operations")}>+ Add to {deal?.client||"project"}</Btn>
              </div>
            )}
            {items.map(item=>{
              const typeColor=TYPE_CLR[item.type]||"#8b5cf6";
              const stColor=CS_CLR[item.status]||"#94a3b8";
              const isOD=item.dueDate&&item.dueDate<today&&item.status!=="Done";
              return(
                <Card key={item.id} accent={item.status==="Done"?"#d1fae5":isOD?"#fca5a5":item.priority==="Urgent"?"#fef3c7":undefined}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
                    {/* Left: checkbox + content */}
                    <div style={{display:"flex",gap:12,alignItems:"flex-start",flex:1}}>
                      {/* Status toggle circle */}
                      <div onClick={()=>{const next=item.status==="Done"?"To Do":item.status==="To Do"?"In Progress":"Done";clStatusQ(item.id,next);}} style={{width:24,height:24,borderRadius:"50%",border:`2.5px solid ${stColor}`,background:item.status==="Done"?stColor:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:2,transition:"all .15s"}}>
                        {item.status==="Done"&&<span style={{color:"#fff",fontSize:".72rem",fontWeight:900}}>✓</span>}
                        {item.status==="In Progress"&&<span style={{width:8,height:8,borderRadius:"50%",background:stColor,display:"block"}}/>}
                      </div>
                      <div style={{flex:1}}>
                        <div style={{display:"flex",gap:7,alignItems:"center",flexWrap:"wrap",marginBottom:4}}>
                          <span style={{fontSize:".82rem",fontWeight:700,color:"#0f172a",textDecoration:item.status==="Done"?"line-through":"none",opacity:item.status==="Done"?.6:1}}>
                            {TYPE_ICON[item.type]||"📌"} {item.title}
                          </span>
                          {item.priority!=="Normal"&&<Badge label={item.priority} color={PRI_CLR[item.priority]}/>}
                        </div>
                        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:5}}>
                          <Badge label={item.type} color={typeColor}/>
                          <Badge label={item.dept} color="#64748b"/>
                          {item.assignedTo&&<span style={{fontSize:".72rem",color:"#64748b"}}>👤 {item.assignedTo}</span>}
                          {item.supplier&&<span style={{fontSize:".72rem",color:"#64748b"}}>🏭 {item.supplier}</span>}
                        </div>
                        {item.notes&&<div style={{fontSize:".75rem",color:"#94a3b8",fontStyle:"italic"}}>{item.notes}</div>}
                    {item.qty&&<div style={{fontSize:".72rem",color:"#0ea5e9",marginTop:2}}>Qty: {item.qty} {item.unit}</div>}
                    {item.whatCouldGoWrong&&(
                      <div style={{marginTop:6,background:"#fef9c3",border:"1px solid #fde047",borderRadius:6,padding:"5px 9px",fontSize:".72rem",color:"#854d0e"}}>
                        ⚠️ <strong>Risk:</strong> {item.whatCouldGoWrong}
                      </div>
                    )}
                        <div style={{display:"flex",gap:12,marginTop:5,fontSize:".7rem",color:isOD?"#ef4444":"#94a3b8"}}>
                          {item.dueDate&&<span>{isOD?"⚠ Overdue: ":"Due: "}{item.dueDate}</span>}
                          <span>Added by {item.createdBy} · {item.createdDate}</span>
                        </div>
                      </div>
                    </div>
                    {/* Right: status selector + actions */}
                    <div style={{flexShrink:0,textAlign:"right"}}>
                      <select value={item.status} onChange={e=>clStatusQ(item.id,e.target.value)} style={{border:`1.5px solid ${stColor}44`,borderRadius:8,padding:"5px 10px",fontFamily:"inherit",fontSize:".78rem",color:stColor,fontWeight:700,background:stColor+"12",cursor:"pointer",display:"block",marginBottom:8}}>
                        {CL_STATUS.map(s=><option key={s} style={{color:"#0f172a",background:"#fff",fontWeight:400}}>{s}</option>)}
                      </select>
                      <div style={{display:"flex",gap:6,justifyContent:"flex-end"}}>
                        <Btn small variant="ghost" onClick={()=>openEditCl(item)}>✏ Edit</Btn>
                        <Btn small variant="danger" onClick={()=>delCl(item.id)}>Delete</Btn>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        );
      })}

      {/* Add Task Modal */}
      <Modal open={clModal} onClose={()=>setClModal(false)} title={editCl?"Edit Task":"Add Task"} wide>
        {/* Project */}
        <Fld label="Project" hint="Which project is this task for?">
          <select value={clForm.projectId||"none"} onChange={e=>f("projectId",e.target.value==="none"?null:e.target.value)} style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"10px 13px",fontFamily:"inherit",fontSize:".87rem",color:"#1e293b",background:"#fff",boxSizing:"border-box",cursor:"pointer"}}>
            <option value="none">— No specific project —</option>
            {deals.map(d=><option key={d.id} value={d.id}>{d.client} — {d.product}</option>)}
          </select>
        </Fld>

        {/* Task Type — standard presets + custom */}
        <Fld label="Task Type" hint="Pick a standard type or choose Custom to type your own">
          <div style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:10}}>
            {[...CL_TYPES,"Custom"].map(t=>{
              const c=TYPE_CLR[t]||"#8b5cf6";
              const selected=clForm.type===t||(t==="Custom"&&!CL_TYPES.includes(clForm.type));
              return(
                <button key={t} onClick={()=>f("type",t)} style={{padding:"6px 14px",borderRadius:20,border:`1.5px solid ${selected?c:"#e2e8f0"}`,background:selected?c+"18":"#fff",color:selected?c:"#64748b",fontFamily:"inherit",fontWeight:selected?700:400,fontSize:".8rem",cursor:"pointer"}}>
                  {TYPE_ICON[t]||"📌"} {t}
                </button>
              );
            })}
          </div>
          {(!CL_TYPES.includes(clForm.type)||clForm.type==="Custom")&&(
            <Inp value={clForm.customType||""} onChange={e=>{f("customType",e.target.value);f("type","Custom");}} placeholder="Describe your task type (e.g. Site Measurement, Client Meeting)"/>
          )}
        </Fld>

        <Fld label="Task Title / Description" required>
          <Inp value={clForm.title} onChange={e=>f("title",e.target.value)} placeholder="What needs to be done?"/>
        </Fld>

        {/* Qty + Unit for Module and Swatch types */}
        {(clForm.type==="Module"||clForm.type==="Swatch"||clForm.type==="Purchase") && (
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:4}}>
            <Fld label="Quantity"><Inp type="number" value={clForm.qty||""} onChange={e=>f("qty",e.target.value)} placeholder="e.g. 12"/></Fld>
            <Fld label="Unit"><select value={clForm.unit||"pcs"} onChange={e=>f("unit",e.target.value)} style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"9px 12px",fontFamily:"inherit",fontSize:".87rem",color:"#1e293b",background:"#fff",boxSizing:"border-box",cursor:"pointer",outline:"none"}}>
              {["pcs","sheets","meters","sqm","kg","sets","rolls","liters","lots"].map(u=><option key={u}>{u}</option>)}
            </select></Fld>
          </div>
        )}

        {/* Proactive mindset field — from Action Planning Workshop */}
        <div style={{background:"#fef9c3",border:"1.5px solid #fde047",borderRadius:10,padding:"12px 14px",marginBottom:14}}>
          <div style={{fontSize:".72rem",fontWeight:700,color:"#854d0e",textTransform:"uppercase",letterSpacing:".8px",marginBottom:6}}>⚠️ What Could Go Wrong? <span style={{fontWeight:400,color:"#92400e"}}>(Think ahead — from Action Planning Workshop)</span></div>
          <Inp value={clForm.whatCouldGoWrong||""} onChange={e=>f("whatCouldGoWrong",e.target.value)} placeholder="e.g. Material arrives late, wrong specs ordered, client unavailable for approval…" rows={2}/>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          <Fld label="Department">
            <select value={clForm.dept} onChange={e=>f("dept",e.target.value)} style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"10px 13px",fontFamily:"inherit",fontSize:".87rem",color:"#1e293b",background:"#fff",boxSizing:"border-box",cursor:"pointer"}}>
              {CL_DEPT.map(d=><option key={d}>{d}</option>)}
            </select>
          </Fld>
          <Fld label="Assigned To">
            <select value={clForm.assignedTo||""} onChange={e=>f("assignedTo",e.target.value)} style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"10px 13px",fontFamily:"inherit",fontSize:".87rem",color:"#1e293b",background:"#fff",boxSizing:"border-box",cursor:"pointer"}}>
              <option value="">— Unassigned —</option>
              {allMembers.map(m=><option key={m}>{m}</option>)}
            </select>
          </Fld>
          <Fld label="Priority">
            <select value={clForm.priority} onChange={e=>f("priority",e.target.value)} style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"10px 13px",fontFamily:"inherit",fontSize:".87rem",color:"#1e293b",background:"#fff",boxSizing:"border-box",cursor:"pointer"}}>
              {PRIORITIES.map(p=><option key={p}>{p}</option>)}
            </select>
          </Fld>
          <Fld label="Status">
            <select value={clForm.status} onChange={e=>f("status",e.target.value)} style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"10px 13px",fontFamily:"inherit",fontSize:".87rem",color:"#1e293b",background:"#fff",boxSizing:"border-box",cursor:"pointer"}}>
              {CL_STATUS.map(s=><option key={s}>{s}</option>)}
            </select>
          </Fld>
          <Fld label="Due Date">
            <Inp type="date" value={clForm.dueDate||""} onChange={e=>f("dueDate",e.target.value)}/>
          </Fld>
          <Fld label="Supplier / Vendor" hint="For Purchase or Supplier Job tasks">
            <Inp value={clForm.supplier||""} onChange={e=>f("supplier",e.target.value)} placeholder="e.g. Casa Hardware, MetalWorks PH"/>
          </Fld>
        </div>

        <Fld label="Notes">
          <Inp rows={3} value={clForm.notes||""} onChange={e=>f("notes",e.target.value)} placeholder="Any additional details, specs, or instructions…"/>
        </Fld>

        <div style={{display:"flex",gap:10,marginTop:4}}>
          <Btn full onClick={saveCl}>{editCl?"Save Changes":"Add Task"}</Btn>
          <Btn variant="ghost" onClick={()=>setClModal(false)}>Cancel</Btn>
        </div>
      </Modal>
    </Wrap>
  );
}

// ─── AUTH SCREEN ──────────────────────────────────────────────────────────────
function AuthScreen({authView,setAuthView,onLogin,onRegister}){
  const[uname,  setUname]  = useState("");
  const[pw,     setPw]     = useState("");
  const[name,   setName]   = useState("");
  const[pw2,    setPw2]    = useState("");
  const[reqRole,setReqRole]= useState("Sales");
  const[err,    setErr]    = useState("");
  const[ok,     setOk]     = useState("");
  const[showPw, setShowPw] = useState(false);

  const doLogin = () => {
    setErr("");
    const e = onLogin(uname, pw);
    if(e) setErr(e);
  };
  const doRegister = () => {
    setErr(""); setOk("");
    if(pw !== pw2){ setErr("Passwords do not match."); return; }
    const e = onRegister(name, uname, pw, reqRole);
    if(e){ setErr(e); return; }
    setOk("✅ Account created! A Manager will approve your access shortly.");
    setName(""); setUname(""); setPw(""); setPw2("");
    setTimeout(()=>{ setAuthView("login"); setOk(""); }, 2500);
  };
  const isLogin = authView==="login";

  return(
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#0f172a 0%,#1e1b4b 50%,#0f172a 100%)",display:"flex",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"'Segoe UI',system-ui,sans-serif"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800&display=swap'); *{box-sizing:border-box;} input:focus{border-color:#f59e0b!important;outline:none;box-shadow:0 0 0 3px rgba(245,158,11,.15);}`}</style>
      <div style={{width:"100%",maxWidth:400}}>
        {/* Logo */}
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"2.2rem",color:"#fff",letterSpacing:-1}}>
            GMD <span style={{color:"#f59e0b"}}>PROD</span>
          </div>
          <div style={{color:"rgba(255,255,255,.4)",fontSize:".8rem",marginTop:4}}>Internal Operations Platform</div>
        </div>

        {/* Card */}
        <div style={{background:"rgba(255,255,255,.05)",backdropFilter:"blur(20px)",borderRadius:18,border:"1px solid rgba(255,255,255,.1)",padding:"28px 28px 24px",boxShadow:"0 24px 60px rgba(0,0,0,.4)"}}>
          {/* Tabs */}
          <div style={{display:"flex",background:"rgba(0,0,0,.3)",borderRadius:10,padding:4,marginBottom:24}}>
            {["login","register"].map(v=>(
              <button key={v} onClick={()=>{setAuthView(v);setErr("");setOk("");}} style={{flex:1,padding:"8px",border:"none",borderRadius:8,background:authView===v?"#fff":"transparent",color:authView===v?"#0f172a":"rgba(255,255,255,.5)",fontWeight:authView===v?700:400,fontSize:".82rem",cursor:"pointer",fontFamily:"inherit",transition:"all .2s",textTransform:"capitalize"}}>
                {v==="login"?"Log In":"Register"}
              </button>
            ))}
          </div>

          {/* Error / Success */}
          {err&&<div style={{background:"rgba(239,68,68,.15)",border:"1px solid rgba(239,68,68,.3)",borderRadius:8,padding:"10px 14px",marginBottom:14,fontSize:".8rem",color:"#fca5a5"}}>{err}</div>}
          {ok &&<div style={{background:"rgba(16,185,129,.15)",border:"1px solid rgba(16,185,129,.3)",borderRadius:8,padding:"10px 14px",marginBottom:14,fontSize:".8rem",color:"#6ee7b7"}}>{ok}</div>}

          {/* Register fields */}
          {!isLogin&&(
            <div style={{marginBottom:14}}>
              <label style={{display:"block",fontSize:".68rem",fontWeight:700,color:"rgba(255,255,255,.5)",textTransform:"uppercase",letterSpacing:".8px",marginBottom:6}}>Full Name *</label>
              <FInp value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Juan dela Cruz" style={{width:"100%",background:"rgba(255,255,255,.08)",border:"1.5px solid rgba(255,255,255,.15)",borderRadius:9,padding:"10px 13px",color:"#fff",fontFamily:"inherit",fontSize:".88rem"}}/>
            </div>
          )}

          {/* Username */}
          <div style={{marginBottom:14}}>
            <label style={{display:"block",fontSize:".68rem",fontWeight:700,color:"rgba(255,255,255,.5)",textTransform:"uppercase",letterSpacing:".8px",marginBottom:6}}>Username *</label>
            <FInp value={uname} onChange={e=>setUname(e.target.value)} placeholder="e.g. juan" onKeyDown={e=>isLogin&&e.key==="Enter"&&doLogin()} style={{width:"100%",background:"rgba(255,255,255,.08)",border:"1.5px solid rgba(255,255,255,.15)",borderRadius:9,padding:"10px 13px",color:"#fff",fontFamily:"inherit",fontSize:".88rem"}}/>
          </div>

          {/* Password */}
          <div style={{marginBottom:14,position:"relative"}}>
            <label style={{display:"block",fontSize:".68rem",fontWeight:700,color:"rgba(255,255,255,.5)",textTransform:"uppercase",letterSpacing:".8px",marginBottom:6}}>Password *</label>
            <div style={{position:"relative"}}>
              <FInp type={showPw?"text":"password"} value={pw} onChange={e=>setPw(e.target.value)} placeholder="Min 6 characters" onKeyDown={e=>isLogin&&e.key==="Enter"&&doLogin()} style={{width:"100%",background:"rgba(255,255,255,.08)",border:"1.5px solid rgba(255,255,255,.15)",borderRadius:9,padding:"10px 40px 10px 13px",color:"#fff",fontFamily:"inherit",fontSize:".88rem"}}/>
              <button onClick={()=>setShowPw(s=>!s)} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"rgba(255,255,255,.4)",cursor:"pointer",fontSize:".78rem"}}>{showPw?"Hide":"Show"}</button>
            </div>
          </div>

          {/* Confirm password + role (register only) */}
          {!isLogin&&(<>
            <div style={{marginBottom:14}}>
              <label style={{display:"block",fontSize:".68rem",fontWeight:700,color:"rgba(255,255,255,.5)",textTransform:"uppercase",letterSpacing:".8px",marginBottom:6}}>Confirm Password *</label>
              <FInp type="password" value={pw2} onChange={e=>setPw2(e.target.value)} style={{width:"100%",background:"rgba(255,255,255,.08)",border:"1.5px solid rgba(255,255,255,.15)",borderRadius:9,padding:"10px 13px",color:"#fff",fontFamily:"inherit",fontSize:".88rem"}}/>
            </div>
            <div style={{marginBottom:14}}>
              <label style={{display:"block",fontSize:".68rem",fontWeight:700,color:"rgba(255,255,255,.5)",textTransform:"uppercase",letterSpacing:".8px",marginBottom:6}}>Request Role</label>
              <select value={reqRole} onChange={e=>setReqRole(e.target.value)} style={{width:"100%",background:"rgba(255,255,255,.08)",border:"1.5px solid rgba(255,255,255,.15)",borderRadius:9,padding:"10px 13px",color:"#fff",fontFamily:"inherit",fontSize:".88rem",cursor:"pointer"}}>
                {["Sales","Finance","Procurement","QS","Operations","Design","Warehouse"].map(r=><option key={r} style={{background:"#1e293b"}}>{r}</option>)}
              </select>
              <div style={{fontSize:".7rem",color:"rgba(255,255,255,.3)",marginTop:5}}>A Manager will assign your final role upon approval.</div>
            </div>
          </>)}

          {/* Submit */}
          <button onClick={isLogin?doLogin:doRegister} style={{width:"100%",background:"#f59e0b",border:"none",borderRadius:10,padding:"12px",fontFamily:"inherit",fontWeight:700,fontSize:".92rem",color:"#0f172a",cursor:"pointer",marginTop:6,transition:"all .15s"}}
            onMouseEnter={e=>e.currentTarget.style.background="#fbbf24"}
            onMouseLeave={e=>e.currentTarget.style.background="#f59e0b"}>
            {isLogin?"Log In →":"Create Account →"}
          </button>

          {isLogin&&(
            <div style={{textAlign:"center",marginTop:16,fontSize:".75rem",color:"rgba(255,255,255,.3)"}}>
              No account yet?{" "}
              <button onClick={()=>setAuthView("register")} style={{background:"none",border:"none",color:"#f59e0b",cursor:"pointer",fontFamily:"inherit",fontSize:".75rem",fontWeight:600}}>Register here</button>
            </div>
          )}
          {!isLogin&&(
            <div style={{textAlign:"center",marginTop:16,fontSize:".75rem",color:"rgba(255,255,255,.5)"}}>
              Already have an account?{" "}
              <button onClick={()=>{setAuthView("login");setErr("");setOk("");}}
                style={{background:"none",border:"none",color:"#f59e0b",cursor:"pointer",fontFamily:"inherit",fontSize:".75rem",fontWeight:600}}>
                Back to Login
              </button>
            </div>
          )}
        </div>

        <div style={{textAlign:"center",marginTop:20,fontSize:".7rem",color:"rgba(255,255,255,.2)"}}>
          GMD Productions Inc. · Internal use only
        </div>
      </div>
    </div>
  );
}

// ─── ACCOUNTS MANAGER ─────────────────────────────────────────────────────────
function AccountsManager({users,session,onApprove,onReject,onDeactivate,onDelete,onResetPw,ROLES}){
  const[resetId,  setResetId]  = useState(null);
  const[newPw,    setNewPw]    = useState("");
  const[resetMsg, setResetMsg] = useState("");
  const[editRole, setEditRole] = useState({});
  const STATUS_CLR = {active:"#10b981",pending:"#f59e0b",inactive:"#94a3b8",rejected:"#ef4444"};

  const pending  = users.filter(u=>u.status==="pending");
  const active   = users.filter(u=>u.status==="active");
  const inactive = users.filter(u=>u.status==="inactive"||u.status==="rejected");

  return(
    <div>
      <div style={{fontWeight:800,color:"#0f172a",fontSize:"1.2rem",marginBottom:4}}>Account Management</div>
      <div style={{fontSize:".78rem",color:"#64748b",marginBottom:20}}>Approve registrations, manage roles, reset passwords.</div>

      {/* Pending approvals */}
      {pending.length>0&&(
        <div style={{marginBottom:24}}>
          <div style={{fontWeight:700,color:"#dc2626",fontSize:".88rem",marginBottom:10,display:"flex",alignItems:"center",gap:8}}>
            <span style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:20,padding:"1px 10px",fontSize:".72rem"}}>{pending.length} pending</span>
            Pending Approvals
          </div>
          {pending.map(u=>(
            <div key={u.id} style={{background:"#fff",border:"1.5px solid #fde68a",borderRadius:12,padding:"16px 18px",marginBottom:8}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,flexWrap:"wrap"}}>
                <div>
                  <div style={{fontWeight:700,color:"#0f172a"}}>{u.name}</div>
                  <div style={{fontSize:".75rem",color:"#64748b",marginTop:2}}>@{u.username} · Requested: <strong>{u.role}</strong> · Registered {u.createdAt}</div>
                </div>
                <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                  <select value={editRole[u.id]||u.role} onChange={e=>setEditRole(r=>({...r,[u.id]:e.target.value}))} style={{border:"1.5px solid #e2e8f0",borderRadius:7,padding:"5px 10px",fontFamily:"inherit",fontSize:".8rem",color:"#0f172a",background:"#fff",cursor:"pointer"}}>
                    {["Sales","Finance","Procurement","QS","Operations","Design","Warehouse","Manager"].map(r=><option key={r}>{r}</option>)}
                  </select>
                  <button onClick={()=>onApprove(u.id,editRole[u.id]||u.role)} style={{background:"#f0fdf4",border:"1.5px solid #6ee7b7",borderRadius:8,padding:"6px 14px",fontWeight:700,fontSize:".78rem",color:"#059669",cursor:"pointer",fontFamily:"inherit"}}>✓ Approve</button>
                  <button onClick={()=>onReject(u.id)} style={{background:"#fef2f2",border:"1.5px solid #fecaca",borderRadius:8,padding:"6px 14px",fontWeight:700,fontSize:".78rem",color:"#dc2626",cursor:"pointer",fontFamily:"inherit"}}>✕ Reject</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {pending.length===0&&<div style={{background:"#f0fdf4",border:"1px solid #6ee7b7",borderRadius:10,padding:"12px 16px",marginBottom:20,fontSize:".82rem",color:"#059669"}}>✓ No pending approvals</div>}

      {/* Active accounts */}
      <div style={{marginBottom:20}}>
        <div style={{fontWeight:700,color:"#0f172a",fontSize:".88rem",marginBottom:10}}>Active Accounts ({active.length})</div>
        {active.map(u=>(
          <div key={u.id} style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:12,padding:"14px 18px",marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}>
              <div>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <span style={{fontWeight:700,color:"#0f172a"}}>{u.name}</span>
                  {u.id===session?.userId&&<span style={{fontSize:".65rem",background:"#eff6ff",color:"#3b82f6",border:"1px solid #93c5fd",padding:"1px 7px",borderRadius:10,fontWeight:700}}>You</span>}
                </div>
                <div style={{fontSize:".73rem",color:"#64748b",marginTop:2}}>@{u.username} · {u.role}</div>
              </div>
              <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
                <button onClick={()=>{setResetId(u.id);setNewPw("");setResetMsg("");}} style={{background:"#eff6ff",border:"1.5px solid #93c5fd",borderRadius:7,padding:"5px 11px",fontSize:".75rem",color:"#3b82f6",cursor:"pointer",fontWeight:600,fontFamily:"inherit"}}>Reset PW</button>
                {u.id!==session?.userId&&(
                  <button onClick={()=>onDeactivate(u.id)} style={{background:"#f8fafc",border:"1.5px solid #e2e8f0",borderRadius:7,padding:"5px 11px",fontSize:".75rem",color:"#64748b",cursor:"pointer",fontWeight:600,fontFamily:"inherit"}}>Deactivate</button>
                )}
              </div>
            </div>
            {resetId===u.id&&(
              <div style={{marginTop:12,padding:"12px 14px",background:"#f8fafc",borderRadius:8,border:"1px solid #e2e8f0",display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                <FInp type="password" value={newPw} onChange={e=>setNewPw(e.target.value)} placeholder="New password (min 6 chars)" style={{flex:1,minWidth:180,border:"1.5px solid #e2e8f0",borderRadius:7,padding:"7px 11px",fontFamily:"inherit",fontSize:".83rem",color:"#0f172a"}}/>
                <button onClick={()=>{if(newPw.length>=6){onResetPw(u.id,newPw);setResetId(null);setResetMsg("Password reset!");}else setResetMsg("Min 6 characters.");}} style={{background:"#1e293b",border:"none",borderRadius:7,padding:"7px 14px",fontWeight:700,fontSize:".78rem",color:"#fff",cursor:"pointer",fontFamily:"inherit"}}>Save</button>
                <button onClick={()=>setResetId(null)} style={{background:"transparent",border:"1.5px solid #e2e8f0",borderRadius:7,padding:"7px 12px",fontSize:".75rem",color:"#64748b",cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
                {resetMsg&&<span style={{fontSize:".75rem",color:"#059669",fontWeight:600}}>{resetMsg}</span>}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Inactive/rejected */}
      {inactive.length>0&&(
        <div>
          <div style={{fontWeight:700,color:"#94a3b8",fontSize:".88rem",marginBottom:10}}>Inactive / Rejected ({inactive.length})</div>
          {inactive.map(u=>(
            <div key={u.id} style={{background:"#f8fafc",border:"1.5px solid #e2e8f0",borderRadius:10,padding:"12px 16px",marginBottom:6,display:"flex",justifyContent:"space-between",alignItems:"center",opacity:.7}}>
              <div>
                <span style={{fontWeight:600,color:"#64748b"}}>{u.name}</span>
                <span style={{fontSize:".73rem",color:"#94a3b8",marginLeft:8}}>@{u.username} · {u.status}</span>
              </div>
              <div style={{display:"flex",gap:7}}>
                <button onClick={()=>onApprove(u.id,u.role)} style={{background:"#f0fdf4",border:"1.5px solid #6ee7b7",borderRadius:7,padding:"4px 11px",fontSize:".73rem",color:"#059669",cursor:"pointer",fontWeight:600,fontFamily:"inherit"}}>Reactivate</button>
                <button onClick={()=>onDelete(u.id)} style={{background:"#fef2f2",border:"1.5px solid #fecaca",borderRadius:7,padding:"4px 11px",fontSize:".73rem",color:"#dc2626",cursor:"pointer",fontWeight:600,fontFamily:"inherit"}}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── SALES CALENDAR VIEW ─────────────────────────────────────────────────────
function SalesCalendarView({deals, session, role}){
  const todayStr=new Date().toISOString().slice(0,10);
  const[calDate,setCalDate]=useState(()=>{const n=new Date();return{y:n.getFullYear(),m:n.getMonth()};});
  const AE_COLORS={"Paulo Garcia":"#3b82f6","Paolo Gomez":"#8b5cf6","April Gail De Ello":"#ec4899","Jena De Asis":"#f59e0b","Don Wyn Celmar":"#10b981"};
  const aeColor=ae=>AE_COLORS[ae]||"#94a3b8";

  const prevMonth=()=>setCalDate(({y,m})=>m===0?{y:y-1,m:11}:{y,m:m-1});
  const nextMonth=()=>setCalDate(({y,m})=>m===11?{y:y+1,m:0}:{y,m:m+1});

  const{y,m}=calDate;
  const firstDay=new Date(y,m,1).getDay();
  const daysInMonth=new Date(y,m+1,0).getDate();
  const monthStr=`${y}-${String(m+1).padStart(2,"0")}`;
  const MONTHS_PH=["January","February","March","April","May","June","July","August","September","October","November","December"];

  // Build event map: date → [{client, type, ae}]
  const events={};
  deals.forEach(d=>{
    if(d.followUp?.startsWith(monthStr)){
      const day=d.followUp.slice(8,10);
      if(!events[day]) events[day]=[];
      events[day].push({label:d.client,type:"followup",ae:d.salesOwner,ceNo:d.ceNo});
    }
    if(d.dateAcquired?.startsWith(monthStr)){
      const day=d.dateAcquired.slice(8,10);
      if(!events[day]) events[day]=[];
      events[day].push({label:d.client,type:"acquired",ae:d.salesOwner});
    }
  });

  const cells=[];
  for(let i=0;i<firstDay;i++) cells.push(null);
  for(let d=1;d<=daysInMonth;d++) cells.push(d);

  // Summary: follow-ups this month by AE
  const followUps=deals.filter(d=>d.followUp?.startsWith(monthStr));
  const byAE=[...new Set(followUps.map(d=>d.salesOwner||"Unassigned"))].map(ae=>({ae,count:followUps.filter(d=>(d.salesOwner||"Unassigned")===ae).length})).sort((a,b)=>b.count-a.count);

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
        <div>
          <h2 style={{margin:0,fontWeight:800,color:"#0f172a",fontSize:"1.15rem"}}>📅 Sales Calendar</h2>
          <div style={{fontSize:".75rem",color:"#64748b",marginTop:2}}>Follow-up dates and deal activity for the team</div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <button onClick={prevMonth} style={{background:"#f1f5f9",border:"none",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontFamily:"inherit",fontSize:".85rem",color:"#475569"}}>←</button>
          <span style={{fontWeight:800,fontSize:"1rem",color:"#0f172a",minWidth:160,textAlign:"center"}}>{MONTHS_PH[m]} {y}</span>
          <button onClick={nextMonth} style={{background:"#f1f5f9",border:"none",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontFamily:"inherit",fontSize:".85rem",color:"#475569"}}>→</button>
          <button onClick={()=>{const n=new Date();setCalDate({y:n.getFullYear(),m:n.getMonth()});}} style={{background:"#1e293b",border:"none",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontFamily:"inherit",fontSize:".82rem",color:"#fff"}}>Today</button>
        </div>
      </div>

      {/* AE summary strip */}
      {byAE.length>0&&(
        <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",padding:"12px 18px",marginBottom:16,display:"flex",gap:16,flexWrap:"wrap",alignItems:"center"}}>
          <span style={{fontSize:".72rem",fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:".5px"}}>Follow-ups this month:</span>
          {byAE.map(({ae,count})=>(
            <span key={ae} style={{display:"flex",alignItems:"center",gap:5,fontSize:".78rem",fontWeight:600,color:"#0f172a"}}>
              <span style={{width:8,height:8,borderRadius:"50%",background:aeColor(ae),display:"inline-block"}}/>
              {ae} <span style={{color:aeColor(ae)}}>{count}</span>
            </span>
          ))}
        </div>
      )}

      {/* Calendar grid */}
      <div style={{background:"#fff",borderRadius:14,border:"1.5px solid #e2e8f0",overflow:"hidden"}}>
        {/* Day headers */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",borderBottom:"1.5px solid #e2e8f0"}}>
          {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d=>(
            <div key={d} style={{padding:"10px 0",textAlign:"center",fontSize:".68rem",fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:".5px"}}>{d}</div>
          ))}
        </div>
        {/* Cells */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)"}}>
          {cells.map((day,idx)=>{
            if(!day) return <div key={"e"+idx} style={{minHeight:90,borderRight:"1px solid #f1f5f9",borderBottom:"1px solid #f1f5f9",background:"#fafafa"}}/>;
            const dayStr=String(day).padStart(2,"0");
            const dateStr=`${monthStr}-${dayStr}`;
            const isToday=dateStr===todayStr;
            const evts=events[dayStr]||[];
            const isPast=dateStr<todayStr;
            return(
              <div key={day} style={{minHeight:90,padding:"6px 8px",borderRight:"1px solid #f1f5f9",borderBottom:"1px solid #f1f5f9",background:isToday?"#eff6ff":isPast?"#fafafa":"#fff",position:"relative"}}>
                <div style={{fontWeight:isToday?800:500,fontSize:".8rem",color:isToday?"#1d4ed8":"#475569",marginBottom:4,width:24,height:24,borderRadius:"50%",background:isToday?"#1d4ed8":"transparent",display:"flex",alignItems:"center",justifyContent:"center",color:isToday?"#fff":"#475569"}}>{day}</div>
                {evts.slice(0,3).map((ev,i)=>(
                  <div key={i} title={ev.label+(ev.ceNo?" · "+ev.ceNo:"")} style={{background:aeColor(ev.ae)+"22",borderLeft:`3px solid ${aeColor(ev.ae)}`,borderRadius:"0 4px 4px 0",padding:"2px 5px",marginBottom:2,fontSize:".62rem",fontWeight:600,color:"#0f172a",overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis",cursor:"default"}}>
                    {ev.type==="followup"?"📅 ":"🆕 "}{ev.label}
                  </div>
                ))}
                {evts.length>3&&<div style={{fontSize:".6rem",color:"#94a3b8",fontWeight:600}}>+{evts.length-3} more</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div style={{marginTop:12,display:"flex",gap:16,flexWrap:"wrap"}}>
        <span style={{fontSize:".72rem",color:"#64748b"}}>📅 Follow-up date &nbsp; 🆕 Date acquired</span>
        {Object.entries(AE_COLORS).map(([ae,clr])=>(
          <span key={ae} style={{display:"flex",alignItems:"center",gap:4,fontSize:".72rem",color:"#64748b"}}>
            <span style={{width:10,height:10,borderRadius:2,background:clr,display:"inline-block"}}/>
            {ae.split(" ")[0]}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── CLIENT AUTOCOMPLETE ──────────────────────────────────────────────────────
function ClientDirectory({deals, session, role, vvipClients, toggleVvip, customClients}){
  const[selClient,  setSelClient]  = useState(null);
  const[search,     setSearch]     = useState("");
  const[filter,     setFilter]     = useState("all");
  const[editClient, setEditClient] = useState(null);
  const[editName,   setEditName]   = useState("");
  const[addName,    setAddName]    = useState("");
  const[addOpen,    setAddOpen]    = useState(false);
  const[,forceUpdate]              = useState(0);

  const saveClientEdit=()=>{
    if(!editName.trim()) return;
    const idx = GMD_CLIENTS.findIndex(c=>c.name===editClient);
    if(idx > -1) GMD_CLIENTS[idx].name = editName.trim();
    setEditClient(null); setEditName("");
  };

  const allClients=[...GMD_CLIENTS,...(customClients||[])];
  const filtered = useMemo(()=>{
    let list = allClients;
    if(search) list = list.filter(c=>
      c.name.toLowerCase().includes(search.toLowerCase())||
      (c.city||"").toLowerCase().includes(search.toLowerCase())||
      (c.email||"").toLowerCase().includes(search.toLowerCase())
    );
    if(filter==="with-balance") list = list.filter(c=>c.balance>0);
    if(filter==="with-projects") list = list.filter(c=>deals.some(d=>d.client===c.name));
    if(filter==="vvip") list = list.filter(c=>vvipClients?.has(c.name));
    // VVIP always on top
    list=[...list].sort((a,b)=>{
      const av=vvipClients?.has(a.name)?0:1;
      const bv=vvipClients?.has(b.name)?0:1;
      return av-bv||a.name.localeCompare(b.name);
    });
    return list;
  },[search,filter,deals,vvipClients,customClients]);

  const totalBalance = allClients.reduce((s,c)=>s+(Number(c.balance)||0),0);

  return(
    <div>
      {/* Header */}
      <div style={{marginBottom:20,display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:10}}>
        <div>
          <h2 style={{margin:0,fontWeight:800,color:"#0f172a",fontSize:"1.15rem"}}>Client Directory</h2>
          <p style={{margin:"4px 0 0",color:"#64748b",fontSize:".78rem"}}>{allClients.length} clients on record</p>
        </div>
        <button onClick={()=>setAddOpen(true)} style={{background:"#059669",border:"none",borderRadius:9,padding:"9px 18px",fontFamily:"inherit",fontWeight:700,fontSize:".85rem",color:"#fff",cursor:"pointer"}}>+ Add Client</button>
      </div>
      {addOpen&&(
        <div style={{background:"#f0fdf4",border:"1.5px solid #6ee7b7",borderRadius:12,padding:"16px 18px",marginBottom:16}}>
          <div style={{fontWeight:700,color:"#059669",fontSize:".88rem",marginBottom:10}}>Add New Client</div>
          <div style={{display:"flex",gap:10,alignItems:"center"}}>
            <input value={addName} onChange={e=>setAddName(e.target.value)}
              onKeyDown={e=>{if(e.key==="Enter"&&addName.trim()){if(GMD_CLIENTS.find(c=>c.name.toLowerCase()===addName.trim().toLowerCase())){alert("Client already exists.");return;}GMD_CLIENTS.push({name:addName.trim(),id:"c"+Date.now(),addedBy:session?.name||"",addedAt:today});setAddName("");setAddOpen(false);forceUpdate(n=>n+1);}}}
              placeholder="Full client / company name…" autoFocus
              style={{flex:1,border:"1.5px solid #6ee7b7",borderRadius:8,padding:"9px 13px",fontFamily:"inherit",fontSize:".86rem",outline:"none"}}/>
            <button onClick={()=>{if(!addName.trim())return;if(GMD_CLIENTS.find(c=>c.name.toLowerCase()===addName.trim().toLowerCase())){alert("Client already exists.");return;}GMD_CLIENTS.push({name:addName.trim(),id:"c"+Date.now(),addedBy:session?.name||"",addedAt:today});setAddName("");setAddOpen(false);forceUpdate(n=>n+1);}}
              style={{background:"#059669",border:"none",borderRadius:8,padding:"9px 18px",fontFamily:"inherit",fontSize:".85rem",color:"#fff",cursor:"pointer",fontWeight:700}}>Add</button>
            <button onClick={()=>{setAddOpen(false);setAddName("");}} style={{background:"#f1f5f9",border:"none",borderRadius:8,padding:"9px 14px",fontFamily:"inherit",fontSize:".85rem",color:"#64748b",cursor:"pointer"}}>Cancel</button>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
        {[
          {l:"Total Clients",    v:allClients.length,                                      c:"#3b82f6"},
          {l:"With Active Deals",v:allClients.filter(c=>deals.some(d=>d.client===c.name)).length, c:"#10b981"},
          {l:"Open Balances",    v:allClients.filter(c=>c.balance>0).length,               c:"#ef4444"},
          {l:"Total Outstanding",v:"₱"+totalBalance.toLocaleString(),                       c:"#f59e0b"},
        ].map(({l,v,c})=>(
          <div key={l} style={{background:"#fff",borderRadius:12,padding:"15px 18px",border:"1.5px solid #e2e8f0"}}>
            <div style={{fontWeight:800,fontSize:"1.4rem",color:c,fontFamily:"'Barlow Condensed',sans-serif"}}>{v}</div>
            <div style={{fontSize:".65rem",textTransform:"uppercase",letterSpacing:"1px",color:"#94a3b8",marginTop:5}}>{l}</div>
          </div>
        ))}
      </div>

      {/* Open balances alert */}
      {allClients.filter(c=>c.balance>0).length>0&&(
        <div style={{background:"#fef2f2",border:"1.5px solid #fecaca",borderRadius:12,padding:"12px 18px",marginBottom:16,display:"flex",gap:16,flexWrap:"wrap",alignItems:"center"}}>
          <span style={{fontSize:"1.2rem"}}>⚠️</span>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,color:"#dc2626",fontSize:".88rem"}}>Clients with outstanding balances</div>
            <div style={{display:"flex",gap:16,marginTop:4,flexWrap:"wrap"}}>
              {allClients.filter(c=>c.balance>0).map(c=>(
                <span key={c.name} style={{fontSize:".78rem",color:"#ef4444"}}>
                  <strong>{c.name}</strong> — ₱{c.balance.toLocaleString()}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Search + filters */}
      <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
        <FInp
          value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="Search by name, city, or email…"
          style={{flex:1,minWidth:200,border:"1.5px solid #e2e8f0",borderRadius:8,padding:"9px 13px",fontFamily:"inherit",fontSize:".86rem",color:"#1e293b",outline:"none"}}
        />
        {[
          {id:"all",           l:`All (${allClients.length})`},
          {id:"with-balance",  l:`Open Balance (${allClients.filter(c=>c.balance>0).length})`},
          {id:"with-projects", l:`Has Deals (${allClients.filter(c=>deals.some(d=>d.client===c.name)).length})`},
          {id:"vvip",          l:`⭐ VVIP (${vvipClients?.size||0})`},
        ].map(({id,l})=>(
          <button key={id} onClick={()=>setFilter(id)}
            style={{padding:"7px 14px",borderRadius:20,border:`1.5px solid ${filter===id?"#1e293b":"#e2e8f0"}`,background:filter===id?"#1e293b":"#fff",color:filter===id?"#fff":"#64748b",fontFamily:"inherit",fontWeight:filter===id?700:400,fontSize:".78rem",cursor:"pointer",whiteSpace:"nowrap"}}>
            {l}
          </button>
        ))}
      </div>

      {/* Client list */}
      <div style={{background:"#fff",borderRadius:14,border:"1.5px solid #e2e8f0",overflow:"hidden"}}>
        <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:0,padding:"8px 18px",background:"#f8fafc",borderBottom:"1.5px solid #e2e8f0",fontSize:".65rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"1px",color:"#94a3b8"}}>
          {["Client Name","City","Contact","Status"].map(h=><div key={h}>{h}</div>)}
        </div>
        {filtered.map((c,i)=>{
          const clientDeals = deals.filter(d=>d.client===c.name);
          const hasBalance  = c.balance>0;
          const hasDeals    = clientDeals.length>0;
          return(
            <div key={i} onClick={()=>setSelClient(c.name)} style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:0,padding:"12px 18px",cursor:"pointer",borderBottom:"1px solid #f1f5f9",background:hasBalance?"#fef9f9":i%2===0?"#fff":"#fafafa",alignItems:"center",transition:"background .1s"}}
              onMouseEnter={e=>e.currentTarget.style.background="#f0f9ff"}
              onMouseLeave={e=>e.currentTarget.style.background=hasBalance?"#fef9f9":i%2===0?"#fff":"#fafafa"}>
              <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
                {(role==="Manager"||role==="Sales")&&(
                  <button onClick={()=>toggleVvip(c.name)} title={vvipClients?.has(c.name)?"Remove VVIP":"Mark as VVIP"}
                    style={{background:"none",border:"none",cursor:"pointer",fontSize:"1rem",padding:"0 2px",color:vvipClients?.has(c.name)?"#f59e0b":"#cbd5e1",flexShrink:0,marginTop:1}}>
                    {vvipClients?.has(c.name)?"⭐":"☆"}
                  </button>
                )}
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    {editClient===c.name ? (
                      <div style={{display:"flex",gap:6,alignItems:"center"}}>
                        <input value={editName} onChange={e=>setEditName(e.target.value)}
                          onKeyDown={e=>{if(e.key==="Enter")saveClientEdit();if(e.key==="Escape"){setEditClient(null);}}}
                          autoFocus style={{border:"1.5px solid #3b82f6",borderRadius:6,padding:"3px 8px",fontFamily:"inherit",fontSize:".85rem",width:200}}/>
                        <button onClick={saveClientEdit} style={{background:"#3b82f6",border:"none",borderRadius:5,padding:"3px 10px",color:"#fff",cursor:"pointer",fontSize:".75rem",fontWeight:700}}>Save</button>
                        <button onClick={()=>setEditClient(null)} style={{background:"#f1f5f9",border:"none",borderRadius:5,padding:"3px 8px",color:"#64748b",cursor:"pointer",fontSize:".75rem"}}>✕</button>
                      </div>
                    ):(
                      <>
                        <span style={{fontWeight:600,color:"#0f172a",fontSize:".88rem"}}>{c.name}</span>
                        {vvipClients?.has(c.name)&&<span style={{fontSize:".65rem",background:"#fef3c7",color:"#d97706",border:"1px solid #fde68a",borderRadius:20,padding:"1px 7px",fontWeight:700}}>VVIP</span>}
                        {(role==="Manager")&&<button onClick={e=>{e.stopPropagation();setEditClient(c.name);setEditName(c.name);}} style={{background:"none",border:"none",cursor:"pointer",fontSize:".75rem",color:"#94a3b8",padding:"0 2px"}} title="Edit client name">✏️</button>}
                      </>
                    )}
                  </div>
                  {c.email&&<div style={{fontSize:".72rem",color:"#94a3b8",marginTop:2}}>{c.email}</div>}
                  {hasBalance&&<div style={{fontSize:".72rem",color:"#ef4444",fontWeight:700,marginTop:2}}>⚠ ₱{c.balance.toLocaleString()} outstanding</div>}
                </div>
              </div>
              <div style={{fontSize:".78rem",color:"#64748b"}}>{c.city||"—"}</div>
              <div style={{fontSize:".78rem",color:"#64748b"}}>{c.phone||"—"}</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {hasDeals?(
                  <span style={{fontSize:".68rem",background:"#f0fdf4",color:"#059669",border:"1px solid #6ee7b7",borderRadius:20,padding:"2px 8px",fontWeight:700}}>
                    {clientDeals.length} deal{clientDeals.length>1?"s":""}
                  </span>
                ):(
                  <span style={{fontSize:".68rem",color:"#cbd5e1"}}>No deals</span>
                )}
                {hasBalance&&(
                  <span style={{fontSize:".68rem",background:"#fef2f2",color:"#dc2626",border:"1px solid #fecaca",borderRadius:20,padding:"2px 8px",fontWeight:700}}>
                    Balance due
                  </span>
                )}
              </div>
            </div>
          );
        })}
        {filtered.length===0&&(
          <div style={{padding:"32px 0",textAlign:"center",color:"#94a3b8",fontSize:".84rem"}}>
            No clients match your search.
          </div>
        )}
      </div>
      <div style={{marginTop:10,fontSize:".72rem",color:"#94a3b8",textAlign:"right"}}>
        Showing {filtered.length} of {allClients.length} clients
      </div>
      {/* Client History Modal */}
      {selClient&&(()=>{
        const clientDeals=deals.filter(d=>d.client===selClient);
        const totalValue=clientDeals.reduce((s,d)=>s+Number(d.value||0),0);
        const totalCollected=clientDeals.reduce((s,d)=>s+Number(d.amountPaid||0),0);
        const isVvip=vvipClients?.has(selClient);
        return(
          <Modal open title={`${isVvip?"⭐ ":""}${selClient}`} onClose={()=>setSelClient(null)} wide>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:16}}>
              {[
                {l:"Total Projects",  v:clientDeals.length,                           c:"#3b82f6"},
                {l:"Total Value",     v:"₱"+totalValue.toLocaleString("en-PH",{minimumFractionDigits:0}), c:"#0f172a"},
                {l:"Total Collected", v:"₱"+totalCollected.toLocaleString("en-PH",{minimumFractionDigits:0}), c:"#059669"},
              ].map(({l,v,c})=>(
                <div key={l} style={{background:"#f8fafc",borderRadius:10,padding:"12px 14px",textAlign:"center"}}>
                  <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.2rem",color:c}}>{v}</div>
                  <div style={{fontSize:".65rem",textTransform:"uppercase",letterSpacing:"1px",color:"#94a3b8",marginTop:4}}>{l}</div>
                </div>
              ))}
            </div>
            {clientDeals.length===0&&<div style={{textAlign:"center",padding:"24px",color:"#94a3b8"}}>No projects on record.</div>}
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {clientDeals.sort((a,b)=>new Date(b.dateAcquired||0)-new Date(a.dateAcquired||0)).map(d=>(
                <div key={d.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",background:"#f8fafc",borderRadius:9,border:"1px solid #e2e8f0",flexWrap:"wrap",gap:8}}>
                  <div>
                    <div style={{fontWeight:600,color:"#0f172a",fontSize:".88rem"}}>{d.contact||d.ceNo||"No project name"}</div>
                    <div style={{fontSize:".72rem",color:"#64748b",marginTop:1}}>{d.ceNo||"No CE"} · {d.ceType} · {d.dateAcquired||""}</div>
                  </div>
                  <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
                    <span style={{fontWeight:700,color:"#0f172a",fontSize:".85rem"}}>₱{Number(d.value||0).toLocaleString("en-PH",{minimumFractionDigits:0})}</span>
                    <span style={{fontSize:".72rem",background:d.paymentStatus==="Paid"?"#f0fdf4":"#f8fafc",color:d.paymentStatus==="Paid"?"#059669":"#94a3b8",border:"1px solid #e2e8f0",borderRadius:20,padding:"2px 9px",fontWeight:600}}>{d.paymentStatus||"—"}</span>
                    <span style={{fontSize:".72rem",color:"#64748b",background:"#f1f5f9",borderRadius:20,padding:"2px 9px"}}>{(d.stage||"").replace(/^[0-9]+ · /,"")}</span>
                  </div>
                </div>
              ))}
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}


// ─── DAILY CASH POSITION DASHBOARD ───────────────────────────────────────────
function DailyCashPosition({cashPositions,saveDayPos,infs,wonDeals,totRev,totExp,totColl,totOut}){
  const[selDate,setSelDate]=useState(today);
  const[pos,setPos]        =useState(()=>cashPositions[today]||emptyDayPosition(today));
  const[saved,setSaved]    =useState(false);
  const[histOpen,setHistOpen]=useState(false);

  // When date changes, load that day's position or start fresh
  const switchDate=(d)=>{
    setSelDate(d);
    const existing=cashPositions[d];
    if(existing){
      setPos(existing); setSaved(true);
    } else {
      // Auto-carry: find most recent saved day before d
      const prevDay=Object.keys(cashPositions).filter(k=>k<d).sort().reverse()[0];
      if(prevDay){
        const prev=cashPositions[prevDay];
        const newBanks={};
        BANKS.forEach(b=>{
          const r=prev.banks?.[b.id]||{};
          newBanks[b.id]={beg:r.end||r.book||"",book:"",end:""};
        });
        setPos({...emptyDayPosition(d),banks:newBanks});
      } else {
        setPos(emptyDayPosition(d));
      }
      setSaved(false);
    }
  };

  // Auto-pull today's FabHub collections
  const todayInflows=useMemo(()=>{
    const mo=new Date(selDate).getMonth();
    // Simple: sum inflows for the selected month (daily breakdown not available)
    return infs.filter(i=>i.month===mo).reduce((s,i)=>s+i.amount,0);
  },[infs,selDate]);

  const f=(path,val)=>{
    setSaved(false);
    setPos(p=>{
      const parts=path.split(".");
      if(parts.length===1) return {...p,[path]:val};
      if(parts.length===2) return {...p,[parts[0]]:{...p[parts[0]],[parts[1]]:val}};
      if(parts.length===3) return {...p,[parts[0]]:{...p[parts[0]],[parts[1]]:{...p[parts[0]][parts[1]],[parts[2]]:val}}};
      return p;
    });
  };

  const n=(v)=>Number(String(v).replace(/,/g,""))||0;
  const fmt2=(v)=>n(v).toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2});

  // Bank totals
  const bankTotals=useMemo(()=>{
    let beg=0,book=0,end=0;
    let capBeg=0,capBook=0,capEnd=0;
    BANKS.forEach(b=>{
      const row=pos.banks[b.id]||emptyBankRow();
      if(b.capital){
        capBeg+=n(row.beg); capBook+=n(row.book); capEnd+=n(row.end);
      } else {
        beg+=n(row.beg); book+=n(row.book); end+=n(row.end);
      }
    });
    return {beg,book,end, capBeg,capBook,capEnd};
  },[pos.banks]);

  // Collections total
  const totalCollections=useMemo(()=>{
    return todayInflows+n(pos.collections.manualAmt);
  },[todayInflows,pos.collections.manualAmt]);

  // Less total
  const totalLess=useMemo(()=>{
    return n(pos.less.bizlink)+n(pos.less.checkFloat)+n(pos.less.otherAmt);
  },[pos.less]);

  // Total Cash Available = Total Book Balance - Less
  // Book balance = what bank confirms; if not filled, use ending balance
  const workingBook=bankTotals.book>0?bankTotals.book:bankTotals.end;
  const totalCashAvailable=workingBook-totalLess; // Working capital only — Unionbank (capital) excluded

  const handleSave=()=>{
    const toSave={...pos,collections:{...pos.collections,fabhubAmt:todayInflows},savedAt:new Date().toISOString()};
    saveDayPos(selDate,toSave);
    setSaved(true);
  };

  const histDates=Object.keys(cashPositions).sort().reverse().slice(0,30);

  const exportDCPCSV=()=>{
    const dates=Object.keys(cashPositions).sort();
    const rows=[["Date","BPI Beg","BPI End","Metrobank Beg","Metrobank End","Chinabank Beg","Chinabank End","BDO Beg","BDO End","Security Beg","Security End","Working Capital","Collections","Less Total","Cash Available","Notes"]];
    dates.forEach(date=>{
      const pos=cashPositions[date];if(!pos)return;
      const wc=['bpi','metro','china','bdo','security'].reduce((s,b)=>s+Number(pos.banks?.[b]?.end||0),0);
      const less=Number(pos.less?.bizlink||0)+Number(pos.less?.checkFloat||0)+Number(pos.less?.otherAmt||0);
      const coll=Number(pos.collections?.manualAmt||0);
      rows.push([date,
        pos.banks?.bpi?.beg||0,pos.banks?.bpi?.end||0,
        pos.banks?.metro?.beg||0,pos.banks?.metro?.end||0,
        pos.banks?.china?.beg||0,pos.banks?.china?.end||0,
        pos.banks?.bdo?.beg||0,pos.banks?.bdo?.end||0,
        pos.banks?.security?.beg||0,pos.banks?.security?.end||0,
        wc.toFixed(2),coll.toFixed(2),less.toFixed(2),(wc+coll-less).toFixed(2),
        pos.notes||""
      ]);
    });
    const csv=rows.map(r=>r.map(v=>(`"${String(v).replace(/"/g,'""')}"`)).join(",")).join("\n");
    const a=document.createElement("a");
    a.href="data:text/csv;charset=utf-8,"+encodeURIComponent("﻿"+csv);
    a.download=`GMD_CashPosition_${today}.csv`;
    a.click();
  };

  const inpStyle={
    textAlign:"right",border:"1.5px solid #e2e8f0",borderRadius:6,
    padding:"6px 10px",fontFamily:"inherit",fontSize:".85rem",
    color:"#0f172a",background:"#fff",width:"100%",boxSizing:"border-box",outline:"none"
  };
  const cellStyle=(bg="#fff",bold=false)=>({
    padding:"8px 12px",borderBottom:"1px solid #e2e8f0",
    background:bg,fontWeight:bold?"700":"400",fontSize:".82rem",
    color:"#0f172a"
  });
  const labelCell={
    padding:"8px 12px",borderBottom:"1px solid #e2e8f0",
    background:"#f8fafc",fontWeight:600,fontSize:".8rem",
    color:"#475569",fontStyle:"italic",borderRight:"2px solid #e2e8f0",
    whiteSpace:"nowrap"
  };

  return(
    <div>
      <style>{`
        .cash-inp:focus{border-color:#1d4ed8!important;box-shadow:0 0 0 3px rgba(29,78,216,.1);}
        .bank-header{background:#1e293b;color:#fff;padding:10px 12px;fontWeight:700;fontSize:.78rem;textAlign:center;borderRight:1px solid #334155;}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
      `}</style>

      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:12}}>
        <div>
          <h2 style={{margin:0,fontWeight:800,color:"#0f172a",fontSize:"1.2rem"}}>Daily Cash Position</h2>
          <div style={{fontSize:".78rem",color:"#64748b",marginTop:3}}>GMD Productions Inc. — Finance Summary</div>
        </div>
        <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
          {/* Export button */}
          <button onClick={exportDCPCSV}
            style={{background:"#eff6ff",border:"1.5px solid #bfdbfe",borderRadius:8,padding:"7px 14px",fontFamily:"inherit",fontSize:".78rem",fontWeight:700,color:"#1d4ed8",cursor:"pointer"}}>
            ⬇ Export CSV
          </button>
          {/* Date picker */}
          <input type="date" value={selDate} onChange={e=>switchDate(e.target.value)}
            style={{border:"1.5px solid #e2e8f0",borderRadius:8,padding:"8px 12px",fontFamily:"inherit",fontSize:".85rem",color:"#0f172a",cursor:"pointer"}}/>
          {/* History */}
          <button onClick={()=>setHistOpen(h=>!h)} style={{background:"#f8fafc",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"8px 14px",fontFamily:"inherit",fontSize:".8rem",color:"#64748b",cursor:"pointer",fontWeight:600}}>
            📅 History ({histDates.length})
          </button>
          {/* Save */}
          <button onClick={handleSave} style={{background:saved?"#f0fdf4":"#1e293b",border:`1.5px solid ${saved?"#6ee7b7":"#1e293b"}`,borderRadius:8,padding:"8px 18px",fontFamily:"inherit",fontSize:".84rem",color:saved?"#059669":"#fff",cursor:"pointer",fontWeight:700,transition:"all .2s"}}>
            {saved?"✓ Saved":"Save Position"}
          </button>
        </div>
      </div>

      {/* History dropdown */}
      {histOpen&&histDates.length>0&&(
        <div style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:12,padding:16,marginBottom:16,animation:"fadeIn .2s"}}>
          <div style={{fontWeight:700,color:"#0f172a",marginBottom:10,fontSize:".88rem"}}>Saved Positions</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {histDates.map(d=>(
              <button key={d} onClick={()=>{switchDate(d);setHistOpen(false);}}
                style={{padding:"5px 12px",borderRadius:20,border:`1.5px solid ${d===selDate?"#1e293b":"#e2e8f0"}`,background:d===selDate?"#1e293b":"#fff",color:d===selDate?"#fff":"#64748b",fontFamily:"inherit",fontSize:".78rem",cursor:"pointer",fontWeight:d===selDate?700:400}}>
                {d}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* KPI strip */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:20}}>
        {[
          ["Total Cash Available", "₱"+fmt2(totalCashAvailable), totalCashAvailable>=0?"#059669":"#ef4444"],
          ["Working Capital (5 Banks)", "₱"+fmt2(workingBook), "#1d4ed8"],
          ["GMD Capital (Unionbank)",  "₱"+fmt2(bankTotals.capBook), "#0e7490"],
          ["Collections Today",    "₱"+fmt2(totalCollections),   "#10b981"],
          ["Outstanding Invoices", "₱"+Math.max(0,totOut).toLocaleString("en-PH",{minimumFractionDigits:2}), "#f59e0b"],
          ["YTD Receivable",       pos.ytd.accountsReceivable?"₱"+fmt2(pos.ytd.accountsReceivable):"—", "#8b5cf6"],
        ].map(([l,v,c])=>(
          <div key={l} style={{background:"#fff",borderRadius:12,padding:"14px 16px",border:"1.5px solid #e2e8f0",boxShadow:"0 1px 4px rgba(0,0,0,.04)"}}>
            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.3rem",color:c,lineHeight:1}}>{v}</div>
            <div style={{fontSize:".63rem",textTransform:"uppercase",letterSpacing:"1px",color:"#94a3b8",marginTop:6}}>{l}</div>
          </div>
        ))}
      </div>

      {/* Main cash position table */}
      <div style={{background:"#fff",borderRadius:14,border:"1.5px solid #e2e8f0",overflow:"hidden",marginBottom:16,boxShadow:"0 1px 6px rgba(0,0,0,.05)"}}>
        {/* Table header */}
        <div style={{display:"grid",gridTemplateColumns:"200px repeat(5,1fr) 130px",background:"#1e293b"}}>
          <div style={{padding:"12px 14px",color:"rgba(255,255,255,.6)",fontSize:".72rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"1px",borderRight:"1px solid #334155"}}>CATEGORY</div>
          {BANKS.filter(b=>!b.capital).map(b=>(
            <div key={b.id} style={{padding:"10px 8px",textAlign:"center",borderRight:"1px solid #334155"}}>
              <div style={{fontWeight:800,color:"#fff",fontSize:".78rem"}}>{b.short}</div>
              <div style={{fontSize:".62rem",color:"rgba(255,255,255,.45)",marginTop:1}}>{b.name.length>20?b.name.slice(0,18)+"…":b.name}</div>
            </div>
          ))}
          <div style={{padding:"12px 8px",textAlign:"center",color:"#f59e0b",fontWeight:800,fontSize:".78rem"}}>TOTAL</div>
        </div>

        {/* Balance rows */}
        {[
          ["BANK BALANCE BEG",  "beg",  "#fafafa"],
          ["BOOK BALANCE\n(per bank statement)", "book", "#fff"],
          ["BANK BALANCE ENDING","end", "#fafafa"],
        ].map(([label,key,bg])=>(
          <div key={key} style={{display:"grid",gridTemplateColumns:"200px repeat(5,1fr) 130px",borderBottom:"1px solid #e2e8f0",background:bg}}>
            <div style={labelCell}>{label}</div>
            {BANKS.filter(b=>!b.capital).map(b=>(
              <div key={b.id} style={{padding:"4px 6px",borderRight:"1px solid #f1f5f9",display:"flex",alignItems:"center"}}>
                <CurrInp
                  value={pos.banks[b.id]?.[key]||""}
                  onChange={e=>f(`banks.${b.id}.${key}`,e.target.value)}
                  style={{...inpStyle,borderColor:"transparent",background:"transparent",textAlign:"right",padding:"5px 8px"}}/>
              </div>
            ))}
            <div style={{padding:"8px 12px",textAlign:"right",fontWeight:700,fontSize:".85rem",
              color:key==="end"?"#059669":key==="book"?"#1d4ed8":"#0f172a",
              background:key==="end"?"#f0fdf4":key==="book"?"#eff6ff":"transparent",
              display:"flex",alignItems:"center",justifyContent:"flex-end"}}>
              {fmt2(BANKS.reduce((s,b)=>s+n(pos.banks[b.id]?.[key]),0))}
            </div>
          </div>
        ))}

        {/* Collections section */}
        <div style={{background:"#f0fdf4",borderBottom:"1px solid #d1fae5",borderTop:"2px solid #6ee7b7"}}>
          <div style={{display:"grid",gridTemplateColumns:"200px 1fr 130px"}}>
            <div style={{...labelCell,background:"#dcfce7",color:"#059669",fontWeight:700,fontSize:".82rem",display:"flex",alignItems:"center",borderRight:"2px solid #6ee7b7"}}>COLLECTIONS</div>
            <div style={{padding:"8px 12px",display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
              <span style={{fontSize:".75rem",color:"#059669",fontWeight:600,whiteSpace:"nowrap"}}>
                🔗 FabHub Auto: ₱{fmt2(todayInflows)}
                <span style={{fontSize:".68rem",color:"#94a3b8",fontWeight:400,marginLeft:4}}>(from logged inflows this month)</span>
              </span>
              <CurrInp
                value={pos.collections.manualAmt||""}
                onChange={e=>f("collections.manualAmt",e.target.value)}
                style={{...inpStyle,width:150,borderColor:"#6ee7b7"}}/>
              <input type="text"
                key={`coll-note-${selDate}`}
                value={pos.collections.manualNote||""}
                onChange={e=>f("collections.manualNote",e.target.value)}
                placeholder="Note (e.g. cash deposit, cheque)"
                style={{...inpStyle,flex:1,minWidth:120,textAlign:"left",borderColor:"#6ee7b7"}}/>
            </div>
            <div style={{padding:"8px 12px",textAlign:"right",fontWeight:800,color:"#059669",fontSize:".88rem",display:"flex",alignItems:"center",justifyContent:"flex-end"}}>
              {fmt2(totalCollections)}
            </div>
          </div>
        </div>

        {/* Less section */}
        <div style={{background:"#fef2f2",borderBottom:"1px solid #fecaca",borderTop:"2px solid #fca5a5"}}>
          <div style={{padding:"7px 14px",fontWeight:700,color:"#dc2626",fontSize:".72rem",textTransform:"uppercase",letterSpacing:"1px",borderBottom:"1px solid #fee2e2"}}>LESS:</div>
          {[
            ["Online Transaction (Bizlink)","less.bizlink"],
            ["Check Float",                "less.checkFloat"],
          ].map(([label,path])=>(
            <div key={path} style={{display:"grid",gridTemplateColumns:"200px 1fr 130px",borderBottom:"1px solid #fee2e2"}}>
              <div style={{...labelCell,background:"#fff5f5",color:"#dc2626",fontSize:".78rem",borderRight:"2px solid #fca5a5"}}>{label}</div>
              <div style={{padding:"5px 10px",display:"flex",alignItems:"center"}}>
                <CurrInp
                  value={path.split(".").reduce((o,k)=>o?.[k],pos)||""}
                  onChange={e=>f(path,e.target.value)}
                  style={{...inpStyle,borderColor:"#fca5a5"}}/>
              </div>
              <div style={{padding:"8px 12px",textAlign:"right",fontWeight:600,color:"#dc2626",fontSize:".85rem",display:"flex",alignItems:"center",justifyContent:"flex-end"}}>
                {fmt2(path.split(".").reduce((o,k)=>o?.[k],pos))}
              </div>
            </div>
          ))}
          {/* Other less */}
          <div style={{display:"grid",gridTemplateColumns:"200px 1fr 130px"}}>
            <div style={{...labelCell,background:"#fff5f5",color:"#dc2626",fontSize:".78rem",borderRight:"2px solid #fca5a5"}}>Other</div>
            <div style={{padding:"5px 10px",display:"flex",gap:8,alignItems:"center"}}>
              <CurrInp
                value={pos.less.otherAmt||""}
                onChange={e=>f("less.otherAmt",e.target.value)}
                style={{...inpStyle,width:150,flexShrink:0,borderColor:"#fca5a5"}}/>
              <input className="cash-inp" type="text"
                key={`other-note-${selDate}`}
                value={pos.less.otherNote||""}
                onChange={e=>f("less.otherNote",e.target.value)}
                placeholder="Description" style={{...inpStyle,flex:1,textAlign:"left",borderColor:"#fca5a5"}}/>
            </div>
            <div style={{padding:"8px 12px",textAlign:"right",fontWeight:600,color:"#dc2626",fontSize:".85rem",display:"flex",alignItems:"center",justifyContent:"flex-end"}}>
              {fmt2(pos.less.otherAmt)}
            </div>
          </div>
        </div>

        {/* Total Cash Available — highlighted */}
        <div style={{display:"grid",gridTemplateColumns:"200px 1fr 130px",background:"#1e293b",borderTop:"3px solid #f59e0b"}}>
          <div style={{padding:"14px 14px",color:"#f59e0b",fontWeight:800,fontSize:".88rem",textTransform:"uppercase",letterSpacing:".5px",display:"flex",alignItems:"center"}}>TOTAL CASH AVAILABLE</div>
          <div style={{padding:"14px 12px",color:"rgba(255,255,255,.5)",fontSize:".78rem",display:"flex",alignItems:"center"}}>
            Book Balance minus all deductions
          </div>
          <div style={{padding:"14px 12px",textAlign:"right",fontWeight:800,fontSize:"1.1rem",
            color:totalCashAvailable>=0?"#4ade80":"#f87171",
            fontFamily:"'Barlow Condensed',sans-serif",display:"flex",alignItems:"center",justifyContent:"flex-end"}}>
            ₱{fmt2(totalCashAvailable)}
          </div>
        </div>
      </div>

      {/* Bottom grid: Key Areas + FabHub Collections breakdown */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>

        {/* YTD Key Areas */}
        <div style={{background:"#fff",borderRadius:14,border:"1.5px solid #e2e8f0",overflow:"hidden"}}>
          <div style={{background:"#1e293b",padding:"12px 16px",display:"flex",gap:8,alignItems:"center"}}>
            <span style={{fontWeight:700,color:"#f59e0b",fontSize:".88rem",textTransform:"uppercase",letterSpacing:".5px"}}>KEY AREAS</span>
          </div>
          {[
            ["Expected Collection",   "ytd.expectedCollection",  "#f59e0b"],
            ["YTD Supplier Payable",  "ytd.supplierPayable",     "#ef4444"],
            ["YTD Loans Payable",     "ytd.loansPayable",        "#f97316"],
            ["YTD Accounts Receivable","ytd.accountsReceivable", "#10b981"],
          ].map(([label,path,color])=>(
            <div key={path} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 16px",borderBottom:"1px solid #f1f5f9"}}>
              <div style={{fontSize:".8rem",color:"#475569",fontWeight:600,fontStyle:"italic"}}>{label}</div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <CurrInp
                  value={path.split(".").reduce((o,k)=>o?.[k],pos)||""}
                  onChange={e=>f(path,e.target.value)}
                  style={{...inpStyle,width:160,borderColor:`${color}44`}}/>
                <span style={{fontWeight:700,color,minWidth:90,textAlign:"right",fontSize:".82rem"}}>
                  {path.split(".").reduce((o,k)=>o?.[k],pos)?`₱${fmt2(path.split(".").reduce((o,k)=>o?.[k],pos))}`:"—"}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* FabHub Collections breakdown */}
        <div style={{background:"#fff",borderRadius:14,border:"1.5px solid #e2e8f0",overflow:"hidden"}}>
          <div style={{background:"#1e293b",padding:"12px 16px"}}>
            <span style={{fontWeight:700,color:"#4ade80",fontSize:".88rem",textTransform:"uppercase",letterSpacing:".5px"}}>🔗 FabHub Collections</span>
          </div>
          <div style={{padding:"12px 16px"}}>
            <div style={{fontSize:".72rem",color:"#94a3b8",marginBottom:10}}>Outstanding invoices from active projects — auto-pulled from FabHub</div>
            {wonDeals.filter(d=>d.invoiced>0&&d.amountPaid<d.invoiced).slice(0,6).map(d=>{
              const bal=d.invoiced-d.amountPaid;
              const pct=Math.round(d.amountPaid/d.invoiced*100);
              return(
                <div key={d.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:"1px solid #f1f5f9",gap:10}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:600,color:"#0f172a",fontSize:".82rem",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.client}</div>
                    <div style={{fontSize:".68rem",color:"#94a3b8",marginTop:1}}>{d.paymentStatus} · {pct}% collected</div>
                  </div>
                  <div style={{textAlign:"right",flexShrink:0}}>
                    <div style={{fontWeight:700,color:"#ef4444",fontSize:".82rem"}}>₱{bal.toLocaleString("en-PH",{minimumFractionDigits:0})}</div>
                    <div style={{fontSize:".68rem",color:"#94a3b8"}}>of ₱{d.invoiced.toLocaleString("en-PH")}</div>
                  </div>
                </div>
              );
            })}
            {wonDeals.filter(d=>d.invoiced>0&&d.amountPaid<d.invoiced).length===0&&(
              <div style={{textAlign:"center",padding:"20px 0",color:"#94a3b8",fontSize:".82rem"}}>No outstanding balances 🎉</div>
            )}
            <div style={{marginTop:10,display:"flex",justifyContent:"space-between",padding:"8px 0",borderTop:"1.5px solid #e2e8f0"}}>
              <span style={{fontWeight:700,color:"#0f172a",fontSize:".85rem"}}>Total Outstanding</span>
              <span style={{fontWeight:800,color:"#ef4444",fontSize:".92rem"}}>₱{totOut.toLocaleString("en-PH",{minimumFractionDigits:2})}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Fund Transfer Helper */}
      <div style={{background:"#eff6ff",borderRadius:10,border:"1px solid #bfdbfe",padding:"12px 16px",marginBottom:8}}>
        <div style={{fontWeight:700,color:"#1d4ed8",fontSize:".78rem",marginBottom:6}}>💸 Fund Transfer — How to Record</div>
        <div style={{fontSize:".8rem",color:"#3b82f6",lineHeight:1.6}}>
          To record a transfer between banks (e.g. BPI → BDO):<br/>
          1. <strong>Decrease</strong> the ending balance of the source bank (BPI)<br/>
          2. <strong>Increase</strong> the ending balance of the destination bank (BDO)<br/>
          3. Note the transfer amount and banks in the remarks below<br/>
          The net position stays the same — only the bank split changes.
        </div>
      </div>
      
      {/* Unionbank — GMD Save-Up Capital */}
      {(()=>{
        const unionRow=pos.banks["union"]||emptyBankRow();
        return(
          <div style={{background:"#0e7490",borderRadius:12,padding:"14px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
            <div>
              <div style={{fontWeight:800,color:"#fff",fontSize:".9rem"}}>🏛 Unionbank — GMD Save-Up Capital</div>
              <div style={{fontSize:".75rem",color:"rgba(255,255,255,.6)",marginTop:2}}>Excluded from working capital · long-term savings only</div>
            </div>
            <div style={{display:"flex",gap:24,alignItems:"center"}}>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:".65rem",color:"rgba(255,255,255,.5)",textTransform:"uppercase",letterSpacing:".8px",marginBottom:4}}>Beginning</div>
                <input type="number" value={unionRow.beg||""} onChange={e=>setPos(p=>({...p,banks:{...p.banks,union:{...(p.banks.union||emptyBankRow()),beg:e.target.value}}}))}
                  style={{textAlign:"right",border:"1px solid rgba(255,255,255,.3)",borderRadius:6,padding:"5px 8px",background:"rgba(255,255,255,.1)",color:"#fff",fontFamily:"inherit",fontSize:".85rem",width:140}}/>
              </div>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:".65rem",color:"rgba(255,255,255,.5)",textTransform:"uppercase",letterSpacing:".8px",marginBottom:4}}>Ending Balance</div>
                <input type="number" value={unionRow.end||""} onChange={e=>setPos(p=>({...p,banks:{...p.banks,union:{...(p.banks.union||emptyBankRow()),end:e.target.value}}}))}
                  style={{textAlign:"right",border:"1px solid rgba(255,255,255,.3)",borderRadius:6,padding:"5px 8px",background:"rgba(255,255,255,.15)",color:"#fff",fontFamily:"inherit",fontSize:".9rem",fontWeight:700,width:140}}/>
              </div>
              <div style={{textAlign:"center",minWidth:120}}>
                <div style={{fontSize:".65rem",color:"rgba(255,255,255,.5)",textTransform:"uppercase",letterSpacing:".8px",marginBottom:4}}>Saved Capital</div>
                <div style={{fontWeight:800,color:"#67e8f9",fontSize:"1.1rem"}}>₱{n(unionRow.end||unionRow.beg).toLocaleString("en-PH",{minimumFractionDigits:2})}</div>
              </div>
            </div>
          </div>
        );
      })()}

{/* Notes */}
      <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",padding:16}}>
        <div style={{fontWeight:700,color:"#475569",fontSize:".78rem",textTransform:"uppercase",letterSpacing:".8px",marginBottom:8}}>Notes for {selDate}</div>
        <FInp rows={2} value={pos.notes||""} onChange={e=>f("notes",e.target.value)}
          placeholder="e.g. Transfer ₱500k BPI→BDO, incoming wire from client, pending cheque clearance…"
          rows={2}
          style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"10px 13px",fontFamily:"inherit",fontSize:".85rem",color:"#1e293b",resize:"vertical",outline:"none",boxSizing:"border-box"}}/>
      </div>

      {/* Last saved */}
      {pos.savedAt&&(
        <div style={{textAlign:"right",fontSize:".7rem",color:"#94a3b8",marginTop:8}}>
          Last saved: {new Date(pos.savedAt).toLocaleString("en-PH")}
        </div>
      )}
    </div>
  );
}

// ─── EXPORT / IMPORT PANEL ────────────────────────────────────────────────────
function ExportImportPanel({KEYS, onClose}){
  const[importing,  setImporting]  = useState(false);
  const[importMsg,  setImportMsg]  = useState("");
  const[importErr,  setImportErr]  = useState("");

  const ALL_KEYS = [
    {key:KEYS.deals,    label:"Deals / Pipeline"},
    {key:KEYS.projects, label:"Projects & Operations"},
    {key:KEYS.expenses, label:"Expenses"},
    {key:KEYS.inflows,  label:"Inflows / Payments"},
    {key:KEYS.checklist,label:"Checklists"},
    {key:KEYS.swatches, label:"Swatchboard"},
    {key:KEYS.jos,      label:"Job Orders"},
    {key:KEYS.cashPos,  label:"Daily Cash Positions"},
    {key:KEYS.users,    label:"User Accounts"},
  ];

  // Export all data as JSON file
  const handleExport = () => {
    const backup = {
      exportedAt: new Date().toISOString(),
      exportedBy: "FabHub GMD",
      version: "v1",
      data: {}
    };
    ALL_KEYS.forEach(({key, label}) => {
      try {
        const raw = localStorage.getItem(key);
        backup.data[key] = raw ? JSON.parse(raw) : null;
      } catch { backup.data[key] = null; }
    });
    const blob = new Blob([JSON.stringify(backup, null, 2)], {type:"application/json"});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `GMD_FabHub_Backup_${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import from JSON file
  const handleImport = (e) => {
    const file = e.target.files[0];
    if(!file) return;
    setImporting(true);
    setImportMsg(""); setImportErr("");
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const backup = JSON.parse(ev.target.result);
        if(!backup.data) throw new Error("Invalid backup file — missing data section.");
        let restored = 0;
        ALL_KEYS.forEach(({key}) => {
          if(backup.data[key] !== undefined && backup.data[key] !== null) {
            localStorage.setItem(key, JSON.stringify(backup.data[key]));
            restored++;
          }
        });
        setImportMsg(`✓ ${restored} data sets restored from backup dated ${backup.exportedAt?.split("T")[0]||"unknown"}. Refresh the page to see your data.`);
      } catch(err) {
        setImportErr(`Import failed: ${err.message}`);
      }
      setImporting(false);
    };
    reader.readAsText(file);
    e.target.value = ""; // reset input
  };

  // Show data summary
  const summary = ALL_KEYS.map(({key,label})=>{
    try {
      const raw = localStorage.getItem(key);
      if(!raw) return {label, count:"Empty", hasData:false};
      const parsed = JSON.parse(raw);
      const count = Array.isArray(parsed) ? parsed.length
        : typeof parsed === "object" && parsed !== null ? Object.keys(parsed).length
        : 1;
      return {label, count:`${count} record${count!==1?"s":""}`, hasData:count>0};
    } catch { return {label, count:"Error", hasData:false}; }
  });

  return(
    <div>
      {/* Data summary */}
      <div style={{background:"#f8fafc",borderRadius:10,padding:12,marginBottom:16}}>
        <div style={{fontSize:".68rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".8px",color:"#94a3b8",marginBottom:8}}>Current Data in Browser</div>
        {summary.map(({label,count,hasData})=>(
          <div key={label} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:"1px solid #e2e8f0",fontSize:".76rem"}}>
            <span style={{color:"#475569"}}>{label}</span>
            <span style={{fontWeight:600,color:hasData?"#059669":"#94a3b8"}}>{count}</span>
          </div>
        ))}
      </div>

      {/* Export */}
      <button onClick={handleExport}
        style={{width:"100%",background:"#1e293b",border:"none",borderRadius:10,padding:"11px",fontFamily:"inherit",fontWeight:700,fontSize:".87rem",color:"#fff",cursor:"pointer",marginBottom:10,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
        ⬇ Download Backup (.json)
      </button>

      {/* Import */}
      <label style={{display:"block",width:"100%",background:"#f0fdf4",border:"1.5px solid #6ee7b7",borderRadius:10,padding:"10px",fontFamily:"inherit",fontWeight:700,fontSize:".84rem",color:"#059669",cursor:"pointer",textAlign:"center",marginBottom:10}}>
        ⬆ Restore from Backup
        <input type="file" accept=".json" onChange={handleImport} style={{display:"none"}}/>
      </label>

      {importing&&<div style={{fontSize:".78rem",color:"#64748b",textAlign:"center",marginBottom:8}}>Restoring…</div>}
      {importMsg&&(
        <div style={{background:"#f0fdf4",border:"1px solid #6ee7b7",borderRadius:8,padding:"10px 12px",fontSize:".78rem",color:"#059669",marginBottom:8,lineHeight:1.5}}>
          {importMsg}
          <button onClick={()=>window.location.reload()} style={{display:"block",marginTop:8,background:"#059669",border:"none",borderRadius:6,padding:"6px 14px",color:"#fff",fontWeight:700,cursor:"pointer",fontFamily:"inherit",fontSize:".78rem"}}>
            Refresh Now →
          </button>
        </div>
      )}
      {importErr&&<div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:8,padding:"10px 12px",fontSize:".78rem",color:"#dc2626",marginBottom:8}}>{importErr}</div>}

      <div style={{fontSize:".68rem",color:"#94a3b8",textAlign:"center",lineHeight:1.5}}>
        Backup is a .json file saved to your computer.<br/>
        Keep it somewhere safe — Google Drive recommended.
      </div>
    </div>
  );
}

// ─── BUDGET VIEW ──────────────────────────────────────────────────────────────
function BudgetView({wonDeals,budgets,saveBudget,prs,exps,role}){
  const[selDeal,setSelDeal]=useState(wonDeals[0]?.id||null);
  const deal = wonDeals.find(d=>d.id===selDeal);
  const budget = budgets[selDeal]||emptyBudget();
  const[form,setForm]=useState(budget);
  const[saved,setSaved]=useState(false);

  useEffect(()=>{
    const b=budgets[selDeal]||emptyBudget();
    setForm(b); setSaved(!!budgets[selDeal]?.savedAt);
  },[selDeal,budgets]);

  const f=(k,v)=>{setSaved(false);setForm(p=>({...p,[k]:v}));};
  const n=v=>Number(String(v).replace(/,/g,""))||0;
  const fmt=v=>"₱"+Number(v).toLocaleString("en-PH",{minimumFractionDigits:2});

  // Actuals from PRs + expenses tagged to this project
  const actuals = useMemo(()=>{
    const result={Materials:0,Labor:0,Overhead:0,Subcon:0};
    prs.filter(p=>p.projectId===selDeal&&p.status!=="Cancelled").forEach(p=>{
      const cost=(n(p.actUnitCost)||n(p.estUnitCost))*n(p.qty);
      const cat=p.budgetCategory||"Materials";
      if(result[cat]!==undefined) result[cat]+=cost;
    });
    exps.filter(e=>e.projectId===selDeal).forEach(e=>{
      const cat=e.category==="Labor"?"Labor":e.category==="Subcon"?"Subcon":e.category==="Overhead"?"Overhead":"Materials";
      result[cat]+=n(e.amount);
    });
    return result;
  },[prs,exps,selDeal]);

  const totalBudget = BUDGET_CATS.reduce((s,c)=>s+n(form[c]),0);
  const totalActual = BUDGET_CATS.reduce((s,c)=>s+actuals[c],0);
  const contractVal = n(deal?.value)||0;
  const grossMargin = contractVal>0?Math.round((contractVal-totalActual)/contractVal*100):0;
  const budgetUsed  = totalBudget>0?Math.round(totalActual/totalBudget*100):0;

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:12}}>
        <div>
          <h2 style={{margin:0,fontWeight:800,color:"#0f172a",fontSize:"1.15rem"}}>Project Budget</h2>
          <div style={{fontSize:".75rem",color:"#64748b",marginTop:2}}>Set budgets per project — track actual spend vs plan</div>
        </div>
        <select value={selDeal||""} onChange={e=>setSelDeal(e.target.value)}
          style={{border:"1.5px solid #e2e8f0",borderRadius:8,padding:"8px 13px",fontFamily:"inherit",fontSize:".85rem",color:"#0f172a",background:"#fff",cursor:"pointer",minWidth:220}}>
          <option value="">— Select Project —</option>
          {wonDeals.map(d=><option key={d.id} value={d.id}>{d.client}{d.contact?` — ${d.contact}`:""}</option>)}
        </select>
      </div>

      {!deal&&<div style={{textAlign:"center",padding:"48px 0",color:"#94a3b8"}}>Select a project above to set its budget.</div>}

      {deal&&(
        <>
          {/* KPIs */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:20}}>
            {[
              {l:"Contract Value",  v:fmt(contractVal),          c:"#0f172a"},
              {l:"Total Budget",    v:fmt(totalBudget),          c:"#3b82f6"},
              {l:"Actual Spend",    v:fmt(totalActual),          c:totalActual>totalBudget?"#ef4444":"#10b981"},
              {l:"Gross Margin",    v:grossMargin+"%",           c:grossMargin>=20?"#059669":"#ef4444"},
            ].map(({l,v,c})=>(
              <div key={l} style={{background:"#fff",borderRadius:12,padding:"14px 16px",border:"1.5px solid #e2e8f0"}}>
                <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.3rem",color:c}}>{v}</div>
                <div style={{fontSize:".63rem",textTransform:"uppercase",letterSpacing:"1px",color:"#94a3b8",marginTop:5}}>{l}</div>
              </div>
            ))}
          </div>

          {/* Budget table */}
          <div style={{background:"#fff",borderRadius:14,border:"1.5px solid #e2e8f0",overflow:"hidden",marginBottom:16}}>
            <div style={{display:"grid",gridTemplateColumns:"140px 1fr 1fr 1fr 80px",background:"#1e293b",padding:"10px 16px",gap:12}}>
              {["Category","Budget (₱)","Actual Spend","Variance","% Used"].map(h=>(
                <div key={h} style={{fontSize:".68rem",fontWeight:700,color:"rgba(255,255,255,.6)",textTransform:"uppercase",letterSpacing:".8px"}}>{h}</div>
              ))}
            </div>
            {BUDGET_CATS.map((cat,i)=>{
              const bgt=n(form[cat]);
              const act=actuals[cat];
              const variance=bgt-act;
              const pct=bgt>0?Math.round(act/bgt*100):act>0?999:0;
              return(
                <div key={cat} style={{display:"grid",gridTemplateColumns:"140px 1fr 1fr 1fr 80px",padding:"12px 16px",gap:12,borderBottom:"1px solid #f1f5f9",background:i%2?"#fafafa":"#fff",alignItems:"center"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{width:10,height:10,borderRadius:"50%",background:BUDGET_CAT_CLR[cat],flexShrink:0,display:"inline-block"}}/>
                    <span style={{fontWeight:700,color:"#0f172a",fontSize:".85rem"}}>{cat}</span>
                  </div>
                  <div>
                    <input
                      value={form[cat]||""}
                      onChange={e=>f(cat,e.target.value)}
                      placeholder="0.00"
                      style={{border:"1.5px solid #e2e8f0",borderRadius:7,padding:"7px 10px",fontFamily:"inherit",fontSize:".85rem",width:"100%",boxSizing:"border-box",textAlign:"right",outline:"none"}}/>
                  </div>
                  <div style={{fontWeight:600,color:act>bgt&&bgt>0?"#ef4444":"#10b981",fontSize:".88rem",textAlign:"right"}}>{fmt(act)}</div>
                  <div style={{fontWeight:600,color:variance<0?"#ef4444":"#059669",fontSize:".88rem",textAlign:"right"}}>
                    {variance<0?"▼":"▲"} {fmt(Math.abs(variance))}
                  </div>
                  <div style={{textAlign:"center"}}>
                    <span style={{fontSize:".78rem",fontWeight:700,color:pct>100?"#ef4444":pct>80?"#f59e0b":"#059669"}}>
                      {pct===999?"N/A":pct+"%"}
                    </span>
                    {bgt>0&&(
                      <div style={{height:4,background:"#f1f5f9",borderRadius:2,marginTop:4,overflow:"hidden"}}>
                        <div style={{height:"100%",width:Math.min(pct,100)+"%",background:pct>100?"#ef4444":pct>80?"#f59e0b":"#10b981",borderRadius:2}}/>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {/* Totals row */}
            <div style={{display:"grid",gridTemplateColumns:"140px 1fr 1fr 1fr 80px",padding:"12px 16px",gap:12,background:"#1e293b",alignItems:"center"}}>
              <div style={{fontWeight:700,color:"#f59e0b",fontSize:".85rem"}}>TOTAL</div>
              <div style={{fontWeight:800,color:"#fff",fontSize:".9rem",textAlign:"right"}}>{fmt(totalBudget)}</div>
              <div style={{fontWeight:800,color:totalActual>totalBudget?"#f87171":"#4ade80",fontSize:".9rem",textAlign:"right"}}>{fmt(totalActual)}</div>
              <div style={{fontWeight:800,color:totalBudget-totalActual<0?"#f87171":"#4ade80",fontSize:".9rem",textAlign:"right"}}>
                {totalBudget-totalActual<0?"▼":"▲"} {fmt(Math.abs(totalBudget-totalActual))}
              </div>
              <div style={{textAlign:"center",fontWeight:800,color:budgetUsed>100?"#f87171":"#4ade80",fontSize:".85rem"}}>{budgetUsed}%</div>
            </div>
          </div>

          {/* Notes + Save */}
          <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",padding:16,marginBottom:12}}>
            <div style={{fontWeight:700,color:"#475569",fontSize:".78rem",textTransform:"uppercase",letterSpacing:".8px",marginBottom:8}}>Budget Notes</div>
            <textarea value={form.notes||""} onChange={e=>f("notes",e.target.value)}
              placeholder="e.g. Includes mobilization, based on approved CE dated…"
              rows={2} style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"10px 13px",fontFamily:"inherit",fontSize:".85rem",color:"#1e293b",resize:"vertical",outline:"none",boxSizing:"border-box"}}/>
          </div>
          <div style={{display:"flex",gap:10,alignItems:"center"}}>
            <button onClick={()=>{saveBudget(selDeal,form);setSaved(true);}}
              style={{background:"#1e293b",border:"none",borderRadius:10,padding:"10px 24px",fontFamily:"inherit",fontWeight:700,fontSize:".87rem",color:"#fff",cursor:"pointer"}}>
              {saved?"✓ Saved":"Save Budget"}
            </button>
            {budget.savedAt&&<span style={{fontSize:".72rem",color:"#94a3b8"}}>Last saved {new Date(budget.savedAt).toLocaleDateString("en-PH")}</span>}
            {totalActual>totalBudget&&totalBudget>0&&(
              <span style={{fontSize:".78rem",color:"#ef4444",fontWeight:700}}>⚠️ Over budget by {fmt(totalActual-totalBudget)}</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── PROCUREMENT VIEW 2 (Full PR → PO → Delivery) ────────────────────────────
function ProcurementView2({prs,addPR,updatePR,deletePR,wonDeals,budgets,session,role}){
  const[showForm,  setShowForm]  = useState(false);
  const[editingId, setEditingId] = useState(null);
  const[filterProj,setFilterProj]= useState("all");
  const[filterStat,setFilterStat]= useState("all");
  const[filterCat, setFilterCat] = useState("all");
  const[form,setForm]=useState(emptyPR());

  const n=v=>Number(String(v).replace(/,/g,""))||0;
  const fmt=v=>"₱"+Number(v).toLocaleString("en-PH",{minimumFractionDigits:2});
  const f=(k,v)=>setForm(p=>({...p,[k]:v}));

  const openNew=(projId="")=>{
    const deal=wonDeals.find(d=>d.id===projId);
    setForm({...emptyPR(),projectId:projId,projectName:deal?.client||"",requestedBy:session?.name||""});
    setEditingId(null); setShowForm(true);
  };
  const openEdit=(pr)=>{setForm({...pr});setEditingId(pr.id);setShowForm(true);};
  const savePR=()=>{
    if(!form.itemName||!form.projectId) return;
    if(editingId) updatePR(editingId,form);
    else addPR(form);
    setShowForm(false); setEditingId(null);
  };

  const filtered=prs.filter(p=>{
    if(filterProj!=="all"&&p.projectId!==filterProj) return false;
    if(filterStat!=="all"&&p.status!==filterStat) return false;
    if(filterCat!=="all"&&p.category!==filterCat) return false;
    return true;
  });

  const STATUS_CLR={"Draft":"#94a3b8","Pending Approval":"#f59e0b","PO Issued":"#3b82f6","Partially Delivered":"#8b5cf6","Delivered":"#10b981","Cancelled":"#ef4444"};
  const totalValue=filtered.reduce((s,p)=>{
    const cost=(n(p.actUnitCost)||n(p.estUnitCost))*n(p.qty); return s+cost;
  },0);

  return(
    <div>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:12}}>
        <div>
          <h2 style={{margin:0,fontWeight:800,color:"#0f172a",fontSize:"1.15rem"}}>Procurement</h2>
          <div style={{fontSize:".75rem",color:"#64748b",marginTop:2}}>PR → PO → Delivery — all tagged to projects</div>
        </div>
        <button onClick={()=>openNew()} style={{background:"#1e293b",border:"none",borderRadius:10,padding:"9px 18px",fontFamily:"inherit",fontWeight:700,fontSize:".84rem",color:"#fff",cursor:"pointer"}}>
          + New Purchase Request
        </button>
      </div>

      {/* KPI strip */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:18}}>
        {[
          {l:"Total PRs",       v:prs.length,                                           c:"#0f172a"},
          {l:"Pending Approval",v:prs.filter(p=>p.status==="Pending Approval").length,  c:"#f59e0b"},
          {l:"PO Issued",       v:prs.filter(p=>p.status==="PO Issued").length,         c:"#3b82f6"},
          {l:"Total Value",     v:"₱"+totalValue.toLocaleString("en-PH",{minimumFractionDigits:0}), c:"#10b981"},
        ].map(({l,v,c})=>(
          <div key={l} style={{background:"#fff",borderRadius:12,padding:"14px 16px",border:"1.5px solid #e2e8f0"}}>
            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.3rem",color:c}}>{v}</div>
            <div style={{fontSize:".63rem",textTransform:"uppercase",letterSpacing:"1px",color:"#94a3b8",marginTop:5}}>{l}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
        <select value={filterProj} onChange={e=>setFilterProj(e.target.value)}
          style={{border:"1.5px solid #e2e8f0",borderRadius:8,padding:"7px 12px",fontFamily:"inherit",fontSize:".8rem",color:"#0f172a",background:"#fff",cursor:"pointer"}}>
          <option value="all">All Projects</option>
          {wonDeals.map(d=><option key={d.id} value={d.id}>{d.client}{d.contact?` — ${d.contact}`:""}</option>)}
        </select>
        <select value={filterStat} onChange={e=>setFilterStat(e.target.value)}
          style={{border:"1.5px solid #e2e8f0",borderRadius:8,padding:"7px 12px",fontFamily:"inherit",fontSize:".8rem",color:"#0f172a",background:"#fff",cursor:"pointer"}}>
          <option value="all">All Statuses</option>
          {PR_STATUSES.map(s=><option key={s}>{s}</option>)}
        </select>
        <select value={filterCat} onChange={e=>setFilterCat(e.target.value)}
          style={{border:"1.5px solid #e2e8f0",borderRadius:8,padding:"7px 12px",fontFamily:"inherit",fontSize:".8rem",color:"#0f172a",background:"#fff",cursor:"pointer"}}>
          <option value="all">All Categories</option>
          {PR_CATS.map(c=><option key={c}>{c}</option>)}
        </select>
      </div>

      {/* PR Form */}
      {showForm&&(
        <div style={{background:"#fff",borderRadius:14,border:"1.5px solid #e2e8f0",padding:20,marginBottom:18,boxShadow:"0 4px 16px rgba(0,0,0,.08)"}}>
          <div style={{fontWeight:800,color:"#0f172a",fontSize:".95rem",marginBottom:16}}>
            {editingId?"Edit Purchase Request":"New Purchase Request"}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            <Fld label="Project" required>
              <Sel value={form.projectId} onChange={e=>{const d=wonDeals.find(x=>x.id===e.target.value);f("projectId",e.target.value);f("projectName",d?.client||"");}}>
                <option value="">— Select Project —</option>
                {wonDeals.map(d=><option key={d.id} value={d.id}>{d.client}{d.contact?` — ${d.contact}`:""}</option>)}
              </Sel>
            </Fld>
            <Fld label="Budget Category" hint="Which budget line does this hit?">
              <Sel value={form.budgetCategory||"Materials"} onChange={e=>f("budgetCategory",e.target.value)}>
                {BUDGET_CATS.map(c=><option key={c}>{c}</option>)}
              </Sel>
            </Fld>
            <div style={{gridColumn:"1/-1"}}>
              <Fld label="Item Name / Description" required>
                <Inp value={form.itemName} onChange={e=>f("itemName",e.target.value)} placeholder="e.g. 18mm Melamine Board White 4x8"/>
              </Fld>
            </div>
            <Fld label="Category">
              <Sel value={form.category} onChange={e=>f("category",e.target.value)}>
                {PR_CATS.map(c=><option key={c}>{c}</option>)}
              </Sel>
            </Fld>
            <Fld label="Supplier"><Inp value={form.supplier} onChange={e=>f("supplier",e.target.value)} placeholder="Supplier name"/></Fld>
            <Fld label="Qty"><Inp type="number" value={form.qty} onChange={e=>f("qty",e.target.value)} min={1}/></Fld>
            <Fld label="Unit">
              <Sel value={form.unit} onChange={e=>f("unit",e.target.value)}>
                {["pcs","sheets","meters","sqm","kg","sets","rolls","liters","bags","lots"].map(u=><option key={u}>{u}</option>)}
              </Sel>
            </Fld>
            <Fld label="Estimated Unit Cost (₱)"><Inp type="number" value={form.estUnitCost} onChange={e=>f("estUnitCost",e.target.value)} placeholder="0.00"/></Fld>
            <Fld label="Actual Unit Cost (₱)" hint="Fill in when PO is confirmed"><Inp type="number" value={form.actUnitCost} onChange={e=>f("actUnitCost",e.target.value)} placeholder="0.00"/></Fld>
            {/* Est vs Actual cost display */}
            {(n(form.estUnitCost)>0||n(form.actUnitCost)>0)&&(
              <div style={{gridColumn:"1/-1",background:"#f8fafc",borderRadius:8,padding:"10px 14px",display:"flex",gap:20,flexWrap:"wrap"}}>
                <div><div style={{fontSize:".68rem",color:"#94a3b8",textTransform:"uppercase",letterSpacing:".5px"}}>Est Total</div><div style={{fontWeight:700,color:"#3b82f6"}}>{fmt(n(form.estUnitCost)*n(form.qty))}</div></div>
                {n(form.actUnitCost)>0&&<div><div style={{fontSize:".68rem",color:"#94a3b8",textTransform:"uppercase",letterSpacing:".5px"}}>Actual Total</div><div style={{fontWeight:700,color:n(form.actUnitCost)>n(form.estUnitCost)?"#ef4444":"#10b981"}}>{fmt(n(form.actUnitCost)*n(form.qty))}</div></div>}
                {n(form.actUnitCost)>0&&n(form.estUnitCost)>0&&<div><div style={{fontSize:".68rem",color:"#94a3b8",textTransform:"uppercase",letterSpacing:".5px"}}>Variance</div><div style={{fontWeight:700,color:n(form.actUnitCost)>n(form.estUnitCost)?"#ef4444":"#059669"}}>{fmt((n(form.actUnitCost)-n(form.estUnitCost))*n(form.qty))}</div></div>}
              </div>
            )}
            <Fld label="Status">
              <Sel value={form.status} onChange={e=>f("status",e.target.value)}>
                {PR_STATUSES.map(s=><option key={s}>{s}</option>)}
              </Sel>
            </Fld>
            <Fld label="PO Number"><Inp value={form.poNumber} onChange={e=>f("poNumber",e.target.value)} placeholder="PO-2026-001"/></Fld>
            <Fld label="PO Date"><Inp type="date" value={form.poDate} onChange={e=>f("poDate",e.target.value)}/></Fld>
            <Fld label="Requested By"><Inp value={form.requestedBy} onChange={e=>f("requestedBy",e.target.value)} placeholder={session?.name||"Name"}/></Fld>
            {/* Delivery section */}
            {(form.status==="Partially Delivered"||form.status==="Delivered")&&(
              <>
                <Fld label="Qty Delivered"><Inp type="number" value={form.qtyDelivered} onChange={e=>f("qtyDelivered",e.target.value)} min={0}/></Fld>
                <Fld label="Delivery Date"><Inp type="date" value={form.deliveryDate} onChange={e=>f("deliveryDate",e.target.value)}/></Fld>
                <div style={{gridColumn:"1/-1"}}><Fld label="Delivery Note / DR Number"><Inp value={form.deliveryNote} onChange={e=>f("deliveryNote",e.target.value)} placeholder="DR No., remarks…"/></Fld></div>
              </>
            )}
            <div style={{gridColumn:"1/-1"}}><Fld label="Notes"><Inp rows={2} value={form.notes} onChange={e=>f("notes",e.target.value)} placeholder="Any additional notes…"/></Fld></div>
          </div>
          <div style={{display:"flex",gap:10,marginTop:14}}>
            <button onClick={savePR} disabled={!form.itemName||!form.projectId}
              style={{background:form.itemName&&form.projectId?"#1e293b":"#e2e8f0",border:"none",borderRadius:10,padding:"10px 22px",fontFamily:"inherit",fontWeight:700,fontSize:".87rem",color:form.itemName&&form.projectId?"#fff":"#94a3b8",cursor:form.itemName&&form.projectId?"pointer":"not-allowed"}}>
              {editingId?"Update PR":"Submit PR"}
            </button>
            <button onClick={()=>{setShowForm(false);setEditingId(null);}}
              style={{background:"transparent",border:"1.5px solid #e2e8f0",borderRadius:10,padding:"10px 18px",fontFamily:"inherit",fontWeight:600,fontSize:".84rem",color:"#64748b",cursor:"pointer"}}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* PR List */}
      {filtered.length===0&&<div style={{textAlign:"center",padding:"32px 0",color:"#94a3b8",fontSize:".84rem"}}>No purchase requests yet. Hit + New Purchase Request to start logging.</div>}
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {filtered.map(pr=>{
          const estTotal=(n(pr.estUnitCost))*n(pr.qty);
          const actTotal=(n(pr.actUnitCost)||n(pr.estUnitCost))*n(pr.qty);
          const delivPct=n(pr.qty)>0?Math.round(n(pr.qtyDelivered)/n(pr.qty)*100):0;
          const deal=wonDeals.find(d=>d.id===pr.projectId);
          return(
            <div key={pr.id} style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",padding:"14px 18px",boxShadow:"0 1px 4px rgba(0,0,0,.04)"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,flexWrap:"wrap"}}>
                <div style={{flex:1,minWidth:180}}>
                  <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginBottom:4}}>
                    <span style={{fontWeight:700,color:"#0f172a",fontSize:".9rem"}}>{pr.itemName}</span>
                    <span style={{fontSize:".68rem",background:STATUS_CLR[pr.status]+"22",color:STATUS_CLR[pr.status],border:`1px solid ${STATUS_CLR[pr.status]}44`,borderRadius:20,padding:"1px 9px",fontWeight:700}}>{pr.status}</span>
                    <span style={{fontSize:".68rem",color:"#94a3b8",background:"#f1f5f9",padding:"1px 8px",borderRadius:20}}>{pr.category}</span>
                    <span style={{fontSize:".68rem",color:BUDGET_CAT_CLR[pr.budgetCategory]||"#94a3b8",background:(BUDGET_CAT_CLR[pr.budgetCategory]||"#94a3b8")+"18",padding:"1px 8px",borderRadius:20,fontWeight:600}}>{pr.budgetCategory}</span>
                  </div>
                  <div style={{fontSize:".75rem",color:"#64748b",display:"flex",gap:12,flexWrap:"wrap"}}>
                    {deal&&<span>📁 {deal.client}{deal.contact?` — ${deal.contact}`:""}</span>}
                    <span>Qty: {pr.qty} {pr.unit}</span>
                    {pr.supplier&&<span>🏭 {pr.supplier}</span>}
                    {pr.poNumber&&<span>PO: {pr.poNumber}</span>}
                    <span>By: {pr.requestedBy||"—"}</span>
                    {pr.approvedBy&&<span style={{color:"#10b981",fontWeight:600}}>✓ Approved by {pr.approvedBy}{pr.approvedAt?` · ${pr.approvedAt}`:""}</span>}
                  </div>
                  {/* Delivery progress */}
                  {pr.status!=="Draft"&&pr.status!=="Pending Approval"&&pr.status!=="Cancelled"&&(
                    <div style={{marginTop:8}}>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:".68rem",color:"#94a3b8",marginBottom:3}}>
                        <span>Delivered: {pr.qtyDelivered||0} of {pr.qty} {pr.unit}</span>
                        <span style={{fontWeight:700,color:delivPct===100?"#059669":"#f59e0b"}}>{delivPct}%</span>
                      </div>
                      <div style={{height:5,background:"#f1f5f9",borderRadius:3,overflow:"hidden"}}>
                        <div style={{height:"100%",width:delivPct+"%",background:delivPct===100?"#10b981":"#f59e0b",borderRadius:3,transition:"width .5s"}}/>
                      </div>
                    </div>
                  )}
                </div>
                <div style={{display:"flex",gap:12,alignItems:"flex-start",flexShrink:0,flexWrap:"wrap"}}>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontWeight:700,color:"#0f172a",fontSize:".9rem"}}>{fmt(actTotal)}</div>
                    {n(pr.actUnitCost)>0&&n(pr.estUnitCost)>0&&n(pr.actUnitCost)!==n(pr.estUnitCost)&&(
                      <div style={{fontSize:".68rem",color:n(pr.actUnitCost)>n(pr.estUnitCost)?"#ef4444":"#059669",marginTop:2}}>
                        {n(pr.actUnitCost)>n(pr.estUnitCost)?"▲":"▼"} vs est {fmt(estTotal)}
                      </div>
                    )}
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <select value={pr.status} onChange={e=>{
                      const st=e.target.value;
                      const extra=st==="PO Issued"&&pr.status!=="PO Issued"?{approvedBy:session?.name||"",approvedAt:today}:{};
                      updatePR(pr.id,{status:st,...extra});
                    }} style={{border:"1.5px solid #e2e8f0",borderRadius:7,padding:"5px 9px",fontFamily:"inherit",fontSize:".75rem",color:"#0f172a",background:"#fff",cursor:"pointer"}}>
                      {PR_STATUSES.map(s=><option key={s}>{s}</option>)}
                    </select>
                    <button onClick={()=>openEdit(pr)} style={{background:"#f1f5f9",border:"none",borderRadius:7,padding:"5px 11px",fontSize:".73rem",color:"#475569",cursor:"pointer",fontWeight:600,fontFamily:"inherit"}}>✏</button>
                    <button onClick={()=>{if(window.confirm("Delete this PR?"))deletePR(pr.id);}} style={{background:"#fef2f2",border:"none",borderRadius:7,padding:"5px 11px",fontSize:".73rem",color:"#dc2626",cursor:"pointer",fontWeight:600,fontFamily:"inherit"}}>✕</button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── COSTING STUDY ────────────────────────────────────────────────────────────
function CostingStudy({wonDeals,budgets,prs,exps,projs,role}){
  const[view,setView]=useState("list"); // list | project | company
  const[selCostProject,setSelCostProject]=useState(null); // selected project dealId

  const n=v=>Number(String(v).replace(/,/g,""))||0;
  const fmt=v=>"₱"+Number(v).toLocaleString("en-PH",{minimumFractionDigits:0});
  const pct=(a,b)=>b>0?Math.round(a/b*100):0;

  // Build per-project costing data
  const projectData = useMemo(()=>{
    return wonDeals.map(deal=>{
      const budget = budgets[deal.id]||emptyBudget();
      const dealPRs = prs.filter(p=>p.projectId===deal.id&&p.status!=="Cancelled");
      const dealExps= exps.filter(e=>e.projectId===deal.id);

      const actuals={Materials:0,Labor:0,Overhead:0,Subcon:0};
      dealPRs.forEach(p=>{
        const cost=(n(p.actUnitCost)||n(p.estUnitCost))*n(p.qty);
        const cat=p.budgetCategory||"Materials";
        if(actuals[cat]!==undefined) actuals[cat]+=cost;
      });
      dealExps.forEach(e=>{
        const cat=e.category==="Labor"?"Labor":e.category==="Subcon"?"Subcon":e.category==="Overhead"?"Overhead":"Materials";
        actuals[cat]+=n(e.amount);
      });

      const totalBudget=BUDGET_CATS.reduce((s,c)=>s+n(budget[c]),0);
      const totalActual=BUDGET_CATS.reduce((s,c)=>s+actuals[c],0);
      const contractVal=n(deal.value)||0;
      const grossMargin=contractVal>0?Math.round((contractVal-totalActual)/contractVal*100):null;
      const budgetVariance=totalBudget-totalActual;
      const isOverBudget=totalBudget>0&&totalActual>totalBudget;

      return{deal,budget,actuals,totalBudget,totalActual,contractVal,grossMargin,budgetVariance,isOverBudget,prCount:dealPRs.length};
    });
  },[wonDeals,budgets,prs,exps]);

  // Company-wide totals
  const companyTotals=useMemo(()=>{
    const totals={Materials:0,Labor:0,Overhead:0,Subcon:0};
    const budgetTotals={Materials:0,Labor:0,Overhead:0,Subcon:0};
    let totalContract=0,totalActual=0,totalBudget=0;
    projectData.forEach(pd=>{
      BUDGET_CATS.forEach(c=>{totals[c]+=pd.actuals[c];budgetTotals[c]+=n(pd.budget[c]);});
      totalContract+=pd.contractVal;
      totalActual+=pd.totalActual;
      totalBudget+=pd.totalBudget;
    });
    return{totals,budgetTotals,totalContract,totalActual,totalBudget};
  },[projectData]);

  const overBudget=projectData.filter(p=>p.isOverBudget);
  const lowMargin=projectData.filter(p=>p.grossMargin!==null&&p.grossMargin<20);

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:12}}>
        <div>
          <h2 style={{margin:0,fontWeight:800,color:"#0f172a",fontSize:"1.15rem"}}>Costing Study</h2>
          <div style={{fontSize:".75rem",color:"#64748b",marginTop:2}}>Budget vs actual · {projectData.length} projects · {overBudget.length>0?`${overBudget.length} over budget`:""} {lowMargin.length>0?`· ${lowMargin.length} low margin`:""}</div>
        </div>
        <div style={{display:"flex",gap:8}}>
          {[["list","📋 List"],["project","Per Project"],["company","Company-Wide"]].map(([v,l])=>(
            <button key={v} onClick={()=>setView(v)} style={{padding:"7px 14px",borderRadius:20,border:`1.5px solid ${view===v?"#1e293b":"#e2e8f0"}`,background:view===v?"#1e293b":"#fff",color:view===v?"#fff":"#64748b",fontFamily:"inherit",fontWeight:view===v?700:400,fontSize:".8rem",cursor:"pointer"}}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Alert banners */}
      {overBudget.length>0&&(
        <div style={{background:"#fef2f2",border:"1.5px solid #fecaca",borderRadius:12,padding:"12px 16px",marginBottom:14,fontSize:".82rem",color:"#dc2626"}}>
          🚨 <strong>{overBudget.length} project{overBudget.length>1?"s":""} over budget:</strong> {overBudget.map(p=>p.deal.client).join(", ")}
        </div>
      )}
      {lowMargin.length>0&&(
        <div style={{background:"#fff7ed",border:"1.5px solid #fed7aa",borderRadius:12,padding:"12px 16px",marginBottom:14,fontSize:".82rem",color:"#c2410c"}}>
          ⚠️ <strong>{lowMargin.length} project{lowMargin.length>1?"s":""} below 20% margin:</strong> {lowMargin.map(p=>`${p.deal.client} (${p.grossMargin}%)`).join(", ")}
        </div>
      )}

      {view==="company"&&(
        <>
          {/* Company-wide KPIs */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:20}}>
            {[
              {l:"Total Contract Value", v:fmt(companyTotals.totalContract), c:"#0f172a"},
              {l:"Total Budgeted",       v:fmt(companyTotals.totalBudget),   c:"#3b82f6"},
              {l:"Total Actual Spend",   v:fmt(companyTotals.totalActual),   c:companyTotals.totalActual>companyTotals.totalBudget?"#ef4444":"#10b981"},
              {l:"Overall Margin",       v:companyTotals.totalContract>0?Math.round((companyTotals.totalContract-companyTotals.totalActual)/companyTotals.totalContract*100)+"%":"—", c:"#8b5cf6"},
            ].map(({l,v,c})=>(
              <div key={l} style={{background:"#fff",borderRadius:12,padding:"14px 16px",border:"1.5px solid #e2e8f0"}}>
                <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.3rem",color:c}}>{v}</div>
                <div style={{fontSize:".63rem",textTransform:"uppercase",letterSpacing:"1px",color:"#94a3b8",marginTop:5}}>{l}</div>
              </div>
            ))}
          </div>

          {/* Company-wide by category */}
          <div style={{background:"#fff",borderRadius:14,border:"1.5px solid #e2e8f0",overflow:"hidden",marginBottom:16}}>
            <div style={{padding:"12px 18px",background:"#1e293b",fontWeight:700,color:"#f59e0b",fontSize:".85rem"}}>Cost Breakdown by Category — All Projects</div>
            {BUDGET_CATS.map((cat,i)=>{
              const bgt=companyTotals.budgetTotals[cat];
              const act=companyTotals.totals[cat];
              const share=companyTotals.totalActual>0?Math.round(act/companyTotals.totalActual*100):0;
              return(
                <div key={cat} style={{display:"grid",gridTemplateColumns:"140px 1fr 1fr 1fr 80px",padding:"12px 18px",gap:12,borderBottom:"1px solid #f1f5f9",background:i%2?"#fafafa":"#fff",alignItems:"center"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{width:10,height:10,borderRadius:"50%",background:BUDGET_CAT_CLR[cat],flexShrink:0,display:"inline-block"}}/>
                    <span style={{fontWeight:700,color:"#0f172a",fontSize:".85rem"}}>{cat}</span>
                  </div>
                  <div style={{textAlign:"right",color:"#3b82f6",fontWeight:600}}>{fmt(bgt)}</div>
                  <div style={{textAlign:"right",fontWeight:700,color:act>bgt&&bgt>0?"#ef4444":"#10b981"}}>{fmt(act)}</div>
                  <div style={{textAlign:"right",color:bgt-act<0?"#ef4444":"#059669",fontWeight:600}}>{bgt>0?(bgt-act<0?"▼":"▲")+" "+fmt(Math.abs(bgt-act)):"—"}</div>
                  <div style={{textAlign:"center",fontSize:".78rem",fontWeight:700,color:"#8b5cf6"}}>{share}% of total</div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {view==="list"&&(
        <div style={{background:"#fff",borderRadius:14,border:"1.5px solid #e2e8f0",overflow:"hidden"}}>
          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr 1fr 80px",background:"#1e293b",padding:"10px 16px",gap:12}}>
            {["Project","Contract","Budget","Actual Spend","Margin","Status"].map(h=>(
              <div key={h} style={{fontSize:".68rem",fontWeight:700,color:"rgba(255,255,255,.6)",textTransform:"uppercase",letterSpacing:".8px"}}>{h}</div>
            ))}
          </div>
          {projectData.length===0&&<div style={{padding:"32px",textAlign:"center",color:"#94a3b8"}}>No awarded projects yet.</div>}
          {projectData.map((pd,i)=>{
            const isOver=pd.isOverBudget;
            const isLow=pd.grossMargin!==null&&pd.grossMargin<20;
            return(
              <div key={pd.deal.id} onClick={()=>{setSelCostProject(pd.deal.id);setView("project");}} style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr 1fr 80px",padding:"11px 16px",gap:12,borderBottom:"1px solid #f1f5f9",background:i%2?"#fafafa":"#fff",cursor:"pointer",alignItems:"center",transition:"background .1s"}}
                onMouseEnter={e=>e.currentTarget.style.background="#eff6ff"}
                onMouseLeave={e=>e.currentTarget.style.background=i%2?"#fafafa":"#fff"}>
                <div>
                  <div style={{fontWeight:700,color:"#0f172a",fontSize:".85rem"}}>{pd.deal.client}</div>
                  <div style={{fontSize:".7rem",color:"#64748b",marginTop:1}}>{pd.deal.ceNo||"No CE"} · {pd.deal.contact||pd.deal.product}</div>
                </div>
                <div style={{fontWeight:600,color:"#0f172a",fontSize:".85rem"}}>₱{pd.contractVal.toLocaleString("en-PH",{minimumFractionDigits:0})}</div>
                <div style={{fontWeight:600,color:"#3b82f6",fontSize:".85rem"}}>{pd.totalBudget>0?"₱"+pd.totalBudget.toLocaleString("en-PH",{minimumFractionDigits:0}):<span style={{color:"#cbd5e1"}}>Not set</span>}</div>
                <div style={{fontWeight:700,color:isOver?"#ef4444":"#10b981",fontSize:".85rem"}}>₱{pd.totalActual.toLocaleString("en-PH",{minimumFractionDigits:0})}</div>
                <div style={{fontWeight:800,fontSize:".9rem",color:pd.grossMargin===null?"#94a3b8":isLow?"#ef4444":"#059669"}}>
                  {pd.grossMargin!==null?pd.grossMargin+"%":"—"}
                </div>
                <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                  {isOver&&<span style={{fontSize:".62rem",background:"#fef2f2",color:"#dc2626",padding:"1px 6px",borderRadius:20,fontWeight:700}}>Over</span>}
                  {isLow&&<span style={{fontSize:".62rem",background:"#fff7ed",color:"#c2410c",padding:"1px 6px",borderRadius:20,fontWeight:700}}>Low</span>}
                  {!isOver&&!isLow&&pd.totalBudget>0&&<span style={{fontSize:".62rem",background:"#f0fdf4",color:"#059669",padding:"1px 6px",borderRadius:20,fontWeight:700}}>OK</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view==="project"&&(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
            <button onClick={()=>{setView("list");setSelCostProject(null);}}
              style={{background:"#f1f5f9",border:"none",borderRadius:6,padding:"5px 12px",cursor:"pointer",fontFamily:"inherit",fontSize:".8rem",fontWeight:600,color:"#64748b"}}>
              ← Back to All Projects
            </button>
          </div>
          {projectData.length===0&&<div style={{textAlign:"center",padding:"32px 0",color:"#94a3b8"}}>No awarded projects yet.</div>}
          {(selCostProject?projectData.filter(pd=>pd.deal.id===selCostProject):projectData).map(pd=>(
            <div key={pd.deal.id} style={{background:"#fff",borderRadius:14,border:`1.5px solid ${pd.isOverBudget?"#fecaca":"#e2e8f0"}`,overflow:"hidden"}}>
              {/* Project header */}
              <div style={{display:"flex",justifyContent:"space-between",padding:"14px 18px",background:pd.isOverBudget?"#fef9f9":"#f8fafc",borderBottom:"1px solid #e2e8f0",flexWrap:"wrap",gap:10}}>
                <div>
                  <div style={{fontWeight:700,color:"#0f172a",fontSize:".9rem"}}>{pd.deal.client}</div>
                  {pd.deal.contact&&<div style={{fontSize:".73rem",color:"#64748b",marginTop:1}}>{pd.deal.contact}</div>}
                  <div style={{fontSize:".72rem",color:"#94a3b8",marginTop:3}}>{pd.prCount} PRs logged · {pd.deal.stage.replace(/^\d+ · /,"")}</div>
                </div>
                <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
                  {[
                    {l:"Contract",v:fmt(pd.contractVal),c:"#0f172a"},
                    {l:"Budget",  v:pd.totalBudget>0?fmt(pd.totalBudget):"Not set",c:"#3b82f6"},
                    {l:"Actual",  v:fmt(pd.totalActual),c:pd.isOverBudget?"#ef4444":"#10b981"},
                    {l:"Margin",  v:pd.grossMargin!==null?pd.grossMargin+"%":"—",c:pd.grossMargin===null?"#94a3b8":pd.grossMargin<20?"#ef4444":"#059669"},
                  ].map(({l,v,c})=>(
                    <div key={l} style={{textAlign:"right"}}>
                      <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1rem",color:c}}>{v}</div>
                      <div style={{fontSize:".62rem",color:"#94a3b8",textTransform:"uppercase",letterSpacing:".5px"}}>{l}</div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Category breakdown */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:0}}>
                {BUDGET_CATS.map((cat,i)=>{
                  const bgt=n(pd.budget[cat]);
                  const act=pd.actuals[cat];
                  const p=bgt>0?Math.round(act/bgt*100):act>0?999:0;
                  return(
                    <div key={cat} style={{padding:"12px 16px",borderRight:i<3?"1px solid #f1f5f9":"none",borderTop:"1px solid #f1f5f9"}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
                        <span style={{width:8,height:8,borderRadius:"50%",background:BUDGET_CAT_CLR[cat],display:"inline-block"}}/>
                        <span style={{fontSize:".72rem",fontWeight:700,color:"#475569"}}>{cat}</span>
                      </div>
                      <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:".95rem",color:act>bgt&&bgt>0?"#ef4444":"#0f172a"}}>{fmt(act)}</div>
                      <div style={{fontSize:".68rem",color:"#94a3b8",marginTop:2}}>Budget: {bgt>0?fmt(bgt):"—"}</div>
                      {bgt>0&&(
                        <div style={{marginTop:5}}>
                          <div style={{height:4,background:"#f1f5f9",borderRadius:2,overflow:"hidden"}}>
                            <div style={{height:"100%",width:Math.min(p,100)+"%",background:p>100?"#ef4444":p>80?"#f59e0b":"#10b981",borderRadius:2}}/>
                          </div>
                          <div style={{fontSize:".65rem",color:p>100?"#ef4444":"#94a3b8",marginTop:2,fontWeight:p>100?700:400}}>{p===999?"No budget":p+"%"}</div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {/* Variance note */}
              {pd.totalBudget>0&&(
                <div style={{padding:"8px 18px",background:pd.isOverBudget?"#fef2f2":"#f0fdf4",fontSize:".75rem",fontWeight:600,color:pd.isOverBudget?"#dc2626":"#059669",borderTop:"1px solid #e2e8f0"}}>
                  {pd.isOverBudget
                    ?`🚨 Over budget by ${fmt(Math.abs(pd.budgetVariance))} — review spend immediately`
                    :`✓ ${fmt(pd.budgetVariance)} remaining of budget`}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── MATERIAL REQUEST VIEW ────────────────────────────────────────────────────
function MaterialRequestView({mreqs,addMR,updateMR,prs,addPR,wonDeals,session,role}){
  const[showForm,setShowForm]=useState(false);
  const[form,setForm]=useState({projectId:"",itemName:"",category:"Materials",qty:1,unit:"pcs",estUnitCost:"",urgency:"Normal",purpose:"",requestedBy:session?.name||"",notes:""});
  const f=(k,v)=>setForm(p=>({...p,[k]:v}));
  const n=v=>Number(v)||0;
  const fmt=v=>"₱"+n(v).toLocaleString("en-PH",{minimumFractionDigits:0});
  const STATUS_CLR={"Submitted":"#f59e0b","Reviewed":"#3b82f6","Converted to PR":"#10b981","Rejected":"#ef4444"};
  const URGENCY_CLR={"Urgent":"#ef4444","High":"#f59e0b","Normal":"#10b981"};

  const submit=()=>{
    if(!form.itemName||!form.projectId) return;
    addMR({...form,status:"Submitted"});
    setForm({projectId:"",itemName:"",category:"Materials",qty:1,unit:"pcs",estUnitCost:"",urgency:"Normal",purpose:"",requestedBy:session?.name||"",notes:""});
    setShowForm(false);
  };

  const convertToPR=(mr)=>{
    addPR({projectId:mr.projectId,projectName:wonDeals.find(d=>d.id===mr.projectId)?.client||"",itemName:mr.itemName,category:mr.category,description:mr.purpose,qty:mr.qty,unit:mr.unit,estUnitCost:mr.estUnitCost||0,actUnitCost:0,supplier:"",poNumber:"",poDate:"",qtyDelivered:0,deliveryDate:"",deliveryNote:"",status:"Pending Approval",requestedBy:mr.requestedBy,approvedBy:session?.name||"",budgetCategory:"Materials",notes:`Converted from MR by ${session?.name||"Cost Control"}. Original notes: ${mr.notes||"—"}`});
    updateMR(mr.id,{status:"Converted to PR"});
  };

  const canApprove = role==="Cost Control"||role==="Manager";
  const pending = mreqs.filter(m=>m.status==="Submitted");

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:12}}>
        <div>
          <h2 style={{margin:0,fontWeight:800,color:"#0f172a",fontSize:"1.15rem"}}>Material Requests</h2>
          <div style={{fontSize:".75rem",color:"#64748b",marginTop:2}}>Operations submits · Cost Control reviews and converts to PO</div>
        </div>
        <button onClick={()=>setShowForm(s=>!s)} style={{background:"#1e293b",border:"none",borderRadius:10,padding:"9px 18px",fontFamily:"inherit",fontWeight:700,fontSize:".84rem",color:"#fff",cursor:"pointer"}}>
          + Request Materials
        </button>
      </div>

      {/* KPIs */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:16}}>
        {[
          {l:"Total Requests",    v:mreqs.length,              c:"#0f172a"},
          {l:"Pending Review",    v:pending.length,            c:"#f59e0b"},
          {l:"Converted to PO",   v:mreqs.filter(m=>m.status==="Converted to PR").length, c:"#10b981"},
          {l:"Rejected",          v:mreqs.filter(m=>m.status==="Rejected").length,        c:"#ef4444"},
        ].map(({l,v,c})=>(
          <div key={l} style={{background:"#fff",borderRadius:12,padding:"14px 16px",border:"1.5px solid #e2e8f0"}}>
            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.3rem",color:c}}>{v}</div>
            <div style={{fontSize:".63rem",textTransform:"uppercase",letterSpacing:"1px",color:"#94a3b8",marginTop:5}}>{l}</div>
          </div>
        ))}
      </div>

      {/* Pending banner for Cost Control */}
      {canApprove&&pending.length>0&&(
        <div style={{background:"#fffbeb",border:"1.5px solid #fde68a",borderRadius:10,padding:"10px 16px",marginBottom:14,fontSize:".82rem",color:"#92400e"}}>
          ⚠️ <strong>{pending.length} material request{pending.length>1?"s":""} waiting for your review</strong> — Convert to PO or reject below.
        </div>
      )}

      {/* Form */}
      {showForm&&(
        <div style={{background:"#fff",borderRadius:14,border:"1.5px solid #e2e8f0",padding:20,marginBottom:18}}>
          <div style={{fontWeight:800,color:"#0f172a",marginBottom:16}}>New Material Request</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            <Fld label="Project" required>
              <Sel value={form.projectId} onChange={e=>f("projectId",e.target.value)}>
                <option value="">— Select Project —</option>
                {wonDeals.map(d=><option key={d.id} value={d.id}>{d.client}{d.contact?` — ${d.contact}`:""}</option>)}
              </Sel>
            </Fld>
            <Fld label="Urgency">
              <Sel value={form.urgency} onChange={e=>f("urgency",e.target.value)}>
                {["Normal","High","Urgent"].map(u=><option key={u}>{u}</option>)}
              </Sel>
            </Fld>
            <div style={{gridColumn:"1/-1"}}>
              <Fld label="Item Name" required>
                <Inp value={form.itemName} onChange={e=>f("itemName",e.target.value)} placeholder="e.g. 18mm Melamine Board, Paint — Boysen White, Steel Angle Bar"/>
              </Fld>
            </div>
            <Fld label="Category">
              <Sel value={form.category} onChange={e=>f("category",e.target.value)}>
                {PR_CATS.map(c=><option key={c}>{c}</option>)}
              </Sel>
            </Fld>
            <Fld label="Qty & Unit">
              <div style={{display:"flex",gap:8}}>
                <Inp type="number" value={form.qty} onChange={e=>f("qty",e.target.value)} min={1}/>
                <Sel value={form.unit} onChange={e=>f("unit",e.target.value)}>
                  {["pcs","sheets","meters","sqm","kg","sets","rolls","liters","bags","lots"].map(u=><option key={u}>{u}</option>)}
                </Sel>
              </div>
            </Fld>
            <Fld label="Estimated Cost (₱/unit)">
              <Inp type="number" value={form.estUnitCost} onChange={e=>f("estUnitCost",e.target.value)} placeholder="0.00"/>
            </Fld>
            <Fld label="Requested By">
              <Inp value={form.requestedBy} onChange={e=>f("requestedBy",e.target.value)} placeholder={session?.name||""}/>
            </Fld>
            <div style={{gridColumn:"1/-1"}}>
              <Fld label="Purpose / Why needed">
                <Inp rows={2} value={form.purpose} onChange={e=>f("purpose",e.target.value)} placeholder="e.g. For built-in shelving Unit 3B, needed by May 20 for installation"/>
              </Fld>
            </div>
            <div style={{gridColumn:"1/-1"}}>
              <Fld label="Notes">
                <Inp rows={2} value={form.notes} onChange={e=>f("notes",e.target.value)} placeholder="Specifications, supplier suggestion, urgency reason…"/>
              </Fld>
            </div>
          </div>
          <div style={{display:"flex",gap:10,marginTop:14}}>
            <button onClick={submit} disabled={!form.itemName||!form.projectId}
              style={{background:form.itemName&&form.projectId?"#1e293b":"#e2e8f0",border:"none",borderRadius:10,padding:"10px 22px",fontFamily:"inherit",fontWeight:700,fontSize:".87rem",color:form.itemName&&form.projectId?"#fff":"#94a3b8",cursor:form.itemName&&form.projectId?"pointer":"not-allowed"}}>
              Submit Request
            </button>
            <button onClick={()=>setShowForm(false)} style={{background:"transparent",border:"1.5px solid #e2e8f0",borderRadius:10,padding:"10px 18px",fontFamily:"inherit",fontWeight:600,fontSize:".84rem",color:"#64748b",cursor:"pointer"}}>Cancel</button>
          </div>
        </div>
      )}

      {/* MR List */}
      {mreqs.length===0&&<div style={{textAlign:"center",padding:"32px 0",color:"#94a3b8",fontSize:".84rem"}}>No material requests yet.</div>}
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {mreqs.map(mr=>{
          const deal=wonDeals.find(d=>d.id===mr.projectId);
          const estTotal=n(mr.estUnitCost)*n(mr.qty);
          return(
            <div key={mr.id} style={{background:"#fff",borderRadius:12,border:`1.5px solid ${mr.urgency==="Urgent"?"#fecaca":mr.status==="Converted to PR"?"#6ee7b7":"#e2e8f0"}`,padding:"14px 18px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,flexWrap:"wrap"}}>
                <div style={{flex:1}}>
                  <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginBottom:4}}>
                    <span style={{fontWeight:700,color:"#0f172a"}}>{mr.itemName}</span>
                    <span style={{fontSize:".68rem",background:STATUS_CLR[mr.status]+"22",color:STATUS_CLR[mr.status],border:`1px solid ${STATUS_CLR[mr.status]}44`,borderRadius:20,padding:"1px 9px",fontWeight:700}}>{mr.status}</span>
                    <span style={{fontSize:".68rem",background:URGENCY_CLR[mr.urgency]+"22",color:URGENCY_CLR[mr.urgency],border:`1px solid ${URGENCY_CLR[mr.urgency]}44`,borderRadius:20,padding:"1px 9px",fontWeight:600}}>{mr.urgency}</span>
                  </div>
                  <div style={{fontSize:".75rem",color:"#64748b",display:"flex",gap:12,flexWrap:"wrap"}}>
                    {deal&&<span>📁 {deal.client}{deal.contact?` — ${deal.contact}`:""}</span>}
                    <span>Qty: {mr.qty} {mr.unit}</span>
                    {estTotal>0&&<span>Est: {fmt(estTotal)}</span>}
                    <span>By: {mr.requestedBy||"—"}</span>
                    <span>{mr.createdDate}</span>
                  </div>
                  {mr.purpose&&<div style={{fontSize:".75rem",color:"#475569",marginTop:5,fontStyle:"italic"}}>"{mr.purpose}"</div>}
                </div>
                {canApprove&&mr.status==="Submitted"&&(
                  <div style={{display:"flex",gap:7,flexShrink:0}}>
                    <button onClick={()=>convertToPR(mr)} style={{background:"#f0fdf4",border:"1.5px solid #6ee7b7",borderRadius:8,padding:"6px 13px",fontWeight:700,fontSize:".78rem",color:"#059669",cursor:"pointer",fontFamily:"inherit"}}>
                      ✓ Convert to PO
                    </button>
                    <button onClick={()=>updateMR(mr.id,{status:"Rejected"})} style={{background:"#fef2f2",border:"1.5px solid #fecaca",borderRadius:8,padding:"6px 13px",fontWeight:700,fontSize:".78rem",color:"#dc2626",cursor:"pointer",fontFamily:"inherit"}}>
                      ✕ Reject
                    </button>
                  </div>
                )}
                {mr.status==="Converted to PR"&&<span style={{fontSize:".75rem",color:"#059669",fontWeight:700}}>✓ PO Created</span>}
                {role==="Manager"&&<button onClick={()=>{if(window.confirm("Delete this material request?"))delMR(mr.id);}} style={{background:"#fef2f2",border:"1.5px solid #fecaca",borderRadius:7,padding:"4px 10px",fontSize:".72rem",color:"#dc2626",cursor:"pointer",fontWeight:600,fontFamily:"inherit"}}>✕ Delete</button>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── BUDGET REQUEST VIEW ──────────────────────────────────────────────────────
function BudgetRequestView({breqs,addBR,updateBR,wonDeals,session,role}){
  const[showForm,setShowForm]=useState(false);
  const[form,setForm]=useState({projectId:"",purpose:"Installation",amount:"",urgency:"Normal",description:"",requestedBy:session?.name||"",dateNeeded:"",notes:""});
  const f=(k,v)=>setForm(p=>({...p,[k]:v}));
  const n=v=>Number(String(v).replace(/,/g,""))||0;
  const fmt=v=>"₱"+n(v).toLocaleString("en-PH",{minimumFractionDigits:0});
  const STATUS_CLR={"Submitted":"#f59e0b","Under Review":"#3b82f6","Approved":"#10b981","Released":"#059669","Rejected":"#ef4444"};
  const canApprove=role==="Cost Control"||role==="Manager";

  const submit=()=>{
    if(!form.amount||!form.projectId||!form.purpose) return;
    addBR({...form,status:"Submitted"});
    setForm({projectId:"",purpose:"Installation",amount:"",urgency:"Normal",description:"",requestedBy:session?.name||"",dateNeeded:"",notes:""});
    setShowForm(false);
  };

  const pending=breqs.filter(b=>b.status==="Submitted"||b.status==="Under Review");

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:12}}>
        <div>
          <h2 style={{margin:0,fontWeight:800,color:"#0f172a",fontSize:"1.15rem"}}>Budget Requests</h2>
          <div style={{fontSize:".75rem",color:"#64748b",marginTop:2}}>Operations requests cash for installation, mobilization, permits · Cost Control approves and releases</div>
        </div>
        <button onClick={()=>setShowForm(s=>!s)} style={{background:"#1e293b",border:"none",borderRadius:10,padding:"9px 18px",fontFamily:"inherit",fontWeight:700,fontSize:".84rem",color:"#fff",cursor:"pointer"}}>
          + Request Budget
        </button>
      </div>

      {/* KPIs */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:16}}>
        {[
          {l:"Total Requests", v:breqs.length,                                        c:"#0f172a"},
          {l:"Pending",        v:pending.length,                                      c:"#f59e0b"},
          {l:"Approved",       v:breqs.filter(b=>b.status==="Approved").length,       c:"#10b981"},
          {l:"Total Released", v:fmt(breqs.filter(b=>b.status==="Released").reduce((s,b)=>s+n(b.amount),0)), c:"#059669"},
        ].map(({l,v,c})=>(
          <div key={l} style={{background:"#fff",borderRadius:12,padding:"14px 16px",border:"1.5px solid #e2e8f0"}}>
            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.3rem",color:c}}>{v}</div>
            <div style={{fontSize:".63rem",textTransform:"uppercase",letterSpacing:"1px",color:"#94a3b8",marginTop:5}}>{l}</div>
          </div>
        ))}
      </div>

      {canApprove&&pending.length>0&&(
        <div style={{background:"#fffbeb",border:"1.5px solid #fde68a",borderRadius:10,padding:"10px 16px",marginBottom:14,fontSize:".82rem",color:"#92400e"}}>
          ⚠️ <strong>{pending.length} budget request{pending.length>1?"s":""} need your action</strong>
        </div>
      )}

      {/* Form */}
      {showForm&&(
        <div style={{background:"#fff",borderRadius:14,border:"1.5px solid #e2e8f0",padding:20,marginBottom:18}}>
          <div style={{fontWeight:800,color:"#0f172a",marginBottom:16}}>New Budget Request</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            <Fld label="Project" required>
              <Sel value={form.projectId} onChange={e=>f("projectId",e.target.value)}>
                <option value="">— Select Project —</option>
                {wonDeals.map(d=><option key={d.id} value={d.id}>{d.client}{d.contact?` — ${d.contact}`:""}</option>)}
              </Sel>
            </Fld>
            <Fld label="Purpose" required>
              <Sel value={form.purpose} onChange={e=>f("purpose",e.target.value)}>
                {BR_PURPOSES.map(p=><option key={p}>{p}</option>)}
              </Sel>
            </Fld>
            <Fld label="Amount Needed (₱)" required>
              <Inp type="number" value={form.amount} onChange={e=>f("amount",e.target.value)} placeholder="0.00"/>
            </Fld>
            <Fld label="Date Needed By">
              <Inp type="date" value={form.dateNeeded} onChange={e=>f("dateNeeded",e.target.value)}/>
            </Fld>
            <Fld label="Urgency">
              <Sel value={form.urgency} onChange={e=>f("urgency",e.target.value)}>
                {["Normal","High","Urgent"].map(u=><option key={u}>{u}</option>)}
              </Sel>
            </Fld>
            <Fld label="Requested By">
              <Inp value={form.requestedBy} onChange={e=>f("requestedBy",e.target.value)} placeholder={session?.name||""}/>
            </Fld>
            <div style={{gridColumn:"1/-1"}}>
              <Fld label="Description — what is this budget for?">
                <Inp rows={3} value={form.description} onChange={e=>f("description",e.target.value)} placeholder="e.g. Mobilization for SM Megamall installation starting May 20 — truck rental, labor allowance, permits"/>
              </Fld>
            </div>
            <div style={{gridColumn:"1/-1"}}>
              <Fld label="Notes">
                <Inp rows={2} value={form.notes} onChange={e=>f("notes",e.target.value)} placeholder="Any supporting details…"/>
              </Fld>
            </div>
          </div>
          <div style={{display:"flex",gap:10,marginTop:14}}>
            <button onClick={submit} disabled={!form.amount||!form.projectId}
              style={{background:form.amount&&form.projectId?"#1e293b":"#e2e8f0",border:"none",borderRadius:10,padding:"10px 22px",fontFamily:"inherit",fontWeight:700,fontSize:".87rem",color:form.amount&&form.projectId?"#fff":"#94a3b8",cursor:form.amount&&form.projectId?"pointer":"not-allowed"}}>
              Submit Request
            </button>
            <button onClick={()=>setShowForm(false)} style={{background:"transparent",border:"1.5px solid #e2e8f0",borderRadius:10,padding:"10px 18px",fontFamily:"inherit",fontWeight:600,fontSize:".84rem",color:"#64748b",cursor:"pointer"}}>Cancel</button>
          </div>
        </div>
      )}

      {/* BR List */}
      {breqs.length===0&&<div style={{textAlign:"center",padding:"32px 0",color:"#94a3b8",fontSize:".84rem"}}>No budget requests yet.</div>}
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {breqs.map(br=>{
          const deal=wonDeals.find(d=>d.id===br.projectId);
          return(
            <div key={br.id} style={{background:"#fff",borderRadius:12,border:`1.5px solid ${br.urgency==="Urgent"?"#fecaca":br.status==="Released"?"#6ee7b7":"#e2e8f0"}`,padding:"14px 18px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,flexWrap:"wrap"}}>
                <div style={{flex:1}}>
                  <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginBottom:4}}>
                    <span style={{fontWeight:700,color:"#0f172a",fontSize:".9rem"}}>{br.purpose}</span>
                    <span style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1rem",color:br.status==="Released"?"#059669":"#0f172a"}}>₱{n(br.amount).toLocaleString("en-PH")}</span>
                    <span style={{fontSize:".68rem",background:STATUS_CLR[br.status]+"22",color:STATUS_CLR[br.status],border:`1px solid ${STATUS_CLR[br.status]}44`,borderRadius:20,padding:"1px 9px",fontWeight:700}}>{br.status}</span>
                    {br.urgency!=="Normal"&&<span style={{fontSize:".68rem",color:br.urgency==="Urgent"?"#ef4444":"#f59e0b",background:br.urgency==="Urgent"?"#fef2f2":"#fffbeb",border:`1px solid ${br.urgency==="Urgent"?"#fecaca":"#fde68a"}`,borderRadius:20,padding:"1px 9px",fontWeight:600}}>{br.urgency}</span>}
                  </div>
                  <div style={{fontSize:".75rem",color:"#64748b",display:"flex",gap:12,flexWrap:"wrap"}}>
                    {deal&&<span>📁 {deal.client}{deal.contact?` — ${deal.contact}`:""}</span>}
                    {br.dateNeeded&&<span>📅 Needed by {br.dateNeeded}</span>}
                    <span>By: {br.requestedBy||"—"}</span>
                    <span>{br.createdDate}</span>
                  </div>
                  {br.description&&<div style={{fontSize:".75rem",color:"#475569",marginTop:5,fontStyle:"italic"}}>"{br.description}"</div>}
                </div>
                {canApprove&&(br.status==="Submitted"||br.status==="Under Review")&&(
                  <div style={{display:"flex",gap:7,flexShrink:0,flexWrap:"wrap"}}>
                    <button onClick={()=>updateBR(br.id,{status:"Approved",approvedBy:session?.name,approvedDate:today})}
                      style={{background:"#f0fdf4",border:"1.5px solid #6ee7b7",borderRadius:8,padding:"6px 12px",fontWeight:700,fontSize:".76rem",color:"#059669",cursor:"pointer",fontFamily:"inherit"}}>
                      ✓ Approve
                    </button>
                    <button onClick={()=>updateBR(br.id,{status:"Released",releasedBy:session?.name,releasedDate:today})}
                      style={{background:"#eff6ff",border:"1.5px solid #93c5fd",borderRadius:8,padding:"6px 12px",fontWeight:700,fontSize:".76rem",color:"#1d4ed8",cursor:"pointer",fontFamily:"inherit"}}>
                      💵 Release
                    </button>
                    <button onClick={()=>updateBR(br.id,{status:"Rejected"})}
                      style={{background:"#fef2f2",border:"1.5px solid #fecaca",borderRadius:8,padding:"6px 12px",fontWeight:700,fontSize:".76rem",color:"#dc2626",cursor:"pointer",fontFamily:"inherit"}}>
                      ✕ Reject
                    </button>
                    {role==="Manager"&&<button onClick={()=>{if(window.confirm("Delete this budget request?"))delBR(br.id);}} style={{background:"#fee2e2",border:"1.5px solid #fecaca",borderRadius:8,padding:"6px 10px",fontWeight:700,fontSize:".73rem",color:"#991b1b",cursor:"pointer",fontFamily:"inherit"}}>🗑</button>}
                  </div>
                )}
                {br.status==="Approved"&&canApprove&&(
                  <button onClick={()=>updateBR(br.id,{status:"Released",releasedBy:session?.name,releasedDate:today})}
                    style={{background:"#eff6ff",border:"1.5px solid #93c5fd",borderRadius:8,padding:"6px 12px",fontWeight:700,fontSize:".76rem",color:"#1d4ed8",cursor:"pointer",fontFamily:"inherit"}}>
                    💵 Mark Released
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── BILLING VIEW ─────────────────────────────────────────────────────────────
function BillingView({billings,wonDeals,deals,addMilestone,updateMilestone,deleteMilestone,logBillingPayment,nextInvoiceNo,session,role}){
  const[selDeal,  setSelDeal]  =useState(null);     // selected deal for popup
  const[showForm, setShowForm] =useState(false);    // add milestone form
  const[showPay,  setShowPay]  =useState(null);     // milestone id for payment log
  const[msForm,   setMsForm]   =useState({name:"",description:"",amount:"",invoiceNo:"",invoiceDate:today,dueDate:"",status:"Draft"});
  const[payForm,  setPayForm]  =useState({amount:"",date:today,refNo:"",note:""});

  const n =v=>Number(String(v||0).replace(/,/g,""))||0;
  const fmt=v=>"₱"+Number(v).toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2});
  const fm =(k,v)=>setMsForm(p=>({...p,[k]:v}));
  const fp =(k,v)=>setPayForm(p=>({...p,[k]:v}));
  const canEdit=role==="Manager"||role==="Finance";
  const deal=wonDeals.find(d=>d.id===selDeal);

  // Company-wide stats
  const allBilled    =billings.filter(m=>m.status!=="Cancelled").reduce((s,m)=>s+n(m.amount),0);
  const allCollected =billings.reduce((s,m)=>s+(m.payments||[]).reduce((ps,p)=>ps+n(p.amount),0),0);
  const overdue      =billings.filter(m=>m.dueDate&&m.dueDate<today&&m.status!=="Fully Paid"&&m.status!=="Cancelled");

  const submitMS=()=>{
    if(!msForm.name||!msForm.amount) return;
    addMilestone({...msForm,dealId:selDeal,invoiceNo:msForm.invoiceNo||nextInvoiceNo(),createdBy:session?.name||role});
    setMsForm({name:"",description:"",amount:"",invoiceNo:"",invoiceDate:today,dueDate:"",status:"Draft"});
    setShowForm(false);
  };
  const submitPay=()=>{
    if(!payForm.amount||!showPay) return;
    logBillingPayment(showPay,{...payForm,recordedBy:session?.name||role});
    setPayForm({amount:"",date:today,refNo:"",note:""});
    setShowPay(null);
  };
  const printInvoice=(ms)=>{
    const d=wonDeals.find(x=>x.id===ms.dealId);
    const tx=calcTax(ms.amount,d?.receiptType||"OR",d?.withholding||false);
    const totalPaid=(ms.payments||[]).reduce((s,p)=>s+n(p.amount),0);
    const win=window.open("","_blank");
    win.document.write(`<!DOCTYPE html><html><head><title>Invoice ${ms.invoiceNo}</title>
    <style>body{font-family:Arial,sans-serif;margin:40px;color:#1e293b;font-size:13px;}.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;border-bottom:3px solid #1e293b;padding-bottom:18px;}.logo{font-size:22px;font-weight:900;letter-spacing:-1px;}.logo span{color:#f59e0b;}table{width:100%;border-collapse:collapse;margin-bottom:16px;}th{background:#1e293b;color:#fff;padding:9px 12px;text-align:left;font-size:11px;}td{padding:9px 12px;border-bottom:1px solid #e2e8f0;}.totals{margin-left:auto;width:300px;}.grand{font-weight:900;font-size:15px;border-top:2px solid #1e293b;}.net{color:#059669;font-weight:900;}@media print{button{display:none;}}</style>
    </head><body>
    <div class="header"><div><div class="logo">GMD <span>PROD</span></div><div style="color:#64748b;font-size:12px;margin-top:6px;">GMD Productions Inc.</div></div>
    <div style="text-align:right"><h2 style="margin:0">INVOICE</h2><p style="margin:3px 0"><strong>${ms.invoiceNo}</strong></p><p style="margin:3px 0;color:#64748b">Date: ${ms.invoiceDate||today}</p><p style="margin:3px 0;color:#64748b">Due: ${ms.dueDate||"—"}</p></div></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px;">
    <div><h3 style="font-size:11px;text-transform:uppercase;color:#94a3b8;margin:0 0 6px">Bill To</h3><strong style="font-size:15px">${d?.client||"—"}</strong><br/>${d?.ceNo?"CE: "+d.ceNo:""}</div>
    <div><h3 style="font-size:11px;text-transform:uppercase;color:#94a3b8;margin:0 0 6px">Details</h3>${ms.description||ms.name}</div></div>
    <table><thead><tr><th>Description</th><th style="text-align:right">Amount</th></tr></thead>
    <tbody><tr><td>${ms.name}${ms.description?" — "+ms.description:""}</td><td style="text-align:right">${fmt(ms.amount)}</td></tr>
    ${tx.vat>0?"<tr><td style='color:#64748b'>VAT (12%)</td><td style='text-align:right;color:#f59e0b'>"+fmt(tx.vat)+"</td></tr>":""}
    </tbody></table>
    <div class="totals"><table>
    <tr><td>Gross Amount</td><td style="text-align:right;font-weight:700">${fmt(tx.gross)}</td></tr>
    ${tx.ewt>0?"<tr><td style='color:#ef4444'>Less: EWT (2%)</td><td style='text-align:right;color:#ef4444'>("+fmt(tx.ewt)+")</td></tr>":""}
    <tr class="grand"><td>Net Amount Due</td><td style="text-align:right" class="net">${fmt(tx.netReceivable)}</td></tr>
    ${totalPaid>0?"<tr><td style='color:#3b82f6'>Amount Paid</td><td style='text-align:right;color:#3b82f6'>("+fmt(totalPaid)+")</td></tr>":""}
    ${totalPaid>0?"<tr class='grand'><td>Balance Due</td><td style='text-align:right;color:"+(totalPaid>=n(tx.netReceivable)?"#059669":"#ef4444")+"'>"+fmt(Math.max(0,tx.netReceivable-totalPaid))+"</td></tr>":""}
    </table></div>
    <div style="margin-top:40px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;text-align:center">GMD Productions Inc. · Generated via FabHub · ${new Date().toLocaleDateString("en-PH",{dateStyle:"long"})}</div>
    <div style="text-align:center;margin-top:20px"><button onclick="window.print()" style="padding:10px 24px;background:#1e293b;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:700">Print / Save as PDF</button></div>
    </body></html>`);
    win.document.close();
  };

  // Per-project summary for list
  const projectSummaries=wonDeals.map(d=>{
    const ms=billings.filter(b=>b.dealId===d.id);
    const billed   =ms.filter(m=>m.status!=="Cancelled").reduce((s,m)=>s+n(m.amount),0);
    const collected=ms.reduce((s,m)=>s+(m.payments||[]).reduce((ps,p)=>ps+n(p.amount),0),0);
    const balance  =Math.max(0,billed-collected);
    const hasOverdue=ms.some(m=>m.dueDate&&m.dueDate<today&&m.status!=="Fully Paid"&&m.status!=="Cancelled");
    const fullyPaid=billed>0&&balance===0;
    return{d,ms,billed,collected,balance,hasOverdue,fullyPaid,milestoneCount:ms.length};
  });

  // CSV Export function
  const exportBillingCSV=()=>{
    const rows=[["Project","CE No","Milestone","Amount","Status","Due Date","Invoice No","Receipt Type","Payments Made","Total Paid","Outstanding","Bank"]];
    billings.forEach(b=>{
      const d=wonDeals.find(x=>x.id===b.dealId)||deals.find(x=>x.id===b.dealId);
      const totalPaid=(b.payments||[]).reduce((s,p)=>s+Number(p.amount||0),0);
      const outstanding=Math.max(0,Number(b.amount||0)-totalPaid);
      const paymentsSummary=(b.payments||[]).map(p=>`${p.date||""}:₱${Number(p.amount||0).toLocaleString()}`).join(" | ");
      const banks=[...new Set((b.payments||[]).map(p=>p.bank).filter(Boolean))].join("/");
      rows.push([
        d?.client||"",d?.ceNo||"",b.name||"",
        Number(b.amount||0).toFixed(2),b.status||"Unpaid",
        b.dueDate||"",b.invoiceNo||"",b.receiptType||"",
        paymentsSummary,totalPaid.toFixed(2),outstanding.toFixed(2),banks
      ]);
    });
    const csv=rows.map(r=>r.map(v=>(`"${String(v).replace(/"/g,'""')}"`)).join(",")).join("\n");
    const a=document.createElement("a");
    a.href="data:text/csv;charset=utf-8,"+encodeURIComponent("\uFEFF"+csv);
    a.download=`GMD_Billing_${today}.csv`;
    a.click();
  };


  return(
    <div>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16,flexWrap:"wrap",gap:12}}>
        <div>
          <h2 style={{margin:0,fontWeight:800,color:"#0f172a",fontSize:"1.15rem"}}>Billing</h2>
          <div style={{fontSize:".75rem",color:"#64748b",marginTop:2}}>Click any project to manage milestones and log payments</div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={exportBillingCSV}
            style={{background:"#eff6ff",border:"1.5px solid #bfdbfe",borderRadius:8,padding:"7px 14px",fontFamily:"inherit",fontSize:".78rem",fontWeight:700,color:"#1d4ed8",cursor:"pointer"}}>
            ⬇ Export Billing CSV
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:16}}>
        {[
          {l:"Total Billed",      v:fmt(allBilled),                c:"#3b82f6"},
          {l:"Total Collected",   v:fmt(allCollected),             c:"#059669"},
          {l:"Outstanding",       v:fmt(Math.max(0,allBilled-allCollected)), c:allBilled>allCollected?"#ef4444":"#059669"},
          {l:"Overdue Invoices",  v:overdue.length,                c:overdue.length>0?"#ef4444":"#94a3b8"},
        ].map(({l,v,c})=>(
          <div key={l} style={{background:"#fff",borderRadius:12,padding:"14px 16px",border:"1.5px solid #e2e8f0"}}>
            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.3rem",color:c}}>{v}</div>
            <div style={{fontSize:".63rem",textTransform:"uppercase",letterSpacing:"1px",color:"#94a3b8",marginTop:5}}>{l}</div>
          </div>
        ))}
      </div>

      {/* Overdue alert + Aging Summary */}
      {overdue.length>0&&(()=>{
        const today2=new Date();
        const age=ms=>{const d=new Date(ms.dueDate);return Math.floor((today2-d)/(1000*60*60*24));};
        const d30 =overdue.filter(m=>age(m)<=30);
        const d60 =overdue.filter(m=>age(m)>30&&age(m)<=60);
        const d90 =overdue.filter(m=>age(m)>60&&age(m)<=90);
        const d90p=overdue.filter(m=>age(m)>90);
        return(
          <div style={{background:"#fef2f2",border:"1.5px solid #fecaca",borderRadius:12,padding:"14px 18px",marginBottom:12}}>
            <div style={{fontWeight:700,color:"#dc2626",marginBottom:10,fontSize:".88rem"}}>🚨 Overdue Invoice Aging Summary</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:10}}>
              {[[d30,"1–30 days","#f59e0b","#fffbeb"],[d60,"31–60 days","#f97316","#fff7ed"],[d90,"61–90 days","#ef4444","#fef2f2"],[d90p,"90+ days","#dc2626","#fef2f2"]].map(([grp,lbl,clr,bg])=>(
                <div key={lbl} style={{background:bg,borderRadius:8,padding:"10px 12px",textAlign:"center",border:`1px solid ${clr}33`}}>
                  <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.4rem",color:clr}}>{grp.length}</div>
                  <div style={{fontSize:".65rem",textTransform:"uppercase",letterSpacing:"1px",color:clr,marginTop:3}}>{lbl}</div>
                  <div style={{fontSize:".72rem",color:clr,fontWeight:600,marginTop:2}}>
                    ₱{grp.reduce((s,m)=>{const p=(m.payments||[]).reduce((ps,p)=>ps+n(p.amount),0);return s+Math.max(0,calcTax(m.amount,"OR",false).netReceivable-p);},0).toLocaleString("en-PH",{minimumFractionDigits:0})}
                  </div>
                </div>
              ))}
            </div>
            <div style={{fontSize:".78rem",color:"#dc2626"}}>
              {overdue.slice(0,4).map(m=>{const d=wonDeals.find(x=>x.id===m.dealId);return`${d?.client||"?"} (${m.invoiceNo}, ${age(m)}d overdue)`;}).join(" · ")}
              {overdue.length>4&&` +${overdue.length-4} more`}
            </div>
          </div>
        );
      })()}

      {/* ── PROJECT LIST TABLE ──────────────────────────────────────────── */}
      <div style={{background:"#fff",borderRadius:14,border:"1.5px solid #e2e8f0",overflow:"hidden"}}>
        {/* Table header */}
        <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr 100px 80px",background:"#1e293b",padding:"10px 18px",gap:12}}>
          {["Project","Billed","Collected","Balance","Status","Action"].map(h=>(
            <div key={h} style={{fontSize:".68rem",fontWeight:700,color:"rgba(255,255,255,.6)",textTransform:"uppercase",letterSpacing:".8px"}}>{h}</div>
          ))}
        </div>
        {wonDeals.length===0&&<div style={{padding:"32px",textAlign:"center",color:"#94a3b8"}}>No awarded projects. Award a deal to start billing.</div>}
        {projectSummaries.map(({d,ms,billed,collected,balance,hasOverdue,fullyPaid,milestoneCount},i)=>(
          <div key={d.id}
            onClick={()=>setSelDeal(d.id)}
            style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr 100px 80px",padding:"12px 18px",gap:12,borderBottom:"1px solid #f1f5f9",background:hasOverdue?"#fffafa":i%2?"#fafafa":"#fff",cursor:"pointer",alignItems:"center",transition:"background .1s"}}
            onMouseEnter={e=>e.currentTarget.style.background="#eff6ff"}
            onMouseLeave={e=>e.currentTarget.style.background=hasOverdue?"#fffafa":i%2?"#fafafa":"#fff"}>
            <div>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                {hasOverdue&&<span style={{color:"#ef4444",fontSize:".8rem"}}>🔴</span>}
                <span style={{fontWeight:700,color:"#0f172a",fontSize:".88rem"}}>{d.client}</span>
                {d.contact&&<span style={{fontSize:".72rem",color:"#94a3b8"}}>— {d.contact}</span>}
              </div>
              <div style={{fontSize:".7rem",color:"#94a3b8",marginTop:1}}>
                {d.ceNo||"No CE"} · {milestoneCount} milestone{milestoneCount!==1?"s":""}
                {fullyPaid&&<span style={{color:"#059669",fontWeight:700,marginLeft:6}}>✓ Fully Paid</span>}
              </div>
            </div>
            <div style={{fontWeight:600,color:"#3b82f6",fontSize:".88rem"}}>
              {billed>0?fmt(billed):<span style={{color:"#e2e8f0",fontSize:".78rem"}}>Not billed</span>}
            </div>
            <div style={{fontWeight:600,color:"#059669",fontSize:".88rem"}}>
              {collected>0?fmt(collected):<span style={{color:"#e2e8f0",fontSize:".78rem"}}>—</span>}
            </div>
            <div style={{fontWeight:700,color:balance>0?"#ef4444":"#059669",fontSize:".88rem"}}>
              {balance>0?fmt(balance):"✓ Clear"}
            </div>
            <div>
              {hasOverdue&&<span style={{fontSize:".68rem",background:"#fef2f2",color:"#dc2626",border:"1px solid #fecaca",borderRadius:20,padding:"2px 8px",fontWeight:700}}>Overdue</span>}
              {fullyPaid&&<span style={{fontSize:".68rem",background:"#f0fdf4",color:"#059669",border:"1px solid #6ee7b7",borderRadius:20,padding:"2px 8px",fontWeight:700}}>Paid</span>}
              {!hasOverdue&&!fullyPaid&&milestoneCount>0&&<span style={{fontSize:".68rem",background:"#eff6ff",color:"#3b82f6",border:"1px solid #93c5fd",borderRadius:20,padding:"2px 8px",fontWeight:700}}>Active</span>}
              {milestoneCount===0&&<span style={{fontSize:".68rem",color:"#e2e8f0"}}>—</span>}
            </div>
            <div>
              <button onClick={e=>{e.stopPropagation();setSelDeal(d.id);}}
                style={{background:"#1e293b",border:"none",borderRadius:7,padding:"5px 12px",fontFamily:"inherit",fontSize:".75rem",color:"#fff",cursor:"pointer",fontWeight:600}}>
                Open →
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ── POPUP: Project Billing Detail ──────────────────────────────── */}
      {selDeal&&(
        <Modal open title={`${deal?.client||""}${deal?.contact?" — "+deal?.contact:""}`} onClose={()=>{setSelDeal(null);setShowForm(false);setShowPay(null);}} wide>
          {/* Project billing summary */}
          {(()=>{
            const ms=billings.filter(b=>b.dealId===selDeal);
            const billed   =ms.filter(m=>m.status!=="Cancelled").reduce((s,m)=>s+n(m.amount),0);
            const collected=ms.reduce((s,m)=>s+(m.payments||[]).reduce((ps,p)=>ps+n(p.amount),0),0);
            const tx=calcTax(deal?.value||0,deal?.receiptType||"OR",deal?.withholding||false);
            return(
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:16}}>
                {[
                  {l:"Contract Value",v:fmt(deal?.value||0),    c:"#0f172a"},
                  {l:"Total Billed",  v:fmt(billed),            c:"#3b82f6"},
                  {l:"Collected",     v:fmt(collected),          c:"#059669"},
                  {l:"Outstanding",   v:fmt(Math.max(0,billed-collected)), c:billed>collected?"#ef4444":"#059669"},
                ].map(({l,v,c})=>(
                  <div key={l} style={{textAlign:"center",padding:"10px",background:"#f8fafc",borderRadius:8}}>
                    <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.1rem",color:c}}>{v}</div>
                    <div style={{fontSize:".62rem",color:"#94a3b8",textTransform:"uppercase",letterSpacing:".8px",marginTop:3}}>{l}</div>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Add milestone form */}
          {canEdit&&(
            <div style={{marginBottom:12}}>
              {!showForm?(
                <button onClick={()=>setShowForm(true)}
                  style={{background:"#1e293b",border:"none",borderRadius:9,padding:"8px 18px",fontFamily:"inherit",fontWeight:700,fontSize:".84rem",color:"#fff",cursor:"pointer"}}>
                  + Add Milestone
                </button>
              ):(
                <div style={{background:"#f8fafc",borderRadius:12,border:"1.5px solid #e2e8f0",padding:16,marginBottom:8}}>
                  <div style={{fontWeight:700,color:"#0f172a",marginBottom:12,fontSize:".88rem"}}>New Billing Milestone</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                    <Fld label="Milestone Name" required hint="e.g. 50% Downpayment, Progress Billing, Final Billing">
                      <Inp value={msForm.name} onChange={e=>fm("name",e.target.value)} placeholder="e.g. 50% Downpayment upon PO"/>
                    </Fld>
                    <Fld label="Amount (₱)" required>
                      <div style={{display:"flex",gap:6,alignItems:"center"}}>
                        <Inp type="number" value={msForm.amount} onChange={e=>fm("amount",e.target.value)} placeholder="0.00" style={{flex:1}}/>
                        {selDeal&&(()=>{
                          const d=wonDeals.find(x=>x.id===selDeal)||deals.find(x=>x.id===selDeal);
                          const existingMs=billings.filter(b=>b.dealId===selDeal);
                          const totalMs=existingMs.reduce((s,b)=>s+Number(b.amount||0),0);
                          const remaining=Math.max(0,(Number(d?.value||0)-totalMs));
                          return remaining>0?(
                            <button type="button" onClick={()=>fm("amount",String(remaining))}
                              style={{background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:6,padding:"5px 10px",color:"#1d4ed8",cursor:"pointer",fontFamily:"inherit",fontSize:".75rem",fontWeight:700,whiteSpace:"nowrap"}}>
                              Bill Remaining ₱{remaining.toLocaleString()}
                            </button>
                          ):null;
                        })()}
                      </div>
                    </Fld>
                    <Fld label="Invoice No." hint="Auto-generated if blank"><Inp value={msForm.invoiceNo} onChange={e=>fm("invoiceNo",e.target.value)} placeholder={nextInvoiceNo()}/></Fld>
                    <Fld label="Invoice Date"><Inp type="date" value={msForm.invoiceDate} onChange={e=>fm("invoiceDate",e.target.value)}/></Fld>
                    <Fld label="Due Date"><Inp type="date" value={msForm.dueDate} onChange={e=>fm("dueDate",e.target.value)}/></Fld>
                    <Fld label="Status"><Sel value={msForm.status} onChange={e=>fm("status",e.target.value)}>{BILLING_STATUSES.map(s=><option key={s}>{s}</option>)}</Sel></Fld>
                    <div style={{gridColumn:"1/-1"}}><Fld label="Description"><Inp value={msForm.description} onChange={e=>fm("description",e.target.value)} placeholder="What this billing covers…"/></Fld></div>
                    {/* Tax preview */}
                    {n(msForm.amount)>0&&deal&&(()=>{
                      const tx=calcTax(msForm.amount,deal.receiptType||"OR",deal.withholding||false);
                      return<div style={{gridColumn:"1/-1",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:8,padding:"8px 12px",display:"flex",gap:16,flexWrap:"wrap",fontSize:".78rem"}}>
                        <span><span style={{color:"#92400e"}}>Base: </span><strong>₱{n(msForm.amount).toLocaleString("en-PH")}</strong></span>
                        {tx.vat>0&&<span><span style={{color:"#92400e"}}>VAT: </span><strong style={{color:"#f59e0b"}}>₱{tx.vat.toLocaleString("en-PH",{minimumFractionDigits:0})}</strong></span>}
                        {tx.ewt>0&&<span><span style={{color:"#92400e"}}>EWT: </span><strong style={{color:"#ef4444"}}>-₱{tx.ewt.toLocaleString("en-PH",{minimumFractionDigits:0})}</strong></span>}
                        <span><span style={{color:"#92400e"}}>Net: </span><strong style={{color:"#059669",fontSize:".88rem"}}>₱{tx.netReceivable.toLocaleString("en-PH",{minimumFractionDigits:0})}</strong></span>
                      </div>;
                    })()}
                  </div>
                  <div style={{display:"flex",gap:8,marginTop:12}}>
                    <button onClick={submitMS} disabled={!msForm.name||!msForm.amount}
                      style={{background:msForm.name&&msForm.amount?"#1e293b":"#e2e8f0",border:"none",borderRadius:9,padding:"8px 20px",fontFamily:"inherit",fontWeight:700,fontSize:".85rem",color:msForm.name&&msForm.amount?"#fff":"#94a3b8",cursor:msForm.name&&msForm.amount?"pointer":"not-allowed"}}>
                      Add Milestone
                    </button>
                    <button onClick={()=>setShowForm(false)} style={{background:"transparent",border:"1.5px solid #e2e8f0",borderRadius:9,padding:"8px 16px",fontFamily:"inherit",fontWeight:600,fontSize:".82rem",color:"#64748b",cursor:"pointer"}}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Milestone list */}
          {billings.filter(b=>b.dealId===selDeal).length===0&&!showForm&&(
            <div style={{textAlign:"center",padding:"24px",color:"#94a3b8",fontSize:".84rem"}}>No milestones yet. Hit + Add Milestone to create the first billing.</div>
          )}
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {billings.filter(b=>b.dealId===selDeal).map(ms=>{
              const paidTotal=(ms.payments||[]).reduce((s,p)=>s+n(p.amount),0);
              const tx=calcTax(ms.amount,deal?.receiptType||"OR",deal?.withholding||false);
              const balance=Math.max(0,tx.netReceivable-paidTotal);
              const pct=tx.netReceivable>0?Math.round(paidTotal/tx.netReceivable*100):0;
              const sClr=BILLING_STATUS_CLR[ms.status]||"#94a3b8";
              const isOverdue=ms.dueDate&&ms.dueDate<today&&ms.status!=="Fully Paid"&&ms.status!=="Cancelled";
              return(
                <div key={ms.id} style={{background:"#f8fafc",borderRadius:10,border:`1.5px solid ${isOverdue?"#fecaca":sClr+"33"}`,padding:"12px 16px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,flexWrap:"wrap"}}>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",gap:7,alignItems:"center",flexWrap:"wrap",marginBottom:5}}>
                        <span style={{fontWeight:700,color:"#0f172a"}}>{ms.name}</span>
                        <span style={{fontSize:".68rem",background:sClr+"22",color:sClr,border:`1px solid ${sClr}44`,borderRadius:20,padding:"1px 8px",fontWeight:700}}>{ms.status}</span>
                        {isOverdue&&<span style={{fontSize:".68rem",color:"#ef4444",background:"#fef2f2",border:"1px solid #fecaca",borderRadius:20,padding:"1px 8px",fontWeight:700}}>🚨 Overdue</span>}
                        <span style={{fontSize:".68rem",color:"#94a3b8"}}>{ms.invoiceNo}</span>
                      </div>
                      <div style={{display:"flex",gap:14,flexWrap:"wrap",fontSize:".78rem",marginBottom:8}}>
                        <span><span style={{color:"#94a3b8"}}>Base: </span>₱{n(ms.amount).toLocaleString("en-PH")}</span>
                        <span><span style={{color:"#94a3b8"}}>Net Due: </span><strong style={{color:"#3b82f6"}}>₱{tx.netReceivable.toLocaleString("en-PH",{minimumFractionDigits:0})}</strong></span>
                        <span><span style={{color:"#94a3b8"}}>Paid: </span><strong style={{color:"#059669"}}>₱{paidTotal.toLocaleString("en-PH",{minimumFractionDigits:0})}</strong></span>
                        {balance>0&&<span><span style={{color:"#94a3b8"}}>Balance: </span><strong style={{color:"#ef4444"}}>₱{balance.toLocaleString("en-PH",{minimumFractionDigits:0})}</strong></span>}
                        {ms.dueDate&&<span style={{color:isOverdue?"#ef4444":"#64748b",fontWeight:isOverdue?700:400}}>Due: {ms.dueDate}</span>}
                      </div>
                      {/* Progress */}
                      <div style={{height:5,background:"#e2e8f0",borderRadius:3,overflow:"hidden",marginBottom:6}}>
                        <div style={{height:"100%",width:pct+"%",background:pct>=100?"#10b981":"#3b82f6",borderRadius:3,transition:"width .5s"}}/>
                      </div>
                      {/* Payment history */}
                      {(ms.payments||[]).length>0&&(
                        <div style={{background:"#f0fdf4",borderRadius:7,padding:"7px 10px",marginTop:4}}>
                          <div style={{fontSize:".67rem",fontWeight:700,color:"#059669",marginBottom:4,textTransform:"uppercase",letterSpacing:".5px"}}>Payments</div>
                          {(ms.payments||[]).map(p=>(
                            <div key={p.id} style={{display:"flex",gap:10,fontSize:".73rem",color:"#475569",marginBottom:2,flexWrap:"wrap"}}>
                              <span>{p.date}</span>
                              <span style={{fontWeight:700,color:"#059669"}}>₱{n(p.amount).toLocaleString("en-PH")}</span>
                              {p.refNo&&<span style={{color:"#64748b"}}>Ref: {p.refNo}</span>}
                              {p.note&&<span style={{color:"#94a3b8",fontStyle:"italic"}}>{p.note}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Log payment inline */}
                      {showPay===ms.id&&canEdit&&(
                        <div style={{background:"#eff6ff",borderRadius:8,padding:"10px 12px",border:"1.5px solid #93c5fd",marginTop:8}}>
                          <div style={{fontWeight:700,color:"#1d4ed8",marginBottom:8,fontSize:".82rem"}}>Log Payment</div>
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                            <Fld label="Amount (₱)"><Inp type="number" value={payForm.amount} onChange={e=>fp("amount",e.target.value)} placeholder="0.00"/></Fld>
                            <Fld label="Bank Deposited To">
                              <Sel value={payForm.bank||""} onChange={e=>fp("bank",e.target.value)}>
                                <option value="">— Select Bank —</option>
                                {["BPI","Metrobank","Chinabank","BDO","Security Bank","Unionbank","Cash"].map(b=><option key={b}>{b}</option>)}
                              </Sel>
                            </Fld>
                            <Fld label="Date"><Inp type="date" value={payForm.date} onChange={e=>fp("date",e.target.value)}/></Fld>
                            <Fld label="Reference No."><Inp value={payForm.refNo} onChange={e=>fp("refNo",e.target.value)} placeholder="Cheque / transfer ref…"/></Fld>
                            <Fld label="Note"><Inp value={payForm.note} onChange={e=>fp("note",e.target.value)} placeholder="e.g. BPI online transfer"/></Fld>
                          </div>
                          <div style={{display:"flex",gap:8,marginTop:8}}>
                            <button onClick={submitPay} disabled={!payForm.amount}
                              style={{background:payForm.amount?"#1d4ed8":"#e2e8f0",border:"none",borderRadius:7,padding:"7px 16px",fontFamily:"inherit",fontWeight:700,fontSize:".82rem",color:payForm.amount?"#fff":"#94a3b8",cursor:payForm.amount?"pointer":"not-allowed"}}>
                              Save Payment
                            </button>
                            <button onClick={()=>setShowPay(null)} style={{background:"transparent",border:"1.5px solid #e2e8f0",borderRadius:7,padding:"7px 12px",fontFamily:"inherit",fontWeight:600,fontSize:".78rem",color:"#64748b",cursor:"pointer"}}>Cancel</button>
                          </div>
                        </div>
                      )}
                    </div>
                    {/* Action buttons */}
                    <div style={{display:"flex",flexDirection:"column",gap:5,flexShrink:0}}>
                      <button onClick={()=>printInvoice(ms)} style={{background:"#1e293b",border:"none",borderRadius:7,padding:"6px 12px",fontFamily:"inherit",fontWeight:700,fontSize:".75rem",color:"#fff",cursor:"pointer"}}>🖨 Invoice</button>
                      {canEdit&&ms.status!=="Fully Paid"&&ms.status!=="Cancelled"&&(
                        <button onClick={()=>setShowPay(showPay===ms.id?null:ms.id)} style={{background:"#f0fdf4",border:"1.5px solid #6ee7b7",borderRadius:7,padding:"6px 12px",fontFamily:"inherit",fontWeight:700,fontSize:".75rem",color:"#059669",cursor:"pointer"}}>+ Payment</button>
                      )}
                      {canEdit&&<select value={ms.status} onChange={e=>updateMilestone(ms.id,{status:e.target.value})} style={{border:"1.5px solid #e2e8f0",borderRadius:7,padding:"5px 8px",fontFamily:"inherit",fontSize:".72rem",color:"#0f172a",background:"#fff",cursor:"pointer"}}>{BILLING_STATUSES.map(s=><option key={s}>{s}</option>)}</select>}
                      {canEdit&&<button onClick={()=>{if(window.confirm("Delete this milestone?"))deleteMilestone(ms.id);}} style={{background:"#fef2f2",border:"1.5px solid #fecaca",borderRadius:7,padding:"5px",fontFamily:"inherit",fontWeight:600,fontSize:".7rem",color:"#dc2626",cursor:"pointer"}}>Delete</button>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── PROJECT CARDS ────────────────────────────────────────────────────────────
function TATSetter({deal,card,onSet,refTable,ceType}){
  const[open,setOpen]     =useState(!card?.targetDays);
  const[days,setDays]     =useState(card?.targetDays||"");
  const[category,setCategory]=useState(card?.tatCategory||"");

  const refEntries=Object.entries(refTable||{});

  if(!open) return(
    <button onClick={()=>setOpen(true)}
      style={{background:"transparent",border:"1.5px solid #6ee7b7",borderRadius:8,padding:"6px 14px",fontFamily:"inherit",fontWeight:600,fontSize:".78rem",color:"#059669",cursor:"pointer"}}>
      ✏ Edit TAT
    </button>
  );

  return(
    <div style={{background:"#fff",borderRadius:10,border:"1.5px solid #e2e8f0",padding:"12px 14px",minWidth:280}}>
      <div style={{fontWeight:700,color:"#0f172a",fontSize:".82rem",marginBottom:10}}>Set Turnaround Time</div>

      {/* Reference table */}
      <div style={{marginBottom:10}}>
        <div style={{fontSize:".68rem",fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:".5px",marginBottom:6}}>
          {ceType} — Reference
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:4,maxHeight:160,overflowY:"auto"}}>
          {refEntries.map(([cat,ref])=>(
            <div key={cat} onClick={()=>{setCategory(cat);setDays(String(ref.days));}}
              style={{display:"flex",justifyContent:"space-between",padding:"5px 8px",borderRadius:6,cursor:"pointer",background:category===cat?"#eff6ff":"#f8fafc",border:`1px solid ${category===cat?"#93c5fd":"#f1f5f9"}`,transition:"all .1s"}}
              onMouseEnter={e=>e.currentTarget.style.background="#eff6ff"}
              onMouseLeave={e=>e.currentTarget.style.background=category===cat?"#eff6ff":"#f8fafc"}>
              <span style={{fontSize:".75rem",color:"#0f172a",fontWeight:category===cat?700:400}}>{cat}</span>
              <span style={{fontSize:".75rem",color:"#3b82f6",fontWeight:700,flexShrink:0,marginLeft:8}}>{ref.days}d</span>
            </div>
          ))}
        </div>
      </div>

      {/* Manual input */}
      <div style={{display:"flex",gap:8,alignItems:"center",marginTop:8}}>
        <input
          type="number" min={1} max={365}
          value={days}
          onChange={e=>setDays(e.target.value)}
          placeholder="Days"
          style={{width:70,border:"1.5px solid #e2e8f0",borderRadius:7,padding:"7px 10px",fontFamily:"inherit",fontSize:".88rem",color:"#0f172a",textAlign:"center",outline:"none"}}
        />
        <span style={{fontSize:".78rem",color:"#64748b"}}>working days from award</span>
      </div>

      {days&&card?.awardDate&&(
        <div style={{fontSize:".73rem",color:"#059669",marginTop:6,fontWeight:600}}>
          → Due: {(()=>{const d=new Date(card.awardDate);d.setDate(d.getDate()+Number(days));return d.toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"});})()}
        </div>
      )}

      <div style={{display:"flex",gap:8,marginTop:10}}>
        <button onClick={()=>{if(days)onSet(card.dealId,days,category);setOpen(false);}}
          disabled={!days}
          style={{background:days?"#1e293b":"#e2e8f0",border:"none",borderRadius:8,padding:"8px 16px",fontFamily:"inherit",fontWeight:700,fontSize:".8rem",color:days?"#fff":"#94a3b8",cursor:days?"pointer":"not-allowed"}}>
          Set Target
        </button>
        <button onClick={()=>setOpen(false)}
          style={{background:"transparent",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"7px 12px",fontFamily:"inherit",fontWeight:600,fontSize:".78rem",color:"#64748b",cursor:"pointer"}}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── INVENTORY VIEW ───────────────────────────────────────────────────────────
function ProjectCards({pcards,wonDeals,deals,toggleDeptTask,markDeptDone,setProjectTAT,jos,delDeal,delPcard,session,role}){
  const[selDeal,     setSelDeal]    =useState(null);
  const[selDept,     setSelDept]    =useState(null);
  const[pcFilter,    setPcFilter]   =useState(null);   // "done"|"attention"|null
  const[pcDeptFilter,setPcDeptFilter]=useState("All"); // dept filter
  const[pcSort,      setPcSort]     =useState("tat");  // "client"|"tat"|"pct"|"ce"

  const card = selDeal ? pcards[selDeal] : null;
  const deal = wonDeals.find(d=>d.id===selDeal);

  // Which dept can this user edit?
  const editableDepts = {
    Manager:["Sales","Design","QS","Procurement","Operations","Finance"],
    Sales:["Sales"],
    Design:["Design"],
    QS:["QS"],
    Procurement:["Procurement"],
    Operations:["Operations"],
    Finance:["Finance"],
  }[role]||[];

  // Overall project progress
  const projectProgress=(card)=>{
    if(!card) return 0;
    const depts=Object.values(card.departments);
    return Math.round(depts.filter(d=>d.done).length/depts.length*100);
  };

  const fmt=v=>"₱"+Number(v||0).toLocaleString("en-PH",{minimumFractionDigits:0});

  return(
    <div>
      {/* Header */}
      <div style={{marginBottom:20}}>
        <h2 style={{margin:0,fontWeight:800,color:"#0f172a",fontSize:"1.15rem"}}>📋 Project Cards</h2>
        <div style={{fontSize:".75rem",color:"#64748b",marginTop:2}}>{wonDeals.length} awarded project{wonDeals.length!==1?"s":""} · {Object.keys(pcards).length} cards initialized · all departments work from the same source</div>
      </div>

      {/* Duplicate warning */}
      {(()=>{
        const ceCounts={};
        wonDeals.forEach(d=>{
          const key=d.ceNo&&d.ceNo.trim()&&d.ceNo!=="No CE"?d.ceNo:null;
          if(key) ceCounts[key]=(ceCounts[key]||0)+1;
        });
        const dupes=Object.entries(ceCounts).filter(([,c])=>c>1);
        return dupes.length>0?(
          <div style={{background:"#fef2f2",border:"1.5px solid #fecaca",borderRadius:10,padding:"10px 16px",marginBottom:16,fontSize:".82rem",color:"#dc2626"}}>
            ⚠️ <strong>{dupes.length} duplicate CE number{dupes.length>1?"s":""} detected</strong> — {dupes.map(([k,c])=>`${k} (×${c})`).join(", ")}. Delete the extras using the ✕ button on each card.
          </div>
        ):null;
      })()}
      {/* Summary KPIs — clickable */}
      {(()=>{
        const totalCards=Object.keys(pcards).length;
        const fullyDone=Object.values(pcards).filter(p=>DEPT_ORDER.every(d=>p.departments?.[d]?.done)).length;
        const needsAttn=Object.values(pcards).filter(p=>DEPT_ORDER.some(d=>!p.departments?.[d]?.done)).length;
        return(
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:16}}>
            {[
              {l:"Active Projects",  v:wonDeals.length,  c:"#0f172a",  filter:null,    hint:"Show all"},
              {l:"Project Cards",    v:totalCards,       c:"#3b82f6",  filter:null,    hint:"Show all"},
              {l:"Fully Complete",   v:fullyDone,        c:"#059669",  filter:"done",  hint:"Click to filter"},
              {l:"Needs Attention",  v:needsAttn,        c:"#f59e0b",  filter:"attention", hint:"Click to filter"},
            ].map(({l,v,c,filter,hint})=>(
              <div key={l}
                onClick={()=>setPcFilter(f=>f===filter?null:filter)}
                style={{background:pcFilter===filter?"#1e293b":"#fff",borderRadius:12,padding:"14px 16px",border:`1.5px solid ${pcFilter===filter?c:"#e2e8f0"}`,cursor:filter?"pointer":"default",transition:"all .15s"}}>
                <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.3rem",color:pcFilter===filter?"#fff":c}}>{v}</div>
                <div style={{fontSize:".63rem",textTransform:"uppercase",letterSpacing:"1px",color:pcFilter===filter?"rgba(255,255,255,.6)":"#94a3b8",marginTop:5}}>{l}</div>
                {filter&&<div style={{fontSize:".6rem",color:pcFilter===filter?"#f59e0b":"#cbd5e1",marginTop:3}}>{pcFilter===filter?"✓ Active filter — click to clear":hint}</div>}
              </div>
            ))}
          </div>
        );
      })()}

      {!selDeal?(
        // ── PROJECT LIST ─────────────────────────────────────────────────────
        <div>
          {/* Filter bar */}
          <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:14,flexWrap:"wrap"}}>
            <span style={{fontSize:".75rem",fontWeight:700,color:"#64748b"}}>Filter by dept:</span>
            {["All",...DEPT_ORDER].map(dept=>(
              <button key={dept} onClick={()=>setPcDeptFilter(f=>f===dept?"All":dept)}
                style={{padding:"4px 12px",borderRadius:20,border:`1.5px solid ${pcDeptFilter===dept&&dept!=="All"?(DEPT_CLR[dept]||"#1e293b"):"#e2e8f0"}`,background:pcDeptFilter===dept&&dept!=="All"?(DEPT_CLR[dept]||"#1e293b"):"#fff",color:pcDeptFilter===dept&&dept!=="All"?"#fff":"#64748b",fontFamily:"inherit",fontWeight:pcDeptFilter===dept?700:400,fontSize:".75rem",cursor:"pointer"}}>
                {dept}
              </button>
            ))}
            {(pcFilter||pcDeptFilter!=="All")&&(
              <button onClick={()=>{setPcFilter(null);setPcDeptFilter("All");}}
                style={{padding:"4px 12px",borderRadius:20,border:"1.5px solid #fecaca",background:"#fef2f2",color:"#dc2626",fontFamily:"inherit",fontWeight:700,fontSize:".75rem",cursor:"pointer"}}>
                ✕ Clear all filters
              </button>
            )}
          </div>

          {/* Sort controls */}
          <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:12,flexWrap:"wrap"}}>
            <span style={{fontSize:".75rem",fontWeight:700,color:"#64748b"}}>Sort by:</span>
            {[["client","Client"],["tat","TAT (urgent first)"],["pct","Progress"],["ce","CE Number"]].map(([val,lbl])=>(
              <button key={val} onClick={()=>setPcSort(s=>s===val?null:val)}
                style={{padding:"4px 12px",borderRadius:20,border:`1.5px solid ${pcSort===val?"#1e293b":"#e2e8f0"}`,background:pcSort===val?"#1e293b":"#fff",color:pcSort===val?"#fff":"#64748b",fontFamily:"inherit",fontWeight:pcSort===val?700:400,fontSize:".75rem",cursor:"pointer"}}>
                {lbl}
              </button>
            ))}
          </div>

          {/* Cards grid */}
          {(()=>{
            let filtered=wonDeals;
            // Always include the currently selected deal even if filter hides it
            const selectedDeal = wonDeals.find(d=>d.id===selDeal);
            if(pcFilter==="done") filtered=filtered.filter(d=>pcards[d.id]&&DEPT_ORDER.every(dept=>pcards[d.id].departments?.[dept]?.done));
            if(pcFilter==="attention") filtered=filtered.filter(d=>!pcards[d.id]||DEPT_ORDER.some(dept=>!pcards[d.id]?.departments?.[dept]?.done));
            if(pcDeptFilter!=="All") filtered=filtered.filter(d=>pcards[d.id]&&!pcards[d.id].departments?.[pcDeptFilter]?.done);
            // Re-add selected deal if filter removed it
            if(selectedDeal && !filtered.find(d=>d.id===selDeal)) filtered=[selectedDeal,...filtered];
            // Sort
            filtered=[...filtered].sort((a,b)=>{
              if(pcSort==="client") return a.client.localeCompare(b.client);
              if(pcSort==="ce") return (a.ceNo||"").localeCompare(b.ceNo||"");
              if(pcSort==="pct"){
                const pa=pcards[a.id]?projectProgress(pcards[a.id]):0;
                const pb=pcards[b.id]?projectProgress(pcards[b.id]):0;
                return pa-pb; // least complete first
              }
              if(pcSort==="tat"){
                const today2=new Date();
                const da=pcards[a.id]?.targetEndDate?Math.ceil((new Date(pcards[a.id].targetEndDate)-today2)/(1000*60*60*24)):999;
                const db=pcards[b.id]?.targetEndDate?Math.ceil((new Date(pcards[b.id].targetEndDate)-today2)/(1000*60*60*24)):999;
                return da-db; // most urgent first
              }
              return 0;
            });
            return(
              <div>
                {filtered.length===0&&<div style={{textAlign:"center",padding:"32px",color:"#94a3b8",fontSize:".84rem"}}>No projects match this filter.</div>}
                <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12}}>
                  {filtered.map(d=>{
                    const pc=pcards[d.id];
                    const pct=pc?projectProgress(pc):0;
                    const doneCount=pc?DEPT_ORDER.filter(dept=>pc.departments?.[dept]?.done).length:0;
                    const hasDupe=wonDeals.filter(x=>x.ceNo&&x.ceNo===d.ceNo&&x.ceNo!=="No CE").length>1;
                    return(
                      <div key={d.id} style={{background:"#fff",borderRadius:14,border:"1.5px solid #e2e8f0",padding:"14px 16px",transition:"all .15s",boxShadow:"0 1px 4px rgba(0,0,0,.04)"}}
                        onMouseEnter={e=>{e.currentTarget.style.borderColor="#3b82f6";e.currentTarget.style.boxShadow="0 4px 16px rgba(59,130,246,.12)";}}
                        onMouseLeave={e=>{e.currentTarget.style.borderColor="#e2e8f0";e.currentTarget.style.boxShadow="0 1px 4px rgba(0,0,0,.04)";}}>

                        {/* Card top row: client info + pct + delete */}
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                          {/* Left: client info */}
                          <div style={{flex:1,cursor:"pointer",minWidth:0}} onClick={()=>{setSelDeal(d.id);setSelDept(editableDepts[0]||"Sales");}}>
                            <div style={{fontWeight:700,color:"#0f172a",fontSize:".92rem",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.client}</div>
                            {d.contact&&<div style={{fontSize:".72rem",color:"#64748b",marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.contact}</div>}
                            <div style={{display:"flex",alignItems:"center",gap:6,marginTop:3,flexWrap:"wrap"}}>
                              <span style={{fontSize:".7rem",color:"#94a3b8"}}>{d.ceNo||"No CE"} · {fmt(d.value)}</span>
                              {hasDupe&&<span style={{fontSize:".62rem",background:"#fef2f2",color:"#dc2626",border:"1px solid #fecaca",borderRadius:20,padding:"1px 7px",fontWeight:700}}>DUPLICATE</span>}
                            </div>
                            {(()=>{const j=jos.find(j=>j.dealId===d.id);return j?(<div style={{fontSize:".68rem",color:"#3b82f6",marginTop:2}}>📋 {j.joNo} · {[j.pm1,j.pm2,j.pm3].filter(Boolean).join(", ")||"No PM"}</div>):null;})()}
                          </div>
                          {/* Right: pct + delete stacked */}
                          <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0,marginLeft:10}}>
                            {pct===100&&<span style={{fontSize:".62rem",background:"#059669",color:"#fff",fontWeight:800,padding:"2px 7px",borderRadius:20}}>✅ DONE</span>}
                            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.3rem",color:pct===100?"#059669":"#3b82f6"}}>{pct}%</div>
                            <div style={{fontSize:".6rem",color:"#94a3b8"}}>{doneCount}/{DEPT_ORDER.length} depts</div>
                            {role==="Manager"&&(
                              <button
                                onClick={e=>{e.stopPropagation();if(window.confirm("Delete "+d.client+"? This removes the deal, project card, JO and checklist."))
                                  {delDeal(d.id);delPcard(d.id);}}}
                                style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:6,padding:"3px 8px",fontSize:".68rem",color:"#dc2626",cursor:"pointer",fontWeight:700,fontFamily:"inherit",marginTop:2}}>
                                ✕ Delete
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Dept pills — clickable */}
                        <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:8,cursor:"pointer"}} onClick={()=>{setSelDeal(d.id);setSelDept(editableDepts[0]||"Sales");}}>
                          {DEPT_ORDER.map(dept=>{
                            const done=pc?.departments?.[dept]?.done;
                            const tasksDone=pc?.departments?.[dept]?.tasks?.filter(t=>t.done).length||0;
                            const tasksTotal=pc?.departments?.[dept]?.tasks?.length||DEFAULT_DEPT_TASKS[dept].length;
                            return(
                              <div key={dept} style={{fontSize:".62rem",padding:"2px 8px",borderRadius:20,fontWeight:600,background:done?(DEPT_CLR[dept]+"22"):pc?((DEPT_CLR[dept]+"11")):"#f8fafc",color:done?DEPT_CLR[dept]:"#94a3b8",border:`1px solid ${done?(DEPT_CLR[dept]+"44"):"#e2e8f0"}`}} title={`${dept}: ${tasksDone}/${tasksTotal} tasks`}>
                                {done?"✓ ":""}{dept}
                              </div>
                            );
                          })}
                        </div>

                        {/* Progress bar */}
                        <div style={{height:5,background:"#f1f5f9",borderRadius:3,overflow:"hidden",cursor:"pointer"}} onClick={()=>{setSelDeal(d.id);setSelDept(editableDepts[0]||"Sales");}}>
                          <div style={{height:"100%",width:pct+"%",background:pct===100?"#10b981":"#3b82f6",borderRadius:3,transition:"width .5s"}}/>
                        </div>

                        {/* TAT badge */}
                        {pc?.targetDays&&(()=>{
                          const today2=new Date(); const end=new Date(pc.targetEndDate);
                          const daysLeft=Math.ceil((end-today2)/(1000*60*60*24));
                          const isOver=daysLeft<0;
                          return(
                            <div style={{marginTop:7,display:"flex",gap:8,alignItems:"center",fontSize:".7rem"}}>
                              <span style={{color:"#94a3b8"}}>🕐 {pc.targetDays}d</span>
                              <span style={{fontWeight:700,color:isOver?"#ef4444":daysLeft<=7?"#f59e0b":"#059669"}}>
                                {isOver?`${Math.abs(daysLeft)}d overdue`:`${daysLeft}d left`}
                              </span>
                              <span style={{color:"#94a3b8"}}>Due {pc.targetEndDate}</span>
                            </div>
                          );
                        })()}

                        {!pc&&(
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:6}}>
                            <div style={{fontSize:".7rem",color:"#f59e0b",fontWeight:600}}>⚠ No project card yet</div>
                            {role==="Manager"&&(
                              <button onClick={e=>{e.stopPropagation();createProjectCard(d.id,d);}}
                                style={{background:"#f59e0b",border:"none",borderRadius:6,padding:"3px 10px",fontFamily:"inherit",fontSize:".7rem",color:"#fff",cursor:"pointer",fontWeight:700}}>
                                + Create Card
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      ):(
        // ── SINGLE PROJECT CARD ───────────────────────────────────────────────
        <div>
          {/* Back + header */}
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16,flexWrap:"wrap"}}>
            <button onClick={()=>setSelDeal(null)} style={{background:"#f1f5f9",border:"none",borderRadius:8,padding:"7px 14px",fontFamily:"inherit",fontSize:".82rem",color:"#475569",cursor:"pointer",fontWeight:600}}>← Back</button>
            <div>
              <div style={{fontWeight:800,color:"#0f172a",fontSize:"1.05rem"}}>{deal?.client}</div>
              <div style={{fontSize:".73rem",color:"#64748b"}}>{deal?.ceNo} · {fmt(deal?.value)} · {deal?.stage?.replace(/^\d+ · /,"")}</div>
            </div>
            <div style={{marginLeft:"auto",display:"flex",gap:12,alignItems:"center"}}>
              {projectProgress(card)===100&&(
                <span style={{background:"#059669",color:"#fff",fontWeight:800,fontSize:".82rem",padding:"5px 14px",borderRadius:20,letterSpacing:".5px"}}>
                  ✅ PROJECT DONE
                </span>
              )}
              <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.4rem",color:projectProgress(card)===100?"#059669":"#3b82f6"}}>
                {projectProgress(card)}% Complete
              </div>
            </div>
          </div>

          {/* If no card yet */}
          {!card&&(
            <div style={{background:"#fffbeb",border:"1.5px solid #fde68a",borderRadius:12,padding:"16px 20px",textAlign:"center"}}>
              <div style={{fontWeight:700,color:"#92400e",marginBottom:6}}>No project card yet</div>
              <div style={{fontSize:".82rem",color:"#92400e"}}>Project cards are created automatically when a deal is awarded via the Pipeline. If this deal was awarded before this feature was added, contact a Manager.</div>
            </div>
          )}

          {card&&(
            <>
              {/* Dept tabs */}
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:16}}>
                {DEPT_ORDER.map(dept=>{
                  const done=card.departments?.[dept]?.done;
                  const isActive=selDept===dept;
                  const clr=DEPT_CLR[dept];
                  const tasksDone=card.departments?.[dept]?.tasks?.filter(t=>t.done).length||0;
                  const tasksTotal=card.departments?.[dept]?.tasks?.length||0;
                  return(
                    <button key={dept} onClick={()=>setSelDept(dept)}
                      style={{padding:"8px 16px",borderRadius:20,border:`2px solid ${isActive?clr:done?(clr+"55"):"#e2e8f0"}`,background:isActive?clr:done?(clr+"11"):"#fff",color:isActive?"#fff":done?clr:"#64748b",fontFamily:"inherit",fontWeight:700,fontSize:".78rem",cursor:"pointer",transition:"all .15s"}}>
                      {done?"✓ ":""}{dept} {tasksTotal>0&&`(${tasksDone}/${tasksTotal})`}
                    </button>
                  );
                })}
              </div>

              {/* ── TAT Panel ── */}
              {(()=>{
                const canSetTAT=role==="Manager"||role==="QS"||role==="Operations";
                const today2=new Date();
                const endDate=card.targetEndDate?new Date(card.targetEndDate):null;
                const daysLeft=endDate?Math.ceil((endDate-today2)/(1000*60*60*24)):null;
                const isOver=daysLeft!==null&&daysLeft<0;
                const awardDate=card.awardDate||today;
                const elapsed=Math.ceil((today2-new Date(awardDate))/(1000*60*60*24));
                const ceType=deal?.ceType||"Fabrication / General";
                const refTable=TAT_REFERENCE[ceType]||TAT_REFERENCE["Fabrication / General"];

                return(
                  <div style={{background:isOver?"#fef2f2":"#f0fdf4",border:`1.5px solid ${isOver?"#fecaca":"#6ee7b7"}`,borderRadius:12,padding:"14px 18px",marginBottom:16}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12}}>
                      <div>
                        <div style={{fontWeight:700,color:isOver?"#dc2626":"#059669",fontSize:".88rem",marginBottom:4}}>
                          🕐 Turnaround Time
                        </div>
                        {card.targetDays?(
                          <div style={{display:"flex",gap:20,flexWrap:"wrap",fontSize:".82rem"}}>
                            <div><span style={{color:"#94a3b8"}}>Award date: </span><strong>{awardDate}</strong></div>
                            <div><span style={{color:"#94a3b8"}}>Target: </span><strong>{card.targetDays} days</strong></div>
                            <div><span style={{color:"#94a3b8"}}>Due: </span><strong style={{color:isOver?"#ef4444":"#0f172a"}}>{card.targetEndDate}</strong></div>
                            <div><span style={{color:"#94a3b8"}}>Elapsed: </span><strong>{elapsed} days</strong></div>
                            <div style={{fontWeight:800,color:isOver?"#ef4444":daysLeft<=7?"#f59e0b":"#059669",fontSize:".92rem"}}>
                              {isOver?`⚠ ${Math.abs(daysLeft)} days overdue`:`${daysLeft} days remaining`}
                            </div>
                          </div>
                        ):(
                          <div style={{fontSize:".8rem",color:"#94a3b8"}}>Not set yet — QS or Operations Director should set the target turnaround time.</div>
                        )}
                        {card.tatSetBy&&<div style={{fontSize:".68rem",color:"#94a3b8",marginTop:4}}>Set by {card.tatSetBy} · {card.tatSetAt?.split("T")[0]}</div>}
                        {card.tatCategory&&<div style={{fontSize:".72rem",color:"#64748b",marginTop:2}}>Category: {card.tatCategory}</div>}
                      </div>

                      {/* TAT setter */}
                      {canSetTAT&&(
                        <TATSetter deal={deal} card={card} onSet={setProjectTAT} refTable={refTable} ceType={ceType}/>
                      )}
                    </div>

                    {/* Progress bar if TAT set */}
                    {card.targetDays&&(
                      <div style={{marginTop:12}}>
                        <div style={{display:"flex",justifyContent:"space-between",fontSize:".68rem",color:"#94a3b8",marginBottom:3}}>
                          <span>Day {elapsed} of {card.targetDays}</span>
                          <span>{Math.min(100,Math.round(elapsed/card.targetDays*100))}% of time used</span>
                        </div>
                        <div style={{height:6,background:"rgba(0,0,0,.08)",borderRadius:3,overflow:"hidden"}}>
                          <div style={{height:"100%",width:Math.min(100,elapsed/card.targetDays*100)+"%",background:isOver?"#ef4444":elapsed/card.targetDays>0.8?"#f59e0b":"#10b981",borderRadius:3,transition:"width .5s"}}/>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Dept task panel */}
              {selDept&&(()=>{
                const deptData=card.departments?.[selDept];
                const tasks=deptData?.tasks||[];
                const canEdit=editableDepts.includes(selDept)||role==="Manager";
                const allDone=tasks.every(t=>t.done);
                const clr=DEPT_CLR[selDept];

                return(
                  <div style={{background:"#fff",borderRadius:14,border:`1.5px solid ${clr}33`,padding:"18px 20px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16,flexWrap:"wrap",gap:10}}>
                      <div>
                        <div style={{fontWeight:800,color:"#0f172a",fontSize:"1rem",display:"flex",alignItems:"center",gap:10}}>
                          <span style={{width:12,height:12,borderRadius:"50%",background:clr,display:"inline-block"}}/>
                          {selDept}
                          {deptData?.done&&<span style={{fontSize:".72rem",background:clr+"22",color:clr,border:`1px solid ${clr}44`,borderRadius:20,padding:"2px 10px",fontWeight:700}}>✓ DONE</span>}
                        </div>
                        {deptData?.done&&<div style={{fontSize:".72rem",color:"#94a3b8",marginTop:4}}>Completed by {deptData.doneBy} on {deptData.doneAt?.split("T")[0]}</div>}
                      </div>
                      {canEdit&&(
                        <div style={{display:"flex",gap:8}}>
                          {!deptData?.done&&allDone&&(
                            <button onClick={()=>markDeptDone(selDeal,selDept,true)}
                              style={{background:clr,border:"none",borderRadius:9,padding:"8px 18px",fontFamily:"inherit",fontWeight:700,fontSize:".82rem",color:"#fff",cursor:"pointer"}}>
                              ✓ Mark {selDept} Done
                            </button>
                          )}
                          {deptData?.done&&(
                            <button onClick={()=>markDeptDone(selDeal,selDept,false)}
                              style={{background:"transparent",border:`1.5px solid ${clr}`,borderRadius:9,padding:"7px 14px",fontFamily:"inherit",fontWeight:600,fontSize:".78rem",color:clr,cursor:"pointer"}}>
                              Reopen
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Task list */}
                    <div style={{display:"flex",flexDirection:"column",gap:6}}>
                      {tasks.map(task=>{
                        return(
                          <div key={task.id} onClick={e=>{e.stopPropagation();if(canEdit)toggleDeptTask(selDeal,selDept,task.id);}}
                            style={{display:"flex",alignItems:"flex-start",gap:12,padding:"10px 12px",borderRadius:8,background:task.done?(clr+"09"):"#f8fafc",cursor:canEdit?"pointer":"default",border:`1px solid ${task.done?(clr+"33"):"#f1f5f9"}`,transition:"all .15s"}}
                            onMouseEnter={e=>{if(canEdit)e.currentTarget.style.background=task.done?(clr+"18"):"#f1f5f9";}}
                            onMouseLeave={e=>{e.currentTarget.style.background=task.done?(clr+"09"):"#f8fafc";}}>
                            <div style={{width:20,height:20,borderRadius:5,border:`2px solid ${task.done?clr:"#cbd5e1"}`,background:task.done?clr:"#fff",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",marginTop:1,transition:"all .2s"}}>
                              {task.done&&<span style={{color:"#fff",fontSize:".7rem",fontWeight:900}}>✓</span>}
                            </div>
                            <div style={{flex:1}}>
                              <div style={{fontSize:".85rem",color:task.done?"#64748b":"#0f172a",textDecoration:task.done?"line-through":"none",fontWeight:task.done?400:600}}>{task.text}</div>
                              {task.done&&task.doneBy&&<div style={{fontSize:".68rem",color:"#94a3b8",marginTop:2}}>✓ {task.doneBy} · {task.doneAt?.split("T")[0]}</div>}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Completion status */}
                    <div style={{marginTop:12,padding:"10px 12px",background:"#f8fafc",borderRadius:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div style={{fontSize:".75rem",color:"#64748b"}}>{tasks.filter(t=>t.done).length} of {tasks.length} tasks complete</div>
                      <div style={{height:6,background:"#e2e8f0",borderRadius:3,overflow:"hidden",width:200}}>
                        <div style={{height:"100%",width:(tasks.filter(t=>t.done).length/tasks.length*100)+"%",background:clr,borderRadius:3,transition:"width .4s"}}/>
                      </div>
                    </div>

                    {!canEdit&&(
                      <div style={{marginTop:10,fontSize:".75rem",color:"#94a3b8",fontStyle:"italic",textAlign:"center"}}>
                        View only — {selDept} team updates their own tasks
                      </div>
                    )}
                  </div>
                );
              })()}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── TAT SETTER COMPONENT ─────────────────────────────────────────────────────
function InventoryView({inventory,stocklog,wonDeals,addInventoryItem,updateInventoryItem,deleteInventoryItem,logStockMove,session,role}){
  const[showForm,setShowForm]=useState(false);
  const[editId,setEditId]=useState(null);
  const[form,setForm]=useState(emptyItem());
  const[filterCat,setFilterCat]=useState("all");
  const[filterLoc,setFilterLoc]=useState("all");
  const[search,setSearch]=useState("");
  const[showMove,setShowMove]=useState(null); // item id for quick stock move
  const[moveForm,setMoveForm]=useState({moveType:"IN — Delivery",qty:"",unitCost:"",projectId:"",notes:"",date:today});

  const f=(k,v)=>setForm(p=>({...p,[k]:v}));
  const fm=(k,v)=>setMoveForm(p=>({...p,[k]:v}));
  const n=v=>Number(v)||0;
  const fmt=v=>"₱"+n(v).toLocaleString("en-PH",{minimumFractionDigits:2});

  const canEdit=role==="Manager"||role==="Procurement"||role==="Warehouse";
  const canDelete=role==="Manager"||role==="Procurement";

  const subs=useMemo(()=>{
    const cat=INV_CATEGORIES.find(c=>c.main===form.category);
    return cat?.subs||["Other"];
  },[form.category]);

  const filtered=useMemo(()=>{
    let list=inventory;
    if(filterCat!=="all") list=list.filter(i=>i.category===filterCat);
    if(filterLoc!=="all") list=list.filter(i=>i.location===filterLoc);
    if(search) list=list.filter(i=>i.name.toLowerCase().includes(search.toLowerCase())||i.code.toLowerCase().includes(search.toLowerCase())||i.supplier.toLowerCase().includes(search.toLowerCase()));
    return list;
  },[inventory,filterCat,filterLoc,search]);

  // KPIs
  const totalValue=inventory.reduce((s,i)=>s+n(i.qtyOnHand)*n(i.avgCost),0);
  const lowStock=inventory.filter(i=>n(i.qtyOnHand)<=n(i.reorderPoint)&&n(i.reorderPoint)>0);
  const outOfStock=inventory.filter(i=>n(i.qtyOnHand)===0);

  const openEdit=(item)=>{setForm({...item});setEditId(item.id);setShowForm(true);};
  const openNew=()=>{setForm(emptyItem());setEditId(null);setShowForm(true);};
  const saveItem=()=>{
    if(!form.name) return;
    if(editId) updateInventoryItem(editId,form);
    else addInventoryItem(form);
    setShowForm(false); setEditId(null);
  };
  const submitMove=()=>{
    if(!moveForm.qty||!showMove) return;
    logStockMove({...moveForm,itemId:showMove});
    setMoveForm({moveType:"IN — Delivery",qty:"",unitCost:"",projectId:"",notes:"",date:today});
    setShowMove(null);
  };

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:12}}>
        <div>
          <h2 style={{margin:0,fontWeight:800,color:"#0f172a",fontSize:"1.15rem"}}>📦 Inventory</h2>
          <div style={{fontSize:".75rem",color:"#64748b",marginTop:2}}>Materials on hand — every item is cash sitting in your warehouse</div>
        </div>
        {canEdit&&<button onClick={openNew} style={{background:"#1e293b",border:"none",borderRadius:10,padding:"9px 18px",fontFamily:"inherit",fontWeight:700,fontSize:".84rem",color:"#fff",cursor:"pointer"}}>+ Add Item</button>}
      </div>

      {/* KPIs */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:16}}>
        {[
          {l:"Total Inventory Value", v:"₱"+Math.round(totalValue).toLocaleString("en-PH"), c:"#059669"},
          {l:"Total Items",           v:inventory.length,                                     c:"#3b82f6"},
          {l:"Low Stock Alerts",      v:lowStock.length,                                      c:lowStock.length>0?"#f59e0b":"#94a3b8"},
          {l:"Out of Stock",          v:outOfStock.length,                                    c:outOfStock.length>0?"#ef4444":"#94a3b8"},
        ].map(({l,v,c})=>(
          <div key={l} style={{background:"#fff",borderRadius:12,padding:"14px 16px",border:"1.5px solid #e2e8f0"}}>
            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.3rem",color:c}}>{v}</div>
            <div style={{fontSize:".63rem",textTransform:"uppercase",letterSpacing:"1px",color:"#94a3b8",marginTop:5}}>{l}</div>
          </div>
        ))}
      </div>

      {/* Finance note */}
      {(role==="Finance"||role==="Manager")&&(
        <div style={{background:"#eff6ff",border:"1.5px solid #93c5fd",borderRadius:10,padding:"10px 16px",marginBottom:14,fontSize:".8rem",color:"#1d4ed8"}}>
          💰 <strong>Inventory = Cash Asset:</strong> Total value of ₱{Math.round(totalValue).toLocaleString("en-PH")} represents materials purchased and sitting in the warehouse. Reconcile with total POs paid. Any discrepancy = investigate.
        </div>
      )}

      {/* Low stock alert */}
      {lowStock.length>0&&(
        <div style={{background:"#fffbeb",border:"1.5px solid #fde68a",borderRadius:10,padding:"10px 16px",marginBottom:14,fontSize:".8rem",color:"#92400e"}}>
          ⚠️ <strong>{lowStock.length} item{lowStock.length>1?"s":""} at or below reorder point:</strong> {lowStock.slice(0,4).map(i=>i.name).join(", ")}{lowStock.length>4&&` +${lowStock.length-4} more`}
        </div>
      )}

      {/* Filters + Search */}
      <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
        <FInp value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search item, code, supplier…"
          style={{flex:1,minWidth:200,border:"1.5px solid #e2e8f0",borderRadius:8,padding:"8px 13px",fontFamily:"inherit",fontSize:".84rem",color:"#0f172a"}}/>
        <select value={filterCat} onChange={e=>setFilterCat(e.target.value)}
          style={{border:"1.5px solid #e2e8f0",borderRadius:8,padding:"8px 12px",fontFamily:"inherit",fontSize:".8rem",color:"#0f172a",background:"#fff",cursor:"pointer"}}>
          <option value="all">All Categories</option>
          {INV_CATEGORIES.map(c=><option key={c.main}>{c.main}</option>)}
        </select>
        <select value={filterLoc} onChange={e=>setFilterLoc(e.target.value)}
          style={{border:"1.5px solid #e2e8f0",borderRadius:8,padding:"8px 12px",fontFamily:"inherit",fontSize:".8rem",color:"#0f172a",background:"#fff",cursor:"pointer"}}>
          <option value="all">All Locations</option>
          {INV_LOCATIONS.map(l=><option key={l}>{l}</option>)}
        </select>
      </div>

      {/* Add / Edit Form */}
      {showForm&&canEdit&&(
        <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",padding:18,marginBottom:16,boxShadow:"0 4px 16px rgba(0,0,0,.06)"}}>
          <div style={{fontWeight:800,color:"#0f172a",marginBottom:14}}>{editId?"Edit Item":"Add Inventory Item"}</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            <div style={{gridColumn:"1/-1"}}><Fld label="Item Name" required><Inp value={form.name} onChange={e=>f("name",e.target.value)} placeholder="e.g. Melamine Board 18mm White 4x8 ft"/></Fld></div>
            <Fld label="Category"><Sel value={form.category} onChange={e=>{f("category",e.target.value);f("subCategory",INV_CATEGORIES.find(c=>c.main===e.target.value)?.subs[0]||"Other");}}>
              {INV_CATEGORIES.map(c=><option key={c.main}>{c.main}</option>)}</Sel></Fld>
            <Fld label="Sub-Category"><Sel value={form.subCategory} onChange={e=>f("subCategory",e.target.value)}>
              {subs.map(s=><option key={s}>{s}</option>)}</Sel></Fld>
            <Fld label="Brand / Supplier"><Inp value={form.supplier} onChange={e=>f("supplier",e.target.value)} placeholder="Supplier name"/></Fld>
            <Fld label="Warehouse Location"><Sel value={form.location} onChange={e=>f("location",e.target.value)}>
              {INV_LOCATIONS.map(l=><option key={l}>{l}</option>)}</Sel></Fld>
            <Fld label="Unit of Measure"><Sel value={form.unit} onChange={e=>f("unit",e.target.value)}>
              {INV_UNITS.map(u=><option key={u}>{u}</option>)}</Sel></Fld>
            <Fld label="Standard Unit Size" hint="e.g. 4x8 ft, 1 liter, per piece"><Inp value={form.unitSize} onChange={e=>f("unitSize",e.target.value)} placeholder="e.g. 4x8 ft"/></Fld>
            <Fld label="Qty On Hand"><Inp type="number" value={form.qtyOnHand} onChange={e=>f("qtyOnHand",e.target.value)} min={0}/></Fld>
            <Fld label="Reorder Point" hint="Alert when stock drops to this level"><Inp type="number" value={form.reorderPoint} onChange={e=>f("reorderPoint",e.target.value)} min={0}/></Fld>
            <Fld label="Last Purchase Price (₱)" hint="VAT-exclusive"><Inp type="number" value={form.lastPurchasePrice} onChange={e=>{f("lastPurchasePrice",e.target.value);f("avgCost",e.target.value);}}/></Fld>
            <Fld label="Average Cost (₱)" hint="Running average — auto-updates on stock IN"><Inp type="number" value={form.avgCost} onChange={e=>f("avgCost",e.target.value)}/></Fld>
            <div style={{gridColumn:"1/-1"}}><Fld label="Notes / Specs"><Inp rows={2} value={form.notes} onChange={e=>f("notes",e.target.value)} placeholder="Technical specs, color, grade, thickness…"/></Fld></div>
          </div>
          <div style={{display:"flex",gap:10,marginTop:14}}>
            <button onClick={saveItem} disabled={!form.name} style={{background:form.name?"#1e293b":"#e2e8f0",border:"none",borderRadius:9,padding:"10px 22px",fontFamily:"inherit",fontWeight:700,fontSize:".87rem",color:form.name?"#fff":"#94a3b8",cursor:form.name?"pointer":"not-allowed"}}>{editId?"Save Changes":"Add Item"}</button>
            <button onClick={()=>{setShowForm(false);setEditId(null);}} style={{background:"transparent",border:"1.5px solid #e2e8f0",borderRadius:9,padding:"10px 18px",fontFamily:"inherit",fontWeight:600,fontSize:".84rem",color:"#64748b",cursor:"pointer"}}>Cancel</button>
          </div>
        </div>
      )}

      {inventory.length===0&&<div style={{textAlign:"center",padding:"32px 0",color:"#94a3b8",fontSize:".84rem"}}>No inventory items yet. Add items or upload via the inventory template.</div>}

      {/* Item list */}
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {filtered.map(item=>{
          const totalItemVal=n(item.qtyOnHand)*n(item.avgCost);
          const isLow=n(item.reorderPoint)>0&&n(item.qtyOnHand)<=n(item.reorderPoint);
          const isOut=n(item.qtyOnHand)===0;
          const statusClr=isOut?"#ef4444":isLow?"#f59e0b":"#10b981";
          return(
            <div key={item.id} style={{background:"#fff",borderRadius:12,border:`1.5px solid ${isOut?"#fecaca":isLow?"#fde68a":"#e2e8f0"}`,padding:"14px 18px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,flexWrap:"wrap"}}>
                <div style={{flex:1}}>
                  <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginBottom:4}}>
                    <span style={{fontSize:".68rem",color:"#94a3b8",fontFamily:"monospace",background:"#f1f5f9",padding:"1px 7px",borderRadius:5}}>{item.code}</span>
                    <span style={{fontWeight:700,color:"#0f172a",fontSize:".92rem"}}>{item.name}</span>
                    <span style={{fontSize:".68rem",color:"#64748b",background:"#f1f5f9",padding:"1px 8px",borderRadius:20}}>{item.category}</span>
                    {item.subCategory&&<span style={{fontSize:".68rem",color:"#94a3b8"}}>{item.subCategory}</span>}
                  </div>
                  <div style={{display:"flex",gap:16,flexWrap:"wrap",fontSize:".78rem",color:"#64748b"}}>
                    {item.supplier&&<span>🏭 {item.supplier}</span>}
                    <span>📍 {item.location||"Warehouse"}</span>
                    <span>Last price: {fmt(item.lastPurchasePrice)}/{item.unit}</span>
                    <span>Avg cost: {fmt(item.avgCost)}/{item.unit}</span>
                    {item.unitSize&&<span>Size: {item.unitSize}</span>}
                    <span>Updated: {item.lastUpdated}</span>
                  </div>
                  {/* Quick stock move form */}
                  {showMove===item.id&&canEdit&&(
                    <div style={{background:"#eff6ff",borderRadius:8,padding:"12px 14px",border:"1.5px solid #93c5fd",marginTop:10}}>
                      <div style={{fontWeight:700,color:"#1d4ed8",marginBottom:10,fontSize:".84rem"}}>Log Stock Movement</div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                        <Fld label="Type"><Sel value={moveForm.moveType} onChange={e=>fm("moveType",e.target.value)}>{STOCK_MOVE_TYPES.map(t=><option key={t}>{t}</option>)}</Sel></Fld>
                        <Fld label="Qty">{moveForm.moveType.startsWith("ADJUST")
                          ?<Inp type="number" value={moveForm.qty} onChange={e=>fm("qty",e.target.value)} placeholder="New total count"/>
                          :<Inp type="number" value={moveForm.qty} onChange={e=>fm("qty",e.target.value)} placeholder="0" min={0}/>}
                        </Fld>
                        <Fld label="Date"><Inp type="date" value={moveForm.date} onChange={e=>fm("date",e.target.value)}/></Fld>
                        {moveForm.moveType.startsWith("IN")&&<Fld label="Unit Cost (₱)"><Inp type="number" value={moveForm.unitCost} onChange={e=>fm("unitCost",e.target.value)} placeholder="0.00"/></Fld>}
                        {moveForm.moveType.startsWith("OUT")&&<Fld label="Project / CE No."><Sel value={moveForm.projectId} onChange={e=>fm("projectId",e.target.value)}><option value="">— Select —</option>{wonDeals.map(d=><option key={d.id} value={d.id}>{d.client} {d.ceNo?`(${d.ceNo})`:""}</option>)}</Sel></Fld>}
                        <div style={{gridColumn:"1/-1"}}><Fld label="Notes"><Inp value={moveForm.notes} onChange={e=>fm("notes",e.target.value)} placeholder="DR number, PO reference, project site…"/></Fld></div>
                      </div>
                      <div style={{display:"flex",gap:8,marginTop:10}}>
                        <button onClick={submitMove} disabled={!moveForm.qty} style={{background:moveForm.qty?"#1d4ed8":"#e2e8f0",border:"none",borderRadius:8,padding:"8px 18px",fontFamily:"inherit",fontWeight:700,fontSize:".84rem",color:moveForm.qty?"#fff":"#94a3b8",cursor:moveForm.qty?"pointer":"not-allowed"}}>Save Movement</button>
                        <button onClick={()=>setShowMove(null)} style={{background:"transparent",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"8px 14px",fontFamily:"inherit",fontWeight:600,fontSize:".8rem",color:"#64748b",cursor:"pointer"}}>Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:6,alignItems:"flex-end",flexShrink:0}}>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.4rem",color:statusClr}}>{n(item.qtyOnHand).toLocaleString()} <span style={{fontSize:".75rem",fontWeight:400,color:"#94a3b8"}}>{item.unit}</span></div>
                    <div style={{fontSize:".7rem",color:"#94a3b8",marginTop:1}}>Value: <strong style={{color:"#059669"}}>₱{Math.round(totalItemVal).toLocaleString()}</strong></div>
                    {isOut&&<div style={{fontSize:".68rem",color:"#ef4444",fontWeight:700}}>OUT OF STOCK</div>}
                    {isLow&&!isOut&&<div style={{fontSize:".68rem",color:"#f59e0b",fontWeight:700}}>LOW STOCK</div>}
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    {canEdit&&<button onClick={()=>setShowMove(showMove===item.id?null:item.id)} style={{background:"#eff6ff",border:"1.5px solid #93c5fd",borderRadius:7,padding:"5px 11px",fontSize:".73rem",color:"#1d4ed8",cursor:"pointer",fontWeight:700,fontFamily:"inherit"}}>± Stock</button>}
                    {canEdit&&<button onClick={()=>openEdit(item)} style={{background:"#f1f5f9",border:"none",borderRadius:7,padding:"5px 11px",fontSize:".73rem",color:"#475569",cursor:"pointer",fontWeight:600,fontFamily:"inherit"}}>✏</button>}
                    {canDelete&&<button onClick={()=>{if(window.confirm("Delete this item?"))deleteInventoryItem(item.id);}} style={{background:"#fef2f2",border:"none",borderRadius:7,padding:"5px 11px",fontSize:".73rem",color:"#dc2626",cursor:"pointer",fontWeight:600,fontFamily:"inherit"}}>✕</button>}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
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
    logStockMove({...form});
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

      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:16}}>
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
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            <Fld label="Item" required><Sel value={form.itemId} onChange={e=>f("itemId",e.target.value)}><option value="">— Select Item —</option>{inventory.map(i=><option key={i.id} value={i.id}>{i.name} ({i.code}) — {n(i.qtyOnHand)} {i.unit} on hand</option>)}</Sel></Fld>
            <Fld label="Movement Type"><Sel value={form.moveType} onChange={e=>f("moveType",e.target.value)}>{STOCK_MOVE_TYPES.map(t=><option key={t}>{t}</option>)}</Sel></Fld>
            <Fld label={form.moveType.startsWith("ADJUST")?"New Total Qty (absolute count)":"Quantity"}><Inp type="number" value={form.qty} onChange={e=>f("qty",e.target.value)} min={0} placeholder="0"/></Fld>
            <Fld label="Date"><Inp type="date" value={form.date} onChange={e=>f("date",e.target.value)}/></Fld>
            {form.moveType.startsWith("IN")&&<Fld label="Unit Cost (₱)" hint="Updates average cost automatically"><Inp type="number" value={form.unitCost} onChange={e=>f("unitCost",e.target.value)} placeholder="0.00"/></Fld>}
            {form.moveType.startsWith("OUT")&&<Fld label="Project / CE No."><Sel value={form.projectId} onChange={e=>f("projectId",e.target.value)}><option value="">— Optional —</option>{wonDeals.map(d=><option key={d.id} value={d.id}>{d.client} {d.ceNo?`(${d.ceNo})`:""}</option>)}</Sel></Fld>}
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
        <div style={{display:"grid",gridTemplateColumns:"100px 1fr 100px 80px 120px 1fr",background:"#1e293b",padding:"10px 16px",gap:12}}>
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
            <div key={mv.id} style={{display:"grid",gridTemplateColumns:"100px 1fr 100px 80px 120px 1fr",padding:"10px 16px",gap:12,borderTop:"1px solid #f1f5f9",background:i%2?"#fafafa":"#fff",alignItems:"center"}}>
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
  );
}

// ─── CONSTRUCTION CALENDAR ────────────────────────────────────────────────────
function ConstructionCalendar({wonDeals,deals,pcards,jos,prs,billings,drfs,setPage,today,Wrap}){
  const[viewDate,setViewDate]=React.useState(new Date());
  const[selectedDay,setSelectedDay]=React.useState(null);
  const[calTab,setCalTab]=React.useState("calendar");

  const events=React.useMemo(()=>{
    const list=[];
    wonDeals.forEach(d=>{
      const pc=pcards[d.id];const jo=jos.find(j=>j.dealId===d.id);
      if(pc?.targetEndDate) list.push({date:pc.targetEndDate,type:"end",label:d.client,sub:"PM: "+(jo?.pm1||"—"),color:"#3b82f6",icon:"🏗"});
    });
    prs.filter(p=>p.deliveryDate&&!["Delivered","Cancelled"].includes(p.status)).forEach(p=>{
      const d=wonDeals.find(x=>x.id===(p.projectId||p.dealId));
      list.push({date:p.deliveryDate,type:"delivery",label:p.itemName||"Delivery",sub:d?.client||"?",color:"#f97316",icon:"📦"});
    });
    billings.filter(b=>b.dueDate&&b.status!=="Fully Paid").forEach(b=>{
      const d=wonDeals.find(x=>x.id===b.dealId);
      list.push({date:b.dueDate,type:"billing",label:b.name||"Billing",sub:(d?.client||"?")+" · ₱"+Number(b.amount||0).toLocaleString("en-PH",{maximumFractionDigits:0}),color:"#10b981",icon:"💵"});
    });
    drfs.filter(d=>d.designDeadline&&d.status!=="Done").forEach(d=>{
      list.push({date:d.designDeadline,type:"drf",label:d.drfNo||"DRF",sub:d.client||"?",color:"#ec4899",icon:"📝"});
    });
    return list;
  },[wonDeals,pcards,jos,prs,billings,drfs]);

  const eventsByDate=React.useMemo(()=>{
    const map={};events.forEach(e=>{if(!map[e.date])map[e.date]=[];map[e.date].push(e);});return map;
  },[events]);

  const year=viewDate.getFullYear(),month=viewDate.getMonth();
  const firstDay=new Date(year,month,1).getDay();
  const daysInMonth=new Date(year,month+1,0).getDate();
  const monthLabel=viewDate.toLocaleDateString("en-PH",{month:"long",year:"numeric"});
  const cells=[];
  for(let i=0;i<firstDay;i++)cells.push(null);
  for(let d=1;d<=daysInMonth;d++)cells.push(d);
  const dateStr=(d)=>`${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;

  const todayD=new Date(today);
  const weekEnd=new Date(todayD);weekEnd.setDate(weekEnd.getDate()+7);
  const thisWeekEvents=events.filter(e=>{const d=new Date(e.date);return d>=todayD&&d<=weekEnd;}).sort((a,b)=>a.date.localeCompare(b.date));

  const conflicts=React.useMemo(()=>{
    const pmProjects={};
    wonDeals.forEach(d=>{
      const pc=pcards[d.id];const jo=jos.find(j=>j.dealId===d.id);const pm=jo?.pm1;
      if(!pm||!pc?.targetEndDate)return;
      if(!pmProjects[pm])pmProjects[pm]=[];
      pmProjects[pm].push({client:d.client,endDate:pc.targetEndDate,ceNo:d.ceNo});
    });
    const flagged=[];
    Object.entries(pmProjects).forEach(([pm,projects])=>{
      if(projects.length<2)return;
      for(let i=0;i<projects.length;i++)for(let j=i+1;j<projects.length;j++){
        const diff=Math.abs(new Date(projects[i].endDate)-new Date(projects[j].endDate))/(1000*60*60*24);
        if(diff<=14)flagged.push({pm,p1:projects[i],p2:projects[j],diff:Math.round(diff)});
      }
    });
    return flagged;
  },[wonDeals,pcards,jos]);

  const deliveryWarnings=React.useMemo(()=>prs.filter(p=>{
    const pid=p.projectId||p.dealId;const pc=pcards[pid];
    if(!pc?.targetEndDate||!p.deliveryDate)return false;
    if(["Delivered","Cancelled"].includes(p.status))return false;
    return p.deliveryDate>pc.targetEndDate;
  }).map(p=>{
    const d=wonDeals.find(x=>x.id===(p.projectId||p.dealId));const pc=pcards[p.projectId||p.dealId];
    return{item:p.itemName||"?",client:d?.client||"?",deliveryDate:p.deliveryDate,endDate:pc?.targetEndDate};
  }),[prs,pcards,wonDeals]);

  const cashFlowByMonth=React.useMemo(()=>{
    const map={};
    billings.filter(b=>b.dueDate&&b.status!=="Fully Paid").forEach(b=>{
      const ym=b.dueDate.slice(0,7);if(!map[ym])map[ym]={month:ym,expected:0,count:0};
      map[ym].expected+=Number(b.amount||0);map[ym].count++;
    });
    return Object.values(map).sort((a,b)=>a.month.localeCompare(b.month)).slice(0,6);
  },[billings]);

  const teamCapacity=React.useMemo(()=>{
    const pmMap={};
    wonDeals.forEach(d=>{
      const jo=jos.find(j=>j.dealId===d.id);const pc=pcards[d.id];
      const pm=jo?.pm1||"Unassigned";
      if(!pmMap[pm])pmMap[pm]={pm,projects:[],overdue:0};
      const isOver=pc?.targetEndDate&&pc.targetEndDate<today;
      pmMap[pm].projects.push({client:d.client,endDate:pc?.targetEndDate,overdue:isOver});
      if(isOver)pmMap[pm].overdue++;
    });
    return Object.values(pmMap).sort((a,b)=>b.projects.length-a.projects.length);
  },[wonDeals,jos,pcards,today]);

  const TABS=[{id:"calendar",l:"📅 Monthly"},{id:"thisweek",l:"⚡ This Week"},{id:"conflicts",l:"⚠️ Conflicts"},{id:"cashflow",l:"💵 Cash Flow"},{id:"capacity",l:"👷 Team Load"}];
  const BTN=(p)=><button onClick={p.onClick} style={{...{background:p.active?"#1e293b":"#f8fafc",color:p.active?"#fff":"#64748b",border:`1.5px solid ${p.active?"#1e293b":"#e2e8f0"}`,borderRadius:8,padding:"6px 14px",fontFamily:"inherit",fontWeight:700,fontSize:".78rem",cursor:"pointer"},...(p.style||{})}}>{p.children}</button>;

  return(
    <Wrap>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
        <div>
          <h2 style={{margin:0,fontWeight:900,fontSize:"1.4rem",color:"#0f172a",fontFamily:"'Barlow Condensed',sans-serif"}}>📅 Project Calendar</h2>
          <div style={{fontSize:".75rem",color:"#64748b",marginTop:2}}>Conflict detection · cash flow · team capacity</div>
        </div>
        <button onClick={()=>setPage("home")} style={{background:"#f1f5f9",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"7px 14px",fontFamily:"inherit",fontWeight:600,fontSize:".8rem",color:"#475569",cursor:"pointer"}}>← Dashboard</button>
      </div>

      <div style={{display:"flex",gap:4,marginBottom:16,flexWrap:"wrap"}}>
        {TABS.map(t=><BTN key={t.id} active={calTab===t.id} onClick={()=>setCalTab(t.id)}>{t.l}</BTN>)}
      </div>

      {calTab==="calendar"&&(<>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
          <BTN onClick={()=>setViewDate(d=>{const n=new Date(d);n.setMonth(n.getMonth()-1);return n;})}>‹ Prev</BTN>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.3rem",color:"#0f172a"}}>{monthLabel}</div>
          <BTN onClick={()=>setViewDate(d=>{const n=new Date(d);n.setMonth(n.getMonth()+1);return n;})}>Next ›</BTN>
        </div>
        <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:12,padding:"8px 12px",background:"#f8fafc",borderRadius:10,border:"1px solid #e2e8f0"}}>
          {[{c:"#3b82f6",l:"Project End"},{c:"#f97316",l:"PO Delivery"},{c:"#10b981",l:"Billing Due"},{c:"#ec4899",l:"DRF Deadline"}].map(({c,l})=>(
            <div key={l} style={{display:"flex",alignItems:"center",gap:4,fontSize:".72rem",color:"#475569"}}>
              <div style={{width:10,height:10,borderRadius:"50%",background:c}}/>{l}
            </div>
          ))}
        </div>
        <div style={{background:"#fff",borderRadius:14,border:"1.5px solid #e2e8f0",overflow:"hidden"}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",background:"#1e293b"}}>
            {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d=>(
              <div key={d} style={{padding:"8px 4px",textAlign:"center",fontSize:".68rem",fontWeight:700,color:"rgba(255,255,255,.6)",textTransform:"uppercase",letterSpacing:"1px"}}>{d}</div>
            ))}
          </div>
          {Array.from({length:Math.ceil(cells.length/7)},(_,wi)=>(
            <div key={wi} style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",borderBottom:wi<Math.ceil(cells.length/7)-1?"1px solid #f1f5f9":""}}>
              {cells.slice(wi*7,(wi+1)*7).map((day,di)=>{
                if(!day)return<div key={di} style={{minHeight:70,background:"#fafafa",borderRight:"1px solid #f1f5f9"}}/>;
                const ds=dateStr(day);const dayEvents=eventsByDate[ds]||[];
                const isToday=ds===today;const isSel=selectedDay===ds;
                return(
                  <div key={di} onClick={()=>setSelectedDay(isSel?null:ds)}
                    style={{minHeight:70,padding:"4px",borderRight:"1px solid #f1f5f9",background:isSel?"#eff6ff":isToday?"#fefce8":"#fff",cursor:"pointer"}}>
                    <div style={{fontWeight:isToday?800:500,fontSize:".75rem",color:isToday?"#f59e0b":"#0f172a",marginBottom:2,width:22,height:22,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:"50%",background:isToday?"#fef9c3":undefined}}>{day}</div>
                    {dayEvents.slice(0,3).map((e,ei)=>(
                      <div key={ei} style={{background:e.color+"22",border:`1px solid ${e.color}44`,borderRadius:4,padding:"1px 4px",marginBottom:1,fontSize:".6rem",color:e.color,fontWeight:600,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>
                        {e.icon} {e.label}
                      </div>
                    ))}
                    {dayEvents.length>3&&<div style={{fontSize:".58rem",color:"#94a3b8",paddingLeft:2}}>+{dayEvents.length-3}</div>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        {selectedDay&&(eventsByDate[selectedDay]||[]).length>0&&(
          <div style={{marginTop:12,background:"#fff",borderRadius:12,border:"1.5px solid #3b82f633",overflow:"hidden"}}>
            <div style={{background:"#1e293b",padding:"10px 16px"}}>
              <span style={{fontWeight:700,color:"#fff",fontSize:".88rem"}}>
                Events · {new Date(selectedDay+"T00:00:00").toLocaleDateString("en-PH",{weekday:"long",month:"long",day:"numeric"})}
              </span>
            </div>
            {(eventsByDate[selectedDay]||[]).map((e,i)=>(
              <div key={i} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"10px 16px",borderBottom:i<(eventsByDate[selectedDay]||[]).length-1?"1px solid #f8fafc":""}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:e.color,flexShrink:0,marginTop:5}}/>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,color:"#0f172a",fontSize:".85rem"}}>{e.label}</div>
                  <div style={{fontSize:".72rem",color:"#64748b",marginTop:1}}>{e.sub}</div>
                </div>
                <div style={{fontSize:".68rem",fontWeight:700,color:e.color,background:e.color+"18",border:`1px solid ${e.color}44`,borderRadius:20,padding:"2px 8px",flexShrink:0}}>
                  {e.type==="end"?"End":e.type==="delivery"?"Delivery":e.type==="billing"?"Billing":"DRF"}
                </div>
              </div>
            ))}
          </div>
        )}
      </>)}

      {calTab==="thisweek"&&(
        <div>
          <div style={{fontWeight:700,color:"#0f172a",marginBottom:12}}>Next 7 Days — All Scheduled Events</div>
          {thisWeekEvents.length===0
            ?<div style={{background:"#f0fdf4",border:"1.5px solid #6ee7b7",borderRadius:12,padding:"24px",textAlign:"center",color:"#059669",fontWeight:700}}>✅ No events in the next 7 days</div>
            :thisWeekEvents.map((e,i)=>{
              const daysUntil=Math.ceil((new Date(e.date)-todayD)/(1000*60*60*24));
              return(
                <div key={i} style={{background:"#fff",borderRadius:10,border:`1.5px solid ${e.color}33`,padding:"12px 16px",marginBottom:8,display:"flex",alignItems:"center",gap:12}}>
                  <div style={{width:36,height:36,borderRadius:8,background:e.color+"20",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.1rem",flexShrink:0}}>{e.icon}</div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700,color:"#0f172a",fontSize:".88rem"}}>{e.label}</div>
                    <div style={{fontSize:".72rem",color:"#64748b",marginTop:1}}>{e.sub}</div>
                    <div style={{fontSize:".68rem",color:"#94a3b8",marginTop:2}}>{new Date(e.date+"T00:00:00").toLocaleDateString("en-PH",{weekday:"short",month:"short",day:"numeric"})}</div>
                  </div>
                  <div style={{fontSize:".72rem",fontWeight:700,color:daysUntil<=1?"#dc2626":daysUntil<=3?"#f59e0b":"#059669",background:daysUntil<=1?"#fef2f2":daysUntil<=3?"#fffbeb":"#f0fdf4",border:`1px solid ${daysUntil<=1?"#fecaca":daysUntil<=3?"#fde68a":"#6ee7b7"}`,borderRadius:20,padding:"3px 10px",flexShrink:0}}>
                    {daysUntil===0?"TODAY":daysUntil===1?"Tomorrow":daysUntil+"d away"}
                  </div>
                </div>
              );
            })
          }
        </div>
      )}

      {calTab==="conflicts"&&(
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",overflow:"hidden"}}>
            <div style={{background:conflicts.length?"#dc2626":"#059669",padding:"12px 16px"}}>
              <span style={{fontWeight:700,color:"#fff",fontSize:".9rem"}}>⚠️ Installation Conflicts ({conflicts.length})</span>
              <div style={{fontSize:".72rem",color:"rgba(255,255,255,.7)",marginTop:2}}>Same PM with 2+ projects ending within 14 days of each other</div>
            </div>
            {conflicts.length===0
              ?<div style={{padding:"20px",textAlign:"center",color:"#059669",fontSize:".85rem",fontWeight:600}}>✅ No conflicts detected</div>
              :conflicts.map((c,i)=>(
                <div key={i} style={{padding:"12px 16px",borderBottom:i<conflicts.length-1?"1px solid #f8fafc":"",background:i%2?"#fafafa":"#fff"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
                    <div>
                      <div style={{fontWeight:700,color:"#dc2626",fontSize:".85rem"}}>⚠️ {c.pm}</div>
                      <div style={{fontSize:".75rem",color:"#475569",marginTop:4}}>
                        <span style={{fontWeight:600}}>{c.p1.client}</span> ends <strong>{c.p1.endDate}</strong>
                        &nbsp;&nbsp;vs&nbsp;&nbsp;
                        <span style={{fontWeight:600}}>{c.p2.client}</span> ends <strong>{c.p2.endDate}</strong>
                      </div>
                    </div>
                    <span style={{fontSize:".72rem",fontWeight:700,color:"#dc2626",background:"#fef2f2",border:"1px solid #fecaca",borderRadius:20,padding:"3px 10px",flexShrink:0}}>
                      {c.diff===0?"Same day":c.diff+"d apart"}
                    </span>
                  </div>
                </div>
              ))
            }
          </div>
          <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",overflow:"hidden"}}>
            <div style={{background:deliveryWarnings.length?"#d97706":"#059669",padding:"12px 16px"}}>
              <span style={{fontWeight:700,color:"#fff",fontSize:".9rem"}}>📦 Delivery After Install Warnings ({deliveryWarnings.length})</span>
              <div style={{fontSize:".72rem",color:"rgba(255,255,255,.7)",marginTop:2}}>PO delivery dates scheduled AFTER project completion</div>
            </div>
            {deliveryWarnings.length===0
              ?<div style={{padding:"20px",textAlign:"center",color:"#059669",fontSize:".85rem",fontWeight:600}}>✅ All deliveries before project end dates</div>
              :deliveryWarnings.map((w,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 16px",borderBottom:i<deliveryWarnings.length-1?"1px solid #f8fafc":"",flexWrap:"wrap",gap:8}}>
                  <div>
                    <div style={{fontWeight:600,color:"#0f172a",fontSize:".85rem"}}>{w.item}</div>
                    <div style={{fontSize:".72rem",color:"#94a3b8",marginTop:2}}>{w.client}</div>
                  </div>
                  <div style={{textAlign:"right",fontSize:".75rem"}}>
                    <div style={{color:"#d97706",fontWeight:700}}>Delivery: {w.deliveryDate}</div>
                    <div style={{color:"#dc2626",fontWeight:600}}>Install ends: {w.endDate}</div>
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      )}

      {calTab==="cashflow"&&(
        <div>
          <div style={{fontWeight:700,color:"#0f172a",marginBottom:12}}>Billing Milestones — Expected Cash by Month</div>
          {cashFlowByMonth.length===0
            ?<div style={{background:"#fffbeb",border:"1.5px solid #fde68a",borderRadius:12,padding:"24px",textAlign:"center",color:"#92400e",fontWeight:600}}>No upcoming billing milestones</div>
            :(<>
              {cashFlowByMonth.map((m,i)=>{
                const maxVal=cashFlowByMonth.reduce((mx,x)=>Math.max(mx,x.expected),1);
                const pct=m.expected/maxVal*100;
                const label=new Date(m.month+"-01").toLocaleDateString("en-PH",{month:"long",year:"numeric"});
                const isCurrent=m.month===today.slice(0,7);
                return(
                  <div key={i} style={{background:"#fff",borderRadius:12,border:`1.5px solid ${isCurrent?"#10b98133":"#e2e8f0"}`,padding:"14px 18px",marginBottom:10}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                      <div>
                        <span style={{fontWeight:700,color:"#0f172a",fontSize:".9rem"}}>{label}</span>
                        {isCurrent&&<span style={{marginLeft:8,fontSize:".68rem",background:"#dcfce7",color:"#059669",border:"1px solid #6ee7b7",borderRadius:20,padding:"2px 8px",fontWeight:700}}>THIS MONTH</span>}
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.2rem",color:"#10b981"}}>₱{Math.round(m.expected).toLocaleString("en-PH",{minimumFractionDigits:0})}</div>
                        <div style={{fontSize:".68rem",color:"#94a3b8"}}>{m.count} milestone{m.count!==1?"s":""}</div>
                      </div>
                    </div>
                    <div style={{height:8,background:"#f1f5f9",borderRadius:4,overflow:"hidden"}}>
                      <div style={{height:"100%",width:pct+"%",background:"#10b981",borderRadius:4}}/>
                    </div>
                  </div>
                );
              })}
              <div style={{background:"#f8fafc",borderRadius:10,border:"1px solid #e2e8f0",padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontWeight:600,color:"#475569",fontSize:".85rem"}}>Total expected (next 6 months)</span>
                <span style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.1rem",color:"#059669"}}>₱{cashFlowByMonth.reduce((s,m)=>s+m.expected,0).toLocaleString("en-PH",{minimumFractionDigits:0})}</span>
              </div>
            </>)
          }
        </div>
      )}

      {calTab==="capacity"&&(
        <div>
          <div style={{fontWeight:700,color:"#0f172a",marginBottom:12}}>PM & Coordinator Workload</div>
          {teamCapacity.length===0
            ?<div style={{background:"#f0fdf4",border:"1.5px solid #6ee7b7",borderRadius:12,padding:"24px",textAlign:"center",color:"#059669",fontWeight:600}}>No active projects assigned</div>
            :teamCapacity.map((pm,i)=>{
              const overload=pm.projects.length>=3;
              return(
                <div key={i} style={{background:"#fff",borderRadius:12,border:`1.5px solid ${overload?"#fecaca":pm.overdue?"#fed7aa":"#e2e8f0"}`,marginBottom:10,overflow:"hidden"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 16px",background:overload?"#fef2f2":pm.overdue?"#fffbeb":"#f8fafc"}}>
                    <div>
                      <span style={{fontWeight:700,color:"#0f172a",fontSize:".88rem"}}>👷 {pm.pm}</span>
                      {overload&&<span style={{marginLeft:8,fontSize:".65rem",background:"#dc2626",color:"#fff",borderRadius:20,padding:"2px 7px",fontWeight:700}}>OVERLOADED</span>}
                      {pm.overdue>0&&!overload&&<span style={{marginLeft:8,fontSize:".65rem",background:"#f59e0b",color:"#fff",borderRadius:20,padding:"2px 7px",fontWeight:700}}>{pm.overdue} OVERDUE</span>}
                    </div>
                    <span style={{fontWeight:700,color:overload?"#dc2626":"#3b82f6",fontSize:".88rem"}}>{pm.projects.length} project{pm.projects.length!==1?"s":""}</span>
                  </div>
                  {pm.projects.map((p,j)=>(
                    <div key={j} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 16px",borderTop:"1px solid #f8fafc"}}>
                      <span style={{fontSize:".8rem",color:"#475569",fontWeight:500}}>{p.client}</span>
                      {p.endDate
                        ?<span style={{fontSize:".7rem",fontWeight:600,color:p.overdue?"#dc2626":"#059669",background:p.overdue?"#fef2f2":"#f0fdf4",border:`1px solid ${p.overdue?"#fecaca":"#6ee7b7"}`,borderRadius:20,padding:"2px 8px"}}>{p.overdue?"OVERDUE":"End: "+p.endDate}</span>
                        :<span style={{fontSize:".7rem",color:"#e2e8f0"}}>No TAT</span>
                      }
                    </div>
                  ))}
                </div>
              );
            })
          }
        </div>
      )}
    </Wrap>
  );
}

// ─── BOT SETTINGS VIEW ────────────────────────────────────────────────────────
function BotSettingsView({botSettings,saveBotSettings,sendTelegramNotification,Wrap}){
  const[form,setForm]=React.useState({token:botSettings.token||"",chatIds:{...{general:"",ops:"",design:"",procurement:"",sales:"",management:""},...(botSettings.chatIds||{})}});
  const[testing,setTesting]=React.useState(null);
  const[testResult,setTestResult]=React.useState({});
  const[saved,setSaved]=React.useState(false);

  const CHANNELS=[
    {id:"general",    label:"🌐 General",       hint:"All-team announcements"},
    {id:"ops",        label:"🏗 Operations",    hint:"PM updates, project alerts"},
    {id:"design",     label:"🎨 Design",         hint:"DRF submissions, design deadlines"},
    {id:"procurement",label:"📦 Procurement",   hint:"MRs, deliveries, swatch approvals"},
    {id:"sales",      label:"💼 Sales",          hint:"Swatch approvals, deal updates"},
    {id:"management", label:"👔 Management",    hint:"High-level overdue alerts only"},
  ];

  const testChannel=async(chId)=>{
    setTesting(chId);
    const token=form.token;const chatId=form.chatIds?.[chId];
    if(!token||!chatId){setTestResult(r=>({...r,[chId]:{ok:false,msg:"Token or Chat ID missing"}}));setTesting(null);return;}
    try{
      const res=await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({chat_id:chatId,text:`🤖 <b>FabHub Test</b>\nChannel: <b>${chId}</b>\nBot is live! ✅`,parse_mode:"HTML"})
      });
      const json=await res.json();
      setTestResult(r=>({...r,[chId]:json.ok?{ok:true,msg:"✅ Message sent!"}:{ok:false,msg:"❌ "+json.description}}));
    }catch(e){setTestResult(r=>({...r,[chId]:{ok:false,msg:"❌ Network error"}}));}
    setTesting(null);
  };

  const doSave=()=>{saveBotSettings(form);setSaved(true);setTimeout(()=>setSaved(false),2500);};

  return(
    <Wrap>
      <div style={{maxWidth:660,margin:"0 auto"}}>
        <h2 style={{margin:"0 0 4px",fontWeight:900,fontSize:"1.4rem",color:"#0f172a",fontFamily:"'Barlow Condensed',sans-serif"}}>🤖 Telegram Bot Settings</h2>
        <p style={{margin:"0 0 20px",fontSize:".8rem",color:"#64748b"}}>Connect FabHub to your Telegram groups for instant notifications on key events.</p>

        <div style={{background:"#eff6ff",border:"1.5px solid #93c5fd",borderRadius:12,padding:"14px 18px",marginBottom:20}}>
          <div style={{fontWeight:700,color:"#1d4ed8",marginBottom:6,fontSize:".85rem"}}>⚡ 4-Step Setup</div>
          <ol style={{margin:0,paddingLeft:18,fontSize:".78rem",color:"#1e40af",lineHeight:1.75}}>
            <li>Message <strong>@BotFather</strong> on Telegram → /newbot → copy the API token</li>
            <li>Create a Telegram group for each department and add the bot as <strong>admin</strong></li>
            <li>Send any message in each group, then open: <code style={{background:"#dbeafe",padding:"1px 5px",borderRadius:3}}>api.telegram.org/bot[TOKEN]/getUpdates</code></li>
            <li>Find the <code>chat.id</code> (negative number) and paste it below</li>
          </ol>
        </div>

        <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",padding:"18px",marginBottom:16}}>
          <div style={{fontWeight:700,color:"#0f172a",marginBottom:8}}>🔑 Bot Token</div>
          <input type="password" value={form.token||""} onChange={e=>setForm(f=>({...f,token:e.target.value}))} placeholder="7123456789:AAH9g3kXXX..."
            style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"9px 12px",fontFamily:"inherit",fontSize:".85rem",color:"#0f172a",boxSizing:"border-box"}}/>
          <div style={{fontSize:".7rem",color:"#94a3b8",marginTop:4}}>Keep this private. Never share it.</div>
        </div>

        <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",padding:"18px",marginBottom:16}}>
          <div style={{fontWeight:700,color:"#0f172a",marginBottom:14}}>📢 Department Group Chat IDs</div>
          {CHANNELS.map(ch=>(
            <div key={ch.id} style={{marginBottom:16}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                <div>
                  <div style={{fontWeight:600,color:"#475569",fontSize:".82rem"}}>{ch.label}</div>
                  <div style={{fontSize:".68rem",color:"#94a3b8"}}>{ch.hint}</div>
                </div>
                <button onClick={()=>testChannel(ch.id)} disabled={testing===ch.id}
                  style={{background:"#f1f5f9",border:"1.5px solid #e2e8f0",borderRadius:7,padding:"5px 12px",fontFamily:"inherit",fontWeight:600,fontSize:".72rem",color:"#475569",cursor:"pointer",opacity:testing===ch.id?.5:1}}>
                  {testing===ch.id?"Testing...":"Test →"}
                </button>
              </div>
              <input value={form.chatIds?.[ch.id]||""} onChange={e=>setForm(f=>({...f,chatIds:{...(f.chatIds||{}),[ch.id]:e.target.value}}))} placeholder="-100123456789"
                style={{width:"100%",border:`1.5px solid ${testResult[ch.id]?.ok?"#6ee7b7":testResult[ch.id]?.ok===false?"#fecaca":"#e2e8f0"}`,borderRadius:8,padding:"8px 12px",fontFamily:"inherit",fontSize:".82rem",color:"#0f172a",boxSizing:"border-box"}}/>
              {testResult[ch.id]&&<div style={{fontSize:".72rem",marginTop:4,color:testResult[ch.id].ok?"#059669":"#dc2626",fontWeight:600}}>{testResult[ch.id].msg}</div>}
            </div>
          ))}
        </div>

        <div style={{background:"#f8fafc",borderRadius:12,border:"1.5px solid #e2e8f0",padding:"16px",marginBottom:20}}>
          <div style={{fontWeight:700,color:"#0f172a",marginBottom:10}}>🔔 What Gets Notified</div>
          {[
            {icon:"🏆",label:"Project awarded / JO issued",ch:"ALL departments"},
            {icon:"📝",label:"PM Update logged",ch:"Operations"},
            {icon:"📋",label:"New Design Request (DRF) submitted",ch:"Design"},
            {icon:"📦",label:"Delivery received by Warehouse",ch:"Procurement"},
            {icon:"🔧",label:"New Material Request submitted",ch:"Procurement"},
            {icon:"✅",label:"PO approved (status → PO Issued)",ch:"Procurement"},
            {icon:"✅",label:"Swatch client-approved",ch:"Procurement + Sales"},
            {icon:"⚠️",label:"Scope change / addendum logged",ch:"Sales + Management"},
            {icon:"💰",label:"Budget request submitted",ch:"Management"},
          ].map((t,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 0",borderBottom:i<4?"1px solid #e2e8f0":""}}>
              <span style={{fontSize:".9rem"}}>{t.icon}</span>
              <div style={{flex:1}}>
                <div style={{fontSize:".78rem",color:"#0f172a",fontWeight:500}}>{t.label}</div>
                <div style={{fontSize:".68rem",color:"#94a3b8"}}>→ {t.ch}</div>
              </div>
              <span style={{fontSize:".62rem",background:"#dcfce7",color:"#059669",border:"1px solid #6ee7b7",borderRadius:20,padding:"2px 7px",fontWeight:700}}>ACTIVE</span>
            </div>
          ))}
        </div>

        <button onClick={doSave}
          style={{background:saved?"#059669":"#1e293b",border:"none",borderRadius:10,padding:"12px 28px",color:"#fff",fontFamily:"inherit",fontWeight:700,fontSize:".88rem",cursor:"pointer",width:"100%",transition:"background .3s"}}>
          {saved?"✅ Settings Saved!":"💾 Save Bot Settings"}
        </button>
      </div>
    </Wrap>
  );
}

// ─── DATA MANAGEMENT (Manager Only) ──────────────────────────────────────────
function DataManagement({
  deals,exps,inflows,jos,prs,mreqs,breqs,addenda,billings,pcards,checklist,
  cashPositions,actLog,budgets,
  upDeals,upExps,upInflows,upJos,upPrs,upMreqs,upBreqs,upAddenda,
  upBillings,upPcards,upChecklist,upCashPos,setActLog,upBudgets,persist
}){
  const[confirmPurge,setConfirmPurge]=useState(null); // holds purge config
  const[purgeWord,setPurgeWord]=useState("");
  const[purgeResult,setPurgeResult]=useState(null);

  const PURGE_WORD = "PURGE";

  // Data counts for summary
  const counts = {
    "Deals / Pipeline":    deals.length,
    "Expenses":            exps.length,
    "Inflows":             inflows.length,
    "Job Orders":          jos.length,
    "Purchase Requests":   prs.length,
    "Material Requests":   mreqs.length,
    "Budget Requests":     breqs.length,
    "Addenda":             addenda.length,
    "Billing Milestones":  billings.length,
    "Project Cards":       Object.keys(pcards).length,
    "Checklist Items":     checklist.length,
    "Cash Position Days":  Object.keys(cashPositions).length,
    "Activity Log":        actLog.length,
  };

  const totalRecords = Object.values(counts).reduce((s,v)=>s+v,0);

  // Purge options
  const PURGE_OPTIONS = [
    {
      key:"all_transactions",
      label:"🧹 Full Purge — Go Live Clean",
      desc:"Removes ALL transaction data. Keeps users, clients, and system settings. Use this when you're ready to start for real.",
      color:"#dc2626",
      bgColor:"#fef2f2",
      borderColor:"#fecaca",
      items:["Deals / Pipeline","Expenses","Inflows","Job Orders","Purchase Requests","Material Requests","Budget Requests","Addenda","Billing Milestones","Project Cards","Checklist Items","Cash Position Days","Activity Log"],
      action:()=>{
        upDeals(()=>[]);upExps(()=>[]);upInflows(()=>[]);upJos(()=>[]);
        upPrs(()=>[]);upMreqs(()=>[]);upBreqs(()=>[]);upAddenda(()=>[]);
        upBillings(()=>[]);upPcards(()=>({}));upChecklist(()=>[]);
        upCashPos(()=>({}));upBudgets(()=>({}));
        setActLog([]);persist("gmdv5:actlog",[]);
        return "Full purge complete. FabHub is clean and ready for real data.";
      }
    },
    {
      key:"deals_only",
      label:"🗑 Clear Pipeline Only",
      desc:"Removes all deals, project cards, JOs, checklists, addenda. Keeps expenses, billing, and cash position.",
      color:"#f59e0b",
      bgColor:"#fffbeb",
      borderColor:"#fde68a",
      items:["Deals / Pipeline","Job Orders","Project Cards","Checklist Items","Addenda"],
      action:()=>{
        upDeals(()=>[]);upJos(()=>[]);upPcards(()=>({}));
        upChecklist(()=>[]);upAddenda(()=>[]);
        return "Pipeline cleared. Expenses, billing, and cash position preserved.";
      }
    },
    {
      key:"finance_only",
      label:"🗑 Clear Finance Data Only",
      desc:"Removes expenses, inflows, billing milestones, and cash position history. Pipeline and project cards untouched.",
      color:"#3b82f6",
      bgColor:"#eff6ff",
      borderColor:"#93c5fd",
      items:["Expenses","Inflows","Billing Milestones","Cash Position Days"],
      action:()=>{
        upExps(()=>[]);upInflows(()=>[]);upBillings(()=>[]);upCashPos(()=>({}));
        return "Finance data cleared. Pipeline and projects untouched.";
      }
    },
    {
      key:"procurement_only",
      label:"🗑 Clear Procurement Only",
      desc:"Removes all PRs, MRs, and Budget Requests. Deals and billing untouched.",
      color:"#06b6d4",
      bgColor:"#ecfeff",
      borderColor:"#a5f3fc",
      items:["Purchase Requests","Material Requests","Budget Requests"],
      action:()=>{
        upPrs(()=>[]);upMreqs(()=>[]);upBreqs(()=>[]);
        return "Procurement data cleared.";
      }
    },
    {
      key:"log_only",
      label:"🗑 Clear Activity Log Only",
      desc:"Clears the activity feed. No other data affected.",
      color:"#6b7280",
      bgColor:"#f9fafb",
      borderColor:"#e5e7eb",
      items:["Activity Log"],
      action:()=>{
        setActLog([]);persist("gmdv5:actlog",[]);
        return "Activity log cleared.";
      }
    },
  ];

  const executePurge=()=>{
    if(purgeWord!==PURGE_WORD) return;
    const opt=PURGE_OPTIONS.find(o=>o.key===confirmPurge);
    if(!opt) return;
    const msg=opt.action();
    setPurgeResult(msg);
    setConfirmPurge(null);
    setPurgeWord("");
  };

  return(
    <div>
      {/* Header */}
      <div style={{marginBottom:24}}>
        <h2 style={{margin:0,fontWeight:800,color:"#0f172a",fontSize:"1.15rem"}}>⚙ Data Management</h2>
        <div style={{fontSize:".75rem",color:"#94a3b8",marginTop:3}}>Manager only — surgical delete and purge controls</div>
      </div>

      {/* Success banner */}
      {purgeResult&&(
        <div style={{background:"#f0fdf4",border:"1.5px solid #6ee7b7",borderRadius:12,padding:"12px 18px",marginBottom:20,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontWeight:700,color:"#059669"}}> ✅ {purgeResult}</span>
          <button onClick={()=>setPurgeResult(null)} style={{background:"none",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:"1rem"}}>✕</button>
        </div>
      )}

      {/* Current data summary */}
      <div style={{background:"#fff",borderRadius:14,border:"1.5px solid #e2e8f0",padding:"18px 20px",marginBottom:20}}>
        <div style={{fontWeight:700,color:"#0f172a",marginBottom:14,fontSize:".9rem"}}>Current Data Summary</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:14}}>
          {Object.entries(counts).map(([label,count])=>(
            <div key={label} style={{display:"flex",justifyContent:"space-between",padding:"7px 12px",background:count>0?"#f8fafc":"#fff",borderRadius:8,border:"1px solid #f1f5f9"}}>
              <span style={{fontSize:".78rem",color:"#475569"}}>{label}</span>
              <span style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:".95rem",color:count>0?"#0f172a":"#cbd5e1"}}>{count}</span>
            </div>
          ))}
        </div>
        <div style={{borderTop:"1px solid #f1f5f9",paddingTop:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:".82rem",color:"#64748b"}}>Total records in system</span>
          <span style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.1rem",color:"#0f172a"}}>{totalRecords.toLocaleString()}</span>
        </div>
        <div style={{marginTop:8,fontSize:".72rem",color:"#94a3b8",fontStyle:"italic"}}>
          🔒 Protected (never deleted): {22} team members · 207 GMD clients · System configuration
        </div>
      </div>

      {/* Purge options */}
      <div style={{marginBottom:12,fontWeight:700,color:"#dc2626",fontSize:".88rem"}}>⚠️ Purge Controls — These actions are permanent and cannot be undone</div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {PURGE_OPTIONS.map(opt=>(
          <div key={opt.key} style={{background:opt.bgColor,border:`1.5px solid ${opt.borderColor}`,borderRadius:12,padding:"16px 20px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,flexWrap:"wrap"}}>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,color:opt.color,fontSize:".9rem",marginBottom:4}}>{opt.label}</div>
                <div style={{fontSize:".78rem",color:"#475569",marginBottom:8}}>{opt.desc}</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {opt.items.map(item=>(
                    <span key={item} style={{fontSize:".68rem",background:"rgba(0,0,0,.06)",color:"#475569",padding:"1px 9px",borderRadius:20}}>
                      {item} ({counts[item]||0})
                    </span>
                  ))}
                </div>
              </div>
              <button onClick={()=>{setConfirmPurge(opt.key);setPurgeWord("");}}
                style={{background:opt.color,border:"none",borderRadius:9,padding:"8px 18px",fontFamily:"inherit",fontWeight:700,fontSize:".82rem",color:"#fff",cursor:"pointer",flexShrink:0}}>
                Purge →
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Confirm purge modal */}
      {confirmPurge&&(()=>{
        const opt=PURGE_OPTIONS.find(o=>o.key===confirmPurge);
        return(
          <Modal open title="⚠️ Confirm Purge" onClose={()=>{setConfirmPurge(null);setPurgeWord("");}}>
            <div style={{background:"#fef2f2",border:"1.5px solid #fecaca",borderRadius:10,padding:"14px 16px",marginBottom:18}}>
              <div style={{fontWeight:700,color:"#dc2626",marginBottom:6}}>{opt.label}</div>
              <div style={{fontSize:".82rem",color:"#7f1d1d"}}>{opt.desc}</div>
            </div>
            <div style={{fontSize:".85rem",color:"#0f172a",marginBottom:12}}>
              This will permanently delete <strong>{opt.items.reduce((s,i)=>s+(counts[i]||0),0)} records</strong>. This cannot be undone.
            </div>
            <div style={{fontSize:".85rem",color:"#0f172a",marginBottom:8}}>
              Type <strong style={{color:"#dc2626",letterSpacing:"2px"}}>{PURGE_WORD}</strong> to confirm:
            </div>
            <input
              type="text"
              value={purgeWord}
              onChange={e=>setPurgeWord(e.target.value.toUpperCase())}
              placeholder={`Type ${PURGE_WORD} to confirm`}
              autoFocus
              style={{width:"100%",border:`2px solid ${purgeWord===PURGE_WORD?"#10b981":"#e2e8f0"}`,borderRadius:8,padding:"10px 14px",fontFamily:"inherit",fontSize:"1rem",fontWeight:700,letterSpacing:"3px",color:"#dc2626",boxSizing:"border-box",outline:"none",textTransform:"uppercase",marginBottom:16}}
            />
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>{setConfirmPurge(null);setPurgeWord("");}}
                style={{flex:1,background:"#f1f5f9",border:"none",borderRadius:9,padding:"10px",fontFamily:"inherit",fontWeight:600,fontSize:".85rem",color:"#475569",cursor:"pointer"}}>
                Cancel — Keep Data
              </button>
              <button onClick={executePurge} disabled={purgeWord!==PURGE_WORD}
                style={{flex:1,background:purgeWord===PURGE_WORD?"#dc2626":"#e2e8f0",border:"none",borderRadius:9,padding:"10px",fontFamily:"inherit",fontWeight:700,fontSize:".85rem",color:purgeWord===PURGE_WORD?"#fff":"#94a3b8",cursor:purgeWord===PURGE_WORD?"pointer":"not-allowed"}}>
                ✓ Confirm Purge
              </button>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}
  const printJO=(jo)=>{
    const d=deals.find(x=>x.id===jo.dealId)||{};
    const win=window.open("","_blank");
    win.document.write(`<!DOCTYPE html><html><head><title>Job Order ${jo.joNo||jo.joNum}</title>
    <style>
      body{font-family:Arial,sans-serif;margin:40px;color:#1e293b;font-size:13px;}
      .hdr{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:16px;border-bottom:3px solid #1e293b;margin-bottom:24px;}
      .logo{font-size:24px;font-weight:900;letter-spacing:-1px;}
      .logo span{color:#f59e0b;}
      .jo-no{font-size:20px;font-weight:900;color:#1e293b;}
      .section{margin-bottom:20px;}
      .section-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;margin-bottom:8px;border-bottom:1px solid #e2e8f0;padding-bottom:4px;}
      .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
      .field label{font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:2px;}
      .field span{font-size:13px;color:#0f172a;font-weight:600;}
      .scope-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:12px;font-size:13px;line-height:1.6;min-height:60px;}
      .pm-badge{display:inline-block;background:#eff6ff;color:#1d4ed8;border:1px solid #93c5fd;border-radius:20px;padding:3px 12px;font-weight:700;font-size:12px;margin:2px;}
      .status{display:inline-block;background:#f0fdf4;color:#059669;border:1px solid #6ee7b7;border-radius:20px;padding:4px 14px;font-weight:700;font-size:12px;}
      .footer{margin-top:40px;padding-top:16px;border-top:1px solid #e2e8f0;display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;}
      .sig-box{text-align:center;}
      .sig-line{border-top:1px solid #1e293b;margin-top:40px;padding-top:6px;font-size:11px;color:#64748b;}
      @media print{button{display:none;}}
    </style></head><body>
    <div class="hdr">
      <div>
        <div class="logo">GMD <span>PROD</span></div>
        <div style="color:#64748b;font-size:11px;margin-top:4px;">GMD Productions Inc. · TIN: 010-063-229-00000</div>
        <div style="color:#64748b;font-size:11px;">32 Unit-H Santan St., Fortune, Marikina City</div>
      </div>
      <div style="text-align:right">
        <div class="jo-no">JOB ORDER</div>
        <div style="font-size:18px;font-weight:800;color:#f59e0b;">${jo.joNo||jo.joNum||"JO-XXXX"}</div>
        <div style="font-size:12px;color:#64748b;margin-top:4px;">Issued: ${jo.issuedDate||jo.dateIssued||""}</div>
        <div class="status" style="margin-top:6px;">${jo.status||"Active"}</div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Project Details</div>
      <div class="grid">
        <div class="field"><label>Client</label><span>${jo.client||d.client||"—"}</span></div>
        <div class="field"><label>CE Number</label><span>${jo.ceNo||d.ceNo||"—"}</span></div>
        <div class="field"><label>Project Name</label><span>${jo.projectName||d.contact||"—"}</span></div>
        <div class="field"><label>CE Type</label><span>${jo.ceType||d.ceType||"—"} ${jo.product||d.product?("· "+(jo.product||d.product)):"" }</span></div>
        <div class="field"><label>Contract Value</label><span>₱${(jo.value||d.value||0).toLocaleString("en-PH")}</span></div>
        <div class="field"><label>Award Trigger</label><span>${jo.awardTrigger||"—"} ${jo.triggerDate?("· "+jo.triggerDate):""}</span></div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Team Assignment</div>
      <div class="grid">
        <div class="field">
          <label>Project Manager(s)</label>
          <div>${[jo.pm1,jo.pm2,jo.pm3].filter(Boolean).map(pm=>'<span class="pm-badge">'+pm+'</span>').join("")||'<span style="color:#94a3b8">Not assigned</span>'}</div>
        </div>
        <div class="field">
          <label>Coordinator</label>
          <span>${jo.coordinator||"—"}</span>
        </div>
        <div class="field"><label>Account Executive</label><span>${jo.aeAssigned||d.salesOwner||"—"}</span></div>
        <div class="field"><label>Target Opening</label><span>${jo.startDate||"—"}</span></div>
      </div>
      ${jo.commsLink?('<div style="margin-top:10px"><div class="field"><label>Comms Group</label><a href="'+jo.commsLink+'" style="color:#3b82f6">'+jo.commsLink+'</a></div></div>'):""}
    </div>

    <div class="section">
      <div class="section-title">Scope of Work</div>
      <div class="scope-box">${(jo.scopeNotes||"").replace(/\n/g,"<br/>")}</div>\n'
    </div>

    ${jo.specialInstructions?'<div class="section"><div class="section-title">Special Instructions / Venue Requirements</div><div class="scope-box" style="background:#fffbeb;border-color:#fde68a;">'+(jo.specialInstructions||"").replace(/\\n/g,"<br/>")+'</div></div>':""}

    <div style="background:#eff6ff;border:1px solid #93c5fd;border-radius:8px;padding:12px;margin-bottom:20px;font-size:12px;color:#1d4ed8;">
      <strong>Budget Status:</strong> ${jo.budgetStatus||"QS Budget Pending"} &nbsp;·&nbsp;
      <strong>Issued by:</strong> ${jo.issuedBy||"Manager"} &nbsp;·&nbsp;
      <strong>Date:</strong> ${jo.issuedDate||jo.dateIssued||""}
    </div>

    <div class="footer">
      <div class="sig-box"><div class="sig-line">Prepared by / Account Executive</div></div>
      <div class="sig-box"><div class="sig-line">Project Manager</div></div>
      <div class="sig-box"><div class="sig-line">Approved by / Director</div></div>
    </div>

    <div style="text-align:center;margin-top:30px;">
      <button onclick="window.print()" style="padding:10px 24px;background:#1e293b;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:700;">🖨 Print / Save as PDF</button>
    </div>
    </body></html>`);
    win.document.close();
  };

// ─── SUPPLIER MASTER VIEW ──────────────────────────────────────────────────────
const SUPPLIER_RATINGS = ["5 - EXCELLENT AND RELIABLE","4 - GOOD","3 - ACCEPTABLE","2 - MODERATE","1 - POOR"];
const PAYMENT_TERMS_OPTS = ["Cash Basis","7 Days","15 Days","30 Days","30-45 Days","45 Days","60 Days","90 Days","Terms"];

function SupplierMasterView({suppliers,addSupplier,updateSupplier,deleteSupplier,session,role}){
  const[showForm,setShowForm]=useState(false);
  const[editId,setEditId]=useState(null);
  const emptySupplier=()=>({rating:"4 - GOOD",companyName:"",email:"",materials:"",contactNos:"",contactPerson:"",paymentTerms:"Cash Basis",address:"",tinNo:"",notes:"",status:"Active"});
  const[form,setForm]=useState(emptySupplier());
  const[search,setSearch]=useState("");
  const[filterRating,setFilterRating]=useState("all");
  const[filterMat,setFilterMat]=useState("all");

  const f=(k,v)=>setForm(p=>({...p,[k]:v}));
  const canEdit=role==="Manager"||role==="Procurement";

  const filtered=useMemo(()=>{
    let list=suppliers;
    if(filterRating!=="all") list=list.filter(s=>s.rating===filterRating);
    if(filterMat!=="all") list=list.filter(s=>(s.materials||"").toLowerCase().includes(filterMat.toLowerCase()));
    if(search){const q=search.toLowerCase();list=list.filter(s=>(s.companyName||"").toLowerCase().includes(q)||(s.materials||"").toLowerCase().includes(q)||(s.contactPerson||"").toLowerCase().includes(q));}
    return list.slice().sort((a,b)=>{const ra=a.rating?parseInt(a.rating):0,rb=b.rating?parseInt(b.rating):0;return rb-ra;});
  },[suppliers,filterRating,filterMat,search]);

  const ratingClr={
    "5 - EXCELLENT AND RELIABLE":"#059669",
    "4 - GOOD":"#3b82f6",
    "3 - ACCEPTABLE":"#f59e0b",
    "2 - MODERATE":"#f97316",
    "1 - POOR":"#ef4444",
  };

  const openEdit=(s)=>{setForm({...s,companyName:s.companyName||s.company_name||""});setEditId(s.id);setShowForm(true);};
  const openNew=()=>{setForm(emptySupplier());setEditId(null);setShowForm(true);};
  const save=()=>{
    if(!form.companyName) return;
    if(editId) updateSupplier(editId,form);
    else addSupplier(form);
    setShowForm(false);setEditId(null);
  };

  const topMat=[...new Set(suppliers.map(s=>s.materials).filter(Boolean))].sort();

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:12}}>
        <div>
          <h2 style={{margin:0,fontWeight:800,color:"#0f172a",fontSize:"1.15rem"}}>🏭 Supplier Master List</h2>
          <div style={{fontSize:".75rem",color:"#64748b",marginTop:2}}>Approved vendors — rated, categorized, and ready to quote</div>
        </div>
        {canEdit&&<button onClick={openNew} style={{background:"#1e293b",border:"none",borderRadius:10,padding:"9px 18px",fontFamily:"inherit",fontWeight:700,fontSize:".84rem",color:"#fff",cursor:"pointer"}}>+ Add Supplier</button>}
      </div>

      {/* KPIs */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:16}}>
        {[
          {l:"Total Suppliers",v:suppliers.length,c:"#3b82f6"},
          {l:"Excellent & Reliable",v:suppliers.filter(s=>s.rating&&s.rating.startsWith("5")).length,c:"#059669"},
          {l:"Good",v:suppliers.filter(s=>s.rating&&s.rating.startsWith("4")).length,c:"#3b82f6"},
          {l:"Acceptable or Below",v:suppliers.filter(s=>s.rating&&!s.rating.startsWith("5")&&!s.rating.startsWith("4")).length,c:"#f59e0b"},
        ].map(({l,v,c})=>(
          <div key={l} style={{background:"#fff",borderRadius:12,padding:"14px 16px",border:"1.5px solid #e2e8f0"}}>
            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.3rem",color:c}}>{v}</div>
            <div style={{fontSize:".63rem",textTransform:"uppercase",letterSpacing:"1px",color:"#94a3b8",marginTop:5}}>{l}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
        <FInp value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search supplier, material, contact…"
          style={{flex:1,minWidth:200,border:"1.5px solid #e2e8f0",borderRadius:8,padding:"8px 13px",fontFamily:"inherit",fontSize:".84rem",color:"#0f172a"}}/>
        <select value={filterRating} onChange={e=>setFilterRating(e.target.value)}
          style={{border:"1.5px solid #e2e8f0",borderRadius:8,padding:"8px 12px",fontFamily:"inherit",fontSize:".8rem",color:"#0f172a",background:"#fff",cursor:"pointer"}}>
          <option value="all">All Ratings</option>
          {SUPPLIER_RATINGS.map(r=><option key={r}>{r}</option>)}
        </select>
        <select value={filterMat} onChange={e=>setFilterMat(e.target.value)}
          style={{border:"1.5px solid #e2e8f0",borderRadius:8,padding:"8px 12px",fontFamily:"inherit",fontSize:".8rem",color:"#0f172a",background:"#fff",cursor:"pointer"}}>
          <option value="all">All Materials</option>
          {topMat.slice(0,20).map(m=><option key={m}>{m}</option>)}
        </select>
      </div>

      {/* Add/Edit Form */}
      {showForm&&canEdit&&(
        <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",padding:18,marginBottom:16,boxShadow:"0 4px 16px rgba(0,0,0,.06)"}}>
          <div style={{fontWeight:800,color:"#0f172a",marginBottom:14}}>{editId?"Edit Supplier":"Add Supplier"}</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            <div style={{gridColumn:"1/-1"}}><Fld label="Company Name" required><Inp value={form.companyName} onChange={e=>f("companyName",e.target.value)} placeholder="Company name"/></Fld></div>
            <Fld label="Rating"><Sel value={form.rating} onChange={e=>f("rating",e.target.value)}>{SUPPLIER_RATINGS.map(r=><option key={r}>{r}</option>)}</Sel></Fld>
            <Fld label="Materials Supplied"><Inp value={form.materials} onChange={e=>f("materials",e.target.value)} placeholder="e.g. Assorted Construction Supply"/></Fld>
            <Fld label="Email"><Inp type="email" value={form.email} onChange={e=>f("email",e.target.value)} placeholder="email@example.com"/></Fld>
            <Fld label="Contact Nos."><Inp value={form.contactNos} onChange={e=>f("contactNos",e.target.value)} placeholder="e.g. 941-0000 / 09XX-XXX-XXXX"/></Fld>
            <Fld label="Contact Person"><Inp value={form.contactPerson} onChange={e=>f("contactPerson",e.target.value)} placeholder="e.g. Ms. Maria"/></Fld>
            <Fld label="Payment Terms"><Sel value={form.paymentTerms} onChange={e=>f("paymentTerms",e.target.value)}>{PAYMENT_TERMS_OPTS.map(p=><option key={p}>{p}</option>)}</Sel></Fld>
            <Fld label="TIN No."><Inp value={form.tinNo} onChange={e=>f("tinNo",e.target.value)} placeholder="XXX-XXX-XXX-000"/></Fld>
            <div style={{gridColumn:"1/-1"}}><Fld label="Address"><Inp value={form.address} onChange={e=>f("address",e.target.value)} placeholder="Full address"/></Fld></div>
            <div style={{gridColumn:"1/-1"}}><Fld label="Notes"><Inp rows={2} value={form.notes} onChange={e=>f("notes",e.target.value)} placeholder="Payment method, special instructions…"/></Fld></div>
          </div>
          <div style={{display:"flex",gap:10,marginTop:14}}>
            <button onClick={save} disabled={!form.companyName} style={{background:form.companyName?"#1e293b":"#e2e8f0",border:"none",borderRadius:9,padding:"10px 22px",fontFamily:"inherit",fontWeight:700,fontSize:".87rem",color:form.companyName?"#fff":"#94a3b8",cursor:form.companyName?"pointer":"not-allowed"}}>{editId?"Save Changes":"Add Supplier"}</button>
            <button onClick={()=>{setShowForm(false);setEditId(null);}} style={{background:"transparent",border:"1.5px solid #e2e8f0",borderRadius:9,padding:"10px 18px",fontFamily:"inherit",fontWeight:600,fontSize:".84rem",color:"#64748b",cursor:"pointer"}}>Cancel</button>
          </div>
        </div>
      )}

      {suppliers.length===0&&<div style={{textAlign:"center",padding:"32px 0",color:"#94a3b8",fontSize:".84rem"}}>No suppliers yet. Add your first supplier above.</div>}

      {/* List */}
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {filtered.map(s=>{
          const clr=ratingClr[s.rating]||"#94a3b8";
          return(
            <div key={s.id} style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",padding:"14px 18px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,flexWrap:"wrap"}}>
                <div style={{flex:1}}>
                  <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginBottom:4}}>
                    <span style={{fontSize:".68rem",fontWeight:700,color:clr,background:clr+"1a",padding:"2px 8px",borderRadius:20}}>{s.rating||"—"}</span>
                    <span style={{fontWeight:700,color:"#0f172a",fontSize:".92rem"}}>{s.companyName||s.company_name}</span>
                  </div>
                  <div style={{display:"flex",gap:16,flexWrap:"wrap",fontSize:".78rem",color:"#64748b",marginBottom:s.address?4:0}}>
                    {(s.materials)&&<span>📦 {s.materials}</span>}
                    {(s.contactPerson||s.contact_person)&&<span>👤 {s.contactPerson||s.contact_person}</span>}
                    {(s.contactNos||s.contact_nos)&&<span>📞 {s.contactNos||s.contact_nos}</span>}
                    {(s.email)&&<span>✉ {s.email}</span>}
                    {(s.paymentTerms||s.payment_terms)&&<span style={{background:"#f0fdf4",color:"#166534",padding:"1px 8px",borderRadius:10,fontWeight:600}}>💳 {s.paymentTerms||s.payment_terms}</span>}
                    {(s.tinNo||s.tin_no)&&<span>TIN: {s.tinNo||s.tin_no}</span>}
                  </div>
                  {(s.address)&&<div style={{fontSize:".75rem",color:"#94a3b8",marginTop:2}}>📍 {s.address}</div>}
                  {(s.notes)&&<div style={{fontSize:".75rem",color:"#92400e",background:"#fffbeb",borderRadius:6,padding:"3px 8px",marginTop:4,display:"inline-block"}}>📝 {s.notes}</div>}
                </div>
                {canEdit&&(
                  <div style={{display:"flex",gap:6,flexShrink:0}}>
                    <button onClick={()=>openEdit(s)} style={{background:"#f1f5f9",border:"none",borderRadius:7,padding:"5px 11px",fontSize:".73rem",color:"#475569",cursor:"pointer",fontWeight:600,fontFamily:"inherit"}}>✏</button>
                    <button onClick={()=>{if(window.confirm("Remove this supplier?"))deleteSupplier(s.id);}} style={{background:"#fef2f2",border:"none",borderRadius:7,padding:"5px 11px",fontSize:".73rem",color:"#dc2626",cursor:"pointer",fontWeight:600,fontFamily:"inherit"}}>✕</button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── SUBCONTRACTOR MASTER VIEW ──────────────────────────────────────────────────
const SUBCON_RATINGS=["YES - ACCEPTABLE","NO","PROBATIONARY"];
const SUBCON_SPECIALTIES=["General Works","Electrical (Install only)","Stone Works (Supply & Install)","Metal Works (Supply & Install)","Tile Works","Glass Works","Painting","Plumbing","Carpentry","HVAC","Other"];

function SubconMasterView({subcons,addSubcon,updateSubcon,deleteSubcon,session,role}){
  const[showForm,setShowForm]=useState(false);
  const[editId,setEditId]=useState(null);
  const emptySubcon=()=>({rating:"YES - ACCEPTABLE",specialty:"General Works",strengthsWeaknesses:"",contactNo:"",companyName:"",paymentTerms:"Cash Basis",address:"",remarks:"",rateStructure:"Project Rate",paymentStructure:"50% Start/50% Completion",locationNote:"",notes:"",status:"Active"});
  const[form,setForm]=useState(emptySubcon());
  const[search,setSearch]=useState("");
  const[filterSpecialty,setFilterSpecialty]=useState("all");
  const[filterRating,setFilterRating]=useState("all");

  const f=(k,v)=>setForm(p=>({...p,[k]:v}));
  const canEdit=role==="Manager"||role==="Procurement"||role==="Operations";

  const filtered=useMemo(()=>{
    let list=subcons;
    if(filterRating!=="all") list=list.filter(s=>s.rating===filterRating);
    if(filterSpecialty!=="all") list=list.filter(s=>s.specialty===filterSpecialty);
    if(search){const q=search.toLowerCase();list=list.filter(s=>(s.companyName||"").toLowerCase().includes(q)||(s.specialty||"").toLowerCase().includes(q)||(s.contactNo||"").toLowerCase().includes(q));}
    return list;
  },[subcons,filterRating,filterSpecialty,search]);

  const openEdit=(s)=>{setForm({...s,companyName:s.companyName||s.company_name||"",strengthsWeaknesses:s.strengthsWeaknesses||s.strengths_weaknesses||"",contactNo:s.contactNo||s.contact_no||"",paymentTerms:s.paymentTerms||s.payment_terms||"Cash Basis",rateStructure:s.rateStructure||s.rate_structure||"Project Rate",paymentStructure:s.paymentStructure||s.payment_structure||"50% Start/50% Completion",locationNote:s.locationNote||s.location_note||""});setEditId(s.id);setShowForm(true);};
  const openNew=()=>{setForm(emptySubcon());setEditId(null);setShowForm(true);};
  const save=()=>{
    if(!form.companyName) return;
    if(editId) updateSubcon(editId,form);
    else addSubcon(form);
    setShowForm(false);setEditId(null);
  };

  const specialties=[...new Set(subcons.map(s=>s.specialty).filter(Boolean)),...SUBCON_SPECIALTIES].filter((v,i,a)=>a.indexOf(v)===i);

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:12}}>
        <div>
          <h2 style={{margin:0,fontWeight:800,color:"#0f172a",fontSize:"1.15rem"}}>👷 Subcontractor Master List</h2>
          <div style={{fontSize:".75rem",color:"#64748b",marginTop:2}}>Approved subcons — rated by specialty and performance</div>
        </div>
        {canEdit&&<button onClick={openNew} style={{background:"#1e293b",border:"none",borderRadius:10,padding:"9px 18px",fontFamily:"inherit",fontWeight:700,fontSize:".84rem",color:"#fff",cursor:"pointer"}}>+ Add Subcon</button>}
      </div>

      {/* KPIs */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:16}}>
        {[
          {l:"Total Subcontractors",v:subcons.length,c:"#3b82f6"},
          {l:"Acceptable",v:subcons.filter(s=>s.rating==="YES - ACCEPTABLE").length,c:"#059669"},
          {l:"Not Approved",v:subcons.filter(s=>s.rating==="NO").length,c:"#ef4444"},
        ].map(({l,v,c})=>(
          <div key={l} style={{background:"#fff",borderRadius:12,padding:"14px 16px",border:"1.5px solid #e2e8f0"}}>
            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.3rem",color:c}}>{v}</div>
            <div style={{fontSize:".63rem",textTransform:"uppercase",letterSpacing:"1px",color:"#94a3b8",marginTop:5}}>{l}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
        <FInp value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search subcon, specialty, contact…"
          style={{flex:1,minWidth:200,border:"1.5px solid #e2e8f0",borderRadius:8,padding:"8px 13px",fontFamily:"inherit",fontSize:".84rem",color:"#0f172a"}}/>
        <select value={filterRating} onChange={e=>setFilterRating(e.target.value)}
          style={{border:"1.5px solid #e2e8f0",borderRadius:8,padding:"8px 12px",fontFamily:"inherit",fontSize:".8rem",color:"#0f172a",background:"#fff",cursor:"pointer"}}>
          <option value="all">All Ratings</option>
          {SUBCON_RATINGS.map(r=><option key={r}>{r}</option>)}
        </select>
        <select value={filterSpecialty} onChange={e=>setFilterSpecialty(e.target.value)}
          style={{border:"1.5px solid #e2e8f0",borderRadius:8,padding:"8px 12px",fontFamily:"inherit",fontSize:".8rem",color:"#0f172a",background:"#fff",cursor:"pointer"}}>
          <option value="all">All Specialties</option>
          {specialties.map(s=><option key={s}>{s}</option>)}
        </select>
      </div>

      {/* Add/Edit Form */}
      {showForm&&canEdit&&(
        <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",padding:18,marginBottom:16,boxShadow:"0 4px 16px rgba(0,0,0,.06)"}}>
          <div style={{fontWeight:800,color:"#0f172a",marginBottom:14}}>{editId?"Edit Subcontractor":"Add Subcontractor"}</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            <div style={{gridColumn:"1/-1"}}><Fld label="Company Name / Contact Person" required><Inp value={form.companyName} onChange={e=>f("companyName",e.target.value)} placeholder="e.g. Juan dela Cruz / ABC Construction"/></Fld></div>
            <Fld label="Rating"><Sel value={form.rating} onChange={e=>f("rating",e.target.value)}>{SUBCON_RATINGS.map(r=><option key={r}>{r}</option>)}</Sel></Fld>
            <Fld label="Specialty / Trade"><Inp value={form.specialty} onChange={e=>f("specialty",e.target.value)} placeholder="e.g. General Works"/></Fld>
            <Fld label="Contact No."><Inp value={form.contactNo} onChange={e=>f("contactNo",e.target.value)} placeholder="e.g. 0917-XXX-XXXX"/></Fld>
            <Fld label="Payment Terms"><Sel value={form.paymentTerms} onChange={e=>f("paymentTerms",e.target.value)}>{PAYMENT_TERMS_OPTS.map(p=><option key={p}>{p}</option>)}</Sel></Fld>
            <Fld label="Rate Structure"><Inp value={form.rateStructure} onChange={e=>f("rateStructure",e.target.value)} placeholder="e.g. Project Rate"/></Fld>
            <Fld label="Payment Structure"><Inp value={form.paymentStructure} onChange={e=>f("paymentStructure",e.target.value)} placeholder="e.g. 50% Start / 50% Completion"/></Fld>
            <Fld label="Location Note" hint="Leave blank for Metro Manila"><Inp value={form.locationNote} onChange={e=>f("locationNote",e.target.value)} placeholder="e.g. Davao, Cebu"/></Fld>
            <div style={{gridColumn:"1/-1"}}><Fld label="Address"><Inp value={form.address} onChange={e=>f("address",e.target.value)} placeholder="Full address"/></Fld></div>
            <div style={{gridColumn:"1/-1"}}><Fld label="Strengths / Weaknesses"><Inp rows={2} value={form.strengthsWeaknesses} onChange={e=>f("strengthsWeaknesses",e.target.value)} placeholder="W: Communication   S: Scope of Work"/></Fld></div>
            <div style={{gridColumn:"1/-1"}}><Fld label="Remarks / Notes"><Inp rows={2} value={form.remarks} onChange={e=>f("remarks",e.target.value)} placeholder="Special notes, last job, issues…"/></Fld></div>
          </div>
          <div style={{display:"flex",gap:10,marginTop:14}}>
            <button onClick={save} disabled={!form.companyName} style={{background:form.companyName?"#1e293b":"#e2e8f0",border:"none",borderRadius:9,padding:"10px 22px",fontFamily:"inherit",fontWeight:700,fontSize:".87rem",color:form.companyName?"#fff":"#94a3b8",cursor:form.companyName?"pointer":"not-allowed"}}>{editId?"Save Changes":"Add Subcon"}</button>
            <button onClick={()=>{setShowForm(false);setEditId(null);}} style={{background:"transparent",border:"1.5px solid #e2e8f0",borderRadius:9,padding:"10px 18px",fontFamily:"inherit",fontWeight:600,fontSize:".84rem",color:"#64748b",cursor:"pointer"}}>Cancel</button>
          </div>
        </div>
      )}

      {subcons.length===0&&<div style={{textAlign:"center",padding:"32px 0",color:"#94a3b8",fontSize:".84rem"}}>No subcontractors yet. Add your first subcon above.</div>}

      {/* List */}
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {filtered.map(s=>{
          const isNo=s.rating==="NO";
          return(
            <div key={s.id} style={{background:"#fff",borderRadius:12,border:`1.5px solid ${isNo?"#fecaca":"#e2e8f0"}`,padding:"14px 18px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,flexWrap:"wrap"}}>
                <div style={{flex:1}}>
                  <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginBottom:4}}>
                    <span style={{fontSize:".68rem",fontWeight:700,color:isNo?"#ef4444":"#059669",background:isNo?"#fef2f2":"#f0fdf4",padding:"2px 8px",borderRadius:20}}>{s.rating||"—"}</span>
                    <span style={{fontWeight:700,color:"#0f172a",fontSize:".92rem"}}>{s.companyName||s.company_name}</span>
                    {(s.specialty)&&<span style={{fontSize:".72rem",color:"#64748b",background:"#f1f5f9",padding:"1px 8px",borderRadius:20}}>{s.specialty}</span>}
                    {(s.locationNote||s.location_note)&&<span style={{fontSize:".72rem",color:"#7c3aed",background:"#f5f3ff",padding:"1px 8px",borderRadius:20}}>📍 {s.locationNote||s.location_note}</span>}
                  </div>
                  <div style={{display:"flex",gap:16,flexWrap:"wrap",fontSize:".78rem",color:"#64748b"}}>
                    {(s.contactNo||s.contact_no)&&<span>📞 {s.contactNo||s.contact_no}</span>}
                    {(s.paymentTerms||s.payment_terms)&&<span style={{background:"#f0fdf4",color:"#166534",padding:"1px 8px",borderRadius:10,fontWeight:600}}>💳 {s.paymentTerms||s.payment_terms}</span>}
                    {(s.rateStructure||s.rate_structure)&&<span>💰 {s.rateStructure||s.rate_structure}</span>}
                    {(s.paymentStructure||s.payment_structure)&&<span>📋 {s.paymentStructure||s.payment_structure}</span>}
                  </div>
                  {(s.strengthsWeaknesses||s.strengths_weaknesses)&&<div style={{fontSize:".75rem",color:"#475569",marginTop:4}}>{s.strengthsWeaknesses||s.strengths_weaknesses}</div>}
                  {(s.address)&&<div style={{fontSize:".75rem",color:"#94a3b8",marginTop:2}}>📍 {s.address}</div>}
                  {(s.remarks)&&<div style={{fontSize:".75rem",color:"#92400e",background:"#fffbeb",borderRadius:6,padding:"3px 8px",marginTop:4,display:"inline-block"}}>📝 {s.remarks}</div>}
                </div>
                {canEdit&&(
                  <div style={{display:"flex",gap:6,flexShrink:0}}>
                    <button onClick={()=>openEdit(s)} style={{background:"#f1f5f9",border:"none",borderRadius:7,padding:"5px 11px",fontSize:".73rem",color:"#475569",cursor:"pointer",fontWeight:600,fontFamily:"inherit"}}>✏</button>
                    <button onClick={()=>{if(window.confirm("Remove this subcontractor?"))deleteSubcon(s.id);}} style={{background:"#fef2f2",border:"none",borderRadius:7,padding:"5px 11px",fontSize:".73rem",color:"#dc2626",cursor:"pointer",fontWeight:600,fontFamily:"inherit"}}>✕</button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
