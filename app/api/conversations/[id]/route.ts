import { apiErrorResponse } from "@/lib/api/errors";
import { requireSessionUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { conversationUpdateSchema } from "@/lib/validation/chat";
import { ATTACHMENT_BUCKETS, attachmentFromRow } from "@/services/attachments";
import { resolveProjectForConversationCreation } from "@/services/project-service";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    if (user.demo) {
      return Response.json({ error: "Conversa local." }, { status: 404 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: conversation, error } = await supabase!
      .from("conversations")
      .select("id,title,updated_at,archived_at,project_id")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();
    if (error || !conversation) {
      return Response.json({ error: "Conversa nao encontrada." }, { status: 404 });
    }

    const { data: messages, error: messagesError } = await supabase!
      .from("messages")
      .select("id,role,content,created_at")
      .eq("conversation_id", id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });
    if (messagesError) throw messagesError;
    const { data: attachments, error: attachmentsError } = await supabase!
      .from("attachments")
      .select(
        "id,user_id,conversation_id,message_id,type,storage_bucket,storage_path,original_name,mime_type,size_bytes,metadata",
      )
      .eq("conversation_id", id)
      .eq("user_id", user.id)
      .not("message_id", "is", null);
    if (attachmentsError) throw attachmentsError;

    return Response.json({
      conversation: {
        id: conversation.id,
        title: conversation.title,
        projectId: conversation.project_id,
        updatedAt: conversation.updated_at,
        archivedAt: conversation.archived_at,
        messages: (messages ?? []).map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          createdAt: message.created_at,
          attachments: (attachments ?? [])
            .filter((attachment) => attachment.message_id === message.id)
            .map((attachment) => attachmentFromRow(attachment)),
        })),
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const payload = conversationUpdateSchema.parse(await request.json());
    if (user.demo) return Response.json({ ok: true });

    const supabase = await createSupabaseServerClient();
    const updates: Record<string, string | null> = {};
    if (payload.title !== undefined) updates.title = payload.title;
    if (payload.archived !== undefined) {
      updates.archived_at = payload.archived ? new Date().toISOString() : null;
    }
    if (payload.projectId !== undefined) {
      const project = await resolveProjectForConversationCreation(
        supabase!,
        user.id,
        payload.projectId,
      );
      updates.project_id = project.id;
    }

    const { data: attachments, error: attachmentsError } = await supabase!
      .from("attachments")
      .select("storage_bucket,storage_path")
      .eq("conversation_id", id)
      .eq("user_id", user.id);
    if (attachmentsError) throw attachmentsError;
    for (const bucket of Object.values(ATTACHMENT_BUCKETS)) {
      const paths = (attachments ?? [])
        .filter((attachment) => attachment.storage_bucket === bucket)
        .map((attachment) => attachment.storage_path);
      if (paths.length) {
        const { error: storageError } = await supabase!.storage
          .from(bucket)
          .remove(paths);
        if (storageError) throw storageError;
      }
    }
    const { error, count } = await supabase!
      .from("conversations")
      .update(updates, { count: "exact" })
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) throw error;
    if (!count) {
      return Response.json({ error: "Conversa nao encontrada." }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    if (user.demo) return Response.json({ ok: true });

    const supabase = await createSupabaseServerClient();
    const { error, count } = await supabase!
      .from("conversations")
      .delete({ count: "exact" })
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) throw error;
    if (!count) {
      return Response.json({ error: "Conversa nao encontrada." }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
