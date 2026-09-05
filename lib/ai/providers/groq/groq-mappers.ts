import type {
  AIChatRequest,
  AIChatResponse,
  AIFinishReason,
  AITextMessage,
  AIUsage,
} from "@/lib/ai/types";
import {
  GROQ_API_BASE_URL,
  GROQ_DEFAULT_MODEL,
  GROQ_PROVIDER_ID,
  type GroqChatMessage,
  type GroqChatRequest,
  type GroqChatResponse,
  type GroqUsage,
} from "./groq-types";

export function resolveGroqModel(request: AIChatRequest, configuredModel: string): string {
  return request.model ?? configuredModel ?? GROQ_DEFAULT_MODEL;
}

export function mapFinishReason(
  reason: string | null | undefined,
): AIFinishReason {
  switch (reason) {
    case "stop":
      return "stop";
    case "length":
      return "max_output_tokens";
    case "tool_calls":
      return "stop";
    case "content_filter":
      return "content_rejected";
    case "function_call":
      return "stop";
    case "cancelled":
      return "cancelled";
    case null:
    case undefined:
      return "stop";
    default:
      return "unknown";
  }
}

export function mapUsage(usage: GroqUsage | undefined): AIUsage | undefined {
  if (!usage) return undefined;
  return {
    inputUnits: usage.prompt_tokens,
    outputUnits: usage.completion_tokens,
    totalUnits: usage.total_tokens,
  };
}

export function mapGroqMessages(messages: AITextMessage[]): GroqChatMessage[] {
  return messages.map((message) => {
    const content =
      message.text ??
      message.content
        ?.map((part) => (part.type === "text" ? part.text : ""))
        .join("") ??
      "";

    return {
      role: message.role,
      content,
    } satisfies GroqChatMessage;
  });
}

export function buildGroqChatRequest(
  request: AIChatRequest,
  configuredModel: string,
): GroqChatRequest {
  const body: GroqChatRequest = {
    model: resolveGroqModel(request, configuredModel),
    messages: mapGroqMessages(request.messages),
    stream: false,
  };

  if (typeof request.temperature === "number" && Number.isFinite(request.temperature)) {
    body.temperature = request.temperature;
  }

  if (
    typeof request.maxOutputTokens === "number" &&
    Number.isInteger(request.maxOutputTokens) &&
    request.maxOutputTokens > 0
  ) {
    body.max_tokens = request.maxOutputTokens;
  }

  return body;
}

export function mapGroqChatResponse(
  response: GroqChatResponse,
  configuredModel: string,
): AIChatResponse {
  const choice = response.choices?.[0];

  if (!choice) {
    throw new Error("Groq response missing choices");
  }

  const text = choice.message?.content ?? choice.delta?.content ?? "";

  return {
    text,
    provider: GROQ_PROVIDER_ID,
    model: response.model ?? configuredModel,
    usage: mapUsage(response.usage),
    finishReason: mapFinishReason(choice.finish_reason),
  };
}

export function getGroqApiBaseUrl(): string {
  return GROQ_API_BASE_URL;
}
