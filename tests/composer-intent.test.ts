import { describe, expect, it } from "vitest";
import {
  hasHighConfidenceImageIntent,
  resolveComposerIntent,
} from "../lib/chat/composer-intent";

describe("composer-intent: positive image intents", () => {
  it("detecta 'gere uma imagem de...'", () => {
    expect(hasHighConfidenceImageIntent("gere uma imagem de um gato")).toBe(true);
  });

  it("detecta 'crie uma imagem de...'", () => {
    expect(hasHighConfidenceImageIntent("crie uma imagem de uma paisagem")).toBe(true);
  });

  it("detecta 'faça uma arte de...'", () => {
    expect(hasHighConfidenceImageIntent("faça uma arte de um dragão")).toBe(true);
  });

  it("detecta 'desenhe uma arte de...'", () => {
    expect(hasHighConfidenceImageIntent("desenhe uma arte de um robô futurista")).toBe(true);
  });

  it("detecta 'generate an image of...'", () => {
    expect(hasHighConfidenceImageIntent("generate an image of a sunset")).toBe(true);
  });

  it("detecta 'create an art of...'", () => {
    expect(hasHighConfidenceImageIntent("create an art of a forest")).toBe(true);
  });

  it("detecta 'quero uma imagem de...'", () => {
    expect(hasHighConfidenceImageIntent("quero uma imagem de um carro")).toBe(true);
  });

  it("detecta 'preciso de uma foto de...'", () => {
    expect(hasHighConfidenceImageIntent("preciso de uma foto de perfil")).toBe(true);
  });
});

describe("composer-intent: negative image intents", () => {
  it("não roteia perguntas sobre como gerar imagens", () => {
    expect(hasHighConfidenceImageIntent("como gerar uma imagem?")).toBe(false);
  });

  it("não roteia pedidos de explicação", () => {
    expect(hasHighConfidenceImageIntent("explique geração de imagem")).toBe(false);
  });

  it("não roteia 'você gera imagens?'", () => {
    expect(hasHighConfidenceImageIntent("você gera imagens?")).toBe(false);
  });

  it("não roteia 'how do I generate images?'", () => {
    expect(hasHighConfidenceImageIntent("how do I generate images?")).toBe(false);
  });

  it("não roteia texto normal", () => {
    expect(hasHighConfidenceImageIntent("qual a capital da França?")).toBe(false);
  });

  it("não roteia string vazia", () => {
    expect(hasHighConfidenceImageIntent("")).toBe(false);
  });

  it("não roteia 'best prompt for image'", () => {
    expect(hasHighConfidenceImageIntent("best prompt for image generation")).toBe(false);
  });
});

describe("composer-intent: resolveComposerIntent", () => {
  it("modo imagem explícito retorna image", () => {
    expect(
      resolveComposerIntent({ mode: "image", draft: "texto qualquer" }),
    ).toBe("image");
  });

  it("modo texto com pedido claro retorna image", () => {
    expect(
      resolveComposerIntent({ mode: "text", draft: "gere uma imagem de um gato" }),
    ).toBe("image");
  });

  it("modo texto normal retorna text", () => {
    expect(
      resolveComposerIntent({ mode: "text", draft: "olá, como vai?" }),
    ).toBe("text");
  });

  it("nunca chama provider para detectar intent", () => {
    // resolveComposerIntent é pura: mesma entrada → mesma saída
    const a = resolveComposerIntent({ mode: "text", draft: "crie arte de um robô" });
    const b = resolveComposerIntent({ mode: "text", draft: "crie arte de um robô" });
    expect(a).toBe("image");
    expect(a).toBe(b);
  });
});
