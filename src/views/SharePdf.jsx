// "Share PDF" flow shared by the BOQ quotation, invoice and SOA.
//
// iPhones ignore window.print() in FabHub's print pop-ups, so documents are
// also built as real PDF files and handed to the phone's share sheet (Viber,
// Mail, Files), or downloaded where sharing files isn't supported (most
// desktops). It takes two taps on purpose: build first, then Share. iOS
// refuses navigator.share once async work (building the PDF) has run since
// the tap, so the Share button calls it straight from its own tap.
import React,{useState} from "react";

const safeName=s=>String(s||"").replace(/[\\/:*?"<>|]+/g," ").replace(/\s+/g," ").trim().slice(0,120);

export function useSharePdf(toastEmit){
  const[busy,setBusy]=useState(false);
  const[ready,setReady]=useState(null);   // null | {file,url,canShare,draft,draftNote}
  // build: async () => Blob. name: file name without ".pdf".
  const make=async(build,name,{draft=false,draftNote=""}={})=>{
    if(busy) return;
    setBusy(true);
    try{
      const blob=await build();
      const file=new File([blob],`${safeName(name)||"Document"}${draft?" (DRAFT)":""}.pdf`,{type:"application/pdf"});
      let canShare=false;
      try{canShare=!!(navigator.canShare&&navigator.canShare({files:[file]}));}catch(e){}
      setReady({file,url:URL.createObjectURL(blob),canShare,draft,draftNote});
    }catch(err){
      toastEmit&&toastEmit("Couldn't make the PDF: "+(err.message||err),"error");
    }finally{setBusy(false);}
  };
  const share=async()=>{
    if(!ready) return;
    try{await navigator.share({files:[ready.file],title:ready.file.name});}
    catch(err){if(err&&err.name!=="AbortError") toastEmit&&toastEmit("Sharing failed — use Download instead.","error");}
  };
  const close=()=>{if(ready?.url) URL.revokeObjectURL(ready.url);setReady(null);};
  const dialog=ready&&(
    <div onClick={close} style={{position:"fixed",inset:0,background:"#0f172acc",zIndex:2000,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"36px 16px",overflowY:"auto"}}>
      <div onClick={e=>e.stopPropagation()} role="dialog" aria-label="Share PDF" style={{background:"#fff",borderRadius:16,border:"1.5px solid #e2e8f0",padding:22,maxWidth:440,width:"100%",boxShadow:"0 24px 60px #0006"}}>
        <div style={{fontWeight:800,color:"#0f172a",fontSize:"1rem",marginBottom:6}}>📤 PDF ready</div>
        <div style={{fontSize:".8rem",color:"#334155",wordBreak:"break-word",marginBottom:10}}>{ready.file.name}</div>
        {ready.draft&&<div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:8,padding:"8px 10px",fontSize:".74rem",color:"#b91c1c",marginBottom:12}}>Watermarked <b>DRAFT – NOT FOR SUBMISSION</b>.{ready.draftNote?" "+ready.draftNote:""}</div>}
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {ready.canShare&&<button onClick={share} style={{flex:"1 1 120px",background:"#1e293b",color:"#fff",border:"none",borderRadius:8,padding:"10px 14px",fontFamily:"inherit",fontSize:".82rem",fontWeight:800,cursor:"pointer"}}>📤 Share</button>}
          <a href={ready.url} download={ready.file.name} style={{flex:"1 1 120px",textAlign:"center",textDecoration:"none",background:"#f1f5f9",color:"#0f172a",border:"1.5px solid #cbd5e1",borderRadius:8,padding:"9px 14px",fontSize:".82rem",fontWeight:700}}>⬇ Download</a>
          <button onClick={close} style={{flex:"0 0 auto",background:"none",border:"none",color:"#64748b",fontFamily:"inherit",fontSize:".8rem",fontWeight:700,cursor:"pointer",padding:"9px 6px"}}>Close</button>
        </div>
      </div>
    </div>
  );
  return{busy,make,dialog};
}
