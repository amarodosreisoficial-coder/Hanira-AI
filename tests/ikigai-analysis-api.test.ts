import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/ikigai/analyze/route";
import { AIProviderError } from "@/lib/ai/types";
import { analysisAnswers, createAnalysisReport } from "./helpers/ikigai-analysis";

const mocks = vi.hoisted(() => ({ session: vi.fn(), quota: vi.fn(), rate: vi.fn(), generate: vi.fn(), runtime: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireSessionUser: mocks.session }));
vi.mock("@/lib/security/usage-guard", () => ({ consumeDailyUsage: mocks.quota }));
vi.mock("@/services/usage-service", () => ({ getUsageSupabaseClient: () => null }));
vi.mock("@/lib/security/rate-limit", () => ({ checkRateLimit: mocks.rate }));
vi.mock("@/lib/ai/runtime/create-text-chat-runtime", () => ({ createTextChatRuntime: mocks.runtime }));
const body = () => ({ analysisConsent: true, answers: analysisAnswers, followUps: [] as { id: string; text: string; answer: string }[] });
function request(payload: unknown = body(), signal?: AbortSignal) {
  return new Request("http://localhost/api/ikigai/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("HANIRA_CONCURRENCY_MAX_PER_USER", "1");
  mocks.session.mockResolvedValue({ id: "analysis-user", demo: false });
  mocks.rate.mockReturnValue({ allowed: true });
  mocks.quota.mockResolvedValue({ allowed: true });
  mocks.runtime.mockReturnValue({ provider: { generate: mocks.generate }, model: "free-test", routing: { candidateId: "analysis-test" } });
  mocks.generate.mockResolvedValue({ text: JSON.stringify(createAnalysisReport()), finishReason: "stop" });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("Ikigai: regressão da análise (D.8)", () => {
  it("finishReason stop retorna análise válida (200)", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(createAnalysisReport());
    expect(mocks.generate).toHaveBeenCalledTimes(1);
  });

  it("finishReason max_output_tokens com JSON válido não é aceito como análise (503 timeout)", async () => {
    mocks.generate.mockResolvedValueOnce({ text: JSON.stringify(createAnalysisReport()), finishReason: "max_output_tokens" });
    const response = await POST(request());
    expect(response.status).toBe(503);
    const text = await response.text();
    expect(text).toContain("excedeu o tempo disponível");
    expect(mocks.generate).toHaveBeenCalledTimes(1);
  });

  it("finishReason max_output_tokens com JSON incompleto não aceita o conteúdo parcial (503 timeout)", async () => {
    mocks.generate.mockResolvedValueOnce({ text: JSON.stringify({ title: "Relatório incompleto" }), finishReason: "max_output_tokens" });
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(mocks.generate).toHaveBeenCalledTimes(1);
  });

  it("resposta inválida com finishReason stop retorna 502 sem retry", async () => {
    mocks.generate.mockResolvedValueOnce({ text: "not JSON", finishReason: "stop" });
    const response = await POST(request());
    expect(response.status).toBe(502);
    expect(mocks.generate).toHaveBeenCalledTimes(1);
  });

  it("falta de capacidade gratuita não inicia geração (503)", async () => {
    mocks.runtime.mockImplementation(() => { throw new Error("No free capacity"); });
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("No free capacity");
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("erro do provider rate_limit não faz retry nem fallback pago (429)", async () => {
    mocks.generate.mockRejectedValueOnce(new AIProviderError({ code: "rate_limit", message: "rate limited" }));
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(mocks.generate).toHaveBeenCalledTimes(1);
  });

  it("erro do provider timeout não faz retry nem fallback pago (503)", async () => {
    mocks.generate.mockRejectedValueOnce(new AIProviderError({ code: "timeout", message: "timeout", retryable: true }));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(mocks.generate).toHaveBeenCalledTimes(1);
  });

  it("não realiza segunda chamada após erro (sem retry silencioso)", async () => {
    mocks.generate.mockRejectedValueOnce(new Error("fail"));
    await POST(request());
    expect(mocks.generate).toHaveBeenCalledTimes(1);
  });
});
