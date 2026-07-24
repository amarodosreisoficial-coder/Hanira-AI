import { apiErrorResponse } from "@/lib/api/errors";
import { requireSessionUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { personalityUpdateSchema } from "@/lib/validation/chat";
import { listProjectsForUser } from "@/services/project-service";
import {
  deletePersonalityForProject,
  findPersonalityByIdForProject,
  updatePersonalityForProject,
} from "@/services/personality-service";

type Context = { params: Promise<{ id: string }> };

async function findOwnedPersonalityContext(
  userId: string,
  personalityId: string,
) {
  const supabase = await createSupabaseServerClient();
  const projects = await listProjectsForUser(supabase!, userId);

  for (const project of projects) {
    const personality = await findPersonalityByIdForProject(
      supabase!,
      project.id,
      personalityId,
    );
    if (personality) {
      return { supabase: supabase!, project, personality };
    }
  }

  return { supabase: supabase!, project: null, personality: null };
}

export async function GET(_request: Request, { params }: Context) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    if (user.demo) {
      return Response.json({ error: "Personalidade local." }, { status: 404 });
    }

    const { personality } = await findOwnedPersonalityContext(user.id, id);
    if (!personality) {
      return Response.json({ error: "Personalidade nao encontrada." }, { status: 404 });
    }

    return Response.json({ personality });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const payload = personalityUpdateSchema.parse(await request.json());
    if (user.demo) return Response.json({ ok: true });

    const { supabase, project, personality } = await findOwnedPersonalityContext(
      user.id,
      id,
    );
    if (!project || !personality) {
      return Response.json({ error: "Personalidade nao encontrada." }, { status: 404 });
    }

    const updated = await updatePersonalityForProject(
      supabase,
      project.id,
      personality.id,
      payload,
    );
    return Response.json({ personality: updated });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    if (user.demo) return Response.json({ ok: true });

    const { supabase, project, personality } = await findOwnedPersonalityContext(
      user.id,
      id,
    );
    if (!project || !personality) {
      return Response.json({ error: "Personalidade nao encontrada." }, { status: 404 });
    }

    await deletePersonalityForProject(supabase, project.id, personality.id);
    return Response.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
