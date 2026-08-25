-- The signed-out application has no public data surface. Authentication itself
-- is handled by Supabase Auth and does not require privileges on public tables.
revoke all privileges on all tables in schema public from anon;
revoke usage, select on all sequences in schema public from anon;

-- Prevent newly-created application objects from becoming anonymously callable
-- through broad legacy defaults.
alter default privileges for role postgres in schema public
  revoke all privileges on tables from anon;
alter default privileges for role postgres in schema public
  revoke all privileges on sequences from anon;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon;

-- This RPC no longer needs elevated privileges. RLS remains active and the
-- explicit auth.uid() predicate prevents a caller from requesting another
-- user's aggregate.
create or replace function public.get_ai_cost_summary(p_user_id uuid)
returns table(
  today_cost numeric,
  month_cost numeric,
  today_messages integer,
  month_messages integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    coalesce(sum(case when u.created_at::date = current_date then u.cost_usd else 0 end), 0),
    coalesce(sum(case when date_trunc('month', u.created_at) = date_trunc('month', current_date) then u.cost_usd else 0 end), 0),
    count(*) filter (where u.created_at::date = current_date)::integer,
    count(*) filter (where date_trunc('month', u.created_at) = date_trunc('month', current_date))::integer
  from public.ai_usage as u
  where u.user_id = p_user_id
    and p_user_id = (select auth.uid());
$$;

alter function public.auto_create_workspace() set search_path = public, pg_temp;
alter function public.get_user_workspace_id() set search_path = public, pg_temp;
alter function public.get_user_workspace_ids() set search_path = public, pg_temp;
alter function public.handle_new_user() set search_path = public, pg_temp;
alter function public.refresh_user_metrics(uuid) set search_path = public, pg_temp;
alter function public.search_similar_records(vector, text, uuid, integer) set search_path = public, extensions, pg_temp;
alter function public.seed_trading_ladder_for_user(uuid) set search_path = public, pg_temp;
alter function public.set_updated_at() set search_path = public, pg_temp;

-- Trigger helpers are never direct client APIs.
revoke execute on function public.auto_create_workspace() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;

-- Client RPCs must be signed in. The workspace helpers derive identity from
-- auth.uid(); the cost summary is both RLS- and identity-scoped above.
revoke execute on function public.get_ai_cost_summary(uuid) from public, anon;
revoke execute on function public.get_user_workspace_id() from public, anon;
revoke execute on function public.get_user_workspace_ids() from public, anon;
revoke execute on function public.search_similar_records(vector, text, uuid, integer) from public, anon;
grant execute on function public.get_ai_cost_summary(uuid) to authenticated;
grant execute on function public.get_user_workspace_id() to authenticated;
grant execute on function public.get_user_workspace_ids() to authenticated;
grant execute on function public.search_similar_records(vector, text, uuid, integer) to authenticated;

-- These maintenance routines accept arbitrary user IDs and are therefore
-- restricted to trusted server-side roles.
revoke execute on function public.refresh_user_metrics(uuid) from public, anon, authenticated;
revoke execute on function public.seed_trading_ladder_for_user(uuid) from public, anon, authenticated;
grant execute on function public.refresh_user_metrics(uuid) to service_role;
grant execute on function public.seed_trading_ladder_for_user(uuid) to service_role;
