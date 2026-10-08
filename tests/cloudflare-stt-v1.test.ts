import { describe, expect, it, vi } from "vitest";
import { getSttRuntimeState } from "@/lib/ai/transcription/runtime";
import { CloudflareWorkersAITranscriptionProvider } from "@/lib/ai/transcription/cloudflare-workers-ai-transcription-provider";
import { readBoundedSttBody, STT_MAX_AUDIO_BYTES, STT_MAX_RECORDING_SECONDS, validateSttAudio } from "@/lib/validation/stt-audio";

const fakeFetch = (fn: (...args: Parameters<typeof fetch>) => Promise<Response>) => vi.fn(fn) as typeof fetch;
const audio = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3]);

describe("Cloudflare STT V1", () => {
  it("falha fechada sem habilitação, conta Free e credenciais", () => {
    const env = { CLOUDFLARE_AI_ACCOUNT_ID: "account", CLOUDFLARE_AI_API_TOKEN: "secret" };
    expect(getSttRuntimeState(env).eligible).toBe(false);
    for (const cost of ["UNKNOWN", "PAID", "PROMOTIONAL"]) {
      expect(getSttRuntimeState({ ...env, HANIRA_STT_ENABLED: "true", HANIRA_STT_COST_CLASS: cost }).eligible).toBe(false);
    }
    expect(getSttRuntimeState({ ...env, HANIRA_STT_ENABLED: "true", HANIRA_STT_COST_CLASS: "FREE" }).eligible).toBe(true);
    expect(getSttRuntimeState({ HANIRA_STT_ENABLED: "true", HANIRA_STT_COST_CLASS: "FREE" }).eligible).toBe(false);
  });

  it("envia somente transcribe pt, recebe texto e não inclui segredos na resposta", async () => {
    const fetchFn = fakeFetch(async (url, init) => {
      expect(String(url)).toContain("/ai/run/@cf/openai/whisper-large-v3-turbo");
      expect(init?.method).toBe("POST");
      expect(JSON.parse(init?.body as string)).toEqual({ audio: Buffer.from(audio).toString("base64"), task: "transcribe", language: "pt" });
      return Response.json({ success: true, result: { text: "Olá Nira" } });
    });
    const provider = new CloudflareWorkersAITranscriptionProvider({ accountId: "account", apiToken: "secret", fetchFn });
    expect(await provider.transcribe(audio)).toBe("Olá Nira");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it.each([[401, "authentication"], [403, "authentication"], [413, "payload_too_large"], [429, "free_capacity_exhausted"], [503, "provider_capacity"], [500, "provider_error"]] as const)("mapeia HTTP %i para %s sem corpo bruto", async (status, code) => {
    const provider = new CloudflareWorkersAITranscriptionProvider({ accountId: "account", apiToken: "secret", fetchFn: fakeFetch(async () => new Response("segredo bruto", { status })) });
    await expect(provider.transcribe(audio)).rejects.toMatchObject({ code });
  });

  it("bloqueia sem configuração antes da rede", async () => {
    const fetchFn = fakeFetch(async () => Response.json({ success: true, result: { text: "x" } }));
    await expect(new CloudflareWorkersAITranscriptionProvider({ accountId: "", apiToken: "", fetchFn }).transcribe(audio)).rejects.toMatchObject({ code: "invalid_configuration" });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("mapeia rede, timeout e resposta malformada", async () => {
    const options = { accountId: "account", apiToken: "secret" };
    await expect(new CloudflareWorkersAITranscriptionProvider({ ...options, fetchFn: fakeFetch(async () => { throw new Error("token secreto"); }) }).transcribe(audio)).rejects.toMatchObject({ code: "network_error" });
    await expect(new CloudflareWorkersAITranscriptionProvider({ ...options, fetchFn: fakeFetch(async () => Response.json({ success: true, result: {} })) }).transcribe(audio)).rejects.toMatchObject({ code: "malformed_response" });
    const timeoutFetch = fakeFetch(async (_url, init) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("abort")), { once: true })));
    await expect(new CloudflareWorkersAITranscriptionProvider({ ...options, fetchFn: timeoutFetch, timeoutMs: 1 }).transcribe(audio)).rejects.toMatchObject({ code: "timeout" });
  });

  it("limita upload e valida MIME com assinatura real", async () => {
    expect(STT_MAX_RECORDING_SECONDS).toBe(60);
    expect((await validateSttAudio(new File([audio], "a.webm", { type: "audio/webm" }))).byteLength).toBe(audio.length);
    await expect(validateSttAudio(new File(["fake"], "a.webm", { type: "audio/webm" }))).rejects.toMatchObject({ code: "unsupported_format" });
    await expect(validateSttAudio(new File([new Uint8Array(STT_MAX_AUDIO_BYTES + 1)], "a.webm", { type: "audio/webm" }))).rejects.toMatchObject({ code: "payload_too_large" });
    await expect(readBoundedSttBody(new Request("http://localhost", { method: "POST", headers: { "content-length": String(STT_MAX_AUDIO_BYTES + 200_000) }, body: "x" }))).rejects.toMatchObject({ code: "payload_too_large" });
  });
});
