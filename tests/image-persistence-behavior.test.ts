import { describe, expect, it } from "vitest";
import { sanitizeForPersistence } from "./helpers/image-test-helpers";

describe("demo persistence: no blank assistant messages", () => {
  it("removes imageGeneration from all messages", () => {
    const messages = [
      { id: "user-1", role: "user" as const, content: "gere uma imagem", imageGeneration: { status: "ready" as const, prompt: "test" } },
      { id: "assistant-1", role: "assistant" as const, content: "Aqui está!", imageGeneration: { status: "ready" as const, prompt: "test" } },
    ];
    const sanitized = sanitizeForPersistence(messages);
    expect(sanitized).toHaveLength(2);
    const serialized = JSON.stringify(sanitized);
    expect(serialized).not.toContain("imageGeneration");
  });

  it("filters out assistant messages with empty content", () => {
    const messages = [
      { id: "user-1", role: "user" as const, content: "gere uma imagem de um gato" },
      { id: "assistant-1", role: "assistant" as const, content: "", imageGeneration: { status: "ready" as const, prompt: "gere uma imagem de um gato" } },
    ];
    const sanitized = sanitizeForPersistence(messages);
    expect(sanitized).toHaveLength(1);
    expect(sanitized[0].id).toBe("user-1");
    expect(sanitized[0].role).toBe("user");
  });

  it("keeps assistant messages with actual content", () => {
    const messages = [
      { id: "user-1", role: "user" as const, content: "Olá" },
      { id: "assistant-1", role: "assistant" as const, content: "Olá! Como posso ajudar?" },
    ];
    const sanitized = sanitizeForPersistence(messages);
    expect(sanitized).toHaveLength(2);
    expect(sanitized[1].content).toBe("Olá! Como posso ajudar?");
  });

  it("never persists data:image/ content", () => {
    const messages = [
      { id: "user-1", role: "user" as const, content: "gere uma imagem" },
      { id: "assistant-1", role: "assistant" as const, content: "", imageGeneration: { status: "ready" as const, prompt: "test", result: { dataUrl: "data:image/png;base64,ABC123..." } } },
    ];
    const sanitized = sanitizeForPersistence(messages);
    const serialized = JSON.stringify(sanitized);
    expect(serialized).not.toContain("data:image/");
    expect(serialized).not.toContain("base64");
  });

  it("handles mixed conversation with text and image messages", () => {
    const messages = [
      { id: "user-1", role: "user" as const, content: "Olá" },
      { id: "assistant-1", role: "assistant" as const, content: "Olá!" },
      { id: "user-2", role: "user" as const, content: "gere uma imagem" },
      { id: "assistant-2", role: "assistant" as const, content: "", imageGeneration: { status: "ready" as const, prompt: "test" } },
    ];
    const sanitized = sanitizeForPersistence(messages);
    expect(sanitized).toHaveLength(3);
    expect(sanitized.map((m) => m.id)).toEqual(["user-1", "assistant-1", "user-2"]);
  });
});
