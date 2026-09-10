import { ImageRouterError, type ImageRejection } from "@/lib/ai/image/errors";
import { ZERO_COST_IMAGE_POLICY, evaluateImageCostPolicy } from "@/lib/ai/image/cost-policy";
import type { ImageProvider } from "@/lib/ai/image/provider";
import type {
  ImageCapability,
  ImageRequest,
  ImageResult,
  ImageRoutingMode,
} from "@/lib/ai/image/types";
import type { ImageModelDefinition } from "@/lib/ai/image/model-catalog";

// Roteador de capacidade de imagem (Pacote 16.7).
//
// Fluxo:
//   ImageRequest -> capacidades requeridas -> modelos compativeis ->
//   elegibilidade financeira (ZERO-COST) -> disponibilidade ->
//   selecao deterministica de candidato.
//
// A filtragem por capacidade ANTES da execucao: um request exigindo
// multipleReferences=true rejeita modelos que suportam apenas referenceImage.

export interface ImageRouterCandidate {
  readonly provider: ImageProvider;
  readonly model: ImageModelDefinition;
}

export interface ImageRouterDecision {
  readonly candidate: ImageRouterCandidate;
  readonly evaluatedCount: number;
  readonly rejected: readonly ImageRejection[];
}

export interface ImageCapabilityRouterOptions {
  readonly costPolicy?: typeof ZERO_COST_IMAGE_POLICY;
  readonly allowPreviewModels?: boolean;
}

const DEFAULT_ROUTER_OPTIONS: ImageCapabilityRouterOptions = Object.freeze({
  costPolicy: ZERO_COST_IMAGE_POLICY,
  allowPreviewModels: false,
});

export function deriveRequiredCapabilities(
  request: ImageRequest,
): readonly ImageCapability[] {
  const required: ImageCapability[] = [];
  if (request.operation === "generate") {
    required.push("textToImage");
  } else if (request.operation === "edit") {
    required.push("imageEdit");
  }
  const references = request.references ?? [];
  if (references.length >= 2 && !required.includes("multipleReferences")) {
    required.push("multipleReferences");
  } else if (references.length === 1 && !required.includes("referenceImage")) {
    required.push("referenceImage");
  }
  if (request.aspectRatio && !required.includes("aspectRatio")) {
    required.push("aspectRatio");
  }
  if ((request.width || request.height) && !required.includes("resolution")) {
    required.push("resolution");
  }
  return Object.freeze(required);
}

function modelSupportsCapabilities(
  model: ImageModelDefinition,
  required: readonly ImageCapability[],
): boolean {
  return required.every((cap) => model.capabilities.includes(cap));
}

function isModeProductionSafe(mode: ImageRoutingMode): boolean {
  return mode === "free_first";
}
export class ImageCapabilityRouter {
  private readonly providers: readonly ImageProvider[];
  private readonly options: ImageCapabilityRouterOptions;

  constructor(
    providers: readonly ImageProvider[],
    options: ImageCapabilityRouterOptions = DEFAULT_ROUTER_OPTIONS,
  ) {
    this.providers = Object.freeze([...providers]);
    this.options = Object.freeze({ ...DEFAULT_ROUTER_OPTIONS, ...options });
  }

  select(request: ImageRequest): ImageRouterDecision {
    if (!request.prompt || request.prompt.trim().length === 0) {
      throw new ImageRouterError({
        code: "invalid_request",
        message: "Prompt de imagem vazio.",
      });
    }
    if (request.operation !== "generate" && request.operation !== "edit") {
      throw new ImageRouterError({
        code: "invalid_request",
        message: `Operacao de imagem invalida: ${request.operation}.`,
      });
    }
    const requiredCapabilities = deriveRequiredCapabilities(request);
    const routingMode: ImageRoutingMode = request.routingMode ?? "free_first";
    if (!isModeProductionSafe(routingMode)) {
      throw new ImageRouterError({
        code: "unsupported_capability",
        message: `Modo de roteamento de imagem nao suportado em producao: ${routingMode}.`,
      });
    }
    const eligibleProviders = this.providers.filter(
      (p) => p.configuration.configured && p.configuration.enabled,
    );
    const rejected: ImageRejection[] = [];
    const candidates: ImageRouterCandidate[] = [];
    for (const provider of eligibleProviders) {
      for (const model of provider.models) {
        if (!modelSupportsCapabilities(model, requiredCapabilities)) {
          rejected.push({ providerId: provider.providerId, modelId: model.id, reason: "capability_not_supported" });
          continue;
        }
        const costEvaluation = evaluateImageCostPolicy(model.costClass);
        if (!costEvaluation.eligible) {
          rejected.push({ providerId: provider.providerId, modelId: model.id, reason: costEvaluation.reason });
          continue;
        }
        if (model.lifecycle === "deprecated" || model.lifecycle === "disabled") {
          rejected.push({ providerId: provider.providerId, modelId: model.id, reason: model.lifecycle === "deprecated" ? "lifecycle_deprecated" : "lifecycle_disabled" });
          continue;
        }
        if (model.lifecycle === "preview" && !this.options.allowPreviewModels) {
          rejected.push({ providerId: provider.providerId, modelId: model.id, reason: "lifecycle_preview_blocked" });
          continue;
        }
        if (!model.enabled) {
          rejected.push({ providerId: provider.providerId, modelId: model.id, reason: "model_disabled" });
          continue;
        }
        candidates.push({ provider, model });
      }
    }
    if (candidates.length === 0) {
      throw new ImageRouterError({
        code: "no_eligible_provider",
        message: "Nenhum provider/model de imagem elegivel para o request.",
        metadata: { requestedOperation: request.operation, requiredCapabilities, providersConsidered: eligibleProviders.length, rejected },
      });
    }
    const candidate = candidates[0];
    return Object.freeze({ candidate, evaluatedCount: candidates.length + rejected.length, rejected: Object.freeze(rejected) });
  }

  async execute(request: ImageRequest): Promise<ImageResult> {
    const decision = this.select(request);
    const { provider, model } = decision.candidate;
    const base = {
      prompt: request.prompt,
      modelId: model.id,
      width: request.width,
      height: request.height,
      aspectRatio: request.aspectRatio,
      negativePrompt: request.negativePrompt,
      references: (request.references ?? []).map((r) => ({ id: r.id ?? "", mimeType: r.mimeType ?? "image/png" })),
      seed: request.seed,
      qualityMode: request.qualityMode,
    };
    if (request.operation === "edit") {
      return provider.edit({ ...base, operation: "edit" });
    }
    return provider.generate({ ...base, operation: "generate" });
  }
}
