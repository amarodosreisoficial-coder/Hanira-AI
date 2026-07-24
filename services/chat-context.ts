import "server-only";
import type { TextChatContextMessage } from "@/lib/ai/runtime";
import {
  logConversationProjectResolved,
  logPersonalityLoaded,
  logPersonalityNotConfigured,
  logProjectAccessDenied,
  logProjectDefaultResolved,
  logPersonalityScopeMismatch,
} from "@/lib/logging/project-events";
import { getRelevantMemories } from "@/services/memory";
import {
  describeProject,
  isLegacyConversationScope,
  resolveConversationProjectScope,
} from "@/services/project-context";
import {
  findProjectByIdForUser,
  ProjectServiceError,
  resolveProjectForConversationCreation,
} from "@/services/project-service";
import { findActivePersonalityByProject } from "@/services/personality-service";

const MAX_CONTEXT_MESSAGES = 20;

interface QueryResult {
  data?: unknown;
  error?: unknown;
}

interface QueryBuilder {
  eq(column: string, value: unknown): QueryBuilder;
  select(query: string): QueryBuilder;
  insert(value: Record<string, unknown>): QueryBuilder;
  order(column: string, options: { ascending: boolean }): QueryBuilder;
  limit(value: number): Promise<QueryResult>;
  maybeSingle(): Promise<QueryResult>;
  single(): Promise<QueryResult>;
}

interface SupabaseQuerySurface {
  from(table: string): QueryBuilder;
}

export class ChatContextError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "ChatContextError";
    this.code = code;
    this.status = status;
  }
}

export interface ProjectChatContext {
  requestId: string;
  userId: string;
  projectId: string;
  projectName: string;
  conversationId: string;
  personalityId?: string;
  systemInstructions: string;
  relevantMemories: string[];
  conversationMessages: TextChatContextMessage[];
  personalityInstructions?: string;
  historyMessageCount: number;
  legacyScopeUsed: boolean;
}

function isValidChatRole(value: unknown): value is TextChatContextMessage["role"] {
  return value === "user" || value === "assistant";
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function buildPersonalityInstructions(settings: {
  preferred_name?: unknown;
  response_style?: unknown;
}) {
  const preferredName = normalizeText(settings.preferred_name);
  const responseStyle = normalizeText(settings.response_style);
  const lines = [
    preferredName ? `Nome preferido do usuario: ${preferredName}.` : "",
    responseStyle ? `Estilo de resposta solicitado: ${responseStyle}.` : "",
  ].filter(Boolean);

  return lines.join("\n");
}

export function sanitizeConversationMessages(
  messages: Array<Record<string, unknown>> | null | undefined,
) {
  return (messages ?? [])
    .filter(
      (message) =>
        isValidChatRole(message.role) && normalizeText(message.content).length > 0,
    )
    .sort((left, right) => {
      const leftCreatedAt = normalizeText(left.created_at);
      const rightCreatedAt = normalizeText(right.created_at);
      if (leftCreatedAt !== rightCreatedAt) {
        return leftCreatedAt.localeCompare(rightCreatedAt);
      }
      return normalizeText(left.id).localeCompare(normalizeText(right.id));
    })
    .slice(-MAX_CONTEXT_MESSAGES)
    .map(
      (message) =>
        ({
          role: message.role as TextChatContextMessage["role"],
          content: normalizeText(message.content),
        }) satisfies TextChatContextMessage,
    );
}

async function createConversation(options: {
  supabase: unknown;
  requestId: string;
  userId: string;
  title: string;
  projectId?: string;
}) {
  const supabase = options.supabase as SupabaseQuerySurface;
  let project;
  try {
    project = await resolveProjectForConversationCreation(
      supabase,
      options.userId,
      options.projectId,
    );
  } catch (error) {
    if (error instanceof ProjectServiceError) {
      logProjectAccessDenied({
        requestId: options.requestId,
        route: "/api/chat",
        userId: options.userId,
        projectId: options.projectId,
        errorCode: error.code,
        status: error.status,
      });
      throw new ChatContextError(error.code, error.message, error.status);
    }
    throw error;
  }

  if (!options.projectId) {
    logProjectDefaultResolved({
      requestId: options.requestId,
      route: "/api/chat",
      userId: options.userId,
      projectId: project.id,
    });
  }

  const { data, error } = await supabase
    .from("conversations")
    .insert({
      user_id: options.userId,
      project_id: project.id,
      title: options.title,
      metadata: { projectId: project.id },
    })
    .select("id")
    .single();

  if (error || !isRecord(data) || typeof data.id !== "string") {
    throw error ?? new ChatContextError("conversation_invalid", "Conversa nao encontrada.", 404);
  }

  return {
    id: data.id,
    projectId: project.id,
    projectName: project.name,
    legacyScopeUsed: false,
  };
}

async function loadConversation(options: {
  supabase: unknown;
  requestId: string;
  userId: string;
  conversationId: string;
}) {
  const supabase = options.supabase as SupabaseQuerySurface;
  const { data, error } = await supabase
    .from("conversations")
    .select("id,title,metadata,project_id")
    .eq("id", options.conversationId)
    .eq("user_id", options.userId)
    .maybeSingle();

  if (error || !isRecord(data) || typeof data.id !== "string") {
    throw new ChatContextError("conversation_not_found", "Conversa nao encontrada.", 404);
  }

  const projectId = resolveConversationProjectScope({
    conversationId: data.id,
    metadata: data.metadata,
    relationalProjectId: data.project_id,
  });
  const project =
    typeof data.project_id === "string"
      ? await findProjectByIdForUser(options.supabase, options.userId, data.project_id)
      : null;

  return {
    id: data.id,
    title: normalizeText(data.title),
    projectId,
    projectName: project?.name ?? describeProject(projectId),
    legacyScopeUsed: isLegacyConversationScope(projectId),
  };
}

export async function resolveProjectChatContext(options: {
  supabase: unknown;
  requestId: string;
  userId: string;
  conversationId?: string;
  userMessage: string;
  projectId?: string;
}) {
  const supabase = options.supabase as SupabaseQuerySurface;
  const title = options.userMessage.slice(0, 60) || "Analise de midia";
  const conversation = options.conversationId
    ? await loadConversation({
        supabase,
        requestId: options.requestId,
        userId: options.userId,
        conversationId: options.conversationId,
      })
    : await createConversation({
        supabase,
        requestId: options.requestId,
        userId: options.userId,
        title,
        projectId: options.projectId,
      });

  logConversationProjectResolved({
    requestId: options.requestId,
    route: "/api/chat",
    userId: options.userId,
    projectId: conversation.projectId,
    conversationId: conversation.id,
    legacyScopeUsed: conversation.legacyScopeUsed,
  });

  const [activePersonality, { data: messages, error: messagesError }, { data: settings, error: settingsError }, memories] =
    await Promise.all([
      isLegacyConversationScope(conversation.projectId)
        ? Promise.resolve(null)
        : findActivePersonalityByProject(supabase, conversation.projectId),
      supabase
        .from("messages")
        .select("id,role,content,created_at")
        .eq("conversation_id", conversation.id)
        .eq("user_id", options.userId)
        .order("created_at", { ascending: true })
        .limit(MAX_CONTEXT_MESSAGES),
      supabase
        .from("user_settings")
        .select("preferred_name,response_style")
        .eq("user_id", options.userId)
        .maybeSingle(),
      getRelevantMemories({
        supabase,
        userId: options.userId,
        projectId: conversation.projectId,
        message: options.userMessage || "midia enviada",
      }),
    ]);

  if (messagesError) throw messagesError;
  if (settingsError) throw settingsError;

  const conversationMessages = sanitizeConversationMessages(
    Array.isArray(messages)
      ? (messages as Array<Record<string, unknown>>)
      : undefined,
  );
  if (activePersonality && activePersonality.projectId !== conversation.projectId) {
    logPersonalityScopeMismatch({
      requestId: options.requestId,
      route: "/api/chat",
      userId: options.userId,
      projectId: conversation.projectId,
      conversationId: conversation.id,
      personalityId: activePersonality.id,
      errorCode: "personality_scope_mismatch",
    });
    throw new ChatContextError(
      "personality_scope_mismatch",
      "Personalidade invalida.",
      409,
    );
  }
  if (activePersonality) {
    logPersonalityLoaded({
      requestId: options.requestId,
      route: "/api/chat",
      userId: options.userId,
      projectId: conversation.projectId,
      conversationId: conversation.id,
      personalityId: activePersonality.id,
    });
  } else {
    logPersonalityNotConfigured({
      requestId: options.requestId,
      route: "/api/chat",
      userId: options.userId,
      projectId: conversation.projectId,
      conversationId: conversation.id,
    });
  }
  const fallbackPersonalityInstructions = buildPersonalityInstructions(settings ?? {});
  const personalityInstructions =
    activePersonality?.instructions.trim() || fallbackPersonalityInstructions;

  return {
    requestId: options.requestId,
    userId: options.userId,
    projectId: conversation.projectId,
    projectName: conversation.projectName,
    conversationId: conversation.id,
    personalityId: activePersonality?.id,
    systemInstructions: "",
    relevantMemories: memories,
    conversationMessages,
    personalityInstructions: personalityInstructions || undefined,
    historyMessageCount: conversationMessages.length,
    legacyScopeUsed: conversation.legacyScopeUsed,
  } satisfies ProjectChatContext;
}
