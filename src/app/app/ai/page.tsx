"use client";

import { useEffect, useRef, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Send, Loader2, Sparkles, Check, X, CheckCheck,
         FolderKanban, Scale, ShieldCheck, AlertTriangle, Sun } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

type Message = { role: "user" | "assistant"; content: string };

type ExtractedItem = {
  id: string;
  type: "project_update" | "decision" | "rule" | "blocker" | "daily_check";
  project?: string;
  content: string;
  update_type?: string;
  next_actions?: string;
  verdict?: string;
  probability?: number;
  rule_text?: string;
  severity?: number;
  context?: string;
  mood?: string;
  sleep_hours?: number;
  stress?: number;
  notes?: string;
  status: "pending" | "saved" | "dismissed";
};

type ThreadEntry = { message: Message; extractions?: ExtractedItem[] };

const STARTERS = [
  "What did I work on this week?",
  "Which project is falling behind?",
  "What should I focus on today?",
  "Summarize my recent decisions",
];

const TYPE_CONFIG: Record<string, { icon: any; label: string; color: string; bg: string }> = {
  project_update: { icon: FolderKanban,   label: "Project Update", color: "text-[#2D6A4F]", bg: "bg-[#DCFCE7]" },
  blocker:        { icon: AlertTriangle,  label: "Blocker",        color: "text-[#EF4444]", bg: "bg-[#FEE2E2]" },
  decision:       { icon: Scale,          label: "Decision",       color: "text-[#2C5F8A]", bg: "bg-[#DBEAFE]" },
  rule:           { icon: ShieldCheck,    label: "Rule",           color: "text-[#92400E]", bg: "bg-[#FEF9C3]" },
  daily_check:    { icon: Sun,            label: "Daily Check",    color: "text-[#7C3AED]", bg: "bg-[#EDE9FE]" },
};

// Don't extract from pure questions
function isQuestion(text: string) {
  const t = text.trim().toLowerCase();
  return (
    t.endsWith("?") ||
    t.startsWith("what ") ||
    t.startsWith("which ") ||
    t.startsWith("how ") ||
    t.startsWith("when ") ||
    t.startsWith("why ") ||
    t.startsWith("summarize") ||
    t.startsWith("show ") ||
    t.startsWith("give me") ||
    t.startsWith("tell me") ||
    t.length < 30
  );
}

function ExtractionChip({ item, onSave, onDismiss }: {
  item: ExtractedItem; onSave: () => void; onDismiss: () => void;
}) {
  const config = TYPE_CONFIG[item.type] ?? TYPE_CONFIG.project_update;
  const Icon = config.icon;

  return (
    <div className={`flex items-start gap-3 px-3 py-2.5 rounded-xl border transition-all ${
      item.status === "saved"      ? "bg-[#F0FDF4] border-[#BBF7D0] opacity-60" :
      item.status === "dismissed"  ? "opacity-30 bg-[#F9FAFB] border-[#E5E7EB]" :
      "bg-white border-[#E5E2DE] hover:border-[#CC785C]/30"
    }`}>
      <div className={`w-6 h-6 rounded-lg ${config.bg} flex items-center justify-center shrink-0 mt-0.5`}>
        <Icon size={11} className={config.color} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={`text-[10px] font-bold uppercase tracking-wide ${config.color}`}>{config.label}</span>
          {item.project && <span className="text-[10px] text-[#737373]">→ {item.project}</span>}
        </div>
        <p className="text-[12px] text-[#404040] leading-snug">{item.rule_text ?? item.content}</p>
        {item.next_actions && (
          <p className="text-[11px] text-[#737373] mt-0.5 italic">next: {item.next_actions}</p>
        )}
      </div>
      {item.status === "pending" && (
        <div className="flex gap-1 shrink-0 mt-0.5">
          <button onClick={onSave}
            className="w-7 h-7 rounded-lg bg-[#1A1A1A] flex items-center justify-center hover:bg-[#333] transition-colors">
            <Check size={12} className="text-white" />
          </button>
          <button onClick={onDismiss}
            className="w-7 h-7 rounded-lg border border-[#E5E2DE] flex items-center justify-center hover:border-[#EF4444] hover:text-[#EF4444] transition-colors text-[#999]">
            <X size={12} />
          </button>
        </div>
      )}
      {item.status === "saved" && (
        <span className="text-[10px] text-[#2D6A4F] font-semibold shrink-0 mt-1">Saved ✓</span>
      )}
    </div>
  );
}

function AIPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [thread, setThread] = useState<ThreadEntry[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const didAutoSend = useRef(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.push("/login");
    });
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread, loading, extracting]);

  // Handle ?q= param from dashboard / command redirect
  useEffect(() => {
    const q = params.get("q");
    if (q && !didAutoSend.current) {
      didAutoSend.current = true;
      setInput(q);
      setTimeout(() => send(q), 100);
    }
  }, [params]);

  const send = useCallback(async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    setInput("");

    const userMsg: Message = { role: "user", content };
    const allMessages = [...thread.map(t => t.message), userMsg];

    setThread(prev => [...prev, { message: userMsg }]);
    setLoading(true);

    // AI response
    const aiRes = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: allMessages }),
    });
    const aiData = await aiRes.json();
    const assistantMsg: Message = { role: "assistant", content: aiData.text ?? "Error." };

    setLoading(false);
    setThread(prev => [...prev, { message: assistantMsg }]);

    // Only extract if not a pure question
    if (!isQuestion(content)) {
      setExtracting(true);
      const extractRes = await fetch("/api/ai/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content }),
      });
      const extractData = await extractRes.json();
      setExtracting(false);

      const items: ExtractedItem[] = (extractData.items ?? []).map((item: any, i: number) => ({
        ...item,
        id: `${Date.now()}-${i}`,
        status: "pending" as const,
      }));

      if (items.length > 0) {
        setThread(prev => {
          const updated = [...prev];
          // Attach to the user message (find by content match)
          for (let i = updated.length - 1; i >= 0; i--) {
            if (updated[i].message.role === "user" && updated[i].message.content === content) {
              updated[i] = { ...updated[i], extractions: items };
              break;
            }
          }
          return updated;
        });
      }
    }
  }, [input, loading, thread]);

  async function handleSave(msgIdx: number, itemId: string) {
    const item = thread[msgIdx]?.extractions?.find(e => e.id === itemId);
    if (!item) return;

    setThread(prev => prev.map((t, i) => i !== msgIdx ? t : {
      ...t,
      extractions: t.extractions?.map(e =>
        e.id === itemId ? { ...e, status: "saved" as const } : e
      )
    }));

    await fetch("/api/ai/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item }),
    });
  }

  function handleDismiss(msgIdx: number, itemId: string) {
    setThread(prev => prev.map((t, i) => i !== msgIdx ? t : {
      ...t,
      extractions: t.extractions?.map(e =>
        e.id === itemId ? { ...e, status: "dismissed" as const } : e
      )
    }));
  }

  async function handleSaveAll() {
    for (let msgIdx = 0; msgIdx < thread.length; msgIdx++) {
      const pending = thread[msgIdx].extractions?.filter(e => e.status === "pending") ?? [];
      for (const item of pending) {
        await handleSave(msgIdx, item.id);
      }
    }
  }

  const pendingCount = thread.reduce((acc, t) =>
    acc + (t.extractions?.filter(e => e.status === "pending").length ?? 0), 0
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ height: "100vh" }}>
      {/* Header */}
      <div className="px-8 pt-5 pb-4 shrink-0 border-b border-[#E5E2DE] flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles size={15} className="text-[#CC785C]" />
            <h1 className="text-[17px] font-semibold text-[#1A1A1A]">AI Assistant</h1>
          </div>
          <p className="text-[11px] text-[#737373] mt-0.5">Talk naturally. Items are extracted and saved with one tap.</p>
        </div>
        {pendingCount > 0 && (
          <button onClick={handleSaveAll}
            className="flex items-center gap-2 px-4 py-2 bg-[#1A1A1A] text-white text-[12px] font-semibold rounded-lg hover:bg-[#333] transition-colors">
            <CheckCheck size={13} />
            Save all ({pendingCount})
          </button>
        )}
      </div>

      {/* Thread */}
      <div className="flex-1 overflow-auto px-8 py-5 space-y-4">
        {thread.length === 0 && (
          <div className="space-y-4 max-w-xl">
            <div>
              <p className="text-[12px] text-[#737373] font-medium mb-2">Quick questions:</p>
              <div className="grid grid-cols-2 gap-2">
                {STARTERS.map(s => (
                  <button key={s} onClick={() => send(s)}
                    className="text-left text-[12px] text-[#404040] bg-white border border-[#E5E2DE] rounded-xl px-4 py-3 hover:border-[#CC785C]/40 transition-colors">
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div className="bg-[#1A1A1A] rounded-xl p-5">
              <p className="text-[11px] font-semibold text-[#CC785C] uppercase tracking-wide mb-2">Try this</p>
              <p className="text-[13px] text-[#CCC] leading-relaxed italic">
                "Spent the morning on Raahbaan, finalized investor deck. Blocked on legal structure — need to choose between LLC and LTD by Friday. Should never rush entity decisions. Slept 5 hours, feeling anxious."
              </p>
              <p className="text-[11px] text-[#666] mt-3">→ Extracts: project update · blocker · decision · rule · daily check</p>
            </div>
          </div>
        )}

        {thread.map((entry, msgIdx) => (
          <div key={msgIdx} className="space-y-2">
            <div className={`flex ${entry.message.role === "user" ? "justify-end" : "justify-start"}`}>
              {entry.message.role === "user" ? (
                <div className="bg-[#1A1A1A] text-white rounded-2xl rounded-br-sm px-5 py-3 max-w-xl">
                  <p className="text-[13px] leading-relaxed">{entry.message.content}</p>
                </div>
              ) : (
                <div className="bg-white border border-[#E5E2DE] rounded-2xl rounded-bl-sm px-5 py-4 max-w-xl">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Sparkles size={11} className="text-[#CC785C]" />
                    <span className="text-[10px] font-semibold text-[#CC785C] uppercase tracking-wide">Buddies AI</span>
                  </div>
                  <p className="text-[13px] text-[#404040] leading-relaxed whitespace-pre-wrap">{entry.message.content}</p>
                </div>
              )}
            </div>

            {entry.extractions && entry.extractions.length > 0 && (
              <div className="flex justify-end">
                <div className="max-w-xl w-full space-y-1.5">
                  <p className="text-[10px] text-[#737373] font-semibold uppercase tracking-wide px-1">
                    Extracted — tap ✓ to save
                  </p>
                  {entry.extractions.map(item => (
                    <ExtractionChip
                      key={item.id}
                      item={item}
                      onSave={() => handleSave(msgIdx, item.id)}
                      onDismiss={() => handleDismiss(msgIdx, item.id)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-[#E5E2DE] rounded-xl px-4 py-3 flex items-center gap-2">
              <Loader2 size={13} className="animate-spin text-[#CC785C]" />
              <span className="text-[12px] text-[#737373]">Thinking...</span>
            </div>
          </div>
        )}
        {extracting && (
          <div className="flex justify-end">
            <div className="bg-[#FAF9F7] border border-[#E5E2DE] rounded-xl px-3 py-2 flex items-center gap-2">
              <Loader2 size={11} className="animate-spin text-[#737373]" />
              <span className="text-[11px] text-[#737373]">Extracting items...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-8 pb-6 pt-3 shrink-0 border-t border-[#E5E2DE]">
        <div className="flex items-center gap-3 bg-white border border-[#E5E2DE] rounded-xl px-4 py-3 focus-within:border-[#CC785C]/40 transition-colors">
          <input
            className="flex-1 bg-transparent outline-none text-[13px] text-[#404040] placeholder:text-[#999]"
            placeholder="Talk about your work, blockers, decisions, how you're feeling..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
            disabled={loading}
            autoFocus
          />
          <button onClick={() => send()} disabled={!input.trim() || loading}
            className="w-8 h-8 rounded-lg bg-[#1A1A1A] flex items-center justify-center hover:bg-[#333] transition-colors disabled:opacity-40 shrink-0">
            {loading
              ? <Loader2 size={13} className="animate-spin text-white" />
              : <Send size={14} className="text-white" />
            }
          </button>
        </div>
        <p className="text-[10px] text-[#999] mt-2 text-center">
          Questions get answers only · Statements get extracted and saved
        </p>
      </div>
    </div>
  );
}

export default function AIPage() {
  return (
    <Suspense>
      <AIPageInner />
    </Suspense>
  );
}
