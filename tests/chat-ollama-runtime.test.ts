import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { AIProvider, AIProviderHealth } from "../lib/ai/provider";
import {
  AIProviderError,
  type AIChatRequest,
  type AIChatResponse,
  type AIProviderCapability,
  type AIStreamEvent,
} from "../lib/ai/types";
import {
  buildTextChatProviderRequest,
  createTextChatRuntime,
  createTextChatProviderResponse,
  shouldUseOllamaTextProvider,
  toPublicTextChatError,
} from "../lib/ai/runtime";
import { OllamaProvider } from "../lib/ai/providers/ollama";

class FakeStreamProvider implements AIProvider {
  readonly providerId = "fake-ollama";
  readonly displayName = "Fake Ollama";
  readonly capabilities = {
    supported: ["text-generation", "text-streaming"] as const,
  };

  receivedRequest?: AIChatRequest;

  constructor(
    private readonly events: AIStreamEvent[] = [],
    private readonly thrownError?: unknown,
  ) {}

  async generate(request: AIChatRequest): Promise<AIChatResponse> {
    void request;
    throw new Error("generate nao usado neste teste");
  }

  async *stream(request: AIChatRequest): AsyncIterable<AIStreamEvent> {
    this.receivedRequest = request;
    if (this.thrownError) {
      throw this.thrownError;
    }
    for (const event of this.events) {
      yield event;
    }
  }

  async healthCheck(): Promise<AIProviderHealth> {
    return { ok: true, provider: this.providerId };
  }

  async listModels() {
    return [];
  }

  supports(capability: AIProviderCapability) {
    return (this.capabilities.supported as readonly AIProviderCapability[]).includes(
      capability,
    );
  }
}

function route(relative: string) {
  return fs.readFileSync(path.join(process.cwd(), relative), "utf8");
}

async function readSseEvents(response: Response) {
  const raw = await response.text();
  const events = raw
    .split("\n\n")
    .map((block) =>
      block
        .split("\n")
        .find((line) => line.startsWith("data: ")),
    )
    .filter((line): line is string => Boolean(line))
    .map((line) => JSON.parse(line.slice(6)) as Record<string, unknown>);
  return events;
}

describe("runtime controlado do chat com Ollama", () => {
  it("mantem caminho legado quando a flag esta desligada", () => {
    expect(
      shouldUseOllamaTextProvider({
        ollamaEnabled: false,
        attachmentCount: 0,
        imageAttachmentCount: 0,
      }),
    ).toBe(false);
  });

  it("seleciona Ollama quando a flag esta ativa e o pedido e textual simples", () => {
    expect(
      shouldUseOllamaTextProvider({
        ollamaEnabled: true,
        attachmentCount: 0,
        imageAttachmentCount: 0,
      }),
    ).toBe(true);
  });

  it("mantem caminho legado quando ha imagem ou anexo", () => {
    expect(
      shouldUseOllamaTextProvider({
        ollamaEnabled: true,
        attachmentCount: 1,
        imageAttachmentCount: 0,
      }),
    ).toBe(false);
    expect(
      shouldUseOllamaTextProvider({
        ollamaEnabled: true,
        attachmentCount: 1,
        imageAttachmentCount: 1,
      }),
    ).toBe(false);
  });

  it("preserva system prompt, personalidade e historico nas mensagens do provider", async () => {
    const provider = new FakeStreamProvider([
      { type: "start", provider: "fake-ollama", model: "qwen2.5:latest" },
      { type: "text-delta", textDelta: "Olá " },
      { type: "text-delta", textDelta: "mundo" },
      { type: "finish", finishReason: "stop" },
    ]);
    const persisted: string[] = [];

    const response = createTextChatProviderResponse({
      request: new Request("http://localhost/api/chat"),
      provider,
      providerRequest: buildTextChatProviderRequest({
        systemPrompt: "Você é Hanira.",
        personalization: "Use memórias com cuidado.",
        context: [
          { role: "user", content: "Oi" },
          { role: "assistant", content: "Olá" },
          { role: "user", content: "Continue" },
        ],
      }),
      conversationId: "conversation-1",
      requestId: "request-1",
      mode: "ollama",
      onComplete: async ({ assistantContent }) => {
        persisted.push(assistantContent);
      },
    });

    const events = await readSseEvents(response);

    expect(provider.receivedRequest?.messages).toEqual([
      {
        role: "system",
        text: "Você é Hanira.\nUse memórias com cuidado.",
      },
      { role: "user", text: "Oi" },
      { role: "assistant", text: "Olá" },
      { role: "user", text: "Continue" },
    ]);
    expect(events).toEqual([
      {
        type: "start",
        conversationId: "conversation-1",
        mode: "ollama",
        requestId: "request-1",
      },
      { type: "delta", delta: "Olá " },
      { type: "delta", delta: "mundo" },
      { type: "done", conversationId: "conversation-1" },
    ]);
    expect(persisted).toEqual(["Olá mundo"]);
  });

  it("encerra uma vez e persiste uma unica vez no sucesso", async () => {
    const provider = new FakeStreamProvider([
      { type: "start", provider: "fake-ollama", model: "qwen" },
      { type: "text-delta", textDelta: "A" },
      { type: "text-delta", textDelta: "B" },
      { type: "finish", finishReason: "stop" },
    ]);
    let persistCount = 0;

    const response = createTextChatProviderResponse({
      request: new Request("http://localhost/api/chat"),
      provider,
      providerRequest: buildTextChatProviderRequest({
        systemPrompt: "sys",
        context: [{ role: "user", content: "msg" }],
      }),
      conversationId: "c1",
      requestId: "r1",
      mode: "ollama",
      onComplete: async ({ assistantContent }) => {
        persistCount += 1;
        expect(assistantContent).toBe("AB");
      },
    });

    const events = await readSseEvents(response);
    expect(events.filter((event) => event.type === "done")).toHaveLength(1);
    expect(persistCount).toBe(1);
  });

  it("nao emite finish SSE nem persiste quando o provider envia erro explicito", async () => {
    const provider = new FakeStreamProvider([
      { type: "start", provider: "fake-ollama", model: "qwen" },
      { type: "text-delta", textDelta: "parcial" },
      {
        type: "error",
        error: new AIProviderError({
          code: "provider_error",
          message: "bad stream",
          provider: "fake-ollama",
        }),
      },
    ]);
    let persisted = false;

    const response = createTextChatProviderResponse({
      request: new Request("http://localhost/api/chat"),
      provider,
      providerRequest: buildTextChatProviderRequest({
        systemPrompt: "sys",
        context: [{ role: "user", content: "msg" }],
      }),
      conversationId: "c1",
      requestId: "r1",
      mode: "ollama",
      onComplete: async () => {
        persisted = true;
      },
    });

    const events = await readSseEvents(response);
    expect(events).toEqual([
      { type: "start", conversationId: "c1", mode: "ollama", requestId: "r1" },
      { type: "delta", delta: "parcial" },
      {
        type: "error",
        message: "A Hanira encontrou um problema ao gerar a resposta.",
        requestId: "r1",
      },
    ]);
    expect(persisted).toBe(false);
  });

  it("converte timeout, indisponibilidade e modelo ausente em mensagens publicas seguras", async () => {
    const timeoutResponse = createTextChatProviderResponse({
      request: new Request("http://localhost/api/chat"),
      provider: new FakeStreamProvider(
        [],
        new AIProviderError({
          code: "timeout",
          message: "timeout",
          provider: "fake-ollama",
        }),
      ),
      providerRequest: buildTextChatProviderRequest({
        systemPrompt: "sys",
        context: [{ role: "user", content: "msg" }],
      }),
      conversationId: "c1",
      requestId: "r1",
      mode: "ollama",
    });
    const unavailableResponse = createTextChatProviderResponse({
      request: new Request("http://localhost/api/chat"),
      provider: new FakeStreamProvider(
        [],
        new AIProviderError({
          code: "unavailable",
          message: "down",
          provider: "fake-ollama",
        }),
      ),
      providerRequest: buildTextChatProviderRequest({
        systemPrompt: "sys",
        context: [{ role: "user", content: "msg" }],
      }),
      conversationId: "c2",
      requestId: "r2",
      mode: "ollama",
    });
    const modelResponse = createTextChatProviderResponse({
      request: new Request("http://localhost/api/chat"),
      provider: new FakeStreamProvider(
        [],
        new AIProviderError({
          code: "model_not_found",
          message: "missing",
          provider: "fake-ollama",
        }),
      ),
      providerRequest: buildTextChatProviderRequest({
        systemPrompt: "sys",
        context: [{ role: "user", content: "msg" }],
      }),
      conversationId: "c3",
      requestId: "r3",
      mode: "ollama",
    });

    await expect(readSseEvents(timeoutResponse)).resolves.toContainEqual({
      type: "error",
      message: "A Hanira demorou mais que o esperado para responder.",
      requestId: "r1",
    });
    await expect(readSseEvents(unavailableResponse)).resolves.toContainEqual({
      type: "error",
      message: "O motor local da Hanira não está disponível no momento.",
      requestId: "r2",
    });
    await expect(readSseEvents(modelResponse)).resolves.toContainEqual({
      type: "error",
      message: "O modelo local da Hanira ainda não está instalado.",
      requestId: "r3",
    });
  });

  it("trata cancelamento externo sem persistir resposta final falsa", async () => {
    const controller = new AbortController();
    controller.abort();
    let cancelledCount = 0;
    let persisted = false;
    const provider = new FakeStreamProvider(
      [],
      new AIProviderError({
        code: "cancelled",
        message: "cancelled",
        provider: "fake-ollama",
      }),
    );

    const response = createTextChatProviderResponse({
      request: new Request("http://localhost/api/chat", {
        signal: controller.signal,
      }),
      provider,
      providerRequest: buildTextChatProviderRequest({
        systemPrompt: "sys",
        context: [{ role: "user", content: "msg" }],
      }),
      conversationId: "c1",
      requestId: "r1",
      mode: "ollama",
      onComplete: async () => {
        persisted = true;
      },
      onCancelled: async () => {
        cancelledCount += 1;
      },
    });

    const events = await readSseEvents(response);
    expect(events).toEqual([
      { type: "start", conversationId: "c1", mode: "ollama", requestId: "r1" },
    ]);
    expect(cancelledCount).toBe(1);
    expect(persisted).toBe(false);
  });

  it("falha quando o stream termina sem finish e nao persiste parcial", async () => {
    const provider = new FakeStreamProvider([
      { type: "start", provider: "fake-ollama", model: "qwen" },
      { type: "text-delta", textDelta: "parcial" },
    ]);
    let persisted = false;

    const response = createTextChatProviderResponse({
      request: new Request("http://localhost/api/chat"),
      provider,
      providerRequest: buildTextChatProviderRequest({
        systemPrompt: "sys",
        context: [{ role: "user", content: "msg" }],
      }),
      conversationId: "c-sem-finish",
      requestId: "r-sem-finish",
      mode: "ollama",
      onComplete: async () => {
        persisted = true;
      },
    });

    const events = await readSseEvents(response);
    expect(events).toEqual([
      {
        type: "start",
        conversationId: "c-sem-finish",
        mode: "ollama",
        requestId: "r-sem-finish",
      },
      { type: "delta", delta: "parcial" },
      {
        type: "error",
        message: "A Hanira encontrou um problema ao gerar a resposta.",
        requestId: "r-sem-finish",
      },
    ]);
    expect(persisted).toBe(false);
  });

  it("evento desconhecido gera error, nao emite done e nao persiste", async () => {
    const provider = new FakeStreamProvider([
      { type: "start", provider: "fake-ollama", model: "qwen" },
      { type: "text-delta", textDelta: "parcial" },
      { type: "mystery" } as unknown as AIStreamEvent,
    ]);
    let persisted = false;

    const response = createTextChatProviderResponse({
      request: new Request("http://localhost/api/chat"),
      provider,
      providerRequest: buildTextChatProviderRequest({
        systemPrompt: "sys",
        context: [{ role: "user", content: "msg" }],
      }),
      conversationId: "c-unknown",
      requestId: "r-unknown",
      mode: "ollama",
      onComplete: async () => {
        persisted = true;
      },
    });

    const events = await readSseEvents(response);
    expect(events).toEqual([
      {
        type: "start",
        conversationId: "c-unknown",
        mode: "ollama",
        requestId: "r-unknown",
      },
      { type: "delta", delta: "parcial" },
      {
        type: "error",
        message: "A Hanira encontrou um problema ao gerar a resposta.",
        requestId: "r-unknown",
      },
    ]);
    expect(events.some((event) => event.type === "done")).toBe(false);
    expect(persisted).toBe(false);
  });

  it("resposta vazia com finish gera error, nao emite done e nao persiste", async () => {
    let persisted = false;

    const response = createTextChatProviderResponse({
      request: new Request("http://localhost/api/chat"),
      provider: new FakeStreamProvider([
        { type: "start", provider: "fake-ollama", model: "qwen" },
        { type: "finish", finishReason: "stop" },
      ]),
      providerRequest: buildTextChatProviderRequest({
        systemPrompt: "sys",
        context: [{ role: "user", content: "msg" }],
      }),
      conversationId: "c-empty",
      requestId: "r-empty",
      mode: "ollama",
      onComplete: async ({ assistantContent }) => {
        if (assistantContent) {
          persisted = true;
        }
      },
    });

    const events = await readSseEvents(response);
    expect(events).toEqual([
      {
        type: "start",
        conversationId: "c-empty",
        mode: "ollama",
        requestId: "r-empty",
      },
      {
        type: "error",
        message: "A Hanira encontrou um problema ao gerar a resposta.",
        requestId: "r-empty",
      },
    ]);
    expect(events.some((event) => event.type === "done")).toBe(false);
    expect(persisted).toBe(false);
  });

  it("finish do provider real com apenas whitespace vira erro do provider, nao invalid_stream_event", async () => {
    let capturedError: unknown;
    const provider = new OllamaProvider({
      fetch: async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(
                new TextEncoder().encode(
                  "{\"message\":{\"content\":\" \\n\\t\"},\"done\":false}\n{\"done\":true,\"done_reason\":\"stop\"}\n",
                ),
              );
              controller.close();
            },
          }),
          {
            headers: { "content-type": "application/x-ndjson" },
          },
        ),
    });

    const response = createTextChatProviderResponse({
      request: new Request("http://localhost/api/chat"),
      provider,
      providerRequest: buildTextChatProviderRequest({
        systemPrompt: "sys",
        context: [{ role: "user", content: "msg" }],
      }),
      conversationId: "c-whitespace",
      requestId: "r-whitespace",
      mode: "ollama",
      onFailed: async (error) => {
        capturedError = error;
      },
    });

    const events = await readSseEvents(response);
    expect(events).toEqual([
      {
        type: "start",
        conversationId: "c-whitespace",
        mode: "ollama",
        requestId: "r-whitespace",
      },
      { type: "delta", delta: " \n\t" },
      {
        type: "error",
        message: "A Hanira encontrou um problema ao gerar a resposta.",
        requestId: "r-whitespace",
      },
    ]);
    expect(capturedError).toMatchObject({
      code: "provider_error",
      metadata: expect.objectContaining({ reason: "empty-content-before-finish" }),
    });
  });

  it("usage antes de finish nao conclui o stream", async () => {
    let persisted = false;

    const response = createTextChatProviderResponse({
      request: new Request("http://localhost/api/chat"),
      provider: new FakeStreamProvider([
        { type: "start", provider: "fake-ollama", model: "qwen" },
        {
          type: "usage",
          usage: { inputUnits: 1, outputUnits: 0, totalUnits: 1 },
        },
        { type: "text-delta", textDelta: "ok" },
        { type: "finish", finishReason: "stop" },
      ]),
      providerRequest: buildTextChatProviderRequest({
        systemPrompt: "sys",
        context: [{ role: "user", content: "msg" }],
      }),
      conversationId: "c-usage",
      requestId: "r-usage",
      mode: "ollama",
      onComplete: async () => {
        persisted = true;
      },
    });

    const events = await readSseEvents(response);
    expect(events).toEqual([
      {
        type: "start",
        conversationId: "c-usage",
        mode: "ollama",
        requestId: "r-usage",
      },
      { type: "delta", delta: "ok" },
      { type: "done", conversationId: "c-usage" },
    ]);
    expect(persisted).toBe(true);
  });

  it("falha de persistencia nao emite done enganoso", async () => {
    const response = createTextChatProviderResponse({
      request: new Request("http://localhost/api/chat"),
      provider: new FakeStreamProvider([
        { type: "start", provider: "fake-ollama", model: "qwen" },
        { type: "text-delta", textDelta: "final" },
        { type: "finish", finishReason: "stop" },
      ]),
      providerRequest: buildTextChatProviderRequest({
        systemPrompt: "sys",
        context: [{ role: "user", content: "msg" }],
      }),
      conversationId: "c-persist-fail",
      requestId: "r-persist-fail",
      mode: "ollama",
      onComplete: async () => {
        throw new Error("db down");
      },
    });

    const events = await readSseEvents(response);
    expect(events).toEqual([
      {
        type: "start",
        conversationId: "c-persist-fail",
        mode: "ollama",
        requestId: "r-persist-fail",
      },
      { type: "delta", delta: "final" },
      {
        type: "error",
        message: "A resposta foi gerada, mas nao pode ser salva. Tente novamente.",
        requestId: "r-persist-fail",
      },
    ]);
    expect(events.some((event) => event.type === "done")).toBe(false);
  });

  it("violacao pos-finish do provider nao persiste e nao emite done", async () => {
    let persisted = false;
    const provider = new OllamaProvider({
      fetch: async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(
                new TextEncoder().encode(
                  "{\"message\":{\"content\":\"ok\"},\"done\":false}\n{\"done\":true,\"done_reason\":\"stop\"}\n{\"message\":{\"content\":\"extra\"},\"done\":false}\n",
                ),
              );
              controller.close();
            },
          }),
          {
            headers: { "content-type": "application/x-ndjson" },
          },
        ),
    });

    const response = createTextChatProviderResponse({
      request: new Request("http://localhost/api/chat"),
      provider,
      providerRequest: buildTextChatProviderRequest({
        systemPrompt: "sys",
        context: [{ role: "user", content: "msg" }],
      }),
      conversationId: "c-post-finish",
      requestId: "r-post-finish",
      mode: "ollama",
      onComplete: async () => {
        persisted = true;
      },
    });

    const events = await readSseEvents(response);
    expect(events).toEqual([
      {
        type: "start",
        conversationId: "c-post-finish",
        mode: "ollama",
        requestId: "r-post-finish",
      },
      { type: "delta", delta: "ok" },
      {
        type: "error",
        message: "A Hanira encontrou um problema ao gerar a resposta.",
        requestId: "r-post-finish",
      },
    ]);
    expect(events.some((event) => event.type === "done")).toBe(false);
    expect(persisted).toBe(false);
  });

  it("mapeia erro de persistencia para mensagem segura", () => {
    expect(toPublicTextChatError(new Error("db down"))).toEqual({
      status: 500,
      type: "TextChatPersistenceError",
      message:
        "A resposta foi gerada, mas nao pode ser salva. Tente novamente.",
    });
  });

  it("mantem a rota ligada ao helper de elegibilidade e compoe runtime Ollama sem OpenAIProvider", () => {
    const source = route("app/api/chat/route.ts");
    expect(source).toContain("shouldUseOllamaTextProvider");
    expect(source).toContain("routeChatCapability");
    expect(source).not.toContain("createDefaultOpenAIProvider");
    expect(source).not.toContain("new OpenAIProvider");
  });

  it("instancia o runtime principal sem singleton global mutavel", () => {
    const source = route("lib/ai/runtime/create-text-chat-runtime.ts");
    expect(source).toContain("new OllamaProvider");
    expect(source).not.toContain("let runtime");
    expect(createTextChatRuntime).toBeTypeOf("function");
  });
});
