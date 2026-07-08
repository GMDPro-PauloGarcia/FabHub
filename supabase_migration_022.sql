-- ── Migration 022: Server-assigned JO / CV / DRF numbers (same fix as CE) ──
-- Job-order, check-voucher and design-request-form numbers share the exact
-- client-side fallback that produced duplicate CE numbers (migration 020): when
-- the next_doc_number RPC is unreachable, the app guessed the next value from a
-- possibly-stale local list. None of these have collided yet (their counters
-- are at their max, unlike CE which was behind), but the failure mode is
-- identical, so we close it the same way: the client now leaves the number
-- blank when it can't reach the RPC, and these BEFORE INSERT triggers stamp a
-- guaranteed-unique value from the shared atomic counter on arrival.
--
-- Idempotent under the offline retry queue's upserts: reuse the id's existing
-- number instead of allocating a fresh one on re-sync (see migration 020).
--
-- NOTE: purchase_requests (PO) is deliberately NOT covered — one PO number is
-- shared across many line-item rows, so a per-row trigger would hand each line
-- a different number. PO numbering stays client-assigned.

create or replace function public.assign_doc_no(p_prefix text, p_current text, p_id uuid, p_table regclass)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_existing text;
begin
  if p_current is not null and btrim(p_current) <> '' then
    return p_current;
  end if;
  execute format('select %I from %s where id = $1', lower(p_prefix)||'_no', p_table)
    into v_existing using p_id;
  if v_existing is not null and btrim(v_existing) <> '' then
    return v_existing;
  end if;
  return p_prefix || '-' || lpad(public.next_doc_number(p_prefix, 0)::text, 4, '0');
end;
$$;

create or replace function public.job_orders_assign_no()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.jo_no := public.assign_doc_no('JO', new.jo_no, new.id, 'public.job_orders');
  return new;
end; $$;
drop trigger if exists trg_job_orders_assign_no on public.job_orders;
create trigger trg_job_orders_assign_no before insert on public.job_orders
  for each row execute function public.job_orders_assign_no();

create or replace function public.check_vouchers_assign_no()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.cv_no := public.assign_doc_no('CV', new.cv_no, new.id, 'public.check_vouchers');
  return new;
end; $$;
drop trigger if exists trg_check_vouchers_assign_no on public.check_vouchers;
create trigger trg_check_vouchers_assign_no before insert on public.check_vouchers
  for each row execute function public.check_vouchers_assign_no();

create or replace function public.design_requests_assign_no()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.drf_no := public.assign_doc_no('DRF', new.drf_no, new.id, 'public.design_requests');
  return new;
end; $$;
drop trigger if exists trg_design_requests_assign_no on public.design_requests;
create trigger trg_design_requests_assign_no before insert on public.design_requests
  for each row execute function public.design_requests_assign_no();
