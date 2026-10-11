// Package 18.3.2 — Mobile Audio Compatibility (STT).
// Módulo puro e compartilhado entre cliente (MediaRecorder) e servidor
// (validação). Não depende de DOM nem de APIs "server-only", por isso pode ser
// importado dos dois lados. Objetivo: negociar MIME por capacidade real do
// navegador, mapear extensão pelo container efetivo e detectar o container
// pelos bytes — sem nunca inventar audio/webm e sem confiar no nome/extensão
// declarados pelo cliente.

/** Candidatos de MIME oferecidos ao MediaRecorder, em ordem de prioridade.
 *  WebM/Opus primeiro (desktop), depois Ogg, depois MP4/M4A para Safari/iOS e
 *  engines que preferem MP4. Nada aqui é forçado: só é usado se o navegador
 *  confirmar suporte em runtime. */
export const STT_RECORDER_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/ogg",
  "audio/mp4",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/x-m4a",
  "audio/m4a",
] as const;

/** MIME (normalizados, sem codecs) aceitos pelo pipeline de STT. */
export const STT_ACCEPTED_AUDIO_MIME_TYPES = [
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/m4a",
] as const;

export type SttAudioExtension = "webm" | "ogg" | "mp4" | "m4a";

/** Famílias de container detectáveis por bytes mágicos. MP4 cobre mp4 e m4a. */
export type AudioContainerFamily = "webm" | "ogg" | "mp4";

export interface ResolvedAudioFormat {
  mimeType: string;
  extension: SttAudioExtension;
}

/** Normaliza um MIME que pode conter codecs/parâmetros/espaços/maiúsculas
 *  para a forma mínima "type/subtype" em minúsculas. Ex.:
 *  "Audio/MP4;codecs=mp4a.40.2" -> "audio/mp4". */
export function normalizeAudioMimeType(mime: string | null | undefined): string {
  return (mime ?? "").split(";")[0].trim().toLowerCase();
}

export function isSupportedSttAudioMimeType(mime: string): boolean {
  return (STT_ACCEPTED_AUDIO_MIME_TYPES as readonly string[]).includes(
    normalizeAudioMimeType(mime),
  );
}

/** Escolhe o primeiro candidato que o navegador realmente suporta.
 *  A sonda é defensiva: se `isTypeSupported` lançar (comum em Safari antigo),
 *  o candidato é tratado como não suportado. Retorna "" se nenhum servir. */
export function selectRecorderMimeType(
  isTypeSupported: (mime: string) => boolean,
  candidates: readonly string[] = STT_RECORDER_MIME_CANDIDATES,
): string {
  for (const type of candidates) {
    let supported = false;
    try {
      supported = isTypeSupported(type);
    } catch {
      supported = false;
    }
    if (supported) return type;
  }
  return "";
}

/** Mapeia um MIME (com ou sem codecs) para a extensão de arquivo correta, ou
 *  "" se o container não puder ser determinado com segurança. */
export function audioExtensionForMimeType(mime: string): SttAudioExtension | "" {
  switch (normalizeAudioMimeType(mime)) {
    case "audio/webm":
      return "webm";
    case "audio/ogg":
      return "ogg";
    case "audio/mp4":
      return "mp4";
    case "audio/x-m4a":
    case "audio/m4a":
      return "m4a";
    default:
      return "";
  }
}

/** Determina o formato efetivo de um blob gravado. Prefere o MIME realmente
 *  reportado por MediaRecorder/Blob e recorre ao MIME solicitado. Retorna null
 *  quando nenhum dos dois mapeia para um container conhecido, para o chamador
 *  falhar de forma clara em vez de adivinhar (nunca inventar audio/webm). */
export function resolveRecordedAudioFormat(
  reportedMime: string,
  requestedMime: string,
): ResolvedAudioFormat | null {
  for (const candidate of [reportedMime, requestedMime]) {
    const extension = audioExtensionForMimeType(candidate);
    if (extension) {
      return { mimeType: normalizeAudioMimeType(candidate), extension };
    }
  }
  return null;
}

/** Mapeia um MIME para a família de container, ou "" se desconhecido. */
export function audioContainerFamilyOfMime(mime: string): AudioContainerFamily | "" {
  switch (normalizeAudioMimeType(mime)) {
    case "audio/webm":
      return "webm";
    case "audio/ogg":
      return "ogg";
    case "audio/mp4":
    case "audio/x-m4a":
    case "audio/m4a":
      return "mp4";
    default:
      return "";
  }
}

/** Detecta a família de container pelos bytes mágicos, independente de
 *  qualquer MIME declarado. WebM/Matroska usa cabeçalho EBML 1A 45 DF A3;
 *  Ogg começa com "OggS"; MP4/M4A traz a caixa "ftyp" no offset 4. */
export function detectAudioContainerFamily(
  bytes: Uint8Array,
): AudioContainerFamily | "" {
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    return "webm";
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x4f && // "O"
    bytes[1] === 0x67 && // "g"
    bytes[2] === 0x67 && // "g"
    bytes[3] === 0x53 // "S"
  ) {
    return "ogg";
  }
  if (
    bytes.length >= 8 &&
    bytes[4] === 0x66 && // "f"
    bytes[5] === 0x74 && // "t"
    bytes[6] === 0x79 && // "y"
    bytes[7] === 0x70 // "p"
  ) {
    return "mp4";
  }
  return "";
}
