# Buddies OS — Trading Lab working reference

Version 1.0 · 9 September 2026 · Owner: Soban

## Purpose and architectural boundary

Buddies OS is the central intelligence and operating system for trading, Anka Sphere, Anka Diversify, future projects, research, experiments, organizational knowledge and personal decisions. Current development is limited to Trading Lab. Shared infrastructure changes are allowed only where Trading Lab needs them.

The operating loop is Context → Research → Decision → Execution → Outcome → Learning → Memory → Better Decision. The first milestone is one defined strategy, a controlled sample of manually executed trades, and an evidence-based review of strategy quality, execution quality and behavioral interference.

Do not rebuild Buddies. Reuse shared decisions, projects, research, rules, violations, behavior, lessons, AI, ingestion and memory. Trading-specific records extend those capabilities. Preserve existing records and IDs; never invent historical predictions. Broker execution remains external. Candidate experiments and revisions require Soban's approval.

## Verified starting point

Source audit: `main` at `87632e8dba6f3ee352dfcf1a60e3ddda4f26605b`, 28 August 2026. Existing Trading Lab has charts, market-analysis pillars, strategy chat, saved strategy versions, backtest calculations, ladder simulation and manual/CSV journaling. Generic Buddies learning components exist but are not fully connected to Lab.

Production deployment/Supabase mapping and live schema must be verified before applying migrations. Application code expects some shared outcome/lesson columns absent from the reviewed migration history. Source presence is not production acceptance.

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

The existing market-analysis route remains separate. New capture records use existing `trading_decisions` linked to `decisions`; no parallel decision engine or memory store is introduced. Historical Lab rows remain historical. Database changes are additive and held for production schema verification.

## Deferred stages

Stage 1: manual Trading Lab. Stage 2: real-time Trading Copilot. Stage 3: paper automation and human/system comparison. Stage 4: controlled live automation for sufficiently evidenced strategies. No broker execution, autonomous activation, other-domain expansion or broad Buddies redesign belongs to this release.

## Work tracking

Update this section with each delivery; distinguish implemented, tested and deployed.

- Audit: complete against the source commit above.
- Reference: established by this document; user's restart brief governs architectural scope.
- Slice 1: implemented locally on `codex/trading-lab-reference-and-pretrade`; pending production schema reconciliation and deployment.
- Implemented: exact-version plan form and history; manual condition/safety assessments; plan validation; retry-safe API; shared-decision linkage and immutable snapshot SQL draft; journal link ownership checks.
- Verification: automated contract/API tests and existing suite; TypeScript; optimized Next.js build with placeholder local Supabase configuration; isolated PGlite 0.5.8 database tests using existing table definitions. No live Supabase acceptance test or authenticated browser test has been completed.
- SQL draft: `docs/sql/trading_lab_pretrade.sql`. The Supabase CLI could not be started in this environment; this has not been represented as an applied or CLI-generated migration. Promote it to a migration only after environment verification.
- Database checks: repeat application, atomic two-record save, forced second-insert rollback, retry identity, cross-owner visibility/link rejection, expiry/geometry checks, immutable plan/version/prediction fields, and allowed generic outcome updates.
- Local SQL verification script: `scripts/test-trading-plan-db.mjs`. It uses an optional externally installed `@electric-sql/pglite@0.5.8` module; pass its absolute `dist/index.js` path in `BUDDIES_PGLITE_MODULE`. Production dependencies were not changed.
- Remaining milestone work: execution changes/closing/reconciliation; shared lessons and violations; durable Strategy Builder chat; controlled experiment records and sample review; simulation repairs where required.
- Production migration/deployment: pending verified environment mapping.
- First strategy/protocol: to be explicitly defined with Soban before starting the sample; older trading preferences are not silently adopted as current rules.

## Release checks

Verify unauthenticated/cross-owner requests, malformed plans, long/short price ordering, nested conditions, unknown evidence, probability zero/unknown, expired evidence, duplicate retries and save failures. Test database linkage/immutability under authenticated ownership rules. Run focused tests and typecheck; production acceptance additionally requires a migrated staging/production environment and an authenticated lifecycle check. Keep each slice reviewable in Git and update this reference with its actual status.
