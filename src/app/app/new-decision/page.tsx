"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const VERDICTS = ["enter", "wait", "do_not_enter"] as const;
type Verdict = (typeof VERDICTS)[number];

const DOMAINS = ["general", "business", "trading", "seo", "writing"] as const;
type Domain = (typeof DOMAINS)[number];

export default function NewDecisionPage() {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const [projectId, setProjectId] = useState("");

  const [domain, setDomain] = useState<Domain>("general");
  const [context, setContext] = useState("");
  const [optionsText, setOptionsText] = useState(""); // one per line

  const [probability, setProbability] = useState(50);
  const [baseCase, setBaseCase] = useState("");
  const [upsideCase, setUpsideCase] = useState("");
  const [downsideCase, setDownsideCase] = useState("");
  const [riskFlags, setRiskFlags] = useState("");

  const [verdict, setVerdict] = useState<Verdict>("wait");

  const [expectedOutcome, setExpectedOutcome] = useState("");
  const [reviewDate, setReviewDate] = useState(""); // yyyy-mm-dd

  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function run() {
      const { data, error } = await supabase.auth.getUser();
      if (error) setError(error.message);
      setUserId(data.user?.id ?? null);
      setLoading(false);
    }
    run();
  }, []);

  function parseOptions(): string[] | null {
    const lines = optionsText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    return lines.length ? lines : null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus(null);

    if (!userId) {
      setError("Not logged in. Go to /login.");
      return;
    }
    if (!context.trim()) {
      setError("context is required.");
      return;
    }
    if (probability < 0 || probability > 100) {
      setError("probability must be 0–100.");
      return;
    }

    const payload = {
      user_id: userId,
      project_id: projectId || null,
      domain,
      context: context.trim(),
      options: parseOptions(),
      probability,
      base_case: baseCase || null,
      upside_case: upsideCase || null,
      downside_case: downsideCase || null,
      risk_flags: riskFlags || null,
      verdict,
      expected_outcome: expectedOutcome || null,
      review_date: reviewDate || null,
    };

    const { error } = await supabase.from("decisions").insert(payload);

    if (error) {
      setError(error.message);
      return;
    }

    setStatus("Saved ✅");
    setContext("");
    setOptionsText("");
    setBaseCase("");
    setUpsideCase("");
    setDownsideCase("");
    setRiskFlags("");
    setExpectedOutcome("");
    setReviewDate("");
    setProbability(50);
    setVerdict("wait");
    setDomain("general");
  }

  if (loading) return <main className="p-6">Loading...</main>;

  return (
    <main className="min-h-screen p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">New Decision</h1>
          <p className="text-sm opacity-70">Logs into decisions</p>
        </div>
        <Link className="border rounded px-3 py-2 text-sm" href="/app">
          Back
        </Link>
      </header>

      <form onSubmit={onSubmit} className="space-y-4 max-w-2xl">
        <div className="space-y-1">
          <label className="text-sm">project_id (optional)</label>
          <input
            className="w-full border rounded px-3 py-2"
            placeholder="Paste General project UUID or leave blank"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-sm">domain</label>
            <select
              className="w-full border rounded px-3 py-2"
              value={domain}
              onChange={(e) => setDomain(e.target.value as Domain)}
            >
              {DOMAINS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm">verdict</label>
            <select
              className="w-full border rounded px-3 py-2"
              value={verdict}
              onChange={(e) => setVerdict(e.target.value as Verdict)}
            >
              {VERDICTS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-sm">context (required)</label>
          <textarea
            className="w-full border rounded px-3 py-2 min-h-[110px]"
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="1–5 lines"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm">options (optional, one per line)</label>
          <textarea
            className="w-full border rounded px-3 py-2 min-h-[90px]"
            value={optionsText}
            onChange={(e) => setOptionsText(e.target.value)}
            placeholder={"Option A\nOption B\nOption C"}
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm">probability (0–100)</label>
          <input
            className="w-full border rounded px-3 py-2"
            type="number"
            min={0}
            max={100}
            value={probability}
            onChange={(e) => setProbability(Number(e.target.value))}
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm">base_case</label>
          <textarea
            className="w-full border rounded px-3 py-2 min-h-[80px]"
            value={baseCase}
            onChange={(e) => setBaseCase(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm">upside_case</label>
          <textarea
            className="w-full border rounded px-3 py-2 min-h-[80px]"
            value={upsideCase}
            onChange={(e) => setUpsideCase(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm">downside_case</label>
          <textarea
            className="w-full border rounded px-3 py-2 min-h-[80px]"
            value={downsideCase}
            onChange={(e) => setDownsideCase(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm">risk_flags</label>
          <input
            className="w-full border rounded px-3 py-2"
            value={riskFlags}
            onChange={(e) => setRiskFlags(e.target.value)}
            placeholder="news risk; low liquidity; fatigue; etc."
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-sm">expected_outcome (optional)</label>
            <input
              className="w-full border rounded px-3 py-2"
              value={expectedOutcome}
              onChange={(e) => setExpectedOutcome(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm">review_date (optional)</label>
            <input
              className="w-full border rounded px-3 py-2"
              type="date"
              value={reviewDate}
              onChange={(e) => setReviewDate(e.target.value)}
            />
          </div>
        </div>

        <button className="border rounded px-4 py-2 text-sm" type="submit">
          Save Decision
        </button>

        {status && <p className="text-sm">{status}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </main>
  );
}
