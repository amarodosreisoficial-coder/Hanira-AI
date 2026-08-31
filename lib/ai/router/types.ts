import type { AIProviderCapability } from "@/lib/ai/types";

// Contratos do Hanira Model Router (fundacao v1).
// O router depende apenas de identificadores logicos: nenhum provider concreto,
// nenhuma leitura de ambiente e nenhuma chamada de rede acontece nesta camada.

export const ROUTER_CAPABILITIES = [
  "text",
  "vision",
  "transcription",
  "speech",
  "embeddings",
  "tools",
] as const;

export type RouterCapability = (typeof ROUTER_CAPABILITIES)[number];

export const ROUTER_DEPLOYMENTS = ["local", "cloud"] as const;

export type RouterDeployment = (typeof ROUTER_DEPLOYMENTS)[number];

export function isRouterCapability(value: unknown): value is RouterCapability {
  return (ROUTER_CAPABILITIES as readonly string[]).includes(value as string);
}

export function isRouterDeployment(value: unknown): value is RouterDeployment {
  return (ROUTER_DEPLOYMENTS as readonly string[]).includes(value as string);
}

// Ponte declarativa entre o contrato do router e a porta AIProvider ja
// existente (lib/ai/types.ts). Usada no futuro pelo composition root para
// consultar candidate capabilities vindas de AIProviderCapabilities.
export const ROUTER_CAPABILITY_TO_PROVIDER_CAPABILITY: Readonly<
  Record<RouterCapability, AIProviderCapability>
> = {
  text: "text-generation",
  vision: "vision",
  transcription: "transcription",
  speech: "text-to-speech",
  embeddings: "embeddings",
  tools: "tools",
};

export interface RouterCandidate {
  // Identificador logico estavel do candidato (ex.: "nira-local-qwen").
  readonly id: string;
  // Identificador logico do provider (ex.: "ollama"). Nao e uma instancia.
  readonly provider: string;
  // Identificador logico do modelo conhecido pelo provider.
  readonly model: string;
  // Capacidades do contrato do router anunciadas pelo candidato.
  readonly capabilities: readonly RouterCapability[];
  // Convencao: MENOR numero = MAIOR prioridade. Desempate: id em ordem
  // alfabetica crescente. A ordem de entrada nunca altera a decisao.
  readonly priority: number;
  readonly enabled: boolean;
  // Classificacao opcional de implantacao para observabilidade.
  readonly deployment?: RouterDeployment;
  // Rotulo opcional de observabilidade (sem conteudo sensivel).
  readonly label?: string;
}

export type RouterRequestMetadataValue = string | number | boolean;

// Metadata opcional restrita a valores escalares operacionais (ex.: requestId).
// Prompts, mensagens, memorias e segredos nao pertencem aqui.
export type RouterRequestMetadata = Readonly<
  Record<string, RouterRequestMetadataValue>
>;

export interface RouterRequest {
  // Capability requerida pela tarefa.
  readonly capability: RouterCapability;
  // Preferencia opcional explicita por id logico de candidato. Se o candidato
  // preferido existir e for elegivel, ele vence; caso contrario, a selecao
  // cai deterministicamente para o melhor candidato por prioridade.
  // Perfis Nira (Local/Fast/Pro/Code/Agent) ainda nao existem; quando
  // existirem, resolverao para candidatos por baixo dos panos.
  readonly preferredCandidateId?: string;
  // Metadata operacional opcional. Nao e propagada para a decisao.
  readonly metadata?: RouterRequestMetadata;
}

export const ROUTER_REJECTION_REASONS = [
  "disabled",
  "capability_not_supported",
] as const;

export type RouterRejectionReason = (typeof ROUTER_REJECTION_REASONS)[number];

export interface RouterRejection {
  readonly candidateId: string;
  readonly provider: string;
  readonly reason: RouterRejectionReason;
}

export const ROUTER_DECISION_REASONS = [
  "selected_by_priority",
  "selected_by_preference",
  "selected_after_invalid_preference",
] as const;

export type RouterDecisionReason = (typeof ROUTER_DECISION_REASONS)[number];

export interface RouterSelectedCandidate {
  readonly candidateId: string;
  readonly provider: string;
  readonly model: string;
  readonly priority: number;
  readonly deployment?: RouterDeployment;
}

export interface RouterDecision {
  readonly capability: RouterCapability;
  readonly selected: RouterSelectedCandidate;
  readonly reason: RouterDecisionReason;
  // Quantidade de candidatos efetivamente avaliados ate a selecao.
  readonly evaluatedCount: number;
  // Candidatos avaliados e rejeitados, apenas com metadata operacional segura.
  readonly rejected: readonly RouterRejection[];
}
