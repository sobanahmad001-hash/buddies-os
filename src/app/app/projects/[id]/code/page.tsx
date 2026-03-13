'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Code2, ExternalLink, Loader2 } from 'lucide-react';

// StackBlitz is designed to be embedded in iframes and supports GitHub OAuth
// sign-in inside the embed — unlike github.dev/vscode.dev which block iframes.
function buildEmbedUrl(repoPath: string) {
  return `https://stackblitz.com/github/${repoPath}?embed=1&theme=dark&hideNavigation=0`;
}

export default function ProjectCodePage() {
  const { id: projectId } = useParams<{ id: string }>();
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [githubUrl, setGithubUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
        setEmbedUrl(buildEmbedUrl(repo));
        setGithubUrl(`https://github.com/${repo}`);
      } else if (data?.config?.org_or_user) {
        setEmbedUrl(`https://stackblitz.com?embed=1&theme=dark`);
        setGithubUrl(`https://github.com/${data.config.org_or_user}`);
      } else {
        setEmbedUrl('https://stackblitz.com?embed=1&theme=dark');
      }
      setLoading(false);
    })();
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-[#0F0F0F]">
        <Loader2 size={18} className="text-[#737373] animate-spin" />
      </div>
    );
  }

  if (!embedUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[#0F0F0F] gap-4 p-8 text-center">
        <Code2 size={28} className="text-[#737373]" />
        <p className="text-white font-semibold text-[15px]">No GitHub integration found</p>
        <p className="text-[#737373] text-[13px] max-w-[360px]">
          Connect a GitHub repo in Integrations to open it here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#1A1A1A] border-b border-[#2D2D2D] shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Code2 size={13} className="text-[#E8521A] shrink-0" />
          <span className="text-[11px] text-[#B0ADA9] font-mono truncate">StackBlitz — sign in with GitHub to edit</span>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          {githubUrl && (
            <a
              href={githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[11px] text-[#737373] hover:text-white px-2 py-1 rounded transition-colors"
            >
              GitHub <ExternalLink size={10} />
            </a>
          )}
          <a
            href={embedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[11px] text-[#E8521A] hover:text-[#FDBA9A] px-2 py-1 rounded bg-[#2D2D2D] transition-colors font-semibold"
          >
            <ExternalLink size={11} /> Full screen
          </a>
        </div>
      </div>

      <iframe
        src={embedUrl}
        className="flex-1 w-full border-none bg-[#1E1E1E]"
        title="StackBlitz"
        allow="clipboard-read; clipboard-write; cross-origin-isolated"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-storage-access-by-user-activation"
      />
    </div>
  );
}
