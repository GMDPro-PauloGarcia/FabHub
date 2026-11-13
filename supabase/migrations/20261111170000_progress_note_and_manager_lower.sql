-- Project progress: every change needs a note; only a Manager lowers it.
-- Decided with Paulo 2026-11-11.
--
-- 1. set_project_progress(deal, pct, note): the note (what happened, why the
--    % changed) is required. It is kept as the audit_log reason and posted to
--    the project's Team Updates (activity_log, action 'PM Update', detail
--    "[Progress] 45% → 60%: <note>"). Lowering the % below its current value
--    is Manager-only. Allowed values are unchanged (construction 0..100,
--    others 30/60/90/100; migration 20261111150000), and so are the roles.
-- 2. The two-argument set_project_progress(deal, pct) now refuses (no note),
--    so an old browser tab can't skip the note. Refresh fixes it.
-- 3. trg_project_cards_progress_guard: manual_progress / progress_set_by /
--    progress_set_at change only through set_project_progress. Any other
--    write (the app's full-row project card save, the old "Log Update" %
--    field) silently keeps the old values, so stale saves still work. Before
--    this, Manager, ProjectMover, Finance, Sales and SalesOpsAdmin could write
--    any % straight into project_cards with no audit. BEFORE INSERT fires on
--    upserts: an insert for a card that already exists returns early and the
--    UPDATE branch decides (see CLAUDE.md, "Upserts and triggers").
--
-- Mirrors: progress note prompt + Manager-only lowering in Project Cards
-- (src/App.jsx: setPctRpc, PmUpdateModal, setProjectProgress) and
-- src/views/ProjectProgress.jsx. Keep them in sync. Idempotent.

-- ── 1. set_project_progress with a note ──────────────────────────────────────
create or replace function public.set_project_progress(p_deal uuid, p_pct integer, p_note text)
returns timestamptz language plpgsql security definer set search_path = pg_catalog, public as $$
declare me record; c public.project_cards; t timestamptz := now(); v_construction boolean;
        v_note text := btrim(coalesce(p_note, '')); v_by text;
begin
  select coalesce(d.ce_type, '') in ('Construction', 'Retail Fit-Out') into v_construction
    from public.deals d where d.id = p_deal;
  if p_pct is null then
    raise exception 'Progress is required' using errcode = '22023';
  end if;
  if coalesce(v_construction, false) then
    if p_pct < 0 or p_pct > 100 then
      raise exception 'Progress is a whole number from 0 to 100 percent' using errcode = '22023';
    end if;
  elsif p_pct not in (30, 60, 90, 100) then
    raise exception 'Progress is 30, 60, 90 or 100 percent' using errcode = '22023';
  end if;
  if length(v_note) < 5 then
    raise exception 'Say what happened and why the progress changed' using errcode = '22023';
  end if;
  select name into me from public.user_profiles where username = public.app_username();
  if not (public.has_role('Manager','Operations','ProjectMover')
          or (public.has_role('Coordinator') and p_deal in (select public.coordinator_deal_ids()))) then
    raise exception 'Only the PM, the coordinator of this project, Operations or a Manager sets progress' using errcode = '42501';
  end if;
  select * into c from public.project_cards where deal_id = p_deal for update;
  if not found then raise exception 'No project card for this project' using errcode = 'P0002'; end if;
  if c.manual_progress is not null and p_pct < c.manual_progress and not public.has_role('Manager') then
    raise exception 'Only a Manager can lower progress (it is now % percent)', c.manual_progress using errcode = '42501';
  end if;
  v_by := coalesce(me.name, public.app_username());
  perform set_config('fabhub.progress_rpc', 'on', true);
  update public.project_cards
     set manual_progress = p_pct, progress_set_by = v_by, progress_set_at = t, updated_at = t
   where deal_id = p_deal;
  perform set_config('fabhub.progress_rpc', '', true);
  insert into public.audit_log(table_name, record_id, action, snapshot, old_snapshot, reason, performed_by, performed_at, changed_fields)
  values ('project_cards', p_deal::text, 'progress', jsonb_build_object('manual_progress', p_pct),
          jsonb_build_object('manual_progress', c.manual_progress), v_note, v_by, t, array['manual_progress']);
  insert into public.activity_log(deal_id, action, detail, by, date, time)
  values (p_deal, 'PM Update',
          format('[Progress] %s → %s%%: %s', coalesce(c.manual_progress::text || '%', 'not set'), p_pct, v_note),
          v_by, (t at time zone 'Asia/Manila')::date, to_char(t at time zone 'Asia/Manila', 'HH12:MI AM'));
  return t;
end $$;

revoke execute on function public.set_project_progress(uuid, integer, text) from public, anon;
grant execute on function public.set_project_progress(uuid, integer, text) to authenticated;

-- ── 2. The old two-argument call refuses ─────────────────────────────────────
create or replace function public.set_project_progress(p_deal uuid, p_pct integer)
returns timestamptz language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  raise exception 'Progress now needs a note on what happened. Refresh FabHub and try again.' using errcode = '22023';
end $$;

revoke execute on function public.set_project_progress(uuid, integer) from public, anon;
grant execute on function public.set_project_progress(uuid, integer) to authenticated;

-- ── 3. Progress changes only through set_project_progress ───────────────────
create or replace function public.project_cards_progress_guard()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if coalesce(current_setting('fabhub.progress_rpc', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    -- Upsert of an existing card: the UPDATE branch below decides.
    if exists (select 1 from public.project_cards p where p.id = new.id or p.deal_id = new.deal_id) then
      return new;
    end if;
    new.manual_progress := null;
    new.progress_set_by := null;
    new.progress_set_at := null;
    return new;
  end if;
  new.manual_progress := old.manual_progress;
  new.progress_set_by := old.progress_set_by;
  new.progress_set_at := old.progress_set_at;
  return new;
end $$;

revoke execute on function public.project_cards_progress_guard() from public, anon, authenticated;

create or replace trigger trg_project_cards_progress_guard
  before insert or update on public.project_cards
  for each row execute function public.project_cards_progress_guard();

-- ROLLBACK
--   drop trigger if exists trg_project_cards_progress_guard on public.project_cards;
--   drop function if exists public.project_cards_progress_guard();
--   drop function if exists public.set_project_progress(uuid, integer, text);
--   Re-run 20261111150000_construction_progress_any_pct.sql (two-argument
--   set_project_progress without a note).
--   (Run these from the Supabase SQL editor: the MCP tools hang on DROP.)
