import { afterEach, describe, expect, it } from "vitest";
import {
  USER_DAILY_MESSAGE_LIMIT_ENV,
  checkUserMessageQuota,
  resolveUserDailyMessageLimit,
  resetUserQuotaForTests,
  userQuotaEntriesForTests,
} from "../lib/security/user-quota";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  resetUserQuotaForTests();
});

describe("quota diaria simples por usuario (16.5)", () => {
  it("default e 200 quando env ausente ou vazia", () => {
    delete process.env[USER_DAILY_MESSAGE_LIMIT_ENV];
    expect(resolveUserDailyMessageLimit()).toBe(200);

    process.env[USER_DAILY_MESSAGE_LIMIT_ENV] = "  ";
    expect(resolveUserDailyMessageLimit()).toBe(200);
  });

  it("permite mensagens dentro do limite e contabiliza remaining", () => {
    process.env[USER_DAILY_MESSAGE_LIMIT_ENV] = "3";
    const day = Date.UTC(2026, 0, 1, 10);
    expect(checkUserMessageQuota("user-1", day).remaining).toBe(2);
    expect(
      checkUserMessageQuota("user-1", day + 3_600_000).remaining,
    ).toBe(1);
    expect(
      checkUserMessageQuota("user-1", day + 7_200_000).remaining,
    ).toBe(0);
  });

  it("bloqueia no limite com Retry-After ate o proximo dia UTC", () => {
    process.env[USER_DAILY_MESSAGE_LIMIT_ENV] = "2";
    const lateDay = Date.UTC(2026, 0, 1, 23, 59, 0);
    checkUserMessageQuota("user-1", lateDay);
    checkUserMessageQuota("user-1", lateDay + 10_000);
    const blocked = checkUserMessageQuota("user-1", lateDay + 20_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(86_400);
  });

  it("janela nova no dia UTC seguinte", () => {
    process.env[USER_DAILY_MESSAGE_LIMIT_ENV] = "1";
    checkUserMessageQuota("user-1", Date.UTC(2026, 0, 1, 12));
    expect(
      checkUserMessageQuota("user-1", Date.UTC(2026, 0, 1, 13)).allowed,
    ).toBe(false);
    expect(
      checkUserMessageQuota("user-1", Date.UTC(2026, 0, 2, 0, 0, 30)).allowed,
    ).toBe(true);
  });

  it("usuarios sao independentes", () => {
    process.env[USER_DAILY_MESSAGE_LIMIT_ENV] = "1";
    const day = Date.UTC(2026, 0, 1, 12);
    checkUserMessageQuota("user-a", day);
    expect(checkUserMessageQuota("user-b", day).allowed).toBe(true);
    expect(checkUserMessageQuota("user-a", day).allowed).toBe(false);
  });

  it("limite 0 desativa a quota (sem consumo de memoria por chave)", () => {
    process.env[USER_DAILY_MESSAGE_LIMIT_ENV] = "0";
    for (let index = 0; index < 250; index += 1) {
      expect(checkUserMessageQuota("user-c").allowed).toBe(true);
    }
    expect(userQuotaEntriesForTests()).toBe(0);
  });

  it("env invalida falha de forma clara (fail-closed)", () => {
    process.env[USER_DAILY_MESSAGE_LIMIT_ENV] = "muitas";
    expect(() => resolveUserDailyMessageLimit()).toThrowError(
      /HANIRA_USER_DAILY_MESSAGE_LIMIT/,
    );

    process.env[USER_DAILY_MESSAGE_LIMIT_ENV] = "999999";
    expect(() => resolveUserDailyMessageLimit()).toThrowError(
      /HANIRA_USER_DAILY_MESSAGE_LIMIT/,
    );
  });

  it("userId vazio e rejeitado", () => {
    expect(() => checkUserMessageQuota("")).toThrowError(/userId/);
  });

  it("cleanup de dias anteriores mantem o mapa limitado", () => {
    process.env[USER_DAILY_MESSAGE_LIMIT_ENV] = "1";
    const previousDay = Date.UTC(2026, 0, 1, 12);
    for (let index = 0; index < 10_001; index += 1) {
      checkUserMessageQuota(`user-${index}`, previousDay);
    }
    checkUserMessageQuota("user-final", Date.UTC(2026, 0, 2, 12));
    expect(userQuotaEntriesForTests()).toBeLessThanOrEqual(10_000);
  });
});