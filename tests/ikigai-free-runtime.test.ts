import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateIkigaiQuestions } from "@/lib/ikigai/interview-generator";
import { recordCandidateFailure, resetCapacityStateForTests } from "@/lib/ai/capacity/capacity-state";
import { GROQ_FREE_SECONDARY_CANDIDATE_ID } from "@/lib/ai/capacity/groq-free-candidates";
import { NIRA_CLOUD_FREE_PREFERRED_CANDIDATE_ID } from "@/lib/ai/nira/profiles";

const answers = { identity: "Pessoa privada ABC", love: "Compor música", strengths: "Cantar", impact: "Acolher pessoas", future: "Montar uma banda", story: "" };
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  resetCapacityStateForTests();
  vi.stubEnv("GROQ_API_KEY", "gsk_test_not_real");
  vi.stubEnv("GROQ_MODEL", "");
  vi.stubEnv("AI_ENGINE_OLLAMA_ENABLED", "false");
  vi.stubEnv("HANIRA_FREE_TEXT_CANDIDATES", "");
  vi.stubEnv("HANIRA_FREE_SECONDARY_ENABLED", "true");
  vi.stubEnv("HANIRA_ALLOW_PREVIEW_MODELS", "false");
  fetchMock = vi.fn().mockResolvedValue(Response.json({
    model: "openai/gpt-oss-20b",
    choices: [{ message: { content: JSON.stringify({ questions: [{ text: "Que papel a música teria na sua rotina de realização?", source: "love", evidence: "música" }] }) }, finish_reason: "stop" }],
  }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); resetCapacityStateForTests(); });

describe("Ikigai: integração do runtime existente sem rede real", () => {
  it("usa composition root e provider gratuito reais com um único fetch simulado", async () => {
    const logs = [vi.spyOn(console, "info").mockImplementation(() => {}), vi.spyOn(console, "warn").mockImplementation(() => {}), vi.spyOn(console, "error").mockImplementation(() => {})];
    const result = await generateIkigaiQuestions(answers, new AbortController().signal);
    expect(result.questions).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    const body = JSON.parse(init.body);
    expect(body.stream).toBe(false);
    expect(body.model).toBe("openai/gpt-oss-20b");
    expect(JSON.parse(body.messages[1].content)).toEqual(answers);
    expect(JSON.stringify(logs.flatMap((log) => log.mock.calls))).not.toMatch(/Pessoa privada ABC|Compor música|Que papel a música|gsk_test_not_real|única tarefa/);
  });

  it("todos os gratuitos em cooldown impedem qualquer chamada", async () => {
    recordCandidateFailure(NIRA_CLOUD_FREE_PREFERRED_CANDIDATE_ID, { code: "rate_limit" });
    recordCandidateFailure(GROQ_FREE_SECONDARY_CANDIDATE_ID, { code: "rate_limit" });
    await expect(generateIkigaiQuestions(answers, new AbortController().signal)).rejects.toMatchObject({ code: "capacity_unavailable" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("candidato extra pago é rejeitado antes de qualquer chamada", async () => {
    vi.stubEnv("HANIRA_FREE_TEXT_CANDIDATES", JSON.stringify([{ id: "paid-extra", provider: "groq", model: "paid-model", costClass: "paid", enabled: true }]));
    await expect(generateIkigaiQuestions(answers, new AbortController().signal)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("erro do provider não é repetido em outro modelo nem logado com dados", async () => {
    const logs = [vi.spyOn(console, "info").mockImplementation(() => {}), vi.spyOn(console, "warn").mockImplementation(() => {}), vi.spyOn(console, "error").mockImplementation(() => {})];
    fetchMock.mockResolvedValue(Response.json({ error: { message: JSON.stringify(answers) } }, { status: 429 }));
    await expect(generateIkigaiQuestions(answers, new AbortController().signal)).rejects.toMatchObject({ code: "rate_limit" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(logs.flatMap((log) => log.mock.calls))).not.toContain("Pessoa privada ABC");
  });
});
