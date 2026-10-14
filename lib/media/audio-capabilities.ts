// Package 18.3.7 — Mobile / Cross-browser STT Compatibility.
// Camada pequena, PURA e testável para:
//   1) classificar erros de captura (getUserMedia / MediaRecorder) em
//      categorias estáveis, cada uma com uma mensagem amigável em pt-BR;
//   2) detectar capacidades reais de gravação por CAPABILITY DETECTION
//      (nunca por user-agent): secure context, mediaDevices, getUserMedia,
//      MediaRecorder, suporte a pause/resume, MIME suportado e MIME escolhido.
//
// Este módulo NÃO depende de DOM: toda leitura de ambiente é injetada, para
// que o fluxo inteiro seja testável sem navegador. A negociação de MIME é
// REAPROVEITADA de lib/media/audio-format.ts (Package 18.3.2) — nada aqui
// duplica ou substitui aquela lógica. Nenhuma inferência STT, nenhuma chamada
// externa, nenhum provider: apenas classificação e detecção de capacidade.

import {
  STT_RECORDER_MIME_CANDIDATES,
  selectRecorderMimeType,
} from "@/lib/media/audio-format";

/** Categorias estáveis de falha de captura (fail-closed). */
export type CaptureErrorKind =
  | "permission_denied"
  | "no_device"
  | "device_in_use"
  | "insecure_context"
  | "unsupported_constraints"
  | "aborted"
  | "recorder_error"
  | "no_supported_mime"
  | "unsupported_browser"
  | "unknown";

/** Mensagens amigáveis (pt-BR) por categoria. Nunca expõe texto técnico cru
 *  de DOMException ao usuário; mantém a UI no padrão da Hanira. */
const CAPTURE_ERROR_MESSAGES: Record<CaptureErrorKind, string> = {
  permission_denied:
    "Permissão do microfone negada. Libere o acesso nas configurações do navegador.",
  no_device: "Nenhum microfone foi encontrado neste dispositivo.",
  device_in_use:
    "O microfone está em uso por outro aplicativo. Feche-o e tente novamente.",
  insecure_context:
    "Contexto não seguro. Use HTTPS (ou localhost) para acessar o microfone.",
  unsupported_constraints:
    "Este navegador não aceitou os requisitos de captura de áudio.",
  aborted: "A captura de áudio foi cancelada.",
  recorder_error: "A gravação foi interrompida pelo navegador.",
  no_supported_mime:
    "Este navegador não oferece um formato de gravação compatível.",
  unsupported_browser: "Este navegador não oferece gravação de áudio.",
  unknown: "Não foi possível acessar o microfone.",
};

/** Retorna a mensagem amigável de uma categoria (fallback: "unknown"). */
export function captureErrorMessage(kind: CaptureErrorKind): string {
  return CAPTURE_ERROR_MESSAGES[kind] ?? CAPTURE_ERROR_MESSAGES.unknown;
}

/** Classifica um erro de getUserMedia/MediaRecorder a partir do `name` do
 *  DOMException (quando disponível), sem confiar em user-agent. Cobertura dos
 *  nomes padronizados pela especificação Media Capture:
 *  - NotAllowedError / PermissionDeniedError -> permissão negada;
 *  - NotFoundError / DevicesNotFoundError    -> nenhum dispositivo;
 *  - NotReadableError / TrackStartError      -> hardware ocupado/ilegível;
 *  - SecurityError                          -> contexto inseguro/bloqueado;
 *  - OverconstrainedError / ConstraintNotSatisfiedError -> constraints;
 *  - AbortError                              -> captura abortada.
 *  Qualquer outro nome (ou ausência de DOMException) cai em "unknown". */
export function classifyCaptureError(error: unknown): CaptureErrorKind {
  const name = extractErrorName(error);
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return "permission_denied";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "no_device";
    case "NotReadableError":
    case "TrackStartError":
      return "device_in_use";
    case "SecurityError":
      return "insecure_context";
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      return "unsupported_constraints";
    case "AbortError":
      return "aborted";
    default:
      return "unknown";
  }
}

/** Extrai o `name` de um erro de forma defensiva (Error ou objeto com `name`). */
function extractErrorName(error: unknown): string {
  if (error instanceof Error) return error.name;
  if (error && typeof error === "object" && "name" in error) {
    return String((error as { name?: unknown }).name ?? "");
  }
  return "";
}

/** Ambiente de recorder injetável — tudo opcional para permitir testes e SSR. */
export interface RecorderEnvironment {
  isSecureContext: boolean;
  hasMediaDevices: boolean;
  hasGetUserMedia: boolean;
  hasMediaRecorder: boolean;
  /** Sonda defensiva: retorna se um MIME é suportado; pode lançar em engines
   *  antigas, e o chamador trata exceção como "não suportado". */
  isTypeSupported: (mime: string) => boolean;
  /** true quando MediaRecorder.prototype expõe pause() (capability, não UA). */
  hasPause: boolean;
  /** true quando MediaRecorder.prototype expõe resume() (capability, não UA). */
  hasResume: boolean;
}

/** Snapshot de capacidades reais de gravação do dispositivo. */
export interface RecorderCapabilities {
  secureContext: boolean;
  mediaDevices: boolean;
  getUserMedia: boolean;
  mediaRecorder: boolean;
  /** pause/resume só contam como suportados se AMBOS existirem. */
  pauseResumeSupported: boolean;
  supportedFormats: Record<string, boolean>;
  /** MIME escolhido pela negociação centralizada ("" se nenhum). */
  selectedMime: string;
}

/** Detecta capacidades por capability detection. Reaproveita
 *  selectRecorderMimeType (18.3.2) e trata isTypeSupported como potencialmente
 *  lançável. Nenhuma engine é tratada por user-agent. */
export function detectRecorderCapabilities(
  env: RecorderEnvironment,
): RecorderCapabilities {
  const supportedFormats: Record<string, boolean> = {};
  const probe = (mime: string): boolean => {
    if (!env.hasMediaRecorder) return false;
    try {
      return Boolean(env.isTypeSupported(mime));
    } catch {
      return false;
    }
  };
  for (const mime of STT_RECORDER_MIME_CANDIDATES) {
    supportedFormats[mime] = probe(mime);
  }
  const selectedMime = env.hasMediaRecorder ? selectRecorderMimeType(probe) : "";
  return {
    secureContext: Boolean(env.isSecureContext),
    mediaDevices: Boolean(env.hasMediaDevices),
    getUserMedia: Boolean(env.hasGetUserMedia),
    mediaRecorder: Boolean(env.hasMediaRecorder),
    pauseResumeSupported: Boolean(
      env.hasMediaRecorder && env.hasPause && env.hasResume,
    ),
    supportedFormats,
    selectedMime,
  };
}

/** true quando o dispositivo está tecnicamente apto a capturar (fail-closed):
 *  exige contexto seguro, APIs presentes, MediaRecorder e um MIME negociado. */
export function canCaptureAudio(caps: RecorderCapabilities): boolean {
  return Boolean(
    caps.secureContext &&
      caps.mediaDevices &&
      caps.getUserMedia &&
      caps.mediaRecorder &&
      caps.selectedMime,
  );
}

/** Lê o ambiente de recorder a partir de window/navigator no cliente. Em SSR
 *  (sem window/navigator) retorna um ambiente neutro/tudo-false, fail-closed. */
export function readRecorderEnvironment(): RecorderEnvironment {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return {
      isSecureContext: false,
      hasMediaDevices: false,
      hasGetUserMedia: false,
      hasMediaRecorder: false,
      isTypeSupported: () => false,
      hasPause: false,
      hasResume: false,
    };
  }
  const hasMediaRecorder = Boolean(window.MediaRecorder);
  const proto = hasMediaRecorder
    ? (
        window.MediaRecorder as unknown as {
          prototype?: Record<string, unknown>;
        }
      ).prototype
    : undefined;
  return {
    isSecureContext: Boolean(window.isSecureContext),
    hasMediaDevices: Boolean(navigator.mediaDevices),
    hasGetUserMedia: Boolean(navigator.mediaDevices?.getUserMedia),
    hasMediaRecorder,
    isTypeSupported: (mime: string) => {
      if (!hasMediaRecorder) return false;
      try {
        return window.MediaRecorder.isTypeSupported(mime);
      } catch {
        return false;
      }
    },
    hasPause: Boolean(proto && typeof proto.pause === "function"),
    hasResume: Boolean(proto && typeof proto.resume === "function"),
  };
}

/** Atalho de cliente: lê o ambiente e detecta capacidades em uma chamada. */
export function detectClientRecorderCapabilities(): RecorderCapabilities {
  return detectRecorderCapabilities(readRecorderEnvironment());
}
