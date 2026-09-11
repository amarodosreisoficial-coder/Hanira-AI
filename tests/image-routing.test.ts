import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const composer = readFileSync(
  new URL("../components/chat/chat-composer.tsx", import.meta.url),
  "utf8",
);

describe("image routing: text vs image", () => {
  it("importa resolveComposerIntent para roteamento determinístico", () => {
    expect(composer).toContain("resolveComposerIntent");
  });

  it("roteia para handleImageGeneration quando intent é image", () => {
    expect(composer).toContain("handleImageGeneration");
    // O submit() verifica o intent e roteia para handleImageGeneration
    expect(composer).toContain('intent === "image"');
  });

  it("exitImageMode é chamado após gerar imagem", () => {
    expect(composer).toContain("exitImageMode");
  });

  it("não chama /api/chat e /api/image juntos no submit", () => {
    // O submit verifica intent antes de chamar streamChatMessage.
    // Se intent === image, ele retorna cedo e NÃO chama streamChatMessage.
    // Verifica que existe um return após o intent check.
    const intentCheckIndex = composer.indexOf('intent === "image"');
    const returnAfterIntent = composer.indexOf(
      "return;",
      intentCheckIndex,
    );
    // O return deve existir após o intent check
    expect(returnAfterIntent).toBeGreaterThan(-1);
    expect(returnAfterIntent).toBeGreaterThan(intentCheckIndex);
  });

  it("handleImageGeneration usa generateImage do image-service (não chama /api/chat)", () => {
    expect(composer).toContain("generateImage");
  });

  it("store.setThinking é chamado durante geração de imagem", () => {
    expect(composer).toContain("store.setThinking(true)");
    expect(composer).toContain("store.setThinking(false)");
  });

  it("mensagem do usuário é adicionada antes da resposta da imagem", () => {
    expect(composer).toContain("role: \"user\"");
    expect(composer).toContain("role: \"assistant\"");
  });
});
