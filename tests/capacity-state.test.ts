import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CAPACITY_COOLDOWN_LIMITS,
  capacityStateSizeForTests,
  getAvailabilityGate,
  getCapacityStateSnapshot,
  recordCandidateFailure,
  recordCandidateSuccess,
  resetCapacityStateForTests,
} from "../lib/ai/capacity/capacity-state";
import { ROUTER_REJECTION_REASONS } from "../lib/ai/router/types";
import { ModelRouterError } from "../lib/ai/router/errors";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  resetCapacityStateForTests();
});

describe("Nira Capacity Engine - estado por candidato (16.5)", () => {
  it("o vocabulario de rejeicao do router inclui capacity_cooldown", () => {
    expect(ROUTER_REJECTION_REASONS).toContain("capacity_cooldown");
  });

  it("candidato sem sinal esta disponivel", () => {
    const gate = getAvailabilityGate("nira-cloud-free-default");
    expect(gate.available).toBe(true);
    expect(gate.state).toBe("available");
    expect(gate.retryInMs).toBe(0);
    expect(capacityStateSizeForTests()).toBe(0);
  });

  it("rate_limit coloca o candidato em rate_limited com cooldown", () => {
    recordCandidateFailure("cand-a", { code: "rate_limit" });
    const gate = getAvailabilityGate("cand-a");
    expect(gate.available).toBe(false);
    expect(gate.state).toBe("rate_limited");
    expect(gate.retryInMs).toBeGreaterThan(0);
  });

  it("erro transiente retryable coloca o candidato em unhealthy", () => {
    recordCandidateFailure("cand-b", { code: "unavailable", retryable: true });
    const gate = getAvailabilityGate("cand-b");
    expect(gate.available).toBe(false);
    expect(gate.state).toBe("unhealthy");
  });

  it("timeout e provider_error sao transientes; invalid_request e model_not_found nao geram cooldown", () => {
    recordCandidateFailure("cand-c", { code: "timeout" });
    expect(getAvailabilityGate("cand-c").available).toBe(false);

    recordCandidateFailure("cand-d", {
      code: "invalid_request",
      retryable: false,
    });
    expect(getAvailabilityGate("cand-d").available).toBe(true);

    recordCandidateFailure("cand-e", { code: "model_not_found" });
    expect(getAvailabilityGate("cand-e").available).toBe(true);

    const codes = getCapacityStateSnapshot().map(
      (entry) => entry.lastErrorCode,
    );
    expect(codes).toContain("invalid_request");
    expect(codes).toContain("model_not_found");
  });

  it("erro transiente com retryable false NAO gera cooldown", () => {
    recordCandidateFailure("cand-f", { code: "unavailable", retryable: false });
    expect(getAvailabilityGate("cand-f").available).toBe(true);
  });

  it("sucesso limpa o cooldown", () => {
    recordCandidateFailure("cand-g", { code: "rate_limit" });
    expect(getAvailabilityGate("cand-g").available).toBe(false);
    recordCandidateSuccess("cand-g");
    const gate = getAvailabilityGate("cand-g");
    expect(gate.available).toBe(true);
    expect(gate.state).toBe("available");
    expect(gate.retryInMs).toBe(0);
  });

  it("cooldown expira deterministicamente (relogio injetado)", () => {
    const now = Date.UTC(2026, 0, 1, 12);
    recordCandidateFailure("cand-h", { code: "rate_limit" });
    // O cooldown usa Date.now() interno; para teste deterministico comparamos
    // apenas fronteiras com o clock real via fake timers abaixo.
    vi.useFakeTimers();
    vi.setSystemTime(now);
    recordCandidateFailure("cand-h2", { code: "rate_limit" });
    expect(getAvailabilityGate("cand-h2", now + 1).available).toBe(false);
    expect(
      getAvailabilityGate(
        "cand-h2",
        now + CAPACITY_COOLDOWN_LIMITS.rateLimit.fallback + 1,
      ).available,
    ).toBe(true);
    vi.useRealTimers();
  });

  it("cooldown transiente ativo nao e apagado por sinal deterministico posterior", () => {
    vi.useFakeTimers();
    const now = Date.UTC(2026, 0, 1, 12);
    vi.setSystemTime(now);
    recordCandidateFailure("cand-i", { code: "rate_limit" });
    recordCandidateFailure("cand-i", {
      code: "invalid_request",
      retryable: false,
    });
    expect(getAvailabilityGate("cand-i", now + 1).available).toBe(false);
    vi.useRealTimers();
  });

  it("cooldown unhealthy configuravel por env (fail-closed em env invalida)", () => {
    process.env.HANIRA_CAPACITY_UNHEALTHY_COOLDOWN_MS = "not-a-number";
    expect(() =>
      recordCandidateFailure("cand-j", { code: "provider_error" }),
    ).toThrowError(ModelRouterError);

    process.env.HANIRA_CAPACITY_UNHEALTHY_COOLDOWN_MS = "4000";
    vi.useFakeTimers();
    const now = Date.UTC(2026, 0, 1, 12);
    vi.setSystemTime(now);
    recordCandidateFailure("cand-k", { code: "provider_error" });
    expect(getAvailabilityGate("cand-k", now + 3999).available).toBe(false);
    expect(getAvailabilityGate("cand-k", now + 4001).available).toBe(true);
    vi.useRealTimers();
  });

  it("cooldown de rate limit configuravel por env", () => {
    process.env.HANIRA_CAPACITY_RATE_LIMIT_COOLDOWN_MS = "2000";
    vi.useFakeTimers();
    const now = Date.UTC(2026, 0, 1, 12);
    vi.setSystemTime(now);
    recordCandidateFailure("cand-l", { code: "rate_limit" });
    expect(getAvailabilityGate("cand-l", now + 1999).available).toBe(false);
    expect(getAvailabilityGate("cand-l", now + 2001).available).toBe(true);
    vi.useRealTimers();
  });

  it("snapshot seguro: ordenado, estados derivados, sem segredos", () => {
    recordCandidateFailure("cand-z", { code: "rate_limit" });
    recordCandidateFailure("cand-a", { code: "provider_error" });
    const snapshot = getCapacityStateSnapshot();
    const ids = snapshot.map((entry) => entry.candidateId);
    expect(ids).toEqual([...ids].sort());
    const states = new Set(snapshot.map((entry) => entry.state));
    expect(states.has("rate_limited")).toBe(true);
    expect(states.has("unhealthy")).toBe(true);
    expect(JSON.stringify(snapshot)).not.toMatch(
      /api[_-]?key|secret|password|bearer|sk-/i,
    );
  });
});