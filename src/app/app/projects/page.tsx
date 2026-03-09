"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

type Project = { id: string; name: string; description: string | null; status: string; priority: string | null; tags: string[] | null; updated_at: string; };

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = { active: "bg-[#DCFCE7] text-[#2D6A4F]", paused: "bg-[#FEF9C3] text-[#92400E]", archived: "bg-[#F7F5F2] text-[#737373]" };
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize ${map[status] ?? map.archived}`}>{status}</span>;
}

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }
    const { data } = await supabase.from("projects").select("*").eq("user_id", user.id).order("updated_at", { ascending: false });
    setProjects(data ?? []);
  }

  useEffect(() => { load(); }, []);

  async function handleCreate() {
    if (!newName.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("projects").insert({ user_id: user.id, name: newName.trim(), description: newDesc.trim() || null, status: "active" });
    setNewName(""); setNewDesc(""); setShowForm(false);
    load();
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-8 max-w-[900px]">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-[20px] font-semibold text-[#1A1A1A]">Projects</h1>
            <p className="text-[12px] text-[#737373] mt-1">{projects.length} total projects</p>
          </div>
          <button onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2 bg-[#1A1A1A] text-white text-[13px] font-semibold rounded-lg hover:bg-[#333] transition-colors">
            <Plus size={14} /> New Project
          </button>
        </div>

        {showForm && (
          <div className="bg-white border border-[#E5E2DE] rounded-xl p-5 mb-4 space-y-3">
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Project name..."
              className="w-full border border-[#E5E2DE] rounded-lg px-4 py-2 text-[13px] outline-none focus:border-[#CC785C] placeholder:text-[#999]" />
            <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Description (optional)..."
              className="w-full border border-[#E5E2DE] rounded-lg px-4 py-2 text-[13px] outline-none focus:border-[#CC785C] placeholder:text-[#999]" />
            <div className="flex gap-2">
              <button onClick={handleCreate} className="px-4 py-1.5 bg-[#1A1A1A] text-white text-[12px] font-semibold rounded-lg hover:bg-[#333] transition-colors">Create</button>
              <button onClick={() => setShowForm(false)} className="px-4 py-1.5 border border-[#E5E2DE] text-[#737373] text-[12px] rounded-lg hover:border-[#CC785C] hover:text-[#CC785C] transition-colors">Cancel</button>
            </div>
          </div>
        )}

        {projects.length === 0 ? (
          <div className="border-2 border-dashed border-[#E5E2DE] rounded-xl py-12 px-6 flex flex-col items-center justify-center text-center">
            <p className="text-[14px] text-[#737373] mb-3">No projects yet.</p>
            <button onClick={() => setShowForm(true)} className="text-[13px] text-[#CC785C] hover:text-[#b5684e]">Create your first project →</button>
          </div>
        ) : (
          <div className="space-y-3">
            {projects.map(p => (
              <div key={p.id} onClick={() => router.push(`/app/projects/${p.id}`)}
                className="bg-white border border-[#E5E2DE] rounded-xl p-5 cursor-pointer hover:border-[#CC785C]/40 transition-colors">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-[14px] font-semibold text-[#1A1A1A]">{p.name}</h3>
                  <StatusBadge status={p.status} />
                </div>
                {p.description && <p className="text-[13px] text-[#737373] mb-3 leading-relaxed">{p.description}</p>}
                {p.tags && p.tags.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    {p.tags.map(tag => (
                      <span key={tag} className="text-[11px] px-2 py-0.5 rounded-full bg-[#F7F5F2] text-[#737373] border border-[#E5E2DE]">{tag}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
