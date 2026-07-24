import { apiErrorResponse } from "@/lib/api/errors";
import { requireSessionUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  personalityCreateSchema,
} from "@/lib/validation/chat";
import {
  findProjectByIdForUser,
} from "@/services/project-service";
import {
  createPersonalityForProject,
  listPersonalitiesForProject,
} from "@/services/personality-service";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    if (user.demo) {
      return Response.json({ personalities: [], mode: "demo" });
    }

    const supabase = await createSupabaseServerClient();
    const project = await findProjectByIdForUser(supabase!, user.id, id);
    if (!project) {
      return Response.json({ error: "Projeto nao encontrado." }, { status: 404 });
    }

    const personalities = await listPersonalitiesForProject(supabase!, project.id);
    return Response.json({ personalities });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const payload = personalityCreateSchema.parse(await request.json());
    if (user.demo) {
      return Response.json({
        personality: {
          id: crypto.randomUUID(),
          projectId: id,
          name: payload.name,
          instructions: payload.instructions,
          isActive: Boolean(payload.isActive),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });
    }

    const supabase = await createSupabaseServerClient();
    const project = await findProjectByIdForUser(supabase!, user.id, id);
    if (!project) {
      return Response.json({ error: "Projeto nao encontrado." }, { status: 404 });
    }

    const personality = await createPersonalityForProject(
      supabase!,
      project.id,
      payload,
    );
    return Response.json({ personality }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
