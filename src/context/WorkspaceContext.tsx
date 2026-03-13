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
}

const WorkspaceContext = createContext<WorkspaceContextType>({
  workspaces: [],
  activeWorkspace: null,
  setActiveWorkspace: () => {},
  loading: true,
});

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspaceState] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function fetchWorkspaces() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Load via memberships (team members)
        const { data: memberships } = await supabase
          .from('memberships')
          .select('workspace_id, workspaces(id, name, slug, owner_id)')
          .eq('user_id', user.id)
          .eq('status', 'active');

        const memberWsIds = new Set<string>();
        const wsMap: Workspace[] = [];

        for (const m of (memberships ?? [])) {
          const w = (m as any).workspaces as Workspace | null;
          if (w && !memberWsIds.has(w.id)) {
            memberWsIds.add(w.id);
            wsMap.push(w);
          }
        }

        // Also load workspaces the user owns directly (owners may not have a membership row)
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
          const saved = wsMap.find((w: Workspace) => w.slug === savedSlug);
          setActiveWorkspaceState(saved || wsMap[0]);
        }
      } catch (err) {
        console.error('WorkspaceContext: failed to fetch workspaces', err);
      } finally {
        setLoading(false);
      }
    }
    fetchWorkspaces();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setActiveWorkspace = (ws: Workspace) => {
    setActiveWorkspaceState(ws);
    if (typeof window !== 'undefined') {
      localStorage.setItem('buddies_active_workspace', ws.slug);
    }
  };

  return (
    <WorkspaceContext.Provider value={{ workspaces, activeWorkspace, setActiveWorkspace, loading }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export const useWorkspace = () => useContext(WorkspaceContext);
