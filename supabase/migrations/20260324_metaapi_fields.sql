-- Add MetaAPI integration fields to trading_accounts
-- metaapi_token: user's MetaAPI API token (stored server-side only, never returned to client)
-- metaapi_account_id: the account ID MetaAPI assigns after provisioning
-- mt_login: MT5 login number (same as account_number but kept for clarity)
-- mt_server: MT5 server name (e.g. Exness-MT5Trial4)
-- NOTE: MT5 password is never stored — used once for provisioning, MetaAPI holds it

ALTER TABLE trading_accounts
  ADD COLUMN IF NOT EXISTS metaapi_token TEXT,
  ADD COLUMN IF NOT EXISTS metaapi_account_id TEXT,
  ADD COLUMN IF NOT EXISTS mt_login TEXT,
  ADD COLUMN IF NOT EXISTS mt_server TEXT;
