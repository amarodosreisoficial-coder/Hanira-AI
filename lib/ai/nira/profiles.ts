import { ModelRouterError } from "@/lib/ai/router/errors";
import { OLLAMA_DEFAULT_CANDIDATE_ID } from "@/lib/ai/router/candidate-registry";
import type { RouterCapability } from "@/lib/ai/router/types";

// Camada Nira (Pacote 14.5) - identidade operacional da Hanira.
//
// Nira e a camada de identidade/capability da Hanira, ACIMA do Model Router:
// um perfil Nira representa um produto estavel da Hanira (ex.: Nira Local) e
// aponta para um CANDIDATO LOGICO do router (preferredCandidateId), nunca para
// um provider concreto nem para um modelo fisico.
//
// Fluxo:
//
//   Hanira
//     -> Nira Profile
//     -> Candidate Configuration
//     -> Candidate Registry
//     -> ModelRouter
//     -> RouterDecision
//     -> Provider Resolver
//     -> AIProvider
//
// Esta camada:
// - NAO importa AIProvider, OllamaProvider ou qualquer provider (incluindo
//   providers cloud como GLM, DeepSeek, Laguna e LongCat);
// - NAO le process.env nem qualquer secret;
// - NAO instancia providers, NAO chama rede e NAO acessa Supabase;
// - e puramente declarativa: catalogo imutavel e resolucao deterministica.

// Id logico estavel do unico perfil Nira real deste pacote.
export const NIRA_LOCAL_PROFILE_ID = "nira-local";

// Nome de exibicao seguro (UI/runtime), sem conteudo sensivel.
export const NIRA_LOCAL_PROFILE_NAME = "Nira Local";

// Capability primaria do perfil, usando o contrato RouterCapability.
export const NIRA_LOCAL_PROFILE_CAPABILITY = "text" as const;

// Nira Local conhece apenas o id logico do candidato padrao do router
// (ollama-default). Nao ha nenhum acoplamento a OllamaProvider: quem converte
// a decisao em instancia real continua sendo o Provider Resolver.
export const NIRA_LOCAL_PREFERRED_CANDIDATE_ID = OLLAMA_DEFAULT_CANDIDATE_ID;

// Contrato de perfil Nira. Perfil aponta para candidato logico do router
// (preferredCandidateId), nao para provider concreto.
export interface NiraProfile {
  // Id logico estavel do perfil (ex.: "nira-local").
  readonly id: string;
  // Nome de exibicao seguro para UI/runtime.
  readonly name: string;
  // Capability primaria do perfil (contrato RouterCapability).
  readonly capability: RouterCapability;
  // Id logico do candidato preferido do Model Router. NUNCA e um provider
  // instanciado nem um provider id solto.
  readonly preferredCandidateId: string;
  // Pacote 14.8: candidatos logicos adicionais que podem servir este perfil,
  // em ordem de preferencia. FUNDACAO para fallback futuro (Pacote 14.9+):
  // nenhum fallback executavel (retry/repique por falha) e implementado
  // neste pacote. Vazio por padrao.
  readonly fallbackCandidateIds?: readonly string[];
  // Descricao opcional puramente informativa (sem dados sensiveis).
  readonly description?: string;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function invalidProfile(message: string): never {
  throw new ModelRouterError({
    code: "invalid_configuration",
    message,
  });
}

const NIRA_LOCAL_PROFILE: NiraProfile = Object.freeze({
  id: NIRA_LOCAL_PROFILE_ID,
  name: NIRA_LOCAL_PROFILE_NAME,
  capability: NIRA_LOCAL_PROFILE_CAPABILITY,
  preferredCandidateId: NIRA_LOCAL_PREFERRED_CANDIDATE_ID,
  description:
    "Perfil padrao local/offline da Hanira, executando o modelo local atraves do candidato ollama-default.",
});

// Pacote 14.8 - Nira Cloud Free (fundacao).
//
// Perfil de produto para capacidade CLOUD GRATUITA da Hanira, sob o
// Zero-Cost Mode (orcamento R$ 0,00/mes). Principios:
// - NAO e acoplado a nenhum provider (nenhum Groq, Gemini, OpenRouter,
//   Together, Alibaba, Z.ai ou DeepSeek aparece aqui): o perfil expressa
//   INTENCAO/CAPACIDADE e o Model Router resolve o candidato;
// - aponta para um SLOT LOGICO estavel (nira-cloud-free-default). NESTE
//   pacote NENHUM candidato cloud real esta registrado: o perfil existe
//   sem candidato executavel e isso e representado corretamente com erro
//   estruturado (capacity_unavailable) — a disponibilidade NUNCA e fingida;
// - nenhum secret, chave de API ou chamada de rede pertence a esta camada.
export const NIRA_CLOUD_FREE_PROFILE_ID = "nira-cloud-free";

// Nome de exibicao seguro (UI/runtime), sem conteudo sensivel.
export const NIRA_CLOUD_FREE_PROFILE_NAME = "Nira Cloud Free";

// Capability primaria do perfil, usando o contrato RouterCapability.
export const NIRA_CLOUD_FREE_PROFILE_CAPABILITY = "text" as const;

// Slot logico estavel do candidato cloud free. E um identificador de
// INTENCAO, nao um provider: pacotes futuros registraro candidatos cloud
// (com costClass valida e politica elegivel) sob este id logico ou via
// fallbackCandidateIds, sem alterar a identidade do perfil.
export const NIRA_CLOUD_FREE_PREFERRED_CANDIDATE_ID =
  "nira-cloud-free-default";

const NIRA_CLOUD_FREE_PROFILE: NiraProfile = Object.freeze({
  id: NIRA_CLOUD_FREE_PROFILE_ID,
  name: NIRA_CLOUD_FREE_PROFILE_NAME,
  capability: NIRA_CLOUD_FREE_PROFILE_CAPABILITY,
  preferredCandidateId: NIRA_CLOUD_FREE_PREFERRED_CANDIDATE_ID,
  fallbackCandidateIds: Object.freeze([]),
  description:
    "Perfil cloud gratuito da Hanira sob Zero-Cost Mode. Nao e acoplado a nenhum provider: o Model Router resolve o candidato logico elegivel.",
});

// Catalogo declarativo e imutavel de perfis Nira. Nenhuma outra estrutura
// (Fast, Pro, Code, Agent, Vision, Video) existe neste pacote.
export const NIRA_PROFILES: readonly NiraProfile[] = Object.freeze([
  NIRA_LOCAL_PROFILE,
  NIRA_CLOUD_FREE_PROFILE,
]);

// Perfil padrao do runtime quando nenhum niraProfileId e informado.
export const DEFAULT_NIRA_PROFILE_ID = NIRA_LOCAL_PROFILE_ID;

/**
 * Retorna o ESCOPO de candidatos logicos que podem servir um perfil Nira:
 * [preferredCandidateId, ...fallbackCandidateIds], imutavel.
 *
 * O runtime NUNCA seleciona, para um perfil, um candidato fora deste escopo
 * (sem fallback silencioso entre perfis/capacidades diferentes). A eleicao
 * dentro do escopo continua seguindo o ModelRouter (prioridade + preferencia
 * + politica financeira).
 *
 * Funcao pura: nao le env, nao chama rede, nao instancia providers.
 */
export function getNiraProfileCandidateIds(
  profile: NiraProfile,
): readonly string[] {
  return Object.freeze([
    profile.preferredCandidateId,
    ...(profile.fallbackCandidateIds ?? []),
  ]);
}

/**
 * Resolve um perfil Nira pelo id logico.
 *
 * - perfil conhecido: retorna o proprio perfil imutavel do catalogo;
 * - perfil desconhecido ou id vazio: falha com ModelRouterError
 *   (codigo invalid_configuration), sem vazar objetos ou dados sensiveis;
 * - esta funcao NAO instancia provider, NAO le process.env, NAO chama rede
 *   e NAO acessa Supabase.
 */
export function resolveNiraProfile(profileId: string): NiraProfile {
  if (!isNonEmptyString(profileId)) {
    invalidProfile("O perfil Nira exige um id nao vazio.");
  }

  for (const profile of NIRA_PROFILES) {
    if (profile.id === profileId) {
      return profile;
    }
  }

  return invalidProfile(`Perfil Nira desconhecido: ${profileId}.`);
}