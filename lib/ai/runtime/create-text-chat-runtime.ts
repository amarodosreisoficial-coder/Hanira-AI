import type { AIProvider } from "@/lib/ai/provider";
import { logAIProviderErrorThrown } from "@/lib/ai/ai-provider-error-logging";
import { OllamaProvider } from "@/lib/ai/providers/ollama";
import { AIProviderError } from "@/lib/ai/types";
import type { ExternalRouterCandidateConfig } from "@/lib/ai/router/candidate-config";
import { createRouterCandidateRegistry } from "@/lib/ai/router/candidate-registry";
import {
  createTextModelRouter,
  resolveTextRouterDecisionProvider,
} from "@/lib/ai/runtime/text-router-resolution";

const MIN_CONNECT_TIMEOUT_MS = 250;
const MAX_CONNECT_TIMEOUT_MS = 120_000;
// Ollama may spend roughly 50 seconds loading qwen2.5:7b before returning headers.
// Keep a bounded connection timeout with a small margin; later phases retain
// their own first-token and idle protections.
const DEFAULT_CONNECT_TIMEOUT_MS = 60_000;
const MIN_FIRST_TOKEN_TIMEOUT_MS = 1_000;
const MAX_FIRST_TOKEN_TIMEOUT_MS = 600_000;
const DEFAULT_FIRST_TOKEN_TIMEOUT_MS = 90_000;
const MIN_IDLE_TIMEOUT_MS = 1_000;
const MAX_IDLE_TIMEOUT_MS = 600_000;
const DEFAULT_IDLE_TIMEOUT_MS = 30_000;
const MIN_REQUEST_TIMEOUT_MS = 0;
const MAX_REQUEST_TIMEOUT_MS = 600_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 0;
const KEEP_ALIVE_PATTERN = /^(0|[1-9]\d*(?:ms|s|m|h))$/;

export interface OllamaRuntimeConfig {
  enabled: true;
  baseUrl: string;
  model: string;
  connectTimeoutMs: number;
  firstTokenTimeoutMs: number;
  idleTimeoutMs: number;
  requestTimeoutMs: number;
  keepAlive?: string;
}

export interface TextChatRuntimeConfig {
  provider: AIProvider;
  model: string;
  baseUrl: string;
  connectTimeoutMs: number;
  firstTokenTimeoutMs: number;
  idleTimeoutMs: number;
  requestTimeoutMs: number;
  keepAlive?: string;
  providerId: string;
}

// Opcoes opcionais de composicao do runtime de texto (Pacote 14.4). Nenhuma
// opcao e obrigatoria: sem argumentos, o comportamento continua identico ao
// Pacote 14.3 (somente candidato interno Ollama, externalCandidates = []).
// Candidatos externos sao apenas configuracao logica injetada; nunca ativam
// providers cloud reais neste pacote.
export interface TextChatRuntimeCreateOptions {
  readonly externalCandidates?: readonly ExternalRouterCandidateConfig[];
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

function parseKeepAliveEnv(): string | undefined {
  const rawValue = process.env.OLLAMA_KEEP_ALIVE;
  if (rawValue === undefined) return undefined;

  const value = rawValue.trim();
  if (!KEEP_ALIVE_PATTERN.test(value)) {
    throw createInvalidConfigError(
      "A configuracao OLLAMA_KEEP_ALIVE deve ser 0 ou uma duracao como 10m, 15m ou 1h.",
      { env: "OLLAMA_KEEP_ALIVE" },
    );
  }

  return value;
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
  const keepAlive = parseKeepAliveEnv();

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
    ...(keepAlive !== undefined ? { keepAlive } : {}),
  };
}

export function createTextChatRuntime(
  options?: TextChatRuntimeCreateOptions,
): TextChatRuntimeConfig {
  const config = resolveOllamaRuntimeConfig();

  // Pacotes 14.2B/14.3: a selecao do provider de texto passa pelo Model
  // Router alimentado pelo registry tipado de candidatos; ambos permanecem
  // puros (sem env, sem rede, sem criacao de providers). Este e o composition
  // root: RouterDecision -> AIProvider real.
  //
  // Pacote 14.4: a composition root pode injetar `externalCandidates` (ja
  // validados/normalizados) para o registry. Sem a opcao, o padrao e
  // `[]`, entao o comportamento funcional e identico ao Pacote 14.3: somente
  // o candidato interno `ollama-default` e registrado e o Ollama continua
  // sendo selecionado.
  const registry = createRouterCandidateRegistry({
    ollamaModel: config.model,
    externalCandidates: options?.externalCandidates,
  });
  const decision = createTextModelRouter(
    registry.getCandidatesForCapability("text"),
  ).select({ capability: "text" });

  const provider = resolveTextRouterDecisionProvider(decision, {
    ollama: ({ model }) =>
      new OllamaProvider({
        baseUrl: config.baseUrl,
        defaultModel: model,
        connectTimeoutMs: config.connectTimeoutMs,
        firstTokenTimeoutMs: config.firstTokenTimeoutMs,
        idleTimeoutMs: config.idleTimeoutMs,
        requestTimeoutMs: config.requestTimeoutMs,
      }),
  });

  return {
    provider,
    model: config.model,
    baseUrl: config.baseUrl,
    connectTimeoutMs: config.connectTimeoutMs,
    firstTokenTimeoutMs: config.firstTokenTimeoutMs,
    idleTimeoutMs: config.idleTimeoutMs,
    requestTimeoutMs: config.requestTimeoutMs,
    keepAlive: config.keepAlive,
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
