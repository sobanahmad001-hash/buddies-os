create table if not exists public.tradingview_alerts (
  id uuid primary key default gen_random_uuid(),
  connector_id uuid not null references public.trading_connector_profiles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_hash text not null,
  alert_name text,
  symbol text not null,
  timeframe text,
  action text,
  price numeric,
  payload jsonb not null default '{}',
  received_at timestamptz not null default now(),
  unique (connector_id, event_hash)
);

create index if not exists tradingview_alerts_user_received_idx
  on public.tradingview_alerts(user_id, received_at desc);

alter table public.tradingview_alerts enable row level security;

drop policy if exists tradingview_alerts_select_own on public.tradingview_alerts;
create policy tradingview_alerts_select_own on public.tradingview_alerts
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists tradingview_alerts_delete_own on public.tradingview_alerts;
create policy tradingview_alerts_delete_own on public.tradingview_alerts
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, delete on public.tradingview_alerts to authenticated;
revoke all on public.tradingview_alerts from anon;
grant all on public.tradingview_alerts to service_role;

create or replace function public.store_trading_connector_secret(p_connector_id uuid, p_user_id uuid, p_secret text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare existing_id uuid; secret_id uuid;
begin
  if length(p_secret) < 1 then raise exception 'Secret cannot be empty'; end if;
  select vault_secret_id into existing_id from public.trading_connector_secrets where connector_id = p_connector_id and user_id = p_user_id;
  if existing_id is null then
    secret_id := vault.create_secret(p_secret, 'trading_connector_' || p_connector_id::text, 'Buddies OS Trading Lab connector credential');
    insert into public.trading_connector_secrets(connector_id, user_id, vault_secret_id) values (p_connector_id, p_user_id, secret_id);
  else
    perform vault.update_secret(existing_id, p_secret, 'trading_connector_' || p_connector_id::text, 'Buddies OS Trading Lab connector credential');
    update public.trading_connector_secrets set rotated_at = now(), key_version = key_version + 1 where connector_id = p_connector_id and user_id = p_user_id;
    secret_id := existing_id;
  end if;
  return secret_id;
end; $$;

create or replace function public.get_trading_connector_secret(p_connector_id uuid, p_user_id uuid)
returns text language sql security definer set search_path = '' stable as $$
  select decrypted_secret from vault.decrypted_secrets ds
  join public.trading_connector_secrets cs on cs.vault_secret_id = ds.id
  where cs.connector_id = p_connector_id and cs.user_id = p_user_id limit 1;
$$;

create or replace function public.delete_trading_connector_secret(p_connector_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare secret_id uuid;
begin
  delete from public.trading_connector_secrets where connector_id = p_connector_id and user_id = p_user_id returning vault_secret_id into secret_id;
  if secret_id is not null then delete from vault.secrets where id = secret_id; end if;
end; $$;

revoke all on function public.store_trading_connector_secret(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.get_trading_connector_secret(uuid, uuid) from public, anon, authenticated;
revoke all on function public.delete_trading_connector_secret(uuid, uuid) from public, anon, authenticated;
grant execute on function public.store_trading_connector_secret(uuid, uuid, text) to service_role;
grant execute on function public.get_trading_connector_secret(uuid, uuid) to service_role;
grant execute on function public.delete_trading_connector_secret(uuid, uuid) to service_role;
