'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, Building2, Loader2 } from 'lucide-react';

interface Organization {
  id: string;
  name: string;
  created_at: string;
}

interface Props {
  onSelectOrg: (org: Organization) => void;
  selectedOrgId?: string;
}

export default function OrganizationManager({ onSelectOrg, selectedOrgId }: Props) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [orgName, setOrgName] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const fetchOrganizations = async () => {
    const res = await fetch('/api/organizations');
    const data = await res.json();
    setOrganizations(data.organizations ?? []);
    setLoading(false);
  };

  const createOrganization = async () => {
    const name = orgName.trim();
    if (!name) return;
    setCreating(true);
    const res = await fetch('/api/organizations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (data.organization) {
      setOrganizations((prev) => [data.organization, ...prev]);
      setOrgName('');
    }
    setCreating(false);
  };

  const deleteOrganization = async (id: string) => {
    await fetch('/api/organizations', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setOrganizations((prev) => prev.filter((o) => o.id !== id));
  };

  useEffect(() => { fetchOrganizations(); }, []);

  return (
    <div className="bg-white rounded-2xl border border-[#E5E2DE] p-5">
      <div className="flex items-center gap-2 mb-4">
        <Building2 className="w-4 h-4 text-[#E8521A]" />
        <h2 className="text-[15px] font-semibold text-[#0F0F0F]">Organizations</h2>
      </div>

      {/* Create form */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && createOrganization()}
          placeholder="New organization name..."
          className="flex-1 px-3 py-2 text-[13px] bg-[#F7F5F2] border border-[#E5E2DE] rounded-xl focus:outline-none focus:border-[#E8521A] placeholder-[#B0ADA9] text-[#0F0F0F]"
        />
        <button
          onClick={createOrganization}
          disabled={!orgName.trim() || creating}
          className="flex items-center gap-1.5 px-3 py-2 bg-[#E8521A] hover:bg-[#c94415] disabled:bg-[#E5E2DE] disabled:text-[#B0ADA9] text-white text-[13px] font-medium rounded-xl transition-colors"
        >
          {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Create
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-[#B0ADA9]" />
        </div>
      ) : organizations.length === 0 ? (
        <p className="text-[13px] text-[#B0ADA9] text-center py-4">No organizations yet. Create one above.</p>
      ) : (
        <ul className="space-y-2">
          {organizations.map((org) => (
            <li
              key={org.id}
              onClick={() => onSelectOrg(org)}
              className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${
                selectedOrgId === org.id
                  ? 'bg-[#FFF4EF] border border-[#E8521A]'
                  : 'bg-[#F7F5F2] hover:bg-[#F0EDE9] border border-transparent'
              }`}
            >
              <div>
                <p className="text-[13px] font-medium text-[#0F0F0F]">{org.name}</p>
                <p className="text-[11px] text-[#B0ADA9]">
                  {new Date(org.created_at).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); deleteOrganization(org.id); }}
                className="p-1.5 rounded-lg text-[#B0ADA9] hover:text-red-500 hover:bg-red-50 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
