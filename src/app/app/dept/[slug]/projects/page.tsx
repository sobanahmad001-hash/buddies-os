"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useWorkspace } from "@/context/WorkspaceContext";
import { supabase } from "@/lib/supabaseClient";
import { Plus, FolderKanban, ArrowRight, Trash2 } from "lucide-react";

const DEPT_META: Record<string, { label: string; color: string; bg: string }> = {
  design:      { label: "Design",      color: "#8B5CF6", bg: "#8B5CF610" },
  development: { label: "Development", color: "#3B82F6", bg: "#3B82F610" },
  marketing:   { label: "Marketing",   color: "#10B981", bg: "#10B98110" },
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  paused: "bg-yellow-100 text-yellow-700",
  completed: "bg-blue-100 text-blue-700",
  archived: "bg-[#F0EDE9] text-[#737373]",
};

export default function DeptProjectsPage() {
  const { slug } = useParams() as { slug: string };
  const { activeWorkspace } = useWorkspace();
  const router = useRouter();

  const [deptId, setDeptId] = useState<string | null>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const meta = DEPT_META[slug] ?? { label: slug, color: "#E8521A", bg: "#E8521A10" };

  useEffect(() => { init(); }, [activeWorkspace, slug]);

  async function init() {
    if (!activeWorkspace) return;
    const { data: d } = await supabase.from("departments").select("id")
      .eq("workspace_id", activeWorkspace.id).eq("slug", slug).maybeSingle();
    if (!d) { setLoading(false); return; }
    setDeptId(d.id);
    await loadProjects(d.id);
  }

  async function loadProjects(did?: string) {
    const id = did ?? deptId;
    if (!id) return;
    setLoading(true);
    const { data } = await supabase.from("dept_projects").select("*").eq("dept_id", id).order("updated_at", { ascending: false });
    setProjects(data ?? []);
    setLoading(false);
  }

  async function createProject() {
    if (!newName.trim() || !deptId || !activeWorkspace) return;
    setCreating(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from("dept_projects").insert({
      dept_id: deptId,
      workspace_id: activeWorkspace.id,
      created_by: user.id,
      name: newName.trim(),
      description: newDesc.trim() || null,
      status: "active",
    }).select().single();
    setNewName(""); setNewDesc(""); setShowForm(false); setCreating(false);
    if (data) router.push(`/app/dept/${slug}/projects/${data.id}`);
  }

  async function deleteProject(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Delete this project and all its data?")) return;
    await supabase.from("dept_projects").delete().eq("id", id);
    setProjects(prev => prev.filter(p => p.id !== id));
  }

  return (
    <div className="flex-1 overflow-auto bg-[#F7F5F2]">
      <div className="bg-[#0F0F0F] text-white px-8 py-5 shrink-0">
        <div className="max-w-[900px] flex items-center justify-between">
          <div>
            <h1 className="text-[18px] font-bold">{meta.label} Projects</h1>
            <p className="text-white/40 text-xs mt-0.5">{projects.length} project{projects.length !== 1 ? "s" : ""}</p>
          </div>
          <button
            onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-colors"
            style={{ background: meta.color }}>
            <Plus size={14} /> New Project
          </button>
        </div>
      </div>

      <div className="px-8 py-6 max-w-[900px]">
        {showForm && (
          <div className="bg-white rounded-2xl border border-[#E5E2DE] p-5 mb-5 space-y-3">
            <input value={newName} onChange={e => setNewName(e.target.value)}
              placeholder="Project name..."
              className="w-full border border-[#E5E2DE] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#8B5CF6]"
              autoFocus />
            <input value={newDesc} onChange={e => setNewDesc(e.target.value)}
              placeholder="Description (optional)..."
              className="w-full border border-[#E5E2DE] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#8B5CF6]" />
            <div className="flex gap-2">
              <button onClick={createProject} disabled={!newName.trim() || creating}
                className="px-5 py-2 text-white text-sm font-semibold rounded-xl disabled:opacity-40 transition-colors"
                style={{ background: meta.color }}>
                {creating ? "Creating..." : "Create"}
              </button>
              <button onClick={() => setShowForm(false)}
                className="px-5 py-2 text-sm font-semibold rounded-xl border border-[#E5E2DE] text-[#737373] hover:border-[#CC785C] transition-colors">
                Cancel
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: meta.color, borderTopColor: "transparent" }} />
          </div>
        ) : projects.length === 0 ? (
          <div className="border-2 border-dashed border-[#E5E2DE] rounded-2xl py-16 flex flex-col items-center justify-center text-center">
            <FolderKanban size={32} className="text-[#D5D0CA] mb-3" />
            <p className="text-sm text-[#737373] mb-4">No projects yet in {meta.label}</p>
            <button onClick={() => setShowForm(true)}
              className="text-sm font-semibold px-5 py-2 rounded-xl text-white transition-colors"
              style={{ background: meta.color }}>
              Create first project
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {projects.map(p => (
              <div key={p.id}
                onClick={() => router.push(`/app/dept/${slug}/projects/${p.id}`)}
                className="bg-white rounded-2xl border border-[#E5E2DE] p-5 cursor-pointer hover:shadow-md transition-all hover:border-[#D5D0CA] group flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center" style={{ background: meta.bg }}>
                  <FolderKanban size={16} style={{ color: meta.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[#1A1A1A] truncate">{p.name}</div>
                  {p.description && <div className="text-xs text-[#737373] truncate mt-0.5">{p.description}</div>}
                  <div className="text-[10px] text-[#B0ADA9] mt-1">
                    Updated {new Date(p.updated_at).toLocaleDateString()}
                  </div>
                </div>
                <span className={`text-[10px] px-2.5 py-1 rounded-full font-semibold shrink-0 ${STATUS_COLORS[p.status] ?? STATUS_COLORS.archived}`}>
                  {p.status}
                </span>
                <button onClick={e => deleteProject(p.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-[#B0ADA9] hover:text-red-500 hover:bg-red-50 transition-all">
                  <Trash2 size={13} />
                </button>
                <ArrowRight size={14} className="text-[#B0ADA9] group-hover:text-[#737373] transition-colors shrink-0" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
