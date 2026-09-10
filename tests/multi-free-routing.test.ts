import { afterEach, describe, expect, it, vi } from "vitest";
import { ModelRouterError } from "../lib/ai/router/errors";
import { createTextChatRuntime } from "../lib/ai/runtime";
import {
  NIRA_CLOUD_FREE_PREFERRED_CANDIDATE_ID,
  NIRA_CLOUD_FREE_PROFILE_ID,
} from "../lib/ai/nira/profiles";
import {
  DEPRECATED_GROQ_MODELS,
  GROQ_FREE_SECONDARY_CANDIDATE_ID,
  GROQ_FREE_SECONDARY_MODEL,
} from "../lib/ai/capacity/groq-free-candidates";
import {
  FREE_EXTRA_CANDIDATES_ENV,
  PREVIEW_MODELS_ENV,
  SECONDARY_ENABLED_ENV,
} from "../lib/ai/capacity/free-capacity-registry";
import {
  getAvailabilityGate,
  recordCandidateFailure,
  resetCapacityStateForTests,
} from "../lib/ai/capacity/capacity-state";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  resetCapacityStateForTests();
});

function setBaselineEnv(): void {
  // Baseline 16.6: apenas GROQ_API_KEY configurada. GROQ_MODEL ausente usa o
  // default tecnico auditado (openai/gpt-oss-20b). Nenhum JSON obrigatorio.
  process.env.GROQ_API_KEY = "gsk_test_key";
  process.env.GROQ_MODEL = "";
  process.env.AI_ENGINE_OLLAMA_ENABLED = "false";
  delete process.env[FREE_EXTRA_CANDIDATES_ENV];
  delete process.env[SECONDARY_ENABLED_ENV];
  delete process.env[PREVIEW_MODELS_ENV];
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

describe("Groq Multi-Free / Free Capacity Engine (16.6)", () => {
  it("baseline sem candidate JSON: primario 20B selecionado e cadeia de producao completa", () => {
    setBaselineEnv();
    const runtime = createTextChatRuntime();
    expect(runtime.model).toBe("openai/gpt-oss-20b");
    expect(runtime.routing.candidateId).toBe(
      NIRA_CLOUD_FREE_PREFERRED_CANDIDATE_ID,
    );
    expect(runtime.routing.reason).toBe("selected_by_preference");
    expect(runtime.nira.profileId).toBe(NIRA_CLOUD_FREE_PROFILE_ID);
  });

  it("20B rate-limited -> 120B (secundario free DE PRODUCAO) por prioridade deterministica", () => {
    setBaselineEnv();
    recordCandidateFailure(NIRA_CLOUD_FREE_PREFERRED_CANDIDATE_ID, {
      code: "rate_limit",
    });
    const runtime = createTextChatRuntime();
    expect(runtime.routing.candidateId).toBe(GROQ_FREE_SECONDARY_CANDIDATE_ID);
    expect(runtime.model).toBe(GROQ_FREE_SECONDARY_MODEL);
  });

  it("20B em cooldown NAO marca 120B como indisponivel (saude por candidato)", () => {
    setBaselineEnv();
    recordCandidateFailure(NIRA_CLOUD_FREE_PREFERRED_CANDIDATE_ID, {
      code: "rate_limit",
    });
    expect(getAvailabilityGate(GROQ_FREE_SECONDARY_CANDIDATE_ID).available).toBe(
      true,
    );
    expect(
      getAvailabilityGate(NIRA_CLOUD_FREE_PREFERRED_CANDIDATE_ID).available,
    ).toBe(false);
  });

  it("20B e 120B indisponiveis -> EXTRA free elegivel; todos indisponiveis -> capacity_unavailable (sem fallback pago)", () => {
    setBaselineEnv();
    process.env[FREE_EXTRA_CANDIDATES_ENV] = JSON.stringify([
      {
        id: "nira-cloud-free-secondary-2",
        model: "modelo-extra-free-auditado",
      },
    ]);
    recordCandidateFailure(NIRA_CLOUD_FREE_PREFERRED_CANDIDATE_ID, {
      code: "rate_limit",
    });
    recordCandidateFailure(GROQ_FREE_SECONDARY_CANDIDATE_ID, {
      code: "unavailable",
    });

    const runtime = createTextChatRuntime();
    expect(runtime.routing.candidateId).toBe("nira-cloud-free-secondary-2");

    recordCandidateFailure("nira-cloud-free-secondary-2", {
      code: "timeout",
    });
    const error = capacityErrorOf(() => createTextChatRuntime());
    expect(error.code).toBe("capacity_unavailable");
    expect(error.metadata?.niraProfileId).toBe(NIRA_CLOUD_FREE_PROFILE_ID);
    // Nenhum candidato pago/promocional/unknown aparece no esgotamento: a
    // cadeia e SOMENTE free (fallback free -> free, NUNCA free -> pago).
    const reasons = (error.metadata?.rejected ?? []).map(
      (rejection) => rejection.reason,
    );
    expect(new Set(reasons)).toEqual(new Set(["capacity_cooldown"]));
  });

  it("cooldown expira deterministicamente e restaura o candidato (sem loop infinito)", () => {
    vi.useFakeTimers();
    const now = Date.UTC(2026, 0, 1, 12);
    vi.setSystemTime(now);
    setBaselineEnv();
    recordCandidateFailure(NIRA_CLOUD_FREE_PREFERRED_CANDIDATE_ID, {
      code: "rate_limit",
    });

    expect(createTextChatRuntime().routing.candidateId).toBe(
      GROQ_FREE_SECONDARY_CANDIDATE_ID,
    );
    vi.advanceTimersByTime(60_000 + 1);
    const restored = createTextChatRuntime();
    expect(restored.routing.candidateId).toBe(
      NIRA_CLOUD_FREE_PREFERRED_CANDIDATE_ID,
    );
    expect(restored.routing.reason).toBe("selected_by_preference");
    vi.useRealTimers();
  });

  it("GROQ_MODEL explicito e respeitado como primario; 120B explicito nao duplica o secundario (mesmo engine)", () => {
    setBaselineEnv();
    process.env.GROQ_MODEL = "openai/gpt-oss-120b";
    const runtime = createTextChatRuntime();
    expect(runtime.model).toBe("openai/gpt-oss-120b");
    expect(runtime.routing.candidateId).toBe(
      NIRA_CLOUD_FREE_PREFERRED_CANDIDATE_ID,
    );
    expect(runtime.routing.reason).toBe("selected_by_preference");

    // Primario em cooldown: sem duplicacao de engine, o router cai de forma
    // estruturada (nenhum candidato duplicado com o mesmo modelo).
    recordCandidateFailure(NIRA_CLOUD_FREE_PREFERRED_CANDIDATE_ID, {
      code: "rate_limit",
    });
    const error = capacityErrorOf(() => createTextChatRuntime());
    expect(error.code).toBe("capacity_unavailable");
  });

  it("GROQ_MODEL aposentado (deprecated) falha de forma deterministica (fail-closed)", () => {
    for (const deprecatedModel of DEPRECATED_GROQ_MODELS) {
      setBaselineEnv();
      process.env.GROQ_MODEL = deprecatedModel;
      const error = capacityErrorOf(() => createTextChatRuntime());
      expect(error.code).toBe("invalid_configuration");
      expect(error.message).toContain("aposentado");
    }
  });

  it("secundario de producao com opt-out por env (HANIRA_FREE_SECONDARY_ENABLED=false)", () => {
    setBaselineEnv();
    process.env[SECONDARY_ENABLED_ENV] = "false";
    const runtime = createTextChatRuntime();
    expect(runtime.model).toBe("openai/gpt-oss-20b");
    expect(runtime.routing.candidateId).toBe(
      NIRA_CLOUD_FREE_PREFERRED_CANDIDATE_ID,
    );

    recordCandidateFailure(NIRA_CLOUD_FREE_PREFERRED_CANDIDATE_ID, {
      code: "rate_limit",
    });
    const error = capacityErrorOf(() => createTextChatRuntime());
    expect(error.code).toBe("capacity_unavailable");
  });

  it("env booleana de politica invalida falha de forma controlada (fail-closed)", () => {
    setBaselineEnv();
    process.env[SECONDARY_ENABLED_ENV] = "nao-e-booleano";
    expect(() => createTextChatRuntime()).toThrowError(ModelRouterError);

    setBaselineEnv();
    process.env[PREVIEW_MODELS_ENV] = "1";
    expect(() => createTextChatRuntime()).toThrowError(ModelRouterError);
  });
});
