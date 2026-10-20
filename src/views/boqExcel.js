// BOQ → Excel (.xlsx) export, in two versions:
//   client   — the quotation as printed: selling prices only, safe to send out.
//   internal — direct cost, quoted price, markup and margin per line. Manager/QS
//              only (gated in BOQBuilder); never send it to a client.
// Line totals, sub-totals, discount, VAT and margins are live formulas, so a
// quantity edited in Excel re-foots the sheet. Unit prices are written as the
// stored quoted figures, not re-derived from cost × markup: the app rounds with
// JS floats, and 13 saved lines (Oct 2026) differ from Excel's ROUND by ₱0.01.
// Labels match parseBoqAoa in BOQBuilder ("Sub-total …", "Discount", "VAT …",
// "GRAND TOTAL"), so an exported file imports back cleanly. Re-import the
// INTERNAL copy: its "Direct Unit Cost" column is what Import expects; the
// client copy's prices already include the markup.
// ExcelJS (~1 MB) is loaded on first export only, as its own chunk.

const PESO='"₱"#,##0.00';
const PESO_PAREN='("₱"#,##0.00)';
const PCT='0.0%';
const DARK="FF1E293B",WHITE="FFFFFFFF",MUTED="FF64748B",LINE="FFE2E8F0";
const argb=hex=>{const h=String(hex||"").replace("#","");return /^[0-9a-f]{6}$/i.test(h)?"FF"+h.toUpperCase():"FF64748B";};
// Section colour blended toward white, for sub-section and sub-total tints.
const tint=(hex,p)=>{const h=argb(hex).slice(2);const c=[0,2,4].map(i=>Math.round(parseInt(h.slice(i,i+2),16)+(255-parseInt(h.slice(i,i+2),16))*p));return "FF"+c.map(v=>v.toString(16).padStart(2,"0")).join("").toUpperCase();};
const fill=c=>({type:"pattern",pattern:"solid",fgColor:{argb:c}});
const thin={style:"thin",color:{argb:LINE}};
const xlBorder={top:thin,left:thin,bottom:thin,right:thin};
const r2=n=>Math.round((Number(n)||0)*100)/100;

// columns: client  A No | B Description | C Qty | D Unit | E Unit Cost | F Total | G Remarks
//          internal A No | B Description | C Qty | D Unit | E Direct Unit Cost | F Direct Total
//                   | G Unit Price | H Total Amount | I Markup % | J Margin | K Margin % | L Remarks
const LAYOUT={
  client:{cols:[["Item No.",9],["Description",58],["Qty",8],["Unit",9],["Unit Cost (₱)",16],["Total Amount (₱)",18],["Remarks",24]],
    sum:["F"],main:"F",last:"G"},
  internal:{cols:[["Item No.",9],["Description",50],["Qty",8],["Unit",9],["Direct Unit Cost (₱)",17],["Direct Total (₱)",17],["Unit Price (₱)",16],["Total Amount (₱)",18],["Markup %",10],["Margin (₱)",16],["Margin %",10],["Remarks",22]],
    sum:["F","H","J"],main:"H",last:"L"},
};

export function buildBoqWorkbook(ExcelJS,{mode="client",sections=[],items=[],groupSection,meta={},discount=0,vatEnabled=null,notes=[]}){
  const internal=mode==="internal";
  const L=LAYOUT[internal?"internal":"client"];
  const wb=new ExcelJS.Workbook();
  wb.creator="FabHub";wb.created=new Date();
  wb.calcProperties.fullCalcOnLoad=true;
  const ws=wb.addWorksheet(internal?"BOQ Internal":"BOQ",{
    pageSetup:{paperSize:9,orientation:internal?"landscape":"portrait",fitToPage:true,fitToWidth:1,fitToHeight:0,margins:{left:.4,right:.4,top:.5,bottom:.5,header:.2,footer:.2}},
    headerFooter:{oddFooter:internal?"&LINTERNAL — cost and margin&RPage &P of &N":"&RPage &P of &N"},
  });
  ws.columns=L.cols.map(([,w])=>({width:w}));
  const M=L.main,lastCol=L.last;
  const span=r=>`A${r}:${lastCol}${r}`;
  // Style every column of a table row (eachCell skips cells never written).
  const eachCol=(row,fn)=>{for(let i=1;i<=L.cols.length;i++) fn(row.getCell(i),i);};
  let r=1;

  // ── Header ────────────────────────────────────────────────────────────────
  ws.getCell(`A${r}`).value="GMD Productions Inc.";ws.getCell(`A${r}`).font={bold:true,size:16,color:{argb:DARK}};
  ws.getCell(`${M}${r}`).value=internal?"INTERNAL BOQ":"QUOTATION";ws.getCell(`${M}${r}`).font={bold:true,size:14,color:{argb:DARK}};ws.getCell(`${M}${r}`).alignment={horizontal:"right"};
  r++;
  ws.getCell(`A${r}`).value="Fabrication & Project Management";ws.getCell(`A${r}`).font={size:9,color:{argb:MUTED}};
  ws.getCell(`${M}${r}`).value="Bill of Quantities";ws.getCell(`${M}${r}`).font={size:9,color:{argb:MUTED}};ws.getCell(`${M}${r}`).alignment={horizontal:"right"};
  r++;
  if(internal){
    ws.mergeCells(span(r));
    const c=ws.getCell(`A${r}`);
    c.value="INTERNAL — shows direct cost and margin. Do not send this file to the client.";
    c.font={bold:true,color:{argb:"FFB91C1C"}};c.fill=fill("FFFDECEC");
    r++;
    // 76 of 178 saved BOQs (Oct 2026) carry no markup at all: their "direct
    // cost" is really the selling price, so a margin read off them is false.
    if(items.length&&items.every(it=>!(Number(it.markup)>0))){
      ws.mergeCells(span(r));
      const w=ws.getCell(`A${r}`);
      w.value="No markup is recorded on any line: the cost column is the selling price, so the margin below is NOT real.";
      w.font={bold:true,color:{argb:"FF92400E"}};w.fill=fill("FFFFF4E0");
      r++;
    }
  }
  r++;
  const metaRows=[
    ["Project",meta.projectName,"Date",meta.dateStr],
    ["Location",meta.locationName,"Quotation No.",meta.quotationNo],
    ["Client",meta.client,"CE No.",meta.ceNo],
    ["Contractor","GMD Productions Inc.","VAT",vatEnabled===true?"VAT 12%":vatEnabled===false?"VAT-exempt (VATEX)":"Not set"],
  ];
  if(internal) metaRows.push(["Status",meta.status,"Exported",meta.exportedBy?`${meta.exportedBy} · ${meta.exportedAt||""}`:meta.exportedAt]);
  metaRows.forEach(([l1,v1,l2,v2])=>{
    const vl=internal?"G":"E",vv=internal?"H":"F";
    ws.getCell(`A${r}`).value=l1;ws.getCell(`A${r}`).font={size:9,color:{argb:MUTED}};
    ws.getCell(`B${r}`).value=v1||"—";ws.getCell(`B${r}`).font={bold:true};
    ws.getCell(`${vl}${r}`).value=l2;ws.getCell(`${vl}${r}`).font={size:9,color:{argb:MUTED}};
    ws.getCell(`${vv}${r}`).value=v2||"—";ws.getCell(`${vv}${r}`).font={bold:true};
    r++;
  });
  // Internal summary block — filled with formulas once the totals rows exist.
  const summaryAt=internal?r+1:0;
  if(internal) r+=7;
  r++;

  // ── Table ─────────────────────────────────────────────────────────────────
  const headRow=r;
  L.cols.forEach(([label],i)=>{
    const c=ws.getRow(r).getCell(i+1);
    c.value=label;c.font={bold:true,color:{argb:WHITE},size:10};c.fill=fill(DARK);c.border=xlBorder;
    c.alignment={vertical:"middle",horizontal:i>=2&&i<L.cols.length-1?"right":"left",wrapText:true};
  });
  ws.getRow(r).height=30;
  ws.views=[{state:"frozen",ySplit:headRow}];
  r++;

  // Every formula also carries its computed result, so phone previews, Gmail and
  // Drive viewers (which show stored values, not recalculated ones) aren't blank.
  // Sub-totals use plain SUM and + over explicit cells, never SUBTOTAL: only
  // some apps (Excel, Google Sheets) skip nested SUBTOTALs, others double-count.
  // parts = {ranges:[[fromRow,toRow]…], cells:[row…]}.
  const val={};
  const partsFormula=(col,{ranges=[],cells=[]})=>[...ranges.map(([a,b])=>a===b?`${col}${a}`:`SUM(${col}${a}:${col}${b})`),...cells.map(x=>`${col}${x}`)].join("+")||"0";
  const partsValue=(col,{ranges=[],cells=[]})=>{let t=0;ranges.forEach(([a,b])=>{for(let x=a;x<=b;x++)t+=val[col+x]||0;});cells.forEach(x=>{t+=val[col+x]||0;});return r2(t);};
  const pct=(n,d)=>d?n/d:"";
  const writeItem=(it,num,clr)=>{
    const row=ws.getRow(r);
    // Direct cost keeps full precision (shown to 2 decimals): FabHub's own
    // direct total multiplies the unrounded cost, and so must Excel.
    const qty=Number(it.qty)||0,price=r2(it.unitCost),base=Number(it.baseCost!=null?it.baseCost:it.unitCost)||0;
    row.getCell(1).value=num;
    row.getCell(2).value=it.description||"";
    row.getCell(3).value=qty;
    row.getCell(4).value=it.unit||"";
    if(internal){
      row.getCell(5).value=base;
      row.getCell(6).value={formula:`ROUND(C${r}*E${r},2)`,result:r2(qty*base)};
      row.getCell(7).value=price;
      row.getCell(8).value={formula:`ROUND(C${r}*G${r},2)`,result:r2(qty*price)};
      row.getCell(9).value={formula:`IF(E${r}=0,"",G${r}/E${r}-1)`,result:base?price/base-1:""};
      row.getCell(10).value={formula:`H${r}-F${r}`,result:r2(qty*price)-r2(qty*base)};
      row.getCell(11).value={formula:`IF(H${r}=0,"",J${r}/H${r})`,result:qty*price?(r2(qty*price)-r2(qty*base))/r2(qty*price):""};
      row.getCell(12).value=it.remarks||"";
      val["F"+r]=r2(qty*base);val["H"+r]=r2(qty*price);val["J"+r]=r2(qty*price)-r2(qty*base);
      [5,6,7,8,10].forEach(i=>{row.getCell(i).numFmt=PESO;});[9,11].forEach(i=>{row.getCell(i).numFmt=PCT;});
    }else{
      row.getCell(5).value=price;
      row.getCell(6).value={formula:`ROUND(C${r}*E${r},2)`,result:r2(qty*price)};
      row.getCell(7).value=it.remarks||"";
      val["F"+r]=r2(qty*price);
      [5,6].forEach(i=>{row.getCell(i).numFmt=PESO;});
    }
    eachCol(row,(c,i)=>{c.border=xlBorder;c.alignment={vertical:"top",wrapText:i===2||i===L.cols.length,horizontal:i>=3&&i<L.cols.length&&i!==4?"right":"left"};});
    row.getCell(1).border={...xlBorder,left:{style:"thick",color:{argb:argb(clr)}}};
    r++;
  };
  const writeSubtotal=(label,parts,bg,bold)=>{
    const row=ws.getRow(r);
    row.getCell(2).value=label;row.getCell(2).alignment={horizontal:"right"};
    L.sum.forEach(col=>{
      const c=ws.getCell(`${col}${r}`);
      const v=partsValue(col,parts);
      c.value={formula:partsFormula(col,parts),result:v};c.numFmt=PESO;
      val[col+r]=v;
    });
    if(internal){
      const f=val["F"+r],h=val["H"+r],j=val["J"+r];
      ws.getCell(`I${r}`).value={formula:`IF(F${r}=0,"",H${r}/F${r}-1)`,result:f?h/f-1:""};ws.getCell(`I${r}`).numFmt=PCT;
      ws.getCell(`K${r}`).value={formula:`IF(H${r}=0,"",J${r}/H${r})`,result:pct(j,h)};ws.getCell(`K${r}`).numFmt=PCT;
    }
    eachCol(row,(c,i)=>{c.fill=fill(bg);c.font={bold:true,italic:!bold,size:bold?11:10};c.border=xlBorder;});
    return r++;
  };

  const sectionTotals=[];
  sections.forEach(sec=>{
    const si=items.filter(it=>it.section===sec.id);
    if(!si.length) return;
    const clr=sec.color||"#64748b";
    const hdr=ws.getRow(r);
    hdr.getCell(1).value=String(sec.id);
    hdr.getCell(2).value=sec.label||"";
    eachCol(hdr,(c,i)=>{c.fill=fill(argb(clr));c.font={bold:true,color:{argb:WHITE}};c.border=xlBorder;});
    r++;
    const secParts={ranges:[],cells:[]};
    const {ungrouped,subs}=groupSection(si);
    if(ungrouped.length) secParts.ranges.push([r,r+ungrouped.length-1]);
    ungrouped.forEach((it,idx)=>writeItem(it,`${sec.id}.${idx+1}`,clr));
    subs.forEach(sub=>{
      const sh=ws.getRow(r);
      sh.getCell(1).value=`${sec.id}.${sub.num}`;
      sh.getCell(2).value=sub.label;
      eachCol(sh,(c,i)=>{c.fill=fill(tint(clr,.85));c.font={bold:true,color:{argb:argb(clr)}};c.border=xlBorder;});
      r++;
      const from=r;
      sub.items.forEach((it,mi)=>writeItem(it,`${sec.id}.${sub.num}.${mi+1}`,clr));
      secParts.cells.push(writeSubtotal(`Sub-total ${sub.label}`,{ranges:[[from,r-1]]},tint(clr,.92),false));
    });
    sectionTotals.push(writeSubtotal(`Sub-total ${sec.label}`,secParts,tint(clr,.8),true));
  });

  // ── Totals ────────────────────────────────────────────────────────────────
  const totalRow=(label,cells,style)=>{
    const row=ws.getRow(r);
    row.getCell(2).value=label;row.getCell(2).alignment={horizontal:"right"};
    Object.entries(cells).forEach(([col,v])=>{const c=ws.getCell(`${col}${r}`);c.value=v.f?{formula:v.f,result:v.res}:v.v;c.numFmt=v.fmt||PESO;});
    eachCol(row,(c,i)=>{c.border=xlBorder;
      if(style==="dark"){c.fill=fill(DARK);c.font={bold:true,color:{argb:WHITE},size:11};}
      else if(style==="disc"){c.fill=fill("FFFFFBEB");c.font={color:{argb:"FF92400E"}};}
      else{c.fill=fill("FFF8FAFC");c.font={color:{argb:"FF475569"}};}});
    return r++;
  };
  const gParts={cells:sectionTotals};
  const tot={F:partsValue("F",gParts),H:partsValue("H",gParts),J:partsValue("J",gParts)};
  const sumF=col=>({f:partsFormula(col,gParts),res:tot[col]});
  const g=totalRow("GRAND TOTAL",internal?{F:sumF("F"),H:sumF("H"),J:sumF("J"),I:{f:`IF(F${r}=0,"",H${r}/F${r}-1)`,res:tot.F?tot.H/tot.F-1:"",fmt:PCT},K:{f:`IF(H${r}=0,"",J${r}/H${r})`,res:pct(tot.J,tot.H),fmt:PCT}}:{F:sumF("F")},"dark");
  const gross=tot[M];
  const disc=Math.min(r2(discount),gross);
  const netVal=r2(gross-disc);
  let net=g,discRow=null;
  if(disc>0){
    const d=discRow=totalRow("Discount",{[M]:{v:disc,fmt:PESO_PAREN}},"disc");
    net=totalRow("Net Total",{[M]:{f:`${M}${g}-${M}${d}`,res:netVal}},"dark");
  }
  // Without a discount the GRAND TOTAL row already carries the margin.
  let marginRow=g;
  if(internal&&disc>0){
    const mv=r2(netVal-tot.F);
    marginRow=totalRow("Margin after discount",{J:{f:`H${net}-F${g}`,res:mv},K:{f:`IF(H${net}=0,"",J${r}/H${net})`,res:pct(mv,netVal),fmt:PCT}},"");
  }
  if(vatEnabled===true){
    const vv=netVal*0.12;
    const v=totalRow("VAT 12%",{[M]:{f:`${M}${net}*0.12`,res:vv}},"");
    totalRow("GRAND TOTAL w/ VAT",{[M]:{f:`${M}${net}+${M}${v}`,res:netVal+vv}},"dark");
  }

  if(internal){
    const s=summaryAt;
    const put=(row,label,f,res,fmt)=>{ws.getCell(`A${row}`).value=label;ws.getCell(`A${row}`).font={size:9,color:{argb:MUTED}};
      // Column C alone is too narrow for ₱ amounts (Excel would show #####).
      ws.mergeCells(`C${row}:E${row}`);
      const c=ws.getCell(`C${row}`);c.value={formula:f,result:res};c.numFmt=fmt||PESO;c.font={bold:true};c.alignment={horizontal:"right"};};
    const mv=r2(netVal-tot.F);
    ws.getCell(`A${s}`).value="Summary";ws.getCell(`A${s}`).font={bold:true};
    put(s+1,"Direct cost",`F${g}`,tot.F);
    put(s+2,"Selling price (before discount)",`H${g}`,tot.H);
    put(s+3,"Discount",discRow?`${M}${discRow}`:"0",disc,PESO_PAREN);
    put(s+4,"Selling price (net)",`H${net}`,netVal);
    put(s+5,"Margin",`J${marginRow}`,mv);
    put(s+6,"Margin %",`K${marginRow}`,pct(mv,netVal),PCT);
    for(let i=s+1;i<=s+6;i++) ws.mergeCells(`A${i}:B${i}`);
  }

  // ── Notes, terms and signatories — as on the printed quotation ───────────
  if(!internal){
    r++;
    const head=t=>{ws.getCell(`A${r}`).value=t;ws.getCell(`A${r}`).font={bold:true};r++;};
    const line=t=>{ws.mergeCells(`A${r}:${lastCol}${r}`);const c=ws.getCell(`A${r}`);c.value=t;c.font={size:9,color:{argb:"FF475569"}};c.alignment={wrapText:true,vertical:"top"};r++;};
    head("General Notes");
    notes.forEach(n=>line("• "+n));
    r++;
    head("Bank Details");
    ["Account Name: GMD PRODUCTIONS INC","BDO CHECKING — 012758000370","BPI CHECKING — 6011 04 82 03","METROBANK — 382-7-38202059-2"].forEach(line);
    r++;
    head("Payment Terms");
    ["50% Down Payment to start project","Billing of 40% up until installation","Retention of 10% upon certificate of completion"].forEach(line);
    r+=2;
    const sig=[["Prepared by","Rodney Erpe","Quantity Surveyor","A"],["Approved & Submitted by","Paulo Miguel Garcia","President","C"],["Accepted by",meta.client||"Client Name / Representative","Signature over Printed Name","F"]];
    sig.forEach(([l,,,col])=>{ws.getCell(`${col}${r}`).value=l;ws.getCell(`${col}${r}`).font={size:9,color:{argb:MUTED}};});
    r+=3;
    sig.forEach(([,n,,col])=>{const c=ws.getCell(`${col}${r}`);c.value=n;c.font={bold:true};c.border={top:{style:"thin",color:{argb:DARK}}};});
    r++;
    sig.forEach(([,,role,col])=>{ws.getCell(`${col}${r}`).value=role;ws.getCell(`${col}${r}`).font={size:9,color:{argb:MUTED}};});
  }
  ws.pageSetup.printArea=`A1:${lastCol}${r}`;
  ws.pageSetup.printTitlesRow=`${headRow}:${headRow}`;
  return wb;
}

export const boqXlsxFileName=(mode,title,date)=>
  `BOQ${mode==="internal"?"_INTERNAL":""}_${(String(title||"").trim()||"draft").replace(/[^\p{L}\p{N}-]+/gu,"_").replace(/^_+|_+$/g,"")}_${date}.xlsx`;

export async function downloadBoqXlsx(opts,fileName){
  const mod=await import(/* webpackChunkName: "exceljs" */ "exceljs");
  const ExcelJS=mod.default||mod;
  const wb=buildBoqWorkbook(ExcelJS,opts);
  const buf=await wb.xlsx.writeBuffer();
  const blob=new Blob([buf],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;a.download=fileName;
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),10000);
}
