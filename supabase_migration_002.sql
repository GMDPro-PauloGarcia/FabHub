-- ============================================================
-- FabHub Migration 002 — User profiles + realtime fixes
-- Run this in Supabase SQL Editor after Migration 001
-- ============================================================

-- ── USER PROFILES: recreate with correct schema ─────────────
-- The original table used UUID FK to auth.users, but FabHub
-- uses its own password-hash auth with text IDs like "u1234567890".
-- Drop and recreate with TEXT primary key and all required fields.

DROP TABLE IF EXISTS user_profiles CASCADE;

CREATE TABLE user_profiles (
  id            TEXT PRIMARY KEY,
  name          TEXT,
  username      TEXT UNIQUE,
  role          TEXT DEFAULT 'Sales',
  title         TEXT,
  status        TEXT DEFAULT 'active',
  password_hash TEXT,
  email         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Re-enable RLS on the recreated table
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_full_access" ON user_profiles;
CREATE POLICY "authenticated_full_access" ON user_profiles
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Allow anon reads for login (username/password lookup)
DROP POLICY IF EXISTS "anon_read" ON user_profiles;
CREATE POLICY "anon_read" ON user_profiles
  FOR SELECT TO anon USING (true);

-- ── REALTIME: enable for checklists + swatches ──────────────
-- Without this, checklist/swatch changes from other users
-- won't appear in real-time — users must refresh to see updates.

ALTER PUBLICATION supabase_realtime ADD TABLE checklists;
ALTER PUBLICATION supabase_realtime ADD TABLE swatches;

-- ── Done ────────────────────────────────────────────────────
SELECT 'Migration 002 applied successfully' AS status;
