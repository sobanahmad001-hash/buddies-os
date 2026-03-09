"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Project = { id: string; name: string };
const UPDATE_TYPES = ["progress", "blocker", "milestone", "note"] as const;
type UpdateType = (typeof UPDATE_TYPES)[number];

function ProjectUpdateForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const preselectedId = searchParams.get("project") ?? "";

  const [userId, setUserId] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectId, setProjectId] = useState(preselectedId);
  const [updateType, setUpdateType] = useState<UpdateType>("progress");
  const [content, setContent] = useState("");
  const [outcomes, setOutcomes] = useState("");
  const [nextActions, setNextActions] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id ?? null;
      setUserId(uid);
      if (uid) {
        const { data } = await supabase
          .from("projects")
          .select("id, name")
          .eq("user_id", uid)
          .eq("status", "active")
          .order("name");
        setProjects(data ?? []);
      }
      setLoading(false);
    }
    load();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setStatus(null);
    if (!userId) { setError("Not logged in."); return; }
    if (!projectId) { setError("Please select a project."); return; }
    if (!content.trim()) { setError("Content is required."); return; }

    const { error } = await supabase.from("project_updates").insert({
      user_id: userId, project_id: projectId, update_type: updateType,
      content: content.trim(), outcomes: outcomes || null, next_actions: nextActions || null,
    });

    if (error) { setError(error.message); return; }

    if (preselectedId) {
      router.push(`/app/projects/${preselectedId}`);
    } else {
      setStatus("Saved ✅");
      setContent(""); setOutcomes(""); setNextActions(""); setProjectId("");
    }
  }

  if (loading) return <div className="p-8 text-sm text-neutral-400">Loading...</div>;

  return (
    <div className="p-8 max-w-xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-neutral-900">Project Update</h2>
        <p className="text-sm text-neutral-400 mt-1">Log progress on a project</p>
      </div>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1">
          <label className="text-sm text-neutral-600">Project</label>
          <select
            className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-white"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">Select a project...</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-sm text-neutral-600">Update type</label>
          <select
            className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-white"
            value={updateType}
            onChange={(e) => setUpdateType(e.target.value as UpdateType)}
          >
            {UPDATE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-sm text-neutral-600">What happened? <span className="text-red-400">*</span></label>
          <textarea
            className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm min-h-[100px] resize-none"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Describe what you worked on..."
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-neutral-600">Outcomes <span className="text-neutral-300">(optional)</span></label>
          <input
            className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm"
            value={outcomes}
            onChange={(e) => setOutcomes(e.target.value)}
            placeholder="What was the result?"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-neutral-600">Next actions <span className="text-neutral-300">(optional)</span></label>
          <input
            className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm"
            value={nextActions}
            onChange={(e) => setNextActions(e.target.value)}
            placeholder="What's next?"
          />
        </div>
        <button
          type="submit"
          className="bg-neutral-900 text-white text-sm px-4 py-2 rounded-lg hover:bg-neutral-700 transition-colors"
        >
          Save Update
        </button>
        {status && <p className="text-sm text-green-600">{status}</p>}
        {error && <p className="text-sm text-red-500">{error}</p>}
      </form>
    </div>
  );
}

export default function ProjectUpdatePage() {
  return (
    <Suspense>
      <ProjectUpdateForm />
    </Suspense>
  );
}
