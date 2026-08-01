import type { AIProvider, AIProviderHealth } from "@/lib/ai/provider";
import type {
  AIChatRequest,
  AIChatResponse,
  AIModelInfo,
  AIProviderCapability,
  AIStreamEvent,
} from "@/lib/ai/types";
import { AIProviderError } from "@/lib/ai/types";
import { toOllamaProviderError } from "./ollama-errors";
import {
  buildOllamaChatBody,
  DEFAULT_OLLAMA_BASE_URL,
  DEFAULT_OLLAMA_MODEL,
  getRequestedModel,
  mapConfiguredModelToModelInfo,
  mapFinishReason,
  mapUsage,
  normalizeBaseUrl,
  OLLAMA_PROVIDER_ID,
  OLLAMA_TEXT_CAPABILITIES,
  type OllamaChatResponseLike,
  type OllamaTagsResponseLike,
  type OllamaTagLike,
} from "./ollama-types";

export type OllamaFetch = typeof fetch;

interface OllamaDiagnosticContext {
  requestId?: string;
  model: string;
  baseUrl: string;
  startedAtMs: number;
}

function isDiagnosticMetadata(
  value: unknown,
): value is {
  requestId?: string;
  generationStartedAtMs?: number;
  diagnostics?: {
    baseUrl?: string;
    connectTimeoutMs?: number;
    firstTokenTimeoutMs?: number;
    idleTimeoutMs?: number;
    requestTimeoutMs?: number;
  };
} {
  return typeof value === "object" && value !== null;
}

function createOllamaDiagnosticContext(
  request: AIChatRequest,
  model: string,
  baseUrl: string,
): OllamaDiagnosticContext {
  const metadata = isDiagnosticMetadata(request.metadata) ? request.metadata : undefined;
  return {
    requestId: metadata?.requestId,
    model,
    baseUrl,
    startedAtMs:
      typeof metadata?.generationStartedAtMs === "number"
        ? metadata.generationStartedAtMs
        : Date.now(),
  };
}

function logOllamaDiagnostic(
  context: OllamaDiagnosticContext,
  event: string,
  stage: string,
  details: Record<string, unknown> = {},
) {
  console.info(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      requestId: context.requestId,
      providerId: OLLAMA_PROVIDER_ID,
      modelId: context.model,
      baseUrl: context.baseUrl,
      event,
      stage,
      elapsedMs: Math.max(0, Date.now() - context.startedAtMs),
      ...details,
    }),
  );
}

export interface OllamaProviderOptions {
  fetch?: OllamaFetch;
  baseUrl?: string;
  defaultModel?: string;
  connectTimeoutMs?: number;
  firstTokenTimeoutMs?: number;
  idleTimeoutMs?: number;
  requestTimeoutMs?: number;
  baseUrlResolver?: () => string;
  defaultModelResolver?: () => string;
  connectTimeoutResolver?: () => number;
  firstTokenTimeoutResolver?: () => number;
  idleTimeoutResolver?: () => number;
  requestTimeoutResolver?: () => number;
}

interface RequestExecutionContext {
  signal: AbortSignal;
  markConnected: () => void;
  markChunkReceived: () => void;
  cleanup: () => void;
  timedOutStage: () => "connect" | "request" | null;
  timedOutPhase: () => "connect" | "first_token" | "idle" | "total" | null;
  cancelledByClient: () => boolean;
}

function createRequestExecutionContext(
  request: AIChatRequest,
  options: {
    connectTimeoutMs: number;
    firstTokenTimeoutMs?: number;
    idleTimeoutMs?: number;
    totalTimeoutMs?: number;
    onDiagnostic?: (
      event: string,
      stage: string,
      details?: Record<string, unknown>,
    ) => void;
  },
): RequestExecutionContext {
  const controller = new AbortController();
  let timeoutStage: "connect" | "request" | null = null;
  let timeoutPhase: "connect" | "first_token" | "idle" | "total" | null = null;
  let cancelledByClient = false;
  let connected = false;
  let firstChunkReceived = false;
  const listeners: Array<() => void> = [];
  let firstTokenTimeout: ReturnType<typeof setTimeout> | null = null;
  let idleTimeout: ReturnType<typeof setTimeout> | null = null;

  if (request.signal) {
    if (request.signal.aborted) {
      cancelledByClient = true;
      controller.abort();
    } else {
      const onAbort = () => {
        cancelledByClient = true;
        options.onDiagnostic?.("client_abort_received", "abort", {});
        controller.abort();
      };
      request.signal.addEventListener("abort", onAbort, { once: true });
      listeners.push(() => request.signal?.removeEventListener("abort", onAbort));
    }
  }

  const totalTimeoutMs =
    typeof request.timeoutMs === "number" && request.timeoutMs > 0
      ? request.timeoutMs
      : options.totalTimeoutMs;

  const abortForTimeout = (
    stage: "connect" | "request",
    phase: "connect" | "first_token" | "idle" | "total",
  ) => {
    if (controller.signal.aborted || timeoutStage !== null) {
      return;
    }

    timeoutStage = stage;
    timeoutPhase = phase;
    options.onDiagnostic?.("timeout_triggered", stage, {
      timerName: phase,
    });
    controller.abort();
  };

  const clearFirstTokenTimeout = () => {
    if (firstTokenTimeout) {
      clearTimeout(firstTokenTimeout);
      firstTokenTimeout = null;
    }
  };

  const clearIdleTimeout = () => {
    if (idleTimeout) {
      clearTimeout(idleTimeout);
      idleTimeout = null;
    }
  };

  const armFirstTokenTimeout = () => {
    clearFirstTokenTimeout();
    if (
      !connected ||
      firstChunkReceived ||
      controller.signal.aborted ||
      typeof options.firstTokenTimeoutMs !== "number" ||
      options.firstTokenTimeoutMs <= 0
    ) {
      return;
    }

    firstTokenTimeout = setTimeout(() => {
      if (!firstChunkReceived) {
        abortForTimeout("request", "first_token");
      }
    }, options.firstTokenTimeoutMs);
    options.onDiagnostic?.("timer_started", "request", {
      timerName: "first_token",
      timeoutMs: options.firstTokenTimeoutMs,
    });
  };

  const armIdleTimeout = () => {
    clearIdleTimeout();
    if (
      !connected ||
      !firstChunkReceived ||
      controller.signal.aborted ||
      typeof options.idleTimeoutMs !== "number" ||
      options.idleTimeoutMs <= 0
    ) {
      return;
    }

    idleTimeout = setTimeout(() => {
      abortForTimeout("request", "idle");
    }, options.idleTimeoutMs);
    options.onDiagnostic?.("timer_started", "request", {
      timerName: "idle",
      timeoutMs: options.idleTimeoutMs,
    });
  };

  const connectTimeout = setTimeout(() => {
    if (!connected) {
      abortForTimeout("connect", "connect");
    }
  }, options.connectTimeoutMs);
  options.onDiagnostic?.("timer_started", "connect", {
    timerName: "connect",
    timeoutMs: options.connectTimeoutMs,
  });

  const totalTimeout =
    typeof totalTimeoutMs === "number" && totalTimeoutMs > 0
      ? setTimeout(() => {
          abortForTimeout(connected ? "request" : "connect", "total");
        }, totalTimeoutMs)
      : null;
  if (typeof totalTimeoutMs === "number" && totalTimeoutMs > 0) {
    options.onDiagnostic?.("timer_started", "request", {
      timerName: "total",
      timeoutMs: totalTimeoutMs,
    });
  }

  return {
    signal: controller.signal,
    markConnected: () => {
      if (connected) return;
      connected = true;
      clearTimeout(connectTimeout);
      options.onDiagnostic?.("timer_cleared", "connect", {
        timerName: "connect",
      });
      armFirstTokenTimeout();
    },
    markChunkReceived: () => {
      if (!connected) return;
      if (!firstChunkReceived) {
        firstChunkReceived = true;
        clearFirstTokenTimeout();
        options.onDiagnostic?.("timer_cleared", "request", {
          timerName: "first_token",
        });
      }
      armIdleTimeout();
    },
    cleanup: () => {
      clearTimeout(connectTimeout);
      options.onDiagnostic?.("timer_cleared", "connect", {
        timerName: "connect",
      });
      clearFirstTokenTimeout();
      options.onDiagnostic?.("timer_cleared", "request", {
        timerName: "first_token",
      });
      clearIdleTimeout();
      options.onDiagnostic?.("timer_cleared", "request", {
        timerName: "idle",
      });
      if (totalTimeout) {
        clearTimeout(totalTimeout);
        options.onDiagnostic?.("timer_cleared", "request", {
          timerName: "total",
        });
      }
      for (const remove of listeners) remove();
    },
    timedOutStage: () => timeoutStage,
    timedOutPhase: () => timeoutPhase,
    cancelledByClient: () => cancelledByClient,
  };
}

function createTimeoutError(
  model: string,
  stage: "connect" | "request",
  phase: "connect" | "first_token" | "idle" | "total",
) {
  return new AIProviderError({
    code: "timeout",
    message:
      phase === "connect"
        ? "O Ollama demorou mais que o permitido para aceitar a conexao."
        : phase === "first_token"
          ? "O Ollama demorou mais que o permitido para iniciar o streaming."
          : phase === "idle"
            ? "O streaming do Ollama ficou inativo por mais tempo que o permitido."
            : "O Ollama demorou mais que o permitido para responder.",
    provider: OLLAMA_PROVIDER_ID,
    model,
    retryable: true,
    metadata: { stage, phase },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function parseJsonResponse<T>(
  response: Response,
  context: {
    provider: string;
    model?: string;
  },
): Promise<T> {
  const rawText = await response.text();

  if (!rawText.trim()) {
    throw toOllamaProviderError(
      new Error("empty response body"),
      {
        ...context,
        statusCode: response.status,
        metadata: { reason: "body-missing" },
      },
    );
  }

  try {
    return JSON.parse(rawText) as T;
  } catch (error) {
    throw toOllamaProviderError(error, {
      ...context,
      statusCode: response.status,
      metadata: { reason: "invalid-json" },
    });
  }
}

function getErrorMessageFromPayload(payload: unknown) {
  if (isRecord(payload) && typeof payload.error === "string") {
    return payload.error;
  }
  return undefined;
}

function assertJsonLikeContentType(
  response: Response,
  context: {
    provider: string;
    model?: string;
    expected: "json" | "ndjson";
  },
) {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const isValid =
    context.expected === "json"
      ? contentType.includes("application/json")
      : contentType.includes("json");

  if (!isValid) {
    throw toOllamaProviderError(new Error("unexpected content-type"), {
      provider: context.provider,
      model: context.model,
      statusCode: response.status,
      metadata: {
        reason: "unexpected-content-type",
        expected: context.expected,
      },
    });
  }
}

async function throwForHttpError(
  response: Response,
  context: {
    provider: string;
    model?: string;
    onDiagnostic?: (details: Record<string, unknown>) => void;
  },
): Promise<void> {
  if (response.ok) return;

  let message = `HTTP ${response.status}`;

  try {
    const parsed = await parseJsonResponse<Record<string, unknown>>(response, context);
    message = getErrorMessageFromPayload(parsed) ?? message;
  } catch {
    try {
      const fallbackText = await response.text();
      if (fallbackText.trim()) {
        message = fallbackText.trim();
      }
    } catch {
      // Ignore body parsing fallback errors and keep status-based message.
    }
  }

  context.onDiagnostic?.({
    statusCode: response.status,
    sanitizedMessage: message.slice(0, 200),
  });

  throw toOllamaProviderError(
    { status: response.status, message },
    {
      ...context,
      statusCode: response.status,
      metadata: { reason: "http-error" },
    },
  );
}

function createUnexpectedFormatError(model: string, details?: string) {
  return toOllamaProviderError(new Error(details ?? "unexpected response format"), {
    provider: OLLAMA_PROVIDER_ID,
    model,
    metadata: { reason: "unexpected-format" },
  });
}

function createPostFinishStreamError(model: string) {
  return toOllamaProviderError(new Error("unexpected data after finish"), {
    provider: OLLAMA_PROVIDER_ID,
    model,
    metadata: { reason: "post-finish-data" },
  });
}

async function* parseNdjsonStream(
  body: ReadableStream<Uint8Array>,
  model: string,
  options?: {
    onChunk?: (chunk: Uint8Array) => void;
  },
): AsyncIterable<OllamaChatResponseLike> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  const emitLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return undefined;

    try {
      return JSON.parse(trimmed) as OllamaChatResponseLike;
    } catch (error) {
      throw toOllamaProviderError(error, {
        provider: OLLAMA_PROVIDER_ID,
        model,
        metadata: { reason: "invalid-json" },
      });
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        options?.onChunk?.(value);
      }

      buffer += decoder.decode(value, { stream: true });

      while (true) {
        const newlineIndex = buffer.search(/\r?\n/);
        if (newlineIndex === -1) break;

        const rawLine = buffer.slice(0, newlineIndex);
        const newlineLength =
          buffer[newlineIndex] === "\r" && buffer[newlineIndex + 1] === "\n"
            ? 2
            : 1;
        buffer = buffer.slice(newlineIndex + newlineLength);

        const parsed = emitLine(rawLine);
        if (parsed) {
          yield parsed;
        }
      }
    }

    buffer += decoder.decode();
    const trailing = emitLine(buffer);
    if (trailing) {
      yield trailing;
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Ignore cancellation errors during cleanup.
    }
    reader.releaseLock();
  }
}

function mapTagToModelInfo(tag: OllamaTagLike): AIModelInfo | undefined {
  const id =
    (typeof tag.name === "string" && tag.name.trim()) ||
    (typeof tag.model === "string" && tag.model.trim()) ||
    "";

  if (!id) return undefined;

  return mapConfiguredModelToModelInfo(
    id,
    OLLAMA_PROVIDER_ID,
    OLLAMA_TEXT_CAPABILITIES.supported,
    {
      ...(typeof tag.modified_at === "string"
        ? { modifiedAt: tag.modified_at }
        : {}),
      ...(typeof tag.size === "number" ? { size: tag.size } : {}),
      ...(typeof tag.digest === "string" ? { digest: tag.digest } : {}),
      ...(tag.details ? { details: tag.details } : {}),
    },
  );
}

export class OllamaProvider implements AIProvider {
  readonly providerId = OLLAMA_PROVIDER_ID;
  readonly displayName = "Ollama";
  readonly capabilities = OLLAMA_TEXT_CAPABILITIES;

  private readonly fetchImpl: OllamaFetch;
  private readonly baseUrlResolver: () => string;
  private readonly defaultModelResolver: () => string;
  private readonly connectTimeoutResolver: () => number;
  private readonly firstTokenTimeoutResolver: () => number;
  private readonly idleTimeoutResolver: () => number;
  private readonly requestTimeoutResolver: () => number;

  constructor(options: OllamaProviderOptions = {}) {
    this.fetchImpl = options.fetch ?? fetch;
    this.baseUrlResolver =
      options.baseUrlResolver ??
      (() => normalizeBaseUrl(options.baseUrl ?? DEFAULT_OLLAMA_BASE_URL));
    this.defaultModelResolver =
      options.defaultModelResolver ??
      (() => options.defaultModel ?? DEFAULT_OLLAMA_MODEL);
    this.connectTimeoutResolver =
      options.connectTimeoutResolver ??
      (() => options.connectTimeoutMs ?? 5_000);
    this.firstTokenTimeoutResolver =
      options.firstTokenTimeoutResolver ??
      (() => options.firstTokenTimeoutMs ?? 45_000);
    this.idleTimeoutResolver =
      options.idleTimeoutResolver ??
      (() => options.idleTimeoutMs ?? 30_000);
    this.requestTimeoutResolver =
      options.requestTimeoutResolver ??
      (() => options.requestTimeoutMs ?? 0);
  }

  supports(capability: AIProviderCapability): boolean {
    return this.capabilities.supported.includes(capability);
  }

  async generate(request: AIChatRequest): Promise<AIChatResponse> {
    const model = getRequestedModel(request, this.defaultModelResolver());
    const baseUrl = this.baseUrlResolver();
    const diagnostics = createOllamaDiagnosticContext(request, model, baseUrl);
    const execution = createRequestExecutionContext(request, {
      connectTimeoutMs: this.connectTimeoutResolver(),
      totalTimeoutMs: this.requestTimeoutResolver(),
      onDiagnostic: (event, stage, details) =>
        logOllamaDiagnostic(diagnostics, event, stage, details),
    });

    try {
      logOllamaDiagnostic(diagnostics, "provider_request_started", "provider_request", {});
      logOllamaDiagnostic(diagnostics, "provider_request_shape", "provider_request", {
        method: "POST",
        endpoint: `${baseUrl}/api/chat`,
        payloadKeys: Object.keys(buildOllamaChatBody(request, model, false)).sort(),
      });
      logOllamaDiagnostic(diagnostics, "ollama_fetch_started", "provider_request", {});
      const requestBody = buildOllamaChatBody(request, model, false);
      const response = await this.fetchImpl(
        `${baseUrl}/api/chat`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(requestBody),
          signal: execution.signal,
        },
      );
      execution.markConnected();
      logOllamaDiagnostic(diagnostics, "ollama_headers_received", "connect", {
        statusCode: response.status,
      });

      await throwForHttpError(response, {
        provider: this.providerId,
        model,
        onDiagnostic: (details) =>
          logOllamaDiagnostic(diagnostics, "provider_error", "provider_request", details),
      });
      assertJsonLikeContentType(response, {
        provider: this.providerId,
        model,
        expected: "json",
      });

      const parsed = await parseJsonResponse<OllamaChatResponseLike>(response, {
        provider: this.providerId,
        model,
      });
      logOllamaDiagnostic(diagnostics, "generation_completed", "generate", {});

      if (!parsed.message || typeof parsed.message.content !== "string") {
        throw createUnexpectedFormatError(
          model,
          "O corpo de generate nao contem message.content textual.",
        );
      }

      return {
        text: parsed.message.content,
        provider: this.providerId,
        model: parsed.model ?? model,
        usage: mapUsage(parsed),
        finishReason: mapFinishReason(parsed.done_reason),
      };
    } catch (error) {
      logOllamaDiagnostic(diagnostics, "provider_error", "generate", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      const timeoutStage = execution.timedOutStage();
      const timeoutPhase = execution.timedOutPhase();
      if (timeoutStage && timeoutPhase) {
        throw createTimeoutError(model, timeoutStage, timeoutPhase);
      }

      if (execution.cancelledByClient()) {
        throw toOllamaProviderError(
          new DOMException("aborted", "AbortError"),
          {
            provider: this.providerId,
            model,
          },
        );
      }

      throw toOllamaProviderError(error, {
        provider: this.providerId,
        model,
      });
    } finally {
      logOllamaDiagnostic(diagnostics, "response_stream_closed", "generate", {});
      execution.cleanup();
    }
  }

  async *stream(request: AIChatRequest): AsyncIterable<AIStreamEvent> {
    const model = getRequestedModel(request, this.defaultModelResolver());
    const baseUrl = this.baseUrlResolver();
    const diagnostics = createOllamaDiagnosticContext(request, model, baseUrl);
    let sawFirstChunk = false;
    let sawFirstToken = false;
    const execution = createRequestExecutionContext(request, {
      connectTimeoutMs: this.connectTimeoutResolver(),
      firstTokenTimeoutMs: this.firstTokenTimeoutResolver(),
      idleTimeoutMs: this.idleTimeoutResolver(),
      totalTimeoutMs: this.requestTimeoutResolver(),
      onDiagnostic: (event, stage, details) =>
        logOllamaDiagnostic(diagnostics, event, stage, details),
    });

    try {
      logOllamaDiagnostic(diagnostics, "provider_request_started", "provider_stream", {});
      const requestBody = buildOllamaChatBody(request, model, true);
      logOllamaDiagnostic(diagnostics, "provider_request_shape", "provider_stream", {
        method: "POST",
        endpoint: `${baseUrl}/api/chat`,
        payloadKeys: Object.keys(requestBody).sort(),
        messageRoles: requestBody.messages.map((message) => message.role),
        hasOptions: Boolean(requestBody.options),
        optionKeys: requestBody.options ? Object.keys(requestBody.options).sort() : [],
      });
      logOllamaDiagnostic(diagnostics, "ollama_fetch_started", "provider_stream", {});
      const response = await this.fetchImpl(
        `${baseUrl}/api/chat`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(requestBody),
          signal: execution.signal,
        },
      );
      execution.markConnected();
      logOllamaDiagnostic(diagnostics, "ollama_headers_received", "connect", {
        statusCode: response.status,
      });

      await throwForHttpError(response, {
        provider: this.providerId,
        model,
        onDiagnostic: (details) =>
          logOllamaDiagnostic(diagnostics, "provider_error", "provider_stream", details),
      });
      assertJsonLikeContentType(response, {
        provider: this.providerId,
        model,
        expected: "ndjson",
      });

      if (!response.body) {
        throw toOllamaProviderError(new Error("missing response body"), {
          provider: this.providerId,
          model,
          statusCode: response.status,
          metadata: { reason: "body-missing" },
        });
      }
      logOllamaDiagnostic(diagnostics, "stream_reader_created", "provider_stream", {});

      yield {
        type: "start",
        provider: this.providerId,
        model,
      };

      let finishEvent: Extract<AIStreamEvent, { type: "finish" }> | null = null;
      let usageEvent: Extract<AIStreamEvent, { type: "usage" }> | null = null;

      for await (const event of parseNdjsonStream(response.body, model, {
        onChunk: (chunk) => {
          if (!sawFirstChunk) {
            sawFirstChunk = true;
            logOllamaDiagnostic(diagnostics, "first_chunk_received", "provider_stream", {
              byteLength: chunk.byteLength,
            });
            return;
          }

          logOllamaDiagnostic(diagnostics, "chunk_received", "provider_stream", {
            byteLength: chunk.byteLength,
          });
        },
      })) {
        execution.markChunkReceived();

        if (finishEvent) {
          throw createPostFinishStreamError(model);
        }

        if (typeof (event as { error?: unknown }).error === "string") {
          throw toOllamaProviderError(
            { message: String((event as { error?: unknown }).error) },
            {
              provider: this.providerId,
              model,
              metadata: { reason: "provider-stream-error" },
            },
          );
        }

        if (typeof event.message?.content === "string" && event.message.content) {
          if (!sawFirstToken) {
            sawFirstToken = true;
            logOllamaDiagnostic(diagnostics, "first_token_received", "provider_stream", {});
          }
          yield {
            type: "text-delta",
            textDelta: event.message.content,
          };
        }

        if (event.done) {
          const usage = mapUsage(event);
          if (usage) {
            usageEvent = {
              type: "usage",
              usage,
            };
          }

          finishEvent = {
            type: "finish",
            finishReason: mapFinishReason(event.done_reason),
            ...(usage ? { usage } : {}),
          };
        }
      }

      if (usageEvent) {
        yield usageEvent;
      }

      if (finishEvent) {
        logOllamaDiagnostic(diagnostics, "stream_completed", "provider_stream", {});
        yield finishEvent;
        return;
      }

      throw toOllamaProviderError(new Error("stream ended without finish"), {
        provider: this.providerId,
        model,
        metadata: { reason: "stream-without-finish" },
      });
    } catch (error) {
      logOllamaDiagnostic(diagnostics, "provider_error", "provider_stream", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      const timeoutStage = execution.timedOutStage();
      const timeoutPhase = execution.timedOutPhase();
      if (timeoutStage && timeoutPhase) {
        throw createTimeoutError(model, timeoutStage, timeoutPhase);
      }

      if (execution.cancelledByClient()) {
        throw toOllamaProviderError(
          new DOMException("aborted", "AbortError"),
          {
            provider: this.providerId,
            model,
          },
        );
      }

      throw toOllamaProviderError(error, {
        provider: this.providerId,
        model,
      });
    } finally {
      logOllamaDiagnostic(diagnostics, "response_stream_closed", "provider_stream", {});
      execution.cleanup();
    }
  }

  async healthCheck(): Promise<AIProviderHealth> {
    const request: AIChatRequest = { messages: [{ role: "user", text: "ping" }] };
    const execution = createRequestExecutionContext(request, {
      connectTimeoutMs: this.connectTimeoutResolver(),
      totalTimeoutMs: this.requestTimeoutResolver(),
    });
    const model = this.defaultModelResolver();

    try {
      const response = await this.fetchImpl(
        `${this.baseUrlResolver()}/api/tags`,
        {
          method: "GET",
          signal: execution.signal,
        },
      );
      execution.markConnected();

      await throwForHttpError(response, {
        provider: this.providerId,
        model,
      });

      const parsed = await parseJsonResponse<OllamaTagsResponseLike>(response, {
        provider: this.providerId,
        model,
      });

      return {
        ok: Array.isArray(parsed.models),
        provider: this.providerId,
        message: "Endpoint de modelos do Ollama respondeu com sucesso.",
        metadata: {
          strategy: "tags-endpoint",
          defaultModel: model,
          modelCount: Array.isArray(parsed.models) ? parsed.models.length : 0,
        },
      };
    } catch (error) {
      const timeoutStage = execution.timedOutStage();
      const timeoutPhase = execution.timedOutPhase();
      const normalized = timeoutStage && timeoutPhase
        ? createTimeoutError(model, timeoutStage, timeoutPhase)
        : toOllamaProviderError(error, {
            provider: this.providerId,
            model,
          });

      return {
        ok: false,
        provider: this.providerId,
        message: normalized.message,
        metadata: {
          strategy: "tags-endpoint",
          code: normalized.code,
          defaultModel: model,
        },
      };
    } finally {
      execution.cleanup();
    }
  }

  async listModels(): Promise<AIModelInfo[]> {
    const model = this.defaultModelResolver();
    const response = await this.fetchImpl(`${this.baseUrlResolver()}/api/tags`, {
      method: "GET",
    });

    await throwForHttpError(response, {
      provider: this.providerId,
      model,
    });

    const parsed = await parseJsonResponse<OllamaTagsResponseLike>(response, {
      provider: this.providerId,
      model,
    });

    return [...(parsed.models ?? [])]
      .map(mapTagToModelInfo)
      .filter((item): item is AIModelInfo => Boolean(item))
      .sort((left, right) => left.id.localeCompare(right.id));
  }
}
