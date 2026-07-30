import { headers } from "next/headers";
import OpenAI from "openai";
import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { getOpenAIVoiceConfig } from "@/lib/ai/models";
import { classifyOpenAIError } from "@/lib/openai/errors";
import { createRequestId, logServerEvent } from "@/lib/logging/server";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { validateMediaFile } from "@/lib/validation/media";
import { mediaConfig } from "@/lib/media/config";
import { storeAttachment } from "@/services/attachments";
import { getOpenAIClient } from "@/services/openai";

const conversationSchema = z.uuid();

export async function POST(request: Request) {
  const startedAt = Date.now();
  const requestId = createRequestId(request);
  try {
    const user = await requireSessionUser();
    const headerStore = await headers();
    const ip =
      headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      headerStore.get("x-real-ip") ??
      "unknown";
    const rate = checkRateLimit(`transcribe:${user.id}:${ip}`);
    if (!rate.allowed) {
      return Response.json(
        { error: "Aguarde antes de transcrever outro áudio.", requestId },
        { status: 429, headers: { "X-Request-ID": requestId } },
      );
    }
    const contentLength = Number(headerStore.get("content-length") ?? 0);
    if (contentLength > mediaConfig.maxAudioSizeBytes + 1_000_000) {
      return Response.json(
        { error: "O áudio excede o limite permitido.", requestId },
        { status: 413, headers: { "X-Request-ID": requestId } },
      );
    }

    const formData = await request.formData();
    const audio = formData.get("audio");
    if (!(audio instanceof File)) {
      return Response.json(
        { error: "Nenhum áudio foi recebido.", requestId },
        { status: 400, headers: { "X-Request-ID": requestId } },
      );
    }
    await validateMediaFile(audio, "audio");
    const rawConversationId = formData.get("conversationId");
    const conversationId =
      typeof rawConversationId === "string" && rawConversationId
        ? conversationSchema.parse(rawConversationId)
        : null;

    if (user.demo) {
      return Response.json(
        {
          text:
            "Transcrição simulada no modo demonstração — revise este texto antes de enviar.",
          simulated: true,
          attachment: null,
          requestId,
        },
        { headers: { "X-Request-ID": requestId } },
      );
    }

    const abortController = new AbortController();
    const abort = () => abortController.abort();
    request.signal.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(() => abortController.abort(), 60_000);
    try {
      const transcription = await getOpenAIClient().audio.transcriptions.create(
        {
          file: audio,
          model: getOpenAIVoiceConfig().transcription,
          language: "pt",
          response_format: "json",
        },
        { signal: abortController.signal },
      );
      const attachment = conversationId
        ? await storeAttachment({
            userId: user.id,
            conversationId,
            file: audio,
            type: "audio",
            metadata: { purpose: "transcription" },
          })
        : null;
      logServerEvent({
        level: "info",
        requestId,
        route: "/api/audio/transcribe",
        event: "transcription_completed",
        status: 200,
        durationMs: Date.now() - startedAt,
      });
      return Response.json(
        {
          text: transcription.text,
          simulated: false,
          attachment,
          requestId,
        },
        { headers: { "X-Request-ID": requestId } },
      );
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
            type: error instanceof Error ? error.name : "AudioError",
            message:
              error instanceof Error &&
              (error.message.includes("áudio") ||
                error.message.includes("arquivo") ||
                error.message.includes("extensão") ||
                error.message.includes("limite"))
                ? error.message
                : "Não foi possível transcrever o áudio.",
          };
    logServerEvent({
      level: "warn",
      requestId,
      route: "/api/audio/transcribe",
      event: "transcription_failed",
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
