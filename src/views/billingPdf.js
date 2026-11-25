// Invoice and Statement of Account as PDF files, for "Share PDF" on the
// Billing page (see SharePdf.jsx for why). Lazy-loaded from BillingView.
//
// Both take a plain model built in BillingView (invoiceData / soaData), the
// SAME figures its print pages use, so the PDF and the printout can't
// disagree. Nothing here does billing math.
import autoTable from "jspdf-autotable";
import {F,SLATE,INK,NAVY,LINE,pdfNum,newDoc,stampPages,docHeader} from "./pdfKit";

const ORANGE="#ea580c",BLUE="#2563eb",GREEN="#059669",RED="#dc2626";
const BANKS=["Account Name: GMD PRODUCTIONS INC","BDO CHECKING — 012758000370","BPI CHECKING — 6011 04 82 03","METROBANK — 382-7-38202059-2"];
const CO_FOOTER="GMD PRODUCTIONS INC · 32 Santan Unit H Brgy Fortune, Marikina, NCR 1802 PH · TIN 010-063-229-000";

const header=docHeader;

// ── Billing statement (a milestone's invoice; never titled "Tax Invoice") ──
export function buildInvoicePdf(m){
  const doc=newDoc();
  const W=doc.internal.pageSize.getWidth(),L=12,R=W-12;
  doc.setProperties({title:`Billing Statement ${m.invoiceNo||""} — ${m.billTo.name}`.trim(),author:"GMD Productions Inc.",creator:"FabHub"});
  let y=header(doc,{dateStr:m.invoiceDate,rightLabel:`BILLING NO.: ${m.invoiceNo||"—"}`});

  doc.setFont(F,"bold");doc.setFontSize(16);doc.setTextColor(INK);
  doc.text((m.draft?`${m.docTitle} — DRAFT`:m.docTitle).toUpperCase(),L,y+2);
  y+=9;
  // Kind of billing + its % of the contract (billingPosition, src/core.js).
  const pos=m.position;
  if(pos){
    doc.setFont(F,"bold");doc.setFontSize(7.5);
    const pw=doc.getTextWidth(pos.kind)+5;
    doc.setFillColor(ORANGE);doc.roundedRect(L,y-3.6,pw,5.2,1,1,"F");
    doc.setTextColor(255);doc.text(pos.kind,L+2.5,y);
    let x=L+pw+3;
    const seg=(t,bold)=>{doc.setFont(F,bold?"bold":"normal");doc.setFontSize(8.5);doc.setTextColor(bold?INK:"#475569");doc.text(t,x,y);x+=doc.getTextWidth(t);};
    const sep="  ·  ";
    if(pos.seq) seg(`Billing ${pos.seq}${pos.count?` of ${pos.count}`:""}`+(pos.workPct!=null?sep:""),false);
    if(pos.workPct!=null) seg(`Work ${pos.workPct}% complete`,false);
    y+=8;
  }

  // Bill to (left) and invoice details (right)
  const topY=y;
  doc.setFont(F,"bold");doc.setFontSize(7);doc.setTextColor("#94a3b8");doc.text("BILL TO",L,y);
  y+=4.5;
  doc.setFont(F,"bold");doc.setFontSize(10.5);doc.setTextColor(INK);
  doc.splitTextToSize(m.billTo.name||"—",100).forEach(l=>{doc.text(l,L,y);y+=4.6;});
  // Project right under the client, then where it is.
  if(m.billTo.project){doc.setFont(F,"bold");doc.setFontSize(9.5);doc.setTextColor(BLUE);
    doc.splitTextToSize(m.billTo.project,100).forEach(l=>{doc.text(l,L,y);y+=4.4;});}
  const where=[m.billTo.location?`Location: ${m.billTo.location}`:"",m.billTo.ceNo?`Ref: ${m.billTo.ceNo}`:""].filter(Boolean).join(" · ");
  if(where){doc.setFont(F,"normal");doc.setFontSize(8.5);doc.setTextColor("#475569");doc.splitTextToSize(where,100).forEach(l=>{doc.text(l,L,y);y+=4;});}
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

  const asPct=m.line.qty&&m.line.qty!=="1";
  autoTable(doc,{
    startY:y,margin:{left:L,right:W-R,bottom:16},theme:"plain",
    // Billed as a share of the contract: % BILLED x CONTRACT PRICE = AMOUNT
    // (statementLine, src/core.js); QTY 1 when the % can't reproduce it.
    // Prices in the line are VAT-exclusive (VAT is added below in TAX), so
    // the header says so; the contract summary shows the VAT-inclusive price.
    head:[["DATE","SERVICE","DESCRIPTION","TAX",asPct?"% BILLED":"QTY",asPct?(m.vat>0?"CONTRACT PRICE\n(VAT-EX)":"CONTRACT PRICE"):(m.vat>0?"RATE (VAT-EX)":"RATE"),m.vat>0?"AMOUNT\n(VAT-EX)":"AMOUNT"]],
    body:[[m.line.date,m.line.service,m.line.description.join("\n"),m.line.tax,m.line.qty??"1",pdfNum(m.line.rate??m.subtotal),pdfNum(m.line.amount??m.subtotal)]],
    styles:{font:F,fontSize:8.5,textColor:INK,cellPadding:2.2,valign:"top",lineColor:"#f1f5f9",lineWidth:{bottom:0.2}},
    headStyles:{font:F,fontStyle:"bold",fillColor:NAVY,textColor:255,fontSize:6.5},
    columnStyles:{0:{cellWidth:22},1:{cellWidth:34,fontStyle:"bold"},3:{cellWidth:15,halign:"right"},4:{cellWidth:asPct?17:10,halign:"right",fontStyle:"bold"},5:{cellWidth:asPct?27:25,halign:"right"},6:{cellWidth:25,halign:"right"}},
    didParseCell:d=>{if(d.section==="head"&&d.column.index>=3)d.cell.styles.halign="right";},
  });
  y=doc.lastAutoTable.finalY+7;

  // Bank details (left), totals (right)
  const leftY=y;
  doc.setFontSize(8);
  BANKS.forEach((t,i)=>{doc.setFont(F,i===0?"bold":"normal");doc.setTextColor(i===0?INK:"#475569");doc.text(t,L,y);y+=3.9;});

  let ty=leftY;const tx=R-62;
  const trow=(label,val,{color=INK,bold=false,big=false}={})=>{
    doc.setFont(F,bold?"bold":"normal");doc.setFontSize(big?10.5:8.5);doc.setTextColor(bold?color:SLATE);doc.text(label,tx,ty);
    doc.setTextColor(color);doc.text(val,R,ty,{align:"right"});ty+=big?6:4.8;
  };
  if(pos&&pos.retentionHeld>0){
    trow("THIS BILLING (GROSS)",pdfNum(pos.gross));
    trow(`Less: retention ${pos.retentionPct}%`,`(${pdfNum(pos.retentionHeld)})`,{color:RED});
  }
  trow("SUBTOTAL",pdfNum(m.subtotal));
  trow("TAX",pdfNum(m.vat));
  trow("TOTAL",pdfNum(m.gross));
  if(m.ewt>0) trow("Less: EWT",`(${pdfNum(m.ewt)})`,{color:RED});
  if(m.paid>0) trow("AMOUNT RECEIVED",`(${pdfNum(m.paid)})`,{color:BLUE});
  doc.setDrawColor(NAVY);doc.setLineWidth(0.6);doc.line(tx,ty-2,R,ty-2);ty+=2.5;
  trow("BALANCE DUE",`PHP ${pdfNum(m.balance)}`,{color:m.balance>0?ORANGE:GREEN,bold:true,big:true});
  y=Math.max(y,ty)+5;

  // Payments received on this billing, one line each, adding up to AMOUNT
  // RECEIVED above (invoiceModel's `payments`).
  const pays=(m.payments||[]).filter(p=>p.amount);
  if(pays.length){
    if(y>235){doc.addPage();y=24;}
    doc.setFont(F,"bold");doc.setFontSize(8.5);doc.setTextColor(INK);doc.text("PAYMENTS RECEIVED",L,y);
    autoTable(doc,{
      startY:y+2,margin:{left:L,right:W-R,bottom:16},theme:"plain",
      head:[["DATE RECEIVED","METHOD","BANK","REFERENCE","AMOUNT"]],
      body:pays.map(p=>[p.date||"—",p.method||"—",String(p.bank||"").toUpperCase()||"—",p.ref||"—",pdfNum(p.amount)]),
      foot:pays.length>1?[["","","","TOTAL RECEIVED",pdfNum(pays.reduce((s,p)=>s+p.amount,0))]]:undefined,
      styles:{font:F,fontSize:8.5,textColor:INK,cellPadding:1.8,lineColor:"#f1f5f9",lineWidth:{bottom:0.2}},
      headStyles:{font:F,fontStyle:"bold",fillColor:NAVY,textColor:255,fontSize:6.5},
      footStyles:{font:F,fontStyle:"bold",textColor:INK,fontSize:8.5},
      columnStyles:{0:{cellWidth:28},4:{cellWidth:32,halign:"right"}},
      didParseCell:d=>{if(d.column.index===4)d.cell.styles.halign="right";},
    });
    y=doc.lastAutoTable.finalY+6;
  }

  // Contract summary: four figures and one bar (paid / billed, unpaid / this
  // billing / not yet billed). Same numbers as the print page (invoiceData).
  const p=m.progress;
  if(p){
    if(y>215){doc.addPage();y=24;}
    const boxH=40;
    doc.setDrawColor(LINE);doc.setLineWidth(0.3);doc.roundedRect(L,y,R-L,boxH,1.5,1.5,"S");
    let cy=y+6;
    doc.setFont(F,"bold");doc.setFontSize(8.5);doc.setTextColor(INK);doc.text("CONTRACT SUMMARY",L+4,cy);
    doc.setFont(F,"normal");doc.setFontSize(7);doc.setTextColor("#94a3b8");
    doc.text(`as of ${m.asOf||""}${p.vatable?" · amounts incl. VAT":""}`,R-4,cy,{align:"right"});
    cy+=6;
    // EWT gets its own figure, the same basis as the statement's "Less: EWT"
    // and "AMOUNT PAID" lines above, so PAID TO DATE is exactly what the
    // client paid (invoiceContractProgress: cashPaid / ewtBilled / remainingNet).
    const hasEwt=p.ewtBilled>0.005;
    const cards=[[p.vatable?"CONTRACT PRICE (VAT-INC)":"CONTRACT PRICE",p.contract,p.vatable?`${pdfNum(p.contractExVat)} + 12% VAT`:"",INK],
     ["BILLED TO DATE",p.billed,`${p.billedPct}% of contract, incl. this billing`,BLUE],
     ["RECEIVED TO DATE",p.cashPaid,`${p.cashPaidPct}% of contract`,GREEN],
     ...(hasEwt?[["TAX WITHHELD (EWT)",p.ewtBilled,"on billed to date, per BIR 2307",RED]]:[]),
     ["REMAINING ON CONTRACT",p.remainingNet,hasEwt?"after payments and EWT":`${Math.max(0,Math.round((100-p.cashPaidPct)*10)/10)}% of contract`,ORANGE]];
    const cw=(R-L-8)/cards.length;
    cards.forEach(([k,v,sub,c],i)=>{
      const x=L+4+i*cw;
      doc.setFont(F,"bold");doc.setFontSize(6.5);doc.setTextColor(SLATE);doc.text(k,x,cy);
      doc.setFontSize(10.5);doc.setTextColor(c);doc.text(pdfNum(v),x,cy+5.5);
      if(sub){doc.setFont(F,"normal");doc.setFontSize(6.5);doc.setTextColor(SLATE);doc.text(doc.splitTextToSize(sub,cw-3)[0],x,cy+9.5);}
    });
    cy+=14;
    // Same basis as the cards: paid, EWT, then what is still due.
    const segs=[[GREEN,"Received",p.cashPaidPct],[RED,"EWT",p.ewtBilledPct],["#f59e0b","Billed, unpaid",p.prevDuePct],[ORANGE,p.thisDuePct<p.thisPct-0.05?"This billing, unpaid":"This billing",p.thisDuePct],["#e2e8f0","Not yet billed",p.unbilledPct]];
    const tot=Math.max(100,segs.reduce((s,a)=>s+a[2],0));
    const bx=L+4,bw=R-L-8,bh=4.5;
    doc.setFillColor("#e2e8f0");doc.roundedRect(bx,cy,bw,bh,2,2,"F");
    let sx=bx;
    segs.forEach(([c,,v])=>{if(v<=0)return;const w=bw*v/tot;doc.setFillColor(c);doc.rect(sx,cy,w,bh,"F");sx+=w;});
    cy+=bh+5;
    let lx=bx;
    doc.setFont(F,"normal");doc.setFontSize(7);
    segs.filter(a=>a[2]>0).forEach(([c,l,v])=>{
      doc.setFillColor(c);doc.rect(lx,cy-2.3,2.6,2.6,"F");
      const t=`${l} ${v}%`;doc.setTextColor("#475569");doc.text(t,lx+3.8,cy);
      lx+=3.8+doc.getTextWidth(t)+6;
    });
    y+=boxH+6;
  }

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
  let y=header(doc,{dateStr:m.dateStr,rightLabel:""});

  doc.setFont(F,"bold");doc.setFontSize(14);doc.setTextColor(INK);
  doc.text(m.draft?"STATEMENT OF ACCOUNT — DRAFT":"STATEMENT OF ACCOUNT",L,y+2);
  doc.setFont(F,"normal");doc.setFontSize(8.5);doc.setTextColor(SLATE);doc.text(`As of ${m.dateStr||""}`,R,y+2,{align:"right"});
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
  if(m.termsLbl){
    doc.setFont(F,"bold");doc.setFontSize(7.5);doc.setTextColor(INK);doc.text("PAYMENT TERMS:",L,y);
    const tw=doc.getTextWidth("PAYMENT TERMS:")+2;
    doc.setFont(F,"normal");doc.setTextColor("#475569");doc.text(`${m.termsLbl}. Each billing below shows its own due date.`,L+tw,y);
    y+=6;
  }

  // Every outstanding project's billings, one line each (soaData's lines).
  const lines=m.rows.flatMap(r=>r.lines||[]);
  const sum=k=>lines.reduce((s,x)=>s+(Number(x[k])||0),0);
  const T={billed:sum("billed"),ewt:sum("ewt"),paid:sum("paid"),due:sum("amtDue")};
  const anyEwt=T.ewt>0.004;

  if(m.rows.length){
    // Summary: what was billed, what was paid, what to pay now.
    const boxes=[["TOTAL BILLED",T.billed,INK,"#f8fafc"],
      ...(anyEwt?[["LESS: TAX YOU WITHHELD",T.ewt,INK,"#f8fafc"]]:[]),
      ["LESS: PAYMENTS RECEIVED",T.paid,GREEN,"#f8fafc"],
      ["AMOUNT DUE NOW",T.due,ORANGE,"#fff7ed"],
      ["OF WHICH PAST DUE",m.overdue||0,(m.overdue||0)>0.01?RED:SLATE,(m.overdue||0)>0.01?"#fef2f2":"#f8fafc"]];
    const bw=(R-L)/boxes.length;
    boxes.forEach(([k,v,c,bg],i)=>{
      const x=L+i*bw;
      doc.setFillColor(bg);doc.setDrawColor(LINE);doc.setLineWidth(0.3);doc.rect(x,y,bw,16,"FD");
      doc.setFont(F,"bold");doc.setFontSize(6.5);doc.setTextColor(SLATE);doc.text(k,x+bw/2,y+5,{align:"center"});
      doc.setFontSize(12.5);doc.setTextColor(c);doc.text(pdfNum(v),x+bw/2,y+12,{align:"center"});
    });
    y+=20;
    doc.setFont(F,"italic");doc.setFontSize(7.5);doc.setTextColor(SLATE);
    doc.text(`How to read this: amount due now = total billed${anyEwt?", less the tax you withheld (please send us BIR Form 2307)":""}, less payments received. Amounts include VAT where VAT applies.`,L,y);
    y+=6;
  } else {
    doc.setFillColor("#ecfdf5");doc.setDrawColor(GREEN);doc.setLineWidth(0.6);doc.rect(L,y,R-L,11,"FD");
    doc.setFont(F,"bold");doc.setFontSize(11);doc.setTextColor(GREEN);
    doc.text(`PAID IN FULL — no outstanding balance as of ${m.dateStr||""}`,W/2,y+7.2,{align:"center"});
    y+=17;
  }

  const fd=ds=>ds?new Date(ds+"T00:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"—";
  const tableTitle=t=>{doc.setFont(F,"bold");doc.setFontSize(8.5);doc.setTextColor(INK);doc.text(t.toUpperCase(),L,y);y+=2.5;};

  if(m.rows.length){
    tableTitle("Billings not yet fully paid, by project");
    const cols=["BILLING NO.","DATE","DESCRIPTION","AMOUNT BILLED",...(anyEwt?["TAX WITHHELD"]:[]),"PAID","AMOUNT DUE","DUE DATE","STATUS"];
    const nC=cols.length,ci=k=>cols.indexOf(k);
    const body=[],meta=[];
    m.rows.forEach(r=>{
      const p=r.progress;
      const ref=[r.ref,r.location].filter(Boolean).join(" · ");
      body.push([{content:r.project+(ref?`\n${ref}`:""),colSpan:nC,styles:{fillColor:"#eff6ff",textColor:BLUE,fontStyle:"bold",fontSize:8.5,cellPadding:{top:2.2,bottom:2.2,left:3,right:3},minCellHeight:11}}]);
      meta.push({kind:"proj",p});
      (r.lines||[]).forEach(x=>{
        body.push([x.no||"—",fd(x.date),x.what+(x.pct!=null?`\n${x.pct}% of the contract`:""),pdfNum(x.billed),...(anyEwt?[x.ewt>0?`(${pdfNum(x.ewt)})`:"—"]:[]),x.paid>0?`(${pdfNum(x.paid)})`:"—",pdfNum(x.amtDue),fd(x.dueDate),x.status]);
        meta.push({kind:"line",x});
      });
    });
    autoTable(doc,{
      startY:y,margin:{left:L,right:W-R,bottom:18},theme:"plain",
      head:[cols],body,
      foot:[[{content:"TOTAL AMOUNT DUE NOW",colSpan:ci("AMOUNT DUE"),styles:{halign:"right"}},{content:pdfNum(T.due),styles:{halign:"right",textColor:[249,115,22],fontSize:10}},{content:(m.overdue||0)>0.01?`Past due: ${pdfNum(m.overdue)}`:"",colSpan:2,styles:{halign:"left",textColor:[252,165,165],fontSize:8}}]],
      styles:{font:F,fontSize:8,textColor:INK,cellPadding:2,valign:"top",lineColor:"#e2e8f0",lineWidth:{bottom:0.2}},
      headStyles:{font:F,fontStyle:"bold",fillColor:NAVY,textColor:255,fontSize:6.5},
      footStyles:{font:F,fontStyle:"bold",fillColor:NAVY,textColor:255,fontSize:9},
      columnStyles:{[ci("BILLING NO.")]:{cellWidth:24,fontStyle:"bold"},[ci("DATE")]:{cellWidth:22},[ci("AMOUNT BILLED")]:{halign:"right",cellWidth:28},
        ...(anyEwt?{[ci("TAX WITHHELD")]:{halign:"right",cellWidth:25,textColor:SLATE}}:{}),
        [ci("PAID")]:{halign:"right",cellWidth:28,textColor:GREEN},[ci("AMOUNT DUE")]:{halign:"right",cellWidth:28,fontStyle:"bold",textColor:ORANGE},
        [ci("DUE DATE")]:{cellWidth:22},[ci("STATUS")]:{cellWidth:32,fontStyle:"bold"}},
      didParseCell:d=>{
        if(d.section==="head"&&[ci("AMOUNT BILLED"),ci("TAX WITHHELD"),ci("PAID"),ci("AMOUNT DUE")].includes(d.column.index))d.cell.styles.halign="right";
        if(d.section==="body"&&meta[d.row.index]?.kind==="line"&&d.column.index===ci("STATUS")){
          const st=meta[d.row.index].x.status;
          d.cell.styles.textColor=st==="Past due"?RED:st.startsWith("Paid")?GREEN:st==="Partly paid"?"#b45309":INK;
        }
      },
      didDrawCell:d=>{
        // Project row: contract progress at the right (Paid / billed, unpaid / not yet billed).
        if(d.section!=="body"||meta[d.row.index]?.kind!=="proj")return;
        const p=meta[d.row.index].p;if(!p)return;
        const bw=70,bh=3,bx=d.cell.x+d.cell.width-bw-3,by=d.cell.y+d.cell.height-bh-2.4;
        doc.setFont(F,"normal");doc.setFontSize(7);doc.setTextColor("#475569");
        doc.text(`Contract ${pdfNum(p.contract)}  ·  Billed ${p.billedPct}%  ·  Paid ${p.paidPct}%`,bx+bw,by-1.6,{align:"right"});
        const tot=Math.max(100,p.paidPct+p.prevUnpaidPct+p.unbilledPct);
        doc.setFillColor("#e2e8f0");doc.roundedRect(bx,by,bw,bh,1.4,1.4,"F");
        let sx=bx;[[GREEN,p.paidPct],["#f59e0b",p.prevUnpaidPct]].forEach(([c,v])=>{if(v<=0)return;const w=bw*v/tot;doc.setFillColor(c);doc.rect(sx,by,w,bh,"F");sx+=w;});
      },
    });
    y=doc.lastAutoTable.finalY+4;
    let lx=L;doc.setFont(F,"normal");doc.setFontSize(7);
    [[GREEN,"Paid"],["#f59e0b","Billed, not yet paid"],["#e2e8f0","Not yet billed"]].forEach(([c,l])=>{
      doc.setFillColor(c);doc.rect(lx,y-2.3,2.6,2.6,"F");doc.setTextColor("#475569");doc.text(l,lx+3.8,y);lx+=3.8+doc.getTextWidth(l)+6;});
    doc.setTextColor("#94a3b8");doc.text("Contract bar: share of each project's contract price"+(m.rows.some(r=>r.progress?.withholding)?"; paid includes tax withheld":""),lx,y);
    y+=8;
  }

  // Settled projects: fully paid within the last few months, for reference
  // only. Left out when there are none (it only said so before).
  if(m.settledRows&&m.settledRows.length){
    // Keep the table together: new page when it won't fit below.
    if(y+22+m.settledRows.length*9>doc.internal.pageSize.getHeight()-18){doc.addPage();y=20;}
    tableTitle(`Fully paid — settled since ${fd(m.settledSince)} (for your reference)`);
    const projText=r=>r.project+(r.ref?`\n${r.ref}`:"");
    autoTable(doc,{
      startY:y,margin:{left:L,right:W-R,bottom:18},theme:"plain",
      head:[["#","PROJECT NAME","AMOUNT BILLED","PAID","LAST PAYMENT","STATUS"]],
      body:m.settledRows.map((r,i)=>[String(i+1),projText(r),pdfNum(r.gross),pdfNum(r.payments),fd(r.lastPaid),"PAID"]),
      foot:[["","TOTAL SETTLED",pdfNum(m.settledTotals.gross),pdfNum(m.settledTotals.payments),"",""]],
      styles:{font:F,fontSize:8,textColor:INK,cellPadding:2,valign:"top",lineColor:"#f1f5f9",lineWidth:{bottom:0.2}},
      headStyles:{font:F,fontStyle:"bold",fillColor:"#475569",textColor:255,fontSize:6.5},
      footStyles:{font:F,fontStyle:"bold",fillColor:"#475569",textColor:255,fontSize:8.5,halign:"right"},
      columnStyles:{0:{cellWidth:8,halign:"center",textColor:SLATE},2:{halign:"right",cellWidth:34},3:{halign:"right",textColor:BLUE,cellWidth:34},4:{halign:"right",cellWidth:30},5:{halign:"right",cellWidth:20,textColor:GREEN,fontStyle:"bold"}},
      didParseCell:d=>{
        if((d.section==="head"||d.section==="foot")&&d.column.index>=2)d.cell.styles.halign="right";
        if(d.section==="foot"&&d.column.index===1)d.cell.styles.halign="left";
        if(d.section==="body"&&d.column.index===1){d.cell.styles.textColor=BLUE;d.cell.styles.fontStyle="bold";}
      },
    });
    y=doc.lastAutoTable.finalY+6;
  }

  // Notes (left) and signatures (right) side by side, so a one-project SOA
  // stays on one page; new page only when they don't fit.
  const notesH=35,nw=(R-L)*0.6;
  if(y+notesH>doc.internal.pageSize.getHeight()-9){doc.addPage();y=20;}
  doc.setDrawColor(LINE);doc.setLineWidth(0.3);doc.roundedRect(L,y,nw,notesH,1.5,1.5,"S");
  let ny=y+5.5;
  doc.setFont(F,"bold");doc.setFontSize(8.5);doc.setTextColor(INK);doc.text("NOTES",L+5,ny);ny+=4.8;
  doc.setFont(F,"normal");doc.setFontSize(8);doc.setTextColor("#475569");
  doc.splitTextToSize("Thank you for your business! Please send or email (finance@gmd.ph) us a copy of the payment for proper recording.",nw-10).forEach(l=>{doc.text(l,L+5,ny);ny+=3.8;});ny+=1;
  doc.setFont(F,"bold");doc.setTextColor(INK);doc.text("Payment Details:",L+5,ny);ny+=4;
  BANKS.forEach(t=>{doc.setFont(F,"normal");doc.setTextColor("#475569");doc.text(t,L+5,ny);ny+=3.6;});

  const sx=L+nw+10,sw=(R-sx)/2;
  [["Prepared by:",m.preparedBy],["Approved by:","Paulo Garcia"]].forEach(([lab,name],i)=>{
    const x=sx+i*sw,sy=y+12;
    doc.setFont(F,"normal");doc.setFontSize(8);doc.setTextColor(SLATE);doc.text(lab,x,sy);
    doc.setFont(F,"bold");doc.setFontSize(9.5);doc.setTextColor(INK);doc.text(name||"",x,sy+12);
    doc.setDrawColor("#94a3b8");doc.setLineWidth(0.3);doc.line(x,sy+13.5,x+sw-6,sy+13.5);
    doc.setFont(F,"normal");doc.setFontSize(7.5);doc.setTextColor(SLATE);doc.text("GMD Productions Inc.",x,sy+17.5);
  });

  stampPages(doc,{footer:`GMD Productions Inc. · Statement of Account · ${m.clientName}`,draft:m.draft,
    draftNote:"DRAFT – NOT FOR SUBMISSION · Finance or a Manager issues the client copy"});
  return doc.output("blob");
}
