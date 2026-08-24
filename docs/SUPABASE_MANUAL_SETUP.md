# Manual Supabase setup

## Apply the pending migrations

1. Sign in at `https://supabase.com/dashboard` and open the Buddies OS project.
2. Open **SQL Editor** and select **New query**.
3. Open `supabase/migrations/20260824_project_operating_model.sql` from this repository, copy the entire file into the query, and choose **Run**.
4. Create another new query.
5. Open `supabase/migrations/20260824_coding_agent_runtime.sql`, copy the entire file, and choose **Run**.
6. In **Table Editor**, confirm these tables exist:
   - `project_workstreams`
   - `project_deliverables`
   - `coding_agent_executions`
7. Open the `projects` table and confirm these columns exist:
   - `owner_name`
   - `target_date`
   - `health`
8. In **Authentication → Policies**, confirm row-level security is enabled for all three new tables.

Both SQL files are idempotent: running them again is designed to be safe.

## Application values

From **Project Settings → API**, copy the project URL and anonymous/public key into the deployment environment as:

```text
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Do not put the service-role key in any variable beginning with `NEXT_PUBLIC_`.
