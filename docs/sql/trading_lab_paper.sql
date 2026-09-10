-- Paper execution extends shared experiments/accounts/decisions/journal. No broker execution.
begin;
create table if not exists public.trading_paper_runs (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete restrict,
  account_id uuid not null references public.trading_accounts(id) on delete restrict,
  experiment_id uuid references public.trading_experiments(id) on delete restrict,
  strategy_version_id uuid not null references public.trading_strategy_versions(id) on delete restrict,
  name text not null, mode text not null check(mode in ('manual','rules','replay')),
  status text not null check(status in ('ready','running','paused','stopping','completed','failed')),
  config jsonb not null, strategy_snapshot jsonb not null, state jsonb not null,
  revision integer not null default 0, create_request jsonb not null,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  unique(experiment_id)
);
create table if not exists public.trading_paper_events (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete restrict,
  run_id uuid not null references public.trading_paper_runs(id) on delete restrict,
  revision integer not null, event jsonb not null, recorded_at timestamptz not null default now(),
  unique(run_id,revision)
);
create table if not exists public.trading_execution_pairs (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete restrict,
  run_id uuid not null references public.trading_paper_runs(id) on delete restrict,
  paper_trade_id uuid not null references public.trading_entries(id) on delete restrict,
  broker_trade_id uuid not null references public.trading_entries(id) on delete restrict,
  reason text not null,created_at timestamptz not null default now(),unique(paper_trade_id),unique(run_id,broker_trade_id)
);
alter table public.trading_entries add column if not exists execution_source text not null default 'broker_manual' check(execution_source in ('broker_manual','paper')),
  add column if not exists paper_run_id uuid references public.trading_paper_runs(id) on delete restrict;
-- Preserve one manual execution per plan; a paper execution is a separate leg in its frozen run.
drop index if exists public.trading_manual_plan_one_trade;
create unique index trading_manual_plan_one_trade on public.trading_entries(decision_id) where lifecycle_revision>0 and execution_source='broker_manual';
create unique index if not exists trading_paper_plan_one_trade on public.trading_entries(decision_id,paper_run_id) where execution_source='paper';
create unique index if not exists paper_runs_account on public.trading_paper_runs(account_id);
create index if not exists paper_runs_version on public.trading_paper_runs(strategy_version_id);
create index if not exists paper_pairs_broker on public.trading_execution_pairs(broker_trade_id);
create index if not exists paper_runs_owner on public.trading_paper_runs(user_id,created_at);
create index if not exists paper_runs_worker on public.trading_paper_runs(status,updated_at) where status in ('running','paused','stopping');
create index if not exists paper_events_run on public.trading_paper_events(user_id,run_id,revision);
create index if not exists paper_pairs_owner on public.trading_execution_pairs(user_id,run_id);
create index if not exists trading_entries_paper on public.trading_entries(paper_run_id);
do $$declare n text;begin foreach n in array array['trading_paper_runs','trading_paper_events','trading_execution_pairs'] loop
  execute format('alter table public.%I enable row level security',n);
  execute format('revoke all on public.%I from anon,authenticated',n);
  execute format('grant select on public.%I to authenticated',n);
  execute format('grant select,insert,update on public.%I to service_role',n);
  execute format('create policy owner_read on public.%I for select to authenticated using ((select auth.uid())=user_id)',n);
end loop;end $$;
create trigger immutable_paper_events before update or delete on public.trading_paper_events for each row execute function public.trading_immutable_record();
create trigger immutable_execution_pairs before update or delete on public.trading_execution_pairs for each row execute function public.trading_immutable_record();

create or replace function public.guard_paper_entry() returns trigger language plpgsql security invoker set search_path='' as $$
declare r public.trading_paper_runs%rowtype; e public.trading_experiments%rowtype;
begin
  if TG_OP='UPDATE' then
    if (OLD.execution_source,OLD.paper_run_id) is distinct from (NEW.execution_source,NEW.paper_run_id) then raise exception 'Execution provenance is immutable'; end if;
    return NEW;
  end if;
  if NEW.open_snapshot->>'paperRunId' is not null then
    if current_user<>'service_role' and current_user<>'postgres' then raise exception 'Only the paper engine records paper fills' using errcode='42501'; end if;
    select * into r from public.trading_paper_runs where id=(NEW.open_snapshot->>'paperRunId')::uuid and user_id=NEW.user_id and mode<>'replay';
    if not found or r.experiment_id is distinct from NEW.experiment_id then raise exception 'Paper run and experiment do not match'; end if;
    NEW.execution_source:='paper';NEW.paper_run_id:=r.id;NEW.source:='paper';
  elsif NEW.execution_source<>'broker_manual' or NEW.paper_run_id is not null then raise exception 'Invalid execution provenance'; end if;
  if NEW.experiment_id is not null then
    select * into e from public.trading_experiments where id=NEW.experiment_id and user_id=NEW.user_id;
    if coalesce(e.protocol->>'executionSource','broker_manual') is distinct from NEW.execution_source then NEW.sample_member:=false; end if;
  end if;
  return NEW;
end $$;
create trigger guard_paper_entry before insert or update on public.trading_entries for each row execute function public.guard_paper_entry();
create or replace function public.guard_paper_event() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if NEW.kind<>'review' and (NEW.payload->>'paperRunId' is not null or exists(select 1 from public.trading_entries where id=NEW.trade_id and execution_source='paper')) then
    if current_user not in ('service_role','postgres') then raise exception 'Paper fills come from the execution engine' using errcode='42501'; end if;
  end if;return NEW;
end $$;
create trigger guard_paper_event before insert on public.trading_trade_events for each row execute function public.guard_paper_event();

-- Extend the existing capture function's assessment contract; retain its ownership,
-- geometry, expiry, atomic shared-decision linkage and immutable-snapshot behavior.
do $$declare definition text;begin
  select pg_get_functiondef('public.capture_trading_plan(uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure) into definition;
  if position('(p_assessment->>''mode'') is distinct from ''manual_assessment''' in definition)=0 then raise exception 'Capture contract changed; review this migration'; end if;
  definition:=replace(definition,'(p_assessment->>''mode'') is distinct from ''manual_assessment''','((p_assessment->>''mode'') is distinct from ''manual_assessment'' and not (p_assessment->>''mode''=''paper_rule_assessment'' and current_user in (''service_role'',''postgres'')))');
  definition:=replace(definition,'''{"assessment":"manual","confidence":"not_scored"}''::jsonb','jsonb_build_object(''assessment'',p_assessment->>''mode'',''confidence'',''not_scored'')');
  execute definition;
end $$;

create or replace function public.create_paper_run(p_id uuid,p_actor uuid,p_request jsonb,p_config jsonb,p_state jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.trading_paper_runs%rowtype;e public.trading_experiments%rowtype;v public.trading_strategy_versions%rowtype;a uuid;
begin
  if current_user not in ('service_role','postgres') or p_actor is null then raise exception 'Server paper service required' using errcode='42501'; end if;
  perform set_config('request.jwt.claim.sub',p_actor::text,true);
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
  select * into r from public.trading_paper_runs where id=p_id;
  if found then if r.user_id is distinct from p_actor or r.create_request is distinct from p_request then raise exception 'Request belongs to another run' using errcode='40001';end if;return to_jsonb(r);end if;
  if p_request->>'action'='replay' then
    select * into v from public.trading_strategy_versions where id=(p_request->>'strategyVersionId')::uuid and user_id=p_actor;
    if not found then raise exception 'Owned version required';end if;
  else
    select * into e from public.trading_experiments where id=(p_request->>'experimentId')::uuid and user_id=p_actor for update;
    if not found or e.review_snapshot is not null or e.protocol->>'executionSource' is distinct from 'paper' or e.protocol->>'accountType' is distinct from 'demo' then raise exception 'An open approved paper experiment is required';end if;
    if e.protocol->>'riskCurrency' is distinct from p_config->>'currency' or (e.protocol->>'riskAmount')::numeric is distinct from (p_config->>'riskAmount')::numeric or (e.protocol->>'targetSample')::int is distinct from (p_config->>'targetSample')::int then raise exception 'Paper risk/currency/sample must match the frozen experiment';end if;
    select * into v from public.trading_strategy_versions where id=e.strategy_version_id and user_id=p_actor;
  end if;
  if p_state->>'runId' is distinct from p_id::text or p_state->>'mode' not in ('manual','rules','replay') then raise exception 'Invalid run state'; end if;
  insert into public.trading_accounts(user_id,broker,account_number,account_type,server,currency,balance,equity,margin,is_active)
    values(p_actor,'buddies_paper','paper:'||p_id,'demo','internal simulation',p_config->>'currency',(p_state->>'balance')::numeric,(p_state->>'equity')::numeric,0,false) returning id into a;
  insert into public.trading_paper_runs(id,user_id,account_id,experiment_id,strategy_version_id,name,mode,status,config,strategy_snapshot,state,create_request)
    values(p_id,p_actor,a,e.id,v.id,p_request->>'name',p_state->>'mode',p_state->>'status',p_config,v.definition,p_state,p_request) returning * into r;
  return to_jsonb(r);
end $$;
create or replace function public.commit_paper_event(p_run_id uuid,p_actor uuid,p_event_id uuid,p_expected_revision integer,p_event jsonb,p_state jsonb,p_effects jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.trading_paper_runs%rowtype;old_event public.trading_paper_events%rowtype;ef jsonb;payload jsonb;d public.trading_decisions%rowtype;receipt jsonb;o jsonb;idx integer:=0;
begin
  if current_user not in ('service_role','postgres') or p_actor is null then raise exception 'Server paper service required' using errcode='42501';end if;
  perform set_config('request.jwt.claim.sub',p_actor::text,true);
  select * into r from public.trading_paper_runs where id=p_run_id and user_id=p_actor for update;
  if not found then raise exception 'Owned run required';end if;
  select * into old_event from public.trading_paper_events where id=p_event_id;
  if found then if old_event.user_id is distinct from p_actor or old_event.run_id is distinct from r.id or old_event.event is distinct from p_event then raise exception 'Request belongs to a different event' using errcode='40001';end if;return to_jsonb(r);end if;
  if r.revision<>p_expected_revision then raise exception 'Paper run changed; retry from saved state' using errcode='40001';end if;
  if p_state->>'runId' is distinct from r.id::text or p_state->>'mode' is distinct from r.mode or p_state->>'engineVersion' is distinct from r.state->>'engineVersion' then raise exception 'Run identity/model is immutable';end if;
  if r.mode='replay' and jsonb_array_length(p_effects)>0 then raise exception 'Historical replay never creates pre-trade predictions';end if;
  for ef in select value from jsonb_array_elements(p_effects) loop
    payload:=ef->'payload';
    if ef->>'kind'='plan' then
      receipt:=public.capture_trading_plan((payload->>'requestId')::uuid,r.strategy_version_id,payload,ef->'assessment',r.strategy_snapshot);
    else
      if ef->>'kind'='open' then
        if payload->>'planId' is null then
          select * into d from public.trading_decisions where capture_request_id=(payload->>'planRequestId')::uuid and user_id=p_actor;
        else select * into d from public.trading_decisions where id=(payload->>'planId')::uuid and user_id=p_actor;end if;
        if d.id is null or d.experiment_id is distinct from r.experiment_id or d.strategy_version_id is distinct from r.strategy_version_id then raise exception 'Paper order plan does not match its run';end if;
        if (payload->>'occurredAt')::timestamptz<d.locked_at then raise exception 'Forward paper fill cannot predate its recorded decision';end if;
        payload:=(payload-'planRequestId')||jsonb_build_object('planId',d.id,'paperRunId',r.id);
      else
        if not exists(select 1 from public.trading_entries where id=(ef->>'orderId')::uuid and user_id=p_actor and paper_run_id=r.id) then raise exception 'Execution does not belong to run';end if;
      end if;
      receipt:=public.append_trading_event((ef->>'requestId')::uuid,(ef->>'orderId')::uuid,(ef->>'expectedRevision')::int,ef->>'kind',payload);
    end if;
  end loop;
  -- Populate authoritative plan IDs in the saved state after atomic plan capture.
  for o in select value from jsonb_array_elements(p_state->'orders') loop
    if o->>'planRequestId' is not null then
      select * into d from public.trading_decisions where capture_request_id=(o->>'planRequestId')::uuid and user_id=p_actor;
      if found then p_state:=jsonb_set(p_state,array['orders',idx::text,'planId'],to_jsonb(d.id));
        p_state:=jsonb_set(p_state,array['orders',idx::text,'submittedAt'],to_jsonb(greatest((o->>'submittedAt')::timestamptz,d.locked_at)));end if;
    end if;idx:=idx+1;
  end loop;
  insert into public.trading_paper_events(id,user_id,run_id,revision,event) values(p_event_id,p_actor,r.id,r.revision+1,p_event);
  update public.trading_paper_runs set state=p_state,status=p_state->>'status',revision=revision+1,updated_at=clock_timestamp() where id=r.id returning * into r;
  update public.trading_accounts set balance=(p_state->>'balance')::numeric,equity=(p_state->>'equity')::numeric,last_synced_at=clock_timestamp() where id=r.account_id and user_id=p_actor and broker='buddies_paper';
  return to_jsonb(r);
end $$;
-- A shared decision may have multiple execution outcomes. Preserve each leg and
-- prefer the broker leg for the generic summary once one is recorded.
alter table public.decisions add column if not exists execution_outcomes jsonb not null default '{}';
create or replace function public.record_trading_execution_outcome() returns trigger language plpgsql security invoker set search_path='' as $$
declare t public.trading_entries%rowtype; preferred public.trading_entries%rowtype; d public.trading_decisions%rowtype; resolved boolean;
begin
  select * into t from public.trading_entries where id=NEW.trade_id and user_id=NEW.user_id;
  select * into d from public.trading_decisions where id=t.decision_id and user_id=NEW.user_id;
  select * into preferred from public.trading_entries where decision_id=d.id and user_id=NEW.user_id and lifecycle_revision>0
    order by case when execution_source='broker_manual' then 0 else 1 end,opened_at,id limit 1;
  if preferred.review_snapshot is not null and preferred.review_snapshot->>'probabilityOutcome'<>'unresolved'
    and preferred.opened_at>=d.locked_at and preferred.opened_at<d.expires_at then resolved:=preferred.review_snapshot->>'probabilityOutcome'='target_first';end if;
  update public.decisions set execution_outcomes=execution_outcomes||jsonb_build_object(t.id::text,jsonb_build_object(
      'tradeId',t.id,'executionSource',t.execution_source,'paperRunId',t.paper_run_id,'netPnl',t.net_pnl,
      'status',t.status,'review',t.review_snapshot,'closedAt',t.closed_at)),
    actual_outcome_bool=resolved,outcome_rating=case when resolved is null then null when resolved then 'success' else 'failure' end,
    actual_outcome=format('%s execution %s: status %s; net %s %s. See execution_outcomes for all linked legs.',preferred.execution_source,preferred.id,preferred.status,preferred.net_pnl,preferred.risk_currency),
    closed_at=preferred.closed_at
    where id=d.buddies_decision_id and user_id=NEW.user_id;
  return NEW;
end $$;
-- Trigger name sorts after apply_trade_event so the journal projection is complete.
create trigger z_record_execution_outcome after insert on public.trading_trade_events for each row execute function public.record_trading_execution_outcome();
revoke all on function public.record_trading_execution_outcome() from public,anon,authenticated;

revoke all on function public.create_paper_run(uuid,uuid,jsonb,jsonb,jsonb),public.commit_paper_event(uuid,uuid,uuid,integer,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.create_paper_run(uuid,uuid,jsonb,jsonb,jsonb),public.commit_paper_event(uuid,uuid,uuid,integer,jsonb,jsonb,jsonb) to service_role;
revoke all on function public.guard_paper_entry(),public.guard_paper_event() from public,anon,authenticated;
-- Existing lifecycle functions remain invokers; server jobs bind auth.uid to the run owner.
grant execute on function public.capture_trading_plan(uuid,uuid,jsonb,jsonb,jsonb),public.append_trading_event(uuid,uuid,integer,text,jsonb) to service_role;
commit;
