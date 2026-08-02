"use client";

import { useEffect, useRef, useState } from "react";
import {
  CircleStop,
  LoaderCircle,
  Pause,
  Play,
  RotateCcw,
  Volume2,
} from "lucide-react";
import { useChatStore } from "@/lib/stores/chat-store";
import { requestSpeech } from "@/services/media-service";

function speakWithBrowser(text: string, speed: number, onEnd: () => void) {
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "pt-BR";
  utterance.rate = speed;
  utterance.onend = onEnd;
  utterance.onerror = onEnd;
  window.speechSynthesis.speak(utterance);
  return utterance;
}

export function SpeechControls({
  text,
  pending,
  autoSpeak,
  voice,
  speed,
}: {
  text: string;
  pending?: boolean;
  autoSpeak: boolean;
  voice: string;
  speed: number;
}) {
  const mode = useChatStore((state) => state.mode);
  const [status, setStatus] = useState<
    "idle" | "loading" | "playing" | "paused" | "error"
  >("idle");
  const [error, setError] = useState("");
  const [hasAudio, setHasAudio] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef("");
  const abortRef = useRef<AbortController | null>(null);
  const playbackIdRef = useRef(crypto.randomUUID());
  const wasPending = useRef(Boolean(pending));
  const didAutoSpeak = useRef(false);

  function stopLocalPlayback() {
    abortRef.current?.abort();
    if (mode === "demo") window.speechSynthesis.cancel();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setStatus("idle");
  }

  async function play(restart = false) {
    if (!text || status === "loading") return;
    setError("");
    window.dispatchEvent(
      new CustomEvent("hanira:stop-speech", {
        detail: { id: playbackIdRef.current },
      }),
    );
    if (mode === "demo") {
      if (!("speechSynthesis" in window)) {
        setError("A leitura local nao esta disponivel neste navegador.");
        setStatus("error");
        return;
      }
      if (!restart && window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
        setStatus("playing");
        return;
      }
      speakWithBrowser(text, speed, () => setStatus("idle"));
      setStatus("playing");
      return;
    }
    if (!restart && audioRef.current) {
      await audioRef.current.play();
      setStatus("playing");
      return;
    }
    setStatus("loading");
    const abort = new AbortController();
    abortRef.current = abort;
    try {
      const blob = await requestSpeech(text, voice, speed, abort.signal);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = URL.createObjectURL(blob);
      const audio = new Audio(urlRef.current);
      audio.onended = () => setStatus("idle");
      audio.onerror = () => {
        setError("Nao foi possivel reproduzir o audio.");
        setStatus("error");
      };
      audioRef.current = audio;
      setHasAudio(true);
      await audio.play();
      setStatus("playing");
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === "AbortError")) {
        setError(caught instanceof Error ? caught.message : "Falha na leitura.");
        setStatus("error");
      }
    } finally {
      abortRef.current = null;
    }
  }

  function pause() {
    if (mode === "demo") window.speechSynthesis.pause();
    else audioRef.current?.pause();
    setStatus("paused");
  }

  useEffect(() => {
    function stopOtherSpeech(event: Event) {
      const detail = (event as CustomEvent<{ id?: string }>).detail;
      if (detail?.id !== playbackIdRef.current) {
        stopLocalPlayback();
      }
    }
    window.addEventListener("hanira:stop-speech", stopOtherSpeech);
    return () => {
      window.removeEventListener("hanira:stop-speech", stopOtherSpeech);
    };
  });

  useEffect(() => {
    if (
      !didAutoSpeak.current &&
      autoSpeak &&
      text &&
      (!pending || wasPending.current)
    ) {
      didAutoSpeak.current = true;
      void play(true);
    }
    wasPending.current = Boolean(pending);
    // Auto-play is intentionally tied only to the pending -> complete transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  useEffect(
    () => () => {
      stopLocalPlayback();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  return (
    <div className="flex items-center gap-1">
      {status === "playing" ? (
        <button onClick={pause} className="media-action" aria-label="Pausar voz">
          <Pause className="size-3.5" />
        </button>
      ) : (
        <button
          onClick={() => void play()}
          className="media-action"
          aria-label={status === "paused" ? "Continuar voz" : "Ler em voz alta"}
        >
          {status === "loading" ? (
            <LoaderCircle className="size-3.5 animate-spin" />
          ) : status === "paused" ? (
            <Play className="size-3.5" />
          ) : (
            <Volume2 className="size-3.5" />
          )}
        </button>
      )}
      {status !== "idle" && (
        <button
          onClick={stopLocalPlayback}
          className="media-action"
          aria-label="Parar voz"
        >
          <CircleStop className="size-3.5" />
        </button>
      )}
      {status === "idle" && hasAudio && (
        <button
          onClick={() => void play(true)}
          className="media-action"
          aria-label="Repetir voz"
        >
          <RotateCcw className="size-3.5" />
        </button>
      )}
      {error && <span className="text-[10px] text-rose-300">{error}</span>}
    </div>
  );
}
