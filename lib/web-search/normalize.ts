/**
 * PACOTE 19.0 — Fundação da Pesquisa Web da Nira
 *
 * Normalização e sanitização de resultados de busca.
 * Formatos independentes de provider.
 * Política: R$ 0 / mês, fail-closed.
 */

import type { WebSearchResult } from "./types";

// === SANITIZAÇÃO DE URL ===

/**
 * Sanitiza URL de resultado de busca.
 * Nunca expondo API keys ou tokens privados.
 * Rejeita esquemas não-http/https.
 */
export function sanitizeWebUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return "";
    }
    return url;
  } catch {
    return "";
  }
}

// === EXTRAÇÃO DE DOMÍNIO ===

/**
 * Extrai o domínio de uma URL de forma segura.
 * Retorna string vazia se URL for inválida.
 */
export function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return "";
  }
}

// === VALIDAÇÃO DE RESULTADO ===

/**
 * Valida se um WebSearchResult tem campos preenchidos minimamente.
 * Returns false se título, URL ou snippet estiverem vazios.
 */
export function isValidWebResult(result: unknown): result is WebSearchResult {
  if (typeof result !== "object" || result === null) return false;

  const r = result as { title?: unknown; url?: unknown; snippet?: unknown };
  return (
    typeof r.title === "string" && r.title.trim().length > 0 &&
    typeof r.url === "string" && r.url.trim().length > 0 &&
    typeof r.snippet === "string"
  );
}

// === FORMATAGEM DE CONTEXTO ===

/**
 * Converte um WebSearchResult em string de contexto para o modelo.
 * Respeta os limites de caracteres configurados.
 */
export function formatResultContext(
  result: WebSearchResult,
  maxChars: number = 300
): string {
  const snippet = result.snippet.length > maxChars
    ? result.snippet.substring(0, maxChars - 1) + "..."
    : result.snippet;

  return `[${result.title}](${result.url})\n${snippet}`;
}

// === EXPORTS ===

export type { WebSearchResult };