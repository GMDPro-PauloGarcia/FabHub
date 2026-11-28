// Purchase Order and Subcon Work Order as PDF files (🖨 opens them in a new
// tab, see openPdfTab in SharePdf.jsx). Lazy-loaded from the PO and WO pages.
//
// Both take a plain model built on the page (poPdfModel / woPdfModel in
// App.jsx); nothing here does money math. What a supplier or subcon reads:
//  - who GMD is (logo header), the order number, date and terms;
//  - whose project it is: CLIENT and PROJECT NAME on each PO line (a PO can
//    carry several projects) and in the WO's details strip (Paulo, 2026-11-28,
//    reversing the 2026-11-19 "code + site only" rule), with code + site;
//  - whether the order is approved: an order that isn't is stamped across
//    every page ("NOT APPROVED – DO NOT SUPPLY" / "NOT YET ISSUED – DO NOT
//    START WORK"), so a pending copy can't be taken for a real order;
//  - in plain words, what happens next and how they get paid.
import autoTable from "jspdf-autotable";
import {F,SLATE,INK,NAVY,LINE,pdfNum,newDoc,stampPages,docHeader} from "./pdfKit";

const ORANGE="#ea580c",BLUE="#2563eb",GREEN="#059669",RED="#dc2626";
const CO_FOOTER="GMD PRODUCTIONS INC · 32 Santan Unit H Brgy Fortune, Marikina, NCR 1802 PH · TIN 010-063-229-000";

// Grey label over a bold value, for the details strip under the title.
const strip=(doc,y,L,R,cells)=>{
  const w=(R-L)/cells.length;
  doc.setFont(F,"bold");doc.setFontSize(9.5);
  const vals=cells.map(([,v])=>doc.splitTextToSize(String(v||"—"),w-6).slice(0,2));
  const h=11+Math.max(...vals.map(v=>v.length))*4.2;
  doc.setFillColor("#f8fafc");doc.setDrawColor(LINE);doc.setLineWidth(0.3);doc.roundedRect(L,y,R-L,h,1.5,1.5,"FD");
  cells.forEach(([k],i)=>{
    const x=L+4+i*w;
    doc.setFont(F,"bold");doc.setFontSize(6.5);doc.setTextColor("#94a3b8");doc.text(k.toUpperCase(),x,y+5.5);
    doc.setFontSize(9.5);doc.setTextColor(INK);vals[i].forEach((l,j)=>doc.text(l,x,y+11+j*4.2));
  });
  return y+h+6;
};

// Status banner under the title: green when the order stands, red when not.
const banner=(doc,y,L,R,ok,text)=>{
  doc.setFillColor(ok?"#ecfdf5":"#fef2f2");doc.setDrawColor(ok?"#a7f3d0":"#fecaca");doc.setLineWidth(0.4);
  doc.roundedRect(L,y,R-L,8,1.2,1.2,"FD");
  doc.setFont(F,"bold");doc.setFontSize(8.5);doc.setTextColor(ok?GREEN:RED);doc.text(text,L+4,y+5.3);
  return y+12;
};

// A titled box of short lines (numbered when `numbered`).
const infoBox=(doc,y,L,R,title,lines,{numbered=false,fill="#f8fafc"}={})=>{
  doc.setFontSize(8.5);
  const wrapped=lines.map(t=>doc.splitTextToSize(t,R-L-14));
  const h=9+wrapped.reduce((s,l)=>s+l.length*3.9,0)+3;
  if(y+h>doc.internal.pageSize.getHeight()-18){doc.addPage();y=18;}
  doc.setFillColor(fill);doc.setDrawColor(LINE);doc.setLineWidth(0.3);doc.roundedRect(L,y,R-L,h,1.5,1.5,"FD");
  let ty=y+6;
  doc.setFont(F,"bold");doc.setFontSize(7.5);doc.setTextColor(NAVY);doc.text(title.toUpperCase(),L+4,ty);ty+=5;
  doc.setFont(F,"normal");doc.setFontSize(8.5);doc.setTextColor("#334155");
  wrapped.forEach((ls,i)=>{doc.text(numbered?`${i+1}.`:"•",L+5,ty);doc.text(ls,L+10,ty);ty+=ls.length*3.9;});
  return y+h+5;
};

const signatures=(doc,y,L,R,sigs)=>{
  if(y+26>doc.internal.pageSize.getHeight()-18){doc.addPage();y=24;}
  y+=6;
  const gap=6,sw=(R-L-gap*(sigs.length-1))/sigs.length;
  sigs.forEach(([lab,name,role],i)=>{
    const x=L+i*(sw+gap);
    doc.setFont(F,"bold");doc.setFontSize(6.5);doc.setTextColor("#94a3b8");doc.text(lab.toUpperCase(),x,y);
    doc.setDrawColor(NAVY);doc.setLineWidth(0.4);doc.line(x,y+12,x+sw,y+12);
    doc.setFont(F,"bold");doc.setFontSize(8.5);doc.setTextColor(INK);doc.text(doc.splitTextToSize(name||" ",sw)[0],x,y+16);
    doc.setFont(F,"normal");doc.setFontSize(7.5);doc.setTextColor(SLATE);doc.text(role,x,y+20);
  });
  return y+26;
};

const footerLine=(doc,y,L,R,W)=>{
  if(y+10>doc.internal.pageSize.getHeight()-14){doc.addPage();y=24;}
  doc.setDrawColor(LINE);doc.setLineWidth(0.3);doc.line(L,y,R,y);
  doc.setFont(F,"normal");doc.setFontSize(7);doc.setTextColor("#94a3b8");doc.text(CO_FOOTER,W/2,y+4.5,{align:"center"});
};

// ── Purchase order ──────────────────────────────────────────────────────────
export function buildPoPdf(m){
  const doc=newDoc();
  const W=doc.internal.pageSize.getWidth(),L=12,R=W-12;
  doc.setProperties({title:`Purchase Order ${m.poNo} — ${m.supplier}`,author:"GMD Productions Inc.",creator:"FabHub"});
  let y=docHeader(doc,{dateStr:m.poDate||"",rightLabel:`PO NO.: ${m.poNo}`});

  doc.setFont(F,"bold");doc.setFontSize(16);doc.setTextColor(INK);doc.text("PURCHASE ORDER",L,y+2);
  doc.setFontSize(11);doc.setTextColor(ORANGE);doc.text(m.poNo,R,y+2,{align:"right"});
  y+=7;
  y=banner(doc,y,L,R,m.approved,m.approved
    ?`APPROVED${m.approvedBy?` by ${m.approvedBy}`:""}: please supply as listed below.`
    :`NOT APPROVED YET (${m.status||"Draft"}): do not supply or deliver against this copy.`);

  // To (supplier) on the left, order details on the right.
  const top=y;
  doc.setFont(F,"bold");doc.setFontSize(7);doc.setTextColor("#94a3b8");doc.text("TO (SUPPLIER)",L,y);y+=4.8;
  doc.setFontSize(11);doc.setTextColor(INK);
  doc.splitTextToSize(m.supplier||"—",105).forEach(l=>{doc.text(l,L,y);y+=5;});
  doc.setFont(F,"normal");doc.setFontSize(8.5);doc.setTextColor("#475569");
  [m.supplierContact,m.supplierAddress,m.supplierTin?`TIN: ${m.supplierTin}`:""].filter(Boolean).forEach(t=>doc.splitTextToSize(t,105).forEach(l=>{doc.text(l,L,y);y+=4;}));
  let my=top;
  [["PO NO.",m.poNo],["DATE",m.poDate||"—"],["PAYMENT TERMS",m.terms||"—"],["PRICES",m.withVat?"VAT-exclusive, 12% VAT added":"As quoted, no VAT added"]].forEach(([k,v])=>{
    doc.setFont(F,"bold");doc.setFontSize(7);doc.setTextColor(SLATE);doc.text(k,R-72,my);
    doc.setFontSize(8.5);doc.setTextColor(INK);doc.text(doc.splitTextToSize(String(v),44)[0],R,my,{align:"right"});
    my+=5;
  });
  y=Math.max(y,my)+3;

  // Lines, with what each one is for: project name (bold), client (bold,
  // orange), then code + site. Drawn by hand in didDrawCell so the parts can
  // differ in weight and colour; the plain text only sizes the row.
  const FOR_W=50,FOR_FS=7.5,FOR_LH=FOR_FS*1.15*25.4/72;
  const forParts=l=>{
    doc.setFont(F,"bold");doc.setFontSize(FOR_FS);
    const w=FOR_W-4.2,p=l.project;
    if(!p) return [[doc.splitTextToSize(l.forLabel||"—",w),"normal",SLATE]];
    return [[doc.splitTextToSize(p.project||"—",w),"bold",INK],[doc.splitTextToSize(p.client||"—",w),"bold",ORANGE],
      ...([p.code,p.site].some(Boolean)?[[doc.splitTextToSize([p.code,p.site].filter(Boolean).join(" · "),w),"normal",SLATE]]:[])];
  };
  const forCells=m.lines.map(forParts);
  autoTable(doc,{
    startY:y,margin:{left:L,right:W-R,bottom:18},theme:"plain",
    head:[["#","ITEM","QTY","UNIT","UNIT PRICE","AMOUNT","FOR (PROJECT · CLIENT)"]],
    body:m.lines.map((l,i)=>[String(i+1),l.item+(l.note?`\n${l.note}`:""),l.qty,l.unit,pdfNum(l.unitPrice),pdfNum(l.amount),forCells[i].flatMap(([ls])=>ls).join("\n")]),
    styles:{font:F,fontSize:8.5,textColor:INK,cellPadding:2.1,valign:"top",lineColor:"#e2e8f0",lineWidth:{bottom:0.2}},
    headStyles:{font:F,fontStyle:"bold",fillColor:NAVY,textColor:255,fontSize:6.5},
    columnStyles:{0:{cellWidth:8,textColor:SLATE},2:{cellWidth:13,halign:"right"},3:{cellWidth:12},4:{cellWidth:23,halign:"right"},5:{cellWidth:25,halign:"right",fontStyle:"bold"},6:{cellWidth:FOR_W,fontSize:FOR_FS,fontStyle:"bold",textColor:255}},
    didParseCell:d=>{if(d.section==="head"&&[2,4,5].includes(d.column.index))d.cell.styles.halign="right";if(d.section==="head"&&d.column.index===6)d.cell.styles.textColor=255;},
    didDrawCell:d=>{
      if(d.section!=="body"||d.column.index!==6) return;
      const parts=forCells[d.row.index]||[];let ty=d.cell.y+2.1+FOR_FS*25.4/72*0.85;
      parts.forEach(([ls,st,clr])=>{doc.setFont(F,st);doc.setFontSize(FOR_FS);doc.setTextColor(clr);ls.forEach(t=>{doc.text(t,d.cell.x+2.1,ty);ty+=FOR_LH;});});
    },
  });
  y=doc.lastAutoTable.finalY+5;

  // Totals, spelled out.
  if(y+40>doc.internal.pageSize.getHeight()-18){doc.addPage();y=24;}
  const tx=R-85;
  const trow=(label,val,{color=INK,bold=false,big=false}={})=>{
    doc.setFont(F,bold?"bold":"normal");doc.setFontSize(big?10.5:8.5);doc.setTextColor(bold?color:SLATE);doc.text(label,tx,y);
    doc.setTextColor(color);doc.text(val,R,y,{align:"right"});y+=big?6:4.8;
  };
  trow("Subtotal (all items)",pdfNum(m.subtotal));
  if(m.discount>0) trow(`Less: discount${m.discountLabel?` (${m.discountLabel})`:""}`,`(${pdfNum(m.discount)})`,{color:GREEN});
  if(m.withVat){trow("Amount before VAT",pdfNum(m.net));trow("Add: VAT 12%",pdfNum(m.vat));}
  doc.setDrawColor(NAVY);doc.setLineWidth(0.6);doc.line(tx,y-2,R,y-2);y+=2.5;
  trow(m.withVat?"TOTAL ORDER (VAT-inclusive)":"TOTAL ORDER",`PHP ${pdfNum(m.total)}`,{color:ORANGE,bold:true,big:true});
  y+=3;

  y=infoBox(doc,y,L,R,"What to do next",[
    `Deliver to the site shown on each line, with a delivery receipt that quotes PO ${m.poNo}.`,
    `Send your invoice or billing quoting PO ${m.poNo} and your own invoice number.`,
    `GMD pays for what was received and checked, on the payment terms above${m.terms?` (${m.terms})`:""}.`,
    "Questions on this order: call or message the GMD person who prepared it (named below).",
  ],{numbered:true,fill:"#eff6ff"});
  if(m.termsLines&&m.termsLines.length) y=infoBox(doc,y,L,R,"Terms & conditions",m.termsLines,{numbered:true});

  y=signatures(doc,y,L,R,[["Prepared by",m.preparedBy,"GMD Procurement"],["Approved by",m.approved?m.approvedBy:"",m.approved?"GMD Productions Inc.":"Not approved yet"],["Conforme (supplier)","","Signature over printed name / date"]]);
  footerLine(doc,y+2,L,R,W);

  stampPages(doc,{footer:`GMD Productions Inc. · Purchase Order ${m.poNo} · ${m.supplier}`,draft:!m.approved,
    watermark:"NOT APPROVED – DO NOT SUPPLY",draftNote:"NOT APPROVED – DO NOT SUPPLY · this PO is still waiting for GMD approval"});
  return doc.output("blob");
}

// ── Subcon work order ───────────────────────────────────────────────────────
export function buildWoPdf(m){
  const doc=newDoc();
  const W=doc.internal.pageSize.getWidth(),L=12,R=W-12;
  doc.setProperties({title:`Work Order ${m.woNo} — ${m.subcon}`,author:"GMD Productions Inc.",creator:"FabHub"});
  let y=docHeader(doc,{dateStr:m.woDate||"",rightLabel:`WO NO.: ${m.woNo}`});

  doc.setFont(F,"bold");doc.setFontSize(16);doc.setTextColor(INK);doc.text("SUBCONTRACTOR WORK ORDER",L,y+2);
  doc.setFontSize(11);doc.setTextColor(ORANGE);doc.text(m.woNo,R,y+2,{align:"right"});
  y+=7;
  y=banner(doc,y,L,R,m.issued,m.issued
    ?`ISSUED${m.status&&m.status!=="Issued"?` (${m.status})`:""}: you may start work as scheduled below.`
    :`NOT YET ISSUED (${m.status||"Draft"}): do not start work or mobilise against this copy.`);

  if(m.project) y=strip(doc,y,L,R,[["Project name",m.project.project],["Client",m.project.client],["Project code · site",m.forLabel]]);
  y=strip(doc,y,L,R,[["Subcontractor",m.subcon],...(m.project?[]:[["For (project · site)",m.forLabel]]),["Work type",m.workType],["Schedule",m.schedule]]);

  doc.setFont(F,"bold");doc.setFontSize(8.5);doc.setTextColor(NAVY);doc.text("SCOPE OF WORK",L,y);y+=2;
  doc.setDrawColor(NAVY);doc.setLineWidth(0.4);doc.line(L,y,R,y);y+=5;
  doc.setFont(F,"normal");doc.setFontSize(9);doc.setTextColor(INK);
  doc.splitTextToSize(m.scope||"—",R-L).forEach(l=>{if(y>doc.internal.pageSize.getHeight()-22){doc.addPage();y=20;}doc.text(l,L,y);y+=4.3;});
  y+=3;
  if(m.notes){
    doc.setFont(F,"bold");doc.setFontSize(7.5);doc.setTextColor(SLATE);doc.text("NOTES",L,y);y+=4.3;
    doc.setFont(F,"normal");doc.setFontSize(8.5);doc.setTextColor("#334155");
    doc.splitTextToSize(m.notes,R-L).forEach(l=>{doc.text(l,L,y);y+=4;});
    y+=3;
  }

  // The money, in a small table: contract, down payment, retention.
  if(y+40>doc.internal.pageSize.getHeight()-18){doc.addPage();y=24;}
  autoTable(doc,{
    startY:y,margin:{left:L,right:W-R,bottom:18},theme:"plain",
    head:[["CONTRACT","AMOUNT","WHAT IT MEANS"]],
    body:[
      ["Contract amount",pdfNum(m.contract),"The most GMD pays for this scope, unless a change is agreed in writing."],
      ...(m.dpPct>0?[[`Down payment (${m.dpPct}%)`,pdfNum(m.dpAmt),"May be billed once this work order is issued. It is part of the contract, so later billings are paid only once certified work goes beyond it."]]:[]),
      ...(m.retPct>0?[[`Retention (${m.retPct}%)`,pdfNum(m.retAmt),"Held from each billing and released after GMD accepts the finished work."]]:[]),
    ],
    styles:{font:F,fontSize:8.5,textColor:INK,cellPadding:2.2,valign:"top",lineColor:"#e2e8f0",lineWidth:{bottom:0.2}},
    headStyles:{font:F,fontStyle:"bold",fillColor:NAVY,textColor:255,fontSize:6.5},
    columnStyles:{0:{cellWidth:42,fontStyle:"bold"},1:{cellWidth:32,halign:"right",fontStyle:"bold"},2:{textColor:"#475569"}},
    didParseCell:d=>{if(d.section==="head"&&d.column.index===1)d.cell.styles.halign="right";if(d.section==="body"&&d.row.index===0&&d.column.index===1)d.cell.styles.textColor=ORANGE;},
  });
  y=doc.lastAutoTable.finalY+5;

  y=infoBox(doc,y,L,R,"How you get paid",[
    ...(m.dpPct>0?[`Down payment: up to ${m.dpPct}% of the contract (PHP ${pdfNum(m.dpAmt)}) once this work order is issued.`]:[]),
    "Progress billings: bill GMD as work goes on. Each billing is paid up to the % of the work GMD's project manager has checked and certified, less what was already paid.",
    ...(m.retPct>0?[`Retention: ${m.retPct}% of each billing is held, and released after GMD accepts the completed work.`]:[]),
    `Every billing must quote WO ${m.woNo} and your billing number.${m.terms?` Payment terms: ${m.terms}.`:""}${m.structure?` Payment structure: ${m.structure}.`:""}`,
  ],{fill:"#eff6ff"});

  y=signatures(doc,y,L,R,[
    ["Prepared by",m.preparedBy,"GMD Productions Inc."],
    ["Cost Control",m.ccSigner,m.ccSigner?"Signed":"Not signed yet"],
    ["Approved & issued by",m.issued?m.approvedBy:"",m.issued?"GMD Productions Inc.":"Not issued yet"],
    ["Conforme (subcontractor)","","Signature over printed name / date"],
  ]);
  footerLine(doc,y+2,L,R,W);

  stampPages(doc,{footer:`GMD Productions Inc. · Work Order ${m.woNo} · ${m.subcon}`,draft:!m.issued,
    watermark:"NOT YET ISSUED – DO NOT START WORK",draftNote:"NOT YET ISSUED – DO NOT START WORK · this work order still needs GMD's signatures"});
  return doc.output("blob");
}
