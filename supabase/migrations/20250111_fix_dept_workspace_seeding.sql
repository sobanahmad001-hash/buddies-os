-- Migration 20250111: Restore departments RLS policies and seed defaults
-- Wrapped in a transaction — either ALL changes apply or NONE do.
-- Safe to run after a failed previous attempt.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

-- ── 1. Ensure columns exist ─────────────────────────────────────────────────
ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS slug         text,
  ADD COLUMN IF NOT EXISTS color        text;

-- ── 2. Unique constraint ────────────────────────────────────────────────────
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

-- ── 3. Restore RLS policies (dropped by a previously failed migration run) ──
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

-- Drop everything first so we get a clean slate
DROP POLICY IF EXISTS "dept_members_read"    ON departments;
DROP POLICY IF EXISTS "dept_owner_write"     ON departments;
DROP POLICY IF EXISTS "dept_workspace_read"  ON departments;
DROP POLICY IF EXISTS "dept_workspace_write" ON departments;

-- Workspace owners and active members can read departments
CREATE POLICY "dept_workspace_read" ON departments
  FOR SELECT USING (
    workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())
    OR workspace_id IN (
      SELECT workspace_id FROM memberships
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- Only workspace owners can create / update / delete departments
CREATE POLICY "dept_workspace_write" ON departments
  FOR ALL USING (
    workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())
  );

-- ── 4. Seed Design / Development / Marketing for all workspaces ─────────────
INSERT INTO departments (workspace_id, name, slug, color)
SELECT w.id, 'Design', 'design', '#8B5CF6'
FROM workspaces w
WHERE NOT EXISTS (
  SELECT 1 FROM departments d WHERE d.workspace_id = w.id AND d.slug = 'design'
);

INSERT INTO departments (workspace_id, name, slug, color)
SELECT w.id, 'Development', 'development', '#3B82F6'
FROM workspaces w
WHERE NOT EXISTS (
  SELECT 1 FROM departments d WHERE d.workspace_id = w.id AND d.slug = 'development'
);

INSERT INTO departments (workspace_id, name, slug, color)
SELECT w.id, 'Marketing', 'marketing', '#10B981'
FROM workspaces w
WHERE NOT EXISTS (
  SELECT 1 FROM departments d WHERE d.workspace_id = w.id AND d.slug = 'marketing'
);

-- ── 5. Backfill slugs / colors on any old rows ──────────────────────────────
UPDATE departments SET slug = 'design'      WHERE slug IS NULL AND LOWER(name) LIKE '%design%';
UPDATE departments SET slug = 'development' WHERE slug IS NULL AND LOWER(name) LIKE '%develop%';
UPDATE departments SET slug = 'marketing'   WHERE slug IS NULL AND LOWER(name) LIKE '%marketing%';

UPDATE departments SET color = '#8B5CF6' WHERE slug = 'design'      AND (color IS NULL OR color = '');
UPDATE departments SET color = '#3B82F6' WHERE slug = 'development' AND (color IS NULL OR color = '');
UPDATE departments SET color = '#10B981' WHERE slug = 'marketing'   AND (color IS NULL OR color = '');

COMMIT;
