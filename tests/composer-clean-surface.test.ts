import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  new URL("../app/globals.css", import.meta.url),
  "utf8"
);

describe("composer sem sobreposição (hotfix 19.2-M)", () => {
  it("não deixa pseudo-elemento ::before com camada/gradiente sobre o shell do composer", () => {
    expect(css).not.toContain(".chat-composer-shell::before");
  });

  it("não declara pseudo-elemento absoluto que cubra o campo de digitação", () => {
    expect(css).not.toMatch(/chat-composer-shell[\s\S]{0,200}::before/);
  });

  it("textarea do composer permanece limpo, sem sobreposição de camada extra", () => {
    const textareaBlock = css.match(
      /\.nira-composer\s+textarea\s*\{[\s\S]*?\}/
    );
    expect(textareaBlock?.[0]).toBeTruthy();
    expect(textareaBlock?.[0]).toContain("background: transparent;");
    expect(textareaBlock?.[0]).toContain("border: none;");
    expect(textareaBlock?.[0]).toContain("outline: none;");
  });

  it("mantém o placeholder do campo de digitação", () => {
    const composer = readFileSync(
      new URL("../components/chat/chat-composer.tsx", import.meta.url),
      "utf8"
    );
    expect(composer).toContain('placeholder=');
    expect(composer).toContain("Converse com a Nira...");
  });
});
