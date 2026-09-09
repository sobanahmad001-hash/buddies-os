# Trading Lab — verified database and deployment review

9 September 2026 · PR #17 · Status: tested implementation; production migration blocked pending explicit approval.

## Confirmed target

- Existing project: **sobanahmad001-hash's Project**, AWS `ap-southeast-2`.
- Supabase reference: `vzjpaptthqrohqnbhfvn`.
- Project URL: `https://vzjpaptthqrohqnbhfvn.supabase.co`.
- Observed state: `ACTIVE_HEALTHY`, Postgres 17.6.1.063.
- Existing production migrations include `trading_lab_mvp` and `tradingview_alert_ingestion` (26 August 2026). No new project or replacement architecture is needed.
- Vercel production environment variables have not been inspected. The project mapping is based on Soban's identification and the matching live Buddies schema.

The read-only audit captured columns with exact precision, constraints, owner policies, grants, indexes and triggers for the ten relevant existing tables. No user records, credentials or trading results were exported. The test fixture is `scripts/fixtures/trading-live-schema.sql`. It substitutes text for two unused embedding columns and stubs external foreign-key targets; it does not validate vector search, authentication delivery or the browser.

## Live compatibility fixes

| Finding | Change |
|---|---|
| Shared verdicts are restricted to `enter`, `wait`, `do_not_enter` | Preserve this vocabulary. Keep exact Lab actions in existing `chosen_option` and immutable Lab snapshots. `REVIEW` and `WAIT` map to `wait`; `NO TRADE` maps to `do_not_enter`. Experiment `KEEP` maps to `enter`, `KILL` to `do_not_enter`, and `MODIFY`/`RETEST` to `wait`; none activates execution. |
| Shared `predicted_probability` already exists | Populate and freeze it alongside `probability`; preserve zero and unknown. |
| Journal requires `ladder_step` | Explicitly use 0 for a manual lifecycle outside ladder progression. |
| Journal account types allow live/demo, not external | Require actual live/demo selection and freeze the sample's account type before collection. Other account types remain visible outside that sample. Legacy imports/quick entries with unknown account type use null. |
| Journal prices and lots had four decimal places | Widen existing numeric columns to preserve precise fill averages and fractional quantities. Historical precision cannot be reconstructed. |
| Shared lesson, behavior and violation fields differ from old repository baselines | Reuse `decision_lessons.decision_id`, behavior `trigger_tag` and violation `notes`. Trading behaviors do not become mood labels. Derive the lesson's domain through its shared decision. |
| Shared outcome ratings exclude `unresolved` | Preserve null for unresolved prediction outcomes; do not record a failure. |

## Exact proposed database change

Migration name: `trading_lab_controlled_manual_samples`.

Canonical SQL, in order:

1. `docs/sql/trading_lab_pretrade.sql`
2. `docs/sql/trading_lab_manual_workflow.sql`

Reviewed source SHA-256 digests:

```text
pretrade: bdecfcd02b8a2dc95bcde51c9978503a2e20892046f8f41a72f1d2355ced3ef2
manual:   eeb9843c35fa0ee3c44fc6a92ab3b5a7ffdfbb2f244eca129620fb7db7c39af4
```

The proposed application combines both bodies in one transaction with a 5-second lock timeout and 90-second statement timeout. Neither script has been applied to production. They remain review SQL rather than CLI-generated migration-history files; a CLI export/history reconciliation remains a release task.

| Area | Scope and effect |
|---|---|
| Three new domain tables | `trading_experiments`, `trading_observation_sessions`, `trading_trade_events`; owned rows, explicit authenticated grants and RLS. No anonymous access. |
| Existing trading records | Extend `trading_decisions`, `trading_entries` and `trading_strategy_versions` for shared-decision links, immutable snapshots, sample membership, precise accounting and retry identity. Add supporting indexes and foreign keys. |
| Shared Buddies records | Add source decision/event links to existing lessons, behavior and violations. Compatibility `ADD COLUMN IF NOT EXISTS` statements preserve shared fields already present. Guard original predictions linked to locked plans and completed experiment review decisions. |
| Shared memory and rules | Grant the operations needed by invoker functions, under existing owner RLS. Reviews write existing shared learning/memory tables atomically. No parallel learning store. |
| Database functions | Capture a plan, save a strategy version, append a trade event, and finalize an experiment review. Functions use invoker privileges; triggers preserve evidence and synchronize shared records. |
| Data preservation | No reset, truncation, deletion, historical prediction backfill, broker execution or automatic strategy approval. Once the feature is used, protected evidence intentionally resists update/delete. |

Shared-table triggers and precision changes can acquire locks and affect writes to linked records. That is the production impact requiring explicit approval. If deployment fails during the transaction it must roll back; do not reset the database. If the app release later has a problem, return to the previous app release and preserve the database evidence rather than deleting new history.

## Verification completed

- 74 unit/API tests, TypeScript checks and optimized Next.js build passed. The local build used placeholder Supabase settings and does not prove production environment configuration.
- Pre-trade and manual lifecycle SQL passed isolated PGlite 0.5.8 tests against both the repository baseline and the captured live structure. The manual workflow was applied twice in each isolated database to check repeatability.
- Tests cover shared verdict mapping, immutable probabilities, version/protocol freeze, account-type separation, precise fills, protection changes, partial/final exits, gross/net costs, fixed-risk R, sample admission/overflow, event horizon, unresolved outcomes, lessons/rules/memory, amended reviews, atomic rollback, retries, stale revisions and cross-owner rejection.
- Live security/performance advisors were read before any migration. Existing notices include redundant owner policies and indexes, unindexed foreign keys, public vector extension, an intentionally RLS-closed table, authenticated GraphQL schema discoverability, existing workspace definer functions, and disabled leaked-password protection. These were not silently changed as part of Trading Lab. Newly proposed tables have owner policies and indexes for their references. Post-migration advisors remain required.

Advisor references: [RLS policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [GraphQL discoverability](https://supabase.com/docs/guides/database/database-linter?lint=0027_pg_graphql_authenticated_table_exposed), [definer functions](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## Blocked action and remaining release gates

The automatic approval reviewer rejected `apply_migration` for this production project because the user had not explicitly authorized this exact shared-table, privilege, trigger, function, index and RLS change. The action was not retried through another path. A subsequent migration-history read confirmed that the proposed migration is absent.

Soban's explicit approval is needed to apply the proposed production database change above. After approval:

1. Apply the reviewed SQL once; capture its migration receipt and reconcile repository migration history.
2. Confirm resulting columns, functions, owner grants, RLS and advisors on the selected project.
3. Confirm the existing Vercel environment points to this project and run an authenticated lifecycle acceptance check, including reload, a second user's isolation and mobile layout.
4. Release PR #17 through the existing deployment after acceptance; the PR remains a draft until those checks pass.
5. Define and approve the first real strategy/protocol before recording its sample.

The branch preview at `https://buddies-os-git-codex-tradin-a28328-sobanahmad001-9513s-projects.vercel.app` is protected by Vercel login. The previous branch commit has a successful Vercel build status, but browser acceptance and the production app release are not complete. Do not disable deployment protection or send passwords/API secrets in chat to perform acceptance.
