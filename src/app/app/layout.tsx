"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  LayoutDashboard, Bot, FolderKanban, Scale, ShieldCheck,
  SunMedium, Users, Search, LogOut, FlaskConical, X, Building2,
  BarChart2, ChevronDown, ChevronRight, UserCircle, Layers, Plus, BookOpen
} from "lucide-react";
import { WorkspaceProvider } from '@/context/WorkspaceContext';
import WorkspaceSwitcher from '@/components/WorkspaceSwitcher';
import BottomNav from '@/components/BottomNav';

// ── Owner-level nav items ──────────────────────────────────────────────────────
const ownerItems = [
  { to: "/app",             icon: LayoutDashboard, label: "Dashboard" },
  { to: "/app/ai",          icon: Bot,             label: "AI Assistant" },
  { to: "/app/documents",   icon: BookOpen,        label: "Documents" },
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
  { to: "/app/org",         icon: Building2,       label: "Organizations" },
];

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

// ── Dynamic org-and-departments collapsible ────────────────────────────────────
interface OrgItem { id: string; name: string; }
interface DeptItem { id: string; name: string; slug?: string; }

function OrgDeptSection({ org, collapsed, close }: { org: OrgItem; collapsed: boolean; close: () => void }) {
  const [open, setOpen] = useState(false);
  const [depts, setDepts] = useState<DeptItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const pathname = usePathname();
  const orgActive = pathname === `/app/org/${org.id}`;

  const toggle = async () => {
    if (!loaded) {
      const res = await fetch(`/api/departments?organization_id=${org.id}`);
      const data = await res.json();
      setDepts(data.departments ?? []);
      setLoaded(true);
    }
    setOpen(v => !v);
  };

  if (collapsed) {
    return (
      <Link href={`/app/org/${org.id}`} onClick={close}
        className={`flex items-center justify-center py-[7px] mx-2 rounded-lg transition-colors ${orgActive ? "bg-[#1E1E1E] text-white" : "text-[#8A8A8A] hover:text-white hover:bg-[#1E1E1E]"}`}
        title={org.name}>
        <Building2 className="w-[16px] h-[16px]" />
      </Link>
    );
  }

  return (
    <div>
      <div className={`flex items-center pl-5 pr-2 py-[7px] mx-2 rounded-lg transition-colors ${orgActive ? "bg-[#1E1E1E] text-white" : "text-[#8A8A8A] hover:text-white hover:bg-[#1E1E1E]"}`}>
        <Link href={`/app/org/${org.id}`} onClick={close} className="flex items-center gap-2 flex-1 min-w-0">
          <Building2 className="w-[14px] h-[14px] shrink-0" />
          <span className="text-[13px] leading-tight truncate">{org.name}</span>
        </Link>
        <button onClick={toggle} className="ml-1 p-0.5 rounded hover:bg-[#2E2E2E] shrink-0">
          {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </button>
      </div>
      {open && (
        <div className="pl-4">
          {depts.length === 0 ? (
            <p className="text-[11px] text-[#3A3A3A] pl-5 py-1">No departments</p>
          ) : (
            depts.map(dept => (
              <Link key={dept.id} href={`/app/org/${org.id}?dept=${dept.id}`} onClick={close}
                className={`flex items-center gap-2 pl-5 pr-3 py-[6px] mx-2 rounded-lg text-[12px] transition-colors ${
                  pathname === `/app/org/${org.id}` ? "text-[#8A8A8A] hover:text-white hover:bg-[#1E1E1E]" : "text-[#8A8A8A] hover:text-white hover:bg-[#1E1E1E]"
                }`}>
                <Layers className="w-[13px] h-[13px] shrink-0" />
                <span className="truncate">{dept.name}</span>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Dynamic Orgs section for sidebar ──────────────────────────────────────────
function OrgsSection({ collapsed, close }: { collapsed: boolean; close: () => void }) {
  const [orgs, setOrgs] = useState<OrgItem[]>([]);
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/organizations")
      .then(r => r.json())
      .then(d => { setOrgs(d.organizations ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (collapsed) {
    return (
      <>
        {orgs.map(org => (
          <OrgDeptSection key={org.id} org={org} collapsed={collapsed} close={close} />
        ))}
      </>
    );
  }

  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 w-full px-3 mx-0 py-[7px] pl-5 pr-3 text-[#8A8A8A] hover:text-white transition-colors text-[11px] font-semibold uppercase tracking-wider">
        <Building2 className="w-[14px] h-[14px] shrink-0" />
        <span className="flex-1 text-left">Organizations</span>
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
      </button>
      {open && (
        <div className="pl-2">
          {loading ? (
            <p className="text-[11px] text-[#3A3A3A] pl-5 py-1">Loading...</p>
          ) : orgs.length === 0 ? (
            <button
              onClick={() => { router.push("/app/org"); close(); }}
              className="flex items-center gap-1.5 pl-5 pr-3 py-[6px] mx-2 rounded-lg text-[12px] text-[#8A8A8A] hover:text-white hover:bg-[#1E1E1E] transition-colors">
              <Plus className="w-3 h-3" />
              <span>Create organization</span>
            </button>
          ) : (
            orgs.map(org => (
              <OrgDeptSection key={org.id} org={org} collapsed={collapsed} close={close} />
            ))
          )}
        </div>
      )}
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

        {/* ── ORGANIZATIONS (dynamic, from DB) ──── */}
        <OrgsSection collapsed={collapsed} close={close} />

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
