import {
  AIProviderError,
  type AIProviderErrorCode,
} from "@/lib/ai/types";

interface OllamaErrorLike {
  status?: number;
  code?: string;
  name?: string;
  message?: string;
  cause?: unknown;
}

export interface OllamaProviderErrorContext {
  provider?: string;
  model?: string;
  timedOut?: boolean;
  statusCode?: number;
  metadata?: Record<string, unknown>;
}

function extractMessage(error: OllamaErrorLike, fallback: string) {
  if (typeof error.message === "string" && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

function includesAny(value: string, patterns: string[]) {
  return patterns.some((pattern) => value.includes(pattern));
}

function getErrorCode(
  error: OllamaErrorLike,
  context: OllamaProviderErrorContext,
): AIProviderErrorCode {
  const rawMessage = String(error.message ?? "").toLowerCase();
  const metadataReason = String(context.metadata?.reason ?? "").toLowerCase();

  if (context.timedOut) return "timeout";
  if (error.name === "AbortError") return "cancelled";
  if (error.status === 400) return "invalid_request";
  if (error.status === 401) return "authentication";
  if (error.status === 403) return "authorization";
  if (error.status === 404) return "model_not_found";
  if (error.status === 408) return "timeout";
  if (error.status !== undefined && error.status >= 500) return "unavailable";

  if (
    includesAny(rawMessage, [
      "not found, try pulling it first",
      "model not found",
      "pull it first",
    ])
  ) {
    return "model_not_found";
  }

  if (
    includesAny(rawMessage, [
      "econnrefused",
      "fetch failed",
      "failed to fetch",
      "connect",
      "connection refused",
      "networkerror",
    ])
  ) {
    return "unavailable";
  }

  if (
    metadataReason === "body-missing" ||
    metadataReason === "invalid-json" ||
    metadataReason === "unexpected-format" ||
    metadataReason === "http-error"
  ) {
    return "provider_error";
  }

  return "unknown";
}

function isRetryable(code: AIProviderErrorCode) {
  return (
    code === "timeout" ||
    code === "unavailable" ||
    code === "provider_error"
  );
}

export function toOllamaProviderError(
  error: unknown,
  context: OllamaProviderErrorContext = {},
): AIProviderError {
  if (error instanceof AIProviderError) {
    return error;
  }

  const candidate = (error ?? {}) as OllamaErrorLike;
  const code = getErrorCode(candidate, context);
  const message =
    code === "authentication"
      ? "A autenticacao com o Ollama falhou."
      : code === "authorization"
        ? "O Ollama recusou a operacao solicitada."
        : code === "invalid_request"
          ? extractMessage(candidate, "O pedido enviado ao Ollama e invalido.")
          : code === "model_not_found"
            ? "O modelo solicitado nao esta instalado no Ollama."
            : code === "timeout"
              ? "O Ollama demorou mais que o permitido."
              : code === "cancelled"
                ? "A operacao com o Ollama foi cancelada."
                : code === "unavailable"
                  ? "O servidor Ollama esta indisponivel no momento."
                  : context.metadata?.reason === "body-missing"
                    ? "O Ollama respondeu sem body para esta operacao."
                    : context.metadata?.reason === "invalid-json"
                      ? "O Ollama retornou JSON invalido no streaming."
                      : context.metadata?.reason === "unexpected-format"
                        ? "O Ollama retornou um formato inesperado."
                        : extractMessage(
                            candidate,
                            "O Ollama retornou um erro inesperado.",
                          );

  return new AIProviderError({
    code,
    message,
    provider: context.provider,
    model: context.model,
    retryable: isRetryable(code),
    cause: error,
    statusCode: context.statusCode ?? candidate.status,
    metadata: context.metadata,
  });
}
