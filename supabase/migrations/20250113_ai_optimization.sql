-- AI Usage Tracking Table
CREATE TABLE ai_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cost_usd DECIMAL(10,6) NOT NULL,
  message_type TEXT CHECK (message_type IN ('chat', 'analysis', 'decision')),
  session_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_ai_usage_user_date ON ai_usage(user_id, created_at DESC);
CREATE INDEX idx_ai_usage_session ON ai_usage(session_id);

-- AI Session Summary
CREATE TABLE ai_session_summaries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL,
  summary TEXT NOT NULL,
  key_topics TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_ai_summaries_user ON ai_session_summaries(user_id, created_at DESC);

-- Model Configuration
CREATE TABLE ai_model_config (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  default_model TEXT DEFAULT 'claude-3-5-sonnet-20241022',
  auto_select BOOLEAN DEFAULT true,
  monthly_budget_usd DECIMAL(10,2) DEFAULT 50.00,
  alert_threshold DECIMAL(10,2) DEFAULT 40.00,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_session_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_model_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own AI usage"
  ON ai_usage FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own summaries"
  ON ai_session_summaries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own config"
  ON ai_model_config FOR ALL
  USING (auth.uid() = user_id);

-- Insert default config for existing users
INSERT INTO ai_model_config (user_id)
SELECT id FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

-- Function to get daily/monthly costs
CREATE OR REPLACE FUNCTION get_ai_cost_summary(p_user_id UUID)
RETURNS TABLE (
  today_cost DECIMAL(10,6),
  month_cost DECIMAL(10,6),
  today_messages INTEGER,
  month_messages INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(CASE WHEN created_at::date = CURRENT_DATE THEN cost_usd ELSE 0 END), 0) as today_cost,
    COALESCE(SUM(CASE WHEN DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE) THEN cost_usd ELSE 0 END), 0) as month_cost,
    COUNT(CASE WHEN created_at::date = CURRENT_DATE THEN 1 END)::INTEGER as today_messages,
    COUNT(CASE WHEN DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE) THEN 1 END)::INTEGER as month_messages
  FROM ai_usage
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
