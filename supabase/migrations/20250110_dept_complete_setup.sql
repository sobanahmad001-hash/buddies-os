-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 20250110: Complete Department Setup
-- Run this in Supabase SQL Editor to activate ALL department features.
-- It is idempotent — safe to run multiple times.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 0. Helpers ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- ─── 1. Departments table: add workspace_id, slug, color if missing ──────────
ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS slug         text,
  ADD COLUMN IF NOT EXISTS color        text;

-- Unique constraint: one dept per slug per workspace
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'departments_workspace_slug_unique'
  ) THEN
    ALTER TABLE departments
      ADD CONSTRAINT departments_workspace_slug_unique UNIQUE (workspace_id, slug);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_departments_workspace_slug ON departments(workspace_id, slug);

-- RLS: allow workspace owners and active members to read departments by workspace_id
-- (The old policy only covers organization_id which is NULL on workspace-seeded rows)
DROP POLICY IF EXISTS "dept_workspace_read"  ON departments;
DROP POLICY IF EXISTS "dept_workspace_write" ON departments;

CREATE POLICY "dept_workspace_read" ON departments
  FOR SELECT USING (
    workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())
    OR workspace_id IN (
      SELECT workspace_id FROM memberships WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "dept_workspace_write" ON departments
  FOR ALL USING (
    workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())
  );

-- ─── 2. Dept Projects ────────────────────────────────────────────────────────
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

DROP TRIGGER IF EXISTS dept_projects_updated_at ON dept_projects;
CREATE TRIGGER dept_projects_updated_at
  BEFORE UPDATE ON dept_projects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE dept_projects ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_dept_projects_dept ON dept_projects(dept_id, status);

DROP POLICY IF EXISTS "dept_projects_select" ON dept_projects;
CREATE POLICY "dept_projects_select" ON dept_projects FOR SELECT USING (
  EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = auth.uid() AND m.status = 'active'
    AND (m.department_id = dept_id OR m.workspace_id = workspace_id))
  OR EXISTS (SELECT 1 FROM workspaces w WHERE w.id = workspace_id AND w.owner_id = auth.uid())
);

DROP POLICY IF EXISTS "dept_projects_insert" ON dept_projects;
CREATE POLICY "dept_projects_insert" ON dept_projects FOR INSERT WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "dept_projects_update" ON dept_projects;
CREATE POLICY "dept_projects_update" ON dept_projects FOR UPDATE USING (
  EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = auth.uid() AND m.status = 'active'
    AND (m.department_id = dept_id OR m.workspace_id = workspace_id))
  OR EXISTS (SELECT 1 FROM workspaces w WHERE w.id = workspace_id AND w.owner_id = auth.uid())
);

DROP POLICY IF EXISTS "dept_projects_delete" ON dept_projects;
CREATE POLICY "dept_projects_delete" ON dept_projects FOR DELETE USING (
  created_by = auth.uid()
  OR EXISTS (SELECT 1 FROM workspaces w WHERE w.id = workspace_id AND w.owner_id = auth.uid())
);

-- ─── 3. Dept Project Tasks ───────────────────────────────────────────────────
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
CREATE INDEX IF NOT EXISTS idx_dept_tasks_project  ON dept_project_tasks(dept_project_id, status);
CREATE INDEX IF NOT EXISTS idx_dept_tasks_assigned ON dept_project_tasks(assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_dept_tasks_dept     ON dept_project_tasks(dept_id);

DROP POLICY IF EXISTS "dept_tasks_select" ON dept_project_tasks;
CREATE POLICY "dept_tasks_select" ON dept_project_tasks FOR SELECT USING (
  EXISTS (SELECT 1 FROM dept_projects dp WHERE dp.id = dept_project_id
    AND (EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = auth.uid() AND m.status = 'active'
                 AND (m.department_id = dp.dept_id OR m.workspace_id = dp.workspace_id))
         OR EXISTS (SELECT 1 FROM workspaces w WHERE w.id = dp.workspace_id AND w.owner_id = auth.uid())))
);

DROP POLICY IF EXISTS "dept_tasks_insert" ON dept_project_tasks;
CREATE POLICY "dept_tasks_insert" ON dept_project_tasks FOR INSERT WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "dept_tasks_update" ON dept_project_tasks;
CREATE POLICY "dept_tasks_update" ON dept_project_tasks FOR UPDATE USING (
  created_by = auth.uid() OR assigned_to = auth.uid()
);

DROP POLICY IF EXISTS "dept_tasks_delete" ON dept_project_tasks;
CREATE POLICY "dept_tasks_delete" ON dept_project_tasks FOR DELETE USING (created_by = auth.uid());

-- ─── 4. Dept Decisions ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dept_decisions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  dept_project_id uuid        REFERENCES dept_projects(id) ON DELETE CASCADE,
  dept_id         uuid        NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  workspace_id    uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  context         text        NOT NULL,
  options         text,
  verdict         text        CHECK (verdict IN ('proceed','pause','reject','pending')),
  rationale       text,
  probability     int         CHECK (probability BETWEEN 0 AND 100),
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dept_decisions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_dept_decisions_dept ON dept_decisions(dept_id);

DROP POLICY IF EXISTS "dept_decisions_all" ON dept_decisions;
CREATE POLICY "dept_decisions_all" ON dept_decisions USING (
  EXISTS (SELECT 1 FROM workspaces w WHERE w.id = workspace_id AND w.owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = auth.uid() AND m.status = 'active'
             AND m.workspace_id = workspace_id)
);

-- ─── 5. Dept Documents ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dept_documents (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  dept_project_id uuid        REFERENCES dept_projects(id) ON DELETE CASCADE,
  dept_id         uuid        NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  workspace_id    uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           text        NOT NULL,
  content         text,
  doc_type        text        DEFAULT 'note',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dept_documents ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_dept_docs_dept ON dept_documents(dept_id);

DROP POLICY IF EXISTS "dept_docs_all" ON dept_documents;
CREATE POLICY "dept_docs_all" ON dept_documents USING (
  EXISTS (SELECT 1 FROM workspaces w WHERE w.id = workspace_id AND w.owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = auth.uid() AND m.status = 'active'
             AND m.workspace_id = workspace_id)
);

-- ─── 6. Dept Chat Messages ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dept_chat_messages (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  dept_id    uuid        NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       text        NOT NULL CHECK (role IN ('user', 'assistant')),
  content    text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dept_chat_messages ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_dept_chat_user ON dept_chat_messages(dept_id, user_id, created_at);

DROP POLICY IF EXISTS "dept_chat_select" ON dept_chat_messages;
CREATE POLICY "dept_chat_select" ON dept_chat_messages FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "dept_chat_insert" ON dept_chat_messages;
CREATE POLICY "dept_chat_insert" ON dept_chat_messages FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "dept_chat_delete" ON dept_chat_messages;
CREATE POLICY "dept_chat_delete" ON dept_chat_messages FOR DELETE USING (user_id = auth.uid());

-- ─── 7. Dept Research Notes ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dept_research (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  dept_project_id uuid        REFERENCES dept_projects(id) ON DELETE CASCADE,
  dept_id         uuid        NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  workspace_id    uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           text        NOT NULL,
  content         text,
  source_url      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dept_research ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dept_research_all" ON dept_research;
CREATE POLICY "dept_research_all" ON dept_research USING (
  EXISTS (SELECT 1 FROM workspaces w WHERE w.id = workspace_id AND w.owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = auth.uid() AND m.status = 'active'
             AND m.workspace_id = workspace_id)
);

-- ─── 8. Dept Rules ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dept_rules (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  dept_id      uuid        NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  workspace_id uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rule_text    text        NOT NULL,
  severity     text        DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  active       boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dept_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dept_rules_all" ON dept_rules;
CREATE POLICY "dept_rules_all" ON dept_rules USING (
  EXISTS (SELECT 1 FROM workspaces w WHERE w.id = workspace_id AND w.owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = auth.uid() AND m.status = 'active'
             AND m.workspace_id = workspace_id)
);

-- ─── 9. Seed Design / Development / Marketing departments for all workspaces ─
INSERT INTO departments (workspace_id, name, slug, color)
SELECT w.id, 'Design', 'design', '#8B5CF6'
FROM workspaces w
WHERE NOT EXISTS (
  SELECT 1 FROM departments d WHERE d.workspace_id = w.id AND d.slug = 'design'
)
ON CONFLICT (workspace_id, slug) DO NOTHING;

INSERT INTO departments (workspace_id, name, slug, color)
SELECT w.id, 'Development', 'development', '#3B82F6'
FROM workspaces w
WHERE NOT EXISTS (
  SELECT 1 FROM departments d WHERE d.workspace_id = w.id AND d.slug = 'development'
)
ON CONFLICT (workspace_id, slug) DO NOTHING;

INSERT INTO departments (workspace_id, name, slug, color)
SELECT w.id, 'Marketing', 'marketing', '#10B981'
FROM workspaces w
WHERE NOT EXISTS (
  SELECT 1 FROM departments d WHERE d.workspace_id = w.id AND d.slug = 'marketing'
)
ON CONFLICT (workspace_id, slug) DO NOTHING;

-- Backfill slugs for departments that have names but no slugs
UPDATE departments SET slug = 'design'      WHERE slug IS NULL AND LOWER(name) LIKE '%design%';
UPDATE departments SET slug = 'development' WHERE slug IS NULL AND LOWER(name) LIKE '%develop%';
UPDATE departments SET slug = 'marketing'   WHERE slug IS NULL AND LOWER(name) LIKE '%marketing%';
UPDATE departments SET color = '#8B5CF6' WHERE slug = 'design'      AND (color IS NULL OR color = '');
UPDATE departments SET color = '#3B82F6' WHERE slug = 'development' AND (color IS NULL OR color = '');
UPDATE departments SET color = '#10B981' WHERE slug = 'marketing'   AND (color IS NULL OR color = '');

-- ─── 10. Dept project sub-tables (linked to dept_projects) ──────────────────
-- Reuse same pattern; these piggyback on dept_projects via FK

-- Project-level chat (separate from dept-level chat messages)
CREATE TABLE IF NOT EXISTS dept_project_chat (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  dept_project_id uuid        NOT NULL REFERENCES dept_projects(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            text        NOT NULL CHECK (role IN ('user','assistant')),
  content         text        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dept_project_chat ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_proj_chat_proj ON dept_project_chat(dept_project_id, created_at);

DROP POLICY IF EXISTS "dept_proj_chat_select" ON dept_project_chat;
CREATE POLICY "dept_proj_chat_select" ON dept_project_chat FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "dept_proj_chat_insert" ON dept_project_chat;
CREATE POLICY "dept_proj_chat_insert" ON dept_project_chat FOR INSERT WITH CHECK (user_id = auth.uid());

-- ─── Verification ─────────────────────────────────────────────────────────────
-- After running, visit /api/debug/context to confirm:
-- • migration_status shows ✅ for dept tables
-- • dept_data.departments lists design / development / marketing
--
-- SELECT w.name AS workspace, d.name, d.slug, d.color
-- FROM departments d JOIN workspaces w ON w.id = d.workspace_id
-- ORDER BY w.name, d.name;
