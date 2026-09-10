import {
  getAvailabilityGate,
  recordCandidateFailure,
  recordCandidateSuccess,
  resetCapacityStateForTests,
} from "@/lib/ai/capacity/capacity-state";
import type { CapacitySignalCode } from "@/lib/ai/capacity/capacity-state";
import type { AvailabilityGate } from "@/lib/ai/capacity/capacity-state";

// Fundacao de capacidade de imagem (Pacote 16.7).
//
// Reutiliza as capacidades gerais do Nira Capacity Engine (Pacote 16.5/16.6):
// - recordCandidateFailure: classifica sinais de erro (rate_limit, timeout,
//   unavailable, provider_error) e aplica cooldowns transientes;
// - recordCandidateSuccess: limpa o estado do candidato;
// - getAvailabilityGate: porta lazy de disponibilidade por candidato.
//
// Nao duplica o engine de texto: a camada de imagem compartilha o mesmo
// estado de capacidade (chaves = ids logicos de providers/models de imagem).
//
// Pacote 16.7: implementacao minima para comportamento mock deterministico e
// extensao futura (rate_limited, unhealthy, capacity_unavailable).

export type ImageCapacitySignalCode = CapacitySignalCode;

export function reportImageCapacitySignal(event: {
  readonly candidateId: string;
  readonly signal: ImageCapacitySignalCode;
  readonly retryable?: boolean;
  readonly retryAfterMs?: number;
}): void {
  recordCandidateFailure(event.candidateId, {
    code: event.signal,
    retryable: event.retryable,
    retryAfterMs: event.retryAfterMs,
  });
}

export function reportImageCapacitySuccess(candidateId: string): void {
  recordCandidateSuccess(candidateId);
}

export function getImageAvailabilityGate(
  candidateId: string,
  nowMs: number = Date.now(),
): AvailabilityGate {
  return getAvailabilityGate(candidateId, nowMs);
}

export function resetImageCapacityStateForTests(): void {
  resetCapacityStateForTests();
}

export type { AvailabilityGate };
