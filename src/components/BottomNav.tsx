'use client';

import { LayoutDashboard, Bot, FolderKanban, Plug, Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/app',              icon: LayoutDashboard, label: 'Home' },
  { href: '/app/ai',           icon: Bot,             label: 'AI' },
  { href: '/app/projects',     icon: FolderKanban,    label: 'Projects' },
  { href: '/app/integrations', icon: Plug,            label: 'Integrations' },
  { href: '/app/search',       icon: Search,          label: 'Search' },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0F0F0F] border-t border-[#1E1E1E]"
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
                active ? 'text-[#E8521A]' : 'text-[#525252] hover:text-[#8A8A8A]'
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
