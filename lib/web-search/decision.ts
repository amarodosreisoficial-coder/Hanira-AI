/**
 * PACOTE 19.0 — Fundação da Pesquisa Web da Nira
 *
 * Lógica de decisão de intenção de busca.
 *
 * Heurística determinística inicia — NÃO faz chamadas externas.
 * Política: fail-closed, R$ 0 / mês.
 */

// === ROTEADOR DE INTENÇÃO ===

import { WebSearchDecision, WebSearchIntentReason, WebSearchLimits } from "./types";

/**
 * Heurística determinística para decidir se a Nira deve pesquisar.
 *
 * Critérios que NÃO necessitam de busca (shouldSearch = false):
 * - Perguntas matemáticas fixas
 * - Definições e explicações
 * - Criatividade ("crie uma história")
 * - Conversa casual sem dados temporais
 *
 * Critérios que MERITAM busca (shouldSearch = true):
 * - Usuário pediu explicitamente "pesquise", "busque", "procure"
 * - Dados temporais (preço hoje, presidente, versão atual)
 * - Edital, inscrição, concurso
 * - Comparação de preços, disponibilidade
 *
 * Quando em dúvida → shouldSearch = false (fail-closed).
 */
export function decideWebSearch(
  userQuery: string,
  explicitSearch: boolean = false
): WebSearchDecision {
  const normalized = userQuery.trim().toLowerCase();

  // --- Caso 1: Usuário explicitamente pediu busca ---
  const explicitPattern = /^(nira[,\s]?\s*)?(pesquise|busque|procure|search|find|research)+/i;
  if (explicitSearch || explicitPattern.test(normalized)) {
    const cleanQuery = normalized.replace(
      /^(pesquise|busque|procure|search|find|research)\s+/i,
      ""
    ).trim() || userQuery;

    return {
      shouldSearch: true,
      reason: "explicit",
      query: cleanQuery,
      freshness: "general",
    };
  }

  // --- Caso 2: Padrões que claramente NÃO precisam de web ---
  const staticIndicators = [
    /^(\?|==|!=|>=|<=|>|<)\s*\d+/, // expressões matemáticas
    /^(quanto é|qual é|qual o resultado)/i,
    /^(\d+\s*[\+\-\*\/]\s*\d+)$/, // "2 + 2", "3 * 5" etc.
    /^(explique|defina|o que é)\s+/i,
    /^(crie|me dê|me faça)\s+/i,
    /^(história|conto|piada|curiosidade)\s+/i,
  ];

  for (const pattern of staticIndicators) {
    if (pattern.test(normalized)) {
      return { shouldSearch: false, reason: "static" };
    }
  }

  // --- Caso 3: Padrões que MEREM busca (dados temporais) ---
  const freshnessIndicators = [
    /preço|price|cotação|tax[jio]/i,
    /presidente|presidente(atual)?/i,
    /data|hoje|agora|atual|última|versão|release|lançamento/i,
    /[€$£]\s*\d+|\d+\s*[€$£]/,
    /inscrição|edital|vaga|concurso/i,
    /compar(ar|ativo|ativo).*preço|preço.*compar/i,
  ];

  let matchCount = 0;
  for (const pattern of freshnessIndicators) {
    if (pattern.test(normalized)) {
      matchCount++;
    }
  }

  // Se tem ≥2 sinais de frescor, considerar busca
  if (matchCount >= 2) {
    // Remover palavras de conexão para limpar query
    let cleanQuery = normalized.replace(
      /^(qual|o|a|os|as|do|da|de|em|para|com|sobre|por)\s+/i,
      ""
    ).trim();

    cleanQuery = cleanQuery || userQuery;

    return {
      shouldSearch: true,
      reason: "freshness",
      query: cleanQuery,
      freshness: "realtime",
    };
  }

  // --- Caso 4: Decisão desconhecida → fail-closed ---
  // A Nira pode substituir esta decisão com contexto estruturado futuramente
  return {
    shouldSearch: false,
    reason: "unknown",
    query: undefined,
    freshness: "general",
  };
}