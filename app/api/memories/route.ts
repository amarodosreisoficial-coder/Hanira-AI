import { apiErrorResponse } from "@/lib/api/errors";
import { requireSessionUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  deleteProjectMemory,
  listProjectMemories,
} from "@/services/memory";
import { resolveConversationProjectScope } from "@/services/project-context";

async function resolveOwnedConversationScope(userId: string, conversationId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase!
    .from("conversations")
    .select("id,metadata,project_id")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data?.id || typeof data.id !== "string") {
    return null;
  }

  return resolveConversationProjectScope({
    conversationId: data.id,
    metadata: data.metadata,
    relationalProjectId: data.project_id,
  });
}

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    if (user.demo) return Response.json({ memories: [], mode: "demo" });

    const conversationId = new URL(request.url).searchParams.get("conversationId");
    if (!conversationId) {
      return Response.json({ error: "Conversa invalida." }, { status: 400 });
    }

    const projectId = await resolveOwnedConversationScope(user.id, conversationId);
    if (!projectId) {
      return Response.json({ error: "Conversa nao encontrada." }, { status: 404 });
    }

    let data: Array<Record<string, unknown>>;
    try {
      const supabase = await createSupabaseServerClient();
      const { data: globalData, error: globalError } = await supabase!.from("memories").select("id,content,category,importance,created_at,updated_at,scope,project_id,origin").eq("user_id", user.id).eq("scope", "global").eq("is_active", true).limit(200);
      if (globalError) throw globalError;
      data = [...(globalData ?? []), ...(await listProjectMemories({ userId: user.id, projectId }))] as Array<Record<string, unknown>>;
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
      data = await listProjectMemories({ userId: user.id, projectId }) as Array<Record<string, unknown>>;
    }

    return Response.json({
      mode: "supabase",
      memories: (data ?? []).map((memory) => ({
        id: memory.id,
        content: memory.content,
        category: memory.category,
        importance: memory.importance,
        createdAt: memory.created_at,
        scope: memory.scope ?? (memory.project_id ? "project" : "global"),
        projectId: memory.project_id ?? null,
        updatedAt: memory.updated_at ?? memory.created_at,
        origin: memory.origin ?? "legacy",
      })),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireSessionUser();
    if (user.demo) return Response.json({ ok: true });

    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    const conversationId = url.searchParams.get("conversationId");
    if (!conversationId) {
      return Response.json({ error: "Conversa invalida." }, { status: 400 });
    }

    const projectId = await resolveOwnedConversationScope(user.id, conversationId);
    if (!projectId) {
      return Response.json({ error: "Conversa nao encontrada." }, { status: 404 });
    }

    await deleteProjectMemory({
      userId: user.id,
      projectId,
      id: id ?? undefined,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const payload = await request.json() as { content?: string; scope?: "global" | "project"; conversationId?: string };
    const content = payload.content?.trim() ?? "";
    if (!content || content.length > 500) return Response.json({ error: "Use entre 1 e 500 caracteres." }, { status: 400 });
    if (/\b(cpf|senha|cartão|doença|medicamento|conta bancária|chave pix|telefone|endereço|e-mail)\b/i.test(content)) return Response.json({ error: "Por privacidade, esse conteúdo não pode ser salvo como memória." }, { status: 400 });
    const scope = payload.scope ?? "global";
    let projectId: string | null = null;
    if (scope === "project") {
      if (!payload.conversationId) return Response.json({ error: "Selecione uma conversa do projeto." }, { status: 400 });
      projectId = await resolveOwnedConversationScope(user.id, payload.conversationId);
      if (!projectId || projectId.startsWith("legacy-conversation:")) return Response.json({ error: "Projeto inválido." }, { status: 400 });
    }
    if (user.demo) return Response.json({ ok: true, mode: "demo" });
    const supabase = await createSupabaseServerClient();
    const { data: duplicate } = await supabase!.from("memories").select("id").eq("user_id", user.id).eq("scope", scope).eq("project_id", projectId).eq("content", content).maybeSingle();
    if (duplicate) return Response.json({ error: "Essa memória já existe." }, { status: 409 });
    const { data, error } = await supabase!.from("memories").insert({ user_id: user.id, content, scope, project_id: projectId, category: "geral", importance: 3, origin: "manually_created" }).select("id").maybeSingle();
    if (error) throw error;
    return Response.json({ ok: true, id: data?.id });
  } catch (error) { return apiErrorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireSessionUser();
    if (user.demo) return Response.json({ ok: true });
    const payload = await request.json() as { id?: string; conversationId?: string; content?: string; scope?: "global" | "project"; projectId?: string };
    if (!payload.id || !payload.conversationId || typeof payload.content !== "string" || !payload.content.trim()) {
      return Response.json({ error: "Memoria invalida." }, { status: 400 });
    }
    const projectId = await resolveOwnedConversationScope(user.id, payload.conversationId);
    if (!projectId) return Response.json({ error: "Conversa nao encontrada." }, { status: 404 });
    const supabase = await createSupabaseServerClient();
    const targetScope = payload.scope ?? "project";
    if (targetScope === "project" && payload.projectId && payload.projectId !== projectId) return Response.json({ error: "Projeto invalido." }, { status: 400 });
    const update = { content: payload.content.trim(), updated_at: new Date().toISOString(), scope: targetScope, project_id: targetScope === "global" ? null : projectId };
    const { data, error } = await supabase!.from("memories").update(update).eq("id", payload.id).eq("user_id", user.id).select("id,content,category,importance,created_at,scope,project_id").maybeSingle();
    if (error) throw error;
    if (!data) return Response.json({ error: "Memoria nao encontrada." }, { status: 404 });
    return Response.json({ memory: { id: data.id, content: data.content, category: data.category, importance: data.importance, createdAt: data.created_at, scope: data.scope, projectId: data.project_id } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
