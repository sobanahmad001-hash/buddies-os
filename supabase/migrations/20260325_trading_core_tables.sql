-- Core trading tables: ladder, entries, withdrawals, gold price cache, AI summaries
-- These tables are referenced throughout the trading API routes but were missing from migrations

CREATE TABLE IF NOT EXISTS trading_ladder (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  target_amount NUMERIC(14, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('inactive', 'active', 'completed')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, step_number)
);

CREATE TABLE IF NOT EXISTS trading_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ladder_step INTEGER NOT NULL DEFAULT 1,
  direction TEXT NOT NULL CHECK (direction IN ('buy', 'sell')),
  instrument TEXT NOT NULL DEFAULT 'XAUUSD',
  entry_price NUMERIC(14, 5),
  exit_price NUMERIC(14, 5),
  lot_size NUMERIC(10, 4) NOT NULL DEFAULT 0.01,
  stop_loss NUMERIC(14, 5),
  take_profit NUMERIC(14, 5),
  result_usd NUMERIC(12, 2),
  result_pips NUMERIC(10, 2),
  r_multiple NUMERIC(8, 3),
  account_type TEXT DEFAULT 'demo',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'cancelled')),
  checklist_passed BOOLEAN,
  strategy TEXT,
  notes TEXT,
  metaapi_position_id TEXT,
  opened_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trading_withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ladder_step INTEGER NOT NULL DEFAULT 1,
  amount_usd NUMERIC(14, 2) NOT NULL,
  withdrawn_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gold_price_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  price_usd NUMERIC(14, 5) NOT NULL,
  source TEXT,
  fetched_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trading_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_type TEXT NOT NULL DEFAULT 'manual' CHECK (period_type IN ('daily', 'weekly', 'manual')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  content TEXT NOT NULL,
  stats_snapshot JSONB DEFAULT '{}',
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE trading_ladder ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading_withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE gold_price_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading_summaries ENABLE ROW LEVEL SECURITY;

-- RLS policies: users can only access their own data
CREATE POLICY "user owns trading_ladder" ON trading_ladder FOR ALL USING (user_id = auth.uid());
CREATE POLICY "user owns trading_entries" ON trading_entries FOR ALL USING (user_id = auth.uid());
CREATE POLICY "user owns trading_withdrawals" ON trading_withdrawals FOR ALL USING (user_id = auth.uid());
CREATE POLICY "authenticated can use gold_price_cache" ON gold_price_cache FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "user owns trading_summaries" ON trading_summaries FOR ALL USING (user_id = auth.uid());

-- Seed 20 ladder steps for a new user (call this after signup)
CREATE OR REPLACE FUNCTION seed_trading_ladder_for_user(p_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_amounts NUMERIC[] := ARRAY[
    10, 20, 40, 80, 160, 320, 640, 1280, 2560, 5120,
    10000, 20000, 40000, 80000, 160000, 320000, 640000,
    1000000, 2000000, 5000000
  ];
  i INTEGER;
BEGIN
  FOR i IN 1..20 LOOP
    INSERT INTO trading_ladder (user_id, step_number, target_amount, status)
    VALUES (p_user_id, i, v_amounts[i], CASE WHEN i = 1 THEN 'active' ELSE 'inactive' END)
    ON CONFLICT (user_id, step_number) DO NOTHING;
  END LOOP;
END;
$$;
