# Trading Lab — chat workflow and paper trading

10 September 2026 · Implementation plan · Owner: Soban

Status: the requested product direction is recorded here. The chat workflow and internal paper execution described below are planned, not implemented or deployed. This extends [the working reference](TRADING_LAB_REFERENCE.md); it does not replace Buddies or the existing manual trade lifecycle.

## Product decision

Make chat the main way to develop, revise, run and review a strategy. Keep structured tabs beside it so Soban can inspect the agreed rules, their implementation, experiment progress and underlying data at any time. Chat and tabs must operate on the same saved records.

Bring paper trading into the next development phase. Support simulated execution inside Buddies and manual recording of trades placed at a real broker. Both use shared strategy versions, Buddies decisions, experiment definitions, journal events and learning. Preserve their execution provenance and evaluate their samples separately.

Paper trading serves two purposes: testing the software workflow and collecting forward observations of a strategy under stated execution assumptions. Synthetic software fixtures are never strategy evidence. Paper results cannot establish how real broker fills or behavior under financial pressure will differ. Simulators can omit latency, queue position and market impact; these limitations must stay visible in comparisons. See [Alpaca's explanation of paper simulation limits](https://docs.alpaca.markets/us/docs/paper-trading), used here as a general engineering reference, not a provider selection.

## Workspace

Default to Chat, with a collapsible conversation panel available from the other tabs. Keep the selected strategy, exact version, experiment, execution mode and run state visible. On mobile, use a full-width conversation or record view while preserving the selection and message draft.

| Tab | What Soban can inspect and do |
|---|---|
| Chat | Discuss research, draft/revise rules, request an experiment, record trades, ask about results and propose the next version. Resume saved conversations. |
| Strategy | Read the agreed hypothesis and complete rules, inspect version history and compare proposed changes. Clearly separate draft, saved version and version used by an experiment. |
| Implementation | See how every rule is checked, the required data/timeframe, whether it is automatic, manual or unsupported, and why a strategy is ready or blocked for paper automation. |
| Experiment | Inspect the frozen version, sample target, inclusion rules, risk/cost assumptions, observation coverage, progress and review decision. |
| Paper Desk | Inspect the virtual account, price source and freshness, pending orders, positions, fills, stops/targets, equity and run health. Submit manual paper actions or inspect an approved rule-driven run. |
| Real Trades | Record broker entries, changes, exits and costs through chat or forms. Link executions to their original plans and any corresponding paper trade. |
| Results & Learning | Compare strategy, execution and behavior evidence; inspect paper and broker samples, trade-level explanations, conditions, lessons and proposals for the next experiment. |

Keep existing charts, research, connectors, historical journal, backtest and ladder accessible as supporting tools. Reorganize navigation without deleting their records. Existing forms remain available for precise editing and when AI is unavailable.

The Implementation tab should answer practical questions such as “Does the engine wait for the completed 5-minute candle?” or “Is Wyckoff phase checked automatically or by me?” It must not claim a rule is implemented merely because the strategy schema accepts it.

## Conversation contract

Example workflow; the instrument and rules are illustrative, not an approved strategy:

1. “Help me define my XAU London strategy.” Buddies retrieves the selected strategy and relevant approved lessons, asks for material missing definitions, and creates a structured draft.
2. “Require 5-minute confirmation.” Buddies shows the exact changed rule and any effect on execution readiness. An active experiment keeps its original version.
3. “Save this version.” The saved version receipt links to Strategy. Conversation text alone is not a saved strategy.
4. “Run a 20-trade paper experiment.” Buddies presents the exact version, rules, sample, data source, costs and risk limits. Approval attaches to that specific proposal. Readiness checks must pass before the run starts.
5. “Why did trade 7 enter and exit?” Buddies retrieves the recorded condition evidence, prices and events, and links its explanation to those records.
6. “I took this setup at my broker and closed early.” Buddies extracts a structured execution record, asks only for necessary missing fields, and shows what will be recorded. Broker facts supplied after execution remain retrospective; they do not acquire invented pre-trade predictions.
7. “Compare the results and propose v1.1.” Buddies reads calculated metrics and comparable trades, explains uncertainty and proposes a revision. It does not rewrite the completed sample.

Save conversation messages and unfinished drafts automatically. Approval is required for a concrete strategy revision or experiment activation, not for every chat message. An explicit instruction to save a fully specified record can authorize that action without an additional redundant confirmation. Ambiguous “yes” must not approve an old or different proposal.

Use typed, server-validated actions for strategy saves, experiment approval, pre-trade capture, execution events and reviews. Reuse the existing domain APIs and transaction rules. Every successful action returns the saved entity ID and revision, then refreshes the relevant tabs. If storage fails, show that the action was not saved; never display a success based only on AI text.

Persist history through the existing shared AI session/message architecture. Keep ownership, session context, strategy/version/experiment references and action receipts. Load authoritative history and domain records on the server; browser-supplied chat history is not the source of truth. Resolve concurrent edits and repeated requests without duplicating versions, trades or lessons. Deleting a chat must not delete an approved strategy, experiment or execution audit trail.

AI can interpret requests and explain evidence. Deterministic services evaluate supported rules, simulate fills, calculate P&L and enforce risk limits. Market text, screenshots and retrieved content cannot authorize actions. A draft cannot silently become an active experiment. Read-only research and questions require no approval step.

## Existing infrastructure audit

Audit base: review branch at `0acb7fb0ffd367effbfb77ea59b5e905e20bc1b9`.

| Requirement | Decision | Existing implementation and required change |
|---|---|---|
| Durable strategy chat | EXTEND | `copilot/route.ts` uses shared provider/model selection but receives the last eight messages from the browser. `TradingLabDashboard.tsx` holds messages/drafts in component state. Connect shared session persistence and server-owned context. |
| Shared session API | REUSE + harden | `api/ai/sessions/route.ts` already stores sessions, but whole-history writes and unchecked database errors are insufficient for reliable actions. Inspect the live shared message/session relationships and add the smallest compatible concurrency/error-handling extension. Do not introduce a separate Trading Lab chat-memory system. |
| Action approval and receipts | REUSE pattern + EXTEND | Lab strategy/plan/event/review transactions already have retry and ownership protections. Project chat has `project_action_executions`, but its project and session foreign keys are project-specific. Reuse suitable shared action code; review those constraints before reusing the table or extending the shared abstraction. |
| Strategy and experiment records | EXTEND | Keep existing version saves, frozen protocols and sample review. Add execution mode, simulator/data versions and paper-specific assumptions to the frozen protocol. |
| Virtual account identity | EXTEND | `trading_accounts` already has account type, currency, balance and equity plus broker integration fields. Add an explicit internal simulation identity without sending virtual accounts through broker provisioning or sync. Confirm live constraints and use server projections that exclude connector credentials. |
| Paper orders and price evidence | NEW domain data | Pending order state, fill provenance, price-event identity, simulation run state and restart checkpoints have no equivalent in the current manual lifecycle. Add only the structured records required by execution. |
| Fills, close, review and learning | EXTEND | Reuse `trading_entries`, append-only trade events and shared decisions/lessons/behavior/rules/memory. Paper fills are generated by the execution service; manually reported broker fills retain their provenance. |
| Paired paper/broker executions | EXTEND | The manual milestone enforces one locked plan to one trade. Review an additive linkage design for execution legs of one original decision; do not drop that uniqueness protection or duplicate the prediction to make a comparison work. |
| Prices and connectors | EXTEND | `market-data.ts` provides candle snapshots and an explicitly marked synthetic demo fallback. It is not yet a durable bid/ask feed. Add the required timeframe, freshness, instrument specification and retained evidence capabilities. Synthetic fallback is prohibited for a forward evidence run. |
| Simulation calculations | REUSE validated parts + repair | `engine.ts` has useful indicators, but the current backtest is not an acceptable paper execution core. Correct the issues below and use one deterministic event engine for replay and forward paper. |
| Results and explanations | EXTEND | Reuse experiment metrics and shared learning. Add account equity and paired-execution views, explicit provenance filters and read tools that supply saved results to chat. |

### Simulation issues that block evidence use

The current engine can recognize a future trade exit and immediately update balance while the loop continues through earlier bars. It does not consistently honor condition timeframes/completed-bar declarations or the full exit and sizing schema. Its structure recency calculation depends on the wall clock, and its maximum holding period is hard-coded. Bars touching both SL and TP do not contain enough information to establish the actual event order.

These are correctness issues, not presentation tasks. Tests must cover chronological equity, completed-bar availability across timeframes, actual supported sizing/exits, deterministic clocks and explicit handling of ambiguous price paths. Unsupported conditions must block automatic execution or require a declared manual assessment before entry.

## Execution modes and comparison

| Mode | Who initiates trades? | What counts as execution evidence? |
|---|---|---|
| Manual paper | Soban, through chat or the Paper Desk | Simulated fills from retained market events and the declared fill model. |
| Rule-driven paper | Approved deterministic rules | Recorded evaluations, simulated orders/fills and the declared model. Manual discretionary checks are identified explicitly. |
| Broker manual | Soban, externally | Reported broker fills, timestamps, changes, costs and supporting records. |
| Historical replay | The test engine over a fixed dataset | Reproducible simulated events from that dataset, labelled as historical research. |

Keep account type (`live`/`demo`), execution source, initiator, dataset provenance and experiment/run identity separate. The existing `demo` selector records externally executed demo trades; it is not an internal paper system. Existing rows must retain their original meaning after any migration.

For a direct comparison, link paper and broker executions to the same opportunity and original decision where appropriate, with separate execution legs. Report the common eligible subset, unmatched/missed opportunities and timestamps. Use the same original planned monetary risk for paired R comparisons. Do not pool replay, forward paper and live broker samples or treat the paired legs as independent predictions.

Separate strategy-reference, frozen-plan, human paper and actual broker outcomes when those records exist. Reference outcomes remain unknown where discretionary rules or missing market evidence prevent a defensible reconstruction. A gap can include feed differences, costs, execution assumptions and human intervention; it is not automatically behavioral cost.

## Paper execution requirements

- Freeze the instrument specification, quantity unit, tick/lot precision, contract value, account currency and any required conversion/margin rules. A spot chart and a broker CFD cannot be assumed interchangeable.
- Identify feed, venue/symbol mapping, event time, receive time and data resolution. Use bid/ask where available; otherwise label and freeze the spread model. Use only information available at the decision time.
- Handle market, limit and stop orders with explicit pending, filled, partially filled, cancelled, rejected and expired states as each capability is implemented. Publish the supported subset; do not approximate unsupported types silently.
- Record SL/TP, protective order cancellation, partial exits, manual interventions and end-of-run treatment. A price gap may fill beyond a stop. Ambiguous candle paths require finer evidence or a declared conservative/unknown outcome; they cannot be called observed fills.
- Maintain an auditable cash/position ledger with realized and unrealized P&L, equity, drawdown, fees and financing under declared conventions. Account resets create a new run; they never erase a poor sample. Reconcile balances from events.
- Run the execution worker independently of an open browser. Persist checkpoints, event IDs and idempotency keys so restarts, concurrent workers and retries cannot create duplicate fills. Bind worker authority to the owner, approved run and allowed paper actions.
- Enforce session limits, position/risk limits and stale-data rules in the execution service. On a data gap, stop admitting new orders, mark existing position valuations/protection outcomes uncertain, retain the interruption and recover from recorded evidence without inventing fills.
- Show a run's actual state: draft, ready, running, paused, stopping, completed or failed. Define whether stopping cancels orders and closes positions before activation. Stopping due to safety limits remains part of the experiment evidence.
- Preserve data/model versions and decisions across corrections. A simulator repair creates a new run/version; it cannot overwrite the results used for an earlier review.

## Delivery order

The existing manual release keeps its remaining acceptance gates. The following work extends it in small usable slices; a “complete paper system” is not achieved by renaming the current demo journal.

| Slice | Deliverable | Required acceptance |
|---|---|---|
| 1. Chat with saved records | Persistent conversations; selected strategy/version/experiment context; typed saves/revisions and receipts; Strategy/Implementation/Experiment views | Create a draft, save it, reload, resume and revise it without changing an active sample. Chat and tabs agree. Failed saves and stale approvals are visible; retries and another user's access are tested. |
| 2. Deterministic execution core | Repaired replay/event engine; one explicitly supported instrument model; market entry, SL/TP, manual close, fixed risk and costs | Known event sequences produce correct fills and balances; no future data; gap/ambiguous-path behavior is explicit. Synthetic fixtures run in an isolated test environment and never enter user learning. |
| 3. Manual paper end to end | Paper account, retained real price feed, durable worker, Paper Desk and chat actions | Submit a paper plan, observe a simulated fill/exit, reload/restart and reconcile the account plus experiment results. Disconnected data, duplicate events and stop behavior are exercised. |
| 4. Rule-driven paper | Supported rule evaluator, capability readiness check, scheduled observation and an approved fixed sample | Exact rules/version generate decisions before orders. Unknown or unsupported required checks block execution. Zero-setup periods, missed opportunities, safety stops and failures are recorded. |
| 5. Broker comparison and review | Chat entry of manual broker facts, paired execution records, costs, results and shared lessons | One linked paper/broker example shows separate fills and outcomes, comparable R, missing evidence and a traceable review. A proposed revision creates a fresh version/sample. |
| 6. Complete supported paper workflow | Pending order types, partial fills/exits, richer account rules and operational recovery appropriate to the selected market | Each exposed feature has deterministic financial/accounting checks and durable recovery evidence. The UI accurately reports supported capabilities. |

Build slices 1–3 into one usable vertical workflow before broadening instruments or adding speculative strategy features. A real strategy is needed for its evidence sample, not for software implementation or isolated testing. Twenty trades can be an initial review checkpoint; it is not a universal threshold for proving an edge.

Broker/platform, exact instrument and usable market-data access need to be established before enabling a forward paper run that aims to resemble Soban's broker execution. They do not block the chat workflow, the execution contracts or isolated engine tests. No provider, paid subscription or real strategy is selected by this document.

Strategy discovery, automatic condition ablation and controlled live broker execution remain later work. Buddies may propose candidate experiments; Soban approves the specific strategy and protocol that will run.

## Change and release status

This change updates the development reference and records the implementation plan only. It does not add a paper account, worker, persistent chat, new tabs, application code or a database migration. The earlier manual workflow remains on draft PR #17; its database migration is applied and its production app release is still pending acceptance. Use [the deployment record](TRADING_LAB_DEPLOYMENT.md) for that release's verification details.
