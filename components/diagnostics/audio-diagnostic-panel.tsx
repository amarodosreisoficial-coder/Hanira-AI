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
import {
  AUTO_TEST_RECORDING_SECONDS,
  buildAutoTestReport,
  createCancellation,
  runAutomaticAudioTest,
  type AutoTestRecordingInfo,
  type AutoTestResult,
  type AutoTestState,
  type Cancellation,
} from "@/lib/media/audio-auto-test";

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

  // Package 18.3.3.1 — modo automático (ADICIONAL ao fluxo manual acima).
  const [autoState, setAutoState] = useState<AutoTestState>("IDLE");
  const [autoCountdown, setAutoCountdown] = useState(0);
  const [autoResult, setAutoResult] = useState<AutoTestResult | null>(null);
  const [autoRecording, setAutoRecording] = useState<AutoTestRecordingInfo | null>(null);
  const [autoReport, setAutoReport] = useState("");
  const [autoMessage, setAutoMessage] = useState("");
  const cancellationRef = useRef<Cancellation | null>(null);

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

  // Package 18.3.3.1 — cleanup do modo automático no unmount: cancela o token,
  // revoga a ObjectURL da gravação automática e evita vazamento de memória.
  useEffect(() => {
    return () => {
      cancellationRef.current?.cancel();
      if (autoRecording?.playbackUrl) URL.revokeObjectURL(autoRecording.playbackUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // --- Modo automático (Package 18.3.3.1) ---------------------------------
  const resetAuto = useCallback(() => {
    cancellationRef.current?.cancel();
    cancellationRef.current = null;
    setAutoState("IDLE");
    setAutoCountdown(0);
    setAutoResult(null);
    setAutoRecording(null);
    setAutoReport("");
    setAutoMessage("");
  }, []);

  const runAutoTest = useCallback(async () => {
    const snapshot = detectFeatures();
    setFeatures(snapshot);
    // Limpa estado anterior (Blob/timers/resultado) antes de repetir.
    setAutoResult(null);
    setAutoRecording(null);
    setAutoReport("");
    setAutoMessage("");
    setAutoCountdown(0);
    const cancellation = createCancellation();
    cancellationRef.current = cancellation;

    const result = await runAutomaticAudioTest({
      features: snapshot,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      getUserMedia: () => navigator.mediaDevices.getUserMedia({ audio: true }),
      createRecorder: (stream, mimeType) => new MediaRecorder(stream, { mimeType }),
      now: () => performance.now(),
      setTimeoutFn: (handler, ms) => setTimeout(handler, ms),
      clearTimeoutFn: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
      setIntervalFn: (handler, ms) => setInterval(handler, ms),
      clearIntervalFn: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
      createObjectURL: (blob) => URL.createObjectURL(blob),
      revokeObjectURL: (url) => URL.revokeObjectURL(url),
      postValidate: async (file) => {
        const form = new FormData();
        form.set("audio", file);
        const response = await fetch("/api/diagnostics/audio/validate", {
          method: "POST",
          body: form,
        });
        const data = (await response.json()) as Partial<AudioValidationResult> & { error?: string };
        if (!response.ok || typeof data.valid !== "boolean") {
          throw new Error("server validation rejected");
        }
        return {
          valid: data.valid,
          declaredMime: data.declaredMime ?? "",
          normalizedMime: data.normalizedMime ?? "",
          detectedContainerFamily: data.detectedContainerFamily ?? "",
          resolvedExtension: data.resolvedExtension ?? "",
          sizeBytes: data.sizeBytes ?? file.size,
          reason: data.reason ?? "",
        };
      },
      onState: setAutoState,
      onCountdown: setAutoCountdown,
      cancellation,
      stopGraceMs: 300,
    });

    cancellationRef.current = null;
    setAutoResult(result);
    if (result.recording) setAutoRecording(result.recording);
    if (result.failureReason === "microphone_permission_denied") {
      setAutoMessage("Permissão de microfone não concedida.");
    } else if (result.failureReason === "cancelled") {
      setAutoMessage("Teste cancelado.");
    } else if (result.state === "ERROR") {
      setAutoMessage(`Falha: ${result.failureReason ?? "desconhecida"}.`);
    }
    // Gera o relatório final automaticamente.
    const text = buildAutoTestReport({
      features: snapshot,
      recording: result.recording,
      serverValidation: result.serverValidation,
      overall: result.overall,
      failureReason: result.failureReason,
      browserFamily: result.browserFamily,
      playbackAvailable: Boolean(result.recording),
    });
    setAutoReport(text);
  }, []);

  const cancelAutoTest = useCallback(() => {
    cancellationRef.current?.cancel();
  }, []);

  const copyAutoReport = useCallback(async () => {
    if (!autoReport) return;
    try {
      await navigator.clipboard.writeText(autoReport);
      setAutoMessage("Resultado final copiado para a área de transferência.");
    } catch {
      setAutoMessage("Copie manualmente o resultado exibido abaixo.");
    }
  }, [autoReport]);

  const autoActive =
    autoState === "REQUESTING_PERMISSION" ||
    autoState === "RECORDING" ||
    autoState === "STOPPING" ||
    autoState === "ANALYZING" ||
    autoState === "SERVER_VALIDATING";

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

      <section className="mt-4 rounded-2xl border border-violet-300/20 bg-violet-500/[0.06] p-4">
        <h2 className="text-sm font-semibold text-violet-100">Teste automático</h2>
        <p className="mt-1 text-[11px] leading-4 text-zinc-400">
          Um toque grava ~{AUTO_TEST_RECORDING_SECONDS}s, valida o container no
          servidor (sem IA) e gera o relatório. Nenhuma transcrição é feita.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <span
            className={`text-xs font-medium ${
              autoState === "ERROR" ? "text-rose-300" : autoResult?.overall ? "text-emerald-300" : "text-violet-200"
            }`}
          >
            {autoState === "RECORDING"
              ? `GRAVANDO — ${Math.max(autoCountdown, 0)}`
              : autoState}
          </span>
        </div>
        {autoState === "RECORDING" && (
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full bg-violet-400 transition-all"
              style={{
                width: `${Math.max(
                  0,
                  Math.min(
                    100,
                    ((AUTO_TEST_RECORDING_SECONDS - Math.max(autoCountdown, 0)) /
                      AUTO_TEST_RECORDING_SECONDS) *
                      100,
                  ),
                )}%`,
              }}
            />
          </div>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <button
            onClick={() => void runAutoTest()}
            disabled={autoActive}
            className="col-span-2 h-14 rounded-xl bg-violet-500 text-sm font-semibold text-white disabled:opacity-40 sm:col-span-1"
          >
            EXECUTAR TESTE AUTOMÁTICO
          </button>
          <button
            onClick={cancelAutoTest}
            disabled={!autoActive}
            className="h-12 rounded-xl border border-white/15 text-sm text-zinc-300 disabled:opacity-40"
          >
            CANCELAR
          </button>
          <button
            onClick={() => void copyAutoReport()}
            disabled={!autoReport}
            className="h-12 rounded-xl border border-white/15 text-sm text-zinc-300 disabled:opacity-40"
          >
            COPIAR RESULTADO FINAL
          </button>
        </div>
        {(autoResult?.state === "COMPLETE" || autoResult?.state === "ERROR" || autoResult?.state === "CANCELLED") && (
          <button
            onClick={() => {
              resetAuto();
              void runAutoTest();
            }}
            disabled={autoActive}
            className="mt-2 h-11 w-full rounded-xl border border-white/15 text-sm text-zinc-300 disabled:opacity-40"
          >
            REPETIR TESTE
          </button>
        )}
        {autoMessage && (
          <p role="alert" className="mt-3 text-xs text-rose-300">
            {autoMessage}
          </p>
        )}
      </section>

      {autoResult && autoResult.state === "COMPLETE" && (
        <section className="mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-500/[0.05] p-4">
          <h2 className="text-sm font-semibold text-emerald-100">REAL DEVICE AUDIO TEST</h2>
          <ul className="mt-2 grid grid-cols-2 gap-1 text-xs tabular-nums">
            <li>SECURE CONTEXT: {autoResult.recording ? "PASS" : "FAIL"}</li>
            <li>MICROPHONE: {autoResult.recording ? "PASS" : "FAIL"}</li>
            <li>MEDIA RECORDER: {autoResult.recording ? "PASS" : "FAIL"}</li>
            <li>FORMAT DETECTION: {autoResult.recording ? "PASS" : "FAIL"}</li>
            <li className="col-span-2">SELECTED MIME: {features?.selectedMime || "(nenhum)"}</li>
            <li>RECORDER MIME: {autoRecording?.mediaRecorderMime || "(vazio)"}</li>
            <li>BLOB MIME: {autoRecording?.blobMime || "(vazio)"}</li>
            <li>RESOLVED MIME: {autoRecording?.resolvedMime || "(vazio)"}</li>
            <li>EXTENSION: .{autoRecording?.extension || "?"}</li>
            <li>FILE SIZE: {autoRecording?.sizeBytes ?? 0} B</li>
            <li>DURATION: {autoRecording?.durationSeconds ?? 0}s</li>
            <li>PLAYBACK AVAILABLE: {autoRecording ? "YES" : "NO"}</li>
            <li>SERVER VALIDATION: {autoResult.serverValidation?.valid ? "PASS" : "FAIL"}</li>
            <li>DETECTED CONTAINER: {autoResult.serverValidation?.detectedContainerFamily || "(não detectado)"}</li>
            <li className="col-span-2">
              OVERALL:{" "}
              <span className={autoResult.overall ? "text-emerald-300" : "text-rose-300"}>
                {autoResult.overall ? "PASS" : "FAIL"}
                {autoResult.failureReason ? ` (${autoResult.failureReason})` : ""}
              </span>
            </li>
            <li className="col-span-2">BROWSER: {autoResult.browserFamily}</li>
          </ul>
          {autoRecording && (
            <>
              <p className="mt-3 text-xs text-zinc-400">OUVIR GRAVAÇÃO:</p>
              <audio controls src={autoRecording.playbackUrl} className="mt-1 w-full" preload="metadata" />
            </>
          )}
        </section>
      )}

      {autoReport && (
        <section className="mt-4 rounded-2xl border border-white/10 bg-black/40 p-4">
          <h2 className="text-sm font-medium text-zinc-300">Resultado final (sanitizado)</h2>
          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all text-[10px] leading-4 text-zinc-400">
            {autoReport}
          </pre>
        </section>
      )}

      <section className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <h2 className="text-sm font-medium text-zinc-400">Modo manual (existente)</h2>
        <div className="mt-1 flex items-center justify-between">
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

