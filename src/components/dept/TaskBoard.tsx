"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const STATUSES = ["todo", "in_progress", "done"] as const;
const STATUS_LABELS: Record<string, string> = { todo: "To Do", in_progress: "In Progress", done: "Done" };
const STATUS_COLORS: Record<string, string> = {
  todo: "border-[#E5E2DE]",
  in_progress: "border-[#3B82F6]",
  done: "border-[#10B981]"
};

export default function TaskBoard({ tasks, projectId, departmentId, userId, onRefresh }: {
  tasks: any[]; projectId?: string; departmentId: string; userId: string; onRefresh: () => void;
}) {
  const [newTask, setNewTask] = useState("");
  const [adding, setAdding] = useState(false);

  async function addTask() {
    if (!newTask.trim()) return;
    setAdding(true);
    await supabase.from("project_tasks").insert({
      user_id: userId, project_id: projectId ?? null,
      department_id: departmentId, title: newTask.trim(), status: "todo", priority: 2
    });
    setNewTask("");
    setAdding(false);
    onRefresh();
  }

  async function cycleStatus(task: any) {
    const order = ["todo", "in_progress", "done"];
    const next = order[(order.indexOf(task.status) + 1) % order.length];
    await supabase.from("project_tasks").update({ status: next }).eq("id", task.id);
    onRefresh();
  }

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <input value={newTask} onChange={e => setNewTask(e.target.value)}
          onKeyDown={e => e.key === "Enter" && addTask()}
          placeholder="Add a task..."
          className="flex-1 text-sm px-3 py-2 border border-[#E5E2DE] rounded-lg focus:outline-none focus:border-[#E8521A] bg-white" />
        <button onClick={addTask} disabled={adding || !newTask.trim()}
          className="px-4 py-2 bg-[#E8521A] text-white text-sm font-semibold rounded-lg disabled:opacity-40 hover:bg-[#c94415]">
          Add
        </button>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {STATUSES.map(status => (
          <div key={status} className={`bg-white rounded-xl border-t-2 ${STATUS_COLORS[status]} border border-[#E5E2DE] p-3`}>
            <div className="text-xs font-bold text-[#737373] uppercase tracking-wider mb-3">{STATUS_LABELS[status]} ({tasks.filter(t => t.status === status).length})</div>
            <div className="space-y-2">
              {tasks.filter(t => t.status === status).map(task => (
                <div key={task.id} onClick={() => cycleStatus(task)}
                  className="text-xs text-[#1A1A1A] p-2.5 bg-[#F7F5F2] rounded-lg cursor-pointer hover:bg-[#EEE] transition-colors">
                  {task.title}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
