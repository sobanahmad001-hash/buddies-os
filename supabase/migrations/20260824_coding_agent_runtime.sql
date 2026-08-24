CREATE TABLE IF NOT EXISTS coding_agent_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  program TEXT NOT NULL,
  args JSONB NOT NULL DEFAULT '[]'::jsonb,
  cwd TEXT NOT NULL DEFAULT '.',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','succeeded','failed','rejected')),
  exit_code INTEGER,
  stdout TEXT,
  stderr TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

ALTER TABLE coding_agent_executions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "coding_agent_executions_owner" ON coding_agent_executions;
CREATE POLICY "coding_agent_executions_owner" ON coding_agent_executions FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_coding_agent_executions_user_requested
  ON coding_agent_executions(user_id, requested_at DESC);
