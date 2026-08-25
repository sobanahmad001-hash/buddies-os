-- Establish the forward migration boundary for the production schema.
-- Older Buddies OS migrations were historically applied through the dashboard.
-- This migration is intentionally idempotent and verifies that their required
-- objects exist before future migrations are applied through the CLI/CI only.

alter table public.projects
  add column if not exists owner_name text,
  add column if not exists target_date date,
  add column if not exists health text not null default 'on_track',
  add column if not exists coding_agent_enabled boolean not null default false;

alter table public.trading_accounts
  add column if not exists metaapi_token text,
  add column if not exists metaapi_account_id text,
  add column if not exists mt_login text,
  add column if not exists mt_server text;

do $$
declare
  required_table text;
begin
  foreach required_table in array array[
    'projects',
    'project_tasks',
    'project_workstreams',
    'project_deliverables',
    'coding_agent_executions',
    'coding_agent_jobs',
    'goals',
    'inbox_items',
    'automation_rules',
    'personal_reviews',
    'coding_agent_verifications'
  ]
  loop
    if to_regclass(format('public.%I', required_table)) is null then
      raise exception 'Buddies OS schema reconciliation failed: missing public.%', required_table;
    end if;
  end loop;
end
$$;

comment on schema public is
  'Buddies OS production schema; forward migrations are managed from supabase/migrations.';
