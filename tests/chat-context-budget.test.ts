import { describe, expect, it } from "vitest";
import { buildChatContextBudget, limitMemoryContext } from "@/lib/ai/runtime/chat-context-budget";

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
});
