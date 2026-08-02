import type {
  AIChatRequest,
  AIChatResponse,
  AIFinishReason,
  AIModelInfo,
  AIProviderCapabilities,
  AIProviderCapability,
  AIStreamEvent,
  AIUsage,
} from "@/lib/ai/types";
import { logAIProviderErrorThrown } from "@/lib/ai/ai-provider-error-logging";
import { AIProviderError } from "@/lib/ai/types";

export const OPENAI_PROVIDER_ID = "openai";

export const OPENAI_TEXT_CAPABILITIES: AIProviderCapabilities = {
  supported: ["text-generation", "text-streaming"],
};

export interface OpenAIResponsesCreateParams {
  model: string;
  input: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  instructions?: string;
  temperature?: number;
  max_output_tokens?: number;
  stream: boolean;
  store: false;
}

export interface OpenAIResponseLike {
  model?: string;
  output_text?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
  finish_reason?: string | null;
  incomplete_details?: {
    reason?: string | null;
  } | null;
  status?: string | null;
}

export interface OpenAIStreamEventLike {
  type: string;
  delta?: string;
  usage?: OpenAIResponseLike["usage"];
  response?: OpenAIResponseLike;
  error?: unknown;
}

export function mapFinishReason(reason: string | null | undefined): AIFinishReason {
  switch (reason) {
    case "stop":
      return "stop";
    case "length":
    case "max_output_tokens":
      return "max_output_tokens";
    case "content_filter":
    case "content_rejected":
      return "content_rejected";
    case "tool_calls":
      return "error";
    case "cancelled":
    case "canceled":
      return "cancelled";
    case undefined:
    case null:
      return "unknown";
    default:
      return "unknown";
  }
}

export function mapUsage(usage: OpenAIResponseLike["usage"]): AIUsage | undefined {
  if (!usage) return undefined;
  const mapped: AIUsage = {};
  if (typeof usage.input_tokens === "number") {
    mapped.inputUnits = usage.input_tokens;
  }
  if (typeof usage.output_tokens === "number") {
    mapped.outputUnits = usage.output_tokens;
  }
  if (typeof usage.total_tokens === "number") {
    mapped.totalUnits = usage.total_tokens;
  }
  return Object.keys(mapped).length ? mapped : undefined;
}

export function getRequestedModel(
  request: AIChatRequest,
  defaultModel: string,
): string {
  return request.model ?? defaultModel;
}

export function mapMessagesToOpenAIInput(request: AIChatRequest) {
  const instructions: string[] = [];
  const input: OpenAIResponsesCreateParams["input"] = [];

  for (const message of request.messages) {
    if (typeof message.text !== "string") {
      logAIProviderErrorThrown({
        sourceFile: "lib/ai/providers/openai/openai-mappers.ts",
        sourceLine: 106,
        reason: "openai_mapper_message_without_text",
      });
      throw new AIProviderError({
        code: "invalid_request",
        message: "Todas as mensagens devem conter texto simples.",
        provider: OPENAI_PROVIDER_ID,
        retryable: false,
      });
    }

    if (message.role === "system") {
      instructions.push(message.text);
      continue;
    }

    if (message.role !== "user" && message.role !== "assistant") {
      logAIProviderErrorThrown({
        sourceFile: "lib/ai/providers/openai/openai-mappers.ts",
        sourceLine: 120,
        reason: "openai_mapper_unsupported_message_role",
      });
      throw new AIProviderError({
        code: "unsupported_capability",
        message: `O papel de mensagem "${String(message.role)}" não é suportado por este adaptador.`,
        provider: OPENAI_PROVIDER_ID,
        retryable: false,
      });
    }

    input.push({
      role: message.role,
      content: message.text,
    });
  }

  if (!input.length) {
    logAIProviderErrorThrown({
      sourceFile: "lib/ai/providers/openai/openai-mappers.ts",
      sourceLine: 135,
      reason: "openai_mapper_missing_user_or_assistant_message",
    });
    throw new AIProviderError({
      code: "invalid_request",
      message: "O chat textual exige pelo menos uma mensagem de usuário ou assistente.",
      provider: OPENAI_PROVIDER_ID,
      retryable: false,
    });
  }

  return {
    input,
    instructions: instructions.length ? instructions.join("\n\n") : undefined,
  };
}

export function buildOpenAIChatParams(
  request: AIChatRequest,
  model: string,
  stream: boolean,
): OpenAIResponsesCreateParams {
  const { input, instructions } = mapMessagesToOpenAIInput(request);
  return {
    model,
    input,
    instructions,
    ...(request.temperature !== undefined
      ? { temperature: request.temperature }
      : {}),
    ...(request.maxOutputTokens !== undefined
      ? { max_output_tokens: request.maxOutputTokens }
      : {}),
    stream,
    store: false,
  };
}

export function mapOpenAIResponseToAIChatResponse(
  response: OpenAIResponseLike,
  provider: string,
  fallbackModel: string,
): AIChatResponse {
  const finishReason = mapFinishReason(
    response.finish_reason ?? response.incomplete_details?.reason,
  );

  return {
    text: response.output_text ?? "",
    provider,
    model: response.model ?? fallbackModel,
    usage: mapUsage(response.usage),
    finishReason:
      response.status === "incomplete" && finishReason === "unknown"
        ? "error"
        : finishReason,
  };
}

export function mapConfiguredModelToModelInfo(
  modelId: string,
  provider: string,
  capabilities: readonly AIProviderCapability[],
): AIModelInfo {
  return {
    id: modelId,
    provider,
    capabilities,
  };
}

export function ensureStreamFinished(
  events: AIStreamEvent[],
  provider: string,
  model: string,
): AIStreamEvent[] {
  if (events.some((event) => event.type === "finish" || event.type === "error")) {
    return events;
  }

  return [
    ...events,
    {
      type: "finish",
      finishReason: "unknown",
      metadata: { provider, model },
    },
  ];
}
