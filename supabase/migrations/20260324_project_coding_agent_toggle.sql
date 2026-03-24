-- Add coding_agent_enabled flag to projects table
-- Defaults to false — opt-in per project
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS coding_agent_enabled boolean NOT NULL DEFAULT false;
