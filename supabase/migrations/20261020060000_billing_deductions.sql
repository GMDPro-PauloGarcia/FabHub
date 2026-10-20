-- ============================================================================
-- Migration 20261020f — billing deductions keep their audit trail
--
-- Owner request (Paulo Garcia, 2026-10-20). BillingView's "Record Deduction"
-- lowered a milestone's amount, but the deduction itself (reason, who approved,
-- when) lived only on the device: billing_milestones has no column for it, so it
-- vanished on reload. Its × button then deleted the record without restoring the
-- amount, leaving an invoice lowered with no trace of why. audit_log has 4 amount
-- reductions since 2026-09-24 whose reasons are lost.
--
-- Now:
--   • public.billing_deductions — one row per deduction, kept forever. Snapshot
--     of the invoice (deal, invoice no., milestone name, amount before/after)
--     so the record survives the milestone being deleted. No foreign key for
--     the same reason.
--   • No insert/update/delete policies: rows are written only by the two
--     functions below, so nobody can edit or erase the trail from the app.
--   • record_billing_deduction(milestone, amount, reason) — Manager only.
--     Lowers the milestone amount and writes the row in one transaction, with
--     the user and time stamped by the server. Refuses a cancelled milestone,
--     an amount above the milestone, and a deduction that would leave the
--     invoice receiving less than has already been paid on it.
--   • reverse_billing_deduction(id, reason) — Manager only. Puts the amount
--     back and marks the row reversed (who, when, why). Never deletes.
--   • audit_billing_change() now records the FabHub username. It read the JWT's
--     'email' claim, which FabHub logins don't carry, so 805 milestone changes
--     were logged as 'unknown'.
--
-- Mirrors DeductionForm / the Deductions list in BillingView (src/App.jsx) —
-- keep in sync. Idempotent.
-- ============================================================================

create table if not exists public.billing_deductions (
  id              uuid primary key default gen_random_uuid(),
  milestone_id    uuid not null,
  deal_id         uuid,
  invoice_no      text,
  milestone_name  text,
  amount          numeric not null check (amount > 0),
  amount_before   numeric not null,
  amount_after    numeric not null,
  reason          text not null check (btrim(reason) <> ''),
  recorded_by     text not null,
  recorded_at     timestamptz not null default now(),
  reversed_at     timestamptz,
  reversed_by     text,
  reverse_reason  text
);
create index if not exists billing_deductions_milestone_idx on public.billing_deductions (milestone_id);

alter table public.billing_deductions enable row level security;
revoke all on public.billing_deductions from anon;
grant select on public.billing_deductions to authenticated;

do $$ begin
  if not exists (select 1 from pg_policy where polname = 'billing_deductions_sel'
                 and polrelid = 'public.billing_deductions'::regclass) then
    create policy billing_deductions_sel on public.billing_deductions for select to authenticated
      using (public.has_role('Manager', 'Sales', 'Finance', 'Accounting', 'FinanceAssistant', 'SalesOpsAdmin'));
  end if;
end $$;

-- Net receivable of a milestone amount, same formula as calcTax in src/core.js:
-- base + 12% VAT (OR only) − 2% EWT (OR + withholding).
create or replace function public.billing_net_receivable(p_amount numeric, p_rt text, p_wh boolean)
returns numeric
language sql
immutable
set search_path = public
as $$
  select round(p_amount
    + case when p_rt = 'OR' then round(p_amount * 0.12, 2) else 0 end
    - case when p_rt = 'OR' and p_wh then round(p_amount * 0.02, 2) else 0 end, 2);
$$;
revoke execute on function public.billing_net_receivable(numeric, text, boolean) from public, anon, authenticated;

create or replace function public.record_billing_deduction(p_milestone_id uuid, p_amount numeric, p_reason text)
returns public.billing_deductions
language plpgsql
security definer
set search_path = public
as $$
declare
  m       public.billing_milestones;
  d       public.deals;
  v_rt    text;
  v_wh    boolean;
  v_paid  numeric;
  v_after numeric;
  v_row   public.billing_deductions;
begin
  if not public.is_mgr() then
    raise exception 'Only a Manager can record a billing deduction.' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter a deduction amount greater than zero.' using errcode = 'check_violation';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Give the reason for the deduction.' using errcode = 'check_violation';
  end if;

  select * into m from public.billing_milestones where id = p_milestone_id for update;
  if not found then
    raise exception 'Billing milestone not found.' using errcode = 'P0002';
  end if;
  if m.status = 'Cancelled' then
    raise exception 'This milestone is cancelled — nothing to deduct from.' using errcode = 'check_violation';
  end if;
  if round(p_amount, 2) > round(coalesce(m.amount, 0), 2) then
    raise exception 'Deduction ₱% is more than the milestone amount ₱%.', round(p_amount, 2), round(coalesce(m.amount, 0), 2)
      using errcode = 'check_violation';
  end if;

  select * into d from public.deals where id = m.deal_id;
  v_rt := coalesce(nullif(m.receipt_type, ''), nullif(d.receipt_type, ''), 'OR');
  v_wh := coalesce(m.withholding, d.withholding, false);
  select coalesce(sum(amount), 0) into v_paid
    from public.billing_payments where milestone_id = m.id and not coalesce(bounced, false);
  v_after := round(coalesce(m.amount, 0) - p_amount, 2);
  if public.billing_net_receivable(v_after, v_rt, v_wh) < v_paid - 0.01 then
    raise exception 'After this deduction the invoice would be worth ₱% but ₱% has already been paid on it. Record a refund or reduce the deduction.',
      public.billing_net_receivable(v_after, v_rt, v_wh), round(v_paid, 2) using errcode = 'check_violation';
  end if;

  update public.billing_milestones set
    amount = v_after,
    status = case when v_paid > 0 and v_paid >= public.billing_net_receivable(v_after, v_rt, v_wh) - 0.01 then 'Fully Paid' else status end,
    updated_at = now()
  where id = m.id;

  insert into public.billing_deductions
    (milestone_id, deal_id, invoice_no, milestone_name, amount, amount_before, amount_after, reason, recorded_by)
  values
    (m.id, m.deal_id, m.invoice_no, m.name, round(p_amount, 2), coalesce(m.amount, 0), v_after, btrim(p_reason),
     coalesce(nullif(public.app_username(), ''), 'unknown'))
  returning * into v_row;
  return v_row;
end;
$$;
revoke execute on function public.record_billing_deduction(uuid, numeric, text) from public, anon;
grant  execute on function public.record_billing_deduction(uuid, numeric, text) to authenticated;

create or replace function public.reverse_billing_deduction(p_id uuid, p_reason text)
returns public.billing_deductions
language plpgsql
security definer
set search_path = public
as $$
declare
  r     public.billing_deductions;
  m     public.billing_milestones;
  v_row public.billing_deductions;
begin
  if not public.is_mgr() then
    raise exception 'Only a Manager can reverse a billing deduction.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Give the reason for reversing the deduction.' using errcode = 'check_violation';
  end if;
  select * into r from public.billing_deductions where id = p_id for update;
  if not found then
    raise exception 'Deduction not found.' using errcode = 'P0002';
  end if;
  if r.reversed_at is not null then
    raise exception 'This deduction was already reversed.' using errcode = 'check_violation';
  end if;
  select * into m from public.billing_milestones where id = r.milestone_id for update;
  if not found then
    raise exception 'The milestone for this deduction no longer exists.' using errcode = 'P0002';
  end if;
  if m.status = 'Cancelled' then
    raise exception 'This milestone is cancelled — reverse it before restoring the deduction.' using errcode = 'check_violation';
  end if;

  update public.billing_milestones set
    amount = round(coalesce(amount, 0) + r.amount, 2),
    status = case when status = 'Fully Paid' then 'Partially Paid' else status end,
    updated_at = now()
  where id = m.id;

  update public.billing_deductions set
    reversed_at = now(), reversed_by = coalesce(nullif(public.app_username(), ''), 'unknown'), reverse_reason = btrim(p_reason)
  where id = r.id
  returning * into v_row;
  return v_row;
end;
$$;
revoke execute on function public.reverse_billing_deduction(uuid, text) from public, anon;
grant  execute on function public.reverse_billing_deduction(uuid, text) to authenticated;

-- audit_log: record who, using the FabHub username claim.
create or replace function public.audit_billing_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  actor   text;
  changed text[];
begin
  actor := coalesce(
    nullif(public.app_username(), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email',
    to_jsonb(new) ->> 'recorded_by',
    'unknown'
  );

  if (tg_op = 'UPDATE') then
    if to_jsonb(new) = to_jsonb(old) then
      return new;
    end if;
    select array_agg(key)
      into changed
      from jsonb_each(to_jsonb(new)) n
      where n.value is distinct from (to_jsonb(old) -> n.key);
  end if;

  insert into public.audit_log
    (table_name, record_id, action, old_snapshot, snapshot, changed_fields, performed_by, reason)
  values
    (tg_table_name,
     coalesce(new.id, old.id)::text,
     lower(tg_op),
     case when tg_op = 'UPDATE' then to_jsonb(old) end,
     to_jsonb(new),
     changed,
     actor,
     case when tg_op = 'UPDATE' then 'field edit' else 'created' end);

  return new;
end
$function$;
revoke execute on function public.audit_billing_change() from public, anon, authenticated;

-- ── ROLLBACK ──
--   drop function if exists public.record_billing_deduction(uuid, numeric, text);
--   drop function if exists public.reverse_billing_deduction(uuid, text);
--   drop function if exists public.billing_net_receivable(numeric, text, boolean);
--   drop table if exists public.billing_deductions;   -- only if it holds no rows worth keeping
--   audit_billing_change(): restore the previous body (actor from the 'email' claim) from
--   pg_get_functiondef history / migration 20260917000000_billing_change_audit.sql.
