"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { CheckSquare, Plus, Trash2 } from "lucide-react";

const DEPT_META: Record<string, { color: string }> = {
  design:      { color: "#8B5CF6" },
  development: { color: "#3B82F6" },
  marketing:   { color: "#10B981" },
};

const STATUS_ORDER = ["todo", "in_progress", "review", "done"];
const STATUS_LABEL: Record<string, string> = { todo: "Todo", in_progress: "In Progress", review: "Review", done: "Done" };

export default function DeptProjectOverviewPage() {
  const { slug, projectId } = useParams() as { slug: string; projectId: string };
  const [project, setProject] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [updates, setUpdates] = useState<any[]>([]);
  const [newTask, setNewTask] = useState("");
  const [newUpdate, setNewUpdate] = useState("");
  const [addingTask, setAddingTask] = useState(false);
  const meta = DEPT_META[slug] ?? { color: "#E8521A" };

  useEffect(() => { load(); }, [projectId]);

  async function load() {
    const [pRes, tRes, uRes] = await Promise.all([
      supabase.from("dept_projects").select("*").eq("id", projectId).maybeSingle(),
      supabase.from("dept_project_tasks").select("*").eq("dept_project_id", projectId).neq("status", "cancelled").order("created_at"),
      supabase.from("dept_project_updates").select("*, profiles(full_name)").eq("dept_project_id", projectId).order("created_at", { ascending: false }).limit(10),
    ]);
    setProject(pRes.data);
    setTasks(tRes.data ?? []);
    setUpdates(uRes.data ?? []);
  }

  async function addTask() {
    if (!newTask.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !project) return;
    await supabase.from("dept_project_tasks").insert({
      dept_project_id: projectId, dept_id: project.dept_id,
      created_by: user.id, title: newTask.trim(), status: "todo", priority: "medium",
    });
    setNewTask(""); setAddingTask(false);
    load();
  }

  async function updateTaskStatus(id: string, status: string) {
    await supabase.from("dept_project_tasks").update({ status }).eq("id", id);
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t));
  }

  async function deleteTask(id: string) {
    await supabase.from("dept_project_tasks").update({ status: "cancelled" }).eq("id", id);
    setTasks(prev => prev.filter(t => t.id !== id));
  }

  async function postUpdate() {
    if (!newUpdate.trim() || !project) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("dept_project_updates").insert({
      dept_project_id: projectId, dept_id: project.dept_id,
      user_id: user.id, content: newUpdate.trim(), update_type: "general",
    });
    setNewUpdate("");
    load();
  }

  const tasksByStatus = STATUS_ORDER.map(s => ({ status: s, items: tasks.filter(t => t.status === s) }));

  return (
    <div className="flex-1 overflow-auto bg-[#F7F5F2]">
      <div className="px-8 py-6 max-w-[960px] space-y-6">
        {/* Description */}
        {project?.description && (
          <div className="bg-white rounded-2xl border border-[#E5E2DE] p-5">
            <p className="text-sm text-[#404040]">{project.description}</p>
          </div>
        )}

        {/* Task Kanban */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-[#1A1A1A]">Tasks</h2>
            <button onClick={() => setAddingTask(v => !v)}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl text-white transition-colors"
              style={{ background: meta.color }}>
              <Plus size={12} /> Add Task
            </button>
          </div>
          {addingTask && (
            <div className="flex gap-2 mb-4">
              <input value={newTask} onChange={e => setNewTask(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addTask()}
                placeholder="Task title..."
                className="flex-1 border border-[#E5E2DE] rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-[#8B5CF6]"
                autoFocus />
              <button onClick={addTask} className="px-4 py-2 text-white text-sm font-semibold rounded-xl" style={{ background: meta.color }}>Add</button>
              <button onClick={() => setAddingTask(false)} className="px-4 py-2 text-sm border border-[#E5E2DE] rounded-xl text-[#737373]">Cancel</button>
            </div>
          )}
          <div className="grid grid-cols-4 gap-4">
            {tasksByStatus.map(col => (
              <div key={col.status} className="bg-white rounded-2xl border border-[#E5E2DE] p-4">
                <div className="text-[10px] font-bold uppercase tracking-widest text-[#737373] mb-3 flex items-center justify-between">
                  {STATUS_LABEL[col.status]}
                  <span className="px-1.5 py-0.5 rounded-full bg-[#F7F5F2] text-[#737373] font-normal">{col.items.length}</span>
                </div>
                <div className="space-y-2">
                  {col.items.map(task => (
                    <div key={task.id} className="group bg-[#F7F5F2] rounded-xl p-2.5 text-xs text-[#1A1A1A] relative">
                      {task.title}
                      <div className="flex gap-1 mt-2">
                        {STATUS_ORDER.filter(s => s !== task.status).map(s => (
                          <button key={s} onClick={() => updateTaskStatus(task.id, s)}
                            className="text-[9px] px-1.5 py-0.5 rounded bg-white border border-[#E5E2DE] text-[#737373] hover:border-[#B0ADA9] transition-colors">
                            → {STATUS_LABEL[s]}
                          </button>
                        ))}
                        <button onClick={() => deleteTask(task.id)}
                          className="ml-auto text-[#B0ADA9] hover:text-red-500 transition-colors">
                          <Trash2 size={10} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Updates */}
        <div className="bg-white rounded-2xl border border-[#E5E2DE] p-5">
          <h2 className="text-sm font-bold text-[#1A1A1A] mb-4">Updates</h2>
          <div className="flex gap-2 mb-4">
            <input value={newUpdate} onChange={e => setNewUpdate(e.target.value)}
              onKeyDown={e => e.key === "Enter" && postUpdate()}
              placeholder="Post an update..."
              className="flex-1 border border-[#E5E2DE] rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-[#8B5CF6]" />
            <button onClick={postUpdate} disabled={!newUpdate.trim()}
              className="px-4 py-2 text-white text-sm font-semibold rounded-xl disabled:opacity-40 transition-colors"
              style={{ background: meta.color }}>Post</button>
          </div>
          <div className="space-y-3">
            {updates.map((u: any) => (
              <div key={u.id} className="border-l-2 pl-4 py-1" style={{ borderColor: meta.color + "40" }}>
                <p className="text-sm text-[#1A1A1A]">{u.content}</p>
                <p className="text-[10px] text-[#B0ADA9] mt-1">
                  {(u.profiles as any)?.full_name ?? "Team"} · {new Date(u.created_at).toLocaleString()}
                </p>
              </div>
            ))}
            {updates.length === 0 && <p className="text-xs text-[#B0ADA9]">No updates yet</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
