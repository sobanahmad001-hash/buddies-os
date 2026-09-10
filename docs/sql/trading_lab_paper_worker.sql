-- Scheduler infrastructure only. Calls the worker when an approved run is active.
begin;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create schema if not exists buddies_paper_internal;
revoke all on schema buddies_paper_internal from public,anon,authenticated;
grant usage on schema buddies_paper_internal to service_role;
create table if not exists buddies_paper_internal.worker_auth(id boolean primary key default true check(id),token_hash text not null);
alter table buddies_paper_internal.worker_auth enable row level security;
revoke all on buddies_paper_internal.worker_auth from public,anon,authenticated;
grant select on buddies_paper_internal.worker_auth to service_role;
do $$declare token text;begin
  select decrypted_secret into token from vault.decrypted_secrets where name='buddies_paper_worker_token';
  if token is null then token:=gen_random_uuid()::text||gen_random_uuid()::text;perform vault.create_secret(token,'buddies_paper_worker_token','Internal paper scheduler bearer token');end if;
  insert into buddies_paper_internal.worker_auth(id,token_hash) values(true,encode(extensions.digest(token,'sha256'),'hex')) on conflict(id) do update set token_hash=excluded.token_hash;
end $$;
create or replace function public.authorize_paper_worker(p_token text) returns boolean language sql stable security invoker set search_path='' as $$
  select coalesce(length(p_token) between 32 and 256 and exists(select 1 from buddies_paper_internal.worker_auth where id and token_hash=encode(extensions.digest(p_token,'sha256'),'hex')),false)
$$;
revoke all on function public.authorize_paper_worker(text) from public,anon,authenticated;
grant execute on function public.authorize_paper_worker(text) to service_role;
select cron.schedule('buddies-trading-paper-worker','* * * * *',$job$
  select net.http_post(
    url:='https://vzjpaptthqrohqnbhfvn.supabase.co/functions/v1/trading-paper-worker',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='buddies_paper_worker_token')),
    body:='{}'::jsonb,timeout_milliseconds:=55000
  ) where exists(select 1 from public.trading_paper_runs where status in ('running','paused','stopping'));
$job$);
commit;
