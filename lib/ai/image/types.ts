import type { RouterCostClass } from "@/lib/ai/router/types";

// Nira Image Domain Types (Pacote 16.7 — Nira Image Architecture Foundation + Mock).
//
// Camada de dominio provider-independent para imagens. Nenhum provider concreto,
// nenhuma leitura de ambiente e nenhuma chamada de rede acontece nesta camada.
// Referencias sao representadas de forma leve (sem binario): adapters de provider
// traduzirao para payload especifico posteriormente.

export const IMAGE_OPERATIONS = ["generate", "edit"] as const;

export type ImageOperation = (typeof IMAGE_OPERATIONS)[number];

export function isImageOperation(value: unknown): value is ImageOperation {
  return (IMAGE_OPERATIONS as readonly string[]).includes(value as string);
}

export const IMAGE_CAPABILITIES = [
  "textToImage",
  "imageEdit",
  "referenceImage",
  "multipleReferences",
  "characterConsistency",
  "identityPreservation",
  "aspectRatio",
  "resolution",
  "asyncGeneration",
] as const;

export type ImageCapability = (typeof IMAGE_CAPABILITIES)[number];

export function isImageCapability(value: unknown): value is ImageCapability {
  return (IMAGE_CAPABILITIES as readonly string[]).includes(value as string);
}

export const IMAGE_ASPECT_RATIOS = [
  "1:1",
  "2:3",
  "3:2",
  "3:4",
  "4:3",
  "4:5",
  "5:4",
  "9:16",
  "16:9",
  "21:9",
  "9:21",
] as const;

export type ImageAspectRatio = (typeof IMAGE_ASPECT_RATIOS)[number];

export function isImageAspectRatio(value: unknown): value is ImageAspectRatio {
  return (IMAGE_ASPECT_RATIOS as readonly string[]).includes(value as string);
}

// Referencia opcional de imagem (arquitetura). Leve e sem binario: adapters de
// provider traduzirao para payload especifico posteriormente. NUNCA carrega binario.
export interface ImageReferenceInput {
  readonly id?: string;
  readonly mimeType?: string;
  // Dados locais recebidos por um limite autenticado do Hanira. URLs remotas
  // nunca sao um formato valido de referencia.
  readonly data?: Blob;
  readonly sizeBytes?: number;
  readonly width?: number;
  readonly height?: number;
}

// Modos de roteamento (arquitetura apenas). FREE_FIRST e o unico modo operacional
// production-safe deste pacote: a politica ZERO-COST continua bloqueando paid/
// promocional/unknown independente do modo. Os demais modos NAO habilitam pago.
export const IMAGE_ROUTING_MODES = [
  "free_first",
  "economy",
  "balanced",
  "quality",
  "manual",
] as const;

export type ImageRoutingMode = (typeof IMAGE_ROUTING_MODES)[number];

export function isImageRoutingMode(value: unknown): value is ImageRoutingMode {
  return (IMAGE_ROUTING_MODES as readonly string[]).includes(value as string);
}

// Qualidade/economia requisitada (apenas FREE_FIRST e operacional em 16.7).
export const IMAGE_QUALITY_MODES = ["standard", "economy", "quality"] as const;

export type ImageQualityMode = (typeof IMAGE_QUALITY_MODES)[number];

export function isImageQualityMode(value: unknown): value is ImageQualityMode {
  return (IMAGE_QUALITY_MODES as readonly string[]).includes(value as string);
}

// Metadados de request seguros (apenas valores escalares operacionais).
export type ImageRequestMetadataValue = string | number | boolean;

export type ImageRequestMetadata = Readonly<
  Record<string, ImageRequestMetadataValue>
>;

// Requisicao canonica de imagem (provider-independent). Adapters de provider
// traduzirao para payload especifico posteriormente.
export interface ImageRequest {
  readonly prompt: string;
  readonly operation: ImageOperation;
  readonly aspectRatio?: ImageAspectRatio;
  readonly width?: number;
  readonly height?: number;
  readonly negativePrompt?: string;
  readonly references?: readonly ImageReferenceInput[];
  readonly preferredProviderId?: string;
  readonly preferredModelId?: string;
  readonly routingMode?: ImageRoutingMode;
  readonly qualityMode?: ImageQualityMode;
  readonly seed?: number;
  readonly metadata?: ImageRequestMetadata;
}

// Codigos de erro normalizados do roteador de imagens.
export const IMAGE_ERROR_CODES = [
  "invalid_configuration",
  "invalid_request",
  "unsupported_capability",
  "no_eligible_provider",
  "capacity_unavailable",
  "authentication",
  "rate_limit",
  "timeout",
  "provider_unavailable",
  "provider_error",
  "unknown",
] as const;

export type ImageErrorCode = (typeof IMAGE_ERROR_CODES)[number];

export function isImageErrorCode(value: unknown): value is ImageErrorCode {
  return (IMAGE_ERROR_CODES as readonly string[]).includes(value as string);
}

// Resultado provider-independent de uma operacao de imagem. Representa sucesso
// ou falha sem expor erros brutos de provider e sem carregar binario.
export interface ImageResult {
  readonly success: boolean;
  // true = resultado mock (nunca confundir com geracao real).
  readonly mock: boolean;
  readonly mimeType?: string;
  readonly width?: number;
  readonly height?: number;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly operation?: ImageOperation;
  readonly costClass?: RouterCostClass;
  readonly estimatedCost?: number;
  readonly actualCost?: number;
  readonly currency?: string;
  readonly durationMs?: number;
  // Payload efemero, mantido apenas no servidor para a futura camada de entrega.
  // Nao e persistido nem enviado para logs/observabilidade.
  readonly imageData?: ArrayBuffer;
  readonly errorCode?: ImageErrorCode;
  readonly errorMessage?: string;
  // Closed, sanitized transport diagnostic; never a raw provider response/error.
  readonly diagnosticCode?: "dns_error" | "connection_error" | "tls_error" | "timeout" | "authentication" | "rate_limit" | "provider_5xx" | "malformed_response" | "capacity_unavailable";
}

// Ciclo de vida de modelo de imagem (espelho do texto, para consistencia).
export const IMAGE_MODEL_LIFECYCLES = [
  "production",
  "preview",
  "deprecated",
  "disabled",
] as const;

export type ImageModelLifecycle = (typeof IMAGE_MODEL_LIFECYCLES)[number];

export function isImageModelLifecycle(
  value: unknown,
): value is ImageModelLifecycle {
  return (IMAGE_MODEL_LIFECYCLES as readonly string[]).includes(value as string);
}
