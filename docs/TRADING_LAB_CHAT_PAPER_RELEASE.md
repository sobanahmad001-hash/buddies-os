# Trading Lab chat and paper release

10 September 2026 · Build and acceptance record

**Status: implemented and locally verified; public GitHub publication and production chat/paper deployment are blocked by automatic approval review.** The earlier manual database milestone remains deployed. The new shared chat columns and paper tables were confirmed absent after the rejected request. The implementation is committed locally; PR #17 and its preview still contain the earlier release. Browser acceptance is assigned to Soban and starts after publication and database deployment.

## Scope delivered

Trading Lab remains a module in Buddies OS. This extension adds persistent shared AI conversations, exact action proposals and recoverable receipts, the seven workspace tabs, a deterministic paper/replay engine, a server worker, manual broker pairing and separate execution outcomes on the shared decision.

Chat can prepare strategy versions, experiments, plans, execution/review events and paper commands. Approval uses the saved proposal, not a replacement payload from the browser. Shared research can be included explicitly; results without verified web citations remain unavailable as current market evidence. Chat usage is recorded in the existing AI usage ledger using Buddies' existing configured cost estimates.

Paper execution supports manual orders and supported numeric strategy rules. Implemented operations include market/limit/stop entries, assumed partial entry fills, partial/final closes, protection changes, fixed/ATR stops, fixed/R targets, optional maximum holding bars, fixed monetary risk or fixed quantity, session/risk limits, costs/financing, persistent price evidence, recovery and account reconciliation. The Implementation tab exposes unsupported/manual rules and blocks automatic execution for them.

Paper accounts extend `trading_accounts` with an internal broker identity and remain excluded from broker provisioning/sync through `is_active=false`. Paper and broker fills share the journal but retain immutable execution provenance. Each may link to one original decision. `decisions.execution_outcomes` preserves both legs; the generic summary prefers the broker leg when present. Paired broker records do not enter a declared paper sample. Reviews use existing lessons, behavior, rule violations and memory.

Historical replay runs use the same engine but do not create historical “pre-trade” decisions, journal samples or learning records. Uploaded market history remains user-supplied; synthetic fixtures are explicitly labelled as software tests. Replay never starts a live or forward run.

## Verification

- 100 tests across 14 suites pass, including strategy/plan/manual regressions and new chat, API, feed and execution checks.
- TypeScript and the optimized Next.js production build pass (101 generated pages). Local build uses placeholder Supabase configuration and does not verify Vercel secrets.
- `scripts/test-trading-chat-paper-db.mjs` passes against the isolated captured live schema plus the audited shared chat/account fields. It verifies message persistence, retries, stale approvals, recovery, usage, ownership, server-only paper writes, immutable provenance, same-decision paper/broker legs, sample separation, atomic failure rollback, journal/account reconciliation and shared learning.
- Worker code is generated from the same source used by the app and tests. Build with `BUDDIES_ESBUILD_MODULE=<esbuild 0.25.10 module> node scripts/build-trading-paper-worker.mjs`. The generated `worker.js` is a deployment artifact, ignored by Git; source, entrypoint, declaration and build recipe are committed.
- `scripts/test-trading-paper-worker.mjs` passes against the actual Edge entrypoint with isolated dependencies: method/token rejection, database/network failure, authorized dispatch, ignored client-selected run/owner/price fields and worker failure responses. The generated deployment bundle also passes an empty-cycle smoke check. This is a local contract check, not a deployed Deno runtime receipt.
- The original `test-trading-plan-db.mjs` and `test-trading-manual-db.mjs` database regression scripts pass after this extension.
- Browser sign-in and signed-in interaction acceptance are assigned to Soban at his request. No browser authentication was attempted for this extension.
- No synthetic user, strategy, trade or experiment was inserted into production by this build.

## Database and worker changes

Canonical SQL is prepared in this order after the previously deployed manual milestone; none of these three new scripts is deployed yet:

1. `docs/sql/trading_lab_chat.sql`: extend shared sessions/messages; guarded append/response/action receipts; shared usage writes.
2. `docs/sql/trading_lab_paper.sql`: paper run/event and execution-pair records; shared account/journal/decision extensions; owner read policies and server-only execution; atomic lifecycle projection.
3. `docs/sql/trading_lab_paper_worker.sql`: Cron and network extensions, a private authentication hash and Vault token, and the named one-minute scheduler.

The scheduler calls the Edge worker only while a run is running, paused or stopping. It does not activate experiments. Paused runs continue checking protection. The Edge endpoint validates its custom bearer token against a server-only hash before reading active runs; clients cannot choose another user's run or pass fabricated prices to it. An optional Next.js worker endpoint uses `TRADING_PAPER_WORKER_SECRET` for an external scheduler; the Supabase scheduler uses the Edge endpoint and does not require that Vercel variable.

All application writes pass through the existing authenticated session or a constrained paper service. New tables expose owner reads to authenticated clients; paper writes are server-only. The existing one-manual-trade-per-plan protection is retained while permitting a distinct paper execution leg. The capture function extends its existing contract for server-generated paper assessments. SQL integration tests cover those shared-boundary changes.

Supabase CLI download was blocked by a cancelled network approval in this environment. Canonical SQL preserves the proposed change; remote migration history contains the earlier manual milestone. CLI-generated repository history reconciliation remains an administrative follow-up. No migration timestamp filename was invented.

## Production approval scope

Automatic approval review rejected `trading_lab_chat_and_paper_execution` on `vzjpaptthqrohqnbhfvn` because explicit approval for this exact production schema/security change and its shared-table impact was not established. No alternate execution path was attempted. A read-only check confirmed `trading_paper_runs` and `ai_sessions.lab_context` remain absent.

Automatic approval review also rejected publishing the GitHub tree to the existing public repository `sobanahmad001-hash/buddies-os`. Its stated reason was that explicit approval for public disclosure of the included project identifiers, URLs, schema/security details and worker infrastructure was not established. The branch was not updated through another path. The code contains no saved market-data key or generated worker bearer token; the new infrastructure documentation and schema would be public along with the implementation.

Publication approval covers committing these reviewed source files and documentation to the existing review branch, updating draft PR #17, and allowing its normal Vercel preview build. Production approval covers the following database and worker release on Soban's identified Supabase project.

The concrete pending release consists of:

1. Apply the first two SQL files as migration `trading_lab_chat_and_paper_execution`, in one transaction with a five-second lock timeout and a 90-second statement timeout. It adds Lab context/revisions/drafts to shared AI sessions, message metadata/request ordering, guarded chat action/usage writes, paper run/event/pair tables, immutable execution provenance in the shared journal, and separate paper/broker outcomes in shared decisions. It adds owner policies, constrained service-only execution and invoker functions/triggers. Existing generic decision and manual execution paths remain covered by regression tests.
2. Deploy Edge Function `trading-paper-worker` from the committed entrypoint and generated shared engine. Platform JWT verification is disabled for this endpoint because its custom bearer authentication must pass the server-only authorization function before any work. This is an internal scheduler endpoint and accepts no client-selected run/owner/price payload.
3. Apply `trading_lab_paper_worker.sql`: enable Cron/network extensions, create the private worker-authentication hash and Vault token, and register `buddies-trading-paper-worker` every minute. It requests work only when an approved run is already active; it does not create or start a strategy. This enables background requests and their normal hosting/provider usage.
4. Verify the deployed owner/security boundaries, denied unauthorized requests, scheduler configuration and one authenticated empty worker cycle. Then hand over the signed-in browser checklist. Production frontend promotion remains after browser acceptance.

The material risk is applying new triggers/functions/security grants to the existing production AI session, decision and trading journal paths. The isolated live-schema tests cover these boundaries, but live migration/runtime verification is still pending. No broker execution, payment, subscription purchase or strategy activation is part of this deployment approval.

## Operational requirements and limits

- No Twelve Data connector profile was present in the verified project during this build. Add a key through the existing Connectors tool with access to the exact instrument's one-minute bars. No paid subscription or provider upgrade was purchased.
- Confirm the quantity unit, USD contract value, precision, margin fraction, spread, slippage and fees. The first paper release is a single-instrument USD contract model per run. It does not claim multi-currency conversion, broker queue liquidity or exact exchange execution.
- The worker uses completed UTC one-minute OHLC candles. Forward decisions are recorded before eligible fills; polling may delay entry. Same-bar price order and intrabar timestamps are assumed, not observed. Ambiguous SL/TP uses a labelled conservative stop-first outcome. Intrabar pending-entry targets are deferred conservatively.
- Financing is a declared signed amount per quantity per elapsed 24-hour period. Broker-specific rollover times, triple-swap calendars, arbitrary trailing/structure targets and progressive/volatility sizing are not implemented. Capability checks block unsupported automated strategies.
- Missing/stale data stops inferred fills and marks the run failed. An explicit resume acknowledges missing price paths; affected positions retain uncertainty. Revised provider history is detected and preserved rather than silently replacing recorded evidence.
- Replay and forward processing retain up to 15,000 one-minute bars in working state; all processed market batches are retained in event history. The worker processes up to eight active runs per cycle. This is a controlled-sample release, not an unlimited multi-account execution service.
- Paper/manual/live/replay samples remain distinct. A small positive sample and KEEP/MODIFY/RETEST/KILL review are not conclusive evidence of an edge. A paper/broker gap is not automatically a causal behavioral cost.

## Soban's browser acceptance

1. Open the branch preview and sign in. Confirm Chat, Strategy, Implementation, Experiment, Paper Desk, Real Trades and Results & Learning.
2. Start a conversation, send a message, reload and resume it. Check the saved draft and selected record context.
3. Define a measurable strategy, inspect and approve its exact version. Verify the Strategy tab. Propose a revision and confirm the earlier version remains unchanged.
4. Inspect Implementation. Confirm a discretionary or unsupported rule blocks rule-driven paper while remaining available for manual assessment.
5. Approve an experiment with execution source Paper and account type Demo. Configure its contract, session, costs and limits in Paper Desk or chat. Creating a ready run must not start it.
6. After connecting market data, explicitly start a run. For manual paper, lock a passing plan first and submit it. Check retained events, fills, balances and worker progress after closing/reopening the browser. Exercise pause, protection, partial close and stop as appropriate.
7. Record a real broker execution against the same original plan, then link it to the paper execution. Check paired results and that the broker leg stays outside the paper sample.
8. Review a closed trade and verify shared learning. Check mobile layout and another user's isolation if a second test account is available. API/database ownership rejection has already been tested automatically.

Production frontend release follows this acceptance through the existing Buddies deployment. The review branch remains the concrete handoff; no new Buddies app or repository is required.

## Deployment receipts

| Item | Verified state |
|---|---|
| New source | Committed locally; publishing to the public GitHub review branch was rejected by automatic approval review |
| Earlier manual database milestone | Applied: `20260909234633_trading_lab_controlled_manual_samples` |
| New chat/paper migration | Rejected by automatic approval review; read-only absence check passed |
| Edge function and Cron job | Prepared and locally checked; deployment deferred with the database gate |
| Forward market integration | No Twelve Data connector profile exists yet; no forward run started |
| Signed-in browser acceptance | Assigned to Soban; not performed for this extension |
| Production frontend promotion | Pending deployment and Soban's acceptance |

Reviewed source SHA-256 values:

| File | SHA-256 |
|---|---|
| `docs/sql/trading_lab_chat.sql` | `c609e9ac37ae06930e58c73e9fcc5855358f409463fb5592d48abd9349aebb5e` |
| `docs/sql/trading_lab_paper.sql` | `c19c3b8dcbfdd45495bd83fea08a9ac7c91ea2521ec4b9a7dbfcdead6e1c7faf` |
| `docs/sql/trading_lab_paper_worker.sql` | `0fab2edf8021361e018963f8566f908b9a351a3b47d6352e4df9f172549a6d06` |

Publication target: [draft PR #17](https://github.com/sobanahmad001-hash/buddies-os/pull/17), branch `codex/trading-lab-reference-and-pretrade`. The existing [Trading Lab preview](https://buddies-os-git-codex-tradin-a28328-sobanahmad001-9513s-projects.vercel.app/app/trading-lab) still reflects remote commit `de83f5f3e5f0f389a4aa629daeead96322effb27`, not this new implementation. A new compiled frontend alone cannot make the chat/paper features operational before the required database changes.
