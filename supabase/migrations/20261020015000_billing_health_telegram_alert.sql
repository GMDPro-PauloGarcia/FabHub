-- ============================================================================
-- Migration 20261020a — daily billing-totals health check, alerting on Telegram
--
-- Why: after 20261012010000/030000 the database owns deals.invoiced,
-- amount_paid and payment_status. If those triggers are ever dropped or
-- disabled, Finance's payments silently stop reaching the deal again (the
-- ₱5.67M bug). A Claude routine was tried first; it depends on connectors and
-- logins and failed two days running. This runs inside Postgres instead.
--
-- What:
--   billing_health_check()  → jsonb: enabled-trigger count + deals whose stored
--                             invoiced/amount_paid disagree with billing records
--                             (same rules as recompute_deal_billing_totals).
--   billing_health_alert()  → runs the check, logs it to billing_health_log,
--                             and posts to the Telegram "management" chat
--                             (bot token + chat id from app_settings.botsettings,
--                             the same bot the app uses):
--                               • any problem, or the check itself erroring;
--                               • every Monday, a one-line "still alive" summary
--                                 of the past 7 runs, so a dead job is noticed.
--                             Silent on healthy Tuesday–Sunday.
--   pg_cron job 'fabhub-billing-health' at 23:50 UTC = 7:50 AM Asia/Manila.
--
-- Read-only on business tables. Messages are plain text (no parse_mode), so
-- client names with & or < can't break them.
-- Enables pg_cron and pg_net. Note: Supabase's own admin role owns net.* and
-- grants it to PUBLIC; our role cannot revoke that (tested 2026-10-20 — a
-- REVOKE here is a silent no-op). The app still can't reach net.*: it talks to
-- the DB only through PostgREST, which serves only the "Exposed schemas" in
-- Supabase → Settings → API (public); pg_graphql is not installed. Never add
-- "net" to Exposed schemas.
-- No DROP statements (apply_migration hangs on them — CLAUDE.md).
-- ============================================================================

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net  with schema extensions;

-- ── Run log (who/what/when the check found) ──────────────────────────────────
create table if not exists public.billing_health_log (
  id        bigserial primary key,
  ran_at    timestamptz not null default now(),
  ok        boolean not null,
  triggers  int,
  drift     int,
  details   jsonb,
  notified  boolean not null default false
);
alter table public.billing_health_log enable row level security;
do $do$
begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'billing_health_log'
                    and policyname = 'billing_health_log_sel') then
    create policy billing_health_log_sel on public.billing_health_log
      for select to authenticated using (public.is_mgr());
  end if;
end
$do$;
-- No INSERT/UPDATE/DELETE policies: only billing_health_alert() writes.
revoke all on public.billing_health_log from public, anon;
grant select on public.billing_health_log to authenticated;

-- ── The check ────────────────────────────────────────────────────────────────
create or replace function public.billing_health_check()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_trig  int;
  v_drift jsonb;
  v_count int;
begin
  select count(*) into v_trig
    from pg_trigger t
   where not t.tgisinternal and t.tgenabled = 'O'
     and ((t.tgname = 'trg_billing_totals_sync'
           and t.tgrelid in ('public.billing_milestones'::regclass, 'public.billing_payments'::regclass))
       or (t.tgname = 'trg_deals_protect_billing_totals'
           and t.tgrelid = 'public.deals'::regclass));

  with m as (
    select deal_id, round(sum(amount), 2) as inv
      from billing_milestones
     where coalesce(status, '') <> 'Cancelled'
     group by deal_id
  ), p as (
    select ms.deal_id, round(sum(bp.amount), 2) as paid
      from billing_payments bp
      join billing_milestones ms on ms.id = bp.milestone_id
     where coalesce(ms.status, '') <> 'Cancelled'
       and not coalesce(bp.bounced, false)
     group by ms.deal_id
  ), bad as (
    select d.ce_no, d.client,
           coalesce(d.invoiced, 0)    as invoiced,    coalesce(m.inv, 0)  as should_invoiced,
           coalesce(d.amount_paid, 0) as amount_paid, coalesce(p.paid, 0) as should_paid
      from deals d
      join (select distinct deal_id from billing_milestones) x on x.deal_id = d.id
      left join m on m.deal_id = d.id
      left join p on p.deal_id = d.id
     where abs(coalesce(d.invoiced, 0)    - coalesce(m.inv, 0))  >= 0.005
        or abs(coalesce(d.amount_paid, 0) - coalesce(p.paid, 0)) >= 0.005
  )
  select count(*), coalesce(jsonb_agg(to_jsonb(bad) order by ce_no), '[]'::jsonb)
    into v_count, v_drift
    from bad;

  return jsonb_build_object(
    'ok',       v_trig = 3 and v_count = 0,
    'triggers', v_trig,
    'drift',    v_count,
    'rows',     v_drift);
end
$fn$;
revoke execute on function public.billing_health_check() from public, anon, authenticated;

-- ── Run + log + Telegram ─────────────────────────────────────────────────────
create or replace function public.billing_health_alert()
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  r       jsonb;
  bot     jsonb;
  token   text;
  chat    text;
  msg     text;
  line    jsonb;
  n       int := 0;
  monday  boolean := extract(isodow from now() at time zone 'Asia/Manila') = 1;
  runs    int;
  bad     int;
begin
  begin
    r := public.billing_health_check();
  exception when others then
    r := jsonb_build_object('ok', false, 'error', sqlerrm);
  end;

  if r ? 'error' then
    msg := E'⚠️ FabHub billing health check could not run\n' || (r->>'error')
        || E'\nDeal totals are unverified today. Open a FabHub Claude session to investigate.';
  elsif not (r->>'ok')::boolean then
    msg := E'⚠️ FabHub billing totals problem';
    if (r->>'triggers')::int <> 3 then
      msg := msg || E'\n• Only ' || (r->>'triggers') || E' of 3 billing triggers are on. '
                 || 'Finance payments may not be updating deal totals (the ₱5.67M bug).';
    end if;
    if (r->>'drift')::int > 0 then
      msg := msg || E'\n• ' || (r->>'drift') || ' deal(s) show wrong invoiced/collected amounts:';
      for line in select * from jsonb_array_elements(r->'rows') loop
        n := n + 1;
        exit when n > 10;
        msg := msg || E'\n  ' || coalesce(line->>'ce_no', '?') || ' ' || coalesce(line->>'client', '')
                   || ': paid ₱' || to_char((line->>'amount_paid')::numeric, 'FM999,999,999,990.00')
                   || ' (should be ₱' || to_char((line->>'should_paid')::numeric, 'FM999,999,999,990.00') || ')'
                   || ', invoiced ₱' || to_char((line->>'invoiced')::numeric, 'FM999,999,999,990.00')
                   || ' (should be ₱' || to_char((line->>'should_invoiced')::numeric, 'FM999,999,999,990.00') || ')';
      end loop;
      if (r->>'drift')::int > 10 then
        msg := msg || E'\n  …and ' || ((r->>'drift')::int - 10) || ' more';
      end if;
    end if;
    msg := msg || E'\nOpen a FabHub Claude session to investigate. Nothing was changed.';
  elsif monday then
    select count(*), count(*) filter (where not ok) into runs, bad
      from billing_health_log where ran_at > now() - interval '7 days';
    msg := E'✅ FabHub weekly billing check: all OK today (3 triggers, 0 drift). '
        || 'Past 7 days: ' || runs || ' run(s), ' || bad || ' with problems.';
  end if;

  if msg is not null then
    select value into bot from app_settings where key = 'botsettings';
    token := bot->>'token';
    chat  := bot->'chatIds'->>'management';
    if token is not null and chat is not null then
      perform net.http_post(
        url     := 'https://api.telegram.org/bot' || token || '/sendMessage',
        body    := jsonb_build_object('chat_id', chat, 'text', msg),
        headers := '{"Content-Type": "application/json"}'::jsonb);
    else
      r := r || jsonb_build_object('notify_error', 'botsettings token or management chat missing');
    end if;
  end if;

  insert into billing_health_log (ok, triggers, drift, details, notified)
  values (coalesce((r->>'ok')::boolean, false), (r->>'triggers')::int, (r->>'drift')::int,
          r || jsonb_build_object('message', msg),
          msg is not null and token is not null and chat is not null);

  return r || jsonb_build_object('message', msg);
end
$fn$;
revoke execute on function public.billing_health_alert() from public, anon, authenticated;

-- ── Schedule: 23:50 UTC = 07:50 Asia/Manila (pg_cron runs in UTC) ────────────
select cron.schedule('fabhub-billing-health', '50 23 * * *', $$select public.billing_health_alert()$$);

-- ROLLBACK (run in the Supabase SQL editor; MCP hangs on DROP):
-- select cron.unschedule('fabhub-billing-health');
-- drop function if exists public.billing_health_alert();
-- drop function if exists public.billing_health_check();
-- drop table if exists public.billing_health_log;
-- (pg_cron / pg_net can stay installed; drop extension pg_net; drop extension pg_cron; to remove.)
