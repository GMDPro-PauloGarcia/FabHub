// Shared constants, helpers and UI primitives used by both App.jsx and the
// code-split views in src/views/. Moved out of App.jsx verbatim so the lazy
// chunks don't have to pull in the whole main bundle.
import React,{useState,useEffect} from "react";

export const fmt   = n => "₱" + Number(n||0).toLocaleString("en-PH",{minimumFractionDigits:0});
export const today=(()=>{const d=new Date();return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;})();
export const uid=()=>{
  if(crypto.randomUUID) return crypto.randomUUID();
  // UUID v4 fallback for older browsers / non-secure contexts
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==="x"?r:(r&0x3|0x8)).toString(16);});
};
export const KEYS={deals:"gmdv5:deals",projects:"gmdv5:projects",expenses:"gmdv5:expenses",inflows:"gmdv5:inflows",jos:"gmdv5:jos",swatches:"gmdv5:swatches",checklist:"gmdv5:checklist",role:"gmdv5:role",users:"gmdv5:users",session:"gmdv5:session",cashPos:"gmdv5:cashPos",prs:"gmdv5:prs",budgets:"gmdv5:budgets",mreqs:"gmdv5:mreqs",breqs:"gmdv5:breqs",addenda:"gmdv5:addenda",billings:"gmdv5:billings",vvip:"gmdv5:vvip",actlog:"gmdv5:actlog",pcards:"gmdv5:pcards",inventory:"gmdv5:inventory",stocklog:"gmdv5:stocklog",drfs:"gmdv5:drfs",botsettings:"gmdv5:botsettings",suppliers:"gmdv5:suppliers",subcons:"gmdv5:subcons",swos:"gmdv5:swos",customclients:"gmdv5:customclients",blockers:"gmdv5:blockers",boqLibrary:"gmdv5:boqLibrary",boqDrafts:"gmdv5:boqDrafts",vouchers:"gmdv5:vouchers",payables:"gmdv5:payables",loans:"gmdv5:loans",evouchers:"gmdv5:evouchers",dailylogs:"gmdv5:dailylogs",ceReqs:"gmdv5:ceReqs"};
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
  const base={width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"10px 13px",fontFamily:"inherit",fontSize:".87rem",color:"#1e293b",background:readOnly?"#f8fafc":"#fff",boxSizing:"border-box",transition:"border-color .15s",...(sx||{})};
  if(rows) return <textarea value={value||""} onChange={onChange} placeholder={placeholder} rows={rows} style={{...base,resize:"vertical"}}/>;
  return <input type={type} value={value||""} onChange={onChange} placeholder={placeholder} min={min} max={max} readOnly={readOnly} style={base}/>;
};
export const Sel=({value,onChange,children})=>(
  <select value={value} onChange={onChange} style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"10px 13px",fontFamily:"inherit",fontSize:".87rem",color:"#1e293b",background:"#fff",boxSizing:"border-box",cursor:"pointer"}}>
    {children}
  </select>
);

export const Fld=({label,required,children,hint})=>(
  <div style={{marginBottom:16}}>
    <label style={{display:"block",fontSize:".72rem",fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:".8px",marginBottom:6}}>
      {label}{required&&<span style={{color:"#ef4444",marginLeft:2}}>*</span>}
    </label>
    {children}
    {hint&&<div style={{fontSize:".7rem",color:"#94a3b8",marginTop:4}}>{hint}</div>}
  </div>
);
export const Card=({children,onClick,accent,style:sx={}})=>(
  <div onClick={onClick} style={{background:"#fff",borderRadius:14,border:`1.5px solid ${accent||"#e2e8f0"}`,padding:20,marginBottom:12,cursor:onClick?"pointer":"default",boxShadow:"0 1px 6px rgba(0,0,0,.05)",transition:"box-shadow .15s,border-color .15s",...sx}}
    onMouseEnter={e=>{if(onClick){e.currentTarget.style.boxShadow="0 6px 20px rgba(0,0,0,.1)";e.currentTarget.style.borderColor=accent||"#94a3b8";}}}
    onMouseLeave={e=>{if(onClick){e.currentTarget.style.boxShadow="0 1px 6px rgba(0,0,0,.05)";e.currentTarget.style.borderColor=accent||"#e2e8f0";}}}>
    {children}
  </div>
);
export const Modal=({open,onClose,title,children,wide,maxWidth})=>{
  const mob=window.innerWidth<768;
  if(!open) return null;
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,.5)",zIndex:1000,display:"flex",alignItems:mob?"flex-end":"center",justifyContent:"center",padding:mob?0:16}} onClick={mob?undefined:onClose}>
      <div style={{background:"#fff",borderRadius:mob?"18px 18px 0 0":18,padding:mob?"20px 16px 28px":28,width:"100%",maxWidth:mob?undefined:(maxWidth||wide?640:480),maxHeight:mob?"92vh":"94vh",overflowY:"auto",boxShadow:"0 24px 80px rgba(0,0,0,.2)"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:mob?16:22}}>
          <div style={{fontWeight:800,fontSize:mob?"1rem":"1.1rem",color:"#0f172a"}}>{title}</div>
          <button onClick={onClose} style={{background:"#f1f5f9",border:"none",borderRadius:8,width:32,height:32,cursor:"pointer",color:"#64748b",fontSize:"1rem",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
};
export const KPI=({label,value,color,sub,small})=>(
  <div style={{background:"#fff",borderRadius:12,padding:small?"14px 16px":"18px 20px",border:"1.5px solid #e2e8f0",boxShadow:"0 1px 4px rgba(0,0,0,.04)"}}>
    <div style={{fontSize:small?"1.2rem":"1.55rem",fontWeight:800,color,fontFamily:"'Barlow Condensed',sans-serif",lineHeight:1}}>{value}</div>
    {sub&&<div style={{fontSize:".7rem",color,marginTop:3,opacity:.75}}>{sub}</div>}
    <div style={{fontSize:".65rem",textTransform:"uppercase",letterSpacing:"1px",color:"#94a3b8",marginTop:7}}>{label}</div>
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
