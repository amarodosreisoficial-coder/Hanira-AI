import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const WEBM = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00, 0x00, 0x00]);
const OGG = new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0x00, 0x02, 0x00, 0x00]);
const MP4 = new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]);

const mocks = vi.hoisted(() => ({
  logServerEvent: vi.fn(),
  transcribe: vi.fn(),
}));

vi.mock("@/lib/logging/server", () => ({
  createRequestId: () => "request-test",
  logServerEvent: mocks.logServerEvent,
}));
// Garante que nenhum provider de STT seja instanciado pelo endpoint diagnóstico.
vi.mock("@/lib/ai/transcription/cloudflare-workers-ai-transcription-provider", () => ({
  CloudflareWorkersAITranscriptionProvider: class {
    transcribe = mocks.transcribe;
  },
}));

import { POST } from "@/app/api/diagnostics/audio/validate/route";
import { isDiagnosticsAllowed, resolveDiagnosticsAccess } from "@/lib/media/audio-diagnostics-access";
import {
  buildSanitizedDiagnosticReport,
  describeAudioValidation,
  reportContainsSensitiveMarkers,
} from "@/lib/media/audio-diagnostics";
import { STT_MAX_AUDIO_BYTES } from "@/lib/validation/stt-audio";

function audioRequest(file: File): Request {
  const form = new FormData();
  form.set("audio", file);
  return new Request("http://localhost/api/diagnostics/audio/validate", {
    method: "POST",
    body: form,
  });
}

function withEnv<T>(env: Record<string, string | undefined>, fn: () => T): T {
  const previous = { ...process.env };
  for (const key of ["NODE_ENV", "VERCEL_ENV"]) delete process.env[key];
  Object.assign(process.env, env);
  try {
    return fn();
  } finally {
    process.env = previous;
  }
}

describe("diagnostics access gate (pure)", () => {
  it("permite development local", () => {
    expect(resolveDiagnosticsAccess({ NODE_ENV: "development" })).toBe("development");
    expect(isDiagnosticsAllowed({ NODE_ENV: "development" })).toBe(true);
  });

  it("permite Vercel preview", () => {
    expect(resolveDiagnosticsAccess({ VERCEL_ENV: "preview" })).toBe("preview");
    expect(isDiagnosticsAllowed({ VERCEL_ENV: "preview" })).toBe(true);
  });

  it("bloqueia production mesmo com NODE_ENV development (fail-closed)", () => {
    expect(resolveDiagnosticsAccess({ NODE_ENV: "development", VERCEL_ENV: "production" })).toBe("blocked");
    expect(isDiagnosticsAllowed({ NODE_ENV: "development", VERCEL_ENV: "production" })).toBe(false);
  });

  it("bloqueia self-hosted/produção e desconhecido por padrão", () => {
    expect(isDiagnosticsAllowed({ NODE_ENV: "production" })).toBe(false);
    expect(isDiagnosticsAllowed({})).toBe(false);
  });
});

describe("server dry validation metadata (sem IA)", () => {
  it("valida webm, ogg, mp4 e m4a pela assinatura real", async () => {
    expect((await describeAudioValidation(new File([WEBM], "a.webm", { type: "audio/webm" }))).valid).toBe(true);
    expect((await describeAudioValidation(new File([OGG], "a.ogg", { type: "audio/ogg" }))).valid).toBe(true);
    expect((await describeAudioValidation(new File([MP4], "a.mp4", { type: "audio/mp4" }))).valid).toBe(true);
    const m4a = await describeAudioValidation(new File([MP4], "a.m4a", { type: "audio/x-m4a" }));
    expect(m4a.valid).toBe(true);
    expect(m4a.detectedContainerFamily).toBe("mp4");
    expect(m4a.resolvedExtension).toBe("m4a");
  });

  it("rejeita MIME/container incompatível", async () => {
    const result = await describeAudioValidation(new File([OGG], "a.webm", { type: "audio/webm" }));
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("unsupported_format");
  });

  it("rejeita MIME vazio e arquivo > 4 MiB", async () => {
    expect((await describeAudioValidation(new File([WEBM], "a.bin", { type: "" }))).valid).toBe(false);
    const oversized = new Uint8Array(STT_MAX_AUDIO_BYTES + 1);
    const big = await describeAudioValidation(new File([oversized], "a.webm", { type: "audio/webm" }));
    expect(big.valid).toBe(false);
    expect(big.reason).toBe("payload_too_large");
  });

  it("não retorna bytes, base64 ou conteúdo de áudio", async () => {
    const result = await describeAudioValidation(new File([WEBM], "a.webm", { type: "audio/webm" }));
    const serialized = JSON.stringify(result).toLowerCase();
    expect(serialized).not.toContain("base64");
    expect(serialized).not.toContain("data:audio");
  });
});

describe("sanitized diagnostic report", () => {
  const baseSnapshot = {
    secureContext: true,
    mediaDevices: true,
    getUserMedia: true,
    mediaRecorder: true,
    supportedFormats: { "audio/webm": true, "audio/mp4": false },
    selectedMime: "audio/webm;codecs=opus",
    mediaRecorderMime: "audio/webm;codecs=opus",
    blobMime: "audio/webm",
    resolvedMime: "audio/webm",
    extension: "webm",
    sizeBytes: 12345,
    durationSeconds: 4.2,
    playbackAvailable: true,
    serverValidation: null,
  };

describe("diagnostics validate API route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    withEnv({}, () => undefined);
  });

  it("responde 404 em production (página/endpoint indisponíveis)", async () => {
    const response = await withEnv({ NODE_ENV: "production", VERCEL_ENV: "production" }, () =>
      POST(audioRequest(new File([WEBM], "a.webm", { type: "audio/webm" }))),
    );
    expect(response.status).toBe(404);
    expect(mocks.transcribe).not.toHaveBeenCalled();
  });

  it("valida webm em development sem chamar provider", async () => {
    const response = await withEnv({ NODE_ENV: "development" }, () =>
      POST(audioRequest(new File([WEBM], "a.webm", { type: "audio/webm" }))),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { valid: boolean; reason: string; detectedContainerFamily: string };
    expect(body.valid).toBe(true);
    expect(body.reason).toBe("ok");
    expect(body.detectedContainerFamily).toBe("webm");
    expect(mocks.transcribe).not.toHaveBeenCalled();
  });

  it("valida em Vercel preview", async () => {
    const response = await withEnv({ VERCEL_ENV: "preview" }, () =>
      POST(audioRequest(new File([MP4], "a.mp4", { type: "audio/mp4" }))),
    );
    expect(response.status).toBe(200);
    expect(((await response.json()) as { valid: boolean }).valid).toBe(true);
    expect(mocks.transcribe).not.toHaveBeenCalled();
  });

  it("rejeita container incompatível com valid:false e sem provider", async () => {
    const response = await withEnv({ NODE_ENV: "development" }, () =>
      POST(audioRequest(new File([MP4], "a.webm", { type: "audio/webm" }))),
    );
    expect(response.status).toBe(200);
    expect(((await response.json()) as { valid: boolean }).valid).toBe(false);
    expect(mocks.transcribe).not.toHaveBeenCalled();
  });

  it("nunca chama o provider de STT em nenhum caminho", async () => {
    await withEnv({ NODE_ENV: "development" }, () =>
      POST(audioRequest(new File([WEBM], "a.webm", { type: "audio/webm" }))),
    );
    await withEnv({ NODE_ENV: "development" }, () =>
      POST(audioRequest(new File([OGG], "a.webm", { type: "audio/webm" }))),
    );
    expect(mocks.transcribe).not.toHaveBeenCalled();
  });
});


  it("gera JSON com os campos esperados e sem informação sensível", () => {
    const report = buildSanitizedDiagnosticReport(baseSnapshot);
    expect(reportContainsSensitiveMarkers(report)).toBe(false);
    const parsed = JSON.parse(report);
    expect(parsed.environment.secureContext).toBe(true);
    expect(parsed.recording.extension).toBe("webm");
    expect(parsed.supportedFormats["audio/webm"]).toBe(true);
  });

  it("inclui resultado de validação server-side quando presente", () => {
    const report = buildSanitizedDiagnosticReport({
      ...baseSnapshot,
      serverValidation: {
        valid: true,
        declaredMime: "audio/webm",
        normalizedMime: "audio/webm",
        detectedContainerFamily: "webm",
        resolvedExtension: "webm",
        sizeBytes: 12345,
        reason: "ok",
      },
    });
    expect(JSON.parse(report).serverValidation.valid).toBe(true);
  });
});
