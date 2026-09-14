import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  getInstallExperience,
  isIosDevice,
  isStandaloneDisplay,
} from "../lib/pwa/install";

const installExperience = readFileSync(
  new URL("../components/pwa/install-experience.tsx", import.meta.url),
  "utf8",
);

describe("PWA compact install UX", () => {
  it("não renderiza mais o card grande fixo (aside)", () => {
    // O card grande foi removido - não há mais <aside> com banner
    expect(installExperience).not.toContain("<aside");
  });

  it("renderiza botão compacto (size-11)", () => {
    expect(installExperience).toContain("size-11");
  });

  it("possui tooltip 'Instalar Hanira'", () => {
    expect(installExperience).toContain("Instalar Hanira");
  });

  it("usa rounded-full para botão circular discreto", () => {
    expect(installExperience).toContain("rounded-full");
  });

  it("renderiza popover iOS com Compartilhar e Adicionar à Tela de Início", () => {
    expect(installExperience).toContain("Compartilhar");
    expect(installExperience).toContain("Adicionar à Tela de Início");
  });

  it("experience 'none' retorna null (standalone hidden)", () => {
    expect(
      getInstallExperience({
        standalone: true,
        dismissed: false,
        hasNativePrompt: true,
        ios: false,
      }),
    ).toBe("none");
    expect(
      getInstallExperience({
        standalone: false,
        dismissed: true,
        hasNativePrompt: true,
        ios: false,
      }),
    ).toBe("none");
  });

  it("detecta standalone corretamente", () => {
    expect(isStandaloneDisplay({ displayModeStandalone: true })).toBe(true);
    expect(
      isStandaloneDisplay({
        displayModeStandalone: false,
        navigatorStandalone: true,
      }),
    ).toBe(true);
  });

  it("detecta iOS corretamente", () => {
    expect(isIosDevice("Mozilla/5.0 (iPhone)")).toBe(true);
    expect(isIosDevice("Mozilla/5.0 (iPad)")).toBe(true);
  });

  it("native-prompt tem prioridade sobre ios-guidance", () => {
    expect(
      getInstallExperience({
        standalone: false,
        dismissed: false,
        hasNativePrompt: true,
        ios: true,
      }),
    ).toBe("native-prompt");
  });
});
