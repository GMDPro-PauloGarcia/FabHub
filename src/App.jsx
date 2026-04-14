import { useState, useMemo, useEffect, useCallback } from "react";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const DEAL_STAGES     = ["Lead","Quoted","Negotiation","Won","Lost"];
const PROD_STAGES     = ["Design","Fabrication","QC","Delivery"];
const DESIGN_STATUSES = ["Briefing","On-going","First Pass","Revision","Production Plans","Done"];
const PRODUCT_TYPES   = ["Custom Shelving","Display Fixtures","Signage","Countertops","Retail Cabinetry","Kiosks","Wall Panels","Millwork","Other"];
const PROD_MEMBERS    = ["Carlo M.","Dana R.","Enzo P.","Faye T.","Gino A.","Hana C.","Ivan L.","Jade O."];
const DESIGN_MEMBERS  = ["Alex R.","Bea T.","Chris N.","Diana L.","Edric M.","Freelancer / Outsourced"];
const MAT_UNITS       = ["pcs","sheets","meters","kg","sets","rolls","liters","sqm"];
const EXP_CATS        = ["Materials","Labor","Overhead","Utilities","Rent","Transport","Marketing","Salaries","Subcontractor","Other"];
const SWATCH_CATS     = ["Fabric","Paint","Hardware","Wood","Metal","Glass","Laminate","Tile","Lighting","Fixture","Trim","Adhesive","Other"];
const SWATCH_STATUS   = ["To Buy","Ordered","Received"];
const PAY_STATUS      = ["Unpaid","Partial","Paid","Deposited"];
const PRIORITIES      = ["Normal","High","Urgent"];
const MONTHS          = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const STAGE_CLR  = { Lead:"#94a3b8",Quoted:"#60a5fa",Negotiation:"#a78bfa",Won:"#34d399",Lost:"#f87171" };
const PROD_CLR   = { Design:"#818cf8",Fabrication:"#fb923c",QC:"#facc15",Delivery:"#4ade80" };
const PAY_CLR    = { Unpaid:"#f87171",Partial:"#fbbf24",Paid:"#4ade80",Deposited:"#34d399" };
const PRI_CLR    = { Normal:"#60a5fa",High:"#fbbf24",Urgent:"#f87171" };
const DS_CLR     = { Briefing:"#94a3b8","On-going":"#60a5fa","First Pass":"#a78bfa",Revision:"#fb923c","Production Plans":"#fbbf24",Done:"#4ade80" };
const SW_CLR     = { "To Buy":"#f87171",Ordered:"#fbbf24",Received:"#4ade80" };

const fmt    = n => "₱" + Number(n||0).toLocaleString("en-PH",{minimumFractionDigits:0});
const fmtK   = n => n>=1000 ? "₱"+(n/1000).toFixed(0)+"k" : "₱"+(n||0);
const today  = new Date().toISOString().split("T")[0];
const todayL = new Date().toLocaleDateString("en-PH",{year:"numeric",month:"long",day:"numeric"});
let _id = 300; const uid = () => ++_id;

const KEYS = {
  deals:"fabhub4:deals", projects:"fabhub4:projects",
  expenses:"fabhub4:expenses", inflows:"fabhub4:inflows",
  jos:"fabhub4:jos", swatches:"fabhub4:swatches"
};

// ─── SEED ─────────────────────────────────────────────────────────────────────
const mkDesign = (status="Briefing",designer="",type="in-house",dueDate="",link="",notes="") => ({
  status, designer, designerType:type, dueDate, link, notes,
  statusHistory:[{status,date:today,by:"System"}], deliverables:[]
});

const SEED_DEALS = [
  {id:1,client:"Metro Retail Co.",   product:"Custom Shelving", value:24500,stage:"Won",        probability:100,contact:"Jane Reyes", followUp:"2026-04-18",notes:"Specs finalised",          invoiced:24500,amountPaid:24500,paymentStatus:"Paid",     dueDate:"2026-04-15",priority:"Normal"},
  {id:2,client:"Bloom Boutique",     product:"Display Fixtures",value:11200,stage:"Won",        probability:100,contact:"Mark Santos",followUp:"2026-04-15",notes:"Discount applied",          invoiced:11200,amountPaid:5600, paymentStatus:"Deposited",dueDate:"2026-04-12",priority:"High"},
  {id:3,client:"TechZone PH",        product:"Kiosks",          value:58000,stage:"Won",        probability:100,contact:"Carla Dizon",followUp:"2026-04-20",notes:"Production starts May",     invoiced:58000,amountPaid:0,    paymentStatus:"Unpaid",   dueDate:"2026-04-30",priority:"Urgent"},
  {id:4,client:"FreshMart",          product:"Countertops",     value:8750, stage:"Lead",       probability:25, contact:"Luis Tan",  followUp:"2026-04-16",notes:"Needs site visit",          invoiced:0,    amountPaid:0,    paymentStatus:"Unpaid",   dueDate:"",          priority:"Normal"},
  {id:5,client:"Luxe Living",        product:"Wall Panels",     value:31000,stage:"Lost",       probability:0,  contact:"Ana Cruz",  followUp:"",           notes:"Went with another supplier",invoiced:0,    amountPaid:0,    paymentStatus:"Unpaid",   dueDate:"",          priority:"Normal"},
  {id:6,client:"UrbanNest Interiors",product:"Retail Cabinetry",value:19800,stage:"Won",        probability:100,contact:"Rico Valdez",followUp:"2026-04-22",notes:"Rush order",                invoiced:19800,amountPaid:9900, paymentStatus:"Deposited",dueDate:"2026-04-14",priority:"High"},
  {id:7,client:"StyleBox MNL",       product:"Signage",         value:6500, stage:"Quoted",     probability:50, contact:"Mia Reyes", followUp:"2026-04-25",notes:"Sent proposal",             invoiced:0,    amountPaid:0,    paymentStatus:"Unpaid",   dueDate:"",          priority:"Normal"},
  {id:8,client:"PrimeParts Inc.",    product:"Millwork",        value:42000,stage:"Negotiation",probability:70, contact:"Ben Ocampo",followUp:"2026-04-17",notes:"Discussing scope",           invoiced:0,    amountPaid:0,    paymentStatus:"Unpaid",   dueDate:"",          priority:"High"},
];
const SEED_PROJECTS = {
  1:{currentStage:"Delivery",  progress:{Design:100,Fabrication:100,QC:100,Delivery:85},stageDates:{Design:{s:"2026-02-01",e:"2026-02-10"},Fabrication:{s:"2026-02-11",e:"2026-03-05"},QC:{s:"2026-03-06",e:"2026-03-10"},Delivery:{s:"2026-03-11",e:"2026-04-15"}},team:["Carlo M.","Enzo P."],materials:[{id:1,name:"Steel angle bars",qty:40,unit:"pcs",cost:12000,received:true},{id:2,name:"MDF boards 18mm",qty:20,unit:"sheets",cost:8000,received:true}],laborCost:18000,overhead:4000,notes:"Final installation ongoing.",design:mkDesign("Done","Alex R.","in-house","2026-02-10","https://drive.google.com","Approved.")},
  2:{currentStage:"QC",        progress:{Design:100,Fabrication:100,QC:60,Delivery:0}, stageDates:{Design:{s:"2026-02-15",e:"2026-02-22"},Fabrication:{s:"2026-02-23",e:"2026-03-20"},QC:{s:"2026-03-21",e:"2026-04-10"},Delivery:{s:"2026-04-11",e:"2026-04-20"}},team:["Faye T.","Gino A."],  materials:[{id:4,name:"Tempered glass 8mm",qty:12,unit:"pcs",cost:9600,received:true},{id:5,name:"LED strip lights",qty:8,unit:"rolls",cost:3200,received:false}],laborCost:12000,overhead:3000,notes:"QC punch list in progress.",design:mkDesign("Done","Bea T.","in-house","2026-02-22","https://figma.com","Signed off.")},
  3:{currentStage:"Fabrication",progress:{Design:100,Fabrication:40,QC:0,Delivery:0},  stageDates:{Design:{s:"2026-03-01",e:"2026-03-15"},Fabrication:{s:"2026-03-16",e:"2026-04-30"},QC:{s:"2026-05-01",e:"2026-05-10"},Delivery:{s:"2026-05-11",e:"2026-05-25"}},team:["Carlo M.","Hana C."],  materials:[{id:7,name:"Steel square tubes",qty:80,unit:"pcs",cost:32000,received:true},{id:9,name:"Laminate sheets",qty:30,unit:"sheets",cost:9000,received:false}],laborCost:45000,overhead:12000,notes:"Assembly ongoing.",design:mkDesign("Done","Freelancer / Outsourced","outsourced","2026-03-15","https://drive.google.com","Plans submitted.")},
  6:{currentStage:"Design",    progress:{Design:30,Fabrication:0,QC:0,Delivery:0},     stageDates:{Design:{s:"2026-04-01",e:"2026-04-18"},Fabrication:{s:"2026-04-19",e:"2026-05-10"},QC:{s:"2026-05-11",e:"2026-05-14"},Delivery:{s:"2026-05-15",e:"2026-05-22"}},team:["Dana R."],           materials:[{id:10,name:"Plywood 3/4\"",qty:25,unit:"sheets",cost:10000,received:false}],laborCost:14000,overhead:3500,notes:"Revisions pending.",design:mkDesign("Revision","Chris N.","in-house","2026-04-18","","2nd revision.")},
};
// Enhanced expenses — now linked to projectId or null (company-wide), with receipt field
const SEED_EXP = [
  {id:1,month:0,category:"Salaries",amount:85000,note:"Jan full team",projectId:null,receipt:""},
  {id:2,month:0,category:"Rent",amount:18000,note:"Workshop Jan",projectId:null,receipt:""},
  {id:3,month:0,category:"Materials",amount:12000,note:"Steel & MDF – Metro Retail",projectId:1,receipt:""},
  {id:4,month:1,category:"Salaries",amount:85000,note:"Feb full team",projectId:null,receipt:""},
  {id:5,month:1,category:"Materials",amount:9600,note:"Glass – Bloom Boutique",projectId:2,receipt:""},
  {id:6,month:1,category:"Rent",amount:18000,note:"Workshop Feb",projectId:null,receipt:""},
  {id:7,month:2,category:"Salaries",amount:85000,note:"Mar full team",projectId:null,receipt:""},
  {id:8,month:2,category:"Materials",amount:32000,note:"Steel tubes – TechZone",projectId:3,receipt:""},
  {id:9,month:2,category:"Rent",amount:18000,note:"Workshop Mar",projectId:null,receipt:""},
  {id:10,month:3,category:"Salaries",amount:85000,note:"Apr full team",projectId:null,receipt:""},
  {id:11,month:3,category:"Materials",amount:10000,note:"Plywood – UrbanNest",projectId:6,receipt:""},
  {id:12,month:3,category:"Overhead",amount:8500,note:"Equipment maintenance",projectId:null,receipt:""},
];
const SEED_INF = [
  {id:1,month:0,source:"Metro Retail Co.",amount:18000,note:"Partial",projectId:1},
  {id:2,month:1,source:"Metro Retail Co.",amount:6500,note:"Final",projectId:1},
  {id:3,month:1,source:"Bloom Boutique",amount:5600,note:"Deposit",projectId:2},
  {id:4,month:2,source:"UrbanNest Interiors",amount:9900,note:"50% deposit",projectId:6},
  {id:5,month:3,source:"Metro Retail Co.",amount:24500,note:"Full payment",projectId:1},
  {id:6,month:3,source:"Bloom Boutique",amount:5600,note:"Partial",projectId:2},
];
// Swatchboard seed — shared across projects
const SEED_SWATCHES = [
  {id:1,projectId:3,name:"Brushed steel sample",category:"Metal",qty:2,unit:"pcs",supplier:"MetalWorks PH",estCost:800,swatchLink:"",addedBy:"Design",status:"Received",notes:"For kiosk frame finish",date:today},
  {id:2,projectId:3,name:"Matte black laminate",category:"Laminate",qty:10,unit:"sheets",supplier:"SurfacePro",estCost:3500,swatchLink:"",addedBy:"Ops",status:"Ordered",notes:"Cabinet interiors",date:today},
  {id:3,projectId:6,name:"Walnut veneer roll",category:"Wood",qty:5,unit:"rolls",supplier:"WoodCraft MNL",estCost:2500,swatchLink:"",addedBy:"Design",status:"To Buy",notes:"Match client sample",date:today},
  {id:4,projectId:6,name:"Brass pulls 96mm",category:"Hardware",qty:30,unit:"pcs",supplier:"Casa Hardware",estCost:1200,swatchLink:"",addedBy:"Design",status:"To Buy",notes:"Drawer pulls per design spec",date:today},
  {id:5,projectId:2,name:"Warm white LED strip",category:"Lighting",qty:15,unit:"meters",supplier:"LightHub",estCost:2250,swatchLink:"",addedBy:"Ops",status:"Received",notes:"3000K, 12V",date:today},
];

const emptyDeal    = {client:"",product:"Custom Shelving",value:"",stage:"Lead",probability:25,contact:"",followUp:"",notes:"",invoiced:"",amountPaid:"",paymentStatus:"Unpaid",dueDate:"",priority:"Normal"};
const emptyProject = () => ({currentStage:"Design",progress:{Design:0,Fabrication:0,QC:0,Delivery:0},stageDates:{Design:{s:"",e:""},Fabrication:{s:"",e:""},QC:{s:"",e:""},Delivery:{s:"",e:""}},team:[],materials:[],laborCost:0,overhead:0,notes:"",design:mkDesign()});
const emptySwatch  = {projectId:null,name:"",category:"Fabric",qty:"",unit:"pcs",supplier:"",estCost:"",swatchLink:"",addedBy:"Design",status:"To Buy",notes:""};
const emptyExp     = {month:new Date().getMonth(),category:"Materials",amount:"",note:"",projectId:null,receipt:""};

// ─── UI ATOMS ─────────────────────────────────────────────────────────────────
const Pill = ({label,color,size="sm"}) => (
  <span style={{display:"inline-block",padding:size==="sm"?"2px 8px":"3px 12px",borderRadius:4,background:color+"22",color,fontWeight:700,fontSize:size==="sm"?".63rem":".73rem",border:`1px solid ${color}44`,whiteSpace:"nowrap"}}>{label}</span>
);
const Bar = ({pct,color="#fb923c",h=5}) => (
  <div style={{height:h,background:"#21262d",borderRadius:h/2,overflow:"hidden"}}>
    <div style={{height:"100%",width:Math.min(pct,100)+"%",background:color,transition:"width .4s",borderRadius:h/2}}/>
  </div>
);
const KPI = ({label,value,color,sub,onClick}) => (
  <div onClick={onClick} style={{background:"#161b22",border:"1px solid #21262d",borderRadius:10,padding:"15px 18px",cursor:onClick?"pointer":"default",transition:"border-color .15s"}}
    onMouseEnter={e=>{if(onClick)e.currentTarget.style.borderColor=color;}} onMouseLeave={e=>{if(onClick)e.currentTarget.style.borderColor="#21262d";}}>
    <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.5rem",color,lineHeight:1}}>{value}</div>
    {sub&&<div style={{fontSize:".66rem",color,marginTop:2,opacity:.7}}>{sub}</div>}
    <div style={{fontSize:".63rem",textTransform:"uppercase",letterSpacing:"1.5px",color:"#4a5268",marginTop:5}}>{label}</div>
  </div>
);
const SyncDot = ({s}) => {
  const m={saving:{c:"#fbbf24",t:"Saving…"},saved:{c:"#3fb950",t:"✓ Saved"},loading:{c:"#60a5fa",t:"Loading…"},error:{c:"#f85149",t:"Sync error"}};
  const {c,t}=m[s]||m.saved;
  return <span style={{fontSize:".68rem",color:c,display:"flex",alignItems:"center",gap:5}}><span style={{width:6,height:6,borderRadius:"50%",background:c,display:"inline-block"}}/>{t}</span>;
};

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function FabHub() {
  const [page,     setPage]    = useState("dashboard");
  const [deals,    setDeals]   = useState(SEED_DEALS);
  const [projs,    setProjs]   = useState(SEED_PROJECTS);
  const [exps,     setExps]    = useState(SEED_EXP);
  const [infs,     setInfs]    = useState(SEED_INF);
  const [jos,      setJos]     = useState([]);
  const [swatches, setSwatches]= useState(SEED_SWATCHES);
  const [sync,     setSync]    = useState("loading");
  const [ready,    setReady]   = useState(false);

  useEffect(()=>{
    setSync("loading");
    try {
      const d  = localStorage.getItem(KEYS.deals);
      const p  = localStorage.getItem(KEYS.projects);
      const e  = localStorage.getItem(KEYS.expenses);
      const i  = localStorage.getItem(KEYS.inflows);
      const j  = localStorage.getItem(KEYS.jos);
      const sw = localStorage.getItem(KEYS.swatches);
      if(d)  setDeals(JSON.parse(d));
      if(p)  setProjs(JSON.parse(p));
      if(e)  setExps(JSON.parse(e));
      if(i)  setInfs(JSON.parse(i));
      if(j)  setJos(JSON.parse(j));
      if(sw) setSwatches(JSON.parse(sw));
    } catch{}
    setSync("saved"); setReady(true);
  },[]);

  const save = useCallback((key,val)=>{
    setSync("saving");
    try{ localStorage.setItem(key,JSON.stringify(val)); setSync("saved"); }
    catch{ setSync("error"); }
  },[]);

  const upDeals    = useCallback(fn=>setDeals(p=>{const n=fn(p);save(KEYS.deals,n);return n;}),[save]);
  const upProjs    = useCallback(fn=>setProjs(p=>{const n=fn(p);save(KEYS.projects,n);return n;}),[save]);
  const upExps     = useCallback(fn=>setExps(p=> {const n=fn(p);save(KEYS.expenses,n);return n;}),[save]);
  const upInfs     = useCallback(fn=>setInfs(p=> {const n=fn(p);save(KEYS.inflows,n);return n;}),[save]);
  const upJos      = useCallback(fn=>setJos(p=>  {const n=fn(p);save(KEYS.jos,n);    return n;}),[save]);
  const upSwatches = useCallback(fn=>setSwatches(p=>{const n=fn(p);save(KEYS.swatches,n);return n;}),[save]);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [dealModal,  setDealModal]  = useState(false);
  const [dealForm,   setDealForm]   = useState(emptyDeal);
  const [editDeal,   setEditDeal]   = useState(null);
  const [expModal,   setExpModal]   = useState(false);
  const [expForm,    setExpForm]    = useState(emptyExp);
  const [editExp,    setEditExp]    = useState(null);
  const [infModal,   setInfModal]   = useState(false);
  const [infForm,    setInfForm]    = useState({month:new Date().getMonth(),source:"",amount:"",note:"",projectId:null});
  const [selProj,    setSelProj]    = useState(null);
  const [opsTab,     setOpsTab]     = useState("design");
  const [matModal,   setMatModal]   = useState(false);
  const [matForm,    setMatForm]    = useState({name:"",qty:"",unit:"pcs",cost:"",received:false});
  const [editMat,    setEditMat]    = useState(null);
  const [joStep,     setJoStep]     = useState("select");
  const [joSel,      setJoSel]      = useState(null);
  const [joExtra,    setJoExtra]    = useState({address:"",phone:"",priority:"Normal",extraNotes:""});
  const [viewJO,     setViewJO]     = useState(null);
  const [sfilt,      setSfilt]      = useState("All");
  const [pfilt,      setPfilt]      = useState("All");
  const [srch,       setSrch]       = useState("");
  const [finTab,     setFinTab]     = useState("overview");
  const [finMo,      setFinMo]      = useState(new Date().getMonth());
  const [finProj,    setFinProj]    = useState("all");
  const [designModal,setDesignModal]= useState(false);
  const [designForm, setDesignForm] = useState({});
  const [delivForm,  setDelivForm]  = useState({label:"",url:""});
  const [addDelivM,  setAddDelivM]  = useState(false);
  const [swModal,    setSwModal]    = useState(false);
  const [swForm,     setSwForm]     = useState(emptySwatch);
  const [editSw,     setEditSw]     = useState(null);
  const [swProjFilt, setSwProjFilt] = useState("all");
  const [swStatFilt, setSwStatFilt] = useState("All");
  const [swCatFilt,  setSwCatFilt]  = useState("All");
  const [confirmReset,setConfirmReset]=useState(false);

  // ── Derived ──────────────────────────────────────────────────────────────
  const wonDeals = useMemo(()=>deals.filter(d=>d.stage==="Won"),[deals]);
  const projList = useMemo(()=>wonDeals.filter(d=>projs[d.id]),[wonDeals,projs]);
  const proj     = selProj?projs[selProj]:null;
  const projDeal = selProj?deals.find(d=>d.id===selProj):null;

  const overallProg = p=>{const si=PROD_STAGES.indexOf(p.currentStage);return Math.round(si*25+(p.progress[p.currentStage]||0)*0.25);};
  const costOf      = p=>(p.materials||[]).reduce((s,m)=>s+m.cost,0)+(p.laborCost||0)+(p.overhead||0);

  // ── Project-level profit ──────────────────────────────────────────────────
  const projProfit = useCallback((projId)=>{
    const deal = deals.find(d=>d.id===projId);
    if(!deal) return {revenue:0,expenses:0,profit:0,margin:0};
    const revenue  = deal.amountPaid||0;
    const projExps = exps.filter(e=>e.projectId===projId).reduce((s,e)=>s+e.amount,0);
    const p        = projs[projId];
    const opsCost  = p?costOf(p):0;
    const totalExp = projExps;
    const contractVal = deal.value||0;
    const totalCost   = opsCost;
    const profit      = contractVal - totalCost;
    const margin      = contractVal>0?Math.round(profit/contractVal*100):0;
    return {revenue:contractVal,expenses:totalCost,profit,margin,collected:revenue,projExps};
  },[deals,exps,projs]);

  // ── Company-wide finance ─────────────────────────────────────────────────
  const monthly  = useMemo(()=>MONTHS.map((m,mi)=>({month:m,inflow:infs.filter(i=>i.month===mi).reduce((s,i)=>s+i.amount,0),outflow:exps.filter(e=>e.month===mi).reduce((s,e)=>s+e.amount,0)})),[infs,exps]);
  const cumul    = useMemo(()=>{let r=0;return monthly.map(m=>{r+=m.inflow-m.outflow;return{...m,net:m.inflow-m.outflow,cum:r};});},[monthly]);
  const totRev   = useMemo(()=>wonDeals.reduce((s,d)=>s+d.value,0),[wonDeals]);
  const totExp   = useMemo(()=>exps.reduce((s,e)=>s+e.amount,0),[exps]);
  const totColl  = useMemo(()=>wonDeals.reduce((s,d)=>s+d.amountPaid,0),[wonDeals]);
  const totOut   = useMemo(()=>wonDeals.reduce((s,d)=>s+d.invoiced-d.amountPaid,0),[wonDeals]);
  const grossPro = totRev - totExp;
  const grossMar = totRev>0?Math.round(grossPro/totRev*100):0;

  // ── Swatchboard filtered ─────────────────────────────────────────────────
  const filtSwatches = useMemo(()=>swatches
    .filter(s=>swProjFilt==="all"||String(s.projectId)===String(swProjFilt))
    .filter(s=>swStatFilt==="All"||s.status===swStatFilt)
    .filter(s=>swCatFilt==="All"||s.category===swCatFilt)
  ,[swatches,swProjFilt,swStatFilt,swCatFilt]);

  const swTotals = useMemo(()=>({
    total:swatches.length,
    toBuy:swatches.filter(s=>s.status==="To Buy").length,
    ordered:swatches.filter(s=>s.status==="Ordered").length,
    received:swatches.filter(s=>s.status==="Received").length,
    estCost:swatches.reduce((s,sw)=>s+Number(sw.estCost||0),0),
  }),[swatches]);

  const filtDeals = useMemo(()=>deals
    .filter(d=>sfilt==="All"||d.stage===sfilt)
    .filter(d=>pfilt==="All"||d.paymentStatus===pfilt)
    .filter(d=>!srch||d.client.toLowerCase().includes(srch.toLowerCase())||d.contact.toLowerCase().includes(srch.toLowerCase()))
  ,[deals,sfilt,pfilt,srch]);

  const dash = useMemo(()=>{
    const active=deals.filter(d=>d.stage!=="Lost"),won=deals.filter(d=>d.stage==="Won"),closed=deals.filter(d=>d.stage==="Won"||d.stage==="Lost");
    return{pipeline:active.reduce((s,d)=>s+d.value,0),won:won.reduce((s,d)=>s+d.value,0),collected:totColl,outstanding:totOut,winRate:closed.length?Math.round(won.length/closed.length*100):0,netCash:cumul[new Date().getMonth()]?.cum||0,activeProj:projList.length,designActive:projList.filter(d=>projs[d.id]?.currentStage==="Design").length,pendingMat:Object.values(projs).reduce((s,p)=>s+p.materials.filter(m=>!m.received).length,0),swatchToBuy:swTotals.toBuy,grossMargin:grossMar};
  },[deals,projs,projList,cumul,totColl,totOut,swTotals,grossMar]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const openAdd  = ()=>{setDealForm(emptyDeal);setEditDeal(null);setDealModal(true);};
  const openEdit = d=>{setDealForm({...d,value:String(d.value),invoiced:String(d.invoiced||0),amountPaid:String(d.amountPaid||0)});setEditDeal(d.id);setDealModal(true);};
  const saveDeal = ()=>{
    if(!dealForm.client||!dealForm.value) return;
    const rec={...dealForm,id:editDeal||uid(),value:Number(dealForm.value),invoiced:Number(dealForm.invoiced||0),amountPaid:Number(dealForm.amountPaid||0),probability:dealForm.stage==="Won"?100:dealForm.stage==="Lost"?0:Number(dealForm.probability)};
    if(dealForm.stage==="Won"&&!editDeal) upProjs(ps=>({...ps,[rec.id]:emptyProject()}));
    upDeals(ds=>editDeal?ds.map(d=>d.id===editDeal?rec:d):[...ds,rec]);
    setDealModal(false);
  };
  const delDeal = id=>{upDeals(ds=>ds.filter(d=>d.id!==id));upProjs(ps=>{const n={...ps};delete n[id];return n;});};
  const stageQ  = (id,st)=>upDeals(ds=>ds.map(d=>d.id===id?{...d,stage:st,probability:st==="Won"?100:st==="Lost"?0:d.probability}:d));
  const payQ    = (id,ps)=>upDeals(ds=>ds.map(d=>d.id===id?{...d,paymentStatus:ps}:d));

  const upProj    = (id,fn)=>upProjs(ps=>({...ps,[id]:fn(ps[id]||emptyProject())}));
  const advStage  = (id,s) =>upProj(id,p=>({...p,currentStage:s}));
  const updProg   = (id,s,v)=>upProj(id,p=>({...p,progress:{...p.progress,[s]:Number(v)}}));
  const togTeam   = (id,m) =>upProj(id,p=>({...p,team:p.team.includes(m)?p.team.filter(x=>x!==m):[...p.team,m]}));
  const togRecv   = mid    =>upProj(selProj,p=>({...p,materials:p.materials.map(m=>m.id===mid?{...m,received:!m.received}:m)}));
  const delMat    = mid    =>upProj(selProj,p=>({...p,materials:p.materials.filter(m=>m.id!==mid)}));
  const saveMat   = ()=>{
    if(!matForm.name||!matForm.qty||!matForm.cost) return;
    const rec={...matForm,qty:Number(matForm.qty),cost:Number(matForm.cost),id:editMat||uid()};
    upProj(selProj,p=>({...p,materials:editMat?p.materials.map(m=>m.id===editMat?rec:m):[...p.materials,rec]}));
    setMatModal(false);setEditMat(null);setMatForm({name:"",qty:"",unit:"pcs",cost:"",received:false});
  };

  const openDesignEdit = ()=>{setDesignForm({...(proj?.design||mkDesign())});setDesignModal(true);};
  const saveDesign = ()=>{
    const next={...designForm};
    if(proj?.design?.status!==next.status) next.statusHistory=[...(proj?.design?.statusHistory||[]),{status:next.status,date:today,by:"Team"}];
    upProj(selProj,p=>({...p,design:next}));
    if(next.status==="Done"&&proj?.currentStage==="Design") upProj(selProj,p=>({...p,currentStage:"Fabrication",progress:{...p.progress,Design:100}}));
    setDesignModal(false);
  };
  const addDeliverable = ()=>{
    if(!delivForm.label) return;
    upProj(selProj,p=>({...p,design:{...p.design,deliverables:[...(p.design?.deliverables||[]),{...delivForm,id:uid(),addedDate:today}]}}));
    setDelivForm({label:"",url:""});setAddDelivM(false);
  };
  const delDeliverable = id=>upProj(selProj,p=>({...p,design:{...p.design,deliverables:(p.design?.deliverables||[]).filter(d=>d.id!==id)}}));

  // Expense helpers
  const openAddExp  = ()=>{setExpForm(emptyExp);setEditExp(null);setExpModal(true);};
  const openEditExp = e=>{setExpForm({...e});setEditExp(e.id);setExpModal(true);};
  const saveExp = ()=>{
    if(!expForm.amount) return;
    const rec={...expForm,amount:Number(expForm.amount),id:editExp||uid()};
    upExps(es=>editExp?es.map(e=>e.id===editExp?rec:e):[...es,rec]);
    setExpModal(false);setEditExp(null);setExpForm(emptyExp);
  };
  const delExp = id=>upExps(es=>es.filter(e=>e.id!==id));

  const saveInf = ()=>{
    if(!infForm.source||!infForm.amount) return;
    upInfs(is=>[...is,{...infForm,amount:Number(infForm.amount),id:uid()}]);
    setInfModal(false);setInfForm({month:new Date().getMonth(),source:"",amount:"",note:"",projectId:null});
  };
  const delInf = id=>upInfs(is=>is.filter(i=>i.id!==id));

  // Swatch helpers
  const openAddSwatch = (projId=null)=>{setSwForm({...emptySwatch,projectId:projId||null,date:today});setEditSw(null);setSwModal(true);};
  const openEditSwatch = sw=>{setSwForm({...sw});setEditSw(sw.id);setSwModal(true);};
  const saveSwatch = ()=>{
    if(!swForm.name) return;
    const rec={...swForm,estCost:Number(swForm.estCost||0),id:editSw||uid(),date:today};
    upSwatches(ss=>editSw?ss.map(s=>s.id===editSw?rec:s):[...ss,rec]);
    setSwModal(false);setEditSw(null);
  };
  const delSwatch   = id=>upSwatches(ss=>ss.filter(s=>s.id!==id));
  const swStatusQ   = (id,st)=>upSwatches(ss=>ss.map(s=>s.id===id?{...s,status:st}:s));

  const issueJO = ()=>{
    const d=deals.find(x=>x.id===joSel),p=projs[joSel];
    const matT=(p?.materials||[]).reduce((s,m)=>s+m.cost,0);
    const totC=p?matT+(p.laborCost||0)+(p.overhead||0):0;
    const jo={joNum:`JO-${new Date().getFullYear()}-${String(jos.length+1).padStart(3,"0")}`,dateIssued:todayL,deal:d,project:p,matTotal:matT,totalCost:totC,...joExtra};
    upJos(j=>[jo,...j]);setViewJO(jo);setJoStep("preview");
  };

  const resetAll = ()=>{
    upDeals(()=>SEED_DEALS);upProjs(()=>SEED_PROJECTS);upExps(()=>SEED_EXP);upInfs(()=>SEED_INF);upJos(()=>[]);upSwatches(()=>SEED_SWATCHES);
    setDeals(SEED_DEALS);setProjs(SEED_PROJECTS);setExps(SEED_EXP);setInfs(SEED_INF);setJos([]);setSwatches(SEED_SWATCHES);
    setConfirmReset(false);
  };

  // ─── STYLES ──────────────────────────────────────────────────────────────
  const S={
    app:  {minHeight:"100vh",background:"#0d1117",color:"#c9d1d9",fontFamily:"'Segoe UI',system-ui,sans-serif"},
    nav:  {background:"#161b22",borderBottom:"1px solid #21262d",display:"flex",alignItems:"center",padding:"0 18px",height:52,gap:2,position:"sticky",top:0,zIndex:100},
    nb:   a=>({background:a?"#21262d":"transparent",border:"none",color:a?"#f0f6fc":"#8b949e",padding:"6px 12px",borderRadius:6,cursor:"pointer",fontSize:".78rem",fontWeight:a?600:400,transition:"all .15s",whiteSpace:"nowrap"}),
    main: {maxWidth:1280,margin:"0 auto",padding:"20px 16px"},
    card: {background:"#161b22",border:"1px solid #21262d",borderRadius:10,padding:16,marginBottom:10,cursor:"pointer",transition:"border-color .15s"},
    inp:  {width:"100%",background:"#0d1117",border:"1px solid #30363d",borderRadius:6,padding:"7px 10px",color:"#c9d1d9",fontFamily:"inherit",fontSize:".83rem",outline:"none"},
    lbl:  {fontSize:".64rem",textTransform:"uppercase",letterSpacing:"1.2px",color:"#6e7681",marginBottom:4,display:"block"},
    btn:  v=>({background:v==="pri"?"#238636":v==="acc"?"#1f6feb":v==="dan"?"#da3633":v==="purple"?"#6e40c9":v==="teal"?"#0e9488":"transparent",color:v==="ghost"?"#8b949e":"#fff",border:v==="ghost"?"1px solid #30363d":"none",borderRadius:6,padding:"6px 13px",fontFamily:"inherit",fontWeight:600,fontSize:".78rem",cursor:"pointer",whiteSpace:"nowrap"}),
    modal:{position:"fixed",inset:0,background:"rgba(1,4,9,.88)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center"},
    mbox: {background:"#161b22",border:"1px solid #30363d",borderRadius:12,padding:24,width:"100%",maxWidth:520,maxHeight:"92vh",overflowY:"auto"},
    sec:  {fontSize:".67rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"1.2px",color:"#6e7681",marginBottom:7,marginTop:12},
    th:   {padding:"7px 10px",textAlign:"left",borderBottom:"1px solid #21262d",color:"#6e7681",fontWeight:600,fontSize:".68rem",textTransform:"uppercase"},
    td:   {padding:"8px 10px",borderBottom:"1px solid #161b22",fontSize:".8rem"},
  };

  if(!ready) return(
    <div style={{...S.app,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:14}}>
      <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.6rem",color:"#388bfd"}}>FABHUB</div>
      <div style={{fontSize:".8rem",color:"#6e7681"}}>Loading shared workspace…</div>
      <style>{`@keyframes pl{0%{transform:translateX(-100%)}100%{transform:translateX(260%)}}`}</style>
      <div style={{width:180,height:3,background:"#21262d",borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",width:"70%",background:"#388bfd",borderRadius:2,animation:"pl 1.2s ease infinite"}}/></div>
    </div>
  );

  const clientName = id=>deals.find(d=>d.id===id)?.client||`Project #${id}`;

  return(
    <div style={S.app}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&display=swap');
        *{box-sizing:border-box;} input:focus,select:focus,textarea:focus{border-color:#388bfd!important;outline:none;}
        ::-webkit-scrollbar{width:5px;height:5px;} ::-webkit-scrollbar-track{background:#0d1117;} ::-webkit-scrollbar-thumb{background:#30363d;border-radius:3px;}
        .rh:hover{border-color:#388bfd!important;} .bi{background:transparent;border:1px solid #30363d;border-radius:4px;padding:3px 7px;color:#6e7681;cursor:pointer;font-size:.68rem;}
        .bi:hover{border-color:#c9d1d9;color:#c9d1d9;} .tb{background:transparent;border:none;border-bottom:2px solid transparent;padding:7px 13px;color:#6e7681;font-size:.75rem;font-weight:600;cursor:pointer;}
        .tb.on{color:#f0f6fc;border-bottom-color:#388bfd;} @keyframes fi{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:none}} .fi{animation:fi .18s ease;}
        .sw-row:hover{background:#21262d!important;} @media print{.np{display:none!important;}}
      `}</style>

      {/* ── NAV ── */}
      <div style={S.nav} className="np">
        <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.05rem",color:"#f0f6fc",marginRight:10}}><span style={{color:"#388bfd"}}>FAB</span>HUB</div>
        {[["dashboard","Dashboard"],["pipeline","Pipeline"],["finance","Finance"],["ops","Operations"],["procurement","Procurement"],["joborders","Job Orders"]].map(([id,label])=>(
          <button key={id} style={S.nb(page===id)} onClick={()=>setPage(id)}>{label}</button>
        ))}
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:12}}>
          <SyncDot s={sync}/>
          <span style={{fontSize:".67rem",color:"#6e7681"}}>{deals.length} deals · {projList.length} proj · {swatches.length} swatches</span>
          <button className="bi" style={{color:"#f85149",borderColor:"#3a1010"}} onClick={()=>setConfirmReset(true)}>Reset</button>
        </div>
      </div>

      <div style={S.main}>

        {/* ══ DASHBOARD ══════════════════════════════════════════════════════ */}
        {page==="dashboard"&&(
          <div className="fi">
            <div style={{marginBottom:16}}>
              <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.35rem",color:"#f0f6fc"}}>Good day — here's your overview</div>
              <div style={{fontSize:".73rem",color:"#6e7681",marginTop:2}}>{todayL} · <span style={{color:"#388bfd"}}>Live shared workspace</span></div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:9,marginBottom:10}}>
              <KPI label="Pipeline Value"  value={fmtK(dash.pipeline)} color="#388bfd"/>
              <KPI label="Won Revenue"     value={fmtK(dash.won)}      color="#3fb950"/>
              <KPI label="Collected"       value={fmtK(dash.collected)} color="#3fb950" sub={`${fmtK(dash.outstanding)} out`}/>
              <KPI label="Gross Margin"    value={dash.grossMargin+"%"} color={dash.grossMargin>=20?"#4ade80":"#fbbf24"}/>
              <KPI label="Win Rate"        value={dash.winRate+"%"}     color="#d2a8ff"/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:9,marginBottom:20}}>
              <KPI label="Net Cash"        value={fmtK(dash.netCash)}   color={dash.netCash>=0?"#3fb950":"#f85149"}/>
              <KPI label="Active Projects" value={dash.activeProj}      color="#ffa657"/>
              <KPI label="In Design"       value={dash.designActive}    color="#818cf8"/>
              <KPI label="Swatches To Buy" value={dash.swatchToBuy}     color="#f87171" onClick={()=>setPage("procurement")}/>
              <KPI label="Mats Pending"    value={dash.pendingMat}      color="#fbbf24"/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
              <div style={{background:"#161b22",border:"1px solid #21262d",borderRadius:10,padding:16}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <div style={S.sec}>Recent Pipeline</div>
                  <button style={S.btn("acc")} onClick={()=>setPage("pipeline")}>All</button>
                </div>
                {deals.slice(0,6).map(d=>(
                  <div key={d.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"1px solid #21262d"}}>
                    <div><div style={{fontWeight:600,color:"#f0f6fc",fontSize:".85rem"}}>{d.client}</div><div style={{fontSize:".68rem",color:"#6e7681"}}>{d.product}</div></div>
                    <div style={{display:"flex",gap:6,alignItems:"center"}}><Pill label={d.stage} color={STAGE_CLR[d.stage]}/><span style={{fontWeight:700,color:"#3fb950",fontSize:".8rem"}}>{fmt(d.value)}</span></div>
                  </div>
                ))}
              </div>
              <div style={{background:"#161b22",border:"1px solid #21262d",borderRadius:10,padding:16}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <div style={S.sec}>Project Profit Snapshot</div>
                  <button style={S.btn("acc")} onClick={()=>setPage("finance")}>Finance</button>
                </div>
                {projList.slice(0,5).map(d=>{
                  const pp=projProfit(d.id);
                  return(
                    <div key={d.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"1px solid #21262d"}}>
                      <div><div style={{fontWeight:600,color:"#f0f6fc",fontSize:".83rem"}}>{d.client}</div><div style={{fontSize:".68rem",color:"#6e7681"}}>{d.product}</div></div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontWeight:700,color:pp.margin>=20?"#4ade80":"#fbbf24",fontSize:".83rem"}}>{pp.margin}% margin</div>
                        <div style={{fontSize:".67rem",color:"#6e7681"}}>{fmt(pp.profit)} profit</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ══ PIPELINE ═══════════════════════════════════════════════════════ */}
        {page==="pipeline"&&(
          <div className="fi">
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:9,marginBottom:16}}>
              <KPI label="Pipeline"    value={fmtK(deals.filter(d=>d.stage!=="Lost").reduce((s,d)=>s+d.value,0))} color="#388bfd"/>
              <KPI label="Won"         value={fmtK(wonDeals.reduce((s,d)=>s+d.value,0))}         color="#3fb950"/>
              <KPI label="Collected"   value={fmtK(wonDeals.reduce((s,d)=>s+d.amountPaid,0))}    color="#3fb950"/>
              <KPI label="Outstanding" value={fmtK(wonDeals.reduce((s,d)=>s+d.invoiced-d.amountPaid,0))} color="#f85149"/>
            </div>
            <div style={{display:"flex",gap:6,marginBottom:11,flexWrap:"wrap",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                {["All",...DEAL_STAGES].map(s=>(
                  <button key={s} style={{...S.btn("ghost"),borderColor:sfilt===s?STAGE_CLR[s]||"#388bfd":"#30363d",color:sfilt===s?STAGE_CLR[s]||"#f0f6fc":"#6e7681",background:sfilt===s?"#21262d":"transparent",padding:"4px 10px"}} onClick={()=>setSfilt(s)}>{s}</button>
                ))}
                <div style={{width:1,background:"#30363d"}}/>
                {["All",...PAY_STATUS].map(s=>(
                  <button key={s} style={{...S.btn("ghost"),borderColor:pfilt===s&&s!=="All"?PAY_CLR[s]:"#30363d",color:pfilt===s&&s!=="All"?PAY_CLR[s]:"#6e7681",background:pfilt===s?"#21262d":"transparent",padding:"4px 10px"}} onClick={()=>setPfilt(s)}>{s}</button>
                ))}
              </div>
              <div style={{display:"flex",gap:7}}>
                <input style={{...S.inp,width:180}} placeholder="Search…" value={srch} onChange={e=>setSrch(e.target.value)}/>
                <button style={S.btn("pri")} onClick={openAdd}>+ Add Deal</button>
              </div>
            </div>
            <div style={{background:"#161b22",border:"1px solid #21262d",borderRadius:10,overflow:"hidden"}}>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr>{["Client","Product","Value","Stage","Payment","Prob.","Follow-up","Actions"].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
                <tbody>{filtDeals.map(d=>(
                  <tr key={d.id} className="rh" style={{borderBottom:"1px solid #21262d",cursor:"pointer"}} onClick={()=>openEdit(d)}>
                    <td style={S.td}><div style={{fontWeight:600,color:"#f0f6fc"}}>{d.client}</div><div style={{fontSize:".68rem",color:"#6e7681"}}>{d.contact}</div></td>
                    <td style={{...S.td,color:"#8b949e"}}>{d.product}</td>
                    <td style={{...S.td,fontWeight:700,color:"#3fb950"}}>{fmt(d.value)}</td>
                    <td style={S.td}><Pill label={d.stage} color={STAGE_CLR[d.stage]}/></td>
                    <td style={S.td}><Pill label={d.paymentStatus} color={PAY_CLR[d.paymentStatus]}/></td>
                    <td style={S.td}><div style={{display:"flex",alignItems:"center",gap:6}}><Bar pct={d.probability} color="#388bfd" h={4}/><span style={{fontSize:".68rem",color:"#6e7681",minWidth:24}}>{d.probability}%</span></div></td>
                    <td style={{...S.td,color:d.followUp&&d.followUp<today&&d.stage!=="Won"&&d.stage!=="Lost"?"#f85149":"#6e7681"}}>{d.followUp||"—"}</td>
                    <td style={S.td} onClick={e=>e.stopPropagation()}>
                      <div style={{display:"flex",gap:3}}>
                        <select className="bi" value={d.stage} onChange={e=>stageQ(d.id,e.target.value)}>{DEAL_STAGES.map(s=><option key={s}>{s}</option>)}</select>
                        <select className="bi" value={d.paymentStatus} onChange={e=>payQ(d.id,e.target.value)}>{PAY_STATUS.map(s=><option key={s}>{s}</option>)}</select>
                        <button className="bi" style={{color:"#f85149"}} onClick={()=>delDeal(d.id)}>✕</button>
                      </div>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
              {filtDeals.length===0&&<div style={{padding:"24px 0",textAlign:"center",color:"#6e7681",fontSize:".78rem"}}>No deals match filters.</div>}
            </div>
          </div>
        )}

        {/* ══ FINANCE ════════════════════════════════════════════════════════ */}
        {page==="finance"&&(
          <div className="fi">
            {/* Company-wide KPIs */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:9,marginBottom:16}}>
              <KPI label="Total Revenue"   value={fmtK(totRev)}   color="#388bfd"/>
              <KPI label="Total Expenses"  value={fmtK(totExp)}   color="#f85149"/>
              <KPI label="Gross Profit"    value={fmtK(grossPro)} color={grossPro>=0?"#4ade80":"#f85149"}/>
              <KPI label="Gross Margin"    value={grossMar+"%"}   color={grossMar>=20?"#4ade80":"#fbbf24"}/>
              <KPI label="Collected"       value={fmtK(totColl)}  color="#3fb950" sub={`${fmtK(totOut)} outstanding`}/>
            </div>

            {/* Sub-tabs */}
            <div style={{borderBottom:"1px solid #21262d",marginBottom:16,display:"flex"}}>
              {[["overview","Overview"],["expenses","Expenses"],["inflows","Inflows"],["projects","Per Project"]].map(([k,l])=>(
                <button key={k} className={`tb ${finTab===k?"on":""}`} onClick={()=>setFinTab(k)}>{l}</button>
              ))}
            </div>

            {/* OVERVIEW */}
            {finTab==="overview"&&(
              <div>
                <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
                  {MONTHS.map((m,i)=>{const mo=cumul[i];const neg=mo?.net<0;return(
                    <button key={m} onClick={()=>setFinMo(i)} style={{...S.btn("ghost"),borderColor:finMo===i?"#388bfd":neg?"#f8514944":"#30363d",color:finMo===i?"#f0f6fc":neg?"#f85149":"#6e7681",background:finMo===i?"#21262d":"transparent",minWidth:40,flexDirection:"column",display:"flex",alignItems:"center",gap:1,padding:"4px 7px"}}>
                      <span style={{fontSize:".75rem"}}>{m}</span><span style={{fontSize:".56rem",opacity:.7}}>{mo?fmtK(mo.net):""}</span>
                    </button>
                  );})}
                </div>
                <div style={{background:"#161b22",border:"1px solid #21262d",borderRadius:10,overflow:"hidden"}}>
                  <div style={{padding:"10px 16px",borderBottom:"1px solid #21262d"}}><div style={S.sec}>Monthly Cash Flow</div></div>
                  <table style={{width:"100%",borderCollapse:"collapse"}}>
                    <thead><tr>{["Month","Inflows","Expenses","Net","Running Total"].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
                    <tbody>{cumul.map((m,i)=>(
                      <tr key={m.month} style={{background:i%2?"#0d1117":"transparent"}}>
                        <td style={{...S.td,fontWeight:600,color:"#f0f6fc"}}>{m.month}</td>
                        <td style={{...S.td,color:"#3fb950"}}>{fmt(m.inflow)}</td>
                        <td style={{...S.td,color:"#f85149"}}>{fmt(m.outflow)}</td>
                        <td style={{...S.td,fontWeight:700,color:m.net>=0?"#3fb950":"#f85149"}}>{fmt(m.net)}</td>
                        <td style={{...S.td,color:m.cum>=0?"#388bfd":"#f85149"}}>{fmt(m.cum)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            )}

            {/* EXPENSES */}
            {finTab==="expenses"&&(
              <div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                    <select style={{...S.inp,width:"auto"}} value={finMo} onChange={e=>setFinMo(Number(e.target.value))}>
                      {MONTHS.map((m,i)=><option key={m} value={i}>{m}</option>)}
                    </select>
                    <select style={{...S.inp,width:"auto"}} value={finProj} onChange={e=>setFinProj(e.target.value)}>
                      <option value="all">All Projects</option>
                      <option value="company">Company-wide only</option>
                      {projList.map(d=><option key={d.id} value={String(d.id)}>{d.client}</option>)}
                    </select>
                  </div>
                  <button style={S.btn("pri")} onClick={openAddExp}>+ Log Expense</button>
                </div>
                {(()=>{
                  const filtered = exps
                    .filter(e=>e.month===finMo)
                    .filter(e=>finProj==="all"?true:finProj==="company"?e.projectId===null:String(e.projectId)===finProj);
                  const total = filtered.reduce((s,e)=>s+e.amount,0);
                  return(
                    <div style={{background:"#161b22",border:"1px solid #21262d",borderRadius:10,overflow:"hidden"}}>
                      <div style={{padding:"10px 16px",borderBottom:"1px solid #21262d",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <div style={S.sec}>{MONTHS[finMo]} Expenses · {fmt(total)}</div>
                      </div>
                      <table style={{width:"100%",borderCollapse:"collapse"}}>
                        <thead><tr>{["Category","Description","Project","Amount","Receipt",""].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
                        <tbody>{filtered.map(e=>(
                          <tr key={e.id} style={{borderBottom:"1px solid #21262d"}}>
                            <td style={S.td}><span style={{background:"#21262d",padding:"2px 7px",borderRadius:3,fontSize:".67rem",color:"#8b949e"}}>{e.category}</span></td>
                            <td style={{...S.td,color:"#f0f6fc"}}>{e.note}</td>
                            <td style={{...S.td,color:"#6e7681",fontSize:".75rem"}}>{e.projectId?clientName(e.projectId):"Company-wide"}</td>
                            <td style={{...S.td,fontWeight:700,color:"#f85149"}}>{fmt(e.amount)}</td>
                            <td style={S.td}>
                              {e.receipt?<a href={e.receipt} target="_blank" rel="noreferrer" style={{color:"#388bfd",fontSize:".73rem"}}>View receipt</a>:<span style={{color:"#4a5268",fontSize:".72rem"}}>No receipt</span>}
                            </td>
                            <td style={S.td}><div style={{display:"flex",gap:3}}><button className="bi" onClick={()=>openEditExp(e)}>Edit</button><button className="bi" style={{color:"#f85149"}} onClick={()=>delExp(e.id)}>✕</button></div></td>
                          </tr>
                        ))}</tbody>
                      </table>
                      {filtered.length===0&&<div style={{padding:"20px 0",textAlign:"center",color:"#6e7681",fontSize:".78rem"}}>No expenses for this filter.</div>}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* INFLOWS */}
            {finTab==="inflows"&&(
              <div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <select style={{...S.inp,width:"auto"}} value={finMo} onChange={e=>setFinMo(Number(e.target.value))}>
                    {MONTHS.map((m,i)=><option key={m} value={i}>{m}</option>)}
                  </select>
                  <button style={S.btn("pri")} onClick={()=>setInfModal(true)}>+ Log Inflow</button>
                </div>
                <div style={{background:"#161b22",border:"1px solid #21262d",borderRadius:10,overflow:"hidden"}}>
                  <div style={{padding:"10px 16px",borderBottom:"1px solid #21262d"}}>
                    <div style={S.sec}>{MONTHS[finMo]} Inflows · {fmt(infs.filter(i=>i.month===finMo).reduce((s,i)=>s+i.amount,0))}</div>
                  </div>
                  <table style={{width:"100%",borderCollapse:"collapse"}}>
                    <thead><tr>{["Source","Project","Note","Amount",""].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
                    <tbody>{infs.filter(i=>i.month===finMo).map(inf=>(
                      <tr key={inf.id} style={{borderBottom:"1px solid #21262d"}}>
                        <td style={{...S.td,fontWeight:600,color:"#f0f6fc"}}>{inf.source}</td>
                        <td style={{...S.td,color:"#6e7681",fontSize:".75rem"}}>{inf.projectId?clientName(inf.projectId):"—"}</td>
                        <td style={{...S.td,color:"#8b949e"}}>{inf.note}</td>
                        <td style={{...S.td,fontWeight:700,color:"#3fb950"}}>{fmt(inf.amount)}</td>
                        <td style={S.td}><button className="bi" style={{color:"#f85149"}} onClick={()=>delInf(inf.id)}>✕</button></td>
                      </tr>
                    ))}</tbody>
                  </table>
                  {infs.filter(i=>i.month===finMo).length===0&&<div style={{padding:"20px 0",textAlign:"center",color:"#6e7681",fontSize:".78rem"}}>No inflows this month.</div>}
                </div>
                {/* Receivables */}
                <div style={{background:"#161b22",border:"1px solid #21262d",borderRadius:10,overflow:"hidden",marginTop:14}}>
                  <div style={{padding:"10px 16px",borderBottom:"1px solid #21262d"}}><div style={S.sec}>Receivables — Won Deals</div></div>
                  <table style={{width:"100%",borderCollapse:"collapse"}}>
                    <thead><tr>{["Client","Invoiced","Paid","Balance","Status","Due"].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
                    <tbody>{wonDeals.map(d=>{const bal=d.invoiced-d.amountPaid;const od=d.dueDate&&d.dueDate<today&&d.paymentStatus!=="Paid";return(
                      <tr key={d.id} style={{borderBottom:"1px solid #21262d"}}>
                        <td style={{...S.td,fontWeight:600,color:"#f0f6fc"}}>{d.client}<div style={{fontSize:".68rem",color:"#6e7681"}}>{d.product}</div></td>
                        <td style={S.td}>{fmt(d.invoiced)}</td>
                        <td style={{...S.td,color:"#3fb950"}}>{fmt(d.amountPaid)}</td>
                        <td style={{...S.td,fontWeight:700,color:bal>0?"#f85149":"#3fb950"}}>{fmt(bal)}</td>
                        <td style={S.td}><div style={{display:"flex",gap:5,alignItems:"center"}}><Pill label={d.paymentStatus} color={PAY_CLR[d.paymentStatus]}/><select className="bi" value={d.paymentStatus} onChange={e=>payQ(d.id,e.target.value)}>{PAY_STATUS.map(s=><option key={s}>{s}</option>)}</select></div></td>
                        <td style={{...S.td,color:od?"#f85149":"#6e7681",fontSize:".75rem"}}>{od?"⚠ ":""}{d.dueDate||"—"}</td>
                      </tr>);})}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* PER PROJECT */}
            {finTab==="projects"&&(
              <div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12}}>
                  {projList.map(d=>{
                    const pp=projProfit(d.id);
                    const projExpList=exps.filter(e=>e.projectId===d.id);
                    return(
                      <div key={d.id} style={{background:"#161b22",border:"1px solid #21262d",borderRadius:10,padding:16}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                          <div><div style={{fontWeight:700,color:"#f0f6fc"}}>{d.client}</div><div style={{fontSize:".7rem",color:"#6e7681"}}>{d.product}</div></div>
                          <Pill label={d.paymentStatus} color={PAY_CLR[d.paymentStatus]}/>
                        </div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
                          {[["Contract",pp.revenue,"#388bfd"],["Total Cost",pp.expenses,"#f85149"],["Profit",pp.profit,pp.profit>=0?"#4ade80":"#f85149"]].map(([l,v,c])=>(
                            <div key={l} style={{background:"#0d1117",borderRadius:7,padding:"9px 10px"}}>
                              <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:"1rem",color:c}}>{fmt(v)}</div>
                              <div style={{fontSize:".62rem",color:"#6e7681",marginTop:2}}>{l}</div>
                            </div>
                          ))}
                        </div>
                        <div style={{marginBottom:10}}>
                          <div style={{display:"flex",justifyContent:"space-between",fontSize:".7rem",marginBottom:3}}>
                            <span style={{color:"#6e7681"}}>Margin</span>
                            <span style={{color:pp.margin>=20?"#4ade80":"#fbbf24",fontWeight:700}}>{pp.margin}%</span>
                          </div>
                          <Bar pct={Math.max(0,pp.margin)} color={pp.margin>=20?"#4ade80":"#fbbf24"} h={6}/>
                        </div>
                        {projExpList.length>0&&(
                          <div>
                            <div style={S.sec}>Logged Expenses</div>
                            {projExpList.slice(0,3).map(e=>(
                              <div key={e.id} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:"1px solid #21262d",fontSize:".75rem"}}>
                                <span style={{color:"#8b949e"}}>{e.category} — {e.note}</span>
                                <span style={{color:"#f85149",fontWeight:600}}>{fmt(e.amount)}</span>
                              </div>
                            ))}
                            {projExpList.length>3&&<div style={{fontSize:".68rem",color:"#6e7681",marginTop:4}}>+{projExpList.length-3} more…</div>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ PROCUREMENT / SWATCHBOARD ══════════════════════════════════════ */}
        {page==="procurement"&&(
          <div className="fi">
            <div style={{marginBottom:16}}>
              <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.3rem",color:"#f0f6fc"}}>Procurement Swatchboard</div>
              <div style={{fontSize:".73rem",color:"#6e7681",marginTop:2}}>Shared checklist — Design & Ops add items, Procurement fulfills them</div>
            </div>

            {/* Swatch KPIs */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:9,marginBottom:16}}>
              <KPI label="Total Items"    value={swTotals.total}    color="#388bfd"/>
              <KPI label="To Buy"         value={swTotals.toBuy}    color="#f87171"/>
              <KPI label="Ordered"        value={swTotals.ordered}  color="#fbbf24"/>
              <KPI label="Received"       value={swTotals.received} color="#4ade80"/>
              <KPI label="Est. Total Cost" value={fmtK(swTotals.estCost)} color="#ffa657"/>
            </div>

            {/* Filters + Add */}
            <div style={{display:"flex",gap:7,marginBottom:12,flexWrap:"wrap",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                <select style={{...S.inp,width:"auto"}} value={swProjFilt} onChange={e=>setSwProjFilt(e.target.value)}>
                  <option value="all">All Projects</option>
                  {projList.map(d=><option key={d.id} value={String(d.id)}>{d.client}</option>)}
                </select>
                {["All",...SWATCH_STATUS].map(s=>(
                  <button key={s} style={{...S.btn("ghost"),borderColor:swStatFilt===s?SW_CLR[s]||"#388bfd":"#30363d",color:swStatFilt===s?SW_CLR[s]||"#f0f6fc":"#6e7681",background:swStatFilt===s?"#21262d":"transparent",padding:"4px 10px"}} onClick={()=>setSwStatFilt(s)}>{s}</button>
                ))}
                <select style={{...S.inp,width:"auto"}} value={swCatFilt} onChange={e=>setSwCatFilt(e.target.value)}>
                  <option value="All">All Categories</option>
                  {SWATCH_CATS.map(c=><option key={c}>{c}</option>)}
                </select>
              </div>
              <button style={S.btn("teal")} onClick={()=>openAddSwatch()}>+ Add Item</button>
            </div>

            {/* Swatch list */}
            <div style={{background:"#161b22",border:"1px solid #21262d",borderRadius:10,overflow:"hidden"}}>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead>
                  <tr>
                    {["Status","Item","Category","Project","Qty","Supplier","Est. Cost","Added By","Swatch","Notes",""].map(h=>(
                      <th key={h} style={S.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtSwatches.map(sw=>(
                    <tr key={sw.id} className="sw-row" style={{borderBottom:"1px solid #21262d",background:"transparent",transition:"background .1s"}}>
                      <td style={{...S.td,minWidth:120}}>
                        <select
                          value={sw.status}
                          onChange={e=>swStatusQ(sw.id,e.target.value)}
                          style={{background:SW_CLR[sw.status]+"22",border:`1px solid ${SW_CLR[sw.status]}55`,borderRadius:4,color:SW_CLR[sw.status],fontWeight:700,fontSize:".68rem",padding:"3px 7px",cursor:"pointer",outline:"none"}}
                        >
                          {SWATCH_STATUS.map(s=><option key={s} style={{background:"#161b22",color:"#c9d1d9"}}>{s}</option>)}
                        </select>
                      </td>
                      <td style={{...S.td,fontWeight:600,color:sw.status==="Received"?"#6e7681":"#f0f6fc",textDecoration:sw.status==="Received"?"line-through":"none",maxWidth:160}}>{sw.name}</td>
                      <td style={{...S.td,color:"#8b949e"}}><span style={{background:"#21262d",padding:"1px 6px",borderRadius:3,fontSize:".67rem"}}>{sw.category}</span></td>
                      <td style={{...S.td,color:"#6e7681",fontSize:".75rem"}}>{sw.projectId?clientName(sw.projectId):"—"}</td>
                      <td style={{...S.td,color:"#c9d1d9"}}>{sw.qty} {sw.unit}</td>
                      <td style={{...S.td,color:"#8b949e",fontSize:".75rem"}}>{sw.supplier||"—"}</td>
                      <td style={{...S.td,fontWeight:700,color:"#ffa657"}}>{sw.estCost?fmt(sw.estCost):"—"}</td>
                      <td style={S.td}><span style={{fontSize:".68rem",padding:"1px 6px",borderRadius:3,background:sw.addedBy==="Design"?"#818cf822":"#fb923c22",color:sw.addedBy==="Design"?"#818cf8":"#fb923c",border:`1px solid ${sw.addedBy==="Design"?"#818cf844":"#fb923c44"}`}}>{sw.addedBy}</span></td>
                      <td style={S.td}>
                        {sw.swatchLink
                          ? <a href={sw.swatchLink} target="_blank" rel="noreferrer" style={{color:"#388bfd",fontSize:".72rem"}}>View</a>
                          : <span style={{color:"#4a5268",fontSize:".7rem"}}>—</span>
                        }
                      </td>
                      <td style={{...S.td,color:"#6e7681",fontSize:".73rem",maxWidth:150}}>{sw.notes||"—"}</td>
                      <td style={S.td}>
                        <div style={{display:"flex",gap:3}}>
                          <button className="bi" onClick={()=>openEditSwatch(sw)}>Edit</button>
                          <button className="bi" style={{color:"#f85149"}} onClick={()=>delSwatch(sw.id)}>✕</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtSwatches.length===0&&<div style={{padding:"24px 0",textAlign:"center",color:"#6e7681",fontSize:".78rem"}}>No items match filters.</div>}
            </div>

            {/* Per-project swatch summary */}
            <div style={{marginTop:20}}>
              <div style={S.sec}>By Project</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10}}>
                {projList.map(d=>{
                  const ps=swatches.filter(s=>s.projectId===d.id);
                  if(ps.length===0) return null;
                  const toBuy=ps.filter(s=>s.status==="To Buy").length;
                  const ordered=ps.filter(s=>s.status==="Ordered").length;
                  const recv=ps.filter(s=>s.status==="Received").length;
                  const est=ps.reduce((s,sw)=>s+Number(sw.estCost||0),0);
                  return(
                    <div key={d.id} style={{background:"#161b22",border:"1px solid #21262d",borderRadius:9,padding:14}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                        <div><div style={{fontWeight:700,color:"#f0f6fc",fontSize:".88rem"}}>{d.client}</div><div style={{fontSize:".68rem",color:"#6e7681"}}>{d.product}</div></div>
                        <button style={S.btn("teal")} onClick={()=>openAddSwatch(d.id)}>+ Add</button>
                      </div>
                      <div style={{display:"flex",gap:10,marginBottom:8}}>
                        {[[toBuy,"To Buy","#f87171"],[ordered,"Ordered","#fbbf24"],[recv,"Received","#4ade80"]].map(([v,l,c])=>(
                          <div key={l} style={{flex:1,background:"#0d1117",borderRadius:6,padding:"7px 8px",textAlign:"center"}}>
                            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.1rem",color:c}}>{v}</div>
                            <div style={{fontSize:".6rem",color:"#6e7681"}}>{l}</div>
                          </div>
                        ))}
                        <div style={{flex:1,background:"#0d1117",borderRadius:6,padding:"7px 8px",textAlign:"center"}}>
                          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1rem",color:"#ffa657"}}>{fmtK(est)}</div>
                          <div style={{fontSize:".6rem",color:"#6e7681"}}>Est. Cost</div>
                        </div>
                      </div>
                      <Bar pct={ps.length?Math.round(recv/ps.length*100):0} color="#4ade80" h={5}/>
                      <div style={{fontSize:".67rem",color:"#6e7681",marginTop:3}}>{ps.length>0?Math.round(recv/ps.length*100):0}% received</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ══ OPERATIONS ═════════════════════════════════════════════════════ */}
        {page==="ops"&&!selProj&&(
          <div className="fi">
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:9,marginBottom:16}}>
              <KPI label="Active Projects"   value={projList.length}        color="#ffa657"/>
              <KPI label="In Design"         value={dash.designActive}      color="#818cf8"/>
              <KPI label="Avg Completion"    value={projList.length?Math.round(projList.reduce((s,d)=>s+overallProg(projs[d.id]),0)/projList.length)+"%":"0%"} color="#388bfd"/>
              <KPI label="Materials Pending" value={dash.pendingMat}        color="#fbbf24"/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:11}}>
              {projList.map(d=>{
                const p=projs[d.id]; const prog=overallProg(p); const ds=p.design?.status||"Briefing";
                const pp=projProfit(d.id);
                return(
                  <div key={d.id} className="rh" style={S.card} onClick={()=>{setSelProj(d.id);setOpsTab(p.currentStage==="Design"?"design":"progress");}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:7}}>
                      <div><div style={{fontWeight:700,color:"#f0f6fc"}}>{d.client}</div><div style={{fontSize:".7rem",color:"#6e7681",marginTop:1}}>{d.product} · {d.contact}</div></div>
                      <div style={{display:"flex",gap:4,flexWrap:"wrap",justifyContent:"flex-end"}}>
                        <Pill label={d.priority} color={PRI_CLR[d.priority]}/>
                        <Pill label={p.currentStage} color={PROD_CLR[p.currentStage]}/>
                        {p.currentStage==="Design"&&<Pill label={ds} color={DS_CLR[ds]}/>}
                      </div>
                    </div>
                    <div style={{display:"flex",gap:2,marginBottom:6}}>{PROD_STAGES.map((s,i)=>{const done=PROD_STAGES.indexOf(p.currentStage)>i,cur=p.currentStage===s;return <div key={s} style={{flex:1,height:3,borderRadius:2,background:done||cur?PROD_CLR[s]:"#21262d",opacity:cur?.5:1}}/>;})}</div>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:7}}><Bar pct={prog} color={PROD_CLR[p.currentStage]} h={5}/><span style={{fontWeight:700,color:"#ffa657",minWidth:30,fontSize:".82rem"}}>{prog}%</span></div>
                    <div style={{display:"flex",gap:12,fontSize:".72rem",color:"#6e7681"}}>
                      <span style={{color:"#3fb950"}}>{fmt(d.value)}</span>
                      <span>Margin: <strong style={{color:pp.margin>=20?"#4ade80":"#fbbf24"}}>{pp.margin}%</strong></span>
                      <span>Team: {p.team.length}</span>
                      {swatches.filter(s=>s.projectId===d.id&&s.status==="To Buy").length>0&&(
                        <span style={{color:"#f87171"}}>🛒 {swatches.filter(s=>s.projectId===d.id&&s.status==="To Buy").length} to buy</span>
                      )}
                    </div>
                  </div>
                );
              })}
              {projList.length===0&&<div style={{gridColumn:"1/-1",padding:"36px 0",textAlign:"center",color:"#6e7681"}}>No active projects. Mark a deal as Won in Pipeline to create a project.</div>}
            </div>
          </div>
        )}

        {page==="ops"&&selProj&&proj&&projDeal&&(
          <div className="fi">
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:13}}>
              <button style={S.btn("ghost")} onClick={()=>setSelProj(null)}>← Back</button>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,color:"#f0f6fc"}}>{projDeal.client} — {projDeal.product}</div>
                <div style={{fontSize:".7rem",color:"#6e7681"}}>{projDeal.contact} · Del: {proj.stageDates.Delivery?.e||"TBD"} · <span style={{color:PAY_CLR[projDeal.paymentStatus]}}>{projDeal.paymentStatus}</span></div>
              </div>
              <Pill label={projDeal.priority} color={PRI_CLR[projDeal.priority]}/>
              <Pill label={proj.currentStage} color={PROD_CLR[proj.currentStage]}/>
              <span style={{fontWeight:700,color:"#3fb950"}}>{fmt(projDeal.value)}</span>
            </div>
            <div style={{borderBottom:"1px solid #21262d",marginBottom:14,display:"flex"}}>
              {[["design","🎨 Design"],["progress","📊 Progress"],["team","👥 Team"],["materials","📦 Materials"],["swatches","🛒 Swatchboard"],["costs","💰 Costs"]].map(([k,l])=>(
                <button key={k} className={`tb ${opsTab===k?"on":""}`} onClick={()=>setOpsTab(k)}>{l}</button>
              ))}
            </div>

            {/* DESIGN TAB */}
            {opsTab==="design"&&(()=>{
              const d=proj.design||mkDesign();
              const pct=Math.round((Object.fromEntries(DESIGN_STATUSES.map((s,i)=>[s,i]))[d.status]||0)/(DESIGN_STATUSES.length-1)*100);
              return(
                <div>
                  <div style={{background:"#161b22",border:`1px solid ${DS_CLR[d.status]}44`,borderRadius:10,padding:18,marginBottom:12}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                      <div>
                        <div style={{fontSize:".66rem",textTransform:"uppercase",letterSpacing:"1.2px",color:"#6e7681",marginBottom:6}}>Design Status</div>
                        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                          {DESIGN_STATUSES.map(s=>(
                            <button key={s} onClick={()=>{
                              const next={...d,status:s,statusHistory:[...(d.statusHistory||[]),{status:s,date:today,by:"Team"}]};
                              upProj(selProj,p=>({...p,design:next}));
                              if(s==="Done"&&proj.currentStage==="Design") upProj(selProj,p=>({...p,currentStage:"Fabrication",progress:{...p.progress,Design:100}}));
                            }} style={{padding:"4px 11px",border:`1.5px solid ${d.status===s?DS_CLR[s]:"#30363d"}`,borderRadius:20,background:d.status===s?DS_CLR[s]+"22":"transparent",color:d.status===s?DS_CLR[s]:"#6e7681",fontWeight:d.status===s?700:400,cursor:"pointer",fontSize:".75rem"}}>
                              {s}
                            </button>
                          ))}
                        </div>
                      </div>
                      <button style={S.btn("purple")} onClick={openDesignEdit}>✏ Edit</button>
                    </div>
                    <div style={{marginBottom:6}}><div style={{display:"flex",justifyContent:"space-between",fontSize:".68rem",color:"#6e7681",marginBottom:3}}><span>Progress</span><span style={{color:DS_CLR[d.status],fontWeight:700}}>{pct}%</span></div><Bar pct={pct} color={DS_CLR[d.status]} h={6}/></div>
                    {d.status==="Done"&&proj.currentStage==="Design"&&<div style={{background:"#3fb95018",border:"1px solid #3fb95044",borderRadius:5,padding:"6px 10px",fontSize:".75rem",color:"#3fb950",marginTop:7}}>✓ Design Done — will advance to Fabrication</div>}
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
                    <div style={{background:"#161b22",border:"1px solid #21262d",borderRadius:9,padding:16}}>
                      <div style={S.sec}>Designer</div>
                      <div style={{marginBottom:8}}><div style={{fontSize:".66rem",color:"#6e7681",marginBottom:2}}>Assigned</div><div style={{fontWeight:600,color:"#f0f6fc"}}>{d.designer||"—"}</div></div>
                      <div style={{marginBottom:8}}><div style={{fontSize:".66rem",color:"#6e7681",marginBottom:2}}>Type</div><Pill label={d.designerType==="outsourced"?"Outsourced":"In-house"} color={d.designerType==="outsourced"?"#fbbf24":"#818cf8"}/></div>
                      <div><div style={{fontSize:".66rem",color:"#6e7681",marginBottom:2}}>Due Date</div><div style={{fontSize:".83rem",color:d.dueDate&&d.dueDate<today&&d.status!=="Done"?"#f85149":"#f0f6fc"}}>{d.dueDate||"—"}</div></div>
                    </div>
                    <div style={{background:"#161b22",border:"1px solid #21262d",borderRadius:9,padding:16}}>
                      <div style={S.sec}>Notes</div>
                      <textarea style={{...S.inp,resize:"vertical",fontSize:".78rem"}} rows={4} value={d.notes||""} onChange={e=>upProj(selProj,p=>({...p,design:{...(p.design||mkDesign()),notes:e.target.value}}))} placeholder="Design notes…"/>
                    </div>
                  </div>
                  <div style={{background:"#161b22",border:"1px solid #21262d",borderRadius:9,padding:16,marginBottom:12}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}><div style={S.sec}>Files & Links</div><button style={S.btn("acc")} onClick={()=>setAddDelivM(true)}>+ Add</button></div>
                    {d.link&&<div style={{marginBottom:8,padding:"7px 10px",background:"#0d1117",borderRadius:5,border:"1px solid #21262d"}}><div style={{fontSize:".66rem",color:"#6e7681",marginBottom:2}}>Primary Link</div><a href={d.link} target="_blank" rel="noreferrer" style={{color:"#388bfd",fontSize:".8rem"}}>{d.link}</a></div>}
                    {(d.deliverables||[]).map(dl=>(
                      <div key={dl.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 10px",background:"#0d1117",borderRadius:5,border:"1px solid #21262d",marginBottom:5}}>
                        <div><div style={{fontWeight:600,fontSize:".8rem",color:"#f0f6fc"}}>{dl.label}</div>{dl.url&&<a href={dl.url} target="_blank" rel="noreferrer" style={{color:"#388bfd",fontSize:".7rem"}}>{dl.url}</a>}<div style={{fontSize:".65rem",color:"#6e7681",marginTop:1}}>{dl.addedDate}</div></div>
                        <button className="bi" style={{color:"#f85149"}} onClick={()=>delDeliverable(dl.id)}>✕</button>
                      </div>
                    ))}
                    {!d.link&&(d.deliverables||[]).length===0&&<div style={{fontSize:".76rem",color:"#6e7681"}}>No files yet.</div>}
                  </div>
                  <div style={{background:"#161b22",border:"1px solid #21262d",borderRadius:9,padding:16}}>
                    <div style={S.sec}>Status History</div>
                    {(d.statusHistory||[]).slice().reverse().map((h,i)=>(
                      <div key={i} style={{display:"flex",gap:8,alignItems:"center",padding:"4px 0",borderBottom:"1px solid #21262d"}}>
                        <Pill label={h.status} color={DS_CLR[h.status]||"#6e7681"}/><span style={{fontSize:".72rem",color:"#6e7681"}}>{h.date}</span><span style={{fontSize:".68rem",color:"#4a5268"}}>by {h.by}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* PROGRESS TAB */}
            {opsTab==="progress"&&(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:11}}>
                {PROD_STAGES.map((s,i)=>{
                  const done=PROD_STAGES.indexOf(proj.currentStage)>i,cur=proj.currentStage===s,locked=PROD_STAGES.indexOf(proj.currentStage)<i;
                  const c=PROD_CLR[s],pct=proj.progress[s]||0;
                  return(
                    <div key={s} style={{background:"#161b22",border:`1px solid ${cur?c+"55":"#21262d"}`,borderRadius:9,padding:16}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:9}}>
                        <span style={{fontWeight:700,color:cur?c:done?"#6e7681":"#30363d",fontSize:".86rem"}}>{s}</span>
                        <div style={{display:"flex",gap:6,alignItems:"center"}}>
                          <span style={{fontSize:".68rem",color:done?"#3fb950":cur?c:"#6e7681"}}>{done?"✓ Done":cur?"Active":"Pending"}</span>
                          {cur&&pct===100&&i<3&&<button style={{...S.btn("pri"),padding:"3px 8px",fontSize:".68rem"}} onClick={()=>advStage(selProj,PROD_STAGES[i+1])}>→ Next</button>}
                        </div>
                      </div>
                      <input type="range" min={0} max={100} value={pct} disabled={locked||done} onChange={e=>updProg(selProj,s,e.target.value)} style={{width:"100%",accentColor:c,marginBottom:4}}/>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:".68rem",color:"#6e7681"}}>
                        <span>{proj.stageDates[s]?.s||"—"} → {proj.stageDates[s]?.e||"—"}</span>
                        <span style={{color:c,fontWeight:700}}>{pct}%</span>
                      </div>
                    </div>
                  );
                })}
                <div style={{gridColumn:"1/-1",background:"#161b22",border:"1px solid #21262d",borderRadius:9,padding:16}}>
                  <div style={S.sec}>Notes</div>
                  <textarea style={{...S.inp,resize:"vertical"}} rows={3} value={proj.notes||""} onChange={e=>upProj(selProj,p=>({...p,notes:e.target.value}))}/>
                </div>
              </div>
            )}

            {/* TEAM TAB */}
            {opsTab==="team"&&(
              <div style={{background:"#161b22",border:"1px solid #21262d",borderRadius:9,padding:16}}>
                <div style={S.sec}>Production Team ({proj.team.length})</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:7,marginBottom:16}}>
                  {proj.team.map(m=>(
                    <div key={m} style={{background:"#21262d",border:"1px solid #30363d",borderRadius:7,padding:"6px 11px",display:"flex",alignItems:"center",gap:7}}>
                      <div style={{width:22,height:22,borderRadius:"50%",background:`hsl(${m.charCodeAt(0)*17%360},40%,30%)`,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:".7rem",color:"#f0f6fc"}}>{m[0]}</div>
                      <span style={{fontSize:".78rem"}}>{m}</span>
                      <button style={{background:"none",border:"none",color:"#f85149",cursor:"pointer",fontSize:".7rem"}} onClick={()=>togTeam(selProj,m)}>✕</button>
                    </div>
                  ))}
                  {proj.team.length===0&&<span style={{fontSize:".76rem",color:"#6e7681"}}>No production team assigned.</span>}
                </div>
                <div style={S.sec}>Add / Remove</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:16}}>
                  {PROD_MEMBERS.map(m=>(
                    <button key={m} onClick={()=>togTeam(selProj,m)} style={{...S.btn("ghost"),borderColor:proj.team.includes(m)?"#388bfd":"#30363d",color:proj.team.includes(m)?"#388bfd":"#6e7681",background:proj.team.includes(m)?"#1f2d3d":"transparent",padding:"4px 10px"}}>
                      {proj.team.includes(m)?"✓ ":""}{m}
                    </button>
                  ))}
                </div>
                <div style={S.sec}>Designer</div>
                <div style={{background:"#0d1117",borderRadius:7,padding:"9px 12px",border:"1px solid #21262d",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div><div style={{fontWeight:600,color:"#f0f6fc",fontSize:".85rem"}}>{proj.design?.designer||"Not assigned"}</div><div style={{fontSize:".7rem",color:"#6e7681",marginTop:1}}>{proj.design?.designerType==="outsourced"?"Outsourced":"In-house"}</div></div>
                  <button style={S.btn("purple")} onClick={openDesignEdit}>Change</button>
                </div>
              </div>
            )}

            {/* MATERIALS TAB */}
            {opsTab==="materials"&&(<>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <span style={{fontSize:".78rem",color:"#6e7681"}}>{proj.materials.filter(m=>!m.received).length} pending · {proj.materials.length} total</span>
                <button style={S.btn("pri")} onClick={()=>{setMatForm({name:"",qty:"",unit:"pcs",cost:"",received:false});setEditMat(null);setMatModal(true);}}>+ Add</button>
              </div>
              <div style={{background:"#161b22",border:"1px solid #21262d",borderRadius:9,overflow:"hidden"}}>
                <table style={{width:"100%",borderCollapse:"collapse"}}>
                  <thead><tr>{["","Material","Qty","Unit","Cost","Status",""].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
                  <tbody>{proj.materials.map(m=>(
                    <tr key={m.id} style={{borderBottom:"1px solid #21262d"}}>
                      <td style={{...S.td,width:28}}>
                        <div style={{width:14,height:14,borderRadius:3,border:`2px solid ${m.received?"#3fb950":"#30363d"}`,background:m.received?"#3fb950":"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>togRecv(m.id)}>
                          {m.received&&<span style={{color:"#0d1117",fontSize:".55rem",fontWeight:900}}>✓</span>}
                        </div>
                      </td>
                      <td style={{...S.td,color:m.received?"#6e7681":"#f0f6fc",textDecoration:m.received?"line-through":"none"}}>{m.name}</td>
                      <td style={S.td}>{m.qty}</td>
                      <td style={{...S.td,color:"#8b949e"}}>{m.unit}</td>
                      <td style={{...S.td,fontWeight:700,color:"#fbbf24"}}>{fmt(m.cost)}</td>
                      <td style={S.td}><Pill label={m.received?"Received":"Pending"} color={m.received?"#3fb950":"#f85149"}/></td>
                      <td style={S.td}><div style={{display:"flex",gap:3}}><button className="bi" onClick={()=>{setMatForm({...m});setEditMat(m.id);setMatModal(true);}}>Edit</button><button className="bi" style={{color:"#f85149"}} onClick={()=>delMat(m.id)}>Del</button></div></td>
                    </tr>
                  ))}</tbody>
                </table>
                {proj.materials.length===0&&<div style={{padding:"20px 0",textAlign:"center",color:"#6e7681",fontSize:".76rem"}}>No materials yet.</div>}
              </div>
            </>)}

            {/* SWATCHES TAB (per project) */}
            {opsTab==="swatches"&&(()=>{
              const projSwatches=swatches.filter(s=>s.projectId===selProj);
              return(
                <div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                    <div style={{fontSize:".78rem",color:"#6e7681"}}>{projSwatches.filter(s=>s.status==="To Buy").length} to buy · {projSwatches.length} total</div>
                    <div style={{display:"flex",gap:6}}>
                      <button style={S.btn("purple")} onClick={()=>{setSwForm({...emptySwatch,projectId:selProj,addedBy:"Design",date:today});setEditSw(null);setSwModal(true);}}>+ Design adds</button>
                      <button style={S.btn("teal")}   onClick={()=>{setSwForm({...emptySwatch,projectId:selProj,addedBy:"Ops",date:today});setEditSw(null);setSwModal(true);}}>+ Ops adds</button>
                    </div>
                  </div>
                  <div style={{background:"#161b22",border:"1px solid #21262d",borderRadius:9,overflow:"hidden"}}>
                    <table style={{width:"100%",borderCollapse:"collapse"}}>
                      <thead><tr>{["Status","Item","Category","Qty","Supplier","Est. Cost","Added By","Link","Notes",""].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
                      <tbody>{projSwatches.map(sw=>(
                        <tr key={sw.id} className="sw-row" style={{borderBottom:"1px solid #21262d",background:"transparent"}}>
                          <td style={{...S.td,minWidth:110}}>
                            <select value={sw.status} onChange={e=>swStatusQ(sw.id,e.target.value)} style={{background:SW_CLR[sw.status]+"22",border:`1px solid ${SW_CLR[sw.status]}55`,borderRadius:4,color:SW_CLR[sw.status],fontWeight:700,fontSize:".67rem",padding:"2px 6px",cursor:"pointer",outline:"none"}}>
                              {SWATCH_STATUS.map(s=><option key={s} style={{background:"#161b22",color:"#c9d1d9"}}>{s}</option>)}
                            </select>
                          </td>
                          <td style={{...S.td,fontWeight:600,color:sw.status==="Received"?"#6e7681":"#f0f6fc",textDecoration:sw.status==="Received"?"line-through":"none"}}>{sw.name}</td>
                          <td style={S.td}><span style={{background:"#21262d",padding:"1px 5px",borderRadius:3,fontSize:".65rem",color:"#8b949e"}}>{sw.category}</span></td>
                          <td style={S.td}>{sw.qty} {sw.unit}</td>
                          <td style={{...S.td,fontSize:".73rem",color:"#8b949e"}}>{sw.supplier||"—"}</td>
                          <td style={{...S.td,fontWeight:700,color:"#ffa657"}}>{sw.estCost?fmt(sw.estCost):"—"}</td>
                          <td style={S.td}><span style={{fontSize:".65rem",padding:"1px 5px",borderRadius:3,background:sw.addedBy==="Design"?"#818cf822":"#fb923c22",color:sw.addedBy==="Design"?"#818cf8":"#fb923c"}}>{sw.addedBy}</span></td>
                          <td style={S.td}>{sw.swatchLink?<a href={sw.swatchLink} target="_blank" rel="noreferrer" style={{color:"#388bfd",fontSize:".7rem"}}>View</a>:<span style={{color:"#4a5268",fontSize:".68rem"}}>—</span>}</td>
                          <td style={{...S.td,color:"#6e7681",fontSize:".7rem",maxWidth:130}}>{sw.notes||"—"}</td>
                          <td style={S.td}><div style={{display:"flex",gap:3}}><button className="bi" onClick={()=>openEditSwatch(sw)}>Edit</button><button className="bi" style={{color:"#f85149"}} onClick={()=>delSwatch(sw.id)}>✕</button></div></td>
                        </tr>
                      ))}</tbody>
                    </table>
                    {projSwatches.length===0&&<div style={{padding:"20px 0",textAlign:"center",color:"#6e7681",fontSize:".76rem"}}>No swatch items yet. Design and Ops can both add items.</div>}
                  </div>
                </div>
              );
            })()}

            {/* COSTS TAB */}
            {opsTab==="costs"&&(()=>{
              const pp=projProfit(selProj);
              const projExpList=exps.filter(e=>e.projectId===selProj);
              return(
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  <div style={{background:"#161b22",border:"1px solid #21262d",borderRadius:9,padding:16}}>
                    <div style={S.sec}>Profit Summary</div>
                    {[["Contract Value",pp.revenue,"#388bfd"],["Total Ops Cost",pp.expenses,"#f85149"],["Gross Profit",pp.profit,pp.profit>=0?"#4ade80":"#f85149"]].map(([l,v,c])=>(
                      <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #21262d",fontSize:".83rem"}}>
                        <span style={{color:"#6e7681"}}>{l}</span><span style={{fontWeight:700,color:c}}>{fmt(v)}</span>
                      </div>
                    ))}
                    <div style={{background:"#0d1117",borderRadius:7,padding:12,marginTop:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{fontWeight:700}}>Gross Margin</span>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.3rem",color:pp.margin>=20?"#4ade80":"#fbbf24"}}>{pp.margin}%</div>
                        <div style={{fontSize:".68rem",color:"#6e7681"}}>Collected: {fmt(pp.collected)}</div>
                      </div>
                    </div>
                    <div style={{marginTop:10,border:`1px solid ${PAY_CLR[projDeal.paymentStatus]}44`,borderRadius:6,padding:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div><div style={{fontSize:".64rem",color:"#6e7681",textTransform:"uppercase",letterSpacing:"1px"}}>Payment</div><div style={{fontWeight:700,color:PAY_CLR[projDeal.paymentStatus],marginTop:2}}>{projDeal.paymentStatus}</div></div>
                      <div style={{fontSize:".72rem",color:"#6e7681"}}>Due {projDeal.dueDate||"—"}</div>
                    </div>
                  </div>
                  <div style={{background:"#161b22",border:"1px solid #21262d",borderRadius:9,padding:16}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                      <div style={S.sec}>Logged Expenses</div>
                      <button style={S.btn("pri")} onClick={()=>{setExpForm({...emptyExp,projectId:selProj});setEditExp(null);setExpModal(true);}}>+ Add</button>
                    </div>
                    {projExpList.map(e=>(
                      <div key={e.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"1px solid #21262d"}}>
                        <div>
                          <span style={{background:"#21262d",padding:"1px 6px",borderRadius:3,fontSize:".64rem",color:"#8b949e",marginRight:5}}>{e.category}</span>
                          <span style={{fontSize:".78rem",color:"#f0f6fc"}}>{e.note}</span>
                          {e.receipt&&<a href={e.receipt} target="_blank" rel="noreferrer" style={{marginLeft:6,fontSize:".68rem",color:"#388bfd"}}>receipt</a>}
                        </div>
                        <span style={{fontWeight:700,color:"#f85149",fontSize:".8rem"}}>{fmt(e.amount)}</span>
                      </div>
                    ))}
                    {projExpList.length===0&&<div style={{fontSize:".76rem",color:"#6e7681",padding:"10px 0"}}>No project expenses logged yet.</div>}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* ══ JOB ORDERS ═════════════════════════════════════════════════════ */}
        {page==="joborders"&&(
          <div className="fi">
            {joStep==="select"&&(<>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:16}}>
                <div><div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.25rem",color:"#f0f6fc"}}>Job Order Builder</div><div style={{fontSize:".73rem",color:"#6e7681",marginTop:2}}>Auto-fills from pipeline & operations</div></div>
                <div style={{fontSize:".73rem",color:"#6e7681"}}>{jos.length} JOs in shared storage</div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:13}}>
                <div>
                  <div style={S.sec}>Won Deals</div>
                  {wonDeals.map(d=>{const p=projs[d.id];return(
                    <div key={d.id} className="rh" style={S.card} onClick={()=>{setJoSel(d.id);setJoExtra({address:"",phone:"",priority:d.priority||"Normal",extraNotes:""});setJoStep("review");}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <div><div style={{fontWeight:700,color:"#f0f6fc"}}>{d.client}</div><div style={{fontSize:".7rem",color:"#6e7681",marginTop:2}}>{d.product} · {d.contact}</div></div>
                        <div style={{display:"flex",gap:5,alignItems:"center"}}><Pill label={d.paymentStatus} color={PAY_CLR[d.paymentStatus]}/><Pill label={p?.currentStage||"Design"} color={PROD_CLR[p?.currentStage||"Design"]}/><span style={{fontWeight:700,color:"#3fb950"}}>{fmt(d.value)}</span></div>
                      </div>
                      {p&&<div style={{marginTop:8}}><Bar pct={overallProg(p)} color={PROD_CLR[p.currentStage]} h={4}/></div>}
                    </div>
                  );})}
                  {wonDeals.length===0&&<div style={{padding:"24px 0",textAlign:"center",color:"#6e7681"}}>No Won deals yet.</div>}
                </div>
                <div>
                  <div style={S.sec}>Issued JOs</div>
                  {jos.map((jo,i)=>(
                    <div key={i} className="rh" style={{...S.card,padding:"11px 13px"}} onClick={()=>{setViewJO(jo);setJoStep("preview");}}>
                      <div style={{fontWeight:700,color:"#f0f6fc",fontSize:".84rem"}}>{jo.joNum}</div>
                      <div style={{fontSize:".68rem",color:"#6e7681",marginTop:2}}>{jo.deal?.client} · {jo.deal?.product}</div>
                      <div style={{fontSize:".65rem",color:"#4a5268",marginTop:1}}>{jo.dateIssued}</div>
                    </div>
                  ))}
                  {jos.length===0&&<div style={{fontSize:".76rem",color:"#6e7681",padding:"12px 0"}}>No JOs yet.</div>}
                </div>
              </div>
            </>)}
            {joStep==="review"&&joSel&&(()=>{
              const d=deals.find(x=>x.id===joSel),p=projs[joSel];
              const matT=(p?.materials||[]).reduce((s,m)=>s+m.cost,0);
              const projSw=swatches.filter(s=>s.projectId===joSel);
              return(<>
                <div style={{display:"flex",gap:9,alignItems:"center",marginBottom:16}}>
                  <button style={S.btn("ghost")} onClick={()=>setJoStep("select")}>← Back</button>
                  <div style={{flex:1}}><div style={{fontWeight:700,color:"#f0f6fc"}}>{d?.client} — Review Job Order</div><div style={{fontSize:".7rem",color:"#6e7681"}}>Auto-filled from pipeline & operations</div></div>
                  <button style={S.btn("pri")} onClick={issueJO}>Issue & Save →</button>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:13}}>
                  <div style={{background:"#161b22",border:"1px solid #21262d",borderRadius:9,padding:16}}>
                    <div style={S.sec}>Client & Job</div>
                    <div style={{display:"grid",gap:8}}>
                      {[["Client",d?.client,true],["Contact",d?.contact,true],["Product",d?.product,true],["Value",fmt(d?.value),true],["Payment",d?.paymentStatus,true]].map(([l,v,ro])=>(
                        <div key={l}><label style={S.lbl}>{l}</label><input style={{...S.inp,background:ro?"#0d1117":"#161b22",color:ro?"#6e7681":"#c9d1d9"}} value={v||""} readOnly={ro}/></div>
                      ))}
                      <div><label style={S.lbl}>Address</label><input style={S.inp} placeholder="Site/delivery address" value={joExtra.address} onChange={e=>setJoExtra(x=>({...x,address:e.target.value}))}/></div>
                      <div><label style={S.lbl}>Phone</label><input style={S.inp} value={joExtra.phone} onChange={e=>setJoExtra(x=>({...x,phone:e.target.value}))}/></div>
                      <div><label style={S.lbl}>Notes</label><textarea style={{...S.inp,resize:"vertical"}} rows={2} value={joExtra.extraNotes} onChange={e=>setJoExtra(x=>({...x,extraNotes:e.target.value}))}/></div>
                    </div>
                  </div>
                  <div>
                    <div style={{background:"#161b22",border:"1px solid #21262d",borderRadius:9,padding:16,marginBottom:11}}>
                      <div style={S.sec}>Stages & Design</div>
                      {PROD_STAGES.map((s,i)=>{const done=PROD_STAGES.indexOf(p?.currentStage||"Design")>i,cur=p?.currentStage===s;return(
                        <div key={s} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid #21262d",fontSize:".77rem"}}>
                          <span style={{color:cur?PROD_CLR[s]:done?"#6e7681":"#30363d",fontWeight:cur?700:400}}>{s}{s==="Design"&&p?.design?.status?` — ${p.design.status}`:""}</span>
                          <span style={{color:done?"#3fb950":cur?PROD_CLR[s]:"#6e7681",fontSize:".68rem"}}>{p?.stageDates?.[s]?.s||"—"} → {p?.stageDates?.[s]?.e||"—"}</span>
                        </div>);})}
                    </div>
                    {projSw.length>0&&(
                      <div style={{background:"#161b22",border:"1px solid #21262d",borderRadius:9,padding:16,marginBottom:11}}>
                        <div style={S.sec}>Swatch Items ({projSw.length})</div>
                        {projSw.slice(0,4).map(sw=>(
                          <div key={sw.id} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:"1px solid #21262d",fontSize:".75rem"}}>
                            <span style={{color:"#c9d1d9"}}>{sw.name}</span>
                            <Pill label={sw.status} color={SW_CLR[sw.status]}/>
                          </div>
                        ))}
                        {projSw.length>4&&<div style={{fontSize:".67rem",color:"#6e7681",marginTop:4}}>+{projSw.length-4} more items</div>}
                      </div>
                    )}
                    <div style={{background:"#161b22",border:"1px solid #21262d",borderRadius:9,padding:16}}>
                      <div style={S.sec}>Cost Summary</div>
                      {[["Materials",matT,"#fbbf24"],["Labor",p?.laborCost||0,"#818cf8"],["Overhead",p?.overhead||0,"#60a5fa"]].map(([l,v,c])=>(
                        <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid #21262d",fontSize:".78rem"}}><span style={{color:"#6e7681"}}>{l}</span><span style={{color:c,fontWeight:700}}>{fmt(v)}</span></div>
                      ))}
                      <div style={{display:"flex",justifyContent:"space-between",padding:"7px 0",fontSize:".82rem"}}><span style={{fontWeight:700}}>Total</span><span style={{fontWeight:700,color:"#f85149"}}>{fmt(matT+(p?.laborCost||0)+(p?.overhead||0))}</span></div>
                    </div>
                  </div>
                </div>
              </>);}
            )()}
            {joStep==="preview"&&viewJO&&(<>
              <div className="np" style={{display:"flex",gap:8,marginBottom:16,alignItems:"center"}}>
                <button style={S.btn("ghost")} onClick={()=>setJoStep("select")}>← Back</button>
                <button style={S.btn("acc")} onClick={()=>window.print()}>🖨 Print / PDF</button>
              </div>
              <div style={{background:"#fff",color:"#1c1917",borderRadius:10,overflow:"hidden",maxWidth:760,margin:"0 auto",boxShadow:"0 4px 24px rgba(0,0,0,.2)"}}>
                <div style={{background:"#0d1117",padding:"20px 28px",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div><div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.65rem",color:"#f0f6fc"}}>JOB ORDER</div><div style={{fontSize:".7rem",color:"#6e7681",marginTop:2,letterSpacing:1,textTransform:"uppercase"}}>FabHub · Retail Fabrication</div></div>
                  <div style={{textAlign:"right"}}><div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.15rem",color:"#388bfd"}}>{viewJO.joNum}</div><div style={{fontSize:".7rem",color:"#6e7681",marginTop:3}}>{viewJO.dateIssued}</div></div>
                </div>
                <div style={{height:3,background:"linear-gradient(90deg,#388bfd,#3fb950)"}}/>
                <div style={{padding:"20px 28px",fontFamily:"'Segoe UI',sans-serif",fontSize:".82rem"}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18,marginBottom:16}}>
                    <div>
                      <div style={{fontWeight:700,fontSize:".66rem",textTransform:"uppercase",color:"#6e7681",marginBottom:6,borderLeft:"3px solid #388bfd",paddingLeft:7}}>CLIENT</div>
                      {[["Client",viewJO.deal?.client],["Contact",viewJO.deal?.contact],["Address",viewJO.address||"—"],["Phone",viewJO.phone||"—"]].map(([l,v])=>(
                        <div key={l} style={{marginBottom:5}}><div style={{fontSize:".6rem",textTransform:"uppercase",color:"#6e7681"}}>{l}</div><div style={{fontWeight:500}}>{v}</div></div>
                      ))}
                    </div>
                    <div>
                      <div style={{fontWeight:700,fontSize:".66rem",textTransform:"uppercase",color:"#6e7681",marginBottom:6,borderLeft:"3px solid #3fb950",paddingLeft:7}}>PROJECT</div>
                      {[["Product",viewJO.deal?.product],["Value",fmt(viewJO.deal?.value)],["Payment",viewJO.deal?.paymentStatus],["Delivery",viewJO.project?.stageDates?.Delivery?.e||"—"],["Designer",viewJO.project?.design?.designer||"—"],["Design Status",viewJO.project?.design?.status||"—"]].map(([l,v])=>(
                        <div key={l} style={{marginBottom:5}}><div style={{fontSize:".6rem",textTransform:"uppercase",color:"#6e7681"}}>{l}</div><div style={{fontWeight:500}}>{v}</div></div>
                      ))}
                    </div>
                  </div>
                  <div style={{marginBottom:14}}>
                    <div style={{fontWeight:700,fontSize:".66rem",textTransform:"uppercase",color:"#6e7681",marginBottom:5,borderLeft:"3px solid #fbbf24",paddingLeft:7}}>STAGES</div>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:".75rem"}}>
                      <thead><tr style={{background:"#f5f5f5"}}>{["Stage","Start","End","Team","Status"].map(h=><th key={h} style={{padding:"5px 8px",textAlign:"left",fontWeight:600,fontSize:".62rem",textTransform:"uppercase",color:"#6e7681"}}>{h}</th>)}</tr></thead>
                      <tbody>{PROD_STAGES.map((s,i)=>{const p=viewJO.project;const done=PROD_STAGES.indexOf(p?.currentStage||"Design")>i,cur=p?.currentStage===s;return(
                        <tr key={s} style={{borderBottom:"1px solid #f0f0f0"}}>
                          <td style={{padding:"5px 8px",fontWeight:600,color:cur?"#f97316":done?"#6e7681":"#1c1917"}}>{s}{s==="Design"&&p?.design?.status?` (${p.design.status})`:""}</td>
                          <td style={{padding:"5px 8px",color:"#6e7681"}}>{p?.stageDates?.[s]?.s||"—"}</td>
                          <td style={{padding:"5px 8px",color:"#6e7681"}}>{p?.stageDates?.[s]?.e||"—"}</td>
                          <td style={{padding:"5px 8px",fontSize:".72rem"}}>{s==="Design"?p?.design?.designer||"TBD":cur||done?(p?.team||[]).join(", ")||"TBD":"TBD"}</td>
                          <td style={{padding:"5px 8px",fontWeight:700,color:done?"#22c55e":cur?"#f97316":"#9ca3af"}}>{done?"Complete":cur?"In Progress":"Pending"}</td>
                        </tr>);})}
                      </tbody>
                    </table>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
                    <div>
                      <div style={{fontWeight:700,fontSize:".66rem",textTransform:"uppercase",color:"#6e7681",marginBottom:5,borderLeft:"3px solid #f85149",paddingLeft:7}}>MATERIALS</div>
                      <table style={{width:"100%",borderCollapse:"collapse",fontSize:".72rem"}}>
                        <thead><tr style={{background:"#f5f5f5"}}>{["Item","Qty","Cost","Rcvd"].map(h=><th key={h} style={{padding:"4px 6px",textAlign:"left",fontWeight:600,fontSize:".6rem",color:"#6e7681",textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
                        <tbody>{(viewJO.project?.materials||[]).map((m,i)=>(
                          <tr key={i} style={{borderBottom:"1px solid #f5f5f5"}}><td style={{padding:"4px 6px"}}>{m.name}</td><td style={{padding:"4px 6px"}}>{m.qty} {m.unit}</td><td style={{padding:"4px 6px",fontWeight:600}}>{fmt(m.cost)}</td><td style={{padding:"4px 6px",color:m.received?"#22c55e":"#ef4444",fontWeight:700}}>{m.received?"Y":"N"}</td></tr>
                        ))}</tbody>
                      </table>
                    </div>
                    <div>
                      <div style={{fontWeight:700,fontSize:".66rem",textTransform:"uppercase",color:"#6e7681",marginBottom:5,borderLeft:"3px solid #818cf8",paddingLeft:7}}>COSTS</div>
                      {[["Materials",viewJO.matTotal],["Labor",viewJO.project?.laborCost||0],["Overhead",viewJO.project?.overhead||0],["TOTAL",viewJO.totalCost]].map(([l,v],i)=>(
                        <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"3px 0",borderBottom:"1px solid #f5f5f5",fontSize:".77rem",fontWeight:i===3?700:400}}><span style={{color:i===3?"#1c1917":"#6e7681"}}>{l}</span><span style={{color:i===3?"#ef4444":"#1c1917"}}>{fmt(v)}</span></div>
                      ))}
                      {viewJO.extraNotes&&<div style={{marginTop:8,padding:8,background:"#faf9f6",borderRadius:5,fontSize:".7rem",color:"#6e7681",fontStyle:"italic"}}>{viewJO.extraNotes}</div>}
                    </div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,borderTop:"1px solid #e7e5e4",paddingTop:16}}>
                    {["Prepared by (Sales)","Approved by (Manager)","Received by (Production)"].map(l=>(
                      <div key={l} style={{textAlign:"center"}}><div style={{height:1,background:"#1c1917",marginBottom:5,marginTop:30}}/><div style={{fontSize:".63rem",color:"#6e7681"}}>{l}</div></div>
                    ))}
                  </div>
                </div>
              </div>
            </>)}
          </div>
        )}
      </div>

      {/* ══ MODALS ══════════════════════════════════════════════════════════ */}

      {/* Deal */}
      {dealModal&&(
        <div style={S.modal} onClick={()=>setDealModal(false)}>
          <div style={S.mbox} onClick={e=>e.stopPropagation()}>
            <div style={{fontWeight:700,fontSize:".95rem",color:"#f0f6fc",marginBottom:16}}>{editDeal?"Edit Deal":"Add New Deal"}</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              {[{l:"Client Name *",k:"client",t:"text",full:true},{l:"Contact Person",k:"contact",t:"text"},{l:"Deal Value (₱) *",k:"value",t:"number"},{l:"Follow-up Date",k:"followUp",t:"date"},{l:"Probability (%)",k:"probability",t:"number"}].map(f=>(
                <div key={f.k} style={f.full?{gridColumn:"1/-1"}:{}}><label style={S.lbl}>{f.l}</label><input style={S.inp} type={f.t} value={dealForm[f.k]||""} onChange={e=>setDealForm(p=>({...p,[f.k]:e.target.value}))} min={0} max={f.k==="probability"?100:undefined}/></div>
              ))}
              <div><label style={S.lbl}>Product</label><select style={S.inp} value={dealForm.product} onChange={e=>setDealForm(p=>({...p,product:e.target.value}))}>{PRODUCT_TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
              <div><label style={S.lbl}>Stage</label><select style={S.inp} value={dealForm.stage} onChange={e=>setDealForm(p=>({...p,stage:e.target.value,probability:e.target.value==="Won"?100:e.target.value==="Lost"?0:p.probability}))}>{DEAL_STAGES.map(s=><option key={s}>{s}</option>)}</select></div>
              <div><label style={S.lbl}>Priority</label><select style={S.inp} value={dealForm.priority} onChange={e=>setDealForm(p=>({...p,priority:e.target.value}))}>{PRIORITIES.map(p=><option key={p}>{p}</option>)}</select></div>
              {dealForm.stage==="Won"&&(<>
                <div><label style={S.lbl}>Invoice (₱)</label><input style={S.inp} type="number" value={dealForm.invoiced||""} onChange={e=>setDealForm(p=>({...p,invoiced:e.target.value}))}/></div>
                <div><label style={S.lbl}>Amount Paid (₱)</label><input style={S.inp} type="number" value={dealForm.amountPaid||""} onChange={e=>setDealForm(p=>({...p,amountPaid:e.target.value}))}/></div>
                <div><label style={S.lbl}>Payment Status</label><select style={S.inp} value={dealForm.paymentStatus} onChange={e=>setDealForm(p=>({...p,paymentStatus:e.target.value}))}>{PAY_STATUS.map(s=><option key={s}>{s}</option>)}</select></div>
                <div><label style={S.lbl}>Due Date</label><input style={S.inp} type="date" value={dealForm.dueDate||""} onChange={e=>setDealForm(p=>({...p,dueDate:e.target.value}))}/></div>
              </>)}
              <div style={{gridColumn:"1/-1"}}><label style={S.lbl}>Notes</label><textarea style={{...S.inp,resize:"vertical"}} rows={2} value={dealForm.notes||""} onChange={e=>setDealForm(p=>({...p,notes:e.target.value}))}/></div>
            </div>
            <div style={{display:"flex",gap:7,marginTop:16}}><button style={S.btn("pri")} onClick={saveDeal}>{editDeal?"Save":"Add Deal"}</button><button style={S.btn("ghost")} onClick={()=>setDealModal(false)}>Cancel</button></div>
          </div>
        </div>
      )}

      {/* Expense */}
      {expModal&&(
        <div style={S.modal} onClick={()=>setExpModal(false)}>
          <div style={{...S.mbox,maxWidth:500}} onClick={e=>e.stopPropagation()}>
            <div style={{fontWeight:700,color:"#f0f6fc",marginBottom:14}}>{editExp?"Edit Expense":"Log Expense"}</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div><label style={S.lbl}>Month</label><select style={S.inp} value={expForm.month} onChange={e=>setExpForm(p=>({...p,month:Number(e.target.value)}))}>{MONTHS.map((m,i)=><option key={m} value={i}>{m}</option>)}</select></div>
              <div><label style={S.lbl}>Category</label><select style={S.inp} value={expForm.category} onChange={e=>setExpForm(p=>({...p,category:e.target.value}))}>{EXP_CATS.map(c=><option key={c}>{c}</option>)}</select></div>
              <div style={{gridColumn:"1/-1"}}><label style={S.lbl}>Amount (₱)</label><input style={S.inp} type="number" value={expForm.amount} onChange={e=>setExpForm(p=>({...p,amount:e.target.value}))}/></div>
              <div style={{gridColumn:"1/-1"}}><label style={S.lbl}>Description</label><input style={S.inp} value={expForm.note} placeholder="What was this expense for?" onChange={e=>setExpForm(p=>({...p,note:e.target.value}))}/></div>
              <div style={{gridColumn:"1/-1"}}>
                <label style={S.lbl}>Link to Project (optional)</label>
                <select style={S.inp} value={expForm.projectId===null?"company":String(expForm.projectId)} onChange={e=>setExpForm(p=>({...p,projectId:e.target.value==="company"?null:Number(e.target.value)}))}>
                  <option value="company">Company-wide (no project)</option>
                  {projList.map(d=><option key={d.id} value={String(d.id)}>{d.client} — {d.product}</option>)}
                </select>
              </div>
              <div style={{gridColumn:"1/-1"}}>
                <label style={S.lbl}>Receipt / Invoice Link (Google Drive, email, etc.)</label>
                <input style={S.inp} type="url" placeholder="https://drive.google.com/… or leave blank" value={expForm.receipt||""} onChange={e=>setExpForm(p=>({...p,receipt:e.target.value}))}/>
              </div>
            </div>
            <div style={{display:"flex",gap:7,marginTop:14}}><button style={S.btn("pri")} onClick={saveExp}>{editExp?"Save":"Add Expense"}</button><button style={S.btn("ghost")} onClick={()=>setExpModal(false)}>Cancel</button></div>
          </div>
        </div>
      )}

      {/* Inflow */}
      {infModal&&(
        <div style={S.modal} onClick={()=>setInfModal(false)}>
          <div style={{...S.mbox,maxWidth:440}} onClick={e=>e.stopPropagation()}>
            <div style={{fontWeight:700,color:"#f0f6fc",marginBottom:14}}>Log Inflow / Payment Received</div>
            <div style={{display:"grid",gap:10}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div><label style={S.lbl}>Month</label><select style={S.inp} value={infForm.month} onChange={e=>setInfForm(p=>({...p,month:Number(e.target.value)}))}>{MONTHS.map((m,i)=><option key={m} value={i}>{m}</option>)}</select></div>
                <div><label style={S.lbl}>Amount (₱)</label><input style={S.inp} type="number" value={infForm.amount} onChange={e=>setInfForm(p=>({...p,amount:e.target.value}))}/></div>
              </div>
              <div><label style={S.lbl}>Source / Client</label><input style={S.inp} value={infForm.source} placeholder="e.g. Metro Retail Co." onChange={e=>setInfForm(p=>({...p,source:e.target.value}))}/></div>
              <div><label style={S.lbl}>Link to Project</label>
                <select style={S.inp} value={infForm.projectId===null?"none":String(infForm.projectId)} onChange={e=>setInfForm(p=>({...p,projectId:e.target.value==="none"?null:Number(e.target.value)}))}>
                  <option value="none">— Not linked —</option>
                  {projList.map(d=><option key={d.id} value={String(d.id)}>{d.client}</option>)}
                </select>
              </div>
              <div><label style={S.lbl}>Note</label><input style={S.inp} value={infForm.note} placeholder="e.g. Full payment, 50% deposit" onChange={e=>setInfForm(p=>({...p,note:e.target.value}))}/></div>
            </div>
            <div style={{display:"flex",gap:7,marginTop:14}}><button style={S.btn("pri")} onClick={saveInf}>Add Inflow</button><button style={S.btn("ghost")} onClick={()=>setInfModal(false)}>Cancel</button></div>
          </div>
        </div>
      )}

      {/* Swatch */}
      {swModal&&(
        <div style={S.modal} onClick={()=>setSwModal(false)}>
          <div style={{...S.mbox,maxWidth:500}} onClick={e=>e.stopPropagation()}>
            <div style={{fontWeight:700,color:"#0e9488",marginBottom:14}}>{editSw?"Edit Swatch Item":"Add to Swatchboard"}</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div style={{gridColumn:"1/-1"}}><label style={S.lbl}>Item Name *</label><input style={S.inp} value={swForm.name} placeholder="e.g. Walnut veneer roll, Brushed brass pulls" onChange={e=>setSwForm(p=>({...p,name:e.target.value}))}/></div>
              <div><label style={S.lbl}>Category</label><select style={S.inp} value={swForm.category} onChange={e=>setSwForm(p=>({...p,category:e.target.value}))}>{SWATCH_CATS.map(c=><option key={c}>{c}</option>)}</select></div>
              <div><label style={S.lbl}>Added By</label><select style={S.inp} value={swForm.addedBy} onChange={e=>setSwForm(p=>({...p,addedBy:e.target.value}))}><option>Design</option><option>Ops</option></select></div>
              <div><label style={S.lbl}>Quantity</label><input style={S.inp} type="number" value={swForm.qty} onChange={e=>setSwForm(p=>({...p,qty:e.target.value}))}/></div>
              <div><label style={S.lbl}>Unit</label><select style={S.inp} value={swForm.unit} onChange={e=>setSwForm(p=>({...p,unit:e.target.value}))}>{MAT_UNITS.map(u=><option key={u}>{u}</option>)}</select></div>
              <div><label style={S.lbl}>Supplier</label><input style={S.inp} value={swForm.supplier} placeholder="e.g. Casa Hardware" onChange={e=>setSwForm(p=>({...p,supplier:e.target.value}))}/></div>
              <div><label style={S.lbl}>Est. Cost (₱)</label><input style={S.inp} type="number" value={swForm.estCost} onChange={e=>setSwForm(p=>({...p,estCost:e.target.value}))}/></div>
              <div><label style={S.lbl}>Status</label><select style={S.inp} value={swForm.status} onChange={e=>setSwForm(p=>({...p,status:e.target.value}))}>{SWATCH_STATUS.map(s=><option key={s}>{s}</option>)}</select></div>
              <div style={{gridColumn:"1/-1"}}>
                <label style={S.lbl}>Link to Project</label>
                <select style={S.inp} value={swForm.projectId===null?"none":String(swForm.projectId)} onChange={e=>setSwForm(p=>({...p,projectId:e.target.value==="none"?null:Number(e.target.value)}))}>
                  <option value="none">— Not linked —</option>
                  {projList.map(d=><option key={d.id} value={String(d.id)}>{d.client} — {d.product}</option>)}
                </select>
              </div>
              <div style={{gridColumn:"1/-1"}}><label style={S.lbl}>Swatch / Reference Link (image, catalog, etc.)</label><input style={S.inp} type="url" placeholder="https://… (optional)" value={swForm.swatchLink||""} onChange={e=>setSwForm(p=>({...p,swatchLink:e.target.value}))}/></div>
              <div style={{gridColumn:"1/-1"}}><label style={S.lbl}>Notes</label><textarea style={{...S.inp,resize:"vertical"}} rows={2} value={swForm.notes||""} onChange={e=>setSwForm(p=>({...p,notes:e.target.value}))}/></div>
            </div>
            <div style={{display:"flex",gap:7,marginTop:14}}><button style={S.btn("teal")} onClick={saveSwatch}>{editSw?"Save":"Add Item"}</button><button style={S.btn("ghost")} onClick={()=>setSwModal(false)}>Cancel</button></div>
          </div>
        </div>
      )}

      {/* Design Edit */}
      {designModal&&proj&&(
        <div style={S.modal} onClick={()=>setDesignModal(false)}>
          <div style={S.mbox} onClick={e=>e.stopPropagation()}>
            <div style={{fontWeight:700,color:"#818cf8",marginBottom:14}}>🎨 Edit Design Details</div>
            <div style={{display:"grid",gap:10}}>
              <div><label style={S.lbl}>Status</label><select style={S.inp} value={designForm.status||"Briefing"} onChange={e=>setDesignForm(p=>({...p,status:e.target.value}))}>{DESIGN_STATUSES.map(s=><option key={s}>{s}</option>)}</select></div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div><label style={S.lbl}>Designer</label><select style={S.inp} value={designForm.designer||""} onChange={e=>setDesignForm(p=>({...p,designer:e.target.value}))}><option value="">— Select —</option>{DESIGN_MEMBERS.map(m=><option key={m}>{m}</option>)}</select></div>
                <div><label style={S.lbl}>Type</label><select style={S.inp} value={designForm.designerType||"in-house"} onChange={e=>setDesignForm(p=>({...p,designerType:e.target.value}))}><option value="in-house">In-house</option><option value="outsourced">Outsourced</option></select></div>
              </div>
              <div><label style={S.lbl}>Due Date</label><input style={S.inp} type="date" value={designForm.dueDate||""} onChange={e=>setDesignForm(p=>({...p,dueDate:e.target.value}))}/></div>
              <div><label style={S.lbl}>Primary File / Link</label><input style={S.inp} type="url" placeholder="https://…" value={designForm.link||""} onChange={e=>setDesignForm(p=>({...p,link:e.target.value}))}/></div>
              <div><label style={S.lbl}>Notes</label><textarea style={{...S.inp,resize:"vertical"}} rows={3} value={designForm.notes||""} onChange={e=>setDesignForm(p=>({...p,notes:e.target.value}))}/></div>
            </div>
            {designForm.status==="Done"&&proj.currentStage==="Design"&&<div style={{background:"#3fb95018",border:"1px solid #3fb95044",borderRadius:5,padding:"7px 10px",fontSize:".74rem",color:"#3fb950",marginTop:8}}>✓ Will advance project to Fabrication.</div>}
            <div style={{display:"flex",gap:7,marginTop:14}}><button style={S.btn("purple")} onClick={saveDesign}>Save</button><button style={S.btn("ghost")} onClick={()=>setDesignModal(false)}>Cancel</button></div>
          </div>
        </div>
      )}

      {/* Add Deliverable */}
      {addDelivM&&(
        <div style={S.modal} onClick={()=>setAddDelivM(false)}>
          <div style={{...S.mbox,maxWidth:400}} onClick={e=>e.stopPropagation()}>
            <div style={{fontWeight:700,color:"#f0f6fc",marginBottom:12}}>Add File / Link</div>
            <div style={{display:"grid",gap:10}}>
              <div><label style={S.lbl}>Label</label><input style={S.inp} placeholder="e.g. First Pass V2, Production Plan Final" value={delivForm.label} onChange={e=>setDelivForm(p=>({...p,label:e.target.value}))}/></div>
              <div><label style={S.lbl}>URL</label><input style={S.inp} type="url" placeholder="https://…" value={delivForm.url} onChange={e=>setDelivForm(p=>({...p,url:e.target.value}))}/></div>
            </div>
            <div style={{display:"flex",gap:7,marginTop:12}}><button style={S.btn("acc")} onClick={addDeliverable}>Add</button><button style={S.btn("ghost")} onClick={()=>setAddDelivM(false)}>Cancel</button></div>
          </div>
        </div>
      )}

      {/* Material */}
      {matModal&&(
        <div style={S.modal} onClick={()=>setMatModal(false)}>
          <div style={{...S.mbox,maxWidth:400}} onClick={e=>e.stopPropagation()}>
            <div style={{fontWeight:700,color:"#f0f6fc",marginBottom:12}}>{editMat?"Edit Material":"Add Material"}</div>
            <div style={{display:"grid",gap:10}}>
              <div><label style={S.lbl}>Name</label><input style={S.inp} value={matForm.name} placeholder="e.g. Steel angle bars" onChange={e=>setMatForm(p=>({...p,name:e.target.value}))}/></div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div><label style={S.lbl}>Qty</label><input style={S.inp} type="number" value={matForm.qty} onChange={e=>setMatForm(p=>({...p,qty:e.target.value}))}/></div>
                <div><label style={S.lbl}>Unit</label><select style={S.inp} value={matForm.unit} onChange={e=>setMatForm(p=>({...p,unit:e.target.value}))}>{MAT_UNITS.map(u=><option key={u}>{u}</option>)}</select></div>
              </div>
              <div><label style={S.lbl}>Total Cost (₱)</label><input style={S.inp} type="number" value={matForm.cost} onChange={e=>setMatForm(p=>({...p,cost:e.target.value}))}/></div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:14,height:14,borderRadius:3,border:`2px solid ${matForm.received?"#3fb950":"#30363d"}`,background:matForm.received?"#3fb950":"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setMatForm(p=>({...p,received:!p.received}))}>
                  {matForm.received&&<span style={{color:"#0d1117",fontSize:".55rem",fontWeight:900}}>✓</span>}
                </div>
                <span style={{fontSize:".78rem",color:"#8b949e"}}>Already received</span>
              </div>
            </div>
            <div style={{display:"flex",gap:7,marginTop:12}}><button style={S.btn("pri")} onClick={saveMat}>{editMat?"Save":"Add"}</button><button style={S.btn("ghost")} onClick={()=>setMatModal(false)}>Cancel</button></div>
          </div>
        </div>
      )}

      {/* Reset */}
      {confirmReset&&(
        <div style={S.modal} onClick={()=>setConfirmReset(false)}>
          <div style={{...S.mbox,maxWidth:340}} onClick={e=>e.stopPropagation()}>
            <div style={{fontWeight:700,color:"#f85149",marginBottom:9}}>⚠ Reset All Data</div>
            <div style={{fontSize:".81rem",color:"#8b949e",marginBottom:16}}>Clears all shared data and reloads sample data for all team members. Cannot be undone.</div>
            <div style={{display:"flex",gap:7}}><button style={S.btn("dan")} onClick={resetAll}>Reset Everything</button><button style={S.btn("ghost")} onClick={()=>setConfirmReset(false)}>Cancel</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
