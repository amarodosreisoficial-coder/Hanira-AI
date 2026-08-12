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
});
