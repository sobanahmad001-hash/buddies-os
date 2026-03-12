'use client';

import { useState, useEffect } from 'react';
import { Building2, ChevronRight, Plus, Loader2, Globe2, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import DepartmentManager from '@/components/org/DepartmentManager';
import AgentManager from '@/components/org/AgentManager';

interface Organization { id: string; name: string; created_at: string; }
interface Department   { id: string; name: string; organization_id: string; created_at: string; }

export default function OrgPage() {
  const router = useRouter();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [orgName, setOrgName]   = useState('');
  const [creating, setCreating] = useState(false);
  const [selectedOrg,  setSelectedOrg]  = useState<Organization | null>(null);
  const [selectedDept, setSelectedDept] = useState<Department | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchOrgs = async () => {
    const res = await fetch('/api/organizations');
    const data = await res.json();
    setOrganizations(data.organizations ?? []);
    setLoading(false);
  };

  const createOrg = async () => {
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
      setOrganizations(prev => [data.organization, ...prev]);
      setOrgName('');
    }
    setCreating(false);
  };

  const deleteOrg = async (id: string) => {
    setDeletingId(id);
    await fetch('/api/organizations', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setOrganizations(prev => prev.filter(o => o.id !== id));
    if (selectedOrg?.id === id) { setSelectedOrg(null); setSelectedDept(null); }
    setDeletingId(null);
  };

  const handleSelectOrg = (org: Organization) => {
    setSelectedOrg(org);
    setSelectedDept(null);
  };

  useEffect(() => { fetchOrgs(); }, []);

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-[#F7F5F2]">
      {/* Header */}
      <div className="px-6 py-5 border-b border-[#E5E2DE] bg-white shrink-0">
        <div className="flex items-center gap-2 text-[13px] text-[#B0ADA9]">
          <Building2 className="w-4 h-4 text-[#E8521A]" />
          <span className="font-semibold text-[#0F0F0F] text-[15px]">Organizations</span>
          {selectedOrg && (
            <>
              <ChevronRight className="w-3.5 h-3.5" />
              <button onClick={() => { setSelectedOrg(null); setSelectedDept(null); }}
                className="text-[#5C5855] hover:text-[#E8521A] transition-colors">{selectedOrg.name}</button>
            </>
          )}
          {selectedDept && (
            <>
              <ChevronRight className="w-3.5 h-3.5" />
              <span className="text-[#5C5855]">{selectedDept.name}</span>
            </>
          )}
        </div>
        <p className="text-[11px] text-[#B0ADA9] mt-1">
          Manage organizations, departments and agents.
        </p>
      </div>

      <div className="flex-1 p-6">

        {/* Create org form */}
        <div className="bg-white rounded-2xl border border-[#E5E2DE] p-5 mb-5">
          <h3 className="text-[13px] font-semibold text-[#0F0F0F] mb-3">Create Organization</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={orgName}
              onChange={e => setOrgName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createOrg()}
              placeholder="e.g. Anka Sphere, Anka Diversify..."
              className="flex-1 px-3 py-2 text-[13px] bg-[#F7F5F2] border border-[#E5E2DE] rounded-xl focus:outline-none focus:border-[#E8521A] placeholder-[#B0ADA9] text-[#0F0F0F]"
            />
            <button
              onClick={createOrg}
              disabled={!orgName.trim() || creating}
              className="flex items-center gap-1.5 px-3 py-2 bg-[#E8521A] hover:bg-[#c94415] disabled:bg-[#E5E2DE] disabled:text-[#B0ADA9] text-white text-[13px] font-medium rounded-xl transition-colors">
              {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Create
            </button>
          </div>
        </div>

        {/* Orgs list */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-[#B0ADA9]" />
          </div>
        ) : organizations.length === 0 ? (
          <div className="text-center py-12">
            <Globe2 className="w-10 h-10 text-[#E5E2DE] mx-auto mb-3" />
            <p className="text-[14px] text-[#B0ADA9]">No organizations yet.</p>
            <p className="text-[12px] text-[#B0ADA9] mt-1">Create your first organization above.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">

            {/* Org cards */}
            <div className="col-span-1 space-y-2">
              <p className="text-[11px] font-bold tracking-[0.1em] uppercase text-[#B0ADA9] px-1 mb-2">Organizations</p>
              {organizations.map(org => (
                <div
                  key={org.id}
                  onClick={() => handleSelectOrg(org)}
                  className={`flex items-center justify-between px-3 py-3 rounded-xl cursor-pointer transition-colors border ${
                    selectedOrg?.id === org.id
                      ? 'bg-[#FFF4EF] border-[#E8521A]'
                      : 'bg-white border-[#E5E2DE] hover:border-[#E8521A]'
                  }`}>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-[#0F0F0F] truncate">{org.name}</p>
                    <p className="text-[11px] text-[#B0ADA9]">{new Date(org.created_at).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={e => { e.stopPropagation(); router.push(`/app/org/${org.id}`); }}
                      className="p-1.5 rounded-lg text-[#B0ADA9] hover:text-[#E8521A] hover:bg-[#FFF4EF] transition-colors"
                      title="Open org detail">
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); deleteOrg(org.id); }}
                      disabled={deletingId === org.id}
                      className="p-1.5 rounded-lg text-[#B0ADA9] hover:text-red-500 hover:bg-red-50 transition-colors">
                      {deletingId === org.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Departments panel */}
            {selectedOrg ? (
              <DepartmentManager
                organizationId={selectedOrg.id}
                organizationName={selectedOrg.name}
                onSelectDept={setSelectedDept}
                selectedDeptId={selectedDept?.id}
              />
            ) : (
              <div className="bg-white rounded-2xl border border-dashed border-[#E5E2DE] p-5 flex items-center justify-center min-h-[120px]">
                <p className="text-[13px] text-[#B0ADA9] text-center">Select an organization<br />to manage departments</p>
              </div>
            )}

            {/* Agents panel */}
            {selectedDept ? (
              <AgentManager
                departmentId={selectedDept.id}
                departmentName={selectedDept.name}
              />
            ) : (
              <div className="bg-white rounded-2xl border border-dashed border-[#E5E2DE] p-5 flex items-center justify-center min-h-[120px]">
                <p className="text-[13px] text-[#B0ADA9] text-center">Select a department<br />to view agents</p>
              </div>
            )}

            {/* Empty 4th col */}
            <div className="hidden xl:block" />

          </div>
        )}
  );
}
