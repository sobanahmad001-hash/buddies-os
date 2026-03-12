-- ─────────────────────────────────────────────────────────────────────────────
-- Buddies OS – Phase 4: Marketing Module Schema
-- Run this in the Supabase SQL Editor after running sql/init.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- ── SEO Metrics ───────────────────────────────────────────────────────────────
-- Tracks keyword ranking snapshots per client over time.
CREATE TABLE IF NOT EXISTS seo_metrics (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id  UUID        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  keyword    TEXT        NOT NULL,
  ranking    INT,                          -- position in SERP (lower = better)
  url        TEXT,                         -- page being tracked
  date       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Content Calendar ─────────────────────────────────────────────────────────
-- Schedules blog posts, social media, campaigns, etc. per client.
CREATE TABLE IF NOT EXISTS content_calendar (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id      UUID        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title          TEXT        NOT NULL,
  content_type   TEXT        NOT NULL DEFAULT 'blog', -- blog | social_media | email | video | ad
  platform       TEXT,                                 -- instagram | linkedin | google | etc.
  scheduled_date TIMESTAMPTZ NOT NULL,
  status         TEXT        NOT NULL DEFAULT 'pending', -- pending | in_progress | published | cancelled
  notes          TEXT,
  created_by     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ── Marketing Tasks ───────────────────────────────────────────────────────────
-- Task management scoped to clients (SEO tasks, campaigns, social posts, etc.).
CREATE TABLE IF NOT EXISTS marketing_tasks (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id        UUID        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  task_description TEXT        NOT NULL,
  assigned_to      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  due_date         TIMESTAMPTZ,
  status           TEXT        NOT NULL DEFAULT 'in_progress', -- in_progress | completed | cancelled
  priority         TEXT        NOT NULL DEFAULT 'medium',      -- low | medium | high
  category         TEXT,                                        -- seo | content | social | ads
  created_by       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE seo_metrics      ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_tasks  ENABLE ROW LEVEL SECURITY;

-- Policies: access through workspace ownership
-- seo_metrics
CREATE POLICY "seo_metrics_workspace_owner" ON seo_metrics
  FOR ALL USING (
    client_id IN (
      SELECT c.id FROM clients c
      JOIN workspaces w ON w.id = c.workspace_id
      WHERE w.owner_id = auth.uid()
    )
  );

-- content_calendar
CREATE POLICY "content_calendar_workspace_owner" ON content_calendar
  FOR ALL USING (
    client_id IN (
      SELECT c.id FROM clients c
      JOIN workspaces w ON w.id = c.workspace_id
      WHERE w.owner_id = auth.uid()
    )
  );

-- marketing_tasks
CREATE POLICY "marketing_tasks_workspace_owner" ON marketing_tasks
  FOR ALL USING (
    client_id IN (
      SELECT c.id FROM clients c
      JOIN workspaces w ON w.id = c.workspace_id
      WHERE w.owner_id = auth.uid()
    )
  );

-- Allow assigned members to read/update their own tasks
CREATE POLICY "marketing_tasks_assignee" ON marketing_tasks
  FOR SELECT USING (assigned_to = auth.uid());

CREATE POLICY "marketing_tasks_assignee_update" ON marketing_tasks
  FOR UPDATE USING (assigned_to = auth.uid());

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_seo_metrics_client      ON seo_metrics(client_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_content_calendar_client ON content_calendar(client_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_marketing_tasks_client  ON marketing_tasks(client_id, status);
CREATE INDEX IF NOT EXISTS idx_marketing_tasks_assignee ON marketing_tasks(assigned_to);
