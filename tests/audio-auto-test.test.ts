import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTO_TEST_RECORDING_SECONDS,
  buildAutoTestReport,
  computeAutoTestOverall,
  createCancellation,
  detectBrowserFamily,
  runAutomaticAudioTest,
  type AutoTestDeps,
  type AutoTestFeatureSnapshot,
} from "@/lib/media/audio-auto-test";
import { reportContainsSensitiveMarkers } from "@/lib/media/audio-diagnostics";

const WEBM = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00, 0x00, 0x00]);

const fullFeatures: AutoTestFeatureSnapshot = {
  secureContext: true,
  mediaDevices: true,
  getUserMedia: true,
  mediaRecorder: true,
  supportedFormats: {
    "audio/webm;codecs=opus": true,
    "audio/webm": true,
    "audio/mp4": false,
  },
  selectedMime: "audio/webm;codecs=opus",
};

const passingValidation = {
  valid: true,
  declaredMime: "audio/webm",
  normalizedMime: "audio/webm",
  detectedContainerFamily: "webm",
  resolvedExtension: "webm",
  sizeBytes: 8,
  reason: "ok",
};

// Fakes mínimos de browser, todos injetáveis.
function makeTrack() {
  return { stop: vi.fn() };
}
function makeStream(tracks = [makeTrack()]) {
  return { getTracks: () => tracks } as unknown as MediaStream;
}
function makeRecorder(opts: { mimeType?: string; empty?: boolean } = {}) {
  const rec = {
    state: "inactive" as string,
    mimeType: opts.mimeType ?? "audio/webm;codecs=opus",
    ondataavailable: null as null | ((e: Blob) => void),
    onstop: null as null | (() => void),
    onerror: null as null | (() => void),
    start: vi.fn(function (this: { state: string }) {
      this.state = "recording";
    }),
    stop: vi.fn(function (this: {
      state: string;
      onstop: null | (() => void);
      ondataavailable: null | ((e: BlobEvent) => void);
    }) {
      this.state = "inactive";
      if (!opts.empty) {
        this.ondataavailable?.({ data: new Blob([WEBM], { type: "audio/webm" }) } as unknown as BlobEvent);
      }
      this.onstop?.();
    }),
    pause: vi.fn(),
    resume: vi.fn(),
  };
  return rec as unknown as MediaRecorder & {
    state: string;
    ondataavailable: ((e: BlobEvent) => void) | null;
    onstop: (() => void) | null;
    onerror: (() => void) | null;
  };
}

// Timers falsos e síncronos: disparam imediatamente e são rastreáveis.
function fakeTimers() {
  const timeouts: Array<{ fn: () => void; ms: number }> = [];
  const intervals: Array<{ fn: () => void; ms: number }> = [];
  return {
    timeouts,
    intervals,
    setTimeoutFn: vi.fn((fn: () => void, ms: number) => {
      timeouts.push({ fn, ms });
      return timeouts.length;
    }),
    clearTimeoutFn: vi.fn(),
    setIntervalFn: vi.fn((fn: () => void, ms: number) => {
      intervals.push({ fn, ms });
      return intervals.length;
    }),
    clearIntervalFn: vi.fn(),
  };
}

function baseDeps(overrides: Partial<AutoTestDeps> = {}): AutoTestDeps {
  const timers = fakeTimers();
  return {
    features: fullFeatures,
    userAgent: "Mozilla/5.0 (Linux; Android 13) Chrome/120 Mobile",
    getUserMedia: vi.fn(async () => makeStream()),
    createRecorder: vi.fn(() => makeRecorder()),
    now: () => 0,
    ...timers,
    createObjectURL: vi.fn(() => "blob:auto-url"),
    revokeObjectURL: vi.fn(),
    postValidate: vi.fn(async () => passingValidation),
    onState: vi.fn(),
    onCountdown: vi.fn(),
    cancellation: createCancellation(),
    stopGraceMs: 0,
    ...overrides,
  };
}

// Executa o orquestrador resolvendo os timers síncronos pendentes.
async function drive(deps: AutoTestDeps) {
  const timers = deps as unknown as {
    timeouts: Array<{ fn: () => void; ms: number }>;
    setIntervalFn: ReturnType<typeof vi.fn>;
    setTimeoutFn: ReturnType<typeof vi.fn>;
  };
  const promise = runAutomaticAudioTest(deps);
  // Drena microtasks + dispara o timeout de parada automática (~5s).
  for (let i = 0; i < 20; i++) await Promise.resolve();
  const stopTimeout = timers.timeouts.find((t) => t.ms === AUTO_TEST_RECORDING_SECONDS * 1000);
  stopTimeout?.fn();
  for (let i = 0; i < 20; i++) await Promise.resolve();
  return promise;
}

describe("auto-test pure helpers", () => {
  it("detectBrowserFamily classifica Chrome/Edge/Safari sem fingerprinting", () => {
    expect(detectBrowserFamily("Mozilla/5.0 Chrome/120")).toBe("Chrome-like");
    expect(detectBrowserFamily("Mozilla/5.0 ... Chrome/120 Safari/537.36 Edg/120")).toBe("Edge-like");
    expect(detectBrowserFamily("Mozilla/5.0 (iPhone) Version/17 Safari/604.1")).toBe("Safari-like");
    expect(detectBrowserFamily("")).toBe("Unknown");
  });

  it("computeAutoTestOverall PASS só com todos os gates essenciais", () => {
    const allGood = {
      secureContext: true,
      mediaDevices: true,
      getUserMedia: true,
      mediaRecorder: true,
      formatSelected: true,
      recordingGenerated: true,
      blobNonEmpty: true,
      mimeResolved: true,
      extensionResolved: true,
      withinSizeLimit: true,
      serverValidationValid: true,
    };
    expect(computeAutoTestOverall(allGood)).toEqual({ overall: true, failureReason: null });
    expect(computeAutoTestOverall({ ...allGood, serverValidationValid: false }).failureReason).toBe("server_validation_failed");
    expect(computeAutoTestOverall({ ...allGood, secureContext: false }).failureReason).toBe("insecure_context");
    expect(computeAutoTestOverall({ ...allGood, withinSizeLimit: false }).failureReason).toBe("payload_too_large");
    expect(computeAutoTestOverall({ ...allGood, blobNonEmpty: false }).failureReason).toBe("empty_blob");
  });

  it("buildAutoTestReport é sanitizado e sem marcadores sensíveis", () => {
    const report = buildAutoTestReport({
      features: fullFeatures,
      recording: {
        mediaRecorderMime: "audio/webm;codecs=opus",
        blobMime: "audio/webm",
        resolvedMime: "audio/webm",
        extension: "webm",
        sizeBytes: 8,
        durationSeconds: 5.01,
        playbackUrl: "blob:x",
      },
      serverValidation: passingValidation,
      overall: true,
      failureReason: null,
      browserFamily: "Chrome-like",
      playbackAvailable: true,
    });
    expect(reportContainsSensitiveMarkers(report)).toBe(false);
    const parsed = JSON.parse(report);
    expect(parsed.overall).toBe("PASS");
    expect(parsed.browserFamily).toBe("Chrome-like");
    expect(parsed.recording.extension).toBe("webm");
    expect(parsed.serverValidation.valid).toBe(true);
    // Não deve conter a ObjectURL interna.
    expect(report).not.toContain("blob:x");
  });

  it("createCancellation resolve uma única vez e marca cancelled", () => {
    const c = createCancellation();
    expect(c.cancelled).toBe(false);
    c.cancel();
    expect(c.cancelled).toBe(true);
  });
});


describe("auto-test orchestrator flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fluxo completo: permissão → gravação ~5s → stop automático → validação → OVERALL PASS", async () => {
    const deps = baseDeps();
    const result = await drive(deps);

    expect(deps.getUserMedia).toHaveBeenCalledTimes(1);
    expect(deps.createRecorder).toHaveBeenCalledTimes(1);
    expect(deps.postValidate).toHaveBeenCalledTimes(1); // exatamente uma chamada server
    expect(result.state).toBe("COMPLETE");
    expect(result.overall).toBe(true);
    expect(result.failureReason).toBeNull();
    expect(result.serverValidation?.valid).toBe(true);
    expect(result.recording?.resolvedMime).toBe("audio/webm");
    expect(result.recording?.extension).toBe("webm");
    expect(result.recording?.sizeBytes).toBeGreaterThan(0);

    // Estados emitidos na ordem esperada.
    const states = (deps.onState as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(states).toEqual([
      "REQUESTING_PERMISSION",
      "RECORDING",
      "STOPPING",
      "ANALYZING",
      "SERVER_VALIDATING",
      "COMPLETE",
    ]);

    // Parada automática agendada em ~5s e contagem regressiva iniciada em 5.
    const stopTimeout = (deps as unknown as { timeouts: Array<{ fn: () => void; ms: number }> }).timeouts
      .find((t) => t.ms === AUTO_TEST_RECORDING_SECONDS * 1000);
    expect(stopTimeout).toBeTruthy();
    expect(deps.onCountdown).toHaveBeenCalledWith(AUTO_TEST_RECORDING_SECONDS);
    // Timers limpos ao final (sem vazamento).
    expect(deps.clearIntervalFn).toHaveBeenCalled();
    expect(deps.clearTimeoutFn).toHaveBeenCalled();
  });

  it("permissão negada retorna ERROR sem gravar nem validar", async () => {
    const denied = new DOMException("denied", "NotAllowedError");
    const deps = baseDeps({ getUserMedia: vi.fn(async () => { throw denied; }) });
    const result = await drive(deps);
    expect(result.state).toBe("ERROR");
    expect(result.failureReason).toBe("microphone_permission_denied");
    expect(deps.createRecorder).not.toHaveBeenCalled();
    expect(deps.postValidate).not.toHaveBeenCalled();
  });

  it("MediaRecorder ausente falha antes de qualquer captura", async () => {
    const deps = baseDeps({
      features: { ...fullFeatures, mediaRecorder: false, selectedMime: "" },
    });
    const result = await drive(deps);
    expect(result.failureReason).toBe("media_recorder_unavailable");
    expect(deps.getUserMedia).not.toHaveBeenCalled();
  });

  it("nenhum formato suportado falha sem solicitar microfone", async () => {
    const deps = baseDeps({
      features: { ...fullFeatures, selectedMime: "" },
    });
    const result = await drive(deps);
    expect(result.failureReason).toBe("no_supported_format");
    expect(deps.getUserMedia).not.toHaveBeenCalled();
  });

  it("Blob vazio retorna empty_blob e não chama validação", async () => {
    const deps = baseDeps({ createRecorder: vi.fn(() => makeRecorder({ empty: true })) });
    const result = await drive(deps);
    expect(result.failureReason).toBe("empty_blob");
    expect(deps.postValidate).not.toHaveBeenCalled();
  });

  it("server validation FAIL resulta OVERALL FAIL com motivo", async () => {
    const deps = baseDeps({
      postValidate: vi.fn(async () => ({ ...passingValidation, valid: false, reason: "unsupported_format" })),
    });
    const result = await drive(deps);
    expect(result.state).toBe("COMPLETE");
    expect(result.overall).toBe(false);
    expect(result.failureReason).toBe("server_validation_failed");
  });

  it("cancelamento interrompe e NÃO valida arquivo incompleto", async () => {
    const deps = baseDeps();
    const promise = runAutomaticAudioTest(deps);
    for (let i = 0; i < 20; i++) await Promise.resolve();
    deps.cancellation.cancel();
    // Dispara o watcher de cancelamento.
    const watchers = (deps as unknown as { intervals: Array<{ fn: () => void }> }).intervals;
    watchers.forEach((iv) => iv.fn());
    for (let i = 0; i < 20; i++) await Promise.resolve();
    const result = await promise;
    expect(result.state).toBe("CANCELLED");
    expect(result.failureReason).toBe("cancelled");
    expect(deps.postValidate).not.toHaveBeenCalled();
  });

  it("repetir teste não reaproveita Blob antigo (cria novo ObjectURL)", async () => {
    const deps = baseDeps();
    const first = await drive(deps);
    expect(first.recording?.playbackUrl).toBe("blob:auto-url");

    const deps2 = baseDeps();
    deps2.createObjectURL = vi.fn(() => "blob:auto-url-2");
    const second = await drive(deps2);
    expect(second.recording?.playbackUrl).toBe("blob:auto-url-2");
    // Cada execução cria seu próprio recorder/stream e sua própria validação.
    expect(deps2.createRecorder).toHaveBeenCalledTimes(1);
    expect(deps2.postValidate).toHaveBeenCalledTimes(1);
  });

  it("nunca chama provider de STT/IA em nenhum caminho", async () => {
    // O orquestrador só injeta postValidate (endpoint diagnóstico, sem IA).
    const deps = baseDeps();
    await drive(deps);
    expect(deps.postValidate).toHaveBeenCalledTimes(1);
    // Nenhuma referência a transcrição/LLM existe no resultado.
    const result = await drive(baseDeps());
    expect(JSON.stringify(result).toLowerCase()).not.toContain("transcript");
  });
});

