import { requireSessionUser } from "@/lib/auth/session";
import { createRequestId, logServerEvent } from "@/lib/logging/server";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { getUserSettingsForUser } from "@/services/user-settings";
import { getSttRuntimeState } from "@/lib/ai/transcription/runtime";
import { CloudflareWorkersAITranscriptionProvider } from "@/lib/ai/transcription/cloudflare-workers-ai-transcription-provider";
import { publicTranscriptionError, TranscriptionError } from "@/lib/ai/transcription/provider";
import { readBoundedSttBody, SttAudioValidationError, validateSttAudio } from "@/lib/validation/stt-audio";

export function GET() {
  const { eligible } = getSttRuntimeState();
  return Response.json({ available: eligible }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const requestId = createRequestId(request);
  const respond = (message: string, status: number) => Response.json(
    { error: message, requestId },
    { status, headers: { "X-Request-ID": requestId, "Cache-Control": "no-store" } },
  );
  try {
    const user = await requireSessionUser();
    if (user.demo) return respond("A transcrição está indisponível no modo demonstração.", 409);
    if (!getSttRuntimeState().eligible) return respond("A transcrição está indisponível nesta instância.", 409);
    const settings = await getUserSettingsForUser(user.id);
    if (!settings.transcriptionEnabled) return respond("Ative a transcrição por microfone nas configurações.", 409);
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? "unknown";
    if (!checkRateLimit(`stt:${user.id}:${ip}`).allowed) return respond("Aguarde antes de transcrever outro áudio.", 429);
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("multipart/form-data;")) return respond("Envie um arquivo de áudio.", 400);
    const body = await readBoundedSttBody(request);
    const upload = new Request("http://localhost/audio", { method: "POST", headers: { "content-type": contentType }, body: Uint8Array.from(body).buffer });
    const form = await upload.formData();
    const audio = form.get("audio");
    if (!(audio instanceof File) || form.getAll("audio").length !== 1 || [...form.values()].filter((value) => value instanceof File).length !== 1) return respond("Envie um único arquivo de áudio.", 400);
    const bytes = await validateSttAudio(audio);
    const transcript = await new CloudflareWorkersAITranscriptionProvider().transcribe(bytes, request.signal);
    logServerEvent({ level: "info", requestId, route: "/api/audio/transcribe", event: "transcription_completed", status: 200, durationMs: Date.now() - startedAt });
    return Response.json({ transcript, requestId }, { headers: { "X-Request-ID": requestId, "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof TranscriptionError || error instanceof SttAudioValidationError ? error.code : null;
    const safe = code ? publicTranscriptionError(code) : error instanceof Error && error.message === "UNAUTHENTICATED"
      ? { status: 401, message: "Entre na sua conta para transcrever áudio." }
      : { status: 400, message: "Não foi possível transcrever o áudio." };
    logServerEvent({ level: "warn", requestId, route: "/api/audio/transcribe", event: "transcription_failed", status: safe.status, durationMs: Date.now() - startedAt, errorType: code ?? "request_error" });
    return respond(safe.message, safe.status);
  }
}
