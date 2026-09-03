import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ModelRouter } from "../lib/ai/router/model-router";
import { ModelRouterError } from "../lib/ai/router/errors";
import {
  ROUTER_CAPABILITY_TO_PROVIDER_CAPABILITY,
  type RouterCandidate,
} from "../lib/ai/router/types";

function candidate(overrides: Partial<RouterCandidate> = {}): RouterCandidate {
  return {
    id: "candidate-a",
    provider: "fake-provider",
    model: "fake-model",
    capabilities: ["text"],
    priority: 1,
    enabled: true,
    // Pacote 14.8: fixtures de teste declaram classificacao financeira
    // explicita (fail-closed: sem costClass o candidato seria bloqueado).
    costClass: "free",
    ...overrides,
  };
}

describe("model router v1", () => {
  it("escolhe o candidato enabled de maior prioridade (menor numero)", () => {
    const router = new ModelRouter([
      candidate({ id: "secundario", priority: 2 }),
      candidate({ id: "primario", priority: 1 }),
    ]);

    const decision = router.select({ capability: "text" });

    expect(decision.selected.candidateId).toBe("primario");
    expect(decision.reason).toBe("selected_by_priority");
    expect(decision.rejected).toEqual([]);
  });

  it("ignora candidatos disabled e registra a rejeicao", () => {
    const router = new ModelRouter([
      candidate({ id: "desligado", priority: 1, enabled: false }),
      candidate({ id: "ativo", priority: 2 }),
    ]);

    const decision = router.select({ capability: "text" });

    expect(decision.selected.candidateId).toBe("ativo");
    expect(decision.rejected).toEqual([
      { candidateId: "desligado", provider: "fake-provider", reason: "disabled" },
    ]);
  });

  it("rejeita candidatos sem a capability solicitada", () => {
    const router = new ModelRouter([
      candidate({ id: "so-texto", priority: 1, capabilities: ["text"] }),
      candidate({
        id: "com-visao",
        provider: "outro-provider",
        model: "outro-model",
        priority: 2,
        capabilities: ["text", "vision"],
      }),
    ]);

    const decision = router.select({ capability: "vision" });

    expect(decision.selected.candidateId).toBe("com-visao");
    expect(decision.rejected).toEqual([
      {
        candidateId: "so-texto",
        provider: "fake-provider",
        reason: "capability_not_supported",
      },
    ]);
  });

  it("desempata prioridades iguais por id em ordem alfabetica", () => {
    const router = new ModelRouter([
      candidate({ id: "zulu", priority: 1 }),
      candidate({ id: "alfa", priority: 1 }),
    ]);

    const decision = router.select({ capability: "text" });

    expect(decision.selected.candidateId).toBe("alfa");
  });

  it("a ordem de entrada nao altera a decisao", () => {
    const first = new ModelRouter([
      candidate({ id: "alfa", priority: 1 }),
      candidate({ id: "zulu", priority: 2 }),
      candidate({ id: "mike", priority: 3, enabled: false }),
    ]);
    const second = new ModelRouter([
      candidate({ id: "mike", priority: 3, enabled: false }),
      candidate({ id: "zulu", priority: 2 }),
      candidate({ id: "alfa", priority: 1 }),
    ]);

    const decisionA = first.select({ capability: "text" });
    const decisionB = second.select({ capability: "text" });

    expect(JSON.stringify(decisionB)).toBe(JSON.stringify(decisionA));
    expect(decisionA.selected.candidateId).toBe("alfa");
  });

  it("preferencia explicita valida vence a prioridade", () => {
    const router = new ModelRouter([
      candidate({ id: "primario", priority: 1 }),
      candidate({
        id: "preferido",
        provider: "outro-provider",
        model: "outro-model",
        priority: 5,
      }),
    ]);

    const decision = router.select({
      capability: "text",
      preferredCandidateId: "preferido",
    });

    expect(decision.selected.candidateId).toBe("preferido");
    expect(decision.reason).toBe("selected_by_preference");
  });

  it("preferencia invalida nao quebra a selecao deterministica", () => {
    const base = [
      candidate({ id: "primario", priority: 1 }),
      candidate({ id: "desligado", priority: 2, enabled: false }),
      candidate({ id: "sem-capabilidade", priority: 3, capabilities: ["vision"] }),
    ];

    const porIdInexistente = new ModelRouter(base).select({
      capability: "text",
      preferredCandidateId: "inexistente",
    });
    const porPreferidoDesligado = new ModelRouter(base).select({
      capability: "text",
      preferredCandidateId: "desligado",
    });
    const porPreferidoSemCapability = new ModelRouter(base).select({
      capability: "text",
      preferredCandidateId: "sem-capabilidade",
    });

    for (const decision of [
      porIdInexistente,
      porPreferidoDesligado,
      porPreferidoSemCapability,
    ]) {
      expect(decision.selected.candidateId).toBe("primario");
      expect(decision.reason).toBe("selected_after_invalid_preference");
    }
  });

  it("nenhum candidato elegivel gera erro tipado", () => {
    const router = new ModelRouter([
      candidate({ id: "desligado", enabled: false }),
      candidate({ id: "so-visao", priority: 2, capabilities: ["vision"] }),
    ]);

    try {
      router.select({ capability: "text", preferredCandidateId: "so-visao" });
      throw new Error("deveria ter lancado ModelRouterError");
    } catch (error) {
      expect(error).toBeInstanceOf(ModelRouterError);
      const routerError = error as ModelRouterError;
      expect(routerError.code).toBe("no_eligible_candidate");
      expect(routerError.metadata?.requestedCapability).toBe("text");
      expect(routerError.metadata?.candidatesConsidered).toBe(2);
      expect(routerError.metadata?.rejected).toEqual([
        { candidateId: "desligado", provider: "fake-provider", reason: "disabled" },
        {
          candidateId: "so-visao",
          provider: "fake-provider",
          reason: "capability_not_supported",
        },
      ]);
    }

    const vazio = new ModelRouter([]);
    expect(() => vazio.select({ capability: "text" })).toThrowError(
      ModelRouterError,
    );
  });

  it("decisao e erro nao expoem informacao sensivel", () => {
    const vazado = "sk-secret-123";
    const comExtraInjecao = {
      ...candidate({ id: "com-vazamento", priority: 3, enabled: false }),
      apiKey: vazado,
    } as unknown as RouterCandidate;

    const router = new ModelRouter([
      candidate({ id: "primario", priority: 1 }),
      comExtraInjecao,
    ]);

    const decision = router.select({ capability: "text" });
    const decisionSerializada = JSON.stringify(decision);

    expect(decision.selected.candidateId).toBe("primario");
    expect(decision.rejected).toEqual([
      {
        candidateId: "com-vazamento",
        provider: "fake-provider",
        reason: "disabled",
      },
    ]);
    expect(decisionSerializada).not.toContain(vazado);
    expect(decisionSerializada).not.toMatch(
      /api[_-]?key|secret|token|authorization|cookie|prompt/i,
    );

    let erroSerializado = "";
    try {
      router.select({ capability: "vision" });
    } catch (error) {
      erroSerializado = JSON.stringify((error as ModelRouterError).metadata);
    }
    expect(erroSerializado).not.toContain(vazado);
    expect(erroSerializado).not.toMatch(
      /api[_-]?key|secret|token|authorization|cookie|prompt/i,
    );
  });

  it("configuracao invalida gera erro tipado invalid_configuration", () => {
    expect(() =>
      new ModelRouter([candidate({ id: "a" }), candidate({ id: "a" })]),
    ).toThrowError(ModelRouterError);
    expect(() => new ModelRouter([candidate({ priority: 1.5 })])).toThrowError(
      ModelRouterError,
    );
    expect(() =>
      new ModelRouter([
        candidate({ enabled: undefined as unknown as boolean }),
      ]),
    ).toThrowError(ModelRouterError);
    expect(() => new ModelRouter([candidate({ id: "" })])).toThrowError(
      ModelRouterError,
    );
    expect(
      () =>
        new ModelRouter([
          candidate({
            capabilities: [
              "quantum" as unknown as RouterCandidate["capabilities"][number],
            ],
          }),
        ]),
    ).toThrowError(ModelRouterError);
  });

  it("request invalida gera erro tipado invalid_request", () => {
    const router = new ModelRouter([candidate()]);

    expect(() =>
      router.select({
        capability: "quantum" as RouterCandidate["capabilities"][number],
      }),
    ).toThrowError(ModelRouterError);
    expect(() =>
      router.select({ capability: "text", preferredCandidateId: "  " }),
    ).toThrowError(ModelRouterError);
  });

  it("mapeia capabilities do router para a porta AIProvider existente", () => {
    expect(ROUTER_CAPABILITY_TO_PROVIDER_CAPABILITY.text).toBe(
      "text-generation",
    );
    expect(ROUTER_CAPABILITY_TO_PROVIDER_CAPABILITY.vision).toBe("vision");
    expect(ROUTER_CAPABILITY_TO_PROVIDER_CAPABILITY.transcription).toBe(
      "transcription",
    );
    expect(ROUTER_CAPABILITY_TO_PROVIDER_CAPABILITY.speech).toBe(
      "text-to-speech",
    );
    expect(ROUTER_CAPABILITY_TO_PROVIDER_CAPABILITY.embeddings).toBe(
      "embeddings",
    );
    expect(ROUTER_CAPABILITY_TO_PROVIDER_CAPABILITY.tools).toBe("tools");
  });

  it("a fundacao permanece pura: sem env, rede, providers concretos ou Supabase", () => {
    const raw = readFileSync("lib/ai/router/model-router.ts", "utf8");
    // Remove comentarios (bloco e linha) para que a documentacao nao dispare
    // o guard: o que se proibe e codigo, nao mencao em comentario.
    const source = raw
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\/\/.*$/gm, " ");
    expect(source).not.toContain("process.env");
    expect(source).not.toContain("fetch(");
    expect(source).not.toContain("new OllamaProvider");
    expect(source).not.toContain("new OpenAIProvider");
    expect(source).not.toContain("supabase");
    expect(source).not.toContain("server-only");
  });
});


