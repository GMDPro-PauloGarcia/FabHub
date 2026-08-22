-- Migration 052: Lead origin on deals (sales commission input)
-- Records how the client came to the sales team, which sets the commission
-- rate the deal's sales owner earns on cash collected:
--   'Self-sourced' — the AE brought the client in            → 1.5%
--   'Given'        — the client was handed to the sales team  → 0.5%
-- Commission accrues on amount_paid (cash collected), so this column only
-- selects the rate; see commissionRate/commissionEarned in src/core.js.
-- Defaults to 'Given' (the conservative lower rate) so no existing or new
-- deal is ever over-credited by omission until the origin is set explicitly.

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS lead_origin text NOT NULL DEFAULT 'Given'
  CHECK (lead_origin IN ('Given','Self-sourced'));

COMMENT ON COLUMN deals.lead_origin IS
  'How the client reached the sales team: "Self-sourced" (AE-originated, 1.5% commission) or "Given" (handed to the team, 0.5%). Sets the commission rate applied to cash collected. Defaults to "Given".';
