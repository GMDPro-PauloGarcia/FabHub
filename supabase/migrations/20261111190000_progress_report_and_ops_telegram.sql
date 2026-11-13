-- Project progress: a structured update on every change, and an Operations
-- Telegram message. Decided with Paulo 2026-11-11.
--
-- set_project_progress(deal, pct, report jsonb) replaces the free-text note
-- (migration 20261111170000). The report must have:
--   done       what was completed since the last update: 20+ characters,
--              4+ words, and not the same text as this project's last report
--   next       the next step: 10+ characters
--   next_date  when that next step is due: a date, today (Manila) or later
--   issues     issues / blockers, or 'None' (the app's "No issues" tick)
--   reason     only when lowering the %: why (10+ characters); lowering
--              stays Manager-only
-- Allowed values and roles are unchanged (construction 0..100, others
-- 30/60/90/100; PM / Operations / Manager, Coordinator on own projects).
-- The report is kept in audit_log (snapshot.report; reason = done) and posted
-- to Team Updates (activity_log 'PM Update'), and the server sends it to the
-- Operations Telegram chat (send_telegram 'ops'; a Telegram failure never
-- blocks the save).
-- The text-note version set_project_progress(deal, pct, note) now refuses, so
-- an old browser tab can't skip the report. Refresh fixes it.
-- The guard trigger from 20261111170000 is unchanged.
--
-- Mirrors src/views/ProgressReportModal.jsx (used by Project Cards and the
-- Progress page). Keep them in sync. Idempotent.

create or replace function public.set_project_progress(p_deal uuid, p_pct integer, p_report jsonb)
returns timestamptz language plpgsql security definer set search_path = pg_catalog, public as $$
declare me record; c public.project_cards; d record; t timestamptz := now(); v_construction boolean;
        v_by text; v_done text; v_next text; v_next_date date; v_issues text; v_reason text;
        v_last_done text; v_today date := (now() at time zone 'Asia/Manila')::date;
        v_old text; v_feed text; v_msg text;
begin
  select id, coalesce(nullif(contact, ''), client) as name, client, ce_no, coalesce(ce_type, '') in ('Construction', 'Retail Fit-Out') as constr
    into d from public.deals where id = p_deal;
  if not found then raise exception 'Project not found' using errcode = 'P0002'; end if;
  v_construction := d.constr;
  if p_pct is null then
    raise exception 'Progress is required' using errcode = '22023';
  end if;
  if v_construction then
    if p_pct < 0 or p_pct > 100 then
      raise exception 'Progress is a whole number from 0 to 100 percent' using errcode = '22023';
    end if;
  elsif p_pct not in (30, 60, 90, 100) then
    raise exception 'Progress is 30, 60, 90 or 100 percent' using errcode = '22023';
  end if;

  v_done   := btrim(coalesce(p_report->>'done', ''));
  v_next   := btrim(coalesce(p_report->>'next', ''));
  v_issues := btrim(coalesce(p_report->>'issues', ''));
  v_reason := btrim(coalesce(p_report->>'reason', ''));
  begin
    v_next_date := nullif(p_report->>'next_date', '')::date;
  exception when others then
    raise exception 'The next step needs a valid target date' using errcode = '22023';
  end;
  if length(v_done) < 20 or array_length(regexp_split_to_array(v_done, '\s+'), 1) < 4 then
    raise exception 'Describe the work completed since the last update (at least a full sentence)' using errcode = '22023';
  end if;
  if length(v_next) < 10 then
    raise exception 'Say what the next step is' using errcode = '22023';
  end if;
  if v_next_date is null or v_next_date < v_today then
    raise exception 'The next step needs a target date, today or later' using errcode = '22023';
  end if;
  if v_issues = '' then
    raise exception 'List any issues or blockers, or tick No issues' using errcode = '22023';
  end if;

  select name into me from public.user_profiles where username = public.app_username();
  if not (public.has_role('Manager','Operations','ProjectMover')
          or (public.has_role('Coordinator') and p_deal in (select public.coordinator_deal_ids()))) then
    raise exception 'Only the PM, the coordinator of this project, Operations or a Manager sets progress' using errcode = '42501';
  end if;
  select * into c from public.project_cards where deal_id = p_deal for update;
  if not found then raise exception 'No project card for this project' using errcode = 'P0002'; end if;
  if c.manual_progress is not null and p_pct < c.manual_progress then
    if not public.has_role('Manager') then
      raise exception 'Only a Manager can lower progress (it is now % percent)', c.manual_progress using errcode = '42501';
    end if;
    if length(v_reason) < 10 then
      raise exception 'Say why the progress is going down' using errcode = '22023';
    end if;
  end if;

  select snapshot->'report'->>'done' into v_last_done
    from public.audit_log
   where table_name = 'project_cards' and record_id = p_deal::text and action = 'progress'
   order by performed_at desc limit 1;
  if v_last_done is not null and lower(regexp_replace(v_last_done, '\s+', ' ', 'g')) = lower(regexp_replace(v_done, '\s+', ' ', 'g')) then
    raise exception 'This is the same as the last update. Describe what changed since then.' using errcode = '22023';
  end if;

  v_by := coalesce(me.name, public.app_username());
  perform set_config('fabhub.progress_rpc', 'on', true);
  update public.project_cards
     set manual_progress = p_pct, progress_set_by = v_by, progress_set_at = t, updated_at = t
   where deal_id = p_deal;
  perform set_config('fabhub.progress_rpc', '', true);

  v_old := coalesce(c.manual_progress::text || '%', 'not set');
  insert into public.audit_log(table_name, record_id, action, snapshot, old_snapshot, reason, performed_by, performed_at, changed_fields)
  values ('project_cards', p_deal::text, 'progress',
          jsonb_build_object('manual_progress', p_pct,
            'report', jsonb_build_object('done', v_done, 'next', v_next, 'next_date', v_next_date, 'issues', v_issues, 'reason', nullif(v_reason, ''))),
          jsonb_build_object('manual_progress', c.manual_progress), v_done, v_by, t, array['manual_progress']);

  v_feed := format(E'[Progress] %s → %s%%\nDone: %s\nNext: %s (by %s)\nIssues: %s%s',
                   v_old, p_pct, v_done, v_next, to_char(v_next_date, 'YYYY-MM-DD'), v_issues,
                   case when v_reason <> '' then E'\nWhy lower: ' || v_reason else '' end);
  insert into public.activity_log(deal_id, action, detail, by, date, time)
  values (p_deal, 'PM Update', v_feed, v_by, v_today, to_char(t at time zone 'Asia/Manila', 'HH12:MI AM'));

  -- Operations Telegram (HTML). Never blocks the save.
  begin
    v_msg := format(E'📊 <b>Progress %s → %s%%</b>\n<b>%s</b>%s\n✅ Done: %s\n➡️ Next: %s (by %s)\n⚠️ Issues: %s%s\nBy: %s',
      v_old, p_pct,
      replace(replace(replace(coalesce(d.name, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'),
      case when coalesce(d.ce_no, '') <> '' then ' · ' || d.ce_no else '' end,
      replace(replace(replace(v_done, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'),
      replace(replace(replace(v_next, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'),
      to_char(v_next_date, 'Mon DD'),
      replace(replace(replace(v_issues, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'),
      case when v_reason <> '' then E'\n⬇️ Why lower: ' || replace(replace(replace(v_reason, '&', '&amp;'), '<', '&lt;'), '>', '&gt;') else '' end,
      replace(replace(replace(v_by, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'));
    perform public.send_telegram('ops', left(v_msg, 4000), null);
  exception when others then
    null;
  end;
  return t;
end $$;

revoke execute on function public.set_project_progress(uuid, integer, jsonb) from public, anon;
grant execute on function public.set_project_progress(uuid, integer, jsonb) to authenticated;

-- The free-text note version refuses: the report is required now.
create or replace function public.set_project_progress(p_deal uuid, p_pct integer, p_note text)
returns timestamptz language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  raise exception 'Progress now needs the full update (work done, next step, issues). Refresh FabHub and try again.' using errcode = '22023';
end $$;

revoke execute on function public.set_project_progress(uuid, integer, text) from public, anon;
grant execute on function public.set_project_progress(uuid, integer, text) to authenticated;

-- ROLLBACK
--   Re-run section 1 of 20261111170000_progress_note_and_manager_lower.sql
--   (the text-note set_project_progress), then from the Supabase SQL editor
--   (the MCP tools hang on DROP):
--   drop function if exists public.set_project_progress(uuid, integer, jsonb);
