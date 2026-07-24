import "server-only";

const DEFAULT_PROJECT_NAME = "Meu projeto";
const DEFAULT_PROJECT_SLUG = "meu-projeto";

interface QueryResult {
  data?: unknown;
  error?: unknown;
  count?: number | null;
}

interface QueryBuilder {
  select(query: string, options?: Record<string, unknown>): QueryBuilder;
  insert(value: Record<string, unknown> | Array<Record<string, unknown>>): QueryBuilder;
  update(value: Record<string, unknown>, options?: Record<string, unknown>): QueryBuilder;
  delete(options?: Record<string, unknown>): QueryBuilder;
  eq(column: string, value: unknown): QueryBuilder;
  is(column: string, value: unknown): QueryBuilder;
  neq(column: string, value: unknown): QueryBuilder;
  order(column: string, options: { ascending: boolean }): QueryBuilder;
  maybeSingle(): Promise<QueryResult>;
  single(): Promise<QueryResult>;
  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2>;
}

interface SupabaseQuerySurface {
  from(table: string): QueryBuilder;
}

export interface ProjectRecord {
  id: string;
  userId: string;
  name: string;
  slug: string;
  description: string | null;
  isDefault: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export class ProjectServiceError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "ProjectServiceError";
    this.code = code;
    this.status = status;
  }
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function slugifyProjectName(name: string) {
  const slug = name
    .toLocaleLowerCase("pt-BR")
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

  return slug || DEFAULT_PROJECT_SLUG;
}

function mapProject(value: unknown): ProjectRecord {
  const row = toRecord(value);
  if (!row || typeof row.id !== "string" || typeof row.user_id !== "string") {
    throw new ProjectServiceError("project_invalid", "Projeto invalido.", 500);
  }

  return {
    id: row.id,
    userId: row.user_id,
    name: normalizeText(row.name),
    slug: normalizeText(row.slug),
    description: typeof row.description === "string" ? row.description : null,
    isDefault: Boolean(row.is_default),
    archivedAt: typeof row.archived_at === "string" ? row.archived_at : null,
    createdAt: typeof row.created_at === "string" ? row.created_at : "",
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : "",
  };
}

async function ensureSingleDefaultProject(
  supabase: unknown,
  userId: string,
  projectId: string,
) {
  const db = supabase as SupabaseQuerySurface;
  await db
    .from("projects")
    .update({ is_default: false })
    .eq("user_id", userId)
    .neq("id", projectId);
}

export async function listProjectsForUser(
  supabase: unknown,
  userId: string,
) {
  const db = supabase as SupabaseQuerySurface;
  const { data, error } = await db
    .from("projects")
    .select("id,user_id,name,slug,description,is_default,archived_at,created_at,updated_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  return (Array.isArray(data) ? data : []).map(mapProject);
}

export async function findProjectByIdForUser(
  supabase: unknown,
  userId: string,
  projectId: string,
) {
  const db = supabase as SupabaseQuerySurface;
  const { data, error } = await db
    .from("projects")
    .select("id,user_id,name,slug,description,is_default,archived_at,created_at,updated_at")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return mapProject(data);
}

export async function findDefaultProjectForUser(
  supabase: unknown,
  userId: string,
) {
  const db = supabase as SupabaseQuerySurface;
  const { data, error } = await db
    .from("projects")
    .select("id,user_id,name,slug,description,is_default,archived_at,created_at,updated_at")
    .eq("user_id", userId)
    .eq("is_default", true)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return mapProject(data);
}

export async function createProjectForUser(
  supabase: unknown,
  userId: string,
  input: {
    name: string;
    description?: string | null;
    slug?: string;
    isDefault?: boolean;
  },
) {
  const name = normalizeText(input.name);
  if (!name) {
    throw new ProjectServiceError("project_invalid", "Projeto invalido.", 400);
  }

  const slug = normalizeText(input.slug) || slugifyProjectName(name);
  const db = supabase as SupabaseQuerySurface;
  const { data, error } = await db
    .from("projects")
    .insert({
      user_id: userId,
      name,
      slug,
      description: input.description?.trim() || null,
      is_default: Boolean(input.isDefault),
    })
    .select("id,user_id,name,slug,description,is_default,archived_at,created_at,updated_at")
    .single();
  if (error) throw error;

  const project = mapProject(data);
  if (project.isDefault) {
    await ensureSingleDefaultProject(db, userId, project.id);
  }

  return project;
}

export async function ensureDefaultProjectForUser(
  supabase: unknown,
  userId: string,
) {
  const db = supabase as SupabaseQuerySurface;
  const existing = await findDefaultProjectForUser(db, userId);
  if (existing) return existing;

  try {
    return await createProjectForUser(db, userId, {
      name: DEFAULT_PROJECT_NAME,
      slug: DEFAULT_PROJECT_SLUG,
      isDefault: true,
    });
  } catch {
    const fallback = await findDefaultProjectForUser(db, userId);
    if (fallback) return fallback;
    throw new ProjectServiceError(
      "project_default_unavailable",
      "Projeto padrao indisponivel.",
      500,
    );
  }
}

export async function resolveProjectForConversationCreation(
  supabase: unknown,
  userId: string,
  projectId?: string,
) {
  const db = supabase as SupabaseQuerySurface;
  if (!projectId) {
    return ensureDefaultProjectForUser(db, userId);
  }

  const project = await findProjectByIdForUser(db, userId, projectId);
  if (!project || project.archivedAt) {
    throw new ProjectServiceError(
      "project_not_found",
      "Projeto nao encontrado.",
      404,
    );
  }
  return project;
}

export async function updateProjectForUser(
  supabase: unknown,
  userId: string,
  projectId: string,
  input: {
    name?: string;
    description?: string | null;
    archived?: boolean;
    isDefault?: boolean;
  },
) {
  const db = supabase as SupabaseQuerySurface;
  const project = await findProjectByIdForUser(db, userId, projectId);
  if (!project) {
    throw new ProjectServiceError("project_not_found", "Projeto nao encontrado.", 404);
  }

  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = normalizeText(input.name);
    if (!name) {
      throw new ProjectServiceError("project_invalid", "Projeto invalido.", 400);
    }
    updates.name = name;
    updates.slug = slugifyProjectName(name);
  }
  if (input.description !== undefined) {
    updates.description = input.description?.trim() || null;
  }
  if (input.archived !== undefined) {
    updates.archived_at = input.archived ? new Date().toISOString() : null;
  }
  if (input.isDefault !== undefined) {
    updates.is_default = input.isDefault;
  }

  const { data, error } = await db
    .from("projects")
    .update(updates)
    .eq("id", projectId)
    .eq("user_id", userId)
    .select("id,user_id,name,slug,description,is_default,archived_at,created_at,updated_at")
    .single();
  if (error) throw error;

  const updated = mapProject(data);
  if (updated.isDefault) {
    await ensureSingleDefaultProject(db, userId, updated.id);
  }

  return updated;
}

export async function setDefaultProjectForUser(
  supabase: unknown,
  userId: string,
  projectId: string,
) {
  const db = supabase as SupabaseQuerySurface;
  const project = await findProjectByIdForUser(db, userId, projectId);
  if (!project || project.archivedAt) {
    throw new ProjectServiceError("project_not_found", "Projeto nao encontrado.", 404);
  }

  await ensureSingleDefaultProject(db, userId, projectId);
  return updateProjectForUser(db, userId, projectId, { isDefault: true });
}

export async function deleteProjectForUser(
  supabase: unknown,
  userId: string,
  projectId: string,
) {
  const db = supabase as SupabaseQuerySurface;
  const project = await findProjectByIdForUser(db, userId, projectId);
  if (!project) {
    throw new ProjectServiceError("project_not_found", "Projeto nao encontrado.", 404);
  }

  const { data: conversations, error: countError } = await db
    .from("conversations")
    .select("id")
    .eq("user_id", userId)
    .eq("project_id", projectId);
  if (countError) throw countError;
  if (Array.isArray(conversations) && conversations.length > 0) {
    throw new ProjectServiceError(
      "project_delete_blocked",
      "Projeto nao pode ser excluido.",
      409,
    );
  }

  const activeDefault = await findDefaultProjectForUser(db, userId);
  if (activeDefault?.id === projectId) {
    throw new ProjectServiceError(
      "project_delete_blocked",
      "Projeto nao pode ser excluido.",
      409,
    );
  }

  const { error } = await db
    .from("projects")
    .delete()
    .eq("id", projectId)
    .eq("user_id", userId);
  if (error) throw error;

  return true;
}
