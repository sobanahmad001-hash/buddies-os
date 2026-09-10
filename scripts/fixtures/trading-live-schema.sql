-- Isolated test fixture captured from the verified Buddies public catalog on 2026-09-09.
-- No user rows, keys or credentials. External FK targets are ID-only stubs.
-- The two unused vector embedding columns use text in PGlite; vector retrieval is not tested here.
create role authenticated; create role anon;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
-- UUID generation is equivalent; the uuid-ossp extension is not needed for this fixture.
create function public.uuid_generate_v4() returns uuid language sql volatile as $$select gen_random_uuid()$$;
create table public.projects(id uuid primary key);
create table public.workspaces(id uuid primary key);
create table public.trading_ladder_campaigns(id uuid primary key);
create table public.trading_import_batches(id uuid primary key);
create table public."ai_memory_items" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "project_id" uuid,
  "session_id" uuid,
  "memory_type" text not null,
  "title" text,
  "content" text not null,
  "keywords" text[] default '{}'::text[],
  "importance" integer default 3,
  "severity" integer default 0,
  "status" text default 'active'::text,
  "source_kind" text,
  "source_ref" text,
  "metadata" jsonb default '{}'::jsonb,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "last_used_at" timestamp with time zone
);
create table public."behavior_logs" (
  "id" uuid default uuid_generate_v4() not null,
  "project_id" uuid,
  "timestamp" timestamp with time zone default now(),
  "sleep_hours" numeric(3,1),
  "sleep_quality" integer,
  "sleep_start" timestamp with time zone,
  "sleep_end" timestamp with time zone,
  "wake_count" integer,
  "caffeine_after_6pm" boolean,
  "mood_tag" text,
  "stress" integer,
  "confidence" integer,
  "impulse" integer,
  "trigger_tag" text,
  "notes" text,
  "user_id" uuid,
  "workspace_id" uuid,
  "source_message_id" text,
  "cognitive_score" integer
);
create table public."decision_lessons" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "decision_id" uuid,
  "lesson" text,
  "missed_signal" text,
  "what_next" text,
  "created_at" timestamp with time zone default now(),
  "embedding" text
);
create table public."decisions" (
  "id" uuid default uuid_generate_v4() not null,
  "project_id" uuid,
  "domain" text default 'general'::text,
  "context" text not null,
  "options" jsonb,
  "chosen_option" text,
  "probability" integer,
  "base_case" text,
  "upside_case" text,
  "downside_case" text,
  "risk_flags" text,
  "verdict" text,
  "expected_outcome" text,
  "actual_outcome" text,
  "review_date" date,
  "created_at" timestamp with time zone default now(),
  "user_id" uuid,
  "workspace_id" uuid,
  "source_message_id" text,
  "outcome_rating" text,
  "closed_at" timestamp with time zone,
  "prediction_accuracy" integer,
  "accuracy_note" text,
  "type" text,
  "sleep_at_decision" numeric(4,1),
  "stress_at_decision" integer,
  "confidence_at_decision" integer,
  "impulse_at_decision" integer,
  "cognitive_score_at_decision" integer,
  "predicted_probability" integer,
  "actual_outcome_bool" boolean,
  "embedding" text
);
create table public."rule_violations" (
  "id" uuid default uuid_generate_v4() not null,
  "project_id" uuid,
  "rule_id" uuid,
  "timestamp" timestamp with time zone default now(),
  "related_ref" jsonb,
  "notes" text,
  "user_id" uuid,
  "workspace_id" uuid,
  "source_message_id" text
);
create table public."rules" (
  "id" uuid default uuid_generate_v4() not null,
  "project_id" uuid,
  "domain" text default 'general'::text,
  "rule_text" text not null,
  "severity" integer default 2,
  "active" boolean default true,
  "created_at" timestamp with time zone default now(),
  "user_id" uuid,
  "workspace_id" uuid,
  "source_message_id" text
);
create table public."trading_decisions" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "strategy_version_id" uuid,
  "ladder_campaign_id" uuid,
  "instrument" text not null,
  "decision_state" text not null,
  "bias" text not null,
  "confidence" integer not null,
  "data_quality" jsonb default '{}'::jsonb not null,
  "fundamental" jsonb default '{}'::jsonb not null,
  "technical" jsonb default '{}'::jsonb not null,
  "volume_wyckoff" jsonb default '{}'::jsonb not null,
  "market_snapshot" jsonb default '{}'::jsonb not null,
  "trigger_text" text,
  "invalidation_text" text,
  "blockers" text[] default '{}'::text[] not null,
  "sources" jsonb default '[]'::jsonb not null,
  "narrative" text,
  "provider" text,
  "model" text,
  "as_of" timestamp with time zone not null,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null
);
create table public."trading_entries" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "ladder_step" integer not null,
  "broker" text,
  "instrument" text default 'XAUUSD'::text,
  "direction" text,
  "entry_price" numeric(10,4),
  "exit_price" numeric(10,4),
  "lot_size" numeric(8,4),
  "result_usd" numeric(12,2),
  "result_pips" numeric(8,2),
  "status" text default 'open'::text,
  "opened_at" timestamp with time zone default now(),
  "closed_at" timestamp with time zone,
  "notes" text,
  "created_at" timestamp with time zone default now(),
  "stop_loss" numeric(12,4),
  "take_profit" numeric(12,4),
  "account_type" text default 'demo'::text,
  "exness_ticket" text,
  "strategy" text,
  "setup_name" text,
  "timeframe" text,
  "session" text,
  "checklist_passed" boolean,
  "checklist_results" jsonb default '{}'::jsonb not null,
  "planned_risk_usd" numeric,
  "fees_usd" numeric default 0 not null,
  "slippage" numeric,
  "r_multiple" numeric,
  "mfe" numeric,
  "mae" numeric,
  "emotions" text,
  "mistakes" text[] default '{}'::text[] not null,
  "lessons" text,
  "decision_id" uuid,
  "ladder_campaign_id" uuid,
  "external_trade_id" text,
  "import_batch_id" uuid,
  "source" text default 'manual'::text not null,
  "updated_at" timestamp with time zone default now() not null
);
create table public."trading_strategies" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "name" text not null,
  "description" text default ''::text not null,
  "market" text default 'gold'::text not null,
  "status" text default 'draft'::text not null,
  "active_version" integer default 1 not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);
create table public."trading_strategy_versions" (
  "id" uuid default gen_random_uuid() not null,
  "strategy_id" uuid not null,
  "user_id" uuid not null,
  "version" integer not null,
  "definition" jsonb not null,
  "change_note" text default ''::text not null,
  "created_at" timestamp with time zone default now() not null
);
alter table public."ai_memory_items" add constraint "ai_memory_items_pkey" PRIMARY KEY (id);
alter table public."behavior_logs" add constraint "behavior_logs_confidence_check" CHECK (((confidence >= 1) AND (confidence <= 10)));
alter table public."behavior_logs" add constraint "behavior_logs_impulse_check" CHECK (((impulse >= 1) AND (impulse <= 10)));
alter table public."behavior_logs" add constraint "behavior_logs_mood_allowed" CHECK ((mood_tag = ANY (ARRAY['calm'::text, 'focused'::text, 'rushed'::text, 'bored'::text, 'anxious'::text, 'fearful'::text, 'angry'::text, 'frustrated'::text, 'overconfident'::text, 'exhausted'::text])));
alter table public."behavior_logs" add constraint "behavior_logs_pkey" PRIMARY KEY (id);
alter table public."behavior_logs" add constraint "behavior_logs_sleep_quality_check" CHECK (((sleep_quality >= 1) AND (sleep_quality <= 5)));
alter table public."behavior_logs" add constraint "behavior_logs_stress_check" CHECK (((stress >= 1) AND (stress <= 10)));
alter table public."decision_lessons" add constraint "decision_lessons_pkey" PRIMARY KEY (id);
alter table public."decisions" add constraint "decisions_outcome_rating_check" CHECK ((outcome_rating = ANY (ARRAY['success'::text, 'failure'::text, 'mixed'::text, 'pending'::text])));
alter table public."decisions" add constraint "decisions_pkey" PRIMARY KEY (id);
alter table public."decisions" add constraint "decisions_probability_check" CHECK (((probability >= 0) AND (probability <= 100)));
alter table public."decisions" add constraint "decisions_verdict_allowed" CHECK ((verdict = ANY (ARRAY['enter'::text, 'wait'::text, 'do_not_enter'::text])));
alter table public."rule_violations" add constraint "rule_violations_pkey" PRIMARY KEY (id);
alter table public."rules" add constraint "rules_pkey" PRIMARY KEY (id);
alter table public."trading_decisions" add constraint "trading_decisions_bias_check" CHECK ((bias = ANY (ARRAY['bullish'::text, 'bearish'::text, 'neutral'::text])));
alter table public."trading_decisions" add constraint "trading_decisions_confidence_check" CHECK (((confidence >= 0) AND (confidence <= 100)));
alter table public."trading_decisions" add constraint "trading_decisions_decision_state_check" CHECK ((decision_state = ANY (ARRAY['NO TRADE'::text, 'WATCH LONG'::text, 'WATCH SHORT'::text, 'LONG SETUP CONFIRMED'::text, 'SHORT SETUP CONFIRMED'::text])));
alter table public."trading_decisions" add constraint "trading_decisions_pkey" PRIMARY KEY (id);
alter table public."trading_entries" add constraint "trading_entries_account_type_check" CHECK ((account_type = ANY (ARRAY['demo'::text, 'live'::text])));
alter table public."trading_entries" add constraint "trading_entries_broker_check" CHECK ((broker = ANY (ARRAY['exness'::text, 'icmarkets'::text, 'other'::text])));
alter table public."trading_entries" add constraint "trading_entries_direction_check" CHECK ((direction = ANY (ARRAY['buy'::text, 'sell'::text])));
alter table public."trading_entries" add constraint "trading_entries_pkey" PRIMARY KEY (id);
alter table public."trading_entries" add constraint "trading_entries_status_check" CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text, 'cancelled'::text])));
alter table public."trading_strategies" add constraint "trading_strategies_pkey" PRIMARY KEY (id);
alter table public."trading_strategies" add constraint "trading_strategies_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'testing'::text, 'validated'::text, 'archived'::text])));
alter table public."trading_strategy_versions" add constraint "trading_strategy_versions_pkey" PRIMARY KEY (id);
alter table public."trading_strategy_versions" add constraint "trading_strategy_versions_strategy_id_version_key" UNIQUE (strategy_id, version);
alter table public."ai_memory_items" add constraint "ai_memory_items_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
alter table public."ai_memory_items" add constraint "ai_memory_items_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."behavior_logs" add constraint "behavior_logs_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
alter table public."behavior_logs" add constraint "behavior_logs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id);
alter table public."behavior_logs" add constraint "behavior_logs_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL;
alter table public."decision_lessons" add constraint "decision_lessons_decision_id_fkey" FOREIGN KEY (decision_id) REFERENCES decisions(id) ON DELETE CASCADE;
alter table public."decision_lessons" add constraint "decision_lessons_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."decisions" add constraint "decisions_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
alter table public."decisions" add constraint "decisions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id);
alter table public."decisions" add constraint "decisions_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL;
alter table public."rule_violations" add constraint "rule_violations_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
alter table public."rule_violations" add constraint "rule_violations_rule_id_fkey" FOREIGN KEY (rule_id) REFERENCES rules(id) ON DELETE SET NULL;
alter table public."rule_violations" add constraint "rule_violations_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id);
alter table public."rule_violations" add constraint "rule_violations_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL;
alter table public."rules" add constraint "rules_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
alter table public."rules" add constraint "rules_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id);
alter table public."rules" add constraint "rules_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL;
alter table public."trading_decisions" add constraint "trading_decisions_ladder_campaign_id_fkey" FOREIGN KEY (ladder_campaign_id) REFERENCES trading_ladder_campaigns(id) ON DELETE SET NULL;
alter table public."trading_decisions" add constraint "trading_decisions_strategy_version_id_fkey" FOREIGN KEY (strategy_version_id) REFERENCES trading_strategy_versions(id) ON DELETE SET NULL;
alter table public."trading_decisions" add constraint "trading_decisions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."trading_entries" add constraint "trading_entries_decision_id_fkey" FOREIGN KEY (decision_id) REFERENCES trading_decisions(id) ON DELETE SET NULL;
alter table public."trading_entries" add constraint "trading_entries_import_batch_id_fkey" FOREIGN KEY (import_batch_id) REFERENCES trading_import_batches(id) ON DELETE SET NULL;
alter table public."trading_entries" add constraint "trading_entries_ladder_campaign_id_fkey" FOREIGN KEY (ladder_campaign_id) REFERENCES trading_ladder_campaigns(id) ON DELETE SET NULL;
alter table public."trading_entries" add constraint "trading_entries_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."trading_strategies" add constraint "trading_strategies_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."trading_strategy_versions" add constraint "trading_strategy_versions_strategy_id_fkey" FOREIGN KEY (strategy_id) REFERENCES trading_strategies(id) ON DELETE CASCADE;
alter table public."trading_strategy_versions" add constraint "trading_strategy_versions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."ai_memory_items" enable row level security;
alter table public."behavior_logs" enable row level security;
alter table public."decision_lessons" enable row level security;
alter table public."decisions" enable row level security;
alter table public."rule_violations" enable row level security;
alter table public."rules" enable row level security;
alter table public."trading_decisions" enable row level security;
alter table public."trading_entries" enable row level security;
alter table public."trading_strategies" enable row level security;
alter table public."trading_strategy_versions" enable row level security;
create policy "Users can manage own ai memory items" on public."ai_memory_items" as PERMISSIVE for ALL to "public" using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
create policy "behavior_logs_owner" on public."behavior_logs" as PERMISSIVE for ALL to "public" using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
create policy "bl_owner" on public."behavior_logs" as PERMISSIVE for ALL to "public" using ((user_id = auth.uid()));
create policy "Users manage own lessons" on public."decision_lessons" as PERMISSIVE for ALL to "public" using ((auth.uid() = user_id));
create policy "dl_owner" on public."decision_lessons" as PERMISSIVE for ALL to "public" using ((user_id = auth.uid()));
create policy "dec_owner" on public."decisions" as PERMISSIVE for ALL to "public" using ((user_id = auth.uid()));
create policy "decisions_owner" on public."decisions" as PERMISSIVE for ALL to "public" using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
create policy "rule_violations_owner" on public."rule_violations" as PERMISSIVE for ALL to "public" using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
create policy "rv_owner" on public."rule_violations" as PERMISSIVE for ALL to "public" using ((user_id = auth.uid()));
create policy "rules_owner" on public."rules" as PERMISSIVE for ALL to "public" using ((user_id = auth.uid()));
create policy "trading_decisions_delete_own" on public."trading_decisions" as PERMISSIVE for DELETE to "authenticated" using ((( SELECT auth.uid() AS uid) = user_id));
create policy "trading_decisions_insert_own" on public."trading_decisions" as PERMISSIVE for INSERT to "authenticated" with check ((( SELECT auth.uid() AS uid) = user_id));
create policy "trading_decisions_select_own" on public."trading_decisions" as PERMISSIVE for SELECT to "authenticated" using ((( SELECT auth.uid() AS uid) = user_id));
create policy "trading_decisions_update_own" on public."trading_decisions" as PERMISSIVE for UPDATE to "authenticated" using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));
create policy "entries_owner" on public."trading_entries" as PERMISSIVE for ALL to "public" using ((user_id = auth.uid()));
create policy "user owns trading_entries" on public."trading_entries" as PERMISSIVE for ALL to "public" using ((user_id = auth.uid()));
create policy "trading_strategies_delete_own" on public."trading_strategies" as PERMISSIVE for DELETE to "authenticated" using ((( SELECT auth.uid() AS uid) = user_id));
create policy "trading_strategies_insert_own" on public."trading_strategies" as PERMISSIVE for INSERT to "authenticated" with check ((( SELECT auth.uid() AS uid) = user_id));
create policy "trading_strategies_select_own" on public."trading_strategies" as PERMISSIVE for SELECT to "authenticated" using ((( SELECT auth.uid() AS uid) = user_id));
create policy "trading_strategies_update_own" on public."trading_strategies" as PERMISSIVE for UPDATE to "authenticated" using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));
create policy "trading_strategy_versions_delete_own" on public."trading_strategy_versions" as PERMISSIVE for DELETE to "authenticated" using ((( SELECT auth.uid() AS uid) = user_id));
create policy "trading_strategy_versions_insert_own" on public."trading_strategy_versions" as PERMISSIVE for INSERT to "authenticated" with check ((( SELECT auth.uid() AS uid) = user_id));
create policy "trading_strategy_versions_select_own" on public."trading_strategy_versions" as PERMISSIVE for SELECT to "authenticated" using ((( SELECT auth.uid() AS uid) = user_id));
create policy "trading_strategy_versions_update_own" on public."trading_strategy_versions" as PERMISSIVE for UPDATE to "authenticated" using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));
grant INSERT on public."behavior_logs" to "authenticated";
grant SELECT on public."behavior_logs" to "authenticated";
grant UPDATE on public."behavior_logs" to "authenticated";
grant DELETE on public."behavior_logs" to "authenticated";
grant TRUNCATE on public."behavior_logs" to "authenticated";
grant REFERENCES on public."behavior_logs" to "authenticated";
grant TRIGGER on public."behavior_logs" to "authenticated";
grant INSERT on public."rules" to "authenticated";
grant SELECT on public."rules" to "authenticated";
grant UPDATE on public."rules" to "authenticated";
grant DELETE on public."rules" to "authenticated";
grant TRUNCATE on public."rules" to "authenticated";
grant REFERENCES on public."rules" to "authenticated";
grant TRIGGER on public."rules" to "authenticated";
grant INSERT on public."decisions" to "authenticated";
grant SELECT on public."decisions" to "authenticated";
grant UPDATE on public."decisions" to "authenticated";
grant DELETE on public."decisions" to "authenticated";
grant TRUNCATE on public."decisions" to "authenticated";
grant REFERENCES on public."decisions" to "authenticated";
grant TRIGGER on public."decisions" to "authenticated";
grant INSERT on public."decision_lessons" to "authenticated";
grant SELECT on public."decision_lessons" to "authenticated";
grant UPDATE on public."decision_lessons" to "authenticated";
grant DELETE on public."decision_lessons" to "authenticated";
grant TRUNCATE on public."decision_lessons" to "authenticated";
grant REFERENCES on public."decision_lessons" to "authenticated";
grant TRIGGER on public."decision_lessons" to "authenticated";
grant INSERT on public."rule_violations" to "authenticated";
grant SELECT on public."rule_violations" to "authenticated";
grant UPDATE on public."rule_violations" to "authenticated";
grant DELETE on public."rule_violations" to "authenticated";
grant TRUNCATE on public."rule_violations" to "authenticated";
grant REFERENCES on public."rule_violations" to "authenticated";
grant TRIGGER on public."rule_violations" to "authenticated";
grant INSERT on public."ai_memory_items" to "authenticated";
grant SELECT on public."ai_memory_items" to "authenticated";
grant UPDATE on public."ai_memory_items" to "authenticated";
grant DELETE on public."ai_memory_items" to "authenticated";
grant TRUNCATE on public."ai_memory_items" to "authenticated";
grant REFERENCES on public."ai_memory_items" to "authenticated";
grant TRIGGER on public."ai_memory_items" to "authenticated";
grant INSERT on public."trading_entries" to "authenticated";
grant SELECT on public."trading_entries" to "authenticated";
grant UPDATE on public."trading_entries" to "authenticated";
grant DELETE on public."trading_entries" to "authenticated";
grant TRUNCATE on public."trading_entries" to "authenticated";
grant REFERENCES on public."trading_entries" to "authenticated";
grant TRIGGER on public."trading_entries" to "authenticated";
grant INSERT on public."trading_decisions" to "authenticated";
grant SELECT on public."trading_decisions" to "authenticated";
grant UPDATE on public."trading_decisions" to "authenticated";
grant DELETE on public."trading_decisions" to "authenticated";
grant TRUNCATE on public."trading_decisions" to "authenticated";
grant REFERENCES on public."trading_decisions" to "authenticated";
grant TRIGGER on public."trading_decisions" to "authenticated";
grant INSERT on public."trading_strategies" to "authenticated";
grant SELECT on public."trading_strategies" to "authenticated";
grant UPDATE on public."trading_strategies" to "authenticated";
grant DELETE on public."trading_strategies" to "authenticated";
grant TRUNCATE on public."trading_strategies" to "authenticated";
grant REFERENCES on public."trading_strategies" to "authenticated";
grant TRIGGER on public."trading_strategies" to "authenticated";
grant INSERT on public."trading_strategy_versions" to "authenticated";
grant SELECT on public."trading_strategy_versions" to "authenticated";
grant UPDATE on public."trading_strategy_versions" to "authenticated";
grant DELETE on public."trading_strategy_versions" to "authenticated";
grant TRUNCATE on public."trading_strategy_versions" to "authenticated";
grant REFERENCES on public."trading_strategy_versions" to "authenticated";
grant TRIGGER on public."trading_strategy_versions" to "authenticated";
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $function$;

CREATE TRIGGER trading_entries_updated_at BEFORE UPDATE ON public.trading_entries FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $function$;

CREATE TRIGGER trading_strategies_updated_at BEFORE UPDATE ON public.trading_strategies FOR EACH ROW EXECUTE FUNCTION set_updated_at();
