import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../lib/ai/runtime/create-text-chat-runtime", () => ({
  createTextChatRuntime: () => ({
    provider: {
      providerId: "ollama",
      capabilities: { supported: ["text-generation", "text-streaming"] },
    },
    model: "qwen2.5:7b",
    baseUrl: "http://localhost:11434",
    connectTimeoutMs: 30_000,
    firstTokenTimeoutMs: 90_000,
    idleTimeoutMs: 30_000,
    requestTimeoutMs: 0,
    providerId: "ollama",
  }),
}));
vi.mock("../lib/ai/capabilities", () => ({
  getServerAICapabilities: () => ({
    text: {
      enabled: true,
      status: "available",
      provider: "ollama",
      model: "qwen2.5:7b",
    },
    vision: { enabled: false, status: "disabled", provider: "openai" },
    transcription: { enabled: false, status: "disabled", provider: "openai" },
    speech: { enabled: false, status: "disabled", provider: "openai" },
    attachments: { enabled: true, status: "available", provider: "supabase" },
  }),
}));
vi.mock("../services/document-extraction", () => ({
  extractDocumentFromAttachment: vi.fn(async () => ({
    text: "Conteudo do documento",
    characterCount: 21,
    truncated: false,
    warnings: [],
  })),
  buildDocumentContextBlock: vi.fn(
    () => "<documento>\nConteudo do documento\n</documento>",
  ),
}));

import { routeChatCapability } from "../lib/ai/runtime/capability-router";

describe("roteamento de documentos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mantem documentos no fluxo textual do Ollama com contexto delimitado", async () => {
    const routed = await routeChatCapability({
      systemPrompt: "Sistema",
      context: [],
      userMessage: "Resuma",
      attachments: [
        {
          id: "1",
          type: "document",
          storageBucket: "chat-documents",
          storagePath: "u/c/doc.pdf",
          originalName: "doc.pdf",
          mimeType: "application/pdf",
          sizeBytes: 100,
          userId: "u",
          conversationId: "c",
          messageId: null,
          metadata: {},
        },
      ],
    });

    expect(routed.capability).toBe("text");
    expect(routed.providerId).toBe("ollama");
    expect(routed.providerRequest.messages.at(-1)).toMatchObject({
      role: "user",
      text: expect.stringContaining("<documento>"),
    });
  });
});
