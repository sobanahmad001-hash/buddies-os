export type LadderConfig = { startingBalance: number; stepCount: number; targetGrowthPct: number; maxAttemptsPerStep: number; failureDrawdownPct: number };

export function simulateLadder(trades: Array<{ rMultiple?: number | null; pnl?: number }>, config: LadderConfig) {
  let balance = config.startingBalance; let step = 1; let attempts = 0; let peak = balance; let failed = false;
  const steps = Array.from({ length: config.stepCount }, (_, index) => ({ step: index + 1, start: null as number | null, target: null as number | null, end: null as number | null, attempts: 0, status: "pending" }));
  steps[0].start = balance; steps[0].target = balance * (1 + config.targetGrowthPct / 100); steps[0].status = "active";
  for (const trade of trades) {
    if (step > config.stepCount || failed) break;
    attempts++; const risk = balance * .01; balance += trade.rMultiple != null ? risk * trade.rMultiple : trade.pnl ?? 0; peak = Math.max(peak, balance);
    const current = steps[step - 1]; current.attempts = attempts; current.end = Number(balance.toFixed(2));
    if (balance >= (current.target ?? Infinity)) {
      current.status = "passed"; step++; attempts = 0;
      if (step <= config.stepCount) { steps[step - 1].start = balance; steps[step - 1].target = balance * (1 + config.targetGrowthPct / 100); steps[step - 1].status = "active"; }
    } else if (attempts >= config.maxAttemptsPerStep || (peak - balance) / peak * 100 >= config.failureDrawdownPct) { current.status = "failed"; failed = true; }
  }
  return { status: step > config.stepCount ? "completed" : failed ? "failed" : "active", currentStep: Math.min(step, config.stepCount), finalBalance: Number(balance.toFixed(2)), completionPct: Math.round(Math.min(step - 1, config.stepCount) / config.stepCount * 100), steps };
}
