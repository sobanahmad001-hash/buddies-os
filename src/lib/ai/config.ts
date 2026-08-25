export type AIProvider = "anthropic" | "openai" | "xai";
export type AIWorkload = "chat" | "analysis" | "decision" | "coding";

const PROVIDER_KEYS: Record<AIProvider, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  xai: "XAI_API_KEY",
};

function configuredValue(name: string) {
  const value = process.env[name]?.trim();
  return value || undefined;
}

export function isProviderConfigured(provider: AIProvider) {
  return Boolean(configuredValue(PROVIDER_KEYS[provider]));
}

export function normalizeProvider(raw: unknown): AIProvider {
  if (raw === "anthropic" || raw === "xai" || raw === "openai") return raw;
  const configuredDefault = configuredValue("AI_PROVIDER");
  if (configuredDefault === "anthropic" || configuredDefault === "xai") return configuredDefault;
  return "openai";
}

export function resolveProvider(requested?: unknown): AIProvider {
  const preferred = normalizeProvider(requested);
  if (isProviderConfigured(preferred)) return preferred;

  const fallback = (["openai", "anthropic", "xai"] as AIProvider[]).find(isProviderConfigured);
  if (fallback) return fallback;

  throw new Error(
    "No AI provider is configured. Add OPENAI_API_KEY, ANTHROPIC_API_KEY, or XAI_API_KEY to the server environment."
  );
}

export function getDefaultModel(provider: AIProvider, workload: AIWorkload): string {
  if (provider === "openai") {
    if (workload === "coding") return configuredValue("OPENAI_MODEL_CODING") ?? "gpt-5.6-sol";
    if (workload === "chat") return configuredValue("OPENAI_MODEL_FAST") ?? "gpt-5.6-luna";
    return configuredValue("OPENAI_MODEL_DEFAULT") ?? "gpt-5.6-terra";
  }

  if (provider === "anthropic") {
    return workload === "chat" ? "claude-haiku-4-5-20251001" : "claude-sonnet-4-5";
  }

  return workload === "chat" ? "grok-3-mini" : "grok-3";
}

export function resolveAISelection(input: {
  provider?: unknown;
  model?: unknown;
  workload: AIWorkload;
}) {
  const provider = resolveProvider(input.provider);
  const requestedModel = typeof input.model === "string" ? input.model.trim() : "";
  const modelMatchesProvider =
    !requestedModel ||
    (provider === "openai" && requestedModel.startsWith("gpt-")) ||
    (provider === "anthropic" && requestedModel.startsWith("claude-")) ||
    (provider === "xai" && requestedModel.startsWith("grok-"));

  return {
    provider,
    model: modelMatchesProvider && requestedModel ? requestedModel : getDefaultModel(provider, input.workload),
  };
}

export function getAIConfigurationStatus() {
  return {
    providers: {
      openai: isProviderConfigured("openai"),
      anthropic: isProviderConfigured("anthropic"),
      xai: isProviderConfigured("xai"),
    },
    defaults: {
      chat: getDefaultModel("openai", "chat"),
      default: getDefaultModel("openai", "analysis"),
      coding: getDefaultModel("openai", "coding"),
    },
  };
}
