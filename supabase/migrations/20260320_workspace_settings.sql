-- Workspace settings: per-user logo, name, accent color
CREATE TABLE IF NOT EXISTS workspace_settings (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      TEXT        NOT NULL UNIQUE,
  workspace_name TEXT      DEFAULT 'My Workspace',
  accent_color TEXT        DEFAULT '#B5622A',
  logo_url     TEXT,
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE workspace_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own workspace settings"
  ON workspace_settings FOR ALL
  USING (user_id = auth.uid()::text);

-- Index for fast single-row lookups
CREATE INDEX IF NOT EXISTS idx_workspace_settings_user_id ON workspace_settings(user_id);
