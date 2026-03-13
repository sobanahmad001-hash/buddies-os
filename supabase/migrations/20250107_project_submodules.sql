-- Migration: Project Sub-Modules
-- Tables: project_chat_messages, project_decisions, project_rules, project_research, project_documents
-- Run in Supabase SQL Editor

-- ─── 1. Project Chat Messages ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_chat_messages (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        text        NOT NULL CHECK (role IN ('user', 'assistant')),
  content     text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE project_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_chat_select" ON project_chat_messages;
CREATE POLICY "project_chat_select" ON project_chat_messages
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "project_chat_insert" ON project_chat_messages;
CREATE POLICY "project_chat_insert" ON project_chat_messages
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "project_chat_delete" ON project_chat_messages;
CREATE POLICY "project_chat_delete" ON project_chat_messages
  FOR DELETE USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_project_chat_project ON project_chat_messages(project_id, created_at);

-- ─── 2. Project Decisions ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_decisions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       text        NOT NULL,
  context     text        NOT NULL,
  verdict     text,
  outcome     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE project_decisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_decisions_select" ON project_decisions;
CREATE POLICY "project_decisions_select" ON project_decisions
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "project_decisions_insert" ON project_decisions;
CREATE POLICY "project_decisions_insert" ON project_decisions
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "project_decisions_update" ON project_decisions;
CREATE POLICY "project_decisions_update" ON project_decisions
  FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "project_decisions_delete" ON project_decisions;
CREATE POLICY "project_decisions_delete" ON project_decisions
  FOR DELETE USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_project_decisions_project ON project_decisions(project_id, created_at);

-- ─── 3. Project Rules ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_rules (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rule_text   text        NOT NULL,
  severity    int         NOT NULL DEFAULT 2 CHECK (severity IN (1, 2, 3)), -- 1=Low, 2=Medium, 3=High
  active      boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE project_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_rules_select" ON project_rules;
CREATE POLICY "project_rules_select" ON project_rules
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "project_rules_insert" ON project_rules;
CREATE POLICY "project_rules_insert" ON project_rules
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "project_rules_update" ON project_rules;
CREATE POLICY "project_rules_update" ON project_rules
  FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "project_rules_delete" ON project_rules;
CREATE POLICY "project_rules_delete" ON project_rules
  FOR DELETE USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_project_rules_project ON project_rules(project_id, active);

-- ─── 4. Project Research ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_research (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic       text        NOT NULL,
  notes       text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE project_research ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_research_select" ON project_research;
CREATE POLICY "project_research_select" ON project_research
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "project_research_insert" ON project_research;
CREATE POLICY "project_research_insert" ON project_research
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "project_research_delete" ON project_research;
CREATE POLICY "project_research_delete" ON project_research
  FOR DELETE USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_project_research_project ON project_research(project_id, created_at);

-- ─── 5. Project Documents ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_documents (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       text        NOT NULL,
  content     text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE project_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_documents_select" ON project_documents;
CREATE POLICY "project_documents_select" ON project_documents
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "project_documents_insert" ON project_documents;
CREATE POLICY "project_documents_insert" ON project_documents
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "project_documents_delete" ON project_documents;
CREATE POLICY "project_documents_delete" ON project_documents
  FOR DELETE USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_project_documents_project ON project_documents(project_id, created_at);
