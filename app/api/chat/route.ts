import { headers } from "next/headers";
import OpenAI from "openai";
import { ZodError } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { chatRequestSchema } from "@/lib/validation/chat";
import { getRelevantMemories, saveExplicitMemory } from "@/services/memory";
import { getOpenAIClient } from "@/services/openai";
import {
  attachmentImageDataUrl,
  getOwnedAttachments,
} from "@/services/attachments";
import { getAIModelConfig } from "@/lib/ai/models";
import { createDefaultOllamaProvider } from "@/lib/ai/providers/ollama";
import { classifyOpenAIError } from "@/lib/openai/errors";
import {
  buildTextChatProviderRequest,
  createTextChatProviderResponse,
  isOllamaTextProviderEnabled,
  shouldUseOllamaTextProvider,
  streamEvent,
  streamHeaders,
} from "@/lib/ai/runtime/text-chat-runtime";
import {
  createRequestId,
  logServerEvent,
} from "@/lib/logging/server";

const MAX_CONTEXT_MESSAGES = 20;
const SYSTEM_PROMPT =
  "Você é Hanira, uma inteligência artificial elegante, acolhedora, inteligente e natural. Converse em português do Brasil por padrão. Seja clara, humana e útil, sem fingir ser humana. Adapte profundidade, tom e vocabulário ao usuário. Use as memórias disponíveis somente quando forem relevantes.";

export async function POST(request: Request) {
  const startedAt = Date.now();
  let requestId = createRequestId(request);
  try {
    const user = await requireSessionUser();
    const payload = chatRequestSchema.parse(await request.json());
    requestId = payload.requestId ?? requestId;
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
          error: error.issues[0]?.message ?? "Mensagem inválida.",
          requestId,
        },
        { status: 400, headers: { "X-Request-ID": requestId } },
      );
    }
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return Response.json(
        { error: "Faça login para conversar.", requestId },
        { status: 401, headers: { "X-Request-ID": requestId } },
      );
    }
    const safeError =
      error instanceof OpenAI.APIError
        ? classifyOpenAIError(error)
        : {
            status: 500,
            type: error instanceof Error ? error.name : "UnknownError",
            message: "A Hanira não conseguiu responder agora. Tente novamente.",
          };
    logServerEvent({
      level: "error",
      requestId,
      route: "/api/chat",
      event: "request_failed",
      status: safeError.status,
      durationMs: Date.now() - startedAt,
      errorType: safeError.type,
    });
    return Response.json(
      { error: safeError.message, requestId },
      {
        status: safeError.status,
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
    ? `“${payload.message.slice(0, 100)}${payload.message.length > 100 ? "…" : ""}”`
    : "o arquivo enviado";
  const answer = hasImages
    ? `Recebi ${subject} e o preview está disponível localmente. A imagem não foi analisada por IA: a análise real exige OpenAI e Supabase configurados.`
    : `Entendi. Você quer explorar ${subject}. Estou em modo demonstração. A transcrição e as respostas reais exigem os serviços configurados.`;
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

  let conversationId = payload.conversationId;
  if (conversationId) {
    const { data } = await supabase
      .from("conversations")
      .select("id,title")
      .eq("id", conversationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!data) {
      return Response.json({ error: "Conversa não encontrada." }, { status: 404 });
    }
  } else {
    const { data, error } = await supabase
      .from("conversations")
      .insert({
        user_id: userId,
        title: payload.message.slice(0, 60) || "Análise de mídia",
      })
      .select("id")
      .single();
    if (error) throw error;
    conversationId = data.id;
  }
  if (!conversationId) throw new Error("Conversa não inicializada.");

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
      title: payload.message.slice(0, 60) || "Análise de mídia",
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversationId)
    .eq("user_id", userId)
    .eq("title", "Uma nova conversa");

  const [{ data: messages }, { data: settings }, memories] = await Promise.all([
    supabase
      .from("messages")
      .select("role,content")
      .eq("conversation_id", conversationId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(MAX_CONTEXT_MESSAGES),
    supabase
      .from("user_settings")
      .select("preferred_name,response_style")
      .eq("user_id", userId)
      .maybeSingle(),
    getRelevantMemories(userId, payload.message || "mídia enviada"),
  ]);

  const context = [...(messages ?? [])].reverse();
  const personalization = [
    settings?.preferred_name
      ? `O nome preferido do usuário é ${settings.preferred_name}.`
      : "",
    settings?.response_style
      ? `Estilo de resposta solicitado: ${settings.response_style}.`
      : "",
    memories.length
      ? `Memórias relevantes, use somente se ajudarem:\n- ${memories.join("\n- ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
  const stableConversationId = conversationId;

  const useOllamaText = shouldUseOllamaTextProvider({
    ollamaEnabled: isOllamaTextProviderEnabled(),
    attachmentCount: attachments.length,
    imageAttachmentCount: imageAttachments.length,
  });

  if (useOllamaText) {
    return createTextChatProviderResponse({
      request,
      provider: createDefaultOllamaProvider(),
      providerRequest: buildTextChatProviderRequest({
        systemPrompt: SYSTEM_PROMPT,
        personalization,
        context,
      }),
      conversationId: stableConversationId,
      requestId,
      mode: "ollama",
      onComplete: async ({ assistantContent }) => {
        await persistAssistantResponse({
          supabase,
          conversationId: stableConversationId,
          userId,
          requestId,
          assistantContent,
          userMessage: payload.message,
        });
        logServerEvent({
          level: "info",
          requestId,
          route: "/api/chat",
          event: "stream_completed",
          status: 200,
          durationMs: Date.now() - startedAt,
        });
      },
      onFailed: async (_error, safeError) => {
        logServerEvent({
          level: "error",
          requestId,
          route: "/api/chat",
          event: "stream_failed",
          status: safeError.status,
          durationMs: Date.now() - startedAt,
          errorType: safeError.type,
        });
      },
      onCancelled: async () => {
        logServerEvent({
          level: "info",
          requestId,
          route: "/api/chat",
          event: "stream_cancelled",
          status: 499,
          durationMs: Date.now() - startedAt,
        });
      },
    });
  }

  const openai = getOpenAIClient();
  const models = getAIModelConfig();
  const abortController = new AbortController();
  const abort = () => abortController.abort();
  request.signal.addEventListener("abort", abort, { once: true });
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    abort();
  }, 45_000);

  let openAIStream;
  try {
    const input: OpenAI.Responses.ResponseInput = context.map((message) => ({
      role: message.role as "user" | "assistant",
      content: message.content,
    }));
    if (imageAttachments.length) {
      const imageContent = await Promise.all(
        imageAttachments.map(async (attachment) => ({
          type: "input_image" as const,
          image_url: await attachmentImageDataUrl(attachment),
          detail: "auto" as const,
        })),
      );
      const lastUserIndex = context.findLastIndex(
        (message) => message.role === "user",
      );
      const multimodalContent = [
        {
          type: "input_text" as const,
          text:
            payload.message ||
            "Analise cuidadosamente as imagens enviadas e descreva os pontos relevantes.",
        },
        ...imageContent,
      ];
      if (lastUserIndex >= 0) {
        input[lastUserIndex] = {
          role: "user",
          content: multimodalContent,
        };
      }
    }
    openAIStream = await openai.responses.create(
      {
        model: imageAttachments.length ? models.vision : models.chat,
        instructions: `${SYSTEM_PROMPT}\n${personalization}`,
        input,
        stream: true,
        store: false,
      },
      { signal: abortController.signal },
    );
  } catch (error) {
    clearTimeout(timeout);
    request.signal.removeEventListener("abort", abort);
    throw error;
  }

  const encoder = new TextEncoder();
  let assistantContent = "";
  const responseStream = new ReadableStream({
    async start(controller) {
      controller.enqueue(
        encoder.encode(
          streamEvent("start", {
            conversationId: stableConversationId,
            mode: "openai",
            requestId,
          }),
        ),
      );
      try {
        for await (const event of openAIStream) {
          if (event.type === "response.output_text.delta") {
            assistantContent += event.delta;
            controller.enqueue(
              encoder.encode(streamEvent("delta", { delta: event.delta })),
            );
          }
        }

        if (assistantContent && !abortController.signal.aborted) {
          await persistAssistantResponse({
            supabase,
            conversationId: stableConversationId,
            userId,
            requestId,
            assistantContent,
            userMessage: payload.message,
          });
          controller.enqueue(
            encoder.encode(
              streamEvent("done", { conversationId: stableConversationId }),
            ),
          );
          logServerEvent({
            level: "info",
            requestId,
            route: "/api/chat",
            event: "stream_completed",
            status: 200,
            durationMs: Date.now() - startedAt,
          });
        }
      } catch (error) {
        if (!abortController.signal.aborted) {
          const safeError =
            error instanceof OpenAI.APIError
              ? classifyOpenAIError(error)
              : {
                  status: 500,
                  type: error instanceof Error ? error.name : "PersistenceError",
                  message:
                    "A resposta foi gerada, mas não pôde ser salva. Tente novamente.",
                };
          logServerEvent({
            level: "error",
            requestId,
            route: "/api/chat",
            event: "stream_failed",
            status: safeError.status,
            durationMs: Date.now() - startedAt,
            errorType: safeError.type,
          });
          controller.enqueue(
            encoder.encode(
              streamEvent("error", {
                message: safeError.message,
                requestId,
              }),
            ),
          );
        } else if (timedOut) {
          const safeError = classifyOpenAIError({ name: "AbortError" });
          controller.enqueue(
            encoder.encode(
              streamEvent("error", {
                message: safeError.message,
                requestId,
              }),
            ),
          );
          logServerEvent({
            level: "warn",
            requestId,
            route: "/api/chat",
            event: "stream_timeout",
            status: safeError.status,
            durationMs: Date.now() - startedAt,
            errorType: safeError.type,
          });
        } else {
          logServerEvent({
            level: "info",
            requestId,
            route: "/api/chat",
            event: "stream_cancelled",
            status: 499,
            durationMs: Date.now() - startedAt,
          });
        }
      } finally {
        clearTimeout(timeout);
        request.signal.removeEventListener("abort", abort);
        controller.close();
      }
    },
    cancel() {
      abortController.abort();
    },
  });

  return new Response(responseStream, {
    headers: streamHeaders(stableConversationId, requestId),
  });
}

async function persistAssistantResponse(options: {
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;
  conversationId: string;
  userId: string;
  requestId: string;
  assistantContent: string;
  userMessage: string;
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
    await saveExplicitMemory(
      options.userId,
      options.conversationId,
      options.userMessage,
    );
  }
}

function createStoredResponseStream(
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
            mode: "openai",
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
        route: "/api/chat",
        event: "idempotent_replay",
        status: 200,
        durationMs: Date.now() - startedAt,
      });
    },
  });
  return new Response(stream, {
    headers: streamHeaders(conversationId, requestId),
  });
}
