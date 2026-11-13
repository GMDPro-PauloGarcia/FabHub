-- Daily list of the POs the Procurement Manager approved, for Cost Control and Paolo Gomez.
-- Decided with Paulo 2026-11-11 ("I think that should be Daily").
-- RELEASE: Saturday / Sunday only (CLAUDE.md). Apply with / after 20261114030000 (the tier
-- that lets Marian approve her team's POs up to ₱50,000). Harmless on its own: until that
-- tier is live there is nothing to list.
--
-- Every day at 7:56 AM Manila (pg_cron fabhub-procmgr-po-approvals, after the 7:50–7:54
-- health checks) this posts yesterday's POs approved by a Procurement Manager
-- (user_profiles.role = 'ProcurementManager', Marian Prile) to the Cost Control chat
-- (Rodney, Ardrin) and the management chat (Paolo Gomez): PO, supplier, requester, project,
-- amount, and a flag when the same supplier got more than one of her POs that day. Nothing
-- is sent on a day with no such approvals. The 7 Nov audit took PO approval away from
-- Procurement; this is the check that comes with giving part of it back.
-- proc_mgr_po_approvals_alert(false) is a dry run (returns the message, sends nothing);
-- proc_mgr_po_approvals_alert(true, '2026-11-16') reports a given day.
-- Runs are logged in ap_health_log (details->>'kind' = 'procmgr_po_approvals').
--
-- ROLLBACK
--   select cron.unschedule('fabhub-procmgr-po-approvals');
--   (proc_mgr_po_approvals_alert() can stay; nothing calls it then.)

create or replace function public.proc_mgr_po_approvals_alert(p_send boolean default true, p_day date default null)
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
  n int := 0; tot numeric := 0;
  bot jsonb; token text; chat text; sent boolean := false;
begin
  for r in
    with po as (
      select pr.po_number,
             max(pr.supplier) supplier,
             public.ap_vendor_key(max(pr.supplier)) vk,
             max(pr.approved_by) approved_by,
             max(coalesce(nullif(pr.requested_by,''), pr.created_by)) requested_by,
             max(coalesce(nullif(dl.contact,''), dl.client, nullif(pr.project_name,''), 'GMD Stock')) project,
             sum(coalesce(pr.qty,0)*coalesce(pr.estimated_cost,0)) amount
        from public.purchase_requests pr
        left join public.deals dl on dl.id = pr.deal_id
       where pr.approved_at = d
         and coalesce(pr.status,'') <> 'Cancelled'
         and coalesce(pr.po_number,'') <> ''
         and lower(btrim(coalesce(pr.approved_by,''))) in
             (select lower(btrim(name)) from public.user_profiles where role = 'ProcurementManager')
       group by pr.po_number)
    select po.*, count(*) over (partition by vk) same_supplier
      from po order by po.supplier, po.po_number
  loop
    n := n + 1; tot := tot + r.amount;
    msg := msg || E'\n• ' || r.po_number || ' · ' || coalesce(r.supplier,'—') || ' · ₱' || to_char(r.amount, peso)
        || E'\n   ' || coalesce(r.project,'—') || ' · requested by ' || coalesce(r.requested_by,'—')
        || case when r.same_supplier > 1 then E'\n   ⚠ ' || r.same_supplier || ' of her POs to this supplier that day' else '' end;
  end loop;

  if n = 0 then
    if p_send then
      insert into public.ap_health_log (ok, details, notified)
      values (true, jsonb_build_object('kind','procmgr_po_approvals','day',d,'count',0), false);
    end if;
    return jsonb_build_object('sent', false, 'count', 0, 'message', null);
  end if;

  msg := '🧾 POs approved by the Procurement Manager on ' || to_char(d, 'Dy DD Mon') || ': ' || n
      || ', ₱' || to_char(tot, peso) || E'\n(her limit: her team''s POs up to ₱50,000, that supplier''s POs that day included)'
      || msg || E'\n\nCost Control / Paolo Gomez: open anything that looks off in FabHub › Orders › Purchase Orders.';

  if p_send then
    select value into bot from public.app_settings where key = 'botsettings';
    select value into token from public.app_secrets where key = 'telegram_bot_token';
    if token is not null then
      foreach chat in array array[bot->'chatIds'->>'financialcontrol', bot->'chatIds'->>'management'] loop
        if coalesce(chat,'') <> '' then
          perform net.http_post(
            url := 'https://api.telegram.org/bot' || token || '/sendMessage',
            body := jsonb_build_object('chat_id', chat, 'text', msg),
            headers := '{"Content-Type": "application/json"}'::jsonb);
          sent := true;
        end if;
      end loop;
    end if;
    insert into public.ap_health_log (ok, details, notified)
    values (true, jsonb_build_object('kind','procmgr_po_approvals','day',d,'count',n,'total',tot,'message',msg), sent);
  end if;
  return jsonb_build_object('sent', sent, 'count', n, 'total', tot, 'message', msg);
end $function$;

revoke execute on function public.proc_mgr_po_approvals_alert(boolean, date) from public, anon, authenticated;

-- 23:56 UTC = 7:56 AM Manila. cron.schedule with a job name replaces an existing job of that name.
select cron.schedule('fabhub-procmgr-po-approvals', '56 23 * * *', $$select public.proc_mgr_po_approvals_alert(true)$$);
