import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  isLegacyConversationScope,
  resolveConversationProjectScope,
} from "@/services/project-context";

const SENSITIVE_PATTERN =
  /\b(cpf|rg|cartão|senha|diagnóstico|doença|medicamento|conta bancária|chave pix|telefone|endereço|e-mail)\b/i;

interface QueryResult {
  data?: unknown;
  error?: unknown;
}

interface QueryBuilder {
  eq(column: string, value: unknown): QueryBuilder;
  select(query: string): QueryBuilder;
  insert(value: Record<string, unknown>): QueryBuilder;
  delete(): QueryBuilder;
  order(column: string, options: { ascending: boolean }): QueryBuilder;
  limit(value: number): Promise<QueryResult>;
  maybeSingle(): Promise<QueryResult>;
  in(column: string, values: string[]): Promise<QueryResult>;
}

interface SupabaseQuerySurface {
  from(table: string): QueryBuilder;
}

interface MemoryRow {
  id?: unknown;
  content: string;
  importance: number;
}

async function getSupabaseClient(supabase?: unknown) {
  return supabase ?? (await createSupabaseServerClient());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function listProjectConversationIds(options: {
  supabase: unknown;
  userId: string;
  projectId: string;
}) {
  const supabase = options.supabase as SupabaseQuerySurface;
  const { data, error } = await supabase
    .from("conversations")
    .select("id,metadata,project_id")
    .eq("user_id", options.userId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;

  return (Array.isArray(data) ? data : [])
    .filter(
      (conversation: Record<string, unknown>) =>
        isRecord(conversation) &&
        typeof conversation.id === "string" &&
        resolveConversationProjectScope({
          conversationId: conversation.id,
          metadata: conversation.metadata,
          relationalProjectId: conversation.project_id,
        }) === options.projectId,
    )
    .map((conversation: Record<string, unknown>) => conversation.id as string);
}

function rankMemories(memories: MemoryRow[], message: string) {
  const terms = new Set(
    message
      .toLocaleLowerCase("pt-BR")
      .split(/\W+/)
      .filter((term) => term.length > 3),
  );

  return memories
    .map((memory) => ({
      content: memory.content,
      score:
        memory.importance +
        [...terms].filter((term) =>
          memory.content.toLocaleLowerCase("pt-BR").includes(term),
        ).length * 2,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((memory) => memory.content);
}

export async function listProjectMemories(options: {
  supabase?: unknown;
  userId: string;
  projectId: string;
}) {
  const supabase = await getSupabaseClient(options.supabase);
  if (!supabase) return [];
  const db = supabase as SupabaseQuerySurface;

  const { data: settings } = await db
    .from("user_settings")
    .select("memory_enabled")
    .eq("user_id", options.userId)
    .maybeSingle();
  if (!isRecord(settings) || !settings.memory_enabled) return [];

  if (!isLegacyConversationScope(options.projectId)) {
    const { data, error } = await db
      .from("memories")
      .select("id,content,category,importance,created_at,source_conversation_id,project_id")
      .eq("user_id", options.userId)
      .eq("project_id", options.projectId)
      .eq("is_active", true)
      .in("source_conversation_id", await listProjectConversationIds({
        supabase,
        userId: options.userId,
        projectId: options.projectId,
      }));
    if (error) throw error;
    return (data ?? []) as Array<Record<string, unknown>>;
  }

  const conversationIds = await listProjectConversationIds({
    supabase,
    userId: options.userId,
    projectId: options.projectId,
  });
  if (!conversationIds.length) return [];

  const { data, error } = await db
    .from("memories")
    .select("id,content,category,importance,created_at,source_conversation_id,project_id")
    .eq("user_id", options.userId)
    .eq("is_active", true)
    .in("source_conversation_id", conversationIds);
  if (error) throw error;

  return (data ?? []) as Array<Record<string, unknown>>;
}

export async function getRelevantMemories(options: {
  supabase?: unknown;
  userId: string;
  projectId: string;
  message: string;
}): Promise<string[]> {
  const memories = (await listProjectMemories(options)) as unknown as MemoryRow[];
  return rankMemories(memories, options.message);
}

export async function deleteProjectMemory(options: {
  supabase?: unknown;
  userId: string;
  projectId: string;
  id?: string;
}) {
  const supabase = await getSupabaseClient(options.supabase);
  if (!supabase) return;
  const db = supabase as SupabaseQuerySurface;

  const memories = (await listProjectMemories(options)) as Array<Record<string, unknown>>;
  const ids = memories
    .map((memory) => (typeof memory.id === "string" ? memory.id : null))
    .filter((id): id is string => Boolean(id))
    .filter((id) => !options.id || id === options.id);
  if (!ids.length) return;

  const { error } = await db
    .from("memories")
    .delete()
    .eq("user_id", options.userId)
    .in("id", ids);
  if (error) throw error;
}

export async function saveExplicitMemory(options: {
  supabase?: unknown;
  userId: string;
  projectId: string;
  conversationId: string;
  message: string;
}) {
  if (SENSITIVE_PATTERN.test(options.message)) {
    return { status: "skipped", reason: "sensitive_content" } as const;
  }

  const normalized = options.message.trim();
  if (!normalized) {
    return { status: "skipped", reason: "empty_content" } as const;
  }

  const patterns: Array<{
    regex: RegExp;
    category: string;
    importance: number;
  }> = [
    { regex: /\bmeu nome é\s+(.+)/i, category: "identidade", importance: 5 },
    {
      regex: /\b(?:lembre que|guarde (?:isso:?\s*|que\s*))(.+)/i,
      category: "explícita",
      importance: 4,
    },
    { regex: /\beu prefiro\s+(.+)/i, category: "preferência", importance: 3 },
    { regex: /\bprefiro\s+(.+)/i, category: "preferência", importance: 3 },
    { regex: /\bnão gosto de\s+(.+)/i, category: "preferência", importance: 3 },
  ];
  const match = patterns
    .map((pattern) => ({ pattern, match: normalized.match(pattern.regex) }))
    .find((item) => item.match?.[1]);
  if (!match?.match?.[1]) {
    return { status: "skipped", reason: "pattern_not_matched" } as const;
  }

  const content = match.match[1].trim().slice(0, 500);
  if (!content) {
    return { status: "skipped", reason: "empty_content" } as const;
  }

  const supabase = await getSupabaseClient(options.supabase);
  if (!supabase) {
    return { status: "skipped", reason: "unauthenticated" } as const;
  }
  const db = supabase as SupabaseQuerySurface;

  const { data: conversation } = await db
    .from("conversations")
    .select("id,metadata,project_id")
    .eq("id", options.conversationId)
    .eq("user_id", options.userId)
    .maybeSingle();
  if (
    !isRecord(conversation) ||
    typeof conversation.id !== "string" ||
    resolveConversationProjectScope({
      conversationId: conversation.id,
      metadata: conversation.metadata,
      relationalProjectId: conversation.project_id,
    }) !== options.projectId
  ) {
    return { status: "skipped", reason: "context_mismatch" } as const;
  }

  if (typeof conversation.project_id !== "string") {
    return { status: "skipped", reason: "legacy_project_unavailable" } as const;
  }

  const { data, error } = await db
    .from("memories")
    .insert({
      user_id: options.userId,
      project_id: conversation.project_id,
      content,
      category: match.pattern.category,
      importance: match.pattern.importance,
      source_conversation_id: options.conversationId,
    })
    .select("id")
    .maybeSingle();
  if (error) throw error;

  return {
    status: "saved",
    reason: "saved",
    memoryId: isRecord(data) && typeof data.id === "string" ? data.id : undefined,
  } as const;
}
