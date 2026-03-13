"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useWorkspace } from "@/context/WorkspaceContext";
import { Users, FolderKanban, CheckSquare, Bot, ArrowRight } from "lucide-react";
import Link from "next/link";

const DEPT_META: Record<string, { label: string; emoji: string; color: string; bg: string; desc: string }> = {
  design:      { label: "Design",      emoji: "🎨", color: "#8B5CF6", bg: "#8B5CF610", desc: "UI/UX · Brand · Visual" },
  development: { label: "Development", emoji: "💻", color: "#3B82F6", bg: "#3B82F610", desc: "Engineering · Infra · Code" },
  marketing:   { label: "Marketing",   emoji: "📣", color: "#10B981", bg: "#10B98110", desc: "Campaigns · Content · Growth" },
};

export default function DeptOverviewPage() {
  const params = useParams();
  const slug = params.slug as string;
  const router = useRouter();
const { activeWorkspace, loading: wsLoading } = useWorkspace();

  const [dept, setDept] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const meta = DEPT_META[slug] ?? { label: slug, emoji: "🏢", color: "#E8521A", bg: "#E8521A10", desc: "" };
  
  useEffect(() => { if (!wsLoading) load(); }, [activeWorkspace, slug, wsLoading]);

  async function load() {
    if (!activeWorkspace) { setLoading(false); return; }
    setLoading(true);

    const deptRes = await fetch(`/api/departments?workspace_id=${activeWorkspace.id}&slug=${encodeURIComponent(slug)}`);
    const deptJson = await deptRes.json();
    const d = deptJson.department;
    if (!d) { setLoading(false); return; }
    setDept(d);

    const [projRes, taskRes, memRes] = await Promise.all([
      supabase.from("dept_projects").select("id, name, status, created_at, updated_at").eq("dept_id", d.id).order("updated_at", { ascending: false }).limit(10),
      supabase.from("dept_project_tasks").select("id, status, title").eq("dept_id", d.id).neq("status", "cancelled"),
      supabase.from("memberships").select("id, role, invited_email, profiles(full_name)").eq("department_id", d.id).eq("status", "active"),
    ]);

    setProjects(projRes.data ?? []);
    setTasks(taskRes.data ?? []);
    setMembers(memRes.data ?? []);
    setLoading(false);
  }

  const todo       = tasks.filter(t => t.status === "todo").length;
  const inProgress = tasks.filter(t => t.status === "in_progress").length;
  const done       = tasks.filter(t => t.status === "done").length;
  const activeProj = projects.filter(p => p.status === "active").length;

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: meta.color, borderTopColor: "transparent" }} />
    </div>
  );

  return (
    <div className="flex-1 overflow-auto bg-[#F7F5F2]">
      {/* Header */}
      <div className="bg-[#0F0F0F] text-white px-8 py-6">
        <div className="max-w-[960px] flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0" style={{ background: meta.bg }}>
            {meta.emoji}
          </div>
          <div>
            <h1 className="text-[22px] font-bold tracking-tight">{meta.label}</h1>
            <p className="text-white/40 text-xs mt-0.5">{meta.desc} · {members.length} member{members.length !== 1 ? "s" : ""}</p>
          </div>
          <div className="ml-auto flex gap-3">
            <Link href={`/app/dept/${slug}/assistant`}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
              style={{ background: meta.color, color: "#fff" }}>
              <Bot size={14} /> Assistant
            </Link>
            <Link href={`/app/dept/${slug}/projects`}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-white/10 hover:bg-white/20 transition-colors">
              <FolderKanban size={14} /> Projects
            </Link>
          </div>
        </div>
      </div>

      <div className="px-8 py-6 max-w-[960px] space-y-6">

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Active Projects", value: activeProj, icon: FolderKanban },
            { label: "Todo Tasks", value: todo, icon: CheckSquare },
            { label: "In Progress", value: inProgress, icon: CheckSquare },
            { label: "Completed", value: done, icon: CheckSquare },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl border border-[#E5E2DE] p-5">
              <div className="text-2xl font-bold" style={{ color: meta.color }}>{s.value}</div>
              <div className="text-xs text-[#737373] mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-4">
          {/* Active Projects */}
          <div className="col-span-2 bg-white rounded-2xl border border-[#E5E2DE] p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-[#1A1A1A]">Active Projects</h2>
              <Link href={`/app/dept/${slug}/projects`} className="text-xs font-semibold flex items-center gap-1 hover:underline" style={{ color: meta.color }}>
                View all <ArrowRight size={11} />
              </Link>
            </div>
            {projects.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-[#B0ADA9] mb-3">No projects yet</p>
                <Link href={`/app/dept/${slug}/projects`}
                  className="text-xs font-semibold px-4 py-2 rounded-lg text-white transition-colors"
                  style={{ background: meta.color }}>
                  Create first project
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {projects.slice(0, 5).map(p => (
                  <Link key={p.id} href={`/app/dept/${slug}/projects/${p.id}`}
                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-[#F7F5F2] transition-colors group">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: p.status === "active" ? meta.color : "#B0ADA9" }} />
                    <span className="text-sm font-medium text-[#1A1A1A] flex-1 truncate">{p.name}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                      p.status === "active" ? "bg-green-100 text-green-700" :
                      p.status === "paused" ? "bg-yellow-100 text-yellow-700" :
                      "bg-[#F0EDE9] text-[#737373]"
                    }`}>{p.status}</span>
                    <ArrowRight size={12} className="text-[#B0ADA9] opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Team */}
          <div className="bg-white rounded-2xl border border-[#E5E2DE] p-5">
            <div className="flex items-center gap-2 mb-4">
              <Users size={14} style={{ color: meta.color }} />
              <h2 className="text-sm font-bold text-[#1A1A1A]">Team</h2>
            </div>
            {members.length === 0 ? (
              <p className="text-xs text-[#B0ADA9]">No members assigned</p>
            ) : (
              <div className="space-y-2.5">
                {members.map((m: any) => {
                  const name = (m.profiles as any)?.full_name || m.invited_email || "Member";
                  return (
                    <div key={m.id} className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                        style={{ background: meta.color }}>
                        {name[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-[#1A1A1A] truncate">{name}</div>
                        <div className="text-[10px] text-[#B0ADA9] capitalize">{m.role?.replace("_", " ")}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
