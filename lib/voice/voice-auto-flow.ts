import {
  CHAT_MESSAGE_LENGTH_ERROR,
  isChatMessageTooLong,
} from "@/lib/chat/message-limits";

/**
 * Pacote 18.4 — VOICE BETA: AUTO SEND + AUTO READ.
 *
 * Módulo de coordenação do fluxo de voz (estado em memória, SEM banco e SEM
 * migration):
 *
 * 1. `resolveVoiceTranscript` decide se uma transcrição vai ao pipeline normal
 *    de envio do chat (auto-send), volta para o composer ou é rejeitada.
 * 2. `beginVoiceTurn`/`shouldAutoReadVoiceResponse` guardam o turno de voz para
 *    que a RESPOSTA correspondente da Nira seja lida automaticamente (auto-read)
 *    exatamente uma vez. Mensagens digitadas nunca criam turno.
 * 3. A fase do fluxo (LISTENING → TRANSCRIBING → SENDING → THINKING →
 *    SPEAKING → IDLE) fica exposta para UI e testes.
 *
 * Nenhum provider é chamado aqui; nenhum custo é incorrido. A leitura usa
 * somente o Browser TTS local (Web Speech do navegador).
 */

/** Fases esperadas do fluxo de voz do Pacote 18.4. */
export type VoiceFlowPhase =
  | "idle"
  | "listening"
  | "transcribing"
  | "sending"
  | "thinking"
  | "speaking";

/**
 * Comportamento Beta desejado: AUTO SEND = ON e AUTO READ = ON.
 * Preparação para configuração futura sem migration: podem ser sobrescritos
 * localmente (localStorage) sem tocar em banco.
 */
export const VOICE_AUTO_SEND_DEFAULT = true;
export const VOICE_AUTO_READ_DEFAULT = true;

const VOICE_AUTO_SEND_STORAGE_KEY = "hanira:voice-auto-send";
const VOICE_AUTO_READ_STORAGE_KEY = "hanira:voice-auto-read";

function readLocalFlag(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === "true") return true;
    if (raw === "false") return false;
    return fallback;
  } catch {
    // localStorage indisponível (modo privado/SSR): mantém o padrão Beta.
    return fallback;
  }
}

/** AUTO SEND do fluxo de voz (Beta = ON por padrão). */
export function isVoiceAutoSendEnabled(): boolean {
  return readLocalFlag(VOICE_AUTO_SEND_STORAGE_KEY, VOICE_AUTO_SEND_DEFAULT);
}

/** AUTO READ do fluxo de voz (Beta = ON por padrão). */
export function isVoiceAutoReadEnabled(): boolean {
  return readLocalFlag(VOICE_AUTO_READ_STORAGE_KEY, VOICE_AUTO_READ_DEFAULT);
}

/* -------------------------------------------------------------------------- */
/* Fase do fluxo de voz                                                       */
/* -------------------------------------------------------------------------- */

let phase: VoiceFlowPhase = "idle";
const phaseListeners = new Set<(value: VoiceFlowPhase) => void>();

export function getVoiceFlowPhase(): VoiceFlowPhase {
  return phase;
}

export function setVoiceFlowPhase(next: VoiceFlowPhase): void {
  if (phase === next) return;
  phase = next;
  for (const listener of [...phaseListeners]) listener(phase);
}

/**
 * Volta para IDLE apenas se a fase atual estiver entre `candidates`.
 * Evita que um recorder encerrado "atropele" a fase de outra operação.
 */
export function setVoiceFlowPhaseToIdleIf(...candidates: VoiceFlowPhase[]): void {
  if (candidates.includes(phase)) setVoiceFlowPhase("idle");
}

export function subscribeVoiceFlowPhase(
  listener: (value: VoiceFlowPhase) => void,
): () => void {
  phaseListeners.add(listener);
  return () => {
    phaseListeners.delete(listener);
  };
}

/* -------------------------------------------------------------------------- */
/* Turno de voz (auto-read)                                                   */
/* -------------------------------------------------------------------------- */

/** Id da mensagem de ASSISTENTE aguardando leitura automática (slot único). */
let voiceTurn: string | null = null;
/** Mensagens já lidas automaticamente (evita replay em remount). */
const autoReadCompleted = new Set<string>();

/**
 * Marca que o envio atual veio do microfone: a resposta com este id será lida
 * automaticamente quando concluir. Slot único — um turno novo substitui o
 * anterior (nunca há duas falas concorrentes planejadas).
 */
export function beginVoiceTurn(assistantId: string): void {
  voiceTurn = assistantId;
}

/** Descarta o turno (erro, aborto, resposta vazia ou incompatível). */
export function cancelVoiceTurn(): void {
  voiceTurn = null;
}

export function getVoiceTurnAssistantId(): string | null {
  return voiceTurn;
}

/**
 * true somente para a mensagem de ASSISTENTE que respondeu a um turno de voz
 * e cujo auto-read ainda não foi concluído. Mensagens digitadas retornam
 * false porque nunca chamam `beginVoiceTurn`.
 */
export function shouldAutoReadVoiceResponse(assistantId: string): boolean {
  if (!isVoiceAutoReadEnabled()) return false;
  if (!voiceTurn || voiceTurn !== assistantId) return false;
  return !autoReadCompleted.has(assistantId);
}

/**
 * Consome o turno quando o TTS realmente começa a falar. Chamado no `onstart`
 * da utterance para que o duplo efeito de efeitos do React Strict Mode (dev)
 * não perca a leitura, e para que um remount posterior não repita áudio.
 */
export function markVoiceAutoReadStarted(assistantId: string): void {
  if (voiceTurn !== assistantId) return;
  autoReadCompleted.add(assistantId);
  voiceTurn = null;
  setVoiceFlowPhase("speaking");
}

/** Fala automática terminou/foi parada pelo usuário → volta a IDLE. */
export function finishVoiceAutoSpeech(): void {
  setVoiceFlowPhaseToIdleIf("speaking");
}

/**
 * O auto-read não pôde ser concluído (navegador sem TTS, voz do idioma
 * ausente, erro de utterance antes do início). Descarta o turno pendente para
 * a fase não ficar presa em THINKING.
 */
export function failVoiceAutoRead(assistantId: string): void {
  if (voiceTurn !== assistantId) return;
  voiceTurn = null;
  setVoiceFlowPhaseToIdleIf("sending", "thinking");
}

/** Reseta o fluxo (testes/desmontagem). Não remove listeners inscritos. */
export function resetVoiceAutoFlow(): void {
  voiceTurn = null;
  autoReadCompleted.clear();
  phase = "idle";
}


/* -------------------------------------------------------------------------- */
/* Decisão de auto-send                                                       */
/* -------------------------------------------------------------------------- */

export type VoiceTranscriptDecision =
  | { action: "send"; content: string }
  | { action: "draft"; content: string; notice?: string }
  | { action: "reject"; message: string };

export const VOICE_TRANSCRIPT_EMPTY_ERROR =
  "Não consegui transcrever a gravação. Toque no microfone e tente novamente.";

/**
 * Decide o destino de uma transcrição recebida do STT.
 *
 * PROTEÇÕES (Pacote 18.4):
 * - transcript vazio ou só whitespace → `reject` (nunca envia);
 * - transcript + draft acima do limite → `reject` (nunca envia);
 * - Nira pensando → `draft` (nunca envia agora; preserva o texto);
 * - auto-send desligado → `draft` (comportamento legado de revisão);
 * - caso normal → `send` (vai ao MESMO pipeline de envio de mensagens).
 *
 * A função é pura e determinística: mesma entrada → mesma decisão
 * (garantia de 1 gravação = 1 decisão = 1 envio).
 */
export function resolveVoiceTranscript(input: {
  transcript: string;
  draft: string;
  isThinking: boolean;
  autoSendEnabled?: boolean;
}): VoiceTranscriptDecision {
  const transcript = input.transcript.trim();
  if (!transcript) {
    return { action: "reject", message: VOICE_TRANSCRIPT_EMPTY_ERROR };
  }

  const draft = input.draft.trim();
  const content = draft ? `${draft} ${transcript}` : transcript;
  if (isChatMessageTooLong(content)) {
    return { action: "reject", message: CHAT_MESSAGE_LENGTH_ERROR };
  }

  if (input.isThinking) {
    return {
      action: "draft",
      content,
      notice:
        "A Nira ainda está respondendo. A transcrição ficou no campo de texto — envie quando quiser.",
    };
  }

  const autoSendEnabled = input.autoSendEnabled ?? isVoiceAutoSendEnabled();
  if (!autoSendEnabled) {
    return { action: "draft", content };
  }

  return { action: "send", content };
}

