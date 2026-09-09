import { describe, expect, it } from "vitest";
import { validateCapacityConfig } from "../scripts/verify-capacity.mjs";

const base = {
  HANIRA_USER_DAILY_MESSAGE_LIMIT: "200",
  HANIRA_CONCURRENCY_MAX_PER_USER: "1",
  HANIRA_CAPACITY_RATE_LIMIT_COOLDOWN_MS: "60000",
  HANIRA_CAPACITY_UNHEALTHY_COOLDOWN_MS: "30000",
  HANIRA_DEMO_MODE: "false",
  AI_ENGINE_OLLAMA_ENABLED: "false",
};

describe("verify:capacity (16.5)", () => {
  it("acepta configuracion minima valida sin secretos", () => {
    const result = validateCapacityConfig({ values: base });
    expect(result.hasErrors).toBe(false);
  });

  it("usa predeterminados cuando las env de limites estan ausentes", () => {
    const result = validateCapacityConfig({ values: { HANIRA_DEMO_MODE: "false" } });
    expect(result.hasErrors).toBe(false);
  });

  it("rechaza limite de concurrencia fuera de rango", () => {
    const result = validateCapacityConfig({
      values: { ...base, HANIRA_CONCURRENCY_MAX_PER_USER: "50" },
    });
    expect(result.hasErrors).toBe(true);
  });

  it("rechaza valor no numerico en cooldown", () => {
    const result = validateCapacityConfig({
      values: { ...base, HANIRA_CAPACITY_RATE_LIMIT_COOLDOWN_MS: "abc" },
    });
    expect(result.hasErrors).toBe(true);
  });

  it("acepta JSON valido de candidatos free con provider auditado", () => {
    const candidates = JSON.stringify([
      { id: "nira-cloud-free-secondary-1", model: "qwen-2.5-32b", provider: "groq" },
    ]);
    const result = validateCapacityConfig({ values: { ...base, HANIRA_FREE_TEXT_CANDIDATES: candidates } });
    expect(result.hasErrors).toBe(false);
  });

  it("rechaza candidato free con provider no auditado", () => {
    const candidates = JSON.stringify([
      { id: "x", model: "m", provider: "openai" },
    ]);
    const result = validateCapacityConfig({ values: { ...base, HANIRA_FREE_TEXT_CANDIDATES: candidates } });
    expect(result.hasErrors).toBe(true);
  });

  it("rechaza JSON invalido en candidatos free", () => {
    const result = validateCapacityConfig({
      values: { ...base, HANIRA_FREE_TEXT_CANDIDATES: "not json" },
    });
    expect(result.hasErrors).toBe(true);
  });

  it("rechaza presencia de env de fallback pago sin revelar el valor", () => {
    const secret = "super-secret-billing-value";
    const result = validateCapacityConfig({
      values: { ...base, HANIRA_ENABLE_PAID_FALLBACK: secret },
    });
    expect(result.hasErrors).toBe(true);
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it("detecta env boolean invalida", () => {
    const result = validateCapacityConfig({
      values: { ...base, AI_ENGINE_OLLAMA_ENABLED: "yes" },
    });
    expect(result.hasErrors).toBe(true);
  });
});