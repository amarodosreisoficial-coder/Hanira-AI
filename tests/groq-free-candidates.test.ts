import { describe, expect, it } from "vitest";
import {
  DEPRECATED_GROQ_MODELS,
  GROQ_FREE_MODEL_CATALOG,
  GROQ_FREE_SECONDARY_CANDIDATE_ID,
  PREVIEW_GROQ_MODELS,
  assertGroqModelNotDeprecated,
  buildGroqSecondaryFreeCandidate,
  isDeprecatedGroqModel,
  isPreviewGroqModel,
} from "../lib/ai/capacity/groq-free-candidates";
import { ModelRouterError } from "../lib/ai/router/errors";

describe("Catalogo conhecido de modelos free da Groq (16.6)", () => {
  it("candidato secundario free DE PRODUCAO: gpt-oss-120b, id/prioridade/lifecycle corretos", () => {
    const candidate = buildGroqSecondaryFreeCandidate();
    expect(candidate.id).toBe(GROQ_FREE_SECONDARY_CANDIDATE_ID);
    expect(candidate.id).toBe("nira-cloud-free-secondary-1");
    expect(candidate.provider).toBe("groq");
    expect(candidate.model).toBe("openai/gpt-oss-120b");
    expect(candidate.costClass).toBe("free");
    expect(candidate.lifecycle).toBe("production");
    expect(candidate.priority).toBe(2);
    expect(candidate.enabled).toBe(true);
    expect(candidate.capabilities).toEqual(["text"]);
  });

  it("catalogo representa lifecycle de producao e preview (preview NUNCA e producao)", () => {
    const models = GROQ_FREE_MODEL_CATALOG.map((entry) => entry.model);
    expect(models).toContain("openai/gpt-oss-20b");
    expect(models).toContain("openai/gpt-oss-120b");
    for (const preview of PREVIEW_GROQ_MODELS) {
      expect(models).toContain(preview);
    }
    const byModel = new Map(
      GROQ_FREE_MODEL_CATALOG.map((entry) => [entry.model, entry.lifecycle]),
    );
    expect(byModel.get("openai/gpt-oss-20b")).toBe("production");
    expect(byModel.get("openai/gpt-oss-120b")).toBe("production");
    for (const preview of PREVIEW_GROQ_MODELS) {
      expect(byModel.get(preview)).toBe("preview");
    }
    // Modelos aposentados NUNCA estao no catalogo elegivel.
    for (const deprecated of DEPRECATED_GROQ_MODELS) {
      expect(models).not.toContain(deprecated);
    }
  });

  it("guard de modelos aposentados: deteccao e falha deterministica com diagnostico", () => {
    expect(isDeprecatedGroqModel("llama-3.1-8b-instant")).toBe(true);
    expect(isDeprecatedGroqModel("llama-3.3-70b-versatile")).toBe(true);
    expect(isDeprecatedGroqModel("qwen/qwen3-32b")).toBe(true);
    expect(
      isDeprecatedGroqModel("meta-llama/llama-4-scout-17b-16e-instruct"),
    ).toBe(true);
    expect(isDeprecatedGroqModel("openai/gpt-oss-20b")).toBe(false);

    expect(() =>
      assertGroqModelNotDeprecated({
        model: "llama-3.3-70b-versatile",
        role: "primario da cadeia free (GROQ_MODEL)",
      }),
    ).toThrowError(ModelRouterError);

    expect(() =>
      assertGroqModelNotDeprecated({
        model: "openai/gpt-oss-120b",
        role: "secundario",
      }),
    ).not.toThrow();
  });

  it("deteccao de preview conhecido", () => {
    expect(isPreviewGroqModel("qwen/qwen3.6-27b")).toBe(true);
    expect(isPreviewGroqModel("qwen/qwen3.8-27b")).toBe(true);
    expect(isPreviewGroqModel("openai/gpt-oss-20b")).toBe(false);
  });
});
