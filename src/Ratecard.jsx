import { useState, useMemo, useCallback } from "react";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const PRODUCT_TYPES = [
  "Custom Shelving","Display Fixtures","Signage","Countertops",
  "Retail Cabinetry","Kiosks","Wall Panels","Millwork","POP Displays","Full Retail Interior","Other"
];
const GRADES = ["Economy","Standard","Premium","Luxury"];
const GRADE_CLR = { Economy:"#64748b",Standard:"#3b82f6",Premium:"#8b5cf6",Luxury:"#f59e0b" };
const UNITS = ["sqm","lm","pcs","sets","lot","lump sum"];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// Client pricing presets — adjust markup up or down based on client type
const CLIENT_PRESETS = [
  { label:"VIP / Loyal",     icon:"⭐", markupAdj:-10, discountAdj:5,  color:"#059669", note:"Long-term client, easy to work with" },
  { label:"Standard",        icon:"🤝", markupAdj:0,   discountAdj:0,  color:"#3b82f6", note:"Regular project, normal terms" },
  { label:"New Client",      icon:"🆕", markupAdj:5,   discountAdj:0,  color:"#8b5cf6", note:"First-time, unproven client" },
  { label:"Rush / Urgent",   icon:"⚡", markupAdj:15,  discountAdj:0,  color:"#f59e0b", note:"Compressed timeline, extra coordination" },
  { label:"High Complexity", icon:"🔧", markupAdj:20,  discountAdj:0,  color:"#f97316", note:"Unusual specs, multiple revisions expected" },
  { label:"Worth the Stress",icon:"😤", markupAdj:30,  discountAdj:0,  color:"#ef4444", note:"Difficult client, high maintenance, demanding" },
];

const fmt  = n => "₱" + Number(n||0).toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtN = n => Number(n||0).toLocaleString("en-PH",{minimumFractionDigits:2});
const today = new Date().toISOString().split("T")[0];
const todayL= new Date().toLocaleDateString("en-PH",{year:"numeric",month:"long",day:"numeric"});
let _id = 100; const uid = () => ++_id;

// ─── DEFAULT RATE CARD ────────────────────────────────────────────────────────
// Structure: { productType: { grade: { matCost, laborCost, overhead, unit, markup } } }
// All costs are PER UNIT (sqm, lm, pcs, etc.)
// Your QS replaces these placeholder numbers with real GMD rates
// ─── GMD REAL RATE CARD ─────────────────────────────────────────────────────
// Source: GMD Project Reference Library v1.0 + QS Cost Library
// Notes: All costs per unit. 20% Contractor's Profit applied on top.
// Total margin = ~50-60% (materials carry embedded markup + 20% CP)
// ₱3M+ threshold: Paulo Garcia MUST be involved.
// UPDATE THESE with your QS session rates.

const GMD_LABOR_RATES = {
  "Engineer / Architect (Site)": { day:1000, ot:156.25 },
  "Foreman":                     { day:900,  ot:140.63 },
  "Skilled Worker":              { day:800,  ot:125.00 },
  "Helper / General Labor":      { day:650,  ot:101.56 },
};

const GMD_STANDARD_LINE_ITEMS = [
  { item:"Mobilization / Demobilization", low:150000, high:350000, note:"Non-negotiable. Always on every project." },
  { item:"Project Engineer (Supervision)", low:70000,  high:90000,  note:"Per project. Mall may require sign-off." },
  { item:"Safety Officer",                low:35000,  high:90000,  note:"Required by most malls. Check mall requirements." },
  { item:"Board Down / Temp Protection",  low:25000,  high:55000,  note:"Standard for all mall projects." },
  { item:"Tools & Equipment Rental",      low:25000,  high:65000,  note:"Varies by scope and duration." },
  { item:"CARI (Mall Admin)",             low:20000,  high:25000,  note:"Mandatory for mall projects." },
  { item:"Working / Shop Drawings",       low:25000,  high:65000,  note:"Architectural + electrical. Some c/o consultant." },
  { item:"As-Built Plans",               low:20000,  high:25000,  note:"Typically 4 sets: Owner, Mall, PDF, CAD." },
  { item:"Delivery / Hauling",           low:25000,  high:50000,  note:"Especially for module shipment from fabrication yard." },
  { item:"Temporary Power",              low:5000,   high:15000,  note:"Metering and wiring to mall tapping point." },
];

const GMD_PROJECT_BENCHMARKS = [
  { type:"Modules + Signage (Activation)", low:1000000,  high:1500000,  note:"Small-scale, event/activation format. Ref: Treasure Pop-Up" },
  { type:"Fit-Out + Built-ins (Mid)",      low:3500000,  high:4500000,  note:"Full fit-out, no heavy MEP. Ref: STNT, Popmart Cebu/Davao" },
  { type:"Full Retail Interior (~100sqm)", low:5000000,  high:6500000,  note:"~₱55K-60K/sqm. Ref: BTV Shangri-La, BTV Cebu" },
  { type:"Full Retail — Multi-Brand",      low:7000000,  high:8500000,  note:"Complex, 2+ brands. Ref: OPPENP. PAULO REQUIRED." },
  { type:"F&B Fit-Out",                   low:3500000,  high:5000000,  note:"Includes exhaust, hood provisions. Ref: KUBO Coffee" },
  { type:"Construction (Civil/Structural)",low:5000000,  high:null,     note:"Rodney (QS/CE) prepares CE. Paulo reviews and sets final %. Heavy MEP separate." },
];

const DEFAULT_RATES = {
  "Custom Shelving": {
    Economy:  { matCost:1800,  laborCost:600,   overhead:200,  markup:20, unit:"sqm", notes:"Melamine board, basic hardware. Apply 20% CP on top." },
    Standard: { matCost:2800,  laborCost:800,   overhead:300,  markup:20, unit:"sqm", notes:"MDF with veneer, mid-grade hardware" },
    Premium:  { matCost:4500,  laborCost:1200,  overhead:400,  markup:20, unit:"sqm", notes:"Solid wood / high-grade laminate" },
    Luxury:   { matCost:7500,  laborCost:2000,  overhead:600,  markup:20, unit:"sqm", notes:"Custom solid wood, imported hardware" },
  },
  "Display Fixtures": {
    Economy:  { matCost:2200,  laborCost:700,   overhead:250,  markup:20, unit:"pcs", notes:"Basic steel + MDF" },
    Standard: { matCost:3800,  laborCost:1000,  overhead:350,  markup:20, unit:"pcs", notes:"Powder-coated steel + glass" },
    Premium:  { matCost:6500,  laborCost:1800,  overhead:500,  markup:20, unit:"pcs", notes:"Stainless + tempered glass" },
    Luxury:   { matCost:12000, laborCost:3000,  overhead:800,  markup:20, unit:"pcs", notes:"Custom fabricated, branded finish" },
  },
  "Signage": {
    Economy:  { matCost:800,   laborCost:300,   overhead:100,  markup:20, unit:"sqm", notes:"Vinyl on board" },
    Standard: { matCost:1800,  laborCost:600,   overhead:200,  markup:20, unit:"sqm", notes:"Aluminum composite, vinyl" },
    Premium:  { matCost:3500,  laborCost:1000,  overhead:300,  markup:20, unit:"sqm", notes:"Backlit acrylic, LED" },
    Luxury:   { matCost:6000,  laborCost:2000,  overhead:500,  markup:20, unit:"sqm", notes:"Full custom fabricated, neon/LED" },
  },
  "Countertops": {
    Economy:  { matCost:1500,  laborCost:500,   overhead:150,  markup:20, unit:"lm",  notes:"Laminated board" },
    Standard: { matCost:3000,  laborCost:800,   overhead:300,  markup:20, unit:"lm",  notes:"Engineered stone / solid surface" },
    Premium:  { matCost:6000,  laborCost:1500,  overhead:500,  markup:20, unit:"lm",  notes:"Quartz / natural stone" },
    Luxury:   { matCost:12000, laborCost:3000,  overhead:800,  markup:20, unit:"lm",  notes:"Imported marble / bespoke" },
  },
  "Retail Cabinetry": {
    Economy:  { matCost:2000,  laborCost:700,   overhead:200,  markup:20, unit:"sqm", notes:"Melamine, basic hinges" },
    Standard: { matCost:3200,  laborCost:900,   overhead:300,  markup:20, unit:"sqm", notes:"MDF, soft-close hardware" },
    Premium:  { matCost:5500,  laborCost:1500,  overhead:450,  markup:20, unit:"sqm", notes:"Solid wood veneer, Blum hardware" },
    Luxury:   { matCost:9000,  laborCost:2500,  overhead:700,  markup:20, unit:"sqm", notes:"Bespoke, imported fittings" },
  },
  "Kiosks": {
    Economy:  { matCost:45000, laborCost:15000, overhead:5000, markup:20, unit:"pcs", notes:"Steel + laminate, basic lighting. Ref: Treasure ~₱1.1M total" },
    Standard: { matCost:75000, laborCost:22000, overhead:8000, markup:20, unit:"pcs", notes:"Steel + glass, LED. Ref: Popmart type ~₱4.6M" },
    Premium:  { matCost:120000,laborCost:35000, overhead:12000,markup:20, unit:"pcs", notes:"Custom steel, backlit, branded" },
    Luxury:   { matCost:200000,laborCost:55000, overhead:18000,markup:20, unit:"pcs", notes:"Full bespoke, BTV-grade ~₱56K-60K/sqm" },
  },
  "Wall Panels": {
    Economy:  { matCost:900,   laborCost:350,   overhead:120,  markup:20, unit:"sqm", notes:"PVC / foam board" },
    Standard: { matCost:1800,  laborCost:600,   overhead:200,  markup:20, unit:"sqm", notes:"MDF / laminate panels" },
    Premium:  { matCost:3500,  laborCost:1000,  overhead:350,  markup:20, unit:"sqm", notes:"Fabric wrap / 3D panels" },
    Luxury:   { matCost:7000,  laborCost:2000,  overhead:600,  markup:20, unit:"sqm", notes:"Acoustic / custom designer panels" },
  },
  "Millwork": {
    Economy:  { matCost:2500,  laborCost:900,   overhead:300,  markup:20, unit:"lm",  notes:"Standard profiles" },
    Standard: { matCost:4000,  laborCost:1200,  overhead:400,  markup:20, unit:"lm",  notes:"Custom profiles, painted finish" },
    Premium:  { matCost:7000,  laborCost:2000,  overhead:600,  markup:20, unit:"lm",  notes:"Solid wood profiles, stained" },
    Luxury:   { matCost:12000, laborCost:3500,  overhead:900,  markup:20, unit:"lm",  notes:"Bespoke joinery, exotic wood" },
  },
  "POP Displays": {
    Economy:  { matCost:3000,  laborCost:1000,  overhead:300,  markup:20, unit:"pcs", notes:"Corrugated / foam board" },
    Standard: { matCost:6500,  laborCost:1800,  overhead:500,  markup:20, unit:"pcs", notes:"Printed board, basic structure" },
    Premium:  { matCost:12000, laborCost:3000,  overhead:800,  markup:20, unit:"pcs", notes:"Backlit, branded finish" },
    Luxury:   { matCost:25000, laborCost:6000,  overhead:1500, markup:20, unit:"pcs", notes:"Full custom, premium materials" },
  },
  "Full Retail Interior": {
    Economy:  { matCost:30000, laborCost:15000, overhead:5000, markup:20, unit:"sqm", notes:"~₱50K/sqm all-in. Simple fit-out." },
    Standard: { matCost:35000, laborCost:16000, overhead:5000, markup:20, unit:"sqm", notes:"~₱56K/sqm. Ref: BTV Shangri-La (₱56,200/sqm)" },
    Premium:  { matCost:38000, laborCost:17000, overhead:5500, markup:20, unit:"sqm", notes:"~₱59K/sqm. Ref: BTV Cebu (₱58,900/sqm)" },
    Luxury:   { matCost:50000, laborCost:22000, overhead:7000, markup:20, unit:"sqm", notes:"₱65K+/sqm. Multi-brand, complex. PAULO REQUIRED." },
  },
  "Other": {
    Economy:  { matCost:1000,  laborCost:400,   overhead:150,  markup:20, unit:"lot", notes:"To be defined with QS" },
    Standard: { matCost:2500,  laborCost:800,   overhead:300,  markup:20, unit:"lot", notes:"To be defined with QS" },
    Premium:  { matCost:5000,  laborCost:1500,  overhead:500,  markup:20, unit:"lot", notes:"To be defined with QS" },
    Luxury:   { matCost:10000, laborCost:3000,  overhead:800,  markup:20, unit:"lot", notes:"To be defined with QS" },
  },
};

// ─── SEED ESTIMATES  ───────────────────────────────────────────────────────────
const SEED_ESTIMATES = [
  {
    id:"est1",
    estNo:"EST-2026-001",
    client:"Metro Retail Co.",
    contact:"Jane Reyes",
    projectName:"Main Store Fit-out",
    date:"2026-04-10",
    validUntil:"2026-05-10",
    dealId:"d1",
    status:"Accepted",
    markup:25,
    discount:0,
    terms:"50% downpayment upon PO, balance upon delivery",
    preparedBy:"Paulo M. Garcia",
    notes:"",
    items:[
      {id:"i1",description:"Custom Shelving — Back wall display",product:"Custom Shelving",grade:"Standard",qty:12,unit:"sqm",matCost:2800,laborCost:800,overhead:300,customOverride:false,notes:""},
      {id:"i2",description:"Display Counter — Cashier area",product:"Countertops",grade:"Premium",qty:3,unit:"lm",matCost:6000,laborCost:1500,overhead:500,customOverride:false,notes:"Quartz top"},
    ]
  },
];

const emptyItem = (product="Custom Shelving", grade="Standard", rates=DEFAULT_RATES) => {
  const r = rates[product]?.[grade] || {};
  return { id:uid(), description:"", product, grade, qty:1, unit:r.unit||"sqm", matCost:r.matCost||0, laborCost:r.laborCost||0, overhead:r.overhead||0, customOverride:false, notes:"" };
};

// ─── CALCULATIONS ─────────────────────────────────────────────────────────────
const calcItem = (item) => {
  const costPerUnit = (item.matCost||0) + (item.laborCost||0) + (item.overhead||0);
  const totalCost   = costPerUnit * (item.qty||0);
  return { costPerUnit, totalCost };
};
const calcEstimate = (items, markup, discount=0) => {
  const totalCost    = items.reduce((s,i)=>s+calcItem(i).totalCost, 0);
  const markupAmt    = totalCost * (markup/100);
  const subtotal     = totalCost + markupAmt;
  const discountAmt  = subtotal * (discount/100);
  const total        = subtotal - discountAmt;
  const profit       = total - totalCost;
  const margin       = total>0 ? Math.round(profit/total*100) : 0;
  return { totalCost, markupAmt, subtotal, discountAmt, total, profit, margin };
};

// ─── UI ATOMS ─────────────────────────────────────────────────────────────────
const Badge = ({label,color="#64748b",small}) => (
  <span style={{display:"inline-block",padding:small?"2px 8px":"3px 11px",borderRadius:20,background:color+"18",color,fontSize:small?".65rem":".72rem",fontWeight:700,border:`1px solid ${color}30`,whiteSpace:"nowrap"}}>{label}</span>
);
const Btn = ({children,onClick,variant="primary",small,full,disabled}) => {
  const v={
    primary: {bg:"#1a1a2e",c:"#fff",b:"none"},
    ghost:   {bg:"transparent",c:"#64748b",b:"1.5px solid #e2e8f0"},
    danger:  {bg:"#fef2f2",c:"#ef4444",b:"1.5px solid #fecaca"},
    green:   {bg:"#f0fdf4",c:"#059669",b:"1.5px solid #6ee7b7"},
    amber:   {bg:"#fffbeb",c:"#d97706",b:"1.5px solid #fde68a"},
    purple:  {bg:"#faf5ff",c:"#7c3aed",b:"1.5px solid #ddd6fe"},
  }[variant]||{bg:"#1a1a2e",c:"#fff",b:"none"};
  return(
    <button onClick={onClick} disabled={disabled} style={{background:disabled?"#f1f5f9":v.bg,color:disabled?"#94a3b8":v.c,border:v.b,borderRadius:8,padding:small?"5px 12px":"9px 18px",fontFamily:"inherit",fontWeight:700,fontSize:small?".76rem":".84rem",cursor:disabled?"not-allowed":"pointer",width:full?"100%":"auto",transition:"all .15s",whiteSpace:"nowrap"}}>
      {children}
    </button>
  );
};
const Inp = ({value,onChange,type="text",placeholder,min,rows,readOnly,style:sx={}}) => {
  const base = {width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"9px 12px",fontFamily:"inherit",fontSize:".86rem",color:"#1e293b",background:readOnly?"#f8fafc":"#fff",boxSizing:"border-box",outline:"none",...sx};
  if(rows) return <textarea value={value||""} onChange={onChange} placeholder={placeholder} rows={rows} style={{...base,resize:"vertical"}}/>;
  return <input type={type} value={value||""} onChange={onChange} placeholder={placeholder} min={min} readOnly={readOnly} style={base}/>;
};
const Sel = ({value,onChange,children,style:sx={}}) => (
  <select value={value} onChange={onChange} style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"9px 12px",fontFamily:"inherit",fontSize:".86rem",color:"#1e293b",background:"#fff",boxSizing:"border-box",cursor:"pointer",outline:"none",...sx}}>
    {children}
  </select>
);
const Fld = ({label,children,hint,required,half}) => (
  <div style={{marginBottom:14,gridColumn:half?"span 1":undefined}}>
    <label style={{display:"block",fontSize:".68rem",fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:".8px",marginBottom:5}}>
      {label}{required&&<span style={{color:"#ef4444",marginLeft:2}}>*</span>}
    </label>
    {children}
    {hint&&<div style={{fontSize:".68rem",color:"#94a3b8",marginTop:4}}>{hint}</div>}
  </div>
);
const Modal = ({open,onClose,title,children,wide,extraWide}) => {
  if(!open) return null;
  const maxW = extraWide?960:wide?640:480;
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.45)",zIndex:999,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"24px 16px",overflowY:"auto"}} onClick={onClose}>
      <div style={{background:"#fff",borderRadius:18,padding:28,width:"100%",maxWidth:maxW,boxShadow:"0 24px 80px rgba(0,0,0,.18)"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:22}}>
          <div style={{fontWeight:800,fontSize:"1.1rem",color:"#0f172a"}}>{title}</div>
          <button onClick={onClose} style={{background:"#f1f5f9",border:"none",borderRadius:8,width:32,height:32,cursor:"pointer",color:"#64748b",fontSize:"1rem"}}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
};
const KPI = ({label,value,color,sub}) => (
  <div style={{background:"#fff",borderRadius:12,padding:"16px 18px",border:"1.5px solid #e2e8f0"}}>
    <div style={{fontSize:"1.5rem",fontWeight:800,color,fontFamily:"'DM Serif Display',serif",lineHeight:1}}>{value}</div>
    {sub&&<div style={{fontSize:".68rem",color,marginTop:2,opacity:.75}}>{sub}</div>}
    <div style={{fontSize:".63rem",textTransform:"uppercase",letterSpacing:"1px",color:"#94a3b8",marginTop:6}}>{label}</div>
  </div>
);
const Divider = ({label}) => (
  <div style={{display:"flex",alignItems:"center",gap:12,margin:"20px 0 14px"}}>
    <div style={{flex:1,height:1,background:"#f1f5f9"}}/>
    <span style={{fontSize:".68rem",fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"1px",whiteSpace:"nowrap"}}>{label}</span>
    <div style={{flex:1,height:1,background:"#f1f5f9"}}/>
  </div>
);

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function RateCardApp() {
  const [tab,       setTab]      = useState("estimates");   // estimates | ratecard
  const [rates,     setRates]    = useState(DEFAULT_RATES);
  const [estimates, setEstimates]= useState(SEED_ESTIMATES);
  const [view,      setView]     = useState("list");        // list | build | preview
  const [selEst,    setSelEst]   = useState(null);
  const [previewMode,setPreviewMode] = useState("internal"); // internal | client
  const [rcProduct, setRcProduct]= useState("Custom Shelving");
  const [rcEditModal,setRcEditModal]=useState(false);
  const [rcEditForm, setRcEditForm]=useState({});
  const [rcEditGrade,setRcEditGrade]=useState(null);

  // ── Estimate form state ───────────────────────────────────────────────────
  const [form, setForm] = useState({
    estNo:`EST-${new Date().getFullYear()}-${String(estimates.length+1).padStart(3,"0")}`,
    client:"", contact:"", projectName:"", date:today, clientPreset:"Standard", clientNote:"",
    validUntil:"", dealId:"", status:"Draft", markup:25, discount:0,
    terms:"50% downpayment upon issuance of PO, balance upon delivery",
    preparedBy:"", notes:"", items:[]
  });
  const setF = (k,v) => setForm(p=>({...p,[k]:v}));

  const est = selEst ? estimates.find(e=>e.id===selEst) : null;

  // ── Rate card helpers ─────────────────────────────────────────────────────
  const openRcEdit = (product, grade) => {
    const r = rates[product]?.[grade] || {};
    setRcEditForm({...r, product, grade});
    setRcEditGrade(grade);
    setRcEditModal(true);
  };
  const saveRcEdit = () => {
    setRates(r=>({...r,[rcEditForm.product]:{...r[rcEditForm.product],[rcEditForm.grade]:{
      matCost:  Number(rcEditForm.matCost)||0,
      laborCost:Number(rcEditForm.laborCost)||0,
      overhead: Number(rcEditForm.overhead)||0,
      markup:   Number(rcEditForm.markup)||25,
      unit:     rcEditForm.unit||"sqm",
      notes:    rcEditForm.notes||"",
    }}}));
    setRcEditModal(false);
  };

  // ── Estimate item helpers ─────────────────────────────────────────────────
  const addItem = () => {
    setF("items",[...form.items, emptyItem("Custom Shelving","Standard",rates)]);
  };
  const updateItem = (idx, key, val) => {
    const items = [...form.items];
    items[idx] = {...items[idx],[key]:val};
    // Auto-fill rates from rate card when product or grade changes
    if(key==="product"||key==="grade") {
      const prod  = key==="product"?val:items[idx].product;
      const grade = key==="grade"?val:items[idx].grade;
      const r = rates[prod]?.[grade];
      if(r && !items[idx].customOverride) {
        items[idx] = {...items[idx], matCost:r.matCost, laborCost:r.laborCost, overhead:r.overhead, unit:r.unit};
      }
    }
    // If manually editing costs, mark as custom override
    if(["matCost","laborCost","overhead"].includes(key)) {
      items[idx].customOverride = true;
    }
    setF("items", items);
  };
  const removeItem = idx => setF("items", form.items.filter((_,i)=>i!==idx));
  const resetItemRates = idx => {
    const items = [...form.items];
    const r = rates[items[idx].product]?.[items[idx].grade];
    if(r) { items[idx]={...items[idx],matCost:r.matCost,laborCost:r.laborCost,overhead:r.overhead,unit:r.unit,customOverride:false}; }
    setF("items",items);
  };

  const saveEstimate = () => {
    if(!form.client||form.items.length===0) return;
    const rec = {...form, id:selEst||"est"+uid()};
    setEstimates(es=>selEst?es.map(e=>e.id===selEst?rec:e):[...es,rec]);
    setSelEst(rec.id);
    setView("preview");
  };

  const newEstimate = () => {
    const num = String(estimates.length+1).padStart(3,"0");
    setForm({estNo:`EST-${new Date().getFullYear()}-${num}`,client:"",contact:"",projectName:"",date:today,validUntil:"",dealId:"",status:"Draft",markup:25,discount:0,clientPreset:"Standard",clientNote:"",terms:"50% downpayment upon issuance of PO, balance upon delivery",preparedBy:"",notes:"",items:[]});
    setSelEst(null);
    setView("build");
  };
  const editEstimate = (e) => {
    setForm({...e});
    setSelEst(e.id);
    setView("build");
  };

  // ── Totals for current form ───────────────────────────────────────────────
  const formTotals = useMemo(()=>calcEstimate(form.items, form.markup, form.discount),[form.items,form.markup,form.discount]);

  const statusColor = {Draft:"#94a3b8",Sent:"#3b82f6",Accepted:"#10b981",Rejected:"#ef4444",Revised:"#f59e0b"};

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return(
    <div style={{minHeight:"100vh",background:"#f8fafc",fontFamily:"'Segoe UI',system-ui,sans-serif"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Crimson+Pro:wght@400;600;700&family=Barlow:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;}
        input:focus,select:focus,textarea:focus{outline:none;border-color:#1a1a2e!important;box-shadow:0 0 0 3px rgba(26,26,46,.08);}
        @keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
        .fade{animation:fadeUp .2s ease;}
        @media print{.noprint{display:none!important;} body{background:#fff!important;} .printarea{box-shadow:none!important;border:none!important;}}
        table{border-collapse:collapse;}
        .row-hover:hover td{background:#fafafa!important;}
        ::-webkit-scrollbar{width:4px;height:4px} ::-webkit-scrollbar-thumb{background:#e2e8f0;border-radius:2px}
      `}</style>

      {/* ── HEADER ── */}
      <header style={{background:"#1a1a2e",padding:"0 28px",display:"flex",alignItems:"center",height:58,gap:6,position:"sticky",top:0,zIndex:100}} className="noprint">
        <div style={{fontFamily:"'DM Serif Display',serif",fontSize:"1.15rem",color:"#fff",marginRight:20,letterSpacing:-.3}}>
          GMD <span style={{color:"#f59e0b",fontStyle:"italic"}}>Rate Card</span>
        </div>
        {[["estimates","📋 Estimates"],["ratecard","⚙ Rate Card"]].map(([id,l])=>(
          <button key={id} onClick={()=>{setTab(id);setView("list");}} style={{background:tab===id?"rgba(255,255,255,.12)":"transparent",border:"none",borderRadius:8,padding:"7px 14px",color:tab===id?"#fff":"rgba(255,255,255,.55)",fontFamily:"inherit",fontWeight:tab===id?600:400,fontSize:".82rem",cursor:"pointer",transition:"all .15s"}}>{l}</button>
        ))}
        <div style={{marginLeft:"auto",fontSize:".72rem",color:"rgba(255,255,255,.4)"}}>{estimates.length} estimates · {todayL}</div>
      </header>

      <div style={{maxWidth:1160,margin:"0 auto",padding:"24px 20px"}}>

        {/* ══════════════════════════════════════════════════════════════════
            ESTIMATES TAB
        ══════════════════════════════════════════════════════════════════ */}
        {tab==="estimates" && view==="list" && (
          <div className="fade">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:20}}>
              <div>
                <h1 style={{margin:0,fontFamily:"'DM Serif Display',serif",fontSize:"1.6rem",color:"#0f172a"}}>Estimates</h1>
                <p style={{margin:"4px 0 0",color:"#64748b",fontSize:".82rem"}}>Build, save and send project estimates to clients</p>
              </div>
              <Btn onClick={newEstimate}>+ New Estimate</Btn>
            </div>

            {/* Summary KPIs */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:24}}>
              <KPI label="Total Estimates"  value={estimates.length}                     color="#1a1a2e"/>
              <KPI label="Total Quoted"     value={"₱"+(estimates.reduce((s,e)=>s+calcEstimate(e.items,e.markup,e.discount).total,0)/1000).toFixed(0)+"k"} color="#3b82f6"/>
              <KPI label="Accepted"         value={estimates.filter(e=>e.status==="Accepted").length} color="#10b981"/>
              <KPI label="Avg. Margin"      value={estimates.length?Math.round(estimates.reduce((s,e)=>s+calcEstimate(e.items,e.markup,e.discount).margin,0)/estimates.length)+"%":"—"} color="#f59e0b"/>
            </div>

            {/* Estimate list */}
            {estimates.map(e=>{
              const t = calcEstimate(e.items, e.markup, e.discount);
              return(
                <div key={e.id} style={{background:"#fff",borderRadius:14,border:"1.5px solid #e2e8f0",padding:"18px 22px",marginBottom:10,display:"flex",gap:16,alignItems:"flex-start",transition:"box-shadow .15s",cursor:"pointer",boxShadow:"0 1px 4px rgba(0,0,0,.04)"}}
                  onMouseEnter={e=>e.currentTarget.style.boxShadow="0 6px 20px rgba(0,0,0,.08)"}
                  onMouseLeave={e=>e.currentTarget.style.boxShadow="0 1px 4px rgba(0,0,0,.04)"}
                  onClick={()=>{setSelEst(e.id);setView("preview");setPreviewMode("client");}}>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:5,flexWrap:"wrap"}}>
                      <span style={{fontWeight:700,color:"#0f172a",fontSize:"1rem",fontFamily:"'DM Serif Display',serif"}}>{e.client}</span>
                      <span style={{fontSize:".78rem",color:"#64748b"}}>· {e.estNo}</span>
                      <Badge label={e.status} color={statusColor[e.status]||"#64748b"}/>
                      {e.clientPreset&&e.clientPreset!=="Standard"&&(()=>{const p=CLIENT_PRESETS.find(x=>x.label===e.clientPreset);return p?<Badge label={`${p.icon} ${p.label}`} color={p.color}/>:null;})()}
                    </div>
                    <div style={{fontSize:".78rem",color:"#64748b"}}>{e.projectName} {e.contact&&`· ${e.contact}`}</div>
                    <div style={{fontSize:".72rem",color:"#94a3b8",marginTop:4}}>
                      {e.items.length} line item{e.items.length!==1?"s":""} · Dated {e.date} {e.validUntil&&`· Valid until ${e.validUntil}`}
                    </div>
                  </div>
                  <div style={{textAlign:"right",flexShrink:0}}>
                    <div style={{fontFamily:"'DM Serif Display',serif",fontWeight:700,fontSize:"1.3rem",color:"#0f172a"}}>{fmt(t.total)}</div>
                    <div style={{fontSize:".72rem",color:t.margin>=20?"#10b981":"#f59e0b",marginTop:2}}>{t.margin}% margin</div>
                    <div style={{display:"flex",gap:7,marginTop:10,justifyContent:"flex-end"}}>
                      <Btn small variant="ghost" onClick={ev=>{ev.stopPropagation();editEstimate(e);}}>✏ Edit</Btn>
                      <Btn small variant="amber" onClick={ev=>{ev.stopPropagation();setSelEst(e.id);setView("preview");setPreviewMode("client");}}>Preview</Btn>
                    </div>
                  </div>
                </div>
              );
            })}
            {estimates.length===0&&(
              <div style={{textAlign:"center",padding:"48px 24px",color:"#94a3b8"}}>
                <div style={{fontSize:"2.5rem",marginBottom:12}}>📋</div>
                <div style={{fontFamily:"'DM Serif Display',serif",fontSize:"1.1rem",color:"#1e293b",marginBottom:6}}>No estimates yet</div>
                <div style={{fontSize:".82rem",marginBottom:20}}>Create your first estimate to get started</div>
                <Btn onClick={newEstimate}>+ New Estimate</Btn>
              </div>
            )}
          </div>
        )}

        {/* ══ ESTIMATE BUILDER ══════════════════════════════════════════════ */}
        {tab==="estimates" && view==="build" && (
          <div className="fade">
            <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:20}}>
              <Btn variant="ghost" small onClick={()=>setView("list")}>← Back</Btn>
              <div style={{flex:1}}>
                <h2 style={{margin:0,fontFamily:"'DM Serif Display',serif",fontSize:"1.3rem",color:"#0f172a"}}>{selEst?"Edit Estimate":"New Estimate"}</h2>
                <div style={{fontSize:".75rem",color:"#64748b",marginTop:2}}>Rates auto-fill from your Rate Card. Override any line manually.</div>
              </div>
              <Btn variant="ghost" small onClick={()=>{setView("preview");setPreviewMode("internal");}}>👁 Preview Internal</Btn>
              <Btn variant="amber" small onClick={()=>{setView("preview");setPreviewMode("client");}}>👁 Preview Client</Btn>
              <Btn variant="green" onClick={saveEstimate} disabled={!form.client||form.items.length===0}>✓ Save Estimate</Btn>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 340px",gap:18,alignItems:"start"}}>

              {/* Left: form */}
              <div>
                {/* Header info */}
                <div style={{background:"#fff",borderRadius:14,border:"1.5px solid #e2e8f0",padding:22,marginBottom:16}}>
                  <Divider label="Estimate Info"/>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                    <Fld label="Client Name" required><Inp value={form.client} onChange={e=>setF("client",e.target.value)} placeholder="Company name"/></Fld>
                    <Fld label="Contact Person"><Inp value={form.contact} onChange={e=>setF("contact",e.target.value)} placeholder="Name"/></Fld>
                    <Fld label="Project Name / Description"><Inp value={form.projectName} onChange={e=>setF("projectName",e.target.value)} placeholder="e.g. Main Store Fit-out"/></Fld>
                    <Fld label="Prepared By"><Inp value={form.preparedBy} onChange={e=>setF("preparedBy",e.target.value)} placeholder="Your name"/></Fld>
                    <Fld label="Date"><Inp type="date" value={form.date} onChange={e=>setF("date",e.target.value)}/></Fld>
                    <Fld label="Valid Until"><Inp type="date" value={form.validUntil} onChange={e=>setF("validUntil",e.target.value)}/></Fld>
                    <Fld label="Estimate No."><Inp value={form.estNo} onChange={e=>setF("estNo",e.target.value)}/></Fld>
                    <Fld label="Status">
                      <Sel value={form.status} onChange={e=>setF("status",e.target.value)}>
                        {["Draft","Sent","Accepted","Rejected","Revised"].map(s=><option key={s}>{s}</option>)}
                      </Sel>
                    </Fld>
                  </div>
                </div>

                {/* Line items */}
                <div style={{background:"#fff",borderRadius:14,border:"1.5px solid #e2e8f0",padding:22,marginBottom:16}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
                    <div>
                      <div style={{fontWeight:700,color:"#0f172a",fontSize:".98rem"}}>Scope of Work</div>
                      <div style={{fontSize:".72rem",color:"#64748b",marginTop:2}}>Add line items — rates auto-load from rate card</div>
                    </div>
                    <Btn onClick={addItem}>+ Add Line Item</Btn>
                  </div>

                  {form.items.length===0 && (
                    <div style={{textAlign:"center",padding:"28px 0",color:"#94a3b8",fontSize:".84rem",borderTop:"1.5px dashed #e2e8f0"}}>
                      No line items yet. Click <strong>+ Add Line Item</strong> to start building your estimate.
                    </div>
                  )}

                  {form.items.map((item,idx)=>{
                    const {totalCost} = calcItem(item);
                    const r = rates[item.product]?.[item.grade];
                    return(
                      <div key={item.id} style={{border:"1.5px solid #f1f5f9",borderRadius:12,padding:16,marginBottom:12,background:"#fafafa"}}>
                        {/* Row 1: description + product + grade */}
                        <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr auto",gap:10,marginBottom:10,alignItems:"end"}}>
                          <Fld label="Description / Scope Item">
                            <Inp value={item.description} onChange={e=>updateItem(idx,"description",e.target.value)} placeholder="e.g. Back wall shelving system"/>
                          </Fld>
                          <Fld label="Product Type">
                            <Sel value={item.product} onChange={e=>updateItem(idx,"product",e.target.value)}>
                              {PRODUCT_TYPES.map(p=><option key={p}>{p}</option>)}
                            </Sel>
                          </Fld>
                          <Fld label="Grade">
                            <Sel value={item.grade} onChange={e=>updateItem(idx,"grade",e.target.value)}>
                              {GRADES.map(g=><option key={g}>{g}</option>)}
                            </Sel>
                          </Fld>
                          <div style={{paddingBottom:14}}>
                            <Btn small variant="danger" onClick={()=>removeItem(idx)}>✕</Btn>
                          </div>
                        </div>

                        {/* Row 2: qty + unit + cost breakdown */}
                        <div style={{display:"grid",gridTemplateColumns:"80px 100px 1fr 1fr 1fr",gap:10,marginBottom:8,alignItems:"end"}}>
                          <Fld label="Qty">
                            <Inp type="number" min={0} value={item.qty} onChange={e=>updateItem(idx,"qty",Number(e.target.value))}/>
                          </Fld>
                          <Fld label="Unit">
                            <Sel value={item.unit} onChange={e=>updateItem(idx,"unit",e.target.value)}>
                              {UNITS.map(u=><option key={u}>{u}</option>)}
                            </Sel>
                          </Fld>
                          <Fld label={`Mat. Cost / ${item.unit}`} hint={r&&!item.customOverride?`Rate card: ${fmt(r.matCost)}`:item.customOverride?"Custom override":""}>
                            <Inp type="number" min={0} value={item.matCost} onChange={e=>updateItem(idx,"matCost",Number(e.target.value))} style={{borderColor:item.customOverride?"#f59e0b":"#e2e8f0"}}/>
                          </Fld>
                          <Fld label={`Labor / ${item.unit}`}>
                            <Inp type="number" min={0} value={item.laborCost} onChange={e=>updateItem(idx,"laborCost",Number(e.target.value))} style={{borderColor:item.customOverride?"#f59e0b":"#e2e8f0"}}/>
                          </Fld>
                          <Fld label={`Overhead / ${item.unit}`}>
                            <Inp type="number" min={0} value={item.overhead} onChange={e=>updateItem(idx,"overhead",Number(e.target.value))} style={{borderColor:item.customOverride?"#f59e0b":"#e2e8f0"}}/>
                          </Fld>
                        </div>

                        {/* Row 3: totals + notes */}
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                          <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
                            <Badge label={item.grade} color={GRADE_CLR[item.grade]}/>
                            {item.customOverride&&(
                              <button onClick={()=>resetItemRates(idx)} style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:6,padding:"2px 10px",fontSize:".68rem",color:"#d97706",cursor:"pointer",fontFamily:"inherit"}}>
                                ↺ Reset to rate card
                              </button>
                            )}
                            {r&&<span style={{fontSize:".7rem",color:"#94a3b8"}}>{r.notes}</span>}
                          </div>
                          <div style={{textAlign:"right"}}>
                            <div style={{fontSize:".7rem",color:"#94a3b8"}}>Cost per {item.unit}: {fmt(calcItem(item).costPerUnit)}</div>
                            <div style={{fontWeight:800,color:"#1a1a2e",fontSize:"1rem",fontFamily:"'DM Serif Display',serif"}}>Total cost: {fmt(totalCost)}</div>
                          </div>
                        </div>

                        {/* Optional notes */}
                        <div style={{marginTop:10}}>
                          <Inp value={item.notes} onChange={e=>updateItem(idx,"notes",e.target.value)} placeholder="Item notes (optional)" style={{fontSize:".78rem",padding:"6px 10px"}}/>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Client Pricing Factor */}
                <div style={{background:"#fff",borderRadius:14,border:"1.5px solid #e2e8f0",padding:22,marginBottom:16}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                    <div>
                      <div style={{fontWeight:700,color:"#0f172a",fontSize:".98rem"}}>Client Pricing Factor</div>
                      <div style={{fontSize:".72rem",color:"#64748b",marginTop:2}}>Adjust pricing based on client type — discounts for loyal clients, premiums for difficult ones</div>
                    </div>
                    {form.clientPreset!=="Standard"&&(
                      <button onClick={()=>{setF("clientPreset","Standard");}} style={{background:"transparent",border:"1px solid #e2e8f0",borderRadius:6,padding:"4px 10px",fontSize:".72rem",color:"#64748b",cursor:"pointer",fontFamily:"inherit"}}>Reset to Standard</button>
                    )}
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:14}}>
                    {CLIENT_PRESETS.map(p=>{
                      const sel=form.clientPreset===p.label;
                      return(
                        <div key={p.label} onClick={()=>{
                          const base=DEFAULT_RATES[form.items[0]?.product||"Custom Shelving"]?.Standard?.markup||25;
                          setF("clientPreset",p.label);
                          setF("markup", Math.max(0, 25 + p.markupAdj));
                          setF("discount", Math.max(0, p.discountAdj));
                        }} style={{border:`2px solid ${sel?p.color:"#e2e8f0"}`,borderRadius:10,padding:"10px 12px",cursor:"pointer",background:sel?p.color+"10":"#fff",transition:"all .15s"}}>
                          <div style={{fontSize:"1.1rem",marginBottom:4}}>{p.icon}</div>
                          <div style={{fontWeight:700,color:sel?p.color:"#1e293b",fontSize:".82rem"}}>{p.label}</div>
                          <div style={{fontSize:".68rem",color:"#94a3b8",marginTop:3,lineHeight:1.3}}>{p.note}</div>
                          <div style={{display:"flex",gap:8,marginTop:6,flexWrap:"wrap"}}>
                            {p.markupAdj!==0&&<span style={{fontSize:".65rem",background:p.color+"18",color:p.color,padding:"1px 7px",borderRadius:10,fontWeight:700}}>Markup {p.markupAdj>0?"+":""}{p.markupAdj}%</span>}
                            {p.discountAdj>0&&<span style={{fontSize:".65rem",background:"#10b98118",color:"#059669",padding:"1px 7px",borderRadius:10,fontWeight:700}}>Discount {p.discountAdj}%</span>}
                            {p.markupAdj===0&&p.discountAdj===0&&<span style={{fontSize:".65rem",color:"#94a3b8"}}>Standard rates</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <Fld label="Client Note (internal only — won't show on client quotation)" hint="e.g. Referred by Mar, longtime client, or any context your team needs to know">
                    <Inp value={form.clientNote||""} onChange={e=>setF("clientNote",e.target.value)} placeholder="e.g. Referred by Paolo — be flexible on pricing. Or: Notorious for scope creep — price accordingly."/>
                  </Fld>
                </div>

                {/* Terms & Notes */}
                <div style={{background:"#fff",borderRadius:14,border:"1.5px solid #e2e8f0",padding:22}}>
                  <Divider label="Terms & Notes"/>
                  <Fld label="Payment Terms">
                    <Inp value={form.terms} onChange={e=>setF("terms",e.target.value)} rows={2}/>
                  </Fld>
                  <Fld label="Additional Notes">
                    <Inp value={form.notes} onChange={e=>setF("notes",e.target.value)} rows={2} placeholder="Scope exclusions, special conditions, etc."/>
                  </Fld>
                </div>
              </div>

              {/* Right: pricing panel */}
              <div style={{position:"sticky",top:80}}>
                <div style={{background:"#1a1a2e",borderRadius:16,padding:22,color:"#fff",marginBottom:14}}>
                  <div style={{fontFamily:"'DM Serif Display',serif",fontSize:"1rem",color:"#f59e0b",marginBottom:10,letterSpacing:-.2}}>Estimate Summary</div>
                  {form.clientPreset&&form.clientPreset!=="Standard"&&(()=>{
                    const p=CLIENT_PRESETS.find(x=>x.label===form.clientPreset);
                    return p?<div style={{background:p.color+"22",border:`1px solid ${p.color}44`,borderRadius:8,padding:"8px 12px",marginBottom:14,display:"flex",gap:8,alignItems:"center"}}>
                      <span style={{fontSize:"1rem"}}>{p.icon}</span>
                      <div><div style={{fontWeight:700,color:p.color,fontSize:".78rem"}}>{p.label}</div><div style={{fontSize:".65rem",color:p.color,opacity:.8}}>{p.note}</div></div>
                    </div>:null;
                  })()}

                  {[
                    ["Total Cost",    fmt(formTotals.totalCost),    "#94a3b8"],
                  ].map(([l,v,c])=>(
                    <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid rgba(255,255,255,.08)",fontSize:".85rem"}}>
                      <span style={{color:"#94a3b8"}}>{l}</span>
                      <span style={{color:c,fontWeight:600}}>{v}</span>
                    </div>
                  ))}

                  {/* Markup */}
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid rgba(255,255,255,.08)"}}>
                    <div style={{fontSize:".82rem",color:"#94a3b8"}}>Markup</div>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <input type="number" min={0} max={100} value={form.markup} onChange={e=>setF("markup",Number(e.target.value))} style={{width:56,background:"rgba(255,255,255,.1)",border:"1px solid rgba(255,255,255,.2)",borderRadius:6,padding:"4px 8px",color:"#fff",fontFamily:"inherit",fontSize:".82rem",textAlign:"center",outline:"none"}}/>
                      <span style={{color:"#94a3b8",fontSize:".82rem"}}>% = {fmt(formTotals.markupAmt)}</span>
                    </div>
                  </div>

                  {/* Discount */}
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid rgba(255,255,255,.08)"}}>
                    <div style={{fontSize:".82rem",color:"#94a3b8"}}>Discount</div>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <input type="number" min={0} max={100} value={form.discount} onChange={e=>setF("discount",Number(e.target.value))} style={{width:56,background:"rgba(255,255,255,.1)",border:"1px solid rgba(255,255,255,.2)",borderRadius:6,padding:"4px 8px",color:"#fff",fontFamily:"inherit",fontSize:".82rem",textAlign:"center",outline:"none"}}/>
                      <span style={{color:"#94a3b8",fontSize:".82rem"}}>% = ({fmt(formTotals.discountAmt)})</span>
                    </div>
                  </div>

                  {/* Grand Total */}
                  <div style={{borderTop:"1px solid rgba(255,255,255,.15)",marginTop:12,paddingTop:14}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
                      <span style={{fontSize:".78rem",color:"#94a3b8",textTransform:"uppercase",letterSpacing:"1px"}}>Grand Total</span>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontFamily:"'DM Serif Display',serif",fontSize:"1.7rem",color:"#fff",lineHeight:1}}>{fmt(formTotals.total)}</div>
                      </div>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",marginTop:10,padding:"10px 12px",background:"rgba(255,255,255,.06)",borderRadius:8}}>
                      <span style={{fontSize:".75rem",color:"#94a3b8"}}>Profit</span>
                      <span style={{fontWeight:700,color:"#4ade80",fontSize:".85rem"}}>{fmt(formTotals.profit)}</span>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",padding:"6px 12px",background:"rgba(255,255,255,.06)",borderRadius:8,marginTop:4}}>
                      <span style={{fontSize:".75rem",color:"#94a3b8"}}>Margin</span>
                      <span style={{fontWeight:700,color:formTotals.margin>=20?"#4ade80":"#fbbf24",fontSize:".85rem"}}>{formTotals.margin}%</span>
                    </div>
                  </div>
                </div>

                {/* Per-item cost table */}
                {form.items.length>0&&(
                  <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",padding:16}}>
                    <div style={{fontSize:".68rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"1px",color:"#94a3b8",marginBottom:10}}>Cost per Line</div>
                    {form.items.map((item,i)=>(
                      <div key={item.id} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #f1f5f9",fontSize:".78rem"}}>
                        <span style={{color:"#64748b",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"55%"}}>{item.description||item.product}</span>
                        <span style={{fontWeight:600,color:"#0f172a"}}>{fmt(calcItem(item).totalCost)}</span>
                      </div>
                    ))}
                    <div style={{display:"flex",justifyContent:"space-between",paddingTop:8,fontSize:".82rem",fontWeight:700}}>
                      <span>Total Cost</span><span style={{color:"#ef4444"}}>{fmt(formTotals.totalCost)}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ══ ESTIMATE PREVIEW ══════════════════════════════════════════════ */}
        {tab==="estimates" && view==="preview" && est && (()=>{
          const t = calcEstimate(est.items, est.markup, est.discount);
          return(
            <div className="fade">
              {/* Controls */}
              <div style={{display:"flex",gap:10,marginBottom:20,alignItems:"center",flexWrap:"wrap"}} className="noprint">
                <Btn variant="ghost" small onClick={()=>setView("list")}>← Back</Btn>
                <Btn variant="ghost" small onClick={()=>editEstimate(est)}>✏ Edit</Btn>
                <div style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:8,display:"flex",overflow:"hidden"}}>
                  {[["internal","📊 Internal Cost Sheet"],["client","📄 Client Quotation"]].map(([m,l])=>(
                    <button key={m} onClick={()=>setPreviewMode(m)} style={{background:previewMode===m?"#1a1a2e":"transparent",color:previewMode===m?"#fff":"#64748b",border:"none",padding:"7px 14px",fontFamily:"inherit",fontWeight:600,fontSize:".78rem",cursor:"pointer",transition:"all .15s"}}>{l}</button>
                  ))}
                </div>
                <Btn variant="amber" small onClick={()=>window.print()}>🖨 Print / Save PDF</Btn>
                <div style={{marginLeft:"auto",display:"flex",gap:8}}>
                  <Btn variant="ghost" small onClick={()=>{const u={...est,status:"Sent"};setEstimates(es=>es.map(e=>e.id===est.id?u:e));}}>Mark as Sent</Btn>
                  <Btn variant="green" small onClick={()=>{const u={...est,status:"Accepted"};setEstimates(es=>es.map(e=>e.id===est.id?u:e));}}>Mark as Accepted</Btn>
                </div>
              </div>

              {/* ── INTERNAL COST SHEET ── */}
              {previewMode==="internal" && (
                <div className="printarea" style={{background:"#fff",borderRadius:14,border:"1.5px solid #e2e8f0",maxWidth:900,margin:"0 auto",overflow:"hidden",boxShadow:"0 4px 24px rgba(0,0,0,.08)"}}>
                  <div style={{background:"#1a1a2e",padding:"22px 32px",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div>
                      <div style={{fontFamily:"'DM Serif Display',serif",fontSize:"1.5rem",color:"#fff"}}>INTERNAL COST SHEET</div>
                      <div style={{fontSize:".72rem",color:"rgba(255,255,255,.5)",marginTop:3,textTransform:"uppercase",letterSpacing:"1px"}}>GMD Productions Inc. — Confidential</div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontFamily:"'DM Serif Display',serif",color:"#f59e0b",fontSize:"1.1rem"}}>{est.estNo}</div>
                      <div style={{fontSize:".72rem",color:"rgba(255,255,255,.5)",marginTop:3}}>{est.date}</div>
                      <Badge label={est.status} color={statusColor[est.status]||"#94a3b8"}/>
                    </div>
                  </div>
                  <div style={{height:3,background:"linear-gradient(90deg,#f59e0b,#10b981)"}}/>
                  <div style={{padding:"24px 32px",fontFamily:"'Barlow',sans-serif"}}>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginBottom:22,paddingBottom:22,borderBottom:"1.5px solid #f1f5f9"}}>
                      <div>
                        <div style={{fontSize:".65rem",textTransform:"uppercase",letterSpacing:"1px",color:"#94a3b8",marginBottom:8,fontWeight:700}}>Client</div>
                        {[["Client",est.client],["Contact",est.contact||"—"],["Project",est.projectName||"—"]].map(([l,v])=>(
                          <div key={l} style={{marginBottom:5}}><span style={{fontSize:".7rem",color:"#94a3b8"}}>{l}: </span><span style={{fontSize:".85rem",fontWeight:600,color:"#0f172a"}}>{v}</span></div>
                        ))}
                      </div>
                      <div>
                        <div style={{fontSize:".65rem",textTransform:"uppercase",letterSpacing:"1px",color:"#94a3b8",marginBottom:8,fontWeight:700}}>Estimate</div>
                        {[["Prepared By",est.preparedBy||"—"],["Date",est.date],["Valid Until",est.validUntil||"—"]].map(([l,v])=>(
                          <div key={l} style={{marginBottom:5}}><span style={{fontSize:".7rem",color:"#94a3b8"}}>{l}: </span><span style={{fontSize:".85rem",fontWeight:600,color:"#0f172a"}}>{v}</span></div>
                        ))}
                      </div>
                    </div>

                    {/* Detailed cost table */}
                    <table style={{width:"100%",fontSize:".78rem",marginBottom:20}}>
                      <thead>
                        <tr style={{background:"#f8fafc"}}>
                          {["Description","Product","Grade","Qty","Unit","Mat/unit","Labor/unit","OH/unit","Cost/unit","Total Cost"].map(h=>(
                            <th key={h} style={{padding:"8px 10px",textAlign:h==="Qty"||h==="Total Cost"||h.includes("/unit")?"right":"left",fontSize:".65rem",textTransform:"uppercase",letterSpacing:".5px",color:"#94a3b8",fontWeight:700,borderBottom:"1.5px solid #e2e8f0",whiteSpace:"nowrap"}}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {est.items.map((item,i)=>{
                          const {costPerUnit,totalCost}=calcItem(item);
                          return(
                            <tr key={item.id} className="row-hover" style={{borderBottom:"1px solid #f1f5f9"}}>
                              <td style={{padding:"9px 10px",fontWeight:600,color:"#0f172a",maxWidth:160}}>{item.description||"—"}{item.notes&&<div style={{fontSize:".68rem",color:"#94a3b8",fontStyle:"italic"}}>{item.notes}</div>}</td>
                              <td style={{padding:"9px 10px",color:"#64748b"}}>{item.product}</td>
                              <td style={{padding:"9px 10px"}}><Badge label={item.grade} color={GRADE_CLR[item.grade]} small/>{item.customOverride&&<span style={{marginLeft:4,fontSize:".6rem",color:"#f59e0b"}}>⚠ override</span>}</td>
                              <td style={{padding:"9px 10px",textAlign:"right",color:"#0f172a"}}>{item.qty}</td>
                              <td style={{padding:"9px 10px",color:"#64748b"}}>{item.unit}</td>
                              <td style={{padding:"9px 10px",textAlign:"right",color:"#64748b"}}>{fmt(item.matCost)}</td>
                              <td style={{padding:"9px 10px",textAlign:"right",color:"#64748b"}}>{fmt(item.laborCost)}</td>
                              <td style={{padding:"9px 10px",textAlign:"right",color:"#64748b"}}>{fmt(item.overhead)}</td>
                              <td style={{padding:"9px 10px",textAlign:"right",fontWeight:600,color:"#0f172a"}}>{fmt(costPerUnit)}</td>
                              <td style={{padding:"9px 10px",textAlign:"right",fontWeight:700,color:"#1a1a2e"}}>{fmt(totalCost)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {/* Cost summary */}
                    <div style={{display:"grid",gridTemplateColumns:"1fr 280px",gap:24}}>
                      <div>
                        {est.clientNote&&<div style={{background:"#fef9c3",border:"1px solid #fde68a",borderRadius:8,padding:"12px 14px",fontSize:".8rem",color:"#92400e",marginBottom:8}}><strong>🔒 Internal Note:</strong> {est.clientNote}</div>}
                    {est.notes&&<div style={{background:"#f8fafc",borderRadius:8,padding:"12px 14px",fontSize:".8rem",color:"#64748b"}}><strong>Notes:</strong> {est.notes}</div>}
                        {est.terms&&<div style={{background:"#f8fafc",borderRadius:8,padding:"12px 14px",fontSize:".8rem",color:"#64748b",marginTop:8}}><strong>Terms:</strong> {est.terms}</div>}
                      </div>
                      <div style={{background:"#1a1a2e",borderRadius:12,padding:"16px 18px"}}>
                        {[
                          ["Total Cost",     fmt(t.totalCost),    "#94a3b8"],
                          [`Markup (${est.markup}%)`,fmt(t.markupAmt), "#f59e0b"],
                          est.discount>0?[`Discount (${est.discount}%)`,`(${fmt(t.discountAmt)})`,"#ef4444"]:null,
                          ["Grand Total",    fmt(t.total),        "#fff"],
                          ["Profit",         fmt(t.profit),       "#4ade80"],
                          ["Margin",         t.margin+"%",        t.margin>=20?"#4ade80":"#fbbf24"],
                        ].filter(Boolean).map(([l,v,c],i,arr)=>(
                          <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:i<arr.length-1?"1px solid rgba(255,255,255,.08)":"none",fontSize:i===arr.indexOf(arr.find(x=>x[0]==="Grand Total"))?.88:.8}}>
                            <span style={{color:"#94a3b8"}}>{l}</span>
                            <span style={{color:c,fontWeight:i===arr.indexOf(arr.find(x=>x[0]==="Grand Total"))?800:600}}>{v}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── CLIENT QUOTATION ── */}
              {previewMode==="client" && (
                <div className="printarea" style={{background:"#fff",borderRadius:14,border:"1.5px solid #e2e8f0",maxWidth:820,margin:"0 auto",overflow:"hidden",boxShadow:"0 4px 24px rgba(0,0,0,.08)"}}>
                  {/* Header */}
                  <div style={{background:"#1a1a2e",padding:"28px 36px",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div>
                      <div style={{fontFamily:"'DM Serif Display',serif",fontSize:"1.8rem",color:"#fff",letterSpacing:-.5}}>QUOTATION</div>
                      <div style={{fontSize:".72rem",color:"rgba(255,255,255,.5)",marginTop:3,textTransform:"uppercase",letterSpacing:"1px"}}>GMD Productions Inc.</div>
                      <div style={{fontSize:".72rem",color:"rgba(255,255,255,.4)",marginTop:2}}>Retail Fabrication Specialist</div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontFamily:"'DM Serif Display',serif",color:"#f59e0b",fontSize:"1.3rem"}}>{est.estNo}</div>
                      <div style={{fontSize:".72rem",color:"rgba(255,255,255,.5)",marginTop:4}}>Date: {est.date}</div>
                      {est.validUntil&&<div style={{fontSize:".72rem",color:"rgba(255,255,255,.5)",marginTop:2}}>Valid until: {est.validUntil}</div>}
                    </div>
                  </div>
                  <div style={{height:4,background:"linear-gradient(90deg,#f59e0b,#10b981)"}}/>

                  <div style={{padding:"28px 36px",fontFamily:"'Barlow',sans-serif"}}>
                    {/* Client info */}
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginBottom:24,paddingBottom:20,borderBottom:"1.5px solid #f1f5f9"}}>
                      <div>
                        <div style={{fontSize:".65rem",textTransform:"uppercase",letterSpacing:"1px",color:"#94a3b8",marginBottom:8,fontWeight:700}}>Prepared For</div>
                        <div style={{fontWeight:700,fontSize:"1.05rem",color:"#0f172a"}}>{est.client}</div>
                        {est.contact&&<div style={{fontSize:".82rem",color:"#64748b",marginTop:2}}>{est.contact}</div>}
                      </div>
                      <div>
                        <div style={{fontSize:".65rem",textTransform:"uppercase",letterSpacing:"1px",color:"#94a3b8",marginBottom:8,fontWeight:700}}>Project</div>
                        <div style={{fontWeight:700,color:"#0f172a"}}>{est.projectName||"—"}</div>
                        {est.preparedBy&&<div style={{fontSize:".78rem",color:"#64748b",marginTop:2}}>Prepared by: {est.preparedBy}</div>}
                      </div>
                    </div>

                    {/* Scope table — NO cost breakdown shown to client */}
                    <div style={{marginBottom:22}}>
                      <div style={{fontWeight:700,color:"#0f172a",fontSize:".9rem",marginBottom:10,borderLeft:"3px solid #f59e0b",paddingLeft:10}}>SCOPE OF WORK</div>
                      <table style={{width:"100%",fontSize:".82rem"}}>
                        <thead>
                          <tr style={{background:"#1a1a2e"}}>
                            {["#","Description","Product / Grade","Qty","Unit","Unit Price","Amount"].map(h=>(
                              <th key={h} style={{padding:"9px 12px",textAlign:["Qty","Unit Price","Amount"].includes(h)?"right":"left",fontSize:".68rem",textTransform:"uppercase",letterSpacing:".5px",color:"rgba(255,255,255,.7)",fontWeight:600,whiteSpace:"nowrap"}}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {est.items.map((item,i)=>{
                            const {costPerUnit,totalCost}=calcItem(item);
                            const markup=1+(est.markup/100);
                            const discount=1-(est.discount/100);
                            const unitPrice=costPerUnit*markup*discount;
                            const lineTotal=unitPrice*item.qty;
                            return(
                              <tr key={item.id} className="row-hover" style={{borderBottom:"1px solid #f1f5f9",background:i%2?"#fafafa":"#fff"}}>
                                <td style={{padding:"10px 12px",color:"#94a3b8",fontWeight:600}}>{i+1}</td>
                                <td style={{padding:"10px 12px",fontWeight:600,color:"#0f172a"}}>
                                  {item.description||item.product}
                                  {item.notes&&<div style={{fontSize:".72rem",color:"#94a3b8",marginTop:2,fontStyle:"italic"}}>{item.notes}</div>}
                                </td>
                                <td style={{padding:"10px 12px"}}><Badge label={`${item.product} · ${item.grade}`} color={GRADE_CLR[item.grade]} small/></td>
                                <td style={{padding:"10px 12px",textAlign:"right",color:"#0f172a"}}>{item.qty}</td>
                                <td style={{padding:"10px 12px",color:"#64748b"}}>{item.unit}</td>
                                <td style={{padding:"10px 12px",textAlign:"right",fontWeight:600,color:"#0f172a"}}>{fmt(unitPrice)}</td>
                                <td style={{padding:"10px 12px",textAlign:"right",fontWeight:700,color:"#1a1a2e"}}>{fmt(lineTotal)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Grand total */}
                    <div style={{display:"flex",justifyContent:"flex-end",marginBottom:24}}>
                      <div style={{minWidth:280}}>
                        {est.discount>0&&(
                          <div style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid #f1f5f9",fontSize:".85rem"}}>
                            <span style={{color:"#64748b"}}>Subtotal</span>
                            <span style={{fontWeight:600}}>{fmt(t.subtotal)}</span>
                          </div>
                        )}
                        {est.discount>0&&(
                          <div style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid #f1f5f9",fontSize:".85rem"}}>
                            <span style={{color:"#64748b"}}>Discount ({est.discount}%)</span>
                            <span style={{fontWeight:600,color:"#ef4444"}}>({fmt(t.discountAmt)})</span>
                          </div>
                        )}
                        <div style={{display:"flex",justifyContent:"space-between",padding:"12px 0",background:"#1a1a2e",borderRadius:8,paddingLeft:16,paddingRight:16,marginTop:6}}>
                          <span style={{fontWeight:700,color:"#fff",fontSize:".9rem",textTransform:"uppercase",letterSpacing:".5px"}}>Grand Total</span>
                          <span style={{fontFamily:"'DM Serif Display',serif",fontWeight:700,color:"#f59e0b",fontSize:"1.3rem"}}>{fmt(t.total)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Terms & Footer */}
                    <div style={{background:"#f8fafc",borderRadius:10,padding:"16px 18px",marginBottom:16}}>
                      <div style={{fontSize:".72rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"1px",color:"#94a3b8",marginBottom:8}}>Payment Terms</div>
                      <div style={{fontSize:".82rem",color:"#0f172a"}}>{est.terms}</div>
                    </div>
                    {est.notes&&(
                      <div style={{background:"#fff7ed",borderRadius:10,padding:"12px 16px",marginBottom:16,border:"1px solid #fed7aa"}}>
                        <div style={{fontSize:".72rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"1px",color:"#d97706",marginBottom:6}}>Notes</div>
                        <div style={{fontSize:".82rem",color:"#92400e"}}>{est.notes}</div>
                      </div>
                    )}
                    <div style={{borderTop:"1.5px solid #f1f5f9",paddingTop:16,display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                      {["Prepared by / Authorized Signatory","Client Conforme"].map(l=>(
                        <div key={l} style={{textAlign:"center"}}>
                          <div style={{height:1,background:"#1a1a2e",marginTop:40,marginBottom:6}}/>
                          <div style={{fontSize:".7rem",color:"#94a3b8"}}>{l}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ══════════════════════════════════════════════════════════════════
            RATE CARD TAB
        ══════════════════════════════════════════════════════════════════ */}
        {tab==="ratecard" && (
          <div className="fade">
            <div style={{marginBottom:20}}>
              <h1 style={{margin:0,fontFamily:"'DM Serif Display',serif",fontSize:"1.6rem",color:"#0f172a"}}>Rate Card</h1>
              <p style={{margin:"4px 0 0",color:"#64748b",fontSize:".82rem"}}>Your base costs per product and material grade. Click any cell to edit. These rates auto-fill into new estimates.</p>
            </div>

            {/* Product type selector */}
            <div style={{display:"flex",gap:8,marginBottom:18,flexWrap:"wrap"}}>
              {PRODUCT_TYPES.map(p=>(
                <button key={p} onClick={()=>setRcProduct(p)} style={{padding:"7px 14px",borderRadius:20,border:`1.5px solid ${rcProduct===p?"#1a1a2e":"#e2e8f0"}`,background:rcProduct===p?"#1a1a2e":"#fff",color:rcProduct===p?"#fff":"#64748b",fontFamily:"inherit",fontWeight:rcProduct===p?700:400,fontSize:".8rem",cursor:"pointer",transition:"all .15s"}}>
                  {p}
                </button>
              ))}
            </div>

            {/* Rate table for selected product */}
            <div style={{background:"#fff",borderRadius:14,border:"1.5px solid #e2e8f0",overflow:"hidden",boxShadow:"0 1px 6px rgba(0,0,0,.04)"}}>
              <div style={{background:"#1a1a2e",padding:"14px 22px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{fontFamily:"'DM Serif Display',serif",fontSize:"1.1rem",color:"#fff"}}>{rcProduct}</div>
                <div style={{fontSize:".72rem",color:"rgba(255,255,255,.45)"}}>Click any row to edit rates</div>
              </div>
              <table style={{width:"100%",fontSize:".82rem"}}>
                <thead>
                  <tr style={{background:"#f8fafc"}}>
                    {["Grade","Unit","Material Cost","Labor Cost","Overhead","Cost/Unit","Default Markup","Sell Price/Unit","Notes",""].map(h=>(
                      <th key={h} style={{padding:"10px 14px",textAlign:["Material Cost","Labor Cost","Overhead","Cost/Unit","Default Markup","Sell Price/Unit"].includes(h)?"right":"left",fontSize:".65rem",textTransform:"uppercase",letterSpacing:".5px",color:"#94a3b8",fontWeight:700,borderBottom:"1.5px solid #e2e8f0",whiteSpace:"nowrap"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {GRADES.map(grade=>{
                    const r = rates[rcProduct]?.[grade] || {};
                    const costUnit = (r.matCost||0)+(r.laborCost||0)+(r.overhead||0);
                    const sellUnit = costUnit*(1+(r.markup||25)/100);
                    return(
                      <tr key={grade} className="row-hover" style={{borderBottom:"1px solid #f1f5f9",cursor:"pointer"}} onClick={()=>openRcEdit(rcProduct,grade)}>
                        <td style={{padding:"12px 14px"}}><Badge label={grade} color={GRADE_CLR[grade]}/></td>
                        <td style={{padding:"12px 14px",color:"#64748b"}}>{r.unit||"—"}</td>
                        <td style={{padding:"12px 14px",textAlign:"right",color:"#0f172a"}}>{r.matCost?fmt(r.matCost):"—"}</td>
                        <td style={{padding:"12px 14px",textAlign:"right",color:"#0f172a"}}>{r.laborCost?fmt(r.laborCost):"—"}</td>
                        <td style={{padding:"12px 14px",textAlign:"right",color:"#0f172a"}}>{r.overhead?fmt(r.overhead):"—"}</td>
                        <td style={{padding:"12px 14px",textAlign:"right",fontWeight:700,color:"#1a1a2e"}}>{costUnit?fmt(costUnit):"—"}</td>
                        <td style={{padding:"12px 14px",textAlign:"right",color:"#10b981",fontWeight:600}}>{r.markup||25}%</td>
                        <td style={{padding:"12px 14px",textAlign:"right",fontWeight:700,color:"#f59e0b",fontFamily:"'DM Serif Display',serif",fontSize:".95rem"}}>{sellUnit?fmt(sellUnit):"—"}</td>
                        <td style={{padding:"12px 14px",color:"#94a3b8",fontSize:".75rem",fontStyle:"italic",maxWidth:200}}>{r.notes||"—"}</td>
                        <td style={{padding:"12px 14px"}}><span style={{fontSize:".72rem",color:"#3b82f6",fontWeight:600}}>✏ Edit</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* GMD Project Benchmarks */}
            <div style={{marginTop:24,marginBottom:24}}>
              <div style={{fontWeight:700,color:"#0f172a",marginBottom:12,fontSize:".92rem"}}>GMD Project Benchmarks — Actual Awarded Projects</div>
              <div style={{background:"#fff7ed",border:"1.5px solid #fed7aa",borderRadius:12,padding:"12px 16px",marginBottom:14,fontSize:".8rem",color:"#92400e"}}>
                🚨 <strong>₱3M Rule:</strong> Any project at or above ₱3,000,000 requires Paulo Garcia's direct involvement. Paolo can ballpark-quote ranges to clients but <strong>cannot commit pricing</strong> without Paulo's sign-off.
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10,marginBottom:20}}>
                {GMD_PROJECT_BENCHMARKS.map(b=>(
                  <div key={b.type} style={{background:"#fff",borderRadius:10,border:"1.5px solid #e2e8f0",padding:"13px 16px"}}>
                    <div style={{fontWeight:700,color:"#0f172a",fontSize:".88rem",marginBottom:4}}>{b.type}</div>
                    <div style={{fontFamily:"'DM Serif Display',serif",fontWeight:700,color:"#f59e0b",fontSize:"1.1rem"}}>
                      {b.high?`₱${(b.low/1000000).toFixed(1)}M – ₱${(b.high/1000000).toFixed(1)}M`:`₱${(b.low/1000000).toFixed(1)}M+`}
                    </div>
                    <div style={{fontSize:".72rem",color:"#94a3b8",marginTop:4}}>{b.note}</div>
                  </div>
                ))}
              </div>
              <div style={{fontWeight:700,color:"#0f172a",marginBottom:10,fontSize:".88rem"}}>GMD Labor Rates — Confirmed (Engr. Rodney)</div>
              <div style={{background:"#fff",borderRadius:10,border:"1.5px solid #e2e8f0",overflow:"hidden"}}>
                <table style={{width:"100%",fontSize:".82rem",borderCollapse:"collapse"}}>
                  <thead><tr style={{background:"#1a1a2e"}}>{["Position","Day Rate","OT Rate / hr","Notes"].map(h=><th key={h} style={{padding:"8px 14px",textAlign:"left",color:"rgba(255,255,255,.7)",fontSize:".68rem",textTransform:"uppercase",letterSpacing:".5px",fontWeight:600}}>{h}</th>)}</tr></thead>
                  <tbody>{Object.entries(GMD_LABOR_RATES).map(([pos,r],i)=>(
                    <tr key={pos} style={{borderBottom:"1px solid #f1f5f9",background:i%2?"#fafafa":"#fff"}}>
                      <td style={{padding:"10px 14px",fontWeight:600,color:"#0f172a"}}>{pos}</td>
                      <td style={{padding:"10px 14px",color:"#059669",fontWeight:700}}>₱{r.day.toLocaleString()}</td>
                      <td style={{padding:"10px 14px",color:"#64748b"}}>₱{r.ot.toFixed(2)}</td>
                      <td style={{padding:"10px 14px",color:"#94a3b8",fontSize:".75rem"}}>Per PH Labor Code. OT = day rate ÷ 8 × 1.25</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <div style={{fontWeight:700,color:"#0f172a",marginBottom:10,fontSize:".88rem",marginTop:20}}>Standard Line Items — Always Include in Mall Projects</div>
              <div style={{background:"#fff",borderRadius:10,border:"1.5px solid #e2e8f0",overflow:"hidden"}}>
                <table style={{width:"100%",fontSize:".82rem",borderCollapse:"collapse"}}>
                  <thead><tr style={{background:"#1a1a2e"}}>{["Line Item","Low (₱)","High (₱)","Note"].map(h=><th key={h} style={{padding:"8px 14px",textAlign:"left",color:"rgba(255,255,255,.7)",fontSize:".68rem",textTransform:"uppercase",letterSpacing:".5px",fontWeight:600}}>{h}</th>)}</tr></thead>
                  <tbody>{GMD_STANDARD_LINE_ITEMS.map((li,i)=>(
                    <tr key={li.item} style={{borderBottom:"1px solid #f1f5f9",background:i%2?"#fafafa":"#fff"}}>
                      <td style={{padding:"9px 14px",fontWeight:600,color:"#0f172a"}}>{li.item}</td>
                      <td style={{padding:"9px 14px",color:"#64748b"}}>₱{li.low.toLocaleString()}</td>
                      <td style={{padding:"9px 14px",color:"#64748b"}}>₱{li.high.toLocaleString()}</td>
                      <td style={{padding:"9px 14px",color:"#94a3b8",fontSize:".75rem"}}>{li.note}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>

            {/* Summary across all products */}
            <div style={{marginTop:24}}>
              <div style={{fontWeight:700,color:"#0f172a",marginBottom:12,fontSize:".92rem"}}>All Products — Standard Grade Quick View</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
                {PRODUCT_TYPES.map(p=>{
                  const r=rates[p]?.Standard||{};
                  const cost=(r.matCost||0)+(r.laborCost||0)+(r.overhead||0);
                  const sell=cost*(1+(r.markup||25)/100);
                  return(
                    <div key={p} onClick={()=>{setRcProduct(p);}} style={{background:"#fff",borderRadius:10,border:"1.5px solid #e2e8f0",padding:"13px 16px",cursor:"pointer",transition:"all .15s"}}
                      onMouseEnter={e=>{e.currentTarget.style.borderColor="#1a1a2e";e.currentTarget.style.boxShadow="0 4px 12px rgba(0,0,0,.08)";}}
                      onMouseLeave={e=>{e.currentTarget.style.borderColor="#e2e8f0";e.currentTarget.style.boxShadow="none";}}>
                      <div style={{fontWeight:700,color:"#0f172a",fontSize:".88rem",marginBottom:4}}>{p}</div>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
                        <span style={{fontSize:".72rem",color:"#94a3b8"}}>Standard · per {r.unit||"unit"}</span>
                        <span style={{fontFamily:"'DM Serif Display',serif",fontWeight:700,color:"#f59e0b",fontSize:"1rem"}}>{sell?fmt(sell):"—"}</span>
                      </div>
                      <div style={{fontSize:".68rem",color:"#94a3b8",marginTop:2}}>Cost: {fmt(cost)} · {r.markup||25}% markup</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── RATE CARD EDIT MODAL ── */}
      <Modal open={rcEditModal} onClose={()=>setRcEditModal(false)} title={`Edit Rate — ${rcEditForm.product} · ${rcEditForm.grade}`} wide>
        <div style={{background:GRADE_CLR[rcEditForm.grade]+"10",border:`1.5px solid ${GRADE_CLR[rcEditForm.grade]}30`,borderRadius:10,padding:"10px 14px",marginBottom:18,display:"flex",gap:8,alignItems:"center"}}>
          <Badge label={rcEditForm.grade} color={GRADE_CLR[rcEditForm.grade]}/>
          <span style={{fontSize:".78rem",color:"#64748b"}}>All costs are <strong>per unit</strong> (per {rcEditForm.unit||"unit"}). Your QS fills in the real GMD rates here.</span>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          <Fld label="Unit of Measure">
            <Sel value={rcEditForm.unit||"sqm"} onChange={e=>setRcEditForm(p=>({...p,unit:e.target.value}))}>
              {UNITS.map(u=><option key={u}>{u}</option>)}
            </Sel>
          </Fld>
          <Fld label="Default Markup %" hint="Applied on top of total cost">
            <Inp type="number" min={0} max={100} value={rcEditForm.markup||25} onChange={e=>setRcEditForm(p=>({...p,markup:e.target.value}))}/>
          </Fld>
          <Fld label={`Material Cost per ${rcEditForm.unit||"unit"} (₱)`} hint="Raw materials, consumables">
            <Inp type="number" min={0} value={rcEditForm.matCost||0} onChange={e=>setRcEditForm(p=>({...p,matCost:e.target.value}))}/>
          </Fld>
          <Fld label={`Labor Cost per ${rcEditForm.unit||"unit"} (₱)`} hint="Fabrication, installation">
            <Inp type="number" min={0} value={rcEditForm.laborCost||0} onChange={e=>setRcEditForm(p=>({...p,laborCost:e.target.value}))}/>
          </Fld>
          <Fld label={`Overhead per ${rcEditForm.unit||"unit"} (₱)`} hint="Equipment, utilities, admin">
            <Inp type="number" min={0} value={rcEditForm.overhead||0} onChange={e=>setRcEditForm(p=>({...p,overhead:e.target.value}))}/>
          </Fld>
          <Fld label="Notes / Spec Description">
            <Inp value={rcEditForm.notes||""} onChange={e=>setRcEditForm(p=>({...p,notes:e.target.value}))} placeholder="e.g. MDF with veneer, soft-close hardware"/>
          </Fld>
        </div>

        {/* Live calculation preview */}
        {(()=>{
          const cost=(Number(rcEditForm.matCost)||0)+(Number(rcEditForm.laborCost)||0)+(Number(rcEditForm.overhead)||0);
          const sell=cost*(1+(Number(rcEditForm.markup)||25)/100);
          const profit=sell-cost;
          return(
            <div style={{background:"#1a1a2e",borderRadius:10,padding:"14px 18px",marginTop:6,display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10}}>
              {[["Cost/unit",fmt(cost),"#94a3b8"],["Markup",fmt(sell-cost),"#f59e0b"],["Sell Price",fmt(sell),"#fff"],["Margin",(cost>0?Math.round((sell-cost)/sell*100):0)+"%","#4ade80"]].map(([l,v,c])=>(
                <div key={l} style={{textAlign:"center"}}>
                  <div style={{fontFamily:"'DM Serif Display',serif",fontWeight:700,fontSize:"1.05rem",color:c}}>{v}</div>
                  <div style={{fontSize:".65rem",color:"rgba(255,255,255,.4)",marginTop:3,textTransform:"uppercase",letterSpacing:".5px"}}>{l}</div>
                </div>
              ))}
            </div>
          );
        })()}

        <div style={{display:"flex",gap:10,marginTop:18}}>
          <Btn full onClick={saveRcEdit}>Save Rate</Btn>
          <Btn variant="ghost" onClick={()=>setRcEditModal(false)}>Cancel</Btn>
        </div>
      </Modal>
    </div>
  );
}
