-- Review draft. Apply after trading_lab_pretrade.sql in a verified test database.
-- This extends shared decisions, lessons, behavior, rules and memory.
begin;

create table if not exists public.trading_experiments (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
  request_id uuid not null, strategy_version_id uuid not null references public.trading_strategy_versions(id) on delete restrict,
  parent_experiment_id uuid references public.trading_experiments(id) on delete restrict,
  protocol jsonb not null, strategy_snapshot jsonb not null, approved_at timestamptz not null default now(),
  review_snapshot jsonb, review_decision_id uuid references public.decisions(id) on delete restrict,
  unique(user_id, request_id)
);
create table if not exists public.trading_observation_sessions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
  request_id uuid not null, experiment_id uuid not null references public.trading_experiments(id) on delete restrict,
  started_at timestamptz not null, ended_at timestamptz not null,
  qualifying_setups integer not null check (qualifying_setups >= 0),
  taken_setups integer not null check (taken_setups between 0 and qualifying_setups),
  notes text not null, recorded_at timestamptz not null default now(),
  check (ended_at > started_at), unique(user_id, request_id)
);
alter table public.trading_decisions add column if not exists experiment_id uuid references public.trading_experiments(id) on delete restrict;
alter table public.trading_entries
  add column if not exists experiment_id uuid references public.trading_experiments(id) on delete restrict,
  add column if not exists sample_member boolean not null default false,
  add column if not exists lifecycle_revision integer not null default 0,
  add column if not exists open_snapshot jsonb, add column if not exists close_snapshot jsonb,
  add column if not exists review_snapshot jsonb,
  add column if not exists planned_risk_amount numeric, add column if not exists risk_currency text,
  add column if not exists net_pnl numeric, add column if not exists remaining_quantity numeric,
  add column if not exists filled_quantity numeric, add column if not exists exit_quantity numeric not null default 0,
  add column if not exists exit_notional numeric not null default 0,
  add column if not exists last_event_at timestamptz;
create unique index if not exists trading_manual_plan_one_trade on public.trading_entries(decision_id) where lifecycle_revision > 0;
create index if not exists trading_entries_experiment on public.trading_entries(user_id, experiment_id);
create table if not exists public.trading_trade_events (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
  request_id uuid not null, trade_id uuid not null references public.trading_entries(id) deferrable initially deferred,
  expected_revision integer not null check(expected_revision >= 0),
  kind text not null check(kind in ('open','add_fill','change_protection','partial_exit','close','review')),
  payload jsonb not null, recorded_at timestamptz not null default now(), unique(user_id, request_id)
);
create index if not exists trading_trade_events_trade on public.trading_trade_events(user_id, trade_id, expected_revision);

alter table public.decisions add column if not exists actual_outcome_bool boolean, add column if not exists actual_outcome text;
alter table public.decision_lessons
  add column if not exists decision_id uuid references public.decisions(id) on delete restrict,
  add column if not exists missed_signal text, add column if not exists what_next text,
  add column if not exists source_event_id uuid references public.trading_trade_events(id) on delete restrict;
alter table public.behavior_logs add column if not exists decision_id uuid references public.decisions(id) on delete restrict,
  add column if not exists source_event_id uuid references public.trading_trade_events(id) on delete restrict;
alter table public.rule_violations add column if not exists decision_id uuid references public.decisions(id) on delete restrict,
  add column if not exists source_event_id uuid references public.trading_trade_events(id) on delete restrict;
create unique index if not exists trading_lesson_event on public.decision_lessons(source_event_id) where source_event_id is not null;

do $$ declare name text; begin
  foreach name in array array['trading_experiments','trading_observation_sessions','trading_trade_events'] loop
    execute format('alter table public.%I enable row level security', name);
    execute format('drop policy if exists owner on public.%I', name);
    execute format('create policy owner on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', name);
    execute format('grant select, insert, update on public.%I to authenticated', name);
  end loop;
end $$;
grant select, insert, update on public.trading_entries, public.decisions, public.decision_lessons,
  public.behavior_logs, public.rule_violations, public.ai_memory_items to authenticated;
grant select on public.rules, public.trading_strategies, public.trading_strategy_versions to authenticated;

-- Used by append-only evidence tables. Public clients may insert valid evidence,
-- but may never rewrite it, even by calling the Data API directly.
create or replace function public.trading_immutable_record() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin raise exception 'Evidence is immutable; append a new record' using errcode = '23514'; end $$;
drop trigger if exists immutable_trade_events on public.trading_trade_events;
create trigger immutable_trade_events before update or delete on public.trading_trade_events for each row execute function public.trading_immutable_record();
drop trigger if exists immutable_observations on public.trading_observation_sessions;
create trigger immutable_observations before update or delete on public.trading_observation_sessions for each row execute function public.trading_immutable_record();

create or replace function public.trading_experiment_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare v public.trading_strategy_versions%rowtype; p jsonb; count_closed integer; count_open integer; k text;
begin
  if TG_OP = 'DELETE' then raise exception 'Experiments preserve their sample history'; end if;
  if TG_OP = 'INSERT' then
    p := NEW.protocol;
    if NEW.user_id is distinct from auth.uid() or NEW.review_snapshot is not null or NEW.review_decision_id is not null
      or p->>'approved' is distinct from 'true' or p->>'strategyVersionId' is distinct from NEW.strategy_version_id::text
      or p->>'requestId' is distinct from NEW.request_id::text
      or nullif(p->>'parentExperimentId','')::uuid is distinct from NEW.parent_experiment_id
      or coalesce((p->>'targetSample')::integer,0) not between 2 and 1000
      or coalesce((p->>'riskAmount')::numeric,0) <= 0 or coalesce(p->>'riskCurrency','') !~ '^[A-Z]{3}$'
      or coalesce((p->>'entryTolerance')::numeric,-1) < 0 or coalesce((p->>'protectionTolerance')::numeric,-1) < 0
      or coalesce((p->>'quantityTolerancePct')::numeric,-1) not between 0 and 100 then
      raise exception 'Invalid approved experiment protocol' using errcode = '23514';
    end if;
    foreach k in array array['name','hypothesis','session','timezone','eligibility','invalidation','stopConditions','reviewCriteria'] loop
      if coalesce(length(btrim(p->>k)),0) = 0 then raise exception 'Protocol field % is required', k; end if;
    end loop;
    if not exists (select 1 from pg_catalog.pg_timezone_names where name = p->>'timezone') then raise exception 'Invalid experiment timezone'; end if;
    select sv.* into v from public.trading_strategy_versions sv join public.trading_strategies s on s.id=sv.strategy_id
      where sv.id=NEW.strategy_version_id and sv.user_id=NEW.user_id and s.user_id=NEW.user_id for share of sv,s;
    if not found or v.definition is distinct from NEW.strategy_snapshot then raise exception 'Owned exact strategy version required' using errcode='42501'; end if;
    if NEW.parent_experiment_id is not null and not exists(select 1 from public.trading_experiments e where e.id=NEW.parent_experiment_id and e.user_id=NEW.user_id and e.review_snapshot is not null) then raise exception 'Parent experiment must be owned and reviewed'; end if;
    NEW.approved_at := clock_timestamp();
  else
    if (NEW.id,NEW.user_id,NEW.request_id,NEW.strategy_version_id,NEW.parent_experiment_id,NEW.protocol,NEW.strategy_snapshot,NEW.approved_at)
      is distinct from (OLD.id,OLD.user_id,OLD.request_id,OLD.strategy_version_id,OLD.parent_experiment_id,OLD.protocol,OLD.strategy_snapshot,OLD.approved_at)
      or OLD.review_snapshot is not null then raise exception 'Experiment protocol and completed review are immutable' using errcode='23514'; end if;
    if NEW.review_snapshot is null or NEW.review_decision_id is null
      or NEW.review_snapshot->>'approved' is distinct from 'true'
      or coalesce(NEW.review_snapshot->>'action','') not in ('KEEP','MODIFY','RETEST','KILL')
      or coalesce(length(btrim(NEW.review_snapshot->>'rationale')),0)=0 then raise exception 'An approved review is required'; end if;
    select count(*) filter(where status='closed'),count(*) filter(where status='open') into count_closed,count_open
      from public.trading_entries where experiment_id=OLD.id and user_id=OLD.user_id and sample_member;
    if count_open>0 then raise exception 'Close the remaining sample trades before review'; end if;
    if count_closed < (OLD.protocol->>'targetSample')::integer and coalesce(length(btrim(NEW.review_snapshot->>'stopReason')),0)=0 then raise exception 'An early stop needs a reason'; end if;
    if not exists(select 1 from public.decisions d where d.id=NEW.review_decision_id and d.user_id=NEW.user_id and d.verdict=NEW.review_snapshot->>'action' and d.domain='trading') then raise exception 'Owned shared review decision required'; end if;
    NEW.review_snapshot := NEW.review_snapshot || jsonb_build_object('recordedAt',clock_timestamp(),'closedSample',count_closed);
  end if;
  return NEW;
end $$;
drop trigger if exists guard_experiment on public.trading_experiments;
create trigger guard_experiment before insert or update or delete on public.trading_experiments for each row execute function public.trading_experiment_guard();

create or replace function public.trading_experiment_version_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if exists(select 1 from public.trading_experiments where strategy_version_id=OLD.id) then raise exception 'Experiment version is frozen; save a new version' using errcode='23514'; end if;
  if TG_OP='DELETE' then return OLD; end if; return NEW;
end $$;
drop trigger if exists experiment_version_guard on public.trading_strategy_versions;
create trigger experiment_version_guard before update or delete on public.trading_strategy_versions for each row execute function public.trading_experiment_version_guard();

create or replace function public.trading_plan_experiment_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare e public.trading_experiments%rowtype;
begin
  NEW.experiment_id := nullif(NEW.plan_snapshot->>'experimentId','')::uuid;
  if NEW.experiment_id is not null then
    select * into e from public.trading_experiments where id=NEW.experiment_id and user_id=NEW.user_id for share;
    if not found or e.review_snapshot is not null or e.strategy_version_id is distinct from NEW.strategy_version_id then raise exception 'Choose an active experiment for this exact version' using errcode='23514'; end if;
    if (NEW.plan_snapshot->>'riskAmount')::numeric is distinct from (e.protocol->>'riskAmount')::numeric
      or NEW.plan_snapshot->>'riskCurrency' is distinct from e.protocol->>'riskCurrency' then raise exception 'Planned risk must match the frozen experiment protocol' using errcode='23514'; end if;
  end if;
  return NEW;
end $$;
drop trigger if exists zz_plan_experiment on public.trading_decisions;
create trigger zz_plan_experiment before insert on public.trading_decisions for each row execute function public.trading_plan_experiment_guard();

create or replace function public.trading_observation_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare e public.trading_experiments%rowtype;
begin
  select * into e from public.trading_experiments where id=NEW.experiment_id and user_id=auth.uid() for update;
  if not found or NEW.user_id is distinct from auth.uid() or e.review_snapshot is not null then raise exception 'Active owned experiment required'; end if;
  if NEW.started_at<e.approved_at or NEW.ended_at>clock_timestamp() then raise exception 'Coverage must occur after approval and cannot be in the future'; end if;
  if exists(select 1 from public.trading_observation_sessions where experiment_id=NEW.experiment_id and started_at<NEW.ended_at and ended_at>NEW.started_at) then raise exception 'Observation coverage overlaps an existing session'; end if;
  NEW.recorded_at:=clock_timestamp(); return NEW;
end $$;
drop trigger if exists guard_observation on public.trading_observation_sessions;
create trigger guard_observation before insert on public.trading_observation_sessions for each row execute function public.trading_observation_guard();

create or replace function public.trading_entry_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if TG_OP='DELETE' then
    if OLD.lifecycle_revision>0 then raise exception 'Manual lifecycle history cannot be deleted'; end if; return OLD;
  end if;
  if NEW.lifecycle_revision=0 and NEW.decision_id is not null and exists(select 1 from public.trading_decisions where id=NEW.decision_id and locked_at is not null) then raise exception 'Use Execution for a locked plan'; end if;
  if (NEW.lifecycle_revision>0 or NEW.sample_member or NEW.open_snapshot is not null or NEW.experiment_id is not null or (TG_OP='UPDATE' and OLD.lifecycle_revision>0)) and pg_trigger_depth()<2 then
    raise exception 'Use the append-only trade event workflow' using errcode='23514';
  end if;
  return NEW;
end $$;
drop trigger if exists guard_manual_entry on public.trading_entries;
create trigger guard_manual_entry before insert or update or delete on public.trading_entries for each row execute function public.trading_entry_guard();

-- Applying an event is a single transaction: journal, shared decision, lesson,
-- behavior/violations and searchable memory either all commit or all roll back.
create or replace function public.apply_trading_event() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare t public.trading_entries%rowtype; d public.trading_decisions%rowtype; e public.trading_experiments%rowtype;
  p jsonb:=NEW.payload; occurred timestamptz; price numeric; qty numeric; pnl numeric; b jsonb; f jsonb; k text;
  shared_id uuid; lesson_id uuid; member boolean:=false; num integer; event_outcome boolean; observation timestamptz;
begin
  if NEW.user_id is distinct from auth.uid() or jsonb_typeof(p) is distinct from 'object' then raise exception 'Owned structured event required' using errcode='42501'; end if;
  NEW.recorded_at:=clock_timestamp();
  if NEW.kind<>'review' then
    foreach k in array case when NEW.kind='change_protection' then array['stopLoss','takeProfit'] when NEW.kind='open' then array['price','quantity','stopLoss','takeProfit','actualRiskAmount'] when NEW.kind='close' then array['price','quantity','pnlAmount','fees','financing'] else array['price','quantity'] end loop
      if jsonb_typeof(p->k) is distinct from 'number' then raise exception 'Event field % must be numeric',k; end if;
    end loop;
    occurred:=(p->>'occurredAt')::timestamptz;
    if occurred is null or occurred>NEW.recorded_at or coalesce(length(btrim(p->>'reason')),0)=0 then raise exception 'Event needs a past timestamp and reason' using errcode='23514'; end if;
    if NEW.kind<>'change_protection' then
      price:=(p->>'price')::numeric; qty:=(p->>'quantity')::numeric;
      if price is null or qty is null or price<=0 or qty<=0 or price::text in ('NaN','Infinity','-Infinity') or qty::text in ('NaN','Infinity','-Infinity') then raise exception 'Positive finite fill price and quantity required'; end if;
    end if;
  end if;
  if NEW.kind='open' then
    if NEW.expected_revision<>0 then raise exception 'Open event starts at revision zero'; end if;
    select * into d from public.trading_decisions where id=(p->>'planId')::uuid and user_id=NEW.user_id and locked_at is not null for share;
    if not found then raise exception 'Owned locked plan required' using errcode='42501'; end if;
    if coalesce((p->>'actualRiskAmount')::numeric,0)<=0 or coalesce(length(btrim(p->>'brokerReference')),0)=0
      or coalesce((p->>'stopLoss')::numeric,0)<=0 or coalesce((p->>'takeProfit')::numeric,0)<=0 then raise exception 'Actual risk, protection and broker reference required'; end if;
    if (d.plan_snapshot->>'direction'='long' and not ((p->>'stopLoss')::numeric<price and price<(p->>'takeProfit')::numeric))
      or (d.plan_snapshot->>'direction'='short' and not ((p->>'takeProfit')::numeric<price and price<(p->>'stopLoss')::numeric)) then raise exception 'Initial actual protection does not match the trade direction'; end if;
    if d.experiment_id is not null then
      select * into e from public.trading_experiments where id=d.experiment_id and user_id=NEW.user_id for update;
      select count(*) into num from public.trading_entries where experiment_id=e.id and sample_member;
      member:=e.review_snapshot is null and num<(e.protocol->>'targetSample')::integer;
    end if;
    insert into public.trading_entries(id,user_id,instrument,direction,entry_price,lot_size,stop_loss,take_profit,opened_at,
      status,source,account_type,decision_id,experiment_id,sample_member,lifecycle_revision,open_snapshot,
      planned_risk_amount,risk_currency,remaining_quantity,filled_quantity,last_event_at,notes)
      values(NEW.trade_id,NEW.user_id,d.instrument,case when d.plan_snapshot->>'direction'='long' then 'buy' else 'sell' end,
        price,case when d.plan_snapshot->>'quantityUnit'='lots' then qty else 0 end,(p->>'stopLoss')::numeric,(p->>'takeProfit')::numeric,occurred,
        'open','manual','external',d.id,d.experiment_id,member,1,p,(d.plan_snapshot->>'riskAmount')::numeric,d.plan_snapshot->>'riskCurrency',qty,qty,occurred,p->>'reason');
    return NEW;
  end if;
  select * into t from public.trading_entries where id=NEW.trade_id and user_id=NEW.user_id for update;
  if not found or t.lifecycle_revision=0 then raise exception 'Owned manual lifecycle trade required' using errcode='42501'; end if;
  if NEW.expected_revision<>t.lifecycle_revision then raise exception 'Trade changed; reload before recording an event' using errcode='40001'; end if;
  select * into d from public.trading_decisions where id=t.decision_id and user_id=NEW.user_id;
  shared_id:=d.buddies_decision_id;
  if NEW.kind='review' then
    if t.status<>'closed' then raise exception 'Close the trade before review'; end if;
    if t.experiment_id is not null then
      perform 1 from public.trading_experiments where id=t.experiment_id and review_snapshot is null for update;
      if not found and t.sample_member then raise exception 'Sample review is frozen; add new evidence in the next experiment'; end if;
    end if;
    foreach k in array array['thesis','direction','entryTiming','confirmation','stopPlacement','targetRealistic','strategyFollowed','managementFollowed'] loop
      f:=p->'findings'->k;
      if coalesce(f->>'status','') not in ('pass','fail','unknown') or (f->>'status'<>'unknown' and coalesce(length(btrim(f->>'evidence')),0)=0) then raise exception 'Review finding % needs a status and evidence',k; end if;
    end loop;
    foreach k in array array['strategyReference','frozenPlanReference'] loop
      f:=p->k;
      if jsonb_typeof(f) is distinct from 'object' or not(f ? 'r') then raise exception 'Reference outcome must be a number or explicitly unknown'; end if;
      if f->>'r' is not null and ((f->>'r')::numeric::text in ('NaN','Infinity','-Infinity') or coalesce(length(btrim(f->>'evidence')),0)=0) then raise exception 'Reference outcome requires finite R and reconstruction evidence'; end if;
    end loop;
    if coalesce(p->>'probabilityOutcome','') not in ('target_first','stop_first','neither','unresolved') then raise exception 'Invalid probability outcome'; end if;
    if p->>'probabilityOutcome'<>'unresolved' then
      observation:=(p->>'probabilityObservedAt')::timestamptz;
      if observation is null or observation>NEW.recorded_at or observation<t.opened_at or coalesce(length(btrim(p->>'probabilityEvidence')),0)=0 then raise exception 'Probability outcome needs observed evidence and a valid time'; end if;
      if (p->>'probabilityOutcome'='neither' and observation<d.expires_at)
        or (p->>'probabilityOutcome' in ('target_first','stop_first') and observation>d.expires_at) then raise exception 'Probability resolution must match the original horizon'; end if;
      if t.opened_at>=d.locked_at and t.opened_at<d.expires_at then event_outcome:=p->>'probabilityOutcome'='target_first'; end if;
    end if;
    if coalesce(length(btrim(p->>'lesson')),0)=0 or coalesce(length(btrim(p->>'nextAction')),0)=0 or jsonb_typeof(p->'behaviors') is distinct from 'array' then raise exception 'Lesson, next action and explicit behavior list required'; end if;
    for b in select value from jsonb_array_elements(p->'behaviors') loop
      if coalesce(b->>'type','') not in ('early_entry','revenge_trade','overtrading','moved_stop','closed_early','ignored_confirmation','daily_loss_limit','outside_session','increased_risk_after_loss','fomo','strategy_violation') or coalesce(length(btrim(b->>'evidence')),0)=0 then raise exception 'Behavior needs a recognized type and evidence'; end if;
      if b->>'ruleId' is not null and not exists(select 1 from public.rules where id=(b->>'ruleId')::uuid and user_id=NEW.user_id) then raise exception 'Rule must belong to the same owner' using errcode='42501'; end if;
    end loop;
    update public.trading_entries set review_snapshot=p, lifecycle_revision=lifecycle_revision+1 where id=t.id;
    update public.decisions set actual_outcome_bool=event_outcome, outcome_rating=case when event_outcome is null then 'unresolved' when event_outcome then 'success' else 'failure' end,
      actual_outcome=format('Manual trade %s: net %s %s (%sR). Prediction event: %s. Thesis: %s. Strategy followed: %s. %s',t.id,t.net_pnl,t.risk_currency,t.net_pnl/t.planned_risk_amount,p->>'probabilityOutcome',p->'findings'->'thesis'->>'status',p->'findings'->'strategyFollowed'->>'status',p->>'lesson'),
      closed_at=t.closed_at where id=shared_id and user_id=NEW.user_id;
    insert into public.decision_lessons(user_id,decision_id,source_event_id,lesson,domain,what_next)
      values(NEW.user_id,shared_id,NEW.id,p->>'lesson','trading',p->>'nextAction') returning id into lesson_id;
    for b in select value from jsonb_array_elements(p->'behaviors') loop
      insert into public.behavior_logs(user_id,decision_id,source_event_id,mood_tag,notes)
        values(NEW.user_id,shared_id,NEW.id,b->>'type',b->>'evidence');
      if b->>'ruleId' is not null then
        insert into public.rule_violations(user_id,decision_id,source_event_id,rule_id,context)
          values(NEW.user_id,shared_id,NEW.id,(b->>'ruleId')::uuid,b->>'evidence');
      end if;
    end loop;
    -- Superseded reviews remain in evidence history; only the latest is active retrieval context.
    update public.ai_memory_items set status='superseded',updated_at=clock_timestamp()
      where user_id=NEW.user_id and source_kind='trading_review' and metadata->>'trade_id'=t.id::text;
    insert into public.ai_memory_items(user_id,memory_type,title,content,importance,status,source_kind,source_ref,metadata,keywords)
      values(NEW.user_id,'lesson','Trading review: '||d.instrument,p->>'lesson'||E'\nNext action: '||(p->>'nextAction'),4,'active','trading_review',lesson_id::text,
        jsonb_build_object('trade_id',t.id,'decision_id',shared_id,'strategy_version_id',d.strategy_version_id,'experiment_id',t.experiment_id,'event_id',NEW.id,'provenance','human_review'),array['trading',d.instrument]);
    return NEW;
  end if;
  if t.status<>'open' or occurred<t.last_event_at then raise exception 'Trade must be open and execution events chronological'; end if;
  if NEW.kind='change_protection' then
    if coalesce((p->>'stopLoss')::numeric,0)<=0 or coalesce((p->>'takeProfit')::numeric,0)<=0 then raise exception 'Positive protection prices required'; end if;
    update public.trading_entries set stop_loss=(p->>'stopLoss')::numeric,take_profit=(p->>'takeProfit')::numeric,last_event_at=occurred,lifecycle_revision=lifecycle_revision+1 where id=t.id;
  elsif NEW.kind='add_fill' then
    if t.exit_quantity>0 then raise exception 'Record a separate plan for re-entry after an exit'; end if;
    update public.trading_entries set entry_price=(entry_price*filled_quantity+price*qty)/(filled_quantity+qty),
      remaining_quantity=remaining_quantity+qty,filled_quantity=filled_quantity+qty,last_event_at=occurred,lifecycle_revision=lifecycle_revision+1 where id=t.id;
  elsif NEW.kind='partial_exit' then
    if qty>=t.remaining_quantity then raise exception 'Partial exit must leave a positive balance; use Close for the final fill'; end if;
    update public.trading_entries set remaining_quantity=remaining_quantity-qty,exit_quantity=exit_quantity+qty,exit_notional=exit_notional+price*qty,last_event_at=occurred,lifecycle_revision=lifecycle_revision+1 where id=t.id;
  elsif NEW.kind='close' then
    if qty<>t.remaining_quantity then raise exception 'Final exit quantity must equal the remaining quantity'; end if;
    if coalesce(p->>'pnlBasis','') not in ('broker_net','gross') or p->>'pnlAmount' is null or p->>'financing' is null or coalesce((p->>'fees')::numeric,-1)<0 or coalesce(length(btrim(p->>'pnlEvidence')),0)=0 then raise exception 'A complete P&L and cost reconciliation is required'; end if;
    pnl:=case when p->>'pnlBasis'='broker_net' then (p->>'pnlAmount')::numeric else (p->>'pnlAmount')::numeric-(p->>'fees')::numeric+(p->>'financing')::numeric end;
    if pnl::text in ('NaN','Infinity','-Infinity') then raise exception 'P&L must be finite'; end if;
    update public.trading_entries set close_snapshot=p,net_pnl=pnl,result_usd=case when risk_currency='USD' then pnl else null end,
      r_multiple=pnl/planned_risk_amount,fees_usd=case when risk_currency='USD' then (p->>'fees')::numeric else 0 end,
      exit_price=(exit_notional+price*qty)/(exit_quantity+qty),remaining_quantity=0,exit_quantity=exit_quantity+qty,exit_notional=exit_notional+price*qty,
      closed_at=occurred,status='closed',last_event_at=occurred,lifecycle_revision=lifecycle_revision+1 where id=t.id;
    update public.decisions set closed_at=occurred,actual_outcome=format('Manual trade %s closed: net %s %s. Prediction event unresolved until evidence review.',t.id,pnl,t.risk_currency) where id=shared_id and user_id=NEW.user_id;
  end if;
  return NEW;
end $$;
-- AFTER permits lesson/behavior FKs to reference this event; receipt time is set separately.
create or replace function public.trading_event_timestamp() returns trigger language plpgsql security invoker set search_path='' as $$
begin NEW.recorded_at:=clock_timestamp(); return NEW; end $$;
drop trigger if exists stamp_trade_event on public.trading_trade_events;
create trigger stamp_trade_event before insert on public.trading_trade_events for each row execute function public.trading_event_timestamp();
drop trigger if exists apply_trade_event on public.trading_trade_events;
create trigger apply_trade_event after insert on public.trading_trade_events for each row execute function public.apply_trading_event();

create or replace function public.append_trading_event(p_request_id uuid,p_trade_id uuid,p_expected_revision integer,p_kind text,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare old_event public.trading_trade_events%rowtype; t public.trading_entries%rowtype; actor uuid:=auth.uid();
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text||p_request_id::text,0));
  select * into old_event from public.trading_trade_events where user_id=actor and request_id=p_request_id;
  if found then
    if (old_event.trade_id,old_event.expected_revision,old_event.kind,old_event.payload) is distinct from (p_trade_id,p_expected_revision,p_kind,p_payload) then raise exception 'Request ID belongs to another event' using errcode='23505'; end if;
  else
    insert into public.trading_trade_events(user_id,request_id,trade_id,expected_revision,kind,payload)
      values(actor,p_request_id,p_trade_id,p_expected_revision,p_kind,p_payload);
  end if;
  select * into t from public.trading_entries where id=p_trade_id and user_id=actor;
  return to_jsonb(t);
end $$;

create or replace function public.review_trading_experiment(p_experiment_id uuid,p_review jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare e public.trading_experiments%rowtype; shared_id uuid; actor uuid:=auth.uid();
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into e from public.trading_experiments where id=p_experiment_id and user_id=actor for update;
  if not found then raise exception 'Experiment not found' using errcode='42501'; end if;
  if e.review_snapshot is not null then
    if e.review_snapshot - 'recordedAt' - 'closedSample' is distinct from p_review then raise exception 'Experiment is already reviewed' using errcode='23505'; end if;
    return to_jsonb(e);
  end if;
  insert into public.decisions(user_id,context,verdict,domain)
    values(actor,'Experiment review: '||(e.protocol->>'name')||E'\n'||(p_review->>'rationale'),p_review->>'action','trading') returning id into shared_id;
  update public.trading_experiments set review_snapshot=p_review,review_decision_id=shared_id where id=e.id returning * into e;
  insert into public.ai_memory_items(user_id,memory_type,title,content,source_kind,source_ref,metadata)
    values(actor,'decision','Experiment review: '||(e.protocol->>'name'),(p_review->>'action')||': '||(p_review->>'rationale')||E'\nNext hypothesis: '||coalesce(p_review->>'nextHypothesis',''),
      'trading_experiment_review',shared_id::text,jsonb_build_object('experiment_id',e.id,'strategy_version_id',e.strategy_version_id));
  return to_jsonb(e);
end $$;

-- Keep function privileges narrow. Trigger functions cannot be invoked as RPCs.
do $$ declare name text; begin
  foreach name in array array['trading_immutable_record','trading_experiment_guard','trading_experiment_version_guard','trading_plan_experiment_guard','trading_observation_guard','trading_entry_guard','apply_trading_event','trading_event_timestamp'] loop
    execute format('revoke all on function public.%I() from public,anon,authenticated',name);
  end loop;
end $$;
revoke all on function public.append_trading_event(uuid,uuid,integer,text,jsonb) from public,anon;
grant execute on function public.append_trading_event(uuid,uuid,integer,text,jsonb) to authenticated;
revoke all on function public.review_trading_experiment(uuid,jsonb) from public,anon;
grant execute on function public.review_trading_experiment(uuid,jsonb) to authenticated;
-- Atomic version creation; retries preserve the same exact version.
alter table public.trading_strategy_versions add column if not exists save_request_id uuid, add column if not exists save_request_snapshot jsonb;
create unique index if not exists trading_strategy_save_request on public.trading_strategy_versions(user_id,save_request_id) where save_request_id is not null;
create or replace function public.save_trading_strategy(p_request_id uuid,p_strategy_id uuid,p_definition jsonb,p_change_note text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare actor uuid:=auth.uid(); s public.trading_strategies%rowtype; v public.trading_strategy_versions%rowtype; n integer; request jsonb;
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_request_id is null or jsonb_typeof(p_definition) is distinct from 'object' or coalesce(length(btrim(p_definition->>'name')),0)=0 then raise exception 'Valid strategy and request required'; end if;
  request:=jsonb_build_object('strategyId',p_strategy_id,'definition',p_definition,'changeNote',p_change_note);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text||p_request_id::text,0));
  select * into v from public.trading_strategy_versions where user_id=actor and save_request_id=p_request_id;
  if found then
    if v.save_request_snapshot is distinct from request then raise exception 'Request ID belongs to another version' using errcode='23505'; end if;
    select * into s from public.trading_strategies where id=v.strategy_id and user_id=actor;
    return jsonb_build_object('strategy',to_jsonb(s),'version',to_jsonb(v));
  end if;
  if p_strategy_id is null then
    insert into public.trading_strategies(user_id,name,description,market)
      values(actor,p_definition->>'name',coalesce(p_definition->>'description',''),p_definition->>'market') returning * into s;
    n:=1;
  else
    select * into s from public.trading_strategies where id=p_strategy_id and user_id=actor for update;
    if not found then raise exception 'Strategy not found' using errcode='42501'; end if;
    select coalesce(max(version),0)+1 into n from public.trading_strategy_versions where strategy_id=s.id;
  end if;
  insert into public.trading_strategy_versions(user_id,strategy_id,version,definition,change_note,save_request_id,save_request_snapshot)
    values(actor,s.id,n,p_definition,p_change_note,p_request_id,request) returning * into v;
  update public.trading_strategies set name=p_definition->>'name',description=coalesce(p_definition->>'description',''),active_version=n,updated_at=clock_timestamp() where id=s.id returning * into s;
  return jsonb_build_object('strategy',to_jsonb(s),'version',to_jsonb(v));
end $$;
revoke all on function public.save_trading_strategy(uuid,uuid,jsonb,text) from public,anon;
grant execute on function public.save_trading_strategy(uuid,uuid,jsonb,text) to authenticated;
create or replace function public.trading_experiment_decision_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if exists(select 1 from public.trading_experiments where review_decision_id=OLD.id) then
    raise exception 'Finalized experiment decision is immutable' using errcode='23514';
  end if;
  if TG_OP='DELETE' then return OLD; end if; return NEW;
end $$;
drop trigger if exists guard_experiment_decision on public.decisions;
create trigger guard_experiment_decision before update or delete on public.decisions for each row execute function public.trading_experiment_decision_guard();
revoke all on function public.trading_experiment_decision_guard() from public,anon,authenticated;
commit;
