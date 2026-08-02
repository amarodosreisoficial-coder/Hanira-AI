import { headers } from "next/headers";
import OpenAI from "openai";
import { requireSessionUser } from "@/lib/auth/session";
import { getOpenAIVoiceConfig } from "@/lib/ai/models";
import { createRequestId, logServerEvent } from "@/lib/logging/server";
import { mediaConfig } from "@/lib/media/config";
import { classifyOpenAIError } from "@/lib/openai/errors";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { speechRequestSchema } from "@/lib/validation/media";
import { getOpenAIClient } from "@/services/openai";

export async function POST(request: Request) {
  const startedAt = Date.now();
  const requestId = createRequestId(request);
  try {
    if (!mediaConfig.voiceEnabled) {
      return Response.json(
        {
          error: "A leitura em voz alta esta desativada nesta instancia.",
          requestId,
        },
        { status: 409, headers: { "X-Request-ID": requestId } },
      );
    }

    const user = await requireSessionUser();
    const payload = speechRequestSchema.parse(await request.json());
    if (user.demo) {
      return Response.json(
        {
          error:
            "No modo demonstracao, a leitura usa a voz disponivel no navegador.",
          requestId,
        },
        { status: 409, headers: { "X-Request-ID": requestId } },
      );
    }

    const headerStore = await headers();
    const ip =
      headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      headerStore.get("x-real-ip") ??
      "unknown";
    const rate = checkRateLimit(`speech:${user.id}:${ip}`);
    if (!rate.allowed) {
      return Response.json(
        { error: "Aguarde antes de gerar outro audio.", requestId },
        { status: 429, headers: { "X-Request-ID": requestId } },
      );
    }

    const models = getOpenAIVoiceConfig();
    const abortController = new AbortController();
    const abort = () => abortController.abort();
    request.signal.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(() => abortController.abort(), 45_000);
    try {
      logServerEvent({
        level: "info",
        requestId,
        route: "/api/audio/speech",
        event: "speech_started",
        status: 200,
        durationMs: Date.now() - startedAt,
      });

      const speech = await getOpenAIClient().audio.speech.create(
        {
          model: models.speech,
          voice: payload.voice ?? models.voice,
          input: payload.text,
          speed: payload.speed,
          response_format: "mp3",
          stream_format: "audio",
        },
        { signal: abortController.signal },
      );

      const response = new Response(speech.body, {
        headers: {
          "Content-Type": "audio/mpeg",
          "Cache-Control": "private, no-store",
          "X-Request-ID": requestId,
          "X-Content-Type-Options": "nosniff",
        },
      });
      logServerEvent({
        level: "info",
        requestId,
        route: "/api/audio/speech",
        event: "speech_completed",
        status: 200,
        durationMs: Date.now() - startedAt,
      });
      return response;
    } finally {
      clearTimeout(timeout);
      request.signal.removeEventListener("abort", abort);
    }
  } catch (error) {
    const safe =
      error instanceof OpenAI.APIError
        ? classifyOpenAIError(error)
        : {
            status:
              error instanceof Error && error.message === "UNAUTHENTICATED"
                ? 401
                : 400,
            type: error instanceof Error ? error.name : "SpeechError",
            message: "Nao foi possivel gerar a leitura em voz alta.",
          };
    logServerEvent({
      level: "warn",
      requestId,
      route: "/api/audio/speech",
      event: "speech_failed",
      status: safe.status,
      durationMs: Date.now() - startedAt,
      errorType: safe.type,
    });
    return Response.json(
      { error: safe.message, requestId },
      { status: safe.status, headers: { "X-Request-ID": requestId } },
    );
  }
}
