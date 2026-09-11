import type { TextChatContextMessage } from "./text-chat-runtime";

export const CHAT_CONTEXT_LIMITS = {
  maxHistoryMessages: 20,
  maxHistoryChars: 24_000,
  maxMemories: 8,
  maxMemoryChars: 4_000,
} as const;

export interface ContextBudgetMetadata {
  readonly messagesConsidered: number;
  readonly messagesIncluded: number;
  readonly charactersConsidered: number;
  readonly charactersIncluded: number;
  readonly truncated: boolean;
  readonly budgetLimit: number;
}

export interface ChatContextBudgetResult {
  readonly messages: TextChatContextMessage[];
  readonly metadata: ContextBudgetMetadata;
}

/** Seleciona um sufixo cronológico contíguo; histórico antigo nunca substitui contexto recente. */
export function buildChatContextBudgetResult(
  messages: TextChatContextMessage[],
  maxChars: number = CHAT_CONTEXT_LIMITS.maxHistoryChars,
): ChatContextBudgetResult {
  const result: TextChatContextMessage[] = [];
  let chars = 0;
  for (let index = messages.length - 1; index >= 0 && result.length < CHAT_CONTEXT_LIMITS.maxHistoryMessages; index -= 1) {
    const message = messages[index];
    if (chars + message.content.length > maxChars) {
      if (result.length === 0 && maxChars > 0) {
        const content = message.content.slice(0, maxChars);
        result.unshift({ ...message, content });
        chars += content.length;
      }
      break;
    }
    result.unshift(message);
    chars += message.content.length;
  }
  const charactersConsidered = messages.reduce((total, message) => total + message.content.length, 0);
  return Object.freeze({
    messages: result,
    metadata: Object.freeze({
      messagesConsidered: messages.length,
      messagesIncluded: result.length,
      charactersConsidered,
      charactersIncluded: chars,
      truncated: result.length !== messages.length || chars !== charactersConsidered,
      budgetLimit: maxChars,
    }),
  });
}

export function buildChatContextBudget(messages: TextChatContextMessage[], maxChars: number = CHAT_CONTEXT_LIMITS.maxHistoryChars) {
  return buildChatContextBudgetResult(messages, maxChars).messages;
}

export interface MemoryContextBudgetResult {
  readonly memories: string[];
  readonly metadata: {
    readonly memoriesConsidered: number;
    readonly memoriesIncluded: number;
    readonly charactersConsidered: number;
    readonly charactersIncluded: number;
    readonly truncated: boolean;
    readonly budgetLimit: number;
  };
}

export function limitMemoryContextResult(memories: string[]): MemoryContextBudgetResult {
  const result: string[] = [];
  let chars = 0;
  for (const memory of memories) {
    if (result.length >= CHAT_CONTEXT_LIMITS.maxMemories) break;
    if (chars + memory.length > CHAT_CONTEXT_LIMITS.maxMemoryChars) continue;
    if (!result.includes(memory)) {
      result.push(memory);
      chars += memory.length;
    }
  }
  const charactersConsidered = memories.reduce((total, memory) => total + memory.length, 0);
  return Object.freeze({
    memories: result,
    metadata: Object.freeze({
      memoriesConsidered: memories.length,
      memoriesIncluded: result.length,
      charactersConsidered,
      charactersIncluded: chars,
      truncated: result.length !== memories.length || chars !== charactersConsidered,
      budgetLimit: CHAT_CONTEXT_LIMITS.maxMemoryChars,
    }),
  });
}

export function limitMemoryContext(memories: string[]) {
  return limitMemoryContextResult(memories).memories;
}
