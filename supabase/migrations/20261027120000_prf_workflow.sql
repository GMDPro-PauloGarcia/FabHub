-- PRF (Purchase Request Form) workflow — replaces the unused material_requests
-- page (0 rows ever; PMs could not even insert into it).
--
-- Flow (decided by Paulo, 2026-10-27):
--   Draft → For PM Approval → For Warehouse → For Cost Control → For Procurement → Ordered
--   * A coordinator's PRF needs a PM of that project (project_cards.pm1-3) or an
--     Operations/Manager user. A PRF written by one of the project's PMs, or by
--     a Manager, skips that step. Nobody signs their own PRF at any step.
--   * Warehouse (role Warehouse) records how much of each line comes from
--     stock. All lines from stock → "From Stock" (done, no purchase).
--   * Cost Control (role QS) verifies the unit cost of every line still to buy.
--   * Procurement links each line to buy to a PO number on the same project;
--     when all are linked → "Ordered".
--   * Any signer can reject with a reason → "Rejected"; the requester edits and
--     resubmits, which restarts the chain.
--
-- Server-owned: the tables have SELECT policies only. Every write goes through
-- the RPCs below, which check the role, the step and the signer, so a stale
-- device can never overwrite a signature. Each save writes a new revision of
-- the lines (prfs.lines_rev) instead of deleting rows, so the history of what
-- changed after a rejection is kept. prf_events logs every action.
--
-- Mirrors src/views/PrfView.jsx (PRF_STEP_ROLES) — keep them in sync.
-- Idempotent; no DROP (Supabase MCP hangs on DROP).

create table if not exists public.prfs (
  id                uuid primary key default gen_random_uuid(),
  prf_no            text unique,
  deal_id           uuid references public.deals(id) on delete set null,
  department        text not null default 'Fabrication',
  purpose           text not null default '',
  location          text not null default '',
  priority          text not null default 'Normal',
  required_date     date,
  status            text not null default 'Draft',
  requested_by      text not null,
  requested_by_name text not null default '',
  lines_rev         int  not null default 0,
  pm_signed_by      text, pm_signed_at timestamptz,
  pm_skipped        boolean not null default false,
  wh_signed_by      text, wh_signed_at timestamptz,
  qs_signed_by      text, qs_signed_at timestamptz,
  rejected_by       text, rejected_at timestamptz, rejected_step text, reject_reason text,
  ordered_at        timestamptz,
  submitted_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint prfs_priority_chk check (priority in ('Normal','High','Urgent')),
  constraint prfs_status_chk check (status in ('Draft','For PM Approval','For Warehouse',
    'For Cost Control','For Procurement','From Stock','Ordered','Rejected','Cancelled'))
);
create index if not exists prfs_deal_idx   on public.prfs(deal_id);
create index if not exists prfs_status_idx on public.prfs(status);

create table if not exists public.prf_lines (
  id            uuid primary key default gen_random_uuid(),
  prf_id        uuid not null references public.prfs(id) on delete cascade,
  rev           int  not null,
  line_no       int  not null,
  category      text not null default '',
  description   text not null,
  spec          text not null default '',
  brand         text not null default '',
  qty           numeric not null,
  unit          text not null,
  est_unit_cost numeric,
  remarks       text not null default '',
  stock_qty     numeric,                   -- warehouse: qty released from stock
  wh_note       text not null default '',
  qs_unit_cost  numeric,                   -- cost control: verified unit cost
  qs_note       text not null default '',
  po_number     text,                      -- procurement: PO the rest is bought on
  created_at    timestamptz not null default now(),
  constraint prf_lines_qty_chk   check (qty > 0),
  constraint prf_lines_cost_chk  check (est_unit_cost is null or est_unit_cost >= 0),
  constraint prf_lines_stock_chk check (stock_qty is null or (stock_qty >= 0 and stock_qty <= qty)),
  constraint prf_lines_uniq unique (prf_id, rev, line_no)
);
create index if not exists prf_lines_prf_rev_idx on public.prf_lines(prf_id, rev);

create table if not exists public.prf_events (
  id      bigint generated always as identity primary key,
  prf_id  uuid not null references public.prfs(id) on delete cascade,
  action  text not null,
  by_user text not null,
  by_name text not null default '',
  note    text not null default '',
  at      timestamptz not null default now()
);
create index if not exists prf_events_prf_idx on public.prf_events(prf_id);

alter table public.prfs       enable row level security;
alter table public.prf_lines  enable row level security;
alter table public.prf_events enable row level security;

-- Read: everyone in the chain plus the finance side. No write policies.
create or replace function public.prf_can_read()
returns boolean language sql stable set search_path = public as $$
  select public.has_role('Manager','ProjectMover','Operations','Warehouse','QS','Procurement',
                         'Finance','FinanceAssistant','Accounting','SalesOpsAdmin')
$$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='prfs' and policyname='prfs_sel') then
    create policy prfs_sel on public.prfs for select to authenticated using (public.prf_can_read());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='prf_lines' and policyname='prf_lines_sel') then
    create policy prf_lines_sel on public.prf_lines for select to authenticated using (public.prf_can_read());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='prf_events' and policyname='prf_events_sel') then
    create policy prf_events_sel on public.prf_events for select to authenticated using (public.prf_can_read());
  end if;
end $$;

revoke all on public.prfs, public.prf_lines, public.prf_events from anon;
revoke insert, update, delete, truncate on public.prfs, public.prf_lines, public.prf_events from authenticated;

-- ── helpers ───────────────────────────────────────────────────────────────────
-- Project cards store names with a role tag ("Jay Bernardo (PM)").
create or replace function public.prf_norm_name(p text)
returns text language sql immutable set search_path = public as $$
  select lower(btrim(regexp_replace(coalesce(p, ''), '\s*\([^)]*\)\s*$', '')))
$$;

-- The caller's username, display name and REAL role (the JWT maps Operations
-- to ProjectMover, so it can't tell the Ops Director from a coordinator).
create or replace function public.prf_me(out o_user text, out o_name text, out o_role text)
language sql stable security definer set search_path = public as $$
  select public.app_username(),
         coalesce(nullif(up.name, ''), public.app_username()),
         coalesce(nullif(up.role, ''), public.app_role())
    from (select 1) x
    left join public.user_profiles up on lower(up.username) = lower(public.app_username())
   limit 1
$$;
revoke execute on function public.prf_me() from public, anon, authenticated;

create or replace function public.prf_is_project_pm(p_deal uuid, p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(btrim(p_name), '') <> '' and exists (
    select 1 from public.project_cards pc
     where pc.deal_id = p_deal
       and public.prf_norm_name(p_name) in (public.prf_norm_name(pc.pm1), public.prf_norm_name(pc.pm2), public.prf_norm_name(pc.pm3)))
$$;
revoke execute on function public.prf_is_project_pm(uuid, text) from public, anon, authenticated;

create or replace function public.prf_log(p_prf uuid, p_action text, p_note text default '')
returns void language plpgsql security definer set search_path = public as $$
declare me record;
begin
  select * into me from public.prf_me();
  insert into public.prf_events(prf_id, action, by_user, by_name, note)
  values (p_prf, p_action, coalesce(me.o_user, '?'), coalesce(me.o_name, ''), coalesce(p_note, ''));
end $$;
revoke execute on function public.prf_log(uuid, text, text) from public, anon, authenticated;

-- ── save a draft (create or edit) ─────────────────────────────────────────────
-- p_prf: {deal_id, department, purpose, location, priority, required_date}
-- p_lines: [{category, description, spec, brand, qty, unit, est_unit_cost, remarks}]
create or replace function public.save_prf(p_id uuid, p_prf jsonb, p_lines jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me record; v_id uuid; v_rev int; v_stage text; v_n int := 0; ln jsonb; r record;
begin
  if not public.has_role('Manager','ProjectMover') then
    raise exception 'Only PMs, coordinators and Managers write PRFs' using errcode = '42501';
  end if;
  select * into me from public.prf_me();
  select stage into v_stage from public.deals where id = nullif(p_prf->>'deal_id','')::uuid;
  if v_stage is null then
    raise exception 'Pick the project this PRF is for' using errcode = '22023';
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

-- ── submit ────────────────────────────────────────────────────────────────────
create or replace function public.submit_prf(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare me record; r record; v_bad record; v_status text; v_no text;
begin
  select * into me from public.prf_me();
  select * into r from public.prfs where id = p_id for update;
  if not found then raise exception 'PRF not found' using errcode = 'P0002'; end if;
  if lower(r.requested_by) <> lower(coalesce(me.o_user,'')) then
    raise exception 'Only the person who wrote this PRF can submit it' using errcode = '42501';
  end if;
  if r.status <> 'Draft' then
    raise exception 'This PRF is already %', r.status using errcode = '42501';
  end if;
  if r.required_date is null then
    raise exception 'Set the Required Date before submitting' using errcode = '22023';
  end if;
  select line_no, description into v_bad from public.prf_lines
   where prf_id = p_id and rev = r.lines_rev and coalesce(est_unit_cost, 0) <= 0
   order by line_no limit 1;
  if found then
    raise exception 'Item % (%) needs an estimated unit cost — Cost Control verifies it', v_bad.line_no, v_bad.description
      using errcode = '22023';
  end if;

  v_no := r.prf_no;
  if v_no is null then
    v_no := 'PRF-' || to_char(now() at time zone 'Asia/Manila', 'YYYY') || '-'
            || lpad(public.next_doc_number('PRF')::text, 4, '0');
  end if;
  if me.o_role = 'Manager' or public.prf_is_project_pm(r.deal_id, me.o_name) then
    v_status := 'For Warehouse';
  else
    v_status := 'For PM Approval';
  end if;
  update public.prf_lines set stock_qty = null, wh_note = '', qs_unit_cost = null, qs_note = '', po_number = null
   where prf_id = p_id and rev = r.lines_rev;
  update public.prfs set
    prf_no = v_no, status = v_status, submitted_at = now(), updated_at = now(),
    pm_signed_by = null, pm_signed_at = null, pm_skipped = (v_status = 'For Warehouse'),
    wh_signed_by = null, wh_signed_at = null, qs_signed_by = null, qs_signed_at = null,
    rejected_by = null, rejected_at = null, rejected_step = null, reject_reason = null
  where id = p_id;
  perform public.prf_log(p_id, 'Submitted', case when v_status = 'For Warehouse' then 'PM step not needed' else '' end);
  return v_status;
end $$;

-- Who may act on the step a PRF is at. Returns null when allowed, else the reason.
create or replace function public.prf_step_block(r public.prfs)
returns text language plpgsql stable security definer set search_path = public as $$
declare me record;
begin
  select * into me from public.prf_me();
  if lower(r.requested_by) = lower(coalesce(me.o_user,'')) then
    return 'You can''t sign your own PRF';
  end if;
  if r.status = 'For PM Approval' then
    if me.o_role in ('Manager','Operations') or public.prf_is_project_pm(r.deal_id, me.o_name) then return null; end if;
    return 'Only a PM of this project (or Operations / a Manager) approves this step';
  elsif r.status = 'For Warehouse' then
    if public.has_role('Warehouse') then return null; end if;
    return 'Only the Warehouse team signs this step';
  elsif r.status = 'For Cost Control' then
    if public.has_role('QS') then return null; end if;
    return 'Only Cost Control (QS) signs this step';
  elsif r.status = 'For Procurement' then
    if public.has_role('Procurement','Manager') then return null; end if;
    return 'Only Procurement handles this step';
  end if;
  return 'This PRF is ' || r.status || ' — there is nothing to sign';
end $$;
revoke execute on function public.prf_step_block(public.prfs) from public, anon, authenticated;

-- ── PM approval ───────────────────────────────────────────────────────────────
create or replace function public.sign_prf_pm(p_id uuid, p_note text default '')
returns text language plpgsql security definer set search_path = public as $$
declare me record; r public.prfs; v_block text;
begin
  select * into me from public.prf_me();
  select * into r from public.prfs where id = p_id for update;
  if not found then raise exception 'PRF not found' using errcode = 'P0002'; end if;
  if r.status <> 'For PM Approval' then raise exception 'This PRF is %', r.status using errcode = '42501'; end if;
  v_block := public.prf_step_block(r);
  if v_block is not null then raise exception '%', v_block using errcode = '42501'; end if;
  update public.prfs set status = 'For Warehouse', pm_signed_by = me.o_name, pm_signed_at = now(), updated_at = now()
   where id = p_id;
  perform public.prf_log(p_id, 'PM Approved', p_note);
  return 'For Warehouse';
end $$;

-- ── warehouse stock check ─────────────────────────────────────────────────────
-- p_lines: [{id, stock_qty, note}] — every line of the PRF must be covered.
create or replace function public.sign_prf_warehouse(p_id uuid, p_lines jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare me record; r public.prfs; v_block text; l record; v_in jsonb; v_q numeric; v_status text;
begin
  select * into me from public.prf_me();
  select * into r from public.prfs where id = p_id for update;
  if not found then raise exception 'PRF not found' using errcode = 'P0002'; end if;
  if r.status <> 'For Warehouse' then raise exception 'This PRF is %', r.status using errcode = '42501'; end if;
  v_block := public.prf_step_block(r);
  if v_block is not null then raise exception '%', v_block using errcode = '42501'; end if;
  for l in select * from public.prf_lines where prf_id = p_id and rev = r.lines_rev order by line_no loop
    select e.value into v_in from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) as e(value) where e.value->>'id' = l.id::text limit 1;
    v_q := nullif(v_in->>'stock_qty','')::numeric;
    if v_q is null or v_q < 0 or v_q > l.qty then
      raise exception 'Item % (%): enter the qty from stock, 0 to %', l.line_no, l.description, l.qty using errcode = '22023';
    end if;
    update public.prf_lines set stock_qty = v_q, wh_note = coalesce(v_in->>'note','') where id = l.id;
  end loop;
  if exists (select 1 from public.prf_lines where prf_id = p_id and rev = r.lines_rev and stock_qty < qty) then
    v_status := 'For Cost Control';
  else
    v_status := 'From Stock';
  end if;
  update public.prfs set status = v_status, wh_signed_by = me.o_name, wh_signed_at = now(), updated_at = now()
   where id = p_id;
  perform public.prf_log(p_id, 'Warehouse Checked', case when v_status = 'From Stock' then 'All items from stock' else '' end);
  return v_status;
end $$;

-- ── cost control (QS) ─────────────────────────────────────────────────────────
-- p_lines: [{id, unit_cost, note}] — every line still to buy must be covered.
create or replace function public.sign_prf_qs(p_id uuid, p_lines jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare me record; r public.prfs; v_block text; l record; v_in jsonb; v_c numeric;
begin
  select * into me from public.prf_me();
  select * into r from public.prfs where id = p_id for update;
  if not found then raise exception 'PRF not found' using errcode = 'P0002'; end if;
  if r.status <> 'For Cost Control' then raise exception 'This PRF is %', r.status using errcode = '42501'; end if;
  v_block := public.prf_step_block(r);
  if v_block is not null then raise exception '%', v_block using errcode = '42501'; end if;
  for l in select * from public.prf_lines where prf_id = p_id and rev = r.lines_rev and stock_qty < qty order by line_no loop
    select e.value into v_in from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) as e(value) where e.value->>'id' = l.id::text limit 1;
    v_c := nullif(v_in->>'unit_cost','')::numeric;
    if v_c is null or v_c <= 0 then
      raise exception 'Item % (%): enter the verified unit cost', l.line_no, l.description using errcode = '22023';
    end if;
    update public.prf_lines set qs_unit_cost = v_c, qs_note = coalesce(v_in->>'note','') where id = l.id;
  end loop;
  update public.prfs set status = 'For Procurement', qs_signed_by = me.o_name, qs_signed_at = now(), updated_at = now()
   where id = p_id;
  perform public.prf_log(p_id, 'Cost Verified');
  return 'For Procurement';
end $$;

-- ── procurement: link lines to POs ───────────────────────────────────────────
-- p_lines: [{id, po_number}]. The PO must exist on the same project.
create or replace function public.link_prf_po(p_id uuid, p_lines jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare me record; r public.prfs; v_block text; v_in jsonb; l record; v_po text; v_status text;
begin
  select * into me from public.prf_me();
  select * into r from public.prfs where id = p_id for update;
  if not found then raise exception 'PRF not found' using errcode = 'P0002'; end if;
  if r.status <> 'For Procurement' then raise exception 'This PRF is %', r.status using errcode = '42501'; end if;
  v_block := public.prf_step_block(r);
  if v_block is not null then raise exception '%', v_block using errcode = '42501'; end if;
  for v_in in select * from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) loop
    v_po := nullif(btrim(v_in->>'po_number'),'');
    if v_po is null then continue; end if;
    select * into l from public.prf_lines where id = nullif(v_in->>'id','')::uuid and prf_id = p_id and rev = r.lines_rev;
    if not found then raise exception 'Item not on this PRF' using errcode = '22023'; end if;
    if l.stock_qty >= l.qty then
      raise exception 'Item % (%) comes from stock — no PO needed', l.line_no, l.description using errcode = '22023';
    end if;
    if not exists (select 1 from public.purchase_requests p where p.po_number = v_po and p.deal_id is not distinct from r.deal_id) then
      raise exception 'PO % is not on this project yet — save the PO first', v_po using errcode = '22023';
    end if;
    update public.prf_lines set po_number = v_po where id = l.id;
  end loop;
  if exists (select 1 from public.prf_lines where prf_id = p_id and rev = r.lines_rev and stock_qty < qty and po_number is null) then
    v_status := 'For Procurement';
  else
    v_status := 'Ordered';
    update public.prfs set status = 'Ordered', ordered_at = now(), updated_at = now() where id = p_id;
  end if;
  perform public.prf_log(p_id, case when v_status = 'Ordered' then 'Ordered' else 'PO Linked' end);
  return v_status;
end $$;

-- ── reject (any step) ─────────────────────────────────────────────────────────
create or replace function public.reject_prf(p_id uuid, p_reason text)
returns text language plpgsql security definer set search_path = public as $$
declare me record; r public.prfs; v_block text;
begin
  select * into me from public.prf_me();
  if length(btrim(coalesce(p_reason,''))) < 5 then
    raise exception 'Give the reason for rejecting (at least 5 characters)' using errcode = '22023';
  end if;
  select * into r from public.prfs where id = p_id for update;
  if not found then raise exception 'PRF not found' using errcode = 'P0002'; end if;
  v_block := public.prf_step_block(r);
  if v_block is not null then raise exception '%', v_block using errcode = '42501'; end if;
  update public.prfs set status = 'Rejected', rejected_by = me.o_name, rejected_at = now(),
         rejected_step = r.status, reject_reason = btrim(p_reason), updated_at = now()
   where id = p_id;
  perform public.prf_log(p_id, 'Rejected', r.status || ': ' || btrim(p_reason));
  return 'Rejected';
end $$;

-- ── cancel ────────────────────────────────────────────────────────────────────
-- The requester, before the warehouse has signed; a Manager, any time before it
-- is ordered or released from stock.
create or replace function public.cancel_prf(p_id uuid, p_reason text default '')
returns text language plpgsql security definer set search_path = public as $$
declare me record; r record; v_own boolean;
begin
  select * into me from public.prf_me();
  select * into r from public.prfs where id = p_id for update;
  if not found then raise exception 'PRF not found' using errcode = 'P0002'; end if;
  v_own := lower(r.requested_by) = lower(coalesce(me.o_user,''));
  if r.status in ('Ordered','From Stock','Cancelled') then
    raise exception 'This PRF is % and can''t be cancelled', r.status using errcode = '42501';
  end if;
  if not ((v_own and r.status in ('Draft','Rejected','For PM Approval','For Warehouse')) or public.has_role('Manager')) then
    raise exception 'Only the requester (before the warehouse signs) or a Manager can cancel this PRF' using errcode = '42501';
  end if;
  if r.status <> 'Draft' and length(btrim(coalesce(p_reason,''))) < 5 then
    raise exception 'Give the reason for cancelling (at least 5 characters)' using errcode = '22023';
  end if;
  update public.prfs set status = 'Cancelled', updated_at = now() where id = p_id;
  perform public.prf_log(p_id, 'Cancelled', coalesce(btrim(p_reason),''));
  return 'Cancelled';
end $$;

-- ── last purchase prices, to pre-fill estimates ───────────────────────────────
-- PMs can't read purchase_requests; this returns only item, unit, unit price and
-- date (no supplier) for items whose name contains p_q.
create or replace function public.prf_price_hints(p_q text)
returns table(item text, unit text, unit_price numeric, last_date date)
language sql stable security definer set search_path = public as $$
  select x.item, x.unit, x.unit_price, x.last_date from (
    select distinct on (lower(btrim(p.item)))
           btrim(p.item) as item, p.unit,
           coalesce(nullif(p.actual_cost,0), nullif(p.estimated_cost,0)) as unit_price,
           coalesce(p.po_date, p.created_at::date) as last_date
      from public.purchase_requests p
     where public.has_role('Manager','ProjectMover','QS','Procurement')
       and length(btrim(coalesce(p_q,''))) >= 3
       and p.item ilike '%' || btrim(p_q) || '%'
       and coalesce(nullif(p.actual_cost,0), nullif(p.estimated_cost,0)) is not null
       and coalesce(p.status,'') <> 'Cancelled'
     order by lower(btrim(p.item)), coalesce(p.po_date, p.created_at::date) desc
  ) x
  order by x.last_date desc
  limit 8
$$;

revoke execute on function public.save_prf(uuid, jsonb, jsonb)     from public, anon;
revoke execute on function public.submit_prf(uuid)                 from public, anon;
revoke execute on function public.sign_prf_pm(uuid, text)          from public, anon;
revoke execute on function public.sign_prf_warehouse(uuid, jsonb)  from public, anon;
revoke execute on function public.sign_prf_qs(uuid, jsonb)         from public, anon;
revoke execute on function public.link_prf_po(uuid, jsonb)         from public, anon;
revoke execute on function public.reject_prf(uuid, text)           from public, anon;
revoke execute on function public.cancel_prf(uuid, text)           from public, anon;
revoke execute on function public.prf_price_hints(text)            from public, anon;
grant  execute on function public.save_prf(uuid, jsonb, jsonb)     to authenticated;
grant  execute on function public.submit_prf(uuid)                 to authenticated;
grant  execute on function public.sign_prf_pm(uuid, text)          to authenticated;
grant  execute on function public.sign_prf_warehouse(uuid, jsonb)  to authenticated;
grant  execute on function public.sign_prf_qs(uuid, jsonb)         to authenticated;
grant  execute on function public.link_prf_po(uuid, jsonb)         to authenticated;
grant  execute on function public.reject_prf(uuid, text)           to authenticated;
grant  execute on function public.cancel_prf(uuid, text)           to authenticated;
grant  execute on function public.prf_price_hints(text)            to authenticated;

-- ROLLBACK
-- drop function if exists public.prf_price_hints(text);
-- drop function if exists public.cancel_prf(uuid, text);
-- drop function if exists public.reject_prf(uuid, text);
-- drop function if exists public.link_prf_po(uuid, jsonb);
-- drop function if exists public.sign_prf_qs(uuid, jsonb);
-- drop function if exists public.sign_prf_warehouse(uuid, jsonb);
-- drop function if exists public.sign_prf_pm(uuid, text);
-- drop function if exists public.prf_step_block(public.prfs);
-- drop function if exists public.submit_prf(uuid);
-- drop function if exists public.save_prf(uuid, jsonb, jsonb);
-- drop function if exists public.prf_log(uuid, text, text);
-- drop function if exists public.prf_is_project_pm(uuid, text);
-- drop function if exists public.prf_me();
-- drop function if exists public.prf_norm_name(text);
-- drop table if exists public.prf_events;
-- drop table if exists public.prf_lines;
-- drop table if exists public.prfs;
-- drop function if exists public.prf_can_read();
