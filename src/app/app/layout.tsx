"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  LayoutDashboard, Bot, FolderKanban,
  Users, Search, LogOut, X,
  ChevronDown, ChevronRight, Plug,
  Palette, Code2, Megaphone
} from "lucide-react";
import { WorkspaceProvider } from '@/context/WorkspaceContext';
import WorkspaceSwitcher from '@/components/WorkspaceSwitcher';
import BottomNav from '@/components/BottomNav';
import { useRole } from '@/hooks/useRole';

// ── Owner-level nav items ──────────────────────────────────────────────────────
const ownerItems = [
  { to: "/app",              icon: LayoutDashboard, label: "Dashboard" },
  { to: "/app/ai",           icon: Bot,             label: "AI Assistant" },
  { to: "/app/projects",     icon: FolderKanban,    label: "Projects" },
  { to: "/app/integrations", icon: Plug,            label: "Integrations" },
  { to: "/app/search",       icon: Search,          label: "Search" },
];

// ── Dept config ────────────────────────────────────────────────────────────────
const DEPT_NAV = [
  { slug: "design",      icon: Palette,   label: "Design",      color: "#8B5CF6" },
  { slug: "development", icon: Code2,     label: "Development", color: "#3B82F6" },
  { slug: "marketing",   icon: Megaphone, label: "Marketing",   color: "#10B981" },
] as const;

function NavLink({ to, icon: Icon, label, collapsed, indent = 0, onClick }: {
  to: string; icon: any; label: string; collapsed: boolean; indent?: number; onClick?: () => void;
}) {
  const pathname = usePathname();
  const isOrgDetail = to.startsWith("/app/org/") && pathname.startsWith(to);
  const active = isOrgDetail || pathname.split("?")[0] === to.split("?")[0];
  const pl = indent === 0 ? "px-3" : indent === 1 ? "pl-5 pr-3" : "pl-7 pr-3";
  return (
    <Link href={to} onClick={onClick}
      className={`flex items-center gap-3 py-[7px] mx-2 rounded-lg text-[13px] transition-colors ${pl} ${
        active ? "bg-[#1E1E1E] text-white font-medium" : "text-[#8A8A8A] hover:text-white hover:bg-[#1E1E1E]"
      }`}
      title={collapsed ? label : undefined}>
      <Icon className="w-[16px] h-[16px] shrink-0" />
      {!collapsed && <span className="leading-tight truncate max-w-[140px]">{label}</span>}
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

// ── Department expandable nav item ────────────────────────────────────────────
function DeptNavItem({ dept, collapsed, close }: {
  dept: typeof DEPT_NAV[number]; collapsed: boolean; close: () => void;
}) {
  const pathname = usePathname();
  const base = `/app/dept/${dept.slug}`;
  const isInDept = pathname.startsWith(base);
  const [open, setOpen] = useState(isInDept);

  // Auto-expand when navigating into this dept
  useEffect(() => { if (isInDept) setOpen(true); }, [isInDept]);

  const Icon = dept.icon;

  if (collapsed) {
    return (
      <Link href={base} onClick={close}
        className={`flex items-center justify-center py-[7px] mx-2 rounded-lg transition-colors ${isInDept ? "bg-[#1E1E1E] text-white" : "text-[#8A8A8A] hover:text-white hover:bg-[#1E1E1E]"}`}
        title={dept.label}>
        <Icon className="w-[16px] h-[16px]" />
      </Link>
    );
  }

  return (
    <div>
      <div className={`flex items-center pl-5 pr-2 py-[7px] mx-2 rounded-lg transition-colors ${isInDept ? "bg-[#1E1E1E] text-white" : "text-[#8A8A8A] hover:text-white hover:bg-[#1E1E1E]"}`}>
        <Link href={base} onClick={close} className="flex items-center gap-2 flex-1 min-w-0">
          <Icon className="w-[14px] h-[14px] shrink-0" style={{ color: dept.color }} />
          <span className="text-[13px] leading-tight truncate">{dept.label}</span>
        </Link>
        <button onClick={() => setOpen(v => !v)} className="ml-1 p-0.5 rounded hover:bg-[#2E2E2E] shrink-0">
          {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </button>
      </div>
      {open && (
        <div className="pl-4">
          {[
            { label: "Overview",  to: base },
            { label: "Assistant", to: `${base}/assistant` },
            { label: "Projects",  to: `${base}/projects` },
          ].map(item => {
            const active = pathname === item.to || (item.to !== base && pathname.startsWith(item.to));
            return (
              <Link key={item.to} href={item.to} onClick={close}
                className={`flex items-center pl-5 pr-3 py-[6px] mx-2 rounded-lg text-[12px] transition-colors ${active ? "text-white bg-[#1E1E1E]" : "text-[#8A8A8A] hover:text-white hover:bg-[#1E1E1E]"}`}>
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Dept-only nav (for team members who only see their own dept) ───────────────
function DeptOnlyNav({ slug, close }: { slug: string; close: () => void }) {
  const pathname = usePathname();
  const dept = DEPT_NAV.find(d => d.slug === slug);
  const base = `/app/dept/${slug}`;
  const label = dept?.label ?? slug.charAt(0).toUpperCase() + slug.slice(1);
  const Icon = dept?.icon ?? Palette;
  const color = dept?.color ?? "#E8521A";

  return (
    <nav className="flex-1 py-2 overflow-y-auto space-y-0.5">
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 shrink-0" style={{ color }} />
          <span className="text-[11px] font-bold tracking-[0.12em] uppercase" style={{ color }}>{label}</span>
        </div>
      </div>
      {[
        { label: "Overview",  to: base },
        { label: "Assistant", to: `${base}/assistant` },
        { label: "Projects",  to: `${base}/projects` },
      ].map(item => {
        const active = pathname === item.to || (item.to !== base && pathname.startsWith(item.to));
        return (
          <Link key={item.to} href={item.to} onClick={close}
            className={`flex items-center gap-3 px-5 py-[7px] mx-2 rounded-lg text-[13px] transition-colors ${active ? "bg-[#1E1E1E] text-white font-medium" : "text-[#8A8A8A] hover:text-white hover:bg-[#1E1E1E]"}`}>
            {item.label}
          </Link>
        );
      })}
    </nav>
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
  const { isTeamMember, departmentSlug, loading: roleLoading } = useRole();

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

      {/* Role-based nav */}
      {!roleLoading && isTeamMember && departmentSlug ? (
        // ── Team member: show only their dept ───────────────────────────────
        <DeptOnlyNav slug={departmentSlug} close={close} />
      ) : (
        // ── Owner / default: show full nav ──────────────────────────────────
        <nav className="flex-1 py-2 overflow-y-auto space-y-0.5">

          {/* ── OWNER ────────────────────────────────── */}
          <SectionLabel label="Owner" collapsed={collapsed} />
          {ownerItems.map(item => (
            <NavLink key={item.to} {...item} collapsed={collapsed} onClick={close} />
          ))}

          {/* ── WORKSPACE ────────────────────────────── */}
          <SectionLabel label="Workspace" collapsed={collapsed} />
          <NavLink to="/app/workspace" icon={Users} label="Workspace" collapsed={collapsed} onClick={close} />

          {/* ── DEPARTMENTS (collapsible, inline sub-items) ── */}
          <SectionLabel label="Departments" collapsed={collapsed} />
          {DEPT_NAV.map(dept => (
            <DeptNavItem key={dept.slug} dept={dept} collapsed={collapsed} close={close} />
          ))}

        </nav>
      )}

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
