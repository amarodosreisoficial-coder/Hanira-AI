import type {
  AIChatRequest,
  AIFinishReason,
  AIModelInfo,
  AIProviderCapabilities,
  AIProviderCapability,
  AIUsage,
} from "@/lib/ai/types";
import { AIProviderError } from "@/lib/ai/types";

export const OLLAMA_PROVIDER_ID = "ollama";
export const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";
export const DEFAULT_OLLAMA_MODEL = "qwen2.5:latest";

export const OLLAMA_TEXT_CAPABILITIES: AIProviderCapabilities = {
  supported: ["text-generation", "text-streaming"],
};

export interface OllamaMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OllamaChatRequestBody {
  model: string;
  messages: OllamaMessage[];
  stream: boolean;
  options?: {
    temperature?: number;
    num_predict?: number;
  };
}

export interface OllamaChatResponseLike {
  model?: string;
  message?: {
    role?: string;
    content?: string;
  };
  done?: boolean;
  done_reason?: string | null;
  prompt_eval_count?: number;
  eval_count?: number;
}

export interface OllamaTagDetailsLike {
  format?: string;
  family?: string;
  families?: string[];
  parameter_size?: string;
  quantization_level?: string;
}

export interface OllamaTagLike {
  name?: string;
  model?: string;
  modified_at?: string;
  size?: number;
  digest?: string;
  details?: OllamaTagDetailsLike;
}

export interface OllamaTagsResponseLike {
  models?: OllamaTagLike[];
}

export function mapFinishReason(reason: string | null | undefined): AIFinishReason {
  switch (reason) {
    case "stop":
      return "stop";
    case "length":
      return "max_output_tokens";
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

export function mapUsage(response: {
  prompt_eval_count?: number;
  eval_count?: number;
}): AIUsage | undefined {
  const usage: AIUsage = {};

  if (typeof response.prompt_eval_count === "number") {
    usage.inputUnits = response.prompt_eval_count;
  }

  if (typeof response.eval_count === "number") {
    usage.outputUnits = response.eval_count;
  }

  if (
    typeof usage.inputUnits === "number" ||
    typeof usage.outputUnits === "number"
  ) {
    usage.totalUnits =
      (usage.inputUnits ?? 0) + (usage.outputUnits ?? 0);
  }

  return Object.keys(usage).length ? usage : undefined;
}

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

export function getRequestedModel(
  request: AIChatRequest,
  defaultModel: string,
): string {
  return request.model ?? defaultModel;
}

export function mapMessagesToOllamaMessages(
  request: AIChatRequest,
): OllamaMessage[] {
  if (!request.messages.length) {
    throw new AIProviderError({
      code: "invalid_request",
      message: "O chat textual exige pelo menos uma mensagem.",
      provider: OLLAMA_PROVIDER_ID,
      retryable: false,
    });
  }

  return request.messages.map((message) => {
    if (typeof message.text !== "string") {
      throw new AIProviderError({
        code: "invalid_request",
        message: "Todas as mensagens devem conter texto simples.",
        provider: OLLAMA_PROVIDER_ID,
        retryable: false,
      });
    }

    if (
      message.role !== "system" &&
      message.role !== "user" &&
      message.role !== "assistant"
    ) {
      throw new AIProviderError({
        code: "unsupported_capability",
        message: `O papel de mensagem "${String(message.role)}" nao e suportado por este adaptador.`,
        provider: OLLAMA_PROVIDER_ID,
        retryable: false,
      });
    }

    return {
      role: message.role,
      content: message.text,
    };
  });
}

export function buildOllamaChatBody(
  request: AIChatRequest,
  model: string,
  stream: boolean,
): OllamaChatRequestBody {
  const options: OllamaChatRequestBody["options"] = {};

  if (request.temperature !== undefined) {
    options.temperature = request.temperature;
  }

  if (request.maxOutputTokens !== undefined) {
    options.num_predict = request.maxOutputTokens;
  }

  return {
    model,
    messages: mapMessagesToOllamaMessages(request),
    stream,
    ...(Object.keys(options).length ? { options } : {}),
  };
}

export function mapConfiguredModelToModelInfo(
  modelId: string,
  provider: string,
  capabilities: readonly AIProviderCapability[],
  metadata?: Record<string, unknown>,
): AIModelInfo {
  return {
    id: modelId,
    provider,
    capabilities,
    ...(metadata ? { metadata } : {}),
  };
}
