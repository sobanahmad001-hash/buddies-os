-- ── Trading accounts (Exness + future brokers) ───────────────────────────────
CREATE TABLE IF NOT EXISTS trading_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  broker TEXT NOT NULL DEFAULT 'exness',
  account_number TEXT NOT NULL,
  account_type TEXT NOT NULL DEFAULT 'demo' CHECK (account_type IN ('demo', 'live')),
  server TEXT DEFAULT 'Exness-Trial',
  currency TEXT DEFAULT 'USD',
  balance NUMERIC(18, 2) DEFAULT 0,
  equity NUMERIC(18, 2) DEFAULT 0,
  margin NUMERIC(18, 2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, account_number)
);

ALTER TABLE trading_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own trading accounts"
  ON trading_accounts FOR ALL
  USING (user_id = auth.uid());

CREATE INDEX idx_trading_accounts_user ON trading_accounts(user_id, is_active);

-- ── Trading watchlist (multi-asset) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trading_watchlist (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  display_name TEXT NOT NULL,
  asset_type TEXT NOT NULL DEFAULT 'commodity' CHECK (asset_type IN ('commodity', 'crypto', 'forex', 'index')),
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, symbol)
);

ALTER TABLE trading_watchlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own watchlist"
  ON trading_watchlist FOR ALL
  USING (user_id = auth.uid());

CREATE INDEX idx_trading_watchlist_user ON trading_watchlist(user_id, sort_order);

-- ── Trading analysis cache ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trading_analysis (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instrument TEXT NOT NULL,
  analysis_type TEXT NOT NULL CHECK (analysis_type IN ('fundamental', 'technical', 'combined')),
  content TEXT NOT NULL,
  bias TEXT CHECK (bias IN ('bullish', 'bearish', 'neutral')),
  data_sources JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE trading_analysis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own analysis"
  ON trading_analysis FOR ALL
  USING (user_id = auth.uid());

CREATE INDEX idx_trading_analysis_user ON trading_analysis(user_id, instrument, created_at DESC);
