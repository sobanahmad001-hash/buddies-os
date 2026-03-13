-- Migration: Design & Development Department Environment Tables
-- Run this in your Supabase SQL Editor

-- ─── 1. Design Environment Configuration ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS design_environment (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid REFERENCES departments(id) ON DELETE CASCADE,
  name          text NOT NULL,
  tool_type     text NOT NULL, -- "image_generation", "video_editing", "design_tool", etc.
  config        jsonb NOT NULL DEFAULT '{}',
  api_keys      jsonb NOT NULL DEFAULT '{}', -- store encrypted/hashed keys only
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE design_environment ENABLE ROW LEVEL SECURITY;

-- Members of the workspace owning the department can manage tools
CREATE POLICY IF NOT EXISTS "design_env_select" ON design_environment
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM departments d
      JOIN memberships m ON m.workspace_id = d.workspace_id
      WHERE d.id = design_environment.department_id
        AND m.user_id = auth.uid()
        AND m.status = 'active'
    )
  );

CREATE POLICY IF NOT EXISTS "design_env_insert" ON design_environment
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM departments d
      JOIN memberships m ON m.workspace_id = d.workspace_id
      WHERE d.id = design_environment.department_id
        AND m.user_id = auth.uid()
        AND m.status = 'active'
    )
  );

CREATE POLICY IF NOT EXISTS "design_env_delete" ON design_environment
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM departments d
      JOIN memberships m ON m.workspace_id = d.workspace_id
      WHERE d.id = design_environment.department_id
        AND m.user_id = auth.uid()
        AND m.status = 'active'
    )
  );

-- ─── 2. Development Environment Configuration ─────────────────────────────────
CREATE TABLE IF NOT EXISTS development_environment (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid REFERENCES departments(id) ON DELETE CASCADE,
  name          text NOT NULL,
  tool_type     text NOT NULL, -- "code_editor", "ci_cd", "api_testing", etc.
  config        jsonb NOT NULL DEFAULT '{}',
  api_keys      jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE development_environment ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "dev_env_select" ON development_environment
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM departments d
      JOIN memberships m ON m.workspace_id = d.workspace_id
      WHERE d.id = development_environment.department_id
        AND m.user_id = auth.uid()
        AND m.status = 'active'
    )
  );

CREATE POLICY IF NOT EXISTS "dev_env_insert" ON development_environment
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM departments d
      JOIN memberships m ON m.workspace_id = d.workspace_id
      WHERE d.id = development_environment.department_id
        AND m.user_id = auth.uid()
        AND m.status = 'active'
    )
  );

CREATE POLICY IF NOT EXISTS "dev_env_delete" ON development_environment
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM departments d
      JOIN memberships m ON m.workspace_id = d.workspace_id
      WHERE d.id = development_environment.department_id
        AND m.user_id = auth.uid()
        AND m.status = 'active'
    )
  );

-- ─── 3. Marketing Environment Configuration ───────────────────────────────────
CREATE TABLE IF NOT EXISTS marketing_environment (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid REFERENCES departments(id) ON DELETE CASCADE,
  name          text NOT NULL,
  tool_type     text NOT NULL, -- "analytics", "social_media", "email_campaign", "seo", etc.
  config        jsonb NOT NULL DEFAULT '{}',
  api_keys      jsonb NOT NULL DEFAULT '{}', -- store encrypted/hashed keys only
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE marketing_environment ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "marketing_env_select" ON marketing_environment
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM departments d
      JOIN memberships m ON m.workspace_id = d.workspace_id
      WHERE d.id = marketing_environment.department_id
        AND m.user_id = auth.uid()
        AND m.status = 'active'
    )
  );

CREATE POLICY IF NOT EXISTS "marketing_env_insert" ON marketing_environment
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM departments d
      JOIN memberships m ON m.workspace_id = d.workspace_id
      WHERE d.id = marketing_environment.department_id
        AND m.user_id = auth.uid()
        AND m.status = 'active'
    )
  );

CREATE POLICY IF NOT EXISTS "marketing_env_delete" ON marketing_environment
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM departments d
      JOIN memberships m ON m.workspace_id = d.workspace_id
      WHERE d.id = marketing_environment.department_id
        AND m.user_id = auth.uid()
        AND m.status = 'active'
    )
  );

-- ─── 4. Indexes ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_design_environment_dept      ON design_environment(department_id);
CREATE INDEX IF NOT EXISTS idx_dev_environment_dept         ON development_environment(department_id);
CREATE INDEX IF NOT EXISTS idx_marketing_environment_dept   ON marketing_environment(department_id);
