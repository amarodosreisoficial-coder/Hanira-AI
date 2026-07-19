import { requireSessionUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireSessionUser().catch(() => null);
  if (!user) return new Response(null, { status: 401 });
  if (user.demo) return new Response(null, { status: 404 });
  const { id } = await context.params;
  const supabase = await createSupabaseServerClient();
  const { data: attachment } = await supabase!
    .from("attachments")
    .select("storage_bucket,storage_path")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!attachment) return new Response(null, { status: 404 });

  const { data, error } = await supabase!.storage
    .from(attachment.storage_bucket)
    .createSignedUrl(attachment.storage_path, 60);
  if (error || !data?.signedUrl) return new Response(null, { status: 404 });
  return new Response(null, {
    status: 302,
    headers: {
      Location: data.signedUrl,
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
