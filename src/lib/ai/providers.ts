import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

export type AIProvider = "anthropic" | "openai" | "xai";

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

    return {
      text,
      inputTokens: response.usage?.input_tokens || 0,
      outputTokens: response.usage?.output_tokens || 0,
      provider,
      model,
    };
  }

  const client = provider === "xai" ? getXAIClient() : getOpenAIClient();

  // Convert Anthropic-style messages to OpenAI format
  const openaiMessages = messages.map((msg) => {
    const baseMsg: any = { role: msg.role };
    
    if (typeof msg.content === "string") {
      baseMsg.content = msg.content;
    } else {
      // Convert content array (Anthropic format) to OpenAI format
      const contentArray: any[] = [];
      for (const block of msg.content) {
        if (block.type === "text" && block.text) {
          contentArray.push({ type: "text", text: block.text });
        } else if (block.type === "image" && block.source?.url) {
          contentArray.push({
            type: "image_url",
            image_url: { url: block.source.url },
          });
        } else if (block.type === "image" && block.source?.data) {
          contentArray.push({
            type: "image_url",
            image_url: {
              url: `data:${block.source.media_type || "image/jpeg"};base64,${block.source.data}`,
            },
          });
        }
      }
      baseMsg.content = contentArray.length > 0 ? contentArray : msg.content;
    }
    
    return baseMsg;
  });

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: system },
      ...openaiMessages,
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
