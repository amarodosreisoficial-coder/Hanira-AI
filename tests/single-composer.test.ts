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

  it("possui botão 'Criar imagem' discreto", () => {
    expect(composer).toContain("Criar imagem");
  });

  it("alterna com setComposerMode", () => {
    expect(composer).toContain("setComposerMode");
  });
});
