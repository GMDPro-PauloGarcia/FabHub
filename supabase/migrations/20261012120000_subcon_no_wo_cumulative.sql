-- D3, part 2 (Paulo, 12 Oct 2026): the PHP 50,000 no-Work-Order limit on
-- subcontractor payables is cumulative per subcontractor, so two PHP 49,000
-- requests can't split their way past it. Replaces the function behind
-- trg_payables_subcon_wo_guard (migration 20261009120000).
--
-- Rule: when a subcontractor payable with no Work Order is saved, this payable
-- plus the same subcontractor's other no-WO subcontractor payables created in
-- the last 30 days (Manila date, today included) must stay under PHP 50,000.
-- A single payable of PHP 50,000+ is the same rule with nothing else counted.
--
-- "Subcontractor": category 'Subcontractor' or account code 5070 / 5100 / 5200.
-- Same subcontractor: vendor names compared trimmed, spaces collapsed, lower case.
-- An edit that keeps an existing no-WO payable's vendor and doesn't raise its
-- amount is always allowed, so older rows can still be edited and paid.
-- Only API callers (anon / authenticated) are checked; owner-run imports are not.
-- An advisory lock per subcontractor stops two saves at the same moment from
-- each missing the other.
--
-- App mirror: subconNoWoBlock in src/core.js (AP_RULES.subconNoWoLimit,
-- AP_RULES.subconNoWoWindowDays). Keep them in sync.

create or replace function public.payables_subcon_wo_guard()
returns trigger language plpgsql set search_path = public as $$
declare
  v_key   text := lower(regexp_replace(btrim(coalesce(new.vendor,'')), '\s+', ' ', 'g'));
  v_since date := (now() at time zone 'Asia/Manila')::date - 29;
  v_other numeric;
begin
  if current_user not in ('anon','authenticated') then return new; end if;

  -- Only subcontractor payables with no Work Order are limited.
  if not ((new.category = 'Subcontractor' or coalesce(new.account_code,'') in ('5070','5100','5200'))
          and btrim(coalesce(new.po_number,'')) = '') then
    return new;
  end if;

  -- An unchanged or lowered existing no-WO payable (same vendor) is allowed.
  if tg_op = 'UPDATE'
     and (old.category = 'Subcontractor' or coalesce(old.account_code,'') in ('5070','5100','5200'))
     and btrim(coalesce(old.po_number,'')) = ''
     and coalesce(new.amount,0) <= coalesce(old.amount,0)
     and lower(regexp_replace(btrim(coalesce(old.vendor,'')), '\s+', ' ', 'g')) = v_key then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('payables_subcon_no_wo:' || v_key));

  select coalesce(sum(p.amount),0) into v_other
    from public.payables p
   where p.id <> new.id
     and (p.category = 'Subcontractor' or coalesce(p.account_code,'') in ('5070','5100','5200'))
     and btrim(coalesce(p.po_number,'')) = ''
     and lower(regexp_replace(btrim(coalesce(p.vendor,'')), '\s+', ' ', 'g')) = v_key
     and coalesce(p.created_at, v_since) >= v_since;  -- no date: counted

  if coalesce(new.amount,0) + v_other >= 50000 then
    if v_other > 0 then
      raise exception 'Subcontractor payables with no Work Order for % would total PHP % in the last 30 days (limit PHP 50,000, decision D3). Create a Work Order for this work.',
        btrim(new.vendor), to_char(coalesce(new.amount,0) + v_other, 'FM999,999,999,990.00')
        using errcode = 'check_violation';
    else
      raise exception 'Subcontractor payables of PHP 50,000 or more need a Work Order (decision D3). Create the Work Order first.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

revoke execute on function public.payables_subcon_wo_guard() from public, anon, authenticated;

-- ROLLBACK: re-run the function body from 20261009120000_subcon_payable_needs_wo.sql
-- (per-payable limit only). The trigger itself is unchanged.
