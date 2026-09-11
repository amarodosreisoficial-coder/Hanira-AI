import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const chatMessage = readFileSync(
  new URL("../components/chat/chat-message.tsx", import.meta.url),
  "utf8",
);
const generatedImageResponse = readFileSync(
  new URL("../components/chat/generated-image-response.tsx", import.meta.url),
  "utf8",
);
const chatStore = readFileSync(
  new URL("../lib/stores/chat-store.ts", import.meta.url),
  "utf8",
);

describe("image result in conversation", () => {
  it("ChatMessage renderiza GeneratedImageResponse quando há imageGeneration", () => {
    expect(chatMessage).toContain("GeneratedImageResponse");
    expect(chatMessage).toContain("message.imageGeneration");
  });

  it("GeneratedImageResponse mostra estado 'Gerando imagem...'", () => {
    expect(generatedImageResponse).toContain("Gerando imagem...");
  });

  it("GeneratedImageResponse possui botão de download", () => {
    expect(generatedImageResponse).toContain("Baixar imagem");
  });

  it("GeneratedImageResponse possui botão de regenerar", () => {
    expect(generatedImageResponse).toContain("Regenerar imagem");
  });

  it("GeneratedImageResponse dispara evento hanira:regenerate-image", () => {
    expect(generatedImageResponse).toContain("hanira:regenerate-image");
  });

  it("GeneratedImageResponse possui lightbox ao ampliar", () => {
    expect(generatedImageResponse).toContain("ImageLightbox");
  });

  it("GeneratedImageResponse mostra erro quando status é error", () => {
    expect(generatedImageResponse).toContain('status === "error"');
  });

  it("store possui updateImageGeneration", () => {
    expect(chatStore).toContain("updateImageGeneration");
  });
});
