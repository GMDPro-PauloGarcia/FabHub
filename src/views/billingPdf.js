// Invoice and Statement of Account as PDF files, for "Share PDF" on the
// Billing page (see SharePdf.jsx for why). Lazy-loaded from BillingView.
//
// Both take a plain model built in BillingView (invoiceData / soaData), the
// SAME figures its print pages use, so the PDF and the printout can't
// disagree. Nothing here does billing math.
import autoTable from "jspdf-autotable";
import {F,SLATE,INK,NAVY,LINE,pdfNum,newDoc,stampPages} from "./pdfKit";

const ORANGE="#ea580c",BLUE="#2563eb",GREEN="#059669",RED="#dc2626";
const TAGLINE="Retail Design & Build | Construction | Modular Fit-outs | Signage | POP Displays";
const BANKS=["Account Name: GMD PRODUCTIONS INC","BDO CHECKING — 012758000370","BPI CHECKING — 6011 04 82 03","METROBANK — 382-7-38202059-2"];
const CO_FOOTER="GMD PRODUCTIONS INC · 32 Santan Unit H Brgy Fortune, Marikina, NCR 1802 PH · TIN 010-063-229-000";

// Navy band with the company name and date, then a slate sub-bar, like the
// print pages' header.
const header=(doc,{dateStr,rightLabel})=>{
  const W=doc.internal.pageSize.getWidth();
  doc.setFillColor(NAVY);doc.rect(0,0,W,20,"F");
  doc.setFont(F,"bold");doc.setFontSize(15);doc.setTextColor(255);doc.text("GMD PRODUCTIONS INC.",12,13);
  doc.setFont(F,"bold");doc.setFontSize(9.5);doc.setTextColor("#f97316");doc.text(dateStr||"",W-12,13,{align:"right"});
  const dw=doc.getTextWidth(dateStr||"");
  doc.setFont(F,"normal");doc.setFontSize(8);doc.setTextColor("#cbd5e1");doc.text("DATE:",W-12-dw-2,13,{align:"right"});
  doc.setFillColor("#334155");doc.rect(0,20,W,7,"F");
  doc.setFillColor(ORANGE);doc.rect(0,27,W,0.8,"F");
  doc.setFont(F,"normal");doc.setFontSize(7);doc.setTextColor("#cbd5e1");
  doc.text(TAGLINE,12,24.6);
  if(rightLabel) doc.text(rightLabel,W-12,24.6,{align:"right"});
  return 36;
};

// ── Billing statement (a milestone's invoice; never titled "Tax Invoice") ──
export function buildInvoicePdf(m){
  const doc=newDoc();
  const W=doc.internal.pageSize.getWidth(),L=12,R=W-12;
  doc.setProperties({title:`Billing Statement ${m.invoiceNo||""} — ${m.billTo.name}`.trim(),author:"GMD Productions Inc.",creator:"FabHub"});
  let y=header(doc,{dateStr:m.invoiceDate,rightLabel:`BILLING NO.: ${m.invoiceNo||"—"}`});

  doc.setFont(F,"bold");doc.setFontSize(16);doc.setTextColor(INK);
  doc.text((m.draft?`${m.docTitle} — DRAFT`:m.docTitle).toUpperCase(),L,y+2);
  y+=9;

  // Bill to (left) and invoice details (right)
  const topY=y;
  doc.setFont(F,"bold");doc.setFontSize(7);doc.setTextColor("#94a3b8");doc.text("BILL TO",L,y);
  y+=4.5;
  doc.setFont(F,"bold");doc.setFontSize(10.5);doc.setTextColor(INK);
  doc.splitTextToSize(m.billTo.name||"—",100).forEach(l=>{doc.text(l,L,y);y+=4.6;});
  doc.setFont(F,"normal");doc.setFontSize(8.5);doc.setTextColor("#475569");
  [m.billTo.contact,m.billTo.address,m.billTo.email,m.billTo.tin?`TIN: ${m.billTo.tin}`:""].filter(Boolean).forEach(t=>{
    doc.splitTextToSize(t,100).forEach(l=>{doc.text(l,L,y);y+=4;});
  });
  const meta=[["BILLING NO.",m.invoiceNo||"—"],...(m.poNo?[["PO #",m.poNo]]:[]),["DATE",m.invoiceDate],["TERMS",m.terms],["DUE DATE",m.dueDate]];
  let my=topY;
  meta.forEach(([k,v])=>{
    doc.setFont(F,"bold");doc.setFontSize(7);doc.setTextColor(SLATE);doc.text(k,R-58,my);
    doc.setFont(F,"bold");doc.setFontSize(9);doc.setTextColor(k==="DUE DATE"&&m.overdue?RED:INK);
    doc.text(doc.splitTextToSize(String(v||"—"),36)[0],R,my,{align:"right"});
    my+=5.2;
  });
  y=Math.max(y,my)+4;

  autoTable(doc,{
    startY:y,margin:{left:L,right:W-R,bottom:16},theme:"plain",
    head:[["DATE","SERVICE","DESCRIPTION","TAX","QTY","RATE","AMOUNT"]],
    body:[[m.line.date,m.line.service,m.line.description.join("\n"),m.line.tax,"1",pdfNum(m.subtotal),pdfNum(m.subtotal)]],
    styles:{font:F,fontSize:8.5,textColor:INK,cellPadding:2.2,valign:"top",lineColor:"#f1f5f9",lineWidth:{bottom:0.2}},
    headStyles:{font:F,fontStyle:"bold",fillColor:NAVY,textColor:255,fontSize:6.5},
    columnStyles:{0:{cellWidth:22},1:{cellWidth:34,fontStyle:"bold"},3:{cellWidth:14,halign:"right"},4:{cellWidth:10,halign:"right"},5:{cellWidth:25,halign:"right"},6:{cellWidth:25,halign:"right"}},
    didParseCell:d=>{if(d.section==="head"&&d.column.index>=3)d.cell.styles.halign="right";},
  });
  y=doc.lastAutoTable.finalY+7;

  // Payment terms + bank details (left), totals (right)
  const leftY=y;
  doc.setFont(F,"bold");doc.setFontSize(8.5);doc.setTextColor(INK);doc.text("We require the ff payment terms:",L,y);y+=4.3;
  doc.setFont(F,"normal");doc.setFontSize(8);doc.setTextColor("#475569");
  ["1) 50% DP to start project","2) Billing of 40% up until installation","3) Retention of 10% upon certificate of completion"].forEach(t=>{doc.text(t,L,y);y+=3.9;});
  y+=2;
  BANKS.forEach((t,i)=>{doc.setFont(F,i===0?"bold":"normal");doc.setTextColor(i===0?INK:"#475569");doc.text(t,L,y);y+=3.9;});

  let ty=leftY;const tx=R-62;
  const trow=(label,val,{color=INK,bold=false,big=false}={})=>{
    doc.setFont(F,bold?"bold":"normal");doc.setFontSize(big?10.5:8.5);doc.setTextColor(bold?color:SLATE);doc.text(label,tx,ty);
    doc.setTextColor(color);doc.text(val,R,ty,{align:"right"});ty+=big?6:4.8;
  };
  trow("SUBTOTAL",pdfNum(m.subtotal));
  trow("TAX",pdfNum(m.vat));
  trow("TOTAL",pdfNum(m.gross));
  if(m.ewt>0) trow("Less: EWT",`(${pdfNum(m.ewt)})`,{color:RED});
  if(m.paid>0) trow("AMOUNT PAID",`(${pdfNum(m.paid)})`,{color:BLUE});
  doc.setDrawColor(NAVY);doc.setLineWidth(0.6);doc.line(tx,ty-2,R,ty-2);ty+=2.5;
  trow("BALANCE DUE",`PHP ${pdfNum(m.balance)}`,{color:m.balance>0?ORANGE:GREEN,bold:true,big:true});
  y=Math.max(y,ty)+5;

  if(m.vat>0){
    doc.setFont(F,"bold");doc.setFontSize(8.5);doc.setTextColor(INK);doc.text("TAX SUMMARY",L,y);
    autoTable(doc,{
      startY:y+2,margin:{left:L,right:W-L-90},theme:"plain",
      head:[["RATE","TAX","NET"]],body:[["VAT @ 12%",pdfNum(m.vat),pdfNum(m.subtotal)]],
      styles:{font:F,fontSize:8.5,textColor:INK,cellPadding:1.8,halign:"right"},
      headStyles:{font:F,fontStyle:"bold",fillColor:NAVY,textColor:255,fontSize:6.5,halign:"right"},
      columnStyles:{0:{halign:"center"}},didParseCell:d=>{if(d.column.index===0)d.cell.styles.halign="center";},
    });
    y=doc.lastAutoTable.finalY+6;
  }

  if(y>250){doc.addPage();y=24;}
  y+=12;
  doc.setDrawColor("#94a3b8");doc.setLineWidth(0.3);
  doc.line(L,y,L+70,y);doc.line(R-70,y,R,y);
  doc.setFont(F,"normal");doc.setFontSize(8);doc.setTextColor(SLATE);
  doc.text("Accepted By",L,y+4);doc.text("Accepted Date",R-70,y+4);
  y+=14;
  doc.setDrawColor(LINE);doc.line(L,y,R,y);
  doc.setFontSize(7);doc.setTextColor("#94a3b8");doc.text(CO_FOOTER,W/2,y+4.5,{align:"center"});
  doc.setFont(F,"bold");doc.setFontSize(8);doc.setTextColor("#475569");
  doc.text("This is a billing statement, not an official receipt or BIR invoice. The official invoice is issued separately.",W/2,y+10,{align:"center",maxWidth:R-L});

  stampPages(doc,{footer:`GMD Productions Inc. · Billing Statement ${m.invoiceNo||""}`.trim(),draft:m.draft,
    draftNote:"DRAFT – NOT FOR SUBMISSION · Finance or a Manager issues the client copy"});
  return doc.output("blob");
}

// ── Statement of Account ──────────────────────────────────────────────────
export function buildSoaPdf(m){
  const doc=newDoc("landscape");
  const W=doc.internal.pageSize.getWidth(),L=12,R=W-12;
  doc.setProperties({title:`Statement of Account — ${m.clientName}`,author:"GMD Productions Inc.",creator:"FabHub"});
  let y=header(doc,{dateStr:m.dateStr,rightLabel:m.refNos?`REF NO.: ${m.refNos}`:""});

  doc.setFont(F,"bold");doc.setFontSize(14);doc.setTextColor(INK);
  doc.text(m.draft?"STATEMENT OF ACCOUNT — DRAFT":"STATEMENT OF ACCOUNT",L,y+2);
  y+=10;
  const half=(R-L)/2;
  const field=(label,val,x,w)=>{
    doc.setFont(F,"bold");doc.setFontSize(7.5);doc.setTextColor(SLATE);doc.text(label,x,y);
    const lw=doc.getTextWidth(label)+3;
    doc.setFont(F,"bold");doc.setFontSize(9);doc.setTextColor(BLUE);
    doc.text(doc.splitTextToSize(val||"",w-lw)[0]||"",x+lw,y);
    doc.setDrawColor(NAVY);doc.setLineWidth(0.3);doc.line(x+lw,y+1.2,x+w-6,y+1.2);
  };
  field("CLIENT NAME:",m.clientName,L,half);
  field("BILLING ADDRESS:",m.address,L+half,half);
  y+=7;

  // Summary boxes
  const boxes=[[`TOTAL ${m.amtLbl}`,m.totals.vatable],["TOTAL VAT",m.totals.vat],["TOTAL PAYMENTS MADE",m.totals.payments],["TOTAL BALANCE",m.totals.balance],["TOTAL AMOUNT DUE",m.totals.due]];
  const bw=(R-L)/boxes.length;
  boxes.forEach(([k,v],i)=>{
    const x=L+i*bw,last=i===boxes.length-1;
    doc.setFillColor(last?"#fff7ed":"#f8fafc");doc.setDrawColor(LINE);doc.setLineWidth(0.3);doc.rect(x,y,bw,15,"FD");
    doc.setFont(F,"bold");doc.setFontSize(6.5);doc.setTextColor(SLATE);doc.text(k,x+bw/2,y+5,{align:"center"});
    doc.setFontSize(12);doc.setTextColor(last?ORANGE:INK);doc.text(pdfNum(v),x+bw/2,y+11.5,{align:"center"});
  });
  y+=20;

  const body=m.rows.map((r,i)=>[
    String(i+1),r.client,
    {content:r.project+(r.ref?`\n${r.ref}`:""),styles:{}},
    pdfNum(r.vatable),pdfNum(r.vat),pdfNum(r.gross),pdfNum(r.payments),pdfNum(r.ewt),pdfNum(r.due),pdfNum(r.balance),
  ]);
  autoTable(doc,{
    startY:y,margin:{left:L,right:W-R,bottom:18},theme:"plain",
    head:[["#","CLIENT NAME","PROJECT NAME",m.amtLbl,"VAT","SALES AMOUNT","PAYMENT MADE","WHT","TOTAL AMOUNT DUE","BALANCE"]],
    body,
    foot:[["","",{content:"TOTAL AMOUNT DUE",styles:{halign:"center"}},pdfNum(m.totals.vatable),pdfNum(m.totals.vat),pdfNum(m.totals.gross),pdfNum(m.totals.payments),pdfNum(m.totals.ewt),pdfNum(m.totals.due),pdfNum(m.totals.balance)]],
    styles:{font:F,fontSize:8,textColor:INK,cellPadding:2,valign:"top",lineColor:"#f1f5f9",lineWidth:{bottom:0.2}},
    headStyles:{font:F,fontStyle:"bold",fillColor:NAVY,textColor:255,fontSize:6.5},
    footStyles:{font:F,fontStyle:"bold",fillColor:NAVY,textColor:255,fontSize:8.5,halign:"right"},
    columnStyles:{0:{cellWidth:8,halign:"center",textColor:SLATE},1:{cellWidth:44,textColor:BLUE,fontStyle:"bold"},3:{halign:"right"},4:{halign:"right",cellWidth:18},5:{halign:"right"},6:{halign:"right",textColor:BLUE},7:{halign:"right",cellWidth:18},8:{halign:"right",textColor:ORANGE,fontStyle:"bold"},9:{halign:"right",fontStyle:"bold"}},
    didParseCell:d=>{
      if(d.section==="head"&&d.column.index>=3)d.cell.styles.halign="right";
      if(d.section==="foot"&&d.column.index===8)d.cell.styles.textColor=[249,115,22];
      if(d.section==="body"&&d.column.index===2){d.cell.styles.textColor=BLUE;d.cell.styles.fontStyle="bold";}
    },
  });
  y=doc.lastAutoTable.finalY+6;

  if(y>150){doc.addPage();y=20;}
  const notesH=36;
  doc.setDrawColor(LINE);doc.setLineWidth(0.3);doc.roundedRect(L,y,R-L,notesH,1.5,1.5,"S");
  let ny=y+6;
  doc.setFont(F,"bold");doc.setFontSize(8.5);doc.setTextColor(INK);doc.text("NOTES",L+5,ny);ny+=5;
  doc.setFont(F,"normal");doc.setFontSize(8);doc.setTextColor("#475569");
  doc.text("Thank you for your business! Please send or email (finance@gmd.ph) us a copy of the payment for proper recording.",L+5,ny);ny+=5.5;
  doc.setFont(F,"bold");doc.setTextColor(INK);doc.text("Payment Details:",L+5,ny);ny+=4.2;
  BANKS.forEach(t=>{doc.setFont(F,"normal");doc.setTextColor("#475569");doc.text(t,L+5,ny);ny+=4;});
  y+=notesH+9;

  [["Prepared by:",m.preparedBy],["Approved by:","Paulo Garcia"]].forEach(([lab,name],i)=>{
    const x=L+i*half;
    doc.setFont(F,"normal");doc.setFontSize(8);doc.setTextColor(SLATE);doc.text(lab,x,y);
    doc.setFont(F,"bold");doc.setFontSize(9.5);doc.setTextColor(INK);doc.text(name||"",x,y+8);
    doc.setFont(F,"normal");doc.setFontSize(7.5);doc.setTextColor(SLATE);doc.text("GMD Productions Inc.",x,y+12);
  });

  stampPages(doc,{footer:`GMD Productions Inc. · Statement of Account · ${m.clientName}`,draft:m.draft,
    draftNote:"DRAFT – NOT FOR SUBMISSION · Finance or a Manager issues the client copy"});
  return doc.output("blob");
}
