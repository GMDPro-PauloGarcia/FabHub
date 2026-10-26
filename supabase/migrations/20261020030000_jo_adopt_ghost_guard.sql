-- Follow-up to 20261020020000_jo_project_code.sql.
--
-- When trg_job_orders_adopt_auto hands an auto-issued JO over to the Award
-- modal's JO, the row's id changes. A device that had already received the
-- auto JO over realtime keeps the old id as a "local-only" row and re-pushes
-- it on its next load, which failed on the unique jo_no. A JO insert carrying
-- a number this deal already has is that stale copy: skip it quietly.
--
-- Idempotent; no DROP (Supabase MCP hangs on DROP).

create or replace function public.job_orders_adopt_auto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auto    uuid;
  v_created timestamptz;
  v_parent  uuid;
begin
  if new.auto_issued or exists (select 1 from public.job_orders where id = new.id) then
    return new;  -- system-created, or an update of an existing row (upsert)
  end if;
  if coalesce(btrim(new.jo_no), '') <> ''
     and exists (select 1 from public.job_orders where jo_no = new.jo_no and deal_id = new.deal_id) then
    return null;  -- stale copy of a JO this deal already has
  end if;
  select id, case when backfilled_at is null then created_at end into v_auto, v_created from public.job_orders
   where deal_id = new.deal_id and auto_issued and coalesce(status, 'Active') <> 'Void'
   order by created_at limit 1;
  select parent_deal_id into v_parent from public.deals where id = new.deal_id;
  if v_auto is null then
    if coalesce(btrim(new.jo_no), '') = '' then
      new.jo_no := public.next_jo_no_for_deal(new.deal_id);  -- children get a suffix
    end if;
    return new;
  end if;
  -- An app that still pre-claims a number (before this release) announces it
  -- on Telegram; keep it when the auto JO is minutes old and nobody has used
  -- it yet. An established JO never changes number.
  update public.job_orders set
    jo_no = case when coalesce(btrim(new.jo_no), '') <> '' and v_parent is null
                      and v_created > now() - interval '5 minutes'
                 then new.jo_no else jo_no end,
    id = new.id, client = new.client, ce_no = new.ce_no, project_name = new.project_name, value = new.value,
    award_trigger = new.award_trigger, trigger_date = new.trigger_date, trigger_note = new.trigger_note,
    pm1 = new.pm1, pm2 = new.pm2, pm3 = new.pm3, coordinator = new.coordinator, ae_assigned = new.ae_assigned,
    start_date = new.start_date, comms_link = new.comms_link, scope_notes = new.scope_notes,
    special_instructions = new.special_instructions, budget_status = new.budget_status,
    status = coalesce(new.status, 'Active'), issued_by = new.issued_by, issued_date = new.issued_date,
    designer = new.designer, location = new.location, auto_issued = false
  where id = v_auto;
  return null;  -- the auto row (now carrying this id) replaces the insert
end;
$$;

revoke execute on function public.job_orders_adopt_auto() from public, anon, authenticated;

-- ROLLBACK: re-apply job_orders_adopt_auto() from 20261020020000_jo_project_code.sql.
