// Existing Buddies configured rate estimates. Unknown models retain the shared zero fallback.
const MODEL_COSTS = {
  'claude-haiku-4-5-20251001': { input: 1, output: 5 },
  'claude-sonnet-4-5': { input: 3, output: 15 },
  'claude-opus-4-1': { input: 15, output: 75 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-5.6-luna': { input: 0.2, output: 1.2 },
  'gpt-5.6-terra': { input: 2, output: 12 },
  'gpt-5.6-sol': { input: 4, output: 20 },
  'grok-3-mini': { input: 0, output: 0 },
  'grok-3': { input: 0, output: 0 },
} as const;

export function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const costs =
    MODEL_COSTS[model as keyof typeof MODEL_COSTS] || { input: 0, output: 0 };

  return (inputTokens * costs.input + outputTokens * costs.output) / 1_000_000;
}
