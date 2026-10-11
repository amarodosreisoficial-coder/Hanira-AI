// Package 18.3.3 — Real Device Audio Validation Harness.
// Funções puras compartilhadas pelo harness de diagnóstico:
//   - descrição de metadados seguros a partir de um áudio (sem IA, sem
//     persistência, sem expor bytes/Base64/transcrição);
//   - construção de relatório sanitizado para o usuário copiar.
//
// Nenhuma dessas funções chama provider, grava em disco ou retorna conteúdo
// de áudio. A validação de container reusa lib/validation/stt-audio.ts.

import {
  STT_ACCEPTED_AUDIO_MIME_TYPES,
  STT_RECORDER_MIME_CANDIDATES,
  audioContainerFamilyOfMime,
  audioExtensionForMimeType,
  detectAudioContainerFamily,
  normalizeAudioMimeType,
} from "@/lib/media/audio-format";
import {
  STT_MAX_AUDIO_BYTES,
  SttAudioValidationError,
  validateSttAudio,
} from "@/lib/validation/stt-audio";

export interface AudioValidationResult {
  valid: boolean;
  declaredMime: string;
  normalizedMime: string;
  detectedContainerFamily: string;
  resolvedExtension: string;
  sizeBytes: number;
  reason: string;
}

/** Executa SOMENTE a validação de formato/container (a mesma do STT) e devolve
 *  metadados seguros. Não transcreve, não chama provider, não persiste.
 *  Nunca lança: toda rejeição vira `valid: false` + `reason` segura. */
export async function describeAudioValidation(
  file: File,
): Promise<AudioValidationResult> {
  const declaredMime = file.type ?? "";
  const normalizedMime = normalizeAudioMimeType(declaredMime);
  const base = {
    declaredMime,
    normalizedMime,
    resolvedExtension: audioExtensionForMimeType(normalizedMime),
    sizeBytes: file.size,
  };
  const fail = (reason: string): AudioValidationResult => ({
    ...base,
    valid: false,
    detectedContainerFamily: "",
    reason,
  });
  try {
    // Reaproveita a validação fail-closed existente (allow-list + assinatura +
    // família cruzada + teto de 4 MiB). O retorno (bytes) é descartado.
    await validateSttAudio(file);
  } catch (error) {
    const reason =
      error instanceof SttAudioValidationError ? error.code : "invalid_request";
    // Ainda calculamos a família detectada quando havia bytes suficientes.
    return fail(reason);
  }
  // Revalidamos a assinatura só para reportar a família detectada (metadado).
  let detectedContainerFamily = "";
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    detectedContainerFamily = detectAudioContainerFamily(bytes);
  } catch {
    detectedContainerFamily = "";
  }
  return {
    ...base,
    valid: true,
    detectedContainerFamily,
    reason: "ok",
  };
}

export interface AudioDiagnosticSnapshot {
  secureContext: boolean;
  mediaDevices: boolean;
  getUserMedia: boolean;
  mediaRecorder: boolean;
  supportedFormats: Record<string, boolean>;
  selectedMime: string;
  mediaRecorderMime: string;
  blobMime: string;
  resolvedMime: string;
  extension: string;
  sizeBytes: number;
  durationSeconds: number;
  playbackAvailable: boolean;
  serverValidation: AudioValidationResult | null;
}

/** Constrói um relatório sanitizado (somente metadados não sensíveis) para o
 *  usuário copiar e colar na conversa. Não inclui áudio, Base64, IP, cookies,
 *  tokens, IDs, credenciais ou qualquer segredo. */
export function buildSanitizedDiagnosticReport(
  snapshot: AudioDiagnosticSnapshot,
): string {
  const report = {
    generatedBy: "Hanira audio diagnostic harness (Package 18.3.3)",
    note:
      "Somente captura, formato e container. Nenhuma transcrição ou chamada de IA foi realizada.",
    environment: {
      secureContext: snapshot.secureContext,
      mediaDevices: snapshot.mediaDevices,
      getUserMedia: snapshot.getUserMedia,
      mediaRecorder: snapshot.mediaRecorder,
    },
    supportedFormats: Object.fromEntries(
      STT_RECORDER_MIME_CANDIDATES.map((mime) => [
        mime,
        Boolean(snapshot.supportedFormats?.[mime]),
      ]),
    ),
    recording: {
      selectedMime: snapshot.selectedMime,
      mediaRecorderMime: snapshot.mediaRecorderMime,
      blobMime: snapshot.blobMime,
      resolvedMime: snapshot.resolvedMime,
      extension: snapshot.extension,
      sizeBytes: snapshot.sizeBytes,
      durationSeconds: snapshot.durationSeconds,
      playbackAvailable: snapshot.playbackAvailable,
    },
    serverValidation: snapshot.serverValidation
      ? {
          valid: snapshot.serverValidation.valid,
          declaredMime: snapshot.serverValidation.declaredMime,
          normalizedMime: snapshot.serverValidation.normalizedMime,
          detectedContainerFamily: snapshot.serverValidation.detectedContainerFamily,
          resolvedExtension: snapshot.serverValidation.resolvedExtension,
          sizeBytes: snapshot.serverValidation.sizeBytes,
          reason: snapshot.serverValidation.reason,
        }
      : null,
  };
  return JSON.stringify(report, null, 2);
}

/** Confirma que um relatório sanitizado não contém marcadores de dados
 *  sensíveis. Usado em testes como rede de segurança. */
export function reportContainsSensitiveMarkers(report: string): boolean {
  const markers = [
    "base64",
    "data:audio",
    "authorization",
    "bearer ",
    "api_token",
    "account_id",
    "cookie",
    "set-cookie",
    "x-forwarded-for",
  ];
  const lower = report.toLowerCase();
  return markers.some((marker) => lower.includes(marker));
}

export const DIAGNOSTIC_MAX_AUDIO_BYTES = STT_MAX_AUDIO_BYTES;
export const DIAGNOSTIC_ACCEPTED_MIME_TYPES = STT_ACCEPTED_AUDIO_MIME_TYPES;
export { audioContainerFamilyOfMime };
