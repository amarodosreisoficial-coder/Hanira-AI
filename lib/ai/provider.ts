import type {
  AIChatRequest,
  AIChatResponse,
  AIModelInfo,
  AIProviderCapabilities,
  AIProviderCapability,
  AIStreamEvent,
} from "./types";

export interface AIProviderHealth {
  ok: boolean;
  provider: string;
  message?: string;
  metadata?: Record<string, unknown>;
}

export interface AIProvider {
  readonly providerId: string;
  readonly displayName?: string;
  readonly capabilities: AIProviderCapabilities;

  generate(request: AIChatRequest): Promise<AIChatResponse>;

  stream(request: AIChatRequest): AsyncIterable<AIStreamEvent>;

  healthCheck(): Promise<AIProviderHealth>;

  listModels(): Promise<AIModelInfo[]>;

  supports(capability: AIProviderCapability): boolean;
}
