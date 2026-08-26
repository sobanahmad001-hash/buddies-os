-- Trading Lab MVP: additive schema. The existing Trading Agent remains intact
-- until the new module passes its preview and migration acceptance gates.

create table if not exists public.trading_connector_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  label text not null,
  masked_secret text,
  capabilities text[] not null default '{}',
  status text not null default 'not_connected' check (status in ('not_connected','connected','error','disabled')),
  is_primary boolean not null default false,
  last_checked_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

-- Ciphertext is written and read only by trusted server code using service_role.
-- Encryption keys live in the deployment secret manager, never in Postgres.
create table if not exists public.trading_connector_secrets (
  connector_id uuid primary key references public.trading_connector_profiles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  ciphertext text not null,
  iv text not null,
  auth_tag text not null,
  key_version integer not null default 1,
  created_at timestamptz not null default now(),
  rotated_at timestamptz
);

create table if not exists public.trading_connector_events (
  id bigint generated always as identity primary key,
  connector_id uuid not null references public.trading_connector_profiles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('created','tested','connected','failed','disabled','enabled','rotated','deleted')),
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.trading_strategies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text not null default '',
  market text not null default 'gold',
  status text not null default 'draft' check (status in ('draft','testing','validated','archived')),
  active_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trading_strategy_versions (
  id uuid primary key default gen_random_uuid(),
  strategy_id uuid not null references public.trading_strategies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  version integer not null,
  definition jsonb not null,
  change_note text not null default '',
  created_at timestamptz not null default now(),
  unique (strategy_id, version)
);

create table if not exists public.trading_backtest_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  strategy_version_id uuid not null references public.trading_strategy_versions(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','running','completed','failed')),
  symbol text not null,
  timeframe text not null,
  date_from date,
  date_to date,
  dataset jsonb not null default '{}',
  assumptions jsonb not null default '{}',
  metrics jsonb not null default '{}',
  equity_curve jsonb not null default '[]',
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.trading_backtest_trades (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.trading_backtest_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  direction text not null check (direction in ('long','short')),
  entry_time timestamptz not null,
  exit_time timestamptz not null,
  entry_price numeric not null,
  exit_price numeric not null,
  size numeric not null,
  pnl numeric not null,
  r_multiple numeric,
  fees numeric not null default 0,
  exit_reason text,
  metadata jsonb not null default '{}'
);

create table if not exists public.trading_ladder_campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  strategy_id uuid references public.trading_strategies(id) on delete set null,
  name text not null,
  mode text not null default 'paper' check (mode in ('backtest','paper','external')),
  status text not null default 'draft' check (status in ('draft','active','completed','failed','archived')),
  starting_balance numeric not null check (starting_balance > 0),
  current_balance numeric not null check (current_balance >= 0),
  current_step integer not null default 1 check (current_step > 0),
  step_count integer not null check (step_count between 1 and 100),
  config jsonb not null default '{}',
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trading_ladder_campaign_steps (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.trading_ladder_campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  step_number integer not null check (step_number > 0),
  start_balance numeric not null,
  target_balance numeric not null,
  end_balance numeric,
  attempts integer not null default 0,
  status text not null default 'pending' check (status in ('pending','active','passed','failed','reset')),
  started_at timestamptz,
  completed_at timestamptz,
  unique (campaign_id, step_number)
);

create table if not exists public.trading_decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  strategy_version_id uuid references public.trading_strategy_versions(id) on delete set null,
  ladder_campaign_id uuid references public.trading_ladder_campaigns(id) on delete set null,
  instrument text not null,
  decision_state text not null check (decision_state in ('NO TRADE','WATCH LONG','WATCH SHORT','LONG SETUP CONFIRMED','SHORT SETUP CONFIRMED')),
  bias text not null check (bias in ('bullish','bearish','neutral')),
  confidence integer not null check (confidence between 0 and 100),
  data_quality jsonb not null default '{}',
  fundamental jsonb not null default '{}',
  technical jsonb not null default '{}',
  volume_wyckoff jsonb not null default '{}',
  market_snapshot jsonb not null default '{}',
  trigger_text text,
  invalidation_text text,
  blockers text[] not null default '{}',
  sources jsonb not null default '[]',
  narrative text,
  provider text,
  model text,
  as_of timestamptz not null,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.trading_import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  row_count integer not null default 0,
  imported_count integer not null default 0,
  skipped_count integer not null default 0,
  status text not null default 'processing' check (status in ('processing','completed','failed')),
  error_log jsonb not null default '[]',
  created_at timestamptz not null default now()
);

alter table public.trading_entries
  add column if not exists strategy text,
  add column if not exists setup_name text,
  add column if not exists timeframe text,
  add column if not exists session text,
  add column if not exists checklist_passed boolean,
  add column if not exists checklist_results jsonb not null default '{}',
  add column if not exists planned_risk_usd numeric,
  add column if not exists fees_usd numeric not null default 0,
  add column if not exists slippage numeric,
  add column if not exists r_multiple numeric,
  add column if not exists mfe numeric,
  add column if not exists mae numeric,
  add column if not exists emotions text,
  add column if not exists mistakes text[] not null default '{}',
  add column if not exists lessons text,
  add column if not exists decision_id uuid references public.trading_decisions(id) on delete set null,
  add column if not exists ladder_campaign_id uuid references public.trading_ladder_campaigns(id) on delete set null,
  add column if not exists external_trade_id text,
  add column if not exists import_batch_id uuid references public.trading_import_batches(id) on delete set null,
  add column if not exists source text not null default 'manual',
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists trading_entries_external_trade_unique
  on public.trading_entries(user_id, external_trade_id)
  where external_trade_id is not null;
create index if not exists trading_connector_profiles_user_idx on public.trading_connector_profiles(user_id);
create index if not exists trading_connector_events_user_created_idx on public.trading_connector_events(user_id, created_at desc);
create index if not exists trading_strategies_user_updated_idx on public.trading_strategies(user_id, updated_at desc);
create index if not exists trading_strategy_versions_user_strategy_idx on public.trading_strategy_versions(user_id, strategy_id, version desc);
create index if not exists trading_backtest_runs_user_created_idx on public.trading_backtest_runs(user_id, created_at desc);
create index if not exists trading_backtest_trades_run_idx on public.trading_backtest_trades(run_id, entry_time);
create index if not exists trading_ladder_campaigns_user_updated_idx on public.trading_ladder_campaigns(user_id, updated_at desc);
create index if not exists trading_decisions_user_created_idx on public.trading_decisions(user_id, created_at desc);

alter table public.trading_connector_profiles enable row level security;
alter table public.trading_connector_secrets enable row level security;
alter table public.trading_connector_events enable row level security;
alter table public.trading_strategies enable row level security;
alter table public.trading_strategy_versions enable row level security;
alter table public.trading_backtest_runs enable row level security;
alter table public.trading_backtest_trades enable row level security;
alter table public.trading_ladder_campaigns enable row level security;
alter table public.trading_ladder_campaign_steps enable row level security;
alter table public.trading_decisions enable row level security;
alter table public.trading_import_batches enable row level security;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'trading_connector_profiles','trading_connector_events','trading_strategies',
    'trading_strategy_versions','trading_backtest_runs','trading_backtest_trades',
    'trading_ladder_campaigns','trading_ladder_campaign_steps','trading_decisions',
    'trading_import_batches'
  ] loop
    execute format('drop policy if exists %I on public.%I', table_name || '_select_own', table_name);
    execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)', table_name || '_select_own', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_insert_own', table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', table_name || '_insert_own', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_update_own', table_name);
    execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', table_name || '_update_own', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_delete_own', table_name);
    execute format('create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', table_name || '_delete_own', table_name);
  end loop;
end $$;

-- Connector secrets deliberately have no authenticated policies or grants.
revoke all on public.trading_connector_secrets from anon, authenticated;
grant all on public.trading_connector_secrets to service_role;

grant select, insert, update, delete on
  public.trading_connector_profiles,
  public.trading_connector_events,
  public.trading_strategies,
  public.trading_strategy_versions,
  public.trading_backtest_runs,
  public.trading_backtest_trades,
  public.trading_ladder_campaigns,
  public.trading_ladder_campaign_steps,
  public.trading_decisions,
  public.trading_import_batches
to authenticated;
grant usage, select on sequence public.trading_connector_events_id_seq to authenticated;
grant usage, select on sequence public.trading_backtest_trades_id_seq to authenticated;

revoke all on
  public.trading_connector_profiles,
  public.trading_connector_events,
  public.trading_strategies,
  public.trading_strategy_versions,
  public.trading_backtest_runs,
  public.trading_backtest_trades,
  public.trading_ladder_campaigns,
  public.trading_ladder_campaign_steps,
  public.trading_decisions,
  public.trading_import_batches
from anon;

drop trigger if exists trading_connector_profiles_updated_at on public.trading_connector_profiles;
create trigger trading_connector_profiles_updated_at before update on public.trading_connector_profiles
for each row execute function public.set_updated_at();
drop trigger if exists trading_strategies_updated_at on public.trading_strategies;
create trigger trading_strategies_updated_at before update on public.trading_strategies
for each row execute function public.set_updated_at();
drop trigger if exists trading_ladder_campaigns_updated_at on public.trading_ladder_campaigns;
create trigger trading_ladder_campaigns_updated_at before update on public.trading_ladder_campaigns
for each row execute function public.set_updated_at();
drop trigger if exists trading_entries_updated_at on public.trading_entries;
create trigger trading_entries_updated_at before update on public.trading_entries
for each row execute function public.set_updated_at();
