-- Migration: Department Modules
-- Separate dept environment: projects, tasks, assistant chats, and project sub-modules
-- All tables are fully isolated from owner's projects table

-- ─── Helper: updated_at trigger ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- ─── 1. Dept Projects ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dept_projects (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  dept_id      uuid        NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  workspace_id uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         text        NOT NULL,
  description  text,
  status       text        NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active', 'paused', 'completed', 'archived')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER dept_projects_updated_at
  BEFORE UPDATE ON dept_projects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE dept_projects ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_dept_projects_dept ON dept_projects(dept_id, status);

DROP POLICY IF EXISTS "dept_projects_select" ON dept_projects;
CREATE POLICY "dept_projects_select" ON dept_projects FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.user_id = auth.uid() AND m.status = 'active'
      AND (m.department_id = dept_id OR m.workspace_id = workspace_id)
  ) OR
  EXISTS (SELECT 1 FROM workspaces w WHERE w.id = workspace_id AND w.owner_id = auth.uid())
);

DROP POLICY IF EXISTS "dept_projects_insert" ON dept_projects;
CREATE POLICY "dept_projects_insert" ON dept_projects FOR INSERT WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "dept_projects_update" ON dept_projects;
CREATE POLICY "dept_projects_update" ON dept_projects FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM memberships m WHERE m.user_id = auth.uid() AND m.status = 'active'
      AND (m.department_id = dept_id OR m.workspace_id = workspace_id)
  ) OR
  EXISTS (SELECT 1 FROM workspaces w WHERE w.id = workspace_id AND w.owner_id = auth.uid())
);

DROP POLICY IF EXISTS "dept_projects_delete" ON dept_projects;
CREATE POLICY "dept_projects_delete" ON dept_projects FOR DELETE USING (
  created_by = auth.uid() OR
  EXISTS (SELECT 1 FROM workspaces w WHERE w.id = workspace_id AND w.owner_id = auth.uid())
);

-- ─── 2. Dept Project Tasks ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dept_project_tasks (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  dept_project_id uuid        NOT NULL REFERENCES dept_projects(id) ON DELETE CASCADE,
  dept_id         uuid        NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  created_by      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_to     uuid        REFERENCES auth.users(id),
  title           text        NOT NULL,
  description     text,
  status          text        NOT NULL DEFAULT 'todo'
                              CHECK (status IN ('todo','in_progress','review','done','cancelled')),
  priority        text        NOT NULL DEFAULT 'medium'
                              CHECK (priority IN ('low','medium','high','urgent')),
  due_date        date,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dept_project_tasks ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_dept_tasks_project ON dept_project_tasks(dept_project_id, status);
CREATE INDEX IF NOT EXISTS idx_dept_tasks_assigned ON dept_project_tasks(assigned_to, status);

DROP POLICY IF EXISTS "dept_project_tasks_select" ON dept_project_tasks;
CREATE POLICY "dept_project_tasks_select" ON dept_project_tasks FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM memberships m WHERE m.user_id = auth.uid() AND m.status = 'active'
      AND m.department_id = dept_id
  ) OR
  EXISTS (
    SELECT 1 FROM dept_projects dp
    JOIN workspaces w ON w.id = dp.workspace_id
    WHERE dp.id = dept_project_id AND w.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "dept_project_tasks_insert" ON dept_project_tasks;
CREATE POLICY "dept_project_tasks_insert" ON dept_project_tasks FOR INSERT WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "dept_project_tasks_update" ON dept_project_tasks;
CREATE POLICY "dept_project_tasks_update" ON dept_project_tasks FOR UPDATE USING (
  created_by = auth.uid() OR assigned_to = auth.uid()
);

DROP POLICY IF EXISTS "dept_project_tasks_delete" ON dept_project_tasks;
CREATE POLICY "dept_project_tasks_delete" ON dept_project_tasks FOR DELETE USING (created_by = auth.uid());

-- ─── 3. Dept Project Updates ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dept_project_updates (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  dept_project_id uuid        NOT NULL REFERENCES dept_projects(id) ON DELETE CASCADE,
  dept_id         uuid        NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content         text        NOT NULL,
  update_type     text        NOT NULL DEFAULT 'general'
                              CHECK (update_type IN ('general','blocker','milestone','review')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dept_project_updates ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_dept_updates_project ON dept_project_updates(dept_project_id, created_at);

DROP POLICY IF EXISTS "dept_project_updates_select" ON dept_project_updates;
CREATE POLICY "dept_project_updates_select" ON dept_project_updates FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM memberships m WHERE m.user_id = auth.uid() AND m.status = 'active'
      AND m.department_id = dept_id
  ) OR
  EXISTS (
    SELECT 1 FROM dept_projects dp
    JOIN workspaces w ON w.id = dp.workspace_id
    WHERE dp.id = dept_project_id AND w.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "dept_project_updates_insert" ON dept_project_updates;
CREATE POLICY "dept_project_updates_insert" ON dept_project_updates FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "dept_project_updates_delete" ON dept_project_updates;
CREATE POLICY "dept_project_updates_delete" ON dept_project_updates FOR DELETE USING (user_id = auth.uid());

-- ─── 4. Dept Chat Messages (per-user dept assistant) ─────────────────────────
CREATE TABLE IF NOT EXISTS dept_chat_messages (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  dept_id     uuid        NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        text        NOT NULL CHECK (role IN ('user', 'assistant')),
  content     text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dept_chat_messages ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_dept_chat_user ON dept_chat_messages(dept_id, user_id, created_at);

DROP POLICY IF EXISTS "dept_chat_select" ON dept_chat_messages;
CREATE POLICY "dept_chat_select" ON dept_chat_messages FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "dept_chat_insert" ON dept_chat_messages;
CREATE POLICY "dept_chat_insert" ON dept_chat_messages FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "dept_chat_delete" ON dept_chat_messages;
CREATE POLICY "dept_chat_delete" ON dept_chat_messages FOR DELETE USING (user_id = auth.uid());

-- ─── 5. Dept Project Chat Messages (per-user project assistant) ───────────────
CREATE TABLE IF NOT EXISTS dept_project_chat_messages (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  dept_project_id uuid        NOT NULL REFERENCES dept_projects(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            text        NOT NULL CHECK (role IN ('user', 'assistant')),
  content         text        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dept_project_chat_messages ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_dept_proj_chat ON dept_project_chat_messages(dept_project_id, user_id, created_at);

DROP POLICY IF EXISTS "dept_proj_chat_select" ON dept_project_chat_messages;
CREATE POLICY "dept_proj_chat_select" ON dept_project_chat_messages FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "dept_proj_chat_insert" ON dept_project_chat_messages;
CREATE POLICY "dept_proj_chat_insert" ON dept_project_chat_messages FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "dept_proj_chat_delete" ON dept_project_chat_messages;
CREATE POLICY "dept_proj_chat_delete" ON dept_project_chat_messages FOR DELETE USING (user_id = auth.uid());

-- ─── 6. Dept Project Decisions ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dept_project_decisions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  dept_project_id uuid        NOT NULL REFERENCES dept_projects(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           text        NOT NULL,
  context         text        NOT NULL,
  verdict         text,
  outcome         text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dept_project_decisions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_dept_decisions_project ON dept_project_decisions(dept_project_id, created_at);

DROP POLICY IF EXISTS "dept_decisions_select" ON dept_project_decisions;
CREATE POLICY "dept_decisions_select" ON dept_project_decisions FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM dept_projects dp
    JOIN memberships m ON m.department_id = dp.dept_id
    WHERE dp.id = dept_project_id AND m.user_id = auth.uid() AND m.status = 'active'
  ) OR
  EXISTS (
    SELECT 1 FROM dept_projects dp
    JOIN workspaces w ON w.id = dp.workspace_id
    WHERE dp.id = dept_project_id AND w.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "dept_decisions_insert" ON dept_project_decisions;
CREATE POLICY "dept_decisions_insert" ON dept_project_decisions FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "dept_decisions_update" ON dept_project_decisions;
CREATE POLICY "dept_decisions_update" ON dept_project_decisions FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "dept_decisions_delete" ON dept_project_decisions;
CREATE POLICY "dept_decisions_delete" ON dept_project_decisions FOR DELETE USING (user_id = auth.uid());

-- ─── 7. Dept Project Rules ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dept_project_rules (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  dept_project_id uuid        NOT NULL REFERENCES dept_projects(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rule_text       text        NOT NULL,
  severity        int         NOT NULL DEFAULT 2 CHECK (severity IN (1,2,3)),
  active          boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dept_project_rules ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_dept_rules_project ON dept_project_rules(dept_project_id, active);

DROP POLICY IF EXISTS "dept_rules_select" ON dept_project_rules;
CREATE POLICY "dept_rules_select" ON dept_project_rules FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM dept_projects dp
    JOIN memberships m ON m.department_id = dp.dept_id
    WHERE dp.id = dept_project_id AND m.user_id = auth.uid() AND m.status = 'active'
  ) OR
  EXISTS (
    SELECT 1 FROM dept_projects dp
    JOIN workspaces w ON w.id = dp.workspace_id
    WHERE dp.id = dept_project_id AND w.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "dept_rules_insert" ON dept_project_rules;
CREATE POLICY "dept_rules_insert" ON dept_project_rules FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "dept_rules_update" ON dept_project_rules;
CREATE POLICY "dept_rules_update" ON dept_project_rules FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "dept_rules_delete" ON dept_project_rules;
CREATE POLICY "dept_rules_delete" ON dept_project_rules FOR DELETE USING (user_id = auth.uid());

-- ─── 8. Dept Project Research ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dept_project_research (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  dept_project_id uuid        NOT NULL REFERENCES dept_projects(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic           text        NOT NULL,
  notes           text        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dept_project_research ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_dept_research_project ON dept_project_research(dept_project_id, created_at);

DROP POLICY IF EXISTS "dept_research_select" ON dept_project_research;
CREATE POLICY "dept_research_select" ON dept_project_research FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM dept_projects dp
    JOIN memberships m ON m.department_id = dp.dept_id
    WHERE dp.id = dept_project_id AND m.user_id = auth.uid() AND m.status = 'active'
  ) OR
  EXISTS (
    SELECT 1 FROM dept_projects dp
    JOIN workspaces w ON w.id = dp.workspace_id
    WHERE dp.id = dept_project_id AND w.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "dept_research_insert" ON dept_project_research;
CREATE POLICY "dept_research_insert" ON dept_project_research FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "dept_research_delete" ON dept_project_research;
CREATE POLICY "dept_research_delete" ON dept_project_research FOR DELETE USING (user_id = auth.uid());

-- ─── 9. Dept Project Documents ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dept_project_documents (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  dept_project_id uuid        NOT NULL REFERENCES dept_projects(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           text        NOT NULL,
  content         text        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dept_project_documents ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_dept_documents_project ON dept_project_documents(dept_project_id, created_at);

DROP POLICY IF EXISTS "dept_documents_select" ON dept_project_documents;
CREATE POLICY "dept_documents_select" ON dept_project_documents FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM dept_projects dp
    JOIN memberships m ON m.department_id = dp.dept_id
    WHERE dp.id = dept_project_id AND m.user_id = auth.uid() AND m.status = 'active'
  ) OR
  EXISTS (
    SELECT 1 FROM dept_projects dp
    JOIN workspaces w ON w.id = dp.workspace_id
    WHERE dp.id = dept_project_id AND w.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "dept_documents_insert" ON dept_project_documents;
CREATE POLICY "dept_documents_insert" ON dept_project_documents FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "dept_documents_delete" ON dept_project_documents;
CREATE POLICY "dept_documents_delete" ON dept_project_documents FOR DELETE USING (user_id = auth.uid());
