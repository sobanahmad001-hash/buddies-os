"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Github, Database, Triangle, Slack, FileText,
  Plus, Trash2, CheckCircle2, Circle, Loader2,
  ExternalLink, ChevronDown, ChevronUp, Zap, Link2,
  RefreshCw, AlertCircle, Lock
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Integration {
  id: string;
  type: string;
  name: string;
  config: Record<string, string>;
  status: "active" | "inactive";
  user_id: string;
  created_at: string;
}

// ── Integration definitions (extensible) ─────────────────────────────────────
const INTEGRATION_DEFS = [
  {
    type: "github",
    label: "GitHub",
    description: "Connect repositories, trigger workflows, and let Buddies read your codebase.",
    icon: Github,
    color: "#24292E",
    bg: "#F6F8FA",
    border: "#D0D7DE",
    fields: [
      { key: "org_or_user", label: "Organisation / Username", placeholder: "e.g. my-org", required: true },
      { key: "repo_url", label: "Repository URL (optional)", placeholder: "https://github.com/my-org/repo", required: false },
      { key: "access_token", label: "Personal Access Token", placeholder: "ghp_…", type: "password", required: true },
    ],
    docsUrl: "https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token",
  },
  {
    type: "supabase",
    label: "Supabase",
    description: "Connect your Supabase project so Buddies can query data and run migrations.",
    icon: Database,
    color: "#3ECF8E",
    bg: "#F0FDF4",
    border: "#BBF7D0",
    fields: [
      { key: "project_url",       label: "Project URL",       placeholder: "https://xxxx.supabase.co",  required: true  },
      { key: "anon_key",          label: "Anon (public) Key", placeholder: "eyJ…",                    type: "password", required: true  },
      { key: "service_role_key",  label: "Service Role Key",  placeholder: "eyJ…",                    type: "password", required: false },
    ],
    docsUrl: "https://supabase.com/docs/guides/api/api-keys",
  },
  {
    type: "vercel",
    label: "Vercel",
    description: "Monitor deployments and trigger builds directly from Buddies.",
    icon: Triangle,
    color: "#000000",
    bg: "#FAFAFA",
    border: "#E5E5E5",
    fields: [
      { key: "team_slug",   label: "Team / Account Slug", placeholder: "my-team",  required: true  },
      { key: "project_name",label: "Project Name",         placeholder: "my-app",   required: false },
      { key: "access_token",label: "Access Token",         placeholder: "vercel_…", type: "password", required: true  },
    ],
    docsUrl: "https://vercel.com/account/tokens",
  },
  {
    type: "slack",
    label: "Slack",
    description: "Send notifications and summaries to your Slack channels.",
    icon: Slack,
    color: "#4A154B",
    bg: "#FDF4FF",
    border: "#E9D5FF",
    fields: [
      { key: "webhook_url",   label: "Incoming Webhook URL", placeholder: "https://hooks.slack.com/…", required: true  },
      { key: "channel",       label: "Default Channel",      placeholder: "#general",                  required: false },
    ],
    docsUrl: "https://api.slack.com/messaging/webhooks",
    comingSoon: false,
  },
  {
    type: "notion",
    label: "Notion",
    description: "Sync documents and decisions with your Notion workspace.",
    icon: FileText,
    color: "#191919",
    bg: "#FAFAFA",
    border: "#E5E5E5",
    fields: [
      { key: "integration_token", label: "Internal Integration Token", placeholder: "secret_…", type: "password", required: true },
      { key: "database_id",       label: "Default Database ID",        placeholder: "32-char uuid",                required: false },
    ],
    docsUrl: "https://developers.notion.com/docs/authorization",
    comingSoon: false,
  },
  {
    type: "linear",
    label: "Linear",
    description: "Link issues and sprints so Buddies can track engineering progress.",
    icon: Zap,
    color: "#5E6AD2",
    bg: "#F5F5FF",
    border: "#C7D2FE",
    fields: [
      { key: "api_key",   label: "API Key",      placeholder: "lin_api_…", type: "password", required: true },
      { key: "team_name", label: "Team Name",    placeholder: "Engineering",                  required: false },
    ],
    docsUrl: "https://linear.app/settings/api",
    comingSoon: false,
  },
];

// ── ConnectForm ───────────────────────────────────────────────────────────────
function ConnectForm({
  def,
  onSave,
  onCancel,
}: {
  def: typeof INTEGRATION_DEFS[0];
  onSave: (name: string, config: Record<string, string>) => Promise<void>;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [name, setName] = useState(def.label);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    for (const f of def.fields) {
      if (f.required && !values[f.key]?.trim()) {
        setErr(`${f.label} is required`);
        return;
      }
    }
    setSaving(true);
    try {
      await onSave(name, values);
    } catch (e: any) {
      setErr(e.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 border border-[#E8E3DC] rounded-xl p-4 bg-[#FAFAF8] space-y-3">
      <div>
        <label className="block text-[11px] font-semibold text-[#6B6B6B] uppercase tracking-wide mb-1">Connection Name</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-full text-[13px] px-3 py-2 rounded-lg bg-white border border-[#E8E3DC] text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#2C5F8A]/30"
          placeholder="e.g. My GitHub Org"
        />
      </div>
      {def.fields.map(f => (
        <div key={f.key}>
          <label className="block text-[11px] font-semibold text-[#6B6B6B] uppercase tracking-wide mb-1">
            {f.label}{f.required && <span className="text-red-400 ml-1">*</span>}
          </label>
          <input
            type={f.type ?? "text"}
            value={values[f.key] ?? ""}
            onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
            placeholder={f.placeholder}
            className="w-full text-[13px] px-3 py-2 rounded-lg bg-white border border-[#E8E3DC] text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#2C5F8A]/30"
            autoComplete="off"
          />
        </div>
      ))}
      {def.docsUrl && (
        <p className="flex items-center gap-1 text-[11px] text-[#8A8A8A]">
          <Lock className="w-3 h-3" />
          Credentials are masked before storage. Never stored in plaintext.{" "}
          <a href={def.docsUrl} target="_blank" rel="noopener noreferrer" className="text-[#2C5F8A] hover:underline flex items-center gap-0.5">
            Docs <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </p>
      )}
      {err && (
        <p className="flex items-center gap-1 text-[12px] text-red-500">
          <AlertCircle className="w-3 h-3" />{err}
        </p>
      )}
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#1A1A1A] text-white text-[12px] font-medium hover:bg-[#333] disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
          {saving ? "Connecting…" : "Connect"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-1.5 rounded-lg border border-[#E8E3DC] text-[#6B6B6B] text-[12px] hover:bg-[#F5F0EA] transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── IntegrationCard ───────────────────────────────────────────────────────────
function IntegrationCard({
  def,
  items,
  onAdd,
  onDelete,
}: {
  def: typeof INTEGRATION_DEFS[0];
  items: Integration[];
  onAdd: (name: string, config: Record<string, string>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const Icon = def.icon;
  const connected = items.length > 0;
  const [expanded, setExpanded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    setDeletingId(id);
    await onDelete(id);
    setDeletingId(null);
  }

  return (
    <div
      className={`rounded-2xl border transition-all ${connected ? "border-[#D4E8D0]" : "border-[#E8E3DC]"} bg-white overflow-hidden`}
      style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
    >
      {/* Header */}
      <div className="p-5">
        <div className="flex items-start gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: def.bg, border: `1px solid ${def.border}` }}
          >
            <Icon className="w-5 h-5" style={{ color: def.color }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-semibold text-[#1A1A1A]">{def.label}</span>
              {connected ? (
                <span className="flex items-center gap-1 text-[10px] font-semibold text-[#2D6A4F] bg-[#D1FAE5] px-2 py-0.5 rounded-full">
                  <CheckCircle2 className="w-2.5 h-2.5" />
                  {items.length} connected
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[10px] font-medium text-[#8A8A8A] bg-[#F5F5F4] px-2 py-0.5 rounded-full">
                  <Circle className="w-2.5 h-2.5" />
                  Not connected
                </span>
              )}
            </div>
            <p className="text-[12px] text-[#8A8A8A] mt-0.5 leading-snug">{def.description}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {connected && (
              <button
                onClick={() => setExpanded(v => !v)}
                className="p-1.5 rounded-lg text-[#8A8A8A] hover:text-[#1A1A1A] hover:bg-[#F5F0EA] transition-colors"
                title="View connections"
              >
                {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            )}
            <button
              onClick={() => { setShowForm(v => !v); setExpanded(true); }}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors flex items-center gap-1.5 ${
                showForm
                  ? "bg-[#F5F0EA] text-[#6B6B6B]"
                  : "bg-[#1A1A1A] text-white hover:bg-[#333]"
              }`}
            >
              <Plus className="w-3 h-3" />
              {showForm ? "Cancel" : "Connect"}
            </button>
          </div>
        </div>

        {/* Connect form */}
        {showForm && (
          <ConnectForm
            def={def}
            onSave={async (name, config) => {
              await onAdd(name, config);
              setShowForm(false);
              setExpanded(true);
            }}
            onCancel={() => setShowForm(false)}
          />
        )}
      </div>

      {/* Connected items list */}
      {expanded && connected && (
        <div className="border-t border-[#F0EDE8] divide-y divide-[#F0EDE8]">
          {items.map(item => (
            <div key={item.id} className="flex items-center gap-3 px-5 py-3">
              <div className="w-1.5 h-1.5 rounded-full bg-[#10B981] shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-[#1A1A1A] truncate">{item.name}</p>
                {Object.entries(item.config).slice(0, 2).map(([k, v]) => (
                  <p key={k} className="text-[11px] text-[#8A8A8A] truncate">
                    <span className="font-medium">{k.replace(/_/g, " ")}:</span> {v}
                  </p>
                ))}
              </div>
              <span className="text-[10px] text-[#B0B0B0] shrink-0">
                {new Date(item.created_at).toLocaleDateString()}
              </span>
              <button
                onClick={() => handleDelete(item.id)}
                disabled={deletingId === item.id}
                className="p-1.5 rounded-lg text-[#B0B0B0] hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                title="Disconnect"
              >
                {deletingId === item.id
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Trash2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  const fetchIntegrations = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/integrations").then(r => r.json()).catch(() => ({}));
    setIntegrations(res.integrations ?? []);
    setWorkspaceId(res.workspace_id ?? null);
    setLoading(false);
  }, []);

  useEffect(() => { fetchIntegrations(); }, [fetchIntegrations]);

  async function addIntegration(type: string, name: string, config: Record<string, string>) {
    const res = await fetch("/api/integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, name, config, workspace_id: workspaceId }),
    }).then(r => r.json());
    if (res.integration) setIntegrations(prev => [res.integration, ...prev]);
  }

  async function deleteIntegration(id: string) {
    await fetch(`/api/integrations/${id}`, { method: "DELETE" });
    setIntegrations(prev => prev.filter(i => i.id !== id));
  }

  const totalConnected = INTEGRATION_DEFS.reduce((acc, def) => {
    return acc + integrations.filter(i => i.type === def.type).length;
  }, 0);

  return (
    <div className="min-h-screen bg-[#FAF8F5] px-6 py-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link2 className="w-5 h-5 text-[#2C5F8A]" />
            <h1 className="text-[22px] font-bold text-[#1A1A1A]">Integrations</h1>
          </div>
          <p className="text-[13px] text-[#8A8A8A]">
            Connect external tools so Buddies can assist across your entire stack.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {totalConnected > 0 && (
            <span className="text-[12px] font-medium text-[#2D6A4F] bg-[#D1FAE5] px-3 py-1 rounded-full">
              {totalConnected} active connection{totalConnected !== 1 ? "s" : ""}
            </span>
          )}
          <button
            onClick={fetchIntegrations}
            disabled={loading}
            className="p-2 rounded-lg text-[#8A8A8A] hover:text-[#1A1A1A] hover:bg-[#F0EDE8] transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 rounded-2xl bg-[#F0EDE8] animate-pulse" />
          ))}
        </div>
      )}

      {/* Integration cards */}
      {!loading && (
        <div className="space-y-4">
          {INTEGRATION_DEFS.map(def => (
            <IntegrationCard
              key={def.type}
              def={def}
              items={integrations.filter(i => i.type === def.type)}
              onAdd={(name, config) => addIntegration(def.type, name, config)}
              onDelete={deleteIntegration}
            />
          ))}
        </div>
      )}

      {/* Footer note */}
      {!loading && (
        <div className="mt-8 flex items-start gap-2 p-4 rounded-xl bg-[#EFF6FF] border border-[#BFDBFE]">
          <Lock className="w-4 h-4 text-[#2C5F8A] shrink-0 mt-0.5" />
          <p className="text-[12px] text-[#3B536A] leading-relaxed">
            <strong>Security:</strong> All API keys, tokens, and secrets are masked (first 4 + last 4 characters) before being stored. 
            Buddies never stores your raw credentials. Share only the minimum required permissions with any token you create.
          </p>
        </div>
      )}
    </div>
  );
}
