import React,{useState,useMemo} from "react";
import {today as TODAY} from "../shared";
import {poTotals,projDisplayName} from "../core";
import {num,r2,php2,vendorKey,bankLabel,buildOrders,duplicateFlags,payBalance,payIsOpen} from "../data/ledger";

// ─── SUPPLIER & PROJECT LEDGERS (read-only drill-downs) ────────────────────
// Opened by clicking a supplier or a project name in Purchase Orders or
// Supplier Bills. A supplier is matched by vendorKey (same rule as the AP
// duplicate safety net), so spelling variants of one name land together.
// Nothing here writes; paying, approving and editing stay on their own pages.

const C={ink:"#0f172a",muted:"#64748b",faint:"#94a3b8",line:"#e2e8f0",zebra:"#f8fafc",ok:"#059669",warn:"#d97706",bad:"#dc2626",blue:"#1d4ed8"};
const lgTh={padding:"7px 9px",fontSize:".64rem",fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:".5px",textAlign:"left",whiteSpace:"nowrap",background:"#f8fafc",borderBottom:`1px solid ${C.line}`};
const lgThR={...lgTh,textAlign:"right"};
const lgTd={padding:"7px 9px",fontSize:".76rem",color:C.ink,borderBottom:`1px solid #f1f5f9`,verticalAlign:"top"};
const lgTdR={...lgTd,textAlign:"right",whiteSpace:"nowrap",fontVariantNumeric:"tabular-nums"};
export const chip=(txt,clr)=><span style={{fontSize:".64rem",fontWeight:700,color:clr,background:clr+"18",border:`1px solid ${clr}44`,borderRadius:20,padding:"1px 7px",whiteSpace:"nowrap"}}>{txt}</span>;
const PAY_CLR={"Paid":C.ok,"Partly paid":C.warn,"Unpaid":C.bad,"No bill on file":"#7c3aed","Not issued":C.faint};
const DEL_CLR={"Delivered":C.ok,"Completed":C.ok,"Partly delivered":C.warn,"In progress":C.warn,"Not delivered":C.faint,"Not started":C.faint,"—":C.faint};
export const linkBtn={background:"none",border:"none",padding:0,margin:0,color:C.blue,cursor:"pointer",fontFamily:"inherit",fontSize:"inherit",fontWeight:"inherit",textAlign:"left",textDecoration:"underline",textDecorationColor:"#93c5fd",textUnderlineOffset:2};

export function Sheet({title,sub,onClose,children}){
  const mob=typeof window!=="undefined"&&window.innerWidth<768;
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,.5)",zIndex:1100,display:"flex",alignItems:mob?"flex-end":"center",justifyContent:"center",padding:mob?0:16}} onClick={onClose}>
      <div role="dialog" aria-label={title} onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:mob?"16px 16px 0 0":16,width:"100%",maxWidth:1040,maxHeight:mob?"94vh":"92vh",display:"flex",flexDirection:"column",boxShadow:"0 24px 60px rgba(0,0,0,.25)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,padding:mob?"16px 14px 10px":"20px 24px 12px",borderBottom:`1px solid ${C.line}`}}>
          <div style={{minWidth:0}}>
            <div style={{fontWeight:800,fontSize:"1.05rem",color:C.ink,overflowWrap:"anywhere"}}>{title}</div>
            {sub&&<div style={{fontSize:".74rem",color:C.muted,marginTop:2}}>{sub}</div>}
          </div>
          <button onClick={onClose} aria-label="Close" style={{background:"#f1f5f9",border:"none",borderRadius:8,width:32,height:32,cursor:"pointer",color:C.muted,fontSize:"1rem",flexShrink:0}}>✕</button>
        </div>
        <div style={{padding:mob?"12px 14px 20px":"14px 24px 22px",overflowY:"auto"}}>{children}</div>
      </div>
    </div>
  );
}

const Kpis=({items})=>(
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:8,marginBottom:14}}>
    {items.map(([l,v,c,f])=>(
      <div key={l} style={{border:`1px solid ${C.line}`,borderRadius:10,padding:"9px 12px"}}>
        <div style={{fontSize:".62rem",fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:".5px"}}>{l}</div>
        <div style={{fontSize:"1rem",fontWeight:800,color:c||C.ink,marginTop:2}}>{v}</div>
        {f&&<div style={{fontSize:".66rem",color:C.faint,marginTop:1}}>{f}</div>}
      </div>
    ))}
  </div>
);
const Tabs=({tabs,on,set})=>(
  <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
    {tabs.map(([k,l,n])=>(
      <button key={k} onClick={()=>set(k)} style={{padding:"6px 13px",borderRadius:20,border:`1px solid ${on===k?"#0B2545":C.line}`,background:on===k?"#0B2545":"#fff",color:on===k?"#fff":C.muted,cursor:"pointer",fontSize:".76rem",fontWeight:700,fontFamily:"inherit"}}>
        {l}{n!=null&&<span style={{marginLeft:6,opacity:.8}}>{n}</span>}
      </button>
    ))}
  </div>
);
const Table=({head,children,empty,cols})=>(
  <div style={{overflowX:"auto"}}>
    <table style={{width:"100%",borderCollapse:"collapse",minWidth:640}}>
      <thead><tr>{head.map(([h,r],i)=><th key={i} style={r?lgThR:lgTh}>{h}</th>)}</tr></thead>
      <tbody>{children}{empty&&<tr><td colSpan={cols||head.length} style={{...lgTd,textAlign:"center",color:C.faint,padding:20}}>{empty}</td></tr>}</tbody>
    </table>
  </div>
);

const billRef=b=>[b.apNumber,b.poId||b.poNumber||b.invoiceRef].filter(Boolean).join(" · ")||"—";

function PaymentRows({pays,billsById,flags,showVendor}){
  return pays.map(x=>{
    const b=billsById.get(x.payableId);
    const cancelled=x.status==="Cancelled";
    const flag=flags?.get(x.id);
    return(
      <tr key={x.id} style={{opacity:cancelled?.55:1,background:flag&&!cancelled?"#fff7ed":undefined}}>
        <td style={{...lgTd,whiteSpace:"nowrap"}}>{x.payDate||"—"}</td>
        <td style={lgTd}>
          <div style={{fontWeight:600}}>{b?billRef(b):"(bill not loaded)"}</div>
          {showVendor&&b&&<div style={{fontSize:".68rem",color:C.muted}}>{b.vendor}</div>}
          {x.batchId&&<div style={{fontSize:".66rem",color:C.faint}}>one payment for several bills</div>}
        </td>
        <td style={lgTdR}><span style={{fontWeight:800,textDecoration:cancelled?"line-through":"none"}}>{php2(x.amount)}</span>{num(x.retentionAmount)>0&&<div style={{fontSize:".66rem",color:C.faint}}>+ {php2(x.retentionAmount)} retention held</div>}</td>
        <td style={lgTd}>{x.method||"—"}</td>
        <td style={lgTd}>{bankLabel(x.bank)}</td>
        <td style={{...lgTd,fontFamily:"monospace",fontSize:".72rem"}}>{x.refNo||"—"}</td>
        <td style={lgTd}>
          <div>{x.recordedBy||"—"}</div>
          {cancelled&&<div style={{fontSize:".66rem",color:C.bad}}>Cancelled{x.cancelReason?`: ${x.cancelReason}`:""}</div>}
          {flag&&!cancelled&&<div style={{fontSize:".66rem",color:"#c2410c",fontWeight:700}}>⚠ {flag}</div>}
          {x.note&&<div style={{fontSize:".66rem",color:C.faint,maxWidth:260}}>{x.note}</div>}
        </td>
      </tr>
    );
  });
}
const PAY_HEAD=[["Date"],["Bill"],["Amount",1],["Method"],["Bank"],["Check / ref"],["Recorded by / notes"]];

function OrderRows({orders,projName,onProject,onSupplier,amountFor}){
  return orders.map(o=>(
    <tr key={o.kind+o.no}>
      <td style={lgTd}><div style={{fontWeight:700,color:"#4338ca"}}>{o.kind} {o.no}</div><div style={{fontSize:".66rem",color:C.faint}}>{o.date||"no date"}</div></td>
      {onSupplier
        ?<td style={lgTd}>{o.vendor?<button style={linkBtn} onClick={()=>onSupplier(o.vendor)}>{o.vendor}</button>:"—"}</td>
        :<td style={lgTd}>{o.projectIds.length?o.projectIds.map((id,i)=><div key={id}>{onProject?<button style={linkBtn} onClick={()=>onProject(id)}>{projName(id)}</button>:projName(id)}{i<o.projectIds.length-1?",":""}</div>):(o.projectNames.join(", ")||"GMD stock / no project")}</td>}
      <td style={lgTdR}><b>{php2(amountFor?amountFor(o):o.amount)}</b></td>
      <td style={lgTd}>{o.status}</td>
      <td style={lgTd}>{chip(o.delivery,DEL_CLR[o.delivery]||C.faint)}</td>
      <td style={lgTd}>{chip(o.payStatus,PAY_CLR[o.payStatus]||C.faint)}{o.bills.length>0&&<div style={{fontSize:".66rem",color:C.faint,marginTop:3}}>{o.bills.map(b=>b.apNumber||"AP").join(", ")}</div>}</td>
      <td style={lgTdR}>{o.bills.length?<><b style={{color:o.balance>0?C.bad:C.ok}}>{php2(o.balance)}</b><div style={{fontSize:".66rem",color:C.faint}}>paid {php2(o.paid)}</div></>:"—"}</td>
    </tr>
  ));
}

function BillRows({bills,today,projName}){
  return bills.map(b=>{
    const bal=payBalance(b),late=payIsOpen(b)&&b.dueDate&&b.dueDate<today;
    return(
      <tr key={b.id}>
        <td style={lgTd}><div style={{fontWeight:700}}>{b.apNumber||"(no AP no.)"}</div><div style={{fontSize:".66rem",color:C.faint}}>{b.poId||b.poNumber?`for ${b.poId||b.poNumber}`:b.invoiceNumber||b.invoiceRef||"no PO"}</div></td>
        <td style={lgTd}>{projName?projName(b.projectId):b.vendor}</td>
        <td style={{...lgTd,whiteSpace:"nowrap"}}>{b.invoiceDate||b.createdAt?.slice?.(0,10)||"—"}</td>
        <td style={{...lgTd,whiteSpace:"nowrap",color:late?C.bad:C.ink,fontWeight:late?700:400}}>{b.dueDate||"—"}</td>
        <td style={lgTdR}>{php2(b.amount)}</td>
        <td style={lgTdR}>{php2(b.paidAmount)}</td>
        <td style={lgTdR}><b style={{color:bal>0?C.bad:C.ok}}>{php2(bal)}</b></td>
        <td style={lgTd}>{chip(b.status||"Unpaid",b.status==="Paid"?C.ok:b.status==="Partial"?C.warn:b.status==="Cancelled"?C.faint:C.bad)}{(b.approvalStatus||"Approved")!=="Approved"&&<div style={{marginTop:3}}>{chip(b.approvalStatus==="Rejected"?"Rejected":"Awaiting approval",C.warn)}</div>}</td>
      </tr>
    );
  });
}

export function SupplierLedger({vendor,onClose,prs=[],swos=[],payables=[],payPays=[],deals=[],today=TODAY,onProject,initialTab="orders"}){
  const[tab,setTab]=useState(initialTab);
  const key=vendorKey(vendor);
  const projName=id=>{const d=deals.find(x=>x.id===id);return d?projDisplayName(d):"—";};
  const data=useMemo(()=>{
    const same=v=>!!key&&vendorKey(v)===key;
    const bills=payables.filter(b=>same(b.vendor)).sort((a,b)=>String(b.invoiceDate||b.createdAt||"").localeCompare(String(a.invoiceDate||a.createdAt||"")));
    const orders=buildOrders({prs:prs.filter(p=>same(p.supplier)),swos:swos.filter(w=>same(w.subcontractor)),payables:bills}).filter(o=>o.status!=="Cancelled");
    const ids=new Set(bills.map(b=>b.id));
    const pays=payPays.filter(x=>ids.has(x.payableId)).sort((a,b)=>String(b.payDate||"").localeCompare(String(a.payDate||""))||String(b.createdAt||"").localeCompare(String(a.createdAt||"")));
    const names=[...new Set([...bills.map(b=>b.vendor),...orders.map(o=>o.vendor)].map(s=>String(s||"").trim()).filter(Boolean))];
    return {bills,orders,pays,names,billsById:new Map(bills.map(b=>[b.id,b])),flags:duplicateFlags(pays)};
  },[key,prs,swos,payables,payPays]);
  const {bills,orders,pays,names,billsById,flags}=data;
  const live=bills.filter(b=>!["Cancelled","Void"].includes(b.status));
  const owed=live.filter(payIsOpen).reduce((s,b)=>s+payBalance(b),0);
  const overdue=live.filter(b=>payIsOpen(b)&&b.dueDate&&b.dueDate<today).reduce((s,b)=>s+payBalance(b),0);
  const paidAll=pays.filter(x=>x.status!=="Cancelled").reduce((s,x)=>s+num(x.amount),0);
  const ordered=orders.reduce((s,o)=>s+o.amount,0);
  const noBill=orders.filter(o=>o.payStatus==="No bill on file");
  const undelivered=orders.filter(o=>o.issued&&["Not delivered","Partly delivered","Not started","In progress"].includes(o.delivery));
  const lastPay=pays.find(x=>x.status!=="Cancelled");
  return(
    <Sheet title={`🏭 ${vendor||"Supplier"}`} onClose={onClose}
      sub={names.length>1?`Also recorded as: ${names.filter(n=>n!==vendor).slice(0,4).join(" · ")}`:"All POs, work orders, bills and payments for this supplier"}>
      <Kpis items={[
        ["Ordered",php2(ordered),null,`${orders.length} PO${orders.length!==1?"s":""} / WOs`],
        ["Owed now",php2(owed),owed>0?C.bad:C.ok,`${live.filter(payIsOpen).length} open bill(s)`],
        ["Overdue",php2(overdue),overdue>0?C.bad:C.ok],
        ["Paid to date",php2(paidAll),C.ok,lastPay?`last ${lastPay.payDate} · ${php2(lastPay.amount)}`:"no payments yet"],
      ]}/>
      {(noBill.length>0||flags.size>0)&&(
        <div style={{background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:9,padding:"8px 12px",marginBottom:12,fontSize:".74rem",color:"#9a3412"}}>
          {noBill.length>0&&<div>⚠ {noBill.length} issued order{noBill.length>1?"s have":" has"} no bill on file ({noBill.map(o=>o.no).join(", ")}): {php2(noBill.reduce((s,o)=>s+o.amount,0))} not in Supplier Bills or Running Payables.</div>}
          {flags.size>0&&<div>⚠ {flags.size} payment{flags.size>1?"s look":" looks"} like a possible double payment. See Payment history.</div>}
        </div>
      )}
      <Tabs on={tab} set={setTab} tabs={[["orders","POs & work orders",orders.length],["bills","Bills & balance",bills.length],["pays","Payment history",pays.length]]}/>
      {tab==="orders"&&(
        <Table head={[["Order"],["Project"],["Amount",1],["Status"],["Delivery"],["Payment"],["Balance",1]]} empty={orders.length?null:"No POs or work orders for this supplier."}>
          <OrderRows orders={orders} projName={projName} onProject={onProject}/>
        </Table>
      )}
      {tab==="bills"&&(
        <Table head={[["Bill"],["Project"],["Bill date"],["Due"],["Amount",1],["Paid",1],["Balance",1],["Status"]]} empty={bills.length?null:"No bills on file for this supplier."}>
          <BillRows bills={bills} today={today} projName={projName}/>
        </Table>
      )}
      {tab==="pays"&&(<>
        <div style={{fontSize:".72rem",color:C.muted,marginBottom:8}}>Every payment recorded against this supplier's bills, newest first. Cancelled payments stay listed (struck through). Check this before paying: the same amount twice within 30 days, or one check number on two bills, is flagged.{undelivered.length>0&&<> {undelivered.length} issued order{undelivered.length>1?"s are":" is"} not fully delivered yet.</>}</div>
        <Table head={PAY_HEAD} empty={pays.length?null:"No payments recorded for this supplier."}>
          <PaymentRows pays={pays} billsById={billsById} flags={flags}/>
        </Table>
      </>)}
    </Sheet>
  );
}

export function ProjectLedger({dealId,onClose,prs=[],swos=[],payables=[],payPays=[],exps=[],deals=[],today=TODAY,onSupplier,initialTab="orders"}){
  const[tab,setTab]=useState(initialTab);
  const deal=deals.find(d=>d.id===dealId);
  const data=useMemo(()=>{
    const bills=payables.filter(b=>b.projectId===dealId).sort((a,b)=>String(b.invoiceDate||b.createdAt||"").localeCompare(String(a.invoiceDate||a.createdAt||"")));
    const poNos=new Set(prs.filter(p=>p.projectId===dealId&&p.poNumber).map(p=>p.poNumber));
    const orders=buildOrders({prs:prs.filter(p=>poNos.has(p.poNumber)),swos:swos.filter(w=>(w.dealId||w.projectId)===dealId),payables})
      .filter(o=>o.status!=="Cancelled");
    const billIds=new Set([...bills.map(b=>b.id),...orders.flatMap(o=>o.bills.map(b=>b.id))]);
    const allBills=payables.filter(b=>billIds.has(b.id));
    const pays=payPays.filter(x=>billIds.has(x.payableId)).sort((a,b)=>String(b.payDate||"").localeCompare(String(a.payDate||"")));
    const others=exps.filter(e=>(e.projectId||e.dealId)===dealId&&!e.payableId&&!e.cvId)
      .sort((a,b)=>String(b.expDate||b.date||"").localeCompare(String(a.expDate||a.date||"")));
    return {bills,orders,pays,others,billsById:new Map(allBills.map(b=>[b.id,b]))};
  },[dealId,prs,swos,payables,payPays,exps]);
  const {bills,orders,pays,others,billsById}=data;
  // A PO can carry lines for several projects: count only this project's lines.
  const amountFor=o=>{
    if(o.kind!=="PO"||o.projectIds.length<=1) return o.amount;
    return r2(poTotals(o.items.filter(i=>i.projectId===dealId&&i.status!=="Cancelled")).total);
  };
  const ordered=orders.reduce((s,o)=>s+amountFor(o),0);
  const live=bills.filter(b=>!["Cancelled","Void"].includes(b.status));
  const owed=live.filter(payIsOpen).reduce((s,b)=>s+payBalance(b),0);
  const paid=pays.filter(x=>x.status!=="Cancelled").reduce((s,x)=>s+num(x.amount),0);
  const otherTotal=others.reduce((s,e)=>s+num(e.amount),0);
  const contract=num(deal?.value);
  return(
    <Sheet title={`📁 ${deal?projDisplayName(deal):"Project"}`} onClose={onClose} sub={deal?[deal.client,deal.stage].filter(Boolean).join(" · "):"Project not loaded"}>
      <Kpis items={[
        ["Contract",contract?php2(contract):"—"],
        ["POs & work orders",php2(ordered),null,`${orders.length} order(s)`],
        ["Other expenses",php2(otherTotal),null,`${others.length} item(s) not on a bill`],
        ["Supplier bills owed",php2(owed),owed>0?C.bad:C.ok],
        ["Paid to suppliers",php2(paid),C.ok],
      ]}/>
      <Tabs on={tab} set={setTab} tabs={[["orders","POs & work orders",orders.length],["bills","Bills",bills.length],["other","Other expenses",others.length],["pays","Payments",pays.length]]}/>
      {tab==="orders"&&(
        <Table head={[["Order"],["Supplier"],["This project",1],["Status"],["Delivery"],["Payment"],["Balance",1]]} empty={orders.length?null:"No POs or work orders on this project."}>
          <OrderRows orders={orders} onSupplier={onSupplier} amountFor={amountFor}/>
        </Table>
      )}
      {tab==="bills"&&(
        <Table head={[["Bill"],["Supplier"],["Bill date"],["Due"],["Amount",1],["Paid",1],["Balance",1],["Status"]]} empty={bills.length?null:"No supplier bills tagged to this project."}>
          <BillRows bills={bills} today={today}/>
        </Table>
      )}
      {tab==="other"&&(
        <Table head={[["Date"],["Payee"],["Category / description"],["Amount",1],["Bank"],["Status"]]} empty={others.length?null:"No other expenses on this project."}>
          {others.map(e=>(
            <tr key={e.id}>
              <td style={{...lgTd,whiteSpace:"nowrap"}}>{e.expDate||e.date||"—"}</td>
              <td style={lgTd}>{e.payee||e.supplier||"—"}</td>
              <td style={lgTd}><div style={{fontWeight:600}}>{e.category||"—"}</div><div style={{fontSize:".68rem",color:C.muted}}>{e.note||e.description||""}</div></td>
              <td style={lgTdR}><b>{php2(e.amount)}</b></td>
              <td style={lgTd}>{bankLabel(e.bankAccount)}</td>
              <td style={lgTd}>{e.acctStatus||"Logged"}</td>
            </tr>
          ))}
        </Table>
      )}
      {tab==="pays"&&(
        <Table head={PAY_HEAD} empty={pays.length?null:"No supplier payments on this project yet."}>
          <PaymentRows pays={pays} billsById={billsById} showVendor/>
        </Table>
      )}
    </Sheet>
  );
}

// One host for both drill-downs so a project link inside a supplier ledger (and
// the other way round) swaps the sheet instead of stacking two.
export function LedgerHost({open,setOpen,...data}){
  if(!open) return null;
  const close=()=>setOpen(null);
  if(open.kind==="supplier") return <SupplierLedger key={"s"+open.id} vendor={open.id} initialTab={open.tab} onClose={close} onProject={id=>setOpen({kind:"project",id})} {...data}/>;
  if(open.kind==="project") return <ProjectLedger key={"p"+open.id} dealId={open.id} initialTab={open.tab} onClose={close} onSupplier={v=>setOpen({kind:"supplier",id:v})} {...data}/>;
  return null;
}
