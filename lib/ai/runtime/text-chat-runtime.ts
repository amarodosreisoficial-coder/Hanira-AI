import {
  toPublicAIError,
  type PublicAIError,
  type TextRuntimeProviderErrorLike,
} from "@/lib/ai/runtime/public-ai-errors";

// Temporary structural contracts for Pacote 08B.
// The canonical AI Engine contracts live outside this package.
// After combining packages, imports should point to lib/ai/provider.ts and lib/ai/types.ts.
export interface TextRuntimeTextPart {
  type: "text";
  text: string;
}

export interface TextRuntimeImagePart {
  type: "image";
  imageUrl?: string;
}

export interface TextRuntimeFilePart {
  type: "file";
  mimeType?: string;
  name?: string;
}

export type TextRuntimeMessagePart =
  | TextRuntimeTextPart
  | TextRuntimeImagePart
  | TextRuntimeFilePart;

export interface TextRuntimeMessage {
  role: "system" | "user" | "assistant";
  content: string | TextRuntimeMessagePart[];
}

export interface TextRuntimeRequest {
  conversationId?: string;
  messages: TextRuntimeMessage[];
  metadata?: Record<string, unknown>;
  requiredCapabilities?: string[];
}

export interface TextRuntimeUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export type TextRuntimeStreamEvent =
  | { type: "start" }
  | { type: "text-delta"; text: string }
  | { type: "usage"; usage: TextRuntimeUsage }
  | { type: "finish"; finishReason?: string; usage?: TextRuntimeUsage }
  | { type: "error"; error: TextRuntimeProviderErrorLike };

export interface TextRuntimeProvider {
  stream(
    request: TextRuntimeRequest,
    options?: { signal?: AbortSignal },
  ): AsyncIterable<TextRuntimeStreamEvent> | Promise<AsyncIterable<TextRuntimeStreamEvent>>;
}

export type TextChatSSEEvent =
  | { type: "start"; conversationId: string; requestId?: string }
  | { type: "delta"; delta: string }
  | { type: "done"; conversationId: string; requestId?: string }
  | { type: "error"; message: string; requestId?: string };

export interface TextChatRuntimeAdapter {
  emit(event: string): void | Promise<void>;
}

export interface TextChatRuntimeOptions {
  provider: TextRuntimeProvider;
  request: TextRuntimeRequest;
  conversationId: string;
  requestId?: string;
  sse?: TextChatRuntimeAdapter;
  signal?: AbortSignal;
}

export interface TextChatRuntimeResult {
  text: string;
  finishReason?: string;
  usage?: TextRuntimeUsage;
  completed: boolean;
  cancelled: boolean;
}

export function serializeTextChatSSEEvent(event: TextChatSSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

async function emitSSE(
  adapter: TextChatRuntimeAdapter | undefined,
  event: TextChatSSEEvent,
) {
  if (!adapter) return;
  await adapter.emit(serializeTextChatSSEEvent(event));
}

function mergeUsage(
  previous: TextRuntimeUsage | undefined,
  next: TextRuntimeUsage | undefined,
) {
  if (!previous) return next;
  if (!next) return previous;
  return { ...previous, ...next };
}

function createCancelledResult(
  text: string,
  finishReason?: string,
  usage?: TextRuntimeUsage,
): TextChatRuntimeResult {
  return {
    text,
    finishReason,
    usage,
    completed: false,
    cancelled: true,
  };
}

function isSignalCancelled(signal?: AbortSignal) {
  return Boolean(signal?.aborted);
}

export async function runTextChatRuntime(
  options: TextChatRuntimeOptions,
): Promise<TextChatRuntimeResult> {
  const { provider, request, conversationId, requestId, sse, signal } = options;
  let text = "";
  let finishReason: string | undefined;
  let usage: TextRuntimeUsage | undefined;
  let finished = false;
  let started = false;

  if (isSignalCancelled(signal)) {
    return createCancelledResult(text, finishReason, usage);
  }

  try {
    const stream = await provider.stream(request, { signal });

    for await (const event of stream) {
      if (isSignalCancelled(signal)) {
        return createCancelledResult(text, finishReason, usage);
      }

      if (event.type === "start") {
        if (!started) {
          started = true;
          await emitSSE(sse, {
            type: "start",
            conversationId,
            requestId,
          });
        }
        continue;
      }

      if (event.type === "text-delta") {
        if (!event.text) continue;
        text += event.text;
        await emitSSE(sse, { type: "delta", delta: event.text });
        continue;
      }

      if (event.type === "usage") {
        usage = mergeUsage(usage, event.usage);
        continue;
      }

      if (event.type === "finish") {
        usage = mergeUsage(usage, event.usage);
        if (finished) continue;
        finished = true;
        finishReason = event.finishReason;
        await emitSSE(sse, {
          type: "done",
          conversationId,
          requestId,
        });
        return {
          text,
          finishReason,
          usage,
          completed: true,
          cancelled: false,
        };
      }

      const publicError = toPublicAIError(event.error);
      if (publicError.cancelled) {
        return createCancelledResult(text, finishReason, usage);
      }
      await emitSSE(sse, {
        type: "error",
        message: publicError.message,
        requestId,
      });
      throw publicError;
    }

    return {
      text,
      finishReason,
      usage,
      completed: finished,
      cancelled: false,
    };
  } catch (error) {
    const publicError = isPublicAIError(error) ? error : toPublicAIError(error);
    if (publicError.cancelled || isSignalCancelled(signal)) {
      return createCancelledResult(text, finishReason, usage);
    }
    await emitSSE(sse, {
      type: "error",
      message: publicError.message,
      requestId,
    });
    throw publicError;
  }
}

function isPublicAIError(error: unknown): error is PublicAIError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error &&
    "cancelled" in error
  );
}
