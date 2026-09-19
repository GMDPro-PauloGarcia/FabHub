-- ============================================================================
-- Diageo PH — partial / duplicate award triage
-- ============================================================================
-- Context: fixing Jessica's (SalesOpsAdmin) award failures surfaced 27 "Diageo PH"
-- deal rows, most of them partially awarded — a project card with no checklist
-- tasks, or an awarded-stage deal with no job order and no starting budget. That
-- is the residue of the two award bugs (project_cards PK reassignment + the
-- project_budgets RLS block) firing over time.
--
-- This script is READ-ONLY. It classifies the rows so a human can decide which are
-- real, which are duplicates, and which need a re-award once the frontend fix
-- deploys. The remediation statements at the bottom are COMMENTED OUT on purpose —
-- do NOT run them until someone who knows these deals has reviewed section 1.
--
-- Run each section separately.
-- ============================================================================


-- ── 1. Completeness matrix for every Diageo deal ────────────────────────────
-- One row per deal. Read `verdict` first:
--   OK            — awarded and fully provisioned (card + 39 tasks + budget + JO)
--   NEEDS_REAWARD — past BizDev but missing JO / budget / checklist -> re-award
--                   after the frontend fix deploys (or backfill manually)
--   PRE_AWARD     — still in an early stage; nothing expected yet
--   REVIEW        — has some artifacts but an odd combination; eyeball it
select
  d.id,
  d.client,
  d.stage,
  (select count(*) from project_cards pc            where pc.deal_id = d.id) as cards,
  (select count(*) from project_card_dept_tasks t
     join project_cards pc on pc.id = t.card_id      where pc.deal_id = d.id) as dept_tasks,
  (select count(*) from project_budgets b            where b.deal_id = d.id) as budgets,
  (select count(*) from job_orders j                 where j.deal_id = d.id) as job_orders,
  case
    when d.stage like '01%' then 'PRE_AWARD'
    when (select count(*) from project_cards pc where pc.deal_id = d.id) >= 1
     and (select count(*) from project_card_dept_tasks t join project_cards pc on pc.id=t.card_id where pc.deal_id=d.id) >= 1
     and (select count(*) from project_budgets b where b.deal_id = d.id) >= 1
     and (select count(*) from job_orders j where j.deal_id = d.id) >= 1
      then 'OK'
    when (select count(*) from job_orders j where j.deal_id = d.id) = 0
      or (select count(*) from project_budgets b where b.deal_id = d.id) = 0
      or (select count(*) from project_card_dept_tasks t join project_cards pc on pc.id=t.card_id where pc.deal_id=d.id) = 0
      then 'NEEDS_REAWARD'
    else 'REVIEW'
  end as verdict
from deals d
where d.client ilike '%diageo%'
order by verdict, d.stage, d.id;


-- ── 2. Likely duplicate deals (same client + same CE number) ────────────────
-- Multiple deal rows sharing a CE number almost always means the same project
-- was entered / awarded more than once. Keep the most complete row, retire the
-- rest. Blank/NULL ce_no rows are grouped separately so they don't false-match.
select
  d.ce_no,
  count(*)                                    as deal_count,
  array_agg(d.id order by d.id)               as deal_ids,
  array_agg(d.stage order by d.id)            as stages
from deals d
where d.client ilike '%diageo%'
  and coalesce(nullif(trim(d.ce_no), ''), null) is not null
group by d.ce_no
having count(*) > 1
order by deal_count desc;


-- ── 3. Orphaned checklist tasks (the actual FK-corruption residue) ──────────
-- project_card_dept_tasks whose card_id no longer points at any project_cards
-- row. This is exactly what the PK-reassignment bug produced. Should be zero;
-- if not, these are dead rows safe to delete (see remediation 3 below).
select t.id, t.card_id, t.department, t.task_text
from project_card_dept_tasks t
left join project_cards pc on pc.id = t.card_id
where pc.id is null
order by t.card_id;


-- ── 4. Cards with no checklist tasks ────────────────────────────────────────
-- A project card that never got its ~39 department tasks. After the frontend
-- fix, re-running the award (or a manual "create card") repopulates these
-- WITHOUT reassigning the card id. Listed here so you know which to re-trigger.
select pc.id as card_id, pc.deal_id, d.client, d.stage
from project_cards pc
join deals d on d.id = pc.deal_id
where d.client ilike '%diageo%'
  and not exists (select 1 from project_card_dept_tasks t where t.card_id = pc.id)
order by d.stage, pc.deal_id;


-- ============================================================================
-- REMEDIATION — DO NOT RUN UNTIL SECTION 1 HAS BEEN REVIEWED BY SOMEONE WHO
-- KNOWS THESE DEALS. Uncomment one block at a time, fill in the reviewed ids,
-- and run inside a transaction so you can ROLLBACK if the row counts look wrong.
-- ============================================================================

-- 3. Delete orphaned checklist tasks confirmed in section 3:
-- begin;
--   delete from project_card_dept_tasks t
--   where not exists (select 1 from project_cards pc where pc.id = t.card_id);
--   -- check the row count, then:  commit;  (or rollback;)

-- 2. Retire confirmed-duplicate deals. Replace the id list with the losers you
--    picked in section 2 (keep the most complete row per CE number). Deletes
--    cascade to their project cards + checklist rows via ON DELETE CASCADE, so
--    make sure the id you KEEP is the complete one BEFORE deleting the others.
-- begin;
--   -- select first to confirm you have the right rows:
--   -- select id, client, stage, ce_no from deals where id in ('<loser-id-1>','<loser-id-2>');
--   -- delete from deals where id in ('<loser-id-1>','<loser-id-2>');
--   -- check the row count, then:  commit;  (or rollback;)

-- 1/4. There is no safe bulk "re-award" in SQL — awarding runs client logic
--      (doc-number claim, checklist seeding, budget split). For NEEDS_REAWARD
--      rows, have the deal owner re-click 🏆 in the app AFTER the frontend fix
--      deploys, or backfill project_budgets manually with a reviewed split.
