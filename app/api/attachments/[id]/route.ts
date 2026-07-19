import { apiErrorResponse } from "@/lib/api/errors";
import { requireSessionUser } from "@/lib/auth/session";
import { deleteOwnedAttachment } from "@/services/attachments";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireSessionUser();
    const { id } = await context.params;
    if (user.demo) return Response.json({ ok: true });
    const deleted = await deleteOwnedAttachment(user.id, id);
    if (!deleted) {
      return Response.json({ error: "Anexo não encontrado." }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
