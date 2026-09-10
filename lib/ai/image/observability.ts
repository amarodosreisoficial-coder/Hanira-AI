// Nira Image Routing Observability (Pacote 16.7).
//
// Vocabulario fechado de eventos do roteamento de imagens. Proposito:
// observabilidade do roteamento FREE-FIRST de imagem SEM expor provider/model
// como identidade para o usuario e SEM nenhum dado sensivel.
//
// Garantias duras:
// - metadata SOMENTE com valores escalares operacionais;
// - NUNCA loga: prompt, imagem binaria/base64, API key, Authorization, cookies,
//   segredos do Supabase ou conteudo privado;
// - identidade do usuario continua sendo "Nira".

export const IMAGE_ROUTING_TRACE_EVENTS = [
  "image_routing_started",
  "image_candidate_considered",
  "image_candidate_selected",
  "image_candidate_rejected",
  "image_generation_completed",
  "image_generation_failed",
  "image_routing_exhausted",
] as const;

export type ImageRoutingTraceEvent =
  (typeof IMAGE_ROUTING_TRACE_EVENTS)[number];

export interface ImageRoutingTraceMeta {
  readonly requestId?: string;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly operation?: string;
  readonly capabilityNames?: string;
  readonly costClass?: string;
  readonly mock?: boolean;
  readonly durationMs?: number;
  readonly outcome?: string;
  readonly reasonCode?: string;
}

function isTraceScalar(value: unknown): value is string | number | boolean {
  return (
    typeof value === "string" ||
    (typeof value === "number" && Number.isFinite(value)) ||
    typeof value === "boolean"
  );
}

/**
 * Converte metadata de trace em campos de log SEGUROS por allow-list fechada.
 */
export function toImageRoutingTraceLogFields(
  meta: ImageRoutingTraceMeta = {},
): Record<string, string | number | boolean> {
  const allowedKeys: readonly (keyof ImageRoutingTraceMeta)[] = [
    "requestId",
    "providerId",
    "modelId",
    "operation",
    "capabilityNames",
    "costClass",
    "mock",
    "durationMs",
    "outcome",
    "reasonCode",
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
