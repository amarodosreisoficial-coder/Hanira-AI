import "server-only";

export const LEGACY_CONVERSATION_SCOPE_PREFIX = "legacy-conversation:";

export function normalizeProjectId(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (!/^[a-z0-9](?:[a-z0-9._:-]{0,120}[a-z0-9])?$/i.test(normalized)) {
    return null;
  }
  return normalized;
}

export function deriveLegacyConversationScope(conversationId: string) {
  return `${LEGACY_CONVERSATION_SCOPE_PREFIX}${conversationId}`;
}

export function resolveConversationProjectScope(options: {
  conversationId: string;
  metadata: unknown;
}) {
  const metadataRecord =
    options.metadata && typeof options.metadata === "object" && !Array.isArray(options.metadata)
      ? (options.metadata as Record<string, unknown>)
      : null;

  const projectId = normalizeProjectId(metadataRecord?.projectId);
  return projectId ?? deriveLegacyConversationScope(options.conversationId);
}

export function buildConversationMetadata(options: {
  conversationId: string;
  projectId?: string;
}) {
  const projectId =
    normalizeProjectId(options.projectId) ??
    deriveLegacyConversationScope(options.conversationId);
  return { projectId };
}

export function describeProject(projectId: string) {
  return projectId;
}
