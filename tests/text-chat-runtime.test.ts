import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AIProviderError } from "../lib/ai/types";
import {
  buildTextChatProviderRequest,
  getOllamaTextProviderEligibility,
  shouldUseOllamaTextProvider,
  streamEvent,
  streamHeaders,
  toPublicTextChatError,
} from "../lib/ai/runtime";
import { chatRequestSchema } from "../lib/validation/chat";

describe("text chat runtime", () => {
  it("serializa SSE no contrato atual", () => {
    expect(streamEvent("delta", { delta: "Oi" })).toBe(
      'data: {"type":"delta","delta":"Oi"}\n\n',
    );
  });

  it("monta o request canonico com system prompt, personalidade e historico", () => {
    expect(
      buildTextChatProviderRequest({
        systemPrompt: "Sys",
        personalization: "Perfil",
        context: [
          { role: "user", content: "Ola" },
          { role: "assistant", content: "Oi" },
        ],
        model: "qwen2.5:latest",
      }),
    ).toEqual({
      model: "qwen2.5:latest",
      messages: [
        { role: "system", text: "Sys\nPerfil" },
        { role: "user", text: "Ola" },
        { role: "assistant", text: "Oi" },
      ],
    });
  });

  it("mantem SSE headers esperados pelo frontend", () => {
    expect(streamHeaders("conv-1", "req-1")).toMatchObject({
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Conversation-Id": "conv-1",
      "X-Request-ID": "req-1",
    });
  });

  it("usa elegibilidade textual simples sem multimodal", () => {
    expect(
      shouldUseOllamaTextProvider({
        ollamaEnabled: true,
        attachmentCount: 0,
        imageAttachmentCount: 0,
      }),
    ).toBe(true);
    expect(
      shouldUseOllamaTextProvider({
        ollamaEnabled: true,
        attachmentCount: 1,
        imageAttachmentCount: 0,
      }),
    ).toBe(false);
  });

  it("mantem conversa nova so com texto como elegivel e detalha as condicoes", () => {
    const providerRequest = buildTextChatProviderRequest({
      systemPrompt: "Sys",
      context: [{ role: "user", content: "Ola" }],
    });

    expect(
      getOllamaTextProviderEligibility({
        ollamaEnabled: true,
        attachmentCount: 0,
        imageAttachmentCount: 0,
        request: providerRequest,
        supportedCapabilities: ["text-generation", "text-streaming"],
      }),
    ).toEqual({
      eligible: true,
      reason: "eligible",
      attachmentCount: 0,
      imageAttachmentCount: 0,
      messageCount: 2,
      roles: ["system", "user"],
      contentFieldTypes: ["string", "string"],
      hasTools: false,
      hasMultimodalInput: false,
      hasMetadata: false,
      hasCapabilities: true,
      conditions: {
        ollamaEnabled: true,
        attachmentCountIsZero: true,
        imageAttachmentCountIsZero: true,
        requiresUnsupportedCapabilityIsFalse: true,
      },
    });
  });

  it("mantem historico textual como elegivel", () => {
    const providerRequest = buildTextChatProviderRequest({
      systemPrompt: "Sys",
      context: [
        { role: "user", content: "Ola" },
        { role: "assistant", content: "Oi" },
        { role: "user", content: "Continue" },
      ],
    });

    expect(
      getOllamaTextProviderEligibility({
        ollamaEnabled: true,
        attachmentCount: 0,
        imageAttachmentCount: 0,
        request: providerRequest,
      }).eligible,
    ).toBe(true);
  });

  it("bloqueia quando attachmentCount indica anexo", () => {
    const providerRequest = buildTextChatProviderRequest({
      systemPrompt: "Sys",
      context: [{ role: "user", content: "Ola" }],
    });

    expect(
      getOllamaTextProviderEligibility({
        ollamaEnabled: true,
        attachmentCount: 1,
        imageAttachmentCount: 0,
        request: providerRequest,
      }),
    ).toMatchObject({
      eligible: false,
      reason: "has_attachments",
      conditions: { attachmentCountIsZero: false },
    });
  });

  it("bloqueia quando imageAttachmentCount indica imagem", () => {
    const providerRequest = buildTextChatProviderRequest({
      systemPrompt: "Sys",
      context: [{ role: "user", content: "Ola" }],
    });

    expect(
      getOllamaTextProviderEligibility({
        ollamaEnabled: true,
        attachmentCount: 1,
        imageAttachmentCount: 1,
        request: providerRequest,
      }),
    ).toMatchObject({
      eligible: false,
      reason: "has_image",
      conditions: {
        attachmentCountIsZero: false,
        imageAttachmentCountIsZero: false,
      },
    });
  });

  it("mantem comportamento esperado para payload invalido", () => {
    const parsed = chatRequestSchema.safeParse({
      message: "",
      attachmentIds: [],
    });

    expect(parsed.success).toBe(false);
  });

  it("normaliza unsupported capability e timeout com mensagens seguras", () => {
    expect(
      toPublicTextChatError(
        new AIProviderError({
          code: "unsupported_capability",
          message: "vision required",
          provider: "ollama",
        }),
      ),
    ).toEqual({
      status: 400,
      type: "LocalAIUnsupportedCapability",
      message: "Nao foi possivel processar esta solicitacao.",
    });

    expect(
      toPublicTextChatError(
        new AIProviderError({
          code: "timeout",
          message: "127.0.0.1 timeout",
          provider: "ollama",
        }),
      ),
    ).toEqual({
      status: 408,
      type: "LocalAITimeout",
      message: "A Hanira demorou mais que o esperado para responder.",
    });
  });

  it("nao instancia providers concretos dentro do runtime", () => {
    const source = readFileSync("lib/ai/runtime/text-chat-runtime.ts", "utf8");
    expect(source).not.toContain("new OpenAIProvider");
    expect(source).not.toContain("new OllamaProvider");
  });
});
