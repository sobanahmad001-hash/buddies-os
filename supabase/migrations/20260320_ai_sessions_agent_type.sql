-- Add agent_type column to ai_sessions to support multiple agent types
ALTER TABLE ai_sessions
  ADD COLUMN IF NOT EXISTS agent_type TEXT NOT NULL DEFAULT 'main';

-- Backfill existing sessions as belonging to the main agent
UPDATE ai_sessions SET agent_type = 'main' WHERE agent_type IS NULL;

CREATE INDEX IF NOT EXISTS idx_ai_sessions_agent_type ON ai_sessions(user_id, agent_type, updated_at DESC);
