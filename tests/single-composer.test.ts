import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("single composer textarea", () => {
  const composer = readFileSync(
    new URL("../components/chat/chat-composer.tsx", import.meta.url),
    "utf8",
  );

  it("importa ImageComposerOptions (controles compactos integrados)", () => {
    expect(composer).toContain("ImageComposerOptions");
  });

  it("não importa mais NiraImageComposer como formulário separado", () => {
    // O import direto do NiraImageComposer foi removido.
    // A string 'import { NiraImageComposer }' não deve existir mais.
    expect(composer).not.toMatch(/import\s*\{[^}]*NiraImageComposer/);
  });

  it("renderiza ImageComposerOptions inline quando em modo imagem", () => {
    expect(composer).toContain("<ImageComposerOptions");
  });

  it("possui estado composerMode para alternar entre text e image", () => {
    expect(composer).toContain("composerMode");
    expect(composer).toContain('"image"');
    expect(composer).toContain('"text"');
  });

  it("remove botão explícito 'Criar imagem' (geração por intenção de texto)", () => {
    // Pacote 18.3.5: o botão 'Criar imagem' saiu da barra; a Nira entende o
    // pedido de imagem pelo texto via resolveComposerIntent (intenção de alto
    // confiança), sem ação solta na barra.
    expect(composer).not.toContain("Criar imagem");
    expect(composer).toContain("resolveComposerIntent");
  });

  it("alterna com setComposerMode", () => {
    expect(composer).toContain("setComposerMode");
  });
  it("possui placeholder dinâmico para modo imagem", () => {
    expect(composer).toContain("Descreva a imagem que você quer criar...");
  });

  it("mantém placeholder padrão para modo texto", () => {
    expect(composer).toContain("Converse com a Nira...");
  });

  it("usa isImageMode para alternar placeholder", () => {
    expect(composer).toContain("isImageMode");
  });
});
