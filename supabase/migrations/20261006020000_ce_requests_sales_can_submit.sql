-- Sales / SalesOpsAdmin may SUBMIT a CE (costing) request again.
--
-- The app has always had Sales raise CE requests ("Send to CE/QS for Costing"
-- on a new deal, and the CE Requests page). rls_rollout_v2 (applied 2026-08-06)
-- narrowed INSERT to Manager/QS, so every CE request a Sales rep submitted after
-- that was rejected by RLS — it showed on their own screen only and never
-- reached QS. Last Sales-submitted row on the server: 2026-08-04.
--
-- Only INSERT is widened. UPDATE stays Manager/QS, so Sales can raise a request
-- but cannot change QS's costing, bid amount or status afterwards. The app now
-- submits with a plain INSERT (not upsert), which needs nothing more than this.
-- SELECT is unchanged (Sales could already read).

-- ALTER (not drop + create): edits the existing INSERT policy in place, so
-- there is never a moment with no INSERT policy, and re-running is harmless.
alter policy ce_requests_ins on public.ce_requests
  with check (public.has_role('Manager', 'QS', 'Sales', 'SalesOpsAdmin'));

-- ROLLBACK
-- alter policy ce_requests_ins on public.ce_requests
--   with check (public.has_role('Manager', 'QS'));
