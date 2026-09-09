import {
  getCapacityStateSnapshot,
  type CapacityStateSnapshotEntry,
} from "@/lib/ai/capacity/capacity-state";

// Nira Capacity Observability (Pacote 16.5 - Fase 1 do roadmap:
// "Monitoramento/observabilidade basica").
//
// Contadores em memoria do processo, agregados a partir de sinais reportados
// pela rota de chat (selecao de runtime, sucesso, falha, 429 de provider,
// respostas de capacidade/quota). Proposito: enxergar o estado da capacidade
// free sem nenhum acesso a infraestrutura externa (sem Supabase, sem Redis,
// sem novas dependencias).
//
// Garantias do snapshot:
// - apenas valores escalares seguros: ids logicos, contadores e timestamps;
// - NUNCA contem segredos, chaves de API, baseUrl, prompts, mensagens ou
//   conteudo de usuario;
// - deterministico na ordenacao (candidates por candidateId).

export const CAPACITY_METRIC_OUTCOMES = [
  "selected",
  "success",
  "failure",
  "rate_limited",
  "capacity_unavailable_response",
  "quota_limited_response",
] as const;

export type CapacityMetricOutcome =
  (typeof CAPACITY_METRIC_OUTCOMES)[number];

export interface CapacityMetricsSnapshotEntry {
  readonly candidateId: string;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly selected: number;
  readonly success: number;
  readonly failure: number;
  readonly rateLimited: number;
  readonly lastOutcome?: CapacityMetricOutcome;
  readonly lastErrorCode?: string;
  readonly lastSignalAtMs?: number;
}

export interface CapacityMetricsTotals {
  readonly selected: number;
  readonly success: number;
  readonly failure: number;
  readonly rateLimited: number;
  readonly capacityUnavailableResponses: number;
  readonly quotaLimitedResponses: number;
}

export interface CapacityMetricsSnapshot {
  readonly totals: CapacityMetricsTotals;
  readonly candidates: readonly CapacityMetricsSnapshotEntry[];
  readonly capacityState: readonly CapacityStateSnapshotEntry[];
  readonly generatedAt: string;
}

interface MutableCandidateRecord {
  candidateId: string;
  providerId?: string;
  modelId?: string;
  selected: number;
  success: number;
  failure: number;
  rateLimited: number;
  lastOutcome?: CapacityMetricOutcome;
  lastErrorCode?: string;
  lastSignalAtMs?: number;
}

const candidateMetrics = new Map<string, MutableCandidateRecord>();

const totals: {
  selected: number;
  success: number;
  failure: number;
  rateLimited: number;
  capacityUnavailableResponses: number;
  quotaLimitedResponses: number;
} = {
  selected: 0,
  success: 0,
  failure: 0,
  rateLimited: 0,
  capacityUnavailableResponses: 0,
  quotaLimitedResponses: 0,
};

function isCapacityMetricOutcome(value: unknown): value is CapacityMetricOutcome {
  return (CAPACITY_METRIC_OUTCOMES as readonly string[]).includes(
    value as string,
  );
}

/**
 * Registra um evento de capacidade. Outcome invalido e erro de programacao e
 * falha alto (fail-closed), nunca silenciosamente ignorado.
 */
export function recordCapacityEvent(event: {
  readonly outcome: CapacityMetricOutcome;
  readonly candidateId?: string;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly errorCode?: string;
}): void {
  if (!isCapacityMetricOutcome(event.outcome)) {
    throw new Error(
      `Outcome de capacidade desconhecido: ${String(event.outcome)}.`,
    );
  }

  switch (event.outcome) {
    case "selected":
      totals.selected += 1;
      break;
    case "success":
      totals.success += 1;
      break;
    case "failure":
      totals.failure += 1;
      break;
    case "rate_limited":
      totals.rateLimited += 1;
      break;
    case "capacity_unavailable_response":
      totals.capacityUnavailableResponses += 1;
      break;
    case "quota_limited_response":
      totals.quotaLimitedResponses += 1;
      break;
  }

  if (!event.candidateId) return;

  const record =
    candidateMetrics.get(event.candidateId) ??
    ({
      candidateId: event.candidateId,
      selected: 0,
      success: 0,
      failure: 0,
      rateLimited: 0,
    } satisfies MutableCandidateRecord);

  if (event.providerId !== undefined) record.providerId = event.providerId;
  if (event.modelId !== undefined) record.modelId = event.modelId;
  record.lastOutcome = event.outcome;
  record.lastSignalAtMs = Date.now();
  if (event.errorCode !== undefined) record.lastErrorCode = event.errorCode;

  if (event.outcome === "selected") record.selected += 1;
  if (event.outcome === "success") record.success += 1;
  if (event.outcome === "failure") record.failure += 1;
  if (event.outcome === "rate_limited") record.rateLimited += 1;

  candidateMetrics.set(event.candidateId, record);
}

/**
 * Snapshot seguro e somente-leitura das metricas de capacidade. Contem apenas
 * ids logicos, contadores e timestamps — nunca segredos, baseUrl, prompts ou
 * conteudo de usuario. Usado pelo diagnostico do sistema (Fase 1).
 */
export function getCapacityMetricsSnapshot(
  nowMs: number = Date.now(),
): CapacityMetricsSnapshot {
  const candidates = Object.freeze(
    [...candidateMetrics.values()]
      .sort((a, b) => (a.candidateId < b.candidateId ? -1 : a.candidateId > b.candidateId ? 1 : 0))
      .map((record) =>
        Object.freeze({
          candidateId: record.candidateId,
          ...(record.providerId !== undefined
            ? { providerId: record.providerId }
            : {}),
          ...(record.modelId !== undefined
            ? { modelId: record.modelId }
            : {}),
          selected: record.selected,
          success: record.success,
          failure: record.failure,
          rateLimited: record.rateLimited,
          ...(record.lastOutcome !== undefined
            ? { lastOutcome: record.lastOutcome }
            : {}),
          ...(record.lastErrorCode !== undefined
            ? { lastErrorCode: record.lastErrorCode }
            : {}),
          ...(record.lastSignalAtMs !== undefined
            ? { lastSignalAtMs: record.lastSignalAtMs }
            : {}),
        }),
      ),
  );

  return Object.freeze({
    totals: Object.freeze({ ...totals }),
    candidates,
    capacityState: getCapacityStateSnapshot(nowMs),
    generatedAt: new Date(nowMs).toISOString(),
  });
}

/** Limpa todos os contadores (uso exclusivo de testes). */
export function resetCapacityMetricsForTests(): void {
  candidateMetrics.clear();
  totals.selected = 0;
  totals.success = 0;
  totals.failure = 0;
  totals.rateLimited = 0;
  totals.capacityUnavailableResponses = 0;
  totals.quotaLimitedResponses = 0;
}