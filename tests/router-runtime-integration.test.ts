import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AIProvider, AIProviderHealth } from "../lib/ai/provider";
import { ModelRouterError } from "../lib/ai/router/errors";
import { ModelRouter } from "../lib/ai/router/model-router";
import type { RouterDecision } from "../lib/ai/router/types";
import {
  AIProviderError,
  type AIChatResponse,
  type AIModelInfo,
  type AIProviderCapability,
  type AIStreamEvent,
} from "../lib/ai/types";
import { OllamaProvider } from "../lib/ai/providers/ollama";
import {
  createRouterCandidateRegistry,
  OLLAMA_DEFAULT_CANDIDATE_ID,
} from "../lib/ai/router/candidate-registry";
import type { RouterCandidate } from "../lib/ai/router/types";
import {
  createTextModelRouter,
  resolveTextRouterDecisionProvider,
  TEXT_ROUTER_LOGICAL_PROVIDERS,
} from "../lib/ai/runtime/text-router-resolution";
import { createTextChatRuntime } from "../lib/ai/runtime";

const ORIGINAL_ENV = { ...process.env };

class FakeProviderStub implements AIProvider {
  readonly providerId: string;
  readonly capabilities: { supported: readonly AIProviderCapability[] };

  constructor(options: {
    providerId: string;
    supported: readonly AIProviderCapability[];
  }) {
    this.providerId = options.providerId;
    this.capabilities = { supported: options.supported };
  }

  async generate(): Promise<AIChatResponse> {
    throw new Error("generate nao deve ser chamado nos testes de resolucao");
  }

  async *stream(): AsyncGenerator<AIStreamEvent> {
    yield {
      type: "error",
      error: new AIProviderError({
        code: "unknown",
        message: "stream nao deve ser chamado nos testes de resolucao",
      }),
    };
  }

  async healthCheck(): Promise<AIProviderHealth> {
    return { ok: true, provider: this.providerId };
  }

  async listModels(): Promise<AIModelInfo[]> {
    return [];
  }

  supports(capability: AIProviderCapability): boolean {
    return this.capabilities.supported.includes(capability);
  }
}

function buildTextProvider() {
  return new FakeProviderStub({
    providerId: "fake-text",
    supported: ["text-generation", "text-streaming"],
  });
}

function buildNonTextProvider() {
  return new FakeProviderStub({
    providerId: "fake-nontext",
    supported: ["tools"],
  });
}

function buildTextCandidates(model: string): readonly RouterCandidate[] {
  return createRouterCandidateRegistry({ ollamaModel: model }).candidates;
}

function buildDecision(): RouterDecision {
  return createTextModelRouter(
    buildTextCandidates("qwen2.5:latest"),
  ).select({ capability: "text" });
}

function forgeDecision(options: {
  capability?: RouterDecision["capability"];
  selected: RouterDecision["selected"];
}): RouterDecision {
  return {
    capability: options.capability ?? "text",
    selected: options.selected,
    reason: "selected_by_priority",
    evaluatedCount: 1,
    rejected: [],
  };
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("integracao Model Router -> runtime de texto (14.2B)", () => {
  it("runtime de texto seleciona o candidato Ollama local", () => {
    const decision = buildDecision();

    expect(decision.capability).toBe("text");
    expect(decision.selected.candidateId).toBe(OLLAMA_DEFAULT_CANDIDATE_ID);
    expect(decision.selected.provider).toBe("ollama");
    expect(decision.selected.model).toBe("qwen2.5:latest");
    expect(decision.selected.deployment).toBe("local");
    expect(decision.reason).toBe("selected_by_priority");
    expect(decision.evaluatedCount).toBe(1);
    expect(decision.rejected).toEqual([]);
  });

  it("RouterDecision e convertido para o AIProvider correto", () => {
    const decision = buildDecision();
    const provider = buildTextProvider();
    const factory = vi.fn(() => provider);

    const resolved = resolveTextRouterDecisionProvider(decision, {
      ollama: factory,
      groq: factory,
    });

    expect(factory).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledWith({ model: decision.selected.model });
    expect(resolved).toBe(provider);
    expect(resolved.providerId).toBe("fake-text");
  });

  it("provider logico desconhecido falha de forma controlada, sem fallback implicito", () => {
    const decision = forgeDecision({
      selected: {
        candidateId: "cloud-fake",
        provider: "openai",
        model: "gpt-fake",
        priority: 1,
      },
    });
    const factory = vi.fn(() => buildTextProvider());

    let caught: unknown;
    try {
      resolveTextRouterDecisionProvider(decision, { ollama: factory, groq: factory });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ModelRouterError);
    const routerError = caught as ModelRouterError;
    expect(routerError.code).toBe("invalid_configuration");
    expect(routerError.message).toContain("openai");
    expect(Object.keys(routerError.metadata ?? {})).toEqual([
      "requestedCapability",
    ]);
    expect(factory).not.toHaveBeenCalled();
  });

  it("capability incompativel com o resolver de texto falha de forma controlada", () => {
    const decision = forgeDecision({
      capability: "vision",
      selected: {
        candidateId: OLLAMA_DEFAULT_CANDIDATE_ID,
        provider: "ollama",
        model: "qwen2.5:latest",
        priority: 1,
      },
    });

    expect(() =>
      resolveTextRouterDecisionProvider(decision, {
        ollama: () => buildTextProvider(),
        groq: () => buildTextProvider(),
      }),
    ).toThrowError(ModelRouterError);
  });

  it("provider resolvido sem text-generation falha de forma controlada", () => {
    const decision = buildDecision();

    expect(() =>
      resolveTextRouterDecisionProvider(decision, {
        ollama: () => buildNonTextProvider(),
        groq: () => buildNonTextProvider(),
      }),
    ).toThrowError(ModelRouterError);
  });
});

describe("integracao Model Router -> guardas de regressao (14.2B)", () => {
  it("selecao permanece deterministica independentemente da ordem de entrada", () => {
    const candidates = buildTextCandidates("qwen2.5:latest");

    const decisionA = createTextModelRouter(candidates).select({
      capability: "text",
    });
    const decisionB = new ModelRouter([...candidates].reverse()).select({
      capability: "text",
    });
    const decisionC = createTextModelRouter(candidates).select({
      capability: "text",
    });

    expect(decisionA).toEqual(decisionB);
    expect(decisionA).toEqual(decisionC);
  });

  it("nenhum provider cloud entra na lista de candidatos de texto", () => {
    const candidates = buildTextCandidates("qwen2.5:latest");

    expect(candidates).toHaveLength(1);
    for (const candidate of candidates) {
      expect(candidate.provider).toBe("ollama");
      expect(candidate.deployment).toBe("local");
      expect(candidate.enabled).toBe(true);
      expect(candidate.capabilities).toContain("text");
    }
    expect(TEXT_ROUTER_LOGICAL_PROVIDERS).toContain("ollama");
  });

  it("createTextChatRuntime entrega o provider Ollama resolvido pelo router, sem rede", () => {
    process.env.AI_ENGINE_OLLAMA_ENABLED = "true";
    process.env.OLLAMA_BASE_URL = "http://127.0.0.1:11434/";
    process.env.OLLAMA_MODEL = "qwen2.5:latest";

    const runtime = createTextChatRuntime();

    expect(runtime.provider).toBeInstanceOf(OllamaProvider);
    expect(runtime.provider.providerId).toBe("ollama");
    expect(runtime.providerId).toBe("ollama");
    expect(runtime.model).toBe("qwen2.5:latest");
    expect(runtime.baseUrl).toBe("http://127.0.0.1:11434");
  });

  it("composition root de texto mantem o caminho livre de provider cloud", () => {
    const source = readFileSync(
      "lib/ai/runtime/create-text-chat-runtime.ts",
      "utf8",
    );

    expect(source).toContain("new OllamaProvider");
    expect(source).not.toContain("OpenAIProvider");
    expect(source).toContain("createTextModelRouter");
    expect(source).toContain('capability: "text"');
    expect(source).not.toContain("let runtime");
  });
});
