'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, Users, Loader2 } from 'lucide-react';

interface Member {
  id: string;
  user_id: string;
  department_id: string;
  role: string;
  created_at: string;
}

interface Props {
  departmentId: string;
  departmentName: string;
}

export default function MemberManager({ departmentId, departmentName }: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<'member' | 'admin'>('member');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const fetchMembers = async () => {
    setLoading(true);
    const res = await fetch(`/api/members?department_id=${departmentId}`);
    const data = await res.json();
    setMembers(data.members ?? []);
    setLoading(false);
  };

  const addMember = async () => {
    const uid = userId.trim();
    if (!uid) return;
    setAdding(true);
    const res = await fetch('/api/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: uid, department_id: departmentId, role }),
    });
    const data = await res.json();
    if (data.member) {
      setMembers((prev) => [...prev, data.member]);
      setUserId('');
    }
    setAdding(false);
  };

  const removeMember = async (member: Member) => {
    setRemovingId(member.id);
    await fetch('/api/members', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: member.user_id, department_id: departmentId }),
    });
    setMembers((prev) => prev.filter((m) => m.id !== member.id));
    setRemovingId(null);
  };

  useEffect(() => { fetchMembers(); }, [departmentId]);

  const roleColor: Record<string, string> = {
    admin:  'bg-orange-100 text-orange-700',
    member: 'bg-gray-100 text-gray-600',
  };

  return (
    <div className="bg-white rounded-2xl border border-[#E5E2DE] p-5">
      <div className="flex items-center gap-2 mb-1">
        <Users className="w-4 h-4 text-[#E8521A]" />
        <h2 className="text-[15px] font-semibold text-[#0F0F0F]">Members</h2>
      </div>
      <p className="text-[11px] text-[#B0ADA9] mb-4"><span className="font-medium text-[#5C5855]">{departmentName}</span></p>

      {/* Add form */}
      <div className="space-y-2 mb-4">
        <input
          type="text"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder="User UUID..."
          className="w-full px-3 py-2 text-[13px] bg-[#F7F5F2] border border-[#E5E2DE] rounded-xl focus:outline-none focus:border-[#E8521A] placeholder-[#B0ADA9] text-[#0F0F0F] font-mono"
        />
        <div className="flex gap-2">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as 'member' | 'admin')}
            className="flex-1 px-3 py-2 text-[13px] bg-[#F7F5F2] border border-[#E5E2DE] rounded-xl focus:outline-none focus:border-[#E8521A] text-[#0F0F0F]"
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
          <button
            onClick={addMember}
            disabled={!userId.trim() || adding}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#E8521A] hover:bg-[#c94415] disabled:bg-[#E5E2DE] disabled:text-[#B0ADA9] text-white text-[13px] font-medium rounded-xl transition-colors"
          >
            {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Add
          </button>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-[#B0ADA9]" />
        </div>
      ) : members.length === 0 ? (
        <p className="text-[13px] text-[#B0ADA9] text-center py-4">No members yet.</p>
      ) : (
        <ul className="space-y-2">
          {members.map((member) => (
            <li key={member.id} className="flex items-center justify-between px-3 py-2.5 bg-[#F7F5F2] rounded-xl gap-2">
              <div className="min-w-0">
                <p className="text-[11px] font-mono text-[#5C5855] truncate">{member.user_id}</p>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${roleColor[member.role] ?? roleColor.member}`}>
                  {member.role}
                </span>
              </div>
              <button
                onClick={() => removeMember(member)}
                disabled={removingId === member.id}
                className="p-1.5 rounded-lg text-[#B0ADA9] hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
              >
                {removingId === member.id
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Trash2 className="w-3.5 h-3.5" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
