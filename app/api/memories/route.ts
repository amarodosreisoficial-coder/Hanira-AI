import { apiErrorResponse } from "@/lib/api/errors";
import { requireSessionUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const user = await requireSessionUser();
    if (user.demo) return Response.json({ memories: [], mode: "demo" });

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase!
      .from("memories")
      .select("id,content,category,importance,created_at")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("importance", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw error;

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

    const id = new URL(request.url).searchParams.get("id");
    const supabase = await createSupabaseServerClient();
    let query = supabase!.from("memories").delete().eq("user_id", user.id);
    if (id) query = query.eq("id", id);
    const { error } = await query;
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
