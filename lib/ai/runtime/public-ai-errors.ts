import { AIProviderError } from "@/lib/ai/types";

export type PublicAIErrorCode =
  | "unavailable"
  | "model_not_found"
  | "timeout"
  | "cancelled"
  | "invalid_request"
  | "provider_error"
  | "unknown";

export interface AIProviderErrorLike {
  code?: PublicAIErrorCode | string;
  name?: string;
  message?: string;
  provider?: string;
  status?: number;
  statusCode?: number;
  cause?: unknown;
}

export interface PublicAIError {
  code: PublicAIErrorCode;
  message: string;
  status: number;
  cancelled: boolean;
}

const PUBLIC_AI_ERROR_MESSAGES: Record<
  Exclude<PublicAIErrorCode, "cancelled">,
  { message: string; status: number }
> = {
  unavailable: {
    message: "O motor local da Hanira não está disponível no momento.",
    status: 503,
  },
  model_not_found: {
    message: "O modelo local da Hanira ainda não está instalado.",
    status: 503,
  },
  timeout: {
    message: "A Hanira demorou mais que o esperado para responder.",
    status: 408,
  },
  invalid_request: {
    message: "Não foi possível processar esta solicitação.",
    status: 400,
  },
  provider_error: {
    message: "A Hanira encontrou um problema ao gerar a resposta.",
    status: 502,
  },
  unknown: {
    message: "A Hanira encontrou um problema ao gerar a resposta.",
    status: 500,
  },
};

function normalizePublicAIErrorCode(error: unknown): PublicAIErrorCode {
  const candidate = error as AIProviderErrorLike | undefined;

  if (candidate?.code === "cancelled" || candidate?.name === "AbortError") {
    return "cancelled";
  }
  if (candidate?.code === "unavailable") {
    return "unavailable";
  }
  if (candidate?.code === "model_not_found") {
    return "model_not_found";
  }
  if (candidate?.code === "timeout") {
    return "timeout";
  }
  if (candidate?.code === "invalid_request") {
    return "invalid_request";
  }
  if (candidate?.code === "provider_error") {
    return "provider_error";
  }
  return "unknown";
}

export function toPublicAIError(error: unknown): PublicAIError {
  if (error instanceof AIProviderError && error.code === "unsupported_capability") {
    return {
      code: "invalid_request",
      message: "Nao foi possivel processar esta solicitacao.",
      status: 400,
      cancelled: false,
    };
  }

  const code = normalizePublicAIErrorCode(error);
  if (code === "cancelled") {
    return {
      code,
      message: "",
      status: 499,
      cancelled: true,
    };
  }

  const normalized = PUBLIC_AI_ERROR_MESSAGES[code];
  return {
    code,
    message: normalized.message,
    status: normalized.status,
    cancelled: false,
  };
}
