'use client';

import { useEffect, useState } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  LayoutGrid,
  CheckSquare,
  Bot,
  FlaskConical,
  FileText,
  Terminal,
  Layers,
  Scale,
  Flag,
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

type Project = { id: string; name: string; status: string; coding_agent_enabled?: boolean };

const BASE_TABS = [
  { label: 'Overview',    suffix: '',            icon: LayoutGrid  },
  { label: 'AI Workspace',suffix: '/assistant',  icon: Bot         },
  { label: 'Work',        suffix: '/tasks',      icon: CheckSquare },
  { label: 'Structure',   suffix: '/structure',  icon: Layers      },
  { label: 'Milestones',  suffix: '/milestones', icon: Flag        },
  { label: 'Decisions',   suffix: '/decisions',  icon: Scale       },
  { label: 'Knowledge',   suffix: '/research',   icon: FlaskConical},
  { label: 'Deliverables',suffix: '/documents',  icon: FileText    },
];

const CODE_TAB = { label: 'Code', suffix: '/code', icon: Terminal };

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const id = params.id as string;

  const [project, setProject] = useState<Project | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const { data } = await supabase
        .from('projects')
        .select('id, name, status, coding_agent_enabled')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

      setProject(data);
    })();
  }, [id, router]);

  const base = `/app/projects/${id}`;
  const tabs = project?.coding_agent_enabled
    ? [...BASE_TABS, CODE_TAB]
    : BASE_TABS;

  const statusColor = (s: string) =>
    s === 'active' ? 'bg-surface-subtle text-positive'
    : s === 'paused' ? 'bg-surface-subtle text-caution'
    : 'bg-surface-subtle text-muted';

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="bg-surface border-b border-line px-4 md:px-6 pt-5 pb-0 shrink-0">
        <div className="flex items-center gap-2 mb-3 text-[13px]">
          <button
            onClick={() => router.push('/app/projects')}
            className="text-accent hover:opacity-80 flex items-center gap-1"
          >
            <ArrowLeft size={13} /> Projects
          </button>

          <span className="text-faint">/</span>

          <span className="text-ink font-semibold truncate max-w-[260px]">
            {project?.name ?? '…'}
          </span>

          {project?.status && (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${statusColor(project.status)}`}>
              {project.status}
            </span>
          )}
        </div>

        <div className="flex gap-0.5 overflow-x-auto -mb-px">
          {tabs.map((tab) => {
            const href = base + tab.suffix;
            const active = tab.suffix === '' ? pathname === base : pathname.startsWith(href);

            return (
              <Link
                key={tab.suffix}
                href={href}
                className={`flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium whitespace-nowrap border-b-2 transition-colors ${
                  active
                    ? 'border-accent text-accent'
                    : 'border-transparent text-muted hover:text-ink hover:border-line-strong'
                }`}
              >
                <tab.icon size={13} />
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-auto">{children}</div>
    </div>
  );
}
