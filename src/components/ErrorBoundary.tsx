"use client";
import { Component, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props { children: ReactNode; fallback?: ReactNode; }
interface State { hasError: boolean; error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="flex-1 flex items-center justify-center bg-[#0D0D0D] p-8">
        <div className="max-w-[400px] text-center">
          <div className="w-12 h-12 rounded-2xl bg-[#1A0D0D] border border-[#EF444430] flex items-center justify-center mx-auto mb-4">
            <AlertTriangle size={20} className="text-[#EF4444]" />
          </div>
          <h2 className="text-[16px] font-semibold text-[#C8C5C0] mb-2">Something went wrong</h2>
          <p className="text-[13px] text-[#737373] mb-1 leading-relaxed">
            {this.state.error?.message || "An unexpected error occurred."}
          </p>
          <p className="text-[11px] text-[#525252] mb-6">
            Your data is safe — this is a display error only.
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="flex items-center gap-2 px-4 py-2 bg-[#B5622A] text-white text-[13px] font-semibold rounded-lg hover:bg-[#9A4E20] transition-colors">
              <RefreshCw size={13} /> Try Again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-[#1E1E1E] text-[#737373] text-[13px] rounded-lg hover:bg-[#2D2D2D] transition-colors">
              Reload Page
            </button>
          </div>
        </div>
      </div>
    );
  }
}
