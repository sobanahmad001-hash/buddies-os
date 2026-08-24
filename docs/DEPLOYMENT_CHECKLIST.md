# Buddies OS v2 deployment checklist

Do not deploy the redesign branch to production until every required item is checked.

Trading policy: paper trading only. Broker authentication and live order execution are intentionally disabled.

## Required

- [x] Apply `supabase/migrations/20260824_project_operating_model.sql` to production Supabase.
- [x] Apply `supabase/migrations/20260824_coding_agent_runtime.sql` to production Supabase.
- [ ] Confirm all repository migrations are applied in timestamp order.
- [ ] Configure production Supabase URL and anonymous key.
- [ ] Configure server-only AI provider keys used by enabled features.
- [x] Move Coding Agent repository access and GitHub credentials server-side.
- [ ] Rotate any GitHub token that the earlier browser-based implementation accessed.
- [ ] Provision an isolated Coding Agent workspace, set `CODING_AGENT_WORKSPACE_ROOT`, and explicitly set `CODING_AGENT_EXECUTION_ENABLED=true` only after review.
- [ ] Verify authentication and row-level security using a non-admin test account.
- [x] Run tests and a production build against the deployment environment.
- [x] Smoke-test Today, Projects, Coding Agent, Trading Engine, Knowledge, Agents, and Settings.
- [ ] Create a database backup and document rollback steps.

## Release

- [ ] Merge `redesign/buddies-os-v2` only after staging acceptance.
- [x] Deploy to staging first.
- [ ] Verify logs and error monitoring.
- [ ] Promote to production using a controlled rollout.
