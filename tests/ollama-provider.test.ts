import { afterEach, describe, expect, it, vi } from "vitest";
import type { AIProvider } from "../lib/ai/provider";
import type { AIStreamEvent } from "../lib/ai/types";
import {
  DEFAULT_OLLAMA_MODEL,
  OllamaProvider,
  createDefaultOllamaProvider,
} from "../lib/ai/providers/ollama";

type FetchCall = {
  input: RequestInfo | URL;
  init?: RequestInit;
};

function createJsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function createStreamResponse(chunks: Uint8Array[], init?: ResponseInit) {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    }),
    {
      headers: { "content-type": "application/x-ndjson" },
      ...init,
    },
  );
}

function createTrackedBody(
  chunks: Array<{ done: boolean; value?: Uint8Array }>,
  tracker: { cancelCalls: number; releaseLockCalls: number },
) {
  return {
    getReader() {
      let index = 0;
      return {
        async read() {
          const chunk = chunks[index++];
          if (!chunk) return { done: true, value: undefined };
          return chunk;
        },
        async cancel() {
          tracker.cancelCalls += 1;
        },
        releaseLock() {
          tracker.releaseLockCalls += 1;
        },
      };
    },
  } as unknown as ReadableStream<Uint8Array>;
}

function splitUtf8(value: string, splitAt: number): Uint8Array[] {
  const bytes = new TextEncoder().encode(value);
  return [bytes.slice(0, splitAt), bytes.slice(splitAt)];
}

function createFetchDouble(
  implementation: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
) {
  const calls: FetchCall[] = [];
  const fetchDouble: typeof fetch = async (input, init) => {
    calls.push({ input, init });
    return implementation(input, init);
  };

  return {
    calls,
    fetch: fetchDouble,
  };
}

async function collectStream(provider: OllamaProvider, request: {
  messages: Array<{ role: "user"; text: string }>;
  signal?: AbortSignal;
} = {
  messages: [{ role: "user" as const, text: "teste" }],
}) {
  const events: AIStreamEvent[] = [];
  for await (const event of provider.stream(request)) {
    events.push(event);
  }
  return events;
}

describe("OllamaProvider", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("satisfaz o contrato base e anuncia capacidades textuais", () => {
    const provider: AIProvider = new OllamaProvider({
      fetch: async () => createJsonResponse({ models: [] }),
    });

    expect(provider.providerId).toBe("ollama");
    expect(provider.displayName).toBe("Ollama");
    expect(provider.supports("text-generation")).toBe(true);
    expect(provider.supports("text-streaming")).toBe(true);
    expect(provider.supports("vision")).toBe(false);
    expect(provider.capabilities.supported).toEqual([
      "text-generation",
      "text-streaming",
    ]);
  });

  it("usa Qwen como modelo padrao configuravel", async () => {
    const { calls, fetch } = createFetchDouble(async () =>
      createJsonResponse({
        model: DEFAULT_OLLAMA_MODEL,
        message: { content: "ok" },
        done: true,
        done_reason: "stop",
      }),
    );
    const provider = new OllamaProvider({ fetch });

    await provider.generate({
      messages: [{ role: "user", text: "oi" }],
    });

    const body = JSON.parse(String(calls[0]?.init?.body));
    expect(body.model).toBe(DEFAULT_OLLAMA_MODEL);
  });

  it("permite override de modelo e baseUrl na factory e no provider", async () => {
    const originalModel = process.env.OLLAMA_MODEL;
    const originalBaseUrl = process.env.OLLAMA_BASE_URL;
    process.env.OLLAMA_MODEL = "qwen-custom:7b";
    process.env.OLLAMA_BASE_URL = "http://localhost:11434/";

    try {
      const { calls, fetch } = createFetchDouble(async () =>
        createJsonResponse({
          model: "qwen-explicit:14b",
          message: { content: "ok" },
          done: true,
          done_reason: "stop",
        }),
      );

      const factoryProvider = createDefaultOllamaProvider({ fetch });
      await factoryProvider.generate({
        messages: [{ role: "user", text: "oi" }],
      });

      expect(String(calls[0]?.input)).toBe("http://localhost:11434/api/chat");
      expect(JSON.parse(String(calls[0]?.init?.body)).model).toBe("qwen-custom:7b");

      const directProvider = new OllamaProvider({
        fetch,
        baseUrl: "http://127.0.0.1:9999/",
        defaultModel: "qwen-explicit:14b",
      });
      await directProvider.generate({
        messages: [{ role: "user", text: "oi" }],
      });

      expect(String(calls[1]?.input)).toBe("http://127.0.0.1:9999/api/chat");
      expect(JSON.parse(String(calls[1]?.init?.body)).model).toBe("qwen-explicit:14b");
    } finally {
      if (originalModel === undefined) {
        delete process.env.OLLAMA_MODEL;
      } else {
        process.env.OLLAMA_MODEL = originalModel;
      }

      if (originalBaseUrl === undefined) {
        delete process.env.OLLAMA_BASE_URL;
      } else {
        process.env.OLLAMA_BASE_URL = originalBaseUrl;
      }
    }
  });

  it("mapeia mensagens e generate sem expor objetos externos", async () => {
    const { calls, fetch } = createFetchDouble(async () =>
      createJsonResponse({
        model: "qwen2.5:latest",
        message: { content: "Resposta Ollama" },
        done: true,
        done_reason: "stop",
        prompt_eval_count: 9,
        eval_count: 4,
      }),
    );
    const provider = new OllamaProvider({
      fetch,
      defaultModel: "qwen2.5:latest",
    });

    const response = await provider.generate({
      messages: [
        { role: "system", text: "Seja conciso." },
        { role: "user", text: "Ola" },
        { role: "assistant", text: "Oi" },
      ],
      temperature: 0.4,
      maxOutputTokens: 128,
    });

    expect(response).toEqual({
      text: "Resposta Ollama",
      provider: "ollama",
      model: "qwen2.5:latest",
      usage: { inputUnits: 9, outputUnits: 4, totalUnits: 13 },
      finishReason: "stop",
    });
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      model: "qwen2.5:latest",
      messages: [
        { role: "system", content: "Seja conciso." },
        { role: "user", content: "Ola" },
        { role: "assistant", content: "Oi" },
      ],
      stream: false,
      options: {
        temperature: 0.4,
        num_predict: 128,
      },
    });
  });

  it("normaliza usage e finish reason em generate", async () => {
    const provider = new OllamaProvider({
      fetch: async () =>
        createJsonResponse({
          model: "qwen",
          message: { content: "ok" },
          done: true,
          done_reason: "length",
          prompt_eval_count: 2,
        }),
    });

    const response = await provider.generate({
      messages: [{ role: "user", text: "teste" }],
    });

    expect(response.finishReason).toBe("max_output_tokens");
    expect(response.usage).toEqual({
      inputUnits: 2,
      totalUnits: 2,
    });
  });

  it("faz streaming simples com multiplos deltas, usage e finish", async () => {
    const provider = new OllamaProvider({
      fetch: async () =>
        createStreamResponse([
          new TextEncoder().encode(
            [
              JSON.stringify({ message: { content: "ola " }, done: false }),
              JSON.stringify({ message: { content: "mundo" }, done: false }),
              JSON.stringify({
                done: true,
                done_reason: "stop",
                prompt_eval_count: 3,
                eval_count: 2,
              }),
            ].join("\n") + "\n",
          ),
        ]),
    });

    await expect(collectStream(provider)).resolves.toEqual([
      { type: "start", provider: "ollama", model: DEFAULT_OLLAMA_MODEL },
      { type: "text-delta", textDelta: "ola " },
      { type: "text-delta", textDelta: "mundo" },
      {
        type: "usage",
        usage: { inputUnits: 3, outputUnits: 2, totalUnits: 5 },
      },
      {
        type: "finish",
        finishReason: "stop",
        usage: { inputUnits: 3, outputUnits: 2, totalUnits: 5 },
      },
    ]);
  });

  it("faz parser NDJSON incremental com JSON dividido entre chunks", async () => {
    const first = new TextEncoder().encode(
      "{\"message\":{\"content\":\"ol",
    );
    const second = new TextEncoder().encode(
      "a\"},\"done\":false}\n{\"done\":true,\"done_reason\":\"stop\"}\n",
    );
    const provider = new OllamaProvider({
      fetch: async () => createStreamResponse([first, second]),
    });

    const events = await collectStream(provider);
    expect(events[1]).toEqual({ type: "text-delta", textDelta: "ola" });
    expect(events[2]).toEqual({ type: "finish", finishReason: "stop" });
  });

  it("aceita varias linhas por chunk, CRLF e linha final sem newline", async () => {
    const provider = new OllamaProvider({
      fetch: async () =>
        createStreamResponse([
          new TextEncoder().encode(
            "{\"message\":{\"content\":\"A\"},\"done\":false}\r\n\r\n{\"message\":{\"content\":\"B\"},\"done\":false}\r\n{\"done\":true,\"done_reason\":\"stop\"}",
          ),
        ]),
    });

    await expect(collectStream(provider)).resolves.toEqual([
      { type: "start", provider: "ollama", model: DEFAULT_OLLAMA_MODEL },
      { type: "text-delta", textDelta: "A" },
      { type: "text-delta", textDelta: "B" },
      { type: "finish", finishReason: "stop" },
    ]);
  });

  it("suporta UTF-8 multibyte dividido entre chunks", async () => {
    const chunks = splitUtf8(
      "{\"message\":{\"content\":\"olá\"},\"done\":false}\n{\"done\":true,\"done_reason\":\"stop\"}\n",
      25,
    );
    const provider = new OllamaProvider({
      fetch: async () => createStreamResponse(chunks),
    });

    const events = await collectStream(provider);
    expect(events[1]).toEqual({ type: "text-delta", textDelta: "olá" });
  });

  it("retorna erro normalizado quando o body do stream esta ausente", async () => {
    const provider = new OllamaProvider({
      fetch: async () =>
        ({
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/x-ndjson" }),
          body: null,
          text: async () => "",
        }) as Response,
    });

    await expect(collectStream(provider)).rejects.toMatchObject({
      code: "provider_error",
      provider: "ollama",
    });
  });

  it("retorna erro normalizado para JSON invalido no stream", async () => {
    const provider = new OllamaProvider({
      fetch: async () =>
        createStreamResponse([
          new TextEncoder().encode("{\"message\":{\"content\":\"ok\"},\"done\":false}\n{bad json}\n"),
        ]),
    });

    await expect(collectStream(provider)).rejects.toMatchObject({
      code: "provider_error",
      provider: "ollama",
      metadata: expect.objectContaining({
        reason: "invalid-json",
      }),
    });
  });

  it("rejeita content-type inesperado em generate e stream", async () => {
    const generateProvider = new OllamaProvider({
      fetch: async () =>
        new Response(JSON.stringify({ done: true, message: { content: "ok" } }), {
          headers: { "content-type": "text/plain" },
        }),
    });

    await expect(
      generateProvider.generate({ messages: [{ role: "user", text: "oi" }] }),
    ).rejects.toMatchObject({
      code: "provider_error",
      metadata: expect.objectContaining({ reason: "unexpected-content-type" }),
    });

    const streamProvider = new OllamaProvider({
      fetch: async () =>
        new Response("{}", {
          headers: { "content-type": "text/html" },
        }),
    });

    await expect(collectStream(streamProvider)).rejects.toMatchObject({
      code: "provider_error",
      metadata: expect.objectContaining({ reason: "unexpected-content-type" }),
    });
  });

  it("normaliza HTTP error e modelo nao instalado", async () => {
    const httpProvider = new OllamaProvider({
      fetch: async () => createJsonResponse({ error: "server exploded" }, { status: 500 }),
    });

    await expect(
      httpProvider.generate({ messages: [{ role: "user", text: "oi" }] }),
    ).rejects.toMatchObject({
      code: "unavailable",
      provider: "ollama",
      statusCode: 500,
    });

    const missingModelProvider = new OllamaProvider({
      fetch: async () =>
        createJsonResponse(
          { error: "model 'qwen' not found, try pulling it first" },
          { status: 404 },
        ),
    });

    await expect(
      missingModelProvider.generate({ messages: [{ role: "user", text: "oi" }] }),
    ).rejects.toMatchObject({
      code: "model_not_found",
      provider: "ollama",
      statusCode: 404,
    });

    const endpoint404Provider = new OllamaProvider({
      fetch: async () => createJsonResponse({ error: "route missing" }, { status: 404 }),
    });

    await expect(
      endpoint404Provider.generate({ messages: [{ role: "user", text: "oi" }] }),
    ).rejects.toMatchObject({
      code: "unavailable",
      provider: "ollama",
      statusCode: 404,
    });

    const rateLimitProvider = new OllamaProvider({
      fetch: async () => createJsonResponse({ error: "too many requests" }, { status: 429 }),
    });

    await expect(
      rateLimitProvider.generate({ messages: [{ role: "user", text: "oi" }] }),
    ).rejects.toMatchObject({
      code: "rate_limit",
      provider: "ollama",
      statusCode: 429,
    });
  });

  it("normaliza indisponibilidade, timeout e cancelamento", async () => {
    const unavailableProvider = new OllamaProvider({
      fetch: async () => {
        throw new Error("connect ECONNREFUSED 127.0.0.1:11434");
      },
    });

    await expect(
      unavailableProvider.generate({ messages: [{ role: "user", text: "oi" }] }),
    ).rejects.toMatchObject({
      code: "unavailable",
      provider: "ollama",
      retryable: true,
    });

    const dnsProvider = new OllamaProvider({
      fetch: async () => {
        throw new Error("getaddrinfo ENOTFOUND ollama.local");
      },
    });

    await expect(
      dnsProvider.generate({ messages: [{ role: "user", text: "oi" }] }),
    ).rejects.toMatchObject({
      code: "unavailable",
      provider: "ollama",
    });

    const closedConnectionProvider = new OllamaProvider({
      fetch: async () => {
        throw new Error("socket hang up");
      },
    });

    await expect(
      closedConnectionProvider.generate({ messages: [{ role: "user", text: "oi" }] }),
    ).rejects.toMatchObject({
      code: "provider_error",
      provider: "ollama",
    });

    const timeoutProvider = new OllamaProvider({
      fetch: async (_input, init) =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              init?.signal?.addEventListener(
                "abort",
                () => {
                  controller.error(new DOMException("aborted", "AbortError"));
                },
                { once: true },
              );
            },
          }),
          {
            headers: { "content-type": "application/json" },
          },
        ),
      requestTimeoutMs: 5,
    });

    await expect(
      timeoutProvider.generate({
        messages: [{ role: "user", text: "oi" }],
      }),
    ).rejects.toMatchObject({
      code: "timeout",
      provider: "ollama",
      retryable: true,
      metadata: expect.objectContaining({ stage: "request" }),
    });

    const connectTimeoutProvider = new OllamaProvider({
      fetch: async (_input, init) =>
        new Promise((_, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("aborted", "AbortError")),
            { once: true },
          );
        }),
      connectTimeoutMs: 5,
      requestTimeoutMs: 50,
    });

    await expect(
      connectTimeoutProvider.generate({
        messages: [{ role: "user", text: "oi" }],
      }),
    ).rejects.toMatchObject({
      code: "timeout",
      provider: "ollama",
      metadata: expect.objectContaining({ stage: "connect" }),
    });

    const controller = new AbortController();
    controller.abort();
    const cancelledProvider = new OllamaProvider({
      fetch: async (_input, init) => {
        if (init?.signal?.aborted) {
          throw new DOMException("aborted", "AbortError");
        }
        return createJsonResponse({});
      },
    });

    await expect(
      cancelledProvider.generate({
        messages: [{ role: "user", text: "oi" }],
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({
      code: "cancelled",
      provider: "ollama",
    });
  });

  it("tolera cold start acima de 5 segundos quando o primeiro token chega dentro do prazo", async () => {
    vi.useFakeTimers();

    const provider = new OllamaProvider({
      fetch: async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              setTimeout(() => {
                controller.enqueue(
                  new TextEncoder().encode(
                    "{\"message\":{\"content\":\"funcionando\"},\"done\":false}\n",
                  ),
                );
                controller.enqueue(
                  new TextEncoder().encode(
                    "{\"done\":true,\"done_reason\":\"stop\"}\n",
                  ),
                );
                controller.close();
              }, 6_000);
            },
          }),
          {
            headers: { "content-type": "application/x-ndjson" },
          },
        ),
      connectTimeoutMs: 1_000,
      firstTokenTimeoutMs: 20_000,
      idleTimeoutMs: 5_000,
    });

    const streamPromise = collectStream(provider);
    await vi.advanceTimersByTimeAsync(6_100);

    await expect(streamPromise).resolves.toEqual([
      { type: "start", provider: "ollama", model: DEFAULT_OLLAMA_MODEL },
      { type: "text-delta", textDelta: "funcionando" },
      { type: "finish", finishReason: "stop" },
    ]);
  });

  it("aplica timeout antes do primeiro token em streaming", async () => {
    vi.useFakeTimers();

    const provider = new OllamaProvider({
      fetch: async (_input, init) =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              init?.signal?.addEventListener(
                "abort",
                () => {
                  controller.error(new DOMException("aborted", "AbortError"));
                },
                { once: true },
              );
              // Mantem a conexao aberta sem enviar chunks.
            },
          }),
          {
            headers: { "content-type": "application/x-ndjson" },
          },
        ),
      connectTimeoutMs: 1_000,
      firstTokenTimeoutMs: 5,
      idleTimeoutMs: 5_000,
    });

    const streamPromise = collectStream(provider);
    const rejection = expect(streamPromise).rejects.toMatchObject({
      code: "timeout",
      provider: "ollama",
      metadata: expect.objectContaining({
        stage: "request",
        phase: "first_token",
      }),
    });
    await vi.advanceTimersByTimeAsync(10);
    await rejection;
  });

  it("aplica timeout por inatividade entre chunks", async () => {
    vi.useFakeTimers();

    const provider = new OllamaProvider({
      fetch: async (_input, init) =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              init?.signal?.addEventListener(
                "abort",
                () => {
                  controller.error(new DOMException("aborted", "AbortError"));
                },
                { once: true },
              );
              controller.enqueue(
                new TextEncoder().encode(
                  "{\"message\":{\"content\":\"parcial\"},\"done\":false}\n",
                ),
              );
            },
          }),
          {
            headers: { "content-type": "application/x-ndjson" },
          },
        ),
      connectTimeoutMs: 1_000,
      firstTokenTimeoutMs: 50,
      idleTimeoutMs: 5,
    });

    const streamPromise = collectStream(provider);
    const rejection = expect(streamPromise).rejects.toMatchObject({
      code: "timeout",
      provider: "ollama",
      metadata: expect.objectContaining({
        stage: "request",
        phase: "idle",
      }),
    });
    await vi.advanceTimersByTimeAsync(10);
    await rejection;
  });

  it("limpa os timers quando o cliente cancela o streaming", async () => {
    vi.useFakeTimers();

    const controller = new AbortController();
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    const provider = new OllamaProvider({
      fetch: async (_input, init) =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(streamController) {
              init?.signal?.addEventListener(
                "abort",
                () => {
                  streamController.error(new DOMException("aborted", "AbortError"));
                },
                { once: true },
              );
            },
          }),
          {
            headers: { "content-type": "application/x-ndjson" },
          },
        ),
      connectTimeoutMs: 1_000,
      firstTokenTimeoutMs: 10_000,
      idleTimeoutMs: 10_000,
      requestTimeoutMs: 20_000,
    });

    const streamPromise = collectStream(provider, {
      messages: [{ role: "user" as const, text: "teste" }],
      signal: controller.signal,
    });
    const rejection = expect(streamPromise).rejects.toMatchObject({
      code: "cancelled",
      provider: "ollama",
    });
    controller.abort();
    await vi.runAllTimersAsync();
    await rejection;
    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  it("faz healthCheck pelo endpoint de tags e lista modelos ordenados", async () => {
    const { fetch } = createFetchDouble(async (input) => {
      if (String(input).endsWith("/api/tags")) {
        return createJsonResponse({
          models: [
            { name: "zeta", size: 3, modified_at: "2026-07-21T10:00:00Z" },
            { name: "alpha", size: 1, modified_at: "2026-07-20T10:00:00Z" },
          ],
        });
      }

      return createJsonResponse({});
    });
    const provider = new OllamaProvider({ fetch });

    await expect(provider.healthCheck()).resolves.toMatchObject({
      ok: true,
      provider: "ollama",
      metadata: {
        strategy: "tags-endpoint",
        defaultModel: DEFAULT_OLLAMA_MODEL,
        modelCount: 2,
      },
    });

    await expect(provider.listModels()).resolves.toEqual([
      {
        id: "alpha",
        provider: "ollama",
        capabilities: ["text-generation", "text-streaming"],
        metadata: {
          modifiedAt: "2026-07-20T10:00:00Z",
          size: 1,
        },
      },
      {
        id: "zeta",
        provider: "ollama",
        capabilities: ["text-generation", "text-streaming"],
        metadata: {
          modifiedAt: "2026-07-21T10:00:00Z",
          size: 3,
        },
      },
    ]);
  });

  it("retorna healthCheck negativo sem usar rede real", async () => {
    const provider = new OllamaProvider({
      fetch: async () => {
        throw new Error("fetch failed");
      },
    });

    await expect(provider.healthCheck()).resolves.toMatchObject({
      ok: false,
      provider: "ollama",
      metadata: {
        strategy: "tags-endpoint",
        code: "unavailable",
      },
    });
  });

  it("falha se o stream termina sem evento done", async () => {
    const provider = new OllamaProvider({
      fetch: async () =>
        createStreamResponse([
          new TextEncoder().encode(
            "{\"message\":{\"content\":\"parcial\"},\"done\":false}\n",
          ),
        ]),
    });

    await expect(collectStream(provider)).rejects.toMatchObject({
      code: "provider_error",
      metadata: expect.objectContaining({ reason: "stream-without-finish" }),
    });
  });

  it("interrompe o stream quando o Ollama envia erro explicito no NDJSON", async () => {
    const provider = new OllamaProvider({
      fetch: async () =>
        createStreamResponse([
          new TextEncoder().encode(
            "{\"message\":{\"content\":\"parcial\"},\"done\":false}\n{\"error\":\"model not found, try pulling it first\"}\n",
          ),
        ]),
    });

    await expect(collectStream(provider)).rejects.toMatchObject({
      code: "model_not_found",
      provider: "ollama",
    });
  });

  it("rejeita finish duplicado apos validar o restante do stream", async () => {
    const provider = new OllamaProvider({
      fetch: async () =>
        createStreamResponse([
          new TextEncoder().encode(
            "{\"done\":true,\"done_reason\":\"stop\"}\n{\"done\":true,\"done_reason\":\"stop\"}\n",
          ),
        ]),
    });

    await expect(collectStream(provider)).rejects.toMatchObject({
      code: "provider_error",
      metadata: expect.objectContaining({ reason: "post-finish-data" }),
    });
  });

  it("rejeita usage apos finish", async () => {
    const provider = new OllamaProvider({
      fetch: async () =>
        createStreamResponse([
          new TextEncoder().encode(
            "{\"done\":true,\"done_reason\":\"stop\"}\n{\"done\":false,\"prompt_eval_count\":1,\"eval_count\":2}\n",
          ),
        ]),
    });

    await expect(collectStream(provider)).rejects.toMatchObject({
      code: "provider_error",
      metadata: expect.objectContaining({ reason: "post-finish-data" }),
    });
  });

  it("rejeita delta apos finish", async () => {
    const provider = new OllamaProvider({
      fetch: async () =>
        createStreamResponse([
          new TextEncoder().encode(
            "{\"done\":true,\"done_reason\":\"stop\"}\n{\"message\":{\"content\":\"extra\"},\"done\":false}\n",
          ),
        ]),
    });

    await expect(collectStream(provider)).rejects.toMatchObject({
      code: "provider_error",
      metadata: expect.objectContaining({ reason: "post-finish-data" }),
    });
  });

  it("rejeita error apos finish", async () => {
    const provider = new OllamaProvider({
      fetch: async () =>
        createStreamResponse([
          new TextEncoder().encode(
            "{\"done\":true,\"done_reason\":\"stop\"}\n{\"error\":\"model not found, try pulling it first\"}\n",
          ),
        ]),
    });

    await expect(collectStream(provider)).rejects.toMatchObject({
      code: "provider_error",
      metadata: expect.objectContaining({ reason: "post-finish-data" }),
    });
  });

  it("rejeita JSON invalido apos finish", async () => {
    const provider = new OllamaProvider({
      fetch: async () =>
        createStreamResponse([
          new TextEncoder().encode(
            "{\"done\":true,\"done_reason\":\"stop\"}\n{bad json}\n",
          ),
        ]),
    });

    await expect(collectStream(provider)).rejects.toMatchObject({
      code: "provider_error",
      metadata: expect.objectContaining({ reason: "invalid-json" }),
    });
  });

  it("aceita linhas vazias apos finish", async () => {
    const provider = new OllamaProvider({
      fetch: async () =>
        createStreamResponse([
          new TextEncoder().encode(
            "{\"message\":{\"content\":\"ok\"},\"done\":false}\n{\"done\":true,\"done_reason\":\"stop\"}\n\n \r\n",
          ),
        ]),
    });

    await expect(collectStream(provider)).resolves.toEqual([
      { type: "start", provider: "ollama", model: DEFAULT_OLLAMA_MODEL },
      { type: "text-delta", textDelta: "ok" },
      { type: "finish", finishReason: "stop" },
    ]);
  });

  it("aceita EOF imediato apos finish", async () => {
    const provider = new OllamaProvider({
      fetch: async () =>
        createStreamResponse([
          new TextEncoder().encode(
            "{\"message\":{\"content\":\"ok\"},\"done\":false}\n{\"done\":true,\"done_reason\":\"stop\"}",
          ),
        ]),
    });

    await expect(collectStream(provider)).resolves.toEqual([
      { type: "start", provider: "ollama", model: DEFAULT_OLLAMA_MODEL },
      { type: "text-delta", textDelta: "ok" },
      { type: "finish", finishReason: "stop" },
    ]);
  });

  it("mantem cleanup do reader apos violacao pos-finish", async () => {
    const tracker = { cancelCalls: 0, releaseLockCalls: 0 };
    const provider = new OllamaProvider({
      fetch: async () =>
        ({
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/x-ndjson" }),
          body: createTrackedBody(
            [
              {
                done: false,
                value: new TextEncoder().encode(
                  "{\"done\":true,\"done_reason\":\"stop\"}\n{\"done\":true,\"done_reason\":\"stop\"}\n",
                ),
              },
              { done: true },
            ],
            tracker,
          ),
          text: async () => "",
        }) as Response,
    });

    await expect(collectStream(provider)).rejects.toMatchObject({
      code: "provider_error",
      metadata: expect.objectContaining({ reason: "post-finish-data" }),
    });
    expect(tracker.cancelCalls).toBe(1);
    expect(tracker.releaseLockCalls).toBe(1);
  });
});
