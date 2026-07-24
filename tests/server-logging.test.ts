import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { logServerEvent } from "../lib/logging/server";

const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

describe("server logging", () => {
  afterEach(() => {
    infoSpy.mockClear();
    warnSpy.mockClear();
    errorSpy.mockClear();
  });

  it("registra somente campos seguros e estruturados", () => {
    const userSecret = "usuario: preciso de ajuda com meu cartao 4111 1111 1111 1111";
    const assistantSecret = "resposta completa: aqui esta todo o historico da conversa";

    logServerEvent({
      level: "error",
      requestId: "req-12345678",
      projectId: "legacy-conversation:conv-1",
      conversationId: "conv-1",
      providerId: "ollama",
      modelId: "qwen2.5:latest",
      route: "/api/chat",
      event: "invalid_provider_response",
      status: 502,
      durationMs: 123.4,
      errorCode: "provider_error",
      stage: "provider_stream",
      statusCode: 502,
      cancelledByClient: false,
      errorType: "LocalAIInvalidResponse",
    });

    const payload = JSON.parse(String(errorSpy.mock.calls[0]?.[0]));
    expect(payload).toMatchObject({
      requestId: "req-12345678",
      projectId: "legacy-conversation:conv-1",
      conversationId: "conv-1",
      providerId: "ollama",
      modelId: "qwen2.5:latest",
      event: "invalid_provider_response",
      durationMs: 123,
      errorCode: "provider_error",
      stage: "provider_stream",
      statusCode: 502,
    });
    const serialized = JSON.stringify({
      ...payload,
      prompt: userSecret,
      completion: assistantSecret,
    });
    expect(JSON.stringify(payload)).not.toContain("prompt");
    expect(JSON.stringify(payload)).not.toContain("memory");
    expect(JSON.stringify(payload)).not.toContain("personality");
    expect(JSON.stringify(payload)).not.toContain("authorization");
    expect(JSON.stringify(payload)).not.toContain("cookie");
    expect(JSON.stringify(payload)).not.toContain("set-cookie");
    expect(serialized).toContain(userSecret);
    expect(serialized).toContain(assistantSecret);
    expect(JSON.stringify(payload)).not.toContain(userSecret);
    expect(JSON.stringify(payload)).not.toContain(assistantSecret);
  });
});
