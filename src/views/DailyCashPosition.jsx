import React,{useState,useMemo,useEffect,useRef} from "react";
import {today,uid,BANKS,emptyBankRow,emptyDayPosition} from "../shared";

// ── Currency input: shows grouped digits, edits raw ────────────────────────────
const CurrInp=({value,onChange,placeholder="—",style:sx={}})=>{
  const fmt=v=>{
    const n=Number(String(v).replace(/,/g,""));
    if(!v&&v!==0) return "";
    if(!n&&n!==0) return "";
    return n.toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2});
  };
  const strip=v=>String(v).replace(/,/g,"");
  const[display,setDisplay]=useState(value?fmt(value):"");
  const prev=useRef(value);
  useEffect(()=>{
    if(prev.current!==value){setDisplay(value?fmt(value):"");prev.current=value;}
  },[value]);
  const base={textAlign:"right",border:"1px solid transparent",borderRadius:4,padding:"4px 6px",fontFamily:"inherit",fontSize:".8rem",color:"#0f172a",background:"transparent",width:"100%",boxSizing:"border-box",outline:"none",...(sx||{})};
  return(
    <input type="text" className="dcp-inp" value={display}
      onChange={e=>setDisplay(e.target.value)}
      onFocus={e=>{const raw=strip(e.target.value);setDisplay(raw);e.target.select();}}
      onBlur={e=>{
        const raw=strip(e.target.value);
        setDisplay(raw?fmt(raw):"");
        onChange&&onChange({target:{value:raw}});
      }}
      placeholder={placeholder} style={base}/>
  );
};

// ─── DAILY CASH POSITION SUMMARY — Owners' Review report (Aerwin format) ───────
function DailyCashPosition({cashPositions={},saveDayPos=()=>{},loans=[]}){
  const[selDate,setSelDate]=useState(today);
  const[saved,setSaved]    =useState(false);
  const[histOpen,setHistOpen]=useState(false);

  const normPos=(p,date)=>p?.banks?p:{...emptyDayPosition(date||today),...(p||{})};
  const[pos,setPos]=useState(()=>normPos(cashPositions[today],today));

  const mob=typeof window!=="undefined"&&window.innerWidth<820;

  // Load selected day, or carry Beginning forward from the most recent prior day's Ending
  const carryFrom=(date)=>{
    const prevDay=Object.keys(cashPositions).filter(k=>k<date).sort().reverse()[0];
    const base=emptyDayPosition(date);
    if(!prevDay) return base;
    const prev=cashPositions[prevDay];
    const newBanks={};
    BANKS.forEach(b=>{
      const r=prev.banks?.[b.id]||{};
      const endN=Number(r.end)||Number(r.book)||Number(r.beg)||0;
      newBanks[b.id]={...emptyBankRow(),beg:endN?String(endN):""};
    });
    return {...base,banks:newBanks};
  };

  // Re-sync when Supabase data arrives (initial state runs before load)
  useEffect(()=>{
    if(cashPositions[selDate]){setPos(normPos(cashPositions[selDate],selDate));setSaved(true);}
    else{setPos(carryFrom(selDate));setSaved(false);}
  },[cashPositions]);

  const switchDate=(d)=>{
    setSelDate(d);
    if(cashPositions[d]){setPos(normPos(cashPositions[d],d));setSaved(true);}
    else{setPos(carryFrom(d));setSaved(false);}
  };

  const f=(path,val)=>{
    setSaved(false);
    setPos(p=>{
      const parts=path.split(".");
      if(parts.length===1) return {...p,[path]:val};
      if(parts.length===2) return {...p,[parts[0]]:{...p[parts[0]],[parts[1]]:val}};
      if(parts.length===3) return {...p,[parts[0]]:{...p[parts[0]],[parts[1]]:{...p[parts[0]][parts[1]],[parts[2]]:val}}};
      return p;
    });
  };

  const n=(v)=>Number(String(v).replace(/,/g,""))||0;
  const fmt2=(v)=>n(v).toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2});
  const fmtDate=(iso)=>{const[y,m,d]=String(iso).split("-");return m&&d?`${m}/${d}/${y}`:iso;};

  const opBanks =BANKS.filter(b=>b.type==="Operating");
  const resBanks=BANKS.filter(b=>b.type==="Reserve");

  // ── Collections Detail (manual, matches Aerwin's per-day collection list) ──
  const collRows=pos.collections?.manualCollections||[];
  const collByBank=useMemo(()=>{
    const out={};BANKS.forEach(b=>out[b.id]=0);
    collRows.forEach(r=>{if(r.bank&&out[r.bank]!=null) out[r.bank]+=n(r.amount);});
    return out;
  },[collRows]);
  const collTotal=useMemo(()=>collRows.reduce((s,r)=>s+n(r.amount),0),[collRows]);

  const bankRow=(id)=>pos.banks?.[id]||emptyBankRow();
  const sum=(banks,fn)=>banks.reduce((s,b)=>s+fn(b),0);

  // ── Executive Summary (all computed from Bank Account Detail) ──
  const opBeg  =sum(opBanks, b=>n(bankRow(b.id).beg));
  const opEnd  =sum(opBanks, b=>n(bankRow(b.id).end));
  const opBook =sum(opBanks, b=>n(bankRow(b.id).book));
  const netChange=opEnd-opBeg;
  const reserveBal=sum(resBanks, b=>n(bankRow(b.id).end));           // Chinabank + Security + Unionbank ending
  const totalCashAll=opEnd+reserveBal;                               // = ending balance, all accounts

  // Outstanding loan balance — memo only, excluded from cash total
  const outstandingLoan=useMemo(()=>{
    const monthlyRate=l=>Number(l.interestRate||0)/100/12;
    return (loans||[]).filter(l=>l.status!=="Paid Off"&&l.status!=="Cancelled").reduce((tot,l)=>{
      let balance=Number(l.principal||0);
      const mr=monthlyRate(l);
      (l.payments||[]).slice().sort((a,b)=>a.date>b.date?1:-1).forEach(p=>{
        const interest=balance*mr;
        balance=Math.max(0,balance-Math.max(0,Number(p.amount||0)-interest));
      });
      return tot+balance;
    },0);
  },[loans]);

  // ── Bank Account Detail column totals ──
  const tot={
    beg:    sum(BANKS,b=>n(bankRow(b.id).beg)),
    coll:   collTotal,
    end:    sum(BANKS,b=>n(bankRow(b.id).end)),
    book:   sum(BANKS,b=>n(bankRow(b.id).book)),
    bizlink:sum(BANKS,b=>n(bankRow(b.id).bizlink)),
    float:  sum(BANKS,b=>n(bankRow(b.id).float)),
  };

  const handleSave=()=>{
    saveDayPos(selDate,{...pos,collections:{...pos.collections,total:collTotal},savedAt:new Date().toISOString()});
    setSaved(true);
  };

  const histDates=Object.keys(cashPositions).sort().reverse().slice(0,30);

  const exportCSV=()=>{
    const rows=[
      ["DAILY CASH POSITION SUMMARY"],["As of",fmtDate(selDate)],[],
      ["EXECUTIVE SUMMARY","Amount (PHP)"],
      ["Total Operating Bank Balance – Beginning of Day",opBeg.toFixed(2)],
      ["Total Operating Bank Balance – End of Day",opEnd.toFixed(2)],
      ["Net Change for the Day (Operating)",netChange.toFixed(2)],
      ["Total Operating Book Balance",opBook.toFixed(2)],
      ["Reserve / Savings Balance",reserveBal.toFixed(2)],
      ["Total Cash – All Accounts (End of Day)",totalCashAll.toFixed(2)],
      ["Outstanding Loan Balance (memo only)",outstandingLoan.toFixed(2)],
      [],
      ["BANK ACCOUNT DETAIL"],
      ["Bank","Account No.","Branch","Type","Beginning Balance","Collections","Ending Bank Balance","Book Balance","Bizlink Transaction","Float Check"],
    ];
    BANKS.forEach(b=>{const r=bankRow(b.id);rows.push([b.name,b.acctNo,b.branch,b.type,n(r.beg).toFixed(2),(collByBank[b.id]||0).toFixed(2),n(r.end).toFixed(2),n(r.book).toFixed(2),n(r.bizlink).toFixed(2),n(r.float).toFixed(2)]);});
    rows.push(["TOTAL","","","",tot.beg.toFixed(2),tot.coll.toFixed(2),tot.end.toFixed(2),tot.book.toFixed(2),tot.bizlink.toFixed(2),tot.float.toFixed(2)]);
    rows.push([],["COLLECTIONS DETAIL (FOR THE DAY)"],["Bank","Particulars","Amount"]);
    collRows.forEach(r=>{const bk=BANKS.find(x=>x.id===r.bank);rows.push([bk?bk.name:"",r.particulars??r.note??"",n(r.amount).toFixed(2)]);});
    rows.push(["TOTAL","",collTotal.toFixed(2)]);
    const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
    const a=document.createElement("a");
    a.href="data:text/csv;charset=utf-8,"+encodeURIComponent("﻿"+csv);
    a.download=`GMD_CashPosition_${selDate}.csv`;a.click();
  };

  // ── style tokens (emulating the Excel look) ──
  const C={navy:"#1f3864",gold:"#ffd966",green:"#c6e0b4",blue:"#0070c0",grid:"#d0d7e2",zebra:"#f4f6fb"};
  const sectionHdr=(label,accent=C.navy)=>(
    <div style={{background:accent,color:"#fff",fontWeight:800,fontSize:".72rem",letterSpacing:".6px",padding:"6px 12px",textTransform:"uppercase"}}>{label}</div>
  );
  const numCell={textAlign:"right",padding:"6px 12px",fontSize:".82rem",fontVariantNumeric:"tabular-nums"};
  const th={background:C.gold,color:C.navy,fontWeight:800,fontSize:".72rem",padding:"8px 10px",border:`1px solid ${C.grid}`,textAlign:"center",whiteSpace:"nowrap"};
  const td={padding:"6px 10px",fontSize:".8rem",border:`1px solid ${C.grid}`,fontVariantNumeric:"tabular-nums"};

  // Editable numeric cell inside the detail table
  const editCell=(id,key)=>(
    <td style={{...td,padding:2,background:"#fff"}}>
      <CurrInp value={bankRow(id)[key]||""} onChange={e=>f(`banks.${id}.${key}`,e.target.value)}
        style={{textAlign:"right",fontSize:".8rem",padding:"5px 8px"}}/>
    </td>
  );

  const summaryRows=[
    ["Total Operating Bank Balance – Beginning of Day",opBeg,false,"#0f172a"],
    ["Total Operating Bank Balance – End of Day",opEnd,false,"#0f172a"],
    ["Net Change for the Day (Operating)",netChange,false,netChange>=0?"#047857":"#dc2626"],
    ["Total Operating Book Balance",opBook,false,"#0f172a"],
    ["Reserve / Savings Balance (Security Bank + UnionBank)",reserveBal,false,"#0f172a"],
    ["Total Cash – All Accounts (End of Day)",totalCashAll,true,"#0f172a"],       // highlighted
    ["Outstanding Loan Balance (memo only – excluded from cash total)",outstandingLoan,false,C.blue],
  ];

  return(
    <div>
      <style>{`
        .dcp-inp:focus{border:1px solid ${C.blue}!important;background:#eff6ff!important;box-shadow:0 0 0 2px rgba(0,112,192,.12);border-radius:4px;}
        .dcp-inp:hover{background:#f1f5f9;border-radius:4px;}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
      `}</style>

      {/* ── Toolbar ── */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:10}}>
        <div style={{fontSize:".78rem",color:"#64748b"}}>Daily Cash Position — Owners' Review report</div>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <button onClick={exportCSV} style={{background:"#eff6ff",border:"1.5px solid #bfdbfe",borderRadius:8,padding:"7px 14px",fontFamily:"inherit",fontSize:".78rem",fontWeight:700,color:"#1d4ed8",cursor:"pointer"}}>⬇ Export CSV</button>
          <input type="date" value={selDate} onChange={e=>switchDate(e.target.value)}
            style={{border:"1.5px solid #e2e8f0",borderRadius:8,padding:"8px 12px",fontFamily:"inherit",fontSize:".84rem",color:"#0f172a",cursor:"pointer"}}/>
          <button onClick={()=>setHistOpen(h=>!h)} style={{background:"#f8fafc",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"8px 12px",fontFamily:"inherit",fontSize:".78rem",color:"#64748b",cursor:"pointer",fontWeight:600}}>📅 History ({histDates.length})</button>
          <button onClick={handleSave} style={{background:saved?"#f0fdf4":C.navy,border:`1.5px solid ${saved?"#6ee7b7":C.navy}`,borderRadius:8,padding:"8px 18px",fontFamily:"inherit",fontSize:".82rem",color:saved?"#059669":"#fff",cursor:"pointer",fontWeight:700}}>{saved?"✓ Saved":"Save Position"}</button>
        </div>
      </div>

      {histOpen&&histDates.length>0&&(
        <div style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:12,padding:14,marginBottom:14,animation:"fadeIn .2s"}}>
          <div style={{fontWeight:700,color:"#0f172a",marginBottom:8,fontSize:".82rem"}}>Saved Positions</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {histDates.map(d=>(
              <button key={d} onClick={()=>{switchDate(d);setHistOpen(false);}}
                style={{padding:"5px 12px",borderRadius:20,border:`1.5px solid ${d===selDate?C.navy:"#e2e8f0"}`,background:d===selDate?C.navy:"#fff",color:d===selDate?"#fff":"#64748b",fontFamily:"inherit",fontSize:".76rem",cursor:"pointer",fontWeight:d===selDate?700:400}}>{fmtDate(d)}</button>
            ))}
          </div>
        </div>
      )}

      {/* ── Report sheet ── */}
      <div style={{background:"#fff",border:`1px solid ${C.grid}`,borderRadius:10,overflow:"hidden",boxShadow:"0 1px 6px rgba(0,0,0,.05)"}}>

        {/* Title band */}
        <div style={{textAlign:"center",padding:"14px 16px 10px",borderBottom:`1px solid ${C.grid}`}}>
          <div style={{fontWeight:900,fontSize:"1.15rem",color:C.navy,letterSpacing:".5px"}}>DAILY CASH POSITION SUMMARY</div>
          <div style={{fontSize:".72rem",color:"#64748b",fontStyle:"italic",marginTop:3}}>Prepared for Owners' Review&nbsp;&nbsp;|&nbsp;&nbsp;All amounts in Philippine Peso (PHP)</div>
          <div style={{marginTop:8,fontSize:".82rem",color:"#0f172a"}}>
            <span style={{fontWeight:700,color:"#475569"}}>As of Date: </span>
            <span style={{color:C.blue,fontWeight:800}}>{fmtDate(selDate)}</span>
            <span style={{color:"#94a3b8"}}> &nbsp;—&nbsp; ENDING BALANCE</span>
          </div>
        </div>

        {/* ── EXECUTIVE SUMMARY ── */}
        {sectionHdr("Executive Summary")}
        <div style={{padding:"0 12px 12px"}}>
          <table style={{width:"100%",borderCollapse:"collapse",marginTop:10}}>
            <thead>
              <tr><th style={{...th,textAlign:"left"}}>Metric</th><th style={{...th,width:mob?140:260}}>Amount (PHP)</th></tr>
            </thead>
            <tbody>
              {summaryRows.map(([label,val,hi,clr])=>(
                <tr key={label} style={{background:hi?C.green:"#fff"}}>
                  <td style={{...td,fontWeight:hi?800:600,color:"#0f172a"}}>{label}</td>
                  <td style={{...td,...numCell,fontWeight:hi?900:700,color:clr}}>{fmt2(val)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── BANK ACCOUNT DETAIL ── */}
        {sectionHdr("Bank Account Detail")}
        <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch",padding:"10px 12px 4px"}}>
          <table style={{borderCollapse:"collapse",minWidth:mob?860:"100%",width:"100%"}}>
            <thead>
              <tr>
                {["Bank","Account No.","Branch","Type","Beginning Balance","Collections","Ending Bank Balance","Book Balance","Bizlink Transaction","Float Check"].map((h,i)=>(
                  <th key={h} style={{...th,textAlign:i<4?"left":"center"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {BANKS.map((b,ri)=>{
                const r=bankRow(b.id);const coll=collByBank[b.id]||0;
                return(
                  <tr key={b.id} style={{background:ri%2?C.zebra:"#fff"}}>
                    <td style={{...td,fontWeight:700,color:"#0f172a",whiteSpace:"nowrap"}}>{b.name.toUpperCase()}</td>
                    <td style={{...td,color:"#475569"}}>{b.acctNo}</td>
                    <td style={{...td,color:"#475569",whiteSpace:"nowrap"}}>{b.branch}</td>
                    <td style={{...td}}>
                      <span style={{fontSize:".68rem",fontWeight:700,padding:"1px 7px",borderRadius:20,color:b.type==="Operating"?"#1d4ed8":"#7c3aed",background:b.type==="Operating"?"#eff6ff":"#f5f3ff",border:`1px solid ${b.type==="Operating"?"#bfdbfe":"#e9d5ff"}`}}>{b.type}</span>
                    </td>
                    {editCell(b.id,"beg")}
                    <td style={{...td,...numCell,color:coll>0?C.blue:"#cbd5e1",fontWeight:coll>0?700:400}}>{coll>0?fmt2(coll):"—"}</td>
                    {editCell(b.id,"end")}
                    {editCell(b.id,"book")}
                    {editCell(b.id,"bizlink")}
                    {editCell(b.id,"float")}
                  </tr>
                );
              })}
              {/* TOTAL row */}
              <tr style={{background:"#e8edf5",fontWeight:800}}>
                <td style={{...td,fontWeight:900,color:C.navy}} colSpan={4}>TOTAL</td>
                <td style={{...td,...numCell,fontWeight:900,color:"#0f172a"}}>{fmt2(tot.beg)}</td>
                <td style={{...td,...numCell,fontWeight:900,color:C.blue}}>{fmt2(tot.coll)}</td>
                <td style={{...td,...numCell,fontWeight:900,color:"#047857"}}>{fmt2(tot.end)}</td>
                <td style={{...td,...numCell,fontWeight:900,color:"#0f172a"}}>{fmt2(tot.book)}</td>
                <td style={{...td,...numCell,fontWeight:900,color:"#0f172a"}}>{tot.bizlink>0?fmt2(tot.bizlink):"—"}</td>
                <td style={{...td,...numCell,fontWeight:900,color:"#0f172a"}}>{tot.float>0?fmt2(tot.float):"—"}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{padding:"6px 14px 12px",fontSize:".68rem",color:"#94a3b8",fontStyle:"italic",lineHeight:1.5}}>
          <span style={{color:C.blue}}>Blue text</span> = collection figures for the day. <b>Operating</b> = working accounts included in the Executive Summary totals; <b>Reserve</b> = Chinabank, Security Bank &amp; UnionBank savings, tracked separately from operating cash. Ending, Book, Bizlink &amp; Float cells are editable.
        </div>

        {/* ── COLLECTIONS DETAIL ── */}
        {sectionHdr("Collections Detail (for the day)","#c00000")}
        <div style={{padding:"10px 12px 14px"}}>
          <table style={{borderCollapse:"collapse",width:"100%",maxWidth:640}}>
            <thead>
              <tr>
                <th style={{...th,textAlign:"left",width:mob?120:200}}>Bank</th>
                <th style={{...th,textAlign:"left"}}>Particulars</th>
                <th style={{...th,width:mob?120:180}}>Amount</th>
                <th style={{...th,width:36,background:"#fff",border:"none"}}></th>
              </tr>
            </thead>
            <tbody>
              {collRows.length===0&&(
                <tr><td colSpan={4} style={{...td,color:"#94a3b8",fontStyle:"italic",padding:"10px"}}>No collections recorded for {fmtDate(selDate)}.</td></tr>
              )}
              {collRows.map((row,ri)=>(
                <tr key={row.id||ri} style={{background:ri%2?C.zebra:"#fff"}}>
                  <td style={{...td,padding:2}}>
                    <select value={row.bank||""} onChange={e=>{const mc=[...collRows];mc[ri]={...mc[ri],bank:e.target.value};f("collections.manualCollections",mc);}}
                      style={{width:"100%",border:"1px solid transparent",borderRadius:4,padding:"5px 6px",fontFamily:"inherit",fontSize:".8rem",background:"transparent",color:"#0f172a",outline:"none"}}>
                      <option value="">Select bank…</option>
                      {BANKS.map(b=><option key={b.id} value={b.id}>{b.name.toUpperCase()}</option>)}
                    </select>
                  </td>
                  <td style={{...td,padding:2}}>
                    <input type="text" value={row.particulars??row.note??""} onChange={e=>{const mc=[...collRows];mc[ri]={...mc[ri],particulars:e.target.value};f("collections.manualCollections",mc);}}
                      placeholder="e.g. EVER NEW 40%" style={{width:"100%",border:"1px solid transparent",borderRadius:4,padding:"5px 8px",fontFamily:"inherit",fontSize:".8rem",background:"transparent",color:"#0f172a",outline:"none"}}/>
                  </td>
                  <td style={{...td,padding:2}}>
                    <CurrInp value={row.amount||""} onChange={e=>{const mc=[...collRows];mc[ri]={...mc[ri],amount:e.target.value};f("collections.manualCollections",mc);}}
                      style={{textAlign:"right",fontSize:".8rem",padding:"5px 8px"}}/>
                  </td>
                  <td style={{...td,padding:2,textAlign:"center",border:"none"}}>
                    <button onClick={()=>f("collections.manualCollections",collRows.filter((_,j)=>j!==ri))}
                      style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:4,padding:"2px 7px",cursor:"pointer",color:"#dc2626",fontWeight:700,fontSize:".72rem",fontFamily:"inherit"}}>✕</button>
                  </td>
                </tr>
              ))}
              <tr style={{background:"#e8edf5"}}>
                <td style={{...td,fontWeight:900,color:C.navy}} colSpan={2}>TOTAL</td>
                <td style={{...td,...numCell,fontWeight:900,color:C.blue}}>{fmt2(collTotal)}</td>
                <td style={{...td,border:"none",background:"#fff"}}></td>
              </tr>
            </tbody>
          </table>
          <button onClick={()=>f("collections.manualCollections",[...collRows,{id:uid(),bank:"",particulars:"",amount:""}])}
            style={{marginTop:10,background:"#f8fafc",border:"1.5px dashed #cbd5e1",borderRadius:8,padding:"5px 14px",fontFamily:"inherit",fontSize:".76rem",fontWeight:700,color:"#475569",cursor:"pointer"}}>+ Add collection</button>
        </div>

        {/* ── NOTES ── */}
        <div style={{borderTop:`1px solid ${C.grid}`,padding:"12px 14px"}}>
          <div style={{fontWeight:700,color:"#475569",fontSize:".72rem",textTransform:"uppercase",letterSpacing:".8px",marginBottom:6}}>Notes for {fmtDate(selDate)}</div>
          <textarea value={pos.notes||""} onChange={e=>f("notes",e.target.value)}
            placeholder="e.g. Loan proceeds from Stella G. deposited to BPI; EVER NEW 40% collections; pending cheque clearances…"
            rows={2}
            style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"9px 12px",fontFamily:"inherit",fontSize:".84rem",color:"#1e293b",resize:"vertical",outline:"none",boxSizing:"border-box"}}/>
        </div>
      </div>
      {pos.savedAt&&<div style={{textAlign:"right",fontSize:".7rem",color:"#94a3b8",marginTop:6}}>Last saved: {new Date(pos.savedAt).toLocaleString("en-PH")}</div>}
    </div>
  );
}

export default DailyCashPosition;
