-- Migration: GitHub Integration for Development Department Agents
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS github_integrations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  repo_name     text NOT NULL,
  repo_url      text,
  -- NOTE: Never store raw PATs in production. Use a secret manager or encrypt before insert.
  -- The access_token column stores a masked/placeholder value for display; real token only used at insert.
  access_token  text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE github_integrations ENABLE ROW LEVEL SECURITY;

-- Users can only see their own integrations
CREATE POLICY IF NOT EXISTS "github_integrations_select" ON github_integrations
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "github_integrations_insert" ON github_integrations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "github_integrations_delete" ON github_integrations
  FOR DELETE USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_github_integrations_dept ON github_integrations(department_id);
CREATE INDEX IF NOT EXISTS idx_github_integrations_user ON github_integrations(user_id);
