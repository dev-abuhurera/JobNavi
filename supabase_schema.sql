
-- ================================================================
-- Job Search Agent - Supabase Schema (Reset Script)
-- WARNING: Drops existing tables and their data.
-- ================================================================
 
DROP TABLE IF EXISTS screenshots CASCADE;
DROP TABLE IF EXISTS portal_sessions CASCADE;
DROP TABLE IF EXISTS portal_accounts CASCADE;
DROP TABLE IF EXISTS message_history CASCADE;
DROP TABLE IF EXISTS pending_approvals CASCADE;
DROP TABLE IF EXISTS applications CASCADE;
DROP TABLE IF EXISTS files CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP TABLE IF EXISTS jobs CASCADE;
DROP TABLE IF EXISTS discovery_tasks CASCADE;
DROP TABLE IF EXISTS activity_logs CASCADE;
DROP TABLE IF EXISTS linkedin_sessions CASCADE;
 
-- ──────────────────────────────────────────────
-- 1. JOBS
-- ──────────────────────────────────────────────
CREATE TABLE jobs (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    company     TEXT NOT NULL,
    location    TEXT,
    source      TEXT,
    source_url  TEXT,
    description TEXT,
    tech_stack  JSONB DEFAULT '[]',
    fit_score   NUMERIC(5,2),
    status      TEXT DEFAULT 'discovered',
    recruiter_email TEXT,
    recruiter_phone TEXT,
    application_type TEXT,
    posting_date DATE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, source_url)
);
CREATE INDEX idx_jobs_user_created ON jobs(user_id, created_at DESC);
CREATE INDEX idx_jobs_user_status ON jobs(user_id, status);
CREATE INDEX idx_jobs_user_status_fit ON jobs(user_id, status, fit_score DESC);
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner access" ON jobs FOR ALL
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
 
-- ──────────────────────────────────────────────
-- 2. PROFILES
-- ──────────────────────────────────────────────
CREATE TABLE profiles (
    user_id       UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    profile_data  JSONB NOT NULL DEFAULT '{}',
    resume_path   TEXT,
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner access" ON profiles FOR ALL
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
 
-- ──────────────────────────────────────────────
-- 3. FILES
-- ──────────────────────────────────────────────
CREATE TABLE files (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    filename    TEXT NOT NULL,
    file_type   TEXT NOT NULL,
    data        TEXT NOT NULL,
    job_id      BIGINT REFERENCES jobs(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_files_user ON files(user_id, created_at DESC);
ALTER TABLE files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner access" ON files FOR ALL
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
 
-- ──────────────────────────────────────────────
-- 4. APPLICATIONS
-- ──────────────────────────────────────────────
CREATE TABLE applications (
    id                   BIGSERIAL PRIMARY KEY,
    user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    job_id               BIGINT REFERENCES jobs(id) ON DELETE CASCADE,
    job_title            TEXT,
    company              TEXT,
    location             TEXT,
    source               TEXT,
    source_url           TEXT,
    date_found           TIMESTAMPTZ DEFAULT NOW(),
    date_applied         TIMESTAMPTZ,
    current_status       TEXT DEFAULT 'discovered',
    fit_score            NUMERIC(5,2),
    resume_version_used  TEXT,
    next_action          TEXT DEFAULT 'Review and Tailor',
    notes                TEXT DEFAULT '',
    activity_log         JSONB DEFAULT '[]',
    created_at           TIMESTAMPTZ DEFAULT NOW(),
    updated_at           TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, job_id)
);
CREATE INDEX idx_apps_user_created ON applications(user_id, created_at DESC);
CREATE INDEX idx_apps_user_status ON applications(user_id, current_status);
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner access" ON applications FOR ALL
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
 
-- ──────────────────────────────────────────────
-- 5. MESSAGE HISTORY
-- ──────────────────────────────────────────────
CREATE TABLE message_history (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    application_id  BIGINT REFERENCES applications(id) ON DELETE SET NULL,
    channel         TEXT NOT NULL,
    recipient       TEXT,
    content         TEXT,
    sent_at         TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_msg_user ON message_history(user_id, sent_at DESC);
ALTER TABLE message_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner access" ON message_history FOR ALL
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
 
-- ──────────────────────────────────────────────
-- 6. PORTAL ACCOUNTS (credentials - owner only)
-- ──────────────────────────────────────────────
CREATE TABLE portal_accounts (
    user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    portal        TEXT NOT NULL,
    username      TEXT NOT NULL,
    password_enc  TEXT NOT NULL,
    connected     BOOLEAN DEFAULT TRUE,
    saved_at      TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, portal)
);
ALTER TABLE portal_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner access" ON portal_accounts FOR ALL
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
 
-- ──────────────────────────────────────────────
-- 7. PORTAL SESSIONS
-- ──────────────────────────────────────────────
CREATE TABLE portal_sessions (
    user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    portal        TEXT NOT NULL,
    session_data  TEXT NOT NULL,
    saved_at      TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, portal)
);
ALTER TABLE portal_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner access" ON portal_sessions FOR ALL
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
 
-- ──────────────────────────────────────────────
-- 8. SCREENSHOTS
-- ──────────────────────────────────────────────
CREATE TABLE screenshots (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    application_id  BIGINT REFERENCES applications(id) ON DELETE CASCADE,
    company         TEXT,
    label           TEXT,
    file_path       TEXT,
    image_data      TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_shots_user ON screenshots(user_id, created_at DESC);
ALTER TABLE screenshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner access" ON screenshots FOR ALL
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
 
-- ──────────────────────────────────────────────
-- 9. DISCOVERY TASKS
-- ──────────────────────────────────────────────
CREATE TABLE discovery_tasks (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    keywords    JSONB NOT NULL,
    location    TEXT,
    status      TEXT DEFAULT 'pending',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_tasks_status ON discovery_tasks(status);
CREATE INDEX idx_tasks_user_created ON discovery_tasks(user_id, created_at DESC);
ALTER TABLE discovery_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner access" ON discovery_tasks FOR ALL
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
 
-- ──────────────────────────────────────────────
-- 10. PENDING APPROVALS
-- ──────────────────────────────────────────────
CREATE TABLE pending_approvals (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    application_id  BIGINT REFERENCES applications(id) ON DELETE CASCADE,
    channel         TEXT NOT NULL,
    recipient       TEXT,
    content         JSONB,
    status          TEXT DEFAULT 'pending',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_approvals_user ON pending_approvals(user_id, created_at DESC);
ALTER TABLE pending_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner access" ON pending_approvals FOR ALL
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
 
-- ──────────────────────────────────────────────
-- 11. ACTIVITY LOGS
-- ──────────────────────────────────────────────
CREATE TABLE activity_logs (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    msg         TEXT,
    level       TEXT DEFAULT 'info',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_logs_user_created ON activity_logs(user_id, created_at DESC);
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner access" ON activity_logs FOR ALL
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
 
-- ──────────────────────────────────────────────
-- updated_at triggers
-- ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
 
CREATE TRIGGER set_applications_updated_at
    BEFORE UPDATE ON applications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
 
CREATE TRIGGER set_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
 
CREATE TRIGGER set_tasks_updated_at
    BEFORE UPDATE ON discovery_tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
