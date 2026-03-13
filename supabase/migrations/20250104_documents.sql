-- Migration: Documents Table
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  content       text NOT NULL DEFAULT '',
  status        text NOT NULL DEFAULT 'draft', -- 'draft' | 'published' | 'archived'
  owner_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id  uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  department_id uuid REFERENCES departments(id) ON DELETE SET NULL,
  project_id    uuid REFERENCES projects(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Auto-update updated_at on every row change
CREATE OR REPLACE FUNCTION set_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE PROCEDURE set_documents_updated_at();

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Workspace members can see documents in their workspace
CREATE POLICY IF NOT EXISTS "documents_select" ON documents
  FOR SELECT USING (
    auth.uid() = owner_id OR
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.workspace_id = documents.workspace_id
        AND m.user_id = auth.uid()
        AND m.status = 'active'
    )
  );

CREATE POLICY IF NOT EXISTS "documents_insert" ON documents
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY IF NOT EXISTS "documents_update" ON documents
  FOR UPDATE USING (
    auth.uid() = owner_id OR
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.workspace_id = documents.workspace_id
        AND m.user_id = auth.uid()
        AND m.status = 'active'
        AND m.role IN ('owner', 'dept_head', 'executive')
    )
  );

CREATE POLICY IF NOT EXISTS "documents_delete" ON documents
  FOR DELETE USING (auth.uid() = owner_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_documents_workspace    ON documents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_documents_owner        ON documents(owner_id);
CREATE INDEX IF NOT EXISTS idx_documents_department   ON documents(department_id);
CREATE INDEX IF NOT EXISTS idx_documents_project      ON documents(project_id);
