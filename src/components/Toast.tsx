"use client";
import { useEffect, useState, createContext, useContext, useCallback } from "react";
import { Check, X, AlertTriangle, Info, Loader2 } from "lucide-react";

type ToastType = "success" | "error" | "warning" | "info" | "loading";
type Toast = { id: string; message: string; type: ToastType; duration?: number };

interface ToastContextType {
  toast: (message: string, type?: ToastType, duration?: number) => string;
  dismiss: (id: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
  loading: (message: string) => string;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <Check size={13} className="text-[#10B981]" />,
  error:   <X size={13} className="text-[#EF4444]" />,
  warning: <AlertTriangle size={13} className="text-[#EAB308]" />,
  info:    <Info size={13} className="text-[#3B82F6]" />,
  loading: <Loader2 size={13} className="text-[#B5622A] animate-spin" />,
};

const STYLES: Record<ToastType, string> = {
  success: "border-[#10B98140] bg-[#0D1A12]",
  error:   "border-[#EF444440] bg-[#1A0D0D]",
  warning: "border-[#EAB30840] bg-[#1A1800]",
  info:    "border-[#3B82F640] bg-[#0D1220]",
  loading: "border-[#B5622A40] bg-[#1A1208]",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = useCallback((message: string, type: ToastType = "info", duration = 4000): string => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev.slice(-4), { id, message, type, duration }]);
    if (type !== "loading" && duration > 0) {
      setTimeout(() => dismiss(id), duration);
    }
    return id;
  }, [dismiss]);

  const success = useCallback((message: string) => { toast(message, "success"); }, [toast]);
  const error   = useCallback((message: string) => { toast(message, "error", 6000); }, [toast]);
  const warning = useCallback((message: string) => { toast(message, "warning"); }, [toast]);
  const info    = useCallback((message: string) => { toast(message, "info"); }, [toast]);
  const loading = useCallback((message: string) => toast(message, "loading", 0), [toast]);

  return (
    <ToastContext.Provider value={{ toast, dismiss, success, error, warning, info, loading }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id}
            className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border shadow-2xl
              backdrop-blur-sm min-w-[280px] max-w-[420px] animate-in slide-in-from-bottom-2 duration-200
              ${STYLES[t.type]}`}>
            <div className="shrink-0">{ICONS[t.type]}</div>
            <p className="text-[13px] text-[#C8C5C0] leading-snug flex-1">{t.message}</p>
            <button onClick={() => dismiss(t.id)}
              className="shrink-0 text-[#525252] hover:text-[#737373] transition-colors ml-1">
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
