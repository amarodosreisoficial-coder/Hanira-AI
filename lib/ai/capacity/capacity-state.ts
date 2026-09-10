import { ModelRouterError } from "@/lib/ai/router/errors";
import type { RouterAvailabilityState } from "@/lib/ai/router/cost-policy";

// Nira Capacity Engine - estado de disponibilidade por candidato (Pacote 16.5).
//
// Ativa os estados RESERVADOS do vocabulario de disponibilidade do router
// ("rate_limited" e "unhealthy", definidos em lib/ai/router/cost-policy.ts)
// com sinais REAIS de runtime: erros classificados do provider, reportados pela
// rota de chat. Nada finge disponibilidade:
//
// - um candidato so entra em cooldown quando ha sinal classificado de erro
//   transiente (rate_limit, unavailable, timeout, provider_error);
// - o cooldown expira de forma deterministica e lazy (sem timers);
// - erros deterministicos (invalid_request, model_not_found,
//   unsupported_capability) sao REGISTRADOS mas NAO geram cooldown: sao
//   problemas de configuracao/contrato que o registry deve corrigir, nao
//   instabilidade transiente;
// - sucesso limpa o estado imediatamente.
//
// Propriedades desta camada:
// - estado em memoria do processo, sem Supabase, sem Redis, sem novas
//   dependencias (Pacote 16.5 nao altera infraestrutura);
// - nenhuma chave, segredo, prompt ou mensagem entra aqui: as chaves do mapa
//   sao ids logicos de candidatos do router;
// - fail-closed na configuracao: env invalida falha com
//   ModelRouterError(invalid_configuration).

export type CapacitySignalCode =
  | "rate_limit"
  | "unavailable"
  | "timeout"
  | "provider_error"
  | "model_not_found"
  | "invalid_request"
  | "unsupported_capability"
  | "unknown";

// Erros transientes: representam instabilidade/capacidade do provider e
// justificam cooldown temporario do candidato.
const TRANSIENT_CAPACITY_CODES: ReadonlySet<string> = new Set([
  "unavailable",
  "timeout",
  "provider_error",
]);

interface CandidateCapacityRecord {
  state: RouterAvailabilityState;
  cooldownUntilMs: number;
  lastSignalAtMs: number;
  lastErrorCode?: string;
}

const capacityRecords = new Map<string, CandidateCapacityRecord>();

// Limites de cooldown configuraveis (ms). Defaults conservadores: 429 do
// provider free costuma liberar em segundos-minutos; 5xx recupera mais rapido.
export const CAPACITY_COOLDOWN_LIMITS = {
  rateLimit: {
    min: 1_000,
    max: 600_000,
    fallback: 60_000,
    env: "HANIRA_CAPACITY_RATE_LIMIT_COOLDOWN_MS",
  },
  unhealthy: {
    min: 1_000,
    max: 600_000,
    fallback: 30_000,
    env: "HANIRA_CAPACITY_UNHEALTHY_COOLDOWN_MS",
  },
} as const;

function invalidCapacityConfig(env: string, reason: string): never {
  throw new ModelRouterError({
    code: "invalid_configuration",
    message: `A configuracao ${env} do Nira Capacity Engine e invalida: ${reason}`,
  });
}

function parseBoundedCooldownMs(
  bounds:
    | (typeof CAPACITY_COOLDOWN_LIMITS)["rateLimit"]
    | (typeof CAPACITY_COOLDOWN_LIMITS)["unhealthy"],
): number {
  const rawValue = process.env[bounds.env];
  if (rawValue === undefined || rawValue.trim() === "") {
    return bounds.fallback;
  }
  const value = rawValue.trim();
  if (!/^\d+$/.test(value)) {
    invalidCapacityConfig(bounds.env, "deve ser um inteiro positivo em ms.");
  }
  const parsed = Number(value);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < bounds.min ||
    parsed > bounds.max
  ) {
    invalidCapacityConfig(
      bounds.env,
      `deve estar entre ${bounds.min} e ${bounds.max} ms.`,
    );
  }
  return parsed;
}

function resolveRateLimitCooldownMs(): number {
  return parseBoundedCooldownMs(CAPACITY_COOLDOWN_LIMITS.rateLimit);
}

function resolveUnhealthyCooldownMs(): number {
  return parseBoundedCooldownMs(CAPACITY_COOLDOWN_LIMITS.unhealthy);
}

/**
 * Registra SUCESSO de execucao do candidato: limpa qualquer cooldown ativo.
 * Chamado pela rota de chat quando o stream completa com conteudo.
 */
export function recordCandidateSuccess(candidateId: string): void {
  if (!candidateId) return;
  capacityRecords.delete(candidateId);
}

/**
 * Registra FALHA classificada do candidato:
 * - "rate_limit" -> estado "rate_limited" com cooldown dedicado;
 * - erro transiente retryable -> estado "unhealthy" com cooldown dedicado;
 * - erro deterministico (ou transiente marcado retryable: false) -> apenas
 *   registrado (lastErrorCode), SEM cooldown: configuracao/contrato errado nao
 *   se resolve esperando.
 *
 * Pacote 16.6 (Groq Multi-Free): `retryAfterMs` (quando o provider expoe
 * Retry-After parseavel, capturado de forma SANITIZADA pelo provider) melhora
 * o cooldown de rate_limit. Regras:
 * - valor ausente/nao-numerico/negativo -> ignora (usa o cooldown configurado);
 * - valor FORA dos limites configurados (1s-600s) -> LIMITADO aos limites
 *   (nunca estende o cooldown alem do maximo, nunca abaixo do minimo);
 * - NUNCA afeta o cooldown de outros candidatos (saude e por candidato);
 * - NENHUM valor de header cru e armazenado ou logado (so o ms derivado).
 *
 * O cooldown mais recente vence: um sinal que nao gera cooldown nao apaga um
 * cooldown transiente ainda ativo (evita que erros deterministicos abram
 * brecha para repique imediato em candidato claramente instavel).
 */
export function recordCandidateFailure(
  candidateId: string,
  options: {
    readonly code?: string;
    readonly retryable?: boolean;
    readonly retryAfterMs?: number;
  } = {},
): void {
  if (!candidateId) return;
  const now = Date.now();
  const code = (options.code ?? "unknown") as CapacitySignalCode;
  const previous = capacityRecords.get(candidateId);
  const record: CandidateCapacityRecord = {
    state: "available",
    cooldownUntilMs: 0,
    lastSignalAtMs: now,
    lastErrorCode: code,
  };

  if (code === "rate_limit") {
    record.state = "rate_limited";
    record.cooldownUntilMs =
      now + resolveBoundedRetryAfterMs(options.retryAfterMs, () => resolveRateLimitCooldownMs());
  } else if (
    TRANSIENT_CAPACITY_CODES.has(code) &&
    options.retryable !== false
  ) {
    record.state = "unhealthy";
    record.cooldownUntilMs = now + resolveUnhealthyCooldownMs();
  }

  if (
    record.cooldownUntilMs === 0 &&
    previous &&
    previous.cooldownUntilMs > now
  ) {
    record.state = previous.state;
    record.cooldownUntilMs = previous.cooldownUntilMs;
  }

  capacityRecords.set(candidateId, record);
}

/**
 * Converte um Retry-After (ms) do provider em cooldown efetivo, LIMITADO aos
 * limites configurados. Entrada invalida -> fallback do cooldown configurado.
 */
function resolveBoundedRetryAfterMs(
  retryAfterMs: number | undefined,
  fallback: () => number,
): number {
  const limits = CAPACITY_COOLDOWN_LIMITS.rateLimit;
  if (
    typeof retryAfterMs !== "number" ||
    !Number.isFinite(retryAfterMs) ||
    retryAfterMs <= 0
  ) {
    return fallback();
  }
  const bounded = Math.min(Math.max(Math.round(retryAfterMs), limits.min), limits.max);
  return bounded;
}

export interface AvailabilityGate {
  readonly available: boolean;
  readonly state: RouterAvailabilityState;
  // Ms restantes de cooldown quando indisponivel; 0 caso contrario.
  readonly retryInMs: number;
}

const AVAILABLE_GATE: AvailabilityGate = Object.freeze({
  available: true,
  state: "available" as RouterAvailabilityState,
  retryInMs: 0,
});

/**
 * Portao de disponibilidade do candidato para a decisao de roteamento.
 * - sem registro -> disponivel;
 * - cooldown ativo -> indisponivel com retryInMs;
 * - cooldown expirado -> disponivel (transicao lazy, sem timers).
 * Nenhuma chamada de rede acontece aqui.
 */
export function getAvailabilityGate(
  candidateId: string,
  nowMs: number = Date.now(),
): AvailabilityGate {
  if (!candidateId) return AVAILABLE_GATE;
  const record = capacityRecords.get(candidateId);
  if (!record) return AVAILABLE_GATE;

  if (record.cooldownUntilMs > nowMs) {
    return Object.freeze({
      available: false,
      state: record.state,
      retryInMs: record.cooldownUntilMs - nowMs,
    });
  }

  // Cooldown expirado: normaliza o registro para disponivel. O ultimo erro
  // continua observavel via snapshot de metricas, mas o candidato volta a ser
  // elegivel.
  if (record.lastErrorCode) {
    capacityRecords.set(candidateId, {
      ...record,
      state: "available",
      cooldownUntilMs: 0,
    });
  } else {
    capacityRecords.delete(candidateId);
  }
  return AVAILABLE_GATE;
}

export interface CapacityStateSnapshotEntry {
  readonly candidateId: string;
  readonly state: RouterAvailabilityState;
  readonly cooldownRemainingMs: number;
  readonly lastErrorCode?: string;
  readonly lastSignalAtMs?: number;
}

/**
 * Snapshot seguro e somente-leitura do estado de capacidade (para
 * observabilidade/diagnostico). Sem segredos, sem baseUrl, sem mensagens.
 */
export function getCapacityStateSnapshot(
  nowMs: number = Date.now(),
): readonly CapacityStateSnapshotEntry[] {
  return Object.freeze(
    [...capacityRecords.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([candidateId, record]) => {
        const withinCooldown = record.cooldownUntilMs > nowMs;
        return Object.freeze({
          candidateId,
          state: withinCooldown
            ? record.state
            : ("available" as RouterAvailabilityState),
          cooldownRemainingMs: withinCooldown
            ? record.cooldownUntilMs - nowMs
            : 0,
          ...(record.lastErrorCode !== undefined
            ? { lastErrorCode: record.lastErrorCode }
            : {}),
          ...(record.lastSignalAtMs !== undefined
            ? { lastSignalAtMs: record.lastSignalAtMs }
            : {}),
        });
      }),
  );
}

/** Limpa todo o estado (uso exclusivo de testes). */
export function resetCapacityStateForTests(): void {
  capacityRecords.clear();
}

/** Quantidade de candidatos com estado (uso exclusivo de testes). */
export function capacityStateSizeForTests(): number {
  return capacityRecords.size;
}