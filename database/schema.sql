-- Christmas Exchange Gift Roulette
-- Run this in the Supabase SQL Editor (or psql) as a database owner.
-- Safe to re-run: uses IF NOT EXISTS / guarded policy creation.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  event_date TIMESTAMPTZ,
  draw_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (draw_status IN ('draft', 'finalized')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalized_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 80),
  attendance TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (attendance IN ('confirmed', 'tentative', 'not_attending')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_participants_event ON participants(event_id);
CREATE INDEX IF NOT EXISTS idx_participants_event_name ON participants(event_id, display_name);

CREATE TABLE IF NOT EXISTS participant_credentials (
  participant_id UUID PRIMARY KEY REFERENCES participants(id) ON DELETE CASCADE,
  lookup_hash TEXT NOT NULL UNIQUE,
  access_code_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  giver_id UUID NOT NULL REFERENCES participants(id) ON DELETE RESTRICT,
  recipient_id UUID NOT NULL REFERENCES participants(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT assignments_no_self CHECK (giver_id <> recipient_id),
  CONSTRAINT assignments_unique_giver UNIQUE (event_id, giver_id),
  CONSTRAINT assignments_unique_recipient UNIQUE (event_id, recipient_id)
);

CREATE INDEX IF NOT EXISTS idx_assignments_event ON assignments(event_id);

-- express-session store (connect-pg-simple)
CREATE TABLE IF NOT EXISTS session (
  sid VARCHAR NOT NULL PRIMARY KEY,
  sess JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_session_expire ON session (expire);

-- Default event for this outing (no-op if one already exists)
INSERT INTO events (name, event_date, draw_status)
SELECT 'Christmas Exchange Gift', TIMESTAMPTZ '2026-12-25 18:00:00+08', 'draft'
WHERE NOT EXISTS (SELECT 1 FROM events);

-- Row Level Security: deny PostgREST anon/authenticated access.
-- The Node server connects with the database password (bypasses RLS as the
-- table owner / superuser). Never put the service-role key in frontend files.
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE participant_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE session ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'deny_all_admins') THEN
    CREATE POLICY deny_all_admins ON admins FOR ALL USING (false) WITH CHECK (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'deny_all_events') THEN
    CREATE POLICY deny_all_events ON events FOR ALL USING (false) WITH CHECK (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'deny_all_participants') THEN
    CREATE POLICY deny_all_participants ON participants FOR ALL USING (false) WITH CHECK (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'deny_all_credentials') THEN
    CREATE POLICY deny_all_credentials ON participant_credentials FOR ALL USING (false) WITH CHECK (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'deny_all_assignments') THEN
    CREATE POLICY deny_all_assignments ON assignments FOR ALL USING (false) WITH CHECK (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'deny_all_session') THEN
    CREATE POLICY deny_all_session ON session FOR ALL USING (false) WITH CHECK (false);
  END IF;
END $$;
