import { afterEach, describe, expect, it } from "vitest";
import {
  UsageGuardUnavailableError,
  consumeDailyUsage,
  nextUtcResetIso,
  peekDailyUsage,
  peekMemoryUsage,
  resetUsageGuardForTests,
} from "../lib/security/usage-guard";
import { USER_DAILY_IMAGE_LIMIT_ENV, USER_DAILY_MESSAGE_LIMIT_ENV } from "../lib/security/usage-limits";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  resetUsageGuardForTests();
});

describe("usage guard 17.5.1 fallback", () => {
  it("sem client usa memoria e degrada", async () => {
    process.env[USER_DAILY_MESSAGE_LIMIT_ENV] = "2";
    const first = await consumeDailyUsage({ userId: "u1", kind: "text", supabase: null });
    expect(first.allowed).toBe(true);
    expect(first.source).toBe("memory");
    expect(first.degraded).toBe(true);
    await consumeDailyUsage({ userId: "u1", kind: "text", supabase: null });
    const blocked = await consumeDailyUsage({ userId: "u1", kind: "text", supabase: null });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("kinds sao independentes", async () => {
    process.env[USER_DAILY_MESSAGE_LIMIT_ENV] = "1";
    process.env[USER_DAILY_IMAGE_LIMIT_ENV] = "1";
    await consumeDailyUsage({ userId: "u2", kind: "text", supabase: null });
    expect((await consumeDailyUsage({ userId: "u2", kind: "image", supabase: null })).allowed).toBe(true);
    expect((await consumeDailyUsage({ userId: "u2", kind: "text", supabase: null })).allowed).toBe(false);
  });

  it("limite 0 desativa sem consumo", async () => {
    process.env[USER_DAILY_IMAGE_LIMIT_ENV] = "0";
    const decision = await consumeDailyUsage({ userId: "u3", kind: "image", supabase: null });
    expect(decision.allowed).toBe(true);
    expect(decision.source).toBe("disabled");
    expect(decision.remaining).toBeNull();
  });

  it("migration ausente faz fallback em memoria", async () => {
    process.env[USER_DAILY_MESSAGE_LIMIT_ENV] = "1";
    const missing = { rpc: async () => ({ data: null, error: { code: "42883", message: "function consume_daily_usage does not exist" } }) };
    const decision = await consumeDailyUsage({ userId: "u4", kind: "text", supabase: missing as never });
    expect(decision.allowed).toBe(true);
    expect(decision.source).toBe("memory");
    expect(decision.degraded).toBe(true);
  });

  it("rpc distribuido permitido e bloqueado", async () => {
    process.env[USER_DAILY_MESSAGE_LIMIT_ENV] = "2";
    const ok = { rpc: async () => ({ data: [{ allowed: true, used: 1, remaining: 1, retry_after_seconds: 0, usage_day: "2026-09-14" }], error: null }) };
    const allowed = await consumeDailyUsage({ userId: "u5", kind: "text", supabase: ok as never });
    expect(allowed.source).toBe("distributed");
    expect(allowed.remaining).toBe(1);
    const denied = { rpc: async () => ({ data: [{ allowed: false, used: 2, remaining: 0, retry_after_seconds: 60, usage_day: "2026-09-14" }], error: null }) };
    const blocked = await consumeDailyUsage({ userId: "u5", kind: "text", supabase: denied as never });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(60);
  });

  it("erro inesperado e fail-closed negando", async () => {
    const broken = { rpc: async () => { throw new Error("rede"); } };
    const decision = await consumeDailyUsage({ userId: "u6", kind: "text", supabase: broken as never });
    expect(decision.allowed).toBe(false);
    expect(decision.degraded).toBe(true);
  });

  it("peek sem client retorna contagens reais locais", async () => {
    process.env[USER_DAILY_MESSAGE_LIMIT_ENV] = "200";
    process.env[USER_DAILY_IMAGE_LIMIT_ENV] = "10";
    await consumeDailyUsage({ userId: "u7", kind: "text", supabase: null });
    await consumeDailyUsage({ userId: "u7", kind: "text", supabase: null });
    await consumeDailyUsage({ userId: "u7", kind: "image", supabase: null });
    const peek = await peekDailyUsage({ userId: "u7", supabase: null });
    expect(peek.textUsed).toBe(2);
    expect(peek.imageUsed).toBe(1);
    expect(peek.degraded).toBe(true);
    expect(peekMemoryUsage("u7")).toMatchObject({ textUsed: 2, imageUsed: 1 });
  });

  it("migration ausente no peek usa contagens locais", async () => {
    process.env[USER_DAILY_MESSAGE_LIMIT_ENV] = "200";
    await consumeDailyUsage({ userId: "u8", kind: "text", supabase: null });
    const missing = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: { code: "42P01", message: 'relation "daily_usage" does not exist' } }),
            }),
          }),
        }),
      }),
    };
    const peek = await peekDailyUsage({ userId: "u8", supabase: missing as never });
    expect(peek.textUsed).toBe(1);
    expect(peek.degraded).toBe(true);
  });

  it("erro inesperado no peek nao fabrica zero", async () => {
    const denied = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: { code: "42501", message: "permission denied for table daily_usage" } }),
            }),
          }),
        }),
      }),
    };
    await expect(peekDailyUsage({ userId: "u9", supabase: denied as never })).rejects.toBeInstanceOf(UsageGuardUnavailableError);
  });

  it("resetAt e ISO valido do proximo dia UTC", () => {
    const resetAt = nextUtcResetIso(Date.UTC(2026, 8, 14, 20, 0, 0));
    expect(resetAt).toBe("2026-09-15T00:00:00.000Z");
    expect(Number.isFinite(Date.parse(resetAt))).toBe(true);
  });
});
