"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  LayoutDashboard, Bot, FolderKanban, Scale, ShieldCheck,
  SunMedium, Users, Search, LogOut, FlaskConical, ChevronLeft, ChevronRight
} from "lucide-react";

const navItems = [
  { to: "/app",           icon: LayoutDashboard, label: "Dashboard" },
  { to: "/app/ai",        icon: Bot,             label: "AI Assistant" },
  { to: "/app/projects",  icon: FolderKanban,    label: "Projects" },
  { to: "/app/decisions", icon: Scale,           label: "Decisions" },
  { to: "/app/rules",     icon: ShieldCheck,     label: "Rules" },
  { to: "/app/daily-check", icon: SunMedium,     label: "Daily Check" },
  { to: "/app/research",  icon: FlaskConical,    label: "Research" },
  { to: "/app/workspace", icon: Users,           label: "Workspace" },
  { to: "/app/search",    icon: Search,          label: "Search" },
];

function Sidebar({ collapsed, setCollapsed }: { collapsed: boolean; setCollapsed: (v: boolean) => void }) {
  const pathname = usePathname();
  const router = useRouter();

  const isActive = (to: string) => {
    if (to === "/app") return pathname === "/app";
    return pathname.startsWith(to);
  };

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className={`flex flex-col h-full bg-[#0F0F0F] border-r border-[#1E1E1E] transition-all duration-200 ${collapsed ? "w-[60px]" : "w-[200px]"} shrink-0`}>
      {/* Logo */}
      <div className={`flex items-center px-4 py-5 border-b border-[#1E1E1E] ${collapsed ? "justify-center px-0" : "justify-between"}`}>
        {!collapsed && (
          <span className="text-[15px] font-bold tracking-tight">
            <span className="text-white">BUDDIES</span>
            <span className="text-[#E8521A]"> OS</span>
          </span>
        )}
        <button onClick={() => setCollapsed(!collapsed)}
          className="text-[#525252] hover:text-white transition-colors p-1 rounded-lg hover:bg-[#1E1E1E]">
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 flex flex-col gap-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.to);
          return (
            <Link key={item.to} href={item.to}
              title={collapsed ? item.label : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium
                ${active
                  ? "bg-[#E8521A] text-white"
                  : "text-[#8A8A8A] hover:bg-[#1A1A1A] hover:text-white"
                } ${collapsed ? "justify-center px-0" : ""}`}>
              <Icon size={16} className="shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="p-2 border-t border-[#1E1E1E]">
        {!collapsed && (
          <p className="text-[9px] text-[#3A3A3A] uppercase tracking-widest px-3 py-1 mb-1">Talk to log anything</p>
        )}
        <button onClick={signOut}
          title={collapsed ? "Sign Out" : undefined}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[#525252] hover:text-[#EF4444] hover:bg-[#1A1A1A] transition-all w-full text-sm ${collapsed ? "justify-center px-0" : ""}`}>
          <LogOut size={16} className="shrink-0" />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#F7F5F2]">
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />
      <main className="flex-1 flex flex-col overflow-hidden">
        {children}
      </main>
    </div>
  );
}
