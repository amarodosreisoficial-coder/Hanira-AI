import { headers } from "next/headers";
import { ZodError } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import {
  buildTextChatProviderRequest,
  createTextChatProviderResponse,
  createDeterministicTextResponse,
  createGroundedToolResponse,
  createWeatherGroundedContext,
  createTimeGroundedContext,
  buildGroundedSynthesisRequest,
  createTextChatRuntime,
  getOllamaTextProviderEligibility,
  shouldUseOllamaTextProvider,
  streamEvent,
  streamHeaders,
  toPublicAIError,
} from "@/lib/ai/runtime";
import { routeChatCapability } from "@/lib/ai/runtime/capability-router";
import { createCurrentWeatherFallbackResponse } from "@/lib/ai/runtime/current-weather-fallback";
import {
  logAIProviderErrorThrown,
} from "@/lib/ai/ai-provider-error-logging";
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
import { routeTool } from "@/lib/tools/router";
import { formatWeatherCurrent } from "@/lib/tools/weather-current";
import { formatTimeCurrent } from "@/lib/tools/time-current";

const SYSTEM_PROMPT =
  "Voce e Hanira, uma inteligencia artificial elegante, acolhedora, inteligente e natural. Converse em portugues do Brasil por padrao. Seja clara, humana e util, sem fingir ser humana. Adapte profundidade, tom e vocabulario ao usuario. Use as memorias disponiveis somente quando forem relevantes.";

class InvalidChatPayloadError extends Error {
  constructor() {
    super("INVALID_CHAT_PAYLOAD");
    this.name = "InvalidChatPayloadError";
  }
}

async function parseChatPayload(request: Request) {
  try {
    const body = await request.text();
    if (!body.trim()) throw new SyntaxError("Empty JSON body");
    return chatRequestSchema.parse(JSON.parse(body));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new InvalidChatPayloadError();
    }
    throw error;
  }
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  let requestId = createRequestId(request);

  try {
    const user = await requireSessionUser();
    const payload = await parseChatPayload(request);
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
    if (error instanceof InvalidChatPayloadError) {
      logServerEvent({
        level: "warn",
        requestId,
        route: "/api/chat",
        event: "invalid_json_payload",
        status: 400,
        durationMs: Date.now() - startedAt,
        errorType: error.name,
      });
      return Response.json(
        { error: "Payload de chat invalido.", requestId },
        { status: 400, headers: { "X-Request-ID": requestId } },
      );
    }

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
      errorCode:
        error instanceof AIProviderError
          ? error.code
          : error instanceof Error
            ? error.name
            : "unknown",
      details: {
        constructorName:
          error && typeof error === "object" && "constructor" in error
            ? (error as { constructor?: { name?: string } }).constructor?.name
            : typeof error,
      },
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

  const systemPrompt = buildSystemPrompt({
    baseInstructions: SYSTEM_PROMPT,
    personalityInstructions: chatContext.personalityInstructions,
    projectLabel: chatContext.projectName,
    relevantMemories: chatContext.relevantMemories,
  });
  const routedTool = await routeTool({
    message: payload.message,
    requestId,
    signal: request.signal,
  });
  if (routedTool?.result.ok && routedTool.result.data) {
    const deterministicText = routedTool.tool === "weather.current"
      ? formatWeatherCurrent(routedTool.result.data, routedTool.language)
      : formatTimeCurrent(routedTool.result.data, routedTool.language);
    const groundedContext = routedTool.tool === "weather.current"
      ? createWeatherGroundedContext(routedTool.result, routedTool.language)
      : createTimeGroundedContext(routedTool.result, routedTool.language);
    let synthesisRuntime: ReturnType<typeof createTextChatRuntime> | null = null;
    try {
      synthesisRuntime = createTextChatRuntime();
    } catch {
      // A successful tool result remains useful when the local model is offline
      // or misconfigured; the deterministic formatter is the safe second layer.
    }

    if (!synthesisRuntime) {
      logServerEvent({
        level: "warn",
        requestId,
        projectId: chatContext.projectId,
        conversationId,
        route: "/api/chat",
        event: "tool_synthesis_deterministic_fallback",
        status: 200,
        durationMs: Date.now() - startedAt,
        stage: "tool_synthesis",
        details: { tool: routedTool.tool, reason: "runtime_unavailable" },
      });
      return createDeterministicTextResponse({
        request,
        conversationId,
        requestId,
        mode: routedTool.tool,
        text: deterministicText,
        onComplete: async (assistantContent) => {
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
        },
      });
    }

    logServerEvent({
      level: "info",
      requestId,
      projectId: chatContext.projectId,
      conversationId,
      providerId: synthesisRuntime.providerId,
      modelId: synthesisRuntime.model,
      route: "/api/chat",
      event: "tool_synthesis_started",
      status: 200,
      durationMs: Date.now() - startedAt,
      stage: "tool_synthesis",
      details: { tool: routedTool.tool, source: routedTool.result.source },
    });
    return createGroundedToolResponse({
      request,
      provider: synthesisRuntime.provider,
      providerRequest: buildGroundedSynthesisRequest({
        context: groundedContext,
        model: synthesisRuntime.model,
        signal: request.signal,
        timeoutMs: synthesisRuntime.requestTimeoutMs,
        metadata: {
          requestId,
          generationStartedAtMs: Date.now(),
          diagnostics: {
            baseUrl: synthesisRuntime.baseUrl,
            connectTimeoutMs: synthesisRuntime.connectTimeoutMs,
            firstTokenTimeoutMs: synthesisRuntime.firstTokenTimeoutMs,
            idleTimeoutMs: synthesisRuntime.idleTimeoutMs,
            requestTimeoutMs: synthesisRuntime.requestTimeoutMs,
          },
        },
      }),
      groundedContext,
      deterministicText,
      conversationId,
      requestId,
      mode: routedTool.tool,
      onComplete: async (assistantContent) => {
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
      },
      onOutcome: async (outcome) => {
        const event = outcome.kind === "synthesized"
          ? "tool_synthesis_completed"
          : outcome.kind === "cancelled"
            ? "tool_synthesis_failed"
            : outcome.reason === "grounding_rejected"
              ? "tool_synthesis_grounding_rejected"
              : "tool_synthesis_deterministic_fallback";
        logServerEvent({
          level: outcome.kind === "synthesized" ? "info" : "warn",
          requestId,
          projectId: chatContext.projectId,
          conversationId,
          providerId: synthesisRuntime.providerId,
          modelId: synthesisRuntime.model,
          route: "/api/chat",
          event,
          status: outcome.kind === "cancelled" ? 499 : 200,
          durationMs: Date.now() - startedAt,
          stage: "tool_synthesis",
          ...(outcome.kind === "cancelled" ? { cancelledByClient: true } : {}),
          details: { tool: routedTool.tool, ...(outcome.reason ? { reason: outcome.reason } : {}) },
        });
      },
    });
  }
  if (
    routedTool?.result.error?.code === "ambiguous_location" ||
    routedTool?.result.error?.code === "missing_location"
  ) {
    return createDeterministicTextResponse({
      request,
      conversationId,
      requestId,
      mode: routedTool.tool,
      text: routedTool.result.error.message,
      onComplete: async (assistantContent) => {
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
      },
    });
  }

  if (routedTool?.tool === "time.current") {
    const message = routedTool.language === "pt-BR"
      ? "Nao consegui consultar o fuso horario dessa localidade agora. Tente novamente em instantes."
      : "I could not resolve that location's time zone right now. Please try again shortly.";
    return createDeterministicTextResponse({
      request, conversationId, requestId, mode: routedTool.tool, text: message,
      onComplete: async (assistantContent) => persistAssistantResponse({ supabase, conversationId,
        userId, requestId, projectId: chatContext.projectId, assistantContent,
        userMessage: payload.message, startedAt }),
    });
  }

  const currentWeatherFallback = createCurrentWeatherFallbackResponse({
    request,
    message: payload.message,
    conversationId,
    requestId,
    onComplete: async (assistantContent) => {
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
    },
  });
  if (currentWeatherFallback) return currentWeatherFallback;

  const routed = await routeChatCapability({
    systemPrompt,
    context: chatContext.conversationMessages,
    userMessage: payload.message,
    attachments,
  });
  logServerEvent({
    level: "info",
    requestId,
    projectId: chatContext.projectId,
    conversationId,
    providerId: routed.providerId,
    modelId: routed.model,
    route: "/api/chat",
    event: "runtime_created",
    status: 200,
    durationMs: Date.now() - startedAt,
    stage: "runtime_created",
    details: {
      baseUrl: routed.baseUrl,
      connectTimeoutMs: routed.connectTimeoutMs,
      firstTokenTimeoutMs: routed.firstTokenTimeoutMs,
      idleTimeoutMs: routed.idleTimeoutMs,
      requestTimeoutMs: routed.requestTimeoutMs,
      capability: routed.capability,
    },
  });
  const providerRequest =
    routed.capability === "text"
      ? buildTextChatProviderRequest({
          systemPrompt,
          context: [
            ...chatContext.conversationMessages,
            { role: "user", content: payload.message },
          ],
          model: routed.model,
        })
      : routed.providerRequest;
  const eligibility = getOllamaTextProviderEligibility({
    ollamaEnabled: routed.capability === "text",
    attachmentCount:
      routed.capability === "text" && routed.imageAttachmentCount === 0 ? 0 : routed.attachmentCount,
    imageAttachmentCount: routed.imageAttachmentCount,
    request: providerRequest,
    supportedCapabilities: routed.provider.capabilities.supported,
  });
  const eligible = shouldUseOllamaTextProvider({
    ollamaEnabled: routed.capability === "text",
    attachmentCount:
      routed.capability === "text" && routed.imageAttachmentCount === 0 ? 0 : routed.attachmentCount,
    imageAttachmentCount: routed.imageAttachmentCount,
    request: providerRequest,
    supportedCapabilities: routed.provider.capabilities.supported,
  });
  logServerEvent({
    level: eligible ? "info" : "warn",
    requestId,
    projectId: chatContext.projectId,
    conversationId,
    providerId: routed.providerId,
    modelId: routed.model,
    route: "/api/chat",
    event:
      routed.capability === "text"
        ? eligible
          ? "ollama_eligibility_confirmed"
          : "ollama_eligibility_blocked"
        : "capability_routing_selected",
    status: routed.capability === "text" ? (eligible ? 200 : 400) : 200,
    durationMs: Date.now() - startedAt,
    stage: "provider_selection",
    details: {
      attachmentCount: eligibility.attachmentCount,
      imageAttachmentCount: eligibility.imageAttachmentCount,
      hasMessage: Boolean(payload.message.trim()),
      messageCount: eligibility.messageCount,
      roles: eligibility.roles,
      contentFieldTypes: eligibility.contentFieldTypes,
      hasTools: eligibility.hasTools,
      hasMultimodalInput: eligibility.hasMultimodalInput,
      hasMetadata: eligibility.hasMetadata,
      hasCapabilities: eligibility.hasCapabilities,
      eligibilityReason: eligibility.reason,
      eligibilityConditions: eligibility.conditions,
    },
  });

  if (routed.capability === "text" && !eligible) {
    logAIProviderErrorThrown({
      sourceFile: "app/api/chat/route.ts",
      sourceLine: 425,
      reason:
        attachments.length > 0
          ? "chat_route_non_text_attachments_blocked"
          : "chat_route_non_simple_text_blocked",
      requestId,
    });
    throw new AIProviderError({
      code: "unsupported_capability",
      message:
        attachments.length > 0
          ? "O runtime principal atual aceita apenas chat textual sem anexos."
          : "O runtime principal atual aceita apenas chat textual simples.",
      provider: routed.provider.providerId,
      model: routed.model,
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
    providerId: routed.providerId,
    modelId: routed.model,
    route: "/api/chat",
    event: "generation_started",
    status: 200,
    durationMs: Date.now() - startedAt,
    stage: "provider_stream",
  });

  return createTextChatProviderResponse({
    request,
    provider: routed.provider,
    providerRequest: {
      ...providerRequest,
      signal: request.signal,
      timeoutMs: routed.requestTimeoutMs,
      metadata: {
        projectId: chatContext.projectId,
        conversationId,
        requestId,
        userId,
        generationStartedAtMs: Date.now(),
        diagnostics: {
          baseUrl: routed.baseUrl,
          connectTimeoutMs: routed.connectTimeoutMs,
          firstTokenTimeoutMs: routed.firstTokenTimeoutMs,
          idleTimeoutMs: routed.idleTimeoutMs,
          requestTimeoutMs: routed.requestTimeoutMs,
          capability: routed.capability,
        },
      },
    },
    conversationId,
    requestId,
    mode: routed.mode,
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
        providerId: routed.providerId,
        modelId: routed.model,
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
        providerId: routed.providerId,
        modelId: routed.model,
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
        providerId: routed.providerId,
        modelId: routed.model,
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
