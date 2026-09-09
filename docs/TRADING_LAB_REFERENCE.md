# Buddies OS — Trading Lab working reference

Version 1.2 · 9 September 2026 · Owner: Soban

## Purpose and architectural boundary

Buddies OS is the central intelligence and operating system for trading, Anka Sphere, Anka Diversify, future projects, research, experiments, organizational knowledge and personal decisions. Current development is limited to Trading Lab. Shared infrastructure changes are allowed only where Trading Lab needs them.

The operating loop is Context → Research → Decision → Execution → Outcome → Learning → Memory → Better Decision. The first milestone is one defined strategy, a controlled sample of manually executed trades, and an evidence-based review of strategy quality, execution quality and behavioral interference.

Do not rebuild Buddies. Reuse shared decisions, projects, research, rules, violations, behavior, lessons, AI, ingestion and memory. Trading-specific records extend those capabilities. Preserve existing records and IDs; never invent historical predictions. Broker execution remains external. Candidate experiments and revisions require Soban's approval.

## Verified starting point

Source audit: `main` at `87632e8dba6f3ee352dfcf1a60e3ddda4f26605b`, 28 August 2026. Existing Trading Lab has charts, market-analysis pillars, strategy chat, saved strategy versions, backtest calculations, ladder simulation and manual/CSV journaling. Generic Buddies learning components exist but are not fully connected to Lab.

Soban identified the existing Supabase project as `sobanahmad001-hash's Project`, AWS `ap-southeast-2`, reference `vzjpaptthqrohqnbhfvn`. It is healthy and contains the existing Buddies and Lab infrastructure. The live catalog confirms shared outcome/lesson fields missing from old repository baselines and imposes additional verdict, account-type and precision constraints. These are now reconciled in the proposed implementation. See `TRADING_LAB_DEPLOYMENT.md` for exact scope and evidence. Production environment configuration and authenticated browser acceptance remain unverified.

## Reuse decisions

| Requirement | Approach |
|---|---|
| Authentication, navigation, ownership, project context | REUSE existing Buddies infrastructure |
| Decisions and outcomes | EXTEND generic `decisions`; link `trading_decisions` as domain detail |
| Strategies | EXTEND existing strategy/version records |
| Experiment protocol and sample membership | NEW minimal experiment record tied to an exact version |
| Pre-trade plan/evidence | EXTEND existing Lab decisions; immutable snapshot and server receipt |
| Execution/close journal | EXTEND `trading_entries`; add structured fills/change events as needed |
| Behavior, rules, violations and lessons | EXTEND existing generic infrastructure with trade/decision references |
| AI, research, sessions, ingestion, memory and search | REUSE and connect existing services |
| Experiment analytics | EXTEND deterministic calculations and shared snapshot storage |
| Counterfactual outcomes | NEW reproducible comparison capability with explicit uncertainty |
| Discovery and automation | DEFER beyond the first manual sample |

## Record contracts

### Strategy and experiment

A strategy version defines hypothesis, instrument, session/timezone, context/setup/trigger timeframes, setup and confirmation conditions, entry/SL/TP rules, position/risk limits and invalidation. An experiment fixes the exact version, target sample, eligibility and exclusion rules, observation coverage, stop conditions, score definitions, primary metrics and review criteria. Example: 20 trades is a first review checkpoint, not automatic proof of an edge.

Changes create a new version and new sample. Keep missed qualifying setups and off-strategy trades visible; do not filter records after seeing P&L. Safety stopping conditions can end a sample early and must be reported.

### Pre-trade decision

Capture instrument/direction, planned entry/SL/TP, quantity and its unit, risk amount/currency, session, evidence time and validity window, context and rule assessments. Resolve the exact saved version on the server. Record pass/fail/unknown and evidence for each condition; preserve nested ALL/ANY semantics. Unsupported automated checks remain manual/unknown.

Save a generic Buddies decision and its trading extension atomically. A successful database receipt—not a generated explanation—establishes a locked record. Store the strategy definition, plan, assessments, prediction target/horizon and provenance together. Use server time for capture; keep market observation time separate. No rewriting the original after outcome. Revisions/amendments preserve history.

Strategy match, data quality, heuristic confidence and predicted probability are distinct. Optional early probability estimates are human/AI estimates labelled uncalibrated; unknown is valid. Define the predicted event precisely, such as TP before SL before expiry under the frozen plan.

### Execution, outcome and learning

Record actual fills, SL/TP changes, partial/final exits, timestamps, fees, financing and reasons. Link them to the same pre-trade decision. Keep actual initial risk separate from planned risk. Later reconciliation determines whether the locked decision truly preceded execution; an unchecked assertion is not sufficient evidence.

Review strategy reference outcome, frozen-plan outcome and actual outcome separately. A correctly executed loss can have good execution/behavior quality. A profitable violation remains a violation. Normal strategy loss, unknown and insufficient evidence are valid classifications.

Lessons reference exact decisions, strategy versions and supporting data, and flow through shared Buddies memory. AI proposes explanations; deterministic code calculates metrics. Saving evidence must succeed even when AI is unavailable; learning retries must not duplicate records.

## Measurement rules

- Use fixed original planned monetary risk for paired R comparisons; record actual initial risk independently.
- Calculate net P&L consistently; do not deduct costs twice from broker net figures.
- Report wins, losses and breakevens, average win/loss, realized payoff ratio, mean net R expectancy, profit factor and chronological drawdown.
- Distinguish closed-trade drawdown from intratrade equity drawdown.
- Setup frequency requires observed sessions/time coverage, including zero-setup sessions.
- Fix execution-score definitions before the sample; behavior costs require observable events and defensible attribution.
- A reference-versus-actual gap is not automatically proven behavioral cost. Unknown counterfactuals stay unknown; do not allocate the full loss to each of several violations.
- Report probability calibration only against the same event/horizon, with resolved outcomes and sample counts. Do not substitute 50% for missing predictions.
- Review actions: KEEP / MODIFY / RETEST / KILL. Evidence status is separate: insufficient / provisional / supported. No action automatically enables trading automation.
- Discovery proposes hypotheses from data; condition removal requires a new experiment/replay, not deleting losing rows. Preserve variant history and evaluate fresh evidence.
- Keep ladder/risk progression separate from setup-edge evaluation.

## Delivery sequence and acceptance

| Slice | Deliverable | Exit criterion |
|---|---|---|
| 1 — Pre-trade foundation | Exact version selection; manual condition assessments; plan validation; atomic shared-decision link; protected snapshots; reloadable history | Correct ownership, logical checks and price/risk validation; retry-safe capture; original record protected; storage failures visible |
| 2 — One complete manual trade | Plan-to-execution link, fills/changes, close/reconcile, shared lessons and violations | One real lifecycle survives reload and compares plan/execution/outcome accurately |
| 3 — Controlled experiment | Hypothesis/protocol, fixed sample membership, version freeze, progress and review | One approved strategy can run its sample without silent version changes |
| 4 — Evidence review | Metrics, separate quality dimensions, uncertainty and next-version action | Every result traces to declared records; unsupported claims remain unavailable |
| 5 — Supporting simulation repairs | Chronological accounting, timeframe semantics, complete bars, supported exits/risk/costs, saved runs/datasets | Relevant replay/backtest results are reproducible and tested before use as validation evidence |

Simulation repairs may run earlier when a manual-sample feature depends on them, but are not a reason to delay reliable manual capture. Keep existing research/chart tools useful while distinguishing them from the strategy assessment.

## First-slice implementation scope

Manual assessment is intentional: the initial form collects the user's evidence against the actual stored condition tree and safety definitions. It does not automatically infer Wyckoff phases, inspect screenshots, check live news, monitor the broker or assert that a setup will win. Numerical price geometry and required assessments are checked by code. Optional probability describes TP-before-SL by the stated expiry and is explicitly uncalibrated.

The existing market-analysis route remains separate. New capture records use existing `trading_decisions` linked to `decisions`; no parallel decision engine or memory store is introduced. Historical Lab rows remain historical. Schema changes have been tested against a copy of the live structure; production application is held for explicit approval after automatic review rejected the migration.

## Deferred stages

Stage 1: manual Trading Lab. Stage 2: real-time Trading Copilot. Stage 3: paper automation and human/system comparison. Stage 4: controlled live automation for sufficiently evidenced strategies. No broker execution, autonomous activation, other-domain expansion or broad Buddies redesign belongs to this release.

## Work tracking

Update this section with each delivery; distinguish implemented, tested and deployed.

- Audit: complete against the source commit above; the restart brief governs scope.
- Review branch: `codex/trading-lab-reference-and-pretrade`, draft PR #17.
- Manual milestone implementation: strategy version creation/revisions; approved experiments; pre-trade capture; manual execution and partial/final exits; post-trade review; shared lessons/behavior/rules/memory; sample metrics and human review action.
- Main navigation now starts with Experiments and Execution. Existing research, builder chat, simulation and historical journal remain available.
- Exact version saves are atomic and retry-safe. Approving an experiment freezes its version and protocol before collecting evidence. No experiment or strategy is automatically approved by AI.
- Event history is append-only and protected at the database boundary. Execution updates use an expected revision; stale edits and duplicate request identities are handled explicitly. Legacy quick-entry routes cannot bypass a locked plan's lifecycle.
- Reviews write the journal, shared decision, lesson, behavior observations, linked rule violations and searchable `ai_memory_items` in one transaction. A failure rolls back the review; retrying does not duplicate learning. Review amendments preserve earlier events and supersede their retrieval memory.
- Closed samples have immutable protocols, trade reviews, observation coverage and shared review decisions. New learning continues in another approved experiment.
- Metrics: wins/losses/breakevens, average win/loss R, realized payoff, mean net R expectancy, profit factor, chronological closed-trade drawdown, observation frequency, manual rule compliance, execution scores, behavioral associations and event-specific probability calibration. Reference outcomes are separately evidenced manual reconstructions; paired comparisons use the same trades and fixed original risk.
- Database mapping and live schema audit are complete for Soban's identified project. No project was created or restored by this work. The separate `anka-os` project was not changed.
- Canonical proposed SQL, in order: `docs/sql/trading_lab_pretrade.sql`, then `docs/sql/trading_lab_manual_workflow.sql`. They are not applied migrations. The proposed `trading_lab_controlled_manual_samples` production migration was blocked by automatic approval review because explicit authorization was required for its shared-table and database-protection changes. Migration history confirms it was not applied. `docs/TRADING_LAB_DEPLOYMENT.md` records the reviewable scope and remaining gates.
- Verification: 74 unit/API tests; TypeScript; optimized Next.js build using placeholder local Supabase configuration; isolated PGlite 0.5.8 tests using existing migration table definitions and owner policies. Database checks include version freeze/revisions, atomic lifecycle and learning, sample admission/overflow, partial fills, gross/net accounting, probability horizon, coverage overlap, retries, optimistic concurrency, rollback and cross-owner rejection.
- SQL scripts: `scripts/test-trading-plan-db.mjs` and `scripts/test-trading-manual-db.mjs`. Supply externally installed `@electric-sql/pglite@0.5.8` through `BUDDIES_PGLITE_MODULE`. Tests now default to the captured live catalog fixture; `BUDDIES_TEST_SCHEMA=repository` uses the older repository definitions. Both baselines passed. No production dependencies or lockfile changes.
- Compatibility fixes preserve generic verdicts and exact Lab actions, shared predicted probability, unknown outcome ratings, real behavior trigger fields, existing violation notes, valid live/demo account types and precise fill averages. A declared live sample cannot count demo executions. Test data exists only in isolated databases.
- UI fixture harness: `scripts/preview-trading-manual.mjs`, using optional `esbuild@0.25.10` through `BUDDIES_ESBUILD_MODULE`. It renders actual components with synthetic, schema-validated mock responses and has no account credentials. It compiled and served, but the cloud browser rejected the localhost connection. Desktop/mobile visual and authenticated browser acceptance remain pending.
- Deployed status: production database/app unchanged. Vercel reported the preceding PR commit successfully built a branch preview, but the preview redirects to Vercel login. Updated code remains in the existing review branch. Production migration, authenticated desktop/mobile acceptance and app release remain pending.
- First strategy/protocol: Soban must define and approve it before starting the sample. Older preferences are not silently adopted as current trading rules.

## Manual release boundaries

- Pre-trade market/strategy assessments are manual evidence checks. Automatic chart/screenshot interpretation, a calibrated AI win probability, real-time setup detection and broker execution are not implemented in this milestone.
- Optional structured context captures higher-timeframe context, structure, Wyckoff/VSA, volume, liquidity, regime and news. Screenshot/evidence URLs are references; this release does not archive external content or extend the existing upload service. Preserve original files separately because links can change or expire.
- One locked plan links to one manual trade with the planned instrument/direction and quantity unit. Additional entry fills are supported before the first exit; re-entry after an exit requires a separate plan. Historical/unplanned trades remain in the existing journal and do not acquire invented pre-trade predictions.
- The first target number of recorded executions in the protocol's declared live/demo account type is the fixed sample, including execution/rule violations. Overflow and executions from another account type remain visible outside the sample. Account type is chosen before the sample and cannot be changed after seeing results. Opening and closing times are manually reported, not broker-verified. Timestamp reconciliation flags execution before capture or after expiry; clean event calibration excludes those trades. Recording evidence cannot prove that an unreported losing trade did not exist.
- Initial entry, initial SL, initial TP, initial quantity, timing, and reviewed management compliance receive equal execution-score weights. Price/quantity tolerances are fixed in the protocol. A missing management assessment leaves the overall trade score unknown. Actual initial risk is recorded separately; paired R comparisons always retain planned risk.
- Broker-net P&L includes all partial/final exits and already includes costs. Gross P&L subtracts fees and adds signed financing (negative charge, positive credit). The user supplies the complete reconciliation and evidence. Realized trade drawdown is not intratrade account equity drawdown.
- Session observations include zero-setup periods, manually counted qualifying/taken opportunities and missed-setup reasons. Overlapping coverage is rejected. These counts are explicitly manual and are not automatically reconciled with an external market feed.
- A reference gap or a behavioral group's associated P&L is not an attributable financial cost. Groups may overlap. Counterfactual simulation, automatic condition ablation and causal attribution remain future work.
- A sample checkpoint and KEEP/MODIFY/RETEST/KILL action do not establish an edge. This release reports descriptive evidence as insufficient for a conclusive edge claim; a further statistical validation protocol remains necessary.
- Existing Strategy Builder chat persistence, automated AI post-trade explanations and simulator repairs remain follow-up work. The simulator has an explicit limitations notice and is excluded from manual-sample validation.

## Live acceptance sequence

1. Project and live-schema verification are complete. Confirm the Vercel environment settings point to the identified project.
2. Obtain explicit approval for the production schema change described in `TRADING_LAB_DEPLOYMENT.md`; automatic review blocked its application. After approval, apply the verified SQL, record/reconcile migration history and run live permission/schema checks and advisors. Isolated tests already pass against the captured live schema.
3. Exercise the authenticated workflow: save/revise strategy → approve sample → lock plan → record entry → record protection/fills/exits → reconcile P&L → review → verify shared learning → finalize sample.
4. Check reload, mobile layout, stale requests, unavailable storage and a second test user's isolation. Confirm real uploads/links and broker unit/cost conventions before recording the first actual sample.
5. Release through the existing Buddies deployment after acceptance. No new Buddies app, repository or domain-specific memory engine is required.

## Release checks

Verify unauthenticated/cross-owner requests, malformed plans, long/short price ordering, nested conditions, unknown evidence, probability zero/unknown, expired evidence, duplicate retries and save failures. Test database linkage/immutability under authenticated ownership rules. Run focused tests and typecheck; production acceptance additionally requires a migrated staging/production environment and an authenticated lifecycle check. Keep each slice reviewable in Git and update this reference with its actual status.
