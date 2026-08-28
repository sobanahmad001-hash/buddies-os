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

export type StructureLevel = { price: number; kind: "support" | "resistance"; timeframe: "D1" | "H4" | "H1"; strength: number; touches: number; holds: number; lastTest: string };
export type StructureResult = PillarResult & {
  state: "support-holding" | "resistance-holding" | "neutral" | "at-risk" | "unavailable";
  levels: StructureLevel[]; support: StructureLevel | null; resistance: StructureLevel | null;
  distanceToSupportAtr: number | null; distanceToResistanceAtr: number | null;
  rejectionConfirmed: boolean; triggerPrice: number | null; invalidationPrice: number | null; targetPrice: number | null;
  rewardRisk: number | null; expectedHourlyRange: number | null; historicalHitRate: number | null; hitRateSample: number;
};

function swingCandidates(candles: LabCandle[], timeframe: StructureLevel["timeframe"]) {
  const found: Array<{ price: number; kind: StructureLevel["kind"]; time: string; held: boolean }> = [];
  for (let index = 2; index < candles.length - 2; index++) {
    const bar = candles[index]; const around = candles.slice(index - 2, index + 3);
    const high = around.every(item => bar.high >= item.high); const low = around.every(item => bar.low <= item.low);
    if (high) found.push({ price: bar.high, kind: "resistance", time: bar.time, held: candles[index + 1].close < bar.high && candles[index + 2].close < bar.high });
    if (low) found.push({ price: bar.low, kind: "support", time: bar.time, held: candles[index + 1].close > bar.low && candles[index + 2].close > bar.low });
  }
  return { timeframe, found };
}

export function structurePillar(histories: Partial<Record<StructureLevel["timeframe"], LabCandle[]>>, live: LabCandle[]): StructureResult {
  const current = live.at(-1)?.close; const currentAtr = atr(live) ?? null;
  if (!current || !currentAtr || live.length < 20) return { state: "unavailable", levels: [], support: null, resistance: null, distanceToSupportAtr: null, distanceToResistanceAtr: null, rejectionConfirmed: false, triggerPrice: null, invalidationPrice: null, targetPrice: null, rewardRisk: null, expectedHourlyRange: null, historicalHitRate: null, hitRateSample: 0, bias: "unavailable", score: 0, confidence: 0, summary: "Structure history is unavailable", evidence: [], warnings: ["At least 20 completed H1 bars are required"] };
  const weight = { D1: 4, H4: 3, H1: 2 } as const; const tolerance = currentAtr * .35;
  const raw = (Object.entries(histories) as Array<[StructureLevel["timeframe"], LabCandle[]]>).flatMap(([timeframe, bars]) => swingCandidates(bars, timeframe).found.map(item => ({ ...item, timeframe })));
  const clusters: Array<{ price: number; kind: StructureLevel["kind"]; timeframe: StructureLevel["timeframe"]; times: string[]; holds: number; touches: number }> = [];
  for (const item of raw.sort((a,b) => a.price - b.price)) {
    const cluster = clusters.find(entry => entry.kind === item.kind && Math.abs(entry.price - item.price) <= tolerance);
    if (cluster) { cluster.price = (cluster.price * cluster.touches + item.price) / (cluster.touches + 1); cluster.touches++; cluster.holds += item.held ? 1 : 0; cluster.times.push(item.time); if (weight[item.timeframe] > weight[cluster.timeframe]) cluster.timeframe = item.timeframe; }
    else clusters.push({ price: item.price, kind: item.kind, timeframe: item.timeframe, times: [item.time], holds: item.held ? 1 : 0, touches: 1 });
  }
  const now = Date.now(); const levels = clusters.map(item => { const lastTest = item.times.sort().at(-1)!; const ageDays = Math.max(0, (now - Date.parse(lastTest)) / 86_400_000); const recency = ageDays < 14 ? 2 : ageDays < 90 ? 1 : 0; const rejection = item.holds / item.touches; return { price: round(item.price), kind: item.kind, timeframe: item.timeframe, touches: item.touches, holds: item.holds, lastTest, strength: Math.min(10, round(weight[item.timeframe] + Math.min(item.touches, 3) + rejection * 2 + recency, 1)) }; }).filter(item => item.strength >= 5).sort((a,b) => b.strength - a.strength);
  const support = levels.filter(item => item.price < current).sort((a,b) => b.price - a.price)[0] ?? null; const resistance = levels.filter(item => item.price > current).sort((a,b) => a.price - b.price)[0] ?? null;
  const last = live.at(-1)!; const range = Math.max(last.high - last.low, .0001); const supportReject = !!support && last.low <= support.price + tolerance && last.close > support.price && (last.close - last.low) / range >= .65; const resistanceReject = !!resistance && last.high >= resistance.price - tolerance && last.close < resistance.price && (last.high - last.close) / range >= .65;
  const breached = (!!support && last.close < support.price - currentAtr * .25) || (!!resistance && last.close > resistance.price + currentAtr * .25);
  const bias: PillarBias = supportReject ? "bullish" : resistanceReject ? "bearish" : "neutral"; const state = breached ? "at-risk" : supportReject ? "support-holding" : resistanceReject ? "resistance-holding" : "neutral";
  const triggerPrice = supportReject || resistanceReject ? round(last.close) : null; const invalidationPrice = supportReject && support ? round(support.price - currentAtr * .25) : resistanceReject && resistance ? round(resistance.price + currentAtr * .25) : null; const targetPrice = supportReject ? resistance?.price ?? null : resistanceReject ? support?.price ?? null : null;
  const riskDistance = triggerPrice !== null && invalidationPrice !== null ? Math.abs(triggerPrice - invalidationPrice) : 0; const rewardRisk = riskDistance && targetPrice !== null ? round(Math.abs(targetPrice - triggerPrice!) / riskDistance) : null;
  const similar = levels.filter(item => Math.abs(item.strength - (supportReject ? support?.strength ?? 0 : resistance?.strength ?? 0)) <= 1); const hitRateSample = similar.reduce((sum,item) => sum + item.touches, 0); const historicalHitRate = hitRateSample ? round(similar.reduce((sum,item) => sum + item.holds, 0) / hitRateSample * 100, 1) : null;
  const ranges = live.slice(-240).map((bar,index,items) => index ? Math.max(bar.high-bar.low, Math.abs(bar.high-items[index-1].close), Math.abs(bar.low-items[index-1].close)) : bar.high-bar.low); const expectedHourlyRange = ranges.length ? round(ranges.reduce((sum,value)=>sum+value,0)/ranges.length) : null;
  return { state, levels: levels.slice(0, 20), support, resistance, distanceToSupportAtr: support ? round((current-support.price)/currentAtr) : null, distanceToResistanceAtr: resistance ? round((resistance.price-current)/currentAtr) : null, rejectionConfirmed: supportReject || resistanceReject, triggerPrice, invalidationPrice, targetPrice, rewardRisk, expectedHourlyRange, historicalHitRate, hitRateSample, bias, score: bias === "bullish" ? 2 : bias === "bearish" ? -2 : 0, confidence: Math.min(85, Math.round(((support?.strength ?? 0)+(resistance?.strength ?? 0))*4)), summary: support && resistance ? `${state}; support ${support.price}, resistance ${resistance.price}` : "No qualifying two-sided structure around price", evidence: [support ? `Support ${support.price} (${support.timeframe}, strength ${support.strength}/10, ${support.touches} touches)` : "No qualifying support", resistance ? `Resistance ${resistance.price} (${resistance.timeframe}, strength ${resistance.strength}/10, ${resistance.touches} touches)` : "No qualifying resistance"], warnings: ["A level touch is not confirmation; a completed-candle rejection is required", "Historical hold rate is a frequency, not a forecast"] };
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

export function decide(fundamental: PillarResult, technical: PillarResult, volume: ReturnType<typeof volumePillar>, fresh: boolean, structure?: StructureResult, minimumRewardRisk = 1.5) {
  const available = [fundamental, technical, volume].filter(item => item.bias !== "unavailable");
  const bulls = available.filter(item => item.bias === "bullish").length;
  const bears = available.filter(item => item.bias === "bearish").length;
  const direction = bulls >= 2 ? "bullish" : bears >= 2 ? "bearish" : "neutral";
  const blockers = [
    ...(!fresh ? ["Market data is stale"] : []),
    ...(available.length < 2 ? ["Fewer than two pillars are available"] : []),
    ...(direction === "neutral" ? ["At least two pillars do not align"] : []),
    ...(volume.available && direction !== "neutral" && volume.bias !== "neutral" && volume.bias !== direction ? ["Volume/Wyckoff opposes the direction"] : []),
    ...(structure && !structure.rejectionConfirmed ? ["No completed-candle rejection at a qualifying structural level"] : []),
    ...(structure?.rejectionConfirmed && structure.bias !== direction ? ["Structure rejection opposes the other pillars"] : []),
    ...(structure?.rewardRisk !== null && structure?.rewardRisk !== undefined && structure.rewardRisk < minimumRewardRisk ? [`Structural target offers only ${structure.rewardRisk}R; minimum is ${minimumRewardRisk}R`] : []),
  ];
  const confirmed = blockers.length === 0 && volume.available && volume.bias === direction && Math.abs(technical.score) >= 3 && (!structure || (structure.rejectionConfirmed && structure.bias === direction));
  const state = blockers.length ? "NO TRADE" : confirmed ? direction === "bullish" ? "LONG SETUP CONFIRMED" : "SHORT SETUP CONFIRMED" : direction === "bullish" ? "WATCH LONG" : direction === "bearish" ? "WATCH SHORT" : "NO TRADE";
  return { state, bias: direction, confidence: Math.round(available.reduce((sum, item) => sum + item.confidence, 0) / Math.max(available.length, 1)), blockers, trigger: structure?.triggerPrice ?? (direction === "bullish" ? "Wait for a completed-candle break or higher-low confirmation" : direction === "bearish" ? "Wait for a completed-candle break or lower-high confirmation" : "Wait for two pillars to align"), invalidation: structure?.invalidationPrice ?? (direction === "bullish" ? "Below the latest structural swing low" : direction === "bearish" ? "Above the latest structural swing high" : "Unavailable until direction forms"), target: structure?.targetPrice ?? null, rewardRisk: structure?.rewardRisk ?? null };
}

export function demoCandles(count = 220, intervalMinutes = 60): LabCandle[] {
  let price = 2325;
  return Array.from({ length: count }, (_, index) => {
    const cycle = Math.sin(index / 11) * 3.2 + Math.sin(index / 37) * 6;
    const drift = index * .09;
    const open = price; const close = 2325 + drift + cycle; price = close;
    const spread = 2.2 + Math.abs(Math.sin(index / 5)) * 2;
    return { time: new Date(Date.UTC(2026, 0, 1) + index * intervalMinutes * 60_000).toISOString(), open: round(open), high: round(Math.max(open, close) + spread), low: round(Math.min(open, close) - spread), close: round(close), volume: Math.round(900 + Math.abs(Math.sin(index / 7)) * 600 + (index % 43 === 0 ? 1200 : 0)) };
  });
}

type StrategyRule = { left: string; operator: string; right: unknown; timeframe?: string };
type ConditionGroup = { logic: "all" | "any"; conditions: Array<StrategyRule | ConditionGroup> };
type StrategyDefinition = { direction?: "long" | "short" | "both"; entry?: ConditionGroup; longEntry?: ConditionGroup; shortEntry?: ConditionGroup };
export type BacktestConfig = { initialCapital: number; riskPct: number; stopAtr: number; rewardRisk: number; commission: number; slippage: number; entryMode?: "swing" | "reversal" | "momentum"; strategy?: StrategyDefinition; progressive?: { multiplier: number; maxIncreases: number } };

export function aggregateCandles(candles: LabCandle[], hours: number) {
  const groups: LabCandle[] = [];
  for (let index = 0; index < candles.length; index += hours) {
    const chunk = candles.slice(index, index + hours); if (!chunk.length) continue;
    groups.push({ time: chunk[0].time, open: chunk[0].open, high: Math.max(...chunk.map(item => item.high)), low: Math.min(...chunk.map(item => item.low)), close: chunk.at(-1)!.close, volume: chunk.every(item => item.volume === null) ? null : chunk.reduce((sum,item) => sum + (item.volume ?? 0), 0) });
  }
  return groups;
}

export function buildStructureHistories(h1: LabCandle[]) {
  return { H1: h1, H4: aggregateCandles(h1, 4), D1: aggregateCandles(h1, 24) };
}

function operandValue(name: unknown, candles: LabCandle[], index: number): number | string | boolean | null {
  if (typeof name !== "string") return typeof name === "number" || typeof name === "boolean" ? name : null;
  if (["open", "high", "low", "close"].includes(name)) return candles[index]?.[name as "open" | "high" | "low" | "close"] ?? null;
  if (["nearest_support", "nearest_resistance", "distance_to_support_atr", "distance_to_resistance_atr", "structure_hit_rate"].includes(name)) {
    const slice = candles.slice(0, index + 1); const structure = structurePillar(buildStructureHistories(slice), slice);
    return name === "nearest_support" ? structure.support?.price ?? null : name === "nearest_resistance" ? structure.resistance?.price ?? null : name === "distance_to_support_atr" ? structure.distanceToSupportAtr : name === "distance_to_resistance_atr" ? structure.distanceToResistanceAtr : structure.historicalHitRate;
  }
  const match = name.match(/^(ema|rsi|rolling_high|rolling_low)_(\d+)$/);
  if (!match) return name;
  const period = Number(match[2]);
  const slice = candles.slice(0, index + 1); const closes = slice.map(item => item.close);
  if (match[1] === "ema") return ema(closes, period).at(-1) ?? null;
  if (match[1] === "rsi") return rsi(closes, period);
  const window = slice.slice(-period - 1, -1);
  if (!window.length) return null;
  return match[1] === "rolling_high" ? Math.max(...window.map(item => item.high)) : Math.min(...window.map(item => item.low));
}

function rulePasses(rule: StrategyRule, candles: LabCandle[], index: number) {
  const left = operandValue(rule.left, candles, index); const right = Array.isArray(rule.right) ? rule.right.map(item => operandValue(item, candles, index)) : operandValue(rule.right, candles, index);
  if (typeof left !== "number") return false;
  if (rule.operator === "between" && Array.isArray(right)) return left >= Number(right[0]) && left <= Number(right[1]);
  if (typeof right !== "number") return false;
  if (rule.operator === "gt") return left > right; if (rule.operator === "gte") return left >= right; if (rule.operator === "lt") return left < right; if (rule.operator === "lte") return left <= right; if (rule.operator === "eq") return left === right;
  const previousLeft = operandValue(rule.left, candles, index - 1); const previousRight = operandValue(rule.right, candles, index - 1);
  if (typeof previousLeft !== "number" || typeof previousRight !== "number") return false;
  return rule.operator === "crosses_above" ? previousLeft <= previousRight && left > right : rule.operator === "crosses_below" ? previousLeft >= previousRight && left < right : false;
}

function groupPasses(group: ConditionGroup | undefined, candles: LabCandle[], index: number): boolean {
  if (!group) return false;
  const values = group.conditions.map(item => item && "conditions" in item ? groupPasses(item as ConditionGroup, candles, index) : rulePasses(item as StrategyRule, candles, index));
  return group.logic === "all" ? values.every(Boolean) : values.some(Boolean);
}
export function runBacktest(candles: LabCandle[], config: BacktestConfig) {
  if (candles.length < 60) throw new Error("At least 60 candles are required for a backtest.");
  if (config.strategy?.direction === "both" && (!config.strategy.longEntry || !config.strategy.shortEntry)) throw new Error("Both-direction strategies require separate long and short entry rules.");
  const closes = candles.map(item => item.close); const fast = ema(closes, 20); const slow = ema(closes, 50);
  let balance = config.initialCapital; let peak = balance; let maxDrawdown = 0; let lossStreak = 0;
  const trades: any[] = []; const curve = [{ time: candles[50].time, balance }];
  for (let index = 51; index < candles.length - 1; index++) {
    const currentRsi = rsi(closes.slice(0, index + 1));
    const recent = candles.slice(index - 20, index);
    const previousHigh = Math.max(...recent.map(item => item.high));
    const previousLow = Math.min(...recent.map(item => item.low));
    const customStrategy = config.strategy && (config.strategy.entry || config.strategy.longEntry || config.strategy.shortEntry);
    const signals = customStrategy
      ? { long: config.strategy?.direction !== "short" && groupPasses(config.strategy?.direction === "both" ? config.strategy.longEntry : config.strategy?.entry, candles, index), short: config.strategy?.direction !== "long" && groupPasses(config.strategy?.direction === "both" ? config.strategy.shortEntry : config.strategy?.entry, candles, index) }
      : config.entryMode === "reversal"
      ? { long: (currentRsi ?? 50) < 32 && closes[index] > candles[index].low + (candles[index].high - candles[index].low) * .6, short: (currentRsi ?? 50) > 68 && closes[index] < candles[index].low + (candles[index].high - candles[index].low) * .4 }
      : config.entryMode === "momentum"
        ? { long: closes[index] > previousHigh && fast[index] > slow[index], short: closes[index] < previousLow && fast[index] < slow[index] }
        : { long: fast[index - 1] <= slow[index - 1] && fast[index] > slow[index], short: fast[index - 1] >= slow[index - 1] && fast[index] < slow[index] };
    if (!signals.long && !signals.short) continue;
    const direction = signals.long ? "long" : "short"; const entry = candles[index + 1].open + (direction === "long" ? config.slippage : -config.slippage);
    const structureSlice = candles.slice(0, index + 1); const structure = structurePillar(buildStructureHistories(structureSlice), structureSlice);
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
    trades.push({ direction, entryTime: candles[index + 1].time, exitTime: candles[exitIndex].time, entryPrice: round(entry), exitPrice: round(exit), size: round(size, 4), pnl: round(pnl), rMultiple: round(pnl / risk), fees, exitReason: reason, structure: { support: structure.support?.price ?? null, resistance: structure.resistance?.price ?? null, rejectionConfirmed: structure.rejectionConfirmed, historicalHitRate: structure.historicalHitRate, hitRateSample: structure.hitRateSample, levels: structure.levels } });
    curve.push({ time: candles[exitIndex].time, balance: round(balance) });
  }
  const wins = trades.filter(item => item.pnl > 0); const losses = trades.filter(item => item.pnl <= 0);
  const grossProfit = wins.reduce((sum, item) => sum + item.pnl, 0); const grossLoss = Math.abs(losses.reduce((sum, item) => sum + item.pnl, 0));
  return { metrics: { initialCapital: config.initialCapital, finalCapital: round(balance), netReturnPct: round((balance / config.initialCapital - 1) * 100), totalTrades: trades.length, winRate: trades.length ? round(wins.length / trades.length * 100, 1) : 0, profitFactor: grossLoss ? round(grossProfit / grossLoss) : null, expectancy: trades.length ? round((balance - config.initialCapital) / trades.length) : 0, maxDrawdown: round(maxDrawdown), maxDrawdownPct: peak ? round(maxDrawdown / peak * 100) : 0 }, trades, equityCurve: curve };
}
