-- Award date audit (Paulo, 2026-11-26: "add the award date audit").
--
-- Why: on 2026-11-26, 119 of 277 awarded projects had an award date that looked
-- wrong (after the first invoice, a 2025 date on a 2026 CE, day and month
-- swapped, or simply the day the card was created), and nothing recorded who
-- had entered or changed any of them. Only turnover moves were kept
-- (trg_project_cards_turnover_audit, migration 20261121020000).
--
-- What: every write that sets or changes project_cards.award_date, by any
-- route (set_project_card_fields, a direct card save, a server job), adds one
-- row to audit_log:
--   table_name 'project_cards', record_id = deal_id,
--   action     'award_date_change',
--   snapshot   {award_date: new, via: 'rpc' | 'direct', first_set: true|false},
--   old_snapshot {award_date: old},
--   reason     'first set' or 'changed' (+ ' (direct save)' when not via the RPC),
--   performed_by = the user's name from the login token (server jobs: the db role).
-- Clearing a date is logged too (new = null). Saves that don't change the date
-- are not logged.
--
-- It only records: it never blocks or alters a save (AFTER trigger), so stale
-- device saves keep working. Award-date rules (who may set it) stay as they are
-- in set_project_card_fields.
--
-- Idempotent. Tested on production in a rolled-back transaction before applying.
--
-- ROLLBACK (from the Supabase SQL editor; the MCP tools hang on DROP):
--   drop trigger if exists trg_project_cards_award_audit on public.project_cards;
--   drop function if exists public.project_cards_award_audit();
-- (audit_log rows already written stay; they are history.)

create or replace function public.project_cards_award_audit()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_old date := case when tg_op = 'UPDATE' then old.award_date end;
  v_by  text;
  v_rpc boolean := coalesce(current_setting('fabhub.card_rpc', true), '') = 'on';
begin
  if new.award_date is not distinct from v_old then
    return null;
  end if;
  -- A brand-new card with no award date has nothing to record.
  if tg_op = 'INSERT' and new.award_date is null then
    return null;
  end if;
  select name into v_by from public.user_profiles where username = public.app_username();
  insert into public.audit_log(table_name, record_id, action, snapshot, old_snapshot, reason, performed_by, performed_at, changed_fields)
  values ('project_cards', new.deal_id::text, 'award_date_change',
          jsonb_build_object('award_date', new.award_date, 'via', case when v_rpc then 'rpc' else 'direct' end, 'first_set', v_old is null),
          jsonb_build_object('award_date', v_old),
          case when v_old is null then 'first set' else 'changed' end || case when v_rpc then '' else ' (direct save)' end,
          coalesce(v_by, nullif(public.app_username(), ''), current_user), now(), array['award_date']);
  return null;
end $$;
revoke execute on function public.project_cards_award_audit() from public, anon, authenticated;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_project_cards_award_audit' and tgrelid = 'public.project_cards'::regclass) then
    create trigger trg_project_cards_award_audit after insert or update of award_date on public.project_cards
      for each row execute function public.project_cards_award_audit();
  end if;
end $$;
