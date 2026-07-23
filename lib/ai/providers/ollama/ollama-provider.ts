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
  baseUrlResolver?: () => string;
  defaultModelResolver?: () => string;
}

interface RequestExecutionContext {
  signal: AbortSignal;
  cleanup: () => void;
  didTimeout: () => boolean;
}

function createRequestExecutionContext(
  request: AIChatRequest,
): RequestExecutionContext {
  const controller = new AbortController();
  let timedOut = false;
  const listeners: Array<() => void> = [];

  if (request.signal) {
    if (request.signal.aborted) {
      controller.abort();
    } else {
      const onAbort = () => controller.abort();
      request.signal.addEventListener("abort", onAbort, { once: true });
      listeners.push(() => request.signal?.removeEventListener("abort", onAbort));
    }
  }

  const timeout =
    typeof request.timeoutMs === "number" && request.timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, request.timeoutMs)
      : null;

  return {
    signal: controller.signal,
    cleanup: () => {
      if (timeout) clearTimeout(timeout);
      for (const remove of listeners) remove();
    },
    didTimeout: () => timedOut,
  };
}

function createTimeoutError(model: string) {
  return new AIProviderError({
    code: "timeout",
    message: "O Ollama demorou mais que o permitido.",
    provider: OLLAMA_PROVIDER_ID,
    model,
    retryable: true,
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
        metadata: { reason: "invalid-json", line: trimmed },
      });
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    while (true) {
      const newlineIndex = buffer.search(/\r?\n/);
      if (newlineIndex === -1) break;

      const rawLine = buffer.slice(0, newlineIndex);
      const newlineLength = buffer[newlineIndex] === "\r" && buffer[newlineIndex + 1] === "\n"
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

  constructor(options: OllamaProviderOptions = {}) {
    this.fetchImpl = options.fetch ?? fetch;
    this.baseUrlResolver =
      options.baseUrlResolver ??
      (() => normalizeBaseUrl(options.baseUrl ?? DEFAULT_OLLAMA_BASE_URL));
    this.defaultModelResolver =
      options.defaultModelResolver ??
      (() => options.defaultModel ?? DEFAULT_OLLAMA_MODEL);
  }

  supports(capability: AIProviderCapability): boolean {
    return this.capabilities.supported.includes(capability);
  }

  async generate(request: AIChatRequest): Promise<AIChatResponse> {
    const model = getRequestedModel(request, this.defaultModelResolver());
    const execution = createRequestExecutionContext(request);

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

      await throwForHttpError(response, {
        provider: this.providerId,
        model,
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
      if (execution.didTimeout()) {
        throw createTimeoutError(model);
      }

      throw toOllamaProviderError(error, {
        provider: this.providerId,
        model,
        timedOut: execution.didTimeout(),
      });
    } finally {
      execution.cleanup();
    }
  }

  async *stream(request: AIChatRequest): AsyncIterable<AIStreamEvent> {
    const model = getRequestedModel(request, this.defaultModelResolver());
    const execution = createRequestExecutionContext(request);

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

      await throwForHttpError(response, {
        provider: this.providerId,
        model,
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

      for await (const event of parseNdjsonStream(response.body, model)) {
        if (typeof event.message?.content === "string" && event.message.content) {
          yield {
            type: "text-delta",
            textDelta: event.message.content,
          };
        }

        if (event.done) {
          const usage = mapUsage(event);
          if (usage) {
            yield {
              type: "usage",
              usage,
            };
          }

          yield {
            type: "finish",
            finishReason: mapFinishReason(event.done_reason),
            ...(usage ? { usage } : {}),
          };
          return;
        }
      }

      yield {
        type: "finish",
        finishReason: "unknown",
      };
    } catch (error) {
      if (execution.didTimeout()) {
        throw createTimeoutError(model);
      }

      throw toOllamaProviderError(error, {
        provider: this.providerId,
        model,
        timedOut: execution.didTimeout(),
      });
    } finally {
      execution.cleanup();
    }
  }

  async healthCheck(): Promise<AIProviderHealth> {
    const request: AIChatRequest = { messages: [{ role: "user", text: "ping" }] };
    const execution = createRequestExecutionContext(request);
    const model = this.defaultModelResolver();

    try {
      const response = await this.fetchImpl(
        `${this.baseUrlResolver()}/api/tags`,
        {
          method: "GET",
          signal: execution.signal,
        },
      );

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
      const normalized = execution.didTimeout()
        ? createTimeoutError(model)
        : toOllamaProviderError(error, {
            provider: this.providerId,
            model,
            timedOut: execution.didTimeout(),
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
