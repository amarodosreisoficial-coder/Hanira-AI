import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  runTextChatRuntime,
  serializeTextChatSSEEvent,
  type TextRuntimeProvider,
  type TextRuntimeRequest,
  type TextRuntimeStreamEvent,
} from "../lib/ai/runtime";

function createRequest(): TextRuntimeRequest {
  return {
    conversationId: "conv-1",
    messages: [{ role: "user", content: "Olá" }],
    metadata: { requestId: "req-1" },
    requiredCapabilities: ["chat"],
  };
}

function createProvider(events: TextRuntimeStreamEvent[]): TextRuntimeProvider {
  return {
    async *stream() {
      for (const event of events) {
        yield event;
      }
    },
  };
}

function createEmitter() {
  const events: string[] = [];
  return {
    events,
    adapter: {
      emit(event: string) {
        events.push(event);
      },
    },
  };
}

describe("text chat runtime", () => {
  it("serializa SSE no contrato atual", () => {
    expect(
      serializeTextChatSSEEvent({ type: "delta", delta: "Oi" }),
    ).toBe('data: {"type":"delta","delta":"Oi"}\n\n');
  });

  it("envia o request estrutural intacto ao provider", async () => {
    const request = createRequest();
    const stream = createProvider([{ type: "finish" }]);
    const spy = vi.spyOn(stream, "stream");

    await runTextChatRuntime({
      provider: stream,
      request,
      conversationId: "conv-1",
    });

    expect(spy).toHaveBeenCalledWith(request, { signal: undefined });
  });

  it("emite um delta", async () => {
    const emitter = createEmitter();
    await runTextChatRuntime({
      provider: createProvider([
        { type: "start" },
        { type: "text-delta", text: "Olá" },
        { type: "finish" },
      ]),
      request: createRequest(),
      conversationId: "conv-1",
      sse: emitter.adapter,
    });

    expect(emitter.events).toContain(
      'data: {"type":"delta","delta":"Olá"}\n\n',
    );
  });

  it("emite múltiplos deltas e reconstrói a resposta final", async () => {
    const emitter = createEmitter();
    const result = await runTextChatRuntime({
      provider: createProvider([
        { type: "start" },
        { type: "text-delta", text: "Olá" },
        { type: "text-delta", text: ", mundo" },
        { type: "finish", finishReason: "stop" },
      ]),
      request: createRequest(),
      conversationId: "conv-1",
      sse: emitter.adapter,
    });

    expect(result).toMatchObject({
      text: "Olá, mundo",
      finishReason: "stop",
      completed: true,
      cancelled: false,
    });
    expect(
      emitter.events.filter((event) => event.includes('"type":"done"')),
    ).toHaveLength(1);
  });

  it("preserva usage internamente", async () => {
    const result = await runTextChatRuntime({
      provider: createProvider([
        { type: "usage", usage: { inputTokens: 10 } },
        { type: "text-delta", text: "Olá" },
        { type: "finish", usage: { outputTokens: 4, totalTokens: 14 } },
      ]),
      request: createRequest(),
      conversationId: "conv-1",
    });

    expect(result.usage).toEqual({
      inputTokens: 10,
      outputTokens: 4,
      totalTokens: 14,
    });
  });

  it("ignora start de forma compatível", async () => {
    const emitter = createEmitter();
    const result = await runTextChatRuntime({
      provider: createProvider([{ type: "start" }, { type: "finish" }]),
      request: createRequest(),
      conversationId: "conv-1",
      requestId: "req-1",
      sse: emitter.adapter,
    });

    expect(result.completed).toBe(true);
    expect(emitter.events[0]).toBe(
      'data: {"type":"start","conversationId":"conv-1","requestId":"req-1"}\n\n',
    );
  });

  it("interrompe o fluxo em error event sem emitir finish depois", async () => {
    const emitter = createEmitter();

    await expect(
      runTextChatRuntime({
        provider: createProvider([
          { type: "text-delta", text: "parcial" },
          { type: "error", error: Object.assign(new Error("down"), { code: "provider_error" }) },
          { type: "finish" },
        ]),
        request: createRequest(),
        conversationId: "conv-1",
        sse: emitter.adapter,
      }),
    ).rejects.toMatchObject({
      code: "provider_error",
      message: "A Hanira encontrou um problema ao gerar a resposta.",
    });

    expect(
      emitter.events.some((event) => event.includes('"type":"done"')),
    ).toBe(false);
  });

  it("interrompe quando o provider lança exceção", async () => {
    const emitter = createEmitter();
    const provider: TextRuntimeProvider = {
      async *stream() {
        yield { type: "text-delta", text: "parcial" };
        throw Object.assign(new Error("dial tcp 127.0.0.1"), {
          code: "unavailable",
        });
      },
    };

    await expect(
      runTextChatRuntime({
        provider,
        request: createRequest(),
        conversationId: "conv-1",
        sse: emitter.adapter,
      }),
    ).rejects.toMatchObject({
      code: "unavailable",
      message: "O motor local da Hanira não está disponível no momento.",
    });
    expect(
      emitter.events.some((event) => event.includes("127.0.0.1")),
    ).toBe(false);
  });

  it("trata cancelamento externo sem erro genérico", async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await runTextChatRuntime({
      provider: createProvider([{ type: "text-delta", text: "nunca" }]),
      request: createRequest(),
      conversationId: "conv-1",
      signal: controller.signal,
    });

    expect(result).toMatchObject({
      text: "",
      completed: false,
      cancelled: true,
    });
  });

  it("normaliza timeout", async () => {
    await expect(
      runTextChatRuntime({
        provider: createProvider([
          { type: "error", error: Object.assign(new Error("timeout"), { code: "timeout" }) },
        ]),
        request: createRequest(),
        conversationId: "conv-1",
      }),
    ).rejects.toMatchObject({
      code: "timeout",
      message: "A Hanira demorou mais que o esperado para responder.",
    });
  });

  it("normaliza modelo ausente", async () => {
    await expect(
      runTextChatRuntime({
        provider: createProvider([
          {
            type: "error",
            error: Object.assign(new Error("missing"), {
              code: "model_not_found",
            }),
          },
        ]),
        request: createRequest(),
        conversationId: "conv-1",
      }),
    ).rejects.toMatchObject({
      code: "model_not_found",
      message: "O modelo local da Hanira ainda não está instalado.",
    });
  });

  it("não instancia OpenAIProvider nem OllamaProvider", () => {
    const source = readFileSync(
      "lib/ai/runtime/text-chat-runtime.ts",
      "utf8",
    );
    expect(source).not.toContain("new OpenAIProvider");
    expect(source).not.toContain("new OllamaProvider");
  });

  it("não referencia a rota de chat", () => {
    const source = readFileSync(
      "lib/ai/runtime/text-chat-runtime.ts",
      "utf8",
    );
    expect(source).not.toContain("app/api/chat/route");
  });
});
