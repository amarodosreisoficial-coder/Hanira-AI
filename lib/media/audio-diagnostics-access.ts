// Package 18.3.3 — Real Device Audio Validation Harness.
// Portão de ambiente para o harness de diagnóstico. Puro (sem DOM, sem
// "server-only"), importável da página (servidor) e da rota de API, e
// testável sem navegador.
//
// Regra (fail-closed): o diagnóstico só fica acessível em:
//   - desenvolvimento local (NODE_ENV=development);
//   - Vercel PREVIEW (VERCEL_ENV=preview).
// Em produção principal (VERCEL_ENV=production) e self-hosted production
// (NODE_ENV=production sem VERCEL_ENV) o diagnóstico é BLOQUEADO (404).

export type DiagnosticsAccess = "development" | "preview" | "blocked";

interface DiagnosticsEnvLike {
  NODE_ENV?: string;
  VERCEL_ENV?: string;
}

/** Resolve o modo de acesso do diagnóstico para um dado ambiente. */
export function resolveDiagnosticsAccess(
  env: DiagnosticsEnvLike,
): DiagnosticsAccess {
  const vercelEnv = env.VERCEL_ENV;
  // Produção principal: sempre bloqueado, independente de NODE_ENV.
  if (vercelEnv === "production") return "blocked";
  // Preview HTTPS da branch: permitido.
  if (vercelEnv === "preview") return "preview";
  // Desenvolvimento local: permitido.
  if (env.NODE_ENV === "development") return "development";
  // Self-hosted/produção/test: bloqueado por padrão (fail-closed).
  return "blocked";
}

/** true somente quando o diagnóstico é explicitamente permitido. */
export function isDiagnosticsAllowed(
  env: DiagnosticsEnvLike = process.env,
): boolean {
  return resolveDiagnosticsAccess(env) !== "blocked";
}
