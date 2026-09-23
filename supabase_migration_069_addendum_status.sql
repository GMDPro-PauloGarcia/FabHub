-- ── Migration 069: addendum approval status on deals ─────────────────────────
-- Adds an explicit approval flag for addendum (child) deals so the contract
-- roll-up is driven by "did the client approve this addendum?" rather than by
-- the workflow stage.
--
-- Why a dedicated flag instead of reusing the stage:
--   An APPROVED addendum inherits its parent project's stage (it follows the
--   live project). That parent stage may or may not be a "won" stage, so keying
--   the Total-Contract roll-up off the stage alone would under- or over-count.
--   The flag is the single source of truth; the stage is kept in sync for
--   display and pipeline grouping (src/App.jsx ContractBreakdown / changeStage).
--
-- Values: 'Pending' (awaiting client approval — sits in "If pending approved",
-- does NOT inflate the contract) or 'Approved' (rolled into Total Contract).
-- NULL for standalone (non-addendum) deals.
--
-- No RLS change: this is a new column on an existing table already covered by
-- the deals policies. Idempotent via IF NOT EXISTS.

ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS addendum_status text;

-- Backfill existing child deals so nothing changes visually on deploy:
--   • a child already in a won stage was an approved addendum → 'Approved'
--   • every other child was implicitly pending → 'Pending'
-- Standalone deals (no parent) stay NULL.
UPDATE public.deals SET addendum_status = 'Approved'
 WHERE parent_deal_id IS NOT NULL
   AND addendum_status IS NULL
   AND stage IN (
     '06 · Kickoff','07 · Briefing','08 · Fabrication','09 · Site & Billing',
     '10 · Installation','11 · Punchlist','12 · Close-Out','14 · Completed'
   );

UPDATE public.deals SET addendum_status = 'Pending'
 WHERE parent_deal_id IS NOT NULL
   AND addendum_status IS NULL;
