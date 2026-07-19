"use client";

import { useEffect, useRef, useState } from "react";
import { CircleStop, Mic, X } from "lucide-react";
import { HaniraMark } from "@/components/brand/hanira-mark";
import { VoiceRecorder } from "@/components/voice/voice-recorder";
import { useChatStore } from "@/lib/stores/chat-store";
import { requestSpeech } from "@/services/media-service";
import type { UserSettings } from "@/types/settings";
import type { VoiceConversationStatus } from "@/types/media";

const statusText: Record<VoiceConversationStatus, string> = {
  idle: "Pronta para conversar",
  listening: "Ouvindo você",
  transcribing: "Transformando voz em texto",
  thinking: "Hanira está pensando",
  speaking: "Hanira está falando",
  error: "A conversa foi interrompida",
};

export function VoiceConversationModal({
  open,
  settings,
  onClose,
}: {
  open: boolean;
  settings: UserSettings;
  onClose: () => void;
}) {
  const conversation = useChatStore((state) => state.activeConversation());
  const mode = useChatStore((state) => state.mode);
  const [status, setStatus] = useState<VoiceConversationStatus>("idle");
  const [transcript, setTranscript] = useState("");
  const [recorderVisible, setRecorderVisible] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef("");

  function stopAll() {
    abortRef.current?.abort();
    window.speechSynthesis?.cancel();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    window.dispatchEvent(new Event("hanira:stop-response"));
    setStatus("idle");
  }

  useEffect(() => {
    if (!open) return;
    const onResponse = async (event: Event) => {
      const detail = (event as CustomEvent<{ text: string }>).detail;
      if (!detail.text) return;
      setStatus("speaking");
      try {
        if (mode === "demo") {
          const utterance = new SpeechSynthesisUtterance(detail.text);
          utterance.lang = "pt-BR";
          utterance.rate = settings.speechRate;
          utterance.onend = () => setStatus("idle");
          window.speechSynthesis.speak(utterance);
        } else {
          const abort = new AbortController();
          abortRef.current = abort;
          const blob = await requestSpeech(
            detail.text,
            settings.ttsVoice,
            settings.speechRate,
            abort.signal,
          );
          if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
          audioUrlRef.current = URL.createObjectURL(blob);
          const audio = new Audio(audioUrlRef.current);
          audioRef.current = audio;
          audio.onended = () => setStatus("idle");
          await audio.play();
        }
      } catch (caught) {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Não foi possível reproduzir a resposta.",
          );
          setStatus("error");
        }
      }
    };
    const onStreamError = () => setStatus("error");
    window.addEventListener("hanira:response-complete", onResponse);
    window.addEventListener("hanira:response-error", onStreamError);
    return () => {
      window.removeEventListener("hanira:response-complete", onResponse);
      window.removeEventListener("hanira:response-error", onStreamError);
    };
  }, [mode, open, settings.speechRate, settings.ttsVoice]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      audioRef.current?.pause();
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    },
    [],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[75] flex items-center justify-center bg-[#070608]/95 p-4 backdrop-blur-xl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="voice-mode-title"
    >
      <div className="relative flex min-h-[520px] w-full max-w-xl flex-col items-center justify-center overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-b from-violet-950/20 to-[#0d0a10] p-6 text-center shadow-2xl">
        <button
          onClick={() => {
            stopAll();
            onClose();
          }}
          className="absolute right-5 top-5 grid size-10 place-items-center rounded-full bg-white/[0.05] text-zinc-500"
          aria-label="Encerrar conversa por voz"
        >
          <X className="size-4" />
        </button>
        <div
          className={`relative grid size-32 place-items-center rounded-full border border-violet-300/20 bg-violet-500/10 ${
            status === "speaking" || status === "listening"
              ? "shadow-[0_0_80px_rgba(139,92,246,.35)]"
              : ""
          }`}
        >
          <span className="absolute inset-2 animate-pulse rounded-full border border-violet-400/10" />
          <HaniraMark compact className="scale-[2.2]" />
        </div>
        <h2 id="voice-mode-title" className="mt-8 text-2xl font-medium">
          Conversa por voz
        </h2>
        <p className="mt-2 text-sm text-violet-200/70">{statusText[status]}</p>
        {transcript && (
          <p className="mt-6 max-w-md text-sm leading-6 text-zinc-400">
            “{transcript}”
          </p>
        )}
        {error && <p className="mt-4 text-xs text-rose-300">{error}</p>}

        <div className="mt-8 w-full">
          {recorderVisible ? (
            <VoiceRecorder
              conversationId={conversation?.id}
              onCancel={() => {
                setRecorderVisible(false);
                setStatus("idle");
              }}
              onComplete={({ text }) => {
                setTranscript(text);
                setRecorderVisible(false);
                setStatus("thinking");
                window.dispatchEvent(
                  new CustomEvent("hanira:voice-submit", {
                    detail: { content: text },
                  }),
                );
              }}
            />
          ) : (
            <div className="flex justify-center gap-3">
              {status === "thinking" || status === "speaking" ? (
                <button
                  onClick={stopAll}
                  className="inline-flex h-14 items-center gap-2 rounded-2xl bg-white px-6 text-sm font-medium text-black"
                >
                  <CircleStop className="size-4" />
                  Interromper
                </button>
              ) : (
                <button
                  onClick={() => {
                    setError("");
                    setStatus("listening");
                    setRecorderVisible(true);
                  }}
                  className="inline-flex h-14 items-center gap-2 rounded-2xl bg-white px-6 text-sm font-medium text-black"
                >
                  <Mic className="size-4" />
                  Começar a ouvir
                </button>
              )}
            </div>
          )}
        </div>
        <p className="mt-6 text-[10px] leading-5 text-zinc-700">
          Fluxo atual: gravar → transcrever → responder → sintetizar voz.
        </p>
      </div>
    </div>
  );
}
