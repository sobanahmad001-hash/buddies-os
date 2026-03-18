-- Project chat sessions for per-project multi-chat history

CREATE TABLE IF NOT EXISTS project_chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'New chat',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_chat_sessions_project_user_updated
  ON project_chat_sessions(project_id, user_id, updated_at DESC);

ALTER TABLE project_chat_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_chat_sessions_owner" ON project_chat_sessions;
CREATE POLICY "project_chat_sessions_owner" ON project_chat_sessions
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

ALTER TABLE project_chat_messages
  ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES project_chat_sessions(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_project_chat_messages_project_session_created
  ON project_chat_messages(project_id, session_id, created_at);

-- Backfill legacy rows into one session per project/user pair.
INSERT INTO project_chat_sessions (project_id, user_id, title, created_at, updated_at)
SELECT m.project_id, m.user_id, 'Chat', MIN(m.created_at), MAX(m.created_at)
FROM project_chat_messages m
LEFT JOIN project_chat_sessions s
  ON s.project_id = m.project_id AND s.user_id = m.user_id
WHERE m.session_id IS NULL AND s.id IS NULL
GROUP BY m.project_id, m.user_id;

UPDATE project_chat_messages m
SET session_id = s.id
FROM project_chat_sessions s
WHERE m.session_id IS NULL
  AND s.project_id = m.project_id
  AND s.user_id = m.user_id;
