import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isDemoMode } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { peekDailyUsage } from "@/lib/security/usage-guard";
import { resolveImageDailyLimit, resolveTextDailyLimit } from "@/lib/security/usage-limits";

// Package 17.5 — Usage Service (server-only).
// Resolve o client privilegiado para o guard distribuido e monta o snapshot
// publico de GET /api/usage. Nunca expoe segredos, prompts ou conteudo.

export function getUsageSupabaseClient(): SupabaseClient | null {
  try {
    if (isDemoMode()) return null;
  } catch {
    return null;
  }
  try {
    return createSupabaseAdminClient() as unknown as SupabaseClient;
  } catch {
    return null;
  }
}

export interface UsageSnapshot {
  readonly usageDay: string;
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
    text: { used: peek.textUsed, limit: textLimit, remaining: textRemaining },
    image: { used: peek.imageUsed, limit: imageLimit, remaining: imageRemaining },
    degraded: peek.degraded || supabase === null,
    source: supabase === null ? "memory" : "distributed",
  };
}
