import type { AIProvider } from "@/lib/ai/provider";
import type {
  AIChatRequest,
  AIProviderErrorCode,
  AIStreamEvent,
} from "@/lib/ai/types";
import { AIProviderError } from "@/lib/ai/types";

export interface TextChatContextMessage {
  role: "user" | "assistant";
  content: string;
}

export interface OllamaEligibilityOptions {
  ollamaEnabled: boolean;
  attachmentCount: number;
  imageAttachmentCount: number;
  requiresUnsupportedCapability?: boolean;
}

export interface PublicTextChatError {
  status: number;
  type: string;
  message: string;
}

export interface CreateTextChatProviderResponseOptions {
  request: Request;
  provider: AIProvider;
  providerRequest: AIChatRequest;
  conversationId: string;
  requestId: string;
  mode: string;
  onComplete?: (result: {
    assistantContent: string;
    finishEvent: Extract<AIStreamEvent, { type: "finish" }>;
  }) => Promise<void> | void;
  onFailed?: (error: unknown, safeError: PublicTextChatError) => Promise<void> | void;
  onCancelled?: (context: { timedOut: boolean }) => Promise<void> | void;
}

export function streamEvent(type: string, data: Record<string, unknown> = {}) {
  return `data: ${JSON.stringify({ type, ...data })}\n\n`;
}

export function streamHeaders(conversationId: string, requestId: string) {
  return {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Conversation-Id": conversationId,
    "X-Request-ID": requestId,
    "X-Content-Type-Options": "nosniff",
  };
}

export function isOllamaTextProviderEnabled() {
  return process.env.AI_ENGINE_OLLAMA_ENABLED === "true";
}

export function shouldUseOllamaTextProvider(
  options: OllamaEligibilityOptions,
) {
  return (
    options.ollamaEnabled &&
    options.attachmentCount === 0 &&
    options.imageAttachmentCount === 0 &&
    !options.requiresUnsupportedCapability
  );
}

export function buildTextChatProviderRequest(options: {
  systemPrompt: string;
  personalization?: string;
  context: TextChatContextMessage[];
  model?: string;
}) {
  const systemText = [options.systemPrompt, options.personalization?.trim()]
    .filter(Boolean)
    .join("\n");

  return {
    ...(options.model ? { model: options.model } : {}),
    messages: [
      {
        role: "system" as const,
        text: systemText,
      },
      ...options.context.map((message) => ({
        role: message.role,
        text: message.content,
      })),
    ],
  } satisfies AIChatRequest;
}

export function toPublicTextChatError(error: unknown): PublicTextChatError {
  if (!(error instanceof AIProviderError)) {
    return {
      status: 500,
      type: "TextChatPersistenceError",
      message:
        "A resposta foi gerada, mas nao pode ser salva. Tente novamente.",
    };
  }

  const byCode: Record<AIProviderErrorCode, PublicTextChatError> = {
    authentication: {
      status: 503,
      type: "LocalAIUnavailable",
      message: "O motor local da Hanira nao esta disponivel no momento.",
    },
    authorization: {
      status: 503,
      type: "LocalAIUnavailable",
      message: "O motor local da Hanira nao esta disponivel no momento.",
    },
    rate_limit: {
      status: 429,
      type: "LocalAIRateLimit",
      message: "O motor local da Hanira nao esta disponivel no momento.",
    },
    timeout: {
      status: 408,
      type: "LocalAITimeout",
      message: "A Hanira demorou mais que o esperado para responder.",
    },
    unavailable: {
      status: 503,
      type: "LocalAIUnavailable",
      message: "O motor local da Hanira nao esta disponivel no momento.",
    },
    invalid_request: {
      status: 500,
      type: "LocalAIInvalidRequest",
      message: "O motor local da Hanira retornou uma resposta invalida.",
    },
    unsupported_capability: {
      status: 500,
      type: "LocalAIUnsupportedCapability",
      message: "O motor local da Hanira nao suporta este pedido no momento.",
    },
    model_not_found: {
      status: 503,
      type: "LocalAIModelNotInstalled",
      message: "O modelo local da Hanira ainda nao esta instalado.",
    },
    content_rejected: {
      status: 400,
      type: "LocalAIContentRejected",
      message: "A Hanira nao conseguiu responder a esse pedido.",
    },
    cancelled: {
      status: 499,
      type: "LocalAICancelled",
      message: "A resposta foi interrompida.",
    },
    provider_error: {
      status: 502,
      type: "LocalAIInvalidResponse",
      message: "O motor local da Hanira retornou uma resposta invalida.",
    },
    unknown: {
      status: 500,
      type: "LocalAIUnknownError",
      message: "O motor local da Hanira nao esta disponivel no momento.",
    },
  };

  return byCode[error.code];
}

function isExternalCancellation(error: unknown, request: Request) {
  return (
    request.signal.aborted &&
    error instanceof AIProviderError &&
    error.code === "cancelled"
  );
}

export function createTextChatProviderResponse(
  options: CreateTextChatProviderResponseOptions,
) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let assistantContent = "";
      let finished = false;
      let terminalSignaled = false;

      controller.enqueue(
        encoder.encode(
          streamEvent("start", {
            conversationId: options.conversationId,
            mode: options.mode,
            requestId: options.requestId,
          }),
        ),
      );

      try {
        for await (const event of options.provider.stream(options.providerRequest)) {
          if (event.type === "start" || event.type === "usage") {
            continue;
          }

          if (event.type === "text-delta") {
            assistantContent += event.textDelta;
            controller.enqueue(
              encoder.encode(streamEvent("delta", { delta: event.textDelta })),
            );
            continue;
          }

          if (event.type === "error") {
            throw event.error;
          }

          finished = true;
          await options.onComplete?.({
            assistantContent,
            finishEvent: event,
          });
          controller.enqueue(
            encoder.encode(
              streamEvent("done", { conversationId: options.conversationId }),
            ),
          );
          terminalSignaled = true;
          return;
        }

        if (!finished) {
          throw new AIProviderError({
            code: "provider_error",
            message: "O provider encerrou o stream sem finish.",
            provider: options.provider.providerId,
            retryable: true,
          });
        }
      } catch (error) {
        if (isExternalCancellation(error, options.request)) {
          await options.onCancelled?.({ timedOut: false });
          return;
        }

        const safeError = toPublicTextChatError(error);
        if (!terminalSignaled) {
          controller.enqueue(
            encoder.encode(
              streamEvent("error", {
                message: safeError.message,
                requestId: options.requestId,
              }),
            ),
          );
          terminalSignaled = true;
        }

        await options.onFailed?.(error, safeError);
      } finally {
        controller.close();
      }
    },
    cancel() {
      if (!options.request.signal.aborted) {
        try {
          (options.request.signal as AbortSignal).throwIfAborted?.();
        } catch {
          // Ignore cancellation exceptions on explicit stream cancel.
        }
      }
    },
  });

  return new Response(stream, {
    headers: streamHeaders(options.conversationId, options.requestId),
  });
}
