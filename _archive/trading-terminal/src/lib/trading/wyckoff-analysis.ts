type Candle = { open: number; high: number; low: number; close: number; volume: number };

export function analyzeWyckoff(candles: Candle[]) {
  if (candles.length < 20) return { phase: "Insufficient data", event: "Unclassified", confidence: 0, bias: "neutral", evidence: [], invalidation: "Wait for at least 20 completed candles", manualConfirmationRequired: true };
  const recent = candles.slice(-20);
  const last = recent[recent.length - 1];
  const prior = recent.slice(0, -1);
  const rangeHigh = Math.max(...prior.map((c) => c.high));
  const rangeLow = Math.min(...prior.map((c) => c.low));
  const avgVolume = prior.reduce((sum, c) => sum + (c.volume || 0), 0) / prior.length;
  const avgSpread = prior.reduce((sum, c) => sum + (c.high - c.low), 0) / prior.length;
  const volumeRatio = avgVolume ? last.volume / avgVolume : 0;
  const spreadRatio = avgSpread ? (last.high - last.low) / avgSpread : 0;
  const closeLocation = last.high === last.low ? 0.5 : (last.close - last.low) / (last.high - last.low);
  const spring = last.low < rangeLow && last.close > rangeLow && closeLocation > 0.55;
  const upthrust = last.high > rangeHigh && last.close < rangeHigh && closeLocation < 0.45;
  const sos = last.close > rangeHigh && volumeRatio >= 1.15 && closeLocation > 0.65;
  const sow = last.close < rangeLow && volumeRatio >= 1.15 && closeLocation < 0.35;
  const evidence: string[] = [];
  let event = "Range development"; let phase = "Phase B"; let bias = "neutral"; let confidence = 42;
  if (spring) { event = "Possible spring"; phase = "Possible Phase C accumulation"; bias = "bullish"; confidence = 68; evidence.push("Price moved below the recent range and closed back inside"); }
  else if (upthrust) { event = "Possible upthrust / UTAD"; phase = "Possible Phase C distribution"; bias = "bearish"; confidence = 68; evidence.push("Price moved above the recent range and closed back inside"); }
  else if (sos) { event = "Possible sign of strength"; phase = "Possible Phase D accumulation"; bias = "bullish"; confidence = 64; evidence.push("Close above the recent range with above-average volume"); }
  else if (sow) { event = "Possible sign of weakness"; phase = "Possible Phase D distribution"; bias = "bearish"; confidence = 64; evidence.push("Close below the recent range with above-average volume"); }
  else evidence.push("Price remains within the recent 20-candle range");
  evidence.push(`Volume ${volumeRatio.toFixed(2)}× average; spread ${spreadRatio.toFixed(2)}× average`);
  const invalidation = bias === "bullish" ? `Close below ${rangeLow.toFixed(2)}` : bias === "bearish" ? `Close above ${rangeHigh.toFixed(2)}` : `Confirmed break outside ${rangeLow.toFixed(2)}–${rangeHigh.toFixed(2)}`;
  return { phase, event, confidence, bias, evidence, invalidation, rangeHigh, rangeLow, manualConfirmationRequired: true };
}
