import { headers } from "next/headers";
import { ZodError } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import {
  buildTextChatProviderRequest,
  createTextChatProviderResponse,
  createTextChatRuntime,
  shouldUseOllamaTextProvider,
  streamEvent,
  streamHeaders,
  toPublicAIError,
} from "@/lib/ai/runtime";
import { buildSystemPrompt } from "@/lib/ai/runtime/system-prompt";
import { AIProviderError } from "@/lib/ai/types";
import {
  createRequestId,
  logServerEvent,
} from "@/lib/logging/server";
import { logLegacyConversationScopeUsed } from "@/lib/logging/project-events";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { chatRequestSchema } from "@/lib/validation/chat";
import { getOwnedAttachments } from "@/services/attachments";
import {
  ChatContextError,
  resolveProjectChatContext,
} from "@/services/chat-context";
import { saveExplicitMemory } from "@/services/memory";

const SYSTEM_PROMPT =
  "Voce e Hanira, uma inteligencia artificial elegante, acolhedora, inteligente e natural. Converse em portugues do Brasil por padrao. Seja clara, humana e util, sem fingir ser humana. Adapte profundidade, tom e vocabulario ao usuario. Use as memorias disponiveis somente quando forem relevantes.";

export async function POST(request: Request) {
  const startedAt = Date.now();
  let requestId = createRequestId(request);

  try {
    const user = await requireSessionUser();
    const payload = chatRequestSchema.parse(await request.json());
    requestId = payload.requestId ?? requestId;
    logServerEvent({
      level: "info",
      requestId,
      route: "/api/chat",
      event: "chat_request_received",
      status: 200,
      durationMs: Date.now() - startedAt,
      stage: "request_received",
    });
    const headerStore = await headers();
    const ip =
      headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      headerStore.get("x-real-ip") ??
      "unknown";
    const rate = checkRateLimit(`${user.id}:${ip}`);

    if (!rate.allowed) {
      logServerEvent({
        level: "warn",
        requestId,
        route: "/api/chat",
        event: "rate_limited",
        status: 429,
        durationMs: Date.now() - startedAt,
      });
      return Response.json(
        { error: "Muitas mensagens em pouco tempo. Aguarde um instante." },
        {
          status: 429,
          headers: {
            "Retry-After": String(rate.retryAfter),
            "X-Request-ID": requestId,
          },
        },
      );
    }

    if (user.demo) {
      return createDemoStream(request, payload, requestId, startedAt);
    }

    return await createChatStream(
      request,
      user.id,
      payload,
      requestId,
      startedAt,
    );
  } catch (error) {
    if (error instanceof ZodError) {
      logServerEvent({
        level: "warn",
        requestId,
        route: "/api/chat",
        event: "validation_failed",
        status: 400,
        durationMs: Date.now() - startedAt,
        errorType: "ValidationError",
      });
      return Response.json(
        {
          error: error.issues[0]?.message ?? "Mensagem invalida.",
          requestId,
        },
        { status: 400, headers: { "X-Request-ID": requestId } },
      );
    }

    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return Response.json(
        { error: "Faca login para conversar.", requestId },
        { status: 401, headers: { "X-Request-ID": requestId } },
      );
    }

    if (error instanceof ChatContextError) {
      logServerEvent({
        level: error.status >= 500 ? "error" : "warn",
        requestId,
        route: "/api/chat",
        event: "context_resolution_failed",
        status: error.status,
        durationMs: Date.now() - startedAt,
        errorType: error.code,
      });
      return Response.json(
        { error: error.message, requestId },
        {
          status: error.status,
          headers: { "X-Request-ID": requestId },
        },
      );
    }

    const publicError = toPublicAIError(error);
    const status = publicError.status;
    const message =
      publicError.message ||
      "A Hanira nao conseguiu responder agora. Tente novamente.";

    logServerEvent({
      level: "error",
      requestId,
      route: "/api/chat",
      event: "request_failed",
      status,
      durationMs: Date.now() - startedAt,
      errorType: error instanceof Error ? error.name : "UnknownError",
    });

    return Response.json(
      { error: message, requestId },
      {
        status,
        headers: { "X-Request-ID": requestId },
      },
    );
  }
}

function createDemoStream(
  request: Request,
  payload: {
    conversationId?: string;
    message: string;
    demoAttachments?: Array<{ type: "image" | "audio" }>;
  },
  requestId: string,
  startedAt: number,
) {
  const conversationId = payload.conversationId ?? crypto.randomUUID();
  const hasImages = payload.demoAttachments?.some(
    (attachment) => attachment.type === "image",
  );
  const subject = payload.message
    ? `"${payload.message.slice(0, 100)}${payload.message.length > 100 ? "..." : ""}"`
    : "o arquivo enviado";
  const answer = hasImages
    ? `Recebi ${subject} e o preview esta disponivel localmente. A imagem nao foi analisada por IA: a analise real exige servicos externos configurados.`
    : `Entendi. Voce quer explorar ${subject}. Estou em modo demonstracao. A transcricao e as respostas reais exigem os servicos configurados.`;
  const words = answer.match(/\S+\s*/g) ?? [answer];
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(
        encoder.encode(
          streamEvent("start", { conversationId, mode: "demo", requestId }),
        ),
      );

      for (const delta of words) {
        if (request.signal.aborted) break;
        controller.enqueue(encoder.encode(streamEvent("delta", { delta })));
        await new Promise((resolve) => setTimeout(resolve, 24));
      }

      if (!request.signal.aborted) {
        controller.enqueue(
          encoder.encode(streamEvent("done", { conversationId })),
        );
      }

      logServerEvent({
        level: "info",
        requestId,
        route: "/api/chat",
        event: request.signal.aborted ? "stream_cancelled" : "stream_completed",
        status: request.signal.aborted ? 499 : 200,
        durationMs: Date.now() - startedAt,
      });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: streamHeaders(conversationId, requestId),
  });
}

async function createChatStream(
  request: Request,
  userId: string,
  payload: {
    conversationId?: string;
    projectId?: string;
    message: string;
    requestId?: string;
    retry?: boolean;
    attachmentIds?: string[];
  },
  requestId: string,
  startedAt: number,
) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("UNAUTHENTICATED");

  logServerEvent({
    level: "info",
    requestId,
    route: "/api/chat",
    event: "context_resolution_started",
    status: 200,
    durationMs: Date.now() - startedAt,
    stage: "context_resolution",
  });

  const chatContext = await resolveProjectChatContext({
    supabase,
    requestId,
    userId,
    conversationId: payload.conversationId,
    userMessage: payload.message,
    projectId: payload.projectId,
  });
  const conversationId = chatContext.conversationId;

  logServerEvent({
    level: "info",
    requestId,
    projectId: chatContext.projectId,
    conversationId,
    route: "/api/chat",
    event: "context_resolution_completed",
    status: 200,
    durationMs: Date.now() - startedAt,
    stage: "context_resolution",
    ...(chatContext.legacyScopeUsed ? { legacyScopeUsed: true } : {}),
  });

  if (chatContext.legacyScopeUsed) {
    logLegacyConversationScopeUsed({
      requestId,
      route: "/api/chat",
      userId,
      projectId: chatContext.projectId,
      conversationId,
      durationMs: Date.now() - startedAt,
      legacyScopeUsed: true,
    });
  }

  const { data: existingRequest } = await supabase
    .from("messages")
    .select("id,role,content")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .eq("request_id", requestId);
  const existingAssistant = existingRequest?.find(
    (message) => message.role === "assistant",
  );

  if (existingAssistant) {
    return createStoredResponseStream(
      chatContext.projectId,
      conversationId,
      requestId,
      existingAssistant.content,
      startedAt,
    );
  }

  let shouldInsertUser = !existingRequest?.some(
    (message) => message.role === "user",
  );
  if (payload.retry && shouldInsertUser) {
    const { data: latestMessage } = await supabase
      .from("messages")
      .select("role,content")
      .eq("conversation_id", conversationId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (
      latestMessage?.role === "user" &&
      latestMessage.content === payload.message
    ) {
      shouldInsertUser = false;
    }
  }

  const attachments = await getOwnedAttachments({
    userId,
    conversationId,
    ids: payload.attachmentIds ?? [],
  });
  const imageAttachments = attachments.filter(
    (attachment) => attachment.type === "image",
  );

  let userMessageId = existingRequest?.find(
    (message) => message.role === "user",
  )?.id;
  if (shouldInsertUser) {
    const { data: insertedMessage, error: messageError } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        user_id: userId,
        role: "user",
        content: payload.message,
        request_id: requestId,
        metadata: { attachment_count: attachments.length },
      })
      .select("id")
      .single();
    if (messageError) throw messageError;
    userMessageId = insertedMessage.id;
  }

  if (attachments.length && userMessageId) {
    const { error: attachmentLinkError } = await supabase
      .from("attachments")
      .update({ message_id: userMessageId })
      .eq("user_id", userId)
      .eq("conversation_id", conversationId)
      .in(
        "id",
        attachments.map((attachment) => attachment.id),
      );
    if (attachmentLinkError) throw attachmentLinkError;
  }

  await supabase
    .from("conversations")
    .update({
      title: payload.message.slice(0, 60) || "Analise de midia",
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversationId)
    .eq("user_id", userId)
    .eq("title", "Uma nova conversa");

  const runtime = createTextChatRuntime();
  logServerEvent({
    level: "info",
    requestId,
    projectId: chatContext.projectId,
    conversationId,
    providerId: runtime.providerId,
    modelId: runtime.model,
    route: "/api/chat",
    event: "runtime_created",
    status: 200,
    durationMs: Date.now() - startedAt,
    stage: "runtime_created",
    details: {
      baseUrl: runtime.baseUrl,
      connectTimeoutMs: runtime.connectTimeoutMs,
      firstTokenTimeoutMs: runtime.firstTokenTimeoutMs,
      idleTimeoutMs: runtime.idleTimeoutMs,
      requestTimeoutMs: runtime.requestTimeoutMs,
    },
  });
  const eligible = shouldUseOllamaTextProvider({
    ollamaEnabled: true,
    attachmentCount: attachments.length,
    imageAttachmentCount: imageAttachments.length,
  });
  logServerEvent({
    level: eligible ? "info" : "warn",
    requestId,
    projectId: chatContext.projectId,
    conversationId,
    providerId: runtime.providerId,
    modelId: runtime.model,
    route: "/api/chat",
    event: eligible ? "ollama_eligibility_confirmed" : "ollama_eligibility_blocked",
    status: eligible ? 200 : 400,
    durationMs: Date.now() - startedAt,
    stage: "provider_selection",
    details: {
      attachmentCount: attachments.length,
      imageAttachmentCount: imageAttachments.length,
      hasMessage: Boolean(payload.message.trim()),
    },
  });

  if (!eligible) {
    throw new AIProviderError({
      code: "unsupported_capability",
      message:
        attachments.length > 0
          ? "O runtime principal atual aceita apenas chat textual sem anexos."
          : "O runtime principal atual aceita apenas chat textual simples.",
      provider: runtime.provider.providerId,
      model: runtime.model,
      retryable: false,
      metadata: {
        attachmentCount: attachments.length,
        imageAttachmentCount: imageAttachments.length,
      },
    });
  }

  logServerEvent({
    level: "info",
    requestId,
    projectId: chatContext.projectId,
    conversationId,
    providerId: runtime.providerId,
    modelId: runtime.model,
    route: "/api/chat",
    event: "generation_started",
    status: 200,
    durationMs: Date.now() - startedAt,
    stage: "provider_stream",
  });

  return createTextChatProviderResponse({
    request,
    provider: runtime.provider,
    providerRequest: {
      ...buildTextChatProviderRequest({
        systemPrompt: buildSystemPrompt({
          baseInstructions: SYSTEM_PROMPT,
          personalityInstructions: chatContext.personalityInstructions,
          projectLabel: chatContext.projectName,
          relevantMemories: chatContext.relevantMemories,
        }),
        context: chatContext.conversationMessages,
        model: runtime.model,
      }),
      signal: request.signal,
      timeoutMs: runtime.requestTimeoutMs,
      metadata: {
        projectId: chatContext.projectId,
        conversationId,
        requestId,
        userId,
        generationStartedAtMs: Date.now(),
        diagnostics: {
          baseUrl: runtime.baseUrl,
          connectTimeoutMs: runtime.connectTimeoutMs,
          firstTokenTimeoutMs: runtime.firstTokenTimeoutMs,
          idleTimeoutMs: runtime.idleTimeoutMs,
          requestTimeoutMs: runtime.requestTimeoutMs,
        },
      },
    },
    conversationId,
    requestId,
    mode: runtime.provider.providerId,
    onComplete: async ({ assistantContent }) => {
      await persistAssistantResponse({
        supabase,
        conversationId,
        userId,
        requestId,
        projectId: chatContext.projectId,
        assistantContent,
        userMessage: payload.message,
        startedAt,
      });
      logServerEvent({
        level: "info",
        requestId,
        projectId: chatContext.projectId,
        conversationId,
        providerId: runtime.providerId,
        modelId: runtime.model,
        route: "/api/chat",
        event: "generation_completed",
        status: 200,
        durationMs: Date.now() - startedAt,
        stage: "provider_stream",
      });
    },
    onFailed: async (error, safeError) => {
      const providerError = error instanceof AIProviderError ? error : null;
      const errorCode = providerError?.code;
      const metadataStage = providerError?.metadata?.stage;
      const isTimeout = errorCode === "timeout";
      const event =
        errorCode === "unavailable"
          ? "provider_unavailable"
          : errorCode === "model_not_found"
            ? "model_not_found"
            : errorCode === "provider_error"
              ? "invalid_provider_response"
              : isTimeout
                ? "generation_timed_out"
                : safeError.type === "TextChatPersistenceError"
                  ? "persistence_failed"
                  : "stream_failed";

      logServerEvent({
        level: isTimeout ? "warn" : "error",
        requestId,
        projectId: chatContext.projectId,
        conversationId,
        providerId: runtime.providerId,
        modelId: runtime.model,
        route: "/api/chat",
        event,
        status: safeError.status,
        durationMs: Date.now() - startedAt,
        errorType: safeError.type,
        errorCode,
        stage: typeof metadataStage === "string" ? metadataStage : "provider_stream",
        statusCode: providerError?.statusCode,
      });
    },
    onCancelled: async () => {
      logServerEvent({
        level: "info",
        requestId,
        projectId: chatContext.projectId,
        conversationId,
        providerId: runtime.providerId,
        modelId: runtime.model,
        route: "/api/chat",
        event: "generation_cancelled",
        status: 499,
        durationMs: Date.now() - startedAt,
        cancelledByClient: true,
        stage: "provider_stream",
      });
    },
  });
}

async function persistAssistantResponse(options: {
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;
  conversationId: string;
  userId: string;
  requestId: string;
  projectId: string;
  assistantContent: string;
  userMessage: string;
  startedAt: number;
}) {
  if (!options.assistantContent) return;

  const { error: assistantSaveError } = await options.supabase
    .from("messages")
    .upsert(
      {
        conversation_id: options.conversationId,
        user_id: options.userId,
        role: "assistant",
        content: options.assistantContent,
        request_id: options.requestId,
      },
      {
        onConflict: "conversation_id,request_id,role",
        ignoreDuplicates: true,
      },
    );
  if (assistantSaveError) throw assistantSaveError;

  await options.supabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", options.conversationId)
    .eq("user_id", options.userId);

  if (options.userMessage) {
    try {
      const result = await saveExplicitMemory({
        supabase: options.supabase,
        userId: options.userId,
        projectId: options.projectId,
        conversationId: options.conversationId,
        message: options.userMessage,
      });
      logServerEvent({
        level: "info",
        requestId: options.requestId,
        projectId: options.projectId,
        conversationId: options.conversationId,
        route: "/api/chat",
        event:
          result.status === "saved"
            ? "memory_save_completed"
            : "memory_save_skipped",
        status: 200,
        durationMs: Date.now() - options.startedAt,
        stage: result.reason,
      });
    } catch {
      logServerEvent({
        level: "warn",
        requestId: options.requestId,
        projectId: options.projectId,
        conversationId: options.conversationId,
        route: "/api/chat",
        event: "memory_save_skipped",
        status: 200,
        durationMs: Date.now() - options.startedAt,
        stage: "memory_unavailable",
        errorCode: "memory_unavailable",
      });
    }
  }
}

function createStoredResponseStream(
  projectId: string,
  conversationId: string,
  requestId: string,
  content: string,
  startedAt: number,
) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          streamEvent("start", {
            conversationId,
            requestId,
            mode: "ollama",
            replayed: true,
          }),
        ),
      );
      controller.enqueue(encoder.encode(streamEvent("delta", { delta: content })));
      controller.enqueue(
        encoder.encode(streamEvent("done", { conversationId, requestId })),
      );
      controller.close();
      logServerEvent({
        level: "info",
        requestId,
        projectId,
        conversationId,
        route: "/api/chat",
        event: "idempotent_replay",
        status: 200,
        durationMs: Date.now() - startedAt,
        replayed: true,
      });
    },
  });

  return new Response(stream, {
    headers: streamHeaders(conversationId, requestId),
  });
}
