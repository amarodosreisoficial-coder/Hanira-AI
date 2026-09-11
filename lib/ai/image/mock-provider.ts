import { BaseImageProvider, type ImageProviderRequest } from "@/lib/ai/image/provider";
import { IMAGE_MOCK_MODEL, IMAGE_MOCK_PROVIDER_ID } from "@/lib/ai/image/model-catalog";
import type { ImageResult } from "@/lib/ai/image/types";

// MockImageProvider (Pacote 16.7).
//
// Proposito: testar toda a arquitetura de imagem SEM chamadas de rede,
// SEM segredos e COM custo R$0. NUNCA finge que uma imagem real foi gerada.
//
// - deterministico;
// - identifica-se explicitamente como MOCK (mock=true);
// - suporta falhas simuladas configuraveis em testes;
// - suporta capacidade indisponivel simulada;
// - suporta capability nao suportada simulada.

export interface MockImageProviderOptions {
  // Simula falha de provider (generate/edit retornam erro).
  readonly simulateFailure?: boolean;
  // Simula capacidade indisponivel.
  readonly simulateCapacityUnavailable?: boolean;
  // Simula capability nao suportada.
  readonly simulateUnsupportedCapability?: boolean;
  // Dimensoes padrao do resultado mock.
  readonly defaultWidth?: number;
  readonly defaultHeight?: number;
  // Provider considerado configurado? (default true).
  readonly configured?: boolean;
  readonly enabled?: boolean;
}

export const DEFAULT_MOCK_OPTIONS: MockImageProviderOptions = Object.freeze({
  simulateFailure: false,
  simulateCapacityUnavailable: false,
  simulateUnsupportedCapability: false,
  defaultWidth: 512,
  defaultHeight: 512,
  configured: true,
  enabled: true,
});

export class MockImageProvider extends BaseImageProvider {
  readonly providerId = IMAGE_MOCK_PROVIDER_ID;
  readonly displayName = "Nira Image Mock (test only)";
  readonly models = Object.freeze([IMAGE_MOCK_MODEL]);

  private readonly options: MockImageProviderOptions;

  constructor(options: MockImageProviderOptions = DEFAULT_MOCK_OPTIONS) {
    super();
    this.options = Object.freeze({ ...DEFAULT_MOCK_OPTIONS, ...options });
  }

  get configuration() {
    return Object.freeze({
      configured: this.options.configured ?? true,
      enabled: this.options.enabled ?? true,
    });
  }

  async generate(request: ImageProviderRequest): Promise<ImageResult> {
    return this.runMock(request.operation);
  }

  async edit(request: ImageProviderRequest): Promise<ImageResult> {
    return this.runMock(request.operation);
  }

  private runMock(operation: string): ImageResult {
    const startMs = Date.now();

    if (this.options.simulateUnsupportedCapability) {
      return Object.freeze({
        success: false,
        mock: true,
        errorCode: "unsupported_capability",
        errorMessage: "Capabilidade nao suportada (mock).",
        providerId: this.providerId,
        modelId: IMAGE_MOCK_MODEL.id,
        operation: operation as "generate" | "edit",
        durationMs: Date.now() - startMs,
      });
    }

    if (this.options.simulateCapacityUnavailable) {
      return Object.freeze({
        success: false,
        mock: true,
        errorCode: "capacity_unavailable",
        errorMessage: "Capacidade de imagem indisponivel (mock).",
        providerId: this.providerId,
        modelId: IMAGE_MOCK_MODEL.id,
        operation: operation as "generate" | "edit",
        durationMs: Date.now() - startMs,
      });
    }

    if (this.options.simulateFailure) {
      return Object.freeze({
        success: false,
        mock: true,
        errorCode: "provider_error",
        errorMessage: "Falha simulada de provider (mock).",
        providerId: this.providerId,
        modelId: IMAGE_MOCK_MODEL.id,
        operation: operation as "generate" | "edit",
        durationMs: Date.now() - startMs,
      });
    }

    const width = this.options.defaultWidth ?? 512;
    const height = this.options.defaultHeight ?? 512;

    return Object.freeze({
      success: true,
      mock: true,
      mimeType: "image/png",
      width,
      height,
      providerId: this.providerId,
      modelId: IMAGE_MOCK_MODEL.id,
      operation: operation as "generate" | "edit",
      costClass: "free",
      estimatedCost: 0,
      actualCost: 0,
      currency: "BRL",
      durationMs: Date.now() - startMs,
    });
  }
}
