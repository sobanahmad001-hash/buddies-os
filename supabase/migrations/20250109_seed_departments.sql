-- Migration: Ensure departments have workspace_id, slug, and color columns
-- AND seed default design/development/marketing departments per workspace
-- Run this in Supabase SQL Editor AFTER 20250108_dept_modules.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Add missing columns to departments table (safe if already exist)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS slug         text,
  ADD COLUMN IF NOT EXISTS color        text;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Add unique constraint so we don't get duplicate depts per workspace
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'departments_workspace_slug_unique'
  ) THEN
    ALTER TABLE departments ADD CONSTRAINT departments_workspace_slug_unique UNIQUE (workspace_id, slug);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Seed Design, Development, and Marketing departments for every workspace
--    that doesn't already have them
-- ─────────────────────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Backfill slugs for departments that have names but no slugs
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE departments SET slug = 'design'      WHERE slug IS NULL AND LOWER(name) LIKE '%design%';
UPDATE departments SET slug = 'development' WHERE slug IS NULL AND LOWER(name) LIKE '%develop%';
UPDATE departments SET slug = 'marketing'   WHERE slug IS NULL AND LOWER(name) LIKE '%marketing%';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Backfill colors for departments with known slugs but no color
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE departments SET color = '#8B5CF6' WHERE slug = 'design'      AND (color IS NULL OR color = '');
UPDATE departments SET color = '#3B82F6' WHERE slug = 'development' AND (color IS NULL OR color = '');
UPDATE departments SET color = '#10B981' WHERE slug = 'marketing'   AND (color IS NULL OR color = '');

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Index for fast workspace+slug lookups
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_departments_workspace_slug ON departments(workspace_id, slug);

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification: Check your departments after running
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT w.name as workspace, d.name, d.slug, d.color
-- FROM departments d JOIN workspaces w ON w.id = d.workspace_id
-- ORDER BY w.name, d.name;
