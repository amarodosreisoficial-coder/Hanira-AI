import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CONCURRENCY_MAX_BOUNDS,
  CONCURRENCY_MAX_PER_USER_ENV,
  concurrencyLockCountForTests,
  createConcurrencyLockReleaser,
  releaseConcurrencyLock,
  resetConcurrencyGuardForTests,
  resolveMaxConcurrentPerUser,
  tryAcquireConcurrencyLock,
  userConcurrencyLockCountForTests,
} from "../lib/security/concurrency-guard";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  resetConcurrencyGuardForTests();
});

describe("concurrency guard - configuracao (16.5)", () => {
  it("default e 1 quando env ausente ou vazia", () => {
    delete process.env[CONCURRENCY_MAX_PER_USER_ENV];
    expect(resolveMaxConcurrentPerUser()).toBe(1);

    process.env[CONCURRENCY_MAX_PER_USER_ENV] = "  ";
    expect(resolveMaxConcurrentPerUser()).toBe(1);
  });

  it("env valida define o limite", () => {
    process.env[CONCURRENCY_MAX_PER_USER_ENV] = "3";
    expect(resolveMaxConcurrentPerUser()).toBe(3);
  });

  it("env invalida falha claro (fail-closed)", () => {
    process.env[CONCURRENCY_MAX_PER_USER_ENV] = "abc";
    expect(() => resolveMaxConcurrentPerUser()).toThrowError(
      /HANIRA_CONCURRENCY_MAX_PER_USER/,
    );

    process.env[CONCURRENCY_MAX_PER_USER_ENV] = "100";
    expect(() => resolveMaxConcurrentPerUser()).toThrowError(/entre/);
  });

  it("bounds exponem limites minimos e maximos (0 = desativado)", () => {
    expect(CONCURRENCY_MAX_BOUNDS.min).toBe(0);
    expect(CONCURRENCY_MAX_BOUNDS.max).toBe(10);
  });
});

describe("concurrency guard - protecao per-usuario (16.5)", () => {
  it("primeira requisicao do usuario e permitida", () => {
    process.env[CONCURRENCY_MAX_PER_USER_ENV] = "2";
    const acquired = tryAcquireConcurrencyLock("user-a", "req-1");
    expect(acquired).toBe(true);
    expect(userConcurrencyLockCountForTests("user-a")).toBe(1);
    expect(concurrencyLockCountForTests()).toBe(1);
  });

  it("limite atingido: requisicao adicional e bloqueada (per-user)", () => {
    process.env[CONCURRENCY_MAX_PER_USER_ENV] = "1";
    expect(tryAcquireConcurrencyLock("user-a", "req-1")).toBe(true);
    const secondAcquired = tryAcquireConcurrencyLock("user-a", "req-2");
    expect(secondAcquired).toBe(false);
    expect(userConcurrencyLockCountForTests("user-a")).toBe(1);
  });

  it("usuarios diferentes sao independentes", () => {
    process.env[CONCURRENCY_MAX_PER_USER_ENV] = "1";
    expect(tryAcquireConcurrencyLock("user-a", "req-1")).toBe(true);
    expect(tryAcquireConcurrencyLock("user-b", "req-2")).toBe(true);
    expect(userConcurrencyLockCountForTests("user-a")).toBe(1);
    expect(userConcurrencyLockCountForTests("user-b")).toBe(1);
  });

  it("lock liberado apos sucesso (liberacao explicita)", () => {
    process.env[CONCURRENCY_MAX_PER_USER_ENV] = "1";
    expect(tryAcquireConcurrencyLock("user-a", "req-1")).toBe(true);
    releaseConcurrencyLock("user-a", "req-1");
    expect(userConcurrencyLockCountForTests("user-a")).toBe(0);
    expect(tryAcquireConcurrencyLock("user-a", "req-2")).toBe(true);
  });

  it("lock liberado apos erro (liberacao em finally simulado)", () => {
    process.env[CONCURRENCY_MAX_PER_USER_ENV] = "1";
    tryAcquireConcurrencyLock("user-a", "req-1");
    try {
      throw new Error("simulated provider error");
    } catch {
      releaseConcurrencyLock("user-a", "req-1");
    }
    expect(userConcurrencyLockCountForTests("user-a")).toBe(0);
    expect(tryAcquireConcurrencyLock("user-a", "req-2")).toBe(true);
  });

  it("createConcurrencyLockReleaser libera apenas uma vez (double-release safe)", () => {
    process.env[CONCURRENCY_MAX_PER_USER_ENV] = "1";
    tryAcquireConcurrencyLock("user-a", "req-1");
    const release = createConcurrencyLockReleaser("user-a", "req-1");
    release();
    release();
    expect(userConcurrencyLockCountForTests("user-a")).toBe(0);
    expect(tryAcquireConcurrencyLock("user-a", "req-2")).toBe(true);
  });

  it("userId vazio e rejeitado com erro claro", () => {
    expect(() => tryAcquireConcurrencyLock("", "req-1")).toThrowError(/userId/);
  });

  it("requestId vazio e rejeitado com erro claro", () => {
    expect(() =>
      tryAcquireConcurrencyLock("user-a", ""),
    ).toThrowError(/requestId/);
  });

  it("release de usuario/request inexistente e um no-op seguro", () => {
    expect(() =>
      releaseConcurrencyLock("nonexistent", "req-x"),
    ).not.toThrow();
    expect(concurrencyLockCountForTests()).toBe(0);
  });

  it("limite 0 desativa a guarda (comportamento pre-16.5)", () => {
    vi.stubEnv(CONCURRENCY_MAX_PER_USER_ENV, "0");
    expect(resolveMaxConcurrentPerUser()).toBe(0);
    expect(tryAcquireConcurrencyLock("user-a", "req-1")).toBe(true);
    for (let index = 0; index < 100; index += 1) {
      expect(tryAcquireConcurrencyLock("user-a", `req-${index}`)).toBe(true);
    }
    expect(userConcurrencyLockCountForTests("user-a")).toBe(0);
    vi.unstubAllEnvs();
  });
});
