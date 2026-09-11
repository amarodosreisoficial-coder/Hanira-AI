import { afterEach, describe, expect, it, vi } from "vitest";
import { ModelRouterError } from "../lib/ai/router/errors";
import { OllamaProvider } from "../lib/ai/providers/ollama";
import { createTextChatRuntime } from "../lib/ai/runtime";
import {
  NIRA_CLOUD_FREE_PREFERRED_CANDIDATE_ID,
  NIRA_CLOUD_FREE_PROFILE_ID,
} from "../lib/ai/nira/profiles";
import {
  GROQ_FREE_SECONDARY_CANDIDATE_ID,
  GROQ_FREE_SECONDARY_MODEL,
} from "../lib/ai/capacity/groq-free-candidates";
import {
  recordCandidateFailure,
  resetCapacityStateForTests,
} from "../lib/ai/capacity/capacity-state";
import { FREE_EXTRA_CANDIDATES_ENV } from "../lib/ai/capacity/free-capacity-registry";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  resetCapacityStateForTests();
});

function setCloudOnlyEnv(primaryModel: string): void {
  process.env.GROQ_API_KEY = "gsk_test_key";
  process.env.GROQ_MODEL = primaryModel;
  process.env.AI_ENGINE_OLLAMA_ENABLED = "false";
  delete process.env[FREE_EXTRA_CANDIDATES_ENV];
  delete process.env.HANIRA_FREE_SECONDARY_ENABLED;
  delete process.env.HANIRA_ALLOW_PREVIEW_MODELS;
}

// Pacote 16.6: id EXTRA sem colidir com o id do candidato secundario DE
// PRODUCAO embutido (GROQ_FREE_SECONDARY_CANDIDATE_ID = secondary-1).
const EXTRA_CANDIDATE_ID = "nira-cloud-free-secondary-9";

function configureExtraCandidate(): void {
  process.env[FREE_EXTRA_CANDIDATES_ENV] = JSON.stringify([
    { id: EXTRA_CANDIDATE_ID, model: "modelo-secundario-auditado" },
  ]);
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

describe("Nira Capacity Engine - fallback free -> free no runtime (16.5)", () => {
  it("sem env extra e sem cooldown: comportamento identico ao Pacote 16.4", () => {
    setCloudOnlyEnv("modelo-primario-auditado");
    const runtime = createTextChatRuntime();
    expect(runtime.routing.candidateId).toBe(
      NIRA_CLOUD_FREE_PREFERRED_CANDIDATE_ID,
    );
    expect(runtime.model).toBe("modelo-primario-auditado");
    expect(runtime.providerId).toBe("groq");
    expect(runtime.nira.profileId).toBe(NIRA_CLOUD_FREE_PROFILE_ID);
  });

  it("Pacote 16.6: primario em cooldown -> seleciona o secundario free DE PRODUCAO embutido (free -> free)", () => {
    setCloudOnlyEnv("modelo-primario-auditado");
    recordCandidateFailure(NIRA_CLOUD_FREE_PREFERRED_CANDIDATE_ID, {
      code: "rate_limit",
    });

    const runtime = createTextChatRuntime();
    expect(runtime.routing.candidateId).toBe(GROQ_FREE_SECONDARY_CANDIDATE_ID);
    expect(runtime.model).toBe(GROQ_FREE_SECONDARY_MODEL);
    expect(runtime.providerId).toBe("groq");
    // A preferencia do perfil existe, mas esta em cooldown: o router reporta
    // que a selecao caiu para o melhor candidato por prioridade apos a
    // preferencia nao ser elegivel.
    expect(runtime.routing.reason).toBe("selected_after_invalid_preference");
  });

  it("Pacote 16.6: primario + secundario em cooldown -> seleciona o EXTRA free declarado (prioridade deterministica)", () => {
    setCloudOnlyEnv("modelo-primario-auditado");
    configureExtraCandidate();
    recordCandidateFailure(NIRA_CLOUD_FREE_PREFERRED_CANDIDATE_ID, {
      code: "rate_limit",
    });
    recordCandidateFailure(GROQ_FREE_SECONDARY_CANDIDATE_ID, {
      code: "rate_limit",
    });

    const runtime = createTextChatRuntime();
    expect(runtime.routing.candidateId).toBe(EXTRA_CANDIDATE_ID);
    expect(runtime.model).toBe("modelo-secundario-auditado");
    expect(runtime.providerId).toBe("groq");
    expect(runtime.routing.reason).toBe("selected_after_invalid_preference");
  });

  it("todos os candidatos em cooldown -> capacity_unavailable com rejected capacity_cooldown", () => {
    setCloudOnlyEnv("modelo-primario-auditado");
    configureExtraCandidate();
    recordCandidateFailure(NIRA_CLOUD_FREE_PREFERRED_CANDIDATE_ID, {
      code: "rate_limit",
    });
    recordCandidateFailure(GROQ_FREE_SECONDARY_CANDIDATE_ID, {
      code: "rate_limit",
    });
    recordCandidateFailure(EXTRA_CANDIDATE_ID, {
      code: "provider_error",
    });

    const error = capacityErrorOf(() => createTextChatRuntime());
    expect(error.code).toBe("capacity_unavailable");
    expect(error.metadata?.rejected).toEqual([
      {
        candidateId: NIRA_CLOUD_FREE_PREFERRED_CANDIDATE_ID,
        provider: "groq",
        reason: "capacity_cooldown",
      },
      {
        candidateId: GROQ_FREE_SECONDARY_CANDIDATE_ID,
        provider: "groq",
        reason: "capacity_cooldown",
      },
      {
        candidateId: EXTRA_CANDIDATE_ID,
        provider: "groq",
        reason: "capacity_cooldown",
      },
    ]);
  });

  it("nenhum candidato pago entra na cadeia, mesmo com toda a cadeia free em cooldown", () => {
    setCloudOnlyEnv("modelo-primario-auditado");
    configureExtraCandidate();
    recordCandidateFailure(NIRA_CLOUD_FREE_PREFERRED_CANDIDATE_ID, {
      code: "rate_limit",
    });
    recordCandidateFailure(GROQ_FREE_SECONDARY_CANDIDATE_ID, {
      code: "rate_limit",
    });
    recordCandidateFailure(EXTRA_CANDIDATE_ID, {
      code: "rate_limit",
    });

    const error = capacityErrorOf(() =>
      createTextChatRuntime({
        externalCandidates: [
          {
            id: "cloud-pago-fora-do-escopo",
            provider: "groq",
            model: "modelo-pago",
            capabilities: ["text"],
            priority: 1,
            enabled: true,
            deployment: "cloud",
            costClass: "paid",
          },
        ],
      }),
    );
    expect(error.code).toBe("capacity_unavailable");
    const rejectedIds = (error.metadata?.rejected ?? []).map(
      (rejection) => rejection.candidateId,
    );
    expect(rejectedIds).toEqual([
      NIRA_CLOUD_FREE_PREFERRED_CANDIDATE_ID,
      GROQ_FREE_SECONDARY_CANDIDATE_ID,
      EXTRA_CANDIDATE_ID,
    ]);
    expect(rejectedIds).not.toContain("cloud-pago-fora-do-escopo");
  });

  it("cooldown de candidatos cloud NAO afeta o perfil nira-local (escopo isolado)", () => {
    setCloudOnlyEnv("modelo-primario-auditado");
    configureExtraCandidate();
    recordCandidateFailure(NIRA_CLOUD_FREE_PREFERRED_CANDIDATE_ID, {
      code: "rate_limit",
    });
    recordCandidateFailure(GROQ_FREE_SECONDARY_CANDIDATE_ID, {
      code: "rate_limit",
    });

    process.env.AI_ENGINE_OLLAMA_ENABLED = "true";
    process.env.OLLAMA_BASE_URL = "http://127.0.0.1:11434/";
    process.env.OLLAMA_MODEL = "qwen2.5:latest";

    const runtime = createTextChatRuntime({
      niraProfileId: "nira-local",
    });
    expect(runtime.routing.candidateId).toBe("ollama-default");
    expect(runtime.providerId).toBe("ollama");
    expect(runtime.provider).toBeInstanceOf(OllamaProvider);
  });

  it("cooldown expirado: o primario volta a ser selecionado (transicao lazy)", () => {
    vi.useFakeTimers();
    const now = Date.UTC(2026, 0, 1, 12);
    vi.setSystemTime(now);

    setCloudOnlyEnv("modelo-primario-auditado");
    configureExtraCandidate();
    recordCandidateFailure(NIRA_CLOUD_FREE_PREFERRED_CANDIDATE_ID, {
      code: "rate_limit",
    });

    const duringCooldown = createTextChatRuntime();
    expect(duringCooldown.routing.candidateId).toBe(
      GROQ_FREE_SECONDARY_CANDIDATE_ID,
    );

    vi.advanceTimersByTime(60_000 + 1);
    const afterCooldown = createTextChatRuntime();
    expect(afterCooldown.routing.candidateId).toBe(
      NIRA_CLOUD_FREE_PREFERRED_CANDIDATE_ID,
    );
    expect(afterCooldown.routing.reason).toBe("selected_by_preference");
    vi.useRealTimers();
  });

  it("env de extras invalida falha de forma controlada (fail-closed)", () => {
    setCloudOnlyEnv("modelo-primario-auditado");
    process.env[FREE_EXTRA_CANDIDATES_ENV] = "isto nao e json";
    expect(() => createTextChatRuntime()).toThrowError(ModelRouterError);
  });
});