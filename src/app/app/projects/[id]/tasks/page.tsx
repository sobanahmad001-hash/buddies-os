'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Check, Plus } from 'lucide-react';

type Task = { id: string; title: string; status: string; priority: number | null; due_date: string | null };

export default function ProjectTasksPage() {
  const { id } = useParams<{ id: string }>();

  const [tasks,   setTasks]   = useState<Task[]>([]);
  const [newTask, setNewTask] = useState('');
  const [adding,  setAdding]  = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [id]);

  async function load() {
    const res = await fetch(`/api/projects/tasks?projectId=${id}`);
    if (res.ok) { const d = await res.json(); setTasks(d.tasks ?? []); }
    setLoading(false);
  }

  async function addTask() {
    if (!newTask.trim()) return;
    setAdding(true);
    await fetch('/api/projects/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: id, title: newTask.trim() }),
    });
    setNewTask('');
    setAdding(false);
    load();
  }

  async function cycleStatus(taskId: string, current: string) {
    const normalized = current === 'open' ? 'todo' : current;
    const next = normalized === 'todo' ? 'in_progress' : normalized === 'in_progress' ? 'done' : 'todo';
    await fetch('/api/projects/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: taskId, status: next }),
    });
    load();
  }

  async function markDone(taskId: string) {
    await fetch('/api/projects/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: taskId, status: 'done' }),
    });
    load();
  }

  const open = tasks.filter(t => t.status !== 'done');
  const done = tasks.filter(t => t.status === 'done');

  return (
    <div className="p-6 max-w-[860px]">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-[16px] font-semibold text-[#C8C5C0]">
          Tasks
          <span className="text-[13px] font-normal text-[#737373] ml-2">{open.length} open · {done.length} done</span>
        </h2>
      </div>

      {/* Add task */}
      <div className="flex gap-2 mb-6">
        <input
          value={newTask}
          onChange={e => setNewTask(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addTask()}
          placeholder="Add a task — press Enter to save"
          className="flex-1 text-sm px-3 py-2 border border-[#2D2D2D] rounded-lg focus:outline-none focus:border-[#B5622A] bg-[#1A1A1A]"
        />
        <button
          onClick={addTask}
          disabled={adding || !newTask.trim()}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#B5622A] text-white text-[13px] font-semibold rounded-lg hover:bg-[#9A4E20] disabled:opacity-40 transition-colors"
        >
          <Plus size={14} /> {adding ? '…' : 'Add'}
        </button>
      </div>

      {loading && <p className="text-[13px] text-[#737373]">Loading tasks…</p>}

      {/* Open tasks */}
      {open.length > 0 && (
        <div className="space-y-1.5 mb-6">
          {open.map(task => (
            <TaskRow key={task.id} task={task} onCycle={cycleStatus} onDone={markDone} />
          ))}
        </div>
      )}

      {/* Done tasks */}
      {done.length > 0 && (
        <>
          <p className="text-[11px] font-semibold text-[#737373] uppercase tracking-wide mb-2">Completed</p>
          <div className="space-y-1.5 opacity-50">
            {done.map(task => (
              <TaskRow key={task.id} task={task} onCycle={cycleStatus} onDone={markDone} />
            ))}
          </div>
        </>
      )}

      {!loading && tasks.length === 0 && (
        <div className="border-2 border-dashed border-[#2D2D2D] rounded-xl py-12 text-center">
          <p className="text-[14px] text-[#737373]">No tasks yet — add one above or ask the project assistant to create tasks.</p>
        </div>
      )}
    </div>
  );
}

function TaskRow({ task, onCycle, onDone }: {
  task: Task;
  onCycle: (id: string, status: string) => void;
  onDone: (id: string) => void;
}) {
  const isDone = task.status === 'done';
  const isIP   = task.status === 'in_progress';

  return (
    <div className={`flex items-center gap-3 p-2.5 rounded-lg border transition-colors group ${
      isDone ? 'border-[#2D2D2D]' : 'border-[#2D2D2D] hover:border-[#B5622A]'
    }`}>
      <button
        onClick={() => onCycle(task.id, task.status)}
        title="Cycle: todo → in progress → done"
        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 text-[9px] font-bold transition-colors ${
          isDone ? 'bg-[#2D6A4F] border-[#2D6A4F] text-white' :
          isIP   ? 'bg-[#F59E0B] border-[#F59E0B] text-white' :
                   'border-[#D1D5DB]'
        }`}
      >
        {isDone ? '✓' : isIP ? '→' : ''}
      </button>

      <span className={`text-sm flex-1 ${isDone ? 'line-through text-[#737373]' : 'text-[#C8C5C0]'}`}>
        {task.title}
      </span>

      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
        isDone ? 'bg-[#DCFCE7] text-[#2D6A4F]' :
        isIP   ? 'bg-[#FEF9C3] text-[#92400E]' :
                 'bg-[#F3F4F6] text-[#737373]'
      }`}>
        {task.status.replace('_', ' ')}
      </span>

      {!isDone && (
        <button
          onClick={() => onDone(task.id)}
          className="hidden group-hover:flex items-center gap-1 px-2 py-0.5 bg-[#DCFCE7] text-[#2D6A4F] text-[10px] font-semibold rounded-full"
        >
          <Check size={10} /> Done
        </button>
      )}

      {task.priority === 1 && (
        <span className="text-[10px] px-1.5 py-0.5 bg-[#FEE2E2] text-[#EF4444] rounded-full font-semibold">urgent</span>
      )}
      {task.due_date && (
        <span className="text-[10px] text-[#737373]">{task.due_date}</span>
      )}
    </div>
  );
}
