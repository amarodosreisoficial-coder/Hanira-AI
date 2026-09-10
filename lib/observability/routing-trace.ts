// Pacote 16.6 (Groq Multi-Free) - request-scoped routing trace.
//
// Vocabulario fechado de eventos da avaliacao de candidatos na rota de chat.
// Proposito: observabilidade do roteamento free-only (selecao, fallback entre
// candidatos free, exhausted) SEM expor provider/model como identidade para o
// usuario e SEM nenhum dado sensivel.
//
// Garantias duras:
// - metadata SOMENTE com valores escalares operacionais (ids logicos, razoes,
//   contagens, tempos) — ver `toRoutingTraceLogFields`;
// - NUNCA loga: prompt, texto gerado, API key, header Authorization, cookies,
//   segredos do Supabase ou conteudo privado de conversas;
// - identidade do usuario continua sendo "Nira": provider/modelo e detalhe de
//   implementacao (apenas logs/diagnosticos registram o candidato exato).

export const ROUTING_TRACE_EVENTS = [
  "routing_started",
  "candidate_considered",
  "candidate_selected",
  "candidate_failed",
  "fallback_selected",
  "routing_exhausted",
] as const;

export type RoutingTraceEvent = (typeof ROUTING_TRACE_EVENTS)[number];

export interface RoutingTraceMeta {
  // Apenas identificadores logicos e razoes operacionais.
  readonly niraProfileId?: string;
  readonly candidateId?: string;
  readonly provider?: string;
  readonly model?: string;
  readonly costClass?: string;
  readonly lifecycle?: string;
  readonly reason?: string;
  readonly attemptNumber?: number;
  readonly durationMs?: number;
}

function isTraceScalar(value: unknown): value is string | number | boolean {
  return (
    typeof value === "string" ||
    (typeof value === "number" && Number.isFinite(value)) ||
    typeof value === "boolean"
  );
}

/**
 * Converte metadata de trace em campos de log SEGUROS por allow-list fechada:
 * apenas as chaves conhecidas de `RoutingTraceMeta`, apenas valores escalares
 * definidos. Qualquer outra chave (prompt, mensagem, chave de API, cookie...)
 * NUNCA atravessa. Funcao pura, sem env e sem rede.
 */
export function toRoutingTraceLogFields(
  meta: RoutingTraceMeta = {},
): Record<string, string | number | boolean> {
  const allowedKeys: readonly (keyof RoutingTraceMeta)[] = [
    "niraProfileId",
    "candidateId",
    "provider",
    "model",
    "costClass",
    "lifecycle",
    "reason",
    "attemptNumber",
    "durationMs",
  ];

  const fields: Record<string, string | number | boolean> = {};
  for (const key of allowedKeys) {
    const value = meta[key];
    if (value !== undefined && isTraceScalar(value)) {
      fields[key] = value;
    }
  }
  return fields;
}

/**
 * Extrai razoes de rejeicao seguras de um erro de roteamento estruturado
 * (ModelRouterError com metadata.rejected) para eventos de trace. Apenas
 * candidateId/provider/reason atravessam — nunca objetos completos, mensagens
 * de erro brutas ou dados de usuario. Retorna lista ordenada e congelada.
 */
export function routingRejectionsOf(
  error: unknown,
): readonly {
  readonly candidateId: string;
  readonly provider: string;
  readonly reason: string;
}[] {
  if (
    !(error instanceof Object) ||
    !("metadata" in error) ||
    !(error.metadata instanceof Object)
  ) {
    return Object.freeze([]);
  }

  const metadata = error.metadata as { rejected?: unknown };
  if (!Array.isArray(metadata.rejected)) {
    return Object.freeze([]);
  }

  return Object.freeze(
    (metadata.rejected as unknown[])
      .map((rejection) => {
        if (!(rejection instanceof Object)) return null;
        const candidateId = (rejection as { candidateId?: unknown }).candidateId;
        const provider = (rejection as { provider?: unknown }).provider;
        const reason = (rejection as { reason?: unknown }).reason;
        if (
          typeof candidateId !== "string" ||
          typeof provider !== "string" ||
          typeof reason !== "string"
        ) {
          return null;
        }
        return { candidateId, provider, reason };
      })
      .filter(
        (
          rejection,
        ): rejection is {
          readonly candidateId: string;
          readonly provider: string;
          readonly reason: string;
        } => rejection !== null,
      ),
  );
}
