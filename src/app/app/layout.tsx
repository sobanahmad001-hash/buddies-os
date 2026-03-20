"use client";
import { useState, useEffect } from "react";
import { ToastProvider } from "@/components/Toast";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  LayoutDashboard,
  Bot,
  FolderKanban,
  Search,
  LogOut,
  X,
  BookOpen,
  Plug,
  TrendingUp,
  Code2,
  Settings2,
} from "lucide-react";
import BottomNav from "@/components/BottomNav";

const NAV_ITEMS = [
  { to: "/app",              icon: LayoutDashboard, label: "Dashboard" },
  { to: "/app/ai",           icon: Bot,             label: "AI Assistant" },
  { to: "/app/projects",     icon: FolderKanban,    label: "Projects" },
  { to: "/app/research",     icon: BookOpen,        label: "Research" },
  { to: "/app/integrations", icon: Plug,            label: "Integrations" },
  { to: "/app/trading",       icon: TrendingUp,      label: "Trading" },
  { to: "/app/coding-agent",  icon: Code2,            label: "Coding Agent" },
  { to: "/app/search",       icon: Search,          label: "Search" },
  { to: "/app/settings",     icon: Settings2,       label: "Settings" },
];

function NavLink({ to, icon: Icon, label, collapsed, onClick }: {
  to: string; icon: any; label: string; collapsed: boolean; onClick?: () => void;
}) {
  const pathname = usePathname();
  const active = to === "/app"
    ? pathname === "/app"
    : pathname.startsWith(to);

  return (
    <Link
      href={to}
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-[7px] mx-2 rounded-lg text-[13px] transition-colors ${
        active ? "bg-[#1E1E1E] text-[#C8C5C0] font-medium" : "text-[#525252] hover:text-[#C8C5C0] hover:bg-[#161616]"
      }`}
      title={collapsed ? label : undefined}
    >
      <Icon className="w-[16px] h-[16px] shrink-0" />
      {!collapsed && <span className="leading-tight truncate">{label}</span>}
    </Link>
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
  const [workspaceLogo, setWorkspaceLogo] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState<string>("BUDDIES OS");

  useEffect(() => {
    async function loadSettings() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("workspace_settings")
        .select("logo_url,workspace_name,accent_color")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data?.logo_url) setWorkspaceLogo(data.logo_url);
      if (data?.workspace_name) setWorkspaceName(data.workspace_name);
      if (data?.accent_color) document.documentElement.style.setProperty("--accent", data.accent_color);
    }
    loadSettings();

    function onUpdate(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail?.logo_url !== undefined) setWorkspaceLogo(detail.logo_url);
      if (detail?.workspace_name) setWorkspaceName(detail.workspace_name);
    }
    window.addEventListener("buddies:settings-updated", onUpdate);
    return () => window.removeEventListener("buddies:settings-updated", onUpdate);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <div className={`flex flex-col h-full bg-[#0F0F0F] text-white transition-all duration-300 ${collapsed ? "w-[60px]" : "w-[220px]"}`}>
      <div className="flex items-center justify-between px-3 py-4 border-b border-[#1E1E1E]">
        {!collapsed && (
          workspaceLogo
            ? <img src={workspaceLogo} alt="Logo" className="h-7 w-auto max-w-[120px] object-contain" />
            : <span className="text-[14px] font-bold tracking-tight">
                <span className="text-white">BUDDIES</span>
                <span className="text-[#B5622A]"> OS</span>
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
          <button
            onClick={close}
            className="md:hidden flex items-center justify-center w-8 h-8 text-[#8A8A8A] hover:text-white rounded-lg hover:bg-[#1E1E1E] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <nav className="flex-1 py-3 overflow-y-auto space-y-0.5">
        {NAV_ITEMS.map(item => (
          <NavLink key={item.to} {...item} collapsed={collapsed} onClick={close} />
        ))}
      </nav>

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

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  return (
    <ToastProvider>
    <ErrorBoundary>
    <div className="flex h-screen w-screen overflow-hidden bg-[#0D0D0D]">
      <div className="hidden md:flex h-full">
        <NavContent
          collapsed={collapsed}
          setCollapsed={setCollapsed}
          mobileOpen={mobileOpen}
          setMobileOpen={setMobileOpen}
        />
      </div>

      {mobileOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 bg-black/50 z-40"
            onClick={() => setMobileOpen(false)}
          />
          <div className="md:hidden fixed left-0 top-0 h-full z-50 w-[200px]">
            <NavContent
              collapsed={false}
              setCollapsed={setCollapsed}
              mobileOpen={mobileOpen}
              setMobileOpen={setMobileOpen}
            />
          </div>
        </>
      )}

      <main className="flex-1 flex flex-col overflow-hidden min-w-0 pb-[60px] md:pb-0">
        <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-[#0F0F0F] border-b border-[#1E1E1E] shrink-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="flex flex-col justify-center items-center w-8 h-8 gap-1.5 text-[#8A8A8A] hover:text-white rounded-lg hover:bg-[#1E1E1E] transition-colors"
          >
            <span className="w-5 h-0.5 bg-current rounded-full" />
            <span className="w-5 h-0.5 bg-current rounded-full" />
            <span className="w-5 h-0.5 bg-current rounded-full" />
          </button>
          <span className="text-[14px] font-bold tracking-tight">
            <span className="text-white">BUDDIES</span>
            <span className="text-[#B5622A]"> OS</span>
          </span>
          {/* mobile header uses static branding — nav sidebar handles dynamic logo */}
        </div>
        {children}
      </main>

      <BottomNav />
    </div>
    </ErrorBoundary>
    </ToastProvider>
  );
}

