import { afterEach, describe, expect, it } from "vitest";
import { AIProviderError } from "../lib/ai/types";
import {
  createTextChatRuntime,
  OLLAMA_RUNTIME_TIMEOUT_LIMITS,
  resolveOllamaRuntimeConfig,
} from "../lib/ai/runtime";

const ORIGINAL_ENV = { ...process.env };

describe("createTextChatRuntime", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("cria o runtime com configuracao valida", () => {
    process.env.AI_ENGINE_OLLAMA_ENABLED = "true";
    process.env.OLLAMA_BASE_URL = "http://127.0.0.1:11434/";
    process.env.OLLAMA_MODEL = "qwen2.5:latest";
    process.env.OLLAMA_CONNECT_TIMEOUT_MS = "2000";
    process.env.OLLAMA_REQUEST_TIMEOUT_MS = "45000";

    const runtime = createTextChatRuntime();

    expect(runtime.model).toBe("qwen2.5:latest");
    expect(runtime.baseUrl).toBe("http://127.0.0.1:11434");
    expect(runtime.provider.providerId).toBe("ollama");
    expect(runtime.connectTimeoutMs).toBe(2000);
    expect(runtime.requestTimeoutMs).toBe(45000);
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

  it("usa defaults explicitos quando timeouts nao sao definidos", () => {
    process.env.AI_ENGINE_OLLAMA_ENABLED = "true";
    process.env.OLLAMA_BASE_URL = "http://127.0.0.1:11434";
    process.env.OLLAMA_MODEL = "qwen2.5:latest";
    delete process.env.OLLAMA_CONNECT_TIMEOUT_MS;
    delete process.env.OLLAMA_REQUEST_TIMEOUT_MS;

    expect(resolveOllamaRuntimeConfig()).toMatchObject({
      connectTimeoutMs: OLLAMA_RUNTIME_TIMEOUT_LIMITS.connect.fallback,
      requestTimeoutMs: OLLAMA_RUNTIME_TIMEOUT_LIMITS.request.fallback,
    });
  });

  it.each([
    ["OLLAMA_CONNECT_TIMEOUT_MS", "abc"],
    ["OLLAMA_CONNECT_TIMEOUT_MS", "1.5"],
    ["OLLAMA_CONNECT_TIMEOUT_MS", "0"],
    ["OLLAMA_CONNECT_TIMEOUT_MS", "-1"],
    ["OLLAMA_REQUEST_TIMEOUT_MS", "abc"],
    ["OLLAMA_REQUEST_TIMEOUT_MS", "1.5"],
    ["OLLAMA_REQUEST_TIMEOUT_MS", "0"],
    ["OLLAMA_REQUEST_TIMEOUT_MS", "-1"],
  ] as const)("rejeita timeout invalido em %s=%s", (name, value) => {
    process.env.AI_ENGINE_OLLAMA_ENABLED = "true";
    process.env.OLLAMA_BASE_URL = "http://127.0.0.1:11434";
    process.env.OLLAMA_MODEL = "qwen2.5:latest";
    process.env[name] = value;

    expect(() => resolveOllamaRuntimeConfig()).toThrowError(AIProviderError);
  });

  it("rejeita timeout fora do limite e request menor que connect", () => {
    process.env.AI_ENGINE_OLLAMA_ENABLED = "true";
    process.env.OLLAMA_BASE_URL = "http://127.0.0.1:11434";
    process.env.OLLAMA_MODEL = "qwen2.5:latest";
    process.env.OLLAMA_CONNECT_TIMEOUT_MS = "999999";

    expect(() => resolveOllamaRuntimeConfig()).toThrowError(AIProviderError);

    process.env.OLLAMA_CONNECT_TIMEOUT_MS = "5000";
    process.env.OLLAMA_REQUEST_TIMEOUT_MS = "4000";
    expect(() => resolveOllamaRuntimeConfig()).toThrowError(AIProviderError);
  });

  it("rejeita protocolo invalido na base URL", () => {
    process.env.AI_ENGINE_OLLAMA_ENABLED = "true";
    process.env.OLLAMA_BASE_URL = "ftp://127.0.0.1:11434";
    process.env.OLLAMA_MODEL = "qwen2.5:latest";

    expect(() => resolveOllamaRuntimeConfig()).toThrowError(AIProviderError);
  });
});
