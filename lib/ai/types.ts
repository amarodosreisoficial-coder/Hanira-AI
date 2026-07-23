export const AI_MESSAGE_ROLES = ["system", "user", "assistant"] as const;

export type AIMessageRole = (typeof AI_MESSAGE_ROLES)[number];

export interface AITextMessage {
  role: AIMessageRole;
  text: string;
}

export interface AIUsage {
  inputUnits?: number;
  outputUnits?: number;
  totalUnits?: number;
  metadata?: Record<string, unknown>;
}

export const AI_FINISH_REASONS = [
  "stop",
  "max_output_tokens",
  "cancelled",
  "content_rejected",
  "error",
  "unknown",
] as const;

export type AIFinishReason = (typeof AI_FINISH_REASONS)[number];

export interface AIChatRequest {
  messages: AITextMessage[];
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  metadata?: Record<string, unknown>;
}

export interface AIChatResponse {
  text: string;
  provider: string;
  model: string;
  usage?: AIUsage;
  finishReason: AIFinishReason;
  metadata?: Record<string, unknown>;
}

export const AI_PROVIDER_CAPABILITIES = [
  "text-generation",
  "text-streaming",
  "vision",
  "transcription",
  "text-to-speech",
  "embeddings",
  "tools",
  "structured-output",
] as const;

export type AIProviderCapability = (typeof AI_PROVIDER_CAPABILITIES)[number];

export interface AIProviderCapabilities {
  supported: readonly AIProviderCapability[];
}

export interface AIModelInfo {
  id: string;
  provider: string;
  label?: string;
  capabilities?: readonly AIProviderCapability[];
  metadata?: Record<string, unknown>;
}

export const AI_PROVIDER_ERROR_CODES = [
  "authentication",
  "authorization",
  "rate_limit",
  "timeout",
  "unavailable",
  "invalid_request",
  "unsupported_capability",
  "model_not_found",
  "content_rejected",
  "cancelled",
  "provider_error",
  "unknown",
] as const;

export type AIProviderErrorCode = (typeof AI_PROVIDER_ERROR_CODES)[number];

export interface AIProviderErrorOptions {
  message: string;
  code: AIProviderErrorCode;
  provider?: string;
  model?: string;
  retryable?: boolean;
  cause?: unknown;
  statusCode?: number;
  metadata?: Record<string, unknown>;
}

export class AIProviderError extends Error {
  readonly code: AIProviderErrorCode;
  readonly provider?: string;
  readonly model?: string;
  readonly retryable: boolean;
  override readonly cause?: unknown;
  readonly statusCode?: number;
  readonly metadata?: Record<string, unknown>;

  constructor(options: AIProviderErrorOptions) {
    super(options.message);
    this.name = "AIProviderError";
    this.code = options.code;
    this.provider = options.provider;
    this.model = options.model;
    this.retryable = options.retryable ?? isRetryableAIProviderErrorCode(options.code);
    this.cause = options.cause;
    this.statusCode = options.statusCode;
    this.metadata = options.metadata;
  }
}

export interface AIStreamStartEvent {
  type: "start";
  provider: string;
  model: string;
  metadata?: Record<string, unknown>;
}

export interface AIStreamTextDeltaEvent {
  type: "text-delta";
  textDelta: string;
}

export interface AIStreamUsageEvent {
  type: "usage";
  usage: AIUsage;
}

export interface AIStreamFinishEvent {
  type: "finish";
  finishReason: AIFinishReason;
  usage?: AIUsage;
  metadata?: Record<string, unknown>;
}

export interface AIStreamErrorEvent {
  type: "error";
  error: AIProviderError;
}

export type AIStreamEvent =
  | AIStreamStartEvent
  | AIStreamTextDeltaEvent
  | AIStreamUsageEvent
  | AIStreamFinishEvent
  | AIStreamErrorEvent;

export function isAIProviderErrorCode(
  value: string,
): value is AIProviderErrorCode {
  return (AI_PROVIDER_ERROR_CODES as readonly string[]).includes(value);
}

export function isRetryableAIProviderErrorCode(
  code: AIProviderErrorCode,
): boolean {
  return (
    code === "rate_limit" ||
    code === "timeout" ||
    code === "unavailable" ||
    code === "provider_error"
  );
}
