-- Migration: Workspace-level Integrations Table
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS integrations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type         text NOT NULL,    -- 'github', 'supabase', 'vercel', 'slack', 'notion', 'linear', etc.
  name         text NOT NULL,    -- human label, e.g. "My GitHub Org"
  config       jsonb NOT NULL DEFAULT '{}',  -- masked credentials + settings
  status       text NOT NULL DEFAULT 'active',
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;

-- Workspace members can view integrations
CREATE POLICY IF NOT EXISTS "integrations_select" ON integrations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM workspaces w
      LEFT JOIN memberships m ON m.workspace_id = w.id
      WHERE w.id = integrations.workspace_id
        AND (w.owner_id = auth.uid() OR (m.user_id = auth.uid() AND m.status = 'active'))
    )
  );

-- Any active workspace member can add integrations
CREATE POLICY IF NOT EXISTS "integrations_insert" ON integrations
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM workspaces w
      LEFT JOIN memberships m ON m.workspace_id = w.id
      WHERE w.id = integrations.workspace_id
        AND (w.owner_id = auth.uid() OR (m.user_id = auth.uid() AND m.status = 'active'))
    )
  );

-- Only the creator can delete their integration
CREATE POLICY IF NOT EXISTS "integrations_delete" ON integrations
  FOR DELETE USING (auth.uid() = user_id);

-- Owner or creator can update
CREATE POLICY IF NOT EXISTS "integrations_update" ON integrations
  FOR UPDATE USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM workspaces WHERE id = integrations.workspace_id AND owner_id = auth.uid()
    )
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_integrations_workspace ON integrations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_integrations_user      ON integrations(user_id);
CREATE INDEX IF NOT EXISTS idx_integrations_type      ON integrations(type);
