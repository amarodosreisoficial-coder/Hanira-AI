import "server-only";

// Nira Concurrency Guard (Pacote 16.5 - Fase 1 do roadmap: protecao
// per-usuario/sessao).
//
// Proposito: prevenir que um unico usuario/sessao envie muitas requisicoes
// de Nira simultaneamente (abismo de capacidade free, double-submit
// acidental).
//
// Propriedades desta camada:
// - IN-MEMORY, por instancia de processo: estado nao e compartilhado entre
//   instancias (serverless/Vercel Hobby). Documentado como best-effort e
//   nao autoritativo; protege contra abuso grosseiro, nao medicao exata;
// - USA userId autenticado como identidade (nunca expõe IP como identidade
//   primaria); a rota de chat ja exige sessao antes de chegar aqui;
// - fail-closed: env invalida falha com erro claro, nunca limites silentemente
//   errados;
// - SEM novas dependencias, SEM Supabase, SEM Redis, SEM migracoes;
// - SEM segredos: apenas ids logicos de usuario/requisicao entram aqui;
// - limite 0 e tratado como "desativado" (comportamento pre-16.5).
//
// Contrato de uso (try/finally ou callbacks de terminal):
//   const acquired = tryAcquireConcurrencyLock(userId, requestId);
//   if (!acquired) return 429;
//   try { ... stream ... }
//   finally { releaseConcurrencyLock(userId, requestId); }

export const CONCURRENCY_MAX_PER_USER_ENV = "HANIRA_CONCURRENCY_MAX_PER_USER";

// Limite default conservador: 1 requisicao ativa por usuario. Em Vercel Hobby
// (onde a instancia e compartilhada por escala), isto protege a capacidade
// free contra picos simultaneo. Ajuste via env se o operador entender o risco.
export const DEFAULT_MAX_CONCURRENT_PER_USER = 1;

// 0 desativa a guarda (comportamento pre-16.5). 1+ = limite ativo.
export const CONCURRENCY_MAX_BOUNDS = { min: 0, max: 10 } as const;

export function resolveMaxConcurrentPerUser(): number {
  const rawValue = process.env[CONCURRENCY_MAX_PER_USER_ENV];
  if (rawValue === undefined || rawValue.trim() === "") {
    return DEFAULT_MAX_CONCURRENT_PER_USER;
  }

  const value = rawValue.trim();
  if (!/^\d+$/.test(value)) {
    throw new Error(
      `A configuracao ${CONCURRENCY_MAX_PER_USER_ENV} deve ser um inteiro positivo entre ${CONCURRENCY_MAX_BOUNDS.min} e ${CONCURRENCY_MAX_BOUNDS.max}.`,
    );
  }

  const parsed = Number(value);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < CONCURRENCY_MAX_BOUNDS.min ||
    parsed > CONCURRENCY_MAX_BOUNDS.max
  ) {
    throw new Error(
      `A configuracao ${CONCURRENCY_MAX_PER_USER_ENV} deve estar entre ${CONCURRENCY_MAX_BOUNDS.min} e ${CONCURRENCY_MAX_BOUNDS.max}.`,
    );
  }

  return parsed;
}

// Mapa de usuarios com requisicoes ativas. Chave = userId; valor = Set de
// requestIds ativos. Limitado a MAX_ACTIVE_LOCK_USERS entradas para evitar
// vazamento de memoria de usuarios inativos.
const activeLocks = new Map<string, Set<string>>();
const MAX_ACTIVE_LOCK_USERS = 10_000;

/**
 * Tenta adquirir um lock de concorrencia para o usuario/requisicao.
 * - limite 0 -> sempre permitido (guarda desativada);
 * - dentro do limite -> true, requestId adicionado ao conjunto ativo;
 * - limite atingido -> false (requisicao deve ser rejeitada com 429).
 *
 * Nenhuma chamada de rede ou Supabase aqui: operacao puramente em memoria.
 */
export function tryAcquireConcurrencyLock(
  userId: string,
  requestId: string,
): boolean {
  if (!userId || userId.trim().length === 0) {
    throw new Error("O concurrency lock exige um userId nao vazio.");
  }
  if (!requestId || requestId.trim().length === 0) {
    throw new Error("O concurrency lock exige um requestId nao vazio.");
  }

  const limit = resolveMaxConcurrentPerUser();

  // Limite 0 desativa a guarda (comportamento pre-16.5).
  if (limit === 0) {
    return true;
  }

  let locks = activeLocks.get(userId);
  if (!locks) {
    // Evita vazamento de memoria: limpa usuarios inativos periodicamente.
    if (activeLocks.size > MAX_ACTIVE_LOCK_USERS) {
      for (const [existingUserId, existingLocks] of activeLocks) {
        if (existingLocks.size === 0) {
          activeLocks.delete(existingUserId);
        }
      }
    }
    locks = new Set();
    activeLocks.set(userId, locks);
  }

  if (locks.size >= limit) {
    return false;
  }

  locks.add(requestId);
  return true;
}

/**
 * Libera o lock de concorrencia para o usuario/requisicao. Seguro chamar
 * multiplas vezes: chamadas repetidas sao ignoradas.
 *
 * Deve ser chamado em finally/callbacks de terminal (onComplete, onFailed,
 * onCancelled) para garantir liberacao mesmo em caso de erro.
 */
export function releaseConcurrencyLock(
  userId: string,
  requestId: string,
): void {
  if (!userId || !requestId) return;

  const locks = activeLocks.get(userId);
  if (!locks) return;

  locks.delete(requestId);

  if (locks.size === 0) {
    activeLocks.delete(userId);
  }
}

/**
 * Cria um helper de liberacao unica para callbacks (evita double-release).
 * Uso típico dentro de onComplete/onFailed/onCancelled do stream.
 */
export function createConcurrencyLockReleaser(
  userId: string,
  requestId: string,
): () => void {
  let released = false;
  return () => {
    if (!released) {
      released = true;
      releaseConcurrencyLock(userId, requestId);
    }
  };
}

// --- Test helpers ---

/** Limpa todo o estado (uso exclusivo de testes). */
export function resetConcurrencyGuardForTests(): void {
  activeLocks.clear();
}

/** Contagem total de locks ativos em todas as usuarios (uso exclusivo de testes). */
export function concurrencyLockCountForTests(): number {
  let count = 0;
  for (const locks of activeLocks.values()) {
    count += locks.size;
  }
  return count;
}

/** Quantidade de locks ativos para um usuario especifico (uso exclusivo de testes). */
export function userConcurrencyLockCountForTests(userId: string): number {
  return activeLocks.get(userId)?.size ?? 0;
}
