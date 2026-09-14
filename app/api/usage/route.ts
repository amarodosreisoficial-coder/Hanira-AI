import { getSessionUser } from "@/lib/auth/session";
import { createRequestId, logServerEvent } from "@/lib/logging/server";
import { UsageGuardUnavailableError } from "@/lib/security/usage-guard";
import { getDailyUsageSnapshot } from "@/services/usage-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const startedAt = Date.now();
  const requestId = createRequestId(request);
  const user = await getSessionUser();
  if (!user) {
    logServerEvent({ level: "warn", requestId, route: "/api/usage", event: "unauthenticated", status: 401, durationMs: Date.now() - startedAt });
    return Response.json({ error: "Faca login para ver seu uso.", requestId }, { status: 401, headers: { "X-Request-ID": requestId, "Cache-Control": "no-store" } });
  }
  try {
    const snapshot = await getDailyUsageSnapshot(user.id);
    logServerEvent({ level: "info", requestId, route: "/api/usage", event: "usage_snapshot", status: 200, durationMs: Date.now() - startedAt });
    return Response.json({ ...snapshot, requestId }, { headers: { "X-Request-ID": requestId, "Cache-Control": "no-store" } });
  } catch (error) {
    const unavailable = error instanceof UsageGuardUnavailableError;
    logServerEvent({ level: "error", requestId, route: "/api/usage", event: unavailable ? "usage_unavailable" : "usage_failed", status: unavailable ? 503 : 500, durationMs: Date.now() - startedAt });
    // Erro inesperado do banco (permissao/rede/timeout/resposta malformada):
    // nunca fabricar zero — indisponibilidade temporaria (fail-closed).
    return Response.json({ error: "O acompanhamento diario esta temporariamente indisponivel.", requestId }, { status: unavailable ? 503 : 500, headers: { "X-Request-ID": requestId, "Cache-Control": "no-store", ...(unavailable ? { "Retry-After": "30" } : {}) } });
  }
}
