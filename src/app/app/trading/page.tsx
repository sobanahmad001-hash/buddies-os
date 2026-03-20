"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import {
  TrendingUp, TrendingDown, Minus, Send, Plus, Check, X,
  RefreshCw, AlertTriangle, Loader2, ChevronRight,
  BarChart3, Brain, Globe, Zap
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

// ── Types ─────────────────────────────────────────────────────────────────────
type LadderStep = { id: string; step_number: number; target_amount: number; status: string };
type TradeEntry = { id: string; ladder_step: number; direction: string; entry_price: number; exit_price?: number; result_usd?: number; status: string; opened_at: string; lot_size?: number };
type Withdrawal = { id: string; ladder_step: number; amount_usd: number; withdrawn_at: string };
type Message = { role: "user" | "assistant"; content: string; type?: "fundamental" | "technical" | "decision" | "chat" };
type SignalData = { configured: boolean; currentPrice: number; rsi: number; macd: any; vsa: any; signal: any; levels: any; positionSize: any; ladder: any; candles: any[] };

// ── Checklist Modal ───────────────────────────────────────────────────────────
function ChecklistModal({ strategy, onClose, onConfirm }: { strategy: "reversal" | "momentum"; onClose: () => void; onConfirm: (passed: boolean, checks: any) => void }) {
  const [checks, setChecks] = useState({ location_valid: false, volume_confirms: false, structure_valid: false, confirmation_present: false, clean_rr: false });
  const toggle = (key: string) => setChecks(p => ({ ...p, [key]: !(p as any)[key] }));
  const allPassed = Object.values(checks).every(Boolean);

  const items = strategy === "reversal"
    ? [
        { key: "location_valid", label: "Price at clear EXTREME (session high/low, range boundary)", sub: "Not middle of chart, not after breakout" },
        { key: "volume_confirms", label: "VOLUME SPIKE above recent bars + climactic behavior", sub: "Wide aggressive candles, emotional push, overextended" },
        { key: "structure_valid", label: "FAILURE SIGNAL present", sub: "Candle closes off highs (short) or off lows (long) — effort failed" },
        { key: "confirmation_present", label: "CONFIRMATION CANDLE next", sub: "Next candle confirms reversal — no confirmation = no trade" },
        { key: "clean_rr", label: "Clean 1.5R–2R available", sub: "SL above extreme high (short) or below extreme low (long)" },
      ]
    : [
        { key: "location_valid", label: "BREAK + ACCEPTANCE: held outside range for 2+ candles (5m)", sub: "Not just a wick — must close and hold" },
        { key: "volume_confirms", label: "Breakout candle: WIDE SPREAD + HIGH VOLUME", sub: "Weak volume = no trade" },
        { key: "structure_valid", label: "CLEAN STRUCTURE: HH+HL (bull) or LL+LH (bear)", sub: "Choppy = no trade" },
        { key: "confirmation_present", label: "PULLBACK complete: small candles, low volume", sub: "No pullback = no trade. Never enter on breakout candle." },
        { key: "clean_rr", label: "Entry on 1m/5m trigger after pullback, clean 1.5R–2R", sub: "SL below pullback low (long) or above pullback high (short)" },
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
          {items.map(item => (
            <button key={item.key} onClick={() => toggle(item.key)}
              className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all
                ${(checks as any)[item.key] ? "bg-[#10B98115] border-[#10B98140]" : "bg-[#1A1A1A] border-[#2D2D2D] hover:border-[#525252]"}`}>
              <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors
                ${(checks as any)[item.key] ? "bg-[#10B981] border-[#10B981]" : "border-[#525252]"}`}>
                {(checks as any)[item.key] && <Check size={11} className="text-white" />}
              </div>
              <div>
                <p className="text-[13px] font-semibold text-[#C8C5C0] leading-snug">{item.label}</p>
                <p className="text-[11px] text-[#525252] mt-0.5">{item.sub}</p>
              </div>
            </button>
          ))}
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

// ── Main Component ────────────────────────────────────────────────────────────
export default function TradingPage() {
  const [ladder, setLadder] = useState<LadderStep[]>([]);
  const [entries, setEntries] = useState<TradeEntry[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [goldPrice, setGoldPrice] = useState<number | null>(null);
  const [signalData, setSignalData] = useState<SignalData | null>(null);
  const [signalLoading, setSignalLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"terminal" | "trades" | "journal">("terminal");
  const [analysisTab, setAnalysisTab] = useState<"signal" | "fundamental" | "technical" | "chat">("signal");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [showChecklist, setShowChecklist] = useState<"reversal" | "momentum" | null>(null);
  const [showLogTrade, setShowLogTrade] = useState(false);
  const [analysisContent, setAnalysisContent] = useState<Record<string, string>>({});
  const [analysisLoading, setAnalysisLoading] = useState<Record<string, boolean>>({});
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadAll(); }, []);
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
  }

  async function loadSignals() {
    setSignalLoading(true);
    try {
      const res = await fetch("/api/trading/signals");
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
        body: JSON.stringify({ type, currentPrice: goldPrice, signalData }),
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
        body: JSON.stringify({ type: "decision", question: userMsg, currentPrice: goldPrice, signalData }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: "assistant", content: data.content ?? "No response.", type: "decision" }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Error getting analysis." }]);
    }
    setChatLoading(false);
  }

  async function saveTrade(form: any) {
    await fetch("/api/trading", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "log_trade",
        trade: {
          ladder_step: form.ladder_step,
          direction: form.direction,
          instrument: "XAUUSD",
          entry_price: parseFloat(form.entry_price),
          lot_size: parseFloat(form.lot_size),
          stop_loss: parseFloat(form.stop_loss),
          take_profit: parseFloat(form.take_profit),
          notes: form.notes,
          account_type: form.account_type,
          status: "open",
        },
      }),
    });
    setShowLogTrade(false);
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
          <p className="text-[10px] text-[#525252]">XAU/USD · 1H</p>
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
      </div>

      {/* ── Center: Chart + Indicators ─────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Tab bar */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-[#1E1E1E] bg-[#111111] shrink-0">
          {[
            { id: "terminal", label: "Terminal", icon: BarChart3 },
            { id: "trades", label: `Trades ${openTrades.length > 0 ? `(${openTrades.length} open)` : ""}`, icon: TrendingUp },
            { id: "journal", label: "Journal", icon: Brain },
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
                <span className="text-[11px] font-bold text-[#737373] uppercase tracking-wider">XAU/USD · 1H</span>
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
          </div>
        )}

        {activeTab === "trades" && (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[14px] font-bold text-[#C8C5C0]">Trade Log</h2>
              <button onClick={() => setShowLogTrade(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#B5622A] text-white text-[11px] font-bold rounded-lg hover:bg-[#9A4E20] transition-colors">
                <Plus size={11} /> Log Trade
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
                        <p className="text-[12px] font-semibold text-[#C8C5C0]">XAUUSD @ ${t.entry_price}</p>
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
                    <p className="text-[12px] text-[#C8C5C0]">XAUUSD @ ${t.entry_price} → ${t.exit_price ?? "—"}</p>
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
          <div className="flex-1 overflow-y-auto p-4">
            <div className="text-center py-16">
              <p className="text-[13px] text-[#525252]">Session journal coming in next update</p>
              <p className="text-[11px] text-[#3A3A3A] mt-1">Track rule compliance, emotional state, and session notes</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Right: Analysis + AI ───────────────────────────────────────────── */}
      <div className="w-[360px] shrink-0 flex flex-col border-l border-[#1E1E1E] bg-[#111111]">
        {/* Analysis tabs */}
        <div className="flex items-center gap-0.5 px-3 py-2 border-b border-[#1E1E1E] shrink-0">
          {[
            { id: "signal", label: "Signal" },
            { id: "fundamental", label: "Fundamental" },
            { id: "technical", label: "Technical" },
            { id: "chat", label: "AI Coach" },
          ].map(t => (
            <button key={t.id} onClick={() => setAnalysisTab(t.id as any)}
              className={`flex-1 py-1.5 rounded-lg text-[10px] font-semibold transition-colors
                ${analysisTab === t.id ? "bg-[#1E1E1E] text-[#C8C5C0]" : "text-[#525252] hover:text-[#737373]"}`}>
              {t.label}
            </button>
          ))}
        </div>

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
          <div className="flex-1 overflow-y-auto p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold text-[#737373] uppercase tracking-wider">Fundamental Analysis</p>
              <button onClick={() => runAnalysis("fundamental")} disabled={analysisLoading.fundamental}
                className="flex items-center gap-1 text-[10px] text-[#B5622A] hover:text-[#9A4E20] transition-colors">
                {analysisLoading.fundamental ? <Loader2 size={10} className="animate-spin" /> : <Globe size={10} />}
                Refresh
              </button>
            </div>
            {!analysisContent.fundamental && (
              <div className="text-center py-8">
                <p className="text-[12px] text-[#525252] mb-4">CME data, COT positioning, macro outlook</p>
                <button onClick={() => runAnalysis("fundamental")} disabled={analysisLoading.fundamental}
                  className="px-4 py-2 bg-[#B5622A] text-white text-[12px] font-semibold rounded-lg hover:bg-[#9A4E20] disabled:opacity-40 transition-colors flex items-center gap-2 mx-auto">
                  {analysisLoading.fundamental ? <Loader2 size={12} className="animate-spin" /> : <Globe size={12} />}
                  Run Fundamental Analysis
                </button>
              </div>
            )}
            {analysisContent.fundamental && (
              <div className="text-[12px] text-[#C8C5C0] leading-relaxed whitespace-pre-wrap">
                {analysisContent.fundamental}
              </div>
            )}
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
                      <p className="text-[9px] text-[#525252] mt-1">Analysed by Claude Sonnet</p>
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
              <p className="text-[9px] text-[#3A3A3A] mt-1.5 text-center">Claude Sonnet for decisions · GPT-4.1 for research</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      {showChecklist && (
        <ChecklistModal
          strategy={showChecklist}
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
    </div>
  );
}
type SignalData = { configured: boolean; currentPrice: number; rsi: number; macd: any; vsa: any; signal: any; levels: any; positionSize: any; ladder: any; candles: any[] };