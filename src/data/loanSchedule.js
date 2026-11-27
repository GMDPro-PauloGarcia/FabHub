// Bank-loan schedule math, shared by Loans (views/LoansView.jsx) and the
// Cash-Flow Forecast (CashFlowView in App.jsx), so both show the same
// installments on the same dates. Pure functions, no React.
const lnNum=v=>Number(String(v??"").replace(/,/g,""))||0;
// Calendar math on the date string itself: the old version went through local
// midnight → toISOString, which in Manila (UTC+8) gave the day before. A 31st
// due date lands on the month's last day (Jan 31 + 1 → Feb 28), not March.
export const addMonths=(iso,n)=>{const[y,m,d]=String(iso).slice(0,10).split("-").map(Number);const t=new Date(Date.UTC(y,m-1+n,1));
  const last=new Date(Date.UTC(t.getUTCFullYear(),t.getUTCMonth()+1,0)).getUTCDate();t.setUTCDate(Math.min(d,last));return t.toISOString().slice(0,10);};
export const daysBetween=(a,b)=>Math.round((new Date(b+"T00:00:00")-new Date(a+"T00:00:00"))/86400000);

// A bank loan's position today: principal paid, balance, months paid, next due.
export const bankLoanStatus=(l,today)=>{
  const pays=(l.payments||[]).filter(p=>!p.void);
  const principalPaid=pays.reduce((s,p)=>s+lnNum(p.principal),0);
  const interestPaid=pays.reduce((s,p)=>s+lnNum(p.interest),0);
  const balance=Math.max(0,lnNum(l.principal)-principalPaid);
  // Installments paid, by amount: a "paid before FabHub" entry covering
  // installments 1–39 is one entry but 39 installments. Counting entries put
  // First Circle, Security Bank and the Stella L300 months behind ("Missed",
  // next due in 2023) until 2026-11-27. Entry count only when there's no
  // monthly amount on file.
  const monthly=lnNum(l.monthlyPayment);
  const paidTotal=pays.reduce((s,p)=>s+lnNum(p.principal)+lnNum(p.interest),0);
  const paidCount=monthly>0?Math.floor(paidTotal/monthly+0.01):pays.length;
  const term=lnNum(l.termMonths)||0;
  const nextDue=balance>0&&l.firstDue?addMonths(l.firstDue,paidCount):null;
  const dueIn=nextDue?daysBetween(today,nextDue):null;
  const state=balance<=0?"paid":dueIn==null?"no-schedule":dueIn<0?"missed":dueIn<=3?"due":"ok";
  return{principalPaid,interestPaid,balance,paidCount,term,nextDue,dueIn,state};
};
// A bank loan's payment schedule (Paolo Gomez, 2026-11-27): one row per
// installment, due monthly from firstDue, for termMonths. Installments are
// covered in order by what has been paid (by amount, like bankLoanStatus), so a
// "paid before FabHub" lump entry ticks off many rows. The date shown is the
// payment entry that completed the installment. Equal installments: a bank's
// own amortization table can differ month to month; the amount here is the
// loan's monthly payment.
export const bankLoanSchedule=(l,today)=>{
  const st=bankLoanStatus(l,today);
  const monthly=lnNum(l.monthlyPayment);
  if(!l.firstDue||!(st.term>0)) return{rows:[],st};
  const pays=(l.payments||[]).filter(p=>!p.void).map(p=>({...p,amt:lnNum(p.principal)+lnNum(p.interest)}))
    .sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  let cum=0,pi=0;const rows=[];
  for(let i=1;i<=st.term;i++){
    const due=addMonths(l.firstDue,i-1);
    let paid=null;
    if(i<=st.paidCount){
      // Walk the payments until they add up to i installments.
      while(pi<pays.length&&cum+0.01<i*monthly){cum+=pays[pi].amt;pi++;}
      paid=pays[Math.max(0,pi-1)]||null;
    }
    const dueIn=daysBetween(today,due);
    const state=i<=st.paidCount||st.balance<=0?"paid":i===st.paidCount+1?(dueIn<0?"late":dueIn<=3?"due":"next"):dueIn<0?"late":"upcoming";
    rows.push({no:i,due,amount:monthly,state,dueIn,paidOn:paid?paid.date:null,onSheet:paid?!!paid.cashKey:null});
  }
  return{rows,st};
};
