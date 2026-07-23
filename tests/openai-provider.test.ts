import { describe, expect, it } from "vitest";
import type { AIProvider } from "../lib/ai/provider";
import type { AIStreamEvent } from "../lib/ai/types";
import { OpenAIProvider } from "../lib/ai/providers/openai";

function createClientDouble(
  implementation: (
    params: unknown,
    options?: { signal?: AbortSignal },
  ) => Promise<unknown>,
) {
  const calls: Array<{ params: unknown; options?: { signal?: AbortSignal } }> = [];
  return {
    calls,
    client: {
      responses: {
        create: async (params: unknown, options?: { signal?: AbortSignal }) => {
          calls.push({ params, options });
          return implementation(params, options);
        },
      },
    },
  };
}

describe("OpenAIProvider", () => {
  it("satisfaz o contrato base e anuncia capacidades textuais", () => {
    const provider: AIProvider = new OpenAIProvider({
      clientFactory: () => ({
        responses: { create: async () => ({ output_text: "ok" }) },
      }),
      defaultModel: "gpt-test",
    });

    expect(provider.providerId).toBe("openai");
    expect(provider.supports("text-generation")).toBe(true);
    expect(provider.supports("text-streaming")).toBe(true);
    expect(provider.supports("vision")).toBe(false);
    expect(provider.capabilities.supported).toEqual([
      "text-generation",
      "text-streaming",
    ]);
  });

  it("mapeia mensagens e geração completa sem expor objetos do SDK", async () => {
    const { calls, client } = createClientDouble(async () => ({
      model: "gpt-4.1-mini",
      output_text: "Resposta final",
      usage: {
        input_tokens: 11,
        output_tokens: 7,
        total_tokens: 18,
      },
      finish_reason: "stop",
    }));
    const provider = new OpenAIProvider({
      clientFactory: () => client,
      defaultModel: "gpt-4.1-mini",
    });

    const response = await provider.generate({
      messages: [
        { role: "system", text: "Siga as regras." },
        { role: "user", text: "Olá" },
        { role: "assistant", text: "Oi" },
      ],
      temperature: 0.2,
      maxOutputTokens: 120,
    });

    expect(response).toEqual({
      text: "Resposta final",
      provider: "openai",
      model: "gpt-4.1-mini",
      usage: {
        inputUnits: 11,
        outputUnits: 7,
        totalUnits: 18,
      },
      finishReason: "stop",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.params).toEqual({
      model: "gpt-4.1-mini",
      input: [
        { role: "user", content: "Olá" },
        { role: "assistant", content: "Oi" },
      ],
      instructions: "Siga as regras.",
      temperature: 0.2,
      max_output_tokens: 120,
      stream: false,
      store: false,
    });
  });

  it("usa o modelo explicitamente informado no request", async () => {
    const { calls, client } = createClientDouble(async () => ({
      model: "gpt-explicit",
      output_text: "ok",
      finish_reason: "stop",
    }));
    const provider = new OpenAIProvider({
      clientFactory: () => client,
      defaultModel: "gpt-default",
    });

    await provider.generate({
      model: "gpt-explicit",
      messages: [{ role: "user", text: "teste" }],
    });

    expect(calls[0]?.params).toMatchObject({
      model: "gpt-explicit",
    });
  });

  it("normaliza finish reason e usage", async () => {
    const { client } = createClientDouble(async () => ({
      model: "gpt-test",
      output_text: "ok",
      usage: { input_tokens: 3 },
      finish_reason: "length",
    }));
    const provider = new OpenAIProvider({
      clientFactory: () => client,
      defaultModel: "gpt-test",
    });

    const response = await provider.generate({
      messages: [{ role: "user", text: "teste" }],
    });

    expect(response.finishReason).toBe("max_output_tokens");
    expect(response.usage).toEqual({ inputUnits: 3 });
  });

  it("emite start, múltiplos deltas, usage e finish no streaming", async () => {
    async function* source() {
      yield { type: "response.output_text.delta", delta: "olá " };
      yield { type: "response.output_text.delta", delta: "mundo" };
      yield {
        type: "response.completed",
        response: {
          model: "gpt-stream",
          usage: { input_tokens: 2, output_tokens: 2, total_tokens: 4 },
          finish_reason: "stop",
        },
      };
    }

    const { client } = createClientDouble(async () => source());
    const provider = new OpenAIProvider({
      clientFactory: () => client,
      defaultModel: "gpt-stream",
    });

    const events: AIStreamEvent[] = [];
    for await (const event of provider.stream({
      messages: [{ role: "user", text: "teste" }],
    })) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: "start", provider: "openai", model: "gpt-stream" },
      { type: "text-delta", textDelta: "olá " },
      { type: "text-delta", textDelta: "mundo" },
      {
        type: "usage",
        usage: { inputUnits: 2, outputUnits: 2, totalUnits: 4 },
      },
      {
        type: "finish",
        finishReason: "stop",
        usage: { inputUnits: 2, outputUnits: 2, totalUnits: 4 },
      },
    ]);
  });

  it("emite error normalizado no streaming quando o provider falha", async () => {
    const { client } = createClientDouble(async () => {
      throw { status: 429, message: "too many requests" };
    });
    const provider = new OpenAIProvider({
      clientFactory: () => client,
      defaultModel: "gpt-stream",
    });

    const events: AIStreamEvent[] = [];
    for await (const event of provider.stream({
      messages: [{ role: "user", text: "teste" }],
    })) {
      events.push(event);
    }

    expect(events[0]).toEqual({
      type: "error",
      error: expect.objectContaining({
        code: "rate_limit",
        provider: "openai",
        retryable: true,
      }),
    });
  });

  it("normaliza authentication, model_not_found e erro desconhecido", async () => {
    const authProvider = new OpenAIProvider({
      clientFactory: () => ({
        responses: {
          create: async () => {
            throw { status: 401, message: "auth failed" };
          },
        },
      }),
      defaultModel: "gpt-test",
    });

    await expect(
      authProvider.generate({ messages: [{ role: "user", text: "oi" }] }),
    ).rejects.toMatchObject({ code: "authentication", provider: "openai" });

    const modelProvider = new OpenAIProvider({
      clientFactory: () => ({
        responses: {
          create: async () => {
            throw { status: 404, code: "model_not_found" };
          },
        },
      }),
      defaultModel: "gpt-test",
    });

    await expect(
      modelProvider.generate({ messages: [{ role: "user", text: "oi" }] }),
    ).rejects.toMatchObject({ code: "model_not_found", provider: "openai" });

    const unknownProvider = new OpenAIProvider({
      clientFactory: () => ({
        responses: {
          create: async () => {
            throw new Error("boom");
          },
        },
      }),
      defaultModel: "gpt-test",
    });

    await expect(
      unknownProvider.generate({ messages: [{ role: "user", text: "oi" }] }),
    ).rejects.toMatchObject({ code: "unknown", provider: "openai" });
  });

  it("preserva cause e suporta cancelamento", async () => {
    const controller = new AbortController();
    controller.abort();

    const provider = new OpenAIProvider({
      clientFactory: () => ({
        responses: {
          create: async () => {
            throw new DOMException("aborted", "AbortError");
          },
        },
      }),
      defaultModel: "gpt-test",
    });

    await expect(
      provider.generate({
        messages: [{ role: "user", text: "oi" }],
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({
      code: "cancelled",
      provider: "openai",
    });
  });

  it("normaliza timeout configurável no request", async () => {
    const { client } = createClientDouble(
      () =>
        new Promise((_, reject) => {
          setTimeout(() => reject(new DOMException("timed out", "AbortError")), 20);
        }),
    );

    const provider = new OpenAIProvider({
      clientFactory: () => client,
      defaultModel: "gpt-test",
    });

    await expect(
      provider.generate({
        messages: [{ role: "user", text: "oi" }],
        timeoutMs: 5,
      }),
    ).rejects.toMatchObject({
      code: "timeout",
      provider: "openai",
      retryable: true,
    });
  });

  it("faz healthCheck sem rede e lista apenas o modelo textual configurado", async () => {
    const provider = new OpenAIProvider({
      clientFactory: () => ({
        responses: { create: async () => ({}) },
      }),
      defaultModel: "gpt-configured",
    });

    await expect(provider.healthCheck()).resolves.toMatchObject({
      ok: true,
      provider: "openai",
      metadata: { strategy: "client-and-config-check", model: "gpt-configured" },
    });
    await expect(provider.listModels()).resolves.toEqual([
      {
        id: "gpt-configured",
        provider: "openai",
        capabilities: ["text-generation", "text-streaming"],
      },
    ]);
  });
});
