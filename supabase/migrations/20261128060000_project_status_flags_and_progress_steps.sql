-- Project status flags + Operations' progress steps (Paulo, 2026-11-28).
--
-- Operations keep their own tracker (GMD_Project_Tracker.xlsx) with a Status
-- column FabHub had no place for (ON HOLD, BACK JOB / PUNCH LISTING,
-- ADDITIONAL WORKS, FOR PULL-OUT / EGRESS) and finer % steps. Before PMs move
-- to FabHub, FabHub needs both.
--
-- 1. project_statuses: the list of flags a project can carry on top of its
--    stage. Managers add statuses from the app (add_project_status, logged to
--    audit_log 'project_status_add') and hide them (set_project_status_active);
--    nothing is deleted. `pauses_health` = the project isn't judged late while
--    it carries the flag (On hold). Read by every logged-in role. No client
--    writes (no insert / update / delete policies).
-- 2. project_cards.site_status / _note / _by / _at, set only through
--    set_project_status(deal, status, note): Manager, Operations,
--    ProjectMover, or the Coordinator of the project. A note (10+ chars) is
--    required to set a flag; clearing needs none. audit_log 'project_status',
--    Team Updates (activity_log), Telegram to Operations (never blocks).
--    trg_project_cards_status_guard keeps these columns on any other write
--    (silently, so stale full-row card saves still work; an upsert's INSERT
--    branch for an existing card returns early, see CLAUDE.md).
-- 3. Progress steps for non-construction projects: 10, 30, 60, 80, 90, 100
--    (was 30, 60, 90, 100). Meaning (src/core.js PROGRESS_STEPS): 10 briefing
--    done, 30 carcass, 60 electrical & specialty, 80 painting / finishing,
--    90 installed: punchlist starts and progress billing stops (Paulo:
--    "we can do progress bill until 90% and we can start with punchlisting"),
--    100 turned over / COC signed. Construction keeps any whole % 0–100.
--    Only the step check inside set_project_progress(uuid, int, jsonb)
--    changes; it is patched in place so the rest of the function stays as
--    applied by 20261111190000.
--
-- App mirrors: PROGRESS_STEPS / progressStepLabel / FAB_PROGRESS_STEPS
-- (src/core.js), ProgressReportModal, ProjectProgress, ManagerHome, the
-- Progress tab and the status picker in ProjectCards (src/App.jsx),
-- setProjectStatus / addProjectStatus. Keep them in sync. Idempotent.

-- ── 1. project_statuses ─────────────────────────────────────────────────────
create table if not exists public.project_statuses (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  color         text not null default '#64748b',
  pauses_health boolean not null default false,
  is_active     boolean not null default true,
  sort          integer not null default 100,
  created_by    text,
  created_at    timestamptz not null default now()
);
create unique index if not exists project_statuses_name_key on public.project_statuses (lower(btrim(name)));
alter table public.project_statuses enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'project_statuses' and policyname = 'project_statuses_sel') then
    create policy project_statuses_sel on public.project_statuses for select to authenticated
      using (public.app_role() is not null);
  end if;
end $$;
revoke all on public.project_statuses from anon;
grant select on public.project_statuses to authenticated;

insert into public.project_statuses (name, color, pauses_health, sort, created_by)
select v.name, v.color, v.pauses, v.sort, 'Operations tracker 2026-11-28'
  from (values ('On hold', '#64748b', true, 10),
               ('Back job / Punchlisting', '#db2777', false, 20),
               ('Additional works', '#7c3aed', false, 30),
               ('For pull-out / Egress', '#0891b2', false, 40)) as v(name, color, pauses, sort)
 where not exists (select 1 from public.project_statuses s where lower(btrim(s.name)) = lower(v.name));

-- ── 2. project_cards status columns ─────────────────────────────────────────
alter table public.project_cards add column if not exists site_status text;
alter table public.project_cards add column if not exists site_status_note text;
alter table public.project_cards add column if not exists site_status_by text;
alter table public.project_cards add column if not exists site_status_at timestamptz;

create or replace function public.add_project_status(p_name text, p_color text default null, p_pauses_health boolean default false)
returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
        v_color text := coalesce(nullif(btrim(p_color), ''), '#64748b');
        v_by text; v_id uuid;
begin
  if not public.has_role('Manager') then
    raise exception 'Only a Manager adds a project status' using errcode = '42501';
  end if;
  if length(v_name) < 3 or length(v_name) > 40 then
    raise exception 'A status name is 3 to 40 characters' using errcode = '22023';
  end if;
  if v_color !~ '^#[0-9a-fA-F]{6}$' then v_color := '#64748b'; end if;
  if exists (select 1 from public.project_statuses where lower(btrim(name)) = lower(v_name)) then
    raise exception 'There is already a status called "%"', v_name using errcode = '23505';
  end if;
  select coalesce(name, public.app_username()) into v_by from public.user_profiles where username = public.app_username();
  v_by := coalesce(v_by, public.app_username());
  insert into public.project_statuses (name, color, pauses_health, sort, created_by)
  values (v_name, v_color, coalesce(p_pauses_health, false),
          coalesce((select max(sort) from public.project_statuses), 0) + 10, v_by)
  returning id into v_id;
  insert into public.audit_log(table_name, record_id, action, snapshot, reason, performed_by, performed_at)
  values ('project_statuses', v_id::text, 'project_status_add',
          jsonb_build_object('name', v_name, 'color', v_color, 'pauses_health', coalesce(p_pauses_health, false)),
          'New project status', v_by, now());
  return v_id;
end $$;

create or replace function public.set_project_status_active(p_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare s public.project_statuses; v_by text;
begin
  if not public.has_role('Manager') then
    raise exception 'Only a Manager changes the status list' using errcode = '42501';
  end if;
  select * into s from public.project_statuses where id = p_id for update;
  if not found then raise exception 'Status not found' using errcode = 'P0002'; end if;
  if s.is_active = coalesce(p_active, false) then return; end if;
  update public.project_statuses set is_active = coalesce(p_active, false) where id = p_id;
  select name into v_by from public.user_profiles where username = public.app_username();
  insert into public.audit_log(table_name, record_id, action, snapshot, old_snapshot, reason, performed_by, performed_at)
  values ('project_statuses', p_id::text, case when p_active then 'project_status_show' else 'project_status_hide' end,
          jsonb_build_object('name', s.name, 'is_active', coalesce(p_active, false)),
          jsonb_build_object('is_active', s.is_active), s.name, coalesce(v_by, public.app_username()), now());
end $$;

create or replace function public.set_project_status(p_deal uuid, p_status text, p_note text)
returns timestamptz language plpgsql security definer set search_path = pg_catalog, public as $$
declare c public.project_cards; d record; s public.project_statuses; t timestamptz := now();
        v_note text := btrim(coalesce(p_note, '')); v_status text := nullif(btrim(coalesce(p_status, '')), '');
        v_by text; v_today date := (now() at time zone 'Asia/Manila')::date; v_feed text; v_msg text;
begin
  if not (public.has_role('Manager','Operations','ProjectMover')
          or (public.has_role('Coordinator') and p_deal in (select public.coordinator_deal_ids()))) then
    raise exception 'Only the PM, the coordinator of this project, Operations or a Manager sets the project status' using errcode = '42501';
  end if;
  select id, coalesce(nullif(contact, ''), client) as name, ce_no into d from public.deals where id = p_deal;
  if not found then raise exception 'Project not found' using errcode = 'P0002'; end if;
  select * into c from public.project_cards where deal_id = p_deal for update;
  if not found then raise exception 'No project card for this project' using errcode = 'P0002'; end if;
  if v_status is not null then
    select * into s from public.project_statuses where lower(btrim(name)) = lower(v_status) and is_active;
    if not found then raise exception 'Unknown status "%"', v_status using errcode = '22023'; end if;
    v_status := s.name;
    if length(v_note) < 10 then
      raise exception 'Say why (at least 10 characters)' using errcode = '22023';
    end if;
  end if;
  if v_status is not distinct from c.site_status and v_note = coalesce(c.site_status_note, '') then
    return c.site_status_at;
  end if;

  select name into v_by from public.user_profiles where username = public.app_username();
  v_by := coalesce(v_by, public.app_username());
  perform set_config('fabhub.status_rpc', 'on', true);
  update public.project_cards
     set site_status = v_status,
         site_status_note = case when v_status is null then null else v_note end,
         site_status_by = case when v_status is null then null else v_by end,
         site_status_at = case when v_status is null then null else t end,
         updated_at = t
   where deal_id = p_deal;
  perform set_config('fabhub.status_rpc', '', true);

  insert into public.audit_log(table_name, record_id, action, snapshot, old_snapshot, reason, performed_by, performed_at, changed_fields)
  values ('project_cards', p_deal::text, 'project_status',
          jsonb_build_object('site_status', v_status, 'site_status_note', nullif(v_note, '')),
          jsonb_build_object('site_status', c.site_status, 'site_status_note', c.site_status_note),
          nullif(v_note, ''), v_by, t, array['site_status']);

  v_feed := case when v_status is null
                 then format('[Status] %s cleared%s', coalesce(c.site_status, '—'), case when v_note <> '' then ': ' || v_note else '' end)
                 else format('[Status] %s: %s', v_status, v_note) end;
  insert into public.activity_log(deal_id, action, detail, by, date, time)
  values (p_deal, 'PM Update', v_feed, v_by, v_today, to_char(t at time zone 'Asia/Manila', 'HH12:MI AM'));

  begin
    v_msg := format(E'🏷 <b>%s</b>\n<b>%s</b>%s\n%s\nBy: %s',
      case when v_status is null then 'Status cleared (' || coalesce(c.site_status, '—') || ')' else v_status end,
      replace(replace(replace(coalesce(d.name, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'),
      case when coalesce(d.ce_no, '') <> '' then ' · ' || d.ce_no else '' end,
      replace(replace(replace(v_note, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'),
      replace(replace(replace(v_by, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'));
    perform public.send_telegram('ops', left(v_msg, 4000), null);
  exception when others then
    null;
  end;
  return t;
end $$;

create or replace function public.project_cards_status_guard()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if coalesce(current_setting('fabhub.status_rpc', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    -- Upsert of an existing card: the UPDATE branch decides.
    if exists (select 1 from public.project_cards p where p.id = new.id or p.deal_id = new.deal_id) then
      return new;
    end if;
    new.site_status := null; new.site_status_note := null; new.site_status_by := null; new.site_status_at := null;
    return new;
  end if;
  new.site_status := old.site_status; new.site_status_note := old.site_status_note;
  new.site_status_by := old.site_status_by; new.site_status_at := old.site_status_at;
  return new;
end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_project_cards_status_guard' and tgrelid = 'public.project_cards'::regclass) then
    create trigger trg_project_cards_status_guard before insert or update on public.project_cards
      for each row execute function public.project_cards_status_guard();
  end if;
end $$;

revoke execute on function public.project_cards_status_guard() from public, anon, authenticated;
revoke execute on function public.add_project_status(text, text, boolean) from public, anon;
revoke execute on function public.set_project_status_active(uuid, boolean) from public, anon;
revoke execute on function public.set_project_status(uuid, text, text) from public, anon;
grant execute on function public.add_project_status(text, text, boolean) to authenticated;
grant execute on function public.set_project_status_active(uuid, boolean) to authenticated;
grant execute on function public.set_project_status(uuid, text, text) to authenticated;

-- ── 3. Progress steps 10 / 30 / 60 / 80 / 90 / 100 ──────────────────────────
do $$
declare v_def text := pg_get_functiondef('public.set_project_progress(uuid,integer,jsonb)'::regprocedure);
        v_old text := $o$  elsif p_pct not in (30, 60, 90, 100) then
    raise exception 'Progress is 30, 60, 90 or 100 percent' using errcode = '22023';$o$;
        v_new text := $n$  elsif p_pct not in (10, 30, 60, 80, 90, 100) then
    raise exception 'Progress is 10, 30, 60, 80, 90 or 100 percent' using errcode = '22023';$n$;
begin
  if position(v_new in v_def) > 0 then
    return;                                   -- already applied
  end if;
  if position(v_old in v_def) = 0 then
    raise exception 'set_project_progress is not the expected version; patch it by hand';
  end if;
  execute replace(v_def, v_old, v_new);
end $$;

-- ROLLBACK
-- Progress steps: run the do-block above with v_old / v_new swapped.
-- Status flags (data kept in audit_log):
--   drop trigger if exists trg_project_cards_status_guard on public.project_cards;
--   drop function if exists public.project_cards_status_guard();
--   drop function if exists public.set_project_status(uuid, text, text);
--   drop function if exists public.set_project_status_active(uuid, boolean);
--   drop function if exists public.add_project_status(text, text, boolean);
--   alter table public.project_cards drop column if exists site_status, drop column if exists site_status_note,
--     drop column if exists site_status_by, drop column if exists site_status_at;
--   drop table if exists public.project_statuses;
