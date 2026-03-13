-- Migration: User-level Integrations Table (main module, no workspace dependency)
-- Run this in your Supabase SQL Editor

-- Drop old version if it exists from a failed attempt
DROP TABLE IF EXISTS integrations;

CREATE TABLE integrations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type       text NOT NULL,    -- 'github', 'supabase', 'vercel', 'slack', 'notion', 'linear', etc.
  name       text NOT NULL,    -- human label, e.g. "My GitHub Org"
  config     jsonb NOT NULL DEFAULT '{}',  -- masked credentials + settings
  status     text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;

-- Users can only see/manage their own integrations
CREATE POLICY "integrations_select" ON integrations
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "integrations_insert" ON integrations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "integrations_delete" ON integrations
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "integrations_update" ON integrations
  FOR UPDATE USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_integrations_user ON integrations(user_id);
CREATE INDEX idx_integrations_type ON integrations(type);
