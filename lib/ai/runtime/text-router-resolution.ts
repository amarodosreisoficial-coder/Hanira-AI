import type { AIProvider } from "@/lib/ai/provider";
import { ModelRouterError } from "@/lib/ai/router/errors";
import { ModelRouter } from "@/lib/ai/router/model-router";
import {
  ROUTER_CAPABILITY_TO_PROVIDER_CAPABILITY,
  type RouterCandidate,
  type RouterDecision,
} from "@/lib/ai/router/types";

// Composition root do Model Router para o runtime de texto (Pacotes 14.2B e
// 14.3). A configuracao logica dos candidatos vive no registry tipado
// (lib/ai/router/candidate-registry.ts); este modulo e a ponte entre a
// decisao logica do router (RouterDecision) e a criacao de uma instancia
// AIProvider, via factories explicitamente injetadas pelo composition root.
//
// O Model Router e o registry continuam PUROS: nao leem process.env, nao
// criam providers, nao fazem fetch e nao conhecem Supabase/HTTP.

// Allow-list de providers logicos elegiveis para o runtime de texto. Qualquer
// id fora desta lista falha de forma controlada (sem fallback implicito e sem
// expor secrets).
export const TEXT_ROUTER_LOGICAL_PROVIDERS = ["ollama"] as const;

export type TextRouterLogicalProviderId =
  (typeof TEXT_ROUTER_LOGICAL_PROVIDERS)[number];

export function isTextRouterLogicalProvider(
  value: string,
): value is TextRouterLogicalProviderId {
  return (TEXT_ROUTER_LOGICAL_PROVIDERS as readonly string[]).includes(value);
}

export interface TextRouterProviderFactoryOptions {
  // Modelo logico selecionado pelo router (hoje, o mesmo do runtime Ollama).
  readonly model: string;
}

export type TextRouterProviderFactory = (
  options: TextRouterProviderFactoryOptions,
) => AIProvider;

export type TextRouterProviderFactories = Readonly<
  Record<TextRouterLogicalProviderId, TextRouterProviderFactory>
>;

export function createTextModelRouter(
  candidates: readonly RouterCandidate[],
): ModelRouter {
  return new ModelRouter(candidates);
}

function requireTextDecision(decision: RouterDecision): void {
  if (decision.capability !== "text") {
    throw new ModelRouterError({
      code: "invalid_configuration",
      message: `O resolver de texto nao aceita a capability "${decision.capability}".`,
      metadata: { requestedCapability: decision.capability },
    });
  }
}

/**
 * Resolve um RouterDecision (capability "text") para uma instancia AIProvider.
 *
 * - apenas providers logicos da allow-list sao aceitos;
 * - provider desconhecido falha com ModelRouterError (sem fallback implicito);
 * - o provider resolvido precisa anunciar a capability obrigatoria
 *   ("text-generation", via ponte tipada do router);
 * - nenhuma mensagem, prompt ou segredo entra no erro.
 */
export function resolveTextRouterDecisionProvider(
  decision: RouterDecision,
  factories: TextRouterProviderFactories,
): AIProvider {
  requireTextDecision(decision);

  const logicalProvider = decision.selected.provider;
  if (!isTextRouterLogicalProvider(logicalProvider)) {
    throw new ModelRouterError({
      code: "invalid_configuration",
      message: `Provider logico desconhecido para o runtime de texto: ${logicalProvider}.`,
      metadata: { requestedCapability: decision.capability },
    });
  }

  const factory = factories[logicalProvider];
  const resolved = factory({ model: decision.selected.model });
  const requiredCapability = ROUTER_CAPABILITY_TO_PROVIDER_CAPABILITY.text;

  if (!resolved.supports(requiredCapability)) {
    throw new ModelRouterError({
      code: "invalid_configuration",
      message: `O provider resolvido nao suporta a capability obrigatoria "${requiredCapability}".`,
      metadata: { requestedCapability: decision.capability },
    });
  }

  return resolved;
}
