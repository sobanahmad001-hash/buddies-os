-- Migration: Full organization hierarchy
-- Run this in your Supabase SQL Editor (top to bottom)

-- ─── 1. Create organizations table ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organizations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  owner_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- RLS: users can only see/manage their own organizations
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "org_owner_select" ON organizations
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY IF NOT EXISTS "org_owner_insert" ON organizations
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY IF NOT EXISTS "org_owner_update" ON organizations
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY IF NOT EXISTS "org_owner_delete" ON organizations
  FOR DELETE USING (auth.uid() = owner_id);

-- ─── 2. Add organization_id to departments ────────────────────────────────────
ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL;

-- ─── 3. Add organization_id to clients ───────────────────────────────────────
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL;

-- ─── 4. Add organization_id to projects ──────────────────────────────────────
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL;

-- ─── 5. Indexes for fast lookups ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_organizations_owner        ON organizations(owner_id);
CREATE INDEX IF NOT EXISTS idx_departments_organization_id ON departments(organization_id);
CREATE INDEX IF NOT EXISTS idx_clients_organization_id     ON clients(organization_id);
CREATE INDEX IF NOT EXISTS idx_projects_organization_id    ON projects(organization_id);
