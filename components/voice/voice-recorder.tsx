"use client";

import { useEffect, useRef } from "react";
import {
  CircleStop,
  LoaderCircle,
  Mic,
  Pause,
  Play,
  Trash2,
  X,
} from "lucide-react";
import { useMediaRecorder } from "@/hooks/use-media-recorder";
import { STT_MAX_AUDIO_BYTES, STT_MAX_RECORDING_SECONDS } from "@/lib/validation/stt-audio";
import { transcribeAudio } from "@/services/media-service";
import { cn } from "@/lib/utils";

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

const WAVEFORM_BARS = Array.from({ length: 22 });

function Waveform({ paused }: { paused: boolean }) {
  return (
    <span className={cn("waveform", paused && "is-paused")} aria-hidden="true">
      {WAVEFORM_BARS.map((_, index) => (
        <i key={index} style={{ animationDelay: `${(index % 8) * 0.08}s` }} />
      ))}
    </span>
  );
}

export function VoiceRecorder({
  onComplete,
  onCancel,
  compact = false,
  inline = false,
}: {
  onComplete: (result: { text: string }) => void;
  onCancel: () => void;
  compact?: boolean;
  inline?: boolean;
}) {
  const recorder = useMediaRecorder();
  const finishingRef = useRef(false);
  const cancelledRef = useRef(false);
  const requestRef = useRef<AbortController | null>(null);
  const autoStartedRef = useRef(false);

  useEffect(() => () => {
    cancelledRef.current = true;
    requestRef.current?.abort();
  }, []);

  // Inline mode opens straight into the composer bar, so start capture on
  // mount for a seamless "click mic -> recording" experience. The privacy
  // dialog has already gated microphone access before this component mounts.
  useEffect(() => {
    if (inline && !autoStartedRef.current && recorder.status === "idle") {
      autoStartedRef.current = true;
      void recorder.start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inline, recorder.status]);

  async function finishAndTranscribe() {
    if (finishingRef.current) return;
    finishingRef.current = true;
    const file = await recorder.finish();
    if (cancelledRef.current) return;
    if (!file) {
      recorder.setError("A gravação ficou vazia.");
      recorder.setStatus("error");
      finishingRef.current = false;
      return;
    }
    if (file.size > STT_MAX_AUDIO_BYTES) {
      recorder.setError("O áudio excede o limite de 4 MiB. Grave um trecho menor.");
      recorder.setStatus("error");
      finishingRef.current = false;
      return;
    }
    recorder.setStatus("transcribing");
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const text = await transcribeAudio(file, controller.signal);
      if (controller.signal.aborted) return;
      recorder.setStatus("complete");
      onComplete({ text });
    } catch (caught) {
      if (controller.signal.aborted) return;
      recorder.setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível transcrever o áudio.",
      );
      recorder.setStatus("error");
    } finally {
      requestRef.current = null;
      finishingRef.current = false;
    }
  }

  useEffect(() => {
    if (
      recorder.duration >= STT_MAX_RECORDING_SECONDS &&
      (recorder.status === "recording" || recorder.status === "paused")
    ) {
      void finishAndTranscribe();
    }
    // finishAndTranscribe intentionally follows the current recorder instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder.duration, recorder.status]);

  const active = ["recording", "paused"].includes(recorder.status);
  const busy = ["requesting", "processing", "transcribing"].includes(
    recorder.status,
  );
  const idleOrError = recorder.status === "idle" || recorder.status === "error";

  if (inline) {
    return (
      <div className="w-full">
        <div className="flex w-full items-center gap-3 px-1.5 py-1">
          <span
            className={cn(
              "grid size-8 shrink-0 place-items-center rounded-full transition",
              active
                ? "bg-rose-500/15 text-rose-300"
                : "bg-violet-500/10 text-violet-300",
            )}
          >
            {busy ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : active ? (
              <span className="relative flex size-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-70" />
                <span className="relative inline-flex size-2.5 rounded-full bg-rose-400" />
              </span>
            ) : (
              <Mic className="size-4" />
            )}
          </span>

          {active && <Waveform paused={recorder.status !== "recording"} />}

          <span className="text-xs tabular-nums text-muted-foreground">
            {formatDuration(recorder.duration)} /{" "}
            {formatDuration(STT_MAX_RECORDING_SECONDS)}
          </span>

          <div className="ml-auto flex items-center gap-1">
            {idleOrError && (
              <button
                type="button"
                onClick={() => void recorder.start()}
                aria-label="Iniciar gravação"
                className="grid size-9 place-items-center rounded-full bg-primary text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Mic className="size-4" />
              </button>
            )}
            {active && (
              <button
                type="button"
                onClick={
                  recorder.status === "paused" ? recorder.resume : recorder.pause
                }
                aria-label={
                  recorder.status === "paused"
                    ? "Continuar gravação"
                    : "Pausar gravação"
                }
                className="grid size-9 place-items-center rounded-full text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {recorder.status === "paused" ? (
                  <Play className="size-4" />
                ) : (
                  <Pause className="size-4" />
                )}
              </button>
            )}
            {active && (
              <button
                type="button"
                onClick={() => void finishAndTranscribe()}
                aria-label="Finalizar e transcrever"
                className="grid size-9 place-items-center rounded-full bg-foreground text-background transition hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <CircleStop className="size-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                cancelledRef.current = true;
                requestRef.current?.abort();
                recorder.cancel();
                onCancel();
              }}
              aria-label="Cancelar gravação"
              className="grid size-9 place-items-center rounded-full text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
        {recorder.error && (
          <p role="alert" className="px-1.5 pb-1 text-xs text-rose-300">
            {recorder.error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      className={
        compact
          ? "rounded-2xl border border-violet-300/15 bg-violet-500/[0.06] p-3"
          : "rounded-3xl border border-white/10 bg-white/[0.035] p-5"
      }
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className={`grid size-10 place-items-center rounded-full ${
              active
                ? "animate-pulse bg-rose-500/15 text-rose-300"
                : "bg-violet-500/10 text-violet-300"
            }`}
          >
            {busy ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Mic className="size-4" />
            )}
          </span>
          <div>
            <p className="text-sm text-zinc-300">
              {recorder.status === "requesting" && "Aguardando permissão..."}
              {recorder.status === "recording" && "Gravando sua voz"}
              {recorder.status === "paused" && "Gravação pausada"}
              {recorder.status === "processing" && "Preparando áudio..."}
              {recorder.status === "transcribing" && "Transcrevendo..."}
              {recorder.status === "idle" && "Pronta para ouvir"}
              {recorder.status === "error" && "Não foi possível gravar"}
            </p>
            <p className="mt-0.5 text-xs tabular-nums text-zinc-600">
              {formatDuration(recorder.duration)} /{" "}
              {formatDuration(STT_MAX_RECORDING_SECONDS)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {recorder.status === "idle" || recorder.status === "error" ? (
            <button
              onClick={() => void recorder.start()}
              className="grid size-11 place-items-center rounded-xl bg-white text-black"
              aria-label="Iniciar gravação"
            >
              <Mic className="size-4" />
            </button>
          ) : active ? (
            <>
              <button
                onClick={
                  recorder.status === "paused"
                    ? recorder.resume
                    : recorder.pause
                }
                className="grid size-11 place-items-center rounded-xl border border-white/10 text-zinc-300"
                aria-label={
                  recorder.status === "paused"
                    ? "Continuar gravação"
                    : "Pausar gravação"
                }
              >
                {recorder.status === "paused" ? (
                  <Play className="size-4" />
                ) : (
                  <Pause className="size-4" />
                )}
              </button>
              <button
                onClick={() => void finishAndTranscribe()}
                className="grid size-11 place-items-center rounded-xl bg-white text-black"
                aria-label="Finalizar e transcrever"
              >
                <CircleStop className="size-4" />
              </button>
            </>
          ) : null}
          <button
            onClick={() => {
              cancelledRef.current = true;
              requestRef.current?.abort();
              recorder.cancel();
              onCancel();
            }}
            className="grid size-11 place-items-center rounded-xl text-zinc-600 hover:text-rose-300"
            aria-label="Cancelar gravação"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>
      {recorder.error && (
        <p role="alert" className="mt-3 text-xs text-rose-300">
          {recorder.error}
        </p>
      )}
    </div>
  );
}
