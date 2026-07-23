import { describe, expect, it } from "vitest";
import type { AIProvider, AIProviderHealth } from "../lib/ai/provider";
import {
  AIProviderError,
  AI_PROVIDER_ERROR_CODES,
  type AIChatRequest,
  type AIChatResponse,
  type AIProviderCapability,
  type AIStreamEvent,
  isAIProviderErrorCode,
  isRetryableAIProviderErrorCode,
} from "../lib/ai/types";

class FakeAIProvider implements AIProvider {
  readonly providerId = "fake-provider";
  readonly displayName = "Fake Provider";
  readonly capabilities = {
    supported: ["text-generation", "text-streaming"] as const,
  };

  async generate(request: AIChatRequest): Promise<AIChatResponse> {
    const lastUserMessage =
      [...request.messages].reverse().find((message) => message.role === "user")
        ?.text ?? "";

    if (request.signal?.aborted) {
      throw new AIProviderError({
        code: "cancelled",
        message: "A geração foi cancelada antes de iniciar.",
        provider: this.providerId,
        retryable: false,
      });
    }

    return {
      text: `echo:${lastUserMessage}`,
      provider: this.providerId,
      model: request.model ?? "fake-text-model",
      finishReason: "stop",
      usage: {
        inputUnits: request.messages.length,
        outputUnits: 1,
        totalUnits: request.messages.length + 1,
      },
    };
  }

  async *stream(request: AIChatRequest): AsyncIterable<AIStreamEvent> {
    if (request.signal?.aborted) {
      yield {
        type: "error",
        error: new AIProviderError({
          code: "cancelled",
          message: "O streaming foi cancelado.",
          provider: this.providerId,
          retryable: false,
        }),
      };
      return;
    }

    yield {
      type: "start",
      provider: this.providerId,
      model: request.model ?? "fake-text-model",
    };
    yield { type: "text-delta", textDelta: "ola " };
    yield { type: "text-delta", textDelta: "mundo" };
    yield {
      type: "usage",
      usage: { inputUnits: 1, outputUnits: 2, totalUnits: 3 },
    };
    yield { type: "finish", finishReason: "stop" };
  }

  async healthCheck(): Promise<AIProviderHealth> {
    return {
      ok: true,
      provider: this.providerId,
      message: "ready",
    };
  }

  async listModels() {
    return [
      {
        id: "fake-text-model",
        provider: this.providerId,
        capabilities: this.capabilities.supported,
      },
    ];
  }

  supports(capability: AIProviderCapability) {
    return (this.capabilities.supported as readonly AIProviderCapability[]).includes(
      capability,
    );
  }
}

describe("contrato base do AI Engine", () => {
  it("cria AIProviderError preservando cause e retryable explícito", () => {
    const cause = new Error("root cause");
    const error = new AIProviderError({
      code: "invalid_request",
      message: "Pedido inválido.",
      provider: "fake-provider",
      model: "fake-text-model",
      retryable: true,
      cause,
      statusCode: 400,
      metadata: { field: "messages" },
    });

    expect(error.name).toBe("AIProviderError");
    expect(error.code).toBe("invalid_request");
    expect(error.provider).toBe("fake-provider");
    expect(error.model).toBe("fake-text-model");
    expect(error.retryable).toBe(true);
    expect(error.cause).toBe(cause);
    expect(error.statusCode).toBe(400);
    expect(error.metadata).toEqual({ field: "messages" });
  });

  it("infere retryable a partir do código quando não informado", () => {
    const timeoutError = new AIProviderError({
      code: "timeout",
      message: "Tempo esgotado.",
    });
    const authError = new AIProviderError({
      code: "authentication",
      message: "Sem credenciais.",
    });

    expect(timeoutError.retryable).toBe(true);
    expect(authError.retryable).toBe(false);
  });

  it("reconhece os códigos de erro válidos", () => {
    for (const code of AI_PROVIDER_ERROR_CODES) {
      expect(isAIProviderErrorCode(code)).toBe(true);
    }

    expect(isAIProviderErrorCode("not-a-real-code")).toBe(false);
    expect(isRetryableAIProviderErrorCode("rate_limit")).toBe(true);
    expect(isRetryableAIProviderErrorCode("content_rejected")).toBe(false);
  });

  it("permite implementar um provider falso compatível com a interface", async () => {
    const provider = new FakeAIProvider();
    const response = await provider.generate({
      messages: [{ role: "user", text: "teste" }],
    });

    expect(provider.providerId).toBe("fake-provider");
    expect(provider.supports("text-generation")).toBe(true);
    expect(provider.supports("vision")).toBe(false);
    expect(response).toMatchObject({
      text: "echo:teste",
      provider: "fake-provider",
      finishReason: "stop",
    });
  });

  it("usa AsyncIterable com eventos normalizados de streaming", async () => {
    const provider = new FakeAIProvider();
    const events: AIStreamEvent[] = [];

    for await (const event of provider.stream({
      messages: [{ role: "user", text: "oi" }],
    })) {
      events.push(event);
    }

    expect(events).toEqual([
      {
        type: "start",
        provider: "fake-provider",
        model: "fake-text-model",
      },
      { type: "text-delta", textDelta: "ola " },
      { type: "text-delta", textDelta: "mundo" },
      {
        type: "usage",
        usage: { inputUnits: 1, outputUnits: 2, totalUnits: 3 },
      },
      { type: "finish", finishReason: "stop" },
    ]);
  });

  it("permite cancelamento com AbortSignal em provider compatível", async () => {
    const provider = new FakeAIProvider();
    const controller = new AbortController();
    controller.abort();
    const events: AIStreamEvent[] = [];

    for await (const event of provider.stream({
      messages: [{ role: "user", text: "oi" }],
      signal: controller.signal,
    })) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("error");
    if (events[0]?.type === "error") {
      expect(events[0].error.code).toBe("cancelled");
      expect(events[0].error.retryable).toBe(false);
    }
  });
});
