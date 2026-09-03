import type {
  RouterCapability,
  RouterRejection,
} from "@/lib/ai/router/types";

export const ROUTER_ERROR_CODES = [
  "invalid_configuration",
  "invalid_request",
  "no_eligible_candidate",
  // Pacote 14.8: nao existe candidato executavel dentro do escopo do perfil
  // Nira (incluindo o caso "nenhum candidato financeiramente elegivel").
  // Erro estruturado do core: a traducao para texto de UI e responsabilidade
  // da camada HTTP/UI, nunca do router.
  "capacity_unavailable",
] as const;

export type RouterErrorCode = (typeof ROUTER_ERROR_CODES)[number];

export interface ModelRouterErrorMetadata {
  readonly requestedCapability?: RouterCapability;
  readonly preferredCandidateId?: string;
  readonly candidatesConsidered?: number;
  readonly rejected?: readonly RouterRejection[];
  // Pacote 14.8: id logico do perfil Nira na origem da decisao (metadata
  // apenas operacional, sem segredos).
  readonly niraProfileId?: string;
}

export interface ModelRouterErrorOptions {
  message: string;
  code: RouterErrorCode;
  metadata?: ModelRouterErrorMetadata;
}

// Erro tipado do router. Carrega somente metadata operacional segura:
// capability solicitada, preferencia, contagens e rejeicoes por id logico.
// Nunca carrega segredos, prompts, mensagens, memorias ou headers.
export class ModelRouterError extends Error {
  readonly code: RouterErrorCode;
  readonly metadata?: ModelRouterErrorMetadata;

  constructor(options: ModelRouterErrorOptions) {
    super(options.message);
    this.name = "ModelRouterError";
    this.code = options.code;
    this.metadata = options.metadata;
  }
}
