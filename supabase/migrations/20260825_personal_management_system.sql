-- Buddies personal management system: direction, inbox, routines, reviews, and execution evidence.

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  title text not null, description text, status text not null default 'active' check (status in ('active','paused','completed','archived')),
  target_date date, success_criteria text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.goal_project_links (
  goal_id uuid not null references public.goals(id) on delete cascade, project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, created_at timestamptz not null default now(), primary key(goal_id, project_id)
);
create table if not exists public.project_milestones (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade, title text not null, description text,
  status text not null default 'pending' check (status in ('pending','in_progress','completed','blocked')),
  target_date date, completion_criteria text, position integer not null default 0, completed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.task_dependencies (
  task_id uuid not null references public.project_tasks(id) on delete cascade, depends_on_task_id uuid not null references public.project_tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, created_at timestamptz not null default now(),
  primary key(task_id, depends_on_task_id), check(task_id <> depends_on_task_id)
);
create table if not exists public.inbox_items (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  item_type text not null default 'capture' check (item_type in ('capture','task','commitment','approval','waiting_for','agent_result','decision')),
  title text not null, body text, source text not null default 'manual', status text not null default 'open' check (status in ('open','snoozed','approved','rejected','done','archived')),
  urgency integer not null default 2 check (urgency between 1 and 4), project_id uuid references public.projects(id) on delete set null,
  due_at timestamptz, snoozed_until timestamptz, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), resolved_at timestamptz
);
create table if not exists public.automation_rules (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  name text not null, trigger_type text not null, conditions jsonb not null default '{}'::jsonb, action_type text not null,
  action_config jsonb not null default '{}'::jsonb, mode text not null default 'suggest' check (mode in ('automatic','suggest','approval_required')),
  enabled boolean not null default true, last_run_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  rule_id uuid references public.automation_rules(id) on delete set null, status text not null, evidence jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), completed_at timestamptz
);
create table if not exists public.personal_reviews (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  review_type text not null check (review_type in ('daily','weekly','monthly')), period_start date not null, period_end date not null,
  status text not null default 'draft' check (status in ('draft','confirmed')),
  wins jsonb not null default '[]'::jsonb, carried_forward jsonb not null default '[]'::jsonb, dropped jsonb not null default '[]'::jsonb,
  lessons jsonb not null default '[]'::jsonb, metrics jsonb not null default '{}'::jsonb, narrative text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), confirmed_at timestamptz,
  unique(user_id, review_type, period_start)
);
create table if not exists public.memory_feedback (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  memory_id uuid, feedback_type text not null check (feedback_type in ('confirm','correct','forget','expire')),
  correction text, created_at timestamptz not null default now()
);
create table if not exists public.coding_agent_verifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  execution_id uuid references public.coding_agent_executions(id) on delete cascade, project_id uuid references public.projects(id) on delete set null,
  check_type text not null check (check_type in ('typecheck','test','lint','build','manual_review')),
  status text not null check (status in ('queued','running','passed','failed','skipped')), command text, summary text, output text,
  started_at timestamptz, completed_at timestamptz, created_at timestamptz not null default now()
);

create index if not exists inbox_items_user_status_idx on public.inbox_items(user_id, status, created_at desc);
create index if not exists milestones_project_idx on public.project_milestones(project_id, position);
create index if not exists reviews_user_period_idx on public.personal_reviews(user_id, period_start desc);

alter table public.goals enable row level security;
alter table public.goal_project_links enable row level security;
alter table public.project_milestones enable row level security;
alter table public.task_dependencies enable row level security;
alter table public.inbox_items enable row level security;
alter table public.automation_rules enable row level security;
alter table public.automation_runs enable row level security;
alter table public.personal_reviews enable row level security;
alter table public.memory_feedback enable row level security;
alter table public.coding_agent_verifications enable row level security;

do $$ declare t text; begin
  foreach t in array array['goals','goal_project_links','project_milestones','task_dependencies','inbox_items','automation_rules','automation_runs','personal_reviews','memory_feedback','coding_agent_verifications']
  loop
    execute format('drop policy if exists "Users manage own rows" on public.%I', t);
    execute format('create policy "Users manage own rows" on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
  end loop;
end $$;
