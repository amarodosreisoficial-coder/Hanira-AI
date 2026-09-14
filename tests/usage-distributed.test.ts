import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const verifyCapacity = readFileSync(new URL("../scripts/verify-capacity.mjs", import.meta.url), "utf8");

const migration = readFileSync(new URL("../supabase/migrations/009_distributed_daily_usage.sql", import.meta.url), "utf8");
const imageRoute = readFileSync(new URL("../app/api/image/route.ts", import.meta.url), "utf8");
const usageRoute = readFileSync(new URL("../app/api/usage/route.ts", import.meta.url), "utf8");
const chatRoute = readFileSync(new URL("../app/api/chat/route.ts", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../components/usage/usage-dashboard.tsx", import.meta.url), "utf8");
const guard = readFileSync(new URL("../lib/security/usage-guard.ts", import.meta.url), "utf8");
const usageService = readFileSync(new URL("../services/usage-service.ts", import.meta.url), "utf8");
const envExample = readFileSync(new URL("../.env.example", import.meta.url), "utf8");

describe("package 17.5.2 invariants", () => {
  it("migration 009: SELECT-only, sem mutacao direta, service_role-only", () => {
    expect(migration).toContain("LOCAL ONLY / NOT APPLIED REMOTELY");
    expect(migration).toContain("create table if not exists public.daily_usage");
    expect(migration).toContain("daily_usage_own_select");
    expect(migration).toContain("for select to authenticated");
    expect(migration).toContain("revoke all on table public.daily_usage from anon, authenticated");
    expect(migration).toContain("grant select on table public.daily_usage to authenticated");
    expect(migration).not.toMatch(/for\s+all\s+on\s+public\.daily_usage/i);
    expect(migration).toContain("consume_daily_usage");
    expect(migration).toContain("for update");
    expect(migration).toContain("revoke all on function public.consume_daily_usage(uuid, text, integer) from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.consume_daily_usage(uuid, text, integer) to service_role");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("public.daily_usage");
    expect(migration).toContain("p_kind");
    expect(migration).toContain("p_limit");
    expect(migration.toLowerCase()).not.toContain("drop table");
    expect(migration).toContain("zero billing");
  });

  it("resposta publica de imagem nao expoe provider/model/mock/duration", () => {
    expect(imageRoute).not.toContain("providerId: result.providerId");
    expect(imageRoute).not.toContain("modelId: result.modelId");
    expect(imageRoute).not.toContain("mock: result.mock");
    expect(imageRoute).not.toContain("durationMs: result.durationMs");
    expect(imageRoute).toContain("consumeDailyUsage");
    expect(imageRoute).toContain('kind: "image"');
  });

  it("imagem valida antes de consumir quota (invalido nao consome, nao chama provider)", () => {
    const validateAt = imageRoute.indexOf("validateImageRequest(await request.json())");
    const consumeAt = imageRoute.indexOf('kind: "image", supabase:');
    const providerAt = imageRoute.indexOf("createProductionImageRouter().execute");
    expect(validateAt).toBeGreaterThan(-1);
    expect(consumeAt).toBeGreaterThan(validateAt);
    expect(providerAt).toBeGreaterThan(consumeAt);
  });

  it("chat: lock antes da quota (concorrencia nao consome)", () => {
    const lockAt = chatRoute.indexOf("tryAcquireConcurrencyLock(userId, requestId)");
    const quotaAt = chatRoute.indexOf('kind: "text"');
    expect(lockAt).toBeGreaterThan(-1);
    expect(quotaAt).toBeGreaterThan(lockAt);
    expect(chatRoute).toContain("releaseLock()");
  });

  it("GET /api/usage com resetAt e indisponibilidade fail-closed", () => {
    expect(usageRoute).toContain("getDailyUsageSnapshot");
    expect(usageRoute).toContain("UsageGuardUnavailableError");
    expect(usageRoute).toContain("503");
    expect(usageRoute.toLowerCase()).not.toContain("service_role");
    expect(usageRoute.toLowerCase()).not.toContain("providerid");
  });

  it("admin client quebrado em producao nao ativa fallback silencioso", () => {
    expect(usageService).toContain("UsageGuardConfigError");
    expect(usageService).toContain("service_role");
    expect(usageService).not.toMatch(/catch\s*\{\s*return null/);
  });

  it("peek distingue migration ausente de falha inesperada", () => {
    expect(guard).toContain("peekMemoryUsage");
    expect(guard).toContain("UsageGuardUnavailableError");
    expect(guard).toContain("isMissingRelationError");
  });

  it("chat indisponivel do guard vira 503 sem chamar provider", () => {
    expect(chatRoute).toContain("UsageGuardUnavailableError");
    expect(chatRoute).toContain("usage_guard_unavailable");
    expect(chatRoute).toContain("A capacidade da Hanira está temporariamente indisponível. Tente novamente em instantes.");
    expect(chatRoute).toContain("status: 503");
    expect(chatRoute).toContain('"Retry-After": "30"');
  });

  it("imagem indisponivel do guard vira 503 sem chamar provider", () => {
    expect(imageRoute).toContain("UsageGuardUnavailableError");
    expect(imageRoute).toContain("usage_guard_unavailable");
    expect(imageRoute).toContain('capacity_unavailable", 503');
    expect(imageRoute).toContain('"30"');
    const guardAt = imageRoute.indexOf("usage_guard_unavailable");
    const providerAt = imageRoute.indexOf("createProductionImageRouter().execute");
    expect(guardAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(providerAt);
  });

  it("SQL usa meia-noite UTC explicita", () => {
    expect(migration).toContain("at time zone 'UTC'");
    expect(migration).toContain("((v_day + 1)::timestamp at time zone 'UTC')");
  });

  it("peek expoe source real distribuido/memoria", () => {
    expect(guard).toContain('source: "distributed" | "memory"');
    expect(usageService).toContain("source: peek.source");
  });

  it("dashboard usa copy de produto com reset e sem termos tecnicos", () => {
    expect(dashboard).toContain("Uso da Hanira");
    expect(dashboard).toContain("Mensagens hoje");
    expect(dashboard).toContain("Imagens hoje");
    expect(dashboard).toContain("Limite diário desativado");
    expect(dashboard).toContain("O acompanhamento diário completo está temporariamente limitado.");
    expect(dashboard).toContain("Intl.DateTimeFormat");
    expect(dashboard).toContain("resetAt");
    expect(dashboard).not.toContain("ilimitado");
    expect(dashboard).not.toContain("modo local");
    expect(dashboard).not.toContain("Supabase");
    expect(dashboard).not.toContain("Postgres");
  });

  it("verify:capacity e env usam o nome canonico de imagem", () => {
    expect(verifyCapacity).toContain("HANIRA_USER_DAILY_IMAGE_LIMIT");
    expect(envExample).toContain("HANIRA_USER_DAILY_IMAGE_LIMIT=");
    expect(envExample).not.toContain("HANIRA_IMAGE_DAILY_LIMIT");
  });
});
