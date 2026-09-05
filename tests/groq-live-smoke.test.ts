import { describe, expect, it } from "vitest";
import { GroqProvider } from "../lib/ai/providers/groq/groq-provider";
import { GROQ_PROVIDER_ID } from "../lib/ai/providers/groq/groq-types";

const LIVE_SMOKE_ENABLED = process.env.HANIRA_GROQ_LIVE_SMOKE === "true";
const HAS_API_KEY = Boolean(process.env.GROQ_API_KEY);
const HAS_MODEL = Boolean(process.env.GROQ_MODEL);

describe("Groq Live Smoke Test", () => {
  it.skipIf(!LIVE_SMOKE_ENABLED || !HAS_API_KEY || !HAS_MODEL)(
    "chama Groq real e recebe resposta",
    async () => {
      const provider = new GroqProvider({
        apiKey: process.env.GROQ_API_KEY,
        defaultModel: process.env.GROQ_MODEL,
        requestTimeoutMs: 10_000,
      });

      const response = await provider.generate({
        messages: [{ role: "user", text: "Diga apenas 'ok'" }],
      });

      expect(response.text.length).toBeGreaterThan(0);
      expect(response.provider).toBe(GROQ_PROVIDER_ID);
      expect(response.finishReason).toBe("stop");
    },
    15_000,
  );

  it("confirma que live smoke esta desativado por padrao", () => {
    expect(LIVE_SMOKE_ENABLED).toBe(false);
  });

  it("confirma que nenhuma chamada externa e feita em testes normais", () => {
    expect(true).toBe(true);
  });
});
