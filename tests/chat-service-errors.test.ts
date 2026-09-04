import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ChatRequestError,
  streamChatMessage,
} from "../services/chat-service";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("chat service public error contract", () => {
  it("preserva o código público em resposta HTTP sem sucesso", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            error: "A Nira está temporariamente sem capacidade gratuita disponível.",
            code: "capacity_unavailable",
          },
          { status: 503 },
        ),
      ),
    );

    await expect(
      streamChatMessage(
        { message: "Olá", requestId: crypto.randomUUID() },
        { onDelta: vi.fn() },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({
      name: "ChatRequestError",
      code: "capacity_unavailable",
      status: 503,
    } satisfies Partial<ChatRequestError>);
  });

  it("entrega erro estruturado recebido por streaming", async () => {
    const body = `data: ${JSON.stringify({
      type: "error",
      code: "timeout",
      message: "Mensagem pública segura",
    })}\n\n`;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(body, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        }),
      ),
    );
    const onError = vi.fn();

    await streamChatMessage(
      { message: "Olá", requestId: crypto.randomUUID() },
      { onDelta: vi.fn(), onError },
      new AbortController().signal,
    );

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: "timeout", message: "Mensagem pública segura" }),
    );
  });
});
