import { createRequestId } from "@/lib/logging/server";
import { isDiagnosticsAllowed } from "@/lib/media/audio-diagnostics-access";
import { describeAudioValidation } from "@/lib/media/audio-diagnostics";
import {
  STT_MAX_REQUEST_BYTES,
  readBoundedSttBody,
  SttAudioValidationError,
} from "@/lib/validation/stt-audio";

export const dynamic = "force-dynamic";

// Package 18.3.3 — endpoint de diagnóstico SOMENTE para validar captura,
// formato e container. NÃO chama provider, NÃO transcreve, NÃO persiste e NÃO
// guarda o body após a validação. Disponível apenas em development ou Vercel
// preview; em produção principal responde 404.
export async function POST(request: Request) {
  const requestId = createRequestId(request);
  const unavailable = () =>
    Response.json(
      { error: "indisponivel", requestId },
      { status: 404, headers: { "X-Request-ID": requestId, "Cache-Control": "no-store" } },
    );

  if (!isDiagnosticsAllowed(process.env)) return unavailable();

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
    return Response.json(
      { error: "Envie um arquivo de áudio.", requestId },
      { status: 400, headers: { "X-Request-ID": requestId, "Cache-Control": "no-store" } },
    );
  }

  let body: Uint8Array;
  try {
    body = await readBoundedSttBody(request);
  } catch (error) {
    const status = error instanceof SttAudioValidationError && error.code === "payload_too_large" ? 413 : 400;
    return Response.json(
      { error: "requisicao_invalida", requestId },
      { status, headers: { "X-Request-ID": requestId, "Cache-Control": "no-store" } },
    );
  }

  const upload = new Request("http://localhost/audio", {
    method: "POST",
    headers: { "content-type": contentType },
    body: Uint8Array.from(body).buffer,
  });
  const form = await upload.formData();
  const audio = form.get("audio");
  if (
    !(audio instanceof File) ||
    form.getAll("audio").length !== 1 ||
    [...form.values()].filter((value) => value instanceof File).length !== 1
  ) {
    return Response.json(
      { error: "Envie um único arquivo de áudio.", requestId },
      { status: 400, headers: { "X-Request-ID": requestId, "Cache-Control": "no-store" } },
    );
  }

  const result = await describeAudioValidation(audio);
  // Nenhum byte/áudio/Base64 é retornado — apenas metadados seguros.
  return Response.json(
    { ...result, maxBytes: STT_MAX_REQUEST_BYTES, requestId },
    { status: 200, headers: { "X-Request-ID": requestId, "Cache-Control": "no-store" } },
  );
}
