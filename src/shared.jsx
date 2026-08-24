// Shared constants, helpers and UI primitives used by both App.jsx and the
// code-split views in src/views/. Moved out of App.jsx verbatim so the lazy
// chunks don't have to pull in the whole main bundle.
import React,{useState,useEffect} from "react";
import {T} from "./theme";

export const fmt   = n => "₱" + Number(n||0).toLocaleString("en-PH",{minimumFractionDigits:0});
export const today=(()=>{const d=new Date();return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;})();
export const uid=()=>{
  if(crypto.randomUUID) return crypto.randomUUID();
  // UUID v4 fallback for older browsers / non-secure contexts
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==="x"?r:(r&0x3|0x8)).toString(16);});
};
export const KEYS={deals:"gmdv5:deals",projects:"gmdv5:projects",expenses:"gmdv5:expenses",inflows:"gmdv5:inflows",jos:"gmdv5:jos",swatches:"gmdv5:swatches",checklist:"gmdv5:checklist",role:"gmdv5:role",users:"gmdv5:users",session:"gmdv5:session",cashPos:"gmdv5:cashPos",prs:"gmdv5:prs",budgets:"gmdv5:budgets",mreqs:"gmdv5:mreqs",breqs:"gmdv5:breqs",addenda:"gmdv5:addenda",billings:"gmdv5:billings",vvip:"gmdv5:vvip",actlog:"gmdv5:actlog",pcards:"gmdv5:pcards",inventory:"gmdv5:inventory",stocklog:"gmdv5:stocklog",drfs:"gmdv5:drfs",botsettings:"gmdv5:botsettings",suppliers:"gmdv5:suppliers",subcons:"gmdv5:subcons",swos:"gmdv5:swos",customclients:"gmdv5:customclients",blockers:"gmdv5:blockers",boqLibrary:"gmdv5:boqLibrary",boqDrafts:"gmdv5:boqDrafts",vouchers:"gmdv5:vouchers",payables:"gmdv5:payables",loans:"gmdv5:loans",evouchers:"gmdv5:evouchers",dailylogs:"gmdv5:dailylogs",ceReqs:"gmdv5:ceReqs",announcements:"gmdv5:announcements"};
// type: "Operating" = working accounts in the Executive Summary totals;
// "Reserve" = Chinabank/Security/Unionbank savings, tracked separately (per Aerwin's sheet).
// acctNo/branch mirror the Bank Account Detail columns of the owners' cash-position report.
export const BANKS = [
  { id:"bpi",      name:"Bank of Philippine Island",  short:"BPI",        color:"#dc2626", capital:false, type:"Operating", acctNo:"6011048203",       branch:"TUAZON"        },
  { id:"metro",    name:"Metrobank",                  short:"Metrobank",   color:"#1d4ed8", capital:false, type:"Operating", acctNo:"382-7-38202059-2", branch:"BALAGTAS"      },
  { id:"china",    name:"Chinabank",                  short:"Chinabank",   color:"#15803d", capital:false, type:"Reserve",   acctNo:"—",                branch:"SM MARIKINA"   },
  { id:"bdo",      name:"Banco de Oro",               short:"BDO",         color:"#b45309", capital:false, type:"Operating", acctNo:"12758000370",      branch:"KATIPUNAN"     },
  { id:"security", name:"Security Bank",              short:"Security",    color:"#7c3aed", capital:false, type:"Reserve",   acctNo:"000079339805",     branch:"KAMIAS BRANCH" },
  { id:"union",    name:"Unionbank of the Philippines",short:"Unionbank",  color:"#0e7490", capital:true,  type:"Reserve",   acctNo:"0018 0000 8603",   branch:"ONLINE"        }, // GMD Capital — excluded from working capital
];

// Reactive mobile-breakpoint hook — the sanctioned way to branch on viewport.
// Prefer this over the ad-hoc `const mob=window.innerWidth<768` reads scattered
// through the app: those only re-evaluate when their component happens to
// re-render, so a memoized/stable subtree can get stuck at the wrong breakpoint
// on resize/rotate. This subscribes to resize and re-renders on the crossing.
// Must obey the rules of hooks (call at the top level of a component/hook).
export const MOBILE_BP = 768;
export function useIsMobile(bp=MOBILE_BP){
  const [m,setM]=useState(()=>typeof window!=="undefined"&&window.innerWidth<bp);
  useEffect(()=>{
    const h=()=>setM(window.innerWidth<bp);
    h();
    window.addEventListener("resize",h);
    return ()=>window.removeEventListener("resize",h);
  },[bp]);
  return m;
}

export const emptyBankRow = () => ({ beg:"", book:"", end:"", bizlink:"", float:"" });
export const emptyDayPosition = (date) => ({
  date,
  banks: Object.fromEntries(BANKS.map(b=>[b.id, emptyBankRow()])),
  collections: {
    fabhubAmt: 0,
    approvedPayments: [],   // billing payment IDs Finance has approved for this day
    manualCollections: [],
  },
  disbursements: { manual: [] },   // manual cash outflows for the day (drives the Disbursement column)
  floatingChecks: [],              // released cheques; carry over each day until cleared
  audit: [],                       // dedicated save log for this day: {at, by, action, changes}
  ytd: {
    supplierPayable: "",
    loansPayable: "",
    accountsReceivable: "",
    expectedCollection: "",
  },
  notes: "",
  savedAt: null,
});

export const Inp=({value,onChange,type="text",placeholder,min,max,readOnly,rows,style:sx})=>{
  // Using key+defaultValue pattern — safest focus fix, no hooks needed
  const base={width:"100%",border:`1.5px solid ${T.line}`,borderRadius:T.radius.md,padding:"10px 13px",fontFamily:"inherit",fontSize:".87rem",color:T.inkStrong,background:readOnly?T.surface2:T.surface,boxSizing:"border-box",transition:"border-color .15s",...(sx||{})};
  if(rows) return <textarea value={value||""} onChange={onChange} placeholder={placeholder} rows={rows} style={{...base,resize:"vertical"}}/>;
  return <input type={type} value={value||""} onChange={onChange} placeholder={placeholder} min={min} max={max} readOnly={readOnly} style={base}/>;
};
export const Sel=({value,onChange,children})=>(
  <select value={value} onChange={onChange} style={{width:"100%",border:`1.5px solid ${T.line}`,borderRadius:T.radius.md,padding:"10px 13px",fontFamily:"inherit",fontSize:".87rem",color:T.inkStrong,background:T.surface,boxSizing:"border-box",cursor:"pointer"}}>
    {children}
  </select>
);

export const Fld=({label,required,children,hint})=>(
  <div style={{marginBottom:16}}>
    <label style={{display:"block",fontSize:".72rem",fontWeight:700,color:T.inkSoft,textTransform:"uppercase",letterSpacing:".8px",marginBottom:6}}>
      {label}{required&&<span style={{color:T.danger,marginLeft:2}}>*</span>}
    </label>
    {children}
    {hint&&<div style={{fontSize:".7rem",color:T.inkFaint,marginTop:4}}>{hint}</div>}
  </div>
);
export const Card=({children,onClick,accent,ariaLabel,style:sx={}})=>(
  // When onClick is set the card is an interactive control, so it takes button
  // semantics + keyboard activation (Enter/Space) and shows the global focus
  // ring; a plain card stays a non-interactive <div>.
  <div onClick={onClick}
    {...(onClick?{role:"button",tabIndex:0,"aria-label":ariaLabel,onKeyDown:e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onClick(e);}}}:{})}
    style={{background:T.surface,borderRadius:T.radius.xl,border:`1.5px solid ${accent||T.line}`,padding:20,marginBottom:12,cursor:onClick?"pointer":"default",boxShadow:T.shadow.card,transition:"box-shadow .15s,border-color .15s",...sx}}
    onMouseEnter={e=>{if(onClick){e.currentTarget.style.boxShadow=T.shadow.cardHover;e.currentTarget.style.borderColor=accent||T.inkFaint;}}}
    onMouseLeave={e=>{if(onClick){e.currentTarget.style.boxShadow=T.shadow.card;e.currentTarget.style.borderColor=accent||T.line;}}}>
    {children}
  </div>
);
export const Modal=({open,onClose,title,children,wide,maxWidth})=>{
  const mob=window.innerWidth<768;
  if(!open) return null;
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,.5)",zIndex:1000,display:"flex",alignItems:mob?"flex-end":"center",justifyContent:"center",padding:mob?0:16}} onClick={mob?undefined:onClose}>
      <div style={{background:T.surface,borderRadius:mob?"18px 18px 0 0":18,padding:mob?"20px 16px 28px":28,width:"100%",maxWidth:mob?undefined:(maxWidth||wide?640:480),maxHeight:mob?"92vh":"94vh",overflowY:"auto",boxShadow:T.shadow.modal}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:mob?16:22}}>
          <div style={{fontWeight:800,fontSize:mob?"1rem":"1.1rem",color:T.ink}}>{title}</div>
          <button onClick={onClose} aria-label="Close" style={{background:T.surface3,border:"none",borderRadius:T.radius.md,width:32,height:32,cursor:"pointer",color:T.inkMuted,fontSize:"1rem",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
};
export const KPI=({label,value,color,sub,small})=>(
  <div style={{background:T.surface,borderRadius:T.radius.lg,padding:small?"14px 16px":"18px 20px",border:`1.5px solid ${T.line}`,boxShadow:T.shadow.kpi}}>
    <div style={{fontSize:small?"1.2rem":"1.55rem",fontWeight:800,color,fontFamily:T.displayFont,lineHeight:1}}>{value}</div>
    {sub&&<div style={{fontSize:".7rem",color,marginTop:3,opacity:.75}}>{sub}</div>}
    <div style={{fontSize:".65rem",textTransform:"uppercase",letterSpacing:"1px",color:T.inkFaint,marginTop:7}}>{label}</div>
  </div>
);
// Loading skeleton block — pulls the shimmer class defined in App.jsx's global
// stylesheet. Use for placeholder rows/cards while data is fetching.
export const Skeleton=({w="100%",h=16,r=8,style:sx})=>(
  <div className="fh-skel" aria-hidden="true" style={{width:w,height:h,borderRadius:r,...(sx||{})}}/>
);
// A titled loading placeholder for a whole page/panel while a lazy view or its
// data loads. Announced politely to assistive tech.
export const PageSkeleton=({rows=5,label="Loading…"})=>(
  <div role="status" aria-live="polite" style={{padding:"20px 4px"}}>
    <span style={{position:"absolute",width:1,height:1,overflow:"hidden",clip:"rect(0 0 0 0)"}}>{label}</span>
    <Skeleton w="38%" h={22} style={{marginBottom:18}}/>
    <div style={{display:"flex",gap:12,marginBottom:20}}>
      {[0,1,2,3].map(i=><Skeleton key={i} h={64} r={12}/>)}
    </div>
    {Array.from({length:rows}).map((_,i)=>(
      <div key={i} style={{display:"flex",gap:12,alignItems:"center",padding:"12px 0",borderBottom:`1px solid ${T.lineSoft}`}}>
        <Skeleton w={40} h={40} r={10}/>
        <div style={{flex:1}}>
          <Skeleton w={`${70-i*6}%`} h={13} style={{marginBottom:8}}/>
          <Skeleton w={`${45-i*4}%`} h={11}/>
        </div>
        <Skeleton w={64} h={26} r={20}/>
      </div>
    ))}
  </div>
);
export let _toastListeners=[];
export let _toastUpdateListeners=[];
export const toastEmit=(msg,type="success",duration=3500)=>{
  const id=Date.now()+Math.random();
  _toastListeners.forEach(fn=>fn({id,msg,type,duration}));
  return id;
};
// Updates an in-place toast (by the id toastEmit returned) instead of firing a
// new one — used for "saving… / saved / failed" sequences where the same slot
// should morph through states rather than stacking. Passing duration=null
// leaves the toast up (its original timer, if any, still applies).
export const toastUpdate=(id,msg,type,duration)=>{
  _toastUpdateListeners.forEach(fn=>fn({id,msg,type,duration}));
};
export function Toaster(){
  const[toasts,setToasts]=useState([]);
  useEffect(()=>{
    const handler=t=>{
      setToasts(p=>[...p,t]);
      setTimeout(()=>setToasts(p=>p.filter(x=>x.id!==t.id)),t.duration||3500);
    };
    const updateHandler=t=>{
      setToasts(p=>p.map(x=>x.id===t.id?{...x,msg:t.msg,type:t.type||x.type}:x));
      if(t.duration!=null) setTimeout(()=>setToasts(p=>p.filter(x=>x.id!==t.id)),t.duration);
    };
    _toastListeners.push(handler);
    _toastUpdateListeners.push(updateHandler);
    return()=>{
      _toastListeners=_toastListeners.filter(f=>f!==handler);
      _toastUpdateListeners=_toastUpdateListeners.filter(f=>f!==updateHandler);
    };
  },[]);
  if(!toasts.length) return null;
  const TYPE_STYLE={
    success:{bg:"#f0fdf4",border:"#6ee7b7",color:"#059669",icon:"✅"},
    error:  {bg:"#fef2f2",border:"#fca5a5",color:"#dc2626",icon:"❌"},
    warning:{bg:"#fffbeb",border:"#fde68a",color:"#92400e",icon:"⚠️"},
    info:   {bg:"#eff6ff",border:"#93c5fd",color:"#1d4ed8",icon:"ℹ️"},
    pending:{bg:"#f8fafc",border:"#cbd5e1",color:"#334155",icon:"⏳"},
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

// ─── DIALOGS ──────────────────────────────────────────────────────────────────
// Promise-based confirm / prompt / alert built on the same in-app Modal styling
// as the rest of FabHub, replacing the browser's blocking window.confirm/prompt/
// alert. They mirror the native signatures so call sites migrate 1:1:
//   if(await uiConfirm(msg)) …            // → true / false
//   const v = await uiPrompt(msg, def);   // → string / null   (null = cancelled)
//   uiAlert(msg);                         // fire-and-forget, resolves when closed
// A single <DialogHost/> mounted once at the app root renders whatever is queued.
export let _dialogListeners=[];
const _emitDialog=(spec)=>new Promise(resolve=>{
  const req={id:Date.now()+Math.random(),resolve,...spec};
  if(_dialogListeners.length===0){
    // No host mounted (e.g. unit/headless context) — fail safe to the browser
    // primitive so a missing provider never silently swallows a confirmation.
    if(spec.kind==="prompt") return resolve(window.prompt(spec.message,spec.defaultValue||""));
    if(spec.kind==="alert")  { window.alert(spec.message); return resolve(); }
    return resolve(window.confirm(spec.message));
  }
  _dialogListeners.forEach(fn=>fn(req));
});
// Accept either a plain message string or a full options object, so both
// uiConfirm("Delete?") and uiConfirm({title,message,tone,confirmLabel}) work.
const _norm=(msgOrOpts)=>typeof msgOrOpts==="string"?{message:msgOrOpts}:(msgOrOpts||{});
export const uiConfirm=(msgOrOpts)=>_emitDialog({kind:"confirm",..._norm(msgOrOpts)});
export const uiPrompt=(msgOrOpts,defaultValue="")=>_emitDialog({kind:"prompt",defaultValue,..._norm(msgOrOpts)});
export const uiAlert=(msgOrOpts)=>_emitDialog({kind:"alert",..._norm(msgOrOpts)});

export function DialogHost(){
  const[queue,setQueue]=useState([]);
  const cur=queue[0]||null;
  const[val,setVal]=useState("");
  const inputRef=React.useRef(null);
  const confirmRef=React.useRef(null);
  useEffect(()=>{
    const handler=req=>setQueue(q=>[...q,req]);
    _dialogListeners.push(handler);
    return()=>{_dialogListeners=_dialogListeners.filter(f=>f!==handler);};
  },[]);
  // Reset the field and move focus whenever a new dialog reaches the front.
  useEffect(()=>{
    if(!cur) return;
    setVal(cur.kind==="prompt"?(cur.defaultValue||""):"");
    const t=setTimeout(()=>{
      if(cur.kind==="prompt"&&inputRef.current){inputRef.current.focus();inputRef.current.select();}
      else if(confirmRef.current){confirmRef.current.focus();}
    },30);
    return()=>clearTimeout(t);
  },[cur?.id]);
  if(!cur) return null;
  const close=(result)=>{cur.resolve(result);setQueue(q=>q.slice(1));};
  const onConfirm=()=>close(cur.kind==="prompt"?val:cur.kind==="alert"?undefined:true);
  const onCancel =()=>close(cur.kind==="prompt"?null:cur.kind==="alert"?undefined:false);
  const tone=cur.tone||(cur.kind==="alert"?"info":"default");
  const TONE={
    danger: {accent:"#dc2626",btnBg:"#dc2626",icon:"🗑️"},
    warning:{accent:"#d97706",btnBg:"#d97706",icon:"⚠️"},
    info:   {accent:"#2563eb",btnBg:"#2563eb",icon:"ℹ️"},
    default:{accent:"#f59e0b",btnBg:"#0f172a",icon:"❓"},
  };
  const t=TONE[tone]||TONE.default;
  const confirmLabel=cur.confirmLabel||(cur.kind==="alert"?"OK":cur.kind==="prompt"?"Save":"Confirm");
  const cancelLabel=cur.cancelLabel||"Cancel";
  const mob=window.innerWidth<768;
  const titleId="dlg-title-"+cur.id;
  const onKey=e=>{
    if(e.key==="Escape"){e.preventDefault();onCancel();}
    else if(e.key==="Enter"&&(cur.kind!=="prompt"||!e.shiftKey)){e.preventDefault();onConfirm();}
  };
  return(
    <div role="presentation" onKeyDown={onKey}
      style={{position:"fixed",inset:0,background:"rgba(15,23,42,.55)",zIndex:2000,display:"flex",alignItems:mob?"flex-end":"center",justifyContent:"center",padding:mob?0:16,animation:"fadein .15s ease"}}
      onClick={cur.kind==="alert"?onCancel:undefined}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={e=>e.stopPropagation()}
        style={{background:"#fff",borderRadius:mob?"18px 18px 0 0":16,padding:mob?"22px 18px 24px":26,width:"100%",maxWidth:mob?undefined:420,boxShadow:"0 24px 80px rgba(0,0,0,.28)",borderTop:`4px solid ${t.accent}`}}>
        <div style={{display:"flex",gap:12,alignItems:"flex-start",marginBottom:cur.title?10:6}}>
          <span aria-hidden="true" style={{fontSize:"1.3rem",flexShrink:0,lineHeight:1.2}}>{t.icon}</span>
          <div style={{flex:1}}>
            <div id={titleId} style={{fontWeight:800,fontSize:"1.02rem",color:"#0f172a",lineHeight:1.35}}>
              {cur.title||(cur.kind==="alert"?"Notice":cur.kind==="prompt"?"Input required":"Please confirm")}
            </div>
            <div style={{fontSize:".88rem",color:"#475569",lineHeight:1.5,marginTop:5,whiteSpace:"pre-wrap"}}>{cur.message}</div>
          </div>
        </div>
        {cur.kind==="prompt"&&(
          <input ref={inputRef} value={val} onChange={e=>setVal(e.target.value)} placeholder={cur.placeholder||""}
            style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"10px 13px",fontFamily:"inherit",fontSize:".9rem",color:"#1e293b",boxSizing:"border-box",marginTop:8,marginBottom:2}}/>
        )}
        <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:18}}>
          {cur.kind!=="alert"&&(
            <button onClick={onCancel}
              style={{background:"#f1f5f9",border:"1.5px solid #e2e8f0",borderRadius:9,padding:"9px 16px",fontFamily:"inherit",fontSize:".85rem",fontWeight:700,color:"#475569",cursor:"pointer"}}>
              {cancelLabel}
            </button>
          )}
          <button ref={confirmRef} onClick={onConfirm}
            style={{background:t.btnBg,border:"none",borderRadius:9,padding:"9px 18px",fontFamily:"inherit",fontSize:".85rem",fontWeight:700,color:"#fff",cursor:"pointer"}}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── LIFECYCLE STRIP ──────────────────────────────────────────────────────────
// Slim, horizontal "where does this sit in the pipeline" indicator shared by the
// Procurement PO list and the Subcon Work Order list (and anywhere a document
// moves through ordered stages toward payment). Pass an array of stage nodes;
// reached stages fill in their color, the current partial stage shows hollow,
// and pending stages stay grey. Neutral colors come from the design tokens.
//   nodes: [{ label, done, half?, color }]
export const LifecycleStrip=({nodes=[],style:sx})=>{
  const summary=nodes.filter(x=>x.done).map(x=>x.label).join(", ")||"not started";
  return(
    <div role="img" aria-label={`Status: ${summary}`}
      style={{display:"flex",alignItems:"center",gap:0,flexWrap:"wrap",padding:"0 2px",...(sx||{})}}>
      {nodes.map((nd,i)=>(
        <React.Fragment key={i}>
          {i>0&&<span aria-hidden="true" style={{width:14,height:2,background:nd.done?nd.color:T.line,flexShrink:0}}/>}
          <span style={{display:"inline-flex",alignItems:"center",gap:4}}>
            <span aria-hidden="true" style={{width:8,height:8,borderRadius:"50%",flexShrink:0,
              background:nd.done&&!nd.half?nd.color:T.surface,
              border:`2px solid ${nd.done?nd.color:"#cbd5e1"}`}}/>
            <span style={{fontSize:".6rem",fontWeight:nd.done?700:500,color:nd.done?nd.color:T.inkFaint,whiteSpace:"nowrap",letterSpacing:".2px"}}>{nd.label}</span>
          </span>
        </React.Fragment>
      ))}
    </div>
  );
};

// Make a non-<button> element (an expandable row, a clickable card) operable by
// keyboard, not just mouse: spreads role="button", tabIndex, and an Enter/Space
// handler that fires the same onClick. The global :focus-visible ring then gives
// it a visible focus state. Use: <div {...clickable(()=>toggle())}> … </div>
export const clickable=(onActivate)=>({
  role:"button",
  tabIndex:0,
  onClick:onActivate,
  onKeyDown:e=>{
    if(e.key==="Enter"||e.key===" "){ e.preventDefault(); onActivate&&onActivate(e); }
  },
});
