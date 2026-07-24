import { apiErrorResponse } from "@/lib/api/errors";
import { requireSessionUser } from "@/lib/auth/session";
import { createRequestId } from "@/lib/logging/server";
import { logProjectCreated } from "@/lib/logging/project-events";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { projectCreateSchema } from "@/lib/validation/chat";
import {
  createProjectForUser,
  listProjectsForUser,
} from "@/services/project-service";

export async function GET() {
  try {
    const user = await requireSessionUser();
    if (user.demo) return Response.json({ projects: [], mode: "demo" });

    const supabase = await createSupabaseServerClient();
    const projects = await listProjectsForUser(supabase!, user.id);

    return Response.json({
      mode: "supabase",
      projects,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const requestId = createRequestId(request);
    const payload = projectCreateSchema.parse(await request.json());
    if (user.demo) {
      return Response.json({
        project: {
          id: crypto.randomUUID(),
          userId: user.id,
          name: payload.name,
          slug: payload.name.toLowerCase().replace(/\s+/g, "-"),
          description: payload.description ?? null,
          isDefault: Boolean(payload.isDefault),
          archivedAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });
    }

    const supabase = await createSupabaseServerClient();
    const project = await createProjectForUser(supabase!, user.id, payload);
    logProjectCreated({
      requestId,
      route: "/api/projects",
      userId: user.id,
      projectId: project.id,
      status: 201,
    });

    return Response.json({ project }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
