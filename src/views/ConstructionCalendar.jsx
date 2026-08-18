import React from "react";

// ─── CONSTRUCTION CALENDAR ────────────────────────────────────────────────────
// ── Field Board — Type of Work classifier (mirrors the Ops Director's deck) ──
// Every field job the coordinators run is tagged with one top-level code, and
// that code is the single "type" stored on the event. The four codes are the
// only work types the field board offers:
//   I · Installation   R · Repair   P · Punchlist   C · Construction
const WORK_CATEGORIES=[
  {code:"I",label:"Installation",color:"#17998a"}, // teal
  {code:"R",label:"Repair",       color:"#3b82f6"}, // blue
  {code:"P",label:"Punchlist",    color:"#f59e0b"}, // amber
  {code:"C",label:"Construction", color:"#c0392b"}, // red
  {code:"O",label:"Others",       color:"#64748b"}, // slate — free-text describes the job
];
const CAT_COLOR=Object.fromEntries(WORK_CATEGORIES.map(c=>[c.code,c.color]));
const CAT_LABEL_BY_CODE=Object.fromEntries(WORK_CATEGORIES.map(c=>[c.code,c.label]));
const codeFromLabel=Object.fromEntries(WORK_CATEGORIES.map(c=>[c.label,c.code]));

// The calendar also surfaces auto-derived events (turnovers, PO deliveries,
// billing, DRF) alongside these field-board work types.
const OPS_EVENT_TYPES=[...WORK_CATEGORIES.map(c=>c.label),"Turnover","PO Delivery","Billing Due","DRF Deadline","Backjob","Maintenance","Site Visit","Inspection","Site Meeting"];
const OPS_EVENT_COLORS={Installation:"#17998a",Repair:"#3b82f6",Punchlist:"#f59e0b",Construction:"#c0392b",Others:"#64748b",Turnover:"#3b82f6","PO Delivery":"#f97316","Billing Due":"#10b981","DRF Deadline":"#ec4899",Backjob:"#dc2626",Maintenance:"#f59e0b","Site Visit":"#0ea5e9",Inspection:"#8b5cf6","Site Meeting":"#059669"};
const OPS_EVENT_ICONS={Installation:"🏗",Repair:"🔧",Punchlist:"📋",Construction:"🧱",Others:"📌",Turnover:"🏗","PO Delivery":"📦","Billing Due":"💵","DRF Deadline":"📝",Backjob:"🔄",Maintenance:"⚙️","Site Visit":"🏗","Inspection":"🔍","Site Meeting":"👥"};
// Map any event type to a field-board code (new events store the code as their type).
const catFromType=t=>codeFromLabel[t]||({Turnover:"I","Site Visit":"P",Inspection:"P","Site Meeting":"P",Backjob:"R",Maintenance:"R"}[t])||"R";
const DOW=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const isoDate=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

function ConstructionCalendar({wonDeals,completedDeals,deals,pcards,jos,prs,billings,drfs,ceReqs,payables=[],setPage,setJumpDeal,today,Wrap,checklists=[],addOpsEvent,updateOpsEvent,deleteOpsEvent,session,updateProjectTurnover}){
  const[viewDate,setViewDate]=React.useState(new Date());
  const[selectedDay,setSelectedDay]=React.useState(null);
  const[calTab,setCalTab]=React.useState("board");
  const[eventModal,setEventModal]=React.useState(null); // {event}
  const[schedModal,setSchedModal]=React.useState(false);
  const[schedForm,setSchedForm]=React.useState({date:today,category:"R",location:"",projectId:"",title:"",workDetail:"",assignedTo:"",notes:"",status:"Scheduled"});
  const[editSchedId,setEditSchedId]=React.useState(null);
  const[projQuery,setProjQuery]=React.useState(""); // searchable project picker
  const[projOpen,setProjOpen]=React.useState(false);
  const projLabel=d=>d?(d.contact?`${d.contact} — ${d.client}`:d.client):""; // project name first, client second
  const projById=React.useMemo(()=>Object.fromEntries(wonDeals.map(d=>[d.id,d])),[wonDeals]);
  const[boardMonday,setBoardMonday]=React.useState(()=>{const d=new Date(today+"T00:00:00");const dow=d.getDay();d.setDate(d.getDate()-((dow+6)%7));d.setHours(0,0,0,0);return d;}); // Monday of the current week

  const opsEvents=React.useMemo(()=>checklists.filter(c=>OPS_EVENT_TYPES.includes(c.type)&&c.dept==="Operations"&&c.dueDate&&c.status!=="Done"),[checklists]);

  // ── Field Board: the six weekdays (Mon–Sat) of the selected week ──────────
  const boardDays=React.useMemo(()=>{
    return Array.from({length:6},(_,i)=>{const d=new Date(boardMonday);d.setDate(d.getDate()+i);return{date:isoDate(d),dow:DOW[d.getDay()],dd:`${String(d.getMonth()+1).padStart(2,"0")}.${String(d.getDate()).padStart(2,"0")}`};});
  },[boardMonday]);
  // All ops-created field jobs (any status) that fall inside the visible week,
  // grouped by day. Unlike opsEvents this keeps Done items so the week reads true.
  const boardJobs=React.useMemo(()=>{
    const start=boardDays[0]?.date, end=boardDays[5]?.date;
    if(!start||!end) return {};
    const inWeek=checklists.filter(c=>c.dept==="Operations"&&OPS_EVENT_TYPES.includes(c.type)&&c.dueDate&&c.dueDate>=start&&c.dueDate<=end);
    const map={};boardDays.forEach(d=>map[d.date]=[]);
    inWeek.forEach(c=>{const cat=c.category||catFromType(c.type);const proj=wonDeals.find(d=>d.id===c.projectId);(map[c.dueDate]=map[c.dueDate]||[]).push({...c,cat,projName:proj?.contact||proj?.client||c.title||"Untitled",client:proj?.client||""});});
    Object.values(map).forEach(a=>a.sort((x,y)=>(x.cat||"").localeCompare(y.cat||"")));
    return map;
  },[checklists,boardDays,wonDeals]);
  const boardCoordLoad=React.useMemo(()=>{
    const m={};Object.values(boardJobs).flat().forEach(j=>{const who=(j.assignedTo||"").trim();if(!who)return;m[who]=(m[who]||0)+1;});
    return Object.entries(m).map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count);
  },[boardJobs]);
  const boardTotal=React.useMemo(()=>Object.values(boardJobs).reduce((s,a)=>s+a.length,0),[boardJobs]);
  const boardMaxLoad=boardCoordLoad.length?boardCoordLoad[0].count:0;

  const openSched=(date=today,ev=null)=>{
    if(ev){const cat=ev.category||catFromType(ev.type);setSchedForm({date:ev.dueDate||today,category:cat,location:ev.location||"",projectId:ev.projectId||"",title:ev.projectId?"":(ev.title||""),workDetail:ev.workDetail||"",assignedTo:ev.assignedTo||"",notes:ev.notes||"",status:ev.status||"Scheduled"});setProjQuery(projLabel(projById[ev.projectId]));setEditSchedId(ev.id);}
    else{setSchedForm({date,category:"R",location:"",projectId:"",title:"",workDetail:"",assignedTo:"",notes:"",status:"Scheduled"});setProjQuery("");setEditSchedId(null);}
    setProjOpen(false);
    setSchedModal(true);
  };
  const saveSched=()=>{
    // A job belongs to a project (its title IS the project) OR carries a free-text
    // title for work not yet tied to a won project. One of the two is required.
    const customTitle=(schedForm.title||"").trim();
    const workDetail=(schedForm.workDetail||"").trim();
    // "Others" work needs a free-text description of what the job is.
    if(!schedForm.date||!schedForm.category||(!schedForm.projectId&&!customTitle)||(schedForm.category==="O"&&!workDetail)) return;
    const proj=schedForm.projectId?projById[schedForm.projectId]:null;
    const cat=schedForm.category;
    const title=proj?(projLabel(proj)||proj.client||""):customTitle;
    const data={type:CAT_LABEL_BY_CODE[cat]||"Repair",category:cat,workDetail:cat==="O"?workDetail:"",location:schedForm.location||"",title,dueDate:schedForm.date,projectId:schedForm.projectId||"",dealId:schedForm.projectId||"",assignedTo:schedForm.assignedTo||"",notes:schedForm.notes||"",status:schedForm.status||"Scheduled",priority:"Normal"};
    if(editSchedId) updateOpsEvent?.(editSchedId,data);
    else addOpsEvent?.(data);
    setSchedModal(false);setEditSchedId(null);
  };

  const events=React.useMemo(()=>{
    const list=[];
    wonDeals.forEach(d=>{
      const pc=pcards[d.id];const jo=jos.find(j=>j.dealId===d.id);
      if(pc?.targetEndDate) list.push({date:pc.targetEndDate,type:"end",label:d.client,sub:d.ceNo||"",detail:"PM: "+(jo?.pm1||"—"),color:d.stage==="14 · Completed"?"#059669":"#3b82f6",icon:d.stage==="14 · Completed"?"✅":"🏗",dealId:d.id});
    });
    prs.filter(p=>p.deliveryDate&&!["Delivered","Cancelled"].includes(p.status)).forEach(p=>{
      const d=wonDeals.find(x=>x.id===(p.projectId||p.dealId));
      list.push({date:p.deliveryDate,type:"delivery",label:d?.client||"?",sub:p.itemName||"Delivery",detail:d?.ceNo||"",color:"#f97316",icon:"📦",dealId:d?.id});
    });
    billings.filter(b=>b.dueDate&&b.status!=="Fully Paid"&&Number(b.amount||0)>0).forEach(b=>{
      const d=wonDeals.find(x=>x.id===b.dealId);
      list.push({date:b.dueDate,type:"billing",label:d?.client||"?",sub:b.name||"Billing",detail:"₱"+Number(b.amount||0).toLocaleString("en-PH",{maximumFractionDigits:0}),color:"#10b981",icon:"💵",dealId:d?.id});
    });
    drfs.filter(d=>d.designDeadline&&d.status!=="Done").forEach(d=>{
      const deal=wonDeals.find(x=>x.id===d.dealId);
      list.push({date:d.designDeadline,type:"drf",label:deal?.client||d.client||"?",sub:d.drfNo||"DRF",detail:d.projectTitle||"",color:"#ec4899",icon:"📝",dealId:d.dealId});
    });
    (ceReqs||[]).filter(r=>r.targetDeadline&&r.status!=="Done").forEach(r=>{
      list.push({date:r.targetDeadline,type:"ce",label:r.clientName||"?",sub:r.projectName||"CE Request",detail:`${r.priority} priority · ${r.status}`,color:"#8b5cf6",icon:"📐",ceId:r.id});
    });
    opsEvents.forEach(ev=>{
      const d=wonDeals.find(x=>x.id===ev.projectId);
      list.push({date:ev.dueDate,type:"ops",label:ev.title,sub:ev.type,detail:ev.assignedTo?`Assigned: ${ev.assignedTo}`:"",color:OPS_EVENT_COLORS[ev.type]||"#64748b",icon:OPS_EVENT_ICONS[ev.type]||"🔧",opsId:ev.id,opsEvent:ev,dealId:ev.projectId,project:d?.client});
    });
    return list;
  },[wonDeals,pcards,jos,prs,billings,drfs,ceReqs,opsEvents]);

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
    billings.filter(b=>b.dueDate&&b.status!=="Fully Paid"&&Number(b.amount||0)>0).forEach(b=>{
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

  // ── Calendar data-gap audit ──────────────────────────────────────────────
  const calendarGaps=React.useMemo(()=>{
    const gaps=[];
    // Projects missing turnover date
    wonDeals.forEach(d=>{
      const pc=pcards[d.id];
      if(!pc?.targetEndDate) gaps.push({type:"project",icon:"🏗",label:d.client||d.ceNo||"Unknown",sub:d.ceNo||"",issue:"No turnover date set",severity:"high",dealId:d.id});
    });
    // Projects missing PM assignment
    wonDeals.forEach(d=>{
      const jo=jos.find(j=>j.dealId===d.id);
      if(!jo?.pm1) gaps.push({type:"project",icon:"👷",label:d.client||d.ceNo||"Unknown",sub:d.ceNo||"",issue:"No PM assigned",severity:"medium",dealId:d.id});
    });
    // Active DRFs missing design deadline
    drfs.filter(d=>d.status!=="Done"&&!d.designDeadline).forEach(d=>{
      const deal=wonDeals.find(x=>x.id===d.dealId);
      gaps.push({type:"drf",icon:"📝",label:deal?.client||d.client||"Unknown",sub:d.drfNo||"DRF",issue:"No design deadline",severity:"high",dealId:d.dealId});
    });
    // Open POs missing delivery date
    prs.filter(p=>!["Delivered","Cancelled"].includes(p.status)&&!p.deliveryDate).forEach(p=>{
      const d=wonDeals.find(x=>x.id===(p.projectId||p.dealId));
      gaps.push({type:"po",icon:"📦",label:d?.client||"Unknown",sub:p.itemName||"PO",issue:"No delivery date",severity:"medium",dealId:d?.id});
    });
    // Open billings missing due date
    billings.filter(b=>b.status!=="Fully Paid"&&b.status!=="Cancelled"&&!b.dueDate).forEach(b=>{
      const d=wonDeals.find(x=>x.id===b.dealId);
      gaps.push({type:"billing",icon:"💵",label:d?.client||"Unknown",sub:b.name||"Invoice",issue:"No due date",severity:"medium",dealId:d?.id});
    });
    return gaps;
  },[wonDeals,pcards,jos,drfs,prs,billings]);
  const[gapOpen,setGapOpen]=React.useState(false);
  // Once the user has seen a given set of gaps, stop nagging about that exact
  // set on every visit — only resurface the banner when the gap list actually
  // changes (new/different missing details), not just because they reopened
  // the calendar.
  const gapSignature=calendarGaps.map(g=>`${g.type}:${g.dealId||g.ceId||""}:${g.issue}`).sort().join("|");
  const[dismissedGapSig,setDismissedGapSig]=React.useState(()=>{try{return localStorage.getItem("fabhub:dismissedGapSig")||"";}catch{return "";}});
  const gapBannerVisible=calendarGaps.length>0&&gapSignature!==dismissedGapSig;
  const dismissGaps=()=>{try{localStorage.setItem("fabhub:dismissedGapSig",gapSignature);}catch{}setDismissedGapSig(gapSignature);};

  const TABS=[{id:"board",l:"🗂 Field Board"},{id:"calendar",l:"📅 Monthly"},{id:"thisweek",l:"⚡ This Week"},{id:"schedule",l:`📋 Items${opsEvents.length>0?" ("+opsEvents.length+")":""}`},{id:"conflicts",l:"⚠️ Conflicts"},{id:"cashflow",l:"💵 Cash Flow"},{id:"capacity",l:"👷 Team Load"},{id:"gaps",l:`🔍 Data Gaps${calendarGaps.length>0?" ("+calendarGaps.length+")":""}`}];
  const BTN=(p)=><button onClick={p.onClick} style={{...{background:p.active?"#1e293b":"#f8fafc",color:p.active?"#fff":"#64748b",border:`1.5px solid ${p.active?"#1e293b":"#e2e8f0"}`,borderRadius:8,padding:"6px 14px",fontFamily:"inherit",fontWeight:700,fontSize:".78rem",cursor:"pointer"},...(p.style||{})}}>{p.children}</button>;

  return(
    <Wrap>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
        <div>
          <h2 style={{margin:0,fontWeight:900,fontSize:"1.4rem",color:"#0f172a",fontFamily:"'Barlow Condensed',sans-serif"}}>📅 Project Calendar</h2>
          <div style={{fontSize:".75rem",color:"#64748b",marginTop:2}}>Conflict detection · cash flow · team capacity</div>
        </div>
        <div style={{display:"flex",gap:8}}>
          {addOpsEvent&&<button onClick={()=>openSched(today)} style={{background:"#3b82f6",border:"none",borderRadius:8,padding:"7px 16px",fontFamily:"inherit",fontWeight:700,fontSize:".82rem",color:"#fff",cursor:"pointer"}}>+ Add Item</button>}
          <button onClick={()=>setPage("home")} style={{background:"#f1f5f9",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"7px 14px",fontFamily:"inherit",fontWeight:600,fontSize:".8rem",color:"#475569",cursor:"pointer"}}>← Dashboard</button>
        </div>
      </div>

      {gapBannerVisible&&(
        <div style={{background:"#fff7ed",border:"1.5px solid #fed7aa",borderRadius:12,padding:"10px 16px",marginBottom:14}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",flex:1}} onClick={()=>setGapOpen(o=>!o)}>
              <span style={{background:"#ef4444",color:"#fff",fontWeight:800,fontSize:".72rem",borderRadius:20,padding:"2px 8px",minWidth:24,textAlign:"center"}}>{calendarGaps.length}</span>
              <span style={{fontWeight:700,color:"#c2410c",fontSize:".85rem"}}>Calendar data gaps — some events won't appear on the calendar</span>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <span onClick={()=>setGapOpen(o=>!o)} style={{color:"#c2410c",fontSize:".78rem",fontWeight:600,cursor:"pointer"}}>{gapOpen?"▲ Hide":"▼ Show"}</span>
              <span onClick={dismissGaps} title="Dismiss until this list changes" style={{color:"#c2410c",fontSize:".9rem",fontWeight:700,cursor:"pointer",padding:"0 2px"}}>✕</span>
            </div>
          </div>
          {gapOpen&&(
            <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:4}}>
              {[{key:"project",label:"Projects",color:"#3b82f6"},{key:"drf",label:"DRFs",color:"#ec4899"},{key:"po",label:"Purchase Orders",color:"#f97316"},{key:"billing",label:"Billings",color:"#10b981"}].map(({key,label,color})=>{
                const items=calendarGaps.filter(g=>g.type===key);
                if(!items.length)return null;
                return(
                  <div key={key}>
                    <div style={{fontWeight:700,fontSize:".7rem",color:color,textTransform:"uppercase",letterSpacing:".5px",marginBottom:2,marginTop:4}}>{label} ({items.length})</div>
                    {items.map((g,i)=>(
                      <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 8px",background:"#fff",borderRadius:7,border:"1px solid #fed7aa",marginBottom:3}}>
                        <span style={{fontSize:".82rem"}}>{g.icon}</span>
                        <span style={{fontWeight:700,color:"#0f172a",fontSize:".78rem",flex:1}}>{g.label}</span>
                        <span style={{fontSize:".72rem",color:"#64748b"}}>{g.sub}</span>
                        <span style={{fontSize:".7rem",fontWeight:700,color:g.severity==="high"?"#ef4444":"#f59e0b",background:g.severity==="high"?"#fef2f2":"#fefce8",border:`1px solid ${g.severity==="high"?"#fecaca":"#fde68a"}`,borderRadius:20,padding:"1px 7px"}}>{g.issue}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div style={{display:"flex",gap:4,marginBottom:16,flexWrap:"wrap"}}>
        {TABS.map(t=><BTN key={t.id} active={calTab===t.id} onClick={()=>setCalTab(t.id)}>{t.l}</BTN>)}
      </div>

      {calTab==="board"&&(()=>{
        const wkNo=(()=>{const d=new Date(boardMonday);const oneJan=new Date(d.getFullYear(),0,1);return Math.ceil((((d-oneJan)/86400000)+oneJan.getDay()+1)/7);})();
        const rangeLbl=`${boardMonday.toLocaleDateString("en-PH",{month:"short",day:"numeric"})} – ${new Date(boardMonday.getTime()+5*86400000).toLocaleDateString("en-PH",{day:"numeric"})}`;
        const shiftWeek=n=>setBoardMonday(m=>{const d=new Date(m);d.setDate(d.getDate()+n*7);return d;});
        const thisMonday=()=>{const d=new Date(today+"T00:00:00");d.setDate(d.getDate()-((d.getDay()+6)%7));d.setHours(0,0,0,0);return d;};
        return(
        <div>
          {/* ── Board header ── */}
          <div style={{background:"#14243f",borderRadius:"10px 10px 0 0",padding:"14px 20px",display:"flex",flexWrap:"wrap",gap:12,alignItems:"flex-end",justifyContent:"space-between",borderBottom:"4px solid #f07f2c"}}>
            <div>
              <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,letterSpacing:".14em",fontSize:".72rem",color:"#f07f2c",textTransform:"uppercase"}}>GMD Productions · Operations</div>
              <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:"1.6rem",lineHeight:1,textTransform:"uppercase",color:"#fff"}}>Weekly Field Board</div>
            </div>
            <div style={{textAlign:"right",lineHeight:1.2}}>
              <div style={{display:"flex",gap:6,justifyContent:"flex-end",marginBottom:4}}>
                <BTN onClick={()=>shiftWeek(-1)} style={{padding:"3px 10px",fontSize:".72rem"}}>‹</BTN>
                <BTN onClick={()=>setBoardMonday(thisMonday())} style={{padding:"3px 10px",fontSize:".72rem"}}>This week</BTN>
                <BTN onClick={()=>shiftWeek(1)} style={{padding:"3px 10px",fontSize:".72rem"}}>›</BTN>
              </div>
              <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:600,fontSize:"1.2rem",color:"#fff"}}>WK {wkNo} · {rangeLbl}</div>
              <div style={{fontSize:".7rem",color:"#aebbcd"}}>{boardTotal} job{boardTotal!==1?"s":""} · {boardCoordLoad.length} coordinator{boardCoordLoad.length!==1?"s":""}</div>
            </div>
          </div>
          {/* ── Legend + coordinator load ── */}
          <div style={{background:"#1f3557",color:"#fff",padding:"10px 20px",display:"flex",flexWrap:"wrap",gap:16,justifyContent:"space-between",alignItems:"center"}}>
            <div style={{display:"flex",flexWrap:"wrap",gap:12}}>
              {WORK_CATEGORIES.map(c=>(
                <span key={c.code} style={{display:"flex",alignItems:"center",gap:5,fontSize:".74rem",color:"#d7dee8",fontWeight:500}}>
                  <span style={{width:10,height:10,borderRadius:3,background:c.color}}/>{c.label}
                </span>
              ))}
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6,alignItems:"center"}}>
              <span style={{fontSize:".62rem",letterSpacing:".12em",textTransform:"uppercase",color:"#8fa0b8",fontWeight:700}}>Load</span>
              {boardCoordLoad.length===0&&<span style={{fontSize:".72rem",color:"#8fa0b8"}}>— no coordinators assigned yet</span>}
              {boardCoordLoad.map(c=>{const hot=c.count>=Math.max(3,boardMaxLoad);return(
                <span key={c.name} style={{display:"flex",alignItems:"center",gap:5,background:hot?"rgba(240,127,44,.18)":"rgba(255,255,255,.08)",border:`1px solid ${hot?"#f07f2c":"rgba(255,255,255,.14)"}`,padding:"2px 8px",borderRadius:20,fontSize:".72rem",fontWeight:500,color:hot?"#ffd9b8":"#fff"}}>
                  {c.name} <b style={{color:hot?"#f07f2c":"#fff"}}>{c.count}</b>
                </span>
              );})}
            </div>
          </div>
          {/* ── Week grid ── */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:1,background:"#c9d2dd",border:"1px solid #c9d2dd",borderRadius:"0 0 10px 10px",overflow:"hidden"}}>
            {boardDays.map(day=>{
              const jobs=boardJobs[day.date]||[];const slack=jobs.length<=1;const isToday=day.date===today;
              return(
                <div key={day.date} style={{background:"#eef1f4",display:"flex",flexDirection:"column",minHeight:170}}>
                  <div style={{padding:"8px 11px",background:slack?"#f3e6d3":"#dde3ea",borderBottom:"1px solid #c9d2dd",display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
                    <div>
                      <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",fontSize:".92rem",color:isToday?"#f07f2c":"#14243f"}}>{day.dow}</div>
                      <div style={{fontSize:".66rem",color:"#5a6a80",fontFamily:"monospace"}}>{day.dd}</div>
                    </div>
                    <span style={{fontFamily:"monospace",fontSize:".66rem",color:"#fff",background:slack?"#f07f2c":"#14243f",borderRadius:10,padding:"1px 7px"}}>{jobs.length}</span>
                  </div>
                  <div style={{padding:7,display:"flex",flexDirection:"column",gap:7,flex:1}}>
                    {jobs.length===0&&<div style={{fontSize:".68rem",color:"#94a3b8",textAlign:"center",padding:"14px 0"}}>—</div>}
                    {jobs.map(j=>{const clr=CAT_COLOR[j.cat]||"#64748b";const done=j.status==="Done";return(
                      <div key={j.id} onClick={()=>openSched(j.dueDate,j)} title="Click to edit"
                        style={{background:"#fff",border:"1px solid #c9d2dd",borderLeft:`4px solid ${clr}`,borderRadius:6,padding:"7px 8px",position:"relative",cursor:"pointer",opacity:done?.6:1}}>
                        <span style={{position:"absolute",top:7,right:7,width:18,height:18,borderRadius:5,fontFamily:"monospace",fontWeight:700,fontSize:".68rem",color:"#fff",background:clr,display:"flex",alignItems:"center",justifyContent:"center"}}>{j.cat}</span>
                        <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:".95rem",lineHeight:1.05,color:"#14243f",paddingRight:22,textDecoration:done?"line-through":"none"}}>{j.projName}</div>
                        {j.workDetail&&<div style={{fontSize:".68rem",color:clr,marginTop:2,fontWeight:700}}>{j.workDetail}</div>}
                        {j.location&&<div style={{fontSize:".7rem",color:"#5a6a80",marginTop:2,fontWeight:500}}>{j.location}</div>}
                        {j.client&&j.client!==j.projName&&<div style={{fontSize:".64rem",color:"#94a3b8",marginTop:1}}>{j.client}</div>}
                        {j.notes&&<div style={{fontSize:".66rem",color:"#7a869a",marginTop:3,lineHeight:1.25}}>{j.notes}</div>}
                        {j.assignedTo&&<div style={{display:"inline-flex",alignItems:"center",gap:4,marginTop:5,fontSize:".68rem",fontWeight:600,color:"#14243f"}}><span style={{width:5,height:5,borderRadius:"50%",background:"#5a6a80"}}/>{j.assignedTo}</div>}
                      </div>
                    );})}
                    {addOpsEvent&&<button onClick={()=>openSched(day.date)} style={{marginTop:"auto",background:"transparent",border:"1px dashed #b6c1cf",borderRadius:6,padding:"5px",fontSize:".68rem",color:"#5a6a80",cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>+ Add job</button>}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{fontSize:".68rem",color:"#94a3b8",marginTop:8,display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:6}}>
            <span>Jobs added here appear on the Monthly calendar and This Week too. Sunday is a rest day and is hidden.</span>
            <span style={{fontFamily:"monospace"}}>I · Installation&nbsp; R · Repair&nbsp; P · Punchlist&nbsp; C · Construction&nbsp; O · Others</span>
          </div>
        </div>
        );
      })()}

      {calTab==="calendar"&&(<>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
          <BTN onClick={()=>setViewDate(d=>{const n=new Date(d);n.setMonth(n.getMonth()-1);return n;})}>‹ Prev</BTN>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:"1.3rem",color:"#0f172a"}}>{monthLabel}</div>
          <BTN onClick={()=>setViewDate(d=>{const n=new Date(d);n.setMonth(n.getMonth()+1);return n;})}>Next ›</BTN>
        </div>
        <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:12,padding:"8px 12px",background:"#f8fafc",borderRadius:10,border:"1px solid #e2e8f0"}}>
          {[{c:"#3b82f6",l:"Turnover"},{c:"#f97316",l:"PO Delivery"},{c:"#10b981",l:"Billing Due"},{c:"#ec4899",l:"DRF Deadline"},{c:"#ef4444",l:"Repair"},{c:"#dc2626",l:"Backjob"},{c:"#0ea5e9",l:"Site Visit"}].map(({c,l})=>(
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
                if(!day)return<div key={di} style={{minHeight:60,background:"#fafafa",borderRight:"1px solid #f1f5f9"}}/>;
                const ds=dateStr(day);const dayEvents=eventsByDate[ds]||[];
                const isToday=ds===today;const isSel=selectedDay===ds;
                return(
                  <div key={di} onClick={()=>setSelectedDay(isSel?null:ds)}
                    style={{minHeight:60,padding:"3px",borderRight:"1px solid #f1f5f9",background:isSel?"#eff6ff":isToday?"#fefce8":"#fff",cursor:"pointer",overflow:"hidden",boxSizing:"border-box",position:"relative"}}
                    onMouseEnter={ev=>{if(addOpsEvent){const btn=ev.currentTarget.querySelector('.add-btn');if(btn)btn.style.opacity=1;}}}
                    onMouseLeave={ev=>{const btn=ev.currentTarget.querySelector('.add-btn');if(btn)btn.style.opacity=0;}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:2}}>
                      <div style={{fontWeight:isToday?800:500,fontSize:".7rem",color:isToday?"#f59e0b":"#0f172a",width:20,height:20,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:"50%",background:isToday?"#fef9c3":undefined}}>{day}</div>
                      {addOpsEvent&&<button className="add-btn" onClick={ev=>{ev.stopPropagation();openSched(ds);}} style={{opacity:0,transition:"opacity .15s",background:"#ef4444",border:"none",borderRadius:3,color:"#fff",fontSize:".55rem",fontWeight:700,padding:"1px 4px",cursor:"pointer",lineHeight:1.2,fontFamily:"inherit"}}>+</button>}
                    </div>
                    {dayEvents.slice(0,3).map((e,ei)=>(
                      <div key={ei} onClick={ev=>{ev.stopPropagation();if(e.opsEvent)openSched(e.date,e.opsEvent);else setEventModal(e);}}
                        style={{background:e.color+"22",borderLeft:`2px solid ${e.color}`,borderRadius:3,padding:"1px 3px",marginBottom:1,fontSize:".55rem",color:e.color,fontWeight:700,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis",cursor:"pointer",maxWidth:"100%",boxSizing:"border-box"}}>
                        {e.icon} {e.label}
                      </div>
                    ))}
                    {dayEvents.length>3&&<div style={{fontSize:".52rem",color:"#94a3b8",paddingLeft:2}}>+{dayEvents.length-3} more</div>}
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
              <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 16px",borderBottom:i<(eventsByDate[selectedDay]||[]).length-1?"1px solid #f8fafc":""}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:e.color,flexShrink:0}}/>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,color:"#0f172a",fontSize:".85rem"}}>{e.icon} {e.label}</div>
                  <div style={{fontSize:".72rem",color:"#64748b",marginTop:1}}>{e.sub}{e.detail?" · "+e.detail:""}</div>
                </div>
                <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
                  <span style={{fontSize:".68rem",fontWeight:700,color:e.color,background:e.color+"18",border:`1px solid ${e.color}44`,borderRadius:20,padding:"2px 8px"}}>
                    {e.type==="end"?"Turnover":e.type==="delivery"?"PO Delivery":e.type==="billing"?"Billing Due":e.type==="drf"?"DRF Deadline":e.type==="ce"?"CE Request":e.sub||e.type}
                  </span>
                  {e.dealId&&<button onClick={()=>{
                    // Route by event type like eventModal's buttons do below —
                    // this list previously always sent Turnover/DRF/PO Delivery
                    // events to Billing regardless of what they actually were.
                    if(e.type==="end"){setJumpDeal&&setJumpDeal(e.dealId);setPage("projects");}
                    else if(e.type==="drf")setPage("drf");
                    else if(e.type==="delivery")setPage("budget");
                    else setPage("billing");
                  }} style={{fontSize:".7rem",fontWeight:700,background:"#eff6ff",color:"#3b82f6",border:"1px solid #bfdbfe",borderRadius:6,padding:"2px 8px",cursor:"pointer",fontFamily:"inherit"}}>→ View</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </>)}

      {/* Event detail modal */}
      {schedModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,.6)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setSchedModal(false)}>
          <div style={{background:"#fff",borderRadius:16,padding:24,width:"100%",maxWidth:420,boxShadow:"0 20px 60px rgba(0,0,0,.3)"}} onClick={e=>e.stopPropagation()}>
            <div style={{fontWeight:800,color:"#0f172a",fontSize:"1.05rem",marginBottom:16}}>{editSchedId?"✏ Edit Field Job":"📅 Add Field Job"}</div>
            <div style={{marginBottom:10}}>
              <div style={{fontSize:".72rem",fontWeight:700,color:"#64748b",textTransform:"uppercase",marginBottom:4}}>Date *</div>
              <input type="date" value={schedForm.date||""} onChange={e=>setSchedForm(p=>({...p,date:e.target.value}))} style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"7px 10px",fontFamily:"inherit",fontSize:".85rem",boxSizing:"border-box"}}/>
            </div>
            {/* Project — optional, searchable by project name. Leave blank for
                work not yet tied to a won project and give it a title below. */}
            <div style={{marginBottom:10,position:"relative"}}>
              <div style={{fontSize:".72rem",fontWeight:700,color:"#64748b",textTransform:"uppercase",marginBottom:4}}>Project <span style={{color:"#94a3b8",fontWeight:600,textTransform:"none"}}>(leave blank if none yet)</span></div>
              <input
                value={projQuery}
                onChange={e=>{setProjQuery(e.target.value);setProjOpen(true);if(schedForm.projectId)setSchedForm(p=>({...p,projectId:""}));}}
                onFocus={()=>setProjOpen(true)}
                onBlur={()=>setTimeout(()=>setProjOpen(false),150)}
                placeholder="Search project name…"
                style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"7px 10px",fontFamily:"inherit",fontSize:".85rem",boxSizing:"border-box"}}/>
              {projOpen&&(()=>{
                const q=projQuery.trim().toLowerCase();
                const matches=wonDeals.filter(d=>!q||projLabel(d).toLowerCase().includes(q)).slice(0,10);
                return(
                  <div style={{position:"absolute",zIndex:10,left:0,right:0,background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:8,marginTop:3,maxHeight:230,overflowY:"auto",boxShadow:"0 8px 24px rgba(15,23,42,.14)"}}>
                    {matches.length===0&&<div style={{padding:"9px 12px",fontSize:".8rem",color:"#94a3b8"}}>No matching project</div>}
                    {matches.map(d=>(
                      <div key={d.id} onMouseDown={()=>{setSchedForm(p=>({...p,projectId:d.id}));setProjQuery(projLabel(d));setProjOpen(false);}}
                        style={{padding:"8px 12px",fontSize:".82rem",cursor:"pointer",borderBottom:"1px solid #f1f5f9",background:d.id===schedForm.projectId?"#eff6ff":"#fff"}}>
                        <div style={{fontWeight:700,color:"#14243f"}}>{d.contact||d.client}</div>
                        {d.contact&&<div style={{fontSize:".72rem",color:"#94a3b8"}}>{d.client}</div>}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
            {/* Job title — required only when no project is chosen */}
            {!schedForm.projectId&&(
              <div style={{marginBottom:10}}>
                <div style={{fontSize:".72rem",fontWeight:700,color:"#64748b",textTransform:"uppercase",marginBottom:4}}>Job Title *</div>
                <input value={schedForm.title||""} onChange={e=>setSchedForm(p=>({...p,title:e.target.value}))} placeholder="e.g. Site survey — Ayala Malls (no project yet)"
                  style={{width:"100%",border:`1.5px solid ${(schedForm.title||"").trim()?"#e2e8f0":"#f0b4a8"}`,borderRadius:8,padding:"7px 10px",fontFamily:"inherit",fontSize:".85rem",boxSizing:"border-box"}}/>
              </div>
            )}
            {/* Type of Work (I/R/P/C) — colour-coded — + Location */}
            <div style={{display:"flex",gap:10,marginBottom:10}}>
              <div style={{flex:1}}>
                <div style={{fontSize:".72rem",fontWeight:700,color:"#64748b",textTransform:"uppercase",marginBottom:4}}>Type of Work *</div>
                <select value={schedForm.category||"R"} onChange={e=>setSchedForm(p=>({...p,category:e.target.value}))} style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"7px 10px",fontFamily:"inherit",fontSize:".85rem",background:"#fff",borderLeft:`5px solid ${CAT_COLOR[schedForm.category]||"#64748b"}`}}>
                  {WORK_CATEGORIES.map(c=><option key={c.code} value={c.code}>{c.code} · {c.label}</option>)}
                </select>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:".72rem",fontWeight:700,color:"#64748b",textTransform:"uppercase",marginBottom:4}}>Location / Mall</div>
                <input value={schedForm.location||""} onChange={e=>setSchedForm(p=>({...p,location:e.target.value}))} placeholder="e.g. BGC, Shangri-La" style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"7px 10px",fontFamily:"inherit",fontSize:".85rem",boxSizing:"border-box"}}/>
              </div>
            </div>
            {/* Others — describe what the job actually is */}
            {schedForm.category==="O"&&(
              <div style={{marginBottom:10}}>
                <div style={{fontSize:".72rem",fontWeight:700,color:"#64748b",textTransform:"uppercase",marginBottom:4}}>Describe the work *</div>
                <input value={schedForm.workDetail||""} onChange={e=>setSchedForm(p=>({...p,workDetail:e.target.value}))} placeholder="e.g. Ocular / site measurement, Client meeting"
                  style={{width:"100%",border:`1.5px solid ${(schedForm.workDetail||"").trim()?"#e2e8f0":"#f0b4a8"}`,borderRadius:8,padding:"7px 10px",fontFamily:"inherit",fontSize:".85rem",boxSizing:"border-box"}}/>
              </div>
            )}
            <div style={{marginBottom:10}}>
              <div style={{fontSize:".72rem",fontWeight:700,color:"#64748b",textTransform:"uppercase",marginBottom:4}}>Assigned To</div>
              <input value={schedForm.assignedTo||""} onChange={e=>setSchedForm(p=>({...p,assignedTo:e.target.value}))} placeholder="e.g. Rodel, PM Team" style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"7px 10px",fontFamily:"inherit",fontSize:".85rem",boxSizing:"border-box"}}/>
            </div>
            <div style={{marginBottom:10}}>
              <div style={{fontSize:".72rem",fontWeight:700,color:"#64748b",textTransform:"uppercase",marginBottom:4}}>Status</div>
              <select value={schedForm.status||"Scheduled"} onChange={e=>setSchedForm(p=>({...p,status:e.target.value}))} style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"7px 10px",fontFamily:"inherit",fontSize:".85rem",background:"#fff"}}>
                {["Scheduled","In Progress","Done"].map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
            <div style={{marginBottom:18}}>
              <div style={{fontSize:".72rem",fontWeight:700,color:"#64748b",textTransform:"uppercase",marginBottom:4}}>Notes</div>
              <textarea value={schedForm.notes||""} onChange={e=>setSchedForm(p=>({...p,notes:e.target.value}))} placeholder="Additional details…" rows={2} style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"7px 10px",fontFamily:"inherit",fontSize:".85rem",boxSizing:"border-box",resize:"vertical"}}/>
            </div>
            <div style={{display:"flex",gap:8}}>
              {(()=>{const dis=!schedForm.date||!schedForm.category||(!schedForm.projectId&&!(schedForm.title||"").trim())||(schedForm.category==="O"&&!(schedForm.workDetail||"").trim());return(<button onClick={saveSched} disabled={dis} title={dis?"Add a date, type of work, and a project or job title":""} style={{flex:1,padding:"9px",background:dis?"#cbd5e1":(CAT_COLOR[schedForm.category]||"#3b82f6"),color:"#fff",border:"none",borderRadius:8,fontFamily:"inherit",fontWeight:700,fontSize:".85rem",cursor:dis?"not-allowed":"pointer"}}>{editSchedId?"Save Changes":"Add to Board"}</button>);})()}
              <button onClick={()=>{setSchedModal(false);setEditSchedId(null);}} style={{padding:"9px 16px",background:"#f1f5f9",color:"#64748b",border:"none",borderRadius:8,fontFamily:"inherit",fontWeight:600,fontSize:".85rem",cursor:"pointer"}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {eventModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,.6)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setEventModal(null)}>
          <div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:420,padding:0,overflow:"hidden",boxShadow:"0 20px 60px rgba(0,0,0,.25)"}} onClick={e=>e.stopPropagation()}>
            <div style={{background:eventModal.color,padding:"16px 20px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontWeight:800,color:"#fff",fontSize:"1.1rem"}}>{eventModal.icon} {eventModal.label}</div>
                <div style={{fontSize:".78rem",color:"rgba(255,255,255,.85)",marginTop:2}}>{eventModal.sub}</div>
              </div>
              <button onClick={()=>setEventModal(null)} style={{background:"rgba(255,255,255,.2)",border:"none",borderRadius:8,padding:"4px 10px",color:"#fff",cursor:"pointer",fontFamily:"inherit",fontSize:".85rem"}}>✕</button>
            </div>
            <div style={{padding:"16px 20px"}}>
              <div style={{display:"grid",gridTemplateColumns:window.innerWidth<768?"1fr":"1fr 1fr",gap:10,marginBottom:16}}>
                <div style={{background:"#f8fafc",borderRadius:8,padding:"10px 12px"}}>
                  <div style={{fontSize:".7rem",color:"#64748b",fontWeight:600}}>TYPE</div>
                  <div style={{fontWeight:700,color:"#0f172a",marginTop:2}}>{eventModal.type==="end"?"Turnover":eventModal.type==="delivery"?"PO Delivery":eventModal.type==="billing"?"Billing Due":"DRF Deadline"}</div>
                </div>
                <div style={{background:"#f8fafc",borderRadius:8,padding:"10px 12px"}}>
                  <div style={{fontSize:".7rem",color:"#64748b",fontWeight:600}}>DATE</div>
                  <div style={{fontWeight:700,color:"#0f172a",marginTop:2}}>{new Date(eventModal.date+"T00:00:00").toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"})}</div>
                </div>
              </div>
              {eventModal.detail&&<div style={{background:"#f0fdf4",border:"1px solid #6ee7b7",borderRadius:8,padding:"10px 12px",marginBottom:12,fontSize:".82rem",color:"#065f46"}}>{eventModal.detail}</div>}
              <div style={{display:"flex",gap:8}}>
                {eventModal.dealId&&eventModal.type==="billing"&&<button onClick={()=>{setEventModal(null);setPage("billing");}} style={{flex:1,padding:"9px",background:"#3b82f6",color:"#fff",border:"none",borderRadius:8,fontFamily:"inherit",fontWeight:700,fontSize:".82rem",cursor:"pointer"}}>💵 View Billing</button>}
                {eventModal.dealId&&eventModal.type==="end"&&<button onClick={()=>{setJumpDeal&&setJumpDeal(eventModal.dealId);setEventModal(null);setPage("projects");}} style={{flex:1,padding:"9px",background:"#3b82f6",color:"#fff",border:"none",borderRadius:8,fontFamily:"inherit",fontWeight:700,fontSize:".82rem",cursor:"pointer"}}>🏗 View Project</button>}
                {eventModal.dealId&&eventModal.type==="drf"&&<button onClick={()=>{setEventModal(null);setPage("drf");}} style={{flex:1,padding:"9px",background:"#ec4899",color:"#fff",border:"none",borderRadius:8,fontFamily:"inherit",fontWeight:700,fontSize:".82rem",cursor:"pointer"}}>📝 View DRF</button>}
                {eventModal.dealId&&eventModal.type==="delivery"&&<button onClick={()=>{setEventModal(null);setPage("budget");}} style={{flex:1,padding:"9px",background:"#f97316",color:"#fff",border:"none",borderRadius:8,fontFamily:"inherit",fontWeight:700,fontSize:".82rem",cursor:"pointer"}}>📦 View PO</button>}
                <button onClick={()=>setEventModal(null)} style={{padding:"9px 16px",background:"#f1f5f9",color:"#64748b",border:"none",borderRadius:8,fontFamily:"inherit",fontWeight:600,fontSize:".82rem",cursor:"pointer"}}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {calTab==="schedule"&&(()=>{
        const upcoming=opsEvents.filter(e=>e.status!=="Done").sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
        const done=opsEvents.filter(e=>e.status==="Done").sort((a,b)=>b.dueDate.localeCompare(a.dueDate)).slice(0,10);
        const STATUS_COLORS={"Scheduled":"#0ea5e9","In Progress":"#f59e0b","Done":"#059669"};
        return(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={{fontWeight:700,color:"#0f172a",fontSize:".95rem"}}>📋 Scheduled Items</div>
              {addOpsEvent&&<button onClick={()=>openSched(today)} style={{background:"#3b82f6",border:"none",borderRadius:8,padding:"7px 16px",fontFamily:"inherit",fontWeight:700,fontSize:".82rem",color:"#fff",cursor:"pointer"}}>+ Add Item</button>}
            </div>
            {upcoming.length===0&&<div style={{textAlign:"center",padding:"32px",color:"#94a3b8",fontSize:".85rem"}}>No upcoming items. Click "+ Add Item" to schedule one.</div>}
            {upcoming.map(ev=>{
              const proj=wonDeals.find(d=>d.id===ev.projectId);
              const clr=OPS_EVENT_COLORS[ev.type]||"#64748b";
              const isOverdue=ev.dueDate<today;
              return(
                <div key={ev.id} style={{background:"#fff",borderRadius:12,border:`1.5px solid ${isOverdue?"#fecaca":"#e2e8f0"}`,borderLeft:`4px solid ${clr}`,padding:"11px 16px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,flexWrap:"wrap"}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",gap:7,alignItems:"center",flexWrap:"wrap",marginBottom:3}}>
                      <span style={{fontWeight:700,color:"#0f172a",fontSize:".9rem"}}>{OPS_EVENT_ICONS[ev.type]||"🔧"} {ev.title}</span>
                      <span style={{fontSize:".65rem",fontWeight:700,padding:"1px 8px",borderRadius:20,background:clr+"22",color:clr}}>{ev.type}</span>
                      {isOverdue&&<span style={{fontSize:".65rem",fontWeight:700,padding:"1px 8px",borderRadius:20,background:"#fef2f2",color:"#ef4444"}}>OVERDUE</span>}
                    </div>
                    {ev.workDetail&&<div style={{fontSize:".75rem",color:clr,fontWeight:600,marginBottom:2}}>📌 {ev.workDetail}</div>}
                    {proj&&<div style={{fontSize:".75rem",color:"#8b5cf6",marginBottom:2}}>📁 {proj.client}{proj.contact?" — "+proj.contact:""}</div>}
                    {ev.assignedTo&&<div style={{fontSize:".72rem",color:"#64748b"}}>👤 {ev.assignedTo}</div>}
                    {ev.notes&&<div style={{fontSize:".75rem",color:"#64748b",marginTop:2}}>{ev.notes}</div>}
                    <div style={{fontSize:".7rem",color:isOverdue?"#ef4444":"#94a3b8",marginTop:4}}>{ev.dueDate}</div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:5,alignItems:"flex-end"}}>
                    <select value={ev.status||"Scheduled"} onChange={e=>{e.stopPropagation();updateOpsEvent?.(ev.id,{status:e.target.value});}} style={{border:"1.5px solid #e2e8f0",borderRadius:7,padding:"3px 7px",fontFamily:"inherit",fontSize:".72rem",background:"#fff",cursor:"pointer",color:STATUS_COLORS[ev.status||"Scheduled"]||"#0f172a",fontWeight:700}}>
                      {["Scheduled","In Progress","Done"].map(s=><option key={s}>{s}</option>)}
                    </select>
                    <div style={{display:"flex",gap:5}}>
                      <button onClick={()=>openSched(ev.dueDate,ev)} style={{background:"#f1f5f9",border:"none",borderRadius:6,padding:"3px 9px",fontSize:".7rem",color:"#475569",cursor:"pointer",fontFamily:"inherit"}}>✏</button>
                      <button onClick={()=>deleteOpsEvent?.(ev.id)} style={{background:"#fef2f2",border:"none",borderRadius:6,padding:"3px 9px",fontSize:".7rem",color:"#dc2626",cursor:"pointer",fontFamily:"inherit"}}>✕</button>
                    </div>
                  </div>
                </div>
              );
            })}
            {done.length>0&&(
              <div style={{marginTop:16}}>
                <div style={{fontSize:".72rem",fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:".8px",marginBottom:8}}>✅ Completed ({done.length})</div>
                {done.map(ev=>(
                  <div key={ev.id} style={{background:"#f8fafc",borderRadius:8,border:"1px solid #e2e8f0",padding:"8px 14px",marginBottom:5,display:"flex",justifyContent:"space-between",alignItems:"center",opacity:.7}}>
                    <div>
                      <span style={{fontWeight:600,color:"#64748b",fontSize:".82rem"}}>{OPS_EVENT_ICONS[ev.type]||"🔧"} {ev.title}</span>
                      <span style={{fontSize:".7rem",color:"#94a3b8",marginLeft:8}}>{ev.dueDate} · {ev.type}</span>
                    </div>
                    <button onClick={()=>deleteOpsEvent?.(ev.id)} style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:".72rem",fontFamily:"inherit"}}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {calTab==="thisweek"&&(
        <div>
          <div style={{fontWeight:700,color:"#0f172a",marginBottom:12}}>Next 7 Days — All Scheduled Events</div>
          {thisWeekEvents.length===0
            ?<div style={{background:"#f0fdf4",border:"1.5px solid #6ee7b7",borderRadius:12,padding:"24px",textAlign:"center",color:"#059669",fontWeight:700}}>✅ No events in the next 7 days</div>
            :thisWeekEvents.map((e,i)=>{
              const daysUntil=Math.ceil((new Date(e.date)-todayD)/(1000*60*60*24));
              return(
                <div key={i} onClick={()=>setEventModal(e)} style={{background:"#fff",borderRadius:10,border:`1.5px solid ${e.color}33`,padding:"12px 16px",marginBottom:8,display:"flex",alignItems:"center",gap:12,cursor:"pointer"}}>
                  <div style={{width:36,height:36,borderRadius:8,background:e.color+"20",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.1rem",flexShrink:0}}>{e.icon}</div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700,color:"#0f172a",fontSize:".88rem"}}>{e.label}</div>
                    <div style={{fontSize:".72rem",color:e.color,fontWeight:600,marginTop:1}}>{e.sub}</div>
                    {e.detail&&<div style={{fontSize:".68rem",color:"#94a3b8",marginTop:1}}>{e.detail}</div>}
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

      {calTab==="gaps"&&(
        <div>
          <div style={{fontWeight:700,color:"#0f172a",marginBottom:4,fontSize:"1rem"}}>🔍 Calendar Data Gaps</div>
          <div style={{fontSize:".75rem",color:"#64748b",marginBottom:14}}>These records are missing dates and won't appear on the calendar. Fill them in to keep the timeline accurate.</div>
          {calendarGaps.length===0
            ?<div style={{background:"#f0fdf4",border:"1.5px solid #6ee7b7",borderRadius:12,padding:"24px",textAlign:"center",color:"#059669",fontWeight:700,fontSize:".9rem"}}>✅ No gaps found — all records have the required dates.</div>
            :[{key:"project",label:"Projects",color:"#3b82f6",desc:"Missing turnover date or PM assignment — project won't show on the Monthly calendar or conflict/capacity tabs."},{key:"drf",label:"Design Requests (DRF)",color:"#ec4899",desc:"Active DRFs without a design deadline won't appear on the calendar."},{key:"po",label:"Purchase Orders",color:"#f97316",desc:"Open POs without a delivery date won't show on the calendar and won't trigger delivery warnings."},{key:"billing",label:"Billing Milestones",color:"#10b981",desc:"Invoices without a due date won't appear on the cash flow or billing calendar."}].map(({key,label,color,desc})=>{
              const items=calendarGaps.filter(g=>g.type===key);
              if(!items.length)return null;
              return(
                <div key={key} style={{marginBottom:16}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                    <div style={{width:10,height:10,borderRadius:"50%",background:color}}/>
                    <span style={{fontWeight:700,color:"#0f172a",fontSize:".88rem"}}>{label}</span>
                    <span style={{background:color+"22",color:color,fontSize:".7rem",fontWeight:700,borderRadius:20,padding:"1px 8px",border:`1px solid ${color}44`}}>{items.length} gap{items.length!==1?"s":""}</span>
                  </div>
                  <div style={{fontSize:".72rem",color:"#64748b",marginBottom:6,paddingLeft:18}}>{desc}</div>
                  <div style={{background:"#fff",borderRadius:10,border:"1.5px solid #e2e8f0",overflow:"hidden"}}>
                    {items.map((g,i)=>(
                      <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 14px",borderBottom:i<items.length-1?"1px solid #f1f5f9":"",background:i%2===0?"#fff":"#fafafa"}}>
                        <span style={{fontSize:".85rem",flexShrink:0}}>{g.icon}</span>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontWeight:700,color:"#0f172a",fontSize:".82rem",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{g.label}</div>
                          {g.sub&&<div style={{fontSize:".7rem",color:"#94a3b8",marginTop:1}}>{g.sub}</div>}
                        </div>
                        <span style={{fontSize:".7rem",fontWeight:700,flexShrink:0,color:g.severity==="high"?"#dc2626":"#d97706",background:g.severity==="high"?"#fef2f2":"#fffbeb",border:`1px solid ${g.severity==="high"?"#fecaca":"#fde68a"}`,borderRadius:20,padding:"2px 10px"}}>
                          {g.severity==="high"?"⚠ ":"· "}{g.issue}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          }
        </div>
      )}
    </Wrap>
  );
}

export default ConstructionCalendar;
