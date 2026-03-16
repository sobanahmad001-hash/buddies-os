-- ─────────────────────────────────────────────────────────────────────────────
-- Buddies OS – Phase 1 Database Schema
-- Run this in the Supabase SQL Editor (https://supabase.com/dashboard)
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable UUID generation (already enabled on Supabase by default)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Organizations ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organizations (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT        NOT NULL,
  owner_id   UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Departments ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS departments (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID        REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,  -- e.g. "Marketing", "Design", "Development"
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── Team Members ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS team_members (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  department_id UUID        REFERENCES departments(id) ON DELETE SET NULL,  -- NULL = org-wide member
  role          TEXT        NOT NULL DEFAULT 'member',  -- 'admin' | 'member'
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Projects ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  department_id UUID        REFERENCES departments(id) ON DELETE SET NULL,
  name          TEXT        NOT NULL,
  description   TEXT,
  status        TEXT        NOT NULL DEFAULT 'active',  -- 'active' | 'completed' | 'archived'
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security (RLS)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE organizations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects       ENABLE ROW LEVEL SECURITY;

-- Organizations: owner can read/write their own org
CREATE POLICY "org_owner_all" ON organizations
  FOR ALL USING (owner_id = auth.uid());

-- Departments: members of the org can read; owner can write
CREATE POLICY "dept_members_read" ON departments
  FOR SELECT USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "dept_owner_write" ON departments
  FOR ALL USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

-- Team members: users can see their own membership; org owner can manage all
CREATE POLICY "team_member_self" ON team_members
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "team_member_org_owner" ON team_members
  FOR ALL USING (
    department_id IN (
      SELECT d.id FROM departments d
      JOIN organizations o ON o.id = d.organization_id
      WHERE o.owner_id = auth.uid()
    )
  );

-- Projects: readable/writable by org owner via department linkage
CREATE POLICY "projects_org_owner" ON projects
  FOR ALL USING (
    department_id IN (
      SELECT d.id FROM departments d
      JOIN organizations o ON o.id = d.organization_id
      WHERE o.owner_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Indexes for common lookups
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_departments_org    ON departments(organization_id);
CREATE INDEX IF NOT EXISTS idx_team_members_dept  ON team_members(department_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user  ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_dept      ON projects(department_id);
