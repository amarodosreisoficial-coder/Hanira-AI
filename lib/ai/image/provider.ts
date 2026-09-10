import type {
  ImageCapability,
  ImageResult,
} from "@/lib/ai/image/types";
import type { ImageModelDefinition } from "@/lib/ai/image/model-catalog";
import type { ImageModelCatalog } from "@/lib/ai/image/model-catalog";

// Abstracao de ImageProvider (Pacote 16.7 — Nira Image Architecture Foundation).
//
// Analogia estrutural com AIProvider (lib/ai/provider.ts) porem especializada
// para o dominio de imagens. Provider declara capacidades; adapters traduzem a
// requisicao canonica Hanira em payload especifico do provider.
//
// Nenhum provider real e implementado neste pacote (apenas MockImageProvider).
// Esta abstracao existe para que futuros providers (Cloudflare, Runware...)
// sejam plugaveis sem alterar o roteador.

export interface ImageProviderConfiguration {
  readonly configured: boolean;
  readonly enabled: boolean;
}

export interface ImageProvider {
  // Id logico ESTAVEL do provider.
  readonly providerId: string;
  readonly displayName: string;
  // Estado de configuracao (segredos presentes? habilitado?).
  readonly configuration: ImageProviderConfiguration;
  // Modelos expostos por este provider.
  readonly models: readonly ImageModelDefinition[];
  // Capacidades suportadas (uniao das capacidades dos modelos).
  readonly capabilities: readonly ImageCapability[];

  // Executa a operacao de imagem (generate/edit). Implementacoes reais farao
  // chamada de rede server-side; o Mock retorna deterministicamente.
  generate(request: ImageProviderRequest): Promise<ImageResult>;
  edit(request: ImageProviderRequest): Promise<ImageResult>;

  // Suporta a capability requerida?
  supports(capability: ImageCapability): boolean;
}

// Requisicao normalizada para o provider (ja traduzida do request canonico).
export interface ImageProviderRequest {
  readonly prompt: string;
  readonly operation: "generate" | "edit";
  readonly modelId: string;
  readonly width?: number;
  readonly height?: number;
  readonly aspectRatio?: string;
  readonly negativePrompt?: string;
  readonly references?: readonly ImageProviderReference[];
  readonly seed?: number;
  readonly qualityMode?: string;
}

export interface ImageProviderReference {
  readonly id: string;
  readonly mimeType: string;
}

// Base opcional para providers compartilharem logica de capacidade.
export abstract class BaseImageProvider implements ImageProvider {
  abstract readonly providerId: string;
  abstract readonly displayName: string;
  abstract readonly configuration: ImageProviderConfiguration;
  abstract readonly models: readonly ImageModelDefinition[];

  get capabilities(): readonly ImageCapability[] {
    const union = new Set<ImageCapability>();
    for (const model of this.models) {
      for (const cap of model.capabilities) {
        union.add(cap);
      }
    }
    return Object.freeze([...union]);
  }

  supports(capability: ImageCapability): boolean {
    return this.capabilities.includes(capability);
  }

  abstract generate(request: ImageProviderRequest): Promise<ImageResult>;
  abstract edit(request: ImageProviderRequest): Promise<ImageResult>;
}
