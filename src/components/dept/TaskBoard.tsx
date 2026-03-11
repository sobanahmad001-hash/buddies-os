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

interface Props {
  tasks: any[];
  departmentId: string;
  userId: string;
  members?: any[];           // dept head can assign to others
  canSeeAll?: boolean;       // dept head sees all, others see own
  canAssign?: boolean;       // dept head can assign tasks
  accentColor?: string;
  onRefresh: () => void;
}

export default function TaskBoard({ tasks, departmentId, userId, members = [], canSeeAll = false, canAssign = false, accentColor = "#E8521A", onRefresh }: Props) {
  const [newTask, setNewTask] = useState("");
  const [assignTo, setAssignTo] = useState(userId);
  const [adding, setAdding] = useState(false);

  // Filter: dept head sees all, others see only own
  const visibleTasks = canSeeAll ? tasks : tasks.filter(t => !t.assigned_to || t.assigned_to === userId || t.user_id === userId);

  async function addTask() {
    if (!newTask.trim()) return;
    setAdding(true);
    await supabase.from("project_tasks").insert({
      user_id: userId,
      assigned_to: assignTo || userId,
      assigned_by: canAssign && assignTo !== userId ? userId : null,
      department_id: departmentId,
      title: newTask.trim(),
      status: "todo",
      priority: 2
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
      {/* Add task row */}
      <div className="flex gap-2 mb-4">
        <input value={newTask} onChange={e => setNewTask(e.target.value)}
          onKeyDown={e => e.key === "Enter" && addTask()}
          placeholder="Add a task..."
          className="flex-1 text-sm px-3 py-2 border border-[#E5E2DE] rounded-lg focus:outline-none bg-white"
          style={{ "--tw-ring-color": accentColor } as any} />
        {canAssign && members.length > 0 && (
          <select value={assignTo} onChange={e => setAssignTo(e.target.value)}
            className="text-xs px-2 py-2 border border-[#E5E2DE] rounded-lg bg-white focus:outline-none">
            <option value={userId}>Myself</option>
            {members.filter(m => m.user_id !== userId).map((m: any) => (
              <option key={m.user_id} value={m.user_id}>
                {m.invited_email?.split("@")[0] ?? "Member"}
              </option>
            ))}
          </select>
        )}
        <button onClick={addTask} disabled={adding || !newTask.trim()}
          className="px-4 py-2 text-white text-sm font-semibold rounded-lg disabled:opacity-40 transition-colors"
          style={{ backgroundColor: accentColor }}>
          Add
        </button>
      </div>

      {/* Board */}
      <div className="grid grid-cols-3 gap-3">
        {STATUSES.map(status => {
          const colTasks = visibleTasks.filter(t => t.status === status);
          return (
            <div key={status} className={`bg-white rounded-xl border-t-2 ${STATUS_COLORS[status]} border border-[#E5E2DE] p-3`}>
              <div className="text-xs font-bold text-[#737373] uppercase tracking-wider mb-3">
                {STATUS_LABELS[status]} ({colTasks.length})
              </div>
              <div className="space-y-2">
                {colTasks.map(task => {
                  const assignedMember = members.find(m => m.user_id === task.assigned_to);
                  const isOwn = task.assigned_to === userId || task.user_id === userId;
                  return (
                    <div key={task.id} onClick={() => cycleStatus(task)}
                      className={`text-xs p-2.5 rounded-lg cursor-pointer transition-colors
                        ${isOwn ? "bg-[#F7F5F2] hover:bg-[#EEE]" : "bg-blue-50 hover:bg-blue-100"}`}>
                      <div className="text-[#1A1A1A] font-medium">{task.title}</div>
                      {canSeeAll && task.assigned_to && task.assigned_to !== userId && (
                        <div className="text-[10px] text-[#737373] mt-1">
                          → {assignedMember?.invited_email?.split("@")[0] ?? "member"}
                        </div>
                      )}
                      {!isOwn && canSeeAll && (
                        <div className="text-[10px] mt-1 font-semibold" style={{ color: accentColor }}>assigned</div>
                      )}
                    </div>
                  );
                })}
                {colTasks.length === 0 && (
                  <div className="text-[10px] text-[#B0ADA9] text-center py-2">empty</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!canSeeAll && (
        <p className="text-[10px] text-[#B0ADA9] mt-3 text-center">Showing your assigned tasks only</p>
      )}
    </div>
  );
}
