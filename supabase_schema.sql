-- ================================================================
-- Job Search Agent – Full Supabase Schema (Reset Script)
-- WARNING: This will delete existing data in these tables.
-- Run this entire script in the Supabase SQL Editor:
--   https://supabase.com/dashboard/project/wwrqegjtneakbytbynlb/sql/new
-- ================================================================

-- DROP existing tables to ensure a clean update
DROP TABLE IF EXISTS screenshots CASCADE;
DROP TABLE IF EXISTS portal_sessions CASCADE;
DROP TABLE IF EXISTS portal_accounts CASCADE;
DROP TABLE IF EXISTS message_history CASCADE;
DROP TABLE IF EXISTS applications CASCADE;
DROP TABLE IF EXISTS files CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP TABLE IF EXISTS jobs CASCADE;
DROP TABLE IF EXISTS linkedin_sessions CASCADE; -- Clean up old table

-- ──────────────────────────────────────────────
-- 1. JOBS (Discovered job listings)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jobs (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID NOT NULL,        -- Scoping to user
    title       TEXT NOT NULL,
    company     TEXT NOT NULL,
    location    TEXT,
    source      TEXT,                 -- e.g. 'linkedin', 'indeed'
    source_url  TEXT,
    description TEXT,
    tech_stack  JSONB DEFAULT '[]',
    fit_score   NUMERIC(5,2),
    recruiter_email TEXT,
    recruiter_phone TEXT,
    application_type TEXT,            -- e.g. 'linkedin_easy_apply'
    posting_date DATE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, source_url)       -- Prevent duplicates for same user
);

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON jobs FOR ALL USING (true) WITH CHECK (true);

-- ──────────────────────────────────────────────
-- 2. PROFILES (Extracted user profile & preferences)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
    user_id       UUID PRIMARY KEY,
    profile_data  JSONB NOT NULL DEFAULT '{}',
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON profiles FOR ALL USING (true) WITH CHECK (true);

-- ──────────────────────────────────────────────
-- 3. FILES (CV, Resumes, Cover Letters)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS files (
    id          UUID PRIMARY KEY,
    user_id     UUID NOT NULL,
    filename    TEXT NOT NULL,
    file_type   TEXT NOT NULL,        -- 'cv', 'tailored_resume', 'cover_letter'
    data        TEXT NOT NULL,        -- Base64 encoded
    job_id      BIGINT REFERENCES jobs(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON files FOR ALL USING (true) WITH CHECK (true);

-- ──────────────────────────────────────────────
-- 4. APPLICATIONS (Tracked job applications)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS applications (
    id                   BIGSERIAL PRIMARY KEY,
    user_id              UUID NOT NULL,
    job_title            TEXT,
    company              TEXT,
    location             TEXT,
    source               TEXT,
    date_found           TIMESTAMPTZ DEFAULT NOW(),
    date_applied         TIMESTAMPTZ,
    current_status       TEXT DEFAULT 'discovered',
    fit_score            NUMERIC(5,2),
    resume_version_used  TEXT,
    next_action          TEXT DEFAULT 'Review and Tailor',
    notes                TEXT DEFAULT '',
    activity_log         JSONB DEFAULT '[]',
    created_at           TIMESTAMPTZ DEFAULT NOW(),
    updated_at           TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON applications FOR ALL USING (true) WITH CHECK (true);

-- ──────────────────────────────────────────────
-- 5. MESSAGE HISTORY (Outreach log)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS message_history (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID NOT NULL,
    application_id  BIGINT REFERENCES applications(id) ON DELETE SET NULL,
    channel         TEXT NOT NULL,   -- email | linkedin | whatsapp
    recipient       TEXT,
    content         TEXT,
    sent_at         TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE message_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON message_history FOR ALL USING (true) WITH CHECK (true);

-- ──────────────────────────────────────────────
-- 6. PORTAL ACCOUNTS (External credentials)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS portal_accounts (
    user_id       UUID NOT NULL,
    portal        TEXT NOT NULL,      -- linkedin | indeed | rozee | mustakbil | gmail
    username      TEXT NOT NULL,
    password_enc  TEXT NOT NULL,      -- Fernet encrypted
    connected     BOOLEAN DEFAULT TRUE,
    saved_at      TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, portal)
);

ALTER TABLE portal_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON portal_accounts FOR ALL USING (true) WITH CHECK (true);

-- ──────────────────────────────────────────────
-- 7. PORTAL SESSIONS (Browser states)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS portal_sessions (
    user_id       UUID NOT NULL,
    portal        TEXT NOT NULL,
    session_data  TEXT NOT NULL,      -- Base64 encoded JSON
    saved_at      TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, portal)
);

ALTER TABLE portal_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON portal_sessions FOR ALL USING (true) WITH CHECK (true);

-- ──────────────────────────────────────────────
-- 8. SCREENSHOTS (Evidence of application)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS screenshots (
    id              UUID PRIMARY KEY,
    user_id         UUID NOT NULL,
    application_id  BIGINT REFERENCES applications(id) ON DELETE CASCADE,
    label           TEXT,
    image_data      TEXT NOT NULL,    -- Base64 encoded
    taken_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE screenshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON screenshots FOR ALL USING (true) WITH CHECK (true);

-- ──────────────────────────────────────────────
-- Triggers for updated_at
-- ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_applications_updated_at ON applications;
CREATE TRIGGER set_applications_updated_at
    BEFORE UPDATE ON applications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_profiles_updated_at ON profiles;
CREATE TRIGGER set_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ──────────────────────────────────────────────
-- 9. DISCOVERY TASKS (Queue for background jobs)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS discovery_tasks (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID NOT NULL,
    keywords    JSONB NOT NULL,
    location    TEXT,
    status      TEXT DEFAULT 'pending', -- pending | running | completed | failed
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE discovery_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON discovery_tasks FOR ALL USING (true) WITH CHECK (true);

-- ──────────────────────────────────────────────
-- 10. PENDING APPROVALS (Review queue)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pending_approvals (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID NOT NULL,
    application_id  BIGINT REFERENCES applications(id) ON DELETE CASCADE,
    channel         TEXT NOT NULL,
    recipient       TEXT,
    content         JSONB,
    status          TEXT DEFAULT 'pending',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE pending_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON pending_approvals FOR ALL USING (true) WITH CHECK (true);

-- ──────────────────────────────────────────────
-- 11. ACTIVITY LOGS (Real-time agent stream)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_logs (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID NOT NULL,
    msg         TEXT,
    level       TEXT DEFAULT 'info',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON activity_logs FOR ALL USING (true) WITH CHECK (true);
