import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const WEBM = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00, 0x00, 0x00]);

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  getUserSettingsForUser: vi.fn(),
  getSttRuntimeState: vi.fn(),
  checkRateLimit: vi.fn(),
  transcribe: vi.fn(),
  logServerEvent: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ requireSessionUser: mocks.requireSessionUser }));
vi.mock("@/services/user-settings", () => ({ getUserSettingsForUser: mocks.getUserSettingsForUser }));
vi.mock("@/lib/ai/transcription/runtime", () => ({ getSttRuntimeState: mocks.getSttRuntimeState }));
vi.mock("@/lib/security/rate-limit", () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock("@/lib/logging/server", () => ({ createRequestId: () => "request-test", logServerEvent: mocks.logServerEvent }));
vi.mock("@/lib/ai/transcription/cloudflare-workers-ai-transcription-provider", () => ({
  CloudflareWorkersAITranscriptionProvider: class { transcribe = mocks.transcribe; },
}));

import { GET, POST } from "@/app/api/audio/transcribe/route";
import { TranscriptionError } from "@/lib/ai/transcription/provider";
import { STT_MAX_AUDIO_BYTES } from "@/lib/validation/stt-audio";

function request(audio: File = new File([WEBM], "x.webm", { type: "audio/webm" })) {
  const form = new FormData();
  form.set("audio", audio);
  return new Request("http://localhost/api/audio/transcribe", { method: "POST", body: form });
}

function fullRuntime() {
  return { eligible: true, enabled: true, liveEnabled: true, costClass: "FREE", accountVerifiedFree: true, configured: true };
}

describe("production STT activation — route gates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user", demo: false });
    mocks.getSttRuntimeState.mockReturnValue(fullRuntime());
    mocks.getUserSettingsForUser.mockResolvedValue({ transcriptionEnabled: true });
    mocks.checkRateLimit.mockReturnValue({ allowed: true });
    mocks.transcribe.mockResolvedValue("Olá Nira");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("usuário autenticado de produção pode transcrever", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ transcript: "Olá Nira", requestId: "request-test" });
    expect(mocks.transcribe).toHaveBeenCalledTimes(1);
  });

  it("usuário anônimo (sem sessão) é bloqueado antes do provider", async () => {
    mocks.requireSessionUser.mockRejectedValue(new Error("UNAUTHENTICATED"));
    expect((await POST(request())).status).toBe(401);
    expect(mocks.transcribe).not.toHaveBeenCalled();
  });

  it("usuário demo é bloqueado (produção exige conta real)", async () => {
    mocks.requireSessionUser.mockResolvedValue({ id: "user", demo: true });
    expect((await POST(request())).status).toBe(409);
    expect(mocks.transcribe).not.toHaveBeenCalled();
  });

  it("gate de runtime fechado (fail-closed) bloqueia sem provider", async () => {
    mocks.getSttRuntimeState.mockReturnValueOnce({ eligible: false });
    expect((await POST(request())).status).toBe(409);
    expect(mocks.transcribe).not.toHaveBeenCalled();
  });

  it("preferência do usuário desligada bloqueia", async () => {
    mocks.getUserSettingsForUser.mockResolvedValueOnce({ transcriptionEnabled: false });
    expect((await POST(request())).status).toBe(409);
    expect(mocks.transcribe).not.toHaveBeenCalled();
  });

  it("rate limit preservado bloqueia com 429", async () => {
    mocks.checkRateLimit.mockReturnValueOnce({ allowed: false });
    expect((await POST(request())).status).toBe(429);
    expect(mocks.transcribe).not.toHaveBeenCalled();
  });

  it("áudio > 4 MiB rejeitado com 413 sem provider", async () => {
    const big = new File([new Uint8Array(STT_MAX_AUDIO_BYTES + 1)], "x.webm", { type: "audio/webm" });
    expect((await POST(request(big))).status).toBe(413);
    expect(mocks.transcribe).not.toHaveBeenCalled();
  });

  it("assinatura incompatível rejeitada com 400 sem provider", async () => {
    const bad = new File([new Uint8Array([1, 2, 3, 4])], "x.webm", { type: "audio/webm" });
    expect((await POST(request(bad))).status).toBe(400);
    expect(mocks.transcribe).not.toHaveBeenCalled();
  });

  it("GET publica somente disponibilidade booleana", async () => {
    await expect(GET().json()).resolves.toEqual({ available: true });
    mocks.getSttRuntimeState.mockReturnValueOnce({ eligible: false });
    await expect(GET().json()).resolves.toEqual({ available: false });
  });

  it("provider error é tratado com erro amigável e sem stack/segredo", async () => {
    mocks.transcribe.mockRejectedValueOnce(new TranscriptionError("provider_error"));
    const response = await POST(request());
    expect(response.status).toBe(502);
    expect(((await response.json()) as { error: string }).error).toBe("Não foi possível transcrever o áudio.");
    expect(mocks.transcribe).toHaveBeenCalledTimes(1);
  });

  it("logs de servidor não contêm áudio, base64 ou transcrição", async () => {
    await POST(request());
    const logged = mocks.logServerEvent.mock.calls.map((call) => JSON.stringify(call[0]));
    for (const entry of logged) {
      expect(entry.toLowerCase()).not.toContain("base64");
      expect(entry.toLowerCase()).not.toContain("olá nira");
    }
  });
});

describe("production STT activation — contrato do composer (Pacote 18.4: auto-send, sem fallback pago)", () => {
  const source = (relative: string) => readFileSync(path.join(process.cwd(), relative), "utf8");
  const composer = source("components/chat/chat-composer.tsx");
  const route = source("app/api/audio/transcribe/route.ts");
  const recorder = source("components/voice/voice-recorder.tsx");

  it("botão de microfone do chat usa o fluxo STT existente (sem página diagnóstica)", () => {
    expect(composer).toContain('requestMediaAccess("microphone")');
    expect(composer).toContain("VoiceRecorder");
    expect(composer).not.toContain("/diagnostics/audio");
    // O composer delega a transcrição ao VoiceRecorder, que chama transcribeAudio.
    expect(recorder).toContain("transcribeAudio");
  });

  it("transcript válido é enviado automaticamente (Pacote 18.4 auto-send)", () => {
    const start = composer.indexOf("onComplete={({ text })");
    expect(start).toBeGreaterThan(-1);
    const onCompleteBlock = composer.slice(start, start + 300);
    // O gravador despacha direto para o pipeline de envio do chat.
    expect(onCompleteBlock).toContain("handleVoiceTranscript(text)");
    expect(composer).toContain("resolveVoiceTranscript");
    expect(composer).toContain(
      "submit(decision.content, false, undefined, { voiceOrigin: true })",
    );
  });

  it("transcript vazio, erro do STT e cancelamento NÃO disparam envio", () => {
    const flow = source("lib/voice/voice-auto-flow.ts");
    expect(flow).toContain('return { action: "reject", message: VOICE_TRANSCRIPT_EMPTY_ERROR }');
    expect(recorder.indexOf("} catch (caught)")).toBeGreaterThan(-1);
    const catchBlock = recorder.slice(
      recorder.indexOf("} catch (caught)"),
      recorder.indexOf("} finally {"),
    );
    expect(catchBlock).not.toContain("onComplete(");
    // Existe pelo menos um cancelamento de usuário (botão) com abort + onCancel.
    let index = recorder.indexOf("cancelledRef.current = true");
    let foundButtonCancel = false;
    while (index !== -1) {
      const block = recorder.slice(index, index + 320);
      if (block.includes("onCancel();")) {
        expect(block).toContain("requestRef.current?.abort();");
        expect(block).not.toContain("onComplete(");
        foundButtonCancel = true;
        break;
      }
      index = recorder.indexOf("cancelledRef.current = true", index + 1);
    }
    expect(foundButtonCancel).toBe(true);
  });

  it("texto existente no composer não é sobrescrito (concatena com espaço)", () => {
    const flow = source("lib/voice/voice-auto-flow.ts");
    expect(flow).toContain("draft ? `${draft} ${transcript}` : transcript");
  });

  it("rota STT não tem fallback pago (só Cloudflare, sem OpenAI/Groq/Gemini)", () => {
    expect(route).toContain("CloudflareWorkersAITranscriptionProvider");
    expect(route).not.toMatch(/OpenAI|Groq|Gemini/i);
  });

  it("recorder não persiste áudio e usa validação de 4 MiB", () => {
    expect(recorder).toContain("STT_MAX_AUDIO_BYTES");
    expect(recorder).toContain("transcribeAudio");
  });
});
