import { ZodError } from "zod";

export function apiErrorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return Response.json(
      { error: error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 },
    );
  }
  if (error instanceof Error && error.message === "UNAUTHENTICATED") {
    return Response.json({ error: "Faça login para continuar." }, { status: 401 });
  }
  console.error("[hanira-api]", {
    type: error instanceof Error ? error.name : "UnknownError",
  });
  return Response.json(
    { error: "Não foi possível concluir a operação." },
    { status: 500 },
  );
}
