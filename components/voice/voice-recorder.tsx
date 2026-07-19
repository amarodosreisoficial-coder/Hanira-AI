"use client";

import { useEffect, useRef } from "react";
import {
  CircleStop,
  LoaderCircle,
  Mic,
  Pause,
  Play,
  Trash2,
} from "lucide-react";
import { useMediaRecorder } from "@/hooks/use-media-recorder";
import { MAX_RECORDING_SECONDS } from "@/lib/media/config";
import { transcribeAudio } from "@/services/media-service";
import type { Attachment } from "@/types/media";

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function VoiceRecorder({
  conversationId,
  onComplete,
  onCancel,
  compact = false,
}: {
  conversationId?: string;
  onComplete: (result: {
    text: string;
    attachment: Attachment | null;
    localFile: File;
    simulated: boolean;
  }) => void;
  onCancel: () => void;
  compact?: boolean;
}) {
  const recorder = useMediaRecorder();
  const finishingRef = useRef(false);

  async function finishAndTranscribe() {
    if (finishingRef.current) return;
    finishingRef.current = true;
    const file = await recorder.finish();
    if (!file) {
      recorder.setError("A gravação ficou vazia.");
      recorder.setStatus("error");
      finishingRef.current = false;
      return;
    }
    recorder.setStatus("transcribing");
    try {
      const result = await transcribeAudio(file, conversationId);
      recorder.setStatus("complete");
      onComplete({ ...result, localFile: file });
    } catch (caught) {
      recorder.setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível transcrever o áudio.",
      );
      recorder.setStatus("error");
    } finally {
      finishingRef.current = false;
    }
  }

  useEffect(() => {
    if (
      recorder.duration >= MAX_RECORDING_SECONDS &&
      recorder.status === "recording"
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
              {formatDuration(MAX_RECORDING_SECONDS)}
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
