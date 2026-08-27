import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import {
  getDefaultModel,
  normalizeProvider,
  type AIProvider,
} from "@/lib/ai/config";

export type { AIProvider } from "@/lib/ai/config";

export type ProviderMessage = {
  role: "user" | "assistant";
  content: string | Array<{ type: string; text?: string; source?: { type: string; url?: string; data?: string; media_type?: string } }>;
};

export type ProviderCallInput = {
  provider: AIProvider;
  model: string;
  system: string;
  messages: ProviderMessage[];
  maxTokens?: number;
  apiKey?: string;
};

export type ProviderCallOutput = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  provider: AIProvider;
  model: string;
};

export function describeAIError(error: unknown) {
  const upstream = error as { status?: number; code?: string; type?: string; message?: string; error?: { type?: string; code?: string; message?: string } };
  const status = Number.isFinite(upstream?.status) ? Number(upstream.status) : null;
  const raw = upstream?.error?.message || upstream?.message || "Unknown provider error";
  const message = String(raw).replace(/\b(sk|key)-[A-Za-z0-9_-]{12,}\b/g, "[redacted]").slice(0, 800);
  const type = upstream?.error?.type || upstream?.error?.code || upstream?.type || upstream?.code || (status === 401 ? "authentication_error" : status === 429 ? "rate_limit_error" : status && status >= 500 ? "provider_error" : error instanceof TypeError ? "network_error" : "ai_error");
  return { type: String(type), message, status };
}

function getOpenAIClient(personalApiKey?: string) {
  const apiKey = personalApiKey?.trim() || process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OpenAI is not configured. Add OPENAI_API_KEY to the server environment.");
  return new OpenAI({
    apiKey,
    timeout: 90_000,
  });
}

function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new Error("Anthropic is not configured. Add ANTHROPIC_API_KEY to the server environment.");
  return new Anthropic({
    apiKey,
    timeout: 90_000,
  });
}

function getXAIClient() {
  const apiKey = process.env.XAI_API_KEY?.trim();
  if (!apiKey) throw new Error("xAI is not configured. Add XAI_API_KEY to the server environment.");
  return new OpenAI({
    apiKey,
    baseURL: "https://api.x.ai/v1",
    timeout: 90_000,
  });
}

export async function callAIProvider(input: ProviderCallInput): Promise<ProviderCallOutput> {
  const { provider, model, system, messages, maxTokens = 4096, apiKey } = input;

  if (provider === "anthropic") {
    const anthropic = getAnthropicClient();

    // Convert messages to Anthropic format (handles both string and structured content)
    const anthropicMessages = messages.map((msg) => {
      if (typeof msg.content === "string") {
        return { role: msg.role, content: msg.content };
      }
      // msg.content is an array of content blocks
      return { role: msg.role, content: msg.content as any };
    });

    const response = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      messages: anthropicMessages as any,
    });

    const text = response.content
      .filter((block: any) => block.type === "text")
      .map((block: any) => block.text)
      .join("\n")
      .trim();
    if (!text) throw new Error(`Anthropic returned an empty response from ${model}.`);

    return {
      text,
      inputTokens: response.usage?.input_tokens || 0,
      outputTokens: response.usage?.output_tokens || 0,
      provider,
      model,
    };
  }

  // Convert provider-neutral messages to OpenAI content blocks.
  const openaiMessages = messages.map((msg) => {
    const baseMsg: any = { role: msg.role };
    
    if (typeof msg.content === "string") {
      baseMsg.content = msg.content;
    } else {
      // Convert content array (Anthropic format) to OpenAI format
      const contentArray: any[] = [];
      for (const block of msg.content) {
        if (block.type === "text" && block.text) {
          contentArray.push({ type: "input_text", text: block.text });
        } else if (block.type === "image" && block.source?.url) {
          contentArray.push({
            type: "input_image",
            image_url: block.source.url,
          });
        } else if (block.type === "image" && block.source?.data) {
          contentArray.push({
            type: "input_image",
            image_url: `data:${block.source.media_type || "image/jpeg"};base64,${block.source.data}`,
          });
        }
      }
      baseMsg.content = contentArray.length > 0 ? contentArray : msg.content;
    }
    
    return baseMsg;
  });

  if (provider === "openai") {
    const response = await getOpenAIClient(apiKey).responses.create({
      model,
      instructions: system,
      input: openaiMessages as any,
      max_output_tokens: maxTokens,
      store: false,
      ...(model.startsWith("gpt-5") ? { reasoning: { effort: "medium" as const } } : {}),
    });
    const text = response.output_text?.trim() || "";
    if (!text) throw new Error(`OpenAI returned an empty response from ${model}.`);
    return {
      text,
      inputTokens: response.usage?.input_tokens || 0,
      outputTokens: response.usage?.output_tokens || 0,
      provider,
      model,
    };
  }

  const xaiMessages = openaiMessages.map((message) => ({
    ...message,
    content: Array.isArray(message.content)
      ? message.content.map((block: any) =>
          block.type === "input_image"
            ? { type: "image_url", image_url: { url: block.image_url } }
            : { type: "text", text: block.text }
        )
      : message.content,
  }));

  const response = await getXAIClient().chat.completions.create({
    model,
    messages: [{ role: "system", content: system }, ...xaiMessages] as any,
    max_tokens: maxTokens,
    temperature: 0.4,
  });
  const text = response.choices?.[0]?.message?.content?.trim() || "";
  if (!text) throw new Error(`xAI returned an empty response from ${model}.`);
  return {
    text,
    inputTokens: response.usage?.prompt_tokens || 0,
    outputTokens: response.usage?.completion_tokens || 0,
    provider,
    model,
  };
}

export function getDefaultModelForProvider(provider: AIProvider, messageType: "chat" | "analysis" | "decision") {
  return getDefaultModel(provider, messageType);
}

export { normalizeProvider };
