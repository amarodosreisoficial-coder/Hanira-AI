import { ModelRouterError } from "@/lib/ai/router/errors";
import {
  ZERO_COST_ROUTER_POLICY,
  evaluateRouterCostPolicy,
  type RouterCostPolicy,
} from "@/lib/ai/router/cost-policy";
import {
  isRouterCapability,
  isRouterCostClass,
  isRouterCandidateLifecycle,
  type RouterCandidate,
  type RouterCandidateLifecycle,
  type RouterDecision,
  type RouterDecisionReason,
  type RouterRejection,
  type RouterRejectionReason,
  type RouterRequest,
  type RouterSelectedCandidate,
} from "@/lib/ai/router/types";

// Opcoes do ModelRouter (Pacote 14.8). A politica financeira padrao e sempre
// a ZERO_COST_ROUTER_POLICY: nenhum caminho de construcao seleciona um
// candidato pago silenciosamente. A injecao explícita existe para configuracao
// futura (ex.: permitir promocional por opt-in), nunca para relaxar "paid".
//
// Pacote 16.6 (Groq Multi-Free): `allowPreviewModels` gateia candidatos com
// lifecycle "preview". Padrao FALSE (fail-closed): preview nao e elegivel sem
// opt-in explicito. "deprecated" e "disabled" NUNCA sao elegiveis, com ou
// sem opt-in. O valor injetado NUNCA relaxa a politica financeira: um
// candidato preview precisa continuar sendo costClass "free" para passar.
export interface ModelRouterOptions {
  readonly costPolicy?: RouterCostPolicy;
  readonly allowPreviewModels?: boolean;
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

// Razoes de rejeicao exclusivamente de lifecycle (subset de
// RouterRejectionReason, definido em lib/ai/router/types.ts).
export type RouterLifecycleRejectionReason = Extract<
  RouterRejectionReason,
  "lifecycle_preview_blocked" | "lifecycle_deprecated" | "lifecycle_disabled"
>;

export type RouterLifecycleEvaluation =
  | { readonly eligible: true }
  | {
      readonly eligible: false;
      readonly reason: RouterLifecycleRejectionReason;
    };

export interface RouterLifecyclePolicy {
  // Preview exige opt-in explicito (HANIRA_ALLOW_PREVIEW_MODELS=true). Nenhuma
  // entrada produz elegibilidade de preview por omissao (fail-closed).
  readonly allowPreviewModels: boolean;
}

// Politica de lifecycle padrao: preview bloqueado, sempre. O opt-in e uma
// decisao explicita da camada de composicao (env parseada fail-closed), nunca
// um default silencioso.
export const DEFAULT_LIFECYCLE_POLICY: RouterLifecyclePolicy = Object.freeze({
  allowPreviewModels: false,
});

/**
 * Avalia o ciclo de vida de um candidato. Funcao pura e deterministica, sem
 * env e sem rede. Candidato sem lifecycle e tratado como "production"
 * (compatibilidade com candidatos dos Pacotes 14.x-16.5).
 */
export function evaluateRouterCandidateLifecycle(
  candidate: Pick<RouterCandidate, "lifecycle">,
  policy: RouterLifecyclePolicy = DEFAULT_LIFECYCLE_POLICY,
): RouterLifecycleEvaluation {
  const lifecycle: RouterCandidateLifecycle = candidate.lifecycle ?? "production";

  switch (lifecycle) {
    case "production":
      return { eligible: true };
    case "preview":
      return policy.allowPreviewModels
        ? { eligible: true }
        : { eligible: false, reason: "lifecycle_preview_blocked" };
    case "deprecated":
      return { eligible: false, reason: "lifecycle_deprecated" };
    case "disabled":
      return { eligible: false, reason: "lifecycle_disabled" };
  }
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

  // Pacote 16.6: lifecycle PRESENTE porem invalido e configuracao malformada
  // e falha na construcao. A AUSENCIA e permitida aqui e significa
  // "production" (o gate de lifecycle no select aplica a politica).
  if (
    candidate.lifecycle !== undefined &&
    !isRouterCandidateLifecycle(candidate.lifecycle)
  ) {
    throw new ModelRouterError({
      code: "invalid_configuration",
      message: `Candidato ${candidate.id} possui lifecycle invalido.`,
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
  private readonly allowPreviewModels: boolean;

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
    // Pacote 16.6: opt-in de preview e booleano estrito. Valor invalido e
    // erro de programacao da camada de composicao — fail-closed, nunca
    // interpretado como false silenciosamente (false eh o default explicito).
    if (options.allowPreviewModels !== undefined) {
      if (typeof options.allowPreviewModels !== "boolean") {
        throw new ModelRouterError({
          code: "invalid_configuration",
          message:
            "allowPreviewModels deve ser booleano (default: false, fail-closed).",
        });
      }
      this.allowPreviewModels = options.allowPreviewModels;
    } else {
      this.allowPreviewModels = false;
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

      // Pacote 16.6 (Groq Multi-Free): gate de lifecycle, APOS a guarda
      // financeira e ANTES de qualquer resolucao de provider (sem rede).
      // Preview so e elegivel com opt-in explicito; deprecated/disabled
      // NUNCA sao elegiveis. Combinado com o Zero-Cost Guard, um candidato
      // preview precisa ser costClass "free" E ter opt-in para executar.
      const lifecycleEvaluation = evaluateRouterCandidateLifecycle(candidate, {
        allowPreviewModels: this.allowPreviewModels,
      });
      if (!lifecycleEvaluation.eligible) {
        rejected.push({
          candidateId: candidate.id,
          provider: candidate.provider,
          reason: lifecycleEvaluation.reason,
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

