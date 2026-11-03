import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { IkigaiDiagnosticContext } from "./diagnostics";

const ALLOWED_STAGES = new Set(["session","input","quota","schema","runtime","provider","parse","validation","render","pdf","complete"]);
const ALLOWED_PUBLIC = new Set(["configuration","technical","providerUnavailable","capacity","cancelled"]);

function safeString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return /^[a-zA-Z0-9][a-zA-Z0-9_./:-]{0,119}$/.test(trimmed) ? trimmed : null;
}

export async function persistIkigaiDiagnostic(
  context: IkigaiDiagnosticContext,
  failure: { internalCode: string; category: string; publicCode: string; status: number; providerStatus?: number | null },
  route: string,
  section?: string,
  providerStatusOverride?: number | null,
): Promise<void> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return;
    const stage = ALLOWED_STAGES.has(context.stage) ? context.stage : "runtime";
    const publicCode = ALLOWED_PUBLIC.has(failure.publicCode) ? failure.publicCode : "technical";
    const internalCode = safeString(failure.internalCode, 64) ?? "UNEXPECTED_ERROR";
    const failureCategory = safeString(failure.category, 64) ?? "unexpected_error";
    const provider = safeString(context.provider, 64);
    const model = safeString(context.model, 64);
    const sectionSafe = typeof section === "string" && /^(?:synthesis|title|actionPlan\.days(?:7|30|90)|(?:passions|strengths|values|contribution|sustainablePaths|possibleDirections|challenges)\[[0-2]\])$/.test(section) ? section : null;
    const durationMs = Math.max(0, Date.now() - context.startedAtMs);
    const providerStatusRaw = providerStatusOverride ?? failure.providerStatus ?? null;
    const providerStatus = typeof providerStatusRaw === "number" && Number.isInteger(providerStatusRaw) && providerStatusRaw >= 100 && providerStatusRaw <= 599 ? providerStatusRaw : null;
    const client = createSupabaseAdminClient() as { from: (table: string) => { insert: (row: Record<string, unknown>) => PromiseLike<{ error: { code?: string } | null }> } };
    const insert = client.from("ikigai_diagnostics").insert({
      request_id: context.requestId,
      route,
      stage,
      internal_code: internalCode,
      failure_category: failureCategory,
      public_code: publicCode,
      provider,
      model,
      provider_status: providerStatus,
      duration_ms: durationMs,
      section: sectionSafe,
    });
    const result = await Promise.race([insert, new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 1500))]);
    const error = (result as { error?: { code?: string } | null } | null)?.error;
    if (error) console.warn("[ikigai.diagnostic.persist_failed]");
  } catch {
    // best-effort: never propagate
    console.warn("[ikigai.diagnostic.persist_failed]");
  }
}
