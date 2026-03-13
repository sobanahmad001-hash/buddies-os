"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Plus } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

type Project = { id: string; name: string; description: string | null; status: string; priority: string | null; tags: string[] | null; updated_at: string; memory: string | null; };
type Update = { id: string; update_type: string; content: string; outcomes: string | null; next_actions: string | null; created_at: string; };
type Task = { id: string; title: string; status: string };

function timeAgo(d: string) { const diff = Date.now() - new Date(d).getTime(); const m = Math.floor(diff/60000); if (m < 60) return `${m}m ago`; const h = Math.floor(m/60); if (h < 24) return `${h}h ago`; return `${Math.floor(h/24)}d ago`; }
function TypeBadge({ type }: { type: string }) {
  const map: Record<string,string> = { progress:"bg-[#DBEAFE] text-[#2C5F8A]", decision:"bg-[#DCFCE7] text-[#2D6A4F]", blocker:"bg-[#FEE2E2] text-[#EF4444]", milestone:"bg-[#FEF9C3] text-[#92400E]" };
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize ${map[type]??map.progress}`}>{type}</span>;
}

export default function ProjectOverviewPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [updates, setUpdates] = useState<Update[]>([]);
  const [tasks,   setTasks]   = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadAll(); }, [id]);

  async function loadAll() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }
    const [{ data: p }, { data: u }] = await Promise.all([
      supabase.from("projects").select("*").eq("id", id).eq("user_id", user.id).single(),
      supabase.from("project_updates").select("*").eq("project_id", id).order("created_at", { ascending: false }),
    ]);
    setProject(p);
    setUpdates(u ?? []);
    const res = await fetch(`/api/projects/tasks?projectId=${id}`);
    if (res.ok) { const d = await res.json(); setTasks(d.tasks ?? []); }
    setLoading(false);
  }

  async function handleArchive() {
    await supabase.from("projects").update({ status: "archived" }).eq("id", id);
    router.push("/app/projects");
  }

  if (loading) return <div className="flex items-center justify-center h-40"><p className="text-[14px] text-[#737373]">Loading…</p></div>;
  if (!project) return <div className="flex items-center justify-center h-40"><p className="text-[14px] text-[#737373]">Project not found.</p></div>;

  const openTasks = tasks.filter(t => t.status !== "done").length;
  const doneTasks = tasks.filter(t => t.status === "done").length;

  return (
    <div className="p-6 max-w-[860px]">

      {/* Header row */}
      <div className="flex items-start justify-between mb-5">
        <div>
          {project.description && <p className="text-[14px] text-[#737373] mt-1 max-w-[560px]">{project.description}</p>}
          {project.memory && (
            <p className="text-[12px] text-[#737373] mt-1.5 italic">
              {project.memory.split("\n").find(l => l.startsWith("Current focus:"))?.replace("Current focus:", "→ ") ?? ""}
            </p>
          )}
        </div>
        <div className="flex gap-2 shrink-0 ml-4">
          <button onClick={() => router.push("/app/command")}
            className="flex items-center gap-2 px-4 py-2 bg-[#1A1A1A] text-white text-[13px] font-semibold rounded-lg hover:bg-[#333] transition-colors">
            <Plus size={14}/> Update
          </button>
          <button onClick={handleArchive}
            className="px-4 py-2 border border-[#E5E2DE] text-[#737373] text-[13px] rounded-lg hover:border-[#EF4444] hover:text-[#EF4444] transition-colors">
            Archive
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="flex flex-wrap gap-5 mb-8 pb-6 border-b border-[#E5E2DE]">
        <div>
          <span className="text-[11px] text-[#737373] uppercase tracking-wide">Updates</span>
          <p className="text-[18px] font-semibold text-[#1A1A1A] mt-0.5">{updates.length}</p>
        </div>
        <div>
          <span className="text-[11px] text-[#737373] uppercase tracking-wide">Tasks Open</span>
          <p className="text-[18px] font-semibold text-[#1A1A1A] mt-0.5">{openTasks}</p>
        </div>
        <div>
          <span className="text-[11px] text-[#737373] uppercase tracking-wide">Completed</span>
          <p className="text-[18px] font-semibold text-[#1A1A1A] mt-0.5">{doneTasks}</p>
        </div>
        {project.tags && project.tags.length > 0 && (
          <div>
            <span className="text-[11px] text-[#737373] uppercase tracking-wide">Tags</span>
            <div className="flex gap-1.5 mt-1">
              {project.tags.map(t => (
                <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-[#F7F5F2] text-[#737373] border border-[#E5E2DE]">{t}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Recent updates */}
      <div>
        <h2 className="text-[14px] font-semibold text-[#1A1A1A] mb-4">
          Recent Updates <span className="text-[12px] text-[#737373] font-normal ml-1">{updates.length} total</span>
        </h2>
        {updates.length === 0 ? (
          <div className="border-2 border-dashed border-[#E5E2DE] rounded-xl py-12 px-6 text-center">
            <p className="text-[14px] text-[#737373] mb-3">No updates yet.</p>
            <button onClick={() => router.push("/app/command")} className="text-[13px] text-[#CC785C] hover:text-[#b5684e]">Add via Command →</button>
          </div>
        ) : (
          <div className="space-y-3">
            {updates.slice(0, 5).map(u => (
              <div key={u.id} className="bg-white border border-[#E5E2DE] rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <TypeBadge type={u.update_type}/>
                  <span className="text-[12px] text-[#737373]">{timeAgo(u.created_at)}</span>
                </div>
                <p className="text-[14px] text-[#404040] mb-3 leading-relaxed">{u.content}</p>
                {u.outcomes && <div className="mb-2"><span className="text-[11px] font-semibold text-[#737373] uppercase tracking-wide">Outcomes</span><p className="text-[12px] text-[#737373] mt-1 pl-3 border-l-2 border-[#CC785C]">{u.outcomes}</p></div>}
                {u.next_actions && <div><span className="text-[11px] font-semibold text-[#737373] uppercase tracking-wide">Next Actions</span><p className="text-[12px] text-[#737373] mt-1 pl-3 border-l-2 border-[#CC785C]">{u.next_actions}</p></div>}
              </div>
            ))}
            {updates.length > 5 && (
              <p className="text-[13px] text-[#737373] text-center pt-1">{updates.length - 5} more updates…</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
