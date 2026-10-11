import { describe, expect, it, vi } from "vitest";
import { assessLiveSttGate, runLiveSttSmoke } from "../scripts/stt-live-smoke.mjs";

const baseEnv = {
  HANIRA_STT_LIVE_ENABLED: "true",
  HANIRA_STT_ENABLED: "true",
  HANIRA_STT_COST_CLASS: "FREE",
  HANIRA_STT_ACCOUNT_VERIFIED_FREE: "true",
  CLOUDFLARE_AI_ACCOUNT_ID: "fixture-account",
  CLOUDFLARE_AI_API_TOKEN: "fixture-token",
};
const authorization = "AUTORIZO SMOKE STT CLOUDFLARE";
const args = ["--execute", "--authorization", authorization, "--file", "fixture.webm", "--duration-seconds", "6"];
const audio = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01]);
const fileStat = async () => ({ isFile: () => true, isSymbolicLink: () => false, size: audio.length });

describe("controlled live STT smoke gate", () => {
  it.each([
    ["disabled", { HANIRA_STT_ENABLED: "false" }],
    ["paid", { HANIRA_STT_COST_CLASS: "PAID" }],
    ["promotional", { HANIRA_STT_COST_CLASS: "PROMOTIONAL" }],
    ["unknown", { HANIRA_STT_COST_CLASS: "UNKNOWN" }],
    ["missing account", { CLOUDFLARE_AI_ACCOUNT_ID: "" }],
    ["missing token", { CLOUDFLARE_AI_API_TOKEN: "" }],
    ["account not verified", { HANIRA_STT_ACCOUNT_VERIFIED_FREE: "" }],
  ])("blocks %s before any provider call", async (_name, changed) => {
    const fetchFn = vi.fn();
    const readAudio = vi.fn();
    const result = await runLiveSttSmoke({ env: { ...baseEnv, ...changed }, args, fetchFn, readAudio });
    expect(result.providerCalls).toBe(0);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(readAudio).not.toHaveBeenCalled();
  });

  it("requires the live flag and exact human authorization", async () => {
    expect(assessLiveSttGate(baseEnv, { execute: true, authorization }).ready).toBe(true);
    const fetchFn = vi.fn();
    const disabled = await runLiveSttSmoke({ env: { ...baseEnv, HANIRA_STT_LIVE_ENABLED: "false" }, args, fetchFn });
    const noPhrase = await runLiveSttSmoke({ env: baseEnv, args: ["--execute", "--file", "fixture.webm", "--duration-seconds", "6"], fetchFn });
    expect(disabled.providerCalls).toBe(0);
    expect(noPhrase.providerCalls).toBe(0);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("rejects invalid audio before calling the provider", async () => {
    const fetchFn = vi.fn();
    const result = await runLiveSttSmoke({
      env: baseEnv, args, fetchFn, fileStat,
      readAudio: async () => Buffer.from("not webm"),
    });
    expect(result.providerCalls).toBe(0);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("rejects oversized audio and a measured duration outside 3–10 seconds", async () => {
    const fetchFn = vi.fn();
    const oversized = await runLiveSttSmoke({
      env: baseEnv, args, fetchFn,
      fileStat: async () => ({ isFile: () => true, isSymbolicLink: () => false, size: 4 * 1024 * 1024 + 1 }),
    });
    const tooLong = await runLiveSttSmoke({
      env: baseEnv, args, fetchFn, fileStat,
      readAudio: async () => Buffer.from(audio), measureDuration: async () => 11,
    });
    expect(oversized.providerCalls).toBe(0);
    expect(tooLong.providerCalls).toBe(0);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("makes one call with a valid fixture and never retries", async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({ success: true, result: { text: "Teste de voz da Hanira." } }),
    }));
    const result = await runLiveSttSmoke({
      env: baseEnv, args, fetchFn, fileStat, readAudio: async () => Buffer.from(audio), measureDuration: async () => 6,
    });
    expect(result.status).toBe("PASS");
    expect(result.providerCalls).toBe(1);
    expect(result.retry).toBe(0);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
