'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Check, Link2, Plus, X } from 'lucide-react';

type Task = { id: string; title: string; status: string; priority: number | null; due_date: string | null };
type Dependency = { task_id: string; depends_on_task_id: string };

export default function ProjectTasksPage() {
  const { id } = useParams<{ id: string }>();

  const [tasks,     setTasks]     = useState<Task[]>([]);
  const [newTask,   setNewTask]   = useState('');
  const [adding,    setAdding]    = useState(false);
  const [loading,   setLoading]   = useState(true);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [dependencies, setDependencies] = useState<Dependency[]>([]);

  useEffect(() => { load(); }, [id]);

  async function load() {
    const [res, dependencyRes] = await Promise.all([
      fetch(`/api/projects/tasks?projectId=${id}`),
      fetch(`/api/projects/task-dependencies?projectId=${id}`),
    ]);
    if (res.ok) { const d = await res.json(); setTasks(d.tasks ?? []); }
    if (dependencyRes.ok) { const d = await dependencyRes.json(); setDependencies(d.dependencies ?? []); }
    setLoading(false);
  }

  async function addTask() {
    if (!newTask.trim()) return;
    setAdding(true);
    setTaskError(null);
    try {
      const res = await fetch('/api/projects/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: id, title: newTask.trim() }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as any).error || `Failed to add task (${res.status})`);
      }
      setNewTask('');
      load();
    } catch (err: any) {
      setTaskError(err.message || 'Failed to add task');
    } finally {
      setAdding(false);
    }
  }

  async function cycleStatus(taskId: string, current: string) {
    const normalized = current === 'open' ? 'todo' : current;
    const next = normalized === 'todo' ? 'in_progress' : normalized === 'in_progress' ? 'done' : 'todo';
    try {
      const res = await fetch('/api/projects/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: taskId, status: next }),
      });
      if (!res.ok) throw new Error('Failed to update task status');
      load();
    } catch (err: any) {
      setTaskError(err.message || 'Failed to update task');
    }
  }

  async function markDone(taskId: string) {
    try {
      const res = await fetch('/api/projects/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: taskId, status: 'done' }),
      });
      if (!res.ok) throw new Error('Failed to mark task as done');
      load();
    } catch (err: any) {
      setTaskError(err.message || 'Failed to mark task done');
    }
  }

  async function addDependency(taskId: string, dependsOnTaskId: string) {
    if (!dependsOnTaskId) return;
    const res = await fetch('/api/projects/task-dependencies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task_id: taskId, depends_on_task_id: dependsOnTaskId }) });
    if (!res.ok) { const data = await res.json().catch(() => ({})); setTaskError(data.error ?? 'Could not add dependency'); return; }
    load();
  }

  async function removeDependency(taskId: string, dependsOnTaskId: string) {
    await fetch('/api/projects/task-dependencies', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task_id: taskId, depends_on_task_id: dependsOnTaskId }) });
    load();
  }

  const open = tasks.filter(t => t.status !== 'done');
  const done = tasks.filter(t => t.status === 'done');

  return (
    <div className="mx-auto p-4 md:p-6 max-w-[900px]">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-[16px] font-semibold text-ink">
          Work
          <span className="text-[13px] font-normal text-muted ml-2">{open.length} open · {done.length} done</span>
        </h2>
      </div>

      {/* Add task */}
      <div className="flex gap-2 mb-6">
        <input
          value={newTask}
          onChange={e => setNewTask(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addTask()}
          placeholder="Add a task — press Enter to save"
          className="flex-1 text-sm px-3 py-2 border border-line rounded-xl text-ink focus:outline-none focus:border-accent bg-surface"
        />
        <button
          onClick={addTask}
          disabled={adding || !newTask.trim()}
          className="flex items-center gap-1.5 px-4 py-2 bg-accent text-white text-[13px] font-semibold rounded-xl hover:opacity-90 disabled:opacity-40 transition-opacity"
        >
          <Plus size={14} /> {adding ? '…' : 'Add'}
        </button>
      </div>

      {taskError && (
        <div className="mb-4 flex items-center justify-between gap-3 px-4 py-2.5 bg-surface border border-risk/30 rounded-lg text-[13px] text-risk">
          <span>{taskError}</span>
          <button onClick={() => setTaskError(null)} className="text-[11px] underline shrink-0">Dismiss</button>
        </div>
      )}

      {loading && <p className="text-[13px] text-muted">Loading tasks…</p>}

      {/* Open tasks */}
      {open.length > 0 && (
        <div className="space-y-1.5 mb-6">
          {open.map(task => (
            <TaskRow key={task.id} task={task} allTasks={tasks} dependencies={dependencies.filter(d => d.task_id === task.id)} onCycle={cycleStatus} onDone={markDone} onAddDependency={addDependency} onRemoveDependency={removeDependency} />
          ))}
        </div>
      )}

      {/* Done tasks */}
      {done.length > 0 && (
        <>
          <p className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-2">Completed</p>
          <div className="space-y-1.5 opacity-50">
            {done.map(task => (
              <TaskRow key={task.id} task={task} allTasks={tasks} dependencies={dependencies.filter(d => d.task_id === task.id)} onCycle={cycleStatus} onDone={markDone} onAddDependency={addDependency} onRemoveDependency={removeDependency} />
            ))}
          </div>
        </>
      )}

      {!loading && tasks.length === 0 && (
        <div className="border-2 border-dashed border-line rounded-xl py-12 text-center">
          <p className="text-[14px] text-muted">No tasks yet — add one above or ask the project assistant to create tasks.</p>
        </div>
      )}
    </div>
  );
}

function TaskRow({ task, allTasks, dependencies, onCycle, onDone, onAddDependency, onRemoveDependency }: {
  task: Task;
  allTasks: Task[];
  dependencies: Dependency[];
  onCycle: (id: string, status: string) => void;
  onDone: (id: string) => void;
  onAddDependency: (id: string, dependencyId: string) => void;
  onRemoveDependency: (id: string, dependencyId: string) => void;
}) {
  const isDone = task.status === 'done';
  const isIP   = task.status === 'in_progress';

  return (
    <div className={`flex flex-wrap items-center gap-3 p-3 rounded-xl border bg-surface transition-colors group ${
      isDone ? 'border-line' : 'border-line hover:border-accent'
    }`}>
      <button
        onClick={() => onCycle(task.id, task.status)}
        title="Cycle: todo → in progress → done"
        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 text-[9px] font-bold transition-colors ${
          isDone ? 'bg-positive border-positive text-white' :
          isIP   ? 'bg-caution border-caution text-white' :
                   'border-line-strong'
        }`}
      >
        {isDone ? '✓' : isIP ? '→' : ''}
      </button>

      <span className={`text-sm min-w-[160px] flex-1 ${isDone ? 'line-through text-muted' : 'text-ink'}`}>
        {task.title}
      </span>

      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
        isDone ? 'bg-surface-subtle text-positive' :
        isIP   ? 'bg-surface-subtle text-caution' :
                 'bg-surface-subtle text-muted'
      }`}>
        {task.status.replace('_', ' ')}
      </span>

      {!isDone && (
        <button
          onClick={() => onDone(task.id)}
          className="hidden group-hover:flex items-center gap-1 px-2 py-0.5 bg-surface-subtle text-positive text-[10px] font-semibold rounded-full"
        >
          <Check size={10} /> Done
        </button>
      )}

      {task.priority === 1 && (
        <span className="text-[10px] px-1.5 py-0.5 bg-surface-subtle text-risk rounded-full font-semibold">urgent</span>
      )}
      {task.due_date && (
        <span className="text-[10px] text-muted">{task.due_date}</span>
      )}
      {!isDone && <div className="basis-full flex flex-wrap items-center gap-1.5 border-t border-line pt-2"><Link2 size={11} className="text-faint"/>{dependencies.map(d => { const target=allTasks.find(t=>t.id===d.depends_on_task_id); return <span key={d.depends_on_task_id} className="flex items-center gap-1 rounded-full bg-surface-subtle px-2 py-1 text-[10px] text-muted">Blocked by {target?.title ?? 'task'}<button onClick={()=>onRemoveDependency(task.id,d.depends_on_task_id)} aria-label="Remove dependency"><X size={10}/></button></span> })}<select defaultValue="" onChange={e=>{onAddDependency(task.id,e.target.value);e.target.value=''}} className="rounded-lg border border-line bg-surface-subtle px-2 py-1 text-[10px] text-muted outline-none"><option value="">Add dependency…</option>{allTasks.filter(t=>t.id!==task.id && t.status!=='done' && !dependencies.some(d=>d.depends_on_task_id===t.id)).map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select></div>}
    </div>
  );
}
