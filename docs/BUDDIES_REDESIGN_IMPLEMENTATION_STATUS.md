# Buddies redesign implementation status

## Implemented locally

- Semantic light, dark, and system themes with saved preference.
- Shared theme tokens and responsive desktop/mobile navigation.
- Personal Inbox with capture, approvals, reject, complete, snooze, and archive actions.
- Goals with target dates and explicit completion criteria.
- Universal semantic search from every workspace using `Ctrl/Cmd+K`.
- Daily/weekly Reviews with completion, overdue, approval, project, and Coding Agent activity metrics.
- Personal automation templates with automatic, suggestion, and approval-required modes.
- Coding Agent file-review acknowledgement before creating a review PR.
- Schema support for milestones, task dependencies, automation runs, memory feedback, reviews, and Coding Agent verification evidence.
- Full dual-theme redesign of Today, Projects, project overview, Coding Agent, Paper Trading, Knowledge, Research, Search, Documents, Inbox, Goals, Reviews, Automations, Memory, and Settings.
- Responsive expert workspaces: agent-first Coding view on small screens and separate Ladder, Chart, and Analysis modes for mobile Trading.
- Project task dependency editing, milestone visibility, and completion criteria.
- Compatibility styling for remaining legacy secondary screens and dialogs in both themes.

## Existing capabilities retained

- Today attention view and AI weekly digest.
- Project workspaces, workstreams, deliverables, tasks, decisions, research, documents, rules, and assistant context.
- Layered AI memory, proactive signals, activity patterns, and behavioral inference.
- One Coding Agent with repository explorer, chat, proposed file changes, and GitHub PR creation.
- Paper-only Trading Engine with Wyckoff analysis, numeric volume evidence, journal, watchlist, and review workflows.

## Release verification

1. ✅ Applied `supabase/migrations/20260825_personal_management_system.sql` in Supabase (confirmed by user).
2. ✅ Existing redesign deployment confirmed working by user.
3. Confirm Vercel retains `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, AI provider keys, and GitHub integration variables when promoting to `main`.
4. Smoke-test `/app/inbox`, `/app/goals`, `/app/reviews`, `/app/automations`, `/app/memory`, project milestones, theme switching, and `Ctrl/Cmd+K` search after the final deployment.
5. Keep broker authentication and live trading disabled; Trading remains paper-only.

## Deliberately deferred runtime enhancements

- Background scheduling/execution for personal automation rules. The rules, modes, and run-history data model are ready; autonomous execution should only be enabled after each rule is reviewed.
- Cross-browser and deployed-route smoke testing of the final commit after it is pushed.

## Coding Agent execution upgrade (next release)

- Personal Windows runner with authenticated job polling.
- Isolated Git worktree and branch for every coding request.
- Local Codex execution with workspace-write boundaries.
- Automatic changed-file, diff, terminal-log, and verification capture.
- Buddies UI status, verification badges, and review-before-PR handoff.
- Setup is documented in `docs/CODING_AGENT_RUNNER_SETUP.md`; the new Supabase migration and Vercel runner token are required before this capability is enabled.

## Final redesign scope

The agreed personal-OS redesign is complete: unified Inbox and approvals; goals, milestones, dependencies, and completion criteria; daily and weekly planning/reviews; universal knowledge search; memory and commitment workflows; Coding Agent review controls; personal automation management; analytics; a cohesive visual refresh; dual light/dark themes; and responsive mobile layouts.
