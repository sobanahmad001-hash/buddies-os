"use client";
import { useEffect, useState, useRef } from "react";
import { TrendingUp, Plus, DollarSign, Send, ChevronRight, Check, X } from "lucide-react";

type LadderStep = { id: string; step_number: number; target_amount: number; status: string; completed_at?: string };
type TradeEntry = { id: string; ladder_step: number; direction: string; instrument: string; entry_price: number; exit_price?: number; result_usd?: number; status: string; opened_at: string };
type Withdrawal = { id: string; ladder_step: number; amount_usd: number; withdrawn_at: string };
type Message = { role: "user" | "assistant"; content: string };

const ACCENT = "#E8521A";

export default function TradingPage() {
  const [ladder, setLadder] = useState<LadderStep[]>([]);
  const [entries, setEntries] = useState<TradeEntry[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [goldPrice, setGoldPrice] = useState<number | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [tab, setTab] = useState<"overview"|"trades"|"chat">("overview");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [showLogTrade, setShowLogTrade] = useState(false);
  const [showWithdrawal, setShowWithdrawal] = useState(false);
  const [tradeForm, setTradeForm] = useState({ ladder_step: 1, broker: "exness", direction: "buy", entry_price: "", lot_size: "", notes: "" });
  const [withdrawalForm, setWithdrawalForm] = useState({ ladder_step: 1, amount_usd: "", balance_before: "", notes: "" });
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { load(); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function load() {
    const res = await fetch("/api/trading");
    const data = await res.json();
    setLadder(data.ladder ?? []);
    setEntries(data.entries ?? []);
    setWithdrawals(data.withdrawals ?? []);
    setGoldPrice(data.gold_price);
    setStats(data.stats);
  }

  async function logTrade() {
    await fetch("/api/trading", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "log_trade", trade: { ...tradeForm, entry_price: parseFloat(tradeForm.entry_price), lot_size: parseFloat(tradeForm.lot_size), status: "open" } }),
    });
    setShowLogTrade(false);
    setTradeForm({ ladder_step: 1, broker: "exness", direction: "buy", entry_price: "", lot_size: "", notes: "" });
    await load();
  }

  async function logWithdrawal() {
    await fetch("/api/trading", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "log_withdrawal", withdrawal: { ...withdrawalForm, amount_usd: parseFloat(withdrawalForm.amount_usd), balance_before: parseFloat(withdrawalForm.balance_before) } }),
    });
    setShowWithdrawal(false);
    setWithdrawalForm({ ladder_step: 1, amount_usd: "", balance_before: "", notes: "" });
    await load();
  }

  async function advanceStep(currentStep: number) {
    if (!confirm(`Mark Step ${currentStep} complete and activate Step ${currentStep + 1}?`)) return;
    await fetch("/api/trading", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "advance_step", current_step: currentStep }),
    });
    await load();
  }

  async function sendChat() {
    if (!input.trim() || chatLoading) return;
    const userMsg: Message = { role: "user", content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setChatLoading(true);
    const res = await fetch("/api/trading/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: input, history: messages }),
    });
    const data = await res.json();
    setMessages(prev => [...prev, { role: "assistant", content: data.reply ?? "Error getting response" }]);
    setChatLoading(false);
  }

  const activeStep = ladder.find(s => s.status === "active");
  const nextStep = activeStep ? ladder.find(s => s.step_number === activeStep.step_number + 1) : null;

  return (
    <div className="flex-1 overflow-auto bg-[#F7F5F2]">
      {/* Header */}
      <div className="bg-[#0F0F0F] text-white px-6 py-5">
        <div className="max-w-[900px] flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">📈</span>
              <h1 className="text-[20px] font-bold">Trading Agent</h1>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#E8521A20] text-[#E8521A] font-semibold border border-[#E8521A40]">Gold Ladder</span>
            </div>
            <p className="text-white/40 text-xs">XAU/USD · Doubling ladder · 50% weekly withdrawal</p>
          </div>
          <div className="text-right">
            {goldPrice && <div className="text-[22px] font-bold text-[#E8521A]">${goldPrice.toFixed(2)}</div>}
            <div className="text-white/40 text-[10px]">XAU/USD live</div>
          </div>
        </div>
      </div>

      <div className="max-w-[900px] px-6 py-5">
        {/* Stats strip */}
        {stats && (
          <div className="grid grid-cols-4 gap-3 mb-5">
            {[
              { label: "Active Step", value: stats.active_step ? `Step ${stats.active_step.step_number}` : "—", sub: stats.active_step ? `$${stats.active_step.target_amount} target` : "" },
              { label: "Steps Done", value: `${stats.completed_steps}/20`, sub: "ladder progress" },
              { label: "Total P&L", value: `$${stats.total_pnl_usd.toFixed(2)}`, sub: `${stats.win_rate ?? "—"}% win rate` },
              { label: "Withdrawn", value: `$${stats.total_withdrawn_usd.toFixed(2)}`, sub: "total taken out" },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-xl border border-[#E5E2DE] p-3 text-center">
                <div className="text-[10px] text-[#737373] uppercase tracking-wide mb-0.5">{s.label}</div>
                <div className="text-[16px] font-bold text-[#1A1A1A]">{s.value}</div>
                <div className="text-[10px] text-[#737373]">{s.sub}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-white border border-[#E5E2DE] p-1 rounded-xl w-fit mb-5">
          {(["overview","trades","chat"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`text-xs font-semibold px-5 py-2 rounded-lg capitalize transition-colors
                ${tab === t ? "bg-[#0F0F0F] text-white" : "text-[#737373] hover:text-[#1A1A1A]"}`}>
              {t}
            </button>
          ))}
        </div>

        {/* Overview tab */}
        {tab === "overview" && (
          <div className="space-y-4">
            {/* Active step card */}
            {activeStep && (
              <div className="bg-white rounded-2xl border-2 border-[#E8521A] p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-[11px] text-[#E8521A] font-bold uppercase tracking-wide mb-1">Active Step</div>
                    <div className="text-[22px] font-bold text-[#1A1A1A]">Step {activeStep.step_number}</div>
                    <div className="text-[#737373] text-sm">Target: <span className="font-bold text-[#1A1A1A]">${activeStep.target_amount.toLocaleString()}</span></div>
                  </div>
                  <div className="text-right">
                    {nextStep && <div className="text-[11px] text-[#737373]">Next: Step {nextStep.step_number} → ${nextStep.target_amount.toLocaleString()}</div>}
                    <button onClick={() => advanceStep(activeStep.step_number)}
                      className="mt-2 px-4 py-2 bg-[#10B981] text-white text-xs font-semibold rounded-xl hover:bg-[#059669] transition-colors flex items-center gap-1.5">
                      <Check size={12} /> Mark Complete
                    </button>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button onClick={() => setShowLogTrade(true)}
                    className="flex-1 py-2 bg-[#E8521A] text-white text-xs font-semibold rounded-xl hover:bg-[#c94415] flex items-center justify-center gap-1.5">
                    <Plus size={12} /> Log Trade
                  </button>
                  <button onClick={() => setShowWithdrawal(true)}
                    className="flex-1 py-2 bg-[#F0EDE9] text-[#737373] text-xs font-semibold rounded-xl hover:bg-[#E5E2DE] flex items-center justify-center gap-1.5">
                    <DollarSign size={12} /> Log Withdrawal
                  </button>
                </div>
              </div>
            )}

            {/* Ladder progress */}
            <div className="bg-white rounded-2xl border border-[#E5E2DE] p-5">
              <h3 className="text-[12px] font-semibold text-[#1A1A1A] uppercase tracking-wide mb-4">Ladder Progress</h3>
              <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                {ladder.map(step => (
                  <div key={step.id} className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors
                    ${step.status === "active" ? "bg-[#FFF8F5] border border-[#E8521A40]" :
                      step.status === "completed" ? "bg-[#ECFDF5]" : "bg-[#F7F5F2]"}`}>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0
                      ${step.status === "completed" ? "bg-[#10B981] text-white" :
                        step.status === "active" ? "bg-[#E8521A] text-white" : "bg-[#E5E2DE] text-[#737373]"}`}>
                      {step.status === "completed" ? <Check size={10} /> : step.step_number}
                    </div>
                    <span className="text-[12px] font-semibold text-[#1A1A1A]">
                      ${step.target_amount >= 1000 ? `${(step.target_amount/1000).toFixed(0)}K` : step.target_amount}
                    </span>
                    <span className={`text-[10px] ml-auto font-semibold capitalize
                      ${step.status === "active" ? "text-[#E8521A]" :
                        step.status === "completed" ? "text-[#10B981]" : "text-[#B0ADA9]"}`}>
                      {step.status}
                    </span>
                    {step.completed_at && (
                      <span className="text-[10px] text-[#B0ADA9]">{new Date(step.completed_at).toLocaleDateString()}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Trades tab */}
        {tab === "trades" && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <div className="text-sm font-semibold">{entries.filter(e => e.status === "open").length} open · {entries.filter(e => e.status === "closed").length} closed</div>
              <button onClick={() => setShowLogTrade(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#E8521A] text-white text-xs font-semibold rounded-xl hover:bg-[#c94415]">
                <Plus size={12} /> Log Trade
              </button>
            </div>
            <div className="space-y-2">
              {entries.map(e => (
                <div key={e.id} className="bg-white rounded-xl border border-[#E5E2DE] p-4 flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${e.status === "open" ? "bg-[#E8521A]" : e.result_usd && e.result_usd > 0 ? "bg-[#10B981]" : "bg-[#EF4444]"}`} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold uppercase text-[#1A1A1A]">{e.direction}</span>
                      <span className="text-xs text-[#737373]">{e.instrument}</span>
                      <span className="text-[10px] bg-[#F0EDE9] text-[#737373] px-1.5 py-0.5 rounded">Step {e.ladder_step}</span>
                    </div>
                    <div className="text-[11px] text-[#737373] mt-0.5">
                      Entry: {e.entry_price}
                      {e.exit_price && ` → Exit: ${e.exit_price}`}
                    </div>
                  </div>
                  <div className="text-right">
                    {e.result_usd != null && (
                      <div className={`text-sm font-bold ${e.result_usd > 0 ? "text-[#10B981]" : "text-[#EF4444]"}`}>
                        {e.result_usd > 0 ? "+" : ""}${e.result_usd.toFixed(2)}
                      </div>
                    )}
                    <div className="text-[10px] text-[#737373]">{e.status}</div>
                  </div>
                </div>
              ))}
              {entries.length === 0 && <p className="text-sm text-[#737373] text-center py-8">No trades logged yet.</p>}
            </div>
          </div>
        )}

        {/* Chat tab */}
        {tab === "chat" && (
          <div className="flex flex-col h-[500px]">
            <div className="flex-1 overflow-y-auto space-y-4 mb-4">
              {messages.length === 0 && (
                <div className="text-center py-12">
                  <div className="text-3xl mb-3">📈</div>
                  <p className="text-sm font-semibold text-[#1A1A1A] mb-1">Gold Ladder Assistant</p>
                  <p className="text-xs text-[#737373]">Ask about your ladder position, trade signals, withdrawal timing, or strategy analysis.</p>
                  <div className="flex flex-wrap gap-2 justify-center mt-4">
                    {["What's my current position?","Should I advance to the next step?","Analyze my win rate","When should I withdraw?"].map(s => (
                      <button key={s} onClick={() => { setInput(s); }}
                        className="text-xs px-3 py-1.5 bg-white border border-[#E5E2DE] rounded-lg hover:border-[#E8521A] transition-colors">
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs shrink-0 ${m.role === "user" ? "bg-[#E8521A] text-white" : "bg-[#0F0F0F] text-white"}`}>
                    {m.role === "user" ? "Y" : "📈"}
                  </div>
                  <div className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap
                    ${m.role === "user" ? "bg-[#E8521A] text-white" : "bg-white border border-[#E5E2DE] text-[#1A1A1A]"}`}>
                    {m.content}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-[#0F0F0F] flex items-center justify-center text-xs text-white shrink-0">📈</div>
                  <div className="bg-white border border-[#E5E2DE] rounded-2xl px-4 py-3 flex gap-1">
                    {[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-[#B0ADA9] animate-bounce" style={{ animationDelay: `${i*0.15}s` }} />)}
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
            <div className="flex gap-2">
              <input value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && sendChat()}
                placeholder="Ask about your trading strategy..."
                className="flex-1 text-sm px-4 py-3 border border-[#E5E2DE] rounded-xl focus:outline-none focus:border-[#E8521A] bg-white" />
              <button onClick={sendChat} disabled={chatLoading || !input.trim()}
                className="px-4 py-3 bg-[#E8521A] text-white rounded-xl hover:bg-[#c94415] disabled:opacity-40 transition-colors">
                <Send size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Log Trade Modal */}
      {showLogTrade && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-[400px]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-[#1A1A1A]">Log Trade</h3>
              <button onClick={() => setShowLogTrade(false)}><X size={18} className="text-[#737373]" /></button>
            </div>
            <div className="space-y-3">
              {[
                { key: "ladder_step", label: "Ladder Step", type: "number" },
                { key: "entry_price", label: "Entry Price (XAU/USD)", type: "number" },
                { key: "lot_size", label: "Lot Size", type: "number" },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-[11px] font-semibold text-[#737373] uppercase tracking-wide">{f.label}</label>
                  <input type={f.type} value={(tradeForm as any)[f.key]}
                    onChange={e => setTradeForm(p => ({ ...p, [f.key]: e.target.value }))}
                    className="w-full mt-1 text-sm px-3 py-2 border border-[#E5E2DE] rounded-xl focus:outline-none focus:border-[#E8521A]" />
                </div>
              ))}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-[#737373] uppercase tracking-wide">Direction</label>
                  <select value={tradeForm.direction} onChange={e => setTradeForm(p => ({ ...p, direction: e.target.value }))}
                    className="w-full mt-1 text-sm px-3 py-2 border border-[#E5E2DE] rounded-xl bg-white focus:outline-none">
                    <option value="buy">Buy</option>
                    <option value="sell">Sell</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-[#737373] uppercase tracking-wide">Broker</label>
                  <select value={tradeForm.broker} onChange={e => setTradeForm(p => ({ ...p, broker: e.target.value }))}
                    className="w-full mt-1 text-sm px-3 py-2 border border-[#E5E2DE] rounded-xl bg-white focus:outline-none">
                    <option value="exness">Exness</option>
                    <option value="icmarkets">IC Markets</option>
                  </select>
                </div>
              </div>
              <textarea value={tradeForm.notes} onChange={e => setTradeForm(p => ({ ...p, notes: e.target.value }))}
                placeholder="Notes..." rows={2}
                className="w-full text-sm px-3 py-2 border border-[#E5E2DE] rounded-xl focus:outline-none resize-none" />
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={logTrade} className="flex-1 py-2.5 bg-[#E8521A] text-white font-semibold rounded-xl text-sm hover:bg-[#c94415]">Log Trade</button>
              <button onClick={() => setShowLogTrade(false)} className="flex-1 py-2.5 bg-[#F0EDE9] text-[#737373] font-semibold rounded-xl text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Log Withdrawal Modal */}
      {showWithdrawal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-[360px]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-[#1A1A1A]">Log Withdrawal</h3>
              <button onClick={() => setShowWithdrawal(false)}><X size={18} className="text-[#737373]" /></button>
            </div>
            <div className="space-y-3">
              {[
                { key: "ladder_step", label: "Ladder Step", type: "number" },
                { key: "amount_usd", label: "Amount Withdrawn ($)", type: "number" },
                { key: "balance_before", label: "Balance Before ($)", type: "number" },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-[11px] font-semibold text-[#737373] uppercase tracking-wide">{f.label}</label>
                  <input type={f.type} value={(withdrawalForm as any)[f.key]}
                    onChange={e => setWithdrawalForm(p => ({ ...p, [f.key]: e.target.value }))}
                    className="w-full mt-1 text-sm px-3 py-2 border border-[#E5E2DE] rounded-xl focus:outline-none focus:border-[#E8521A]" />
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={logWithdrawal} className="flex-1 py-2.5 bg-[#10B981] text-white font-semibold rounded-xl text-sm hover:bg-[#059669]">Log Withdrawal</button>
              <button onClick={() => setShowWithdrawal(false)} className="flex-1 py-2.5 bg-[#F0EDE9] text-[#737373] font-semibold rounded-xl text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
