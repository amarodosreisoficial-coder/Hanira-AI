import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { buildSystemPrompt } from "../lib/ai/runtime/system-prompt";

describe("system prompt seguro", () => {
  it("monta blocos em ordem deterministica sem duplicacao", () => {
    const prompt = buildSystemPrompt({
      baseInstructions: "Base fixa",
      personalityInstructions: "Seja objetiva.",
      projectLabel: "Hanira App",
      relevantMemories: ["Prefere respostas curtas.", "Usa Unicode: ação"],
    });

    expect(prompt).toContain("### Regras da aplicacao\nBase fixa");
    expect(prompt).toContain("### Contexto do projeto\nProjeto ativo: Hanira App.");
    expect(prompt).toContain("### Personalizacao validada\nSeja objetiva.");
    expect(prompt).toContain(
      "### Memorias relevantes\n- Prefere respostas curtas.\n- Usa Unicode: ação",
    );
    expect(prompt.indexOf("Regras da aplicacao")).toBeLessThan(
      prompt.indexOf("Contexto do projeto"),
    );
    expect(prompt).not.toContain("undefined");
    expect(prompt).not.toContain("null");
  });

  it("omite blocos vazios", () => {
    const prompt = buildSystemPrompt({
      baseInstructions: "Base fixa",
      projectLabel: "Hanira App",
      relevantMemories: ["   "],
    });

    expect(prompt).toContain("Base fixa");
    expect(prompt).not.toContain("Personalizacao validada");
    expect(prompt).not.toContain("Memorias relevantes");
  });
});
