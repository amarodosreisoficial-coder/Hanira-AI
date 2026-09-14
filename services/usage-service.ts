import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isDemoMode } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { UsageGuardConfigError, nextUtcResetIso, peekDailyUsage } from "@/lib/security/usage-guard";
import { resolveImageDailyLimit, resolveTextDailyLimit } from "@/lib/security/usage-limits";

// Package 17.5.1 — Usage Service (server-only).
// Resolve o client privilegiado para o guard distribuido e monta o snapshot
// publico de GET /api/usage. Nunca expoe segredos, prompts ou conteudo.
// RPC `consume_daily_usage` e EXECUTE apenas para service_role e e chamada
// SOMENTE aqui no servidor (lib/supabase/admin.ts e server-only). O browser
// usa anon key + RLS e nunca recebe a service role.

export function getUsageSupabaseClient(): SupabaseClient | null {
  let demo = false;
  try {
    demo = isDemoMode();
  } catch {
    // Env publica invalida: fora de demo isso e erro de config (fail-closed).
    throw new UsageGuardConfigError("Configuracao de ambiente invalida para o Usage Guard.");
  }
  if (demo) return null;
  try {
    return createSupabaseAdminClient() as unknown as SupabaseClient;
  } catch {
    // Falha real de config do admin client em producao: NAO ativar fallback
    // silencioso. O rollout fallback ocorre apenas quando o banco diz
    // explicitamente que os objetos 009 estao ausentes.
    throw new UsageGuardConfigError("Cliente privilegiado de uso indisponivel (fail-closed).");
  }
}

export function isUsageDemoClient(): boolean {
  try {
    return isDemoMode();
  } catch {
    return false;
  }
}

export interface UsageSnapshot {
  readonly usageDay: string;
  readonly resetAt: string;
  readonly text: { readonly used: number; readonly limit: number; readonly remaining: number | null };
  readonly image: { readonly used: number; readonly limit: number; readonly remaining: number | null };
  readonly degraded: boolean;
  readonly source: "distributed" | "memory";
}

export async function getDailyUsageSnapshot(userId: string): Promise<UsageSnapshot> {
  const supabase = getUsageSupabaseClient();
  const peek = await peekDailyUsage({ userId, supabase });
  const textLimit = resolveTextDailyLimit();
  const imageLimit = resolveImageDailyLimit();
  const textRemaining = textLimit === 0 ? null : Math.max(0, textLimit - peek.textUsed);
  const imageRemaining = imageLimit === 0 ? null : Math.max(0, imageLimit - peek.imageUsed);
  return {
    usageDay: peek.usageDay,
    resetAt: nextUtcResetIso(),
    text: { used: peek.textUsed, limit: textLimit, remaining: textRemaining },
    image: { used: peek.imageUsed, limit: imageLimit, remaining: imageRemaining },
    degraded: peek.degraded || supabase === null,
    source: supabase === null ? "memory" : "distributed",
  };
}
