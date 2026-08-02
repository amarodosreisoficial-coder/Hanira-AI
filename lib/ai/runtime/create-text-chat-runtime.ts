import type { AIProvider } from "@/lib/ai/provider";
import { logAIProviderErrorThrown } from "@/lib/ai/ai-provider-error-logging";
import { OllamaProvider } from "@/lib/ai/providers/ollama";
import { AIProviderError } from "@/lib/ai/types";

const MIN_CONNECT_TIMEOUT_MS = 250;
const MAX_CONNECT_TIMEOUT_MS = 120_000;
const DEFAULT_CONNECT_TIMEOUT_MS = 30_000;
const MIN_FIRST_TOKEN_TIMEOUT_MS = 1_000;
const MAX_FIRST_TOKEN_TIMEOUT_MS = 600_000;
const DEFAULT_FIRST_TOKEN_TIMEOUT_MS = 90_000;
const MIN_IDLE_TIMEOUT_MS = 1_000;
const MAX_IDLE_TIMEOUT_MS = 600_000;
const DEFAULT_IDLE_TIMEOUT_MS = 30_000;
const MIN_REQUEST_TIMEOUT_MS = 0;
const MAX_REQUEST_TIMEOUT_MS = 600_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 0;

export interface OllamaRuntimeConfig {
  enabled: true;
  baseUrl: string;
  model: string;
  connectTimeoutMs: number;
  firstTokenTimeoutMs: number;
  idleTimeoutMs: number;
  requestTimeoutMs: number;
}

export interface TextChatRuntimeConfig {
  provider: AIProvider;
  model: string;
  baseUrl: string;
  connectTimeoutMs: number;
  firstTokenTimeoutMs: number;
  idleTimeoutMs: number;
  requestTimeoutMs: number;
  providerId: string;
}

function createInvalidConfigError(
  message: string,
  metadata?: Record<string, unknown>,
) {
  logAIProviderErrorThrown({
    sourceFile: "lib/ai/runtime/create-text-chat-runtime.ts",
    sourceLine: 43,
    reason: `ollama_runtime_invalid_config:${String(metadata?.env ?? "unknown")}`,
    requestId:
      typeof metadata?.requestId === "string" ? metadata.requestId : undefined,
  });
  return new AIProviderError({
    code: "invalid_request",
    message,
    provider: "ollama",
    retryable: false,
    metadata,
  });
}

function readRequiredEnv(name: "OLLAMA_BASE_URL" | "OLLAMA_MODEL") {
  const rawValue = process.env[name];
  const value = rawValue?.trim();
  if (!value) {
    throw createInvalidConfigError(
      `A configuracao ${name} e obrigatoria para o runtime Ollama.`,
      { env: name },
    );
  }

  return value;
}

function parseBoundedIntegerEnv(options: {
  name:
    | "OLLAMA_CONNECT_TIMEOUT_MS"
    | "OLLAMA_FIRST_TOKEN_TIMEOUT_MS"
    | "OLLAMA_IDLE_TIMEOUT_MS"
    | "OLLAMA_REQUEST_TIMEOUT_MS";
  min: number;
  max: number;
  fallback: number;
}) {
  const rawValue = process.env[options.name];
  if (rawValue === undefined) {
    return options.fallback;
  }

  const value = rawValue.trim();
  if (!/^\d+$/.test(value)) {
    throw createInvalidConfigError(
      `A configuracao ${options.name} deve ser um inteiro positivo.`,
      { env: options.name },
    );
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < options.min || parsed > options.max) {
    throw createInvalidConfigError(
      `A configuracao ${options.name} esta fora do limite permitido.`,
      {
        env: options.name,
        min: options.min,
        max: options.max,
      },
    );
  }

  return parsed;
}

function normalizeBaseUrl(baseUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch (error) {
    throw createInvalidConfigError(
      "A configuracao OLLAMA_BASE_URL e invalida.",
      {
        env: "OLLAMA_BASE_URL",
        causeName: error instanceof Error ? error.name : "InvalidUrl",
      },
    );
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw createInvalidConfigError(
      "A configuracao OLLAMA_BASE_URL usa um protocolo invalido.",
      { env: "OLLAMA_BASE_URL" },
    );
  }

  return parsed.toString().replace(/\/$/, "");
}

export function resolveOllamaRuntimeConfig(): OllamaRuntimeConfig {
  if (process.env.AI_ENGINE_OLLAMA_ENABLED !== "true") {
    logAIProviderErrorThrown({
      sourceFile: "lib/ai/runtime/create-text-chat-runtime.ts",
      sourceLine: 129,
      reason: "ollama_runtime_disabled",
    });
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
  const connectTimeoutMs = parseBoundedIntegerEnv({
    name: "OLLAMA_CONNECT_TIMEOUT_MS",
    min: MIN_CONNECT_TIMEOUT_MS,
    max: MAX_CONNECT_TIMEOUT_MS,
    fallback: DEFAULT_CONNECT_TIMEOUT_MS,
  });
  const firstTokenTimeoutMs = parseBoundedIntegerEnv({
    name: "OLLAMA_FIRST_TOKEN_TIMEOUT_MS",
    min: MIN_FIRST_TOKEN_TIMEOUT_MS,
    max: MAX_FIRST_TOKEN_TIMEOUT_MS,
    fallback: DEFAULT_FIRST_TOKEN_TIMEOUT_MS,
  });
  const idleTimeoutMs = parseBoundedIntegerEnv({
    name: "OLLAMA_IDLE_TIMEOUT_MS",
    min: MIN_IDLE_TIMEOUT_MS,
    max: MAX_IDLE_TIMEOUT_MS,
    fallback: DEFAULT_IDLE_TIMEOUT_MS,
  });
  const requestTimeoutMs = parseBoundedIntegerEnv({
    name: "OLLAMA_REQUEST_TIMEOUT_MS",
    min: MIN_REQUEST_TIMEOUT_MS,
    max: MAX_REQUEST_TIMEOUT_MS,
    fallback: DEFAULT_REQUEST_TIMEOUT_MS,
  });

  if (firstTokenTimeoutMs < connectTimeoutMs) {
    throw createInvalidConfigError(
      "A configuracao de timeout do Ollama e invalida.",
      {
        env: "OLLAMA_FIRST_TOKEN_TIMEOUT_MS",
        relatedEnv: "OLLAMA_CONNECT_TIMEOUT_MS",
      },
    );
  }

  if (requestTimeoutMs > 0 && requestTimeoutMs < firstTokenTimeoutMs) {
    throw createInvalidConfigError(
      "A configuracao de timeout do Ollama e invalida.",
      {
        env: "OLLAMA_REQUEST_TIMEOUT_MS",
        relatedEnv: "OLLAMA_FIRST_TOKEN_TIMEOUT_MS",
      },
    );
  }

  return {
    enabled: true,
    baseUrl,
    model,
    connectTimeoutMs,
    firstTokenTimeoutMs,
    idleTimeoutMs,
    requestTimeoutMs,
  };
}

export function createTextChatRuntime(): TextChatRuntimeConfig {
  const config = resolveOllamaRuntimeConfig();
  const provider = new OllamaProvider({
    baseUrl: config.baseUrl,
    defaultModel: config.model,
    connectTimeoutMs: config.connectTimeoutMs,
    firstTokenTimeoutMs: config.firstTokenTimeoutMs,
    idleTimeoutMs: config.idleTimeoutMs,
    requestTimeoutMs: config.requestTimeoutMs,
  });

  return {
    provider,
    model: config.model,
    baseUrl: config.baseUrl,
    connectTimeoutMs: config.connectTimeoutMs,
    firstTokenTimeoutMs: config.firstTokenTimeoutMs,
    idleTimeoutMs: config.idleTimeoutMs,
    requestTimeoutMs: config.requestTimeoutMs,
    providerId: provider.providerId,
  };
}

export const OLLAMA_RUNTIME_TIMEOUT_LIMITS = {
  connect: {
    min: MIN_CONNECT_TIMEOUT_MS,
    max: MAX_CONNECT_TIMEOUT_MS,
    fallback: DEFAULT_CONNECT_TIMEOUT_MS,
  },
  firstToken: {
    min: MIN_FIRST_TOKEN_TIMEOUT_MS,
    max: MAX_FIRST_TOKEN_TIMEOUT_MS,
    fallback: DEFAULT_FIRST_TOKEN_TIMEOUT_MS,
  },
  idle: {
    min: MIN_IDLE_TIMEOUT_MS,
    max: MAX_IDLE_TIMEOUT_MS,
    fallback: DEFAULT_IDLE_TIMEOUT_MS,
  },
  request: {
    min: MIN_REQUEST_TIMEOUT_MS,
    max: MAX_REQUEST_TIMEOUT_MS,
    fallback: DEFAULT_REQUEST_TIMEOUT_MS,
  },
} as const;
