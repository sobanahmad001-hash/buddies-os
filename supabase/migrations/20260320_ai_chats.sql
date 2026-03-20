-- Create ai_chats table for persistent chat history across agent types
CREATE TABLE IF NOT EXISTS ai_chats (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  agent_type TEXT DEFAULT 'project_assistant' CHECK (agent_type IN ('project_assistant', 'coding_agent')),
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE ai_chats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own chats"
  ON ai_chats FOR ALL
  USING (user_id = auth.uid()::text);

-- Indexes for efficient querying
CREATE INDEX idx_ai_chats_user_id ON ai_chats(user_id, created_at DESC);
CREATE INDEX idx_ai_chats_agent_type ON ai_chats(user_id, agent_type, created_at DESC);
