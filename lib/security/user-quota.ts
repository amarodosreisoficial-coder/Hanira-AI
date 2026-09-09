// Quota interna simples por usuario (Pacote 16.5 - Fase 1 do roadmap:
// "Quotas internas simples por usuario").
//
// Versao SIMPLES de proposito:
// - janela diaria por usuario (dia UTC), contagem em memoria do processo;
// - um unico limite default, configuravel por env (sem tiers/planos — nenhum
//   hardcode de plano pago; billing permanece fora de escopo);
// - sem persistencia: a quota e best-effort por instancia (serverless com
//   multiplas instancias aplicaria o limite por instancia). O objetivo e
//   proteger a capacidade free de abuso grosseiro, nao medicao exata;
// - limite 0 desativa a quota (comportamento anterior ao Pacote 16.5).
//
// Seguranca: so recebe userId autenticado; nenhuma chave, segredo ou conteudo
// de mensagem entra aqui. Falha de configuracao e fail-closed (env invalida
// lanca erro claro em vez de limites silenciosamente errados).

// Limite diario default de mensagens por usuario.
const DEFAULT_DAILY_MESSAGE_LIMIT = 200;

export const USER_QUOTA_LIMIT_BOUNDS = { min: 0, max: 100_000 } as const;

export const USER_DAILY_MESSAGE_LIMIT_ENV = "HANIRA_USER_DAILY_MESSAGE_LIMIT";

export function resolveUserDailyMessageLimit(): number {
  const rawValue = process.env[USER_DAILY_MESSAGE_LIMIT_ENV];
  if (rawValue === undefined || rawValue.trim() === "") {
    return DEFAULT_DAILY_MESSAGE_LIMIT;
  }
  const value = rawValue.trim();
  if (!/^\d+$/.test(value)) {
    throw new Error(
      `A configuracao ${USER_DAILY_MESSAGE_LIMIT_ENV} deve ser um inteiro entre ${USER_QUOTA_LIMIT_BOUNDS.min} e ${USER_QUOTA_LIMIT_BOUNDS.max} (0 desativa a quota).`,
    );
  }
  const parsed = Number(value);
  if (parsed < USER_QUOTA_LIMIT_BOUNDS.min || parsed > USER_QUOTA_LIMIT_BOUNDS.max) {
    throw new Error(
      `A configuracao ${USER_DAILY_MESSAGE_LIMIT_ENV} deve estar entre ${USER_QUOTA_LIMIT_BOUNDS.min} e ${USER_QUOTA_LIMIT_BOUNDS.max} (0 desativa a quota).`,
    );
  }
  return parsed;
}

export interface UserQuotaDecision {
  readonly allowed: boolean;
  readonly limit: number;
  // Mensagens que ainda cabem no dia; null quando a quota esta desativada.
  readonly remaining: number | null;
  // Segundos ate a janela diaria virar (uso no header Retry-After).
  readonly retryAfterSeconds: number;
}

const dailyUsage = new Map<string, number>();

// Limite defensivo de chaves em memoria; acima disso, entradas de dias
// anteriores sao descartadas.
const MAX_DAILY_USAGE_ENTRIES = 10_000;

function utcDayKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

function secondsUntilNextUtcDay(nowMs: number): number {
  const now = new Date(nowMs);
  const nextUtcDayStartMs = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  );
  return Math.max(1, Math.ceil((nextUtcDayStartMs - nowMs) / 1000));
}

/**
 * Consome 1 mensagem da quota diaria do usuario.
 * - quota desativada (limite 0) -> sempre permitido;
 * - dentro do limite -> permitido com remaining atualizado;
 * - limite atingido -> bloqueado com retryAfterSeconds para o proximo dia UTC.
 */
export function checkUserMessageQuota(
  userId: string,
  nowMs: number = Date.now(),
): UserQuotaDecision {
  if (typeof userId !== "string" || userId.trim().length === 0) {
    throw new Error("A quota de mensagens exige um userId nao vazio.");
  }

  const limit = resolveUserDailyMessageLimit();
  if (limit === 0) {
    return { allowed: true, limit, remaining: null, retryAfterSeconds: 0 };
  }

  const dayKey = utcDayKey(nowMs);
  const key = `${userId}:${dayKey}`;
  const used = dailyUsage.get(key) ?? 0;

  if (used >= limit) {
    return {
      allowed: false,
      limit,
      remaining: 0,
      retryAfterSeconds: secondsUntilNextUtcDay(nowMs),
    };
  }

  dailyUsage.set(key, used + 1);

  if (dailyUsage.size > MAX_DAILY_USAGE_ENTRIES) {
    for (const existingKey of dailyUsage.keys()) {
      if (!existingKey.endsWith(`:${dayKey}`)) {
        dailyUsage.delete(existingKey);
      }
    }
  }

  return {
    allowed: true,
    limit,
    remaining: limit - used - 1,
    retryAfterSeconds: 0,
  };
}

/** Limpa o uso registrado (uso exclusivo de testes). */
export function resetUserQuotaForTests(): void {
  dailyUsage.clear();
}

/** Quantidade de chaves em memoria (uso exclusivo de testes). */
export function userQuotaEntriesForTests(): number {
  return dailyUsage.size;
}