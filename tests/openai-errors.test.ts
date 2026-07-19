import { describe, expect, it } from "vitest";
import { classifyOpenAIError } from "../lib/openai/errors";

describe("erros seguros da OpenAI", () => {
  it.each([
    [401, 503, "OpenAIAuthenticationError"],
    [403, 503, "OpenAIModelAccessError"],
    [429, 429, "OpenAIRateLimitError"],
    [500, 503, "OpenAIServiceError"],
  ])("classifica status %s", (input, status, type) => {
    expect(classifyOpenAIError({ status: input })).toMatchObject({
      status,
      type,
    });
  });

  it("não devolve detalhes internos desconhecidos", () => {
    const secret = "sk-never-return-this";
    expect(JSON.stringify(classifyOpenAIError(new Error(secret)))).not.toContain(
      secret,
    );
  });
});
