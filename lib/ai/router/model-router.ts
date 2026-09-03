import { ModelRouterError } from "@/lib/ai/router/errors";
import {
  ZERO_COST_ROUTER_POLICY,
  evaluateRouterCostPolicy,
  type RouterCostPolicy,
} from "@/lib/ai/router/cost-policy";
import {
  isRouterCapability,
  isRouterCostClass,
  type RouterCandidate,
  type RouterDecision,
  type RouterDecisionReason,
  type RouterRejection,
  type RouterRequest,
  type RouterSelectedCandidate,
} from "@/lib/ai/router/types";

// Opcoes do ModelRouter (Pacote 14.8). A politica financeira padrao e sempre
// a ZERO_COST_ROUTER_POLICY: nenhum caminho de construcao seleciona um
// candidato pago silenciosamente. A injecao explícita existe para configuracao
// futura (ex.: permitir promocional por opt-in), nunca para relaxar "paid".
export interface ModelRouterOptions {
  readonly costPolicy?: RouterCostPolicy;
}

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

  // Pacote 14.8: costClass PRESENTE porem invalido e configuracao malformada
  // e falha na construcao. A AUSENCIA de costClass e permitida aqui, mas o
  // candidato sera bloqueado pela politica de custo no select (fail-closed:
  // UNKNOWN != FREE).
  if (
    candidate.costClass !== undefined &&
    !isRouterCostClass(candidate.costClass)
  ) {
    throw new ModelRouterError({
      code: "invalid_configuration",
      message: `Candidato ${candidate.id} possui costClass invalida.`,
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
 *
 * Pacote 14.8: a selecao aplica a politica financeira (Zero-Cost Mode por
 * padrao) ANTES de produzir qualquer RouterDecision executavel. Um candidato
 * pago, promocional-bloqueado ou sem classificacao de custo jamais chega ao
 * Provider Resolver como candidato executavel.
 */
export class ModelRouter {
  private readonly candidates: readonly RouterCandidate[];
  private readonly costPolicy: RouterCostPolicy;

  constructor(
    candidates: readonly RouterCandidate[],
    options: ModelRouterOptions = {},
  ) {
    if (!Array.isArray(candidates)) {
      throw new ModelRouterError({
        code: "invalid_configuration",
        message: "O router exige uma lista de candidatos.",
      });
    }

    this.costPolicy = options.costPolicy ?? ZERO_COST_ROUTER_POLICY;

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

      // Pacote 14.8: guarda financeira fail-closed. Roda ANTES de qualquer
      // outra consideracao de execucao e ANTES de qualquer chamada de rede:
      // um candidato pago (ou promocional bloqueado, ou sem classificacao
      // valida) nunca se torna um RouterDecision executavel no Zero-Cost
      // Mode. A elegibilidade vem da configuracao do candidato, nunca do
      // nome do provider.
      const costEvaluation = evaluateRouterCostPolicy(
        candidate,
        this.costPolicy,
      );
      if (!costEvaluation.eligible) {
        rejected.push({
          candidateId: candidate.id,
          provider: candidate.provider,
          reason: costEvaluation.reason,
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

