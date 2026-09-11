import type { ImageCapability, ImageErrorCode, ImageOperation } from "@/lib/ai/image/types";

// Erro tipado do roteador de imagens (Pacote 16.7). Espelha o ModelRouterError do
// texto (lib/ai/router/errors.ts): carrega somente metadata operacional segura.
// Nunca carrega segredos, prompts, imagens, mensagens ou headers.

export interface ImageRouterErrorMetadata {
  readonly requestedOperation?: ImageOperation;
  readonly requiredCapabilities?: readonly ImageCapability[];
  readonly preferredProviderId?: string;
  readonly preferredModelId?: string;
  readonly providersConsidered?: number;
  readonly rejected?: readonly ImageRejection[];
  // Id logico do perfil Nira na origem da decisao (metadata apenas operacional).
  readonly niraProfileId?: string;
}

export interface ImageRejection {
  readonly providerId: string;
  readonly modelId: string;
  readonly reason: ImageRejectionReason;
}

// Razoes de rejeicao do roteador de imagens (seguras para observabilidade).
export const IMAGE_REJECTION_REASONS = [
  "provider_not_configured",
  "provider_disabled",
  "duplicate_provider_id",
  "duplicate_model_id",
  "malformed_provider",
  "malformed_model",
  "cost_class_unknown",
  "cost_blocked_paid",
  "cost_blocked_promotional",
  "lifecycle_preview_blocked",
  "lifecycle_deprecated",
  "lifecycle_disabled",
  "capability_not_supported",
  "model_disabled",
  "model_not_found",
] as const;

export type ImageRejectionReason = (typeof IMAGE_REJECTION_REASONS)[number];

export interface ImageRouterErrorOptions {
  message: string;
  code: ImageErrorCode;
  metadata?: ImageRouterErrorMetadata;
}

export class ImageRouterError extends Error {
  readonly code: ImageErrorCode;
  readonly metadata?: ImageRouterErrorMetadata;

  constructor(options: ImageRouterErrorOptions) {
    super(options.message);
    this.name = "ImageRouterError";
    this.code = options.code;
    this.metadata = options.metadata;
  }
}
