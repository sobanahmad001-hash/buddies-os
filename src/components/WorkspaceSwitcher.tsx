'use client';

import { useWorkspace } from '@/context/WorkspaceContext';
import { ChevronDown } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

export default function WorkspaceSwitcher() {
  const { workspaces, activeWorkspace, setActiveWorkspace, loading } = useWorkspace();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (loading || !activeWorkspace) {
    return (
      <div className="px-3 py-2 mb-4">
        <div className="h-10 bg-white/5 rounded-lg animate-pulse" />
      </div>
    );
  }

  return (
    <div className="relative px-3 mb-4" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-left"
      >
        <div className="min-w-0">
          <div className="text-xs text-white/40 uppercase tracking-wider font-medium">Workspace</div>
          <div className="text-sm font-semibold text-white truncate">{activeWorkspace.name}</div>
        </div>
        <ChevronDown className={\`w-4 h-4 text-white/40 transition-transform \${open ? 'rotate-180' : ''}\`} />
      </button>

      {open && workspaces.length > 1 && (
        <div className="absolute left-3 right-3 top-full mt-1 bg-[#1a1a2e] border border-white/10 rounded-lg shadow-xl z-50 overflow-hidden">
          {workspaces.map((ws) => (
            <button
              key={ws.id}
              onClick={() => { setActiveWorkspace(ws); setOpen(false); }}
              className={\`w-full text-left px-3 py-2.5 text-sm transition-colors \${
                ws.id === activeWorkspace.id
                  ? 'bg-white/10 text-white font-medium'
                  : 'text-white/60 hover:bg-white/5 hover:text-white'
              }\`}
            >
              {ws.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
