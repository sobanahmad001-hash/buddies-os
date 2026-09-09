-- Read-only inventory. Run only against the verified Buddies database before
-- promoting either Trading Lab SQL draft to a migration. No user rows or keys.
select current_database() as database_name, version() as postgres_version;
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema='public' and table_name in (
  'decisions','decision_lessons','behavior_logs','rules','rule_violations',
  'ai_memory_items','trading_strategies','trading_strategy_versions','trading_decisions',
  'trading_entries','trading_experiments','trading_trade_events','trading_observation_sessions'
)
order by table_name,ordinal_position;
select tablename,policyname,roles,cmd,qual,with_check
from pg_policies where schemaname='public' and tablename in (
  'decisions','decision_lessons','behavior_logs','rules','rule_violations',
  'ai_memory_items','trading_strategies','trading_strategy_versions','trading_decisions','trading_entries'
) order by tablename,policyname;
select c.relname as table_name,c.relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' and c.relname in (
  'decisions','decision_lessons','behavior_logs','rules','rule_violations',
  'ai_memory_items','trading_strategies','trading_strategy_versions','trading_decisions','trading_entries'
);
select event_object_table,trigger_name,action_timing,event_manipulation,action_statement
from information_schema.triggers where trigger_schema='public' and event_object_table in (
  'decisions','decision_lessons','trading_strategies','trading_strategy_versions','trading_decisions','trading_entries'
) order by event_object_table,trigger_name;
