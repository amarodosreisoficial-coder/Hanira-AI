import { afterEach, describe, expect, it } from "vitest";
import { AIProviderError } from "../lib/ai/types";
import { createTextChatRuntime } from "../lib/ai/runtime";

const ORIGINAL_ENV = { ...process.env };

describe("createTextChatRuntime", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("cria o runtime com configuracao valida", () => {
    process.env.AI_ENGINE_OLLAMA_ENABLED = "true";
    process.env.OLLAMA_BASE_URL = "http://127.0.0.1:11434/";
    process.env.OLLAMA_MODEL = "qwen2.5:latest";

    const runtime = createTextChatRuntime();

    expect(runtime.model).toBe("qwen2.5:latest");
    expect(runtime.baseUrl).toBe("http://127.0.0.1:11434");
    expect(runtime.provider.providerId).toBe("ollama");
  });

  it("falha quando o Ollama esta desativado", () => {
    process.env.AI_ENGINE_OLLAMA_ENABLED = "false";
    process.env.OLLAMA_BASE_URL = "http://127.0.0.1:11434";
    process.env.OLLAMA_MODEL = "qwen2.5:latest";

    expect(() => createTextChatRuntime()).toThrowError(AIProviderError);
    expect(() => createTextChatRuntime()).toThrowError(/desativado/i);
  });

  it("falha quando a configuracao e invalida", () => {
    process.env.AI_ENGINE_OLLAMA_ENABLED = "true";
    process.env.OLLAMA_BASE_URL = "not-a-url";
    process.env.OLLAMA_MODEL = "";

    expect(() => createTextChatRuntime()).toThrowError(AIProviderError);
  });
});
