'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, Layers, Loader2 } from 'lucide-react';

interface Department {
  id: string;
  name: string;
  organization_id: string;
  created_at: string;
}

interface Props {
  organizationId: string;
  organizationName: string;
  onSelectDept: (dept: Department) => void;
  selectedDeptId?: string;
}

export default function DepartmentManager({ organizationId, organizationName, onSelectDept, selectedDeptId }: Props) {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [deptName, setDeptName] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const fetchDepartments = async () => {
    setLoading(true);
    const res = await fetch(`/api/departments?organization_id=${organizationId}`);
    const data = await res.json();
    setDepartments(data.departments ?? []);
    setLoading(false);
  };

  const createDepartment = async () => {
    const name = deptName.trim();
    if (!name) return;
    setCreating(true);
    const res = await fetch('/api/departments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organization_id: organizationId, name }),
    });
    const data = await res.json();
    if (data.department) {
      setDepartments((prev) => [...prev, data.department]);
      setDeptName('');
    }
    setCreating(false);
  };

  useEffect(() => { fetchDepartments(); }, [organizationId]);

  return (
    <div className="bg-white rounded-2xl border border-[#E5E2DE] p-5">
      <div className="flex items-center gap-2 mb-1">
        <Layers className="w-4 h-4 text-[#E8521A]" />
        <h2 className="text-[15px] font-semibold text-[#0F0F0F]">Departments</h2>
      </div>
      <p className="text-[11px] text-[#B0ADA9] mb-4">in <span className="font-medium text-[#5C5855]">{organizationName}</span></p>

      {/* Create form */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={deptName}
          onChange={(e) => setDeptName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && createDepartment()}
          placeholder="e.g. Marketing, Design..."
          className="flex-1 px-3 py-2 text-[13px] bg-[#F7F5F2] border border-[#E5E2DE] rounded-xl focus:outline-none focus:border-[#E8521A] placeholder-[#B0ADA9] text-[#0F0F0F]"
        />
        <button
          onClick={createDepartment}
          disabled={!deptName.trim() || creating}
          className="flex items-center gap-1.5 px-3 py-2 bg-[#E8521A] hover:bg-[#c94415] disabled:bg-[#E5E2DE] disabled:text-[#B0ADA9] text-white text-[13px] font-medium rounded-xl transition-colors"
        >
          {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Add
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-[#B0ADA9]" />
        </div>
      ) : departments.length === 0 ? (
        <p className="text-[13px] text-[#B0ADA9] text-center py-4">No departments yet.</p>
      ) : (
        <ul className="space-y-2">
          {departments.map((dept) => (
            <li
              key={dept.id}
              onClick={() => onSelectDept(dept)}
              className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${
                selectedDeptId === dept.id
                  ? 'bg-[#FFF4EF] border border-[#E8521A]'
                  : 'bg-[#F7F5F2] hover:bg-[#F0EDE9] border border-transparent'
              }`}
            >
              <p className="text-[13px] font-medium text-[#0F0F0F]">{dept.name}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
