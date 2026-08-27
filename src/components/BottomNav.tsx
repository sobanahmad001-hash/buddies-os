'use client';

import { CalendarCheck2, FolderKanban, Code2, FlaskConical, Inbox } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/app',          icon: CalendarCheck2,  label: 'Today' },
  { href: '/app/inbox',    icon: Inbox,           label: 'Inbox' },
  { href: '/app/projects', icon: FolderKanban,    label: 'Projects' },
  { href: '/app/coding-agent', icon: Code2,       label: 'Code' },
  { href: '/app/trading-lab', icon: FlaskConical, label: 'Trading Lab' },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface border-t border-line"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-center justify-around px-1 py-1">
        {links.map((link) => {
          const Icon = link.icon;
          const active = pathname === link.href || (link.href !== '/app' && pathname.startsWith(link.href + '/'));
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-xl min-w-[60px] transition-colors ${
                active ? 'text-accent bg-accent-soft' : 'text-muted hover:text-ink'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{link.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

