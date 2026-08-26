# Buddies OS Trading Lab execution reference

Status: approved for phased implementation on 2026-08-26.

The complete product blueprint is stored at `output/pdf/buddies-os-trading-lab-blueprint.pdf`.

## Product boundary

Trading Lab is a new module inside Buddies OS. It reuses authentication, deployment,
design primitives and existing user records, while replacing the current Trading
Agent's analysis architecture. Broker execution remains external.

The current `/app/trading` experience stays operational during development. The new
module is built behind `/app/trading-lab` and is not added to primary navigation until
its data migration and acceptance tests pass.

## Non-negotiable rules

- Missing or stale evidence can only reduce confidence or produce `NO TRADE`.
- API credentials are accepted by authenticated server endpoints, encrypted at rest,
  and never returned to the browser in plaintext.
- AI drafts rules and explains verified results; deterministic services execute tests
  and evaluate decision gates.
- Strategy and dataset versions are immutable within a backtest run.
- The ladder is a reusable campaign/risk overlay and must attach to a defined strategy.
- Existing trading and ladder records are preserved through additive migrations.

## Phase gates

1. Foundation: protected route, connector capability contracts, strategy schema, and
   legacy feature/data map.
2. Connectors: encrypted secret lifecycle, ownership policies, health and audit.
3. Data: normalized gold spot/futures, macro, COT, calendar and chart feeds.
4. Strategy Lab: builder, versions, templates and ladder campaigns.
5. Backtesting: reproducible fills, costs, out-of-sample and risk reports.
6. AI Copilot: rule drafting, ambiguity review and evidence-grounded explanations.
7. Decision Desk: fundamental, technical and volume/Wyckoff pillars with five states.
8. Journal: manual/CSV trades, attachments, psychology and migration.
9. Alerts/order flow: TradingView webhooks, streaming depth and later heatmaps.

No phase is complete until its automated checks, authorization, data-quality behavior,
and user-visible failure states are verified.
