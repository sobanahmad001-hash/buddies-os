-- Fix schema mismatches between code and database
-- This migration adds missing fields that the action endpoint expects

-- 1. Add missing fields to project_tasks
ALTER TABLE project_tasks
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Add missing fields to project_decisions
ALTER TABLE project_decisions
  ADD COLUMN IF NOT EXISTS reasoning text;

-- 3. Add missing context field to project_rules
ALTER TABLE project_rules
  ADD COLUMN IF NOT EXISTS context text;

-- 4. Ensure project_research has notes (not findings) for consistency
-- Check if table exists first, add notes if it doesn't have it
ALTER TABLE project_research
  ADD COLUMN IF NOT EXISTS notes text;

-- 5. Add keywords to project_research (as optional JSONB array)
ALTER TABLE project_research
  ADD COLUMN IF NOT EXISTS keywords text[] DEFAULT '{}';

-- 6. Verify status default for project_tasks (should be 'todo' not 'open')
-- This ensures status normalization works correctly
ALTER TABLE project_tasks
  ALTER COLUMN status SET DEFAULT 'todo';

-- Add indexes for performance on frequently queried fields
CREATE INDEX IF NOT EXISTS idx_project_tasks_assigned ON project_tasks(assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_project_rules_context ON project_rules(context);

-- Ensure RLS is enabled on all modified tables
ALTER TABLE project_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_research ENABLE ROW LEVEL SECURITY;
