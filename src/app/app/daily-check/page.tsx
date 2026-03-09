"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

type Log = { id: string; timestamp: string; sleep_hours: number | null; sleep_quality: number | null; mood_tag: string | null; stress: number | null; confidence: number | null; notes: string | null; };

const MOODS = ["focused", "calm", "anxious", "frustrated", "bored", "rushed", "angry", "fearful", "overconfident", "exhausted"];

function timeAgo(d: string) { const diff = Date.now() - new Date(d).getTime(); const m = Math.floor(diff/60000); if (m < 60) return `${m}m ago`; const h = Math.floor(m/60); if (h < 24) return `${h}h ago`; return `${Math.floor(h/24)}d ago`; }

export default function DailyCheckPage() {
  const router = useRouter();
  const [logs, setLogs] = useState<Log[]>([]);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({ sleep_hours: "", sleep_quality: "3", mood_tag: "", stress: "3", confidence: "3", notes: "" });

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }
    const { data } = await supabase.from("behavior_logs").select("*").eq("user_id", user.id).order("timestamp", { ascending: false }).limit(10);
    setLogs(data ?? []);
  }

  useEffect(() => { load(); }, []);

  async function handleSubmit() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("behavior_logs").insert({
      user_id: user.id,
      timestamp: new Date().toISOString(),
      sleep_hours: form.sleep_hours ? parseFloat(form.sleep_hours) : null,
      sleep_quality: parseInt(form.sleep_quality),
      mood_tag: form.mood_tag || null,
      stress: parseInt(form.stress),
      confidence: parseInt(form.confidence),
      notes: form.notes || null,
    });
    setSaved(true);
    setForm({ sleep_hours: "", sleep_quality: "3", mood_tag: "", stress: "3", confidence: "3", notes: "" });
    setTimeout(() => setSaved(false), 3000);
    load();
  }

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  function Scale({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
    return (
      <div>
        <label className="text-[11px] font-semibold text-[#737373] uppercase tracking-wide block mb-2">{label}</label>
        <div className="flex gap-2">
          {[1,2,3,4,5].map(n => (
            <button key={n} onClick={() => onChange(String(n))}
              className={`w-9 h-9 rounded-lg text-[13px] font-semibold border transition-colors ${value === String(n) ? "bg-[#1A1A1A] text-white border-[#1A1A1A]" : "bg-white text-[#737373] border-[#E5E2DE] hover:border-[#CC785C]"}`}>
              {n}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-8 max-w-[800px]">
        <div className="mb-6">
          <h1 className="text-[20px] font-semibold text-[#1A1A1A]">Daily Check</h1>
          <p className="text-[12px] text-[#737373] mt-1">{today}</p>
        </div>

        {/* Form */}
        <div className="bg-white border border-[#E5E2DE] rounded-xl p-6 mb-8 space-y-5">
          <h2 className="text-[14px] font-semibold text-[#1A1A1A]">Log today</h2>

          {/* Sleep */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-semibold text-[#737373] uppercase tracking-wide block mb-2">Sleep Hours</label>
              <input type="number" step="0.5" min="0" max="12" value={form.sleep_hours}
                onChange={e => setForm({...form, sleep_hours: e.target.value})}
                placeholder="7.5"
                className="w-full border border-[#E5E2DE] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#CC785C] placeholder:text-[#999]" />
            </div>
            <Scale label="Sleep Quality" value={form.sleep_quality} onChange={v => setForm({...form, sleep_quality: v})} />
          </div>

          {/* Mood */}
          <div>
            <label className="text-[11px] font-semibold text-[#737373] uppercase tracking-wide block mb-2">Mood</label>
            <div className="flex flex-wrap gap-2">
              {MOODS.map(m => (
                <button key={m} onClick={() => setForm({...form, mood_tag: form.mood_tag === m ? "" : m})}
                  className={`text-[12px] px-3 py-1.5 rounded-lg border transition-colors ${form.mood_tag === m ? "bg-[#1A1A1A] text-white border-[#1A1A1A]" : "bg-white text-[#737373] border-[#E5E2DE] hover:border-[#CC785C]"}`}>
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Stress + Confidence */}
          <div className="grid grid-cols-2 gap-4">
            <Scale label="Stress (1=low 5=high)" value={form.stress} onChange={v => setForm({...form, stress: v})} />
            <Scale label="Confidence (1=low 5=high)" value={form.confidence} onChange={v => setForm({...form, confidence: v})} />
          </div>

          {/* Notes */}
          <div>
            <label className="text-[11px] font-semibold text-[#737373] uppercase tracking-wide block mb-2">Notes</label>
            <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})}
              placeholder="Anything worth noting today..."
              rows={3}
              className="w-full border border-[#E5E2DE] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#CC785C] placeholder:text-[#999] resize-none" />
          </div>

          <button onClick={handleSubmit}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#1A1A1A] text-white text-[13px] font-semibold rounded-lg hover:bg-[#333] transition-colors">
            {saved ? <><CheckCircle2 size={14} /> Saved</> : "Log today"}
          </button>
        </div>

        {/* History */}
        {logs.length > 0 && (
          <div>
            <h2 className="text-[14px] font-semibold text-[#1A1A1A] mb-4">Recent Logs</h2>
            <div className="space-y-2">
              {logs.map(log => (
                <div key={log.id} className="bg-white border border-[#E5E2DE] rounded-xl px-5 py-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      {log.mood_tag && (
                        <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-[#F7F5F2] text-[#737373] border border-[#E5E2DE] capitalize">{log.mood_tag}</span>
                      )}
                      {log.sleep_hours && <span className="text-[12px] text-[#737373]">🌙 {log.sleep_hours}h</span>}
                      {log.stress && <span className="text-[12px] text-[#737373]">stress {log.stress}/5</span>}
                      {log.confidence && <span className="text-[12px] text-[#737373]">confidence {log.confidence}/5</span>}
                    </div>
                    <span className="text-[11px] text-[#737373]">{timeAgo(log.timestamp)}</span>
                  </div>
                  {log.notes && <p className="text-[12px] text-[#404040]">{log.notes}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
