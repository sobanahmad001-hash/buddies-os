'use client';

import { useState } from 'react';
import { Menu, X, LayoutDashboard, Bot, FolderKanban, Scale, ShieldCheck, SunMedium, FlaskConical, Users, Search, Palette, Code2, Megaphone, BarChart2, UserCircle } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ownerLinks = [
  { href: '/app',            icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/app/ai',         icon: Bot,             label: 'AI Assistant' },
  { href: '/app/projects',   icon: FolderKanban,    label: 'Projects' },
  { href: '/app/decisions',  icon: Scale,           label: 'Decisions' },
  { href: '/app/rules',      icon: ShieldCheck,     label: 'Rules' },
  { href: '/app/daily-check',icon: SunMedium,       label: 'Daily Check' },
  { href: '/app/research',   icon: FlaskConical,    label: 'Research' },
  { href: '/app/search',     icon: Search,          label: 'Search' },
];

const workspaceLinks = [
  { href: '/app/workspace',  icon: Users,           label: 'Workspace' },
  { href: '/app/clients',    icon: UserCircle,      label: 'Clients' },
  { href: '/app/marketing',  icon: BarChart2,       label: 'Marketing' },
];

const deptLinks = [
  { href: '/app/dept/design',      icon: Palette,   label: 'Design' },
  { href: '/app/dept/development', icon: Code2,     label: 'Development' },
  { href: '/app/dept/marketing',   icon: Megaphone, label: 'Marketing Dept' },
];

export default function MobileSidebar() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      {/* Hamburger trigger */}
      <button
        onClick={() => setIsOpen(true)}
        aria-label="Open menu"
        className="md:hidden fixed top-3 left-3 z-40 w-10 h-10 flex items-center justify-center bg-[#0F0F0F] text-white rounded-xl shadow-lg"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Backdrop */}
      {isOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Drawer */}
      <aside
        className={`md:hidden fixed top-0 left-0 h-full w-[220px] bg-[#0F0F0F] z-50 flex flex-col transform transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-[#1E1E1E]">
          <span className="text-[14px] font-bold tracking-tight">
            <span className="text-white">BUDDIES</span>
            <span className="text-[#E8521A]"> OS</span>
          </span>
          <button
            onClick={() => setIsOpen(false)}
            className="w-8 h-8 flex items-center justify-center text-[#8A8A8A] hover:text-white hover:bg-[#1E1E1E] rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 overflow-y-auto">
          <p className="px-4 pt-2 pb-1 text-[9px] font-bold tracking-[0.12em] uppercase text-[#3A3A3A]">Owner</p>
          {ownerLinks.map((link) => {
            const Icon = link.icon;
            const active = pathname === link.href || (link.href !== '/app' && pathname.startsWith(link.href + '/'));
            return (
              <Link key={link.href} href={link.href} onClick={() => setIsOpen(false)}
                className={`flex items-center gap-3 px-4 py-2.5 mx-2 rounded-xl text-[13px] transition-colors ${
                  active ? 'bg-[#1E1E1E] text-white font-medium' : 'text-[#8A8A8A] hover:text-white hover:bg-[#1E1E1E]'
                }`}>
                <Icon className="w-[18px] h-[18px] shrink-0" />
                <span>{link.label}</span>
              </Link>
            );
          })}
          <p className="px-4 pt-4 pb-1 text-[9px] font-bold tracking-[0.12em] uppercase text-[#3A3A3A]">Workspace</p>
          {workspaceLinks.map((link) => {
            const Icon = link.icon;
            const active = pathname === link.href || pathname.startsWith(link.href + '/');
            return (
              <Link key={link.href} href={link.href} onClick={() => setIsOpen(false)}
                className={`flex items-center gap-3 px-4 py-2.5 mx-2 rounded-xl text-[13px] transition-colors ${
                  active ? 'bg-[#1E1E1E] text-white font-medium' : 'text-[#8A8A8A] hover:text-white hover:bg-[#1E1E1E]'
                }`}>
                <Icon className="w-[18px] h-[18px] shrink-0" />
                <span>{link.label}</span>
              </Link>
            );
          })}
          <p className="px-4 pt-4 pb-1 text-[9px] font-bold tracking-[0.12em] uppercase text-[#3A3A3A]">Departments</p>
          {deptLinks.map((link) => {
            const Icon = link.icon;
            const active = pathname === link.href || pathname.startsWith(link.href + '/');
            return (
              <Link key={link.href} href={link.href} onClick={() => setIsOpen(false)}
                className={`flex items-center gap-3 px-4 py-2.5 mx-2 rounded-xl text-[13px] transition-colors ${
                  active ? 'bg-[#1E1E1E] text-white font-medium' : 'text-[#8A8A8A] hover:text-white hover:bg-[#1E1E1E]'
                }`}>
                <Icon className="w-[18px] h-[18px] shrink-0" />
                <span>{link.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
