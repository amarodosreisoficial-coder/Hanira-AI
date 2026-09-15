import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveDailyLimitForKind, type UsageKind } from "@/lib/security/usage-limits";

// Package 17.5.1 — Distributed Usage Guard.
// Tenta Postgres atomico (migration 009); fallback memoria quando a
// migration ainda nao foi aplicada; fail-closed em erro inesperado.
// Erros de config/admin em producao NAO ativam fallback silencioso.

export class UsageGuardConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageGuardConfigError";
  }
}

export class UsageGuardUnavailableError extends Error {
  constructor(message = "Uso diario temporariamente indisponivel.") {
    super(message);
    this.name = "UsageGuardUnavailableError";
  }
}

export interface UsageGuardDecision {
  readonly allowed: boolean;
  readonly kind: UsageKind;
  readonly limit: number;
  readonly remaining: number | null;
  readonly retryAfterSeconds: number;
  readonly source: "distributed" | "memory" | "disabled";
  readonly degraded: boolean;
  readonly usageDay: string | null;
}

const fallbackUsage = new Map<string, number>();
const MAX_FALLBACK_ENTRIES = 10_000;

function utcDayKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

function secondsUntilNextUtcDay(nowMs: number): number {
  const now = new Date(nowMs);
  const nextUtcDayStartMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(1, Math.ceil((nextUtcDayStartMs - nowMs) / 1000));
}

function checkMemoryQuota(userId: string, kind: UsageKind, limit: number, nowMs: number, degraded: boolean): UsageGuardDecision {
  const dayKey = utcDayKey(nowMs);
  const key = `${kind}:${userId}:${dayKey}`;
  const used = fallbackUsage.get(key) ?? 0;
  if (used >= limit) {
    return { allowed: false, kind, limit, remaining: 0, retryAfterSeconds: secondsUntilNextUtcDay(nowMs), source: "memory", degraded, usageDay: dayKey };
  }
  fallbackUsage.set(key, used + 1);
  if (fallbackUsage.size > MAX_FALLBACK_ENTRIES) {
    for (const k of fallbackUsage.keys()) {
      if (!k.endsWith(`:${dayKey}`)) fallbackUsage.delete(k);
    }
  }
  return { allowed: true, kind, limit, remaining: limit - used - 1, retryAfterSeconds: 0, source: "memory", degraded, usageDay: dayKey };
}

function deniedFailClosed(kind: UsageKind, limit: number, nowMs: number): UsageGuardDecision {
  void kind;
  void limit;
  void nowMs;
  throw new UsageGuardUnavailableError();
}

function isMissingRelationError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const r = error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
  const hay = [r.code, r.message, r.details, r.hint].filter((v): v is string => typeof v === "string").join(" ").toLowerCase();
  return hay.includes("42p01") || hay.includes("42883") || hay.includes("pgrst202") ||
    (hay.includes("daily_usage") && (hay.includes("does not exist") || hay.includes("could not find"))) ||
    (hay.includes("consume_daily_usage") && (hay.includes("does not exist") || hay.includes("could not find")));
}

export async function consumeDailyUsage(input: { readonly userId: string; readonly kind: UsageKind; readonly supabase?: SupabaseClient | null; readonly nowMs?: number }): Promise<UsageGuardDecision> {
  const { userId, kind } = input;
  const nowMs = input.nowMs ?? Date.now();
  if (typeof userId !== "string" || userId.trim().length === 0) throw new Error("A quota de uso exige um userId nao vazio.");
  if (kind !== "text" && kind !== "image") throw new Error("A quota de uso exige kind text ou image.");
  const limit = resolveDailyLimitForKind(kind);
  if (limit === 0) {
    return { allowed: true, kind, limit, remaining: null, retryAfterSeconds: 0, source: "disabled", degraded: false, usageDay: null };
  }
  type RpcClient = { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> };
  const client = (input.supabase ?? null) as RpcClient | null;
  if (!client) return checkMemoryQuota(userId, kind, limit, nowMs, true);
  let data: unknown;
  let error: unknown;
  try {
    const res = await client.rpc("consume_daily_usage", { p_user_id: userId, p_kind: kind, p_limit: limit });
    data = res.data;
    error = res.error;
  } catch {
    return deniedFailClosed(kind, limit, nowMs);
  }
  if (error) {
    if (isMissingRelationError(error)) return checkMemoryQuota(userId, kind, limit, nowMs, true);
    return deniedFailClosed(kind, limit, nowMs);
  }
  const row = (Array.isArray(data) ? data[0] : data) as { allowed?: unknown; used?: unknown; remaining?: unknown; retry_after_seconds?: unknown; usage_day?: unknown } | null;
  if (!row || typeof row.allowed !== "boolean" || typeof row.usage_day !== "string") throw new UsageGuardUnavailableError();
  if (!row.allowed) {
    // Quota real esgotada: unico caminho legitimo de allowed=false.
    const retry = typeof row.retry_after_seconds === "number" && Number.isSafeInteger(row.retry_after_seconds) ? row.retry_after_seconds : secondsUntilNextUtcDay(nowMs);
    return { allowed: false, kind, limit, remaining: 0, retryAfterSeconds: Math.max(1, retry), source: "distributed", degraded: false, usageDay: row.usage_day };
  }
  const remaining = typeof row.remaining === "number" && Number.isSafeInteger(row.remaining) && row.remaining >= 0 ? row.remaining : null;
  if (remaining === null) throw new UsageGuardUnavailableError();
  return { allowed: true, kind, limit, remaining: Math.max(0, remaining), retryAfterSeconds: 0, source: "distributed", degraded: false, usageDay: row.usage_day };
}

export function peekMemoryUsage(userId: string, nowMs: number = Date.now()): { readonly usageDay: string; readonly textUsed: number; readonly imageUsed: number } {
  const usageDay = utcDayKey(nowMs);
  return {
    usageDay,
    textUsed: fallbackUsage.get(`text:${userId}:${usageDay}`) ?? 0,
    imageUsed: fallbackUsage.get(`image:${userId}:${usageDay}`) ?? 0,
  };
}

export function nextUtcResetIso(nowMs: number = Date.now()): string {
  const now = new Date(nowMs);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();
}

function validCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value >= 0;
}

export async function peekDailyUsage(input: { readonly userId: string; readonly supabase?: SupabaseClient | null }): Promise<{ readonly usageDay: string; readonly textUsed: number; readonly imageUsed: number; readonly degraded: boolean; readonly source: "distributed" | "memory" }> {
  const usageDay = utcDayKey(Date.now());
  type PeekClient = { from: (t: string) => { select: (c: string) => { eq: (col: string, v: unknown) => { eq: (col: string, v: unknown) => { maybeSingle: () => Promise<{ data: unknown; error: unknown }> } } } } };
  const client = (input.supabase ?? null) as PeekClient | null;
  if (!client) {
    const memory = peekMemoryUsage(input.userId);
    return { usageDay: memory.usageDay, textUsed: memory.textUsed, imageUsed: memory.imageUsed, degraded: true, source: "memory" };
  }
  let res: { data: unknown; error: unknown };
  try {
    res = await client.from("daily_usage").select("text_count,image_count").eq("user_id", input.userId).eq("usage_date", usageDay).maybeSingle();
  } catch {
    throw new UsageGuardUnavailableError();
  }
  if (res.error) {
    if (isMissingRelationError(res.error)) {
      const memory = peekMemoryUsage(input.userId);
      return { usageDay: memory.usageDay, textUsed: memory.textUsed, imageUsed: memory.imageUsed, degraded: true, source: "memory" };
    }
    throw new UsageGuardUnavailableError();
  }
  const row = res.data as { text_count?: unknown; image_count?: unknown } | null;
  // Sem linha: usuario ainda sem uso hoje — zero legitimo distribuido.
  if (row === null) return { usageDay, textUsed: 0, imageUsed: 0, degraded: false, source: "distributed" };
  if (!validCount(row.text_count) || !validCount(row.image_count)) throw new UsageGuardUnavailableError();
  return { usageDay, textUsed: row.text_count, imageUsed: row.image_count, degraded: false, source: "distributed" };
}

export function resetUsageGuardForTests(): void {
  fallbackUsage.clear();
}

export function usageGuardEntriesForTests(): number {
  return fallbackUsage.size;
}

