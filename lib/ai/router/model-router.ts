import { ModelRouterError } from "@/lib/ai/router/errors";
import {
  isRouterCapability,
  type RouterCandidate,
  type RouterDecision,
  type RouterDecisionReason,
  type RouterRejection,
  type RouterRequest,
  type RouterSelectedCandidate,
} from "@/lib/ai/router/types";

// Snapshot ordenado por (priority asc, id asc). A ordenacao explicita garante
// que a ordem de entrada dos candidatos nunca altere a decisao.
function sortedSnapshot(
  candidates: readonly RouterCandidate[],
): readonly RouterCandidate[] {
  return [...candidates].sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateCandidate(candidate: RouterCandidate, index: number): void {
  if (!candidate || typeof candidate !== "object") {
    throw new ModelRouterError({
      code: "invalid_configuration",
      message: `Candidato na posicao ${index} nao e um objeto valido.`,
    });
  }

  if (!isNonEmptyString(candidate.id)) {
    throw new ModelRouterError({
      code: "invalid_configuration",
      message: `Candidato na posicao ${index} exige id logico nao vazio.`,
    });
  }

  if (!isNonEmptyString(candidate.provider)) {
    throw new ModelRouterError({
      code: "invalid_configuration",
      message: `Candidato ${candidate.id} exige provider logico nao vazio.`,
    });
  }

  if (!isNonEmptyString(candidate.model)) {
    throw new ModelRouterError({
      code: "invalid_configuration",
      message: `Candidato ${candidate.id} exige model logico nao vazio.`,
    });
  }

  if (
    typeof candidate.priority !== "number" ||
    !Number.isSafeInteger(candidate.priority)
  ) {
    throw new ModelRouterError({
      code: "invalid_configuration",
      message: `Candidato ${candidate.id} exige priority inteira segura.`,
    });
  }

  if (typeof candidate.enabled !== "boolean") {
    throw new ModelRouterError({
      code: "invalid_configuration",
      message: `Candidato ${candidate.id} exige enabled booleano.`,
    });
  }

  if (
    !Array.isArray(candidate.capabilities) ||
    candidate.capabilities.some((capability) => !isRouterCapability(capability))
  ) {
    throw new ModelRouterError({
      code: "invalid_configuration",
      message: `Candidato ${candidate.id} possui capabilities invalidas.`,
    });
  }
}

/**
 * Hanira Model Router v1 - selecao deterministica de candidato.
 *
 * Responsabilidade unica: dado um conjunto de candidatos previamente
 * configurados e injetados, selecionar o melhor candidato elegivel para a
 * capability solicitada.
 *
 * Este componente:
 * - nao cria providers;
 * - nao le process.env;
 * - nao conhece Supabase, HTTP ou rotas de API;
 * - nao executa chamadas ao modelo;
 * - nao implementa retries, fallback executavel, load balancing ou
 *   circuit breaker (pacotes futuros).
 */
export class ModelRouter {
  private readonly candidates: readonly RouterCandidate[];

  constructor(candidates: readonly RouterCandidate[]) {
    if (!Array.isArray(candidates)) {
      throw new ModelRouterError({
        code: "invalid_configuration",
        message: "O router exige uma lista de candidatos.",
      });
    }

    const seenIds = new Set<string>();
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      validateCandidate(candidate, index);
      if (seenIds.has(candidate.id)) {
        throw new ModelRouterError({
          code: "invalid_configuration",
          message: `Id logico de candidato duplicado: ${candidate.id}.`,
        });
      }
      seenIds.add(candidate.id);
    }

    this.candidates = sortedSnapshot(candidates);
  }

  select(request: RouterRequest): RouterDecision {
    if (!request || !isRouterCapability(request?.capability)) {
      throw new ModelRouterError({
        code: "invalid_request",
        message: "A solicitacao exige uma capability valida do router.",
      });
    }

    if (
      request.preferredCandidateId !== undefined &&
      !isNonEmptyString(request.preferredCandidateId)
    ) {
      throw new ModelRouterError({
        code: "invalid_request",
        message:
          "preferredCandidateId, quando informado, deve ser um id nao vazio.",
      });
    }

    const rejected: RouterRejection[] = [];
    let evaluatedCount = 0;
    let fallback: RouterCandidate | undefined;
    let preferredHit: RouterCandidate | undefined;

    for (const candidate of this.candidates) {
      evaluatedCount += 1;

      if (!candidate.enabled) {
        rejected.push({
          candidateId: candidate.id,
          provider: candidate.provider,
          reason: "disabled",
        });
        continue;
      }

      if (!candidate.capabilities.includes(request.capability)) {
        rejected.push({
          candidateId: candidate.id,
          provider: candidate.provider,
          reason: "capability_not_supported",
        });
        continue;
      }

      if (!fallback) {
        fallback = candidate;
      }

      if (
        request.preferredCandidateId !== undefined &&
        candidate.id === request.preferredCandidateId
      ) {
        preferredHit = candidate;
        break;
      }
    }

    const hadPreference = request.preferredCandidateId !== undefined;

    if (!fallback) {
      throw new ModelRouterError({
        code: "no_eligible_candidate",
        message: "Nenhum candidato elegivel para a capability solicitada.",
        metadata: {
          requestedCapability: request.capability,
          preferredCandidateId: request.preferredCandidateId,
          candidatesConsidered: evaluatedCount,
          rejected,
        },
      });
    }

    const winner = preferredHit ?? fallback;
    const reason: RouterDecisionReason = preferredHit
      ? "selected_by_preference"
      : hadPreference
        ? "selected_after_invalid_preference"
        : "selected_by_priority";

    const selected: RouterSelectedCandidate = {
      candidateId: winner.id,
      provider: winner.provider,
      model: winner.model,
      priority: winner.priority,
      ...(winner.deployment !== undefined
        ? { deployment: winner.deployment }
        : {}),
    };

    return {
      capability: request.capability,
      selected,
      reason,
      evaluatedCount,
      rejected,
    };
  }
}

