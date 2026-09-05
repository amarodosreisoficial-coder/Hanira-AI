import { afterEach, describe, expect, it, vi } from "vitest";
import { GroqProvider } from "../lib/ai/providers/groq";
import { createTextChatRuntime } from "../lib/ai/runtime";
import { NIRA_CLOUD_FREE_PROFILE_ID } from "../lib/ai/nira/profiles";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function setOllamaEnv(): void {
  process.env.AI_ENGINE_OLLAMA_ENABLED = "true";
  process.env.OLLAMA_BASE_URL = "http://127.0.0.1:11434/";
  process.env.OLLAMA_MODEL = "qwen2.5:latest";
}

function mockGroqResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Nira Cloud Free -> Groq error handling (Package 15.0)", () => {
  it("5xx do Groq normaliza como provider_error", async () => {
    setOllamaEnv();
    vi.stubEnv("GROQ_API_KEY", "gsk_test_key");
    vi.stubEnv("GROQ_MODEL", "");

    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        mockGroqResponse(
          { error: { message: "Internal Server Error", type: "server_error" } },
          503,
        ),
      );
    vi.stubGlobal("fetch", mockFetch);

    const runtime = createTextChatRuntime({
      niraProfileId: NIRA_CLOUD_FREE_PROFILE_ID,
    });

    await expect(
      runtime.provider.generate({
        messages: [{ role: "user", text: "Ola" }],
      }),
    ).rejects.toMatchObject({
      code: "provider_error",
    });
  });

  it("resposta vazia (sem choices) lanca erro", async () => {
    setOllamaEnv();
    vi.stubEnv("GROQ_API_KEY", "gsk_test_key");
    vi.stubEnv("GROQ_MODEL", "");

    const mockFetch = vi.fn().mockResolvedValue(
      mockGroqResponse({
        id: "chatcmpl-empty",
        model: "llama-3.3-70b-versatile",
        choices: [],
        usage: { prompt_tokens: 5, completion_tokens: 0, total_tokens: 5 },
      }),
    );
    vi.stubGlobal("fetch", mockFetch);

    const runtime = createTextChatRuntime({
      niraProfileId: NIRA_CLOUD_FREE_PROFILE_ID,
    });

    await expect(
      runtime.provider.generate({
        messages: [{ role: "user", text: "Ola" }],
      }),
    ).rejects.toThrow();
  });

  it("sem GROQ_API_KEY, provider nao e criado e nenhum fetch e feito", () => {
    setOllamaEnv();
    vi.stubEnv("GROQ_API_KEY", "");

    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    expect(() => new GroqProvider({ apiKey: "" })).toThrow();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("listModels retorna modelos normalizados", async () => {
    vi.stubEnv("GROQ_API_KEY", "gsk_test_key");
    vi.stubEnv("GROQ_MODEL", "");

    const mockFetch = vi.fn().mockResolvedValue(
      mockGroqResponse({
        object: "list",
        data: [
          {
            id: "llama-3.3-70b-versatile",
            object: "model",
            created: 1700000000,
            owned_by: "groq",
          },
          {
            id: "llama-3.1-8b-instant",
            object: "model",
            created: 1700000001,
            owned_by: "groq",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", mockFetch);

    const provider = new GroqProvider({
      apiKey: "gsk_test_key",
      fetchImpl: mockFetch,
    });

    const models = await provider.listModels();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(models).toHaveLength(2);
    expect(models[0].id).toBe("llama-3.1-8b-instant");
    expect(models[1].id).toBe("llama-3.3-70b-versatile");
  });

  it("healthCheck retorna ok:true quando /models responde 200", async () => {
    vi.stubEnv("GROQ_API_KEY", "gsk_test_key");
    vi.stubEnv("GROQ_MODEL", "");

    const mockFetch = vi.fn().mockResolvedValue(
      mockGroqResponse({
        object: "list",
        data: [{ id: "llama-3.3-70b-versatile" }],
      }),
    );
    vi.stubGlobal("fetch", mockFetch);

    const provider = new GroqProvider({
      apiKey: "gsk_test_key",
      fetchImpl: mockFetch,
    });

    const health = await provider.healthCheck();

    expect(health.ok).toBe(true);
    expect(health.provider).toBe("groq");
  });

  it("healthCheck retorna ok:false quando /models responde 401", async () => {
    vi.stubEnv("GROQ_API_KEY", "gsk_invalid_key");
    vi.stubEnv("GROQ_MODEL", "");

    const mockFetch = vi.fn().mockResolvedValue(
      mockGroqResponse(
        { error: { message: "Invalid API Key" } },
        401,
      ),
    );
    vi.stubGlobal("fetch", mockFetch);

    const provider = new GroqProvider({
      apiKey: "gsk_invalid_key",
      fetchImpl: mockFetch,
    });

    const health = await provider.healthCheck();

    expect(health.ok).toBe(false);
    expect(health.provider).toBe("groq");
    expect(health.metadata?.code).toBe("authentication");
  });
});
