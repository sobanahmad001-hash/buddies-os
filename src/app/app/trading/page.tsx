"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import {
  TrendingUp, TrendingDown, Minus, Send, Plus, Check, X,
  RefreshCw, AlertTriangle, Loader2, ChevronRight,
  BarChart3, Brain, Globe, Zap, Newspaper, Activity, Sparkles
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

// ── Types ─────────────────────────────────────────────────────────────────────
type LadderStep = { id: string; step_number: number; target_amount: number; status: string };
type TradeEntry = { id: string; ladder_step: number; direction: string; entry_price: number; exit_price?: number; result_usd?: number; status: string; opened_at: string; closed_at?: string; lot_size?: number; stop_loss?: number; r_multiple?: number; checklist_passed?: boolean };
type Summary = { id: string; period_type: string; period_start: string; period_end: string; content: string; generated_at: string; stats_snapshot: any };
type NewsItem = { id: string; headline: string; source: string; url: string; datetime: number; summary: string; impact: "HIGH" | "MEDIUM" | "LOW"; assets: string[] };
type Withdrawal = { id: string; ladder_step: number; amount_usd: number; withdrawn_at: string };
type Message = { role: "user" | "assistant"; content: string; type?: "fundamental" | "technical" | "decision" | "chat" };
type SignalData = { configured: boolean; currentPrice: number; rsi: number; macd: any; vsa: any; signal: any; levels: any; positionSize: any; ladder: any; candles: any[] };

// ── Checklist Modal ───────────────────────────────────────────────────────────
type VsaData = { isVolumeSpike: boolean; isWideSpread: boolean; isClimatic: boolean; closedOffHighs: boolean; closedOffLows: boolean; volumeRatio: number };

function buildVsaAutoMap(strategy: "reversal" | "momentum", vsa: VsaData | null | undefined): Record<string, boolean> {
  if (!vsa) return {};
  if (strategy === "reversal") {
    return {
      volume_confirms: vsa.isClimatic,
      structure_valid: vsa.closedOffHighs || vsa.closedOffLows,
    };
  }
  return {
    volume_confirms: vsa.isClimatic,
  };
}

function ChecklistModal({ strategy, onClose, onConfirm, autoResults }: {
  strategy: "reversal" | "momentum";
  onClose: () => void;
  onConfirm: (passed: boolean, checks: any) => void;
  autoResults?: VsaData | null;
}) {
  const autoMap = buildVsaAutoMap(strategy, autoResults);
  const [checks, setChecks] = useState({
    location_valid: autoMap.location_valid ?? false,
    volume_confirms: autoMap.volume_confirms ?? false,
    structure_valid: autoMap.structure_valid ?? false,
    confirmation_present: autoMap.confirmation_present ?? false,
    clean_rr: autoMap.clean_rr ?? false,
  });
  const toggle = (key: string) => setChecks(p => ({ ...p, [key]: !(p as any)[key] }));
  const allPassed = Object.values(checks).every(Boolean);

  const items: Array<{ key: string; label: string; sub: string; autoTooltip?: string }> = strategy === "reversal"
    ? [
        { key: "location_valid", label: "Price at clear EXTREME (session high/low, range boundary)", sub: "Not middle of chart, not after breakout" },
        {
          key: "volume_confirms",
          label: "VOLUME SPIKE above recent bars + climactic behavior",
          sub: "Wide aggressive candles, emotional push, overextended",
          autoTooltip: autoResults
            ? autoResults.isClimatic
              ? `Auto-detected: Volume spike (${autoResults.volumeRatio}x avg) + wide spread \u2713`
              : `Auto: No climactic signal (${autoResults.volumeRatio}x avg volume)`
            : undefined,
        },
        {
          key: "structure_valid",
          label: "FAILURE SIGNAL present",
          sub: "Candle closes off highs (short) or off lows (long) \u2014 effort failed",
          autoTooltip: autoResults
            ? (autoResults.closedOffHighs || autoResults.closedOffLows)
              ? `Auto-detected: Candle closed off ${autoResults.closedOffHighs ? "highs" : "lows"} \u2713`
              : "Auto: No failure candle detected on last bar"
            : undefined,
        },
        { key: "confirmation_present", label: "CONFIRMATION CANDLE next", sub: "Next candle confirms reversal \u2014 no confirmation = no trade" },
        { key: "clean_rr", label: "Clean 1.5R\u20132R available", sub: "SL above extreme high (short) or below extreme low (long)" },
      ]
    : [
        { key: "location_valid", label: "BREAK + ACCEPTANCE: held outside range for 2+ candles (5m)", sub: "Not just a wick \u2014 must close and hold" },
        {
          key: "volume_confirms",
          label: "Breakout candle: WIDE SPREAD + HIGH VOLUME",
          sub: "Weak volume = no trade",
          autoTooltip: autoResults
            ? autoResults.isClimatic
              ? `Auto-detected: Wide spread + high volume (${autoResults.volumeRatio}x avg) \u2713`
              : `Auto: No wide-spread/high-volume breakout (${autoResults.volumeRatio}x avg)`
            : undefined,
        },
        { key: "structure_valid", label: "CLEAN STRUCTURE: HH+HL (bull) or LL+LH (bear)", sub: "Choppy = no trade" },
        { key: "confirmation_present", label: "PULLBACK complete: small candles, low volume", sub: "No pullback = no trade. Never enter on breakout candle." },
        { key: "clean_rr", label: "Entry on 1m/5m trigger after pullback, clean 1.5R\u20132R", sub: "SL below pullback low (long) or above pullback high (short)" },
      ];

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#111111] border border-[#2D2D2D] rounded-2xl w-full max-w-[520px] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2D2D2D]">
          <div>
            <h2 className="text-[15px] font-bold text-[#C8C5C0]">Pre-Trade Checklist</h2>
            <p className="text-[11px] text-[#737373] mt-0.5">{strategy === "reversal" ? "⚡ Reversal (VSA Sniper)" : "🌊 Momentum Discipline"} — ALL must be YES</p>
          </div>
          <button onClick={onClose} className="text-[#525252] hover:text-white transition-colors"><X size={16} /></button>
        </div>

        <div className="px-6 py-4 space-y-3">
          {items.map(item => {
            const isAutoTracked = item.autoTooltip !== undefined;
            const autoVal = isAutoTracked ? (autoMap as any)[item.key] as boolean | undefined : undefined;
            return (
              <button key={item.key} onClick={() => toggle(item.key)}
                className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all
                  ${(checks as any)[item.key] ? "bg-[#10B98115] border-[#10B98140]" : "bg-[#1A1A1A] border-[#2D2D2D] hover:border-[#525252]"}`}>
                <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors
                  ${(checks as any)[item.key] ? "bg-[#10B981] border-[#10B981]" : "border-[#525252]"}`}>
                  {(checks as any)[item.key] && <Check size={11} className="text-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-[13px] font-semibold text-[#C8C5C0] leading-snug">{item.label}</p>
                    {isAutoTracked && (
                      <span
                        title={item.autoTooltip}
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 cursor-help
                          ${autoVal
                            ? "bg-[#3B82F620] text-[#3B82F6] border border-[#3B82F630]"
                            : "bg-[#52525215] text-[#525252] border border-[#52525225]"}`}>
                        {autoVal ? "VSA \u2713" : "VSA \u2014"}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#525252] mt-0.5">{item.sub}</p>
                  {isAutoTracked && item.autoTooltip && (
                    <p className="text-[10px] mt-0.5 italic truncate"
                      style={{ color: autoVal ? "#3B82F680" : "#52525280" }}>{item.autoTooltip}</p>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div className="px-6 py-4 border-t border-[#2D2D2D]">
          {!allPassed && (
            <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-[#EF444415] border border-[#EF444430] rounded-lg">
              <AlertTriangle size={13} className="text-[#EF4444] shrink-0" />
              <p className="text-[12px] text-[#EF4444]">Not all conditions met — <strong>NO TRADE</strong> by your rules</p>
            </div>
          )}
          {allPassed && (
            <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-[#10B98115] border border-[#10B98130] rounded-lg">
              <Check size={13} className="text-[#10B981] shrink-0" />
              <p className="text-[12px] text-[#10B981] font-semibold">All conditions met — setup is valid ✓</p>
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={() => onConfirm(allPassed, checks)} disabled={!allPassed}
              className="flex-1 py-2.5 bg-[#B5622A] text-white text-[13px] font-bold rounded-xl hover:bg-[#9A4E20] disabled:opacity-30 transition-colors">
              {allPassed ? "✓ Proceed to Trade" : "Cannot Trade — Rules Not Met"}
            </button>
            <button onClick={onClose}
              className="px-4 py-2.5 bg-[#1E1E1E] text-[#737373] text-[13px] rounded-xl hover:bg-[#2D2D2D] transition-colors">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Log Trade Modal ───────────────────────────────────────────────────────────
function LogTradeModal({ ladder, positionSize, onClose, onSave }: any) {
  const [form, setForm] = useState({
    ladder_step: ladder?.step_number ?? 1,
    direction: "buy",
    entry_price: "",
    lot_size: positionSize?.lotSize?.toString() ?? "0.01",
    stop_loss: "",
    take_profit: positionSize?.tp1?.toString() ?? "",
    notes: "",
    account_type: "demo",
  });

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#111111] border border-[#2D2D2D] rounded-2xl w-full max-w-[440px] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2D2D2D]">
          <h2 className="text-[14px] font-bold text-[#C8C5C0]">Log Trade</h2>
          <button onClick={onClose} className="text-[#525252] hover:text-white"><X size={15} /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-[#525252] uppercase tracking-wider">Direction</label>
              <div className="flex gap-2 mt-1">
                {["buy","sell"].map(d => (
                  <button key={d} onClick={() => setForm(p => ({...p, direction: d}))}
                    className={`flex-1 py-2 rounded-lg text-[12px] font-bold transition-colors
                      ${form.direction === d
                        ? d === "buy" ? "bg-[#10B981] text-white" : "bg-[#EF4444] text-white"
                        : "bg-[#1E1E1E] text-[#737373] hover:bg-[#2D2D2D]"}`}>
                    {d === "buy" ? "▲ LONG" : "▼ SHORT"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-[#525252] uppercase tracking-wider">Account</label>
              <div className="flex gap-2 mt-1">
                {["demo","live"].map(a => (
                  <button key={a} onClick={() => setForm(p => ({...p, account_type: a}))}
                    className={`flex-1 py-2 rounded-lg text-[12px] font-semibold transition-colors capitalize
                      ${form.account_type === a ? "bg-[#B5622A] text-white" : "bg-[#1E1E1E] text-[#737373] hover:bg-[#2D2D2D]"}`}>
                    {a}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {[
            { key: "entry_price", label: "Entry Price" },
            { key: "lot_size", label: "Lot Size" },
            { key: "stop_loss", label: "Stop Loss" },
            { key: "take_profit", label: "Take Profit (1.5R–2R)" },
          ].map(f => (
            <div key={f.key}>
              <label className="text-[10px] font-bold text-[#525252] uppercase tracking-wider">{f.label}</label>
              <input
                value={(form as any)[f.key]}
                onChange={e => setForm(p => ({...p, [f.key]: e.target.value}))}
                placeholder={f.key === "lot_size" ? positionSize?.lotSize?.toString() ?? "0.01" : ""}
                className="w-full mt-1 px-3 py-2 bg-[#0D0D0D] border border-[#2D2D2D] rounded-lg text-[13px] text-[#C8C5C0] focus:outline-none focus:border-[#B5622A] font-mono"
              />
            </div>
          ))}

          {positionSize && (
            <div className="bg-[#0D1220] border border-[#3B82F630] rounded-lg px-3 py-2">
              <p className="text-[10px] font-bold text-[#3B82F6] mb-1">POSITION SIZING (Step {ladder?.step_number}, ${ladder?.target_amount} capital)</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div><p className="text-[11px] text-[#525252]">Risk</p><p className="text-[12px] font-bold text-[#EF4444]">${positionSize.riskUSD}</p></div>
                <div><p className="text-[11px] text-[#525252]">1.5R TP</p><p className="text-[12px] font-bold text-[#10B981]">${positionSize.rewardUSD_1R5}</p></div>
                <div><p className="text-[11px] text-[#525252]">2R TP</p><p className="text-[12px] font-bold text-[#10B981]">${positionSize.rewardUSD_2R}</p></div>
              </div>
            </div>
          )}

          <textarea value={form.notes} onChange={e => setForm(p => ({...p, notes: e.target.value}))}
            placeholder="Setup notes (optional)..."
            rows={2}
            className="w-full px-3 py-2 bg-[#0D0D0D] border border-[#2D2D2D] rounded-lg text-[13px] text-[#C8C5C0] focus:outline-none focus:border-[#B5622A] resize-none"
          />
        </div>
        <div className="px-5 pb-4 flex gap-3">
          <button onClick={() => onSave(form)}
            className="flex-1 py-2.5 bg-[#B5622A] text-white text-[13px] font-bold rounded-xl hover:bg-[#9A4E20] transition-colors">
            Log Trade
          </button>
          <button onClick={onClose}
            className="px-4 py-2.5 bg-[#1E1E1E] text-[#737373] text-[13px] rounded-xl hover:bg-[#2D2D2D] transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Trade Confirm Modal ───────────────────────────────────────────────────────
function TradeConfirmModal({
  form,
  connectedAccount,
  onExecute,
  onLogOnly,
  onClose,
}: {
  form: any;
  connectedAccount: { id: string; account_number: string; server: string } | null;
  onExecute: (mt5Symbol: string) => Promise<string | undefined>;
  onLogOnly: () => void;
  onClose: () => void;
}) {
  // Derive a default MT5 symbol from the instrument — Exness adds 'm' suffix
  const defaultSymbol = (form.instrument ?? "XAUUSDm")
    .replace("/", "")
    .replace(/\s/g, "")
    .replace(/m$/, "") + "m";
  const [mt5Symbol, setMt5Symbol] = useState(defaultSymbol);
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState("");

  async function handleExecute() {
    setPlacing(true);
    setPlaceError("");
    const err = await onExecute(mt5Symbol);
    if (err) setPlaceError(err);
    setPlacing(false);
  }

  const isLong = form.direction === "buy";

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#111111] border border-[#2D2D2D] rounded-2xl w-full max-w-[420px] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2D2D2D]">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isLong ? "bg-[#10B981]" : "bg-[#EF4444]"}`} />
            <h2 className="text-[14px] font-bold text-[#C8C5C0]">Confirm Order</h2>
          </div>
          <button onClick={onClose} className="text-[#525252] hover:text-white"><X size={15} /></button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {/* Direction badge */}
          <div className={`flex items-center justify-center py-2 rounded-lg text-[13px] font-bold
            ${isLong ? "bg-[#10B98115] text-[#10B981] border border-[#10B98130]" : "bg-[#EF444415] text-[#EF4444] border border-[#EF444430]"}`}>
            {isLong ? "▲ LONG / BUY" : "▼ SHORT / SELL"}
          </div>

          {/* Order details */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Lot Size", value: form.lot_size },
              { label: "Entry Price", value: form.entry_price || "Market" },
              { label: "Stop Loss", value: form.stop_loss },
              { label: "Take Profit", value: form.take_profit },
            ].map(item => (
              <div key={item.label} className="bg-[#0D0D0D] rounded-lg px-3 py-2">
                <p className="text-[9px] text-[#525252] uppercase tracking-wider">{item.label}</p>
                <p className="text-[13px] font-bold text-[#C8C5C0] font-mono">{item.value}</p>
              </div>
            ))}
          </div>

          {/* MT5 Symbol — editable */}
          <div>
            <label className="text-[10px] font-bold text-[#525252] uppercase tracking-wider">
              MT5 Symbol <span className="normal-case text-[#3A3A3A]">(e.g. XAUUSDm for Exness gold)</span>
            </label>
            <input
              value={mt5Symbol}
              onChange={e => setMt5Symbol(e.target.value)}
              placeholder="XAUUSDm"
              className="w-full mt-1 px-3 py-2 bg-[#0D0D0D] border border-[#2D2D2D] rounded-lg text-[13px] text-[#C8C5C0] focus:outline-none focus:border-[#B5622A] font-mono"
            />
          </div>

          {/* Executing account */}
          {connectedAccount && (
            <div className="bg-[#0D1220] border border-[#3B82F630] rounded-lg px-3 py-2 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-[#3B82F6]">EXECUTING VIA METAAPI</p>
                <p className="text-[12px] text-[#C8C5C0] font-mono mt-0.5">#{connectedAccount.account_number}</p>
              </div>
              <div className="text-[10px] text-[#525252]">{connectedAccount.server}</div>
            </div>
          )}

          {placeError && (
            <div className="bg-[#EF444415] border border-[#EF444430] rounded-lg px-3 py-2">
              <p className="text-[11px] text-[#EF4444] font-semibold">
                {placeError === "fetch failed"
                  ? "Connection timed out — MetaAPI is slow to wake up. Sync Live first, then retry."
                  : placeError}
              </p>
            </div>
          )}
        </div>

        <div className="px-5 pb-4 space-y-2">
          {connectedAccount && (
            <button
              onClick={handleExecute}
              disabled={placing || !mt5Symbol.trim()}
              className="w-full py-2.5 bg-[#B5622A] text-white text-[13px] font-bold rounded-xl hover:bg-[#9A4E20] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
              {placing ? <Loader2 size={13} className="animate-spin" /> : null}
              {placing ? "Placing order…" : "Place on Exness"}
            </button>
          )}
          <button
            onClick={onLogOnly}
            disabled={placing}
            className="w-full py-2.5 bg-[#1E1E1E] text-[#C8C5C0] text-[13px] font-semibold rounded-xl hover:bg-[#2D2D2D] transition-colors disabled:opacity-50">
            Log to Journal Only
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Mini chart ────────────────────────────────────────────────────────────────
function MiniChart({ candles, levels }: { candles: any[]; levels: any }) {
  if (!candles?.length) return (
    <div className="flex items-center justify-center h-[180px] text-[11px] text-[#525252]">
      Add TWELVE_DATA_API_KEY to enable chart
    </div>
  );

  const W = 600, H = 160, PAD = 20;
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const minP = Math.min(...lows) - 2;
  const maxP = Math.max(...highs) + 2;
  const range = maxP - minP;

  const xScale = (i: number) => PAD + (i / (candles.length - 1)) * (W - PAD * 2);
  const yScale = (p: number) => H - PAD - ((p - minP) / range) * (H - PAD * 2);

  const linePath = candles.map((c, i) =>
    `${i === 0 ? "M" : "L"}${xScale(i).toFixed(1)},${yScale(c.close).toFixed(1)}`
  ).join(" ");

  const areaPath = linePath + ` L${xScale(candles.length-1).toFixed(1)},${H} L${xScale(0).toFixed(1)},${H} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 180 }}>
      <defs>
        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#B5622A" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#B5622A" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#chartGrad)" />
      <path d={linePath} fill="none" stroke="#B5622A" strokeWidth="1.5" />
      {/* Support levels */}
      {(levels?.supports ?? []).map((s: number, i: number) => (
        <line key={`s${i}`} x1={PAD} y1={yScale(s)} x2={W-PAD} y2={yScale(s)} stroke="#10B981" strokeWidth="1" strokeDasharray="4,4" opacity="0.6" />
      ))}
      {/* Resistance levels */}
      {(levels?.resistances ?? []).map((r: number, i: number) => (
        <line key={`r${i}`} x1={PAD} y1={yScale(r)} x2={W-PAD} y2={yScale(r)} stroke="#EF4444" strokeWidth="1" strokeDasharray="4,4" opacity="0.6" />
      ))}
      {/* Current price */}
      <line x1={PAD} y1={yScale(candles[candles.length-1].close)} x2={W-PAD} y2={yScale(candles[candles.length-1].close)} stroke="#C8C5C0" strokeWidth="1" strokeDasharray="2,4" opacity="0.4" />
      {/* Last dot */}
      <circle cx={xScale(candles.length-1)} cy={yScale(candles[candles.length-1].close)} r="3" fill="#B5622A" />
    </svg>
  );
}

// ── Signal Card ───────────────────────────────────────────────────────────────
function SignalCard({ signal, positionSize }: { signal: any; positionSize: any }) {
  if (!signal) return (
    <div className="bg-[#1A1A1A] border border-[#2D2D2D] rounded-xl p-4 text-center">
      <p className="text-[12px] text-[#525252]">No high-probability setup detected</p>
      <p className="text-[10px] text-[#3A3A3A] mt-1">Waiting for conditions to align — missing trades is part of the system</p>
    </div>
  );

  const isLong = signal.type?.includes("long");
  const isReversal = signal.strategy === "reversal";

  return (
    <div className={`rounded-xl border p-4 ${isLong ? "bg-[#10B98110] border-[#10B98140]" : "bg-[#EF444410] border-[#EF444440]"}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full animate-pulse ${isLong ? "bg-[#10B981]" : "bg-[#EF4444]"}`} />
          <span className="text-[12px] font-bold text-[#C8C5C0]">
            {isReversal ? "⚡ REVERSAL" : "🌊 MOMENTUM"} — {isLong ? "LONG" : "SHORT"}
          </span>
        </div>
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${signal.strength >= 80 ? "bg-[#10B98120] text-[#10B981]" : "bg-[#EAB30820] text-[#EAB308]"}`}>
          {signal.strength}% strength
        </span>
      </div>
      {positionSize && (
        <div className="grid grid-cols-4 gap-2 text-center mt-2">
          {[
            { label: "Lot Size", value: positionSize.lotSize, color: "#C8C5C0" },
            { label: "Risk", value: `$${positionSize.riskUSD}`, color: "#EF4444" },
            { label: "TP 1.5R", value: `$${positionSize.rewardUSD_1R5}`, color: "#10B981" },
            { label: "TP 2R", value: `$${positionSize.rewardUSD_2R}`, color: "#10B981" },
          ].map(item => (
            <div key={item.label} className="bg-[#0D0D0D] rounded-lg px-2 py-1.5">
              <p className="text-[9px] text-[#525252] uppercase tracking-wider">{item.label}</p>
              <p className="text-[12px] font-bold" style={{ color: item.color }}>{item.value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Equity Chart ──────────────────────────────────────────────────────────────
function EquityChart({ trades }: { trades: TradeEntry[] }) {
  const closed = [...trades]
    .filter(t => t.status === "closed")
    .sort((a, b) => new Date(a.closed_at || a.opened_at).getTime() - new Date(b.closed_at || b.opened_at).getTime());

  if (closed.length < 2) {
    return (
      <div className="bg-[#111111] border border-[#1E1E1E] rounded-xl p-4 text-center">
        <p className="text-[11px] text-[#525252]">Log at least 2 closed trades to see your equity curve</p>
      </div>
    );
  }

  const curve: number[] = [];
  let running = 0;
  for (const t of closed) { running += t.result_usd ?? 0; curve.push(running); }

  const W = 280, H = 60;
  const minVal = Math.min(0, ...curve);
  const maxVal = Math.max(0, ...curve);
  const range = maxVal - minVal || 1;
  const toX = (i: number) => (i / (curve.length - 1)) * W;
  const toY = (v: number) => H - 4 - ((v - minVal) / range) * (H - 8);
  const pathD = curve.map((v, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(v).toFixed(1)}`).join(" ");
  const lastX = toX(curve.length - 1);
  const lastY = toY(curve[curve.length - 1]);
  const fillD = `${pathD} L ${lastX.toFixed(1)} ${(H - 4).toFixed(1)} L 0 ${(H - 4).toFixed(1)} Z`;
  const final = curve[curve.length - 1];
  const color = final >= 0 ? "#10B981" : "#EF4444";
  const zeroY = toY(0);

  return (
    <div className="bg-[#111111] border border-[#1E1E1E] rounded-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold text-[#737373] uppercase tracking-wider">Equity Curve</p>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[#525252]">{closed.length} trades</span>
          <span className={`text-[12px] font-bold font-mono ${final >= 0 ? "text-[#10B981]" : "text-[#EF4444]"}`}>
            {final >= 0 ? "+" : ""}${final.toFixed(2)}
          </span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 60 }}>
        <defs>
          <linearGradient id="eq-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <line x1="0" y1={zeroY.toFixed(1)} x2={W} y2={zeroY.toFixed(1)} stroke="#2D2D2D" strokeWidth="0.5" strokeDasharray="3 3" />
        <path d={fillD} fill="url(#eq-gradient)" />
        <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={lastX.toFixed(1)} cy={lastY.toFixed(1)} r="2.5" fill={color} />
      </svg>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function TradingPage() {
  const [ladder, setLadder] = useState<LadderStep[]>([]);
  const [entries, setEntries] = useState<TradeEntry[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [goldPrice, setGoldPrice] = useState<number | null>(null);
  const [signalData, setSignalData] = useState<SignalData | null>(null);
  const [signalLoading, setSignalLoading] = useState(false);
  const [activeSymbol, setActiveSymbol] = useState("XAU/USD");
  const [accounts, setAccounts] = useState<any[]>([]);
  const [watchlist, setWatchlist] = useState<any[]>([]);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [accountForm, setAccountForm] = useState({ account_number: "", account_type: "demo", server: "Exness-Trial", balance: "", currency: "USD" });
  const [activeTab, setActiveTab] = useState<"terminal" | "trades" | "journal">("terminal");
  const [analysisTab, setAnalysisTab] = useState<"signal" | "fundamental" | "technical" | "chat">("signal");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [showChecklist, setShowChecklist] = useState<"reversal" | "momentum" | null>(null);
  const [showLogTrade, setShowLogTrade] = useState(false);
  const [analysisContent, setAnalysisContent] = useState<Record<string, string>>({});
  const [analysisLoading, setAnalysisLoading] = useState<Record<string, boolean>>({});
  const [metaApiForm, setMetaApiForm] = useState({ token: "", login: "", password: "", server: "Exness-MT5Trial4" });
  const [showMetaApiForm, setShowMetaApiForm] = useState(false);
  const [syncingAccount, setSyncingAccount] = useState<string | null>(null);
  const [syncErrors, setSyncErrors] = useState<Record<string, string>>({});
  const [connectError, setConnectError] = useState("");
  const [showSymbolSearch, setShowSymbolSearch] = useState(false);
  const [symbolQuery, setSymbolQuery] = useState("");
  const [symbolResults, setSymbolResults] = useState<any[]>([]);
  const [symbolSearching, setSymbolSearching] = useState(false);
  const [editWatchlist, setEditWatchlist] = useState(false);
  const [showTradeConfirm, setShowTradeConfirm] = useState(false);
  const [pendingTrade, setPendingTrade] = useState<any>(null);
  const [serverStats, setServerStats] = useState<any>(null);
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [expandedNews, setExpandedNews] = useState<Set<string>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadAll(); loadAccounts(); loadWatchlist(); loadNews(); loadSummaries(); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function loadAll() {
    const [tradingRes, signalRes] = await Promise.all([
      fetch("/api/trading").then(r => r.json()).catch(() => ({})),
      loadSignals(),
    ]);
    setLadder(tradingRes.ladder ?? []);
    setEntries(tradingRes.entries ?? []);
    setWithdrawals(tradingRes.withdrawals ?? []);
    setGoldPrice(tradingRes.gold_price);
    setServerStats(tradingRes.stats ?? null);
  }

  async function loadAccounts() {
    try {
      const res = await fetch("/api/trading/account");
      const data = await res.json();
      setAccounts(data.accounts ?? []);
    } catch {}
  }

  async function loadWatchlist() {
    const { data } = await supabase.from("trading_watchlist").select("*").order("sort_order");
    setWatchlist(data ?? []);
  }

  async function loadNews() {
    setNewsLoading(true);
    try {
      const res = await fetch("/api/trading/news");
      const data = await res.json();
      setNewsItems(data.news ?? []);
    } catch {}
    setNewsLoading(false);
  }

  async function loadSummaries() {
    try {
      const res = await fetch("/api/trading/summaries");
      const data = await res.json();
      setSummaries(data.summaries ?? []);
    } catch {}
  }

  async function generateSummary(period: "daily" | "weekly" | "manual") {
    setSummaryLoading(true);
    try {
      const res = await fetch("/api/trading/summaries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", period }),
      });
      const data = await res.json();
      if (!data.error) await loadSummaries();
    } catch {}
    setSummaryLoading(false);
  }

  async function searchSymbols(q: string) {
    setSymbolQuery(q);
    if (!q.trim()) { setSymbolResults([]); return; }
    setSymbolSearching(true);
    try {
      const res = await fetch(`/api/trading/symbols?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setSymbolResults(data.results ?? []);
    } catch {}
    setSymbolSearching(false);
  }

  async function addToWatchlist(symbol: string, displayName: string, assetType: string) {
    await fetch("/api/trading/account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add_to_watchlist", symbol, display_name: displayName, asset_type: assetType }),
    });
    setShowSymbolSearch(false);
    setSymbolQuery("");
    setSymbolResults([]);
    await loadWatchlist();
  }

  async function removeFromWatchlist(watchlistId: string) {
    await fetch("/api/trading/account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove_from_watchlist", watchlist_id: watchlistId }),
    });
    await loadWatchlist();
  }

  async function switchSymbol(symbol: string) {
    setActiveSymbol(symbol);
    setSignalData(null);
    setSignalLoading(true);
    try {
      const res = await fetch(`/api/trading/signals?symbol=${encodeURIComponent(symbol)}`);
      const data = await res.json();
      setSignalData(data);
      if (data.currentPrice) setGoldPrice(data.currentPrice);
    } catch {}
    setSignalLoading(false);
  }

  async function addAccount() {
    await fetch("/api/trading/account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "add_account",
        account_number: accountForm.account_number,
        account_type: accountForm.account_type,
        server: accountForm.server,
        balance: parseFloat(accountForm.balance) || 0,
        currency: accountForm.currency,
        broker: "exness",
      }),
    });
    setShowAddAccount(false);
    setAccountForm({ account_number: "", account_type: "demo", server: "Exness-Trial", balance: "", currency: "USD" });
    await loadAccounts();
  }

  async function connectMetaApi() {
    setConnectError("");
    try {
      const res = await fetch("/api/trading/metaapi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "connect", ...metaApiForm }),
      });
      const data = await res.json();
      if (data.error) { setConnectError(data.error); return; }
      setShowAddAccount(false);
      setShowMetaApiForm(false);
      setMetaApiForm({ token: "", login: "", password: "", server: "Exness-MT5Trial4" });
      await loadAccounts();
    } catch (e: any) {
      setConnectError(e.message ?? "Connection failed");
    }
  }

  async function syncMetaApi(accountId: string) {
    setSyncingAccount(accountId);
    setSyncErrors(p => ({ ...p, [accountId]: "" }));
    try {
      const res = await fetch("/api/trading/metaapi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync", account_id: accountId }),
      });
      const data = await res.json();
      if (data.error) {
        setSyncErrors(p => ({ ...p, [accountId]: data.error }));
      } else {
        await loadAccounts();
      }
    } catch (e: any) {
      setSyncErrors(p => ({ ...p, [accountId]: e.message ?? "Network error" }));
    }
    setSyncingAccount(null);
  }

  async function loadSignals() {
    setSignalLoading(true);
    try {
      const res = await fetch(`/api/trading/signals?symbol=${encodeURIComponent(activeSymbol)}`);
      const data = await res.json();
      setSignalData(data);
      if (data.currentPrice) setGoldPrice(data.currentPrice);
    } catch {}
    setSignalLoading(false);
  }

  async function runAnalysis(type: "fundamental" | "technical" | "decision") {
    setAnalysisLoading(p => ({ ...p, [type]: true }));
    try {
      const res = await fetch("/api/trading/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, currentPrice: goldPrice, signalData, instrument: activeSymbol }),
      });
      const data = await res.json();
      setAnalysisContent(p => ({ ...p, [type]: data.content ?? "" }));
      setAnalysisTab(type === "decision" ? "chat" : type as any);
      if (type === "decision") {
        setMessages(prev => [...prev, { role: "assistant", content: data.content, type: "decision" }]);
      }
    } catch {}
    setAnalysisLoading(p => ({ ...p, [type]: false }));
  }

  async function sendChat() {
    if (!input.trim() || chatLoading) return;
    const userMsg = input;
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setInput("");
    setChatLoading(true);
    try {
      const res = await fetch("/api/trading/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "decision", question: userMsg, currentPrice: goldPrice, signalData, instrument: activeSymbol }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: "assistant", content: data.content ?? "No response.", type: "decision" }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Error getting analysis." }]);
    }
    setChatLoading(false);
  }

  async function saveTrade(form: any) {
    const tradeForm = { ...form, instrument: activeSymbol.replace("/", "") };
    const connectedAccount = accounts.find(a => a.metaapi_account_id);
    if (connectedAccount) {
      // Show confirmation modal so user can choose to execute on broker or just journal
      setShowLogTrade(false);
      setPendingTrade(tradeForm);
      setShowTradeConfirm(true);
      return;
    }
    // No connected account — log to journal only
    await logTradeToJournal(tradeForm);
    setShowLogTrade(false);
    await loadAll();
  }

  async function logTradeToJournal(form: any) {
    await fetch("/api/trading", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "log_trade",
        trade: {
          ladder_step: form.ladder_step,
          direction: form.direction,
          instrument: form.instrument ?? "XAUUSD",
          entry_price: parseFloat(form.entry_price) || null,
          lot_size: parseFloat(form.lot_size),
          stop_loss: parseFloat(form.stop_loss),
          take_profit: parseFloat(form.take_profit),
          notes: form.notes,
          account_type: form.account_type,
          status: "open",
        },
      }),
    });
  }

  async function executeOnExness(mt5Symbol: string): Promise<string | undefined> {
    const connectedAccount = accounts.find(a => a.metaapi_account_id);
    if (!connectedAccount || !pendingTrade) return "No connected account found";
    try {
      const res = await fetch("/api/trading/metaapi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "place_order",
          account_id: connectedAccount.id,
          direction: pendingTrade.direction,
          symbol: mt5Symbol,
          volume: parseFloat(pendingTrade.lot_size),
          stop_loss: parseFloat(pendingTrade.stop_loss),
          take_profit: parseFloat(pendingTrade.take_profit),
          entry_price: parseFloat(pendingTrade.entry_price) || null,
          ladder_step: pendingTrade.ladder_step,
          notes: pendingTrade.notes,
        }),
      });
      const data = await res.json();
      if (data.error) return data.error as string;
      setShowTradeConfirm(false);
      setPendingTrade(null);
      await loadAll();
      await loadAccounts();
      return undefined;
    } catch (e: any) {
      return e.message ?? "Network error";
    }
  }

  async function handleLogOnly() {
    if (!pendingTrade) return;
    await logTradeToJournal(pendingTrade);
    setShowTradeConfirm(false);
    setPendingTrade(null);
    await loadAll();
  }

  const activeStep = ladder.find(s => s.status === "active");
  const openTrades = entries.filter(e => e.status === "open");
  const closedTrades = entries.filter(e => e.status === "closed");
  const totalPnL = closedTrades.reduce((s, t) => s + (t.result_usd ?? 0), 0);
  const wins = closedTrades.filter(t => (t.result_usd ?? 0) > 0).length;
  const winRate = closedTrades.length > 0 ? Math.round((wins / closedTrades.length) * 100) : 0;

  const rsiColor = !signalData?.rsi ? "#737373" : signalData.rsi > 70 ? "#EF4444" : signalData.rsi < 30 ? "#10B981" : "#C8C5C0";
  const macdBull = signalData?.macd?.histogram > 0;

  return (
    <div className="flex h-full bg-[#0D0D0D] text-white overflow-hidden">

      {/* ── Left: Ladder + Stats ────────────────────────────────────────────── */}
      <div className="w-[220px] shrink-0 flex flex-col border-r border-[#1E1E1E] bg-[#111111]">
        {/* Header */}
        <div className="px-4 py-4 border-b border-[#1E1E1E]">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={14} className="text-[#B5622A]" />
            <span className="text-[13px] font-bold text-[#C8C5C0]">Gold Ladder</span>
          </div>
          <div className="text-[22px] font-black text-white font-mono">
            {goldPrice ? `$${goldPrice.toLocaleString()}` : "—"}
          </div>
          <p className="text-[10px] text-[#525252]">{activeSymbol} · 1H</p>
        </div>

        {/* Asset switcher / Watchlist */}
        <div className="px-3 py-2 border-b border-[#1E1E1E]">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[9px] font-bold text-[#525252] uppercase tracking-widest">Watchlist</p>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setEditWatchlist(v => !v)}
                className={`text-[9px] transition-colors font-semibold ${
                  editWatchlist ? "text-[#EF4444]" : "text-[#525252] hover:text-[#737373]"
                }`}>
                {editWatchlist ? "Done" : "Edit"}
              </button>
              <button
                onClick={() => { setShowSymbolSearch(v => !v); setSymbolQuery(""); setSymbolResults([]); }}
                className="text-[9px] text-[#B5622A] hover:text-[#9A4E20] transition-colors font-semibold">+ Add</button>
            </div>
          </div>

          {/* Symbol search panel */}
          {showSymbolSearch && (
            <div className="mb-1.5">
              <div className="relative">
                <input
                  value={symbolQuery}
                  onChange={e => searchSymbols(e.target.value)}
                  placeholder="Search symbol (e.g. XAU, BTC)"
                  autoFocus
                  className="w-full px-2 py-1.5 bg-[#0D0D0D] border border-[#2D2D2D] rounded text-[11px] text-[#C8C5C0] focus:outline-none focus:border-[#B5622A] pr-6"
                />
                {symbolSearching && (
                  <Loader2 size={9} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#525252] animate-spin" />
                )}
              </div>
              {symbolResults.length > 0 && (
                <div className="mt-1 bg-[#0D0D0D] border border-[#2D2D2D] rounded-lg overflow-hidden max-h-[180px] overflow-y-auto">
                  {symbolResults.map((r: any) => (
                    <button
                      key={r.symbol}
                      onClick={() => addToWatchlist(r.symbol, r.display_name, r.asset_type)}
                      className="w-full flex items-center justify-between px-2 py-1.5 hover:bg-[#1A1A1A] transition-colors text-left border-b border-[#1E1E1E] last:border-0">
                      <div>
                        <p className="text-[11px] font-semibold text-[#C8C5C0]">{r.symbol}</p>
                        <p className="text-[9px] text-[#525252] truncate max-w-[140px]">{r.display_name}</p>
                      </div>
                      <span className="text-[8px] px-1 py-0.5 rounded bg-[#2D2D2D] text-[#737373] uppercase font-bold shrink-0">
                        {r.asset_type}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {symbolQuery.length > 0 && !symbolSearching && symbolResults.length === 0 && (
                <p className="text-[9px] text-[#525252] text-center py-2">No results</p>
              )}
            </div>
          )}

          <div className="space-y-0.5">
            {watchlist.length === 0 && !showSymbolSearch
              ? (["XAU/USD", "XAG/USD", "ETH/USD", "BTC/USD"] as string[]).map(s => (
                <button key={s} onClick={() => switchSymbol(s)}
                  className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-[11px] transition-colors
                    ${activeSymbol === s ? "bg-[#B5622A20] text-[#B5622A] font-semibold border border-[#B5622A30]" : "text-[#737373] hover:bg-[#1A1A1A] hover:text-[#C8C5C0]"}`}>
                  <span>{s}</span>
                  {activeSymbol === s && signalData?.currentPrice && (
                    <span className="text-[10px] font-mono">${signalData.currentPrice.toLocaleString()}</span>
                  )}
                </button>
              ))
              : watchlist.map((w: any) => (
                <div key={w.symbol} className="flex items-center gap-1">
                  {editWatchlist && (
                    <button
                      onClick={() => removeFromWatchlist(w.id)}
                      className="shrink-0 w-4 h-4 flex items-center justify-center rounded-full bg-[#EF444420] text-[#EF4444] hover:bg-[#EF444440] transition-colors">
                      <X size={8} />
                    </button>
                  )}
                  <button onClick={() => switchSymbol(w.symbol)}
                    className={`flex-1 flex items-center justify-between px-2 py-1.5 rounded-lg text-[11px] transition-colors
                      ${activeSymbol === w.symbol ? "bg-[#B5622A20] text-[#B5622A] font-semibold border border-[#B5622A30]" : "text-[#737373] hover:bg-[#1A1A1A] hover:text-[#C8C5C0]"}`}>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] text-[#525252]">
                        {w.asset_type === "crypto" ? "₿" : w.asset_type === "commodity" ? "◈" : "€"}
                      </span>
                      <span>{w.display_name ?? w.symbol}</span>
                    </div>
                    {activeSymbol === w.symbol && signalData?.currentPrice && (
                      <span className="text-[10px] font-mono">${signalData.currentPrice.toLocaleString()}</span>
                    )}
                  </button>
                </div>
              ))
            }
          </div>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-2 gap-1.5 p-3 border-b border-[#1E1E1E]">
          {[
            { label: "Step", value: activeStep ? `${activeStep.step_number}/20` : "1/20" },
            { label: "Capital", value: activeStep ? `$${activeStep.target_amount}` : "$10" },
            { label: "P&L", value: `$${totalPnL.toFixed(2)}`, color: totalPnL >= 0 ? "#10B981" : "#EF4444" },
            { label: "Win Rate", value: `${winRate}%`, color: winRate >= 60 ? "#10B981" : winRate >= 40 ? "#EAB308" : "#EF4444" },
          ].map(s => (
            <div key={s.label} className="bg-[#1A1A1A] rounded-lg px-2 py-1.5 text-center">
              <p className="text-[9px] text-[#525252] uppercase tracking-wider">{s.label}</p>
              <p className="text-[12px] font-bold" style={{ color: s.color || "#C8C5C0" }}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Ladder steps */}
        <div className="flex-1 overflow-y-auto py-2">
          {ladder.slice(0, 12).map(step => (
            <div key={step.id}
              className={`mx-2 mb-0.5 px-3 py-2 rounded-lg flex items-center justify-between
                ${step.status === "active" ? "bg-[#B5622A20] border border-[#B5622A40]"
                : step.status === "complete" ? "bg-[#10B98110]"
                : "opacity-40"}`}>
              <div className="flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full
                  ${step.status === "active" ? "bg-[#B5622A] animate-pulse"
                  : step.status === "complete" ? "bg-[#10B981]"
                  : "bg-[#2D2D2D]"}`} />
                <span className="text-[11px] text-[#C8C5C0]">Step {step.step_number}</span>
              </div>
              <span className="text-[11px] font-mono text-[#737373]">${step.target_amount}</span>
            </div>
          ))}
        </div>

        {/* Action buttons */}
        <div className="p-3 border-t border-[#1E1E1E] space-y-2">
          <button onClick={() => setShowChecklist("reversal")}
            className="w-full flex items-center gap-2 px-3 py-2 bg-[#B5622A] text-white text-[11px] font-bold rounded-lg hover:bg-[#9A4E20] transition-colors">
            <Zap size={11} /> ⚡ Reversal Setup
          </button>
          <button onClick={() => setShowChecklist("momentum")}
            className="w-full flex items-center gap-2 px-3 py-2 bg-[#1E1E1E] text-[#C8C5C0] text-[11px] font-semibold rounded-lg hover:bg-[#2D2D2D] transition-colors">
            <TrendingUp size={11} /> 🌊 Momentum Setup
          </button>
        </div>

        {/* Exness Account Panel */}
        <div className="p-3 border-t border-[#1E1E1E] overflow-y-auto" style={{ maxHeight: 220 }}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[9px] font-bold text-[#525252] uppercase tracking-widest">Accounts</p>
            <button
              onClick={() => { setShowAddAccount(v => !v); setShowMetaApiForm(true); setConnectError(""); }}
              className="text-[9px] text-[#B5622A] hover:text-[#9A4E20] transition-colors font-semibold">+ Add</button>
          </div>

          {accounts.length === 0 && !showAddAccount && (
            <button
              onClick={() => { setShowAddAccount(true); setShowMetaApiForm(true); }}
              className="w-full text-[10px] text-[#525252] hover:text-[#737373] text-center py-2 border border-dashed border-[#2D2D2D] rounded-lg transition-colors">
              Connect Exness demo
            </button>
          )}

          {accounts.map((acc: any) => (
            <div key={acc.id} className="bg-[#1A1A1A] rounded-lg px-2 py-2 mb-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-[#C8C5C0]">{acc.account_number}</span>
                <div className="flex items-center gap-1">
                  {acc.metaapi_account_id && (
                    <span className="text-[8px] px-1 py-0.5 rounded bg-[#10B98120] text-[#10B981] font-bold">LIVE</span>
                  )}
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
                    acc.account_type === "demo" ? "bg-[#3B82F620] text-[#3B82F6]" : "bg-[#10B98120] text-[#10B981]"
                  }`}>{acc.account_type.toUpperCase()}</span>
                </div>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px] text-[#525252]">Balance</span>
                <span className="text-[11px] font-mono font-bold text-[#C8C5C0]">${parseFloat(acc.balance || 0).toFixed(2)}</span>
              </div>
              {acc.metaapi_account_id && (
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-[10px] text-[#525252]">Equity</span>
                  <span className="text-[11px] font-mono font-bold text-[#C8C5C0]">${parseFloat(acc.equity || 0).toFixed(2)}</span>
                </div>
              )}
              {acc.metaapi_account_id && (
                <button
                  onClick={() => syncMetaApi(acc.id)}
                  disabled={syncingAccount === acc.id}
                  className="mt-1.5 w-full flex items-center justify-center gap-1 py-1 bg-[#111111] hover:bg-[#2D2D2D] rounded text-[9px] text-[#525252] hover:text-[#737373] transition-colors disabled:opacity-50">
                  <RefreshCw size={8} className={syncingAccount === acc.id ? "animate-spin" : ""} />
                  {syncingAccount === acc.id ? "Syncing..." : "Sync Live"}
                </button>
              )}
              {syncErrors[acc.id] && (
                <p className="text-[8px] text-red-400 bg-red-400/10 rounded px-1.5 py-1 mt-1 break-all">
                  {syncErrors[acc.id]}
                </p>
              )}
              {acc.last_synced_at && acc.metaapi_account_id && !syncErrors[acc.id] && (
                <p className="text-[8px] text-[#525252] mt-0.5 text-center">
                  {new Date(acc.last_synced_at).toLocaleTimeString()}
                </p>
              )}
            </div>
          ))}

          {showAddAccount && (
            <div className="bg-[#1A1A1A] rounded-lg p-2 space-y-1.5 mt-1">
              {/* Mode tabs */}
              <div className="flex gap-1 mb-1">
                <button
                  onClick={() => setShowMetaApiForm(false)}
                  className={`flex-1 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                    !showMetaApiForm ? "bg-[#B5622A] text-white" : "bg-[#2D2D2D] text-[#737373]"
                  }`}>Manual</button>
                <button
                  onClick={() => setShowMetaApiForm(true)}
                  className={`flex-1 py-0.5 rounded text-[10px] font-semibold transition-colors flex items-center justify-center gap-1 ${
                    showMetaApiForm ? "bg-[#B5622A] text-white" : "bg-[#2D2D2D] text-[#737373]"
                  }`}>
                  <Zap size={9} /> MetaAPI
                </button>
              </div>

              {!showMetaApiForm ? (
                <>
                  <input
                    value={accountForm.account_number}
                    onChange={e => setAccountForm(p => ({ ...p, account_number: e.target.value }))}
                    placeholder="Account number"
                    className="w-full px-2 py-1.5 bg-[#0D0D0D] border border-[#2D2D2D] rounded text-[11px] text-[#C8C5C0] focus:outline-none focus:border-[#B5622A]"
                  />
                  <input
                    value={accountForm.balance}
                    onChange={e => setAccountForm(p => ({ ...p, balance: e.target.value }))}
                    placeholder="Balance (USD)"
                    type="number"
                    className="w-full px-2 py-1.5 bg-[#0D0D0D] border border-[#2D2D2D] rounded text-[11px] text-[#C8C5C0] focus:outline-none focus:border-[#B5622A]"
                  />
                  <div className="flex gap-1">
                    {(["demo", "live"] as const).map(t => (
                      <button key={t} onClick={() => setAccountForm(p => ({ ...p, account_type: t }))}
                        className={`flex-1 py-1 rounded text-[10px] font-semibold transition-colors capitalize
                          ${accountForm.account_type === t ? "bg-[#B5622A] text-white" : "bg-[#2D2D2D] text-[#737373]"}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    <button onClick={addAccount}
                      className="flex-1 py-1.5 bg-[#B5622A] text-white text-[10px] font-bold rounded hover:bg-[#9A4E20] transition-colors">
                      Save
                    </button>
                    <button onClick={() => setShowAddAccount(false)}
                      className="px-3 py-1.5 bg-[#2D2D2D] text-[#737373] text-[10px] rounded">
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <input
                    value={metaApiForm.token}
                    onChange={e => setMetaApiForm(p => ({ ...p, token: e.target.value }))}
                    placeholder="MetaAPI token"
                    type="password"
                    autoComplete="off"
                    className="w-full px-2 py-1.5 bg-[#0D0D0D] border border-[#2D2D2D] rounded text-[11px] text-[#C8C5C0] focus:outline-none focus:border-[#B5622A]"
                  />
                  <input
                    value={metaApiForm.login}
                    onChange={e => setMetaApiForm(p => ({ ...p, login: e.target.value }))}
                    placeholder="MT5 login (account number)"
                    className="w-full px-2 py-1.5 bg-[#0D0D0D] border border-[#2D2D2D] rounded text-[11px] text-[#C8C5C0] focus:outline-none focus:border-[#B5622A]"
                  />
                  <input
                    value={metaApiForm.password}
                    onChange={e => setMetaApiForm(p => ({ ...p, password: e.target.value }))}
                    placeholder="MT5 password (provisioning only)"
                    type="password"
                    autoComplete="new-password"
                    className="w-full px-2 py-1.5 bg-[#0D0D0D] border border-[#2D2D2D] rounded text-[11px] text-[#C8C5C0] focus:outline-none focus:border-[#B5622A]"
                  />
                  <input
                    value={metaApiForm.server}
                    onChange={e => setMetaApiForm(p => ({ ...p, server: e.target.value }))}
                    placeholder="Server (e.g. Exness-MT5Trial4)"
                    className="w-full px-2 py-1.5 bg-[#0D0D0D] border border-[#2D2D2D] rounded text-[11px] text-[#C8C5C0] focus:outline-none focus:border-[#B5622A]"
                  />
                  {connectError && (
                    <p className="text-[9px] text-red-400 bg-red-400/10 rounded px-2 py-1">{connectError}</p>
                  )}
                  <div className="flex gap-1">
                    <button onClick={connectMetaApi}
                      className="flex-1 py-1.5 bg-[#B5622A] text-white text-[10px] font-bold rounded hover:bg-[#9A4E20] transition-colors">
                      Connect
                    </button>
                    <button onClick={() => { setShowAddAccount(false); setConnectError(""); }}
                      className="px-3 py-1.5 bg-[#2D2D2D] text-[#737373] text-[10px] rounded">
                      Cancel
                    </button>
                  </div>
                  <p className="text-[8px] text-[#525252] text-center">Password is sent to MetaAPI once and never stored here</p>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Center: Chart + Indicators ─────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Tab bar */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-[#1E1E1E] bg-[#111111] shrink-0">
          {[
            { id: "terminal", label: "Terminal", icon: BarChart3 },
            { id: "trades", label: `Trades ${openTrades.length > 0 ? `(${openTrades.length} open)` : ""}`, icon: TrendingUp },
            { id: "journal", label: "Metrics", icon: Activity },
          ].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id as any)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] transition-colors
                ${activeTab === t.id ? "bg-[#1E1E1E] text-[#C8C5C0] font-semibold" : "text-[#525252] hover:text-[#737373]"}`}>
              <t.icon size={12} />{t.label}
            </button>
          ))}
          <button onClick={loadSignals} disabled={signalLoading}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-[#525252] hover:text-[#737373] transition-colors">
            <RefreshCw size={11} className={signalLoading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        {activeTab === "terminal" && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Chart */}
            <div className="bg-[#111111] border border-[#1E1E1E] rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1E1E1E]">
                <span className="text-[11px] font-bold text-[#737373] uppercase tracking-wider">{activeSymbol} · 1H</span>
                <div className="flex items-center gap-3 text-[10px] text-[#525252]">
                  <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-[#10B981] inline-block rounded" /> Support</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-[#EF4444] inline-block rounded" /> Resistance</span>
                </div>
              </div>
              <div className="px-2 py-2">
                <MiniChart candles={signalData?.candles ?? []} levels={signalData?.levels} />
              </div>
            </div>

            {/* Indicators strip */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: "RSI (14)", value: signalData?.rsi ? `${signalData.rsi}` : "—", color: rsiColor, sub: signalData?.rsi ? (signalData.rsi > 70 ? "Overbought" : signalData.rsi < 30 ? "Oversold" : "Neutral") : "No data" },
                { label: "MACD", value: signalData?.macd ? (macdBull ? "▲ Bull" : "▼ Bear") : "—", color: macdBull ? "#10B981" : "#EF4444", sub: signalData?.macd ? `Hist: ${signalData.macd.histogram?.toFixed(2)}` : "" },
                { label: "Volume", value: signalData?.vsa ? `${signalData.vsa.volumeRatio}x` : "—", color: (signalData?.vsa?.volumeRatio ?? 0) > 1.5 ? "#EAB308" : "#C8C5C0", sub: signalData?.vsa?.isVolumeSpike ? "⚡ Spike" : "Normal" },
                { label: "VSA", value: signalData?.vsa?.isClimatic ? "Climactic" : signalData?.vsa?.noDemand ? "No Demand" : signalData?.vsa?.noSupply ? "No Supply" : "Neutral", color: signalData?.vsa?.isClimatic ? "#EAB308" : "#737373", sub: signalData?.vsa ? `Spread: ${signalData.vsa.spread}` : "" },
              ].map(ind => (
                <div key={ind.label} className="bg-[#1A1A1A] border border-[#2D2D2D] rounded-xl px-3 py-2.5">
                  <p className="text-[9px] text-[#525252] uppercase tracking-wider mb-1">{ind.label}</p>
                  <p className="text-[14px] font-bold" style={{ color: ind.color }}>{ind.value}</p>
                  <p className="text-[10px] text-[#525252] mt-0.5">{ind.sub}</p>
                </div>
              ))}
            </div>

            {/* Key levels */}
            {signalData?.levels && (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#0D1A12] border border-[#10B98130] rounded-xl p-3">
                  <p className="text-[10px] font-bold text-[#10B981] uppercase tracking-wider mb-2">Support Levels</p>
                  {signalData.levels.supports.length === 0 && <p className="text-[11px] text-[#525252]">None detected</p>}
                  {signalData.levels.supports.map((s: number, i: number) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-[11px] text-[#525252]">S{i+1}</span>
                      <span className="text-[13px] font-mono text-[#10B981] font-bold">${s.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
                <div className="bg-[#1A0D0D] border border-[#EF444430] rounded-xl p-3">
                  <p className="text-[10px] font-bold text-[#EF4444] uppercase tracking-wider mb-2">Resistance Levels</p>
                  {signalData.levels.resistances.length === 0 && <p className="text-[11px] text-[#525252]">None detected</p>}
                  {signalData.levels.resistances.map((r: number, i: number) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-[11px] text-[#525252]">R{i+1}</span>
                      <span className="text-[13px] font-mono text-[#EF4444] font-bold">${r.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Signal card */}
            <SignalCard signal={signalData?.signal} positionSize={signalData?.positionSize} />

            {/* ── Place Trade ─────────────────────────────────────────────── */}
            <div className="bg-[#111111] border border-[#2D2D2D] rounded-xl p-4">
              <p className="text-[10px] font-bold text-[#525252] uppercase tracking-wider mb-3">Execute Trade</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setShowChecklist("reversal")}
                  className="flex items-center justify-center gap-2 py-3 bg-[#B5622A] text-white text-[12px] font-bold rounded-xl hover:bg-[#9A4E20] transition-colors">
                  <Zap size={13} /> ⚡ Reversal
                </button>
                <button
                  onClick={() => setShowChecklist("momentum")}
                  className="flex items-center justify-center gap-2 py-3 bg-[#1E1E1E] border border-[#3D3D3D] text-[#C8C5C0] text-[12px] font-semibold rounded-xl hover:bg-[#2D2D2D] transition-colors">
                  <TrendingUp size={13} /> 🌊 Momentum
                </button>
              </div>
              <p className="text-[9px] text-[#3A3A3A] mt-2 text-center">Pre-trade checklist → position sizing → order placement</p>
            </div>
          </div>
        )}

        {activeTab === "trades" && (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[14px] font-bold text-[#C8C5C0]">Trade Log</h2>
              <button onClick={() => setShowChecklist("reversal")}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#B5622A] text-white text-[11px] font-bold rounded-lg hover:bg-[#9A4E20] transition-colors">
                <Plus size={11} /> New Trade
              </button>
            </div>

            {openTrades.length > 0 && (
              <div className="mb-4">
                <p className="text-[10px] font-bold text-[#737373] uppercase tracking-wider mb-2">Open Positions</p>
                {openTrades.map(t => (
                  <div key={t.id} className="bg-[#1A1A1A] border border-[#2D2D2D] rounded-xl p-3 mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${t.direction === "buy" ? "bg-[#10B98120] text-[#10B981]" : "bg-[#EF444420] text-[#EF4444]"}`}>
                        {t.direction.toUpperCase()}
                      </span>
                      <div>
                        <p className="text-[12px] font-semibold text-[#C8C5C0]">{activeSymbol.replace("/","")} @ ${t.entry_price}</p>
                        <p className="text-[10px] text-[#525252]">{t.lot_size ?? "—"} lots · Step {t.ladder_step}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] text-[#737373]">{new Date(t.opened_at).toLocaleDateString()}</p>
                      <div className="w-2 h-2 rounded-full bg-[#EAB308] animate-pulse mx-auto mt-1" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {closedTrades.length === 0 && openTrades.length === 0 && (
              <div className="text-center py-16">
                <p className="text-[13px] text-[#525252]">No trades logged yet</p>
                <p className="text-[11px] text-[#3A3A3A] mt-1">Run pre-trade checklist before every trade</p>
              </div>
            )}

            {closedTrades.map(t => (
              <div key={t.id} className="bg-[#1A1A1A] border border-[#2D2D2D] rounded-xl p-3 mb-2 flex items-center justify-between opacity-60">
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${t.direction === "buy" ? "bg-[#10B98120] text-[#10B981]" : "bg-[#EF444420] text-[#EF4444]"}`}>
                    {t.direction.toUpperCase()}
                  </span>
                  <div>
                    <p className="text-[12px] text-[#C8C5C0]">{activeSymbol.replace("/","")} @ ${t.entry_price} → ${t.exit_price ?? "—"}</p>
                    <p className="text-[10px] text-[#525252]">Step {t.ladder_step}</p>
                  </div>
                </div>
                <span className={`text-[13px] font-bold ${(t.result_usd ?? 0) >= 0 ? "text-[#10B981]" : "text-[#EF4444]"}`}>
                  {(t.result_usd ?? 0) >= 0 ? "+" : ""}${t.result_usd?.toFixed(2) ?? "0.00"}
                </span>
              </div>
            ))}
          </div>
        )}

        {activeTab === "journal" && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity size={14} className="text-[#B5622A]" />
                <h2 className="text-[14px] font-bold text-[#C8C5C0]">Performance Metrics</h2>
              </div>
              <button onClick={loadAll} className="flex items-center gap-1 text-[10px] text-[#525252] hover:text-[#737373] transition-colors">
                <RefreshCw size={10} /> Refresh
              </button>
            </div>

            {/* Metric cards grid */}
            <div className="grid grid-cols-3 gap-2">
              {[
                {
                  label: "Win Rate",
                  value: serverStats?.win_rate != null ? `${serverStats.win_rate}%` : "—",
                  sub: `${wins}W / ${closedTrades.length - wins}L`,
                  color: (serverStats?.win_rate ?? 0) >= 60 ? "#10B981" : (serverStats?.win_rate ?? 0) >= 40 ? "#EAB308" : "#EF4444",
                },
                {
                  label: "Expectancy",
                  value: serverStats?.expectancy != null ? `$${serverStats.expectancy.toFixed(2)}` : "—",
                  sub: "Avg per trade",
                  color: (serverStats?.expectancy ?? 0) >= 0 ? "#10B981" : "#EF4444",
                },
                {
                  label: "Avg R-Multiple",
                  value: serverStats?.avg_r_multiple != null ? `${serverStats.avg_r_multiple}R` : "—",
                  sub: "Risk/reward avg",
                  color: (serverStats?.avg_r_multiple ?? 0) >= 1.5 ? "#10B981" : "#EAB308",
                },
                {
                  label: "Max Drawdown",
                  value: `$${((serverStats?.max_drawdown_usd) ?? 0).toFixed(2)}`,
                  sub: "Peak to trough",
                  color: "#EF4444",
                },
                {
                  label: "Rule Adherence",
                  value: serverStats?.rule_adherence != null ? `${serverStats.rule_adherence}%` : "—",
                  sub: "Checklist passed",
                  color: (serverStats?.rule_adherence ?? 0) >= 80 ? "#10B981" : "#EAB308",
                },
                {
                  label: "Total Trades",
                  value: `${serverStats?.total_trades ?? 0}`,
                  sub: `${openTrades.length} open now`,
                  color: "#C8C5C0",
                },
              ].map(m => (
                <div key={m.label} className="bg-[#1A1A1A] border border-[#2D2D2D] rounded-xl px-3 py-2.5 text-center">
                  <p className="text-[9px] text-[#525252] uppercase tracking-wider mb-1">{m.label}</p>
                  <p className="text-[15px] font-black font-mono" style={{ color: m.color }}>{m.value}</p>
                  <p className="text-[9px] text-[#525252] mt-0.5">{m.sub}</p>
                </div>
              ))}
            </div>

            {/* Equity curve */}
            <EquityChart trades={entries} />

            {/* Ladder progress */}
            {activeStep && (
              <div className="bg-[#111111] border border-[#1E1E1E] rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold text-[#737373] uppercase tracking-wider">Ladder Progress</p>
                  <span className="text-[10px] font-bold text-[#B5622A]">Step {activeStep.step_number} / 20</span>
                </div>
                <div className="w-full bg-[#2D2D2D] rounded-full h-1.5 mb-1.5">
                  <div
                    className="h-1.5 rounded-full bg-gradient-to-r from-[#B5622A] to-[#E07A3A] transition-all"
                    style={{ width: `${(activeStep.step_number / 20) * 100}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[9px] text-[#525252]">
                  <span>$10</span>
                  <span className="text-[#10B981] font-semibold">Target: ${activeStep.target_amount.toLocaleString()}</span>
                  <span>$5M</span>
                </div>
              </div>
            )}

            {/* AI Coaching Summaries */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Sparkles size={12} className="text-[#B5622A]" />
                  <p className="text-[11px] font-bold text-[#C8C5C0]">AI Coaching Summaries</p>
                </div>
                <div className="flex items-center gap-1">
                  {(["daily", "weekly", "manual"] as const).map(p => (
                    <button key={p} onClick={() => generateSummary(p)} disabled={summaryLoading}
                      className="px-2 py-1 text-[9px] font-semibold bg-[#1E1E1E] hover:bg-[#2D2D2D] text-[#737373] hover:text-[#C8C5C0] rounded transition-colors disabled:opacity-40 capitalize">
                      {p === "manual" ? "Now" : p}
                    </button>
                  ))}
                  {summaryLoading && <Loader2 size={10} className="text-[#B5622A] animate-spin ml-1" />}
                </div>
              </div>

              {summaries.length === 0 && !summaryLoading && (
                <div className="text-center py-6 bg-[#111111] border border-[#1E1E1E] rounded-xl">
                  <p className="text-[11px] text-[#525252]">No summaries yet</p>
                  <p className="text-[10px] text-[#3A3A3A] mt-1">Click "Now" to generate your first AI coaching report</p>
                </div>
              )}

              <div className="space-y-2">
                {summaries.map(s => (
                  <div key={s.id} className="bg-[#111111] border border-[#1E1E1E] rounded-xl p-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase
                          ${s.period_type === "daily" ? "bg-[#3B82F620] text-[#3B82F6]"
                          : s.period_type === "weekly" ? "bg-[#B5622A20] text-[#B5622A]"
                          : "bg-[#10B98120] text-[#10B981]"}`}>
                          {s.period_type}
                        </span>
                        <span className="text-[10px] text-[#525252]">
                          {new Date(s.generated_at).toLocaleDateString()} · {new Date(s.generated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      {s.stats_snapshot?.win_rate != null && (
                        <span className={`text-[10px] font-bold ${s.stats_snapshot.win_rate >= 50 ? "text-[#10B981]" : "text-[#EF4444]"}`}>
                          {s.stats_snapshot.win_rate}% WR
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#C8C5C0] leading-relaxed whitespace-pre-wrap">{s.content}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Right: Analysis + AI ───────────────────────────────────────────── */}
      <div className="w-[360px] shrink-0 flex flex-col border-l border-[#1E1E1E] bg-[#111111]">
        {/* Analysis tabs */}
        {(() => {
          const highImpactCount = newsItems.filter(n => n.impact === "HIGH").length;
          const tabs = [
            { id: "signal", label: "Signal", badge: null },
            { id: "fundamental", label: "News", badge: highImpactCount > 0 ? highImpactCount : null },
            { id: "technical", label: "Technical", badge: null },
            { id: "chat", label: "AI Coach", badge: null },
          ];
          return (
            <div className="flex items-center gap-0.5 px-3 py-2 border-b border-[#1E1E1E] shrink-0">
              {tabs.map(t => (
                <button key={t.id} onClick={() => setAnalysisTab(t.id as any)}
                  className={`flex-1 py-1.5 rounded-lg text-[10px] font-semibold transition-colors relative
                    ${analysisTab === t.id ? "bg-[#1E1E1E] text-[#C8C5C0]" : "text-[#525252] hover:text-[#737373]"}`}>
                  {t.label}
                  {t.badge != null && (
                    <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[#EF4444] text-[7px] font-black text-white flex items-center justify-center">
                      {t.badge > 9 ? "9+" : t.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          );
        })()}

        {analysisTab === "signal" && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div>
              <p className="text-[10px] font-bold text-[#737373] uppercase tracking-wider mb-3">Signal Summary</p>
              <SignalCard signal={signalData?.signal} positionSize={signalData?.positionSize} />
            </div>

            {/* VSA breakdown */}
            {signalData?.vsa && (
              <div>
                <p className="text-[10px] font-bold text-[#737373] uppercase tracking-wider mb-2">VSA Breakdown</p>
                <div className="space-y-1.5">
                  {[
                    { label: "Volume Spike", value: signalData.vsa.isVolumeSpike, detail: `${signalData.vsa.volumeRatio}x average` },
                    { label: "Wide Spread", value: signalData.vsa.isWideSpread, detail: `${signalData.vsa.spread} vs avg ${signalData.vsa.avgSpread}` },
                    { label: "Climactic", value: signalData.vsa.isClimatic, detail: "High effort candle" },
                    { label: "Closed Off Highs", value: signalData.vsa.closedOffHighs, detail: "Failure signal (short)" },
                    { label: "Closed Off Lows", value: signalData.vsa.closedOffLows, detail: "Failure signal (long)" },
                    { label: "No Demand", value: signalData.vsa.noDemand, detail: "Weak bullish candle" },
                    { label: "No Supply", value: signalData.vsa.noSupply, detail: "Weak bearish candle" },
                  ].map(item => (
                    <div key={item.label} className="flex items-center justify-between px-3 py-1.5 bg-[#1A1A1A] rounded-lg">
                      <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${item.value ? "bg-[#EAB308]" : "bg-[#2D2D2D]"}`} />
                        <span className="text-[11px] text-[#C8C5C0]">{item.label}</span>
                      </div>
                      <span className="text-[10px] text-[#525252]">{item.detail}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button onClick={() => runAnalysis("decision")} disabled={analysisLoading.decision}
              className="w-full py-2.5 bg-[#B5622A] text-white text-[12px] font-bold rounded-xl hover:bg-[#9A4E20] disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
              {analysisLoading.decision ? <Loader2 size={13} className="animate-spin" /> : <Brain size={13} />}
              Ask AI Coach — Should I Trade?
            </button>
          </div>
        )}

        {analysisTab === "fundamental" && (
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {/* News Feed */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <Newspaper size={11} className="text-[#737373]" />
                  <p className="text-[10px] font-bold text-[#737373] uppercase tracking-wider">Market News</p>
                </div>
                <button onClick={loadNews} disabled={newsLoading}
                  className="flex items-center gap-1 text-[10px] text-[#525252] hover:text-[#737373] transition-colors disabled:opacity-40">
                  {newsLoading ? <Loader2 size={9} className="animate-spin" /> : <RefreshCw size={9} />}
                  Refresh
                </button>
              </div>

              {newsLoading && newsItems.length === 0 && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 size={14} className="animate-spin text-[#525252]" />
                </div>
              )}

              {!newsLoading && newsItems.length === 0 && (
                <div className="bg-[#0D0D0D] border border-[#1E1E1E] rounded-xl p-3 text-center">
                  <p className="text-[10px] text-[#525252]">Add FINNHUB_API_KEY to .env.local to enable live news</p>
                  <button onClick={loadNews}
                    className="mt-1.5 text-[9px] text-[#B5622A] hover:text-[#9A4E20] transition-colors">
                    Try loading →
                  </button>
                </div>
              )}

              {newsItems.length > 0 && (
                <div className="space-y-1.5">
                  {(() => {
                    const watchlistSymbols = watchlist.map((w: any) => w.symbol.toUpperCase());
                    const activeSymbolUpper = activeSymbol.replace("/","").toUpperCase();
                    const relevant = watchlistSymbols.length > 0
                      ? newsItems.filter(n =>
                          n.impact === "HIGH" ||
                          n.assets.some(a => watchlistSymbols.some(ws => ws.includes(a) || a.includes(ws.slice(0,3)))) ||
                          n.assets.some(a => activeSymbolUpper.includes(a))
                        )
                      : newsItems;
                    const display = relevant.length > 0 ? relevant : newsItems;
                    return display.slice(0, 10).map(item => (
                    <div key={item.id} className="bg-[#0D0D0D] border border-[#1E1E1E] hover:border-[#2D2D2D] rounded-xl p-2.5 transition-colors">
                      <div className="flex items-start gap-2">
                        <span className={`shrink-0 mt-0.5 text-[7px] px-1 py-0.5 rounded font-bold uppercase tracking-wide
                          ${item.impact === "HIGH" ? "bg-[#EF444420] text-[#EF4444]"
                          : item.impact === "MEDIUM" ? "bg-[#EAB30820] text-[#EAB308]"
                          : "bg-[#52525215] text-[#525252]"}`}>
                          {item.impact}
                        </span>
                        <div className="flex-1 min-w-0">
                          <button
                            onClick={() => setExpandedNews(prev => {
                              const next = new Set(prev);
                              if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
                              return next;
                            })}
                            className="text-left w-full">
                            <p className={`text-[11px] text-[#C8C5C0] leading-snug ${!expandedNews.has(item.id) ? "line-clamp-2" : ""}`}>
                              {item.headline}
                            </p>
                          </button>
                          {expandedNews.has(item.id) && item.summary && (
                            <p className="text-[10px] text-[#737373] mt-1 leading-relaxed">{item.summary}</p>
                          )}
                          <div className="flex items-center justify-between mt-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[9px] text-[#525252]">{item.source}</span>
                              {item.assets.length > 0 && (
                                <>
                                  <span className="text-[9px] text-[#3A3A3A]">·</span>
                                  {item.assets.slice(0, 2).map(a => (
                                    <span key={a} className="text-[7px] px-1 py-0.5 rounded bg-[#B5622A15] text-[#B5622A] font-bold">
                                      {a}
                                    </span>
                                  ))}
                                </>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] text-[#3A3A3A]">
                                {Math.round((Date.now() / 1000 - item.datetime) / 3600)}h ago
                              </span>
                              {item.url && (
                                <a href={item.url} target="_blank" rel="noopener noreferrer"
                                  className="text-[9px] text-[#3B82F6] hover:text-[#60A5FA] transition-colors">↗</a>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ));
                  })()}
                </div>
              )}
            </div>

            {/* AI Fundamental Analysis */}
            <div className="border-t border-[#1E1E1E] pt-3">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-bold text-[#737373] uppercase tracking-wider">AI Analysis</p>
                <button onClick={() => runAnalysis("fundamental")} disabled={analysisLoading.fundamental}
                  className="flex items-center gap-1 text-[10px] text-[#B5622A] hover:text-[#9A4E20] transition-colors">
                  {analysisLoading.fundamental ? <Loader2 size={10} className="animate-spin" /> : <Globe size={10} />}
                  Refresh
                </button>
              </div>
              {!analysisContent.fundamental && (
                <div className="text-center py-6">
                  <p className="text-[11px] text-[#525252] mb-3">CME data, COT positioning, macro outlook</p>
                  <button onClick={() => runAnalysis("fundamental")} disabled={analysisLoading.fundamental}
                    className="px-4 py-2 bg-[#B5622A] text-white text-[11px] font-semibold rounded-lg hover:bg-[#9A4E20] disabled:opacity-40 transition-colors flex items-center gap-2 mx-auto">
                    {analysisLoading.fundamental ? <Loader2 size={11} className="animate-spin" /> : <Globe size={11} />}
                    Run Fundamental Analysis
                  </button>
                </div>
              )}
              {analysisContent.fundamental && (
                <div className="text-[11px] text-[#C8C5C0] leading-relaxed whitespace-pre-wrap">
                  {analysisContent.fundamental}
                </div>
              )}
            </div>
          </div>
        )}

        {analysisTab === "technical" && (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold text-[#737373] uppercase tracking-wider">Technical Analysis</p>
              <button onClick={() => runAnalysis("technical")} disabled={analysisLoading.technical}
                className="flex items-center gap-1 text-[10px] text-[#B5622A] hover:text-[#9A4E20] transition-colors">
                {analysisLoading.technical ? <Loader2 size={10} className="animate-spin" /> : <BarChart3 size={10} />}
                Refresh
              </button>
            </div>
            {!analysisContent.technical && (
              <div className="text-center py-8">
                <p className="text-[12px] text-[#525252] mb-4">Structure, key levels, RSI/MACD interpretation</p>
                <button onClick={() => runAnalysis("technical")} disabled={analysisLoading.technical}
                  className="px-4 py-2 bg-[#B5622A] text-white text-[12px] font-semibold rounded-lg hover:bg-[#9A4E20] disabled:opacity-40 transition-colors flex items-center gap-2 mx-auto">
                  {analysisLoading.technical ? <Loader2 size={12} className="animate-spin" /> : <BarChart3 size={12} />}
                  Run Technical Analysis
                </button>
              </div>
            )}
            {analysisContent.technical && (
              <div className="text-[12px] text-[#C8C5C0] leading-relaxed whitespace-pre-wrap">
                {analysisContent.technical}
              </div>
            )}
          </div>
        )}

        {analysisTab === "chat" && (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {messages.length === 0 && (
                <div className="text-center py-8">
                  <div className="text-2xl mb-3">🧠</div>
                  <p className="text-[12px] text-[#525252] mb-5">Ask your AI trading coach. Responses are based strictly on your strategy rules.</p>
                  {[
                    "Should I enter a trade right now?",
                    "What strategy applies to current conditions?",
                    "Is this a reversal or momentum setup?",
                    "What does the VSA signal tell me?",
                  ].map(s => (
                    <button key={s} onClick={() => setInput(s)}
                      className="w-full text-left text-[11px] text-[#525252] hover:text-[#C8C5C0] px-3 py-2 rounded-lg bg-[#1A1A1A] hover:bg-[#1E1E1E] border border-[#2D2D2D] transition-all mb-1.5">
                      {s}
                    </button>
                  ))}
                </div>
              )}
              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] shrink-0
                    ${msg.role === "user" ? "bg-[#B5622A] text-white font-bold" : "bg-[#1E1E1E] text-white"}`}>
                    {msg.role === "user" ? "S" : "🧠"}
                  </div>
                  <div className={`flex-1 rounded-xl px-3 py-2.5 max-w-[280px]
                    ${msg.role === "user" ? "bg-[#B5622A15] border border-[#B5622A30]" : "bg-[#1A1A1A] border border-[#2D2D2D]"}`}>
                    <p className="text-[12px] text-[#C8C5C0] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    {msg.type === "decision" && (
                      <p className="text-[9px] text-[#525252] mt-1">Analysed by GPT-4.1</p>
                    )}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex gap-2">
                  <div className="w-6 h-6 rounded-full bg-[#1E1E1E] flex items-center justify-center text-[11px] shrink-0">🧠</div>
                  <div className="bg-[#1A1A1A] border border-[#2D2D2D] rounded-xl px-3 py-2.5">
                    <div className="flex gap-1">
                      {[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-[#525252] animate-bounce" style={{ animationDelay: `${i*0.15}s` }} />)}
                    </div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
            <div className="px-3 pb-3 shrink-0 border-t border-[#1E1E1E] pt-3">
              <div className="flex gap-2">
                <input value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") sendChat(); }}
                  placeholder="Ask your trading coach..."
                  className="flex-1 px-3 py-2 bg-[#0D0D0D] border border-[#2D2D2D] rounded-xl text-[12px] text-[#C8C5C0] placeholder:text-[#3A3A3A] focus:outline-none focus:border-[#B5622A]"
                />
                <button onClick={sendChat} disabled={chatLoading || !input.trim()}
                  className="w-9 h-9 flex items-center justify-center bg-[#B5622A] rounded-xl hover:bg-[#9A4E20] disabled:opacity-40 transition-colors">
                  <Send size={13} className="text-white" />
                </button>
              </div>
              <p className="text-[9px] text-[#3A3A3A] mt-1.5 text-center">GPT-4.1 for all analysis · multi-asset</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      {showChecklist && (
        <ChecklistModal
          strategy={showChecklist}
          autoResults={signalData?.vsa ?? null}
          onClose={() => setShowChecklist(null)}
          onConfirm={(passed, checks) => {
            setShowChecklist(null);
            if (passed) setShowLogTrade(true);
          }}
        />
      )}

      {showLogTrade && (
        <LogTradeModal
          ladder={activeStep}
          positionSize={signalData?.positionSize}
          onClose={() => setShowLogTrade(false)}
          onSave={saveTrade}
        />
      )}

      {showTradeConfirm && pendingTrade && (
        <TradeConfirmModal
          form={pendingTrade}
          connectedAccount={accounts.find(a => a.metaapi_account_id) ?? null}
          onExecute={executeOnExness}
          onLogOnly={handleLogOnly}
          onClose={() => { setShowTradeConfirm(false); setPendingTrade(null); }}
        />
      )}
    </div>
  );
}