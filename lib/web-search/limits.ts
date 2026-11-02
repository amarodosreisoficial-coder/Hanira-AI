/**
 * PACOTE 19.0 — Fundação da Pesquisa Web da Nira
 *
 * Limites configuráveis e fail-closed.
 * Política: R$ 0 / mês.
 */

import { WebSearchResult } from "./types";

// === LIMITES DE CONTEÚDO ===

export const WEB_SEARCH_LIMITS = {
  maxResults: 5,
  maxSnippetChars: 300,
  maxTotalContextChars: 1500,
  defaultFreshness: "general",
} as const;

/** Tipos seguros dos limites — extraídos do const */
export type WebSearchLimits = Readonly<{
  maxResults: number;
  maxSnippetChars: number;
  maxTotalContextChars: number;
  defaultFreshness: "general";
}>;

/**
 * Verifica se resultados estão dentro dos limites configurados.
 * Usado por adapters no Pacote 19.1 para sanitizar output.
 */
export function isWithinLimits(
  results: WebSearchResult[],
  limits: WebSearchLimits = WEB_SEARCH_LIMITS as WebSearchLimits
): boolean {
  const maxResults = limits.maxResults === undefined ? 5 : limits.maxResults;
  const maxSnippetChars =
    limits.maxSnippetChars === undefined ? 300 : limits.maxSnippetChars;
  const maxTotalContextChars =
    limits.maxTotalContextChars === undefined ? 1500 : limits.maxTotalContextChars;

  const totalChars = results
    .map(r => r.snippet.length)
    .reduce((acc, curr) => acc + curr, 0);

  return (
    results.length <= maxResults &&
    totalChars <= maxTotalContextChars &&
    results.every(r => r.snippet.length <= maxSnippetChars)
  );
}