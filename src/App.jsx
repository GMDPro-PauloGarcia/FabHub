import { useState, useMemo, useEffect, useCallback } from "react";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
// GMD's real 11-stage pipeline
const DEAL_STAGES = [
  "Stage 01 — Acquisition",
  "Stage 02 — Briefing",
  "Stage 03 — CE Drafting",
  "Stage 04 — Paulo Review",
  "Stage 05 — 4-Way Sign-Off",
  "Stage 06 — Signed CE/PO",
  "Stage 07 — Initial Billing",
  "Stage 08 — Production",
  "Stage 09 — Delivery & Punchlist",
  "Stage 10 — Balance Billing",
  "Stage 11 — Closed",
  "Cancelled",
];
const ACTIVE_STAGES  = ["Stage 01 — Acquisition","Stage 02 — Briefing","Stage 03 — CE Drafting","Stage 04 — Paulo Review","Stage 05 — 4-Way Sign-Off","Stage 06 — Signed CE/PO","Stage 07 — Initial Billing","Stage 08 — Production","Stage 09 — Delivery & Punchlist","Stage 10 — Balance Billing"];
const WON_STAGES     = ["Stage 06 — Signed CE/PO","Stage 07 — Initial Billing","Stage 08 — Production","Stage 09 — Delivery & Punchlist","Stage 10 — Balance Billing","Stage 11 — Closed"];
const PAULO_GATE     = ["Stage 04 — Paulo Review","Stage 05 — 4-Way Sign-Off"];
const CE_TYPES       = ["Fabrication / General","Construction"];
const PROD_STAGES     = ["Design","Fabrication","QC","Delivery"];
const DESIGN_STATUSES = ["Briefing","On-going","First Pass","Revision","Production Plans","Done"];
const PRODUCT_TYPES   = ["Custom Shelving","Display Fixtures","Signage","Countertops","Retail Cabinetry","Kiosks","Wall Panels","Millwork","Other"];
// GMD Real Team
const SALES_TEAM   = ["Paulo Garcia","Paolo Gomez","Gail De Ello","Jena De Asis","Wyn Celmar"];
const PROD_MEMBERS = ["Paulo Garcia","Paolo Gomez","Gail De Ello","Jena De Asis","Wyn Celmar","Rodney (QS/CE)","Jerome Mendoza (On-call CE)","Carlo M.","Dana R.","Enzo P.","Faye T.","Gino A.","Hana C.","Ivan L.","Jade O."];
const DESIGN_MEMBERS  = ["Alex R.","Bea T.","Chris N.","Diana L.","Edric M.","Freelancer / Outsourced"];
const MAT_UNITS       = ["pcs","sheets","meters","kg","sets","rolls","liters","sqm"];
const EXP_CATS        = ["Materials","Labor","Overhead","Utilities","Rent","Transport","Marketing","Salaries","Subcontractor","Other"];
const SWATCH_CATS     = ["Fabric","Paint","Hardware","Wood","Metal","Glass","Laminate","Tile","Lighting","Fixture","Trim","Adhesive","Other"];
const SWATCH_STATUS   = ["To Buy","Ordered","Received"];
const PAY_STATUS      = ["Unpaid","Partial","Deposited","Paid"];
const MONTHS          = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const PRIORITIES      = ["Normal","High","Urgent"];

const STAGE_CLR = {
  "Stage 01 — Acquisition":"#94a3b8",
  "Stage 02 — Briefing":"#60a5fa",
  "Stage 03 — CE Drafting":"#a78bfa",
  "Stage 04 — Paulo Review":"#f59e0b",
  "Stage 05 — 4-Way Sign-Off":"#f97316",
  "Stage 06 — Signed CE/PO":"#10b981",
  "Stage 07 — Initial Billing":"#06b6d4",
  "Stage 08 — Production":"#3b82f6",
  "Stage 09 — Delivery & Punchlist":"#8b5cf6",
  "Stage 10 — Balance Billing":"#ec4899",
  "Stage 11 — Closed":"#059669",
  "Cancelled":"#ef4444",
};
const PROD_CLR  = { Design:"#8b5cf6",Fabrication:"#f97316",QC:"#eab308",Delivery:"#10b981" };
const PAY_CLR   = { Unpaid:"#ef4444",Partial:"#f59e0b",Deposited:"#10b981",Paid:"#059669" };
const PRI_CLR   = { Normal:"#3b82f6",High:"#f59e0b",Urgent:"#ef4444" };
const DS_CLR    = { Briefing:"#94a3b8","On-going":"#3b82f6","First Pass":"#8b5cf6",Revision:"#f97316","Production Plans":"#eab308",Done:"#10b981" };
const SW_CLR    = { "To Buy":"#ef4444",Ordered:"#f59e0b",Received:"#10b981" };
const ROLE_CLR  = { Manager:"#f59e0b",Sales:"#10b981",Finance:"#3b82f6",Operations:"#f97316",Design:"#8b5cf6" };

const CL_TYPES  = ["Purchase","Supplier Job","Permit","Task","Site Visit","Client Approval"];
const CL_STATUS = ["To Do","In Progress","Done"];
const CL_DEPT   = ["Operations","Design","Procurement","Sales","Finance","Management"];
const TYPE_ICON = { Purchase:"🛒","Supplier Job":"🏭",Permit:"📋",Task:"✅","Site Visit":"📍","Client Approval":"🤝" };
const TYPE_CLR  = { Purchase:"#f59e0b","Supplier Job":"#f97316",Permit:"#3b82f6",Task:"#8b5cf6","Site Visit":"#10b981","Client Approval":"#ec4899" };
const CS_CLR    = { "To Do":"#94a3b8","In Progress":"#f59e0b",Done:"#10b981" };

const fmt   = n => "₱" + Number(n||0).toLocaleString("en-PH",{minimumFractionDigits:0});
const fmtK  = n => n>=1000000?"₱"+(n/1000000).toFixed(1)+"M":n>=1000?"₱"+(n/1000).toFixed(0)+"k":"₱"+(n||0);
const today = new Date().toISOString().split("T")[0];
const todayL= new Date().toLocaleDateString("en-PH",{year:"numeric",month:"long",day:"numeric"});
let _id=500; const uid=()=>String(++_id);

const KEYS={deals:"gmdv5:deals",projects:"gmdv5:projects",expenses:"gmdv5:expenses",inflows:"gmdv5:inflows",jos:"gmdv5:jos",swatches:"gmdv5:swatches",checklist:"gmdv5:checklist",role:"gmdv5:role"};

// ─── SEED DATA ────────────────────────────────────────────────────────────────
const mkDesign=(status="Briefing",designer="",type="in-house",dueDate="",link="",notes="")=>({
  status,designer,designerType:type,dueDate,link,notes,
  statusHistory:[{status,date:today,by:"System"}],deliverables:[]
});
const SEED_DEALS=[
  {id:"d1",client:"ABC Retail Corp",product:"Retail Cabinetry",value:3200000,stage:"Stage 08 — Production",probability:100,contact:"Juan Santos",followUp:"2026-05-20",notes:"Retail Fit-Out – SM Megamall. On track; delivery target May 20.",invoiced:3040000,amountPaid:1520000,paymentStatus:"Deposited",dueDate:"2026-05-20",priority:"High",ceNo:"CE-2026-001",ceType:"Fabrication / General",salesOwner:"Juan Santos",discount:5,dateAcquired:"2026-03-10"},
  {id:"d2",client:"XYZ Holdings",product:"Custom Shelving",value:1350000,stage:"Stage 05 — 4-Way Sign-Off",probability:85,contact:"Maria Cruz",followUp:"2026-05-05",notes:"Office Renovation – BGC Tower. Awaiting Sales Mgr, Finance & Dir sign-off.",invoiced:1242000,amountPaid:0,paymentStatus:"Unpaid",dueDate:"",priority:"Normal",ceNo:"CE-2026-002",ceType:"Fabrication / General",salesOwner:"Maria Cruz",discount:8,dateAcquired:"2026-04-02"},
  {id:"d3",client:"MNO Brands Inc.",product:"Display Fixtures",value:980000,stage:"Stage 04 — Paulo Review",probability:70,contact:"Rico Reyes",followUp:"2026-04-30",notes:"Showroom – Quezon Ave. Draft submitted to Paulo for review.",invoiced:0,amountPaid:0,paymentStatus:"Unpaid",dueDate:"",priority:"Normal",ceNo:"CE-2026-003",ceType:"Fabrication / General",salesOwner:"Rico Reyes",discount:0,dateAcquired:"2026-04-18"},
  {id:"d4",client:"PQR Development",product:"Millwork",value:8500000,stage:"Stage 04 — Paulo Review",probability:65,contact:"Ana Lim",followUp:"2026-04-30",notes:"Commercial Building Phase 1. Rodney template submitted; awaiting Paulo % adjustment.",invoiced:0,amountPaid:0,paymentStatus:"Unpaid",dueDate:"",priority:"High",ceNo:"CE-2026-004",ceType:"Construction",salesOwner:"Ana Lim",discount:0,dateAcquired:"2026-04-25"},
  {id:"d5",client:"STU Events Co.",product:"Kiosks",value:0,stage:"Stage 02 — Briefing",probability:40,contact:"Bong Reyes",followUp:"2026-05-15",notes:"Event Booth – Manila FAME. Brief expected May 15.",invoiced:0,amountPaid:0,paymentStatus:"Unpaid",dueDate:"",priority:"Normal",ceNo:"",ceType:"Fabrication / General",salesOwner:"Bong Reyes",discount:0,dateAcquired:"2026-05-01"},
  {id:"d6",client:"Ivory Tree Inc.",product:"Retail Cabinetry",value:2611200,stage:"Stage 10 — Balance Billing",probability:100,contact:"Paolo Gomez",followUp:"",notes:"Studio Ceremonie Opus. ⚠ OPEN BALANCE ₱2,611,200 — follow up urgently.",invoiced:2611200,amountPaid:0,paymentStatus:"Unpaid",dueDate:"2026-04-01",priority:"Urgent",ceNo:"CE-2025-018",ceType:"Fabrication / General",salesOwner:"Paolo Gomez",discount:0,dateAcquired:"2025-11-01"},
  {id:"d7",client:"Newtrends International Corporation",product:"Display Fixtures",value:240000,stage:"Stage 10 — Balance Billing",probability:100,contact:"Gail De Ello",followUp:"",notes:"Watch Republic Ayala Center Cebu. ⚠ OPEN BALANCE ₱240,000.",invoiced:240000,amountPaid:0,paymentStatus:"Unpaid",dueDate:"2026-03-15",priority:"High",ceNo:"CE-2025-022",ceType:"Fabrication / General",salesOwner:"Gail De Ello",discount:0,dateAcquired:"2025-12-01"},
];
const SEED_PROJECTS={
  "d1":{currentStage:"Delivery",  progress:{Design:100,Fabrication:100,QC:100,Delivery:85},stageDates:{Design:{s:"2026-02-01",e:"2026-02-10"},Fabrication:{s:"2026-02-11",e:"2026-03-05"},QC:{s:"2026-03-06",e:"2026-03-10"},Delivery:{s:"2026-03-11",e:"2026-04-15"}},team:["Carlo M.","Enzo P."],materials:[{id:"m1",name:"Steel angle bars",qty:40,unit:"pcs",cost:12000,received:true},{id:"m2",name:"MDF boards",qty:20,unit:"sheets",cost:8000,received:true}],laborCost:18000,overhead:4000,notes:"Final installation ongoing.",design:mkDesign("Done","Alex R.","in-house","2026-02-10","","Approved.")},
  "d2":{currentStage:"QC",        progress:{Design:100,Fabrication:100,QC:60,Delivery:0}, stageDates:{Design:{s:"2026-02-15",e:"2026-02-22"},Fabrication:{s:"2026-02-23",e:"2026-03-20"},QC:{s:"2026-03-21",e:"2026-04-10"},Delivery:{s:"2026-04-11",e:"2026-04-20"}},team:["Faye T.","Gino A."],  materials:[{id:"m4",name:"Tempered glass",qty:12,unit:"pcs",cost:9600,received:true},{id:"m5",name:"LED strip lights",qty:8,unit:"rolls",cost:3200,received:false}],laborCost:12000,overhead:3000,notes:"QC punch list in progress.",design:mkDesign("Done","Bea T.","in-house","2026-02-22","","Signed off.")},
  "d3":{currentStage:"Fabrication",progress:{Design:100,Fabrication:40,QC:0,Delivery:0},  stageDates:{Design:{s:"2026-03-01",e:"2026-03-15"},Fabrication:{s:"2026-03-16",e:"2026-04-30"},QC:{s:"2026-05-01",e:"2026-05-10"},Delivery:{s:"2026-05-11",e:"2026-05-25"}},team:["Carlo M.","Hana C."],  materials:[{id:"m7",name:"Steel square tubes",qty:80,unit:"pcs",cost:32000,received:true},{id:"m9",name:"Laminate sheets",qty:30,unit:"sheets",cost:9000,received:false}],laborCost:45000,overhead:12000,notes:"Assembly ongoing.",design:mkDesign("Done","Freelancer / Outsourced","outsourced","2026-03-15","","Plans submitted.")},
  "d6":{currentStage:"Design",    progress:{Design:30,Fabrication:0,QC:0,Delivery:0},     stageDates:{Design:{s:"2026-04-01",e:"2026-04-18"},Fabrication:{s:"2026-04-19",e:"2026-05-10"},QC:{s:"2026-05-11",e:"2026-05-14"},Delivery:{s:"2026-05-15",e:"2026-05-22"}},team:["Dana R."],           materials:[{id:"m10",name:"Plywood 3/4\"",qty:25,unit:"sheets",cost:10000,received:false}],laborCost:14000,overhead:3500,notes:"Revisions pending.",design:mkDesign("Revision","Chris N.","in-house","2026-04-18","","2nd revision.")},
};
const SEED_EXP=[
  {id:"e1",month:0,category:"Salaries",  amount:85000,note:"Jan full team",   projectId:null,receipt:""},
  {id:"e2",month:0,category:"Rent",      amount:18000,note:"Workshop Jan",    projectId:null,receipt:""},
  {id:"e3",month:0,category:"Materials", amount:12000,note:"Steel & MDF",     projectId:"d1",receipt:""},
  {id:"e4",month:1,category:"Salaries",  amount:85000,note:"Feb full team",   projectId:null,receipt:""},
  {id:"e5",month:1,category:"Materials", amount:9600, note:"Glass – Bloom",   projectId:"d2",receipt:""},
  {id:"e6",month:1,category:"Rent",      amount:18000,note:"Workshop Feb",    projectId:null,receipt:""},
  {id:"e7",month:2,category:"Salaries",  amount:85000,note:"Mar full team",   projectId:null,receipt:""},
  {id:"e8",month:2,category:"Materials", amount:32000,note:"Steel – TechZone",projectId:"d3",receipt:""},
  {id:"e9",month:2,category:"Rent",      amount:18000,note:"Workshop Mar",    projectId:null,receipt:""},
  {id:"e10",month:3,category:"Salaries", amount:85000,note:"Apr full team",   projectId:null,receipt:""},
  {id:"e11",month:3,category:"Materials",amount:10000,note:"Plywood – Urban", projectId:"d6",receipt:""},
  {id:"e12",month:3,category:"Overhead", amount:8500, note:"Equipment maint", projectId:null,receipt:""},
];
const SEED_INF=[
  {id:"i1",month:0,source:"Metro Retail Co.",amount:18000,note:"Partial payment",projectId:"d1"},
  {id:"i2",month:1,source:"Metro Retail Co.",amount:6500, note:"Final payment",  projectId:"d1"},
  {id:"i3",month:1,source:"Bloom Boutique",  amount:5600, note:"Deposit",        projectId:"d2"},
  {id:"i4",month:2,source:"UrbanNest",       amount:9900, note:"50% deposit",    projectId:"d6"},
  {id:"i5",month:3,source:"Metro Retail Co.",amount:24500,note:"Full payment",   projectId:"d1"},
  {id:"i6",month:3,source:"Bloom Boutique",  amount:5600, note:"Partial",        projectId:"d2"},
];
const SEED_SWATCHES=[
  {id:"s1",projectId:"d3",name:"Brushed steel sample",category:"Metal",   qty:2, unit:"pcs",   supplier:"MetalWorks PH",estCost:800, swatchLink:"",addedBy:"Design",status:"Received",notes:"Kiosk frame",date:today},
  {id:"s2",projectId:"d3",name:"Matte black laminate", category:"Laminate",qty:10,unit:"sheets",supplier:"SurfacePro",   estCost:3500,swatchLink:"",addedBy:"Ops",   status:"Ordered", notes:"Cabinet interiors",date:today},
  {id:"s3",projectId:"d6",name:"Walnut veneer roll",   category:"Wood",    qty:5, unit:"rolls", supplier:"WoodCraft MNL",estCost:2500,swatchLink:"",addedBy:"Design",status:"To Buy",  notes:"Match client sample",date:today},
  {id:"s4",projectId:"d6",name:"Brass pulls 96mm",     category:"Hardware",qty:30,unit:"pcs",   supplier:"Casa Hardware",estCost:1200,swatchLink:"",addedBy:"Design",status:"To Buy",  notes:"Drawer pulls",date:today},
];

const SEED_CHECKLIST=[
  {id:"c1",projectId:"d3",type:"Purchase",title:"Order laminate sheets",dept:"Procurement",assignedTo:"Gino A.",status:"To Do",priority:"High",dueDate:"2026-04-22",supplier:"SurfacePro",notes:"30 sheets matte black",createdDate:today,createdBy:"Ops"},
  {id:"c2",projectId:"d3",type:"Supplier Job",title:"Send steel frame specs to MetalWorks",dept:"Operations",assignedTo:"Carlo M.",status:"In Progress",priority:"Urgent",dueDate:"2026-04-19",supplier:"MetalWorks PH",notes:"Include revised drawings v3",createdDate:today,createdBy:"Ops"},
  {id:"c3",projectId:"d6",type:"Permit",title:"File DPWH clearance",dept:"Operations",assignedTo:"Dana R.",status:"To Do",priority:"Normal",dueDate:"2026-04-25",supplier:"",notes:"Required before installation",createdDate:today,createdBy:"Ops"},
  {id:"c4",projectId:"d6",type:"Client Approval",title:"Get sign-off on revised design",dept:"Design",assignedTo:"Chris N.",status:"To Do",priority:"High",dueDate:"2026-04-18",supplier:"",notes:"2nd revision — client must approve before production",createdDate:today,createdBy:"Design"},
  {id:"c5",projectId:"d6",type:"Purchase",title:"Walnut veneer rolls",dept:"Procurement",assignedTo:"",status:"To Do",priority:"Normal",dueDate:"2026-04-20",supplier:"WoodCraft MNL",notes:"5 rolls, match client sample",createdDate:today,createdBy:"Design"},
  {id:"c6",projectId:"d2",type:"Site Visit",title:"Pre-delivery site inspection",dept:"Operations",assignedTo:"Faye T.",status:"In Progress",priority:"High",dueDate:"2026-04-11",supplier:"",notes:"Check measurements before delivery",createdDate:today,createdBy:"Ops"},
  {id:"c7",projectId:"d1",type:"Task",title:"Final touch-up and cleaning",dept:"Operations",assignedTo:"Enzo P.",status:"Done",priority:"Normal",dueDate:"2026-04-13",supplier:"",notes:"Before client handover",createdDate:today,createdBy:"Ops"},
];
const emptyDeal={client:"",product:"Custom Shelving",value:"",stage:"Stage 01 — Acquisition",probability:10,contact:"",followUp:"",notes:"",invoiced:"",amountPaid:"",paymentStatus:"Unpaid",dueDate:"",priority:"Normal",ceNo:"",ceType:"Fabrication / General",salesOwner:"",discount:0,dateAcquired:today};
const emptyProject=()=>({currentStage:"Design",progress:{Design:0,Fabrication:0,QC:0,Delivery:0},stageDates:{Design:{s:"",e:""},Fabrication:{s:"",e:""},QC:{s:"",e:""},Delivery:{s:"",e:""}},team:[],materials:[],laborCost:0,overhead:0,notes:"",design:mkDesign()});

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
const Inp=({value,onChange,type="text",placeholder,min,max,readOnly,rows})=>{
  const base={width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"10px 13px",fontFamily:"inherit",fontSize:".87rem",color:"#1e293b",background:readOnly?"#f8fafc":"#fff",boxSizing:"border-box",transition:"border-color .15s"};
  if(rows) return <textarea value={value||""} onChange={onChange} placeholder={placeholder} rows={rows} style={{...base,resize:"vertical"}}/>;
  return <input type={type} value={value||""} onChange={onChange} placeholder={placeholder} min={min} max={max} readOnly={readOnly} style={base}/>;
};
const Sel=({value,onChange,children})=>(
  <select value={value} onChange={onChange} style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"10px 13px",fontFamily:"inherit",fontSize:".87rem",color:"#1e293b",background:"#fff",boxSizing:"border-box",cursor:"pointer"}}>
    {children}
  </select>
);
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
function DealModal({open,onClose,form,setForm,onSave,editId}){
  const f=(k,v)=>setForm(p=>({...p,[k]:v}));
  const isWon=WON_STAGES.includes(form.stage);
  return(
    <Modal open={open} onClose={onClose} title={editId?"Edit Deal":"Add New Deal"} wide>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
        <div style={{gridColumn:"1/-1"}}><Fld label="Client Name" required><Inp value={form.client} onChange={e=>f("client",e.target.value)} placeholder="e.g. Metro Retail Co."/></Fld></div>
        <Fld label="Contact Person"><Inp value={form.contact} onChange={e=>f("contact",e.target.value)} placeholder="Full name"/></Fld>
        <Fld label="Deal Value (₱)" required><Inp type="number" value={form.value} onChange={e=>f("value",e.target.value)}/></Fld>
        <Fld label="Product Type"><Sel value={form.product} onChange={e=>f("product",e.target.value)}>{PRODUCT_TYPES.map(t=><option key={t}>{t}</option>)}</Sel></Fld>
        <Fld label="Stage"><Sel value={form.stage} onChange={e=>e=>{f("stage",e.target.value);f("probability",e.target.value==="Won"?100:e.target.value==="Lost"?0:form.probability);}}>{DEAL_STAGES.map(s=><option key={s}>{s}</option>)}</Sel></Fld>
        <Fld label="Priority"><Sel value={form.priority} onChange={e=>f("priority",e.target.value)}>{PRIORITIES.map(p=><option key={p}>{p}</option>)}</Sel></Fld>
        <Fld label="Follow-up Date"><Inp type="date" value={form.followUp} onChange={e=>f("followUp",e.target.value)}/></Fld>
        <div style={{gridColumn:"1/-1"}}><Fld label="Notes"><Inp rows={2} value={form.notes} onChange={e=>f("notes",e.target.value)} placeholder="Any relevant notes…"/></Fld></div>
      </div>
      {/* CE + GMD-specific fields */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginTop:4}}>
        <Fld label="Sales Owner">
          <Sel value={form.salesOwner||""} onChange={e=>f("salesOwner",e.target.value)}>
            <option value="">— Assign —</option>
            {SALES_TEAM.map(m=><option key={m}>{m}</option>)}
          </Sel>
        </Fld>
        <Fld label="Date Acquired"><Inp type="date" value={form.dateAcquired||today} onChange={e=>f("dateAcquired",e.target.value)}/></Fld>
        <Fld label="CE Number" hint="e.g. CE-2026-005"><Inp value={form.ceNo||""} onChange={e=>f("ceNo",e.target.value)} placeholder="CE-2026-005"/></Fld>
        <Fld label="CE Type">
          <Sel value={form.ceType||"Fabrication / General"} onChange={e=>f("ceType",e.target.value)}>
            {CE_TYPES.map(t=><option key={t}>{t}</option>)}
          </Sel>
        </Fld>
        <Fld label="Discount %" hint="Paulo sets this — not sales team">
          <Inp type="number" min={0} max={100} value={form.discount||0} onChange={e=>f("discount",e.target.value)}/>
        </Fld>
      </div>
      {PAULO_GATE.includes(form.stage)&&(
        <div style={{background:"#fffbeb",border:"1.5px solid #fde68a",borderRadius:10,padding:"12px 16px",marginTop:8,fontSize:".82rem",color:"#92400e"}}>
          ⚠️ <strong>Paulo Gate:</strong> Stage {form.stage} requires Paulo Garcia's review and sign-off before proceeding to the next stage.
        </div>
      )}
      {(Number(form.value)>=3000000)&&(
        <div style={{background:"#fef2f2",border:"1.5px solid #fecaca",borderRadius:10,padding:"12px 16px",marginTop:8,fontSize:".82rem",color:"#991b1b"}}>
          🚨 <strong>₱3M Rule:</strong> This project exceeds ₱3,000,000. Paulo Garcia must be involved. Paolo can quote a range to the client but <strong>cannot commit pricing</strong> without Paulo.
        </div>
      )}
      {form.ceType==="Construction"&&(
        <div style={{background:"#eff6ff",border:"1.5px solid #93c5fd",borderRadius:10,padding:"12px 16px",marginTop:8,fontSize:".82rem",color:"#1d4ed8"}}>
          🏗 <strong>Construction CE:</strong> Rodney (QS/CE) prepares the cost estimate using the Construction template. Jerome Mendoza is on-call backup. Paulo sets the final % adjustment.
        </div>
      )}
      {isWon&&(
        <div style={{background:"#f0fdf4",border:"1.5px solid #6ee7b7",borderRadius:12,padding:"16px 18px",marginTop:8}}>
          <div style={{fontWeight:700,color:"#059669",marginBottom:12,fontSize:".88rem"}}>💰 Payment Details (Awarded)</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            <Fld label="Invoice Amount (₱)"><Inp type="number" value={form.invoiced} onChange={e=>f("invoiced",e.target.value)}/></Fld>
            <Fld label="Amount Paid (₱)"><Inp type="number" value={form.amountPaid} onChange={e=>f("amountPaid",e.target.value)}/></Fld>
            <Fld label="Payment Status"><Sel value={form.paymentStatus} onChange={e=>f("paymentStatus",e.target.value)}>{PAY_STATUS.map(s=><option key={s}>{s}</option>)}</Sel></Fld>
            <Fld label="Payment Due Date"><Inp type="date" value={form.dueDate} onChange={e=>f("dueDate",e.target.value)}/></Fld>
          </div>
        </div>
      )}
      <div style={{display:"flex",gap:10,marginTop:20}}>
        <Btn full onClick={onSave}>{editId?"Save Changes":"Add Deal"}</Btn>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
      </div>
    </Modal>
  );
}

// ─── EXPENSE FORM MODAL (with confirmation step) ──────────────────────────────
function ExpenseModal({open,onClose,form,setForm,onSave,editId,projList,clientName}){
  const[step,setStep]=useState(1);
  const f=(k,v)=>setForm(p=>({...p,[k]:v}));
  useEffect(()=>{if(open) setStep(1);},[open]);
  const projName=form.projectId?clientName(form.projectId):"Company-wide (no specific project)";
  return(
    <Modal open={onClose} onClose={onClose} title={editId?"Edit Expense":"Log Expense"}>
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
            <Btn full variant="green" onClick={onSave}>✓ Confirm &amp; Save</Btn>
            <Btn variant="ghost" onClick={()=>setStep(1)}>← Go Back</Btn>
          </div>
        </>
      )}
    </Modal>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App(){
  const[role,     setRole]    = useState(null);
  const[deals,    setDeals]   = useState(SEED_DEALS);
  const[projs,    setProjs]   = useState(SEED_PROJECTS);
  const[exps,     setExps]    = useState(SEED_EXP);
  const[infs,     setInfs]    = useState(SEED_INF);
  const[jos,      setJos]     = useState([]);
  const[swatches, setSwatches]= useState(SEED_SWATCHES);
  const[checklist,setChecklist]= useState(SEED_CHECKLIST);
  const[ready,    setReady]   = useState(false);
  const[sync,     setSync]    = useState("saved");

  useEffect(()=>{
    try{
      const r=localStorage.getItem(KEYS.role); if(r) setRole(r);
      const d=localStorage.getItem(KEYS.deals); if(d) setDeals(JSON.parse(d));
      const p=localStorage.getItem(KEYS.projects); if(p) setProjs(JSON.parse(p));
      const e=localStorage.getItem(KEYS.expenses); if(e) setExps(JSON.parse(e));
      const i=localStorage.getItem(KEYS.inflows); if(i) setInfs(JSON.parse(i));
      const j=localStorage.getItem(KEYS.jos); if(j) setJos(JSON.parse(j));
      const sw=localStorage.getItem(KEYS.swatches); if(sw) setSwatches(JSON.parse(sw));
      const cl=localStorage.getItem(KEYS.checklist); if(cl) setChecklist(JSON.parse(cl));
    }catch{}
    setReady(true);
  },[]);

  const persist=useCallback((key,val)=>{
    setSync("saving");
    try{localStorage.setItem(key,JSON.stringify(val));setTimeout(()=>setSync("saved"),400);}
    catch{setSync("error");}
  },[]);

  const upDeals    =useCallback(fn=>setDeals(p=>{const n=fn(p);persist(KEYS.deals,n);return n;}),[persist]);
  const upProjs    =useCallback(fn=>setProjs(p=>{const n=fn(p);persist(KEYS.projects,n);return n;}),[persist]);
  const upExps     =useCallback(fn=>setExps(p=>{const n=fn(p);persist(KEYS.expenses,n);return n;}),[persist]);
  const upInfs     =useCallback(fn=>setInfs(p=>{const n=fn(p);persist(KEYS.inflows,n);return n;}),[persist]);
  const upJos      =useCallback(fn=>setJos(p=>{const n=fn(p);persist(KEYS.jos,n);return n;}),[persist]);
  const upSwatches =useCallback(fn=>setSwatches(p=>{const n=fn(p);persist(KEYS.swatches,n);return n;}),[persist]);
  const upChecklist=useCallback(fn=>setChecklist(p=>{const n=fn(p);persist(KEYS.checklist,n);return n;}),[persist]);

  // ── Checklist state ──────────────────────────────────────────────────────────
  const[clModal,   setClModal]  = useState(false);
  const[clForm,    setClForm]   = useState({projectId:null,type:"Task",customType:"",title:"",dept:"Operations",assignedTo:"",status:"To Do",priority:"Normal",dueDate:"",supplier:"",notes:""});
  const[editCl,    setEditCl]   = useState(null);
  const[clProjF,   setClProjF]  = useState("all");
  const[clTypeF,   setClTypeF]  = useState("All");
  const[clStatF,   setClStatF]  = useState("All");
  const[clDeptF,   setClDeptF]  = useState("All");

  const openAddCl=(projId=null,dept="Operations")=>{setClForm({projectId:projId,type:"Task",customType:"",title:"",dept:dept,assignedTo:"",status:"To Do",priority:"Normal",dueDate:"",supplier:"",notes:""});setEditCl(null);setClModal(true);};
  const openEditCl=item=>{setClForm({...item,customType:CL_TYPES.includes(item.type)?"":item.type});setEditCl(item.id);setClModal(true);};
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

  // ── Derived ───────────────────────────────────────────────────────────────
  const wonDeals  =useMemo(()=>deals.filter(d=>WON_STAGES.includes(d.stage)),[deals]);
  const projList  =useMemo(()=>wonDeals.filter(d=>projs[d.id]),[wonDeals,projs]);
  const isPauloGate = stage => PAULO_GATE.includes(stage);
  const clientName=useCallback(id=>deals.find(d=>d.id===id)?.client||`Project #${id}`,[deals]);
  const overallProg=p=>{const si=PROD_STAGES.indexOf(p.currentStage);return Math.round(si*25+(p.progress[p.currentStage]||0)*0.25);};
  const costOf    =p=>(p.materials||[]).reduce((s,m)=>s+m.cost,0)+(p.laborCost||0)+(p.overhead||0);
  const marginOf  =(p,d)=>d&&costOf(p)<d.value?Math.round((d.value-costOf(p))/d.value*100):0;
  const totRev    =useMemo(()=>wonDeals.reduce((s,d)=>s+d.value,0),[wonDeals]);
  const totExp    =useMemo(()=>exps.reduce((s,e)=>s+e.amount,0),[exps]);
  const totColl   =useMemo(()=>wonDeals.reduce((s,d)=>s+d.amountPaid,0),[wonDeals]);
  const totOut    =useMemo(()=>wonDeals.reduce((s,d)=>s+d.invoiced-d.amountPaid,0),[wonDeals]);

  // ── Modals ────────────────────────────────────────────────────────────────
  const[dealModal, setDealModal]=useState(false);
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
  const[matForm,   setMatForm]  =useState({name:"",qty:"",unit:"pcs",cost:"",received:false});
  const[editMat,   setEditMat]  =useState(null);
  const[swModal,   setSwModal]  =useState(false);
  const[swForm,    setSwForm]   =useState({projectId:null,name:"",category:"Fabric",qty:"",unit:"pcs",supplier:"",estCost:"",swatchLink:"",addedBy:"Design",status:"To Buy",notes:""});
  const[editSw,    setEditSw]   =useState(null);
  const[designModal,setDesignModal]=useState(false);
  const[designForm, setDesignForm] =useState({});
  const[confirmDel, setConfirmDel] =useState(null);
  const[page,       setPage]       =useState("home");
  const[joStep,     setJoStep]     =useState("select");
  const[joSel,      setJoSel]      =useState(null);
  const[joExtra,    setJoExtra]    =useState({address:"",phone:"",priority:"Normal",extraNotes:""});
  const[viewJO,     setViewJO]     =useState(null);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const openAddDeal=()=>{setDealForm(emptyDeal);setEditDeal(null);setDealModal(true);};
  const openEditDeal=d=>{setDealForm({...d,value:String(d.value),invoiced:String(d.invoiced||0),amountPaid:String(d.amountPaid||0)});setEditDeal(d.id);setDealModal(true);};
  const saveDeal=()=>{
    if(!dealForm.client||!dealForm.value) return;
    const prob=WON_STAGES.includes(dealForm.stage)?100:dealForm.stage==="Cancelled"?0:Number(dealForm.probability);
    const rec={...dealForm,id:editDeal||uid(),value:Number(dealForm.value),invoiced:Number(dealForm.invoiced||0),amountPaid:Number(dealForm.amountPaid||0),probability:prob};
    if(WON_STAGES.includes(dealForm.stage)&&!editDeal) upProjs(ps=>({...ps,[rec.id]:{...emptyProject(),notes:""}}));
    upDeals(ds=>editDeal?ds.map(d=>d.id===editDeal?rec:d):[...ds,rec]);
    setDealModal(false);
  };
  const delDeal=id=>{upDeals(ds=>ds.filter(d=>d.id!==id));upProjs(ps=>{const n={...ps};delete n[id];return n;});setConfirmDel(null);};

  const updatePayment=(id,key,val)=>upDeals(ds=>ds.map(d=>d.id===id?{...d,[key]:val}:d));
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

  const upProj=(id,fn)=>upProjs(ps=>({...ps,[id]:fn(ps[id]||emptyProject())}));
  const proj=selProj?projs[selProj]:null;
  const projDeal=selProj?deals.find(d=>d.id===selProj):null;

  const openAddExp=(projId=null)=>{setExpForm({month:new Date().getMonth(),category:"Materials",amount:"",note:"",projectId:projId,receipt:""});setEditExpId(null);setExpModal(true);};
  const openEditExp=e=>{setExpForm({...e});setEditExpId(e.id);setExpModal(true);};
  const saveExp=()=>{
    if(!expForm.amount||!expForm.note) return;
    const rec={...expForm,amount:Number(expForm.amount),id:editExpId||uid()};
    upExps(es=>editExpId?es.map(e=>e.id===editExpId?rec:e):[...es,rec]);
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
  const swQ=(id,st)=>upSwatches(ss=>ss.map(s=>s.id===id?{...s,status:st}:s));

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

  if(!ready) return(
    <div style={{minHeight:"100vh",background:"#f8fafc",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Segoe UI',sans-serif"}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"2rem",color:"#0f172a",letterSpacing:-1}}>GMD <span style={{color:"#f59e0b"}}>PRODUCTIONS</span></div>
        <div style={{color:"#94a3b8",marginTop:8,fontSize:".88rem"}}>Loading your workspace…</div>
      </div>
    </div>
  );

  // ── ROLE PICKER ───────────────────────────────────────────────────────────
  if(!role) return(
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#f8fafc 0%,#eff6ff 100%)",display:"flex",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"'Segoe UI',sans-serif"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800&display=swap'); *{box-sizing:border-box;}`}</style>
      <div style={{width:"100%",maxWidth:460}}>
        <div style={{textAlign:"center",marginBottom:36}}>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"2.4rem",color:"#0f172a",letterSpacing:-1}}>GMD <span style={{color:"#f59e0b"}}>PRODUCTIONS</span></div>
          <div style={{color:"#64748b",marginTop:8,fontSize:".92rem"}}>Select your role to continue</div>
        </div>
        {[
          {r:"Manager",   icon:"👑",desc:"Full access to everything",                           color:"#f59e0b"},
          {r:"Sales",     icon:"🤝",desc:"Pipeline, deals & collection tracking",               color:"#10b981"},
          {r:"Finance",   icon:"₱", desc:"Expenses, payments & profit reports",                 color:"#3b82f6"},
          {r:"Operations",icon:"⚙", desc:"Project stages, materials & team",                    color:"#f97316"},
          {r:"Design",    icon:"🎨",desc:"Design status, files & swatchboard",                  color:"#8b5cf6"},
        ].map(({r,icon,desc,color})=>(
          <div key={r} onClick={()=>pickRole(r)}
            style={{background:"#fff",borderRadius:14,border:"2px solid #e2e8f0",padding:"16px 20px",marginBottom:10,cursor:"pointer",display:"flex",alignItems:"center",gap:16,boxShadow:"0 1px 6px rgba(0,0,0,.05)",transition:"all .2s"}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor=color;e.currentTarget.style.boxShadow=`0 6px 20px ${color}30`;e.currentTarget.style.transform="translateY(-1px)";}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor="#e2e8f0";e.currentTarget.style.boxShadow="0 1px 6px rgba(0,0,0,.05)";e.currentTarget.style.transform="none";}}>
            <div style={{width:46,height:46,borderRadius:12,background:color+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.35rem",flexShrink:0}}>{icon}</div>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,fontSize:"1rem",color:"#0f172a"}}>{r}</div>
              <div style={{fontSize:".78rem",color:"#64748b",marginTop:2}}>{desc}</div>
            </div>
            <div style={{color:color,fontSize:"1.1rem",fontWeight:700}}>→</div>
          </div>
        ))}
      </div>
    </div>
  );

  // ── SHARED NAV ────────────────────────────────────────────────────────────
  const roleColor=ROLE_CLR[role];
  const navMap={
    Manager:   [{id:"home",l:"Dashboard"},{id:"pipeline",l:"Pipeline"},{id:"finance",l:"Finance"},{id:"ops",l:"Operations"},{id:"checklist",l:"Checklist"},{id:"procurement",l:"Procurement"},{id:"joborders",l:"Job Orders"}],
    Sales:     [{id:"home",l:"My Pipeline"},{id:"collections",l:"Collections"},{id:"checklist",l:"Checklist"},{id:"joborders",l:"Job Orders"}],
    Finance:   [{id:"home",l:"Overview"},{id:"collections",l:"Collections"},{id:"expenses",l:"Expenses"},{id:"checklist",l:"Checklist"}],
    Operations:[{id:"home",l:"Projects"},{id:"checklist",l:"Checklist"},{id:"procurement",l:"Swatchboard"}],
    Design:    [{id:"home",l:"Projects"},{id:"checklist",l:"Checklist"},{id:"procurement",l:"Swatchboard"}],
  };
  const Nav=()=>(
    <nav style={{background:"#fff",borderBottom:"1.5px solid #e2e8f0",padding:"0 20px",display:"flex",alignItems:"center",height:56,gap:2,position:"sticky",top:0,zIndex:100,boxShadow:"0 1px 6px rgba(0,0,0,.05)"}} className="noprint">
      <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.05rem",color:"#0f172a",marginRight:14,letterSpacing:-.5,whiteSpace:"nowrap"}}>GMD <span style={{color:"#f59e0b"}}>PROD</span></div>
      <div style={{display:"flex",gap:2,flex:1,overflowX:"auto"}}>
        {(navMap[role]||[]).map(({id,l})=>(
          <button key={id} onClick={()=>{setPage(id);setSelProj(null);setJoStep("select");}} style={{background:page===id?roleColor+"18":"transparent",border:"none",borderRadius:8,padding:"6px 12px",fontFamily:"inherit",fontWeight:page===id?700:400,fontSize:".8rem",color:page===id?roleColor:"#64748b",cursor:"pointer",transition:"all .15s",whiteSpace:"nowrap",flexShrink:0}}>{l}</button>
        ))}
      </div>
      <div style={{display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
        <span style={{fontSize:".67rem",color:sync==="saving"?"#f59e0b":sync==="error"?"#ef4444":"#94a3b8"}}>{sync==="saving"?"Saving…":sync==="error"?"! Error":"✓ Saved"}</span>
        <div style={{background:roleColor+"18",borderRadius:20,padding:"3px 11px",fontSize:".72rem",fontWeight:700,color:roleColor,border:`1px solid ${roleColor}33`}}>{role}</div>
        <button onClick={()=>{setRole(null);localStorage.removeItem(KEYS.role);setPage("home");}} style={{background:"transparent",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"4px 10px",fontSize:".72rem",color:"#64748b",cursor:"pointer",fontFamily:"inherit"}}>Switch</button>
      </div>
    </nav>
  );
  const Wrap=({children})=>(
    <div style={{minHeight:"100vh",background:"#f8fafc",fontFamily:"'Segoe UI',sans-serif"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800&display=swap'); *{box-sizing:border-box;} input:focus,select:focus,textarea:focus{outline:none;border-color:${roleColor}!important;box-shadow:0 0 0 3px ${roleColor}22!important;} @keyframes fi{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}} .fi{animation:fi .2s ease;} @media print{.noprint{display:none!important;}}`}</style>
      <Nav/>
      <div style={{maxWidth:1100,margin:"0 auto",padding:"22px 18px"}} className="fi">{children}</div>
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

  // ─── MANAGER ──────────────────────────────────────────────────────────────
  if(role==="Manager"){
    const grossPro=totRev-totExp;
    const grossMar=totRev>0?Math.round(grossPro/totRev*100):0;
    if(page==="home") return(
      <Wrap>
        <SecHead title={`Dashboard · ${todayL}`}/>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:12}}>
          <KPI label="Pipeline"     value={fmtK(deals.filter(d=>d.stage!=="Lost").reduce((s,d)=>s+d.value,0))} color="#3b82f6"/>
          <KPI label="Won Revenue"  value={fmtK(totRev)}   color="#10b981"/>
          <KPI label="Collected"    value={fmtK(totColl)}  color="#059669" sub={`${fmtK(totOut)} outstanding`}/>
          <KPI label="Gross Margin" value={grossMar+"%"}   color={grossMar>=20?"#059669":"#f59e0b"}/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:24}}>
          <KPI label="Active Projects" value={projList.length}    color="#f97316"/>
          <KPI label="In Design"       value={projList.filter(d=>projs[d.id]?.currentStage==="Design").length} color="#8b5cf6"/>
          <KPI label="Gross Profit"    value={fmtK(grossPro)}    color={grossPro>=0?"#10b981":"#ef4444"}/>
          <KPI label="Swatches To Buy" value={swatches.filter(s=>s.status==="To Buy").length} color="#ef4444"/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          <div>
            <SecHead title="Recent Deals" action={<Btn small onClick={()=>setPage("pipeline")}>All deals →</Btn>}/>
            {deals.slice(0,5).map(d=>(
              <Card key={d.id}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div><div style={{fontWeight:700,color:"#0f172a"}}>{d.client}</div><div style={{fontSize:".75rem",color:"#94a3b8",marginTop:2}}>{d.product}</div></div>
                  <div style={{display:"flex",gap:7,alignItems:"center"}}><Badge label={d.stage} color={STAGE_CLR[d.stage]}/><span style={{fontWeight:800,color:"#10b981"}}>{fmt(d.value)}</span></div>
                </div>
              </Card>
            ))}
          </div>
          <div>
            <SecHead title="Project Margins" action={<Btn small onClick={()=>setPage("ops")}>All projects →</Btn>}/>
            {projList.slice(0,5).map(d=>{
              const p=projs[d.id]; const m=marginOf(p,d);
              return(
                <Card key={d.id} onClick={()=>{setSelProj(d.id);setPage("ops");}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                    <div><div style={{fontWeight:700,color:"#0f172a"}}>{d.client}</div><Badge label={p.currentStage} color={PROD_CLR[p.currentStage]}/></div>
                    <div style={{fontWeight:800,color:m>=20?"#059669":"#f59e0b",fontSize:"1.05rem"}}>{m}%</div>
                  </div>
                  <ProgBar pct={overallProg(p)} color={PROD_CLR[p.currentStage]}/>
                </Card>
              );
            })}
          </div>
        </div>
      </Wrap>
    );
    if(page==="pipeline") return(
      <Wrap>
        <SecHead title="Sales Pipeline" action={<Btn onClick={openAddDeal}>+ Add Deal</Btn>}/>
        {deals.map(d=>(
          <Card key={d.id} accent={d.stage==="Won"?"#6ee7b7":undefined}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
              <div style={{flex:1}}>
                <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginBottom:4}}>
                  <span style={{fontWeight:700,fontSize:"1rem",color:"#0f172a"}}>{d.client}</span>
                  <Badge label={d.stage} color={STAGE_CLR[d.stage]}/>
                  <Badge label={d.paymentStatus} color={PAY_CLR[d.paymentStatus]}/>
                  {d.priority!=="Normal"&&<Badge label={d.priority} color={PRI_CLR[d.priority]}/>}
                </div>
                <div style={{fontSize:".78rem",color:"#64748b"}}>{d.product} · {d.contact}</div>
                {d.followUp&&<div style={{fontSize:".72rem",color:d.followUp<today&&d.stage!=="Won"&&d.stage!=="Lost"?"#ef4444":"#94a3b8",marginTop:4}}>📅 Follow-up: {d.followUp}</div>}
                {d.notes&&<div style={{fontSize:".73rem",color:"#94a3b8",marginTop:4,fontStyle:"italic"}}>{d.notes}</div>}
                <div style={{display:"flex",gap:8,marginTop:5,flexWrap:"wrap"}}>
                  {d.ceNo&&<span style={{fontSize:".7rem",color:"#64748b",background:"#f1f5f9",padding:"1px 7px",borderRadius:5}}>{d.ceNo}</span>}
                  {d.ceType&&<span style={{fontSize:".7rem",color:d.ceType==="Construction"?"#3b82f6":"#8b5cf6",background:d.ceType==="Construction"?"#eff6ff":"#faf5ff",padding:"1px 7px",borderRadius:5}}>{d.ceType}</span>}
                  {d.salesOwner&&<span style={{fontSize:".7rem",color:"#64748b"}}>👤 {d.salesOwner}</span>}
                  {PAULO_GATE.includes(d.stage)&&<span style={{fontSize:".7rem",color:"#d97706",background:"#fffbeb",padding:"1px 7px",borderRadius:5,fontWeight:700}}>⚠ Paulo Gate</span>}
                  {Number(d.value)>=3000000&&<span style={{fontSize:".7rem",color:"#dc2626",background:"#fef2f2",padding:"1px 7px",borderRadius:5,fontWeight:700}}>🚨 ₱3M+</span>}
                </div>
              </div>
              <div style={{textAlign:"right",flexShrink:0}}>
                <div style={{fontWeight:800,color:"#10b981",fontSize:"1.15rem"}}>{fmt(d.value)}</div>
                {d.stage==="Won"&&d.invoiced>0&&(
                  <div style={{fontSize:".73rem",color:"#64748b",marginTop:3}}>{fmt(d.amountPaid)} / {fmt(d.invoiced)} collected</div>
                )}
                <div style={{display:"flex",gap:6,marginTop:10,justifyContent:"flex-end"}}>
                  <Btn small variant="ghost" onClick={()=>openEditDeal(d)}>✏ Edit</Btn>
                  <Btn small variant="danger" onClick={()=>setConfirmDel(d.id)}>Delete</Btn>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </Wrap>
    );
    if(page==="finance") return(
      <Wrap>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
          <KPI label="Revenue"      value={fmtK(totRev)}         color="#3b82f6"/>
          <KPI label="Expenses"     value={fmtK(totExp)}         color="#ef4444"/>
          <KPI label="Gross Profit" value={fmtK(totRev-totExp)}  color={totRev-totExp>=0?"#059669":"#ef4444"}/>
          <KPI label="Collected"    value={fmtK(totColl)}        color="#10b981" sub={`${fmtK(totOut)} out`}/>
        </div>
        <SecHead title="Collections" sub="Payment tracking for all awarded projects"/>
        <CollectionsPanel wonDeals={wonDeals} infs={infs} onUpdatePayment={updatePayment} onLogPayment={logPayment}/>
        <div style={{marginTop:24}}>
          <SecHead title="Expenses" action={<Btn onClick={()=>openAddExp()}>+ Log Expense</Btn>}/>
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
    if(page==="ops") return <OpsView projs={projs} projList={projList} deals={deals} selProj={selProj} setSelProj={setSelProj} opsTab={opsTab} setOpsTab={setOpsTab} proj={proj} projDeal={projDeal} upProj={upProj} overallProg={overallProg} costOf={costOf} marginOf={marginOf} openDesignEdit={openDesignEdit} swatches={swatches} swQ={swQ} openAddSwatch={(pid,by)=>{setSwForm({projectId:pid,name:"",category:"Fabric",qty:"",unit:"pcs",supplier:"",estCost:"",swatchLink:"",addedBy:by||"Ops",status:"To Buy",notes:""});setEditSw(null);setSwModal(true);}} openEditSwatch={sw=>{setSwForm({...sw});setEditSw(sw.id);setSwModal(true);}} delSwatch={id=>upSwatches(ss=>ss.filter(s=>s.id!==id))} exps={exps} openAddExp={openAddExp} openEditExp={openEditExp} delExp={delExp} clientName={clientName} matModal={matModal} setMatModal={setMatModal} matForm={matForm} setMatForm={setMatForm} editMat={editMat} setEditMat={setEditMat} saveMat={()=>{if(!matForm.name||!matForm.qty||!matForm.cost)return;const rec={...matForm,qty:Number(matForm.qty),cost:Number(matForm.cost),id:editMat||uid()};upProj(selProj,p=>({...p,materials:editMat?p.materials.map(m=>m.id===editMat?rec:m):[...p.materials,rec]}));setMatModal(false);setEditMat(null);setMatForm({name:"",qty:"",unit:"pcs",cost:"",received:false});}} Wrap={Wrap}/>;
    if(page==="procurement") return <ProcurementView swatches={swatches} projList={projList} clientName={clientName} openAddSwatch={(pid,by)=>{setSwForm({projectId:pid,name:"",category:"Fabric",qty:"",unit:"pcs",supplier:"",estCost:"",swatchLink:"",addedBy:by||"Design",status:"To Buy",notes:""});setEditSw(null);setSwModal(true);}} openEditSwatch={sw=>{setSwForm({...sw});setEditSw(sw.id);setSwModal(true);}} delSwatch={id=>upSwatches(ss=>ss.filter(s=>s.id!==id))} swQ={swQ} Wrap={Wrap}/>;
    if(page==="checklist") return <ChecklistView checklist={checklist} projList={projList} deals={deals} clientName={clientName} openAddCl={openAddCl} openEditCl={openEditCl} delCl={delCl} clStatusQ={clStatusQ} clModal={clModal} setClModal={setClModal} clForm={clForm} setClForm={setClForm} editCl={editCl} saveCl={saveCl} clProjF={clProjF} setClProjF={setClProjF} clTypeF={clTypeF} setClTypeF={setClTypeF} clStatF={clStatF} setClStatF={setClStatF} clDeptF={clDeptF} setClDeptF={setClDeptF} role={role} wonDeals={wonDeals} Wrap={Wrap}/>;
    if(page==="joborders") return <JOView deals={deals} wonDeals={wonDeals} projs={projs} jos={jos} joStep={joStep} setJoStep={setJoStep} joSel={joSel} setJoSel={setJoSel} joExtra={joExtra} setJoExtra={setJoExtra} viewJO={viewJO} setViewJO={setViewJO} issueJO={issueJO} overallProg={overallProg} Wrap={Wrap}/>;
    if(page==="checklist") return <ChecklistView checklist={checklist} projList={projList} deals={deals} clientName={clientName} openAddCl={openAddCl} openEditCl={openEditCl} delCl={delCl} clStatusQ={clStatusQ} clModal={clModal} setClModal={setClModal} clForm={clForm} setClForm={setClForm} editCl={editCl} saveCl={saveCl} clProjF={clProjF} setClProjF={setClProjF} clTypeF={clTypeF} setClTypeF={setClTypeF} clStatF={clStatF} setClStatF={setClStatF} clDeptF={clDeptF} setClDeptF={setClDeptF} role={role} wonDeals={wonDeals} Wrap={Wrap}/>;
  }

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
                </div>
                <div style={{marginTop:8,minWidth:130}}>
                  <select value={d.stage} onChange={e=>{const st=e.target.value;const prob=WON_STAGES.includes(st)?100:st==="Cancelled"?0:d.probability;upDeals(ds=>ds.map(x=>x.id===d.id?{...x,stage:st,probability:prob}:x));if(WON_STAGES.includes(st)&&!projs[d.id])upProjs(ps=>({...ps,[d.id]:emptyProject()}));}} style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"7px 10px",fontFamily:"inherit",fontSize:".8rem",color:"#0f172a",background:"#fff",cursor:"pointer"}}>
                    {DEAL_STAGES.map(s=><option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </Wrap>
    );
    if(page==="collections") return(
      <Wrap>
        <SecHead title="Collections" sub="Track client payments for all awarded projects"/>
        <CollectionsPanel wonDeals={wonDeals} infs={infs} onUpdatePayment={updatePayment} onLogPayment={logPayment}/>
      </Wrap>
    );
    if(page==="joborders") return <JOView deals={deals} wonDeals={wonDeals} projs={projs} jos={jos} joStep={joStep} setJoStep={setJoStep} joSel={joSel} setJoSel={setJoSel} joExtra={joExtra} setJoExtra={setJoExtra} viewJO={viewJO} setViewJO={setViewJO} issueJO={issueJO} overallProg={overallProg} Wrap={Wrap}/>;
    if(page==="checklist") return <ChecklistView checklist={checklist} projList={projList} deals={deals} clientName={clientName} openAddCl={openAddCl} openEditCl={openEditCl} delCl={delCl} clStatusQ={clStatusQ} clModal={clModal} setClModal={setClModal} clForm={clForm} setClForm={setClForm} editCl={editCl} saveCl={saveCl} clProjF={clProjF} setClProjF={setClProjF} clTypeF={clTypeF} setClTypeF={setClTypeF} clStatF={clStatF} setClStatF={setClStatF} clDeptF={clDeptF} setClDeptF={setClDeptF} role={role} wonDeals={wonDeals} Wrap={Wrap}/>;
  }

  // ─── FINANCE ──────────────────────────────────────────────────────────────
  if(role==="Finance"){
    const grossPro=totRev-totExp;
    const grossMar=totRev>0?Math.round(grossPro/totRev*100):0;
    if(page==="home"||page==="collections") return(
      <Wrap>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
          <KPI label="Total Revenue"  value={fmtK(totRev)}        color="#3b82f6"/>
          <KPI label="Total Expenses" value={fmtK(totExp)}        color="#ef4444"/>
          <KPI label="Gross Profit"   value={fmtK(grossPro)}      color={grossPro>=0?"#059669":"#ef4444"}/>
          <KPI label="Gross Margin"   value={grossMar+"%"}        color={grossMar>=20?"#059669":"#f59e0b"}/>
        </div>
        <SecHead title="Collections" sub="Log and track all client payments"/>
        <CollectionsPanel wonDeals={wonDeals} infs={infs} onUpdatePayment={updatePayment} onLogPayment={logPayment}/>
        <div style={{marginTop:20}}>
          <SecHead title="Per Project Profit" sub="Real-time margin based on logged expenses"/>
          {projList.map(d=>{
            const p=projs[d.id];
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
    if(page==="checklist") return <ChecklistView checklist={checklist} projList={projList} deals={deals} clientName={clientName} openAddCl={openAddCl} openEditCl={openEditCl} delCl={delCl} clStatusQ={clStatusQ} clModal={clModal} setClModal={setClModal} clForm={clForm} setClForm={setClForm} editCl={editCl} saveCl={saveCl} clProjF={clProjF} setClProjF={setClProjF} clTypeF={clTypeF} setClTypeF={setClTypeF} clStatF={clStatF} setClStatF={setClStatF} clDeptF={clDeptF} setClDeptF={setClDeptF} role={role} wonDeals={wonDeals} Wrap={Wrap}/>;
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
  if(role==="Operations"){
    if(page==="home") return <OpsView projs={projs} projList={projList} deals={deals} selProj={selProj} setSelProj={setSelProj} opsTab={opsTab} setOpsTab={setOpsTab} proj={proj} projDeal={projDeal} upProj={upProj} overallProg={overallProg} costOf={costOf} marginOf={marginOf} openDesignEdit={openDesignEdit} swatches={swatches} swQ={swQ} openAddSwatch={(pid,by)=>{setSwForm({projectId:pid,name:"",category:"Fabric",qty:"",unit:"pcs",supplier:"",estCost:"",swatchLink:"",addedBy:by||"Ops",status:"To Buy",notes:""});setEditSw(null);setSwModal(true);}} openEditSwatch={sw=>{setSwForm({...sw});setEditSw(sw.id);setSwModal(true);}} delSwatch={id=>upSwatches(ss=>ss.filter(s=>s.id!==id))} exps={exps} openAddExp={openAddExp} openEditExp={openEditExp} delExp={delExp} clientName={clientName} matModal={matModal} setMatModal={setMatModal} matForm={matForm} setMatForm={setMatForm} editMat={editMat} setEditMat={setEditMat} saveMat={()=>{if(!matForm.name||!matForm.qty||!matForm.cost)return;const rec={...matForm,qty:Number(matForm.qty),cost:Number(matForm.cost),id:editMat||uid()};upProj(selProj,p=>({...p,materials:editMat?p.materials.map(m=>m.id===editMat?rec:m):[...p.materials,rec]}));setMatModal(false);setEditMat(null);setMatForm({name:"",qty:"",unit:"pcs",cost:"",received:false});}} Wrap={Wrap}/>;
    if(page==="procurement") return <ProcurementView swatches={swatches} projList={projList} clientName={clientName} openAddSwatch={(pid,by)=>{setSwForm({projectId:pid,name:"",category:"Fabric",qty:"",unit:"pcs",supplier:"",estCost:"",swatchLink:"",addedBy:by||"Ops",status:"To Buy",notes:""});setEditSw(null);setSwModal(true);}} openEditSwatch={sw=>{setSwForm({...sw});setEditSw(sw.id);setSwModal(true);}} delSwatch={id=>upSwatches(ss=>ss.filter(s=>s.id!==id))} swQ={swQ} Wrap={Wrap}/>;
    if(page==="checklist") return <ChecklistView checklist={checklist} projList={projList} deals={deals} clientName={clientName} openAddCl={openAddCl} openEditCl={openEditCl} delCl={delCl} clStatusQ={clStatusQ} clModal={clModal} setClModal={setClModal} clForm={clForm} setClForm={setClForm} editCl={editCl} saveCl={saveCl} clProjF={clProjF} setClProjF={setClProjF} clTypeF={clTypeF} setClTypeF={setClTypeF} clStatF={clStatF} setClStatF={setClStatF} clDeptF={clDeptF} setClDeptF={setClDeptF} role={role} wonDeals={wonDeals} Wrap={Wrap}/>;
  }

  // ─── DESIGN ───────────────────────────────────────────────────────────────
  if(role==="Design"){
    if(page==="home") return(
      <Wrap>
        <SecHead title="Design Projects"/>
        {projList.map(d=>{
          const p=projs[d.id]; const ds=p?.design?.status||"Briefing";
          const dsPct=Math.round((DESIGN_STATUSES.indexOf(ds))/(DESIGN_STATUSES.length-1)*100);
          return(
            <Card key={d.id} onClick={()=>{setSelProj(d.id);setOpsTab("design");}} accent={p.currentStage==="Design"?DS_CLR[ds]:undefined}>
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
            <Fld label="File / Link"><Inp type="url" value={proj.design?.link||""} onChange={e=>upProj(selProj,p=>({...p,design:{...p.design,link:e.target.value}}))} placeholder="https://drive.google.com/…"/></Fld>
            <Fld label="Notes"><Inp rows={3} value={proj.design?.notes||""} onChange={e=>upProj(selProj,p=>({...p,design:{...p.design,notes:e.target.value}}))}/></Fld>
            <Btn full onClick={()=>setSelProj(null)}>Done</Btn>
          </Modal>
        )}
      </Wrap>
    );
    if(page==="procurement") return <ProcurementView swatches={swatches} projList={projList} clientName={clientName} openAddSwatch={(pid,by)=>{setSwForm({projectId:pid,name:"",category:"Fabric",qty:"",unit:"pcs",supplier:"",estCost:"",swatchLink:"",addedBy:by||"Design",status:"To Buy",notes:""});setEditSw(null);setSwModal(true);}} openEditSwatch={sw=>{setSwForm({...sw});setEditSw(sw.id);setSwModal(true);}} delSwatch={id=>upSwatches(ss=>ss.filter(s=>s.id!==id))} swQ={swQ} Wrap={Wrap}/>;
  }

  return <Wrap><EmptyState icon="🔍" msg={`No view for ${role}/${page}`}/></Wrap>;
}

// ─── OPS VIEW ─────────────────────────────────────────────────────────────────
function OpsView({projs,projList,deals,selProj,setSelProj,opsTab,setOpsTab,proj,projDeal,upProj,overallProg,costOf,marginOf,openDesignEdit,swatches,swQ,openAddSwatch,openEditSwatch,delSwatch,exps,openAddExp,openEditExp,delExp,clientName,matModal,setMatModal,matForm,setMatForm,editMat,setEditMat,saveMat,Wrap}){
  const uid2=()=>String(Date.now());
  if(!selProj) return(
    <Wrap>
      <SecHead title="Projects" sub="Click any project to update stages, materials, and team"/>
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12}}>
        {projList.map(d=>{
          const p=projs[d.id]; const prog=overallProg(p);
          const pending=swatches.filter(s=>s.projectId===d.id&&s.status==="To Buy").length;
          const m=marginOf(p,d);
          return(
            <Card key={d.id} onClick={()=>{setSelProj(d.id);setOpsTab("progress");}} accent={p.currentStage==="Delivery"?"#6ee7b7":undefined}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                <div><div style={{fontWeight:700,color:"#0f172a"}}>{d.client}</div><div style={{fontSize:".75rem",color:"#64748b",marginTop:2}}>{d.product}</div></div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"flex-end"}}><Badge label={p.currentStage} color={PROD_CLR[p.currentStage]}/>{p.currentStage==="Design"&&<Badge label={p.design?.status||"Briefing"} color={DS_CLR[p.design?.status||"Briefing"]}/>}</div>
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
        {projList.length===0&&<div style={{gridColumn:"1/-1"}}><EmptyState icon="⚙" msg="No active projects. Mark a deal as Won in the Pipeline to create a project."/></div>}
      </div>
    </Wrap>
  );

  const tabs=[["progress","📊 Progress"],["team","👥 Team"],["materials","📦 Materials"],["swatches","🛒 Swatchboard"],["costs","💰 Costs"]];
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
    </Wrap>
  );
}

// ─── PROCUREMENT VIEW ─────────────────────────────────────────────────────────
function ProcurementView({swatches,projList,clientName,openAddSwatch,openEditSwatch,delSwatch,swQ,Wrap}){
  const toBuy=swatches.filter(s=>s.status==="To Buy");
  const ordered=swatches.filter(s=>s.status==="Ordered");
  const received=swatches.filter(s=>s.status==="Received");
  const[filter,setFilter]=useState("All");
  const shown=filter==="All"?swatches:swatches.filter(s=>s.status===filter);
  return(
    <Wrap>
      <SecHead title="Procurement Swatchboard" sub="Shared checklist — Design & Ops add, Procurement fulfills"/>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
        <KPI label="Total Items"  value={swatches.length}   color="#3b82f6"/>
        <KPI label="To Buy"       value={toBuy.length}      color="#ef4444"/>
        <KPI label="Ordered"      value={ordered.length}    color="#f59e0b"/>
        <KPI label="Received"     value={received.length}   color="#10b981"/>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
          {["All","To Buy","Ordered","Received"].map(f=>(
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
              <div style={{fontWeight:700,color:"#0f172a",fontSize:".98rem",textDecoration:sw.status==="Received"?"line-through":"none"}}>{sw.name}</div>
              <div style={{fontSize:".75rem",color:"#64748b",marginTop:3}}>{sw.qty} {sw.unit} · {sw.supplier||"No supplier specified"}</div>
              {sw.notes&&<div style={{fontSize:".73rem",color:"#94a3b8",marginTop:3,fontStyle:"italic"}}>{sw.notes}</div>}
              {sw.swatchLink&&<a href={sw.swatchLink} target="_blank" rel="noreferrer" style={{fontSize:".72rem",color:"#3b82f6",display:"block",marginTop:4}}>🔗 View reference</a>}
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
              <div style={{fontWeight:700,color:"#0f172a"}}>{jo.joNum}</div>
              <div style={{fontSize:".75rem",color:"#64748b",marginTop:2}}>{jo.deal?.client}</div>
              <div style={{fontSize:".72rem",color:"#94a3b8",marginTop:1}}>{jo.dateIssued}</div>
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
function ChecklistView({checklist,projList,deals,clientName,openAddCl,openEditCl,delCl,clStatusQ,clModal,setClModal,clForm,setClForm,editCl,saveCl,clProjF,setClProjF,clTypeF,setClTypeF,clStatF,setClStatF,clDeptF,setClDeptF,role,wonDeals,Wrap}){
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
      {Object.keys(byProject).length===0&&<EmptyState icon="✅" msg="No tasks match the current filters. Hit + Add Task to get started."/>}

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
