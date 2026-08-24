# Buddies OS v2 deployment checklist

Do not deploy the redesign branch to production until every required item is checked.

## Required

- [ ] Apply `supabase/migrations/20260824_project_operating_model.sql` to production Supabase.
- [ ] Apply `supabase/migrations/20260824_coding_agent_runtime.sql` to production Supabase.
- [ ] Confirm all repository migrations are applied in timestamp order.
- [ ] Configure production Supabase URL and anonymous key.
- [ ] Configure server-only AI provider keys used by enabled features.
- [ ] Move GitHub credentials fully server-side and rotate any token previously exposed to a browser.
- [ ] Provision an isolated Coding Agent workspace, set `CODING_AGENT_WORKSPACE_ROOT`, and explicitly set `CODING_AGENT_EXECUTION_ENABLED=true` only after review.
- [ ] Verify authentication and row-level security using a non-admin test account.
- [ ] Run tests and a production build against the deployment environment.
- [ ] Smoke-test Today, Projects, Coding Agent, Trading Engine, Knowledge, Agents, and Settings.
- [ ] Create a database backup and document rollback steps.

## Release

- [ ] Merge `redesign/buddies-os-v2` only after staging acceptance.
- [ ] Deploy to staging first.
- [ ] Verify logs and error monitoring.
- [ ] Promote to production using a controlled rollout.
