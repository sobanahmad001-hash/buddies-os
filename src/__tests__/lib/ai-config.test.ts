import { getAIConfigurationStatus, resolveAISelection } from "@/lib/ai/config";

const AI_ENV_KEYS = [
  "AI_PROVIDER",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "XAI_API_KEY",
  "OPENAI_MODEL_FAST",
  "OPENAI_MODEL_DEFAULT",
  "OPENAI_MODEL_CODING",
] as const;

describe("AI provider configuration", () => {
  const originalEnvironment = Object.fromEntries(
    AI_ENV_KEYS.map((key) => [key, process.env[key]])
  );

  beforeEach(() => {
    for (const key of AI_ENV_KEYS) delete process.env[key];
  });

  afterAll(() => {
    for (const key of AI_ENV_KEYS) {
      const value = originalEnvironment[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  test("uses the coding model when OpenAI is configured", () => {
    process.env.OPENAI_API_KEY = "test-key";

    expect(resolveAISelection({ workload: "coding" })).toEqual({
      provider: "openai",
      model: "gpt-5.6-sol",
    });
  });

  test("falls back to a provider that actually has credentials", () => {
    process.env.ANTHROPIC_API_KEY = "test-key";

    expect(resolveAISelection({ provider: "openai", workload: "chat" })).toEqual({
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
    });
  });

  test("uses the current Anthropic analysis model", () => {
    process.env.ANTHROPIC_API_KEY = "test-key";

    expect(resolveAISelection({ provider: "anthropic", workload: "decision" })).toEqual({
      provider: "anthropic",
      model: "claude-sonnet-5",
    });
  });

  test("does not send a model to the wrong provider", () => {
    process.env.XAI_API_KEY = "test-key";

    expect(
      resolveAISelection({ provider: "xai", model: "gpt-5.6-sol", workload: "coding" })
    ).toEqual({ provider: "xai", model: "grok-3" });
  });

  test("reports a clear error when no AI credentials exist", () => {
    expect(() => resolveAISelection({ workload: "chat" })).toThrow(
      "No AI provider is configured"
    );
  });

  test("health status never contains credential values", () => {
    process.env.OPENAI_API_KEY = "a-secret-value";

    const serialized = JSON.stringify(getAIConfigurationStatus());
    expect(serialized).not.toContain("a-secret-value");
    expect(JSON.parse(serialized).providers.openai).toBe(true);
  });
});
