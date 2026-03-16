CREATE TABLE IF NOT EXISTS ai_session_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL,
  active_project TEXT,
  current_focus TEXT,
  open_blockers TEXT[] DEFAULT '{}',
  decisions_made TEXT[] DEFAULT '{}',
  next_steps TEXT[] DEFAULT '{}',
  user_preferences TEXT[] DEFAULT '{}',
  key_topics TEXT[] DEFAULT '{}',
  summary TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_session_memory_user_session
  ON ai_session_memory(user_id, session_id);

CREATE INDEX IF NOT EXISTS idx_ai_session_memory_updated
  ON ai_session_memory(user_id, updated_at DESC);

ALTER TABLE ai_session_memory ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ai_session_memory'
      AND policyname = 'Users can manage own ai session memory'
  ) THEN
    CREATE POLICY "Users can manage own ai session memory"
      ON ai_session_memory
      FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
