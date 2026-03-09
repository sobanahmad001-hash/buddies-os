"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  LayoutDashboard, Sparkles, FolderKanban,
  Scale, ShieldCheck, Sun, Search, LogOut
} from "lucide-react";

const navItems = [
  { to: "/app",              icon: LayoutDashboard, label: "Dashboard" },
  { to: "/app/ai",           icon: Sparkles,        label: "AI Assistant", primary: true },
  { to: "/app/projects",     icon: FolderKanban,    label: "Projects" },
  { to: "/app/decisions",    icon: Scale,           label: "Decisions" },
  { to: "/app/rules",        icon: ShieldCheck,     label: "Rules" },
  { to: "/app/daily-check",  icon: Sun,             label: "Daily Check" },
  { to: "/app/search",       icon: Search,          label: "Search" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="flex min-h-screen bg-[#FAF9F7]">
      <aside className="w-[224px] min-h-screen bg-[#1A1A1A] flex flex-col shrink-0 fixed top-0 left-0 z-10">
        <div className="px-5 h-14 flex items-center border-b border-[#2A2A2A]">
          <span className="text-[14px] font-bold tracking-wider text-white">
            BUDDIES <span className="text-[#CC785C]">OS</span>
          </span>
        </div>

        <nav className="flex-1 py-4 px-3 flex flex-col gap-1">
          {navItems.map((item) => {
            const isActive = item.to === "/app"
              ? pathname === "/app"
              : pathname.startsWith(item.to);

            if (item.primary) {
              return (
                <Link key={item.to} href={item.to}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-semibold transition-colors mt-1 mb-1 ${
                    isActive
                      ? "bg-[#CC785C] text-white"
                      : "bg-[#CC785C]/10 text-[#CC785C] hover:bg-[#CC785C]/20"
                  }`}>
                  <item.icon size={15} />
                  {item.label}
                </Link>
              );
            }

            return (
              <Link key={item.to} href={item.to}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] transition-colors ${
                  isActive
                    ? "bg-[#CC785C]/15 text-[#CC785C]"
                    : "text-[#999] hover:text-white hover:bg-white/5"
                }`}>
                <item.icon size={16} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 pb-5 pt-2 border-t border-[#2A2A2A] mt-2">
          <p className="text-[10px] text-[#444] uppercase tracking-wider px-3 mb-2">Talk to log anything</p>
          <button onClick={handleSignOut}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-[#555] hover:text-[#999] transition-colors w-full">
            <LogOut size={16} />
            Sign Out
          </button>
        </div>
      </aside>

      <main className="ml-[224px] flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
