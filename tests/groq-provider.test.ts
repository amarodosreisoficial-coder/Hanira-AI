import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AIChatRequest } from "@/lib/ai/types";
import { GroqProvider } from "@/lib/ai/providers/groq";
import { AIProviderError } from "@/lib/ai/types";
import {
  GROQ_PROVIDER_ID,
  GROQ_DEFAULT_MODEL,
} from "@/lib/ai/providers/groq/groq-types";

const VALID_API_KEY = "gsk_test_key_12345";
const VALID_MODEL = "llama-3.3-70b-versatile";

function makeRequest(overrides: Partial<AIChatRequest> = {}): AIChatRequest {
  return {
    messages: [{ role: "user", text: "Hello" }],
    ...overrides,
  };
}

function mockResponse(status: number, body: unknown, headers?: HeadersInit) {
  return new Response(JSON.stringify(body), {
    status,
    headers: headers ?? { "Content-Type": "application/json" },
  });
}

describe("GroqProvider", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("constructor", () => {
    it("cria provider com apiKey valida", () => {
      const provider = new GroqProvider({ apiKey: VALID_API_KEY });
      expect(provider.providerId).toBe(GROQ_PROVIDER_ID);
    });

    it("usa GROQ_API_KEY do ambiente quando apiKey nao informada", () => {
      vi.stubEnv("GROQ_API_KEY", VALID_API_KEY);
      const provider = new GroqProvider();
      expect(provider.providerId).toBe(GROQ_PROVIDER_ID);
      vi.unstubAllEnvs();
    });

    it("usa GROQ_MODEL do ambiente quando defaultModel nao informado", () => {
      vi.stubEnv("GROQ_API_KEY", VALID_API_KEY);
      vi.stubEnv("GROQ_MODEL", "llama-3.1-8b-instant");
      const provider = new GroqProvider();
      expect(provider.getDefaultModel()).toBe("llama-3.1-8b-instant");
      vi.unstubAllEnvs();
    });

    it("usa GROQ_DEFAULT_MODEL quando nenhuma configuracao fornecida", () => {
      vi.stubEnv("GROQ_API_KEY", VALID_API_KEY);
      vi.stubEnv("GROQ_MODEL", "");
      const provider = new GroqProvider();
      expect(provider.getDefaultModel()).toBe(GROQ_DEFAULT_MODEL);
      vi.unstubAllEnvs();
    });

    it("lanca AIProviderError quando apiKey esta ausente", () => {
      vi.stubEnv("GROQ_API_KEY", "");
      expect(() => new GroqProvider()).toThrow(AIProviderError);
    });
  });

  describe("supports", () => {
    it("retorna true para text-generation", () => {
      const provider = new GroqProvider({ apiKey: VALID_API_KEY });
      expect(provider.supports("text-generation")).toBe(true);
    });

    it("retorna true para text-streaming", () => {
      const provider = new GroqProvider({ apiKey: VALID_API_KEY });
      expect(provider.supports("text-streaming")).toBe(true);
    });

    it("retorna false para capability nao suportada", () => {
      const provider = new GroqProvider({ apiKey: VALID_API_KEY });
      expect(provider.supports("vision")).toBe(false);
    });
  });

  describe("generate", () => {
    it("cria request correto para API Groq", async () => {
      vi.stubEnv("GROQ_MODEL", "");
      const mockFetch = vi.fn().mockResolvedValue(
        mockResponse(200, {
          id: "chatcmpl-123",
          model: VALID_MODEL,
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "Hello!" },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      );
      vi.stubGlobal("fetch", mockFetch);

      const provider = new GroqProvider({ apiKey: VALID_API_KEY });
      const response = await provider.generate(makeRequest());

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain("/chat/completions");

      const body = JSON.parse(init.body as string);
      expect(body.model).toBe(GROQ_DEFAULT_MODEL);
      expect(body.stream).toBe(false);
      expect(body.messages).toHaveLength(1);
      expect(body.messages[0].role).toBe("user");
      expect(body.messages[0].content).toBe("Hello");

      const headers = init.headers as Record<string, string>;
      expect(headers["Authorization"]).toBe(`Bearer ${VALID_API_KEY}`);
      expect(headers["Content-Type"]).toBe("application/json");

      expect(response.text).toBe("Hello!");
      expect(response.provider).toBe(GROQ_PROVIDER_ID);
      expect(response.finishReason).toBe("stop");
      expect(response.usage?.totalUnits).toBe(15);

      vi.unstubAllEnvs();
    });

    it("Authorization header contem Bearer sem expor secret em texto plano", async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        mockResponse(200, {
          choices: [
            { message: { role: "assistant", content: "OK" }, finish_reason: "stop" },
          ],
        }),
      );
      vi.stubGlobal("fetch", mockFetch);

      const provider = new GroqProvider({ apiKey: VALID_API_KEY });
      await provider.generate(makeRequest());

      const [, init] = mockFetch.mock.calls[0];
      const headers = init.headers as Record<string, string>;
      expect(headers["Authorization"]).toMatch(/^Bearer\s+.+$/);
      expect(headers["Authorization"]).not.toContain("undefined");

      vi.unstubAllEnvs();
    });

    it("GROQ_MODEL eh configuravel", async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        mockResponse(200, {
          choices: [
            { message: { role: "assistant", content: "Hi" }, finish_reason: "stop" },
          ],
        }),
      );
      vi.stubGlobal("fetch", mockFetch);

      const customModel = "llama-3.1-8b-instant";
      const provider = new GroqProvider({
        apiKey: VALID_API_KEY,
        defaultModel: customModel,
      });
      await provider.generate(makeRequest());

      const [, init] = mockFetch.mock.calls[0];
      const body = JSON.parse(init.body as string);
      expect(body.model).toBe(customModel);

      vi.unstubAllEnvs();
    });
  });
});
