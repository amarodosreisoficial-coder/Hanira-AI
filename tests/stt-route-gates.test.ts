import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { GET, POST } from "../app/api/audio/transcribe/route";
import { STT_MAX_AUDIO_BYTES, STT_MAX_REQUEST_BYTES } from "@/lib/validation/stt-audio";

function request(audio: File = new File([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1])], "x.webm", { type: "audio/webm" })) {
  const form = new FormData();
  form.set("audio", audio);
  return new Request("http://localhost/api/audio/transcribe", { method: "POST", body: form });
}

describe("gates da rota STT", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user", demo: false });
    mocks.getSttRuntimeState.mockReturnValue({ eligible: true });
    mocks.getUserSettingsForUser.mockResolvedValue({ transcriptionEnabled: true });
    mocks.checkRateLimit.mockReturnValue({ allowed: true });
    mocks.transcribe.mockResolvedValue("Olá Nira");
  });

  it("publica somente elegibilidade booleana", async () => {
    await expect(GET().json()).resolves.toEqual({ available: true });
  });

  it("nega usuário sem sessão antes de consultar provider", async () => {
    mocks.requireSessionUser.mockRejectedValue(new Error("UNAUTHENTICATED"));
    expect((await POST(request())).status).toBe(401);
    expect(mocks.transcribe).not.toHaveBeenCalled();
  });

  it("nega gate operacional, preferência e rate limit sem provider", async () => {
    mocks.getSttRuntimeState.mockReturnValueOnce({ eligible: false });
    expect((await POST(request())).status).toBe(409);
    mocks.getUserSettingsForUser.mockResolvedValueOnce({ transcriptionEnabled: false });
    expect((await POST(request())).status).toBe(409);
    mocks.checkRateLimit.mockReturnValueOnce({ allowed: false });
    expect((await POST(request())).status).toBe(429);
    expect(mocks.transcribe).not.toHaveBeenCalled();
  });

  it("nega áudio inválido, arquivo grande e Content-Length grande sem provider", async () => {
    expect((await POST(request(new File(["fake"], "x.webm", { type: "audio/webm" })))).status).toBe(400);
    expect((await POST(request(new File([new Uint8Array(STT_MAX_AUDIO_BYTES + 1)], "x.webm", { type: "audio/webm" })))).status).toBe(413);
    const oversized = new Request("http://localhost/api/audio/transcribe", { method: "POST", headers: { "content-type": "multipart/form-data; boundary=x", "content-length": String(STT_MAX_REQUEST_BYTES + 1) }, body: "x" });
    expect((await POST(oversized)).status).toBe(413);
    expect(mocks.transcribe).not.toHaveBeenCalled();
  });

  it("retorna apenas transcript depois de validação", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ transcript: "Olá Nira", requestId: "request-test" });
    expect(mocks.transcribe).toHaveBeenCalledTimes(1);
  });
});
