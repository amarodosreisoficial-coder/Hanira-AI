export const STT_MAX_RECORDING_SECONDS = 60;
export const STT_MAX_AUDIO_BYTES = 4 * 1024 * 1024;
export const STT_MAX_REQUEST_BYTES = STT_MAX_AUDIO_BYTES + 128 * 1024;

const signatures: Record<string, (bytes: Uint8Array) => boolean> = {
  "audio/webm": (b) => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3,
  "audio/ogg": (b) => String.fromCharCode(...b.slice(0, 4)) === "OggS",
  "audio/mp4": (b) => String.fromCharCode(...b.slice(4, 8)) === "ftyp",
  "audio/x-m4a": (b) => String.fromCharCode(...b.slice(4, 8)) === "ftyp",
};

export class SttAudioValidationError extends Error {
  constructor(readonly code: "invalid_request" | "unsupported_format" | "payload_too_large") {
    super(code);
  }
}

export async function validateSttAudio(file: File): Promise<Uint8Array> {
  if (!file.size) throw new SttAudioValidationError("invalid_request");
  if (file.size > STT_MAX_AUDIO_BYTES) throw new SttAudioValidationError("payload_too_large");
  const mime = file.type.split(";")[0].toLowerCase();
  const signature = signatures[mime];
  if (!signature) throw new SttAudioValidationError("unsupported_format");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!signature(bytes)) throw new SttAudioValidationError("unsupported_format");
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
