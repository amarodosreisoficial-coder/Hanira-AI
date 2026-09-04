export const CHAT_ERROR_CODES = [
  "offline",
  "capacity_unavailable",
  "timeout",
  "unavailable",
  "rate_limit",
  "invalid_request",
  "provider_error",
  "unknown",
] as const;

export type ChatErrorCode = (typeof CHAT_ERROR_CODES)[number];

export interface ChatIssue {
  code: ChatErrorCode;
  title: string;
  message: string;
  retryable: boolean;
}

export interface ChatErrorLike {
  code?: string;
  message?: string;
  status?: number;
  name?: string;
}

const ISSUES: Record<ChatErrorCode, Omit<ChatIssue, "code">> = {
  offline: {
    title: "Sem conexão com a Hanira",
    message: "Verifique sua conexão e tente novamente.",
    retryable: true,
  },
  capacity_unavailable: {
    title: "Capacidade temporariamente indisponível",
    message:
      "A Nira está temporariamente sem capacidade gratuita disponível. Tente novamente em alguns instantes.",
    retryable: true,
  },
  timeout: {
    title: "A resposta demorou demais",
    message: "A Nira não concluiu a resposta a tempo. Você pode tentar novamente.",
    retryable: true,
  },
  unavailable: {
    title: "Nira temporariamente indisponível",
    message: "Não foi possível iniciar a resposta agora. Tente novamente em instantes.",
    retryable: true,
  },
  rate_limit: {
    title: "Muitas mensagens em sequência",
    message: "Aguarde um instante antes de tentar novamente.",
    retryable: true,
  },
  invalid_request: {
    title: "Não foi possível enviar",
    message: "Revise a mensagem ou os anexos e tente novamente.",
    retryable: false,
  },
  provider_error: {
    title: "A resposta foi interrompida",
    message: "A Nira encontrou uma instabilidade temporária. Tente novamente.",
    retryable: true,
  },
  unknown: {
    title: "Algo não saiu como esperado",
    message: "A Nira não conseguiu concluir a resposta. Tente novamente.",
    retryable: true,
  },
};

export function isChatErrorCode(value: unknown): value is ChatErrorCode {
  return (
    typeof value === "string" &&
    (CHAT_ERROR_CODES as readonly string[]).includes(value)
  );
}

export function chatIssueForCode(code: ChatErrorCode): ChatIssue {
  return { code, ...ISSUES[code] };
}

export function toChatIssue(
  error: unknown,
  options: { online?: boolean } = {},
): ChatIssue {
  if (options.online === false) return chatIssueForCode("offline");

  const candidate = error as ChatErrorLike | undefined;
  if (isChatErrorCode(candidate?.code)) {
    return chatIssueForCode(candidate.code);
  }
  if (candidate?.status === 429) return chatIssueForCode("rate_limit");
  if (candidate?.status === 408 || candidate?.name === "TimeoutError") {
    return chatIssueForCode("timeout");
  }
  if (candidate?.status === 400) return chatIssueForCode("invalid_request");
  if (candidate?.status === 502) return chatIssueForCode("provider_error");
  if (candidate?.status === 503) return chatIssueForCode("unavailable");
  return chatIssueForCode("unknown");
}
