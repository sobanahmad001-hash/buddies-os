-- Migration: Add organization_id to departments, clients, and projects
-- Run this in your Supabase SQL Editor

-- 1. Departments → link to an organization
ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL;

-- 2. Clients → scope to an organization
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL;

-- 3. Projects → scope to an organization
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL;

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_departments_organization_id ON departments(organization_id);
CREATE INDEX IF NOT EXISTS idx_clients_organization_id     ON clients(organization_id);
CREATE INDEX IF NOT EXISTS idx_projects_organization_id    ON projects(organization_id);
