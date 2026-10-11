import {
  STT_ACCEPTED_AUDIO_MIME_TYPES,
  audioContainerFamilyOfMime,
  detectAudioContainerFamily,
  normalizeAudioMimeType,
} from "@/lib/media/audio-format";

export const STT_MAX_RECORDING_SECONDS = 60;
export const STT_MAX_AUDIO_BYTES = 4 * 1024 * 1024;
export const STT_MAX_REQUEST_BYTES = STT_MAX_AUDIO_BYTES + 128 * 1024;

export class SttAudioValidationError extends Error {
  constructor(readonly code: "invalid_request" | "unsupported_format" | "payload_too_large") {
    super(code);
  }
}

// Validação server-side fail-closed e independente do nome/extensão declarados:
//  1) o MIME declarado precisa estar na allow-list de tipos aceitos;
//  2) o container é detectado pelos bytes reais (assinatura/magic bytes);
//  3) a família do container detectado precisa coincidir com a do MIME declarado.
// Assim um cliente não pode declarar audio/webm e enviar bytes MP4/M4A/Ogg, nem
// inventar container. Nada de áudio, Base64 ou transcrição é registrado.
export async function validateSttAudio(file: File): Promise<Uint8Array> {
  if (!file.size) throw new SttAudioValidationError("invalid_request");
  if (file.size > STT_MAX_AUDIO_BYTES) throw new SttAudioValidationError("payload_too_large");
  const declared = normalizeAudioMimeType(file.type);
  if (!(STT_ACCEPTED_AUDIO_MIME_TYPES as readonly string[]).includes(declared)) {
    throw new SttAudioValidationError("unsupported_format");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const detected = detectAudioContainerFamily(bytes);
  if (!detected || detected !== audioContainerFamilyOfMime(declared)) {
    throw new SttAudioValidationError("unsupported_format");
  }
  return bytes;
}

export async function readBoundedSttBody(request: Request): Promise<Uint8Array> {
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > STT_MAX_REQUEST_BYTES)) {
    throw new SttAudioValidationError("payload_too_large");
  }
  if (!request.body) throw new SttAudioValidationError("invalid_request");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > STT_MAX_REQUEST_BYTES) throw new SttAudioValidationError("payload_too_large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
  return body;
}
