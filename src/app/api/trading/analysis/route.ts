import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { type, question, currentPrice, signalData, instrument } = await req.json();
    const symbol = instrument ?? "XAU/USD";
    const assetName = symbol.includes("XAU") ? "Gold"
      : symbol.includes("XAG") ? "Silver"
      : symbol.includes("BTC") ? "Bitcoin"
      : symbol.includes("ETH") ? "Ethereum"
      : symbol.replace("/USD", "").replace("/", " ");

    // ── Fundamental: GPT-4.1 + web search ─────────────────────────────────────
    if (type === "fundamental") {
      let content = "";
      const citations: any[] = [];

      try {
        const response = await openai.responses.create({
          model: "gpt-4.1",
          tools: [{ type: "web_search_preview" as any }],
          instructions: `You are a ${assetName} market fundamental analyst. Research and provide concise, actionable data.
For gold: focus on CME open interest, COT positioning, DXY, Fed policy, inflation.
For crypto: focus on exchange flows, funding rates, on-chain data, macro sentiment.
For silver: focus on industrial demand, gold/silver ratio, COT data.
Always include: current bias (bullish/bearish/neutral), specific numbers, and what it means for the asset price.`,
          input: question ?? `What is the current fundamental outlook for ${assetName} (${symbol})? Include positioning data, macro factors, and key upcoming events.`,
        } as any);

        for (const item of (response as any).output ?? []) {
          if (item.type === "message") {
            for (const block of item.content ?? []) {
              if (block.type === "output_text") {
                content += block.text ?? "";
                for (const ann of block.annotations ?? []) {
                  if (ann.type === "url_citation") citations.push({ title: ann.title, url: ann.url });
                }
              }
            }
          }
        }
      } catch {
        // Fallback to regular chat if Responses API is unavailable
        const fallback = await openai.chat.completions.create({
          model: "gpt-4.1",
          messages: [
            {
              role: "system",
              content: `You are a ${assetName} fundamental analyst. Provide current market analysis with key data points, macro context, and a clear directional bias.`,
            },
            {
              role: "user",
              content: question ?? `Current fundamental outlook for ${assetName} (${symbol}). Include macro factors, positioning data, and price bias.`,
            },
          ],
          max_tokens: 1000,
        });
        content = fallback.choices[0]?.message?.content ?? "Unable to fetch analysis.";
      }

      await supabase.from("trading_analysis").insert({
        user_id: user.id,
        analysis_type: "fundamental",
        instrument: symbol.replace("/", ""),
        content,
        data_sources: citations,
        bias: content.toLowerCase().includes("bullish") ? "bullish"
          : content.toLowerCase().includes("bearish") ? "bearish" : "neutral",
      }).then(() => {}, () => {});

      return NextResponse.json({ content, citations, type: "fundamental" });
    }

    // ── Decision: GPT-4.1 with full strategy context ───────────────────────────
    if (type === "decision") {
      const isCrypto = symbol.includes("BTC") || symbol.includes("ETH");
      const isGold = symbol.includes("XAU");

      const strategyContext = `
THE TRADER'S SYSTEM FOR ${assetName} (${symbol}):

STRATEGY 1: REVERSAL (VSA Sniper)
- Entry ONLY at clear extremes (session high/low, obvious range boundaries)
- ALL required: climactic behavior + volume spike + failure candle (closes off highs/lows) + confirmation candle
- Stop: above extreme high (short) or below extreme low (long). Fixed — never move.
- TP: 1.5R or 2R fixed. No trailing, no break-even, no partials.
- NO TRADE if: trend is clean, no volume spike, no failure signal, just "moving nicely"

STRATEGY 2: MOMENTUM DISCIPLINE (Flow)
- Entry ONLY after: break + 2-candle acceptance + wide spread/high volume breakout + HH/HL structure + pullback (small candles, low volume)
- Entry: on 1m/5m trigger after pullback. NEVER on breakout candle.
- Stop: below pullback low (long) or above pullback high (short). Fixed.
- TP: 1.5R or 2R fixed only.
- NO TRADE if: no pullback, weak breakout volume, choppy

GLOBAL RULES:
- Max 1-2 trades per session. One trade = one idea.
- No mid-trade changes whatsoever.
- Pre-trade checklist: Location valid? Volume confirms? Structure valid? Confirmation present? Clean RR? → ALL YES or NO TRADE.
- Missing trades IS part of the system.
${isGold ? "\nADDITIONAL CONTEXT: Gold responds strongly to DXY, Fed speakers, and geopolitical events." : ""}
${isCrypto ? "\nADDITIONAL CONTEXT: Crypto needs extra confirmation — high false breakout rate. Prefer reversal strategy at round numbers/key levels." : ""}`;

      const systemPrompt = `You are a strict trading coach for ${assetName} (${symbol}).
${strategyContext}

Current market data:
- Price: $${currentPrice ?? "unknown"}
- RSI: ${signalData?.rsi ?? "unknown"}
- MACD histogram: ${signalData?.macd?.histogram ?? "unknown"} (${signalData?.macd?.crossingUp ? "crossing UP" : signalData?.macd?.crossingDown ? "crossing DOWN" : "no cross"})
- Volume ratio: ${signalData?.vsa?.volumeRatio ?? "unknown"}x average
- VSA state: ${signalData?.vsa?.isClimatic ? "CLIMACTIC" : signalData?.vsa?.noDemand ? "NO DEMAND" : signalData?.vsa?.noSupply ? "NO SUPPLY" : "NEUTRAL"}
- Signal detected: ${signalData?.signal ? `${signalData.signal.type} (${signalData.signal.strength}% strength)` : "none"}
- Support: ${signalData?.levels?.supports?.join(", ") ?? "unknown"}
- Resistance: ${signalData?.levels?.resistances?.join(", ") ?? "unknown"}

YOUR RESPONSE:
1. State clearly: TRADE or NO TRADE
2. Which strategy applies (if any)
3. Which exact conditions are met and which are missing
4. If trade: exact entry zone, stop, TP levels
5. If no trade: what you need to see before a setup exists
Be specific and strict. Never encourage a trade that doesn't meet ALL criteria.`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4.1",
        max_tokens: 800,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: question ?? `Based on current ${assetName} conditions, should I look for a trade? Apply my exact strategy rules.` },
        ],
      });

      const content = completion.choices[0]?.message?.content ?? "";

      await supabase.from("trading_analysis").insert({
        user_id: user.id,
        analysis_type: "combined",
        instrument: symbol.replace("/", ""),
        content,
        bias: content.toLowerCase().includes("no trade") ? "neutral"
          : content.toLowerCase().includes("long") || content.toLowerCase().includes("buy") ? "bullish" : "bearish",
      }).then(() => {}, () => {});

      return NextResponse.json({ content, type: "decision" });
    }

    // ── Technical: GPT-4.1-mini (fast) ────────────────────────────────────────
    if (type === "technical") {
      const completion = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        max_tokens: 600,
        messages: [
          {
            role: "system",
            content: `You are a technical analyst for ${assetName} (${symbol}) on the 1H chart.
Price: $${currentPrice}, RSI: ${signalData?.rsi}, MACD histogram: ${(signalData?.macd?.histogram ?? 0).toFixed(2)}.
VSA: volume ratio ${signalData?.vsa?.volumeRatio}x, spread ${signalData?.vsa?.isWideSpread ? "wide" : "normal"}.
Supports: ${signalData?.levels?.supports?.join(", ")}.
Resistances: ${signalData?.levels?.resistances?.join(", ")}.
Give: 1) Market structure, 2) Key levels to watch, 3) RSI/MACD interpretation, 4) Overall bias. Be concise and specific.`,
          },
          { role: "user", content: question ?? `Technical picture for ${assetName} right now.` },
        ],
      });

      return NextResponse.json({ content: completion.choices[0]?.message?.content ?? "", type: "technical" });
    }

    return NextResponse.json({ error: "Unknown analysis type" }, { status: 400 });
  } catch (err: any) {
    console.error("[trading/analysis]", err);
    return NextResponse.json({ error: err.message ?? "Internal error" }, { status: 500 });
  }
}
