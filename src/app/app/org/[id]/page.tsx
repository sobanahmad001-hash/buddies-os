'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import {
  Building2, Layers, Plus, Trash2, Loader2, ChevronRight,
  Crown, UserCheck, GraduationCap, Users, ArrowLeft, Pencil, Check, X
} from 'lucide-react';
import AgentManager from '@/components/org/AgentManager';

interface Org        { id: string; name: string; created_at: string; }
interface Department { id: string; name: string; organization_id: string; created_at: string; }
interface DeptStats  { agentCount: number; }

const ROLE_META: Record<string, { label: string; icon: any; color: string }> = {
  dept_head: { label: 'Dept Head', icon: Crown,         color: '#E8521A' },
  executive: { label: 'Executive', icon: UserCheck,     color: '#3B82F6' },
  intern:    { label: 'Intern',    icon: GraduationCap, color: '#10B981' },
};

export default function OrgDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const orgId = params?.id as string;
  const activeDeptId = searchParams.get('dept');

  const [org, setOrg]         = useState<Org | null>(null);
  const [depts, setDepts]     = useState<Department[]>([]);
  const [deptStats, setDeptStats] = useState<Record<string, DeptStats>>({});
  const [loading, setLoading] = useState(true);

  // Create dept form
  const [newDeptName, setNewDeptName] = useState('');
  const [creating, setCreating]       = useState(false);

  // Edit org name
  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName]       = useState('');
  const [savingName, setSavingName]   = useState(false);

  // Delete dept
  const [deletingDeptId, setDeletingDeptId] = useState<string | null>(null);

  const loadDepts = useCallback(async () => {
    const res = await fetch(`/api/departments?organization_id=${orgId}`);
    const data = await res.json();
    const list: Department[] = data.departments ?? [];
    setDepts(list);

    // Load agent counts per dept
    const stats: Record<string, DeptStats> = {};
    await Promise.all(list.map(async d => {
      const r = await fetch(`/api/agents?department_id=${d.id}`);
      const ad = await r.json();
      stats[d.id] = { agentCount: (ad.agents ?? []).length };
    }));
    setDeptStats(stats);
  }, [orgId]);

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      // Fetch org details via the organizations API (GET returns all — find this one)
      const res = await fetch('/api/organizations');
      const data = await res.json();
      const found = (data.organizations ?? []).find((o: Org) => o.id === orgId);
      if (!found) { router.push('/app/org'); return; }
      setOrg(found);
      setEditName(found.name);
      await loadDepts();
      setLoading(false);
    })();
  }, [orgId, loadDepts, router]);

  const createDept = async () => {
    const name = newDeptName.trim();
    if (!name || !orgId) return;
    setCreating(true);
    const res = await fetch('/api/departments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organization_id: orgId, name }),
    });
    const data = await res.json();
    if (data.department) {
      setDepts(prev => [...prev, data.department]);
      setDeptStats(prev => ({ ...prev, [data.department.id]: { agentCount: 0 } }));
      setNewDeptName('');
    }
    setCreating(false);
  };

  const deleteDept = async (deptId: string) => {
    setDeletingDeptId(deptId);
    await fetch('/api/departments', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: deptId }),
    });
    setDepts(prev => prev.filter(d => d.id !== deptId));
    if (activeDeptId === deptId) router.push(`/app/org/${orgId}`);
    setDeletingDeptId(null);
  };

  const saveOrgName = async () => {
    const name = editName.trim();
    if (!name || !orgId) return;
    setSavingName(true);
    await fetch('/api/organizations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: orgId, name }),
    });
    setOrg(prev => prev ? { ...prev, name } : prev);
    setEditingName(false);
    setSavingName(false);
  };

  const activeDept = depts.find(d => d.id === activeDeptId) ?? null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-[#B0ADA9]" />
      </div>
    );
  }

  if (!org) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <p className="text-[#B0ADA9]">Organization not found.</p>
        <button onClick={() => router.push('/app/org')}
          className="flex items-center gap-1.5 text-[13px] text-[#E8521A] hover:underline">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Organizations
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-[#F7F5F2]">

      {/* Header */}
      <div className="px-6 py-5 border-b border-[#E5E2DE] bg-white shrink-0">
        <div className="flex items-center gap-2 text-[13px] text-[#B0ADA9] mb-2">
          <button onClick={() => router.push('/app/org')}
            className="flex items-center gap-1 hover:text-[#E8521A] transition-colors">
            <Building2 className="w-3.5 h-3.5" />
            <span>Organizations</span>
          </button>
          <ChevronRight className="w-3.5 h-3.5" />
          {editingName ? (
            <div className="flex items-center gap-1.5">
              <input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveOrgName(); if (e.key === 'Escape') setEditingName(false); }}
                className="text-[15px] font-semibold text-[#0F0F0F] bg-[#F7F5F2] border border-[#E8521A] rounded-lg px-2 py-0.5 focus:outline-none"
                autoFocus
              />
              <button onClick={saveOrgName} disabled={savingName}
                className="p-1 rounded-lg bg-[#E8521A] text-white hover:bg-[#c94415] transition-colors">
                {savingName ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              </button>
              <button onClick={() => setEditingName(false)}
                className="p-1 rounded-lg text-[#B0ADA9] hover:text-[#5C5855] hover:bg-[#F7F5F2] transition-colors">
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-[#0F0F0F] text-[15px]">{org.name}</span>
              <button onClick={() => setEditingName(true)}
                className="p-0.5 rounded text-[#B0ADA9] hover:text-[#5C5855] transition-colors">
                <Pencil className="w-3 h-3" />
              </button>
            </div>
          )}
          {activeDept && (
            <>
              <ChevronRight className="w-3.5 h-3.5" />
              <span className="text-[#5C5855]">{activeDept.name}</span>
            </>
          )}
        </div>
        <p className="text-[11px] text-[#B0ADA9]">
          {depts.length} department{depts.length !== 1 ? 's' : ''} ·{' '}
          created {new Date(org.created_at).toLocaleDateString()}
        </p>
      </div>

      <div className="flex-1 p-6 space-y-6">

        {/* Departments grid */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[13px] font-semibold text-[#5C5855] uppercase tracking-wider">Departments</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mb-4">
            {depts.map(dept => {
              const stats = deptStats[dept.id] ?? { agentCount: 0 };
              const isActive = activeDeptId === dept.id;
              return (
                <div key={dept.id}
                  className={`bg-white rounded-2xl border transition-colors cursor-pointer group ${
                    isActive ? 'border-[#E8521A] bg-[#FFF4EF]' : 'border-[#E5E2DE] hover:border-[#E8521A]'
                  }`}
                  onClick={() => router.push(`/app/org/${orgId}?dept=${dept.id}`)}>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isActive ? 'bg-[#E8521A]' : 'bg-[#F7F5F2] group-hover:bg-[#FFF4EF]'}`}>
                          <Layers className={`w-4 h-4 ${isActive ? 'text-white' : 'text-[#E8521A]'}`} />
                        </div>
                        <div>
                          <p className="text-[13px] font-semibold text-[#0F0F0F] leading-tight">{dept.name}</p>
                          <p className="text-[11px] text-[#B0ADA9]">
                            {new Date(dept.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); deleteDept(dept.id); }}
                        disabled={deletingDeptId === dept.id}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-[#B0ADA9] hover:text-red-500 hover:bg-red-50 transition-all shrink-0">
                        {deletingDeptId === dept.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    {/* Agent count breakdown */}
                    <div className="flex items-center gap-1.5">
                      <Users className="w-3 h-3 text-[#B0ADA9]" />
                      <span className="text-[11px] text-[#B0ADA9]">
                        {stats.agentCount} agent{stats.agentCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Add department card */}
            <div className="bg-white rounded-2xl border border-dashed border-[#E5E2DE] p-4">
              <p className="text-[12px] font-semibold text-[#5C5855] mb-2">New Department</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newDeptName}
                  onChange={e => setNewDeptName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && createDept()}
                  placeholder="e.g. Design..."
                  className="flex-1 px-3 py-1.5 text-[12px] bg-[#F7F5F2] border border-[#E5E2DE] rounded-xl focus:outline-none focus:border-[#E8521A] placeholder-[#B0ADA9] text-[#0F0F0F] min-w-0"
                />
                <button
                  onClick={createDept}
                  disabled={!newDeptName.trim() || creating}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-[#E8521A] hover:bg-[#c94415] disabled:bg-[#E5E2DE] disabled:text-[#B0ADA9] text-white text-[12px] font-medium rounded-xl transition-colors shrink-0">
                  {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Department detail — agents */}
        {activeDept && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Layers className="w-4 h-4 text-[#E8521A]" />
              <h3 className="text-[13px] font-semibold text-[#0F0F0F]">{activeDept.name} — Agents</h3>
              <button onClick={() => router.push(`/app/org/${orgId}`)}
                className="ml-auto text-[11px] text-[#B0ADA9] hover:text-[#5C5855] transition-colors">
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <AgentManager
                departmentId={activeDept.id}
                departmentName={activeDept.name}
                orgId={orgId}
              />

              {/* Role reference card */}
              <div className="bg-white rounded-2xl border border-[#E5E2DE] p-5">
                <h4 className="text-[13px] font-semibold text-[#0F0F0F] mb-3">Agent Hierarchy</h4>
                <div className="space-y-3">
                  {(['dept_head', 'executive', 'intern'] as const).map(role => {
                    const meta = ROLE_META[role];
                    const Icon = meta.icon;
                    const descriptions: Record<string, string> = {
                      dept_head: 'Full access — sees all tasks, projects & members. Can assign tasks.',
                      executive: 'Operational access — sees team projects and activity feed.',
                      intern:    'Limited access — sees only their assigned tasks.',
                    };
                    return (
                      <div key={role} className="flex items-start gap-3">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                          style={{ background: `${meta.color}15` }}>
                          <Icon className="w-3.5 h-3.5" style={{ color: meta.color }} />
                        </div>
                        <div>
                          <p className="text-[13px] font-medium text-[#0F0F0F]">{meta.label}</p>
                          <p className="text-[11px] text-[#B0ADA9] leading-relaxed">{descriptions[role]}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 pt-4 border-t border-[#E5E2DE]">
                  <p className="text-[11px] text-[#B0ADA9]">
                    To add agents, invite them from the <strong className="text-[#5C5855]">Workspace</strong> tab,
                    then assign them to this department via the members list.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* When no dept is selected, show org overview */}
        {!activeDept && depts.length > 0 && (
          <div className="bg-white rounded-2xl border border-[#E5E2DE] p-5">
            <h4 className="text-[13px] font-semibold text-[#0F0F0F] mb-3">Agent Overview</h4>
            <p className="text-[12px] text-[#B0ADA9] mb-4">Select a department above to manage its agents.</p>

            <div className="grid grid-cols-3 gap-3">
              {(['dept_head', 'executive', 'intern'] as const).map(role => {
                const meta = ROLE_META[role];
                const Icon = meta.icon;
                return (
                  <div key={role} className="p-3 rounded-xl border border-[#E5E2DE] text-center">
                    <div className="w-8 h-8 rounded-full mx-auto mb-1.5 flex items-center justify-center"
                      style={{ background: `${meta.color}15` }}>
                      <Icon className="w-4 h-4" style={{ color: meta.color }} />
                    </div>
                    <p className="text-[12px] font-semibold text-[#0F0F0F]">{meta.label}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
