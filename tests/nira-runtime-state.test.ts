import { describe, expect, it } from "vitest";
import {
  resolveNiraRuntimeState,
  niraRuntimeBadge,
} from "../lib/chat/runtime-state";

// Pacote 16.4 — matriz de runtime-aware UI.
// A UI nunca adivinha o runtime por texto estatico e nunca mente sobre o
// estado: desconhecido nao exibe badge; cloud nunca mostra "Nira Local".

describe("resolveNiraRuntimeState", () => {
  it("evento start do modo demo resolve demo", () => {
    expect(resolveNiraRuntimeState({ mode: "demo" })).toBe("demo");
  });

  it("provider groq / perfil nira-cloud-free resolve cloud-free", () => {
    expect(resolveNiraRuntimeState({ providerId: "groq" })).toBe("cloud-free");
    expect(resolveNiraRuntimeState({ niraProfileId: "nira-cloud-free" })).toBe(
      "cloud-free",
    );
    expect(
      resolveNiraRuntimeState({ mode: "groq", niraProfileId: "nira-cloud-free" }),
    ).toBe("cloud-free");
  });

  it("provider ollama resolve local", () => {
    expect(resolveNiraRuntimeState({ providerId: "ollama" })).toBe("local");
  });

  it("perfil tem precedencia sobre o providerId", () => {
    expect(
      resolveNiraRuntimeState({
        providerId: "ollama",
        niraProfileId: "nira-cloud-free",
      }),
    ).toBe("cloud-free");
  });

  it("evidencia ausente ou desconhecida nao inventa estado", () => {
    expect(resolveNiraRuntimeState({})).toBe("unknown");
    expect(resolveNiraRuntimeState({ mode: "outro" })).toBe("unknown");
    expect(resolveNiraRuntimeState({ providerId: "openai" })).toBe("unknown");
  });
});

describe("niraRuntimeBadge", () => {
  it("cloud-free NUNCA mostra 'Nira Local'", () => {
    const badge = niraRuntimeBadge("cloud-free");
    expect(badge.label).toBe("Nira Online");
    expect(badge.label).not.toContain("Local");
  });

  it("local mostra 'Nira Local'", () => {
    expect(niraRuntimeBadge("local").label).toBe("Nira Local");
  });

  it("demo mostra 'Modo demonstração'", () => {
    expect(niraRuntimeBadge("demo").label).toBe("Modo demonstração");
  });

  it("unavailable mostra estado temporario claro", () => {
    expect(niraRuntimeBadge("unavailable").label).toBe("Nira indisponível");
  });

  it("unknown nao exibe badge enganoso", () => {
    expect(niraRuntimeBadge("unknown").label).toBeNull();
  });

  it("nenhum rotulo expõe provider ou modelo", () => {
    for (const state of ["demo", "cloud-free", "local", "unavailable"] as const) {
      const label = niraRuntimeBadge(state).label ?? "";
      expect(label.toLowerCase()).not.toContain("groq");
      expect(label.toLowerCase()).not.toContain("gpt-oss");
      expect(label.toLowerCase()).not.toContain("ollama");
      expect(label.toLowerCase()).not.toContain("llama");
    }
  });
});
