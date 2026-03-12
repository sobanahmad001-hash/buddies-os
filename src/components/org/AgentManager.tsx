'use client';

import { useState, useEffect } from 'react';
import { Users, Loader2, Crown, UserCheck, GraduationCap, Mail, Trash2, ChevronDown } from 'lucide-react';

interface Agent {
  id: string;
  user_id: string | null;
  role: string;
  status: string;
  department_id: string;
  invited_email: string | null;
  profile?: { full_name: string | null; avatar_url: string | null };
  departments?: { id: string; name: string; slug: string };
}

interface Props {
  departmentId: string;
  departmentName: string;
  orgId?: string;
}

const ROLES = ['dept_head', 'executive', 'intern'] as const;
const ROLE_META: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  dept_head: { label: 'Dept Head',  icon: Crown,        color: '#E8521A', bg: '#FFF4EF' },
  executive: { label: 'Executive',  icon: UserCheck,    color: '#3B82F6', bg: '#EFF6FF' },
  intern:    { label: 'Intern',     icon: GraduationCap,color: '#10B981', bg: '#F0FDF4' },
};

function RoleBadge({ role }: { role: string }) {
  const meta = ROLE_META[role];
  if (!meta) return <span className="text-[11px] text-[#B0ADA9]">{role}</span>;
  const Icon = meta.icon;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium"
      style={{ color: meta.color, background: meta.bg }}>
      <Icon className="w-2.5 h-2.5" />
      {meta.label}
    </span>
  );
}

export default function AgentManager({ departmentId, departmentName, orgId }: Props) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const fetchAgents = async () => {
    setLoading(true);
    const res = await fetch(`/api/agents?department_id=${departmentId}`);
    const data = await res.json();
    setAgents(data.agents ?? []);
    setLoading(false);
  };

  const changeRole = async (agent: Agent, newRole: string) => {
    setUpdatingId(agent.id);
    await fetch('/api/agents', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ membership_id: agent.id, role: newRole }),
    });
    setAgents(prev => prev.map(a => a.id === agent.id ? { ...a, role: newRole } : a));
    setUpdatingId(null);
  };

  const removeAgent = async (agent: Agent) => {
    setRemovingId(agent.id);
    await fetch('/api/agents', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ membership_id: agent.id }),
    });
    setAgents(prev => prev.filter(a => a.id !== agent.id));
    setRemovingId(null);
  };

  useEffect(() => { fetchAgents(); }, [departmentId]);

  const displayName = (agent: Agent) =>
    agent.profile?.full_name ?? agent.invited_email ?? agent.user_id ?? 'Unknown';

  // Group agents by role hierarchy
  const grouped = ROLES.reduce((acc, role) => {
    acc[role] = agents.filter(a => a.role === role);
    return acc;
  }, {} as Record<string, Agent[]>);

  return (
    <div className="bg-white rounded-2xl border border-[#E5E2DE] p-5">
      <div className="flex items-center gap-2 mb-1">
        <Users className="w-4 h-4 text-[#E8521A]" />
        <h2 className="text-[15px] font-semibold text-[#0F0F0F]">Agents</h2>
      </div>
      <p className="text-[11px] text-[#B0ADA9] mb-4">
        in <span className="font-medium text-[#5C5855]">{departmentName}</span>
      </p>

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-[#B0ADA9]" />
        </div>
      ) : agents.length === 0 ? (
        <div className="py-6 text-center">
          <p className="text-[13px] text-[#B0ADA9]">No agents assigned yet.</p>
          <p className="text-[11px] text-[#B0ADA9] mt-1">
            Invite members from the Workspace tab and assign them here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {ROLES.map(role => {
            const group = grouped[role];
            if (!group.length) return null;
            const meta = ROLE_META[role];
            const Icon = meta.icon;
            return (
              <div key={role}>
                <div className="flex items-center gap-1.5 mb-2">
                  <Icon className="w-3.5 h-3.5" style={{ color: meta.color }} />
                  <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: meta.color }}>
                    {meta.label}s
                  </span>
                  <span className="text-[10px] text-[#B0ADA9]">({group.length})</span>
                </div>
                <ul className="space-y-1.5">
                  {group.map(agent => (
                    <li key={agent.id} className="flex items-center justify-between px-3 py-2 bg-[#F7F5F2] rounded-xl gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                          style={{ background: meta.color }}>
                          {displayName(agent).charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[12px] font-medium text-[#0F0F0F] truncate leading-tight">
                            {displayName(agent)}
                          </p>
                          {agent.invited_email && !agent.profile?.full_name && (
                            <p className="text-[10px] text-[#B0ADA9] flex items-center gap-0.5">
                              <Mail className="w-2.5 h-2.5" /> pending invite
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Role switcher */}
                        <div className="relative">
                          <select
                            value={agent.role}
                            onChange={e => changeRole(agent, e.target.value)}
                            disabled={updatingId === agent.id}
                            className="appearance-none bg-white border border-[#E5E2DE] text-[11px] text-[#5C5855] pl-2 pr-5 py-1 rounded-lg focus:outline-none focus:border-[#E8521A] cursor-pointer"
                          >
                            {ROLES.map(r => (
                              <option key={r} value={r}>{ROLE_META[r].label}</option>
                            ))}
                          </select>
                          {updatingId === agent.id
                            ? <Loader2 className="absolute right-1.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 animate-spin text-[#B0ADA9]" />
                            : <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-[#B0ADA9] pointer-events-none" />
                          }
                        </div>
                        {/* Remove */}
                        <button
                          onClick={() => removeAgent(agent)}
                          disabled={removingId === agent.id}
                          className="p-1.5 rounded-lg text-[#B0ADA9] hover:text-red-500 hover:bg-red-50 transition-colors"
                        >
                          {removingId === agent.id
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <Trash2 className="w-3 h-3" />}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
