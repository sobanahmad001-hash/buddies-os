"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  LayoutDashboard, Bot, FolderKanban, Scale, ShieldCheck,
  SunMedium, Users, Search, LogOut, FlaskConical, X
} from "lucide-react";
import { WorkspaceProvider } from '@/context/WorkspaceContext';
import WorkspaceSwitcher from '@/components/WorkspaceSwitcher';

const navItems = [
  { to: "/app",              icon: LayoutDashboard, label: "Dashboard" },
  { to: "/app/ai",           icon: Bot,             label: "AI Assistant" },
  { to: "/app/projects",     icon: FolderKanban,    label: "Projects" },
  { to: "/app/decisions",    icon: Scale,           label: "Decisions" },
  { to: "/app/rules",        icon: ShieldCheck,     label: "Rules" },
  { to: "/app/daily-check",  icon: SunMedium,       label: "Daily Check" },
  { to: "/app/research",     icon: FlaskConical,    label: "Research" },
  { to: "/app/clients",      icon: Users,           label: "Clients" },
  { to: "/app/workspace",    icon: Users,           label: "Workspace" },
  { to: "/app/search",       icon: Search,          label: "Search" },
];

function NavContent({
  collapsed, setCollapsed, mobileOpen, setMobileOpen
}: {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <div className={`flex flex-col h-full bg-[#0F0F0F] text-white transition-all duration-300 ${collapsed ? "w-[60px]" : "w-[200px]"}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-4 border-b border-[#1E1E1E]">
        {!collapsed && (
          <span className="text-[14px] font-bold tracking-tight">
            <span className="text-white">BUDDIES</span>
            <span className="text-[#E8521A]"> OS</span>
          </span>
        )}
        {/* Desktop collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden md:flex flex-col justify-center items-center w-7 h-7 gap-1 text-[#525252] hover:text-white rounded-lg hover:bg-[#1E1E1E] transition-colors shrink-0"
        >
          <span className="w-3.5 h-0.5 bg-current rounded-full transition-all" />
          <span className={`h-0.5 bg-current rounded-full transition-all ${collapsed ? "w-3.5" : "w-2.5"}`} />
          <span className="w-3.5 h-0.5 bg-current rounded-full transition-all" />
        </button>
        {/* Mobile close */}
        {mobileOpen && (
          <button
            onClick={() => setMobileOpen(false)}
            className="md:hidden flex flex-col justify-center items-center w-8 h-8 gap-1.5 text-[#8A8A8A] hover:text-white rounded-lg hover:bg-[#1E1E1E] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Workspace Switcher */}
      <div className="mt-3">
        <WorkspaceSwitcher />
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.to || (item.to !== "/app" && pathname.startsWith(item.to + "/"));
          return (
            <Link
              key={item.to}
              href={item.to}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-3 py-2 mx-2 rounded-lg text-sm transition-colors ${
                active
                  ? "bg-[#1E1E1E] text-white font-medium"
                  : "text-[#8A8A8A] hover:text-white hover:bg-[#1E1E1E]"
              }`}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="w-[18px] h-[18px] shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
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
        <main className="flex-1 flex flex-col overflow-hidden min-w-0">
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
      </div>
    </WorkspaceProvider>
  );
}
