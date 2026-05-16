import { useState, useMemo, useEffect, useCallback, useRef } from "react";

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
];
const WON_STAGES    = ["06 · Project Kickoff","07 · Budget & Briefing","08 · Fabrication / Construction","09 · Site Visit & Progress Billing","10 · Installation","11 · Punchlist","12 · Project Close-Out","13 · Client Feedback"];
const ACTIVE_STAGES = ["01 · BizDev","02 · Client Engagement","03 · Design Request & Folder Setup","04 · Design & CE in Progress","05 · Client Approval / Revision"];
const PAULO_GATE    = ["05 · Client Approval / Revision","06 · Project Kickoff"];
const CE_TYPES      = ["Fabrication / General","Construction"];
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
const SALES_TEAM        = ["Paulo Garcia","Paolo Gomez","Gail De Ello","Jena De Asis","Wyn Celmar","Rodney (Cost Estimator)","Jerome Mendoza (Cost Estimator)"];
const COST_CONTROL_TEAM = ["Mar Garcia (Finance Manager)","Procurement Manager","Warehouse Manager"];
const OPS_TEAM          = ["Operations Director","Carlo M. (PM)","Dana R. (PM)","Enzo P. (Coordinator)","Faye T. (Coordinator)","Gino A. (Production)","Hana C. (Production)","Ivan L. (Production)","Jade O. (Production)"];
const DESIGN_MEMBERS    = ["Alex R.","Bea T.","Chris N.","Diana L.","Edric M.","Freelancer / Outsourced"];
const ALL_MEMBERS       = [...new Set([...SALES_TEAM,...COST_CONTROL_TEAM,...OPS_TEAM,...DESIGN_MEMBERS])];
const PROD_MEMBERS      = ALL_MEMBERS; // backward compat
const MAT_UNITS       = ["pcs","sheets","meters","kg","sets","rolls","liters","sqm"];
const EXP_CATS        = ["Materials","Labor","Overhead","Utilities","Rent","Transport","Marketing","Salaries","Subcontractor","Other"];
const SWATCH_CATS     = ["Fabric","Paint","Hardware","Wood","Metal","Glass","Laminate","Tile","Lighting","Fixture","Trim","Adhesive","Other"];
const SWATCH_STATUS   = ["To Buy","Ordered","Received"];
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
};
const PROD_CLR  = { Design:"#8b5cf6",Fabrication:"#f97316",QC:"#eab308",Delivery:"#10b981" };
const PAY_CLR   = { Unpaid:"#ef4444",Partial:"#f59e0b",Deposited:"#10b981",Paid:"#059669" };
const PRI_CLR   = { Normal:"#3b82f6",High:"#f59e0b",Urgent:"#ef4444" };
const DS_CLR    = { Briefing:"#94a3b8","On-going":"#3b82f6","First Pass":"#8b5cf6",Revision:"#f97316","Production Plans":"#eab308",Done:"#10b981" };
const SW_CLR    = { "To Buy":"#ef4444",Ordered:"#f59e0b",Received:"#10b981" };
const ROLE_CLR  = { Manager:"#f59e0b",Sales:"#10b981","Cost Control":"#3b82f6",Operations:"#f97316",Design:"#8b5cf6" };

const CL_TYPES  = ["Purchase","Supplier Job","Permit","Task","Site Visit","Client Approval","Module","Swatch","Risk Flag"];
const CL_STATUS = ["To Do","In Progress","Done"];
const CL_DEPT   = ["Operations","Design","Procurement","Sales","Finance","Management"];
const TYPE_ICON = { Purchase:"🛒","Supplier Job":"🏭",Permit:"📋",Task:"✅","Site Visit":"📍","Client Approval":"🤝",Module:"📦",Swatch:"🎨","Risk Flag":"⚠️" };
const TYPE_CLR  = { Purchase:"#f59e0b","Supplier Job":"#f97316",Permit:"#3b82f6",Task:"#8b5cf6","Site Visit":"#10b981","Client Approval":"#ec4899",Module:"#0ea5e9",Swatch:"#d946ef","Risk Flag":"#ef4444" };
const CS_CLR    = { "To Do":"#94a3b8","In Progress":"#f59e0b",Done:"#10b981" };

const fmt   = n => "₱" + Number(n||0).toLocaleString("en-PH",{minimumFractionDigits:0});
const fmtK  = n => n>=1000000?"₱"+(n/1000000).toFixed(1)+"M":n>=1000?"₱"+(n/1000).toFixed(0)+"k":"₱"+(n||0);
const today = new Date().toISOString().split("T")[0];
const todayL= new Date().toLocaleDateString("en-PH",{year:"numeric",month:"long",day:"numeric"});
let _id=500; const uid=()=>String(++_id);

const KEYS={deals:"gmdv5:deals",projects:"gmdv5:projects",expenses:"gmdv5:expenses",inflows:"gmdv5:inflows",jos:"gmdv5:jos",swatches:"gmdv5:swatches",checklist:"gmdv5:checklist",role:"gmdv5:role",users:"gmdv5:users",session:"gmdv5:session",cashPos:"gmdv5:cashPos"};

// ─── GMD BANKS & CASH POSITION ───────────────────────────────────────────────
const BANKS = [
  { id:"bpi",      name:"Bank of Philippine Island",  short:"BPI",        color:"#dc2626" },
  { id:"metro",    name:"Metrobank",                  short:"Metrobank",   color:"#1d4ed8" },
  { id:"china",    name:"Chinabank",                  short:"Chinabank",   color:"#15803d" },
  { id:"bdo",      name:"Banco de Oro",               short:"BDO",         color:"#b45309" },
  { id:"security", name:"Security Bank",              short:"Security",    color:"#7c3aed" },
  { id:"union",    name:"Unionbank of the Philippines",short:"Unionbank",  color:"#0e7490" },
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
  { id:"u1", name:"Paulo Garcia",  username:"paulo",   passwordHash:hashPw("GMD2026!"),      role:"Manager",      status:"active", createdAt:today },
  { id:"u2", name:"Mar Garcia",    username:"mar",     passwordHash:hashPw("GMD2026!"),      role:"Cost Control", status:"active", createdAt:today },
  { id:"u3", name:"Paolo Gomez",   username:"paolo",   passwordHash:hashPw("Sales2026!"),    role:"Sales",        status:"active", createdAt:today },
  { id:"u4", name:"Gail De Ello",  username:"gail",    passwordHash:hashPw("Sales2026!"),    role:"Sales",        status:"active", createdAt:today },
  { id:"u5", name:"Jena De Asis",  username:"jena",    passwordHash:hashPw("Sales2026!"),    role:"Sales",        status:"active", createdAt:today },
  { id:"u6", name:"Wyn Celmar",    username:"wyn",     passwordHash:hashPw("Sales2026!"),    role:"Sales",        status:"active", createdAt:today },
  { id:"u7", name:"Rodney",        username:"rodney",  passwordHash:hashPw("GMD2026!"),      role:"Sales",        status:"active", createdAt:today },
];

// ─── SEED DATA ────────────────────────────────────────────────────────────────
const mkDesign=(status="Briefing",designer="",type="in-house",dueDate="",link="",notes="")=>({
  status,designer,designerType:type,dueDate,link,notes,
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
  // Design Request
  designRequestDate:"",designRequestNote:"",designApprovalDate:"",
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
        <div style={{gridColumn:"1/-1"}}>
          <Fld label="Client Name" required hint="Start typing to search from your 207 GMD clients">
            <ClientAutocomplete value={form.client} onChange={v=>f("client",v)}/>
          </Fld>
        </div>
        <Fld label="Contact Person"><Inp value={form.contact} onChange={e=>f("contact",e.target.value)} placeholder="Full name"/></Fld>
        <Fld label="Deal Value (₱)" required><Inp type="number" value={form.value} onChange={e=>f("value",e.target.value)}/></Fld>
        <Fld label="Product Type"><Sel value={form.product} onChange={e=>f("product",e.target.value)}>{PRODUCT_TYPES.map(t=><option key={t}>{t}</option>)}</Sel></Fld>
        <Fld label="Stage"><Sel value={form.stage} onChange={e=>e=>{f("stage",e.target.value);f("probability",e.target.value==="Won"?100:e.target.value==="Lost"?0:form.probability);}}>{DEAL_STAGES.map(s=><option key={s}>{s}</option>)}</Sel></Fld>
        <Fld label="Priority"><Sel value={form.priority} onChange={e=>f("priority",e.target.value)}>{PRIORITIES.map(p=><option key={p}>{p}</option>)}</Sel></Fld>
        <Fld label="Follow-up Date"><Inp type="date" value={form.followUp} onChange={e=>f("followUp",e.target.value)}/></Fld>
        <div style={{gridColumn:"1/-1"}}><Fld label="Notes"><Inp rows={2} value={form.notes} onChange={e=>f("notes",e.target.value)} placeholder="Any relevant notes…"/></Fld></div>
      </div>
      {/* GMD Workflow Fields */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginTop:4}}>
        <Fld label="Sales Owner / AE">
          <Sel value={form.salesOwner||""} onChange={e=>f("salesOwner",e.target.value)}>
            <option value="">— Assign AE —</option>
            {SALES_TEAM.map(m=><option key={m}>{m}</option>)}
          </Sel>
        </Fld>
        <Fld label="BizDev Source" hint="Who found this client?">
          <Inp value={form.bizDevSource||""} onChange={e=>f("bizDevSource",e.target.value)} placeholder="e.g. Paulo referral, cold outreach"/>
        </Fld>
        <Fld label="Date Acquired"><Inp type="date" value={form.dateAcquired||today} onChange={e=>f("dateAcquired",e.target.value)}/></Fld>
        <Fld label="CE Number"><Inp value={form.ceNo||""} onChange={e=>f("ceNo",e.target.value)} placeholder="CE-2026-005"/></Fld>
        <Fld label="CE Type">
          <Sel value={form.ceType||"Fabrication / General"} onChange={e=>f("ceType",e.target.value)}>
            {CE_TYPES.map(t=><option key={t}>{t}</option>)}
          </Sel>
        </Fld>
        <Fld label="Discount %" hint="Paulo sets this only">
          <Inp type="number" min={0} max={100} value={form.discount||0} onChange={e=>f("discount",e.target.value)}/>
        </Fld>
      </div>

      {/* Sales Repository + Proposal Folder */}
      <div style={{background:"#f8fafc",borderRadius:12,padding:"14px 16px",marginTop:8,border:"1.5px solid #e2e8f0"}}>
        <div style={{fontWeight:700,color:"#0f172a",fontSize:".85rem",marginBottom:12}}>📁 Sales Repository</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <Fld label="Sales Repository Link (Google Drive)" hint="Main folder for all project info, plans, and files">
            <Inp type="url" value={form.salesRepoLink||""} onChange={e=>f("salesRepoLink",e.target.value)} placeholder="https://drive.google.com/…"/>
          </Fld>
          <Fld label="Proposal Folder Link" hint="CE + budget live here — inside Sales Repository">
            <Inp type="url" value={form.proposalFolderLink||""} onChange={e=>f("proposalFolderLink",e.target.value)} placeholder="https://drive.google.com/…"/>
          </Fld>
          <Fld label="Repository Notes" hint="e.g. folder name, what's inside">
            <Inp value={form.salesRepoNote||""} onChange={e=>f("salesRepoNote",e.target.value)} placeholder="e.g. SM Megamall ABC Retail — all plans uploaded"/>
          </Fld>
          <Fld label="Comms Group" hint="WhatsApp or Viber group with client + team">
            <Sel value={form.commsGroup||""} onChange={e=>f("commsGroup",e.target.value)}>
              <option value="">— Not yet created —</option>
              <option>WhatsApp</option><option>Viber</option><option>Both</option>
            </Sel>
          </Fld>
        </div>
      </div>

      {/* Design Request */}
      {["03 · Design Request & Folder Setup","04 · Design & CE in Progress","05 · Client Approval / Revision"].includes(form.stage)&&(
        <div style={{background:"#faf5ff",borderRadius:12,padding:"14px 16px",marginTop:8,border:"1.5px solid #ddd6fe"}}>
          <div style={{fontWeight:700,color:"#6d28d9",fontSize:".85rem",marginBottom:12}}>🎨 Design Request</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <Fld label="Design Request Date"><Inp type="date" value={form.designRequestDate||""} onChange={e=>f("designRequestDate",e.target.value)}/></Fld>
            <Fld label="Design Approval Date"><Inp type="date" value={form.designApprovalDate||""} onChange={e=>f("designApprovalDate",e.target.value)}/></Fld>
            <div style={{gridColumn:"1/-1"}}><Fld label="Design Request Notes"><Inp rows={2} value={form.designRequestNote||""} onChange={e=>f("designRequestNote",e.target.value)} placeholder="Scope, specs, client references, revision notes…"/></Fld></div>
          </div>
        </div>
      )}
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
    <Modal open={open} onClose={onClose} title={editId?"Edit Expense":"Log Expense"}>
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
  const[users,      setUsers]     = useState(DEFAULT_USERS);
  const[cashPositions,setCashPos]  = useState({});  // keyed by date string
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

  useEffect(()=>{
    try{
      const u=localStorage.getItem(KEYS.users);    if(u) setUsers(JSON.parse(u));
      const cp=localStorage.getItem(KEYS.cashPos);  if(cp) setCashPos(JSON.parse(cp));
      const s=localStorage.getItem(KEYS.session); if(s){ const sess=JSON.parse(s); setSession(sess); setRole(sess.role); }
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

  const upUsers    =useCallback(fn=>setUsers(p=>{const n=fn(p);persist(KEYS.users,n);return n;}),[persist]);
  const upCashPos  =useCallback(fn=>setCashPos(p=>{const n=fn(p);persist(KEYS.cashPos,n);return n;}),[persist]);
  const saveDayPos =(date,pos)=>upCashPos(cp=>({...cp,[date]:{...pos,savedAt:new Date().toISOString()}}));
  const upDeals    =useCallback(fn=>setDeals(p=>{const n=fn(p);persist(KEYS.deals,n);return n;}),[persist]);
  const upProjs    =useCallback(fn=>setProjs(p=>{const n=fn(p);persist(KEYS.projects,n);return n;}),[persist]);
  const upExps     =useCallback(fn=>setExps(p=>{const n=fn(p);persist(KEYS.expenses,n);return n;}),[persist]);
  const upInfs     =useCallback(fn=>setInfs(p=>{const n=fn(p);persist(KEYS.inflows,n);return n;}),[persist]);
  const upJos      =useCallback(fn=>setJos(p=>{const n=fn(p);persist(KEYS.jos,n);return n;}),[persist]);
  const upSwatches =useCallback(fn=>setSwatches(p=>{const n=fn(p);persist(KEYS.swatches,n);return n;}),[persist]);
  const upChecklist=useCallback(fn=>setChecklist(p=>{const n=fn(p);persist(KEYS.checklist,n);return n;}),[persist]);

  // ── PM Update + Addendum helpers ─────────────────────────────────────────
  // ── Proactive Checklist Template Auto-Load ──────────────────────────────────
  const loadChecklistTemplate=(dealId,clientName)=>{
    // Only load if no checklist items exist for this project yet
    const existing=checklist.filter(c=>c.projectId===dealId);
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
  };
  const addAddendum=(dealId,title,desc,requestedBy)=>{
    const entry={id:uid(),title,desc,requestedBy,date:today,status:"Pending",notifiedSales:false,notifiedOps:false};
    upDeals(ds=>ds.map(d=>d.id===dealId?{...d,addenda:[entry,...(d.addenda||[])]}:d));
    upProj(dealId,p=>({...p,addenda:[entry,...(p.addenda||[])]}));
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

  // ── AI Devil's Advocate ────────────────────────────────────────────────────
  const openAI = (context) => { setAiCtx(context); setAiOpen(true); };

  // ── Auth helpers ───────────────────────────────────────────────────────────
  const login=(username,password)=>{
    const u=users.find(x=>x.username.toLowerCase()===username.toLowerCase().trim());
    if(!u) return "Username not found.";
    if(u.status==="pending") return "Your account is pending approval by a Manager.";
    if(u.status==="inactive") return "Your account has been deactivated. Contact Paulo.";
    if(!checkPw(password,u.passwordHash)) return "Incorrect password.";
    const sess={userId:u.id,username:u.username,name:u.name,role:u.role};
    setSession(sess); setRole(u.role);
    localStorage.setItem(KEYS.session,JSON.stringify(sess));
    localStorage.setItem(KEYS.role,u.role);
    return null; // null = success
  };
  const logout=()=>{
    setSession(null); setRole(null); setAuthView("login");
    localStorage.removeItem(KEYS.session); localStorage.removeItem(KEYS.role);
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
  const[matForm,   setMatForm]  =useState({name:"",qty:"",unit:"pcs",cost:"",received:false});
  const[editMat,   setEditMat]  =useState(null);
  const[swModal,   setSwModal]  =useState(false);
  const[swForm,    setSwForm]   =useState({projectId:null,name:"",category:"Fabric",qty:"",unit:"pcs",supplier:"",estCost:"",swatchLink:"",addedBy:"Design",status:"To Buy",notes:""});
  const[editSw,    setEditSw]   =useState(null);
  const[designModal,setDesignModal]=useState(false);
  const[designForm, setDesignForm] =useState({});
  const[confirmDel, setConfirmDel] =useState(null);
  const[page,       setPage]       =useState("home");
  const[aiOpen,     setAiOpen]     =useState(false);
  const[aiCtx,      setAiCtx]      =useState(null);   // context object passed to AI
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
    if(dealForm.stage==="06 · Project Kickoff"&&!editDeal) setTimeout(()=>loadChecklistTemplate(rec.id,rec.client),200);
    upDeals(ds=>editDeal?ds.map(d=>d.id===editDeal?rec:d):[...ds,rec]);
    setDealModal(false);
  };
  const delDeal=id=>{upDeals(ds=>ds.filter(d=>d.id!==id));upProjs(ps=>{const n={...ps};delete n[id];return n;});setConfirmDel(null);};

  const updatePayment=(id,key,val)=>upDeals(ds=>ds.map(d=>d.id===id?{...d,[key]:val}:d));

  const stageQ=(id,st)=>{
    if(WON_STAGES.includes(st)&&!projs[id]) upProjs(ps=>({...ps,[id]:emptyProject()}));
    if(st==="06 · Project Kickoff") setTimeout(()=>loadChecklistTemplate(id, deals.find(d=>d.id===id)?.client||""),150);
    upDeals(ds=>ds.map(d=>d.id===id?{...d,stage:st,probability:WON_STAGES.includes(st)?100:st==="Cancelled"?0:d.probability}:d));
  };
  const payQ=(id,ps)=>upDeals(ds=>ds.map(d=>d.id===id?{...d,paymentStatus:ps}:d));
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
  if(!session) return <AuthScreen authView={authView} setAuthView={setAuthView} onLogin={login} onRegister={register}/>;

  // ── SHARED NAV ────────────────────────────────────────────────────────────
  const roleColor=ROLE_CLR[role];
  const navMap={
    Manager:      [{id:"home",l:"Dashboard"},{id:"pipeline",l:"Pipeline"},{id:"finance",l:"Finance"},{id:"ops",l:"Operations"},{id:"checklist",l:"Checklist"},{id:"procurement",l:"Procurement"},{id:"joborders",l:"Job Orders"},{id:"clients",l:"🏢 Clients"},{id:"accounts",l:"👥 Accounts"}],
    Sales:        [{id:"home",l:"My Pipeline"},{id:"collections",l:"Collections"},{id:"checklist",l:"Checklist"},{id:"joborders",l:"Job Orders"},{id:"clients",l:"🏢 Clients"}],
    "Cost Control":[{id:"home",l:"Overview"},{id:"collections",l:"Collections"},{id:"expenses",l:"Expenses"},{id:"checklist",l:"Checklist"},{id:"clients",l:"🏢 Clients"}],
    Operations:   [{id:"home",l:"Projects"},{id:"checklist",l:"Checklist"},{id:"procurement",l:"Swatchboard"}],
    Design:       [{id:"home",l:"Projects"},{id:"checklist",l:"Checklist"},{id:"procurement",l:"Swatchboard"}],
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
        {role==="Manager"&&users.filter(u=>u.status==="pending").length>0&&(
          <button onClick={()=>setPage("accounts")} style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:20,padding:"2px 10px",fontSize:".68rem",fontWeight:700,color:"#dc2626",cursor:"pointer",fontFamily:"inherit"}}>
            {users.filter(u=>u.status==="pending").length} pending
          </button>
        )}
        <div style={{background:roleColor+"18",borderRadius:20,padding:"3px 11px",fontSize:".72rem",fontWeight:700,color:roleColor,border:`1px solid ${roleColor}33`}}>
          {session?.name?.split(" ")[0]} · {role}
        </div>
        <button onClick={logout} style={{background:"transparent",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"4px 10px",fontSize:".72rem",color:"#64748b",cursor:"pointer",fontFamily:"inherit"}}>Log out</button>
      </div>
    </nav>
  );
  const Wrap=({children})=>(
    <div style={{minHeight:"100vh",background:"#f8fafc",fontFamily:"'Segoe UI',sans-serif"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800&display=swap'); *{box-sizing:border-box;} input:focus,select:focus,textarea:focus{outline:none;border-color:${roleColor}!important;box-shadow:0 0 0 3px ${roleColor}22!important;} @keyframes fi{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}} .fi{animation:fi .2s ease;} @media print{.noprint{display:none!important;}}`}</style>
      <Nav/>
      <div style={{maxWidth:1100,margin:"0 auto",padding:"22px 18px"}} className="fi">{children}</div>
      {/* ── GMD AI Devil's Advocate ── */}
      {/* Floating trigger button */}
      <button onClick={()=>openAI({type:"general",page,role,deals,exps,wonDeals:deals.filter(d=>WON_STAGES.includes(d.stage)),projList:deals.filter(d=>WON_STAGES.includes(d.stage)&&projs[d.id])})}
        style={{position:"fixed",bottom:24,right:24,width:52,height:52,borderRadius:"50%",background:"#1a1a2e",border:"2px solid #f59e0b",boxShadow:"0 4px 20px rgba(0,0,0,.3)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.3rem",zIndex:500,transition:"all .2s"}}
        onMouseEnter={e=>{e.currentTarget.style.transform="scale(1.1)";e.currentTarget.style.boxShadow="0 6px 28px rgba(245,158,11,.4)";}}
        onMouseLeave={e=>{e.currentTarget.style.transform="scale(1)";e.currentTarget.style.boxShadow="0 4px 20px rgba(0,0,0,.3)";}}>
        🤔
      </button>
      {/* AI Panel */}
      {aiOpen&&<AIAdvisor ctx={aiCtx} role={role} session={session} onClose={()=>setAiOpen(false)} deals={deals} projs={projs} exps={exps} infs={infs} checklist={checklist} wonDeals={deals.filter(d=>WON_STAGES.includes(d.stage))}/>}

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
                <div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap",alignItems:"center"}}>
                  {d.ceNo&&<span style={{fontSize:".68rem",color:"#64748b",background:"#f1f5f9",padding:"1px 8px",borderRadius:5}}>{d.ceNo}</span>}
                  {d.ceType&&<span style={{fontSize:".68rem",color:d.ceType==="Construction"?"#3b82f6":"#8b5cf6",background:d.ceType==="Construction"?"#eff6ff":"#faf5ff",padding:"1px 8px",borderRadius:5}}>{d.ceType}</span>}
                  {d.salesOwner&&<span style={{fontSize:".68rem",color:"#64748b"}}>👤 {d.salesOwner}</span>}
                  {d.salesRepoLink&&<a href={d.salesRepoLink} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} style={{fontSize:".68rem",color:"#3b82f6",textDecoration:"none",background:"#eff6ff",padding:"1px 8px",borderRadius:5}}>📁 Repo</a>}
                  {d.proposalFolderLink&&<a href={d.proposalFolderLink} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} style={{fontSize:".68rem",color:"#6d28d9",textDecoration:"none",background:"#faf5ff",padding:"1px 8px",borderRadius:5}}>📋 Proposal</a>}
                  {d.commsGroup&&<span style={{fontSize:".68rem",color:"#059669",background:"#f0fdf4",padding:"1px 8px",borderRadius:5}}>💬 {d.commsGroup}</span>}
                  {PAULO_GATE.includes(d.stage)&&<span style={{fontSize:".68rem",color:"#d97706",background:"#fffbeb",padding:"1px 8px",borderRadius:5,fontWeight:700}}>⚠ Paulo Gate</span>}
                  {Number(d.value)>=3000000&&<span style={{fontSize:".68rem",color:"#dc2626",background:"#fef2f2",padding:"1px 8px",borderRadius:5,fontWeight:700}}>🚨 ₱3M+</span>}
                  {STAGE_OWNER[d.stage]&&<span style={{fontSize:".65rem",color:"#94a3b8"}}>Owner: {STAGE_OWNER[d.stage]}</span>}
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
    if(page==="ops") return <OpsView projs={projs} projList={projList} deals={deals} selProj={selProj} setSelProj={setSelProj} opsTab={opsTab} setOpsTab={setOpsTab} proj={proj} projDeal={projDeal} upProj={upProj} overallProg={overallProg} costOf={costOf} marginOf={marginOf} openDesignEdit={openDesignEdit} swatches={swatches} swQ={swQ} openAddSwatch={(pid,by)=>{setSwForm({projectId:pid,name:"",category:"Fabric",qty:"",unit:"pcs",supplier:"",estCost:"",swatchLink:"",addedBy:by||"Ops",status:"To Buy",notes:""});setEditSw(null);setSwModal(true);}} openEditSwatch={sw=>{setSwForm({...sw});setEditSw(sw.id);setSwModal(true);}} delSwatch={id=>upSwatches(ss=>ss.filter(s=>s.id!==id))} exps={exps} openAddExp={openAddExp} openEditExp={openEditExp} delExp={delExp} clientName={clientName} matModal={matModal} setMatModal={setMatModal} matForm={matForm} setMatForm={setMatForm} editMat={editMat} setEditMat={setEditMat} saveMat={()=>{if(!matForm.name||!matForm.qty||!matForm.cost)return;const rec={...matForm,qty:Number(matForm.qty),cost:Number(matForm.cost),id:editMat||uid()};upProj(selProj,p=>({...p,materials:editMat?p.materials.map(m=>m.id===editMat?rec:m):[...p.materials,rec]}));setMatModal(false);setEditMat(null);setMatForm({name:"",qty:"",unit:"pcs",cost:"",received:false});}} addPmUpdate={addPmUpdate} addAddendum={addAddendum} updateAddendumStatus={updateAddendumStatus} session={session} Wrap={Wrap}/>;
    if(page==="procurement") return <ProcurementView swatches={swatches} projList={projList} clientName={clientName} openAddSwatch={(pid,by)=>{setSwForm({projectId:pid,name:"",category:"Fabric",qty:"",unit:"pcs",supplier:"",estCost:"",swatchLink:"",addedBy:by||"Design",status:"To Buy",notes:""});setEditSw(null);setSwModal(true);}} openEditSwatch={sw=>{setSwForm({...sw});setEditSw(sw.id);setSwModal(true);}} delSwatch={id=>upSwatches(ss=>ss.filter(s=>s.id!==id))} swQ={swQ} Wrap={Wrap}/>;
    if(page==="checklist") return <ChecklistView checklist={checklist} projList={projList} deals={deals} clientName={clientName} openAddCl={openAddCl} openEditCl={openEditCl} delCl={delCl} clStatusQ={clStatusQ} clModal={clModal} setClModal={setClModal} clForm={clForm} setClForm={setClForm} editCl={editCl} saveCl={saveCl} clProjF={clProjF} setClProjF={setClProjF} clTypeF={clTypeF} setClTypeF={setClTypeF} clStatF={clStatF} setClStatF={setClStatF} clDeptF={clDeptF} setClDeptF={setClDeptF} role={role} wonDeals={wonDeals} loadChecklistTemplate={loadChecklistTemplate} Wrap={Wrap}/>;
    if(page==="joborders") return <JOView deals={deals} wonDeals={wonDeals} projs={projs} jos={jos} joStep={joStep} setJoStep={setJoStep} joSel={joSel} setJoSel={setJoSel} joExtra={joExtra} setJoExtra={setJoExtra} viewJO={viewJO} setViewJO={setViewJO} issueJO={issueJO} overallProg={overallProg} Wrap={Wrap}/>;
    if(page==="checklist") return <ChecklistView checklist={checklist} projList={projList} deals={deals} clientName={clientName} openAddCl={openAddCl} openEditCl={openEditCl} delCl={delCl} clStatusQ={clStatusQ} clModal={clModal} setClModal={setClModal} clForm={clForm} setClForm={setClForm} editCl={editCl} saveCl={saveCl} clProjF={clProjF} setClProjF={setClProjF} clTypeF={clTypeF} setClTypeF={setClTypeF} clStatF={clStatF} setClStatF={setClStatF} clDeptF={clDeptF} setClDeptF={setClDeptF} role={role} wonDeals={wonDeals} loadChecklistTemplate={loadChecklistTemplate} Wrap={Wrap}/>;
    if(page==="clients") return(
      <Wrap>
        <ClientDirectory deals={deals} session={session} role={role}/>
      </Wrap>
    );
    if(page==="accounts") return(
      <Wrap>
        <AccountsManager users={users} session={session} onApprove={approveUser} onReject={rejectUser} onDeactivate={deactivateUser} onDelete={deleteUser} onResetPw={resetPw} ROLES={ROLES}/>
      </Wrap>
    );
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
        <SecHead title="Collections" sub="Track client payments for all awarded projects"/>
        <CollectionsPanel wonDeals={wonDeals} infs={infs} onUpdatePayment={updatePayment} onLogPayment={logPayment}/>
      </Wrap>
    );
    if(page==="joborders") return <JOView deals={deals} wonDeals={wonDeals} projs={projs} jos={jos} joStep={joStep} setJoStep={setJoStep} joSel={joSel} setJoSel={setJoSel} joExtra={joExtra} setJoExtra={setJoExtra} viewJO={viewJO} setViewJO={setViewJO} issueJO={issueJO} overallProg={overallProg} Wrap={Wrap}/>;
    if(page==="checklist") return <ChecklistView checklist={checklist} projList={projList} deals={deals} clientName={clientName} openAddCl={openAddCl} openEditCl={openEditCl} delCl={delCl} clStatusQ={clStatusQ} clModal={clModal} setClModal={setClModal} clForm={clForm} setClForm={setClForm} editCl={editCl} saveCl={saveCl} clProjF={clProjF} setClProjF={setClProjF} clTypeF={clTypeF} setClTypeF={setClTypeF} clStatF={clStatF} setClStatF={setClStatF} clDeptF={clDeptF} setClDeptF={setClDeptF} role={role} wonDeals={wonDeals} loadChecklistTemplate={loadChecklistTemplate} Wrap={Wrap}/>;
  }

  // ─── FINANCE ──────────────────────────────────────────────────────────────
  if(role==="Finance"||role==="Cost Control"){
    const grossPro=totRev-totExp;
    const grossMar=totRev>0?Math.round(grossPro/totRev*100):0;
    if(page==="home") return(
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
      </Wrap>
    );
    if(page==="collections") return(
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
  if(role==="Operations"){
    if(page==="home") return <OpsView projs={projs} projList={projList} deals={deals} selProj={selProj} setSelProj={setSelProj} opsTab={opsTab} setOpsTab={setOpsTab} proj={proj} projDeal={projDeal} upProj={upProj} overallProg={overallProg} costOf={costOf} marginOf={marginOf} openDesignEdit={openDesignEdit} swatches={swatches} swQ={swQ} openAddSwatch={(pid,by)=>{setSwForm({projectId:pid,name:"",category:"Fabric",qty:"",unit:"pcs",supplier:"",estCost:"",swatchLink:"",addedBy:by||"Ops",status:"To Buy",notes:""});setEditSw(null);setSwModal(true);}} openEditSwatch={sw=>{setSwForm({...sw});setEditSw(sw.id);setSwModal(true);}} delSwatch={id=>upSwatches(ss=>ss.filter(s=>s.id!==id))} exps={exps} openAddExp={openAddExp} openEditExp={openEditExp} delExp={delExp} clientName={clientName} matModal={matModal} setMatModal={setMatModal} matForm={matForm} setMatForm={setMatForm} editMat={editMat} setEditMat={setEditMat} saveMat={()=>{if(!matForm.name||!matForm.qty||!matForm.cost)return;const rec={...matForm,qty:Number(matForm.qty),cost:Number(matForm.cost),id:editMat||uid()};upProj(selProj,p=>({...p,materials:editMat?p.materials.map(m=>m.id===editMat?rec:m):[...p.materials,rec]}));setMatModal(false);setEditMat(null);setMatForm({name:"",qty:"",unit:"pcs",cost:"",received:false});}} addPmUpdate={addPmUpdate} addAddendum={addAddendum} updateAddendumStatus={updateAddendumStatus} session={session} Wrap={Wrap}/>;
    if(page==="procurement") return <ProcurementView swatches={swatches} projList={projList} clientName={clientName} openAddSwatch={(pid,by)=>{setSwForm({projectId:pid,name:"",category:"Fabric",qty:"",unit:"pcs",supplier:"",estCost:"",swatchLink:"",addedBy:by||"Ops",status:"To Buy",notes:""});setEditSw(null);setSwModal(true);}} openEditSwatch={sw=>{setSwForm({...sw});setEditSw(sw.id);setSwModal(true);}} delSwatch={id=>upSwatches(ss=>ss.filter(s=>s.id!==id))} swQ={swQ} Wrap={Wrap}/>;
    if(page==="checklist") return <ChecklistView checklist={checklist} projList={projList} deals={deals} clientName={clientName} openAddCl={openAddCl} openEditCl={openEditCl} delCl={delCl} clStatusQ={clStatusQ} clModal={clModal} setClModal={setClModal} clForm={clForm} setClForm={setClForm} editCl={editCl} saveCl={saveCl} clProjF={clProjF} setClProjF={setClProjF} clTypeF={clTypeF} setClTypeF={setClTypeF} clStatF={clStatF} setClStatF={setClStatF} clDeptF={clDeptF} setClDeptF={setClDeptF} role={role} wonDeals={wonDeals} loadChecklistTemplate={loadChecklistTemplate} Wrap={Wrap}/>;
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

  // Clients directory (Manager, Sales, Finance)
  if(page==="clients") return(
    <Wrap>
      <ClientDirectory deals={deals} session={session} role={role}/>
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
function OpsView({projs,projList,deals,selProj,setSelProj,opsTab,setOpsTab,proj,projDeal,upProj,overallProg,costOf,marginOf,openDesignEdit,swatches,swQ,openAddSwatch,openEditSwatch,delSwatch,exps,openAddExp,openEditExp,delExp,clientName,matModal,setMatModal,matForm,setMatForm,editMat,setEditMat,saveMat,addPmUpdate,addAddendum,updateAddendumStatus,session,Wrap}){
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

  const tabs=[["progress","📊 Progress"],["team","👥 Team"],["materials","📦 Materials"],["swatches","🛒 Swatchboard"],["costs","💰 Costs"],["updates","📝 PM Updates"],["addenda","⚠ Addenda"]];
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
                <div style={{flex:1}}><Inp rows={2} value={newUpd} onChange={e=>setNewUpd(e.target.value)} placeholder="e.g. Steel frame 60% complete. Laminate delivery confirmed tomorrow. Client notified via Viber."/></div>
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

      {/* ADDENDA TAB */}
      {opsTab==="addenda"&&(()=>{
        const addenda=projDeal?.addenda||[];
        const[showAF,setShowAF]=useState(false);
        const[af,setAf]=useState({title:"",desc:"",requestedBy:"Client"});
        const AC={"Pending":"#f59e0b","Approved":"#10b981","Rejected":"#ef4444","In Progress":"#3b82f6"};
        return(
          <div>
            <div style={{background:"#fff7ed",border:"1.5px solid #fed7aa",borderRadius:12,padding:"12px 16px",marginBottom:14,fontSize:".82rem",color:"#92400e"}}>
              ⚠️ <strong>Addendum Protocol:</strong> Any scope change must be coordinated with ALL stakeholders — Sales (client comms), Ops (timeline), Finance (budget). Log every change here.
            </div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{fontWeight:700,color:"#0f172a"}}>{addenda.length} Addendum{addenda.length!==1?"a":""}</div>
              <Btn small onClick={()=>setShowAF(s=>!s)}>+ Log Addendum</Btn>
            </div>
            {showAF&&(
              <Card style={{background:"#fff7ed",border:"1.5px solid #fed7aa",marginBottom:12}}>
                <div style={{fontWeight:700,color:"#92400e",marginBottom:12}}>New Scope Change</div>
                <Fld label="Title" required><Inp value={af.title} onChange={e=>setAf(p=>({...p,title:e.target.value}))} placeholder="e.g. Additional glass panel — Unit 3B"/></Fld>
                <Fld label="Description / Impact"><Inp rows={3} value={af.desc} onChange={e=>setAf(p=>({...p,desc:e.target.value}))} placeholder="What changed, why, cost/time impact…"/></Fld>
                <Fld label="Requested By"><Sel value={af.requestedBy} onChange={e=>setAf(p=>({...p,requestedBy:e.target.value}))}>{["Client","Sales Team","Operations","Design","Other"].map(r=><option key={r}>{r}</option>)}</Sel></Fld>
                <div style={{display:"flex",gap:8,marginTop:4}}>
                  <Btn onClick={()=>{addAddendum(selProj,af.title,af.desc,af.requestedBy);setAf({title:"",desc:"",requestedBy:"Client"});setShowAF(false);}}>Save</Btn>
                  <Btn variant="ghost" onClick={()=>setShowAF(false)}>Cancel</Btn>
                </div>
              </Card>
            )}
            {addenda.length===0&&!showAF&&<EmptyState icon="📋" msg="No addenda yet. Log scope changes here to notify all stakeholders."/>}
            {addenda.map(a=>(
              <Card key={a.id} accent={AC[a.status]}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,flexWrap:"wrap"}}>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:4,flexWrap:"wrap"}}>
                      <span style={{fontWeight:700,color:"#0f172a"}}>{a.title}</span>
                      <Badge label={a.status} color={AC[a.status]||"#94a3b8"}/>
                      <span style={{fontSize:".7rem",color:"#94a3b8"}}>by {a.requestedBy} · {a.date}</span>
                    </div>
                    {a.desc&&<div style={{fontSize:".8rem",color:"#64748b",lineHeight:1.6}}>{a.desc}</div>}
                    <div style={{display:"flex",gap:10,marginTop:8,fontSize:".72rem",flexWrap:"wrap"}}>
                      <span style={{color:a.notifiedSales?"#059669":"#f59e0b",fontWeight:600}}>{a.notifiedSales?"✓ Sales notified":"⚠ Notify Sales"}</span>
                      <span style={{color:a.notifiedOps?"#059669":"#f59e0b",fontWeight:600}}>{a.notifiedOps?"✓ Ops notified":"⚠ Notify Ops"}</span>
                    </div>
                  </div>
                  <select value={a.status} onChange={e=>updateAddendumStatus(selProj,a.id,e.target.value)} style={{border:"1.5px solid #e2e8f0",borderRadius:7,padding:"5px 9px",fontFamily:"inherit",fontSize:".78rem",color:"#0f172a",background:"#fff",cursor:"pointer"}}>
                    {["Pending","In Progress","Approved","Rejected"].map(s=><option key={s}>{s}</option>)}
                  </select>
                </div>
              </Card>
            ))}
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
    setOk("Account created! A Manager will approve your access shortly. You will be able to log in once approved.");
    setName(""); setUname(""); setPw(""); setPw2("");
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
              <input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Juan dela Cruz" style={{width:"100%",background:"rgba(255,255,255,.08)",border:"1.5px solid rgba(255,255,255,.15)",borderRadius:9,padding:"10px 13px",color:"#fff",fontFamily:"inherit",fontSize:".88rem"}}/>
            </div>
          )}

          {/* Username */}
          <div style={{marginBottom:14}}>
            <label style={{display:"block",fontSize:".68rem",fontWeight:700,color:"rgba(255,255,255,.5)",textTransform:"uppercase",letterSpacing:".8px",marginBottom:6}}>Username *</label>
            <input value={uname} onChange={e=>setUname(e.target.value)} placeholder="e.g. juan" onKeyDown={e=>isLogin&&e.key==="Enter"&&doLogin()} style={{width:"100%",background:"rgba(255,255,255,.08)",border:"1.5px solid rgba(255,255,255,.15)",borderRadius:9,padding:"10px 13px",color:"#fff",fontFamily:"inherit",fontSize:".88rem"}}/>
          </div>

          {/* Password */}
          <div style={{marginBottom:14,position:"relative"}}>
            <label style={{display:"block",fontSize:".68rem",fontWeight:700,color:"rgba(255,255,255,.5)",textTransform:"uppercase",letterSpacing:".8px",marginBottom:6}}>Password *</label>
            <div style={{position:"relative"}}>
              <input type={showPw?"text":"password"} value={pw} onChange={e=>setPw(e.target.value)} placeholder="Min 6 characters" onKeyDown={e=>isLogin&&e.key==="Enter"&&doLogin()} style={{width:"100%",background:"rgba(255,255,255,.08)",border:"1.5px solid rgba(255,255,255,.15)",borderRadius:9,padding:"10px 40px 10px 13px",color:"#fff",fontFamily:"inherit",fontSize:".88rem"}}/>
              <button onClick={()=>setShowPw(s=>!s)} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"rgba(255,255,255,.4)",cursor:"pointer",fontSize:".78rem"}}>{showPw?"Hide":"Show"}</button>
            </div>
          </div>

          {/* Confirm password + role (register only) */}
          {!isLogin&&(<>
            <div style={{marginBottom:14}}>
              <label style={{display:"block",fontSize:".68rem",fontWeight:700,color:"rgba(255,255,255,.5)",textTransform:"uppercase",letterSpacing:".8px",marginBottom:6}}>Confirm Password *</label>
              <input type="password" value={pw2} onChange={e=>setPw2(e.target.value)} style={{width:"100%",background:"rgba(255,255,255,.08)",border:"1.5px solid rgba(255,255,255,.15)",borderRadius:9,padding:"10px 13px",color:"#fff",fontFamily:"inherit",fontSize:".88rem"}}/>
            </div>
            <div style={{marginBottom:14}}>
              <label style={{display:"block",fontSize:".68rem",fontWeight:700,color:"rgba(255,255,255,.5)",textTransform:"uppercase",letterSpacing:".8px",marginBottom:6}}>Request Role</label>
              <select value={reqRole} onChange={e=>setReqRole(e.target.value)} style={{width:"100%",background:"rgba(255,255,255,.08)",border:"1.5px solid rgba(255,255,255,.15)",borderRadius:9,padding:"10px 13px",color:"#fff",fontFamily:"inherit",fontSize:".88rem",cursor:"pointer"}}>
                {["Sales","Cost Control","Operations","Design"].map(r=><option key={r} style={{background:"#1e293b"}}>{r}</option>)}
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
                    {["Sales","Finance","Operations","Design","Manager"].map(r=><option key={r}>{r}</option>)}
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
                <input type="password" value={newPw} onChange={e=>setNewPw(e.target.value)} placeholder="New password (min 6 chars)" style={{flex:1,minWidth:180,border:"1.5px solid #e2e8f0",borderRadius:7,padding:"7px 11px",fontFamily:"inherit",fontSize:".83rem",color:"#0f172a"}}/>
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

// ─── CLIENT AUTOCOMPLETE ──────────────────────────────────────────────────────
function ClientAutocomplete({value, onChange}){
  const[show,    setShow]   = useState(false);
  const[focused, setFocused]= useState(false);
  const ref = useRef ? useRef(null) : {current:null};

  const suggestions = useMemo(()=>{
    if(!value||value.length<2) return [];
    const q = value.toLowerCase();
    return GMD_CLIENTS.filter(c=>c.name.toLowerCase().includes(q)).slice(0,8);
  },[value]);

  const pick = (name) => { onChange(name); setShow(false); };

  return(
    <div style={{position:"relative"}}>
      <input
        value={value||""}
        onChange={e=>{onChange(e.target.value);setShow(true);}}
        onFocus={()=>setShow(true)}
        onBlur={()=>setTimeout(()=>setShow(false),150)}
        placeholder="Start typing client name…"
        style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"9px 12px",fontFamily:"inherit",fontSize:".87rem",color:"#1e293b",background:"#fff",boxSizing:"border-box",outline:"none"}}
      />
      {show && suggestions.length>0 && (
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
          {value&&!GMD_CLIENTS.find(c=>c.name.toLowerCase()===value.toLowerCase())&&(
            <div onMouseDown={()=>pick(value)}
              style={{padding:"10px 14px",cursor:"pointer",background:"#fafafa",borderTop:"1px solid #e2e8f0",fontSize:".82rem",color:"#3b82f6",fontWeight:600}}>
              + Add "{value}" as new client
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── CLIENT DIRECTORY ────────────────────────────────────────────────────────
function ClientDirectory({deals, session, role}){
  const[search, setSearch] = useState("");
  const[filter, setFilter] = useState("all"); // all | with-projects | with-balance

  const filtered = useMemo(()=>{
    let list = GMD_CLIENTS;
    if(search) list = list.filter(c=>
      c.name.toLowerCase().includes(search.toLowerCase())||
      (c.city||"").toLowerCase().includes(search.toLowerCase())||
      (c.email||"").toLowerCase().includes(search.toLowerCase())
    );
    if(filter==="with-balance") list = list.filter(c=>c.balance>0);
    if(filter==="with-projects") list = list.filter(c=>deals.some(d=>d.client===c.name));
    return list;
  },[search,filter,deals]);

  const totalBalance = GMD_CLIENTS.reduce((s,c)=>s+c.balance,0);

  return(
    <div>
      {/* Header */}
      <div style={{marginBottom:20}}>
        <h2 style={{margin:0,fontWeight:800,color:"#0f172a",fontSize:"1.15rem"}}>Client Directory</h2>
        <p style={{margin:"4px 0 0",color:"#64748b",fontSize:".78rem"}}>{GMD_CLIENTS.length} clients on record · From QuickBooks import</p>
      </div>

      {/* KPIs */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
        {[
          {l:"Total Clients",    v:GMD_CLIENTS.length,                                      c:"#3b82f6"},
          {l:"With Active Deals",v:GMD_CLIENTS.filter(c=>deals.some(d=>d.client===c.name)).length, c:"#10b981"},
          {l:"Open Balances",    v:GMD_CLIENTS.filter(c=>c.balance>0).length,               c:"#ef4444"},
          {l:"Total Outstanding",v:"₱"+totalBalance.toLocaleString(),                       c:"#f59e0b"},
        ].map(({l,v,c})=>(
          <div key={l} style={{background:"#fff",borderRadius:12,padding:"15px 18px",border:"1.5px solid #e2e8f0"}}>
            <div style={{fontWeight:800,fontSize:"1.4rem",color:c,fontFamily:"'Barlow Condensed',sans-serif"}}>{v}</div>
            <div style={{fontSize:".65rem",textTransform:"uppercase",letterSpacing:"1px",color:"#94a3b8",marginTop:5}}>{l}</div>
          </div>
        ))}
      </div>

      {/* Open balances alert */}
      {GMD_CLIENTS.filter(c=>c.balance>0).length>0&&(
        <div style={{background:"#fef2f2",border:"1.5px solid #fecaca",borderRadius:12,padding:"12px 18px",marginBottom:16,display:"flex",gap:16,flexWrap:"wrap",alignItems:"center"}}>
          <span style={{fontSize:"1.2rem"}}>⚠️</span>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,color:"#dc2626",fontSize:".88rem"}}>Clients with outstanding balances</div>
            <div style={{display:"flex",gap:16,marginTop:4,flexWrap:"wrap"}}>
              {GMD_CLIENTS.filter(c=>c.balance>0).map(c=>(
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
        <input
          value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="Search by name, city, or email…"
          style={{flex:1,minWidth:200,border:"1.5px solid #e2e8f0",borderRadius:8,padding:"9px 13px",fontFamily:"inherit",fontSize:".86rem",color:"#1e293b",outline:"none"}}
        />
        {[
          {id:"all",           l:`All (${GMD_CLIENTS.length})`},
          {id:"with-balance",  l:`Open Balance (${GMD_CLIENTS.filter(c=>c.balance>0).length})`},
          {id:"with-projects", l:`Has Deals (${GMD_CLIENTS.filter(c=>deals.some(d=>d.client===c.name)).length})`},
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
            <div key={i} style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:0,padding:"12px 18px",borderBottom:"1px solid #f1f5f9",background:hasBalance?"#fef9f9":i%2===0?"#fff":"#fafafa",alignItems:"center",transition:"background .1s"}}
              onMouseEnter={e=>e.currentTarget.style.background="#f0f9ff"}
              onMouseLeave={e=>e.currentTarget.style.background=hasBalance?"#fef9f9":i%2===0?"#fff":"#fafafa"}>
              <div>
                <div style={{fontWeight:600,color:"#0f172a",fontSize:".88rem"}}>{c.name}</div>
                {c.email&&<div style={{fontSize:".72rem",color:"#94a3b8",marginTop:2}}>{c.email}</div>}
                {hasBalance&&<div style={{fontSize:".72rem",color:"#ef4444",fontWeight:700,marginTop:2}}>⚠ ₱{c.balance.toLocaleString()} outstanding</div>}
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
        Showing {filtered.length} of {GMD_CLIENTS.length} clients
      </div>
    </div>
  );
}

// ─── GMD AI DEVIL'S ADVOCATE ──────────────────────────────────────────────────
const GMD_DA_SYSTEM = `You are the GMD Productions internal AI advisor — a direct, honest devil's advocate built into FabHub.

YOUR PERSONALITY:
- Paulo Garcia asked you to be his devil's advocate. He is a people pleaser and reactive by nature — your job is to challenge, not agree.
- Be direct, practical, and honest. Never sugarcoat. Never just validate what you see.
- Always ask the uncomfortable question nobody else is asking.
- Keep responses tight — this is a busy operations team. No fluff.

YOUR KNOWLEDGE:
- GMD Productions Inc. — retail fabrication and design-build company, Philippines
- 13-stage workflow: BizDev → Client Engagement → Design Request → Design & CE → Client Approval → Project Kickoff → Budget & Briefing → Fabrication/Construction → Site Visit & Progress Billing → Installation → Punchlist → Close-Out → Client Feedback
- ₱3M Rule: ANY project ≥ ₱3M requires Paulo Garcia's direct involvement
- Paulo Gates: Stage 05 (Client Approval) and Stage 06 (Kickoff) — nothing moves without Paulo
- Discount rule: ONLY Paulo sets discounts — never the sales team
- Standard margin: ~50-60% total (Materials + Labor + 20% Contractor's Profit)
- Healthy margin benchmark: ≥20% gross margin on any project
- Standard fabrication: 45 days. Construction: 45–60 days.
- Open balances that need urgent follow-up: Ivory Tree ₱2.6M, Newtrends ₱240K, Five Sips ₱84K
- Sales Protocol: Clients must NEVER ask "any update?" — team sends updates first

DEVIL'S ADVOCATE RULES:
1. If a deal has <20% margin — flag it hard
2. If a deal is ≥₱3M and Paulo is not involved — flag it
3. If a client has an open balance and a new deal is being created — flag it
4. If a project has no PM updates in the current stage — challenge it
5. If expenses are untagged (company-wide) when they should be project-specific — challenge it
6. If a stage has been stuck too long — ask why
7. If the team is asking Paulo for things they should own — call it out
8. If someone presents a problem without a solution — push them back

COACHING QUESTIONS (use these to guide the team):
- "What would you do if Paulo wasn't available right now?"
- "Have you confirmed this timeline with Operations before telling the client?"
- "What are your two options for the client — don't give them a problem, give them choices."
- "Is this a Paulo decision or a Paolo decision?"
- "When did you last proactively update this client?"

Always end with 1 specific action the person should take RIGHT NOW.`;

function AIAdvisor({ctx, role, session, onClose, deals, projs, exps, infs, checklist, wonDeals}){
  const[msgs,    setMsgs]   = useState([]);
  const[input,   setInput]  = useState("");
  const[loading, setLoading]= useState(false);
  const[started, setStarted]= useState(false);
  const bottomRef = useRef(null);

  useEffect(()=>{ bottomRef.current?.scrollIntoView({behavior:"smooth"}); },[msgs]);

  // Build context summary for AI
  const buildCtxSummary = () => {
    const lines = [];
    lines.push(`Current user: ${session?.name} (${role})`);
    lines.push(`Current page: ${ctx?.page||"unknown"}`);

    // Pipeline health
    const activeDeals = deals.filter(d=>!WON_STAGES.includes(d.stage)&&d.stage!=="Cancelled");
    const wonD = wonDeals;
    const lowMargin = wonD.filter(d=>{
      const p=projs[d.id]; if(!p) return false;
      const cost=(p.materials||[]).reduce((s,m)=>s+m.cost,0)+(p.laborCost||0)+(p.overhead||0);
      return d.value>0&&cost>0&&Math.round((d.value-cost)/d.value*100)<20;
    });
    const bigDeals = deals.filter(d=>Number(d.value)>=3000000&&d.stage!=="Cancelled"&&d.stage!=="13 · Client Feedback");
    const openBal  = wonD.filter(d=>d.invoiced>0&&d.amountPaid<d.invoiced);
    const overdueBal = openBal.filter(d=>d.dueDate&&d.dueDate<today);
    const untaggedExp = exps.filter(e=>!e.projectId);
    const noUpdates = wonD.filter(d=>{const p=projs[d.id];return p&&["08 · Fabrication / Construction","10 · Installation","11 · Punchlist"].includes(d.stage)&&(!p.pmUpdates||p.pmUpdates.length===0);});
    const pendingCL = checklist.filter(c=>c.status==="To Do"&&c.dueDate&&c.dueDate<today);

    lines.push(`\nPIPELINE SNAPSHOT:`);
    lines.push(`- ${activeDeals.length} active deals in pipeline`);
    lines.push(`- ${wonD.length} awarded/active projects`);
    lines.push(`- ${bigDeals.length} deals ≥₱3M: ${bigDeals.map(d=>d.client+" ("+d.stage+")").join(", ")||"none"}`);
    lines.push(`- ${lowMargin.length} projects with <20% margin: ${lowMargin.map(d=>d.client).join(", ")||"none"}`);

    lines.push(`\nCOLLECTIONS:`);
    lines.push(`- ${openBal.length} clients with outstanding balances`);
    lines.push(`- ${overdueBal.length} OVERDUE: ${overdueBal.map(d=>d.client+" ₱"+(d.invoiced-d.amountPaid).toLocaleString()).join(", ")||"none"}`);

    lines.push(`\nOPERATIONS RISKS:`);
    lines.push(`- ${noUpdates.length} active projects with NO PM updates: ${noUpdates.map(d=>d.client).join(", ")||"none"}`);
    lines.push(`- ${pendingCL.length} overdue checklist tasks`);

    lines.push(`\nFINANCE:`);
    lines.push(`- ${untaggedExp.length} expenses logged as company-wide (not project-tagged)`);
    lines.push(`- Total expenses: ₱${exps.reduce((s,e)=>s+e.amount,0).toLocaleString()}`);

    // If viewing a specific deal
    if(ctx?.deal){
      const d=ctx.deal; const p=projs[d.id];
      const cost=p?(p.materials||[]).reduce((s,m)=>s+m.cost,0)+(p.laborCost||0)+(p.overhead||0):0;
      const margin=d.value>0&&cost>0?Math.round((d.value-cost)/d.value*100):null;
      lines.push(`\nCURRENT DEAL FOCUS: ${d.client}`);
      lines.push(`- Stage: ${d.stage} | Value: ₱${d.value.toLocaleString()} | CE: ${d.ceNo||"none"}`);
      lines.push(`- Payment: ${d.paymentStatus} | Collected: ₱${d.amountPaid.toLocaleString()} of ₱${d.invoiced.toLocaleString()}`);
      lines.push(`- Margin: ${margin!==null?margin+"%":"unknown (no cost data)"}`);
      lines.push(`- Sales Repo: ${d.salesRepoLink?"✓ linked":"✗ NOT LINKED"} | Proposal: ${d.proposalFolderLink?"✓ linked":"✗ NOT LINKED"}`);
      lines.push(`- Comms group: ${d.commsGroup||"NOT CREATED"}`);
      if(p) lines.push(`- PM Updates: ${(p.pmUpdates||[]).length} logged | Addenda: ${(d.addenda||[]).length}`);
    }

    return lines.join("\n");
  };

  const getStarterPrompt = () => {
    const ctx_summary = buildCtxSummary();
    return `Here is the current GMD FabHub data snapshot:\n\n${ctx_summary}\n\nAs GMD's devil's advocate, give me:\n1. The 3 biggest risks or problems you see RIGHT NOW based on this data\n2. The one thing the ${role} should do immediately\n3. One uncomfortable question the ${role} should be asking themselves`;
  };

  const send = async(text) => {
    const q = text||input.trim();
    if(!q||loading) return;
    setInput("");
    const newMsgs = [...msgs, {role:"user",content:q}];
    setMsgs(newMsgs);
    setLoading(true);
    try{
      const res = await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          model:"claude-sonnet-4-20250514",
          max_tokens:1000,
          system: GMD_DA_SYSTEM,
          messages: newMsgs.map(m=>({role:m.role,content:m.content})),
        })
      });
      const data = await res.json();
      if(data.error) throw new Error(data.error.message);
      setMsgs(m=>[...m,{role:"assistant",content:data.content?.[0]?.text||"No response."}]);
    }catch(e){
      setMsgs(m=>[...m,{role:"assistant",content:"Connection error. Check your API setup and try again."}]);
    }
    setLoading(false);
  };

  const start = () => { setStarted(true); send(getStarterPrompt()); };

  const QUICK = {
    Manager:[
      "What's the biggest financial risk right now?",
      "Which projects should I personally be watching?",
      "Is my team handling things without me?",
      "What open balance needs the most urgent attention?",
    ],
    Sales:[
      "Challenge my latest deal — what am I missing?",
      "Am I escalating the right things to Paolo?",
      "Which of my clients haven't heard from me recently?",
      "Is my pipeline healthy or am I fooling myself?",
    ],
    "Cost Control":[
      "Are our project margins healthy?",
      "Which expenses should be re-tagged to projects?",
      "What billings are overdue?",
      "Are we collecting fast enough vs spending?",
    ],
    Operations:[
      "Which projects are behind and why?",
      "Am I logging PM updates as I should?",
      "Are there addenda I haven't told Sales about?",
      "What will block us from hitting our delivery dates?",
    ],
    Design:[
      "Are there design requests I haven't started?",
      "Which projects are waiting on my approval?",
      "Is my timeline realistic for current load?",
      "Am I communicating enough with the AE on revisions?",
    ],
  };

  const roleColor = ROLE_CLR[role]||"#f59e0b";

  return(
    <div style={{position:"fixed",inset:0,zIndex:600,display:"flex",alignItems:"flex-end",justifyContent:"flex-end",pointerEvents:"none"}}>
      <div style={{width:"100%",maxWidth:420,height:"92vh",background:"#0f172a",borderRadius:"16px 0 0 16px",boxShadow:"-8px 0 40px rgba(0,0,0,.4)",display:"flex",flexDirection:"column",pointerEvents:"all",border:"1px solid #21262d"}}>
        <style>{`@keyframes fadeInRight{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:none}}`}</style>

        {/* Header */}
        <div style={{padding:"14px 18px",borderBottom:"1px solid #21262d",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
          <div style={{width:36,height:36,borderRadius:"50%",background:"#1a1a2e",border:`2px solid ${roleColor}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.1rem",flexShrink:0}}>🤔</div>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,color:"#f0f6fc",fontSize:".92rem"}}>GMD Devil's Advocate</div>
            <div style={{fontSize:".68rem",color:"#64748b"}}>Honest advice · No sugarcoating · {session?.name}</div>
          </div>
          <button onClick={onClose} style={{background:"transparent",border:"none",color:"#64748b",cursor:"pointer",fontSize:"1.1rem",padding:4}}>✕</button>
        </div>

        {/* Messages */}
        <div style={{flex:1,overflowY:"auto",padding:"14px 16px",display:"flex",flexDirection:"column",gap:12}}>
          {!started&&(
            <div style={{textAlign:"center",padding:"20px 0",animation:"fadeInRight .3s ease"}}>
              <div style={{fontSize:"2rem",marginBottom:10}}>🤔</div>
              <div style={{fontWeight:700,color:"#f0f6fc",fontSize:"1rem",marginBottom:6}}>Your Devil's Advocate</div>
              <div style={{fontSize:".78rem",color:"#64748b",lineHeight:1.6,marginBottom:18}}>I'll scan your current FabHub data and tell you what's wrong, what you're missing, and what you should be doing right now. I won't be polite about it.</div>
              <button onClick={start} style={{background:"#f59e0b",border:"none",borderRadius:10,padding:"11px 24px",fontFamily:"inherit",fontWeight:700,fontSize:".88rem",color:"#0f172a",cursor:"pointer"}}>
                🔍 Analyse My Data Now
              </button>
              <div style={{marginTop:18}}>
                <div style={{fontSize:".68rem",color:"#334155",marginBottom:8,textTransform:"uppercase",letterSpacing:"1px"}}>Or ask directly</div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {(QUICK[role]||QUICK.Manager).map(q=>(
                    <button key={q} onClick={()=>{setStarted(true);send(q);}} style={{background:"#161b22",border:"1px solid #21262d",borderRadius:8,padding:"8px 12px",fontSize:".78rem",color:"#94a3b8",cursor:"pointer",fontFamily:"inherit",textAlign:"left",transition:"all .15s"}}
                      onMouseEnter={e=>{e.currentTarget.style.borderColor=roleColor;e.currentTarget.style.color=roleColor;}}
                      onMouseLeave={e=>{e.currentTarget.style.borderColor="#21262d";e.currentTarget.style.color="#94a3b8";}}>
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {msgs.map((m,i)=>{
            const isUser=m.role==="user";
            return(
              <div key={i} style={{display:"flex",gap:8,flexDirection:isUser?"row-reverse":"row",alignItems:"flex-start"}}>
                <div style={{width:28,height:28,borderRadius:"50%",background:isUser?roleColor+"22":"#1a1a2e",border:`1.5px solid ${isUser?roleColor+"55":"#334155"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:".8rem",flexShrink:0,color:isUser?roleColor:"#f59e0b"}}>
                  {isUser?(session?.name?.[0]||"U"):"🤔"}
                </div>
                <div style={{maxWidth:"82%",background:isUser?"#1e3a5f":"#161b22",borderRadius:isUser?"12px 3px 12px 12px":"3px 12px 12px 12px",padding:"10px 13px",border:`1px solid ${isUser?"#1d4ed833":"#21262d"}`,fontSize:".82rem",color:isUser?"#e2e8f0":"#cbd5e1",lineHeight:1.65,whiteSpace:"pre-wrap"}}>
                  {m.content}
                </div>
              </div>
            );
          })}
          {loading&&(
            <div style={{display:"flex",gap:8,alignItems:"flex-start"}}>
              <div style={{width:28,height:28,borderRadius:"50%",background:"#1a1a2e",border:"1.5px solid #334155",display:"flex",alignItems:"center",justifyContent:"center",fontSize:".8rem",flexShrink:0}}>🤔</div>
              <div style={{background:"#161b22",borderRadius:"3px 12px 12px 12px",padding:"12px 14px",border:"1px solid #21262d"}}>
                <div style={{display:"flex",gap:4}}>
                  {[0,1,2].map(i=>(
                    <span key={i} style={{width:6,height:6,borderRadius:"50%",background:"#f59e0b",display:"inline-block",animation:"pulse 1.2s infinite",animationDelay:`${i*0.2}s`}}>●</span>
                  ))}
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef}/>
        </div>

        {/* Input */}
        {started&&(
          <div style={{padding:"10px 14px",borderTop:"1px solid #21262d",flexShrink:0}}>
            <div style={{display:"flex",gap:8,background:"#161b22",border:"1.5px solid #21262d",borderRadius:10,padding:"8px 12px"}}>
              <textarea value={input} onChange={e=>setInput(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}}
                placeholder="Ask anything or describe a situation…"
                rows={1} style={{flex:1,background:"transparent",border:"none",color:"#e2e8f0",fontFamily:"inherit",fontSize:".82rem",lineHeight:1.5,maxHeight:100,overflowY:"auto",resize:"none",outline:"none"}}
                onInput={e=>{e.target.style.height="auto";e.target.style.height=Math.min(e.target.scrollHeight,100)+"px";}}/>
              <button onClick={()=>send()} disabled={!input.trim()||loading}
                style={{background:input.trim()&&!loading?"#f59e0b":"#21262d",border:"none",borderRadius:7,width:32,height:32,cursor:input.trim()&&!loading?"pointer":"not-allowed",color:input.trim()&&!loading?"#0f172a":"#334155",fontSize:"1rem",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                ↑
              </button>
            </div>
            <div style={{fontSize:".62rem",color:"#21262d",marginTop:5,textAlign:"center"}}>Enter to send · Powered by Claude AI</div>
          </div>
        )}
      </div>
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
    setPos(cashPositions[d]||emptyDayPosition(d));
    setSaved(!!cashPositions[d]);
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
    BANKS.forEach(b=>{
      const row=pos.banks[b.id]||emptyBankRow();
      beg+=n(row.beg); book+=n(row.book); end+=n(row.end);
    });
    return {beg,book,end};
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
  const totalCashAvailable=bankTotals.book-totalLess;

  const handleSave=()=>{
    const toSave={...pos,collections:{...pos.collections,fabhubAmt:todayInflows},savedAt:new Date().toISOString()};
    saveDayPos(selDate,toSave);
    setSaved(true);
  };

  const histDates=Object.keys(cashPositions).sort().reverse().slice(0,30);

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
          ["Total Book Balance",   "₱"+fmt2(bankTotals.book),    "#1d4ed8"],
          ["Collections Today",    "₱"+fmt2(totalCollections),   "#10b981"],
          ["Outstanding Invoices", "₱"+totOut.toLocaleString("en-PH",{minimumFractionDigits:2}), "#f59e0b"],
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
        <div style={{display:"grid",gridTemplateColumns:"200px repeat(6,1fr) 130px",background:"#1e293b"}}>
          <div style={{padding:"12px 14px",color:"rgba(255,255,255,.6)",fontSize:".72rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"1px",borderRight:"1px solid #334155"}}>CATEGORY</div>
          {BANKS.map(b=>(
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
          ["BOOK BALANCE",      "book", "#fff"],
          ["BANK BALANCE ENDING","end", "#fafafa"],
        ].map(([label,key,bg])=>(
          <div key={key} style={{display:"grid",gridTemplateColumns:"200px repeat(6,1fr) 130px",borderBottom:"1px solid #e2e8f0",background:bg}}>
            <div style={labelCell}>{label}</div>
            {BANKS.map(b=>(
              <div key={b.id} style={{padding:"5px 8px",borderRight:"1px solid #f1f5f9"}}>
                <input className="cash-inp" type="text"
                  key={`${b.id}-${key}-${selDate}`}
                  defaultValue={pos.banks[b.id]?.[key]||""}
                  onBlur={e=>f(`banks.${b.id}.${key}`,e.target.value)}
                  onKeyDown={e=>{if(e.key==="Enter"||e.key==="Tab")f(`banks.${b.id}.${key}`,e.target.value);}}
                  placeholder="0.00"
                  style={{...inpStyle,borderColor:"transparent",background:"transparent"}}/>
              </div>
            ))}
            <div style={{padding:"8px 12px",textAlign:"right",fontWeight:700,fontSize:".85rem",
              color:key==="end"?"#059669":key==="book"?"#1d4ed8":"#0f172a",
              background:key==="end"?"#f0fdf4":key==="book"?"#eff6ff":"transparent"}}>
              {fmt2(BANKS.reduce((s,b)=>s+n(pos.banks[b.id]?.[key]),0))}
            </div>
          </div>
        ))}

        {/* Collections section */}
        <div style={{background:"#f0fdf4",borderBottom:"1px solid #d1fae5",borderTop:"2px solid #6ee7b7"}}>
          <div style={{display:"grid",gridTemplateColumns:"200px 1fr 130px",padding:"0"}}>
            <div style={{...labelCell,background:"#dcfce7",color:"#059669",fontWeight:700,fontSize:".82rem",display:"flex",alignItems:"center"}}>COLLECTIONS</div>
            <div style={{padding:"8px 12px"}}>
              <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
                <div style={{fontSize:".75rem",color:"#059669",fontWeight:600}}>
                  🔗 FabHub Auto: ₱{fmt2(todayInflows)}
                  <span style={{fontSize:".68rem",color:"#94a3b8",fontWeight:400,marginLeft:4}}>(from logged inflows this month)</span>
                </div>
                <div style={{display:"flex",gap:8,alignItems:"center",flex:1,flexWrap:"wrap"}}>
                  <input type="text"
                    key={`coll-manual-${selDate}`}
                    defaultValue={pos.collections.manualAmt||""}
                    onBlur={e=>f("collections.manualAmt",e.target.value)}
                    onKeyDown={e=>{if(e.key==="Enter")f("collections.manualAmt",e.target.value);}}
                    placeholder="+ Manual collection amt" className="cash-inp"
                    style={{...inpStyle,width:180,textAlign:"left",borderColor:"#6ee7b7"}}/>
                  <input type="text"
                    key={`coll-note-${selDate}`}
                    defaultValue={pos.collections.manualNote||""}
                    onBlur={e=>f("collections.manualNote",e.target.value)}
                    placeholder="Note (e.g. cash deposit, cheque)"
                    style={{...inpStyle,flex:1,minWidth:150,textAlign:"left",borderColor:"#6ee7b7"}}/>
                </div>
              </div>
            </div>
            <div style={{padding:"8px 12px",textAlign:"right",fontWeight:800,color:"#059669",fontSize:".88rem",display:"flex",alignItems:"center",justifyContent:"flex-end"}}>
              {fmt2(totalCollections)}
            </div>
          </div>
        </div>

        {/* Less section */}
        <div style={{background:"#fef2f2",borderBottom:"1px solid #fecaca",borderTop:"2px solid #fca5a5"}}>
          <div style={{padding:"8px 14px",fontWeight:700,color:"#dc2626",fontSize:".78rem",textTransform:"uppercase",letterSpacing:".5px"}}>LESS:</div>
          {[
            ["Online Transaction (Bizlink)","less.bizlink"],
            ["Check Float",                "less.checkFloat"],
          ].map(([label,path])=>(
            <div key={path} style={{display:"grid",gridTemplateColumns:"200px 1fr 130px",borderTop:"1px solid #fee2e2"}}>
              <div style={{...labelCell,background:"#fff5f5",color:"#dc2626",fontSize:".78rem"}}>{label}</div>
              <div style={{padding:"5px 12px"}}>
                <input className="cash-inp" type="text"
                  key={`${path}-${selDate}`}
                  defaultValue={path.split(".").reduce((o,k)=>o?.[k],pos)||""}
                  onBlur={e=>f(path,e.target.value)}
                  onKeyDown={e=>{if(e.key==="Enter"||e.key==="Tab")f(path,e.target.value);}}
                  placeholder="0.00"
                  style={{...inpStyle,width:200,borderColor:"#fca5a5"}}/>
              </div>
              <div style={{padding:"8px 12px",textAlign:"right",fontWeight:600,color:"#dc2626",fontSize:".85rem",display:"flex",alignItems:"center",justifyContent:"flex-end"}}>
                {fmt2(path.split(".").reduce((o,k)=>o?.[k],pos))}
              </div>
            </div>
          ))}
          {/* Other less */}
          <div style={{display:"grid",gridTemplateColumns:"200px 1fr 130px",borderTop:"1px solid #fee2e2"}}>
            <div style={{...labelCell,background:"#fff5f5",color:"#dc2626",fontSize:".78rem"}}>Other</div>
            <div style={{padding:"5px 12px",display:"flex",gap:8}}>
              <input className="cash-inp" type="text"
                key={`other-amt-${selDate}`}
                defaultValue={pos.less.otherAmt||""}
                onBlur={e=>f("less.otherAmt",e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter")f("less.otherAmt",e.target.value);}}
                placeholder="0.00" style={{...inpStyle,width:150,borderColor:"#fca5a5"}}/>
              <input className="cash-inp" type="text"
                key={`other-note-${selDate}`}
                defaultValue={pos.less.otherNote||""}
                onBlur={e=>f("less.otherNote",e.target.value)}
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
                <input className="cash-inp" type="text"
                  key={`${path}-${selDate}`}
                  defaultValue={path.split(".").reduce((o,k)=>o?.[k],pos)||""}
                  onBlur={e=>f(path,e.target.value)}
                  onKeyDown={e=>{if(e.key==="Enter"||e.key==="Tab")f(path,e.target.value);}}
                  placeholder="0.00"
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

      {/* Notes */}
      <div style={{background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",padding:16}}>
        <div style={{fontWeight:700,color:"#475569",fontSize:".78rem",textTransform:"uppercase",letterSpacing:".8px",marginBottom:8}}>Notes for {selDate}</div>
        <textarea value={pos.notes||""} onChange={e=>f("notes",e.target.value)}
          placeholder="Add any notes for this cash position (e.g. incoming wire, pending cheque, bank issues)…"
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
