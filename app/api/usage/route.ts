import { getSessionUser } from "@/lib/auth/session";
import { createRequestId, logServerEvent } from "@/lib/logging/server";
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
  } catch {
    logServerEvent({ level: "error", requestId, route: "/api/usage", event: "usage_failed", status: 500, durationMs: Date.now() - startedAt });
    return Response.json({ error: "Nao foi possivel carregar seu uso agora.", requestId }, { status: 500, headers: { "X-Request-ID": requestId, "Cache-Control": "no-store" } });
  }
}
