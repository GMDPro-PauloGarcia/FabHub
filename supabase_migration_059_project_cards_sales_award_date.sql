-- ── Migration 059: let Sales / SalesOpsAdmin write project_cards ──────────────
-- Fixes: "new row violates row-level security policy for table project_cards"
-- when a Sales or SalesOpsAdmin user sets an award date on a deal (typically an
-- addendum / linked change-order deal) that has no project_card row yet.
--
-- Root cause: the Awarded Projects table exposes an inline award-date editor to
-- Manager / Sales / SalesOpsAdmin (src/App.jsx AwardRow.setCardAwardDate), which
-- upserts into project_cards keyed by deal_id. For a deal with no existing card
-- that upsert becomes an INSERT, but migration 037's project_cards_ins/_upd
-- policies only allow Manager / ProjectMover / Finance — so Sales/SalesOpsAdmin
-- get rejected. The offline write queue retries and then surfaces the
-- "could not be saved after several attempts" toast.
--
-- Why widen the table policy rather than a column-scoped RPC: the whole client
-- write path runs through the offline upsert/retry queue in supabaseClient.js;
-- there is no rpc plumbing, and a bespoke RPC for one column would bypass that
-- resilience and diverge from the pattern. Postgres RLS also can't express a
-- clean column-level WITH CHECK. Sales already has full SELECT on project_cards
-- (sel=AUTH), and the app gives Sales no UI surface to edit the other columns
-- (TAT, PM assignments, manual progress, turnover) — those live behind
-- Manager/PM-only screens. So the practical exposure is the award-date edit the
-- UI already intends. award_date is really a sales-owned datum (it drives the
-- Awarded / Sales-Value report month, awardedMonth in App.jsx) that happens to
-- live on project_cards.
--
-- Mirrors migration 037's generated policies; replaying 037 after this file
-- would revert it, so keep both role lists in sync (037 spec + this file).

alter table public.project_cards enable row level security;

drop policy if exists project_cards_ins on public.project_cards;
create policy project_cards_ins on public.project_cards
  for insert to authenticated
  with check ( public.has_role('Manager','ProjectMover','Finance','Sales','SalesOpsAdmin') );

drop policy if exists project_cards_upd on public.project_cards;
create policy project_cards_upd on public.project_cards
  for update to authenticated
  using ( public.has_role('Manager','ProjectMover','Finance','Sales','SalesOpsAdmin') )
  with check ( public.has_role('Manager','ProjectMover','Finance','Sales','SalesOpsAdmin') );
