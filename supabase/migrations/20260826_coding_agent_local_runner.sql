-- Persistent jobs executed by the personal Buddies Runner on the user's computer.
create table if not exists public.coding_agent_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  task_id uuid references public.project_tasks(id) on delete set null,
  repository text not null,
  base_branch text not null default 'main',
  work_branch text,
  prompt text not null,
  status text not null default 'queued' check (status in (
    'queued','claimed','running','succeeded','failed','cancelled'
  )),
  runner_id text,
  changed_files jsonb not null default '[]'::jsonb,
  verification_commands jsonb not null default '[]'::jsonb,
  verification_results jsonb not null default '[]'::jsonb,
  diff text,
  stdout text,
  stderr text,
  exit_code integer,
  error text,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists coding_agent_jobs_user_created_idx
  on public.coding_agent_jobs(user_id, created_at desc);
create index if not exists coding_agent_jobs_queue_idx
  on public.coding_agent_jobs(status, created_at) where status = 'queued';

alter table public.coding_agent_jobs enable row level security;
drop policy if exists "Users manage own coding jobs" on public.coding_agent_jobs;
create policy "Users manage own coding jobs" on public.coding_agent_jobs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

