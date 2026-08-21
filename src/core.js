// Pure constants and stateless helpers extracted from App.jsx. Plain data and
// pure functions with no component state, no Supabase, no closures. Kept in one
// module so their inter-references resolve without cross-import churn.
import {today, uid} from './shared';
import {mkDesign, DEFAULT_DEPT_TASKS} from './data/seed';

export const DEAL_STAGES = [
  "01 · BizDev",
  "02 · Engagement",
  "03 · Design & Folder",
  "04 · CE in Progress",
  "05 · For Approval",
  "06 · Kickoff",
  "07 · Briefing",
  "08 · Fabrication",
  "09 · Site & Billing",
  "10 · Installation",
  "11 · Punchlist",
  "12 · Close-Out",
  "14 · Completed",
  "Cancelled",
  "Did Not Win",
];

export const STAGE_ALIASES={
  "bizdev":"01 · BizDev","biz dev":"01 · BizDev","01":"01 · BizDev","1":"01 · BizDev",
  "client engagement":"02 · Engagement","engagement":"02 · Engagement","02":"02 · Engagement","2":"02 · Engagement",
  "design request":"03 · Design & Folder","folder setup":"03 · Design & Folder","03":"03 · Design & Folder","3":"03 · Design & Folder",
  "design & ce in progress":"04 · CE in Progress","ce in progress":"04 · CE in Progress","04":"04 · CE in Progress","4":"04 · CE in Progress",
  "client approval":"05 · For Approval","approval":"05 · For Approval","revision":"05 · For Approval","05":"05 · For Approval","5":"05 · For Approval",
  "project kickoff":"06 · Kickoff","kickoff":"06 · Kickoff","awarded":"06 · Kickoff","06":"06 · Kickoff","6":"06 · Kickoff",
  "budget & briefing":"07 · Briefing","briefing":"07 · Briefing","07":"07 · Briefing","7":"07 · Briefing",
  "fabrication":"08 · Fabrication","construction":"08 · Fabrication","fabrication / construction":"08 · Fabrication","08":"08 · Fabrication","8":"08 · Fabrication",
  "site visit":"09 · Site & Billing","progress billing":"09 · Site & Billing","09":"09 · Site & Billing","9":"09 · Site & Billing",
  "installation":"10 · Installation","10":"10 · Installation",
  "punchlist":"11 · Punchlist","punch list":"11 · Punchlist","11":"11 · Punchlist",
  "project close-out":"12 · Close-Out","close out":"12 · Close-Out","closeout":"12 · Close-Out","close-out":"12 · Close-Out","12":"12 · Close-Out",
  "completed":"14 · Completed","project completed":"14 · Completed","closed":"14 · Completed","project closed":"14 · Completed","done":"14 · Completed","14":"14 · Completed",
  "cancelled":"Cancelled","canceled":"Cancelled",
};

export const normalizeStage=(s)=>{
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

// Normalized client identity key. Two client names that differ only by
// casing, surrounding/duplicate whitespace, or trailing punctuation
// (e.g. "COLLECTICONS INC" vs "COLLECTICONS INC.") collapse to the same
// key so look-alike names are grouped, counted, and matched as one client.
export const clientKey=(s)=>String(s||"").toLowerCase().replace(/[.,]+/g," ").replace(/\s+/g," ").trim();

export const WON_STAGES    = ["06 · Kickoff","07 · Briefing","08 · Fabrication","09 · Site & Billing","10 · Installation","11 · Punchlist","12 · Close-Out","14 · Completed"];

export const ACTIVE_STAGES = ["01 · BizDev","02 · Engagement","03 · Design & Folder","04 · CE in Progress","05 · For Approval"];

// "Retired" / dead stages — a deal in one of these is out of the running and must
// NOT count toward the active pipeline (counts, values, follow-ups, forecasts).
// Historically each pipeline filter spelled this out as
//   d.stage!=="Cancelled" && d.stage!=="Did Not Win"
// and several spots forgot the "Did Not Win" half, so lost deals kept showing in
// the pipeline totals. Use these helpers instead of re-typing the checks:
//   isLostStage(d.stage)      → true for Cancelled / Did Not Win
//   isActivePipeline(d.stage) → true for a live pipeline deal (not won, not lost)
export const LOST_STAGES   = ["Cancelled","Did Not Win"];
export const isLostStage      = (stage)=>LOST_STAGES.includes(stage);
export const isActivePipeline = (stage)=>!WON_STAGES.includes(stage)&&!isLostStage(stage);

export const PAULO_GATE    = ["05 · For Approval","06 · Kickoff"];

export const CE_TYPES      = ["Fabrication / General","Construction","Retail Fit-Out","Kiosk","Signage","Event / Activation","Repair / Refurbishment","Other"];

export const STAGE_OWNER   = {
  "01 · BizDev":                       "BizDev Director",
  "02 · Engagement":            "Account Executive",
  "03 · Design & Folder":"Account Executive",
  "04 · CE in Progress":      "Design + Cost Estimator",
  "05 · For Approval":   "Account Executive + Paulo",
  "06 · Kickoff":              "Sales + Finance + Ops",
  "07 · Briefing":            "Cost Control + Project Manager",
  "08 · Fabrication":   "Operations + Procurement",
  "09 · Site & Billing":"Project Manager + Finance",
  "10 · Installation":                 "Operations",
  "11 · Punchlist":                    "Project Manager",
  "12 · Close-Out":            "Project Manager + Finance",
};

export const STAGE_DURATION = {
  "04 · CE in Progress":      "Design: 5–15 days · CE: 5–7 days",
  "08 · Fabrication":   "Fab: 45 days · Construction: 45–60 days",
};

export const PROD_STAGES     = ["Design","Fabrication","QC","Delivery"];

export const DESIGN_STATUSES = ["Briefing","On-going","First Pass","Revision","Production Plans","Done"];

export const PRODUCT_TYPES   = ["Custom Shelving","Display Fixtures","Signage","Countertops","Retail Cabinetry","Kiosks","Wall Panels","Millwork","Other"];

export const SALES_TEAM        = ["Paulo Garcia","Paolo Gomez","April Gail De Ello","Jena De Asis","Don Wyn Celmar","Aerwin Del Rosario (CE)","Marian Prile (CE)"];

export const COST_CONTROL_TEAM = ["Aerwin Del Rosario (Finance Manager)","Marian Prile (Procurement Manager)"];

export const OPS_TEAM          = ["Arrius Catubay (Ops Director)","Ryon Santiago (PM)","David Melendez (PM)","Jay Bernardo (PM)","Angelo Nogra (Coordinator)","Arvin Jaca (Coordinator)","Jessie Singun (Coordinator)","Anthony Nogra (Coordinator)","Steve Jazmin (Coordinator)","Andrew Apilado (Coordinator)","Mark Frilles (PM)"];

export const DESIGN_MEMBERS    = ["Gab Florita","Miaa Villoria","Miel Vidallo","Adrian Adriano","Tisha Leyva","Freelancer / Outsourced"];

// The Head Designer leads the design team — keeps Sales Pipeline visibility that
// the rest of the designers don't get, and owns final approvals.
export const HEAD_DESIGNER     = "Gab Florita";
export const isHeadDesigner    = (name)=>!!name && name===HEAD_DESIGNER;

export const ALL_MEMBERS       = [...new Set([...SALES_TEAM,...COST_CONTROL_TEAM,...OPS_TEAM,...DESIGN_MEMBERS])];

export const PROD_MEMBERS      = ALL_MEMBERS; // backward compat

export const MAT_UNITS       = ["pcs","sheets","meters","kg","sets","rolls","liters","sqm"];

export const PO_UNITS        = ["pcs","sheets","meters","sqm","sqft","lnm","kg","sets","rolls","liters","gallons","bags","boxes","pairs","lengths","bundles","cu.m","lots","units"];

export const EXP_CATS        = ["Materials","Labor","Overhead","Utilities","Rent","Transport","Marketing","Salaries","Subcontractor","Reimbursement","Other"];

export const SWATCH_CATS     = ["Fabric","Paint","Hardware","Wood","Metal","Glass","Laminate","Tile","Lighting","Fixture","Trim","Adhesive","Other"];

export const SWATCH_STATUS   = ["To Buy","Ordered","Received","Client Approved","MR Submitted"];

export const PAY_STATUS      = ["Unpaid","Partial","Deposited","Paid"];

// ── Sales commission (v1) ────────────────────────────────────────────────────
// Commission accrues on CASH COLLECTED (deal.amountPaid) — not on award and not
// on invoiced value. A peso is only commissionable once the client has actually
// paid it, so the earned figure moves as payments land in the billing ledger.
// The rate depends on how the client came to the sales team:
//   • Self-sourced (the AE brought the client in)  → 1.5%
//   • Given (client handed to the sales team)      → 0.5%
// Lead origin is declared per-deal on `deal.leadOrigin`. Until that field is set
// (the explicit deal flag ships in a follow-up), it defaults to "Given" — the
// conservative lower rate — so no deal is ever over-credited by omission.
export const LEAD_ORIGINS       = ["Given","Self-sourced"];
export const DEFAULT_LEAD_ORIGIN= "Given";
export const COMMISSION_RATE    = { "Self-sourced":0.015, "Given":0.005 };
export const leadOriginOf       = (deal)=>LEAD_ORIGINS.includes(deal&&deal.leadOrigin)?deal.leadOrigin:DEFAULT_LEAD_ORIGIN;
export const commissionRate     = (deal)=>COMMISSION_RATE[leadOriginOf(deal)];
// Earned so far = rate × cash actually collected; projected = rate × full contract value.
export const commissionEarned   = (deal)=>Math.round((Number(deal&&deal.amountPaid)||0)*commissionRate(deal));
export const commissionProjected= (deal)=>Math.round((Number(deal&&deal.value)||0)*commissionRate(deal));

export const MONTHS          = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export const PRIORITIES      = ["Normal","High","Urgent"];

export const STAGE_CLR = {
  "01 · BizDev":                       "#94a3b8",
  "02 · Engagement":            "#60a5fa",
  "03 · Design & Folder":"#a78bfa",
  "04 · CE in Progress":      "#f59e0b",
  "05 · For Approval":   "#f97316",
  "06 · Kickoff":              "#10b981",
  "07 · Briefing":            "#06b6d4",
  "08 · Fabrication":   "#3b82f6",
  "09 · Site & Billing":"#8b5cf6",
  "10 · Installation":                 "#ec4899",
  "11 · Punchlist":                    "#eab308",
  "12 · Close-Out":            "#059669",
  "Cancelled":                         "#ef4444",
  "Did Not Win":                       "#94a3b8",
};

export const PROD_CLR  = { Design:"#8b5cf6",Fabrication:"#f97316",QC:"#eab308",Delivery:"#10b981" };

export const PAY_CLR   = { Unpaid:"#ef4444",Partial:"#f59e0b","Partially Paid":"#f59e0b",Deposited:"#10b981","Fully Paid":"#059669",Paid:"#059669" };

export const PRI_CLR   = { Normal:"#3b82f6",High:"#f59e0b",Urgent:"#ef4444" };

export const DS_CLR    = { Briefing:"#94a3b8","On-going":"#3b82f6","First Pass":"#8b5cf6",Revision:"#f97316","Production Plans":"#eab308",Done:"#10b981" };

export const SW_CLR    = { "To Buy":"#ef4444",Ordered:"#f59e0b",Received:"#10b981","Client Approved":"#059669" };

export const DRF_TYPES = ["Module / Display Fixture","Signage","Retail Fit-Out","Counter / Reception","Kiosk","Wall Panel / Decor","Custom Furniture","Other"];

export const DRF_STATUSES = ["New","Acknowledged","In Progress","For Review","Revision","Approved","Production","Done"];

export const DRF_CLR   = {New:"#94a3b8",Acknowledged:"#3b82f6","In Progress":"#f97316","For Review":"#8b5cf6",Revision:"#ef4444",Approved:"#10b981",Production:"#0ea5e9",Done:"#059669"};

export const emptyDRF  = ()=>({dealId:"",client:"",location:"",designer:"",designDeadline:"",projectTitle:"",type:DRF_TYPES[0],size:"",description:"",accessories:[],refLinks:["","",""],notes:"",approvedLink:"",status:"New",createdBy:""});

export const ROLE_CLR  = { Manager:"#f59e0b",Sales:"#10b981",Finance:"#3b82f6",Accounting:"#6366f1",Procurement:"#06b6d4",QS:"#8b5cf6",Operations:"#f97316",Design:"#ec4899",ProjectMover:"#0ea5e9",Warehouse:"#64748b",SalesOpsAdmin:"#14b8a6",FinanceAssistant:"#1d4ed8",Audit:"#dc2626",HRAdmin:"#7c3aed" };

// Human-readable labels for role codes that aren't self-explanatory when shown
// raw (role codes are used directly in ===/object-key comparisons, so we keep
// them token-safe and map to a friendly label only at display sites).
export const ROLE_LABEL = { SalesOpsAdmin:"Sales & Ops Admin", FinanceAssistant:"Finance Assistant", HRAdmin:"HR & Admin", Audit:"Audit Team" };
export const roleLabel = r => ROLE_LABEL[r] || r;

export const CL_TYPES  = ["Purchase","Supplier Job","Permit","Task","Site Visit","Client Approval","Module","Swatch","Risk Flag"];

export const CL_STATUS = ["To Do","In Progress","Done"];

export const CL_DEPT   = ["Operations","Design","Procurement","Sales","Finance","Management"];

export const TYPE_ICON = { Purchase:"🛒","Supplier Job":"🏭",Permit:"📋",Task:"✅","Site Visit":"📍","Client Approval":"🤝",Module:"📦",Swatch:"🎨","Risk Flag":"⚠️" };

export const TYPE_CLR  = { Purchase:"#f59e0b","Supplier Job":"#f97316",Permit:"#3b82f6",Task:"#8b5cf6","Site Visit":"#10b981","Client Approval":"#ec4899",Module:"#0ea5e9",Swatch:"#d946ef","Risk Flag":"#ef4444" };

export const CS_CLR    = { "To Do":"#94a3b8","In Progress":"#f59e0b",Done:"#10b981" };

export const fmtK  = n => n>=1000000?"₱"+(n/1000000).toFixed(1)+"M":n>=1000?"₱"+(n/1000).toFixed(0)+"k":"₱"+(n||0);

export const fmtPHP= n => "Php "+Number(n||0).toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2});

export const BUSINESS_DAYS_SLA = 5;

export function bizDaysElapsed(startDateStr){
  if(!startDateStr) return 0;
  const start = new Date(startDateStr); const now = new Date();
  let count = 0; const d = new Date(start);
  while(d <= now){ const dow = d.getDay(); if(dow!==0&&dow!==6) count++; d.setDate(d.getDate()+1); }
  return Math.max(0, count - 1);
}

export function bizDaysRemaining(startDateStr, sla=BUSINESS_DAYS_SLA){
  return sla - bizDaysElapsed(startDateStr);
}

export const calcTax = (base, receiptType="OR", withholding=false) => {
  const b   = Number(base)||0;
  const vat = receiptType==="OR" ? b*0.12 : 0;        // 12% VAT on base (OR only)
  const gross = b + vat;                                // total amount billed to client
  const ewt = (receiptType==="OR" && withholding) ? b*0.02 : 0; // EWT only on OR, not AR
  const netReceivable = gross - ewt;                    // what GMD actually receives
  return { base:b, vat, gross, ewt, netReceivable };
};

export const calcInputTax = (gross, vatable=false, ewtRate=0) => {
  const g = Number(gross)||0;
  const net = vatable ? Math.round(g/1.12*100)/100 : g;
  const inputVat = Math.round((g-net)*100)/100;
  const rate = Number(ewtRate)||0;
  const ewtAmount = Math.round(net*rate/100*100)/100;
  const netPayable = Math.round((g-ewtAmount)*100)/100; // cash actually paid to supplier
  return { gross:g, net, inputVat, ewtRate:rate, ewtAmount, netPayable };
};

export const EWT_RATES = [
  {v:0,   l:"None"},
  {v:1,   l:"1% — Goods"},
  {v:2,   l:"2% — Services / Contractors"},
  {v:5,   l:"5% — Rentals / Pros"},
  {v:10,  l:"10% — Professionals"},
  {v:15,  l:"15% — Professionals (high)"},
];

export const todayL= new Date().toLocaleDateString("en-PH",{year:"numeric",month:"long",day:"numeric"});

export const mergeLocalOnly=(serverList,localList)=>{
  const ids=new Set(serverList.map(x=>x.id));
  const localOnly=(localList||[]).filter(x=>x.id&&!ids.has(x.id));
  return localOnly.length?[...serverList,...localOnly]:serverList;
};

export const mergeLocalOnlyObj=(serverObj,localObj)=>({...(localObj||{}),...(serverObj||{})});

export const addDaysISO=(fromISO,days)=>{const b=fromISO?new Date(fromISO+"T00:00:00"):new Date();const d=new Date(b.getTime()+(Number(days)||0)*86400000);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};

export const dueDateFromTerms=(terms,fromISO)=>{const t=String(terms||"").toLowerCase();if(/\b(cod|cash|cwo)\b/.test(t))return addDaysISO(fromISO,0);const m=t.match(/(\d+)/);if(!m)return "";return addDaysISO(fromISO,parseInt(m[1],10));};

// ── Collection clearance model ───────────────────────────────────────────────
// A collection isn't spendable cash until the bank clears it. Cash & confirmed
// transfers clear same-day; cheques take a few banking days. We reuse each
// payment's `valueDate` (the date the bank actually credits) as the canonical
// clearance date; when it isn't set we derive a sensible default from the
// method. Legacy payments with neither method nor valueDate clear on their
// receipt date, preserving existing behaviour.
export const PAYMENT_METHODS=["Cash","Bank Transfer","Cheque","Online","Other"];
export const CHEQUE_CLEAR_DAYS=3; // banking days a cheque takes to clear
// Add N banking days (skip Sat/Sun) to an ISO date string.
export const addBankingDaysISO=(fromISO,n)=>{
  if(!fromISO) return fromISO;
  let d=new Date(fromISO+"T00:00:00");let added=0;
  while(added<Number(n||0)){d=new Date(d.getTime()+86400000);const wd=d.getDay();if(wd!==0&&wd!==6)added++;}
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
// The date a payment's funds are (or will be) available in the bank.
export const paymentClearDate=(p)=>{
  if(!p) return "";
  if(p.valueDate) return p.valueDate;                 // explicit / manually cleared
  if(p.method==="Cheque") return addBankingDaysISO(p.date,CHEQUE_CLEAR_DAYS);
  return p.date||"";                                  // cash/transfer/online/legacy → same day
};
// Has this payment cleared as of `asOfISO` (default: any date)? Bounced never clears.
export const isPaymentCleared=(p,asOfISO)=>{
  if(!p||p.bounced) return false;
  const cd=paymentClearDate(p);
  if(!cd) return true;                                // no date info → treat as cleared (legacy)
  return !asOfISO||cd<=asOfISO;
};

export const ADDENDUM_STATUSES = ["Discovered","Sales Notified","Client Coordinating","Approved","Billed","Collected","Rejected"];

// A change order either ADDS scope/value to a project or DEDUCTS it (a credit /
// descope). Value is always stored as a positive magnitude; the kind carries the
// sign so nothing downstream has to guess from a bare number.
export const CO_KINDS = ["Additive","Deductive"];
export const coSignedValue = (x) => ((x && x.kind === "Deductive" ? -1 : 1) * Math.abs(Number(x && x.value) || 0));

export const ADDENDUM_STATUS_CLR = {
  "Discovered":"#94a3b8",
  "Sales Notified":"#f59e0b",
  "Client Coordinating":"#3b82f6",
  "Approved":"#10b981",
  "Billed":"#8b5cf6",
  "Collected":"#059669",
  "Rejected":"#ef4444",
};

export const TAT_REFERENCE = {
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

export const DEPT_ORDER = ["Sales","Design","QS","Procurement","Operations","Finance"];

export const HAS_ADDENDA_PAGE = ["Manager","Operations","ProjectMover"];

export const DEPT_CLR   = {Sales:"#10b981",Design:"#8b5cf6",QS:"#f59e0b",Procurement:"#06b6d4",Operations:"#f97316",Finance:"#3b82f6"};

export const ACT_SCORE  = {"Login":1,"New Deal":10,"Deal Updated":3,"Stage Change":5,"Project Awarded":15,"PM Update":8,"Department Done":12,"Blocker Flagged":4,"TAT Set":3,"Project Card Created":5,"Password Changed":1,"Profile Updated":1,"JO Deleted":-2,"AE Update":4};

export const emptyProjectCard=(dealId,dealData)=>({
  id:uid(),
  dealId,
  client:dealData?.client||"",
  ceNo:dealData?.ceNo||"",
  value:dealData?.value||0,
  createdAt:new Date().toISOString(),
  awardDate:dealData?.awardDate||dealData?.dateAcquired||today,
  targetDays:null,           // Set by QS or Operations Director
  targetEndDate:null,        // Calculated: awardDate + targetDays
  tatCategory:"",            // Project type used for reference
  tatSetBy:null,             // Who set the turnaround time
  tatSetAt:null,
  aeAssigned:dealData?.aeAssigned||dealData?.salesOwner||"",
  pm1:dealData?.pm1||dealData?.pmAssigned||"",
  pm2:dealData?.pm2||"",
  pm3:dealData?.pm3||"",
  designer:dealData?.designer||"",
  coordinator:dealData?.coordinator||"",
  manualProgress:dealData?.manualProgress??null,
  departments:Object.fromEntries(DEPT_ORDER.map(dept=>([dept,{
    done:false,
    doneAt:null,
    doneBy:null,
    tasks:DEFAULT_DEPT_TASKS[dept].map((t)=>({id:uid(),text:t,done:false,doneAt:null,doneBy:null})),
  }]))),
});

export const nextItemCode=(items)=>{
  const nums=items.map(i=>parseInt((i.code||"").replace(/\D/g,""))||0);
  return"INV-"+String((nums.length?Math.max(...nums):0)+1).padStart(3,"0");
};

export const BILLING_STATUSES = ["Draft","Sent to Client","Partially Paid","Fully Paid","Overdue","Cancelled"];

export const BILLING_STATUS_CLR = {
  "Draft":"#94a3b8","Sent to Client":"#3b82f6",
  "Partially Paid":"#f59e0b","Fully Paid":"#059669",
  "Overdue":"#ef4444","Cancelled":"#475569",
};

// ── Receivables & Finance Policy v2.0 ────────────────────────────────────────
// Pricing basis declared on the signed C.E. — policy §2.1 requires this be
// unambiguous before Finance invoices.
export const VAT_TREATMENTS = ["VAT-exclusive","VAT-inclusive"];

// Document-gated billing. A filed report is what unlocks the next invoice:
//   progress      — ≥90% completion (fabrication) → unlocks Progress Billing
//   installation  — filed immediately after install → unlocks Final Billing
//   coc           — Certificate of Completion → unlocks Retention release
export const REPORT_KINDS = [
  {k:"progress",     label:"Progress Report",     icon:"📈", minPct:90},
  {k:"installation", label:"Installation Report", icon:"🔧", minPct:0},
];
export const REPORT_STATUSES = ["Submitted","Sales Review","Verified","Rejected"];
export const REPORT_STATUS_CLR = {Submitted:"#f59e0b","Sales Review":"#3b82f6",Verified:"#059669",Rejected:"#ef4444"};

export const emptyProjectReport=(kind="progress")=>({
  id:"",kind,pctComplete:kind==="progress"?90:100,
  scopeNote:"",photosLink:"",
  status:"Submitted",submittedBy:"",submittedAt:"",
  verifiedBy:"",verifiedAt:"",
});

// The most recent report of a kind on a project (or null).
export const latestReport=(proj,kind)=>{
  const list=(proj?.reports||[]).filter(r=>r.kind===kind);
  if(!list.length) return null;
  return list.slice().sort((a,b)=>String(b.submittedAt||"").localeCompare(String(a.submittedAt||"")))[0];
};
// Is a qualifying report on file? Progress must meet its ≥90% threshold; any
// non-rejected report counts as "on file" for gating installation billing.
export const progressReportOnFile=(proj)=>{
  const r=latestReport(proj,"progress");
  return !!r&&r.status!=="Rejected"&&(Number(r.pctComplete)||0)>=90;
};
export const installationReportOnFile=(proj)=>{
  const r=latestReport(proj,"installation");
  return !!r&&r.status!=="Rejected";
};

// Onboarding gate (§2.1): the facts Finance must have before the downpayment
// invoice. Returns {ready, missing:[labels]} so the UI can show a checklist.
export const dealOnboardingGate=(deal)=>{
  const d=deal||{};
  const terms=d.paymentTerms||{};
  const dp=d.downpaymentPct??terms.dp;
  const checks=[
    {ok:!!d.ceNo,                       label:"Signed C.E. (CE No.)"},
    {ok:!!d.bir2303OnFile||!!d.bir2303Url, label:"BIR Form 2303 on file"},
    {ok:!!(d.paymentTermsText||terms.netDays||terms.notes), label:"Payment terms"},
    {ok:!!d.vatTreatment,               label:"VAT treatment (incl./excl.)"},
    {ok:dp!=null&&dp!==""&&Number(dp)>0, label:"Downpayment %"},
  ];
  const missing=checks.filter(c=>!c.ok).map(c=>c.label);
  return {ready:missing.length===0, missing, checks};
};

// ── Audit engine (Policy §5) ─────────────────────────────────────────────────
export const AUDIT_AREAS = [
  "Warehouse — Inventory / PRF","High-value release","Scrap","Petty cash",
  "Office supplies (HR & Admin)","Revolving funds (Procurement)",
  "Inventory accuracy","Conduct / Policy adherence","Other",
];
export const AUDIT_SEVERITY = ["Low","Medium","High"];
export const AUDIT_SEVERITY_CLR = {Low:"#3b82f6",Medium:"#f59e0b",High:"#ef4444"};
// Open → respondent has 3 days → Responded, or (past due) Referred to HR → Closed.
export const AUDIT_STATUSES = ["Open","Responded","Referred to HR","Closed"];
export const AUDIT_STATUS_CLR = {Open:"#f59e0b",Responded:"#3b82f6","Referred to HR":"#ef4444",Closed:"#059669"};
export const AUDIT_REPLY_DAYS = 3; // §5.2 — respondent has three (3) days to reply

export const emptyFinding=()=>({
  id:"",area:AUDIT_AREAS[0],finding:"",respondent:"",severity:"Medium",
  status:"Open",issuedBy:"",issuedAt:"",replyDue:"",response:"",respondedAt:"",
  hrReferral:false,kpiImpact:"",resolvedAt:"",
});
// A finding is overdue when it's still Open past its 3-day reply window.
export const findingOverdue=(f,todayISO)=>!!f&&f.status==="Open"&&!!f.replyDue&&String(f.replyDue)<String(todayISO||"");

// §7 — recurring audit & compliance calendar. Static schedule the app turns into
// checklist items; no table needed.
export const RECURRING_AUDITS = [
  {area:"Warehouse inventory / PRF / releasing records", freq:"Twice a month", schedule:"1st & 15th",           responsible:"Finance"},
  {area:"High-value material release & returns",         freq:"Every release", schedule:"At each transaction",  responsible:"Finance (witness)"},
  {area:"Scrap sales",                                   freq:"As needed",     schedule:"Scheduled w/ Finance", responsible:"Finance + Warehouse"},
  {area:"Petty cash",                                    freq:"Weekly",        schedule:"Every Friday",         responsible:"Finance"},
  {area:"Office supplies",                               freq:"Monthly",       schedule:"Last week",            responsible:"HR & Admin"},
  {area:"Revolving funds",                               freq:"Monthly",       schedule:"Last week",            responsible:"Procurement"},
  {area:"Inventory accuracy",                            freq:"Monthly",       schedule:"Last week",            responsible:"Warehouse"},
];

// Warehouse witnessing (§5.3): Finance must witness release/return of
// high-value materials and ALL scrap. One rule, used by both the movement form
// and the logStockMove choke point so they never disagree.
export const SCRAP_MOVE_TYPE = "OUT — Scrap (Finance witnessed)";
export const moveNeedsWitness = (moveType,item)=>{
  const t=String(moveType||"");
  const isScrap=/scrap/i.test(t);
  const isOutOrReturn=t.startsWith("OUT")||t.startsWith("RETURN");
  return isScrap || (isOutOrReturn && !!(item&&item.highValue));
};

export const emptyMilestone=()=>({
  id:"",dealId:"",name:"",description:"",
  amount:0,invoiceNo:"",invoiceDate:"",dueDate:"",
  status:"Draft",payments:[],
  createdBy:"",createdDate:"",sentDate:"",
  deductions:[], // [{id,reason,amount,approvedBy,approvedOn,netAmount}]
});

export const MR_STATUSES  = ["Submitted","Reviewed","Converted to PR","Rejected"];

export const BR_STATUSES  = ["Submitted","Under Review","Approved","Released","Rejected"];

export const BR_PURPOSES  = ["Installation","Mobilization","Site Expenses","Equipment Rental","Permits & Fees","Labor Additional","Emergency","Other"];

export const PR_STATUSES  = ["Draft","Pending Approval","PO Issued","Partially Delivered","Delivered","Cancelled"];

export const PROC_STATUSES = ["Draft","Pending Approval","PO Issued","Cancelled"]; // Procurement only; delivery statuses owned by Warehouse

export const PR_CATS      = ["Materials","Hardware","Fixtures","Signage","Electrical","Structural","Finishing","Tools & Equipment","Subcon","Other"];

export const BUDGET_CATS  = ["Materials","Labor","Overhead","Subcon"];

export const BUDGET_CAT_CLR = {Materials:"#3b82f6",Labor:"#10b981",Overhead:"#f59e0b",Subcon:"#8b5cf6"};

export const projectCostBreakdown=(dealId,prs,exps)=>{
  const n=v=>Number(String(v).replace(/,/g,""))||0;
  const committed={Materials:0,Labor:0,Overhead:0,Subcon:0};
  const actual={Materials:0,Labor:0,Overhead:0,Subcon:0};
  const projExps=exps.filter(e=>e.projectId===dealId);
  const expensedPORefs=new Set(projExps.map(e=>e.poRef).filter(Boolean));
  prs.filter(p=>p.projectId===dealId&&p.status!=="Cancelled").forEach(p=>{
    const cost=(n(p.actUnitCost)||n(p.estUnitCost))*n(p.qty);
    const cat=committed[p.budgetCategory]!==undefined?p.budgetCategory:"Materials";
    if(p.status==="Delivered"){
      if(!(p.poNumber&&expensedPORefs.has(p.poNumber))) actual[cat]+=cost;
    } else {
      committed[cat]+=cost;
    }
  });
  projExps.forEach(e=>{
    const cat=e.category==="Labor"?"Labor":e.category==="Subcon"?"Subcon":e.category==="Overhead"?"Overhead":"Materials";
    actual[cat]+=n(e.amount);
  });
  return {committed,actual};
};

export const emptyPR = () => ({
  id:"", projectId:"", projectName:"",
  itemName:"", category:"Materials", description:"",
  qty:1, unit:"pcs", estUnitCost:0, actUnitCost:0,
  supplier:"", poNumber:"", poDate:"",
  qtyDelivered:0, deliveryDate:"", deliveryNote:"",
  status:"Draft", requestedBy:"", approvedBy:"", approvedAt:"",
  budgetCategory:"Materials",  // which budget line this hits
  notes:"", createdDate:"",
});

export const canApprovePO=(role,sessionName,requestedBy,approvers)=>{
  if(role==="Manager") return true;
  if(role!=="Procurement"||!sessionName) return false;
  const list=String(approvers||"").split(",").map(s=>s.trim().toLowerCase()).filter(Boolean);
  if(list.length) return list.includes(sessionName.trim().toLowerCase());
  // P3: only allow approval when requestedBy is a different known person — empty requestedBy doesn't grant approval
  return !!requestedBy&&sessionName.trim().toLowerCase()!==requestedBy.trim().toLowerCase();
};

export const woRetentionAmt=w=>Math.min(Number(w.retentionPct)||0,100)/100*(Number(w.contractAmount)||0);

export const SWO_STATUSES=["Draft","Pending Approval","Issued","In Progress","Completed","Cancelled"];

export const SWO_STATUS_CLR={Draft:"#94a3b8","Pending Approval":"#f59e0b",Issued:"#6366f1","In Progress":"#3b82f6",Completed:"#10b981",Cancelled:"#ef4444"};

export const emptySWO=()=>({subcontractor:"",projectId:"",projectName:"",woNumber:"",woDate:"",specialty:"",status:"Draft",startDate:"",targetEndDate:"",scopeOfWork:"",contractAmount:0,retentionPct:0,paymentStructure:"",paymentTerms:"",notes:"",requestedBy:"",approvedBy:"",acctStatus:"",delivery:null});

export const emptyDelivery=()=>({mode:"",deliveredDate:"",inspectedBy:"",inspectedOn:"",checkQty:false,checkDimensions:false,checkFinish:false,defectNotes:"",inspectionNotes:"",signedOffBy:"",signedOffOn:"",status:"Pending",retentionReleased:false});

export const projDisplayName=d=>d?(d.contact||d.client||"")+(d.ceNo?" · "+d.ceNo:""):"";

export const projOptions=deals=>(deals||[]).map(d=>({value:d.id,label:projDisplayName(d)}));

export const emptyBudget = () => ({
  Materials:0, Labor:0, Overhead:0, Subcon:0,
  notes:"", lockedAt:null,
});

export const ACCT_CLR={"For Accounting":"#f59e0b","Checked":"#3b82f6","Payment Ordered":"#8b5cf6","Paid":"#059669"};

export const emptyDeal={
  // Core
  client:"",product:"",value:"",stage:"01 · BizDev",
  probability:10,contact:"",followUp:"",notes:"",priority:"Normal",
  // Payment
  invoiced:"",amountPaid:"",paymentStatus:"Unpaid",dueDate:"",discount:0,
  progressBilled:0,progressPaid:0,finalBilled:0,finalPaid:0,
  // GMD fields
  ceNo:"",ceType:"Fabrication / General",salesOwner:"",dateAcquired:today,
  assignedAE:"",bizDevSource:"",location:"",
  // File links (Drive + FabHub)
  salesRepoLink:"",proposalFolderLink:"",salesRepoNote:"",
  // Design Request (inline DRF)
  designRequestDate:"",designRequestNote:"",designApprovalDate:"",
  drfReqCreate:false,drfProjectTitle:"",drfSize:"",drfDescription:"",drfAccessories:[],drfRefLinks:["","",""],drfDeadline:"",drfNotes:"",
  // CE/QS Request (inline — auto-creates a CE request for Rodney's queue)
  ceReqCreate:false,ceReqType:"retail",ceReqPriority:"Normal",ceReqDeadline:"",ceReqSubmitDeadline:"",ceReqBudget:"",ceReqMargin:"",ceReqPlansLink:"",ceReqSkpLink:"",ceReqSchedule:"",ceReqNotes:"",
  // Comms
  commsGroup:"",commsGroupLink:"",
  // Addenda
  addenda:[],
  // Parent-child linking
  parentDealId:null,
  // Standby PO / Adhoc umbrella — when true, this parent deal is a client PO
  // (standby fund) rather than earned revenue: its own contract value is held
  // at 0 and its child jobs (drawdowns) carry the value. poBudget is the PO
  // ceiling the drawdowns count down against (remaining = poBudget − Σ children).
  standbyPO:false,poBudget:"",
  // Feedback
  clientFeedback:"",feedbackDate:"",feedbackScore:"",
  // Payment Terms (set at award)
  paymentTerms:null, // {dp:30,progress:40,final:20,retention:10,retentionRelease:"Project Completion",netDays:30,notes:""}
};

export const emptyProject=()=>({
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
  // Receivables-policy reports (Progress ≥90% / Installation) — see REPORT_KINDS.
  // Stored inline in the project blob, like pmUpdates/addenda, so they sync
  // through upProj with no separate synced entity.
  reports:[],
  // Warranty
  warranty:{active:false,type:"30",startDate:"",endDate:"",notes:""},
  // PM Updates
  pmUpdates:[],
  // Addenda
  addenda:[],
});

export const dealCompleteness=(d)=>{
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

export function calcStreak(actLog,userName){
  const days=new Set((actLog||[]).filter(e=>e.by===userName).map(e=>e.date));
  if(!days.size)return 0;
  let streak=0;const d=new Date();
  while(true){const ds=d.toISOString().slice(0,10);if(days.has(ds)){streak++;d.setDate(d.getDate()-1);}else break;}
  return streak;
}

export const PM_UPDATE_TYPES=["General Progress","Materials Needed","Design Request","Blocker"];

export const PM_TYPE_COLOR={"General Progress":"#0ea5e9","Materials Needed":"#f59e0b","Design Request":"#8b5cf6","Blocker":"#ef4444"};

export const PM_TYPE_ICON={"General Progress":"📋","Materials Needed":"📦","Design Request":"🎨","Blocker":"🚨"};

export const WEATHER_OPTS=["☀️ Sunny","⛅ Cloudy","🌧️ Rainy","⛈️ Storm","🥵 Hot"];
