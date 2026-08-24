"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CirclePause, FolderKanban, Plus, Search, Trash2, Target } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

type Project = { id: string; name: string; description: string | null; status: string; priority: string | null; tags: string[] | null; updated_at: string; };

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = { active: "bg-surface-subtle text-positive", paused: "bg-surface-subtle text-caution", archived: "bg-surface-subtle text-muted" };
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize ${map[status] ?? map.archived}`}>{status}</span>;
}

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "paused" | "archived">("all");

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }
    const { data } = await supabase.from("projects").select("*").eq("user_id", user.id).order("updated_at", { ascending: false });
    setProjects(data ?? []);
  }

  useEffect(() => { load(); }, []);

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Permanently delete this project and all its data? This cannot be undone.")) return;
    await supabase.from("projects").delete().eq("id", id);
    load();
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("projects").insert({ user_id: user.id, name: newName.trim(), description: newDesc.trim() || null, status: "active" });
    setNewName(""); setNewDesc(""); setShowForm(false);
    load();
  }

  const visibleProjects = projects.filter((project) => {
    const matchesStatus = filter === "all" || project.status === filter;
    const haystack = `${project.name} ${project.description ?? ""} ${(project.tags ?? []).join(" ")}`.toLowerCase();
    return matchesStatus && haystack.includes(query.toLowerCase());
  });

  const activeCount = projects.filter((project) => project.status === "active").length;
  const pausedCount = projects.filter((project) => project.status === "paused").length;

  return (
    <div className="flex-1 overflow-auto bg-canvas">
      <div className="mx-auto p-4 md:p-8 max-w-[1100px]">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">Portfolio</p>
            <h1 className="text-[24px] font-semibold text-ink mt-1">Projects</h1>
            <p className="text-[13px] text-muted mt-1">Every outcome, commitment, decision, and project context in one place.</p>
          </div>
          <div className="flex gap-2"><button onClick={()=>router.push('/app/goals')} className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] font-semibold text-ink hover:bg-surface-subtle"><Target size={14}/>Goals</button><button onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2 bg-accent text-white text-[13px] font-semibold rounded-lg hover:opacity-90 transition-colors">
            <Plus size={14} /> New Project
          </button></div>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="rounded-2xl border border-line bg-surface p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted">Total</p>
            <p className="mt-1 text-[22px] font-semibold text-ink">{projects.length}</p>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted">Active</p>
            <p className="mt-1 text-[22px] font-semibold text-positive">{activeCount}</p>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted">Paused</p>
            <p className="mt-1 text-[22px] font-semibold text-caution">{pausedCount}</p>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div className="relative flex-1 max-w-[460px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects"
              className="w-full rounded-xl border border-line bg-surface py-2.5 pl-9 pr-3 text-[13px] text-ink outline-none focus:border-accent" />
          </div>
          <div className="flex gap-1 rounded-xl border border-line bg-surface-subtle p-1 overflow-x-auto">
            {(["all", "active", "paused", "archived"] as const).map((value) => (
              <button key={value} onClick={() => setFilter(value)} className={`rounded-lg px-3 py-1.5 text-[11px] font-medium capitalize transition-colors ${filter === value ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}>{value}</button>
            ))}
          </div>
        </div>

        {showForm && (
          <div className="bg-surface border border-line rounded-2xl p-5 mb-4 space-y-3 shadow-panel">
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Project name..."
              className="w-full bg-surface-subtle border border-line rounded-xl px-4 py-2.5 text-[13px] text-ink outline-none focus:border-accent placeholder:text-faint" />
            <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Description (optional)..."
              className="w-full bg-surface-subtle border border-line rounded-xl px-4 py-2.5 text-[13px] text-ink outline-none focus:border-accent placeholder:text-faint" />
            <div className="flex gap-2">
              <button onClick={handleCreate} className="px-4 py-1.5 bg-[#1A1A1A] text-white text-[12px] font-semibold rounded-lg hover:bg-[#333] transition-colors">Create</button>
              <button onClick={() => setShowForm(false)} className="px-4 py-1.5 border border-[#2D2D2D] text-[#737373] text-[12px] rounded-lg hover:border-[#CC785C] hover:text-[#CC785C] transition-colors">Cancel</button>
            </div>
          </div>
        )}

        {projects.length === 0 ? (
          <div className="border-2 border-dashed border-[#2D2D2D] rounded-xl py-12 px-6 flex flex-col items-center justify-center text-center">
            <p className="text-[14px] text-[#737373] mb-3">No projects yet.</p>
            <button onClick={() => setShowForm(true)} className="text-[13px] text-[#CC785C] hover:text-[#b5684e]">Create your first project →</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {visibleProjects.map(p => (
              <div key={p.id} onClick={() => router.push(`/app/projects/${p.id}`)}
                className="group bg-surface border border-line rounded-2xl p-5 cursor-pointer hover:border-accent/50 hover:shadow-panel transition-all">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0"><FolderKanban size={15} className="text-accent shrink-0" /><h3 className="text-[14px] font-semibold text-ink truncate">{p.name}</h3></div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={p.status} />
                    {p.status === "archived" && (
                      <button onClick={e => handleDelete(p.id, e)}
                        className="p-1 text-[#737373] hover:text-[#EF4444] transition-colors" title="Delete project">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
                {p.description && <p className="text-[13px] text-muted mb-3 leading-relaxed">{p.description}</p>}
                {p.tags && p.tags.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    {p.tags.map(tag => (
                      <span key={tag} className="text-[11px] px-2 py-0.5 rounded-full bg-surface-subtle text-muted border border-line">{tag}</span>
                    ))}
                  </div>
                )}
                <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-[11px] text-muted">
                  <span className="flex items-center gap-1.5">{p.status === "paused" && <CirclePause size={12} />}Updated {new Date(p.updated_at).toLocaleDateString()}</span>
                  <span className="flex items-center gap-1 text-accent opacity-0 transition-opacity group-hover:opacity-100">Open workspace <ArrowRight size={12} /></span>
                </div>
              </div>
            ))}
            {visibleProjects.length === 0 && <div className="md:col-span-2 rounded-xl border border-dashed border-[#2D2D2D] p-10 text-center text-[13px] text-[#737373]">No projects match this view.</div>}
          </div>
        )}
      </div>
    </div>
  );
}
