-- ── Migration 010: remove duplicated suppliers / subcontractors ──────────────
-- The app's seed effect ran before the async cloud load populated local state,
-- so every fresh browser session re-inserted the entire seed list (fixed in
-- the app alongside this migration). This keeps the OLDEST row per company
-- name (case/whitespace-insensitive) and deletes the copies.
-- Safe to run repeatedly. POs reference suppliers by name (text), not by id,
-- so deleting duplicate rows does not affect any purchase order.

DELETE FROM suppliers
WHERE id NOT IN (
  SELECT DISTINCT ON (lower(trim(company_name))) id
    FROM suppliers
   ORDER BY lower(trim(company_name)), created_at ASC NULLS LAST, id
);

DELETE FROM subcontractors
WHERE id NOT IN (
  SELECT DISTINCT ON (lower(trim(company_name))) id
    FROM subcontractors
   ORDER BY lower(trim(company_name)), created_at ASC NULLS LAST, id
);
