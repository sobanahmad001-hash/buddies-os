'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Plus, ShieldCheck, ToggleLeft, ToggleRight, AlertTriangle } from 'lucide-react';

type Rule = {
  id: string;
  rule_text: string;
  severity: number;
  active: boolean;
  created_at: string;
};

const SEVERITY_LABEL: Record<number, string> = { 1: 'Low', 2: 'Medium', 3: 'High' };
const SEVERITY_COLOR: Record<number, string> = {
  1: 'bg-[#DBEAFE] text-[#2C5F8A]',
  2: 'bg-[#FEF9C3] text-[#92400E]',
  3: 'bg-[#FEE2E2] text-[#EF4444]',
};

export default function ProjectRulesPage() {
  const { id: projectId } = useParams<{ id: string }>();

  const [rules,    setRules]    = useState<Rule[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ rule_text: '', severity: 2 });
  const [saving,   setSaving]   = useState(false);

  useEffect(() => { load(); }, [projectId]);

  async function load() {
    const res = await fetch(`/api/projects/rules?projectId=${projectId}`);
    if (res.ok) { const d = await res.json(); setRules(d.rules ?? []); }
    setLoading(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.rule_text.trim()) return;
    setSaving(true);
    await fetch('/api/projects/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, ...form }),
    });
    setForm({ rule_text: '', severity: 2 });
    setShowForm(false);
    setSaving(false);
    load();
  }

  async function toggleActive(ruleId: string, current: boolean) {
    await fetch('/api/projects/rules', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: ruleId, active: !current }),
    });
    load();
  }

  const active   = rules.filter(r => r.active);
  const inactive = rules.filter(r => !r.active);

  return (
    <div className="p-6 max-w-[860px]">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-[16px] font-semibold text-[#1A1A1A]">
          Rules
          <span className="text-[13px] font-normal text-[#737373] ml-2">{active.length} active</span>
        </h2>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1A1A1A] text-white text-[12px] font-semibold rounded-lg hover:bg-[#333] transition-colors"
        >
          <Plus size={13} /> Add Rule
        </button>
      </div>

      {/* High severity warning */}
      {active.filter(r => r.severity === 3).length > 0 && (
        <div className="flex items-start gap-2.5 bg-[#FEF2F2] border border-[#FCA5A5] rounded-xl px-4 py-3 mb-5">
          <AlertTriangle size={15} className="text-[#EF4444] shrink-0 mt-0.5" />
          <p className="text-[13px] text-[#7F1D1D]">
            {active.filter(r => r.severity === 3).length} high-severity rule(s) active — the project assistant will enforce these strictly.
          </p>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <form onSubmit={submit} className="bg-white border border-[#E5E2DE] rounded-xl p-5 mb-6 space-y-3">
          <textarea
            value={form.rule_text}
            onChange={e => setForm(f => ({ ...f, rule_text: e.target.value }))}
            placeholder="Define a rule the assistant should follow for this project…"
            required
            rows={3}
            className="w-full text-[14px] px-3 py-2 border border-[#E5E2DE] rounded-lg focus:outline-none focus:border-[#B5622A] resize-none"
          />
          <div className="flex items-center gap-3">
            <span className="text-[13px] text-[#737373]">Severity:</span>
            {[1, 2, 3].map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setForm(f => ({ ...f, severity: s }))}
                className={`px-3 py-1 rounded-full text-[12px] font-semibold transition-colors ${
                  form.severity === s ? SEVERITY_COLOR[s] : 'bg-[#F7F5F2] text-[#737373]'
                }`}
              >
                {SEVERITY_LABEL[s]}
              </button>
            ))}
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowForm(false)}
              className="px-3 py-1.5 text-[13px] text-[#737373] hover:text-[#1A1A1A]">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="px-4 py-1.5 bg-[#B5622A] text-white text-[13px] font-semibold rounded-lg hover:bg-[#9A4E20] disabled:opacity-40 transition-colors">
              {saving ? 'Saving…' : 'Save Rule'}
            </button>
          </div>
        </form>
      )}

      {loading && <p className="text-[13px] text-[#737373]">Loading…</p>}

      {!loading && rules.length === 0 && (
        <div className="border-2 border-dashed border-[#E5E2DE] rounded-xl py-12 text-center">
          <ShieldCheck size={24} className="text-[#D1CCCC] mx-auto mb-3" />
          <p className="text-[14px] text-[#737373]">No rules defined yet.</p>
          <p className="text-[12px] text-[#9E9E9E] mt-1">Rules guide the project assistant's behaviour and decisions.</p>
        </div>
      )}

      {/* Active rules */}
      {active.length > 0 && (
        <div className="space-y-2 mb-5">
          {active.map(rule => (
            <RuleRow key={rule.id} rule={rule} onToggle={toggleActive} />
          ))}
        </div>
      )}

      {/* Inactive rules */}
      {inactive.length > 0 && (
        <>
          <p className="text-[11px] font-semibold text-[#737373] uppercase tracking-wide mb-2">Inactive</p>
          <div className="space-y-2 opacity-50">
            {inactive.map(rule => (
              <RuleRow key={rule.id} rule={rule} onToggle={toggleActive} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function RuleRow({ rule, onToggle }: { rule: Rule; onToggle: (id: string, active: boolean) => void }) {
  return (
    <div className={`flex items-start gap-3 p-3.5 rounded-xl border ${rule.severity === 3 ? 'border-[#FCA5A5] bg-[#FEF2F2]' : 'border-[#E5E2DE] bg-white'}`}>
      <span className={`mt-0.5 text-[11px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${SEVERITY_COLOR[rule.severity]}`}>
        {SEVERITY_LABEL[rule.severity]}
      </span>
      <p className="text-[14px] text-[#1A1A1A] flex-1 leading-relaxed">{rule.rule_text}</p>
      <button
        onClick={() => onToggle(rule.id, rule.active)}
        className="shrink-0 text-[#737373] hover:text-[#B5622A] transition-colors"
        title={rule.active ? 'Deactivate' : 'Activate'}
      >
        {rule.active ? <ToggleRight size={20} className="text-[#B5622A]" /> : <ToggleLeft size={20} />}
      </button>
    </div>
  );
}
