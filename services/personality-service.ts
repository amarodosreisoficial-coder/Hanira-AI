import "server-only";

interface QueryResult {
  data?: unknown;
  error?: unknown;
}

interface QueryBuilder {
  select(query: string): QueryBuilder;
  insert(value: Record<string, unknown>): QueryBuilder;
  update(value: Record<string, unknown>): QueryBuilder;
  delete(): QueryBuilder;
  eq(column: string, value: unknown): QueryBuilder;
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

export interface PersonalityRecord {
  id: string;
  projectId: string;
  name: string;
  instructions: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export class PersonalityServiceError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "PersonalityServiceError";
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

function mapPersonality(value: unknown): PersonalityRecord {
  const row = toRecord(value);
  if (!row || typeof row.id !== "string" || typeof row.project_id !== "string") {
    throw new PersonalityServiceError("personality_invalid", "Personalidade invalida.", 500);
  }

  return {
    id: row.id,
    projectId: row.project_id,
    name: normalizeText(row.name),
    instructions: typeof row.instructions === "string" ? row.instructions : "",
    isActive: Boolean(row.is_active),
    createdAt: typeof row.created_at === "string" ? row.created_at : "",
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : "",
  };
}

export async function listPersonalitiesForProject(
  supabase: unknown,
  projectId: string,
) {
  const db = supabase as SupabaseQuerySurface;
  const { data, error } = await db
    .from("personalities")
    .select("id,project_id,name,instructions,is_active,created_at,updated_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  return (Array.isArray(data) ? data : []).map(mapPersonality);
}

export async function findActivePersonalityByProject(
  supabase: unknown,
  projectId: string,
) {
  const db = supabase as SupabaseQuerySurface;
  const { data, error } = await db
    .from("personalities")
    .select("id,project_id,name,instructions,is_active,created_at,updated_at")
    .eq("project_id", projectId)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return mapPersonality(data);
}

export async function findPersonalityByIdForProject(
  supabase: unknown,
  projectId: string,
  personalityId: string,
) {
  const db = supabase as SupabaseQuerySurface;
  const { data, error } = await db
    .from("personalities")
    .select("id,project_id,name,instructions,is_active,created_at,updated_at")
    .eq("id", personalityId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return mapPersonality(data);
}

export async function createPersonalityForProject(
  supabase: unknown,
  projectId: string,
  input: {
    name: string;
    instructions: string;
    isActive?: boolean;
  },
) {
  const name = normalizeText(input.name);
  if (!name) {
    throw new PersonalityServiceError("personality_invalid", "Personalidade invalida.", 400);
  }

  const db = supabase as SupabaseQuerySurface;
  const { data, error } = await db
    .from("personalities")
    .insert({
      project_id: projectId,
      name,
      instructions: input.instructions ?? "",
      is_active: Boolean(input.isActive),
    })
    .select("id,project_id,name,instructions,is_active,created_at,updated_at")
    .single();
  if (error) throw error;

  const personality = mapPersonality(data);
  if (personality.isActive) {
    await db
      .from("personalities")
      .update({ is_active: false })
      .eq("project_id", projectId)
      .neq("id", personality.id);
  }

  return personality;
}

export async function updatePersonalityForProject(
  supabase: unknown,
  projectId: string,
  personalityId: string,
  input: {
    name?: string;
    instructions?: string;
    isActive?: boolean;
  },
) {
  const db = supabase as SupabaseQuerySurface;
  const current = await findPersonalityByIdForProject(db, projectId, personalityId);
  if (!current) {
    throw new PersonalityServiceError(
      "personality_not_found",
      "Personalidade nao encontrada.",
      404,
    );
  }

  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = normalizeText(input.name);
    if (!name) {
      throw new PersonalityServiceError("personality_invalid", "Personalidade invalida.", 400);
    }
    updates.name = name;
  }
  if (input.instructions !== undefined) {
    updates.instructions = input.instructions;
  }
  if (input.isActive !== undefined) {
    updates.is_active = input.isActive;
  }

  const { data, error } = await db
    .from("personalities")
    .update(updates)
    .eq("id", personalityId)
    .eq("project_id", projectId)
    .select("id,project_id,name,instructions,is_active,created_at,updated_at")
    .single();
  if (error) throw error;

  const personality = mapPersonality(data);
  if (personality.isActive) {
    await db
      .from("personalities")
      .update({ is_active: false })
      .eq("project_id", projectId)
      .neq("id", personality.id);
  }

  return personality;
}

export async function deletePersonalityForProject(
  supabase: unknown,
  projectId: string,
  personalityId: string,
) {
  const db = supabase as SupabaseQuerySurface;
  const { error } = await db
    .from("personalities")
    .delete()
    .eq("id", personalityId)
    .eq("project_id", projectId);
  if (error) throw error;
}
