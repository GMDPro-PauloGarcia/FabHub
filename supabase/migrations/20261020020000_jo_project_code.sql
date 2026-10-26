-- JO number = the project code (owner decision, Paulo Garcia, 2026-10-20).
--
-- Rules
--   1. Every deal that enters an awarded stage gets a JO, whatever the route
--      (Award modal, stage change, import, change-order approval). Before
--      this, only the Award modal issued one: 170 of 243 awarded deals had none.
--   2. A child deal (parent_deal_id: change order, mother-PO sub-project)
--      gets its parent's JO plus a two-digit suffix: JO-0209-01, JO-0209-02.
--   3. An issued JO number is never changed. Children that already have their
--      own JO keep it.
--   4. All awarded deals without a JO are backfilled (backfilled_at is set,
--      trigger_note says so).
--   5. JO-0029 and JO-0030 (blank same-day duplicates on CE-2026-015 and
--      CE-2026-007, referenced nowhere) are Void. JO-0170 stays.
--
-- How the pieces fit
--   - ensure_deal_jo(deal, backfill): returns the deal's JO, creating one
--     (auto_issued = true) if the deal is awarded and has no non-Void JO.
--   - trg_deals_ensure_jo: calls it when a deal's stage or parent changes.
--   - trg_job_orders_adopt_auto: the Award modal saves the deal (which may
--     auto-create a JO) and then its own JO as separate requests. When the
--     modal's JO arrives for a deal that has an unclaimed auto JO, the modal's
--     details are written onto the auto row, which takes the modal's id, and
--     the insert is skipped. One JO, one number (the auto JO's: an issued
--     number never changes). confirmAward sends a blank jo_no and reads the
--     server's number back. Named to run before trg_job_orders_assign_no
--     (triggers fire in name order).
--   - The awarded-stage list mirrors WON_STAGES in src/core.js. Keep in sync.
--
-- Idempotent; no DROP (Supabase MCP hangs on DROP).

alter table public.job_orders add column if not exists auto_issued boolean not null default false;
alter table public.job_orders add column if not exists backfilled_at timestamptz;

create or replace function public.jo_awarded_stage(p_stage text)
returns boolean
language sql
immutable
as $$
  select p_stage = any (array['06 · Kickoff','07 · Briefing','08 · Fabrication','09 · Site & Billing',
                              '10 · Installation','11 · Punchlist','12 · Close-Out','14 · Completed']);
$$;

-- The deal's project-code JO: its earliest non-Void JO, plain numbers first.
create or replace function public.deal_base_jo(p_deal uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select jo_no from public.job_orders
   where deal_id = p_deal and coalesce(status, 'Active') <> 'Void'
   order by (jo_no ~ '^JO-\d+$') desc, created_at, jo_no
   limit 1;
$$;

-- The number a new JO for this deal should get: '' (let assign_doc_no give
-- the next plain JO-NNNN) for a standalone deal, or <parent JO>-NN for a child.
create or replace function public.next_jo_no_for_deal(p_deal uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent uuid;
  v_base   text;
  v_n      int;
begin
  select parent_deal_id into v_parent from public.deals where id = p_deal;
  if v_parent is null then
    return '';
  end if;
  v_base := public.ensure_deal_jo(v_parent, false);
  if v_base is null then
    return '';  -- parent not awarded: the child gets its own plain number
  end if;
  perform pg_advisory_xact_lock(hashtext('jo-suffix:' || v_base));
  select coalesce(max(substring(jo_no from length(v_base) + 2)::int), 0) + 1 into v_n
    from public.job_orders
   where jo_no ~ ('^' || v_base || '-\d{2,}$');
  return v_base || '-' || lpad(v_n::text, 2, '0');
end;
$$;

create or replace function public.ensure_deal_jo(p_deal uuid, p_backfill boolean default false)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  d       public.deals%rowtype;
  v_no    text;
  v_trig  text;
begin
  perform pg_advisory_xact_lock(hashtext('jo-deal:' || p_deal::text));
  v_no := public.deal_base_jo(p_deal);
  if v_no is not null then
    return v_no;
  end if;
  select * into d from public.deals where id = p_deal;
  if not found or not public.jo_awarded_stage(d.stage) then
    return null;
  end if;
  v_no   := public.next_jo_no_for_deal(p_deal);
  v_trig := d.award_request_data ->> 'triggerDate';
  insert into public.job_orders
    (deal_id, jo_no, client, ce_no, project_name, value, award_trigger, trigger_date, trigger_note,
     ae_assigned, location, status, issued_date, auto_issued, backfilled_at)
  values
    (d.id, v_no, d.client, d.ce_no, coalesce(nullif(d.contact, ''), d.client), coalesce(d.value, 0),
     coalesce(d.award_request_data ->> 'awardTrigger', ''),
     case when v_trig ~ '^\d{4}-\d{2}-\d{2}$' then v_trig::date end,
     case when p_backfill
          then 'Backfilled ' || to_char(now() at time zone 'Asia/Manila', 'YYYY-MM-DD') || ': no JO was issued at award'
          else 'Auto-issued when the deal moved to ' || d.stage end,
     coalesce(d.sales_owner, ''), coalesce(d.location, ''), 'Active',
     (now() at time zone 'Asia/Manila')::date, true,
     case when p_backfill then now() end)
  returning jo_no into v_no;
  return v_no;
end;
$$;

create or replace function public.deals_ensure_jo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.jo_awarded_stage(new.stage)
     and (tg_op = 'INSERT'
          or old.stage is distinct from new.stage
          or old.parent_deal_id is distinct from new.parent_deal_id) then
    perform public.ensure_deal_jo(new.id, false);
  end if;
  return new;
end;
$$;

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

revoke execute on function public.deal_base_jo(uuid) from public, anon, authenticated;
revoke execute on function public.next_jo_no_for_deal(uuid) from public, anon, authenticated;
revoke execute on function public.ensure_deal_jo(uuid, boolean) from public, anon, authenticated;
revoke execute on function public.deals_ensure_jo() from public, anon, authenticated;
revoke execute on function public.job_orders_adopt_auto() from public, anon, authenticated;

create or replace trigger trg_deals_ensure_jo
  after insert or update of stage, parent_deal_id on public.deals
  for each row execute function public.deals_ensure_jo();

create or replace trigger trg_job_orders_adopt_auto
  before insert on public.job_orders
  for each row execute function public.job_orders_adopt_auto();

-- Void the two blank duplicates (kept, never reused).
update public.job_orders
   set status = 'Void',
       trigger_note = trim(coalesce(trigger_note, '') || ' Void 2026-10-20: blank same-day duplicate of '
                      || case jo_no when 'JO-0029' then 'JO-0024' else 'JO-0022' end || '.')
 where jo_no in ('JO-0029', 'JO-0030') and coalesce(status, 'Active') <> 'Void';

-- Backfill: standalone deals first (oldest first), then children.
do $$
declare r record;
begin
  for r in
    select d.id from public.deals d
     where public.jo_awarded_stage(d.stage) and public.deal_base_jo(d.id) is null
     order by (d.parent_deal_id is not null), coalesce(d.date_acquired, d.created_at::date), d.created_at
  loop
    perform public.ensure_deal_jo(r.id, true);
  end loop;
end $$;

-- ROLLBACK (backfilled/auto JOs are marked; review before removing them)
-- drop trigger if exists trg_deals_ensure_jo on public.deals;
-- drop trigger if exists trg_job_orders_adopt_auto on public.job_orders;
-- drop function if exists public.deals_ensure_jo();
-- drop function if exists public.job_orders_adopt_auto();
-- drop function if exists public.ensure_deal_jo(uuid, boolean);
-- drop function if exists public.next_jo_no_for_deal(uuid);
-- drop function if exists public.deal_base_jo(uuid);
-- drop function if exists public.jo_awarded_stage(text);
-- update public.job_orders set status = 'Active' where jo_no in ('JO-0029','JO-0030');
-- Backfilled rows: select * from public.job_orders where backfilled_at is not null;
