-- Core memory expansion for Buddies OS
-- Extends session compact and adds project/system retrieval layers

-- 1) Extend ai_session_memory
ALTER TABLE ai_session_memory
  ADD COLUMN IF NOT EXISTS active_project_id uuid NULL REFERENCES projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS message_type text NULL,
  ADD COLUMN IF NOT EXISTS constraints text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS summary_json jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS turn_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_meaningful_turn_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_ai_session_memory_active_project
  ON ai_session_memory(user_id, active_project_id);

-- 2) Project memory compact
CREATE TABLE IF NOT EXISTS ai_project_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  project_name text,
  purpose text,
  current_stage text,
  active_priorities jsonb DEFAULT '[]'::jsonb,
  open_blockers jsonb DEFAULT '[]'::jsonb,
  key_decisions jsonb DEFAULT '[]'::jsonb,
  constraints jsonb DEFAULT '[]'::jsonb,
  next_actions jsonb DEFAULT '[]'::jsonb,
  summary_text text,
  summary_json jsonb DEFAULT '{}'::jsonb,
  last_activity_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_project_memory_user_project
  ON ai_project_memory(user_id, project_id);

CREATE INDEX IF NOT EXISTS idx_ai_project_memory_updated
  ON ai_project_memory(user_id, updated_at DESC);

ALTER TABLE ai_project_memory ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ai_project_memory'
      AND policyname = 'Users can manage own ai project memory'
  ) THEN
    CREATE POLICY "Users can manage own ai project memory"
      ON ai_project_memory
      FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- 3) Ranked retrieval inventory
CREATE TABLE IF NOT EXISTS ai_memory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NULL REFERENCES projects(id) ON DELETE CASCADE,
  session_id uuid NULL,
  memory_type text NOT NULL,
  title text,
  content text NOT NULL,
  keywords text[] DEFAULT '{}',
  importance integer DEFAULT 3,
  severity integer DEFAULT 0,
  status text DEFAULT 'active',
  source_kind text,
  source_ref text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  last_used_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_memory_items_user_project_type
  ON ai_memory_items(user_id, project_id, memory_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_memory_items_user_status
  ON ai_memory_items(user_id, status, created_at DESC);

ALTER TABLE ai_memory_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ai_memory_items'
      AND policyname = 'Users can manage own ai memory items'
  ) THEN
    CREATE POLICY "Users can manage own ai memory items"
      ON ai_memory_items
      FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- 4) Org/system memory
CREATE TABLE IF NOT EXISTS ai_org_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  memory_type text NOT NULL,
  content text NOT NULL,
  importance integer DEFAULT 3,
  status text DEFAULT 'active',
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_org_memory_user_type
  ON ai_org_memory(user_id, memory_type, updated_at DESC);

ALTER TABLE ai_org_memory ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ai_org_memory'
      AND policyname = 'Users can manage own ai org memory'
  ) THEN
    CREATE POLICY "Users can manage own ai org memory"
      ON ai_org_memory
      FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
