-- ============================================================
-- FabHub Migration 002 — User profiles schema fix
-- Run this in Supabase SQL Editor (safe to run multiple times)
-- Note: checklists + swatches already in supabase_realtime publication
-- ============================================================

-- Recreate user_profiles with correct schema.
-- Original table used UUID FK to auth.users which broke all user saves
-- since FabHub uses its own password-hash auth with text IDs (e.g. u1234567890).

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

-- RLS: authenticated users get full access, anon gets read for login lookup
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_full_access" ON user_profiles;
CREATE POLICY "authenticated_full_access" ON user_profiles
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_read" ON user_profiles;
CREATE POLICY "anon_read" ON user_profiles
  FOR SELECT TO anon USING (true);

SELECT 'Migration 002 applied successfully' AS status;
