"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RecordingStatus } from "@/types/media";

function preferredMimeType() {
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function extensionForRecording(mimeType: string) {
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("mp4")) return "m4a";
  return "webm";
}

export function useMediaRecorder() {
  const [status, setStatus] = useState<RecordingStatus>("idle");
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const finishRef = useRef<((file: File | null) => void) | null>(null);
  const discardRef = useRef(false);

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError("Este navegador não oferece gravação de áudio.");
      setStatus("error");
      return false;
    }
    setStatus("requesting");
    setError("");
    setDuration(0);
    discardRef.current = false;
    chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = preferredMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      streamRef.current = stream;
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        setError("A gravação foi interrompida pelo navegador.");
        setStatus("error");
        cleanup();
      };
      recorder.onstop = () => {
        const type = (recorder.mimeType || mimeType || "audio/webm").split(
          ";",
        )[0];
        const blob = new Blob(chunksRef.current, { type });
        const file =
          !discardRef.current && blob.size
            ? new File(
                [blob],
                `hanira-voz-${Date.now()}.${extensionForRecording(type)}`,
                { type },
              )
            : null;
        finishRef.current?.(file);
        finishRef.current = null;
        cleanup();
      };
      recorder.start(500);
      setStatus("recording");
      timerRef.current = setInterval(
        () => setDuration((value) => value + 1),
        1_000,
      );
      return true;
    } catch (caught) {
      const denied =
        caught instanceof DOMException &&
        ["NotAllowedError", "PermissionDeniedError"].includes(caught.name);
      setError(
        denied
          ? "Permissão do microfone negada. Libere o acesso no navegador."
          : "Não foi possível acessar o microfone.",
      );
      setStatus("error");
      cleanup();
      return false;
    }
  }, [cleanup]);

  const finish = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return null;
    setStatus("processing");
    return new Promise<File | null>((resolve) => {
      finishRef.current = resolve;
      recorder.stop();
    });
  }, []);

  const cancel = useCallback(() => {
    discardRef.current = true;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      finishRef.current = () => undefined;
      recorder.stop();
    } else {
      cleanup();
    }
    setDuration(0);
    setStatus("idle");
  }, [cleanup]);

  const pause = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") {
      recorder.pause();
      setStatus("paused");
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, []);

  const resume = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder?.state === "paused") {
      recorder.resume();
      setStatus("recording");
      timerRef.current = setInterval(
        () => setDuration((value) => value + 1),
        1_000,
      );
    }
  }, []);

  return {
    status,
    setStatus,
    duration,
    error,
    setError,
    start,
    finish,
    cancel,
    pause,
    resume,
  };
}
