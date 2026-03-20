import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ── OHLCV fetching ─────────────────────────────────────────────────────────────
async function fetchOHLCV(symbol: string, interval: string, outputsize: number) {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) return null;

  try {
    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=${outputsize}&apikey=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status === "error" || !data.values) return null;
    return (data.values as any[]).reverse().map((v: any) => ({
      time: v.datetime,
      open: parseFloat(v.open),
      high: parseFloat(v.high),
      low: parseFloat(v.low),
      close: parseFloat(v.close),
      volume: parseFloat(v.volume ?? 0),
    }));
  } catch {
    return null;
  }
}

// ── Technical indicators ───────────────────────────────────────────────────────
function calcRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.round((100 - 100 / (1 + rs)) * 10) / 10;
}

function calcEMA(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    ema.push(values[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

function calcMACD(closes: number[]) {
  if (closes.length < 35) return { histogram: 0, crossingUp: false, crossingDown: false };
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signal = calcEMA(macdLine.slice(-9), 9);
  const hist = macdLine[macdLine.length - 1] - signal[signal.length - 1];
  const prevHist = macdLine[macdLine.length - 2] - signal[signal.length - 2];
  return {
    histogram: Math.round(hist * 10000) / 10000,
    crossingUp: prevHist <= 0 && hist > 0,
    crossingDown: prevHist >= 0 && hist < 0,
  };
}

// ── VSA analysis ───────────────────────────────────────────────────────────────
function calcVSA(candles: any[]) {
  if (!candles.length) return null;
  const recent = candles.slice(-20);
  const volumes = recent.map(c => c.volume || 1);
  const spreads = recent.map(c => c.high - c.low);
  const avgVol = volumes.reduce((a, b) => a + b, 0) / volumes.length;
  const avgSpread = spreads.reduce((a, b) => a + b, 0) / spreads.length;

  const last = candles[candles.length - 1];
  const spread = last.high - last.low;
  const volumeRatio = avgVol > 0 ? Math.round((last.volume / avgVol) * 100) / 100 : 1;
  const isVolumeSpike = volumeRatio >= 1.8;
  const isWideSpread = spread > avgSpread * 1.5;
  const isClimatic = isVolumeSpike && isWideSpread;

  // Failure signals
  const range = last.high - last.low;
  const closedOffHighs = range > 0 && (last.high - last.close) / range > 0.65; // closed in lower 35%
  const closedOffLows = range > 0 && (last.close - last.low) / range > 0.65;   // closed in upper 65%

  // No demand / no supply (narrow spread, low volume)
  const noDemand = !isVolumeSpike && !isWideSpread && last.close > last.open && volumeRatio < 0.7;
  const noSupply = !isVolumeSpike && !isWideSpread && last.close < last.open && volumeRatio < 0.7;

  return {
    volumeRatio,
    isVolumeSpike,
    isWideSpread,
    isClimatic,
    closedOffHighs,
    closedOffLows,
    noDemand,
    noSupply,
    spread: Math.round(spread * 100) / 100,
    avgSpread: Math.round(avgSpread * 100) / 100,
  };
}

// ── Support/resistance levels ──────────────────────────────────────────────────
function calcLevels(candles: any[]) {
  if (candles.length < 10) return { supports: [], resistances: [] };
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const currentPrice = candles[candles.length - 1].close;

  // Find pivot highs and lows (simple: local hi/lo over 5-bar window)
  const pivotHighs: number[] = [];
  const pivotLows: number[] = [];

  for (let i = 2; i < candles.length - 2; i++) {
    if (highs[i] > highs[i-1] && highs[i] > highs[i-2] && highs[i] > highs[i+1] && highs[i] > highs[i+2]) {
      pivotHighs.push(highs[i]);
    }
    if (lows[i] < lows[i-1] && lows[i] < lows[i-2] && lows[i] < lows[i+1] && lows[i] < lows[i+2]) {
      pivotLows.push(lows[i]);
    }
  }

  // Filter to nearest 3 levels above and below current price
  const supports = pivotLows
    .filter(p => p < currentPrice)
    .sort((a, b) => b - a)
    .slice(0, 3)
    .map(p => Math.round(p * 100) / 100);

  const resistances = pivotHighs
    .filter(p => p > currentPrice)
    .sort((a, b) => a - b)
    .slice(0, 3)
    .map(p => Math.round(p * 100) / 100);

  return { supports, resistances };
}

// ── Signal detection ───────────────────────────────────────────────────────────
function detectSignal(candles: any[], rsi: number, macd: any, vsa: any, levels: any) {
  if (!candles.length || !vsa) return null;

  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const currentPrice = last.close;

  const nearSupport = levels.supports.some((s: number) => Math.abs(currentPrice - s) / currentPrice < 0.003);
  const nearResistance = levels.resistances.some((r: number) => Math.abs(currentPrice - r) / currentPrice < 0.003);

  // Reversal long: at support, climactic sell, closed off lows, RSI oversold
  if (nearSupport && vsa.isClimatic && vsa.closedOffLows && rsi < 40) {
    const strength = Math.min(95, 55 + (vsa.volumeRatio * 10) + (40 - rsi) / 2);
    return { type: "reversal_long", strategy: "reversal", strength: Math.round(strength) };
  }

  // Reversal short: at resistance, climactic buy, closed off highs, RSI overbought
  if (nearResistance && vsa.isClimatic && vsa.closedOffHighs && rsi > 60) {
    const strength = Math.min(95, 55 + (vsa.volumeRatio * 10) + (rsi - 60) / 2);
    return { type: "reversal_short", strategy: "reversal", strength: Math.round(strength) };
  }

  // Momentum long: MACD crossing up, volume above average, bullish structure
  if (macd.crossingUp && vsa.volumeRatio > 1.2 && last.close > prev.high) {
    const strength = Math.min(90, 50 + vsa.volumeRatio * 8 + (macd.histogram > 0 ? 5 : 0));
    return { type: "momentum_long", strategy: "momentum", strength: Math.round(strength) };
  }

  // Momentum short: MACD crossing down, volume above average, bearish structure
  if (macd.crossingDown && vsa.volumeRatio > 1.2 && last.close < prev.low) {
    const strength = Math.min(90, 50 + vsa.volumeRatio * 8 + (macd.histogram < 0 ? 5 : 0));
    return { type: "momentum_short", strategy: "momentum", strength: Math.round(strength) };
  }

  return null;
}

// ── Position sizing (for step ladder, default $10 start) ──────────────────────
function calcPositionSize(currentPrice: number, ladderAmount: number, symbolType: string) {
  const riskPct = 0.02; // 2% risk per trade
  const riskUSD = Math.round(ladderAmount * riskPct * 100) / 100;

  // SL distance depends on asset type
  const slPips = symbolType === "gold" ? 20 : symbolType === "crypto" ? 2 : 15; // in price units for simplicity
  const slDistance = symbolType === "gold" ? slPips : (currentPrice * 0.015); // ~1.5% for crypto

  // Lot size calculation (simplified; for gold: pip value ≈ $1/lot/pip)
  const lotSize = symbolType === "gold"
    ? Math.max(0.01, Math.round((riskUSD / (slPips * 1)) * 100) / 100)
    : Math.max(0.01, Math.round((riskUSD / slDistance) * 1000) / 1000);

  const rewardUSD_1R5 = Math.round(riskUSD * 1.5 * 100) / 100;
  const rewardUSD_2R = Math.round(riskUSD * 2 * 100) / 100;
  const tp1 = Math.round((currentPrice + slDistance * 1.5) * 100) / 100;

  return { lotSize, riskUSD, rewardUSD_1R5, rewardUSD_2R, tp1 };
}

// ── Route handler ──────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const symbol = req.nextUrl.searchParams.get("symbol") ?? "XAU/USD";

    // Determine asset type for position sizing
    const symbolType = symbol.includes("XAU") ? "gold"
      : symbol.includes("XAG") ? "silver"
      : symbol.includes("BTC") || symbol.includes("ETH") ? "crypto"
      : "forex";

    // Fetch OHLCV
    const candles = await fetchOHLCV(symbol, "1h", 50);

    if (!candles || candles.length < 10) {
      return NextResponse.json({
        configured: false,
        symbol,
        message: "Add TWELVE_DATA_API_KEY to Vercel environment to enable live chart and signals",
        candles: [],
        currentPrice: null,
        rsi: null,
        macd: null,
        vsa: null,
        signal: null,
        levels: { supports: [], resistances: [] },
        positionSize: null,
      });
    }

    const closes = candles.map(c => c.close);
    const currentPrice = closes[closes.length - 1];

    const rsi = calcRSI(closes);
    const macd = calcMACD(closes);
    const vsa = calcVSA(candles);
    const levels = calcLevels(candles);
    const signal = detectSignal(candles, rsi, macd, vsa!, levels);

    // Get active ladder step for position sizing
    const { data: ladderStep } = await supabase
      .from("trading_ladder")
      .select("target_amount,step_number")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    const capital = ladderStep?.target_amount ?? 10;
    const positionSize = calcPositionSize(currentPrice, capital, symbolType);

    return NextResponse.json({
      configured: true,
      symbol,
      currentPrice,
      rsi,
      macd,
      vsa,
      signal,
      levels,
      positionSize,
      ladder: ladderStep,
      candles,
    });
  } catch (err: any) {
    console.error("[trading/signals]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
