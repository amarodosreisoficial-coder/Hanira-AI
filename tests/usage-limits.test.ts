import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_IMAGE_DAILY_LIMIT,
  DEFAULT_TEXT_DAILY_LIMIT,
  IMAGE_DAILY_LIMIT_ENV,
  USER_DAILY_MESSAGE_LIMIT_ENV,
  resolveDailyLimitForKind,
  resolveImageDailyLimit,
  resolveTextDailyLimit,
} from "../lib/security/usage-limits";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("usage limits 17.5", () => {
  it("defaults texto 200 e imagem 10", () => {
    delete process.env[USER_DAILY_MESSAGE_LIMIT_ENV];
    delete process.env[IMAGE_DAILY_LIMIT_ENV];
    expect(resolveTextDailyLimit()).toBe(200);
    expect(resolveImageDailyLimit()).toBe(10);
    expect(DEFAULT_TEXT_DAILY_LIMIT).toBe(200);
    expect(DEFAULT_IMAGE_DAILY_LIMIT).toBe(10);
    expect(resolveDailyLimitForKind("text")).toBe(200);
    expect(resolveDailyLimitForKind("image")).toBe(10);
  });

  it("env valida define limites por kind", () => {
    process.env[USER_DAILY_MESSAGE_LIMIT_ENV] = "5";
    process.env[IMAGE_DAILY_LIMIT_ENV] = "3";
    expect(resolveTextDailyLimit()).toBe(5);
    expect(resolveImageDailyLimit()).toBe(3);
  });

  it("limite 0 desativa", () => {
    process.env[USER_DAILY_MESSAGE_LIMIT_ENV] = "0";
    process.env[IMAGE_DAILY_LIMIT_ENV] = "0";
    expect(resolveTextDailyLimit()).toBe(0);
    expect(resolveImageDailyLimit()).toBe(0);
  });

  it("env invalida falha fail-closed", () => {
    process.env[USER_DAILY_MESSAGE_LIMIT_ENV] = "muitas";
    expect(() => resolveTextDailyLimit()).toThrowError(/HANIRA_USER_DAILY_MESSAGE_LIMIT/);
    process.env[IMAGE_DAILY_LIMIT_ENV] = "99999";
    expect(() => resolveImageDailyLimit()).toThrowError(/HANIRA_IMAGE_DAILY_LIMIT/);
  });
});
