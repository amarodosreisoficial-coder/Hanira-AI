"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  STT_RECORDER_MIME_CANDIDATES,
  resolveRecordedAudioFormat,
  selectRecorderMimeType,
} from "@/lib/media/audio-format";
import {
  buildSanitizedDiagnosticReport,
  type AudioValidationResult,
} from "@/lib/media/audio-diagnostics";

type DiagnosticState =
  | "IDLE"
  | "REQUESTING_PERMISSION"
  | "RECORDING"
  | "RECORDED"
  | "VALIDATING"
  | "VALID"
  | "INVALID"
  | "ERROR";

interface FeatureSnapshot {
  secureContext: boolean;
  mediaDevices: boolean;
  getUserMedia: boolean;
  mediaRecorder: boolean;
  supportedFormats: Record<string, boolean>;
  selectedMime: string;
}

interface RecordedInfo {
  mediaRecorderMime: string;
  blobMime: string;
  resolvedMime: string;
  extension: string;
  sizeBytes: number;
  durationSeconds: number;
  playbackUrl: string;
}

function detectFeatures(): FeatureSnapshot {
  const secureContext =
    typeof window !== "undefined" && Boolean(window.isSecureContext);
  const hasMediaDevices =
    typeof navigator !== "undefined" && Boolean(navigator.mediaDevices);
  const hasGetUserMedia =
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia);
  const hasMediaRecorder =
    typeof window !== "undefined" && Boolean(window.MediaRecorder);
  const supportedFormats: Record<string, boolean> = {};
  for (const mime of STT_RECORDER_MIME_CANDIDATES) {
    if (hasMediaRecorder) {
      try {
        supportedFormats[mime] = window.MediaRecorder.isTypeSupported(mime);
      } catch {
        supportedFormats[mime] = false;
      }
    } else {
      supportedFormats[mime] = false;
    }
  }
  const selectedMime = hasMediaRecorder
    ? selectRecorderMimeType((mime) => window.MediaRecorder.isTypeSupported(mime))
    : "";
  return {
    secureContext,
    mediaDevices: hasMediaDevices,
    getUserMedia: hasGetUserMedia,
    mediaRecorder: hasMediaRecorder,
    supportedFormats,
    selectedMime,
  };
}

function friendlyError(state: FeatureSnapshot, error: unknown): string {
  const denied =
    error instanceof DOMException &&
    ["NotAllowedError", "PermissionDeniedError", "SecurityError"].includes(error.name);
  if (denied) return "Permissão do microfone negada. Libere o acesso nas configurações do navegador.";
  if (!state.secureContext)
    return "Contexto não seguro. Use HTTPS (ou localhost) para acessar o microfone.";
  if (!state.mediaRecorder) return "Este navegador não oferece MediaRecorder.";
  if (!state.getUserMedia) return "Este navegador não oferece acesso ao microfone (getUserMedia).";
  return "Não foi possível acessar o microfone.";
}

export function AudioDiagnosticPanel() {
  const [features, setFeatures] = useState<FeatureSnapshot | null>(null);
  const [state, setState] = useState<DiagnosticState>("IDLE");
  const [message, setMessage] = useState("");
  const [recorded, setRecorded] = useState<RecordedInfo | null>(null);
  const [serverValidation, setServerValidation] = useState<AudioValidationResult | null>(null);
  const [report, setReport] = useState("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const urlRef = useRef("");
  const startedAtRef = useRef(0);

  useEffect(() => {
    setFeatures(detectFeatures());
  }, []);

  const revokeUrl = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = "";
    }
  }, []);

  useEffect(() => revokeUrl, [revokeUrl]);

  const start = useCallback(async () => {
    const snapshot = detectFeatures();
    setFeatures(snapshot);
    setServerValidation(null);
    setReport("");
    setRecorded(null);
    revokeUrl();
    if (!snapshot.mediaRecorder || !snapshot.getUserMedia) {
      setMessage(
        !snapshot.secureContext
          ? "Contexto não seguro. Use HTTPS (ou localhost) para acessar o microfone."
          : "Este navegador não oferece captura de áudio compatível.",
      );
      setState("ERROR");
      return;
    }
    setState("REQUESTING_PERMISSION");
    setMessage("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = snapshot.selectedMime;
      if (!mimeType) {
        stream.getTracks().forEach((track) => track.stop());
        setMessage("Nenhum formato de gravação compatível foi detectado neste navegador.");
        setState("ERROR");
        return;
      }
      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        setMessage("O MediaRecorder retornou um erro durante a captura.");
        setState("ERROR");
      };
      recorder.onstop = () => {
        const resolved = resolveRecordedAudioFormat(recorder.mimeType, mimeType);
        const chunks = chunksRef.current;
        chunksRef.current = [];
        if (!resolved) {
          setMessage("Não foi possível determinar o container do áudio capturado.");
          setState("ERROR");
          return;
        }
        const blob = new Blob(chunks, { type: resolved.mimeType });
        if (!blob.size) {
          setMessage("A gravação ficou vazia.");
          setState("ERROR");
          return;
        }
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        const durationSeconds = Number(
          ((performance.now() - startedAtRef.current) / 1000).toFixed(2),
        );
        setRecorded({
          mediaRecorderMime: recorder.mimeType,
          blobMime: blob.type,
          resolvedMime: resolved.mimeType,
          extension: resolved.extension,
          sizeBytes: blob.size,
          durationSeconds,
          playbackUrl: url,
        });
        setState("RECORDED");
        setMessage("");
      };
      startedAtRef.current = performance.now();
      recorder.start(250);
      setState("RECORDING");
    } catch (caught) {
      setMessage(friendlyError(snapshot, caught));
      setState("ERROR");
    }
  }, [revokeUrl]);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }, []);

  const clear = useCallback(() => {
    revokeUrl();
    recorderRef.current = null;
    chunksRef.current = [];
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setRecorded(null);
    setServerValidation(null);
    setReport("");
    setMessage("");
    setState("IDLE");
  }, [revokeUrl]);


  const buildCurrentFile = useCallback(async (): Promise<File | null> => {
    if (!recorded) return null;
    const response = await fetch(recorded.playbackUrl);
    const blob = await response.blob();
    return new File([blob], `diagnostico.${recorded.extension}`, {
      type: recorded.resolvedMime,
    });
  }, [recorded]);

  const validateOnServer = useCallback(async () => {
    if (!recorded) return;
    setState("VALIDATING");
    setMessage("");
    try {
      const file = await buildCurrentFile();
      if (!file) throw new Error("sem arquivo");
      const form = new FormData();
      form.set("audio", file);
      const response = await fetch("/api/diagnostics/audio/validate", {
        method: "POST",
        body: form,
      });
      const data = (await response.json()) as Partial<AudioValidationResult> & {
        error?: string;
      };
      if (!response.ok || typeof data.valid !== "boolean") {
        setServerValidation(null);
        setMessage("A validação do servidor foi rejeitada.");
        setState("INVALID");
        return;
      }
      const result: AudioValidationResult = {
        valid: data.valid,
        declaredMime: data.declaredMime ?? "",
        normalizedMime: data.normalizedMime ?? "",
        detectedContainerFamily: data.detectedContainerFamily ?? "",
        resolvedExtension: data.resolvedExtension ?? "",
        sizeBytes: data.sizeBytes ?? file.size,
        reason: data.reason ?? "",
      };
      setServerValidation(result);
      setState(result.valid ? "VALID" : "INVALID");
    } catch {
      setServerValidation(null);
      setMessage("Falha ao validar no servidor.");
      setState("ERROR");
    }
  }, [buildCurrentFile, recorded]);

  const copyReport = useCallback(async () => {
    if (!features) return;
    const text = buildSanitizedDiagnosticReport({
      secureContext: features.secureContext,
      mediaDevices: features.mediaDevices,
      getUserMedia: features.getUserMedia,
      mediaRecorder: features.mediaRecorder,
      supportedFormats: features.supportedFormats,
      selectedMime: features.selectedMime,
      mediaRecorderMime: recorded?.mediaRecorderMime ?? "",
      blobMime: recorded?.blobMime ?? "",
      resolvedMime: recorded?.resolvedMime ?? "",
      extension: recorded?.extension ?? "",
      sizeBytes: recorded?.sizeBytes ?? 0,
      durationSeconds: recorded?.durationSeconds ?? 0,
      playbackAvailable: Boolean(recorded),
      serverValidation,
    });
    setReport(text);
    try {
      await navigator.clipboard.writeText(text);
      setMessage("Diagnóstico copiado para a área de transferência.");
    } catch {
      setMessage("Copie manualmente o relatório exibido abaixo.");
    }
  }, [features, recorded, serverValidation]);

  const active = state === "RECORDING" || state === "REQUESTING_PERMISSION";
  const busy = state === "VALIDATING";
  const statusClass =
    state === "ERROR" || state === "INVALID"
      ? "text-rose-300"
      : state === "VALID" || state === "RECORDED"
        ? "text-emerald-300"
        : "text-violet-200";


  return (
    <div className="mx-auto max-w-2xl p-4 text-zinc-200">
      <h1 className="text-xl font-semibold text-white">Diagnóstico de áudio</h1>
      <p className="mt-1 text-xs text-zinc-500">
        Este teste valida apenas captura, formato e container. Nenhuma transcrição
        ou chamada de IA será realizada.
      </p>

      <section className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <h2 className="text-sm font-medium text-zinc-300">Capacidades</h2>
        <ul className="mt-2 grid grid-cols-2 gap-1 text-xs tabular-nums">
          <li>SECURE CONTEXT: {features ? String(features.secureContext) : "..."}</li>
          <li>MEDIA DEVICES: {features ? String(features.mediaDevices) : "..."}</li>
          <li>GET USER MEDIA: {features ? String(features.getUserMedia) : "..."}</li>
          <li>MEDIA RECORDER: {features ? String(features.mediaRecorder) : "..."}</li>
          <li className="col-span-2">SELECTED MIME: {features?.selectedMime || "(nenhum)"}</li>
        </ul>
        <div className="mt-3">
          <p className="text-xs text-zinc-400">Formatos suportados:</p>
          <ul className="mt-1 grid grid-cols-1 gap-0.5 text-xs tabular-nums sm:grid-cols-2">
            {STT_RECORDER_MIME_CANDIDATES.map((mime) => (
              <li key={mime} className="flex justify-between gap-2">
                <span className="truncate">{mime}</span>
                <span className={features?.supportedFormats?.[mime] ? "text-emerald-300" : "text-rose-300"}>
                  {features ? (features.supportedFormats[mime] ? "YES" : "NO") : "..."}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex items-center justify-between">
          <span className={`text-sm font-medium ${statusClass}`}>{state}</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <button
            onClick={() => void start()}
            disabled={active || busy || state === "RECORDED"}
            className="h-12 rounded-xl bg-white text-sm font-medium text-black disabled:opacity-40"
          >
            INICIAR
          </button>
          <button
            onClick={stop}
            disabled={state !== "RECORDING"}
            className="h-12 rounded-xl border border-white/15 text-sm text-zinc-200 disabled:opacity-40"
          >
            PARAR
          </button>
          <button
            onClick={() => void validateOnServer()}
            disabled={state !== "RECORDED" || busy}
            className="h-12 rounded-xl border border-violet-300/30 text-sm text-violet-100 disabled:opacity-40"
          >
            VALIDAR (SEM IA)
          </button>
          <button
            onClick={clear}
            disabled={active || busy}
            className="h-12 rounded-xl border border-white/15 text-sm text-zinc-300 disabled:opacity-40"
          >
            LIMPAR
          </button>
          <button
            onClick={() => void copyReport()}
            disabled={!features}
            className="h-12 rounded-xl border border-white/15 text-sm text-zinc-300 disabled:opacity-40"
          >
            COPIAR DIAGNÓSTICO
          </button>
        </div>
        {message && (
          <p role="alert" className="mt-3 text-xs text-rose-300">
            {message}
          </p>
        )}
      </section>


      {recorded && (
        <section className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <h2 className="text-sm font-medium text-zinc-300">Gravação</h2>
          <ul className="mt-2 grid grid-cols-2 gap-1 text-xs tabular-nums">
            <li>MEDIARECORDER MIME: {recorded.mediaRecorderMime || "(vazio)"}</li>
            <li>BLOB MIME: {recorded.blobMime || "(vazio)"}</li>
            <li>RESOLVED MIME: {recorded.resolvedMime}</li>
            <li>EXTENSION: .{recorded.extension}</li>
            <li>SIZE: {recorded.sizeBytes} B</li>
            <li>DURATION: {recorded.durationSeconds}s</li>
          </ul>
          <audio controls src={recorded.playbackUrl} className="mt-3 w-full" preload="metadata" />
        </section>
      )}

      {serverValidation && (
        <section className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <h2 className="text-sm font-medium text-zinc-300">Validação do servidor (sem IA)</h2>
          <ul className="mt-2 grid grid-cols-2 gap-1 text-xs tabular-nums">
            <li>VALID: {String(serverValidation.valid)}</li>
            <li>REASON: {serverValidation.reason}</li>
            <li>DECLARED: {serverValidation.declaredMime || "(vazio)"}</li>
            <li>NORMALIZED: {serverValidation.normalizedMime || "(vazio)"}</li>
            <li>CONTAINER: {serverValidation.detectedContainerFamily || "(não detectado)"}</li>
            <li>EXTENSION: {serverValidation.resolvedExtension || "(nenhuma)"}</li>
          </ul>
        </section>
      )}

      {report && (
        <section className="mt-4 rounded-2xl border border-white/10 bg-black/40 p-4">
          <h2 className="text-sm font-medium text-zinc-300">Relatório (sanitizado)</h2>
          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all text-[10px] leading-4 text-zinc-400">
            {report}
          </pre>
        </section>
      )}
    </div>
  );
}

