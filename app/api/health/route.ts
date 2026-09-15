import { getReleaseInfo } from "@/lib/version";

// Package 17.6: health publico continua minimo. Expoe apenas metadados
// nao-sensiveis (versao e ambiente logico). O SHA do commit permanece
// restrito ao diagnostico autenticado (/api/system/diagnostics).
export function GET() {
  const release = getReleaseInfo();
  return Response.json(
    {
      status: "ok",
      app: "Hanira AI",
      version: release.version,
      environment: release.environment,
      mode:
        process.env.HANIRA_DEMO_MODE === "true" ? "demo" : "production",
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
