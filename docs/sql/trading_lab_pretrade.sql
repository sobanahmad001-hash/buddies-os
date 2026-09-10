-- Canonical deployment SQL, part 1. See docs/TRADING_LAB_DEPLOYMENT.md for
-- the verified project, migration receipt and validation status.
-- Additive extension: existing Lab analysis rows keep their original semantics.
begin;

-- These shared fields already exist in the verified live schema. Older repository
-- baselines omit them; keep the additive migration replayable on either baseline.
alter table public.decisions
  add column if not exists chosen_option text,
  add column if not exists expected_outcome text,
  add column if not exists predicted_probability integer;

alter table public.trading_decisions
  add column if not exists buddies_decision_id uuid references public.decisions(id) on delete restrict,
  add column if not exists capture_request_id uuid,
  add column if not exists plan_snapshot jsonb,
  add column if not exists assessment_snapshot jsonb,
  add column if not exists strategy_snapshot jsonb,
  add column if not exists locked_at timestamptz;

create unique index if not exists trading_plan_request_unique
  on public.trading_decisions(user_id, capture_request_id) where capture_request_id is not null;
create unique index if not exists trading_plan_shared_decision_unique
  on public.trading_decisions(buddies_decision_id) where buddies_decision_id is not null;
create index if not exists trading_decisions_version_reference on public.trading_decisions(strategy_version_id);

create or replace function public.protect_trading_plan()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if TG_OP <> 'INSERT' and OLD.locked_at is not null then
    raise exception 'Locked plans are immutable; record a new plan' using errcode = '23514';
  end if;
  if TG_OP = 'DELETE' then return OLD; end if;
  if NEW.locked_at is not null then
    if TG_OP <> 'INSERT' then
      raise exception 'Historical analysis cannot be relabelled as a pre-trade plan' using errcode = '23514';
    end if;
    if NEW.user_id is distinct from auth.uid()
       or NEW.buddies_decision_id is null or NEW.strategy_version_id is null
       or NEW.capture_request_id is null
       or jsonb_typeof(NEW.plan_snapshot) is distinct from 'object'
       or jsonb_typeof(NEW.assessment_snapshot) is distinct from 'object'
       or jsonb_typeof(NEW.strategy_snapshot) is distinct from 'object' then
      raise exception 'A locked plan needs owned linked records and snapshots' using errcode = '23514';
    end if;
    if not exists (select 1 from public.decisions d where d.id = NEW.buddies_decision_id and d.user_id = NEW.user_id and d.domain = 'trading')
       or not exists (select 1 from public.trading_strategy_versions v join public.trading_strategies s on s.id = v.strategy_id where v.id = NEW.strategy_version_id and v.user_id = NEW.user_id and s.user_id = NEW.user_id and v.definition = NEW.strategy_snapshot) then
      raise exception 'Plan references must belong to the same owner' using errcode = '23514';
    end if;
    NEW.locked_at := clock_timestamp();
    NEW.created_at := NEW.locked_at;
  elsif NEW.buddies_decision_id is not null or NEW.capture_request_id is not null
     or NEW.plan_snapshot is not null or NEW.assessment_snapshot is not null or NEW.strategy_snapshot is not null then
    raise exception 'Pre-trade snapshots must be inserted as a locked record' using errcode = '23514';
  end if;
  return NEW;
end;
$$;

drop trigger if exists protect_trading_plan on public.trading_decisions;
create trigger protect_trading_plan before insert or update or delete on public.trading_decisions
  for each row execute function public.protect_trading_plan();

create or replace function public.protect_trading_plan_dependencies()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if TG_TABLE_NAME = 'trading_strategy_versions' then
    if exists (select 1 from public.trading_decisions t where t.strategy_version_id = OLD.id and t.locked_at is not null) then
      raise exception 'This strategy version has locked plans; create a new version' using errcode = '23514';
    end if;
  elsif exists (select 1 from public.trading_decisions t where t.buddies_decision_id = OLD.id and t.locked_at is not null) then
    if TG_OP = 'DELETE' then
      raise exception 'Shared decision has a locked trading plan' using errcode = '23514';
    end if;
    if (NEW.id, NEW.user_id, NEW.project_id, NEW.context, NEW.verdict, NEW.probability, NEW.domain, NEW.created_at, NEW.chosen_option, NEW.expected_outcome, NEW.predicted_probability)
       is distinct from
       (OLD.id, OLD.user_id, OLD.project_id, OLD.context, OLD.verdict, OLD.probability, OLD.domain, OLD.created_at, OLD.chosen_option, OLD.expected_outcome, OLD.predicted_probability) then
      raise exception 'Original decision fields are locked; outcome updates remain available' using errcode = '23514';
    end if;
  end if;
  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end;
$$;

drop trigger if exists protect_trading_version on public.trading_strategy_versions;
create trigger protect_trading_version before update or delete on public.trading_strategy_versions
  for each row execute function public.protect_trading_plan_dependencies();
drop trigger if exists protect_trading_shared_decision on public.decisions;
create trigger protect_trading_shared_decision before update or delete on public.decisions
  for each row execute function public.protect_trading_plan_dependencies();

create or replace function public.capture_trading_plan(
  p_request_id uuid, p_version_id uuid, p_plan jsonb, p_assessment jsonb, p_definition jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  actor uuid := auth.uid();
  strategy_row public.trading_strategy_versions%rowtype;
  saved public.trading_decisions%rowtype;
  shared_id uuid;
  entry_price numeric;
  stop_price numeric;
  target_price numeric;
begin
  if actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_request_id is null or p_version_id is null then raise exception 'Missing request/version' using errcode = '23514'; end if;
  -- Serialize only retries for the same owner/request. Both inserts share one transaction.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text || p_request_id::text, 0));
  select * into saved from public.trading_decisions
    where user_id = actor and capture_request_id = p_request_id;
  if found then
    if saved.plan_snapshot is distinct from p_plan or saved.strategy_version_id is distinct from p_version_id then
      raise exception 'Request ID already belongs to another plan' using errcode = '23505';
    end if;
    return to_jsonb(saved);
  end if;
  select v.* into strategy_row from public.trading_strategy_versions v
    join public.trading_strategies s on s.id = v.strategy_id
    where v.id = p_version_id and v.user_id = actor and s.user_id = actor for share of v, s;
  if not found then raise exception 'Strategy version not found' using errcode = '42501'; end if;
  if strategy_row.definition is distinct from p_definition then
    raise exception 'Strategy version changed; review again' using errcode = '40001';
  end if;
  if jsonb_typeof(p_plan) is distinct from 'object' or jsonb_typeof(p_assessment) is distinct from 'object'
     or (p_plan->>'requestId') is distinct from p_request_id::text
     or (p_plan->>'strategyVersionId') is distinct from p_version_id::text
     or (p_plan->>'notExecutedYet') is distinct from 'true'
     or (p_assessment->>'mode') is distinct from 'manual_assessment'
     or coalesce(p_assessment->>'verdict', '') not in ('REVIEW', 'WAIT', 'NO TRADE')
     or coalesce(p_plan->>'direction', '') not in ('long', 'short')
     or coalesce(p_plan->>'context', '') = '' then
    raise exception 'Invalid manual pre-trade contract' using errcode = '23514';
  end if;
  if coalesce((p_plan->>'validUntil')::timestamptz, '-infinity'::timestamptz) <= clock_timestamp()
     or coalesce((p_plan->>'observedAt')::timestamptz, 'infinity'::timestamptz) > clock_timestamp() then
    raise exception 'Expired plan or future evidence time' using errcode = '23514';
  end if;
  entry_price := (p_plan->>'entry')::numeric;
  stop_price := (p_plan->>'stopLoss')::numeric;
  target_price := (p_plan->>'takeProfit')::numeric;
  if coalesce(entry_price, 0) <= 0 or coalesce(stop_price, 0) <= 0 or coalesce(target_price, 0) <= 0
     or coalesce((p_plan->>'riskAmount')::numeric, 0) <= 0 or coalesce((p_plan->>'quantity')::numeric, 0) <= 0
     or (p_plan->>'direction' = 'long' and not (stop_price < entry_price and entry_price < target_price))
     or (p_plan->>'direction' = 'short' and not (target_price < entry_price and entry_price < stop_price)) then
    raise exception 'Invalid prices or risk' using errcode = '23514';
  end if;
  if (p_plan->>'predictedProbability')::numeric not between 0 and 100 then
    raise exception 'Probability outside 0 to 100' using errcode = '23514';
  end if;
  -- Respect Buddies' existing verdict vocabulary; REVIEW never authorizes entry.
  insert into public.decisions(user_id, context, verdict, chosen_option, probability, predicted_probability, expected_outcome, domain)
    values (actor, p_plan->>'context',
      case when p_assessment->>'verdict' = 'NO TRADE' then 'do_not_enter' else 'wait' end,
      p_assessment->>'verdict', (p_plan->>'predictedProbability')::integer, (p_plan->>'predictedProbability')::integer,
      'TP before SL under the frozen plan by ' || (p_plan->>'validUntil'), 'trading')
    returning id into shared_id;
  insert into public.trading_decisions(
    user_id, strategy_version_id, buddies_decision_id, capture_request_id,
    instrument, decision_state, bias, confidence, data_quality,
    as_of, expires_at, plan_snapshot, assessment_snapshot, strategy_snapshot, locked_at
  ) values (
    actor, p_version_id, shared_id, p_request_id, p_plan->>'instrument',
    case when p_assessment->>'verdict' = 'NO TRADE' then 'NO TRADE'
      when p_plan->>'direction' = 'long' then 'WATCH LONG' else 'WATCH SHORT' end,
    case when p_plan->>'direction' = 'long' then 'bullish' else 'bearish' end,
    0, '{"assessment":"manual","confidence":"not_scored"}'::jsonb,
    (p_plan->>'observedAt')::timestamptz, (p_plan->>'validUntil')::timestamptz,
    p_plan, p_assessment, strategy_row.definition, clock_timestamp()
  ) returning * into saved;
  return to_jsonb(saved);
end;
$$;

-- No elevated function privileges. Existing owner RLS remains in effect.
revoke all on function public.capture_trading_plan(uuid, uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.capture_trading_plan(uuid, uuid, jsonb, jsonb, jsonb) to authenticated;
revoke all on function public.protect_trading_plan() from public, anon, authenticated;
revoke all on function public.protect_trading_plan_dependencies() from public, anon, authenticated;
-- These generic privileges are required for the invoker transaction; ownership is enforced by existing RLS.
grant select, insert on public.decisions to authenticated;

commit;
