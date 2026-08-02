import {
  AIProviderError,
  type AIProviderErrorCode,
} from "@/lib/ai/types";
import { logAIProviderErrorThrown } from "@/lib/ai/ai-provider-error-logging";

interface OpenAIErrorLike {
  status?: number;
  code?: string;
  name?: string;
  message?: string;
  type?: string;
}

export interface OpenAIProviderErrorContext {
  provider?: string;
  model?: string;
}

function getErrorMessage(error: OpenAIErrorLike, fallback: string) {
  if (typeof error.message === "string" && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

function getErrorCode(error: OpenAIErrorLike): AIProviderErrorCode {
  if (error.name === "AbortError") return "cancelled";
  if (error.status === 400) return "invalid_request";
  if (error.status === 401) return "authentication";
  if (error.status === 403) return "authorization";
  if (error.status === 408) return "timeout";
  if (error.status === 429) return "rate_limit";
  if (error.status === 404 || error.code === "model_not_found") {
    return "model_not_found";
  }
  if (error.code === "content_filter") return "content_rejected";
  if (error.status !== undefined && error.status >= 500) return "unavailable";
  if (error.type === "invalid_request_error") return "invalid_request";
  return "unknown";
}

function isRetryable(code: AIProviderErrorCode) {
  return (
    code === "rate_limit" ||
    code === "timeout" ||
    code === "unavailable" ||
    code === "provider_error"
  );
}

export function toOpenAIProviderError(
  error: unknown,
  context: OpenAIProviderErrorContext = {},
): AIProviderError {
  if (error instanceof AIProviderError) {
    logAIProviderErrorThrown({
      sourceFile: "lib/ai/providers/openai/openai-errors.ts",
      sourceLine: 55,
      reason: "openai_error_passthrough",
      requestId:
        typeof error.metadata?.requestId === "string"
          ? error.metadata.requestId
          : undefined,
    });
    return error;
  }

  const candidate = (error ?? {}) as OpenAIErrorLike;
  const code = getErrorCode(candidate);
  const message =
    code === "authentication"
      ? "A autenticação com o provider falhou."
      : code === "authorization"
        ? "O provider recusou a operação solicitada."
        : code === "rate_limit"
          ? "O limite do provider foi atingido."
          : code === "timeout"
            ? "O provider demorou mais que o permitido."
            : code === "model_not_found"
              ? "O modelo solicitado não está disponível."
              : code === "content_rejected"
                ? "O conteúdo foi rejeitado pelo provider."
                : code === "invalid_request"
                  ? getErrorMessage(candidate, "O pedido enviado ao provider é inválido.")
                  : code === "unavailable"
                    ? "O provider está temporariamente indisponível."
                    : getErrorMessage(candidate, "O provider retornou um erro inesperado.");

  logAIProviderErrorThrown({
    sourceFile: "lib/ai/providers/openai/openai-errors.ts",
    sourceLine: 80,
    reason: `openai_error_normalized:${code}`,
  });
  return new AIProviderError({
    code,
    message,
    provider: context.provider,
    model: context.model,
    retryable: isRetryable(code),
    cause: error,
    statusCode: candidate.status,
  });
}
