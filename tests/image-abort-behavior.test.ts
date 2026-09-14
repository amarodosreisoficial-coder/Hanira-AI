import { describe, expect, it } from "vitest";
import { createMessageStore } from "./helpers/image-test-helpers";

describe("abort: no stuck generating state", () => {
  it("abort sets error state and clears pending", () => {
    const store = createMessageStore();
    store.addMessage({ id: "assistant-1", role: "assistant", content: "", pending: true, imageGeneration: { status: "generating", prompt: "gere uma imagem de um gato" } });
    store.updateImageGeneration("assistant-1", { status: "error", prompt: "gere uma imagem de um gato", errorMessage: "Geração interrompida." });
    const assistant = store.getMessages().find((m) => m.id === "assistant-1");
    expect(assistant?.pending).toBe(false);
    expect(assistant?.imageGeneration?.status).toBe("error");
    expect(assistant?.imageGeneration?.errorMessage).toBe("Geração interrompida.");
  });

  it("message is never left in generating state after abort", () => {
    const store = createMessageStore();
    store.addMessage({ id: "assistant-1", role: "assistant", content: "", pending: true, imageGeneration: { status: "generating", prompt: "test" } });
    store.updateImageGeneration("assistant-1", { status: "error", prompt: "test", errorMessage: "Geração interrompida." });
    const assistant = store.getMessages().find((m) => m.id === "assistant-1");
    expect(assistant?.imageGeneration?.status).not.toBe("generating");
  });
});
