import { afterEach, describe, expect, it, vi } from "vitest";
import { GroqProvider } from "../lib/ai/providers/groq";
import { createTextChatRuntime } from "../lib/ai/runtime";
import {
  NIRA_CLOUD_FREE_PROFILE_ID,
  NIRA_CLOUD_FREE_PREFERRED_CANDIDATE_ID,
} from "../lib/ai/nira/profiles";
import { GROQ_PROVIDER_ID } from "../lib/ai/providers/groq/groq-types";

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

describe("Nira Cloud Free -> Groq integration (Package 15.0)", () => {
  it("fluxo completo: Hanira -> Nira Cloud Free -> Router -> GroqProvider -> resposta normalizada", async () => {
    process.env.AI_ENGINE_OLLAMA_ENABLED = "false";
    delete process.env.OLLAMA_BASE_URL;
    delete process.env.OLLAMA_MODEL;
    const apiKey = "gsk_test_integration_key";
    vi.stubEnv("GROQ_API_KEY", apiKey);
    vi.stubEnv("GROQ_MODEL", "");

    const mockFetch = vi.fn().mockResolvedValue(
      mockGroqResponse({
        id: "chatcmpl-integration-1",
        model: "llama-3.3-70b-versatile",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "Ola! Esta e uma resposta do Nira Cloud Free via Groq.",
            },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 20, completion_tokens: 30, total_tokens: 50 },
      }),
    );
    vi.stubGlobal("fetch", mockFetch);

    const runtime = createTextChatRuntime({
      niraProfileId: NIRA_CLOUD_FREE_PROFILE_ID,
    });

    expect(runtime.nira.profileId).toBe(NIRA_CLOUD_FREE_PROFILE_ID);
    expect(runtime.routing.providerId).toBe(GROQ_PROVIDER_ID);
    expect(runtime.routing.candidateId).toBe(
      NIRA_CLOUD_FREE_PREFERRED_CANDIDATE_ID,
    );
    expect(runtime.provider).toBeInstanceOf(GroqProvider);
    expect(runtime.baseUrl).toBeUndefined();

    const response = await runtime.provider.generate({
      messages: [{ role: "user", text: "Ola Nira!" }],
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain("/chat/completions");

    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("openai/gpt-oss-20b");
    expect(body.stream).toBe(false);
    expect(body.messages[0].role).toBe("user");

    const headers = init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe(`Bearer ${apiKey}`);
    expect(response.text).toBe(
      "Ola! Esta e uma resposta do Nira Cloud Free via Groq.",
    );
    expect(response.provider).toBe(GROQ_PROVIDER_ID);
    expect(response.finishReason).toBe("stop");
    expect(response.usage?.totalUnits).toBe(50);
  });

  it("429 do Groq normaliza como rate_limit", async () => {
    setOllamaEnv();
    vi.stubEnv("GROQ_API_KEY", "gsk_test_key");
    vi.stubEnv("GROQ_MODEL", "");

    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        mockGroqResponse(
          { error: { message: "Rate limit exceeded", type: "rate_limit" } },
          429,
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
      code: "rate_limit",
    });
  });

  it("401 do Groq normaliza como authentication", async () => {
    setOllamaEnv();
    vi.stubEnv("GROQ_API_KEY", "gsk_invalid_key");
    vi.stubEnv("GROQ_MODEL", "");

    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        mockGroqResponse(
          { error: { message: "Invalid API Key", type: "auth_error" } },
          401,
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
      code: "authentication",
    });
  });
});

describe("Nira Cloud Free no runtime (Package 16.3)", () => {
  it("createTextChatRuntime() sem argumentos seleciona nira-cloud-free quando apenas Groq esta configurado", () => {
    process.env.AI_ENGINE_OLLAMA_ENABLED = "false";
    delete process.env.OLLAMA_BASE_URL;
    delete process.env.OLLAMA_MODEL;
    vi.stubEnv("GROQ_API_KEY", "gsk_test_auto_profile");
    vi.stubEnv("GROQ_MODEL", "");

    const runtime = createTextChatRuntime();

    expect(runtime.nira.profileId).toBe(NIRA_CLOUD_FREE_PROFILE_ID);
    expect(runtime.routing.candidateId).toBe(
      NIRA_CLOUD_FREE_PREFERRED_CANDIDATE_ID,
    );
    expect(runtime.routing.providerId).toBe(GROQ_PROVIDER_ID);
    expect(runtime.provider).toBeInstanceOf(GroqProvider);
  });

  it("config do runtime nao expoe a chave Groq em nenhum campo", () => {
    process.env.AI_ENGINE_OLLAMA_ENABLED = "false";
    delete process.env.OLLAMA_BASE_URL;
    delete process.env.OLLAMA_MODEL;
    const apiKey = "gsk_test_secret_leak_probe_16_3";
    vi.stubEnv("GROQ_API_KEY", apiKey);
    vi.stubEnv("GROQ_MODEL", "");

    const runtime = createTextChatRuntime();

    const serialized = JSON.stringify({
      nira: runtime.nira,
      routing: runtime.routing,
      providerId: runtime.providerId,
      model: runtime.model,
      baseUrl: runtime.baseUrl,
    });
    expect(serialized).not.toContain(apiKey);
    expect(serialized).not.toContain("apiKey");
  });
});
