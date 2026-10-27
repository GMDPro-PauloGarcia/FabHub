-- Coordinator role (decided by Paulo, 2026-10-27).
--
-- Project coordinators only (1) post project updates and (2) request materials
-- (PRFs), and only on the projects they are assigned to — project_cards.
-- coordinator holds their name ("Angelo Nogra (Coordinator)"). They can't edit
-- project cards, change stages, or sign any PRF step; PMs and Cost Control
-- verify what they send.
--
-- * coordinator_deal_ids(): the deals (and their sub-projects) where the caller
--   is the named coordinator. Every Coordinator read below is scoped to it.
-- * deals: a Coordinator reads only their assigned deals (new policy; the
--   existing deals SELECT policy does not include the role).
-- * PRFs: a Coordinator reads and writes PRFs only on their assigned deals.
--   save_prf adds the role; prf_step_block already gives them no signing step.
-- * Updates go to activity_log, which any logged-in user may insert.
-- * set_deal_stage (20261027090000) and project_cards / projects / job_orders
--   writes do not include the role, so stages and cards stay read-only.
--
-- Mirrors src/App.jsx (role "Coordinator": nav, home, ProjectCards gates) and
-- src/views/PrfView.jsx (PRF_CREATOR_ROLES) — keep them in sync.
-- Idempotent; no DROP (Supabase MCP hangs on DROP).

create or replace function public.coordinator_deal_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  with me as (
    select coalesce(nullif(up.name,''), public.app_username()) as nm
      from (select 1) x
      left join public.user_profiles up on lower(up.username) = lower(public.app_username())
     limit 1
  ), mine as (
    select pc.deal_id from public.project_cards pc, me
     where public.has_role('Coordinator')
       and public.prf_norm_name(me.nm) <> ''
       and public.prf_norm_name(pc.coordinator) = public.prf_norm_name(me.nm)
  )
  select deal_id from mine
  union
  select d.id from public.deals d where d.parent_deal_id in (select deal_id from mine)
$$;
revoke execute on function public.coordinator_deal_ids() from public, anon;
grant  execute on function public.coordinator_deal_ids() to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='deals' and policyname='deals_sel_coordinator') then
    create policy deals_sel_coordinator on public.deals for select to authenticated
      using (public.has_role('Coordinator') and id in (select public.coordinator_deal_ids()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='prfs' and policyname='prfs_sel_coordinator') then
    create policy prfs_sel_coordinator on public.prfs for select to authenticated
      using (public.has_role('Coordinator') and deal_id in (select public.coordinator_deal_ids()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='prf_lines' and policyname='prf_lines_sel_coordinator') then
    create policy prf_lines_sel_coordinator on public.prf_lines for select to authenticated
      using (public.has_role('Coordinator') and prf_id in (select id from public.prfs));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='prf_events' and policyname='prf_events_sel_coordinator') then
    create policy prf_events_sel_coordinator on public.prf_events for select to authenticated
      using (public.has_role('Coordinator') and prf_id in (select id from public.prfs));
  end if;
end $$;

-- save_prf: same as 20261027120000, plus Coordinators on their own projects.
create or replace function public.save_prf(p_id uuid, p_prf jsonb, p_lines jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me record; v_id uuid; v_rev int; v_stage text; v_n int := 0; ln jsonb; r record;
begin
  if not public.has_role('Manager','ProjectMover','Coordinator') then
    raise exception 'Only PMs, coordinators and Managers write PRFs' using errcode = '42501';
  end if;
  select * into me from public.prf_me();
  select stage into v_stage from public.deals where id = nullif(p_prf->>'deal_id','')::uuid;
  if v_stage is null then
    raise exception 'Pick the project this PRF is for' using errcode = '22023';
  end if;
  if public.has_role('Coordinator')
     and not ((p_prf->>'deal_id')::uuid in (select public.coordinator_deal_ids())) then
    raise exception 'You can only request materials for projects you coordinate' using errcode = '42501';
  end if;
  if v_stage not in ('06 · Kickoff','07 · Briefing','08 · Fabrication','09 · Site & Billing',
                     '10 · Installation','11 · Punchlist','12 · Close-Out') then
    raise exception 'PRFs are only for awarded projects in production (this one is %)', v_stage using errcode = '22023';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Add at least one item' using errcode = '22023';
  end if;
  if jsonb_array_length(p_lines) > 100 then
    raise exception 'A PRF holds at most 100 items' using errcode = '22023';
  end if;
  if coalesce(p_prf->>'priority','Normal') not in ('Normal','High','Urgent') then
    raise exception 'Priority must be Normal, High or Urgent' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.prfs(deal_id, department, purpose, location, priority, required_date,
                            requested_by, requested_by_name)
    values ((p_prf->>'deal_id')::uuid, coalesce(nullif(p_prf->>'department',''),'Fabrication'),
            coalesce(p_prf->>'purpose',''), coalesce(p_prf->>'location',''),
            coalesce(nullif(p_prf->>'priority',''),'Normal'), nullif(p_prf->>'required_date','')::date,
            me.o_user, me.o_name)
    returning id, lines_rev into v_id, v_rev;
    perform public.prf_log(v_id, 'Created');
  else
    select * into r from public.prfs where id = p_id for update;
    if not found then raise exception 'PRF not found' using errcode = 'P0002'; end if;
    if lower(r.requested_by) <> lower(me.o_user) then
      raise exception 'Only the person who wrote this PRF can edit it' using errcode = '42501';
    end if;
    if r.status not in ('Draft','Rejected') then
      raise exception 'This PRF is % — it can only be edited while Draft or Rejected', r.status using errcode = '42501';
    end if;
    update public.prfs set
      deal_id = (p_prf->>'deal_id')::uuid,
      department = coalesce(nullif(p_prf->>'department',''),'Fabrication'),
      purpose = coalesce(p_prf->>'purpose',''), location = coalesce(p_prf->>'location',''),
      priority = coalesce(nullif(p_prf->>'priority',''),'Normal'),
      required_date = nullif(p_prf->>'required_date','')::date,
      status = 'Draft', updated_at = now()
    where id = p_id;
    v_id := p_id; v_rev := r.lines_rev;
    perform public.prf_log(v_id, 'Edited');
  end if;
  v_rev := v_rev + 1;
  for ln in select * from jsonb_array_elements(p_lines) loop
    v_n := v_n + 1;
    if coalesce(btrim(ln->>'description'),'') = '' then
      raise exception 'Item % has no description', v_n using errcode = '22023';
    end if;
    if coalesce(nullif(ln->>'qty','')::numeric, 0) <= 0 then
      raise exception 'Item % (%) needs a quantity above 0', v_n, ln->>'description' using errcode = '22023';
    end if;
    if coalesce(btrim(ln->>'unit'),'') = '' then
      raise exception 'Item % (%) needs a unit', v_n, ln->>'description' using errcode = '22023';
    end if;
    insert into public.prf_lines(prf_id, rev, line_no, category, description, spec, brand, qty, unit, est_unit_cost, remarks)
    values (v_id, v_rev, v_n, coalesce(ln->>'category',''), btrim(ln->>'description'), coalesce(ln->>'spec',''),
            coalesce(ln->>'brand',''), (ln->>'qty')::numeric, btrim(ln->>'unit'),
            nullif(ln->>'est_unit_cost','')::numeric, coalesce(ln->>'remarks',''));
  end loop;
  update public.prfs set lines_rev = v_rev where id = v_id;
  return v_id;
end $$;

-- prf_price_hints: same as 20261027120000, plus Coordinators.
create or replace function public.prf_price_hints(p_q text)
returns table(item text, unit text, unit_price numeric, last_date date)
language sql stable security definer set search_path = public as $$
  select x.item, x.unit, x.unit_price, x.last_date from (
    select distinct on (lower(btrim(p.item)))
           btrim(p.item) as item, p.unit,
           coalesce(nullif(p.actual_cost,0), nullif(p.estimated_cost,0)) as unit_price,
           coalesce(p.po_date, p.created_at::date) as last_date
      from public.purchase_requests p
     where public.has_role('Manager','ProjectMover','Coordinator','QS','Procurement')
       and length(btrim(coalesce(p_q,''))) >= 3
       and p.item ilike '%' || btrim(p_q) || '%'
       and coalesce(nullif(p.actual_cost,0), nullif(p.estimated_cost,0)) is not null
       and coalesce(p.status,'') <> 'Cancelled'
     order by lower(btrim(p.item)), coalesce(p.po_date, p.created_at::date) desc
  ) x
  order by x.last_date desc
  limit 8
$$;

-- ROLLBACK
-- drop policy if exists prf_events_sel_coordinator on public.prf_events;
-- drop policy if exists prf_lines_sel_coordinator on public.prf_lines;
-- drop policy if exists prfs_sel_coordinator on public.prfs;
-- drop policy if exists deals_sel_coordinator on public.deals;
-- drop function if exists public.coordinator_deal_ids();
-- then re-apply save_prf / prf_price_hints from 20261027120000_prf_workflow.sql.
-- Users moved to the role: update user_profiles set role='ProjectMover' where role='Coordinator' (as a Manager).
