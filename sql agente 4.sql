/* 
 * MISSION FINDER AI - SCHEMA DATABASE COMPLETO (PostgreSQL 17 / Supabase)
 * Engine: W-MOON Architecture
 * Include: Tabelle, Indici, RLS Security, Seed Data
 */

-- ======================================================================================
-- 0. CONFIGURAZIONE INIZIALE & PULIZIA
-- ======================================================================================

-- Estensioni necessarie
CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- per gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- per ricerca testo

-- Schema di lavoro
SET search_path TO public;

-- Pulizia (consente il re-run dello script)
DROP TABLE IF EXISTS ai_audit_log CASCADE;
DROP TABLE IF EXISTS gamification_progress CASCADE;
DROP TABLE IF EXISTS earnings CASCADE;
DROP TABLE IF EXISTS user_mission_history CASCADE;
DROP TABLE IF EXISTS mission_filters CASCADE;
DROP TABLE IF EXISTS missions CASCADE;
DROP TABLE IF EXISTS user_ai_profile CASCADE;
DROP TABLE IF EXISTS user_preferences CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ======================================================================================
-- 1. DEFINIZIONE TABELLE (DDL)
-- ======================================================================================

-- 1. USERS: Profilo base e autenticazione
CREATE TABLE users (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email          VARCHAR(255) UNIQUE NOT NULL,
    password_hash  VARCHAR(255) NOT NULL,
    full_name      VARCHAR(100),
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    last_active_at TIMESTAMPTZ DEFAULT NOW(),
    status         VARCHAR(20) DEFAULT 'active'
                   CHECK (status IN ('active', 'banned', 'inactive'))
);

-- 2. USER_PREFERENCES: Preferenze statiche e vincoli
CREATE TABLE user_preferences (
    user_id              UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    min_hourly_rate      DECIMAL(10, 2) DEFAULT 15.00,
    currency             VARCHAR(3) DEFAULT 'USD',
    work_hours_start     TIME DEFAULT '09:00',
    work_hours_end       TIME DEFAULT '17:00',
    blocked_keywords     TEXT[] DEFAULT '{}',
    preferred_categories TEXT[] DEFAULT '{}',
    hard_constraints     JSONB DEFAULT '{}'::jsonb
);

-- 3. USER_AI_PROFILE: Pesi W-MOON + meta AI
CREATE TABLE user_ai_profile (
    user_id        UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    skill_vector   JSONB DEFAULT '{}'::jsonb,
    weights        JSONB NOT NULL,          -- 9 pesi W-MOON
    learning_rate  DECIMAL(5, 4) DEFAULT 0.0500,
    risk_tolerance DECIMAL(3, 2) DEFAULT 0.50,
    beta_stats     JSONB DEFAULT '{"alpha": 5, "beta": 5}'::jsonb,
    last_updated   TIMESTAMPTZ DEFAULT NOW()
);

-- 4. MISSIONS: Missioni inserite manualmente (Raw Data)
CREATE TABLE missions (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                  UUID REFERENCES users(id) ON DELETE CASCADE,
    title                    VARCHAR(255) NOT NULL,
    description              TEXT,
    source_url               TEXT,
    raw_category             VARCHAR(50),
    reward_amount            DECIMAL(10, 2),
    estimated_duration_hours DECIMAL(6, 2),
    deadline                 TIMESTAMPTZ,
    status                   VARCHAR(20) DEFAULT 'pending'
                             CHECK (status IN ('pending', 'scored', 'archived')),
    created_at               TIMESTAMPTZ DEFAULT NOW()
);

-- 5. MISSION_FILTERS: Risultati Scoring AI (Output W-MOON)
CREATE TABLE mission_filters (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mission_id       UUID REFERENCES missions(id) ON DELETE CASCADE,
    user_id          UUID REFERENCES users(id) ON DELETE CASCADE,
    total_score      DECIMAL(5, 2) NOT NULL,  -- 0.00–100.00
    factors_breakdown JSONB NOT NULL,         -- es: {"x1":0.8,"x2":0.4,...}
    is_scam          BOOLEAN DEFAULT FALSE,
    scam_reason      VARCHAR(255),
    calculated_at    TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_mission_scoring UNIQUE (mission_id, user_id)
);

-- 6. USER_MISSION_HISTORY: Tracciamento interazioni e feedback
CREATE TABLE user_mission_history (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID REFERENCES users(id) ON DELETE CASCADE,
    mission_id       UUID REFERENCES missions(id) ON DELETE CASCADE,
    action           VARCHAR(20)
                     CHECK (action IN ('viewed', 'accepted', 'rejected', 'completed', 'hidden')),
    feedback_rating  INT CHECK (feedback_rating BETWEEN 1 AND 5),
    action_timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- 7. EARNINGS: Registro finanziario
CREATE TABLE earnings (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    mission_id  UUID REFERENCES missions(id) ON DELETE SET NULL,
    amount      DECIMAL(10, 2) NOT NULL,
    status      VARCHAR(20) DEFAULT 'verified'
                CHECK (status IN ('pending', 'verified', 'paid')),
    received_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. GAMIFICATION_PROGRESS: Livelli e Streaks
CREATE TABLE gamification_progress (
    user_id             UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    current_level       INT DEFAULT 1,
    xp_points           INT DEFAULT 0,
    current_streak_days INT DEFAULT 0,
    longest_streak_days INT DEFAULT 0,
    badges_earned       JSONB DEFAULT '[]'::jsonb,
    last_activity_date  DATE DEFAULT CURRENT_DATE
);

-- 9. AI_AUDIT_LOG: Trasparenza decisionale
CREATE TABLE ai_audit_log (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID REFERENCES users(id) ON DELETE CASCADE,
    mission_id       UUID REFERENCES missions(id) ON DELETE CASCADE,
    decision_type    VARCHAR(50) NOT NULL,   -- 'SCAM_BLOCK', 'HIGH_SCORE', 'WEIGHT_UPDATE', ...
    explanation      TEXT NOT NULL,
    snapshot_weights JSONB,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ======================================================================================
-- 2. INDICI (PERFORMANCE)
-- ======================================================================================

-- Users
CREATE INDEX idx_users_email
    ON users(email);

-- Missions
CREATE INDEX idx_missions_user_status
    ON missions(user_id, status);

CREATE INDEX idx_missions_description_gin
    ON missions
    USING gin (to_tsvector('english', description));

-- Mission Filters
CREATE INDEX idx_mission_filters_score
    ON mission_filters(user_id, total_score DESC);

CREATE INDEX idx_mission_filters_scam
    ON mission_filters(is_scam);

-- History
CREATE INDEX idx_history_user_action
    ON user_mission_history(user_id, action);

-- Audit Log
CREATE INDEX idx_audit_log_created
    ON ai_audit_log(created_at DESC);

-- ======================================================================================
-- 3. ROW LEVEL SECURITY (RLS)
-- ======================================================================================
-- Si assume che l'app setti:  set_config('app.current_user_id', <uuid>, true);

ALTER TABLE users                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences      ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_ai_profile       ENABLE ROW LEVEL SECURITY;
ALTER TABLE missions              ENABLE ROW LEVEL SECURITY;
ALTER TABLE mission_filters       ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_mission_history  ENABLE ROW LEVEL SECURITY;
ALTER TABLE earnings              ENABLE ROW LEVEL SECURITY;
ALTER TABLE gamification_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_audit_log          ENABLE ROW LEVEL SECURITY;

-- USERS: ogni utente vede solo se stesso
CREATE POLICY users_isolation
    ON users
    USING (id = current_setting('app.current_user_id', true)::uuid)
    WITH CHECK (id = current_setting('app.current_user_id', true)::uuid);

-- USER_PREFERENCES
CREATE POLICY prefs_isolation
    ON user_preferences
    USING (user_id = current_setting('app.current_user_id', true)::uuid)
    WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid);

-- USER_AI_PROFILE
CREATE POLICY ai_profile_isolation
    ON user_ai_profile
    USING (user_id = current_setting('app.current_user_id', true)::uuid)
    WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid);

-- MISSIONS
CREATE POLICY missions_isolation
    ON missions
    USING (user_id = current_setting('app.current_user_id', true)::uuid)
    WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid);

-- MISSION_FILTERS
CREATE POLICY filters_isolation
    ON mission_filters
    USING (user_id = current_setting('app.current_user_id', true)::uuid)
    WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid);

-- USER_MISSION_HISTORY
CREATE POLICY history_isolation
    ON user_mission_history
    USING (user_id = current_setting('app.current_user_id', true)::uuid)
    WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid);

-- EARNINGS
CREATE POLICY earnings_isolation
    ON earnings
    USING (user_id = current_setting('app.current_user_id', true)::uuid)
    WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid);

-- GAMIFICATION_PROGRESS
CREATE POLICY gamification_isolation
    ON gamification_progress
    USING (user_id = current_setting('app.current_user_id', true)::uuid)
    WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid);

-- AI_AUDIT_LOG
CREATE POLICY audit_isolation
    ON ai_audit_log
    USING (user_id = current_setting('app.current_user_id', true)::uuid)
    WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid);

-- ======================================================================================
-- 4. SEED DATA (DATI DI TEST)
-- ======================================================================================

DO $$
DECLARE 
    new_user_id    UUID;
    new_mission_id UUID;
BEGIN
    -- 1) Utente demo
    INSERT INTO users (email, password_hash, full_name) 
    VALUES ('marco@example.com', 'hashed_secret_123', 'Marco Rossi')
    RETURNING id INTO new_user_id;

    -- Simula "login" per superare RLS nelle insert successive
    PERFORM set_config('app.current_user_id', new_user_id::text, false);

    -- 2) Preferenze utente
    INSERT INTO user_preferences (user_id, min_hourly_rate, blocked_keywords)
    VALUES (
        new_user_id,
        25.00,
        '{"gambling", "adult", "casino"}'
    );

    -- 3) Profilo AI iniziale
    INSERT INTO user_ai_profile (user_id, weights, skill_vector)
    VALUES (
        new_user_id,
        '{
            "x1_skill": 0.15,
            "x2_time": 0.20,
            "x3_success": 0.10,
            "x4_safety": 0.20,
            "x5_growth": 0.10,
            "x6_utility": 0.10,
            "x7_urgency": 0.05,
            "x8_habit": 0.05,
            "x9_trust": 0.05
        }',
        '{"python": 0.9, "sql": 0.8, "writing": 0.4}'
    );

    -- 4) Missione di test
    INSERT INTO missions (
        user_id,
        title,
        description,
        reward_amount,
        estimated_duration_hours,
        deadline
    )
    VALUES (
        new_user_id,
        'Sviluppo API Python per E-commerce',
        'Creare endpoint REST per gestione utenti. Richiesto FastAPI e PostgreSQL.',
        150.00,
        3.0,
        NOW() + INTERVAL '2 days'
    )
    RETURNING id INTO new_mission_id;

    -- 5) Risultato scoring AI di esempio
    INSERT INTO mission_filters (
        mission_id,
        user_id,
        total_score,
        factors_breakdown,
        is_scam
    )
    VALUES (
        new_mission_id,
        new_user_id,
        87.50,
        '{"x1": 0.95, "x2": 0.88, "x3": 0.70, "x4": 1.0, "x5": 0.60}',
        FALSE
    );

    -- 6) Log AI
    INSERT INTO ai_audit_log (
        user_id,
        mission_id,
        decision_type,
        explanation
    )
    VALUES (
        new_user_id,
        new_mission_id,
        'HIGH_SCORE',
        'Mission promoted due to perfect skill match (Python) and high ROTI ($50/hr).'
    );

    -- 7) Gamification di esempio
    INSERT INTO gamification_progress (
        user_id,
        current_level,
        xp_points
    )
    VALUES (
        new_user_id,
        2,
        450
    );
END $$;

-- FINE SCRIPT
