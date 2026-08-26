export type LabCandle = { time: string; open: number; high: number; low: number; close: number; volume: number | null };
export type PillarBias = "bullish" | "bearish" | "neutral" | "unavailable";
export type PillarResult = { bias: PillarBias; score: number; confidence: number; summary: string; evidence: string[]; warnings: string[] };

const round = (value: number, digits = 2) => Number(value.toFixed(digits));

export function ema(values: number[], period: number) {
  if (!values.length) return [];
  const k = 2 / (period + 1);
  const output = [values[0]];
  for (let index = 1; index < values.length; index++) output.push(values[index] * k + output[index - 1] * (1 - k));
  return output;
}

export function rsi(values: number[], period = 14) {
  if (values.length < period + 1) return null;
  let gain = 0, loss = 0;
  for (let index = 1; index <= period; index++) {
    const change = values[index] - values[index - 1]; gain += Math.max(change, 0); loss += Math.max(-change, 0);
  }
  gain /= period; loss /= period;
  for (let index = period + 1; index < values.length; index++) {
    const change = values[index] - values[index - 1];
    gain = (gain * (period - 1) + Math.max(change, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-change, 0)) / period;
  }
  return loss === 0 ? 100 : round(100 - 100 / (1 + gain / loss), 1);
}

export function atr(candles: LabCandle[], period = 14) {
  if (candles.length < period + 1) return null;
  const ranges = candles.slice(1).map((candle, index) => Math.max(candle.high - candle.low, Math.abs(candle.high - candles[index].close), Math.abs(candle.low - candles[index].close)));
  let result = ranges.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  for (const value of ranges.slice(period)) result = (result * (period - 1) + value) / period;
  return round(result, 3);
}

export function technicalPillar(candles: LabCandle[]): PillarResult & { rsi: number | null; atr: number | null; ema20: number | null; ema50: number | null } {
  if (candles.length < 55) return { bias: "unavailable", score: 0, confidence: 0, summary: "Insufficient completed candles", evidence: [], warnings: ["At least 55 bars are required"], rsi: null, atr: null, ema20: null, ema50: null };
  const closes = candles.map(item => item.close);
  const fast = ema(closes, 20).at(-1)!;
  const slow = ema(closes, 50).at(-1)!;
  const currentRsi = rsi(closes);
  const last = closes.at(-1)!;
  let score = last > fast ? 1 : -1;
  score += fast > slow ? 2 : -2;
  if ((currentRsi ?? 50) > 55) score += 1;
  if ((currentRsi ?? 50) < 45) score -= 1;
  const bias: PillarBias = score >= 2 ? "bullish" : score <= -2 ? "bearish" : "neutral";
  return { bias, score, confidence: Math.min(90, 55 + Math.abs(score) * 7), summary: `${bias} structure: close ${round(last)}, EMA20 ${round(fast)}, EMA50 ${round(slow)}, RSI ${currentRsi}`, evidence: [`Price is ${last >= fast ? "above" : "below"} EMA20`, `EMA20 is ${fast >= slow ? "above" : "below"} EMA50`, `RSI ${currentRsi}`], warnings: [], rsi: currentRsi, atr: atr(candles), ema20: round(fast), ema50: round(slow) };
}

export function volumePillar(candles: LabCandle[]): PillarResult & { available: boolean; relativeVolume: number | null; event: string | null } {
  const bars = candles.filter(item => item.volume !== null && (item.volume ?? 0) > 0);
  if (bars.length < 20) return { available: false, bias: "unavailable", score: 0, confidence: 0, summary: "Reported volume is unavailable", evidence: [], warnings: ["Wyckoff/VSA confirmation is withheld; zero or missing volume is never interpreted as low participation"], relativeVolume: null, event: null };
  const recent = bars.slice(-20); const last = recent.at(-1)!;
  const avgVolume = recent.slice(0, -1).reduce((sum, item) => sum + (item.volume ?? 0), 0) / 19;
  const avgSpread = recent.slice(0, -1).reduce((sum, item) => sum + item.high - item.low, 0) / 19;
  const relativeVolume = round((last.volume ?? 0) / avgVolume);
  const closeLocation = last.high === last.low ? .5 : (last.close - last.low) / (last.high - last.low);
  const spreadRatio = (last.high - last.low) / avgSpread;
  const climatic = relativeVolume >= 1.8 && spreadRatio >= 1.3;
  const bias: PillarBias = climatic && closeLocation >= .65 ? "bullish" : climatic && closeLocation <= .35 ? "bearish" : "neutral";
  const event = bias === "bullish" ? "possible sign of strength / spring response" : bias === "bearish" ? "possible sign of weakness / upthrust response" : null;
  return { available: true, bias, score: bias === "bullish" ? 2 : bias === "bearish" ? -2 : 0, confidence: event ? 68 : 50, summary: event ? `${event}; relative volume ${relativeVolume}x` : `No confirmed Wyckoff event; relative volume ${relativeVolume}x`, evidence: [`Relative volume ${relativeVolume}x`, `Spread ${round(spreadRatio)}x average`, `Close location ${Math.round(closeLocation * 100)}%`], warnings: ["Wyckoff event labels are provisional until subsequent bars confirm them"], relativeVolume, event };
}

export function decide(fundamental: PillarResult, technical: PillarResult, volume: ReturnType<typeof volumePillar>, fresh: boolean) {
  const available = [fundamental, technical, volume].filter(item => item.bias !== "unavailable");
  const bulls = available.filter(item => item.bias === "bullish").length;
  const bears = available.filter(item => item.bias === "bearish").length;
  const direction = bulls >= 2 ? "bullish" : bears >= 2 ? "bearish" : "neutral";
  const blockers = [
    ...(!fresh ? ["Market data is stale"] : []),
    ...(available.length < 2 ? ["Fewer than two pillars are available"] : []),
    ...(direction === "neutral" ? ["At least two pillars do not align"] : []),
    ...(volume.available && direction !== "neutral" && volume.bias !== "neutral" && volume.bias !== direction ? ["Volume/Wyckoff opposes the direction"] : []),
  ];
  const confirmed = blockers.length === 0 && volume.available && volume.bias === direction && Math.abs(technical.score) >= 3;
  const state = blockers.length ? "NO TRADE" : confirmed ? direction === "bullish" ? "LONG SETUP CONFIRMED" : "SHORT SETUP CONFIRMED" : direction === "bullish" ? "WATCH LONG" : direction === "bearish" ? "WATCH SHORT" : "NO TRADE";
  return { state, bias: direction, confidence: Math.round(available.reduce((sum, item) => sum + item.confidence, 0) / Math.max(available.length, 1)), blockers, trigger: direction === "bullish" ? "Wait for a completed-candle break or higher-low confirmation" : direction === "bearish" ? "Wait for a completed-candle break or lower-high confirmation" : "Wait for two pillars to align", invalidation: direction === "bullish" ? "Below the latest structural swing low" : direction === "bearish" ? "Above the latest structural swing high" : "Unavailable until direction forms" };
}

export function demoCandles(count = 220): LabCandle[] {
  let price = 2325;
  return Array.from({ length: count }, (_, index) => {
    const cycle = Math.sin(index / 11) * 3.2 + Math.sin(index / 37) * 6;
    const drift = index * .09;
    const open = price; const close = 2325 + drift + cycle; price = close;
    const spread = 2.2 + Math.abs(Math.sin(index / 5)) * 2;
    return { time: new Date(Date.UTC(2026, 0, 1, index)).toISOString(), open: round(open), high: round(Math.max(open, close) + spread), low: round(Math.min(open, close) - spread), close: round(close), volume: Math.round(900 + Math.abs(Math.sin(index / 7)) * 600 + (index % 43 === 0 ? 1200 : 0)) };
  });
}

export type BacktestConfig = { initialCapital: number; riskPct: number; stopAtr: number; rewardRisk: number; commission: number; slippage: number; entryMode?: "swing" | "reversal" | "momentum"; progressive?: { multiplier: number; maxIncreases: number } };
export function runBacktest(candles: LabCandle[], config: BacktestConfig) {
  if (candles.length < 60) throw new Error("At least 60 candles are required for a backtest.");
  const closes = candles.map(item => item.close); const fast = ema(closes, 20); const slow = ema(closes, 50);
  let balance = config.initialCapital; let peak = balance; let maxDrawdown = 0; let lossStreak = 0;
  const trades: any[] = []; const curve = [{ time: candles[50].time, balance }];
  for (let index = 51; index < candles.length - 1; index++) {
    const currentRsi = rsi(closes.slice(0, index + 1));
    const recent = candles.slice(index - 20, index);
    const previousHigh = Math.max(...recent.map(item => item.high));
    const previousLow = Math.min(...recent.map(item => item.low));
    const signals = config.entryMode === "reversal"
      ? { long: (currentRsi ?? 50) < 32 && closes[index] > candles[index].low + (candles[index].high - candles[index].low) * .6, short: (currentRsi ?? 50) > 68 && closes[index] < candles[index].low + (candles[index].high - candles[index].low) * .4 }
      : config.entryMode === "momentum"
        ? { long: closes[index] > previousHigh && fast[index] > slow[index], short: closes[index] < previousLow && fast[index] < slow[index] }
        : { long: fast[index - 1] <= slow[index - 1] && fast[index] > slow[index], short: fast[index - 1] >= slow[index - 1] && fast[index] < slow[index] };
    if (!signals.long && !signals.short) continue;
    const direction = signals.long ? "long" : "short"; const entry = candles[index + 1].open + (direction === "long" ? config.slippage : -config.slippage);
    const currentAtr = atr(candles.slice(0, index + 1)) ?? entry * .01;
    const stopDistance = currentAtr * config.stopAtr; const riskMultiplier = config.progressive ? Math.min(config.progressive.multiplier ** lossStreak, config.progressive.multiplier ** config.progressive.maxIncreases) : 1;
    const risk = balance * (config.riskPct / 100) * riskMultiplier; const size = risk / stopDistance;
    const stop = direction === "long" ? entry - stopDistance : entry + stopDistance; const target = direction === "long" ? entry + stopDistance * config.rewardRisk : entry - stopDistance * config.rewardRisk;
    let exit = candles[Math.min(index + 12, candles.length - 1)].close; let exitIndex = Math.min(index + 12, candles.length - 1); let reason = "time";
    for (let cursor = index + 1; cursor <= Math.min(index + 12, candles.length - 1); cursor++) {
      const bar = candles[cursor]; const stopped = direction === "long" ? bar.low <= stop : bar.high >= stop; const targeted = direction === "long" ? bar.high >= target : bar.low <= target;
      if (stopped || targeted) { exit = stopped ? stop : target; exitIndex = cursor; reason = stopped ? "stop" : "target"; break; }
    }
    const gross = (direction === "long" ? exit - entry : entry - exit) * size; const fees = config.commission * 2; const pnl = gross - fees; balance += pnl; lossStreak = pnl < 0 ? lossStreak + 1 : 0;
    peak = Math.max(peak, balance); maxDrawdown = Math.max(maxDrawdown, peak - balance);
    trades.push({ direction, entryTime: candles[index + 1].time, exitTime: candles[exitIndex].time, entryPrice: round(entry), exitPrice: round(exit), size: round(size, 4), pnl: round(pnl), rMultiple: round(pnl / risk), fees, exitReason: reason });
    curve.push({ time: candles[exitIndex].time, balance: round(balance) });
  }
  const wins = trades.filter(item => item.pnl > 0); const losses = trades.filter(item => item.pnl <= 0);
  const grossProfit = wins.reduce((sum, item) => sum + item.pnl, 0); const grossLoss = Math.abs(losses.reduce((sum, item) => sum + item.pnl, 0));
  return { metrics: { initialCapital: config.initialCapital, finalCapital: round(balance), netReturnPct: round((balance / config.initialCapital - 1) * 100), totalTrades: trades.length, winRate: trades.length ? round(wins.length / trades.length * 100, 1) : 0, profitFactor: grossLoss ? round(grossProfit / grossLoss) : null, expectancy: trades.length ? round((balance - config.initialCapital) / trades.length) : 0, maxDrawdown: round(maxDrawdown), maxDrawdownPct: peak ? round(maxDrawdown / peak * 100) : 0 }, trades, equityCurve: curve };
}
