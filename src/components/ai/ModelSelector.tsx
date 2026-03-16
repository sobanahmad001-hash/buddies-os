'use client';

import { useState, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

export default function ModelSelector({ onModelChange }: { onModelChange?: (model: string) => void }) {
  const [model, setModel] = useState('claude-3-5-sonnet-20241022');
  const [autoSelect, setAutoSelect] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/ai/usage');
      const data = await res.json();
      setModel(data.config.default_model);
      setAutoSelect(data.config.auto_select);
    } catch (error) {
      console.error('Failed to fetch config:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateConfig = async (updates: any) => {
    try {
      await fetch('/api/ai/usage', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
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
    { value: 'claude-3-5-haiku-20241022', label: 'Haiku', desc: 'Fast & Cheap', cost: '$0.25/M' },
    { value: 'claude-3-5-sonnet-20241022', label: 'Sonnet', desc: 'Balanced', cost: '$3/M' },
    { value: 'claude-3-opus-20240229', label: 'Opus', desc: 'Powerful', cost: '$15/M' }
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label htmlFor="auto-select" className="text-sm">Auto-select model</Label>
        <Switch
          id="auto-select"
          checked={autoSelect}
          onCheckedChange={handleAutoSelectChange}
        />
      </div>

      <Select value={model} onValueChange={handleModelChange} disabled={autoSelect}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {models.map(m => (
            <SelectItem key={m.value} value={m.value}>
              <div className="flex items-center justify-between w-full">
                <div>
                  <div className="font-medium">{m.label}</div>
                  <div className="text-xs text-zinc-500">{m.desc}</div>
                </div>
                <span className="text-xs text-zinc-400 ml-4">{m.cost}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {autoSelect && (
        <p className="text-xs text-zinc-500">
          💡 Haiku for quick chat, Sonnet for analysis
        </p>
      )}
    </div>
  );
}
