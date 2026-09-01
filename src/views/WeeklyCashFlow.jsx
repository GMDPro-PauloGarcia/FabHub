import React,{useState,useMemo} from "react";
import {today,BANKS} from "../shared";
import {paymentClearDate} from "../core";

// ─── WEEKLY CASH FLOW SUMMARY — Owners' Review (weekly roll-up of the daily data) ───
// Aggregates a week of collections (billing payments that clear + manual collections)
// and expenses (disbursements from the Daily Cash Position sheet) into the same summary
// Aerwin prepares by hand: Cash Flow Overview, Daily Trend, Expenses by Category, and
// two charts (daily collections-vs-expenses bars + expenses-by-category pie).
const MON=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const PIE=["#2f5aa8","#c0504d","#9bbb59","#8064a2","#4bacc6","#f79646","#5b9bd5","#d99694","#c3d69b","#b2a2c7","#92cddc","#fac08f","#c0c0c0","#8db4e2","#e6b9b8","#7f7f7f"];
const iso=(x)=>`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`;

function WeeklyCashFlow({cashPositions={},billings=[],setPage,mode="weekly"}){
  const monthly=mode==="monthly";
  const label=monthly?"Monthly":"Weekly";
  const per=monthly?"Month":"Week";       // period noun (capitalised)
  const perLc=monthly?"month":"week";      // period noun (lower-case)
  // Default range: current calendar month, or Monday..Friday of the current week
  const defaultRange=()=>{
    const d=new Date(today+"T00:00:00");
    if(monthly){
      const first=new Date(d.getFullYear(),d.getMonth(),1);
      const last=new Date(d.getFullYear(),d.getMonth()+1,0);
      return{from:iso(first),to:iso(last)};
    }
    const monday=new Date(d);monday.setDate(d.getDate()-((d.getDay()+6)%7));
    const friday=new Date(monday);friday.setDate(monday.getDate()+4);
    return{from:iso(monday),to:iso(friday)};
  };
  const[range,setRange]=useState(defaultRange);
  const{from,to}=range;
  const mob=typeof window!=="undefined"&&window.innerWidth<820;

  const n=(v)=>Number(String(v??"").replace(/,/g,""))||0;
  const peso=(v)=>"₱"+n(v).toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2});
  const pesoK=(v)=>n(v).toLocaleString("en-PH",{maximumFractionDigits:0});

  // Dates in [from, to] inclusive
  const dates=useMemo(()=>{
    const out=[];if(!from||!to||from>to)return out;
    let d=new Date(from+"T00:00:00");const end=new Date(to+"T00:00:00");
    let guard=0;
    while(d<=end&&guard<400){out.push(iso(d));d.setDate(d.getDate()+1);guard++;}
    return out;
  },[from,to]);

  // Cash expenses come from the Daily Cash Position sheet's Disbursements — the
  // same manual entries owners record each day. This mirrors how manual
  // collections feed Collections below; previously Expenses read only the
  // separate Expenses module (rows marked "Paid"), which owners don't use, so
  // the whole Expenses column showed 0 even though disbursements were recorded.
  // Each row: {bank, particulars/payee, amount}.
  const disbFor=(date)=>(cashPositions[date]?.disbursements?.manual||[]);
  const disbLabel=(r)=>{const t=String(r.particulars??r.payee??"").trim();return t||"Uncategorized";};
  const collectionsFor=(date)=>{
    let s=0;
    (billings||[]).forEach(b=>{if(b.status==="Cancelled")return;(b.payments||[]).forEach(p=>{if(!p.bounced&&paymentClearDate(p)===date)s+=Number(p.amount||0);});});
    (cashPositions[date]?.collections?.manualCollections||[]).forEach(r=>s+=n(r.amount));
    return s;
  };

  // ── Daily trend ──
  const daily=useMemo(()=>dates.map(d=>{
    const coll=collectionsFor(d);
    const exp=disbFor(d).reduce((s,r)=>s+n(r.amount),0);
    return{date:d,coll,exp,net:coll-exp};
    // eslint-disable-next-line
  }),[dates,billings,cashPositions]);
  const totColl=daily.reduce((s,r)=>s+r.coll,0);
  const totExp=daily.reduce((s,r)=>s+r.exp,0);
  const netChange=totColl-totExp;

  // ── Beginning balance (all accounts, first day) with prior-day fallback ──
  const allAcct=(date,keyPref)=>{const p=cashPositions[date];if(!p?.banks)return null;
    return BANKS.reduce((s,b)=>{const r=p.banks[b.id]||{};return s+(keyPref==="end"?(n(r.end)||n(r.book)||n(r.beg)):n(r.beg));},0);};
  const beginningBalance=useMemo(()=>{
    const b=allAcct(from,"beg");if(b!=null&&b>0)return b;
    const prior=Object.keys(cashPositions).filter(k=>k<from).sort().reverse()[0];
    return prior?(allAcct(prior,"end")||0):(b||0);
    // eslint-disable-next-line
  },[from,cashPositions]);
  const endingBalance=beginningBalance+netChange;

  // ── Loan memos ──
  const loanProceeds=useMemo(()=>{let s=0;
    dates.forEach(d=>(cashPositions[d]?.collections?.manualCollections||[]).forEach(r=>{if(/loan/i.test(r.particulars??r.note??""))s+=n(r.amount);}));
    return s;
    // eslint-disable-next-line
  },[dates,cashPositions]);
  const loanRepayment=useMemo(()=>{let s=0;
    dates.forEach(d=>disbFor(d).forEach(r=>{if(/loan|repay/i.test(disbLabel(r)))s+=n(r.amount);}));
    return s;
    // eslint-disable-next-line
  },[dates,cashPositions]);
  const netOperating=netChange-loanProceeds+loanRepayment;

  // ── Expenses by category (Chart of Account) ──
  const byCat=useMemo(()=>{
    const map={};
    dates.forEach(d=>disbFor(d).forEach(r=>{const nm=disbLabel(r);map[nm]=(map[nm]||0)+n(r.amount);}));
    const arr=Object.entries(map).map(([name,amount])=>({name,amount})).filter(r=>r.amount>0).sort((a,b)=>b.amount-a.amount);
    const total=arr.reduce((s,r)=>s+r.amount,0);
    return{arr,total};
    // eslint-disable-next-line
  },[dates,cashPositions]);

  const fmtDate=(d)=>{const[,m,dd]=d.split("-");return`${Number(m)}/${Number(dd)}`;};
  const fmtRange=()=>{const[fy,fm,fd]=from.split("-").map(Number);const[ty,tm,td]=to.split("-").map(Number);
    return`${MON[fm-1]} ${fd} – ${MON[tm-1]} ${td}, ${ty}`;};

  const shiftPeriod=(dir)=>{
    if(monthly){
      const f=new Date(from+"T00:00:00");
      const m=new Date(f.getFullYear(),f.getMonth()+dir,1);
      const last=new Date(m.getFullYear(),m.getMonth()+1,0);
      setRange({from:iso(m),to:iso(last)});
      return;
    }
    const f=new Date(from+"T00:00:00"),t=new Date(to+"T00:00:00");f.setDate(f.getDate()+7*dir);t.setDate(t.getDate()+7*dir);setRange({from:iso(f),to:iso(t)});
  };

  const exportCSV=()=>{
    const rows=[[`${label.toUpperCase()} CASH FLOW SUMMARY`],[fmtRange()],[],
      ["CASH FLOW OVERVIEW","Amount (PHP)"],
      [`Beginning Balance (Start of ${per}, All Accounts)`,beginningBalance.toFixed(2)],
      [`Total Cash Collections (for the ${perLc})`,totColl.toFixed(2)],
      [`Total Cash Expenses (for the ${perLc})`,totExp.toFixed(2)],
      [`Net Change for the ${per}`,netChange.toFixed(2)],
      [`Ending Balance (End of ${per})`,endingBalance.toFixed(2)],
      ["Memo: Loan Proceeds Included Above",loanProceeds.toFixed(2)],
      ["Memo: Loan Repayment Included Above",loanRepayment.toFixed(2)],
      ["Net Operating Cash Flow (excl. loan proceeds & repayment)",netOperating.toFixed(2)],[],
      ["DAILY CASH FLOW TREND"],["Date","Collections","Expenses","Net"]];
    daily.forEach(r=>rows.push([r.date,r.coll.toFixed(2),r.exp.toFixed(2),r.net.toFixed(2)]));
    rows.push(["TOTAL",totColl.toFixed(2),totExp.toFixed(2),netChange.toFixed(2)],[],
      ["EXPENSES BY PAYEE (FROM DAILY DISBURSEMENTS)"],["Payee / Particulars","Amount","% of Total"]);
    byCat.arr.forEach(r=>rows.push([r.name,r.amount.toFixed(2),byCat.total>0?(r.amount/byCat.total*100).toFixed(1)+"%":"0%"]));
    rows.push(["TOTAL",byCat.total.toFixed(2),"100.0%"]);
    const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
    const a=document.createElement("a");a.href="data:text/csv;charset=utf-8,"+encodeURIComponent("﻿"+csv);a.download=`GMD_${label}CashFlow_${from}_${to}.csv`;a.click();
  };

  // ── style tokens (match Daily Cash Position) ──
  const C={navy:"#1f3864",gold:"#ffd966",green:"#c6e0b4",blue:"#0070c0",grid:"#d0d7e2",zebra:"#f4f6fb"};
  const sectionHdr=(label,accent=C.navy)=>(<div style={{background:accent,color:"#fff",fontWeight:800,fontSize:".72rem",letterSpacing:".6px",padding:"6px 12px",textTransform:"uppercase"}}>{label}</div>);
  const th={background:C.gold,color:C.navy,fontWeight:800,fontSize:".72rem",padding:"8px 10px",border:`1px solid ${C.grid}`,textAlign:"center",whiteSpace:"nowrap"};
  const td={padding:"6px 10px",fontSize:".8rem",border:`1px solid ${C.grid}`,fontVariantNumeric:"tabular-nums"};
  const num={textAlign:"right",fontVariantNumeric:"tabular-nums"};

  const overviewRows=[
    [`Beginning Balance (Start of ${per}, All Accounts)`,beginningBalance,false,"#0f172a"],
    [`Total Cash Collections (for the ${perLc})`,totColl,false,"#0f172a"],
    [`Total Cash Expenses (for the ${perLc})`,totExp,false,"#0f172a"],
    [`Net Change for the ${per} (Collections − Expenses)`,netChange,true,netChange>=0?"#047857":"#dc2626"],
    [`Ending Balance (End of ${per})`,endingBalance,true,"#0f172a"],
    ["Memo: Loan Proceeds Included Above",loanProceeds,false,C.blue],
    ["Memo: Loan Repayment Included Above",loanRepayment,false,C.blue],
    ["Net Operating Cash Flow (excl. loan proceeds & repayment)",netOperating,true,netOperating>=0?"#047857":"#dc2626"],
  ];

  // ── Bar chart (daily collections vs expenses) ──
  const BarChart=()=>{
    const W=mob?320:440,H=210,padL=44,padB=34,padT=10,padR=8;
    const maxV=Math.max(1,...daily.flatMap(r=>[r.coll,r.exp]));
    const iw=W-padL-padR,ih=H-padT-padB;
    const groups=daily.length||1;
    const gw=iw/groups,bw=Math.min(18,gw/3);
    const y=(v)=>padT+ih-(v/maxV)*ih;
    const ticks=5;
    return(
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:"auto",display:"block"}}>
        {Array.from({length:ticks+1}).map((_,i)=>{const v=maxV*i/ticks,yy=y(v);
          return(<g key={i}><line x1={padL} y1={yy} x2={W-padR} y2={yy} stroke="#eef1f6"/><text x={padL-4} y={yy+3} textAnchor="end" fontSize="7" fill="#94a3b8">{pesoK(v)}</text></g>);})}
        {daily.map((r,i)=>{const gx=padL+i*gw;return(<g key={r.date}>
          <rect x={gx+gw/2-bw-1} y={y(r.coll)} width={bw} height={padT+ih-y(r.coll)} fill="#4472c4"/>
          <rect x={gx+gw/2+1} y={y(r.exp)} width={bw} height={padT+ih-y(r.exp)} fill="#c0504d"/>
          <text x={gx+gw/2} y={H-padB+12} textAnchor="middle" fontSize="7.5" fill="#475569">{fmtDate(r.date)}</text>
        </g>);})}
        <line x1={padL} y1={padT+ih} x2={W-padR} y2={padT+ih} stroke="#cbd5e1"/>
      </svg>
    );
  };

  // ── Pie chart (expenses by category) ──
  const PieChart=()=>{
    const size=mob?190:210,r=size/2-4,cx=size/2,cy=size/2;
    const total=byCat.total||1;
    let a0=-Math.PI/2;
    const slices=byCat.arr.map((s,i)=>{const frac=s.amount/total;const a1=a0+frac*2*Math.PI;
      const p=(a)=>[cx+r*Math.cos(a),cy+r*Math.sin(a)];const[x1,y1]=p(a0),[x2,y2]=p(a1);
      const large=(a1-a0)>Math.PI?1:0;const path=`M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)} Z`;
      a0=a1;return{path,color:PIE[i%PIE.length],name:s.name,amount:s.amount,pct:frac*100};});
    return(
      <div style={{display:"flex",gap:14,alignItems:"center",flexWrap:"wrap",justifyContent:"center"}}>
        <svg viewBox={`0 0 ${size} ${size}`} style={{width:size,height:size,flexShrink:0}}>
          {byCat.arr.length===0?<circle cx={cx} cy={cy} r={r} fill="#eef1f6"/>:slices.map((s,i)=><path key={i} d={s.path} fill={s.color} stroke="#fff" strokeWidth="1"/>)}
        </svg>
        <div style={{fontSize:".68rem",color:"#475569",maxWidth:200}}>
          {slices.slice(0,12).map((s,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:6,padding:"1px 0"}}>
              <span style={{width:9,height:9,borderRadius:2,background:s.color,flexShrink:0}}/>
              <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.name}</span>
              <span style={{fontWeight:700,color:"#0f172a"}}>{s.pct.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const btn={background:"#f8fafc",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"7px 11px",fontFamily:"inherit",fontSize:".8rem",color:"#475569",cursor:"pointer",fontWeight:700};

  return(
    <div>
      {/* Toolbar */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:10}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          {setPage&&<button onClick={()=>setPage("finance")} style={{...btn,fontWeight:800,color:"#facc15",background:"#0f172a",border:"none"}}>← Finance</button>}
          <span style={{fontSize:".78rem",color:"#64748b"}}>{label} Cash Flow — Owners' Review roll-up</span>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <button onClick={exportCSV} style={{...btn,color:"#1d4ed8",background:"#eff6ff",borderColor:"#bfdbfe"}}>⬇ Export CSV</button>
          <button onClick={()=>shiftPeriod(-1)} style={btn}>← Prev</button>
          <input type="date" value={from} onChange={e=>setRange(r=>({...r,from:e.target.value}))} style={{border:"1.5px solid #e2e8f0",borderRadius:8,padding:"7px 10px",fontFamily:"inherit",fontSize:".82rem",color:"#0f172a"}}/>
          <span style={{color:"#94a3b8",fontSize:".8rem"}}>→</span>
          <input type="date" value={to} onChange={e=>setRange(r=>({...r,to:e.target.value}))} style={{border:"1.5px solid #e2e8f0",borderRadius:8,padding:"7px 10px",fontFamily:"inherit",fontSize:".82rem",color:"#0f172a"}}/>
          <button onClick={()=>shiftPeriod(1)} style={btn}>Next →</button>
        </div>
      </div>

      <div style={{background:"#fff",border:`1px solid ${C.grid}`,borderRadius:10,overflow:"hidden",boxShadow:"0 1px 6px rgba(0,0,0,.05)"}}>
        {/* Title band */}
        <div style={{textAlign:"center",padding:"14px 16px 10px",borderBottom:`1px solid ${C.grid}`}}>
          <div style={{fontWeight:900,fontSize:"1.15rem",color:C.navy,letterSpacing:".5px"}}>{`${label.toUpperCase()} CASH FLOW SUMMARY`}</div>
          <div style={{fontSize:".72rem",color:"#64748b",fontStyle:"italic",marginTop:3}}>Prepared for Owners' Review&nbsp;&nbsp;|&nbsp;&nbsp;All amounts in Philippine Peso (PHP)</div>
          <div style={{marginTop:8,fontSize:".85rem",fontWeight:800,color:C.blue}}>{fmtRange()}</div>
        </div>

        {/* Two-column: overview + bar chart */}
        <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1.35fr 1fr",gap:0}}>
          <div>
            {sectionHdr("Cash Flow Overview")}
            <div style={{padding:"0 12px 12px"}}>
              <table style={{width:"100%",borderCollapse:"collapse",marginTop:10}}>
                <thead><tr><th style={{...th,textAlign:"left"}}>Metric</th><th style={{...th,width:mob?130:180}}>Amount (PHP)</th></tr></thead>
                <tbody>
                  {overviewRows.map(([l,v,hi,clr])=>(
                    <tr key={l} style={{background:hi?C.green:"#fff"}}>
                      <td style={{...td,fontWeight:hi?800:600,color:"#0f172a"}}>{l}</td>
                      <td style={{...td,...num,fontWeight:hi?900:700,color:clr}}>{peso(v)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div style={{borderLeft:mob?"none":`1px solid ${C.grid}`}}>
            {sectionHdr("Daily Collections vs Expenses","#2f5aa8")}
            <div style={{padding:"14px 12px 6px"}}><BarChart/>
              <div style={{display:"flex",gap:14,justifyContent:"center",fontSize:".66rem",color:"#475569",marginTop:2}}>
                <span><span style={{display:"inline-block",width:9,height:9,background:"#4472c4",borderRadius:2,marginRight:4}}/>Collections</span>
                <span><span style={{display:"inline-block",width:9,height:9,background:"#c0504d",borderRadius:2,marginRight:4}}/>Expenses</span>
              </div>
            </div>
          </div>
        </div>

        {/* Daily trend table */}
        {sectionHdr("Daily Cash Flow Trend")}
        <div style={{padding:"10px 12px 4px",overflowX:"auto"}}>
          <table style={{borderCollapse:"collapse",width:"100%",maxWidth:640}}>
            <thead><tr><th style={{...th,textAlign:"left"}}>Date</th><th style={th}>Collections</th><th style={th}>Expenses</th><th style={th}>Net</th></tr></thead>
            <tbody>
              {daily.length===0&&<tr><td colSpan={4} style={{...td,color:"#94a3b8",fontStyle:"italic"}}>No days in range.</td></tr>}
              {daily.map((r,i)=>(
                <tr key={r.date} style={{background:i%2?C.zebra:"#fff"}}>
                  <td style={{...td,color:C.blue,fontWeight:600}}>{r.date}</td>
                  <td style={{...td,...num}}>{r.coll?peso(r.coll):"—"}</td>
                  <td style={{...td,...num}}>{r.exp?peso(r.exp):"—"}</td>
                  <td style={{...td,...num,fontWeight:700,color:r.net>=0?"#047857":"#dc2626"}}>{r.net<0?`(${peso(Math.abs(r.net))})`:peso(r.net)}</td>
                </tr>
              ))}
              <tr style={{background:"#e8edf5",fontWeight:800}}>
                <td style={{...td,fontWeight:900,color:C.navy}}>TOTAL</td>
                <td style={{...td,...num,fontWeight:900}}>{peso(totColl)}</td>
                <td style={{...td,...num,fontWeight:900}}>{peso(totExp)}</td>
                <td style={{...td,...num,fontWeight:900,color:netChange>=0?"#047857":"#dc2626"}}>{peso(netChange)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Two-column: category table + pie */}
        <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1.35fr 1fr",gap:0,marginTop:6}}>
          <div>
            {sectionHdr("Expenses by Payee (from Daily Disbursements)")}
            <div style={{padding:"10px 12px 12px",overflowX:"auto"}}>
              <table style={{borderCollapse:"collapse",width:"100%"}}>
                <thead><tr><th style={{...th,textAlign:"left"}}>Payee / Particulars</th><th style={th}>Amount (PHP)</th><th style={{...th,width:90}}>% of Total</th></tr></thead>
                <tbody>
                  {byCat.arr.length===0&&<tr><td colSpan={3} style={{...td,color:"#94a3b8",fontStyle:"italic"}}>No disbursements in range.</td></tr>}
                  {byCat.arr.map((r,i)=>(
                    <tr key={r.name} style={{background:i%2?C.zebra:"#fff"}}>
                      <td style={{...td,display:"flex",alignItems:"center",gap:6}}><span style={{width:9,height:9,borderRadius:2,background:PIE[i%PIE.length],flexShrink:0}}/>{r.name}</td>
                      <td style={{...td,...num}}>{peso(r.amount)}</td>
                      <td style={{...td,...num}}>{byCat.total>0?(r.amount/byCat.total*100).toFixed(1):"0.0"}%</td>
                    </tr>
                  ))}
                  <tr style={{background:"#e8edf5",fontWeight:800}}>
                    <td style={{...td,fontWeight:900,color:C.navy}}>TOTAL</td>
                    <td style={{...td,...num,fontWeight:900}}>{peso(byCat.total)}</td>
                    <td style={{...td,...num,fontWeight:900}}>100.0%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div style={{borderLeft:mob?"none":`1px solid ${C.grid}`}}>
            {sectionHdr("Expenses by Category","#2f5aa8")}
            <div style={{padding:"16px 12px"}}><PieChart/></div>
          </div>
        </div>

        <div style={{padding:"8px 14px 12px",fontSize:".66rem",color:"#94a3b8",fontStyle:"italic",lineHeight:1.5,borderTop:`1px solid ${C.grid}`}}>
          Collections = billing payments that clear in the {perLc} + manual collections. Expenses = disbursements recorded in the Daily Cash Position sheet, grouped by payee/particulars. Loan proceeds &amp; repayments are included in the totals and called out separately as memo items; Net Operating Cash Flow removes them.
        </div>
      </div>
    </div>
  );
}

export default WeeklyCashFlow;
