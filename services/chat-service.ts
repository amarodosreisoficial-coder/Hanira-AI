import type {
  ChatRequest,
  Conversation,
  ConversationListResponse,
} from "@/types/chat";
import type { ChatErrorCode } from "@/lib/chat/chat-errors";

export class ChatRequestError extends Error {
  readonly code?: ChatErrorCode;
  readonly status?: number;

  constructor(message: string, options?: { code?: ChatErrorCode; status?: number }) {
    super(message);
    this.name = "ChatRequestError";
    this.code = options?.code;
    this.status = options?.status;
  }
}

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Não foi possível continuar.");
  return data;
}

export function listConversations() {
  return jsonRequest<ConversationListResponse>("/api/conversations");
}

export async function createConversation(title?: string) {
  const data = await jsonRequest<{ conversation: Conversation }>(
    "/api/conversations",
    { method: "POST", body: JSON.stringify({ title }) },
  );
  return data.conversation;
}

export async function getConversation(id: string) {
  const data = await jsonRequest<{ conversation: Conversation }>(
    `/api/conversations/${id}`,
  );
  return data.conversation;
}

export function updateConversation(
  id: string,
  payload: { title?: string; archived?: boolean },
) {
  return jsonRequest<{ ok: boolean }>(`/api/conversations/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteConversationRequest(id: string) {
  return jsonRequest<{ ok: boolean }>(`/api/conversations/${id}`, {
    method: "DELETE",
  });
}

export interface StreamHandlers {
  onStart?: (conversationId: string) => void;
  onDelta: (delta: string) => void;
  onDone?: (conversationId: string) => void;
  onError?: (error: ChatRequestError) => void;
}

export async function streamChatMessage(
  payload: ChatRequest,
  handlers: StreamHandlers,
  signal: AbortSignal,
) {
  const requestId = payload.requestId ?? crypto.randomUUID();
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Request-ID": requestId,
    },
    body: JSON.stringify({ ...payload, requestId }),
    signal,
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
      code?: ChatErrorCode;
    };
    throw new ChatRequestError(
      data.error ?? "Não foi possível falar com a Hanira agora.",
      { code: data.code, status: response.status },
    );
  }
  if (!response.body) throw new Error("O navegador não suporta streaming.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const block of events) {
      const line = block
        .split("\n")
        .find((candidate) => candidate.startsWith("data: "));
      if (!line) continue;
      const event = JSON.parse(line.slice(6)) as {
        type: "start" | "delta" | "done" | "error";
        conversationId?: string;
        delta?: string;
        message?: string;
        code?: ChatErrorCode;
      };
      if (event.type === "start" && event.conversationId) {
        handlers.onStart?.(event.conversationId);
      } else if (event.type === "delta" && event.delta) {
        handlers.onDelta(event.delta);
      } else if (event.type === "done" && event.conversationId) {
        handlers.onDone?.(event.conversationId);
      } else if (event.type === "error") {
        handlers.onError?.(
          new ChatRequestError(
            event.message ?? "A resposta foi interrompida.",
            { code: event.code },
          ),
        );
      }
    }
  }
}
