# Trading Lab — charts and analysis contribution

10 September 2026 · Extension to the chat/paper release · Owner: Soban

## Product correction

Charts are a primary workspace in Trading Lab. Strategies organize experiments; they do not replace technical, volume, structure or fundamental research. The learning question is whether an analysis adds useful information, when it does, and whether the resulting decision was executed correctly.

The earlier build retained charts under a supporting Decision tool. That placement was too secondary. Charts & Analysis is now a main tab beside Chat. Chat remains available alongside it. Chart data, analytical judgments, strategy rules and execution outcomes have distinct provenance.

## Existing infrastructure and changes

| Requirement | Reuse / extension | Current behavior |
|---|---|---|
| Charts | EXTEND existing Lightweight Charts component | Candles, toggleable EMA20/EMA50 overlays, RSI14 pane with 30/70 guides, reported volume pane, current structure lines; ATR14 value |
| Timeframes | EXTEND existing market adapter | 1m, 5m, 15m, 1H, 4H, 1D; completed UTC provider candles; duplicate/invalid prices rejected; zero volume retained |
| Technical and structure analysis | REUSE existing engine | Evidence panels, trend/momentum/volatility and structure; heuristic confidence is explicitly not a win probability |
| Volume / Wyckoff | REUSE existing engine and manual context | Provider-dependent reported volume and heuristic Wyckoff/VSA context; absent volume stays unavailable |
| Fundamentals | REUSE FRED and CFTC connectors plus research | Gold macro context from yields/dollar and weekly COT; this is not a full economic-news/calendar system |
| Frozen analysis judgments | EXTEND existing pre-trade JSON | Optional versioned manual analysisEvidence inside the existing immutable plan_snapshot; no new table or database migration |
| Combination results | EXTEND experimentMetrics | Seven technical/volume/fundamental combinations, plus conditional incremental comparisons; same exact sample and strategy version |
| Chat and learning | REUSE shared context and reviews | Saved plan analyses and experiment contribution metrics enter server-owned chat context; lessons still use shared review/memory architecture |

## What gets locked before execution

For each of technical, volume and fundamental analysis, record supports/opposes/neutral/unknown relative to the planned direction, reasoning, source/settings/timeframe, and when the source data was available. Known judgments require all evidence fields. An analysis timestamp cannot follow the plan's observed time. The original labels cannot be amended after seeing the result.

These are explicitly manual pre-trade assessments. The chart's current indicators or macro panel are not automatically captured as a historical dataset by this change. Old trades receive no invented labels. Automatic rule-driven paper orders without such judgments remain outside these analysis cohorts; manual paper plans can carry the same locked judgments as broker plans.

Use a stable interpretation of each pillar throughout a sample. If the analysis rules change, create a new strategy version and experiment. Record actual source type: gold spot/tick volume is not a consolidated exchange-volume measure. Structure lines describe current context and must not be read as historical entry signals.

## How combined analysis is measured

Each of seven nonempty combinations compares trades where all listed analyses support the trade with other trades where those same analyses are known but neutral/opposing. Report count, average actual net R, win rate, unknown count, and separately available strategy-reference R and its coverage. A missing comparator produces Unknown, not zero improvement.

Conditional comparisons additionally hold the base assessments at supports:

- Technical → add volume.
- Technical → add fundamentals.
- Technical + volume → add fundamentals.

For each, compare the added layer supporting versus neutral/opposing. This estimates an observed difference within that subset. It does not establish causation: market regime, direction, timing, execution and selection can still differ. Rows overlap and their returns or differences cannot be added. No confidence scores are multiplied into a supposed win probability.

Only closed fixed-sample executions with valid, timely pre-trade records enter the comparisons. Execution before capture, after expiry, invalid timestamps and missing labels are excluded. Untraded opportunities are not reconstructed. Actual R includes execution and behavior; reviewed strategy-reference R is shown separately and only when evidenced. Replays and broker legs outside a paper sample are excluded through the existing sample filter.

## Next evidence work

This release provides descriptive comparisons. Reliable automatic analysis contribution still requires source-backed point-in-time market/macro/news snapshots, explicit news availability and revision timestamps, reproducible analysis rule versions, observation coverage including skipped trades, regime/session/direction stratification, and separate forward or holdout samples. Full causal attribution, automatic ablation and calibrated combined probabilities remain future work. A promising 20-trade result is a hypothesis for the next experiment.

## Verification and browser acceptance

111 unit/API tests across 16 suites cover existing regressions and new combination arithmetic, base-conditioned comparisons, unknown exclusion, missing/late/expired records, separate reference outcomes, required evidence fields, indicator warmup/prefix stability and completed UTC chart data. TypeScript passes. The optimized app build passes. The isolated pre-trade SQL test confirms the new JSON survives capture and remains protected by the existing immutable plan boundary.

Soban owns browser acceptance: open Charts & Analysis; toggle overlays; switch 1m/5m/15m and confirm source/time; inspect evidence panels; select an experiment; lock a plan with three analysis assessments; execute/review; check Results & Learning for the same experiment. Confirm missing records show Unknown. No synthetic user records are inserted into production for this check.

Chart integration follows the official [series and panes API](https://tradingview.github.io/lightweight-charts/docs/api/interfaces/IChartApi) and [series/price-line API](https://tradingview.github.io/lightweight-charts/docs/api/interfaces/ISeriesApi).
