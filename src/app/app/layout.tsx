"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  LayoutDashboard, Bot, FolderKanban, Scale, ShieldCheck,
  SunMedium, Users, Search, LogOut, FlaskConical, X, Building2,
  BarChart2, ChevronDown, ChevronRight, Briefcase, UserCircle,
  Crown, UserCheck, GraduationCap, Globe2
} from "lucide-react";
import { WorkspaceProvider } from '@/context/WorkspaceContext';
import WorkspaceSwitcher from '@/components/WorkspaceSwitcher';
import BottomNav from '@/components/BottomNav';

// ── Owner-level nav items ──────────────────────────────────────────────────────
const ownerItems = [
  { to: "/app",             icon: LayoutDashboard, label: "Dashboard" },
  { to: "/app/ai",          icon: Bot,             label: "AI Assistant" },
  { to: "/app/projects",    icon: FolderKanban,    label: "Projects" },
  { to: "/app/decisions",   icon: Scale,           label: "Decisions" },
  { to: "/app/rules",       icon: ShieldCheck,     label: "Rules" },
  { to: "/app/daily-check", icon: SunMedium,       label: "Daily Check" },
  { to: "/app/research",    icon: FlaskConical,    label: "Research" },
  { to: "/app/search",      icon: Search,          label: "Search" },
];

// ── Workspace-level items ──────────────────────────────────────────────────────
const workspaceItems = [
  { to: "/app/workspace",   icon: Users,           label: "Workspace" },
  { to: "/app/clients",     icon: UserCircle,      label: "Clients" },
  { to: "/app/marketing",   icon: BarChart2,       label: "Marketing" },
];

// ── Orgs under Workspace ───────────────────────────────────────────────────────
const orgItems = [
  { to: "/app/org?org=anka-sphere",    icon: Globe2,    label: "Anka Sphere" },
  { to: "/app/org?org=anka-diversify", icon: Briefcase, label: "Anka Diversify" },
];

// ── Agent tiers ────────────────────────────────────────────────────────────────
const agentItems = [
  { to: "/app/org?view=agents&role=project-head", icon: Crown,        label: "Project Head" },
  { to: "/app/org?view=agents&role=executive",    icon: UserCheck,    label: "Executive" },
  { to: "/app/org?view=agents&role=intern",       icon: GraduationCap,label: "Intern" },
];

function NavLink({ to, icon: Icon, label, collapsed, indent = 0, onClick }: {
  to: string; icon: any; label: string; collapsed: boolean; indent?: number; onClick?: () => void;
}) {
  const pathname = usePathname();
  const active = pathname.split("?")[0] === to.split("?")[0];
  const pl = indent === 0 ? "px-3" : indent === 1 ? "pl-5 pr-3" : "pl-7 pr-3";
  return (
    <Link href={to} onClick={onClick}
      className={`flex items-center gap-3 py-[7px] mx-2 rounded-lg text-[13px] transition-colors ${pl} ${
        active ? "bg-[#1E1E1E] text-white font-medium" : "text-[#8A8A8A] hover:text-white hover:bg-[#1E1E1E]"
      }`}
      title={collapsed ? label : undefined}>
      <Icon className="w-[16px] h-[16px] shrink-0" />
      {!collapsed && <span className="leading-tight">{label}</span>}
    </Link>
  );
}

function SectionLabel({ label, collapsed }: { label: string; collapsed: boolean }) {
  if (collapsed) return <div className="my-1 mx-2 border-t border-[#1E1E1E]" />;
  return (
    <div className="px-4 pt-4 pb-1">
      <span className="text-[9px] font-bold tracking-[0.12em] uppercase text-[#3A3A3A]">{label}</span>
    </div>
  );
}

function CollapsibleSection({ label, icon: Icon, children, collapsed, defaultOpen = false }: {
  label: string; icon: any; children: React.ReactNode; collapsed: boolean; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (collapsed) return <>{children}</>;
  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 w-full px-3 mx-0 py-[7px] pl-5 pr-3 text-[#8A8A8A] hover:text-white transition-colors text-[11px] font-semibold uppercase tracking-wider">
        <Icon className="w-[14px] h-[14px] shrink-0" />
        <span className="flex-1 text-left">{label}</span>
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
      </button>
      {open && <div className="pl-2">{children}</div>}
    </div>
  );
}

function NavContent({
  collapsed, setCollapsed, mobileOpen, setMobileOpen
}: {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
}) {
  const router = useRouter();
  const close = () => setMobileOpen(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <div className={`flex flex-col h-full bg-[#0F0F0F] text-white transition-all duration-300 ${collapsed ? "w-[60px]" : "w-[220px]"}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-4 border-b border-[#1E1E1E]">
        {!collapsed && (
          <span className="text-[14px] font-bold tracking-tight">
            <span className="text-white">BUDDIES</span>
            <span className="text-[#E8521A]"> OS</span>
          </span>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden md:flex flex-col justify-center items-center w-7 h-7 gap-1 text-[#525252] hover:text-white rounded-lg hover:bg-[#1E1E1E] transition-colors shrink-0"
        >
          <span className="w-3.5 h-0.5 bg-current rounded-full" />
          <span className={`h-0.5 bg-current rounded-full ${collapsed ? "w-3.5" : "w-2.5"}`} />
          <span className="w-3.5 h-0.5 bg-current rounded-full" />
        </button>
        {mobileOpen && (
          <button onClick={close} className="md:hidden flex items-center justify-center w-8 h-8 text-[#8A8A8A] hover:text-white rounded-lg hover:bg-[#1E1E1E] transition-colors">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Workspace Switcher */}
      <div className="mt-3">
        <WorkspaceSwitcher />
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2 overflow-y-auto space-y-0.5">

        {/* ── OWNER ─────────────────────────────── */}
        <SectionLabel label="Owner" collapsed={collapsed} />
        {ownerItems.map(item => (
          <NavLink key={item.to} {...item} collapsed={collapsed} onClick={close} />
        ))}

        {/* ── WORKSPACE ─────────────────────────── */}
        <SectionLabel label="Workspace" collapsed={collapsed} />
        {workspaceItems.map(item => (
          <NavLink key={item.to} {...item} collapsed={collapsed} onClick={close} />
        ))}

        {/* Orgs collapsible */}
        <CollapsibleSection label="Organizations" icon={Building2} collapsed={collapsed} defaultOpen>
          {orgItems.map(item => (
            <NavLink key={item.to} {...item} collapsed={collapsed} indent={1} onClick={close} />
          ))}

          {/* Departments link inside orgs */}
          <NavLink to="/app/org?view=departments" icon={FolderKanban} label="Departments" collapsed={collapsed} indent={1} onClick={close} />

          {/* Agents collapsible */}
          <CollapsibleSection label="Agents" icon={Users} collapsed={collapsed} defaultOpen={false}>
            {agentItems.map(item => (
              <NavLink key={item.to} {...item} collapsed={collapsed} indent={2} onClick={close} />
            ))}
          </CollapsibleSection>
        </CollapsibleSection>

      </nav>

      {/* Logout */}
      <div className="border-t border-[#1E1E1E] p-2">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2 w-full rounded-lg text-sm text-[#8A8A8A] hover:text-white hover:bg-[#1E1E1E] transition-colors"
          title={collapsed ? "Log Out" : undefined}
        >
          <LogOut className="w-[18px] h-[18px] shrink-0" />
          {!collapsed && <span>Log Out</span>}
        </button>
      </div>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  // Close mobile sidebar on route change
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  return (
    <WorkspaceProvider>
      <div className="flex h-screen w-screen overflow-hidden bg-[#F7F5F2]">

        {/* Desktop sidebar */}
        <div className="hidden md:flex h-full">
          <NavContent
            collapsed={collapsed} setCollapsed={setCollapsed}
            mobileOpen={mobileOpen} setMobileOpen={setMobileOpen}
          />
        </div>

        {/* Mobile sidebar -- overlay */}
        {mobileOpen && (
          <>
            {/* Backdrop */}
            <div
              className="md:hidden fixed inset-0 bg-black/50 z-40"
              onClick={() => setMobileOpen(false)}
            />
            {/* Drawer */}
            <div className="md:hidden fixed left-0 top-0 h-full z-50 w-[200px]">
              <NavContent
                collapsed={false} setCollapsed={setCollapsed}
                mobileOpen={mobileOpen} setMobileOpen={setMobileOpen}
              />
            </div>
          </>
        )}

        {/* Main content */}
        <main className="flex-1 flex flex-col overflow-hidden min-w-0 pb-[60px] md:pb-0">
          {/* Mobile top bar */}
          <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-[#0F0F0F] border-b border-[#1E1E1E] shrink-0">
            <button onClick={() => setMobileOpen(true)}
              className="flex flex-col justify-center items-center w-8 h-8 gap-1.5 text-[#8A8A8A] hover:text-white rounded-lg hover:bg-[#1E1E1E] transition-colors">
              <span className="w-5 h-0.5 bg-current rounded-full" />
              <span className="w-5 h-0.5 bg-current rounded-full" />
              <span className="w-5 h-0.5 bg-current rounded-full" />
            </button>
            <span className="text-[14px] font-bold tracking-tight">
              <span className="text-white">BUDDIES</span>
              <span className="text-[#E8521A]"> OS</span>
            </span>
          </div>

          {children}
        </main>

        {/* Bottom Navigation (mobile) */}
        <BottomNav />
      </div>
    </WorkspaceProvider>
  );
}
