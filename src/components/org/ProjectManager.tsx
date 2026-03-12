'use client';

import { useState, useEffect } from 'react';
import { Plus, FolderKanban, Loader2 } from 'lucide-react';

interface Project {
  id: string;
  name: string;
  status: string;
  department_id: string | null;
}

interface Props {
  departmentId: string;
  departmentName: string;
}

export default function ProjectManager({ departmentId, departmentName }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectName, setProjectName] = useState('');
  const [projectDesc, setProjectDesc] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const fetchProjects = async () => {
    setLoading(true);
    const res = await fetch('/api/projects');
    const data = await res.json();
    // Filter client-side to those belonging to this department
    const filtered = (data.projects ?? []).filter(
      (p: Project) => p.department_id === departmentId
    );
    setProjects(filtered);
    setLoading(false);
  };

  const createProject = async () => {
    const name = projectName.trim();
    if (!name) return;
    setCreating(true);
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        description: projectDesc.trim() || undefined,
        department_id: departmentId,
      }),
    });
    const data = await res.json();
    if (data.project) {
      setProjects((prev) => [data.project, ...prev]);
      setProjectName('');
      setProjectDesc('');
    }
    setCreating(false);
  };

  useEffect(() => { fetchProjects(); }, [departmentId]);

  const statusColor: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    completed: 'bg-blue-100 text-blue-700',
    archived: 'bg-gray-100 text-gray-500',
  };

  return (
    <div className="bg-white rounded-2xl border border-[#E5E2DE] p-5">
      <div className="flex items-center gap-2 mb-1">
        <FolderKanban className="w-4 h-4 text-[#E8521A]" />
        <h2 className="text-[15px] font-semibold text-[#0F0F0F]">Projects</h2>
      </div>
      <p className="text-[11px] text-[#B0ADA9] mb-4">in <span className="font-medium text-[#5C5855]">{departmentName}</span></p>

      {/* Create form */}
      <div className="space-y-2 mb-4">
        <input
          type="text"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          placeholder="Project name..."
          className="w-full px-3 py-2 text-[13px] bg-[#F7F5F2] border border-[#E5E2DE] rounded-xl focus:outline-none focus:border-[#E8521A] placeholder-[#B0ADA9] text-[#0F0F0F]"
        />
        <input
          type="text"
          value={projectDesc}
          onChange={(e) => setProjectDesc(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && createProject()}
          placeholder="Description (optional)..."
          className="w-full px-3 py-2 text-[13px] bg-[#F7F5F2] border border-[#E5E2DE] rounded-xl focus:outline-none focus:border-[#E8521A] placeholder-[#B0ADA9] text-[#0F0F0F]"
        />
        <button
          onClick={createProject}
          disabled={!projectName.trim() || creating}
          className="flex items-center gap-1.5 px-3 py-2 bg-[#E8521A] hover:bg-[#c94415] disabled:bg-[#E5E2DE] disabled:text-[#B0ADA9] text-white text-[13px] font-medium rounded-xl transition-colors"
        >
          {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Create Project
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-[#B0ADA9]" />
        </div>
      ) : projects.length === 0 ? (
        <p className="text-[13px] text-[#B0ADA9] text-center py-4">No projects yet.</p>
      ) : (
        <ul className="space-y-2">
          {projects.map((proj) => (
            <li key={proj.id} className="flex items-center justify-between px-3 py-2.5 bg-[#F7F5F2] rounded-xl">
              <p className="text-[13px] font-medium text-[#0F0F0F]">{proj.name}</p>
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${statusColor[proj.status] ?? statusColor.active}`}>
                {proj.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
