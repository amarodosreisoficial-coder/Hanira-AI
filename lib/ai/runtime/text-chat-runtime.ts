import type { AIProvider } from "@/lib/ai/provider";
import { logAIProviderErrorThrown } from "@/lib/ai/ai-provider-error-logging";
import type {
  AIChatRequest,
  AIProviderCapability,
  AIStreamEvent,
} from "@/lib/ai/types";
import { AIProviderError } from "@/lib/ai/types";
import { toPublicAIError } from "@/lib/ai/runtime/public-ai-errors";
import { shouldUseTextAIProvider } from "@/lib/ai/runtime/text-chat-eligibility";

export interface TextChatContextMessage {
  role: "user" | "assistant";
  content: string;
}

export interface OllamaEligibilityOptions {
  ollamaEnabled: boolean;
  attachmentCount: number | string | null | undefined;
  imageAttachmentCount: number | string | null | undefined;
  requiresUnsupportedCapability?: boolean;
  request?: AIChatRequest;
  supportedCapabilities?: readonly AIProviderCapability[];
}

export interface OllamaEligibilityDiagnostics {
  eligible: boolean;
  reason: string;
  attachmentCount: number;
  imageAttachmentCount: number;
  messageCount: number;
  roles: string[];
  contentFieldTypes: string[];
  hasTools: boolean;
  hasMultimodalInput: boolean;
  hasMetadata: boolean;
  hasCapabilities: boolean;
  conditions: {
    ollamaEnabled: boolean;
    attachmentCountIsZero: boolean;
    imageAttachmentCountIsZero: boolean;
    requiresUnsupportedCapabilityIsFalse: boolean;
  };
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

function normalizeEligibilityCount(value: number | string | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : Number.NaN;
  }
  if (typeof value === "string" && value.trim()) {
    return Number(value);
  }
  return 0;
}

export function getOllamaTextProviderEligibility(
  options: OllamaEligibilityOptions,
) : OllamaEligibilityDiagnostics {
  const attachmentCount = normalizeEligibilityCount(options.attachmentCount);
  const imageAttachmentCount = normalizeEligibilityCount(options.imageAttachmentCount);
  const messages = Array.isArray(options.request?.messages) ? options.request.messages : [];
  const roles = messages.map((message) => String(message.role));
  const contentFieldTypes = messages.map((message) => typeof message.text);
  const hasTools = Boolean(
    (options.request as AIChatRequest & { tools?: unknown } | undefined)?.tools,
  );
  const hasMultimodalInput = messages.some(
    (message) => typeof message.text !== "string",
  );
  const hasMetadata = Boolean(options.request?.metadata);
  const hasCapabilities = Boolean(options.supportedCapabilities?.length);
  const conditions = {
    ollamaEnabled: options.ollamaEnabled,
    attachmentCountIsZero: attachmentCount === 0,
    imageAttachmentCountIsZero: imageAttachmentCount === 0,
    requiresUnsupportedCapabilityIsFalse: !options.requiresUnsupportedCapability,
  };
  const result = shouldUseTextAIProvider({
    featureEnabled: conditions.ollamaEnabled,
    hasImage: !conditions.imageAttachmentCountIsZero,
    hasAttachments: !conditions.attachmentCountIsZero,
    hasMultimodalContent:
      hasMultimodalInput || !conditions.requiresUnsupportedCapabilityIsFalse,
    supportedCapabilities: options.supportedCapabilities
      ? [...options.supportedCapabilities]
      : undefined,
  });

  return {
    eligible:
      result.eligible &&
      conditions.attachmentCountIsZero &&
      conditions.imageAttachmentCountIsZero &&
      conditions.requiresUnsupportedCapabilityIsFalse,
    reason: result.reason,
    attachmentCount,
    imageAttachmentCount,
    messageCount: messages.length,
    roles,
    contentFieldTypes,
    hasTools,
    hasMultimodalInput,
    hasMetadata,
    hasCapabilities,
    conditions,
  };
}

export function shouldUseOllamaTextProvider(
  options: OllamaEligibilityOptions,
) {
  return getOllamaTextProviderEligibility(options).eligible;
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

  if (error.code === "unsupported_capability") {
    return {
      status: 400,
      type: "LocalAIUnsupportedCapability",
      message: "Nao foi possivel processar esta solicitacao.",
    };
  }

  if (error.code === "content_rejected") {
    return {
      status: 400,
      type: "LocalAIContentRejected",
      message: "A Hanira nao conseguiu responder a esse pedido.",
    };
  }

  if (error.code === "rate_limit") {
    return {
      status: 429,
      type: "LocalAIRateLimit",
      message: "O motor local da Hanira nao esta disponivel no momento.",
    };
  }

  const publicError = toPublicAIError(error);
  return {
    status: publicError.status,
    type:
      publicError.code === "timeout"
        ? "LocalAITimeout"
        : publicError.code === "unavailable"
          ? "LocalAIUnavailable"
          : publicError.code === "model_not_found"
            ? "LocalAIModelNotInstalled"
            : publicError.code === "invalid_request"
              ? "LocalAIInvalidRequest"
              : publicError.code === "provider_error"
                ? "LocalAIInvalidResponse"
                : publicError.code === "cancelled"
                  ? "LocalAICancelled"
                  : "LocalAIUnknownError",
    message:
      publicError.code === "cancelled"
        ? "A resposta foi interrompida."
        : publicError.message,
  };
}

function isExternalCancellation(error: unknown, request: Request) {
  return (
    request.signal.aborted &&
    error instanceof AIProviderError &&
    error.code === "cancelled"
  );
}

function createInvalidStreamEventError(providerId: string) {
  logAIProviderErrorThrown({
    sourceFile: "lib/ai/runtime/text-chat-runtime.ts",
    sourceLine: 165,
    reason: "text_chat_runtime_invalid_stream_event",
  });
  return new AIProviderError({
    code: "provider_error",
    message: "O provider retornou um evento de stream invalido.",
    provider: providerId,
    retryable: true,
  });
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

          if (event.type !== "finish") {
            throw createInvalidStreamEventError(options.provider.providerId);
          }

          if (!assistantContent.trim()) {
            throw createInvalidStreamEventError(options.provider.providerId);
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
          logAIProviderErrorThrown({
            sourceFile: "lib/ai/runtime/text-chat-runtime.ts",
            sourceLine: 233,
            reason: "text_chat_runtime_stream_ended_without_finish",
            requestId: options.requestId,
          });
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
