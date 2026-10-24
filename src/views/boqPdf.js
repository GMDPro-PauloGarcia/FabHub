// BOQ quotation as a real PDF file, for the "Share PDF" button.
//
// The print pop-up relies on window.print(), which iPhones ignore when FabHub
// runs from the Home Screen icon, so quotations couldn't leave the phone. This
// builds the same quotation with jsPDF and hands back a File the caller can
// pass to navigator.share (Viber / Mail / Files) or download.
//
// BOQBuilder lazy-loads this module (import()) so jsPDF only downloads when
// someone actually makes a PDF. The caller passes a plain model (see
// boqPdfModel in BOQBuilder) with every figure already computed and every
// quantity already formatted: nothing here does BOQ math.
import {jsPDF} from "jspdf";
import autoTable from "jspdf-autotable";
import {LS_REGULAR,LS_BOLD,LS_ITALIC} from "./boqPdfFonts";

const F="LS";
const SLATE="#64748b",INK="#0f172a",NAVY="#1e293b",LINE="#e2e8f0";
const hexRgb=h=>{const m=String(h||"").replace("#","");const v=m.length===3?m.split("").map(c=>c+c).join(""):m.padEnd(6,"0").slice(0,6);return[parseInt(v.slice(0,2),16)||0,parseInt(v.slice(2,4),16)||0,parseInt(v.slice(4,6),16)||0];};
// Section colour blended toward white (t = share of white), like the print
// page's `${clr}18` / `${clr}22` tints.
const tint=(h,t)=>hexRgb(h).map(c=>Math.round(c+(255-c)*t));
const pdfPeso=v=>"₱"+Number(v||0).toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2});

const addFonts=doc=>{
  doc.addFileToVFS("LS-Regular.ttf",LS_REGULAR);doc.addFont("LS-Regular.ttf",F,"normal");
  doc.addFileToVFS("LS-Bold.ttf",LS_BOLD);doc.addFont("LS-Bold.ttf",F,"bold");
  doc.addFileToVFS("LS-Italic.ttf",LS_ITALIC);doc.addFont("LS-Italic.ttf",F,"italic");
  doc.setFont(F,"normal");
};

export function buildBoqPdf(m){
  const doc=new jsPDF({unit:"mm",format:"a4",compress:true});
  addFonts(doc);
  const W=doc.internal.pageSize.getWidth(),H=doc.internal.pageSize.getHeight(),L=12,R=W-12;
  doc.setProperties({title:`Quotation ${m.quotationNo||""} — ${m.projectName}`.trim(),author:"GMD Productions Inc.",creator:"FabHub"});

  // ── Header ───────────────────────────────────────────────────────────────
  let y=16;
  doc.setFont(F,"bold");doc.setFontSize(17);doc.setTextColor(NAVY);doc.text("GMD Productions Inc.",L,y);
  doc.setFont(F,"normal");doc.setFontSize(8);doc.setTextColor(SLATE);doc.text("Fabrication & Project Management",L,y+4.5);
  doc.setFontSize(7);doc.setTextColor("#94a3b8");doc.text("BILL OF QUANTITIES",R,y-4.5,{align:"right"});
  doc.setFont(F,"bold");doc.setFontSize(14);doc.setTextColor(NAVY);doc.text(m.draft?"QUOTATION — DRAFT":"QUOTATION",R,y+1,{align:"right"});
  doc.setFont(F,"normal");doc.setFontSize(8.5);doc.setTextColor(SLATE);
  doc.text([m.quotationNo?`No. ${m.quotationNo}`:"",m.dateStr].filter(Boolean).join("   "),R,y+5.5,{align:"right"});
  y+=10;doc.setDrawColor(NAVY);doc.setLineWidth(0.8);doc.line(L,y,R,y);

  // ── Project box ──────────────────────────────────────────────────────────
  y+=4;
  const boxH=19;doc.setFillColor("#f8fafc");doc.setDrawColor(LINE);doc.setLineWidth(0.25);doc.roundedRect(L,y,R-L,boxH,2,2,"FD");
  const cell=(label,val,x,yy,w)=>{
    doc.setFont(F,"normal");doc.setFontSize(6.5);doc.setTextColor("#94a3b8");doc.text(label.toUpperCase(),x,yy);
    doc.setFont(F,"bold");doc.setFontSize(9.5);doc.setTextColor(INK);doc.text(doc.splitTextToSize(String(val||"—"),w)[0],x,yy+4);
  };
  const half=(R-L)/2;
  cell("Project",m.projectName,L+5,y+5.5,half-8);cell("Location",m.locationName,L+half+3,y+5.5,half-8);
  cell("Contractor","GMD Productions Inc.",L+5,y+13,half-8);cell("Date",m.dateStr||"—",L+half+3,y+13,half-8);
  y+=boxH+4;

  // ── Line items ───────────────────────────────────────────────────────────
  // meta[i] carries what autoTable can't: the row's kind and section colour,
  // used below to paint the left accent bar on every row of a section.
  const body=[],meta=[];
  const push=(cells,kind,clr)=>{body.push(cells);meta.push({kind,clr});};
  m.sections.forEach(sec=>{
    const clr=sec.color||SLATE;
    push([{content:`${sec.id}. ${sec.label}`.toUpperCase(),colSpan:7,styles:{fillColor:hexRgb(clr),textColor:255,fontStyle:"bold",fontSize:8}}],"sec",clr);
    sec.rows.forEach(r=>{
      if(r.kind==="sub"){
        push([{content:`${r.num}   ${r.label}`,colSpan:7,styles:{fillColor:tint(clr,.9),textColor:hexRgb(clr),fontStyle:"bold",cellPadding:{top:1.6,bottom:1.6,left:6,right:2}}}],"sub",clr);
      }else if(r.kind==="subtotal"){
        push([{content:`Sub-total ${r.label}`,colSpan:5,styles:{halign:"right",fontStyle:"italic",textColor:SLATE,fontSize:7.5,fillColor:tint(clr,.93)}},{content:pdfPeso(r.amount),styles:{halign:"right",fontStyle:"bold",fillColor:tint(clr,.93)}},{content:"",styles:{fillColor:tint(clr,.93)}}],"subtotal",clr);
      }else{
        push([{content:r.num,styles:{textColor:SLATE,fontSize:7.5}},r.description||"—",{content:r.qty,styles:{halign:"center"}},r.unit,{content:pdfPeso(r.unitCost),styles:{halign:"right"}},{content:pdfPeso(r.total),styles:{halign:"right",fontStyle:"bold"}},{content:r.remarks||"",styles:{textColor:SLATE,fontSize:7.5}}],"item",clr);
      }
    });
    push([{content:`Sub-total ${sec.label}`,colSpan:5,styles:{halign:"right",fontStyle:"bold",textColor:"#475569",fillColor:tint(clr,.87)}},{content:pdfPeso(sec.total),styles:{halign:"right",fontStyle:"bold",textColor:INK,fillColor:tint(clr,.87)}},{content:"",styles:{fillColor:tint(clr,.87)}}],"sectotal",clr);
  });
  const dark=(label,amount,fill)=>push([{content:label,colSpan:5,styles:{halign:"right",fontStyle:"bold",fillColor:fill,textColor:255,fontSize:9}},{content:pdfPeso(amount),styles:{halign:"right",fontStyle:"bold",fillColor:fill,textColor:255,fontSize:9}},{content:"",styles:{fillColor:fill}}],"total",null);
  const light=(label,amount,fill,color)=>push([{content:label,colSpan:5,styles:{halign:"right",fillColor:fill,textColor:color}},{content:amount,styles:{halign:"right",fillColor:fill,textColor:color}},{content:"",styles:{fillColor:fill}}],"total",null);
  dark("Grand Total",m.grandTotal,NAVY);
  if(m.discountVal>0){light("Discount",`(${pdfPeso(m.discountVal)})`,"#fffbeb","#92400e");dark("Net Total",m.netTotal,NAVY);}
  if(m.vatEnabled){light("VAT 12%",pdfPeso(m.vatAmt),"#f8fafc","#475569");dark("Grand Total w/ VAT",m.netTotal+m.vatAmt,INK);}

  autoTable(doc,{
    startY:y,margin:{left:L,right:W-R,top:14,bottom:16},
    head:[["Item No.","Description","Qty","Unit","Unit Cost","Total Amount","Remarks"]],
    body,
    theme:"plain",
    styles:{font:F,fontSize:8,textColor:INK,cellPadding:{top:1.6,bottom:1.6,left:2,right:2},valign:"top",overflow:"linebreak",lineColor:"#f1f5f9",lineWidth:{bottom:0.2}},
    headStyles:{font:F,fontStyle:"bold",fillColor:NAVY,textColor:255,fontSize:7,cellPadding:2.2},
    columnStyles:{0:{cellWidth:15},2:{cellWidth:16},3:{cellWidth:13},4:{cellWidth:25},5:{cellWidth:27},6:{cellWidth:28}},
    didParseCell:d=>{if(d.section==="head"&&d.column.index>=4&&d.column.index<=5)d.cell.styles.halign="right";if(d.section==="head"&&d.column.index===2)d.cell.styles.halign="center";},
    didDrawCell:d=>{
      if(d.section!=="body"||d.column.index!==0)return;
      const mm=meta[d.row.index];if(!mm||!mm.clr||mm.kind==="sec")return;
      doc.setFillColor(...hexRgb(mm.clr));doc.rect(d.cell.x,d.cell.y,1.1,d.cell.height,"F");
    },
  });
  y=doc.lastAutoTable.finalY+6;

  // ── Notes, bank details, payment terms, signatures ──────────────────────
  const need=h=>{if(y+h>H-16){doc.addPage();y=18;}};
  doc.setFontSize(8.5);
  const noteLines=m.notes.map(n=>doc.splitTextToSize(n,R-L-14));
  const notesH=8+noteLines.reduce((s,l)=>s+l.length*3.8,0)+4;
  need(notesH);
  doc.setFillColor("#f8fafc");doc.setDrawColor(LINE);doc.roundedRect(L,y,R-L,notesH,2,2,"FD");
  let ny=y+6;
  doc.setFont(F,"bold");doc.setFontSize(7.5);doc.setTextColor(NAVY);doc.text("GENERAL NOTES",L+5,ny);ny+=5;
  doc.setFont(F,"normal");doc.setFontSize(8.5);doc.setTextColor("#475569");
  noteLines.forEach(ls=>{doc.text("•",L+6,ny);doc.text(ls,L+10,ny);ny+=ls.length*3.8;});
  y+=notesH+6;

  need(30);
  const colX=[L,L+half+3];
  doc.setFont(F,"bold");doc.setFontSize(7.5);doc.setTextColor(NAVY);
  doc.text("BANK DETAILS",colX[0],y);doc.text("PAYMENT TERMS",colX[1],y);
  doc.setFont(F,"normal");doc.setFontSize(8);doc.setTextColor("#475569");
  ["Account Name: GMD PRODUCTIONS INC","BDO CHECKING — 012758000370","BPI CHECKING — 6011 04 82 03","METROBANK — 382-7-38202059-2"].forEach((t,i)=>doc.text(t,colX[0],y+5+i*4));
  ["50% Down Payment to start project","Billing of 40% up until installation","Retention of 10% upon certificate of completion"].forEach((t,i)=>doc.text(t,colX[1],y+5+i*4));
  y+=28;

  need(26);
  const sw=(R-L-12)/3;
  [["PREPARED BY","Rodney Erpe","Quantity Surveyor"],["APPROVED & SUBMITTED BY","Paulo Miguel Garcia","President"],["ACCEPTED BY",m.client||"Client Name / Representative","Signature over Printed Name"]].forEach(([lab,name,role],i)=>{
    const x=L+i*(sw+6);
    doc.setFont(F,"bold");doc.setFontSize(6.5);doc.setTextColor("#94a3b8");doc.text(lab,x,y);
    doc.setDrawColor(NAVY);doc.setLineWidth(0.4);doc.line(x,y+11,x+sw,y+11);
    doc.setFont(F,"bold");doc.setFontSize(8.5);doc.setTextColor(INK);doc.text(doc.splitTextToSize(name,sw)[0],x,y+15);
    doc.setFont(F,"normal");doc.setFontSize(7.5);doc.setTextColor(SLATE);doc.text(role,x,y+19);
  });

  // ── Every page: footer, and the DRAFT watermark when not cleared to send ─
  const pages=doc.getNumberOfPages();
  for(let p=1;p<=pages;p++){
    doc.setPage(p);
    doc.setFont(F,"normal");doc.setFontSize(7);doc.setTextColor("#94a3b8");
    doc.text(`GMD Productions Inc. · Quotation${m.quotationNo?" "+m.quotationNo:""}`,L,H-8);
    doc.text(`Page ${p} of ${pages}`,R,H-8,{align:"right"});
    if(m.draft){
      doc.saveGraphicsState();
      doc.setGState(new doc.GState({opacity:0.13}));
      // align:"center" ignores the angle, so start the rotated line half its
      // width back along the slant to centre it on the page.
      const wm="DRAFT – NOT FOR SUBMISSION",a=35*Math.PI/180;
      doc.setFont(F,"bold");doc.setFontSize(38);doc.setTextColor("#dc2626");
      const tw=doc.getTextWidth(wm);
      doc.text(wm,W/2-Math.cos(a)*tw/2,H/2+Math.sin(a)*tw/2,{angle:35});
      doc.restoreGraphicsState();
      doc.setFont(F,"bold");doc.setFontSize(7);doc.setTextColor("#dc2626");
      doc.text("DRAFT – NOT FOR SUBMISSION · needs Manager approval before sending",W/2,H-12,{align:"center"});
    }
  }
  return doc.output("blob");
}
