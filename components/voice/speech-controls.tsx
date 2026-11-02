"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CircleStop, Pause, Play, RotateCcw, Volume2 } from "lucide-react";
import { browserTtsAvailability, clampSpeechRate, getBrowserTtsHost, selectBrowserVoiceForLanguage } from "@/lib/voice/browser-tts";
import { failVoiceAutoRead, finishVoiceAutoSpeech, markVoiceAutoReadStarted } from "@/lib/voice/voice-auto-flow";

type PlaybackStatus = "idle" | "playing" | "paused" | "error";

export function SpeechControls({ text, voice, speed, language, autoReadKey }: {
  text: string;
  voice: string;
  speed: number;
  language?: string | null;
  /** Pacote 18.4 — AUTO READ: id da mensagem de turno de voz a ler sozinha. */
  autoReadKey?: string | null;
}) {
  const [status, setStatus] = useState<PlaybackStatus>("idle");
  // Pacote 18.4: idioma de leitura = override da conversa quando presente,
  // senão o idioma primário do perfil (settings.language). Nunca força pt-BR.
  const utteranceLanguage = language ?? "pt-BR";
  const [error, setError] = useState("");
  const [hasPlayed, setHasPlayed] = useState(false);
  const playbackIdRef = useRef(crypto.randomUUID());
  const generationRef = useRef(0);
  const activePlaybackRef = useRef(false);
  // Pacote 18.4 — AUTO READ: refs do turno atual e do `play` mais recente.
  // As refs evitam que identidades de callback mudem os deps do efeito de auto-read.
  const autoReadKeyRef = useRef<string | null>(autoReadKey ?? null);
  const playRef = useRef<((restart?: boolean) => void)>(() => undefined);

  const stopLocalPlayback = useCallback(() => {
    generationRef.current += 1;
    if (activePlaybackRef.current) {
      getBrowserTtsHost()?.speechSynthesis?.cancel();
      activePlaybackRef.current = false;
    }
    // Parar a leitura de um turno de voz devolve o fluxo a IDLE.
    if (autoReadKeyRef.current) finishVoiceAutoSpeech();
    setStatus("idle");
  }, []);

  const play = useCallback((restart = false) => {
    if (!text) return;
    const host = getBrowserTtsHost();
    const availability = browserTtsAvailability(host, utteranceLanguage);
    if (availability === "unsupported") {
      if (autoReadKeyRef.current) failVoiceAutoRead(autoReadKeyRef.current);
      setError("A leitura em voz alta não é suportada neste navegador.");
      setStatus("error");
      return;
    }
    if (availability === "no-pt-br-voice" || availability === "no-voice") {
      if (autoReadKeyRef.current) failVoiceAutoRead(autoReadKeyRef.current);
      setError("Nenhuma voz disponível neste navegador ou dispositivo para o idioma atual.");
      setStatus("error");
      return;
    }
    if (!restart && status === "paused" && activePlaybackRef.current && host!.speechSynthesis!.paused) {
      host!.speechSynthesis!.resume();
      setStatus("playing");
      return;
    }
    window.dispatchEvent(new CustomEvent("hanira:stop-speech", { detail: { id: playbackIdRef.current } }));
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    host!.speechSynthesis!.cancel();
    const utterance = new host!.SpeechSynthesisUtterance!(text);
    utterance.lang = utteranceLanguage;
    utterance.rate = clampSpeechRate(speed);
    utterance.voice = selectBrowserVoiceForLanguage(host!.speechSynthesis!.getVoices(), utteranceLanguage, voice) ?? null;
    utterance.onstart = () => {
      if (generationRef.current === generation) {
        // Pacote 18.4: o turno de voz só é consumido quando o áudio REALMENTE
        // começa — exatamente UMA leitura automática por resposta, mesmo com o
        // duplo efeito de efeitos do React Strict Mode em desenvolvimento.
        const autoKey = autoReadKeyRef.current;
        if (autoKey) markVoiceAutoReadStarted(autoKey);
        setStatus("playing");
      }
    };
    utterance.onend = () => {
      if (generationRef.current === generation) {
        if (autoReadKeyRef.current) finishVoiceAutoSpeech();
        activePlaybackRef.current = false;
        setStatus("idle");
      }
    };
    utterance.onerror = () => {
      if (generationRef.current === generation) {
        const autoKey = autoReadKeyRef.current;
        if (autoKey) {
          // Erro antes do início da fala descarta o turno pendente; erro após o
          // início devolve a fase a IDLE. Em ambos, nada fica preso fora de IDLE.
          failVoiceAutoRead(autoKey);
          finishVoiceAutoSpeech();
        }
        activePlaybackRef.current = false;
        setError("Não foi possível concluir a leitura em voz alta.");
        setStatus("error");
      }
    };
    setError("");
    setHasPlayed(true);
    setStatus("playing");
    activePlaybackRef.current = true;
    host!.speechSynthesis!.speak(utterance);
  }, [speed, status, text, voice, utteranceLanguage]);

  const pause = useCallback(() => {
    getBrowserTtsHost()?.speechSynthesis?.pause();
    setStatus("paused");
  }, []);

  // Mantém refs sincronizadas sem participar dos deps do efeito de auto-read
  // (uma mudança de status não pode reiniciar a fala já em andamento).
  useEffect(() => {
    playRef.current = play;
    autoReadKeyRef.current = autoReadKey ?? null;
  });

  // Pacote 18.4 — AUTO READ: quando a RESPOSTA de um turno de voz termina de
  // chegar, o TTS começa sozinho (resposta concluída → fala; sem streaming).
  // O turno é consumido no `onstart` da utterance, garantindo exatamente UMA
  // leitura por resposta. Mensagens digitadas têm autoReadKey nulo e passam
  // exatamente por aqui — comportamento manual preservado.
  useEffect(() => {
    if (!autoReadKey || !text) return;
    // Anti-eco: avisa o composer para encerrar qualquer gravação ativa antes
    // de a voz da Nira ser capturada como nova entrada.
    window.dispatchEvent(
      new CustomEvent("hanira:voice-auto-read-start", { detail: { id: autoReadKey } }),
    );
    playRef.current(true);
    // `play` é lido via ref de propósito: os deps são somente o turno/texto.
  }, [autoReadKey, text]);

  useEffect(() => {
    function stopOtherSpeech(event: Event) {
      const detail = (event as CustomEvent<{ id?: string }>).detail;
      if (detail?.id !== playbackIdRef.current) stopLocalPlayback();
    }
    window.addEventListener("hanira:stop-speech", stopOtherSpeech);
    return () => window.removeEventListener("hanira:stop-speech", stopOtherSpeech);
  }, [stopLocalPlayback]);
  useEffect(() => () => stopLocalPlayback(), [stopLocalPlayback]);

  return <div className="flex items-center gap-1">
    {status === "playing" ? <button onClick={pause} className="media-action" aria-label="Pausar leitura em voz alta"><Pause className="size-3.5" /></button> : <button onClick={() => play()} className="media-action" aria-label={status === "paused" ? "Continuar leitura em voz alta" : "Ler em voz alta"}>{status === "paused" ? <Play className="size-3.5" /> : <Volume2 className="size-3.5" />}</button>}
    {(status === "playing" || status === "paused") && <button onClick={stopLocalPlayback} className="media-action" aria-label="Parar leitura em voz alta"><CircleStop className="size-3.5" /></button>}
    {hasPlayed && <button onClick={() => play(true)} className="media-action" aria-label="Reiniciar leitura em voz alta"><RotateCcw className="size-3.5" /></button>}
    {error && <span className="text-[10px] text-rose-300">{error}</span>}
  </div>;
}
