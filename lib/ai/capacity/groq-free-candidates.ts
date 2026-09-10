import { ModelRouterError } from "@/lib/ai/router/errors";
import type { RouterCandidate } from "@/lib/ai/router/types";

// Catalogo conhecido de modelos free da Groq para a cadeia nira-cloud-free
// (Pacote 16.6 - Groq Multi-Free / Free Capacity Engine).
//
// Fonte: auditoria manual da documentacao oficial do Groq Free Plan, feita
// FORA do repositorio no planejamento do Pacote 16.6. Nenhum numero de preco,
// quota ou rate-limit e hardcode aqui (quotas mudam; e proibido trata-las
// como logica de negocio). IMPORTANTE (etica de quota): a existencia de mais
// de um modelo NAO significa quotas independentes — fallback existe por
// RESILIENCIA/disponibilidade, nunca para evasion de limites do provider.
//
// Regras duras deste catalogo:
// - TODO modelo listado e costClass "free" POR CONSTRUCAO da cadeia (o
//   Zero-Cost Guard do router continua aplicando, em defesa extra);
// - lifecycle "production": openai/gpt-oss-20b (auditado ao vivo no Pacote
//   16.3, default tecnico) e openai/gpt-oss-120b (candidato secundario free
//   DE PRODUCAO, prioridade 2, a partir do Pacote 16.6);
// - lifecycle "preview": qwen/qwen3.6-27b e qwen/qwen3.8-27b (Free Plan
//   Preview). NAO sao candidatos default; exigem opt-in explicito
//   (HANIRA_ALLOW_PREVIEW_MODELS=true) e nunca se tornam candidato default
//   de producao neste pacote;
// - modelos aposentados pelo provider (DEPRECATED_GROQ_MODELS): configurar
//   qualquer um deles (GROQ_MODEL, extras ou candidatos conhecidos) falha de
//   forma deterministica com ModelRouterError(invalid_configuration) —
//   fail-closed, nada e silenciosamente ignorado;
// - modelo DESCONHECIDO (fora do catalogo) configurado explicitamente pelo
//   operador (GROQ_MODEL/primario) permanece permitido como candidato
//   auditado pelo operador — invariante dos Pacotes 16.3/16.5 preservada;
// - esta camada e PURA: nao le env, nao instancia providers, nao chama rede,
//   nao acessa Supabase.

// Modelo secundario free DE PRODUCAO da cadeia default (Pacote 16.6).
export const GROQ_FREE_SECONDARY_CANDIDATE_ID = "nira-cloud-free-secondary-1";
export const GROQ_FREE_SECONDARY_MODEL = "openai/gpt-oss-120b";

// Modelos aposentados/shut down pelo provider (auditoria do Pacote 16.6).
// Configurar qualquer um deles e erro de configuracao (fail-closed).
export const DEPRECATED_GROQ_MODELS: readonly string[] = Object.freeze([
  "llama-3.1-8b-instant",
  "llama-3.3-70b-versatile",
  "qwen/qwen3-32b",
  "meta-llama/llama-4-scout-17b-16e-instruct",
]);

// Modelos Free Plan Preview conhecidos (auditoria do Pacote 16.6). Existem no
// catalogo/tipos, mas NUNCA entram na cadeia sem opt-in explicito.
export const PREVIEW_GROQ_MODELS: readonly string[] = Object.freeze([
  "qwen/qwen3.6-27b",
  "qwen/qwen3.8-27b",
]);

export interface GroqFreeModelMetadata {
  readonly model: string;
  readonly lifecycle: "production" | "preview";
  readonly note: string;
}

// Catalogo declarativo e imutavel (representacao de capability/lifecycle para
// verificacao offline, diagnostico e testes). NENHUM item deste catalogo
// ativa execucao por si so: quem registra candidatos e a cadeia do
// free-capacity-registry a partir da configuracao do operador.
export const GROQ_FREE_MODEL_CATALOG: readonly GroqFreeModelMetadata[] =
  Object.freeze([
    {
      model: "openai/gpt-oss-20b",
      lifecycle: "production",
      note: "Primario free auditado ao vivo (Pacote 16.3); default tecnico da Groq.",
    },
    {
      model: GROQ_FREE_SECONDARY_MODEL,
      lifecycle: "production",
      note: "Secundario free de producao (prioridade 2) desde o Pacote 16.6.",
    },
    ...PREVIEW_GROQ_MODELS.map(
      (model): GroqFreeModelMetadata => ({
        model,
        lifecycle: "preview",
        note: "Free Plan Preview (Groq): exige opt-in explicito; NUNCA default.",
      }),
    ),
  ]);

export function isDeprecatedGroqModel(model: string): boolean {
  return DEPRECATED_GROQ_MODELS.includes(model.trim());
}

export function isPreviewGroqModel(model: string): boolean {
  return PREVIEW_GROQ_MODELS.includes(model.trim());
}

/**
 * Guard fail-closed de modelos aposentados: qualquer tentativa de configurar
 * um modelo deprecated na cadeia free falha com diagnostico explicito.
 */
export function assertGroqModelNotDeprecated(input: {
  readonly model: string;
  readonly role: string;
}): void {
  if (isDeprecatedGroqModel(input.model)) {
    throw new ModelRouterError({
      code: "invalid_configuration",
      message: `O modelo "${input.model}" (${input.role}) foi aposentado pelo provider e esta bloqueado (fail-closed). Escolha um modelo free vigente (ex.: openai/gpt-oss-20b ou openai/gpt-oss-120b).`,
    });
  }
}

/**
 * Candidato secundario free DE PRODUCAO da cadeia default (Pacote 16.6):
 * openai/gpt-oss-120b, id logico nira-cloud-free-secondary-1, prioridade 2.
 * costClass "free" por construcao; lifecycle "production" (NUNCA preview).
 */
export function buildGroqSecondaryFreeCandidate(): RouterCandidate {
  return Object.freeze({
    id: GROQ_FREE_SECONDARY_CANDIDATE_ID,
    provider: "groq",
    model: GROQ_FREE_SECONDARY_MODEL,
    capabilities: Object.freeze(["text" as const]),
    priority: 2,
    enabled: true,
    deployment: "cloud" as const,
    costClass: "free" as const,
    lifecycle: "production" as const,
    label: "Nira Cloud Free (Groq 120B)",
  });
}
