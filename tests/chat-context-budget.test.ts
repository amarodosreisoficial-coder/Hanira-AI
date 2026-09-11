import { describe, expect, it } from "vitest";
import {
  buildChatContextBudget,
  buildChatContextBudgetResult,
  limitMemoryContext,
  limitMemoryContextResult,
} from "@/lib/ai/runtime/chat-context-budget";

describe("chat context budget", () => {
  it("preserves the newest messages and removes older history first", () => {
    const result = buildChatContextBudget([
      { role: "user", content: "old" },
      { role: "assistant", content: "middle" },
      { role: "user", content: "new" },
    ], 9);
    expect(result).toEqual([
      { role: "assistant", content: "middle" },
      { role: "user", content: "new" },
    ]);
  });

  it("deduplicates and bounds memories", () => {
    expect(limitMemoryContext(["a", "a", "b"])).toEqual(["a", "b"]);
  });

  it("mantem o historico recente mesmo quando uma mensagem antiga excede o restante", () => {
    const result = buildChatContextBudget([
      { role: "user", content: "antiga" },
      { role: "assistant", content: "x".repeat(20) },
      { role: "user", content: "recente" },
    ], 10);

    expect(result).toEqual([{ role: "user", content: "recente" }]);
    expect(result.reduce((total, message) => total + message.content.length, 0)).toBeLessThanOrEqual(10);
  });

  it("ignora memoria grande e continua avaliando memorias menores", () => {
    expect(limitMemoryContext(["x".repeat(4_001), "relevante", "outra"])).toEqual([
      "relevante",
      "outra",
    ]);
  });

  it("não troca um turno recente grande por mensagens antigas menores", () => {
    const result = buildChatContextBudget([
      { role: "user", content: "antiga curta" },
      { role: "assistant", content: "recente longa" },
      { role: "user", content: "agora" },
    ], 10);
    expect(result).toEqual([{ role: "user", content: "agora" }]);
  });

  it("trunca deterministicamente a mensagem mais recente quando ela sozinha excede o orçamento", () => {
    const messages = [{ role: "user" as const, content: "ação útil agora" }];
    const first = buildChatContextBudgetResult(messages, 8);
    const second = buildChatContextBudgetResult(messages, 8);
    expect(first).toEqual(second);
    expect(first.messages).toEqual([{ role: "user", content: "ação úti" }]);
    expect(first.metadata).toMatchObject({
      messagesConsidered: 1,
      messagesIncluded: 1,
      charactersIncluded: 8,
      budgetLimit: 8,
      truncated: true,
    });
  });

  it("retorna metadata vazia sem alegar tokens exatos", () => {
    expect(buildChatContextBudgetResult([]).metadata).toMatchObject({
      messagesConsidered: 0,
      messagesIncluded: 0,
      charactersConsidered: 0,
      charactersIncluded: 0,
      truncated: false,
    });
  });

  it("aplica uma única política final de quantidade e caracteres às memórias", () => {
    const result = limitMemoryContextResult([
      ...Array.from({ length: 9 }, (_, index) => `memoria-${index}`),
      "memoria-0",
    ]);
    expect(result.memories).toHaveLength(8);
    expect(result.metadata).toMatchObject({ memoriesConsidered: 10, memoriesIncluded: 8, truncated: true });
    expect(result.metadata.charactersIncluded).toBeLessThanOrEqual(result.metadata.budgetLimit);
  });
});
