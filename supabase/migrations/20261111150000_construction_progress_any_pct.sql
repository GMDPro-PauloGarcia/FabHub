-- Construction projects report progress as any whole %, not 30/60/90/100.
-- Decided with Paulo 2026-11-11.
--
-- set_project_progress(deal_id, pct) (migration 20261107020000) accepted only
-- 30, 60, 90 or 100. Construction projects (deals.ce_type 'Construction' or
-- 'Retail Fit-Out') now accept any whole number 0..100, so the PM can record
-- current site conditions; every other project keeps 30 / 60 / 90 / 100.
-- Who may set it, the who/when stamp and the audit_log row are unchanged.
--
-- Mirrors CONSTRUCTION_CE_TYPES / isConstructionDeal in
-- src/core.js, used by Project Cards (src/App.jsx) and the Progress page
-- (src/views/ProjectProgress.jsx). Keep them in sync. Idempotent.

create or replace function public.set_project_progress(p_deal uuid, p_pct integer)
returns timestamptz language plpgsql security definer set search_path = pg_catalog, public as $$
declare me record; c public.project_cards; t timestamptz := now(); v_construction boolean;
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
  select name into me from public.user_profiles where username = public.app_username();
  if not (public.has_role('Manager','Operations','ProjectMover')
          or (public.has_role('Coordinator') and p_deal in (select public.coordinator_deal_ids()))) then
    raise exception 'Only the PM, the coordinator of this project, Operations or a Manager sets progress' using errcode = '42501';
  end if;
  select * into c from public.project_cards where deal_id = p_deal for update;
  if not found then raise exception 'No project card for this project' using errcode = 'P0002'; end if;
  update public.project_cards
     set manual_progress = p_pct, progress_set_by = coalesce(me.name, public.app_username()), progress_set_at = t, updated_at = t
   where deal_id = p_deal;
  insert into public.audit_log(table_name, record_id, action, snapshot, old_snapshot, reason, performed_by, performed_at, changed_fields)
  values ('project_cards', p_deal::text, 'progress', jsonb_build_object('manual_progress', p_pct),
          jsonb_build_object('manual_progress', c.manual_progress), null, coalesce(me.name, public.app_username()), t, array['manual_progress']);
  return t;
end $$;

revoke execute on function public.set_project_progress(uuid, integer) from public, anon;
grant execute on function public.set_project_progress(uuid, integer) to authenticated;

-- ROLLBACK
--   Re-run section 2 of 20261107020000_qs_margins_read_and_project_progress.sql
--   (create or replace set_project_progress with the 30/60/90/100-only check).
--   Construction projects already at another % keep that value until changed.
