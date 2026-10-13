// Package 18.3.3.1 — Automatic Real-Device Audio Test.
// Núcleo puro e injetável do teste automático de áudio. NÃO chama provider,
// NÃO faz STT/IA, NÃO consome Neurons e NÃO persiste áudio. Toda interação de
// browser (getUserMedia, MediaRecorder, Blob/File, timers, fetch de validação)
// é injetada, para que o fluxo inteiro seja testável sem DOM.

import {
  STT_RECORDER_MIME_CANDIDATES,
  resolveRecordedAudioFormat,
  selectRecorderMimeType,
} from "@/lib/media/audio-format";
import { STT_MAX_AUDIO_BYTES } from "@/lib/validation/stt-audio";
import type { AudioValidationResult } from "@/lib/media/audio-diagnostics";

export type AutoTestState =
  | "IDLE"
  | "REQUESTING_PERMISSION"
  | "RECORDING"
  | "STOPPING"
  | "ANALYZING"
  | "SERVER_VALIDATING"
  | "COMPLETE"
  | "ERROR"
  | "CANCELLED";

export type BrowserFamily = "Chrome-like" | "Edge-like" | "Safari-like" | "Unknown";

/** Duração alvo da gravação automática, em segundos. */
export const AUTO_TEST_RECORDING_SECONDS = 5;

export interface AutoTestFeatureSnapshot {
  secureContext: boolean;
  mediaDevices: boolean;
  getUserMedia: boolean;
  mediaRecorder: boolean;
  supportedFormats: Record<string, boolean>;
  selectedMime: string;
}

export interface AutoTestRecordingInfo {
  mediaRecorderMime: string;
  blobMime: string;
  resolvedMime: string;
  extension: string;
  sizeBytes: number;
  durationSeconds: number;
  playbackUrl: string;
}

export interface AutoTestResult {
  state: AutoTestState;
  overall: boolean;
  failureReason: string | null;
  recording: AutoTestRecordingInfo | null;
  serverValidation: AudioValidationResult | null;
  browserFamily: BrowserFamily;
}

/** Detecta a família do navegador de forma simples e NÃO invasiva (somente para
 *  o relatório; nunca para escolher codec). Edge (Chromium) é checado antes de
 *  Chrome porque o UA do Edge contém "Chrome". */
export function detectBrowserFamily(userAgent: string): BrowserFamily {
  const ua = (userAgent ?? "").toLowerCase();
  if (ua.includes("edg")) return "Edge-like";
  if (ua.includes("chrome") || ua.includes("chromium")) return "Chrome-like";
  if (ua.includes("safari") && !ua.includes("chrome") && !ua.includes("chromium")) {
    return "Safari-like";
  }
  return "Unknown";
}

export interface AutoTestOverallInput {
  secureContext: boolean;
  mediaDevices: boolean;
  getUserMedia: boolean;
  mediaRecorder: boolean;
  formatSelected: boolean;
  recordingGenerated: boolean;
  blobNonEmpty: boolean;
  mimeResolved: boolean;
  extensionResolved: boolean;
  withinSizeLimit: boolean;
  serverValidationValid: boolean;
}

/** OVERALL = PASS somente se todos os gates essenciais passarem. Playback é
 *  informado separadamente e NÃO bloqueia o OVERALL quando Blob/container são
 *  válidos. Retorna o primeiro motivo de falha encontrado (fail-closed). */
export function computeAutoTestOverall(
  input: AutoTestOverallInput,
): { overall: boolean; failureReason: string | null } {
  if (!input.secureContext) return { overall: false, failureReason: "insecure_context" };
  if (!input.mediaDevices) return { overall: false, failureReason: "media_devices_unavailable" };
  if (!input.getUserMedia) return { overall: false, failureReason: "get_user_media_unavailable" };
  if (!input.mediaRecorder) return { overall: false, failureReason: "media_recorder_unavailable" };
  if (!input.formatSelected) return { overall: false, failureReason: "no_supported_format" };
  if (!input.recordingGenerated) return { overall: false, failureReason: "recording_not_generated" };
  if (!input.blobNonEmpty) return { overall: false, failureReason: "empty_blob" };
  if (!input.mimeResolved) return { overall: false, failureReason: "mime_unresolved" };
  if (!input.extensionResolved) return { overall: false, failureReason: "extension_unresolved" };
  if (!input.withinSizeLimit) return { overall: false, failureReason: "payload_too_large" };
  if (!input.serverValidationValid) return { overall: false, failureReason: "server_validation_failed" };
  return { overall: true, failureReason: null };
}

export interface Cancellation {
  cancelled: boolean;
  cancel: () => void;
  promise: Promise<"cancelled">;
}

/** Token de cancelamento cooperativo para o fluxo automático. */
export function createCancellation(): Cancellation {
  let resolvePromise: (value: "cancelled") => void = () => {};
  const promise = new Promise<"cancelled">((resolve) => {
    resolvePromise = resolve;
  });
  return {
    cancelled: false,
    cancel() {
      this.cancelled = true;
      resolvePromise("cancelled");
    },
    promise,
  };
}

export interface AutoTestReportInput {
  features: AutoTestFeatureSnapshot;
  recording: AutoTestRecordingInfo | null;
  serverValidation: AudioValidationResult | null;
  overall: boolean;
  failureReason: string | null;
  browserFamily: BrowserFamily;
  playbackAvailable: boolean;
}

/** Constrói o relatório sanitizado do teste automático. Contém apenas
 *  metadados não sensíveis: ambiente, formatos, gravação, validação, overall,
 *  failureReason e browserFamily. Sem áudio, Base64, IP, cookies, tokens, IDs,
 *  headers privados, secrets ou credenciais. */
export function buildAutoTestReport(input: AutoTestReportInput): string {
  const report = {
    generatedBy: "Hanira automatic real-device audio test (Package 18.3.3.1)",
    note:
      "Somente captura, formato e container. Nenhuma transcrição ou chamada de IA foi realizada.",
    browserFamily: input.browserFamily,
    environment: {
      secureContext: input.features.secureContext,
      mediaDevices: input.features.mediaDevices,
      getUserMedia: input.features.getUserMedia,
      mediaRecorder: input.features.mediaRecorder,
    },
    supportedFormats: Object.fromEntries(
      STT_RECORDER_MIME_CANDIDATES.map((mime) => [
        mime,
        Boolean(input.features.supportedFormats?.[mime]),
      ]),
    ),
    recording: input.recording
      ? {
          selectedMime: input.features.selectedMime,
          mediaRecorderMime: input.recording.mediaRecorderMime,
          blobMime: input.recording.blobMime,
          resolvedMime: input.recording.resolvedMime,
          extension: input.recording.extension,
          sizeBytes: input.recording.sizeBytes,
          durationSeconds: input.recording.durationSeconds,
          playbackAvailable: input.playbackAvailable,
        }
      : null,
    serverValidation: input.serverValidation
      ? {
          valid: input.serverValidation.valid,
          declaredMime: input.serverValidation.declaredMime,
          normalizedMime: input.serverValidation.normalizedMime,
          detectedContainerFamily: input.serverValidation.detectedContainerFamily,
          resolvedExtension: input.serverValidation.resolvedExtension,
          sizeBytes: input.serverValidation.sizeBytes,
          reason: input.serverValidation.reason,
        }
      : null,
    overall: input.overall ? "PASS" : "FAIL",
    failureReason: input.failureReason,
  };
  return JSON.stringify(report, null, 2);
}


// ---------------------------------------------------------------------------
// Orquestrador injetável do teste automático.
// Toda dependência de browser é injetada via `deps`, permitindo testar o fluxo
// completo (permissão → gravação ~5s → stop → análise → validação server →
// overall) sem DOM. Nenhum provider de STT/IA é tocado.
// ---------------------------------------------------------------------------

export interface AutoTestDeps {
  features: AutoTestFeatureSnapshot;
  userAgent: string;
  getUserMedia: () => Promise<MediaStream>;
  createRecorder: (stream: MediaStream, mimeType: string) => MediaRecorder;
  now: () => number;
  setTimeoutFn: (handler: () => void, ms: number) => unknown;
  clearTimeoutFn: (handle: unknown) => void;
  setIntervalFn: (handler: () => void, ms: number) => unknown;
  clearIntervalFn: (handle: unknown) => void;
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
  postValidate: (file: File) => Promise<AudioValidationResult>;
  onState: (state: AutoTestState) => void;
  onCountdown: (remaining: number) => void;
  cancellation: Cancellation;
  stopGraceMs?: number;
}

export async function runAutomaticAudioTest(
  deps: AutoTestDeps,
): Promise<AutoTestResult> {
  const { features, cancellation, onState, onCountdown } = deps;
  const browserFamily = detectBrowserFamily(deps.userAgent);

  const fail = (state: AutoTestState, failureReason: string): AutoTestResult => {
    onState(state);
    return {
      state,
      overall: false,
      failureReason,
      recording: null,
      serverValidation: null,
      browserFamily,
    };
  };

  // 1–4. Gates de capacidade.
  if (!features.secureContext) return fail("ERROR", "insecure_context");
  if (!features.mediaDevices || !features.getUserMedia) {
    return fail("ERROR", "get_user_media_unavailable");
  }
  if (!features.mediaRecorder) return fail("ERROR", "media_recorder_unavailable");

  // 5–6. Seleção do melhor formato suportado (feature detection).
  const selectedMime = selectRecorderMimeType((mime) => {
    try {
      return window.MediaRecorder.isTypeSupported(mime);
    } catch {
      return false;
    }
  }, undefined);
  const effectiveMime = selectedMime || features.selectedMime;
  if (!effectiveMime) return fail("ERROR", "no_supported_format");

  // 7. Solicita microfone.
  onState("REQUESTING_PERMISSION");
  let stream: MediaStream;
  try {
    stream = await deps.getUserMedia();
  } catch (error) {
    const denied =
      error instanceof DOMException &&
      ["NotAllowedError", "PermissionDeniedError", "SecurityError"].includes(error.name);
    onState("ERROR");
    return {
      state: "ERROR",
      overall: false,
      failureReason: denied ? "microphone_permission_denied" : "microphone_unavailable",
      recording: null,
      serverValidation: null,
      browserFamily,
    };
  }
  if (cancellation.cancelled) {
    stream.getTracks().forEach((track) => track.stop());
    onState("CANCELLED");
    return {
      state: "CANCELLED",
      overall: false,
      failureReason: "cancelled",
      recording: null,
      serverValidation: null,
      browserFamily,
    };
  }


  // 8–9. Inicia gravação automática.
  const recorder = deps.createRecorder(stream, effectiveMime);
  const chunks: Blob[] = [];
  let resolveStopped: () => void = () => {};
  const stopped = new Promise<void>((resolve) => {
    resolveStopped = resolve;
  });
  recorder.ondataavailable = (event: BlobEvent) => {
    if (event.data && event.data.size) chunks.push(event.data);
  };
  recorder.onstop = () => resolveStopped();
  recorder.onerror = () => resolveStopped();

  onState("RECORDING");
  const startedAt = deps.now();
  let remaining = AUTO_TEST_RECORDING_SECONDS;
  onCountdown(remaining);
  // 8. Inicia a gravação (timeslice de 250ms para coleta incremental).
  if (recorder.state === "inactive") recorder.start(250);
  const countdownHandle: unknown = deps.setIntervalFn(() => {
    remaining -= 1;
    if (remaining >= 0) onCountdown(remaining);
  }, 1000);

  // 10. Parada automática após ~5 s.
  const stopHandle: unknown = deps.setTimeoutFn(() => {
    if (recorder.state !== "inactive") recorder.stop();
  }, AUTO_TEST_RECORDING_SECONDS * 1000);

  // Cancela de forma segura se o usuário tocar CANCELAR.
  const cancelWatcher = deps.setIntervalFn(() => {
    if (!cancellation.cancelled) return;
    deps.clearIntervalFn(countdownHandle);
    deps.clearTimeoutFn(stopHandle);
    if (recorder.state !== "inactive") recorder.stop();
  }, 200);

  // 11. Aguarda o Blob final.
  await stopped;
  deps.clearIntervalFn(countdownHandle);
  deps.clearTimeoutFn(stopHandle);
  deps.clearIntervalFn(cancelWatcher);
  stream.getTracks().forEach((track) => track.stop());

  if (cancellation.cancelled) {
    onState("CANCELLED");
    return {
      state: "CANCELLED",
      overall: false,
      failureReason: "cancelled",
      recording: null,
      serverValidation: null,
      browserFamily,
    };
  }

  onState("STOPPING");
  // Margem técnica para o evento onstop/ondataavailable final chegar.
  const graceMs = deps.stopGraceMs ?? 0;
  if (graceMs > 0) {
    await new Promise<void>((resolve) => deps.setTimeoutFn(resolve, graceMs));
  }

  // 12–15. Analisa o Blob.
  onState("ANALYZING");
  const reportedMime = typeof recorder.mimeType === "string" ? recorder.mimeType : "";
  const resolved = resolveRecordedAudioFormat(reportedMime, effectiveMime);
  const durationSeconds = Number(((deps.now() - startedAt) / 1000).toFixed(2));
  if (!resolved) return fail("ERROR", "mime_unresolved");
  const blob = new Blob(chunks, { type: resolved.mimeType });
  if (!blob.size) return fail("ERROR", "empty_blob");
  const playbackUrl = deps.createObjectURL(blob);
  const recording: AutoTestRecordingInfo = {
    mediaRecorderMime: reportedMime,
    blobMime: blob.type,
    resolvedMime: resolved.mimeType,
    extension: resolved.extension,
    sizeBytes: blob.size,
    durationSeconds,
    playbackUrl,
  };

  // 16. Validação server-side SEM IA.
  onState("SERVER_VALIDATING");
  const file = new File([blob], `auto.${resolved.extension}`, {
    type: resolved.mimeType,
  });
  let serverValidation: AudioValidationResult;
  try {
    serverValidation = await deps.postValidate(file);
  } catch {
    return fail("ERROR", "server_validation_error");
  }

  // 17. Monta o resultado final.
  onState("COMPLETE");
  const { overall, failureReason } = computeAutoTestOverall({
    secureContext: features.secureContext,
    mediaDevices: features.mediaDevices,
    getUserMedia: features.getUserMedia,
    mediaRecorder: features.mediaRecorder,
    formatSelected: Boolean(effectiveMime),
    recordingGenerated: true,
    blobNonEmpty: blob.size > 0,
    mimeResolved: Boolean(resolved.mimeType),
    extensionResolved: Boolean(resolved.extension),
    withinSizeLimit: blob.size <= STT_MAX_AUDIO_BYTES,
    serverValidationValid: serverValidation.valid,
  });
  return {
    state: "COMPLETE",
    overall,
    failureReason,
    recording,
    serverValidation,
    browserFamily,
  };
}

