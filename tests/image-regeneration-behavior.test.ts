import { describe, expect, it } from "vitest";
import { createMessageStore } from "./helpers/image-test-helpers";

describe("regenerate: no duplicate messages", () => {
  it("first generation adds user and assistant messages", () => {
    const store = createMessageStore();
    store.addMessage({ id: "user-1", role: "user", content: "gere uma imagem de um gato" });
    store.addMessage({ id: "assistant-1", role: "assistant", content: "", pending: true, imageGeneration: { status: "generating", prompt: "gere uma imagem de um gato" } });
    expect(store.getMessages()).toHaveLength(2);
    expect(store.getMessageIds()).toEqual(["user-1", "assistant-1"]);
  });

  it("regeneration reuses existing assistant message", () => {
    const store = createMessageStore();
    store.addMessage({ id: "user-1", role: "user", content: "gere uma imagem de um gato" });
    store.addMessage({ id: "assistant-1", role: "assistant", content: "", pending: true, imageGeneration: { status: "generating", prompt: "gere uma imagem de um gato" } });
    store.updateImageGeneration("assistant-1", { status: "generating", prompt: "gere uma imagem de um gato" });
    expect(store.getMessages()).toHaveLength(2);
    expect(store.getMessageIds()).toEqual(["user-1", "assistant-1"]);
    store.updateImageGeneration("assistant-1", { status: "ready", prompt: "gere uma imagem de um gato" });
    const assistant = store.getMessages().find((m) => m.id === "assistant-1");
    expect(assistant?.imageGeneration?.status).toBe("ready");
    expect(assistant?.pending).toBe(false);
  });

  it("regeneration after error reuses same assistant id", () => {
    const store = createMessageStore();
    store.addMessage({ id: "user-1", role: "user", content: "gere uma imagem de um gato" });
    store.addMessage({ id: "assistant-1", role: "assistant", content: "", pending: true, imageGeneration: { status: "generating", prompt: "gere uma imagem de um gato" } });
    store.updateImageGeneration("assistant-1", { status: "error", prompt: "gere uma imagem de um gato", errorMessage: "Não foi possível criar a imagem agora." });
    expect(store.getMessages()).toHaveLength(2);
    store.updateImageGeneration("assistant-1", { status: "generating", prompt: "gere uma imagem de um gato" });
    expect(store.getMessages()).toHaveLength(2);
    expect(store.getMessageIds()).toEqual(["user-1", "assistant-1"]);
  });
});
