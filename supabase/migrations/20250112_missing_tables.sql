-- ─────────────────────────────────────────────────────────────────────────────
-- Buddies OS — Missing Tables Migration
-- This creates all tables that are used in code but have no migration.
-- Run in Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Helper ────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

-- ── 1. Workspaces (personal workspace per user) ──────────────────────────────
CREATE TABLE IF NOT EXISTS workspaces (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL DEFAULT 'Personal',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(owner_id)
);
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ws_owner" ON workspaces;
CREATE POLICY "ws_owner" ON workspaces FOR ALL USING (owner_id = auth.uid());

-- ── 2. Memberships ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS memberships (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  department_id UUID        REFERENCES departments(id) ON DELETE SET NULL,
  role          TEXT        NOT NULL DEFAULT 'member',
  status        TEXT        NOT NULL DEFAULT 'active',
  invited_email TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, user_id)
);
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mem_self" ON memberships;
CREATE POLICY "mem_self" ON memberships FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "mem_owner" ON memberships;
CREATE POLICY "mem_owner" ON memberships FOR ALL USING (
  EXISTS (SELECT 1 FROM workspaces w WHERE w.id = workspace_id AND w.owner_id = auth.uid())
);

-- ── 3. Projects (owner's personal projects) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  description TEXT,
  status      TEXT        NOT NULL DEFAULT 'active',
  memory      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "proj_owner" ON projects;
CREATE POLICY "proj_owner" ON projects FOR ALL USING (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_projects_user_status ON projects(user_id, status);

-- ── 4. Project Updates ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_updates (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id        UUID        REFERENCES projects(id) ON DELETE CASCADE,
  content           TEXT        NOT NULL,
  update_type       TEXT        DEFAULT 'progress',
  next_actions      TEXT,
  source_message_id TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE project_updates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pu_owner" ON project_updates;
CREATE POLICY "pu_owner" ON project_updates FOR ALL USING (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_pupdates_project ON project_updates(project_id, created_at);

-- ── 5. Project Tasks ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_tasks (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id        UUID        REFERENCES projects(id) ON DELETE CASCADE,
  title             TEXT        NOT NULL,
  description       TEXT,
  status            TEXT        NOT NULL DEFAULT 'todo',
  priority          INT         DEFAULT 2,
  due_date          DATE,
  source_message_id TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE project_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pt_owner" ON project_tasks;
CREATE POLICY "pt_owner" ON project_tasks FOR ALL USING (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_ptasks_project ON project_tasks(project_id, status);

-- ── 6. Decisions ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS decisions (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id          UUID        REFERENCES projects(id) ON DELETE SET NULL,
  context             TEXT        NOT NULL,
  verdict             TEXT,
  probability         INT,
  domain              TEXT        DEFAULT 'general',
  outcome_rating      TEXT,
  prediction_accuracy NUMERIC,
  review_date         DATE,
  closed_at           TIMESTAMPTZ,
  source_message_id   TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE decisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dec_owner" ON decisions;
CREATE POLICY "dec_owner" ON decisions FOR ALL USING (user_id = auth.uid());

-- ── 7. Rules ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rules (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id        UUID        REFERENCES projects(id) ON DELETE SET NULL,
  rule_text         TEXT        NOT NULL,
  severity          INT         DEFAULT 2,
  active            BOOLEAN     DEFAULT true,
  domain            TEXT        DEFAULT 'general',
  source_message_id TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rules_owner" ON rules;
CREATE POLICY "rules_owner" ON rules FOR ALL USING (user_id = auth.uid());

-- ── 8. Behavior Logs ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS behavior_logs (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mood_tag          TEXT,
  stress            INT,
  sleep_hours       NUMERIC,
  sleep_quality     INT,
  confidence        INT,
  impulse           INT,
  cognitive_score   NUMERIC,
  notes             TEXT,
  source_message_id TEXT,
  timestamp         TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE behavior_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bl_owner" ON behavior_logs;
CREATE POLICY "bl_owner" ON behavior_logs FOR ALL USING (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_blogs_user ON behavior_logs(user_id, timestamp);

-- ── 9. AI Sessions ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_sessions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title      TEXT        DEFAULT 'New session',
  messages   JSONB       DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE ai_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ais_owner" ON ai_sessions;
CREATE POLICY "ais_owner" ON ai_sessions FOR ALL USING (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_aisess_user ON ai_sessions(user_id, updated_at);

-- ── 10. Clients ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID        REFERENCES workspaces(id) ON DELETE CASCADE,
  organization_id UUID,
  created_by      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  email           TEXT,
  phone           TEXT,
  company         TEXT,
  website         TEXT,
  notes           TEXT,
  status          TEXT        NOT NULL DEFAULT 'active',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "clients_ws_owner" ON clients;
CREATE POLICY "clients_ws_owner" ON clients FOR ALL USING (
  EXISTS (SELECT 1 FROM workspaces w WHERE w.id = workspace_id AND w.owner_id = auth.uid())
);
DROP POLICY IF EXISTS "clients_access" ON clients;
CREATE POLICY "clients_access" ON clients FOR SELECT USING (
  id IN (SELECT client_id FROM client_access WHERE user_id = auth.uid())
);

-- ── 11. Client Stages ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS client_stages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  stage_number INT  NOT NULL,
  stage_name   TEXT NOT NULL,
  department   TEXT,
  status       TEXT NOT NULL DEFAULT 'not_started',
  notes        TEXT,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE client_stages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cs_via_client" ON client_stages;
CREATE POLICY "cs_via_client" ON client_stages FOR ALL USING (
  EXISTS (
    SELECT 1 FROM clients c
    JOIN workspaces w ON w.id = c.workspace_id
    WHERE c.id = client_id AND w.owner_id = auth.uid()
  )
);

-- ── 12. Client Keywords ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS client_keywords (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  keyword   TEXT NOT NULL,
  volume    INT,
  difficulty INT,
  status    TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE client_keywords ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ck_via_client" ON client_keywords;
CREATE POLICY "ck_via_client" ON client_keywords FOR ALL USING (
  EXISTS (
    SELECT 1 FROM clients c JOIN workspaces w ON w.id = c.workspace_id
    WHERE c.id = client_id AND w.owner_id = auth.uid()
  )
);

-- ── 13. Client Access ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS client_access (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role      TEXT DEFAULT 'viewer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, user_id)
);
ALTER TABLE client_access ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ca_self" ON client_access;
CREATE POLICY "ca_self" ON client_access FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "ca_owner" ON client_access;
CREATE POLICY "ca_owner" ON client_access FOR ALL USING (
  EXISTS (
    SELECT 1 FROM clients c JOIN workspaces w ON w.id = c.workspace_id
    WHERE c.id = client_id AND w.owner_id = auth.uid()
  )
);

-- ── 14. Insights ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS insights (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  summary          TEXT        NOT NULL,
  insight_type     TEXT,
  domain           TEXT,
  recommended_focus TEXT,
  strength         TEXT,
  confidence_score NUMERIC,
  supporting_records INT,
  time_window      TEXT,
  generated_on     TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE insights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ins_owner" ON insights;
CREATE POLICY "ins_owner" ON insights FOR ALL USING (user_id = auth.uid());

-- ── 15. Predictions ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS predictions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prediction TEXT        NOT NULL,
  confidence NUMERIC,
  domain     TEXT,
  is_active  BOOLEAN     DEFAULT true,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pred_owner" ON predictions;
CREATE POLICY "pred_owner" ON predictions FOR ALL USING (user_id = auth.uid());

-- ── 16. Focus Recommendations ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS focus_recommendations (
  id                            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recommendations               JSONB       NOT NULL DEFAULT '[]',
  based_on_snapshot_date        TEXT,
  cognitive_score_at_generation NUMERIC,
  valid_until                   TIMESTAMPTZ,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE focus_recommendations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fr_owner" ON focus_recommendations;
CREATE POLICY "fr_owner" ON focus_recommendations FOR ALL USING (user_id = auth.uid());

-- ── 17. Analytics Snapshots ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS analytics_snapshots (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot_date       DATE        NOT NULL,
  avg_cognitive_score NUMERIC,
  avg_stress          NUMERIC,
  dominant_mood       TEXT,
  total_decisions     INT,
  total_updates       INT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, snapshot_date)
);
ALTER TABLE analytics_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "as_owner" ON analytics_snapshots;
CREATE POLICY "as_owner" ON analytics_snapshots FOR ALL USING (user_id = auth.uid());

-- ── 18. Uploaded Files ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS uploaded_files (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path   TEXT,
  filename       TEXT        NOT NULL,
  file_type      TEXT,
  file_size      BIGINT,
  extracted_text TEXT,
  summary        TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE uploaded_files ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "uf_owner" ON uploaded_files;
CREATE POLICY "uf_owner" ON uploaded_files FOR ALL USING (user_id = auth.uid());

-- ── 19. Training Logs ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS training_logs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  raw_input        TEXT,
  parsed_output    JSONB,
  was_confirmed    BOOLEAN     DEFAULT false,
  final_output     JSONB,
  source           TEXT,
  intent_detected  TEXT,
  confidence_score NUMERIC,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE training_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tl_owner" ON training_logs;
CREATE POLICY "tl_owner" ON training_logs FOR ALL USING (user_id = auth.uid());

-- ── 20. Rule Violations ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rule_violations (
  id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rule_id   UUID        REFERENCES rules(id) ON DELETE CASCADE,
  context   TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE rule_violations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rv_owner" ON rule_violations;
CREATE POLICY "rv_owner" ON rule_violations FOR ALL USING (user_id = auth.uid());

-- ── 21. Workspace Activity ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspace_activity (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type  TEXT        NOT NULL,
  summary      TEXT,
  metadata     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE workspace_activity ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wa_owner" ON workspace_activity;
CREATE POLICY "wa_owner" ON workspace_activity FOR ALL USING (
  EXISTS (SELECT 1 FROM workspaces w WHERE w.id = workspace_id AND w.owner_id = auth.uid())
);

-- ── 22. Research Sessions ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS research_sessions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic      TEXT        NOT NULL,
  variables  JSONB       DEFAULT '[]',
  status     TEXT        NOT NULL DEFAULT 'running',
  result     JSONB,
  project_id UUID        REFERENCES projects(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE research_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rs_owner" ON research_sessions;
CREATE POLICY "rs_owner" ON research_sessions FOR ALL USING (user_id = auth.uid());

-- ── 23. Integrations ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS integrations (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type       TEXT        NOT NULL,
  name       TEXT        NOT NULL,
  status     TEXT        NOT NULL DEFAULT 'active',
  config     JSONB       DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "int_owner" ON integrations;
CREATE POLICY "int_owner" ON integrations FOR ALL USING (user_id = auth.uid());

-- ── 24. Decision Lessons ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS decision_lessons (
  id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson    TEXT        NOT NULL,
  domain    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE decision_lessons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dl_owner" ON decision_lessons;
CREATE POLICY "dl_owner" ON decision_lessons FOR ALL USING (user_id = auth.uid());

-- ── 25. Project Chat Messages ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_chat_messages (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT        NOT NULL DEFAULT 'user',
  content    TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE project_chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pcm_owner" ON project_chat_messages;
CREATE POLICY "pcm_owner" ON project_chat_messages FOR ALL USING (user_id = auth.uid());

-- ── 26. Project Decisions ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_decisions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  context    TEXT        NOT NULL,
  verdict    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE project_decisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pd_owner" ON project_decisions;
CREATE POLICY "pd_owner" ON project_decisions FOR ALL USING (user_id = auth.uid());

-- ── 27. Project Documents ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_documents (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title      TEXT        NOT NULL,
  content    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE project_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pdoc_owner" ON project_documents;
CREATE POLICY "pdoc_owner" ON project_documents FOR ALL USING (user_id = auth.uid());

-- ── 28. Project Research ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_research (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic      TEXT        NOT NULL,
  findings   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE project_research ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pr_owner" ON project_research;
CREATE POLICY "pr_owner" ON project_research FOR ALL USING (user_id = auth.uid());

-- ── 29. Project Rules ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_rules (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rule_text  TEXT        NOT NULL,
  active     BOOLEAN     DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE project_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "prr_owner" ON project_rules;
CREATE POLICY "prr_owner" ON project_rules FOR ALL USING (user_id = auth.uid());

-- ── Auto-create workspace on first sign-up ───────────────────────────────────
CREATE OR REPLACE FUNCTION auto_create_workspace()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO workspaces (owner_id, name)
  VALUES (NEW.id, 'Personal')
  ON CONFLICT (owner_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auto_workspace ON auth.users;
CREATE TRIGGER trg_auto_workspace
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION auto_create_workspace();
