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
    if (parsed.username || parsed.password) return "";
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

/** Accept unambiguous ISO dates/timestamps and Tavily's RFC 2822 dates. */
export function normalizePublicationDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const iso = value.match(/^(\d{4}-\d{2}-\d{2})(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/);
  if (iso) {
    const day = new Date(`${iso[1]}T00:00:00Z`);
    if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== iso[1]) return null;
    if (value.includes("T") && Number(value.slice(11, 13)) > 23) return null;
  } else if (!/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{1,2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} (?:GMT|[+-]\d{4})$/.test(value)) {
    return null;
  }
  const timestamp = Date.parse(value);
  if (!iso && Number.isFinite(timestamp)) {
    const parts = value.split(" ");
    const calendarDay = new Date(`${parts[3]}-${String(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].indexOf(parts[2]) + 1).padStart(2, "0")}-${parts[1].padStart(2, "0")}T00:00:00Z`);
    if (!Number.isFinite(calendarDay.getTime()) || calendarDay.getUTCDate() !== Number(parts[1])) return null;
  }
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export function formatPublicationDate(value: string | null): string {
  if (!value) return "Data de publicação não informada";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

export function selectWebResults(raw: unknown, recent: boolean): WebSearchResult[] {
  if (!Array.isArray(raw)) return [];
  const urls = new Set<string>();
  const titles = new Set<string>();
  const results: WebSearchResult[] = [];
  for (const item of raw) {
    if (!isValidWebResult(item) || !item.snippet.trim()) continue;
    const url = sanitizeWebUrl(item.url);
    if (!url) continue;
    const canonical = new URL(url);
    canonical.hash = "";
    for (const key of [...canonical.searchParams.keys()]) {
      if (/^utm_|^(fbclid|gclid)$/i.test(key)) canonical.searchParams.delete(key);
    }
    canonical.searchParams.sort();
    const title = item.title.trim().toLocaleLowerCase().replace(/\s+/g, " ");
    if (urls.has(canonical.href) || titles.has(title)) continue;
    urls.add(canonical.href);
    titles.add(title);
    results.push({ ...item, title: item.title.trim(), url, domain: extractDomain(url), publishedAt: normalizePublicationDate(item.publishedAt) });
  }
  if (recent) {
    // Dated results are comparable; unknown dates keep their relative order.
    results.sort((a, b) => a.publishedAt && b.publishedAt ? Date.parse(b.publishedAt) - Date.parse(a.publishedAt) : a.publishedAt ? -1 : b.publishedAt ? 1 : 0);
  }
  return results;
}
