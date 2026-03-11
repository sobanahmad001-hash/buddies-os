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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data: memberships } = await supabase
        .from('memberships')
        .select('workspace_id, workspaces(id, name, slug, owner_id)')
        .eq('user_id', user.id)
        .eq('status', 'active');

      if (memberships && memberships.length > 0) {
        const ws = memberships.map((m: any) => m.workspaces).filter(Boolean);
        setWorkspaces(ws);

        const savedSlug = typeof window !== 'undefined'
          ? localStorage.getItem('buddies_active_workspace')
          : null;
        const saved = ws.find((w: Workspace) => w.slug === savedSlug);
        setActiveWorkspaceState(saved || ws[0]);
      }
      setLoading(false);
    }
    fetchWorkspaces();
  }, [supabase]);

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
