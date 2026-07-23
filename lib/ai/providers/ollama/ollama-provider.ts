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

export interface OllamaProviderOptions {
  fetch?: OllamaFetch;
  baseUrl?: string;
  defaultModel?: string;
  connectTimeoutMs?: number;
  requestTimeoutMs?: number;
  baseUrlResolver?: () => string;
  defaultModelResolver?: () => string;
  connectTimeoutResolver?: () => number;
  requestTimeoutResolver?: () => number;
}

interface RequestExecutionContext {
  signal: AbortSignal;
  markConnected: () => void;
  cleanup: () => void;
  timedOutStage: () => "connect" | "request" | null;
  cancelledByClient: () => boolean;
}

function createRequestExecutionContext(
  request: AIChatRequest,
  options: {
    connectTimeoutMs: number;
    requestTimeoutMs: number;
  },
): RequestExecutionContext {
  const controller = new AbortController();
  let timeoutStage: "connect" | "request" | null = null;
  let cancelledByClient = false;
  let connected = false;
  const listeners: Array<() => void> = [];

  if (request.signal) {
    if (request.signal.aborted) {
      cancelledByClient = true;
      controller.abort();
    } else {
      const onAbort = () => {
        cancelledByClient = true;
        controller.abort();
      };
      request.signal.addEventListener("abort", onAbort, { once: true });
      listeners.push(() => request.signal?.removeEventListener("abort", onAbort));
    }
  }

  const requestTimeoutMs =
    typeof request.timeoutMs === "number" && request.timeoutMs > 0
      ? request.timeoutMs
      : options.requestTimeoutMs;

  const connectTimeout = setTimeout(() => {
    if (!connected && !controller.signal.aborted && timeoutStage === null) {
      timeoutStage = "connect";
      controller.abort();
    }
  }, options.connectTimeoutMs);

  const requestTimeout = setTimeout(() => {
    if (!controller.signal.aborted && timeoutStage === null) {
      timeoutStage = connected ? "request" : "connect";
      controller.abort();
    }
  }, requestTimeoutMs);

  return {
    signal: controller.signal,
    markConnected: () => {
      if (connected) return;
      connected = true;
      clearTimeout(connectTimeout);
    },
    cleanup: () => {
      clearTimeout(connectTimeout);
      clearTimeout(requestTimeout);
      for (const remove of listeners) remove();
    },
    timedOutStage: () => timeoutStage,
    cancelledByClient: () => cancelledByClient,
  };
}

function createTimeoutError(model: string, stage: "connect" | "request") {
  return new AIProviderError({
    code: "timeout",
    message:
      stage === "connect"
        ? "O Ollama demorou mais que o permitido para aceitar a conexao."
        : "O Ollama demorou mais que o permitido para responder.",
    provider: OLLAMA_PROVIDER_ID,
    model,
    retryable: true,
    metadata: { stage },
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
    this.requestTimeoutResolver =
      options.requestTimeoutResolver ??
      (() => options.requestTimeoutMs ?? 45_000);
  }

  supports(capability: AIProviderCapability): boolean {
    return this.capabilities.supported.includes(capability);
  }

  async generate(request: AIChatRequest): Promise<AIChatResponse> {
    const model = getRequestedModel(request, this.defaultModelResolver());
    const execution = createRequestExecutionContext(request, {
      connectTimeoutMs: this.connectTimeoutResolver(),
      requestTimeoutMs: this.requestTimeoutResolver(),
    });

    try {
      const response = await this.fetchImpl(
        `${this.baseUrlResolver()}/api/chat`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(buildOllamaChatBody(request, model, false)),
          signal: execution.signal,
        },
      );
      execution.markConnected();

      await throwForHttpError(response, {
        provider: this.providerId,
        model,
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
      const timeoutStage = execution.timedOutStage();
      if (timeoutStage) {
        throw createTimeoutError(model, timeoutStage);
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
      execution.cleanup();
    }
  }

  async *stream(request: AIChatRequest): AsyncIterable<AIStreamEvent> {
    const model = getRequestedModel(request, this.defaultModelResolver());
    const execution = createRequestExecutionContext(request, {
      connectTimeoutMs: this.connectTimeoutResolver(),
      requestTimeoutMs: this.requestTimeoutResolver(),
    });

    try {
      const response = await this.fetchImpl(
        `${this.baseUrlResolver()}/api/chat`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(buildOllamaChatBody(request, model, true)),
          signal: execution.signal,
        },
      );
      execution.markConnected();

      await throwForHttpError(response, {
        provider: this.providerId,
        model,
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

      yield {
        type: "start",
        provider: this.providerId,
        model,
      };

      let finishEvent: Extract<AIStreamEvent, { type: "finish" }> | null = null;
      let usageEvent: Extract<AIStreamEvent, { type: "usage" }> | null = null;

      for await (const event of parseNdjsonStream(response.body, model)) {
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
        yield finishEvent;
        return;
      }

      throw toOllamaProviderError(new Error("stream ended without finish"), {
        provider: this.providerId,
        model,
        metadata: { reason: "stream-without-finish" },
      });
    } catch (error) {
      const timeoutStage = execution.timedOutStage();
      if (timeoutStage) {
        throw createTimeoutError(model, timeoutStage);
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
      execution.cleanup();
    }
  }

  async healthCheck(): Promise<AIProviderHealth> {
    const request: AIChatRequest = { messages: [{ role: "user", text: "ping" }] };
    const execution = createRequestExecutionContext(request, {
      connectTimeoutMs: this.connectTimeoutResolver(),
      requestTimeoutMs: this.requestTimeoutResolver(),
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
      const normalized = execution.timedOutStage()
        ? createTimeoutError(model, execution.timedOutStage() as "connect" | "request")
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
