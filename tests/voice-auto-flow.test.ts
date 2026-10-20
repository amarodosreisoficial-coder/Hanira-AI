import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { CHAT_MESSAGE_MAX_LENGTH } from "@/lib/chat/message-limits";
import {
  VOICE_AUTO_READ_DEFAULT,
  VOICE_AUTO_SEND_DEFAULT,
  VOICE_TRANSCRIPT_EMPTY_ERROR,
  beginVoiceTurn,
  cancelVoiceTurn,
  failVoiceAutoRead,
  finishVoiceAutoSpeech,
  getVoiceFlowPhase,
  getVoiceTurnAssistantId,
  isVoiceAutoReadEnabled,
  isVoiceAutoSendEnabled,
  markVoiceAutoReadStarted,
  resetVoiceAutoFlow,
  resolveVoiceTranscript,
  setVoiceFlowPhase,
  shouldAutoReadVoiceResponse,
  subscribeVoiceFlowPhase,
} from "@/lib/voice/voice-auto-flow";

const source = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const composer = source("components/chat/chat-composer.tsx");
const recorder = source("components/voice/voice-recorder.tsx");
const controls = source("components/voice/speech-controls.tsx");
const chatMessage = source("components/chat/chat-message.tsx");
const mediaRecorderHook = source("hooks/use-media-recorder.ts");
const voiceFlow = source("lib/voice/voice-auto-flow.ts");

const VALID_TRANSCRIPT = "Olá Nira, estou fazendo um teste de voz.";

describe("Pacote 18.4 — flags Beta (auto-send/auto-read ON, sem migration)", () => {
  it("AUTO SEND e AUTO READ são ON por padrão", () => {
    expect(VOICE_AUTO_SEND_DEFAULT).toBe(true);
    expect(VOICE_AUTO_READ_DEFAULT).toBe(true);
    expect(isVoiceAutoSendEnabled()).toBe(true);
    expect(isVoiceAutoReadEnabled()).toBe(true);
  });

  it("não cria banco/migration para as flags (só estado local)", () => {
    expect(voiceFlow).toContain("hanira:voice-auto-send");
    expect(voiceFlow).toContain("hanira:voice-auto-read");
    // Sem persistence: nada de Supabase/SQL/rota de settings nova.
    expect(voiceFlow).not.toContain("supabase");
    expect(voiceFlow).not.toMatch(/create table|\.sql\b/i);
  });
});

describe("A — transcript válido → auto-send", () => {
  it("decide 'send' com o texto integral", () => {
    const decision = resolveVoiceTranscript({
      transcript: VALID_TRANSCRIPT,
      draft: "",
      isThinking: false,
    });
    expect(decision).toEqual({ action: "send", content: VALID_TRANSCRIPT });
  });

  it("composer entrega a transcrição ao pipeline normal de envio", () => {
    expect(composer).toContain("onComplete={({ text }) => handleVoiceTranscript(text)}");
    expect(composer).toContain("resolveVoiceTranscript");
    expect(composer).toContain(
      "submit(decision.content, false, undefined, { voiceOrigin: true })",
    );
    // O envio é o MESMO submit das mensagens digitadas (mensagem no histórico).
    expect(composer).toContain("store.addMessage(userMessage)");
  });

  it("concatena transcrição ao draft existente sem sobrescrever", () => {
    expect(voiceFlow).toContain("draft ? `${draft} ${transcript}` : transcript");
    const decision = resolveVoiceTranscript({
      transcript: "segue em inglês",
      draft: "Nira, fale",
      isThinking: false,
    });
    expect(decision.action).toBe("send");
    if (decision.action === "send") {
      expect(decision.content).toBe("Nira, fale segue em inglês");
    }
  });
});

describe("B — transcript vazio/whitespace → NÃO envia", () => {
  it.each(["", "   ", "\n\t ", " \r\n "])(
    "rejeita %j com erro amigável",
    (transcript) => {
      const decision = resolveVoiceTranscript({
        transcript,
        draft: "algo",
        isThinking: false,
      });
      expect(decision.action).toBe("reject");
      if (decision.action === "reject") {
        expect(decision.message).toBe(VOICE_TRANSCRIPT_EMPTY_ERROR);
      }
    },
  );

  it("rejeita conteúdo acima do limite sem enviar", () => {
    const decision = resolveVoiceTranscript({
      transcript: "x".repeat(CHAT_MESSAGE_MAX_LENGTH),
      draft: "y",
      isThinking: false,
    });
    expect(decision.action).toBe("reject");
  });

  it("composer encerra antes do submit em reject/draft", () => {
    const start = composer.indexOf("function handleVoiceTranscript");
    const end = composer.indexOf("async function submit(");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = composer.slice(start, end);
    const rejectIndex = block.indexOf('decision.action === "reject"');
    const draftIndex = block.indexOf('decision.action === "draft"');
    const sendIndex = block.indexOf("voiceSendGuardRef.current = true");
    expect(rejectIndex).toBeGreaterThan(-1);
    expect(draftIndex).toBeGreaterThan(rejectIndex);
    expect(sendIndex).toBeGreaterThan(draftIndex);
    expect(block.indexOf("submit(decision.content")).toBeGreaterThan(sendIndex);
  });
});


describe("C — erro do STT → NÃO envia", () => {
  const finishBlock = recorder.slice(
    recorder.indexOf("async function finishAndTranscribe"),
    recorder.indexOf("STT_MAX_RECORDING_SECONDS &&"),
  );

  it("catch do STT mostra erro amigável e não chama onComplete", () => {
    const catchBlock = finishBlock.slice(
      finishBlock.indexOf("} catch (caught)"),
      finishBlock.indexOf("} finally {"),
    );
    expect(catchBlock).toContain('recorder.setStatus("error")');
    expect(catchBlock).not.toContain("onComplete(");
    expect(catchBlock).toContain("Não foi possível transcrever o áudio.");
  });

  it("áudio vazio/inválido não chama onComplete", () => {
    expect(finishBlock).toContain('"A gravação ficou vazia."');
    expect(finishBlock).toContain("STT_MAX_AUDIO_BYTES");
    const emptyBranch = finishBlock.slice(
      finishBlock.indexOf("if (!file)"),
      finishBlock.indexOf('recorder.setStatus("transcribing")'),
    );
    expect(emptyBranch).not.toContain("onComplete(");
  });

  it("sem retry infinito: erro encerra o fluxo e libera nova tentativa", () => {
    expect(finishBlock).toContain("finishingRef.current = false;");
    expect(finishBlock).not.toMatch(/for\s*\(|while\s*\(/);
  });
});

describe("D — cancelamento/aborto → NÃO envia", () => {
  it("botão cancelar aborta a requisição e só chama onCancel", () => {
    let buttonCancels = 0;
    let index = recorder.indexOf("cancelledRef.current = true");
    expect(index).toBeGreaterThan(-1);
    while (index !== -1) {
      const block = recorder.slice(index, index + 320);
      // O cleanup de unmount (sem onCancel) é ignorado aqui; os botões
      // inline e do modal precisam abortar + onCancel e nunca onComplete.
      if (block.includes("onCancel();")) {
        expect(block).toContain("requestRef.current?.abort();");
        expect(block).not.toContain("onComplete(");
        buttonCancels += 1;
      }
      index = recorder.indexOf("cancelledRef.current = true", index + 1);
    }
    expect(buttonCancels).toBe(2);
    expect(composer).toContain("onCancel={() => setRecorderOpen(false)}");
  });

  it("abort da transcrição não entrega transcript ao chat", () => {
    const finishBlock = recorder.slice(
      recorder.indexOf("async function finishAndTranscribe"),
      recorder.indexOf("STT_MAX_RECORDING_SECONDS &&"),
    );
    const abortBranches = finishBlock.split("controller.signal.aborted").length - 1;
    expect(abortBranches).toBeGreaterThanOrEqual(2);
    // Cada branch de aborto retorna ANTES de onComplete.
    for (const piece of finishBlock.split("controller.signal.aborted").slice(1)) {
      const untilReturn = piece.slice(0, piece.indexOf("return;"));
      expect(untilReturn).not.toContain("onComplete(");
    }
  });

  it("desmontagem aborta requisição pendente (cleanup)", () => {
    const start = recorder.indexOf("useEffect(() => () => {");
    const end = recorder.indexOf("inline && !autoStartedRef");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const unmountBlock = recorder.slice(start, end);
    expect(unmountBlock).toContain("cancelledRef.current = true;");
    expect(unmountBlock).toContain("requestRef.current?.abort();");
  });
});

describe("E — uma gravação = exatamente uma mensagem", () => {
  beforeEach(() => resetVoiceAutoFlow());

  it("decisão é pura e determinística (mesma entrada → mesma decisão)", () => {
    const input = {
      transcript: VALID_TRANSCRIPT,
      draft: "",
      isThinking: false,
    };
    const first = resolveVoiceTranscript(input);
    const second = resolveVoiceTranscript(input);
    expect(first).toEqual(second);
    expect(first.action).toBe("send");
  });

  it("composer tem guarda anti-duplicidade em ref liberada no finally", () => {
    expect(composer).toContain("if (voiceSendGuardRef.current) return;");
    expect(composer).toContain("voiceSendGuardRef.current = true;");
    expect(composer).toContain(".finally(");
    expect(composer).toContain("voiceSendGuardRef.current = false;");
    // O envio é disparado UMA única vez por transcrição (sem loops/retries).
    const start = composer.indexOf("function handleVoiceTranscript");
    const end = composer.indexOf("async function submit(");
    const block = composer.slice(start, end);
    expect(block.split("submit(decision.content").length - 1).toBe(1);
  });

  it("recorder tem guarda de finalização (eventos repetidos do MediaRecorder)", () => {
    expect(recorder).toContain("if (finishingRef.current) return;");
  });

  it("turno de auto-read usa slot único (um turno substitui o outro)", () => {
    beginVoiceTurn("assistant-a");
    beginVoiceTurn("assistant-b");
    expect(getVoiceTurnAssistantId()).toBe("assistant-b");
    expect(shouldAutoReadVoiceResponse("assistant-a")).toBe(false);
    expect(shouldAutoReadVoiceResponse("assistant-b")).toBe(true);
  });
});

describe("F — resposta da Nira de mensagem de voz → auto-read disparado", () => {
  beforeEach(() => resetVoiceAutoFlow());

  it("só a mensagem do turno é elegível para leitura automática", () => {
    beginVoiceTurn("assistant-voice");
    expect(shouldAutoReadVoiceResponse("assistant-voice")).toBe(true);
    expect(shouldAutoReadVoiceResponse("assistant-outro")).toBe(false);
    cancelVoiceTurn();
    expect(shouldAutoReadVoiceResponse("assistant-voice")).toBe(false);
  });

  it("ChatMessage expõe autoReadKey somente com resposta concluída", () => {
    expect(chatMessage).toContain("shouldAutoReadVoiceResponse(message.id)");
    expect(chatMessage).toContain("!message.pending");
    expect(chatMessage).toContain("Boolean(message.content)");
    expect(chatMessage).toContain("autoReadKey={autoReadKey}");
  });

  it("SpeechControls inicia a leitura automaticamente ao montar com turno", () => {
    expect(controls).toContain("playRef.current(true)");
    expect(controls).toContain('"hanira:voice-auto-read-start"');
    expect(controls).toContain("if (!autoReadKey || !text) return;");
  });

  it("turno é consumido UMA vez quando o áudio começa (fala → SPEAKING)", () => {
    beginVoiceTurn("assistant-voice");
    expect(getVoiceFlowPhase()).toBe("idle");
    markVoiceAutoReadStarted("assistant-voice");
    expect(getVoiceFlowPhase()).toBe("speaking");
    expect(shouldAutoReadVoiceResponse("assistant-voice")).toBe(false);
    expect(getVoiceTurnAssistantId()).toBeNull();
    // Reapresentação não repete: segunda chamada não reativa o turno.
    markVoiceAutoReadStarted("assistant-voice");
    expect(getVoiceFlowPhase()).toBe("speaking");
    expect(shouldAutoReadVoiceResponse("assistant-voice")).toBe(false);
  });

  it("resposta falha/abortada descarta o turno (nada de fala fantasma)", () => {
    beginVoiceTurn("assistant-voice");
    cancelVoiceTurn();
    expect(shouldAutoReadVoiceResponse("assistant-voice")).toBe(false);
    setVoiceFlowPhase("thinking");
    failVoiceAutoRead("assistant-voice"); // turno já ausente: não muda nada
    expect(getVoiceFlowPhase()).toBe("thinking");
    beginVoiceTurn("assistant-voice");
    failVoiceAutoRead("assistant-voice");
    expect(getVoiceTurnAssistantId()).toBeNull();
    expect(getVoiceFlowPhase()).toBe("idle");
  });
});

describe("G — mensagem digitada preservada", () => {
  beforeEach(() => resetVoiceAutoFlow());

  it("sem turno de voz não há auto-read", () => {
    expect(shouldAutoReadVoiceResponse("mensagem-digitada")).toBe(false);
  });

  it("beginVoiceTurn só é chamado no caminho voiceOrigin do submit", () => {
    const occurrences = composer.split("beginVoiceTurn(").length - 1;
    expect(occurrences).toBe(1);
    const index = composer.indexOf("beginVoiceTurn(");
    const context = composer.slice(index - 500, index);
    expect(context).toContain("voiceOrigin");
    expect(context).toContain("settings.voiceEnabled");
  });

  it("botão enviar e Enter continuam usando submit() sem opções", () => {
    expect(composer).toContain("onClick={() => void submit()}");
    expect(composer).toContain("void submit();");
    expect(composer).toContain("store.setDraft(decision.content)");
  });

  it("auto-read exige voiceEnabled (controles manuais continuam gated)", () => {
    expect(chatMessage).toContain("settings.voiceEnabled &&");
  });
});


describe("H — stop/pause/replay do TTS continuam funcionais", () => {
  beforeEach(() => resetVoiceAutoFlow());

  it("controles manuais de pausar/parar/reiniciar permanecem", () => {
    expect(controls).toContain('aria-label="Pausar leitura em voz alta"');
    expect(controls).toContain('aria-label="Parar leitura em voz alta"');
    expect(controls).toContain('aria-label="Reiniciar leitura em voz alta"');
    expect(controls).toContain("stopLocalPlayback");
  });

  it("parar a leitura devolve o fluxo de voz a IDLE", () => {
    beginVoiceTurn("assistant-voice");
    markVoiceAutoReadStarted("assistant-voice");
    expect(getVoiceFlowPhase()).toBe("speaking");
    finishVoiceAutoSpeech();
    expect(getVoiceFlowPhase()).toBe("idle");
  });
});

describe("I — respostas consecutivas não criam falas conflitantes", () => {
  it("novo play para os outros controles ANTES de falar", () => {
    const dispatchIndex = controls.indexOf('"hanira:stop-speech"');
    const speakIndex = controls.indexOf("speechSynthesis!.speak(utterance)");
    expect(dispatchIndex).toBeGreaterThan(-1);
    expect(dispatchIndex).toBeLessThan(speakIndex);
    expect(controls).toContain(
      "if (detail?.id !== playbackIdRef.current) stopLocalPlayback();",
    );
  });

  it("callbacks de fala antiga não encerram fala nova (geração)", () => {
    expect(controls).toContain("generationRef.current === generation");
  });
});

describe("J — cleanup/unmount não deixa recorder/TTS/listeners vazando", () => {
  it("recorder aborta requisição e para tracks ao desmontar", () => {
    expect(recorder).toContain("requestRef.current?.abort();");
    expect(mediaRecorderHook).toContain("track.stop()");
  });

  it("SpeechControls cancela a fala ao desmontar", () => {
    expect(controls).toContain(
      "useEffect(() => () => stopLocalPlayback(), [stopLocalPlayback])",
    );
    expect(controls).toContain('removeEventListener("hanira:stop-speech"');
  });

  it("composer remove o listener anti-eco e zera fases na desmontagem", () => {
    expect(composer).toContain('window.removeEventListener("hanira:voice-auto-read-start"');
    expect(composer).toContain(
      'setVoiceFlowPhaseToIdleIf("listening", "transcribing", "sending", "thinking")',
    );
  });
});

describe("fases — LISTENING → TRANSCRIBING → SENDING → THINKING → SPEAKING → IDLE", () => {
  beforeEach(() => resetVoiceAutoFlow());

  it("expõe e transiciona as seis fases com listeners", () => {
    const seen: string[] = [];
    const unsubscribe = subscribeVoiceFlowPhase((value) => seen.push(value));
    setVoiceFlowPhase("listening");
    setVoiceFlowPhase("transcribing");
    setVoiceFlowPhase("sending");
    setVoiceFlowPhase("thinking");
    setVoiceFlowPhase("speaking");
    finishVoiceAutoSpeech();
    unsubscribe();
    expect(seen).toEqual([
      "listening",
      "transcribing",
      "sending",
      "thinking",
      "speaking",
      "idle",
    ]);
    expect(getVoiceFlowPhase()).toBe("idle");
  });

  it("fase repetida não notifica de novo (idempotente)", () => {
    const seen: string[] = [];
    const unsubscribe = subscribeVoiceFlowPhase((value) => seen.push(value));
    setVoiceFlowPhase("listening");
    setVoiceFlowPhase("listening");
    unsubscribe();
    expect(seen).toEqual(["listening"]);
  });

  it("origens do fluxo marcam as fases certas", () => {
    expect(composer).toContain('setVoiceFlowPhase("listening")');
    expect(recorder).toContain('setVoiceFlowPhase("transcribing")');
    expect(composer).toContain('setVoiceFlowPhase("sending")');
    expect(composer).toContain('setVoiceFlowPhase("thinking")');
    expect(controls).toContain("markVoiceAutoReadStarted");
  });
});

describe("proteções financeiras e de escopo", () => {
  it("módulo não chama provider, não fala de billing e não usa rede", () => {
    expect(voiceFlow).not.toContain("fetch(");
    expect(voiceFlow).not.toMatch(/billing|plano|cart[aã]o|openai|groq|cloudflare/i);
  });

  it("STT/TTS continuam nos contratos já estabelecidos", () => {
    expect(recorder).toContain("transcribeAudio");
    expect(controls).toContain("speechSynthesis");
    expect(controls).not.toContain("requestSpeech");
    expect(controls).not.toContain("/api/audio/speech");
  });
});

