/**
 * Payload enviado ao Tavily Search API V1
 */
export interface TavilySearchPayload {
  query: string;
  search_depth?: "basic" | "advanced";
  auto_parameters?: boolean;
  include_answer?: boolean;
  include_raw_content?: boolean;
  include_images?: boolean;
  include_image_descriptions?: boolean;
  include_usage?: boolean;
  safe_search?: boolean;
  topic?: "general" | "news" | "finance" | "sports";
  max_results?: number;
}

/**
 * Resposta bruta da API Tavily (campos relevantes).
 */
export interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score?: number;
  published_date?: string | null;
}

/**
 * Resposta bruta da API Tavily (estrutura completa).
 */
export interface TavilySearchResponse {
  query: string;
  results: TavilyResult[];
  answer?: string;
  response_time?: number;
}

import type {
  WebSearchProvider,
  WebSearchProviderResult,
} from "../provider";
import type { WebSearchLimits } from "../limits";
import { WEB_SEARCH_LIMITS } from "../limits";
import type { WebSearchResult } from "../types";
import { extractDomain, formatResultContext } from "../normalize";
import { isWithinLimits } from "../limits";
import { fallbackProvider } from "../provider";

/**
 * Mapeia um resultado bruto do Tavily para o contrato WebSearchResult interno.
 * Campos Tavily → Nira:
 *   title  → title
 *   url    → url (será sanitizado)
 *   content → snippet
 *   score  → score
 *   published_date → publishedAt
 */
function mapTavilyResultToWebSearchResult(raw: TavilyResult): WebSearchResult {
  const title = raw.title || "";
  const url = raw.url || "";
  const snippet = raw.content || "";
  const score = raw.score ?? undefined;
  const publishedAt = raw.published_date ?? null;

  return {
    title,
    url,
    domain: extractDomain(url),
    snippet,
    publishedAt,
    score,
  };
}

/**
 * Normaliza a resposta bruta da API Tavily para WebSearchResponse.
 */
function mapTavilyResponseToWebSearchResponse(data: unknown): {
  query: string;
  results: WebSearchResult[];
  totalResults: number | null;
} {
  const raw = data as {
    query?: string;
    results?: TavilyResult[];
    total_results?: number;
  } | null;

  if (!raw || !Array.isArray(raw.results)) {
    return { query: "", results: [], totalResults: null };
  }

  return {
    query: raw.query ?? "",
    results: raw.results.map(mapTavilyResultToWebSearchResult),
    totalResults: raw.total_results ?? null,
  };
}

/**
 * PACOTE 19.1 — Implementação do provedor Tavily Free Tier.
 *
 * - Endpoint: POST https://api.tavily.com/search
 * - Autenticação via Authorization: Bearer TAVILY_API_KEY (variável de ambiente)
 * - Busca sempre com search_depth="basic" para preservar a cota gratuita
 * - Nenhum dado sensível é exposto ao cliente
 * - Fail-closed: se TAVILY_API_KEY não estiver configurado, busca falha graciosamente
 */
export class TavilySearchProvider implements WebSearchProvider {
  private readonly apiKey: string;
  private readonly baseUrl = "https://api.tavily.com/search";
  private readonly timeoutMs: number;
  private readonly maxResults: number;

  /**
   * Cria uma instância do TavilySearchProvider.
   *
   * @param apiKey Chave da API Tavily (vinda de TAVILY_API_KEY no ambiente)
   * @param opts Opções de configuração
   */
  constructor(apiKey: string, opts: { timeoutMs?: number; maxResults?: number } = {}) {
    this.apiKey = apiKey;
    this.timeoutMs = opts.timeoutMs ?? 10_000; // 10s timeout, coerente com o projeto
    this.maxResults = opts.maxResults ?? 5; // respecta o limite do pacote 19.0
  }

  /** Retorna o identificador do provider. */
  getProviderName(): string {
    return "tavily";
  }

  /**
   * Verifica se o provider está disponível.
   * Falha closed se a chave não foi fornecida durante a construção.
   */
  async isAvailable(): Promise<boolean> {
    // A chave já foi validada no constructor; se chegamos aqui, está disponível
    return !!this.apiKey;
  }

  /**
   * Executa uma busca web via Tavily API V1.
   *
   * @param request Query e limites da busca
   * @param _abortSignal Sinal de aborto (compatibilidade com WebSearchProvider)
   * @returns Resultado estruturado ou erro (nunca quebra o chat)
   */
  async search(
    request: {
      query: string;
      freshness?: "realtime" | "recent" | "general";
      limits?: WebSearchLimits;
    },
    _abortSignal?: AbortSignal
  ): Promise<WebSearchProviderResult> {
    // 1. Se não houver chave configurada, fail-closed
    if (!this.apiKey) {
      return {
        success: false,
        error: {
          type: "unavailable",
          message: "Web search provider not configured (no Tavily API key)",
          safeLog: true,
        },
        provider: "tavily",
      };
    }

    // 2. Construir payload com configurações conservadoras da cota gratuita
    const payload: TavilySearchPayload = {
      query: request.query,
      search_depth: "basic", // NÃO usar "advanced" — protege cota gratuita
      auto_parameters: false, // NÃO permitir — protege cota gratuita
      include_answer: false, // Apenas fontes, não resposta gerada
      include_raw_content: false, // Não buscar páginas inteiras
      include_images: false,
      include_image_descriptions: false,
      include_usage: true, // Para monitoramento de créditos
      safe_search: true,
      topic: "general",
      max_results: this.maxResults, // 5 (limite do pacote 19.0)
    };

    // 3. Executar requisição com timeout via AbortController
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      const formData = new URLSearchParams();
      formData.append("api_key", this.apiKey);
      formData.append("query", payload.query);
      formData.append("search_depth", payload.search_depth ?? "basic");
      formData.append("auto_parameters", String(payload.auto_parameters ?? false));
      formData.append("include_answer", String(payload.include_answer ?? false));
      formData.append("include_raw_content", String(payload.include_raw_content ?? false));
      formData.append("include_images", String(payload.include_images));
      formData.append("include_image_descriptions", String(payload.include_image_descriptions));
      formData.append("include_usage", String(payload.include_usage));
      formData.append("safe_search", String(payload.safe_search));
      if (payload.topic) formData.append("topic", payload.topic);
      formData.append("max_results", String(payload.max_results ?? this.maxResults));

      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // 4. Tratar erros HTTP
      if (!response.ok) {
        let errorType: "unavailable" | "blocked" | "malformed" = "unavailable";
        let errorMessage = "Web search provider error";

        switch (response.status) {
          case 400:
            errorType = "malformed";
            errorMessage = "Requisição inválida para o provedor de busca web";
            break;
          case 401:
            errorType = "blocked";
            errorMessage = "Chave da API Tavily inválida ou ausente";
            break;
          case 422:
            errorType = "malformed";
            errorMessage = "Erro de validação na requisição Tavily";
            break;
          case 429:
            errorType = "unavailable";
            errorMessage = "Limite de rate excedido do provedor de busca web";
            break;
          case 432:
            errorType = "unavailable";
            errorMessage = "Cota gratuita do Tavily esgotada";
            break;
          case 433:
            errorType = "unavailable";
            errorMessage = "É necessário billing/pay-as-you-go no Tavily";
            break;
          case 500:
          case 502:
          case 503:
          case 504:
            errorType = "unavailable";
            errorMessage = "Provedor de busca web indisponível";
            break;
          default:
            errorType = "unavailable";
            errorMessage = `Erro ${response.status} do provedor de busca web`;
        }

        return {
          success: false,
          error: {
            type: errorType,
            message: errorMessage,
            safeLog: true,
          },
          provider: "tavily",
        };
      }

      // 5. Parsear resposta JSON
      let data: unknown;
      try {
        data = await response.json();
      } catch {
        return {
          success: false,
          error: {
            type: "malformed",
            message: "Resposta malformada do provedor de busca web",
            safeLog: true,
          },
          provider: "tavily",
        };
      }

      // 6. Normalizar resultado para o contrato WebSearchResponse
      const normalized = mapTavilyResponseToWebSearchResponse(data);

      // 7. Aplicar limites de contexto da Nira
      const limits: WebSearchLimits = request.limits ?? (WEB_SEARCH_LIMITS as WebSearchLimits);
      const withinLimits = isWithinLimits(normalized.results, limits);

      // 8. Formatar contexto para o modelo (respeta maxSnippetChars e maxTotalContextChars)
      const resultsWithContext = normalized.results.map((r) => ({
        ...r,
        snippet: formatResultContext(r, limits.maxSnippetChars),
      }));

      return {
        success: true,
        provider: "tavily",
        response: {
          query: normalized.query,
          results: withinLimits ? resultsWithContext : normalized.results.slice(0, this.maxResults),
          provider: "tavily",
          freshness: "general",
          totalResults: normalized.totalResults,
        },
        error: undefined,
      };
    } catch (err) {
      // Erros de rede ou timeout
      if (err instanceof DOMException && err.name === "AbortError") {
        return {
          success: false,
          error: {
            type: "unavailable",
            message: "Tempo limite excedido na busca web (Tavily)",
            safeLog: true,
          },
          provider: "tavily",
        };
      }

      // Erro de rede / inesperado
      return {
        success: false,
        error: {
          type: "unavailable",
          message: "Provedor de busca web indisponível",
          safeLog: true,
        },
        provider: "tavily",
      };
    }
  }
}

/**
 * Singleton do provedor Tavily, criado com a chave do ambiente.
 * Retorna o fallback se a chave não estiver disponível.
 */
export const tavilyProvider = (() => {
  const apiKey = typeof process !== "undefined" && process.env.TAVILY_API_KEY;
  if (!apiKey) {
    return fallbackProvider;
  }
  return new TavilySearchProvider(apiKey);
})();