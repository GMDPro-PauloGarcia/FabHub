// Live prompt under a supplier field: says, while the person types, whether the
// name is in the supplier list, close to one (with one-tap fixes), shared by
// several suppliers, or new. See dataGuard.js.
import React from "react";
import {checkSupplier} from "./dataGuard";

export default function SupplierHint({value,suppliers,onPick}){
  const res=checkSupplier(value,suppliers);
  if(res.kind==="empty"||res.kind==="ok") return null;
  const tone=res.kind==="ambiguous"?{bg:"#fef2f2",line:"#fecaca",ink:"#b91c1c"}:res.kind==="similar"?{bg:"#fffbeb",line:"#fde68a",ink:"#92400e"}:{bg:"#f8fafc",line:"#e2e8f0",ink:"#475569"};
  const msg=res.kind==="ambiguous"?"This name fits more than one supplier. Pick the right one:"
    :res.kind==="similar"?"Not in the supplier list. Did you mean:"
    :"New supplier. Use the full registered name from their invoice.";
  return(
    <div role="status" style={{marginTop:6,background:tone.bg,border:`1px solid ${tone.line}`,borderRadius:8,padding:"7px 9px",fontSize:".74rem",color:tone.ink,lineHeight:1.35}}>
      <div style={{fontWeight:600}}>{msg}</div>
      {res.matches.length>0&&(
        <div style={{display:"flex",flexWrap:"wrap",gap:5,marginTop:6}}>
          {res.matches.map(n=>(
            <button key={n} type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>onPick&&onPick(n)}
              style={{background:"#fff",border:`1px solid ${tone.line}`,borderRadius:14,padding:"3px 10px",fontSize:".72rem",fontWeight:600,color:"#0f172a",cursor:"pointer",fontFamily:"inherit"}}>
              {n}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
