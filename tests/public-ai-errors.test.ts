import { describe, expect, it } from "vitest";
import { toPublicAIError } from "../lib/ai/runtime/public-ai-errors";

describe("public ai errors", () => {
  it.each([
    [
      { code: "timeout", message: "http://internal.local timed out" },
      "timeout",
      "A Hanira demorou mais que o esperado para responder.",
    ],
    [
      { code: "unavailable", message: "dial tcp 127.0.0.1:11434" },
      "unavailable",
      "O motor local da Hanira não está disponível no momento.",
    ],
    [
      { code: "model_not_found", message: "llama3 missing" },
      "model_not_found",
      "O modelo local da Hanira ainda não está instalado.",
    ],
    [
      { code: "invalid_request", message: "prompt leaked here" },
      "invalid_request",
      "Não foi possível processar esta solicitação.",
    ],
    [
      { code: "provider_error", message: "provider body secret" },
      "provider_error",
      "A Hanira encontrou um problema ao gerar a resposta.",
    ],
  ])("normaliza %s", (input, code, message) => {
    expect(toPublicAIError(input)).toMatchObject({
      code,
      message,
      cancelled: false,
    });
  });

  it("marca cancelamento sem tratar como erro público comum", () => {
    expect(toPublicAIError({ code: "cancelled" })).toMatchObject({
      code: "cancelled",
      cancelled: true,
      message: "",
    });
  });

  it("não vaza detalhes internos", () => {
    const secret = "http://internal.local prompt=segredo stacktrace";
    expect(JSON.stringify(toPublicAIError(new Error(secret)))).not.toContain(
      "internal.local",
    );
    expect(JSON.stringify(toPublicAIError(new Error(secret)))).not.toContain(
      "segredo",
    );
  });
});
