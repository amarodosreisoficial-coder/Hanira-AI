import type { RouterCostClass } from "@/lib/ai/router/types";
import {
  isImageCapability,
  isImageModelLifecycle,
  type ImageCapability,
  type ImageModelLifecycle,
} from "@/lib/ai/image/types";

// Catalogo de modelos de imagem (Pacote 16.7 — provider-independent).
//
// Provider e modelo permanecem SEPARADOS: um modelo referencia seu provider
// logico, mas o provider e uma entidade distinta (registro no Provider Registry).
// Metadados descrevem capacidades, ciclo de vida e classificacao financeira.
//
// Garantias:
// - costClass ausente/desconhecida: fail-closed (UNKNOWN != FREE);
// - lifecycle ausente: "production" (compatibilidade);
// - deterministico e imutavel apos freezel.
//
// Pacote 16.7: SOMENTE modelo MOCK existe. Nenhum modelo real (Cloudflare,
// Runware, OpenAI, Gemini...) e criado aqui.

export interface ImageModelDefinition {
  // Id logico ESTAVEL do modelo (independente da nomenclatura do provider).
  readonly id: string;
  // Id logico do provider ao qual o modelo pertence.
  readonly providerId: string;
  readonly displayName: string;
  readonly lifecycle: ImageModelLifecycle;
  readonly capabilities: readonly ImageCapability[];
  readonly costClass: RouterCostClass;
  readonly enabled: boolean;
  // Metadados opcionais de capacidade (ex.: maxReferences, dimensoes).
  readonly limits?: ImageModelLimits;
}

export interface ImageModelLimits {
  readonly maxReferences?: number;
  readonly minWidth?: number;
  readonly maxWidth?: number;
  readonly minHeight?: number;
  readonly maxHeight?: number;
  readonly supportedMimeTypes?: readonly string[];
}

// Id logico estavel do provider MOCK.
export const IMAGE_MOCK_PROVIDER_ID = "nira-image-mock";

// Id logico estavel do modelo MOCK.
export const IMAGE_MOCK_MODEL_ID = "nira-image-mock-default";

// Capacidades MOCK (declaradas explicitamente como MOCK semantics).
const MOCK_CAPABILITIES: readonly ImageCapability[] = Object.freeze([
  "textToImage",
  "imageEdit",
  "referenceImage",
  "multipleReferences",
  "aspectRatio",
  "resolution",
]);

// Modelo MOCK: unico modelo elegivel no Pacote 16.7. Nenhuma chave de API,
// nenhum custo, nenhuma chamada de rede.
export const IMAGE_MOCK_MODEL: ImageModelDefinition = Object.freeze({
  id: IMAGE_MOCK_MODEL_ID,
  providerId: IMAGE_MOCK_PROVIDER_ID,
  displayName: "Nira Image Mock (test only)",
  lifecycle: "production",
  capabilities: MOCK_CAPABILITIES,
  costClass: "free",
  enabled: true,
  limits: Object.freeze({
    maxReferences: 4,
    minWidth: 64,
    maxWidth: 1920,
    minHeight: 64,
    maxHeight: 1920,
    supportedMimeTypes: Object.freeze(["image/png", "image/jpeg", "image/webp"]),
  }),
});

// Catalogo completo (apenas MOCK em 16.7). Congelado e imutavel.
export const IMAGE_MODEL_CATALOG: readonly ImageModelDefinition[] =
  Object.freeze([IMAGE_MOCK_MODEL]);

function freezeModel(model: ImageModelDefinition): ImageModelDefinition {
  return Object.freeze({
    ...model,
    capabilities: Object.freeze([...model.capabilities]),
    ...(model.limits
      ? {
          limits: Object.freeze({
            ...model.limits,
            ...(model.limits.supportedMimeTypes
              ? {
                  supportedMimeTypes: Object.freeze([
                    ...model.limits.supportedMimeTypes,
                  ]),
                }
              : {}),
          }),
        }
      : {}),
  });
}

export interface ImageModelCatalog {
  readonly models: readonly ImageModelDefinition[];
  getModel(id: string): ImageModelDefinition | undefined;
  getModelsByProvider(providerId: string): readonly ImageModelDefinition[];
  findByCapabilities(
    required: readonly ImageCapability[],
  ): readonly ImageModelDefinition[];
}

function isValidModelDefinition(value: unknown): value is ImageModelDefinition {
  if (!value || typeof value !== "object") return false;
  const model = value as Record<string, unknown>;
  if (typeof model.id !== "string" || model.id.trim().length === 0) return false;
  if (typeof model.providerId !== "string" || model.providerId.trim().length === 0) return false;
  if (typeof model.displayName !== "string" || model.displayName.trim().length === 0) return false;
  if (!isImageModelLifecycle(model.lifecycle)) return false;
  if (!Array.isArray(model.capabilities)) return false;
  for (const cap of model.capabilities) {
    if (!isImageCapability(cap)) return false;
  }
  if (model.costClass !== "free" && model.costClass !== "promotional" && model.costClass !== "paid") return false;
  if (typeof model.enabled !== "boolean") return false;
  return true;
}

export function createImageModelCatalog(
  models: readonly ImageModelDefinition[] = IMAGE_MODEL_CATALOG,
): ImageModelCatalog {
  const frozen = Object.freeze(models.map(freezeModel));

  const byId = new Map<string, ImageModelDefinition>();
  for (const model of frozen) {
    byId.set(model.id, model);
  }

  return Object.freeze({
    models: frozen,
    getModel(id: string): ImageModelDefinition | undefined {
      return byId.get(id);
    },
    getModelsByProvider(providerId: string): readonly ImageModelDefinition[] {
      return Object.freeze(
        frozen.filter((model) => model.providerId === providerId),
      );
    },
    findByCapabilities(
      required: readonly ImageCapability[],
    ): readonly ImageModelDefinition[] {
      return Object.freeze(
        frozen.filter((model) =>
          required.every((cap) => model.capabilities.includes(cap)),
        ),
      );
    },
  });
}

export function validateModelDefinition(
  value: unknown,
): asserts value is ImageModelDefinition {
  if (!isValidModelDefinition(value)) {
    throw new Error("Definicao de modelo de imagem malformada.");
  }
}
