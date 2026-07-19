import "server-only";

export type LogLevel = "info" | "warn" | "error";

export interface ServerLogEntry {
  level: LogLevel;
  requestId: string;
  route: string;
  event: string;
  status: number;
  durationMs: number;
  errorType?: string;
}

export function createRequestId(request?: Request) {
  const candidate = request?.headers.get("x-request-id");
  if (
    candidate &&
    /^[a-zA-Z0-9_-]{8,80}$/.test(candidate)
  ) {
    return candidate;
  }
  return crypto.randomUUID();
}

export function logServerEvent(entry: ServerLogEntry) {
  const payload = JSON.stringify({
    timestamp: new Date().toISOString(),
    requestId: entry.requestId,
    route: entry.route,
    event: entry.event,
    status: entry.status,
    durationMs: Math.max(0, Math.round(entry.durationMs)),
    ...(entry.errorType && { errorType: entry.errorType }),
  });

  if (entry.level === "error") console.error(payload);
  else if (entry.level === "warn") console.warn(payload);
  else console.info(payload);
}
