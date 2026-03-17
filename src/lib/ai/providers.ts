import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

export type AIProvider = "anthropic" | "openai" | "xai";

export type ProviderMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ProviderCallInput = {
  provider: AIProvider;
  model: string;
  system: string;
  messages: ProviderMessage[];
  maxTokens?: number;
};

export type ProviderCallOutput = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  provider: AIProvider;
  model: string;
};

function getOpenAIClient() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

function getAnthropicClient() {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
}

function getXAIClient() {
  return new OpenAI({
    apiKey: process.env.XAI_API_KEY,
    baseURL: "https://api.x.ai/v1",
  });
}

export async function callAIProvider(input: ProviderCallInput): Promise<ProviderCallOutput> {
  const { provider, model, system, messages, maxTokens = 4096 } = input;

  if (provider === "anthropic") {
    const anthropic = getAnthropicClient();

    const response = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      messages,
    });

    const text = response.content
      .filter((block: any) => block.type === "text")
      .map((block: any) => block.text)
      .join("\n")
      .trim();

    return {
      text,
      inputTokens: response.usage?.input_tokens || 0,
      outputTokens: response.usage?.output_tokens || 0,
      provider,
      model,
    };
  }

  const client = provider === "xai" ? getXAIClient() : getOpenAIClient();

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: system },
      ...messages,
    ],
    max_tokens: maxTokens,
    temperature: 0.4,
  });

  const text = response.choices?.[0]?.message?.content?.trim() || "";

  return {
    text,
    inputTokens: response.usage?.prompt_tokens || 0,
    outputTokens: response.usage?.completion_tokens || 0,
    provider,
    model,
  };
}

export function getDefaultModelForProvider(provider: AIProvider, messageType: "chat" | "analysis" | "decision") {
  if (provider === "anthropic") {
    if (messageType === "chat") return "claude-haiku-4-5-20251001";
    return "claude-sonnet-4-5";
  }

  if (provider === "openai") {
    if (messageType === "chat") return "gpt-4o-mini";
    return "gpt-4o";
  }

  if (messageType === "chat") return "grok-3-mini";
  return "grok-3";
}

export function normalizeProvider(raw: unknown): AIProvider {
  if (raw === "openai") return "openai";
  if (raw === "xai") return "xai";
  return "anthropic";
}
