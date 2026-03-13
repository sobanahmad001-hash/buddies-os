-- ═══════════════════════════════════════════════════════════════════════════
-- Fix: Departments schema + seed Development department
-- Run this in Supabase SQL Editor (Project → SQL Editor → New Query)
-- This script is IDEMPOTENT — safe to run multiple times.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Add missing columns to departments ──────────────────────────────────
ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS slug         text,
  ADD COLUMN IF NOT EXISTS color        text;

-- ─── 2. Unique constraint: one dept slug per workspace ───────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'departments_workspace_slug_unique'
  ) THEN
    ALTER TABLE departments
      ADD CONSTRAINT departments_workspace_slug_unique UNIQUE (workspace_id, slug);
  END IF;
END $$;

-- ─── 3. Fast lookup index ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_departments_workspace_slug ON departments(workspace_id, slug);

-- ─── 4. RLS: allow workspace owners and members to read/write ────────────────
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dept_workspace_read"  ON departments;
DROP POLICY IF EXISTS "dept_workspace_write" ON departments;

CREATE POLICY "dept_workspace_read" ON departments
  FOR SELECT USING (
    workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())
    OR workspace_id IN (
      SELECT workspace_id FROM memberships
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "dept_workspace_write" ON departments
  FOR ALL USING (
    workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())
  );

-- ─── 5. Seed Design, Development, Marketing for every workspace ──────────────
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

-- ─── 6. Backfill any old slug-less rows ──────────────────────────────────────
UPDATE departments SET slug = 'design'      WHERE slug IS NULL AND LOWER(name) LIKE '%design%';
UPDATE departments SET slug = 'development' WHERE slug IS NULL AND LOWER(name) LIKE '%develop%';
UPDATE departments SET slug = 'marketing'   WHERE slug IS NULL AND LOWER(name) LIKE '%marketing%';

UPDATE departments SET color = '#8B5CF6' WHERE slug = 'design'      AND (color IS NULL OR color = '');
UPDATE departments SET color = '#3B82F6' WHERE slug = 'development' AND (color IS NULL OR color = '');
UPDATE departments SET color = '#10B981' WHERE slug = 'marketing'   AND (color IS NULL OR color = '');

-- ─── 7. dept_projects table ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

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
  EXISTS (SELECT 1 FROM workspaces w WHERE w.id = workspace_id AND w.owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = auth.uid() AND m.status = 'active'
    AND (m.department_id = dept_id OR m.workspace_id = workspace_id))
);

DROP POLICY IF EXISTS "dept_projects_insert" ON dept_projects;
CREATE POLICY "dept_projects_insert" ON dept_projects FOR INSERT WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "dept_projects_update" ON dept_projects;
CREATE POLICY "dept_projects_update" ON dept_projects FOR UPDATE USING (
  EXISTS (SELECT 1 FROM workspaces w WHERE w.id = workspace_id AND w.owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = auth.uid() AND m.status = 'active'
    AND (m.department_id = dept_id OR m.workspace_id = workspace_id))
);

DROP POLICY IF EXISTS "dept_projects_delete" ON dept_projects;
CREATE POLICY "dept_projects_delete" ON dept_projects FOR DELETE USING (
  created_by = auth.uid()
  OR EXISTS (SELECT 1 FROM workspaces w WHERE w.id = workspace_id AND w.owner_id = auth.uid())
);

-- ─── 8. dept_project_tasks table ─────────────────────────────────────────────
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
CREATE INDEX IF NOT EXISTS idx_dept_tasks_dept     ON dept_project_tasks(dept_id);

DROP POLICY IF EXISTS "dept_tasks_select" ON dept_project_tasks;
CREATE POLICY "dept_tasks_select" ON dept_project_tasks FOR SELECT USING (
  EXISTS (SELECT 1 FROM dept_projects dp WHERE dp.id = dept_project_id
    AND (EXISTS (SELECT 1 FROM workspaces w WHERE w.id = dp.workspace_id AND w.owner_id = auth.uid())
      OR EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = auth.uid() AND m.status = 'active'
        AND (m.department_id = dp.dept_id OR m.workspace_id = dp.workspace_id))))
);

DROP POLICY IF EXISTS "dept_tasks_insert" ON dept_project_tasks;
CREATE POLICY "dept_tasks_insert" ON dept_project_tasks FOR INSERT WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "dept_tasks_update" ON dept_project_tasks;
CREATE POLICY "dept_tasks_update" ON dept_project_tasks FOR UPDATE USING (
  created_by = auth.uid() OR assigned_to = auth.uid()
);

DROP POLICY IF EXISTS "dept_tasks_delete" ON dept_project_tasks;
CREATE POLICY "dept_tasks_delete" ON dept_project_tasks FOR DELETE USING (
  created_by = auth.uid()
  OR EXISTS (SELECT 1 FROM dept_projects dp
    JOIN workspaces w ON w.id = dp.workspace_id
    WHERE dp.id = dept_project_id AND w.owner_id = auth.uid())
);

-- ─── Verify ───────────────────────────────────────────────────────────────────
-- SELECT w.name AS workspace, d.name AS dept, d.slug, d.color
-- FROM departments d
-- JOIN workspaces w ON w.id = d.workspace_id
-- ORDER BY w.name, d.name;
