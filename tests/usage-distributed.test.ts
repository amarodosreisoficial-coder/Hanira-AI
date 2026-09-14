import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const verifyCapacity = readFileSync(new URL("../scripts/verify-capacity.mjs", import.meta.url), "utf8");

const migration = readFileSync(new URL("../supabase/migrations/009_distributed_daily_usage.sql", import.meta.url), "utf8");
const imageRoute = readFileSync(new URL("../app/api/image/route.ts", import.meta.url), "utf8");
const usageRoute = readFileSync(new URL("../app/api/usage/route.ts", import.meta.url), "utf8");

describe("package 17.5 invariants", () => {
  it("migration 009 cria contador distribuido atomico local-only", () => {
    expect(migration).toContain("LOCAL ONLY / NOT APPLIED REMOTELY");
    expect(migration).toContain("create table if not exists public.daily_usage");
    expect(migration).toContain("consume_daily_usage");
    expect(migration).toContain("for update");
    expect(migration).toContain("daily_usage_own_data");
    expect(migration).toContain("grant execute");
    expect(migration).toContain("service_role");
    expect(migration.toLowerCase()).not.toContain("drop table");
  });

  it("resposta publica de imagem nao expoe provider/model/mock/duration", () => {
    expect(imageRoute).not.toContain("providerId: result.providerId");
    expect(imageRoute).not.toContain("modelId: result.modelId");
    expect(imageRoute).not.toContain("mock: result.mock");
    expect(imageRoute).not.toContain("durationMs: result.durationMs");
    expect(imageRoute).toContain("consumeDailyUsage");
    expect(imageRoute).toContain('kind: "image"');
  });

  it("chat usa guard distribuido de texto", () => {
    const chatRoute = readFileSync(new URL("../app/api/chat/route.ts", import.meta.url), "utf8");
    expect(chatRoute).toContain("consumeDailyUsage");
    expect(chatRoute).toContain('kind: "text"');
  });

  it("GET /api/usage existe sem segredos", () => {
    expect(usageRoute).toContain("getDailyUsageSnapshot");
    expect(usageRoute.toLowerCase()).not.toContain("service_role");
    expect(usageRoute.toLowerCase()).not.toContain("providerid");
  });

  it("verify:capacity cobre o limite diario de imagem", () => {
    expect(verifyCapacity).toContain("HANIRA_IMAGE_DAILY_LIMIT");
  });
});
