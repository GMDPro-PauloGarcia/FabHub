-- Project card team / dates / site through one audited RPC (Project HQ audit, 2026-11-21).
--
-- Before this:
--  * The Project HQ showed Team, Dates & Site and the turnover (TAT) editor to
--    roles that project_cards_upd does not admit (QS; Operations; Coordinators
--    through the Log Update "revised turnover date"). Their save was refused by
--    RLS after the screen had already said "saved" and Telegram had gone out.
--  * Location went to deals with a swallowed error; deals_upd does not admit
--    Operations / ProjectMover, so it was lost on reload.
--  * The turnover date (mall handover / store opening) could be moved by anyone
--    with access, with no reason and no record of the original date, so an
--    overdue project turned green by editing a date.
--
-- After this:
--  1. project_cards.original_target_end_date: the first turnover date ever set
--     (the baseline). Backfilled from today's date; never changes afterwards.
--  2. set_project_card_fields(deal, fields jsonb, reason): the only save path the
--     app uses for team, award date, turnover date, TAT category and location.
--       - team (ae_assigned, pm1-3, designer, coordinator, warehouse_only):
--         Manager, ProjectMover, Operations, SalesOpsAdmin;
--       - award_date, target_end_date, tat_category, location: those plus QS;
--         a Coordinator may move the turnover date of their own project only;
--       - moving a turnover date that was already set needs a reason (10+
--         characters); it is kept in audit_log (action 'turnover_change'),
--         posted to Team Updates and sent to the management and ops Telegram.
--     CE Type is NOT here: it stays with the deal editors (deals_upd), because it
--     decides the progress rule (construction = any %).
--  3. trg_project_cards_turnover_audit: any other write that moves the turnover
--     date (older devices, the Award flow) still saves, but is logged to
--     audit_log as 'turnover_change' with reason 'direct save (no reason)', and
--     the baseline is kept.

-- 1. Baseline column ---------------------------------------------------------
alter table public.project_cards add column if not exists original_target_end_date date;

-- 2. Trigger: keep the baseline, log turnover moves that bypass the RPC --------
create or replace function public.project_cards_turnover_audit()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_by text;
begin
  if tg_op = 'INSERT' then
    new.original_target_end_date := coalesce(new.original_target_end_date, new.target_end_date);
    return new;
  end if;
  -- The baseline never changes once set (first set = old date, or the new one).
  new.original_target_end_date := coalesce(old.original_target_end_date, old.target_end_date, new.target_end_date);
  if new.target_end_date is distinct from old.target_end_date
     and coalesce(current_setting('fabhub.card_rpc', true), '') <> 'on'
     and old.target_end_date is not null then
    select name into v_by from public.user_profiles where username = public.app_username();
    insert into public.audit_log(table_name, record_id, action, snapshot, old_snapshot, reason, performed_by, performed_at, changed_fields)
    values ('project_cards', new.deal_id::text, 'turnover_change',
            jsonb_build_object('target_end_date', new.target_end_date, 'original_target_end_date', new.original_target_end_date, 'via', 'direct'),
            jsonb_build_object('target_end_date', old.target_end_date),
            'direct save (no reason)', coalesce(v_by, public.app_username(), current_user), now(), array['target_end_date']);
  end if;
  return new;
end $$;
revoke execute on function public.project_cards_turnover_audit() from public, anon, authenticated;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_project_cards_turnover_audit' and tgrelid = 'public.project_cards'::regclass) then
    create trigger trg_project_cards_turnover_audit before insert or update on public.project_cards
      for each row execute function public.project_cards_turnover_audit();
  end if;
end $$;

-- Backfill the baseline with today's turnover dates (fires the trigger with the
-- date unchanged: nothing logged).
update public.project_cards set original_target_end_date = target_end_date
 where original_target_end_date is null and target_end_date is not null;

-- 3. The RPC -------------------------------------------------------------------
create or replace function public.set_project_card_fields(p_deal uuid, p_fields jsonb, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  d record; c public.project_cards; v_by text; t timestamptz := now();
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_team_keys text[] := array['ae_assigned','pm1','pm2','pm3','designer','coordinator','warehouse_only'];
  v_date_keys text[] := array['award_date','target_end_date','tat_category','location'];
  v_keys text[]; k text; v_reason text := btrim(coalesce(p_reason, ''));
  v_award date; v_end date; v_moved boolean := false; v_days int; v_msg text; v_card_id uuid;
  v_is_coord boolean; v_old_end date;
begin
  select id, coalesce(nullif(contact, ''), client) as name, client, ce_no, value
    into d from public.deals where id = p_deal;
  if not found then raise exception 'Project not found' using errcode = 'P0002'; end if;
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then
    raise exception 'Nothing to save' using errcode = '22023';
  end if;
  select array_agg(x) into v_keys from jsonb_object_keys(p_fields) x where x <> 'card_id';
  if v_keys is null then raise exception 'Nothing to save' using errcode = '22023'; end if;

  foreach k in array v_keys loop
    if not (k = any(v_team_keys) or k = any(v_date_keys)) then
      raise exception 'Field % cannot be saved here', k using errcode = '22023';
    end if;
  end loop;

  v_is_coord := public.has_role('Coordinator') and p_deal in (select public.coordinator_deal_ids());
  if v_keys && v_team_keys and not public.has_role('Manager','ProjectMover','Operations','SalesOpsAdmin') then
    raise exception 'Only a Manager, a PM, Operations or SalesOpsAdmin changes the project team' using errcode = '42501';
  end if;
  if v_keys && v_date_keys and not public.has_role('Manager','ProjectMover','Operations','SalesOpsAdmin','QS') then
    -- A Coordinator may revise the turnover date of their own project, nothing else.
    if not (v_is_coord and v_keys <@ array['target_end_date']) then
      raise exception 'Only a Manager, a PM, Operations, QS or SalesOpsAdmin changes the project dates or site' using errcode = '42501';
    end if;
  end if;

  select name into v_by from public.user_profiles where username = public.app_username();
  v_by := coalesce(v_by, public.app_username());

  select * into c from public.project_cards where deal_id = p_deal for update;
  if not found then
    begin v_card_id := nullif(p_fields->>'card_id', '')::uuid; exception when others then v_card_id := null; end;
    insert into public.project_cards(id, deal_id, client, ce_no, value, created_at, updated_at)
    values (coalesce(v_card_id, gen_random_uuid()), p_deal, d.client, d.ce_no, d.value, t, t)
    returning * into c;
  end if;

  begin
    v_award := case when p_fields ? 'award_date' then nullif(p_fields->>'award_date', '')::date else c.award_date end;
    v_end   := case when p_fields ? 'target_end_date' then nullif(p_fields->>'target_end_date', '')::date else c.target_end_date end;
  exception when others then
    raise exception 'Dates must be valid (YYYY-MM-DD)' using errcode = '22023';
  end;
  if p_fields ? 'target_end_date' and v_end is null and c.target_end_date is not null then
    raise exception 'A turnover date can be moved, not cleared' using errcode = '22023';
  end if;
  if v_award is not null and v_end is not null and v_end < v_award then
    raise exception 'The turnover date is before the award date' using errcode = '22023';
  end if;
  v_old_end := c.target_end_date;
  v_moved := c.target_end_date is not null and v_end is distinct from c.target_end_date;
  if v_moved and length(v_reason) < 10 then
    raise exception 'Say why the turnover date is moving (it is now %)', to_char(c.target_end_date, 'YYYY-MM-DD') using errcode = '22023';
  end if;
  v_days := case when v_award is not null and v_end is not null then greatest(1, v_end - v_award) else c.target_days end;

  perform set_config('fabhub.card_rpc', 'on', true);
  update public.project_cards set
    ae_assigned    = case when p_fields ? 'ae_assigned' then nullif(btrim(p_fields->>'ae_assigned'), '') else ae_assigned end,
    pm1            = case when p_fields ? 'pm1' then nullif(btrim(p_fields->>'pm1'), '') else pm1 end,
    pm2            = case when p_fields ? 'pm2' then nullif(btrim(p_fields->>'pm2'), '') else pm2 end,
    pm3            = case when p_fields ? 'pm3' then nullif(btrim(p_fields->>'pm3'), '') else pm3 end,
    designer       = case when p_fields ? 'designer' then nullif(btrim(p_fields->>'designer'), '') else designer end,
    coordinator    = case when p_fields ? 'coordinator' then nullif(btrim(p_fields->>'coordinator'), '') else coordinator end,
    warehouse_only = case when p_fields ? 'warehouse_only' then coalesce((p_fields->>'warehouse_only')::boolean, false) else warehouse_only end,
    award_date     = v_award,
    target_end_date= v_end,
    target_days    = v_days,
    tat_category   = case when p_fields ? 'tat_category' then nullif(p_fields->>'tat_category', '') else tat_category end,
    tat_set_by     = case when v_end is distinct from c.target_end_date then v_by else tat_set_by end,
    tat_set_at     = case when v_end is distinct from c.target_end_date then t else tat_set_at end,
    updated_at     = t
  where deal_id = p_deal
  returning * into c;
  perform set_config('fabhub.card_rpc', '', true);

  if p_fields ? 'location' then
    update public.deals set location = coalesce(btrim(p_fields->>'location'), ''), updated_at = t where id = p_deal;
  end if;

  if v_moved then
    insert into public.audit_log(table_name, record_id, action, snapshot, old_snapshot, reason, performed_by, performed_at, changed_fields)
    values ('project_cards', p_deal::text, 'turnover_change',
            jsonb_build_object('target_end_date', v_end, 'original_target_end_date', c.original_target_end_date, 'via', 'rpc'),
            jsonb_build_object('target_end_date', v_old_end),
            v_reason, v_by, t, array['target_end_date']);
    insert into public.activity_log(deal_id, action, detail, by, date, time)
    values (p_deal, 'PM Update',
            format(E'[Turnover moved] → %s (baseline %s)\nWhy: %s', to_char(v_end, 'YYYY-MM-DD'),
                   coalesce(to_char(c.original_target_end_date, 'YYYY-MM-DD'), '—'), v_reason),
            v_by, v_today, to_char(t at time zone 'Asia/Manila', 'HH12:MI AM'));
    begin
      v_msg := format(E'📅 <b>Turnover date moved</b>\n<b>%s</b>%s\nNew: <b>%s</b> · Baseline: %s\nWhy: %s\nBy: %s',
        replace(replace(replace(coalesce(d.name, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'),
        case when coalesce(d.ce_no, '') <> '' then ' · ' || d.ce_no else '' end,
        to_char(v_end, 'Mon DD, YYYY'),
        coalesce(to_char(c.original_target_end_date, 'Mon DD, YYYY'), '—'),
        replace(replace(replace(v_reason, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'),
        replace(replace(replace(v_by, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'));
      perform public.send_telegram('management', left(v_msg, 4000), null);
      perform public.send_telegram('ops', left(v_msg, 4000), null);
    exception when others then null;
    end;
  end if;

  return to_jsonb(c);
end $$;

revoke execute on function public.set_project_card_fields(uuid, jsonb, text) from public, anon;
grant execute on function public.set_project_card_fields(uuid, jsonb, text) to authenticated;

-- ROLLBACK (from the Supabase SQL editor; the MCP tools hang on DROP):
--   drop trigger if exists trg_project_cards_turnover_audit on public.project_cards;
--   drop function if exists public.project_cards_turnover_audit();
--   drop function if exists public.set_project_card_fields(uuid, jsonb, text);
--   alter table public.project_cards drop column if exists original_target_end_date;
--   (the app then falls back to nothing: revert the app PR first.)
