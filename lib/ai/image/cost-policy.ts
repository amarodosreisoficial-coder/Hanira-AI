import {
  ZERO_COST_ROUTER_POLICY,
  evaluateRouterCostPolicy,
  type RouterCostPolicy,
  type RouterCostPolicyEvaluation,
} from "@/lib/ai/router/cost-policy";
import {
  isRouterCostClass,
  type RouterCostClass,
} from "@/lib/ai/router/types";

// Politica financeira de imagem (Pacote 16.7 — Nira Image Architecture Foundation).
//
// Reutiliza integralmente a politica ZERO-COST do roteador de texto: a politica
// financeira de imagem NAO e uma politica a parte — e a mesma politica central
// do produto (orcamento autorizado R$ 0,00/mes).
//
// Garantias:
// - paid: SEMPRE bloqueado no modo zero_cost;
// - promotional: bloqueado por default (opt-in explicito futuro);
// - unknown/sem classificacao: bloqueado (fail-closed, UNKNOWN != FREE);
// - free: elegivel.
//
// Nenhum preco ou quota de mercado vive aqui.

export const IMAGE_COST_POLICY_MODES = ["zero_cost"] as const;

export type ImageCostPolicyMode = (typeof IMAGE_COST_POLICY_MODES)[number];

export interface ImageCostPolicy {
  readonly mode: ImageCostPolicyMode;
  readonly allowPromotional: boolean;
}

// Politica padrao e imutavel: ZERO-COST. Espelha ZERO_COST_ROUTER_POLICY.
export const ZERO_COST_IMAGE_POLICY: ImageCostPolicy = Object.freeze({
  mode: "zero_cost",
  allowPromotional: false,
});

// Re-exporta os tipos e funcoes da politica central para conveniencia.
export {
  ZERO_COST_ROUTER_POLICY,
  evaluateRouterCostPolicy,
  isRouterCostClass,
};
export type { RouterCostClass, RouterCostPolicy, RouterCostPolicyEvaluation };

export type ImageCostEvaluation =
  | { readonly eligible: true }
  | {
      readonly eligible: false;
      readonly reason: ImageCostRejectionReason;
    };

// Razoes de rejeicao exclusivamente financeiras (subset seguro).
export const IMAGE_COST_REJECTION_REASONS = [
  "cost_class_unknown",
  "cost_blocked_paid",
  "cost_blocked_promotional",
] as const;

export type ImageCostRejectionReason =
  (typeof IMAGE_COST_REJECTION_REASONS)[number];

/**
 * Avalia a elegibilidade financeira de um modelo de imagem sob a politica.
 * Reutiliza evaluateRouterCostPolicy: a decisao e a mesma do produto.
 */
export function evaluateImageCostPolicy(
  costClass: RouterCostClass | undefined,
  policy: ImageCostPolicy = ZERO_COST_IMAGE_POLICY,
): ImageCostEvaluation {
  const evaluation = evaluateRouterCostPolicy(
    { costClass },
    { mode: policy.mode, allowPromotional: policy.allowPromotional },
  );
  if (evaluation.eligible) {
    return { eligible: true };
  }
  return {
    eligible: false,
    reason: evaluation.reason as ImageCostRejectionReason,
  };
}
