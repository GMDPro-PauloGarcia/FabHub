-- Procurement simplification (Paulo, 2026-11-22, procurement audit items 1-3).
--
-- Audit, 22 Nov 2026: 223 POs Pending Approval (₱2.95M), 182 older than 7 days;
-- median time to approve 91 h. Since the tiers went live (14 Nov) only 19 POs were
-- approved in 8 days. 66% of POs are ₱10,000 or less (median ₱5,340). No PO
-- receipt had been recorded since the week of 26 Oct: deliveries go straight to
-- the store / site, where the Warehouse never sees them, and the PM / coordinator
-- could not even read PO lines.
--
-- 1. Escalation: po_approval_escalation_alert() runs twice a day (Mon-Sat, 9:17 AM
--    and 2:17 PM Manila). POs waiting 24 h+ go to the Cost Control chat, 48 h+ to
--    management; POs held only by a client down payment are counted separately
--    (no approver can issue them). Unsigned work orders are counted too.
--    Notifications only: a higher tier can already approve a lower tier's PO.
-- 2. Tiers: a PO of ₱10,000 or less is issued when saved by Procurement / the
--    Procurement Manager / a Manager, as long as everything ordered from that
--    supplier that day is ₱10,000 or less (po_split_total, so an order can't be cut
--    into small POs). approved_by reads 'Auto ≤₱10K: <name>'. The Procurement
--    Manager now approves her team's POs up to ₱150,000 (was ₱50,000), same as Cost
--    Control. The daily review (proc_mgr_po_approvals_alert, 7:56 AM) now lists
--    both her approvals and the auto-issued POs.
-- 3. Site receiving: confirm_po_receipt() lets the PM / Operations, the project's
--    coordinator, Warehouse or a Manager confirm a delivery; everyone but Warehouse
--    must attach a photo of the delivery receipt (po-receipts/... in fabhub-files).
--    Nobody confirms a delivery on a PO they requested (Manager excepted), and no
--    more than was ordered (Manager excepted). site_deliveries() lists open PO lines
--    WITHOUT prices for those roles (they still have no read on purchase_requests).
--    Storage policy fabhub_po_receipts_ins lets those roles upload under
--    po-receipts/ only. NB: fabhub-files had no storage policy at all before this,
--    so no upload (liquidation receipts, supplier docs) had ever succeeded.
--
-- App mirrors: PO_AUTO_ISSUE_LIMIT / canAutoIssuePO / PO_PROC_MGR_LIMIT /
-- canApprovePOLine / PO_APPROVER_MSG (src/core.js), submitPO / approvePOs
-- (src/App.jsx), src/views/SiteReceiving.jsx. Keep them in sync.

-- ── 2a. Procurement Manager up to ₱150,000 ──────────────────────────────────
create or replace function public.po_line_approver_name(p_requested_by text, p_total numeric, p_split numeric, p_has_supplier boolean)
 returns text
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog', 'public'
as $function$
declare me record; req_role text;
begin
  select name, role into me from public.user_profiles
   where username = public.app_username() and lower(coalesce(status,'active')) <> 'inactive';
  if not found then return null; end if;
  if public.has_role('Manager') or me.role = 'Manager' then
    if coalesce(p_total,0) < 250000 or public.po_top_approver() then return me.name; end if;
    return null;
  end if;
  if (public.has_role('QS') or me.role = 'QS')
     and coalesce(p_total,0) <= 150000
     and (coalesce(btrim(p_requested_by),'') = '' or lower(btrim(p_requested_by)) <> lower(btrim(me.name))) then
    return me.name;
  end if;
  if me.role = 'ProcurementManager'
     and coalesce(p_has_supplier, false)
     and p_split is not null
     and coalesce(p_total,0) <= 150000
     and p_split <= 150000
     and coalesce(btrim(p_requested_by),'') <> ''
     and lower(btrim(p_requested_by)) <> lower(btrim(me.name)) then
    select role into req_role from public.user_profiles
     where lower(btrim(name)) = lower(btrim(p_requested_by)) and lower(coalesce(status,'active')) <> 'inactive'
     limit 1;
    if req_role = 'Procurement' then return me.name; end if;
  end if;
  return null;
end $function$;

-- ── 2b. Auto-issue ₱10,000 and below ────────────────────────────────────────
create or replace function public.po_require_approver()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public'
as $function$
declare
  issued text[] := array['PO Issued', 'Partially Delivered', 'Delivered'];
  who text; tot numeric; split numeric; d date; has_sup boolean; nm text;
begin
  if coalesce(current_setting('request.jwt.claims', true), '') = '' then
    return new;
  end if;
  if tg_op = 'INSERT' and exists (select 1 from public.purchase_requests where id = new.id) then
    return new;
  end if;
  if not (coalesce(new.status, '') = any(issued)) then
    return new;
  end if;
  if tg_op = 'UPDATE' and coalesce(old.status, '') = any(issued) then
    new.approved_by := old.approved_by;
    new.approved_at := old.approved_at;
    return new;
  end if;
  tot := public.po_total(new.po_number, new.id) + coalesce(new.qty,0)*coalesce(new.estimated_cost,0);
  has_sup := public.ap_vendor_key(new.supplier) <> '';
  d := coalesce(new.po_date, (coalesce(new.created_at, now()) at time zone 'Asia/Manila')::date);
  split := case when has_sup then public.po_split_total(new.po_number, new.supplier, d, new.id)
                                  + coalesce(new.qty,0)*coalesce(new.estimated_cost,0) end;
  who := public.po_line_approver_name(new.requested_by, tot, split, has_sup);
  -- Small POs (2026-11-22): ₱10,000 or less, and that supplier's POs that day
  -- ₱10,000 or less, are issued by Procurement / Procurement Manager / a Manager
  -- without a second person; reviewed next morning (proc_mgr_po_approvals_alert).
  if who is null and has_sup and tot <= 10000 and split <= 10000
     and public.has_role('Procurement', 'ProcurementManager', 'Manager') then
    select name into nm from public.user_profiles where lower(username) = lower(public.app_username());
    who := 'Auto ≤₱10K: ' || coalesce(nullif(nm,''), public.app_username());
  end if;
  if who is null then
    raise exception 'Not approved. POs of ₱10,000 or less (that supplier''s POs that day ₱%) are issued by Procurement; Marian approves her team''s POs and Cost Control approves up to ₱150,000, Paolo Gomez up to ₱250,000, and Paulo, Mar or Arrius from ₱250,000; never a PO you requested. This PO is ₱%.',
      to_char(coalesce(split,0),'FM999,999,999.00'), to_char(tot,'FM999,999,999.00')
      using errcode = 'insufficient_privilege';
  end if;
  new.approved_by := who;
  new.approved_at := (now() at time zone 'Asia/Manila')::date;
  return new;
end $function$;

create or replace function public.approve_po(p_po text)
 returns integer
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public'
as $function$
declare n integer;
begin
  if coalesce(btrim(p_po),'') = '' then raise exception 'PO number required' using errcode = '22023'; end if;
  if not public.has_role('Manager','QS','Procurement','ProcurementManager') then
    raise exception 'Only Procurement (POs of ₱10,000 or less), the Procurement Manager or Cost Control (up to ₱150,000) or a Manager can approve a PO' using errcode = '42501';
  end if;
  update public.purchase_requests set status = 'PO Issued'
   where po_number = p_po and status = 'Pending Approval';
  get diagnostics n = row_count;
  return n;
end $function$;

-- ── 2c. Daily review: Procurement Manager approvals + auto-issued POs ───────
create or replace function public.proc_mgr_po_approvals_alert(p_send boolean default true, p_day date default null::date)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public'
as $function$
declare
  peso text := 'FM999,999,990.00';
  d date := coalesce(p_day, (now() at time zone 'Asia/Manila')::date - 1);
  r record;
  msg text := '';
  n int := 0; tot numeric := 0; n_auto int := 0;
  bot jsonb; token text; chat text; sent boolean := false;
begin
  for r in
    with po as (
      select pr.po_number,
             max(pr.supplier) supplier,
             public.ap_vendor_key(max(pr.supplier)) vk,
             max(pr.approved_by) approved_by,
             bool_or(pr.approved_by like 'Auto ≤₱10K:%') is_auto,
             max(coalesce(nullif(pr.requested_by,''), pr.created_by)) requested_by,
             max(coalesce(nullif(dl.contact,''), dl.client, nullif(pr.project_name,''), 'GMD Stock')) project,
             sum(coalesce(pr.qty,0)*coalesce(pr.estimated_cost,0)) amount
        from public.purchase_requests pr
        left join public.deals dl on dl.id = pr.deal_id
       where pr.approved_at = d
         and coalesce(pr.status,'') <> 'Cancelled'
         and coalesce(pr.po_number,'') <> ''
         and (pr.approved_by like 'Auto ≤₱10K:%'
              or lower(btrim(coalesce(pr.approved_by,''))) in
                 (select lower(btrim(name)) from public.user_profiles where role = 'ProcurementManager'))
       group by pr.po_number)
    select po.*, count(*) over (partition by vk) same_supplier
      from po order by po.is_auto, po.supplier, po.po_number
  loop
    n := n + 1; tot := tot + r.amount;
    if r.is_auto then n_auto := n_auto + 1; end if;
    msg := msg || E'\n• ' || r.po_number || ' · ' || coalesce(r.supplier,'—') || ' · ₱' || to_char(r.amount, peso)
        || E'\n   ' || coalesce(r.project,'—') || ' · '
        || case when r.is_auto then 'auto-issued, ordered by ' || coalesce(r.requested_by,'—')
                else 'approved by ' || coalesce(r.approved_by,'—') || ', requested by ' || coalesce(r.requested_by,'—') end
        || case when r.same_supplier > 1 then E'\n   ⚠ ' || r.same_supplier || ' of these POs to this supplier that day' else '' end;
  end loop;

  if n = 0 then
    if p_send then
      insert into public.ap_health_log (ok, details, notified)
      values (true, jsonb_build_object('kind','procmgr_po_approvals','day',d,'count',0), false);
    end if;
    return jsonb_build_object('sent', false, 'count', 0, 'message', null);
  end if;

  msg := '🧾 POs issued without Cost Control on ' || to_char(d, 'Dy DD Mon') || ': ' || n
      || ', ₱' || to_char(tot, peso)
      || E'\n(' || (n - n_auto) || ' approved by the Procurement Manager, her team''s POs up to ₱150,000; '
      || n_auto || ' auto-issued, ₱10,000 or less with that supplier''s POs that day included)'
      || msg || E'\n\nCost Control / Paolo Gomez: open anything that looks off in FabHub › Orders › Purchase Orders.';

  if p_send then
    select value into bot from public.app_settings where key = 'botsettings';
    select value into token from public.app_secrets where key = 'telegram_bot_token';
    if token is not null then
      foreach chat in array array[bot->'chatIds'->>'financialcontrol', bot->'chatIds'->>'management'] loop
        if coalesce(chat,'') <> '' then
          perform net.http_post(
            url := 'https://api.telegram.org/bot' || token || '/sendMessage',
            body := jsonb_build_object('chat_id', chat, 'text', left(msg, 4000)),
            headers := '{"Content-Type": "application/json"}'::jsonb);
          sent := true;
        end if;
      end loop;
    end if;
    insert into public.ap_health_log (ok, details, notified)
    values (true, jsonb_build_object('kind','procmgr_po_approvals','day',d,'count',n,'auto',n_auto,'total',tot,'message',msg), sent);
  end if;
  return jsonb_build_object('sent', sent, 'count', n, 'auto', n_auto, 'total', tot, 'message', msg);
end $function$;

-- ── 1. Approval escalation (twice a day) ────────────────────────────────────
create or replace function public.po_approval_escalation_alert(p_send boolean default true)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public'
as $function$
declare
  peso text := 'FM999,999,990';
  r record;
  l24 text := ''; l48 text := '';
  n24 int := 0; v24 numeric := 0; n48 int := 0; v48 numeric := 0;
  ndp int := 0; vdp numeric := 0;
  nwo int := 0; vwo numeric := 0; wo_oldest date;
  m_cc text; m_mgmt text;
  bot jsonb; token text; sent boolean := false;
begin
  for r in
    with po as (
      select pr.po_number,
             min(pr.created_at) created,
             max(pr.supplier) supplier,
             max(coalesce(nullif(pr.requested_by,''), pr.created_by)) requested_by,
             max(coalesce(nullif(dl.contact,''), dl.client, nullif(pr.project_name,''), 'GMD Stock')) project,
             sum(coalesce(pr.qty,0)*coalesce(pr.estimated_cost,0)) amount,
             bool_and(public.deal_dp_clear(pr.deal_id)) dp_ok
        from public.purchase_requests pr
        left join public.deals dl on dl.id = pr.deal_id
       where pr.status = 'Pending Approval' and coalesce(pr.po_number,'') <> ''
       group by pr.po_number)
    select po.*, extract(epoch from (now() - created))/3600 hrs from po
     where created < now() - interval '24 hours'
     order by created
  loop
    if not r.dp_ok then
      ndp := ndp + 1; vdp := vdp + r.amount;
      continue;
    end if;
    if r.hrs >= 48 then
      n48 := n48 + 1; v48 := v48 + r.amount;
      if n48 <= 12 then
        l48 := l48 || E'\n• ' || r.po_number || ' · ₱' || to_char(r.amount, peso) || ' · ' || coalesce(r.supplier,'—')
            || ' · ' || coalesce(r.project,'—') || ' · ' || floor(r.hrs/24)::int || ' days';
      end if;
    else
      n24 := n24 + 1; v24 := v24 + r.amount;
      if n24 <= 12 then
        l24 := l24 || E'\n• ' || r.po_number || ' · ₱' || to_char(r.amount, peso) || ' · ' || coalesce(r.supplier,'—')
            || ' · ' || coalesce(r.project,'—');
      end if;
    end if;
  end loop;

  select count(*), coalesce(sum(contract_amount),0), min(coalesce(wo_date, created_at::date))
    into nwo, vwo, wo_oldest
    from public.subcon_work_orders
   where status = 'Pending Approval' and created_at < now() - interval '48 hours';

  if n24 + n48 > 0 then
    m_cc := '⏰ POs waiting for approval: ' || (n24 + n48) || ', ₱' || to_char(v24 + v48, peso)
         || case when n48 > 0 then E'\n\nOver 2 days (' || n48 || ', ₱' || to_char(v48, peso) || '), oldest first:' || l48
                 || case when n48 > 12 then E'\n… +' || (n48 - 12) || ' more' else '' end else '' end
         || case when n24 > 0 then E'\n\nOver 1 day (' || n24 || ', ₱' || to_char(v24, peso) || '):' || l24
                 || case when n24 > 12 then E'\n… +' || (n24 - 12) || ' more' else '' end else '' end
         || E'\n\nUp to ₱150,000: Cost Control or Marian (her team''s POs). FabHub › Orders › Purchase Orders › PO approvals.'
         || case when ndp > 0 then E'\n(' || ndp || ' more, ₱' || to_char(vdp, peso) || ', wait for the client''s down payment: not for approvers.)' else '' end;
  end if;
  if n48 > 0 or nwo > 0 then
    m_mgmt := '🚨 Approvals overdue'
         || case when n48 > 0 then E'\nPOs waiting over 2 days: ' || n48 || ', ₱' || to_char(v48, peso)
                 || '. A Manager can approve any PO below ₱250,000.' else '' end
         || case when nwo > 0 then E'\nWork orders unsigned over 2 days: ' || nwo || ', ₱' || to_char(vwo, peso)
                 || ', oldest ' || to_char(wo_oldest, 'DD Mon YYYY') || '.' else '' end
         || case when ndp > 0 then E'\nPOs held for the client''s down payment: ' || ndp || ', ₱' || to_char(vdp, peso) || '.' else '' end;
  end if;

  if p_send then
    select value into bot from public.app_settings where key = 'botsettings';
    select value into token from public.app_secrets where key = 'telegram_bot_token';
    if token is not null then
      if m_cc is not null and coalesce(bot->'chatIds'->>'financialcontrol','') <> '' then
        perform net.http_post(url := 'https://api.telegram.org/bot' || token || '/sendMessage',
          body := jsonb_build_object('chat_id', bot->'chatIds'->>'financialcontrol', 'text', left(m_cc, 4000)),
          headers := '{"Content-Type": "application/json"}'::jsonb);
        sent := true;
      end if;
      if m_cc is not null and coalesce(bot->'chatIds'->>'procurement','') <> '' then
        perform net.http_post(url := 'https://api.telegram.org/bot' || token || '/sendMessage',
          body := jsonb_build_object('chat_id', bot->'chatIds'->>'procurement', 'text', left(m_cc, 4000)),
          headers := '{"Content-Type": "application/json"}'::jsonb);
        sent := true;
      end if;
      if m_mgmt is not null and coalesce(bot->'chatIds'->>'management','') <> '' then
        perform net.http_post(url := 'https://api.telegram.org/bot' || token || '/sendMessage',
          body := jsonb_build_object('chat_id', bot->'chatIds'->>'management', 'text', left(m_mgmt, 4000)),
          headers := '{"Content-Type": "application/json"}'::jsonb);
        sent := true;
      end if;
    end if;
    insert into public.ap_health_log (ok, details, notified)
    values (n48 = 0 and nwo = 0, jsonb_build_object('kind','po_escalation','over24',n24,'over48',n48,'dp_held',ndp,
            'wo_unsigned',nwo,'cc_message',m_cc,'mgmt_message',m_mgmt), sent);
  end if;
  return jsonb_build_object('sent', sent, 'over24', n24, 'over48', n48, 'value48', v48, 'dp_held', ndp,
                            'wo_unsigned', nwo, 'cc_message', m_cc, 'mgmt_message', m_mgmt);
end $function$;

-- ── 3. Site receiving ───────────────────────────────────────────────────────
-- Open PO lines (issued, not fully delivered) for the people who confirm
-- deliveries. No prices: these roles have no read on purchase_requests.
create or replace function public.site_deliveries()
 returns table(id uuid, po_number text, po_date date, supplier text, item text, qty numeric, unit text,
               qty_delivered numeric, deal_id uuid, project text, ce_no text, mine boolean,
               requested_by text, last_dr text, expected date)
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog', 'public'
as $function$
#variable_conflict use_column
declare all_projects boolean;
begin
  if not public.has_role('Warehouse','Manager','ProjectMover','Operations','Coordinator') then
    raise exception 'Only the PM, the project coordinator, Operations, Warehouse or a Manager confirms deliveries' using errcode = '42501';
  end if;
  all_projects := public.has_role('Warehouse','Manager','ProjectMover','Operations');
  return query
  with me as (
    select public.prf_norm_name(coalesce(nullif(up.name,''), public.app_username())) nm
      from (select 1) x
      left join public.user_profiles up on lower(up.username) = lower(public.app_username())
     limit 1)
  select pr.id, pr.po_number,
         coalesce(pr.po_date, (pr.created_at at time zone 'Asia/Manila')::date),
         pr.supplier, pr.item, pr.qty, pr.unit, coalesce(pr.qty_delivered,0), pr.deal_id,
         coalesce(nullif(pr.project_name,''), dl.client, 'GMD Stock'), dl.ce_no,
         exists (select 1 from public.project_cards pc, me
                  where pc.deal_id in (pr.deal_id, dl.parent_deal_id) and me.nm <> ''
                    and me.nm in (public.prf_norm_name(pc.pm1), public.prf_norm_name(pc.pm2),
                                  public.prf_norm_name(pc.pm3), public.prf_norm_name(pc.coordinator))),
         coalesce(nullif(pr.requested_by,''), pr.created_by),
         pr.dr_no,
         pr.delivery_date
    from public.purchase_requests pr
    left join public.deals dl on dl.id = pr.deal_id
   where pr.status in ('PO Issued','Partially Delivered')
     and coalesce(pr.po_number,'') <> ''
     and (all_projects or pr.deal_id in (select public.coordinator_deal_ids()))
   order by 12 desc, 3 desc, 2
   limit 2000;
end $function$;

-- p_received = what arrived in THIS delivery (added to what was already received).
create or replace function public.confirm_po_receipt(p_id uuid, p_received numeric, p_date date default null,
                                                     p_dr_no text default null, p_note text default null,
                                                     p_photo text default null)
 returns text
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public'
as $function$
declare r public.purchase_requests; nm text; st text; d date; tot numeric;
        wh boolean := public.has_role('Warehouse');
        mgr boolean := public.has_role('Manager');
begin
  if not public.has_role('Warehouse','Manager','ProjectMover','Operations','Coordinator') then
    raise exception 'Only the PM, the project coordinator, Operations, Warehouse or a Manager confirms a delivery' using errcode = '42501';
  end if;
  select name into nm from public.user_profiles where lower(username) = lower(public.app_username());
  select * into r from public.purchase_requests where id = p_id for update;
  if not found then raise exception 'PO line not found' using errcode = 'P0002'; end if;
  if coalesce(r.status,'') not in ('PO Issued','Partially Delivered') then
    raise exception 'PO % is %: only an issued PO that is not fully delivered can be received',
      coalesce(r.po_number,''), coalesce(r.status,'') using errcode = '22023';
  end if;
  if not public.has_role('Warehouse','Manager','ProjectMover','Operations')
     and (r.deal_id is null or r.deal_id not in (select public.coordinator_deal_ids())) then
    raise exception 'You can confirm deliveries only on projects you coordinate' using errcode = '42501';
  end if;
  if not mgr and coalesce(nm,'') <> ''
     and lower(btrim(coalesce(nullif(r.requested_by,''), r.created_by, ''))) = lower(btrim(nm)) then
    raise exception 'You ordered this PO, so someone else must confirm its delivery' using errcode = '42501';
  end if;
  if p_received is null or p_received <= 0 then
    raise exception 'Enter the quantity that arrived in this delivery' using errcode = '22023';
  end if;
  if coalesce(btrim(p_photo),'') = '' and not wh then
    raise exception 'Attach a photo of the signed delivery receipt (DR)' using errcode = '22023';
  end if;
  if coalesce(btrim(p_photo),'') <> '' and p_photo !~ '^po-receipts/' then
    raise exception 'Upload the delivery receipt photo through FabHub' using errcode = '22023';
  end if;
  d := coalesce(p_date, (now() at time zone 'Asia/Manila')::date);
  if d > (now() at time zone 'Asia/Manila')::date then
    raise exception 'The delivery date can''t be in the future' using errcode = '22023';
  end if;
  tot := coalesce(r.qty_delivered,0) + p_received;
  if tot > coalesce(r.qty,0) and not mgr then
    raise exception 'That makes % received but only % was ordered. Ask Procurement to amend the PO first.',
      tot, coalesce(r.qty,0) using errcode = '22023';
  end if;
  st := case when tot >= coalesce(r.qty,0) then 'Delivered' else 'Partially Delivered' end;
  update public.purchase_requests
     set qty_delivered = tot, status = st, delivery_date = d,
         dr_no = coalesce(nullif(btrim(p_dr_no),''), dr_no),
         delivery_note = coalesce(nullif(btrim(p_note),''), delivery_note),
         delivery_history = coalesce(delivery_history,'[]'::jsonb) || jsonb_build_array(jsonb_build_object(
           'date', d, 'qty', p_received, 'total', tot,
           'drNo', coalesce(nullif(btrim(p_dr_no),''), ''),
           'note', coalesce(nullif(btrim(p_note),''), ''),
           'photo', coalesce(nullif(btrim(p_photo),''), ''),
           'via', case when wh then 'warehouse' else 'site' end,
           'recordedBy', coalesce(nm, public.app_username()),
           'recordedAt', now()))
   where id = p_id;
  return st;
end $function$;

-- Delivery receipt photos: upload only, only under po-receipts/, only for the
-- roles that confirm deliveries. (The bucket is public: a photo is readable by
-- anyone who has its exact link.)
do $$
begin
  if not exists (select 1 from pg_policy where polrelid = 'storage.objects'::regclass and polname = 'fabhub_po_receipts_ins') then
    create policy fabhub_po_receipts_ins on storage.objects for insert to authenticated
      with check (bucket_id = 'fabhub-files'
                  and (storage.foldername(name))[1] = 'po-receipts'
                  and public.has_role('Warehouse','Manager','ProjectMover','Operations','Coordinator'));
  end if;
end $$;

-- ── Grants ──────────────────────────────────────────────────────────────────
revoke execute on function public.po_approval_escalation_alert(boolean) from public, anon, authenticated;
revoke execute on function public.proc_mgr_po_approvals_alert(boolean, date) from public, anon, authenticated;
revoke execute on function public.po_require_approver() from public, anon, authenticated;
revoke execute on function public.site_deliveries() from public, anon;
revoke execute on function public.confirm_po_receipt(uuid, numeric, date, text, text, text) from public, anon;
grant execute on function public.site_deliveries() to authenticated;
grant execute on function public.confirm_po_receipt(uuid, numeric, date, text, text, text) to authenticated;

-- 01:17 and 06:17 UTC = 9:17 AM and 2:17 PM Manila, Monday to Saturday.
select cron.schedule('fabhub-po-escalation', '17 1,6 * * 1-6', $$select public.po_approval_escalation_alert(true)$$);

-- ROLLBACK
-- select cron.unschedule('fabhub-po-escalation');
-- Re-run the po_line_approver_name / po_require_approver / approve_po /
-- proc_mgr_po_approvals_alert bodies from migrations 20261114030000 and
-- 20261114040000 (Procurement Manager ₱50,000, no auto-issue).
-- revoke execute on function public.confirm_po_receipt(uuid, numeric, date, text, text, text) from authenticated;
-- revoke execute on function public.site_deliveries() from authenticated;
-- alter policy fabhub_po_receipts_ins on storage.objects with check (false);
