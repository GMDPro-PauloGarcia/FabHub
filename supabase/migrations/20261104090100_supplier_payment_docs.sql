-- Supplier payment documents checklist (decided by Paulo, 2026-11-04).
--
-- "Suppliers are paid within the agreed terms and must have complete docs
-- before a check is released." A supplier bill (payables.category 'Supplier',
-- not a subcontractor) created on/after 2026-11-09 (Manila) can be paid only
-- when all of these are on file — the PO's own terms already say "Payment is
-- released only after complete delivery and receipt of a valid Delivery
-- Receipt and Invoice":
--   1. Approved PO      the bill's PO is issued (PO Issued / Partially
--                       Delivered / Delivered) in purchase_requests
--   2. Delivery Receipt Warehouse logged a DR against that PO, with who
--                       received it (delivery_receipts.received_by)
--   3. Invoice          supplier invoice no., invoice date and an uploaded
--                       copy (payables.invoice_doc_path)
--   4. Supplier TIN     on the bill, or on the supplier master (tin_no)
-- and only on/after the due date: payables.due_date, else invoice date + the
-- PO's payment terms ("30 Days" → 30; COD or blank → due on the invoice date).
--
-- A Manager can override a bill (override_supplier_docs, reason required,
-- written to audit_log); the override lifts both the docs and the date check
-- for that bill. Bills created before 2026-11-09 are not blocked (rollout
-- decided by Paulo) — the app still shows their checklist.
-- Daily at 7:54 AM Manila, supplier_overdue_alert() posts bills that are past
-- due with complete docs (or overridden) and still unpaid to the Cost Control
-- Telegram chat, so nothing is paid late.
--
-- Only requests from the app (with a JWT) are checked, like the other payable
-- guards; migrations and server-side imports stay exempt.
-- Mirrors supplierDocsStatus in src/core.js — keep them in sync.
-- Idempotent; no DROP (Supabase MCP hangs on DROP).

alter table public.payables add column if not exists invoice_doc_path     text;
alter table public.payables add column if not exists docs_override_by     text;
alter table public.payables add column if not exists docs_override_reason text;
alter table public.payables add column if not exists docs_override_at     timestamptz;

create or replace function public.supplier_docs_golive()
returns timestamptz language sql immutable set search_path = pg_catalog, public as $$
  select timestamptz '2026-11-09 00:00:00+08'
$$;

-- Days from a PO payment-terms label: "30 Days" → 30, "COD" / blank → 0.
create or replace function public.terms_days(p_terms text)
returns int language sql immutable set search_path = pg_catalog, public as $$
  select coalesce(nullif(substring(coalesce(p_terms,'') from '(\d+)'), '')::int, 0)
$$;

-- The checklist for one bill. {applies, ok, missing[], due_date, dr_no, tin}
create or replace function public.supplier_docs_check(p public.payables)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_applies boolean;
  v_missing text[] := '{}';
  v_dr text; v_tin text; v_terms text; v_due date;
begin
  v_applies := coalesce(p.category,'') = 'Supplier'
               and not public.is_subcon_payable(p.category, p.account_code)
               and p.created_at >= public.supplier_docs_golive()
               and p.docs_override_at is null;

  if coalesce(p.po_number,'') = '' or not exists (
       select 1 from public.purchase_requests pr
        where pr.po_number = p.po_number and pr.status in ('PO Issued','Partially Delivered','Delivered')) then
    v_missing := array_append(v_missing, 'Approved PO');
  end if;

  select dr.dr_no into v_dr from public.delivery_receipts dr
   where coalesce(p.po_number,'') <> '' and dr.po_number = p.po_number
     and coalesce(btrim(dr.dr_no),'') <> '' and coalesce(btrim(dr.received_by),'') <> ''
   order by dr.dr_date desc nulls last limit 1;
  if v_dr is null then v_missing := array_append(v_missing, 'Delivery Receipt (logged by Warehouse)'); end if;

  if coalesce(btrim(p.invoice_number),'') = '' then v_missing := array_append(v_missing, 'Invoice no.'); end if;
  if p.invoice_date is null then v_missing := array_append(v_missing, 'Invoice date'); end if;
  if coalesce(btrim(p.invoice_doc_path),'') = '' then v_missing := array_append(v_missing, 'Invoice copy'); end if;

  v_tin := nullif(btrim(coalesce(p.tin,'')), '');
  if v_tin is null then
    select nullif(btrim(s.tin_no),'') into v_tin from public.suppliers s
     where public.ap_vendor_key(s.company_name) = public.ap_vendor_key(p.vendor) and coalesce(btrim(s.tin_no),'') <> ''
     limit 1;
  end if;
  if v_tin is null then v_missing := array_append(v_missing, 'Supplier TIN'); end if;

  select pr.payment_terms into v_terms from public.purchase_requests pr
   where pr.po_number = p.po_number and coalesce(pr.payment_terms,'') <> '' limit 1;
  v_due := coalesce(p.due_date, p.invoice_date + public.terms_days(v_terms));

  return jsonb_build_object('applies', v_applies, 'ok', cardinality(v_missing) = 0,
    'missing', to_jsonb(v_missing), 'due_date', v_due, 'dr_no', v_dr, 'tin', v_tin,
    'terms', coalesce(v_terms,''), 'overridden', p.docs_override_at is not null);
end $$;
revoke execute on function public.supplier_docs_check(public.payables) from public, anon, authenticated;

-- ── payment gate ─────────────────────────────────────────────────────────────
create or replace function public.payable_payments_docs_gate()
returns trigger language plpgsql security definer set search_path = public as $$
declare p public.payables; r jsonb; v_due date;
begin
  if public.app_role() = '' then return new; end if;                       -- migrations / server imports
  if coalesce(new.status,'Active') <> 'Active' or coalesce(new.kind,'Payment') <> 'Payment' then return new; end if;
  select * into p from public.payables where id = new.payable_id;
  if not found then return new; end if;
  r := public.supplier_docs_check(p);
  if not (r->>'applies')::boolean then return new; end if;
  if not (r->>'ok')::boolean then
    raise exception 'DOCS_BLOCK: % (%) is missing: %. A Manager can override with a reason.',
      coalesce(nullif(p.ap_number,''), p.id), p.vendor,
      (select string_agg(x, ', ') from jsonb_array_elements_text(r->'missing') x) using errcode = '42501';
  end if;
  v_due := (r->>'due_date')::date;
  if v_due is not null and new.pay_date < v_due then
    raise exception 'TERMS_BLOCK: % (%) is not due until % (% terms). A Manager can override with a reason.',
      coalesce(nullif(p.ap_number,''), p.id), p.vendor, to_char(v_due,'Mon DD, YYYY'),
      coalesce(nullif(r->>'terms',''),'invoice-date') using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.payable_payments_docs_gate() from public, anon, authenticated;
create or replace trigger trg_payable_payments_docs_gate
  before insert on public.payable_payments
  for each row execute function public.payable_payments_docs_gate();

-- ── override fields change only through the RPC ─────────────────────────────
create or replace function public.payables_docs_override_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('fabhub.docs_override', true), '') = 'on' then return new; end if;
  if tg_op = 'INSERT' then
    new.docs_override_by := null; new.docs_override_reason := null; new.docs_override_at := null;
  else
    new.docs_override_by := old.docs_override_by; new.docs_override_reason := old.docs_override_reason;
    new.docs_override_at := old.docs_override_at;
  end if;
  return new;
end $$;
revoke execute on function public.payables_docs_override_guard() from public, anon, authenticated;
create or replace trigger trg_payables_docs_override_guard
  before insert or update on public.payables
  for each row execute function public.payables_docs_override_guard();

create or replace function public.override_supplier_docs(p_payable text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare p public.payables; r jsonb;
begin
  if not public.has_role('Manager') then
    raise exception 'Only a Manager can override the supplier payment documents' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_reason,''))) < 5 then
    raise exception 'Give the reason for the override (at least 5 characters)' using errcode = '22023';
  end if;
  select * into p from public.payables where id = p_payable for update;
  if not found then raise exception 'Bill not found' using errcode = 'P0002'; end if;
  r := public.supplier_docs_check(p);
  perform set_config('fabhub.docs_override', 'on', true);
  update public.payables set docs_override_by = coalesce(nullif(public.app_username(),''),'unknown'),
         docs_override_reason = btrim(p_reason), docs_override_at = now(), updated_at = now()
   where id = p.id;
  perform set_config('fabhub.docs_override', 'off', true);
  insert into public.audit_log (table_name, record_id, action, snapshot, reason, performed_by)
  values ('payables', p.id, 'supplier_docs_override', to_jsonb(p) || jsonb_build_object('checklist', r),
          btrim(p_reason), coalesce(nullif(public.app_username(),''),'unknown'));
end $$;
revoke execute on function public.override_supplier_docs(text, text) from public, anon;
grant  execute on function public.override_supplier_docs(text, text) to authenticated;

-- ── daily: past-due bills that are ready to pay ─────────────────────────────
create or replace function public.supplier_overdue_alert()
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  rec public.payables; r jsonb; msg text := ''; n int := 0; total numeric := 0;
  bot jsonb; token text; chat text; today date := (now() at time zone 'Asia/Manila')::date;
  peso text := 'FM999,999,999,990.00';
begin
  for rec in select * from public.payables p
              where coalesce(p.category,'') = 'Supplier' and coalesce(p.status,'') <> 'Paid'
                and p.created_at >= public.supplier_docs_golive()
              order by p.vendor loop
    r := public.supplier_docs_check(rec);
    continue when (r->>'due_date') is null or (r->>'due_date')::date >= today;
    continue when not ((r->>'ok')::boolean or (r->>'overridden')::boolean);
    n := n + 1; total := total + (rec.amount - coalesce(rec.paid_amount,0));
    if n <= 15 then
      msg := msg || E'\n• ' || coalesce(nullif(rec.ap_number,''),'?') || ' ' || rec.vendor || ' — ₱'
             || to_char(rec.amount - coalesce(rec.paid_amount,0), peso) || ', due ' || to_char((r->>'due_date')::date, 'Mon DD');
    end if;
  end loop;
  if n = 0 then return jsonb_build_object('overdue', 0); end if;
  msg := E'⏰ Supplier bills past due — docs complete, not yet paid (' || n || E', ₱' || to_char(total, peso) || ')' || msg
         || case when n > 15 then E'\n… and ' || (n - 15) || ' more' else '' end
         || E'\nPay in FabHub › Finance › Payables.';
  select value into bot from public.app_settings where key = 'botsettings';
  select value into token from public.app_secrets where key = 'telegram_bot_token';
  chat := coalesce(nullif(bot->'chatIds'->>'financialcontrol',''), bot->'chatIds'->>'management');
  if token is not null and chat is not null then
    perform net.http_post(url := 'https://api.telegram.org/bot' || token || '/sendMessage',
      body := jsonb_build_object('chat_id', chat, 'text', msg), headers := '{"Content-Type": "application/json"}'::jsonb);
  end if;
  return jsonb_build_object('overdue', n, 'total', total, 'message', msg);
end $$;
revoke execute on function public.supplier_overdue_alert() from public, anon, authenticated;
select cron.schedule('fabhub-supplier-overdue', '54 23 * * *', 'select public.supplier_overdue_alert()');

-- ROLLBACK
--   drop trigger if exists trg_payable_payments_docs_gate on public.payable_payments;
--   drop trigger if exists trg_payables_docs_override_guard on public.payables;
--   select cron.unschedule('fabhub-supplier-overdue');
--   (columns and functions are harmless to leave in place)
