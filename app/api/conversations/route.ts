import { apiErrorResponse } from "@/lib/api/errors";
import { requireSessionUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { conversationCreateSchema } from "@/lib/validation/chat";

export async function GET() {
  try {
    const user = await requireSessionUser();
    if (user.demo) {
      return Response.json({ conversations: [], mode: "demo" });
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase!
      .from("conversations")
      .select("id,title,updated_at,archived_at")
      .eq("user_id", user.id)
      .is("archived_at", null)
      .order("updated_at", { ascending: false });
    if (error) throw error;

    return Response.json({
      mode: "supabase",
      conversations: (data ?? []).map((item) => ({
        id: item.id,
        title: item.title,
        updatedAt: item.updated_at,
        archivedAt: item.archived_at,
        messages: [],
      })),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const payload = conversationCreateSchema.parse(await request.json());
    const now = new Date().toISOString();
    if (user.demo) {
      return Response.json({
        conversation: {
          id: crypto.randomUUID(),
          title: payload.title ?? "Uma nova conversa",
          updatedAt: now,
          messages: [],
        },
      });
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase!
      .from("conversations")
      .insert({ user_id: user.id, title: payload.title ?? "Uma nova conversa" })
      .select("id,title,updated_at,archived_at")
      .single();
    if (error) throw error;

    return Response.json({
      conversation: {
        id: data.id,
        title: data.title,
        updatedAt: data.updated_at,
        archivedAt: data.archived_at,
        messages: [],
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
