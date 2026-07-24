import "server-only";

export type LogLevel = "info" | "warn" | "error";

export interface ServerLogEntry {
  level: LogLevel;
  requestId: string;
  route: string;
  event: string;
  status: number;
  durationMs: number;
  userId?: string;
  errorType?: string;
  projectId?: string;
  conversationId?: string;
  personalityId?: string;
  providerId?: string;
  modelId?: string;
  errorCode?: string;
  stage?: string;
  statusCode?: number;
  cancelledByClient?: boolean;
  legacyScopeUsed?: boolean;
  replayed?: boolean;
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
    ...(entry.userId && { userId: entry.userId }),
    ...(entry.projectId && { projectId: entry.projectId }),
    ...(entry.conversationId && { conversationId: entry.conversationId }),
    ...(entry.personalityId && { personalityId: entry.personalityId }),
    ...(entry.providerId && { providerId: entry.providerId }),
    ...(entry.modelId && { modelId: entry.modelId }),
    ...(entry.errorCode && { errorCode: entry.errorCode }),
    ...(entry.stage && { stage: entry.stage }),
    ...(typeof entry.statusCode === "number" && { statusCode: entry.statusCode }),
    ...(typeof entry.cancelledByClient === "boolean" && {
      cancelledByClient: entry.cancelledByClient,
    }),
    ...(typeof entry.legacyScopeUsed === "boolean" && {
      legacyScopeUsed: entry.legacyScopeUsed,
    }),
    ...(typeof entry.replayed === "boolean" && { replayed: entry.replayed }),
    ...(entry.errorType && { errorType: entry.errorType }),
  });

  if (entry.level === "error") console.error(payload);
  else if (entry.level === "warn") console.warn(payload);
  else console.info(payload);
}
