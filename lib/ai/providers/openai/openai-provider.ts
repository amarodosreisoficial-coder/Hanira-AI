import type { AIProvider, AIProviderHealth } from "@/lib/ai/provider";
import type {
  AIChatRequest,
  AIChatResponse,
  AIModelInfo,
  AIProviderCapability,
  AIStreamEvent,
} from "@/lib/ai/types";
import { AIProviderError } from "@/lib/ai/types";
import { toOpenAIProviderError } from "./openai-errors";
import {
  buildOpenAIChatParams,
  ensureStreamFinished,
  getRequestedModel,
  mapConfiguredModelToModelInfo,
  mapOpenAIResponseToAIChatResponse,
  mapUsage,
  OPENAI_PROVIDER_ID,
  OPENAI_TEXT_CAPABILITIES,
  type OpenAIResponseLike,
  type OpenAIStreamEventLike,
} from "./openai-mappers";

export interface OpenAIResponsesClientLike {
  responses: {
    create(
      params: unknown,
      options?: { signal?: AbortSignal },
    ): Promise<unknown>;
  };
}

export interface OpenAIProviderOptions {
  client?: OpenAIResponsesClientLike;
  clientFactory?: () => OpenAIResponsesClientLike;
  defaultModel?: string;
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
    message: "O provider demorou mais que o permitido.",
    provider: OPENAI_PROVIDER_ID,
    model,
    retryable: true,
  });
}

export class OpenAIProvider implements AIProvider {
  readonly providerId = OPENAI_PROVIDER_ID;
  readonly displayName = "OpenAI";
  readonly capabilities = OPENAI_TEXT_CAPABILITIES;

  private readonly clientFactory: () => OpenAIResponsesClientLike;
  private readonly defaultModelResolver: () => string;

  constructor(options: OpenAIProviderOptions = {}) {
    this.clientFactory =
      options.clientFactory ??
      (options.client
        ? () => options.client as OpenAIResponsesClientLike
        : () => {
            throw new AIProviderError({
              code: "authentication",
              message:
                "OpenAIProvider requer client, clientFactory ou fábrica padrão explícita.",
              provider: OPENAI_PROVIDER_ID,
              retryable: false,
            });
          });
    this.defaultModelResolver =
      options.defaultModelResolver ??
      (options.defaultModel
        ? () => options.defaultModel as string
        : () => {
            throw new AIProviderError({
              code: "model_not_found",
              message:
                "OpenAIProvider requer defaultModel ou defaultModelResolver.",
              provider: OPENAI_PROVIDER_ID,
              retryable: false,
            });
          });
  }

  supports(capability: AIProviderCapability): boolean {
    return this.capabilities.supported.includes(capability);
  }

  async generate(request: AIChatRequest): Promise<AIChatResponse> {
    const model = getRequestedModel(request, this.defaultModelResolver());
    const execution = createRequestExecutionContext(request);

    try {
      const response = (await this.clientFactory().responses.create(
        buildOpenAIChatParams(request, model, false),
        { signal: execution.signal },
      )) as OpenAIResponseLike;

      return mapOpenAIResponseToAIChatResponse(
        response,
        this.providerId,
        model,
      );
    } catch (error) {
      if (execution.didTimeout()) {
        throw createTimeoutError(model);
      }
      throw toOpenAIProviderError(error, {
        provider: this.providerId,
        model,
      });
    } finally {
      execution.cleanup();
    }
  }

  async *stream(request: AIChatRequest): AsyncIterable<AIStreamEvent> {
    const model = getRequestedModel(request, this.defaultModelResolver());
    const execution = createRequestExecutionContext(request);
    const emitted: AIStreamEvent[] = [];

    try {
      const stream = (await this.clientFactory().responses.create(
        buildOpenAIChatParams(request, model, true),
        { signal: execution.signal },
      )) as AsyncIterable<OpenAIStreamEventLike>;

      const start: AIStreamEvent = {
        type: "start",
        provider: this.providerId,
        model,
      };
      emitted.push(start);
      yield start;

      for await (const event of stream) {
        if (event.type === "response.output_text.delta") {
          const deltaEvent: AIStreamEvent = {
            type: "text-delta",
            textDelta: event.delta ?? "",
          };
          emitted.push(deltaEvent);
          yield deltaEvent;
          continue;
        }

        if (event.type === "response.completed") {
          const usage = mapUsage(event.response?.usage ?? event.usage);
          if (usage) {
            const usageEvent: AIStreamEvent = { type: "usage", usage };
            emitted.push(usageEvent);
            yield usageEvent;
          }

          const finishEvent: AIStreamEvent = {
            type: "finish",
            finishReason: mapOpenAIResponseToAIChatResponse(
              event.response ?? {},
              this.providerId,
              model,
            ).finishReason,
            ...(usage ? { usage } : {}),
          };
          emitted.push(finishEvent);
          yield finishEvent;
          continue;
        }

        if (
          event.type === "response.failed" ||
          event.type === "response.error" ||
          event.type === "error"
        ) {
          const errorEvent: AIStreamEvent = {
            type: "error",
            error: toOpenAIProviderError(event.error, {
              provider: this.providerId,
              model,
            }),
          };
          emitted.push(errorEvent);
          yield errorEvent;
          return;
        }
      }

      for (const extra of ensureStreamFinished(emitted, this.providerId, model)) {
        if (!emitted.includes(extra)) {
          yield extra;
        }
      }
    } catch (error) {
      const normalized =
        execution.didTimeout()
          ? createTimeoutError(model)
          : toOpenAIProviderError(error, {
              provider: this.providerId,
              model,
            });

      yield {
        type: "error",
        error: normalized,
      };
    } finally {
      execution.cleanup();
    }
  }

  async healthCheck(): Promise<AIProviderHealth> {
    try {
      const model = this.defaultModelResolver();
      const client = this.clientFactory();
      return {
        ok: Boolean(client && model),
        provider: this.providerId,
        message: model
          ? `Cliente disponível para o modelo textual configurado (${model}).`
          : "Nenhum modelo textual configurado.",
        metadata: { strategy: "client-and-config-check", model },
      };
    } catch (error) {
      const normalized = toOpenAIProviderError(error, {
        provider: this.providerId,
      });
      return {
        ok: false,
        provider: this.providerId,
        message: normalized.message,
        metadata: {
          strategy: "client-and-config-check",
          code: normalized.code,
        },
      };
    }
  }

  async listModels(): Promise<AIModelInfo[]> {
    const configuredModel = this.defaultModelResolver();
    return [
      mapConfiguredModelToModelInfo(
        configuredModel,
        this.providerId,
        this.capabilities.supported,
      ),
    ];
  }
}
