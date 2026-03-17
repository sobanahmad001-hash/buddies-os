'use client';

import { useState, useEffect } from 'react';

export default function ModelSelector({
  onModelChange,
}: {
  onModelChange?: (model: string) => void;
}) {
  const [model, setModel] = useState('claude-sonnet-4-5');
  const [autoSelect, setAutoSelect] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/ai/usage');
      const data = await res.json();
      setModel(data.config?.default_model || 'claude-sonnet-4-5');
      setAutoSelect(
        typeof data.config?.auto_select === 'boolean' ? data.config.auto_select : true
      );
    } catch (error) {
      console.error('Failed to fetch config:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateConfig = async (updates: Record<string, unknown>) => {
    try {
      await fetch('/api/ai/usage', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
    } catch (error) {
      console.error('Failed to update config:', error);
    }
  };

  const handleModelChange = (newModel: string) => {
    setModel(newModel);
    updateConfig({ default_model: newModel });
    onModelChange?.(newModel);
  };

  const handleAutoSelectChange = (checked: boolean) => {
    setAutoSelect(checked);
    updateConfig({ auto_select: checked });
  };

  if (loading) return null;

  const models = [
    { value: 'claude-haiku-4-5-20251001', label: 'Haiku', desc: 'Fast & Cheap', cost: '$1/M in' },
    { value: 'claude-sonnet-4-5', label: 'Sonnet', desc: 'Balanced', cost: '$3/M in' },
    { value: 'claude-opus-4-1', label: 'Opus', desc: 'Powerful', cost: '$15/M in' },
  ];

  return (
    <div className="space-y-3">
      <label
        htmlFor="auto-select"
        className="flex items-center justify-between text-sm"
      >
        <span>Auto-select model</span>
        <input
          id="auto-select"
          name="auto-select"
          type="checkbox"
          checked={autoSelect}
          onChange={(e) => handleAutoSelectChange(e.target.checked)}
        />
      </label>

      <select
        name="model-selector"
        id="model-selector"
        value={model}
        onChange={(e) => handleModelChange(e.target.value)}
        disabled={autoSelect}
        className="w-full rounded-md border border-zinc-700 bg-transparent px-3 py-2 text-sm"
      >
        {models.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label} — {m.desc} — {m.cost}
          </option>
        ))}
      </select>

      {autoSelect && (
        <p className="text-xs text-zinc-500">
          Haiku for quick chat, Sonnet for analysis
        </p>
      )}
    </div>
  );
}
