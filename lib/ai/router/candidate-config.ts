import { ModelRouterError } from "@/lib/ai/router/errors";
import {
  isRouterCapability,
  isRouterCostClass,
  isRouterDeployment,
  type RouterCandidate,
} from "@/lib/ai/router/types";

// External Candidate Configuration (Pacote 14.4).
//
// Camada tipada para receber, validar e normalizar candidatos adicionais
// fornecidos externamente pela camada de composicao (composition root), para
// serem entregues ao Candidate Registry (lib/ai/router/candidate-registry.ts).
//
// Fluxo: External Candidate Configuration -> Candidate Registry ->
// ModelRouter -> RouterDecision -> Provider Resolver -> AIProvider.
//
// Esta camada:
// - nao le process.env nem qualquer secret;
// - nao importa AIProvider concreto, OllamaProvider ou qualquer provider
//   cloud (GLM, DeepSeek, Laguna, LongCat, OpenAI, etc.);
// - nao instancia providers, nao faz chamadas HTTP, nao acessa Supabase,
//   banco, Storage ou qualquer infraestrutura;
// - nao decide billing, nao faz fallback e nao faz retry;
// - apenas valida e normaliza dados ja injetados pelo caller em uma lista
//   imutavel de RouterCandidate.
//
// Reutiliza o tipo RouterCandidate ja existente (lib/ai/router/types.ts) para
// evitar duplicacao de contrato: a entrada externa e, conceitualmente, uma
// lista de RouterCandidate ainda nao registrados.
export type ExternalRouterCandidateConfig = RouterCandidate;

const EMPTY_EXTERNAL_CANDIDATES: readonly RouterCandidate[] = Object.freeze(
  [],
);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function invalidExternalConfig(message: string): never {
  throw new ModelRouterError({
    code: "invalid_configuration",
    message,
  });
}

function validateExternalCandidate(
  candidate: ExternalRouterCandidateConfig,
  index: number,
): RouterCandidate {
  if (!candidate || typeof candidate !== "object") {
    invalidExternalConfig(
      `Candidato externo na posicao ${index} nao e um objeto valido.`,
    );
  }

  if (!isNonEmptyString(candidate.id)) {
    invalidExternalConfig(
      `Candidato externo na posicao ${index} exige id logico nao vazio.`,
    );
  }

  if (!isNonEmptyString(candidate.provider)) {
    invalidExternalConfig(
      `Candidato externo "${candidate.id}" exige provider logico nao vazio.`,
    );
  }

  if (!isNonEmptyString(candidate.model)) {
    invalidExternalConfig(
      `Candidato externo "${candidate.id}" exige model logico nao vazio.`,
    );
  }

  if (
    !Array.isArray(candidate.capabilities) ||
    candidate.capabilities.length === 0 ||
    candidate.capabilities.some(
      (capability) => !isRouterCapability(capability),
    )
  ) {
    invalidExternalConfig(
      `Candidato externo "${candidate.id}" exige ao menos uma capability valida.`,
    );
  }

  if (
    typeof candidate.priority !== "number" ||
    !Number.isSafeInteger(candidate.priority)
  ) {
    invalidExternalConfig(
      `Candidato externo "${candidate.id}" exige priority inteira segura.`,
    );
  }

  if (typeof candidate.enabled !== "boolean") {
    invalidExternalConfig(
      `Candidato externo "${candidate.id}" exige enabled booleano.`,
    );
  }

  if (
    candidate.deployment !== undefined &&
    !isRouterDeployment(candidate.deployment)
  ) {
    invalidExternalConfig(
      `Candidato externo "${candidate.id}" possui deployment invalido.`,
    );
  }

  // Pacote 14.8: costClass presente precisa ser valida. A ausencia e aceita
  // na configuracao (o candidato entra no registry), mas sera bloqueada pela
  // politica de custo zero no ModelRouter (fail-closed, UNKNOWN != FREE).
  if (
    candidate.costClass !== undefined &&
    !isRouterCostClass(candidate.costClass)
  ) {
    invalidExternalConfig(
      `Candidato externo "${candidate.id}" possui costClass invalida.`,
    );
  }

  if (candidate.label !== undefined && typeof candidate.label !== "string") {
    invalidExternalConfig(
      `Candidato externo "${candidate.id}" possui label invalido.`,
    );
  }

  return Object.freeze({
    id: candidate.id,
    provider: candidate.provider,
    model: candidate.model,
    capabilities: Object.freeze([...candidate.capabilities]),
    priority: candidate.priority,
    enabled: candidate.enabled,
    ...(candidate.deployment !== undefined
      ? { deployment: candidate.deployment }
      : {}),
    ...(candidate.costClass !== undefined
      ? { costClass: candidate.costClass }
      : {}),
    ...(candidate.label !== undefined ? { label: candidate.label } : {}),
  });
}

/**
 * Valida e normaliza uma lista de candidatos externos injetados pela camada
 * de composicao, retornando uma lista imutavel de RouterCandidate prontos
 * para serem entregues ao Candidate Registry.
 *
 * - entrada ausente ou `undefined` resulta em lista vazia (comportamento
 *   padrao equivalente a nao ter candidatos externos);
 * - ids duplicados entre os candidatos externos falham de forma controlada;
 * - dados invalidos (id/provider/model vazios, capabilities ausentes ou
 *   invalidas, priority nao inteira, enabled nao booleano, deployment fora
 *   do contrato) falham com ModelRouterError(code: "invalid_configuration");
 * - a entrada recebida nunca e mutada; o resultado e sempre congelado
 *   (Object.freeze), incluindo cada candidato e sua lista de capabilities.
 *
 * Esta funcao NAO instancia providers, NAO faz chamadas de rede e NAO le
 * process.env.
 */
export function normalizeExternalRouterCandidates(
  input?: readonly ExternalRouterCandidateConfig[],
): readonly RouterCandidate[] {
  if (input === undefined) {
    return EMPTY_EXTERNAL_CANDIDATES;
  }

  if (!Array.isArray(input)) {
    invalidExternalConfig(
      "A configuracao de candidatos externos exige uma lista.",
    );
  }

  const seenIds = new Set<string>();
  const normalized: RouterCandidate[] = [];

  for (let index = 0; index < input.length; index += 1) {
    const candidate = validateExternalCandidate(input[index], index);
    if (seenIds.has(candidate.id)) {
      invalidExternalConfig(
        `Id logico de candidato externo duplicado: ${candidate.id}.`,
      );
    }
    seenIds.add(candidate.id);
    normalized.push(candidate);
  }

  return Object.freeze(normalized);
}
