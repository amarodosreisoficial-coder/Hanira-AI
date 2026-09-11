import { describe, expect, it } from "vitest";
import {
  ROUTING_TRACE_EVENTS,
  routingRejectionsOf,
  toRoutingTraceLogFields,
} from "../lib/observability/routing-trace";
import { ModelRouterError } from "../lib/ai/router/errors";

describe("Routing trace request-scoped (16.6)", () => {
  it("vocabulario fechado de eventos", () => {
    expect(ROUTING_TRACE_EVENTS).toEqual([
      "routing_started",
      "candidate_considered",
      "candidate_selected",
      "candidate_failed",
      "fallback_selected",
      "routing_exhausted",
    ]);
  });

  it("allow-list: apenas chaves escalares conhecidas atravessam", () => {
    const fields = toRoutingTraceLogFields({
      niraProfileId: "nira-cloud-free",
      candidateId: "nira-cloud-free-default",
      provider: "groq",
      model: "openai/gpt-oss-20b",
      costClass: "free",
      lifecycle: "production",
      reason: "selected_by_preference",
      attemptNumber: 1,
      durationMs: 12,
    });
    expect(fields).toEqual({
      niraProfileId: "nira-cloud-free",
      candidateId: "nira-cloud-free-default",
      provider: "groq",
      model: "openai/gpt-oss-20b",
      costClass: "free",
      lifecycle: "production",
      reason: "selected_by_preference",
      attemptNumber: 1,
      durationMs: 12,
    });
  });

  it("segredos, prompts e chaves estranhas NUNCA atravessam (allow-list fechada)", () => {
    const fields = toRoutingTraceLogFields({
      prompt: "conteudo privado",
      apiKey: "gsk_secret",
      authorization: "Bearer x",
      cookie: "session=x",
      supabaseSecret: "service-role",
      candidateId: "nira-cloud-free-default",
    } as never);
    expect(fields).toEqual({ candidateId: "nira-cloud-free-default" });
  });

  it("valores nao escalares definidos sao ignorados", () => {
    const fields = toRoutingTraceLogFields({
      candidateId: "cand",
      attemptNumber: Number.NaN,
    } as never);
    expect(fields).toEqual({ candidateId: "cand" });
  });

  it("extrai apenas candidateId/provider/reason das rejeicoes estruturadas", () => {
    const error = new ModelRouterError({
      code: "no_eligible_candidate",
      message: "Nenhum candidato elegivel para a capability solicitada.",
      metadata: {
        requestedCapability: "text",
        rejected: [
          {
            candidateId: "cand-1",
            provider: "groq",
            reason: "cost_blocked_paid",
          },
          { candidateId: "cand-2", provider: "groq", reason: "capacity_cooldown" },
        ],
      },
    });
    expect(routingRejectionsOf(error)).toEqual([
      { candidateId: "cand-1", provider: "groq", reason: "cost_blocked_paid" },
      { candidateId: "cand-2", provider: "groq", reason: "capacity_cooldown" },
    ]);
  });

  it("erros sem metadata/rejected retornam lista vazia (nunca dados brutos)", () => {
    expect(routingRejectionsOf(new Error("x"))).toEqual([]);
    expect(routingRejectionsOf(null)).toEqual([]);
    expect(
      routingRejectionsOf(
        new ModelRouterError({ code: "invalid_request", message: "x" }),
      ),
    ).toEqual([]);
  });
});
