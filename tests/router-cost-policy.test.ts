import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ModelRouter } from "../lib/ai/router/model-router";
import { ModelRouterError } from "../lib/ai/router/errors";
import {
  describeRouterCandidateAvailability,
  evaluateRouterCostPolicy,
  ROUTER_AVAILABILITY_STATES,
  ZERO_COST_ROUTER_POLICY,
} from "../lib/ai/router/cost-policy";
import { normalizeExternalRouterCandidates } from "../lib/ai/router/candidate-config";
import {
  createRouterCandidateRegistry,
  OLLAMA_DEFAULT_CANDIDATE_ID,
} from "../lib/ai/router/candidate-registry";
import { createTextModelRouter } from "../lib/ai/runtime/text-router-resolution";
import {
  isRouterCostClass,
  ROUTER_COST_CLASSES,
  type RouterCandidate,
} from "../lib/ai/router/types";

// Pacote 14.8 - Zero-Cost Guard.
// Regra financeira absoluta: orcamento autorizado R$ 0,00/mes. Nenhum teste
// desta suite chama rede, cria secrets ou conecta provider cloud real.

function capacityErrorOf(action: () => unknown): ModelRouterError {
  try {
    action();
    throw new Error("deveria ter lancado ModelRouterError");
  } catch (caught) {
    if (!(caught instanceof ModelRouterError)) {
      throw caught;
    }
    return caught;
  }
}

function candidate(overrides: Partial<RouterCandidate> = {}): RouterCandidate {
  return {
    id: "candidate-a",
    provider: "fake-provider",
    model: "fake-model",
    capabilities: ["text"],
    priority: 1,
    enabled: true,
    costClass: "free",
    ...overrides,
  };
}

describe("zero cost policy (14.8) - constante global", () => {
  it("politica padrao e zero_cost, sem promocional e imutavel", () => {
    expect(ZERO_COST_ROUTER_POLICY.mode).toBe("zero_cost");
    expect(ZERO_COST_ROUTER_POLICY.allowPromotional).toBe(false);
    expect(Object.isFrozen(ZERO_COST_ROUTER_POLICY)).toBe(true);
  });

  it("classificacao financeira expoe exatamente free/promotional/paid", () => {
    expect([...ROUTER_COST_CLASSES]).toEqual(["free", "promotional", "paid"]);
    expect(isRouterCostClass("free")).toBe(true);
    expect(isRouterCostClass("promotional")).toBe(true);
    expect(isRouterCostClass("paid")).toBe(true);
    expect(isRouterCostClass("FREE")).toBe(false);
    expect(isRouterCostClass("unknown")).toBe(false);
    expect(isRouterCostClass(undefined)).toBe(false);
    expect(isRouterCostClass("")).toBe(false);
  });
});

describe("zero cost policy (14.8) - elegibilidade por candidato", () => {
  it("A) candidato free e elegivel no Zero-Cost Mode", () => {
    expect(evaluateRouterCostPolicy({ costClass: "free" })).toEqual({
      eligible: true,
    });

    const router = new ModelRouter([candidate({ costClass: "free" })]);
    const decision = router.select({ capability: "text" });
    expect(decision.selected.candidateId).toBe("candidate-a");
    expect(decision.rejected).toEqual([]);
  });

  it("B) candidato paid e bloqueado antes de virar decisao executavel", () => {
    expect(evaluateRouterCostPolicy({ costClass: "paid" })).toEqual({
      eligible: false,
      reason: "cost_blocked_paid",
    });

    const router = new ModelRouter([
      candidate({ id: "pago", provider: "groq", costClass: "paid" }),
    ]);

    let erro: unknown;
    try {
      router.select({ capability: "text" });
      throw new Error("deveria ter lancado ModelRouterError");
    } catch (caught) {
      erro = caught;
    }
    expect(erro).toBeInstanceOf(ModelRouterError);
    const routerError = erro as ModelRouterError;
    expect(routerError.code).toBe("no_eligible_candidate");
    expect(routerError.metadata?.rejected).toEqual([
      {
        candidateId: "pago",
        provider: "groq",
        reason: "cost_blocked_paid",
      },
    ]);
  });

  it("C) candidato sem classificacao (unknown) e bloqueado - UNKNOWN != FREE", () => {
    const semClassificacao: RouterCandidate = {
      id: "sem-classificacao",
      provider: "fake-provider",
      model: "fake-model",
      capabilities: ["text"],
      priority: 1,
      enabled: true,
      // Sem costClass: configuracao explicitamente incompleta.
    };

    expect(evaluateRouterCostPolicy(semClassificacao)).toEqual({
      eligible: false,
      reason: "cost_class_unknown",
    });

    const router = new ModelRouter([semClassificacao]);
    let erro: unknown;
    try {
      router.select({ capability: "text" });
      throw new Error("deveria ter lancado ModelRouterError");
    } catch (caught) {
      erro = caught;
    }
    expect((erro as ModelRouterError).code).toBe("no_eligible_candidate");
    expect((erro as ModelRouterError).metadata?.rejected).toEqual([
      {
        candidateId: "sem-classificacao",
        provider: "fake-provider",
        reason: "cost_class_unknown",
      },
    ]);
  });

  it("C) costClass valida informada e preservada na normalizacao externa", () => {
    const normalized = normalizeExternalRouterCandidates([
      {
        id: "externo",
        provider: "fake-provider",
        model: "fake-model",
        capabilities: ["text"],
        priority: 2,
        enabled: true,
        costClass: "paid",
      },
    ]);
    expect(normalized[0].costClass).toBe("paid");
  });

  it("D) candidato disabled nao e selecionado (motivo disabled tem precedencia)", () => {
    const router = new ModelRouter([
      candidate({ id: "desligado", enabled: false }),
    ]);

    const erro = capacityErrorOf(() => router.select({ capability: "text" }));
    expect(erro.code).toBe("no_eligible_candidate");
    expect(erro.metadata?.rejected).toEqual([
      {
        candidateId: "desligado",
        provider: "fake-provider",
        reason: "disabled",
      },
    ]);
  });

  it("D) disabled vem antes da avaliacao financeira", () => {
    const router = new ModelRouter([
      candidate({ id: "pago-desligado", enabled: false, costClass: "paid" }),
    ]);

    const erro = capacityErrorOf(() => router.select({ capability: "text" }));
    expect(erro.metadata?.rejected).toEqual([
      {
        candidateId: "pago-desligado",
        provider: "fake-provider",
        reason: "disabled",
      },
    ]);
  });

  it("E) promotional e bloqueado por padrao (promocao != gratuito permanente)", () => {
    expect(evaluateRouterCostPolicy({ costClass: "promotional" })).toEqual({
      eligible: false,
      reason: "cost_blocked_promotional",
    });

    const router = new ModelRouter([
      candidate({ id: "promocional", costClass: "promotional" }),
    ]);

    const erro = capacityErrorOf(() => router.select({ capability: "text" }));
    expect(erro.metadata?.rejected).toEqual([
      {
        candidateId: "promocional",
        provider: "fake-provider",
        reason: "cost_blocked_promotional",
      },
    ]);
  });

  it("E) promotional so se torna elegivel com politica explicita (opt-in)", () => {
    const explicitPolicy = {
      mode: "zero_cost",
      allowPromotional: true,
    } as const;

    expect(
      evaluateRouterCostPolicy({ costClass: "promotional" }, explicitPolicy),
    ).toEqual({ eligible: true });

    const router = new ModelRouter(
      [candidate({ id: "promocional", costClass: "promotional" })],
      { costPolicy: explicitPolicy },
    );
    const decision = router.select({ capability: "text" });
    expect(decision.selected.candidateId).toBe("promocional");
  });

  it("E) opt-in de promotional NUNCA relaxa o bloqueio de paid", () => {
    const router = new ModelRouter(
      [candidate({ id: "pago", costClass: "paid" })],
      { costPolicy: { mode: "zero_cost", allowPromotional: true } },
    );

    expect(() => router.select({ capability: "text" })).toThrowError(
      ModelRouterError,
    );
  });

  it("G) nenhum candidato financeiramente elegivel gera erro deterministico", () => {
    const snapshot = (): string => {
      const router = new ModelRouter([
        candidate({ id: "pago", priority: 1, costClass: "paid" }),
        candidate({
          id: "desconhecido",
          priority: 2,
          provider: "outro-provider",
          costClass: undefined,
        }),
      ]);

      try {
        router.select({ capability: "text" });
        return "sem-erro";
      } catch (error) {
        return JSON.stringify((error as ModelRouterError).metadata);
      }
    };

    expect(snapshot()).toBe(snapshot());
    expect(snapshot()).toContain("cost_blocked_paid");
    expect(snapshot()).toContain("cost_class_unknown");
  });

  it("H) a politica NAO depende do nome do provider", () => {
    const router = new ModelRouter([
      candidate({ id: "groq-pago", provider: "groq", costClass: "paid" }),
      candidate({ id: "openai-pago", provider: "openai", costClass: "paid" }),
      candidate({
        id: "groq-free",
        provider: "groq",
        priority: 2,
        costClass: "free",
      }),
      candidate({
        id: "openai-free",
        provider: "openai",
        priority: 2,
        costClass: "free",
      }),
    ]);

    const decision = router.select({ capability: "text" });

    // "groq" nao e automaticamente free nem paid; "openai" idem.
    // A configuracao (costClass) determina a elegibilidade.
    expect(decision.selected.candidateId).toBe("groq-free");
    expect(decision.rejected.map((rejection) => rejection.candidateId)).toEqual(
      ["groq-pago", "openai-pago"],
    );
    expect(
      decision.rejected.every(
        (rejection) => rejection.reason === "cost_blocked_paid",
      ),
    ).toBe(true);
  });

  it("candidato free assume quando o preferido e financeiramente bloqueado", () => {
    const router = new ModelRouter([
      candidate({ id: "pago", priority: 1, costClass: "paid" }),
      candidate({ id: "livre", priority: 2, costClass: "free" }),
    ]);

    const decision = router.select({
      capability: "text",
      preferredCandidateId: "pago",
    });

    expect(decision.selected.candidateId).toBe("livre");
    expect(decision.reason).toBe("selected_after_invalid_preference");
    expect(decision.rejected).toEqual([
      {
        candidateId: "pago",
        provider: "fake-provider",
        reason: "cost_blocked_paid",
      },
    ]);
  });
});

describe("zero cost policy (14.8) - integracao no registry Ollama", () => {
  it("F) Nira Local (ollama-default) declara costClass free e continua selecionavel", () => {
    const registry = createRouterCandidateRegistry({
      ollamaModel: "qwen2.5:latest",
    });

    const [ollamaCandidate] = registry.candidates;
    expect(ollamaCandidate.id).toBe(OLLAMA_DEFAULT_CANDIDATE_ID);
    expect(ollamaCandidate.costClass).toBe("free");

    const decision = createTextModelRouter(
      registry.getCandidatesForCapability("text"),
    ).select({ capability: "text" });
    expect(decision.selected.candidateId).toBe(OLLAMA_DEFAULT_CANDIDATE_ID);
    expect(decision.selected.provider).toBe("ollama");
  });
});

describe("zero cost policy (14.8) - estado de disponibilidade", () => {
  it("vocabulario expoe os seis estados", () => {
    expect([...ROUTER_AVAILABILITY_STATES]).toEqual([
      "available",
      "rate_limited",
      "quota_exhausted",
      "unhealthy",
      "disabled",
      "cost_blocked",
    ]);
  });

  it("mapeia disponibilidade estatica a partir de enabled + politica", () => {
    expect(
      describeRouterCandidateAvailability({ enabled: true, costClass: "free" }),
    ).toBe("available");
    expect(
      describeRouterCandidateAvailability({
        enabled: false,
        costClass: "free",
      }),
    ).toBe("disabled");
    expect(
      describeRouterCandidateAvailability({ enabled: true, costClass: "paid" }),
    ).toBe("cost_blocked");
    expect(describeRouterCandidateAvailability({ enabled: true })).toBe(
      "cost_blocked",
    );
    expect(
      describeRouterCandidateAvailability({
        enabled: true,
        costClass: "promotional",
      }),
    ).toBe("cost_blocked");
    expect(
      describeRouterCandidateAvailability(
        { enabled: true, costClass: "promotional" },
        { mode: "zero_cost", allowPromotional: true },
      ),
    ).toBe("available");
  });
});

describe("zero cost policy (14.8) - camada pura", () => {
  it("politica de custo permanece pura: sem env, rede e providers concretos", () => {
    const raw = readFileSync("lib/ai/router/cost-policy.ts", "utf8");
    const source = raw
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