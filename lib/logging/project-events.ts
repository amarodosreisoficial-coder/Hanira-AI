import "server-only";
import { logServerEvent } from "@/lib/logging/server";

interface ProjectEventContext {
  requestId: string;
  route: string;
  durationMs?: number;
  status?: number;
  userId?: string;
  projectId?: string;
  conversationId?: string;
  personalityId?: string;
  legacyScopeUsed?: boolean;
  errorCode?: string;
}

function baseEntry(context: ProjectEventContext) {
  return {
    requestId: context.requestId,
    route: context.route,
    status: context.status ?? 200,
    durationMs: context.durationMs ?? 0,
    ...(context.userId ? { userId: context.userId } : {}),
    ...(context.projectId ? { projectId: context.projectId } : {}),
    ...(context.conversationId ? { conversationId: context.conversationId } : {}),
    ...(context.personalityId ? { personalityId: context.personalityId } : {}),
    ...(typeof context.legacyScopeUsed === "boolean"
      ? { legacyScopeUsed: context.legacyScopeUsed }
      : {}),
    ...(context.errorCode ? { errorCode: context.errorCode } : {}),
  };
}

export function logProjectCreated(context: ProjectEventContext) {
  logServerEvent({
    level: "info",
    event: "project_created",
    ...baseEntry(context),
  });
}

export function logProjectDefaultResolved(context: ProjectEventContext) {
  logServerEvent({
    level: "info",
    event: "project_default_resolved",
    ...baseEntry(context),
  });
}

export function logConversationProjectResolved(context: ProjectEventContext) {
  logServerEvent({
    level: "info",
    event: "conversation_project_resolved",
    ...baseEntry(context),
  });
}

export function logLegacyConversationScopeUsed(context: ProjectEventContext) {
  logServerEvent({
    level: "info",
    event: "legacy_conversation_scope_used",
    ...baseEntry(context),
  });
}

export function logPersonalityLoaded(context: ProjectEventContext) {
  logServerEvent({
    level: "info",
    event: "personality_loaded",
    ...baseEntry(context),
  });
}

export function logPersonalityNotConfigured(context: ProjectEventContext) {
  logServerEvent({
    level: "info",
    event: "personality_not_configured",
    ...baseEntry(context),
  });
}

export function logProjectAccessDenied(context: ProjectEventContext) {
  logServerEvent({
    level: "warn",
    event: "project_access_denied",
    ...baseEntry({
      ...context,
      status: context.status ?? 404,
    }),
  });
}

export function logPersonalityScopeMismatch(context: ProjectEventContext) {
  logServerEvent({
    level: "warn",
    event: "personality_scope_mismatch",
    ...baseEntry({
      ...context,
      status: context.status ?? 409,
    }),
  });
}
