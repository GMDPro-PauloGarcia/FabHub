-- set_deal_stage RPC: lets PMs move their projects through production stages.
--
-- deals_upd admits only Manager, Sales, SalesOpsAdmin and QS. The Projects
-- page showed the stage chips to ProjectMover/Operations (the PMs) too, so a
-- PM's stage change updated 0 rows: their screen showed the new stage, the
-- "Project Stage Updated" Telegram went out, and the stage reverted on the
-- next reload. This RPC lets PMs write ONLY deals.stage, without widening
-- deals_upd.
--
-- Rules (mirrors canSetDealStage in src/core.js — keep them in sync):
--   * Manager / Sales / SalesOpsAdmin / QS: any stage (same as deals_upd).
--   * ProjectMover / Operations: only between 06 · Kickoff and 12 · Close-Out,
--     and only on a deal already in one of those stages. Completed (which has
--     the app's financial gate) and reopening a Completed project stay with
--     the deal editors.
--   * Approved addendum children follow their parent's stage (same cascade as
--     the app did before).
--
-- Idempotent; no DROP (Supabase MCP hangs on DROP).

create or replace function public.set_deal_stage(p_deal_id uuid, p_stage text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pm_stages constant text[] := array['06 · Kickoff','07 · Briefing','08 · Fabrication',
    '09 · Site & Billing','10 · Installation','11 · Punchlist','12 · Close-Out'];
  v_old text;
  v_editor boolean := public.has_role('Manager', 'Sales', 'SalesOpsAdmin', 'QS');
begin
  if not (v_editor or public.has_role('ProjectMover', 'Operations')) then
    raise exception 'Not allowed to change a project stage' using errcode = '42501';
  end if;
  if p_stage is null or btrim(p_stage) = '' then
    raise exception 'Stage is required' using errcode = '22023';
  end if;

  select stage into v_old from public.deals where id = p_deal_id for update;
  if not found then
    raise exception 'Deal % not found', p_deal_id using errcode = 'P0002';
  end if;

  if not v_editor then
    if not (coalesce(v_old, '') = any(v_pm_stages)) then
      raise exception 'PMs can only change the stage of an awarded project (now: %)', coalesce(v_old, '—')
        using errcode = '42501';
    end if;
    if not (p_stage = any(v_pm_stages)) then
      raise exception 'PMs can move a project only up to Close-Out; a Manager or Sales marks it Completed'
        using errcode = '42501';
    end if;
  end if;

  if v_old is distinct from p_stage then
    update public.deals set stage = p_stage, updated_at = now() where id = p_deal_id;
  end if;

  update public.deals set stage = p_stage, updated_at = now()
   where parent_deal_id = p_deal_id
     and addendum_status = 'Approved'
     and coalesce(stage, '') not in ('Cancelled', 'Did Not Win')
     and stage is distinct from p_stage;
end;
$$;

revoke execute on function public.set_deal_stage(uuid, text) from public, anon;
grant  execute on function public.set_deal_stage(uuid, text) to authenticated;

-- ROLLBACK
-- drop function if exists public.set_deal_stage(uuid, text);
