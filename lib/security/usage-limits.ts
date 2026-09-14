// Package 17.5 — Distributed Usage Guard: limites diarios resolvidos via env.
// - texto default 200/dia (compativel com Pacote 16.5);
// - imagem default 10/dia (novo);
// - limite 0 desativa a quota (comportamento pre-17.5);
// - env invalida lanca erro claro (fail-closed, nunca limite silencioso);
// - zero billing, zero paid provider, zero hardcode de plano.

export const USER_DAILY_MESSAGE_LIMIT_ENV = "HANIRA_USER_DAILY_MESSAGE_LIMIT";
export const IMAGE_DAILY_LIMIT_ENV = "HANIRA_IMAGE_DAILY_LIMIT";

export const DEFAULT_TEXT_DAILY_LIMIT = 200;
export const DEFAULT_IMAGE_DAILY_LIMIT = 10;

export const USER_QUOTA_LIMIT_BOUNDS = { min: 0, max: 100_000 } as const;
export const IMAGE_QUOTA_LIMIT_BOUNDS = { min: 0, max: 1_000 } as const;

function resolveBoundedLimit(
  envName: string,
  fallback: number,
  bounds: { readonly min: number; readonly max: number },
): number {
  const rawValue = process.env[envName];
  if (rawValue === undefined || rawValue.trim() === "") {
    return fallback;
  }
  const value = rawValue.trim();
  if (!/^\d+$/.test(value)) {
    throw new Error(
      `A configuracao ${envName} deve ser um inteiro entre ${bounds.min} e ${bounds.max} (0 desativa a quota).`,
    );
  }
  const parsed = Number(value);
  if (parsed < bounds.min || parsed > bounds.max) {
    throw new Error(
      `A configuracao ${envName} deve estar entre ${bounds.min} e ${bounds.max} (0 desativa a quota).`,
    );
  }
  return parsed;
}

export function resolveTextDailyLimit(): number {
  return resolveBoundedLimit(
    USER_DAILY_MESSAGE_LIMIT_ENV,
    DEFAULT_TEXT_DAILY_LIMIT,
    USER_QUOTA_LIMIT_BOUNDS,
  );
}

export function resolveImageDailyLimit(): number {
  return resolveBoundedLimit(
    IMAGE_DAILY_LIMIT_ENV,
    DEFAULT_IMAGE_DAILY_LIMIT,
    IMAGE_QUOTA_LIMIT_BOUNDS,
  );
}

export type UsageKind = "text" | "image";

export function resolveDailyLimitForKind(kind: UsageKind): number {
  return kind === "image" ? resolveImageDailyLimit() : resolveTextDailyLimit();
}
