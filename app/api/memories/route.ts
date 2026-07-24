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

    const data = await listProjectMemories({
      userId: user.id,
      projectId,
    });

    return Response.json({
      mode: "supabase",
      memories: (data ?? []).map((memory) => ({
        id: memory.id,
        content: memory.content,
        category: memory.category,
        importance: memory.importance,
        createdAt: memory.created_at,
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
