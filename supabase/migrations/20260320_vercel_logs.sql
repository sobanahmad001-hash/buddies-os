-- Create vercel_logs table for caching Vercel function error logs
create table if not exists vercel_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  deployment_id text,
  function_path text,
  level text not null default 'error',
  message text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Index for fast per-user queries ordered by time
create index if not exists vercel_logs_user_occurred on vercel_logs(user_id, occurred_at desc);

-- RLS
alter table vercel_logs enable row level security;

create policy "Users can manage their own vercel logs"
  on vercel_logs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
