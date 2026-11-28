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
  "did not win":"Did Not Win","didnotwin":"Did Not Win","not won":"Did Not Win","lost":"Did Not Win","deal lost":"Did Not Win","closed lost":"Did Not Win","lost deal":"Did Not Win",
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

// Stronger key for DUPLICATE DETECTION at deal entry. On top of clientKey it
// also flattens hyphens / ampersands / slashes and strips trailing corporate
// suffixes, so look-alikes that clientKey keeps apart still collapse:
//   "Adm Indicia" ≡ "Adm-Indicia",  "Matchanese" ≡ "Matchanese Inc"
// Deliberately more aggressive than clientKey — only used to RAISE a "possible
// duplicate?" confirm prompt (never to auto-block or to group clients in
// reports), so an occasional over-match just asks the user, it doesn't lose data.
const CORP_SUFFIX=/\b(incorporated|corporation|corp|inc|company|co|ltd|limited|enterprises?|ventures?|trading|holdings?|group|philippines|phils?|ph)\b/g;
export const clientMatchKey=(s)=>clientKey(s).replace(/[-&/]+/g," ").replace(CORP_SUFFIX," ").replace(/\s+/g," ").trim();
// Existing client names close to a typed one (Paulo, 2026-11-27: the client field
// is a pick list; Add client must not create "Primer Group" next to "PRIMER GROUP OF
// COMPANIES"). Same match key, one key starting with the other, or the same first
// word of 4+ letters. Mirrors add_client() (migration 20261128030000), which refuses
// these unless the user confirmed a different company. Keep them in sync.
export const clientNearMatches=(typed,names=[])=>{
  const k=clientMatchKey(typed);
  if(!k) return [];
  const first=k.split(" ")[0];
  const seen=new Set(), out=[];
  (names||[]).forEach(n=>{
    const nk=clientMatchKey(n), nm=String(n||"").trim();
    if(!nk||!nm||seen.has(nm.toLowerCase())) return;
    const near=nk===k||(k.length>=4&&nk.startsWith(k+" "))||(nk.length>=4&&k.startsWith(nk+" "))||(first.length>=4&&nk.split(" ")[0]===first);
    if(near){seen.add(nm.toLowerCase());out.push(nm);}
  });
  return out;
};
// Roles that may add a client to the master list (clients_ins policy / add_client).
export const CLIENT_ADD_ROLES=["Manager","Sales","SalesOpsAdmin"];

// Loose title similarity for the same duplicate prompt. True when one title
// contains the other, or the two share ≥50% of their meaningful word tokens —
// so "Zyn Bacolod Event 1" and "Zyn Bacolod Leg 1" register as the same project
// even though neither string contains the other. Digits are kept (they separate
// "Leg 1" from "Leg 2"); a few filler words are dropped.
const TITLE_STOP=new Set(["the","a","an","for","of","and","to","with"]);
export const titleTokens=(s)=>String(s||"").toLowerCase().replace(/[^a-z0-9]+/g," ").split(" ").filter(t=>t&&!TITLE_STOP.has(t));
export const titleSimilar=(a,b)=>{
  const A=titleTokens(a), B=titleTokens(b);
  if(!A.length||!B.length) return false;
  // If both titles carry numbers and share none, they're distinct instances of a
  // series — "Leg 1" vs "Leg 2", "Phase 1" vs "Phase 3" — never the same deal.
  const numsA=A.filter(t=>/^\d+$/.test(t)), numsB=B.filter(t=>/^\d+$/.test(t));
  if(numsA.length&&numsB.length&&!numsA.some(n=>numsB.includes(n))) return false;
  const sa=A.join(" "), sb=B.join(" ");
  if(sa.includes(sb)||sb.includes(sa)) return true;
  const setB=new Set(B), inter=A.filter(t=>setB.has(t)).length, union=new Set([...A,...B]).size;
  return union>0 && inter/union>=0.5;
};

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

// Who may change a deal's stage. Deal editors (deals_upd) may set any stage.
// PMs (ProjectMover / Operations) may move an awarded project only between
// Kickoff and Close-Out; Completed (financial gate) and reopening a Completed
// project stay with the deal editors. Mirrors set_deal_stage() (migration
// 20261027090000_set_deal_stage_rpc.sql) — keep them in sync.
// Project stages as shown on Project Cards (agreed with Paulo 2026-11-11).
// Two flows, picked by the deal's CE type. Each step is one stored stage
// value (or two), so the database keeps its detailed stages (set_deal_stage,
// jo_awarded_stage, PRF and coordinator rules treat 06..12 as one set).
// Construction tracks progress as the PM's % (Progress tab), not as steps.
// Every WON_STAGES value must be in one step of each flow.
export const CONSTRUCTION_CE_TYPES=["Construction","Retail Fit-Out"];
export const isConstructionDeal=d=>CONSTRUCTION_CE_TYPES.includes(d?.ceType);
const _K={key:"kickoff", label:"Kickoff",     target:"06 · Kickoff",     color:"#8b5cf6",stages:["06 · Kickoff"]};
// Teal, not red: Punchlist is a step near the end, not a warning (red is kept for health).
const _P={key:"punch",   label:"Punchlist",   target:"11 · Punchlist",   color:"#0d9488",stages:["11 · Punchlist"]};
const _D={key:"done",    label:"Done",        target:"12 · Close-Out",   color:"#059669",stages:["12 · Close-Out"],
  hint:"All punchlist items completed; ready to receive retention"};
const _C={key:"complete",label:"Completed",   target:"14 · Completed",   color:"#047857",stages:["14 · Completed"]};
export const PROJECT_STAGE_FLOWS={
  fabrication:[_K,
    {key:"briefing",label:"Briefing",    target:"07 · Briefing",    color:"#6366f1",stages:["07 · Briefing"]},
    {key:"fab",     label:"Fabrication", target:"08 · Fabrication", color:"#f59e0b",stages:["08 · Fabrication"]},
    {key:"install", label:"Installation",target:"10 · Installation",color:"#3b82f6",stages:["09 · Site & Billing","10 · Installation"]},
    _P,_D,_C],
  construction:[_K,
    {key:"briefing",label:"Briefing",    target:"07 · Briefing",    color:"#6366f1",stages:["07 · Briefing","08 · Fabrication"]},
    {key:"mob",     label:"Mobilization",target:"09 · Site & Billing",color:"#f97316",stages:["09 · Site & Billing"]},
    {key:"works",   label:"Works",       target:"10 · Installation",color:"#3b82f6",stages:["10 · Installation"],showPct:true,
      hint:"Construction under way: the PM updates the % on the Progress tab"},
    _P,_D,_C],
};
export const projStageFlow=deal=>PROJECT_STAGE_FLOWS[isConstructionDeal(deal)?"construction":"fabrication"];
// Index of the deal's current step in its flow (-1 if its stage isn't a project stage).
export const projStepIndex=deal=>projStageFlow(deal).findIndex(s=>s.stages.includes(deal?.stage));
// "Works · 45%" for a construction project under way; otherwise the step name.
export const projStepLabel=(step,pc)=>step.showPct&&pc?.manualProgress!=null?`${step.label} · ${pc.manualProgress}%`:step.label;
export const projStageLabel=(deal,pc)=>{
  const f=projStageFlow(deal)[projStepIndex(deal)];
  return f?projStepLabel(f,pc):(String(deal?.stage||"").replace(/^\d+ · /,"")||"—");
};
// Punchlist is the sign a project has reached 90 %.
export const PUNCHLIST_MIN_PCT=90;
// Progress steps for non-construction projects (Operations' tracker, Paulo 2026-11-28).
// 90% = installed: punchlist starts and progress billing stops; the last 10% is turnover.
// Mirror of the step check in set_project_progress (migration 20261128060000). Keep in sync.
export const FAB_PROGRESS_STEPS=[10,30,60,80,90,100];
export const PROGRESS_STEP_CLR={10:"#94a3b8",30:"#f59e0b",60:"#3b82f6",80:"#6366f1",90:"#0d9488",100:"#059669"};
export const PROGRESS_STEP_LABELS={
  10: {fab:"Briefing done",                       con:"Briefing done"},
  30: {fab:"Carcass done (carpentry / metal)",    con:"Partitions / framing & MEPF rough-ins done"},
  60: {fab:"Electrical & specialty works done",   con:"Ceiling / wall boarding & flooring done"},
  80: {fab:"Painting / finishing done",           con:"Finishes, millwork & fixtures installed"},
  90: {fab:"Installed · punchlist (last progress billing)", con:"Mall punchlist & full load test (last progress billing)"},
  100:{fab:"Turned over / COC signed",            con:"Turned over / COC signed"},
};
// What a % means: the highest step at or below it ("For briefing" under 10%).
export const progressStepLabel=(pct,construction)=>{
  if(pct==null||pct==="") return "";
  const k=[...FAB_PROGRESS_STEPS].reverse().find(s=>Number(pct)>=s);
  return k?PROGRESS_STEP_LABELS[k][construction?"con":"fab"]:"For briefing";
};

export const STAGE_EDITOR_ROLES = ["Manager","Sales","SalesOpsAdmin","QS"];
export const PM_STAGE_ROLES     = ["ProjectMover","Operations"];
export const PM_SETTABLE_STAGES = WON_STAGES.filter(s=>s!=="14 · Completed");
export const canSetDealStage=(role,from,to)=>{
  if(STAGE_EDITOR_ROLES.includes(role)) return true;
  if(!PM_STAGE_ROLES.includes(role)) return false;
  return PM_SETTABLE_STAGES.includes(from||"")&&(to==null||PM_SETTABLE_STAGES.includes(to));
};

// ── Pipeline temperature (Hot / Almost Awarded / Cold) ───────────────────────
// A MANUAL classification a salesperson sets by dragging a deal between the three
// board columns — it is the sales team's read on how likely/close a deal is,
// independent of the workflow stage (a deal can be "Hot" at stage 02 or "Cold"
// at stage 04). Stored on deal.temperature. When unset (legacy deals, fresh
// imports) we DERIVE a sensible default so the board is never empty:
//   • award requested OR at "05 · For Approval"  → "Almost Awarded"
//   • acquired ≤15 days ago                       → "Hot"
//   • otherwise                                   → "Cold"
// The derived value is only a fallback; once a human drags a card, the explicit
// deal.temperature wins and age no longer moves it.
export const DEAL_TEMPS = ["Hot","Almost Awarded","Cold"];
export const TEMP_META = {
  "Hot":            {icon:"🔥",clr:"#ef4444",bg:"#fef2f2",border:"#fecaca",blurb:"Active & likely to close"},
  "Almost Awarded": {icon:"🏆",clr:"#f59e0b",bg:"#fffbeb",border:"#fde68a",blurb:"In final approval / award pending"},
  "Cold":           {icon:"🧊",clr:"#3b82f6",bg:"#eff6ff",border:"#bfdbfe",blurb:"Gone quiet — needs a nudge"},
};
export const HOT_AGE_DAYS = 15;   // acquired within this window defaults to Hot
export const COLD_STALE_DAYS = 45; // Cold with no activity this long → suggest Did Not Win
export const deriveTemp = (deal, daysSinceAcquired)=>{
  if(DEAL_TEMPS.includes(deal&&deal.temperature)) return deal.temperature;
  if(deal&&(deal.awardRequestData||deal.stage==="05 · For Approval")) return "Almost Awarded";
  return (Number(daysSinceAcquired)||0)<=HOT_AGE_DAYS ? "Hot" : "Cold";
};

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

export const DESIGN_STATUSES = ["Briefing","On-going","First Pass","Revision","Production Plans","Done","Cancelled"];

export const PRODUCT_TYPES   = ["Custom Shelving","Display Fixtures","Signage","Countertops","Retail Cabinetry","Kiosks","Wall Panels","Millwork","Other"];

export const SALES_TEAM        = ["Paulo Garcia","Paolo Gomez","April Gail De Ello","Jena De Asis","Don Wyn Celmar","Jessica Castro","Aerwin Del Rosario (CE)","Marian Prile (CE)"];

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

// Warehouse payment-terms policy for POs. COD = due on receipt; the rest are
// N-day credit terms. dueDateFromTerms() parses these into a payable due date.
export const PO_TERMS        = ["COD","7 Days","15 Days","30 Days","60 Days","90 Days","120 Days"];

// No direct dealing (Paulo, 2026-11-28): the PO now names GMD's client on each
// line, so the supplier agrees not to deal with that client directly. Always
// printed on the PO PDF (appended when a PO's own terms text lacks it, e.g. the
// 909 POs saved with the older default), so it can't be edited off one PO.
export const PO_NO_DIRECT_DEALING = "No direct dealing: the client named on this order is GMD's client. The Supplier shall not, directly or through any related company or person, solicit, quote to, or accept orders from that client for the same or similar goods or work, during this order and for twelve (12) months after its last delivery, without GMD's prior written consent. The client's name and the details of this order are confidential. A breach entitles GMD to recover its lost profit on the business so diverted, without prejudice to its other remedies.";
export const poTermsWithNoDirectDealing=lines=>{
  const ls=(lines||[]).filter(Boolean);
  return ls.some(l=>/^no direct dealing/i.test(l))?ls:[...ls,PO_NO_DIRECT_DEALING];
};

// Standard Terms & Conditions printed on the PO PDF. This is the boilerplate a
// PO carries when the buyer doesn't type custom terms; the per-PO free-text
// `termsText` (captured on the form) overrides this when set.
export const PO_TERMS_DEFAULT = [
  "Prices are inclusive of delivery to the GMD warehouse or project site unless otherwise stated in writing.",
  "Supplier shall deliver the full quantity within the agreed lead time; any delay must be advised in writing before the delivery date.",
  "GMD reserves the right to reject and return items that do not meet the specification, quantity, or quality on this order.",
  "Payment is released only after complete delivery and receipt of a valid Delivery Receipt and Invoice / Official Receipt.",
  "Items are warranted against defects per the supplier's standard warranty; defective items are replaced or repaired at the supplier's cost.",
  "This PO number must be referenced on all invoices, delivery receipts, and correspondence relating to this order.",
  PO_NO_DIRECT_DEALING,
].join("\n");

export const EXP_CATS        = ["Materials","Labor","Overhead","Utilities","Rent","Transport","Marketing","Salaries","Subcontractor","Reimbursement","Other"];

export const SWATCH_CATS     = ["Fabric","Paint","Hardware","Wood","Metal","Glass","Laminate","Tile","Lighting","Fixture","Trim","Adhesive","Other"];

export const SWATCH_STATUS   = ["To Buy","Ordered","Received","Client Approved","MR Submitted"];

export const PAY_STATUS      = ["Unpaid","Partial","Deposited","Paid"];

// ── Sales commission (v1) ────────────────────────────────────────────────────
// Commission accrues on what the client has COLLECTED — not on award and not on
// invoiced value — measured VAT-exclusive (see collectedBase). A peso is only
// commissionable once the client has actually paid it, so the earned figure moves
// as payments land in the billing ledger.
// The rate depends on how the client came to the sales team:
//   • Self-sourced (the AE brought the client in, Manager-approved) → 1.5%
//   • Given (client handed to the sales team)                       → 0.5%
// Lead origin is declared per-deal on `deal.leadOrigin` and defaults to "Given" —
// the conservative lower rate — so no deal is ever over-credited by omission.
export const LEAD_ORIGINS       = ["Given","Self-sourced"];
export const DEFAULT_LEAD_ORIGIN= "Given";
export const COMMISSION_RATE    = { "Self-sourced":0.015, "Given":0.005 };
export const leadOriginOf       = (deal)=>LEAD_ORIGINS.includes(deal&&deal.leadOrigin)?deal.leadOrigin:DEFAULT_LEAD_ORIGIN;
// Lead-origin approval (migration 072): a "Self-sourced" claim triples the rate, so
// it only pays 1.5% once a Manager has approved it. Until then the deal earns the
// Given rate. "Given" never needs approval. The DB trigger enforces who may approve.
export const LEAD_ORIGIN_STATUSES = ["Pending","Approved"];
export const leadOriginPending  = (deal)=>leadOriginOf(deal)==="Self-sourced"&&(deal&&deal.leadOriginStatus)!=="Approved";
export const effectiveLeadOrigin= (deal)=>leadOriginPending(deal)?"Given":leadOriginOf(deal);
export const commissionRate     = (deal)=>COMMISSION_RATE[effectiveLeadOrigin(deal)];
// Commission is VAT-EXCLUSIVE. `value` is already the VAT-ex contract base, but
// collections are CASH (gross incl. 12% VAT, minus the client's 2% EWT). Convert
// cash back to the VAT-ex base it pays off before applying the rate — EWT is a tax
// credit, not a shortfall, so it counts as collected. At full collection Earned
// equals Projected. `collectedCash` defaults to deal.amountPaid; pass the billing
// ledger figure (dealCollected) where it's available.
export const collectedBase = (deal, collectedCash)=>{
  const cash=Number(collectedCash!==undefined?collectedCash:(deal&&deal.amountPaid))||0;
  const t=calcTax(100,(deal&&deal.receiptType)||"OR",!!(deal&&deal.withholding));
  return Math.round(cash*(t.base/t.netReceivable)*100)/100;
};
// Earned so far = rate × VAT-ex collected; projected = rate × VAT-ex contract value.
export const commissionEarned   = (deal, collectedCash)=>Math.round(collectedBase(deal,collectedCash)*commissionRate(deal));
export const commissionProjected= (deal)=>Math.round((Number(deal&&deal.value)||0)*commissionRate(deal));
// Nobody but a Manager records, edits or removes a collection on a deal they own
// as Sales Owner: their commission is a share of those collections. Mirrors
// migration 20261026063330_billing_payments_not_own_deal.sql (is_own_sales_deal_milestone);
// keep them in sync.
const normName=(v)=>String(v||"").trim().toLowerCase();
export const ownsDealCommission=(deal, userName, role)=>
  canonRole(role)!=="Manager"&&!!normName(deal&&deal.salesOwner)&&normName(deal&&deal.salesOwner)===normName(userName);
// Once a deal has collections only a Manager may change its Sales Owner, so the
// commission can't be moved after the fact. Mirrors migration
// 20261026063739_deals_sales_owner_lock.sql (which also counts bounced
// payments; amountPaid here excludes them). Keep them in sync.
// Approving a change order or an addendum deal rolls its value into the contract,
// billing and the Sales Owner's commission (Paulo, 2026-11-19): Managers and
// SalesOpsAdmin only, and SalesOpsAdmin never on a deal (or its parent) where they
// are the Sales Owner. Sales, Ops and PMs still move a CO through the early
// statuses. Mirrors trg_addenda_approval_guard / trg_deals_addendum_approval_guard
// (migration 20261121010000) — keep them in sync.
export const ADDENDUM_APPROVER_ROLES=["Manager","SalesOpsAdmin"];
export const ADDENDUM_APPROVER_MSG="Only a Manager or Sales Ops Admin can approve a change order or addendum (and not on their own deal).";
export const canApproveAddendum=(role, userName, deal, parent)=>{
  const r=canonRole(role);
  if(r==="Manager") return true;
  if(r!=="SalesOpsAdmin") return false;
  return !ownsDealCommission(deal,userName,role)&&!ownsDealCommission(parent,userName,role);
};
// ── Contract price ↔ billing schedule (2026-11-24) ──────────────────────────
// Billing has started once a milestone is past Draft (and not Cancelled) or has
// any payment. From then on only a Manager changes the contract value directly;
// everyone else raises a change order. Mirrors deal_billing_started() /
// trg_deals_contract_value_guard (migration 20261124040000_contract_billing_link.sql).
export const CONTRACT_LOCK_MSG="Billing has started on this project, so only a Manager can change the contract value. Raise a change order (additive or deductive) instead: it adds its own billing line.";
export const dealBillingStarted=(dealId, billings)=>(billings||[]).some(b=>b.dealId===dealId&&b.status!=="Cancelled"&&(b.status!=="Draft"||(b.payments||[]).length>0));
export const contractLocked=(deal, billings, role)=>!!deal&&canonRole(role)!=="Manager"&&dealBillingStarted(deal.id, billings);
// What the non-cancelled milestones add up to vs the contract. gap < 0 = under-billed.
export const billingContractGap=(deal, billings)=>{
  const ms=(billings||[]).filter(b=>b.dealId===deal?.id&&b.status!=="Cancelled");
  const sched=Math.round(ms.reduce((s,b)=>s+(Number(b.amount)||0),0)*100)/100;
  const contract=Math.round((Number(deal?.value)||0)*100)/100;
  return {count:ms.length, sched, contract, gap:Math.round((sched-contract)*100)/100};
};
// A VAT-inclusive amount saved on an AR (non-VAT) milestone of an OR (VAT) deal
// (Hiessence CE-2026-1308 / 1309, 2026-11-28: two ₱417,822 milestones = ₱373,055
// + 12% VAT, typed in as AR). The schedule then reads ~112% of the contract while
// the cash collected is right. Returns the fix when restating those milestones as
// OR at amount ÷ 1.12 brings the schedule to the contract (within 1%), else null.
// Each new base is the one whose OR gross is closest to, and not above, the old
// amount, so what the client paid still covers the invoice.
export const vatIncSavedAsAr=(deal, billings)=>{
  const drt=deal?.receiptType||"OR";
  if(!deal||drt!=="OR") return null;
  const ms=(billings||[]).filter(b=>b.dealId===deal.id&&b.status!=="Cancelled");
  const bad=ms.filter(b=>b.receiptType==="AR");
  if(!bad.length) return null;
  const r2=x=>Math.round(x*100)/100;
  const contract=r2(Number(deal.value)||0);
  if(contract<=0) return null;
  const rows=bad.map(b=>{
    const old=r2(Number(b.amount)||0);
    let to=r2(old/1.12);
    while(to>0&&calcTax(to,"OR",false).gross>old) to=r2(to-0.01);
    return {id:b.id, label:b.invoiceNo||b.name||"", from:old, to};
  });
  const others=ms.filter(b=>!bad.includes(b)).reduce((s,b)=>s+(Number(b.amount)||0),0);
  const before=r2(others+rows.reduce((s,r)=>s+r.from,0));
  const after=r2(others+rows.reduce((s,r)=>s+r.to,0));
  const tol=Math.max(1,contract*0.01);
  if(Math.abs(after-contract)>tol||Math.abs(before-contract)<=tol) return null;
  return {rows, before, after, contract, gap:r2(after-contract)};
};
// Change-order lines (isCoMilestone, below) keep their own amount.
// Scale the Draft, unpaid base milestones so the schedule adds up to the contract.
// Returns null when it can't (billing started, nothing to scale). Last line takes
// the rounding so the total is exact to the centavo.
export const rescaleDraftMilestones=(deal, billings)=>{
  if(!deal||dealBillingStarted(deal.id,billings)) return null;
  const ms=(billings||[]).filter(b=>b.dealId===deal.id&&b.status!=="Cancelled");
  const base=ms.filter(b=>!isCoMilestone(b)&&b.status==="Draft"&&!(b.payments||[]).length);
  const fixed=ms.filter(b=>!base.includes(b)).reduce((s,b)=>s+(Number(b.amount)||0),0);
  const baseTot=base.reduce((s,b)=>s+(Number(b.amount)||0),0);
  const target=Math.round(((Number(deal.value)||0)-fixed)*100)/100;
  if(!base.length||baseTot<=0||target<=0) return null;
  let left=target;
  return base.map((b,i)=>{
    const amt=i===base.length-1?Math.round(left*100)/100:Math.round((Number(b.amount)||0)/baseTot*target*100)/100;
    left-=amt;
    return {id:b.id, from:Number(b.amount)||0, to:amt};
  });
};
export const salesOwnerLocked=(deal, role)=>
  !!deal&&canonRole(role)!=="Manager"&&(Number(deal.amountPaid)||0)!==0;

// ── Commission payouts (what's actually been disbursed to the rep) ───────────
// Earned (above) is what a rep has accrued on cash collected. A PAYOUT is money
// Finance has actually handed over, recorded per rep per period and approved by
// a Manager. Only APPROVED payouts count as "paid"; a "Recorded" one is pending.
//   Paid    = Σ approved payouts for the rep
//   Pending = Σ recorded-but-not-yet-approved payouts
//   Payable = Earned − Paid   (what the company still owes the rep)
export const PAYOUT_STATUS = ["Recorded","Approved","Void"];
export const isPayoutApproved = (p)=>p&&p.status==="Approved";
export const isPayoutPending  = (p)=>p&&p.status==="Recorded";
// Sum helpers over a list of payout rows (optionally pre-filtered to one payee).
export const payoutsPaid    = (list)=>(list||[]).filter(isPayoutApproved).reduce((s,p)=>s+(Number(p.amount)||0),0);
export const payoutsPending = (list)=>(list||[]).filter(isPayoutPending ).reduce((s,p)=>s+(Number(p.amount)||0),0);
// Payable never goes negative — an over-payment reads as fully settled, not owed-back.
export const commissionPayable = (earned,paid)=>Math.max(0,Math.round((Number(earned)||0)-(Number(paid)||0)));

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

export const DS_CLR    = { Briefing:"#94a3b8","On-going":"#3b82f6","First Pass":"#8b5cf6",Revision:"#f97316","Production Plans":"#eab308",Done:"#10b981",Cancelled:"#dc2626" };

// ── Design board: Kanban columns ──────────────────────────────────────────────
// The board shows only the live columns; Done/Cancelled are terminal, so they
// collapse into one "Closed" lane behind a toggle instead of eating two columns.
export const DESIGN_ACTIVE_STATUSES = ["Briefing","On-going","First Pass","Revision","Production Plans"];
export const DESIGN_CLOSED_STATUSES = ["Done","Cancelled"];
export const isDesignClosed = (s) => DESIGN_CLOSED_STATUSES.includes(s);

// Deliverable tags on a design card — lets Sales filter "which of my projects
// involve artwork / signage" and lets the board colour those cards.
export const DESIGN_DELIVERABLES = ["Signage","Artwork","Graphics","Fixtures","Lighting"];
export const ARTWORK_DELIVERABLES = ["Signage","Artwork","Graphics"]; // the "needs creative" subset Sales cares about
export const designNeedsArtwork = (design) => (design?.deliverables||[]).some(t=>ARTWORK_DELIVERABLES.includes(t));

// Open (unresolved) blockers on a design card.
export const openBlockers = (design) => (design?.blockers||[]).filter(b=>b&&!b.resolved);

// The date the work is *promised* by. The designer manager's committed date wins;
// otherwise fall back to the working due date, then the linked DRF's requested
// deadline. Returns "" when nothing is set (which is itself a signal).
export const designPromisedDate = (design, drf) =>
  design?.committedDate || design?.dueDate || drf?.designDeadline || "";

// True once Production has acknowledged the handoff (two-sided, unlike the
// fire-and-forget Telegram on "Done").
export const isProductionBriefed = (design) => !!(design?.productionBriefed?.at);

// ── Design urgency ────────────────────────────────────────────────────────────
// One ranking used by the board, the cards, and the filter tiles so they never
// drift. Higher rank = more urgent. Explainable tiers, not a black-box score.
//   4 blocked · 3 overdue · 2 due≤7d & behind · 1 due≤7d · 0 on-track · -1 closed
export const designUrgency = (design, drf, todayISO) => {
  const d = design || {};
  if (isDesignClosed(d.status)) return { rank:-1, tier:"closed",   label:"Closed",       color:"#94a3b8" };
  if (openBlockers(d).length)   return { rank: 4, tier:"blocked",  label:"Blocked",      color:"#dc2626" };
  const promised = designPromisedDate(d, drf);
  const approved = !!(d.approvedBy && d.approvedOn);
  if (promised && !approved) {
    const days = Math.ceil((new Date(promised) - new Date(todayISO)) / 86400000);
    const behind = ["Briefing","On-going"].includes(d.status); // early-stage but deadline is near/past
    if (days < 0)                return { rank: 3, tier:"overdue",  label:`Overdue ${Math.abs(days)}d`, color:"#dc2626" };
    if (days <= 7 && behind)     return { rank: 2, tier:"at-risk",  label:`Due ${days}d · behind`,      color:"#f97316" };
    if (days <= 7)               return { rank: 1, tier:"due-soon", label:days===0?"Due today":`Due ${days}d`, color:"#f59e0b" };
  }
  if (!promised)                 return { rank: 0, tier:"undated",  label:"No committed date", color:"#a855f7" };
  return { rank: 0, tier:"on-track", label:"On track", color:"#10b981" };
};

export const SW_CLR    = { "To Buy":"#ef4444",Ordered:"#f59e0b",Received:"#10b981","Client Approved":"#059669" };

export const DRF_TYPES = ["Module / Display Fixture","Signage","Retail Fit-Out","Counter / Reception","Kiosk","Wall Panel / Decor","Custom Furniture","Other"];

// Project category as supplied by the Sales brief template (Event / Kiosk / Store / Others).
export const DRF_CATEGORIES = ["Event","Kiosk","Store","Others"];

export const DRF_STATUSES = ["New","Acknowledged","In Progress","For Review","Revision","Approved","Production","Done","Cancelled"];

export const DRF_CLR   = {New:"#94a3b8",Acknowledged:"#3b82f6","In Progress":"#f97316","For Review":"#8b5cf6",Revision:"#ef4444",Approved:"#10b981",Production:"#0ea5e9",Done:"#059669",Cancelled:"#dc2626"};

export const emptyDRF  = ()=>({dealId:"",client:"",location:"",designer:"",designDeadline:"",projectTitle:"",type:DRF_TYPES[0],category:"",size:"",platform:"",finishes:"",maxHeight:"",brandGuideLink:"",budget:"",description:"",accessories:[],refLinks:["","",""],notes:"",approvedLink:"",status:"New",createdBy:""});

export const ROLE_CLR  = { Manager:"#f59e0b",Sales:"#10b981",Finance:"#3b82f6",Accounting:"#6366f1",Procurement:"#06b6d4",ProcurementManager:"#0891b2",QS:"#8b5cf6",Operations:"#f97316",Design:"#ec4899",ProjectMover:"#0ea5e9",Coordinator:"#0284c7",Warehouse:"#64748b",SalesOpsAdmin:"#14b8a6",FinanceAssistant:"#1d4ed8",Audit:"#dc2626",HRAdmin:"#7c3aed" };

// Client mirror of the mint-session ROLE_MAP: app-level role codes that resolve
// to a canonical RLS role for permission checks. ProcurementManager is a UI/
// approval-only distinction — server-side it has the exact same access as
// Procurement, so it MUST canonicalize to Procurement here and in mint-session.
export const RLS_ROLE_MAP = { Operations:"ProjectMover", Ops:"ProjectMover", "Cost Control":"Finance", Admin:"Manager", ProcurementManager:"Procurement" };
export const canonRole = r => RLS_ROLE_MAP[r] || r;
// Who gets a clean (unwatermarked) BOQ quotation PDF to send to the client.
// Everyone else's copy is stamped "DRAFT – NOT FOR SUBMISSION". Sales and
// SalesOpsAdmin added 2026-11-23 (Paulo: "I'd like for my team to send BOQs
// without the watermarks"); before that, Managers only.
export const BOQ_CLEAN_PDF_ROLES = ["Manager","Sales","SalesOpsAdmin"];
export const boqPdfClean = r => BOQ_CLEAN_PDF_ROLES.includes(canonRole(r));
// True for anyone on the procurement desk (buyer or the approving manager).
// Use this for every UI/ability gate that should cover both; keep === checks
// only where the manager and the buyer must be told apart (i.e. PO approval).
export const isProcurementRole = r => r === "Procurement" || r === "ProcurementManager";
// Who raises (creates) POs and subcon WOs: Procurement, the Procurement Manager and
// Managers. Finance pays, so it never raises an order (Paulo, 2026-11-11). The
// database refuses a new PO line / WO from Finance roles (migration 20261114050000).
export const canRaiseOrder = r => r === "Manager" || isProcurementRole(r);
// Who adds an internal cost center (GMD OPEX, GMD Tools, an office renovation…):
// a Manager or the Finance role (Paulo, 2026-11-22). Mirrors create_cost_center
// (migration 20261122010000_cost_center_create_finance.sql). Keep in sync.
export const COST_CENTER_CREATOR_ROLES = ["Manager","Finance"];
export const canCreateCostCenter = r => COST_CENTER_CREATOR_ROLES.includes(canonRole(r));

// Human-readable labels for role codes that aren't self-explanatory when shown
// raw (role codes are used directly in ===/object-key comparisons, so we keep
// them token-safe and map to a friendly label only at display sites).
export const ROLE_LABEL = { SalesOpsAdmin:"Sales & Ops Admin", FinanceAssistant:"Finance Assistant", HRAdmin:"HR & Admin", Audit:"Audit Team", ProcurementManager:"Procurement Manager" };
export const roleLabel = r => ROLE_LABEL[r] || r;

// ── PERMISSIONS — client-side mirror of the Supabase RLS write policies ───────
// Single source of truth for (a) the pre-write "your role can't do this" dialog,
// (b) the in-app Permissions matrix (Manager → Admin → Permissions), and (c) the
// exported permissions doc. This MUST track the server RLS policies — it does not
// grant anything (the server is always the final authority); it only lets the app
// warn a user BEFORE a doomed write instead of letting it silently revert.
//
// Values are canonical RLS role codes (after the mint-session ROLE_MAP: Operations
// /Ops→ProjectMover, Cost Control→Finance, Admin→Manager). The token "AUTH" means
// any logged-in user. Grants transcribed from supabase_migration_037_rls_rollout_v2
// and the later overlays (042 design tiers, 043/044 accounting, 049 billing/
// checklists, 050/051 BOQ). Keep in lock-step with those migrations.
// NOTE: a few tables carry finer server rules than a role list can express — deals
// DELETE is Manager + the named sales leads (jena/wyn/paolo); design UPDATE/senior
// reads are username-tiered. Those are flagged in PERM_NOTES and shown as caveats.
export const PERM_ROLES = ["Manager","Sales","ProjectMover","Finance","FinanceAssistant","Accounting","Procurement","ProcurementManager","QS","SalesOpsAdmin","Design","Warehouse","Audit","HRAdmin"];

const AUTH = "AUTH";
export const PERMISSIONS = {
  deals:               { label:"Deals / Pipeline",        group:"Sales",       select:["Manager","Sales","ProjectMover","Finance","FinanceAssistant","Accounting","Procurement","QS","SalesOpsAdmin"], insert:["Manager","Sales","SalesOpsAdmin"], update:["Manager","Sales","SalesOpsAdmin","QS"], delete:["Manager"] },
  ce_requests:         { label:"CE / QS Requests",         group:"Sales",       select:["Manager","Sales","Finance","FinanceAssistant","QS","SalesOpsAdmin"], insert:["Manager","QS","Sales","SalesOpsAdmin"], update:["Manager","QS"], delete:["Manager"] },
  design_requests:     { label:"Design Requests (DRF)",    group:"Design",      select:["Manager","Sales","ProjectMover","Finance","Design","SalesOpsAdmin"], insert:["Manager","Sales","Design","SalesOpsAdmin"], update:["Manager","Design"], delete:["Manager"] },
  swatches:            { label:"Swatches",                 group:"Design",      select:["Manager","Finance","FinanceAssistant","Procurement","Design"], insert:["Manager","Procurement","Design"], update:["Manager","Procurement","Design"], delete:["Manager","Procurement"] },
  projects:            { label:"Projects",                 group:"Operations",  select:[AUTH], insert:["Manager","ProjectMover"], update:["Manager","ProjectMover"], delete:["Manager"] },
  project_cards:       { label:"Project Cards",            group:"Operations",  select:[AUTH], insert:["Manager","ProjectMover","Finance"], update:["Manager","ProjectMover","Finance"], delete:["Manager"] },
  daily_logs:          { label:"Daily Site Logs",          group:"Operations",  select:["Manager","ProjectMover","Sales"], insert:["Manager","ProjectMover"], update:["Manager","ProjectMover"], delete:["Manager"] },
  checklists:          { label:"Calendar / Checklists",    group:"Operations",  select:[AUTH], insert:[AUTH], update:[AUTH], delete:["Manager","ProjectMover","SalesOpsAdmin"] },
  addenda:             { label:"Scope Changes (Addenda)",  group:"Operations",  select:["Manager","ProjectMover","Sales","Finance","FinanceAssistant","Procurement","SalesOpsAdmin"], insert:["Manager","ProjectMover","Procurement","Design"], update:["Manager","ProjectMover","Sales","SalesOpsAdmin"], delete:["Manager"] },
  project_blockers:    { label:"Project Blockers",         group:"Operations",  select:[AUTH], insert:["Manager","ProjectMover"], update:["Manager","ProjectMover"], delete:["Manager"] },
  ae_updates:          { label:"Account / PM Updates",     group:"Operations",  select:["Manager","ProjectMover","Sales","Finance","QS","SalesOpsAdmin"], insert:["Manager","ProjectMover","Sales","Finance","QS","SalesOpsAdmin"], update:["Manager","ProjectMover"], delete:["Manager","ProjectMover","Sales","Finance","QS","SalesOpsAdmin"] },
  billing_milestones:  { label:"Billing Milestones",       group:"Finance",     select:["Manager","Sales","Finance","Accounting","FinanceAssistant","SalesOpsAdmin"], insert:["Manager","Finance","FinanceAssistant","SalesOpsAdmin"], update:["Manager","Finance","FinanceAssistant","SalesOpsAdmin"], delete:["Manager","Finance","FinanceAssistant","SalesOpsAdmin"] },
  billing_payments:    { label:"Billing Payments",         group:"Finance",     select:["Manager","Sales","Finance","Accounting","FinanceAssistant","SalesOpsAdmin"], insert:["Manager","Finance","FinanceAssistant","SalesOpsAdmin"], update:["Manager","Finance","FinanceAssistant","SalesOpsAdmin"], delete:["Manager","Finance","FinanceAssistant","SalesOpsAdmin"] },
  expenses:            { label:"Expenses",                 group:"Finance",     select:[AUTH], insert:["Manager","Finance","Accounting","FinanceAssistant","SalesOpsAdmin","Procurement"], update:["Manager","Finance","Accounting","FinanceAssistant","SalesOpsAdmin","Procurement"], delete:["Manager"] },
  payables:            { label:"Payables",                 group:"Finance",     select:["Manager","Finance","Accounting","FinanceAssistant","Procurement","ProcurementManager","SalesOpsAdmin"], insert:["Manager","Procurement","ProcurementManager","Finance","FinanceAssistant","Accounting"], update:["Manager","Finance","Accounting","FinanceAssistant","Procurement","ProcurementManager","SalesOpsAdmin"], delete:["Manager"] }, // insert: Finance roles only for no-PO bills on a cost center (migration 20261111100000, canBillOpex)
  payable_payments:    { label:"Payable Payments",         group:"Finance",     select:["Manager","Finance","Accounting","FinanceAssistant","Procurement","SalesOpsAdmin"], insert:["Manager","Finance","Accounting","FinanceAssistant"], update:["Manager","Finance","Accounting","FinanceAssistant"], delete:[] },
  check_vouchers:      { label:"Check Vouchers",           group:"Finance",     select:["Manager","Finance","Accounting","FinanceAssistant"], insert:["Manager","Accounting"], update:["Manager","Finance","Accounting","FinanceAssistant"], delete:["Manager"] },
  purchase_requests:   { label:"Purchase Orders",          group:"Procurement", select:["Manager","Finance","Accounting","FinanceAssistant","Procurement","ProcurementManager","QS"], insert:["Manager","Procurement","ProcurementManager"], update:["Manager","Finance","FinanceAssistant","Procurement","ProcurementManager"], delete:["Manager","Procurement","ProcurementManager"] },
  subcon_work_orders:  { label:"Subcon Work Orders",       group:"Procurement", select:["Manager","Sales","Finance","Accounting","FinanceAssistant","Procurement","ProcurementManager","SalesOpsAdmin"], insert:["Manager","Procurement","ProcurementManager"], update:["Manager","Finance","Accounting","FinanceAssistant","Procurement","ProcurementManager"], delete:["Manager","Procurement","ProcurementManager"] },
  material_requests:   { label:"Material Requests",        group:"Procurement", select:["Manager","ProjectMover","Sales","Finance","FinanceAssistant","Procurement","SalesOpsAdmin"], insert:["Manager","Sales","Procurement","SalesOpsAdmin"], update:["Manager","Finance","FinanceAssistant","Procurement"], delete:["Manager","Procurement"] },
  budget_requests:     { label:"Budget Requests",          group:"Procurement", select:["Manager","ProjectMover","Sales","Finance","FinanceAssistant","Procurement","SalesOpsAdmin"], insert:["Manager","Sales","Procurement","SalesOpsAdmin"], update:["Manager","Finance","FinanceAssistant","Procurement"], delete:["Manager","Procurement"] },
  suppliers:           { label:"Suppliers",                group:"Procurement", select:["Manager","Finance","FinanceAssistant","Procurement"], insert:["Manager","Procurement"], update:["Manager","Procurement"], delete:["Manager","Procurement"] },
  subcontractors:      { label:"Subcontractors",           group:"Procurement", select:["Manager","Finance","FinanceAssistant","Procurement"], insert:["Manager","Procurement"], update:["Manager","Procurement"], delete:["Manager","Procurement"] },
  inventory_items:     { label:"Inventory Items",          group:"Warehouse",   select:["Manager","Finance","FinanceAssistant","Procurement","Warehouse"], insert:["Manager","Warehouse"], update:["Manager","Warehouse"], delete:["Manager","Warehouse"] },
  stock_movements:     { label:"Stock Movements",          group:"Warehouse",   select:["Manager","Finance","FinanceAssistant","Procurement","Warehouse"], insert:["Manager","Warehouse"], update:["Manager","Warehouse"], delete:["Manager"] },
  boq_library:         { label:"BOQ Library",              group:"QS / Cost",   select:["Manager","Finance","FinanceAssistant","QS","ProjectMover"], insert:["Manager","QS"], update:["Manager","QS"], delete:["Manager"] },
  project_budgets:     { label:"Project Budgets",          group:"QS / Cost",   select:["Manager","Finance","FinanceAssistant","QS","ProjectMover"], insert:["Manager","QS","Sales","SalesOpsAdmin"], update:["Manager","Finance","FinanceAssistant","QS"], delete:["Manager"] },
  audit_findings:      { label:"Audit Findings",           group:"Audit",       select:["Manager","Finance","Audit","HRAdmin"], insert:["Manager","Audit","HRAdmin"], update:["Manager","Audit","HRAdmin"], delete:["Manager","Audit","HRAdmin"] },
  commission_payouts:  { label:"Commission Payouts",       group:"Sales",       select:["Manager","Sales","Finance","FinanceAssistant","Accounting","SalesOpsAdmin"], insert:["Manager","Finance","FinanceAssistant"], update:["Manager","Finance","FinanceAssistant"], delete:["Manager"] },
};

// Human-readable caveats for rules a plain role list can't express.
export const PERM_NOTES = {
  deals:"Delete is limited to Managers plus the named sales leads (Jena, Wyn, Paolo).",
  daily_logs:"Beyond Managers, the person who wrote a log can delete their own — the ✓ column shows Manager only, but authors can remove their own entry.",
  design_requests:"Design reads/edits are further tiered by designer — senior designers (Gab, Miaa) see more than the rest of the team.",
  project_budgets:"Finance can edit an existing budget. Creating the first budget row is Managers, QS, and Sales/SalesOpsAdmin (the award's automatic starting budget) — Sales cannot edit it afterwards.",
};

const PERM_ACTIONS = ["select","insert","update","delete"];
// True if `role` (already canonical) may perform `action` on `table`. Unknown
// tables default to allowed so this never blocks a write the RLS map doesn't cover.
export const roleCan = (role, action, table) => {
  const t = PERMISSIONS[table];
  if(!t || !t[action]) return true;
  const allowed = t[action];
  // Canonicalize so app-level aliases (e.g. ProcurementManager → Procurement)
  // resolve to the RLS role the policy lists, even if a caller passed the raw code.
  const cr = canonRole(role);
  return allowed.includes(AUTH) || allowed.includes(cr);
};
// The roles allowed to perform an action, as a friendly display string.
export const rolesAllowedLabel = (action, table) => {
  const t = PERMISSIONS[table];
  if(!t || !t[action]) return "any role";
  if(t[action].includes(AUTH)) return "everyone";
  return t[action].map(roleLabel).join(", ");
};
export { PERM_ACTIONS };

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
  const c   = x => Math.round(x*100)/100;               // round to centavos — currency has 2 decimals
  const b   = c(Number(base)||0);
  const vat = receiptType==="OR" ? c(b*0.12) : 0;       // 12% VAT on base (OR only)
  const gross = c(b + vat);                              // total amount billed to client
  const ewt = (receiptType==="OR" && withholding) ? c(b*0.02) : 0; // EWT only on OR, not AR
  const netReceivable = c(gross - ewt);                 // what GMD actually receives
  return { base:b, vat, gross, ewt, netReceivable };
};

// Canonical money for ONE deal, in every basis — so every view counts the same
// way instead of each subtracting mismatched net/gross figures. In this system
// `value` and `invoiced` are stored VAT-EXCLUSIVE (the net contract base), while
// `amountPaid` is tracked in CASH terms (netReceivable = gross − EWT, i.e. what
// the client actually remits). The long-standing bug is that several views did
// `invoiced − amountPaid` (net minus cash), which reads ~10–12% low and can go
// negative once a client has paid. Compare collections against the receivable in
// the SAME cash basis and it's correct. Returns the four headline figures the
// business tracks — contract price, VAT, EWT, collections — plus derived totals.
export const dealFinancials = (d={}) => {
  const r2 = x => Math.round((Number(x)||0)*100)/100;
  const receiptType = d.receiptType || "OR";
  const withholding = !!d.withholding;
  const ct = calcTax(Number(d.value)||0,    receiptType, withholding); // whole contract
  const bt = calcTax(Number(d.invoiced)||0, receiptType, withholding); // billed to date
  const collected = r2(d.amountPaid);
  return {
    receiptType, withholding,
    contract:         ct.base,          // Total Contract Price (VAT-exclusive)
    vat:              ct.vat,           // 12% VAT (OR receipts only)
    ewt:              ct.ewt,           // 2% EWT withheld by client (OR + withholding)
    gross:            ct.gross,         // contract + VAT — the amount invoiced to client
    netReceivable:    ct.netReceivable, // cash the client remits (gross − EWT)
    billed:           bt.base,          // billed to date (net)
    billedReceivable: bt.netReceivable, // billed to date, cash basis
    collected,                          // Collections to date (cash basis)
    outstanding: r2(Math.max(0, bt.netReceivable - collected)), // like-for-like cash basis
  };
};

// ── Accounts receivable, one calculation for every screen ────────────────────
// A billing milestone's `amount` is the VAT-EXCLUSIVE base; its payments are CASH
// (gross − EWT). So a milestone's open balance is its cash receivable minus the
// good payments on it — never `amount − payments` (net − cash), which understates
// AR by ~10% and overstates the collection rate. Bounced payments never landed and
// Cancelled milestones aren't owed. Receipt type / EWT fall back to the deal's.
export const milestoneReceivable = (b={}, deal) => {
  const rt = b.receiptType || b.receipt_type || (deal && deal.receiptType) || "OR";
  const wh = b.withholding != null ? !!b.withholding : !!(deal && deal.withholding);
  return calcTax(Number(b.amount)||0, rt, wh).netReceivable;
};
export const milestonePaid = (b={}) =>
  (b.payments||[]).filter(p=>!p.bounced).reduce((s,p)=>s+(Number(p.amount)||0),0);
export const milestoneBalance = (b={}, deal) =>
  b.status==="Cancelled" ? 0 : Math.max(0, milestoneReceivable(b,deal) - milestonePaid(b));
// The open balance split into what it is made of, in proportion to the invoice:
// VAT-exclusive base + VAT − EWT = balance (cash basis). Non-VAT receipts carry
// no VAT; EWT only applies to VAT receipts with withholding (see calcTax).
export const milestoneBalanceParts = (b={}, deal) => {
  const bal = milestoneBalance(b, deal);
  const rt = b.receiptType || b.receipt_type || (deal && deal.receiptType) || "OR";
  const wh = b.withholding != null ? !!b.withholding : !!(deal && deal.withholding);
  const t = calcTax(Number(b.amount)||0, rt, wh);
  if(!(bal>0) || !(t.netReceivable>0)) return { bal, base:bal, vat:0, ewt:0 };
  const k = bal / t.netReceivable;
  return { bal, base:t.base*k, vat:t.vat*k, ewt:t.ewt*k };
};
// Past due, split by whether the client was actually billed. A Draft hasn't been
// sent, so it can't be overdue — it's an invoice nobody has sent yet, which is
// Finance's to chase internally, not the client's. Keep the two apart everywhere.
export const isBillingOverdue = (b={}, today) =>
  !!b.dueDate && b.dueDate < today && !["Draft","Fully Paid","Cancelled"].includes(b.status);
export const isBillingUnsentLate = (b={}, today) =>
  !!b.dueDate && b.dueDate < today && b.status === "Draft";
// ── Collections: aging bucket and call order, one rule for every AR screen ──
// A Draft milestone has not been sent to the client, so it is never aged as
// overdue: it sits in "unbilled" (Finance still has to send it). Everything
// else is aged by days past its due date. Before 2026-11-11 Drafts were aged
// with the sent invoices, which put ₱6.7M of unsent billings in the overdue
// buckets for collectors to call about.
export const AR_SMALL_BALANCE = 5000; // below this, a balance goes to the bottom of the call order
export const arDaysPastDue = (b={}, now=new Date()) =>
  b.dueDate ? Math.floor((now - new Date(b.dueDate)) / 864e5) : 0;
export const arAgeBucket = (b={}, now=new Date()) => {
  if (b.status === "Draft") return "unbilled";
  const d = arDaysPastDue(b, now);
  return d<=0 ? "current" : d<=30 ? "d30" : d<=60 ? "d60" : d<=90 ? "d90" : "over90";
};
const arRankOfDays = d => d>90 ? 4 : d>60 ? 3 : d>30 ? 2 : d>0 ? 1 : 0;
// Who to call first: oldest aging bucket first, then the biggest amount within
// that bucket, with balances under AR_SMALL_BALANCE last. So a ₱939K invoice 53
// days late comes before a ₱358 one 54 days late (same 31–60 bucket).
// `a` / `b` are {days, amount}: days = oldest past-due days, amount = what is owed.
export const arCallOrder = (a, b) => {
  const sa = a.amount < AR_SMALL_BALANCE, sb = b.amount < AR_SMALL_BALANCE;
  if (sa !== sb) return sa ? 1 : -1;
  return (arRankOfDays(b.days) - arRankOfDays(a.days)) || (b.amount - a.amount) || (b.days - a.days);
};
// Portfolio totals over a list of milestones. `dealOf(dealId)` returns the deal (or
// undefined) so receipt type / EWT can fall back to it.
export const arSummary = (billings=[], dealOf=()=>undefined) => {
  let billed=0, receivable=0, collected=0, offset=0, outstanding=0, open=0;
  billings.forEach(b=>{
    if(b.status==="Cancelled") return;
    // A Draft hasn't gone to the client, so it isn't owed yet: on 2026-11-25
    // 76 Drafts (PHP 15.07M) were counted as AR, 68% of the total shown. A Draft
    // that already has a payment (client paid before the invoice went out)
    // still counts, so collections stay whole.
    if(b.status==="Draft" && milestonePaid(b)<=0) return;
    const d=dealOf(b.dealId), r=milestoneReceivable(b,d), p=milestonePaid(b), bal=Math.max(0,r-p);
    billed+=Number(b.amount)||0; receivable+=r; collected+=p; outstanding+=bal; if(bal>0.005) open++;
    offset+=(b.payments||[]).filter(x=>!x.bounced&&isOffsetPayment(x)).reduce((s,x)=>s+(Number(x.amount)||0),0);
  });
  const r2=x=>Math.round(x*100)/100;
  // `collected` is everything settled against invoices, offsets included; `offset`
  // is the part of it settled without cash (see OFFSET_METHOD).
  return { billed:r2(billed), receivable:r2(receivable), collected:r2(collected), offset:r2(offset), outstanding:r2(outstanding),
           collectedBase:r2(receivable>0 ? collected*billed/receivable : 0),   // collections restated VAT-ex
           openMilestones:open, collectionRate: receivable>0 ? collected/receivable : 0 };
};

// ── Costs: PO basis, VAT-exclusive ───────────────────────────────────────────
// Every project/company cost = issued POs + committed Work Orders (poCostRows /
// woCostRows below) + payables not tied to one of them + legacy expenses NOT
// already routed to a payable or check voucher (no double count). Cost is taken NET of input VAT, so
// margin compares VAT-ex revenue with VAT-ex cost: recorded input VAT is removed,
// a row flagged vatable without an amount is grossed down by 1.12, and a row
// with neither is taken as-is (no VAT to strip).
const _amt = v => Number(String(v==null?0:v).replace(/,/g,""))||0;
// `vatPos` (optional, from poVatSet) is the set of PO numbers issued "with VAT":
// a bill against one of those POs carries 12% VAT even when the bill itself
// records no VAT, so it is grossed down too. Every other bill with no VAT info
// is taken as-is (VAT unknown; see costVatUnknown).
export const costNet = (x={}, vatPos=null) => {
  const amt=_amt(x.amount), iv=_amt(x.inputVat!=null?x.inputVat:x.input_vat);
  if(iv>0) return Math.round((amt-iv)*100)/100;
  if(x.vatable) return Math.round(amt/1.12*100)/100;
  const po=x.poId||x.po_id;
  if(vatPos&&po&&vatPos.has(po)) return Math.round(amt/1.12*100)/100;
  return amt;
};
// PO numbers whose PO is "with VAT" (any non-cancelled line flagged withVat).
export const poVatSet = (prs=[]) => {
  const s=new Set();
  (prs||[]).forEach(p=>{ if(p.poNumber&&p.status!=="Cancelled"&&p.withVat) s.add(p.poNumber); });
  return s;
};
// True when a cost row's VAT can't be known: no input VAT, not flagged vatable,
// not on a with-VAT PO. Such amounts are taken as-is (may still include VAT).
export const costVatUnknown = (x={}, vatPos=null) => {
  if(_amt(x.inputVat!=null?x.inputVat:x.input_vat)>0||x.vatable) return false;
  const po=x.poId||x.po_id;
  return !(vatPos&&po&&vatPos.has(po));
};
// Revenue recognised on the billing basis: a milestone counts once it is
// invoiced. A Draft hasn't been sent, so it isn't revenue yet; Cancelled never is.
export const isBilledRevenue = (b={}) => !["Draft","Cancelled"].includes(b.status);
// Cash collected on a milestone restated to its VAT-ex base (cash x base/receivable),
// so collections compare with VAT-ex revenue. Bounced payments and offsets excluded.
export const paymentBaseFactor = (b={}, deal) => {
  const rcv=milestoneReceivable(b,deal);
  return rcv>0 ? (Number(b.amount)||0)/rcv : 1;
};
// ── What kind of billing a statement is, and how much of the contract ──────
// Shown under the statement title ("PROGRESS BILLING · Billing 2 of 4 · 30% of
// contract price"). The % is worked out (gross claim / contract, VAT-ex both),
// never read from the milestone name; namePct is the % typed in the name, so
// the app can warn when the two disagree. A progress claim's amount is net of
// retention: gross = amount + retentionHeld.
export const billingKindLabel = (ms = {}) => {
  const t = String(ms.msType || "").toLowerCase(), nm = String(ms.name || "").toLowerCase();
  if (ms.isRetentionRelease || t === "retention" || /retention/.test(nm)) return "RETENTION RELEASE";
  if (t === "down payment" || /\b(dp|down ?payment)\b/.test(nm)) return "DOWN PAYMENT";
  if (t === "final" || /\bfinal\b/.test(nm)) return "FINAL BILLING";
  if (t === "progress" || /progress|claim/.test(nm)) return "PROGRESS BILLING";
  return "BILLING";
};
export const billingPosition = ({ deal, milestones = [], ms } = {}) => {
  if (!ms) return null;
  const contract = Number(deal && deal.value) || 0;
  const amount = Number(ms.amount) || 0, retentionHeld = Number(ms.retentionHeld) || 0;
  const gross = amount + retentionHeld;
  const key = b => String(b.invoiceDate || b.plannedDate || b.created_at || "9999");
  const seqAll = milestones.filter(b => b.dealId === ms.dealId && b.status !== "Cancelled");
  // "of N" only when the schedule covers the whole contract; progress claims
  // are added as work goes on, so there the total isn't known yet.
  const scheduled = seqAll.filter(b => !b.isRetentionRelease).reduce((s, b) => s + (Number(b.amount) || 0) + (Number(b.retentionHeld) || 0), 0);
  const fullSchedule = contract > 0 && scheduled >= contract - 1;
  const seqList = seqAll
    .slice().sort((a, b) => key(a).localeCompare(key(b)) || String(a.invoiceNo || "").localeCompare(String(b.invoiceNo || "")));
  const idx = seqList.findIndex(b => b.id === ms.id);
  const r1 = x => Math.round(x * 10) / 10;
  const pct = contract > 0 ? r1(gross / contract * 100) : null;
  // "60% complete" in a progress claim's name is work done, not the share
  // billed: kept apart (workPct) and never compared with pct.
  const nm = String(ms.name || "");
  const w = nm.match(/(\d+(?:\.\d+)?)\s*%\s*(?:complete|completion|accomplish)/i);
  const m = nm.replace(/(\d+(?:\.\d+)?)\s*%\s*(?:complete|completion|accomplish)\w*/ig, "").match(/(\d+(?:\.\d+)?)\s*%/);
  const namePct = m ? Number(m[1]) : null;
  const workPct = w ? Number(w[1]) : null;
  return {
    kind: billingKindLabel(ms), seq: idx >= 0 ? idx + 1 : null, count: fullSchedule ? seqList.length : null,
    contract, gross, amount, retentionHeld,
    retentionPct: retentionHeld > 0 && gross > 0 ? r1(retentionHeld / gross * 100) : 0,
    pctExact: contract > 0 ? Math.round(gross / contract * 10000) / 100 : null,
    pct, namePct, workPct, pctMismatch: pct != null && namePct != null && Math.abs(namePct - pct) > 0.5,
  };
};

// The statement's line item, billed as a share of the contract: QTY = the %,
// RATE = the contract price, AMOUNT = this billing (gross of any retention).
// Falls back to QTY 1 when the % can't reproduce the amount to the peso (no
// contract value, or an odd amount).
export const statementLine = (pos, ms = {}) => {
  const title = s => s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  const name = String(ms.name || "").trim();
  const gross = pos ? pos.gross : Number(ms.amount) || 0;
  const service = pos && pos.kind !== "BILLING" ? title(pos.kind) : (name || "Billing");
  const asPct = !!(pos && pos.contract > 0 && pos.pctExact != null &&
    Math.abs(pos.contract * pos.pctExact / 100 - gross) < 1);
  const desc = [];
  if (name && name.toLowerCase() !== service.toLowerCase()) desc.push(name);
  if (pos && pos.pct != null) desc.push(`${asPct ? pos.pctExact : pos.pct}% of the contract price`);
  const d2 = String(ms.description || "").trim();
  if (d2 && d2.toLowerCase() !== name.toLowerCase()) desc.push(d2);
  return { service, qty: asPct ? `${pos.pctExact}%` : "1", rate: asPct ? pos.contract : gross, amount: gross, description: desc };
};

// ── Billing terms and due date (one rule, so they never contradict) ────────
// The statement's TERMS line is worked out from its due date, never typed
// separately: 0 days = "Due on receipt", otherwise "Net N days". A milestone
// with no due date gets one from, in order: the project's payment period
// (deal.paymentTerms.netDays), a number in the client profile's terms, or
// DEFAULT_BILLING_NET_DAYS, counted from the billing date.
export const DEFAULT_BILLING_NET_DAYS = 15;
const _isoDays = (a, b) => Math.round((Date.parse(String(b).slice(0, 10) + "T00:00:00Z") - Date.parse(String(a).slice(0, 10) + "T00:00:00Z")) / 86400000);
export const billingTermsLabel = (days) => Number(days) <= 0 ? "Due on receipt" : `Net ${Number(days)} days`;
export const billingDefaultNetDays = (deal, clientTerms) => {
  const nd = deal && deal.paymentTerms && deal.paymentTerms.netDays;
  if (nd != null && nd !== "" && Number.isFinite(Number(nd))) return Math.max(0, Number(nd));
  const t = String(clientTerms || "").toLowerCase();
  if (/\b(cod|cash|cwo|upon receipt|on receipt)\b/.test(t)) return 0;
  const m = t.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : DEFAULT_BILLING_NET_DAYS;
};
export const billingDueTerms = ({ ms = {}, deal, clientTerms, today } = {}) => {
  const billDate = String(ms.invoiceDate || today || "").slice(0, 10);
  let days, dueDate;
  if (ms.dueDate && billDate) { dueDate = String(ms.dueDate).slice(0, 10); days = Math.max(0, _isoDays(billDate, dueDate)); }
  else { days = billingDefaultNetDays(deal, clientTerms); dueDate = billDate ? addDaysISO(billDate, days) : ""; }
  return { days, label: billingTermsLabel(days), dueDate, overdue: !!(dueDate && today && dueDate < today) };
};
// Contract progress for a billing statement: how much of the contract has been
// billed and paid, for the bar on the printed statement and the Share PDF.
// Worked out VAT-exclusive (contract value and milestone amounts are VAT-ex;
// payments are restated with paymentBaseFactor, so EWT withheld counts as
// settled), then shown in the statement's own basis: x1.12 when the deal is
// VAT-able, so it reads against the statement's TOTAL. "Billed" = every sent
// milestone dated on or before this statement, plus this one; "paid" = every
// payment recorded to date (offsets count, bounced don't). null when there is
// no contract value to measure against (e.g. a mother PO).
// Without `ms` (the Statement of Account) "billed" is every sent milestone and
// there is no "this billing" slice.
export const invoiceContractProgress = ({ deal, milestones = [], ms = null } = {}) => {
  const contractBase = Number(deal && deal.value) || 0;
  if (!(contractBase > 0) || !deal) return null;
  const r2 = x => Math.round((Number(x) || 0) * 100) / 100;
  const vatable = calcTax(100, (deal && deal.receiptType) || "OR").vat > 0;
  const k = vatable ? 1.12 : 1;
  const own = milestones.filter(b => b.dealId === deal.id && b.status !== "Cancelled");
  const asOf = (ms && ms.invoiceDate) || "";
  const billedMs = own.filter(b => (ms && b.id === ms.id) ||
    (isBilledRevenue(b) && (!asOf || !b.invoiceDate || String(b.invoiceDate) <= asOf)));
  if (ms && !billedMs.some(b => b.id === ms.id)) billedMs.push(ms);
  const paidBaseOf = b => milestonePaid(b) * paymentBaseFactor(b, deal);
  // A progress claim's retention is billed (claimed), just held back until
  // the retention release; so it counts as billed on the claim, and the
  // release milestone's own amount doesn't count again.
  const claimed = b => b.isRetentionRelease ? 0 : (Number(b.amount) || 0) + (Number(b.retentionHeld) || 0);
  const billedBase = billedMs.reduce((s, b) => s + claimed(b), 0);
  const thisBase = ms ? (ms.isRetentionRelease ? Number(ms.amount) || 0 : claimed(ms)) : 0;
  const paidBase = Math.min(own.reduce((s, b) => s + paidBaseOf(b), 0), Math.max(billedBase, contractBase));
  const thisUnpaidBase = ms ? Math.max(0, thisBase - paidBaseOf(ms)) : 0;
  const prevUnpaidBase = Math.max(0, billedBase - paidBase - thisUnpaidBase);
  const unbilledBase = Math.max(0, contractBase - billedBase);
  const pct = x => Math.round(x / contractBase * 1000) / 10;
  const cashPaid = own.reduce((s, b) => s + milestonePaid(b), 0);
  const ewtBilled = billedMs.reduce((s, b) => s + calcTax(b.amount,
    b.receiptType ?? deal.receiptType ?? "OR", b.withholding ?? deal.withholding ?? false).ewt, 0);
  const dueOf = b => { const t = calcTax(b.amount, b.receiptType ?? deal.receiptType ?? "OR", b.withholding ?? deal.withholding ?? false);
    return Math.max(0, t.gross - t.ewt - milestonePaid(b)); };
  const thisDue = ms ? dueOf(ms) : 0;
  const prevDue = billedMs.filter(b => !ms || b.id !== ms.id).reduce((s, b) => s + dueOf(b), 0);
  return {
    vatable,
    contract: r2(contractBase * k), contractExVat: r2(contractBase), billed: r2(billedBase * k), paid: r2(paidBase * k),
    thisBill: r2(thisBase * k), thisUnpaid: r2(thisUnpaidBase * k), prevUnpaid: r2(prevUnpaidBase * k),
    unbilled: r2(unbilledBase * k), remaining: r2(Math.max(0, contractBase - paidBase) * k),
    paidPct: pct(paidBase), billedPct: pct(billedBase), thisPct: pct(thisBase),
    thisUnpaidPct: pct(thisUnpaidBase), prevUnpaidPct: pct(prevUnpaidBase), unbilledPct: pct(unbilledBase),
    overBilled: billedBase - contractBase > 0.5,
    withholding: !!(deal && deal.withholding),
    // The client's view, matching each statement's own TOTAL / Less: EWT /
    // AMOUNT PAID lines: payments as recorded (no EWT grossed in), the EWT
    // the client withholds on everything billed so far (to be covered by
    // their BIR 2307), and what is left after both. `paid` / `remaining`
    // above credit EWT only on what was paid, so a client saw two different
    // "paid" figures on one page (Yobo INV-1951, 2026-11-25).
    cashPaid: r2(cashPaid), ewtBilled: r2(ewtBilled),
    remainingNet: r2(Math.max(0, r2(contractBase * k) - r2(cashPaid) - r2(ewtBilled))),
    cashPaidPct: pct(cashPaid / k), ewtBilledPct: pct(ewtBilled / k),
    // Same basis for the bar: this billing's and earlier billings' balance
    // due (TOTAL − EWT − paid), as % of the contract.
    thisDuePct: pct(thisDue / k), prevDuePct: pct(prevDue / k),
  };
};
// The project's whole billing schedule, for the billing statement: one row
// per non-cancelled billing (sent ones first, by date, then the upcoming
// Drafts), VAT-inclusive like the statement's TOTAL. Shown to the client, so
// it is null unless the schedule adds up to the contract (billingContractGap
// within ₱1): a schedule that doesn't would print a wrong total. The last
// upcoming row takes the VAT rounding so the column adds up to the contract.
export const billingScheduleRows = ({ deal, milestones = [], ms = null } = {}) => {
  const contractBase = Number(deal && deal.value) || 0;
  if (!deal || !(contractBase > 0) || deal.standbyPO) return null;
  const gap = billingContractGap(deal, milestones);
  if (!gap.count || Math.abs(gap.gap) > 1) return null;
  const r2 = x => Math.round((Number(x) || 0) * 100) / 100;
  const rt = deal.receiptType || "OR";
  const k = calcTax(100, rt).vat > 0 ? 1.12 : 1;
  const own = milestones.filter(b => b.dealId === deal.id && b.status !== "Cancelled");
  const sent = own.filter(b => b.status !== "Draft")
    .sort((a, b) => String(a.invoiceDate || "").localeCompare(String(b.invoiceDate || "")));
  const upcoming = own.filter(b => b.status === "Draft")
    .sort((a, b) => String(a.plannedDate || a.invoiceDate || "").localeCompare(String(b.plannedDate || b.invoiceDate || "")));
  const rows = [...sent, ...upcoming].map(b => {
    const t = calcTax(b.amount, b.receiptType ?? rt, b.withholding ?? deal.withholding ?? false);
    const paid = milestonePaid(b);
    const isThis = !!(ms && b.id === ms.id);
    const status = b.status === "Draft" ? (isThis ? "This billing" : "Upcoming")
      : paid >= t.netReceivable - 1 ? "Paid"
      : isThis ? (paid > 0 ? "This billing · partly received" : "This billing")
      : paid > 0 ? "Partly received" : "Billed";
    return { id: b.id, ref: b.status === "Draft" ? "" : (b.invoiceNo || ""), name: b.name || "",
      pct: Math.round((Number(b.amount) || 0) / contractBase * 1000) / 10, amount: t.gross, status, isThis, upcoming: b.status === "Draft" };
  });
  const contractInc = r2(contractBase * k);
  const lastUp = [...rows].reverse().find(r => r.upcoming);
  if (lastUp) lastUp.amount = r2(contractInc - rows.filter(r => r !== lastUp).reduce((s, r) => s + r.amount, 0));
  return { rows, total: r2(rows.reduce((s, r) => s + r.amount, 0)), vatable: k > 1 };
};
// A project's completion % for margin screens: the one progress rule (projProgressPct),
// with "not set yet" counted as 0.
export const projectProgressPct = (card, deal) => projProgressPct(card, deal) ?? 0;
// ── PO / Work Order totals: the project-cost basis ──────────────────────────
// A project's cost is what GMD has committed to: every issued PO (status in
// PO_ISSUED_STATUSES) and every committed subcon Work Order, whether or not the
// supplier has billed yet. A PO's amount is gross − PO-level discount (+ 12% VAT
// when the PO is "with VAT"); the same formula the printed PO, the PO list and
// syncPoPayable use. Cost is taken VAT-ex (net), like every other cost here.
export const PO_ISSUED_STATUSES = ["PO Issued","Partially Delivered","Delivered"];
// "In Progress" is a committed WO too (SWO_STATUSES); without it a WO dropped out
// of project cost the moment work started.
export const WO_COMMITTED_STATUSES = ["Issued","In Progress","Partially Delivered","Delivered","Completed","For Accounting"];
const poLineGross = i => (_amt(i.actUnitCost)||_amt(i.estUnitCost))*_amt(i.qty);
export const poTotals = (lines=[]) => {
  const gross=(lines||[]).reduce((s,i)=>s+poLineGross(i),0);
  const pdt=lines?.[0]?.poDiscType||"none", pdv=_amt(lines?.[0]?.poDiscValue);
  const poDisc=pdt==="pct"?gross*(pdv/100):pdt==="fixed"?Math.min(pdv,gross):0;
  const afterPo=gross-poDisc, withVat=!!lines?.[0]?.withVat;
  return { gross, net:Math.round(afterPo*100)/100, total:Math.round((afterPo+(withVat?afterPo*0.12:0))*100)/100, withVat };
};
// One cost row per PO line, so a PO split across projects is costed to each.
// A line's share of the PO's discount and VAT follows its share of the gross.
const realProject = id => (id && id!=="__gmd_stocks__") ? id : null;
export const poCostRows = (prs=[]) => {
  const byPo=new Map();
  (prs||[]).forEach(p=>{ if(p.poNumber&&p.status!=="Cancelled"){ const a=byPo.get(p.poNumber)||[]; a.push(p); byPo.set(p.poNumber,a); } });
  const rows=[];
  byPo.forEach((lines,poNo)=>{
    if(!lines.some(l=>PO_ISSUED_STATUSES.includes(l.status))) return;
    const t=poTotals(lines);
    lines.forEach(l=>{
      const share=t.gross>0?poLineGross(l)/t.gross:0;
      rows.push({ projectId:realProject(l.projectId||l.dealId), date:l.poDate||l.createdAt||null,
        gross:Math.round(t.total*share*100)/100, net:Math.round(t.net*share*100)/100, vatTracked:t.withVat, src:"po", ref:poNo });
    });
  });
  return rows;
};
export const woCostRows = (swos=[]) => (swos||[]).filter(w=>w.woNumber&&WO_COMMITTED_STATUSES.includes(w.status)&&_amt(w.contractAmount)>0).map(w=>({
  projectId:realProject(w.projectId||w.dealId), date:w.woDate||w.createdAt||null,
  gross:_amt(w.contractAmount), net:_amt(w.contractAmount), vatTracked:false, src:"wo", ref:w.woNumber }));

// With prs/swos given, issued POs and committed WOs are the cost, and a payable
// counts only when it isn't one of them (manual bills, or a bill whose PO is no
// longer issued). Without them, the legacy AP-ledger basis applies.
export const ledgerCosts = (exps=[], payables=[], prs=null, swos=null, vatPos=null) => {
  const poBasis=Array.isArray(prs);
  if(!vatPos&&poBasis) vatPos=poVatSet(prs);
  const commit=poBasis?[...poCostRows(prs),...woCostRows(swos||[])]:[];
  const covered=new Set(commit.map(r=>r.ref));
  return [
  ...commit,
  ...(payables||[]).filter(p=>!["Cancelled","Void"].includes(p.status)&&!(poBasis&&p.poId&&covered.has(p.poId))).map(p=>({
    projectId:p.projectId||p.project_id||null, date:p.invoiceDate||p.invoice_date||p.createdAt||p.created_at||null,
    gross:_amt(p.amount), net:costNet(p,vatPos), vatTracked:!costVatUnknown(p,vatPos), src:"payable" })),
  ...(exps||[]).filter(e=>!e.payableId&&!e.cvId).map(e=>({
    projectId:e.projectId||e.dealId||null,
    date:e.date||(e.year!=null&&e.month!=null?`${e.year}-${String(Number(e.month)+1).padStart(2,"0")}-01`:null),
    gross:_amt(e.amount), net:costNet(e), vatTracked:!!(e.vatable||_amt(e.inputVat)>0), src:"expense" })),
  ];
};
// Cost waiting on approval, per project (VAT-ex, same basis as poCostRows /
// woCostRows): POs with lines at "Pending Approval" and no issued line, and WOs
// at "Pending Approval". Project Margins shows it beside the committed cost so a
// job whose POs haven't been approved yet doesn't read as a 99% margin.
export const pendingCostByProject = (prs=[], swos=[]) => {
  const out=new Map(), add=(id,v)=>{ if(id&&v) out.set(id,(out.get(id)||0)+v); };
  const byPo=new Map();
  (prs||[]).forEach(p=>{ if(p.poNumber&&p.status!=="Cancelled"){ const a=byPo.get(p.poNumber)||[]; a.push(p); byPo.set(p.poNumber,a); } });
  byPo.forEach(lines=>{
    if(lines.some(l=>PO_ISSUED_STATUSES.includes(l.status))) return; // already counted as committed
    const pend=lines.filter(l=>l.status==="Pending Approval");
    if(!pend.length) return;
    const t=poTotals(pend);
    pend.forEach(l=>{ const share=t.gross>0?poLineGross(l)/t.gross:0; add(realProject(l.projectId||l.dealId),Math.round(t.net*share*100)/100); });
  });
  (swos||[]).forEach(w=>{ if(w.status==="Pending Approval") add(realProject(w.projectId||w.dealId),_amt(w.contractAmount)); });
  return out;
};
export const costSummary = (exps=[], payables=[], prs=null, swos=null, vatPos=null) => {
  const rows=ledgerCosts(exps,payables,prs,swos,vatPos), byProject=new Map();
  let gross=0, net=0, tracked=0;
  rows.forEach(r=>{ gross+=r.gross; net+=r.net; if(r.vatTracked) tracked++;
    if(r.projectId) byProject.set(r.projectId,(byProject.get(r.projectId)||0)+r.net); });
  return { rows, gross:Math.round(gross*100)/100, net:Math.round(net*100)/100, count:rows.length, vatTracked:tracked, byProject };
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

// Re-add records that exist locally but weren't in the server's response — but
// ONLY the ones that are genuinely unsynced local creates, never rows the server
// deleted. Without `keepIds` this cannot tell those two cases apart and keeps
// EVERY local-only row, which silently resurrects deleted deals/records on the
// next reload (and cross-user: another user's cached copy comes back to life the
// moment they refresh, because they never issued the delete). `keepIds` is the
// set of ids with a pending offline-queue write (see sbPendingIds) — i.e. the
// only ids that legitimately exist locally but not yet on the server. Any other
// local-only row is a server-side deletion and is dropped. When keepIds is null
// (e.g. before the app has wired it up) the old keep-everything behavior stands.
export const mergeLocalOnly=(serverList,localList,keepIds=null)=>{
  const ids=new Set(serverList.map(x=>x.id));
  const localOnly=(localList||[]).filter(x=>x.id&&!ids.has(x.id)&&(!keepIds||keepIds.has(x.id)));
  return localOnly.length?[...serverList,...localOnly]:serverList;
};

export const mergeLocalOnlyObj=(serverObj,localObj)=>({...(localObj||{}),...(serverObj||{})});

// ── JO = project code (owner decision, 2026-10-20) ───────────────────────────
// Every awarded deal has a JO; a child deal's is its parent's plus -01, -02.
// The database issues them (migration 20261020020000_jo_project_code.sql).
// dealJo returns a deal's project-code JO: its earliest non-Void JO, plain
// JO-NNNN before suffixed ones. Mirrors deal_base_jo() in that migration.
const _joPlain=j=>/^JO-\d+$/.test(j.joNo||"")?0:1;
const _joCmp=(a,b)=>_joPlain(a)-_joPlain(b)
  ||String(a.created_at||"").localeCompare(String(b.created_at||""))
  ||String(a.joNo||"").localeCompare(String(b.joNo||""));
// Project progress is ONE number: the PM's 30 / 60 / 90 / 100 % estimate
// (project_cards.manual_progress, set only through set_project_progress,
// migration 20261107020000). Close-Out / Completed count as 100. null = not set.
// Department checkboxes no longer count (0 of 3,627 sub-tasks were ever ticked;
// the only ticks were Finance, auto-set when billing is fully paid).
export const projProgressPct=(pc,deal=null)=>{
  if(deal?.stage==="12 · Close-Out"||deal?.stage==="14 · Completed") return 100;
  const v=pc?.manualProgress;
  const n=v==null||v===""||isNaN(Number(v))?null:Number(v);
  // A project at Punchlist is at least 90 %, even before the PM picks it.
  if(deal?.stage==="11 · Punchlist") return Math.max(n||0,PUNCHLIST_MIN_PCT);
  return n;
};

// What a PO / WO line is for: the project code (JO, else CE no.) and the site.
// GMD stock and cost-center lines say so. The client and project name come
// from orderProject.
export const orderForLabel=(deal,jos,projectId)=>{
  if(projectId==="__gmd_stocks__") return "GMD warehouse stock";
  if(!deal) return "—";
  if(deal.isCostCenter) return "GMD internal";
  const jo=dealJo(jos,deal.id);
  const code=(jo&&(jo.joNo||jo.joNum))||deal.ceNo||"";
  return [code,deal.location||""].filter(Boolean).join(" · ")||"—";
};
// The project a PO line / WO is for, as printed on its PDF: client, project
// name, code and site (Paulo, 2026-11-28: suppliers
// and subcons should know whose project it is; this reverses the 2026-11-19
// "code + site only" rule). null for GMD stock / cost centers / no project.
export const orderProject=(deal,jos,projectId)=>{
  if(projectId==="__gmd_stocks__"||!deal||deal.isCostCenter) return null;
  const jo=dealJo(jos,deal.id);
  return{
    client:String(deal.client||"").trim(),
    project:String(deal.contact||deal.product||"").trim(),
    code:(jo&&(jo.joNo||jo.joNum))||deal.ceNo||"",
    site:String(deal.location||"").trim(),
  };
};
export const dealJo=(jos,dealId)=>{
  let best=null;
  for(const j of jos||[]) if(j.dealId===dealId&&j.status!=="Void"&&(!best||_joCmp(j,best)<0)) best=j;
  return best;
};
// Local JOs minus stale copies: a local row whose number the server already
// has under another id. trg_job_orders_adopt_auto hands an auto-issued JO
// over to the Award modal's JO by giving the row the modal's id, so a device
// that had the auto JO keeps its old id; never show or re-push that copy.
export const dropStaleJos=(serverJos,localJos)=>{
  const ids=new Set((serverJos||[]).map(j=>j.id));
  const nos=new Set((serverJos||[]).map(j=>j.joNo).filter(Boolean));
  return (localJos||[]).filter(j=>ids.has(j.id)||!j.joNo||!nos.has(j.joNo));
};

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
// A receivable settled without cash — e.g. Makerlab CE-2026-1242, paid by
// cancelling a debt GMD owed them under a credit note. It clears the invoice
// (balance, Fully Paid, AR) but is left out of every cash figure (cash flow,
// monthly collections, cash-in). Manager only, reference required — enforced by
// migration 20261020050000_billing_offset_manager_only.sql; keep in sync.
export const OFFSET_METHOD="Offset / Credit Note";
export const isOffsetPayment=(p)=>!!p&&(p.method??p.payment_method)===OFFSET_METHOD;
// Money that actually reached GMD: not bounced, not an offset.
export const isCashPayment=(p)=>!!p&&!p.bounced&&!isOffsetPayment(p);
// Who may enter a billing deduction: Managers (applied at once) plus the users
// below (Jessica, SalesOpsAdmin; Jerwin, FinanceAssistant — Paulo's decision),
// whose entry is only a request until another Manager approves it. Approving,
// rejecting and reversing stay Manager only. A non-Manager can't request one on
// a deal where they are the Sales Owner (pass the deal; see ownsDealCommission).
// Mirrors record_billing_deduction (migrations 20261022010000 /
// 20261115010000); keep the lists in sync.
export const DEDUCTION_USERS=["jessica","jerwin"];
export const canRecordDeduction=(role,username,deal,userName)=>{
  if(canonRole(role)==="Manager") return true;
  if(!DEDUCTION_USERS.includes(String(username||"").trim().toLowerCase())) return false;
  return !ownsDealCommission(deal,userName,role);
};
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

// A deal's contract BEFORE change orders. Approving a CO adds its signed value to
// deals.value (rollDealContract) and the CO is counted again on its own, so any
// figure that adds COs on top must start from this base, not deals.value. Derived
// from the approved COs themselves because the pre-CO value is never stored
// (the old client-only `originalValue` was lost on every reload, so the sales
// report counted each approved CO twice).
export const CO_ROLLED_STATUSES = ["Approved","Billed","Collected"];
export const dealBaseValue = (d, addenda = []) => {
  if (!d) return 0;
  const rolled = (addenda || []).filter(a => a && (a.dealId || a.projectId) === d.id && CO_ROLLED_STATUSES.includes(a.status))
    .reduce((s, a) => s + coSignedValue(a), 0);
  return Math.round(((Number(d.value) || 0) - rolled) * 100) / 100;
};

// A change order can be recorded two ways in FabHub — as an `addenda` record on a
// parent deal, OR as a linked child deal (parentDealId set). If the SAME change
// order is entered via both, its value is double-counted in awarded totals (the
// Kiko Milano case). Call this before committing a new CO of either kind: given
// the parent deal id and the CO value, it returns a human-readable warning if a
// same-value CO of EITHER mechanism already exists on that parent, else null.
// Matching is by parent + absolute value (COs on one parent rarely share an exact
// amount by coincidence); callers gate a save on it, they don't hard-block.
export const findCrossMechanismCO = ({ parentId, value, deals = [], addenda = [], excludeDealId = null, excludeAddendumId = null } = {}) => {
  const v = Math.abs(Number(value) || 0);
  if (!parentId || !v) return null;
  const childDup = deals.find(d =>
    d && d.id !== excludeDealId && d.parentDealId === parentId &&
    !isLostStage(d.stage) && Math.abs(Number(d.value) || 0) === v);
  if (childDup)
    return `A linked change-order deal for ₱${v.toLocaleString("en-PH")} already exists on this project ("${childDup.contact || childDup.client || childDup.ceNo || "CO"}"). Recording it again would double-count it in awarded value.`;
  const addDup = addenda.find(a =>
    a && a.id !== excludeAddendumId && (a.dealId === parentId || a.projectId === parentId) &&
    a.status !== "Rejected" && Math.abs(Number(a.value) || 0) === v);
  if (addDup)
    return `A change-order addendum for ₱${v.toLocaleString("en-PH")} already exists on this project ("${addDup.title || addDup.ceNo || "CO"}"). Recording it again would double-count it in awarded value.`;
  return null;
};

// Billing-side twin of findCrossMechanismCO. A legacy CO record bills through a
// "Change Order — <title>" milestone on the PARENT project (syncCoBilling); a
// linked addendum deal bills on its OWN project. billing_milestones has no co_id
// column, so the CO↔milestone link is lost on reload and the parent milestone
// can outlive its CO (the Filbars SMNE CO#1 case: CO converted, then undone and
// re-entered as a linked deal — the parent kept INV-1698 while the addendum
// project billed the same ₱804,720.07 again). Returns the parent's CO milestones
// that are either:
//   - "duplicate": same amount as an approved linked addendum deal (billed twice)
//   - "orphan":    no live (non-rejected) CO record on this project backs it
export const CO_MILESTONE_PREFIX = "Change Order — ";
export const isCoMilestone = (b) => !!(b && (b.coId || String(b.name || "").startsWith(CO_MILESTONE_PREFIX)));
export const coMilestoneMatches = (b, co) => !!(b && co && (b.coId
  ? b.coId === co.id
  : String(b.name || "") === CO_MILESTONE_PREFIX + (co.title || "Scope Change")));
export const isApprovedAddendumDeal = (d) => !!(d && d.parentDealId && !isLostStage(d.stage) &&
  (d.addendumStatus === "Approved" || (d.addendumStatus == null && WON_STAGES.includes(d.stage))));
export const findAddendumDoubleBilling = ({ dealId, billings = [], deals = [], addenda = [] } = {}) => {
  if (!dealId) return [];
  const children = deals.filter(d => d && d.parentDealId === dealId && isApprovedAddendumDeal(d));
  const cos = addenda.filter(a => a && (a.dealId || a.projectId) === dealId && a.status !== "Rejected");
  return billings
    .filter(b => b && b.dealId === dealId && b.status !== "Cancelled" && isCoMilestone(b))
    .map(b => {
      const amt = Math.abs(Number(b.amount) || 0);
      const child = children.find(c => Math.abs(Math.abs(Number(c.value) || 0) - amt) < 0.5);
      if (child) return { milestone: b, child, reason: "duplicate" };
      if (!cos.some(co => coMilestoneMatches(b, co))) return { milestone: b, child: null, reason: "orphan" };
      return null;
    })
    .filter(Boolean);
};

// ── Milestone builder ────────────────────────────────────────────────────────
// Staff type each milestone as name + % of the contract (no presets). Amounts
// are rounded to centavos; when the rows total exactly 100% the last row with a
// % absorbs the rounding remainder so the schedule foots to the contract.
export const NET_DAY_OPTIONS = [
  {label:"Upon receipt",days:0},{label:"Net 15",days:15},{label:"Net 30",days:30},
  {label:"Net 45",days:45},{label:"Net 60",days:60},
];
export const RETENTION_RELEASE_OPTIONS = [
  "Project Completion","COC Issued","6 Months After Completion","1 Year Warranty Period","Client Approval",
];
const _c2 = (v) => Math.round(v * 100) / 100;
export const MILESTONE_TYPES = ["Down payment","Progress","Final","Retention","Other"];
const _addDays = (iso, n) => { if (!iso) return ""; const d = new Date(String(iso).slice(0, 10) + "T00:00:00Z"); if (isNaN(d)) return ""; d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const RELEASE_OFFSET_DAYS = { "Project Completion": 0, "COC Issued": 0, "6 Months After Completion": 182, "1 Year Warranty Period": 365 };
// Default target billing date for a builder row, from the project schedule.
// ctx: {awardDate, stageDates:{Fabrication:{e},Delivery:{e},Installation:{e},Punchlist:{e}}}
// nth: 0-based index of this row among rows of the same type (Progress 1, 2, …).
// Returns {date, source}; date is "" when the schedule doesn't have the date yet
// — it never guesses, the hint says what to fill in on the project card.
export const defaultBillDate = (type, nth = 0, ctx = {}, release = "") => {
  const sd = ctx.stageDates || {};
  const punch = sd.Punchlist && sd.Punchlist.e;
  if (type === "Down payment") return ctx.awardDate ? { date: _addDays(ctx.awardDate, 3), source: "award date + 3 days" } : { date: "", source: "no award date on the project card" };
  if (type === "Progress") {
    const steps = [["Fabrication", "fabrication end"], ["Delivery", "delivery end"], ["Installation", "installation end"]];
    const avail = steps.filter(([k]) => sd[k] && sd[k].e);
    const pick = avail[Math.min(nth, avail.length - 1)];
    return pick ? { date: String(sd[pick[0]].e).slice(0, 10), source: pick[1] } : { date: "", source: "set fabrication end date on the project" };
  }
  if (type === "Final") return punch ? { date: String(punch).slice(0, 10), source: "punchlist sign-off" } : { date: "", source: "set punchlist end date on the project" };
  if (type === "Retention") {
    if (!release) return { date: "", source: "choose the release condition" };
    const off = RELEASE_OFFSET_DAYS[release];
    if (off == null) return { date: "", source: `set by hand (${release})` };
    return punch ? { date: _addDays(punch, off), source: off ? `punchlist sign-off + ${off} days` : "punchlist sign-off" } : { date: "", source: "set punchlist end date on the project" };
  }
  return { date: "", source: "set by hand" };
};
export const buildMilestoneSchedule = (contractVal, rows = []) => {
  const val = Number(contractVal) || 0;
  const pcts = rows.map(r => Number(r && r.pct) || 0);
  const pctTotal = _c2(pcts.reduce((a, b) => a + b, 0));
  const amounts = pcts.map(p => _c2(val * p / 100));
  let adjusted = -1;
  const lastIdx = pcts.reduce((li, p, i) => (p > 0 ? i : li), -1);
  if (pctTotal === 100 && lastIdx >= 0) {
    const rest = amounts.reduce((s, a, i) => (i === lastIdx ? s : s + a), 0);
    const fixed = _c2(val - rest);
    if (fixed !== amounts[lastIdx]) adjusted = lastIdx;
    amounts[lastIdx] = fixed;
  }
  const amountTotal = _c2(amounts.reduce((a, b) => a + b, 0));
  const active = rows.map((r, i) => ({ ...r, pct: pcts[i], amount: amounts[i] })).filter(r => r.pct > 0);
  const problems = [];
  if (!active.length) problems.push({ kind: "empty", msg: "Add each milestone and its % of the contract." });
  else if (pctTotal > 100) problems.push({ kind: "over", msg: `Over by ${_c2(pctTotal - 100)}% (₱${_c2(val * (pctTotal - 100) / 100).toLocaleString("en-PH", { minimumFractionDigits: 2 })}). This would over-bill the contract.` });
  else if (pctTotal < 100) problems.push({ kind: "under", msg: `${_c2(100 - pctTotal)}% not scheduled (₱${_c2(val - amountTotal).toLocaleString("en-PH", { minimumFractionDigits: 2 })} of the contract has no milestone yet).` });
  if (pcts.some(p => p < 0)) problems.push({ kind: "negative", msg: "A % can't be negative." });
  if (active.some(r => !String(r.name || "").trim())) problems.push({ kind: "name", msg: "Give every milestone a name. It prints on the invoice." });
  if (active.some(r => !r.type)) problems.push({ kind: "type", msg: "Choose a type for every milestone." });
  if (active.some(r => (r.retention || r.type === "Retention") && !r.release)) problems.push({ kind: "release", msg: "Choose when the retention is released." });
  return { amounts, pctTotal, amountTotal, adjusted, active, problems, ok: problems.length === 0 };
};
// Terms record derived from a built schedule, in the legacy {dp,progress,final,
// retention} shape the rest of the app reads (progress-claim retention,
// retention release, onboarding gate, chips), plus the exact rows.
export const termsFromSchedule = (active = [], netDays = null) => {
  const isRet = r => r.retention || r.type === "Retention";
  const sum = f => _c2(active.filter(f).reduce((s, r) => s + r.pct, 0));
  const ret = active.filter(isRet);
  return {
    dp: sum(r => r.type === "Down payment"), progress: sum(r => r.type === "Progress"),
    final: sum(r => r.type === "Final" || r.type === "Other"), retention: sum(isRet),
    retentionRelease: ret[0]?.release || "", netDays,
    schedule: active.map(r => ({ name: String(r.name).trim(), type: r.type || "", pct: r.pct, retention: isRet(r), release: isRet(r) ? r.release : "", plannedDate: r.plannedDate || "" })),
    notes: "",
  };
};
export const scheduleSummary = (terms) => {
  if (!terms) return "";
  const net = NET_DAY_OPTIONS.find(o => o.days === Number(terms.netDays));
  const rows = Array.isArray(terms.schedule) && terms.schedule.length
    ? terms.schedule.map(r => `${r.name} ${r.pct}%${r.retention && !/retention/i.test(r.name) ? " (retention)" : ""}`)
    : [["DP", terms.dp], ["Progress", terms.progress], ["Final", terms.final], ["Retention", terms.retention]].filter(([, p]) => Number(p) > 0).map(([l, p]) => `${l} ${p}%`);
  return rows.join(", ") + (net ? ` · ${net.label}` : "");
};

// ── Mother PO billing guards ─────────────────────────────────────────────────
// A standby PO (mother PO / Adhoc umbrella, e.g. Diageo CE-2026-1216) earns ₱0 on
// its own; its sub-projects carry the billing. Anything billed or collected on the
// mother PO is usually a copy of a sub-project's and double-counts Collected.
export const isMotherPO = (deal) => !!deal?.standbyPO;
// A deal "has a BOQ" exactly as the database counts it (boq_has_content(),
// migration 20261006010000): any items OR any sections. A deal can't become a
// mother PO while it has one (trg_deals_boq_guard), and only a Manager can clear
// one. BOQ Builder's Clear Draft, then Standby PO. Keep in sync.
export const dealHasBoq = (deal) => {
  const b = deal?.boqData || deal?.boq_data
  return !!(b && ((Array.isArray(b.items) && b.items.length) || (Array.isArray(b.sections) && b.sections.length)))
}
export const MOTHER_PO_BOQ_MSG = (ceNo) => `${ceNo||"This deal"} still has a BOQ, and a standby PO (mother PO) can't carry one. Make sure the BOQ is on its sub-project, then ask a Manager to clear this deal's BOQ in BOQ Builder (Clear Draft). Then tick Standby PO.`
// "NO DP = NO production": a PO or subcon work order can only be issued on a
// client deal once the client has paid something, or a Manager has waived the
// down payment (credit-term clients). A sub-project or addendum is clear when
// its parent deal is paid or waived; a mother PO once any sub-project is; internal
// GMD jobs and stock POs (no deal) are always clear. Enforced in the database
// by migrations 20261020110000 / 20261020110100 — keep in sync.
// Clients on credit terms skip the down-payment rule (client_credit_terms,
// migration 20261106020000; set by a Manager). The app loads the active names
// once and registers them here so every dealDpClear caller sees them.
let _creditTermClients = new Set();
const _ctKey = n => String(n || "").trim().toLowerCase();
export const setCreditTermClients = (names = []) => { _creditTermClients = new Set((names || []).map(_ctKey).filter(Boolean)); };
export const clientOnCreditTerms = name => !!_ctKey(name) && _creditTermClients.has(_ctKey(name));
// Mirrors deal_dp_clear() (migration 20261106020000): a sub-project of a
// mother PO (standby umbrella) is clear once the umbrella is, i.e. once any
// of its sub-projects is paid or waived.
const _paidOrWaived = d => !!(d && (d.dpWaivedAt || Number(d.amountPaid) > 0));
export const dealDpClear = (deal, deals = []) => {
  if (!deal) return true;
  if (/^GMD Production/i.test(deal.client || "")) return true;
  if (_paidOrWaived(deal) || clientOnCreditTerms(deal.client)) return true;
  const parent = deal.parentDealId && deals.find(d => d.id === deal.parentDealId);
  if (parent && (_paidOrWaived(parent) || clientOnCreditTerms(parent.client)
      || (parent.standbyPO && deals.some(s => s.parentDealId === parent.id && _paidOrWaived(s))))) return true;
  return !!deal.standbyPO && deals.some(c => c.parentDealId === deal.id && _paidOrWaived(c));
};
// The rule is a prompt on an awarded project (Paulo, 2026-11-27: "if a project is
// awarded we can start creating Work Orders and Purchase Orders; it is the job of
// the other departments to make sure we can fund / collect"). Not clear + awarded
// (the deal, or its parent for a sub-project) = whoever issues confirms and gives a
// reason (DP_OVERRIDE_MIN+ chars): logged and sent to management. Not awarded = still
// refused. Mirrors deal_dp_awarded() / po_require_dp() / swo_require_dp() and
// approve_po(po, reason) / sign_wo(id, reason), migration
// 20261128010000_dp_rule_prompt_on_awarded.sql. Keep in sync.
export const DP_OVERRIDE_MIN = 10;
export const dealDpAwarded = (deal, deals = []) => {
  if (!deal) return false;
  if (WON_STAGES.includes(deal.stage)) return true;
  const parent = deal.parentDealId && deals.find(d => d.id === deal.parentDealId);
  return !!(parent && WON_STAGES.includes(parent.stage));
};
// The prompt shown before issuing. Returns the reason (trimmed, DP_OVERRIDE_MIN+
// chars) or null when cancelled / too short. `ask` is uiPrompt.
export const askDpOverride = async (ask, { what, deal, amount, toast }) => {
  const label = `${deal?.ceNo || "this project"}${deal?.client ? " · " + deal.client : ""}`;
  const r = await ask(`The client hasn't paid anything yet on ${label}.\n\nIssue ${what} anyway? GMD fronts${amount ? " ₱" + Number(amount).toLocaleString("en-PH", { maximumFractionDigits: 2 }) : " the cost"} until the client pays. Management is told on Telegram so Sales / Finance can collect.\n\nReason (${DP_OVERRIDE_MIN}+ characters), e.g. "Client PO 4500123 received, pays 30 days after delivery":`, "");
  if (r == null) return null;
  const t = String(r).trim();
  if (t.length < DP_OVERRIDE_MIN) { toast && toast(`Not issued: give a reason of at least ${DP_OVERRIDE_MIN} characters.`, "error", 8000); return null; }
  return t;
};
export const DP_NOT_AWARDED_MSG = (deal) => `${deal?.ceNo || "This project"} is not awarded yet: no PO or work order is issued before award. Move the deal to Kickoff when it's won, or ask a Manager to waive the down payment.`;
// "No approved PRF = no project PO" (Paulo, 2026-11-22). From 1 Dec 2026 (Manila)
// a PO line on a client project is issued only when it comes from an approved PRF
// (prfLineId, set by the Order Board) or a Manager overrode the rule for that PO.
// Stock POs (no deal) and internal GMD jobs are exempt; lines created before
// 1 Dec are grandfathered. Enforced by migration 20261122020000_po_require_approved_prf.sql
// (po_require_prf / po_line_prf_gap / waive_po_prf) — keep in sync.
// Switched OFF the same day (Paulo, 2026-11-22: GMD split into Operations and
// back-end; Procurement orders from the QS-locked material budget, PRFs are only
// for special items). Migration 20261122030000_prf_rule_off.sql. It returns as
// "PRF line or locked material budget line" once QS budgets exist.
// Material budgets (phase 1, Paulo 2026-11-22): QS breaks each BOQ item into
// material lines; a PM confirms the list; QS locks it; Procurement orders from the
// locked revision. Statuses and editor roles mirror migration
// 20261122040000_material_budgets.sql (save/submit/confirm/return/lock/revise RPCs)
// — keep them in sync.
export const MB_STATUSES = ["Draft","For PM Review","PM Confirmed","Locked"];
export const MB_EDITOR_ROLES = ["QS","Manager"];
export const MB_STATUS_CLR = {"Draft":"#94a3b8","For PM Review":"#8b5cf6","PM Confirmed":"#0ea5e9","Locked":"#10b981"};
export const mbStatusLabel = b => !b ? "No budget"
  : b.status === "Locked" ? `Locked rev ${b.locked_rev || b.rev}`
  : b.locked_rev ? `${b.status} (rev ${b.rev}; ordering from rev ${b.locked_rev})` : b.status;
export const PRF_RULE_ON = false;
export const PRF_RULE_START = "2026-12-01";
const _manilaDay = (d = new Date()) => new Date(d.getTime() + 8 * 3600e3).toISOString().slice(0, 10);
export const prfRuleOn = (now = new Date()) => PRF_RULE_ON && _manilaDay(now) >= PRF_RULE_START;
// A not-yet-saved line (no createdAt) counts as created today.
export const poLineNeedsPrf = (line, deal) => {
  if (!line || !deal) return false;
  if (/^GMD Production/i.test(deal.client || "")) return false;
  if (line.prfLineId || line._prfLineId) return false;
  if (line.createdAt && _manilaDay(new Date(line.createdAt)) < PRF_RULE_START) return false;
  return true;
};
export const PRF_RULE_MSG = "No approved PRF for this project line. From 1 Dec a project PO is issued only from an approved PRF (create it from the Order Board), or a Manager overrides the rule for the PO with a reason";
const _familyRoot = (dealId, byId) => { const d = byId.get(dealId); return d?.parentDealId || dealId; };
// The same money already recorded in this contract family (the mother PO / main
// contract and everything linked under it): same amount to the centavo on the
// same received date, or the same non-empty reference no. Bounced payments are
// ignored. Pure — returns [{ milestone, payment, deal }].
export const findDuplicatePayments = ({ dealId, payment, billings = [], deals = [], excludePaymentId = null } = {}) => {
  if (!dealId || !payment) return [];
  const byId = new Map(deals.map(d => [d.id, d]));
  const root = _familyRoot(dealId, byId);
  const amt = _c2(Number(payment.amount) || 0);
  const date = String(payment.date || "");
  const ref = String(payment.refNo ?? payment.ref_no ?? "").trim().toUpperCase();
  const out = [];
  billings.forEach(m => {
    if (!m || m.status === "Cancelled" || _familyRoot(m.dealId, byId) !== root) return;
    (m.payments || []).forEach(p => {
      if (!p || p.bounced || (excludePaymentId && p.id === excludePaymentId)) return;
      const pRef = String(p.refNo ?? p.ref_no ?? "").trim().toUpperCase();
      const sameAmtDate = amt > 0 && Math.abs(_c2(Number(p.amount) || 0) - amt) < 0.005 && !!date && String(p.date || "") === date;
      if (sameAmtDate || (ref && pRef === ref)) out.push({ milestone: m, payment: p, deal: byId.get(m.dealId) || null });
    });
  });
  return out;
};

// ── No second copy of a client payment (2026-11-25) ─────────────────────────
// Mirrors billing_payment_overpay_guard (migration 20261125010000). Every
// double entry found that day had one copy with no reference (one person logs
// the payment without it, another the next day with the bank's). Keep in sync.
export const paymentNeedsRef = p => {
  const m = String(p?.method ?? p?.payment_method ?? "");
  return m !== "Cash" && m !== OFFSET_METHOD && String(p?.bank || "") !== "cash";
};
export const paymentRefOk = ref => String(ref || "").replace(/[^A-Za-z0-9]/g, "").length >= 4;
export const PAYMENT_REF_MSG = "Enter the cheque no. or bank transfer reference (at least 4 letters or digits). Two people recording the same deposit is caught by its reference; without one it isn't.";
const _dayNum = d => { const t = Date.parse(String(d || "").slice(0, 10)); return isNaN(t) ? null : Math.round(t / 86400000); };
// The other non-bounced payment on this invoice with the same amount, within
// 30 days, where either of the two has no reference. null when there is none.
export const nearDuplicatePayment = (ms, payment, excludePaymentId = null) => {
  if (!ms || !payment || payment.bounced) return null;
  const amt = Math.round((Number(payment.amount) || 0) * 100) / 100;
  if (!(amt > 0)) return null;
  const day = _dayNum(payment.date || payment.valueDate) ?? _dayNum(new Date().toISOString());
  const mineOk = paymentRefOk(payment.refNo ?? payment.ref_no);
  let best = null, bestGap = 99;
  (ms.payments || []).forEach(p => {
    if (!p || p.bounced || (excludePaymentId && p.id === excludePaymentId)) return;
    if (Math.abs((Number(p.amount) || 0) - amt) >= 0.005) return;
    const pd = _dayNum(p.date || p.valueDate);
    const gap = pd == null || day == null ? 0 : Math.abs(pd - day);
    if (gap > 30) return;
    if (mineOk && paymentRefOk(p.refNo ?? p.ref_no)) return;
    if (gap < bestGap) { best = p; bestGap = gap; }
  });
  return best;
};
export const nearDuplicateMsg = (ms, p) =>
  `${ms?.invoiceNo || ms?.name || "This invoice"} already has a payment of ₱${Number(p.amount || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })} on ${p.date || "—"} (ref ${String(p.refNo || "").trim() || "none"}, recorded by ${p.recordedBy || "unknown"}). This looks like the same payment recorded twice.`;

// ── Billing Check ────────────────────────────────────────────────────────────
// Project-level double-billing / integrity checks. Pure: pass the loaded deals,
// billings and addenda. Returns one issue per problem, most severe first.
//   over      — non-cancelled milestone bases exceed the contract (> ₱5 slack,
//               so legacy whole-peso rounding doesn't flood the list)
//   novalue   — milestones billed on a project with no contract value
//   dupinv    — the same invoice number on more than one milestone
//   dupms     — same name AND amount twice on one project (duplicate set)
//   coDouble  — change-order milestone duplicating an addendum / orphaned
//   tobill    — Draft still unsent 3+ days after its target billing date
//   centavo   — amount with more than 2 decimals
export const billingIntegrityIssues = ({ deals = [], billings = [], addenda = [], today = "" } = {}) => {
  const issues = [];
  const byId = new Map(deals.map(d => [d.id, d]));
  const live = billings.filter(b => b && b.status !== "Cancelled");
  const byDeal = new Map();
  live.forEach(b => { if (!byDeal.has(b.dealId)) byDeal.set(b.dealId, []); byDeal.get(b.dealId).push(b); });
  byDeal.forEach((ms, dealId) => {
    const d = byId.get(dealId); if (!d) return;
    const billed = _c2(ms.reduce((s, m) => s + (Number(m.amount) || 0), 0));
    const val = Number(d.value) || 0;
    if (val <= 0 && billed > 0) issues.push({ kind: "novalue", severity: "high", deal: d, amount: billed, msg: `₱${billed.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} billed but the project has no contract value — nothing to check it against.` });
    else if (billed - val > 5) issues.push({ kind: "over", severity: "high", deal: d, amount: _c2(billed - val), msg: `Billed ₱${billed.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} on a ₱${val.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} contract — ₱${_c2(billed - val).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} over.` });
    const seen = new Map();
    ms.forEach(m => { const k = String(m.name || "").trim().toLowerCase() + "|" + _c2(Number(m.amount) || 0); seen.set(k, (seen.get(k) || []).concat(m)); });
    seen.forEach(list => { if (list.length > 1) issues.push({ kind: "dupms", severity: "high", deal: d, milestones: list, msg: `"${list[0].name}" (₱${(Number(list[0].amount) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) appears ${list.length}× — ${list.map(x => x.invoiceNo || "no invoice no.").join(", ")}.` }); });
    findAddendumDoubleBilling({ dealId, billings, deals, addenda }).forEach(x => issues.push({
      kind: "coDouble", severity: "high", deal: d, milestones: [x.milestone],
      msg: x.reason === "duplicate"
        ? `${x.milestone.invoiceNo || x.milestone.name} bills a change order that addendum ${x.child.ceNo || x.child.contact || ""} already bills.`
        : `${x.milestone.invoiceNo || x.milestone.name} is a change-order milestone with no change order behind it.`,
    }));
    // Draft past its target billing date (only milestones with a planned date —
    // older Drafts' invoice_date is just the setup day and would flood this).
    if (today) ms.forEach(m => { if (m.status === "Draft" && m.plannedDate && _addDays(m.plannedDate, 3) < today) issues.push({ kind: "tobill", severity: "medium", deal: d, milestones: [m], msg: `${m.invoiceNo || m.name} (${m.name}) was due to be billed on ${m.plannedDate} and is still a Draft.` }); });
    ms.forEach(m => { const a = Number(m.amount) || 0; if (Math.abs(a * 100 - Math.round(a * 100)) > 1e-6) issues.push({ kind: "centavo", severity: "low", deal: d, milestones: [m], msg: `${m.invoiceNo || m.name}: ₱${a} has a fraction of a centavo — re-save it as ₱${_c2(a).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.` }); });
  });
  const inv = new Map();
  live.forEach(b => { const k = String(b.invoiceNo || "").trim().toUpperCase(); if (k) inv.set(k, (inv.get(k) || []).concat(b)); });
  inv.forEach((list, k) => {
    if (list.length < 2) return;
    const ces = [...new Set(list.map(b => byId.get(b.dealId)?.ceNo || "?"))];
    issues.push({ kind: "dupinv", severity: "high", deal: byId.get(list[0].dealId) || null, milestones: list, invoiceNo: k, msg: `${k} is used ${list.length}× (${ces.join(", ")}). Invoice numbers must be unique.` });
  });
  const rank = { high: 0, medium: 1, low: 2 };
  return issues.sort((a, b) => rank[a.severity] - rank[b.severity]);
};

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
  targetDays:dealData?.targetDays??null,           // Set by QS or Operations Director (or carried from the award notice)
  targetEndDate:dealData?.targetEndDate||null,     // Calculated: awardDate + targetDays
  tatCategory:dealData?.tatCategory||"",           // Project type used for reference
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
// {scheduleInBuilder:true} leaves out the two facts the Milestone Builder itself
// captures (payment terms and the down payment), so the gate only holds the
// builder for the client documents Finance must have first.
export const dealOnboardingGate=(deal,opts={})=>{
  const d=deal||{};
  const terms=d.paymentTerms||{};
  const dp=d.downpaymentPct??terms.dp;
  const checks=[
    {ok:!!d.signedCeOnFile||!!d.signedCeUrl, label:"Signed C.E. / client PO"},
    {ok:!!d.bir2303OnFile||!!d.bir2303Url, label:"BIR Form 2303 on file"},
    !opts.scheduleInBuilder&&{ok:!!(d.paymentTermsText||terms.netDays!=null&&terms.netDays!==""||terms.notes), label:"Payment terms"},
    {ok:!!d.vatTreatment,               label:"VAT treatment (incl./excl.)"},
    !opts.scheduleInBuilder&&{ok:dp!=null&&dp!==""&&Number(dp)>0, label:"Downpayment %"},
  ].filter(Boolean);
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
  {area:"Billing Check (double billing, duplicate invoice nos.)", freq:"Weekly", schedule:"Every Monday — Billing ▸ Billing Check", responsible:"Finance"},
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
  supplier:"", poNumber:"", poDate:"", paymentTerms:"", termsText:"",
  qtyDelivered:0, deliveryDate:"", deliveryNote:"",
  status:"Draft", requestedBy:"", approvedBy:"", approvedAt:"",
  budgetCategory:"Materials",  // which budget line this hits
  notes:"", createdDate:"",
});

// PO approval (2026-11-07, department audit): Cost Control (QS) approves a PO
// whose total is ₱150,000 or less, never one they requested; a Manager approves
// any amount (Paolo Gomez as Finance manager above ₱150,000). The Procurement
// Manager no longer approves POs. Total = qty × estimated unit cost over the PO's
// lines that aren't Cancelled. Mirrors po_line_approver_name() / po_require_approver()
// (migration 20261107010000). Work orders still use canApprovePO below.
export const PO_COST_CONTROL_LIMIT=150000;
export const poLinesTotal=lines=>(lines||[]).filter(l=>l.status!=="Cancelled")
  .reduce((s,l)=>s+(Number(l.qty)||0)*(Number(l.estUnitCost??l.estimatedCost)||0),0);
// Tiers (Paulo, 2026-11-09): Cost Control up to ₱150,000; a Manager below
// ₱250,000 (Paolo Gomez); ₱250,000 and above only Paulo, Mar or Arrius, who also
// check Paolo Gomez's approvals. Mirrors po_top_approver() / po_line_approver_name()
// (migration 20261114010000).
export const PO_MANAGER_LIMIT=250000;
export const PO_TOP_APPROVERS=["paulo garcia","mar mungcal","arrius catubay"];
export const isTopApprover=name=>PO_TOP_APPROVERS.includes(String(name||"").trim().toLowerCase());
// Switched on with migration 20261114010000 (weekend release). Until then any
// Manager approves any amount, as the database still does.
export const PO_TIERS_ON=true;
// Procurement Manager (Paulo, 2026-11-09; on with PO_TIERS_ON): Marian approves a PO
// requested by her team (not by her) up to ₱50,000, as long as everything ordered from
// that supplier on the PO's date is ₱50,000 or less (poSplitTotal), so one order can't
// be cut into small POs. The database also checks the requester is in Procurement.
// Mirrors po_split_total() / po_line_approver_name() (migration 20261114030000).
// Raised to ₱150,000 (same as Cost Control) on 2026-11-22 (procurement audit:
// she had approved no PO since her tier went live). Migration 20261123010000.
// REMOVED 2026-11-28 (Paulo): Cost Control approves POs, not the team that buys
// (and she had approved none in two weeks). 0 = no Procurement Manager tier.
// Migration 20261128080000_po_approval_cost_control_only.sql.
export const PO_PROC_MGR_LIMIT=0;
// Small POs (Paulo, 2026-11-22; migration 20261123010000): a PO of ₱10,000 or less,
// with everything ordered from that supplier that day ₱10,000 or less (poSplitTotal,
// so an order can't be cut into small POs), is issued by Procurement / the
// Procurement Manager / a Manager without a second person. approved_by reads
// "Auto ≤₱10K: <name>"; proc_mgr_po_approvals_alert lists them next morning.
// Mirrors po_require_approver(). 66% of POs in Oct-Nov 2026 were ₱10,000 or less.
export const PO_AUTO_ISSUE_LIMIT=10000;
export const PO_AUTO_ISSUE_ROLES=["Procurement","ProcurementManager","Manager"];
export const canAutoIssuePO=(role,total,split)=>PO_TIERS_ON&&PO_AUTO_ISSUE_ROLES.includes(role)
  &&split!=null&&(Number(total)||0)<=PO_AUTO_ISSUE_LIMIT&&Number(split)<=PO_AUTO_ISSUE_LIMIT;
// Same key as ap_vendor_key() in the database: first 8 letters/digits, lower case.
export const poVendorKey=v=>String(v||"").replace(/[^a-zA-Z0-9]/g,"").toLowerCase().slice(0,8);
const poLineDate=l=>l.poDate||String(l.createdAt||l.createdDate||"").slice(0,10);
// What was ordered from PO poNo's supplier on its date, across all POs (non-cancelled
// lines). null when the PO has no supplier: the Procurement Manager can't approve it.
export const poSplitTotal=(prs,poNo)=>{
  const f=(prs||[]).find(p=>p.poNumber===poNo); if(!f) return null;
  const k=poVendorKey(f.supplier), d=poLineDate(f); if(!k) return null;
  return poLinesTotal((prs||[]).filter(p=>p.poNumber&&poVendorKey(p.supplier)===k&&poLineDate(p)===d));
};
// The same for a PO being saved (not on the server yet, or edited): the supplier's
// other POs that day plus this PO's total. null with no supplier.
export const poSplitTotalFor=(prs,supplier,date,poNo,total)=>{
  const k=poVendorKey(supplier); if(!k) return null;
  const d=String(date||"").slice(0,10);
  return poLinesTotal((prs||[]).filter(p=>p.poNumber&&p.poNumber!==poNo&&poVendorKey(p.supplier)===k&&poLineDate(p)===d))+(Number(total)||0);
};
export const canApprovePOLine=(role,sessionName,requestedBy,total,split=null)=>{
  const t=Number(total)||0;
  const notMine=!requestedBy||!sessionName||sessionName.trim().toLowerCase()!==requestedBy.trim().toLowerCase();
  if(canAutoIssuePO(role,t,split)) return true;
  if(role==="Manager") return !PO_TIERS_ON||t<PO_MANAGER_LIMIT||isTopApprover(sessionName);
  if(role==="QS") return t<=PO_COST_CONTROL_LIMIT&&notMine;
  // No Procurement Manager tier since 2026-11-28: she issues only the ≤₱10K
  // POs every Procurement user may (canAutoIssuePO above).
  return false;
};
export const PO_APPROVER_MSG=PO_TIERS_ON?"POs of ₱10,000 or less (all of that supplier's POs that day) are issued by Procurement; Cost Control (Ardrin, Rodney) approves up to ₱150,000, Paolo Gomez up to ₱250,000, and Paulo, Mar or Arrius from ₱250,000":"Needs Cost Control (POs up to ₱150,000) or a Manager (above ₱150,000: Paolo Gomez)";

export const canApprovePO=(role,sessionName,requestedBy)=>{
  // Only a Manager or a Procurement Manager may approve (issue) a PO or subcon
  // work order, and a Procurement Manager never one they requested. Plain
  // Procurement can't: from 21 Oct 2026 they were approving each other's POs.
  // The database enforces the same rule (po_require_approver /
  // swo_require_approver, migration 20261027132908_po_require_approver): keep in sync.
  if(role==="Manager") return true;
  if(role==="ProcurementManager") return !requestedBy||!sessionName||sessionName.trim().toLowerCase()!==requestedBy.trim().toLowerCase();
  return false;
};

// Work orders: two signatures, no amount limit (Paulo, 2026-11-12; on with PO_TIERS_ON).
// 1) Cost Control: Rodney (username rodney) or the Procurement Manager (Marian);
// 2) Finance: Paolo Gomez (paolo), with Paulo and Mar as back-up; it issues the WO.
// Nobody signs both, nobody signs a WO they requested. Mirrors wo_signer_kind() /
// sign_wo() / swo_require_approver() (migration 20261114070000).
export const WO_FIN_SIGNERS=["paolo","paulo","mar"];
export const woSignerKind=(username,role)=>{
  const u=String(username||"").trim().toLowerCase();
  if(WO_FIN_SIGNERS.includes(u)) return "finance";
  if(u==="rodney"||role==="ProcurementManager") return "cc";
  return null;
};
// Which signature this user can give on WO w now: "cc", "finance" or null.
export const woSignStep=(w,username,role,name)=>{
  if(!w||!["Draft","Pending Approval"].includes(w.status||"")) return null;
  const nm=String(name||"").trim().toLowerCase();
  if(nm&&nm===String(w.requestedBy||"").trim().toLowerCase()) return null;
  const kind=woSignerKind(username,role);
  if(!w.ccApprovedBy) return kind==="cc"?"cc":null;
  return kind==="finance"&&nm!==String(w.ccApprovedBy).trim().toLowerCase()?"finance":null;
};
export const WO_SIGN_MSG="A work order needs Cost Control (Rodney or Marian), then Finance (Paolo Gomez) to sign it.";

export const woRetentionAmt=w=>Math.min(Number(w.retentionPct)||0,100)/100*(Number(w.contractAmount)||0);

// ── Accounts payable rules (company defaults) ─────────────────────────────────
// subconRetentionPct: the retention rate pre-filled on NEW Work Orders (decision
//   1 Oct 2026: retention applies only to WOs issued from then on, because older
//   WOs were signed at 0%). At payment time the WO's own rate is what's held —
//   FabHub never adds retention a signed WO doesn't carry. Released when
//   Operations verifies the work 100% complete. Downpayments are exempt.
// subconNoWoLimit: a subcontractor payable (PRV or AP) of this amount or more must
//   be linked to a Work Order, so Operations confirms the work before it's paid.
//   Hard block, no override (decision D3, Paulo, 9 Oct 2026). The database
//   enforces the same rule (migrations 20261009120000_subcon_payable_needs_wo.sql
//   and 20261012120000_subcon_no_wo_cumulative.sql): keep the limit, the window,
//   the account codes and the conditions in sync.
// subconNoWoWindowDays: the limit is also cumulative per subcontractor, so two
//   ₱49,000 requests in the same month can't split their way past it. All of one
//   subcontractor's no-WO payables created in the last N days (today included)
//   count toward the limit.
export const AP_RULES={subconRetentionPct:10,subconNoWoLimit:50000,subconNoWoWindowDays:30};
// 5070 Production - Subcon, 5100 Sub-Con Prof Fee, 5200 the old default that
// earlier code stamped on subcontractor payables (5200 is "Load Allowance" in
// the chart, so it is kept here only to recognise those older rows).
export const SUBCON_ACCOUNT_CODES=["5070","5100","5200"];
export const isSubconPayable=p=>!!p&&(p.category==="Subcontractor"||SUBCON_ACCOUNT_CODES.includes(String(p.accountCode||"")));
// Subcon down payment (migration 20261105170000_subcon_down_payment_allowance.sql):
// a Work Order's bills may be approved and paid up to dp % of its contract
// before any PM certification, but only once the WO is issued. Keep in sync
// with subcon_dp_allow_pct() and the "(\d+)% start|down|dp…" backfill there.
export const SUBCON_DP_STATUSES=["Issued","In Progress","Completed"];
export const SUBCON_DP_MAX_NON_MANAGER=50;
// "upon" counts only when it's about starting ("50% upon signing"), never
// "100% upon completion / delivery", which would let the whole contract be paid
// before any PM certification.
export const parseDpPct=text=>{const m=/(\d{1,3})\s*%\s*(start|down|dp|mobili|advance|upon\s+(?:signing|award|mobili|start|po\b|order|approval|confirm|issuance))/i.exec(String(text||""));return m?Math.min(100,Number(m[1])):0;};
// Payroll / salary WOs are billed after the work is done: no down payment, the
// PM certifies 100% instead (migration 20261105180000_subcon_payroll_wo_dp_zero.sql).
export const isPayrollScope=scope=>/(payroll|salary)/i.test(String(scope||""));
export const woDefaultDpPct=wo=>isPayrollScope(wo?.scopeOfWork)?0:parseDpPct(`${wo?.paymentStructure||""} ${wo?.paymentTerms||""}`);
export const subconDpAllowPct=wo=>wo&&SUBCON_DP_STATUSES.includes(wo.status)?(Number(wo.dpPct)||0):0;

// ── Supplier payment documents (Paulo, 2026-11-04) ───────────────────────────
// A supplier bill (category Supplier, not subcon) created from 2026-11-09 is
// paid only with an approved PO, a DR Warehouse logged against that PO, the
// supplier invoice no. + date + uploaded copy and the supplier TIN — and not
// before its due date (invoice date + the PO's terms; COD/blank = invoice
// date). A Manager can override a bill with a reason. Mirrors
// supplier_docs_check() in migration 20261104090100_supplier_payment_docs.sql,
// which the database enforces on every payment — keep them in sync.
export const SUPPLIER_DOCS_GOLIVE="2026-11-09T00:00:00+08:00";
export const termsDays=t=>{const m=String(t||"").match(/(\d+)/);return m?Number(m[1]):0;};
export const apVendorKey=v=>String(v||"").replace(/[^a-zA-Z0-9]/g,"").toLowerCase().slice(0,8);
const addDaysYmd=(ymd,n)=>{const d=new Date(ymd+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
export const supplierDocsStatus=(p,{prs=[],drs=[],suppliers=[]}={})=>{
  if(!p) return {applies:false,ok:true,missing:[],items:[]};
  const created=p.created_at||p.createdAt||"";
  const overridden=!!p.docs_override_at;
  const applies=(p.category||"")==="Supplier"&&!isSubconPayable(p)&&!!created
    &&new Date(created)>=new Date(SUPPLIER_DOCS_GOLIVE)&&!overridden;
  const po=String(p.poNumber||"").trim();
  const poLines=po?prs.filter(x=>x.poNumber===po):[];
  const poOk=poLines.some(x=>["PO Issued","Partially Delivered","Delivered"].includes(x.status));
  const dr=po?drs.filter(d=>d.poNumber===po&&String(d.drNo||"").trim()&&String(d.receivedBy||"").trim())
    .sort((a,b)=>String(b.drDate||"").localeCompare(String(a.drDate||"")))[0]:null;
  const supTin=suppliers.find(s=>apVendorKey(s.companyName||s.company_name)===apVendorKey(p.vendor)&&String(s.tinNo||s.tin_no||"").trim());
  const tin=String(p.tin||"").trim()||String(supTin?.tinNo||supTin?.tin_no||"").trim();
  const terms=(poLines.find(x=>String(x.paymentTerms||x.payment_terms||"").trim())||{});
  const termsLabel=String(terms.paymentTerms||terms.payment_terms||"").trim();
  const dueDate=p.dueDate||(p.invoiceDate?addDaysYmd(p.invoiceDate,termsDays(termsLabel)):"");
  const items=[
    {key:"po",     label:"Approved PO",            ok:poOk,                              detail:po?`${po}${poLines[0]?` · ${poLines[0].status}`:" · not found"}`:"No PO on this bill"},
    {key:"dr",     label:"Delivery Receipt",       ok:!!dr,                              detail:dr?`${dr.drNo} · received by ${dr.receivedBy}`:"Warehouse hasn't logged a DR for this PO"},
    {key:"invno",  label:"Invoice no.",            ok:!!String(p.invoiceNumber||"").trim(), detail:p.invoiceNumber||"—"},
    {key:"invdate",label:"Invoice date",           ok:!!p.invoiceDate,                   detail:p.invoiceDate||"—"},
    {key:"invdoc", label:"Invoice copy",           ok:!!String(p.invoice_doc_path||"").trim(), detail:p.invoice_doc_path?"Uploaded":"Not uploaded"},
    {key:"tin",    label:"Supplier TIN",           ok:!!tin,                             detail:tin||"Not on the bill or the supplier master"},
  ];
  const labelFor={po:"Approved PO",dr:"Delivery Receipt (logged by Warehouse)",invno:"Invoice no.",invdate:"Invoice date",invdoc:"Invoice copy",tin:"Supplier TIN"};
  const missing=items.filter(i=>!i.ok).map(i=>labelFor[i.key]);
  return {applies,overridden,ok:missing.length===0,missing,items,dueDate,terms:termsLabel,tin};
};
// Why a supplier payment dated payDate would be refused (null = allowed).
export const supplierPayBlock=(p,payDate,ctx)=>{
  const s=supplierDocsStatus(p,ctx);
  if(!s.applies) return null;
  if(!s.ok) return `${p.apNumber||p.vendor||"This bill"} is missing: ${s.missing.join(", ")}. A Manager can override with a reason.`;
  if(s.dueDate&&payDate&&payDate<s.dueDate) return `${p.apNumber||p.vendor||"This bill"} is not due until ${s.dueDate} (${s.terms||"invoice-date"} terms). A Manager can override with a reason.`;
  return null;
};
// D3: subcontractor payable at/above the limit with no Work Order linked.
export const subconNeedsWo=p=>isSubconPayable(p)&&!String(p.poNumber||"").trim()&&(Number(p.amount)||0)>=AP_RULES.subconNoWoLimit;
// Vendor names are free text: match them case- and spacing-insensitively.
export const vendorKey=v=>String(v||"").trim().replace(/\s+/g," ").toLowerCase();
const isSubconNoWo=p=>isSubconPayable(p)&&!String(p.poNumber||"").trim();
// D3 check for a save. Returns null when it may be saved, otherwise
// {total, others}: this payable plus the same subcontractor's other no-WO
// payables in the window reach the limit. An edit that keeps an existing no-WO
// payable's vendor and doesn't raise its amount is always allowed, so older
// rows can still be edited and paid. Mirrors the database trigger.
export const subconNoWoBlock=(next,prev,all,todayISO=today)=>{
  if(!isSubconNoWo(next)) return null;
  const amt=p=>Number(p&&p.amount)||0, key=vendorKey(next.vendor);
  if(prev&&isSubconNoWo(prev)&&amt(next)<=amt(prev)&&vendorKey(prev.vendor)===key) return null;
  const cutoff=addDaysISO(todayISO,-(AP_RULES.subconNoWoWindowDays-1));
  const skip=new Set([next.id,prev&&prev.id].filter(Boolean));
  const others=(all||[]).filter(p=>!skip.has(p.id)&&isSubconNoWo(p)&&vendorKey(p.vendor)===key&&(String(p.createdAt||"")||cutoff)>=cutoff).reduce((t,p)=>t+amt(p),0);
  const total=amt(next)+others;
  return total>=AP_RULES.subconNoWoLimit?{total,others}:null;
};
// Which retention rate applies to a subcontractor payable, and why. Only what
// the Work Order (or the bill itself) says — never a default on top of a signed WO.
export const payableRetentionPct=(p,wos=[])=>{
  const wo=(wos||[]).find(w=>w.woNumber&&p&&(w.woNumber===p.poId||w.woNumber===p.poNumber));
  if(wo){const woPct=Math.min(Math.max(Number(wo.retentionPct)||0,0),100);return {pct:woPct,source:`per ${wo.woNumber}`};}
  const own=Math.min(Math.max(Number(p?.retentionPct)||0,0),100);
  return {pct:own,source:own>0?"set on this bill":"no Work Order"};
};
// Gross value claimed so far on a payable: cash paid plus retention still held.
export const payableClaimed=p=>(Number(p?.paidAmount)||0)+(Number(p?.retentionHeld)||0);
// Recompute a payable's paid / retention / status from its payment rows. Mirrors
// the database trigger payable_payments_recompute (migration 20260930140000) so
// the screen updates at once, before the server's copy comes back.
export const recomputePayableFromPayments=(p,pays)=>{
  const mine=(pays||[]).filter(x=>x.payableId===p.id);
  if(!mine.length) return p; // no history rows yet: leave legacy figures alone
  const act=mine.filter(x=>x.status!=="Cancelled");
  const r2=v=>Math.round(v*100)/100;
  const cash=r2(act.reduce((s,x)=>s+(Number(x.amount)||0),0));
  const ret=act.filter(x=>x.kind!=="Retention release").reduce((s,x)=>s+(Number(x.retentionAmount)||0),0);
  const rel=act.filter(x=>x.kind==="Retention release").reduce((s,x)=>s+(Number(x.amount)||0),0);
  const latest=[...act].sort((a,b)=>String(b.payDate).localeCompare(String(a.payDate))||String(b.createdAt||"").localeCompare(String(a.createdAt||"")))[0];
  const amount=Number(p.amount)||0;
  const full=amount>0&&cash>=amount-0.005;
  return {...p,paidAmount:cash,retentionHeld:r2(Math.max(0,ret-rel)),
    status:full?"Paid":cash>0?"Partial":(p.status==="Check Issued"?"Check Issued":"Unpaid"),
    paidDate:full?(latest?.payDate||""):"",payBank:latest?.bank||"",payMethod:latest?.method||"",payRef:latest?.refNo||""};
};

export const SWO_STATUSES=["Draft","Pending Approval","Issued","In Progress","Completed","Cancelled"];
// Once a WO is issued its status only moves forward (or to Cancelled): the database
// keeps an issued WO from being moved back by a save (trg_swo_aa_issued_no_revert,
// migration 20261127010000). A Manager reopens one with the reopen_wo RPC. Keep in sync.
const WO_STATUS_RANK={"Issued":1,"In Progress":2,"Completed":3};
export const woStatusRank=s=>WO_STATUS_RANK[s]||0;
export const woStatusOptions=orig=>{
  const r=woStatusRank(orig);
  return r?SWO_STATUSES.filter(s=>s==="Cancelled"||s===orig||woStatusRank(s)>=r):SWO_STATUSES;
};

export const SWO_STATUS_CLR={Draft:"#94a3b8","Pending Approval":"#f59e0b",Issued:"#6366f1","In Progress":"#3b82f6",Completed:"#10b981",Cancelled:"#ef4444"};

export const emptySWO=()=>({subcontractor:"",projectId:"",projectName:"",woNumber:"",woDate:"",specialty:"",status:"Draft",startDate:"",targetEndDate:"",scopeOfWork:"",contractAmount:0,retentionPct:AP_RULES.subconRetentionPct,dpPct:"",paymentStructure:"",paymentTerms:"",notes:"",requestedBy:"",approvedBy:"",acctStatus:"",delivery:null});

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
  ceNo:"",ceType:"Fabrication / General",salesOwner:"",dateAcquired:today,temperature:null,
  // Addendum approval: null for standalone deals; "Pending"/"Approved" once a
  // parent deal is linked (see saveDeal + ContractBreakdown).
  addendumStatus:null,
  assignedAE:"",bizDevSource:"",leadOrigin:DEFAULT_LEAD_ORIGIN,location:"",
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

// ── Payroll in the Cash-Flow Forecast (Paulo, 2026-11-26) ──────────────────
// Salaries never become bills: they are paid straight from the Daily Cash
// Position, so the forecast learns them from it. Schedule (Paulo): office on
// the 5th and 20th, production every Saturday. The sheet also carries a weekly
// "PROJECT BASED PAYROLL" (~PHP 230-290K a week in Oct-Nov 2026, bigger than
// production), paid with production. Rows are found by their particulars as
// Finance types them ("OFFICE PAYROLL NOVEMBER 5, 2026", "PRODUCTION PAYROLL
// NOVEMBER 2026 WEEK 3", "PROJECT BASED PAYROLL ..."): a row worded otherwise
// is not seen unless it carries the cash sheet's 🔗 tag ("No bill: Payroll –
// office / production / project-based", NO_BILL_KINDS), which wins over the
// wording. Site payroll mixed with materials ("PAYROLL + OT + PARKING") is
// project cost paid case by case and is not forecast.
export const PAYROLL_STREAMS = [
  { key:"office", tag:"Payroll – office",       label:"Office payroll",        re:/office\s+payroll/i,             when:"semi" },
  { key:"production", tag:"Payroll – production",   label:"Production payroll",    re:/production\s+payroll/i,         when:"weekly" },
  { key:"projectBased", tag:"Payroll – project-based", label:"Project-based payroll", re:/project[\s-]*based\s+payroll/i, when:"weekly" },
];
// Monthly OPEX paid from the cash sheet, learned the same way (Paulo, 2026-11-27:
// "add rent and OPEX"). On 2026-11-27 the sheet's last 3 months held no office
// rent, electricity or internet row and FabHub held no bill for them, so rent and
// utilities are tag-only (the words "rent" / "water" / "electrical" there were
// truck rental, a water refilling station and site electricians). Government
// remittances are worded consistently ("SSS CONTRIBUTION OCTOBER 2026", "SSS
// LOAN …", "PHILHEALTH CONTRIBUTION …", "PAGIBIG CONTRIBUTION / LOAN …"), about
// PHP 370K a month; "SSS SICKNESS" (a benefit) is not a remittance.
export const OPEX_STREAMS = [
  { key:"sss",        tag:"Gov't – SSS",        label:"SSS remittance",        re:/\bsss\s+(contribution|loan)/i,       when:"monthly" },
  { key:"philhealth", tag:"Gov't – PhilHealth", label:"PhilHealth remittance", re:/phil\s*health\s+contribution/i,      when:"monthly" },
  { key:"pagibig",    tag:"Gov't – Pag-IBIG",   label:"Pag-IBIG remittance",   re:/pag-?\s*ibig\s+(contribution|loan)/i, when:"monthly" },
  { key:"rent",       tag:"Rent",               label:"Rent",                  re:null,                                  when:"monthly" },
  { key:"utilities",  tag:"Utilities",          label:"Utilities",             re:null,                                  when:"monthly" },
];
const _allStreams = () => [...PAYROLL_STREAMS, ...OPEX_STREAMS];
const _ymd = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const _dt = iso => new Date(String(iso).slice(0,10)+"T00:00:00");
// One pay event = the rows of one stream within a few days of each other
// (a payroll is sometimes split over two days or two banks).
export const payrollEvents = (cashPositions, stream) => {
  const rows = [];
  Object.values(cashPositions || {}).forEach(p => {
    if (!p || !p.date) return;
    (p.disbursements?.manual || []).forEach(r => {
      // The 🔗 tag decides when a row has a stream tag; otherwise the wording.
      const nb = String(r.noBill || "");
      if (_allStreams().some(x => x.tag === nb) ? nb !== stream.tag : !(stream.re && stream.re.test(String(r.particulars || "")))) return;
      const amt = Number(String(r.amount == null ? 0 : r.amount).replace(/,/g, "")) || 0;
      if (amt > 0) rows.push({ date: String(p.date).slice(0,10), amt });
    });
  });
  rows.sort((a, b) => a.date.localeCompare(b.date));
  const gap = stream.when === "weekly" ? 3 : 5, ev = [];
  rows.forEach(r => {
    const last = ev[ev.length - 1];
    if (last && (_dt(r.date) - _dt(last.last)) / 86400000 <= gap) { last.amt += r.amt; last.last = r.date; }
    else ev.push({ date: r.date, last: r.date, amt: r.amt });
  });
  return ev;
};
// Expected payroll payments after `todayIso` up to `untilIso`: the average of
// the stream's last 4 pay events in the 90 days before today, on its schedule.
// An occurrence already paid on the sheet (an event within the days before it)
// is skipped, so a payroll paid on Friday isn't counted again on Saturday.
export const payrollForecast = (cashPositions, todayIso, untilIso, streams = PAYROLL_STREAMS) => {
  const out = [], today = _dt(todayIso), until = _dt(untilIso);
  const from90 = _ymd(new Date(today.getTime() - 90 * 86400000));
  streams.forEach(s => {
    const ev = payrollEvents(cashPositions, s).filter(e => e.date >= from90 && e.date <= todayIso);
    if (!ev.length) return;
    const recent = ev.slice(-4), avg = Math.round(recent.reduce((t, e) => t + e.amt, 0) / recent.length);
    const dates = [];
    if (s.when === "weekly") {
      const d = new Date(today); d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7) - (today.getDay() === 6 ? 7 : 0));
      for (; d <= until; d.setDate(d.getDate() + 7)) dates.push(_ymd(d));
    } else if (s.when === "monthly") {
      // Same day of the month as the last payment (month length capped).
      const day = _dt(ev[ev.length - 1].last).getDate();
      for (let m = new Date(today.getFullYear(), today.getMonth(), 1); m <= until; m.setMonth(m.getMonth() + 1)) {
        const d = new Date(m.getFullYear(), m.getMonth(), Math.min(day, new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate()));
        if (d >= today && d <= until) dates.push(_ymd(d));
      }
    } else {
      for (let m = new Date(today.getFullYear(), today.getMonth(), 1); m <= until; m.setMonth(m.getMonth() + 1))
        [5, 20].forEach(day => { const d = new Date(m.getFullYear(), m.getMonth(), day); if (d >= today && d <= until) dates.push(_ymd(d)); });
    }
    const window = s.when === "weekly" ? 6 : s.when === "monthly" ? 20 : 10;
    dates.forEach(iso => {
      const lo = _ymd(new Date(_dt(iso).getTime() - window * 86400000));
      if (ev.some(e => e.last >= lo && e.last <= iso)) return; // already paid this round
      out.push({ date: iso, amt: avg, key: s.key, label: s.label, basis: recent.length });
    });
  });
  return out.sort((a, b) => a.date.localeCompare(b.date));
};

// ── Issued orders not yet billed, in the Cash-Flow Forecast (2026-11-27) ───
// An issued PO / Work Order is money GMD has committed before any bill exists.
// Counted: a PO with no bill at all, issued in the last ORDER_COMMIT_MAX_DAYS
// days, its total due on its payment terms from the PO date (COD = PO date,
// "N Days" = +N, blank = +30), never earlier than today; and an issued WO's
// contract not yet billed, spread over the next 4 weeks (subcon progress
// billings). Older POs with no bill are NOT counted: on 2026-11-27, 204 POs
// (PHP 3.5M) over 60 days old were Delivered with no bill and blank terms
// (paid outside AP before the cutover) and 75 (PHP 3.2M) were old backlog set
// to issued by the 2026-11-07 bulk approval. They are returned as `stale` for
// Procurement to bill, close or cancel. POs closed at the AP cutover are skipped.
export const ORDER_COMMIT_MAX_DAYS = 60;
const _termsDays = t => { const s = String(t || "").toLowerCase(); if (/cod|cash|upon/.test(s)) return 0; const m = s.match(/(\d+)/); return m ? +m[1] : 30; };
export const orderCommitments = (orders = [], todayIso) => {
  const today = _dt(todayIso), since = _ymd(new Date(today.getTime() - ORDER_COMMIT_MAX_DAYS * 86400000));
  const flows = [], stale = { n: 0, amt: 0 };
  (orders || []).forEach(o => {
    if (!o.issued) return;
    if (o.kind === "PO") {
      if ((o.bills || []).length) return;
      if ((o.items || []).some(i => String(i.deliveryNote || "").startsWith("Closed at AP cutover"))) return;
      const amt = Number(o.amount) || 0; if (!(amt > 1)) return;
      const d = String(o.date || "").slice(0, 10);
      if (!d || d < since) { stale.n++; stale.amt += amt; return; }
      const terms = (o.items || []).map(i => i.paymentTerms).find(Boolean) || "";
      let due = _ymd(new Date(_dt(d).getTime() + _termsDays(terms) * 86400000));
      if (due < todayIso) due = todayIso;
      flows.push({ date: due, amt, label: o.vendor || "Supplier", ref: `${o.no} · issued PO, no bill yet${terms ? "" : " (terms blank: 30 days)"}` });
    } else if (o.kind === "WO") {
      const left = (Number(o.amount) || 0) - (Number(o.billed) || 0);
      if (!(left > 1) || o.status === "Completed") return;
      for (let k = 1; k <= 4; k++) flows.push({ date: _ymd(new Date(today.getTime() + k * 7 * 86400000)), amt: Math.round(left / 4 * 100) / 100,
        label: o.vendor || "Subcontractor", ref: `${o.no} · WO not yet billed, ${k}/4 of ₱${Math.round(left).toLocaleString("en-PH")}` });
    }
  });
  stale.amt = Math.round(stale.amt);
  return { flows, stale };
};
