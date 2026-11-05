// ── Ledger helpers: supplier, project and bank-movement views ──────────────
// Pure functions behind the Supplier / Project drill-downs (Purchase Orders,
// Supplier Bills), the Executive Transaction History and Expense Monitoring.
// Nothing here writes: payments still go only through recordPayments
// (payable_payments, with every database guard), and the cash position is
// still edited only on its own sheet.
import {BANKS,payeeOf,particularsOf} from "../shared";
import {poTotals,isCashPayment} from "../core";

export const num=v=>Number(String(v??"").replace(/,/g,""))||0;
export const r2=v=>Math.round(num(v)*100)/100;
export const php2=v=>"₱"+num(v).toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2});

// Suppliers are free text. Same key as public.ap_vendor_key() (migration
// 20261102113419): first 8 letters/digits, lower case. "ABC Steel Supply Inc."
// and "ABC STEEL" are one supplier.
export const vendorKey=v=>String(v||"").replace(/[^a-zA-Z0-9]/g,"").toLowerCase().slice(0,8);

export const bankOf=v=>{
  const s=String(v||"").trim().toLowerCase();
  if(!s) return null;
  return BANKS.find(b=>b.id===s||b.short.toLowerCase()===s||b.name.toLowerCase()===s)
    ||BANKS.find(b=>s.includes(b.short.toLowerCase())||s.includes(b.id))||null;
};
export const bankLabel=v=>{const b=bankOf(v);return b?b.short:(String(v||"").trim()||"—");};

const dayDiff=(a,b)=>{
  if(!a||!b) return Infinity;
  return Math.abs((new Date(a+"T00:00:00")-new Date(b+"T00:00:00"))/86400000);
};

export const payBalance=p=>Math.max(0,r2(num(p.amount)-num(p.paidAmount)));
export const payIsOpen=p=>!["Paid","Cancelled","Void"].includes(p.status)&&payBalance(p)>0;
export const activePays=(payPays,payableId)=>(payPays||[]).filter(x=>x.payableId===payableId&&x.status!=="Cancelled");

// ── Purchase orders (purchase_requests line items grouped by PO number) ──
const poStatusOf=st=>{
  if(st.some(s=>s==="Partially Delivered")) return "Partially Delivered";
  const live=st.filter(s=>s!=="Cancelled");
  if(!live.length) return "Cancelled";
  if(live.every(s=>s==="Delivered")) return "Delivered";
  if(live.some(s=>s==="PO Issued"||s==="Delivered")) return "PO Issued";
  return live[0]||"Draft";
};
export const deliveryOf=lines=>{
  const live=(lines||[]).filter(i=>i.status!=="Cancelled");
  if(!live.length) return "—";
  const qty=live.reduce((s,i)=>s+num(i.qty),0),got=live.reduce((s,i)=>s+num(i.qtyDelivered),0);
  if(live.every(i=>i.status==="Delivered")||(qty>0&&got>=qty)) return "Delivered";
  if(got>0||live.some(i=>["Delivered","Partially Delivered"].includes(i.status))) return "Partly delivered";
  return "Not delivered";
};
export const ISSUED_PO=["PO Issued","Partially Delivered","Delivered"];
export const ISSUED_WO=["Issued","In Progress","Partially Delivered","Delivered","Completed","For Accounting"];

// Every PO and subcon work order as one order row, with its bill (payable) and
// what has been paid on it.
export const buildOrders=({prs=[],swos=[],payables=[]})=>{
  const byPo=new Map();
  (prs||[]).forEach(p=>{
    if(!p.poNumber) return;
    const k=p.poNumber;
    if(!byPo.has(k)) byPo.set(k,[]);
    byPo.get(k).push(p);
  });
  const billsFor=no=>(payables||[]).filter(b=>no&&(b.poId===no||b.poNumber===no)&&!["Cancelled","Void"].includes(b.status));
  const withBill=o=>{
    const bills=billsFor(o.no);
    const billed=bills.reduce((s,b)=>s+num(b.amount),0),paid=bills.reduce((s,b)=>s+num(b.paidAmount),0);
    const payStatus=!bills.length?(o.issued?"No bill on file":"Not issued")
      :bills.every(b=>b.status==="Paid"||payBalance(b)<=0)?"Paid"
      :paid>0?"Partly paid":"Unpaid";
    return {...o,bills,billed:r2(billed),paid:r2(paid),balance:r2(Math.max(0,billed-paid)),payStatus};
  };
  const pos=[...byPo.entries()].map(([no,items])=>{
    const live=items.filter(i=>i.status!=="Cancelled");
    const status=poStatusOf(items.map(i=>i.status||"Draft"));
    const dates=items.map(i=>i.poDate||i.createdDate||"").filter(Boolean).sort();
    return withBill({kind:"PO",no,vendor:(items.find(i=>i.supplier)||{}).supplier||"",
      projectIds:[...new Set(live.map(i=>i.projectId).filter(Boolean))],
      projectNames:[...new Set(live.map(i=>i.projectName).filter(Boolean))],
      date:dates[0]||"",amount:r2(poTotals(live.length?live:items).total),status,
      delivery:deliveryOf(items),issued:ISSUED_PO.includes(status),items});
  });
  const wos=(swos||[]).filter(w=>w.woNumber).map(w=>withBill({kind:"WO",no:w.woNumber,vendor:w.subcontractor||"",
    projectIds:[w.dealId||w.projectId].filter(Boolean),projectNames:[w.projectName].filter(Boolean),
    date:w.woDate||w.createdDate||"",amount:r2(w.contractAmount),status:w.status||"Issued",
    delivery:w.status==="Completed"?"Completed":["In Progress","Partially Delivered"].includes(w.status)?"In progress":"Not started",
    issued:ISSUED_WO.includes(w.status),items:[w]}));
  return [...pos,...wos].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
};

// ── Double-payment flags on one supplier's payment history ──
// Same amount paid twice within 30 days, or one check/reference used twice on
// different bills outside one batch. The database already blocks the clear
// cases (AP safety net); these are the ones a person should look at.
export const duplicateFlags=(pays=[])=>{
  const flags=new Map();
  const live=pays.filter(p=>p.status!=="Cancelled");
  live.forEach((a,i)=>live.slice(i+1).forEach(b=>{
    const sameBatch=a.batchId&&a.batchId===b.batchId;
    if(sameBatch) return;
    if(r2(a.amount)>0&&r2(a.amount)===r2(b.amount)&&dayDiff(a.payDate,b.payDate)<=30){
      const why=`Same amount (${php2(a.amount)}) paid twice within 30 days`;
      flags.set(a.id,why);flags.set(b.id,why);
    }
    const ka=String(a.refNo||"").replace(/[^a-zA-Z0-9]/g,"").toUpperCase(),kb=String(b.refNo||"").replace(/[^a-zA-Z0-9]/g,"").toUpperCase();
    if(ka&&ka===kb&&a.payableId!==b.payableId){
      const why=`Reference ${a.refNo} used on two bills (not one batch)`;
      flags.set(a.id,why);flags.set(b.id,why);
    }
  }));
  return flags;
};

// ── Cash position rows → bank movements ──
// The daily cash position is GMD's record of what actually moved in each bank:
// manual collections (in) and disbursements (out), per day.
export const cashMovements=(cashPositions={})=>{
  const out=[];
  Object.entries(cashPositions||{}).forEach(([date,pos])=>{
    const d=pos?.date||date;
    (pos?.collections?.manualCollections||[]).forEach((r,i)=>{
      const amt=r2(r.amount);
      if(!amt) return;
      out.push({key:`${d}#in#${r.id||i}`,src:"cash",dir:"in",date:d,rowId:r.id||null,bank:r.bank||"",
        payee:String(r.particulars??r.note??"").trim(),particulars:"",amount:amt,raw:r});
    });
    (pos?.disbursements?.manual||[]).forEach((r,i)=>{
      const amt=r2(r.amount);
      if(!amt) return;
      out.push({key:`${d}#out#${r.id||i}`,src:"cash",dir:"out",date:d,rowId:r.id||null,rowIndex:i,bank:r.bank||"",
        payee:payeeOf(r),particulars:particularsOf(r),amount:amt,
        payableIds:Array.isArray(r.payableIds)?r.payableIds.filter(Boolean):(r.payableId?[r.payableId]:[]),raw:r});
    });
  });
  return out.sort((a,b)=>b.date.localeCompare(a.date)||a.dir.localeCompare(b.dir));
};

// Match each disbursement to the AP payment(s) it paid, and each collection to
// a client billing payment. A disbursement tagged with bills on the cash sheet
// (payableIds) is matched only to payments on those bills; an untagged one is
// matched by supplier + amount within 7 days and shown as a suggestion. Each
// payment is claimed by one row at most.
export const reconcileLedger=({movements=[],payables=[],payPays=[],billings=[]})=>{
  const payById=new Map((payables||[]).map(p=>[p.id,p]));
  const live=(payPays||[]).filter(x=>x.status!=="Cancelled"&&r2(x.amount)>0);
  const claimed=new Set();
  // Batches (one check paying several bills) count as one movement.
  const groups=[];
  const byBatch=new Map();
  live.forEach(x=>{
    if(x.batchId){
      if(!byBatch.has(x.batchId)){const g={id:x.batchId,pays:[]};byBatch.set(x.batchId,g);groups.push(g);}
      byBatch.get(x.batchId).pays.push(x);
    } else groups.push({id:x.id,pays:[x]});
  });
  groups.forEach(g=>{
    g.amount=r2(g.pays.reduce((s,x)=>s+num(x.amount),0));
    g.date=g.pays[0].payDate||"";
    g.bank=g.pays[0].bank||"";
    g.payableIds=[...new Set(g.pays.map(x=>x.payableId))];
    g.vendorKeys=new Set(g.payableIds.map(id=>vendorKey(payById.get(id)?.vendor)).filter(Boolean));
  });
  const res=new Map();
  const outs=movements.filter(m=>m.dir==="out");
  // Tagged rows first so a tag always wins over a guess.
  const order=[...outs.filter(m=>m.payableIds?.length),...outs.filter(m=>!m.payableIds?.length)];
  order.forEach(m=>{
    const tagged=m.payableIds?.length?new Set(m.payableIds):null;
    const vk=vendorKey(m.payee);
    const cands=groups.filter(g=>!claimed.has(g.id)&&dayDiff(g.date,m.date)<=7
      &&(tagged?g.payableIds.every(id=>tagged.has(id)):(vk&&g.vendorKeys.has(vk)&&Math.abs(g.amount-m.amount)<0.01)))
      .sort((a,b)=>dayDiff(a.date,m.date)-dayDiff(b.date,m.date));
    let hit=[];
    if(tagged){
      // Payments on the tagged bills near this date, up to the row's amount.
      let sum=0;
      for(const g of cands){ if(sum+g.amount<=m.amount+0.01){hit.push(g);sum+=g.amount;} }
      const ok=Math.abs(sum-m.amount)<0.01;
      hit.forEach(g=>claimed.add(g.id));
      res.set(m.key,{status:ok?"linked":"short",groups:hit,recorded:r2(sum),payableIds:[...tagged]});
    } else if(cands.length){
      claimed.add(cands[0].id);
      res.set(m.key,{status:"suggested",groups:[cands[0]],recorded:cands[0].amount,payableIds:cands[0].payableIds});
    } else res.set(m.key,{status:"none",groups:[],recorded:0,payableIds:[]});
  });
  const unmatchedAp=groups.filter(g=>!claimed.has(g.id));

  // Collections ↔ client billing payments (cash only: offsets never touch a bank).
  const bp=[];
  (billings||[]).forEach(ms=>(ms.payments||[]).forEach(p=>{
    if(!isCashPayment(p)||!(r2(p.amount)>0)) return;
    bp.push({id:p.id,ms,p,amount:r2(p.amount),date:p.valueDate||p.date||"",bank:p.bank||""});
  }));
  const bClaimed=new Set();
  movements.filter(m=>m.dir==="in").forEach(m=>{
    const b=bankOf(m.bank);
    const c=bp.filter(x=>!bClaimed.has(x.id)&&Math.abs(x.amount-m.amount)<0.01&&dayDiff(x.date,m.date)<=7
      &&(!b||!x.bank||bankOf(x.bank)?.id===b.id))
      .sort((a,b2)=>dayDiff(a.date,m.date)-dayDiff(b2.date,m.date));
    if(c.length){bClaimed.add(c[0].id);res.set(m.key,{status:"suggested",billing:c[0]});}
    else res.set(m.key,{status:"none"});
  });
  const unmatchedBilling=bp.filter(x=>!bClaimed.has(x.id));
  return {byKey:res,unmatchedAp,unmatchedBilling};
};
