// Pure Supabase row <-> app-object field mappers, extracted verbatim from
// App.jsx. No component state — each is a plain shape transform. (The
// state-dependent mappers like toSbDeal/toSbBilling stay inside App as closures.)

export const drfToSb  =(r)=>({id:r.id,deal_id:r.dealId||null,drf_no:r.drfNo||'',client:r.client||'',location:r.location||'',designer:r.designer||'',design_deadline:r.designDeadline||null,project_title:r.projectTitle||'',type:r.type||'',category:r.category||'',size:r.size||'',platform:r.platform||'',finishes:r.finishes||'',max_height:r.maxHeight||'',brand_guide_link:r.brandGuideLink||'',budget:r.budget||'',description:r.description||'',accessories:r.accessories||[],ref_links:r.refLinks||[],notes:r.notes||'',approved_link:r.approvedLink||'',status:r.status||'New',created_by:r.createdBy||''});

export const drfFromSb=(r)=>({...r,dealId:r.deal_id,drfNo:r.drf_no,designDeadline:r.design_deadline,projectTitle:r.project_title,maxHeight:r.max_height,brandGuideLink:r.brand_guide_link,refLinks:r.ref_links||[],approvedLink:r.approved_link,createdBy:r.created_by,createdAt:r.created_at});

export const invToSb  =(r)=>({id:r.id,code:r.code||'',name:r.name||'',category:r.category||'',sub_category:r.subCategory||'',brand:r.brand||'',supplier:r.supplier||'',unit:r.unit||'',unit_size:r.unitSize||'',location:r.location||'Main Warehouse',qty_on_hand:Number(r.qtyOnHand)||0,reorder_point:Number(r.reorderPoint)||0,last_purchase_price:Number(r.lastPurchasePrice)||0,avg_cost:Number(r.avgCost)||0,last_updated:r.lastUpdated||null,notes:r.notes||'',status:r.status||'Active',ownership:r.ownership||'Project Stock',high_value:!!r.highValue,created_by:r.createdBy||''});

export const invFromSb=(r)=>({...r,subCategory:r.sub_category,unitSize:r.unit_size,qtyOnHand:Number(r.qty_on_hand)||0,reorderPoint:Number(r.reorder_point)||0,lastPurchasePrice:Number(r.last_purchase_price)||0,avgCost:Number(r.avg_cost)||0,ownership:r.ownership||'Project Stock',highValue:r.high_value||false,lastUpdated:r.last_updated,createdBy:r.created_by});

export const moveToSb =(r)=>({id:r.id,item_id:r.itemId||null,move_type:r.moveType||'',qty:Number(r.qty)||0,unit_cost:Number(r.unitCost)||0,deal_id:r.dealId||null,notes:r.notes||'',date:r.date||null,recorded_by:r.recordedBy||'',finance_witness:r.financeWitness||'',high_value:!!r.highValue});

export const moveFromSb=(r)=>({...r,itemId:r.item_id,moveType:r.move_type,unitCost:Number(r.unit_cost)||0,dealId:r.deal_id,recordedBy:r.recorded_by,financeWitness:r.finance_witness||'',highValue:r.high_value||false});

export const supToSb=s=>({company_name:s.companyName||s.company_name||"",rating:s.rating||"",email:s.email||"",materials:s.materials||"",contact_nos:s.contactNos||s.contact_nos||"",contact_person:s.contactPerson||s.contact_person||"",payment_terms:s.paymentTerms||s.payment_terms||"",address:s.address||"",tin_no:s.tinNo||s.tin_no||"",notes:s.notes||"",status:s.status||"Active",created_by:s.createdBy||s.created_by||""});

export const payableToSb=p=>({id:p.id,vendor:p.vendor||"",amount:Number(p.amount)||0,due_date:p.dueDate||null,project_id:p.projectId||null,category:p.category||"Supplier",invoice_ref:p.invoiceRef||"",notes:p.notes||"",status:p.status||"Unpaid",paid_date:p.paidDate||null,created_at:p.createdAt||null,created_by:p.createdBy||"",po_number:p.poNumber||"",po_id:p.poId||null,expense_id:p.expenseId||null,ap_number:p.apNumber||"",invoice_number:p.invoiceNumber||"",invoice_date:p.invoiceDate||null,paid_amount:Number(p.paidAmount)||0,account_code:p.accountCode||"",verified:p.verified!==false,verified_by:p.verifiedBy||"",verified_at:p.verifiedAt||null,verification_pct:p.verificationPct!=null?Number(p.verificationPct):100,pay_bank:p.payBank||"",pay_method:p.payMethod||"",pay_ref:p.payRef||"",vatable:!!p.vatable,input_vat:Number(p.inputVat)||0,net_amount:Number(p.netAmount)||0,ewt_rate:Number(p.ewtRate)||0,ewt_amount:Number(p.ewtAmount)||0,tin:p.tin||""});

export const loanToSb=l=>({id:l.id,lender:l.lender||"",type:l.type||"Bank Loan",principal:Number(l.principal)||0,disbursed_date:l.disbursedDate||null,term_months:Number(l.termMonths)||null,interest_rate:Number(l.interestRate)||0,monthly_payment:Number(l.monthlyPayment)||0,notes:l.notes||"",created_at:l.createdAt||null});

export const subconToSb=s=>({company_name:s.companyName||s.company_name||"",rating:s.rating||"",specialty:s.specialty||"",strengths_weaknesses:s.strengthsWeaknesses||s.strengths_weaknesses||"",contact_no:s.contactNo||s.contact_no||"",payment_terms:s.paymentTerms||s.payment_terms||"",address:s.address||"",remarks:s.remarks||"",rate_structure:s.rateStructure||s.rate_structure||"",payment_structure:s.paymentStructure||s.payment_structure||"",location_note:s.locationNote||s.location_note||"",notes:s.notes||"",status:s.status||"Active",created_by:s.createdBy||s.created_by||""});

export const cvToSb=v=>({id:v.id,cv_no:v.cvNo||"",date:v.date||null,payee:v.payee||"",amount:Number(v.amount)||0,description:v.description||"",project_id:v.projectId||null,bank:v.bank||"",notes:v.notes||"",status:v.status||"Draft",released_by:v.releasedBy||null,released_date:v.releasedDate||null,created_by:v.createdBy||"",created_at:v.createdAt||null,po_ref:v.poRef||"",ap_ref:v.apRef||"",payable_id:v.payableId||null,check_no:v.checkNo||"",cleared_date:v.clearedDate||null,is_cleared:v.isCleared||false});

export const swoToSb=r=>({
  id:r.id, wo_number:r.woNumber||"", deal_id:(r.projectId==="__gmd_stocks__"||r.dealId==="__gmd_stocks__")?null:(r.projectId||r.dealId||null),
  project_name:r.projectName||"", subcontractor:r.subcontractor||"",
  specialty:r.specialty||"", scope_of_work:r.scopeOfWork||"",
  wo_date:r.woDate||null, start_date:r.startDate||null, target_end_date:r.targetEndDate||null,
  contract_amount:Number(r.contractAmount)||0, retention_pct:Number(r.retentionPct)||0,
  payment_structure:r.paymentStructure||"", payment_terms:r.paymentTerms||"",
  status:r.status||"Issued", notes:r.notes||"",
  requested_by:r.requestedBy||"", approved_by:r.approvedBy||"",
  acct_status:r.acctStatus||"", acct_notes:r.acctNotes||"",
  acct_checked_by:r.acctCheckedBy||"", acct_checked_at:r.acctCheckedAt||null,
  payment_bank:r.paymentBank||"", payment_ref:r.paymentRef||"",
  payment_ordered_by:r.paymentOrderedBy||"", payment_ordered_at:r.paymentOrderedAt||null,
  paid_ref:r.paidRef||"", paid_date:r.paidDate||null,
  paid_amt:r.paidAmt!=null?Number(r.paidAmt):null, paid_by:r.paidBy||"",
  delivery:r.delivery?JSON.stringify(r.delivery):null,
  account_code:r.accountCode||"",
  created_at:r.createdDate||r.woDate||null,
});

export const ceReqFromSb=r=>({id:r.id,clientName:r.client_name,projectName:r.project_name,location:r.location,projectType:r.project_type,priority:r.priority,status:r.status,submittedBy:r.submitted_by,targetDeadline:r.target_deadline,submissionDeadline:r.submission_deadline,targetBudget:r.target_budget,targetMargin:r.target_margin,plansLink:r.plans_link,skpLink:r.skp_link,scheduleOfFinish:r.schedule_of_finish,notes:r.notes,ceNotes:r.ce_notes,bidAmount:r.bid_amount,bidMarginPct:r.bid_margin_pct,awarded:r.awarded,awardDate:r.award_date,dealId:r.deal_id,createdAt:r.created_at});

export const swoFromSb=r=>({...r,
  accountCode:r.account_code||"",
  woNumber:r.wo_number||"", projectId:r.deal_id, dealId:r.deal_id,
  projectName:r.project_name||"", scopeOfWork:r.scope_of_work||"",
  woDate:r.wo_date||"", startDate:r.start_date||"", targetEndDate:r.target_end_date||"",
  contractAmount:Number(r.contract_amount)||0, retentionPct:Number(r.retention_pct)||0,
  paymentStructure:r.payment_structure||"", paymentTerms:r.payment_terms||"",
  requestedBy:r.requested_by||"", approvedBy:r.approved_by||"",
  acctStatus:r.acct_status||"", acctNotes:r.acct_notes||"",
  acctCheckedBy:r.acct_checked_by||"", acctCheckedAt:r.acct_checked_at||"",
  paymentBank:r.payment_bank||"", paymentRef:r.payment_ref||"",
  paymentOrderedBy:r.payment_ordered_by||"", paymentOrderedAt:r.payment_ordered_at||"",
  paidRef:r.paid_ref||"", paidDate:r.paid_date||"",
  paidAmt:r.paid_amt!=null?Number(r.paid_amt):null, paidBy:r.paid_by||"",
  delivery:r.delivery?(typeof r.delivery==="string"?(()=>{try{return JSON.parse(r.delivery);}catch(e){return null;}})():r.delivery):null,
});
