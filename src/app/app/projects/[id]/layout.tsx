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
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

type Project = { id: string; name: string; status: string; coding_agent_enabled?: boolean };

const BASE_TABS = [
  { label: 'Overview',  suffix: '',            icon: LayoutGrid  },
  { label: 'Assistant', suffix: '/assistant',  icon: Bot         },
  { label: 'Work',      suffix: '/tasks',      icon: CheckSquare },
  { label: 'Research',  suffix: '/research',   icon: FlaskConical},
  { label: 'Documents', suffix: '/documents',  icon: FileText    },
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
    s === 'active' ? 'bg-[#DCFCE7] text-[#2D6A4F]'
    : s === 'paused' ? 'bg-[#FEF9C3] text-[#92400E]'
    : 'bg-[#F7F5F2] text-[#737373]';

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="bg-white border-b border-[#E5E2DE] px-4 md:px-6 pt-5 pb-0 shrink-0">
        <div className="flex items-center gap-2 mb-3 text-[13px]">
          <button
            onClick={() => router.push('/app/projects')}
            className="text-[#CC785C] hover:text-[#b5684e] flex items-center gap-1"
          >
            <ArrowLeft size={13} /> Projects
          </button>

          <span className="text-[#D1CCCC]">/</span>

          <span className="text-[#404040] font-semibold truncate max-w-[260px]">
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
                    ? 'border-[#B5622A] text-[#B5622A]'
                    : 'border-transparent text-[#737373] hover:text-[#1A1A1A] hover:border-[#D1CCCC]'
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
