/**
 * PACOTE 19.0 — Fundação da Pesquisa Web da Nira
 *
 * Arquitetura provider-agnostic para busca web.
 * NÃO implementa chamadas reais a provedores externos.
 * NÃO adiciona API keys ou secrets.
 * Política: R$ 0 / mês, fail-closed.
 */

// === 1. TIPOS DE CONTRATO ===

export type WebSearchIntentReason =
  | "static"
  | "explicit"
  | "freshness"
  | "unknown";

export interface WebSearchResult {
  title: string;
  url: string;
  domain: string;
  snippet: string;
  publishedAt: string | null;
  score?: number | null;
}

export interface WebSearchResponse {
  query: string;
  results: WebSearchResult[];
  provider: string;
  freshness: "realtime" | "recent" | "general";
  totalResults?: number | null;
}

export type WebSearchDecision = {
  shouldSearch: boolean;
  reason: WebSearchIntentReason;
  query?: string;
  freshness?: "realtime" | "recent" | "general";
  topic?: "news";
  timeRange?: "day" | "week" | "month";
  requestedCount?: number;
};

export interface WebSearchError {
  type: "unavailable" | "blocked" | "malformed";
  message: string;
  safeLog: boolean;
  code?: "not_configured" | "timeout" | "quota_exhausted" | "rate_limited" | "blocked" | "malformed" | "unavailable";
}

/** Limites configuráveis de busca (fail-closed, R$ 0/mês) */
export const WEB_SEARCH_LIMITS = {
  maxResults: 5,
  maxSnippetChars: 300,
  maxTotalContextChars: 1500,
  defaultFreshness: "general",
} as const;

/** Tipo seguro derivado dos limites */
export type WebSearchLimits = Readonly<{
  maxResults: number;
  maxSnippetChars: number;
  maxTotalContextChars: number;
  defaultFreshness: "general";
}>;
