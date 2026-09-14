import "server-only";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { IMAGE_ASPECT_RATIO_DIMENSIONS } from "@/lib/ai/image/aspect-ratios";
import { createProductionImageRouter } from "@/lib/ai/image/runtime";
import { validateImageRequest } from "@/lib/validation/image-request";
import { createConcurrencyLockReleaser, tryAcquireConcurrencyLock } from "@/lib/security/concurrency-guard";
import { consumeDailyUsage } from "@/lib/security/usage-guard";
import { recordCapacityEvent } from "@/lib/observability/capacity-metrics";
import { createRequestId, logServerEvent } from "@/lib/logging/server";
import { getUsageSupabaseClient } from "@/services/usage-service";

export const dynamic = "force-dynamic";
type ImagePublicError = "authentication_required" | "invalid_request" | "capacity_unavailable" | "generation_unavailable";
function error(code: ImagePublicError, status: number, requestId: string, retryAfter?: string) { return NextResponse.json({ success: false, errorCode: code, requestId }, { status, headers: { "X-Request-ID": requestId, ...(retryAfter ? { "Retry-After": retryAfter } : {}) } }); }
export async function POST(request: Request) {
  const startedAt = Date.now();
  const user = await getSessionUser();
  if (!user) return error("authentication_required", 401, "anonymous");
  const requestId = createRequestId(request);
  if (!tryAcquireConcurrencyLock(user.id, `image:${requestId}`)) return error("generation_unavailable", 409, requestId, "1");
  const release = createConcurrencyLockReleaser(user.id, `image:${requestId}`);
  try {
    // 17.5.1: validar ANTES de consumir quota. Request invalido nao consome
    // quota e nao chama o provider; rejeicao de concorrencia nao consome.
    let input;
    try {
      input = validateImageRequest(await request.json());
    } catch {
      return error("invalid_request", 400, requestId);
    }
    let quota;
    try {
      quota = await consumeDailyUsage({ userId: user.id, kind: "image", supabase: getUsageSupabaseClient(), nowMs: Date.now() });
    } catch {
      // Config invalida (env) ou admin-client quebrado em producao:
      // fail-closed sem chamar o provider.
      logServerEvent({ level: "error", requestId, route: "/api/image", event: "quota_config_invalid", status: 500, durationMs: Date.now() - startedAt });
      return error("generation_unavailable", 500, requestId);
    }
    if (!quota.allowed) {
      logServerEvent({ level: "warn", requestId, route: "/api/image", event: "quota_limited", status: 429, durationMs: Date.now() - startedAt });
      recordCapacityEvent({ outcome: "quota_limited_response" });
      return error("capacity_unavailable", 429, requestId, String(quota.retryAfterSeconds));
    }
    const dimensions = IMAGE_ASPECT_RATIO_DIMENSIONS[input.aspectRatio];
    const references = input.references.map((reference, index) => ({ id: `reference-${index}`, mimeType: reference.mimeType, sizeBytes: reference.sizeBytes, data: new Blob([Buffer.from(reference.dataUrl.split(",", 2)[1], "base64")], { type: reference.mimeType }) }));
    const result = await createProductionImageRouter().execute({ prompt: input.prompt, operation: references.length ? "edit" : "generate", aspectRatio: input.aspectRatio, width: dimensions.width, height: dimensions.height, references });
    if (!result.success || !result.imageData || !result.mimeType) return error(result.errorCode === "capacity_unavailable" || result.errorCode === "rate_limit" ? "capacity_unavailable" : "generation_unavailable", result.errorCode === "capacity_unavailable" || result.errorCode === "rate_limit" ? 503 : 502, requestId);
    const dataUrl = `data:${result.mimeType};base64,${Buffer.from(result.imageData).toString("base64")}`;
    return NextResponse.json({ success: true, mimeType: result.mimeType, width: result.width, height: result.height, dataUrl, requestId }, { headers: { "X-Request-ID": requestId } });
  } catch { return error("invalid_request", 400, requestId); } finally { release(); }
}
