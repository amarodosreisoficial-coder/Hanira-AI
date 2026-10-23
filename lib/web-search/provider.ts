/**
 * PACOTE 19.0 — Fundação da Pesquisa Web da Nira
 *
 * Provider interface — provider-agnostic abstraction.
 * provedores concretos (Tavily, Exa, etc.) implementam esta interface
 * no Pacote 19.1. Nesta pacote: apenas o contrato.
 *
 * Política: R$ 0 / mês, fail-closed.
 */

// === PROVIDER INTERFACE ===

import type {
  WebSearchDecision,
  WebSearchResponse,
  WebSearchError,
  WebSearchIntentReason,
  WebSearchResult,
} from "./types";

import type { WebSearchLimits } from "./limits";

/**
 * Resposta segura do provider — nunca lança exceção para o chat.
 * O chat continua normalmente com a estrutura de erro.
 */
export interface WebSearchProviderResult {
  success: boolean;
  response?: WebSearchResponse;
  error?: WebSearchError;
  /** Provider identifier (para logging/contabilidade) */
  provider: string;
}

/**
 * Interface que todos os provedores externos devem implementar.
 * A integração real acontece no Pacote 19.1.
 *
 * NOTA: Esta é uma assinatura mínima. Implementações concretas podem
 * adicionar métodos adicionais, desde que respeitem este contrato.
 */
export interface WebSearchProvider {
  /**
   * Executa uma busca web.
   * O query já foi limpo/pré-processado pelo roteador da Nira.
   *
   * @param request A query de busca (já sanitizada)
   * @param limits Limites configurados para esta busca
   * @returns Resultado estruturado — success=true com resposta,
   *   ou success=false com erro (never quebra o chat)
   */
  search(
    request: {
      query: string;
      freshness?: "realtime" | "recent" | "general";
      limits?: WebSearchLimits;
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _abortSignal?: AbortSignal
  ): Promise<WebSearchProviderResult>;

/**
 * Verifica se o provider está disponível (creditos, quota, etc.).
 * Retorna true se a busca pode ser tentada.
 * O comportamento default é sempre disponível (fail-closed: se retornar false,
 * a Nira continua sem buscar).
 */
  isAvailable?(): Promise<boolean>;

/**
 * Normaliza um resultado brute do provider para o formato interno da Nira.
 * O adapter no Pacote 19.1 converte Tavily/Exa/etc. para WebSearchResult[].
 * Esta função default retorna um erro "malformed" — adaptadores concretos
 * devem sobrescrevê-la com a conversão real.
 */
  normalizeResults?(rawResults: unknown): WebSearchResult[];
}

// === PROVIDER DEFAULT (fail-closed) ===

/**
 * Implementação default: busca indisponível.
 * O chat continua normalmente — nenhuma chamada externa é feita.
 * Esta é a estratégia fail-closed garante R$ 0 / mês.
 */
export class FallbackWebSearchProvider implements WebSearchProvider {
  async search(
    _request: {
      query: string;
      freshness?: "realtime" | "recent" | "general";
      limits?: WebSearchLimits;
    },
    _abortSignal?: AbortSignal
  ): Promise<WebSearchProviderResult> {
    return {
      success: false,
      error: {
        type: "unavailable",
        message: "Web search provider not configured",
        safeLog: true,
      },
      provider: "fallback",
    };
  }

  async isAvailable(): Promise<boolean> {
    return false;
  }

  normalizeResults(_rawResults: unknown): WebSearchResult[] {
    return [];
  }
}

// Exporta instância singleton para uso direto quando nenhum provider configurado
export const fallbackProvider = new FallbackWebSearchProvider();

/**
 * Factory function to get the configured web search provider.
 *
 * Behavior:
 * - WEB_SEARCH_PROVIDER=tavily + TAVILY_API_KEY available → TavilySearchProvider
 * - WEB_SEARCH_PROVIDER=disabled → fallback provider (search unavailable)
 * - TAVILY_API_KEY absent → fail closed (fallback provider)
 * - Never breaks the application due to missing configuration
 */
export function getWebSearchProvider(): {
  provider: WebSearchProvider;
  isAvailable: () => Promise<boolean>;
} {
  const providerName = (typeof process !== "undefined" && process.env.WEB_SEARCH_PROVIDER) || "disabled";

  if (providerName === "disabled") {
    return {
      provider: fallbackProvider,
      isAvailable: () => Promise.resolve(false),
    };
  }

  const apiKey = (typeof process !== "undefined" && process.env.TAVILY_API_KEY) || "";

  if (providerName === "tavily" && apiKey) {
    const tavilyProvider = new TavilySearchProvider(apiKey);
    return {
      provider: tavilyProvider,
      isAvailable: () => Promise.resolve(true),
    };
  }

  // Fallback for any other case (unknown provider, missing key, etc.)
  return {
    provider: fallbackProvider,
    isAvailable: () => Promise.resolve(false),
  };
}