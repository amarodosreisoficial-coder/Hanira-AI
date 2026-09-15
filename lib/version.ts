// Package 17.6 — Identificacao de release (segura, sem segredos).
//
// Expoe apenas valores nao-sensiveis para observabilidade operacional:
// - versao da aplicacao (NEXT_PUBLIC_APP_VERSION);
// - commit SHA do build (fornecido pelo ambiente de deploy, ex. Vercel
//   VERCEL_GIT_COMMIT_SHA, ou HANIRA_GIT_COMMIT_SHA em deploy proprio);
// - ambiente logico (production/preview/development/self-hosted).
//
// Nenhuma chave, token, baseUrl ou dado de usuario entra aqui. O SHA do
// commit e informacao publica do repositorio e nunca e derivado de dados
// sensiveis.

export type ReleaseEnvironment =
  | "production"
  | "preview"
  | "development"
  | "self-hosted";

export interface ReleaseInfo {
  readonly version: string;
  readonly commitSha: string | null;
  readonly environment: ReleaseEnvironment;
}

const COMMIT_SHA_PATTERN = /^[0-9a-f]{7,40}$/i;

export function isValidCommitSha(value: unknown): value is string {
  return typeof value === "string" && COMMIT_SHA_PATTERN.test(value.trim());
}

/** Normaliza o SHA para minusculas; retorna null quando invalido/ausente. */
export function normalizeCommitSha(value: unknown): string | null {
  if (!isValidCommitSha(value)) return null;
  return (value as string).trim().toLowerCase();
}

function resolveEnvironment(env: NodeJS.ProcessEnv): ReleaseEnvironment {
  const vercelEnv = env.VERCEL_ENV;
  if (vercelEnv === "production") return "production";
  if (vercelEnv === "preview") return "preview";
  if (env.NODE_ENV === "development") return "development";
  return "self-hosted";
}

export function getReleaseInfo(
  env: NodeJS.ProcessEnv = process.env,
): ReleaseInfo {
  const version =
    typeof env.NEXT_PUBLIC_APP_VERSION === "string" &&
    env.NEXT_PUBLIC_APP_VERSION.trim()
      ? env.NEXT_PUBLIC_APP_VERSION.trim()
      : "unknown";
  return {
    version,
    commitSha: normalizeCommitSha(
      env.VERCEL_GIT_COMMIT_SHA ?? env.HANIRA_GIT_COMMIT_SHA,
    ),
    environment: resolveEnvironment(env),
  };
}
