-- Trading Lab reuses shared sessions and needs an explicit allowed agent type.
begin;
set local lock_timeout = '5s';
alter table public.ai_sessions
  drop constraint if exists ai_sessions_agent_type_check,
  add constraint ai_sessions_agent_type_check
    check (agent_type in ('main', 'coding_agent', 'trading_lab'));
commit;
