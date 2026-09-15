import { afterEach, describe, expect, it } from "vitest";
import {
  UsageGuardUnavailableError,
  consumeDailyUsage,
  peekDailyUsage,
  resetUsageGuardForTests,
} from "../lib/security/usage-guard";
import { USER_DAILY_MESSAGE_LIMIT_ENV } from "../lib/security/usage-limits";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  resetUsageGuardForTests();
});

type PeekClient = {
  from: (t: string) => {
    select: (c: string) => {
      eq: (col: string, v: unknown) => {
        eq: (col: string, v: unknown) => {
          maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
        };
      };
    };
  };
};

function peekClient(result: Promise<{ data: unknown; error: unknown }>): PeekClient {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: () => result }),
        }),
      }),
    }),
  } as unknown as PeekClient;
}

function rpcClient(result: Promise<{ data: unknown; error: unknown }>) {
  return { rpc: () => result };
}

describe("usage guard failure modes (17.6 — fail-closed)", () => {
  it("peek: linha malformada (text_count invalido) falha fechada", async () => {
    await expect(
      peekDailyUsage({
        userId: "u1",
        supabase: peekClient(Promise.resolve({ data: { text_count: "x", image_count: 1 }, error: null })) as never,
      }),
    ).rejects.toThrow(UsageGuardUnavailableError);
  });

  it("peek: erro de permissao (42501) falha fechada, nao degrada", async () => {
    await expect(
      peekDailyUsage({
        userId: "u1",
        supabase: peekClient(Promise.resolve({ data: null, error: { code: "42501", message: "permission denied" } })) as never,
      }),
    ).rejects.toThrow(UsageGuardUnavailableError);
  });

  it("peek: falha de rede (throw) falha fechada", async () => {
    await expect(
      peekDailyUsage({
        userId: "u1",
        supabase: peekClient(Promise.reject(new Error("network down"))) as never,
      }),
    ).rejects.toThrow(UsageGuardUnavailableError);
  });

  it("peek: relacao ausente (migration nao aplicada) degrada para memoria", async () => {
    const snapshot = await peekDailyUsage({
      userId: "u1",
      supabase: peekClient(Promise.resolve({ data: null, error: { code: "42P01", message: 'relation "public.daily_usage" does not exist' } })) as never,
    });
    expect(snapshot.degraded).toBe(true);
    expect(snapshot.source).toBe("memory");
    expect(snapshot.textUsed).toBe(0);
    expect(snapshot.imageUsed).toBe(0);
  });
});

describe("usage guard consume failures (17.6)", () => {
  it("consume: resposta malformada do RPC falha fechada", async () => {
    process.env[USER_DAILY_MESSAGE_LIMIT_ENV] = "10";
    await expect(
      consumeDailyUsage({ userId: "u1", kind: "text", supabase: rpcClient(Promise.resolve({ data: { weird: true }, error: null })) as never }),
    ).rejects.toThrow(UsageGuardUnavailableError);
  });

  it("consume: erro de permissao do RPC falha fechada", async () => {
    process.env[USER_DAILY_MESSAGE_LIMIT_ENV] = "10";
    await expect(
      consumeDailyUsage({
        userId: "u1",
        kind: "text",
        supabase: rpcClient(Promise.resolve({ data: null, error: { code: "42501", message: "permission denied to execute function" } })) as never,
      }),
    ).rejects.toThrow(UsageGuardUnavailableError);
  });

  it("consume: network failure falha fechada (nunca libera com fallback silencioso)", async () => {
    process.env[USER_DAILY_MESSAGE_LIMIT_ENV] = "10";
    await expect(
      consumeDailyUsage({
        userId: "u1",
        kind: "text",
        supabase: rpcClient(Promise.reject(new Error("fetch failed"))) as never,
      }),
    ).rejects.toThrow(UsageGuardUnavailableError);
  });

  it("consume: timeout (rejeicao tardia) falha fechada", async () => {
    process.env[USER_DAILY_MESSAGE_LIMIT_ENV] = "10";
    await expect(
      consumeDailyUsage({
        userId: "u1",
        kind: "text",
        supabase: rpcClient(new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5))) as never,
      }),
    ).rejects.toThrow(UsageGuardUnavailableError);
  });

  it("consume: allowed=false distribuido NAO degrada e respeita retry_after_seconds", async () => {
    process.env[USER_DAILY_MESSAGE_LIMIT_ENV] = "10";
    const decision = await consumeDailyUsage({
      userId: "u1",
      kind: "text",
      supabase: rpcClient(Promise.resolve({ data: { allowed: false, remaining: 0, retry_after_seconds: 120, usage_day: "2026-09-15" }, error: null })) as never,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.degraded).toBe(false);
    expect(decision.source).toBe("distributed");
    expect(decision.retryAfterSeconds).toBe(120);
    expect(decision.remaining).toBe(0);
  });

  it("consume: remaining negativo do banco e fail-closed, nunca exposto", async () => {
    process.env[USER_DAILY_MESSAGE_LIMIT_ENV] = "10";
    await expect(
      consumeDailyUsage({
        userId: "u1",
        kind: "text",
        supabase: rpcClient(Promise.resolve({ data: { allowed: true, remaining: -3, usage_day: "2026-09-15" }, error: null })) as never,
      }),
    ).rejects.toThrow(UsageGuardUnavailableError);
  });

  it("contadores text e image sao isolados por kind (fallback memoria)", async () => {
    process.env[USER_DAILY_MESSAGE_LIMIT_ENV] = "2";
    const first = await consumeDailyUsage({ userId: "u1", kind: "text", supabase: null });
    const second = await consumeDailyUsage({ userId: "u1", kind: "text", supabase: null });
    const third = await consumeDailyUsage({ userId: "u1", kind: "text", supabase: null });
    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(false);
    const image = await consumeDailyUsage({ userId: "u1", kind: "image", supabase: null });
    expect(image.allowed).toBe(true);
  });

  it("usuarios separados tem contadores independentes (fallback memoria)", async () => {
    process.env[USER_DAILY_MESSAGE_LIMIT_ENV] = "1";
    await consumeDailyUsage({ userId: "user-a", kind: "text", supabase: null });
    const deniedA = await consumeDailyUsage({ userId: "user-a", kind: "text", supabase: null });
    expect(deniedA.allowed).toBe(false);
    const userB = await consumeDailyUsage({ userId: "user-b", kind: "text", supabase: null });
    expect(userB.allowed).toBe(true);
  });
});
