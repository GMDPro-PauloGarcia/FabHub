-- Material budgets: what Procurement buys for a project (Paulo, 2026-11-22).
--
-- GMD split into Operations / design (Mar, Arrius) and back-end support (Paulo:
-- sales, finance, cost control, procurement, HR). Procurement now orders a
-- project's materials itself, from a material list Cost Control (QS) sets at
-- award; a PRF is only for a special item Operations asks for.
--
-- The deal's BOQ lists deliverables ("Metal Structure, 1 lot"), not materials,
-- so QS breaks each BOQ item into material lines (item, spec, qty, unit, est.
-- unit cost, need-by date). Flow, one budget per deal:
--   Draft (QS / Manager edit) → For PM Review (QS sends) → PM Confirmed (a PM of
--   the project, Operations or a Manager; never the preparer) → Locked (QS or a
--   Manager; a Manager may lock without the PM step, recorded).
--   PM may return it to Draft with a reason. A Locked budget changes only through
--   revise_material_budget (reason, new revision, audit_log, Telegram); ordering
--   keeps using the last locked revision (locked_rev) until the new one locks.
-- Lines carry a line_key that stays the same across revisions; a PO line points
-- to it (purchase_requests.mb_line_key), so ordered quantities carry over.
-- No enforcement here: phase 2 adds "PO line needs a budget line or a PRF line,
-- within the quantity" (prf_rule_on / po_line_prf_gap, now dormant).
--
-- Writes only through the RPCs (no insert/update/delete policies). Nothing is ever
-- deleted: a line QS takes out of a draft is flagged `removed`; readers skip those. Idempotent;
-- no DROP (Supabase MCP hangs on DROP).
-- App mirror: src/views/MaterialBudget.jsx (MB_* in src/core.js), the Order
-- Board's "From material budgets" list, mb_line_key in toSbPR. Keep in sync.

-- ── tables ───────────────────────────────────────────────────────────────────
create table if not exists public.material_budgets (
  deal_id         uuid primary key references public.deals(id) on delete cascade,
  rev             int  not null default 1,
  locked_rev      int,
  status          text not null default 'Draft',
  prepared_by     text not null default '',
  submitted_at    timestamptz,
  pm_confirmed_by text, pm_confirmed_at timestamptz, pm_note text not null default '',
  returned_by     text, returned_at timestamptz, return_reason text,
  locked_by       text, locked_at timestamptz, pm_skipped boolean not null default false,
  revise_reason   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint material_budgets_status_chk check (status in ('Draft','For PM Review','PM Confirmed','Locked'))
);

create table if not exists public.material_budget_lines (
  id            uuid primary key default gen_random_uuid(),
  deal_id       uuid not null references public.deals(id) on delete cascade,
  rev           int  not null,
  line_key      uuid not null,
  line_no       int  not null,
  boq_item_id   text not null default '',
  boq_item      text not null default '',
  category      text not null default 'Materials',
  item          text not null,
  spec          text not null default '',
  qty           numeric not null,
  unit          text not null,
  est_unit_cost numeric not null default 0,
  need_by       date,
  remarks       text not null default '',
  removed       boolean not null default false,
  created_at    timestamptz not null default now(),
  constraint mbl_qty_chk  check (qty > 0),
  constraint mbl_cost_chk check (est_unit_cost >= 0),
  constraint mbl_uniq unique (deal_id, rev, line_key)
);
create index if not exists mbl_deal_rev_idx on public.material_budget_lines(deal_id, rev);
create index if not exists mbl_key_idx on public.material_budget_lines(line_key);

alter table public.purchase_requests add column if not exists mb_line_key uuid;
create index if not exists purchase_requests_mb_line_key_idx on public.purchase_requests(mb_line_key);

alter table public.material_budgets      enable row level security;
alter table public.material_budget_lines enable row level security;

-- Readers: back-end (QS, Procurement, Finance), Operations / PMs / coordinators,
-- Warehouse and Managers. The JWT maps Operations to ProjectMover.
create or replace function public.mb_can_read()
returns boolean language sql stable security definer set search_path = pg_catalog, public as $$
  select public.has_role('Manager','QS','Procurement','ProcurementManager','ProjectMover','Operations',
                         'Coordinator','Finance','Accounting','FinanceAssistant','Warehouse')
$$;
-- The select policies call it as the logged-in user, so authenticated needs execute
-- (it only answers "may this role read budgets"; no data).
revoke execute on function public.mb_can_read() from public, anon;
grant  execute on function public.mb_can_read() to authenticated;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='material_budgets' and policyname='material_budgets_sel') then
    create policy material_budgets_sel on public.material_budgets for select to authenticated using (public.mb_can_read());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='material_budget_lines' and policyname='material_budget_lines_sel') then
    create policy material_budget_lines_sel on public.material_budget_lines for select to authenticated using (public.mb_can_read());
  end if;
end $$;
revoke all on public.material_budgets, public.material_budget_lines from anon;
revoke insert, update, delete, truncate on public.material_budgets, public.material_budget_lines from authenticated;

-- ── helpers ──────────────────────────────────────────────────────────────────
create or replace function public.mb_is_qs()
returns boolean language sql stable security definer set search_path = pg_catalog, public as $$
  select public.is_mgr() or (select o_role from public.prf_me()) = 'QS'
$$;
revoke execute on function public.mb_is_qs() from public, anon, authenticated;

create or replace function public.mb_deal_label(p_deal uuid)
returns text language sql stable security definer set search_path = pg_catalog, public as $$
  select coalesce(nullif(concat_ws(' · ', nullif(d.client,''), nullif(d.ce_no,'')), ''), 'a project')
    from public.deals d where d.id = p_deal
$$;
revoke execute on function public.mb_deal_label(uuid) from public, anon, authenticated;

create or replace function public.mb_esc(p text)
returns text language sql immutable set search_path = pg_catalog as $$
  select replace(replace(replace(coalesce(p, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;')
$$;
revoke execute on function public.mb_esc(text) from public, anon, authenticated;

create or replace function public.mb_notify(p_depts text[], p_msg text)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare d text;
begin
  foreach d in array p_depts loop
    begin perform public.send_telegram(d, left(p_msg, 4000), null);
    exception when others then null; end;
  end loop;
end $$;
revoke execute on function public.mb_notify(text[], text) from public, anon, authenticated;

-- ── save the draft (create or replace its lines) ─────────────────────────────
-- p_lines: [{line_key?, boq_item_id, boq_item, category, item, spec, qty, unit,
--            est_unit_cost, need_by, remarks}]
create or replace function public.save_material_budget(p_deal uuid, p_lines jsonb)
returns int language plpgsql security definer set search_path = pg_catalog, public as $$
declare me record; b public.material_budgets; v jsonb; n int := 0; v_qty numeric; v_cost numeric;
begin
  select * into me from public.prf_me();
  if not public.mb_is_qs() then
    raise exception 'Only Cost Control (QS) or a Manager prepares a material budget' using errcode = '42501';
  end if;
  if not exists (select 1 from public.deals where id = p_deal) then
    raise exception 'Project not found' using errcode = 'P0002';
  end if;
  if jsonb_typeof(coalesce(p_lines, 'null'::jsonb)) <> 'array' then
    raise exception 'Lines must be a list' using errcode = '22023';
  end if;
  select * into b from public.material_budgets where deal_id = p_deal for update;
  if not found then
    insert into public.material_budgets(deal_id, prepared_by) values (p_deal, coalesce(me.o_name, ''))
    returning * into b;
  elsif b.status <> 'Draft' then
    raise exception 'This budget is %: use Revise to change a locked budget', b.status using errcode = '42501';
  end if;
  -- Nothing is deleted: lines left out of this save are flagged removed (kept on record).
  update public.material_budget_lines set removed = true where deal_id = p_deal and rev = b.rev;
  for v in select * from jsonb_array_elements(p_lines) loop
    n := n + 1;
    if btrim(coalesce(v->>'item', '')) = '' then
      raise exception 'Line %: the material is required', n using errcode = '22023';
    end if;
    v_qty := nullif(v->>'qty', '')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Line % (%): quantity must be more than 0', n, v->>'item' using errcode = '22023';
    end if;
    if btrim(coalesce(v->>'unit', '')) = '' then
      raise exception 'Line % (%): the unit is required', n, v->>'item' using errcode = '22023';
    end if;
    v_cost := coalesce(nullif(v->>'est_unit_cost', '')::numeric, 0);
    if v_cost < 0 then
      raise exception 'Line % (%): the unit cost can''t be negative', n, v->>'item' using errcode = '22023';
    end if;
    insert into public.material_budget_lines(deal_id, rev, line_key, line_no, boq_item_id, boq_item, category,
                                             item, spec, qty, unit, est_unit_cost, need_by, remarks)
    values (p_deal, b.rev, coalesce(nullif(v->>'line_key', '')::uuid, gen_random_uuid()), n,
            left(coalesce(v->>'boq_item_id', ''), 100), left(coalesce(v->>'boq_item', ''), 300),
            left(coalesce(nullif(btrim(v->>'category'), ''), 'Materials'), 60),
            left(btrim(v->>'item'), 300), left(coalesce(v->>'spec', ''), 300), v_qty,
            left(btrim(v->>'unit'), 30), v_cost, nullif(v->>'need_by', '')::date, left(coalesce(v->>'remarks', ''), 500))
    on conflict (deal_id, rev, line_key) do update set
      line_no = excluded.line_no, boq_item_id = excluded.boq_item_id, boq_item = excluded.boq_item,
      category = excluded.category, item = excluded.item, spec = excluded.spec, qty = excluded.qty,
      unit = excluded.unit, est_unit_cost = excluded.est_unit_cost, need_by = excluded.need_by,
      remarks = excluded.remarks, removed = false;
  end loop;
  update public.material_budgets set prepared_by = coalesce(me.o_name, prepared_by), updated_at = now() where deal_id = p_deal;
  return n;
end $$;

-- ── send for PM review ───────────────────────────────────────────────────────
create or replace function public.submit_material_budget(p_deal uuid)
returns text language plpgsql security definer set search_path = pg_catalog, public as $$
declare me record; b public.material_budgets; v_n int; v_tot numeric;
begin
  select * into me from public.prf_me();
  if not public.mb_is_qs() then
    raise exception 'Only Cost Control (QS) or a Manager sends a budget for review' using errcode = '42501';
  end if;
  select * into b from public.material_budgets where deal_id = p_deal for update;
  if not found or b.status <> 'Draft' then
    raise exception 'Only a Draft budget can be sent for review' using errcode = '42501';
  end if;
  select count(*), coalesce(sum(qty * est_unit_cost), 0) into v_n, v_tot
    from public.material_budget_lines where deal_id = p_deal and rev = b.rev and not removed;
  if v_n = 0 then raise exception 'Add at least one material line first' using errcode = '22023'; end if;
  update public.material_budgets set status = 'For PM Review', submitted_at = now(),
         prepared_by = coalesce(me.o_name, prepared_by), returned_by = null, returned_at = null, return_reason = null,
         pm_confirmed_by = null, pm_confirmed_at = null, pm_note = '', updated_at = now()
   where deal_id = p_deal;
  perform public.mb_notify(array['ops'], format(E'📋 <b>Material budget for PM review</b>\n%s · rev %s · %s lines · about ₱%s\nPrepared by %s. PM: check it is complete, then Confirm (FabHub › Material Budget).',
    public.mb_esc(public.mb_deal_label(p_deal)), b.rev, v_n, to_char(round(v_tot), 'FM999,999,999,990'), public.mb_esc(me.o_name)));
  return 'For PM Review';
end $$;

-- ── PM confirms the list is complete ─────────────────────────────────────────
create or replace function public.confirm_material_budget(p_deal uuid, p_note text default '')
returns text language plpgsql security definer set search_path = pg_catalog, public as $$
declare me record; b public.material_budgets;
begin
  select * into me from public.prf_me();
  select * into b from public.material_budgets where deal_id = p_deal for update;
  if not found or b.status <> 'For PM Review' then
    raise exception 'This budget is not waiting for PM review' using errcode = '42501';
  end if;
  if not (me.o_role in ('Manager','Operations') or public.prf_is_project_pm(p_deal, me.o_name)) then
    raise exception 'Only a PM of this project, Operations or a Manager confirms the material list' using errcode = '42501';
  end if;
  if public.prf_norm_name(me.o_name) = public.prf_norm_name(b.prepared_by) then
    raise exception 'You prepared this budget: another person confirms it' using errcode = '42501';
  end if;
  update public.material_budgets set status = 'PM Confirmed', pm_confirmed_by = me.o_name, pm_confirmed_at = now(),
         pm_note = left(coalesce(p_note, ''), 500), updated_at = now()
   where deal_id = p_deal;
  return 'PM Confirmed';
end $$;

-- ── PM sends it back ─────────────────────────────────────────────────────────
create or replace function public.return_material_budget(p_deal uuid, p_reason text)
returns text language plpgsql security definer set search_path = pg_catalog, public as $$
declare me record; b public.material_budgets; v_reason text := btrim(coalesce(p_reason, ''));
begin
  select * into me from public.prf_me();
  if length(v_reason) < 10 then
    raise exception 'Say what is missing or wrong (at least 10 characters)' using errcode = '22023';
  end if;
  select * into b from public.material_budgets where deal_id = p_deal for update;
  if not found or b.status not in ('For PM Review', 'PM Confirmed') then
    raise exception 'Only a budget under review can be sent back' using errcode = '42501';
  end if;
  if not (me.o_role in ('Manager','Operations','QS') or public.prf_is_project_pm(p_deal, me.o_name)) then
    raise exception 'Only a PM of this project, Operations, Cost Control or a Manager sends a budget back' using errcode = '42501';
  end if;
  update public.material_budgets set status = 'Draft', returned_by = me.o_name, returned_at = now(),
         return_reason = left(v_reason, 500), pm_confirmed_by = null, pm_confirmed_at = null, updated_at = now()
   where deal_id = p_deal;
  perform public.mb_notify(array['financialcontrol'], format(E'↩️ <b>Material budget sent back</b>\n%s · rev %s\nBy %s: %s',
    public.mb_esc(public.mb_deal_label(p_deal)), b.rev, public.mb_esc(me.o_name), public.mb_esc(v_reason)));
  return 'Draft';
end $$;

-- ── QS locks it ("set in stone") ─────────────────────────────────────────────
create or replace function public.lock_material_budget(p_deal uuid)
returns text language plpgsql security definer set search_path = pg_catalog, public as $$
declare me record; b public.material_budgets; v_n int; v_tot numeric; v_skip boolean;
begin
  select * into me from public.prf_me();
  if not public.mb_is_qs() then
    raise exception 'Only Cost Control (QS) or a Manager locks a material budget' using errcode = '42501';
  end if;
  select * into b from public.material_budgets where deal_id = p_deal for update;
  if not found then raise exception 'No material budget for this project' using errcode = 'P0002'; end if;
  v_skip := b.status = 'For PM Review';
  if b.status = 'PM Confirmed' then null;
  elsif v_skip and public.is_mgr() then null;
  else
    raise exception 'A PM must confirm the list first (a Manager may lock it while it waits for the PM)' using errcode = '42501';
  end if;
  select count(*), coalesce(sum(qty * est_unit_cost), 0) into v_n, v_tot
    from public.material_budget_lines where deal_id = p_deal and rev = b.rev and not removed;
  update public.material_budgets set status = 'Locked', locked_rev = b.rev, locked_by = me.o_name, locked_at = now(),
         pm_skipped = v_skip, updated_at = now()
   where deal_id = p_deal;
  insert into public.audit_log (table_name, record_id, action, old_snapshot, snapshot, changed_fields, performed_by, reason)
  values ('material_budgets', p_deal::text, 'material_budget_lock', null,
          jsonb_build_object('rev', b.rev, 'lines', v_n, 'total', v_tot, 'pm_confirmed_by', b.pm_confirmed_by, 'pm_skipped', v_skip),
          array['status','locked_rev'], public.app_username(), case when v_skip then 'Locked by a Manager without PM confirmation' else null end);
  perform public.mb_notify(array['procurement','financialcontrol'], format(E'🔒 <b>Material budget locked</b>\n%s · rev %s · %s lines · about ₱%s\nLocked by %s%s. Procurement: order from Order Board › From material budgets.',
    public.mb_esc(public.mb_deal_label(p_deal)), b.rev, v_n, to_char(round(v_tot), 'FM999,999,999,990'), public.mb_esc(me.o_name),
    case when v_skip then ' (PM step skipped)' else ', PM confirmed by ' || public.mb_esc(b.pm_confirmed_by) end));
  return 'Locked';
end $$;

-- ── revise a locked budget (new revision, reason, logged) ────────────────────
create or replace function public.revise_material_budget(p_deal uuid, p_reason text)
returns int language plpgsql security definer set search_path = pg_catalog, public as $$
declare me record; b public.material_budgets; v_reason text := btrim(coalesce(p_reason, ''));
begin
  select * into me from public.prf_me();
  if not public.mb_is_qs() then
    raise exception 'Only Cost Control (QS) or a Manager revises a locked budget' using errcode = '42501';
  end if;
  if length(v_reason) < 10 then
    raise exception 'Give the reason for the revision (at least 10 characters)' using errcode = '22023';
  end if;
  select * into b from public.material_budgets where deal_id = p_deal for update;
  if not found or b.status <> 'Locked' then
    raise exception 'Only a locked budget is revised' using errcode = '42501';
  end if;
  insert into public.material_budget_lines(deal_id, rev, line_key, line_no, boq_item_id, boq_item, category, item, spec,
                                           qty, unit, est_unit_cost, need_by, remarks)
  select deal_id, b.rev + 1, line_key, line_no, boq_item_id, boq_item, category, item, spec, qty, unit, est_unit_cost, need_by, remarks
    from public.material_budget_lines where deal_id = p_deal and rev = b.rev and not removed;
  update public.material_budgets set rev = b.rev + 1, status = 'Draft', revise_reason = left(v_reason, 500),
         prepared_by = coalesce(me.o_name, prepared_by), submitted_at = null, pm_confirmed_by = null, pm_confirmed_at = null,
         pm_note = '', returned_by = null, returned_at = null, return_reason = null, updated_at = now()
   where deal_id = p_deal;
  insert into public.audit_log (table_name, record_id, action, old_snapshot, snapshot, changed_fields, performed_by, reason)
  values ('material_budgets', p_deal::text, 'material_budget_revise', jsonb_build_object('rev', b.rev),
          jsonb_build_object('rev', b.rev + 1), array['rev','status'], public.app_username(), v_reason);
  perform public.mb_notify(array['management','financialcontrol'], format(E'✏️ <b>Locked material budget reopened</b>\n%s · rev %s → %s\nBy %s: %s\nProcurement keeps ordering from rev %s until the new one is locked.',
    public.mb_esc(public.mb_deal_label(p_deal)), b.rev, b.rev + 1, public.mb_esc(me.o_name), public.mb_esc(v_reason), b.locked_rev));
  return b.rev + 1;
end $$;

-- ── ordered so far per line (PMs can't read POs) ─────────────────────────────
create or replace function public.material_budget_ordered(p_deal uuid)
returns table(line_key uuid, ordered_qty numeric, po_numbers text)
language plpgsql stable security definer set search_path = pg_catalog, public as $$
begin
  if not public.mb_can_read() then raise exception 'Not allowed' using errcode = '42501'; end if;
  return query
    select p.mb_line_key, sum(coalesce(p.qty, 0)), string_agg(distinct nullif(p.po_number, ''), ', ')
      from public.purchase_requests p
     where p.deal_id = p_deal and p.mb_line_key is not null and coalesce(p.status, '') <> 'Cancelled'
     group by p.mb_line_key;
end $$;

revoke execute on function public.save_material_budget(uuid, jsonb)      from public, anon;
revoke execute on function public.submit_material_budget(uuid)           from public, anon;
revoke execute on function public.confirm_material_budget(uuid, text)    from public, anon;
revoke execute on function public.return_material_budget(uuid, text)     from public, anon;
revoke execute on function public.lock_material_budget(uuid)             from public, anon;
revoke execute on function public.revise_material_budget(uuid, text)     from public, anon;
revoke execute on function public.material_budget_ordered(uuid)          from public, anon;
grant  execute on function public.save_material_budget(uuid, jsonb)      to authenticated;
grant  execute on function public.submit_material_budget(uuid)           to authenticated;
grant  execute on function public.confirm_material_budget(uuid, text)    to authenticated;
grant  execute on function public.return_material_budget(uuid, text)     to authenticated;
grant  execute on function public.lock_material_budget(uuid)             to authenticated;
grant  execute on function public.revise_material_budget(uuid, text)     to authenticated;
grant  execute on function public.material_budget_ordered(uuid)          to authenticated;

-- ROLLBACK (by hand in the SQL editor; the MCP hangs on DROP):
--   drop function if exists public.material_budget_ordered(uuid);
--   drop function if exists public.revise_material_budget(uuid, text);
--   drop function if exists public.lock_material_budget(uuid);
--   drop function if exists public.return_material_budget(uuid, text);
--   drop function if exists public.confirm_material_budget(uuid, text);
--   drop function if exists public.submit_material_budget(uuid);
--   drop function if exists public.save_material_budget(uuid, jsonb);
--   drop function if exists public.mb_notify(text[], text);
--   drop function if exists public.mb_esc(text);
--   drop function if exists public.mb_deal_label(uuid);
--   drop function if exists public.mb_is_qs();
--   drop function if exists public.mb_can_read();
--   alter table public.purchase_requests drop column if exists mb_line_key;
--   drop table if exists public.material_budget_lines;
--   drop table if exists public.material_budgets;
