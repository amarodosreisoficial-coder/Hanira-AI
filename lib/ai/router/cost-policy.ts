import {
  isRouterCostClass,
  type RouterCandidate,
  type RouterRejectionReason,
} from "@/lib/ai/router/types";

// Politica financeira central do Hanira Model Router (Pacote 14.8 -
// Nira Cloud Free / Zero-Cost Guard).
//
// REGRA FINANCEIRA ABSOLUTA: a Hanira esta em ZERO-COST MODE, com orcamento
// autorizado de R$ 0,00/mes. Nenhuma implementacao pode permitir que o router
// selecione silenciosamente um provider pago.
//
// Propriedades desta camada:
// - PURA: nao le process.env, nao chama rede, nao conhece Supabase/HTTP e
//   nao instancia providers;
// - CENTRALIZADA: unica definicao de elegibilidade financeira do router;
// - TESTAVEL: decisao deterministica para a mesma entrada;
// - FAIL-CLOSED: classificacao ausente, invalida ou desconhecida NUNCA e
//   tratada como gratuita (UNKNOWN != FREE);
// - AGNOSTICA A PROVIDER: a elegibilidade vem da configuracao do candidato
//   (costClass), nunca do nome do provider.
//
// A decisao acontece ANTES de qualquer chamada de rede: um candidato pago
// jamais chega ao Provider Resolver como candidato executavel no Zero-Cost
// Mode. Nenhum preco ou quota de mercado e hardcoded aqui; quotas reais, se
// um dia existirem, entram como politica/configuracao propria (YAGNI hoje).

// Modo financeiro global do produto. "zero_cost" e o unico modo ativo:
// orcamento autorizado R$ 0,00/mes. A union existe para que a expansao futura
// (ex.: modo medido) seja uma mudanca de contrato explicita, nunca silenciosa.
export const ROUTER_COST_POLICY_MODES = ["zero_cost"] as const;

export type RouterCostPolicyMode = (typeof ROUTER_COST_POLICY_MODES)[number];

export interface RouterCostPolicy {
  // Modo financeiro global. No modo "zero_cost", candidatos "paid" sao SEMPRE
  // bloqueados, independente de qualquer configuracao.
  readonly mode: RouterCostPolicyMode;
  // Promocional != gratuito permanente. Bloqueado por padrao neste pacote;
  // so se torna elegivel mediante politica explicita futura (opt-in).
  readonly allowPromotional: boolean;
}

// Politica padrao e imutavel do produto em vigencia: ZERO-COST.
export const ZERO_COST_ROUTER_POLICY: RouterCostPolicy = Object.freeze({
  mode: "zero_cost",
  allowPromotional: false,
});

// Razoes de rejeicao exclusivamente financeiras (subset de
// RouterRejectionReason, definido em lib/ai/router/types.ts).
export type RouterCostPolicyRejectionReason = Extract<
  RouterRejectionReason,
  "cost_class_unknown" | "cost_blocked_paid" | "cost_blocked_promotional"
>;

export type RouterCostPolicyEvaluation =
  | { readonly eligible: true }
  | {
      readonly eligible: false;
      readonly reason: RouterCostPolicyRejectionReason;
    };

/**
 * Avalia a elegibilidade financeira de um candidato sob a politica informada.
 *
 * - sem costClass ou costClass invalida/desconhecida -> bloqueado
 *   ("cost_class_unknown");
 * - "paid" -> bloqueado SEMPRE no modo "zero_cost" ("cost_blocked_paid");
 * - "promotional" -> bloqueado enquanto allowPromotional for false
 *   ("cost_blocked_promotional");
 * - "free" -> elegivel.
 *
 * Nenhuma entrada produz elegibilidade por omissao: a ausencia de
 * classificacao bloqueia (fail-closed). Nao le env, nao chama rede.
 */
export function evaluateRouterCostPolicy(
  candidate: Pick<RouterCandidate, "costClass">,
  policy: RouterCostPolicy = ZERO_COST_ROUTER_POLICY,
): RouterCostPolicyEvaluation {
  if (!isRouterCostClass(candidate.costClass)) {
    return { eligible: false, reason: "cost_class_unknown" };
  }

  // No modo zero_cost, um candidato pago e SEMPRE bloqueado. Hoje
  // "zero_cost" e o unico modo existente; a expansao futura de modos exigira
  // decidir explicitamente (por contrato) o que acontece com "paid" neles.
  if (candidate.costClass === "paid" && policy.mode === "zero_cost") {
    return { eligible: false, reason: "cost_blocked_paid" };
  }

  if (candidate.costClass === "promotional" && !policy.allowPromotional) {
    return { eligible: false, reason: "cost_blocked_promotional" };
  }

  return { eligible: true };
}

// Vocabulario de disponibilidade (Pacote 14.8). Representacao pequena e tipada
// para a fundacao de fallback/health futura (Pacote 14.9+). Hoje apenas
// "available", "disabled" e "cost_blocked" sao produzidos a partir da
// configuracao estatica do candidato. Os estados "rate_limited",
// "quota_exhausted" e "unhealthy" sao RESERVADOS para sinais futuros de
// runtime (saude/quota): nada os produz ainda e nada finge disponibilidade.
export const ROUTER_AVAILABILITY_STATES = [
  "available",
  "rate_limited",
  "quota_exhausted",
  "unhealthy",
  "disabled",
  "cost_blocked",
] as const;

export type RouterAvailabilityState =
  (typeof ROUTER_AVAILABILITY_STATES)[number];

/**
 * Deriva o estado de disponibilidade estatica de um candidato combinando
 * enabled + politica financeira. Funcao pura e deterministica.
 */
export function describeRouterCandidateAvailability(
  candidate: Pick<RouterCandidate, "enabled" | "costClass">,
  policy: RouterCostPolicy = ZERO_COST_ROUTER_POLICY,
): RouterAvailabilityState {
  if (!candidate.enabled) {
    return "disabled";
  }

  const cost = evaluateRouterCostPolicy(candidate, policy);
  if (!cost.eligible) {
    return "cost_blocked";
  }

  return "available";
}