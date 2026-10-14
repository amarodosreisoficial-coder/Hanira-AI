import { describe, expect, it } from "vitest";
import {
  canCaptureAudio,
  captureErrorMessage,
  classifyCaptureError,
  detectRecorderCapabilities,
  type RecorderEnvironment,
} from "@/lib/media/audio-capabilities";
import { STT_RECORDER_MIME_CANDIDATES } from "@/lib/media/audio-format";

// Package 18.3.7 — testes da camada de capacidade/erro de captura.
// Tudo é puro e injetável: nenhum DOM, nenhum provider, nenhuma inferência.

function env(overrides: Partial<RecorderEnvironment> = {}): RecorderEnvironment {
  return {
    isSecureContext: true,
    hasMediaDevices: true,
    hasGetUserMedia: true,
    hasMediaRecorder: true,
    isTypeSupported: () => true,
    hasPause: true,
    hasResume: true,
    ...overrides,
  };
}

describe("18.3.7 — classifyCaptureError", () => {
  it("classifica permissão negada a partir dos nomes padronizados", () => {
    for (const name of ["NotAllowedError", "PermissionDeniedError"]) {
      expect(classifyCaptureError(new DOMException(name, name))).toBe(
        "permission_denied",
      );
    }
  });

  it("classifica ausência de dispositivo", () => {
    for (const name of ["NotFoundError", "DevicesNotFoundError"]) {
      expect(classifyCaptureError(new DOMException(name, name))).toBe("no_device");
    }
  });

  it("classifica dispositivo em uso/ilegível", () => {
    for (const name of ["NotReadableError", "TrackStartError"]) {
      expect(classifyCaptureError(new DOMException(name, name))).toBe(
        "device_in_use",
      );
    }
  });

  it("classifica contexto inseguro, constraints e abort", () => {
    expect(classifyCaptureError(new DOMException("x", "SecurityError"))).toBe(
      "insecure_context",
    );
    expect(
      classifyCaptureError(new DOMException("x", "OverconstrainedError")),
    ).toBe("unsupported_constraints");
    expect(
      classifyCaptureError(new DOMException("x", "ConstraintNotSatisfiedError")),
    ).toBe("unsupported_constraints");
    expect(classifyCaptureError(new DOMException("x", "AbortError"))).toBe(
      "aborted",
    );
  });

  it("cai em unknown para erros sem DOMException ou nomes desconhecidos", () => {
    expect(classifyCaptureError(new Error("boom"))).toBe("unknown");
    expect(classifyCaptureError({ name: "WeirdError" })).toBe("unknown");
    expect(classifyCaptureError(null)).toBe("unknown");
    expect(classifyCaptureError("not an object")).toBe("unknown");
  });
});

describe("18.3.7 — captureErrorMessage", () => {
  it("nunca expõe o texto técnico cru do DOMException", () => {
    const raw = new DOMException("muito técnico", "NotAllowedError");
    const msg = captureErrorMessage(classifyCaptureError(raw));
    expect(msg).not.toMatch(/muito técnico/i);
    expect(msg.toLowerCase()).toContain("microfone");
  });

  it("toda categoria tem mensagem não vazia", () => {
    const kinds = [
      "permission_denied",
      "no_device",
      "device_in_use",
      "insecure_context",
      "unsupported_constraints",
      "aborted",
      "recorder_error",
      "no_supported_mime",
      "unsupported_browser",
      "unknown",
    ] as const;
    for (const kind of kinds) {
      expect(captureErrorMessage(kind).length).toBeGreaterThan(0);
    }
  });
});

describe("18.3.7 — detectRecorderCapabilities", () => {
  it("seleciona o primeiro MIME suportado (webm;codecs=opus) e preenche suportes", () => {
    const caps = detectRecorderCapabilities(
      env({ isTypeSupported: (m) => m === "audio/webm;codecs=opus" }),
    );
    expect(caps.selectedMime).toBe("audio/webm;codecs=opus");
    expect(caps.supportedFormats["audio/webm;codecs=opus"]).toBe(true);
    expect(caps.supportedFormats["audio/mp4"]).toBe(false);
    expect(canCaptureAudio(caps)).toBe(true);
  });

  it("cai para audio/mp4 quando só ele é suportado (Safari/iOS)", () => {
    const caps = detectRecorderCapabilities(
      env({ isTypeSupported: (m) => m === "audio/mp4" }),
    );
    expect(caps.selectedMime).toBe("audio/mp4");
  });

  it("trata isTypeSupported que lança como não suportado (Safari antigo)", () => {
    const caps = detectRecorderCapabilities(
      env({
        isTypeSupported: (m) => {
          if (m === "audio/webm;codecs=opus") throw new Error("nope");
          return m === "audio/mp4";
        },
      }),
    );
    expect(caps.supportedFormats["audio/webm;codecs=opus"]).toBe(false);
    expect(caps.selectedMime).toBe("audio/mp4");
  });

  it("retorna selectedMime vazio e canCaptureAudio false sem MediaRecorder", () => {
    const caps = detectRecorderCapabilities(env({ hasMediaRecorder: false }));
    expect(caps.selectedMime).toBe("");
    expect(canCaptureAudio(caps)).toBe(false);
  });

  it("não seleciona MIME quando nenhum candidato é suportado (fail-closed)", () => {
    const caps = detectRecorderCapabilities(env({ isTypeSupported: () => false }));
    expect(caps.selectedMime).toBe("");
    expect(canCaptureAudio(caps)).toBe(false);
  });

  it("cobre todos os candidatos da lista centralizada", () => {
    const caps = detectRecorderCapabilities(env());
    for (const mime of STT_RECORDER_MIME_CANDIDATES) {
      expect(mime in caps.supportedFormats).toBe(true);
    }
  });

  it("pause/resume só é suportado se AMBOS existirem", () => {
    expect(
      detectRecorderCapabilities(env({ hasPause: true, hasResume: false }))
        .pauseResumeSupported,
    ).toBe(false);
    expect(
      detectRecorderCapabilities(env({ hasPause: false, hasResume: true }))
        .pauseResumeSupported,
    ).toBe(false);
    expect(
      detectRecorderCapabilities(env({ hasPause: true, hasResume: true }))
        .pauseResumeSupported,
    ).toBe(true);
    // Sem MediaRecorder, mesmo com pause/resume presentes, é false.
    expect(
      detectRecorderCapabilities(
        env({ hasMediaRecorder: false, hasPause: true, hasResume: true }),
      ).pauseResumeSupported,
    ).toBe(false);
  });

  it("canCaptureAudio exige contexto seguro e APIs presentes (fail-closed)", () => {
    expect(
      canCaptureAudio(detectRecorderCapabilities(env({ isSecureContext: false }))),
    ).toBe(false);
    expect(
      canCaptureAudio(detectRecorderCapabilities(env({ hasGetUserMedia: false }))),
    ).toBe(false);
    expect(
      canCaptureAudio(detectRecorderCapabilities(env({ hasMediaDevices: false }))),
    ).toBe(false);
  });
});
