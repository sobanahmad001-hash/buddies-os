-- Migration: Supabase Project Integration for Development Department Agents
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS supabase_integrations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id    uuid NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_name     text NOT NULL,               -- human label, e.g. "Production DB"
  project_url      text NOT NULL,               -- e.g. https://xxxx.supabase.co
  anon_key         text NOT NULL,               -- masked: eyJ****yyyy
  service_role_key text,                         -- optional, masked if provided
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE supabase_integrations ENABLE ROW LEVEL SECURITY;

-- Users can only see their own integrations
CREATE POLICY IF NOT EXISTS "supa_integrations_select" ON supabase_integrations
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "supa_integrations_insert" ON supabase_integrations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "supa_integrations_delete" ON supabase_integrations
  FOR DELETE USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_supabase_integrations_dept ON supabase_integrations(department_id);
CREATE INDEX IF NOT EXISTS idx_supabase_integrations_user ON supabase_integrations(user_id);
