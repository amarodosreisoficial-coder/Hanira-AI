import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { ModelRouterError } from "../lib/ai/router/errors";
import {
  normalizeExternalRouterCandidates,
  type ExternalRouterCandidateConfig,
} from "../lib/ai/router/candidate-config";
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

function externalCandidate(
  overrides: Partial<ExternalRouterCandidateConfig> = {},
): ExternalRouterCandidateConfig {
  return {
    id: "cloud-test",
    provider: "fake-provider",
    model: "fake-model",
    capabilities: ["text"],
    priority: 2,
    enabled: true,
    deployment: "cloud",
    ...overrides,
  };
}

describe("external candidate configuration (14.4)", () => {
  it("entrada vazia (undefined) resulta em lista vazia sem erro", () => {
    const normalized = normalizeExternalRouterCandidates(undefined);
    expect(normalized).toEqual([]);
    expect(Object.isFrozen(normalized)).toBe(true);
  });

  it("entrada vazia ([]) resulta em lista vazia sem erro", () => {
    const normalized = normalizeExternalRouterCandidates([]);
    expect(normalized).toEqual([]);
    expect(Object.isFrozen(normalized)).toBe(true);
  });

  it("um candidato externo valido e normalizado preservando os dados", () => {
    const input = [
      externalCandidate({
        id: "cloud-test",
        provider: "fake-provider",
        model: "fake-model",
        capabilities: ["text", "vision"],
        priority: 5,
        enabled: true,
        deployment: "cloud",
        label: "Candidato ficticio de teste",
      }),
    ];
    const normalized = normalizeExternalRouterCandidates(input);

    expect(normalized).toHaveLength(1);
    expect(normalized[0].id).toBe("cloud-test");
    expect(normalized[0].provider).toBe("fake-provider");
    expect(normalized[0].model).toBe("fake-model");
    expect(normalized[0].capabilities).toEqual(["text", "vision"]);
    expect(normalized[0].priority).toBe(5);
    expect(normalized[0].enabled).toBe(true);
    expect(normalized[0].deployment).toBe("cloud");
    expect(normalized[0].label).toBe("Candidato ficticio de teste");
  });

  it("multiplos candidatos validos sao normalizados na mesma ordem", () => {
    const input = [
      externalCandidate({ id: "candidate-b", priority: 4 }),
      externalCandidate({ id: "candidate-a", priority: 9 }),
    ];
    const normalized = normalizeExternalRouterCandidates(input);

    expect(normalized.map((c) => c.id)).toEqual([
      "candidate-b",
      "candidate-a",
    ]);
    expect(normalized.map((c) => c.priority)).toEqual([4, 9]);
  });

  it("deployment e label opcionais sao omitidos quando ausentes", () => {
    const normalized = normalizeExternalRouterCandidates([
      externalCandidate({ deployment: undefined, label: undefined }),
    ]);

    expect(normalized[0].deployment).toBeUndefined();
    expect(normalized[0].label).toBeUndefined();
  });

  it("candidato disabled e preservado corretamente apos normalizacao", () => {
    const normalized = normalizeExternalRouterCandidates([
      externalCandidate({ enabled: false }),
    ]);

    expect(normalized[0].enabled).toBe(false);
  });

  it("capabilities congeladas nao sao mutaveis na entrada normalizada", () => {
    const normalized = normalizeExternalRouterCandidates([
      externalCandidate(),
    ]);

    expect(Object.isFrozen(normalized[0].capabilities)).toBe(true);
    expect(() => {
      (normalized[0].capabilities as string[]).push("speech");
    }).toThrow();
  });

  it("id duplicado entre candidatos externos falha de forma controlada", () => {
    expect(() =>
      normalizeExternalRouterCandidates([
        externalCandidate({ id: "candidate-b" }),
        externalCandidate({ id: "candidate-b", provider: "outro" }),
      ]),
    ).toThrowError(ModelRouterError);
  });

  it("id vazio falha com invalid_configuration", () => {
    expect(() =>
      normalizeExternalRouterCandidates([externalCandidate({ id: "" })]),
    ).toThrowError(ModelRouterError);

    let erro: unknown;
    try {
      normalizeExternalRouterCandidates([externalCandidate({ id: "   " })]);
    } catch (caught) {
      erro = caught;
    }
    expect(erro).toBeInstanceOf(ModelRouterError);
    expect((erro as ModelRouterError).code).toBe("invalid_configuration");
  });

  it("provider vazio falha com invalid_configuration", () => {
    expect(() =>
      normalizeExternalRouterCandidates([externalCandidate({ provider: "" })]),
    ).toThrowError(ModelRouterError);
    expect(() =>
      normalizeExternalRouterCandidates([
        externalCandidate({ provider: "  " }),
      ]),
    ).toThrowError(ModelRouterError);
  });
it("model vazio falha com invalid_configuration", () => {
    expect(() =>
      normalizeExternalRouterCandidates([externalCandidate({ model: "" })]),
    ).toThrowError(ModelRouterError);
    expect(() =>
      normalizeExternalRouterCandidates([externalCandidate({ model: " " })]),
    ).toThrowError(ModelRouterError);
  });

  it("capabilities vazias falham com invalid_configuration", () => {
    expect(() =>
      normalizeExternalRouterCandidates([
        externalCandidate({ capabilities: [] }),
      ]),
    ).toThrowError(ModelRouterError);
  });

  it("capability invalida falha com invalid_configuration", () => {
    expect(() =>
      normalizeExternalRouterCandidates([
        externalCandidate({
          capabilities: [
            "quantum",
          ] as unknown as ExternalRouterCandidateConfig["capabilities"],
        }),
      ]),
    ).toThrowError(ModelRouterError);
  });

  it("priority invalida falha com invalid_configuration", () => {
    expect(() =>
      normalizeExternalRouterCandidates([
        externalCandidate({ priority: 1.5 }),
      ]),
    ).toThrowError(ModelRouterError);
    expect(() =>
      normalizeExternalRouterCandidates([
        externalCandidate({ priority: NaN }),
      ]),
    ).toThrowError(ModelRouterError);
  });

  it("deployment invalido falha com invalid_configuration", () => {
    expect(() =>
      normalizeExternalRouterCandidates([
        externalCandidate({
          deployment:
            "edge" as unknown as ExternalRouterCandidateConfig["deployment"],
        }),
      ]),
    ).toThrowError(ModelRouterError);
  });

  it("enabled nao booleano falha com invalid_configuration", () => {
    expect(() =>
      normalizeExternalRouterCandidates([
        externalCandidate({
          enabled: "sim",
        } as unknown as ExternalRouterCandidateConfig),
      ]),
    ).toThrowError(ModelRouterError);
  });

  it("entrada recebida nao e mutada pela normalizacao", () => {
    const input = [
      externalCandidate({ id: "candidate-b", priority: 4 }),
      externalCandidate({ id: "candidate-a", priority: 9 }),
    ];
    const snapshot = JSON.stringify(input);

    const normalized = normalizeExternalRouterCandidates(input);
    expect(() => {
      (normalized as ExternalRouterCandidateConfig[]).reverse();
    }).toThrow();

    expect(JSON.stringify(input)).toBe(snapshot);
    expect(input[0].id).toBe("candidate-b");
    expect(input[0].priority).toBe(4);
    expect(input[1].id).toBe("candidate-a");
  });

  it("resultado normalizado e imutavel (congelado em todos os niveis)", () => {
    const normalized = normalizeExternalRouterCandidates([
      externalCandidate({
        id: "candidate-b",
        capabilities: ["text", "vision"],
      }),
      externalCandidate({ id: "candidate-a" }),
    ]);

    expect(Object.isFrozen(normalized)).toBe(true);
    for (const candidate of normalized) {
      expect(Object.isFrozen(candidate)).toBe(true);
      expect(Object.isFrozen(candidate.capabilities)).toBe(true);
    }

    expect(() => {
      (normalized as ExternalRouterCandidateConfig[]).push(
        externalCandidate({ id: "outro" }),
      );
    }).toThrow();
    expect(() => {
      (normalized[0] as unknown as { priority: number }).priority = 1;
    }).toThrow();
    expect(() => {
      (normalized[0].capabilities as string[]).push("speech");
    }).toThrow();
  });

  it("candidato externo nao instancia provider real", () => {
    const normalized = normalizeExternalRouterCandidates([
      externalCandidate(),
    ]);

    for (const candidate of normalized) {
      expect(candidate instanceof OllamaProvider).toBe(false);
      expect(Object.getPrototypeOf(candidate)).toBe(Object.prototype);
      expect("generate" in candidate).toBe(false);
      expect("stream" in candidate).toBe(false);
    }
  });

  it("erros nao vazam o objeto inteiro nem conteudo sensivel", () => {
    const secret = "api_key_secreta_14_4";
    const invalido = {
      ...externalCandidate({ id: "" }),
      secret,
    };

    let erro: unknown;
    try {
      normalizeExternalRouterCandidates([invalido]);
    } catch (caught) {
      erro = caught;
    }

    expect(erro).toBeInstanceOf(ModelRouterError);
    expect((erro as ModelRouterError).code).toBe("invalid_configuration");
    const serialized = JSON.stringify(erro);
    expect(serialized).not.toContain(secret);
  });

  it("camada de configuracao permanece pura: sem env, rede e providers concretos", () => {
    const source = readFileSync("lib/ai/router/candidate-config.ts", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\/\/.*$/gm, " ");

    expect(source).not.toContain("process.env");
    expect(source).not.toContain("fetch(");
    expect(source).not.toContain("OllamaProvider");
    expect(source).not.toContain("OpenAIProvider");
    expect(source).not.toContain("supabase");
    expect(source).not.toContain("server-only");
  });
});
describe("candidate registry com candidatos externos (14.4)", () => {
  it("registry sem externalCandidates continua igual ao Pacote 14.3", () => {
    const registry = createRouterCandidateRegistry({
      ollamaModel: "qwen2.5:latest",
    });

    expect(registry.candidates).toHaveLength(1);
    expect(registry.candidates[0].id).toBe(OLLAMA_DEFAULT_CANDIDATE_ID);
  });

  it("registry adiciona candidato externo valido junto ao ollama-default", () => {
    const registry = createRouterCandidateRegistry({
      ollamaModel: "qwen2.5:latest",
      externalCandidates: [externalCandidate({ id: "cloud-test" })],
    });

    const ids = registry.candidates.map((c) => c.id);
    expect(ids).toContain(OLLAMA_DEFAULT_CANDIDATE_ID);
    expect(ids).toContain("cloud-test");
    expect(registry.candidates).toHaveLength(2);
  });

  it("ordenacao deterministica por (priority asc, id asc)", () => {
    const registry = createRouterCandidateRegistry({
      ollamaModel: "qwen2.5:latest",
      externalCandidates: [
        externalCandidate({ id: "candidate-b", priority: 1 }),
        externalCandidate({ id: "candidate-a", priority: 10 }),
      ],
    });

    const byId = registry.candidates.map((c) => c.id);
    expect(byId).toEqual([
      "candidate-b",
      OLLAMA_DEFAULT_CANDIDATE_ID,
      "candidate-a",
    ]);

    const other = createRouterCandidateRegistry({
      ollamaModel: "qwen2.5:latest",
      externalCandidates: [
        externalCandidate({ id: "candidate-a", priority: 10 }),
        externalCandidate({ id: "candidate-b", priority: 1 }),
      ],
    });
    expect(other.candidates.map((c) => c.id)).toEqual(byId);
  });

  it("capability filtering continua deterministico", () => {
    const registry = createRouterCandidateRegistry({
      ollamaModel: "qwen2.5:latest",
      externalCandidates: [
        externalCandidate({
          id: "candidate-b",
          capabilities: ["text", "vision"],
        }),
        externalCandidate({
          id: "candidate-a",
          capabilities: ["vision"],
        }),
      ],
    });

    const vision = registry
      .getCandidatesForCapability("vision")
      .map((c) => c.id);
    expect(vision).toEqual(["candidate-a", "candidate-b"]);

    const text = registry.getCandidatesForCapability("text").map((c) => c.id);
    expect(text).toEqual([OLLAMA_DEFAULT_CANDIDATE_ID, "candidate-b"]);
  });

  it("candidate disabled preservado e ignorado pelo router", () => {
    const registry = createRouterCandidateRegistry({
      ollamaModel: "qwen2.5:latest",
      externalCandidates: [
        externalCandidate({ id: "candidate-b", priority: 1, enabled: false }),
      ],
    });

    const disabled = registry.candidates.find((c) => c.id === "candidate-b");
    expect(disabled?.enabled).toBe(false);
    expect(disabled?.priority).toBe(1);

    const decision = createTextModelRouter(
      registry.getCandidatesForCapability("text"),
    ).select({ capability: "text" });

    expect(decision.selected.candidateId).toBe(OLLAMA_DEFAULT_CANDIDATE_ID);
    expect(decision.rejected).toEqual([
      {
        candidateId: "candidate-b",
        provider: "fake-provider",
        reason: "disabled",
      },
    ]);
  });
it("id duplicado com ollama-default falha de forma controlada", () => {
    expect(() =>
      createRouterCandidateRegistry({
        ollamaModel: "qwen2.5:latest",
        externalCandidates: [
          externalCandidate({ id: OLLAMA_DEFAULT_CANDIDATE_ID }),
        ],
      }),
    ).toThrowError(ModelRouterError);
  });

  it("candidatos resultantes permanecem congelados e ordenados", () => {
    const registry = createRouterCandidateRegistry({
      ollamaModel: "qwen2.5:latest",
      externalCandidates: [
        externalCandidate({ id: "candidate-b" }),
        externalCandidate({ id: "candidate-a" }),
      ],
    });

    expect(Object.isFrozen(registry)).toBe(true);
    expect(Object.isFrozen(registry.candidates)).toBe(true);
    for (const candidate of registry.candidates) {
      expect(Object.isFrozen(candidate)).toBe(true);
      expect(Object.isFrozen(candidate.capabilities)).toBe(true);
    }
    expect(() => {
      (registry.candidates as unknown as unknown[]).push({});
    }).toThrow();
  });

  it("configuracao invalida do registry gera erro invalid_configuration", () => {
    expect(() =>
      createRouterCandidateRegistry({
        ollamaModel: "qwen2.5:latest",
        externalCandidates: [externalCandidate({ id: "" })],
      }),
    ).toThrowError(ModelRouterError);

    let erro: unknown;
    try {
      createRouterCandidateRegistry({
        ollamaModel: "qwen2.5:latest",
        externalCandidates: [
          externalCandidate({ capabilities: [] as unknown as ["text"] }),
        ],
      });
    } catch (caught) {
      erro = caught;
    }
    expect(erro).toBeInstanceOf(ModelRouterError);
    expect((erro as ModelRouterError).code).toBe("invalid_configuration");
  });
});

describe("runtime padrao com candidatos externos (14.4)", () => {
  it("runtime padrao sem opcoes continua escolhendo Ollama", () => {
    process.env.AI_ENGINE_OLLAMA_ENABLED = "true";
    process.env.OLLAMA_BASE_URL = "http://127.0.0.1:11434/";
    process.env.OLLAMA_MODEL = "qwen2.5:latest";

    const runtime = createTextChatRuntime();

    expect(runtime.provider).toBeInstanceOf(OllamaProvider);
    expect(runtime.providerId).toBe("ollama");
    expect(runtime.model).toBe("qwen2.5:latest");
  });

  it("runtime com externalCandidates vazio continua escolhendo Ollama", () => {
    process.env.AI_ENGINE_OLLAMA_ENABLED = "true";
    process.env.OLLAMA_BASE_URL = "http://127.0.0.1:11434/";
    process.env.OLLAMA_MODEL = "qwen2.5:latest";

    const runtime = createTextChatRuntime({ externalCandidates: [] });

    expect(runtime.provider).toBeInstanceOf(OllamaProvider);
    expect(runtime.providerId).toBe("ollama");
  });

  it("composition root continua com caminho livre de provider cloud", () => {
    const source = readFileSync(
      "lib/ai/runtime/create-text-chat-runtime.ts",
      "utf8",
    );

    expect(source).toContain("new OllamaProvider");
    expect(source).not.toContain("OpenAIProvider");
    expect(source).toContain("externalCandidates");
  });
});