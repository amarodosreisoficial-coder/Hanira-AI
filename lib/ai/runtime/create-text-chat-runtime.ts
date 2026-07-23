import type { AIProvider } from "@/lib/ai/provider";
import { OllamaProvider } from "@/lib/ai/providers/ollama";
import { AIProviderError } from "@/lib/ai/types";

export interface TextChatRuntimeConfig {
  provider: AIProvider;
  model: string;
  baseUrl: string;
}

function readRequiredEnv(name: "OLLAMA_BASE_URL" | "OLLAMA_MODEL") {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new AIProviderError({
      code: "invalid_request",
      message: `A configuracao ${name} e obrigatoria para o runtime Ollama.`,
      provider: "ollama",
      retryable: false,
      metadata: { env: name },
    });
  }

  return value;
}

function normalizeBaseUrl(baseUrl: string) {
  try {
    const parsed = new URL(baseUrl);
    return parsed.toString().replace(/\/$/, "");
  } catch (error) {
    throw new AIProviderError({
      code: "invalid_request",
      message: "A configuracao OLLAMA_BASE_URL e invalida.",
      provider: "ollama",
      retryable: false,
      cause: error,
      metadata: { env: "OLLAMA_BASE_URL" },
    });
  }
}

export function createTextChatRuntime(): TextChatRuntimeConfig {
  if (process.env.AI_ENGINE_OLLAMA_ENABLED !== "true") {
    throw new AIProviderError({
      code: "unavailable",
      message: "O runtime Ollama esta desativado.",
      provider: "ollama",
      retryable: false,
      metadata: { env: "AI_ENGINE_OLLAMA_ENABLED" },
    });
  }

  const baseUrl = normalizeBaseUrl(readRequiredEnv("OLLAMA_BASE_URL"));
  const model = readRequiredEnv("OLLAMA_MODEL");

  return {
    provider: new OllamaProvider({
      baseUrl,
      defaultModel: model,
    }),
    model,
    baseUrl,
  };
}
