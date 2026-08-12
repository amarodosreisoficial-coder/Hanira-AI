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

    const data = await listProjectMemories({ userId: user.id, projectId });

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
