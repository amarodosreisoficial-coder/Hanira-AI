/**
 * PACOTE 19.2 — Integração da Pesquisa Web ao Chat da Nira
 *
 * Orquestra a decisão de busca, execução via provider e construção do
 * contexto para o modelo. Todas as operações ocorrem exclusivamente no
 * servidor. Nenhuma chave de API é exposta ao cliente.
 *
 * Política: R$ 0 / mês, fail-closed, no máximo uma busca por mensagem.
 */

import { decideWebSearch } from "./decision";
import { getWebSearchProvider } from "./provider";
import { WEB_SEARCH_LIMITS } from "./limits";
import type {
  WebSearchResult,
  WebSearchDecision,
} from "./types";
import type { WebSearchProviderResult } from "./provider";

// === TIPOS DE INTEGRAÇÃO ====

export interface WebSearchSource {
  title: string;
  url: string;
  domain: string;
}

export interface WebSearchIntegrationResult {
  shouldSearch: boolean;
  decision: WebSearchDecision;
  results: WebSearchResult[];
  context: string;
  sources: WebSearchSource[];
  error?: string;
}

// === FUNÇÃO PRINCIPAL DE INTEGRAÇÃO ====

/**
 * Decide se deve buscar, executa a busca (quando necessário) e constrói
 * o contexto de fontes para a Nira.
 *
 * @param userQuery Mensagem do usuário
 * @param explicitSearch Quando true, força a busca (pedido explícito do usuário)
 * @returns Resultado da integração com contexto e fontes
 */
export async function integrateWebSearch(
  userQuery: string,
  explicitSearch: boolean = false
): Promise<WebSearchIntegrationResult> {
  // 1. Decidir se deve buscar (heurística existente do Pacote 19.0)
  const decision = decideWebSearch(userQuery, explicitSearch);

  if (!decision.shouldSearch || !decision.query) {
    return {
      shouldSearch: false,
      decision,
      results: [],
      context: "",
      sources: [],
    };
  }

  // 2. Obter provider configurado (fail-closed: fallback se não houver)
  const { provider } = getWebSearchProvider();

  // 3. Executar busca com limites obrigatórios (R$ 0/mês)
  // Qualquer erro de rede, timeout ou exceção é capturado (fail-closed)
  let searchResult: WebSearchProviderResult;
  try {
    searchResult = await provider.search({
      query: decision.query,
      freshness: decision.freshness,
      limits: WEB_SEARCH_LIMITS,
    });
  } catch (err) {
    return {
      shouldSearch: true,
      decision,
      results: [],
      context: "",
      sources: [],
      error:
        err instanceof Error
          ? `Erro inesperado na busca web: ${err.message}`
          : "Erro inesperado na busca web",
    };
  }

  // 4. Falha fechada — não quebra o chat, apenas retorna sem fontes
  if (!searchResult.success || !searchResult.response) {
    return {
      shouldSearch: true,
      decision,
      results: [],
      context: "",
      sources: [],
      error: searchResult.error?.message || "Web search unavailable",
    };
  }

  // 5. Extrair resultados e construir contexto + fontes
  const results = searchResult.response.results;
  const sources: WebSearchSource[] = results.map(
    (r: WebSearchResult): WebSearchSource => ({
      title: r.title,
      url: r.url,
      domain: r.domain,
    })
  );

  const context = results
    .map(
      (r: WebSearchResult) =>
        `Fonte: ${r.title}\nURL: ${r.url}\nConteúdo: ${r.snippet}\n${
          r.publishedAt ? `Data: ${r.publishedAt}\n` : ""
        }`
    )
    .join("\n---\n");

  return {
    shouldSearch: true,
    decision,
    results,
    context,
    sources,
  };
}