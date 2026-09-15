import { afterEach, describe, expect, it } from "vitest";
import {
  CONCURRENCY_MAX_PER_USER_ENV,
  DEFAULT_MAX_CONCURRENT_PER_USER,
  createConcurrencyLockReleaser,
  releaseConcurrencyLock,
  resetConcurrencyGuardForTests,
  tryAcquireConcurrencyLock,
  userConcurrencyLockCountForTests,
  concurrencyLockCountForTests,
} from "../lib/security/concurrency-guard";
import {
  resetUsageGuardForTests,
  usageGuardEntriesForTests,
} from "../lib/security/usage-guard";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  resetConcurrencyGuardForTests();
  resetUsageGuardForTests();
});

describe("concurrency scope (17.6)", () => {
  it("usuarios diferentes NAO se bloqueiam (lock escopado por usuario)", () => {
    expect(tryAcquireConcurrencyLock("user-a", "req-a1")).toBe(true);
    expect(tryAcquireConcurrencyLock("user-b", "req-b1")).toBe(true);
    expect(userConcurrencyLockCountForTests("user-a")).toBe(1);
    expect(userConcurrencyLockCountForTests("user-b")).toBe(1);
  });

  it("mesmo usuario: segunda requisicao de chat simultanea e rejeitada", () => {
    expect(tryAcquireConcurrencyLock("user-a", "chat-1")).toBe(true);
    expect(tryAcquireConcurrencyLock("user-a", "chat-2")).toBe(false);
  });

  it("mesmo usuario: chat ativo bloqueia imagem (limite 1 por usuario, protegendo capacidade free)", () => {
    expect(tryAcquireConcurrencyLock("user-a", "chat-1")).toBe(true);
    expect(tryAcquireConcurrencyLock("user-a", "image-1")).toBe(false);
    releaseConcurrencyLock("user-a", "chat-1");
    expect(tryAcquireConcurrencyLock("user-a", "image-1")).toBe(true);
  });

  it("mesmo usuario: duas imagens simultaneas — segunda rejeitada e libera apos release", () => {
    expect(tryAcquireConcurrencyLock("user-a", "image-1")).toBe(true);
    expect(tryAcquireConcurrencyLock("user-a", "image-2")).toBe(false);
    releaseConcurrencyLock("user-a", "image-1");
    expect(tryAcquireConcurrencyLock("user-a", "image-2")).toBe(true);
  });

  it("limite maior por env permite 2 simultaneas do mesmo usuario", () => {
    process.env[CONCURRENCY_MAX_PER_USER_ENV] = "2";
    expect(tryAcquireConcurrencyLock("user-a", "r1")).toBe(true);
    expect(tryAcquireConcurrencyLock("user-a", "r2")).toBe(true);
    expect(tryAcquireConcurrencyLock("user-a", "r3")).toBe(false);
  });

  it("limite 0 desativa a guarda sem quebrar o contrato", () => {
    process.env[CONCURRENCY_MAX_PER_USER_ENV] = "0";
    expect(tryAcquireConcurrencyLock("user-a", "r1")).toBe(true);
    expect(tryAcquireConcurrencyLock("user-a", "r2")).toBe(true);
    expect(userConcurrencyLockCountForTests("user-a")).toBe(0);
  });

  it("releaser libera exatamente uma vez (sem double-release)", () => {
    const release = createConcurrencyLockReleaser("user-a", "r1");
    expect(tryAcquireConcurrencyLock("user-a", "r1")).toBe(true);
    release();
    release();
    expect(userConcurrencyLockCountForTests("user-a")).toBe(0);
    expect(concurrencyLockCountForTests()).toBe(0);
  });

  it("default conservador e 1 por usuario", () => {
    expect(DEFAULT_MAX_CONCURRENT_PER_USER).toBe(1);
  });

  it("rejeicao de concorrencia NAO consome quota diaria (ordenacao 17.5/17.6)", async () => {
    expect(tryAcquireConcurrencyLock("user-a", "chat-1")).toBe(true);
    expect(tryAcquireConcurrencyLock("user-a", "chat-2")).toBe(false);
    // Nenhuma entrada de quota criada para a requisicao rejeitada.
    expect(usageGuardEntriesForTests()).toBe(0);
  });
});
