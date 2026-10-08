import "server-only";

export type TranscriptionErrorCode =
  | "authentication" | "invalid_configuration" | "invalid_request"
  | "unsupported_format" | "payload_too_large" | "rate_limit"
  | "free_capacity_exhausted" | "provider_capacity" | "provider_error"
  | "timeout" | "network_error" | "malformed_response";

export class TranscriptionError extends Error {
  constructor(readonly code: TranscriptionErrorCode) {
    super(code);
    this.name = "TranscriptionError";
  }
}

export interface TranscriptionProvider {
  transcribe(audio: Uint8Array, signal?: AbortSignal): Promise<string>;
}

export function publicTranscriptionError(code: TranscriptionErrorCode) {
  if (code === "payload_too_large") return { status: 413, message: "O áudio excede o limite de 4 MiB." };
  if (code === "unsupported_format" || code === "invalid_request") return { status: 400, message: "O formato do áudio não é compatível." };
  if (code === "rate_limit" || code === "free_capacity_exhausted" || code === "provider_capacity") return { status: 429, message: "A capacidade gratuita de transcrição está indisponível. Tente mais tarde." };
  if (code === "invalid_configuration" || code === "authentication") return { status: 503, message: "A transcrição está indisponível nesta instância." };
  if (code === "timeout" || code === "network_error") return { status: 503, message: "Não foi possível conectar ao serviço de transcrição." };
  return { status: 502, message: "Não foi possível transcrever o áudio." };
}
