'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Code2, ExternalLink, RefreshCw, Loader2 } from 'lucide-react';

export default function ProjectCodePage() {
  const { id: projectId } = useParams<{ id: string }>();
  const [codeUrl, setCodeUrl] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('integrations')
        .select('config')
        .eq('user_id', user.id)
        .eq('type', 'github')
        .eq('status', 'active')
        .limit(1)
        .single();

      if (data?.config?.repo_url) {
        const repo = (data.config.repo_url as string)
          .replace(/^https?:\/\/github\.com\//, '')
          .replace(/\.git$/, '')
          .replace(/\/$/, '');
        setCodeUrl(`https://github.dev/${repo}`);
      } else if (data?.config?.org_or_user) {
        setCodeUrl(`https://github.dev/${data.config.org_or_user}`);
      } else {
        setCodeUrl('https://vscode.dev');
      }
      setLoading(false);
    })();
  }, [projectId]);

  // github.dev / vscode.dev block cross-origin iframes via X-Frame-Options.
  // We can't detect the error directly, so we set a timer: if the iframe
  // hasn't loaded in 4s we assume it was blocked and show the fallback.
  useEffect(() => {
    if (!codeUrl) return;
    setBlocked(false);
    const timer = setTimeout(() => setBlocked(true), 4000);
    return () => clearTimeout(timer);
  }, [codeUrl, retryKey]);

  const handleRetry = () => {
    setRetryKey(k => k + 1);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-[#0F0F0F]">
        <Loader2 size={18} className="text-[#737373] animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#1A1A1A] border-b border-[#2D2D2D] shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Code2 size={13} className="text-[#E8521A] shrink-0" />
          <span className="text-[11px] text-[#B0ADA9] font-mono truncate">{codeUrl}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          {!blocked && (
            <button
              onClick={handleRetry}
              className="flex items-center gap-1 text-[11px] text-[#737373] hover:text-white px-2 py-1 rounded transition-colors"
            >
              <RefreshCw size={11} /> Retry
            </button>
          )}
          <a
            href={codeUrl ?? '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[11px] text-[#E8521A] hover:text-[#FDBA9A] px-2 py-1 rounded bg-[#2D2D2D] transition-colors font-semibold"
          >
            <ExternalLink size={11} /> Open in new tab
          </a>
        </div>
      </div>

      {/* Content */}
      {blocked ? (
        <div className="flex-1 flex flex-col items-center justify-center bg-[#0F0F0F] gap-6 text-center p-8">
          <div className="w-16 h-16 rounded-2xl bg-[#1A1A1A] border border-[#2D2D2D] flex items-center justify-center">
            <Code2 size={28} className="text-[#E8521A]" />
          </div>
          <div>
            <p className="text-white font-semibold text-[16px] mb-2">Open VS Code in your browser</p>
            <p className="text-[#737373] text-[13px] max-w-[400px]">
              VS Code can&apos;t be embedded here due to browser security restrictions, but you can open it directly in a new tab.
            </p>
          </div>
          <div className="flex flex-col gap-3 w-full max-w-[360px]">
            <a
              href={codeUrl ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-5 py-3 bg-[#E8521A] text-white rounded-xl font-semibold text-[14px] hover:bg-[#c94415] transition-colors"
            >
              <Code2 size={16} />
              Open in github.dev
              <ExternalLink size={13} />
            </a>
            <a
              href="https://vscode.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-5 py-3 bg-[#2D2D2D] text-[#B0ADA9] rounded-xl font-semibold text-[13px] hover:bg-[#3A3A3A] transition-colors"
            >
              Open vscode.dev
              <ExternalLink size={12} />
            </a>
            {codeUrl && codeUrl.startsWith('https://github.dev/') && (
              <a
                href={`https://github.com/${codeUrl.replace('https://github.dev/', '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 px-5 py-3 bg-[#2D2D2D] text-[#B0ADA9] rounded-xl font-semibold text-[13px] hover:bg-[#3A3A3A] transition-colors"
              >
                View on GitHub
                <ExternalLink size={12} />
              </a>
            )}
          </div>
        </div>
      ) : (
        <iframe
          key={retryKey}
          src={codeUrl ?? 'https://vscode.dev'}
          className="flex-1 w-full border-none bg-[#1E1E1E]"
          title="VS Code"
          allow="clipboard-read; clipboard-write"
        />
      )}
    </div>
  );
}
