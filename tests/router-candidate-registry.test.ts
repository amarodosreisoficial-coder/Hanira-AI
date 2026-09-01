import { afterEach, describe, expect, it } from "vitest";
import { ModelRouterError } from "../lib/ai/router/errors";
import {
  createRouterCandidateRegistry,
  OLLAMA_DEFAULT_CANDIDATE_ID,
} from "../lib/ai/router/candidate-registry";
import { OllamaProvider } from "../lib/ai/providers/ollama";
import { createTextModelRouter } from "../lib/ai/runtime/text-router-resolution";
import { createTextChatRuntime } from "../lib/ai/runtime";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("router candidate registry (14.3)", () => {
  it("registry fornece o candidato ollama-default", () => {
    const registry = createRouterCandidateRegistry({
      ollamaModel: "qwen2.5:latest",
    });

    expect(registry.candidates).toHaveLength(1);
    expect(registry.candidates[0].id).toBe(OLLAMA_DEFAULT_CANDIDATE_ID);
    expect(registry.candidates[0].id).toBe("ollama-default");
    expect(registry.candidates[0].provider).toBe("ollama");
  });

  it("candidate ollama-default anuncia a capability text", () => {
    const registry = createRouterCandidateRegistry({
      ollamaModel: "qwen2.5:latest",
    });

    expect(registry.candidates[0].capabilities).toEqual(["text"]);

    const textCandidates = registry.getCandidatesForCapability("text");
    expect(textCandidates).toHaveLength(1);
    expect(textCandidates[0].id).toBe(OLLAMA_DEFAULT_CANDIDATE_ID);
  });

  it("candidate ollama-default e deployment local", () => {
    const registry = createRouterCandidateRegistry({
      ollamaModel: "qwen2.5:latest",
    });

    expect(registry.candidates[0].deployment).toBe("local");
  });

  it("candidate ollama-default tem prioridade 1", () => {
    const registry = createRouterCandidateRegistry({
      ollamaModel: "qwen2.5:latest",
    });

    expect(registry.candidates[0].priority).toBe(1);
  });

  it("candidate ollama-default esta enabled", () => {
    const registry = createRouterCandidateRegistry({
      ollamaModel: "qwen2.5:latest",
    });

    expect(registry.candidates[0].enabled).toBe(true);
  });

  it("model recebido e preservado no candidato", () => {
    const registry = createRouterCandidateRegistry({
      ollamaModel: "qwen2.5:7b",
    });
    expect(registry.candidates[0].model).toBe("qwen2.5:7b");

    const other = createRouterCandidateRegistry({
      ollamaModel: "outro-modelo",
    });
    expect(other.candidates[0].model).toBe("outro-modelo");
  });
});

describe("router candidate registry -> guardas (14.3)", () => {
  it("resultado e deterministico entre criacoes e chamadas repetidas", () => {
    const a = createRouterCandidateRegistry({ ollamaModel: "qwen2.5:latest" });
    const b = createRouterCandidateRegistry({ ollamaModel: "qwen2.5:latest" });

    expect(a.candidates).toEqual(b.candidates);
    expect(a.getCandidatesForCapability("text")).toEqual(
      b.getCandidatesForCapability("text"),
    );
    expect(a.getCandidatesForCapability("text")).toEqual(
      a.getCandidatesForCapability("text"),
    );

    const decisionA = createTextModelRouter(a.candidates).select({
      capability: "text",
    });
    const decisionB = createTextModelRouter([...b.candidates].reverse()).select(
      { capability: "text" },
    );
    expect(decisionA).toEqual(decisionB);
  });

  it("nenhum provider cloud aparece no registry", () => {
    const registry = createRouterCandidateRegistry({
      ollamaModel: "qwen2.5:latest",
    });

    for (const candidate of registry.candidates) {
      expect(candidate.provider).toBe("ollama");
      expect(candidate.deployment).toBe("local");
    }
    expect(registry.getCandidatesForCapability("vision")).toEqual([]);
  });

  it("runtime continua selecionando o Ollama via registry, sem rede", () => {
    process.env.AI_ENGINE_OLLAMA_ENABLED = "true";
    process.env.OLLAMA_BASE_URL = "http://127.0.0.1:11434/";
    process.env.OLLAMA_MODEL = "qwen2.5:latest";

    const runtime = createTextChatRuntime();

    expect(runtime.provider).toBeInstanceOf(OllamaProvider);
    expect(runtime.providerId).toBe("ollama");
    expect(runtime.model).toBe("qwen2.5:latest");

    const registry = createRouterCandidateRegistry({
      ollamaModel: "qwen2.5:latest",
    });
    const decision = createTextModelRouter(
      registry.getCandidatesForCapability("text"),
    ).select({ capability: "text" });

    expect(decision.selected.candidateId).toBe(OLLAMA_DEFAULT_CANDIDATE_ID);
    expect(decision.selected.provider).toBe("ollama");
    expect(decision.selected.model).toBe("qwen2.5:latest");
  });

  it("registry nao cria AIProvider real e nao expoe dados mutaveis", () => {
    const registry = createRouterCandidateRegistry({
      ollamaModel: "qwen2.5:latest",
    });

    expect(Object.isFrozen(registry)).toBe(true);
    expect(Object.isFrozen(registry.candidates)).toBe(true);

    for (const candidate of registry.candidates) {
      expect(candidate instanceof OllamaProvider).toBe(false);
      expect(Object.getPrototypeOf(candidate)).toBe(Object.prototype);
      expect(Object.isFrozen(candidate)).toBe(true);
      expect(Object.isFrozen(candidate.capabilities)).toBe(true);
      expect("generate" in candidate).toBe(false);
      expect("stream" in candidate).toBe(false);
    }
  });

  it("entrada invalida falha de forma controlada", () => {
    expect(() => createRouterCandidateRegistry({ ollamaModel: "" })).toThrowError(
      ModelRouterError,
    );
    expect(() =>
      createRouterCandidateRegistry({ ollamaModel: "   " }),
    ).toThrowError(ModelRouterError);
  });
});
