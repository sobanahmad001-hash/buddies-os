"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, FolderKanban, FileText, Scale, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

type Results = { projects: any[]; updates: any[]; decisions: any[]; rules: any[] };

function timeAgo(d: string) { const diff = Date.now() - new Date(d).getTime(); const m = Math.floor(diff/60000); if (m < 60) return `${m}m ago`; const h = Math.floor(m/60); if (h < 24) return `${h}h ago`; return `${Math.floor(h/24)}d ago`; }

export default function SearchPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Results>({ projects: [], updates: [], decisions: [], rules: [] });
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<Record<string, string>>({});

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.push("/login"); return; }
      const { data: p } = await supabase.from("projects").select("id, name").eq("user_id", data.user.id);
      const map: Record<string, string> = {};
      (p ?? []).forEach(x => { map[x.id] = x.name; });
      setProjects(map);
    });
  }, []);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults({ projects: [], updates: [], decisions: [], rules: [] }); return; }
    setLoading(true);
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    setResults(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => search(query), 300);
    return () => clearTimeout(t);
  }, [query, search]);

  const total = results.projects.length + results.updates.length + results.decisions.length + results.rules.length;

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-8 max-w-[800px]">
        <div className="mb-6">
          <h1 className="text-[20px] font-semibold text-[#1A1A1A] mb-4">Search</h1>
          <div className="flex items-center gap-3 bg-white border border-[#E5E2DE] rounded-xl px-4 py-3 focus-within:border-[#CC785C]/50 transition-colors">
            <Search size={16} className="text-[#737373] shrink-0" />
            <input className="flex-1 bg-transparent outline-none text-[14px] text-[#404040] placeholder:text-[#999]"
              placeholder="Search projects, updates, decisions, rules..."
              value={query} onChange={e => setQuery(e.target.value)} autoFocus />
            {loading && <div className="w-4 h-4 border-2 border-[#CC785C] border-t-transparent rounded-full animate-spin shrink-0" />}
          </div>
        </div>

        {query.length >= 2 && !loading && total === 0 && (
          <p className="text-[13px] text-[#737373]">No results for "{query}"</p>
        )}

        {results.projects.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <FolderKanban size={13} className="text-[#737373]" />
              <span className="text-[11px] font-semibold text-[#737373] uppercase tracking-wide">Projects</span>
            </div>
            <div className="space-y-2">
              {results.projects.map(p => (
                <div key={p.id} onClick={() => router.push(`/app/projects/${p.id}`)}
                  className="bg-white border border-[#E5E2DE] rounded-xl px-4 py-3 cursor-pointer hover:border-[#CC785C]/40 transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-semibold text-[#1A1A1A]">{p.name}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#DCFCE7] text-[#2D6A4F] capitalize">{p.status}</span>
                  </div>
                  {p.description && <p className="text-[12px] text-[#737373] mt-1">{p.description}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {results.updates.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <FileText size={13} className="text-[#737373]" />
              <span className="text-[11px] font-semibold text-[#737373] uppercase tracking-wide">Updates</span>
            </div>
            <div className="space-y-2">
              {results.updates.map(u => (
                <div key={u.id} onClick={() => router.push(`/app/projects/${u.project_id}`)}
                  className="bg-white border border-[#E5E2DE] rounded-xl px-4 py-3 cursor-pointer hover:border-[#CC785C]/40 transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-[#CC785C] font-semibold">{projects[u.project_id] ?? "Unknown project"}</span>
                    <span className="text-[11px] text-[#737373]">{timeAgo(u.created_at)}</span>
                  </div>
                  <p className="text-[13px] text-[#404040] line-clamp-2">{u.content}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {results.decisions.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Scale size={13} className="text-[#737373]" />
              <span className="text-[11px] font-semibold text-[#737373] uppercase tracking-wide">Decisions</span>
            </div>
            <div className="space-y-2">
              {results.decisions.map(d => (
                <div key={d.id} onClick={() => router.push("/app/search")}
                  className="bg-white border border-[#E5E2DE] rounded-xl px-4 py-3 cursor-pointer hover:border-[#CC785C]/40 transition-colors">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${d.verdict === "enter" ? "bg-[#DCFCE7] text-[#2D6A4F]" : d.verdict === "wait" ? "bg-[#FEF9C3] text-[#92400E]" : "bg-[#FEE2E2] text-[#EF4444]"}`}>
                      {d.verdict ?? "—"}
                    </span>
                    <span className="text-[11px] text-[#737373]">{timeAgo(d.created_at)}</span>
                  </div>
                  <p className="text-[13px] text-[#404040] line-clamp-2">{d.context}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {results.rules.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck size={13} className="text-[#737373]" />
              <span className="text-[11px] font-semibold text-[#737373] uppercase tracking-wide">Rules</span>
            </div>
            <div className="space-y-2">
              {results.rules.map(r => (
                <div key={r.id} onClick={() => router.push("/app/search")}
                  className="bg-white border border-[#E5E2DE] rounded-xl px-4 py-3 cursor-pointer hover:border-[#CC785C]/40 transition-colors flex items-center gap-3">
                  <p className="text-[13px] text-[#404040] flex-1">{r.rule_text}</p>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${r.severity === 3 ? "bg-[#FEE2E2] text-[#EF4444]" : r.severity === 2 ? "bg-[#FEF9C3] text-[#92400E]" : "bg-[#F7F5F2] text-[#737373]"}`}>
                    {r.severity === 3 ? "High" : r.severity === 2 ? "Medium" : "Low"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
