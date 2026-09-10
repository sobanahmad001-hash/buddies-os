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

-- Column names alone are insufficient: live checks and precision can differ
-- from old CREATE TABLE IF NOT EXISTS statements in repository history.
select c.relname as table_name, a.attname as column_name,
  pg_catalog.format_type(a.atttypid,a.atttypmod) as exact_type
from pg_attribute a join pg_class c on c.oid=a.attrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and a.attnum>0 and not a.attisdropped
and c.relname in ('decisions','decision_lessons','behavior_logs','rules','rule_violations',
  'ai_memory_items','trading_strategies','trading_strategy_versions','trading_decisions','trading_entries')
order by c.relname,a.attnum;
select r.relname as table_name,c.conname,pg_get_constraintdef(c.oid) as definition
from pg_constraint c join pg_class r on r.oid=c.conrelid
join pg_namespace n on n.oid=r.relnamespace where n.nspname='public'
and r.relname in ('decisions','decision_lessons','behavior_logs','rules','rule_violations',
  'ai_memory_items','trading_strategies','trading_strategy_versions','trading_decisions','trading_entries')
order by r.relname,c.conname;
