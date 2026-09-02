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

// Catalogo declarativo e imutavel de perfis Nira. Nenhuma outra estrutura
// (Cloud, Fast, Pro, Code, Agent, Vision, Video) existe neste pacote.
export const NIRA_PROFILES: readonly NiraProfile[] = Object.freeze([
  NIRA_LOCAL_PROFILE,
]);

// Perfil padrao do runtime quando nenhum niraProfileId e informado.
export const DEFAULT_NIRA_PROFILE_ID = NIRA_LOCAL_PROFILE_ID;

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