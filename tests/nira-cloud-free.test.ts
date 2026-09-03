import { afterEach, describe, expect, it } from "vitest";
import { ModelRouterError } from "../lib/ai/router/errors";
import { OllamaProvider } from "../lib/ai/providers/ollama";
import {
  createTextChatRuntime,
  TEXT_ROUTER_LOGICAL_PROVIDERS,
} from "../lib/ai/runtime";
import {
  DEFAULT_NIRA_PROFILE_ID,
  getNiraProfileCandidateIds,
  NIRA_CLOUD_FREE_PREFERRED_CANDIDATE_ID,
  NIRA_CLOUD_FREE_PROFILE_CAPABILITY,
  NIRA_CLOUD_FREE_PROFILE_ID,
  NIRA_CLOUD_FREE_PROFILE_NAME,
  NIRA_LOCAL_PROFILE_ID,
  NIRA_LOCAL_PROFILE_NAME,
  NIRA_PROFILES,
  resolveNiraProfile,
} from "../lib/ai/nira/profiles";
import type { ExternalRouterCandidateConfig } from "../lib/ai/router/candidate-config";
import { createRouterCandidateRegistry } from "../lib/ai/router/candidate-registry";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function setOllamaEnv(): void {
  process.env.AI_ENGINE_OLLAMA_ENABLED = "true";
  process.env.OLLAMA_BASE_URL = "http://127.0.0.1:11434/";
  process.env.OLLAMA_MODEL = "qwen2.5:latest";
}

function cloudCandidate(
  overrides: Partial<ExternalRouterCandidateConfig> = {},
): ExternalRouterCandidateConfig {
  return {
    id: NIRA_CLOUD_FREE_PREFERRED_CANDIDATE_ID,
    provider: "qualquer-cloud-ficticio",
    model: "modelo-ficticio",
    capabilities: ["text"],
    priority: 1,
    enabled: true,
    deployment: "cloud",
    ...overrides,
  };
}

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

describe("Nira Cloud Free profile (14.8) - catalogo e desacoplamento", () => {
  it("catalogo contem Nira Cloud Free e Nira Local", () => {
    const ids = NIRA_PROFILES.map((profile) => profile.id);
    expect(ids).toContain(NIRA_CLOUD_FREE_PROFILE_ID);
    expect(ids).toContain(NIRA_LOCAL_PROFILE_ID);
  });

  it("identidade basica do perfil", () => {
    expect(NIRA_CLOUD_FREE_PROFILE_ID).toBe("nira-cloud-free");
    expect(NIRA_CLOUD_FREE_PROFILE_NAME).toBe("Nira Cloud Free");
    expect(NIRA_CLOUD_FREE_PROFILE_CAPABILITY).toBe("text");

    const profile = resolveNiraProfile(NIRA_CLOUD_FREE_PROFILE_ID);
    expect(profile.id).toBe("nira-cloud-free");
    expect(profile.name).toBe("Nira Cloud Free");
    expect(profile.capability).toBe("text");
  });

  it("perfil NAO e acoplado a nenhum provider ou modelo fisico", () => {
    const profile = resolveNiraProfile(NIRA_CLOUD_FREE_PROFILE_ID);
    const serialized = JSON.stringify(profile).toLowerCase();

    expect("provider" in profile).toBe(false);
    expect("model" in profile).toBe(false);
    expect(profile.preferredCandidateId).toBe(
      NIRA_CLOUD_FREE_PREFERRED_CANDIDATE_ID,
    );
    expect(NIRA_CLOUD_FREE_PREFERRED_CANDIDATE_ID).toBe(
      "nira-cloud-free-default",
    );
    // Nenhum nome de provider/marketplace no perfil: quem resolve o provider
    // e o Model Router, a partir de candidatos configurados.
    for (const nome of [
      "groq",
      "gemini",
      "openrouter",
      "openai",
      "together",
      "deepseek",
      "alibaba",
      "qwen",
    ]) {
      expect(serialized).not.toContain(`"${nome}"`);
    }
  });

  it("escopo do perfil e o slot logico (sem candidato registrado neste pacote)", () => {
    const profile = resolveNiraProfile(NIRA_CLOUD_FREE_PROFILE_ID);
    const scope = getNiraProfileCandidateIds(profile);

    expect([...scope]).toEqual([NIRA_CLOUD_FREE_PREFERRED_CANDIDATE_ID]);
    expect(Object.isFrozen(scope)).toBe(true);

    const registry = createRouterCandidateRegistry({
      ollamaModel: "qwen2.5:latest",
    });
    const registrado = registry.candidates.some((candidate) =>
      scope.includes(candidate.id),
    );
    // Nenhum provider cloud real foi conectado neste pacote: o perfil existe
    // sem candidato executavel e isso e representado com erro estruturado.
    expect(registrado).toBe(false);
  });

  it("escopo da Nira Local permanece apenas ollama-default", () => {
    const profile = resolveNiraProfile(NIRA_LOCAL_PROFILE_ID);
    expect([...getNiraProfileCandidateIds(profile)]).toEqual([
      "ollama-default",
    ]);
  });

  it("perfil padrao do runtime continua sendo Nira Local", () => {
    expect(DEFAULT_NIRA_PROFILE_ID).toBe(NIRA_LOCAL_PROFILE_ID);
    expect(NIRA_LOCAL_PROFILE_NAME).toBe("Nira Local");
  });
});

describe("Nira Cloud Free no runtime (14.8) - capacidade representada", () => {
  it("runtime com nira-cloud-free e sem candidato cloud falha de forma estruturada", () => {
    setOllamaEnv();

    const error = capacityErrorOf(() =>
      createTextChatRuntime({ niraProfileId: NIRA_CLOUD_FREE_PROFILE_ID }),
    );

    expect(error.code).toBe("capacity_unavailable");
    expect(error.metadata?.niraProfileId).toBe("nira-cloud-free");
    expect(error.metadata?.requestedCapability).toBe("text");
  });

  it("a falha de capacidade e deterministica entre chamadas", () => {
    setOllamaEnv();

    const first = capacityErrorOf(() =>
      createTextChatRuntime({ niraProfileId: NIRA_CLOUD_FREE_PROFILE_ID }),
    );
    const second = capacityErrorOf(() =>
      createTextChatRuntime({ niraProfileId: NIRA_CLOUD_FREE_PROFILE_ID }),
    );

    expect(first.code).toBe(second.code);
    expect(JSON.stringify(first.metadata)).toBe(
      JSON.stringify(second.metadata),
    );
  });

  it("runtime NAO faz fallback silencioso da Nira Cloud Free para o motor local", () => {
    setOllamaEnv();

    const error = capacityErrorOf(() =>
      createTextChatRuntime({ niraProfileId: NIRA_CLOUD_FREE_PROFILE_ID }),
    );

    // Se o runtime cai-se no Ollama, retornaria um provider local. O erro
    // estruturado prova que a disponibilidade NAO e fingida.
    expect(error.code).toBe("capacity_unavailable");
  });
});

describe("Nira Cloud Free no runtime (14.8) - prova financeira", () => {
  it("PROVA paid: candidato pago no escopo e bloqueado ANTES de qualquer provider", () => {
    setOllamaEnv();

    const error = capacityErrorOf(() =>
      createTextChatRuntime({
        niraProfileId: NIRA_CLOUD_FREE_PROFILE_ID,
        externalCandidates: [cloudCandidate({ costClass: "paid" })],
      }),
    );

    // O runtime lancou ANTES de criar qualquer AIProvider: nenhum provider
    // pago foi instanciado, nenhuma rede foi chamada.
    expect(error.code).toBe("capacity_unavailable");
    expect(error.metadata?.rejected).toEqual([
      {
        candidateId: NIRA_CLOUD_FREE_PREFERRED_CANDIDATE_ID,
        provider: "qualquer-cloud-ficticio",
        reason: "cost_blocked_paid",
      },
    ]);
  });

  it("PROVA unknown: candidato sem classificacao e bloqueado (UNKNOWN != FREE)", () => {
    setOllamaEnv();

    // cloudCandidate() nao declara costClass: configuracao incompleta.
    const error = capacityErrorOf(() =>
      createTextChatRuntime({
        niraProfileId: NIRA_CLOUD_FREE_PROFILE_ID,
        externalCandidates: [cloudCandidate()],
      }),
    );

    expect(error.code).toBe("capacity_unavailable");
    expect(error.metadata?.rejected).toEqual([
      {
        candidateId: NIRA_CLOUD_FREE_PREFERRED_CANDIDATE_ID,
        provider: "qualquer-cloud-ficticio",
        reason: "cost_class_unknown",
      },
    ]);
  });

  it("PROVA promotional: bloqueado por padrao no runtime", () => {
    setOllamaEnv();

    const error = capacityErrorOf(() =>
      createTextChatRuntime({
        niraProfileId: NIRA_CLOUD_FREE_PROFILE_ID,
        externalCandidates: [cloudCandidate({ costClass: "promotional" })],
      }),
    );

    expect(error.code).toBe("capacity_unavailable");
    expect(error.metadata?.rejected).toEqual([
      {
        candidateId: NIRA_CLOUD_FREE_PREFERRED_CANDIDATE_ID,
        provider: "qualquer-cloud-ficticio",
        reason: "cost_blocked_promotional",
      },
    ]);
  });

  it("resolucao de provider cloud segue fora da allow-list do runtime de texto", () => {
    expect([...TEXT_ROUTER_LOGICAL_PROVIDERS]).toEqual(["ollama"]);
  });
});

describe("Nira Local preservada (14.8)", () => {
  it("runtime padrao continua Nira Local -> ollama-default -> OllamaProvider", () => {
    setOllamaEnv();

    const runtime = createTextChatRuntime();

    expect(runtime.nira.profileId).toBe(NIRA_LOCAL_PROFILE_ID);
    expect(runtime.provider).toBeInstanceOf(OllamaProvider);
    expect(runtime.routing.candidateId).toBe("ollama-default");
    expect(runtime.routing.reason).toBe("selected_by_preference");
    expect(runtime.routing.providerId).toBe("ollama");
  });

  it("candidato pago FORA do escopo da Nira Local nao interfere na selecao", () => {
    setOllamaEnv();

    const runtime = createTextChatRuntime({
      externalCandidates: [
        {
          id: "cloud-pago-fora-do-escopo",
          provider: "outro-cloud-ficticio",
          model: "modelo-ficticio",
          capabilities: ["text"],
          priority: 1,
          enabled: true,
          deployment: "cloud",
          costClass: "paid",
        },
      ],
    });

    // Nira Local so enxerga ollama-default (escopo do perfil): o candidato
    // cloud nem chega a ser avaliado pelo router.
    expect(runtime.provider).toBeInstanceOf(OllamaProvider);
    expect(runtime.routing.candidateId).toBe("ollama-default");
  });

  it("ollama-default declara costClass free explicitamente no registry", () => {
    const registry = createRouterCandidateRegistry({
      ollamaModel: "qwen2.5:latest",
    });
    expect(registry.candidates[0].costClass).toBe("free");
  });
});