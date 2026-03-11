"use client";
import { useEffect, useState } from "react";

const VARIABLE_SUGGESTIONS: Record<string, string[]> = {
  seo: ["Keyword rankings", "Competitor backlinks", "Technical SEO issues", "Content gaps", "Page speed", "Schema markup"],
  marketing: ["Ad strategies", "Target audience", "Funnel structure", "Competitor campaigns", "Pricing models", "Social presence"],
  development: ["Framework comparison", "API options", "Architecture patterns", "Security practices", "Performance benchmarks"],
  trading: ["Market sentiment", "Volume spikes", "News catalysts", "Technical signals", "Liquidity zones", "Macro factors"],
  market: ["Industry trends", "Competitor landscape", "Customer segments", "Demand signals", "Pricing benchmarks"],
  competitor: ["Competitor products", "Pricing", "Marketing channels", "Strengths/weaknesses", "Customer reviews", "Team size"],
  general: ["Key facts", "Recent developments", "Main players", "Trends", "Risks", "Opportunities"],
};

function detectType(topic: string): string {
  const t = topic.toLowerCase();
  if (t.includes("seo") || t.includes("keyword") || t.includes("backlink")) return "seo";
  if (t.includes("market") || t.includes("industry") || t.includes("demand")) return "market";
  if (t.includes("trading") || t.includes("crypto") || t.includes("stock") || t.includes("gold")) return "trading";
  if (t.includes("competitor") || t.includes("vs ") || t.includes("compare")) return "competitor";
  if (t.includes("code") || t.includes("framework") || t.includes("api") || t.includes("dev")) return "development";
  if (t.includes("market") || t.includes("ad") || t.includes("campaign") || t.includes("brand")) return "marketing";
  return "general";
}

export default function ResearchPage() {
  const [topic, setTopic] = useState("");
  const [detectedType, setDetectedType] = useState("general");
  const [selectedVars, setSelectedVars] = useState<string[]>([]);
  const [step, setStep] = useState<"input"|"variables"|"running"|"result">("input");
  const [result, setResult] = useState<any>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [linkedProject, setLinkedProject] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { loadSessions(); loadProjects(); }, []);

  async function loadSessions() {
    const res = await fetch("/api/research/sessions");
    const d = await res.json();
    setSessions(d.sessions ?? []);
  }

  async function loadProjects() {
    const res = await fetch("/api/projects");
    const d = await res.json();
    setProjects(d.projects ?? []);
  }

  function handleTopicSubmit() {
    if (!topic.trim()) return;
    const type = detectType(topic);
    setDetectedType(type);
    setSelectedVars(VARIABLE_SUGGESTIONS[type].slice(0, 3));
    setStep("variables");
  }

  function toggleVar(v: string) {
    setSelectedVars(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]);
  }

  async function runResearch() {
    setStep("running");
    setError("");
    try {
      const res = await fetch("/api/research/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, variables: selectedVars, project_id: linkedProject || null })
      });
      const d = await res.json();
      if (d.error) { setError(d.error); setStep("variables"); return; }
      setResult(d);
      setStep("result");
      loadSessions();
    } catch (e: any) {
      setError(e.message);
      setStep("variables");
    }
  }

  function reset() {
    setTopic(""); setSelectedVars([]); setStep("input"); setResult(null); setError(""); setLinkedProject("");
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Sidebar — history */}
      <div className="w-[220px] border-r border-[#E5E2DE] bg-[#FAFAFA] overflow-auto p-4 shrink-0">
        <div className="text-xs font-bold text-[#737373] uppercase tracking-wider mb-3">Research History</div>
        {sessions.length === 0 && <p className="text-xs text-[#B0ADA9]">No sessions yet</p>}
        {sessions.map((s: any) => (
          <button key={s.id} onClick={() => { setSelectedSession(s); setStep("result"); setResult(s); }}
            className={`w-full text-left px-3 py-2.5 rounded-lg mb-1.5 transition-colors ${selectedSession?.id === s.id ? "bg-[#E8521A]/10 border border-[#E8521A]/20" : "hover:bg-[#F0EDE9]"}`}>
            <div className="text-xs font-medium text-[#1A1A1A] truncate">{s.topic}</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`w-1.5 h-1.5 rounded-full ${s.status === "complete" ? "bg-green-500" : s.status === "running" ? "bg-yellow-500 animate-pulse" : "bg-red-400"}`} />
              <span className="text-[10px] text-[#737373]">{new Date(s.created_at).toLocaleDateString()}</span>
            </div>
          </button>
        ))}
      </div>

      {/* Main */}
      <div className="flex-1 overflow-auto p-8">
        {step === "input" && (
          <div className="max-w-[600px]">
            <h1 className="text-[20px] font-semibold text-[#1A1A1A] mb-1">Research</h1>
            <p className="text-sm text-[#737373] mb-8">Ask Buddies to research any topic — competitor, market, SEO, trading, development.</p>
            <div className="bg-white rounded-xl border border-[#E5E2DE] p-6">
              <label className="text-xs font-bold text-[#737373] uppercase tracking-wider mb-2 block">What do you want to research?</label>
              <textarea value={topic} onChange={e => setTopic(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleTopicSubmit())}
                placeholder="e.g. Marketing strategies for luxury limo companies in Virginia..."
                rows={3}
                className="w-full text-sm px-3 py-2.5 border border-[#E5E2DE] rounded-lg focus:outline-none focus:border-[#E8521A] resize-none mb-4" />
              <button onClick={handleTopicSubmit} disabled={!topic.trim()}
                className="px-5 py-2.5 bg-[#E8521A] text-white text-sm font-semibold rounded-lg hover:bg-[#c94415] disabled:opacity-40">
                Continue →
              </button>
            </div>
          </div>
        )}

        {step === "variables" && (
          <div className="max-w-[600px]">
            <button onClick={() => setStep("input")} className="text-xs text-[#737373] hover:text-[#1A1A1A] mb-6 flex items-center gap-1">← Back</button>
            <h2 className="text-[18px] font-semibold text-[#1A1A1A] mb-1">Select variables to analyze</h2>
            <p className="text-sm text-[#737373] mb-6">Topic: <span className="text-[#1A1A1A] font-medium">{topic}</span></p>

            {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">{error}</div>}

            <div className="bg-white rounded-xl border border-[#E5E2DE] p-5 mb-4">
              <div className="text-xs font-bold text-[#737373] uppercase tracking-wider mb-3">Suggested variables</div>
              <div className="flex flex-wrap gap-2">
                {VARIABLE_SUGGESTIONS[detectedType].map(v => (
                  <button key={v} onClick={() => toggleVar(v)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${selectedVars.includes(v) ? "bg-[#E8521A] text-white border-[#E8521A]" : "border-[#E5E2DE] text-[#404040] hover:border-[#E8521A]"}`}>
                    {v}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-[#E5E2DE] p-5 mb-4">
              <div className="text-xs font-bold text-[#737373] uppercase tracking-wider mb-3">Link to project (optional)</div>
              <select value={linkedProject} onChange={e => setLinkedProject(e.target.value)}
                className="w-full text-sm px-3 py-2 border border-[#E5E2DE] rounded-lg focus:outline-none focus:border-[#E8521A] bg-white">
                <option value="">No project</option>
                {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            <button onClick={runResearch} disabled={selectedVars.length === 0}
              className="w-full py-3 bg-[#E8521A] text-white font-semibold rounded-lg hover:bg-[#c94415] disabled:opacity-40">
              Run Research ({selectedVars.length} variables)
            </button>
          </div>
        )}

        {step === "running" && (
          <div className="max-w-[600px] flex flex-col items-center py-20">
            <div className="w-12 h-12 rounded-full border-4 border-[#E8521A] border-t-transparent animate-spin mb-6" />
            <h2 className="text-lg font-semibold text-[#1A1A1A] mb-2">Researching...</h2>
            <p className="text-sm text-[#737373] text-center">Buddies is searching the web, reading sources, and extracting insights for: <span className="font-medium text-[#1A1A1A]">{topic}</span></p>
          </div>
        )}

        {step === "result" && result && (
          <div className="max-w-[700px]">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-[18px] font-semibold text-[#1A1A1A]">{result.topic}</h2>
                <p className="text-xs text-[#737373] mt-0.5">Research complete · {(result.sources ?? []).length} sources analyzed</p>
              </div>
              <button onClick={reset} className="text-sm text-[#E8521A] hover:underline font-medium">New Research</button>
            </div>

            {/* Key Findings */}
            {(result.key_findings ?? []).length > 0 && (
              <div className="bg-white rounded-xl border border-[#E5E2DE] p-5 mb-4">
                <div className="text-xs font-bold text-[#737373] uppercase tracking-wider mb-3">Key Findings</div>
                <ol className="space-y-2">
                  {(result.key_findings ?? []).map((f: string, i: number) => (
                    <li key={i} className="flex gap-3 text-sm text-[#1A1A1A]">
                      <span className="text-[#E8521A] font-bold shrink-0">{i+1}.</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Insights */}
            {(result.discovered_insights ?? []).length > 0 && (
              <div className="bg-[#FFF8F5] rounded-xl border border-[#E8521A]/20 p-5 mb-4">
                <div className="text-xs font-bold text-[#E8521A] uppercase tracking-wider mb-3">💡 Discovered Insights</div>
                <div className="space-y-2">
                  {(result.discovered_insights ?? []).map((ins: string, i: number) => (
                    <div key={i} className="text-sm text-[#1A1A1A] flex gap-2">
                      <span className="text-[#E8521A]">→</span><span>{ins}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Strategy */}
            {(result.strategic_recommendations ?? []).length > 0 && (
              <div className="bg-white rounded-xl border border-[#E5E2DE] p-5 mb-4">
                <div className="text-xs font-bold text-[#737373] uppercase tracking-wider mb-3">Strategic Recommendations</div>
                <div className="space-y-2">
                  {(result.strategic_recommendations ?? []).map((r: string, i: number) => (
                    <div key={i} className="flex gap-3 text-sm">
                      <span className="w-5 h-5 rounded-full bg-[#1A1A1A] text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i+1}</span>
                      <span className="text-[#1A1A1A]">{r}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Raw report */}
            {result.raw_report && (
              <div className="bg-white rounded-xl border border-[#E5E2DE] p-5 mb-4">
                <div className="text-xs font-bold text-[#737373] uppercase tracking-wider mb-3">Full Report</div>
                <p className="text-sm text-[#404040] leading-relaxed whitespace-pre-wrap">{result.raw_report}</p>
              </div>
            )}

            {/* Sources */}
            {(result.sources ?? []).length > 0 && (
              <div className="bg-white rounded-xl border border-[#E5E2DE] p-5">
                <div className="text-xs font-bold text-[#737373] uppercase tracking-wider mb-3">Sources</div>
                <div className="space-y-1.5">
                  {(result.sources ?? []).map((s: any, i: number) => (
                    <a key={i} href={s.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 text-xs text-[#E8521A] hover:underline">
                      <span className="text-[#737373]">{i+1}.</span>
                      <span className="truncate">{s.title || s.url}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
