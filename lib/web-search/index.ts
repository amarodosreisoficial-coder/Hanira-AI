/**
 * PACOTE 19.0 — Fundação da Pesquisa Web da Nira
 *
 * Barrel export — re-exports everything from the web-search module.
 * Importações no projeto devem usar: "@/lib/web-search"
 */

export type { WebSearchIntentReason } from "./types";
export type { WebSearchResult, WebSearchResponse, WebSearchDecision, WebSearchError } from "./types";

export { WEB_SEARCH_LIMITS, isWithinLimits } from "./limits";
export type { WebSearchLimits } from "./limits";

export type { WebSearchProvider, WebSearchProviderResult } from "./provider";
export { fallbackProvider } from "./provider";

/* Tavily Provider (Pacote 19.1) */
export { TavilySearchProvider } from "./providers/tavily";

export type { sanitizeWebUrl } from "./normalize";
export type { extractDomain } from "./normalize";
export type { isValidWebResult } from "./normalize";
export type { formatResultContext } from "./normalize";