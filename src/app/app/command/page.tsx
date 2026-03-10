"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { detectIntent } from "@/lib/command-parser/detectIntent";
import { parseCommand, ParsedCommand } from "@/lib/command-parser/parsers";

type Project = { id: string; name: string };

type Message =
  | { type: "user"; text: string }
  | { type: "preview"; parsed: ParsedCommand; raw: string }
  | { type: "success"; text: string }
  | { type: "error"; text: string }
  | { type: "followup"; question: string; parsed: ParsedCommand; raw: string };

export default function CommandPage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        supabase.from("projects").select("id, name")
          .eq("user_id", data.user.id).eq("status", "active")
          .then(({ data: p }) => setProjects(p ?? []));
      }
    });
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function findProjectId(name: string | null): string | null {
    if (!name) return null;
    const match = projects.find((p) =>
      p.name.toLowerCase().includes(name.toLowerCase())
    );
    return match?.id ?? null;
  }

  function addMessage(msg: Message) {
    setMessages((prev) => [...prev, msg]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const raw = input.trim();
    setInput("");
    addMessage({ type: "user", text: raw });

    const intent = detectIntent(raw);
    const parsed = parseCommand(raw, intent);

    if (parsed.intent === "unknown") {
      addMessage({ type: "error", text: "Couldn't detect what to log. Try: 'update ProjectName: what you did' or 'rule ProjectName: your rule'" });
      return;
    }

    // If project_update but no project found — ask follow-up
    if (parsed.intent === "project_update" && !findProjectId(parsed.project)) {
      addMessage({ type: "followup", question: "Which project is this update for?", parsed, raw });
      return;
    }

    addMessage({ type: "preview", parsed, raw });
  }

  async function confirmCommand(parsed: ParsedCommand, raw: string, overrideProjectId?: string) {
    setLoading(true);
    const projectId = overrideProjectId ??
      (("project" in parsed && parsed.project) ? findProjectId(parsed.project) : null) ??
      ("project_id" in parsed ? (parsed as any).project_id : null);

    const res = await fetch("/api/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parsed, raw_input: raw, projectId }),
    });

    const data = await res.json();
    if (data.error) {
      addMessage({ type: "error", text: data.error });
    } else {
      addMessage({ type: "success", text: "Saved." });
      // Refresh projects list
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        const { data: p } = await supabase.from("projects").select("id, name")
          .eq("user_id", userData.user.id).eq("status", "active");
        setProjects(p ?? []);
      }
    }
    setLoading(false);
  }

  function cancelCommand() {
    addMessage({ type: "error", text: "Cancelled." });
  }

  function renderParsed(parsed: ParsedCommand) {
    const rows: [string, string | number | null][] = [];

    if (parsed.intent === "create_project") {
      rows.push(["Intent", "Create Project"], ["Name", parsed.name]);
    } else if (parsed.intent === "project_update") {
      rows.push(
        ["Intent", "Project Update"],
        ["Project", parsed.project ?? "—"],
        ["Type", parsed.update_type],
        ["Content", parsed.content],
        ["Next", parsed.next_actions ?? "—"],
      );
    } else if (parsed.intent === "decision") {
      rows.push(
        ["Intent", "Decision"],
        ["Project", parsed.project ?? "—"],
        ["Context", parsed.context],
        ["Probability", parsed.probability != null ? `${parsed.probability}%` : "—"],
        ["Verdict", parsed.verdict ?? "—"],
      );
    } else if (parsed.intent === "rule") {
      rows.push(
        ["Intent", "Rule"],
        ["Project", parsed.project ?? "—"],
        ["Rule", parsed.rule_text],
      );
    } else if (parsed.intent === "daily_check") {
      rows.push(["Intent", "Daily Check"], ["Notes", parsed.notes]);
    }

    return rows;
  }

  return (
    <div className="flex flex-col h-screen max-h-screen">

      {/* Header */}
      <div className="px-8 py-5 border-b border-neutral-200 bg-white shrink-0">
        <h2 className="text-xl font-semibold text-neutral-900">Command</h2>
        <p className="text-sm text-neutral-400 mt-0.5">Type anything. The OS figures out what to log.</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-4">

        {messages.length === 0 && (
          <div className="space-y-3 max-w-lg">
            <p className="text-sm text-neutral-400 font-medium">Try typing:</p>
            {[
              "update Buddies OS: finished command interface — next: build dashboard",
              "rule Trading: never trade without VSA confirmation",
              "decision Trading: enter BTC if volume confirms — probability 65 — verdict wait",
              "create project: Raahbaan",
            ].map((ex) => (
              <button
                key={ex}
                onClick={() => setInput(ex)}
                className="block w-full text-left text-sm text-neutral-500 bg-neutral-50 border border-neutral-200 rounded-lg px-4 py-2.5 hover:bg-neutral-100 transition-colors"
              >
                {ex}
              </button>
            ))}
          </div>
        )}

        {messages.map((msg, i) => {
          if (msg.type === "user") {
            return (
              <div key={i} className="flex justify-end">
                <div className="bg-neutral-900 text-white text-sm px-4 py-2.5 rounded-xl max-w-lg">
                  {msg.text}
                </div>
              </div>
            );
          }

          if (msg.type === "preview") {
            const rows = renderParsed(msg.parsed);
            return (
              <div key={i} className="max-w-lg border border-neutral-200 rounded-xl bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-neutral-100 bg-neutral-50">
                  <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Detected — confirm to save</p>
                </div>
                <div className="px-4 py-3 space-y-2">
                  {rows.map(([label, val]) => (
                    <div key={label} className="flex gap-3">
                      <span className="text-xs text-neutral-400 w-20 shrink-0 pt-0.5">{label}</span>
                      <span className="text-sm text-neutral-800">{val ?? "—"}</span>
                    </div>
                  ))}
                </div>
                <div className="px-4 py-3 border-t border-neutral-100 flex gap-2">
                  <button
                    onClick={() => confirmCommand(msg.parsed, msg.raw)}
                    disabled={loading}
                    className="bg-neutral-900 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-neutral-700 transition-colors disabled:opacity-50"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={cancelCommand}
                    className="text-sm text-neutral-400 px-3 py-1.5 rounded-lg hover:bg-neutral-100 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            );
          }

          if (msg.type === "followup") {
            return (
              <div key={i} className="max-w-lg border border-neutral-200 rounded-xl bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-neutral-100 bg-neutral-50">
                  <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">One question</p>
                </div>
                <div className="px-4 py-3 space-y-3">
                  <p className="text-sm text-neutral-700">{msg.question}</p>
                  <select
                    className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-white"
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) {
                        confirmCommand(msg.parsed, msg.raw, e.target.value);
                      }
                    }}
                  >
                    <option value="">Select a project...</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            );
          }

          if (msg.type === "success") {
            return (
              <div key={i} className="max-w-lg">
                <p className="text-sm text-green-600 font-medium">✓ {msg.text}</p>
              </div>
            );
          }

          if (msg.type === "error") {
            return (
              <div key={i} className="max-w-lg">
                <p className="text-sm text-red-500">{msg.text}</p>
              </div>
            );
          }
        })}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-8 py-5 border-t border-neutral-200 bg-white shrink-0">
        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            className="flex-1 border border-neutral-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-neutral-400 transition-colors"
            placeholder="Type a command or update..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            autoFocus
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="bg-neutral-900 text-white text-sm px-5 py-3 rounded-xl hover:bg-neutral-700 transition-colors disabled:opacity-40"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
