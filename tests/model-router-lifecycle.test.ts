import { describe, expect, it } from "vitest";
import {
  DEFAULT_LIFECYCLE_POLICY,
  evaluateRouterCandidateLifecycle,
  ModelRouter,
} from "../lib/ai/router/model-router";
import { ModelRouterError } from "../lib/ai/router/errors";
import type { RouterCandidate } from "../lib/ai/router/types";

function candidate(
  overrides: Partial<RouterCandidate> = {},
): RouterCandidate {
  return {
    id: "cand-a",
    provider: "groq",
    model: "modelo-free",
    capabilities: ["text"],
    priority: 1,
    enabled: true,
    costClass: "free",
    ...overrides,
  };
}

describe("Gate de lifecycle do ModelRouter (16.6)", () => {
  it("evaluate: sem lifecycle = production (compatibilidade 14.x-16.5)", () => {
    expect(
      evaluateRouterCandidateLifecycle(candidate()),
    ).toEqual({ eligible: true });
  });

  it("evaluate: preview bloqueado sem opt-in; elegivel COM opt-in explicito", () => {
    const preview = candidate({ lifecycle: "preview" });
    expect(
      evaluateRouterCandidateLifecycle(preview, {
        allowPreviewModels: false,
      }),
    ).toEqual({ eligible: false, reason: "lifecycle_preview_blocked" });
    expect(
      evaluateRouterCandidateLifecycle(preview, {
        allowPreviewModels: true,
      }),
    ).toEqual({ eligible: true });
  });

  it("evaluate: deprecated e disabled NUNCA elegiveis, com ou sem opt-in", () => {
    for (const allowPreviewModels of [false, true]) {
      const policy = { allowPreviewModels };
      expect(
        evaluateRouterCandidateLifecycle(candidate({ lifecycle: "deprecated" }), policy),
      ).toEqual({ eligible: false, reason: "lifecycle_deprecated" });
      expect(
        evaluateRouterCandidateLifecycle(candidate({ lifecycle: "disabled" }), policy),
      ).toEqual({ eligible: false, reason: "lifecycle_disabled" });
    }
  });

  it("politica default: preview bloqueado (DEFAULT_LIFECYCLE_POLICY)", () => {
    expect(DEFAULT_LIFECYCLE_POLICY.allowPreviewModels).toBe(false);
  });

  it("select: preview e rejeitado por padrao e NUNCA selecionado mesmo sendo o unico candidato", () => {
    const router = new ModelRouter([candidate({ lifecycle: "preview", id: "preview-a" })]);
    const error = (() => {
      try {
        router.select({ capability: "text" });
        throw new Error("deveria ter lancado ModelRouterError");
      } catch (caught) {
        if (!(caught instanceof ModelRouterError)) throw caught;
        return caught;
      }
    })();
    expect(error.code).toBe("no_eligible_candidate");
    expect(error.metadata?.rejected).toEqual([
      {
        candidateId: "preview-a",
        provider: "groq",
        reason: "lifecycle_preview_blocked",
      },
    ]);
  });

  it("select: preview elegivel COM opt-in; deprecated/disabled rejeitados mesmo com opt-in", () => {
    const router = new ModelRouter(
      [
        candidate({ id: "preview-a", lifecycle: "preview", priority: 2 }),
        candidate({ id: "deprecated-a", lifecycle: "deprecated", priority: 3 }),
        candidate({ id: "disabled-a", lifecycle: "disabled", priority: 4 }),
      ],
      { allowPreviewModels: true },
    );
    const decision = router.select({ capability: "text" });
    expect(decision.selected.candidateId).toBe("preview-a");
    expect(
      decision.rejected.map((rejection) => rejection.reason),
    ).toEqual(["lifecycle_deprecated", "lifecycle_disabled"]);
  });

  it("select: candidatos financeiramente inelegiveis continuam bloqueados ANTES do lifecycle (preview pago nao passa)", () => {
    const router = new ModelRouter(
      [
        candidate({ id: "preview-pago", lifecycle: "preview", costClass: "paid" }),
        candidate({ id: "preview-promo", lifecycle: "preview", costClass: "promotional" }),
        candidate({ id: "preview-sem-classificacao", lifecycle: "preview", costClass: undefined }),
      ],
      { allowPreviewModels: true },
    );
    const error = (() => {
      try {
        router.select({ capability: "text" });
        throw new Error("deveria ter lancado ModelRouterError");
      } catch (caught) {
        if (!(caught instanceof ModelRouterError)) throw caught;
        return caught;
      }
    })();
    expect(error.metadata?.rejected).toEqual([
      { candidateId: "preview-pago", provider: "groq", reason: "cost_blocked_paid" },
      {
        candidateId: "preview-promo",
        provider: "groq",
        reason: "cost_blocked_promotional",
      },
      {
        candidateId: "preview-sem-classificacao",
        provider: "groq",
        reason: "cost_class_unknown",
      },
    ]);
  });

  it("constructor: lifecycle invalido falha na construcao; allowPreviewModels nao-booleano falha", () => {
    expect(
      () => new ModelRouter([candidate({ lifecycle: "xxx" as never })]),
    ).toThrowError(ModelRouterError);
    expect(
      () =>
        new ModelRouter([candidate()], {
          allowPreviewModels: "true" as never,
        }),
    ).toThrowError(ModelRouterError);
  });
});
