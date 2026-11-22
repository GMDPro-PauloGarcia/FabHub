-- "No approved PRF = no project PO" (Paulo, 2026-11-22: "1 Dec is firm").
--
-- From 1 December 2026 (Asia/Manila), a PO line on a client project can't move to
-- PO Issued / Partially Delivered / Delivered unless it is bought from an approved
-- PRF, or a Manager has overridden the rule for that PO with a reason.
--
-- A line is covered when:
--   * its prf_line_id (set by the PO form when the line came from the Order Board)
--     points to a line of the current revision of a PRF on the same project, at
--     "For Procurement" or "Ordered", that still has something to buy; or
--   * an approved PRF line on the same project is linked to this PO number
--     (link_prf_po, for a PO raised by hand and linked afterwards); or
--   * a Manager overrode the rule for this PO (po_prf_waivers, waive_po_prf).
-- Exempt: lines with no project (GMD stock), internal GMD jobs and cost centers
-- (client "GMD Productions…", same test as deal_dp_clear), POs already issued,
-- and PO lines created before 1 Dec 2026 (the 223 POs pending on 22 Nov).
-- Server jobs (no login token) are not checked, like po_require_dp.
--
-- Not in this migration (Paulo, 2026-11-22): the 10:15 AM cut-off and the Urgent
-- sign-offs stay display-only on the Order Board.
--
-- App mirror: PRF_RULE_START / prfRuleOn / poLineNeedsPrf (src/core.js), the
-- hold in submitPO (src/App.jsx), POApprovals' PRF hold and Manager override
-- (src/views/POApprovals.jsx), prf_line_id in toSbPR. Keep them in sync.
--
-- Idempotent; no DROP (Supabase MCP hangs on DROP). BEFORE INSERT returns early
-- when the row already exists (upserts), per 20261106000000.

-- ── 1. The PO line remembers the PRF line it buys ────────────────────────────
alter table public.purchase_requests
  add column if not exists prf_line_id uuid references public.prf_lines(id) on delete set null;
create index if not exists purchase_requests_prf_line_idx on public.purchase_requests(prf_line_id);

-- ── 2. Manager overrides, one per PO number ──────────────────────────────────
create table if not exists public.po_prf_waivers (
  po_number  text primary key,
  reason     text not null,
  waived_by  text not null,
  waived_at  timestamptz not null default now()
);
alter table public.po_prf_waivers enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'po_prf_waivers' and policyname = 'po_prf_waivers_sel') then
    create policy po_prf_waivers_sel on public.po_prf_waivers for select to authenticated
      using (public.has_role('Manager','Finance','Accounting','FinanceAssistant','Procurement','ProcurementManager','QS','Warehouse'));
  end if;
end $$;
revoke all on public.po_prf_waivers from anon;
revoke insert, update, delete, truncate on public.po_prf_waivers from authenticated;

-- ── 3. The rule ──────────────────────────────────────────────────────────────
-- On from 1 Dec 2026 Manila. `set local fabhub.prf_rule_force = 'on'` switches it
-- on early inside a test transaction; lines created before 1 Dec stay exempt either way.
create or replace function public.prf_rule_on()
returns boolean language sql stable set search_path = pg_catalog, public as $$
  select coalesce(current_setting('fabhub.prf_rule_force', true), '') = 'on'
      or (now() at time zone 'Asia/Manila')::date >= date '2026-12-01'
$$;
revoke execute on function public.prf_rule_on() from public, anon, authenticated;

-- Does this line still need a PRF? null = covered / exempt, else the reason.
create or replace function public.po_line_prf_gap(p_deal uuid, p_po text, p_prf_line uuid, p_created timestamptz)
returns text language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare v_client text;
begin
  if p_deal is null then return null; end if;
  if (coalesce(p_created, now()) at time zone 'Asia/Manila')::date < date '2026-12-01' then
    return null;
  end if;
  select client into v_client from public.deals where id = p_deal;
  if coalesce(v_client, '') ilike 'GMD Production%' then return null; end if;
  if exists (select 1 from public.po_prf_waivers w where w.po_number = btrim(coalesce(p_po, ''))) then return null; end if;
  if exists (
    select 1 from public.prf_lines pl join public.prfs r on r.id = pl.prf_id
     where r.deal_id = p_deal and pl.rev = r.lines_rev
       and r.status in ('For Procurement', 'Ordered')
       and coalesce(pl.stock_qty, 0) < pl.qty
       and (pl.id = p_prf_line
            or (coalesce(btrim(p_po), '') <> '' and pl.po_number = btrim(p_po)))) then
    return null;
  end if;
  return coalesce(nullif(btrim(v_client), ''), 'this project');
end $$;
revoke execute on function public.po_line_prf_gap(uuid, text, uuid, timestamptz) from public, anon, authenticated;

create or replace function public.po_require_prf()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare issued text[] := array['PO Issued', 'Partially Delivered', 'Delivered']; v_gap text;
begin
  if coalesce(current_setting('request.jwt.claims', true), '') = '' then return new; end if;
  -- A line's created_at decides whether it is grandfathered, so nobody may move it.
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  if not public.prf_rule_on() then return new; end if;
  if tg_op = 'INSERT' and exists (select 1 from public.purchase_requests x where x.id = new.id) then
    return new;
  end if;
  if not (coalesce(new.status, '') = any(issued)) then return new; end if;
  if tg_op = 'UPDATE' and coalesce(old.status, '') = any(issued)
     and new.deal_id is not distinct from old.deal_id then
    return new;
  end if;
  v_gap := public.po_line_prf_gap(new.deal_id, new.po_number, new.prf_line_id,
             case when tg_op = 'UPDATE' then old.created_at
                  else greatest(now(), coalesce(new.created_at, now())) end);
  if v_gap is null then return new; end if;
  raise exception 'No approved PRF for "%" on PO % (%). From 1 Dec a project PO is issued only from an approved PRF: create it from the Order Board, or a Manager overrides the rule for this PO with a reason.',
    coalesce(nullif(new.item, ''), 'this line'), coalesce(nullif(new.po_number, ''), '(no number)'), v_gap
    using errcode = 'check_violation';
end $$;
revoke execute on function public.po_require_prf() from public, anon, authenticated;

create or replace trigger trg_po_require_prf
  before insert or update on public.purchase_requests
  for each row execute function public.po_require_prf();

-- ── 4. Which pending POs are held, for the approval screen ───────────────────
-- Only for roles that can read POs. Returns one row per PO with held lines.
create or replace function public.po_prf_status(p_pos text[])
returns table(po_number text, held_lines int, project text)
language plpgsql stable security definer set search_path = pg_catalog, public as $$
begin
  if not public.has_role('Manager','Finance','Accounting','FinanceAssistant','Procurement','ProcurementManager','QS','Warehouse') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if not public.prf_rule_on() then return; end if;
  return query
    select p.po_number, count(*)::int, min(g.gap)
      from public.purchase_requests p
      cross join lateral (select public.po_line_prf_gap(p.deal_id, p.po_number, p.prf_line_id, p.created_at) gap) g
     where p.po_number = any(coalesce(p_pos, '{}'))
       and coalesce(p.status, '') not in ('PO Issued', 'Partially Delivered', 'Delivered', 'Cancelled')
       and g.gap is not null
     group by p.po_number;
end $$;
revoke execute on function public.po_prf_status(text[]) from public, anon;
grant  execute on function public.po_prf_status(text[]) to authenticated;

-- ── 5. Manager override, with a reason, logged and sent to management ────────
create or replace function public.waive_po_prf(p_po text, p_reason text)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_po text := btrim(coalesce(p_po, '')); v_reason text := btrim(coalesce(p_reason, ''));
        v_by text := public.app_username(); v_tot numeric; v_sup text; v_msg text;
begin
  if not public.is_mgr() then
    raise exception 'Only a Manager can override the PRF rule' using errcode = '42501';
  end if;
  if length(v_reason) < 10 then
    raise exception 'Give the reason for ordering without a PRF (at least 10 characters)' using errcode = '22023';
  end if;
  select sum(coalesce(qty, 0) * coalesce(estimated_cost, 0)), min(supplier) into v_tot, v_sup
    from public.purchase_requests where po_number = v_po and coalesce(status, '') <> 'Cancelled';
  if v_tot is null then
    raise exception 'PO % not found — save the PO first', v_po using errcode = 'P0002';
  end if;
  if exists (select 1 from public.po_prf_waivers where po_number = v_po) then
    raise exception 'PO % already has a PRF override', v_po using errcode = '23505';
  end if;
  insert into public.po_prf_waivers(po_number, reason, waived_by) values (v_po, v_reason, v_by);
  insert into public.audit_log (table_name, record_id, action, old_snapshot, snapshot, changed_fields, performed_by, reason)
  values ('po_prf_waivers', v_po, 'prf_waived', null,
          jsonb_build_object('po_number', v_po, 'supplier', v_sup, 'total', v_tot), array['po_number'], v_by, v_reason);
  begin
    v_msg := format(E'⚠️ <b>PO %s ordered without a PRF</b>\nSupplier: %s · about ₱%s\nOverride by %s: %s',
      replace(replace(replace(v_po, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'),
      replace(replace(replace(coalesce(v_sup, '—'), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'),
      to_char(round(v_tot), 'FM999,999,999,990'),
      replace(replace(replace(coalesce(v_by, '?'), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'),
      replace(replace(replace(v_reason, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'));
    perform public.send_telegram('management', left(v_msg, 4000), null);
  exception when others then null;
  end;
end $$;
revoke execute on function public.waive_po_prf(text, text) from public, anon;
grant  execute on function public.waive_po_prf(text, text) to authenticated;

-- ROLLBACK
-- Switch the rule off without losing data (no DROP needed):
--   create or replace function public.prf_rule_on() returns boolean language sql stable
--     set search_path = pg_catalog, public as $$ select false $$;
-- Full removal (run by hand in the SQL editor, not through the MCP):
--   drop trigger if exists trg_po_require_prf on public.purchase_requests;
--   drop function if exists public.po_require_prf();
--   drop function if exists public.waive_po_prf(text, text);
--   drop function if exists public.po_prf_status(text[]);
--   drop function if exists public.po_line_prf_gap(uuid, text, uuid, timestamptz);
--   drop function if exists public.prf_rule_on();
--   drop table if exists public.po_prf_waivers;
--   alter table public.purchase_requests drop column if exists prf_line_id;
