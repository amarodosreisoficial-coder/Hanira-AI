import { AIProviderError, type AIProviderErrorCode } from "@/lib/ai/types";
import { logAIProviderErrorThrown } from "@/lib/ai/ai-provider-error-logging";
import { GROQ_PROVIDER_ID, type GroqErrorResponse } from "./groq-types";

export interface GroqErrorContext {
  provider?: string;
  model?: string;
  statusCode?: number;
  metadata?: Record<string, unknown>;
}

interface GroqErrorLike {
  status?: number;
  code?: string;
  name?: string;
  message?: string;
  cause?: unknown;
}

function extractMessage(error: GroqErrorLike, fallback: string): string {
  if (typeof error.message === "string" && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

function getErrorCode(
  error: GroqErrorLike,
  context: GroqErrorContext,
): AIProviderErrorCode {
  if (error.name === "AbortError") return "cancelled";

  const status = error.status ?? context.statusCode;

  if (status === 400) return "invalid_request";
  if (status === 401) return "authentication";
  if (status === 403) return "authorization";
  if (status === 404) return "model_not_found";
  if (status === 408) return "timeout";
  if (status === 429) return "rate_limit";
  if (typeof status === "number" && status >= 500) return "provider_error";

  const rawMessage = String(error.message ?? "").toLowerCase();

  if (
    rawMessage.includes("econnrefused") ||
    rawMessage.includes("fetch failed") ||
    rawMessage.includes("failed to fetch") ||
    rawMessage.includes("enotfound") ||
    rawMessage.includes("eai_again") ||
    rawMessage.includes("connect") ||
    rawMessage.includes("connection refused") ||
    rawMessage.includes("networkerror") ||
    rawMessage.includes("network error") ||
    rawMessage.includes("getaddrinfo")
  ) {
    return "unavailable";
  }

  if (
    rawMessage.includes("socket hang up") ||
    rawMessage.includes("other side closed") ||
    rawMessage.includes("connection closed") ||
    rawMessage.includes("terminated") ||
    rawMessage.includes("unexpected end")
  ) {
    return "provider_error";
  }

  if (
    rawMessage.includes("timeout") ||
    rawMessage.includes("timed out") ||
    context.metadata?.reason === "request-timeout" ||
    context.metadata?.reason === "connect-timeout"
  ) {
    return "timeout";
  }

  if (
    context.metadata?.reason === "invalid-json" ||
    context.metadata?.reason === "unexpected-content-type" ||
    context.metadata?.reason === "malformed-response" ||
    context.metadata?.reason === "body-missing"
  ) {
    return "provider_error";
  }

  return "unknown";
}

function isRetryable(code: AIProviderErrorCode): boolean {
  return (
    code === "rate_limit" ||
    code === "timeout" ||
    code === "unavailable" ||
    code === "provider_error"
  );
}

function getPublicMessage(code: AIProviderErrorCode, fallback: string): string {
  switch (code) {
    case "authentication":
      return "A autenticacao com o provedor cloud falhou.";
    case "authorization":
      return "O provedor cloud recusou a operacao solicitada.";
    case "invalid_request":
      return "O pedido enviado ao provedor cloud e invalido.";
    case "model_not_found":
      return "O modelo configurado nao esta disponivel no provedor cloud.";
    case "timeout":
      return "O provedor cloud demorou mais que o permitido.";
    case "cancelled":
      return "A operacao com o provedor cloud foi cancelada.";
    case "unavailable":
      return "O provedor cloud esta indisponivel no momento.";
    case "rate_limit":
      return "O provedor cloud recusou temporariamente novas requisicoes.";
    default:
      return fallback;
  }
}

export function toGroqProviderError(
  error: unknown,
  context: GroqErrorContext = {},
): AIProviderError {
  if (error instanceof AIProviderError) {
    logAIProviderErrorThrown({
      sourceFile: "lib/ai/providers/groq/groq-errors.ts",
      sourceLine: 118,
      reason: "groq_error_passthrough",
      requestId:
        typeof error.metadata?.requestId === "string"
          ? error.metadata.requestId
          : undefined,
    });
    return error;
  }

  const candidate = (error ?? {}) as GroqErrorLike;
  const code = getErrorCode(candidate, context);
  const fallback = "O provedor cloud retornou um erro inesperado.";
  const message = getPublicMessage(code, extractMessage(candidate, fallback));

  logAIProviderErrorThrown({
    sourceFile: "lib/ai/providers/groq/groq-errors.ts",
    sourceLine: 140,
    reason: `groq_error_normalized:${code}:${String(context.metadata?.reason ?? "generic")}`,
    requestId:
      typeof context.metadata?.requestId === "string"
        ? context.metadata.requestId
        : undefined,
  });

  return new AIProviderError({
    code,
    message,
    provider: context.provider ?? GROQ_PROVIDER_ID,
    model: context.model,
    retryable: isRetryable(code),
    cause: error,
    statusCode: context.statusCode ?? candidate.status,
    metadata: context.metadata,
  });
}

export function parseGroqErrorBody(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const error = (body as GroqErrorResponse).error;
  if (!error) return "";
  return error.message ?? "";
}
