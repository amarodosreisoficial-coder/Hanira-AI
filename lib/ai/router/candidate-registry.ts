import { ModelRouterError } from "@/lib/ai/router/errors";
import {
  normalizeExternalRouterCandidates,
  type ExternalRouterCandidateConfig,
} from "@/lib/ai/router/candidate-config";
import type {
  RouterCapability,
  RouterCandidate,
} from "@/lib/ai/router/types";

// Registry tipado de candidatos do Hanira Model Router (Pacote 14.3,
// evoluido no Pacote 14.4 para aceitar candidatos externos).
//
// Responsabilidade unica: definir e fornecer a configuracao logica dos
// candidatos disponiveis. O registry:
// - nao cria providers (isso e papel do composition root / provider resolver);
// - nao le process.env nem secrets (valores como o model do Ollama sao
//   injetados pelo composition root, a partir da configuracao ja validada);
// - nao chama rede, nao acessa Supabase/HTTP/banco e nao executa modelos;
// - nao implementa fallback nem retries.
//
// Pacote 14.4: candidatos externos (`externalCandidates`) ja validados e
// normalizados pela External Candidate Configuration
// (lib/ai/router/candidate-config.ts) podem ser injetados aqui pela camada de
// composicao. Isso NAO ativa nenhum provider cloud: continua sendo apenas
// configuracao logica, sem instanciar providers, sem HTTP e sem secrets.
//
// Fluxo: External Candidate Configuration -> Candidate Registry ->
// ModelRouter -> RouterDecision -> Provider Resolver -> AIProvider.

// Id logico estavel do unico candidato real registrado hoje.
export const OLLAMA_DEFAULT_CANDIDATE_ID = "ollama-default";

// Prioridade fixa: existe somente um candidato real (convencao do
// ModelRouter: menor numero = maior prioridade).
const OLLAMA_DEFAULT_PRIORITY = 1;

export interface RouterCandidateRegistryInput {
  // Modelo logico do candidato Ollama, proveniente da configuracao do
  // runtime ja validada (resolveOllamaRuntimeConfig()). O registry nao le env.
  readonly ollamaModel?: string;
  // Candidatos adicionais fornecidos externamente pela camada de composicao
  // (Pacote 14.4). Cada item segue o mesmo contrato de RouterCandidate.
  // Passa por validacao/normalizacao (normalizeExternalRouterCandidates)
  // antes de entrar no catalogo. Padrao: nenhum candidato externo (`[]`),
  // preservando o comportamento atual (somente Ollama).
  readonly externalCandidates?: readonly ExternalRouterCandidateConfig[];
}

export interface RouterCandidateRegistry {
  // Snapshot completo, congelado e ordenado por (priority, id).
  readonly candidates: readonly RouterCandidate[];

  // Candidatos elegiveis para uma capability, na mesma ordem deterministica.
  getCandidatesForCapability(
    capability: RouterCapability,
  ): readonly RouterCandidate[];
}

function freezeCandidate(candidate: RouterCandidate): RouterCandidate {
  return Object.freeze({
    ...candidate,
    capabilities: Object.freeze([...candidate.capabilities]),
  });
}

function sortCandidates(
  candidates: readonly RouterCandidate[],
): readonly RouterCandidate[] {
  // Mesma convensao do ModelRouter (priority asc, id asc): a ordem de
  // registro nunca altera o resultado.
  return [...candidates].sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

function buildInternalCatalog(
  input: RouterCandidateRegistryInput,
): readonly RouterCandidate[] {
  // Catalogo interno ativo: SOMENTE Ollama. Nenhum provider cloud real e
  // adicionado aqui (nem via candidatos externos). Candidatos futuros
  // internos (ex.: glm-cloud-fast, deepseek-cloud-fast, nira-local,
  // laguna-code, longcat-agent) devem ser adicionados aqui em pacotes
  // proprios, com dados de configuracao injetados — nunca via strings
  // ficticias em runtime.
  if (!input.ollamaModel) return [];

  return [
    {
      id: OLLAMA_DEFAULT_CANDIDATE_ID,
      provider: "ollama",
      model: input.ollamaModel,
      capabilities: ["text"],
      priority: OLLAMA_DEFAULT_PRIORITY,
      enabled: true,
      deployment: "local",
      // Pacote 14.8: classificacao financeira DECLARADA EXPLICITAMENTE.
      // Execucao local no hardware do usuario, sem custo de API. A
      // classificacao e configuracao do candidato: NAO e inferida pelo nome
      // do provider ("ollama" != gratuito por convencao).
      costClass: "free",
      label: "Ollama local (texto)",
    },
  ];
}

export function createRouterCandidateRegistry(
  input: RouterCandidateRegistryInput,
): RouterCandidateRegistry {
  if (!input || typeof input !== "object") {
    throw new ModelRouterError({
      code: "invalid_configuration",
      message: "O registry de candidatos exige uma configuracao valida.",
    });
  }

  if (input.ollamaModel !== undefined && input.ollamaModel.trim().length === 0) {
    throw new ModelRouterError({
      code: "invalid_configuration",
      message: "O registry de candidatos exige um model Ollama nao vazio.",
    });
  }

  const internalCandidates = buildInternalCatalog(input);
  const externalCandidates = normalizeExternalRouterCandidates(
    input.externalCandidates,
  );

  const seenIds = new Set<string>();
  for (const candidate of internalCandidates) {
    seenIds.add(candidate.id);
  }
  for (const candidate of externalCandidates) {
    if (seenIds.has(candidate.id)) {
      throw new ModelRouterError({
        code: "invalid_configuration",
        message: `Id logico de candidato externo duplicado: ${candidate.id}.`,
      });
    }
    seenIds.add(candidate.id);
  }

  const candidates = Object.freeze(
    sortCandidates([...internalCandidates, ...externalCandidates]).map(
      freezeCandidate,
    ),
  );

  return Object.freeze({
    candidates,
    getCandidatesForCapability(
      capability: RouterCapability,
    ): readonly RouterCandidate[] {
      return Object.freeze(
        candidates.filter((candidate) =>
          candidate.capabilities.includes(capability),
        ),
      );
    },
  });
}
