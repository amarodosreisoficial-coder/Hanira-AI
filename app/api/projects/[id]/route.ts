import { apiErrorResponse } from "@/lib/api/errors";
import { requireSessionUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { projectUpdateSchema } from "@/lib/validation/chat";
import {
  deleteProjectForUser,
  findProjectByIdForUser,
  setDefaultProjectForUser,
  updateProjectForUser,
} from "@/services/project-service";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    if (user.demo) {
      return Response.json({ error: "Projeto local." }, { status: 404 });
    }

    const supabase = await createSupabaseServerClient();
    const project = await findProjectByIdForUser(supabase!, user.id, id);
    if (!project) {
      return Response.json({ error: "Projeto nao encontrado." }, { status: 404 });
    }

    return Response.json({ project });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const payload = projectUpdateSchema.parse(await request.json());
    if (user.demo) return Response.json({ ok: true });

    const supabase = await createSupabaseServerClient();
    const project = payload.isDefault
      ? await setDefaultProjectForUser(supabase!, user.id, id)
      : await updateProjectForUser(supabase!, user.id, id, payload);

    return Response.json({ project });
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
    await deleteProjectForUser(supabase!, user.id, id);
    return Response.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
