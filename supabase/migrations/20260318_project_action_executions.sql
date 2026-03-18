-- Idempotency lock for project assistant action approvals

CREATE TABLE IF NOT EXISTS project_action_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  session_id uuid NULL REFERENCES project_chat_sessions(id) ON DELETE CASCADE,
  thread_key text NOT NULL,
  action_type text NOT NULL,
  fingerprint text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  entity_type text NULL,
  entity_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  executed_at timestamptz NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_project_action_executions_thread_fingerprint
  ON project_action_executions(user_id, project_id, thread_key, fingerprint);

CREATE INDEX IF NOT EXISTS idx_project_action_executions_project_created
  ON project_action_executions(project_id, created_at DESC);

ALTER TABLE project_action_executions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_action_executions_owner" ON project_action_executions;
CREATE POLICY "project_action_executions_owner" ON project_action_executions
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
