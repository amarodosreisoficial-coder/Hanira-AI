import { ImageRouterError } from "@/lib/ai/image/errors";
import type { ImageModelDefinition } from "@/lib/ai/image/model-catalog";
import type { ImageProvider } from "@/lib/ai/image/provider";
import type { ImageCapability } from "@/lib/ai/image/types";
import { isRouterCostClass } from "@/lib/ai/router/types";
import type { RouterCostClass } from "@/lib/ai/router/types";

// Registry de ImageProviders (Pacote 16.7).
//
// Responsabilidade unica: registrar providers/models e resolve-los por id logico.
// - nao chama rede, nao instancia providers reais (apenas guarda referencias);
// - rejeita ids duplicados e definicoes malformadas deterministicamente;
// - impede que classificacao de custo desconhecida se torne elegivel.
//
// Sem descoberta remota dinamica. Sem rede.

export interface ImageProviderRegistry {
  readonly providers: readonly ImageProvider[];
  readonly configuredProviders: readonly ImageProvider[];
  readonly allModels: readonly ImageModelDefinition[];
  getProvider(id: string): ImageProvider | undefined;
  getModelsByProvider(providerId: string): readonly ImageModelDefinition[];
  findByCapabilities(
    required: readonly ImageCapability[],
  ): readonly ImageModelDefinition[];
}

export interface ImageProviderRegistryInput {
  readonly providers?: readonly ImageProvider[];
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidProvider(value: unknown): value is ImageProvider {
  if (!value || typeof value !== "object") return false;
  const provider = value as Record<string, unknown>;
  if (!isNonEmptyString(provider.providerId)) return false;
  if (!isNonEmptyString(provider.displayName)) return false;
  if (!provider.configuration || typeof provider.configuration !== "object") return false;
  const config = provider.configuration as Record<string, unknown>;
  if (typeof config.configured !== "boolean") return false;
  if (typeof config.enabled !== "boolean") return false;
  if (!Array.isArray(provider.models)) return false;
  if (!Array.isArray(provider.capabilities)) return false;
  return true;
}

function isValidModelForRegistry(model: ImageModelDefinition): boolean {
  if (!isNonEmptyString(model.id)) return false;
  if (!isNonEmptyString(model.providerId)) return false;
  if (!isNonEmptyString(model.displayName)) return false;
  if (!isRouterCostClass(model.costClass)) return false;
  if (model.lifecycle !== "production" && model.lifecycle !== "preview" && model.lifecycle !== "deprecated" && model.lifecycle !== "disabled") return false;
  if (!Array.isArray(model.capabilities)) return false;
  if (typeof model.enabled !== "boolean") return false;
  return true;
}

export function createImageProviderRegistry(
  input: ImageProviderRegistryInput = {},
): ImageProviderRegistry {
  const inputProviders = input.providers ?? [];

  const seenProviderIds = new Set<string>();
  for (const provider of inputProviders) {
    if (!isValidProvider(provider)) {
      throw new ImageRouterError({
        code: "invalid_configuration",
        message: "Provider de imagem malformado no registry.",
      });
    }
    if (seenProviderIds.has(provider.providerId)) {
      throw new ImageRouterError({
        code: "invalid_configuration",
        message: `Id logico de provider de imagem duplicado: ${provider.providerId}.`,
        metadata: { preferredProviderId: provider.providerId },
      });
    }
    seenProviderIds.add(provider.providerId);
  }

  // Valida unicidade de modelos entre providers e classificacao de custo.
  const seenModelIds = new Set<string>();
  for (const provider of inputProviders) {
    for (const model of provider.models) {
      if (!isValidModelForRegistry(model)) {
        throw new ImageRouterError({
          code: "invalid_configuration",
          message: `Modelo de imagem malformado no provider ${provider.providerId}.`,
        });
      }
      if (seenModelIds.has(model.id)) {
        throw new ImageRouterError({
          code: "invalid_configuration",
          message: `Id logico de modelo de imagem duplicado: ${model.id}.`,
          metadata: { preferredModelId: model.id },
        });
      }
      seenModelIds.add(model.id);
    }
  }

  const providers = Object.freeze([...inputProviders]);

  const allModels = Object.freeze(
    providers.flatMap((provider) => [...provider.models]),
  );

  const byProviderId = new Map<string, ImageProvider>();
  for (const provider of providers) {
    byProviderId.set(provider.providerId, provider);
  }

  const byModelId = new Map<string, ImageModelDefinition>();
  for (const model of allModels) {
    byModelId.set(model.id, model);
  }

  return Object.freeze({
    providers,
    get configuredProviders(): readonly ImageProvider[] {
      return Object.freeze(
        providers.filter((p) => p.configuration.configured && p.configuration.enabled),
      );
    },
    allModels,
    getProvider(id: string): ImageProvider | undefined {
      return byProviderId.get(id);
    },
    getModelsByProvider(providerId: string): readonly ImageModelDefinition[] {
      const provider = byProviderId.get(providerId);
      return provider ? provider.models : Object.freeze([]);
    },
    findByCapabilities(
      required: readonly ImageCapability[],
    ): readonly ImageModelDefinition[] {
      return Object.freeze(
        allModels.filter((model) =>
          required.every((cap) => model.capabilities.includes(cap)),
        ),
      );
    },
  });
}
