// Shared pieces for FabHub's generated PDFs (BOQ quotation, invoice, SOA):
// fonts with a peso sign, money formatting, colour helpers, and the per-page
// footer + DRAFT watermark. Every builder that imports this is lazy-loaded, so
// jsPDF only downloads when someone makes a PDF.
import {jsPDF} from "jspdf";
import {LS_REGULAR,LS_BOLD,LS_ITALIC} from "./boqPdfFonts";
import {LOGO_ON_DARK_PNG,LOGO_RATIO} from "./pdfLogo";

export const F="LS";
export const SLATE="#64748b",INK="#0f172a",NAVY="#1e293b",LINE="#e2e8f0";

export const hexRgb=h=>{const m=String(h||"").replace("#","");const v=m.length===3?m.split("").map(c=>c+c).join(""):m.padEnd(6,"0").slice(0,6);return[parseInt(v.slice(0,2),16)||0,parseInt(v.slice(2,4),16)||0,parseInt(v.slice(4,6),16)||0];};
// Colour blended toward white (t = share of white).
export const tint=(h,t)=>hexRgb(h).map(c=>Math.round(c+(255-c)*t));
export const pdfPeso=v=>"₱"+Number(v||0).toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2});
export const pdfNum=v=>Number(v||0).toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2});

// Standard PDF fonts have no peso sign, so every document embeds Liberation
// Sans (subset, see boqPdfFonts.js).
export const newDoc=(orientation="portrait")=>{
  const doc=new jsPDF({unit:"mm",format:"a4",orientation,compress:true});
  doc.addFileToVFS("LS-Regular.ttf",LS_REGULAR);doc.addFont("LS-Regular.ttf",F,"normal");
  doc.addFileToVFS("LS-Bold.ttf",LS_BOLD);doc.addFont("LS-Bold.ttf",F,"bold");
  doc.addFileToVFS("LS-Italic.ttf",LS_ITALIC);doc.addFont("LS-Italic.ttf",F,"italic");
  doc.setFont(F,"normal");
  return doc;
};

// Footer on every page, plus the DRAFT watermark when the copy isn't cleared
// to send (see each caller for who gets a clean copy).
export const stampPages=(doc,{footer,draft,draftNote,watermark})=>{
  const W=doc.internal.pageSize.getWidth(),H=doc.internal.pageSize.getHeight(),L=12,R=W-12;
  const pages=doc.getNumberOfPages();
  for(let p=1;p<=pages;p++){
    doc.setPage(p);
    doc.setFont(F,"normal");doc.setFontSize(7);doc.setTextColor("#94a3b8");
    doc.text(footer,L,H-8);
    doc.text(`Page ${p} of ${pages}`,R,H-8,{align:"right"});
    if(draft){
      doc.saveGraphicsState();
      doc.setGState(new doc.GState({opacity:0.13}));
      // align:"center" ignores the angle, so start the rotated line half its
      // width back along the slant to centre it on the page.
      const wm=watermark||"DRAFT – NOT FOR SUBMISSION",a=35*Math.PI/180;
      doc.setFont(F,"bold");doc.setFontSize(38);doc.setTextColor("#dc2626");
      // Long wording (an order that isn't approved) is shrunk to fit the slant.
      const fit=Math.min(38,38*(Math.hypot(W,H)*0.6)/doc.getTextWidth(wm));doc.setFontSize(fit);
      const tw=doc.getTextWidth(wm);
      doc.text(wm,W/2-Math.cos(a)*tw/2,H/2+Math.sin(a)*tw/2,{angle:35});
      doc.restoreGraphicsState();
      doc.setFont(F,"bold");doc.setFontSize(7);doc.setTextColor("#dc2626");
      doc.text(draftNote||"DRAFT – NOT FOR SUBMISSION",W/2,H-12,{align:"center"});
    }
  }
};

// Navy band with the GMD logo (white lettering), company name and a date,
// then a slate sub-bar with the tagline and a reference. Used by the billing
// statement, SOA, purchase order and work order. Returns the y to continue at.
export const TAGLINE="Retail Design & Build | Construction | Modular Fit-outs | Signage | POP Displays";
export const docHeader=(doc,{dateStr,dateLabel="DATE:",rightLabel})=>{
  const W=doc.internal.pageSize.getWidth();
  doc.setFillColor(NAVY);doc.rect(0,0,W,20,"F");
  const lh=13,lw=lh*LOGO_RATIO;
  doc.addImage(LOGO_ON_DARK_PNG,"PNG",10,3.5,lw,lh);
  doc.setDrawColor("#475569");doc.setLineWidth(0.3);doc.line(10+lw+3,5,10+lw+3,15);
  doc.setFont(F,"bold");doc.setFontSize(15);doc.setTextColor(255);doc.text("GMD PRODUCTIONS INC.",10+lw+6,13);
  doc.setFont(F,"bold");doc.setFontSize(9.5);doc.setTextColor("#f97316");doc.text(dateStr||"",W-12,13,{align:"right"});
  const dw=doc.getTextWidth(dateStr||"");
  doc.setFont(F,"normal");doc.setFontSize(8);doc.setTextColor("#cbd5e1");doc.text(dateLabel,W-12-dw-2,13,{align:"right"});
  doc.setFillColor("#334155");doc.rect(0,20,W,7,"F");
  doc.setFillColor("#ea580c");doc.rect(0,27,W,0.8,"F");
  doc.setFont(F,"normal");doc.setFontSize(7);doc.setTextColor("#cbd5e1");
  doc.text(TAGLINE,12,24.6);
  if(rightLabel) doc.text(rightLabel,W-12,24.6,{align:"right"});
  return 36;
};
