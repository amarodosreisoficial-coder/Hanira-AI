import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { consumeDailyUsage, resetUsageGuardForTests, usageGuardEntriesForTests } from "../lib/security/usage-guard";
import { USER_DAILY_IMAGE_LIMIT_ENV, USER_DAILY_MESSAGE_LIMIT_ENV } from "../lib/security/usage-limits";
import { resetConcurrencyGuardForTests, tryAcquireConcurrencyLock } from "../lib/security/concurrency-guard";

const imageRoute = readFileSync(new URL("../app/api/image/route.ts", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../components/usage/usage-dashboard.tsx", import.meta.url), "utf8");

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  resetUsageGuardForTests();
  resetConcurrencyGuardForTests();
  vi.unstubAllEnvs();
});

describe("usage ordering 17.5.1", () => {
  it("rejeicao de concorrencia de imagem nao consome quota", () => {
    process.env[USER_DAILY_IMAGE_LIMIT_ENV] = "10";
    const userId = "img-user";
    expect(tryAcquireConcurrencyLock(userId, "image:req-active")).toBe(true);
    expect(tryAcquireConcurrencyLock(userId, "image:req-second")).toBe(false);
    expect(usageGuardEntriesForTests()).toBe(0);
  });

  it("requisicao ativa de texto: segunda rejeitada, contador inalterado", async () => {
    process.env[USER_DAILY_MESSAGE_LIMIT_ENV] = "200";
    const userId = "text-user";
    expect(tryAcquireConcurrencyLock(userId, "req-active")).toBe(true);
    expect(tryAcquireConcurrencyLock(userId, "req-second")).toBe(false);
    const decision = await consumeDailyUsage({ userId: "other-user", kind: "text", supabase: null });
    expect(decision.allowed).toBe(true);
    expect(usageGuardEntriesForTests()).toBe(1);
  });

  it("request invalido de imagem nao consome quota nem chama provider (ordem)", () => {
    const validateAt = imageRoute.indexOf("validateImageRequest(await request.json())");
    const quotaConsumeAt = imageRoute.indexOf("kind: \"image\", supabase:");
    const quotaImportAt = imageRoute.indexOf("consumeDailyUsage");
    const providerAt = imageRoute.indexOf("createProductionImageRouter().execute");
    expect(validateAt).toBeGreaterThan(-1);
    expect(quotaImportAt).toBeGreaterThan(-1);
    expect(quotaConsumeAt).toBeGreaterThan(validateAt);
    expect(providerAt).toBeGreaterThan(quotaConsumeAt);
  });

  it("dashboard sem copy tecnica e com reset", () => {
    expect(dashboard).toContain("Limite diário desativado");
    expect(dashboard).toContain("Uso da Hanira");
    expect(dashboard).toContain("resetAt");
    expect(dashboard).not.toContain("ilimitado");
    expect(dashboard).not.toContain("modo local");
  });
});