import type { AIProvider, AIProviderHealth } from "@/lib/ai/provider";
import type {
  AIChatRequest,
  AIChatResponse,
  AIModelInfo,
  AIProviderCapability,
  AIStreamEvent,
} from "@/lib/ai/types";
import { AIProviderError } from "@/lib/ai/types";
import {
  GROQ_DEFAULT_MODEL,
  GROQ_PROVIDER_ID,
  GROQ_TEXT_CAPABILITIES,
  type GroqChatResponse,
  type GroqModelsResponse,
} from "./groq-types";
import {
  buildGroqChatRequest,
  getGroqApiBaseUrl,
  mapGroqChatResponse,
  resolveGroqModel,
} from "./groq-mappers";
import { parseGroqErrorBody, toGroqProviderError } from "./groq-errors";

export type GroqFetch = typeof fetch;

export interface GroqProviderOptions {
  apiKey?: string;
  defaultModel?: string;
  baseUrl?: string;
  fetchImpl?: GroqFetch;
  requestTimeoutMs?: number;
}

interface GroqDiagnosticContext {
  requestId?: string;
  model: string;
  startedAtMs: number;
}

function isDiagnosticMetadata(value: unknown): value is {
  requestId?: string;
  generationStartedAtMs?: number;
} {
  return typeof value === "object" && value !== null;
}

function createDiagnosticContext(
  request: AIChatRequest,
  model: string,
): GroqDiagnosticContext {
  const metadata = isDiagnosticMetadata(request.metadata)
    ? request.metadata
    : undefined;
  return {
    requestId: metadata?.requestId,
    model,
    startedAtMs:
      typeof metadata?.generationStartedAtMs === "number"
        ? metadata.generationStartedAtMs
        : Date.now(),
  };
}

function logDiagnostic(
  context: GroqDiagnosticContext,
  event: string,
  stage: string,
  details: Record<string, unknown> = {},
): void {
  console.info(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      requestId: context.requestId,
      providerId: GROQ_PROVIDER_ID,
      modelId: context.model,
      event,
      stage,
      elapsedMs: Math.max(0, Date.now() - context.startedAtMs),
      ...details,
    }),
  );
}

export class GroqProvider implements AIProvider {
  readonly providerId = GROQ_PROVIDER_ID;
  readonly displayName = "Groq Cloud Free";
  readonly capabilities = {
    supported: GROQ_TEXT_CAPABILITIES,
  } as const;

  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: GroqFetch;
  private readonly requestTimeoutMs: number;

  constructor(options: GroqProviderOptions = {}) {
    const apiKey = options.apiKey ?? process.env.GROQ_API_KEY ?? "";
    if (!apiKey) {
      throw new AIProviderError({
        code: "unavailable",
        message: "A variavel GROQ_API_KEY nao esta configurada.",
        provider: GROQ_PROVIDER_ID,
        retryable: false,
        metadata: { env: "GROQ_API_KEY" },
      });
    }

    this.apiKey = apiKey;
    const explicitModel = options.defaultModel?.trim();
    const envModel = process.env.GROQ_MODEL?.trim();
    this.model =
      (explicitModel || undefined) ?? (envModel || undefined) ?? GROQ_DEFAULT_MODEL;
    this.baseUrl = options.baseUrl ?? getGroqApiBaseUrl();
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 30_000;
  }

  supports(capability: AIProviderCapability): boolean {
    return (this.capabilities.supported as readonly AIProviderCapability[]).includes(
      capability,
    );
  }

  getDefaultModel(): string {
    return this.model;
  }

  async generate(request: AIChatRequest): Promise<AIChatResponse> {
    const model = resolveGroqModel(request, this.model);
    const diagnostics = createDiagnosticContext(request, model);
    const body = buildGroqChatRequest(request, this.model);

    logDiagnostic(diagnostics, "generate_request", "provider_request", {
      stream: false,
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.requestTimeoutMs,
    );

    try {
      if (request.signal) {
        request.signal.addEventListener("abort", () => controller.abort(), {
          once: true,
        });
      }

      const response = await this.fetchImpl(
        `${this.baseUrl}/chat/completions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        await throwForHttpError(response, model);
      }

      const parsed = (await response.json()) as GroqChatResponse;
      const result = mapGroqChatResponse(parsed, this.model);

      logDiagnostic(diagnostics, "generate_response", "provider_response", {
        finishReason: result.finishReason,
        usage: result.usage,
      });

      return result;
    } catch (error) {
      throw toGroqProviderError(error, {
        provider: GROQ_PROVIDER_ID,
        model,
        metadata: { requestId: diagnostics.requestId },
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async *stream(request: AIChatRequest): AsyncGenerator<AIStreamEvent> {
    const model = resolveGroqModel(request, this.model);
    const diagnostics = createDiagnosticContext(request, model);
    const body = buildGroqChatRequest(request, this.model);

    logDiagnostic(diagnostics, "stream_request", "provider_request", {
      stream: true,
    });

    yield {
      type: "start",
      provider: GROQ_PROVIDER_ID,
      model,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.requestTimeoutMs,
    );

    try {
      if (request.signal) {
        request.signal.addEventListener("abort", () => controller.abort(), {
          once: true,
        });
      }

      const response = await this.fetchImpl(
        `${this.baseUrl}/chat/completions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({ ...body, stream: true }),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        await throwForHttpError(response, model);
      }

      if (!response.body) {
        throw new AIProviderError({
          code: "provider_error",
          message: "O provedor cloud respondeu sem body para streaming.",
          provider: GROQ_PROVIDER_ID,
          model,
          retryable: true,
        });
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;

          const data = trimmed.slice(6).trim();
          if (data === "[DONE]") {
            yield { type: "finish", finishReason: "stop" };
            return;
          }

          try {
            const chunk = JSON.parse(data) as GroqChatResponse;
            const choice = chunk.choices?.[0];

            if (choice?.delta?.content) {
              yield { type: "text-delta", textDelta: choice.delta.content };
            }

            if (choice?.finish_reason) {
              yield {
                type: "finish",
                finishReason:
                  choice.finish_reason === "length"
                    ? "max_output_tokens"
                    : "stop",
                usage: chunk.usage
                  ? {
                      inputUnits: chunk.usage.prompt_tokens,
                      outputUnits: chunk.usage.completion_tokens,
                      totalUnits: chunk.usage.total_tokens,
                    }
                  : undefined,
              };
            }
          } catch {
            throw new AIProviderError({
              code: "provider_error",
              message: "O provedor cloud retornou JSON invalido no streaming.",
              provider: GROQ_PROVIDER_ID,
              model,
              retryable: true,
              metadata: { reason: "invalid-json" },
            });
          }
        }
      }

      yield { type: "finish", finishReason: "stop" };
    } catch (error) {
      const normalized = toGroqProviderError(error, {
        provider: GROQ_PROVIDER_ID,
        model,
        metadata: { requestId: diagnostics.requestId },
      });

      yield { type: "error", error: normalized };
    } finally {
      clearTimeout(timeoutId);
      logDiagnostic(diagnostics, "stream_closed", "provider_stream", {});
    }
  }

  async healthCheck(): Promise<AIProviderHealth> {
    const model = this.model;

    try {
      const response = await this.fetchImpl(`${this.baseUrl}/models`, {
        method: "GET",
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });

      if (!response.ok) {
        await throwForHttpError(response, model);
      }

      const parsed = (await response.json()) as GroqModelsResponse;

      return {
        ok: Array.isArray(parsed.data),
        provider: GROQ_PROVIDER_ID,
        message: "O provedor cloud respondeu com sucesso.",
        metadata: {
          strategy: "models-endpoint",
          defaultModel: model,
          modelCount: Array.isArray(parsed.data) ? parsed.data.length : 0,
        },
      };
    } catch (error) {
      const normalized = toGroqProviderError(error, {
        provider: GROQ_PROVIDER_ID,
        model,
      });

      return {
        ok: false,
        provider: GROQ_PROVIDER_ID,
        message: normalized.message,
        metadata: {
          strategy: "models-endpoint",
          code: normalized.code,
          defaultModel: model,
        },
      };
    }
  }

  async listModels(): Promise<AIModelInfo[]> {
    const model = this.model;

    try {
      const response = await this.fetchImpl(`${this.baseUrl}/models`, {
        method: "GET",
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });

      if (!response.ok) {
        await throwForHttpError(response, model);
      }

      const parsed = (await response.json()) as GroqModelsResponse;

      return [...(parsed.data ?? [])]
        .map((item): AIModelInfo | null => {
          if (!item?.id) return null;
          return {
            id: item.id,
            provider: GROQ_PROVIDER_ID,
            label: item.id,
            capabilities: GROQ_TEXT_CAPABILITIES,
            metadata: {
              ownedBy: item.owned_by,
              created: item.created,
            },
          };
        })
        .filter((item): item is AIModelInfo => Boolean(item))
        .sort((a, b) => a.id.localeCompare(b.id));
    } catch (error) {
      throw toGroqProviderError(error, {
        provider: GROQ_PROVIDER_ID,
        model,
      });
    }
  }
}

async function throwForHttpError(
  response: Response,
  model: string,
): Promise<never> {
  const errorBody = await response.text();
  const message = parseGroqErrorBody(safeJsonParse(errorBody));

  // Pacote 16.6 (Groq Multi-Free): captura SANITIZADA de headers de
  // rate-limit (apenas valores numericos uteis derivados; NENHUM header cru
  // e armazenado, logado ou exposto). Alimenta o cooldown do candidato
  // (Retry-After) via metadata do erro classificado.
  const providerRateLimit = captureGroqRateLimitMetadata(response.headers);

  throw toGroqProviderError(
    {
      status: response.status,
      message: message || `HTTP ${response.status}`,
    },
    {
      provider: GROQ_PROVIDER_ID,
      model,
      statusCode: response.status,
      metadata: {
        reason: "http-error",
        ...(providerRateLimit ? { providerRateLimit } : {}),
      },
    },
  );
}

// Headers de rate-limit documentados pelo provider (Pacote 16.6). A leitura e
// best-effort e sanitizada: a ausencia de qualquer header e um cenario normal
// e nunca gera erro.
const RATE_LIMIT_RETRY_AFTER_HEADER = "retry-after";
const RATE_LIMIT_NUMERIC_HEADERS = Object.freeze([
  ["remainingRequests", "x-ratelimit-remaining-requests"],
  ["remainingTokens", "x-ratelimit-remaining-tokens"],
] as const);
const RATE_LIMIT_DURATION_HEADERS = Object.freeze([
  ["resetRequestsMs", "x-ratelimit-reset-requests"],
  ["resetTokensMs", "x-ratelimit-reset-tokens"],
] as const);

// Duracoes do estilo documentado ("2s", "1m", "500ms", "1h").
const DURATION_MS_PATTERN = /^(\d+)(ms|s|m|h)$/;

function parseDurationToMs(value: string): number | undefined {
  const match = DURATION_MS_PATTERN.exec(value.trim().toLowerCase());
  if (!match) return undefined;
  const amount = Number(match[1]);
  if (!Number.isSafeInteger(amount)) return undefined;
  switch (match[2]) {
    case "ms":
      return amount;
    case "s":
      return amount * 1000;
    case "m":
      return amount * 60_000;
    case "h":
      return amount * 3_600_000;
    default:
      return undefined;
  }
}

/**
 * Extrai APENAS valores sanitizados e uteis dos headers de rate-limit.
 * Retorna undefined quando nada util existe. Nunca inclui headers crus,
 * textos arbitrarios ou valores nao numericos.
 */
export function captureGroqRateLimitMetadata(
  headers: Headers,
): Record<string, number> | undefined {
  const captured: Record<string, number> = {};

  const retryAfter = headers.get(RATE_LIMIT_RETRY_AFTER_HEADER);
  if (retryAfter !== null) {
    const trimmed = retryAfter.trim();
    // Formato de segundos ("30") com fallback para duracao ("30s").
    const seconds = /^\d+(\.\d+)?$/.test(trimmed) ? Number(trimmed) : NaN;
    const ms =
      Number.isFinite(seconds) && seconds >= 0
        ? Math.round(seconds * 1000)
        : parseDurationToMs(trimmed);
    if (typeof ms === "number" && Number.isSafeInteger(ms) && ms >= 0) {
      captured.retryAfterMs = ms;
    }
  }

  for (const [key, headerName] of RATE_LIMIT_NUMERIC_HEADERS) {
    const raw = headers.get(headerName);
    if (raw !== null && /^\d+$/.test(raw.trim())) {
      captured[key] = Number(raw.trim());
    }
  }

  for (const [key, headerName] of RATE_LIMIT_DURATION_HEADERS) {
    const raw = headers.get(headerName);
    if (raw !== null) {
      const ms = parseDurationToMs(raw);
      if (ms !== undefined) {
        captured[key] = ms;
      }
    }
  }

  return Object.keys(captured).length > 0 ? captured : undefined;
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
