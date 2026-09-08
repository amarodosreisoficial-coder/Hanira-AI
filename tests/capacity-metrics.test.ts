import { afterEach, describe, expect, it } from "vitest";
import {
  getCapacityMetricsSnapshot,
  recordCapacityEvent,
  resetCapacityMetricsForTests,
  type CapacityMetricOutcome,
} from "../lib/observability/capacity-metrics";
import {
  recordCandidateFailure,
  resetCapacityStateForTests,
} from "../lib/ai/capacity/capacity-state";

afterEach(() => {
  resetCapacityMetricsForTests();
  resetCapacityStateForTests();
});

describe("observabilidade basica de capacidade (16.5)", () => {
  it("contadores agregados por outcome", () => {
    recordCapacityEvent({
      outcome: "selected",
      candidateId: "cand-1",
      providerId: "groq",
      modelId: "m1",
    });
    recordCapacityEvent({ outcome: "success", candidateId: "cand-1" });
    recordCapacityEvent({
      outcome: "failure",
      candidateId: "cand-1",
      errorCode: "provider_error",
    });
    recordCapacityEvent({
      outcome: "rate_limited",
      candidateId: "cand-1",
      errorCode: "rate_limit",
    });
    recordCapacityEvent({ outcome: "capacity_unavailable_response" });
    recordCapacityEvent({ outcome: "quota_limited_response" });

    const snapshot = getCapacityMetricsSnapshot();
    expect(snapshot.totals).toEqual({
      selected: 1,
      success: 1,
      failure: 1,
      rateLimited: 1,
      capacityUnavailableResponses: 1,
      quotaLimitedResponses: 1,
    });
  });

  it("metricas por candidato ordenadas e com ultimo sinal", () => {
    recordCapacityEvent({ outcome: "selected", candidateId: "cand-b" });
    recordCapacityEvent({ outcome: "selected", candidateId: "cand-a" });

    const snapshot = getCapacityMetricsSnapshot();
    expect(snapshot.candidates.map((entry) => entry.candidateId)).toEqual([
      "cand-a",
      "cand-b",
    ]);
    expect(snapshot.candidates[0].selected).toBe(1);
    expect(snapshot.candidates[1].selected).toBe(1);
    expect(snapshot.candidates[0].lastOutcome).toBe("selected");
    expect(snapshot.candidates[0].lastSignalAtMs).toBeGreaterThan(0);
  });

  it("snapshot nao contem segredos", () => {
    recordCapacityEvent({
      outcome: "selected",
      candidateId: "cand-1",
      errorCode: "rate_limit",
    });
    const serialized = JSON.stringify(getCapacityMetricsSnapshot());
    expect(serialized).not.toMatch(
      /api[_-]?key|secret|password|bearer|sk-|gsk_/i,
    );
  });

  it("capacityState reflete cooldown ativo", () => {
    recordCandidateFailure("cand-1", { code: "rate_limit" });
    const snapshot = getCapacityMetricsSnapshot();
    expect(snapshot.capacityState).toHaveLength(1);
    expect(snapshot.capacityState[0].state).toBe("rate_limited");
    expect(snapshot.capacityState[0].cooldownRemainingMs).toBeGreaterThan(0);
  });

  it("outcome invalido falha alto (fail-closed)", () => {
    expect(() =>
      recordCapacityEvent({ outcome: "desconhecido" as CapacityMetricOutcome }),
    ).toThrowError(/Outcome de capacidade desconhecido/);
  });

  it("reset limpa totais e candidatos", () => {
    recordCapacityEvent({ outcome: "selected", candidateId: "cand-1" });
    resetCapacityMetricsForTests();
    const snapshot = getCapacityMetricsSnapshot();
    expect(snapshot.totals.selected).toBe(0);
    expect(snapshot.candidates).toHaveLength(0);
  });

  it("generatedAt deterministico com clock injetado", () => {
    const instant = Date.UTC(2026, 0, 1, 12);
    expect(getCapacityMetricsSnapshot(instant).generatedAt).toBe(
      new Date(instant).toISOString(),
    );
  });
});