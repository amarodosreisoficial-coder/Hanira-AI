export interface SafeOpenAIError {
  status: number;
  type: string;
  message: string;
}

export function classifyOpenAIError(error: unknown): SafeOpenAIError {
  const candidate = error as {
    status?: number;
    code?: string;
    name?: string;
  };

  if (candidate?.name === "AbortError") {
    return {
      status: 408,
      type: "OpenAITimeout",
      message: "A resposta demorou mais que o esperado. Tente novamente.",
    };
  }
  if (candidate?.status === 401) {
    return {
      status: 503,
      type: "OpenAIAuthenticationError",
      message: "A inteligência da Hanira está temporariamente indisponível.",
    };
  }
  if (candidate?.status === 403 || candidate?.code === "model_not_found") {
    return {
      status: 503,
      type: "OpenAIModelAccessError",
      message: "O modelo configurado não está disponível para este projeto.",
    };
  }
  if (candidate?.status === 429) {
    return {
      status: 429,
      type: "OpenAIRateLimitError",
      message:
        "O limite da inteligência foi atingido. Aguarde ou verifique o faturamento.",
    };
  }
  if (candidate?.status && candidate.status >= 500) {
    return {
      status: 503,
      type: "OpenAIServiceError",
      message: "A OpenAI está temporariamente indisponível.",
    };
  }
  return {
    status: 500,
    type: "OpenAIUnknownError",
    message: "A Hanira não conseguiu responder agora. Tente novamente.",
  };
}
