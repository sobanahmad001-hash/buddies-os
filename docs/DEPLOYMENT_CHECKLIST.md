# Buddies OS v2 deployment checklist

Do not deploy the redesign branch to production until every required item is checked.

Trading policy: paper trading only. Broker authentication and live order execution are intentionally disabled.

## Required

- [x] Apply `supabase/migrations/20260824_project_operating_model.sql` to production Supabase.
- [x] Apply `supabase/migrations/20260824_coding_agent_runtime.sql` to production Supabase.
- [x] Reconcile production schema and establish a tracked forward migration baseline (`20260825141116`).
- [x] Apply production security hardening migration (`20260825143356`).
- [ ] Configure production Supabase URL and anonymous key.
- [ ] Configure server-only AI provider keys used by enabled features.
- [x] Move Coding Agent repository access and GitHub credentials server-side.
- [ ] Rotate any GitHub token that the earlier browser-based implementation accessed.
- [ ] Provision an isolated Coding Agent workspace, set `CODING_AGENT_WORKSPACE_ROOT`, and explicitly set `CODING_AGENT_EXECUTION_ENABLED=true` only after review.
- [x] Verify row-level security using both existing non-admin identities; zero cross-user rows were visible.
- [x] Run strict type-checking, all tests, and a production build with deployment-equivalent public variables.
- [ ] Confirm an authenticated login/email callback in staging after this branch deploys.
- [ ] Confirm `/api/ai/health` reports a configured provider in staging, then send a real Coding Agent prompt.
- [x] Smoke-test Today, Projects, Coding Agent, Trading Engine, Knowledge, Agents, and Settings.
- [ ] Create a database backup and document rollback steps.

## Release

- [ ] Merge `redesign/buddies-os-v2` only after staging acceptance.
- [x] Deploy to staging first.
- [ ] Verify logs and error monitoring.
- [ ] Enable Supabase Auth leaked-password protection in the dashboard.
- [ ] Make the CI check required in the repository ruleset/branch protection.
- [ ] Promote to production using a controlled rollout.
