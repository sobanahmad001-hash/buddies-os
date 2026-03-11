'use client';

import { useWorkspace } from '@/context/WorkspaceContext';
import { createClient } from '@/lib/supabase/client';
import { useEffect, useState } from 'react';
import { Briefcase, Plus, Search, Building2 } from 'lucide-react';
import Link from 'next/link';

interface Client {
  id: string;
  name: string;
  industry: string | null;
  status: string;
  workspace_id: string;
  created_at: string;
  stages_completed?: number;
  stages_total?: number;
}

export default function WorkspaceClientsPage() {
  const { activeWorkspace, loading: wsLoading } = useWorkspace();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIndustry, setNewIndustry] = useState('');
  const supabase = createClient();

  useEffect(() => {
    if (!activeWorkspace) return;
    fetchClients();
  }, [activeWorkspace]);

  async function fetchClients() {
    if (!activeWorkspace) return;
    setLoading(true);

    const { data, error } = await supabase
      .from('clients')
      .select(`
        id, name, industry, status, workspace_id, created_at,
        client_stages(id, status)
      `)
      .eq('workspace_id', activeWorkspace.id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      const enriched = data.map((c: any) => ({
        ...c,
        stages_total: c.client_stages?.length || 0,
        stages_completed: c.client_stages?.filter((s: any) => s.status === 'completed').length || 0,
      }));
      setClients(enriched);
    }
    setLoading(false);
  }

  async function handleAddClient(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || !activeWorkspace) return;

    const res = await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newName.trim(),
        industry: newIndustry.trim() || null,
        workspace_id: activeWorkspace.id,
      }),
    });

    if (res.ok) {
      setNewName('');
      setNewIndustry('');
      setShowForm(false);
      fetchClients();
    }
  }

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.industry && c.industry.toLowerCase().includes(search.toLowerCase()))
  );

  if (wsLoading) {
    return <div className="p-6 text-white/40">Loading workspace...</div>;
  }

  if (!activeWorkspace) {
    return <div className="p-6 text-white/40">No workspace selected</div>;
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Briefcase className="w-6 h-6" />
            Clients
          </h1>
          <p className="text-white/40 text-sm mt-1">
            <Building2 className="w-3.5 h-3.5 inline mr-1" />
            {activeWorkspace.name}
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Client
        </button>
      </div>

      {showForm && (
        <div className="mb-6 p-4 bg-white/5 rounded-lg border border-white/10 flex gap-3 items-end">
          <div className="flex-1">
            <label className="text-xs text-white/40 block mb-1">Client Name</label>
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Company name..."
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
              autoFocus
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-white/40 block mb-1">Industry</label>
            <input
              value={newIndustry}
              onChange={e => setNewIndustry(e.target.value)}
              placeholder="e.g. SaaS, Finance..."
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <button
            onClick={handleAddClient}
            className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-sm rounded-lg"
          >
            Save
          </button>
        </div>
      )}

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search clients..."
          className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
        />
      </div>

      {loading ? (
        <div className="text-white/40 py-8 text-center">Loading clients...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-white/30">
          <Briefcase className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-lg font-medium">No clients yet</p>
          <p className="text-sm mt-1">Add your first client to {activeWorkspace.name}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(client => {
            const total = client.stages_total ?? 0;
            const completed = client.stages_completed ?? 0;
            const pct = total > 0
              ? Math.round((completed / total) * 100)
              : 0;
            return (
              <Link
                key={client.id}
                href={`/app/clients/${client.id}`}
                className="block p-4 bg-white/5 hover:bg-white/8 border border-white/10 rounded-lg transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-white font-medium">{client.name}</h3>
                    {client.industry && (
                      <span className="text-xs text-white/40">{client.industry}</span>
                    )}
                  </div>
                  <div className="text-right">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      client.status === 'active' ? 'bg-green-500/20 text-green-400' :
                      client.status === 'onboarding' ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-white/10 text-white/40'
                    }`}>
                      {client.status}
                    </span>
                  </div>
                </div>
                {total > 0 && (
                  <div className="mt-2">
                    <div className="flex justify-between text-xs text-white/40 mb-1">
                      <span>Pipeline</span>
                      <span>{completed}/{total} ({pct}%)</span>
                    </div>
                    <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
