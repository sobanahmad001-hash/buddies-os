'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Workspace {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
}

interface WorkspaceContextType {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  setActiveWorkspace: (ws: Workspace) => void;
  loading: boolean;
  refetch: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextType>({
  workspaces: [],
  activeWorkspace: null,
  setActiveWorkspace: () => {},
  loading: true,
  refetch: () => {},
});

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspaceState] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const supabase = createClient();

  useEffect(() => {
    async function fetchWorkspaces() {
      setLoading(true);
      try {
        // ── Primary: server-side API route (bypasses client RLS issues) ──
        const res = await fetch('/api/workspaces');
        if (res.ok) {
          const data: any[] = await res.json();
          const apiWs: Workspace[] = (data ?? [])
            .filter((w: any) => w?.id)
            .map((w: any) => ({
              id: w.id,
              name: w.name,
              slug: w.slug ?? w.id,
              owner_id: w.owner_id ?? '',
            }));

          if (apiWs.length > 0) {
            setWorkspaces(apiWs);
            const savedSlug = typeof window !== 'undefined'
              ? localStorage.getItem('buddies_active_workspace')
              : null;
            const saved = apiWs.find((w) => w.slug === savedSlug);
            setActiveWorkspaceState(saved ?? apiWs[0]);
            setLoading(false);
            return;
          }
        }

        // ── Fallback: direct Supabase queries ──────────────────────────────
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const wsMap: Workspace[] = [];
        const memberWsIds = new Set<string>();

        // Via memberships table
        const { data: memberships } = await supabase
          .from('memberships')
          .select('workspace_id, workspaces(id, name, slug, owner_id)')
          .eq('user_id', user.id)
          .eq('status', 'active');

        for (const m of (memberships ?? [])) {
          const w = (m as any).workspaces as Workspace | null;
          if (w && !memberWsIds.has(w.id)) {
            memberWsIds.add(w.id);
            wsMap.push(w);
          }
        }

        // Via direct ownership
        const { data: ownedWs } = await supabase
          .from('workspaces')
          .select('id, name, slug, owner_id')
          .eq('owner_id', user.id);

        for (const w of (ownedWs ?? [])) {
          if (!memberWsIds.has(w.id)) wsMap.push(w as Workspace);
        }

        if (wsMap.length > 0) {
          setWorkspaces(wsMap);
          const savedSlug = typeof window !== 'undefined'
            ? localStorage.getItem('buddies_active_workspace')
            : null;
          const saved = wsMap.find((w) => w.slug === savedSlug);
          setActiveWorkspaceState(saved ?? wsMap[0]);
        }
      } catch (err) {
        console.error('WorkspaceContext: failed to fetch workspaces', err);
      } finally {
        setLoading(false);
      }
    }
    fetchWorkspaces();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const setActiveWorkspace = (ws: Workspace) => {
    setActiveWorkspaceState(ws);
    if (typeof window !== 'undefined') {
      localStorage.setItem('buddies_active_workspace', ws.slug ?? ws.id);
    }
  };

  const refetch = () => setTick((t) => t + 1);

  return (
    <WorkspaceContext.Provider value={{ workspaces, activeWorkspace, setActiveWorkspace, loading, refetch }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export const useWorkspace = () => useContext(WorkspaceContext);
