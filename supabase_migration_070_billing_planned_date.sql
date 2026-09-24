-- ── Migration 070: planned billing date + milestone type ─────────────────────
-- The Milestone Builder gives every milestone a type (Down payment / Progress /
-- Final / Retention / Other) and a target date to raise the invoice, pre-filled
-- from the project schedule (Final = punchlist sign-off). A dedicated column is
-- needed: invoice_date on a Draft is just the day the schedule was created, so
-- reusing it would flag 115 existing Drafts as "late to bill".
-- Both columns are nullable and only written when set, so older rows and
-- manually-added milestones are untouched.
alter table public.billing_milestones add column if not exists planned_bill_date date;
alter table public.billing_milestones add column if not exists ms_type text;

-- ROLLBACK:
--   alter table public.billing_milestones drop column if exists planned_bill_date;
--   alter table public.billing_milestones drop column if exists ms_type;
