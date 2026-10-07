"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CircleStop, Pause, Play, RotateCcw, Volume2 } from "lucide-react";
import { browserTtsAvailability, clampSpeechRate, getBrowserTtsHost, selectPtBrVoice } from "@/lib/voice/browser-tts";

type PlaybackStatus = "idle" | "playing" | "paused" | "error";

export function SpeechControls({ text, voice, speed }: { text: string; voice: string; speed: number }) {
  const [status, setStatus] = useState<PlaybackStatus>("idle");
  const [error, setError] = useState("");
  const [hasPlayed, setHasPlayed] = useState(false);
  const playbackIdRef = useRef(crypto.randomUUID());
  const generationRef = useRef(0);
  const activePlaybackRef = useRef(false);

  const stopLocalPlayback = useCallback(() => {
    generationRef.current += 1;
    if (activePlaybackRef.current) {
      getBrowserTtsHost()?.speechSynthesis?.cancel();
      activePlaybackRef.current = false;
    }
    setStatus("idle");
  }, []);

  const play = useCallback((restart = false) => {
    if (!text) return;
    const host = getBrowserTtsHost();
    const availability = browserTtsAvailability(host);
    if (availability === "unsupported") {
      setError("A leitura em voz alta não é suportada neste navegador.");
      setStatus("error");
      return;
    }
    if (availability === "no-pt-br-voice") {
      setError("Nenhuma voz pt-BR está disponível neste navegador ou dispositivo.");
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
    utterance.lang = "pt-BR";
    utterance.rate = clampSpeechRate(speed);
    utterance.voice = selectPtBrVoice(host!.speechSynthesis!.getVoices(), voice) ?? null;
    utterance.onstart = () => { if (generationRef.current === generation) setStatus("playing"); };
    utterance.onend = () => {
      if (generationRef.current === generation) {
        activePlaybackRef.current = false;
        setStatus("idle");
      }
    };
    utterance.onerror = () => {
      if (generationRef.current === generation) {
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
  }, [speed, status, text, voice]);

  const pause = useCallback(() => {
    getBrowserTtsHost()?.speechSynthesis?.pause();
    setStatus("paused");
  }, []);

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
