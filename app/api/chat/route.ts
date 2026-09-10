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
import { checkUserMessageQuota } from "@/lib/security/user-quota";
import {
  createConcurrencyLockReleaser,
  tryAcquireConcurrencyLock,
} from "@/lib/security/concurrency-guard";
import { recordCapacityEvent } from "@/lib/observability/capacity-metrics";
import {
  ROUTING_TRACE_EVENTS,
  routingRejectionsOf,
  toRoutingTraceLogFields,
  type RoutingTraceEvent,
  type RoutingTraceMeta,
} from "@/lib/observability/routing-trace";
import {
  recordCandidateFailure,
  recordCandidateSuccess,
} from "@/lib/ai/capacity/capacity-state";
import { ModelRouterError } from "@/lib/ai/router/errors";
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
  "Voce e Nira, a camada de inteligencia da Hanira. Converse em portugues do Brasil por padrao. Seja clara, acolhedora e util, sem fingir ser humana. Adapte profundidade, tom e vocabulario ao usuario. Use as memorias disponiveis somente quando forem relevantes.";

// Pacote 16.6 (Groq Multi-Free): request-scoped routing trace. Registra a
// avaliacao de candidatos free-only com metadata ALLOW-LISTED (apenas ids
// logicos, razoes e tempos — ver lib/observability/routing-trace.ts). NUNCA
// loga prompt, texto gerado, segredos ou conteudo de usuario. Para o usuario
// a identidade continua sendo "Nira": provider/modelo e detalhe de log.
function logRoutingTrace(input: {
  readonly requestId: string;
  readonly event: RoutingTraceEvent;
  readonly status: number;
  readonly durationMs: number;
  readonly level?: "info" | "warn";
  readonly meta?: RoutingTraceMeta;
}): void {
  if (!(ROUTING_TRACE_EVENTS as readonly string[]).includes(input.event)) {
    // Evento desconhecido e erro de programacao — fail-closed (nunca logado
    // como se fosse um evento do vocabulario).
    throw new Error(`Evento de routing trace desconhecido: ${input.event}.`);
  }
  logServerEvent({
    level: input.level ?? "info",
    requestId: input.requestId,
    route: "/api/chat",
    event: "routing_trace",
    status: input.status,
    durationMs: input.durationMs,
    stage: "nira_routing",
    details: {
      traceEvent: input.event,
      ...toRoutingTraceLogFields(input.meta ?? {}),
    },
  });
}

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

    // Pacote 16.5 (Fase 1 - quotas internas simples por usuario): limite
    // diario em memoria, verificado ANTES de qualquer execucao de IA. O erro
    // publico segue o vocabulario de capacidade do produto (invariante 5 do
    // roadmap: sem capacidade disponivel -> resposta segura de alta demanda).
    const quota = checkUserMessageQuota(user.id);
    if (!quota.allowed) {
      logServerEvent({
        level: "warn",
        requestId,
        route: "/api/chat",
        event: "quota_limited",
        status: 429,
        durationMs: Date.now() - startedAt,
      });
      recordCapacityEvent({ outcome: "quota_limited_response" });
      return Response.json(
        {
          error:
            "Voce atingiu o limite diario de mensagens da Hanira. Tente novamente amanha.",
          code: "capacity_unavailable",
          requestId,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(quota.retryAfterSeconds),
            "X-Request-ID": requestId,
          },
        },
      );
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

    // Pacote 16.5: respostas de capacidade (capacity_unavailable) alimentam a
    // observabilidade basica; nenhuma infraestrutura externa e acessada aqui.
    if (
      error instanceof ModelRouterError &&
      error.code === "capacity_unavailable"
    ) {
      recordCapacityEvent({ outcome: "capacity_unavailable_response" });
      // Pacote 16.6: routing trace do esgotamento da cadeia free-only — cada
      // candidato avaliado/rejeitado e o esgotamento final, com metadata
      // allow-listed (ids logicos + razoes; nunca mensagens brutas de erro).
      for (const rejection of routingRejectionsOf(error)) {
        logRoutingTrace({
          requestId,
          event: "candidate_considered",
          status: 503,
          durationMs: Date.now() - startedAt,
          level: "warn",
          meta: {
            candidateId: rejection.candidateId,
            provider: rejection.provider,
            reason: rejection.reason,
          },
        });
      }
      logRoutingTrace({
        requestId,
        event: "routing_exhausted",
        status: 503,
        durationMs: Date.now() - startedAt,
        level: "warn",
        meta: { reason: error.code },
      });
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
      { error: message, code: publicError.code, requestId },
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

  // Pacote 16.5: Concurrency Guard - previne multiple requests simultaneas
  // do mesmo usuario (double-submit acidental). Lock liberado em todos os
  // caminhos terminais (early returns, callbacks onComplete/onFailed/
  // onCancelled e catch). Estado em memoria, nao autoritativo.
  const lockAcquired = tryAcquireConcurrencyLock(userId, requestId);
  if (!lockAcquired) {
    logServerEvent({
      level: "warn",
      requestId,
      route: "/api/chat",
      event: "concurrency_limited",
      status: 429,
      durationMs: Date.now() - startedAt,
      stage: "concurrency_guard",
    });
    return Response.json(
      {
        error:
          "Nira está atendendo muitas solicitações agora. Tente novamente em instantes.",
        code: "temporarily_limited",
        requestId,
      },
      {
        status: 429,
        headers: {
          "X-Request-ID": requestId,
          "Retry-After": "1",
        },
      },
    );
  }

  const releaseLock = createConcurrencyLockReleaser(userId, requestId);

  try {
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
      const response = createStoredResponseStream(
        chatContext.projectId,
        conversationId,
        requestId,
        existingAssistant.content,
        startedAt,
      );
      releaseLock();
      return response;
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
          releaseLock();
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
        releaseLock();
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
        // Seguro chamar sempre: onOutcome dispara em todos os terminais
        // (synthesized, deterministic_fallback, cancelled); o releaser evita
        // double-release com onComplete no caso de sucesso.
        releaseLock();
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
        releaseLock();
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
      onComplete: async (assistantContent) => {
        releaseLock();
        await persistAssistantResponse({ supabase, conversationId,
          userId, requestId, projectId: chatContext.projectId, assistantContent,
          userMessage: payload.message, startedAt });
      },
    });
  }

  const currentWeatherFallback = createCurrentWeatherFallbackResponse({
    request,
    message: payload.message,
    conversationId,
    requestId,
    onComplete: async (assistantContent) => {
      releaseLock();
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
  if (currentWeatherFallback) {
    releaseLock();
    return currentWeatherFallback;
  }

  // Pacote 16.6: routing trace — inicio da avaliacao de roteamento Nira.
  logRoutingTrace({
    requestId,
    event: "routing_started",
    status: 200,
    durationMs: Date.now() - startedAt,
  });

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
    ...(routed.niraProfileId ? { niraProfileId: routed.niraProfileId } : {}),
    ...(routed.routingCandidateId
      ? { routingCandidateId: routed.routingCandidateId }
      : {}),
    ...(routed.routingReason ? { routingReason: routed.routingReason } : {}),
    details: {
      baseUrl: routed.baseUrl,
      connectTimeoutMs: routed.connectTimeoutMs,
      firstTokenTimeoutMs: routed.firstTokenTimeoutMs,
      idleTimeoutMs: routed.idleTimeoutMs,
      requestTimeoutMs: routed.requestTimeoutMs,
      capability: routed.capability,
    },
  });
  // Pacote 16.5: observabilidade basica - registra a selecao do router para as
  // metricas de capacidade (apenas ids logicos, sem segredos).
  recordCapacityEvent({
    outcome: "selected",
    ...(routed.routingCandidateId
      ? { candidateId: routed.routingCandidateId }
      : {}),
    providerId: routed.providerId,
    modelId: routed.model,
  });
  // Pacote 16.6: routing trace — candidato selecionado; quando a preferencia
  // do perfil nao era elegivel (ex.: cooldown do primario), registra tambem o
  // fallback deterministico free-only (free -> free, nunca free -> pago).
  const routingTraceMeta: RoutingTraceMeta = {
    niraProfileId: routed.niraProfileId,
    candidateId: routed.routingCandidateId,
    provider: routed.providerId,
    model: routed.model,
    reason: routed.routingReason,
  };
  logRoutingTrace({
    requestId,
    event: "candidate_selected",
    status: 200,
    durationMs: Date.now() - startedAt,
    meta: routingTraceMeta,
  });
  if (routed.routingReason === "selected_after_invalid_preference") {
    logRoutingTrace({
      requestId,
      event: "fallback_selected",
      status: 200,
      durationMs: Date.now() - startedAt,
      meta: routingTraceMeta,
    });
  }
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
    profile: routed.niraProfileId,
    onComplete: async ({ assistantContent }) => {
      releaseLock();
      // Pacote 16.5 (Nira Capacity Engine): sucesso real limpa cooldown do
      // candidato selecionado e alimenta as metricas de capacidade.
      if (routed.routingCandidateId) {
        recordCandidateSuccess(routed.routingCandidateId);
        recordCapacityEvent({
          outcome: "success",
          candidateId: routed.routingCandidateId,
          providerId: routed.providerId,
          modelId: routed.model,
        });
      }
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
      releaseLock();
      const providerError = error instanceof AIProviderError ? error : null;
      const errorCode = providerError?.code;
      // Pacote 16.5 (Nira Capacity Engine): sinal de capacidade a partir do
      // erro classificado do provider. Apenas erros DE PROVIDER alimentam o
      // estado de capacidade: falha de persistencia nao e instabilidade de
      // candidate e nao pode gerar cooldown.
      if (routed.routingCandidateId && providerError) {
        // Pacote 16.6: Retry-After SANITIZADO do provider (quando exposto nos
        // headers do erro classificado) melhora o cooldown de rate_limit,
        // limitado aos limites configurados (1s-600s). Nenhum header cru.
        const rateLimitMetadata = providerError.metadata?.providerRateLimit;
        const retryAfterMs =
          rateLimitMetadata instanceof Object &&
          typeof (rateLimitMetadata as { retryAfterMs?: unknown }).retryAfterMs ===
            "number"
            ? (rateLimitMetadata as { retryAfterMs: number }).retryAfterMs
            : undefined;
        recordCandidateFailure(routed.routingCandidateId, {
          code: errorCode ?? "unknown",
          retryable: providerError.retryable,
          retryAfterMs,
        });
        recordCapacityEvent({
          outcome:
            providerError.code === "rate_limit" ? "rate_limited" : "failure",
          candidateId: routed.routingCandidateId,
          providerId: routed.providerId,
          modelId: routed.model,
          ...(errorCode ? { errorCode } : {}),
        });
        // Pacote 16.6: routing trace — falha classificada do candidato.
        // Apenas razao operacional atravessa (nunca mensagem bruta do erro).
        logRoutingTrace({
          requestId,
          event: "candidate_failed",
          status: safeError.status,
          durationMs: Date.now() - startedAt,
          level: "warn",
          meta: {
            candidateId: routed.routingCandidateId,
            provider: routed.providerId,
            model: routed.model,
            reason: errorCode ?? safeError.type,
          },
        });
      }
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
      releaseLock();
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
  } catch (error) {
    // Concurrency lock must be released on any synchronous throw
    // (e.g. resolveProjectChatContext, routeChatCapability, provider
    // response construction). Streaming callbacks release the lock in
    // their own onComplete/onFailed/onCancelled paths.
    releaseLock();
    throw error;
  }
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
