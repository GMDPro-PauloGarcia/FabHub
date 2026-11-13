-- Finance does not raise POs or subcon work orders. Decided with Paulo 2026-11-11
-- ("finance should not have the power to make pos and wos").
-- RELEASE: Saturday / Sunday only (CLAUDE.md).
--
-- Before this, purchase_requests_ins and subcon_work_orders_ins let Finance and
-- FinanceAssistant insert. Mark (FinanceAssistant) enters and pays bills and keeps the
-- cash sheet, so being able to raise the order too put the whole purchase in one pair
-- of hands except the approval. In the 60 days to 2026-11-11 Finance created no PO line
-- and no WO, so nothing in daily work depends on it.
--
-- The insert policies are NOT narrowed: the app saves with an upsert, and Postgres
-- checks an upsert against the INSERT policy even when it updates an existing row, so
-- narrowing them would break Finance's edits of existing PO lines / WOs. Instead a
-- BEFORE INSERT trigger refuses a brand-new row from a Finance role and returns early
-- when the row already exists (the upsert pattern in CLAUDE.md, "Upserts and triggers").
-- Requests without JWT claims (service role, cron, SQL editor) are not checked.
--
-- Mirrors canRaiseOrder (src/core.js), addPR's guard and the PO page buttons
-- (src/App.jsx). Keep them in sync. Idempotent.

create or replace function public.block_finance_new_orders()
returns trigger language plpgsql security definer set search_path to 'pg_catalog', 'public' as $$
declare found_row boolean;
begin
  if coalesce(current_setting('request.jwt.claims', true), '') = '' then
    return new;
  end if;
  if not public.has_role('Finance', 'FinanceAssistant', 'Accounting') then
    return new;
  end if;
  -- Upsert of an existing row: an edit, not a new order.
  execute format('select exists(select 1 from %I.%I where id = $1)', tg_table_schema, tg_table_name)
    into found_row using new.id;
  if found_row then
    return new;
  end if;
  raise exception 'Finance does not create % — Procurement or a Manager does.',
    case when tg_table_name = 'subcon_work_orders' then 'work orders' else 'purchase orders' end
    using errcode = 'insufficient_privilege';
end $$;

revoke execute on function public.block_finance_new_orders() from public, anon, authenticated;

create or replace trigger trg_purchase_requests_no_finance_new
  before insert on public.purchase_requests
  for each row execute function public.block_finance_new_orders();

create or replace trigger trg_subcon_work_orders_no_finance_new
  before insert on public.subcon_work_orders
  for each row execute function public.block_finance_new_orders();

-- ROLLBACK
--   alter table public.purchase_requests disable trigger trg_purchase_requests_no_finance_new;
--   alter table public.subcon_work_orders disable trigger trg_subcon_work_orders_no_finance_new;
--   (Disable rather than drop: the Supabase MCP hangs on DROP. The function can stay.)
