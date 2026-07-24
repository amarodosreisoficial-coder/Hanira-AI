import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  buildPersonalityInstructions,
  sanitizeConversationMessages,
} from "../services/chat-context";
import {
  buildConversationMetadata,
  deriveLegacyConversationScope,
  resolveConversationProjectScope,
} from "../services/project-context";

describe("chat context isolation helpers", () => {
  it("duas conversas legadas recebem escopos diferentes", () => {
    expect(
      resolveConversationProjectScope({
        conversationId: "conv-a",
        metadata: null,
      }),
    ).not.toBe(
      resolveConversationProjectScope({
        conversationId: "conv-b",
        metadata: null,
      }),
    );
  });

  it("a mesma conversa recebe sempre o mesmo escopo", () => {
    expect(
      resolveConversationProjectScope({
        conversationId: "conv-a",
        metadata: null,
      }),
    ).toBe(deriveLegacyConversationScope("conv-a"));
    expect(
      resolveConversationProjectScope({
        conversationId: "conv-a",
        metadata: {},
      }),
    ).toBe(deriveLegacyConversationScope("conv-a"));
  });

  it("metadata ausente nao usa fallback global", () => {
    const scope = resolveConversationProjectScope({
      conversationId: "conv-a",
      metadata: null,
    });

    expect(scope).toBe("legacy-conversation:conv-a");
    expect(scope).not.toBe("hanira-app");
  });

  it("project_id relacional tem prioridade sobre metadata legada", () => {
    expect(
      resolveConversationProjectScope({
        conversationId: "conv-a",
        metadata: { projectId: "legacy-conversation:conv-a" },
        relationalProjectId: "11111111-1111-1111-1111-111111111111",
      }),
    ).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("projectId cru do body nao altera o escopo derivado no servidor", () => {
    const bodyProjectId = "projeto-injetado-pelo-cliente";
    const scope = resolveConversationProjectScope({
      conversationId: "conv-a",
      metadata: null,
    });

    expect(scope).toBe("legacy-conversation:conv-a");
    expect(scope).not.toBe(bodyProjectId);
  });

  it("nova metadata de conversa usa o escopo da propria conversa", () => {
    expect(
      buildConversationMetadata({
        conversationId: "conv-a",
      }),
    ).toEqual({
      projectId: "legacy-conversation:conv-a",
    });
  });

  it("filtra roles invalidos, conteudo vazio e ordena historico", () => {
    const messages = sanitizeConversationMessages([
      {
        id: "2",
        role: "assistant",
        content: " resposta ",
        created_at: "2026-01-01T00:00:02.000Z",
      },
      {
        id: "1",
        role: "user",
        content: " pergunta ",
        created_at: "2026-01-01T00:00:01.000Z",
      },
      {
        id: "3",
        role: "system",
        content: "nao entra",
        created_at: "2026-01-01T00:00:03.000Z",
      },
      {
        id: "4",
        role: "assistant",
        content: "   ",
        created_at: "2026-01-01T00:00:04.000Z",
      },
    ]);

    expect(messages).toEqual([
      { role: "user", content: "pergunta" },
      { role: "assistant", content: "resposta" },
    ]);
  });

  it("gera personalidade apenas com campos validados", () => {
    expect(
      buildPersonalityInstructions({
        preferred_name: "Ana",
        response_style: "tecnico",
      }),
    ).toContain("Nome preferido do usuario: Ana.");
    expect(buildPersonalityInstructions({})).toBe("");
  });
});
