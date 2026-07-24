import "server-only";
import type { TextChatContextMessage } from "@/lib/ai/runtime";
import { getRelevantMemories } from "@/services/memory";
import {
  buildConversationMetadata,
  describeProject,
  resolveConversationProjectScope,
} from "@/services/project-context";

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
  systemInstructions: string;
  relevantMemories: string[];
  conversationMessages: TextChatContextMessage[];
  personalityInstructions?: string;
  historyMessageCount: number;
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

function extractProjectId(conversation: Record<string, unknown> | null | undefined) {
  const conversationId =
    conversation && typeof conversation.id === "string" ? conversation.id : "";
  return resolveConversationProjectScope({
    conversationId,
    metadata: conversation?.metadata,
  });
}

async function createConversation(options: {
  supabase: unknown;
  userId: string;
  title: string;
  projectId?: string;
}) {
  const supabase = options.supabase as SupabaseQuerySurface;
  const conversationId = crypto.randomUUID();
  const { data, error } = await supabase
    .from("conversations")
    .insert({
      id: conversationId,
      user_id: options.userId,
      title: options.title,
      metadata: buildConversationMetadata({
        conversationId,
        projectId: options.projectId,
      }),
    })
    .select("id,metadata")
    .single();

  if (error || !isRecord(data) || typeof data.id !== "string") {
    throw error ?? new ChatContextError("conversation_invalid", "Conversa nao encontrada.", 404);
  }

  return {
    id: data.id,
    projectId: extractProjectId(data),
  };
}

async function loadConversation(options: {
  supabase: unknown;
  userId: string;
  conversationId: string;
}) {
  const supabase = options.supabase as SupabaseQuerySurface;
  const { data, error } = await supabase
    .from("conversations")
    .select("id,title,metadata")
    .eq("id", options.conversationId)
    .eq("user_id", options.userId)
    .maybeSingle();

  if (error || !isRecord(data) || typeof data.id !== "string") {
    throw new ChatContextError("conversation_not_found", "Conversa nao encontrada.", 404);
  }

  return {
    id: data.id,
    title: normalizeText(data.title),
    projectId: extractProjectId(data),
  };
}

export async function resolveProjectChatContext(options: {
  supabase: unknown;
  requestId: string;
  userId: string;
  conversationId?: string;
  userMessage: string;
}) {
  const supabase = options.supabase as SupabaseQuerySurface;
  const title = options.userMessage.slice(0, 60) || "Analise de midia";
  const conversation = options.conversationId
    ? await loadConversation({
        supabase,
        userId: options.userId,
        conversationId: options.conversationId,
      })
    : await createConversation({
        supabase,
        userId: options.userId,
        title,
      });

  const [{ data: messages, error: messagesError }, { data: settings, error: settingsError }, memories] =
    await Promise.all([
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
  const personalityInstructions = buildPersonalityInstructions(settings ?? {});

  return {
    requestId: options.requestId,
    userId: options.userId,
    projectId: conversation.projectId,
    projectName: describeProject(conversation.projectId),
    conversationId: conversation.id,
    systemInstructions: "",
    relevantMemories: memories,
    conversationMessages,
    personalityInstructions: personalityInstructions || undefined,
    historyMessageCount: conversationMessages.length,
  } satisfies ProjectChatContext;
}
